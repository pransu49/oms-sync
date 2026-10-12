// easyship.js — AIKM Easy Ship robot (OMS Guru)
// Every run:
//   1. Logs into OMS Guru and reads the "New" orders of the 5 Amazon accounts
//   2. Easy Ship order = NO "Self Fulfilled Order" tag AND buyer phone = NA (both must agree,
//      otherwise the order goes to the "Check manually" list and is NOT touched)
//   3. Takes only orders whose SLA date is today (or already passed)
//   4. Packs them in OMS Guru with the 2:00 PM pickup slot ON the SLA date (today for overdue) — never earlier
//   5. Downloads every label, merges them into one PDF per account (sorted by product),
//      and saves the PDFs + a summary (picklist, failed list) to the console's Firestore
//
// Settings (workflow inputs / env):
//   DRY_RUN=true   -> only lists what it WOULD pack (nothing is packed)
//   LIMIT=1        -> pack at most this many orders (0 = no limit) — used for test runs
//   SLA_DATE=YYYY-MM-DD -> process this SLA date instead of today (IST)
//
// Privacy: this repo is public, so logs show counts and order ids only — never buyer details.

const cheerio = require('cheerio');
const { PDFDocument } = require('pdf-lib');
const admin = require('firebase-admin');

const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD;
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || 0;
const TRIGGER = process.env.TRIGGER || 'manual';
const COLLECT = String(process.env.COLLECT || '').toLowerCase() === 'true';   // labels only: no packing
const BASE = 'https://client.omsguru.com';
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const ACCOUNTS = { 45608: 'AIKM Pharma', 45614: 'E Commerce Munda', 45619: 'Praso Enterprises', 45611: 'Sasta Store', 45616: 'Vishal E Commerce' };
const WAREHOUSE = 22452;            // DEFAULT 310803 (own warehouse)
const SLOT_TIME = '2:00 PM';
const MAX_QTY = 4;                  // skip orders with more than 4 units in total
const MAX_WEIGHT_G = 3000;          // skip orders heavier than 3 kg (OMS weight)        // pickup slot start — always the 2 PM slot
const BATCH = 25;                   // orders per Pack request
const CONC = 3;                     // parallel page reads (OMS 'busy' replies are retried)
const KEEP_RUNS = 3;                // label PDFs kept in Firestore for the last N runs
const CHUNK = 900 * 1024;           // Firestore doc limit is 1 MB

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const pad = (n) => String(n).padStart(2, '0');
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const istToday = () => istNow().toISOString().slice(0, 10);
const TARGET = /^\d{4}-\d{2}-\d{2}$/.test(process.env.SLA_DATE || '') ? process.env.SLA_DATE : istToday();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function slaToIso(text) {
  const m = String(text).match(/(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/i);
  return m ? `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}` : '';
}

// ---------- Firestore (console project) ----------
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const mainRef = db.collection('aikm_admin').doc('easyShip');
const labelsCol = mainRef.collection('labels');
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
      // OMS Guru is busy (502/503/504) — wait and try again instead of failing the order
      if (r.status >= 500 && t < tries) { await r.arrayBuffer().catch(() => {}); await sleep(5000 * t); continue; }
      const buf = opt.raw ? Buffer.from(await r.arrayBuffer()) : null;
      return { status: r.status, loc: r.headers.get('location'), ct: r.headers.get('content-type') || '', text: buf ? '' : await r.text(), buf };
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
  await req(`/orders/setCurWarehouse/${WAREHOUSE}`);   // order pages need a warehouse chosen (DEFAULT 310803)
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

// ---------- 1. read New orders ----------
async function listNewOrders(page = 'newOrders') {
  const filter = encodeURIComponent(JSON.stringify({ channel_company_id: Object.fromEntries(Object.keys(ACCOUNTS).map((id, i) => [String(i), id])) }));
  const rows = [];
  for (let p = 1; p <= 40; p++) {
    const r = await req(`/orders/${page}/page:${p}?filter=${filter}`);
    if (r.status === 302) throw new Error('OMS Guru session expired while reading orders');
    if (/Please select a warehouse to continue/i.test(r.text)) throw new Error('OMS Guru asked to choose a warehouse — could not read orders');
    const $ = cheerio.load(r.text);
    const trs = $('table tbody tr').toArray();
    for (const tr of trs) {
      const $tr = $(tr);
      const vid = ($tr.find('a[href*="/orders/view/"]').attr('href') || '').split('/').pop();
      if (!vid) continue;
      const cc = ($tr.find('a[href*="channel_companies/edit/"]').attr('href') || '').split('/').pop();
      const txt = clean($tr.text());
      rows.push({
        vid, cc, account: ACCOUNTS[cc] || cc,
        selfShip: /Self Fulfilled Order/i.test(txt),
        sla: slaToIso(txt),
        orderId: (txt.match(/OrderID\s*([0-9]{3}-[0-9]{7}-[0-9]{7})/) || [])[1] || '',
      });
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
  const txt = clean($('body').text());
  const items = $('#order-items tr[data-id]').toArray().map((tr) => {
    const $tr = $(tr);
    const qty = parseInt((clean($tr.find('td').first().text()).match(/Qty:\s*(\d+)/) || [])[1] || '1', 10);
    const sku = clean($tr.find('span.sku').first().text());
    return { sku, qty };
  });
  let labelId = '';
  $('a[href*="/orders/download/"]').each((_, a) => { if (/^\s*Shipping Label\s*$/i.test($(a).text())) labelId = ($(a).attr('href') || '').split('/').pop(); });
  // dt/dd pairs (x-editable shows "Empty" only in the browser, so read the real values)
  const dd = {};
  $('dt').each((_, el) => { const k = clean($(el).text()).replace(/:$/, '').toLowerCase(); if (k && !(k in dd)) dd[k] = clean($(el).next('dd').text()); });
  const inv = dd['invoice number'] || '';
  // newest row of the "Invoice Failed Logs" table
  let lastFail = '', lastFailAt = 0;
  $('table').each((_, t) => {
    if (!/Log Detail/i.test($(t).find('th').text())) return;
    $(t).find('tr').each((__, tr) => {
      const tds = $(tr).find('td'); if (tds.length < 2) return;
      const rowTxt = clean($(tr).text());
      const when = Date.parse(clean($(tds[0]).text()) + ' GMT+0530') || 0;
      if (when >= lastFailAt) { lastFailAt = when; lastFail = rowTxt.slice(0, 500); }
    });
  });
  return {
    orderId: ((dd['order'] || '').match(/\d{3}-\d{7}-\d{7}/) || [])[0] || '',
    phone: (txt.match(/Phone:\s*(\S+)/) || [])[1] || '',
    invoice: /^(empty|0)?$/i.test(inv) ? '' : inv,
    awb: ((dd['shipment tracker'] || '').match(/\d{6,}/) || [])[0] || '',
    sla: slaToIso(dd['sla date'] || ''),
    weightG: toGrams($('a[data-name="dead_weight"]').first().text() || dd['weight']), volWeightG: toGrams(dd['vol weight']),
    items, labelId, lastFail, lastFailAt,
  };
}
function toGrams(v) {
  const m = String(v || '').match(/([\d.]+)\s*(kg|kgs|g|gm|gms|grams)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  return /^kg/i.test(m[2] || '') ? n * 1000 : n;
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
// OMS Guru long tasks: keep asking "/orders/rwtYet" until it says done
async function waitTask(j, maxSec = 90) {
  if (!j || !j.id) return j;
  let last = j;
  for (let i = 0; i < Math.ceil(maxSec / 4); i++) {
    await sleep(4000);
    const b = new URLSearchParams({ id: j.id, command: j.command || '', task: j.task || 0 });
    const r = await ajaxPost('/orders/rwtYet', b);
    if (!r.json) continue;
    last = r.json;
    if (!r.json.more_request) return r.json;
  }
  return { ...last, timeout: true };
}
async function packBatch(vids, slotDate) {
  // step 1 — same as ticking the orders and clicking "Pack Orders" → OMS asks for the Easy Ship pickup slot
  const p1 = new URLSearchParams();
  p1.append('_method', 'POST'); p1.append('data[Click][oms_token]', TOKEN);
  p1.append('data[Click][command]', 'Pack Orders'); p1.append('data[Click][show_progress]', '1');
  vids.forEach((v) => p1.append('data[Invoice][][id]', v));
  let r1 = await ajaxPost('/orders/newOrders', p1);
  let j1 = r1.json && r1.json.id ? await waitTask(r1.json, 120) : r1.json;
  let html = (j1 && (j1.body || j1.html)) || r1.text || '';
  const removed = [];   // orders OMS could not size → left out of this batch
  // step 1b — orders with 2+ units: OMS shows a "shipping weight and dimensions" screen,
  // already filled in from the OMS product data. Confirm those OMS values as they are.
  // An order is only left out if OMS has no size/weight for it.
  for (let guard = 0; guard < 2 && !cheerio.load(html)('form#InvoiceNewOrdersForm select[name="data[Invoice][easyship_date]"]').length; guard++) {
    const $x = cheerio.load(html);
    const dims = $x('form#OrderExtraSkuDetailsForm').first();
    if (!dims.length) break;
    const p = new URLSearchParams();
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
    dims.find('input').each((_, el) => { const n = $x(el).attr('name'); if (n) p.append(n, $x(el).attr('value') || ''); });
    p.set('data[Invoice][all_invoice_ids]', allIds.join(','));
    const rx = await ajaxPost('/orders/newOrders', p);
    const jx = rx.json && rx.json.id ? await waitTask(rx.json, 120) : rx.json;
    html = (jx && (jx.body || jx.html)) || rx.text || '';
  }
  const $ = cheerio.load(html);
  const form = $('form#InvoiceNewOrdersForm').first();
  const sel = form.find('select[name="data[Invoice][easyship_date]"]');
  if (process.env.PROBE === 'true') {
    const fs = require('fs');
    fs.writeFileSync('probe.html', html);
    const $$ = cheerio.load(html);
    console.log('PROBE forms:', $$('form').length);
    $$('form').each((i, f) => {
      console.log(`PROBE form#${i} action=${$$(f).attr('action')} id=${$$(f).attr('id')}`);
      $$(f).find('input,select,textarea,button').slice(0, 40).each((_, e) => console.log('  ', e.tagName, $$(e).attr('name') || '', $$(e).attr('type') || '', ($$(e).attr('value') || $$(e).find('option:selected').text() || '').slice(0, 40), $$(e).attr('class') || ''));
    });
    console.log('PROBE text:', clean($$.text()).slice(0, 1500));
    console.log('PROBE html:', html.replace(/\s+/g, ' ').slice(0, 4000));
    await mainRef.set({ live: { runId: RUN_ID, state: 'done', step: 'Check finished', updatedAt: new Date().toISOString() } }, { merge: true });
    process.exit(0);
  }
  if (!form.length || !sel.length) {
    return { ok: false, reason: 'OMS did not show the Easy Ship pickup-slot step: ' + clean(cheerio.load(html).text()).slice(0, 200), removed };
  }
  const opts = sel.find('option').toArray().map((o) => $(o).attr('value') || '');
  const want = `${slotDate} @ ${SLOT_TIME}`;
  const slot = opts.find((v) => v.trim() === want);
  if (!slot) return { ok: false, reason: `No 2 PM pickup slot offered on ${slotDate}`, slotsOffered: opts.slice(0, 8), removed };
  // step 2 — pick the 2 PM slot and confirm
  const p2 = new URLSearchParams();
  form.find('input').each((_, el) => { const n = $(el).attr('name'); if (n) p2.append(n, $(el).attr('value') || ''); });
  p2.set('data[Invoice][easyship_date]', slot);
  let r2 = await ajaxPost(form.attr('action') ? new URL(form.attr('action'), BASE).pathname : '/orders/newOrders', p2);
  // OMS keeps working in the background; the label check below confirms each order, so don't wait long here
  const j2 = r2.json && r2.json.id ? await waitTask(r2.json, 60) : r2.json;
  const msg = clean(cheerio.load((j2 && (j2.html || j2.body || j2.title)) || r2.text || '').text()).slice(0, 300);
  return { ok: true, slot, msg, httpStatus: r2.status, removed };
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
async function saveLabels(account, pdfBytes) {
  const parts = Math.ceil(pdfBytes.length / CHUNK);
  const ids = [];
  for (let i = 0; i < parts; i++) {
    const id = `${RUN_ID}_${account.replace(/\W+/g, '')}_${i}`;
    await labelsCol.doc(id).set({ runId: RUN_ID, account, part: i, parts, data: pdfBytes.subarray(i * CHUNK, (i + 1) * CHUNK) });
    ids.push(id);
  }
  return ids;
}
async function pruneOldLabels(keepRunIds) {
  const snap = await labelsCol.select('runId').get();
  const batch = db.batch(); let n = 0;
  snap.forEach((d) => { if (!keepRunIds.includes(d.get('runId'))) { batch.delete(d.ref); n++; } });
  if (n) await batch.commit();
  return n;
}

// ---------- main ----------
async function main() {
  const t0 = Date.now();
  console.log(`Easy Ship run ${RUN_ID} · SLA date ${TARGET} · ${DRY ? 'DRY RUN (nothing will be packed)' : 'LIVE'}${LIMIT ? ` · limit ${LIMIT}` : ''}`);
  await status({ state: 'running', step: 'Logging into OMS Guru', target: TARGET, dryRun: DRY, limit: LIMIT, trigger: TRIGGER, startedAt: new Date().toISOString() });
  await login(); await getToken();

  if (COLLECT) {
    // labels only — orders already packed (Ready To Ship) for this SLA date
    await status({ state: 'running', step: `Collecting labels for SLA ${TARGET}` });
    const rtsAll = [...(await listNewOrders('dispatchOrders')), ...(await listNewOrders('packOrders'))];
    const seen = new Set(); const rts = rtsAll.filter((r) => !r.selfShip && r.sla === TARGET && !seen.has(r.vid) && seen.add(r.vid));
    const det = await pool(rts, (r) => readOrder(r.vid));
    const got = [];
    rts.forEach((r, i) => { const d = det[i]; if (d && !d.error && d.labelId && /^NA$/i.test(d.phone)) got.push({ ...r, ...d, final: 'packed' }); });
    console.log(`Packed / Ready To Ship (SLA ${TARGET}, Easy Ship): ${rts.length} orders · ${got.length} with labels`);
    const byA = {}; rts.forEach((r, i) => { const d = det[i] || {}; const k = `${r.account} ${d.labelId ? 'label' : 'NO label'}`; byA[k] = (byA[k] || 0) + 1; });
    Object.entries(byA).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
    const summary = { runId: RUN_ID, target: TARGET, dryRun: false, limit: 0, trigger: TRIGGER, collect: true, startedAt: new Date(t0).toISOString(), found: got.length, check: [], skipped: [] };
    return finish(summary, got, [], [], t0);
  }

  await status({ state: 'running', step: 'Reading New orders' });
  const rows = await listNewOrders();
  const notSelf = rows.filter((r) => !r.selfShip);
  // upcoming Easy Ship workload by SLA date (from the list — quick view)
  const upcoming = {};
  notSelf.forEach((r) => { const k = r.sla || 'unknown'; upcoming[k] = upcoming[k] || { total: 0, byAccount: {} }; upcoming[k].total++; upcoming[k].byAccount[r.account] = (upcoming[k].byAccount[r.account] || 0) + 1; });
  const due = notSelf.filter((r) => r.sla && (TARGET === istToday() ? r.sla <= TARGET : r.sla === TARGET));
  console.log(`New Amazon orders: ${rows.length} · without Self-Fulfilled tag: ${notSelf.length} · due by ${TARGET}: ${due.length}`);

  // confirm each due order on its detail page (phone must be NA)
  await status({ state: 'running', step: `Checking ${due.length} due orders` });
  const details = await pool(due, (r) => readOrder(r.vid));
  const easy = [], check = [], skipped = [];
  due.forEach((r, i) => {
    const d = details[i] || {};
    if (d.error) { check.push({ ...r, reason: 'Could not open order page: ' + d.error }); return; }
    const o = { ...r, ...d, sla: d.sla || r.sla, orderId: d.orderId || r.orderId };
    if (o.invoice || o.labelId) { check.push({ ...o, reason: 'Already has an invoice/label but is still in New' }); return; }
    if (!/^NA$/i.test(o.phone)) { check.push({ ...o, reason: 'Buyer mobile present — looks like Self-Ship, not packed' }); return; }
    const units = (o.items || []).reduce((a, x) => a + (x.qty || 0), 0);
    if (units > MAX_QTY || o.weightG > MAX_WEIGHT_G) {
      skipped.push({ ...o, reason: [units > MAX_QTY ? `${units} units (more than ${MAX_QTY})` : '', o.weightG > MAX_WEIGHT_G ? `${(o.weightG / 1000).toFixed(2)} kg (more than 3 kg)` : ''].filter(Boolean).join(' · ') });
      return;
    }
    easy.push(o);
  });
  if (process.env.PROBE === 'true') { const want = (process.env.PROBE_VIDS || '').split(',').filter(Boolean); if (want.length) { const res = await packBatch(want, TARGET); console.log(res); return; } }
  let toPack = easy.sort((a, b) => (a.sla + a.cc).localeCompare(b.sla + b.cc));
  if (LIMIT) toPack = toPack.slice(0, LIMIT);
  console.log(`Confirmed Easy Ship: ${easy.length} · skipped (qty>4 or >3 kg): ${skipped.length} · check manually: ${check.length} · will pack: ${toPack.length}`);

  const summary = {
    runId: RUN_ID, target: TARGET, dryRun: DRY, limit: LIMIT, trigger: TRIGGER,
    startedAt: new Date(t0).toISOString(), upcoming,
    found: easy.length,
    skipped: skipped.map((c) => ({ orderId: c.orderId, account: c.account, sla: c.sla, sku: (c.items || []).map((x) => `${x.sku} ×${x.qty}`).join(', '), reason: c.reason })),
    check: check.map((c) => ({ orderId: c.orderId, account: c.account, sla: c.sla, sku: (c.items || []).map((x) => `${x.sku} ×${x.qty}`).join(', '), reason: c.reason })),
  };

  if (DRY) {
    summary.packed = 0; summary.failed = [];
    summary.preview = toPack.map((o) => ({ orderId: o.orderId, account: o.account, sla: o.sla, sku: o.items.map((x) => `${x.sku} ×${x.qty}`).join(', '), lastError: failReason(o.lastFail) }));
    const lastErr = {}; toPack.forEach((o) => { const k = o.lastFail ? failReason(o.lastFail).slice(0, 160) : ''; if (k) lastErr[`${o.account} — ${k}`] = (lastErr[`${o.account} — ${k}`] || 0) + 1; });
    Object.entries(lastErr).forEach(([k, n]) => console.log(`  earlier OMS error ×${n}: ${k}`));
    summary.byAccount = {}; toPack.forEach((o) => { summary.byAccount[o.account] = summary.byAccount[o.account] || { packed: 0, wouldPack: 0, labels: 0 }; summary.byAccount[o.account].wouldPack++; });
    summary.finishedAt = new Date().toISOString(); summary.state = 'done';
    await mainRef.set({ live: { runId: RUN_ID, state: 'done', step: 'Dry run finished', updatedAt: summary.finishedAt }, lastDry: summary }, { merge: true });
    console.log('Dry run done.');
    return;
  }

  // ---- pack, grouped by account + slot date ----
  const groups = {};
  toPack.forEach((o) => { const slotDate = o.sla < istToday() ? istToday() : o.sla; const k = o.cc + '|' + slotDate; (groups[k] = groups[k] || { cc: o.cc, slotDate, list: [] }).list.push(o); });
  const batchNotes = [];
  let done = 0;
  for (const g of Object.values(groups)) {
    for (let i = 0; i < g.list.length; i += BATCH) {
      const part = g.list.slice(i, i + BATCH);
      await status({ state: 'running', step: `Packing ${ACCOUNTS[g.cc]} — ${done + part.length}/${toPack.length}` });
      let res;
      try { res = await packBatch(part.map((o) => o.vid), g.slotDate); }
      catch (e) { res = { ok: false, reason: 'Pack request error: ' + e.message }; }
      if (!res.ok && /\b50[234]\b|Temporarily Unavailable|busy/i.test(res.reason || '')) { await sleep(30000); res = await packBatch(part.map((o) => o.vid), g.slotDate); }
      if (!res.ok && /session|login/i.test(res.reason || '')) { await login(); await getToken(); res = await packBatch(part.map((o) => o.vid), g.slotDate); }
      batchNotes.push({ account: ACCOUNTS[g.cc], slotDate: g.slotDate, orders: part.length, ok: res.ok, reason: res.reason || '', msg: res.msg || '' });
      (res.removed || []).forEach((rm) => { const o = part.find((x) => x.vid === rm.vid); if (o) o.packError = rm.reason; });
      if (!res.ok) part.forEach((o) => { if (!o.packError) o.packError = res.reason; });
      console.log(`Batch ${ACCOUNTS[g.cc]} ${g.slotDate} ×${part.length}: ${res.ok ? 'sent (' + res.slot + ')' : 'NOT packed — ' + res.reason}`);
      done += part.length;
      await sleep(1500);
    }
  }

  // ---- verify: wait for OMS to generate invoice + label ----
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
      if (d.lastFailAt && d.lastFailAt >= t0 - 60000) { Object.assign(o, d, { final: 'failed', packError: failReason(d.lastFail) }); }
    });
    if (Date.now() - startStamp > 15 * 60000) break;
  }
  pending.forEach((o) => { if (!o.final) { o.final = 'failed'; o.packError = o.packError || 'No label after 15 minutes — check this order in OMS'; } });
  const packed = toPack.filter((o) => o.final === 'packed');
  const failed = toPack.filter((o) => o.final !== 'packed');
  console.log(`Packed with label: ${packed.length} · failed: ${failed.length}`);
  const why = {}; failed.forEach((o) => { const k = (o.packError || 'unknown').slice(0, 160); why[k] = (why[k] || 0) + 1; });
  Object.entries(why).forEach(([k, n]) => console.log(`  failed ×${n}: ${k}`));

  await finish(summary, packed, failed, batchNotes, t0);
}

async function finish(summary, packed, failed, batchNotes, t0) {
  // ---- labels: one PDF per account, sorted by product ----
  await status({ state: 'running', step: `Downloading ${packed.length} labels` });
  const byAcc = {};
  packed.forEach((o) => { (byAcc[o.account] = byAcc[o.account] || []).push(o); });
  summary.byAccount = {}; summary.labelFiles = {};
  for (const [acc, list] of Object.entries(byAcc)) {
    list.sort((a, b) => ((a.items[0] || {}).sku || '').localeCompare((b.items[0] || {}).sku || '') || a.orderId.localeCompare(b.orderId));
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
    const bytes = Buffer.from(await merged.save({ useObjectStreams: true }));
    const ids = pages ? await saveLabels(acc, bytes) : [];
    summary.labelFiles[acc] = { docIds: ids, pages, sizeKB: Math.round(bytes.length / 1024), fileName: `EasyShip_${acc.replace(/\W+/g, '')}_SLA-${TARGET}.pdf` };
    summary.byAccount[acc] = { packed: list.length, labels: pages, missingLabels: missing };
    console.log(`${acc}: ${pages} label pages (${Math.round(bytes.length / 1024)} KB)${missing.length ? ' · missing ' + missing.length : ''}`);
  }
  failed.forEach((o) => { summary.byAccount[o.account] = summary.byAccount[o.account] || { packed: 0, labels: 0, missingLabels: [] }; summary.byAccount[o.account].failed = (summary.byAccount[o.account].failed || 0) + 1; });

  // picklist (what to pull from the shelf)
  const pick = {};
  packed.forEach((o) => o.items.forEach((x) => { pick[x.sku] = (pick[x.sku] || 0) + x.qty; }));
  summary.picklist = Object.entries(pick).sort((a, b) => b[1] - a[1]).map(([sku, qty]) => ({ sku, qty }));
  summary.packed = packed.length;
  summary.packedOrders = packed.map((o) => ({ orderId: o.orderId, account: o.account, sla: o.sla, awb: o.awb, invoice: o.invoice, sku: o.items.map((x) => `${x.sku} ×${x.qty}`).join(', ') }));
  summary.failed = failed.map((o) => ({ orderId: o.orderId, account: o.account, sla: o.sla, sku: (o.items || []).map((x) => `${x.sku} ×${x.qty}`).join(', '), reason: o.packError }));
  summary.batches = batchNotes;
  summary.finishedAt = new Date().toISOString();
  summary.state = 'done';

  // keep the last few runs, drop older label files
  const prev = await mainRef.get();
  const history = ((prev.exists && prev.get('history')) || []).filter((h) => h.runId !== RUN_ID);
  const keep = [{ runId: RUN_ID, target: TARGET, packed: packed.length, failed: failed.length, finishedAt: summary.finishedAt, labelFiles: summary.labelFiles }, ...history].slice(0, KEEP_RUNS);
  await mainRef.set({ last: summary, history: keep, live: { runId: RUN_ID, state: 'done', step: `Done — ${packed.length} packed, ${failed.length} failed`, updatedAt: summary.finishedAt } }, { merge: true });
  const removed = await pruneOldLabels(keep.map((h) => h.runId));
  console.log(`Saved. Old label parts removed: ${removed}. Took ${Math.round((Date.now() - t0) / 1000)}s.`);
}

main().catch(async (e) => {
  console.error('EASY SHIP RUN FAILED:', e.message);
  await status({ state: 'failed', step: 'Failed: ' + e.message });
  process.exit(1);
});
