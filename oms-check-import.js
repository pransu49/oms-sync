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
  const n = await get('/notifications');
  const items = n.t.match(/<(li|tr|div|a)[^>]*>[\s\S]{0,600}?Bulk Update Order Details[\s\S]{0,400}?<\/(li|tr|div|a)>/gi) || [];
  items.slice(0, 4).forEach((x, i) => console.log('ITEM', i, x.replace(/\s+/g, ' ').slice(0, 1200)));
  const hrefs = [...new Set((n.t.match(/href="[^"]+"/g) || []))]; console.log('HREFS', hrefs.join(' '));
  for (const h of hrefs) {
    const u = h.slice(6, -1);
    if (!/notif|download|error|import|file|tmp|report/i.test(u) || /\.(js|css|png)/.test(u)) continue;
    const p = await get(u);
    console.log(`\n== ${u} -> ${p.s} ${p.t.length}`, txt(p.t).slice(0, 1500));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
