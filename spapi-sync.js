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
  const res = await spClient.callAPI({
    operation: 'getInventorySummaries',
    endpoint: 'fbaInventory',
    query: {
      granularityType: 'Marketplace',
      granularityId: MARKETPLACE_ID,
      marketplaceIds: [MARKETPLACE_ID],
    },
  });

  const items = res.inventorySummaries || [];
  const batch = db.batch();

  for (const item of items) {
    const ref = db.collection('spapiInventory').doc(`${ACCOUNT_LABEL}_${item.sellerSku}`);
    batch.set(ref, {
      account: ACCOUNT_LABEL,
      sku: item.sellerSku,
      asin: item.asin,
      totalQuantity: item.totalQuantity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  console.log(`Inventory synced: ${items.length}`);
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
  await syncInventory();

  console.log('Step 3: syncing competitive pricing...');
  const asins = [...new Set(orders.map((o) => o.OrderItems?.[0]?.ASIN).filter(Boolean))];
  await syncCompetitivePricing(asins);

  console.log('SP-API sync complete.');
}

run().catch((err) => {
  console.error('spapi-sync failed:', err.message || err);
  console.error('Full error details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  process.exit(1);
});
