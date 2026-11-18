// Read-only lookup of given Amazon order ids across OMS chunks, proshipIndex, last ProShip jobs, amazonConfirm, omsTrackingPush. ~40 reads.
const admin = require('firebase-admin');
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const oms = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms').firestore();
const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
const ids = String(process.env.IDS || '').split(/[\s,]+/).map(nid).filter(Boolean);
(async () => {
  const byId = {}; (await oms.collection('aikm_admin').doc('omsOrders').collection('chunks').get()).forEach((d) => (d.get('orders') || []).forEach((o) => { const k = nid(o.channelOrderId); if (ids.includes(k)) (byId[k] = byId[k] || []).push(o); }));
  let idx = {}; try { idx = JSON.parse((await main.collection('aikm_admin').doc('proshipIndex').get()).get('data') || '{}'); } catch (e) {}
  const jobs = (await main.collection('proshipJobs').orderBy('createdAt', 'desc').limit(8).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const get = async (col, doc) => { try { const d = await main.collection(col).doc(doc).get(); return d.exists ? d.data() : {}; } catch (e) { return {}; } };
  const conf = await get('aikm_admin', 'amazonConfirm'), push = await get('aikm_admin', 'omsTrackingPush');
  for (const k of ids) {
    const o = byId[k] || [];
    const jr = jobs.map((j) => { const r = (j.results || {})[k]; const inJob = j.ids && Object.prototype.hasOwnProperty.call(j.ids, k); return r || inJob ? { job: j.id, at: j.createdAt && j.createdAt.toDate ? j.createdAt.toDate().toISOString() : '', status: j.status, res: r || 'in job, no result' } : null; }).filter(Boolean);
    console.log('ORDER', k, JSON.stringify({
      oms: o.map((x) => ({ ch: x.channel, st: x.status, awb: x.awb, courier: x.courier, sla: x.slaDate, item: String(x.productName || '').slice(0, 50), qty: x.qty, price: x.price, profit: x.profit, pin: x.buyerPincode, city: x.buyerCity })),
      proship: idx[k] || null, jobs: jr,
      amazonConfirm: (conf.ids || {})[k] || null, omsPush: { failed: (push.failed || {})[k] || null, stuck: (push.stuck || {})[k] || null, sent: (push.ids || {})[k] || null },
    }));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
