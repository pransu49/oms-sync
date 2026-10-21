const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const mask = (v) => typeof v === 'string' && v.length > 3 ? v.slice(0, 3) + '…(' + v.length + ')' : v;
(async () => {
  const cols = await db.listCollections();
  console.log('collections:', cols.map((c) => c.id).join(', '));
  for (const name of cols.map((c) => c.id).filter((n) => /zipp/i.test(n))) {
    const snap = await db.collection(name).limit(400).get();
    console.log(`== ${name}: ${snap.size} docs (first 400)`);
    snap.docs.slice(0, 4).forEach((d) => {
      const x = d.data(); const out = {};
      Object.entries(x).forEach(([k, v]) => {
        if (Array.isArray(v)) out[k] = `array(${v.length}) first=` + JSON.stringify(v[0] && typeof v[0] === 'object' ? Object.fromEntries(Object.entries(v[0]).map(([a, b]) => [a, /name|phone|addr|email/i.test(a) ? mask(String(b)) : b])) : v[0]).slice(0, 900);
        else if (v && typeof v === 'object' && v.toDate) out[k] = v.toDate().toISOString();
        else if (v && typeof v === 'object') out[k] = 'obj keys=' + Object.keys(v).slice(0, 15).join(',') + ' sample=' + JSON.stringify(Object.values(v)[0]).slice(0, 600);
        else out[k] = /name|phone|addr|email/i.test(k) ? mask(String(v)) : v;
      });
      console.log(' doc', d.id, JSON.stringify(out).slice(0, 2500));
    });
  }
  const ai = await db.collection('aikm_admin').listDocuments();
  console.log('aikm_admin docs:', ai.map((d) => d.id).join(', '));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
