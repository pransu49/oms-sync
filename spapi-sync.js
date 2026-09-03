// spapi-sync.js
// Syncs one Amazon seller account via SP-API into Firestore:
//   - Orders (incl. status/cancellations)
//   - Inventory levels
//   - Competitive pricing (other sellers on your ASINs)
// Profit calc (needs Lots cost export + GST mapping) added once those files are shared.

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

  for (const order of orders) {
    const ref = db.collection('spapiOrders').doc(`${ACCOUNT_LABEL}_${order.AmazonOrderId}`);
    batch.set(ref, {
      account: ACCOUNT_LABEL,
      orderId: order.AmazonOrderId,
      status: order.OrderStatus, // e.g. Pending, Shipped, Canceled
      isCanceled: order.OrderStatus === 'Canceled',
      total: order.OrderTotal?.Amount || null,
      purchaseDate: order.PurchaseDate,
      fulfillmentChannel: order.FulfillmentChannel, // AFN=FBA, MFN=self-ship
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  console.log(`Orders synced: ${orders.length}`);
  return orders;
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

  // Poll until the report is ready (usually 30s-2min)
  let reportDocumentId;
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((r) => setTimeout(r, 15000)); // wait 15s between checks
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
  const headers = lines[0].split('\t');
  const skuIdx = headers.indexOf('seller-sku');
  const qtyIdx = headers.indexOf('quantity');
  const priceIdx = headers.indexOf('price');
  const asinIdx = headers.indexOf('asin1');

  const batch = db.batch();
  let count = 0;
  const asins = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const sku = cols[skuIdx];
    if (!sku) continue;

    const asin = cols[asinIdx] || null;
    if (asin) asins.push(asin);

    const ref = db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${sku}`);
    batch.set(ref, {
      account: ACCOUNT_LABEL,
      sku,
      asin,
      quantity: parseInt(cols[qtyIdx], 10) || 0,
      price: parseFloat(cols[priceIdx]) || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    count++;
  }

  await batch.commit();
  console.log(`Inventory synced: ${count} SKUs`);
  return [...new Set(asins)];
}

async function syncCompetitivePricing(asinList) {
  if (!asinList.length) return;

  // API allows up to 20 ASINs per call
  const chunks = [];
  for (let i = 0; i < asinList.length; i += 20) chunks.push(asinList.slice(i, i + 20));

  const batch = db.batch();

  for (const chunk of chunks) {
    const res = await spClient.callAPI({
      operation: 'getCompetitivePricing',
      endpoint: 'productPricing',
      query: {
        MarketplaceId: MARKETPLACE_ID,
        Asins: chunk,
        ItemType: 'Asin',
      },
    });

    for (const result of res || []) {
      const asin = result.Product?.Identifiers?.MarketplaceASIN?.ASIN;
      const prices = result.Product?.CompetitivePricing?.CompetitivePrices || [];
      const lowest = prices
        .map((p) => p.Price?.LandedPrice?.Amount)
        .filter((v) => v !== undefined)
        .sort((a, b) => a - b)[0];

      if (asin) {
        const ref = db.collection('spapiCompetitivePricing').doc(`${ACCOUNT_LABEL}_${asin}`);
        batch.set(ref, {
          account: ACCOUNT_LABEL,
          asin,
          lowestCompetitorPrice: lowest ?? null,
          rawOffers: prices.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }

  await batch.commit();
  console.log(`Competitive pricing synced for ${asinList.length} ASINs`);
}

async function run() {
  console.log('Step 0: testing basic connectivity (getMarketplaceParticipations)...');
  const test = await spClient.callAPI({
    operation: 'getMarketplaceParticipations',
    endpoint: 'sellers',
  });
  console.log('Step 0 result:', JSON.stringify(test));

  console.log('Step 1: syncing orders...');
  const orders = await syncOrders();

  console.log('Step 2: syncing inventory...');
  const asinsFromInventory = await syncInventory();

  console.log('Step 3: syncing competitive pricing...');
  await syncCompetitivePricing(asinsFromInventory);

  console.log('SP-API sync complete.');
}

run().catch((err) => {
  console.error('spapi-sync failed:', err.message || err);
  console.error('Full error details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
