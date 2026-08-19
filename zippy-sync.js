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

async function getShipment(orderId, token) {
  const res = await fetch(`${ZIPPY_BASE}/v1/external/shipments?orderId=${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { error: String(res.status) };
  const data = await res.json();
  return {
    status: data.status || data.currentStatus || data.trackingStatus || null,
    awbNumber: data.awbNumber || data.awb || null,
    courierName: data.courierName || data.courier || null,
  };
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
// Amazon Self-Ship tab): Amazon channel + a buyer phone present.
function isSelfShip(o) {
  return (o.channel || "").toLowerCase().includes("amazon") && !!o.buyerPhone;
}

async function run() {
  console.log("Logging into Zippy...");
  const token = await zippyLogin();

  console.log("Reading OMS Guru orders...");
  const omsOrders = await getOmsOrders();
  const selfShip = omsOrders.filter(isSelfShip);

  const orderIds = [
    ...new Set(
      selfShip
        .map((o) => (o.channelOrderId || o.invoiceNumber || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  console.log(`${omsOrders.length} OMS orders, ${selfShip.length} self-ship, ${orderIds.length} unique order ids to check.`);

  let ok = 0, failed = 0;
  for (const orderId of orderIds) {
    try {
      const shipment = await getShipment(orderId, token);
      await db.collection("zippyShipments").doc(orderId).set(
        { ...shipment, syncedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      shipment.error ? failed++ : ok++;
    } catch (e) {
      console.error(`Order ${orderId} failed:`, e.message);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200)); // avoid hammering the API
  }

  console.log(`Done. Synced: ${ok}, Failed: ${failed}`);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
