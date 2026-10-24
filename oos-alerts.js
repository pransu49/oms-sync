// oos-alerts.js - LOTS low-stock alerts on Telegram, only for LOTS products MAPPED to an Amazon ASIN
// (aikm_admin/spapiAsinLotsMap - the same mapping the SP-API robot uses).
//   - LOTS stock below LOW_QTY (12) -> "Low stock / out of stock" alert with the current LOTS stock
//     and the Amazon listings (account, SKU, Amazon stock) that use it
//   - back to 12 or more -> "Back in stock" line
// Cheap on Firebase: reads 1 small record (LOTS upload time) and stops when the LOTS stock was not
// re-uploaded since the last check. Only on a new upload it reads the catalogue (~25 records).
const admin = require('firebase-admin');
const { notify, esc } = require('./telegram');

const LOW_QTY = 12;
const BAR = '━━━━━━━━━━━━━━━━';
const IST = 5.5 * 3600e3;
const timeLbl = (ms) => new Date(ms + IST).toISOString().slice(11, 16).replace(/^(\d\d):(\d\d)$/, (_, h, mi) => `${(+h % 12) || 12}:${mi} ${+h < 12 ? 'am' : 'pm'}`);
const ACC = { praso: 'Praso', sastastore: 'Sasta Store' };

(async () => {
  const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }).firestore();
  const A = db.collection('aikm_admin');
  const [parent, stS] = await Promise.all([A.doc('lotsCatalog').get(), A.doc('oosAlerts').get()]);
  const stamp = JSON.stringify(parent.exists ? parent.get('savedAt') ?? null : null);
  const st = stS.exists ? stS.data() : {};
  const force = process.env.FORCE === 'true';
  if (!force && st.stamp === stamp) { console.log('LOTS stock not re-uploaded since the last check - nothing to do (1 read).'); return; }

  const [chunks, mapS, lixS] = await Promise.all([A.doc('lotsCatalog').collection('chunks').get(), A.doc('spapiAsinLotsMap').get(), db.collection('listingIndex').get()]);
  const lots = {};
  chunks.forEach((d) => (d.data().products || []).forEach((p) => { if (p && p.code != null) lots[String(p.code)] = p; }));
  if (Object.keys(lots).length < 500) { console.log(`LOTS catalogue looks incomplete (${Object.keys(lots).length} products) - no alerts.`); return; }
  const map = (mapS.exists && mapS.data().map) || {};

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

  const low = {};
  Object.entries(used).forEach(([c, u]) => { const q = parseFloat(u.p.qty); if (!isNaN(q) && q < LOW_QTY) low[c] = Math.max(0, Math.floor(q)); });
  const prev = st.low || {};
  const fresh = Object.keys(low).filter((c) => !(c in prev) || low[c] < prev[c]);           // newly low, or dropped further
  const back = Object.keys(prev).filter((c) => !(c in low) && used[c]);                      // recovered to 12+

  const listings = (c) => {
    const L = []; used[c].asins.forEach((a) => (byAsin[a] || []).forEach((x) => L.push(x)));
    if (!L.length) return [`      ASIN  <code>${esc([...used[c].asins].slice(0, 2).join(', '))}</code>`];
    return L.slice(0, 3).map((x) => `      ${esc(x.acct)}  <code>${esc(x.sku)}</code>${x.q != null ? `  · Amazon ${x.q}` : ''}`).concat(L.length > 3 ? [`      <i>+ ${L.length - 3} more listings</i>`] : []);
  };
  const item = (c, k) => {
    const q = low[c], name = String(used[c].p.name || 'LOTS product').slice(0, 70);
    const was = prev[c] != null ? `  <i>(was ${prev[c]})</i>` : '';
    return [`${q === 0 ? '⛔' : q <= 5 ? '🔴' : '🟠'} <b>${k + 1}. ${esc(name)}</b>`,
      `      LOTS  <code>${esc(c)}</code>  ·  Stock <b>${q === 0 ? 'OUT OF STOCK' : q}</b>${was}`,
      ...listings(c)].join('\n');
  };

  if (fresh.length || back.length) {
    fresh.sort((a, b) => low[a] - low[b]);
    const oos = Object.values(low).filter((q) => q === 0).length;
    const msg = [
      '📦 <b>LOTS LOW STOCK ALERT</b>',
      `<i>New LOTS stock checked · ${timeLbl(Date.now())}</i>`,
      BAR,
      `⚠️ Newly low   <b>${fresh.length}</b>`,
      `⛔ Out of stock   <b>${oos}</b>`,
      `📉 All below ${LOW_QTY}   <b>${Object.keys(low).length}</b>`,
      fresh.length ? BAR : '',
      fresh.slice(0, 15).map(item).join('\n\n'),
      fresh.length > 15 ? `\n<i>+ ${fresh.length - 15} more products - see the console</i>` : '',
      back.length ? `${BAR}\n✅ <b>Back in stock</b> (${LOW_QTY}+)\n` + back.slice(0, 10).map((c) => `• ${esc(String(used[c].p.name || c).slice(0, 60))}  <code>${esc(c)}</code>  · <b>${Math.floor(parseFloat(used[c].p.qty))}</b>`).join('\n') + (back.length > 10 ? `\n<i>+ ${back.length - 10} more</i>` : '') : '',
      BAR,
      `<i>Only LOTS products mapped to an Amazon ASIN · alert below ${LOW_QTY}</i>`,
    ].filter((x) => x !== '').join('\n');
    await notify(msg, { html: true });
  }
  await A.doc('oosAlerts').set({ stamp, low, checkedAt: Date.now(), mapped: Object.keys(used).length });
  console.log(`LOTS: ${Object.keys(used).length} mapped products, ${Object.keys(low).length} below ${LOW_QTY} (${fresh.length} new, ${back.length} back in stock)${fresh.length || back.length ? ' - sent to Telegram' : ''}.`);
})().catch((e) => { console.error('OOS ALERTS FAILED:', e.message); process.exit(1); });
