// Buy Box vs sales check (read-only, owner 28 Nov 2026 "Buy Box count up but sales dipped - is the count wrong?").
// Per account: orders/units per day (spapiSnapshots/<acct>_dash) + today's Buy Box status of the products that SOLD before
// (top ASINs of the dash doc) from the latest snapshot. Prints only. ~2 + chunk reads per account.
const admin = require('firebase-admin');
const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }).firestore();
const COL = db.collection('spapiSnapshots');
const ACCTS = String(process.env.ACCTS || 'sastastore,praso,vishal,munda,aikm').split(',').map((x) => x.trim()).filter(Boolean);
(async () => {
  const os = await COL.doc('ourSellers').get(), ours = (os.exists && os.data().ids) || {};
  const who = {}; Object.entries(ours).forEach(([k, v]) => { who[v] = k; });
  for (const A of ACCTS) {
    const d = await COL.doc(`${A}_dash`).get(); if (!d.exists) { console.log(`\n== ${A}: no dash doc`); continue; }
    const D = d.data(), days = D.days || D.d || {}, names = D.names || {};
    const keys = Object.keys(days).sort().slice(-16);
    console.log(`\n================ ${A} ================\nDay         orders  units  revenue`);
    keys.forEach((k) => { const x = days[k] || {}; console.log(`${k}  ${String(x.o || 0).padStart(6)} ${String(x.u || 0).padStart(6)} ${String(Math.round(x.r || 0)).padStart(8)}`); });
    // snapshot pricing
    const meta = (await COL.doc(`${A}_meta`).get()).data() || {}, n = (meta.chunks || {}).pricing || 0, refs = [];
    for (let i = 0; i < n; i++) refs.push(COL.doc(`${A}_pricing_${meta.run}_${i}`));
    const pr = {}; (refs.length ? await db.getAll(...refs) : []).forEach((c) => (c.exists ? c.data().items || [] : []).forEach((it) => { if (it && it.asin) pr[it.asin] = it; }));
    // units per ASIN: week A (days -14..-8) vs week B (last 7 days incl. today)
    const wA = keys.slice(-14, -7), wB = keys.slice(-7), ua = {}, ub = {};
    const add = (m, k) => { const p = (days[k] || {}).p || {}; Object.entries(p).forEach(([as, v]) => { m[as] = (m[as] || 0) + (+(Array.isArray(v) ? v[0] : v) || 0); }); };
    wA.forEach((k) => add(ua, k)); wB.forEach((k) => add(ub, k));
    const st = (as) => { const it = pr[as]; if (!it) return 'no data'; const o = it.offers || [], w = o.find((x) => x.isBuyBoxWinner);
      const mine = o.find((x) => x.isMine || who[x.sellerId] === A);
      if (w && (w.isMine || who[w.sellerId] === A)) return 'HELD';
      if (w && who[w.sellerId]) return `our ${who[w.sellerId]} holds it`;
      if (!mine) return w ? `NOT SELLING (BB ₹${w.price})` : 'no offer at all';
      return w ? `LOST ₹${mine.price} vs ₹${w.price}` : 'no Buy Box winner'; };
    const all = Object.keys({ ...ua, ...ub }).sort((x, y) => (ua[y] || 0) - (ua[x] || 0));
    let held = 0, heldSold = 0; Object.values(pr).forEach((it) => { const w = (it.offers || []).find((x) => x.isBuyBoxWinner); if (w && (w.isMine || who[w.sellerId] === A)) { held++; if (ua[it.asin] || ub[it.asin]) heldSold++; } });
    const sumA = Object.values(ua).reduce((a, b) => a + b, 0), sumB = Object.values(ub).reduce((a, b) => a + b, 0);
    console.log(`Buy Box held now: ${held} ASINs, of which ${heldSold} sold in the last 14 days (top-40/day list only)`);
    console.log(`Units of top products: prev 7 days ${sumA} -> last 7 days ${sumB}`);
    const groups = {}; all.forEach((as) => { const s = st(as).replace(/ ₹.*|\(.*\)/g, '').trim(); const g = groups[s] = groups[s] || { n: 0, a: 0, b: 0 }; g.n++; g.a += ua[as] || 0; g.b += ub[as] || 0; });
    console.log('Status now of products that sold      ASINs   units prev 7d -> last 7d');
    Object.entries(groups).sort((x, y) => y[1].a - x[1].a).forEach(([k, g]) => console.log(`  ${k.padEnd(34)} ${String(g.n).padStart(5)}   ${String(g.a).padStart(5)} -> ${g.b}`));
    console.log('Biggest drops (units prev 7d -> last 7d, status now):');
    all.map((as) => [as, (ua[as] || 0) - (ub[as] || 0)]).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 25)
      .forEach(([as]) => console.log(`  ${as}  ${String(ua[as] || 0).padStart(4)} -> ${String(ub[as] || 0).padEnd(4)} ${st(as).padEnd(32)} ${String(names[as] || '').slice(0, 55)}`));
  }
})().catch((e) => { console.error(e); process.exit(1); });
