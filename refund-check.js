// refund-check.js
// Reads Amazon's own refund records (Finances API: listFinancialEventsByOrderId -> RefundEventList)
// so the Bulk Refund tab knows which orders were ALREADY refunded - however they were refunded
// (robot, manual in Seller Central, file upload, A-to-z...). Read-only: never changes anything on Amazon.
//
// Used by: refund-check.yml (after each refund-list sync), and refund-robot.js (just before sending).
// Saves to aikm-oms-sync Firestore aikm_admin/refundChecks: { orders: { orderId: { r: amount, at: date } }, checked: { orderId: date } }

const SellingPartnerAPI = require('amazon-sp-api');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ACCOUNTS = {
  'SASTA STORE': process.env.SPAPI_REFRESH_TOKEN_SASTASTORE,
  'PRASO ENTERPRISES': process.env.SPAPI_REFRESH_TOKEN_PRASO,
};
const clients = {};
function client(acc) {
  const token = ACCOUNTS[acc]; if (!token) return null;
  return clients[acc] = clients[acc] || new SellingPartnerAPI({
    region: 'eu', refresh_token: token,
    credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET },
  });
}
const amt = (m) => Number((m && (m.CurrencyAmount ?? m.Amount)) || 0);

// -> { refunded: total amount given back to the buyer (positive number), at: 'YYYY-MM-DD' } or null
async function refundOf(acc, orderId, raw) {
  const sp = client(acc); if (!sp) return undefined; // account not on SP-API
  let res;
  for (let t = 0; t < 5; t++) {
    try { res = await sp.callAPI({ operation: 'listFinancialEventsByOrderId', endpoint: 'finances', path: { orderId }, query: { MaxResultsPerPage: 100 } }); break; }
    catch (e) { if (/throttl|QuotaExceeded|429/i.test(String(e.code || e.message))) { await sleep(3000 * (t + 1)); continue; } throw e; }
  }
  const ev = (res && (res.FinancialEvents || res)) || {};
  if (raw) console.log(`RAW ${acc} ${orderId}:`, JSON.stringify(ev).slice(0, 1500));
  let total = 0, at = '';
  (ev.RefundEventList || []).forEach((r) => {
    (r.ShipmentItemAdjustmentList || []).forEach((it) => {
      (it.ItemChargeAdjustmentList || []).forEach((c) => { total += amt(c.ChargeAmount); });
      (it.PromotionAdjustmentList || []).forEach((c) => { total += amt(c.PromotionAmount); });
    });
    if (r.PostedDate && r.PostedDate > at) at = r.PostedDate;
  });
  total = Math.round(-total * 100) / 100; // refunds are negative charges
  return total > 0 ? { refunded: total, at: String(at).slice(0, 10) } : null;
}

module.exports = { refundOf, hasAccount: (a) => !!ACCOUNTS[a] };

// ---- run on its own: check the refund list (or PROBE_ORDERS) ----
if (require.main === module) (async () => {
  const admin = require('firebase-admin');
  const probe = String(process.env.PROBE_ORDERS || '').trim();
  if (probe) { // "ACCOUNT:orderId,ACCOUNT:orderId"
    for (const pair of probe.split(',')) {
      const [acc, id] = pair.split(':').map((x) => x.trim());
      try { console.log(acc, id, '->', JSON.stringify(await refundOf(acc, id, true))); }
      catch (e) { console.log(acc, id, 'ERROR', e.code || '', e.message || e); }
      await sleep(2100);
    }
    return;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const listDoc = await db.collection('aikm_admin').doc('omsRefundOrders').get();
  const ref = db.collection('aikm_admin').doc('refundChecks');
  const prev = (await ref.get()).data() || {};
  const known = prev.orders || {};
  const orders = {};
  ((listDoc.data() || {}).orders || []).forEach((o) => { if (ACCOUNTS[o.a]) orders[o.o] = o.a; });
  const todo = Object.keys(orders).filter((id) => !known[id]); // already-refunded orders are never re-checked
  console.log(`Checking ${todo.length} order(s) with Amazon (already known refunded: ${Object.keys(known).length}).`);
  const found = {}, errors = {};
  for (const id of todo) {
    try { const r = await refundOf(orders[id], id); if (r) found[id] = { r: r.refunded, at: r.at, a: orders[id] }; }
    catch (e) { errors[e.code || 'error'] = (errors[e.code || 'error'] || 0) + 1; }
    await sleep(2100); // Amazon allows about 1 call / 2 s
  }
  const merged = Object.assign({}, known, found);
  const keep = new Set(Object.keys(orders));
  Object.keys(merged).forEach((id) => { if (!keep.has(id) && merged[id].at < new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)) delete merged[id]; });
  await ref.set({ orders: merged, at: admin.firestore.FieldValue.serverTimestamp(), lastRun: { checked: todo.length, newlyRefunded: Object.keys(found).length, errors } });
  console.log(`Already refunded on Amazon: ${Object.keys(found).length} new, ${Object.keys(merged).length} total. Errors: ${JSON.stringify(errors)}`);
  Object.entries(found).forEach(([id, v]) => console.log(`  ${v.a} ${id} refunded ₹${v.r} on ${v.at}`));
})().catch((e) => { console.error('REFUND CHECK FAILED:', e.message || e); process.exit(1); });
