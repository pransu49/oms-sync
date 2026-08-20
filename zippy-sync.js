// zippy-sync.js
// Uses Zippy's own internal dashboard API (discovered via browser network capture),
// not the public REST docs — those never worked. This logs in the same way the
// browser does (AWS Cognito), then asks for shipment status by the exact Amazon
// order numbers already synced from OMS Guru — no ID-guessing needed since Zippy's
// own "orderNumber" field is literally the Amazon order number.

const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const COGNITO_URL = "https://cognito-idp.us-east-2.amazonaws.com/";
const COGNITO_CLIENT_ID = "38brrnlch2igpjussov7ue7tqr"; // captured from the live dashboard, not secret
const ZIPPY_API_BASE = "https://api.in.zippyy.ai";

// Uses a captured refresh token (from the browser's own persisted session) rather
// than email/password — Zippy's dashboard auto-refreshes its session this way, and
// we can do the same without needing to reverse-engineer the original SRP/password
// login flow.
async function zippyLogin() {
  const res = await fetch(COGNITO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: process.env.ZIPPY_REFRESH_TOKEN,
        DEVICE_KEY: null,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.AuthenticationResult) {
    throw new Error(`Zippy (Cognito refresh) login failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.AuthenticationResult.IdToken;
}

async function fetchShipmentsByOrderNumbers(idToken, orderNumbers) {
  const res = await fetch(`${ZIPPY_API_BASE}/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      status: null,
      filterType: "SHIPMENT_PURCHASED_AT",
      isAscending: false,
      subStatuses: null,
      manifestStatuses: null,
      carriers: null,
      carrierServices: null,
      storeIds: null,
      awbs: null,
      startTimestamp: null,
      endTimestamp: null,
      orderNumbers: orderNumbers,
      orderSources: null,
      orderTypes: null,
      orderTags: null,
      productNames: null,
      skuIds: null,
      excludeOrderTags: null,
      pageSize: orderNumbers.length,
      startOffset: null,
    }),
  });
  if (!res.ok) throw new Error(`/list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.shipments || [];
}

async function getOmsOrders() {
  const snap = await db.collection("aikm_admin").doc("omsOrders").collection("chunks").get();
  let orders = [];
  snap.forEach((doc) => { orders = orders.concat(doc.data().orders || []); });
  return orders;
}

function isSelfShip(o) {
  return (o.channel || "").toLowerCase().includes("amazon") && !!o.buyerPhone;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  console.log("Logging into Zippy...");
  console.log(`ZIPPY_REFRESH_TOKEN length seen by script: ${(process.env.ZIPPY_REFRESH_TOKEN || "").length} (should be 1778)`);
  const idToken = await zippyLogin();

  console.log("Reading OMS Guru orders...");
  const omsOrders = await getOmsOrders();
  const selfShip = omsOrders.filter(isSelfShip);
  const orderNumbers = [
    ...new Set(selfShip.map((o) => (o.channelOrderId || o.invoiceNumber || "").trim()).filter(Boolean)),
  ];
  console.log(`${omsOrders.length} OMS orders, ${selfShip.length} self-ship, ${orderNumbers.length} unique order numbers to check.`);

  let ok = 0, notFound = 0, failed = 0;
  for (const batch of chunk(orderNumbers, 100)) {
    try {
      const shipments = await fetchShipmentsByOrderNumbers(idToken, batch);
      const found = new Set();
      for (const s of shipments) {
        found.add(s.orderNumber);
        await db.collection("zippyShipments").doc(s.orderNumber).set(
          {
            status: s.status || null,
            subStatus: s.subStatus || null,
            awbNumber: s.trackingCode || null,
            courierName: (s.selectedRate && s.selectedRate.carrier) || null,
            orderNumber: s.orderNumber,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        ok++;
      }
      for (const num of batch) {
        if (!found.has(num)) {
          await db.collection("zippyShipments").doc(num).set(
            { error: "not_found", orderNumber: num, syncedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
          notFound++;
        }
      }
    } catch (e) {
      console.error("Batch failed:", e.message);
      failed += batch.length;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`Done. Matched: ${ok}, Not found in Zippy: ${notFound}, Errors: ${failed}`);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
