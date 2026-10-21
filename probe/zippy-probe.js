const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const pii = (k) => /name|phone|addr|email|mobile|city|pin/i.test(k);
function show(v, depth = 0) {
  if (v && v.toDate) return v.toDate().toISOString();
  if (Array.isArray(v)) return { _array: v.length, first: show(v[0], depth + 1) };
  if (v && typeof v === 'object') { if (depth > 2) return '{…}'; const o = {}; Object.entries(v).slice(0, 25).forEach(([k, x]) => { o[k] = pii(k) ? '<pii>' : show(x, depth + 1); }); o._keys = Object.keys(v).length; return o; }
  if (typeof v === 'string' && v.length > 300) return v.slice(0, 300) + '…(' + v.length + ')';
  return v;
}
(async () => {
  const ref = db.collection('aikm_admin').doc('zippyShipmentsIndex');
  const d = await ref.get();
  console.log('index exists', d.exists, 'updateTime', d.updateTime && d.updateTime.toDate().toISOString());
  console.log(JSON.stringify(show(d.data()), null, 1).slice(0, 5000));
  const subs = await ref.listCollections();
  console.log('subcollections:', subs.map((c) => c.id).join(','));
  for (const c of subs) {
    const s = await c.get(); console.log('==', c.id, s.size, 'docs');
    s.docs.slice(0, 3).forEach((x) => console.log(' doc', x.id, 'updated', x.updateTime.toDate().toISOString(), JSON.stringify(show(x.data())).slice(0, 2500)));
    let latest = 0; s.docs.forEach((x) => { latest = Math.max(latest, x.updateTime.toMillis()); }); console.log(' latest update', new Date(latest).toISOString());
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
