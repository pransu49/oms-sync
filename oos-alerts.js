// oos-alerts.js - LOTS low-stock alerts on Telegram, only for LOTS products MAPPED to an Amazon ASIN
// (aikm_admin/spapiAsinLotsMap - the same mapping the SP-API robot uses).
//   - LOTS stock below LOW_QTY (12) -> "Low stock / out of stock" alert with the current LOTS stock
//     and the Amazon listings (account, SKU, Amazon stock) that use it
//   - back to 12 or more -> "Back in stock" line
// Cheap on Firebase: reads 1 small record (LOTS upload time) and stops when the LOTS stock was not
// re-uploaded since the last check. Only on a new upload it reads the catalogue (~25 records) and
// the OMS orders (sales of the last 30 days, OMS project) to put the best sellers first.
const admin = require('firebase-admin');
const { notify, esc } = require('./telegram');
const { lowStockPdf, sendTelegramPdf } = require('./picklist-pdf');

const LOW_QTY = 12;
const BAR = '━━━━━━━━━━━━━━━━';
const IST = 5.5 * 3600e3;
const timeLbl = (ms) => new Date(ms + IST).toISOString().slice(11, 16).replace(/^(\d\d):(\d\d)$/, (_, h, mi) => `${(+h % 12) || 12}:${mi} ${+h < 12 ? 'am' : 'pm'}`);
const ACC = { praso: 'Praso', sastastore: 'Sasta Store' };
const SALES_DAYS = 30;
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function ymd(x) {
  const t = String(x || '').trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = t.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].toLowerCase()]) return `${m[3]}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}

(async () => {
  const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }).firestore();
  const A = db.collection('aikm_admin');
  const [parent, stS] = await Promise.all([A.doc('lotsCatalog').get(), A.doc('oosAlerts').get()]);
  const stamp = JSON.stringify(parent.exists ? parent.get('savedAt') ?? null : null);
  const st = stS.exists ? stS.data() : {};
  // daily report at 2 pm and 9 pm (SLOT = "YYYY-MM-DD-14" / "-21"): always the full report, once per slot
  const slot = (process.env.SLOT || '').trim();
  if (slot && st.slot === slot) { console.log(`Report for ${slot} already sent - nothing to do (1 read).`); return; }
  const force = process.env.FORCE === 'true' || !!slot;
  if (!force && st.stamp === stamp) { console.log('LOTS stock not re-uploaded since the last check - nothing to do (1 read).'); return; }

  const [chunks, mapS, lixS, map2S] = await Promise.all([A.doc('lotsCatalog').collection('chunks').get(), A.doc('spapiAsinLotsMap').get(), db.collection('listingIndex').get(), A.doc('spapiAsinLotsMap2').get().catch(() => null)]);
  const lots = {};
  chunks.forEach((d) => (d.data().products || []).forEach((p) => { if (p && p.code != null) lots[String(p.code)] = p; }));
  if (Object.keys(lots).length < 500) { console.log(`LOTS catalogue looks incomplete (${Object.keys(lots).length} products) - no alerts.`); return; }
  const map = { ...((mapS.exists && mapS.data().map) || {}), ...((map2S && map2S.exists && map2S.data().map) || {}) };   // + overflow record (24 Oct 2026)

  // ASIN -> Amazon listings (account, SKU, Amazon stock)
  const byAsin = {};
  lixS.forEach((d) => Object.entries((d.data() || {}).skus || {}).forEach(([sku, x]) => { if (x && x.a) (byAsin[x.a] = byAsin[x.a] || []).push({ acct: ACC[d.id] || d.id, sku, q: x.q }); }));

  // every LOTS product that a mapped ASIN uses (combos: every part)
  const used = {}; // code -> { p, asins:Set }
  Object.entries(map).forEach(([asin, m]) => {
    if (!m || (m.vendorName && String(m.vendorName).toUpperCase() !== 'LOTS')) return;
    const parts = Array.isArray(m.parts) && m.parts.length ? m.parts : (m.code ? [{ code: m.code, qty: 1 }] : []);
    parts.forEach((x) => { const c = String(x.code || ''); if (!c || !lots[c]) return; (used[c] = used[c] || { p: lots[c], asins: new Set() }).asins.add(asin); });
  });

  // units sold per ASIN in the last 30 days (OMS Guru orders, Amazon only, not cancelled)
  const soldAsin = {};
  try {
    const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
    const skuAsin = {}; lixS.forEach((d) => Object.entries((d.data() || {}).skus || {}).forEach(([sku, x]) => { if (x && x.a) skuAsin[sku] = x.a; }));
    const from = new Date(Date.now() + IST - SALES_DAYS * 864e5).toISOString().slice(0, 10);
    const ord = await oms.collection('aikm_admin').doc('omsOrders').collection('chunks').get();
    ord.forEach((d) => (d.data().orders || []).forEach((o) => {
      if (!/amazon/i.test(o.channel || '') || /cancel/i.test(o.status || '')) return;
      const day = ymd(o.orderDate); if (!day || day < from) return;
      const asin = (o.asin && /^[A-Z0-9]{10}$/.test(o.asin) ? o.asin : '') || skuAsin[o.sku]; if (!asin) return;
      soldAsin[asin] = (soldAsin[asin] || 0) + Math.max(1, num(o.qty) || 1);
    }));
    console.log(`Sales: read ${ord.size} OMS order chunks.`);
  } catch (e) { console.log('Sales numbers skipped:', e.message); }
  const soldOf = (c) => [...used[c].asins].reduce((a, x) => a + (soldAsin[x] || 0), 0);

  const low = {};
  Object.entries(used).forEach(([c, u]) => { const q = parseFloat(u.p.qty); if (!isNaN(q) && q < LOW_QTY) low[c] = Math.max(0, Math.floor(q)); });
  const prev = st.low || {};
  const fresh = Object.keys(low).filter((c) => !(c in prev) || low[c] < prev[c]);           // newly low, or dropped further
  const back = Object.keys(prev).filter((c) => !(c in low) && used[c]);                      // recovered to 12+


  if (fresh.length || back.length || force) {   // "Run workflow" with force = always send the full report
    const freshSet = new Set(fresh);
    const all = Object.keys(low).sort((a, b) => soldOf(b) - soldOf(a) || low[a] - low[b]);   // best sellers first
    const oos = Object.values(low).filter((q) => q === 0).length;
    const top = all.filter((c) => soldOf(c) > 0).slice(0, 10);
    const row = (c, k) => {
      const q = low[c], name = String(used[c].p.name || 'LOTS product').slice(0, 60);
      const L = []; used[c].asins.forEach((a) => (byAsin[a] || []).forEach((x) => L.push(x)));
      const skus = L.slice(0, 2).map((x) => `${esc(x.acct)} <code>${esc(x.sku)}</code>`).join('  ·  ') || `ASIN <code>${esc([...used[c].asins][0])}</code>`;
      return [`${q === 0 ? '⛔' : q <= 5 ? '🔴' : '🟠'} <b>${k + 1}. ${esc(name)}</b>${freshSet.has(c) ? '  🆕' : ''}`,
        `      🔥 Sold <b>${soldOf(c)}</b> in ${SALES_DAYS}d  ·  LOTS stock <b>${q === 0 ? 'OUT' : q}</b>${prev[c] != null && prev[c] !== q ? ` <i>(was ${prev[c]})</i>` : ''}`,
        `      ${skus}`].join('\n');
    };
    const msg = [
      '📦 <b>LOTS LOW STOCK ALERT</b>',
      `<i>${slot ? 'Daily report' : 'Stock check'} · ${timeLbl(Date.now())}</i>`,
      BAR,
      `📉 Below ${LOW_QTY}   <b>${all.length}</b>   ·   ⛔ Out   <b>${oos}</b>`,
      `🆕 Newly low   <b>${fresh.length}</b>   ·   ✅ Back   <b>${back.length}</b>`,
      BAR,
      top.length ? `🔥 <b>TOP SELLING — RESTOCK FIRST</b>\n\n` + top.map(row).join('\n\n') : '<i>None of the low-stock products sold in the last 30 days.</i>',
      back.length ? `${BAR}\n✅ <b>Back in stock</b> (${LOW_QTY}+)\n` + back.slice(0, 8).map((c) => `• ${esc(String(used[c].p.name || c).slice(0, 55))}  · <b>${Math.floor(parseFloat(used[c].p.qty))}</b>`).join('\n') + (back.length > 8 ? `\n<i>+ ${back.length - 8} more</i>` : '') : '',
      BAR,
      `📄 <i>Full list of ${all.length} products in the PDF below (best sellers first)</i>`,
    ].filter((x) => x !== '').join('\n');
    await notify(msg, { html: true });
    try {
      const today = new Date(Date.now() + IST).toISOString().slice(0, 10);
      const rows = all.map((c) => { const L = []; used[c].asins.forEach((a) => (byAsin[a] || []).forEach((x) => L.push(x))); return { name: used[c].p.name || c, code: c, stock: low[c], sold: soldOf(c), listings: L }; });
      const pdf = await lowStockPdf({ date: today, rows, limit: LOW_QTY, days: SALES_DAYS });
      await sendTelegramPdf(`LOTS_Low_Stock_${today}.pdf`, pdf, `📦 LOTS low stock — ${all.length} products below ${LOW_QTY} · ${oos} out of stock\nBest sellers (last ${SALES_DAYS} days) first`);
    } catch (e) { console.log('Low stock PDF failed:', e.message); }
  }
  await A.doc('oosAlerts').set({ stamp, low, checkedAt: Date.now(), mapped: Object.keys(used).length, slot: slot || st.slot || null });
  console.log(`LOTS: ${Object.keys(used).length} mapped products, ${Object.keys(low).length} below ${LOW_QTY} (${fresh.length} new, ${back.length} back in stock)${fresh.length || back.length ? ' - sent to Telegram' : ''}.`);
})().catch((e) => { console.error('OOS ALERTS FAILED:', e.message); process.exit(1); });
