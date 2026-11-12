/**
 * Amazon daily payout robot (owner, 12 Nov 2026): every day at 8 AM IST asks Amazon to pay out the
 * available balance of Sasta Store to the bank account ALREADY SAVED in Seller Central — same as pressing
 * "Request Transfer". It cannot send money anywhere else (Amazon only pays to the seller's own deposit method).
 *
 * Amazon Transfers API v2024-06-01 (needs the Finance and Accounting role):
 *   getPaymentMethods  GET  /finances/transfers/2024-06-01/paymentMethods?marketplaceId=...   (read-only)
 *   initiatePayout     POST /finances/transfers/2024-06-01/payouts { marketplaceId, accountType }
 * Amazon allows ONE on-demand payout per store + account type every 24 hours.
 *
 * Env: PAYOUT_MODE = check (read-only: list bank accounts, move nothing) | pay
 *      SPAPI_CLIENT_ID / SPAPI_CLIENT_SECRET / SPAPI_REFRESH_TOKEN, ACCOUNT_NAME, TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
 * No Firebase reads or writes.
 */
const SellingPartnerAPI = require('amazon-sp-api');

const MARKETPLACE_ID = 'A21TJRUUN4KGV';   // Amazon.in
const MODE = (process.env.PAYOUT_MODE || 'check').toLowerCase();
const NAME = process.env.ACCOUNT_NAME || 'Amazon';
const ACCOUNT_TYPE = process.env.PAYOUT_ACCOUNT_TYPE || 'Standard Orders';

async function tg(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) { console.log('Telegram not sent (no token).'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }) });
  } catch (e) { console.log('Telegram failed:', e.message); }
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const why = (e) => {
  const m = String((e && (e.message || e.code)) || e);
  if (/unauthori|access.*denied|forbidden|403/i.test(m)) return 'Amazon refused: no Finance permission for this key (update the refresh token after adding the Finance and Accounting role).';
  if (/24|already|limit|quota|429|too many/i.test(m)) return 'Amazon allows one payout per 24 hours — one was already requested today.';
  return m.slice(0, 300);
};

(async () => {
  const sp = new SellingPartnerAPI({
    region: 'eu', refresh_token: process.env.SPAPI_REFRESH_TOKEN,
    credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET },
    options: { auto_request_throttled: false },
  });

  // 1. Read-only: which bank account(s) Amazon will pay to
  let methods = [];
  try {
    const r = await sp.callAPI({ api_path: '/finances/transfers/2024-06-01/paymentMethods', method: 'GET', query: { marketplaceId: MARKETPLACE_ID } });
    methods = (r && (r.paymentMethods || (r.payload && r.payload.paymentMethods))) || [];
    console.log('Payment methods:', methods.length, methods.map((m) => m.paymentMethodType + ' ' + m.tail + ' ' + m.assignmentType).join(' | '));
  } catch (e) {
    console.log('getPaymentMethods failed:', e.message || e);
    await tg(`🏦 <b>${esc(NAME)} · Amazon payout ${MODE === 'pay' ? 'NOT requested' : 'check failed'}</b>\n${esc(why(e))}`);
    process.exitCode = MODE === 'pay' ? 1 : 0; return;
  }
  const list = methods.map((m) => `${m.paymentMethodType || m.type || 'Account'} ${m.tail ? '••' + m.tail : ''}${m.assignmentType ? ' (' + m.assignmentType + ')' : ''}`.trim());

  if (MODE !== 'pay') {
    await tg(`🏦 <b>${esc(NAME)} · Amazon payout check (no money moved)</b>\n${list.length ? 'Amazon will pay to:\n' + list.map((x) => '• ' + esc(x)).join('\n') : 'Amazon returned no bank account for Amazon.in.'}\nDaily payout runs at 8 AM.`);
    console.log('CHECK OK:', list.join(' | ') || 'no methods'); return;
  }

  // 2. Request the payout (Amazon pays the available balance to the saved deposit method)
  try {
    const r = await sp.callAPI({ api_path: '/finances/transfers/2024-06-01/payouts', method: 'POST', body: { marketplaceId: MARKETPLACE_ID, accountType: ACCOUNT_TYPE } });
    console.log('Payout response:', JSON.stringify(r).slice(0, 1500));
    const id = r && (r.payoutReferenceId || (r.payload && r.payload.payoutReferenceId));
    await tg(`🏦 <b>${esc(NAME)} · Amazon payout requested ✓</b>\nAvailable balance → ${esc(list[0] || 'your saved bank account')}${id ? '\nReference: ' + esc(id) : ''}\nAmazon usually credits it in 1–3 working days.`);
  } catch (e) {
    console.log('initiatePayout failed:', e.message || e);
    // backup runs (GitHub sometimes skips the 8 AM timer): stay quiet if today's payout already went
    if (process.env.PAYOUT_BACKUP === '1' && /24 hours/.test(why(e))) { console.log('Already requested today - backup run quiet.'); return; }
    await tg(`🏦 <b>${esc(NAME)} · Amazon payout NOT requested</b>\n${esc(why(e))}`);
    process.exitCode = 1;
  }
})();
