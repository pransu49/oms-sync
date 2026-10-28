// complaints-sync.js — buyer complaints for the console's Complaints tab (read-only on Amazon).
//
// Per account with a working SP-API key:
//   1. Feedback report (GET_SELLER_FEEDBACK_DATA, last 90 days): rating 1–5 + buyer comment + order id
//   2. Account health (GET_V2_SELLER_PERFORMANCE_REPORT): order defect rate, A-to-z claims, chargebacks,
//      negative feedback count, late shipment, cancellation, valid tracking, on-time delivery
// Each feedback is matched to the order: product, customer, city, OMS status, courier status, RTO, refund.
// Buyer MESSAGES are not in any Amazon API — they come from the Gmail robot (collection amazon_complaints).
//
// Writes: OMS Firebase aikm_admin/complaintsIndex { items, health, at, hash, seen } — only when changed.
// Telegram: new 1–2 star feedback (daytime only).
// Reads per run: OMS ~26 docs (orders chunks, rtoIndex, refundChecks, complaintsIndex), main 2 (nimbusIndex, refundUpload).

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');
const zlib = require('zlib'), https = require('https'), crypto = require('crypto');
const { notify, istNow, esc, LINE } = require('./telegram');

const MP = 'A21TJRUUN4KGV';
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const ACCOUNTS = [
  { key: 'SASTA STORE', token: process.env.SPAPI_REFRESH_TOKEN_SASTASTORE },
  { key: 'PRASO ENTERPRISES', token: process.env.SPAPI_REFRESH_TOKEN_PRASO },
].filter((a) => a.token);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => https.get(url, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej); }).on('error', rej));
const base = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').trim().replace(/_\d+$/, '');
const short = (a) => /praso/i.test(a) ? 'Praso' : /sasta/i.test(a) ? 'Sasta Store' : a;

