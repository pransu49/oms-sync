// oms-inventory-push.js
// Owner, 25 Oct 2026: "the robot pushes LOTS inventory to OMS, and OMS manages live inventory on Amazon".
//
// Every run:
//  1. Downloads from OMS Guru (DEFAULT 310803 warehouse): the channel-listing mapping (Amazon SKU + ASIN -> master SKU)
//     and the current inventory of every master SKU.
//  2. For each SIMPLE master SKU (combos follow their parts in OMS) whose Amazon listings are linked to LOTS on the
//     Amazon page (ASIN mapping, or saved name mapping), works out the stock it should have:
//       free = LOTS stock (in Amazon units) - OMS Blocked (orders not shipped yet)
//       LOTS stock below 10, or free below 10 -> In Stock = Blocked, so Amazon shows 0 (owner, 25 Oct 2026:
//                                               "blocked qty minus LOTS stock so the product goes out of stock")
//       otherwise                              -> In Stock = LOTS stock (OMS Guru shows Amazon In Stock - Blocked)
//     If one master SKU has several Amazon listings linked differently, the LOWEST is used (never oversell).
//  3. Uploads only the master SKUs whose OMS stock differs, with OMS Guru's own "Update InStock Qty" import (type 2,
//     RESET). OMS Guru then pushes the stock to Amazon as usual.
//  4. Saves a summary + rows for the "OMS inventory" tab on the Amazon page (spapiSnapshots/omsInventory).
//
// Never touches: products not linked to LOTS, combo products, other warehouses.
// Safety: stops if LOTS data looks incomplete, or if 60%+ of linked in-stock products would go to 0 (bad LOTS upload).
// DRY_RUN=true -> works everything out and saves the tab data marked "test run", uploads nothing.

const admin = require('firebase-admin');
const AdmZip = require('adm-zip');

const EMAIL = process.env.OMS_EMAIL, PASSWORD = process.env.OMS_PASSWORD;
const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const BASE = 'https://client.omsguru.com';
const WAREHOUSE_ID = '22452';           // DEFAULT 310803 (the dropship warehouse)
const OOS_BELOW = 10;                    // LOTS stock below this -> 0
const BROKEN_SHARE = 0.6;
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };

const spaApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'spa');
const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
const db = spaApp.firestore(), dbMain = mainApp.firestore();

// ---- OMS Guru session ----
let jar = {};
const upd = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const p = c.split(';')[0], i = p.indexOf('='); if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1); });
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, opt = {}) {
  const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', ...opt, headers: { ...H, Cookie: ck(), ...(opt.headers || {}) } });
  upd(r);
  return { status: r.status, loc: r.headers.get('location'), text: await r.text() };
}
async function login() {
  await req('/login');
  const r = await req('/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/login' },
    body: new URLSearchParams({ _method: 'POST', 'data[Client][email]': EMAIL, 'data[Client][password]': PASSWORD, 'data[Client][otp]': '', 'data[Client][remember_me]': '0' }).toString() });
  if (r.status !== 302) throw new Error(`OMS Guru login failed (status ${r.status})`);
  const w = await req(`/orders/setCurWarehouse/${WAREHOUSE_ID}`);
  if (w.status !== 302) throw new Error('Could not select the DEFAULT 310803 warehouse in OMS Guru');
}
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const grab = (html, re, what) => { const m = html.match(re); if (!m) throw new Error(`OMS Guru page changed - could not find ${what}`); return m[1]; };

