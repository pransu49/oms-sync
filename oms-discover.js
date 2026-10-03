// TEMP: prints the layout of OMS Guru's Import Data page (forms, upload URLs) — no data, no passwords.
const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD, BASE = 'https://client.omsguru.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function get(u) { const r = await fetch(BASE + u, { headers: { ...H, Cookie: ck() }, redirect: 'manual' }); upd(r); return { s: r.status, loc: r.headers.get('location'), t: await r.text() }; }
(async () => {
  let r = await fetch(BASE + '/login', { headers: H, redirect: 'manual' }); upd(r);
  r = await fetch(BASE + '/login', { method: 'POST', redirect: 'manual', headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck(), Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  upd(r); console.log('login', r.status);
  const dash = await get('/dashboard');
  const links = [...new Set((dash.t.match(/href="[^"]*import[^"]*"/gi) || []))]; console.log('import links:', links.join(' '));
  const page = await get('/import_data');
  const r2 = await fetch(BASE + '/import_data', { method: 'POST', headers: { ...H, Cookie: ck(), 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data' }, body: 'id=49' });
  upd(r2); const frag = await r2.text();
  const clean = (x) => x.replace(/value="[A-Za-z0-9+/=]{30,}"/g, 'value="<token>"').replace(/\s+/g, ' ');
  console.log('\n===== FRAGMENT', r2.status, frag.length); console.log(clean(frag).slice(0, 6000));
  const srcs = [...new Set((frag.match(/(src|href|action)=["'][^"']+["']/gi) || []))]; console.log('frag links:', srcs.join(' | '));
  for (const m of srcs) {
    let u = m.replace(/^[a-z]+=["']/i, '').slice(0, -1).replace(BASE, '');
    if (!u.startsWith('/') || /\.(css|js|png|jpg)$/.test(u) || /template|download/i.test(u)) continue;
    const p = await get(u);
    console.log(`\n===== ${u} -> ${p.s} len=${p.t.length}`);
    if (p.s === 200) {
      (p.t.match(/<form[\s\S]*?<\/form>/gi) || []).forEach((f, i) => console.log('--- form', i, clean(f).slice(0, 4000)));
      (p.t.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []).filter((x) => !/src=/.test(x.slice(0, 80))).forEach((x, i) => console.log('--- script', i, clean(x).slice(0, 3500)));
      console.log('--- script srcs', (p.t.match(/<script[^>]*src="[^"]+"/gi) || []).join(' '));
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
