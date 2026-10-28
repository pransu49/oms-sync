// READ-ONLY probe (temporary): which buyer-complaint sources Amazon gives this app.
const SellingPartnerAPI = require('amazon-sp-api');
const zlib = require('zlib'), https = require('https');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MP = 'A21TJRUUN4KGV';
const get = (url) => new Promise((res, rej) => https.get(url, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej); }).on('error', rej));
async function report(sp, type, days, opts) {
  try {
    const body = { reportType: type, marketplaceIds: [MP] };
    if (days) { body.dataStartTime = new Date(Date.now() - days * 864e5).toISOString(); body.dataEndTime = new Date().toISOString(); }
    const { reportId } = await sp.callAPI({ operation: 'createReport', endpoint: 'reports', body });
    for (let i = 0; i < 30; i++) {
      await sleep(15000);
      const s = await sp.callAPI({ operation: 'getReport', endpoint: 'reports', path: { reportId } });
      if (s.processingStatus === 'DONE') {
        const d = await sp.callAPI({ operation: 'getReportDocument', endpoint: 'reports', path: { reportDocumentId: s.reportDocumentId } });
        let t = Buffer.isBuffer(d) ? d.toString() : typeof d === 'string' ? d : null;
        if (t == null) { const b = await get(d.url); t = /GZIP/i.test(d.compressionAlgorithm || '') ? zlib.gunzipSync(b).toString() : b.toString(); }
        console.log(`== ${type}: ${t.length} chars\n${t.slice(0, 2500)}`); return;
      }
      if (/FATAL|CANCELLED/.test(s.processingStatus)) { console.log(`== ${type}: ${s.processingStatus}`); return; }
    }
    console.log(`== ${type}: not ready`);
  } catch (e) { console.log(`== ${type}: ERROR ${e.code || ''} ${e.message}`); }
}
(async () => {
  for (const [acc, tok] of [['SASTA STORE', process.env.T_SASTA], ['PRASO', process.env.T_PRASO]]) {
    console.log(`\n######## ${acc}`);
    const sp = new SellingPartnerAPI({ region: 'eu', refresh_token: tok, credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET } });
    await report(sp, 'GET_SELLER_FEEDBACK_DATA', 60);
    await report(sp, 'GET_V2_SELLER_PERFORMANCE_REPORT', 0);
    try {
      const ev = await sp.callAPI({ operation: 'listFinancialEvents', endpoint: 'finances', query: { PostedAfter: new Date(Date.now() - 60 * 864e5).toISOString(), MaxResultsPerPage: 100 } });
      const f = ev.FinancialEvents || {};
      console.log('== FINANCES lists:', Object.entries(f).map(([k, v]) => `${k}:${(v || []).length}`).join(' '));
      ['GuaranteeClaimEventList', 'ChargebackEventList', 'SAFETReimbursementEventList'].forEach((k) => (f[k] || []).slice(0, 2).forEach((x) => console.log(k, JSON.stringify(x).slice(0, 500))));
    } catch (e) { console.log('== FINANCES ERROR', e.code || '', e.message); }
  }
})();
