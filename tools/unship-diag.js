// Read-only (owner 19 Nov 2026 "check today's orders, why not shipped"): order ids from Amazon's Unshipped Orders report ->
// where each one is stuck: not in OMS / waiting in Self-Ship (why) / shipped on ProShip but tracking not in OMS / in OMS but not confirmed
// on Amazon (error) / Easy Ship / cancelled. Ids come from the run's event file (input `ids`). Prints counts + example ids, no buyer data.
const admin = require('firebase-admin');
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
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
  const px = await json(main, 'aikm_admin', 'proshipIndex');
  const sc = ((await main.collection('aikm_admin').doc('shipCheck').get()).data() || {}).v || {};
  const confDoc = (await main.collection('aikm_admin').doc('amazonConfirm').get()).data() || {};
  let conf = {}; try { conf = confDoc.idsJson ? JSON.parse(confDoc.idsJson) : (confDoc.ids || {}); } catch (e) { conf = confDoc.ids || {}; }
  const push = (await main.collection('aikm_admin').doc('omsTrackingPush').get()).data() || {};
  const jobs = (await main.collection('proshipJobs').orderBy('createdAt', 'desc').limit(10).get()).docs.map((d) => d.data());
  const jobErr = {}; jobs.slice().reverse().forEach((j) => Object.entries(j.results || {}).forEach(([k, r]) => { if (r && r.e) jobErr[nid(k)] = r.e; else if (r && r.a) delete jobErr[nid(k)]; }));
  const G = {}; const add = (g, k, extra) => { (G[g] = G[g] || []).push(k + (extra ? '  ' + extra : '')); };
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
      if (c && c.ok) return add('Confirmed by our robot (Amazon report older?)', k, acct);
      return add('Shipped + in OMS, waiting for Amazon confirm robot', k, acct);
    }
    if (/^shipped$/i.test(st)) return add('OMS says Shipped, no AWB (fake ship)', k, acct);
    // waiting in Self-Ship - why?
    const why = [];
    if (jobErr[k]) why.push('last ship job error: ' + String(jobErr[k]).slice(0, 70));
    if (ph(o.buyerPhone).length < 10) why.push('no phone in OMS');
    if (!String(o.buyerAddress1 || '').trim() || /^unknown$/i.test(String(o.buyerAddress1 || '').trim())) why.push('no address in OMS');
    if (!/^\d{6}$/.test(String(o.buyerPincode || '').trim())) why.push('no pincode');
    add('NOT shipped yet (waiting in Self-Ship)' + (why.length ? ' - ' + why[0].split(':')[0] : ' - never sent to ProShip'), k, acct + ' ' + st + ' ' + why.join(' | '));
  });
  Object.keys(G).sort((a, b) => G[b].length - G[a].length).forEach((g) => {
    console.log(`\n=== ${g}: ${G[g].length}`);
    const byAcct = {}; G[g].forEach((x) => { const a = (x.split('  ')[1] || '').split(' ')[0] || '-'; byAcct[a] = (byAcct[a] || 0) + 1; });
    console.log('   by account:', JSON.stringify(byAcct));
    G[g].slice(0, 12).forEach((x) => console.log('   ', x));
  });
  if (Object.keys(confErr).length) console.log('\nAMAZON CONFIRM ERRORS:', JSON.stringify(confErr, null, 1));
  console.log('\nlast ship jobs:', jobs.slice(0, 5).map((j) => `${j.status} sent=${Object.keys(j.ids || {}).length} res=${Object.keys(j.results || {}).length} at=${j.createdAt && j.createdAt.toDate && j.createdAt.toDate().toISOString()}`).join('\n  '));
  console.log('push doc keys:', Object.keys(push).join(','), '| confirm lastError:', JSON.stringify(confDoc.lastError || null).slice(0, 200), '| confirm lastRun:', JSON.stringify(confDoc.lastRun || confDoc.at || null).slice(0, 200));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
