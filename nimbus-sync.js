// nimbus-sync.js
// Pulls order/shipment status + charges from NimbusPost (Old API, NP-API-KEY auth)
// and syncs into Firestore — delta writes only, skips final-state shipments.

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

// Login with the account email + password (GitHub secrets) -> short-lived token.
async function login() {
  const res = await fetch(`${NIMBUS_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: NIMBUS_EMAIL, password: NIMBUS_PASSWORD }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  const token = json && (typeof json.data === 'string' ? json.data : (json.data && (json.data.token || json.data.access_token)));
  if (!token) throw new Error(`NimbusPost login failed (status ${res.status}): ${text.slice(0, 300)}`);
  console.log('NimbusPost login OK');
  return token;
}

function rowsOf(json) {
  const d = json && json.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.shipments)) return d.shipments;
  if (d && Array.isArray(d.orders)) return d.orders;
  if (d && Array.isArray(d.data)) return d.data;
  return [];
}

async function fetchAllOrders() {
  const token = await login();
  const headers = { Authorization: `Bearer ${token}` };
  // Try the shipment list first, then the order list (whichever this account's API returns).
  for (const path of ['shipments', 'orders']) {
    let page = 1, all = [];
    while (page <= 60) {
      const res = await fetch(`${NIMBUS_BASE}/${path}?page=${page}&per_page=100`, { headers });
      const text = await res.text();
      if (page === 1) console.log(`DEBUG /${path} status ${res.status}: ${text.slice(0, 1500)}`);
      let json; try { json = JSON.parse(text); } catch { break; }
      const rows = rowsOf(json);
      if (!rows.length) break;
      all = all.concat(rows);
      if (rows.length < 100) break;
      page++;
    }
    if (all.length) { console.log(`Using /${path}: ${all.length} rows`); return all; }
  }
  return [];
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

  // One small doc the console reads (1 read per page open): marketplace order id -> AWB + courier.
  // Used by Self-Ship to fill tracking in the Amazon shipping-confirmation file automatically.
  const byOrder = {};
  for (const s of orders) {
    const r = s.raw || s;
    const awb = String(s.awb_number || s.awb || '').trim();
    const ord = String(s.order_number || s.order_id || s.order_no || r.order_number || '').replace(/^#/, '').trim();
    if (!awb || !ord) continue;
    const st = String(s.status || s.shipment_status || '').toLowerCase();
    if (/cancel/.test(st) && byOrder[ord]) continue;
    byOrder[ord] = { a: awb, c: String(s.courier_name || s.courier || ''), s: st };
  }
  await db.collection('nimbusIndex').doc('byOrder').set({ orders: byOrder, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Order index: ${Object.keys(byOrder).length} order(s) with AWB.`);

  console.log(`NimbusPost sync done. ${writes} shipment(s) updated.`);
}

syncOrders().catch((err) => {
  console.error('NimbusPost sync failed:', err);
  process.exit(1);
});
