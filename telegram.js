// telegram.js - sends a message to Prabhat's Telegram (bot: AIKM_OPS_ALERTS_bot).
// Needs GitHub secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. If they are missing it does nothing.
// Never throws - an alert problem must never break a sync.
//
// Category groups: every message has a category (opts.cat). telegram-routes.json maps a category to a
// Telegram group ("-100123..." or "-100123.../55" for a topic inside a group). A category with no group
// yet goes to TELEGRAM_CHAT_ID as before. Categories: orders, meesho, attendance, inventory, pricing,
// refunds, system.
let ROUTES = {};
try { ROUTES = require('./telegram-routes.json'); } catch (e) { ROUTES = {}; }
function chatFor(cat) {
  const r = String((cat && ROUTES[cat]) || '').trim();
  const m = r.match(/^(-?\d+)(?:\/(\d+))?$/);
  if (m) return { chat_id: m[1], ...(m[2] ? { message_thread_id: +m[2] } : {}) };
  return process.env.TELEGRAM_CHAT_ID ? { chat_id: process.env.TELEGRAM_CHAT_ID } : null;
}

// PDF (or any file) to the category's group
async function sendDocument(fileName, bytes, caption, cat, mime = 'application/pdf') {
  const token = process.env.TELEGRAM_BOT_TOKEN, to = chatFor(cat);
  if (!token || !to) { console.log('Telegram not set up — file not sent'); return false; }
  try {
    const fd = new FormData();
    fd.append('chat_id', to.chat_id);
    if (to.message_thread_id) fd.append('message_thread_id', String(to.message_thread_id));
    if (caption) fd.append('caption', String(caption).slice(0, 1000));
    fd.append('document', new Blob([bytes], { type: mime }), fileName);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log(`Telegram file not sent (${cat || 'main'}):`, j.description || r.status);
    else console.log(`Telegram file sent (${cat || 'main'}).`);
    return !!j.ok;
  } catch (e) { console.log('Telegram file not sent:', e.message); return false; }
}

async function notify(text, opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN, to = chatFor(opts.cat), chat = to && to.chat_id;
  if (!text) return false;
  if (!token || !chat) {
    console.log(`Telegram alert not sent: GitHub secret missing (${!token ? 'TELEGRAM_BOT_TOKEN ' : ''}${!chat ? 'TELEGRAM_CHAT_ID' : ''}).`);
    return false;
  }
  const send = async (body, html) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...to, text: body, disable_web_page_preview: true, ...(html ? { parse_mode: 'HTML' } : {}) }),
    });
    return res.json().catch(() => ({ ok: false, description: String(res.status) }));
  };
  try {
    let j = await send(String(text).slice(0, 4000), !!opts.html);
    // formatting problem -> send the same text without formatting rather than nothing
    if (!j.ok && opts.html) j = await send(plain(text).slice(0, 4000), false);
    if (!j.ok) console.log(`Telegram alert not sent (${opts.cat || 'main'}):`, j.description || 'unknown error');
    else console.log(`Telegram alert sent (${opts.cat || 'main'}).`);
    return !!j.ok;
  } catch (e) { console.log('Telegram alert not sent:', e.message); return false; }
}

// Safe text for HTML messages
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const LINE = '────────────';

// Today in India as YYYY-MM-DD and the hour (0-23)
function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

module.exports = { notify, sendDocument, chatFor, istNow, esc, LINE };

// Run directly to send a message: node telegram.js "text"
if (require.main === module) notify(process.argv.slice(2).join(' ')).then((ok) => process.exit(ok ? 0 : 1));
