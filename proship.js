try { require('./fb-meter'); } catch (e) {} // Firebase usage meter (counts only)
// proship.js — ProShip (Prozo, proship.in) courier robot for Amazon self-ship orders (owner 13 Nov 2026).
//
// Started by the console (Self-Ship -> ProShip) through GitHub Actions (workflow proship.yml). MODE =
//   check  : sign in + read live rates for a few routes. Creates NOTHING. -> aikm_admin/proshipCheck
//   ship   : JOB_ID = proshipJobs/<id> { ids:{orderId:weightKg}, box:{l,b,h}, pickup:{...} } -> creates the shipments
//   sync   : refresh the status of live ProShip AWBs (delivered / RTO / cancelled)
//   cancel : AWBS = "awb1,awb2" -> cancels those shipments
//   selftest : ONLY on ProShip's sandbox (proshipdev.prozo.com, secrets PROSHIP_SANDBOX_*): creates ONE dummy order (made-up buyer),
//              reads its label + tracking, cancels it and prints ProShip's real answers. Touches no Firebase data and no real order.
//
// Auth: PROSHIP_USERNAME + PROSHIP_PASSWORD (GitHub secrets) — an API user made in ProShip -> Settings -> Manage Users.
// API docs: https://documenter.getpostman.com/view/27749698/2s93mBwyZ1
//
// Safety:
//   - order details are read FRESH from OMS Guru data here (not from the browser): cancelled orders, orders that
//     already have an AWB (OMS / NimbusPost / Zippy / ProShip) are skipped, so nothing ships twice.
//   - ProShip "reference" = Amazon order id (must be unique in ProShip) — a repeat is rejected by ProShip itself.
//
// Firebase (main project): 1 doc aikm_admin/proshipIndex { data: JSON {orderId:{a,c,s,st,t}} } — same shape as zippyIndex,
// read by oms-push-tracking.js + amazon-confirm.js + the console. ship: ~4 reads + OMS chunks, ~3 + N/10 writes per job.

const https = require('https');
const admin = require('firebase-admin');

const BASE = (process.env.PROSHIP_BASE || 'https://proship.prozo.com').replace(/\/+$/, '');
const USER = (process.env.PROSHIP_USERNAME || '').trim();
const PASS = process.env.PROSHIP_PASSWORD || '';
const MODE = (process.env.MODE || 'check').trim().toLowerCase();
const JOB_ID = (process.env.JOB_ID || '').trim();
const KEEP_DAYS = 45;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; };
const r2 = (n) => Math.round(n * 100) / 100;
const phone10 = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.length > 10) d = d.slice(-10); return d; };
const account = (ch) => String(ch || '').replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, '').trim();
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/* ---------------------------------------------------------------- ProShip API */
let token = '';
async function signin() {
  if (!USER || !PASS) throw new Error('Missing PROSHIP_USERNAME / PROSHIP_PASSWORD — add both in GitHub -> Settings -> Secrets and variables -> Actions.');
  const res = await fetch(BASE + '/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) });
  const text = await res.text(); let j = {}; try { j = JSON.parse(text); } catch (e) {}
  if (!j.accessToken && /mfa|otp/i.test(j.message || text)) throw new Error('ProShip login needs an OTP (MFA is on for this user) — a robot cannot enter OTPs. Ask ProShip to switch off MFA / OTP for the API user. ProShip said: ' + clip(j.message || text, 160));
  if (!j.accessToken) throw new Error(`ProShip login failed (status ${res.status}): ${clip(j.message || text, 200)}`);
  if (j.status && String(j.status).toUpperCase() !== 'ACTIVE') throw new Error(`ProShip user is ${j.status} — only ACTIVE users can use the API.`);
  token = j.accessToken;
  return j;
}
// retry: only on "too fast" / server busy. A repeated create is safe — ProShip rejects a reference it already has.
async function api(method, path, body) {
  let last = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    let res, text;
    try {
      res = await fetch(BASE + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });
      text = await res.text();
    } catch (e) { last = e.message; await sleep(2000 * (attempt + 1)); continue; }
    if (res.status === 401 && attempt === 0) { await signin(); continue; }
    if (res.status === 429 || res.status >= 502) { last = `status ${res.status}`; await sleep(2000 * (attempt + 1)); continue; }
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    return { status: res.status, json: j, text };
  }
  throw new Error('ProShip did not respond (' + last + ')');
}
const apiMsg = (r) => clip((r.json && ((r.json.meta && r.json.meta.message) || r.json.message || r.json.error)) || r.text || ('status ' + r.status), 220);
const apiOk = (r) => r.status >= 200 && r.status < 300 && r.json && (!r.json.meta || r.json.meta.success !== false) && !r.json.subCode;

