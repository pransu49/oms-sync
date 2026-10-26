const admin = require('firebase-admin');
const spa = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'spa').firestore();
const t = (ms) => ms ? new Date(ms + 5.5*3600e3).toISOString().slice(5,13).replace('T',' ')+'h' : '-';
(async () => {
  for (const acct of ['praso','sastastore']) {
    const m = (await spa.collection('spapiSnapshots').doc(acct + '_meta').get()).data();
    const inv = []; for (let i = 0; i < (m.chunks.inventory||0); i++) { const d = await spa.collection('spapiSnapshots').doc(`${acct}_inventory_${m.run}_${i}`).get(); inv.push(...(d.data().items||[])); }
    const c = {}; inv.filter(i => (i.fulfillmentChannel||'DEFAULT')==='DEFAULT').forEach(i => { if (i.updatedAt > Date.now() - 30*3600e3) c[t(i.updatedAt)] = (c[t(i.updatedAt)]||0)+1; });
    console.log(`== ${acct} items whose Amazon data changed, by hour (IST):`, JSON.stringify(Object.fromEntries(Object.entries(c).sort())));
    const lp = inv.filter(i => i.lastStockPush && i.lastStockPush.at > Date.now() - 30*3600e3).length; console.log('   robot direct stock pushes (30h):', lp);
  }
  const h = await spa.collection('spapiSnapshots').doc('praso_meta').get(); console.log(JSON.stringify(h.data()).slice(0,400));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
