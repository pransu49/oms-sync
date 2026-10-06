// amazon-confirm.js
// Confirms self-ship orders on Amazon (Orders API: confirmShipment) with the NimbusPost AWB.
// Accounts: the ones with an SP-API refresh token (Praso, Sasta Store).
//
// An order is confirmed when ALL are true:
//   - Amazon self-ship order of that account in OMS Guru (has buyer phone)
//   - OMS Guru status is still New / Ready to ship / Packed (= not yet confirmed anywhere)
//   - OMS Guru already holds the AWB (so OMS never ends up "Shipped" without AWB)
//   - NimbusPost has the same AWB and the shipment is not cancelled
// DRY_RUN=true  -> only lists what it would confirm.   PROBE=true -> permission test only.

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');

const DRY = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const PROBE = String(process.env.PROBE || '').toLowerCase() === 'true';
const MARKETPLACE_ID = 'A21TJRUUN4KGV';
const ACCOUNTS = [
  { key: 'praso', channel: 'PRASO ENTERPRISES - Amazon', token: process.env.SPAPI_REFRESH_TOKEN_PRASO },
  { key: 'sastastore', channel: 'SASTA STORE - Amazon', token: process.env.SPAPI_REFRESH_TOKEN_SASTASTORE },
].filter((a) => a.token);

const omsApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) }, 'oms');
const mainApp = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main');
const omsDb = omsApp.firestore(), db = mainApp.firestore();

