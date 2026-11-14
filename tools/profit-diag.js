// One-off check (owner 14 Nov 2026): why our expected profit differs from OMS Guru's. Read-only. ~30 reads.
const admin = require('firebase-admin');
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
(async () => {
  const lix = {}; (await main.collection('listingIndex').get()).forEach((d) => (lix[d.id] = d.data()));
  const orders = []; (await oms.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.get('orders') || []).forEach((o) => orders.push(o)));
  const acctOf = (ch) => { const n = String(ch || '').toLowerCase().replace(/ - amazon.*$/, '').replace(/[^a-z0-9]/g, ''); return Object.keys(lix).find((k) => n === k || n.startsWith(k) || k.startsWith(n)) || ''; };
  const rows = [];
  for (const o of orders) {
    if (!/amazon/i.test(o.channel || '') || String(o.awb || '').trim() || !/^(new|ready to ship|pending|confirmed)$/i.test(String(o.status || '').trim())) continue;
    const a = acctOf(o.channel), ix = lix[a]; if (!ix) continue;
    let sku = o.sku; if (!ix.skus[sku]) { const ol = (ix.orders || {})[nid(o.channelOrderId)] || []; if (ol.length === 1) sku = ol[0].s; }
    const L = ix.skus[sku]; if (!L || L.c == null || L.k == null) continue;
    const price = num(o.price), q = Math.max(1, num(o.qty) || 1), ship = num(o.shippingCharge), g = (L.g ?? 5) / 100, fee = L.fp ?? 2;
    const courier = L.k * (1 + 0.25 * (q - 1)), gst = g > 0 ? (price - L.c) * g / (1 + g) * q : 0;
    const ours = price * q + 0.85 * ship * q - L.c * q - courier - fee * q - gst - 3, om = num(o.profit), cogs = num(o.cogs);
    rows.push({ id: nid(o.channelOrderId), a, sku, nm: String(o.productName || '').slice(0, 40), price, q, ship, total: num(o.total), c: L.c, cogs, k: L.k, fee, g: L.g, gst: Math.round(gst), ours: Math.round(ours), oms: Math.round(om), d: Math.round(ours - om) });
  }
  const avg = (f) => Math.round(rows.reduce((s, r) => s + f(r), 0) / Math.max(1, rows.length) * 10) / 10;
  console.log('ROWS', rows.length, 'avg ours', avg((r) => r.ours), 'avg oms', avg((r) => r.oms), 'avg diff', avg((r) => r.d), 'avg |diff|', avg((r) => Math.abs(r.d)));
  console.log('avg our cost', avg((r) => r.c * r.q), 'avg OMS cogs', avg((r) => r.cogs), 'avg courier', avg((r) => r.k), 'avg fee', avg((r) => r.fee), 'avg gst', avg((r) => r.gst), 'avg ship collected', avg((r) => r.ship));
  // what would OMS profit look like = price*q - cogs - X ?  print implied "other costs" of OMS
  console.log('avg OMS implied costs (price*q + ship - cogs - omsProfit)', avg((r) => r.price * r.q + r.ship - r.cogs - r.oms), ' ours (courier+fee+gst+3-0.15ship)', avg((r) => r.k + r.fee * r.q + r.gst + 3 - 0.15 * r.ship));
  console.log('cogs 0 count', rows.filter((r) => !r.cogs).length, ' |cost-cogs|>20%', rows.filter((r) => r.cogs && Math.abs(r.c * r.q - r.cogs) > 0.2 * r.cogs).length);
  rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  rows.slice(0, 40).forEach((r) => console.log('ROW', JSON.stringify(r)));
  const byQ = rows.filter((r) => r.q > 1); const q1 = rows.filter((r) => r.q === 1); console.log('qty=1 rows', q1.length, 'avg diff', Math.round(q1.reduce((s, r) => s + r.d, 0) / Math.max(1, q1.length)), 'avg cost diff', Math.round(q1.reduce((s, r) => s + (r.c - r.cogs), 0) / Math.max(1, q1.length)));
  console.log('qty>1 rows', byQ.length, 'avg diff', Math.round(byQ.reduce((s, r) => s + r.d, 0) / Math.max(1, byQ.length)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
