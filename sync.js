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

async function requestExport(daysBack) {
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
  const start = new Date();
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

function slimOrder(row) {
  return {
    orderDate: row['Order Date'] || '',
    slaDate: findField(row, ['SLA Date', 'Sla Date', 'SLA', 'Delivery SLA', 'SLA Delivery Date']),
    invoiceNumber: cleanId(row['Invoice Number']),
    channelOrderId: cleanId(row['Channel Order Id']),
    channelSubOrderId: cleanId(row['Channel Sub Order Id']),
    buyerName: row['Buyer Name'] || '',
    buyerCity: row['Buyer City'] || '',
    buyerState: row['Buyer State'] || '',
    buyerPincode: row['Buyer Pin Code'] || '',
    buyerPhone: row['Buyer Phone'] || '',
    sku: row['Product Sku Code'] || '',
    productName: row['Product Name'] || '',
    channel: row['Channel Name'] || '',
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
  };
}

function hashChunk(chunk) {
  return crypto.createHash('md5').update(JSON.stringify(chunk)).digest('hex');
}

async function pushToFirestore(orders) {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var (paste the service account JSON as a secret).');

  const svcAccount = JSON.parse(svcJson);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(svcAccount) });
  }
  const db = admin.firestore();

  const CHUNK_SIZE = 400;
  const chunksRef = db.collection('aikm_admin').doc('omsOrders').collection('chunks');

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

  await db.collection('aikm_admin').doc('omsOrders').set({
    lastSynced: admin.firestore.FieldValue.serverTimestamp(),
    orderCount: orders.length,
    chunkCount: chunkIndex,
    daysBack: DAYS_BACK,
  });

  console.log(`Pushed: ${written} chunk(s) updated, ${unchanged} unchanged (skipped), ${deletes} stale chunk(s) removed.`);
}

async function main() {
  console.log(`Logging into OMS Guru as ${EMAIL}...`);
  await login();
  await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 1500))); // brief pause, less bot-like than an instant next request
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
  await pushToFirestore(orders);
  console.log('Done.');
}

main().catch((e) => {
  console.error('SYNC FAILED:', e.message);
  process.exit(1);
});
