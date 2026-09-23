// spapi-sync.js
// Syncs one Amazon seller account via SP-API into Firestore:
//   - Orders (incl. status/cancellations)
//   - Inventory levels
//   - Competitive pricing (other sellers on your ASINs)
// Also applies pending write-back requests queued by the admin console:
//   - Price updates      (spapiPriceUpdates)      - existing
//   - MRP updates        (spapiMrpUpdates)         - new
//   - HSN/tax code       (spapiHsnUpdates)         - new
//   - New listing create/map (spapiNewListingRequests) - new
//   - Refund requests    (spapiRefundRequests)     - new, MANUAL ONLY (see note below)
//
// IMPORTANT — REFUNDS: Amazon's SP-API does not offer a reliable, generally-available
// operation for a third-party (MFN) seller to programmatically issue a buyer refund.
// Refunds are normally done through Seller Central's Manage Returns/Refunds flow, or
// through Amazon's return workflow. Rather than guess at an API call that moves real
// money, applyPendingRefundRequests() below only FLAGS the request for you to action
// manually in Seller Central - it never calls Amazon. If Amazon later documents a
// proper refund endpoint for your account type, this can be upgraded.
//
// CAUTION ON THE OTHER NEW WRITE-BACK OPERATIONS: like the existing price-update code,
// the exact attribute names/shapes for MRP and HSN below follow Amazon's commonly
// documented pattern, but SP-API schemas can vary by product category. These have NOT
// been run against a real listing yet - watch Seller Central closely after the first
// few updates of each type before trusting this unattended.
//
// QUOTA FIX (this version): syncInventory() and syncCompetitivePricing() now read what's
// already stored first and only write docs that actually changed, instead of rewriting
// every SKU/ASIN on every run. Step 2b (category backfill) now reuses the sku<->asin map
// built during inventory sync instead of running one Firestore query per ASIN. This is
// the same "delta write" fix already used in sync.js (OMS) and nimbus-sync.js.

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MARKETPLACE_ID = 'A21TJRUUN4KGV'; // Amazon.in

const spClient = new SellingPartnerAPI({
  region: 'eu', // India falls under SP-API's EU region
  refresh_token: process.env.SPAPI_REFRESH_TOKEN,
  credentials: {
    SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID,
    SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET,
  },
});

const ACCOUNT_LABEL = process.env.ACCOUNT_LABEL || 'account1'; // lets us tag data per seller account later
const skuToAsinMap = {}; // filled during syncInventory, reused in Step 2b to avoid per-ASIN queries

