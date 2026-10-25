// report-health.js <key> <label> <logfile>
// Runs as the LAST step of every sync workflow (even when the sync failed).
// Saves: ok/failed, a plain-language reason, the error line and the last part of the log
// into Firestore aikm_admin/syncHealth (main console project), so the console can show it.
const fs = require('fs');
const admin = require('firebase-admin');

const [key, label, logFile] = process.argv.slice(2);
const status = String(process.env.JOB_STATUS || 'unknown').toLowerCase();
let log = '';
try { log = fs.readFileSync(logFile, 'utf8'); } catch (e) { log = '(no log captured)'; }
// keep it readable and safe: drop long secrets-looking strings, keep the last ~250 lines
log = log.replace(/(github_pat_|ghp_|npk_|AIza|Bearer\s+)[A-Za-z0-9_\-\.]{8,}/g, '$1***')
  .replace(/-----BEGIN [\s\S]*?-----END [A-Z ]+-----/g, '***');
const lines = log.split(/\r?\n/);
const tail = lines.slice(-250).join('\n').slice(-60000);

const REASONS = [
  [/RESOURCE_EXHAUSTED|Quota exceeded|quota.*exceed/i, 'Firebase free daily limit reached', 'Wait — it resets around 12:30 pm IST (1:30 pm from November). If it keeps happening, tell Claude.'],
  [/CSRF token|export form|form changed|could not find the export download|download link|page changed|Export was not queued/i, 'OMS Guru page changed', 'OMS Guru changed its website — share the log with Claude to update the robot.'],
  [/login failed|did not redirect|Invalid email or password|password field/i, 'Login failed', 'Password may have changed — update it in GitHub secrets, or share the log with Claude.'],
  [/Invalid API key|UNAUTHORIZED|unauthori[sz]ed|invalid_grant|access token/i, 'Key / token rejected', 'The API key or token expired or was changed — share the log with Claude.'],
  [/too many index entries|exceeds the maximum allowed size|maximum.*bytes/i, 'Data too large for Firebase', 'Share the log with Claude.'],
  [/throttl|TooManyRequests|\b429\b|rate limit/i, 'Rate limited (temporary)', 'Nothing to do — the next run usually works.'],
  [/ETIMEDOUT|ECONNRESET|socket hang up|fetch failed|timed out|\b50[234]\b|ENOTFOUND/i, 'Website did not respond (temporary)', 'Nothing to do — the next run usually works. If it repeats, share the log.'],
];
const errLine = [...lines].reverse().find((l) => /FAILED|Error|error:|failed/i.test(l) && !/^\s*at /.test(l)) || '';
let reason = '', fix = '';
if (status !== 'success') {
  const hit = REASONS.find(([re]) => re.test(log));
  if (hit) { reason = hit[1]; fix = hit[2]; }
  else if (status === 'cancelled') { reason = 'Run was cancelled or timed out'; fix = 'Nothing to do unless it repeats.'; }
  else { reason = 'Sync failed'; fix = 'Share the log with Claude.'; }
}