// Submit one of OMS Guru's hidden "export" forms (they queue the export and post a link in notifications)
async function queueExport(page, actionRe, what) {
  const r = await req(page);
  const m = r.text.match(new RegExp(`<form action="(${actionRe.source})"[\\s\\S]*?<\\/form>`));
  if (!m) throw new Error(`OMS Guru page changed - could not find the ${what} export`);
  const fields = [...m[0].matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)].map((x) => [x[1], x[2]]);
  const f = await req(m[1], { method: 'POST', body: new URLSearchParams(fields).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + page, Origin: BASE } });
  if (f.status !== 302) throw new Error(`OMS Guru did not queue the ${what} export (status ${f.status})`);
}
// Wait for the export links (posted in notifications), download and unzip them
const usedLinks = new Set(), dbgSeen = new Set();
async function waitExports(since, wanted) {
  const out = {};
  while (Date.now() - since < 8 * 60e3 && Object.keys(out).length < wanted.length) {
    await new Promise((r) => setTimeout(r, 15e3));
    const n = await req('/notifications');
    const items = [...n.text.matchAll(/<li class="item"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]).slice(0, 15);
    for (const it of items) {
      const txt = strip(it), link = (it.match(/href="([^"]+)"/) || [])[1];
      let key = /channel_listing_mapping/i.test(txt) ? 'listings' : /inventory/i.test(txt) ? 'inventory' : null;
      if (key === 'listings' && wanted.includes('unmapped')) key = 'unmapped';
      if (wanted.includes('unmapped') && !dbgSeen.has(txt)) { dbgSeen.add(txt); console.log('NOTE:', txt.slice(0, 170), link ? link.slice(-30) : ''); }
      if (!key || out[key] || !link || !wanted.includes(key) || usedLinks.has(link)) continue;
      const when = (txt.match(/@ ([A-Za-z]+ \d+, \d{4} \d+:\d+:\d+ [AP]M)/) || [])[1];
      const t = when ? new Date(when + ' GMT+0530').getTime() : 0;
      if (!t || t < since - 90e3) continue;                     // an older export
      const f = await fetch(link.startsWith('http') ? link : BASE + link, { headers: { ...H, Cookie: ck() }, redirect: 'follow' });
      const buf = Buffer.from(await f.arrayBuffer());
      const body = buf[0] === 0x50 && buf[1] === 0x4b ? new AdmZip(buf).getEntries()[0].getData().toString('utf8') : buf.toString('utf8');
      if (key === 'inventory' && !/Blocked/.test(body.slice(0, 400))) continue;   // an older plain inventory export - need the full one
      out[key] = body; usedLinks.add(link);
      console.log(`Downloaded ${key}: ${out[key].length} characters.`);
    }
  }
  const miss = wanted.filter((k) => !out[k]);
  if (miss.length) throw new Error(`OMS Guru export not ready after 8 min: ${miss.join(', ')}`);
  return out;
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}
const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// ---- LOTS side (same data the Amazon robot uses) ----
function normalizeName(e) { return String(e).toLowerCase().replace(/[|/,_\-()]/g, ' ').replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim(); }
async function loadLots() {
  const A = dbMain.collection('aikm_admin');
  const [lotsSnap, mapSnap, m1, m2] = await Promise.all([A.doc('lotsCatalog').collection('chunks').get(), A.doc('masterMapping').collection('chunks').get(),
    A.doc('spapiAsinLotsMap').get(), A.doc('spapiAsinLotsMap2').get().catch(() => null)]);
  const lots = {}; lotsSnap.forEach((d) => (d.data().products || []).forEach((p) => { if (p && p.code != null) lots[String(p.code)] = p; }));
  const nameMap = {}; mapSnap.forEach((d) => Object.assign(nameMap, d.data().map || {}));
  const a1 = (m1.exists && m1.data().map) || {}, a2 = (m2 && m2.exists && m2.data().map) || {};
  const asinMap = { ...a1 };
  Object.entries(a2).forEach(([a, r]) => { if (!asinMap[a] || String((r && r.savedAt) || '') >= String((asinMap[a] && asinMap[a].savedAt) || '')) asinMap[a] = r; });
  return { lots, nameMap, asinMap };
}
// Amazon units this listing can sell from LOTS stock, or null when it is not linked to LOTS (vendor / unknown)
function lotsUnitsFor(asin, title, L, bl = 0) {
  let m = asin && (L.asinMap[asin] || L.asinMap[String(asin).toUpperCase()]), via = 'ASIN';
  if (!m || !(m.code || (m.parts || []).length)) { const n = title && L.nameMap[normalizeName(title)]; if (n && n.code && n.vendorName === 'LOTS') { m = { code: n.code }; via = 'name'; } else return null; }
  if (m.vendorName && String(m.vendorName).toUpperCase() !== 'LOTS') return null;
  const parts = Array.isArray(m.parts) && m.parts.length ? m.parts : [{ code: m.code, qty: 1 }];
  let units = Infinity, minLots = Infinity, freeLots = Infinity; const codes = [];
  for (const x of parts) {
    const p = L.lots[String(x.code)]; if (!p) return null;
    const q = parseFloat(p.qty); if (isNaN(q)) return null;
    const need = Math.max(1, Number(x.qty) || 1) / Math.max(1, parseInt(x.lotsPack) || 1);   // LOTS units per Amazon unit
    units = Math.min(units, Math.floor(Math.max(0, q) / need + 1e-9));
    minLots = Math.min(minLots, q);
    freeLots = Math.min(freeLots, q - bl * need);                                         // LOTS units left after the blocked orders
    codes.push(`${p.code}${parts.length > 1 || need !== 1 ? `×${Math.round(need * 100) / 100}` : ''}`);
  }
  return { target: units, units, lotsQty: minLots, freeLots: Math.floor(freeLots), codes: codes.join(' + '), lotsName: (L.lots[String(parts[0].code)] || {}).name || '', via };
}

