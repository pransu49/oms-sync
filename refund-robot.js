// refund-robot.js
// Submits refunds to Amazon ONLY when someone clicks "Refund now" in the console's Bulk Refund tab
// (after checking the details). Never runs by itself.
//
// How: Amazon Feeds API, feed type POST_FLAT_FILE_PAYMENT_ADJUSTMENT_DATA - the same Order Adjustment
// file that is uploaded by hand in Seller Central (Orders -> Upload Order Related Files).
// Accounts: the ones with an SP-API refresh token (SASTA STORE, Praso). Others: download the file.
//
// Input (workflow_dispatch): LINES = JSON [{ a, o, i, r, ip, it, sp, stx }]
//   a=account name, o=order id, i=order item id, r=reason code, ip/it/sp/stx = item price/tax, shipping price/tax
// Safety: an order item already refunded by this robot is skipped; Amazon also rejects any refund
// above what the customer paid. PROBE=true sends one fake order (000-0000000-0000000) to test access - no money moves.
// Results: aikm-oms-sync Firestore aikm_admin/refundLog (shown in the console).

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');

const MARKETPLACE_ID = 'A21TJRUUN4KGV';
const PROBE = String(process.env.PROBE || '').toLowerCase() === 'true';
const BY = String(process.env.REQUESTED_BY || 'console').slice(0, 60);
const ACCOUNTS = {
  'SASTA STORE': { key: 'sastastore', token: process.env.SPAPI_REFRESH_TOKEN_SASTASTORE },
  'PRASO ENTERPRISES': { key: 'praso', token: process.env.SPAPI_REFRESH_TOKEN_PRASO },
};
const HEAD = ['order-id', 'order-item-id', 'adjustment-reason-code', 'currency', 'item-price-adj', 'item-tax-adj', 'shipping-price-adj', 'shipping-tax-adj',
  'gift-wrap-price-adj', 'gift-wrap-tax-adj', 'item-promotion-adj', 'item-promotion-id', 'ship-promotion-adj', 'ship-promotion-id'];
const REASONS = ['CustomerCancel', 'CustomerReturn', 'CouldNotShip', 'NoInventory', 'GeneralAdjustment'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f2 = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const nowIso = () => new Date().toISOString();

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
admin.firestore().settings({ ignoreUndefinedProperties: true });
const logRef = admin.firestore().collection('aikm_admin').doc('refundLog');

function client(token) {
  return new SellingPartnerAPI({
    region: 'eu', refresh_token: token,
    credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET },
  });
}

async function setLive(state, step) {
  await logRef.set({ live: { state, step, updatedAt: nowIso() } }, { merge: true });
  console.log(`[${state}] ${step}`);
}

// Amazon's processing report (tab-separated text). Returns { summary, errors: { rowNumber: message } }
function parseReport(text) {
  const lines = String(text || '').split(/\r?\n/);
  const summary = lines.filter((l) => /processed|successful|error|warning/i.test(l)).slice(0, 6).join(' | ').replace(/\t+/g, ' ');
  const errors = {};
  const hi = lines.findIndex((l) => /original-record-number/i.test(l));
  if (hi >= 0) {
    const cols = lines[hi].split('\t').map((c) => c.trim().toLowerCase());
    const cRow = cols.indexOf('original-record-number'), cType = cols.findIndex((c) => /error-type/.test(c)), cMsg = cols.findIndex((c) => /error-message/.test(c));
    lines.slice(hi + 1).forEach((l) => {
      const p = l.split('\t'); if (p.length < 2) return;
      const row = parseInt(p[cRow], 10); if (!row) return;
      const type = cType >= 0 ? p[cType] : 'Error';
      if (!/error/i.test(type)) return; // warnings do not stop the refund
      errors[row] = ((errors[row] ? errors[row] + ' / ' : '') + (cMsg >= 0 ? p[cMsg] : l)).slice(0, 300);
    });
  }
  return { summary, errors };
}

const RECORD_FEED = String(process.env.RECORD_FEED_ID || '').trim(); // record-only: read this feed's result, send nothing
const DRY = String(process.env.DRY || '').toLowerCase() === 'true'; // check-only: read Amazon's amounts, send nothing, save nothing