async function syncOrders() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h
  const res = await spClient.callAPI({
    operation: 'getOrders',
    endpoint: 'orders',
    query: {
      MarketplaceIds: [MARKETPLACE_ID],
      CreatedAfter: since,
    },
  });

  const orders = res.Orders || [];
  const batch = db.batch();
  let financeFailCount = 0;

  for (const order of orders) {
    // Fetch line-item detail (name, price, tax) - not included in the base Orders call.
    let items = [];
    try {
      const itemsRes = await spClient.callAPI({
        operation: 'getOrderItems',
        endpoint: 'orders',
        path: { orderId: order.AmazonOrderId },
      });
      items = (itemsRes.OrderItems || []).map((li) => {
        const price = parseFloat(li.ItemPrice?.Amount) || 0; // tax-inclusive price Amazon charged the buyer
        const tax = parseFloat(li.ItemTax?.Amount) || 0;
        const exclTaxPrice = price - tax; // back out the base price to get the real GST rate
        return {
          title: li.Title || '',
          asin: li.ASIN || '',
          sku: li.SellerSKU || '',
          qty: li.QuantityOrdered || 0,
          price,
          tax,
          taxPercent: exclTaxPrice > 0 ? Math.round((tax / exclTaxPrice) * 1000) / 10 : 0, // one decimal place
        };
      });
    } catch (e) {
      console.warn(`getOrderItems failed for ${order.AmazonOrderId}:`, e.message || e);
    }
    // Amazon rate-limits GetOrderItems fairly tightly - small delay between calls.
    await new Promise((r) => setTimeout(r, 600));

    // Fetch actual Amazon fees for this order via Finances API. Recently-placed orders
    // may not have settled financial events yet - that's normal, not an error.
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
      // Amazon reports fees as negative amounts (money taken from seller) - store as a
      // positive "cost" figure so it's intuitive to subtract in profit calculations.
      if (hasFeeData) amazonFees = Math.abs(feeTotal);
    } catch (e) {
      financeFailCount++;
    }
    await new Promise((r) => setTimeout(r, 600));

    const ref = db.collection('spapiOrders').doc(`${ACCOUNT_LABEL}_${order.AmazonOrderId}`);
    batch.set(ref, {
      account: ACCOUNT_LABEL,
      orderId: order.AmazonOrderId,
      status: order.OrderStatus, // e.g. Pending, Shipped, Canceled
      isCanceled: order.OrderStatus === 'Canceled',
      total: order.OrderTotal?.Amount || null,
      purchaseDate: order.PurchaseDate,
      fulfillmentChannel: order.FulfillmentChannel, // AFN=FBA, MFN=self-ship/EasyShip
      isEasyShip: !!order.EasyShipShipmentStatus, // presence of this field means Easy Ship, not plain Self-Ship
      shipServiceLevel: order.ShipServiceLevel || null,
      earliestShipDate: order.EarliestShipDate || null,
      latestShipDate: order.LatestShipDate || null, // the "ship by" deadline shown in Seller Central
      items,
      amazonFees, // total referral/closing/shipping fees Amazon charged - null if not yet settled
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

// Extracts an approximate package weight (in kg) from a product name, e.g.
// "Surf Excel 500 g" -> 0.5, "Listerine 500ml" -> 0.5 (assumes ~1g/ml for liquids,
// a reasonable approximation for most FMCG/personal care products), "Dabur Oil 1L" -> 1.
// Returns null if no weight/volume pattern is found in the name.
function extractWeightKg(name) {
  if (!name) return null;
  const m = name.match(/(\d+\.?\d*)\s?(kg|kgs|g|gm|gms|grams?|ml|mls?|l|litre|liter|litres|liters)\b/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('kg')) return num;
  if (unit.startsWith('g')) return num / 1000;
  if (unit.startsWith('ml')) return num / 1000; // ~1g/ml approximation
  if (unit.startsWith('l')) return num; // 1 litre ~ 1kg approximation
  return null;
}

async function syncInventory() {
  // Self-ship/Easy Ship sellers don't use FBA inventory - use the Reports API instead,
  // which gives SKU + quantity + price for every listing in one file.

  console.log('Requesting merchant listings report...');
  const createRes = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body: {
      reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
      marketplaceIds: [MARKETPLACE_ID],
    },
  });

  const reportId = createRes.reportId;
  console.log('Report requested, id:', reportId);

  // Poll until the report is ready (usually 30s-2min, occasionally longer under load)
  let reportDocumentId;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 20000)); // wait 20s between checks
    const status = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    });
    console.log(`Poll ${attempt + 1}: status = ${status.processingStatus}`);
    if (status.processingStatus === 'DONE') {
      reportDocumentId = status.reportDocumentId;
      break;
    }
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
    // Library returned metadata only - download and decompress manually.
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
  console.log('Column indexes - sku:', skuIdx, 'name:', nameIdx, 'asin:', asinIdx, 'category:', categoryIdx);

  // QUOTA FIX: read what's already stored ONCE, so we only write rows that actually
  // changed instead of rewriting every SKU (with a fresh timestamp) on every run.
  console.log('Fetching existing inventory docs for delta comparison...');
  const existingSnap = await db.collection('spapiInventory').where('account', '==', ACCOUNT_LABEL).get();
  const existingBySku = {};
  existingSnap.forEach((d) => { existingBySku[d.id] = d.data(); });

  const batch = db.batch();
  let changedCount = 0;
  let skippedCount = 0;
  const asins = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const sku = cols[skuIdx];
    if (!sku) continue;

    const asin = cols[asinIdx] || null;
    if (asin) {
      asins.push(asin);
      skuToAsinMap[sku] = asin;
    }

    const docId = `${ACCOUNT_LABEL}_${sku}`;
    const newData = {
      account: ACCOUNT_LABEL,
      sku,
      name: cols[nameIdx] || '',
      asin,
      category: cols[categoryIdx] || '',
      weightKg: extractWeightKg(cols[nameIdx] || ''), // approximate, parsed from product name
      quantity: parseInt(cols[qtyIdx], 10) || 0,
      price: parseFloat(cols[priceIdx]) || null,
    };
    const old = existingBySku[docId];
    const changed = !old
      || old.quantity !== newData.quantity
      || old.price !== newData.price
      || old.name !== newData.name
      || old.asin !== newData.asin
      || old.category !== newData.category;

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

