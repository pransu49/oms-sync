const admin = require('firebase-admin');
const spa = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'spa').firestore();
const t = (ms) => ms ? new Date(ms + 5.5*3600e3).toISOString().slice(5,16).replace('T',' ') : '-';
(async () => {
  const od = (await spa.collection('spapiSnapshots').doc('omsInventory').get()).data();
  const ps = await Promise.all(Array.from({ length: od.chunks }, (_, i) => spa.collection('spapiSnapshots').doc(`omsInventory_rows_${i}`).get()));
  const j = JSON.parse(ps.map(x => x.data().data).join('')); const rows = Array.isArray(j) ? j : j.rows;
  for (const acct of ['praso','sastastore']) {
    const m = (await spa.collection('spapiSnapshots').doc(acct + '_meta').get()).data();
    const inv = []; for (let i = 0; i < (m.chunks.inventory||0); i++) { const d = await spa.collection('spapiSnapshots').doc(`${acct}_inventory_${m.run}_${i}`).get(); inv.push(...(d.data().items||[])); }
    const byAsin = {}; inv.filter(i => (i.fulfillmentChannel||'DEFAULT')==='DEFAULT').forEach(i => (byAsin[i.asin] = byAsin[i.asin] || []).push(i));
    const g = {};
    for (const r of rows) {
      const list = byAsin[r[2]]; if (!list) continue;
      const exp = r[15] === 1 ? 0 : Math.max(0, r[7] - (r[14]||0));
      const bucket = r[13] ? t(r[13]).slice(0, 8) + 'h' : 'never changed';
      for (const i of list) { const a = parseInt(i.quantity)||0; const k = bucket; g[k] = g[k] || { n: 0, match: 0, higher: 0, lower: 0, exL: [] };
        g[k].n++; if (Math.abs(a - exp) <= 1) g[k].match++; else if (a > exp) { g[k].higher++; if (g[k].exL.length < 3) g[k].exL.push(`${i.sku} amz ${a} exp ${exp} amzUpd ${t(i.updatedAt)}`); } else g[k].lower++; }
    }
    console.log(`\n== ${acct} (snapshot ${t(m.syncedAt)}) — Amazon vs OMS expected (In Stock - Blocked), grouped by when the robot last changed OMS`);
    Object.entries(g).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(14)} listings ${v.n}  match ${v.match}  Amazon higher ${v.higher}  lower ${v.lower}  ${v.exL.join(' | ')}`));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
