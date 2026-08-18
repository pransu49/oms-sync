// OMS Guru -> Firebase Firestore sync
// Pulls "Export Data" (last N days of orders) from client.omsguru.com and
// writes them into the same Firestore project the Dalbhaat Admin Console reads from.
// Runs via plain HTTP (no browser) so it's fast and cheap enough for a 15-min cron.

const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const admin = require('firebase-admin');

const EMAIL = process.env.OMS_EMAIL;
const PASSWORD = process.env.OMS_PASSWORD;
const DAYS_BACK = parseInt(process.env.OMS_DAYS_BACK || '15', 10);
const BASE = 'https://client.omsguru.com';

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
  let res = await fetch(BASE + '/login', { redirect: 'manual' });
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
  let res = await fetch(BASE + '/reports/export_data', { headers: { 'Cookie': cookieHeader() } });
  updateCookies(res);
  let html = await res.text();
  const csrf = html.match(/name="data\[Invoice\]\[oms_token\]" value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('Could not find CSRF token on export page — OMS Guru may have changed its form.');

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
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader(),
      'Referer': BASE + '/reports/export_data',
    },
    body: body.toString(),
  });
  updateCookies(res);
  html = await res.text();

  if (!html.includes('queued successfully')) {
    throw new Error('Export was not queued — OMS Guru may have changed the export form.');
  }

  const m = html.match(
    /href="(https:\/\/client\.omsguru\.com\/orders\/download\/\d+)"[^>]*>\s*<i[^>]*><\/i>\s*<span class="content"><strong>Click to download the exported orders/
  );
  if (!m) throw new Error('Could not find the export download link in the response.');
  return m[1];
}

async function pollAndDownload(url, tries = 15, delayMs = 4000) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'Cookie': cookieHeader() }, redirect: 'follow' });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('zip') || ct.includes('octet-stream')) {
      return Buffer.from(await res.arrayBuffer());
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Export file never became ready for download (timed out).');
}

function parseOrders(buf) {
  const zip = new AdmZip(buf);
  const csvEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.csv'));
  if (!csvEntry) throw new Error('No CSV file found inside the export zip.');
  const csvText = zip.readAsText(csvEntry);
  return parse(csvText, { columns: true, skip_empty_lines: true });
}

// Keep only the fields the admin console actually needs — Firestore documents
// have a 1MB cap, and trimming keeps writes fast.
// OMS Guru's raw CSV export prepends a stray backtick (`) to some columns
// (Channel Order Id, Shipment Tracker) as an Excel-text-formatting artifact —
// strip it here, same as the manual master-sheet upload path already does,
// or these IDs will never match what a person actually scans or types.
function cleanId(v) {
  return (v || '').toString().replace(/^`+/, '').trim();
}
function slimOrder(row) {
  return {
    orderDate: row['Order Date'] || '',
    invoiceNumber: cleanId(row['Invoice Number']),
    channelOrderId: cleanId(row['Channel Order Id']),
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

async function pushToFirestore(orders) {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var (paste the service account JSON as a secret).');

  const svcAccount = JSON.parse(svcJson);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(svcAccount) });
  }
  const db = admin.firestore();

  // Chunk writes since Firestore documents cap at ~1MB and each order is small but there
  // can be thousands. Store as a numbered set of chunk docs under aikm_admin/omsOrders/chunks.
  const CHUNK_SIZE = 400;
  const chunksRef = db.collection('aikm_admin').doc('omsOrders').collection('chunks');

  // wipe old chunks first so removed/old orders (older than the rolling window) don't linger
  const existing = await chunksRef.listDocuments();
  const batchDelete = db.batch();
  existing.forEach((docRef) => batchDelete.delete(docRef));
  if (existing.length) await batchDelete.commit();

  let chunkIndex = 0;
  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    await chunksRef.doc(`chunk_${chunkIndex}`).set({ orders: chunk });
    chunkIndex++;
  }

  await db.collection('aikm_admin').doc('omsOrders').set({
    lastSynced: admin.firestore.FieldValue.serverTimestamp(),
    orderCount: orders.length,
    chunkCount: chunkIndex,
    daysBack: DAYS_BACK,
  });

  console.log(`Pushed ${orders.length} orders in ${chunkIndex} chunk(s).`);
}

async function main() {
  console.log(`Logging into OMS Guru as ${EMAIL}...`);
  await login();
  console.log(`Requesting export for last ${DAYS_BACK} days...`);
  const link = await requestExport(DAYS_BACK);
  console.log('Export queued, polling for download...');
  const buf = await pollAndDownload(link);
  console.log('Downloaded, parsing CSV...');
  const rawRows = parseOrders(buf);
  console.log(`Parsed ${rawRows.length} rows.`);
  const orders = rawRows.map(slimOrder);
  await pushToFirestore(orders);
  console.log('Done.');
}

main().catch((e) => {
  console.error('SYNC FAILED:', e.message);
  process.exit(1);
});