// ProShip's order list is a GET that takes its filters in the BODY — fetch() cannot send that, plain https can.
function getWithBody(path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path), data = JSON.stringify(body);
    const req = https.request({ method: 'GET', hostname: u.hostname, path: u.pathname, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 60000 }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { try { resolve(JSON.parse(t)); } catch (e) { reject(new Error('order list: not JSON (status ' + res.statusCode + ')')); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('order list timed out')));
    req.write(data); req.end();
  });
}
// used only when a create answer was unclear: find today's order by its reference (= Amazon order id)
async function findByReference(ref) {
  const d = (off) => new Date(Date.now() + 5.5 * 3600e3 + off * 864e5).toISOString().slice(0, 10);
  for (let offset = 0; offset < 500; offset += 50) {
    const j = await getWithBody('/api/order/external/details', { created_from: d(-2), created_to: d(1), offset, limit: 50 });
    const rows = (j && j.data) || [];
    const hit = rows.find((o) => nid(o.reference || o.referenceNumber) === ref && o.awbNumber && !/cancel/i.test(o.orderStatus || ''));
    if (hit) return hit;
    if (rows.length < 50) break;
  }
  return null;
}

const courierOf = (c) => clip((c && (c.parent || c.name || c.cpAccountCode)) || '', 40);
// ProShip status code -> our short status
function bucket(code, name) {
  code = Number(code); const s = String(name || '').toUpperCase();
  if (code === 10 || /CANCEL/.test(s)) return 'cancelled';
  if (code === 14 || s === 'RTO_DELIVERED') return 'rto_delivered';
  if ((code >= 11 && code <= 15) || /^RTO/.test(s)) return 'rto';
  if (code === 8 || s === 'DELIVERED') return 'delivered';
  if (code === 16 || code === 17) return 'lost';
  return 'ok';
}
const DONE = { cancelled: 1, rto_delivered: 1, delivered: 1, lost: 1 };

/* ---------------------------------------------------------------- Firebase */
let db = null, omsDb = null;
function fb() {
  if (db) return;
  const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
  db = main.firestore();
  if (process.env.FIREBASE_SERVICE_ACCOUNT_OMS) omsDb = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
}
const now = () => admin.firestore.FieldValue.serverTimestamp();
const idxRef = () => db.collection('aikm_admin').doc('proshipIndex');
async function readIndex() {
  const d = await idxRef().get();
  try { return d.exists && d.get('data') ? JSON.parse(d.get('data')) : {}; } catch (e) { return {}; }
}
async function writeIndex(idx) {
  const cut = Date.now() - KEEP_DAYS * 864e5, next = {};
  Object.keys(idx).forEach((k) => { if (idx[k] && idx[k].a && (idx[k].t || 0) > cut) next[k] = idx[k]; });
  await idxRef().set({ data: JSON.stringify(next), count: Object.keys(next).length, updatedAt: now() });
  return next;
}
async function readJsonDoc(col, id) {
  const d = await db.collection(col).doc(id).get(); if (!d.exists) return {};
  try { return d.get('data') ? JSON.parse(d.get('data')) : (d.get('orders') || {}); } catch (e) { return d.get('orders') || {}; }
}
function out(k, v) { try { if (process.env.GITHUB_OUTPUT) require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); } catch (e) {} }

