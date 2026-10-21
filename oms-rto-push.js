// oms-rto-push.js
// When a parcel is marked received in the console's RTO Check tab, accept that return in OMS Guru
// using OMS Guru's own import "Bulk Import Return Order Data" (type 6 — marks orders as returned received).
//
// Reads : main Firebase   aikm_admin/rtoReceived  { m: { orderId: { r: 'YYYY-MM-DD', cond: 'good'|'bad', id, oms } } }
//         OMS Firebase    aikm_admin/omsOrders/chunks (sub-orders, qty, channel id, status)
//                         aikm_admin/omsRefundOrders (older self-ship orders: sub-order + qty)
//                         aikm_admin/rtoIndex (account, original AWB, RTO vs customer return)
// Writes: rtoReceived m.<orderId>.oms = { s: 'sent'|'done'|'failed'|'skip', e: reason, t }
// Each order is sent ONCE. A failed one is retried only when the console sets oms.s = 'retry'.
//
// DRY_RUN=true -> only prints the CSV.

const admin = require('firebase-admin');
const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD;
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const ONLY = String(process.env.ONLY_ORDERS || '').split(',').map((x) => x.trim()).filter(Boolean); // test: build rows for these
const BASE = 'https://client.omsguru.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };

const omsApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
const omsDb = omsApp.firestore(), db = mainApp.firestore();
const FP = admin.firestore.FieldPath;