// ---- generic OMS Guru import: upload a CSV for import type `id`, wait for its notification ----
async function omsImport(id, csv, fileName, noteRe) {
  const page = await req('/import_data');
  const pageTok = grab(page.text, /name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/, 'page token');
  const frag = await req('/import_data', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE },
    body: new URLSearchParams({ id: String(id), 'data[ImportDataFileType][oms_token]': pageTok, _method: 'POST' }).toString() });
  const importTok = grab(frag.text, /name="data\[ImportData\]\[oms_token\]" value="([^"]+)"/, 'import token');
  const box = await req('/file_upload/file_upload/index/import_data', { headers: { Referer: BASE + '/import_data' } });
  const upTok = grab(box.text, /name="oms_token" value="([^"]+)"/, 'upload token');
  const fd = new FormData(); fd.append('oms_token', upTok); fd.append('files[]', new Blob([csv], { type: 'text/csv' }), fileName);
  const up = await fetch(BASE + '/import_data/upload', { method: 'POST', body: fd, headers: { ...H, Cookie: ck(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', Referer: BASE + '/file_upload/file_upload/index/import_data' } });
  upd(up); const upText = await up.text();
  if (up.status !== 200 || /"error"\s*:\s*"[^"]/.test(upText)) throw new Error('OMS Guru did not accept the file upload: ' + upText.slice(0, 200));
  const startedAt = Date.now();
  await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/import_data', Origin: BASE },
    body: new URLSearchParams({ _method: 'POST', 'data[ImportData][oms_token]': importTok, 'data[ImportData][id]': String(id) }).toString() });
  while (Date.now() - startedAt < 5 * 60e3) {
    await new Promise((res) => setTimeout(res, 15e3));
    const n = await req('/notifications');
    const items = [...n.text.matchAll(/<li class="item"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]).slice(0, 10);
    const it = items.find((x) => noteRe.test(strip(x)) && !/processing/i.test(strip(x)));
    if (!it) continue;
    const when = (strip(it).match(/@ ([A-Za-z]+ \d+, \d{4} \d+:\d+:\d+ [AP]M)/) || [])[1];
    const t = when ? new Date(when + ' GMT+0530').getTime() : 0;
    if (t && t < startedAt - 90e3) continue;
    if (!/Failed/i.test(strip(it))) return { ok: true, errors: {}, note: strip(it).slice(0, 200) };
    const link = (it.match(/href="([^"]+)"/) || [])[1], errors = {};
    if (link) { const body = await (await fetch(link.startsWith('http') ? link : BASE + link, { headers: { ...H, Cookie: ck() }, redirect: 'follow' })).text();
      parseCsv(body).forEach((r) => { const k = r['Channel Listing SKU Code'] || r['Item SkuCode']; if (k) errors[k] = Object.values(r).pop() || 'error'; }); }
    return { ok: false, errors, note: strip(it).slice(0, 200) };
  }
  return { ok: null, errors: {}, note: 'Sent - OMS Guru has not reported the result yet.' };
}

