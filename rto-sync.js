// rto-sync.js — builds the RTO Check list for the console (read-only on Amazon and NimbusPost).
//
// Sources
//  1. Amazon returns report (GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE, last 60 days) per account:
//     undelivered (RTO) + customer returns, original tracking ID, return status and Amazon's
//     "Return delivery date" (= parcel reached you).
//  2. Amazon orders report (last 90 days): order status ("Shipped - Returned to Seller"), city, state, PIN,
//     price, Easy Ship / self-ship.
//  3. NimbusPost (main Firebase nimbusDash): self-ship RTOs incl. the NEW return AWB (ra).
//  4. OMS Guru orders (OMS Firebase): customer name, COD/prepaid, original AWB.
// Note: Amazon never exposes the new ATS return tracking ID (515…). The console lets the user link it
// once (saved in main Firebase aikm_admin/rtoReceived) so it is searchable afterwards.
//
// Writes ONE document: aikm-oms-sync  aikm_admin/rtoIndex  { rows: JSON string, at, counts } — only when changed.

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');
const zlib = require('zlib'), https = require('https'), crypto = require('crypto');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MP = 'A21TJRUUN4KGV';
const RET_DAYS = 60, ORD_DAYS = 90;

const ACCOUNTS = [
  { key: 'PRASO ENTERPRISES', token: process.env.SPAPI_REFRESH_TOKEN_PRASO },
  { key: 'SASTA STORE', token: process.env.SPAPI_REFRESH_TOKEN_SASTASTORE },
].filter((a) => a.token);

const get = (url) => new Promise((res, rej) => https.get(url, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej); }).on('error', rej));

async function call(sp, args) {
  for (let t = 0; t < 6; t++) {
    try { return await sp.callAPI(args); }
    catch (e) { if (/throttl|QuotaExceeded|429/i.test(String(e.code || e.message))) { await sleep(5000 * (t + 1)); continue; } throw e; }
  }
  throw new Error('Amazon kept throttling ' + args.operation);
}

