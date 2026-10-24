const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');

const spaApp = admin.initializeApp(
  { credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) },
  'spaApp'
);
const db = spaApp.firestore();
db.settings({ ignoreUndefinedProperties: true });

const mainApp = admin.initializeApp(
  { credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) },
  'mainApp'
);
const dbMain = mainApp.firestore();

const MARKETPLACE_ID = 'A21TJRUUN4KGV';

const spClient = new SellingPartnerAPI({
  region: 'eu',
  refresh_token: process.env.SPAPI_REFRESH_TOKEN,
  credentials: {
    SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID,
    SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET,
  },
});

const ACCOUNT_LABEL = process.env.ACCOUNT_LABEL || 'account1';
// QUICK vs FULL sync
//   quick (every 15 min): write-backs, orders changed since last sync, stock/price/MRP report.
//   full  (hourly Praso / 2-hourly Sasta Store): everything, incl. competitor prices & buy box.
let SYNC_MODE = String(process.env.SYNC_MODE || 'full').toLowerCase() === 'fast' ? 'fast' : 'full';
// A queued full sync is often cancelled by the next quick sync (GitHub keeps only one waiting run), so the
// robot silently skipped hours (21 Oct 2026). Any quick sync now upgrades itself to FULL when the last
// full sync is older than this - the robot can no longer be skipped.
const FULL_DUE_MS = { praso: 55 * 60e3, sastastore: 55 * 60e3 };   // owner 21 Oct: robot every hour on both accounts
const RUN_STARTED = Date.now();
let ordersSyncedOk = false;
let deliveryBackfillRun = false;
const skuToAsinMap = {};
const productTypeCache = {};
const changedSkus = new Set();
const pushedTaxSkus = new Map(); // sku -> values we just pushed this run
let inventoryFresh = false;          // true once this run's listings report has been read
const reportSkus = new Set();        // SKUs present in this run's listings report

// ── QUOTA SAVER: compact snapshot ─────────────────────────────────────────────
// Instead of reading every inventory/pricing/order document on every run (and on every
// page open), the full data is kept in a few large "snapshot" documents:
//   spapiSnapshots/<account>_meta              -> which chunks are current
//   spapiSnapshots/<account>_<kind>_<run>_<n>  -> the data (kind = inventory/pricing/orders)
// One sync run now costs ~10 reads instead of thousands; one page open ~10 reads.
// The individual documents are still written (only when changed) so nothing else breaks.
const SNAP = { inventory: {}, pricing: {}, orders: {} };
const SNAP_KINDS = ['inventory', 'pricing', 'orders'];
const SNAP_COL = 'spapiSnapshots';
const ORDERS_WINDOW_DAYS = 90;
const CHUNK_BYTES = 700 * 1024; // Firestore max is 1 MiB per document - stay well under
let prevSnapMeta = null;
let mrpCheckedAt = null;            // when verifyMrpPushes last ran (kept in the snapshot meta doc)

function plain(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    out[k] = v && typeof v.toMillis === 'function' ? v.toMillis() : v;
  }
  return out;
}

async function loadSnapshot() {
  const metaDoc = await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_meta`).get();
  if (metaDoc.exists && metaDoc.data().run) {
    prevSnapMeta = metaDoc.data();
    const refs = [];
    for (const kind of SNAP_KINDS) {
      const n = (prevSnapMeta.chunks || {})[kind] || 0;
      for (let i = 0; i < n; i++) refs.push(db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_${kind}_${prevSnapMeta.run}_${i}`));
    }
    const docs = refs.length ? await db.getAll(...refs) : [];
    docs.forEach((d) => {
      if (!d.exists) return;
      const { kind, items } = d.data();
      (items || []).forEach((it) => { if (it && it._id) SNAP[kind][it._id] = it; });
    });
    console.log(`Snapshot loaded (${1 + refs.length} reads): inventory ${Object.keys(SNAP.inventory).length}, pricing ${Object.keys(SNAP.pricing).length}, orders ${Object.keys(SNAP.orders).length}`);
  } else {
    // First run only: build the snapshot from the existing collections (one-time full read).
    console.log('No snapshot yet - one-time bootstrap from existing collections...');
    const cutoff = new Date(Date.now() - ORDERS_WINDOW_DAYS * 864e5).toISOString();
    const [inv, pr, ord] = await Promise.all([
      db.collection('spapiInventory').where('account', '==', ACCOUNT_LABEL).get(),
      db.collection('spapiCompetitivePricing').where('account', '==', ACCOUNT_LABEL).get(),
      db.collection('spapiOrders').where('account', '==', ACCOUNT_LABEL).where('purchaseDate', '>=', cutoff).get(),
    ]);
    inv.forEach((d) => { SNAP.inventory[d.id] = { ...plain(d.data()), _id: d.id }; });
    pr.forEach((d) => { SNAP.pricing[d.id] = { ...plain(d.data()), _id: d.id }; });
    ord.forEach((d) => { SNAP.orders[d.id] = { ...plain(d.data()), _id: d.id }; });
    console.log(`Bootstrap done: inventory ${inv.size}, pricing ${pr.size}, orders ${ord.size}`);
  }
}

function snapPatch(kind, docId, patch) {
  if (!SNAP[kind][docId] && !patch.account) return; // write-back for an item we don't track
  SNAP[kind][docId] = { ...(SNAP[kind][docId] || {}), ...patch, _id: docId, updatedAt: Date.now() };
}