/* ---------------------------------------------------------------- order -> ProShip request */
function buildOrder(id, lines, weightKg, box, pk) {
  const o = lines[0], items = {}, order = [];
  lines.forEach((x) => {
    const key = x.sku || x.productName;
    if (!items[key]) { items[key] = { sku: x.sku || '', name: x.productName || x.sku || 'Item', qty: 0, price: num(x.price), ship: 0, hsn: String(x.hsn || '').replace(/\D/g, ''), tax: num(x.taxRate) }; order.push(key); }
    const q = num(x.qty) || 1; items[key].qty += q; items[key].ship += num(x.shippingCharge) * q;
  });
  const list = order.map((k) => items[k]);
  const cod = lines.reduce((s, x) => s + num(x.codCollectible), 0);
  const isCod = cod > 0 || /^cod$/i.test(String(o.orderType || '').trim());
  const total = r2(list.reduce((s, it) => s + it.price * it.qty + it.ship, 0));
  const a1 = clip(o.buyerAddress1, 200), a2 = clip(o.buyerAddress2, 200);
  const addr = [a1, a2].filter(Boolean).join(', ');
  const miss = [];
  if (!addr) miss.push('address');
  if (!/^\d{6}$/.test(String(o.buyerPincode || '').trim())) miss.push('pincode');
  if (!o.buyerCity) miss.push('city'); if (!o.buyerState) miss.push('state');
  if (phone10(o.buyerPhone).length !== 10) miss.push('phone');
  if (!(weightKg > 0)) miss.push('weight');
  if (miss.length) return { error: 'Missing ' + miss.join(', ') };
  const email = String(o.buyerEmail || '').trim();
  const body = {
    reverse: false, is_reverse: false,
    order_type: 'Forward Shipment',
    item_list: list.map((it) => {
      const row = { units: it.qty, tax: it.tax, item_name: clip(it.name, 180), sku_id: clip(it.sku || it.name, 100), item_url: 'NA', selling_price: r2(it.price) };
      if (it.hsn) row.hsn = it.hsn;
      return row;
    }),
    pickup_details: {
      from_name: pk.name, from_phone_number: phone10(pk.phone), from_address: pk.address, from_country: 'IN', from_email: pk.email,
      from_pincode: String(pk.pin).trim(), from_city: pk.city, from_state: pk.state, gstin: String(pk.gstin || '').trim(),
    },
    delivery_details: {
      to_name: clip(o.buyerName, 100) || 'Customer', to_phone_number: phone10(o.buyerPhone), to_address: addr, to_country: 'IN',
      to_email: /@/.test(email) ? email : pk.email, to_pincode: String(o.buyerPincode).trim(), to_city: clip(o.buyerCity, 60), to_state: clip(o.buyerState, 60),
    },
    shipment_detail: [{ item_breadth: num(box.b) || 15, item_length: num(box.l) || 20, item_height: num(box.h) || 10, item_weight: Math.round(weightKg * 1000) }],
    invoice_value: total,
    cod_amount: isCod ? r2(cod > 0 ? cod : total) : 0,
    payment_mode: isCod ? 'COD' : 'PREPAID',
    client_order_id: id, invoice_number: id, shipping_label_id: id, reference: id,
    transaction_charge: 0, giftwrap_charge: 0,
    channel_name: 'AMAZON',
  };
  return { body, acct: account(o.channel) };
}
function checkPickup(pk) {
  const miss = [];
  if (!pk.name) miss.push('name'); if (phone10(pk.phone).length !== 10) miss.push('10-digit phone'); if (!/@/.test(pk.email || '')) miss.push('email');
  if (!pk.address) miss.push('address'); if (!pk.city) miss.push('city'); if (!pk.state) miss.push('state');
  if (!/^\d{6}$/.test(String(pk.pin || '').trim())) miss.push('6-digit pincode');
  return miss;
}

/* ---------------------------------------------------------------- modes */
async function modeCheck() {
  let me;
  try { me = await signin(); } catch (e) {
    // tell the console why (shown on the ProShip panel) — then fail the run as usual
    try { fb(); await db.collection('aikm_admin').doc('proshipCheck').set({ ok: false, note: clip(e.message, 300), rates: [], at: now() }); } catch (_) {}
    throw e;
  }
  console.log(`Signed in to ProShip (user status: ${me.status || 'ok'})`);
  fb();
  const set = await db.collection('aikm_admin').doc('proshipSettings').get();
  const from = String((process.env.FROM_PIN || (set.exists && set.get('pin')) || '206001')).trim();
  const routes = [['Delhi', '110001'], ['Lucknow', '226001'], ['Mumbai', '400001'], ['Bengaluru', '560001'], ['Kolkata', '700001'], ['Patna', '800001']];
  const rates = []; let err = '';
  for (const [city, to] of routes) {
    for (const g of [500, 1000]) {
      const r = await api('POST', '/api/tools/list/ext/pricing', { from: Number(from), to: Number(to), paymentType: 'PREPAID', length: 20, breadth: 15, height: 10, weight: String(g), dispatchMode: 'SURFACE', codAmount: 0, orderType: 'FORWARD' });
      const rows = Array.isArray(r.json) ? r.json : (r.json && (r.json.result || r.json.data)) || [];
      if (!Array.isArray(rows) || !rows.length) { err = err || apiMsg(r); console.log(`  ${from} -> ${city} ${g} g: no rate (${apiMsg(r)})`); continue; }
      rows.sort((a, b) => num(a.priceAfterTax) - num(b.priceAfterTax));
      rows.slice(0, 4).forEach((x, i) => {
        const c = (x.provider && (x.provider.parent || x.provider.id)) || '';
        if (i === 0) rates.push({ city, to, g, zone: x.zone || '', c, p: r2(num(x.priceAfterTax)), tat: [x.providerMinTatDays, x.providerMaxTatDays].filter((v) => v != null).join('-') });
        console.log(`  ${from} -> ${city} ${g} g · ${c} · ₹${r2(num(x.priceAfterTax))} incl. GST · zone ${x.zone || '-'} · ${x.providerMinTatDays || '?'}-${x.providerMaxTatDays || '?'} days${i === 0 ? '  <- cheapest' : ''}`);
      });
      await sleep(250);
    }
  }
  await db.collection('aikm_admin').doc('proshipCheck').set({ ok: true, from, rates, note: rates.length ? '' : ('Signed in, but no rates came back: ' + err), at: now() });
  console.log(`CHECK OK — signed in, ${rates.length} route rates read. Nothing was created.`);
}

