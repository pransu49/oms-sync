// robot-audit.js - ROBOT WATCHDOG (owner, 25 Oct 2026: "ensure such mistakes by the robot are caught - it is making me loss").
//
// Independent check of what the Amazon robot (spapi-sync.js) and the OMS stock robot (oms-inventory-push.js) left on
// Amazon. It does not share their logic - it re-checks the RESULT against LOTS with simple rules, so a robot bug
// cannot hide itself. Runs after every OMS stock push and every hour. Alerts on Telegram; never changes anything.
//
// Checks (self-ship listings, LOTS link = your ASIN mapping only):
//   1 WRONG OUT OF STOCK  Amazon 0 but LOTS free stock (LOTS - OMS blocked) is 10+       -> lost sales
//   2 OVERSELL RISK       Amazon shows more than LOTS can supply, or LOTS is below 10    -> cancellations
//   3 PRICE BELOW COST    a robot-set price (last 24 h) is under the LOTS cost            -> loss per order
//   4 BIG PRICE CUT       a robot cut of more than 25% in one step (last 24 h)            -> loss / mistake
//   5 SUDDEN SWINGS       out-of-stock count jumps by 25+ (or 20%+) since the last check  -> rule gone wrong
//   6 SALES DROP          today's units so far under 50% of the usual for this hour       -> something is off
//   7 ROBOT STOPPED       no full Amazon sync for 4 h / no OMS stock push for 3 h / last push failed
// A problem must show in 2 checks in a row before it is reported (robots and OMS Guru need a little time to catch up),
// except 3, 4, 5 and 7 which are reported at once. The same list is not repeated within 6 hours unless it grows.

const admin = require('firebase-admin');
const { notify, esc, LINE } = require('./telegram');

const spa = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) }, 'spa').firestore();
const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();
const ACCOUNTS = { praso: 'Praso', sastastore: 'Sasta Store' };
const MIN = 10, IST = 5.5 * 3600e3, now = Date.now();
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

async function loadSnap(acct) {
  const m = await spa.collection('spapiSnapshots').doc(`${acct}_meta`).get();
  const md = m.exists ? m.data() : null; if (!md || !md.run) return null;
  const out = { meta: md, inventory: [], orders: [], pricing: {} };
  for (const kind of ['inventory', 'orders', 'pricing']) {
    const n = (md.chunks || {})[kind] || 0; if (!n) continue;
    const docs = await spa.getAll(...Array.from({ length: n }, (_, i) => spa.collection('spapiSnapshots').doc(`${acct}_${kind}_${md.run}_${i}`)));
    docs.forEach((d) => d.exists && (d.data().items || []).forEach((it) => {
      if (!it) return;
      if (kind === 'pricing') out.pricing[it.asin] = it; else out[kind].push(it);
    }));
  }
  return out;
}
async function loadLots() {
  const A = main.collection('aikm_admin');
  const [ch, m1, m2] = await Promise.all([A.doc('lotsCatalog').collection('chunks').get(), A.doc('spapiAsinLotsMap').get(), A.doc('spapiAsinLotsMap2').get().catch(() => null)]);
  const lots = {}; ch.forEach((d) => (d.data().products || []).forEach((p) => { if (p && p.code != null) lots[String(p.code)] = p; }));
  const map = { ...((m1.exists && m1.data().map) || {}) };
  Object.entries((m2 && m2.exists && m2.data().map) || {}).forEach(([a, r]) => { if (!map[a] || String((r && r.savedAt) || '') >= String((map[a] && map[a].savedAt) || '')) map[a] = r; });
  return { lots, map };
}
const bestSlab = (p) => { let b = null; ((p && p.slabs) || []).forEach((x) => { const v = Number(x.price); if (v > 0 && (b == null || v < b)) b = v; }); return b; };
// LOTS side of one ASIN (your mapping only): Amazon units LOTS can supply, lowest LOTS stock, cost per Amazon unit
function lotsFor(asin, L) {
  const m = asin && L.map[asin]; if (!m) return null;
  if (m.vendorName && String(m.vendorName).toUpperCase() !== 'LOTS') return null;
  const parts = Array.isArray(m.parts) && m.parts.length ? m.parts : (m.code ? [{ code: m.code, qty: 1 }] : []); if (!parts.length) return null;
  let units = Infinity, low = Infinity, cost = 0; const names = [];
  for (const x of parts) {
    const p = L.lots[String(x.code)]; if (!p) return null;
    const q = parseFloat(p.qty); if (isNaN(q)) return null;
    const need = Math.max(1, Number(x.qty) || 1) / Math.max(1, parseInt(x.lotsPack) || 1);
    units = Math.min(units, Math.floor(Math.max(0, q) / need + 1e-9)); low = Math.min(low, q);
    const c = bestSlab(p); cost = c == null || cost == null ? null : cost + c * need;
    names.push(p.name || x.code);
  }
  return { units, low, cost, name: names.join(' + '), need: parts.length === 1 ? Math.max(1, Number(parts[0].qty) || 1) / Math.max(1, parseInt(parts[0].lotsPack) || 1) : 1 };
}