// ---- AUTO-MAP (owner, 25 Oct 2026): a relisted / new Amazon SKU that OMS Guru shows as "unmapped" is mapped to the
// master SKU its ASIN already uses. Match order: 1) the old SKU it replaced (XX-R1 -> XX, already mapped)
// 2) the same ASIN's mapped listings (same company first). Ambiguous (2+ different masters) -> left for you.
async function loadAmazonSkuAsin() {
  const out = {};
  for (const acct of ['praso', 'sastastore']) {
    try {
      const m = await db.collection('spapiSnapshots').doc(`${acct}_meta`).get(); const md = m.exists ? m.data() : null;
      if (!md || !md.run) continue;
      const n = (md.chunks || {}).inventory || 0;
      const docs = n ? await db.getAll(...Array.from({ length: n }, (_, i) => db.collection('spapiSnapshots').doc(`${acct}_inventory_${md.run}_${i}`))) : [];
      docs.forEach((d) => d.exists && (d.data().items || []).forEach((it) => { if (it && it.sku && it.asin) out[it.sku] = String(it.asin).toUpperCase(); }));
    } catch (e) { console.warn(`Amazon SKU list for ${acct} not read:`, e.message || e); }
  }
  return out;
}
function planAutoMap(unmappedRows, mappedRows, skuAsin) {
  const bySku = {}, byAsin = {};
  const company = (ch) => String(ch || '').split(' - ')[0].trim().toUpperCase();
  for (const r of mappedRows) {
    const m = r['Product SkuCode'], sku = r['Channel Listing SKU Code']; if (!m || r['Is Mapped'] !== 'Yes' || !/amazon/i.test(r['Channel Name'] || '')) continue;
    if (sku) bySku[sku] = m;
    const a = String(r['Extra Data'] || '').toUpperCase() || skuAsin[sku];
    if (/^B0[0-9A-Z]{8}$|^[0-9]{9}[0-9X]$/.test(a || '')) (byAsin[a] = byAsin[a] || []).push({ m, co: company(r['Channel Name']) });
  }
  const plan = [], skipped = [];
  const seen = new Set();
  for (const r of unmappedRows) {
    if (!/amazon/i.test(r['Channel Name'] || '')) continue;
    const sku = r['Channel Listing SKU Code'] || '', lid = r['Channel Listing Id'] || '';
    if (!sku || seen.has(sku + '|' + r['Channel Name'])) continue; seen.add(sku + '|' + r['Channel Name']);
    let master = null, how = '';
    for (let base = sku; /-R\d+$|-RMV[A-Z0-9]+$/i.test(base) && !master;) { base = base.replace(/-R\d+$|-RMV[A-Z0-9]+$/i, ''); if (bySku[base]) { master = bySku[base]; how = `old SKU ${base}`; } }
    const asin = String(r['Extra Data'] || '').toUpperCase() || skuAsin[sku] || ((sku.match(/^N-(B0[0-9A-Z]{8})/) || [])[1] || '');
    if (!master && asin && byAsin[asin]) {
      const co = company(r['Channel Name']);
      const same = [...new Set(byAsin[asin].filter((x) => x.co === co).map((x) => x.m))], any = [...new Set(byAsin[asin].map((x) => x.m))];
      const pick = same.length === 1 ? same : any.length === 1 ? any : null;
      if (pick) { master = pick[0]; how = `ASIN ${asin}`; } else skipped.push([sku, r['Channel Name'], asin, `ASIN used by ${any.length} different OMS products: ${any.slice(0, 3).join(' / ')}`]);
    }
    if (master) plan.push({ sku, lid, master, how, channel: r['Channel Name'], asin });
    else if (!asin) skipped.push([sku, r['Channel Name'], '', 'ASIN not known yet']);
  }
  return { plan, skipped };
}

