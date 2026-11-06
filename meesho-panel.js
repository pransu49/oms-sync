// Meesho Supplier Panel robot — runs on the office Windows PC (self-hosted Windows runner DESKTOP-7C3H54H, C:\aikm-runner).
// Meesho blocks cloud servers, so this must run on a normal Indian internet connection.
// MODE=login : opens a visible Chrome window; owner signs in once (OTP if asked). Login is kept in the profile folder.
// MODE=check : reads the panel home (pending orders, labels to download, stock alerts) and sends it to Telegram. Changes nothing.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ACCT = (process.env.ACCOUNT || 'noworry').toLowerCase();
const MODE = (process.env.MODE || 'check').toLowerCase();
const PROFILE = path.join(process.env.AIKM_DIR || 'C:\\aikm-robot', 'meesho-' + ACCT);
const HOME = 'https://supplier.meesho.com/panel/v3/new/root/login';

async function tg(text, photo) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try {
    if (photo && fs.existsSync(photo)) {
      const fd = new FormData(); fd.append('chat_id', chat); fd.append('caption', text.slice(0, 1000));
      fd.append('photo', new Blob([fs.readFileSync(photo)]), path.basename(photo));
      await fetch(`https://api.telegram.org/bot${tok}/sendPhoto`, { method: 'POST', body: fd });
    } else {
      await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
    }
  } catch (e) { console.log('telegram failed', e.message); }
}
const loggedIn = (u) => /supplier\.meesho\.com\/panel/.test(u) && !/login/i.test(u);

(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  const opts = { headless: false, // Meesho treats headless browsers as signed out; a window opens briefly on the PC
    viewport: { width: 1366, height: 860 }, locale: 'en-IN' };
  let ctx;
  try { ctx = await chromium.launchPersistentContext(PROFILE, { ...opts, channel: 'chrome' }); }
  catch (e) { console.log('Chrome not found, using built-in browser'); ctx = await chromium.launchPersistentContext(PROFILE, opts); }
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 10 && !loggedIn(p.url()); i++) await p.waitForTimeout(2000); // give the panel time to redirect when signed in
  console.log('URL:', p.url(), 'TITLE:', await p.title());
  if (/access denied/i.test(await p.title())) { await tg('❌ Meesho (' + ACCT + '): Access Denied from this PC'); throw new Error('Access Denied'); }

  if (MODE === 'login') {
    if (!loggedIn(p.url())) {
      await tg('🔐 Meesho (' + ACCT + '): a Chrome window is open on the office PC — please sign in there (you have 10 minutes).');
      const end = Date.now() + 10 * 60 * 1000;
      while (Date.now() < end && !loggedIn(p.url())) await p.waitForTimeout(3000);
    }
    const ok = loggedIn(p.url());
    console.log('LOGIN:', ok ? 'OK' : 'NOT DONE');
    await tg(ok ? '✅ Meesho (' + ACCT + '): signed in and saved on the office PC. The robot can now run on its own.' : '⚠️ Meesho (' + ACCT + '): sign-in not finished in 10 minutes. Start "Meesho login setup" again.');
    await p.waitForTimeout(3000); await ctx.close(); process.exit(ok ? 0 : 1);
  }

  // MODE=check
  if (!loggedIn(p.url())) { await tg('⚠️ Meesho (' + ACCT + '): not signed in on the office PC. Run "Meesho login setup".'); throw new Error('not logged in'); }
  const txt = await p.locator('body').innerText();
  const grab = (label) => { const m = txt.match(new RegExp(label + '\\s*\\n+\\s*(\\d+)', 'i')); return m ? +m[1] : null; };
  const r = { pending: grab('Pending Orders'), labels: grab('Download Labels'), oos: grab('Out of Stock'), low: grab('Low Stock') };
  const name = (txt.match(/Welcome back,\s*([^!\n]+)/i) || [])[1] || ACCT;
  console.log('CHECK:', JSON.stringify(r), 'NAME:', name);
  await p.screenshot({ path: 'meesho-home.png' });
  await tg(`🟣 Meesho test (${name}) — from office PC\nPending orders: ${r.pending ?? '?'}\nLabels to download: ${r.labels ?? '?'}\nOut of stock: ${r.oos ?? '?'} · Low stock: ${r.low ?? '?'}\n(Read only — nothing changed)`, 'meesho-home.png');
  await ctx.close();
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
