// refund-propose.js — "Ready to refund" list for the console's Bulk Refund tab + Telegram alert.
// Never refunds anything itself: it only lines orders up. Money moves when the owner presses
// "Approve & refund" in the console (which shows a confirm box first).
//
// Picks: SELF-SHIP Amazon orders whose latest NimbusPost shipment is RTO initiated / in transit / received
// (rto, rto_delivered). Skips: already refunded (refund robot log, Amazon refund records, Amazon returns
// report), marked "Don't refund" in the console, cancelled-before-shipping orders.
// Order lines (item id, price, tax, shipping) come from OMS Guru data: 60-day refund list, then 15-day sync.
//
// Reads : main Firebase  nimbusDash/*, aikm_admin/refundSkip
//         OMS Firebase   aikm_admin/omsRefundOrders, aikm_admin/omsOrders/chunks, aikm_admin/refundLog,
//                        aikm_admin/refundChecks, aikm_admin/rtoIndex
// Writes: OMS Firebase   aikm_admin/refundProposals { items, count, amount, at, hash, notified }
//         (only when something changed)

const admin = require('firebase-admin');
const crypto = require('crypto');
const { notify, istNow, esc, LINE } = require('./telegram');

const omsApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
const omsDb = omsApp.firestore(), db = mainApp.firestore();
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const base = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').trim().replace(/_\d+$/, '');
const r2 = (n) => Math.round((n + 1e-9) * 100) / 100;
const accName = (ch) => String(ch || '').replace(/\s*-\s*amazon\s*$/i, '').trim();
const isAmazon = (ch) => /amazon/i.test(ch || '') && !/fba/i.test(ch || '');
// same maths as the console's refund table (item + shipping, incl. tax)
function amount(o) {
  const sp = (g) => { const unit = r2(g / (1 + o.t / 100)), net = r2(unit * o.q); return [net, r2(g * o.q - net)]; };
  const a = sp(o.p), b = sp(o.s); return r2(a[0] + a[1] + b[0] + b[1]);
}
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const short = (a) => /praso/i.test(a) ? 'Praso' : /sasta/i.test(a) ? 'Sasta Store' : a;

