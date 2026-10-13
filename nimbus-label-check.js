const H = { 'x-api-key': process.env.NIMBUS_API_KEY.trim(), 'x-api-secret': process.env.NIMBUS_API_SECRET.trim(), Accept: 'application/json', 'Content-Type': 'application/json' };
(async () => {
  const r = await (await fetch('https://api-v2.nimbuspost.com/v2/orders?limit=100&page=1', { headers: H })).json();
  const pick = {}; const ids = [];
  r.data.filter((x) => x.shipment && x.shipment.awb && /pickup/.test(x.order_status)).forEach((x) => { const k = x.shipment.courier_name.split(' ')[0]; pick[k] = (pick[k] || 0) + 1; if (pick[k] <= 2) { ids.push(x.order_id); console.log('ORD', x.order_number, x.shipment.courier_name, x.items.map((i) => i.name + ' x' + i.qty).join(' + ').slice(0, 80)); } });
  const x = await (await fetch('https://api-v2.nimbuspost.com/v2/shipments/labels', { method: 'POST', headers: H, body: JSON.stringify({ order_ids: ids }) })).json();
  console.log('URLX', Buffer.from(x.data.url).toString('base64'));
})();
