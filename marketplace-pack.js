// marketplace-pack.js — AIKM Meesho + Snapdeal robot (OMS Guru)
// Every run (daily at 10 AM IST, see .github/workflows/marketplace-pack.yml):
//   1. Logs into OMS Guru and reads ALL "New" orders, keeps the Meesho and Snapdeal ones
//   2. Packs them in OMS Guru ("Pack Orders"), confirming OMS's own box size / weight values
//   3. Waits until OMS shows the shipping label for each order (that is the proof it was packed)
//   4. Merges the labels into ONE PDF per account (sorted by product) and sends the PDFs,
//      a picklist and the failed list to Telegram. A summary is saved in Firestore (aikm_admin/marketplacePack).
//
// Settings (workflow inputs / env):
//   DRY_RUN=true  -> only lists what it WOULD pack (nothing is packed)
//   LIMIT=1       -> pack at most this many orders (0 = no limit) — used for test runs
//   CHANNELS=Meesho,Snapdeal -> which channels to process
//
// Privacy: this repo is public, so logs show counts, order ids and SKUs only — never buyer details.

const cheerio = require('cheerio');
const { PDFDocument } = require('pdf-lib');
const admin = require('firebase-admin');
const { notify } = require('./telegram');

const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD;
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || 0;
const TRIGGER = process.env.TRIGGER || 'manual';
const CHANNELS = (process.env.CHANNELS || 'Meesho,Snapdeal').split(',').map((s) => s.trim()).filter(Boolean);
const CH_RX = new RegExp('\\b(' + CHANNELS.join('|') + ')\\b', 'i');
const BASE = 'https://client.omsguru.com';
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const WAREHOUSE = 22452;            // DEFAULT 310803 (own warehouse) — same as the Easy Ship robot
const BATCH = 25;                   // orders per Pack request
const CONC = 3;                     // parallel page reads
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const pad = (n) => String(n).padStart(2, '0');
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
function slaToIso(text) {
  const m = String(text).match(/(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/i);
  return m ? `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}` : '';
}

// ---------- Firestore (aikm-oms-sync project, same as Easy Ship) ----------
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const mainRef = db.collection('aikm_admin').doc('marketplacePack');
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
async function status(patch) {
  try { await mainRef.set({ live: { runId: RUN_ID, updatedAt: new Date().toISOString(), ...patch } }, { merge: true }); } catch (e) { console.log('status write failed:', e.message); }
}

// ---------- OMS Guru session ----------
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}, tries = 5) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', signal: AbortSignal.timeout(60000), ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } });
      upd(r);
      if (r.status >= 500 && t < tries) { await r.arrayBuffer().catch(() => {}); await sleep(5000 * t); continue; }
      return { status: r.status, loc: r.headers.get('location'), ct: r.headers.get('content-type') || '', text: await r.text() };
    } catch (e) {
      if (t >= tries) throw e;
      await sleep(2000 * t);
    }
  }
}
async function login() {
  jar = {};
  await req('/login');
  const r = await req('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString(),
  });
  if (r.status !== 302) throw new Error(`OMS Guru login failed (status ${r.status})`);
  await req(`/orders/setCurWarehouse/${WAREHOUSE}`);
}
let TOKEN = '';
async function getToken() {
  const r = await req('/orders/recentLabels');
  const m = r.text.match(/name="data\[(?:Invoice|Click)\]\[oms_token\]" value="([^"]+)"/) || r.text.match(/name="oms_token" value="([^"]+)"/);
  if (!m) throw new Error('OMS Guru page changed — could not find the form token');
  TOKEN = m[1];
}
async function pool(items, fn, n = CONC) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e.message }; } }
  }));
  return out;
}

