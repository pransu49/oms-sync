// zippy-sync.js
// github.com/pransu49/oms-sync
//
// LOGIN: uses Zippy's real internal dashboard API (AWS Cognito, via a captured
// refresh token) — the public "external" REST API (sellingpartnerapi-in.zippyy.ai)
// was tried extensively and never worked for this account; this is confirmed
// working against real data.
//
// MATCHING: looks up shipments by orderNumber (Zippy's own field, which is
// literally the Amazon order number, e.g. "407-2150650-8521917") — confirmed by
// inspecting real API responses, far more reliable than AWB matching.
//
// FREE-TIER FIX (writes): only writes to Firestore when a shipment's status
// actually changed, and skips re-checking orders already in a final state
// (Delivered / RTO Delivered / Cancelled).
//
// FREE-TIER FIX (reads): compares against a single small "index" document
// instead of reading the entire zippyShipments collection every run.

const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

const COGNITO_URL = "https://cognito-idp.us-east-2.amazonaws.com/";
const COGNITO_CLIENT_ID = "38brrnlch2igpjussov7ue7tqr";
const ZIPPY_API_BASE = "https://api.in.zippyy.ai";
const FINAL_STATUSES = ["delivered", "rto_delivered", "cancelled", "cancelled_by_customer"];
const INDEX_DOC = db.collection("aikm_admin").doc("zippyShipmentsIndex");

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
    const isExpired = JSON.stringify(data).toLowerCase().includes("refresh token has expired")
      || JSON.stringify(data).toLowerCase().includes("invalid refresh token")
      || JSON.stringify(data).toLowerCase().includes("notauthorized");
    if (isExpired) {
      throw new Error(
        `ZIPPY REFRESH TOKEN EXPIRED — likely password was changed on Zippy. ` +
        `Fix: log into Zippy dashboard, grab new refresh_token from DevTools > Network > cognito request, ` +
        `update ZIPPY_REFRESH_TOKEN secret in GitHub. Raw error: ${res.status} ${JSON.stringify(data)}`
      );
    }
    throw new Error(`Zippy (Cognito refresh) login failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.AuthenticationResult.IdToken;
}

async function fetchShipmentsByOrderNumbers(idToken, orderNumbers) {
  const res = await fetch(`${ZIPPY_API_BASE}/cnvt/shipment/list`, {
    method: "POST",
        headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      "x-api-version": "1",
      "Origin": "https://in.app.zippyy.ai",
      "Referer": "https://in.app.zippyy.ai/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      status: null, filterType: "SHIPMENT_PURCHASED_AT", isAscending: false,
      subStatuses: null, manifestStatuses: null, carriers: null, carrierServices: null,
      storeIds: null, awbs: null, startTimestamp: null, endTimestamp: null,
      orderNumbers, orderSources: null, orderTypes: null, orderTags: null,
      productNames: null, skuIds: null, excludeOrderTags: null,
      warehouseId: null, pageSize: orderNumbers.length, startOffset: null,
    }),
  });
  if (!res.ok) throw new Error(`/cnvt/shipment/list failed: ${res.status} ${await res.text()}`);
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

function isFinal(status) {
  return FINAL_STATUSES.includes((status || "").toLowerCase());
}

function changed(prev, next) {
  if (!prev) return true;
  return (
    prev.status !== next.status ||
    prev.subStatus !== next.subStatus ||
    prev.awbNumber !== next.awbNumber ||
    prev.courierName !== next.courierName ||
    prev.error !== next.error
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  console.log("Logging into Zippy...");
  const idToken = await zippyLogin();

  console.log("Reading OMS Guru orders...");
  const omsOrders = await getOmsOrders();
  const selfShip = omsOrders.filter(isSelfShip);
  const orderNumbers = [
    ...new Set(selfShip.map((o) => (o.channelOrderId || o.invoiceNumber || "").trim()).filter(Boolean)),
  ];

  console.log("Reading shipment status index (1 read, not a full collection scan)...");
  const indexSnap = await INDEX_DOC.get();
  const existing = (indexSnap.exists && indexSnap.data().index) || {};

  const toCheck = orderNumbers.filter((num) => !isFinal(existing[num] && existing[num].status));
  console.log(`${omsOrders.length} OMS orders, ${orderNumbers.length} unique self-ship order numbers, ${toCheck.length} still need a check (rest already final).`);

  let batch = db.batch();
  let batchCount = 0;
  let written = 0, unchanged = 0, failed = 0;
  const newIndex = { ...existing };

  for (const group of chunk(toCheck, 100)) {
    try {
      const shipments = await fetchShipmentsByOrderNumbers(idToken, group);
      const foundBy = {};
      shipments.forEach((s) => { foundBy[s.orderNumber] = s; });

      for (const num of group) {
        const s = foundBy[num];
        const next = s
          ? {
              status: s.status || null,
              subStatus: s.subStatus || null,
              awbNumber: s.trackingCode || null,
              courierName: (s.selectedRate && s.selectedRate.carrier) || null,
              orderNumber: num,
            }
          : { error: "not_found", orderNumber: num };

        if (changed(existing[num], next)) {
          const ref = db.collection("zippyShipments").doc(num);
          batch.set(ref, { ...next, syncedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          batchCount++;
          written++;
          if (batchCount >= 400) { await batch.commit(); batch = db.batch(); batchCount = 0; }
        } else {
          unchanged++;
        }
        newIndex[num] = next;
      }
    } catch (e) {
      console.error("Batch failed:", e.message);
      failed += group.length;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (batchCount > 0) await batch.commit();

  await INDEX_DOC.set({ index: newIndex, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

  console.log(`Done. Written: ${written}, Unchanged (skipped): ${unchanged}, Failed: ${failed}. (Final-state orders skipped entirely: ${orderNumbers.length - toCheck.length})`);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
