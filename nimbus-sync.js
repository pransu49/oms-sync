// nimbus-sync.js
// NimbusPost Partner API v2 -> Firestore (project of FIREBASE_SERVICE_ACCOUNT — the one the Admin Console reads).
//
// Auth: API-key pair from NimbusPost dashboard -> Settings -> API Keys, saved in GitHub secrets as
//   NIMBUS_API_KEY    (npk_...)
//   NIMBUS_API_SECRET (shown once when the key is created/rotated)
//
// Writes (small, quota-friendly — unchanged chunks are skipped):
//   nimbusDash/chunk_N     last DAYS_BACK days of shipments, compact rows
//   nimbusDash/_meta       last sync time + counts
//   nimbusIndex/byOrder    marketplace order id -> AWB + courier (used by Self-Ship confirmation)

const admin = require('firebase-admin');
const crypto = require('crypto');

const BASE = 'https://api-v2.nimbuspost.com/v2';
const KEY = (process.env.NIMBUS_API_KEY || '').trim();
const SECRET = (process.env.NIMBUS_API_SECRET || '').trim();
const DAYS_BACK = parseInt(process.env.NIMBUS_DAYS_BACK || '30', 10);
const CHUNK = 600;
const DRY = process.argv.includes('--dry'); // fetch + print only, no Firestore

if (!KEY || !SECRET) {
  console.error('Missing NIMBUS_API_KEY / NIMBUS_API_SECRET. Create them in NimbusPost -> Settings -> API Keys and add both in GitHub -> Settings -> Secrets and variables -> Actions.');
  process.exit(1);
}
const HEADERS = { 'x-api-key': KEY, 'x-api-secret': SECRET, Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    let json; try { json = JSON.parse(text); } catch { throw new Error(`NimbusPost returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`); }
    if (!json.success) throw new Error(`NimbusPost error ${res.status}: ${JSON.stringify(json.error || json).slice(0, 300)}`);
    return json;
  }
  throw new Error('NimbusPost kept failing (rate limit / server error).');
}

async function fetchOrders() {
  const cutoff = Date.now() - DAYS_BACK * 864e5;
  const all = [];
  for (let page = 1; page <= 300; page++) {
    const json = await getJson(`${BASE}/orders?limit=100&page=${page}`);
    const rows = json.data || [];
    all.push(...rows);
    if (rows.length < 100) break;
    const last = rows[rows.length - 1];
    if (new Date(last.created_at || last.order_date).getTime() < cutoff) break; // newest first — older pages not needed
    await sleep(120);
  }
  return all.filter((o) => new Date(o.created_at || o.order_date).getTime() >= cutoff);
}

async function fetchNdr() {
  const byAwb = {};
  for (let page = 1; page <= 50; page++) {
    const json = await getJson(`${BASE}/ndr?limit=100&page=${page}`);
    const rows = json.data || [];
    rows.forEach((n) => { if (n.awb) byAwb[n.awb] = n; });
    if (rows.length < 100) break;
    await sleep(120);
  }
  return byAwb;
}

// order_status -> dashboard bucket
function bucket(s) {
  s = String(s || '').toLowerCase();
  if (s === 'rto_delivered') return 'rto_delivered';
  if (s.startsWith('rto')) return 'rto';
  if (s === 'delivered') return 'delivered';
  if (s.startsWith('cancel')) return 'cancelled';
  if (s === 'out_for_delivery') return 'ofd';
  if (s === 'ndr' || /exception|lost|damage|undeliver/.test(s)) return 'exception';
  if (s === 'created' || s.startsWith('pickup') || s === 'booked' || s === 'manifested' || s === 'new') return 'pickup';
  if (/transit|shipped|picked|reached|destination|dispatch/.test(s)) return 'transit';
  return 'other';
}
const t19 = (v) => (v ? String(v).slice(0, 19) : '');

function compact(o, ndr) {
  const sh = o.shipment || {}, ad = o.shipping_address || {};
  const n = ndr[sh.awb];
  return {
    a: String(sh.awb || ''),
    ra: String(sh.rto_awb || ''),
    o: String(o.order_number || '').replace(/^#/, '').trim(),
    c: String(sh.courier_name || ''),
    st: String(o.order_status || '').replace(/_/g, ' '),
    b: bucket(o.order_status),
    cr: t19(sh.created_at || o.created_at),
    pd: String((sh.pickup && sh.pickup.pickup_date) || ''),
    pu: t19(sh.picked_at || sh.shipped_at),
    ed: t19(sh.edd),
    dl: t19(sh.delivered_at),
    n: String(ad.name || ''),
    ci: String(ad.city || ''),
    pin: String(ad.pincode || ''),
    pt: String(o.payment_mode || ''),
    v: Number(o.total_amount || 0),
    cod: Number(o.order_collectable_amount || 0),
    f: Number(sh.amount || sh.forward_charges || 0),
    nr: n ? String(n.remarks || '').slice(0, 120) : '',
    at: n ? Number(n.attempt_count || 0) : 0,
    nd: n && String(n.status || '').toLowerCase() === 'open' ? 1 : 0,
    ls: t19(o.updated_at),
  };
}

const md5 = (x) => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex');

async function main() {
  const [orders, ndr] = await Promise.all([fetchOrders(), fetchNdr()]);
  const rows = orders.map((o) => compact(o, ndr)).filter((r) => r.a || r.b !== 'cancelled');
  const counts = {}; rows.forEach((r) => { counts[r.b] = (counts[r.b] || 0) + 1; });
  console.log(`Fetched ${orders.length} NimbusPost orders (last ${DAYS_BACK} days), ${Object.keys(ndr).length} NDR. Buckets: ${JSON.stringify(counts)}`);

  const byOrder = {};
  rows.forEach((r) => {
    if (!r.o || !r.a) return;
    const cur = byOrder[r.o];
    if (!cur || (cur.s === 'cancelled' && r.b !== 'cancelled')) byOrder[r.o] = { a: r.a, c: r.c, s: r.b };
  });

  if (DRY) { console.log('DRY sample:', JSON.stringify(rows.slice(0, 2)), 'index size', Object.keys(byOrder).length); return; }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const col = db.collection('nimbusDash');
  const snap = await col.get();
  const old = {}; snap.forEach((d) => { old[d.id] = d.get('hash'); });
  const used = new Set(['_meta']);
  let written = 0;
  for (let i = 0, k = 0; i < rows.length; i += CHUNK, k++) {
    const part = rows.slice(i, i + CHUNK), id = `chunk_${k}`, h = md5(part);
    used.add(id);
    if (old[id] !== h) { await col.doc(id).set({ rows: part, hash: h }); written++; }
  }
  const stale = Object.keys(old).filter((id) => !used.has(id));
  if (stale.length) { const b = db.batch(); stale.forEach((id) => b.delete(col.doc(id))); await b.commit(); }
  await col.doc('_meta').set({ updatedAt: admin.firestore.FieldValue.serverTimestamp(), total: rows.length, counts, daysBack: DAYS_BACK });
  await db.collection('nimbusIndex').doc('byOrder').set({ orders: byOrder, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

  console.log(`Dashboard: ${written} chunk(s) updated, ${stale.length} removed. Order index: ${Object.keys(byOrder).length}.`);
}

main().catch((err) => {
  console.error('NimbusPost sync failed:', err.message || err);
  process.exit(1);
});