// Fetches Amazon's actual product category/type per ASIN (needed for referral fee lookup -
// the merchant listings report's zshop-category1 field is a legacy field Amazon leaves blank).
async function fetchProductCategories(asinList) {
  const categories = {}; // asin -> category/productType string
  let firstLogged = false;
  let failCount = 0;
  for (const asin of asinList) {
    try {
      const res = await spClient.callAPI({
        operation: 'getCatalogItem',
        endpoint: 'catalogItems',
        path: { asin },
        query: {
          marketplaceIds: [MARKETPLACE_ID],
          includedData: ['productTypes', 'summaries'],
        },
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
// Fetches HSN code + tax classification per SKU via the Listings Items API.
// CONFIRMED (verified against a real listing, Sept 2026): HSN is stored under the
// generic "external_product_information" pair, entity="HSN Code" / value=<the number>.
// "product_tax_code" (e.g. "A_GEN_STANDARDtoREDUCED2025") is a separate thing - Amazon's
// own GST-bracket classification, not the HSN number itself. Both are stored below.
async function fetchHsnTaxData(sellerId, skuList) {
  const results = {}; // sku -> { hsnCode, taxCode }
  let firstLogged = false;
  let failCount = 0;
  for (const sku of skuList) {
    try {
      const res = await spClient.callAPI({
        operation: 'getListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: {
          marketplaceIds: [MARKETPLACE_ID],
          includedData: ['attributes'],
        },
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

  // QUOTA FIX: same delta-write treatment as inventory - competitor prices don't
  // change every 4 hours for every ASIN, so skip rewriting the ones that didn't move.
  console.log('Fetching existing competitive pricing docs for delta comparison...');
  const existingSnap = await db.collection('spapiCompetitivePricing').where('account', '==', ACCOUNT_LABEL).get();
  const existingByAsin = {};
  existingSnap.forEach((d) => { existingByAsin[d.id] = d.data(); });

  const batch = db.batch();
  let firstLogged = false;
  let changedCount = 0;
  let skippedCount = 0;

  for (const asin of asinList) {
    let offers = [];
    try {
      const res = await spClient.callAPI({
        operation: 'getItemOffers',
        endpoint: 'productPricing',
        path: { Asin: asin },
        query: {
          MarketplaceId: MARKETPLACE_ID,
          ItemCondition: 'New',
        },
      });

      if (!firstLogged) {
        console.log('Sample getItemOffers response shape for', asin, ':', JSON.stringify(res).slice(0, 500));
        firstLogged = true;
      }

      // Handle both possible response shapes - library may or may not unwrap the payload envelope.
      const rawOffers = res.Offers || res.payload?.Offers || [];
      offers = rawOffers.map((o) => ({
        sellerId: o.SellerId || '',
        price: parseFloat(o.ListingPrice?.Amount) || null,
        shipping: parseFloat(o.Shipping?.Amount) || 0,
        isBuyBoxWinner: !!o.IsBuyBoxWinner,
        isFeatured: !!o.IsFeaturedMerchant,
        condition: o.SubCondition || 'New',
      })).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } catch (e) {
      console.warn(`getItemOffers failed for ${asin}:`, e.message || e);
    }
    // Rate-limit friendly delay between ASINs.
    await new Promise((r) => setTimeout(r, 1200));

    const lowest = offers[0]?.price ?? null;
    const docId = `${ACCOUNT_LABEL}_${asin}`;
    const old = existingByAsin[docId];
    const changed = !old || old.lowestCompetitorPrice !== lowest || old.rawOffers !== offers.length;

    if (changed) {
      const ref = db.collection('spapiCompetitivePricing').doc(docId);
      batch.set(ref, {
        account: ACCOUNT_LABEL,
        asin,
        lowestCompetitorPrice: lowest,
        rawOffers: offers.length,
        offers, // full list: every seller's price, shipping, buy-box status
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      changedCount++;
    } else {
      skippedCount++;
    }
  }

  if (changedCount > 0) await batch.commit();
  console.log(`Competitive pricing synced: ${changedCount} changed, ${skippedCount} unchanged (skipped) of ${asinList.length} ASINs`);
}

// Looks up the stored Amazon product type for a SKU (needed by every Listings Items
// API call below - Amazon requires it on every patch/put, category-specific schema).
async function getProductTypeForSku(sku) {
  const invSnap = await db.collection('spapiInventory')
    .where('account', '==', ACCOUNT_LABEL)
    .where('sku', '==', sku)
    .limit(1)
    .get();
  return invSnap.empty ? null : (invSnap.docs[0].data().amazonProductType || null);
}

// Applies any pending price-change requests queued by the admin console (Firestore
// collection `spapiPriceUpdates`, one doc per request) to the REAL Amazon listing via
// the Listings Items API. Each doc gets its status written back (applied/failed) so the
// admin console can show the person what actually happened, instead of assuming success.
//
// NOTE: this patch body (purchasable_offer -> our_price -> schedule -> value_with_tax) is
// Amazon's standard documented shape for a price-only update, but SP-API's exact schema can
// vary by product type/category. This has NOT been run against a real listing yet - the
// first few updates should be watched closely (check Seller Central after each one) before
// trusting this unattended.
async function applyPendingPriceUpdates(sellerId) {
  const pendingSnap = await db.collection('spapiPriceUpdates')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) {
    console.log('No pending price updates.');
    return;
  }
  console.log(`Applying ${pendingSnap.size} pending price update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newPrice } = doc.data();
    try {
      const productType = await getProductTypeForSku(sku);
      if (!productType) {
        throw new Error('No known product type for this SKU yet - wait for the next inventory sync, or update manually in Seller Central first.');
      }

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
            value: [{
              marketplace_id: MARKETPLACE_ID,
              currency: 'INR',
              our_price: [{ schedule: [{ value_with_tax: newPrice }] }],
            }],
          }],
        },
      });

      await doc.ref.update({
        status: 'applied',
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Price updated for SKU ${sku}: now ${newPrice}`);
    } catch (e) {
      await doc.ref.update({
        status: 'failed',
        error: e.message || String(e),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`Price update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800)); // rate-limit friendly delay
  }
}

// NEW: MRP updates. Same pattern as price updates. Amazon's commonly documented
// attribute for MRP on India listings is "list_price" - this can vary by category,
// so watch the first few of these closely in Seller Central.
async function applyPendingMrpUpdates(sellerId) {
  const pendingSnap = await db.collection('spapiMrpUpdates')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) {
    console.log('No pending MRP updates.');
    return;
  }
  console.log(`Applying ${pendingSnap.size} pending MRP update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newMrp } = doc.data();
    try {
      const productType = await getProductTypeForSku(sku);
      if (!productType) {
        throw new Error('No known product type for this SKU yet - wait for the next inventory sync.');
      }

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
            value: [{
              marketplace_id: MARKETPLACE_ID,
              currency: 'INR',
              value: newMrp,
            }],
          }],
        },
      });

      await doc.ref.update({
        status: 'applied',
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`MRP updated for SKU ${sku}: now ${newMrp}`);
    } catch (e) {
      await doc.ref.update({
        status: 'failed',
        error: e.message || String(e),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`MRP update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

// NEW: HSN / GST tax-code updates. Amazon India's attribute for this is
// "product_tax_code" - the GST% applied at checkout follows automatically from the
// HSN code you set here (there isn't a separate "set tax percent directly" field).
async function applyPendingHsnUpdates(sellerId) {
  const pendingSnap = await db.collection('spapiHsnUpdates')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) {
    console.log('No pending HSN/tax code updates.');
    return;
  }
  console.log(`Applying ${pendingSnap.size} pending HSN update(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku, newHsn } = doc.data();
    try {
      const productType = await getProductTypeForSku(sku);
      if (!productType) {
        throw new Error('No known product type for this SKU yet - wait for the next inventory sync.');
      }

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

      await doc.ref.update({
        status: 'applied',
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`HSN updated for SKU ${sku}: now ${newHsn}`);
    } catch (e) {
      await doc.ref.update({
        status: 'failed',
        error: e.message || String(e),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`HSN update FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

// NEW: Create or map a new listing via putListingsItem. This is the riskiest write-back
// operation here - a full listing needs many required attributes that vary heavily by
// category (title, bullet points, images, brand, barcode, etc.). This implementation
// only sends the fields the admin console form actually collects; Amazon will reject
// the request if required category-specific attributes are missing, and the error
// message (stored back on the doc) will say which ones. Treat every one of these as
// needing a manual check in Seller Central afterward, at least for the first several.
async function applyPendingNewListings(sellerId) {
  const pendingSnap = await db.collection('spapiNewListingRequests')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) {
    console.log('No pending new-listing requests.');
    return;
  }
  console.log(`Applying ${pendingSnap.size} pending new-listing request(s)...`);

  for (const doc of pendingSnap.docs) {
    const data = doc.data();
    const { sku, productType, title, brand, price, mrp, hsn, barcode, barcodeType, quantity } = data;
    try {
      if (!sku || !productType) {
        throw new Error('Missing SKU or productType - both are required to create/map a listing.');
      }

      const attributes = {};
      if (title) attributes.item_name = [{ value: title, marketplace_id: MARKETPLACE_ID }];
      if (brand) attributes.brand = [{ value: brand, marketplace_id: MARKETPLACE_ID }];
      if (price != null) {
        attributes.purchasable_offer = [{
          marketplace_id: MARKETPLACE_ID,
          currency: 'INR',
          our_price: [{ schedule: [{ value_with_tax: price }] }],
        }];
      }
      if (mrp != null) {
        attributes.list_price = [{ marketplace_id: MARKETPLACE_ID, currency: 'INR', value: mrp }];
      }
      if (hsn) {
        attributes.product_tax_code = [{ value: String(hsn) }];
      }
      if (barcode) {
        attributes.externally_assigned_product_identifier = [{
          type: (barcodeType || 'ean').toLowerCase(),
          value: String(barcode),
          marketplace_id: MARKETPLACE_ID,
        }];
      }
      if (quantity != null) {
        attributes.fulfillment_availability = [{
          fulfillment_channel_code: 'DEFAULT',
          quantity: quantity,
        }];
      }

      await spClient.callAPI({
        operation: 'putListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
        body: { productType, attributes },
      });

      await doc.ref.update({
        status: 'applied',
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`New listing created/mapped for SKU ${sku}`);
    } catch (e) {
      await doc.ref.update({
        status: 'failed',
        error: e.message || String(e),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`New listing request FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

// NEW: Refund requests. Does NOT call Amazon - see the top-of-file note for why.
// Just flips status so the admin console can show "flagged for manual action" instead
// of leaving the request stuck as "pending" forever.
async function flagPendingRefundRequests() {
  const pendingSnap = await db.collection('spapiRefundRequests')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) {
    console.log('No pending refund requests.');
    return;
  }
  console.log(`Flagging ${pendingSnap.size} refund request(s) for manual action (no Amazon API call is made)...`);

  const batch = db.batch();
  pendingSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'flagged_for_manual_action',
      flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      note: 'SP-API has no reliable programmatic refund for MFN orders - process this manually in Seller Central > Manage Returns/Refunds.',
    });
  });
  await batch.commit();
}

// Applies any pending listing-deletion requests queued by the admin console.
async function applyPendingListingDeletions(sellerId) {
  const pendingSnap = await db.collection('spapiListingDeletions')
    .where('account', '==', ACCOUNT_LABEL)
    .where('status', '==', 'pending')
    .get();

  if (pendingSnap.empty) {
    console.log('No pending listing deletions.');
    return;
  }
  console.log(`Applying ${pendingSnap.size} pending listing deletion(s)...`);

  for (const doc of pendingSnap.docs) {
    const { sku } = doc.data();
    try {
      // Snapshot the listing's current data before deleting, so we can archive it.
      const invSnap = await db.collection('spapiInventory')
        .where('account', '==', ACCOUNT_LABEL)
        .where('sku', '==', sku)
        .limit(1)
        .get();
      const invData = invSnap.empty ? null : invSnap.docs[0].data();

      await spClient.callAPI({
        operation: 'deleteListingsItem',
        endpoint: 'listingsItems',
        path: { sellerId, sku },
        query: { marketplaceIds: [MARKETPLACE_ID] },
      });

      await db.collection('spapiDeletedListings').doc(`${ACCOUNT_LABEL}_${sku}_${Date.now()}`).set({
        account: ACCOUNT_LABEL,
        sku,
        name: invData ? invData.name : null,
        asin: invData ? invData.asin : null,
        price: invData ? invData.price : null,
        quantity: invData ? invData.quantity : null,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await doc.ref.update({
        status: 'applied',
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Listing deleted for SKU ${sku}`);
    } catch (e) {
      await doc.ref.update({
        status: 'failed',
        error: e.message || String(e),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.warn(`Listing deletion FAILED for SKU ${sku}:`, e.message || e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function run() {
  console.log('Step 0: testing basic connectivity (getMarketplaceParticipations)...');
  const test = await spClient.callAPI({
    operation: 'getMarketplaceParticipations',
    endpoint: 'sellers',
  });
  console.log('Step 0 result:', JSON.stringify(test));

  // Needed for all Listings Items API calls (price/MRP/HSN/new listing) - this is your
  // fixed Merchant Token, found in Seller Central under Settings -> Account Info.
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
  // QUOTA FIX: reuse the sku<->asin map built during syncInventory instead of running
  // one Firestore query per ASIN (that was the single biggest read source).
  const asinToSku = {};
  for (const [sku, asin] of Object.entries(skuToAsinMap)) { asinToSku[asin] = sku; }
  const catBatch = db.batch();
  let catWrites = 0;
  for (const [asin, category] of Object.entries(categoriesByAsin)) {
    const sku = asinToSku[asin];
    if (!sku) continue;
    const ref = db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`);
    catBatch.update(ref, { amazonProductType: category });
    catWrites++;
  }
  if (catWrites > 0) await catBatch.commit();
  console.log(`Step 2b done: ${catWrites} category update(s) written.`);

   console.log('Step 2c: fetching HSN/tax data...');
  if (sellerId) {
    const skuList = Object.keys(skuToAsinMap);
    const hsnData = await fetchHsnTaxData(sellerId, skuList);
    const hsnBatch = db.batch();
    let hsnWrites = 0;
    for (const [sku, data] of Object.entries(hsnData)) {
      const ref = db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`);
      hsnBatch.update(ref, { hsnCode: data.hsnCode, taxCode: data.taxCode });
      hsnWrites++;
    }
    if (hsnWrites > 0) await hsnBatch.commit();
    console.log(`Step 2c done: ${hsnWrites} HSN/tax update(s) written.`);
  } else {
    console.log('Step 2c skipped: SPAPI_SELLER_ID not set.');
  }

  console.log('Step 3: syncing competitive pricing...');
  await syncCompetitivePricing(asinsFromInventory);

  console.log('Step 4: testing Merchant Fulfillment API access (shipping labels)...');
  try {
    // Placeholder data - purely to check whether this API is authorized at all for this
    // app/account. A permission/role error looks very different from a data-validation
    // error, so even a "wrong" address here still tells us what we need to know.
    const mfnTest = await spClient.callAPI({
      operation: 'getEligibleShipmentServices',
      endpoint: 'merchantFulfillment',
      body: {
        ShipmentRequestDetails: {
          AmazonOrderId: orders[0] ? orders[0].AmazonOrderId : '000-0000000-0000000',
          ItemList: [{ OrderItemId: 'TEST', Quantity: 1 }],
          ShipFromAddress: {
            Name: 'Praso Enterprises',
            AddressLine1: 'Test Address Line 1',
            City: 'Delhi',
            StateOrRegion: 'Delhi',
            PostalCode: '110001',
            CountryCode: 'IN',
            Phone: '9999999999',
          },
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
