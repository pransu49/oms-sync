// Firebase usage diagnostic (manual: Actions -> 'Firebase usage diagnostic'): hourly Firestore ops + API methods + listeners per project, last 30 h. Reads Cloud Monitoring only.
const admin = require('firebase-admin');
const P = [['main', process.env.FIREBASE_SERVICE_ACCOUNT], ['oms', process.env.FIREBASE_SERVICE_ACCOUNT_OMS], ['spapi', process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI]];
async function ts(token, pid, filter, group, aligner = 'ALIGN_SUM', reducer = 'REDUCE_SUM') {
  const end = new Date(), start = new Date(end - 30 * 3600e3);
  const q = new URLSearchParams({ filter, 'interval.startTime': start.toISOString(), 'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': '3600s', 'aggregation.perSeriesAligner': aligner, 'aggregation.crossSeriesReducer': reducer });
  (group || []).forEach((g) => q.append('aggregation.groupByFields', g));
  const r = await fetch(`https://monitoring.googleapis.com/v3/projects/${pid}/timeSeries?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json(); if (!r.ok) return console.log(pid, filter, 'ERR', j.error && j.error.message);
  (j.timeSeries || []).forEach((s) => {
    const lab = JSON.stringify({ ...(s.metric.labels || {}), ...(s.resource.labels || {}) }).replace(/"project_id":"[^"]*",?/, '');
    const pts = (s.points || []).map((p) => `${p.interval.endTime.slice(5, 13)}=${Math.round(Number(p.value.int64Value || p.value.doubleValue || 0))}`).reverse();
    const tot = (s.points || []).reduce((a, p) => a + Number(p.value.int64Value || p.value.doubleValue || 0), 0);
    console.log(`${pid} ${filter.replace(/metric.type="firestore.googleapis.com\//, '').replace(/"/g, '')} ${lab} TOTAL=${Math.round(tot)}\n   ${pts.join(' ')}`);
  });
}
(async () => {
  for (const [k, sa] of P) {
    if (!sa) continue; const s = JSON.parse(sa);
    const app = admin.initializeApp({ credential: admin.credential.cert(s) }, k);
    const token = (await app.options.credential.getAccessToken()).access_token, pid = s.project_id;
    console.log('=====', k, pid);
    await ts(token, pid, 'metric.type="firestore.googleapis.com/document/read_count"', ['metric.labels.type']);
    await ts(token, pid, 'metric.type="firestore.googleapis.com/document/write_count"', ['metric.labels.op']);
    await ts(token, pid, 'metric.type="firestore.googleapis.com/api/request_count"', ['metric.labels.api_method']);
    await ts(token, pid, 'metric.type="firestore.googleapis.com/network/snapshot_listeners"', [], 'ALIGN_MAX', 'REDUCE_SUM');
    await ts(token, pid, 'metric.type="firestore.googleapis.com/network/active_connections"', [], 'ALIGN_MAX', 'REDUCE_SUM');
  }
})();
