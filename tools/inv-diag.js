// Central inventory check (read-only, owner 20 Nov 2026): is every listing of an account linked to LOTS and getting
// the right stock? Reads ONE doc (spapiSnapshots/<acct>_invPlan) - prints, saves nothing.
const admin = require('firebase-admin');
const ACCT = (process.env.ACCT || 'sastastore').trim();
const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }).firestore();
(async () => {
  // owner 26 Nov 2026 "mapped but not getting saved": look up given ASINs in the saved mappings (main + overflow record) + this plan
  const LOOK = String(process.env.ASINS || '').toUpperCase().split(/[^A-Z0-9]+/).filter((x) => /^[A-Z0-9]{10}$/.test(x));
  if (LOOK.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
    const M = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore().collection('aikm_admin');
    const [m1, m2, pl] = await Promise.all([M.doc('spapiAsinLotsMap').get(), M.doc('spapiAsinLotsMap2').get(), db.collection('spapiSnapshots').doc(`${ACCT}_invPlan`).get()]);
    const a = (m1.exists && m1.data().map) || {}, b = (m2.exists && m2.data().map) || {}, rows = pl.exists ? JSON.parse(pl.data().rows || '[]') : [];
    const age = pl.exists ? Math.round((Date.now() - (pl.data().at || 0)) / 60000) : null;
    console.log(`== MAPPING LOOKUP (${LOOK.length} ASINs) · main record ${Object.keys(a).length}, overflow ${Object.keys(b).length} · ${ACCT} plan ${age} min old`);
    const sum = (r) => !r ? '-' : typeof r !== 'object' ? `DELETED (${JSON.stringify(r)})` : `${r.vendorName || 'LOTS'} ${r.code || ''}${Array.isArray(r.parts) ? ' parts ' + r.parts.map((x) => `${x.code}x${x.qty || 1}${x.lotsPack ? '/' + x.lotsPack : ''}`).join('+') : ''} saved ${r.savedAt || '?'}`;
    LOOK.forEach((x) => { const pr = rows.filter((r) => r[1] === x);
      console.log(`${x}  main: ${sum(a[x])}  |  overflow: ${sum(b[x])}  |  plan: ${pr.length ? pr.map((r) => `${r[0]} ${r[5]}`).join(', ') : 'no self-ship listing'}`); });
    console.log('');
  }
  const d = await db.collection('spapiSnapshots').doc(`${ACCT}_invPlan`).get();
  if (!d.exists) return console.log(`No central inventory plan for ${ACCT}.`);
  const P = d.data(), rows = JSON.parse(P.rows || '[]'), keys = JSON.parse(P.keys || '{}');
  const age = Math.round((Date.now() - (P.at || 0)) / 60000);
  console.log(`== ${ACCT}: plan ${age} min old · ${P.live ? 'LIVE (AIKM tool pushes stock)' : 'preview only'} · LOTS-62 ${P.lots62 ? 'on' : 'off'} · ${rows.length} self-ship listings`);
  const by = {}; rows.forEach((r) => { by[r[5]] = (by[r[5]] || []).concat([r]); });
  console.log('Status: ' + Object.entries(by).map(([k, v]) => `${k} ${v.length}`).join(' · '));
  const linked = rows.filter((r) => r[3] != null);
  const exact = linked.filter((r) => r[4] === r[3]), above = linked.filter((r) => r[4] > r[3]), below = linked.filter((r) => r[4] < r[3]);
  console.log(`\nLINKED to LOTS / own stock: ${linked.length}`);
  console.log(`  Amazon = tool stock: ${exact.length} · Amazon LOWER (within tolerance, no oversell): ${below.length} · Amazon HIGHER: ${above.length}`);
  above.sort((a, b) => (b[4] - b[3]) - (a[4] - a[3])).slice(0, 15).forEach((r) => {
    const st = String(r[2]).split('+').map((p) => { const [k] = p.split('*'); const K = keys[k] || []; return `${k} GN ${K[0]} / 62 ${K[1]} / own ${K[2]} / pending ${K[3]}`; }).join(' + ');
    console.log(`  HIGHER  ${r[0]}  Amazon ${r[4]} vs tool ${r[3]}  [${st}]  ${String(r[6] || '').slice(0, 50)}`); });
  const zeroOk = linked.filter((r) => r[3] === 0 && r[4] === 0).length, zeroBad = linked.filter((r) => r[3] === 0 && r[4] > 0);
  console.log(`  Out of stock (LOTS low): ${zeroOk} at 0 on Amazon${zeroBad.length ? `, ${zeroBad.length} STILL selling` : ''}`);
  zeroBad.slice(0, 10).forEach((r) => console.log(`  SHOULD BE 0  ${r[0]}  Amazon ${r[4]}  ${String(r[6] || '').slice(0, 60)}`));
  const pack = linked.filter((r) => /\*(?!1(\+|$))/.test(String(r[2])) || String(r[2]).includes('+'));
  console.log(`  Packs / combos among linked: ${pack.length}`);
  const ns = by.nostock || [];
  console.log(`\nMAPPED but code has NO stock data (not in LOTS-GN/LOTS-62, no own stock): ${ns.length}` + (ns.length ? `, ${ns.filter((r) => r[4] > 0).length} showing stock on Amazon` : ''));
  ns.filter((r) => r[4] > 0).sort((a, b) => b[4] - a[4]).slice(0, 15).forEach((r) => console.log(`  NO-DATA  ${r[0]}  Amazon ${r[4]}  map ${r[2]}  ${String(r[6] || '').slice(0, 50)}`));
  const un = by.unlinked || [], unS = un.filter((r) => r[4] > 0);
  console.log(`\nNOT LINKED (no LOTS/vendor mapping - tool can't manage stock): ${un.length}, ${unS.length} showing stock on Amazon (${unS.reduce((a, r) => a + r[4], 0)} units)`);
  unS.sort((a, b) => b[4] - a[4]).slice(0, 30).forEach((r) => console.log(`  UNLINKED  ${r[0]}  ${r[1]}  Amazon ${r[4]}  ${String(r[6] || '').slice(0, 60)}`));
  const errs = P.errs || []; if (errs.length) { console.log(`\nLast push errors: ${errs.length}`); errs.forEach((e) => console.log(`  ${e[0]}: ${e[1]}`)); }
  console.log(`\nStats saved by the robot: ${JSON.stringify(P.stats || {})}`);
})().catch((e) => { console.error('Check failed:', e.message || e); process.exitCode = 1; });
