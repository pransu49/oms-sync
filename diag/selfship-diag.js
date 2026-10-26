// Read-only diagnostic: today's Amazon self-ship orders and their OMS status. Logs ids/status only.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_OMS)) });
const db = admin.firestore();
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const iso = (s) => { const d = new Date(String(s || '')); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
(async () => {
  const meta = (await db.collection('aikm_admin').doc('omsOrders').get()).data() || {};
  console.log('lastSynced', meta.lastSynced && meta.lastSynced.toDate().toISOString(), 'count', meta.orderCount);
  const snap = await db.collection('aikm_admin').doc('omsOrders').collection('chunks').get();
  const all = []; snap.forEach((d) => all.push(...(d.data().orders || [])));
  const amz = all.filter((o) => /amazon/i.test(o.channel));
  const phone = (o) => String(o.buyerPhone || '').replace(/\D/g, '').length >= 10;
  const self = amz.filter(phone);
  const byDay = {};
  self.forEach((o) => { const k = iso(o.orderDate); byDay[k] = byDay[k] || {}; byDay[k][o.status || '?'] = (byDay[k][o.status || '?'] || 0) + 1; });
  console.log('Self-ship (phone) by order date x status:'); Object.keys(byDay).sort().slice(-6).forEach((k) => console.log(' ', k, JSON.stringify(byDay[k])));
  const t = self.filter((o) => iso(o.orderDate) === today || iso(o.slaDate) === today);
  console.log(`Today/SLA-today self-ship lines: ${t.length}`);
  const agg = {}; t.forEach((o) => { const k = `${o.status}|awb:${o.awb ? 'yes' : 'no'}|courier:${o.courier || '-'}|wh:${o.warehouse || '-'}`; agg[k] = (agg[k] || 0) + 1; });
  Object.entries(agg).forEach(([k, v]) => console.log('  ', v, k));
  t.slice(0, 40).forEach((o) => console.log('   ', o.channelOrderId, '|', o.channel, '|', o.status, '| ord', o.orderDate, '| sla', o.slaDate, '| awb', o.awb ? 'yes' : 'no', '| ship', o.shipmentDate || '-'));
  // Amazon orders WITHOUT phone today (would be easy-ship) by status
  const ne = {}; amz.filter((o) => !phone(o) && iso(o.orderDate) === today).forEach((o) => { ne[o.status] = (ne[o.status] || 0) + 1; });
  console.log('Amazon no-phone (today) by status', JSON.stringify(ne));
  const pk = {}; amz.filter((o) => /packed/i.test(o.status)).forEach((o) => { const k = (phone(o) ? 'phone' : 'nophone') + '|' + iso(o.orderDate); pk[k] = (pk[k] || 0) + 1; });
  console.log('Amazon Packed lines by phone|orderDate', JSON.stringify(pk));
  const ph = {}; amz.filter((o)=>iso(o.orderDate)>= '2026-10-20').forEach((o)=>{ const k = iso(o.orderDate)+'|'+(phone(o)?'phone':String(o.buyerPhone||'').slice(0,4)||'empty'); ph[k]=(ph[k]||0)+1;});
  console.log('Amazon phone presence by day', JSON.stringify(ph));
})().catch((e) => { console.error(e.message); process.exit(1); });
