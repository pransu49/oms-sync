const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD, BASE = 'https://client.omsguru.com';
const AdmZip = require('adm-zip');
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) { const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } }); upd(r); return { status: r.status, loc: r.headers.get('location'), text: await r.text() }; }
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  await req('/login');
  await req('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' }, body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  await req('/orders/setCurWarehouse/22452');
  const page = await req('/import_data');
  const tok = (page.text.match(/name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/) || [])[1];
  const f = await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE }, body: new URLSearchParams({ id: '8', 'data[ImportDataFileType][oms_token]': tok, _method: 'POST' }).toString() });
  console.log('TYPE8:', strip(f.text).slice(0, 3000));
  const t = await fetch(BASE + '/import_data/download_template/8', { headers: { ...H, Cookie: ck() } }); console.log('TEMPLATE8:', (await t.text()).slice(0, 600));
  const m = await req('/map_skus');
  const forms = [...m.text.matchAll(/<form action="([^"]+)"[\s\S]*?<\/form>/g)].map((x) => x[1]);
  const links = [...new Set([...m.text.matchAll(/href="([^"#]+)"/g)].map((x) => x[1]).filter((h) => /unmapped|download|export|map_skus/i.test(h)))];
  console.log('MAPSKUS FORMS:', forms.join(' , ')); console.log('MAPSKUS LINKS:', links.slice(0, 30).join(' , '));
  const k = m.text.indexOf('Download Unmapped'); console.log('RAW:', m.text.slice(Math.max(0, k - 700), k + 100).replace(/\s+/g, ' '));
})().catch((e) => { console.error(e); process.exit(1); });