async function call(sp, args) {
  for (let t = 0; t < 5; t++) {
    try { return await sp.callAPI(args); }
    catch (e) { if (/throttl|QuotaExceeded|429/i.test(String(e.code || e.message))) { await sleep(5000 * (t + 1)); continue; } throw e; }
  }
  throw new Error('Amazon kept throttling ' + args.operation);
}
async function report(sp, type, days) {
  const body = { reportType: type, marketplaceIds: [MP] };
  if (days) { body.dataStartTime = new Date(Date.now() - days * 864e5).toISOString(); body.dataEndTime = new Date().toISOString(); }
  const { reportId } = await call(sp, { operation: 'createReport', endpoint: 'reports', body });
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const s = await call(sp, { operation: 'getReport', endpoint: 'reports', path: { reportId } });
    if (s.processingStatus === 'DONE') {
      const d = await call(sp, { operation: 'getReportDocument', endpoint: 'reports', path: { reportDocumentId: s.reportDocumentId } });
      let t = Buffer.isBuffer(d) ? d.toString() : typeof d === 'string' ? d : (d && typeof d === 'object' && !d.url) ? JSON.stringify(d) : null;
      if (t == null) { const b = await get(d.url); t = /GZIP/i.test(d.compressionAlgorithm || '') ? zlib.gunzipSync(b).toString() : b.toString(); }
      return t;
    }
    if (/FATAL|CANCELLED/.test(s.processingStatus)) return '';
  }
  throw new Error(type + ' not ready after 10 min');
}
function tsv(t) {
  const lines = String(t || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const h = lines[0].split('\t').map((x) => x.replace(/^﻿/, '').trim().toLowerCase());
  return lines.slice(1).map((l) => { const c = l.split('\t'), o = {}; h.forEach((k, i) => { o[k] = (c[i] || '').trim(); }); return o; });
}
function day(s) { // 27/10/26 -> 2026-10-27
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
// account health: keep the numbers people look at
function health(json) {
  let j; try { j = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return null; }
  const m = (j.performanceMetrics || [])[0] || {};
  const pick = (x) => x && typeof x === 'object' ? { s: x.status || '', r: x.rate, t: x.targetValue } : null;
  const odr = m.orderDefectRate || {}, mfn = odr.mfn || odr.MFN || {};
  return {
    status: ((j.accountStatuses || [])[0] || {}).status || '',
    ahr: m.accountHealthRating ? { s: m.accountHealthRating.ahrStatus || '', score: m.accountHealthRating.ahrScore } : null,
    odr: mfn.status ? { s: mfn.status, r: mfn.rate, t: mfn.targetValue, orders: mfn.orderCount,
      defects: (mfn.orderWithDefects || {}).count, claims: (mfn.claims || {}).count, chargebacks: (mfn.chargebacks || {}).count, negFb: (mfn.negativeFeedback || {}).count } : null,
    late: pick(m.lateShipmentRate), cancel: pick(m.preFulfillmentCancellationRate), tracking: pick(m.validTrackingRate), ontime: pick(m.onTimeDeliveryRate),
  };
}

async function main() {
  const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
  const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
  const omsDb = oms.firestore(), db = main.firestore();
  omsDb.settings({ ignoreUndefinedProperties: true }); db.settings({ ignoreUndefinedProperties: true });

  // ---- Amazon ----
  const items = [], hp = {}, errors = {};
  for (const acc of ACCOUNTS) {
    const sp = new SellingPartnerAPI({ region: 'eu', refresh_token: acc.token, credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET } });
    try {
      const fb = tsv(await report(sp, 'GET_SELLER_FEEDBACK_DATA', 90));
      fb.forEach((r) => {
        const o = base(r['order id']); if (!o) return;
        items.push({ k: 'fb', acc: acc.key, o, d: day(r.date), rt: Number(r.rating) || 0, c: String(r.comments || '').slice(0, 600), resp: String(r['your response'] || '').trim().slice(0, 300) });
      });
      console.log(`${acc.key}: ${fb.length} feedback(s) in 90 days, ${fb.filter((r) => Number(r.rating) <= 2).length} negative.`);
    } catch (e) { errors[acc.key] = `feedback: ${e.code || ''} ${e.message}`; console.log('ERROR', acc.key, errors[acc.key]); }
    try { hp[acc.key] = health(await report(sp, 'GET_V2_SELLER_PERFORMANCE_REPORT', 0)); console.log(`${acc.key} health:`, JSON.stringify(hp[acc.key])); }
    catch (e) { errors[acc.key] = (errors[acc.key] ? errors[acc.key] + ' · ' : '') + `health: ${e.code || ''} ${e.message}`; }
  }

  // ---- match each complaint to the order ----
  const ord = {};
  (await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.data().orders || []).forEach((o) => {
    const id = base(o.channelOrderId); if (!id || ord[id]) return;
    ord[id] = { p: String(o.productName || o.sku || '').slice(0, 80), q: o.qty, n: o.buyerName || '', ci: o.buyerCity || '', pin: o.buyerPincode || '', st: o.status || '', a: o.awb || '', cour: o.courier || '', pay: o.orderType || '', od: o.orderDate || '' };
  }));
  const rto = {};
  try { JSON.parse(((await omsDb.collection('aikm_admin').doc('rtoIndex').get()).data() || {}).rows || '[]').forEach((r) => { rto[r.o] = r; }); } catch (e) {}
  const refunded = {};
  try { Object.entries(((await omsDb.collection('aikm_admin').doc('refundChecks').get()).data() || {}).orders || {}).forEach(([id, v]) => { refunded[id] = v.r || 1; }); } catch (e) {}
  try { Object.values(((await db.collection('aikm_admin').doc('refundUpload').get()).data() || {}).accts || {}).forEach((f) => Object.entries((f && f.orders) || {}).forEach(([id, v]) => { refunded[id] = refunded[id] || (v && v[1]) || 1; })); } catch (e) {}
  let nb = {};
  try { const d = (await db.collection('nimbusIndex').doc('byOrder').get()).data() || {}; nb = d.data ? JSON.parse(d.data) : (d.orders || {}); } catch (e) {}

  items.forEach((x) => {
    const o = ord[x.o], r = rto[x.o], n = nb[x.o];
    if (o) Object.assign(x, { p: o.p, q: o.q, n: o.n, ci: o.ci, pin: o.pin, st: o.st, a: o.a, cour: o.cour, pay: o.pay });
    if (r) { x.p = x.p || ((r.items || [])[0] || {}).t || ''; x.n = x.n || r.n; x.ci = x.ci || r.ci; x.rto = r.k === 'rto' ? (r.s === 'back' ? 'back' : 'way') : 'cust'; }
    if (n && n.s) x.ship = n.s;
    if (refunded[x.o]) x.ref = typeof refunded[x.o] === 'number' ? refunded[x.o] : 1;
    // simple next step
    const t = (x.c || '').toLowerCase();
    x.next = x.ref ? 'Already refunded — reply to buyer / request feedback removal'
      : x.rto ? 'RTO — refund the order'
      : /not (been )?receiv|didn'?t (receive|get)|not deliver|undeliver|nahi aaya|nhi aaya|haven'?t received|where is|late|time to deliver|cancel/.test(t) ? (x.ship === 'delivered' ? 'Courier says delivered — check proof of delivery' : 'Not delivered — track with courier, refund if lost')
      : /wrong|different|fake|genuine|duplicate|expired|damag|broken|leak/.test(t) ? 'Product complaint — check, offer refund/replacement'
      : /refund/.test(t) ? 'Refund asked — check refund status'
      : x.rt <= 2 ? 'Check order and reply' : '';
  });
  items.sort((a, b) => String(b.d).localeCompare(String(a.d)) || a.rt - b.rt);

  // ---- save + Telegram ----
  const ref = omsDb.collection('aikm_admin').doc('complaintsIndex');
  const prev = (await ref.get()).data() || {};
  const seen = prev.seen || {};
  const neg = items.filter((x) => x.rt && x.rt <= 2);
  const fresh = neg.filter((x) => !seen[x.acc + '|' + x.o]);
  const now = istNow();
  let sent = false;
  if (!prev.at) { neg.forEach((x) => { seen[x.acc + '|' + x.o] = now.date; }); console.log(`First run: ${neg.length} existing negative feedback(s) recorded — alerts start with the next new one.`); }
  else if (fresh.length && now.hour >= 8 && now.hour < 22) {
    const msg = `⭐ <b>${fresh.length} new negative feedback${fresh.length > 1 ? 's' : ''}</b>\n${LINE}\n` +
      fresh.slice(0, 8).map((x) => `${'★'.repeat(x.rt)}${'☆'.repeat(5 - x.rt)} ${esc(short(x.acc))} · ${esc(x.o)}\n<i>${esc((x.c || '').slice(0, 140))}</i>\n${esc(x.p || '')}${x.next ? '\n👉 ' + esc(x.next) : ''}`).join('\n\n') +
      (fresh.length > 8 ? `\n\n…and ${fresh.length - 8} more` : '') + `\n\nAdmin Console → <b>Complaints</b>`;
    if (DRY) console.log('DRY — Telegram:\n' + msg); else sent = await notify(msg, { html: true });
    if (sent) fresh.forEach((x) => { seen[x.acc + '|' + x.o] = now.date; });
  }
  const cut = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  Object.keys(seen).forEach((k) => { if (seen[k] < cut) delete seen[k]; });

  const keepHealth = Object.assign({}, prev.health || {}, hp); // an account that failed keeps its last numbers
  const hash = crypto.createHash('md5').update(JSON.stringify([items, keepHealth])).digest('hex');
  console.log(`Complaints: ${items.length} feedback(s), ${neg.length} negative. Errors: ${JSON.stringify(errors)}`);
  if (DRY) { console.log('DRY — sample:', JSON.stringify(items.slice(0, 2))); return; }
  if (prev.hash === hash && !sent && prev.at) { await ref.update({ at: admin.firestore.FieldValue.serverTimestamp(), errors }); console.log('No change.'); return; }
  await ref.set({ items, health: keepHealth, errors, hash, seen, at: admin.firestore.FieldValue.serverTimestamp() });
  console.log('Saved.');
  if (Object.keys(errors).length === ACCOUNTS.length) throw new Error('Amazon failed for every account');
}

main().catch((e) => { console.error('COMPLAINTS SYNC FAILED:', e.message || e); process.exit(1); });
