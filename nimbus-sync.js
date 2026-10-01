// nimbus-sync.js
// NimbusPost -> Firestore (project of FIREBASE_SERVICE_ACCOUNT, same one the Admin Console reads).
//
// Uses NimbusPost's account API (ship.nimbuspost.com/api, header NP-API-KEY).
// Get the key in NimbusPost: Settings -> API -> Generate API Key, then save it in GitHub as
// the secret NIMBUS_API_KEY.
//
// Writes (small, quota-friendly):
//   nimbusDash/chunk_N     last DAYS_BACK days of shipments, compact rows (rewritten only if changed)
//   nimbusDash/_meta       last sync time + counts
//   nimbusIndex/byOrder    marketplace order id -> AWB + courier (used by Self-Ship confirmation)

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://ship.nimbuspost.com/api';
const API_KEY = (process.env.NIMBUS_API_KEY || '').trim();
const DAYS_BACK = parseInt(process.env.NIMBUS_DAYS_BACK || '30', 10);
const CHUNK = 700;

if (!API_KEY) {
  console.error('Missing NIMBUS_API_KEY. In NimbusPost go to Settings -> API -> Generate API Key, then add it in GitHub -> Settings -> Secrets and variables -> Actions as NIMBUS_API_KEY.');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rowsOf(json) {
  const d = json && json.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.data)) return d.data;
  if (d && Array.isArray(d.shipments)) return d.shipments;
  if (Array.isArray(json)) return json;
  return [];
}

async function fetchShipments() {
  const to = new Date(), from = new Date();
  from.setDate(from.getDate() - DAYS_BACK);
  const all = [];
  for (let page = 1; page <= 200; page++) {
    const url = `${BASE}/shipments?page=${page}&per_page=100&sort=DESC&sort_by=id&from=${ymd(from)}&to=${ymd(to)}`;
    let res, text;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { headers: { 'NP-API-KEY': API_KEY, Accept: 'application/json' } });
      text = await res.text();
      if (res.status !== 429) break;
      await sleep(1500);
    }
    if (page === 1) console.log(`DEBUG /shipments status ${res.status}: ${text.slice(0, 1500)}`);
    let json; try { json = JSON.parse(text); } catch { throw new Error(`NimbusPost returned non-JSON (status ${res.status})`); }
    if (json && json.status === false) throw new Error(`NimbusPost error: ${json.message || text.slice(0, 200)}`);
    const rows = rowsOf(json);
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < 100) break;
    await sleep(150); // API limit is 10 requests/second
  }
  return all;
}

const pick = (o, keys) => { for (const k of keys) { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; } return ''; };

// Map NimbusPost status text/code to one of our buckets
function bucket(status, code) {
  const s = String(status || '').toLowerCase(), c = String(code || '').toUpperCase();
  if (c === 'RT-DL' || /rto.*deliver/.test(s)) return 'rto_delivered';
  if (c === 'RT' || c === 'RT-IT' || /\brto\b|return/.test(s)) return 'rto';
  if (c === 'DL' || /^delivered/.test(s)) return 'delivered';
  if (/cancel/.test(s)) return 'cancelled';
  if (c === 'OFD' || /out for delivery/.test(s)) return 'ofd';
  if (c === 'EX' || /exception|ndr|undeliver|failed/.test(s)) return 'exception';
  if (c === 'PP' || /pending pickup|booked|manifest|pickup scheduled|not picked|new/.test(s)) return 'pickup';
  if (c === 'IT' || /transit|picked|shipped|dispatch|reached|hub/.test(s)) return 'transit';
  return 'other';
}

