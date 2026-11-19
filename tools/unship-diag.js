// Read-only (owner 19 Nov 2026 "check today's orders, why not shipped"): order ids from Amazon's Unshipped Orders report ->
// where each one is stuck: not in OMS / waiting in Self-Ship (why) / shipped on ProShip but tracking not in OMS / in OMS but not confirmed
// on Amazon (error) / Easy Ship / cancelled. Ids come from the run's event file (input `ids`). Prints counts + example ids, no buyer data.
const admin = require('firebase-admin');
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const sp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'sp').firestore();
const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
const ph = (v) => String(v || '').replace(/\D/g, '').slice(-10);
async function json(db, col, id, f = 'data') { try { const d = await db.collection(col).doc(id).get(); if (!d.exists) return {}; return d.get(f) ? JSON.parse(d.get(f)) : {}; } catch (e) { return {}; } }
(async () => {
  const ev = JSON.parse(require('fs').readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const ids = [...new Set(String((ev.inputs || {}).ids || '').split(/[\s,]+/).map(nid).filter(Boolean))];
  console.log('ids from report:', ids.length);
  const want = new Set(ids), byId = {};
  (await oms.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.get('orders') || []).forEach((o) => {
    const k = nid(o.channelOrderId); if (want.has(k)) (byId[k] = byId[k] || []).push(o);
  }));
  const amz = {}; let snapAt = {};
  for (const a of ['praso', 'sastastore', 'vishal', 'munda', 'aikm']) {
    const m = await sp.collection('spapiSnapshots').doc(a + '_meta').get(); if (!m.exists) continue;
    const run = m.get('run'), n = (m.get('chunks') || {}).orders || 0; snapAt[a] = String(m.get('updatedAt') && m.get('updatedAt').toDate ? m.get('updatedAt').toDate().toISOString() : run);
    for (let i = 0; i < n; i++) { const c = await sp.collection('spapiSnapshots').doc(`${a}_orders_${run}_${i}`).get(); (c.exists ? c.get('items') || [] : []).forEach((o) => { if (o && want.has(o.orderId)) amz[o.orderId] = o.status; }); }
  }
  console.log('Amazon snapshot times:', JSON.stringify(snapAt));
  const px = await json(main, 'aikm_admin', 'proshipIndex');
  const sc = ((await main.collection('aikm_admin').doc('shipCheck').get()).data() || {}).v || {};
  const confDoc = (await main.collection('aikm_admin').doc('amazonConfirm').get()).data() || {};
  let conf = {}; try { conf = confDoc.idsJson ? JSON.parse(confDoc.idsJson) : (confDoc.ids || {}); } catch (e) { conf = confDoc.ids || {}; }
  const push = (await main.collection('aikm_admin').doc('omsTrackingPush').get()).data() || {};
  const jobs = (await main.collection('proshipJobs').orderBy('createdAt', 'desc').limit(10).get()).docs.map((d) => d.data());
  const jobErr = {}; jobs.slice().reverse().forEach((j) => Object.entries(j.results || {}).forEach(([k, r]) => { if (r && r.e) jobErr[nid(k)] = r.e; else if (r && r.a) delete jobErr[nid(k)]; }));
  const G = {}, GS = {}; const add = (g, k, extra) => { (G[g] = G[g] || []).push(k + (extra ? '  ' + extra : '')); const x = (GS[g] = GS[g] || {}); x[amz[k] || 'not in snapshot'] = (x[amz[k] || 'not in snapshot'] || 0) + 1; };
  const confErr = {};
  ids.forEach((k) => {
    const L = byId[k], p = px[k] || px['#' + k], s = sc[k], c = conf[k];
    if (s && s.v === 'easyship') return add('Easy Ship (Amazon picks up - not Self-Ship)', k);
    if (s && s.v === 'cancelled') return add('Cancelled on Amazon', k);
    if (!L) return add('NOT in OMS (OMS sync missed it)', k);
    const o = L[0], st = String(o.status || '').trim(), acct = o.channel, awb = String(o.awb || '').trim();
    if (L.some((x) => /cancel/i.test(x.status || ''))) return add('Cancelled in OMS (a line)', k, acct);
    const live = p && p.a && p.s !== 'cancelled';
    if (live && !awb) return add('Shipped on ProShip, tracking NOT yet in OMS', k, acct + (push.failed && push.failed[k] ? ' push error: ' + JSON.stringify(push.failed[k]).slice(0, 90) : ''));
    if (live && awb && awb !== p.a) return add('Shipped on ProShip, OMS has a DIFFERENT AWB', k, acct);
    if (live && awb) {
      if (c && !c.ok) { confErr[String(c.e || c.error || '?').slice(0, 80)] = (confErr[String(c.e || c.error || '?').slice(0, 80)] || 0) + 1; return add('Shipped + in OMS, Amazon confirm FAILED', k, acct + ' ' + String(c.e || c.error || '').slice(0, 90)); }
      if (c && c.ok) return add('Confirmed on Amazon by our robot', k, acct + ' at ' + new Date(c.t).toISOString().slice(11, 16) + 'Z' + (c.note ? ' ' + c.note.slice(0, 40) : ''));
      return add('Shipped + in OMS, waiting for Amazon confirm robot', k, acct);
    }
    if (/^shipped$/i.test(st)) return add('OMS says Shipped, no AWB (fake ship)', k, acct);
    // waiting in Self-Ship - why?
    const why = [];
    if (jobErr[k]) why.push('last ship job error: ' + String(jobErr[k]).slice(0, 70));
    if (ph(o.buyerPhone).length < 10) why.push('no phone in OMS');
    if (!String(o.buyerAddress1 || '').trim() || /^unknown$/i.test(String(o.buyerAddress1 || '').trim())) why.push('no address in OMS');
    if (!/^\d{6}$/.test(String(o.buyerPincode || '').trim())) why.push('no pincode');
    const prof = L.reduce((t, x) => t + (parseFloat(x.profit) || 0), 0), sla = String(o.slaDate || '').slice(0, 12);
    if (!why.length) { if (prof < 0) why.push('real LOSS (OMS profit < 0)'); else if (prof < 38) why.push('low profit (OMS < 38) - On hold'); else why.push('profit OK - was not ticked / not in the last job'); }
    why.push('OMS profit ' + Math.round(prof) + ' sla ' + sla);
    add('NOT shipped yet (waiting in Self-Ship)' + ' - ' + why[0].split(':')[0].split(' (')[0], k, acct + ' ' + st + ' ' + why.join(' | '));
  });
  Object.keys(G).sort((a, b) => G[b].length - G[a].length).forEach((g) => {
    console.log(`\n=== ${g}: ${G[g].length}`);
    const byAcct = {}; G[g].forEach((x) => { const a = (x.split('  ')[1] || '').split(' ')[0] || '-'; byAcct[a] = (byAcct[a] || 0) + 1; });
    console.log('   by account:', JSON.stringify(byAcct), '| Amazon status NOW (snapshot):', JSON.stringify(GS[g]));
    G[g].slice(0, 12).forEach((x) => console.log('   ', x));
  });
  if (Object.keys(confErr).length) console.log('\nAMAZON CONFIRM ERRORS:', JSON.stringify(confErr, null, 1));
  console.log('\nlast ship jobs:', jobs.slice(0, 5).map((j) => `${j.status} sent=${Object.keys(j.ids || {}).length} res=${Object.keys(j.results || {}).length} at=${j.createdAt && j.createdAt.toDate && j.createdAt.toDate().toISOString()}`).join('\n  '));
  console.log('push doc keys:', Object.keys(push).join(','), '| confirm lastError:', JSON.stringify(confDoc.lastError || null).slice(0, 200), '| confirm lastRun:', JSON.stringify(confDoc.lastRun || confDoc.at || null).slice(0, 200));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
