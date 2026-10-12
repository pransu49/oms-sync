// firebase-usage.js
// Reads today's Firestore usage (reads / writes / deletes) for each Firebase project from Google Cloud
// Monitoring — the same numbers the Firebase console "Usage" tab shows — and saves them to
// aikm_admin/firebaseUsage (main console project) so the console can warn BEFORE the free limit is hit.
// Free daily limits: 50,000 reads · 20,000 writes · 20,000 deletes. Day resets at midnight US Pacific time.
const admin = require('firebase-admin');

const LIMITS = { reads: 50000, writes: 20000, deletes: 20000 };
const PROJECTS = [
  ['main', 'Console data (orders, scans, NimbusPost)', process.env.FIREBASE_SERVICE_ACCOUNT],
  ['oms', 'OMS Guru orders', process.env.FIREBASE_SERVICE_ACCOUNT_OMS],
  ['spapi', 'Amazon (SP-API) data', process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI],
].filter((p) => p[2]);
const METRICS = { reads: 'firestore.googleapis.com/document/read_count', writes: 'firestore.googleapis.com/document/write_count', deletes: 'firestore.googleapis.com/document/delete_count' };

// start of the current Firebase "day" (midnight America/Los_Angeles)
function pacificMidnight() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asUTC - now.getTime();                       // Pacific offset (negative)
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

async function sumMetric(token, projectId, type, start, end) {
  const q = new URLSearchParams({
    filter: `metric.type="${type}"`,
    'interval.startTime': start.toISOString(), 'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': Math.max(60, Math.ceil((end - start) / 1000)) + 's',
    'aggregation.perSeriesAligner': 'ALIGN_SUM', 'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const r = await fetch(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) { const e = new Error((j.error && j.error.message) || `HTTP ${r.status}`); e.status = r.status; throw e; }
  let n = 0;
  (j.timeSeries || []).forEach((ts) => (ts.points || []).forEach((p) => { n += Number(p.value.int64Value || p.value.doubleValue || 0); }));
  return n;
}

async function main() {
  const start = pacificMidnight(), now = new Date();
  const hourAgo = new Date(now - 3600e3 > start ? now - 3600e3 : start.getTime());
  const out = { at: admin.firestore.FieldValue.serverTimestamp(), dayStart: start.toISOString(), limits: LIMITS, projects: {} };
  for (const [key, label, json] of PROJECTS) {
    const sa = JSON.parse(json);
    const entry = { label, projectId: sa.project_id };
    try {
      const app = admin.apps.find((a) => a.name === key) || admin.initializeApp({ credential: admin.credential.cert(sa) }, key);
      const token = (await app.options.credential.getAccessToken()).access_token;
      for (const [k, type] of Object.entries(METRICS)) {
        entry[k] = await sumMetric(token, sa.project_id, type, start, now);
        entry[k + 'LastHour'] = await sumMetric(token, sa.project_id, type, hourAgo, now);
      }
      // simple projection to end of the Firebase day at the current pace
      const left = (start.getTime() + 864e5 - now.getTime()) / 3600e3;
      ['reads', 'writes', 'deletes'].forEach((k) => { entry[k + 'Projected'] = Math.round(entry[k] + entry[k + 'LastHour'] * left); });
      entry.ok = true;
      console.log(`${key} (${sa.project_id}): reads ${entry.reads}/${LIMITS.reads} (last hour ${entry.readsLastHour}), writes ${entry.writes}/${LIMITS.writes}, deletes ${entry.deletes}`);
    } catch (e) {
      entry.ok = false; entry.error = e.message;
      entry.needsPermission = e.status === 403 || /permission|denied/i.test(e.message);
      console.log(`${key} (${sa.project_id}): could not read usage — ${e.message}`);
    }
    out.projects[key] = entry;
  }
  const mainApp = admin.apps.find((a) => a.name === 'main') || admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
  await mainApp.firestore().collection('aikm_admin').doc('firebaseUsage').set(out);
  console.log('Usage saved.');
}
main().catch((e) => { console.error('USAGE FAILED:', e.message); process.exit(1); });
