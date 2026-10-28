// sp-guard.js — keeps Amazon SP-API calls clean (owner request, 28 Oct 2026).
// Amazon's usage page showed ~17% failed calls: 27.7K Finance calls with no permission (403),
// 1.2K shipping-label calls with no permission, ~2.8K "too fast" (429) and 468 "SKU not found" (404).
//
// Wrap a client once:  guard.wrap(spClient)  - every spClient.callAPI() then goes through these rules:
//  1. NO PERMISSION (403 Unauthorized, not an expired token): that API is paused for 24 h. While paused the
//     call is NOT sent to Amazon - it fails at once with the same error, so the code around it behaves as before.
//     One Telegram alert per pause. After 24 h one test call is sent; once the role is approved it just works.
//  2. TOO FAST (429): waits and retries (max 5 tries) and slows that operation down for the rest of the run.
//     Each operation also keeps a minimum gap between calls, matching Amazon's published rate limits.
//  3. SKU NOT FOUND (404 on getListingsItem): that SKU is not asked again for 3 days, unless it shows up in
//     this run's listings report or the robot creates/updates it.
//  4. Counts every call per operation (today's totals) - shown as the "API health" line on the Amazon page.
//
// State: ONE Firestore doc per account, spapiSnapshots/<account>_guard -> 1 read + 1 write per run.

const DAY = 864e5;
const BLOCK_MS = DAY, DEAD_MS = 3 * DAY;
// APIs that need a separate Amazon role - a refusal means the whole API is off for this app.
const ROLE_APIS = new Set(['finances', 'merchantFulfillment', 'easyShip', 'shipping', 'sellerWallet', 'transfers', 'support', 'solicitations', 'messaging']);

// Minimum gap (ms) between two calls of the same operation (Amazon rate limits, with a small safety margin).
const MIN_GAP = {
  getOrders: 1100, getOrder: 1100, getOrderItems: 2100, getOrderAddress: 2100, getOrderBuyerInfo: 2100,
  listFinancialEventsByOrderId: 2100,
  getItemOffers: 2100, getListingOffers: 2100, getItemOffersBatch: 10500, getListingOffersBatch: 10500,
  getCompetitivePricing: 2100, getPricing: 2100, getMyFeesEstimates: 2100, getMyFeesEstimateForSKU: 2100,
  searchCatalogItems: 600, getCatalogItem: 600,
  getListingsItem: 250, patchListingsItem: 250, putListingsItem: 250, deleteListingsItem: 250, getListingsRestrictions: 250,
  createReport: 60000, getReport: 2100, getReportDocument: 2100,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); // India date
const txt = (e) => `${(e && e.code) || ''} ${(e && e.message) || ''} ${(e && e.details) || ''}`;
const isThrottle = (e) => /QuotaExceeded|TooManyRequests|throttl|\b429\b/i.test(txt(e));
const isDenied = (e) => /^\s*Unauthorized\b|access to requested resource is denied/i.test(txt(e)) && !/token.*expired/i.test(txt(e));
const isNotFound = (e) => /^\s*NotFound\b|\b404\b|not found/i.test(txt(e));

