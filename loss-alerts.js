// loss-alerts.js - every 2 hours: new loss orders of today -> Telegram.
// Same rule and maths as the console's Loss Orders tab (console/loss-tab.js):
//   profit = price x qty + 85% of buyer's shipping - cost x qty - courier - Amazon fee - GST on margin - Rs 3
//   (Amazon orders with cost data in listingIndex); otherwise OMS Guru's own "Expected Profit".
//   Loss order = earns under Rs 15 AND under 10% of the order value. Cancelled orders are ignored.
// Reads: OMS order chunks (OMS project) + listingIndex (one doc per Amazon account) + 1 memory doc.
// Only sends a message when there are NEW loss orders since the last report.
const admin = require('firebase-admin');
const { notify, esc, LINE } = require('./telegram');

const MIN_PROFIT = 15, MIN_PCT = 0.10;
const IST = 5.5 * 3600e3;
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const inr = (n) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const acctName = (ch) => String(ch || '').replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, '').trim();
const chShort = (ch) => (/(Amazon|Meesho|Flipkart|Snapdeal|Shopify)/i.exec(ch || '') || [''])[0];
const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function ymd(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].toLowerCase()]) return `${m[3]}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
const timeLbl = (ms) => new Date(ms + IST).toISOString().slice(11, 16).replace(/^(\d\d):(\d\d)$/, (_, h, mi) => `${(+h % 12) || 12}:${mi} ${+h < 12 ? 'am' : 'pm'}`);

(async () => {
  const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
  const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
  const now = Date.now(), today = new Date(now + IST).toISOString().slice(0, 10);

  const [chunks, lixS, stS] = await Promise.all([
    oms.collection('aikm_admin').doc('omsOrders').collection('chunks').get(),
    main.collection('listingIndex').get(),
    main.collection('aikm_admin').doc('lossAlerts').get(),
  ]);
  const lix = {}; lixS.forEach((d) => { lix[d.id] = d.data() || {}; });
  const lixKeys = Object.keys(lix);
  const acctKey = (ch) => { const n = acctName(ch).toLowerCase().replace(/[^a-z0-9]/g, ''); return lixKeys.find((k) => n === k) || lixKeys.find((k) => n.startsWith(k) || k.startsWith(n)) || ''; };
  const listing = (o) => {
    const ix = lix[acctKey(o.channel)]; if (!ix) return null;
    const skus = ix.skus || {}; let sku = o.sku;
    if (!skus[sku]) { const ol = (ix.orders || {})[o.channelOrderId] || []; if (ol.length === 1) sku = ol[0].s; }
    return skus[sku] || null;
  };
  const ourProfit = (o, L) => {
    if (!L || L.c == null || L.k == null) return null;
    const price = num(o.price), q = Math.max(1, num(o.qty) || 1); if (!(price > 0)) return null;
    const g = (L.g != null ? L.g : 5) / 100, fee = L.fp != null ? L.fp : 2;
    const courier = L.k * (1 + 0.25 * (q - 1));
    const gst = g > 0 ? (price - L.c) * g / (1 + g) * q : 0;
    return Math.round(price * q + 0.85 * num(o.shippingCharge) - L.c * q - courier - fee * q - gst - 3);
  };

  // today's loss orders
  const loss = [];
  chunks.forEach((d) => (d.data().orders || []).forEach((o) => {
    if (/cancel/i.test(o.status || '') || ymd(o.orderDate) !== today) return;
    const L = /amazon/i.test(o.channel || '') ? listing(o) : null, mine = ourProfit(o, L);
    const pr = mine != null ? mine : num(o.profit);
    if (pr >= Math.min(MIN_PROFIT, MIN_PCT * num(o.total))) return;
    loss.push({ key: `${o.channelOrderId || o.invoiceNumber}|${o.sku}`, id: o.channelOrderId || o.invoiceNumber, name: o.productName || o.sku || 'Unknown product', sku: o.sku || '', acct: acctName(o.channel), ch: chShort(o.channel), profit: pr, total: num(o.total), src: mine != null ? 'ours' : 'OMS' });
  }));

  let st = stS.exists ? stS.data() : {};
  if (st.date !== today) st = { date: today, sent: {}, lastAt: 0 };
  const fresh = loss.filter((x) => !st.sent[x.key]);
  const since = st.lastAt ? `since ${timeLbl(st.lastAt)}` : 'today';

  if (fresh.length) {
    const lost = fresh.filter((x) => x.profit < 0).reduce((a, x) => a - x.profit, 0);
    const g = {};
    fresh.forEach((x) => { const k = `${x.acct}|${x.sku || x.name}`; const r = g[k] || (g[k] = { name: x.name, acct: x.acct, ch: x.ch, n: 0, profit: 0 }); r.n++; r.profit += x.profit; });
    const top = Object.values(g).sort((a, b) => a.profit - b.profit);
    const allLost = loss.filter((x) => x.profit < 0).reduce((a, x) => a - x.profit, 0);
    const msg = [
      `📉 <b>Loss orders</b>  <i>${esc(since)}</i>`,
      LINE,
      `<b>${fresh.length}</b> new loss order${fresh.length > 1 ? 's' : ''}${lost ? `   💸 <b>${inr(lost)}</b> lost` : ''}`,
      '\n<b>Products</b>',
      ...top.slice(0, 8).map((r) => `• <b>${esc(r.name.slice(0, 60))}</b>\n   ${esc(r.acct)}${r.ch ? ` · ${esc(r.ch)}` : ''} — ${r.n} order${r.n > 1 ? 's' : ''} · <b>${inr(r.profit / r.n)}</b>/order`),
      top.length > 8 ? `<i>+ ${top.length - 8} more products in the console</i>` : '',
      `\n<b>Today so far</b>   ${loss.length} loss orders${allLost ? ` · ${inr(allLost)} lost` : ''}`,
      '<i>Fix prices: Console → Loss Orders</i>',
    ].filter((x) => x !== '').join('\n');
    await notify(msg, { html: true });
  }
  fresh.forEach((x) => { st.sent[x.key] = 1; });
  st.lastAt = now;
  st.today = { n: loss.length, lost: Math.round(loss.filter((x) => x.profit < 0).reduce((a, x) => a - x.profit, 0)), at: timeLbl(now) };
  await main.collection('aikm_admin').doc('lossAlerts').set(st);
  console.log(`Loss orders ${today}: ${loss.length} today, ${fresh.length} new${fresh.length ? ' - sent to Telegram' : ' - nothing to send'}. Read ${chunks.size} order chunks.`);
})().catch((e) => { console.error('LOSS ALERTS FAILED:', e.message); process.exit(1); });
