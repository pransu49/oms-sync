const BASE = 'https://client.omsguru.com', EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD;
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' };
let jar = {}; const upd = r => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(c => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) { const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } }); upd(r); return { status: r.status, loc: r.headers.get('location'), text: await r.text() }; }
const strip = h => String(h).replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  await req('/login');
  const r = await req('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  console.log('login', r.status); await req('/orders/setCurWarehouse/22452');
  const home = await req('/channels'); console.log('channels status', home.status, home.loc);
  const links = [...new Set([...home.text.matchAll(/href="(\/[a-z_]*channel[a-z_\/]*[^"]*)"/gi)].map(m => m[1]))].slice(0, 40); console.log('links', links.join(' '));
  const txt = strip(home.text); const i = txt.search(/praso/i); console.log('CHANNELS PAGE:', txt.slice(Math.max(0, i - 1500), i + 2500));
  for (const p of ['/channel_inventory_logs', '/inventory_sync_logs', '/channels/inventory_logs', '/channel_listings/inventory_sync_logs', '/sync_logs']) { const x = await req(p); console.log('\nPAGE', p, x.status, strip(x.text).slice(0, 600)); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