async function modeShip() {
  fb();
  if (!JOB_ID) throw new Error('No JOB_ID');
  if (!omsDb) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_OMS');
  const jobRef = db.collection('proshipJobs').doc(JOB_ID);
  const note = (status, kw) => jobRef.set(Object.assign({ status, updatedAt: now() }, kw || {}), { merge: true });
  try {
    const job = (await jobRef.get()).data();
    if (!job) throw new Error('Job not found');
    if (job.status && job.status !== 'queued') { console.log('Job already handled:', job.status); return; }
    const want = {}; Object.keys(job.ids || {}).forEach((k) => { if (nid(k)) want[nid(k)] = job.ids[k]; });
    const ids = Object.keys(want);
    const pk = job.pickup || {}, box = job.box || {};
    const pm = checkPickup(pk);
    if (pm.length) throw new Error('Pickup address incomplete: ' + pm.join(', '));
    if (!ids.length) throw new Error('No orders in this job');
    await note('running', { step: 'Signing in to ProShip…', total: ids.length, done: 0 });
    await signin();

    await note('running', { step: 'Reading fresh order details…' });
    const chunks = await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get();
    const by = {}; const wanted = new Set(ids);
    chunks.forEach((d) => (d.get('orders') || []).forEach((o) => { const k = nid(o.channelOrderId); if (wanted.has(k)) (by[k] = by[k] || []).push(o); }));
    const [idx, nimbus, zippy] = await Promise.all([readIndex(), readJsonDoc('nimbusIndex', 'byOrder'), readJsonDoc('aikm_admin', 'zippyIndex')]);
    const live = (m, id) => { const v = m[id] || m['#' + id]; return v && v.a && v.s !== 'cancelled' ? v : null; };

    const results = {}; let made = 0, failed = 0, skipped = 0, n = 0;
    for (const id of ids) {
      n++;
      const lines = by[id] || [];
      let res;
      if (!lines.length) res = { e: 'Not found in OMS Guru data' };
      else if (!/amazon/i.test(lines[0].channel || '')) res = { e: 'Not an Amazon order' };
      else if (lines.some((l) => /cancel/i.test(l.status || ''))) res = { e: 'Cancelled on Amazon — not shipped' };
      else if (lines.some((l) => String(l.awb || '').trim())) res = { e: 'Already has an AWB in OMS Guru' };
      else if (live(idx, id)) res = { a: live(idx, id).a, c: live(idx, id).c || '', old: 1 };
      else if (live(nimbus, id)) res = { e: 'Already shipped in NimbusPost (' + live(nimbus, id).a + ')' };
      else if (live(zippy, id)) res = { e: 'Already shipped in Zippy (' + live(zippy, id).a + ')' };
      else {
        const b = buildOrder(id, lines, num(want[id]), box, pk);
        if (b.error) res = { e: b.error };
        else {
          try {
            const r = await api('POST', '/api/order/create', b.body);
            const x = (r.json && r.json.result) || {};
            let awb = String(x.awb_number || x.awbNumber || '').trim(), courier = courierOf(x.courier_id || x.courierDetail);
            if (!awb && (apiOk(r) || /already|duplicate|exist/i.test(apiMsg(r)))) { // created but no AWB in the answer (or made by an earlier try): look it up
              try { const f = await findByReference(id); if (f) { awb = String(f.awbNumber); courier = courierOf(f.courierDetail) || courier; } } catch (e) { console.log('  lookup failed:', e.message); }
            }
            if (awb) { res = { a: awb, c: courier }; idx[id] = { a: awb, c: courier, s: 'ok', st: clip(x.orderStatus || 'ORDER_PLACED', 40), t: Date.now(), ac: b.acct }; }
            else res = { e: apiOk(r) ? 'ProShip accepted the order but gave no AWB yet — check ProShip → Unprocessed Shipments' : apiMsg(r) };
          } catch (e) { res = { e: clip(e.message, 200) }; }
          await sleep(150);
        }
      }
      results[id] = res;
      if (res.a && !res.old) made++; else if (res.a) skipped++; else failed++;
      console.log(`  ${n}/${ids.length} ${id} -> ${res.a ? res.a + ' (' + (res.c || '?') + ')' + (res.old ? ' [already shipped]' : '') : 'NOT SHIPPED: ' + res.e}`);
      if (n % 10 === 0 && n < ids.length) await note('running', { step: `Creating shipments… ${n} of ${ids.length}`, done: n, results });
    }
    if (made) await writeIndex(idx);
    await note('done', { step: `${made} shipped${skipped ? ' · ' + skipped + ' already shipped before' : ''}${failed ? ' · ' + failed + ' not shipped' : ''}`, done: ids.length, made, failed, results, pickup: admin.firestore.FieldValue.delete() });
    console.log(`SHIP DONE — ${made} shipped, ${skipped} already shipped, ${failed} not shipped.`);
    out('shipped', made);
  } catch (e) {
    await note('failed', { step: clip(e.message, 300) }).catch(() => {});
    throw e;
  }
}