// ---- Amazon's own numbers for an order (Orders API) + what was already refunded (Finances API) ----
async function call(sp, args) {
  for (let t = 0; t < 6; t++) {
    try { return await sp.callAPI(args); }
    catch (e) { if (/throttl|QuotaExceeded|429/i.test(String(e.code || e.message))) { await sleep(2500 * (t + 1)); continue; } throw e; }
  }
  throw new Error('Amazon kept saying too many requests');
}
const money = (m) => Number((m && m.Amount) || 0);
async function amazonOrder(sp, orderId, raw) {
  const order = await call(sp, { operation: 'getOrder', endpoint: 'orders', path: { orderId } });
  await sleep(2100);
  let items = [], next = null;
  do {
    const r = await call(sp, { operation: 'getOrderItems', endpoint: 'orders', path: { orderId }, query: next ? { NextToken: next } : {} });
    items = items.concat(r.OrderItems || []); next = r.NextToken; await sleep(2100);
  } while (next);
  let fin = null;
  try {
    fin = await call(sp, { operation: 'listFinancialEventsByOrderId', endpoint: 'finances', path: { orderId }, query: { MaxResultsPerPage: 100 } });
    fin = fin.FinancialEvents || fin;
  } catch (e) { fin = { error: String(e.code || e.message || e).slice(0, 80) }; }
  await sleep(2100);
  if (raw) {
    console.log(`RAW ORDER ${orderId}:`, JSON.stringify({ s: order.OrderStatus, t: order.OrderTotal, pay: order.PaymentMethod }));
    items.forEach((it) => console.log(`RAW ITEM ${orderId}:`, JSON.stringify(it).slice(0, 900)));
    console.log(`RAW FIN ${orderId}:`, JSON.stringify(fin).slice(0, 1500));
  }
  return { order, items, fin };
}

async function submit(sp, rows, tick) {
  if (RECORD_FEED) return readFeed(sp, RECORD_FEED, tick);
  const tsv = [HEAD.join('\t')].concat(rows.map((x) => [x.o, x.i, x.r, 'INR', f2(x.ip), f2(x.it), x.sp || x.stx ? f2(x.sp) : '', x.sp || x.stx ? f2(x.stx) : '',
    '', '', '', '', '', ''].join('\t'))).join('\r\n') + '\r\n';
  const contentType = 'text/tab-separated-values; charset=UTF-8';
  const doc = await sp.callAPI({ operation: 'createFeedDocument', endpoint: 'feeds', body: { contentType } });
  await sp.upload(doc, { content: tsv, contentType });
  const feed = await sp.callAPI({ operation: 'createFeed', endpoint: 'feeds',
    body: { feedType: 'POST_FLAT_FILE_PAYMENT_ADJUSTMENT_DATA', marketplaceIds: [MARKETPLACE_ID], inputFeedDocumentId: doc.feedDocumentId } });
  console.log(`Feed ${feed.feedId} submitted (${rows.length} line(s)).`);
  return readFeed(sp, feed.feedId, tick);
}

async function readFeed(sp, feedId, tick) {
  let info = null;
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) { // up to ~45 min (big files can take Amazon 20+ min)
    await sleep(i < 6 ? 15000 : 30000);
    info = await sp.callAPI({ operation: 'getFeed', endpoint: 'feeds', path: { feedId } });
    console.log(`  feed ${feedId}: ${info.processingStatus}`);
    if (tick) await tick(`Amazon is processing the refund file (${Math.max(1, Math.round((Date.now() - t0) / 60000))} min so far, ${String(info.processingStatus).replace(/_/g, ' ').toLowerCase()})…`).catch(() => {});
    if (['DONE', 'FATAL', 'CANCELLED'].includes(info.processingStatus)) break;
  }
  let report = '';
  if (info && info.resultFeedDocumentId) {
    const rd = await sp.callAPI({ operation: 'getFeedDocument', endpoint: 'feeds', path: { feedDocumentId: info.resultFeedDocumentId } });
    report = String(await sp.download(rd));
  }
  return { feedId, status: info ? info.processingStatus : 'UNKNOWN', report };
}

