// firebase-audit.js — one-off check of document counts in the main console project (to find what costs reads).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
async function count(ref) { try { return (await ref.count().get()).data().count; } catch (e) { return 'ERR ' + e.message.slice(0, 60); } }
(async () => {
  for (const col of ['spapiMrpUpdates', 'spapiHsnUpdates', 'spapiPriceUpdates', 'spapiListingDeletions'])
    for (const acct of ['Praso', 'praso', 'SastaStore', 'Sasta Store', 'sastastore'])
      for (const st of ['pending', 'failed', 'applied']) {
        const n = await count(db.collection(col).where('account', '==', acct).where('status', '==', st));
        if (n) console.log(`${col} ${acct} ${st}: ${n}`);
      }
  const s = await db.collection('spapiMrpUpdates').limit(1).get();
  s.forEach((d) => console.log('sample account:', d.get('account')));
  const sl = await db.collection('aikm_admin').doc('data').collection('scanLogEntries').orderBy('ScannedAt', 'asc').limit(1).get();
  sl.forEach((d) => console.log('oldest scan:', d.get('ScannedAt')));
})().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
