// firebase-usage.js
// Reads Firestore usage (reads / writes / deletes) for each Firebase project from Google Cloud
// Monitoring — the same numbers the Firebase console "Usage" tab shows — and saves them to
// aikm_admin/firebaseUsage (main console project) so the console can warn BEFORE limits are hit.
// Also works out the EXTRA cost on the Blaze plan: anything above the free daily allowance
// (50,000 reads · 20,000 writes · 20,000 deletes per project per day) is charged at Google's
// Firestore price for that project's location, shown in ₹ with 18% GST. Month-to-date total is
// compared with the ₹500/month budget. Day resets at midnight US Pacific time.
const admin = require('firebase-admin');

const LIMITS = { reads: 50000, writes: 20000, deletes: 20000 };
const BUDGET_INR = 500;                 // monthly budget set in Google Cloud billing
const BILLING_START = '2026-10-11';     // Pacific date the projects moved to Blaze — nothing was billed before
const GST = 0.18;
// USD per 100,000 operations (Firestore Standard, default rates). Multi-region costs double.
const PRICES = {
  multi: { reads: 0.06, writes: 0.18, deletes: 0.02 },     // nam5, eur3
  region: { reads: 0.03, writes: 0.09, deletes: 0.01 },    // us-central1, us-east1, europe-west1 …
  asia: { reads: 0.036, writes: 0.108, deletes: 0.012 },   // asia-south1 (Mumbai) and other Asia regions
};
function priceFor(loc) {
  loc = String(loc || '').toLowerCase();
  if (/^(nam\d|eur\d)$/.test(loc)) return PRICES.multi;
  if (/^asia|^australia|^me-|^africa|^southamerica/.test(loc)) return PRICES.asia;
  if (loc) return PRICES.region;
  return PRICES.multi;                                        // unknown → assume the higher price
}

const PROJECTS = [
  ['main', 'Console data (orders, scans, NimbusPost)', process.env.FIREBASE_SERVICE_ACCOUNT],
  ['oms', 'OMS Guru orders', process.env.FIREBASE_SERVICE_ACCOUNT_OMS],
  ['spapi', 'Amazon (SP-API) data', process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI],
].filter((p) => p[2]);
const METRICS = { reads: 'firestore.googleapis.com/document/read_count', writes: 'firestore.googleapis.com/document/write_count', deletes: 'firestore.googleapis.com/document/delete_count' };
const KEYS = Object.keys(METRICS);

function pacificParts(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
}
// start of the Firebase "day" (midnight America/Los_Angeles) that contains `at`
function pacificMidnight(at) {
  const now = at || new Date(), parts = pacificParts(now);
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asUTC - now.getTime();
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}
function pacificDate(d) { const p = pacificParts(new Date(d.getTime() + 3600e3)); return `${p.year}-${p.month}-${p.day}`; }

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
async function dbLocation(token, projectId) {
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    return r.ok ? j.locationId || '' : '';
  } catch (e) { return ''; }
}
function costUSD(use, price) {
  let usd = 0;
  KEYS.forEach((k) => { usd += Math.max(0, (use[k] || 0) - LIMITS[k]) / 1e5 * price[k]; });
  return usd;
}
async function usdToInr(prev) {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD'); const j = await r.json();
    if (j && j.rates && j.rates.INR > 50) return j.rates.INR;
  } catch (e) { /* fall back */ }
  return (prev && prev.usdInr) || 88;
}

