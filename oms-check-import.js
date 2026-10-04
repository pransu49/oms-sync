// TEMP: read OMS Guru notifications to see the result of the tracking import
const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD, BASE = 'https://client.omsguru.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function get(u, x = {}) { const r = await fetch(u.startsWith('http') ? u : BASE + u, { headers: { ...H, Cookie: ck(), ...x }, redirect: 'manual' }); upd(r); return { s: r.status, t: await r.text() }; }
const txt = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
(async () => {
  let r = await fetch(BASE + '/login', { headers: H, redirect: 'manual' }); upd(r);
  r = await fetch(BASE + '/login', { method: 'POST', redirect: 'manual', headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck(), Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() }); upd(r);
  const d = await get('/dashboard');
  const links = [...new Set((d.t.match(/(href|url)\s*[:=]\s*["'][^"']*(notif|alert|message|import)[^"']*["']/gi) || []))];
  console.log('links:', links.join(' | '));
  for (const u of ['/notifications', '/client_notifications', '/notifications/index', '/import_data/history', '/import_data/logs', ...links.map((l) => l.replace(/^[^"']*["']/, '').slice(0, -1))]) {
    if (!u || u === '#' || /\.(js|css)$/.test(u)) continue;
    const p = await get(u, { 'X-Requested-With': 'XMLHttpRequest' });
    const t = txt(p.t);
    const i = t.search(/Bulk Update Order Details|bulkupdateorderdetails|import/i);
    console.log(`\n== ${u} -> ${p.s} len ${p.t.length}`, i >= 0 ? t.slice(Math.max(0, i - 300), i + 1500) : t.slice(0, 300));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
