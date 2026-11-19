// Owner-requested ship of given order ids (18 Nov 2026): builds a proshipJobs doc exactly like the console does
// (pickup + box + weight from aikm_admin/proshipSettings), prints its id. The ProShip robot then ships it.
const admin = require('firebase-admin');
const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }).firestore();
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
// PHONES = "orderId:phone,..." (owner file, 19 Nov 2026) -> job.phones; never printed (buyer PII).
const phones = {};
String(process.env.PHONES || '').split(/[\s,]+/).forEach((t) => { const [k, v] = t.split(':'); const d = String(v || '').replace(/\D/g, '').slice(-10); if (k && d.length === 10) phones[nid(k)] = d; });
// BUYERS = JSON {orderId:{n,a1,a2,c,s,z}} from the owner's OMS file (OMS shows "Unknown" once an order is marked Shipped)
// read from the run's event file, NOT from env: env values are printed in the run log, this file is not (buyer PII rule)
let buyers = {};
try {
  const ev = JSON.parse(require('fs').readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const b = (ev.inputs || {}).buyers; if (b) buyers = JSON.parse(b);
} catch (e) { console.log('could not read buyer addresses:', e.message); }
const ids = [...new Set(String(process.env.IDS || '').split(/[\s,]+/).map(nid).filter(Boolean))];
(async () => {
  const s = (await db.collection('aikm_admin').doc('proshipSettings').get()).data() || {};
  const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
  const w = num(s.weight) || 0.5, ph = String(s.phone || '').replace(/\D/g, '').slice(-10);
  const job = { status: 'queued', step: 'Waiting for the server…', ids: Object.fromEntries(ids.map((k) => [k, w])), count: ids.length, sla: 'owner-list',
    box: { l: num(s.l) || 20, b: num(s.b) || 15, h: num(s.h) || 10 },
    pickup: { name: s.name, phone: ph, email: s.email, address: s.address, city: s.city, state: s.state, pin: String(s.pin || '').trim(), gstin: s.gstin || '' },
    phones: Object.fromEntries(ids.filter((k) => phones[k]).map((k) => [k, phones[k]])),
    createdAt: admin.firestore.FieldValue.serverTimestamp(), by: 'owner-request' };
  // save the phones for later ship jobs (kept 30 days, buyer PII rule = max 90)
  if (Object.keys(phones).length || Object.keys(buyers).length) {
    const pr = db.collection('aikm_admin').doc('proshipPhones'); const cur = ((await pr.get()).data() || {}).p || {};
    const now = Date.now(), keep = {}; Object.keys(cur).forEach((k) => { if (now - (cur[k].t || 0) < 30 * 864e5) keep[k] = cur[k]; });
    Object.keys(phones).forEach((k) => { keep[k] = Object.assign({}, keep[k], { p: phones[k], t: now }); });
    Object.keys(buyers).forEach((k) => { keep[nid(k)] = Object.assign({}, keep[nid(k)], { b: buyers[k], t: now }); });
    console.log('buyer addresses saved for later:', Object.keys(buyers).length);
    await pr.set({ p: keep, at: now });
    console.log('phones saved for later:', Object.keys(phones).length);
  }
  if (process.env.SAVE_ONLY === 'true') { console.log('SAVE ONLY - no ship job made'); process.exit(0); }
  const ref = db.collection('proshipJobs').doc();
  await ref.set(job);
  console.log('JOB_ID=' + ref.id, 'orders', ids.length, 'weight', w, 'pickup pin', job.pickup.pin, 'buyer phones from file', ids.filter((k) => phones[k]).length);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
