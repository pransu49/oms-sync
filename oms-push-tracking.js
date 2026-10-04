// oms-push-tracking.js
// Pushes NimbusPost AWBs into OMS Guru using OMS Guru's own "Bulk Update Order Details" import
// (the same CSV you upload by hand at client.omsguru.com/import_data).
//
// Picks: Amazon orders in OMS Guru still New / Ready to ship / Packed with NO AWB (OMS refuses updates after Shipped),
// where NimbusPost already has an AWB (not cancelled).
// Fills: Channel Id, Channel Order Id, Sub Order Id = ALL, Shipment Tracker, Shipping Company, Shipment Date.
// Order Status is left empty (OMS Guru says not to set it).
//
// DRY_RUN=true  -> only prints what it would push (no upload).

const admin = require('firebase-admin');

const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD;
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const BASE = 'https://client.omsguru.com';
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const REPUSH_AFTER_H = 6; // don't re-send the same order within 6 hours

// ---- two Firestore projects: OMS data (aikm-oms-sync) and console data (aikm--order-file) ----
const omsApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
const omsDb = omsApp.firestore(), db = mainApp.firestore();

// ---- OMS Guru session ----
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) {
  const r = await fetch(BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } });
  upd(r);
  return { status: r.status, loc: r.headers.get('location'), text: await r.text() };
}
async function login() {
  await req('/login');
  const r = await req('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString(),
  });
  if (r.status !== 302) throw new Error(`OMS Guru login failed (status ${r.status})`);
}
const grab = (html, re, what) => { const m = html.match(re); if (!m) throw new Error(`OMS Guru page changed — could not find ${what}`); return m[1]; };

function istToday() {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  return d.toISOString().slice(0, 10);
}
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
// OMS Guru allows max 20 characters for Shipping Company
function courierName(c) {
  c = String(c || '').trim();
  if (c.length <= 20) return c;
  const k = c.toLowerCase();
  for (const [re, name] of [[/delhivery/, 'Delhivery'], [/^xb\b|xpressbees/, 'Xpressbees'], [/amazon|ats/, 'Amazon Shipping'], [/ekart/, 'Ekart'], [/shadowfax/, 'Shadowfax'], [/dtdc/, 'DTDC'], [/blue ?dart/, 'BlueDart'], [/ecom/, 'Ecom Express']]) if (re.test(k)) return name;
  return c.slice(0, 20);
}
const csvCell = (v) => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

