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

async function submit(sp, rows) {
  if (RECORD_FEED) return readFeed(sp, RECORD_FEED);
  const tsv = [HEAD.join('\t')].concat(rows.map((x) => [x.o, x.i, x.r, 'INR', f2(x.ip), f2(x.it), x.sp || x.stx ? f2(x.sp) : '', x.sp || x.stx ? f2(x.stx) : '',
    '', '', '', '', '', ''].join('\t'))).join('\r\n') + '\r\n';
  const contentType = 'text/tab-separated-values; charset=UTF-8';
  const doc = await sp.callAPI({ operation: 'createFeedDocument', endpoint: 'feeds', body: { contentType } });
  await sp.upload(doc, { content: tsv, contentType });
  const feed = await sp.callAPI({ operation: 'createFeed', endpoint: 'feeds',
    body: { feedType: 'POST_FLAT_FILE_PAYMENT_ADJUSTMENT_DATA', marketplaceIds: [MARKETPLACE_ID], inputFeedDocumentId: doc.feedDocumentId } });
  console.log(`Feed ${feed.feedId} submitted (${rows.length} line(s)).`);
  return readFeed(sp, feed.feedId);
}

async function readFeed(sp, feedId) {
  let info = null;
  for (let i = 0; i < 60; i++) { // up to ~20 min
    await sleep(i < 6 ? 15000 : 30000);
    info = await sp.callAPI({ operation: 'getFeed', endpoint: 'feeds', path: { feedId } });
    console.log(`  feed ${feedId}: ${info.processingStatus}`);
    if (['DONE', 'FATAL', 'CANCELLED'].includes(info.processingStatus)) break;
  }
  let report = '';
  if (info && info.resultFeedDocumentId) {
    const rd = await sp.callAPI({ operation: 'getFeedDocument', endpoint: 'feeds', path: { feedDocumentId: info.resultFeedDocumentId } });
    report = String(await sp.download(rd));
  }
  return { feedId, status: info ? info.processingStatus : 'UNKNOWN', report };
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

  const snap = await logRef.get();
  const log = (snap.exists && snap.data().entries) || [];
  const done = new Set(log.filter((e) => e.status === 'done').map((e) => e.i));
  const results = [];
  const add = (x, status, msg, feedId) => results.push({ a: x.a, o: x.o, i: x.i, r: x.r,
    amt: Math.round((Number(x.ip || 0) + Number(x.it || 0) + Number(x.sp || 0) + Number(x.stx || 0)) * 100) / 100,
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
    await setLive('running', `${a}: sending ${rows.length} refund line(s) to Amazon…`);
    try {
      const r = await submit(client(ACCOUNTS[a].token), rows);
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