function chunkItems(items) {
  const chunks = [];
  let cur = [], size = 0;
  for (const it of items) {
    const b = Buffer.byteLength(JSON.stringify(it)) + 16;
    if (cur.length && size + b > CHUNK_BYTES) { chunks.push(cur); cur = []; size = 0; }
    cur.push(it); size += b;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

async function writeSnapshot() {
  const cutoff = new Date(Date.now() - ORDERS_WINDOW_DAYS * 864e5).toISOString();
  for (const [id, o] of Object.entries(SNAP.orders)) {
    if (!o.purchaseDate || o.purchaseDate < cutoff) delete SNAP.orders[id];
  }
  const run = Date.now().toString(36);
  const chunks = {}, counts = {};
  for (const kind of SNAP_KINDS) {
    const items = Object.values(SNAP[kind]);
    counts[kind] = items.length;
    const parts = chunkItems(items);
    chunks[kind] = parts.length;
    for (let i = 0; i < parts.length; i++) {
      await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_${kind}_${run}_${i}`).set({
        account: ACCOUNT_LABEL, kind, run, index: i, items: parts[i],
      });
    }
  }
  // Switch the page over to the new chunks only after all of them are written.
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_meta`).set({
    account: ACCOUNT_LABEL, run, chunks, counts, syncedAt: Date.now(), mode: SYNC_MODE,
    ordersSyncedAt: ordersSyncedOk ? RUN_STARTED : ((prevSnapMeta && prevSnapMeta.ordersSyncedAt) || null),
    deliveryBackfilled: !!((prevSnapMeta && prevSnapMeta.deliveryBackfilled) || (deliveryBackfillRun && ordersSyncedOk)),
    fullSyncedAt: SYNC_MODE === 'full' ? Date.now() : ((prevSnapMeta && prevSnapMeta.fullSyncedAt) || null),
    mrpCheckedAt: mrpCheckedAt || (prevSnapMeta && prevSnapMeta.mrpCheckedAt) || null,
  });
  // Remove the previous run's chunks (a little later, so an open page can finish reading).
  if (prevSnapMeta && prevSnapMeta.run && prevSnapMeta.run !== run) {
    await new Promise((r) => setTimeout(r, 15000));
    const batch = db.batch();
    for (const kind of SNAP_KINDS) {
      const n = (prevSnapMeta.chunks || {})[kind] || 0;
      for (let i = 0; i < n; i++) batch.delete(db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_${kind}_${prevSnapMeta.run}_${i}`));
    }
    await batch.commit();
  }
  console.log(`Snapshot written: ${JSON.stringify(counts)} in ${JSON.stringify(chunks)} chunk(s)`);
}

async function loadProductTypeCache() {
  await loadSnapshot();
  Object.values(SNAP.inventory).forEach((data) => {
    if (data.sku && data.amazonProductType) productTypeCache[data.sku] = data.amazonProductType;
    if (data.sku && data.asin) skuToAsinMap[data.sku] = data.asin;
  });
  console.log(`productTypeCache loaded: ${Object.keys(productTypeCache).length} SKUs`);
}

function getProductTypeForSku(sku) {
  return productTypeCache[sku] || null;
}

// Amazon needs the listing's product type for every update. The category lookup is per ASIN, so a
// second SKU on the same ASIN (or a failed lookup) could stay without one forever and every push
// failed with "No known product type". Ask Amazon for this SKU's own product type when missing.
async function productTypeFor(sellerId, sku) {
  const known = productTypeCache[sku];
  if (known && !/_display_on_website$/i.test(known)) return known;
  try {
    const res = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku },
      query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['summaries'] } });
    const pt = ((res.summaries || [])[0] || {}).productType || null;
    if (pt) {
      productTypeCache[sku] = pt;
      snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { amazonProductType: pt });
      await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).set({ amazonProductType: pt }, { merge: true }).catch(() => {});
      console.log(`Product type for ${sku}: ${pt} (read from the listing)`);
    }
    return pt || known || null;
  } catch (e) { console.warn(`Product type lookup failed for ${sku}:`, e.message || e); return known || null; }
}

// Amazon's Listings API often answers "INVALID" with a list of issues instead of throwing an
// error, so a "successful" call can still mean nothing changed. Treat that as a failure and keep
// Amazon's own reason, so the page can show exactly why.
function assertListingsOk(res) {
  const r = res && (res.payload || res);
  const issues = (r && r.issues) || [];
  const errors = issues.filter((i) => (i.severity || '').toUpperCase() === 'ERROR');
  // "VALID" is Amazon's success answer for a VALIDATION_PREVIEW (dry run)
  if ((r && r.status && r.status !== 'ACCEPTED' && r.status !== 'VALID') || errors.length) {
    const msg = (errors.length ? errors : issues).map((i) => i.message || i.code).filter(Boolean).join(' | ');
    throw new Error(`Amazon rejected the change (${(r && r.status) || 'ERROR'})${msg ? ': ' + msg : ''}`);
  }
  return r;
}

// Amazon India tax codes (PTC) for each GST rate, as published for the 22-Sep-2025 GST change.
const TAX_CODE_RATE = {
  A_GEN_EXEMPT: 0, A_GEN_STANDARDtoEXEMPT2025: 0, A_GEN_SUPERREDUCEDtoEXEMPT2025: 0, A_GEN_REDUCEDtoEXEMPT2025: 0,
  A_GEN_MINIMUM: 0.25, A_GEN_JEWELLERY: 3, A_GEN_SUPERREDUCED: 5, A_GEN_REDUCED: 5, A_GEN_STANDARDtoREDUCED2025: 5,
  A_GEN_STANDARD: 18, A_GEN_PEAK: 18, A_GEN_REDUCEDtoSTANDARD2025: 18,
  A_GEN_PEAK_CESS12: 40, A_GEN_STANDARDtoHIGHPEAK2025: 40, A_GEN_HIGHPEAK: 40,
};

async function syncOrders() {
  // Orders changed since the last sync (new orders AND status changes like cancellations),
  // with a 10-minute overlap. First run / no history: orders created in the last 24 hours.
  const lastOk = prevSnapMeta && prevSnapMeta.ordersSyncedAt;
  const query = { MarketplaceIds: [MARKETPLACE_ID] };
  if (lastOk && RUN_STARTED - lastOk < 3 * 864e5) query.LastUpdatedAfter = new Date(lastOk - 10 * 60 * 1000).toISOString();
  else query.CreatedAfter = new Date(RUN_STARTED - 24 * 60 * 60 * 1000).toISOString();
  // One-time backfill: only for orders ALREADY in the snapshot that lack the deliver-by date.
  // Re-read from the oldest such order onwards; orders we never had are skipped (no item calls).
  const needDates = Object.values(SNAP.orders).filter((o) => o.account === ACCOUNT_LABEL && !o.latestDeliveryDate && o.purchaseDate);
  if (!(prevSnapMeta && prevSnapMeta.deliveryBackfilled) && needDates.length) {
    const oldest = needDates.reduce((m, o) => (o.purchaseDate < m ? o.purchaseDate : m), needDates[0].purchaseDate);
    delete query.LastUpdatedAfter;
    query.CreatedAfter = new Date(new Date(oldest).getTime() - 60 * 60 * 1000).toISOString();
    deliveryBackfillRun = true;
    console.log(`Orders: one-time deliver-by backfill for ${needDates.length} existing orders (from ${oldest})`);
  } else if (!(prevSnapMeta && prevSnapMeta.deliveryBackfilled)) deliveryBackfillRun = true;
  const orders = [];
  let nextToken = null, pages = 0;
  do {
    const res = await spClient.callAPI({ operation: 'getOrders', endpoint: 'orders',
      query: nextToken ? { MarketplaceIds: [MARKETPLACE_ID], NextToken: nextToken } : query });
    orders.push(...(res.Orders || res.payload?.Orders || []));
    nextToken = res.NextToken || res.payload?.NextToken || null;
    if (nextToken) await new Promise((r) => setTimeout(r, 1000));
  } while (nextToken && ++pages < 40);
  console.log(`Orders: ${orders.length} changed since ${query.LastUpdatedAfter || query.CreatedAfter}`);

  let batch = db.batch();
  let financeFailCount = 0, written = 0, unchanged = 0;

  let pending = 0;
  const flush = async () => { if (pending) { await batch.commit(); batch = db.batch(); pending = 0; } };
  for (const order of orders) {
    const existing = SNAP.orders[`${ACCOUNT_LABEL}_${order.AmazonOrderId}`];
    // During the backfill, skip old orders we never tracked (and are not recently updated).
    if (deliveryBackfillRun && !existing && order.LastUpdateDate && (lastOk ? new Date(order.LastUpdateDate).getTime() < lastOk - 10 * 60 * 1000 : new Date(order.PurchaseDate).getTime() < RUN_STARTED - 864e5)) continue;
    let items = existing && Array.isArray(existing.items) && existing.items.length ? existing.items : [];
    if (!items.length) try {
      const itemsRes = await spClient.callAPI({
        operation: 'getOrderItems',
        endpoint: 'orders',
        path: { orderId: order.AmazonOrderId },
      });
      items = (itemsRes.OrderItems || []).map((li) => {
        const price = parseFloat(li.ItemPrice?.Amount) || 0;
        const tax = parseFloat(li.ItemTax?.Amount) || 0;
        const exclTaxPrice = price - tax;
        return {
          title: li.Title || '',
          asin: li.ASIN || '',
          sku: li.SellerSKU || '',
          qty: li.QuantityOrdered || 0,
          price, tax,
          taxPercent: exclTaxPrice > 0 ? Math.round((tax / exclTaxPrice) * 1000) / 10 : 0,
        };
      });
    } catch (e) {
      console.warn(`getOrderItems failed for ${order.AmazonOrderId}:`, e.message || e);
    }
    if (!(existing && existing.items && existing.items.length)) await new Promise((r) => setTimeout(r, 600));

    let amazonFees = existing && existing.amazonFees != null ? existing.amazonFees : null;
    if (amazonFees == null && (!existing || SYNC_MODE === 'full')) try {
      const finRes = await spClient.callAPI({
        operation: 'listFinancialEventsByOrderId',
        endpoint: 'finances',
        path: { orderId: order.AmazonOrderId },
      });
      const shipmentEvents = finRes.payload?.FinancialEvents?.ShipmentEventList
        || finRes.FinancialEvents?.ShipmentEventList || [];
      let feeTotal = 0, hasFeeData = false;
      shipmentEvents.forEach((se) => {
        (se.ShipmentItemList || []).forEach((item) => {
          (item.ItemFeeList || []).forEach((fee) => {
            const amt = parseFloat(fee.FeeAmount?.Amount);
            if (!isNaN(amt)) { feeTotal += amt; hasFeeData = true; }
          });
        });
      });
      if (hasFeeData) amazonFees = Math.abs(feeTotal);
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) { financeFailCount++; await new Promise((r) => setTimeout(r, 600)); }

    const ref = db.collection('spapiOrders').doc(`${ACCOUNT_LABEL}_${order.AmazonOrderId}`);
    const orderData = {
      account: ACCOUNT_LABEL,
      orderId: order.AmazonOrderId,
      status: order.OrderStatus,
      isCanceled: order.OrderStatus === 'Canceled',
      total: order.OrderTotal?.Amount || null,
      purchaseDate: order.PurchaseDate,
      fulfillmentChannel: order.FulfillmentChannel,
      isEasyShip: !!order.EasyShipShipmentStatus,
      shipServiceLevel: order.ShipServiceLevel || null,
      earliestShipDate: order.EarliestShipDate || null,
      latestShipDate: order.LatestShipDate || null,
      earliestDeliveryDate: order.EarliestDeliveryDate || null,
      latestDeliveryDate: order.LatestDeliveryDate || null, // Amazon's "deliver by" date
      items, amazonFees,
    };
    const same = existing && ['status', 'total', 'isEasyShip', 'latestShipDate', 'latestDeliveryDate', 'amazonFees'].every((k) => String(existing[k] ?? '') === String(orderData[k] ?? ''))
      && (existing.items || []).length === items.length;
    if (same) { unchanged++; continue; }
    batch.set(ref, { ...orderData, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    snapPatch('orders', ref.id, orderData);
    written++;
    if (++pending >= 400) await flush(); // Firestore allows max 500 writes per batch
  }

  await flush();
  ordersSyncedOk = true;
  console.log(`Orders synced: ${written} saved, ${unchanged} unchanged`);
  if (financeFailCount > 0) console.log(`Finances API still blocked (${financeFailCount}/${orders.length} orders)`);
  await fillMissingDeliveryDates().catch((e) => console.warn('Deliver-by refresh skipped:', e.message || e));
  return orders;
}

// Amazon often adds the "deliver by" date a little after the order arrives, without changing
// LastUpdateDate — so the normal "changed since" read never sees it. Re-ask Amazon for those
// orders directly, 50 order IDs per call (a few calls per run, unshipped & newest first).
async function fillMissingDeliveryDates() {
  const now = Date.now();
  const due = Object.values(SNAP.orders).filter((o) => {
    if (o.account !== ACCOUNT_LABEL || o.latestDeliveryDate || o.isCanceled || !o.orderId) return false;
    if (/^pending|cancel/i.test(o.status || '')) return false;
    const open = /unshipped|partially/i.test(o.status || '');
    if (!o.dlvCheckedAt) return true;                          // never re-checked
    return open && now - o.dlvCheckedAt > 3 * 3600e3;          // open orders: retry every 3 h
  }).sort((a, b) => (/unshipped|partially/i.test(b.status || '') - /unshipped|partially/i.test(a.status || '')) || String(b.purchaseDate).localeCompare(String(a.purchaseDate)));
  if (!due.length) return;
  const MAX_CALLS = 8;
  let found = 0, checked = 0, batch = db.batch(), pending = 0;
  for (let i = 0; i < due.length && i / 50 < MAX_CALLS; i += 50) {
    const ids = due.slice(i, i + 50).map((o) => o.orderId);
    const res = await spClient.callAPI({ operation: 'getOrders', endpoint: 'orders',
      query: { MarketplaceIds: [MARKETPLACE_ID], AmazonOrderIds: ids } });
    const byId = {};
    (res.Orders || res.payload?.Orders || []).forEach((o) => { byId[o.AmazonOrderId] = o; });
    for (const id of ids) {
      const a = byId[id], docId = `${ACCOUNT_LABEL}_${id}`;
      const patch = { dlvCheckedAt: now };
      if (a && a.LatestDeliveryDate) {
        patch.latestDeliveryDate = a.LatestDeliveryDate;
        patch.earliestDeliveryDate = a.EarliestDeliveryDate || null;
        found++;
        batch.set(db.collection('spapiOrders').doc(docId), { latestDeliveryDate: patch.latestDeliveryDate, earliestDeliveryDate: patch.earliestDeliveryDate }, { merge: true });
        if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
      if (a && a.OrderStatus) { patch.status = a.OrderStatus; patch.isCanceled = a.OrderStatus === 'Canceled'; }
      snapPatch('orders', docId, patch);
      checked++;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (pending) await batch.commit();
  console.log(`Deliver-by refresh: ${found} dates found in ${checked} orders (${Math.max(0, due.length - checked)} left for next runs)`);
}

function extractWeightKg(name) {
  if (!name) return null;
  const m = name.match(/(\d+\.?\d*)\s?(kg|kgs|g|gm|gms|grams?|ml|mls?|l|litre|liter|litres|liters)\b/i);
  if (!m) return null;
  const num = parseFloat(m[1]), unit = m[2].toLowerCase();
  if (unit.startsWith('kg')) return num;
  if (unit.startsWith('g')) return num / 1000;
  if (unit.startsWith('ml')) return num / 1000;
  if (unit.startsWith('l')) return num;
  return null;
}

async function syncInventory() {
  console.log('Requesting merchant listings report...');
  const createRes = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body: { reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA', marketplaceIds: [MARKETPLACE_ID] },
  });

  const reportId = createRes.reportId;
  console.log('Report requested, id:', reportId);

  let reportDocumentId;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 20000));
    const status = await spClient.callAPI({ operation: 'getReport', endpoint: 'reports', path: { reportId } });
    console.log(`Poll ${attempt + 1}: status = ${status.processingStatus}`);
    if (status.processingStatus === 'DONE') { reportDocumentId = status.reportDocumentId; break; }
    if (status.processingStatus === 'FATAL' || status.processingStatus === 'CANCELLED')
      throw new Error(`Report generation failed: ${status.processingStatus}`);
  }

  if (!reportDocumentId) { console.log('Report not ready - will retry next run.'); return []; }

  const doc = await spClient.callAPI({ operation: 'getReportDocument', endpoint: 'reports', path: { reportDocumentId } });
  console.log('Report doc type:', typeof doc, Buffer.isBuffer(doc) ? '(Buffer)' : JSON.stringify(Object.keys(doc || {})));

  let docText;
  if (Buffer.isBuffer(doc)) { docText = doc.toString('utf-8'); }
  else if (typeof doc === 'string') { docText = doc; }
  else if (doc && doc.url) {
    const zlib = require('zlib'), https = require('https');
    const rawBuffer = await new Promise((resolve, reject) => {
      https.get(doc.url, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
    const isGzip = (doc.compressionAlgorithm || '').toUpperCase() === 'GZIP';
    docText = isGzip ? zlib.gunzipSync(rawBuffer).toString('utf-8') : rawBuffer.toString('utf-8');
  } else { console.log('Unrecognized report shape:', JSON.stringify(doc).slice(0, 300)); return []; }

  const lines = docText.split('\n').filter(Boolean);
  const headers = lines[0].split('\t').map(h => h.replace(/^\uFEFF/, '').trim());
  console.log('Report headers:', JSON.stringify(headers));
  const skuIdx = headers.indexOf('seller-sku'), qtyIdx = headers.indexOf('quantity'),
    priceIdx = headers.indexOf('price'), asinIdx = headers.indexOf('asin1'),
    nameIdx = headers.indexOf('item-name'), categoryIdx = headers.indexOf('zshop-category1'),
    mrpIdx = headers.indexOf('maximum-retail-price'), fcIdx = headers.indexOf('fulfillment-channel');
  console.log('Column indexes - sku:', skuIdx, 'name:', nameIdx, 'asin:', asinIdx, 'category:', categoryIdx, 'mrp:', mrpIdx);

  // Compare against the snapshot (0 reads) instead of reading every inventory doc.
  const existingBySku = SNAP.inventory;

  const batch = db.batch();
  let changedCount = 0, skippedCount = 0;
  const asins = [];
  inventoryFresh = true; // the report arrived - safe to act on these stock numbers this run

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const sku = cols[skuIdx];
    if (!sku) continue;

    const asin = cols[asinIdx] || null;
    if (asin) { asins.push(asin); skuToAsinMap[sku] = asin; }

    const docId = `${ACCOUNT_LABEL}_${sku}`;
    const fc = fcIdx >= 0 ? (cols[fcIdx] || '').trim() : '';
    reportSkus.add(sku);
    if (SNAP.inventory[docId]) SNAP.inventory[docId].fulfillmentChannel = fc || 'DEFAULT';
    const newData = {
      account: ACCOUNT_LABEL, sku,
      name: cols[nameIdx] || '',
      asin, category: cols[categoryIdx] || '',
      weightKg: extractWeightKg(cols[nameIdx] || ''),
      quantity: parseInt(cols[qtyIdx], 10) || 0,
      price: parseFloat(cols[priceIdx]) || null,
      mrp: mrpIdx >= 0 ? (parseFloat(cols[mrpIdx]) || null) : null,
    };
    const old = existingBySku[docId];
    const changed = !old || old.quantity !== newData.quantity || old.price !== newData.price
      || old.mrp !== newData.mrp || old.name !== newData.name
      || old.asin !== newData.asin || old.category !== newData.category;
    const hsnMissing = !old || (old.hsnCode == null && old.taxCode == null);
    if (SYNC_MODE === 'full' ? (changed || hsnMissing) : (!old || old.name !== newData.name || old.asin !== newData.asin)) changedSkus.add(sku);

    if (changed) {
      batch.set(db.collection('spapiInventory').doc(docId),
        { ...newData, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      snapPatch('inventory', docId, { ...newData, fulfillmentChannel: fc || 'DEFAULT' });
      changedCount++;
    } else { skippedCount++; }
  }

  if (changedCount > 0) await batch.commit();
  console.log(`Inventory synced: ${changedCount} changed, ${skippedCount} unchanged (skipped write)`);
  console.log('Unique categories found:', JSON.stringify([...new Set(lines.slice(1).map(l => l.split('\t')[categoryIdx]).filter(Boolean))]));
  return [...new Set(asins)];
}

async function fetchProductCategories(asinList) {
  const categories = {};
  let firstLogged = false, failCount = 0;
  for (const asin of asinList) {
    try {
      const res = await spClient.callAPI({
        operation: 'getCatalogItem', endpoint: 'catalogItems', path: { asin },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['productTypes', 'summaries'] },
      });
      if (!firstLogged) { console.log('Sample getCatalogItem for', asin, ':', JSON.stringify(res).slice(0, 800)); firstLogged = true; }
      const productTypes = res.productTypes || res.payload?.productTypes;
      const summaries = res.summaries || res.payload?.summaries;
      const cat = productTypes?.[0]?.productType || summaries?.[0]?.websiteDisplayGroup || null;
      if (cat) categories[asin] = cat;
    } catch (e) { failCount++; }
    await new Promise((r) => setTimeout(r, 800));
  }
  if (failCount > 0) console.log(`Category fetch failed for ${failCount}/${asinList.length} ASINs`);
  return categories;
}

// Product images from Amazon's catalogue (Catalog Items API, 20 ASINs per call). Kept in the
// snapshot only (no extra Firestore docs). Asked once per ASIN; quick syncs only do a few calls.
async function fetchProductImages() {
  const need = new Map();
  Object.values(SNAP.inventory).forEach((i) => {
    if (i && i.account === ACCOUNT_LABEL && i.asin && !i.img && !(i.imgCheckedAt && Date.now() - i.imgCheckedAt < 7 * 864e5)) {
      (need.get(i.asin) || need.set(i.asin, []).get(i.asin)).push(i._id || `${ACCOUNT_LABEL}_${i.sku}`);
    }
  });
  const asins = [...need.keys()];
  if (!asins.length) { console.log('Images: all listings already have one.'); return; }
  const maxCalls = SYNC_MODE === 'full' ? 40 : 4;
  let found = 0, calls = 0, logged = false;
  for (let i = 0; i < asins.length && calls < maxCalls; i += 20, calls++) {
    const chunk = asins.slice(i, i + 20), got = {};
    try {
      const res = await spClient.callAPI({
        operation: 'searchCatalogItems', endpoint: 'catalogItems',
        query: { marketplaceIds: [MARKETPLACE_ID], identifiers: chunk, identifiersType: 'ASIN', includedData: ['images'], pageSize: 20 },
        options: { version: '2022-04-01' },
      });
      const items = res.items || res.payload?.items || [];
      if (!logged) { console.log('Sample catalog images:', JSON.stringify(items[0] || res).slice(0, 500)); logged = true; }
      items.forEach((it) => {
        const set = (it.images || []).find((x) => x.marketplaceId === MARKETPLACE_ID) || (it.images || [])[0];
        const list = (set && set.images) || [];
        const pick = list.find((x) => x.variant === 'MAIN') || list[0];
        if (pick && pick.link) got[it.asin] = pick.link.replace(/\._[^.\/]+_(\.[a-z]+)$/i, '$1'); // plain image, sized in the page
      });
    } catch (e) { console.warn('Image lookup failed:', e.message || e); }
    chunk.forEach((a) => (need.get(a) || []).forEach((docId) => {
      if (got[a]) { snapPatch('inventory', docId, { img: got[a] }); found++; } else snapPatch('inventory', docId, { imgCheckedAt: Date.now() });
    }));
    await new Promise((r) => setTimeout(r, 700));
  }
  console.log(`Images: ${found} added (${Math.max(0, asins.length - calls * 20)} ASINs left for later runs).`);
}

async function fetchHsnTaxData(sellerId, skuList) {
  const results = {};
  let firstLogged = false, failCount = 0;
  for (const sku of skuList) {
    try {
      const res = await spClient.callAPI({
        operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes'] },
      });
      if (!firstLogged) { console.log('Sample getListingsItem (HSN/tax) for', sku, ':', JSON.stringify(res).slice(0, 1200)); firstLogged = true; }
      const attrs = res.attributes || res.payload?.attributes || {};
      const externalInfo = attrs.external_product_information || [];
      const hsnEntry = externalInfo.find(e => (e.entity || '').toLowerCase().includes('hsn'));
      const hsnCode = hsnEntry ? hsnEntry.value : null;
      const taxCode = attrs.product_tax_code?.[0]?.value ?? null;
      if (hsnCode || taxCode) results[sku] = { hsnCode, taxCode };
    } catch (e) { failCount++; }
    await new Promise((r) => setTimeout(r, 800));
  }
  if (failCount > 0) console.log(`HSN/tax fetch failed for ${failCount}/${skuList.length} SKUs`);
  return results;
}

// Amazon's batch call returns offers for up to 20 ASINs at once (rate: 1 call / 10 s), which is
// ~3x faster than one-by-one. Any ASIN the batch doesn't return falls back to the single call.
async function prefetchOffersBatch(asinList) {
  const out = new Map();
  let ok = 0, fail = 0;
  for (let i = 0; i < asinList.length; i += 20) {
    const group = asinList.slice(i, i + 20);
    try {
      const res = await spClient.callAPI({
        operation: 'getItemOffersBatch', endpoint: 'productPricing',
        body: { requests: group.map((a) => ({ uri: `/products/pricing/v0/items/${a}/offers`, method: 'GET', MarketplaceId: MARKETPLACE_ID, ItemCondition: 'New' })) },
      });
      const list = res.responses || (res.payload && res.payload.responses) || [];
      list.forEach((r, idx) => {
        const code = r.status && r.status.statusCode;
        const p = (r.body && (r.body.payload || r.body)) || null;
        const asin = (p && p.ASIN) || (r.request && (r.request.Asin || r.request.ASIN)) || group[idx];
        if (code === 200 && p && asin) out.set(asin, p.Offers || []);
      });
      ok++;
    } catch (e) {
      fail++;
      if (fail === 1) console.warn('getItemOffersBatch failed - those ASINs fall back to one-by-one:', e.message || e);
      if (fail >= 3 && ok === 0) { console.warn('Batch competitor pricing not available - using one-by-one for all.'); break; }
    }
    await new Promise((r) => setTimeout(r, 10500));
  }
  console.log(`Competitor prices via batch: ${out.size} of ${asinList.length} ASINs`);
  return out;
}

async function syncCompetitivePricing(asinList) {
  if (!asinList.length) return;
  const prefetched = await prefetchOffersBatch(asinList);

  const asinToSkus = {};
  for (const [sku, asin] of Object.entries(skuToAsinMap)) {
    if (!asinToSkus[asin]) asinToSkus[asin] = [];
    asinToSkus[asin].push(sku);
  }

  const mySellerId = process.env.SPAPI_SELLER_ID || null;
  // Compare against the snapshot (0 reads) instead of reading every pricing doc.
  const existingByAsin = SNAP.pricing;

  const batch = db.batch();
  let firstLogged = false, changedCount = 0, skippedCount = 0;
  let buyBoxHeld = 0, buyBoxLost = 0, buyBoxNone = 0, duplicatesFound = 0;

  for (const asin of asinList) {
    let offers = [];
    const fromBatch = prefetched.has(asin);
    try {
      let rawOffers;
      if (fromBatch) rawOffers = prefetched.get(asin);
      else {
        const res = await spClient.callAPI({
          operation: 'getItemOffers', endpoint: 'productPricing', path: { Asin: asin },
          query: { MarketplaceId: MARKETPLACE_ID, ItemCondition: 'New' },
        });
        if (!firstLogged) { console.log('Sample getItemOffers for', asin, ':', JSON.stringify(res).slice(0, 500)); firstLogged = true; }
        rawOffers = res.Offers || res.payload?.Offers || [];
      }
      offers = rawOffers.map((o) => ({
        sellerId: o.SellerId || '',
        price: parseFloat(o.ListingPrice?.Amount) || null,
        shipping: parseFloat(o.Shipping?.Amount) || 0,
        landedPrice: parseFloat(o.LandedPrice?.Amount) || null,
        isBuyBoxWinner: !!o.IsBuyBoxWinner,
        isFeatured: !!o.IsFeaturedMerchant,
        isMine: mySellerId ? (o.SellerId === mySellerId) : false,
        condition: o.SubCondition || 'New',
      })).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      relistFresh.set(asin, offers);
    } catch (e) { console.warn(`getItemOffers failed for ${asin}:`, e.message || e); }
    if (!fromBatch) await new Promise((r) => setTimeout(r, 1200));

    const lowest = offers[0]?.price ?? null;
    const buyBoxWinner = offers.find(o => o.isBuyBoxWinner) || null;
    const myOffer = mySellerId ? offers.find(o => o.isMine) : null;
    const iHoldBuyBox = !!buyBoxWinner?.isMine;
    const myPrice = myOffer?.price ?? null;
    const myLandedPrice = myOffer?.landedPrice ?? null;

    let buyBoxStatus = 'no_offer';
    if (myOffer) buyBoxStatus = iHoldBuyBox ? 'held' : 'lost';
    if (buyBoxStatus === 'held') buyBoxHeld++;
    else if (buyBoxStatus === 'lost') buyBoxLost++;
    else buyBoxNone++;

    const mySkusForAsin = asinToSkus[asin] || [];
    const isDuplicate = mySkusForAsin.length > 1;
    if (isDuplicate) duplicatesFound++;

    const priceGapVsBuyBox = (myPrice != null && buyBoxWinner?.price != null)
      ? Math.round((myPrice - buyBoxWinner.price) * 100) / 100 : null;

    const docId = `${ACCOUNT_LABEL}_${asin}`;
    const old = existingByAsin[docId];
    const changed = !old || old.lowestCompetitorPrice !== lowest || old.rawOffers !== offers.length
      || old.buyBoxStatus !== buyBoxStatus || old.myPrice !== myPrice
      || old.iHoldBuyBox !== iHoldBuyBox || old.isDuplicate !== isDuplicate;

    if (changed) {
      const pricingData = {
        account: ACCOUNT_LABEL, asin,
        mySkus: mySkusForAsin, isDuplicate, duplicateSkuCount: mySkusForAsin.length,
        myPrice, myLandedPrice, lowestCompetitorPrice: lowest,
        priceGapVsBuyBox, buyBoxStatus, iHoldBuyBox,
        buyBoxWinnerPrice: buyBoxWinner?.price ?? null,
        buyBoxWinnerSellerId: buyBoxWinner?.sellerId ?? null,
        rawOffers: offers.length, offers,
      };
      batch.set(db.collection('spapiCompetitivePricing').doc(docId),
        { ...pricingData, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      snapPatch('pricing', docId, pricingData);
      changedCount++;
    } else { skippedCount++; }
  }

  if (changedCount > 0) await batch.commit();
  console.log(`Competitive pricing synced: ${changedCount} changed, ${skippedCount} unchanged of ${asinList.length} ASINs`);
  console.log(`Buy box summary — Held: ${buyBoxHeld} | Lost: ${buyBoxLost} | No offer: ${buyBoxNone} | Duplicates: ${duplicatesFound}`);
  // Daily numbers for the 9 pm Telegram summary (owner, 24 Oct 2026): latest Buy Box counts + today's orders (IST)
  try {
    const ist = (t) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10), today = ist(Date.now());
    const orders = Object.values(SNAP.orders).filter((o) => o && (!o.account || o.account === ACCOUNT_LABEL) && !o.isCanceled
      && !/^cancel/i.test(o.status || '') && o.purchaseDate && ist(Date.parse(o.purchaseDate)) === today).length;
    await dbMain.collection('aikm_admin').doc('bbDaily').set({ [ACCOUNT_LABEL]: { [today]: { held: buyBoxHeld, lost: buyBoxLost, none: buyBoxNone, orders, at: Date.now() } } }, { merge: true });
  } catch (e) { console.warn('Daily Buy Box numbers not saved:', e.message || e); }
}

// ── RELIST ROBOT: "Not selling" listings are relisted under a new SKU ────────────────────
// Asked for by the owner: if an in-stock self-ship listing is "Not selling" (Amazon shows other
// offers on the ASIN but not ours), create a fresh offer on the same ASIN with a new SKU
// (OLDSKU-R1, -R2 …) at the SAME price, MRP and stock as before, then delete the old SKU.
// Safety:
//   • Out-of-stock listings (quantity 0) and FBA listings are never touched.
//   • Only uses competitor offers fetched in THIS run, and only after "Not selling" was seen in
//     RELIST_STREAK full syncs in a row.
//   • Skips when Amazon still says the old listing is BUYABLE and the ASIN has 20+ offers
//     (Amazon only returns the top 20 offers, so ours may simply be hidden).
//   • The new SKU is checked with Amazon's VALIDATION_PREVIEW first; the old SKU is deleted only
//     after the new one is ACCEPTED.
//   • Circuit breaker: if 30%+ of checked listings look "Not selling" (account / API problem),
//     nothing is changed. Max RELIST_MAX_PER_RUN per run; each ASIN rests 3 days after a relist.
//   • Turn off any time with the repo variable/secret RELIST_ROBOT=off.
// RELIST_SALES_RULES: 7-day / 30-day no-sale relists - switched OFF 21 Oct 2026 (same-price relists did not win sales; price does).
const RELIST_SALES_RULES = false;
const RELIST_MAX_PER_RUN = 20, RELIST_SALES_MAX_PER_RUN = 20, RELIST_STREAK = 1, RELIST_BREAKER = 0.3;
// Owner 21 Oct 2026: "any ASIN not selling must be relisted again" - zero not-selling target. Short rests only:
// a new offer needs ~2 h to go live, so every listing is re-checked after 3 h and relisted again if still hidden.
const RELIST_COOLDOWN_OK = 3 * 3600e3, RELIST_COOLDOWN_FAIL = 3 * 3600e3, RELIST_COOLDOWN_BLOCKED = 24 * 3600e3, RELIST_CAP_WEEK = 2;
const relistFresh = new Map();   // asin -> offers fetched this run
const RELIST_OFFER_ATTRS = ['condition_type', 'condition_note', 'list_price', 'merchant_shipping_group', 'product_tax_code',
  'max_order_quantity', 'gift_options', 'country_of_origin', 'item_package_quantity', 'batteries_required',
  'supplier_declared_dg_hz_regulation', 'externally_assigned_product_identifier', 'manufacturer', 'packer_contact_information',
  'importer_contact_information', 'manufacturer_contact_information', 'item_weight', 'unit_count', 'item_package_weight'];
// ── PRICE FIX for listings Amazon suppressed for their price ─────────────────────────────
// Asked for by the owner (20 Oct 2026): instead of relisting at the same price, move the price to
// just under the Buy Box (or the lowest other seller if nobody holds it) - never below LOTS cost
// + PRICE_FIX_MARGIN and never above MRP. Changes the price on the SAME SKU (no new SKU).
// Cost comes only from CONFIRMED mappings (Amazon page ASIN mapping incl. packs/combos/split packs,
// other-vendor bill cost, or a hand-entered cost) - never a name guess. No cost known = no change.
const PRICE_FIX_MARGIN = 5;
let costData = null;
// Read saver (24 Oct 2026): the LOTS catalogue (~25 documents) only changes when the LOTS price sync
// or a manual upload saves it, so it is kept in a file between runs (GitHub cache, see the workflow)
// and re-read only when its "savedAt" stamp changed, or at least every 3 hours as a safety net.
// Each run now costs 1 read for the stamp instead of ~25 for the whole catalogue.
const LOTS_CACHE_FILE = '.cache/lots-catalog.json';
const LOTS_CACHE_MAX_AGE = 3 * 3600e3;
async function loadLotsCatalog(A) {
  const fs = require('fs');
  const parent = await A.doc('lotsCatalog').get();
  const stamp = parent.exists ? JSON.stringify(parent.get('savedAt') ?? null) : null;
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(LOTS_CACHE_FILE, 'utf8')); } catch (e) { /* no cache yet */ }
  if (cached && stamp && stamp !== 'null' && cached.stamp === stamp && Date.now() - (cached.readAt || 0) < LOTS_CACHE_MAX_AGE && cached.lots) {
    console.log(`LOTS catalogue: unchanged since last read - used saved copy (${Object.keys(cached.lots).length} products, 1 read).`);
    return cached.lots;
  }
  const chunks = await A.doc('lotsCatalog').collection('chunks').get();
  const lots = {};
  chunks.docs.forEach((d) => (d.data().products || []).forEach((p) => { if (p && p.code) lots[String(p.code)] = p; }));
  console.log(`LOTS catalogue: read fresh (${chunks.size} document(s), ${Object.keys(lots).length} products).`);
  try { fs.mkdirSync('.cache', { recursive: true }); fs.writeFileSync(LOTS_CACHE_FILE, JSON.stringify({ stamp, readAt: Date.now(), lots })); } catch (e) { console.warn('LOTS cache not saved:', e.message || e); }
  return lots;
}
async function loadCostData() {
  if (costData) return costData;
  const A = dbMain.collection('aikm_admin');
  const [lots, map, man] = await Promise.all([loadLotsCatalog(A), A.doc('spapiAsinLotsMap').get(), A.doc('spapiManualCosts').get()]);
  costData = { lots, map: (map.exists && map.data().map) || {}, manual: (man.exists && man.data().costs) || {} };
  return costData;
}
function bestSlab(p) { const s = (p && p.slabs) || []; let b = null; s.forEach((x) => { const v = Number(x.price); if (v > 0 && (b == null || v < b)) b = v; }); return b; }
async function knownMrp(i) {
  const c = await loadCostData(), m = c.map[i.asin] || c.map[String(i.asin).toUpperCase()];
  if (!m) return null;
  if (m.vendorName && String(m.vendorName).toUpperCase() !== 'LOTS') { const v = Number(m.vendor && m.vendor.mrp); return v > 0 ? v : null; }
  const parts = Array.isArray(m.parts) && m.parts.length ? m.parts : (m.code ? [{ code: m.code, qty: 1 }] : []);
  let t = 0;
  for (const x of parts) { const p = c.lots[String(x.code)], v = Number(p && p.mrp); if (!(v > 0)) return null; t += v * Math.max(1, Number(x.qty) || 1) / Math.max(1, parseInt(x.lotsPack) || 1); }
  return t > 0 ? Math.round(t * 100) / 100 : null;
}
async function knownCost(i) {
  const c = await loadCostData();
  const man = Number(c.manual[i.sku]); if (man > 0) return { cost: man, src: 'manual cost' };
  const m = c.map[i.asin] || c.map[String(i.asin).toUpperCase()];
  if (!m) return null;
  if (m.vendorName && String(m.vendorName).toUpperCase() !== 'LOTS') { const v = Number(m.vendor && m.vendor.cost); return v > 0 ? { cost: v, src: m.vendorName + ' bill' } : null; }
  const parts = Array.isArray(m.parts) && m.parts.length ? m.parts : (m.code ? [{ code: m.code, qty: 1 }] : []);
  if (!parts.length) return null;
  let cost = 0;
  for (const x of parts) {
    const p = c.lots[String(x.code)], b = bestSlab(p); if (b == null) return null;
    cost += b * Math.max(1, Number(x.qty) || 1) / Math.max(1, parseInt(x.lotsPack) || 1);
  }
  return { cost: Math.round(cost * 100) / 100, src: 'LOTS' };
}
// Amazon lists at most 20 offers. When all 20 are cheaper than us our offer is simply not in the list:
// that is a price problem (the Buy Box pricer handles it), not a listing to relist.
function pricedOut(i, o) {
  if (o.length < 20) return false;
  const L = (x) => (x.price || 0) + (x.shipping || 0), mine = (i.price || 0) + myShipCharge(i);
  return mine > Math.max(...o.map(L));
}
async function fixSuppressedPrice(sellerId, i, old, productType, why) {
  // Owner, 21 Oct 2026: blocked listings must come back live at a profitable price.
  // Target = ₹1 under the Buy Box (landed, incl. shipping). If that earns under the rule (₹15 or 10%), go live at the lowest
  // price that meets it instead (listed and earning beats suppressed). The listing's own min/max price limits are
  // moved to fit (Amazon error 18155 "below your minimum price threshold" was blocking 4 listings).
  const L = (o) => (o.price || 0) + (o.shipping || 0);
  const offers = (relistFresh.get(i.asin) || []).filter((o) => !o.isMine && o.price > 0).sort((x, y) => L(x) - L(y));
  const bb = offers.find((o) => o.isBuyBoxWinner), ref = bb || offers[0];
  const kc = await knownCost(i);
  if (!kc) return { done: false, note: 'No confirmed cost (map it on the Amazon page) - price not changed.' };
  if (!productType) return { done: false, note: 'Product type unknown - price not changed.' };
  const ship = myShipCharge(i), mrp = Number(i.mrp) || null;
  const floor = Math.ceil(noLossFloor(i, kc.cost, i.price, ship));
  let target = ref ? Math.floor(L(ref) - 1 - ship) : Math.max(i.price, floor);
  let basis = ref ? `${bb ? 'Buy Box' : 'lowest seller'} ₹${Math.round(L(ref))} incl. shipping − ₹1` : 'no other seller';
  if (!priceOk(i, kc.cost, target, ship)) { target = floor; basis = `lowest price that earns ${RULE_TXT}/order (Buy Box too cheap to match)`; }
  if (/low pricing error/i.test(why || '') && target <= i.price) { target = Math.ceil(i.price) + 1; basis = 'Amazon flagged the price as too low - re-submitted ₹1 higher'; }
  if (mrp && target > mrp) {
    if (floor > mrp) return { done: false, note: `Earning ${RULE_TXT}/order needs ₹${floor}, above MRP ₹${mrp} - check the cost (${kc.src} ₹${kc.cost}).` };
    target = Math.floor(mrp);
  }
  await setOfferPrice(sellerId, i, old, productType, target);   // also moves min/max limits so the price fits
  const profit = orderProfit(i, kc.cost, target, ship);
  basis += ` · profit ₹${Math.round(profit)}/order`;
  console.log(`Price fix ${i.sku}: ₹${i.price} -> ₹${target} (${basis})`);
  return { done: true, price: target, basis, floor, profit };
}

// New offer = the old listing's own offer block (Amazon India keeps MRP inside purchasable_offer as
// maximum_retail_price), with the same selling price, stock and GST code as before.
function relistAttributes(oa, i) {
  const attributes = {};
  RELIST_OFFER_ATTRS.forEach((k) => { if (oa[k]) attributes[k] = oa[k]; });
  ['skip_offer', 'external_product_information'].forEach((k) => { if (oa[k]) attributes[k] = oa[k]; });
  attributes.merchant_suggested_asin = [{ value: i.asin, marketplace_id: MARKETPLACE_ID }];
  if (!attributes.condition_type) attributes.condition_type = [{ value: 'new_new', marketplace_id: MARKETPLACE_ID }];
  const po = JSON.parse(JSON.stringify((oa.purchasable_offer || [])[0] || {}));
  delete po.start_at; delete po.end_at;
  Object.assign(po, { marketplace_id: MARKETPLACE_ID, currency: po.currency || 'INR', audience: po.audience || 'ALL',
    our_price: [{ schedule: [{ value_with_tax: i.price }] }] });
  if (!po.maximum_retail_price && i.mrp) po.maximum_retail_price = [{ schedule: [{ value_with_tax: i.mrp }] }];
  ['maximum_seller_allowed_price', 'minimum_seller_allowed_price', 'discounted_price', 'quantity_discount_plan'].forEach((k) => delete po[k]);
  attributes.purchasable_offer = [po];
  if (!attributes.product_tax_code && i.taxCode) attributes.product_tax_code = [{ value: i.taxCode, marketplace_id: MARKETPLACE_ID }];
  attributes.skip_offer = [{ value: false, marketplace_id: MARKETPLACE_ID }];
  attributes.fulfillment_availability = [{ fulfillment_channel_code: 'DEFAULT', quantity: i.quantity }];
  return attributes;
}
// Dry run for one SKU (mode "relistpreview:<SKU>"): builds the relist exactly like the robot and asks
// Amazon to VALIDATE it. Nothing is created or deleted. Result in spapiSnapshots/<account>_debug.
async function relistPreview(sku) {
  const sellerId = process.env.SPAPI_SELLER_ID;
  await loadSnapshot();
  const i = SNAP.inventory[`${ACCOUNT_LABEL}_${sku}`];
  if (!i) throw new Error('SKU not in the snapshot: ' + sku);
  const old = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku },
    query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes', 'summaries', 'issues'] } });
  const sum = (old.summaries || [])[0] || {}, newSku = relistNewSku(sku) || sku + '-R1';
  const attributes = relistAttributes(old.attributes || {}, i);
  const pre = await spClient.callAPI({ operation: 'putListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' }, path: { sellerId, sku: newSku },
    query: { marketplaceIds: [MARKETPLACE_ID], mode: 'VALIDATION_PREVIEW' }, body: { productType: sum.productType, requirements: 'LISTING_OFFER_ONLY', attributes } });
  console.log('Relist preview', sku, '->', newSku, JSON.stringify(pre).slice(0, 2000));
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_debug`).set({ sku, at: Date.now(), preview: JSON.stringify(pre).slice(0, 5000), sent: JSON.stringify(attributes).slice(0, 5000),
    oldStatus: JSON.stringify(sum.status || []), oldIssues: JSON.stringify(old.issues || []).slice(0, 3000) });
}
function relistNewSku(sku) {
  const m = /^(.*)-R(\d{1,3})$/.exec(sku), base = (m ? m[1] : sku), n0 = m ? +m[2] : 0;
  for (let n = n0 + 1; n < n0 + 50; n++) {
    const suf = `-R${n}`, cand = base.slice(0, 40 - suf.length) + suf;
    if (!reportSkus.has(cand)) return cand;
  }
  return null;
}
async function runRelistRobot(sellerId) {
  // Note: Amazon takes ~2 hours to make a new offer live (shows "Missing Offer" until then) - the 3-day rest covers it.
  if (String(process.env.RELIST_ROBOT || '').toLowerCase() === 'off') { console.log('Relist robot: switched off (RELIST_ROBOT=off).'); return; }
  if (!sellerId) { console.log('Relist robot skipped: SPAPI_SELLER_ID not set.'); return; }
  if (!inventoryFresh || !relistFresh.size) { console.log('Relist robot skipped: listings report or competitor offers not read this run.'); return; }
  const stRef = db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_relistState`);
  const st = Object.assign({ streak: {}, cool: {} }, (await stRef.get()).data() || {});
  if (st.ver !== 9) { st.cool = {}; st.ver = 9; }   // v9 (21 Oct 2026): price-blocked listings now relisted - re-check all now   // v7 (21 Oct 2026): hidden-but-buyable listings relisted, blocked prices fixed with min limit - re-check all now   // v6 (20 Oct 2026): live-but-not-selling listings are now relisted too - re-check them
  const now = Date.now();
  if (!st.rel) {    // first run with the relist cap: count this week's relists from the log
    st.rel = {};
    try {
      const q = await dbMain.collection('spapiRelistLog').where('at', '>', now - 7 * 864e5).get();
      q.forEach((d) => { const x = d.data(); if (x.account === ACCOUNT_LABEL && /^relisted/.test(x.status || '') && x.asin) (st.rel[x.asin] = st.rel[x.asin] || []).push(x.at); });
    } catch (e) { console.warn('relist history not loaded:', e.message || e); }
  }
  if (!st.pfix) {   // first run with this rule: price fixes already done in the last 24 h count as tried
    st.pfix = {};
    try {
      const q = await dbMain.collection('spapiRelistLog').where('at', '>', now - 864e5).get();
      q.forEach((d) => { const x = d.data(); if (x.account === ACCOUNT_LABEL && x.status === 'price_fixed' && x.asin) st.pfix[x.asin] = Math.min(st.pfix[x.asin] || Infinity, x.at); });
      console.log(`Relist robot: ${Object.keys(st.pfix).length} listing(s) already had a price fix today.`);
    } catch (e) { console.warn('price-fix history not loaded:', e.message || e); }
  }
  const inv = Object.values(SNAP.inventory).filter((i) => i && i.account === ACCOUNT_LABEL && i.sku && i.asin && reportSkus.has(i.sku));
  const eligible = inv.filter((i) => (i.fulfillmentChannel || 'DEFAULT') === 'DEFAULT' && (i.quantity || 0) > 0 && i.price > 0);
  const checked = eligible.filter((i) => relistFresh.has(i.asin));
  const isNot = (i) => { const o = relistFresh.get(i.asin) || []; return o.length > 0 && !o.some((x) => x.isMine) && !pricedOut(i, o); };
  const notSelling = checked.filter(isNot);
  console.log(`Relist robot: ${eligible.length} in-stock self-ship listings, ${checked.length} with fresh offers, ${notSelling.length} not selling.`);
  const breaker = checked.length >= 10 && notSelling.length / checked.length >= RELIST_BREAKER;
  if (breaker) console.warn(`Relist robot: "Not selling" relists STOPPED - ${notSelling.length} of ${checked.length} look not selling (account or Amazon problem).`);
  const streak = {};
  notSelling.forEach((i) => { streak[i.sku] = (st.streak[i.sku] || 0) + 1; });
  const resting = (i) => st.cool[i.asin] && now < st.cool[i.asin];
  const ready = (breaker ? [] : notSelling.filter((i) => streak[i.sku] >= RELIST_STREAK && !resting(i)))
    .slice(0, RELIST_MAX_PER_RUN).map((i) => ({ i, reason: 'not_selling', minAge: 3 / 24 }));   // a SKU under 3 h old is still going live - not judged yet
  // Sales rules (owner, 20 Oct 2026), from this account's orders of the last 90 days:
  //   Rule 1: sold regularly (4+ orders in days 7-37) but no order in the last 7 days -> relist (listing must be 7+ days old)
  //   Rule 3: no order in the last 30 days -> relist with the same price (listing must be 30+ days old)
  const sales = salesByAsin(), taken = new Set(ready.map((x) => x.i.asin));
  const rule1 = [], rule3 = [];
  if (RELIST_SALES_RULES) eligible.forEach((i) => {
    if (taken.has(i.asin) || resting(i)) return;
    const s2 = sales[i.asin] || { last: Infinity, mid: 0 };
    if (s2.last >= 7 && s2.mid >= 4) rule1.push({ i, reason: 'sales_stopped_7d', minAge: 7, last: s2.last });
    else if (s2.last >= 30) rule3.push({ i, reason: 'no_sales_30d', minAge: 30, last: s2.last });
  });
  rule3.sort((a, b) => b.last - a.last);
  const salesReady = rule1.concat(rule3).slice(0, RELIST_SALES_MAX_PER_RUN);
  ready.push(...salesReady);
  console.log(`Relist robot: ${ready.length - salesReady.length} not-selling ready; sales rules: ${rule1.length} stopped selling (7 days), ${rule3.length} no sale 30+ days -> ${salesReady.length} this run.`);
  const log = (i, rec) => {
    const doc = { account: ACCOUNT_LABEL, asin: i.asin, name: i.name || '', oldSku: i.sku, price: i.price, mrp: i.mrp || null, qty: i.quantity, at: Date.now(), ...rec };
    snapPatch('pricing', `${ACCOUNT_LABEL}_${i.asin}`, { relist: doc });
    return dbMain.collection('spapiRelistLog').doc(`${ACCOUNT_LABEL}_${i.asin}_${doc.at}`).set(doc).catch((e) => console.warn('relist log', e.message || e));
  };
  for (const job of ready) {
    const i = job.i, oldSku = i.sku, asin = i.asin, reason = job.reason;
    let oldWhy = null;
    try {
      const old = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku: oldSku },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes', 'summaries', 'issues'] } });
      const sum = (old.summaries || [])[0] || {}, status = (sum.status || []).map(String);
      if (job.minAge && sum.createdDate && now - Date.parse(sum.createdDate) < job.minAge * 864e5) {
        // too new to judge by sales (e.g. a SKU the robot created) - check again once it is old enough
        st.cool[asin] = Date.parse(sum.createdDate) + job.minAge * 864e5; continue;
      }
      oldWhy = (old.issues || []).filter((x) => (x.severity || '').toUpperCase() === 'ERROR').map((x) => x.message).filter(Boolean).join(' | ').slice(0, 400) || null;
      // Suppressed by Amazon for its price: a relist at the same price is suppressed again - show the reason instead.
      // 21 Oct 2026: price fixes did NOT clear "below your minimum price threshold" (18155) even after 5+ h with no
      // min price left on the listing, while relists came back live ~90% of the time. So: fix the price once; if the
      // listing is still blocked at the next check, relist it as a new SKU at the fixed price (no old price limits).
      st.pfix = st.pfix || {};
      const priceBlocked = (old.issues || []).some((x) => (x.severity || '').toUpperCase() === 'ERROR' && (x.categories || []).includes('INVALID_PRICE'));
      const fixTriedAt = st.pfix[asin];
      if (priceBlocked && fixTriedAt && now - fixTriedAt > 2 * 3600e3) {
        console.log(`Relist ${oldSku}: still blocked for its price ${Math.round((now - fixTriedAt) / 36e5)} h after the price fix - relisting as a new SKU at Rs ${i.price}.`);
        delete st.pfix[asin];
      } else if (priceBlocked) {
        console.log(`Relist ${oldSku}: Amazon suppressed it for its price (${oldWhy}) - not relisted at the same price.`);
        st.cool[asin] = now + RELIST_COOLDOWN_FAIL; delete streak[oldSku];
        const fx = await fixSuppressedPrice(sellerId, i, old, sum.productType || await productTypeFor(sellerId, oldSku), oldWhy).catch((e) => ({ done: false, note: 'Price change failed: ' + (e.message || e) }));
        if (fx.done) { st.pfix[asin] = now; i.price = fx.price; }
        await log(i, fx.done ? { status: 'price_fixed', reason, why: oldWhy, newPrice: fx.price, basis: fx.basis, floor: fx.floor }
          : { status: 'price_issue', why: oldWhy, fixNote: fx.note || null });
        continue;
      }
      // Only skip what a new SKU can never fix: brand/category approval needed, or Transparency-protected.
      // (Catalogue warnings like "Search Terms occurs 5 times" did NOT stop new offers going live - seen 20 Oct 2026.)
      let restricted = null;
      try {
        const rr = await spClient.callAPI({ operation: 'getListingsRestrictions', endpoint: 'listingsRestrictions',
          query: { asin, sellerId, marketplaceIds: [MARKETPLACE_ID], conditionType: 'new_new' } });
        restricted = (rr.restrictions || []).flatMap((x) => (x.reasons || []).map((y) => y.message || y.reasonCode)).filter(Boolean).join(' | ') || null;
      } catch (e) { console.warn(`Restriction check failed for ${asin}:`, e.message || e); }
      const transparency = (old.issues || []).find((x) => /transparency/i.test(x.message || ''));
      if (restricted || transparency) {
        oldWhy = restricted || transparency.message.slice(0, 300);
        console.log(`Relist ${oldSku}: cannot sell this ASIN (${oldWhy}) - not relisted.`);
        st.cool[asin] = now + RELIST_COOLDOWN_BLOCKED; delete streak[oldSku];
        await log(i, { status: 'blocked', why: oldWhy });
        continue;
      }
      const soldToday = ((salesByAsin()[asin] || {}).last ?? Infinity) < 1;   // 21 Oct: was 7 days - kept 8 hidden listings unsold; relists came back live 75 of 83 times
      if (reason === 'not_selling' && status.includes('BUYABLE') && soldToday) {
        // Amazon says it is live AND it had an order in the last 24 hours - it is selling, keep it (re-check in 3 h).
        console.log(`Relist ${oldSku}: Amazon says BUYABLE and it sold in the last 24 hours - not relisted.`);
        st.cool[asin] = now + RELIST_COOLDOWN_OK; delete streak[oldSku];   // re-check in 3 h
        await log(i, { status: 'buyable', why: 'Amazon shows this listing as buyable and it sold in the last 24 hours; your offer is just not among the offers Amazon lists (cheaper sellers ahead).' });
        continue;
      }
      // Account safety (owner, 21 Oct 2026): at most RELIST_CAP_WEEK relists per ASIN in 7 days. Endless
      // delete-and-relist churn on one ASIN can look like listing manipulation to Amazon - hand it to the owner instead.
      st.rel = st.rel || {};
      const recent = (st.rel[asin] || []).filter((t) => now - t < 7 * 864e5);
      if (recent.length >= RELIST_CAP_WEEK) {
        console.log(`Relist ${oldSku}: already relisted ${recent.length} times in 7 days - not relisted again (needs a manual check).`);
        st.cool[asin] = now + RELIST_COOLDOWN_BLOCKED; delete streak[oldSku];
        await log(i, { status: 'failed', reason, error: `Relisted ${recent.length} times this week and still hidden. The robot stops here to keep the account safe - check this listing in Seller Central (Inventory → Fix stranded / suppressed).` });
        continue;
      }
      const productType = sum.productType || await productTypeFor(sellerId, oldSku);
      if (!productType) throw new Error('Product type unknown for the old SKU.');
      const newSku = relistNewSku(oldSku);
      if (!newSku) throw new Error('Could not make a free new SKU name.');
      if (!i.mrp && !(((old.attributes || {}).purchasable_offer || [])[0] || {}).maximum_retail_price) {
        const mm = await knownMrp(i);   // Amazon India rejects an offer without MRP (33-5PE9, 21 Oct 2026)
        if (mm) i.mrp = mm;
        else { st.cool[asin] = now + RELIST_COOLDOWN_FAIL; await log(i, { status: 'failed', reason, error: 'No MRP on this listing and none in LOTS / vendor mapping. Add the MRP on the Amazon page (MRP box → Push), then the robot relists it.' }); continue; }
      }
      const oa = old.attributes || {}, attributes = relistAttributes(oa, i);
      const why = (old.issues || []).filter((x) => (x.severity || '').toUpperCase() === 'ERROR').map((x) => x.message).filter(Boolean).join(' | ').slice(0, 400);
      const put = (mode) => spClient.callAPI({ operation: 'putListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' }, path: { sellerId, sku: newSku },
        query: Object.assign({ marketplaceIds: [MARKETPLACE_ID] }, mode ? { mode } : {}),
        body: { productType, requirements: 'LISTING_OFFER_ONLY', attributes } });
      // 1) dry run: Amazon checks everything, nothing is created
      let pre = await put('VALIDATION_PREVIEW');
      const missing = ((pre.issues || []).filter((x) => (x.severity || '').toUpperCase() === 'ERROR').flatMap((x) => x.attributeNames || []))
        .filter((k) => oa[k] && !attributes[k]);
      if (missing.length) { missing.forEach((k) => { attributes[k] = oa[k]; }); pre = await put('VALIDATION_PREVIEW'); }
      assertListingsOk(pre);
      // 2) real listing
      assertListingsOk(await put(null));
      console.log(`Relist [${reason}] ${oldSku} -> ${newSku} (ASIN ${asin}) at Rs ${i.price}, MRP ${i.mrp || '-'}, qty ${i.quantity}: ACCEPTED`);
      // 3) delete the old SKU only now
      let delErr = null;
      try {
        await spClient.callAPI({ operation: 'deleteListingsItem', endpoint: 'listingsItems', path: { sellerId, sku: oldSku }, query: { marketplaceIds: [MARKETPLACE_ID] } });
        await db.collection('spapiDeletedListings').doc(`${ACCOUNT_LABEL}_${oldSku}_${Date.now()}`).set({ account: ACCOUNT_LABEL, sku: oldSku, name: i.name || null, asin,
          price: i.price, quantity: i.quantity, reason: 'relist', newSku, deletedAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch (e) { delErr = e.message || String(e); console.warn(`Relist: old SKU ${oldSku} NOT deleted:`, delErr); }
      // 4) keep a hand-entered cost on the new SKU
      try {
        const mc = await dbMain.collection('aikm_admin').doc('spapiManualCosts').get(), c = mc.exists && (mc.data().costs || {})[oldSku];
        if (c != null) await dbMain.collection('aikm_admin').doc('spapiManualCosts').set({ costs: { [newSku]: c } }, { merge: true });
      } catch (e) { console.warn('relist manual cost copy', e.message || e); }
      st.cool[asin] = now + RELIST_COOLDOWN_OK; delete streak[oldSku];
      st.rel = st.rel || {}; st.rel[asin] = (st.rel[asin] || []).filter((t) => now - t < 7 * 864e5).concat([now]);
      await log(i, { status: delErr ? 'relisted_old_not_deleted' : 'relisted', reason, newSku, error: delErr, why });
    } catch (e) {
      const error = e.message || String(e);
      if (/not found/i.test(error) && !oldWhy) {
        // The SKU was removed on Amazon (Seller Central / another tool); the listings report can lag a few hours.
        console.log(`Relist ${oldSku}: SKU no longer exists on Amazon - nothing to relist.`);
        st.cool[asin] = now + RELIST_COOLDOWN_OK; delete streak[oldSku];
        await log(i, { status: 'gone', error });
        continue;
      }
      console.warn(`Relist FAILED for ${oldSku} (ASIN ${asin}):`, error);
      st.cool[asin] = now + RELIST_COOLDOWN_FAIL; delete streak[oldSku];
      await log(i, { status: 'failed', reason, error, why: oldWhy });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Buy Box pricer: lower to win (any gap, Rs 5+ profit) and raise when we hold the Buy Box
  st.bbCool = st.bbCool || {}; st.learn = st.learn || {};
  await runBuyBoxPricer(sellerId, eligible, st, log).catch((e) => console.warn('Buy Box pricer skipped:', e.message || e));
  Object.keys(st.cool).forEach((a) => { if (st.cool[a] < now) delete st.cool[a]; });
  Object.keys(st.bbCool).forEach((a) => { if (st.bbCool[a] < now) delete st.bbCool[a]; });
  pruneLearn(st.learn);
  Object.keys(st.pfix || {}).forEach((a) => { if (now - st.pfix[a] > 3 * 864e5) delete st.pfix[a]; });
  await stRef.set({ streak, cool: st.cool, bbCool: st.bbCool, learn: st.learn, pfix: st.pfix || {}, rel: st.rel || {}, ver: 9, lastRun: now, stopped: breaker ? `${notSelling.length}/${checked.length} not selling` : null });
}

// Orders per ASIN for this account (snapshot, last 90 days): days since the last order, and orders in days 7-37.
function salesByAsin() {
  const out = {}, now = Date.now();
  Object.values(SNAP.orders).forEach((o) => {
    if (!o || o.isCanceled || /^(pending|cancel)/i.test(o.status || '') || !o.purchaseDate) return;
    const age = (now - Date.parse(o.purchaseDate)) / 864e5;
    (o.items || []).forEach((it) => {
      if (!it || !it.asin) return;
      const s = out[it.asin] || (out[it.asin] = { last: Infinity, mid: 0 });
      s.last = Math.min(s.last, age);
      if (age >= 7 && age < 37) s.mid++;
    });
  });
  return out;
}

// ── No-loss floor: cost + Amazon fees + shipping + Rs 1 (same fee rules as the profit column on the Amazon page) ──
const REF_FEE = { LAUNDRY_DETERGENT: 8, CLEANING_AGENT: 8, TOOTH_CLEANING_AGENT: 8, MOUTHWASH: 8, DEODORANT: 7, SHAMPOO: 8, BODY_WASH: 8,
  HAIR_CONDITIONER: 8, AIR_FRESHENER: 8, CONDOM: 2, SQUEEGEE: 12, DEFAULT: 8 };   // % above Rs 1000, 0% below
function easyShipFee(kg) { const n = Math.max(Number(kg) || 0.5, 0.5); return n <= 0.5 ? 55 : n <= 1 ? 75 : n <= 2 ? 112 : n <= 5 ? 112 + 34 * Math.ceil(n - 2) : 214 + 18 * Math.ceil(n - 5); }
function closingFee(p) { return p <= 300 ? 2 : p <= 500 ? 23 : p <= 1000 ? 48 : 79; }
// TRUE profit per order (21 Oct 2026, from live data):
//   customer pays a shipping charge (~Rs 74-80) on top of the price -> we count 85% of it as income;
//   Sasta Store ships itself via NimbusPost (real cost ~Rs 33, Rs 40 used, +Rs 30 per extra kg);
//   Praso ships mostly Easy Ship -> Amazon's Easy Ship weight fee. Rs 3 per order kept aside for returns (RTO ~3%).
const SELF_SHIP_ACCOUNTS = new Set(['sastastore']);
// Owner, 21 Oct 2026: reseller of branded goods - margin comes mostly from the shipping charge.
// (21 Oct: Rs 15 minimum / Rs 20 target; 24 Oct: Rs 5; 24 Oct later: Rs 15 OR 10% of price - see profitOk.)
// Owner, 24 Oct 2026: "maximum Buy Box with profit, never a loss - more Buy Boxes bring more sales".
// TARGET_PROFIT is only a label now (was the loss-guard target).
const MIN_PROFIT = 5, TARGET_PROFIT = 20;
// Owner, 24 Oct 2026 (later the same day): "minimum 15 per order or 10% profit per order".
// An order price is OK when its profit is at least Rs 15 OR at least 10% of the order value (price + the shipping
// charge the buyer pays) - whichever is lower, so cheap items can still win the Buy Box at 10%, never at a loss.
// Also never below the product's own cost (owner sees that as a loss even when the shipping charge covers it).
// (MIN_PROFIT above is no longer the floor; it stays only for old log wording.)
const FLOOR_RS = 15, FLOOR_PCT = 0.10;
const RULE_TXT = `₹${FLOOR_RS} or ${FLOOR_PCT * 100}%`;
function minProfitAt(price, ship) { return Math.min(FLOOR_RS, FLOOR_PCT * ((Number(price) || 0) + (Number(ship) || 0))); }
function profitOk(i, cost, price, ship) {
  const sh = ship == null ? myShipCharge(i) : ship;
  return orderProfit(i, cost, price, sh) >= minProfitAt(price, sh) - 1e-9;
}
// lowest price whose profit meets the rule (null if none up to the limit) - never below the product's own cost
function floorPrice(i, cost, ship, limit) {
  const lim = limit || cost * 4 + 500;
  for (let p = Math.max(1, Math.ceil(cost)); p <= lim; p++) if (profitOk(i, cost, p, ship)) return p;
  return null;
}
function priceOk(i, cost, price, ship) { return price >= cost && profitOk(i, cost, price, ship); }
function courierCost(kg) { const n = Math.max(Number(kg) || 0.5, 0.5); return n <= 1 ? 40 : 40 + 30 * Math.ceil(n - 1); }
function shipCostFor(i) { return SELF_SHIP_ACCOUNTS.has(ACCOUNT_LABEL) ? courierCost(i.weightKg) : Math.max(easyShipFee(i.weightKg), 45); }
function myShipCharge(i) { const m = (relistFresh.get(i.asin) || []).find((o) => o.isMine); return m && m.shipping != null ? Number(m.shipping) : (SELF_SHIP_ACCOUNTS.has(ACCOUNT_LABEL) ? 74 : 80); }
// Amazon's OWN fee estimate per SKU (Product Fees API, refreshed weekly) beats our fee tables: the 0% referral
// fee under Rs 1000 covers most categories but not all, and closing fees changed on 7 Sep 2026.
// FEES[sku] = { p: price estimated at, r: referral %, c: closing fee, at }
let FEES = {};
function feeFor(i, price) {
  const f = FEES[i.sku];
  const slab = (x) => (x <= 300 ? 0 : x <= 500 ? 1 : x <= 1000 ? 2 : 3);
  const ref = f && f.r != null ? price * f.r / 100 : (price > 1000 ? price * (REF_FEE[i.amazonProductType] || REF_FEE.DEFAULT) / 100 : 0);
  const close = f && f.c != null && slab(f.p) === slab(price) ? f.c : closingFee(price);
  return ref + close;
}
// GST (owner, 21 Oct 2026): the selling price includes GST; with input credit on the purchase, the GST we pay
// is on the margin only = rate/(1+rate) x (price - cost). The 85% on the shipping charge already leaves out its GST.
function gstRate(i) { const r = TAX_CODE_RATE[i.taxCode]; return r != null ? r : (Number(i.taxPercent) > 0 ? Number(i.taxPercent) : 5); }
function gstOnMargin(i, cost, price) { const r = gstRate(i) / 100; return r > 0 ? (price - cost) * r / (1 + r) : 0; }
function orderProfit(i, cost, price, ship = myShipCharge(i)) {
  return Math.round((price + 0.85 * (ship || 0) - cost - shipCostFor(i) - feeFor(i, price) - gstOnMargin(i, cost, price) - 3) * 100) / 100;
}
async function loadFees() {
  try { const d = await dbMain.collection('aikm_admin').doc(`spapiFees_${ACCOUNT_LABEL}`).get(); FEES = (d.exists && d.data().fees) || {}; }
  catch (e) { FEES = {}; console.warn('Fee estimates not loaded:', e.message || e); }
  console.log(`Amazon fee estimates loaded for ${Object.keys(FEES).length} SKUs.`);
}
// Ask Amazon for its fee estimate (20 SKUs per call, ~200 per full sync); refresh after 7 days or a 15%+ price move.
async function refreshFeeEstimates() {
  const now = Date.now();
  const todo = Object.values(SNAP.inventory).filter((i) => i && i.account === ACCOUNT_LABEL && i.sku && i.price > 0 && (i.quantity || 0) > 0
    && (i.fulfillmentChannel || 'DEFAULT') === 'DEFAULT')
    .filter((i) => { const f = FEES[i.sku]; return !f || now - (f.at || 0) > 7 * 864e5 || Math.abs(i.price - f.p) / f.p > 0.15; })
    .slice(0, 200);
  if (!todo.length) { console.log('Fee estimates: all fresh.'); return; }
  let got = 0;
  for (let k = 0; k < todo.length; k += 20) {
    const part = todo.slice(k, k + 20);
    try {
      const res = await spClient.callAPI({ operation: 'getMyFeesEstimates', endpoint: 'productFees',
        body: part.map((i) => ({ IdType: 'SellerSKU', IdValue: i.sku, FeesEstimateRequest: { MarketplaceId: MARKETPLACE_ID, IsAmazonFulfilled: false,
          Identifier: i.sku, PriceToEstimateFees: { ListingPrice: { CurrencyCode: 'INR', Amount: i.price } } } })) });
      (Array.isArray(res) ? res : (res.payload || [])).forEach((r) => {
        const sku = r.FeesEstimateIdentifier && r.FeesEstimateIdentifier.IdValue, list = r.FeesEstimate && r.FeesEstimate.FeeDetailList;
        if (!sku || r.Status !== 'Success' || !list) return;
        const it = part.find((x) => x.sku === sku); if (!it) return;
        const amt = (t) => list.filter((x) => t.test(x.FeeType || '')).reduce((a, x) => a + (Number(x.FeeAmount && x.FeeAmount.Amount) || 0), 0);
        FEES[sku] = { p: it.price, r: Math.round(amt(/Referral/i) / it.price * 10000) / 100, c: Math.round(amt(/Closing/i) * 100) / 100, at: now };
        got++;
      });
      if (!k) console.log('Sample fee estimate:', JSON.stringify(res).slice(0, 600));
    } catch (e) { console.warn('Fee estimate call failed:', e.message || e); }
    await new Promise((r) => setTimeout(r, 2200));
  }
  Object.keys(FEES).forEach((sku) => { if (now - (FEES[sku].at || 0) > 60 * 864e5) delete FEES[sku]; });
  await dbMain.collection('aikm_admin').doc(`spapiFees_${ACCOUNT_LABEL}`).set({ fees: FEES, updatedAt: now });
  console.log(`Fee estimates: ${got} of ${todo.length} refreshed from Amazon (${Object.keys(FEES).length} stored).`);
}
// lowest price that meets the profit rule (Rs 15 or 10% of price)
function noLossFloor(i, cost, price, ship = myShipCharge(i)) {
  return floorPrice(i, cost, ship, Math.max(price * 4, cost * 4) + 500) || Math.ceil(price - orderProfit(i, cost, price, ship) + FLOOR_RS);
}
const OUR_SELLER_IDS = new Set(['AI66SST976WPS', 'A1KF1CBHR5UA1W', process.env.SPAPI_SELLER_ID].filter(Boolean));
const BB_MAX_PER_RUN = 80, BB_MAX_RAISE_PER_RUN = 30, BB_MAX_CUT = 0.3, BB_MAX_RAISE = 0.2, BB_COOL_MS = 2 * 3600e3;   // re-check each price every 2 h for maximum Buy Box
// Owner, 24 Oct 2026: sales dipped after the robot started raising prices while holding the Buy Box (20 Oct evening:
// ~30 raises per run, up to +20% each; Sasta Store Buy Boxes 306 -> 241). Raising while holding is now OFF unless
// the workflow sets BB_RAISE=on. Raised listings that then lost the Buy Box go back to their price before the raise.
const BB_RAISE_ON = String(process.env.BB_RAISE || '').toLowerCase() === 'on';
const RAISE_UNDO_FROM = Date.parse('2026-10-20T12:00:00Z'), RAISE_UNDO_PER_RUN = 40;
async function setOfferPrice(sellerId, i, old, productType, price) {
  const po = JSON.parse(JSON.stringify(((old.attributes || {}).purchasable_offer || [])[0] || {}));
  delete po.start_at; delete po.end_at;
  ['discounted_price', 'quantity_discount_plan'].forEach((k) => delete po[k]);
  fitPriceLimits(po, price, Number(i.mrp) || null);
  Object.assign(po, { marketplace_id: MARKETPLACE_ID, currency: po.currency || 'INR', audience: po.audience || 'ALL', our_price: [{ schedule: [{ value_with_tax: price }] }] });
  if (!po.maximum_retail_price && i.mrp) po.maximum_retail_price = [{ schedule: [{ value_with_tax: Number(i.mrp) }] }];
  const call = (mode) => spClient.callAPI({ operation: 'patchListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' }, path: { sellerId, sku: i.sku },
    query: Object.assign({ marketplaceIds: [MARKETPLACE_ID] }, mode ? { mode } : {}),
    body: { productType, patches: [{ op: 'replace', path: '/attributes/purchasable_offer', value: [po] }] } });
  assertListingsOk(await call('VALIDATION_PREVIEW'));
  assertListingsOk(await call(null));
  snapPatch('inventory', `${ACCOUNT_LABEL}_${i.sku}`, { price });
  // Amazon decides later - record it so verifyPricePushes confirms it went live (or shows Amazon's reason).
  // Robot records live in the SP-API Firebase (not the console's) - the console never shows them, and keeping
  // them out of the console database saves its free daily reads (they were re-read on every sync).
  await db.collection('spapiPriceUpdates').doc(`robot_${ACCOUNT_LABEL}_${i.sku}`).set({ account: ACCOUNT_LABEL, sku: i.sku, asin: i.asin || null,
    oldPrice: i.price ?? null, newPrice: price, status: 'applied', verified: false, checks: 0, source: 'robot',
    appliedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
}
// Amazon refuses a selling price outside the listing's own min / max price setting (error 19038) and keeps the
// old price. Widen the limits so the new price fits: max -> MRP (or the new price), min -> the new price.
function fitPriceLimits(po, price, mrp) {
  const sv = (k) => Number((((po[k] || [])[0] || {}).schedule || [])[0]?.value_with_tax) || null;
  const curMax = sv('maximum_seller_allowed_price'), curMin = sv('minimum_seller_allowed_price');
  if (curMax && price > curMax) po.maximum_seller_allowed_price = [{ schedule: [{ value_with_tax: mrp && mrp >= price ? mrp : price }] }];
  if (curMin && price < curMin) po.minimum_seller_allowed_price = [{ schedule: [{ value_with_tax: price }] }];
}
// Prices you set yourself (Loss Orders / Self-Ship / Amazon page) in the last 7 days - the robot never lowers these.
const MANUAL_HOLD_MS = 7 * 864e5;
async function loadManualPrices() {
  const out = new Map();
  const snaps = await Promise.all([db, dbMain].map((d) => d.collection('spapiPriceUpdates').where('account', '==', ACCOUNT_LABEL).get().catch(() => null)));
  snaps.forEach((sn) => sn && sn.docs.forEach((d) => { const x = d.data(); if (x.source === 'robot' || !x.sku) return;
    const t = ['appliedAt', 'requestedAt'].map((k) => (x[k] && x[k].toMillis ? x[k].toMillis() : 0)).reduce((a, b) => Math.max(a, b), 0);
    if ((x.status === 'applied' || x.status === 'pending') && Date.now() - t < MANUAL_HOLD_MS) out.set(x.sku, { price: x.newPrice, at: t }); }));
  return out;
}
async function runBuyBoxPricer(sellerId, eligible, st, log) {
  // Owner, 24 Oct 2026: win the Buy Box at ANY gap as long as each order still earns Rs 15 or 10% of the price,
  // never lower a price the owner set himself in the last 7 days, and lift prices under that rule just up to it.
  // and raise the price when we hold the Buy Box and the next seller is Rs 3+ above us.
  const now = Date.now(), L = (o) => (o.price || 0) + (o.shipping || 0), lower = [], raise = [];
  for (const i of eligible) {
    if (st.bbCool[i.sku] > now) continue;
    const offers = relistFresh.get(i.asin) || [], win = offers.find((o) => o.isBuyBoxWinner);
    let mine = offers.find((o) => o.isMine);
    if (!mine && pricedOut(i, offers)) mine = { price: i.price, shipping: myShipCharge(i), isMine: true };   // hidden behind 20 cheaper offers
    if (!mine || !win) continue;
    if (win.isMine) {
      const next = offers.filter((o) => !o.isMine && !OUR_SELLER_IDS.has(o.sellerId) && o.price > 0).sort((x, y) => L(x) - L(y))[0];
      if (next) raise.push({ i, mine, next });
    } else if (!OUR_SELLER_IDS.has(win.sellerId)) {
      const gap = Math.round((L(mine) - L(win)) * 100) / 100;
      if (gap > 0) lower.push({ i, mine, win, gap });
    }
  }
  const mem = (sku) => st.learn[sku] || {};
  const units30 = unitsByAsin(30);
  // most-selling products first (runs are capped)
  lower.sort((a, b) => (units30[b.i.asin] || 0) - (units30[a.i.asin] || 0));
  raise.sort((a, b) => (units30[b.i.asin] || 0) - (units30[a.i.asin] || 0));
  console.log(`Buy Box pricer: ${lower.length} lost on price, ${raise.length} held (raise check).`);
  let lowered = 0, raised = 0, skipped = 0, guarded = 0;
  const manual = await loadManualPrices().catch(() => new Map());
  // ── FORECAST (owner, 24 Oct 2026: "how many Buy Boxes will I get"): every listing that lost on price, sorted by why ──
  try {
    const fc = { win: 0, rule: 0, costOnly: 0, cut: 0, nocost: 0, owner: 0 };
    for (const { i, mine, win } of lower) {
      if (manual.has(i.sku)) { fc.owner++; continue; }
      const kc = await knownCost(i).catch(() => null); if (!kc) { fc.nocost++; continue; }
      const ship = Number(mine.shipping) || 0, target = Math.floor(L(win) - 1 - ship);
      if (!priceOk(i, kc.cost, target, ship)) { fc.rule++; if (profitOk(i, kc.cost, target, ship)) fc.costOnly++; }
      else if (target < i.price * (1 - BB_MAX_CUT)) fc.cut++;
      else fc.win++;
    }
    const msg = `Buy Box forecast (listings checked this run): holding ${raise.length} · ${lower.length} lost on price -> ${fc.win} can be won within ${RULE_TXT} (robot cuts up to ${BB_MAX_PER_RUN} per run), ` +
      `${fc.rule} only below ${RULE_TXT} / cost (kept; ${fc.costOnly} of them meet the profit rule but would sell under cost), ${fc.cut} need a cut over ${BB_MAX_CUT * 100}% (check cost), ${fc.nocost} have no cost (map them), ${fc.owner} your own price · possible ${raise.length + fc.win}.`;
    console.log(msg);
    const att = await buildAttentionLists(units30).catch((e) => { console.warn('Attention lists skipped:', e.message || e); return null; });
    await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_bbForecast`).set({ at: Date.now(), held: raise.length, lostOnPrice: lower.length, ...fc, possible: raise.length + fc.win, ruleText: RULE_TXT,
      ...(att || {}) }).catch((e) => console.warn('Forecast not saved:', e.message || e));
  } catch (e) { console.warn('Buy Box forecast skipped:', e.message || e); }
  const patchPrice = async (i, target) => {
    const old = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku: i.sku },
      query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes', 'summaries'] } });
    const productType = ((old.summaries || [])[0] || {}).productType || await productTypeFor(sellerId, i.sku);
    await setOfferPrice(sellerId, i, old, productType, target);
  };
  // ── UNDO: robot raises (since 20 Oct) that lost the Buy Box go back to the price before the raise ──
  await undoLostRaises(eligible, st, log, patchPrice, manual).catch((e) => console.warn('Raise undo skipped:', e.message || e));
  // ── LEARNING: judge earlier price changes on real sales before making new ones ──
  await learnFromChanges(sellerId, eligible, st, log, patchPrice).catch((e) => console.warn('Robot learning skipped:', e.message || e));

  // LOSS GUARD (owner, 21 Oct 2026: "make the business profitable"): a listing whose current price earns under
  // the rule (Rs 15 or 10%) is moved up to the lowest price that meets it - never above MRP, never more than +30% in one step.
  const guardDone = new Set();
  for (const i of eligible) {
    if (guarded >= BB_MAX_RAISE_PER_RUN) break;
    if (st.bbCool[i.sku] > now || manual.has(i.sku)) continue;
    const kc = await knownCost(i).catch(() => null); if (!kc) continue;
    const ship = myShipCharge(i), profit = orderProfit(i, kc.cost, i.price, ship);
    if (profitOk(i, kc.cost, i.price, ship)) continue;   // profit rule met - never raise just because the price is under cost (shipping charge covers it)
    guardDone.add(i.sku); st.bbCool[i.sku] = now + BB_COOL_MS;
    // Search the real price (fees and GST change with price: closing fee jumps at Rs 300 / 500 / 1000).
    const mrp = Number(i.mrp) || Infinity, cap = Math.floor(Math.min(mrp, i.price * 1.3));
    let target = null, okMin = null;
    for (let pz = Math.ceil(i.price) + 1; pz <= cap; pz++) {
      const pf = orderProfit(i, kc.cost, pz, ship);
      if (pf >= minProfitAt(pz, ship)) { okMin = pz; break; }   // smallest raise that stops the loss - keeps the Buy Box chance
    }
    target = okMin;
    if (!target) { await log(i, { status: 'bb_skip', fixNote: `Sells at ₹${profit}/order. No price up to ₹${cap} (${cap === Math.floor(mrp) ? 'MRP' : '+30%'}) earns ${RULE_TXT}. Check the cost (${kc.src} ₹${kc.cost}) or stop selling it.` }); continue; }
    try {
      const was = i.price; await patchPrice(i, target); guarded++; noteChange(st, i, 'raise', target, was);
      const np = orderProfit(i, kc.cost, target, ship);
      console.log(`Loss guard RAISE ${i.sku}: Rs ${was} -> Rs ${target} (was Rs ${profit}/order, now Rs ${np})`);
      await log(i, { status: 'bb_raise', change: 'loss_guard', oldPrice: was, newPrice: target, profit: np, basis: `Was earning ₹${profit}/order (under the ${RULE_TXT} minimum) · cost ₹${kc.cost} (${kc.src}) · now ₹${np}/order` });
    } catch (e) { console.warn(`Loss guard FAILED for ${i.sku}:`, e.message || e); }
    await new Promise((r) => setTimeout(r, 800));
  }
  // Go through ALL listings that lost on price (best sellers first) and stop after BB_MAX_PER_RUN real price cuts -
  // before, only the first 80 were looked at, and when all 80 were unwinnable nothing was cut (24 Oct 2026).
  let examined = 0; const logSkip = (i, rec) => (examined <= BB_MAX_PER_RUN ? log(i, rec) : null);   // same number of log writes as before
  for (const { i, mine, win, gap } of lower.filter((x) => !guardDone.has(x.i.sku))) {
    if (lowered >= BB_MAX_PER_RUN) break;
    examined++;
    if (manual.has(i.sku)) { skipped++; await logSkip(i, { status: 'bb_skip', fixNote: `Buy Box lost by ₹${gap}. You set ₹${manual.get(i.sku).price} yourself - the robot leaves it for 7 days.` }); continue; }
    st.bbCool[i.sku] = now + BB_COOL_MS;
    try {
      const m = mem(i.sku);
      if (m.noLowerUntil > now) { skipped++; continue; }   // learned: cutting this one did not pay - resting
      if (m.warUntil > now) { skipped++; continue; }       // learned: price war - resting
      const kc = await knownCost(i), ship = Number(mine.shipping) || 0;
      if (!kc) { skipped++; await logSkip(i, { status: 'bb_skip', fixNote: `Buy Box lost by ₹${gap} - no cost known. Map it on the Amazon page so the robot can price it.` }); continue; }
      const target = Math.floor(L(win) - 1 - ship), profit = orderProfit(i, kc.cost, target, ship), floor = noLossFloor(i, kc.cost, target, ship);
      if (!priceOk(i, kc.cost, target, ship)) { skipped++; await logSkip(i, { status: 'bb_skip', fixNote: `Buy Box lost by ₹${gap}. Winning needs ₹${target}, which earns only ₹${profit} per order (minimum ${RULE_TXT}, lowest price allowed ₹${floor}). Price kept.` }); continue; }
      if (target < i.price * (1 - BB_MAX_CUT)) { skipped++; await logSkip(i, { status: 'bb_skip', fixNote: `Winning needs ₹${target}, a cut of over ${BB_MAX_CUT * 100}% from ₹${i.price}. Check the cost / competitor, then change it yourself.` }); continue; }
      const was = i.price; await patchPrice(i, target); lowered++; noteChange(st, i, 'lower', target, was);
      console.log(`Buy Box pricer LOWER ${i.sku}: Rs ${was} -> Rs ${target} (lost by Rs ${gap}, profit Rs ${profit}/order)`);
      await log(i, { status: 'bb_price', change: 'lower', oldPrice: was, newPrice: target, profit, floor, basis: `Buy Box ₹${Math.round(L(win))} incl. shipping · you were ₹${gap} higher · now ₹1 below · profit ₹${profit}/order${profit < TARGET_PROFIT ? ` (under ₹${TARGET_PROFIT} target, meets the ${RULE_TXT} minimum)` : ''}` });
    } catch (e) { console.warn(`Buy Box pricer FAILED for ${i.sku}:`, e.message || e); await logSkip(i, { status: 'bb_skip', fixNote: 'Price change failed: ' + (e.message || e) }); }
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!BB_RAISE_ON && raise.length) console.log(`Buy Box pricer: raising while holding the Buy Box is OFF (${raise.length} held listings keep their price).`);
  for (const { i, mine, next } of (BB_RAISE_ON ? raise : [])) {
    if (raised >= BB_MAX_RAISE_PER_RUN) break;
    if (guardDone.has(i.sku)) continue;
    const ship = Number(mine.shipping) || 0, mrp = Number(i.mrp) || Infinity;
    let target = Math.floor(L(next) - 1 - ship);
    target = Math.min(target, Math.floor(mrp), Math.floor(i.price * (1 + BB_MAX_RAISE)));
    const m = mem(i.sku);
    if (m.ceilUntil > now && m.ceil) target = Math.min(target, Math.floor(m.ceil));   // learned: above this price sales dropped
    if (!(target - i.price >= 3)) continue;
    const tr = trend(i.asin);
    if (tr.prev >= 3 && tr.last < tr.prev * 0.6) continue;   // sales falling fast - protect volume, don't raise now
    st.bbCool[i.sku] = now + BB_COOL_MS;
    try {
      const kc = await knownCost(i);
      if (!kc) continue;   // unknown cost: leave alone
      const was = i.price; await patchPrice(i, target); raised++; noteChange(st, i, 'raise', target, was);
      const profit = orderProfit(i, kc.cost, target, ship);
      console.log(`Buy Box pricer RAISE ${i.sku}: Rs ${was} -> Rs ${target} (next seller Rs ${L(next)} incl. shipping, profit Rs ${profit}/order)`);
      await log(i, { status: 'bb_raise', change: 'raise', oldPrice: was, newPrice: target, profit, basis: `You held the Buy Box · next seller ₹${Math.round(L(next))} incl. shipping · now ₹1 below them · profit ₹${profit}/order` });
    } catch (e) { console.warn(`Buy Box pricer RAISE failed for ${i.sku}:`, e.message || e); }
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`Buy Box pricer: ${guarded} loss-guard raises, ${lowered} lowered, ${raised} raised, ${skipped} kept (loss / no cost / big cut / your own price).`);
}


// ── ATTENTION LISTS for the Amazon page (owner, 24 Oct 2026: "more sales with profit") ─────────
// noCost : in-stock self-ship listings the robot cannot price because no cost is known (Map them on the page).
// noOffer: listings with no live offer from us, with the reason:
//   restock_lots - Amazon stock 0 but LOTS has 10+ in stock -> update stock in OMS Guru (easy sale)
//   not_selling  - in stock but Amazon hides the offer (the relist robot works on these)
//   hidden_price - in stock, behind 20 cheaper offers (price problem)
//   no_sellers   - nobody has a live offer (listing inactive / suppressed - check Seller Central)
//   out_of_stock - Amazon stock 0 and LOTS low / unknown
//   fba          - Amazon-fulfilled (Amazon controls it)
// Uses data already loaded this run (no extra reads).
async function buildAttentionLists(units30) {
  const c = await loadCostData();
  const lotsQ = (asin) => { const m = c.map[asin]; if (!m || (m.vendorName && String(m.vendorName).toUpperCase() !== 'LOTS')) return null;
    const code = m.code || (Array.isArray(m.parts) && m.parts[0] && m.parts[0].code); const p = code && c.lots[String(code)];
    const q = p ? parseFloat(p.qty) : NaN; return isNaN(q) ? null : q; };
  const statusOf = (offers) => { const w = offers.find((o) => o.isBuyBoxWinner), mine = offers.find((o) => o.isMine); return w && w.isMine ? 'held' : mine ? 'lost' : 'none'; };
  const inv = Object.values(SNAP.inventory).filter((i) => i && i.account === ACCOUNT_LABEL && i.sku && i.asin && reportSkus.has(i.sku));
  const noCost = [], noOffer = [];
  for (const i of inv) {
    const offers = relistFresh.get(i.asin); if (!offers) continue;
    const fba = (i.fulfillmentChannel || 'DEFAULT') !== 'DEFAULT', qty = Number(i.quantity) || 0, u30 = units30[i.asin] || 0;
    const base = { sku: i.sku, asin: i.asin, name: String(i.name || '').slice(0, 90), price: i.price || null, qty, u30 };
    if (!fba && qty > 0 && !(await knownCost(i).catch(() => null))) noCost.push({ ...base, st: statusOf(offers) });
    if (offers.some((o) => o.isMine)) continue;
    const lq = lotsQ(i.asin);
    const r = fba ? 'fba' : qty <= 0 ? (lq != null && lq >= STOCK_GUARD_MIN ? 'restock_lots' : 'out_of_stock')
      : pricedOut(i, offers) ? 'hidden_price' : !offers.length ? 'no_sellers' : 'not_selling';
    noOffer.push({ ...base, r, lq });
  }
  const stRank = { lost: 0, none: 1, held: 2 }, rRank = { restock_lots: 0, not_selling: 1, hidden_price: 2, no_sellers: 3, out_of_stock: 4, fba: 5 };
  noCost.sort((a, b) => (stRank[a.st] - stRank[b.st]) || (b.u30 - a.u30));
  noOffer.sort((a, b) => (rRank[a.r] - rRank[b.r]) || (b.u30 - a.u30));
  const counts = {}; noOffer.forEach((x) => { counts[x.r] = (counts[x.r] || 0) + 1; });
  console.log(`Attention: ${noCost.length} in-stock listings have no cost (map them) · no offer ${noOffer.length}: ` +
    Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
  return { noCostCount: noCost.length, noCost: noCost.slice(0, 500), noOfferCount: noOffer.length, noOfferBy: counts, noOffer: noOffer.slice(0, 600) };
}

// ── RAISE UNDO (owner, 24 Oct 2026: "sales dipped since the robot") ─────────────────────────
// For each listing whose latest robot change is a Buy Box raise made since 20 Oct:
//   • still holding the Buy Box at the higher price      -> keep (it works)
//   • lost the Buy Box                                     -> back to the price before the raise(s), no raises for 14 days
// Never touched: prices changed since (by hand or the page), owner-set prices (7-day rule), and loss-guard raises
// (the old price earned under the rule Rs 15 or 10% - the owner's minimum stays).
async function undoLostRaises(eligible, st, log, patchPrice, manual) {
  const now = Date.now();
  let undone = 0, kept = 0, skipped = 0;
  for (const i of eligible) {
    if (undone >= RAISE_UNDO_PER_RUN) break;
    const m = st.learn[i.sku]; if (!m || !m.ch || !m.ch.length || (m.raiseUndo && m.raiseUndo !== 'loss_guard')) continue;
    const ch = m.ch, last = ch[ch.length - 1];
    if (last.kind !== 'raise' || last.at < RAISE_UNDO_FROM) continue;
    let k = ch.length - 1; while (k > 0 && ch[k - 1].kind === 'raise' && ch[k - 1].at >= RAISE_UNDO_FROM) k--;
    if (Math.abs(i.price - last.to) >= 1) { m.raiseUndo = 'changed'; skipped++; continue; }   // changed since - leave it
    if (manual.has(i.sku)) { m.raiseUndo = 'owner'; skipped++; continue; }
    const offers = relistFresh.get(i.asin) || [], win = offers.find((o) => o.isBuyBoxWinner);
    if (win && win.isMine) { kept++; continue; }   // still winning at the higher price - check again next run
    // Go back to the earliest price in this run of raises that still earns the minimum (skips loss-guard steps)
    const kc = await knownCost(i).catch(() => null);
    let orig = null;
    for (let j = k; j < ch.length; j++) { const f = Number(ch[j].from); if (f > 0 && (!kc || profitOk(i, kc.cost, f))) { orig = f; break; } }
    if (!orig || orig >= last.to) { m.raiseUndo = 'loss_guard'; skipped++; continue; }
    try {
      await patchPrice(i, orig); undone++;
      m.raiseUndo = 'undone'; m.ceil = orig; m.ceilUntil = now + LEARN_REST_MS;
      m.ch.push({ at: now, kind: 'revert', from: last.to, to: orig, judged: 'revert' });
      st.bbCool[i.sku] = now + BB_COOL_MS;
      console.log(`Raise undo ${i.sku}: Rs ${last.to} -> Rs ${orig} (robot raise lost the Buy Box)`);
      await log(i, { status: 'learn_revert', oldPrice: last.to, newPrice: orig, profit: kc ? Math.round(orderProfit(i, kc.cost, orig)) : null,
        basis: `Robot raised the price to ₹${last.to} and the Buy Box was lost - back to ₹${orig}. Raising while holding the Buy Box is now off.` });
    } catch (e) { console.warn(`Raise undo failed for ${i.sku}:`, e.message || e); }
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`Raise undo: ${undone} put back to the price before the raise, ${kept} still winning at the higher price (kept), ${skipped} left alone (changed since / your price / ${RULE_TXT} minimum).`);
}

// ── ROBOT LEARNING (owner, 21 Oct 2026: "check trends and learn") ─────────────────────────
// Every price change is remembered per SKU. 3 days later the robot compares real sales and profit
// per day before vs after the change, then:
//   lowered & profit/day went up (or held)      -> keep            (learn_keep)
//   lowered & profit/day went down              -> back to old price, no more cuts for 14 days (learn_revert)
//   raised  & profit/day held or went up        -> keep            (learn_keep)
//   raised  & sales fell >30% and profit/day down-> back to old price, that price becomes a ceiling for 14 days
//   lowered 3+ times in 3 days (competitor keeps undercutting) -> price war: stop cutting for 3 days (learn_war)
// Raises are skipped while a product's sales are falling fast (last 7 days < 60% of the 7 days before).
const LEARN_AFTER_MS = 72 * 3600e3, LEARN_REST_MS = 14 * 864e5, WAR_REST_MS = 72 * 3600e3;
function myOrders() { return Object.values(SNAP.orders).filter((o) => o && (!o.account || o.account === ACCOUNT_LABEL) && !o.isCanceled && !/^(pending|cancel)/i.test(o.status || '') && o.purchaseDate); }
function unitsBetween(asin, from, to) {
  let n = 0;
  myOrders().forEach((o) => { const t = Date.parse(o.purchaseDate); if (t < from || t >= to) return;
    (o.items || []).forEach((it) => { if (it && it.asin === asin) n += Number(it.qty) || 1; }); });
  return n;
}
function unitsByAsin(days) {
  const out = {}, from = Date.now() - days * 864e5;
  myOrders().forEach((o) => { if (Date.parse(o.purchaseDate) < from) return; (o.items || []).forEach((it) => { if (it && it.asin) out[it.asin] = (out[it.asin] || 0) + (Number(it.qty) || 1); }); });
  return out;
}
function trend(asin) { const now = Date.now(); return { last: unitsBetween(asin, now - 7 * 864e5, now), prev: unitsBetween(asin, now - 14 * 864e5, now - 7 * 864e5) }; }
function noteChange(st, i, kind, to, from) {
  const m = st.learn[i.sku] || (st.learn[i.sku] = {}), now = Date.now();
  m.ch = (m.ch || []).concat([{ at: now, kind, from, to }]).slice(-6);
  if (kind === 'lower' && m.ch.filter((c) => c.kind === 'lower' && now - c.at < 72 * 3600e3).length >= 3) m.warPending = true;
}
function pruneLearn(L) {
  const now = Date.now();
  Object.keys(L).forEach((k) => { const m = L[k];
    m.ch = (m.ch || []).filter((c) => now - c.at < 30 * 864e5);
    ['noLowerUntil', 'warUntil', 'ceilUntil'].forEach((f) => { if (m[f] && m[f] < now) delete m[f]; });
    if (!m.ceilUntil) delete m.ceil;
    if (!m.ch.length && !m.noLowerUntil && !m.warUntil && !m.ceilUntil) delete L[k]; });
}
async function learnFromChanges(sellerId, eligible, st, log, patchPrice) {
  const now = Date.now(), bySku = new Map(eligible.map((i) => [i.sku, i]));
  let judged = 0, kept = 0, reverted = 0, wars = 0;
  for (const [sku, m] of Object.entries(st.learn)) {
    const i = bySku.get(sku); if (!i) continue;
    if (m.warPending) {
      delete m.warPending; m.warUntil = now + WAR_REST_MS; wars++;
      await log(i, { status: 'learn_war', basis: `Price cut 3 times in 3 days - a competitor keeps undercutting. Robot stops cutting this one for 3 days to protect your margin.` });
    }
    const c = (m.ch || []).slice().reverse().find((x) => !x.judged && now - x.at >= LEARN_AFTER_MS);
    if (!c) continue;
    const latest = m.ch[m.ch.length - 1];
    if (latest !== c) { c.judged = 'superseded'; continue; }   // a newer change happened - judge that one later
    c.judged = 'yes'; judged++;
    const kc = await knownCost(i); if (!kc) continue;
    const span = Math.min(7 * 864e5, now - c.at), days = span / 864e5;
    const before = unitsBetween(i.asin, c.at - 7 * 864e5, c.at) / 7, after = unitsBetween(i.asin, c.at, c.at + span) / days;
    const pB = orderProfit(i, kc.cost, c.from), pA = orderProfit(i, kc.cost, c.to);
    const dayB = Math.round(before * pB), dayA = Math.round(after * pA);
    const r1 = (x) => Math.round(x * 10) / 10;
    const facts = `Sales ${r1(before)}/day → ${r1(after)}/day · profit ₹${dayB}/day → ₹${dayA}/day (₹${Math.round(pB)} → ₹${Math.round(pA)} per order)`;
    const worse = c.kind === 'lower' ? dayA < dayB : (after < before * 0.7 && dayA < dayB);
    if (Math.abs(i.price - c.to) >= 1) continue;   // price changed since (by hand) - leave it
    if (!worse) {
      kept++;
      await log(i, { status: 'learn_keep', oldPrice: c.from, newPrice: c.to, profit: pA, basis: `${c.kind === 'lower' ? 'Price cut' : 'Price rise'} worked - keeping ₹${c.to}. ${facts}` });
      continue;
    }
    try {
      await patchPrice(i, c.from); reverted++;
      if (c.kind === 'lower') m.noLowerUntil = now + LEARN_REST_MS; else { m.ceil = c.from; m.ceilUntil = now + LEARN_REST_MS; }
      m.ch.push({ at: now, kind: 'revert', from: c.to, to: c.from, judged: 'revert' });
      console.log(`Robot learning REVERT ${sku}: Rs ${c.to} -> Rs ${c.from} (${facts})`);
      await log(i, { status: 'learn_revert', oldPrice: c.to, newPrice: c.from, profit: pB, basis: `${c.kind === 'lower' ? 'Price cut did not pay' : 'Price rise lost sales'} - back to ₹${c.from}${c.kind === 'lower' ? ', no more cuts for 14 days' : `, robot won't go above ₹${c.from} for 14 days`}. ${facts}` });
    } catch (e) { console.warn(`Robot learning revert failed for ${sku}:`, e.message || e); }
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`Robot learning: ${judged} change(s) judged - ${kept} kept, ${reverted} reverted, ${wars} price war(s) paused.`);
}

// ── Write-back functions ──────────────────────────────────────────────────────────

async function applyPendingPriceUpdates(sellerId) {
  // Requests come from the Amazon page (SP-API Firebase) and from the Admin Console (main Firebase)
  const snaps = await Promise.all([db, dbMain].map((d) => d.collection('spapiPriceUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get()));
  const docs = snaps.flatMap((s) => s.docs);
  if (!docs.length) { console.log('No pending price updates.'); return; }
  console.log(`Applying ${docs.length} pending price update(s)...`);

  for (const doc of docs) {
    const { sku } = doc.data(); const newPrice = Math.round(Number(doc.data().newPrice) * 100) / 100;
    try {
      if (!(newPrice > 0)) throw new Error('Price must be more than 0.');
      // Start from the listing's own offer so MRP and other offer details are kept (Amazon India needs MRP).
      const cur = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes', 'summaries'] } });
      const productType = ((cur.summaries || [])[0] || {}).productType || await productTypeFor(sellerId, sku);
      if (!productType) throw new Error('No known product type for this SKU yet.');
      const po = JSON.parse(JSON.stringify((((cur.attributes || {}).purchasable_offer) || [])[0] || {}));
      const mrpVal = Number((((po.maximum_retail_price || [])[0] || {}).schedule || [])[0]?.value_with_tax) || Number(SNAP.inventory[`${ACCOUNT_LABEL}_${sku}`]?.mrp) || null;
      if (mrpVal && newPrice > mrpVal) throw new Error(`New price ₹${newPrice} is above MRP ₹${mrpVal}.`);
      delete po.start_at; delete po.end_at;
      ['discounted_price', 'quantity_discount_plan'].forEach((k) => delete po[k]);
      fitPriceLimits(po, newPrice, mrpVal);
      Object.assign(po, { marketplace_id: MARKETPLACE_ID, currency: po.currency || 'INR', audience: po.audience || 'ALL', our_price: [{ schedule: [{ value_with_tax: newPrice }] }] });
      if (!po.maximum_retail_price && mrpVal) po.maximum_retail_price = [{ schedule: [{ value_with_tax: mrpVal }] }];
      const call = (mode) => spClient.callAPI({ operation: 'patchListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' },
        path: { sellerId, sku }, query: Object.assign({ marketplaceIds: [MARKETPLACE_ID] }, mode ? { mode } : {}),
        body: { productType, patches: [{ op: 'replace', path: '/attributes/purchasable_offer', value: [po] }] } });
      assertListingsOk(await call('VALIDATION_PREVIEW')); // dry run first - nothing changes if Amazon would refuse
      assertListingsOk(await call(null));
      await doc.ref.update({ status: 'applied', verified: false, checks: 0, appliedAt: admin.firestore.FieldValue.serverTimestamp(), error: admin.firestore.FieldValue.delete() });
      // Write new price directly to inventory so UI stays in sync
      await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).set({ price: newPrice }, { merge: true });
      snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { price: newPrice });
      console.log(`Price updated for SKU ${sku}: now ${newPrice}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`Price update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}


// Amazon answers "ACCEPTED" first and decides later. Check each sent price on later syncs:
// live at the new price -> verified; refused (price error) -> failed with Amazon's own reason.
async function verifyPricePushes(sellerId) {
  // One-time move (21 Oct 2026): robot records saved in the console's Firebase go to the SP-API Firebase.
  try {
    const old = await dbMain.collection('spapiPriceUpdates').where('source', '==', 'robot').where('account', '==', ACCOUNT_LABEL).get();
    if (!old.empty) {
      for (let k = 0; k < old.docs.length; k += 200) {
        const part = old.docs.slice(k, k + 200), b1 = db.batch(), b2 = dbMain.batch();
        part.forEach((d) => { b1.set(db.collection('spapiPriceUpdates').doc(d.id), d.data()); b2.delete(d.ref); });
        await b1.commit(); await b2.commit();
      }
      console.log(`Moved ${old.size} robot price record(s) to the SP-API Firebase.`);
    }
  } catch (e) { console.warn('Robot record move skipped:', e.message || e); }
  // Only prices still waiting for Amazon (verified == false) are read - not every price ever sent.
  const snaps = await Promise.all([db, dbMain].map((d) => d.collection('spapiPriceUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'applied').where('verified', '==', false).get()));
  const cut = Date.now() - 3 * 864e5;
  const docs = snaps.flatMap((s) => s.docs).filter((d) => { const x = d.data(); const t = x.appliedAt && x.appliedAt.toMillis ? x.appliedAt.toMillis() : 0;
    return x.verified === false && t > cut && Date.now() - t > 4 * 60000; });
  if (!docs.length) { console.log('No sent prices waiting for Amazon.'); return; }
  console.log(`Checking ${docs.length} sent price(s) on Amazon...`);
  for (const doc of docs) {
    const { sku, newPrice } = doc.data(), checks = (doc.data().checks || 0) + 1;
    try {
      const r = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['offers', 'issues'] } });
      const offer = (r.offers || []).find((o) => (o.audience && o.audience.value) !== 'B2B') || (r.offers || [])[0];
      const live = offer ? Number(offer.price && offer.price.amount) : null;
      const priceErr = (r.issues || []).filter((i) => (i.severity || '').toUpperCase() === 'ERROR' && (i.categories || []).includes('INVALID_PRICE'));
      if (live != null && Math.abs(live - Number(newPrice)) < 0.01) {
        await doc.ref.update({ verified: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp(), checks });
        console.log(`Price live on Amazon: ${sku} = ${live}`);
      } else if (priceErr.length) {
        const why = priceErr.map((i) => i.message).filter(Boolean).join(' | ').slice(0, 400);
        await doc.ref.update({ status: 'failed', failedAt: admin.firestore.FieldValue.serverTimestamp(), checks, livePrice: live,
          error: `Amazon kept ₹${live} - ${why}` });
        console.warn(`Price NOT live for ${sku} (still ${live}): ${why}`);
      } else if (checks >= 8) {
        await doc.ref.update({ status: 'failed', failedAt: admin.firestore.FieldValue.serverTimestamp(), checks, livePrice: live,
          error: `Amazon still shows ₹${live} after ${checks} checks.` });
      } else await doc.ref.update({ checks, livePrice: live });
    } catch (e) { console.warn(`Price check failed for ${sku}:`, e.message || e); }
    await new Promise((res) => setTimeout(res, 500));
  }
}

async function applyPendingMrpUpdates(sellerId) {
  const pendingSnap = await dbMain.collection('spapiMrpUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', 'in', SYNC_MODE === 'full' ? ['pending', 'failed'] : ['pending']).get();
  // (old failed requests are only re-checked on full syncs - saves ~20 reads on every quick sync)
  // Retry requests that only failed because of the old MRP field format (fixed 7 Oct 2026)
  const docs = pendingSnap.docs.filter((d) => d.data().status === 'pending'
    || (/value_with_tax|does not belong/.test(d.data().error || '') && !d.data().retriedFormat)
    || (/No known product type/.test(d.data().error || '') && !d.data().retriedType)   // fixed 20 Oct 2026
    || (/no longer applicable|does not belong/.test(d.data().error || '') && !d.data().retriedOffer));   // fixed 21 Oct 2026: MRP inside the offer
  if (!docs.length) { console.log('No pending MRP updates.'); return; }
  console.log(`Applying ${docs.length} pending MRP update(s)...`);

  for (const doc of docs) {
    const { sku, newMrp } = doc.data();
    try {
      const productType = await productTypeFor(sellerId, sku);
      if (!productType) throw new Error('No known product type for this SKU yet.');
      // Where Amazon keeps the MRP depends on the product type: most use "List Price with Tax",
      // some only "Maximum Retail Price". Try them in order; move on only when Amazon says the
      // attribute/field doesn't apply to this product type.
      // 21 Oct 2026: Amazon India now keeps MRP INSIDE the offer (purchasable_offer.maximum_retail_price) and rejects
      // the old top-level fields ("no longer applicable", 29 SKUs). Write it there first, keeping the current price.
      let usedField = null, lastErr = null;
      try {
        const cur = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku },
          query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes'] } });
        const po = JSON.parse(JSON.stringify((((cur.attributes || {}).purchasable_offer) || [])[0] || {}));
        const price = Number(((((po.our_price || [])[0] || {}).schedule || [])[0] || {}).value_with_tax) || null;
        if (price && price > newMrp) throw new Error(`Your selling price ₹${price} is above the new MRP ₹${newMrp} - lower the price first.`);
        delete po.start_at; delete po.end_at;
        Object.assign(po, { marketplace_id: MARKETPLACE_ID, currency: po.currency || 'INR', audience: po.audience || 'ALL',
          maximum_retail_price: [{ schedule: [{ value_with_tax: newMrp }] }] });
        assertListingsOk(await spClient.callAPI({ operation: 'patchListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' },
          path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
          body: { productType, patches: [{ op: 'replace', path: '/attributes/purchasable_offer', value: [po] }] } }));
        usedField = 'purchasable_offer.maximum_retail_price';
      } catch (e) { lastErr = e; if (/above the new MRP/.test(e.message || '')) throw e; }
      const tries = usedField ? [] : [
        ['list_price', { value_with_tax: newMrp }],
        ['maximum_retail_price', { value: newMrp }],
        ['maximum_retail_price', { value_with_tax: newMrp }],
      ];
      for (const [attr, v] of tries) {
        try {
          assertListingsOk(await spClient.callAPI({
            operation: 'patchListingsItem', endpoint: 'listingsItems',
            path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
            body: { productType, patches: [{ op: 'replace', path: `/attributes/${attr}`,
              value: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', ...v }] }] },
          }));
          usedField = `${attr}.${Object.keys(v)[0]}`; break;
        } catch (e) {
          lastErr = e;
          if (!/does not belong|no longer applicable|not have enough values|not allowed|is not valid|unknown|not.*part of/i.test(e.message || '')) break;
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (!usedField) throw lastErr || new Error('MRP update failed');
      await doc.ref.update({ status: 'applied', field: usedField, appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      // Write new MRP directly to inventory so UI stays in sync
      await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).update({ mrp: newMrp });
      snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { mrp: newMrp });
      console.log(`MRP updated for SKU ${sku}: now ${newMrp}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', retriedFormat: true, retriedType: true, retriedOffer: true, error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`MRP update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

// Check MRP pushes against Amazon's own listings report. Amazon often "accepts" an MRP change
// but keeps the catalogue MRP (offer-only listings can't change it) - mark those not-live.
async function verifyMrpPushes() {
  // At most once every 2 hours — this reads every "applied" MRP request (300+ documents), and running
  // it on every sync (every ~12 min) was costing ~1,500 Firebase reads an hour.
  if (!inventoryFresh) return;
  const lastCheck = (prevSnapMeta && prevSnapMeta.mrpCheckedAt) || 0;
  if (Date.now() - lastCheck < 2 * 3600e3) { mrpCheckedAt = lastCheck; console.log('MRP push check: skipped (runs every 2 hours).'); return; }
  mrpCheckedAt = Date.now();
  const snap = await dbMain.collection('spapiMrpUpdates').where('account', '==', ACCOUNT_LABEL).where('status', '==', 'applied').get();
  let live = 0, notLive = 0;
  const batch = dbMain.batch();
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.verified) return;
    const at = x.appliedAt && x.appliedAt.toMillis ? x.appliedAt.toMillis() : 0;
    if (!at || Date.now() - at < 90 * 60 * 1000) return;           // give Amazon time to update
    const it = SNAP.inventory[`${ACCOUNT_LABEL}_${x.sku}`];
    if (!it || it.mrp == null) return;
    const ok = Math.abs(Number(it.mrp) - Number(x.newMrp)) < 0.5;
    batch.update(d.ref, { verified: ok ? 'live' : 'not-live', seenMrp: it.mrp, checkedAt: admin.firestore.FieldValue.serverTimestamp() });
    ok ? live++ : notLive++;
  });
  if (live + notLive) await batch.commit();
  console.log(`MRP push check: ${live} live on Amazon, ${notLive} NOT changed by Amazon.`);
}

async function applyPendingHsnUpdates(sellerId) {
  // One request doc per SKU (spapiHsnUpdates/<account>_<sku>). It can carry a new GST tax code,
  // a new HSN code, or both:  { newTaxCode: 'A_GEN_SUPERREDUCED', newHsnCode: '21069099' }.
  // Older requests only had "newHsn" - those are read as a tax code if they start with A_GEN,
  // otherwise as an HSN code (the old code wrongly sent HSN numbers into the tax-code field).
  const pendingSnap0 = await dbMain.collection('spapiHsnUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', 'in', SYNC_MODE === 'full' ? ['pending', 'failed'] : ['pending']).get();
  // also retry, once, requests that only failed because the product type was missing (fixed 20 Oct 2026)
  const hsnDocs = pendingSnap0.docs.filter((d) => d.data().status === 'pending' || (/No known product type/.test(d.data().error || '') && !d.data().retriedType));
  const pendingSnap = { empty: !hsnDocs.length, size: hsnDocs.length, docs: hsnDocs };
  if (pendingSnap.empty) { console.log('No pending GST/HSN updates.'); return; }
  console.log(`Applying ${pendingSnap.size} pending GST/HSN update(s)...`);

  for (const doc of pendingSnap.docs) {
    const d = doc.data();
    const sku = d.sku;
    const legacy = d.newHsn != null ? String(d.newHsn).trim() : '';
    const taxCode = d.newTaxCode || (/^A_GEN/i.test(legacy) ? legacy : null);
    const hsn = d.newHsnCode ? String(d.newHsnCode).trim() : (/^\d{4,8}$/.test(legacy) ? legacy : null);
    const invId = `${ACCOUNT_LABEL}_${sku}`;
    try {
      if (!taxCode && !hsn) throw new Error('Nothing to update - no valid GST tax code or HSN code in the request.');
      if (taxCode && !(taxCode in TAX_CODE_RATE)) throw new Error(`Unknown GST tax code "${taxCode}".`);
      if (hsn && !/^\d{4,8}$/.test(hsn)) throw new Error(`HSN "${hsn}" must be 4 to 8 digits.`);
      const productType = await productTypeFor(sellerId, sku);
      if (!productType) throw new Error('No known product type for this SKU yet - wait for the next sync.');

      const patches = [];
      if (taxCode) patches.push({ op: 'replace', path: '/attributes/product_tax_code',
        value: [{ value: taxCode, marketplace_id: MARKETPLACE_ID }] });
      if (hsn) patches.push({ op: 'replace', path: '/attributes/external_product_information',
        value: [{ entity: 'HSN Code', value: hsn, marketplace_id: MARKETPLACE_ID }] });

      assertListingsOk(await spClient.callAPI({
        operation: 'patchListingsItem', endpoint: 'listingsItems',
        path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
        body: { productType, patches },
      }));

      const now = Date.now();
      const invPatch = { lastTaxPush: { status: 'applied', at: now, taxCode: taxCode || null, hsnCode: hsn || null } };
      if (taxCode) invPatch.taxCode = taxCode;
      if (hsn) invPatch.hsnCode = hsn;
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp(), appliedTaxCode: taxCode || null, appliedHsnCode: hsn || null });
      await db.collection('spapiInventory').doc(invId).set(invPatch, { merge: true });
      snapPatch('inventory', invId, invPatch);
      pushedTaxSkus.set(sku, invPatch); // keep our values even if Amazon's read-back lags behind
      changedSkus.add(sku);             // re-read from Amazon in Step 2c to confirm
      console.log(`GST/HSN updated for SKU ${sku}:${taxCode ? ' tax ' + taxCode : ''}${hsn ? ' HSN ' + hsn : ''}`);
    } catch (e) {
      const error = e.message || String(e);
      await doc.ref.update({ status: 'failed', retriedType: true, error, failedAt: admin.firestore.FieldValue.serverTimestamp() });
      snapPatch('inventory', invId, { lastTaxPush: { status: 'failed', at: Date.now(), error, taxCode: taxCode || null, hsnCode: hsn || null } });
      console.warn(`GST/HSN update FAILED for SKU ${sku}:`, error);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}


// ── ADD ASIN (owner, 21 Oct 2026: "if we add an ASIN in the robot it should list on Amazon, making profit") ──
// The Amazon page writes spapiAddAsin/{account_asin} = { account, asin, qty, cost?, mrp?, gst?, status:'pending' }.
// Every sync (quick or full): check the ASIN, cost and competition, pick a PROFITABLE price, list it as a new offer.
//   price = ₹1 under the Buy Box (incl. shipping) if that still earns ₹15 or 10%, else the lowest price that does;
//           no other seller -> MRP. Never above MRP. No cost known -> waits for a cost (Map it on the page).
// Result statuses: listed | exists | needs_cost | needs_mrp | blocked | loss | failed  (the page shows each, with Retry).
const GST_CODE = { 0: 'A_GEN_EXEMPT', 0.25: 'A_GEN_MINIMUM', 3: 'A_GEN_JEWELLERY', 5: 'A_GEN_SUPERREDUCED', 18: 'A_GEN_STANDARD', 40: 'A_GEN_HIGHPEAK' };
function myUsualShip() {
  const v = Object.values(SNAP.pricing).filter((p) => p && p.account === ACCOUNT_LABEL).map((p) => ((p.offers || []).find((o) => o.isMine) || {}).shipping)
    .filter((x) => x != null && x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : (SELF_SHIP_ACCOUNTS.has(ACCOUNT_LABEL) ? 74 : 80);
}
function priceForProfit(i, cost, ship, want) {
  for (let p = Math.max(1, Math.floor(cost)); p < cost * 4 + 500; p++) if (orderProfit(i, cost, p, ship) >= want) return p;
  return null;
}

// Barcode -> ASIN(s) via the Catalog API (tries EAN, UPC, GTIN). Returns [{ asin, name }].
async function asinsForBarcode(code) {
  const types = code.length === 12 ? ['UPC', 'EAN', 'GTIN'] : code.length === 14 ? ['GTIN', 'EAN'] : ['EAN', 'GTIN', 'UPC'];
  for (const t of types) {
    try {
      const res = await spClient.callAPI({ operation: 'searchCatalogItems', endpoint: 'catalogItems', options: { version: '2022-04-01' },
        query: { marketplaceIds: [MARKETPLACE_ID], identifiers: [code], identifiersType: t, includedData: ['summaries'], pageSize: 10 } });
      const items = res.items || res.payload?.items || [];
      if (items.length) return items.map((x) => ({ asin: x.asin, name: (((x.summaries || [])[0] || {}).itemName) || '' }));
    } catch (e) { console.warn(`Barcode lookup (${t}) failed for ${code}:`, e.message || e); }
    await new Promise((res) => setTimeout(res, 600));
  }
  return [];
}
// Same barcode in the LOTS catalogue -> save the ASIN's LOTS mapping (cost, MRP, GST then come from LOTS).
async function mapByBarcode(asin, code) {
  const c = await loadCostData(), strip = (x) => String(x || '').replace(/\D/g, '').replace(/^0+/, '');
  if (c.map[asin]) return null;   // already mapped - keep the owner's mapping
  const p = Object.values(c.lots).find((x) => x && x.barcode && strip(x.barcode) === strip(code));
  if (!p) return null;
  const rec = { code: String(p.code), name: p.name || '', vendorName: 'LOTS', parts: [{ code: String(p.code), name: p.name || '', qty: 1 }], savedAt: new Date().toISOString(), source: 'barcode' };
  await dbMain.collection('aikm_admin').doc('spapiAsinLotsMap').set({ map: { [asin]: rec } }, { merge: true });
  c.map[asin] = rec;
  console.log(`Add ASIN: barcode ${code} = LOTS ${p.code} (${p.name}) - mapped to ${asin}.`);
  return p;
}
async function applyAddAsinRequests(sellerId) {
  const snap = await db.collection('spapiAddAsin').where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').limit(15).get();
  if (snap.empty) { console.log('Add ASIN: nothing pending.'); return; }
  console.log(`Add ASIN: ${snap.size} request(s).`);
  for (const d of snap.docs) {
    const r = d.data();
    let asin = String(r.asin || '').trim().toUpperCase();
    const done = (patch) => d.ref.set({ ...patch, doneAt: Date.now() }, { merge: true });
    try {
      // Barcode printed on the product (EAN/UPC/GTIN) -> find the ASIN, and the LOTS item with the same barcode
      const barcode = String(r.barcode || (/^\d{8}$|^\d{12,14}$/.test(asin) ? asin : '')).replace(/\D/g, '');
      let lotsHit = null;
      if (barcode) {
        const found = await asinsForBarcode(barcode);
        if (!found.length) { await done({ status: 'failed', barcode, error: `No Amazon product found for barcode ${barcode}. Check the number, or add it by ASIN.` }); continue; }
        const own = found.find((a) => Object.values(SNAP.inventory).some((x) => x && x.account === ACCOUNT_LABEL && x.asin === a.asin));
        asin = (own || found[0]).asin;
        await d.ref.set({ asin, barcode, alsoAsins: found.slice(0, 5).map((x) => x.asin) }, { merge: true });
        lotsHit = await mapByBarcode(asin, barcode);
      }
      if (!/^[A-Z0-9]{10}$/.test(asin)) { await done({ status: 'failed', error: 'Not a valid ASIN (10 letters/digits) or barcode (8, 12, 13 or 14 digits).' }); continue; }
      // Already listed (self-ship)? Owner's rule: RELIST - create a fresh listing under a new SKU, then delete the old one(s).
      // FBA listings are never touched (Amazon holds that stock).
      const mine = Object.values(SNAP.inventory).filter((x) => x && x.account === ACCOUNT_LABEL && x.asin === asin && x.sku);
      const oldOnes = mine.filter((x) => (x.fulfillmentChannel || 'DEFAULT') === 'DEFAULT');
      const fbaOnes = mine.filter((x) => (x.fulfillmentChannel || 'DEFAULT') !== 'DEFAULT');
      // 1) catalogue: name, product type, MRP hint
      const cat = await spClient.callAPI({ operation: 'getCatalogItem', endpoint: 'catalogItems', path: { asin }, options: { version: '2022-04-01' },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['summaries', 'productTypes', 'attributes', 'images'] } });
      const sm = (cat.summaries || [])[0] || {}, ca = cat.attributes || {};
      const productType = ((cat.productTypes || [])[0] || {}).productType;
      const name = sm.itemName || r.name || asin;
      const imgSet = (cat.images || [])[0], img = imgSet && (imgSet.images || []).find((x) => x.variant === 'MAIN');
      if (!productType) { await done({ status: 'failed', name, error: 'Amazon has no product type for this ASIN - it may not be sellable in India.' }); continue; }
      // 2) can we sell it?
      let restricted = null;
      try {
        const rr = await spClient.callAPI({ operation: 'getListingsRestrictions', endpoint: 'listingsRestrictions', query: { asin, sellerId, marketplaceIds: [MARKETPLACE_ID], conditionType: 'new_new' } });
        restricted = (rr.restrictions || []).flatMap((x) => (x.reasons || []).map((y) => y.message || y.reasonCode)).filter(Boolean).join(' | ') || null;
      } catch (e) { console.warn(`Add ASIN restriction check failed for ${asin}:`, e.message || e); }
      if (restricted) { await done({ status: 'blocked', name, img: img ? img.link : null, error: restricted.slice(0, 300) }); continue; }
      // 3) cost (typed on the page, or the ASIN's LOTS / vendor mapping) and MRP
      let sku = 'N-' + asin; for (let n = 2; SNAP.inventory[`${ACCOUNT_LABEL}_${sku}`]; n++) sku = `N-${asin}-${n}`;
      // Relist: a time-based SKU, so it can never clash with an old SKU the listings report still shows.
      if (oldOnes.length) sku = `N-${asin}-R${Date.now().toString(36).toUpperCase()}`;
      const i = { sku, asin, name, account: ACCOUNT_LABEL, amazonProductType: productType, weightKg: 0.5, price: 0, taxCode: null };
      let kc = Number(r.cost) > 0 ? { cost: Number(r.cost), src: 'typed' } : await knownCost(i);
      for (const o of oldOnes) { if (kc) break; kc = await knownCost({ ...i, sku: o.sku }); if (kc) kc.src += ' (old SKU)'; }
      if (kc && lotsHit && !(Number(r.cost) > 0)) kc.src = 'LOTS barcode match';
      if (!kc) { await done({ status: 'needs_cost', name, img: img ? img.link : null, error: 'No cost known. Click Map (or type the cost) and press Retry.' }); continue; }
      const mrpCat = Number(((((ca.maximum_retail_price || [])[0] || {}).value) ?? (((ca.list_price || [])[0] || {}).value)) || 0) || null;
      const oldMrp = (oldOnes.find((o) => Number(o.mrp) > 0) || {}).mrp;
      const mrp = Number(r.mrp) > 0 ? Number(r.mrp) : (await knownMrp(i)) || mrpCat || (Number(oldMrp) > 0 ? Number(oldMrp) : null);
      if (!mrp) { await done({ status: 'needs_mrp', name, img: img ? img.link : null, error: 'No MRP found. Type the MRP and press Retry.' }); continue; }
      let gst = Number.isFinite(Number(r.gst)) && r.gst !== '' && r.gst != null ? Number(r.gst) : null;
      if (gst == null) { const c = await loadCostData(), m = c.map[asin]; const p = m && m.code && c.lots[String(m.code)]; const g = p ? Number(p.gst) : (m && m.vendor ? Number(m.vendor.gst) : NaN); if (Number.isFinite(g)) gst = g; }
      i.taxCode = gst != null && GST_CODE[gst] ? GST_CODE[gst] : null; i.mrp = mrp;
      // 4) competition -> profitable price
      let offers = [];
      try {
        const res = await spClient.callAPI({ operation: 'getItemOffers', endpoint: 'productPricing', path: { Asin: asin }, query: { MarketplaceId: MARKETPLACE_ID, ItemCondition: 'New' } });
        offers = (res.Offers || res.payload?.Offers || []).map((o) => ({ sellerId: o.SellerId, price: parseFloat(o.ListingPrice?.Amount) || 0, shipping: parseFloat(o.Shipping?.Amount) || 0, bb: !!o.IsBuyBoxWinner }))
          .filter((o) => o.price > 0 && !OUR_SELLER_IDS.has(o.sellerId));
      } catch (e) { console.warn(`Add ASIN offers failed for ${asin}:`, e.message || e); }
      const L = (o) => o.price + o.shipping, ship = myUsualShip();
      const ref = offers.find((o) => o.bb) || offers.slice().sort((a, b) => L(a) - L(b))[0];
      const p15 = floorPrice(i, kc.cost, ship);
      if (p15 == null || p15 > mrp) { await done({ status: 'loss', name, img: img ? img.link : null, cost: kc.cost, mrp, error: `Earning ${RULE_TXT}/order needs ₹${p15 || '?'}, above MRP ₹${mrp} (cost ₹${kc.cost}). Not listed.` }); continue; }
      let price, basis;
      if (!ref) { price = Math.floor(mrp); basis = 'No other seller - listed at MRP'; }
      else {
        const win = Math.floor(L(ref) - 1 - ship);
        if (priceOk(i, kc.cost, win, ship)) { price = win; basis = `${ref.bb ? 'Buy Box' : 'Lowest seller'} ₹${Math.round(L(ref))} incl. shipping − ₹1`; }
        else { price = p15; basis = `${ref.bb ? 'Buy Box' : 'Lowest seller'} ₹${Math.round(L(ref))} is too cheap to match without loss - listed at the lowest price that earns ${RULE_TXT}/order`; }
      }
      price = Math.min(price, Math.floor(mrp));
      // Owner's own price from the page (name search "Your price"): used as is (capped at MRP), but never below the rule (Rs 15 or 10%).
      const want = Number(r.wantPrice);
      if (want > 0) {
        const wp = Math.min(Math.floor(want), Math.floor(mrp)), wpProfit = Math.round(orderProfit(i, kc.cost, wp, ship));
        if (!priceOk(i, kc.cost, wp, ship)) { await done({ status: 'loss', name, img: img ? img.link : null, cost: kc.cost, mrp, error: `Your price ₹${wp} earns only ₹${wpProfit}/order (minimum ${RULE_TXT}, needs ₹${p15}+). Change the price or clear it for auto price, then Retry.` }); continue; }
        basis = `Your price ₹${wp}${wp < want ? ` (capped at MRP)` : ''} · robot's auto price would be ₹${price}`; price = wp;
      }
      const profit = Math.round(orderProfit(i, kc.cost, price, ship));
      // 5) list it (dry run first)
      let qty = Math.max(1, Math.min(999, parseInt(r.qty) || 10));
      // Owner, 24 Oct 2026: a NEW listing whose LOTS-GN stock is under 12 goes live with stock 0 (OMS Guru can add stock later)
      const lm = (await loadCostData()).map[asin], lcode = lm && (!lm.vendorName || String(lm.vendorName).toUpperCase() === 'LOTS') && (lm.code || (Array.isArray(lm.parts) && lm.parts[0] && lm.parts[0].code));
      const lp = lcode ? (await loadCostData()).lots[String(lcode)] : null, lotsGn = lp ? parseFloat(lp.qty) : NaN;
      let stockNote = '';
      if (!isNaN(lotsGn) && lotsGn < NEW_LISTING_MIN_LOTS) { qty = 0; stockNote = `LOTS-GN stock ${lotsGn} is under ${NEW_LISTING_MIN_LOTS} - listed with stock 0`; }
      const attributes = {
        condition_type: [{ value: 'new_new', marketplace_id: MARKETPLACE_ID }],
        merchant_suggested_asin: [{ value: asin, marketplace_id: MARKETPLACE_ID }],
        purchasable_offer: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', audience: 'ALL', our_price: [{ schedule: [{ value_with_tax: price }] }], maximum_retail_price: [{ schedule: [{ value_with_tax: mrp }] }] }],
        fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity: qty }],
        skip_offer: [{ value: false, marketplace_id: MARKETPLACE_ID }],
      };
      if (i.taxCode) attributes.product_tax_code = [{ value: i.taxCode, marketplace_id: MARKETPLACE_ID }];
      const put = (mode) => spClient.callAPI({ operation: 'putListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' }, path: { sellerId, sku },
        query: Object.assign({ marketplaceIds: [MARKETPLACE_ID] }, mode ? { mode } : {}), body: { productType, requirements: 'LISTING_OFFER_ONLY', attributes } });
      let pre = await put('VALIDATION_PREVIEW');
      const missing = (pre.issues || []).filter((x) => (x.severity || '').toUpperCase() === 'ERROR').flatMap((x) => x.attributeNames || []).filter((k) => ca[k] && !attributes[k]);
      if (missing.length) { missing.forEach((k) => { attributes[k] = ca[k]; }); pre = await put('VALIDATION_PREVIEW'); }
      assertListingsOk(pre);
      assertListingsOk(await put(null));
      const costToKeep = Number(r.cost) > 0 ? Number(r.cost) : (/old SKU|manual/.test(kc.src) ? kc.cost : null);
      if (costToKeep) await dbMain.collection('aikm_admin').doc('spapiManualCosts').set({ costs: { [sku]: costToKeep } }, { merge: true }).catch(() => {});
      console.log(`Relist [${oldOnes.length ? 'replace' : 'new ASIN'}] ${sku} (ASIN ${asin}) at Rs ${price}, MRP ${mrp}, qty ${qty}, profit Rs ${profit}/order: ACCEPTED`);
      // New listing is accepted - now delete the old SKU(s). A failed delete never undoes the new listing.
      const replaced = [], notDeleted = [];
      for (const o of oldOnes) {
        try {
          await spClient.callAPI({ operation: 'deleteListingsItem', endpoint: 'listingsItems', path: { sellerId, sku: o.sku }, query: { marketplaceIds: [MARKETPLACE_ID] } });
        } catch (e) {
          if (!/not found/i.test(e.message || '')) { notDeleted.push(o.sku); console.warn(`Relist: old SKU ${o.sku} NOT deleted:`, e.message || e); continue; }
        }
        replaced.push(o.sku);
        console.log(`Relist: old SKU ${o.sku} deleted (replaced by ${sku}).`);
        await db.collection('spapiDeletedListings').doc(`${ACCOUNT_LABEL}_${o.sku}_${Date.now()}`).set({ account: ACCOUNT_LABEL, sku: o.sku, name: o.name || name, asin,
          price: o.price || null, quantity: o.quantity || null, reason: 'relist (Add ASIN)', newSku: sku, deletedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        await new Promise((res) => setTimeout(res, 800));
      }
      if (replaced.length) basis = `Relisted - old ${replaced.join(', ')} deleted · ${basis}`;
      if (notDeleted.length) basis = `⚠ Old ${notDeleted.join(', ')} could NOT be deleted - delete it in Seller Central · ${basis}`;
      if (fbaOnes.length) basis += ` · FBA listing ${fbaOnes.map((x) => x.sku).join(', ')} left as is`;
      if (stockNote) { basis = `${stockNote} · ${basis}`; console.log(`Add ASIN ${sku}: ${stockNote}.`); }
      await done({ status: 'listed', sku, name, img: img ? img.link : null, price, mrp, qty, cost: kc.cost, costSrc: kc.src, profit, basis, ship, replaced, notDeleted });
      const at = Date.now();
      await dbMain.collection('spapiRelistLog').doc(`${ACCOUNT_LABEL}_${asin}_${at}`).set({ account: ACCOUNT_LABEL, asin, name, oldSku: replaced[0] || sku, newSku: sku, price, mrp, qty, at,
        status: replaced.length ? 'relisted' : 'new_listing', profit, basis: `${basis} · profit ₹${profit}/order · live in ~2 h · link ${sku} in OMS Guru` }).catch(() => {});
    } catch (e) {
      const error = (e.message || String(e)).slice(0, 400);
      console.warn(`Add ASIN FAILED for ${asin}:`, error);
      await done({ status: 'failed', error });
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
}

async function applyPendingNewListings(sellerId) {
  const pendingSnap = await db.collection('spapiNewListingRequests')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get();
  if (pendingSnap.empty) { console.log('No pending new-listing requests.'); return; }
  console.log(`Applying ${pendingSnap.size} pending new-listing request(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, productType, title, brand, price, mrp, hsn, barcode, barcodeType, quantity } = doc.data();
    try {
      if (!sku || !productType) throw new Error('Missing SKU or productType.');
      const attributes = {};
      if (title) attributes.item_name = [{ value: title, marketplace_id: MARKETPLACE_ID }];
      if (brand) attributes.brand = [{ value: brand, marketplace_id: MARKETPLACE_ID }];
      if (price != null) attributes.purchasable_offer = [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', our_price: [{ schedule: [{ value_with_tax: price }] }] }];
      if (mrp != null) attributes.list_price = [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', value: mrp }];
      if (hsn) attributes.product_tax_code = [{ value: String(hsn) }];
      if (barcode) attributes.externally_assigned_product_identifier = [{ type: (barcodeType || 'ean').toLowerCase(), value: String(barcode), marketplace_id: MARKETPLACE_ID }];
      if (quantity != null) attributes.fulfillment_availability = [{ fulfillment_channel_code: 'DEFAULT', quantity }];
      await spClient.callAPI({
        operation: 'putListingsItem', endpoint: 'listingsItems',
        path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
        body: { productType, attributes },
      });
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`New listing created/mapped for SKU ${sku}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`New listing request FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function flagPendingRefundRequests() {
  const pendingSnap = await db.collection('spapiRefundRequests')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get();
  if (pendingSnap.empty) { console.log('No pending refund requests.'); return; }
  console.log(`Flagging ${pendingSnap.size} refund request(s) for manual action...`);
  const batch = db.batch();
  pendingSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'flagged_for_manual_action',
      flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      note: 'Process manually in Seller Central > Manage Returns/Refunds.',
    });
  });
  await batch.commit();
}

async function applyPendingListingDeletions(sellerId) {
  const pendingSnap = await dbMain.collection('spapiListingDeletions')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get();
  if (pendingSnap.empty) { console.log('No pending listing deletions.'); return; }
  console.log(`Applying ${pendingSnap.size} pending listing deletion(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku } = doc.data();
    try {
      const asin = skuToAsinMap[sku] || null;
      const invData = SNAP.inventory[`${ACCOUNT_LABEL}_${sku}`] || null; // from snapshot - no read
      await spClient.callAPI({
        operation: 'deleteListingsItem', endpoint: 'listingsItems',
        path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
      });
      await db.collection('spapiDeletedListings').doc(`${ACCOUNT_LABEL}_${sku}_${Date.now()}`).set({
        account: ACCOUNT_LABEL, sku,
        name: invData?.name || null, asin: invData?.asin || asin || null,
        price: invData?.price || null, quantity: invData?.quantity || null,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`Listing deleted for SKU ${sku}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`Listing deletion FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}


// ── STOCK GUARD: follow LOTS stock on Amazon ────────────────────────────────────
// Rule (asked for by the owner):
//   • LOTS-GN stock below STOCK_GUARD_MIN (12) → set the Amazon listing to 0 (out of stock),
//     remembering the Amazon stock it had.
//   • LOTS-GN stock back at 12 or more         → put that remembered Amazon stock back (only if Amazon is still 0).
// Safety:
//   • Only listings whose LOTS link is CONFIRMED (saved ASIN mapping or saved name mapping) -
//     never on a name guess, so a wrong match can't switch off a good product.
//   • Only self-ship / Easy Ship listings (FBA stock is controlled by Amazon, not us).
//   • Only when this run's Amazon listings report was read (never on stale numbers).
//   • Circuit breaker: if LOTS looks broken (catalogue missing, or 60%+ of linked in-stock listings would go
//     to 0) nothing is changed and the reason is logged; at most STOCK_GUARD_MAX_ZERO changes per run.
// State lives in spapiStockGuard/<account> (1 read + 1 write per run).
// SWITCHED OFF (owner decision, 1 Oct 2026): OMS Guru also pushes stock to Amazon, so two systems
// were fighting. OMS Guru owns Amazon stock. This tool now only reads LOTS stock for the page, and
// one time puts back any listing it had set to 0 earlier. Set to true only if OMS Guru's Amazon
// inventory sync is turned off.
// OFF again (owner, 24 Oct 2026, same day): the "LOTS-GN under 12 -> stock 0" rule is wanted ONLY for new listings the
// robot creates (Add ASIN - see NEW_LISTING_MIN_LOTS), not for existing listings. While off, any listing this guard set
// to 0 gets its previous Amazon stock put back (undo below). STOCK_GUARD=on in the workflow switches it on.
const STOCK_GUARD_ENABLED = String(process.env.STOCK_GUARD || 'off').toLowerCase() === 'on';
const STOCK_GUARD_MIN = 12;
const NEW_LISTING_MIN_LOTS = 12;   // Add ASIN: LOTS-GN stock under this -> the new listing goes live with stock 0
const STOCK_GUARD_MAX_ZERO = 100;          // most listings set to 0 in one run (the rest follow next run)
const STOCK_GUARD_BROKEN_SHARE = 0.6;      // if 60%+ of LOTS-linked in-stock listings would go to 0, LOTS data looks broken - stop
function normalizeName(e) { return String(e).toLowerCase().replace(/[|/,_\-()]/g, ' ').replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim(); }

async function loadLotsForGuard() {
  const [lotsSnap, mapSnap, asinDoc] = await Promise.all([
    dbMain.collection('aikm_admin').doc('lotsCatalog').collection('chunks').get(),
    dbMain.collection('aikm_admin').doc('masterMapping').collection('chunks').get(),
    dbMain.collection('aikm_admin').doc('spapiAsinLotsMap').get(),
  ]);
  const lotsByCode = {};
  lotsSnap.forEach((d) => (d.data().products || []).forEach((p) => { if (p && p.code != null) lotsByCode[String(p.code)] = p; }));
  const nameMap = {};
  mapSnap.forEach((d) => Object.assign(nameMap, d.data().map || {}));
  const asinMap = asinDoc.exists ? (asinDoc.data().map || {}) : {};
  return { lotsByCode, nameMap, asinMap };
}

function confirmedLotsFor(item, L) {
  const a = item.asin && L.asinMap[item.asin];
  if (a && a.code && (a.vendorName || 'LOTS') === 'LOTS') return L.lotsByCode[String(a.code)] || null;
  const n = item.name && L.nameMap[normalizeName(item.name)];
  if (n && n.code && n.vendorName === 'LOTS') return L.lotsByCode[String(n.code)] || null;
  return null;
}

async function setAmazonQuantity(sellerId, sku, qty) {
  const productType = await productTypeFor(sellerId, sku);
  if (!productType) throw new Error('No known product type for this SKU yet.');
  assertListingsOk(await spClient.callAPI({
    operation: 'patchListingsItem', endpoint: 'listingsItems',
    path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
    body: { productType, patches: [{ op: 'replace', path: '/attributes/fulfillment_availability',
      value: [{ fulfillment_channel_code: 'DEFAULT', quantity: qty }] }] },
  }));
}

async function runStockGuard(sellerId) {
  if (!sellerId) { console.log('Stock guard skipped: SPAPI_SELLER_ID not set.'); return; }
  if (!inventoryFresh) { console.log('Stock guard skipped: Amazon listings report not read this run.'); return; }
  const guardRef = db.collection('spapiStockGuard').doc(ACCOUNT_LABEL);
  const guardDoc = await guardRef.get();
  const guard = guardDoc.exists ? (guardDoc.data().items || {}) : {};
  // Rule is off and nothing left to put back -> skip reading the LOTS catalogue (saves ~25 console reads per full sync)
  if (!STOCK_GUARD_ENABLED && !Object.keys(guard).length) { console.log('Stock guard: off, nothing to undo.'); return; }

  const L = await loadLotsForGuard();
  const lotsCount = Object.keys(L.lotsByCode).length;
  if (lotsCount < 500) { console.warn(`Stock guard STOPPED: LOTS catalogue has only ${lotsCount} products - looks incomplete.`); return; }

  const toZero = [], toRestore = [], release = [];
  for (const item of Object.values(SNAP.inventory)) {
    if (!item.sku || item.account !== ACCOUNT_LABEL || !reportSkus.has(item.sku)) continue; // only live listings
    if ((item.fulfillmentChannel || 'DEFAULT') !== 'DEFAULT') continue; // FBA - Amazon controls stock
    const lots = confirmedLotsFor(item, L);
    const g = guard[item.sku];
    const lotsQty = lots ? parseFloat(lots.qty) : NaN;
    const amzQty = parseInt(item.quantity, 10) || 0;
    const docId = `${ACCOUNT_LABEL}_${item.sku}`;
    SNAP.inventory[docId].lotsQty = isNaN(lotsQty) ? null : lotsQty;
    SNAP.inventory[docId].stockGuard = g ? { zeroed: true, prevQty: g.prevQty, since: g.since } : null;
    if (isNaN(lotsQty)) { if (g) release.push(item.sku); continue; } // link removed / no LOTS stock - stop managing it
    if (lotsQty < STOCK_GUARD_MIN) {
      if (amzQty > 0) toZero.push({ item, lotsQty, amzQty, prevQty: g ? g.prevQty : amzQty, since: g ? g.since : Date.now() });
    } else if (g) {
      toRestore.push({ item, lotsQty, amzQty, prevQty: g.prevQty });
    }
  }
  release.forEach((sku) => { delete guard[sku]; });

  if (!STOCK_GUARD_ENABLED) {
    // Undo: put back the Amazon stock of listings this tool had set to 0, then stop managing them.
    let undone = 0, undoFailed = 0;
    for (const [sku, g] of Object.entries(guard)) {
      const docId = `${ACCOUNT_LABEL}_${sku}`, item = SNAP.inventory[docId];
      const amzQty = item ? (parseInt(item.quantity, 10) || 0) : 0;
      try {
        if (item && reportSkus.has(sku) && amzQty === 0 && g.prevQty > 0) {
          await setAmazonQuantity(sellerId, sku, g.prevQty);
          await db.collection('spapiInventory').doc(docId).set({ quantity: g.prevQty }, { merge: true });
          snapPatch('inventory', docId, { quantity: g.prevQty, lastStockPush: { status: 'applied', at: Date.now(), qty: g.prevQty, reason: 'Stock rule switched off - previous Amazon stock put back' } });
          undone++;
        }
        if (item) snapPatch('inventory', docId, { stockGuard: null });
        delete guard[sku];
      } catch (e) {
        undoFailed++;
        if (item) snapPatch('inventory', docId, { lastStockPush: { status: 'failed', at: Date.now(), qty: g.prevQty, error: e.message || String(e) } });
        console.warn(`Stock guard undo: could not put back ${sku} to ${g.prevQty}:`, e.message || e);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    await guardRef.set({ items: guard, disabled: true, updatedAt: Date.now() });
    console.log(`Stock guard is OFF (OMS Guru owns Amazon stock): ${undone} listing(s) put back, ${undoFailed} failed, ${Object.keys(guard).length} still to put back.`);
    return;
  }

  // Circuit breaker: a broken LOTS upload (stock missing / all 0) must not switch off the whole shop
  const linkedInStock = Object.values(SNAP.inventory).filter((it) => it && it.account === ACCOUNT_LABEL && reportSkus.has(it.sku)
    && (it.fulfillmentChannel || 'DEFAULT') === 'DEFAULT' && (parseInt(it.quantity, 10) || 0) > 0 && it.lotsQty != null).length;
  if (toZero.length >= 20 && toZero.length > linkedInStock * STOCK_GUARD_BROKEN_SHARE) {
    console.warn(`Stock guard STOPPED: ${toZero.length} of ${linkedInStock} LOTS-linked listings would go to 0 - the LOTS-GN stock looks broken. Nothing was changed.`);
    await guardRef.set({ items: guard, blocked: { at: Date.now(), wouldZero: toZero.length, of: linkedInStock }, updatedAt: Date.now() });
    return;
  }
  if (toZero.length > STOCK_GUARD_MAX_ZERO) console.log(`Stock guard: ${toZero.length} to set to 0 - doing ${STOCK_GUARD_MAX_ZERO} now, the rest next run.`);
  toZero.splice(STOCK_GUARD_MAX_ZERO);

  let zeroed = 0, restored = 0, failed = 0;
  for (const z of toZero) {
    const docId = `${ACCOUNT_LABEL}_${z.item.sku}`;
    try {
      await setAmazonQuantity(sellerId, z.item.sku, 0);
      guard[z.item.sku] = { prevQty: z.prevQty, since: z.since, lotsQtyAtZero: z.lotsQty };
      snapPatch('inventory', docId, { quantity: 0, stockGuard: { zeroed: true, prevQty: z.prevQty, since: z.since },
        lastStockPush: { status: 'applied', at: Date.now(), qty: 0, reason: `LOTS stock ${z.lotsQty} is below ${STOCK_GUARD_MIN}` } });
      await db.collection('spapiInventory').doc(docId).set({ quantity: 0 }, { merge: true });
      zeroed++;
    } catch (e) {
      failed++;
      snapPatch('inventory', docId, { lastStockPush: { status: 'failed', at: Date.now(), qty: 0, error: e.message || String(e) } });
      console.warn(`Stock guard: could not set ${z.item.sku} to 0:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  for (const r2 of toRestore) {
    const docId = `${ACCOUNT_LABEL}_${r2.item.sku}`;
    try {
      if (r2.amzQty === 0 && r2.prevQty > 0) {
        await setAmazonQuantity(sellerId, r2.item.sku, r2.prevQty);
        await db.collection('spapiInventory').doc(docId).set({ quantity: r2.prevQty }, { merge: true });
        snapPatch('inventory', docId, { quantity: r2.prevQty, lastStockPush: { status: 'applied', at: Date.now(), qty: r2.prevQty, reason: `LOTS stock back to ${r2.lotsQty}` } });
        restored++;
      }
      delete guard[r2.item.sku];
      snapPatch('inventory', docId, { stockGuard: null });
    } catch (e) {
      failed++;
      snapPatch('inventory', docId, { lastStockPush: { status: 'failed', at: Date.now(), qty: r2.prevQty, error: e.message || String(e) } });
      console.warn(`Stock guard: could not restore ${r2.item.sku} to ${r2.prevQty}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  await guardRef.set({ items: guard, blocked: null, updatedAt: Date.now() });
  console.log(`Stock guard: ${zeroed} set out of stock, ${restored} restored, ${failed} failed, ${Object.keys(guard).length} currently held at 0.`);
}

// Listings deleted/replaced on Amazon disappear from the listings report. Drop them from the
// page snapshot (so they stop showing as stock or "duplicate ASIN") and flag the old doc.
// Safety: only when this run's report was read, and never if the report looks truncated.
async function pruneRemovedListings(liveAsins) {
  if (!inventoryFresh || !reportSkus.size) { console.log('Prune skipped: listings report not read this run.'); return; }
  const mine = Object.entries(SNAP.inventory).filter(([, it]) => it.account === ACCOUNT_LABEL);
  if (reportSkus.size < mine.length * 0.5) { console.warn(`Prune STOPPED: report has ${reportSkus.size} SKUs vs ${mine.length} known - looks incomplete.`); return; }
  const gone = mine.filter(([, it]) => it.sku && !reportSkus.has(it.sku));
  const batch = db.batch();
  for (const [docId, it] of gone) {
    delete SNAP.inventory[docId];
    batch.set(db.collection('spapiInventory').doc(docId), { removedFromAmazon: true, removedAt: Date.now() }, { merge: true });
  }
  if (gone.length) await batch.commit();
  const live = new Set(liveAsins || []);
  let prunedPricing = 0;
  if (live.size) for (const [docId, p] of Object.entries(SNAP.pricing)) {
    if (p.account === ACCOUNT_LABEL && p.asin && !live.has(p.asin)) { delete SNAP.pricing[docId]; prunedPricing++; }
  }
  console.log(`Prune: ${gone.length} listing(s) no longer on Amazon removed${gone.length ? ' (' + gone.map(([, it]) => it.sku).slice(0, 20).join(', ') + ')' : ''}; ${prunedPricing} competitor-price row(s) removed.`);
}

// Deliver-by index for the Admin Console's Order/AWB Scanner: one small document per
// seller account in the MAIN console Firebase (deliverByIndex/<account>), mapping
// Amazon order id -> "deliver by" date (India date, YYYY-MM-DD). Written only when
// something changed, so it costs 1 read (+ at most 1 write) per run.
async function publishDeliverByIndex() {
  const map = {};
  Object.values(SNAP.orders).forEach((o) => {
    if (!o || o.account !== ACCOUNT_LABEL || !o.orderId || !o.latestDeliveryDate) return;
    const t = new Date(o.latestDeliveryDate).getTime();
    if (isNaN(t)) return;
    map[o.orderId] = new Date(t + 330 * 60000).toISOString().slice(0, 10);
  });
  const ref = dbMain.collection('deliverByIndex').doc(ACCOUNT_LABEL);
  const prev = await ref.get();
  const old = (prev.exists && prev.data().orders) || {};
  const keys = Object.keys(map);
  if (keys.length === Object.keys(old).length && keys.every((k) => old[k] === map[k])) {
    console.log(`Deliver-by index unchanged (${keys.length} orders).`);
    return;
  }
  await ref.set({ account: ACCOUNT_LABEL, orders: map, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Deliver-by index published: ${keys.length} orders.`);
}

// Listing index for the Admin Console (MAIN Firebase, listingIndex/<account>): SKU -> ASIN,
// Amazon selling price and MRP, plus open order id -> Amazon SKUs. One small document,
// written only when something changed.
async function publishListingIndex() {
  const skus = {}, orders = {};
  Object.values(SNAP.inventory).forEach((i) => {
    if (!i || i.account !== ACCOUNT_LABEL || !i.sku) return;
    skus[i.sku] = { a: i.asin || '', p: i.price ?? null, m: i.mrp ?? null, q: i.quantity ?? null, i: i.img || '' };
  });
  // f = lowest price that meets the rule (Rs 15 or 10%), t = price that earns TARGET_PROFIT (same maths as the robot)
  try {
    await loadCostData();
    for (const i of Object.values(SNAP.inventory)) {
      if (!i || i.account !== ACCOUNT_LABEL || !skus[i.sku] || !(i.price > 0)) continue;
      const kc = await knownCost(i).catch(() => null); if (!kc) continue;
      const pr = orderProfit(i, kc.cost, i.price);
      const lim = Math.floor(Math.max(Number(i.mrp) || 0, i.price * 1.5));
      const first = (goal) => { for (let pz = 1; pz <= lim; pz++) if (orderProfit(i, kc.cost, pz) >= goal) return pz; return Math.ceil(i.price - pr + goal); };
      skus[i.sku].f = (() => { for (let pz = 1; pz <= lim; pz++) if (profitOk(i, kc.cost, pz)) return pz; return first(FLOOR_RS); })(); skus[i.sku].t = first(TARGET_PROFIT); skus[i.sku].e = Math.round(pr);
      // per-unit numbers so the console can work out each ORDER's profit with the same maths
      skus[i.sku].c = Math.round(kc.cost * 100) / 100; skus[i.sku].k = shipCostFor(i); skus[i.sku].g = gstRate(i);
      skus[i.sku].fp = Math.round(feeFor(i, i.price) * 100) / 100;
    }
  } catch (e) { console.warn('Listing index safe prices skipped:', e.message || e); }
  Object.values(SNAP.orders).forEach((o) => {
    if (!o || o.account !== ACCOUNT_LABEL || !o.orderId || !/unshipped|partially|pending/i.test(o.status || '')) return;
    orders[o.orderId] = (o.items || []).map((it) => ({ s: it.sku || '', a: it.asin || '', t: String(it.title || '').slice(0, 70) })); // Firestore allows no nested arrays
  });
  const ref = dbMain.collection('listingIndex').doc(ACCOUNT_LABEL);
  const prev = await ref.get();
  const same = prev.exists && JSON.stringify(prev.data().skus || {}) === JSON.stringify(skus) && JSON.stringify(prev.data().orders || {}) === JSON.stringify(orders);
  if (same) { console.log(`Listing index unchanged (${Object.keys(skus).length} SKUs).`); return; }
  await ref.set({ account: ACCOUNT_LABEL, skus, orders, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`Listing index published: ${Object.keys(skus).length} SKUs, ${Object.keys(orders).length} open orders.`);
}

async function run() {
  if (SYNC_MODE === 'fast') {
    try {
      const m = (await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_meta`).get()).data() || {};
      const due = FULL_DUE_MS[ACCOUNT_LABEL] || 65 * 60e3, age = m.fullSyncedAt ? Date.now() - m.fullSyncedAt : Infinity;
      if (age > due) { SYNC_MODE = 'full'; console.log(`Last full sync ${Math.round(age / 60e3)} min ago (due every ${due / 60e3} min) - running FULL now.`); }
    } catch (e) { console.warn('Full-sync due check skipped:', e.message || e); }
  }
  console.log(`=== ${SYNC_MODE === 'fast' ? 'QUICK' : 'FULL'} sync for ${ACCOUNT_LABEL} ===`);
  console.log('Step 0: testing basic connectivity (getMarketplaceParticipations)...');
  const test = await spClient.callAPI({ operation: 'getMarketplaceParticipations', endpoint: 'sellers' });
  console.log('Step 0 result:', JSON.stringify(test));

  console.log('Step 0a: loading product-type cache...');
  await loadProductTypeCache();
  await loadFees();

  const sellerId = process.env.SPAPI_SELLER_ID;
  if (sellerId) {
    console.log('Step 0b: applying any pending price updates...');
    await applyPendingPriceUpdates(sellerId).catch((e) => console.warn('Skipped applyPendingPriceUpdates (sync continues):', e.message || e));
    await verifyPricePushes(sellerId).catch((e) => console.warn('Skipped verifyPricePushes (sync continues):', e.message || e));
    console.log('Step 0c: applying any pending MRP updates...');
    await applyPendingMrpUpdates(sellerId).catch((e) => console.warn('Skipped applyPendingMrpUpdates (sync continues):', e.message || e));
    console.log('Step 0d: applying any pending HSN/tax code updates...');
    await applyPendingHsnUpdates(sellerId).catch((e) => console.warn('Skipped applyPendingHsnUpdates (sync continues):', e.message || e));
    console.log('Step 0e: applying any pending new-listing requests...');
    await applyAddAsinRequests(sellerId).catch((e) => console.warn('Skipped Add ASIN (sync continues):', e.message || e));
    await applyPendingNewListings(sellerId).catch((e) => console.warn('Skipped applyPendingNewListings (sync continues):', e.message || e));
    console.log('Step 0f: applying any pending listing deletions...');
    await applyPendingListingDeletions(sellerId).catch((e) => console.warn('Skipped applyPendingListingDeletions (sync continues):', e.message || e));
  } else {
    console.log('Step 0b-0f: SPAPI_SELLER_ID not set - skipping all listing write-backs this run.');
  }

  console.log('Step 0g: flagging any pending refund requests for manual action...');
  await flagPendingRefundRequests().catch((e) => console.warn('Skipped flagPendingRefundRequests (sync continues):', e.message || e));

  console.log('Step 1: syncing orders...');
  const orders = await syncOrders();

  console.log('Step 2: syncing inventory...');
  const asinsFromInventory = await syncInventory();

  await verifyMrpPushes().catch((e) => console.warn('MRP check skipped (sync continues):', e.message || e));

  console.log('Step 2b: fetching real product categories for referral fee calc...');
  // Speed-up: category rarely changes - only ask Amazon for ASINs we don't know yet
  // (saves ~0.8 sec per product on every run).
  const knownAsins = new Set(Object.values(skuToAsinMap));
  Object.entries(skuToAsinMap).forEach(([sku, asin]) => { if (!productTypeCache[sku]) knownAsins.delete(asin); });
  const asinsNeedingCategory = asinsFromInventory.filter((a) => !knownAsins.has(a));
  console.log(`Category lookup needed for ${asinsNeedingCategory.length} of ${asinsFromInventory.length} ASINs (rest already known).`);
  const categoriesByAsin = await fetchProductCategories(asinsNeedingCategory);
  console.log('Sample categories:', JSON.stringify(Object.entries(categoriesByAsin).slice(0, 10)));

  const asinToSku = {};
  for (const [sku, asin] of Object.entries(skuToAsinMap)) { asinToSku[asin] = sku; }
  const catBatch = db.batch();
  let catWrites = 0, catSkipped = 0;
  for (const [asin, category] of Object.entries(categoriesByAsin)) {
    for (const sku of Object.keys(skuToAsinMap).filter((k) => skuToAsinMap[k] === asin)) {
      if (productTypeCache[sku] === category) { catSkipped++; continue; }
      catBatch.update(db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`), { amazonProductType: category });
      snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { amazonProductType: category });
      productTypeCache[sku] = category;
      catWrites++;
    }
  }
  if (catWrites > 0) await catBatch.commit();
  console.log(`Step 2b done: ${catWrites} category update(s) written, ${catSkipped} unchanged (skipped).`);

  await fetchProductImages().catch((e) => console.warn('Images skipped (sync continues):', e.message || e));

  console.log('Step 2c: checking HSN/tax for changed/new SKUs...');
  // Verify earlier GST/HSN pushes: re-read them from Amazon once (at least 30 min after the push)
  // and mark each as live on Amazon or not.
  const verifySkus = new Set();
  for (const it of Object.values(SNAP.inventory)) {
    const l = it.lastTaxPush;
    if (it.sku && l && l.status === 'applied' && !l.checkedAt && Date.now() - l.at > 30 * 60 * 1000 && !pushedTaxSkus.has(it.sku)) {
      verifySkus.add(it.sku); changedSkus.add(it.sku);
    }
  }
  if (verifySkus.size) console.log(`Step 2c: verifying ${verifySkus.size} earlier GST/HSN push(es) against Amazon...`);
  if (sellerId) {
    const skusNeedingHsn = [...changedSkus];
    if (skusNeedingHsn.length === 0) {
      console.log('Step 2c skipped: no SKU changes detected, HSN/tax data is up to date.');
    } else {
      console.log(`Step 2c running: ${skusNeedingHsn.length} SKU(s) changed or missing HSN — fetching...`);
      const hsnData = await fetchHsnTaxData(sellerId, skusNeedingHsn);
      const hsnBatch = db.batch();
      let hsnWrites = 0;
      for (const [sku, data] of Object.entries(hsnData)) {
        // Amazon can take a few minutes to show a change we just pushed - keep our pushed values for now.
        const pushed = pushedTaxSkus.get(sku);
        const hsnCode = pushed && pushed.hsnCode ? pushed.hsnCode : data.hsnCode;
        const taxCode = pushed && pushed.taxCode ? pushed.taxCode : data.taxCode;
        hsnBatch.update(db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`), { hsnCode, taxCode });
        snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { hsnCode, taxCode });
        hsnWrites++;
      }
      if (hsnWrites > 0) await hsnBatch.commit();
      let live = 0, notLive = 0;
      for (const sku of verifySkus) {
        const docId = `${ACCOUNT_LABEL}_${sku}`, it = SNAP.inventory[docId], l = it && it.lastTaxPush;
        if (!l) continue;
        const got = hsnData[sku] || {};
        const okTax = !l.taxCode || got.taxCode === l.taxCode;
        const okHsn = !l.hsnCode || String(got.hsnCode || '').replace(/\D/g, '') === String(l.hsnCode);
        const verified = okTax && okHsn ? 'live' : 'not-live';
        verified === 'live' ? live++ : notLive++;
        snapPatch('inventory', docId, { lastTaxPush: { ...l, checkedAt: Date.now(), verified, seenTaxCode: got.taxCode || null, seenHsnCode: got.hsnCode || null } });
        if (got.taxCode || got.hsnCode) snapPatch('inventory', docId, { taxCode: got.taxCode || null, hsnCode: got.hsnCode || null });
        console.log(`Verify ${sku}: ${verified} (Amazon now tax ${got.taxCode || '-'}, HSN ${got.hsnCode || '-'})`);
      }
      if (verifySkus.size) console.log(`Step 2c: GST/HSN pushes verified - ${live} live on Amazon, ${notLive} not showing.`);
      console.log(`Step 2c done: ${hsnWrites} HSN/tax update(s) written for ${skusNeedingHsn.length} changed SKU(s).`);
    }
  } else {
    console.log('Step 2c skipped: SPAPI_SELLER_ID not set.');
  }

  if (SYNC_MODE === 'full') {
    console.log('Step 3: syncing competitive pricing...');
    await syncCompetitivePricing(asinsFromInventory);
  } else console.log('Step 3: quick sync - competitor prices skipped (done in the full sync).');

  console.log('Step 3a: stock guard (LOTS-GN stock below 12 -> out of stock on Amazon)...');
  if (SYNC_MODE === 'full') await runStockGuard(sellerId).catch((e) => console.warn('Stock guard skipped (sync continues):', e.message || e));

  console.log('Step 3a1: relist robot ("Not selling" -> new SKU, old SKU deleted)...');
  if (SYNC_MODE === 'full') await refreshFeeEstimates().catch((e) => console.warn('Fee estimates skipped (sync continues):', e.message || e));
  if (SYNC_MODE === 'full') await runRelistRobot(sellerId).catch((e) => console.warn('Relist robot skipped (sync continues):', e.message || e));

  console.log('Step 3a2: removing listings that no longer exist on Amazon...');
  await pruneRemovedListings(asinsFromInventory).catch((e) => console.warn('Prune skipped (sync continues):', e.message || e));

  console.log('Step 3b: saving compact snapshot for the Amazon page...');
  await writeSnapshot();
  await publishDeliverByIndex().catch((e) => console.warn('Deliver-by index skipped (sync continues):', e.message || e));
  await publishListingIndex().catch((e) => console.warn('Listing index skipped (sync continues):', e.message || e));

  if (SYNC_MODE === 'fast') { console.log(`Quick sync complete in ${Math.round((Date.now() - RUN_STARTED) / 1000)}s.`); return; }
  console.log('Step 4: testing Merchant Fulfillment API access (shipping labels)...');
  try {
    const mfnTest = await spClient.callAPI({
      operation: 'getEligibleShipmentServices', endpoint: 'merchantFulfillment',
      body: {
        ShipmentRequestDetails: {
          AmazonOrderId: orders[0] ? orders[0].AmazonOrderId : '000-0000000-0000000',
          ItemList: [{ OrderItemId: 'TEST', Quantity: 1 }],
          ShipFromAddress: { Name: 'Praso Enterprises', AddressLine1: 'Test Address Line 1', City: 'Delhi', StateOrRegion: 'Delhi', PostalCode: '110001', CountryCode: 'IN', Phone: '9999999999' },
          PackageDimensions: { Length: 10, Width: 10, Height: 10, Unit: 'centimeters' },
          Weight: { Value: 200, Unit: 'grams' },
          ShippingServiceOptions: { DeliveryExperience: 'NoTracking', CarrierWillPickUp: false },
        },
      },
    });
    console.log('Merchant Fulfillment test SUCCESS:', JSON.stringify(mfnTest).slice(0, 500));
  } catch (e) {
    console.warn('Merchant Fulfillment test FAILED:', e.message || e, JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 500));
  }

  console.log('SP-API sync complete.');
}

// Diagnostic: run with mode "debug:<orderId>" to print what Amazon returns for one order (no writes).
async function debugOrder(id) {
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => /date|ship|deliver|promise|status|channel|prime|business|replacement|iba|ispu|transparency/i.test(k)));
  const one = await spClient.callAPI({ operation: 'getOrder', endpoint: 'orders', path: { orderId: id } });
  const o = one.payload || one;
  console.log('getOrder keys:', Object.keys(o).join(', '));
  console.log('getOrder dates:', JSON.stringify(pick(o), null, 1));
  const list = await spClient.callAPI({ operation: 'getOrders', endpoint: 'orders', query: { MarketplaceIds: [MARKETPLACE_ID], AmazonOrderIds: [id] } });
  const l = (list.Orders || list.payload?.Orders || [])[0];
  console.log('getOrders keys:', l ? Object.keys(l).join(', ') : 'not found');
  console.log('getOrders dates:', JSON.stringify(pick(l), null, 1));
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_debug`).set({ id, at: Date.now(), getOrderKeys: Object.keys(o), getOrder: JSON.stringify(pick(o)), getOrdersKeys: l ? Object.keys(l) : [], getOrders: JSON.stringify(pick(l)) });
}
async function debugSku(sku) {
  const res = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId: process.env.SPAPI_SELLER_ID, sku },
    query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes', 'summaries', 'offers', 'issues'] } });
  const a = res.attributes || {};
  const pick = Object.fromEntries(Object.entries(a).filter(([k]) => /price|mrp|retail|list|offer|skip|tax|fulfil|shipping|condition/i.test(k)));
  console.log('attribute keys:', Object.keys(a).join(', '));
  console.log('price attrs:', JSON.stringify(pick));
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_debug`).set({ sku, at: Date.now(), keys: Object.keys(a), price: JSON.stringify(pick), summaries: JSON.stringify(res.summaries || []).slice(0, 2000), offers: JSON.stringify(res.offers || []).slice(0, 2000), issues: JSON.stringify(res.issues || []).slice(0, 4000) });
}
async function listingCheck(list) {
  const out = {};
  for (const sku of list.split(',').map((x) => x.trim()).filter(Boolean)) {
    try {
      const r = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId: process.env.SPAPI_SELLER_ID, sku },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['summaries', 'offers', 'issues'] } });
      const sm = (r.summaries || [])[0] || {};
      out[sku] = { status: sm.status || [], offers: (r.offers || []).length, errors: (r.issues || []).filter((x) => (x.severity || '').toUpperCase() === 'ERROR').map((x) => x.message) };
    } catch (e) { out[sku] = { error: e.message || String(e) }; }
  }
  console.log('Listing check:', JSON.stringify(out));
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_debug`).set({ sku: 'check', at: Date.now(), check: JSON.stringify(out).slice(0, 9000) });
}
async function restrictionCheck(list) {
  const out = {};
  for (const asin of list.split(',').map((x) => x.trim()).filter(Boolean)) {
    try {
      const r = await spClient.callAPI({ operation: 'getListingsRestrictions', endpoint: 'listingsRestrictions',
        query: { asin, sellerId: process.env.SPAPI_SELLER_ID, marketplaceIds: [MARKETPLACE_ID], conditionType: 'new_new' } });
      out[asin] = (r.restrictions || []).map((x) => (x.reasons || []).map((y) => y.reasonCode + ': ' + (y.message || '')).join(' / ') || 'restricted');
    } catch (e) { out[asin] = 'error: ' + (e.message || e); }
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log('Restriction check:', JSON.stringify(out));
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_debug`).set({ sku: 'restrictions', at: Date.now(), check: JSON.stringify(out).slice(0, 9000) });
}
// Test for one SKU: "setprice:SKU=PRICE" - sends the price the same way as the page's price push, waits,
// then reads the listing back (status / offers / errors) into spapiSnapshots/<account>_debug.
async function setPriceTest(arg) {
  const [sku, p] = arg.split('='); const price = Number(p), sellerId = process.env.SPAPI_SELLER_ID;
  const productType = await productTypeFor(sellerId, sku.trim());
  const res = await spClient.callAPI({ operation: 'patchListingsItem', endpoint: 'listingsItems', options: { version: '2021-08-01' }, path: { sellerId, sku: sku.trim() },
    query: { marketplaceIds: [MARKETPLACE_ID] },
    body: { productType, patches: [{ op: 'replace', path: '/attributes/purchasable_offer',
      value: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', audience: 'ALL', our_price: [{ schedule: [{ value_with_tax: price }] }] }] }] } });
  console.log('Price patch:', JSON.stringify(res).slice(0, 800));
  await new Promise((r) => setTimeout(r, 120000));
  const r = await spClient.callAPI({ operation: 'getListingsItem', endpoint: 'listingsItems', path: { sellerId, sku: sku.trim() },
    query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['summaries', 'offers', 'issues'] } });
  const out = { patch: res, status: ((r.summaries || [])[0] || {}).status, offers: r.offers, issues: r.issues };
  console.log('After 2 min:', JSON.stringify(out).slice(0, 2000));
  await db.collection(SNAP_COL).doc(`${ACCOUNT_LABEL}_debug`).set({ sku: 'setprice', at: Date.now(), check: JSON.stringify(out).slice(0, 9000) });
}
if (/^setprice:/i.test(process.env.SYNC_MODE || '')) { setPriceTest(process.env.SYNC_MODE.slice(9)).then(() => process.exit(0)).catch((e) => { console.error('setprice failed:', e.message || e); process.exit(1); }); }
else if (/^restrictions:/i.test(process.env.SYNC_MODE || '')) { restrictionCheck(process.env.SYNC_MODE.slice(13)).then(() => process.exit(0)).catch((e) => { console.error('check failed:', e.message || e); process.exit(1); }); }
else if (/^listingcheck:/i.test(process.env.SYNC_MODE || '')) { listingCheck(process.env.SYNC_MODE.slice(13)).then(() => process.exit(0)).catch((e) => { console.error('check failed:', e.message || e); process.exit(1); }); }
else if (/^relistpreview:/i.test(process.env.SYNC_MODE || '')) { relistPreview(process.env.SYNC_MODE.slice(14).trim()).then(() => process.exit(0)).catch((e) => { console.error('relist preview failed:', e.message || e); process.exit(1); }); }
else if (/^debugsku:/i.test(process.env.SYNC_MODE || '')) { debugSku(process.env.SYNC_MODE.slice(9).trim()).then(() => process.exit(0)).catch((e) => { console.error('debug failed:', e.message || e); process.exit(1); }); }
else {
const DEBUG_ID = /^debug:/i.test(process.env.SYNC_MODE || '') ? process.env.SYNC_MODE.slice(6).trim() : null;
if (DEBUG_ID) debugOrder(DEBUG_ID).then(() => process.exit(0)).catch((e) => { console.error('debug failed:', e.message || e); process.exit(1); });
else run().catch((err) => {
  console.error('spapi-sync failed:', err.message || err);
  console.error('Full error details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
}
