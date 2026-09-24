// spapi-sync.js
// Syncs one Amazon seller account via SP-API into Firestore:
//   - Orders (incl. status/cancellations)
//   - Inventory levels
//   - Competitive pricing (other sellers on your ASINs)
// Also applies pending write-back requests queued by the admin console:
//   - Price updates      (spapiPriceUpdates)      - SP-API project
//   - MRP updates        (spapiMrpUpdates)         - MAIN project
//   - HSN/tax code       (spapiHsnUpdates)         - MAIN project
//   - New listing create/map (spapiNewListingRequests) - SP-API project
//   - Refund requests    (spapiRefundRequests)     - SP-API project, MANUAL ONLY
//   - Listing deletions  (spapiListingDeletions)   - MAIN project

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');

// SP-API project (noworry-b7d56) — orders, inventory, pricing, price updates
const spaApp = admin.initializeApp(
  { credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) },
  'spaApp'
);
const db = spaApp.firestore();

// Main project (aikm--order-file) — write-back queues: HSN, MRP, listing deletions
const mainApp = admin.initializeApp(
  { credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) },
  'mainApp'
);
const dbMain = mainApp.firestore();

const MARKETPLACE_ID = 'A21TJRUUN4KGV'; // Amazon.in

const spClient = new SellingPartnerAPI({
  region: 'eu',
  refresh_token: process.env.SPAPI_REFRESH_TOKEN,
  credentials: {
    SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID,
    SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET,
  },
});

const ACCOUNT_LABEL = process.env.ACCOUNT_LABEL || 'account1';

const skuToAsinMap = {};
const productTypeCache = {};
const changedSkus = new Set();

async function loadProductTypeCache() {
  const snap = await db.collection('spapiInventory').where('account', '==', ACCOUNT_LABEL).get();
  snap.forEach((d) => {
    const data = d.data();
    if (data.sku && data.amazonProductType) productTypeCache[data.sku] = data.amazonProductType;
    if (data.sku && data.asin) skuToAsinMap[data.sku] = data.asin;
  });
  console.log(`productTypeCache loaded: ${Object.keys(productTypeCache).length} SKUs`);
}

function getProductTypeForSku(sku) {
  return productTypeCache[sku] || null;
}

