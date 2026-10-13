const H = { 'x-api-key': process.env.NIMBUS_API_KEY.trim(), 'x-api-secret': process.env.NIMBUS_API_SECRET.trim(), Accept: 'application/json' };
(async () => {
  const seen = {}; let n = 0, withL = 0, pend = 0;
  for (let p = 1; p <= 15; p++) {
    const r = await (await fetch(`https://api-v2.nimbuspost.com/v2/orders?limit=100&page=${p}`, { headers: H })).json();
    for (const o of r.data || []) {
      const s = o.shipment || {}; n++;
      if (o.order_status === 'pickup_pending' || o.order_status === 'pickup_scheduled') pend++;
      if (s.label_url) withL++;
      const host = String(s.label_url || '').replace(/[^/]*$/, '');
      const k = (s.courier_name || '-') + ' | ' + host + ' | ' + o.order_status;
      if (!seen[k]) { seen[k] = 1; console.log('URL', k, '|', s.label_url, '|', o.items.map((i) => i.name).join('+').slice(0, 40)); }
    }
  }
  console.log('TOTAL', n, 'with label', withL, 'pending', pend);
})();
