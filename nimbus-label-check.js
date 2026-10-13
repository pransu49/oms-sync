const admin = require('firebase-admin');
(async () => {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const tok = (await admin.app().options.credential.getAccessToken()).access_token;
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${sa.project_id}`, { headers: { Authorization: 'Bearer ' + tok } });
  console.log('BUCKETS', r.status, (await r.text()).slice(0, 600));
  for (const b of [sa.project_id + '.firebasestorage.app', sa.project_id + '.appspot.com']) {
    const x = await fetch(`https://storage.googleapis.com/storage/v1/b/${b}`, { headers: { Authorization: 'Bearer ' + tok } });
    console.log('B', b, x.status, (await x.text()).slice(0, 200));
  }
})();
