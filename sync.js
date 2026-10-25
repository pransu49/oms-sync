// OMS Guru -> Firebase Firestore sync
// Pulls "Export Data" (last N days of orders) from client.omsguru.com and
// writes them into the same Firestore project the Dalbhaat Admin Console reads from.
// Runs via plain HTTP (no browser) so it's fast and cheap enough for a 15-min cron.
//
// FREE-TIER FIX: only rewrites a chunk if its contents actually changed
// (compared by hash), instead of deleting and rewriting everything every run.

const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const admin = require('firebase-admin');
const crypto = require('crypto');

const EMAIL = process.env.OMS_EMAIL;
const PASSWORD = process.env.OMS_PASSWORD;
const DAYS_BACK = parseInt(process.env.OMS_DAYS_BACK || '15', 10);
// Archive mode (oms-archive.yml): saves a longer window of SHIPPED orders to aikm_admin/<OMS_ARCHIVE_DOC>
// for Auto sale bills. It never touches the live omsOrders data or any other job.
const ARCHIVE_DOC = (process.env.OMS_ARCHIVE_DOC || '').trim();
const BASE = 'https://client.omsguru.com';

// Reduces the chance of being flagged as a bot and served a different/degraded
// page (which looks exactly like "the form keeps changing" but really means the
// site quietly detected automated traffic). Applied to every request below.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

if (!EMAIL || !PASSWORD) {
  console.error('Missing OMS_EMAIL / OMS_PASSWORD env vars.');
  process.exit(1);
}

// ---------- tiny cookie jar ----------
let cookieJar = {};
function updateCookies(res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    cookieJar[pair.slice(0, idx).trim()] = pair.slice(idx + 1);
  }
}
function cookieHeader() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function login() {
  let res = await fetch(BASE + '/login', { redirect: 'manual', headers: { ...BROWSER_HEADERS } });
  updateCookies(res);

  const body = new URLSearchParams({
    '_method': 'POST',
    'data[Client][email]': EMAIL,
    'data[Client][password]': PASSWORD,
    'data[Client][otp]': '',
    'data[Client][remember_me]': '0',
  });

  res = await fetch(BASE + '/login', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader(),
      'Referer': BASE + '/login',
    },
    body: body.toString(),
    redirect: 'manual',
  });
  updateCookies(res);

  if (res.status !== 302) {
    throw new Error(`Login did not redirect as expected (status ${res.status}). Credentials may be wrong, or OMS Guru added an OTP/captcha step.`);
  }
}

