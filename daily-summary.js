// daily-summary.js - one Telegram message every evening (~9 pm IST):
// robot health, and today's counts of price changes, relists, refunds and SLA-due orders.
// Reads only 2 Firebase records (syncHealth + telegramAlerts) in the console project.
const admin = require('firebase-admin');
const { notify, istNow } = require('./telegram');

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const [h, a] = await Promise.all([
    db.collection('aikm_admin').doc('syncHealth').get(),
    db.collection('aikm_admin').doc('telegramAlerts').get(),
  ]);
  const today = istNow().date;
  const health = h.data() || {};
  const c = ((a.data() || {}).day || {})[today] || {};

  const ago = (t) => { const m = t && t.toMillis ? (Date.now() - t.toMillis()) / 60e3 : null; return m == null ? '' : m < 90 ? `${Math.round(m)} min ago` : `${Math.round(m / 60)} h ago`; };
  const robots = Object.values(health).filter((x) => x && x.label).sort((x, y) => String(x.label).localeCompare(String(y.label)));
  const bad = robots.filter((x) => x.ok === false);
  // how long each robot may go quiet before it is "late": daily robots 26 h, on-command robots never
  const LATE_H = { refund: 26, refundcheck: 26, easyship: 26, refundrobot: 0 };
  const stale = Object.entries(health).filter(([k, x]) => {
    const lim = k in LATE_H ? LATE_H[k] : 6;
    return lim && x && x.label && x.ok && x.at && x.at.toMillis && Date.now() - x.at.toMillis() > lim * 3600e3;
  }).map(([, x]) => x);

  const d = new Date(Date.now() + 5.5 * 3600e3).toUTCString().slice(5, 16);
  const out = [`📊 AIKM daily summary · ${d}`, ''];
  out.push(bad.length ? `🔴 Robots stopped: ${bad.length}` : `✅ All ${robots.length} robots working`);
  bad.forEach((x) => out.push(`  • ${x.label}: ${x.reason || 'failed'}`));
  stale.forEach((x) => out.push(`  ⚠️ ${x.label}: last run ${ago(x.at)}`));
  out.push('');
  out.push(`💰 Price changes today: ${c.price || 0}`);
  out.push(`🔁 Listings relisted: ${c.relist || 0}`);
  out.push(`💸 Refunds: ${c.refundOk || 0} done${c.refundFail ? `, ${c.refundFail} failed` : ''}`);
  if (c.slaDue != null) {
    const parts = [c.slaOverdue ? `${c.slaOverdue} overdue` : '', c.slaLabel != null ? `${c.slaLabel} have label, ${c.slaDue - c.slaLabel} no label` : ''].filter(Boolean);
    out.push(`📦 Not shipped yet, due today${c.slaAt ? ` (checked ${c.slaAt})` : ''}: ${c.slaDue}${parts.length ? `\n   (${parts.join(' · ')})` : ''}`);
  }
  if (!(await notify(out.join('\n')))) throw new Error('Telegram message was not delivered (see the line above).');

  // keep only the last 30 days of counts
  const days = Object.keys((a.data() || {}).day || {}).sort();
  const old = days.slice(0, Math.max(0, days.length - 30));
  if (old.length) await db.collection('aikm_admin').doc('telegramAlerts').update(Object.fromEntries(old.map((k) => [`day.${k}`, admin.firestore.FieldValue.delete()])));
})().catch((e) => { console.error('DAILY SUMMARY FAILED:', e.message); process.exit(1); });
