const H = { 'x-api-key': process.env.NIMBUS_API_KEY.trim(), 'x-api-secret': process.env.NIMBUS_API_SECRET.trim(), Accept: 'application/json', 'Content-Type': 'application/json' };
(async () => {
  const r = await (await fetch('https://api-v2.nimbuspost.com/v2/orders?limit=100&page=1', { headers: H })).json();
  const o = r.data.find((x) => x.shipment && x.shipment.awb && !x.shipment.label_url && /XB/.test(x.shipment.courier_name));
  console.log('ORDER', o.order_id, o.order_number, o.shipment.awb, o.shipment.courier_name);
  const tries = [
    ['POST', '/shipments/labels', {}],
    ['POST', '/shipments/labels', { awb: [o.shipment.awb] }],
    ['POST', '/shipments/labels', { awb_numbers: [o.shipment.awb] }],
    ['POST', '/shipments/labels', { order_ids: [o.order_id] }],
    ['POST', '/shipments/labels', { ids: [o.order_id] }],
    ['POST', '/shipments/labels', { awbs: o.shipment.awb }],
    ['GET', '/shipments/labels?awb=' + o.shipment.awb],
    ['GET', '/shipments/' + o.shipment.awb + '/label'],
    ['GET', '/orders/' + o.order_id + '/label'],
    ['POST', '/orders/labels', { order_ids: [o.order_id] }],
    ['GET', '/shipments/' + o.shipment.awb],
  ];
  for (const [m, p, b] of tries) {
    try { const x = await fetch('https://api-v2.nimbuspost.com/v2' + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
      console.log('TRY', m, p, JSON.stringify(b || ''), x.status, x.headers.get('content-type'), (await x.text()).slice(0, 400)); } catch (e) { console.log('TRY', p, e.message); }
  }
})();