async function requestExport(daysBack, endDaysAgo = 0) {
  let res = await fetch(BASE + '/reports/export_data', { headers: { ...BROWSER_HEADERS, 'Cookie': cookieHeader() } });
  updateCookies(res);
  let html = await res.text();
  let csrf = html.match(/name="data\[Invoice\]\[oms_token\]" value="([^"]+)"/)?.[1];
  // Fallback: OMS Guru's export form markup may have changed — look for ANY hidden
  // input whose name mentions "token", regardless of the exact field name used.
  if (!csrf) {
    csrf = html.match(/name="([^"]*[Tt]oken[^"]*)"\s+value="([^"]+)"/)?.[2];
  }
  if (!csrf) {
    // Still nothing — print the part of the page around "token" so we can see
    // exactly what changed and fix the pattern precisely next time.
    const idx = html.toLowerCase().indexOf('token');
    const snippet = idx !== -1 ? html.slice(Math.max(0, idx - 200), idx + 400) : html.slice(0, 600);
    console.log('DEBUG — could not find CSRF token. Nearby HTML:\n' + snippet);
    throw new Error('Could not find CSRF token on export page — OMS Guru may have changed its form.');
  }

  const end = new Date();
  end.setDate(end.getDate() - endDaysAgo);
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);

  const body = new URLSearchParams({
    '_method': 'POST',
    'data[Invoice][oms_token]': csrf,
    'data[Invoice][order_date_start]': fmtDate(start),
    'data[Invoice][order_date_end]': fmtDate(end),
    'data[Invoice][invoice_date_start]': '',
    'data[Invoice][invoice_date_end]': '',
    'data[Invoice][return_date_start]': '',
    'data[Invoice][return_date_end]': '',
    'data[Invoice][company_id]': '0',
    'data[Invoice][channel_company_id]': '0',
    'data[Invoice][warehouse_id]': '0',
    'data[Invoice][product_category_id]': '0',
  });

  res = await fetch(BASE + '/reports/export_data', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader(),
      'Referer': BASE + '/reports/export_data',
    },
    body: body.toString(),
  });
  updateCookies(res);
  html = await res.text();

  if (!html.includes('queued successfully')) {
    // Fallback: OMS Guru may have reworded the confirmation message — try a couple
    // of other likely phrasings before giving up.
    const altPhrases = ['queued', 'export request', 'has been generated', 'will be emailed', 'processing your request'];
    const foundAlt = altPhrases.some(p => html.toLowerCase().includes(p));
    if (!foundAlt) {
      const idx = html.toLowerCase().indexOf('export');
      const snippet = idx !== -1 ? html.slice(Math.max(0, idx - 200), idx + 500) : html.slice(0, 700);
      console.log('DEBUG — export confirmation not recognized. Nearby HTML:\n' + snippet);
      throw new Error('Export was not queued — OMS Guru may have changed the export form.');
    }
    console.log('NOTE: exact phrase "queued successfully" not found, but a similar confirmation phrase was — continuing.');
  }

  // Try the exact match first (in case it still works).
  let m = html.match(
    /href="(https:\/\/client\.omsguru\.com\/orders\/download\/\d+)"[^>]*>\s*<i[^>]*><\/i>\s*<span class="content"><strong>Click to download the exported orders/
  );
  // Fallback: OMS Guru's page markup may have changed slightly — just look for ANY
  // link to the download endpoint, regardless of the surrounding icon/span structure.
  if (!m) {
    m = html.match(/href="(https:\/\/client\.omsguru\.com\/orders\/download\/\d+)"/);
  }
  if (!m) {
    // Still nothing — print the part of the page around "download" so we can see
    // exactly what changed and fix the pattern precisely next time.
    const idx = html.toLowerCase().indexOf('download');
    const snippet = idx !== -1 ? html.slice(Math.max(0, idx - 200), idx + 400) : html.slice(0, 600);
    console.log('DEBUG — could not find download link. Nearby HTML:\n' + snippet);
    throw new Error('Could not find the export download link in the response.');
  }
  return m[1];
}

