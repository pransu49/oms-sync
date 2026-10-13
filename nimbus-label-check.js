const H = { 'x-api-key': process.env.NIMBUS_API_KEY.trim(), 'x-api-secret': process.env.NIMBUS_API_SECRET.trim(), Accept: 'application/json' };
(async () => {
  const r = await (await fetch('https://api-v2.nimbuspost.com/v2/orders?limit=20&page=1', { headers: H })).json();
  const o = (r.data || []).find((x) => x.shipment && x.shipment.awb);
  console.log('SHIP', JSON.stringify(o.shipment).slice(0, 1800));
  console.log('LABELOPT', JSON.stringify(o.label_options));
  const u = o.shipment.label_url;
  if (u) {
    const res = await fetch(u, { headers: { Origin: 'https://dalbhaat.in' } });
    console.log('LABEL GET', res.status, res.headers.get('content-type'), 'ACAO=', res.headers.get('access-control-allow-origin'), 'len', (await res.arrayBuffer()).byteLength);
    const res2 = await fetch(u, { method: 'OPTIONS', headers: { Origin: 'https://dalbhaat.in', 'Access-Control-Request-Method': 'GET' } });
    console.log('OPTIONS', res2.status, res2.headers.get('access-control-allow-origin'));
  }
  // label API by awb?
  for (const path of ['/shipments/label', '/shipments/labels', '/orders/label']) {
    try { const x = await fetch('https://api-v2.nimbuspost.com/v2' + path, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ awbs: [o.shipment.awb] }) }); console.log(path, x.status, (await x.text()).slice(0, 300)); } catch (e) { console.log(path, e.message); }
  }
})();
