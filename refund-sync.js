// OMS Guru -> Firestore: REFUND ORDERS (once a day)
// Separate from sync.js (which keeps the last 15 days of ALL orders every 10 min).
// This job pulls the last 60 days, keeps ONLY Amazon orders that are returned/cancelled,
// and only the few fields the console's Bulk Refund tab needs to build Amazon's
// Order Adjustment file. Everything goes into ONE Firestore record:
//   aikm_admin/omsRefundOrders   (project aikm-oms-sync)
// It is rewritten only when its contents changed -> at most 1 write per day.
// It never touches omsOrders / omsReadyToConfirm / easyShip.

const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const admin = require('firebase-admin');
const crypto = require('crypto');

const EMAIL = process.env.OMS_EMAIL;
const PASSWORD = process.env.OMS_PASSWORD;
const DAYS_BACK = parseInt(process.env.REFUND_DAYS_BACK || '60', 10);
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

// Strips a trailing time component like " 3:12:28 PM" from OMS Guru's
// "August 18, 2026 3:12:28 PM" style dates, keeping just the date part.
function dateOnly(str) {
  if (!str) return '';
  return String(str).replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*[AP]M\s*$/i, '').trim();
}


const isAmazon = (ch) => /amazon/i.test(ch || '') && !/fba/i.test(ch || '');
const isRefundStatus = (s) => /return|cancel/i.test(s || '');
const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

// Compact record: a=account, o=order id, i=order item id, q=qty, p=item price per unit (incl. tax),
// s=shipping per unit (incl. tax), t=tax %, st=status, d=order date, rd=return date, ty=payment type, n=product
function slim(row) {
  const ch = row['Channel Name'] || '';
  return {
    a: ch.replace(/\s*-\s*amazon\s*$/i, '').trim(),
    o: cleanId(row['Channel Order Id']),
    i: cleanId(row['Channel Sub Order Id']),
    q: num(row['Qty']) || 1,
    p: num(row['Selling Price Per Item']),
    s: num(row['Shipping Charge Per Item']),
    t: num(row['Tax Rate']),
    st: row['Order Status'] || '',
    d: dateOnly(row['Order Date'] || ''),
    rd: dateOnly(row['Return Date'] || ''),
    ty: row['Order Type'] || '',
    n: String(row['Product Name'] || '').slice(0, 60),
  };
}

async function save(list) {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var.');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svcJson)) });
  const ref = admin.firestore().collection('aikm_admin').doc('omsRefundOrders');

  // Firestore record limit is 1 MB - stay well under it.
  let orders = list;
  if (JSON.stringify(orders).length > 850000) orders = orders.map((o) => ({ ...o, n: '' }));
  while (JSON.stringify(orders).length > 850000) orders = orders.slice(0, Math.floor(orders.length * 0.9)); // newest kept (list is newest-first)

  const hash = crypto.createHash('md5').update(JSON.stringify(orders)).digest('hex');
  const cur = await ref.get();
  if (cur.exists && cur.data().hash === hash) { console.log('No change since last run - nothing written.'); return; }
  await ref.set({ orders, hash, count: orders.length, days: DAYS_BACK, at: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Saved ${orders.length} refund line(s) (${Math.round(JSON.stringify(orders).length / 1024)} KB).`);
}

async function main() {
  console.log(`Logging into OMS Guru as ${EMAIL}...`);
  await login();
  await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1500)));
  console.log(`Requesting export for last ${DAYS_BACK} days...`);
  const link = await requestExport(DAYS_BACK);
  console.log('Export queued, polling for download (60-day file can take a few minutes)...');
  const buf = await pollAndDownload(link, 80, 6000);
  const rows = parseOrders(buf);
  console.log(`Parsed ${rows.length} rows.`);
  const list = rows
    .filter((r) => isAmazon(r['Channel Name']) && isRefundStatus(r['Order Status']))
    .map(slim)
    .filter((o) => o.o && o.i);
  list.sort((x, y) => (Date.parse(y.d) || 0) - (Date.parse(x.d) || 0)); // newest first
  const byStatus = {};
  list.forEach((o) => { byStatus[o.st] = (byStatus[o.st] || 0) + 1; });
  console.log(`Amazon returned/cancelled lines: ${list.length}`, JSON.stringify(byStatus));
  await save(list);
  console.log('Done.');
}

main().catch((e) => {
  console.error('REFUND SYNC FAILED:', e.message);
  process.exit(1);
});
