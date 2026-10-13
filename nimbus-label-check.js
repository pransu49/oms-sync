const admin = require('firebase-admin');
(async () => {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const tok = (await admin.app().options.credential.getAccessToken()).access_token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const l = await (await fetch(`https://storage.googleapis.com/storage/v1/b?project=${sa.project_id}`, { headers: H })).json();
  console.log('N', (l.items || []).length, (l.items || []).map((b) => b.name.replace(sa.project_id, 'PID') + '@' + b.location).join(' '));
  const name = 'aikm-shipping-labels';
  let c = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${sa.project_id}`, { method: 'POST', headers: H, body: JSON.stringify({ name, location: 'ASIA-SOUTH1', storageClass: 'STANDARD', iamConfiguration: { uniformBucketLevelAccess: { enabled: true } }, lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: 3 } }] } }) });
  console.log('CREATE', c.status, (await c.text()).replace(new RegExp(sa.project_id, 'g'), 'PID').slice(0, 300));
  const bucket = admin.storage().bucket(name);
  try {
    await bucket.file('test/hello.txt').save('hello', { contentType: 'text/plain' });
    const [url] = await bucket.file('test/hello.txt').getSignedUrl({ action: 'read', expires: Date.now() + 3600e3, version: 'v4' });
    const g = await fetch(url); console.log('SIGNED', g.status, await g.text());
  } catch (e) { console.log('UPLOAD ERR', e.message.replace(new RegExp(sa.project_id, 'g'), 'PID')); }
})();
