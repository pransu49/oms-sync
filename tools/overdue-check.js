// Read-only check (owner 19 Nov 2026): every OMS Amazon order marked "Shipped" WITHOUT an AWB in OMS (the "OMS says Shipped, but no AWB"
// rows in Self-Ship) -> what Amazon says (SP-API snapshot of all accounts) + whether any of our couriers has an AWB for it.
// Prints counts per verdict + the order ids (no buyer details). WRITE=on saves the verdicts in main aikm_admin/shipCheck so the console
// can show them. ~60-120 reads, 0-1 write.
const admin = require('firebase-admin');
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
const sp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'sp').firestore();
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
const ymd = (v) => { const d = new Date(String(v || '').replace(/ (\d+):(\d+):(\d+) (AM|PM)$/, '')); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const ACCTS = ['praso', 'sastastore', 'vishal', 'munda', 'aikm'];
async function json(db, col, id) {
  try { const d = await db.collection(col).doc(id).get(); if (!d.exists) return {}; return d.get('data') ? JSON.parse(d.get('data')) : (d.get('orders') || {}); } catch (e) { return {}; }
}
(async () => {
  const days = +(process.env.DAYS || 10), from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const want = {};
  (await oms.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.get('orders') || []).forEach((o) => {
    if (!/amazon/i.test(o.channel || '') || String(o.awb || '').trim()) return;
    const st = String(o.status || '').trim(), isNew = /^(new|ready to ship|pending|confirmed)$/i.test(st);
    if (!isNew && !/^shipped$/i.test(st)) return;
    const s = ymd(o.slaDate); if (!isNew && (!s || s < from)) return;
    const k = nid(o.channelOrderId); if (k && !want[k]) want[k] = { ch: o.channel, sla: s, isNew, item: String(o.productName || '').slice(0, 40), unk: /^unknown$/i.test(String(o.buyerAddress1 || '').trim()) };
  }));
  const ids = Object.keys(want);
  console.log('OMS Amazon orders checked (Shipped without AWB since', from, '+ all New):', ids.length, '· New:', ids.filter((k) => want[k].isNew).length);
  // Amazon snapshot orders of every account
  const amz = {};
  for (const a of ACCTS) {
    const m = await sp.collection('spapiSnapshots').doc(a + '_meta').get(); if (!m.exists) continue;
    const run = m.get('run'), n = (m.get('chunks') || {}).orders || 0;
    for (let i = 0; i < n; i++) {
      const c = await sp.collection('spapiSnapshots').doc(`${a}_orders_${run}_${i}`).get();
      (c.exists ? c.get('items') || [] : []).forEach((o) => { if (o && want[o.orderId]) amz[o.orderId] = { acct: a, st: o.status, es: !!o.isEasyShip, fc: o.fulfillmentChannel }; });
    }
  }
  const [px, nb, zp] = await Promise.all([json(main, 'aikm_admin', 'proshipIndex'), json(main, 'nimbusIndex', 'byOrder'), json(main, 'aikm_admin', 'zippyIndex')]);
  const conf = ((await main.collection('aikm_admin').doc('amazonConfirm').get()).data() || {}).ids || {};
  const out = {}, groups = {};
  ids.forEach((k) => {
    const a = amz[k], p = px[k] || px['#' + k], n = nb[k] || nb['#' + k], z = zp[k] || zp['#' + k];
    const liveAwb = [p, n, z].find((x) => x && x.a && x.s !== 'cancelled');
    let v;
    if (a && /cancel/i.test(a.st || '')) v = 'cancelled';
    else if (liveAwb) v = 'shipped_real';
    else if (a && a.es) v = 'easyship';
    else if (a && /unshipped|pending/i.test(a.st || '')) v = 'unshipped';
    else if (a && /shipped|delivered/i.test(a.st || '')) v = 'amazon_shipped_no_awb';
    else v = 'unknown_on_amazon';
    // OMS "New" orders: only the ones Self-Ship must NOT show are kept (Easy Ship / cancelled / real AWB) - keeps the doc small
    if (want[k].isNew && !['easyship', 'cancelled', 'shipped_real'].includes(v)) return;
    out[k] = { v, acct: a ? a.acct : '', amz: a ? a.st : '', sla: want[k].sla, conf: conf[k] ? 1 : 0, unk: want[k].unk ? 1 : 0 };
    (groups[v] = groups[v] || []).push(k);
  });
  Object.keys(groups).forEach((g) => {
    console.log(`\n=== ${g}: ${groups[g].length}`);
    groups[g].forEach((k) => console.log('  ', k, out[k].acct, 'amazon=' + out[k].amz, 'sla=' + out[k].sla, out[k].conf ? 'confirmedByOurRobot' : '', out[k].unk ? 'addr=Unknown' : '', want[k].item));
  });
  if (process.env.WRITE === 'on') { await main.collection('aikm_admin').doc('shipCheck').set({ at: Date.now(), v: out }); console.log('\nsaved aikm_admin/shipCheck'); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
