// rto-probe.js — READ-ONLY test: finds where Amazon exposes the new RTO / return tracking ID.
// Prints report headers + any line containing the IDs in PROBE_IDS. Changes nothing on Amazon.
const SellingPartnerAPI = require('amazon-sp-api');
const zlib = require('zlib'), https = require('https');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MP = 'A21TJRUUN4KGV';
const IDS = String(process.env.PROBE_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
const ORDER = String(process.env.PROBE_ORDER || '').trim();
const sp = new SellingPartnerAPI({
  region: 'eu', refresh_token: process.env.SPAPI_REFRESH_TOKEN_PRASO,
  credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET },
});
const get = (url) => new Promise((res, rej) => https.get(url, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej); }).on('error', rej));

async function report(type, days) {
  try {
    const body = { reportType: type, marketplaceIds: [MP] };
    if (days) { body.dataStartTime = new Date(Date.now() - days * 864e5).toISOString(); body.dataEndTime = new Date().toISOString(); }
    const { reportId } = await sp.callAPI({ operation: 'createReport', endpoint: 'reports', body });
    let docId;
    for (let i = 0; i < 30; i++) {
      await sleep(15000);
      const s = await sp.callAPI({ operation: 'getReport', endpoint: 'reports', path: { reportId } });
      if (s.processingStatus === 'DONE') { docId = s.reportDocumentId; break; }
      if (/FATAL|CANCELLED/.test(s.processingStatus)) { console.log(`== ${type}: ${s.processingStatus}`); return; }
    }
    if (!docId) { console.log(`== ${type}: not ready`); return; }
    const d = await sp.callAPI({ operation: 'getReportDocument', endpoint: 'reports', path: { reportDocumentId: docId } });
    let txt = Buffer.isBuffer(d) ? d.toString() : typeof d === 'string' ? d : null;
    if (txt == null) { const b = await get(d.url); txt = /GZIP/i.test(d.compressionAlgorithm || '') ? zlib.gunzipSync(b).toString() : b.toString(); }
    const lines = txt.split('\n');
    console.log(`== ${type}: ${lines.length} lines, ${txt.length} chars`);
    console.log('HEAD:', lines.slice(0, 2).join(' || ').slice(0, 1500));
    const hits = lines.filter((l) => IDS.some((id) => l.includes(id)) || (ORDER && l.includes(ORDER)));
    console.log(`HITS (${hits.length}):`); hits.slice(0, 5).forEach((h) => console.log('  ', h.slice(0, 1500)));
    if (/XML/.test(type)) { const i = IDS.map((id) => txt.indexOf(id)).find((x) => x >= 0) ?? (ORDER ? txt.indexOf(ORDER) : -1); if (i >= 0) console.log('XML CONTEXT:', txt.slice(Math.max(0, i - 1500), i + 1500)); }
  } catch (e) { console.log(`== ${type}: ERROR ${e.code || ''} ${e.message || e}`); }
}

(async () => {
  console.log('Probing for', IDS, ORDER);
  if (ORDER) {
    try { const p = await sp.callAPI({ operation: 'getScheduledPackage', endpoint: 'easyShip', query: { amazonOrderId: ORDER, marketplaceId: MP } }); console.log('EASYSHIP PACKAGE:', JSON.stringify(p).slice(0, 2500)); }
    catch (e) { console.log('EASYSHIP ERROR', e.code || '', e.message || e); }
  }
  await report('GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE', 30);
  await report('GET_XML_RETURNS_DATA_BY_RETURN_DATE', 30);
  await report('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', 30);
})();