async function main() {
  // 1) data
  const chunks = await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get();
  const oms = []; chunks.forEach((d) => oms.push(...(d.get('orders') || [])));
  const nbDoc = await db.collection('nimbusIndex').doc('byOrder').get();
  const nimbus = {}; Object.entries((nbDoc.exists && nbDoc.get('orders')) || {}).forEach(([k, v]) => { nimbus[nid(k)] = v; });
  const logRef = db.collection('aikm_admin').doc('omsTrackingPush');
  const logDoc = await logRef.get();
  const pushed = (logDoc.exists && logDoc.get('ids')) || {};
  console.log(`OMS orders: ${oms.length} · NimbusPost AWBs: ${Object.keys(nimbus).length} · previously pushed: ${Object.keys(pushed).length}`);

  // 2) pick orders
  const byOrder = {};
  oms.forEach((o) => {
    if (!/amazon/i.test(o.channel || '')) return;
    const id = nid(o.channelOrderId); if (!id) return;
    (byOrder[id] = byOrder[id] || []).push(o);
  });
  const rows = [], skipped = { noChannelId: 0, recentlyPushed: 0 };
  const now = Date.now();
  for (const [id, lines] of Object.entries(byOrder)) {
    const live = lines.filter((o) => !/cancel/i.test(o.status || ''));
    if (!live.length) continue;
    if (live.some((o) => String(o.awb || '').trim())) continue;                       // OMS already has an AWB
    // OMS Guru only allows adding an AWB before the order is Shipped ("Cancel or Update Shipment not permitted in this status")
    if (!live.every((o) => /^(new|ready to ship|packed|pending|confirmed)$/i.test(String(o.status || '').trim()))) continue;
    const n = nimbus[id];
    if (!n || !n.a || n.s === 'cancelled') continue;                                    // no NimbusPost AWB yet
    const chId = String(live[0].channelId || '').trim();
    if (!chId) { skipped.noChannelId++; continue; }
    if (pushed[id] && now - pushed[id].t < REPUSH_AFTER_H * 3600e3 && pushed[id].a === n.a) { skipped.recentlyPushed++; continue; }
    rows.push({ chId, id, awb: n.a, courier: courierName(n.c) });
  }
  { // match check (counts only)
    let inNimbus = 0, sameAwb = 0, omsHasOther = 0, pendNoNb = 0;
    for (const [id, lines] of Object.entries(byOrder)) {
      const n = nimbus[id], oAwb = String((lines.find((o) => o.awb) || {}).awb || '').trim();
      if (n && n.a) { inNimbus++; if (oAwb === n.a) sameAwb++; else if (oAwb) omsHasOther++; }
      else if (!oAwb && lines.some((o) => /^new$/i.test(o.status || ''))) pendNoNb++;
    }
    console.log(`Match check: OMS Amazon orders found in NimbusPost ${inNimbus} · same AWB already in OMS ${sameAwb} · different AWB in OMS ${omsHasOther} · New in OMS with no NimbusPost AWB yet ${pendNoNb}`);
  }
  console.log(`To push: ${rows.length} · skipped (no Channel Id yet): ${skipped.noChannelId} · skipped (sent < ${REPUSH_AFTER_H}h ago): ${skipped.recentlyPushed}`);
  rows.slice(0, 10).forEach((r) => console.log(`  ${r.id} -> ${r.awb} (${r.courier})`));

  const today = istToday();
  const header = ['Channel Id*', 'Channel Order Id*', 'Channel Sub Order Id*', 'Invoice Number', 'Invoice Date', 'Shipment Tracker', 'Shipping Company', 'Shipment Date', 'IMEI Details', 'Order Status', 'Delivery Date'];
  const csv = [header, ...rows.map((r) => [r.chId, r.id, 'ALL', '', '', r.awb, r.courier, today, '', '', ''])]
    .map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';

  const result = { at: admin.firestore.FieldValue.serverTimestamp(), count: rows.length, dry: DRY, skippedNoChannelId: skipped.noChannelId, message: '' };
  if (!rows.length) { result.message = 'Nothing new to push.'; if (!DRY) await logRef.set({ last: result }, { merge: true }); console.log(result.message); return; }
  if (DRY) { console.log('DRY RUN — nothing uploaded.'); return; }

  // 3) upload to OMS Guru (Import Data -> Bulk Update Order Details, type 49)
  await login();
  const page = await req('/import_data');
  const pageTok = grab(page.text, /name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/, 'page token');
  const frag = await req('/import_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE },
    body: new URLSearchParams({ id: '49', 'data[ImportDataFileType][oms_token]': pageTok, _method: 'POST' }).toString(),
  });
  const importTok = grab(frag.text, /name="data\[ImportData\]\[oms_token\]" value="([^"]+)"/, 'import token');
  const box = await req('/file_upload/file_upload/index/import_data', { headers: { Referer: BASE + '/import_data' } });
  const upTok = grab(box.text, /name="oms_token" value="([^"]+)"/, 'upload token');

  const fname = `BulkUpdateOrderDetails_${today}_${Date.now()}.csv`;
  const fd = new FormData();
  fd.append('oms_token', upTok);
  fd.append('files[]', new Blob([csv], { type: 'text/csv' }), fname);
  const up = await fetch(BASE + '/import_data/upload', { method: 'POST', body: fd, headers: { ...H, Cookie: ck(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', Referer: BASE + '/file_upload/file_upload/index/import_data' } });
  upd(up);
  const upText = await up.text();
  console.log('Upload step:', up.status, upText.replace(/\s+/g, ' ').slice(0, 400));
  if (up.status !== 200 || /"error"\s*:\s*"[^"]/.test(upText)) throw new Error('OMS Guru did not accept the file upload.');

  const imp = await req('/import_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/import_data', Origin: BASE },
    body: new URLSearchParams({ _method: 'POST', 'data[ImportData][oms_token]': importTok, 'data[ImportData][id]': '49' }).toString(),
  });
  let html = imp.text, at = imp.loc;
  if (imp.status === 302 && imp.loc) { const f = await req(imp.loc.replace(BASE, '')); html = f.text; at = imp.loc; }
  const flash = (html.match(/<div[^>]*(alert|flash|message)[^>]*>([\s\S]*?)<\/div>/gi) || [])
    .map((x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter((x) => x && x.length < 400 && !/mobile app/i.test(x));
  console.log('Import step:', imp.status, at || '', '|', flash.slice(0, 5).join(' || '));
  result.message = flash.slice(0, 3).join(' | ').slice(0, 500) || `Import submitted (status ${imp.status}).`;

  // 4) wait for OMS Guru to finish the import and read its result (notification + error file)
  const startedAt = Date.now(); let outcome = null;
  while (Date.now() - startedAt < 4 * 60e3) {
    await new Promise((res) => setTimeout(res, 15e3));
    const n = await req('/notifications');
    const items = [...n.text.matchAll(/<li class="item"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]).slice(0, 8);
    const it = items.find((x) => /Bulk Update Order Details/.test(x) && !/We are processing/.test(x));
    if (!it) continue;
    const when = (it.match(/@ ([A-Za-z]+ \d+, \d{4} \d+:\d+:\d+ [AP]M)/) || [])[1];
    const t = when ? new Date(when + ' GMT+0530').getTime() : 0;
    if (t && t < startedAt - 5 * 60e3) continue;                         // an older notification
    if (/Failed/i.test(it)) {
      const link = (it.match(/href="([^"]+)"/) || [])[1];
      const errs = {};
      if (link) {
        const rep = await fetch(link, { headers: { ...H, Cookie: ck() }, redirect: 'follow' });
        const body = await rep.text();
        body.split(/\r?\n/).slice(1).forEach((line) => {
          const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [];
          const clean = cols.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
          if (clean[1]) errs[clean[1]] = clean[clean.length - 1] || clean[11] || 'error';
        });
      }
      outcome = { ok: false, errors: errs };
    } else outcome = { ok: true, errors: {} };
    break;
  }
  const failed = outcome ? outcome.errors : {};
  const okCount = rows.filter((r) => !failed[r.id]).length;
  if (!outcome) result.message = 'Sent to OMS Guru — result not reported yet (check OMS Guru notifications).';
  else if (outcome.ok) result.message = `OMS Guru imported all ${rows.length} AWB(s).`;
  else {
    const reasons = {}; Object.values(failed).forEach((e) => { reasons[e] = (reasons[e] || 0) + 1; });
    result.message = `${okCount} updated, ${Object.keys(failed).length} rejected by OMS Guru: ` + Object.entries(reasons).map(([e, c]) => `${c} × ${e}`).join('; ');
    result.failed = failed;
  }
  result.count = outcome ? okCount : rows.length;
  console.log('OMS Guru result:', result.message);
  Object.entries(failed).forEach(([id, e]) => console.log(`  rejected ${id}: ${e}`));

  rows.forEach((r) => { pushed[r.id] = { a: r.awb, t: now, e: failed[r.id] || '' }; });
  Object.keys(pushed).forEach((k) => { if (now - pushed[k].t > 20 * 864e5) delete pushed[k]; });
  await logRef.set({ ids: pushed, last: result });
  console.log(`Done: ${result.count} AWB(s) updated in OMS Guru.`);
}

main().catch(async (e) => {
  console.error('PUSH FAILED:', e.message);
  try { await db.collection('aikm_admin').doc('omsTrackingPush').set({ last: { at: admin.firestore.FieldValue.serverTimestamp(), count: 0, error: e.message } }, { merge: true }); } catch (_) {}
  process.exit(1);
});
