// zippy-sync.js
// Add this file to the SAME repo as your OMS Guru sync: github.com/pransu49/oms-sync
//
// Reads every order already synced from OMS Guru (aikm_admin/omsOrders/chunks),
// picks out the self-ship ones (Amazon channel + a buyer phone present), fetches
// each one's live shipment status from Zippy, and writes it to the zippyShipments
// collection that the "Zippy Shipments" tab in the Admin Console reads from.

const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Same Firebase project as the OMS Guru sync ("aikm--order-file")
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const ZIPPY_BASE = "https://sellingpartnerapi-in.zippyy.ai";

async function zippyLogin() {
  const res = await fetch(`${ZIPPY_BASE}/v1/external/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-version": "1" },
    body: JSON.stringify({
      emailAddress: process.env.ZIPPY_EMAIL,
      password: process.env.ZIPPY_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`Zippy login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken;
}

async function getAllShipments(token) {
  // Docs: "you can either get all shipment details at once or the details of
  // a particular shipment" — calling without orderIds should return everything.
  const res = await fetch(`${ZIPPY_BASE}/v1/external/shipments`, {
    headers: { Authorization: `Bearer ${token}`, "x-api-version": "1" },
  });
  if (!res.ok) throw new Error(`Fetching all shipments failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.data || data.shipments || data.results || []);
  console.log("Sample shipment shape:", JSON.stringify(list[0] || {}, null, 2).slice(0, 1000));
  return list;
}

// Same chunked-document read pattern the Admin Console itself uses for OMS orders.
async function getOmsOrders() {
  const snap = await db.collection("aikm_admin").doc("omsOrders").collection("chunks").get();
  let orders = [];
  snap.forEach((doc) => {
    orders = orders.concat(doc.data().orders || []);
  });
  return orders;
}

// Self-ship rule matches the one already used in the console (Order/AWB Scanner,
// Amazon Self-Ship tab): Amazon channel + a buyer phone present. Also require an
// AWB — Zippy's own tracking page confirms AWB (not the marketplace order number)
// is one of the identifiers it accepts, so orders without an AWB yet (not picked
// up by a courier) can't be looked up here regardless.
function isSelfShip(o) {
  return (o.channel || "").toLowerCase().includes("amazon") && !!o.buyerPhone && !!o.awb;
}

async function run() {
  console.log("Logging into Zippy...");
  const token = await zippyLogin();

  console.log("Fetching all shipments from Zippy...");
  const allShipments = await getAllShipments(token);
  console.log(`Zippy returned ${allShipments.length} shipments total.`);

  // Build lookup tables — try matching by AWB (trackingCode) first, then by
  // whatever order-number-like field Zippy stores, since we don't yet know
  // which one it uses without seeing a real sample (logged above).
  const byAwb = {};
  const byOrderNumber = {};
  allShipments.forEach((s) => {
    const awb = (s.trackingCode || (s.metadata && s.metadata.waybill) || "").trim().toUpperCase();
    if (awb) byAwb[awb] = s;
    const num = (s.orderNumber || s.channelOrderId || s.referenceNumber || "").trim().toUpperCase();
    if (num) byOrderNumber[num] = s;
  });

  console.log("Reading OMS Guru orders...");
  const omsOrders = await getOmsOrders();
  const selfShip = omsOrders.filter(isSelfShip);
  console.log(`${omsOrders.length} OMS orders, ${selfShip.length} self-ship with AWB.`);

  let ok = 0, failed = 0;
  for (const o of selfShip) {
    const awb = (o.awb || "").trim().toUpperCase();
    const orderNumber = (o.channelOrderId || o.invoiceNumber || "").trim().toUpperCase();
    const docId = orderNumber || awb;
    if (!docId) continue;

    const s = byAwb[awb] || byOrderNumber[orderNumber];
    const shipment = s
      ? {
          status: s.status || null,
          subStatus: s.subStatus || null,
          awbNumber: s.trackingCode || (s.metadata && s.metadata.waybill) || awb || null,
          courierName: (s.selectedRate && s.selectedRate.carrier) || null,
        }
      : { error: "not_found" };

    try {
      await db.collection("zippyShipments").doc(docId).set(
        { ...shipment, awb, orderNumber: orderNumber || docId, syncedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      shipment.error ? failed++ : ok++;
    } catch (e) {
      console.error(`Order ${docId} failed to write:`, e.message);
      failed++;
    }
  }

  console.log(`Done. Matched: ${ok}, Not matched: ${failed}`);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