async function main() {
  // ---- 1. NimbusPost: latest live shipment per order ----
  const latest = {};
  (await db.collection('nimbusDash').get()).forEach((d) => {
    if (d.id === '_meta') return;
    let rows = d.data().rows; if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch (e) { rows = []; } }
    (rows || []).forEach((r) => {
      const id = base(r.o); if (!/^\d{3}-\d{7}-\d{7}$/.test(id) || r.b === 'cancelled') return;
      if (!latest[id] || String(r.cr || '') > String(latest[id].cr || '')) latest[id] = r;
    });
  });
  const rto = Object.entries(latest).filter(([, r]) => /^rto/.test(r.b || ''));
  console.log(`NimbusPost: ${Object.keys(latest).length} self-ship orders, ${rto.length} with RTO started or received.`);

  // ---- 2. order lines from OMS Guru data ----
  const lines = {};
  const add = (o) => { const l = lines[o.o] = lines[o.o] || []; if (o.i && !l.some((x) => x.i === o.i)) l.push(o); };
  const rf = (await omsDb.collection('aikm_admin').doc('omsRefundOrders').get()).data() || {};
  (rf.orders || []).forEach((o) => add({ a: o.a, o: o.o, i: o.i, q: o.q || 1, p: o.p, s: o.s, t: o.t, st: o.st, d: o.d, ty: o.ty, n: o.n, db: o.db || '' }));
  (await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.data().orders || []).forEach((o) => {
    if (!isAmazon(o.channel)) return;
    const id = base(o.channelOrderId); if (!id || (lines[id] && lines[id].length)) return;
    add({ a: accName(o.channel), o: id, i: String(o.channelSubOrderId || '').trim(), q: num(o.qty) || 1, p: num(o.price), s: num(o.shippingCharge), t: num(o.taxRate),
      st: o.status || '', d: o.orderDate || '', ty: o.orderType || '', n: String(o.productName || o.sku || '').slice(0, 60) });
  }));
  // fix: an order seen in both sources keeps the 60-day lines only
  // ---- 3. already refunded / skipped ----
  const done = new Set(), doneOrder = new Set();
  const log = (await omsDb.collection('aikm_admin').doc('refundLog').get()).data() || {};
  (log.entries || []).forEach((e) => { if (e.status === 'done' && !e.probe) { done.add(e.i); doneOrder.add(e.o); } });
  try { Object.keys(((await omsDb.collection('aikm_admin').doc('refundChecks').get()).data() || {}).orders || {}).forEach((id) => doneOrder.add(id)); } catch (e) {}
  try { JSON.parse(((await omsDb.collection('aikm_admin').doc('rtoIndex').get()).data() || {}).rows || '[]').forEach((r) => { if (r.ref > 0) doneOrder.add(r.o); }); } catch (e) {}
  const skip = ((await db.collection('aikm_admin').doc('refundSkip').get()).data() || {}).m || {};
  let dbIdx = {};
  try { (await db.collection('deliverByIndex').get()).forEach((d) => Object.assign(dbIdx, (d.data() || {}).orders || {})); } catch (e) {}

  // ---- 4. build the list ----
  const items = [], why = { noLines: 0, refunded: 0, skipped: 0, cancelled: 0 };
  rto.forEach(([id, r]) => {
    const ls = lines[id];
    if (!ls || !ls.length) { why.noLines++; return; }
    if (doneOrder.has(id)) { why.refunded++; return; }
    if (skip[id]) { why.skipped++; return; }
    ls.forEach((o) => {
      if (done.has(o.i)) { why.refunded++; return; }
      if (/^cancelled( before shipping)?$/i.test(String(o.st || '').trim())) { why.cancelled++; return; }
      items.push(Object.assign({}, o, {
        nb: r.b === 'rto_delivered' ? 'rto_delivered' : 'rto', ns: String(r.st || r.b).replace(/_/g, ' '), aw: r.a || '', c: r.c || '',
        nd: String((r.b === 'rto_delivered' ? r.dl || r.ls : r.ls) || '').slice(0, 10), db: o.db || dbIdx[id] || '', amt: amount(o), robot: 1 }));
    });
  });
  items.sort((x, y) => String(y.nd).localeCompare(String(x.nd)));
  const total = r2(items.reduce((s, o) => s + o.amt, 0));
  console.log(`Ready to refund: ${items.length} line(s), ${new Set(items.map((o) => o.o)).size} order(s), ${inr(total)}. Left out: ${JSON.stringify(why)}`);

  // ---- 5. save (only when changed) ----
  const ref = omsDb.collection('aikm_admin').doc('refundProposals');
  const prev = (await ref.get()).data() || {};
  const notified = prev.notified || {};
  const hash = crypto.createHash('md5').update(JSON.stringify(items)).digest('hex');

  // ---- 6. Telegram: only orders not announced before, and not at night ----
  const now = istNow();
  const fresh = [...new Set(items.map((o) => o.o))].filter((id) => !notified[id]);
  let sent = false;
  if (fresh.length && now.hour >= 8 && now.hour < 22) {
    const f = items.filter((o) => fresh.includes(o.o));
    const by = {}; f.forEach((o) => { const b = by[o.a] = by[o.a] || { n: new Set(), amt: 0 }; b.n.add(o.o); b.amt += o.amt; });
    const back = new Set(f.filter((o) => o.nb === 'rto_delivered').map((o) => o.o)).size;
    const msg = `🔁 <b>${fresh.length} returned order${fresh.length > 1 ? 's' : ''} ready to refund</b> · self-ship\n${LINE}\n` +
      Object.entries(by).map(([a, b]) => `${esc(short(a))}: ${b.n.size} · ${inr(b.amt)}`).join('\n') +
      `\n\nRTO received: ${back} · RTO on the way: ${fresh.length - back}` +
      `\nWaiting in total: ${new Set(items.map((o) => o.o)).size} order(s) · ${inr(total)}` +
      `\n\n👉 Admin Console → <b>Bulk Refund</b> → 🤖 Ready to refund → Approve`;
    if (DRY) console.log('DRY — Telegram message would be:\n' + msg);
    else sent = await notify(msg, { html: true });
  } else if (fresh.length) console.log(`${fresh.length} new order(s) — Telegram alert waits for daytime (8 AM–10 PM).`);
  if (sent) fresh.forEach((id) => { notified[id] = now.date; });
  const cut = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  Object.keys(notified).forEach((k) => { if (notified[k] < cut) delete notified[k]; });

  if (DRY) { console.log('DRY — nothing saved. Sample:', JSON.stringify(items.slice(0, 2))); return; }
  if (prev.hash === hash && !sent) { console.log('No change — nothing written.'); return; }
  await ref.set({ items, count: items.length, orders: new Set(items.map((o) => o.o)).size, amount: total, hash, notified, why, at: admin.firestore.FieldValue.serverTimestamp() });
  console.log('Saved.');
}

main().catch((e) => { console.error('REFUND PROPOSE FAILED:', e.message || e); process.exit(1); });