// Replace the console's calculated split with Amazon's exact numbers (Orders API getOrderItems, 1 call per order).
// Full refund (x.full, or amounts within ₹1 of Amazon's) -> Amazon's exact item/tax/shipping/shipping-tax.
// Partial item refund -> scaled with Amazon's own tax ratio. Shipping only if the line asked for it.
// Cancelled (nothing shipped) / already refunded -> skipped. Promotions / part-refunded -> left for manual refund.
async function fixAmounts(sp, rows, checks, add, tick) {
  const out = [], byOrder = {};
  let calls = 0, n = 0;
  rows.forEach((x) => (byOrder[x.o] = byOrder[x.o] || []).push(x));
  const r2 = (n) => Math.round(n * 100) / 100;
  const total = Object.keys(byOrder).length;
  for (const [o, lines] of Object.entries(byOrder)) {
    n++;
    if (tick && (n === 1 || n % 10 === 0)) await tick(`reading Amazon's exact amounts — order ${n} of ${total}…`).catch(() => {});
    let items;
    try {
      items = []; let next = null;
      do {
        const r = await call(sp, { operation: 'getOrderItems', endpoint: 'orders', path: { orderId: o }, query: next ? { NextToken: next } : {} });
        items = items.concat(r.OrderItems || []); next = r.NextToken; calls++;
        await sleep(calls < 25 ? 250 : 2100); // Amazon allows a burst of ~30 quick calls, then 1 every 2 sec
      } while (next);
    } catch (e) { lines.forEach((x) => add(x, 'error', `Could not read the order from Amazon: ${e.code || e.message || e}`)); continue; }
    const amz = {}; let orderTot = 0;
    items.forEach((it) => {
      const a = { ip: money(it.ItemPrice), it: money(it.ItemTax), sp: money(it.ShippingPrice), stx: money(it.ShippingTax),
        promo: money(it.PromotionDiscount) + money(it.ShippingDiscount), qo: Number(it.QuantityOrdered || 0), qs: Number(it.QuantityShipped || 0) };
      a.tot = r2(a.ip + a.it + a.sp + a.stx); orderTot += a.tot; amz[String(it.OrderItemId)] = a;
    });
    const prior = checks[o] ? Number(checks[o].r || 0) : 0;
    for (const x of lines) {
      const a = amz[String(x.i)];
      if (!a) { add(x, 'error', 'Order item not found on Amazon (item ID changed?) - refund by hand'); continue; }
      if (!a.qo && !a.qs) { add(x, 'skipped', 'Order cancelled on Amazon - buyer was never charged, no refund needed'); continue; }
      if (prior >= orderTot - 1) { add(x, 'skipped', `Already refunded on Amazon (₹${prior})`); continue; }
      if (prior > 0) { add(x, 'error', `Partly refunded before (₹${prior} of ₹${r2(orderTot)}) - finish by hand`); continue; }
      if (a.promo > 0) { add(x, 'error', `Has a promotion discount (₹${a.promo}) - refund by hand with Refund full amount`); continue; }
      const sent = { ip: Number(x.ip || 0), it: Number(x.it || 0), sp: Number(x.sp || 0), stx: Number(x.stx || 0) };
      const wantShip = x.full || sent.sp + sent.stx > 0;
      const itemWant = r2(sent.ip + sent.it), itemFull = r2(a.ip + a.it);
      let ip = a.ip, it = a.it;
      if (!x.full && itemWant < itemFull - 1) { const k = itemWant / itemFull; ip = r2(a.ip * k); it = r2(itemWant - ip); } // partial item refund
      const fixed = Object.assign({}, x, { ip, it, sp: wantShip ? a.sp : 0, stx: wantShip ? a.stx : 0 });
      const before = r2(sent.ip + sent.it + sent.sp + sent.stx), after = r2(fixed.ip + fixed.it + fixed.sp + fixed.stx);
      if (!x.full && after > before + 1) { add(x, 'error', `Amazon amount ₹${after} is more than the console amount ₹${before} - check by hand`); continue; }
      console.log(`  ${o} ${x.i}: console ${f2(sent.ip)}/${f2(sent.it)}/${f2(sent.sp)}/${f2(sent.stx)} -> Amazon ${f2(fixed.ip)}/${f2(fixed.it)}/${f2(fixed.sp)}/${f2(fixed.stx)}`);
      out.push(fixed);
    }
  }
  return out;
}