async function syncOrders() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await spClient.callAPI({
    operation: 'getOrders',
    endpoint: 'orders',
    query: { MarketplaceIds: [MARKETPLACE_ID], CreatedAfter: since },
  });

  const orders = res.Orders || [];
  const batch = db.batch();
  let financeFailCount = 0;

  for (const order of orders) {
    let items = [];
    try {
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
          price,
          tax,
          taxPercent: exclTaxPrice > 0 ? Math.round((tax / exclTaxPrice) * 1000) / 10 : 0,
        };
      });
    } catch (e) {
      console.warn(`getOrderItems failed for ${order.AmazonOrderId}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 600));

    let amazonFees = null;
    try {
      const finRes = await spClient.callAPI({
        operation: 'listFinancialEventsByOrderId',
        endpoint: 'finances',
        path: { orderId: order.AmazonOrderId },
      });
      const shipmentEvents = finRes.payload?.FinancialEvents?.ShipmentEventList
        || finRes.FinancialEvents?.ShipmentEventList || [];
      let feeTotal = 0;
      let hasFeeData = false;
      shipmentEvents.forEach((se) => {
        (se.ShipmentItemList || []).forEach((item) => {
          (item.ItemFeeList || []).forEach((fee) => {
            const amt = parseFloat(fee.FeeAmount?.Amount);
            if (!isNaN(amt)) { feeTotal += amt; hasFeeData = true; }
          });
        });
      });
      if (hasFeeData) amazonFees = Math.abs(feeTotal);
    } catch (e) {
      financeFailCount++;
    }
    await new Promise((r) => setTimeout(r, 600));

    const ref = db.collection('spapiOrders').doc(`${ACCOUNT_LABEL}_${order.AmazonOrderId}`);
    batch.set(ref, {
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
      items,
      amazonFees,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  console.log(`Orders synced: ${orders.length}`);
  if (financeFailCount > 0) {
    console.log(`Finances API still blocked (${financeFailCount}/${orders.length} orders) - fees will be null until Amazon Support enables access.`);
  }
  return orders;
}

function extractWeightKg(name) {
  if (!name) return null;
  const m = name.match(/(\d+\.?\d*)\s?(kg|kgs|g|gm|gms|grams?|ml|mls?|l|litre|liter|litres|liters)\b/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
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
    const status = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    });
    console.log(`Poll ${attempt + 1}: status = ${status.processingStatus}`);
    if (status.processingStatus === 'DONE') { reportDocumentId = status.reportDocumentId; break; }
    if (status.processingStatus === 'FATAL' || status.processingStatus === 'CANCELLED') {
      throw new Error(`Report generation failed: ${status.processingStatus}`);
    }
  }

  if (!reportDocumentId) {
    console.log('Report not ready within polling window - will retry on next scheduled run.');
    return [];
  }

  const doc = await spClient.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId },
  });

  console.log('Report doc type:', typeof doc, Buffer.isBuffer(doc) ? '(Buffer)' : JSON.stringify(Object.keys(doc || {})));

  let docText;
  if (Buffer.isBuffer(doc)) {
    docText = doc.toString('utf-8');
  } else if (typeof doc === 'string') {
    docText = doc;
  } else if (doc && doc.url) {
    const zlib = require('zlib');
    const https = require('https');
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
  } else {
    console.log('Unrecognized report document shape:', JSON.stringify(doc).slice(0, 300));
    return [];
  }

  const lines = docText.split('\n').filter(Boolean);
  const headers = lines[0].split('\t').map(h => h.replace(/^\uFEFF/, '').trim());
  console.log('Report headers:', JSON.stringify(headers));
  const skuIdx = headers.indexOf('seller-sku');
  const qtyIdx = headers.indexOf('quantity');
  const priceIdx = headers.indexOf('price');
  const asinIdx = headers.indexOf('asin1');
  const nameIdx = headers.indexOf('item-name');
  const categoryIdx = headers.indexOf('zshop-category1');
  const mrpIdx = headers.indexOf('maximum-retail-price');
  console.log('Column indexes - sku:', skuIdx, 'name:', nameIdx, 'asin:', asinIdx, 'category:', categoryIdx, 'mrp:', mrpIdx);

  console.log('Fetching existing inventory docs for delta comparison...');
  const existingSnap = await db.collection('spapiInventory').where('account', '==', ACCOUNT_LABEL).get();
  const existingBySku = {};
  existingSnap.forEach((d) => {
    existingBySku[d.id] = d.data();
    const data = d.data();
    if (data.sku && data.amazonProductType) productTypeCache[data.sku] = data.amazonProductType;
  });

  const batch = db.batch();
  let changedCount = 0;
  let skippedCount = 0;
  const asins = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const sku = cols[skuIdx];
    if (!sku) continue;

    const asin = cols[asinIdx] || null;
    if (asin) { asins.push(asin); skuToAsinMap[sku] = asin; }

    const docId = `${ACCOUNT_LABEL}_${sku}`;
    const newData = {
      account: ACCOUNT_LABEL,
      sku,
      name: cols[nameIdx] || '',
      asin,
      category: cols[categoryIdx] || '',
      weightKg: extractWeightKg(cols[nameIdx] || ''),
      quantity: parseInt(cols[qtyIdx], 10) || 0,
      price: parseFloat(cols[priceIdx]) || null,
      mrp: mrpIdx >= 0 ? (parseFloat(cols[mrpIdx]) || null) : null,
    };
    const old = existingBySku[docId];
    const changed = !old
      || old.quantity !== newData.quantity
      || old.price !== newData.price
      || old.mrp !== newData.mrp
      || old.name !== newData.name
      || old.asin !== newData.asin
      || old.category !== newData.category;

    const hsnMissing = !old || (old.hsnCode == null && old.taxCode == null);
    if (changed || hsnMissing) changedSkus.add(sku);

    if (changed) {
      const ref = db.collection('spapiInventory').doc(docId);
      batch.set(ref, { ...newData, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      changedCount++;
    } else {
      skippedCount++;
    }
  }

  if (changedCount > 0) await batch.commit();
  console.log(`Inventory synced: ${changedCount} changed, ${skippedCount} unchanged (skipped write)`);
  const uniqueCategories = [...new Set(lines.slice(1).map(l => l.split('\t')[categoryIdx]).filter(Boolean))];
  console.log('Unique categories found:', JSON.stringify(uniqueCategories));
  return [...new Set(asins)];
}

async function fetchProductCategories(asinList) {
  const categories = {};
  let firstLogged = false;
  let failCount = 0;
  for (const asin of asinList) {
    try {
      const res = await spClient.callAPI({
        operation: 'getCatalogItem',
        endpoint: 'catalogItems',
        path: { asin },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['productTypes', 'summaries'] },
      });
      if (!firstLogged) {
        console.log('Sample getCatalogItem (category) response for', asin, ':', JSON.stringify(res).slice(0, 800));
        firstLogged = true;
      }
      const productTypes = res.productTypes || res.payload?.productTypes;
      const summaries = res.summaries || res.payload?.summaries;
      const cat = productTypes?.[0]?.productType || summaries?.[0]?.websiteDisplayGroup || null;
      if (cat) categories[asin] = cat;
    } catch (e) {
      failCount++;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  if (failCount > 0) console.log(`Category fetch failed for ${failCount}/${asinList.length} ASINs`);
  return categories;
}

async function fetchHsnTaxData(sellerId, skuList) {
  const results = {};
  let firstLogged = false;
  let failCount = 0;
  for (const sku of skuList) {
    try {
      const res = await spClient.callAPI({
        operation: 'getListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID], includedData: ['attributes'] },
      });
      if (!firstLogged) {
        console.log('Sample getListingsItem (HSN/tax) response for', sku, ':', JSON.stringify(res).slice(0, 1200));
        firstLogged = true;
      }
      const attrs = res.attributes || res.payload?.attributes || {};
      const externalInfo = attrs.external_product_information || [];
      const hsnEntry = externalInfo.find(e => (e.entity || '').toLowerCase().includes('hsn'));
      const hsnCode = hsnEntry ? hsnEntry.value : null;
      const taxCode = attrs.product_tax_code?.[0]?.value ?? null;
      if (hsnCode || taxCode) results[sku] = { hsnCode, taxCode };
    } catch (e) {
      failCount++;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  if (failCount > 0) console.log(`HSN/tax fetch failed for ${failCount}/${skuList.length} SKUs`);
  return results;
}

async function syncCompetitivePricing(asinList) {
  if (!asinList.length) return;

  const asinToSkus = {};
  for (const [sku, asin] of Object.entries(skuToAsinMap)) {
    if (!asinToSkus[asin]) asinToSkus[asin] = [];
    asinToSkus[asin].push(sku);
  }

  const mySellerId = process.env.SPAPI_SELLER_ID || null;

  console.log('Fetching existing competitive pricing docs for delta comparison...');
  const existingSnap = await db.collection('spapiCompetitivePricing').where('account', '==', ACCOUNT_LABEL).get();
  const existingByAsin = {};
  existingSnap.forEach((d) => { existingByAsin[d.id] = d.data(); });

  const batch = db.batch();
  let firstLogged = false;
  let changedCount = 0;
  let skippedCount = 0;
  let buyBoxHeld = 0, buyBoxLost = 0, buyBoxNone = 0, duplicatesFound = 0;

  for (const asin of asinList) {
    let offers = [];
    try {
      const res = await spClient.callAPI({
        operation: 'getItemOffers',
        endpoint: 'productPricing',
        path: { Asin: asin },
        query: { MarketplaceId: MARKETPLACE_ID, ItemCondition: 'New' },
      });
      if (!firstLogged) {
        console.log('Sample getItemOffers response shape for', asin, ':', JSON.stringify(res).slice(0, 500));
        firstLogged = true;
      }
      const rawOffers = res.Offers || res.payload?.Offers || [];
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
    } catch (e) {
      console.warn(`getItemOffers failed for ${asin}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 1200));

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
    const changed = !old
      || old.lowestCompetitorPrice !== lowest
      || old.rawOffers !== offers.length
      || old.buyBoxStatus !== buyBoxStatus
      || old.myPrice !== myPrice
      || old.iHoldBuyBox !== iHoldBuyBox
      || old.isDuplicate !== isDuplicate;

    if (changed) {
      const ref = db.collection('spapiCompetitivePricing').doc(docId);
      batch.set(ref, {
        account: ACCOUNT_LABEL,
        asin,
        mySkus: mySkusForAsin,
        isDuplicate,
        duplicateSkuCount: mySkusForAsin.length,
        myPrice,
        myLandedPrice,
        lowestCompetitorPrice: lowest,
        priceGapVsBuyBox,
        buyBoxStatus,
        iHoldBuyBox,
        buyBoxWinnerPrice: buyBoxWinner?.price ?? null,
        buyBoxWinnerSellerId: buyBoxWinner?.sellerId ?? null,
        rawOffers: offers.length,
        offers,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      changedCount++;
    } else {
      skippedCount++;
    }
  }

  if (changedCount > 0) await batch.commit();
  console.log(`Competitive pricing synced: ${changedCount} changed, ${skippedCount} unchanged of ${asinList.length} ASINs`);
  console.log(`Buy box summary — Held: ${buyBoxHeld} | Lost: ${buyBoxLost} | No offer: ${buyBoxNone} | Duplicates: ${duplicatesFound}`);
}