// ---- upload to OMS Guru: Import Data -> "Update InStock Qty and/or Last Purchase Price" (type 2), RESET ----
async function uploadInventory(rows) {
  const csv = ['DropshipWarehouseId,Item SkuCode,InventoryAction,QtyIncludesBlocked,Qty,RackSpace,Last Purchase Price,Notes',
    ...rows.map((r) => [WAREHOUSE_ID, r.sku, 'RESET', 'No', r.newQty, '', '', `Robot: LOTS ${r.lotsQty}`].map(csvCell).join(','))].join('\n');
  const page = await req('/import_data');
  const pageTok = grab(page.text, /name="data\[ImportDataFileType\]\[oms_token\]" value="([^"]+)"/, 'page token');
  const frag = await req('/import_data', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/import_data', Origin: BASE },
    body: new URLSearchParams({ id: '2', 'data[ImportDataFileType][oms_token]': pageTok, _method: 'POST' }).toString() });
  const importTok = grab(frag.text, /name="data\[ImportData\]\[oms_token\]" value="([^"]+)"/, 'import token');
  const box = await req('/file_upload/file_upload/index/import_data', { headers: { Referer: BASE + '/import_data' } });
  const upTok = grab(box.text, /name="oms_token" value="([^"]+)"/, 'upload token');
  const fd = new FormData();
  fd.append('oms_token', upTok);
  fd.append('files[]', new Blob([csv], { type: 'text/csv' }), `RobotLotsInventory_${Date.now()}.csv`);
  const up = await fetch(BASE + '/import_data/upload', { method: 'POST', body: fd, headers: { ...H, Cookie: ck(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', Referer: BASE + '/file_upload/file_upload/index/import_data' } });
  upd(up);
  const upText = await up.text();
  if (up.status !== 200 || /"error"\s*:\s*"[^"]/.test(upText)) throw new Error('OMS Guru did not accept the file upload: ' + upText.slice(0, 200));
  const startedAt = Date.now();
  const imp = await req('/import_data', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/import_data', Origin: BASE },
    body: new URLSearchParams({ _method: 'POST', 'data[ImportData][oms_token]': importTok, 'data[ImportData][id]': '2' }).toString() });
  console.log('Import submitted:', imp.status, imp.loc || '');
  // wait for OMS Guru's result notification (+ its error file if some rows failed)
  while (Date.now() - startedAt < 5 * 60e3) {
    await new Promise((res) => setTimeout(res, 15e3));
    const n = await req('/notifications');
    const items = [...n.text.matchAll(/<li class="item"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]).slice(0, 10);
    const it = items.find((x) => /InStock|Instock|Inventory/i.test(strip(x)) && /Import/i.test(strip(x)) && !/processing/i.test(strip(x)));
    if (!it) continue;
    const when = (strip(it).match(/@ ([A-Za-z]+ \d+, \d{4} \d+:\d+:\d+ [AP]M)/) || [])[1];
    const t = when ? new Date(when + ' GMT+0530').getTime() : 0;
    if (t && t < startedAt - 90e3) continue;
    if (!/Failed/i.test(strip(it))) return { ok: true, errors: {}, note: strip(it).slice(0, 200) };
    const link = (it.match(/href="([^"]+)"/) || [])[1], errors = {};
    if (link) {
      const body = await (await fetch(link.startsWith('http') ? link : BASE + link, { headers: { ...H, Cookie: ck() }, redirect: 'follow' })).text();
      parseCsv(body).forEach((r) => { const k = r['Item SkuCode']; if (k) errors[k] = Object.values(r).pop() || 'error'; });
    }
    return { ok: false, errors, note: strip(it).slice(0, 200) };
  }
  return { ok: null, errors: {}, note: 'Sent - OMS Guru has not reported the result yet (check its notifications).' };
}

async function main() {
  const runAt = Date.now();
  const L = await loadLots();
  const lotsCount = Object.keys(L.lots).length;
  console.log(`LOTS-GN: ${lotsCount} products · ${Object.keys(L.asinMap).length} ASIN mappings · ${Object.keys(L.nameMap).length} name mappings.`);
  if (lotsCount < 500) throw new Error(`LOTS catalogue has only ${lotsCount} products - looks incomplete. Nothing changed.`);

  await login();
  const since = Date.now();
  await queueExport('/channel_listings', /\/skus\/download_skus\/\d+/, 'channel listing mapping');
  await queueExport('/skus/inventory', /\/skus\/exportFullInventory\/\d+/, 'full inventory');
  const files = await waitExports(since, ['listings', 'inventory']);
  const listings = parseCsv(files.listings), inventory = parseCsv(files.inventory);
  console.log(`OMS Guru: ${listings.length} channel listings, ${inventory.length} products with stock in DEFAULT 310803.`);
  if (inventory.length < 500 || listings.length < 1000) throw new Error('OMS Guru export looks incomplete. Nothing changed.');

  // AUTO-MAP new / relisted Amazon SKUs that OMS Guru shows as unmapped
  let autoMap = { mapped: [], skipped: [], note: '' };
  try {
    const t0 = Date.now();
    await queueExport('/map_skus', /\/skus\/download_skus\/\d+\/1/, 'unmapped listings');
    const um = parseCsv((await waitExports(t0, ['unmapped'])).unmapped);
    const skuAsin = await loadAmazonSkuAsin();
    const { plan, skipped } = planAutoMap(um, listings, skuAsin);
    console.log(`Auto-map: ${um.length} unmapped listings in OMS Guru (${um.filter((r) => /amazon/i.test(r['Channel Name'] || '')).length} Amazon) -> ${plan.length} can be mapped, ${skipped.length} left for you.`);
    plan.slice(0, 15).forEach((x) => console.log(`  MAP ${x.sku} (${x.channel}) -> ${x.master} [${x.how}]`));
    skipped.slice(0, 5).forEach((x) => console.log(`  SKIP ${x[0]}: ${x[3]}`));
    autoMap.skipped = skipped.slice(0, 300);
    if (plan.length && !DRY) {
      const csv = ['Channel Listing SKU Code,Channel Listing Id,Product SkuCode', ...plan.map((x) => [x.sku, x.lid, x.master].map(csvCell).join(','))].join('\n');
      const res = await omsImport(8, csv, `RobotAutoMap_${Date.now()}.csv`, /Channel Listing|Mapping|Map/i);
      autoMap.note = res.note;
      autoMap.mapped = plan.filter((x) => !res.errors[x.sku]).map((x) => [x.sku, x.channel, x.master, x.how, runAt]);
      Object.entries(res.errors).forEach(([k, v]) => autoMap.skipped.unshift([k, '', '', 'OMS Guru: ' + String(v).slice(0, 100)]));
      console.log(`Auto-map result: ${res.note} (${Object.keys(res.errors).length} failed)`);
    } else if (plan.length) { autoMap.mapped = plan.map((x) => [x.sku, x.channel, x.master, x.how, runAt]); autoMap.note = 'Test run - not sent'; }
  } catch (e) { autoMap.note = 'Auto-map skipped: ' + (e.message || e); console.warn(autoMap.note); }

  const omsQty = {}, blocked = {};
  inventory.forEach((r) => { const k = r['Item SkuCode']; if (!k || (r['Warehouse Id'] && r['Warehouse Id'] !== WAREHOUSE_ID)) return; omsQty[k] = parseInt(r['In Stock'], 10) || 0; blocked[k] = Math.max(0, parseInt(r.Blocked, 10) || 0); });
  // group Amazon listings by master SKU
  const bySku = {}, combo = new Set();
  for (const r of listings) {
    const sku = r['Product SkuCode']; if (!sku || r['Is Mapped'] !== 'Yes' || !/amazon/i.test(r['Channel Name'] || '')) continue;
    if (r['Is Combo Product'] === 'Yes') { combo.add(sku); continue; }
    (bySku[sku] = bySku[sku] || { sku, name: r['Product Name'], list: [] }).list.push({ asin: (r['Extra Data'] || '').toUpperCase(), title: r['Channel Listing Title'], channel: r['Channel Name'], lsku: r['Channel Listing SKU Code'] });
  }
  const rows = [], unlinked = []; let notLinked = 0, conflicts = 0;
  for (const g of Object.values(bySku)) {
    if (!(g.sku in omsQty)) continue;                               // not a stock product in this warehouse
    const seen = new Map();
    for (const l of g.list) { const k = l.asin || l.title; if (seen.has(k)) continue; const u = lotsUnitsFor(l.asin, l.title, L, blocked[g.sku] || 0); if (u) seen.set(k, { ...u, asin: l.asin }); }
    if (!seen.size) {
      notLinked++;
      const asins = [...new Set(g.list.map((l) => l.asin).filter(Boolean))];
      const why = asins.some((a) => L.asinMap[a] && L.asinMap[a].vendorName && String(L.asinMap[a].vendorName).toUpperCase() !== 'LOTS') ? 'Mapped to another vendor (not LOTS)'
        : asins.some((a) => L.asinMap[a]) ? 'Mapped LOTS product has no stock data' : 'ASIN not mapped to LOTS';
      unlinked.push([g.sku, String(g.name || '').slice(0, 90), asins.slice(0, 4).join(' '), omsQty[g.sku], g.list.length, why]);
      continue;
    }
    const bl = blocked[g.sku] || 0, cur0 = omsQty[g.sku];
    const opts = [...seen.values()].map((o) => {
      const free = o.freeLots, oos = o.lotsQty < OOS_BELOW || free < OOS_BELOW;
      // OOS: Amazon must show 0 = In Stock - Blocked. Already 0 or less -> leave In Stock as it is; else set In Stock = Blocked.
      return { ...o, free, oos, target: oos ? (cur0 <= bl ? cur0 : bl) : o.units };
    });
    // never oversell: any link that says out of stock wins; otherwise the link giving the FEWEST Amazon units
    const best = opts.find((o) => o.oos) || opts.reduce((a, b) => (b.units < a.units ? b : a));
    const differ = new Set(opts.map((o) => (o.oos ? 0 : o.free))).size > 1;
    if (differ) conflicts++;
    const cur = omsQty[g.sku], newQty = best.target;
    const why = best.oos ? (best.lotsQty < OOS_BELOW ? `LOTS ${best.lotsQty} is below ${OOS_BELOW}` : `LOTS ${best.lotsQty} - blocked ${bl}${best.units !== best.lotsQty && bl ? ' (in LOTS units)' : ''} = ${best.free}, below ${OOS_BELOW}`) + ' - Amazon 0' : '';
    rows.push({ sku: g.sku, name: g.name, asin: best.asin, lots: best.codes, lotsName: best.lotsName, lotsQty: best.lotsQty, via: best.via, omsQty: cur, newQty, blocked: bl, oos: best.oos,
      change: newQty === cur ? 'same' : best.oos ? 'zero' : newQty > cur ? 'up' : 'down',
      note: [why, differ ? `Listings linked differently (${opts.map((o) => (o.oos ? 0 : o.free)).join(' / ')} free) - lowest used` : ''].filter(Boolean).join(' · ') });
  }
  const push = rows.filter((r) => r.change !== 'same');
  const linkedInStock = rows.filter((r) => r.omsQty - r.blocked > 0).length, goingZero = push.filter((r) => r.change === 'zero').length;
  const stats = { linked: rows.length, push: push.length, zero: goingZero, up: push.filter((r) => r.change === 'up').length, down: push.filter((r) => r.change === 'down').length,
    same: rows.length - push.length, notLinked, combos: combo.size, conflicts, products: inventory.length };
  console.log(`Linked to LOTS: ${stats.linked} · to update: ${stats.push} (${stats.up} up, ${stats.down} down, ${stats.zero} to 0) · unchanged ${stats.same} · not linked ${notLinked} · combos skipped ${combo.size} · differently linked ${conflicts}.`);
  push.slice(0, 25).forEach((r) => console.log(`  ${r.sku}: OMS ${r.omsQty} -> ${r.newQty} (LOTS ${r.lots} = ${r.lotsQty}, blocked ${r.blocked})${r.note ? " · " + r.note : ""}`));
  console.log(`Blocked-rule examples: ${rows.filter((r) => r.oos && r.lotsQty >= OOS_BELOW).length} products out of stock only because of blocked orders.`);
  rows.filter((r) => r.oos && r.lotsQty >= OOS_BELOW).slice(0, 8).forEach((r) => console.log(`  BLOCKED ${r.sku}: In Stock ${r.omsQty} -> ${r.newQty} · ${r.note}`));

  let result = { ok: null, errors: {}, note: '' }, status = 'done';
  if (goingZero >= 20 && goingZero > linkedInStock * BROKEN_SHARE) {
    status = 'stopped'; result.note = `Stopped: ${goingZero} of ${linkedInStock} in-stock products would go to 0 - LOTS stock looks broken. Nothing changed.`;
    console.warn(result.note);
  } else if (DRY) { status = 'test'; result.note = 'Test run - nothing was sent to OMS Guru.'; console.log(result.note); }
  else if (!push.length) result.note = 'OMS Guru already matches LOTS - nothing to send.';
  else {
    result = await uploadInventory(push);
    const failed = Object.keys(result.errors).length;
    if (result.ok === false) status = failed && failed < push.length ? 'partial' : 'failed';
    if (result.ok === null) status = 'sent';
    console.log(`OMS Guru result: ${result.note} ${failed ? `(${failed} rows failed)` : ''}`);
  }
  // save for the "OMS inventory" tab. Test runs go to their own record and never overwrite the tab (25 Oct 2026 fix).
  const err = result.errors || {}, C = db.collection('spapiSnapshots'), base = DRY ? 'omsInventoryTest' : 'omsInventory';
  // last real change per product, carried from earlier runs
  const prev = {};
  try {
    const pd = await C.doc('omsInventory').get();
    if (pd.exists && pd.data().chunks) {
      const ps = await Promise.all(Array.from({ length: pd.data().chunks }, (_, i) => C.doc(`omsInventory_rows_${i}`).get()));
      JSON.parse(ps.map((x) => (x.exists ? x.data().data : '')).join('') || '[]').forEach((r) => { if (r[13]) prev[r[0]] = [r[11], r[12], r[13]]; });
    }
  } catch (e) { console.warn('Earlier changes not read:', e.message || e); }
  const sentOk = !DRY && (status === 'done' || status === 'partial' || status === 'sent');
  const pack = rows.sort((a, b) => a.sku.localeCompare(b.sku)).slice(0, 4000).map((r) => {
    const last = sentOk && r.change !== 'same' && !err[r.sku] ? [r.omsQty, r.newQty, runAt] : (prev[r.sku] || [null, null, null]);
    return [r.sku, String(r.name || '').slice(0, 90), r.asin || '', r.lots, String(r.lotsName || '').slice(0, 70), r.lotsQty, r.omsQty, r.newQty, r.change, r.via,
      err[r.sku] ? 'OMS Guru: ' + String(err[r.sku]).slice(0, 120) : r.note, ...last, r.blocked, r.oos ? 1 : 0];
  });
  const doc = { at: runAt, finishedAt: Date.now(), status, dry: DRY, note: result.note || '', stats: { ...stats, failed: Object.keys(err).length }, rule: `LOTS stock (or LOTS minus blocked) below ${OOS_BELOW} -> Amazon 0, otherwise LOTS stock`, warehouse: 'DEFAULT 310803' };
  const json = JSON.stringify({ rows: pack, unlinked: unlinked.slice(0, 4000) });
  const parts = []; for (let i = 0; i < json.length; i += 900000) parts.push(json.slice(i, i + 900000));
  await Promise.all(parts.map((p, i) => C.doc(`${base}_rows_${i}`).set({ data: p, at: runAt })));
  await C.doc(base).set({ ...doc, chunks: parts.length, v: 2, autoMap: { at: runAt, ...autoMap, mapped: autoMap.mapped.slice(0, 300) } });
  if (!DRY) {
    const hist = C.doc('omsInventory_history');
    const h = await hist.get(); const runs = ((h.exists && h.data().runs) || []).filter((x) => x.status !== 'test').slice(-47);
    runs.push({ at: runAt, status, ...stats, failed: Object.keys(err).length });
    await hist.set({ runs });
  }
  console.log(`Saved ${DRY ? 'test results (tab not changed)' : 'for the OMS inventory tab'}: ${rows.length} linked + ${unlinked.length} not linked, ${parts.length} part(s). Status: ${status}.`);
  if (status === 'failed') process.exitCode = 1;
}
main().catch((e) => {
  console.error('OMS inventory push failed:', e.message || e);
  db.collection('spapiSnapshots').doc('omsInventory').set({ status: 'error', note: String(e.message || e).slice(0, 300), errorAt: Date.now() }, { merge: true })
    .catch(() => {}).finally(() => { process.exitCode = 1; });
});
