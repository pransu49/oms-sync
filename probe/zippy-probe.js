const COGNITO_URL = 'https://cognito-idp.us-east-2.amazonaws.com/', CID = '38brrnlch2igpjussov7ue7tqr', API = 'https://api.in.zippyy.ai';
(async () => {
  console.log('secrets present:', { refresh: !!process.env.ZIPPY_REFRESH_TOKEN, email: !!process.env.ZIPPY_EMAIL, pass: !!process.env.ZIPPY_PASSWORD });
  const ip = await (await fetch('https://ipinfo.io/json')).json().catch(() => ({})); console.log('runner location:', ip.country, ip.region);
  let tok = null;
  for (const [flow, params] of [['REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: process.env.ZIPPY_REFRESH_TOKEN }], ['USER_PASSWORD_AUTH', { USERNAME: process.env.ZIPPY_EMAIL, PASSWORD: process.env.ZIPPY_PASSWORD }]]) {
    const r = await fetch(COGNITO_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' }, body: JSON.stringify({ AuthFlow: flow, ClientId: CID, AuthParameters: params }) });
    const j = await r.json();
    console.log(flow, r.status, j.AuthenticationResult ? 'OK' : JSON.stringify(j).slice(0, 200));
    if (j.AuthenticationResult) { tok = j.AuthenticationResult.IdToken; break; }
  }
  if (!tok) return;
  const now = Date.now();
  const r = await fetch(API + '/cnvt/shipment/list', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, 'x-api-version': '1', Origin: 'https://in.app.zippyy.ai', Referer: 'https://in.app.zippyy.ai/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    body: JSON.stringify({ status: null, filterType: 'SHIPMENT_PURCHASED_AT', isAscending: false, subStatuses: null, manifestStatuses: null, carriers: null, carrierServices: null, storeIds: null, awbs: null, startTimestamp: now - 30 * 864e5, endTimestamp: now, orderNumbers: null, orderSources: null, orderTypes: null, orderTags: null, productNames: null, skuIds: null, excludeOrderTags: null, warehouseId: null, pageSize: 5, startOffset: null }) });
  const t = await r.text();
  console.log('shipment/list', r.status, t.length);
  try { const j = JSON.parse(t); console.log('top keys', Object.keys(j)); const s = (j.shipments || [])[0]; if (s) console.log('shipment keys', Object.keys(s).join(','), '\nsample', JSON.stringify({ orderNumber: s.orderNumber, awbNumber: s.awbNumber, courierName: s.courierName, carrier: s.carrier, status: s.status, subStatus: s.subStatus })); console.log('count', (j.shipments || []).length, 'total', j.total || j.totalCount); } catch (e) { console.log(t.slice(0, 300)); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