function createGuard({ db, docId, account, notify, isLive }) {
  const ref = db.collection('spapiSnapshots').doc(docId);
  let state = { blocked: {}, dead: {}, day: today(), stats: {} };
  let dirty = false;
  const last = {}, gap = {};
  const runStats = {};
  const denied = {};

  async function load() {
    try {
      const d = (await ref.get()).data();
      if (d) state = { blocked: d.blocked || {}, dead: d.dead || {}, day: d.day || today(), stats: d.stats || {} };
    } catch (e) { console.warn('API guard: could not read saved state (continuing):', e.message || e); }
    if (state.day !== today()) { state.yesterday = state.stats; state.stats = {}; state.day = today(); dirty = true; }
    const now = Date.now();
    for (const [k, v] of Object.entries(state.blocked)) if (v.until <= now) { delete state.blocked[k]; dirty = true; console.log(`API guard: ${k} pause ended - one test call will be tried.`); }
    for (const [k, v] of Object.entries(state.dead)) if (v <= now) { delete state.dead[k]; dirty = true; }
    const paused = Object.keys(state.blocked);
    if (paused.length) console.log(`API guard: paused (no permission): ${paused.join(', ')}`);
  }

  function count(op, kind) {
    for (const s of [state.stats, runStats]) {
      const o = s[op] = s[op] || { calls: 0, ok: 0, e403: 0, e404: 0, e429: 0, other: 0, skipped: 0 };
      o[kind]++;
    }
    dirty = true;
  }

  async function pace(op) {
    const g = gap[op] != null ? gap[op] : (MIN_GAP[op] || 0);
    const wait = (last[op] || 0) + g - Date.now();
    if (wait > 0) await sleep(wait);
    last[op] = Date.now();
  }

  function skuOf(args) { return args && args.path && args.path.sku ? String(args.path.sku) : ''; }

  async function call(orig, args) {
    const op = args.operation || args.api_path || 'unknown';
    const key = `${args.endpoint || 'api'}.${op}`;
    const b = state.blocked[key];
    if (b && b.until > Date.now()) {
      count(op, 'skipped');
      const e = new Error(`Access to requested resource is denied (paused by API guard until ${new Date(b.until).toISOString()})`);
      e.code = 'Unauthorized'; e.guardSkipped = true; throw e;
    }
    const sku = skuOf(args);
    if (op === 'getListingsItem' && sku && state.dead[sku] && !(isLive && isLive(sku))) {
      count(op, 'skipped');
      const e = new Error(`NotFound: SKU ${sku} not on Amazon (checked recently - skipped by API guard)`);
      e.code = 'NotFound'; e.guardSkipped = true; throw e;
    }
    for (let t = 0; ; t++) {
      await pace(op);
      count(op, 'calls');
      try {
        const res = await orig(args);
        count(op, 'ok');
        if (sku && /^(putListingsItem|patchListingsItem)$/.test(op) && state.dead[sku]) delete state.dead[sku];
        if (sku && op === 'deleteListingsItem') state.dead[sku] = Date.now() + DEAD_MS;
        return res;
      } catch (e) {
        if (isThrottle(e)) {
          count(op, 'e429');
          gap[op] = Math.min(Math.max((gap[op] != null ? gap[op] : (MIN_GAP[op] || 500)) * 1.5, 1000), 30000);
          if (t < 4) { await sleep(gap[op] * (t + 1)); continue; }
          throw e;
        }
        if (isDenied(e)) {
          count(op, 'e403');
          // Whole-API "no role" endpoints pause at once; any other operation only after 3 refusals in one run
          // (one odd SKU must never stop price/stock updates).
          denied[key] = (denied[key] || 0) + 1;
          if (!ROLE_APIS.has(args.endpoint) && denied[key] < 3) throw e;
          state.blocked[key] = { until: Date.now() + BLOCK_MS, since: Date.now(), msg: String(e.message || '').slice(0, 200) };
          console.warn(`API guard: no permission for ${key} - paused for 24 h (no more calls until then).`);
          if (notify) notify(`⛔ <b>Amazon API paused</b> (${account})\n${key}: no permission from Amazon.\nPaused 24 h so Amazon is not flooded with failed calls. Starts working by itself once the role is approved and the new token is saved.`).catch(() => {});
          throw e;
        }
        if (isNotFound(e)) {
          count(op, 'e404');
          if (op === 'getListingsItem' && sku) state.dead[sku] = Date.now() + DEAD_MS;
          throw e;
        }
        count(op, 'other');
        throw e;
      }
    }
  }

  function wrap(client) {
    const orig = client.callAPI.bind(client);
    client.callAPI = (args) => call(orig, args);
    return client;
  }

  function summary(s = runStats) {
    let calls = 0, bad = 0, skipped = 0;
    Object.values(s).forEach((o) => { calls += o.calls; bad += o.e403 + o.e404 + o.e429 + o.other; skipped += o.skipped; });
    return { calls, bad, skipped, errPct: calls ? Math.round((bad / calls) * 1000) / 10 : 0 };
  }

  async function save() {
    const r = summary(), d = summary(state.stats);
    console.log(`API guard: this run ${r.calls} calls, ${r.bad} errors (${r.errPct}%), ${r.skipped} blocked before sending. Today: ${d.calls} calls, ${d.errPct}% errors.`);
    if (!dirty) return;
    try {
      // dead-SKU list is capped so the doc stays small
      const dead = Object.fromEntries(Object.entries(state.dead).sort((a, b) => b[1] - a[1]).slice(0, 3000));
      await ref.set({ account, blocked: state.blocked, dead, day: state.day, stats: state.stats, yesterday: state.yesterday || null,
        today: d, lastRun: { ...r, at: Date.now() }, updatedAt: Date.now() });
      dirty = false;
    } catch (e) { console.warn('API guard: could not save state:', e.message || e); }
  }

  return { load, wrap, save, summary, isBlocked: (endpoint, op) => { const b = state.blocked[`${endpoint}.${op}`]; return !!(b && b.until > Date.now()); } };
}

module.exports = { createGuard };
