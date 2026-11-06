// One-off test: can the robot log into the Meesho Supplier Panel without an OTP?
// Logs in with secrets MEESHO_EMAIL_AIKM / MEESHO_PASSWORD_AIKM, sends a screenshot to Telegram.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const email = process.env.MEESHO_EMAIL, pass = process.env.MEESHO_PASSWORD;
  if (!email || !pass) { console.log('Missing MEESHO_EMAIL_AIKM / MEESHO_PASSWORD_AIKM secrets'); process.exit(1); }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const shot = async (n) => { await p.screenshot({ path: n + '.png' }); };
  await p.goto('https://supplier.meesho.com/panel/v3/new/root/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(5000); await shot('1-login-page');
  const user = p.locator('input[type=email], input[name*=mail i], input[name*=phone i], input[placeholder*=mail i], input[placeholder*=phone i], input[type=text]').first();
  await user.fill(email);
  const pw = p.locator('input[type=password]').first();
  if (!(await pw.count())) { // some versions show password after "Continue"
    await p.locator('button:has-text("Continue"), button:has-text("Next"), button[type=submit]').first().click().catch(() => {});
    await p.waitForTimeout(3000);
  }
  await p.locator('input[type=password]').first().fill(pass);
  await p.locator('button:has-text("Log in"), button:has-text("Login"), button[type=submit]').first().click();
  await p.waitForTimeout(12000); await shot('2-after-login');
  const txt = (await p.locator('body').innerText().catch(() => '')).slice(0, 3000);
  const url = p.url();
  let result = 'UNKNOWN';
  if (/otp|verification code|verify/i.test(txt)) result = 'OTP ASKED';
  else if (!/login/i.test(url)) result = 'LOGGED IN (no OTP)';
  else if (/incorrect|invalid|wrong/i.test(txt)) result = 'WRONG LOGIN';
  console.log('RESULT:', result); console.log('URL:', url); console.log('PAGE TEXT:\n' + txt.slice(0, 800));
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (tok && chat) for (const n of ['1-login-page', '2-after-login']) {
    const fd = new FormData(); fd.append('chat_id', chat);
    fd.append('caption', 'Meesho login test (AIKM): ' + n + (n.startsWith('2') ? ' — ' + result : ''));
    fd.append('photo', new Blob([fs.readFileSync(n + '.png')]), n + '.png');
    await fetch(`https://api.telegram.org/bot${tok}/sendPhoto`, { method: 'POST', body: fd }).catch(() => {});
  }
  await b.close();
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
