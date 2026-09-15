// nimbus-sync.js
// Pulls shipment/tracking status from NimbusPost and syncs it into Firestore
// (same pattern as zippy-sync.js / sync.js — delta writes only, skip final-state shipments)

const admin = require('firebase-admin');
const fetch = require('node-fetch');

const NIMBUS_BASE = 'https://api.nimbuspost.com/v1';
const NIMBUS_EMAIL = process.env.NIMBUS_EMAIL;
const NIMBUS_PASSWORD = process.env.NIMBUS_PASSWORD;

const FINAL_STATUSES = ['delivered', 'cancelled', 'rto_delivered'];

// ---- Firebase init ----
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function login() {
  const res = await fetch(`${NIMBUS_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: NIMBUS_EMAIL, password: NIMBUS_PASSWORD }),
  });
  const data = await res.json();
  if (!data?.data) throw new Error('NimbusPost login failed: ' + JSON.stringify(data));
  return data.data; // bearer token
}

async function fetchAllShipments(token) {
  let page = 1;
  let all = [];
  while (true) {
    const res = await fetch(`${NIMBUS_BASE}/shipments?page=${page}&per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const rows = json?.data?.shipments || json?.data || [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < 100) break; // last page
    page++;
  }
  return all;
}

async function syncShipments() {
  const token = await login();
  const shipments = await fetchAllShipments(token);
  console.log(`Fetched ${shipments.length} shipments from NimbusPost`);

  // Load existing index (1 read instead of N) to skip unchanged/final-state rows
  const indexRef = db.collection('nimbusIndex').doc('statusIndex');
  const indexSnap = await indexRef.get();
  const prevIndex = indexSnap.exists ? indexSnap.data() : {};
  const newIndex = {};

  const batch = db.batch();
  let writes = 0;

  for (const s of shipments) {
    const awb = s.awb_number || s.awb;
    if (!awb) continue;
    const status = (s.status || '').toLowerCase();
    newIndex[awb] = status;

    // skip if unchanged
    if (prevIndex[awb] === status) continue;
    // skip re-writing shipments already in a final state last time we saw them
    if (FINAL_STATUSES.includes(prevIndex[awb])) continue;

    const ref = db.collection('nimbusShipments').doc(awb);
    batch.set(ref, {
      awb,
      order_number: s.order_number || null,
      courier: s.courier_name || s.courier || null,
      status: s.status || null,
      status_updated_at: s.updated_at || admin.firestore.FieldValue.serverTimestamp(),
      consignee: s.consignee_name || null,
      destination: s.destination || s.consignee_city || null,
      // financials — field names vary by response, so capture every variant NimbusPost returns
      shipping_charge: s.freight_charges ?? s.freight_charge ?? s.shipping_charges ?? s.charged_amount ?? null,
      cod_charge: s.cod_charges ?? s.cod_charge ?? null,
      charged_weight: s.charged_weight ?? s.applied_weight ?? null,
      other_charges: s.other_charges ?? null,
      total_charge: s.total_charges ?? s.total_amount ?? null,
      raw: s, // full raw response kept as backup — safe to trim later once we confirm exact field names
    }, { merge: true });
    writes++;

    if (writes % 400 === 0) { // Firestore batch limit safety
      await batch.commit();
    }
  }

  if (writes % 400 !== 0) await batch.commit();
  await indexRef.set(newIndex);

  console.log(`NimbusPost sync done. ${writes} shipment(s) updated.`);
}

syncShipments().catch((err) => {
  console.error('NimbusPost sync failed:', err);
  process.exit(1);
});
