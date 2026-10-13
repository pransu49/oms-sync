// one-off check: how NimbusPost stored the orders uploaded in the last 2 days (order + product + created time)
const KEY = process.env.NIMBUS_API_KEY.trim(), SECRET = process.env.NIMBUS_API_SECRET.trim();
const H = { 'x-api-key': KEY, 'x-api-secret': SECRET, Accept: 'application/json' };
(async () => {
  const all = [];
  for (let p = 1; p <= 6; p++) { const r = await (await fetch(`https://api-v2.nimbuspost.com/v2/orders?limit=100&page=${p}`, { headers: H })).json(); all.push(...(r.data || [])); if ((r.data || []).length < 100) break; }
  if (all[0]) console.log('KEYS', Object.keys(all[0]).join(','), '| SHIP', Object.keys(all[0].shipment || {}).join(','));
  if (all[0]) console.log('SAMPLE', JSON.stringify(all[0]).slice(0, 1500));
  all.slice(0, 250).forEach((o) => {
    const prods = (o.products || o.order_items || []).map((x) => x.name || x.product_name).join(' | ');
    console.log([o.created_at, o.id, o.order_number, (o.shipment || {}).awb || '', (o.shipment || {}).created_at || '', prods.slice(0, 60)].join(' ; '));
  });
})();
