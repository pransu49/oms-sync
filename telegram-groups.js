// telegram-groups.js - lists the Telegram groups (and topics) the bot was added to in the last 24 h,
// with their chat ids, and suggests which alert category each one is for (by the group's name).
// Run from GitHub: Actions -> "Telegram groups (find ids)" -> Run workflow. Reads only - sends nothing,
// except with TEST=true: then it posts one short "connected" message into every group in telegram-routes.json.
const { notify } = require('./telegram');
const CATS = [
  ['meesho', /meesho|snapdeal/i], ['attendance', /attend/i], ['inventory', /invent|stock|lots/i],
  ['pricing', /pric|loss/i], ['refunds', /refund|complain|return/i], ['system', /system|robot|health|summary/i],
  ['orders', /order/i],
];
(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  if (process.env.TEST === 'true') {
    let routes = {}; try { routes = require('./telegram-routes.json'); } catch (e) { /* none */ }
    for (const cat of Object.keys(routes)) await notify(`✅ <b>Connected</b>\nThis group now receives <b>${cat}</b> alerts.`, { html: true, cat });
    console.log('Test messages sent to:', Object.keys(routes).join(', ') || '(no groups in telegram-routes.json)');
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=${encodeURIComponent('["message","my_chat_member","channel_post"]')}`);
  const j = await r.json();
  if (!j.ok) throw new Error('Telegram said: ' + (j.description || r.status));
  const chats = {};
  for (const u of j.result || []) {
    const m = u.message || u.channel_post || u.my_chat_member;
    const c = m && m.chat; if (!c || c.type === 'private') continue;
    const x = chats[c.id] || (chats[c.id] = { id: c.id, title: c.title || '', type: c.type, topics: {} });
    if (u.message && u.message.message_thread_id && u.message.is_topic_message) {
      const t = (u.message.forum_topic_created && u.message.forum_topic_created.name) || (u.message.reply_to_message && u.message.reply_to_message.forum_topic_created && u.message.reply_to_message.forum_topic_created.name) || '';
      x.topics[u.message.message_thread_id] = t || x.topics[u.message.message_thread_id] || '';
    }
  }
  const list = Object.values(chats);
  if (!list.length) { console.log('No groups found. Add the bot to each group, send /start@AIKM_OPS_ALERTS_bot in it, then run this again (within 24 h).'); return; }
  const guess = (name) => (CATS.find(([, rx]) => rx.test(name)) || [''])[0];
  const routes = {};
  console.log('GROUPS FOUND:');
  for (const c of list) {
    console.log(`  ${c.title}  |  id ${c.id}  |  ${c.type}  |  category: ${guess(c.title) || '?'}`);
    if (guess(c.title) && !routes[guess(c.title)]) routes[guess(c.title)] = String(c.id);
    for (const [tid, name] of Object.entries(c.topics)) {
      console.log(`      topic "${name}"  |  ${c.id}/${tid}  |  category: ${guess(name) || '?'}`);
      if (guess(name) && !routes[guess(name)]) routes[guess(name)] = `${c.id}/${tid}`;
    }
  }
  console.log('\nSUGGESTED telegram-routes.json:\n' + JSON.stringify(routes, null, 2));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
