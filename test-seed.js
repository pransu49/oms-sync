try { require('./fb-meter'); } catch (e) {} // Firebase usage meter (counts only)
// test-seed.js — fills the TEST project (aikm-test) with practice data, so tool pages opened with ?env=test show realistic screens.
// Amazon restricted-role control "separate test environment": the test project never holds real buyer details.
//  - Copies every collection of the 3 live projects (main, SP-API, OMS) into aikm-test, max MAX_DOCS documents per collection
//    (+ the 'chunks' sub-collections of aikm_admin documents, e.g. OMS orders), live data is ONLY READ.
//  - Every buyer detail is replaced by fake values BEFORE it is written (name, phone, address, email; also inside JSON text fields).
//    City / state / pincode stay (needed for courier rates, not personal on their own).
//  - Skips collections that hold buyer messages, labels or access logs.
// Run by hand only (workflow "Test database - refresh practice data"). Firebase: ~1-4k reads on the live projects per run, same writes to aikm-test.
const admin = require('firebase-admin');
const cert = v => admin.credential.cert(JSON.parse(process.env[v]));
const live = {
  main: admin.initializeApp({ credential: cert('FIREBASE_SERVICE_ACCOUNT') }, 'main').firestore(),
  spapi: admin.initializeApp({ credential: cert('FIREBASE_SERVICE_ACCOUNT_SPAPI') }, 'spapi').firestore(),
  oms: admin.initializeApp({ credential: cert('FIREBASE_SERVICE_ACCOUNT_OMS') }, 'oms').firestore(),
};
const testApp = admin.initializeApp({ credential: cert('FIREBASE_SERVICE_ACCOUNT_TEST') }, 'test');
const test = testApp.firestore();
if (testApp.options.credential && JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_TEST).project_id !== 'aikm-test') {
  console.error('FIREBASE_SERVICE_ACCOUNT_TEST is not the aikm-test project - stopping so live data is never overwritten.'); process.exit(1);
}
const MAX_DOCS = Number(process.env.MAX_DOCS || 300);
const SKIP = /complaint|label|audit|attendance|deleted|history|relistlog/i;
const BUYER_KEYS = /^buyer(Name|Phone|Address1|Address2|Address|Email|Mobile)$|^(shipTo|shippingAddress|customerName|customerPhone)$/i;

let scrubbed = 0;
function fake(k) { scrubbed++; return /phone|mobile/i.test(k) ? '9000000000' : /email/i.test(k) ? '' : /name/i.test(k) ? 'Test Buyer' : 'Test address line'; }
function scrub(v, depth = 0) {
  if (depth > 12 || v == null) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t[0] === '{' || t[0] === '[') && t.length > 20 && /buyer|"n"|"pin"/i.test(t)) {
      try { return JSON.stringify(scrub(JSON.parse(t), depth + 1)); } catch (e) { return v; }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1));
  if (typeof v === 'object') {
    if (v.constructor && v.constructor.name !== 'Object') return v;           // Timestamp, GeoPoint, DocumentReference ...
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (BUYER_KEYS.test(k) && x) o[k] = fake(k);
      else if (k === 'n' && ('pin' in v || 'ci' in v) && x) o[k] = fake('name');  // rtoIndex rows
      else o[k] = scrub(x, depth + 1);
    }
    return o;
  }
  return v;
}

async function copyCol(src, path, srcName, counts) {
  const snap = await src.collection(path).limit(MAX_DOCS).get();
  let bw = test.bulkWriter();
  for (const d of snap.docs) bw.set(test.collection(path).doc(d.id), scrub(d.data()));
  await bw.close();
  counts.push(`${srcName}:${path} ${snap.size}`);
  return snap.docs;
}

(async () => {
  const counts = [], seen = {};
  for (const [name, db] of Object.entries(live)) {           // OMS last: its aikm_admin documents win on the same id
    const cols = await db.listCollections();
    for (const c of cols) {
      if (SKIP.test(c.id)) { counts.push(`${name}:${c.id} skipped`); continue; }
      const docs = await copyCol(db, c.id, name, counts);
      for (const d of docs) {
        const k = c.id + '/' + d.id; if (seen[k]) console.log('same document in two projects (later one kept):', k, seen[k], '->', name); seen[k] = name;
        if (c.id !== 'aikm_admin') continue;
        for (const sub of await d.ref.listCollections()) {
          if (SKIP.test(sub.id)) continue;
          await copyCol(db, `${c.id}/${d.id}/${sub.id}`, name, counts);
        }
      }
    }
  }
  await test.collection('aikm_admin').doc('testInfo').set({ seededAt: admin.firestore.FieldValue.serverTimestamp(), note: 'Practice data - buyer details are fake', maxDocs: MAX_DOCS });
  console.log(counts.join('\n'));
  console.log(`done - buyer fields replaced with fake values: ${scrubbed}`);
})().catch(e => { console.error('test-seed failed:', e); process.exit(1); });
