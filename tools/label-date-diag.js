// Read-only: why does the ATS label show a future ship date? Takes the newest ATS AWBs from proshipIndex,
// prints ProShip's date fields for them + the date lines printed on the label PDF. No buyer data is printed.
const admin = require('firebase-admin'), https = require('https'), fs = require('fs'), { execSync } = require('child_process');
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const BASE = 'https://proship.prozo.com';
let token = '';
const getWithBody = (path, body) => new Promise((res, rej) => {
  const u = new URL(BASE + path), data = JSON.stringify(body);
  const r = https.request({ method: 'GET', hostname: u.hostname, path: u.pathname, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 60000 }, (x) => {
    let t = ''; x.on('data', (c) => (t += c)); x.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(new Error('not JSON ' + x.statusCode)); } });
  }); r.on('error', rej); r.write(data); r.end();
});
const day = (off) => new Date(Date.now() + 5.5 * 3600e3 + off * 864e5).toISOString().slice(0, 10);
const DATE_KEY = /date|time|created|updated|edd|sla|pickup|manifest|ship/i;
function dates(o, pre, out) {
  for (const k of Object.keys(o || {})) {
    const v = o[k], p = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) dates(v, p, out);
    else if (DATE_KEY.test(k) && v != null && v !== '' && typeof v !== 'object') out[p] = v;
  }
  return out;
}
(async () => {
  const j = await (await fetch(BASE + '/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.PROSHIP_USERNAME, password: process.env.PROSHIP_PASSWORD }) })).json();
  token = j.accessToken; if (!token) throw new Error('login failed');
  const idx = JSON.parse((await main.collection('aikm_admin').doc('proshipIndex').get()).get('data') || '{}');
  const ats = Object.entries(idx).filter(([, v]) => /ats|amazon/i.test(v.c || '') && v.s !== 'cancelled').sort((a, b) => b[1].t - a[1].t).slice(0, 5);
  console.log('ATS AWBs in index:', Object.values(idx).filter((v) => /ats|amazon/i.test(v.c || '')).length, '· checking newest', ats.length);
  const list = [];
  for (let off = 0; off < 400; off += 50) { const r = await getWithBody('/api/order/external/details', { created_from: day(-3), created_to: day(1), offset: off, limit: 50 }); const d = (r && r.data) || []; list.push(...d); if (d.length < 50) break; }
  for (const [id, v] of ats) {
    console.log('\n=== AWB', v.a, '· courier', v.c, '· booked by robot', new Date(v.t + 5.5 * 3600e3).toISOString().replace('T', ' ').slice(0, 16), 'IST');
    const o = list.find((x) => String(x.awbNumber) === String(v.a));
    console.log('ProShip date fields:', JSON.stringify(o ? dates(o, '', {}) : 'not in last-3-day list'));
    try {
      const lr = await (await fetch(BASE + '/api/tools/refresh/url', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ awbNumber: String(v.a), docType: 'LABEL' }) })).json();
      const url = lr.LABEL || (lr.result || {}).LABEL;
      if (!url) { console.log('no label url', JSON.stringify(lr).slice(0, 200)); continue; }
      fs.writeFileSync('/tmp/l.pdf', Buffer.from(await (await fetch(url)).arrayBuffer()));
      const txt = execSync('pdftotext -layout /tmp/l.pdf -').toString();
      const lines = txt.split('\n').filter((l) => /\d{1,4}[-\/.]\d{1,2}[-\/.]\d{2,4}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|date|ship/i.test(l));
      // only the date words, never names/addresses
      lines.forEach((l) => { const m = l.match(/([A-Za-z .]*(date|ship|dt)[A-Za-z .]*[:\-]?\s*)?(\d{1,4}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}[ -](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -,]*\d{2,4})/ig); if (m) console.log('LABEL:', m.join(' | ')); });
    } catch (e) { console.log('label error', e.message); }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
