// READ-ONLY probe: what OMS Guru offers for receiving RTO / returns (import types, menu links, templates).
const BASE = 'https://client.omsguru.com';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' };
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) { const r = await fetch(BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } }); upd(r); return { status: r.status, loc: r.headers.get('location'), text: await r.text() }; }
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  await req('/login');
  const l = await req('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': process.env.OMS_EMAIL, 'data[Client][password]': process.env.OMS_PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  console.log('login', l.status);
  const page = await req('/import_data');
  const opts = [...page.text.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)</g)].map((m) => m[1] + ' = ' + m[2].trim());
  console.log('IMPORT TYPES:\n  ' + opts.join('\n  '));
  const links = new Set();
  const home = await req('/orders');
  for (const t of [page.text, home.text]) for (const m of t.matchAll(/href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/g)) { const s = (m[1] + ' ' + strip(m[2])); if (/return|rto|receiv|grn/i.test(s)) links.add(s.slice(0, 160)); }
  console.log('RETURN LINKS:\n  ' + [...links].join('\n  '));
  const tok = (page.text.match(/name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/) || [])[1];
  for (const o of opts.filter((x) => /return|rto|receiv/i.test(x))) {
    const id = o.split(' = ')[0];
    const f = await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE },
      body: new URLSearchParams({ id, 'data[ImportDataFileType][oms_token]': tok, _method: 'POST' }).toString() });
    console.log(`\n== TYPE ${o}\n` + strip(f.text).slice(0, 1500));
    const sample = (f.text.match(/href="([^"]*(sample|template|download)[^"]*)"/i) || [])[1];
    if (sample) { const s = await fetch(sample.startsWith('http') ? sample : BASE + sample, { headers: { ...H, Cookie: ck() } }); const b = Buffer.from(await s.arrayBuffer()); console.log('SAMPLE', sample, s.status, b.slice(0, 600).toString().replace(/[^\x20-\x7e\n,]/g, '.')); }
  }
  for (const p of ['/returns', '/return_orders', '/rto', '/orders/returns', '/returns/rto_receive', '/returns/receive']) { const r = await req(p); console.log('PAGE', p, r.status, r.loc || '', strip(r.text).slice(0, 200)); }
})().catch((e) => { console.error('PROBE FAILED', e.message); process.exit(1); });
