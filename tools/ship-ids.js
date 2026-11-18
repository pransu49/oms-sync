// Owner-requested ship of given order ids (18 Nov 2026): builds a proshipJobs doc exactly like the console does
// (pickup + box + weight from aikm_admin/proshipSettings), prints its id. The ProShip robot then ships it.
const admin = require('firebase-admin');
const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }).firestore();
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
const ids = [...new Set(String(process.env.IDS || '').split(/[\s,]+/).map(nid).filter(Boolean))];
(async () => {
  const s = (await db.collection('aikm_admin').doc('proshipSettings').get()).data() || {};
  const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
  const w = num(s.weight) || 0.5, ph = String(s.phone || '').replace(/\D/g, '').slice(-10);
  const job = { status: 'queued', step: 'Waiting for the server…', ids: Object.fromEntries(ids.map((k) => [k, w])), count: ids.length, sla: 'owner-list',
    box: { l: num(s.l) || 20, b: num(s.b) || 15, h: num(s.h) || 10 },
    pickup: { name: s.name, phone: ph, email: s.email, address: s.address, city: s.city, state: s.state, pin: String(s.pin || '').trim(), gstin: s.gstin || '' },
    createdAt: admin.firestore.FieldValue.serverTimestamp(), by: 'owner-request' };
  const ref = db.collection('proshipJobs').doc();
  await ref.set(job);
  console.log('JOB_ID=' + ref.id, 'orders', ids.length, 'weight', w, 'pickup pin', job.pickup.pin);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