// ---------- 1. read New orders (all channels), keep Meesho / Snapdeal ----------
async function listNewOrders() {
  const rows = [];
  for (let p = 1; p <= 40; p++) {
    const r = await req(`/orders/newOrders/page:${p}`);
    if (r.status === 302) throw new Error('OMS Guru session expired while reading orders');
    if (/Please select a warehouse to continue/i.test(r.text)) throw new Error('OMS Guru asked to choose a warehouse — could not read orders');
    const $ = cheerio.load(r.text);
    const trs = $('table tbody tr').toArray();
    for (const tr of trs) {
      const $tr = $(tr);
      const vid = ($tr.find('a[href*="/orders/view/"]').attr('href') || '').split('/').pop();
      if (!vid) continue;
      const $cc = $tr.find('a[href*="channel_companies/edit/"]').first();
      const cc = ($cc.attr('href') || '').split('/').pop();
      const ccName = clean($cc.text());
      const txt = clean($tr.text());
      const chm = (ccName.match(CH_RX) || txt.match(CH_RX) || [])[1];
      rows.push({ vid, cc, ccName, channel: chm ? chm[0].toUpperCase() + chm.slice(1).toLowerCase() : '', sla: slaToIso(txt) });
    }
    if (trs.length < 300) break;
  }
  return rows;
}