async function main() {
  const now = new Date(), start = pacificMidnight(now);
  const hourAgo = new Date(now - 3600e3 > start ? now - 3600e3 : start.getTime());
  const todayKey = pacificDate(start), monthKey = todayKey.slice(0, 7);
  const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
  const docRef = mainApp.firestore().collection('aikm_admin').doc('firebaseUsage');
  const prevSnap = await docRef.get(); const prev = prevSnap.exists ? prevSnap.data() : {};
  const rate = await usdToInr(prev), mult = rate * (1 + GST);

  // completed days of this month (Pacific), from the Blaze start date
  const pastDays = [];
  for (let d = pacificMidnight(new Date(start.getTime() - 12 * 3600e3)); ; d = pacificMidnight(new Date(d.getTime() - 12 * 3600e3))) {
    const key = pacificDate(d);
    if (key.slice(0, 7) !== monthKey || key < BILLING_START) break;
    pastDays.push({ key, s: d, e: new Date(pacificMidnight(new Date(d.getTime() + 36 * 3600e3))) });
    if (pastDays.length > 31) break;
  }

  const out = { at: admin.firestore.FieldValue.serverTimestamp(), dayStart: start.toISOString(), limits: LIMITS, projects: {},
    usdInr: rate, gst: GST, budgetInr: BUDGET_INR, month: monthKey, billingStart: BILLING_START };
  let monthInr = 0, todayInr = 0, projTodayInr = 0;
  const daysInMonth = new Date(+monthKey.slice(0, 4), +monthKey.slice(5, 7), 0).getDate();

  for (const [key, label, json] of PROJECTS) {
    const sa = JSON.parse(json);
    const entry = { label, projectId: sa.project_id };
    try {
      const app = admin.apps.find((a) => a.name === key) || admin.initializeApp({ credential: admin.credential.cert(sa) }, key);
      const token = (await app.options.credential.getAccessToken()).access_token;
      const pPrev = (prev.projects || {})[key] || {};
      entry.location = pPrev.location || await dbLocation(token, sa.project_id);
      const price = priceFor(entry.location); entry.price = price;
      for (const [k, type] of Object.entries(METRICS)) {
        entry[k] = await sumMetric(token, sa.project_id, type, start, now);
        entry[k + 'LastHour'] = await sumMetric(token, sa.project_id, type, hourAgo, now);
      }
      const left = (start.getTime() + 864e5 - now.getTime()) / 3600e3;
      KEYS.forEach((k) => { entry[k + 'Projected'] = Math.round(entry[k] + entry[k + 'LastHour'] * left); });

      // month-to-date: completed days are cached, only new ones are fetched
      const oldDays = (pPrev.days && pPrev.month === monthKey) ? pPrev.days : {};
      const days = {};
      for (const d of pastDays) {
        if (oldDays[d.key] && oldDays[d.key].final) { days[d.key] = oldDays[d.key]; continue; }
        const use = {};
        for (const [k, type] of Object.entries(METRICS)) use[k] = await sumMetric(token, sa.project_id, type, d.s, d.e);
        const usd = costUSD(use, price);
        days[d.key] = Object.assign(use, { usd, inr: Math.round(usd * mult * 100) / 100, final: now - d.e > 3 * 3600e3 });
      }
      entry.days = days; entry.month = monthKey;
      const todayUsd = todayKey >= BILLING_START ? costUSD(entry, price) : 0;
      const projUsd = todayKey >= BILLING_START ? costUSD({ reads: entry.readsProjected, writes: entry.writesProjected, deletes: entry.deletesProjected }, price) : 0;
      entry.todayInr = Math.round(todayUsd * mult * 100) / 100;
      entry.todayProjectedInr = Math.round(projUsd * mult * 100) / 100;
      entry.monthInr = Math.round((Object.values(days).reduce((s, d) => s + (d.inr || 0), 0) + entry.todayInr) * 100) / 100;
      KEYS.forEach((k) => { entry[k + 'Extra'] = Math.max(0, entry[k] - LIMITS[k]); });
      monthInr += entry.monthInr; todayInr += entry.todayInr; projTodayInr += entry.todayProjectedInr;
      entry.ok = true;
      console.log(`${key} (${sa.project_id}, ${entry.location || '?'}): reads ${entry.reads}/${LIMITS.reads}, writes ${entry.writes}/${LIMITS.writes}, deletes ${entry.deletes} · today ₹${entry.todayInr} · month ₹${entry.monthInr}`);
    } catch (e) {
      entry.ok = false; entry.error = e.message;
      entry.needsPermission = e.status === 403 || /permission|denied/i.test(e.message);
      console.log(`${key} (${sa.project_id}): could not read usage — ${e.message}`);
    }
    out.projects[key] = entry;
  }
  out.cost = {
    todayInr: Math.round(todayInr * 100) / 100,
    todayProjectedInr: Math.round(projTodayInr * 100) / 100,
    monthInr: Math.round(monthInr * 100) / 100,
    monthProjectedInr: Math.round((monthInr - todayInr + projTodayInr * (daysInMonth - (+todayKey.slice(8)) + 1)) * 100) / 100,
  };
  await docRef.set(out);
  console.log(`Cost: today ₹${out.cost.todayInr} (→ ₹${out.cost.todayProjectedInr} by reset) · this month ₹${out.cost.monthInr} of ₹${BUDGET_INR} · USD→INR ${rate}`);
  console.log('Usage saved.');
}
main().catch((e) => { console.error('USAGE FAILED:', e.message); process.exit(1); });
