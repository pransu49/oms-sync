const admin = require('firebase-admin');
const spa = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'spa').firestore();
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const SKUS = ['Y1-Q04C-ZHXL','VI-ILZL-OBQA-R1','N-B07HJB67BP-RMVLD9EVC','N-B0CCXZRDV7-RMVLCPKKG','CB-K2P4-6ZQQ','UV-6NCM-3J0Q','N-B00QKAQN3M-RMVLCQHC5','XW-5BJ3-OMWT'];
const t = (ms) => ms ? new Date(ms + 5.5*3600e3).toISOString().slice(5,16).replace('T',' ') : '-';
(async () => {
  const m = (await spa.collection('spapiSnapshots').doc('praso_meta').get()).data();
  console.log('Amazon snapshot synced', t(m.syncedAt), 'mode', m.mode);
  const inv = []; for (let i = 0; i < (m.chunks.inventory||0); i++) { const d = await spa.collection('spapiSnapshots').doc(`praso_inventory_${m.run}_${i}`).get(); inv.push(...(d.data().items||[])); }
  const A = main.collection('aikm_admin');
  const ch = await A.doc('lotsCatalog').collection('chunks').get(); const lots = {}; let lu = 0;
  ch.forEach(d => { const x = d.data(); lu = Math.max(lu, x.updatedAt||x.savedAt||0); (x.products||[]).forEach(p => lots[String(p.code)] = p); });
  const lm = (await A.doc('lotsCatalog').get()).data() || {}; console.log('LOTS catalogue meta', JSON.stringify(Object.fromEntries(Object.entries(lm).filter(([k]) => !/products/.test(k)))).slice(0,300), 'chunk ts', lu);
  const m1 = (await A.doc('spapiAsinLotsMap').get()).data().map || {}; const m2d = await A.doc('spapiAsinLotsMap2').get(); const m2 = (m2d.exists && m2d.data().map) || {}; const map = { ...m1, ...m2 };
  const od = (await spa.collection('spapiSnapshots').doc('omsInventory').get()).data();
  console.log('OMS push at', t(od.at), 'status', od.status, JSON.stringify(od.stats));
  const ps = await Promise.all(Array.from({ length: od.chunks }, (_, i) => spa.collection('spapiSnapshots').doc(`omsInventory_rows_${i}`).get()));
  const j = JSON.parse(ps.map(x => x.data().data).join('')); const rows = Array.isArray(j) ? j : j.rows;
  const h = (await spa.collection('spapiSnapshots').doc('omsInventory_history').get()).data(); (h.runs||[]).slice(-8).forEach(r => console.log('  run', t(r.at), r.status, 'push', r.push, r.dry ? 'TEST' : ''));
  for (const sku of SKUS) {
    const i = inv.find(x => x.sku === sku); if (!i) { console.log(sku, 'not in snapshot'); continue; }
    const mp = map[i.asin]; const parts = mp ? (mp.parts && mp.parts.length ? mp.parts : [{ code: mp.code, qty: 1 }]) : [];
    const lp = parts.map(p => `${p.code} q${p.qty}${p.lotsPack ? '/' + p.lotsPack : ''} LOTS=${(lots[String(p.code)]||{}).qty} "${String((lots[String(p.code)]||{}).name||'').slice(0,30)}"`).join(' + ');
    const r = rows.filter(r => r[2] === i.asin);
    console.log(`\n${sku} ${String(i.name).slice(0,40)} | ASIN ${i.asin} | Amazon qty ${i.quantity} (item upd ${t(i.updatedAt)}) ch ${i.fulfillmentChannel}`);
    console.log('   map:', lp || 'NONE', mp && mp.vendorName);
    r.forEach(r => console.log(`   OMS master ${r[0]} lots ${r[3]} lotsQty@push ${r[5]} OMSbefore ${r[6]} set ${r[7]} change ${r[8]} via ${r[9]} blocked ${r[14]} oos ${r[15]} last ${r[11]}->${r[12]} at ${t(r[13])} note ${r[10]}`));
    if (!r.length) console.log('   NOT in OMS push rows (not linked / combo / not mapped in OMS)');
    const u = (j.unlinked||[]).filter(x => String(x[2]).includes(i.asin)); u.forEach(x => console.log('   UNLINKED:', JSON.stringify(x)));
  }
  const managed = (await spa.collection('spapiSnapshots').doc('omsManagedSkus').get()).data();
  const ms = new Set(String(managed.skus).split('\n')); console.log('\nmanaged by OMS:', SKUS.map(s => s + ':' + ms.has(s)).join(' '));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