// ── Write-back functions ──────────────────────────────────────────────────────────
// spapiPriceUpdates      → db      (SP-API project)
// spapiMrpUpdates        → dbMain  (main project)
// spapiHsnUpdates        → dbMain  (main project)
// spapiNewListingRequests→ db      (SP-API project)
// spapiRefundRequests    → db      (SP-API project)
// spapiListingDeletions  → dbMain  (main project)

async function applyPendingPriceUpdates(sellerId) {
  const pendingSnap = await db.collection('spapiPriceUpdates')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) { console.log('No pending price updates.'); return; }
  console.log(`Applying ${pendingSnap.size} pending price update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newPrice } = doc.data();
    try {
      const productType = getProductTypeForSku(sku);
      if (!productType) throw new Error('No known product type for this SKU yet - wait for the next inventory sync.');
      await spClient.callAPI({
        operation: 'patchListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
        body: {
          productType,
          patches: [{
            op: 'replace',
            path: '/attributes/purchasable_offer',
            value: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', our_price: [{ schedule: [{ value_with_tax: newPrice }] }] }],
          }],
        },
      });
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`Price updated for SKU ${sku}: now ${newPrice}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`Price update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function applyPendingMrpUpdates(sellerId) {
  // ← dbMain: MRP updates queued from admin console (aikm--order-file)
  const pendingSnap = await dbMain.collection('spapiMrpUpdates')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) { console.log('No pending MRP updates.'); return; }
  console.log(`Applying ${pendingSnap.size} pending MRP update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newMrp } = doc.data();
    try {
      const productType = getProductTypeForSku(sku);
      if (!productType) throw new Error('No known product type for this SKU yet - wait for the next inventory sync.');
      await spClient.callAPI({
        operation: 'patchListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
        body: {
          productType,
          patches: [{
            op: 'replace',
            path: '/attributes/list_price',
            value: [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', value: newMrp }],
          }],
        },
      });
      await doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`MRP updated for SKU ${sku}: now ${newMrp}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`MRP update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function applyPendingHsnUpdates(sellerId) {
  // ← dbMain: HSN/tax updates queued from admin console (aikm--order-file)
  const pendingSnap = await dbMain.collection('spapiHsnUpdates')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) { console.log('No pending HSN/tax code updates.'); return; }
  console.log(`Applying ${pendingSnap.size} pending HSN update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newHsn } = doc.data();
    try {
      const productType = getProductTypeForSku(sku);
      if (!productType) throw new Error('No known product type for this SKU yet - wait for the next inventory sync.');
      await spClient.callAPI({
        operation: 'patchListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
        body: {
          productType,
          patches: [{
            op: 'replace',
            path: '/attributes/product_tax_code',
            value: [{ value: String(newHsn) }],
          }],
        },
      });
            aawait doc.ref.update({ status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp() });
changedSkus.add(sku);
// Also write the new taxCode directly to inventory so UI updates immediately
await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).update({ taxCode: newHsn });
console.log(`HSN updated for SKU ${sku}: now ${newHsn}`);
    } catch (e) {
      await doc.ref.update({ status: 'failed', error: e.message || String(e), failedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.warn(`HSN update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function applyPendingNewListings(sellerId) {
  const pendingSnap = await db.collection('spapiNewListingRequests')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) { console.log('No pending new-listing requests.'); return; }
  console.log(`Applying ${pendingSnap.size} pending new-listing request(s)...`);

  for (const doc of pendingSnap.docs) {
    const data = doc.data();
    const { sku, productType, title, brand, price, mrp, hsn, barcode, barcodeType, quantity } = data;
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
        operation: 'putListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
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
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) { console.log('No pending refund requests.'); return; }
  console.log(`Flagging ${pendingSnap.size} refund request(s) for manual action...`);

  const batch = db.batch();
  pendingSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'flagged_for_manual_action',
      flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      note: 'SP-API has no reliable programmatic refund for MFN orders - process manually in Seller Central > Manage Returns/Refunds.',
    });
  });
  await batch.commit();
}

