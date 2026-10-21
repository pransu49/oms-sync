// telegram.js - sends a message to Prabhat's Telegram (bot: AIKM_OPS_ALERTS_bot).
// Needs GitHub secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. If they are missing it does nothing.
// Never throws - an alert problem must never break a sync.
async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || !text) return false;
  const body = String(text).slice(0, 4000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: body, disable_web_page_preview: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) console.log('Telegram alert not sent:', j.description || res.status);
    else console.log('Telegram alert sent.');
    return !!j.ok;
  } catch (e) { console.log('Telegram alert not sent:', e.message); return false; }
}

// Today in India as YYYY-MM-DD and the hour (0-23)
function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

module.exports = { notify, istNow };

// Run directly to send a message: node telegram.js "text"
if (require.main === module) notify(process.argv.slice(2).join(' ')).then((ok) => process.exit(ok ? 0 : 1));