async function main() {
  let lines;
  if (PROBE) {
    lines = Object.keys(ACCOUNTS).filter((a) => ACCOUNTS[a].token).map((a) => ({ a, o: '000-0000000-0000000', i: '00000000000000', r: 'CustomerCancel', ip: 1, it: 0, sp: 0, stx: 0 }));
    console.log('PROBE: fake order per account - Amazon will reject it, no money moves.');
  } else {
    try { lines = JSON.parse(process.env.LINES || '[]'); } catch (e) { throw new Error('Refund list from the console could not be read.'); }
  }
  if (!Array.isArray(lines) || !lines.length) throw new Error('No refund lines received.');
  const checksSnap = await admin.firestore().collection('aikm_admin').doc('refundChecks').get();
  const checks = (checksSnap.exists && checksSnap.data().orders) || {};
  if (DRY) {
    const res = []; const addD = (x, st, msg) => res.push(`${st.padEnd(7)} ${x.o} ${x.i} ${msg}`);
    for (const a of Object.keys(ACCOUNTS)) {
      const rows = lines.filter((x) => x.a === a); if (!rows.length || !ACCOUNTS[a].token) continue;
      const ok = await fixAmounts(client(ACCOUNTS[a].token), rows, checks, addD);
      ok.forEach((x) => res.push(`send    ${x.o} ${x.i} ${f2(x.ip)}/${f2(x.it)}/${f2(x.sp)}/${f2(x.stx)}`));
    }
    res.forEach((l) => console.log('DRYRES ' + l));
    console.log('DRY run: nothing sent, nothing saved.');
    return;
  }

  const snap = await logRef.get();
  const log = (snap.exists && snap.data().entries) || [];
  const done = new Set(log.filter((e) => e.status === 'done').map((e) => e.i));
  const results = [];
  const add = (x, status, msg, feedId) => results.push({ a: x.a, o: x.o, i: x.i, r: x.r,
    amt: Math.round((Number(x.ip || 0) + Number(x.it || 0) + Number(x.sp || 0) + Number(x.stx || 0)) * 100) / 100,
    ip: Number(x.ip || 0), it: Number(x.it || 0), sp: Number(x.sp || 0), stx: Number(x.stx || 0), // exact split sent (shown in Failed Refunds tab)
    status, msg: String(msg || '').slice(0, 300), feedId: feedId || '', at: nowIso(), by: BY, probe: PROBE });

  const byAcc = {};
  lines.forEach((x) => {
    if (!x || !/^\d{3}-\d{7}-\d{7}$/.test(String(x.o)) || !/^\d{6,20}$/.test(String(x.i))) { add(x || {}, 'error', 'Bad order / item id'); return; }
    if (!REASONS.includes(x.r)) x.r = 'CustomerCancel';
    if (!PROBE && !RECORD_FEED && done.has(x.i)) { add(x, 'skipped', 'Already refunded by the robot earlier'); return; }
    const acc = ACCOUNTS[x.a];
    if (!acc || !acc.token) { add(x, 'skipped', 'Account not connected to Amazon API - use the download file'); return; }
    (byAcc[x.a] = byAcc[x.a] || []).push(x);
  });

  for (const [a, rows] of Object.entries(byAcc)) {
    await setLive('running', `${a}: reading Amazon's exact amounts for ${rows.length} line(s)…`);
    try {
      if (!RECORD_FEED) {
        const fixed = await fixAmounts(client(ACCOUNTS[a].token), rows, checks, add, (msg) => setLive('running', `${a}: ${msg}`));
        rows.length = 0; fixed.forEach((x) => rows.push(x));
        if (!rows.length) continue;
      }
      await setLive('running', `${a}: sending ${rows.length} refund line(s) to Amazon…`);
      const r = await submit(client(ACCOUNTS[a].token), rows, (msg) => setLive('running', `${a}: ${rows.length} line(s) sent — ${msg}`));
      const { summary, errors } = parseReport(r.report);
      console.log(`  ${a} report: ${summary || '(no report text)'}`);
      if (r.report) console.log(r.report.split(/\r?\n/).slice(0, 25).join('\n'));
      if (r.status !== 'DONE') rows.forEach((x) => add(x, 'error', `Amazon feed ${r.status}. ${summary}`, r.feedId));
      else rows.forEach((x, k) => add(x, errors[k + 1] ? 'error' : 'done', errors[k + 1] || 'Refund submitted to Amazon', r.feedId));
    } catch (e) {
      const msg = (e && (e.message || e.code)) || String(e);
      console.error(`  ${a} FAILED:`, msg);
      rows.forEach((x) => add(x, 'error', `Could not send to Amazon: ${msg}`));
    }
  }

  const ok = results.filter((x) => x.status === 'done').length, bad = results.filter((x) => x.status === 'error').length, sk = results.filter((x) => x.status === 'skipped').length;
  const entries = results.concat(log).slice(0, 3000);
  await logRef.set({ entries, last: { at: nowIso(), ok, bad, skipped: sk, probe: PROBE }, live: { state: bad ? 'failed' : 'done', step: `${PROBE ? 'Access test: ' : ''}${ok} refunded · ${bad} failed · ${sk} skipped`, updatedAt: nowIso() } }, { merge: true });
  console.log(`Finished: ${ok} refunded, ${bad} failed, ${sk} skipped.`);
  results.forEach((x) => console.log(`  ${x.status.padEnd(7)} ${x.a} ${x.o} ${x.i} ₹${x.amt} ${x.msg}`));
}

main().catch(async (e) => {
  console.error('REFUND ROBOT FAILED:', e.message || e);
  try { await setLive('failed', String(e.message || e).slice(0, 200)); } catch (x) {}
  process.exit(1);
});
