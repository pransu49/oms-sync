// READ-ONLY probe: lists OMS Guru Import Data types and the inventory import's template/format. Uploads nothing.
const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD, BASE = 'https://client.omsguru.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) { const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } }); upd(r); return { status: r.status, loc: r.headers.get('location'), text: await r.text() }; }
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  await req('/login');
  const l = await req('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  console.log('login', l.status);
  const page = await req('/import_data');
  const opts = [...page.text.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map((m) => `${m[1]}=${m[2].trim()}`);
  console.log('IMPORT TYPES:', opts.join(' | '));
  const links = [...page.text.matchAll(/data-id="(\d+)"[^>]*>([\s\S]{0,200}?)</g)].map((m) => `${m[1]}=${strip(m[2])}`);
  console.log('DATA-ID ITEMS:', links.slice(0, 80).join(' | '));
  const tok = (page.text.match(/name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/) || [])[1];
  const ids = new Set();
  [...opts, ...links].forEach((x) => { const [id, n] = x.split('='); if (/inventor|stock|quantit/i.test(n || '')) ids.add(id); });
  console.log('INVENTORY IDS:', [...ids].join(','));
  for (const id of ids) {
    const f = await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE },
      body: new URLSearchParams({ id, 'data[ImportDataFileType][oms_token]': tok, _method: 'POST' }).toString() });
    console.log(`--- TYPE ${id} fragment:`, strip(f.text).slice(0, 2500));
    const hrefs = [...f.text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /sample|template|download|\.csv|\.xls/i.test(h));
    console.log(`TYPE ${id} links:`, hrefs.join(' , '));
    for (const h of hrefs.slice(0, 3)) {
      try { const r = await fetch(h.startsWith('http') ? h : BASE + h, { headers: { ...H, Cookie: ck() }, redirect: 'follow' });
        const ct = r.headers.get('content-type') || ''; const buf = Buffer.from(await r.arrayBuffer());
        console.log(`TEMPLATE ${h} [${ct}] ${buf.length}b:`, /text|csv/.test(ct) ? buf.toString('utf8').slice(0, 1500) : buf.toString('latin1').replace(/[^\x20-\x7e]+/g, ' ').slice(0, 1500));
      } catch (e) { console.log('template fetch failed', h, e.message); }
    }
  }
  const home = await req('/reports/export_data');
  const menu = [...new Set([...home.text.matchAll(/href="(https:\/\/client\.omsguru\.com)?(\/[a-z_\/]+)"/g)].map((m) => m[2]))].filter((h) => /product|inventor|stock|warehouse|listing|sku/i.test(h));
  console.log('MENU LINKS:', menu.join(' , '));
  const w = { status: 0, text: '' }; console.log('WAREHOUSES:', w.status, strip(w.text).replace(/^.*?Logout/, '').slice(0, 2500));
  for (const m of ['/skus/inventory','/channel_listings','/skus/list_products','/map_skus']) { const r = await req(m); console.log(`PAGE ${m}: ${r.status} ::`, strip(r.text).replace(/^[\s\S]*?What's New Settings/, '').slice(0, 2500)); }
})().catch((e) => { console.error('probe failed', e); process.exit(1); });