function compact(s) {
  const status = pick(s, ['status', 'shipment_status', 'current_status']);
  const code = pick(s, ['status_code', 'current_status_code']);
  return {
    a: String(pick(s, ['awb_number', 'awb'])).trim(),
    o: String(pick(s, ['order_number', 'order_no', 'channel_order_id', 'order_id'])).replace(/^#/, '').trim(),
    c: String(pick(s, ['courier_name', 'courier'])),
    st: String(status),
    b: bucket(status, code),
    cr: String(pick(s, ['created', 'created_at', 'shipment_date', 'booked_date', 'date'])).slice(0, 19),
    pu: String(pick(s, ['pickup_date', 'picked_date', 'shipped_date', 'pickup_at'])).slice(0, 19),
    ed: String(pick(s, ['edd', 'expected_delivery_date', 'estimated_delivery_date', 'promised_delivery_date'])).slice(0, 10),
    dl: String(pick(s, ['delivered_date', 'delivery_date', 'delivered_at'])).slice(0, 19),
    n: String(pick(s, ['consignee_name', 'customer_name', 'name', 'consignee'])),
    ci: String(pick(s, ['consignee_city', 'city', 'destination'])),
    pin: String(pick(s, ['consignee_pincode', 'pincode', 'pin'])),
    pt: String(pick(s, ['payment_type', 'payment_method', 'payment_mode'])),
    v: Number(pick(s, ['order_amount', 'invoice_value', 'total_amount', 'cod_amount']) || 0),
    f: Number(pick(s, ['total_charges', 'freight_charges', 'shipping_charges', 'charged_amount']) || 0),
    i: String(pick(s, ['shipment_info', 'additional_info'])),
    ls: String(pick(s, ['last_status_time', 'status_updated_at', 'updated', 'updated_at'])).slice(0, 19),
    nr: String(pick(s, ['ndr_reason', 'courier_remarks', 'remarks'])).slice(0, 120),
  };
}

const md5 = (x) => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex');

async function main() {
  const raw = await fetchShipments();
  console.log(`Fetched ${raw.length} shipments from NimbusPost (last ${DAYS_BACK} days)`);
  if (raw.length) console.log('DEBUG first shipment fields:', Object.keys(raw[0]).join(', '));
  const rows = raw.map(compact).filter((r) => r.a);

  // ---- dashboard chunks (only changed chunks are rewritten) ----
  const col = db.collection('nimbusDash');
  const snap = await col.get();
  const old = {}; snap.forEach((d) => { old[d.id] = d.get('hash'); });
  const used = new Set(['_meta']);
  let written = 0;
  for (let i = 0, n = 0; i < rows.length; i += CHUNK, n++) {
    const part = rows.slice(i, i + CHUNK), id = `chunk_${n}`, h = md5(part);
    used.add(id);
    if (old[id] !== h) { await col.doc(id).set({ rows: part, hash: h }); written++; }
  }
  const stale = Object.keys(old).filter((id) => !used.has(id));
  if (stale.length) { const b = db.batch(); stale.forEach((id) => b.delete(col.doc(id))); await b.commit(); }
  const counts = {}; rows.forEach((r) => { counts[r.b] = (counts[r.b] || 0) + 1; });
  await col.doc('_meta').set({ updatedAt: admin.firestore.FieldValue.serverTimestamp(), total: rows.length, counts, daysBack: DAYS_BACK });

  // ---- order id -> AWB index for Self-Ship confirmation ----
  const byOrder = {};
  rows.forEach((r) => {
    if (!r.o) return;
    if (r.b === 'cancelled' && byOrder[r.o]) return;
    if (!byOrder[r.o] || byOrder[r.o].s === 'cancelled') byOrder[r.o] = { a: r.a, c: r.c, s: r.b };
  });
  await db.collection('nimbusIndex').doc('byOrder').set({ orders: byOrder, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

  console.log(`Dashboard: ${written} chunk(s) updated, ${stale.length} removed. Buckets: ${JSON.stringify(counts)}. Order index: ${Object.keys(byOrder).length}.`);
}

main().catch((err) => {
  console.error('NimbusPost sync failed:', err.message || err);
  process.exit(1);
});
