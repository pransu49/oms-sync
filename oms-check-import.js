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
  const m = n.t.match(/href="(https:\/\/client\.omsguru\.com\/orders\/download\/\d+\/t)"[^>]*>[\s\S]{0,200}?Failed to process Bulk Update Order Details/);
  if (!m) { console.log('no failure link'); return; }
  const r1 = await fetch(m[1], { headers: { ...H, Cookie: ck() }, redirect: 'follow' });
  const buf = Buffer.from(await r1.arrayBuffer());
  console.log('REPORT', r1.status, r1.headers.get('content-type'), buf.length);
  if (buf[0] === 0x50 && buf[1] === 0x4b) { const Z = require('adm-zip'); new Z(buf).getEntries().forEach((e) => console.log('FILE', e.entryName, '\n' + e.getData().toString('utf8').slice(0, 3000))); }
  else console.log('BODY\n' + buf.toString('utf8').slice(0, 3000));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
