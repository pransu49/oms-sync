// daily-summary.js - one Telegram message every evening (~9 pm IST):
// robot health, and today's counts of price changes, relists, refunds and SLA-due orders.
// Reads only 4 Firebase records (syncHealth + telegramAlerts + bbDaily + attendanceAlerts) in the console project.
const admin = require('firebase-admin');
const { notify, istNow, esc, LINE } = require('./telegram');

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const [h, a, bbd, att] = await Promise.all([
    db.collection('aikm_admin').doc('syncHealth').get(),
    db.collection('aikm_admin').doc('telegramAlerts').get(),
    db.collection('aikm_admin').doc('bbDaily').get().catch(() => null),
    db.collection('aikm_admin').doc('attendanceAlerts').get().catch(() => null),
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

  const d = new Date(Date.now() + 5.5 * 3600e3).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const out = ['📊 <b>AIKM Daily Summary</b>', `<i>${esc(d)}</i>`, LINE];

  out.push('<b>Robots</b>');
  if (bad.length) {
    out.push(`🔴 <b>${bad.length} stopped</b> · ${robots.length - bad.length} running`);
    bad.forEach((x) => out.push(`   • ${esc(x.label)} — <i>${esc(x.reason || 'failed')}</i>`));
  } else out.push(`🟢 All ${robots.length} running`);
  stale.forEach((x) => out.push(`   ⚠️ ${esc(x.label)} — last run ${ago(x.at)}`));

  // Buy Box + orders per Amazon account (written by the SP-API robot after each full sync)
  const bb = (bbd && bbd.exists && bbd.data()) || {};
  const NAMES = { praso: 'Praso', sastastore: 'Sasta Store' };
  const yday = new Date(Date.parse(today + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  const accts = Object.keys(bb).filter((k) => bb[k] && bb[k][today]).sort();
  if (accts.length) {
    out.push('', '<b>Amazon Buy Box</b>');
    accts.forEach((k) => {
      const t = bb[k][today], y = bb[k][yday];
      const ch = y ? t.held - y.held : null, arrow = ch == null ? '' : ch > 0 ? `  🟢 +${ch}` : ch < 0 ? `  🔴 ${ch}` : '  ⚪ 0';
      const total = (t.held || 0) + (t.lost || 0) + (t.none || 0);
      out.push(`🏆 ${esc(NAMES[k] || k)}   <b>${t.held}</b> of ${total}${arrow}${y ? ' vs yesterday' : ''}`);
      out.push(`   🛒 Orders today <b>${t.orders || 0}</b>${y && y.orders != null ? ` (yesterday ${y.orders})` : ''}   ·   lost ${t.lost} · no offer ${t.none}`);
    });
  }

  out.push('', '<b>Today</b>');
  out.push(`💰 Price updates   <b>${c.price || 0}</b>`);
  out.push(`🔁 Relisted   <b>${c.relist || 0}</b>`);
  out.push(`💸 Refunds   <b>${c.refundOk || 0}</b>${c.refundFail ? `   ❌ ${c.refundFail} failed` : ''}`);

  if (c.slaDue != null) {
    out.push('', `<b>Shipping</b>${c.slaAt ? `  <i>checked ${esc(c.slaAt)}</i>` : ''}`);
    out.push(`📦 Due, not shipped   <b>${c.slaDue}</b>`);
    const sub = [c.slaOverdue ? `⏰ ${c.slaOverdue} overdue` : '', c.slaLabel != null ? `🏷 ${c.slaLabel} label ready` : '', c.slaLabel != null ? `⚪ ${c.slaDue - c.slaLabel} no label` : ''].filter(Boolean);
    if (sub.length) out.push(`   ${sub.join('   ')}`);
  }
  const ad = ((att && att.exists && att.data()) || {}).day || {};
  const t = ad[today];
  if (t) {
    const list = (arr) => arr.map(esc).join(', ');
    out.push('', `<b>Attendance</b>${t.at ? `  <i>checked ${esc(t.at)}</i>` : ''}`);
    out.push(`👥 Present   <b>${t.present.length}</b> / ${t.total}${t.holiday ? '   🎉 Holiday' : ''}`);
    if (t.late.length) out.push(`🔸 Late   <b>${t.late.length}</b>  <i>${list(t.late)}</i>`);
    if (t.absent.length) out.push(`❌ Absent   <b>${t.absent.length}</b>  <i>${list(t.absent)}</i>`);
    if (t.leave.length) out.push(`🌴 On leave   <b>${t.leave.length}</b>  <i>${list(t.leave)}</i>`);
    if (t.stillIn.length) out.push(`⏳ No check-out yet   <b>${t.stillIn.length}</b>  <i>${list(t.stillIn)}</i>`);
    const hrs = Object.entries(t.hours || {}).filter(([, v]) => v != null).sort((p, q) => q[1] - p[1]);
    if (hrs.length) out.push(`⏱ Hours  <i>${hrs.map(([n, v]) => `${esc(n)} ${Math.floor(v)}h${String(Math.round((v % 1) * 60)).padStart(2, '0')}`).join(' · ')}</i>`);
  }
  if (!(await notify(out.join('\n'), { html: true }))) throw new Error('Telegram message was not delivered (see the line above).');

  // keep only the last 30 days of counts
  const days = Object.keys((a.data() || {}).day || {}).sort();
  const old = days.slice(0, Math.max(0, days.length - 30));
  // keep 14 days of Buy Box numbers
  const bbOld = {}; Object.keys(bb).forEach((k) => Object.keys(bb[k] || {}).forEach((d2) => { if (d2 < new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)) bbOld[`${k}.${d2}`] = admin.firestore.FieldValue.delete(); }));
  if (Object.keys(bbOld).length) await db.collection('aikm_admin').doc('bbDaily').update(bbOld).catch(() => {});
  if (old.length) await db.collection('aikm_admin').doc('telegramAlerts').update(Object.fromEntries(old.map((k) => [`day.${k}`, admin.firestore.FieldValue.delete()])));
})().catch((e) => { console.error('DAILY SUMMARY FAILED:', e.message); process.exit(1); });
