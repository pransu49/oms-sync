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
  for (const u of ['/imports', '/imports/add', '/import_data', '/imports/index', ...links.map((l) => l.slice(6, -1).replace(BASE, ''))]) {
    if (!u.startsWith('/')) continue;
    const p = await get(u);
    console.log(`\n===== ${u} -> ${p.s} ${p.loc || ''} len=${p.t.length}`);
    if (p.s !== 200) continue;
    const forms = p.t.match(/<form[\s\S]*?<\/form>/gi) || [];
    forms.forEach((f, i) => console.log(`--- form ${i}:`, f.replace(/value="[A-Za-z0-9+/=]{30,}"/g, 'value="<token>"').replace(/\s+/g, ' ').slice(0, 4000)));
    const opts = p.t.match(/<option[^>]*>[^<]*Bulk Update Order[^<]*<\/option>/gi); if (opts) console.log('option:', opts.join(' '));
    const urls = [...new Set(p.t.match(/(url|action)\s*[:=]\s*['"][^'"]*['"]/gi) || [])]; console.log('urls:', urls.slice(0, 40).join(' | '));
    const scripts = (p.t.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []).filter((s) => /upload|fileupload|import/i.test(s)).map((s) => s.replace(/\s+/g, ' ').slice(0, 3000));
    scripts.forEach((s, i) => console.log(`--- script ${i}:`, s));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
