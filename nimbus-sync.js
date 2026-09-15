// nimbus-sync.js
// Pulls order/shipment status + charges from NimbusPost (Old API, NP-API-KEY auth)
// and syncs into Firestore — delta writes only, skips final-state shipments.

const admin = require('firebase-admin');
const fetch = require('node-fetch');

const NIMBUS_BASE = 'https://api.nimbuspost.com/v1';
const NIMBUS_API_KEY = process.env.NIMBUS_API_KEY;

const FINAL_STATUSES = ['delivered', 'cancelled', 'rto_delivered'];

// ---- Firebase init ----
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function fetchAllOrders() {
  let page = 1;
  let all = [];
  let debugged = false;

  while (true) {
    const res = await fetch(`${NIMBUS_BASE}/orders?page=${page}&per_page=100`, {
      headers: { 'NP-API-KEY': NIMBUS_API_KEY },
    });
    const text = await res.text();

    if (!debugged) {
      console.log('--- DEBUG: orders response status ---', res.status);
      console.log('--- DEBUG: orders response body (first 2000 chars) ---');
      console.log(text.slice(0, 2000));
      debugged = true;
    }

    let json;
    try { json = JSON.parse(text); } catch { break; }

    const rows = json?.data?.orders || json?.data || [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < 100) break;
    page++;
  }
  return all;
}

async function syncOrders() {
  const orders = await fetchAllOrders();
  console.log(`Fetched ${orders.length} orders from NimbusPost`);

  const indexRef = db.collection('nimbusIndex').doc('statusIndex');
  const indexSnap = await indexRef.get();
  const prevIndex = indexSnap.exists ? indexSnap.data() : {};
  const newIndex = {};

  let batch = db.batch();
  let writes = 0;
  let pending = 0;

  for (const s of orders) {
    const awb = s.awb_number || s.awb || s.order_number;
    if (!awb) continue;
    const status = (s.status || s.shipment_status || '').toLowerCase();
    newIndex[awb] = status;

    if (prevIndex[awb] === status) continue;
    if (FINAL_STATUSES.includes(prevIndex[awb])) continue;

    const ref = db.collection('nimbusShipments').doc(String(awb));
    batch.set(ref, {
      awb,
      order_number: s.order_number || null,
      courier: s.courier_name || s.courier || null,
      status: s.status || s.shipment_status || null,
      status_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      consignee: s.consignee_name || null,
      destination: s.destination || s.consignee_city || null,
      shipping_charge: s.freight_charges ?? s.freight_charge ?? s.shipping_charges ?? s.charged_amount ?? null,
      cod_charge: s.cod_charges ?? s.cod_charge ?? null,
      charged_weight: s.charged_weight ?? s.applied_weight ?? null,
      other_charges: s.other_charges ?? null,
      total_charge: s.total_charges ?? s.total_amount ?? null,
      raw: s,
    }, { merge: true });
    writes++;
    pending++;

    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) await batch.commit();
  await indexRef.set(newIndex);

  console.log(`NimbusPost sync done. ${writes} shipment(s) updated.`);
}

syncOrders().catch((err) => {
  console.error('NimbusPost sync failed:', err);
  process.exit(1);
});