// ---- Telegram alerts (AIKM_OPS_ALERTS_bot) ----
// 1) A robot stops  -> one alert (repeated at most every 6 hours while it stays broken)
// 2) It works again -> one "working again" alert
// 3) Robot actions in this run (price changes, relists, refunds, SLA due) -> one grouped message
const { notify, istNow, esc, LINE } = require('./telegram');
const ACTION_RULES = [
  [/Buy Box pricer (LOWER|RAISE) /, 'price'],
  [/^\s*Price fix /, 'price'],
  [/Robot learning REVERT /, 'price'],
  [/^\s*Relist \[.*ACCEPTED/, 'relist'],
  [/^Finished: \d+ refunded/, 'refund'],
];
const clean = (l) => l.replace(/^\S+Z\s+/, '').replace(/\s+/g, ' ').trim();
function actionLines() {
  const out = { price: [], relist: [], refund: [] };
  lines.forEach((l) => { const r = ACTION_RULES.find(([re]) => re.test(l)); if (r) out[r[1]].push(clean(l)); });
  return out;
}
const slaLine = lines.find((l) => /^SLA_ALERT:/.test(l));
const slaList = lines.filter((l) => /^SLA_ITEM:/.test(l)).map((l) => l.replace(/^SLA_ITEM:\s*/, ''));
const more = (n) => (n > 0 ? `\n<i>+ ${n} more in the console</i>` : '');
const rs = (v) => `₹${Number(v).toLocaleString('en-IN')}`;
// one tidy line per price change:  ▼ <code>SKU</code>  ₹199 → ₹189
function priceLine(l) {
  const m = l.match(/(?:LOWER|RAISE|REVERT|Price fix)\s+(\S+?):\s*(?:₹|Rs\s*)([\d.]+)\s*->\s*(?:₹|Rs\s*)([\d.]+)/);
  if (!m) return `• ${esc(l.slice(0, 80))}`;
  const [, sku, a, b] = m;
  return `${+b < +a ? '🔻' : '🔺'} <code>${esc(sku)}</code>  ${rs(a)} → <b>${rs(b)}</b>`;
}
// relist:  • <code>ASIN</code>  ₹199  (new listing)
function relistLine(l) {
  const asin = (l.match(/ASIN\s+([A-Z0-9]{10})/) || [])[1] || '';
  const price = (l.match(/at Rs\s*([\d.]+)/) || [])[1];
  const why = (l.match(/Relist \[([^\]]+)\]/) || [])[1] || '';
  return `• <code>${esc(asin || l.slice(0, 40))}</code>${price ? `  ${rs(price)}` : ''}${why ? `  <i>${esc(why)}</i>` : ''}`;
}
// "E Commerce Munda - Amazon" -> "E Commerce Munda · Amazon"
const chName = (c) => String(c || '').replace(/\s*-\s*Ama[a-z]*$/i, ' · Amazon').replace(/\s*-\s*Mee[a-z]*$/i, ' · Meesho').replace(/\s*-\s*Fli[a-z]*$/i, ' · Flipkart').trim();

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const run = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const entry = {
    label, ok: status === 'success', status, reason, fix,
    error: errLine.replace(/^\S+Z\s+/, '').slice(0, 500),
    at: admin.firestore.FieldValue.serverTimestamp(), run, event: process.env.GITHUB_EVENT_NAME || '',
  };
  if (status !== 'success') { entry.log = tail; entry.failedAt = admin.firestore.FieldValue.serverTimestamp(); }
  else entry.log = lines.slice(-40).join('\n').slice(-8000);
  const ref = db.collection('aikm_admin').doc('syncHealth');
  let prev = null;
  try { prev = (await ref.get()).get(key) || null; } catch (e) { /* unknown - treat as first run */ }
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);

  // --- alerts ---
  const alertRef = db.collection('aikm_admin').doc('telegramAlerts');
  const today = istNow();
  try {
    if (status !== 'success' && status !== 'cancelled') {
      const lastAlert = prev && !prev.ok ? ms(prev.alertedAt) : 0;
      if (!lastAlert || Date.now() - lastAlert > 6 * 3600e3) {
        await notify([
          `🔴 <b>${lastAlert ? 'Still stopped' : 'Robot stopped'}</b>`,
          `<b>${esc(label)}</b>`,
          LINE,
          `<b>Why</b>\n${esc(reason || 'Unknown')}\n`,
          `<b>What to do</b>\n${esc(fix || 'Share the log with Claude.')}`,
          entry.error ? `\n<blockquote>${esc(entry.error.slice(0, 180))}</blockquote>` : '',
          `\n<a href="${run}">Open run details →</a>`,
        ].filter((x) => x !== '').join('\n'), { html: true });
        entry.alertedAt = admin.firestore.FieldValue.serverTimestamp();
      } else entry.alertedAt = prev.alertedAt;
    } else if (status === 'success' && prev && prev.ok === false && prev.alertedAt) {
      await notify(`🟢 <b>Back online</b>\n${esc(label)} is working again.`, { html: true });
    }

    if (status === 'success') {
      const a = actionLines();
      const acc = /sasta/i.test(key) ? 'Sasta Store' : /praso/i.test(key) ? 'Praso' : '';
      const parts = [];
      if (a.price.length) parts.push(`💰 <b>Price updates · ${a.price.length}</b>${acc ? `  <i>${acc}</i>` : ''}\n` + a.price.slice(0, 8).map(priceLine).join('\n') + more(a.price.length - 8));
      if (a.relist.length) parts.push(`🔁 <b>Relisted · ${a.relist.length}</b>${acc ? `  <i>${acc}</i>` : ''}\n` + a.relist.slice(0, 6).map(relistLine).join('\n') + more(a.relist.length - 6));
      if (a.refund.length) {
        const m = a.refund[0].match(/(\d+) refunded, (\d+) failed(?:, (\d+) skipped)?/);
        parts.push(m ? `💸 <b>Bulk refund done</b>\n✅ ${m[1]} refunded   ❌ ${m[2]} failed${m[3] ? `   ⏭ ${m[3]} skipped` : ''}` : `💸 <b>Bulk refund</b>\n${esc(a.refund[0])}`);
      }
      const inc = admin.firestore.FieldValue.increment;
      const counts = {};
      if (a.price.length) counts.price = inc(a.price.length);
      if (a.relist.length) counts.relist = inc(a.relist.length);
      if (a.refund.length) { const m = a.refund[0].match(/(\d+) refunded, (\d+) failed/); if (m) { counts.refundOk = inc(+m[1]); counts.refundFail = inc(+m[2]); } }
      if (parts.length) await notify(parts.join(`\n${LINE}\n`), { html: true });
      if (Object.keys(counts).length) await alertRef.set({ day: { [today.date]: counts } }, { merge: true });

      // SLA due: at most twice a day (morning + afternoon), only 9 am - 8 pm
      if (slaLine && today.hour >= 9 && today.hour <= 20) {
        const slot = `${today.date}-${today.hour < 14 ? 'am' : 'pm'}`;
        const st = (await alertRef.get()).data() || {};
        if (st.slaSlot !== slot) {
          const total = +((slaLine.match(/(\d+) order/) || [])[1] || slaList.length);
          const over = +((slaLine.match(/(\d+) already overdue/) || [])[1] || 0);
          const withLabel = slaList.filter((x) => /label ready/.test(x)).length;
          const byAcc = {};
          slaList.forEach((x) => { const c = chName(x.replace(/^⏰ OVERDUE /, '').split(' · ')[1]); byAcc[c] = (byAcc[c] || 0) + 1; });
          const top = Object.entries(byAcc).sort((p, q) => q[1] - p[1]);
          await notify([
            '📦 <b>Orders due today · not shipped</b>',
            LINE,
            `<b>${total}</b> orders${over ? `   ⏰ <b>${over}</b> overdue` : ''}`,
            `🏷 ${withLabel} label ready   ⚪ ${slaList.length - withLabel} no label`,
            '\n<b>By account</b>',
            ...top.slice(0, 6).map(([c, n]) => `• ${esc(c)} — <b>${n}</b>`),
            top.length > 6 ? `<i>+ ${top.length - 6} more accounts</i>` : '',
          ].filter((x) => x !== '').join('\n'), { html: true });
          await alertRef.set({ slaSlot: slot }, { merge: true });
        }
      }
      if (slaLine) {
        const n = slaLine.match(/(\d+) order/);
        const o = slaLine.match(/(\d+) already overdue/);
        const at = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(11, 16) + ' IST';
        if (n) await alertRef.set({ day: { [today.date]: { slaDue: +n[1], slaOverdue: o ? +o[1] : 0, slaLabel: slaList.filter((x) => /label ready/.test(x)).length, slaAt: at } } }, { merge: true });
      }
    }
  } catch (e) { console.log('Alert step skipped:', e.message); }

  // Every open console tab re-reads this document each time it changes. A healthy sync that was
  // already reported healthy in the last 25 minutes is not re-saved (saves thousands of reads/day).
  if (status === 'success' && prev && prev.ok && Date.now() - ms(prev.at) < 25 * 60e3) {
    console.log(`Health unchanged (${key} ok) - not re-saved.`); return;
  }
  if (status === 'success') entry.alertedAt = null;
  await ref.set({ [key]: entry }, { merge: true });
  console.log(`Health saved: ${key} = ${status}${reason ? ' (' + reason + ')' : ''}`);
})().catch((e) => { console.log('Could not save health report:', e.message); });
