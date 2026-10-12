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

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const run = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const entry = {
    label, ok: status === 'success', status, reason, fix,
    error: errLine.replace(/^\S+Z\s+/, '').slice(0, 500),
    at: admin.firestore.FieldValue.serverTimestamp(), run, event: process.env.GITHUB_EVENT_NAME || '',
  };
  if (status !== 'success') { entry.log = tail; entry.failedAt = admin.firestore.FieldValue.serverTimestamp(); }
  else entry.log = lines.slice(-40).join('\n').slice(-8000);
  const ref = admin.firestore().collection('aikm_admin').doc('syncHealth');
  // Every open console tab re-reads this document each time it changes. A healthy sync that was
  // already reported healthy in the last 25 minutes is not re-saved (saves thousands of reads/day).
  if (status === 'success') {
    try {
      const prev = (await ref.get()).get(key);
      const at = prev && prev.at && prev.at.toMillis ? prev.at.toMillis() : 0;
      if (prev && prev.ok && Date.now() - at < 25 * 60e3) { console.log(`Health unchanged (${key} ok) - not re-saved.`); return; }
    } catch (e) { /* fall through and save */ }
  }
  await ref.set({ [key]: entry }, { merge: true });
  console.log(`Health saved: ${key} = ${status}${reason ? ' (' + reason + ')' : ''}`);
})().catch((e) => { console.log('Could not save health report:', e.message); });
