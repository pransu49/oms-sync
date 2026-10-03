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
const SYNC_MODE = String(process.env.SYNC_MODE || 'full').toLowerCase() === 'fast' ? 'fast' : 'full';
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

// Amazon's Listings API often answers "INVALID" with a list of issues instead of throwing an
// error, so a "successful" call can still mean nothing changed. Treat that as a failure and keep
// Amazon's own reason, so the page can show exactly why.
function assertListingsOk(res) {
  const r = res && (res.payload || res);
  const issues = (r && r.issues) || [];
  const errors = issues.filter((i) => (i.severity || '').toUpperCase() === 'ERROR');
  if ((r && r.status && r.status !== 'ACCEPTED') || errors.length) {
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
}

// ── Write-back functions ──────────────────────────────────────────────────────────

async function applyPendingPriceUpdates(sellerId) {
  const pendingSnap = await db.collection('spapiPriceUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get();
  if (pendingSnap.empty) { console.log('No pending price updates.'); return; }
  console.log(`Applying ${pendingSnap.size} pending price update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newPrice } = doc.data();
    try {
      const productType = getProductTypeForSku(sku);
      if (!productType) throw new Error('No known product type for this SKU yet.');
      assertListingsOk(await spClient.callAPI({
        operation: 'patchListingsItem', endpoint: 'listingsItems',
        path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
        body: { productType, patches: [{ op: 'replace', path: '/attributes/purchasable_offer',
          value: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', our_price: [{ schedule: [{ value_with_tax: newPrice }] }] }] }] },
      }));
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      // Write new price directly to inventory so UI stays in sync
      await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).update({ price: newPrice });
      snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { price: newPrice });
      console.log(`Price updated for SKU ${sku}: now ${newPrice}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`Price update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function applyPendingMrpUpdates(sellerId) {
  const pendingSnap = await dbMain.collection('spapiMrpUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get();
  if (pendingSnap.empty) { console.log('No pending MRP updates.'); return; }
  console.log(`Applying ${pendingSnap.size} pending MRP update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newMrp } = doc.data();
    try {
      const productType = getProductTypeForSku(sku);
      if (!productType) throw new Error('No known product type for this SKU yet.');
      assertListingsOk(await spClient.callAPI({
        operation: 'patchListingsItem', endpoint: 'listingsItems',
        path: { sellerId, sku }, query: { marketplaceIds: [MARKETPLACE_ID] },
        body: { productType, patches: [{ op: 'replace', path: '/attributes/list_price',
          value: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', value: newMrp }] }] },
      }));
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      // Write new MRP directly to inventory so UI stays in sync
      await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).update({ mrp: newMrp });
      snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { mrp: newMrp });
      console.log(`MRP updated for SKU ${sku}: now ${newMrp}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`MRP update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function applyPendingHsnUpdates(sellerId) {
  // One request doc per SKU (spapiHsnUpdates/<account>_<sku>). It can carry a new GST tax code,
  // a new HSN code, or both:  { newTaxCode: 'A_GEN_SUPERREDUCED', newHsnCode: '21069099' }.
  // Older requests only had "newHsn" - those are read as a tax code if they start with A_GEN,
  // otherwise as an HSN code (the old code wrongly sent HSN numbers into the tax-code field).
  const pendingSnap = await dbMain.collection('spapiHsnUpdates')
    .where('account', '==', ACCOUNT_LABEL).where('status', '==', 'pending').get();
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
      const productType = getProductTypeForSku(sku);
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
      await doc.ref.update({ status: 'failed', error, failedAt: admin.firestore.FieldValue.serverTimestamp() });
      snapPatch('inventory', invId, { lastTaxPush: { status: 'failed', at: Date.now(), error, taxCode: taxCode || null, hsnCode: hsn || null } });
      console.warn(`GST/HSN update FAILED for SKU ${sku}:`, error);
    }
    await new Promise((r) => setTimeout(r, 800));
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
//   • LOTS stock below STOCK_GUARD_MIN (10)  → set the Amazon listing to 0 (out of stock),
//     remembering the Amazon stock it had.
//   • LOTS stock back at 10 or more          → put that remembered Amazon stock back.
// Safety:
//   • Only listings whose LOTS link is CONFIRMED (saved ASIN mapping or saved name mapping) -
//     never on a name guess, so a wrong match can't switch off a good product.
//   • Only self-ship / Easy Ship listings (FBA stock is controlled by Amazon, not us).
//   • Only when this run's Amazon listings report was read (never on stale numbers).
//   • Circuit breaker: if LOTS looks broken (catalogue missing, or it would switch off more than
//     STOCK_GUARD_MAX_ZERO listings in one run) nothing is changed and the reason is logged.
// State lives in spapiStockGuard/<account> (1 read + 1 write per run).
// SWITCHED OFF (owner decision, 1 Oct 2026): OMS Guru also pushes stock to Amazon, so two systems
// were fighting. OMS Guru owns Amazon stock. This tool now only reads LOTS stock for the page, and
// one time puts back any listing it had set to 0 earlier. Set to true only if OMS Guru's Amazon
// inventory sync is turned off.
const STOCK_GUARD_ENABLED = false;
const STOCK_GUARD_MIN = 10;
const STOCK_GUARD_MAX_ZERO = 60;
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
  const productType = getProductTypeForSku(sku);
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
  const L = await loadLotsForGuard();
  const lotsCount = Object.keys(L.lotsByCode).length;
  if (lotsCount < 500) { console.warn(`Stock guard STOPPED: LOTS catalogue has only ${lotsCount} products - looks incomplete.`); return; }

  const guardRef = db.collection('spapiStockGuard').doc(ACCOUNT_LABEL);
  const guardDoc = await guardRef.get();
  const guard = guardDoc.exists ? (guardDoc.data().items || {}) : {};

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

  if (toZero.length > STOCK_GUARD_MAX_ZERO) {
    console.warn(`Stock guard STOPPED: would switch off ${toZero.length} listings at once (limit ${STOCK_GUARD_MAX_ZERO}). Check the LOTS stock upload; nothing was changed.`);
    await guardRef.set({ items: guard, blocked: { at: Date.now(), wouldZero: toZero.length }, updatedAt: Date.now() });
    return;
  }

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

async function run() {
  console.log(`=== ${SYNC_MODE === 'fast' ? 'QUICK' : 'FULL'} sync for ${ACCOUNT_LABEL} ===`);
  console.log('Step 0: testing basic connectivity (getMarketplaceParticipations)...');
  const test = await spClient.callAPI({ operation: 'getMarketplaceParticipations', endpoint: 'sellers' });
  console.log('Step 0 result:', JSON.stringify(test));

  console.log('Step 0a: loading product-type cache...');
  await loadProductTypeCache();

  const sellerId = process.env.SPAPI_SELLER_ID;
  if (sellerId) {
    console.log('Step 0b: applying any pending price updates...');
    await applyPendingPriceUpdates(sellerId).catch((e) => console.warn('Skipped applyPendingPriceUpdates (sync continues):', e.message || e));
    console.log('Step 0c: applying any pending MRP updates...');
    await applyPendingMrpUpdates(sellerId).catch((e) => console.warn('Skipped applyPendingMrpUpdates (sync continues):', e.message || e));
    console.log('Step 0d: applying any pending HSN/tax code updates...');
    await applyPendingHsnUpdates(sellerId).catch((e) => console.warn('Skipped applyPendingHsnUpdates (sync continues):', e.message || e));
    console.log('Step 0e: applying any pending new-listing requests...');
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

  console.log('Step 2b: fetching real product categories for referral fee calc...');
  // Speed-up: category rarely changes - only ask Amazon for ASINs we don't know yet
  // (saves ~0.8 sec per product on every run).
  const knownAsins = new Set(Object.entries(skuToAsinMap).filter(([sku]) => productTypeCache[sku]).map(([, asin]) => asin));
  const asinsNeedingCategory = asinsFromInventory.filter((a) => !knownAsins.has(a));
  console.log(`Category lookup needed for ${asinsNeedingCategory.length} of ${asinsFromInventory.length} ASINs (rest already known).`);
  const categoriesByAsin = await fetchProductCategories(asinsNeedingCategory);
  console.log('Sample categories:', JSON.stringify(Object.entries(categoriesByAsin).slice(0, 10)));

  const asinToSku = {};
  for (const [sku, asin] of Object.entries(skuToAsinMap)) { asinToSku[asin] = sku; }
  const catBatch = db.batch();
  let catWrites = 0, catSkipped = 0;
  for (const [asin, category] of Object.entries(categoriesByAsin)) {
    const sku = asinToSku[asin];
    if (!sku) continue;
    if (productTypeCache[sku] === category) { catSkipped++; continue; }
    catBatch.update(db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`), { amazonProductType: category });
    snapPatch('inventory', `${ACCOUNT_LABEL}_${sku}`, { amazonProductType: category });
    productTypeCache[sku] = category;
    catWrites++;
  }
  if (catWrites > 0) await catBatch.commit();
  console.log(`Step 2b done: ${catWrites} category update(s) written, ${catSkipped} unchanged (skipped).`);

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

  console.log('Step 3a: stock guard (LOTS stock below 10 -> out of stock on Amazon)...');
  if (SYNC_MODE === 'full') await runStockGuard(sellerId).catch((e) => console.warn('Stock guard skipped (sync continues):', e.message || e));

  console.log('Step 3a2: removing listings that no longer exist on Amazon...');
  await pruneRemovedListings(asinsFromInventory).catch((e) => console.warn('Prune skipped (sync continues):', e.message || e));

  console.log('Step 3b: saving compact snapshot for the Amazon page...');
  await writeSnapshot();

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
const DEBUG_ID = /^debug:/i.test(process.env.SYNC_MODE || '') ? process.env.SYNC_MODE.slice(6).trim() : null;
if (DEBUG_ID) debugOrder(DEBUG_ID).then(() => process.exit(0)).catch((e) => { console.error('debug failed:', e.message || e); process.exit(1); });
else run().catch((err) => {
  console.error('spapi-sync failed:', err.message || err);
  console.error('Full error details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
