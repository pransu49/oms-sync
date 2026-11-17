try { require('./fb-meter'); } catch (e) {} // Firebase usage meter (counts only)
// audit-review.js — 2-weekly access-log review (Amazon restricted-role rule: audit logs, reviewed every 2 weeks, kept 12 months).
// 1. Reads the last 14 days of OMS Firebase `aikm_audit` (one record per page open / sign-in / sign-out, written by console/aikm-auth.js).
//    Only signed-in allowed staff can create records (Firestore rules); nobody can edit or delete them from a browser.
// 2. Lists every robot run of the same 14 days from GitHub (robots read buyer data with server keys, not with a staff sign-in).
// 3. Flags: account or device never seen before, access at night (11 PM - 7 AM IST), failed robot runs.
// 4. Saves the review in `aikm_auditReview/<date>` (kept, tiny) + Telegram summary to the owner.
// 5. Deletes access records older than 400 days (13 months).
// Firebase: ~N reads (N = page opens in 14 days, ~1,000-3,000) + 2 reads + 1-2 writes, twice a month.
const admin = require('firebase-admin');
const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
const db = app.firestore();
const DAYS = 14, KEEP_DAYS = 400;
const DRY = process.env.DRY_RUN === 'true';

const ist = d => new Date(d.getTime() + 5.5 * 3600e3);
const istStr = d => ist(d).toISOString().replace('T', ' ').slice(0, 16);
const device = ua => {
  ua = String(ua || '');
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return os + ' ' + br;
};
const page = p => String(p || '').replace(/^\/pages\//, '').split('&')[0] || '/';
const keyOf = s => String(s).replace(/[.\/]/g, '_');

async function tg(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat || DRY) { console.log('--- TELEGRAM ---\n' + text); return; }
  const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
  if (!r.ok) console.log('Telegram failed', r.status, await r.text());
}

async function robotRuns(since) {
  const repo = process.env.GITHUB_REPOSITORY, tok = process.env.GITHUB_TOKEN;
  if (!repo || !tok) return null;
  const by = {};
  for (let pg = 1; pg <= 30; pg++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&page=${pg}&created=>=${since.toISOString().slice(0, 10)}`,
      { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' } });
    if (!r.ok) { console.log('GitHub runs', r.status); break; }
    const runs = (await r.json()).workflow_runs || [];
    for (const w of runs) {
      if (w.conclusion === 'skipped') continue;
      const b = by[w.name] || (by[w.name] = { n: 0, fail: 0 });
      b.n++; if (w.conclusion === 'failure') b.fail++;
    }
    if (runs.length < 100) break;
  }
  return by;
}

(async () => {
  const now = new Date(), since = new Date(now - DAYS * 864e5);
  const snap = await db.collection('aikm_audit').where('t', '>=', since).get();
  const rows = snap.docs.map(d => d.data()).map(x => ({ e: x.e, ev: x.ev, p: page(x.p), t: x.t && x.t.toDate ? x.t.toDate() : new Date(x.t), dev: device(x.ua) }));
  console.log(`access records in ${DAYS} days: ${rows.length}`);

  const knownRef = db.collection('aikm_auditReview').doc('known');
  const known = ((await knownRef.get()).data() || {}).dev || {};
  const firstReview = !Object.keys(known).length;
  const users = {}, flags = [], newDev = {};
  for (const r of rows) {
    const u = users[r.e] || (users[r.e] = { opens: 0, signin: 0, signout: 0, pages: {}, devs: {} });
    if (r.ev === 'signin') u.signin++; else if (r.ev === 'signout') u.signout++; else u.opens++;
    u.pages[r.p] = (u.pages[r.p] || 0) + 1; u.devs[r.dev] = 1;
    const h = ist(r.t).getUTCHours();
    if (h >= 23 || h < 7) flags.push(`Night access: ${r.e} opened ${r.p} at ${istStr(r.t)} IST`);
    const k = keyOf(r.e + '|' + r.dev);
    if (!known[k] && !newDev[k]) newDev[k] = { who: r.e, dev: r.dev, at: istStr(r.t) };
  }
  if (!firstReview) for (const v of Object.values(newDev)) flags.push(`New account/device: ${v.who} on ${v.dev} (first ${v.at} IST)`);

  const runs = await robotRuns(since);
  const failed = runs ? Object.entries(runs).filter(([, b]) => b.fail).map(([n, b]) => `${n}: ${b.fail} failed of ${b.n}`) : [];
  const totalRuns = runs ? Object.values(runs).reduce((a, b) => a + b.n, 0) : 0;

  const id = ist(now).toISOString().slice(0, 10);
  const review = {
    at: admin.firestore.FieldValue.serverTimestamp(), from: since, to: now, records: rows.length,
    users: Object.entries(users).map(([e, u]) => ({ who: e, opens: u.opens, signin: u.signin, signout: u.signout, pages: u.pages, devices: Object.keys(u.devs) })),
    flags: flags.slice(0, 200), robots: runs || {}, robotRuns: totalRuns, status: 'sent to owner',
  };

  let msg = `🔐 AIKM access review (${DAYS} days to ${id})\n`;
  msg += `Staff page opens: ${rows.length}\n`;
  for (const [e, u] of Object.entries(users)) {
    const top = Object.entries(u.pages).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} ${n}`).join(', ');
    msg += `• ${e}: ${u.opens} opens, ${u.signin} sign-ins, ${u.signout} sign-outs · ${Object.keys(u.devs).join(', ')}\n   ${top}\n`;
  }
  if (!rows.length) msg += '• No staff access recorded.\n';
  if (firstReview && Object.keys(newDev).length) msg += `(First review: ${Object.keys(newDev).length} account/device pairs saved as known.)\n`;
  msg += `\nRobot runs: ${totalRuns}${runs ? ` (${Object.keys(runs).length} robots)` : ' (GitHub list not available)'}\n`;
  if (failed.length) msg += 'Failed runs:\n' + failed.slice(0, 15).map(x => '• ' + x).join('\n') + '\n';
  msg += flags.length ? `\n⚠️ Check these (${flags.length}):\n` + flags.slice(0, 20).map(x => '• ' + x).join('\n') + (flags.length > 20 ? `\n… +${flags.length - 20} more (saved in the review)` : '')
    : '\n✅ Nothing unusual: no night access, no new accounts or devices.';
  msg += '\n\nIf anything above was NOT you, tell Claude at once (sign everyone out + change the Google password).';

  if (!DRY) {
    await db.collection('aikm_auditReview').doc(id).set(review);
    const dev = { ...known }; for (const [k, v] of Object.entries(newDev)) dev[k] = v.at;
    await knownRef.set({ dev }, { merge: true });
  }
  await tg(msg);

  // 13-month retention: delete older access records
  const cut = new Date(now - KEEP_DAYS * 864e5);
  let del = 0;
  for (;;) {
    const old = await db.collection('aikm_audit').where('t', '<', cut).limit(400).get();
    if (old.empty || DRY) { if (DRY) console.log('would delete', old.size, '(first page)'); break; }
    const b = db.batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit(); del += old.size;
    if (old.size < 400) break;
  }
  console.log(`review ${id} saved, ${flags.length} flags, deleted ${del} records older than ${KEEP_DAYS} days`);
})().catch(e => { console.error('audit-review failed:', e); process.exit(1); });