async function applyPendingListingDeletions(sellerId) {
  // ← dbMain: listing deletions queued from admin console (aikm--order-file)
  const pendingSnap = await dbMain.collection('spapiListingDeletions')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) { console.log('No pending listing deletions.'); return; }
  console.log(`Applying ${pendingSnap.size} pending listing deletion(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku } = doc.data();
    try {
      const asin = skuToAsinMap[sku] || null;
      let invData = null;
      if (asin) {
        const existingSnap = await db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`).get();
        invData = existingSnap.exists ? existingSnap.data() : null;
      }
      await spClient.callAPI({
        operation: 'deleteListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
      });
      await db.collection('spapiDeletedListings').doc(`${ACCOUNT_LABEL}_${sku}_${Date.now()}`).set({
        account: ACCOUNT_LABEL,
        sku,
        name: invData?.name || null,
        asin: invData?.asin || asin || null,
        price: invData?.price || null,
        quantity: invData?.quantity || null,
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

async function run() {
  console.log('Step 0: testing basic connectivity (getMarketplaceParticipations)...');
  const test = await spClient.callAPI({ operation: 'getMarketplaceParticipations', endpoint: 'sellers' });
  console.log('Step 0 result:', JSON.stringify(test));

  console.log('Step 0a: loading product-type cache...');
  await loadProductTypeCache();

  const sellerId = process.env.SPAPI_SELLER_ID;
  if (sellerId) {
    console.log('Step 0b: applying any pending price updates...');
    await applyPendingPriceUpdates(sellerId);
    console.log('Step 0c: applying any pending MRP updates...');
    await applyPendingMrpUpdates(sellerId);
    console.log('Step 0d: applying any pending HSN/tax code updates...');
    await applyPendingHsnUpdates(sellerId);
    console.log('Step 0e: applying any pending new-listing requests...');
    await applyPendingNewListings(sellerId);
    console.log('Step 0f: applying any pending listing deletions...');
    await applyPendingListingDeletions(sellerId);
  } else {
    console.log('Step 0b-0f: SPAPI_SELLER_ID not set - skipping all listing write-backs this run.');
  }

  console.log('Step 0g: flagging any pending refund requests for manual action...');
  await flagPendingRefundRequests();

  console.log('Step 1: syncing orders...');
  const orders = await syncOrders();

  console.log('Step 2: syncing inventory...');
  const asinsFromInventory = await syncInventory();

  console.log('Step 2b: fetching real product categories for referral fee calc...');
  const categoriesByAsin = await fetchProductCategories(asinsFromInventory);
  console.log('Sample categories:', JSON.stringify(Object.entries(categoriesByAsin).slice(0, 10)));

  const asinToSku = {};
  for (const [sku, asin] of Object.entries(skuToAsinMap)) { asinToSku[asin] = sku; }
  const catBatch = db.batch();
  let catWrites = 0;
  let catSkipped = 0;
  for (const [asin, category] of Object.entries(categoriesByAsin)) {
    const sku = asinToSku[asin];
    if (!sku) continue;
    if (productTypeCache[sku] === category) { catSkipped++; continue; }
    const ref = db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`);
    catBatch.update(ref, { amazonProductType: category });
    productTypeCache[sku] = category;
    catWrites++;
  }
  if (catWrites > 0) await catBatch.commit();
  console.log(`Step 2b done: ${catWrites} category update(s) written, ${catSkipped} unchanged (skipped).`);

  console.log('Step 2c: checking HSN/tax for changed/new SKUs...');
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
        const ref = db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`);
        hsnBatch.update(ref, { hsnCode: data.hsnCode, taxCode: data.taxCode });
        hsnWrites++;
      }
      if (hsnWrites > 0) await hsnBatch.commit();
      console.log(`Step 2c done: ${hsnWrites} HSN/tax update(s) written for ${skusNeedingHsn.length} changed SKU(s).`);
    }
  } else {
    console.log('Step 2c skipped: SPAPI_SELLER_ID not set.');
  }

  console.log('Step 3: syncing competitive pricing...');
  await syncCompetitivePricing(asinsFromInventory);

  console.log('Step 4: testing Merchant Fulfillment API access (shipping labels)...');
  try {
    const mfnTest = await spClient.callAPI({
      operation: 'getEligibleShipmentServices',
      endpoint: 'merchantFulfillment',
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

run().catch((err) => {
  console.error('spapi-sync failed:', err.message || err);
  console.error('Full error details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
