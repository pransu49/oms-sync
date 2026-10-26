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
  const d = await req('/orders'); const hrefs = [...new Set([...d.text.matchAll(/href="(\/[^"#?]+)"/g)].map(m => m[1]))]; console.log('MENU', hrefs.join(' '));
  for (const p of hrefs.filter(h => /channel|sync|integr|inventory|marketplace|store/i.test(h)).slice(0, 12)) { const x = await req(p); const t = strip(x.text); const k = t.search(/praso/i); console.log('\nPAGE', p, x.status, k >= 0 ? t.slice(Math.max(0,k-700), k+1500) : t.slice(0, 500)); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