// Amazon allows at most 30 days per orders report -> ask in 30-day windows and join them
async function reportWindows(sp, type, days) {
  let out = [];
  for (let from = days; from > 0; from -= 30) out = out.concat(await report(sp, type, from, Math.max(0, from - 30)));
  return out;
}
async function report(sp, type, days, toDays = 0) {
  const body = { reportType: type, marketplaceIds: [MP], dataStartTime: new Date(Date.now() - days * 864e5).toISOString(), dataEndTime: new Date(Date.now() - toDays * 864e5).toISOString() };
  const { reportId } = await call(sp, { operation: 'createReport', endpoint: 'reports', body });
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const s = await call(sp, { operation: 'getReport', endpoint: 'reports', path: { reportId } });
    if (s.processingStatus === 'DONE') {
      const d = await call(sp, { operation: 'getReportDocument', endpoint: 'reports', path: { reportDocumentId: s.reportDocumentId } });
      let txt = Buffer.isBuffer(d) ? d.toString() : typeof d === 'string' ? d : null;
      if (txt == null) { const b = await get(d.url); txt = /GZIP/i.test(d.compressionAlgorithm || '') ? zlib.gunzipSync(b).toString() : b.toString(); }
      return tsv(txt);
    }
    if (/FATAL|CANCELLED/.test(s.processingStatus)) { console.log(`${type}: ${s.processingStatus} (no data)`); return []; }
  }
  throw new Error(type + ' not ready after 10 min');
}
function tsv(txt) {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const h = lines[0].split('\t').map((x) => x.replace(/^﻿/, '').trim().toLowerCase());
  return lines.slice(1).map((l) => { const c = l.split('\t'), o = {}; h.forEach((k, i) => { o[k] = (c[i] || '').trim(); }); return o; });
}
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function day(s) { // '06-Oct-2026' | ISO | 'October 06, 2026' -> 'YYYY-MM-DD'
  s = String(s || '').trim(); if (!s) return '';
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return `${m[3]}-${String(MON[m[2].toLowerCase()] + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d\d-\d\d/.test(s)) return s.slice(0, 10);
  const d = new Date(s); return isNaN(d) ? '' : new Date(d.getTime() + 5.5 * 36e5).toISOString().slice(0, 10);
}
const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const baseOrder = (o) => String(o || '').trim().replace(/_\d+$/, '');

async function main() {
  const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
  const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
  const omsDb = oms.firestore(), mainDb = mainApp.firestore();

  // ---- OMS Guru orders: name, payment, awb (and account for NimbusPost rows) ----
  const omsBy = {}, accByAwb = {};
  (await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => {
    (d.data().orders || []).forEach((o) => {
      const id = baseOrder(o.channelOrderId); if (!id) return;
      const acc = String(o.channel || '').replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, '').trim();
      omsBy[id] = { it: { t: String(o.productName || o.sku || '').slice(0, 90), sku: o.sku || '', asin: o.asin || '', q: num(o.qty) || 1 }, n: o.buyerName || '', ci: o.buyerCity || '', st: o.buyerState || '', pin: o.buyerPincode || '', pay: o.orderType || '', a: o.awb || '', acc, ch: o.channel || '', inv: o.invoiceNumber || '' };
      if (o.awb) accByAwb[o.awb] = acc;
    });
  });
  // the 60-day refund list also knows the account of older self-ship orders
  try { ((await omsDb.collection('aikm_admin').doc('omsRefundOrders').get()).data() || {}).orders?.forEach((o) => { if (o.aw && o.a) accByAwb[o.aw] = o.a; if (o.o && o.a && !omsBy[o.o]) omsBy[o.o] = { acc: o.a, a: o.aw || '', it: { t: String(o.n || '').slice(0, 90), sku: '', asin: '', q: num(o.q) || 1 } }; }); } catch (e) {}
  console.log(`OMS orders known: ${Object.keys(omsBy).length}`);

  const rows = {}; // orderId -> row
  const row = (id) => (rows[id] = rows[id] || { o: id });

  // ---- Amazon: returns + orders reports per account ----
  const errors = [];
  for (const acc of ACCOUNTS) {
    const sp = new SellingPartnerAPI({ region: 'eu', refresh_token: acc.token, credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET } });
    try {
      const ret = await report(sp, 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE', RET_DAYS);
      const ord = await reportWindows(sp, 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', ORD_DAYS);
      const byOrder = {}; ord.forEach((r) => { (byOrder[r['amazon-order-id']] = byOrder[r['amazon-order-id']] || []).push(r); });
      const returnedIds = new Set(ret.map((r) => r['order id']));
      // orders Amazon marks as returned to seller but with no return request yet (rare) also count
      Object.keys(byOrder).forEach((id) => { if (/returned/i.test(byOrder[id][0]['order-status'] || '')) returnedIds.add(id); });
      returnedIds.forEach((id) => {
        if (!id) return;
        const rr = ret.filter((r) => r['order id'] === id), oo = byOrder[id] || [], r0 = rr[0] || {}, o0 = oo[0] || {};
        const x = row(id);
        x.acc = acc.key; x.src = 'amazon';
        x.d = day(o0['purchase-date'] || r0['order date']);
        x.os = o0['order-status'] || '';
        x.es = /easy ship/i.test(o0['fulfilled-by'] || '') ? 1 : 0;
        x.ty = r0['return type'] || (/returned/i.test(x.os) ? 'Undelivered' : '');
        x.rs = r0['return reason'] || '';
        x.rst = r0['return request status'] || '';
        x.rq = day(r0['return request date']);
        x.rd = day(rr.map((r) => r['return delivery date']).filter(Boolean)[0]);
        x.a = r0['tracking id'] || x.a || '';
        x.items = (oo.length ? oo : rr).map((r) => ({ t: (r['product-name'] || r['item name'] || '').slice(0, 90), sku: r.sku || r['merchant sku'] || '', asin: r.asin || '', q: num(r.quantity || r['return quantity']) || 1 }));
        x.v = Math.round(oo.reduce((s, r) => s + num(r['item-price']) + num(r['shipping-price']), 0) || num(r0['order amount']));
        x.ref = Math.round(rr.reduce((s, r) => s + num(r['refunded amount']), 0));
        x.res = r0.resolution || '';
        x.inv = r0['invoice number'] || '';
        x.ci = o0['ship-city'] || ''; x.st = o0['ship-state'] || ''; x.pin = o0['ship-postal-code'] || '';
        x.sf = r0['safet claim id'] ? (r0['safet claim state'] || 'claimed') : '';
      });
      console.log(`${acc.key}: ${ret.length} return lines, ${ord.length} order lines -> ${returnedIds.size} returned orders`);
    } catch (e) { errors.push(`${acc.key}: ${e.code || ''} ${e.message || e}`); console.log('ERROR', acc.key, e.code || '', e.message || e); }
  }

  // ---- NimbusPost self-ship RTOs (has the NEW return AWB) ----
  let nim = 0;
  (await mainDb.collection('nimbusDash').get()).forEach((d) => {
    if (d.id === '_meta') return;
    let rs = d.data().rows; if (typeof rs === 'string') { try { rs = JSON.parse(rs); } catch (e) { rs = []; } }
    (rs || []).forEach((r) => {
      if (!/^rto/.test(r.b || '')) return;
      const id = baseOrder(r.o); if (!id) return;
      const x = row(id); nim++;
      x.src = x.src || 'nimbus';
      x.nb = r.b; x.nst = r.st || '';
      x.a = x.a || r.a || ''; if (r.a && r.a !== x.a) x.a2 = r.a;
      if (r.ra) x.ra = r.ra;
      x.cr = r.cr ? String(r.cr).slice(0, 10) : x.cr;
      x.nd = r.b === 'rto_delivered' ? String(r.dl || r.ls || '').slice(0, 10) : '';
      x.n = x.n || r.n || ''; x.ci = x.ci || r.ci || ''; x.pin = x.pin || r.pin || '';
      x.v = x.v || Math.round(num(r.v)); x.pay = x.pay || r.pt || '';
      x.cour = r.c || '';
      x.acc = x.acc || accByAwb[r.a] || '';
    });
  });
  console.log(`NimbusPost RTO shipments: ${nim}`);

  // ---- enrich from OMS ----
  Object.values(rows).forEach((x) => {
    const m = omsBy[x.o]; if (!m) return;
    x.n = x.n || m.n; x.ci = x.ci || m.ci; x.st = x.st || m.st; x.pin = x.pin || m.pin;
    x.pay = x.pay || m.pay; x.acc = x.acc || m.acc; x.inv = x.inv || m.inv;
    if ((!x.items || !x.items.length) && m.it && m.it.t) x.items = [m.it];
    if (m.a && !x.a) x.a = m.a; else if (m.a && m.a !== x.a && m.a !== x.a2) x.a2 = m.a;
  });

  const list = Object.values(rows).map((x) => {
    // one simple status for the screen
    x.k = /undeliver/i.test(x.ty || '') || /^UND/i.test(x.rs || '') || (x.nb && !x.ty) ? 'rto' : 'cust';
    x.s = x.rd || x.nd ? 'back' : 'way';
    return x;
  }).sort((a, b) => String(b.rq || b.cr || b.d).localeCompare(String(a.rq || a.cr || a.d)));

  const counts = { all: list.length, rto: list.filter((x) => x.k === 'rto').length, cust: list.filter((x) => x.k === 'cust').length, way: list.filter((x) => x.s === 'way').length, back: list.filter((x) => x.s === 'back').length };
  const json = JSON.stringify(list);
  const hash = crypto.createHash('md5').update(json).digest('hex');
  console.log(`RTO list: ${JSON.stringify(counts)}, ${json.length} bytes`);
  if (json.length > 950000) throw new Error('RTO list too big for one document: ' + json.length);
  const ref = omsDb.collection('aikm_admin').doc('rtoIndex');
  const prev = (await ref.get()).data() || {};
  if (prev.hash === hash && !errors.length) { await ref.update({ at: admin.firestore.FieldValue.serverTimestamp() }); console.log('No change.'); }
  else await ref.set({ rows: json, hash, counts, errors, at: admin.firestore.FieldValue.serverTimestamp() });
  const probe = String(process.env.PROBE_ORDER || '').trim();
  if (probe) console.log('PROBE', probe, JSON.stringify(list.find((x) => x.o === probe) || null));
  if (errors.length && errors.length === ACCOUNTS.length) throw new Error('Amazon failed for every account: ' + errors.join(' | '));
}

main().catch((e) => { console.error('RTO SYNC FAILED:', e.message || e); process.exit(1); });
