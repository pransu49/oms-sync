// ATS label "Ship Date" (owner 23 Nov 2026 "deploy the same ship date on the tool"). ProShip's API has no such field and the ATS label
// is a picture, so this reads it from the label by OCR. Runs after every 30-min ProShip status refresh: newest live ATS AWBs without
// a ship date (max 250 per run, 2 tries each) -> proshipIndex v.sd = "YYYY-MM-DD" (transaction on the fresh doc, never overwrites others).
// No buyer data is printed or saved. Firebase: 1 read + (1 read + 1 write when something new) per run.
const admin = require('firebase-admin'), fs = require('fs'), { execSync } = require('child_process');
const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }).firestore();
const BASE = 'https://proship.prozo.com', MAX = Number(process.env.SD_MAX || 250), PAR = 4;
const ref = db.collection('aikm_admin').doc('proshipIndex');
const isAts = (v) => /\bats\b|amazon/i.test(v.c || '');
const open = (v) => v.s !== 'cancelled' && v.s !== 'delivered' && v.s !== 'rto' && v.s !== 'rto_delivered' && !/DELIVERED|CANCEL|^RTO/i.test(v.st || '');
let token = '';
async function readSd(awb) {
  const lr = await (await fetch(BASE + '/api/tools/refresh/url', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ awbNumber: String(awb), docType: 'LABEL' }) })).json();
  const url = lr.LABEL || (lr.result || {}).LABEL; if (!url) return null;
  const f = '/tmp/sd_' + awb; fs.writeFileSync(f + '.pdf', Buffer.from(await (await fetch(url)).arrayBuffer()));
  let txt = '';
  try { execSync(`pdftoppm -r 220 -f 1 -l 1 -png "${f}.pdf" "${f}"`); txt = execSync(`for x in "${f}"*.png; do tesseract "$x" - 2>/dev/null; done`, { shell: '/bin/bash' }).toString(); }
  finally { execSync(`rm -f "${f}"*`, { shell: '/bin/bash' }); }
  const m = txt.match(/Ship\s*Date\s*[:;.]?\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})/i);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2025 || y > 2030) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
(async () => {
  let idx = {}; try { idx = JSON.parse((await ref.get()).get('data') || '{}'); } catch (e) {}
  const todo = Object.keys(idx).filter((k) => { const v = idx[k]; return v && v.a && isAts(v) && !v.sd && (v.sdx || 0) < 2 && open(v) && Date.now() - (v.t || 0) < 6 * 864e5; })
    .sort((a, b) => (idx[b].t || 0) - (idx[a].t || 0)).slice(0, MAX);
  console.log('ATS ship date: to read', todo.length);
  if (!todo.length) return process.exit(0);
  execSync('which tesseract >/dev/null 2>&1 || (sudo apt-get update -qq >/dev/null; sudo apt-get install -y -qq poppler-utils tesseract-ocr >/dev/null)', { shell: '/bin/bash', stdio: 'inherit' });
  const j = await (await fetch(BASE + '/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.PROSHIP_USERNAME, password: process.env.PROSHIP_PASSWORD }) })).json();
  token = j.accessToken; if (!token) throw new Error('ProShip login failed');
  const got = {}, miss = {}; let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < todo.length) {
      const k = todo[i++];
      try { const sd = await readSd(idx[k].a); if (sd) got[k] = sd; else miss[k] = 1; } catch (e) { miss[k] = 1; }
    }
  }));
  await db.runTransaction(async (tx) => {
    const d = await tx.get(ref); let cur = {}; try { cur = JSON.parse(d.get('data') || '{}'); } catch (e) { return; }
    Object.keys(got).forEach((k) => { if (cur[k] && String(cur[k].a) === String(idx[k].a)) { cur[k].sd = got[k]; delete cur[k].sdx; } });
    Object.keys(miss).forEach((k) => { if (cur[k] && !cur[k].sd) cur[k].sdx = (cur[k].sdx || 0) + 1; });
    tx.update(ref, { data: JSON.stringify(cur) });
  });
  const hist = {}; Object.values(got).forEach((s) => { hist[s] = (hist[s] || 0) + 1; });
  console.log('ATS ship date: read', Object.keys(got).length, '· not readable', Object.keys(miss).length, '· by date', JSON.stringify(hist));
  process.exit(0);
})().catch((e) => { console.error('ATS ship date error:', e.message); process.exit(0); });