let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) {
  const r = await fetch(BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } });
  upd(r); return { status: r.status, loc: r.headers.get('location'), text: await r.text() };
}
async function login() {
  await req('/login');
  const r = await req('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  if (r.status !== 302) throw new Error(`OMS Guru login failed (status ${r.status})`);
}
const grab = (html, re, what) => { const m = html.match(re); if (!m) throw new Error(`OMS Guru page changed — could not find ${what}`); return m[1]; };
const csvCell = (v) => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim().replace(/_\d+$/, '');
const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

async function main() {
  // ---- what the console marked ----
  const recRef = db.collection('aikm_admin').doc('rtoReceived');
  const rec = ((await recRef.get()).data() || {}).m || {};
  let todo = Object.entries(rec).filter(([, v]) => v && v.r && (!v.oms || v.oms.s === 'retry'));
  if (ONLY.length) todo = ONLY.map((id) => [id, rec[id] || { r: new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10), cond: 'good' }]);
  console.log(`Marked received in console: ${Object.keys(rec).length} · to send to OMS Guru now: ${todo.length}`);
  if (!todo.length) return;

  // ---- OMS data ----
  const lines = {}, chanId = {};
  (await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.data().orders || []).forEach((o) => {
    const id = nid(o.channelOrderId); if (!id) return;
    (lines[id] = lines[id] || []).push({ sub: String(o.channelSubOrderId || '').trim(), q: num(o.qty) || 1, st: String(o.status || ''), ch: o.channel || '', chId: String(o.channelId || '').trim(), awb: String(o.awb || '').trim() });
    if (o.channel && o.channelId) chanId[o.channel] = String(o.channelId);
  }));
  const older = {};
  try { (((await omsDb.collection('aikm_admin').doc('omsRefundOrders').get()).data() || {}).orders || []).forEach((o) => { if (o.o) (older[o.o] = older[o.o] || []).push({ sub: String(o.i || ''), q: num(o.q) || 1, st: o.st || '', ch: (o.a || '') + ' - Amazon', awb: o.aw || '' }); }); } catch (e) {}
  let idx = {};
  try { JSON.parse(((await omsDb.collection('aikm_admin').doc('rtoIndex').get()).data() || {}).rows || '[]').forEach((r) => { idx[r.o] = r; }); } catch (e) {}

  const rows = [], skip = {};
  for (const [id, v] of todo) {
    const r = idx[id] || {};
    let ls = lines[id] || older[id] || [];
    ls = ls.filter((l, i, a) => a.findIndex((x) => x.sub === l.sub) === i);
    if (ls.length && ls.every((l) => /return received|returned/i.test(l.st))) { skip[id] = { s: 'done', e: 'Already return-received in OMS Guru' }; continue; }
    const channel = (ls[0] && ls[0].ch) || (r.acc ? r.acc + ' - Amazon' : '');
    const chId = (ls[0] && ls[0].chId) || chanId[channel] || '';
    if (!chId) { skip[id] = { s: 'failed', e: 'Channel not found in OMS Guru data — accept this one in OMS Guru by hand' }; continue; }
    const type = r.k === 'cust' ? 'Customer Return' : 'Courier Return';
    const reason = r.k === 'cust' ? (r.rs || 'Customer return') : 'RTO - Undelivered';
    const bad = v.cond === 'bad';
    const note = `Received via AIKM RTO Check${v.id ? ' · return ID ' + v.id : ''}`;
    if (ls.length && ls.every((l) => l.sub)) {
      ls.forEach((l) => rows.push({ id, cells: [chId, id, l.sub, '', v.r, type, bad ? 0 : l.q, bad ? l.q : 0, reason, '', note] }));
    } else {
      const awb = r.a || (ls[0] && ls[0].awb) || '';
      if (!awb) { skip[id] = { s: 'failed', e: 'No sub-order or AWB known — accept this one in OMS Guru by hand' }; continue; }
      const q = (r.items || []).reduce((s, i) => s + (i.q || 1), 0) || 1;
      rows.push({ id, cells: [chId, '', '', awb, v.r, type, bad ? 0 : q, bad ? q : 0, reason, '', note] });
    }
  }
  const header = ['Channel Id', 'Channel Order ID', 'Channel Sub Order ID', 'Shipment AWB', 'Return Date', 'Return Type', 'Good Return Qty', 'Bad Return Qty', 'Return Reason', 'Return Sub Reason', 'Return Buyer Comments'];
  const csv = [header, ...rows.map((x) => x.cells)].map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  console.log(`Rows: ${rows.length} · skipped: ${JSON.stringify(skip)}`);
  console.log(csv);

  const now = Date.now(), result = {};
  Object.entries(skip).forEach(([id, x]) => { result[id] = { ...x, t: now }; });
  if (DRY || ONLY.length) { console.log('DRY RUN — nothing uploaded.'); return; }

  if (rows.length) {
    await login();
    const page = await req('/import_data');
    const pageTok = grab(page.text, /name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/, 'page token');
    const frag = await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE },
      body: new URLSearchParams({ id: '6', 'data[ImportDataFileType][oms_token]': pageTok, _method: 'POST' }).toString() });
    const importTok = grab(frag.text, /name="data\[ImportData\]\[oms_token\]" value="([^"]+)"/, 'import token');
    const box = await req('/file_upload/file_upload/index/import_data', { headers: { Referer: BASE + '/import_data' } });
    const upTok = grab(box.text, /name="oms_token" value="([^"]+)"/, 'upload token');
    const fd = new FormData();
    fd.append('oms_token', upTok);
    fd.append('files[]', new Blob([csv], { type: 'text/csv' }), `ReturnOrderData_${Date.now()}.csv`);
    const up = await fetch(BASE + '/import_data/upload', { method: 'POST', body: fd, headers: { ...H, Cookie: ck(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', Referer: BASE + '/file_upload/file_upload/index/import_data' } });
    upd(up); const upText = await up.text();
    console.log('Upload step:', up.status, upText.replace(/\s+/g, ' ').slice(0, 300));
    if (up.status !== 200 || /"error"\s*:\s*"[^"]/.test(upText)) throw new Error('OMS Guru did not accept the file upload.');
    const imp = await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/import_data', Origin: BASE },
      body: new URLSearchParams({ _method: 'POST', 'data[ImportData][oms_token]': importTok, 'data[ImportData][id]': '6' }).toString() });
    console.log('Import step:', imp.status, imp.loc || '');

    // wait for OMS Guru's notification and read its error file
    const startedAt = Date.now(); let outcome = null;
    while (Date.now() - startedAt < 4 * 60e3) {
      await new Promise((res) => setTimeout(res, 15e3));
      const n = await req('/notifications');
      const items = [...n.text.matchAll(/<li class="item"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]).slice(0, 8);
      const it = items.find((x) => /Return Order Data/i.test(x) && !/We are processing/.test(x));
      if (!it) continue;
      const when = (it.match(/@ ([A-Za-z]+ \d+, \d{4} \d+:\d+:\d+ [AP]M)/) || [])[1];
      const t = when ? new Date(when + ' GMT+0530').getTime() : 0;
      if (t && t < startedAt - 5 * 60e3) continue;
      console.log('OMS Guru notification:', it.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300));
      if (/Failed/i.test(it)) {
        const link = (it.match(/href="([^"]+)"/) || [])[1], errs = {};
        if (link) {
          const body = await (await fetch(link, { headers: { ...H, Cookie: ck() }, redirect: 'follow' })).text();
          console.log('Error file:', body.slice(0, 1500));
          body.split(/\r?\n/).slice(1).forEach((line) => {
            const cols = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
            const awb = cols[3], oid = cols[1] || rows.find((x) => x.cells[3] && x.cells[3] === awb)?.id;
            if (oid) errs[oid] = cols.filter(Boolean).slice(-1)[0] || 'error';
          });
        }
        outcome = { ok: false, errors: errs };
      } else outcome = { ok: true, errors: {} };
      break;
    }
    const ids = [...new Set(rows.map((x) => x.id))];
    ids.forEach((id) => {
      if (!outcome) result[id] = { s: 'sent', e: 'Sent — OMS Guru has not reported back yet', t: now };
      else if (outcome.errors[id]) result[id] = { s: 'failed', e: outcome.errors[id], t: now };
      else if (!outcome.ok && !Object.keys(outcome.errors).length) result[id] = { s: 'failed', e: 'OMS Guru reported a failure — check its notifications', t: now };
      else result[id] = { s: 'done', e: '', t: now };
    });
  }

  // save per-order result (field paths, so console edits to other orders are not overwritten)
  const args = [];
  Object.entries(result).forEach(([id, x]) => { args.push(new FP('m', id, 'oms'), x); });
  if (args.length) await recRef.update(...args);
  Object.entries(result).forEach(([id, x]) => console.log(`  ${id}: ${x.s}${x.e ? ' — ' + x.e : ''}`));
}

main().catch((e) => { console.error('RTO PUSH FAILED:', e.message || e); process.exit(1); });