async function pollAndDownload(url, tries = 30, delayMs = 6000) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, 'Cookie': cookieHeader() }, redirect: 'follow' });
    const ct = res.headers.get('content-type') || '';
    const cd = res.headers.get('content-disposition') || '';
    // Larger order volumes mean a bigger export file, which can take OMS Guru longer
    // to generate — wait up to 3 minutes (was 1 minute) before giving up. Also accept
    // a Content-Disposition: attachment header as a second sign the file is ready,
    // in case OMS Guru serves it with a content-type this check doesn't recognize.
    if (ct.includes('zip') || ct.includes('octet-stream') || cd.includes('attachment')) {
      return Buffer.from(await res.arrayBuffer());
    }
    if (i > 0 && i % 5 === 0) {
      console.log(`Still waiting for export file... (${i * delayMs / 1000}s elapsed, content-type so far: "${ct}")`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Export file never became ready for download (timed out after ' + (tries * delayMs / 1000) + 's).');
}

function parseOrders(buf) {
  const zip = new AdmZip(buf);
  const csvEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.csv'));
  if (!csvEntry) throw new Error('No CSV file found inside the export zip.');
  const csvText = zip.readAsText(csvEntry);
  return parse(csvText, { columns: true, skip_empty_lines: true });
}

function cleanId(v) {
  return (v || '').toString().replace(/^`+/, '').trim();
}
// Matches a column name loosely (ignoring case/extra spaces) in case OMS Guru's
// exact header text has slight variations from what's hardcoded below.
function findField(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const norm = candidate.trim().toLowerCase();
    const match = keys.find(k => k.trim().toLowerCase() === norm);
    if (match && row[match]) return row[match];
  }
  return '';
}

// Strips a trailing time component like " 3:12:28 PM" from OMS Guru's
// "August 18, 2026 3:12:28 PM" style dates, keeping just the date part.
function dateOnly(str) {
  if (!str) return '';
  return String(str).replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*[AP]M\s*$/i, '').trim();
}

function slimOrder(row) {
  return {
    orderDate: dateOnly(row['Order Date'] || ''),
    slaDate: dateOnly(findField(row, ['SLA Date', 'Sla Date', 'SLA', 'Delivery SLA', 'SLA Delivery Date'])),
    invoiceNumber: cleanId(row['Invoice Number']),
    channelOrderId: cleanId(row['Channel Order Id']),
    channelSubOrderId: cleanId(row['Channel Sub Order Id']),
    buyerName: row['Buyer Name'] || '',
    buyerCity: row['Buyer City'] || '',
    buyerState: row['Buyer State'] || '',
    buyerPincode: row['Buyer Pin Code'] || '',
    buyerPhone: row['Buyer Phone'] || '',
    sku: row['Product Sku Code'] || '',
    asin: findField(row, ['ASIN', 'Asin', 'Extra Field', 'Product Asin']),
    productName: row['Product Name'] || '',
    channel: row['Channel Name'] || '',
    channelId: String(row['Channel Id'] || '').trim(),
    category: row['Category Name'] || '',
    price: row['Selling Price Per Item'] || '',
    qty: row['Qty'] || '',
    total: row['Total'] || '',
    profit: row['Expected Profit'] || row['Exp. Profit'] || row['Net Profit'] || 0,
    cogs: row['Cost of Goods'] || row['Cost of Goods Unit'] || 0,
    mobile: row['Buyer Phone'] || '',
    orderType: row['Order Type'] || '',
    status: row['Order Status'] || '',
    awb: cleanId(row['Shipment Tracker']),
    courier: row['Shipping Company'] || '',
    deliveryDate: row['Delivery Date'] || '',
    shipmentDate: row['Shipment Date'] || '',
    paymentReceived: row['Payment Received'] || '',
    returnReason: row['Return Reason'] || '',
    returnDate: row['Return Date'] || '',
    warehouse: row['Warehouse Name'] || '',
    // Address + invoice details — used by the console's NimbusPost bulk-upload file
    buyerAddress1: row['Buyer Address1'] || '',
    buyerAddress2: row['Buyer Address2'] || '',
    buyerEmail: row['Buyer Email'] || '',
    codCollectible: row['COD Collectible'] || '',
    shippingCharge: row['Shipping Charge Per Item'] || '',
    hsn: row['Hsn Code'] || '',
    taxRate: row['Tax Rate'] || '',
  };
}

function hashChunk(chunk) {
  return crypto.createHash('md5').update(JSON.stringify(chunk)).digest('hex');
}

async function pushToFirestore(orders, docName = 'omsOrders') {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var (paste the service account JSON as a secret).');

  const svcAccount = JSON.parse(svcJson);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(svcAccount) });
  }
  const db = admin.firestore();

  const CHUNK_SIZE = docName === 'omsOrders' ? 400 : 1500;
  const chunksRef = db.collection('aikm_admin').doc(docName).collection('chunks');

  // Read existing chunk hashes so unchanged chunks aren't rewritten every run.
  const existingSnap = await chunksRef.get();
  const existingHashes = {};
  existingSnap.forEach((doc) => { existingHashes[doc.id] = doc.data().hash; });
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  const usedIds = new Set();

  let chunkIndex = 0;
  let written = 0, unchanged = 0;

  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    const id = `chunk_${chunkIndex}`;
    usedIds.add(id);
    const hash = hashChunk(chunk);
    if (existingHashes[id] !== hash) {
      await chunksRef.doc(id).set({ orders: chunk, hash });
      written++;
    } else {
      unchanged++;
    }
    chunkIndex++;
  }

  // Remove leftover chunk docs from a previous run that are no longer needed
  // (e.g. order count shrank so there are fewer chunks now).
  const batchDelete = db.batch();
  let deletes = 0;
  existingIds.forEach((id) => {
    if (!usedIds.has(id)) {
      batchDelete.delete(chunksRef.doc(id));
      deletes++;
    }
  });
  if (deletes) await batchDelete.commit();

  await db.collection('aikm_admin').doc(docName).set({
    lastSynced: admin.firestore.FieldValue.serverTimestamp(),
    orderCount: orders.length,
    chunkCount: chunkIndex,
    daysBack: DAYS_BACK,
  });

  console.log(`Pushed: ${written} chunk(s) updated, ${unchanged} unchanged (skipped), ${deletes} stale chunk(s) removed.`);
}

// Small list for the Amazon-confirmation job: Amazon orders that already have an AWB in OMS
// but are still New / Ready to ship / Packed. The job reads this 1 record instead of all order chunks.
async function saveReadyToConfirm(orders) {
  const by = {};
  orders.forEach((o) => { if (/amazon/i.test(o.channel || '') && o.channelOrderId) (by[o.channelOrderId] = by[o.channelOrderId] || []).push(o); });
  const list = [];
  Object.values(by).forEach((lines) => {
    if (!lines.some((o) => String(o.awb || '').trim())) return;
    if (!lines.some((o) => /^(new|ready to ship|packed|pending|confirmed)$/i.test(String(o.status || '').trim()))) return;
    lines.forEach((o) => list.push({ channel: o.channel, channelOrderId: o.channelOrderId, channelSubOrderId: o.channelSubOrderId, status: o.status,
      buyerPhone: o.buyerPhone, awb: o.awb, courier: o.courier, qty: o.qty }));
  });
  await admin.firestore().collection('aikm_admin').doc('omsReadyToConfirm').set({ orders: list.slice(0, 3000), count: list.length, at: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Ready to confirm on Amazon (have AWB, not shipped): ${list.length} line(s).`);
}


// Prints SLA_ALERT / SLA_ITEM lines for orders due today (or overdue) that are not shipped yet.
// report-health.js turns them into a Telegram alert (max twice a day).
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toIso(str) {
  const t = String(str || '').trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})/)) && MON[m[2].toLowerCase()]) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = t.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].toLowerCase()]) return `${m[3]}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
function slaCheck(orders) {
  try {
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const due = {};
    orders.forEach((o) => {
      if (!/^(new|ready to ship|packed|pending|confirmed)$/i.test(String(o.status || '').trim())) return;
      const d = toIso(o.slaDate); if (!d || d > today) return;
      const id = o.channelOrderId || o.invoiceNumber; if (!id || due[id]) return;
      due[id] = { id, d, lbl: !!String(o.awb || '').trim(), ch: String(o.channel || '').slice(0, 40), p: String(o.productName || '').slice(0, 35) };
    });
    const list = Object.values(due).sort((a, b) => a.d.localeCompare(b.d));
    if (!list.length) { console.log('SLA check: nothing due today that is unshipped.'); return; }
    const over = list.filter((x) => x.d < today).length;
    console.log(`SLA_ALERT: ${list.length} order(s) due to ship today are not shipped yet${over ? ` (${over} already overdue)` : ''}`);
    list.forEach((x) => console.log(`SLA_ITEM: ${x.d < today ? '⏰ OVERDUE ' : ''}${x.id} · ${x.ch} · ${x.p}${x.lbl ? ' · label ready' : ' · NO label'}`));
  } catch (e) { console.log('SLA check skipped:', e.message); }
}

async function main() {
  console.log(`Logging into OMS Guru as ${EMAIL}...`);
  await login();
  await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 1500))); // brief pause, less bot-like than an instant next request
  if (ARCHIVE_DOC) return archiveMain();
  console.log(`Requesting export for last ${DAYS_BACK} days...`);
  const link = await requestExport(DAYS_BACK);
  console.log('Export queued, polling for download...');
  const buf = await pollAndDownload(link);
  console.log('Downloaded, parsing CSV...');
  const rawRows = parseOrders(buf);
  console.log(`Parsed ${rawRows.length} rows.`);
  if (rawRows.length) {
    console.log('DEBUG — actual column headers in this export:', Object.keys(rawRows[0]).join(' | '));
  }
  const orders = rawRows.map(slimOrder);
  // Safety: OMS Guru sometimes hands back an older export file. Never overwrite live orders with it.
  const newest = orders.map((o) => toIso(o.orderDate)).filter(Boolean).sort().pop() || '';
  const oldestOk = new Date(Date.now() + 5.5 * 3600e3 - 3 * 864e5).toISOString().slice(0, 10);
  if (orders.length && newest && newest < oldestOk) throw new Error(`Export looks old (newest order ${newest}) — live orders NOT overwritten. Will retry next run.`);
  if (ARCHIVE_DOC) {
    const shipped = orders.filter((o) => String(o.shipmentDate || '').trim());
    await pushToFirestore(shipped, ARCHIVE_DOC);
    console.log(`Archive saved: ${shipped.length} shipped order line(s) of ${orders.length}. Done.`);
    return;
  }
  await pushToFirestore(orders);
  await saveReadyToConfirm(orders);
  slaCheck(orders);
  console.log('Done.');
}

// OMS Guru exports at most ~15 days at a time, so the archive asks for 14-day windows and joins them.
async function archiveMain() {
  const all = [], seen = new Set();
  for (let ago = 0; ago < DAYS_BACK; ago += 14) {
    console.log(`Archive window: ${ago + 14} to ${ago} days ago...`);
    const link = await requestExport(14, ago);
    const rows = parseOrders(await pollAndDownload(link)).map(slimOrder);
    const to = new Date(Date.now() + 5.5 * 3600e3 - ago * 864e5).toISOString().slice(0, 10);
    const from = new Date(Date.now() + 5.5 * 3600e3 - (ago + 15) * 864e5).toISOString().slice(0, 10);
    const inWin = rows.filter((o) => { const d = toIso(o.orderDate); return d && d >= from && d <= to; });
    if (rows.length && !inWin.length) console.log(`  This export did not match ${from}..${to} (OMS gave another file) — skipped.`);
    let added = 0;
    inWin.forEach((o) => { const k = [o.channelSubOrderId || o.channelOrderId, o.sku, o.channel].join('|'); if (seen.has(k)) return; seen.add(k); all.push(o); added++; });
    console.log(`  ${rows.length} rows, ${added} new.`);
    await new Promise(r => setTimeout(r, 20000));   // let OMS Guru finish one export before asking the next
  }
  // keep only what billing needs, so the archive stays small and quick to read
  const shipped = all.filter((o) => String(o.shipmentDate || '').trim()).map((o) => ({
    orderDate: o.orderDate, shipmentDate: o.shipmentDate, channel: o.channel, channelOrderId: o.channelOrderId, channelSubOrderId: o.channelSubOrderId,
    asin: o.asin || '', sku: o.sku, productName: o.productName, qty: o.qty, status: o.status }));
  await pushToFirestore(shipped, ARCHIVE_DOC);
  console.log(`Archive saved: ${shipped.length} shipped order line(s) of ${all.length}. Done.`);
}

main().catch((e) => {
  console.error('SYNC FAILED:', e.message);
  process.exit(1);
});
