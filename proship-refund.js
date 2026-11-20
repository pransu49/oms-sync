// proship-refund.js — which ProShip shipments mean "refund pending" (owner 20 Nov 2026: ProShip now ships
// Amazon self-ship orders, so Bulk Refund must use ProShip as well as NimbusPost).
// Source: main Firebase aikm_admin/proshipIndex {data: JSON {orderId:{a awb, c courier, s, st, t, ac}}} (1 read).
//   s: ok | cancelled | rto | rto_delivered | delivered | lost   (set by proship.js sync, every 30 min)
// Rules (same as NimbusPost):
//   rto  - any RTO stage (initiated / in transit / out for delivery / delivered) -> shipment returned back
//   lost - lost / damaged
//   late - still waiting for pickup and Amazon's Deliver By date has passed
// ProShip is the NEWEST courier, so an order with a live ProShip shipment that is NOT refund pending
// (in transit / delivered) overrides an older NimbusPost RTO (re-shipped order) -> `active`.
// proshipIndex keeps 15 days of AWBs (proship.js KEEP_DAYS).

const PICKUP = /ORDER_PLACED|PICKUP_PENDING|OUT_FOR_PICKUP|AWB_REGISTERED|MANIFEST|BOOKED|PICKUP_SCHEDULED|READY_TO_SHIP|PICKUP_FAIL|NOT_PICKED|PICKUP_EXCEPTION|^PENDING/;

async function loadProshipIndex(mainDb) {
  const d = await mainDb.collection('aikm_admin').doc('proshipIndex').get();
  try { return d.exists && d.get('data') ? JSON.parse(d.get('data')) : {}; } catch (e) { return {}; }
}

// -> { pending: {orderId: {kind, ns, nb, aw, c, nd, db, src}}, active: Set(orderId), counts }
function proshipRefunds(idx, deliverBy, opts) {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); // India date
  const withLate = !opts || opts.late !== false, withLost = !opts || opts.lost !== false;
  const pending = {}, active = new Set(), counts = { rto: 0, lost: 0, late: 0, noDate: 0, active: 0 };
  Object.keys(idx || {}).forEach((id) => {
    const v = idx[id]; if (!v || !v.a || !/^\d{3}-\d{7}-\d{7}$/.test(id)) return;
    if (v.s === 'cancelled') return;
    const st = String(v.st || 'ORDER_PLACED').toUpperCase().replace(/[\s-]+/g, '_');
    const day = v.t ? new Date(v.t + 330 * 60000).toISOString().slice(0, 10) : '';
    let kind = null;
    if (v.s === 'rto' || v.s === 'rto_delivered' || /^RTO/.test(st)) kind = 'rto';
    else if (v.s === 'lost' || /LOST|DAMAGE/.test(st)) kind = withLost ? 'lost' : null;
    else if (v.s === 'ok' && PICKUP.test(st)) {
      const db = deliverBy[id];
      if (!db) counts.noDate++;
      else if (withLate && today > db) kind = 'late';
    }
    if (!kind) { active.add(id); counts.active++; return; }
    counts[kind]++;
    pending[id] = { kind, ns: st.replace(/_/g, ' ').toLowerCase(), nb: kind === 'rto' ? (v.s === 'rto_delivered' || st === 'RTO_DELIVERED' ? 'rto_delivered' : 'rto') : kind,
      aw: String(v.a), c: String(v.c || ''), nd: day, db: deliverBy[id] || '', src: 'proship' };
  });
  return { pending, active, counts };
}

module.exports = { loadProshipIndex, proshipRefunds };