(async () => {
  const L = await loadLots();
  if (Object.keys(L.lots).length < 500) { console.log('Watchdog: LOTS catalogue looks incomplete - skipped this check.'); return; }
  // OMS Guru blocked orders per ASIN (from the OMS stock robot's last run)
  const blockedByAsin = {}, omsByAsin = {}; let omsDoc = null;
  try {
    const d = await spa.collection('spapiSnapshots').doc('omsInventory').get(); omsDoc = d.exists ? d.data() : null;
    if (omsDoc && omsDoc.chunks) {
      const ps = await Promise.all(Array.from({ length: omsDoc.chunks }, (_, i) => spa.collection('spapiSnapshots').doc(`omsInventory_rows_${i}`).get()));
      const j = JSON.parse(ps.map((x) => (x.exists ? x.data().data : '')).join('') || '[]');
      (Array.isArray(j) ? j : j.rows || []).forEach((r) => { if (r[2] && r[14] > 0) blockedByAsin[r[2]] = Math.max(blockedByAsin[r[2]] || 0, r[14]);
        // what OMS Guru should be showing on Amazon right now (In Stock - Blocked), and when the robot last changed it
        if (r[2]) omsByAsin[r[2]] = { exp: r[15] === 1 ? 0 : Math.max(0, (Number(r[7]) || 0) - (Number(r[14]) || 0)), at: Number(r[13]) || 0, sku: r[0] }; });
    }
  } catch (e) { console.warn('OMS data not read:', e.message || e); }

  const stateRef = spa.collection('spapiSnapshots').doc('robotAudit');
  const st = (await stateRef.get()).data() || {};
  const prevSeen = st.seen || {}, seen = {}, findings = [], summary = {};

  for (const [acct, label] of Object.entries(ACCOUNTS)) {
    const S = await loadSnap(acct);
    if (!S) { findings.push({ key: `nosnap_${acct}`, now: true, text: `⛔ <b>${label}</b>: no Amazon data saved - the Amazon robot is not running.` }); continue; }
    const self = S.inventory.filter((i) => i && i.sku && i.asin && (i.fulfillmentChannel || 'DEFAULT') === 'DEFAULT');
    const wrongOos = [], oversell = [], omsLag = [];
    for (const i of self) {
      const l = lotsFor(i.asin, L); if (!l) continue;
      const amz = parseInt(i.quantity, 10) || 0, bl = blockedByAsin[i.asin] || 0;
      const free = Math.floor((l.low - bl * l.need) / l.need);
      const id = `${acct}:${i.sku}`;
      if (amz <= 0 && l.low >= MIN && free >= MIN) { wrongOos.push({ i, l, bl, free }); seen['oos:' + id] = 1; }
      // Amazon already holds back its own pending orders, so compare with LOTS units directly
      if (amz > 0 && (l.low < MIN || amz > l.units + 2)) {
        // small gap on a well-stocked item (e.g. Amazon 3241, LOTS 3225) is not a real risk - LOTS changed since the last hourly push
        if (l.low >= 50 && amz - l.units <= Math.max(2, Math.ceil(l.units * 0.05))) continue;
        // OMS Guru was already set lower an hour+ ago but Amazon still shows the old number -> OMS Guru did not send it to Amazon
        const o = omsByAsin[i.asin];
        if (o && o.exp < amz && o.exp <= l.units && o.at && now - o.at > 60 * 60e3) { omsLag.push({ i, l, amz, o }); seen['lag:' + id] = 1; continue; }
        oversell.push({ i, l, amz, bl }); seen['over:' + id] = 1;
      }
    }
    if (process.env.DRY_RUN === 'true') console.log(`${acct}: raw wrong-OOS ${wrongOos.length}, raw oversell ${oversell.length}, OMS-not-sent ${omsLag.length}`); wrongOos.slice(0, 6).forEach((x) => console.log(`   OOS? ${x.i.sku} ${String(x.i.name || '').slice(0, 40)} LOTS ${x.l.low} blocked ${x.bl} free ${x.free}`)); oversell.slice(0, 6).forEach((x) => console.log(`   OVER? ${x.i.sku} ${String(x.i.name || '').slice(0, 40)} amz ${x.amz} LOTS ${x.l.low} units ${x.l.units} blocked ${x.bl}`));
    // only what was also seen in the previous check (give robots + OMS Guru one cycle to catch up)
    const oosConf = wrongOos.filter((x) => prevSeen[`oos:${acct}:${x.i.sku}`]);
    const overConf = oversell.filter((x) => prevSeen[`over:${acct}:${x.i.sku}`]);
    const lagConf = omsLag.filter((x) => prevSeen[`lag:${acct}:${x.i.sku}`]);
    const sold30 = {}; S.orders.forEach((o) => { if (o.isCanceled || /^(pending|cancel)/i.test(o.status || '') || !o.purchaseDate || now - Date.parse(o.purchaseDate) > 30 * 864e5) return; (o.items || []).forEach((it) => { if (it.asin) sold30[it.asin] = (sold30[it.asin] || 0) + (+it.qty || 1); }); });
    const bySales = (a, b) => (sold30[b.i.asin] || 0) - (sold30[a.i.asin] || 0);
    if (oosConf.length) findings.push({ key: `oos_${acct}`, n: oosConf.length, text: `🔴 <b>${label} · ${oosConf.length} wrongly OUT OF STOCK</b> (LOTS has stock, Amazon shows 0)\n` +
      oosConf.sort(bySales).slice(0, 8).map((x) => `• ${esc((x.i.name || x.i.sku).slice(0, 38))} — LOTS ${x.l.low}${x.bl ? `, blocked ${x.bl}` : ''} · sold ${sold30[x.i.asin] || 0}/30d\n   <code>${esc(x.i.sku)}</code>`).join('\n') });
    if (lagConf.length) {
      const since = Math.min(...lagConf.map((x) => x.o.at)), hm = new Date(since + IST).toISOString().slice(11, 16), gap = lagConf.reduce((a, x) => a + (x.amz - x.o.exp), 0);
      lagConf.sort((a, b) => (b.amz - b.o.exp) - (a.amz - a.o.exp));
      findings.push({ key: `lag_${acct}`, n: lagConf.length, text: `🟠 <b>${label} · OMS Guru is not updating Amazon stock</b>\n` +
        `The robot set the correct stock in OMS Guru at ${hm}, but Amazon still shows the old (higher) number on <b>${lagConf.length}</b> listings (${gap.toLocaleString('en-IN')} extra units). Robot is not at fault — OMS Guru did not send it to ${label}.\n` +
        lagConf.slice(0, 5).map((x) => `• ${esc((x.i.name || x.i.sku).slice(0, 38))} — Amazon ${x.amz}, should be ${x.o.exp}`).join('\n') +
        `\n<b>Fix:</b> OMS Guru → Channel → List Channels → ${label} Amazon → check inventory sync is ON / re-connect Amazon.` });
    }
    if (overConf.length) findings.push({ key: `over_${acct}`, n: overConf.length, text: `🟠 <b>${label} · ${overConf.length} OVERSELL risk</b> (Amazon shows more than LOTS has)\n` +
      overConf.sort(bySales).slice(0, 8).map((x) => `• ${esc((x.i.name || x.i.sku).slice(0, 38))} — Amazon ${x.amz}, LOTS ${x.l.low}${x.l.need !== 1 ? ` (= ${x.l.units} Amazon units)` : ''}\n   <code>${esc(x.i.sku)}</code>`).join('\n') });

    // 3 + 4: robot price changes in the last 24 h
    const bySku = Object.fromEntries(self.map((i) => [i.sku, i]));
    const pu = await spa.collection('spapiPriceUpdates').where('account', '==', acct).where('source', '==', 'robot').get().catch(() => null);
    const below = [], bigCut = [];
    (pu ? pu.docs : []).forEach((d) => {
      const x = d.data(), t = x.appliedAt && x.appliedAt.toMillis ? x.appliedAt.toMillis() : 0;
      if (!t || now - t > 864e5 || !(x.newPrice > 0)) return;
      const i = bySku[x.sku]; if (!i || Math.abs((i.price || 0) - x.newPrice) > 0.5) return;      // price changed since - not the robot's any more
      const l = lotsFor(i.asin, L);
      // the robot's profit counts the shipping charge the buyer pays, so compare price + shipping with cost (not price alone)
      const own = ((S.pricing[i.asin] || {}).offers || []).find((o) => Math.abs((Number(o.price) || 0) - x.newPrice) <= 1), ship = own ? Number(own.shipping) || 0 : 0;
      if (l && l.cost && x.newPrice + ship < l.cost - 0.5) below.push({ i, x, l });
      if (x.oldPrice > 0 && x.newPrice < x.oldPrice * 0.75) bigCut.push({ i, x });
    });
    below.forEach((y) => console.log(`   BELOW COST ${acct} ${y.i.sku} ${String(y.i.name || '').slice(0, 40)}: ${y.x.oldPrice} -> ${y.x.newPrice}, LOTS cost ${y.l.cost} (${y.l.name})`));
    bigCut.forEach((y) => console.log(`   BIG CUT ${acct} ${y.i.sku} ${String(y.i.name || '').slice(0, 40)}: ${y.x.oldPrice} -> ${y.x.newPrice}`));
    if (below.length) findings.push({ key: `below_${acct}`, n: below.length, now: true, text: `🔴 <b>${label} · ${below.length} robot price(s) BELOW LOTS COST</b>\n` +
      below.slice(0, 8).map((y) => `• ${esc((y.i.name || y.i.sku).slice(0, 38))} — ${inr(y.x.oldPrice || 0)} → <b>${inr(y.x.newPrice)}</b>, cost ${inr(y.l.cost)}\n   <code>${esc(y.i.sku)}</code>`).join('\n') });
    if (bigCut.length) findings.push({ key: `cut_${acct}`, n: bigCut.length, now: true, text: `🟠 <b>${label} · ${bigCut.length} robot price cut(s) over 25%</b>\n` +
      bigCut.slice(0, 8).map((y) => `• ${esc((y.i.name || y.i.sku).slice(0, 38))} — ${inr(y.x.oldPrice)} → <b>${inr(y.x.newPrice)}</b>\n   <code>${esc(y.i.sku)}</code>`).join('\n') });

    // 5: sudden swing in out-of-stock count
    const oosCount = self.filter((i) => (parseInt(i.quantity, 10) || 0) <= 0).length, inStock = self.length - oosCount;
    const prev = (st.counts || {})[acct];
    if (prev && prev.at && now - prev.at < 3 * 3600e3 && oosCount - prev.oos >= Math.max(25, prev.oos * 0.2))
      findings.push({ key: `swing_${acct}`, n: oosCount, now: true, text: `🔴 <b>${label} · out-of-stock jumped ${prev.oos} → ${oosCount}</b> in ${Math.round((now - prev.at) / 60e3)} min. Check the robot changes on the Amazon page.` });
    summary[acct] = { oos: oosCount, inStock, at: now };

    // 6: sales drop vs the last 7 days at the same hour (from 11 am IST, enough orders to judge)
    const hr = new Date(now + IST).getUTCHours();
    if (hr >= 11) {
      const dayStart = (d) => Date.parse(new Date(now + IST - d * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z') - IST;
      const unitsBetween = (a, b) => S.orders.reduce((s, o) => { const t = Date.parse(o.purchaseDate || ''); return !o.isCanceled && !/cancel/i.test(o.status || '') && t >= a && t < b ? s + (o.items || []).reduce((q, it) => q + (+it.qty || 1), 0) : s; }, 0);
      const elapsed = now - dayStart(0), today = unitsBetween(dayStart(0), now);
      const past = [1, 2, 3, 4, 5, 6, 7].map((d) => unitsBetween(dayStart(d), dayStart(d) + elapsed)), avg = past.reduce((a, b) => a + b, 0) / 7;
      if (avg >= 20 && today < avg * 0.5) findings.push({ key: `sales_${acct}`, n: Math.round(avg - today), text: `🟠 <b>${label} · sales down</b>: ${today} units so far today vs ${Math.round(avg)} usual by this time (last 7 days). Check out-of-stock and price changes.` });
    }

    // 7: robot stopped
    const full = S.meta.fullSyncedAt || 0;
    if (now - full > 4 * 3600e3) findings.push({ key: `stale_${acct}`, now: true, text: `⛔ <b>${label}</b>: no full Amazon robot run for ${Math.round((now - full) / 3600e3)} h — prices, relists and the out-of-stock rule are not running.` });
  }
  // any robot workflow whose last 2 runs failed
  try {
    const H = { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, repo = process.env.GITHUB_REPOSITORY;
    const flows = { 'spapi-sync.yml': 'Amazon robot (Praso)', 'spapi-sync-sastastore.yml': 'Amazon robot (Sasta Store)', 'oms-inventory-push.yml': 'OMS stock robot', 'sync-workflow.yml': 'OMS Guru order sync', 'nimbus-sync.yml': 'NimbusPost sync' };
    for (const [f, name] of Object.entries(flows)) {
      const r = await (await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${f}/runs?branch=main&status=completed&per_page=6`, { headers: H })).json();
      const runs = (r.workflow_runs || []).filter((x) => x.conclusion !== 'cancelled' && x.conclusion !== 'skipped');
      if (runs.length >= 2 && runs[0].conclusion === 'failure' && runs[1].conclusion === 'failure')
        findings.push({ key: `fail_${f}`, now: true, text: `⛔ <b>${name}</b>: last 2 runs FAILED (latest ${Math.round((now - Date.parse(runs[0].created_at)) / 60e3)} min ago). Its work is not being done.` });
    }
  } catch (e) { console.warn('Run check skipped:', e.message || e); }
  if (!omsDoc || now - (omsDoc.at || 0) > 3 * 3600e3) findings.push({ key: 'oms_stale', now: true, text: `⛔ <b>OMS stock robot</b>: no run for ${omsDoc ? Math.round((now - omsDoc.at) / 3600e3) + ' h' : 'a long time'} — LOTS stock is not reaching OMS Guru.` });
  else if (['failed', 'error', 'stopped', 'partial'].includes(omsDoc.status)) findings.push({ key: `oms_${omsDoc.status}`, now: true, text: `⛔ <b>OMS stock robot ${omsDoc.status}</b>: ${esc(omsDoc.note || '')}` });

  // report: new problems, or the same list after 6 h, or a list that grew
  const last = st.reported || {}, report = [];
  for (const f of findings) {
    const r = last[f.key];
    if (!r || now - r.at > 6 * 3600e3 || (f.n || 0) > (r.n || 0)) report.push(f);
  }
  const reported = {}; findings.forEach((f) => { reported[f.key] = report.includes(f) ? { at: now, n: f.n || 0 } : (last[f.key] || { at: now, n: f.n || 0 }); });
  console.log(`Watchdog: ${findings.length} problem(s) found, ${report.length} to report. ` + Object.entries(summary).map(([a, s]) => `${a}: ${s.inStock} in stock, ${s.oos} out of stock`).join(' · '));
  findings.forEach((f) => console.log('  -', f.text.replace(/<[^>]+>/g, '').split('\n')[0]));
  if (process.env.DRY_RUN === 'true') { console.log('TEST - not sent, state not saved. Would send:\n' + report.map((f) => f.text.replace(/<[^>]+>/g, '')).join('\n---\n')); return; }
  await stateRef.set({ at: now, seen, counts: summary, reported, findings: findings.map((f) => ({ key: f.key, n: f.n || 0, text: f.text.replace(/<[^>]+>/g, '') })) });
  if (report.length) await notify(`🛡 <b>ROBOT WATCHDOG</b>\n${LINE}\n${report.map((f) => f.text).join(`\n${LINE}\n`)}\n${LINE}\nOpen the Amazon page → 🤖 Robot changes to see what the robot did.`, { html: true });
})().catch((e) => { console.error('Watchdog failed:', e.message || e); process.exitCode = 1; });