// ---------- order detail page ----------
async function readOrder(vid) {
  const r = await req(`/orders/view/${vid}`);
  if (r.status === 302) throw new Error('session expired');
  if (r.status >= 400) throw new Error(`OMS Guru busy (HTTP ${r.status})`);
  const $ = cheerio.load(r.text);
  $('script,style').remove();
  const items = $('#order-items tr[data-id]').toArray().map((tr) => {
    const $tr = $(tr);
    const qty = parseInt((clean($tr.find('td').first().text()).match(/Qty:\s*(\d+)/) || [])[1] || '1', 10);
    return { sku: clean($tr.find('span.sku').first().text()), qty };
  });
  let labelId = '';
  $('a[href*="/orders/download/"]').each((_, a) => { if (/^\s*Shipping Label\s*$/i.test($(a).text())) labelId = ($(a).attr('href') || '').split('/').pop(); });
  const dd = {};
  $('dt').each((_, el) => { const k = clean($(el).text()).replace(/:$/, '').toLowerCase(); if (k && !(k in dd)) dd[k] = clean($(el).next('dd').text()); });
  let lastFail = '', lastFailAt = 0;
  $('table').each((_, t) => {
    if (!/Log Detail/i.test($(t).find('th').text())) return;
    $(t).find('tr').each((__, tr) => {
      const tds = $(tr).find('td'); if (tds.length < 2) return;
      const when = Date.parse(clean($(tds[0]).text()) + ' GMT+0530') || 0;
      if (when >= lastFailAt) { lastFailAt = when; lastFail = clean($(tr).text()).slice(0, 500); }
    });
  });
  const chKey = Object.keys(dd).find((k) => /channel/.test(k));
  const txt = clean($('body').text());
  return {
    channelText: (chKey ? dd[chKey] + ' ' : '') + ((txt.match(CH_RX) || [])[1] || ''),
    ddKeys: Object.keys(dd),
    orderId: clean(dd['order'] || '').split(' ')[0] || vid,
    awb: ((dd['shipment tracker'] || '').match(/[A-Z0-9]{6,}/i) || [])[0] || '',
    sla: slaToIso(dd['sla date'] || ''),
    items, labelId, lastFail, lastFailAt,
  };
}
function failReason(lastFail) {
  if (!lastFail) return '';
  const m = lastFail.match(/"message\\?"\s*:\s*\\?"([^"\\]+)/) || lastFail.match(/message[^A-Za-z]+([A-Za-z][^"\\}]{10,200})/);
  const c = lastFail.match(/"code\\?"\s*:\s*\\?"(\w+)/);
  return clean((c ? c[1] + ': ' : '') + (m ? m[1] : lastFail.replace(/^\S+ \d+, \d{4} [\d:]+ [AP]M\s*/, '')));
}

// ---------- 2. pack ----------
async function ajaxPost(path, params) {
  const r = await req(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', Referer: BASE + '/orders/newOrders' },
    body: params.toString(),
  });
  let j = null; try { j = JSON.parse(r.text); } catch (e) {}
  return { ...r, json: j };
}
async function waitTask(j, maxSec = 90) {
  if (!j || !j.id) return j;
  let last = j;
  for (let i = 0; i < Math.ceil(maxSec / 4); i++) {
    await sleep(4000);
    const r = await ajaxPost('/orders/rwtYet', new URLSearchParams({ id: j.id, command: j.command || '', task: j.task || 0 }));
    if (!r.json) continue;
    last = r.json;
    if (!r.json.more_request) return r.json;
  }
  return { ...last, timeout: true };
}
const bodyOf = (j, r) => (j && (j.body || j.html)) || (r && r.text) || '';
function formParams($, form) {
  const p = new URLSearchParams();
  form.find('input').each((_, el) => {
    const n = $(el).attr('name'); const t = ($(el).attr('type') || '').toLowerCase();
    if (!n || ((t === 'checkbox' || t === 'radio') && $(el).attr('checked') == null)) return;
    p.append(n, $(el).attr('value') || '');
  });
  form.find('select').each((_, el) => {
    const n = $(el).attr('name'); if (!n) return;
    const o = $(el).find('option[selected]').first().length ? $(el).find('option[selected]').first() : $(el).find('option').filter((__, x) => ($(x).attr('value') || '') !== '').first();
    p.append(n, o.attr('value') || '');
  });
  return p;
}
async function packBatch(vids) {
  // step 1 — same as ticking the orders and clicking "Pack Orders"
  const p1 = new URLSearchParams();
  p1.append('_method', 'POST'); p1.append('data[Click][oms_token]', TOKEN);
  p1.append('data[Click][command]', 'Pack Orders'); p1.append('data[Click][show_progress]', '1');
  vids.forEach((v) => p1.append('data[Invoice][][id]', v));
  const r1 = await ajaxPost('/orders/newOrders', p1);
  const j1 = r1.json && r1.json.id ? await waitTask(r1.json, 300) : r1.json;
  let html = bodyOf(j1, r1);
  const removed = [], notes = [];
  // step 1b — OMS may ask to confirm box size / weight (already filled from OMS product data)
  for (let guard = 0; guard < 2; guard++) {
    const $x = cheerio.load(html);
    const dims = $x('form#OrderExtraSkuDetailsForm').first();
    if (!dims.length) break;
    let allIds = (dims.find('input[name="data[Invoice][all_invoice_ids]"]').attr('value') || '').split(',').filter(Boolean);
    dims.find('tr[id^="row"]').each((_, tr) => {
      const id = ($x(tr).attr('id') || '').replace('row', '');
      const val = (k) => parseFloat($x(tr).find(`input[name$="[${k}]"]`).attr('value') || '0') || 0;
      if (!(val('length') > 0 && val('width') > 0 && val('height') > 0 && val('dead_weight') > 0)) {
        removed.push({ vid: id, reason: 'OMS has no box size / weight for this order — add it in OMS' });
        allIds = allIds.filter((x) => x !== id);
        $x(tr).remove();
      }
    });
    if (!allIds.length) return { ok: false, reason: 'OMS has no box size / weight for these orders', removed };
    const p = formParams($x, dims);
    p.set('data[Invoice][all_invoice_ids]', allIds.join(','));
    notes.push('confirmed box size / weight');
    const rx = await ajaxPost('/orders/newOrders', p);
    const jx = rx.json && rx.json.id ? await waitTask(rx.json, 120) : rx.json;
    html = bodyOf(jx, rx);
  }
  // step 2 — if OMS shows one more confirm form (e.g. pickup / courier), submit it with OMS's own defaults
  const $ = cheerio.load(html);
  const form = $('form#InvoiceNewOrdersForm').first();
  if (form.length) {
    const fields = form.find('input,select').toArray().map((e) => $(e).attr('name')).filter(Boolean);
    console.log('  OMS confirm step fields:', fields.filter((n) => !/token|_method/i.test(n)).join(', ').slice(0, 400));
    const p2 = formParams($, form);
    const r2 = await ajaxPost(form.attr('action') ? new URL(form.attr('action'), BASE).pathname : '/orders/newOrders', p2);
    const j2 = r2.json && r2.json.id ? await waitTask(r2.json, 60) : r2.json;
    notes.push('confirm step: ' + clean(cheerio.load(bodyOf(j2, r2)).text()).slice(0, 200));
  } else {
    notes.push(clean(cheerio.load(html).text()).slice(0, 200));
  }
  return { ok: true, msg: notes.join(' | '), removed };
}

// ---------- 3. labels ----------
async function downloadLabel(labelId) {
  for (let t = 1; t <= 3; t++) {
    const r = await req(`/orders/download/${labelId}`);
    if (r.loc && /^https?:/.test(r.loc) && !/omsguru\.com\/(login|users)/.test(r.loc)) {
      const s = await fetch(r.loc, { signal: AbortSignal.timeout(60000) });
      if (s.ok) { const b = Buffer.from(await s.arrayBuffer()); if (b.slice(0, 4).toString() === '%PDF') return b; }
    }
    await sleep(3000 * t);
  }
  throw new Error('label download failed');
}
async function sendPdf(fileName, bytes, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) { console.log('Telegram not set up — PDF not sent'); return false; }
  try {
    const fd = new FormData();
    fd.append('chat_id', chat); fd.append('caption', caption.slice(0, 1000));
    fd.append('document', new Blob([bytes], { type: 'application/pdf' }), fileName);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log('Telegram PDF not sent:', j.description || r.status);
    return !!j.ok;
  } catch (e) { console.log('Telegram PDF not sent:', e.message); return false; }
}

// ---------- main ----------
async function main() {
  const t0 = Date.now(), today = istToday();
  console.log(`Meesho/Snapdeal run ${RUN_ID} · ${today} · channels ${CHANNELS.join(', ')} · ${DRY ? 'DRY RUN (nothing will be packed)' : 'LIVE'}${LIMIT ? ` · limit ${LIMIT}` : ''}`);
  await status({ state: 'running', step: 'Logging into OMS Guru', dryRun: DRY, limit: LIMIT, trigger: TRIGGER, startedAt: new Date().toISOString() });
  await login(); await getToken();

  await status({ state: 'running', step: 'Reading New orders' });
  const all = await listNewOrders();
  // the OMS list shows only account numbers -> open one order per account to learn its channel
  const firstOf = {}; all.forEach((r) => { if (r.cc && !firstOf[r.cc]) firstOf[r.cc] = r; });
  const ccs = Object.keys(firstOf);
  const probe = await pool(ccs, (cc) => readOrder(firstOf[cc].vid));
  const ccChannel = {};
  ccs.forEach((cc, i) => {
    const d = probe[i] || {};
    const m = String(d.channelText || '').match(CH_RX);
    ccChannel[cc] = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '';
    if (i === 0) console.log('  order page fields:', (d.ddKeys || []).join(', ').slice(0, 300));
  });
  all.forEach((r) => { if (!r.channel) r.channel = ccChannel[r.cc] || ''; if (r.channel && !r.ccName) r.ccName = `${r.channel} ${r.cc}`; });
  const rows = all.filter((r) => r.channel);
  const byCh = {}; all.forEach((r) => { const k = `${r.cc}${ccChannel[r.cc] ? ' (' + ccChannel[r.cc] + ')' : ''}`; byCh[k] = (byCh[k] || 0) + 1; });
  console.log(`New orders in OMS: ${all.length} · ${CHANNELS.join('/')}: ${rows.length}`);
  Object.entries(byCh).forEach(([k, n]) => console.log(`  ${k}: ${n}${/\(/.test(k) ? '  <- processed' : ''}`));

  const details = await pool(rows, (r) => readOrder(r.vid));
  const ready = [], check = [];
  rows.forEach((r, i) => {
    const d = details[i] || {};
    if (d.error) { check.push({ ...r, reason: 'Could not open order page: ' + d.error }); return; }
    const o = { ...r, ...d, sla: d.sla || r.sla, account: r.ccName || r.channel };
    if (o.labelId) { check.push({ ...o, reason: 'Already has a label but is still in New' }); return; }
    ready.push(o);
  });
  let toPack = ready.sort((a, b) => (a.sla + a.cc).localeCompare(b.sla + b.cc));
  if (LIMIT) toPack = toPack.slice(0, LIMIT);
  console.log(`To pack: ${toPack.length} · check manually: ${check.length}`);
  const sku = (o) => (o.items || []).map((x) => `${x.sku} ×${x.qty}`).join(', ');

  if (DRY) {
    const acc = {}; toPack.forEach((o) => { acc[o.account] = (acc[o.account] || 0) + 1; });
    Object.entries(acc).forEach(([k, n]) => console.log(`  would pack ${k}: ${n}`));
    toPack.slice(0, 20).forEach((o) => console.log(`  ${o.orderId} · ${o.account} · SLA ${o.sla} · ${sku(o)}${o.lastFail ? ' · earlier OMS error: ' + failReason(o.lastFail).slice(0, 120) : ''}`));
    await mainRef.set({ live: { runId: RUN_ID, state: 'done', step: 'Dry run finished', updatedAt: new Date().toISOString() },
      lastDry: { runId: RUN_ID, at: new Date().toISOString(), wouldPack: toPack.length, byAccount: acc, check: check.map((c) => ({ orderId: c.orderId || c.vid, account: c.account || c.ccName, reason: c.reason })) } }, { merge: true });
    console.log('Dry run done.');
    return;
  }

  // ---- pack, grouped by account ----
  const groups = {};
  toPack.forEach((o) => { (groups[o.cc] = groups[o.cc] || []).push(o); });
  for (const list of Object.values(groups)) {
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      await status({ state: 'running', step: `Packing ${part[0].account} — ${part.length} orders` });
      let res;
      try { res = await packBatch(part.map((o) => o.vid)); } catch (e) { res = { ok: false, reason: 'Pack request error: ' + e.message }; }
      if (!res.ok && /session|login/i.test(res.reason || '')) { await login(); await getToken(); res = await packBatch(part.map((o) => o.vid)); }
      (res.removed || []).forEach((rm) => { const o = part.find((x) => x.vid === rm.vid); if (o) o.packError = rm.reason; });
      if (!res.ok) part.forEach((o) => { if (!o.packError) o.packError = res.reason; });
      console.log(`Batch ${part[0].account} ×${part.length}: ${res.ok ? 'sent — ' + res.msg : 'NOT packed — ' + res.reason}`);
      await sleep(1500);
    }
  }

  // ---- verify: wait for OMS to show the label ----
  const pending = toPack.filter((o) => !o.packError);
  const startStamp = Date.now();
  for (let round = 0; round < 20 && pending.some((o) => !o.final); round++) {
    await status({ state: 'running', step: `Waiting for labels — ${pending.filter((o) => o.final).length}/${pending.length} ready` });
    if (round) await sleep(45000);
    const open = pending.filter((o) => !o.final);
    const res = await pool(open, (o) => readOrder(o.vid));
    open.forEach((o, i) => {
      const d = res[i]; if (!d || d.error) return;
      if (d.labelId) { Object.assign(o, d, { final: 'packed' }); return; }
      // OMS may log an error and still finish (e.g. Meesho not READY_TO_SHIP yet) — remember it, keep waiting for the label
      if (d.lastFailAt && d.lastFailAt >= t0 - 60000) o.packError = failReason(d.lastFail);
    });
    if (Date.now() - startStamp > 15 * 60000) break;
  }
  pending.forEach((o) => { if (!o.final) { o.final = 'failed'; o.packError = (o.packError ? o.packError + ' · ' : '') + 'no label after 15 minutes — check this order in OMS'; } });
  const packed = toPack.filter((o) => o.final === 'packed');
  const failed = toPack.filter((o) => o.final !== 'packed');
  console.log(`Packed with label: ${packed.length} · failed: ${failed.length}`);
  const why = {}; failed.forEach((o) => { const k = (o.packError || 'unknown').slice(0, 160); why[k] = (why[k] || 0) + 1; });
  Object.entries(why).forEach(([k, n]) => console.log(`  failed ×${n}: ${k}`));

  // ---- labels: one PDF per account, sorted by product → Telegram ----
  await status({ state: 'running', step: `Downloading ${packed.length} labels` });
  const byAcc = {}; packed.forEach((o) => { (byAcc[o.account] = byAcc[o.account] || []).push(o); });
  const files = {};
  for (const [acc, list] of Object.entries(byAcc)) {
    list.sort((a, b) => ((a.items[0] || {}).sku || '').localeCompare((b.items[0] || {}).sku || '') || String(a.orderId).localeCompare(String(b.orderId)));
    const pdfs = await pool(list, (o) => downloadLabel(o.labelId));
    const merged = await PDFDocument.create();
    let pages = 0; const missing = [];
    for (let i = 0; i < list.length; i++) {
      const b = pdfs[i];
      if (!b || b.error) { missing.push(list[i].orderId); continue; }
      const src = await PDFDocument.load(b, { ignoreEncryption: true });
      const cp = await merged.copyPages(src, src.getPageIndices());
      cp.forEach((p) => merged.addPage(p)); pages += cp.length;
    }
    const fileName = `${acc.replace(/\W+/g, '_')}_${today}.pdf`;
    let sent = false;
    if (pages) { const bytes = Buffer.from(await merged.save({ useObjectStreams: true })); sent = await sendPdf(fileName, bytes, `${acc} — ${list.length} orders, ${pages} labels (${today})`); }
    files[acc] = { orders: list.length, pages, missing, sentToTelegram: sent, fileName };
    console.log(`${acc}: ${pages} label pages${missing.length ? ' · missing ' + missing.length : ''}${sent ? ' · sent to Telegram' : ''}`);
  }

  const pick = {}; packed.forEach((o) => o.items.forEach((x) => { pick[x.sku] = (pick[x.sku] || 0) + x.qty; }));
  const picklist = Object.entries(pick).sort((a, b) => b[1] - a[1]);
  const lines = [`📦 Meesho + Snapdeal — ${today}`, `Packed: ${packed.length} · Failed: ${failed.length} · Check: ${check.length}`];
  Object.entries(files).forEach(([a, f]) => lines.push(`• ${a}: ${f.orders} orders${f.missing.length ? ` (${f.missing.length} labels missing)` : ''}`));
  if (picklist.length) { lines.push('', 'Picklist:'); picklist.slice(0, 60).forEach(([s, q]) => lines.push(`${q} × ${s}`)); }
  if (failed.length) { lines.push('', 'Not packed:'); failed.slice(0, 25).forEach((o) => lines.push(`${o.orderId} (${o.account}) — ${(o.packError || '').slice(0, 90)}`)); }
  if (check.length) { lines.push('', 'Check in OMS:'); check.slice(0, 15).forEach((o) => lines.push(`${o.orderId || o.vid} (${o.account || o.ccName}) — ${o.reason}`)); }
  if (toPack.length || check.length) await notify(lines.join('\n'));

  const summary = {
    runId: RUN_ID, date: today, trigger: TRIGGER, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(),
    packed: packed.length, files,
    picklist: picklist.map(([s, q]) => ({ sku: s, qty: q })),
    failed: failed.map((o) => ({ orderId: o.orderId, account: o.account, sku: sku(o), reason: o.packError })),
    check: check.map((c) => ({ orderId: c.orderId || c.vid, account: c.account || c.ccName, reason: c.reason })),
  };
  await mainRef.set({ last: summary, live: { runId: RUN_ID, state: 'done', step: `Done — ${packed.length} packed, ${failed.length} failed`, updatedAt: summary.finishedAt } }, { merge: true });
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s.`);
}

main().catch(async (e) => {
  console.error('MEESHO/SNAPDEAL RUN FAILED:', e.message);
  await status({ state: 'failed', step: 'Failed: ' + e.message });
  process.exit(1);
});
