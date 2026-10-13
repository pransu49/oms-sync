const H = { 'x-api-key': process.env.NIMBUS_API_KEY.trim(), 'x-api-secret': process.env.NIMBUS_API_SECRET.trim(), Accept: 'application/json', 'Content-Type': 'application/json' };
(async () => {
  const o1 = await fetch('https://api-v2.nimbuspost.com/v2/shipments/labels', { method: 'OPTIONS', headers: { Origin: 'https://dalbhaat.in', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-api-key,x-api-secret,content-type' } });
  console.log('CORS', o1.status, o1.headers.get('access-control-allow-origin'), o1.headers.get('access-control-allow-headers'));
  const r = await (await fetch('https://api-v2.nimbuspost.com/v2/orders?limit=100&page=1', { headers: H })).json();
  const ids = r.data.filter((x) => x.shipment && x.shipment.awb && /pickup/.test(x.order_status)).slice(0, 60).map((x) => x.order_id);
  const t = Date.now();
  const x = await (await fetch('https://api-v2.nimbuspost.com/v2/shipments/labels', { method: 'POST', headers: H, body: JSON.stringify({ order_ids: ids }) })).json();
  console.log('BATCH', ids.length, 'ms', Date.now() - t, JSON.stringify(x).replace(/X-Amz-Signature=[^&"]+/, 'SIG').slice(0, 900));
  if (x.data && x.data.url) { const p = await fetch(x.data.url, { headers: { Origin: 'https://dalbhaat.in' } }); const b = await p.arrayBuffer(); console.log('PDF', p.status, b.byteLength, 'ACAO', p.headers.get('access-control-allow-origin'));
    const s = Buffer.from(b).toString('latin1'); console.log('PAGES', (s.match(/\/Type\s*\/Page[^s]/g) || []).length); }
})();
