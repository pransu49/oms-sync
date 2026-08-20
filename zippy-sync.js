// zippy-sync.js
// Add this file to the SAME repo as your OMS Guru sync: github.com/pransu49/oms-sync
//
// FREE-TIER FIX: only writes to Firestore when a shipment's status actually
// changed, and skips re-checking orders already in a final state (Delivered /
// RTO Delivered / Cancelled) since those can never change again. This cuts
// daily writes from ~140,000 (every order, every run) down to a few hundred —
// well under Firestore's free 20,000 writes/day cap.

const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const ZIPPY_BASE = "https://sellingpartnerapi-in.zippyy.ai";
const FINAL_STATUSES = ["delivered", "rto delivered", "cancelled", "cancelled by customer"];

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
  const res = await fetch(`${ZIPPY_BASE}/v1/external/shipments?orderIds=${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { error: String(res.status) };
  const arr = await res.json();
  const s = Array.isArray(arr) ? arr[0] : null;
  if (!s) return { error: "not_found" };
  return {
    status: s.status || null,
    subStatus: s.subStatus || null,
    awbNumber: s.trackingCode || (s.metadata && s.metadata.waybill) || null,
    courierName: (s.selectedRate && s.selectedRate.carrier) || null,
  };
}

async function getOmsOrders() {
  const snap = await db.collection("aikm_admin").doc("omsOrders").collection("chunks").get();
  let orders = [];
  snap.forEach((doc) => {
    orders = orders.concat(doc.data().orders || []);
  });
  return orders;
}

function isSelfShip(o) {
  return (o.channel || "").toLowerCase().includes("amazon") && !!o.buyerPhone && !!o.awb;
}

async function getExistingShipments() {
  const snap = await db.collection("zippyShipments").get();
  const map = {};
  snap.forEach((doc) => { map[doc.id] = doc.data(); });
  return map;
}

function isFinal(status) {
  return FINAL_STATUSES.includes((status || "").toLowerCase());
}

function changed(prev, next) {
  if (!prev) return true;
  return (
    prev.status !== next.status ||
    prev.subStatus !== next.subStatus ||
    prev.awbNumber !== next.awbNumber ||
    prev.courierName !== next.courierName
  );
}

async function run() {
  console.log("Logging into Zippy...");
  const token = await zippyLogin();

  console.log("Reading OMS Guru orders...");
  const omsOrders = await getOmsOrders();
  const selfShip = omsOrders.filter(isSelfShip);

  const orderIds = [
    ...new Set(selfShip.map((o) => (o.awb || "").trim().toUpperCase()).filter(Boolean)),
  ];
  const orderNumberByAwb = {};
  selfShip.forEach((o) => {
    const awb = (o.awb || "").trim().toUpperCase();
    if (awb) orderNumberByAwb[awb] = o.channelOrderId || o.invoiceNumber || awb;
  });

  console.log("Reading previously stored shipment statuses...");
  const existing = await getExistingShipments();

  const toCheck = orderIds.filter((id) => !isFinal(existing[id] && existing[id].status));
  console.log(`${omsOrders.length} OMS orders, ${orderIds.length} unique AWBs, ${toCheck.length} still need a status check (rest already final).`);

  let batch = db.batch();
  let batchCount = 0;
  let written = 0, unchanged = 0, failed = 0;

  for (const orderId of toCheck) {
    try {
      const shipment = await getShipment(orderId, token);
      const next = { ...shipment, awb: orderId, orderNumber: orderNumberByAwb[orderId] || orderId };

      if (changed(existing[orderId], next)) {
        const ref = db.collection("zippyShipments").doc(orderId);
        batch.set(ref, { ...next, syncedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        batchCount++;
        written++;
        if (batchCount >= 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      } else {
        unchanged++;
      }
    } catch (e) {
      console.error(`Order ${orderId} failed:`, e.message);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (batchCount > 0) await batch.commit();

  console.log(`Done. Written: ${written}, Unchanged (skipped): ${unchanged}, Failed: ${failed}. (Final-state orders skipped entirely: ${orderIds.length - toCheck.length})`);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
