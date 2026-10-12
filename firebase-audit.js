// firebase-audit.js — one-off check: how many documents each collection holds in the main console project
// (so we know which live listeners in the console cost the most reads). Uses count() = ~1 read per 1000 docs.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function count(ref) { try { return (await ref.count().get()).data().count; } catch (e) { return 'ERR ' + e.message.slice(0, 60); } }

(async () => {
  const roots = await db.listCollections();
  for (const c of roots) {
    console.log(`${c.id}: ${await count(c)}`);
    if (c.id === 'aikm_admin' || c.id === 'nimbusDash') {
      const docs = await c.listDocuments();
      for (const d of docs) {
        const subs = await d.listCollections();
        for (const s of subs) console.log(`   ${c.id}/${d.id}/${s.id}: ${await count(s)}`);
      }
    }
  }
})().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