const nid = (v) => String(v || '').replace(/^`+/, '').replace(/^#/, '').replace(/\s+/g, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function carrier(c) {
  const k = String(c || '').toLowerCase();
  for (const [re, name] of [[/amazon|^ats\b/, 'Amazon Shipping'], [/delhivery/, 'Delhivery'], [/^xb\b|xpressbees/, 'Xpressbees'], [/dtdc/, 'DTDC'],
    [/blue ?dart/, 'BlueDart'], [/ecom/, 'Ecom Express'], [/shadowfax/, 'Shadowfax'], [/ekart/, 'Ekart'], [/india ?post/, 'India Post']]) {
    if (re.test(k)) return { carrierCode: name, carrierName: name };
  }
  return { carrierCode: 'Other', carrierName: String(c || 'Other').slice(0, 50) };
}
function client(token) {
  return new SellingPartnerAPI({
    region: 'eu', refresh_token: token,
    credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET },
  });
}
async function confirm(sp, orderId, awb, courier, items) {
  const c = carrier(courier);
  return sp.callAPI({
    operation: 'confirmShipment', endpoint: 'orders',
    path: { orderId },
    body: {
      marketplaceId: MARKETPLACE_ID,
      packageDetail: {
        packageReferenceId: '1', carrierCode: c.carrierCode, carrierName: c.carrierName, shippingMethod: 'Surface',
        trackingNumber: String(awb), shipDate: new Date().toISOString(),
        orderItems: items.map((i) => ({ orderItemId: i.id, quantity: i.qty })),
      },
    },
  });
}
const errText = (e) => String((e && (e.message || e.code)) || e).replace(/\s+/g, ' ').slice(0, 200);

async function main() {
  if (!ACCOUNTS.length) throw new Error('No SP-API refresh tokens provided.');

  if (PROBE) {
    for (const a of ACCOUNTS) {
      try { await confirm(client(a.token), '000-0000000-0000000', 'TEST', 'Amazon Shipping', [{ id: '0', qty: 1 }]); console.log(`PROBE ${a.key}: unexpected success`); }
      catch (e) { console.log(`PROBE ${a.key}: ${errText(e)}`); }
    }
    return;
  }

  const chunks = await omsDb.collection('aikm_admin').doc('omsOrders').collection('chunks').get();
  const oms = []; chunks.forEach((d) => oms.push(...(d.get('orders') || [])));
  const nbDoc = await db.collection('nimbusIndex').doc('byOrder').get();
  const nimbus = {}; Object.entries((nbDoc.exists && nbDoc.get('orders')) || {}).forEach(([k, v]) => { nimbus[nid(k)] = v; });
  const logRef = db.collection('aikm_admin').doc('amazonConfirm');
  const logDoc = await logRef.get();
  const done = (logDoc.exists && logDoc.get('ids')) || {};
  const now = Date.now();
  const update = { ids: done };

  for (const a of ACCOUNTS) {
    const byOrder = {};
    oms.forEach((o) => { if (String(o.channel || '').trim() !== a.channel) return; const id = nid(o.channelOrderId); if (id) (byOrder[id] = byOrder[id] || []).push(o); });
    const picks = [];
    for (const [id, lines] of Object.entries(byOrder)) {
      const live = lines.filter((o) => !/cancel/i.test(o.status || ''));
      if (!live.length || live.length !== lines.length) continue;                                   // any cancelled line -> leave to a human
      if (!live.every((o) => String(o.buyerPhone || o.mobile || '').replace(/\D/g, '').length >= 10)) continue; // self-ship only
      if (!live.every((o) => /^(new|ready to ship|packed|pending|confirmed)$/i.test(String(o.status || '').trim()))) continue;
      const awb = String(live[0].awb || '').trim();
      const n = nimbus[id];
      if (!awb || !n || n.a !== awb || n.s === 'cancelled') continue;
      if (done[id] && done[id].ok) continue;                                                      // already confirmed by us
      if (done[id] && !done[id].ok && now - done[id].t < 6 * 3600e3) continue;                     // failed recently — retry after 6h
      const items = live.map((o) => ({ id: String(o.channelSubOrderId || '').trim(), qty: parseInt(o.qty, 10) || 1 })).filter((i) => i.id);
      if (items.length !== live.length) continue;
      picks.push({ id, awb, courier: n.c || live[0].courier || '', items });
    }
    console.log(`${a.key}: ${Object.keys(byOrder).length} orders in OMS · to confirm on Amazon: ${picks.length}`);
    picks.slice(0, 10).forEach((p) => console.log(`  ${p.id} -> ${p.awb} (${carrier(p.courier).carrierCode}) items ${p.items.map((i) => i.id + 'x' + i.qty).join(',')}`));
    if (DRY || !picks.length) { update['last_' + a.key] = { at: admin.firestore.FieldValue.serverTimestamp(), count: 0, failed: 0, dry: DRY, message: picks.length ? `Dry run: ${picks.length} ready` : 'Nothing new to confirm.' }; continue; }

    const sp = client(a.token);
    let ok = 0, bad = 0; const reasons = {};
    for (const p of picks) {
      try {
        await confirm(sp, p.id, p.awb, p.courier, p.items);
        done[p.id] = { ok: true, a: p.awb, t: now, acct: a.key };
        ok++;
      } catch (e) {
        const msg = errText(e);
        // Amazon says it is already shipped -> treat as done
        if (/already|shipped|not in an? (valid|correct) state/i.test(msg)) { done[p.id] = { ok: true, a: p.awb, t: now, acct: a.key, note: msg }; ok++; }
        else { done[p.id] = { ok: false, a: p.awb, t: now, acct: a.key, e: msg }; bad++; reasons[msg] = (reasons[msg] || 0) + 1; }
      }
      await sleep(600); // stay under 2 requests/second
    }
    const message = `${ok} confirmed on Amazon` + (bad ? `, ${bad} failed: ` + Object.entries(reasons).map(([m, c]) => `${c} × ${m}`).join('; ') : '');
    console.log(`${a.key}: ${message}`);
    update['last_' + a.key] = { at: admin.firestore.FieldValue.serverTimestamp(), count: ok, failed: bad, message };
  }

  Object.keys(done).forEach((k) => { if (now - done[k].t > 30 * 864e5) delete done[k]; });
  if (!DRY) await logRef.set(update, { merge: true });
}

main().catch(async (e) => {
  console.error('AMAZON CONFIRM FAILED:', errText(e));
  try { await db.collection('aikm_admin').doc('amazonConfirm').set({ lastError: { at: admin.firestore.FieldValue.serverTimestamp(), error: errText(e) } }, { merge: true }); } catch (_) {}
  process.exit(1);
});