async function modeSync() {
  fb();
  const idx = await readIndex();
  const open = Object.keys(idx).filter((k) => idx[k] && idx[k].a && !DONE[idx[k].s]);
  if (!open.length) { console.log('SYNC — no live ProShip shipments.'); return; }
  await signin();
  const byAwb = {}; open.forEach((k) => { byAwb[String(idx[k].a)] = k; });
  const awbs = Object.keys(byAwb); let changed = 0;
  for (let i = 0; i < awbs.length; i += 40) {
    const r = await api('GET', '/api/order/track_waybill?waybills=' + encodeURIComponent(awbs.slice(i, i + 40).join(',')));
    ((r.json && r.json.waybillDetails) || []).forEach((w) => {
      const k = byAwb[String(w.waybill)]; if (!k) return;
      const s = bucket(w.currentStatusCode, w.currentStatus), st = clip(w.currentStatus, 40), c = clip(w.courierPartner, 40);
      if (idx[k].s !== s || idx[k].st !== st) { idx[k].s = s; idx[k].st = st; if (c && !idx[k].c) idx[k].c = c; changed++; }
    });
    await sleep(300);
  }
  if (changed) await writeIndex(idx);
  console.log(`SYNC DONE — ${awbs.length} live AWBs checked, ${changed} changed.`);
}

async function modeCancel() {
  fb();
  const awbs = String(process.env.AWBS || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!awbs.length) throw new Error('No AWBs given');
  await signin();
  const idx = await readIndex(); let n = 0;
  for (const awb of awbs) {
    const r = await api('POST', '/api/order/cancel_order', { waybill: awb });
    const ok = apiOk(r);
    console.log(`  ${awb} -> ${ok ? 'cancelled' : 'NOT cancelled: ' + apiMsg(r)}`);
    if (ok) { const k = Object.keys(idx).find((x) => String(idx[x].a) === awb); if (k) { idx[k].s = 'cancelled'; idx[k].st = 'CANCELLED_ORDER'; n++; } }
    await sleep(200);
  }
  if (n) await writeIndex(idx);
  console.log(`CANCEL DONE — ${n} of ${awbs.length} cancelled.`);
  if (n < awbs.length) process.exitCode = 1;
}

