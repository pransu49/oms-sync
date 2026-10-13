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
// Amazon's own status for up to 50 orders per call -> { orderId: 'Unshipped' | 'Shipped' | 'Canceled' | ... }
async function amazonStatus(sp, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const r = await sp.callAPI({ operation: 'getOrders', endpoint: 'orders', query: { MarketplaceIds: [MARKETPLACE_ID], AmazonOrderIds: chunk, MaxResultsPerPage: 100 } });
      ((r && r.Orders) || []).forEach((o) => { out[o.AmazonOrderId] = o.OrderStatus; });
    } catch (e) { console.log(`  status check failed for ${chunk.length} orders: ${String(e && e.message || e).slice(0, 120)}`); }
    await sleep(1500);
  }
  return out;
}
const MAX_PER_RUN = 120;       // ~2.5 min of Amazon calls — the rest go in the next run (every 10 min)
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

  // 1 small record written by the OMS sync (instead of reading every OMS order chunk — saves Firebase quota)
  const readyDoc = await omsDb.collection('aikm_admin').doc('omsReadyToConfirm').get();
  const oms = (readyDoc.exists && readyDoc.get('orders')) || [];
  const nbDoc = await db.collection('nimbusIndex').doc('byOrder').get();
  const nimbus = {}; let nbAll = {};
  if (nbDoc.exists) { try { nbAll = nbDoc.get('data') ? JSON.parse(nbDoc.get('data')) : (nbDoc.get('orders') || {}); } catch (e) { nbAll = nbDoc.get('orders') || {}; } }
  Object.entries(nbAll).forEach(([k, v]) => { nimbus[nid(k)] = v; });
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
    // ask Amazon first: skip orders it already shows as shipped / cancelled (no wasted calls, no time-out)
    let skipped = 0;
    if (picks.length) {
      const st = await amazonStatus(client(a.token), picks.map((p) => p.id));
      const keep = [];
      picks.forEach((p) => {
        const s = st[p.id];
        if (s === 'Shipped' || s === 'Canceled' || s === 'InvoiceUnconfirmed') { done[p.id] = { ok: true, a: p.awb, t: now, acct: a.key, note: 'Amazon status: ' + s }; skipped++; }
        else keep.push(p);
      });
      if (skipped) console.log(`${a.key}: ${skipped} already ${'shipped/cancelled'} on Amazon — marked done, not sent again`);
      picks.length = 0; keep.forEach((p) => picks.push(p));
    }
    const later = Math.max(0, picks.length - MAX_PER_RUN);
    if (later) { console.log(`${a.key}: ${picks.length} to confirm — doing ${MAX_PER_RUN} now, ${later} in the next runs`); picks.length = MAX_PER_RUN; }
    if (DRY || !picks.length) { update['last_' + a.key] = { at: admin.firestore.FieldValue.serverTimestamp(), count: skipped, failed: 0, dry: DRY, message: picks.length ? `Dry run: ${picks.length} ready` : skipped ? `${skipped} were already shipped on Amazon — nothing left to confirm.` : 'Nothing new to confirm.' }; continue; }

    const sp = client(a.token);
    let ok = 0, bad = 0, n = 0; const reasons = {};
    for (const p of picks) {
      if (++n % 25 === 0 && !DRY) await logRef.set({ ids: done }, { merge: true });   // save progress as we go
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
    const message = `${ok} confirmed on Amazon` + (later ? ` (${later} more queued for the next run)` : '') + (bad ? `, ${bad} failed: ` + Object.entries(reasons).map(([m, c]) => `${c} × ${m}`).join('; ') : '');
    console.log(`${a.key}: ${message}`);
    update['last_' + a.key] = { at: admin.firestore.FieldValue.serverTimestamp(), count: ok, failed: bad, message };
    if (skipped) update['last_' + a.key].alreadyShipped = skipped;
  }

  Object.keys(done).forEach((k) => { if (now - done[k].t > 30 * 864e5) delete done[k]; });
  // Nothing confirmed, nothing failed, and the last note (under 30 min old) already says so -> skip the
  // write, so the open console tabs don't all re-read this document after every run.
  const quiet = ACCOUNTS.every((a) => {
    const u = update['last_' + a.key], p = logDoc.exists && logDoc.get('last_' + a.key);
    const at = p && p.at && p.at.toMillis ? p.at.toMillis() : 0;
    return u && !u.count && !u.failed && p && p.message === u.message && now - at < 30 * 60e3;
  });
  if (quiet) { console.log('Nothing new - status note not re-saved.'); return; }
  if (!DRY) await logRef.set(update, { merge: true });
}

main().catch(async (e) => {
  console.error('AMAZON CONFIRM FAILED:', errText(e));
  try { await db.collection('aikm_admin').doc('amazonConfirm').set({ lastError: { at: admin.firestore.FieldValue.serverTimestamp(), error: errText(e) } }, { merge: true }); } catch (_) {}
  process.exit(1);
});
