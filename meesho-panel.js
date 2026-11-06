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
const LIMIT = +(process.env.LIMIT || 0);   // 0 = all
const BASE = 'https://supplier.meesho.com/panel/v3/new/fulfillment/1njbs/orders/';
async function rows(p) { return p.locator('tr').filter({ hasText: /Order ID:/ }); }
async function snap(p, n) { try { await p.screenshot({ path: n + '.png', fullPage: false }); } catch (_) {} return n + '.png'; }
async function closePopups(p) { for (const t of [/^Close$/i, /^Got it$/i, /^Skip$/i, /^Not now$/i]) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); } await p.keyboard.press('Escape').catch(() => {}); }
async function processOrders(p, ctx) {
  if (!loggedIn(p.url())) { await tg('⚠️ Meesho (' + ACCT + '): not signed in on the office PC. Run "Meesho login setup".'); throw new Error('not logged in'); }
  const done = { accepted: [], labels: [], failed: [] };
  // 1) Accept pending orders
  await p.goto(BASE + 'pending', { waitUntil: 'domcontentloaded' });
  await p.getByText(/Product Details/i).first().waitFor({ timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(4000); await closePopups(p);
  let n = 0;
  while (!LIMIT || n < LIMIT) {
    const r = (await rows(p)).filter({ has: p.getByRole('button', { name: /^Accept$/i }) }).first();
    if (!(await r.count())) break;
    const oid = ((await r.innerText()).match(/Order ID:\s*(\d+)/) || [])[1] || '?';
    console.log('ACCEPT', oid);
    await r.getByRole('button', { name: /^Accept$/i }).click();
    await p.waitForTimeout(2500);
    console.log('AFTER ACCEPT CLICK:', (await p.locator('[role=dialog], .MuiDialog-root, .modal').allInnerTexts().catch(() => [])).join(' | ').slice(0, 400));
    const confirm = p.locator('[role=dialog], .MuiDialog-root, .modal').getByRole('button', { name: /^(Accept|Confirm|Yes|Accept Order|Accept order)$/i });
    if (await confirm.count()) { await confirm.first().click(); await p.waitForTimeout(3000); }
    await snap(p, 'after-accept-' + oid);
    done.accepted.push(oid); n++;
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000); await closePopups(p);
  }
  // 2) Download labels for orders that are Ready to Ship and "Not Downloaded"
  await p.goto(BASE + 'ready-to-ship', { waitUntil: 'domcontentloaded' });
  await p.getByText(/Product Details/i).first().waitFor({ timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(5000); await closePopups(p);
  const want = new Set(done.accepted);
  const all = await rows(p); const cnt = await all.count();
  console.log('READY TO SHIP ROWS:', cnt);
  for (let i = 0; i < cnt; i++) {
    const r = all.nth(i); const t = await r.innerText();
    const oid = (t.match(/Order ID:\s*(\d+)/) || [])[1];
    if (!/Not Downloaded/i.test(t) || /Auto-retrying/i.test(t)) continue;
    if (LIMIT && !want.has(oid)) continue;   // test mode: only the orders accepted in this run
    const prod = t.split('\n').map(x => x.trim()).filter(Boolean)[0];
    console.log('LABEL', oid, prod);
    try {
      const dl = p.waitForEvent('download', { timeout: 60000 });
      await r.getByRole('button', { name: /^Label$/i }).first().click();
      await p.waitForTimeout(2500);
      const modalBtn = p.locator('[role=dialog], .MuiDialog-root, .modal').getByRole('button', { name: /download/i });
      if (await modalBtn.count()) { console.log('LABEL DIALOG:', (await p.locator('[role=dialog], .MuiDialog-root, .modal').first().innerText()).slice(0, 300)); await modalBtn.first().click(); }
      const d = await dl; const f = path.join(process.cwd(), 'meesho-label-' + oid + '.pdf'); await d.saveAs(f);
      done.labels.push({ oid, prod, f });
    } catch (e) { console.log('LABEL FAILED', oid, e.message.split('\n')[0]); done.failed.push(oid); await snap(p, 'label-fail-' + oid); await closePopups(p); }
  }
  console.log('RESULT:', JSON.stringify({ accepted: done.accepted, labels: done.labels.map(x => x.oid), failed: done.failed }));
  await tg(`🟣 Meesho (${ACCT}) — office PC\nAccepted: ${done.accepted.length} ${done.accepted.join(', ')}\nLabels downloaded: ${done.labels.length}\nFailed: ${done.failed.length} ${done.failed.join(', ')}`);
  for (const x of done.labels) await tgDoc(x.f, `Meesho label · ${x.prod} · Qty 1 · ${x.oid}`);
  for (const f of fs.readdirSync('.').filter(f => /^(after-accept|label-fail)-.*\.png$/.test(f))) await tg('Meesho step: ' + f, f);
  await ctx.close();
}
async function tgDoc(file, caption) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID; if (!tok || !chat) return;
  const fd = new FormData(); fd.append('chat_id', chat); fd.append('caption', caption.slice(0, 1000));
  fd.append('document', new Blob([fs.readFileSync(file)]), path.basename(file));
  await fetch(`https://api.telegram.org/bot${tok}/sendDocument`, { method: 'POST', body: fd }).catch(e => console.log('tg doc failed', e.message));
}
const loggedIn = (u) => /supplier\.meesho\.com\/panel/.test(u) && !/login/i.test(u);

(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  const opts = { acceptDownloads: true, headless: false, // Meesho treats headless browsers as signed out; a window opens briefly on the PC
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

  if (MODE === 'process') return await processOrders(p, ctx);
  // MODE=check
  if (!loggedIn(p.url())) { await tg('⚠️ Meesho (' + ACCT + '): not signed in on the office PC. Run "Meesho login setup".'); throw new Error('not logged in'); }
  await p.getByText(/Pending Orders/i).first().waitFor({ timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(4000);
  const txt = await p.locator('body').innerText();
  const grab = (label) => { const m = txt.match(new RegExp(label + '\\s*\\n+\\s*(\\d+)', 'i')); return m ? +m[1] : null; };
  const r = { pending: grab('Pending Orders'), labels: grab('Download Labels'), oos: grab('Out of Stock'), low: grab('Low Stock') };
  const name = (txt.match(/Welcome back,\s*([^!\n]+)/i) || [])[1] || ACCT;
  console.log('CHECK:', JSON.stringify(r), 'NAME:', name);
  await p.screenshot({ path: 'meesho-home.png' });
  await tg(`🟣 Meesho test (${name}) — from office PC\nPending orders: ${r.pending ?? '?'}\nLabels to download: ${r.labels ?? '?'}\nOut of stock: ${r.oos ?? '?'} · Low stock: ${r.low ?? '?'}\n(Read only — nothing changed)`, 'meesho-home.png');
  await ctx.close();
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