// practice run on ProShip's shared sandbox — dummy data only (never real buyers: other companies use the same test login)
async function modeSelftest() {
  const show = (label, r) => console.log(`${label}: status ${r.status} ${clip(r.text, 1400)}`);
  await signin();
  console.log('1. LOGIN ok');
  const pr = await api('POST', '/api/tools/list/ext/pricing', { from: 110001, to: 110009, paymentType: 'PREPAID', length: 20, breadth: 15, height: 10, weight: '500', dispatchMode: 'SURFACE', codAmount: 0, orderType: 'FORWARD' });
  show('2. PRICING', pr);
  const ref = 'AIKMTEST' + Date.now();
  const line = { channel: 'Test - Amazon', buyerName: 'Test Buyer', buyerPhone: '9999999999', buyerEmail: '', buyerAddress1: 'Test order - do not ship', buyerAddress2: 'Block A', buyerCity: 'Delhi', buyerState: 'Delhi', buyerPincode: '110009', sku: 'TEST-SKU', productName: 'Test item', qty: 1, price: 100, shippingCharge: 0, codCollectible: 0, orderType: 'Prepaid', hsn: '0713', taxRate: 5 };
  const b = buildOrder(ref, [line], 0.5, { l: 20, b: 15, h: 10 }, { name: 'AIKM Test Warehouse', phone: '9999999999', email: 'test@example.com', address: 'Test pickup address', city: 'Delhi', state: 'Delhi', pin: '110001', gstin: '' });
  if (b.error) throw new Error('test order could not be built: ' + b.error);
  const cr = await api('POST', '/api/order/create', b.body);
  show('3. CREATE', cr);
  const x = (cr.json && cr.json.result) || {};
  let awb = String(x.awb_number || x.awbNumber || '').trim();
  console.log(`   parsed -> ok=${apiOk(cr)} awb=${awb || '(none)'} courier=${courierOf(x.courier_id || x.courierDetail) || '(none)'} status=${x.orderStatus || ''} result keys: ${Object.keys(x).join(',')}`);
  try { const f = await findByReference(ref); console.log(`4. FIND BY REFERENCE: ${f ? 'found, awb ' + f.awbNumber + ', courier ' + courierOf(f.courierDetail) : 'not found'}`); if (f && !awb) awb = String(f.awbNumber || ''); } catch (e) { console.log('4. FIND BY REFERENCE failed:', e.message); }
  if (!awb) { console.log('SELFTEST STOPPED — no AWB came back, so label / tracking / cancel could not be tried.'); process.exitCode = 1; return; }
  const lb = await api('POST', '/api/tools/refresh/url', { awbNumber: awb, docType: 'LABEL' });
  const url = (lb.json && (lb.json.LABEL || (lb.json.result || {}).LABEL)) || '';
  console.log(`5. LABEL: status ${lb.status} keys ${lb.json ? Object.keys(lb.json).join(',') : '-'} link ${url ? 'yes' : 'NO — ' + clip(lb.text, 300)}`);
  if (url) { try { const f = await fetch(url); const buf = Buffer.from(await f.arrayBuffer()); console.log(`   label file: status ${f.status}, ${buf.length} bytes, ${buf.slice(0, 4).toString() === '%PDF' ? 'PDF' : 'NOT a PDF (' + (f.headers.get('content-type') || '') + ')'}`); } catch (e) { console.log('   label download failed:', e.message); } }
  const tr = await api('GET', '/api/order/track_waybill?waybills=' + encodeURIComponent(awb));
  const w = ((tr.json && tr.json.waybillDetails) || [])[0];
  console.log(`6. TRACK: status ${tr.status} ${w ? w.currentStatus + ' (code ' + w.currentStatusCode + ') courier ' + w.courierPartner + ' -> bucket ' + bucket(w.currentStatusCode, w.currentStatus) : clip(tr.text, 300)}`);
  const cn = await api('POST', '/api/order/cancel_order', { waybill: awb });
  show('7. CANCEL', cn);
  console.log(`SELFTEST DONE — create ${awb ? 'OK' : 'FAILED'}, label ${url ? 'OK' : 'FAILED'}, track ${w ? 'OK' : 'FAILED'}, cancel ${apiOk(cn) ? 'OK' : 'FAILED'}.`);
  if (!url || !w || !apiOk(cn)) process.exitCode = 1;
}

if (require.main === module) {
  // the sandbox is for the practice run only: its fake AWBs must never reach the real index / OMS Guru / Amazon
  const prod = /^https:\/\/proship\.prozo\.com$/i.test(BASE), sandbox = /^https:\/\/proshipdev\.prozo\.com$/i.test(BASE);
  if (MODE === 'selftest' ? !sandbox : !prod) { console.error(`FAILED: mode "${MODE}" is not allowed on ${BASE}`); process.exit(1); }
  ({ check: modeCheck, ship: modeShip, sync: modeSync, cancel: modeCancel, selftest: modeSelftest }[MODE] || (async () => { throw new Error('Unknown MODE ' + MODE); }))()
    .then(() => process.exit(process.exitCode || 0))
    .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
module.exports = { buildOrder, bucket, courierOf, checkPickup };
