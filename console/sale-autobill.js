/* =====================================================================
   AIKM Purchase & Sales — AUTO SALE BILLS  (console/sale-autobill.js)
   Adds "⚡ Auto sale bills" to the Sales tab of dalbhaat.in/pages/purchase-bills.

   What it does
   - Reads OMS Guru orders (synced every 15 min into aikm-oms-sync) and takes the ones
     SHIPPED on a chosen date, for Praso Enterprises, Sasta Store, E Commerce Munda and
     Vishal E Commerce (all their marketplaces). AIKM's own channels are left out.
   - Finds each sold product in AIKM's purchase bills (via the Amazon page's ASIN map,
     then the Order Mapper's remembered matches, then barcode / name).
   - Sale rate = purchase cost (ex-GST, landed) + 20%. If that would go above MRP it is
     lowered to fit MRP, down to 15%. Below 15% only when MRP forces it (flagged).
   - Makes ONE draft bill per company per shipped date. Nothing is saved until
     "Approve & save" is pressed. Saved bills use the normal bill series and show in Sales.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__aikmAutoBill) return;
  window.__aikmAutoBill = true;

  /* ---------- settings ---------- */
  const MAX_PCT = 20, MIN_PCT = 15;
  const COMPANIES = [
    { id: "praso", re: /^praso/i, gstin: "09CKOPP4345K1ZG", label: "Praso Enterprises" },
    { id: "sasta", re: /^sasta/i, gstin: "09AEWFS5594P1ZI", label: "Sasta Store", noCap: true },   // no ₹49,999 cap: one full bill a day + e-way bill when over ₹50,000
    { id: "munda", re: /^e[\s-]*commerce\s*munda/i, gstin: "09LNSPK8937N1ZI", label: "E Commerce Munda" },
    { id: "vishal", re: /^vishal/i, gstin: "09DHZPP6300R1Z6", label: "Vishal E Commerce" },
  ];
  const SB_URL = "https://cczwxitdzokdatblfhjv.supabase.co", SB_KEY = "sb_publishable_ylm4mT8duGpUm5CT24LLXw_FgICDvIB";
  const FS = {
    oms: { p: "aikm-oms-sync", k: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk" },
    main: { p: "aikm--order-file", k: "AIzaSyDd_XzDHhHqKO9g9ff8k7O32Fs1GLNxhHU" },
  };

  /* ---------- small helpers ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => { const x = parseFloat(String(v ?? "").replace(/[,₹\s]/g, "")); return isFinite(x) ? x : 0; };
  const money = v => { v = Number(v) || 0; return Math.round((v + (v >= 0 ? 1e-9 : -1e-9)) * 100) / 100; };
  const inr = (v, d = 0) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const normName = s => String(s || "").toLowerCase().replace(/[^a-z0-9.%]+/g, " ").trim();
  const normKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const isoOf = s => { const m = String(s || "").trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/); if (!m || !MON[m[1].toLowerCase()]) return ""; return `${m[3]}-${String(MON[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`; };
  const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtD = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${+d} ${MONS[+m - 1]}`; };
  const dayName = s => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(s + "T00:00:00").getDay()];
  const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const addDays = (s, k) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const fyOf = date => { const [y, m] = date.split("-").map(Number); const s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };
  const fyShort = f => f.slice(2, 4) + "-" + f.slice(5, 7);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const nowIso = () => new Date().toISOString();
  function toast(msg, ms = 3500) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; (document.getElementById("toastRoot") || document.body).append(t); setTimeout(() => t.remove(), ms); }

  /* In-page "Are you sure?" box. Chrome's own confirm() pop-up stops showing (and silently answers "No")
     once "Don't allow this site to prompt again" is ticked, so buttons looked dead. */
  function askYes(text, okLabel = "Yes") {
    return new Promise(res => {
      const o = document.createElement("div");
      o.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:rgba(15,30,53,.45);display:flex;align-items:center;justify-content:center;padding:16px";
      o.innerHTML = `<div role="alertdialog" style="background:#fff;border-radius:14px;border-top:3px solid #C9A24B;max-width:520px;width:100%;box-shadow:0 24px 70px rgba(15,30,53,.3);font:14px/1.5 Inter,system-ui,sans-serif;color:#14213D">
        <div style="padding:18px 20px 6px;font:600 16px Lexend,Inter,sans-serif">Please check</div>
        <div style="padding:4px 20px 6px;white-space:pre-line;max-height:55vh;overflow:auto;color:#4A5468">${esc(text)}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 18px">
          <button type="button" data-n style="cursor:pointer;border:1px solid #E7E1D3;background:#fff;color:#4A5468;border-radius:9px;padding:9px 16px;font-weight:600">Cancel</button>
          <button type="button" data-y style="cursor:pointer;border:0;background:#0F1E35;color:#fff;border-radius:9px;padding:9px 18px;font-weight:600">${esc(okLabel)}</button></div></div>`;
      const done = v => { document.removeEventListener("keydown", key, true); o.remove(); res(v); };
      const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); done(true); } };
      o.querySelector("[data-y]").onclick = () => done(true); o.querySelector("[data-n]").onclick = () => done(false);
      o.onclick = e => { if (e.target === o) done(false); };
      document.addEventListener("keydown", key, true); document.body.append(o); setTimeout(() => o.querySelector("[data-y]").focus(), 30);
    });
  }

  /* same product naming rules as the Purchase & Sales tool */
  function withSize(name, pack) {
    name = String(name || "").trim(); const pk = String(pack || "").trim();
    if (!pk || !/\d/.test(pk) || !/[a-z]/i.test(pk)) return name;
    const sq = x => normName(x).replace(/\s+/g, "");
    return sq(name).includes(sq(pk)) ? name : name + " " + pk;
  }
  const pkey = it => it.barcode ? "bc:" + it.barcode : normName(withSize(it.name, it.pack));

  /* ---------- Supabase ---------- */
  async function sb(method, path, body, prefer) {
    for (let i = 0; ; i++) {
      let r;
      try {
        r = await fetch(SB_URL + "/rest/v1/" + path, { method, headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (e) { if (i < 3) { await new Promise(r => setTimeout(r, 800 * (i + 1))); continue; } throw new Error("No internet connection."); }
      if ((r.status >= 500 || r.status === 429) && i < 3) { await new Promise(r => setTimeout(r, 800 * (i + 1))); continue; }
      const t = await r.text();
      if (!r.ok) throw new Error("Database error " + r.status + ". " + t.slice(0, 160));
      return t ? JSON.parse(t) : null;
    }
  }
  async function sbAll(query) {
    const out = [];
    for (let off = 0; ; off += 1000) { const rows = await sb("GET", `docs?${query}&order=kind.asc,id.asc&limit=1000&offset=${off}`); out.push(...rows); if (rows.length < 1000) break; }
    return out;
  }
  const sbPut = rows => sb("POST", "docs", rows.map(r => ({ kind: r.kind, id: String(r.id), fy: r.fy ?? null, data: r.data, updated_at: nowIso() })), "resolution=merge-duplicates,return=minimal");

  /* ---------- Firestore (read-only, REST) ---------- */
  function fv(v) {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("nullValue" in v) return null;
    if ("mapValue" in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k in f) o[k] = fv(f[k]); return o; }
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fv);
    if ("timestampValue" in v) return v.timestampValue;
    return null;
  }
  const fsBase = (db, path) => `https://firestore.googleapis.com/v1/projects/${FS[db].p}/databases/(default)/documents/${path}`;
  async function fsDoc(db, path) {
    const r = await fetch(fsBase(db, path) + "?key=" + FS[db].k);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Could not read " + path + " (" + r.status + ")");
    const j = await r.json(); const o = {}; for (const k in (j.fields || {})) o[k] = fv(j.fields[k]); return o;
  }
  async function fsList(db, path, size = 50) {
    const out = []; let tok = "";
    for (let i = 0; i < 200; i++) {
      let r;
      for (let t = 0; t < 3; t++) {
        try { r = await fetch(fsBase(db, path) + `?pageSize=${size}&key=${FS[db].k}` + (tok ? "&pageToken=" + encodeURIComponent(tok) : "")); if (r.ok) break; } catch (e) { r = null; }
        await new Promise(res => setTimeout(res, 1500 * (t + 1)));
      }
      if (!r) throw new Error("No connection while reading " + path);
      if (!r.ok) throw new Error("Could not read " + path + " (" + r.status + ")");
      const j = await r.json();
      (j.documents || []).forEach(d => { const o = { _id: d.name.split("/").pop() }; for (const k in (d.fields || {})) o[k] = fv(d.fields[k]); out.push(o); });
      tok = j.nextPageToken; if (!tok) break;
    }
    return out;
  }

  /* =====================================================================
     DATA
     ===================================================================== */
  let D = null;          // loaded data
  let archFail = false;
  async function loadAll(progress) {
    archFail = false;
    progress("Loading orders…");
    const [omsChunks, archChunks, asinDoc, mmChunks, lotsChunks] = await Promise.all([
      fsList("oms", "aikm_admin/omsOrders/chunks"),
      fsList("oms", "aikm_admin/omsArchive/chunks", 5).catch(() => { archFail = true; return []; }),
      fsDoc("main", "aikm_admin/spapiAsinLotsMap").catch(() => null),
      fsList("main", "aikm_admin/masterMapping/chunks").catch(() => []),
      fsList("main", "aikm_admin/lotsCatalog/chunks").catch(() => []),
    ]);
    progress("Loading purchase bills…");
    const rows = await sbAll(`kind=in.(bill,customer,setting,product_hsn,autobill_map,autobill_done,stock_open,stock_adj)&select=kind,id,data`);
    const by = k => rows.filter(r => r.kind === k);

    // live data first (freshest status), then the archive for older shipped dates
    const orders = omsChunks.flatMap(c => c.orders || []).concat(archChunks.flatMap(c => c.orders || []));
    const asinMap = (asinDoc && asinDoc.map) || {};
    const mm = Object.assign({}, ...mmChunks.map(c => c.map || {}));
    const lots = {}; lotsChunks.forEach(c => (c.products || []).forEach(p => { if (p && p.code) lots[String(p.code)] = p; }));
    const settings = (by("setting").find(r => r.id === "company") || {}).data || {};
    const merge = (by("setting").find(r => r.id === "product_merge") || {}).data || {};
    const hsnOver = {}; by("product_hsn").forEach(r => { if (r.data && r.data.key && r.data.hsn) hsnOver[r.data.key] = String(r.data.hsn); });
    const userMap = {}; by("autobill_map").forEach(r => { userMap[r.id] = r.data; });
    const done = {}; by("autobill_done").forEach(r => { done[r.id] = r.data; });
    const customers = by("customer").map(r => r.data).filter(Boolean);
    const abSales = {}, otherSales = [];
    (await sbAll(`kind=eq.sale&select=kind,id,data`)).forEach(r => { if (!r.data) return; if (r.data.source === "autobill") abSales[r.id] = r.data; else otherSales.push(r.data); });

    /* product index from purchase bills (latest purchase wins) */
    const mergeTo = k => { const m = merge.map || {}; for (let i = 0; i < 6 && m[k] && m[k] !== k; i++) k = m[k]; return k; };
    const prods = new Map(), byCode = new Map(), byBc = new Map(), byName = new Map();
    for (const r of by("bill")) {
      const b = r.data; if (!b || !b.items || !b.items.length || b.docType === "credit") continue;
      const lines = b.items.map(it => {
        const qty = num(it.qty), free = num(it.free), rate = num(it.rate), disc = num(it.discPct), g = num(it.gstPct);
        let tx = num(it.taxable); if (!tx && qty && rate) tx = qty * rate * (1 - disc / 100);
        let tot = num(it.lineTotal); if (!tot) tot = tx * (1 + g / 100);
        if (!tx && tot) tx = tot / (1 + g / 100);
        return { tx, tot, units: qty + free };
      });
      const sumTot = lines.reduce((a, l) => a + l.tot, 0), extra = num(b.otherCharges) - num(b.billDiscount);
      const factor = sumTot ? (sumTot + extra) / sumTot : 1;
      b.items.forEach((it, i) => {
        const l = lines[i]; if (!it.name || !(l.units > 0) || !(l.tx > 0)) return;
        const raw = pkey(it), key = mergeTo(raw), cost = l.tx / l.units * factor;
        const p = prods.get(key) || { key, name: "", hsn: "", gst: 0, mrp: 0, barcode: "", cost: 0, date: "", sup: "", billNo: "" };
        if ((b.billDate || "") >= p.date) Object.assign(p, { name: withSize(it.name, it.pack), cost, gst: num(it.gstPct), mrp: num(it.mrp) || p.mrp, date: b.billDate || "", sup: b.supplier || "", billNo: b.billNo || "" });
        if (it.hsn && !p.hsn) p.hsn = String(it.hsn);
        if (it.barcode && !p.barcode) p.barcode = String(it.barcode);
        prods.set(key, p);
        if (it.code) byCode.set(String(it.code), key);
        if (it.barcode) byBc.set(String(it.barcode), key);
        byName.set(normName(withSize(it.name, it.pack)), key);
        if (raw !== key) byName.set(normName(raw.replace(/^bc:/, "")), key);
      });
    }
    for (const p of prods.values()) {
      const nm = (merge.names || {})[p.key]; if (nm) p.name = nm;
      const inf = (merge.info || {})[p.key] || {};
      if (num(inf.mrp)) p.mrp = num(inf.mrp);
      if (String(inf.gst || "") !== "") p.gst = num(inf.gst);
      if (hsnOver[p.key]) p.hsn = hsnOver[p.key];
    }
    /* STOCK = opening count + purchases − sales (other than auto bills, which the planner handles) ± adjustments.
       Each event has a date; the planner only bills what is in stock on the bill's date, so stock never goes negative. */
    const stockEv = [];
    const ev = (date, key, q) => { if (key && q) stockEv.push({ date: date || "0000-00-00", key, q }); };
    const op = (by("stock_open")[0] || {}).data;
    if (op && op.date) for (const [k, o] of Object.entries(op.items || {})) ev(op.date, mergeTo(k), num(o.qty));
    for (const r of by("bill")) {
      const b = r.data; if (!b || !b.items) continue;
      if (op && op.date && (b.billDate || "") < op.date) continue;          // before the opening count = already inside it
      b.items.forEach(it => { if (!it.name) return; const u = num(it.qty) + num(it.free); ev(b.billDate, mergeTo(pkey(it)), b.docType === "credit" ? -Math.abs(u) : u); });
    }
    for (const v of otherSales) {
      if (v.status === "Cancelled" || (op && op.date && (v.invoiceDate || "") < op.date)) continue;
      (v.items || []).forEach(it => { if (it.name) ev(v.invoiceDate, mergeTo(it.key || pkey(it)), -(num(it.qty) + num(it.free))); });
    }
    by("stock_adj").forEach(r => { const a = r.data || {}; if (!(op && op.date && (a.date || "") < op.date)) ev(a.date, mergeTo(a.key), num(a.qty)); });
    stockEv.sort((a, b) => a.date.localeCompare(b.date));
    PLAN = null;
    D = { stockEv, abSales, orders, asinMap, mm, lots, settings, merge, prods, byCode, byBc, byName, userMap, done, customers, loadedAt: Date.now() };
    return D;
  }

  /* =====================================================================
     MATCHING — one order line -> [{p (purchase product), units, via}]
     ===================================================================== */
  function prodForCode(code) {
    code = String(code || "").trim(); if (!code) return null;
    const k = D.byCode.get(code); if (k) return D.prods.get(k);
    const lp = D.lots[code];
    if (lp && lp.barcode && D.byBc.get(String(lp.barcode))) return D.prods.get(D.byBc.get(String(lp.barcode)));
    if (lp && D.byName.get(normName(lp.name))) return D.prods.get(D.byName.get(normName(lp.name)));
    return null;
  }
  /* LOTS item never billed to AIKM yet: use LOTS list price as the cost (flagged) */
  function lotsOnly(code) {
    const lp = D.lots[String(code || "").trim()]; if (!lp) return null;
    const slabs = lp.slabs || []; const last = slabs.length ? slabs[slabs.length - 1].price : 0;
    if (!num(last)) return null;
    const g = num(lp.gst);
    return { key: lp.barcode ? "bc:" + lp.barcode : normName(lp.name), name: lp.name, hsn: String(lp.hsn || ""), gst: g, mrp: num(lp.mrp), barcode: String(lp.barcode || ""), cost: num(last) / (1 + g / 100), date: "", sup: "LOTS price list", noBill: true };
  }
  const packMult = r => { const o = num(r.orderPackQty) || 1, v = num(r.vendorPackQty) || 1, m = o / v; return m > 0 && m <= 24 && Math.abs(m - Math.round(m)) < 0.01 ? Math.round(m) : 1; };
  function fromRecord(r, via) {
    if (!r) return null;
    if (r.ignore) return [];
    if (r.vendor && r.vendor.key && D.prods.get(r.vendor.key)) return [{ p: D.prods.get(r.vendor.key), units: num(r.vendor.qty) || 1, via }];
    if (r.prodKey && D.prods.get(r.prodKey)) return [{ p: D.prods.get(r.prodKey), units: num(r.mult) || 1, via }];
    let parts = Array.isArray(r.parts) && r.parts.length ? r.parts : String(r.code || "").split(",").map(c => c.trim()).filter(Boolean).map(c => ({ code: c, qty: 1, orderPackQty: r.orderPackQty, vendorPackQty: r.vendorPackQty }));
    if (!parts.length) {
      const k = D.byName.get(normName(r.name)); return k ? [{ p: D.prods.get(k), units: packMult(r), via }] : null;
    }
    const out = [];
    for (const pt of parts) {
      const p = prodForCode(pt.code) || lotsOnly(pt.code) || (pt.name && D.byName.get(normName(pt.name)) ? D.prods.get(D.byName.get(normName(pt.name))) : null);
      if (!p) return null;
      // lotsPack: the LOTS item is a bigger pack (e.g. 144 sticks) split into smaller Amazon packs -> bill the fraction of the pack
      out.push({ p, units: (num(pt.qty) || 1) * packMult(pt.orderPackQty ? pt : r) / (num(pt.lotsPack) > 1 ? num(pt.lotsPack) : 1), via });
    }
    return out;
  }
  function matchLine(o) {
    const asin = String(o.asin || "").trim(), sku = String(o.sku || "").trim();
    return fromRecord(D.userMap["asin:" + asin] || D.userMap["sku:" + normKey(sku)], "your pick")
      || (asin ? fromRecord(D.asinMap[asin], "Amazon map") : null)
      || fromRecord(D.mm[normKey(o.productName)], "Order Mapper")
      || fromRecord(D.mm[normKey(sku)], "Order Mapper")
      || (D.byName.get(normName(o.productName)) ? [{ p: D.prods.get(D.byName.get(normName(o.productName))), units: 1, via: "same name" }] : null);
  }

  /* =====================================================================
     DRAFTS
     ===================================================================== */
  const companyOf = ch => { const nm = String(ch || "").split(" - ")[0].trim(); return COMPANIES.find(c => c.re.test(nm)) || null; };
  const okStatus = s => !/cancel/i.test(s || "") || /return/i.test(s || "");
  function shippedOrders() {
    const seen = new Set(), out = [];
    for (const o of D.orders) {
      const date = isoOf(o.shipmentDate); if (!date) continue;
      const co = companyOf(o.channel); if (!co || !okStatus(o.status)) continue;
      const id = (o.channelSubOrderId || o.channelOrderId) + "|" + o.sku + "|" + o.channel;
      if (seen.has(id)) continue; seen.add(id);
      out.push({ ...o, _date: date, _co: co });
    }
    return out;
  }
  function priceFor(p) {
    const cost = p.cost, g = p.gst, cap = p.mrp > 0 ? Math.floor(p.mrp / (1 + g / 100) * 100) / 100 : Infinity;
    let rate = money(cost * (1 + MAX_PCT / 100)), capped = false;
    if (rate > cap) { rate = cap; capped = true; }
    return { rate, capped, pct: cost ? (rate / cost - 1) * 100 : 0 };
  }
  /* ---------- planner: one bill per company per working day (Sundays never), each bill at most ₹49,999.
     Orders queue up by shipped date; each day's bill takes the oldest unbilled goods first until the cap.
     Anything over the cap carries forward to the next working day (including days with no orders). ---------- */
  const START = "2026-10-01", CAP = 49999;
  const EDIT = {};          // user changes per product key: { rate, hsn } — used on every bill of that product
  const isSunday = d => new Date(d + "T00:00:00Z").getUTCDay() === 0;
  function workDays() { const out = []; for (let d = START, end = todayIso(); d <= end; d = addDays(d, 1)) if (!isSunday(d)) out.push(d); return out; }
  function lineFor(p) {
    const pr = priceFor(p), e = EDIT[p.key] || {};
    const rate = e.rate != null ? e.rate : pr.rate, hsn = String(e.hsn != null ? e.hsn : p.hsn || "");
    return { rate, hsn, capped: pr.capped && e.rate == null, unitInc: rate * (1 + p.gst / 100) };
  }
  let PLAN = null;
  function buildPlan() {
    const days = workDays(), ship = {};   // ship[coId][workday] = { lines: Map, unmatched: Map, orders: Set }
    const dayFor = d => { while (isSunday(d)) d = addDays(d, 1); return d; };   // Sunday shipments join Monday
    for (const o of shippedOrders()) {
      if (o._date < START) continue;
      const wd = dayFor(o._date), c = (ship[o._co.id] ||= {}), x = (c[wd] ||= { lines: new Map(), unmatched: new Map(), orders: new Set() }), q = num(o.qty) || 1;
      x.orders.add(o.channelOrderId);
      const m = matchLine(o);
      if (!m) {
        const k = o.asin ? "asin:" + o.asin : "sku:" + normKey(o.sku);
        const u = x.unmatched.get(k) || { k, asin: o.asin || "", sku: o.sku || "", name: o.productName || o.sku, qty: 0 };
        u.qty += q; x.unmatched.set(k, u); continue;
      }
      for (const { p, units, via } of m) {
        const L = x.lines.get(p.key) || { key: p.key, p, qty: 0, via, src: new Map() };
        L.qty = Math.round((L.qty + q * units) * 1000) / 1000;
        const sk = String(o.productName || o.sku).slice(0, 70), sv = L.src.get(sk) || { q: 0, u: units }; sv.q += q; L.src.set(sk, sv);
        x.lines.set(p.key, L);
      }
    }
    const plan = {}, queues = {}, open = {};   // plan[coId][day] = draft
    COMPANIES.forEach(co => { plan[co.id] = {}; queues[co.id] = []; open[co.id] = null; });
    const stock = new Map(); let evi = 0;
    const st = k => stock.get(k) || 0;
    for (const day of days) {
      while (evi < D.stockEv.length && D.stockEv[evi].date <= day) { const e = D.stockEv[evi++]; stock.set(e.key, st(e.key) + e.q); }
      for (const co of COMPANIES) {
        const c = ship[co.id] || {}, queue = queues[co.id], sd = c[day];
        if (sd) for (const L of sd.lines.values()) queue.push({ day, key: L.key, p: L.p, qty: L.qty, via: L.via, src: L.src });
        const id = day + "__" + co.gstin, done = D.done[id];
        const d = { co, id, date: day, done: done || null, orders: sd ? sd.orders : new Set(), unmatched: sd ? sd.unmatched : new Map(), lines: new Map(), from: "", to: "" };
        const take = (e, qty) => {
          const L = d.lines.get(e.key) || { key: e.key, p: e.p, qty: 0, via: e.via, src: new Map(), days: new Set() };
          L.qty = Math.round((L.qty + qty) * 1000) / 1000; L.days.add(e.day);
          for (const [k, v] of e.src) { const sv = L.src.get(k) || { q: 0, u: v.u }; sv.q += v.q; L.src.set(k, sv); }
          d.lines.set(e.key, L);
          if (!d.from || e.day < d.from) d.from = e.day; if (!d.to || e.day > d.to) d.to = e.day;
          e.qty = Math.round((e.qty - qty) * 1000) / 1000;
          stock.set(e.key, Math.round((st(e.key) - qty) * 1000) / 1000);
        };
        if (done) {
          // a saved bill: remove exactly what it billed from the queue (oldest first) and from stock
          const inv = D.abSales[done.invoiceId];
          for (const it of (inv && inv.items) || []) {
            let left = num(it.qty);
            for (const e of queue) { if (left <= 0) break; if (e.key !== it.key || e.qty <= 0) continue; const t = Math.min(e.qty, left); take(e, t); left = Math.round((left - t) * 1000) / 1000; }
            if (left > 0) stock.set(it.key, st(it.key) - left);
          }
        } else {
          let gross = 0;
          for (const e of queue) {
            if (e.qty <= 0) continue;
            const ln = lineFor(e.p); if (!(ln.unitInc > 0)) continue;
            const have = st(e.key); if (have <= 0.0005) continue;               // no stock on this date -> waits for the next purchase
            const room = (co.noCap ? Infinity : CAP - 1) - gross; if (room < ln.unitInc * 0.001) continue;
            const whole = Number.isInteger(e.qty);
            let fit = room / ln.unitInc; fit = !isFinite(fit) ? e.qty : whole ? Math.floor(fit) : Math.floor(fit * 1000) / 1000;
            let t = Math.min(e.qty, fit, have); t = whole ? Math.floor(t) : Math.floor(t * 1000) / 1000;
            if (t <= 0) continue;
            take(e, t); gross += t * ln.unitInc;
          }
        }
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].qty <= 0.0005) queue.splice(i, 1);
        d.carry = queue.reduce((a, e) => a + e.qty * lineFor(e.p).unitInc, 0);
        d.noStock = queue.filter(e => st(e.key) <= 0.0005).reduce((a, e) => a + e.qty * lineFor(e.p).unitInc, 0);
        d.noStockN = new Set(queue.filter(e => st(e.key) <= 0.0005).map(e => e.key)).size;
        const wl = new Map(); queue.filter(e => st(e.key) <= 0.0005).forEach(e => { const w = wl.get(e.key) || { name: e.p.name, qty: 0, stock: st(e.key), val: 0 }; w.qty += e.qty; w.val += e.qty * lineFor(e.p).unitInc; wl.set(e.key, w); });
        d.waitList = [...wl.entries()].map(([key, w]) => ({ key, ...w })).sort((a, b) => b.val - a.val);
        finishDraft(d);
        if (!d.done && d.items.length && !open[co.id]) { open[co.id] = day; d.isNext = true; }
        d.blockedBy = !d.done && d.items.length && open[co.id] !== day ? open[co.id] : "";
        plan[co.id][day] = d;
      }
    }
    PLAN = { days, plan };
    return PLAN;
  }
  window.__aikmAutoBillDebug = () => ({ D, PLAN });
  function finishDraft(d) {
    d.items = [...d.lines.values()].sort((a, b) => a.p.name.localeCompare(b.p.name)).map(L => {
      const ln = lineFor(L.p), cap = L.p.mrp > 0 ? L.p.mrp / (1 + L.p.gst / 100) : Infinity;
      const pct = L.p.cost ? (ln.rate / L.p.cost - 1) * 100 : 0;
      return { L, p: L.p, qty: L.qty, rate: ln.rate, hsn: ln.hsn, pct, capped: ln.capped, overMrp: ln.rate > cap + 0.005, hsnBad: !/^(\d{4}|\d{6}|\d{8})$/.test(ln.hsn) };
    });
    const calc = calcTotals(d.items);
    Object.assign(d, calc, {
      low: d.items.filter(i => i.pct < MIN_PCT - 0.05).length,
      hsnBad: d.items.filter(i => i.hsnBad).length,
      overMrp: d.items.filter(i => i.overMrp).length,
      avgPct: calc.cost ? (calc.taxable / calc.cost - 1) * 100 : 0,
    });
  }
  function buildDrafts(date) { const P = PLAN || buildPlan(); return COMPANIES.map(co => P.plan[co.id][date]); }
  function calcTotals(items) {
    let taxable = 0, gst = 0, cost = 0;
    items.forEach(i => { const tx = money(i.qty * i.rate); taxable += tx; gst += money(tx * i.p.gst / 200) * 2; cost += i.qty * i.p.cost; });
    taxable = money(taxable); gst = money(gst);
    const gross = money(taxable + gst);
    return { taxable, gst, cost: money(cost), total: Math.round(gross), profit: money(taxable - cost) };
  }
  function dateSummary() {
    const P = PLAN || buildPlan();
    return P.days.slice().reverse().map(date => {
      const ds = COMPANIES.map(c => P.plan[c.id][date]);
      return { date, orders: ds.reduce((a, d) => a + d.orders.size, 0), doneN: ds.filter(d => d.done).length, billN: ds.filter(d => d.done || d.items.length).length, next: ds.some(d => d.isNext) };
    });
  }

  /* =====================================================================
     SAVE — creates a normal sale invoice (same format and number series as the tool)
     ===================================================================== */
  async function saveDraft(d) {
    if (!d.items.length) throw new Error("No matched products in this bill.");
    if (d.hsnBad) throw new Error("Enter the HSN for every product first (red boxes).");
    if (d.overMrp) throw new Error("A rate is above MRP. Lower it first.");
    if (d.total > CAP && !d.co.noCap) throw new Error("Bill is above ₹49,999 — lower a rate.");
    if (d.blockedBy) throw new Error(`Approve ${fmtD(d.blockedBy)} first (bills go in date order).`);
    const exist = await sb("GET", `docs?kind=eq.autobill_done&id=eq.${encodeURIComponent(d.id)}&select=data`);
    if (exist.length) throw new Error(`Already billed: ${exist[0].data.invoiceNo}`);
    const st = (await sb("GET", "docs?kind=eq.setting&id=eq.company&select=data"))[0]?.data || {};
    const cust = D.customers.find(c => String(c.gstin || "").toUpperCase() === d.co.gstin) || { name: d.co.label.toUpperCase(), gstin: d.co.gstin };
    const fy = fyOf(d.date), pre = String(st.prefix || "AIKM/{FY}/").replace(/\{FY\}/gi, fyShort(fy)), pad = s => String(s).padStart(4, "0");
    const ctr = /\{FY\}/i.test(String(st.prefix || "")) ? "SALES_SEQ_" + fy : "SALES_SEQ";
    let seq = await sb("POST", "rpc/next_number", { p_name: ctr, p_start: Math.max(1, num(st.startNo) || 1) });
    for (let g = 0; g < 50 && (await sb("GET", `docs?kind=eq.sale&data->>invoiceNo=eq.${encodeURIComponent(pre + pad(seq))}&select=id&limit=1`)).length; g++)
      seq = await sb("POST", "rpc/next_number", { p_name: ctr, p_start: 1 });
    const co = /^\d{2}/.test(st.gstin || "") ? st.gstin.slice(0, 2) : "09";
    const code = d.co.gstin.slice(0, 2), inter = code !== co;
    const items = d.items.map(i => ({ exp: "", hsn: String(i.hsn), key: i.p.key, mrp: money(i.p.mrp), qty: money(i.qty), free: 0, name: i.p.name, pack: "", rate: money(i.rate), batch: "", gstPct: i.p.gst, ...(i.p.barcode ? { barcode: i.p.barcode } : {}), discPct: 0 }));
    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    items.forEach(it => { const tx = money(it.qty * it.rate); taxable += tx; if (inter) igst += money(tx * it.gstPct / 100); else { const h = money(tx * it.gstPct / 200); cgst += h; sgst += h; } });
    taxable = money(taxable); cgst = money(cgst); sgst = money(sgst); igst = money(igst);
    const gross = money(taxable + cgst + sgst + igst), total = Math.round(gross);
    const cd = num(cust.creditDays) || num(st.creditDays);
    const states = { "09": "Uttar Pradesh", "07": "Delhi", "06": "Haryana" };
    const inv = {
      id: "SI-" + uuid(), fy, seq, invoiceNo: pre + pad(seq), status: "Active", createdAt: nowIso(),
      invoiceDate: d.date, dueDate: cd ? addDays(d.date, cd) : "",
      customer: cust.name, customerGstin: d.co.gstin, stateCode: code, placeOfSupply: code + "-" + (cust.state || states[code] || ""),
      customerAddress: [cust.address, cust.pincode].filter(Boolean).join(", "), customerPhone: cust.phone || "", customerEmail: cust.email || "", customerDl: cust.dl || "",
      invoiceType: "B2B", paymentStatus: "Unpaid", paidDate: "",
      notes: `Auto bill · goods shipped ${d.from === d.to ? fmtD(d.from) : fmtD(d.from) + " – " + fmtD(d.to)}`, items, updatedAt: nowIso(),
      taxable, cgst, sgst, igst, roundOff: money(total - gross), total, cancelledAt: "", source: "autobill",
    };
    await sbPut([{ kind: "sale", id: inv.id, fy, data: inv }]);
    await sbPut([{ kind: "autobill_done", id: d.id, data: { invoiceId: inv.id, invoiceNo: inv.invoiceNo, total, at: nowIso() } }]);
    const hsnRows = d.items.filter(i => i.hsn && i.hsn !== i.p.hsn).map(i => ({ kind: "product_hsn", id: i.p.key, data: { key: i.p.key, name: i.p.name, hsn: String(i.hsn) } }));
    if (hsnRows.length) await sbPut(hsnRows);
    D.done[d.id] = { invoiceId: inv.id, invoiceNo: inv.invoiceNo, total };
    D.abSales[inv.id] = inv; PLAN = null;
    return inv;
  }
  async function rememberPick(u, prodKey, mult) {
    const rows = [];
    const data = prodKey === "__skip" ? { ignore: true, name: u.name } : { prodKey, mult: Math.max(1, num(mult) || 1), name: u.name };
    if (u.asin) rows.push({ kind: "autobill_map", id: "asin:" + u.asin, data });
    if (u.sku) rows.push({ kind: "autobill_map", id: "sku:" + normKey(u.sku), data });
    await sbPut(rows);
    rows.forEach(r => { D.userMap[r.id] = r.data; }); PLAN = null;
  }

  /* =====================================================================
     UI
     ===================================================================== */
  const CSS = `
  .ab-root{position:fixed;inset:0;z-index:1000;display:flex}
  .ab-scrim{position:absolute;inset:0;background:rgba(5,15,18,.45)}
  .ab-panel{position:relative;width:100%;height:100%;background:var(--bg);display:flex;flex-direction:column}
  .ab-head{display:flex;align-items:center;gap:12px;padding:14px 22px;background:linear-gradient(135deg,#0F1B33,#14284B);color:#fff;border-bottom:3px solid var(--gold)}
  .ab-head h2{font-size:19px;font-weight:700;color:#fff;margin:0 auto 0 0}
  .ab-head small{display:block;font:500 12px var(--f-body);color:var(--gold);letter-spacing:.04em}
  .ab-head .btn{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);color:#fff}
  .ab-body{flex:1;overflow:auto;padding:18px 22px 28px;display:flex;flex-direction:column;gap:16px}
  .ab-body>*,#abDetail>*{flex-shrink:0}
  #abDetail{display:flex;flex-direction:column;gap:14px}
  .ab-dates{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
  .ab-date{flex:none;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:8px 14px;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:1px;min-width:92px;font:inherit;color:inherit}
  .ab-date b{font:600 14px var(--f-display)}
  .ab-date span{font-size:11px;color:var(--muted)}
  .ab-date[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .ab-date[aria-pressed=true] span{color:var(--gold)}
  .ab-date .ok{color:var(--good);font-weight:600}
  .ab-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  @media(max-width:900px){.ab-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:520px){.ab-cards{grid-template-columns:minmax(0,1fr)}}
  .ab-card{border:1px solid var(--line);background:var(--surface);border-radius:14px;padding:14px 16px;cursor:pointer;display:flex;flex-direction:column;gap:6px;box-shadow:var(--shadow);position:relative;overflow:hidden;text-align:left;font:inherit;color:inherit}
  .ab-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--gold)}
  .ab-card[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}
  .ab-card.done::before{background:var(--good)}
  .ab-card h3{font:600 15px var(--f-display);margin:0}
  .ab-card .big{font:600 22px var(--f-display);letter-spacing:-.02em}
  .ab-card .meta{font-size:12px;color:var(--muted)}
  .ab-card .tags{display:flex;gap:4px;flex-wrap:wrap}
  .ab-sec{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .ab-sec h4{font:700 11px var(--f-display);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin:0 auto 0 0}
  .ab-t td,.ab-t th{padding:8px 10px}
  .ab-t input{width:88px;padding:5px 7px;border-radius:7px;font-family:var(--f-mono);font-size:13px;text-align:right}
  .ab-t input.h{width:96px;text-align:left}
  .ab-t input.bad{border-color:var(--bad);background:var(--bad-soft)}
  .ab-t .pn{font-weight:600}
  .ab-t .sub{font-size:11.5px}
  .ab-t tr.warn td{background:var(--warn-soft)!important}
  .ab-t tr.bad td{background:var(--bad-soft)!important}
  .ab-um input[list]{width:100%;min-width:220px;text-align:left;font-family:var(--f-body)}
  .ab-um input.abMult{text-align:center}
  .ab-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--line);background:var(--surface)}
  .ab-foot .msg{margin-right:auto;font-size:13px}
  .ab-sum{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
  .ab-sum b{color:var(--ink);font-family:var(--f-mono);font-weight:600}
  .ab-load{padding:60px 16px;text-align:center;color:var(--muted)}
  #abBtn .c{font-family:var(--f-mono);font-size:11px;background:var(--gold);color:#0F1B33;border-radius:10px;padding:1px 7px;margin-left:6px}
  @media(max-width:700px){.ab-head{padding:12px 14px}.ab-body{padding:14px}.ab-foot{padding:10px 14px}.ab-foot .btn{flex:1}.ab-t .hm{display:none}}
  `;
  let S = { date: "", co: "praso", drafts: [], busy: false };

  function mount() {
    if (!document.getElementById("abCss")) { const st = document.createElement("style"); st.id = "abCss"; st.textContent = CSS; document.head.append(st); }
    const nb = document.getElementById("slNew");
    if (!nb || document.getElementById("abBtn")) return !!nb;
    const b = document.createElement("button");
    b.className = "btn"; b.id = "abBtn"; b.type = "button"; b.title = "Make sale bills from shipped orders (Alt+B)";
    b.innerHTML = "⚡ Auto sale bills";
    b.onclick = open;
    nb.parentElement.insertBefore(b, nb);
    return true;
  }
  const iv = setInterval(() => { if (mount()) clearInterval(iv); }, 600);
  document.addEventListener("keydown", e => { if (e.altKey && (e.key === "b" || e.key === "B")) { e.preventDefault(); open(); } }, true);

  function root() {
    let r = document.getElementById("abRoot");
    if (!r) { r = document.createElement("div"); r.id = "abRoot"; document.body.append(r); }
    return r;
  }
  function close() { const r = document.getElementById("abRoot"); if (r) r.innerHTML = ""; document.removeEventListener("keydown", escKey, true); }
  function escKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }

  async function open() {
    document.addEventListener("keydown", escKey, true);
    root().innerHTML = `<div class="ab-root"><div class="ab-scrim" id="abScrim"></div><div class="ab-panel" role="dialog" aria-modal="true" aria-label="Auto sale bills">
      <div class="ab-head"><h2>Auto sale bills<small>From orders shipped · cost + ${MIN_PCT}–${MAX_PCT}% · never above MRP · max ₹49,999 a bill (Sasta: full bill + e-way) · no Sundays</small></h2><button class="btn small" id="abEwb" title="Download one e-way bill upload file for bills over ₹50,000">E-way bill file</button><button class="btn small" id="abReload" title="Load latest orders">Refresh</button><button class="btn small" id="abClose">Close</button></div>
      <div class="ab-body" id="abBody"><div class="ab-load" id="abLoad">Loading…</div></div>
      <div class="ab-foot" id="abFoot" hidden></div></div></div>`;
    $("#abScrim").onclick = close; $("#abClose").onclick = close;
    $("#abReload").onclick = () => { D = null; open(); };
    $("#abEwb").onclick = () => { if (D) ewbScreen(); else toast("Still loading — try again in a moment."); };
    try {
      if (!D || Date.now() - D.loadedAt > 10 * 60 * 1000) await loadAll(t => { const l = $("#abLoad"); if (l) l.textContent = t; });
    } catch (e) { $("#abBody").innerHTML = `<div class="ab-load">Could not load: ${esc(e.message)}<br><br><button class="btn" id="abRetry">Try again</button></div>`; $("#abRetry").onclick = () => { D = null; open(); }; return; }
    const ds = dateSummary();
    if (!ds.length) { $("#abBody").innerHTML = `<div class="ab-load">No shipped orders found.</div>`; return; }
    if (!S.date || !ds.some(x => x.date === S.date)) {
      const nx = ds.filter(x => x.next).pop();
      S.date = (nx || ds[1] || ds[0]).date;
    }
    draw();
  }

  function draw() {
    const ds = dateSummary();
    S.drafts = buildDrafts(S.date);
    let d = S.drafts.find(x => x.co.id === S.co);
    if (!d || (!d.items.length && !d.unmatched.size && !d.done)) d = S.drafts.find(x => x.items.length || x.unmatched.size || x.done) || S.drafts[0];
    S.co = d.co.id;
    const pill = (cls, t) => `<span class="pill ${cls}">${t}</span>`;
    const card = x => {
      const empty = !x.items.length && !x.unmatched.size;
      return `<button type="button" class="ab-card${x.done ? " done" : ""}" data-co="${x.co.id}" aria-pressed="${x.co.id === S.co}">
        <h3>${esc(x.co.label)}</h3>
        <div class="big">${empty ? "—" : inr(x.total)}</div>
        <div class="meta">${x.items.length ? `${x.items.length} products · goods of ${x.from === x.to ? fmtD(x.from) : fmtD(x.from) + "–" + fmtD(x.to)} · avg ${x.avgPct.toFixed(1)}%` : `${x.orders.size} orders shipped`}</div>
        <div class="tags">${x.done ? pill("good", "Saved " + esc(x.done.invoiceNo)) : empty ? pill("", "Nothing to bill") : x.blockedBy ? pill("", "After " + fmtD(x.blockedBy)) : pill("warn", "Ready")}${x.noStock > 1 ? pill("bad", x.noStockN + " waiting for stock") : ""}${x.carry - x.noStock > 1 ? pill("acc", inr(x.carry - x.noStock) + " carried forward") : ""}${x.total > 50000 ? pill("bad", "E-way bill needed") : ""}${x.unmatched.size ? pill("bad", x.unmatched.size + " not matched") : ""}${x.hsnBad && !x.done ? pill("bad", x.hsnBad + " HSN missing") : ""}${x.low && !x.done ? pill("warn", x.low + " under 15%") : ""}</div></button>`;
    };
    $("#abBody").innerHTML = `${archFail ? `<div class="banner">Older dates (before the last 15 days) could not load. Press Refresh to try again.</div>` : ""}
      <div class="ab-dates">${ds.map(x => `<button type="button" class="ab-date" data-d="${x.date}" aria-pressed="${x.date === S.date}"><b>${dayName(x.date)} ${fmtD(x.date)}</b><span>${x.billN && x.doneN === x.billN ? '<i class="ok">✓ billed</i>' : x.billN ? x.doneN + "/" + x.billN + " billed" : "no bill"}${x.next ? " · next" : ""}</span></button>`).join("")}</div>
      <div class="ab-cards">${S.drafts.map(card).join("")}</div>
      <div id="abDetail"></div>`;
    $("#abBody").querySelectorAll(".ab-date").forEach(b => b.onclick = () => { S.date = b.dataset.d; draw(); });
    $("#abBody").querySelectorAll(".ab-card").forEach(b => b.onclick = () => { S.co = b.dataset.co; draw(); });
    detail(d);
  }

  function detail(d) {
    const box = $("#abDetail"), foot = $("#abFoot");
    foot.hidden = false;
    const readyAll = S.drafts.filter(x => !x.done && x.items.length && !x.blockedBy && !x.hsnBad && !x.overMrp && (x.total <= CAP || x.co.noCap));
    if (d.done) {
      box.innerHTML = `<div class="banner info">Bill <b>${esc(d.done.invoiceNo)}</b> (${inr(d.done.total)}) is already saved for ${esc(d.co.label)} on ${fmtD(d.date)}. Open it from the Sales list to view or print.</div>`;
      foot.innerHTML = `<span class="msg"></span>${readyAll.length ? `<button class="btn primary" id="abAll">Approve all ${readyAll.length} ready bills</button>` : ""}`;
      wireAll(readyAll); return;
    }
    if (!d.items.length && !d.unmatched.size) { box.innerHTML = `<div class="ab-load">Nothing to bill for ${esc(d.co.label)} on ${fmtD(d.date)}.</div>`; foot.innerHTML = `<span class="msg"></span>${readyAll.length ? `<button class="btn primary" id="abAll">Approve all ${readyAll.length} ready bills</button>` : ""}`; wireAll(readyAll); return; }
    const prodOpts = [...D.prods.values()].sort((a, b) => a.name.localeCompare(b.name));
    box.innerHTML = `
      ${d.unmatched.size ? `<div class="ab-sec"><h4>Not matched — pick the purchased product once (remembered)</h4></div>
      <datalist id="abProds">${prodOpts.map(p => `<option value="${esc(p.name)}">${esc(p.sup)} · ${inr(p.cost, 2)}</option>`).join("")}</datalist>
      <div class="tablebox ab-um"><table class="ab-t"><thead><tr><th>Sold as</th><th class="r">Qty</th><th>Purchased product</th><th>Units per sale</th><th></th></tr></thead><tbody>
      ${[...d.unmatched.values()].map((u, i) => `<tr data-i="${i}"><td><span class="pn">${esc(u.name)}</span><div class="sub">${esc([u.asin, u.sku].filter(Boolean).join(" · "))}</div></td><td class="r num">${u.qty}</td><td><input list="abProds" class="abPick" placeholder="Type product name"></td><td><input class="abMult" type="number" min="1" step="1" value="1" style="width:64px"></td><td style="white-space:nowrap"><button class="btn small primary abSave">Save</button> <button class="btn small abSkip" title="Not billed (gift, freebie, own stock)">Skip</button></td></tr>`).join("")}
      </tbody></table></div>` : ""}
      ${d.blockedBy ? `<div class="banner">Preview only — approve ${esc(d.co.label)}'s bill of ${dayName(d.blockedBy)} ${fmtD(d.blockedBy)} first. Bills go in date order so the ₹49,999 split stays correct.</div>` : ""}
      ${d.total > 50000 ? `<div class="banner bad">Over ₹50,000 — make an e-way bill for this invoice on ewaybillgst.gov.in before the goods move.</div>` : ""}
      ${d.noStock > 1 ? `<div class="banner">${d.noStockN} product${d.noStockN > 1 ? "s" : ""} (${inr(d.noStock)}) not billed — not enough stock in purchase bills on this date. They go on the first bill after the purchase is saved, so stock never goes negative.
        <div class="sub" style="margin-top:6px">${(d.waitList || []).slice(0, 8).map(w => `${esc(w.name)} — ${+w.qty.toFixed(2)} short (${inr(w.val)})`).join(" · ")}${(d.waitList || []).length > 8 ? ` · +${d.waitList.length - 8} more` : ""}</div></div>` : ""}
      ${d.carry - d.noStock > 1 ? `<div class="banner info">${inr(d.carry - d.noStock)} of goods did not fit under ₹49,999 and moves to the next working day.</div>` : ""}
      <div class="ab-sec"><h4>Bill to ${esc(d.co.label)} · ${dayName(d.date)} ${fmtD(d.date)} · goods shipped ${d.from === d.to ? fmtD(d.from) : fmtD(d.from) + " – " + fmtD(d.to)}</h4>
        <div class="ab-sum"><span>Cost <b>${inr(d.cost)}</b></span><span>Taxable <b>${inr(d.taxable)}</b></span><span>GST <b>${inr(d.gst)}</b></span><span>Profit <b>${inr(d.profit)}</b> (${d.avgPct.toFixed(1)}%)</span></div></div>
      <div class="tablebox"><table class="ab-t"><thead><tr><th>Product</th><th class="hm">HSN</th><th class="r">Qty</th><th class="r hm">Cost/unit</th><th class="r">Rate (ex-GST)</th><th class="r">Profit %</th><th class="r hm">MRP</th><th class="r hm">GST</th><th class="r">Amount</th></tr></thead><tbody>
      ${d.items.map((i, n) => `<tr data-n="${n}" class="${i.overMrp || i.hsnBad ? "bad" : i.pct < MIN_PCT - 0.05 ? "warn" : ""}">
        <td><span class="pn">${esc(i.p.name)}</span><div class="sub">${esc(i.p.noBill ? "No purchase bill yet — LOTS list price" : i.p.sup + (i.p.date ? " · " + fmtD(i.p.date) : ""))} · ${esc(i.L.via)}</div><div class="sub" title="${esc([...i.L.src].map(([k, v]) => v.q + " × " + k + (v.u !== 1 ? " (" + (+v.u.toFixed(3)) + " each)" : "")).join("\n"))}">Sold: ${esc([...i.L.src].slice(0, 2).map(([k, v]) => v.q + " × " + k + (v.u !== 1 ? " (×" + (+v.u.toFixed(3)) + ")" : "")).join(" · "))}${i.L.src.size > 2 ? " · +" + (i.L.src.size - 2) + " more" : ""}</div></td>
        <td class="hm"><input class="h${i.hsnBad ? " bad" : ""}" data-k="hsn" value="${esc(i.hsn)}" inputmode="numeric" placeholder="HSN"></td>
        <td class="r num">${+i.qty.toFixed(3)}</td>
        <td class="r num hm">${inr(i.p.cost, 2)}</td>
        <td class="r"><input data-k="rate" class="${i.overMrp ? "bad" : ""}" value="${i.rate.toFixed(2)}" inputmode="decimal"></td>
        <td class="r num">${i.pct.toFixed(1)}%${i.capped ? `<div class="sub">MRP limit</div>` : ""}</td>
        <td class="r num hm">${i.p.mrp ? inr(i.p.mrp, 2) : "—"}</td>
        <td class="r num hm">${i.p.gst}%</td>
        <td class="r num">${inr(i.qty * i.rate * (1 + i.p.gst / 100), 2)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="note" style="margin:0">Rate = purchase cost + ${MAX_PCT}%. Where that crosses MRP it is lowered to MRP (yellow = below ${MIN_PCT}%, red = fix before saving). A rate or HSN you change applies to that product on every bill. Quantities are set by the ₹49,999 split.</p>`;
    // edits
    box.querySelectorAll("tr[data-n] input").forEach(inp => inp.onchange = () => {
      const i = d.items[+inp.closest("tr").dataset.n], k = inp.dataset.k;
      const e = (EDIT[i.L.key] ||= {});
      e[k] = k === "hsn" ? inp.value.trim() : num(inp.value);
      PLAN = null; draw();
    });
    // unmatched picks
    const um = [...d.unmatched.values()];
    box.querySelectorAll(".abSave").forEach(b => b.onclick = async () => {
      const tr = b.closest("tr"), u = um[+tr.dataset.i], nm = tr.querySelector(".abPick").value.trim();
      const p = prodOpts.find(x => x.name === nm); if (!p) return toast("Pick a product from the list.");
      b.disabled = true;
      try { await rememberPick(u, p.key, tr.querySelector(".abMult").value); toast("Matched — remembered for next time"); draw(); } catch (e) { b.disabled = false; toast("Not saved: " + e.message, 5000); }
    });
    box.querySelectorAll(".abSkip").forEach(b => b.onclick = async () => {
      const u = um[+b.closest("tr").dataset.i]; b.disabled = true;
      try { await rememberPick(u, "__skip"); toast("Skipped — will not be billed"); draw(); } catch (e) { b.disabled = false; toast("Not saved: " + e.message, 5000); }
    });
    const block = d.blockedBy ? `Approve ${fmtD(d.blockedBy)} first` : d.hsnBad ? `Enter ${d.hsnBad} missing HSN` : d.overMrp ? "A rate is above MRP" : d.total > CAP && !d.co.noCap ? "Above ₹49,999" : "";
    foot.innerHTML = `<span class="msg">${d.unmatched.size ? `<span class="up">${d.unmatched.size} product${d.unmatched.size > 1 ? "s" : ""} not matched will be left out.</span>` : block ? `<span class="up">${block}</span>` : `${d.items.length} products · total <b>${inr(d.total)}</b>`}</span>
      ${readyAll.length > 1 ? `<button class="btn" id="abAll">Approve all ${readyAll.length} ready</button>` : ""}
      <button class="btn primary" id="abOne" ${block || !d.items.length ? "disabled" : ""}>Approve &amp; save bill</button>`;
    $("#abOne").onclick = async () => {
      if (d.unmatched.size && !(await askYes(`${d.unmatched.size} not-matched products will NOT be on this bill. Save anyway?`, "Save anyway"))) return;
      await runSave([d]);
    };
    wireAll(readyAll);
  }
  function wireAll(list) {
    const b = $("#abAll"); if (!b) return;
    b.onclick = async () => {
      const um = list.filter(x => x.unmatched.size).length;
      if (!(await askYes(`Save ${list.length} bill${list.length > 1 ? "s" : ""} for ${fmtD(S.date)}?${um ? `\n${um} of them have not-matched products that will be left out.` : ""}`, "Save bills"))) return;
      await runSave(list);
    };
  }
  /* =====================================================================
     E-WAY BILL FILE — one JSON for the e-way bill portal's Bulk Generation (ewaybillgst.gov.in → e-Waybill → Generate Bulk)
     ===================================================================== */
  const EWB_KEY = "aikmEwbDefaults";
  function ewbDefaults() { try { return JSON.parse(localStorage.getItem(EWB_KEY) || "{}"); } catch (e) { return {}; } }
  function ewbScreen() {
    const df = ewbDefaults(), from = todayIso().slice(0, 8) + "01", to = todayIso();
    $("#abFoot").hidden = true;
    $("#abBody").innerHTML = `
      <div class="ab-sec"><h4>E-way bill file — saved bills over ₹50,000</h4><button class="btn small" id="ewbBack">← Back to bills</button></div>
      <div class="icard"><div class="grid4">
        <label class="f">From<input type="date" id="ewbFrom" value="${from}"></label>
        <label class="f">To<input type="date" id="ewbTo" value="${to}"></label>
        <label class="f">Vehicle no.<input id="ewbVeh" value="${esc(df.veh || "")}" placeholder="UP16AB1234" style="text-transform:uppercase"></label>
        <label class="f">Distance (km)<input id="ewbKm" inputmode="numeric" value="${esc(df.km || "10")}"></label>
        <label class="f">Dispatch pincode<input id="ewbPin" inputmode="numeric" value="${esc(df.pin || "201301")}"></label>
      </div></div>
      <div id="ewbList"></div>`;
    $("#ewbBack").onclick = () => draw();
    ["#ewbFrom", "#ewbTo"].forEach(s => $(s).onchange = list);
    function list() {
      const f = $("#ewbFrom").value, t = $("#ewbTo").value;
      const inv = Object.values(D.abSales).filter(v => v.status !== "Cancelled" && num(v.total) > 50000 && v.invoiceDate >= f && v.invoiceDate <= t).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || String(a.invoiceNo).localeCompare(String(b.invoiceNo)));
      $("#ewbList").innerHTML = inv.length ? `<div class="tablebox"><table class="ab-t"><thead><tr><th class="ck"><input type="checkbox" id="ewbAll" checked></th><th>Date</th><th>Bill no.</th><th>Customer</th><th class="r">Total</th><th class="r">Items</th></tr></thead><tbody>
        ${inv.map((v, i) => `<tr><td class="ck"><input type="checkbox" class="ewbCk" data-i="${i}" checked></td><td class="num">${fmtD(v.invoiceDate)}</td><td class="mono">${esc(v.invoiceNo)}</td><td>${esc(v.customer)}</td><td class="r num">${inr(v.total)}</td><td class="r num">${(v.items || []).length}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="ewbGo">Download e-way bill file</button><span class="note">Then: ewaybillgst.gov.in → e-Waybill → Generate Bulk → choose this file → Upload → Generate.</span></div>`
        : `<div class="ab-load">No saved bills over ₹50,000 between ${fmtD(f)} and ${fmtD(t)}.</div>`;
      const all = $("#ewbAll"); if (all) all.onchange = () => document.querySelectorAll(".ewbCk").forEach(c => c.checked = all.checked);
      const go = $("#ewbGo"); if (go) go.onclick = () => {
        const veh = $("#ewbVeh").value.toUpperCase().replace(/[^A-Z0-9]/g, ""), km = Math.max(1, Math.round(num($("#ewbKm").value))), pin = String($("#ewbPin").value).trim();
        if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(veh)) return toast("Enter a valid vehicle number, like UP16AB1234.");
        if (!/^\d{6}$/.test(pin)) return toast("Dispatch pincode must be 6 digits.");
        try { localStorage.setItem(EWB_KEY, JSON.stringify({ veh, km, pin })); } catch (e) {}
        const pick = [...document.querySelectorAll(".ewbCk")].filter(c => c.checked).map(c => inv[+c.dataset.i]);
        if (!pick.length) return toast("Tick at least one bill.");
        const json = ewbJson(pick, { veh, km, pin });
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 1)], { type: "application/json" }));
        a.download = `AIKM-eway-bills-${pick[0].invoiceDate}-to-${pick[pick.length - 1].invoiceDate}.json`; a.click();
        toast(`E-way bill file downloaded for ${pick.length} bill${pick.length > 1 ? "s" : ""}.`, 5000);
      };
    }
    list();
  }
  function ewbJson(invs, o) {
    const st = D.settings || {}, g = String(st.gstin || "09AARCA8877D2ZZ").toUpperCase(), sc = +g.slice(0, 2);
    const cut = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
    const addr = String(st.address || "");
    const dmy = s => s.split("-").reverse().join("/");
    return {
      version: "1.0.0621",
      billLists: invs.map(v => {
        const cg = String(v.customerGstin || "").toUpperCase(), tc = +(cg.slice(0, 2) || v.stateCode || sc);
        const cust = D.customers.find(c => String(c.gstin || "").toUpperCase() === cg) || {};
        const toPin = String(cust.pincode || (String(v.customerAddress || "").match(/\b(\d{6})\b(?!.*\b\d{6}\b)/) || [])[1] || "");
        const inter = tc !== sc;
        // one line per HSN + GST rate keeps the e-way bill short (portal limit 250 lines)
        const grp = new Map();
        (v.items || []).forEach(it => {
          const k = String(it.hsn) + "|" + num(it.gstPct), x = grp.get(k) || { hsn: String(it.hsn), g: num(it.gstPct), q: 0, tx: 0, names: [] };
          x.q += num(it.qty); x.tx += money(num(it.qty) * num(it.rate)); if (x.names.length < 3) x.names.push(it.name); grp.set(k, x);
        });
        const items = [...grp.values()].map((x, i) => ({
          itemNo: i + 1, productName: cut(x.names[0], 100), productDesc: cut(x.names.join(", ") + (x.names.length >= 3 ? " etc." : ""), 100),
          hsnCode: +x.hsn, quantity: money(x.q), qtyUnit: "NOS", taxableAmount: money(x.tx),
          sgstRate: inter ? 0 : x.g / 2, cgstRate: inter ? 0 : x.g / 2, igstRate: inter ? x.g : 0, cessRate: 0, cessNonAdvol: 0,
        }));
        const main = [...grp.values()].sort((a, b) => b.tx - a.tx)[0];
        return {
          userGstin: g, supplyType: "O", subSupplyType: 1, subSupplyDesc: "", docType: "INV", docNo: String(v.invoiceNo), docDate: dmy(v.invoiceDate),
          fromGstin: g, fromTrdName: cut(st.company, 100), fromAddr1: cut(addr, 120), fromAddr2: "", fromPlace: "Noida", fromPincode: +o.pin, fromStateCode: sc, actualFromStateCode: sc,
          toGstin: cg || "URP", toTrdName: cut(v.customer, 100), toAddr1: cut(cust.address || v.customerAddress, 120), toAddr2: "", toPlace: cut(cust.city || "Noida", 50), toPincode: +toPin || +o.pin, toStateCode: tc, actualToStateCode: tc,
          transactionType: 1, totalValue: money(v.taxable), cgstValue: money(v.cgst), sgstValue: money(v.sgst), igstValue: money(v.igst), cessValue: 0, TotNonAdvolVal: 0,
          OthValue: money(v.roundOff), totInvValue: money(v.total),
          transMode: 1, transDistance: String(o.km), transporterName: "", transporterId: "", transDocNo: "", transDocDate: "", vehicleNo: o.veh, vehicleType: "R",
          mainHsnCode: main ? +main.hsn : 0, itemList: items,
        };
      }),
    };
  }

  /* =====================================================================
     DUPLICATES TAB — finds the same product saved under 2+ names/barcodes (e.g. a new barcode on a LOTS bill)
     so they can be merged after checking. Uses the tool's own merge list (setting "product_merge"),
     so the main tool, stock and auto bills all follow the merge.
     ===================================================================== */
  const SIZE_RE = /(\d+(?:\.\d+)?)\s*(kgs?|gms?|grams?|gr|g|ml|ltrs?|litres?|liters?|l|pcs?|pc|n|u|s|tabs?|caps?|cap)\b/gi;
  const UNITN = { kg: "kg", kgs: "kg", g: "g", gm: "g", gms: "g", gram: "g", grams: "g", gr: "g", ml: "ml", l: "l", ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l", pc: "pc", pcs: "pc", n: "pc", u: "pc", s: "pc", tab: "tab", tabs: "tab", cap: "cap", caps: "cap" };
  function sizeSig(name) {
    const out = []; let m; SIZE_RE.lastIndex = 0;
    while ((m = SIZE_RE.exec(String(name || "")))) { let v = +m[1], u = UNITN[m[2].toLowerCase()] || m[2].toLowerCase(); if (u === "kg") { v *= 1000; u = "g"; } if (u === "l") { v *= 1000; u = "ml"; } out.push(v + u); }
    return out.sort().join(",");
  }
  const STOP = new Set(["the", "and", "of", "with", "pack", "new", "mrp", "rs", "pk", "pouch", "jar", "bottle", "box", "free", "offer"]);
  const toks = name => new Set(String(name || "").toLowerCase().replace(SIZE_RE, " ").replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)));
  let DUP = null;
  /* Merge whole groups into their first item (latest purchase). Reads the saved list fresh so nothing is lost. */
  async function mergeGroups(list) {
    const cur = ((await sb("GET", "docs?kind=eq.setting&id=eq.product_merge&select=data"))[0] || {}).data || {};
    const m = { map: cur.map || {}, names: cur.names || {}, labels: cur.labels || {}, info: cur.info || {} };
    list.forEach(grp => { const keep = grp.items[0];
      grp.items.slice(1).forEach(x => { if (x.key !== keep.key) { m.map[x.key] = keep.key; m.labels[x.key] = x.name; if (m.info[x.key] && !m.info[keep.key]) m.info[keep.key] = m.info[x.key]; } });
      if (m.map[keep.key]) delete m.map[keep.key];
      if (!m.names[keep.key]) m.names[keep.key] = keep.name; });
    await sbPut([{ kind: "setting", id: "product_merge", data: { ...m, savedAt: nowIso() } }]);
  }
  /* Same name + same size = one product, whatever the barcode. Runs by itself each time the tool opens,
     so a new barcode on a new bill is folded into the existing product automatically. */
  async function autoMergeSame() {
    await loadDups();
    const sure = DUP.groups.filter(g => g.sure);
    if (!sure.length) return 0;
    await mergeGroups(sure);
    DUP.groups = DUP.groups.filter(g => !g.sure); D = null;
    return sure.length;
  }
  async function loadDups() {
    const rows = await sbAll(`kind=in.(bill,setting,dup_ignore)&select=kind,id,data`);
    const merge = (rows.find(r => r.kind === "setting" && r.id === "product_merge") || {}).data || { map: {}, names: {}, labels: {}, info: {} };
    const ignore = new Set(rows.filter(r => r.kind === "dup_ignore").map(r => r.id));
    const to = k => { let i = 0; while (merge.map && merge.map[k] && merge.map[k] !== k && i++ < 20) k = merge.map[k]; return k; };
    const P = new Map();          // final key -> product
    for (const r of rows) {
      if (r.kind !== "bill") continue;
      const b = r.data; if (!b || !b.items || b.docType === "credit") continue;
      b.items.forEach(it => {
        if (!it.name) return;
        const key = to(pkey(it)), u = num(it.qty) + num(it.free);
        const x = P.get(key) || { key, name: "", barcode: key.startsWith("bc:") ? key.slice(3) : "", last: "", sup: "", qty: 0, bills: 0, rate: 0, mrp: 0 };
        x.qty += u; x.bills++;
        if ((b.billDate || "") >= x.last) Object.assign(x, { last: b.billDate || "", sup: b.supplier || "", name: withSize(it.name, it.pack), rate: num(it.rate), mrp: num(it.mrp) || x.mrp });
        P.set(key, x);
      });
    }
    for (const x of P.values()) { const nm = (merge.names || {})[x.key]; if (nm) x.name = nm; x.sz = sizeSig(x.name); x.tk = toks(x.name); }
    // group: same name & size = sure; very similar name & same size = possible
    const list = [...P.values()], parent = new Map(list.map(x => [x.key, x.key])), why = new Map();
    const find = k => { while (parent.get(k) !== k) k = parent.get(k); return k; };
    const join = (a, b, w) => { const ra = find(a.key), rb = find(b.key); if (ra !== rb) parent.set(rb, ra); why.set(a.key, w); why.set(b.key, w); };
    const byName = new Map(); list.forEach(x => { const k = normName(x.name).replace(/\s+/g, ""); (byName.get(k) || byName.set(k, []).get(k)).push(x); });
    byName.forEach(g => { for (let i = 1; i < g.length; i++) join(g[0], g[i], "same name"); });
    const byTok = new Map(); list.forEach(x => x.tk.forEach(t => (byTok.get(t) || byTok.set(t, []).get(t)).push(x)));
    const seen = new Set();
    list.forEach(a => {
      const cand = new Set(); a.tk.forEach(t => { const l = byTok.get(t); if (l && l.length < 60) l.forEach(b => cand.add(b)); });
      cand.forEach(b => {
        if (b.key <= a.key || a.sz !== b.sz || !a.sz) return;
        const pk = a.key + "|" + b.key; if (seen.has(pk)) return; seen.add(pk);
        let hit = 0; a.tk.forEach(t => { if (b.tk.has(t)) hit++; });
        const sim = hit / Math.max(a.tk.size, b.tk.size);
        if (sim >= 0.8) join(a, b, why.get(a.key) === "same name" ? "same name" : "similar name");
      });
    });
    const groups = new Map(); list.forEach(x => { const r = find(x.key); (groups.get(r) || groups.set(r, []).get(r)).push(x); });
    const out = [...groups.values()].filter(g => g.length > 1).map(g => {
      g.sort((a, b) => b.last.localeCompare(a.last) || b.qty - a.qty);
      const sig = g.map(x => x.key).sort().join("|");
      return { items: g, sig, sure: g.every(x => normName(x.name).replace(/\s+/g, "") === normName(g[0].name).replace(/\s+/g, "")), id: "dup:" + sig.slice(0, 180) };
    }).filter(g => !ignore.has(g.id)).sort((a, b) => (b.sure - a.sure) || a.items[0].name.localeCompare(b.items[0].name));
    DUP = { merge, groups: out };
    return DUP;
  }
  function dupMount() {
    const nav = document.querySelector("nav.tabs"), wrap = document.querySelector(".wrap");
    if (!nav || !wrap || document.getElementById("tabDups")) return !!document.getElementById("tabDups");
    const t = document.createElement("button");
    t.className = "tab"; t.id = "tabDups"; t.type = "button"; t.setAttribute("role", "tab"); t.dataset.tab = "dups"; t.setAttribute("aria-selected", "false");
    t.innerHTML = `Duplicates<span class="c" id="cDups">…</span>`;
    nav.append(t);
    const sec = document.createElement("section"); sec.className = "panel"; sec.id = "p-dups"; sec.hidden = true; wrap.append(sec);
    t.onclick = () => {
      document.querySelectorAll(".wrap > section.panel").forEach(p => p.hidden = p !== sec);
      document.querySelectorAll("nav.tabs .tab").forEach(b => b.setAttribute("aria-selected", String(b === t)));
      dupRender(true);
    };
    nav.querySelectorAll(".tab").forEach(b => { if (b !== t) b.addEventListener("click", () => { sec.hidden = true; t.setAttribute("aria-selected", "false"); }); });
    setTimeout(() => autoMergeSame().then(n => { const c = $("#cDups"); if (c) c.textContent = DUP.groups.length; if (n) { toast(`${n} same-name product${n > 1 ? "s" : ""} joined into one (different barcodes ignored). The tool refreshes within 30 seconds.`, 6000); if (!$("#p-dups").hidden) dupRender(false); } }).catch(e => console.warn("auto merge", e)), 2500);
    return true;
  }
  const iv2 = setInterval(() => { if (dupMount()) clearInterval(iv2); }, 700);
  async function dupRender(reload) {
    const sec = $("#p-dups");
    if (reload || !DUP) { sec.innerHTML = `<div class="ab-load">Looking for duplicate products…</div>`; try { await loadDups(); } catch (e) { sec.innerHTML = `<div class="ab-load">Could not load: ${esc(e.message)}</div>`; return; } }
    const c = $("#cDups"); if (c) c.textContent = DUP.groups.length;
    const g = DUP.groups;
    sec.innerHTML = `
      <div class="banner info">Same product saved twice (new barcode, different spelling). <b>Same name + same size is now joined automatically</b> (barcode ignored). Below are only <b>similar</b> names — pick the one to <b>keep</b>, then <b>Merge</b>. Different sizes are never grouped. Stock, prices and auto bills follow the merge. Nothing changes until you press Merge.</div>
      ${g.some(x => x.sure) ? `<div class="row between"><span class="note">${g.filter(x => x.sure).length} groups have exactly the same name · ${g.filter(x => !x.sure).length} are similar (check those one by one)</span><button class="btn small" id="dAllSure">Merge all "Same name" into latest</button></div>` : ""}
      ${g.length ? g.map((grp, gi) => `<div class="tablebox" data-g="${gi}"><table class="ab-t"><thead><tr><th style="width:60px">Keep</th><th>${grp.sure ? '<span class="pill bad">Same name</span>' : '<span class="pill warn">Similar name — check</span>'}</th><th>Barcode</th><th>Last bought</th><th class="r">Bought</th><th class="r">Rate</th><th class="r">MRP</th></tr></thead><tbody>
        ${grp.items.map((x, i) => `<tr><td><input type="radio" name="keep${gi}" value="${i}" ${i === 0 ? "checked" : ""} style="width:18px;height:18px"></td><td><span class="pn">${esc(x.name)}</span><div class="sub">${esc(x.sup)}</div></td><td class="mono sub">${esc(x.barcode || "—")}</td><td class="num">${x.last ? fmtD(x.last) + " " + x.last.slice(2, 4) : "—"}</td><td class="r num">${+x.qty.toFixed(2)} <span class="sub">(${x.bills} bills)</span></td><td class="r num">${x.rate ? inr(x.rate, 2) : "—"}</td><td class="r num">${x.mrp ? inr(x.mrp, 2) : "—"}</td></tr>`).join("")}
        </tbody></table><div class="row" style="padding:10px 12px;justify-content:flex-end"><span class="msg note" style="margin-right:auto"></span><button class="btn small dIgn">Not duplicate</button><button class="btn small primary dMerge">Merge into kept</button></div></div>`).join("")
      : `<div class="ab-load">No duplicate products found. 👍</div>`}`;
    const all = $("#dAllSure"); if (all) all.onclick = async () => {
      const sure = g.filter(x => x.sure);
      if (!(await askYes(`Merge ${sure.length} "Same name" groups, each into its latest purchase?`, `Merge ${sure.length} groups`))) return;
      all.disabled = true; all.textContent = "Merging…";
      try { await mergeGroups(sure); DUP.groups = g.filter(x => !x.sure); D = null; toast(`Merged ${sure.length} groups. The tool refreshes within 30 seconds.`, 5000); dupRender(false); }
      catch (e) { all.disabled = false; all.textContent = "Merge all \"Same name\" into latest"; toast("Not merged: " + e.message, 6000); }
    };
    sec.querySelectorAll("[data-g]").forEach(box => {
      const grp = g[+box.dataset.g], msg = box.querySelector(".msg");
      box.querySelector(".dIgn").onclick = async () => {
        try { await sbPut([{ kind: "dup_ignore", id: grp.id, data: { keys: grp.items.map(x => x.key), at: nowIso() } }]); DUP.groups.splice(DUP.groups.indexOf(grp), 1); toast("Marked as different products"); dupRender(false); }
        catch (e) { msg.textContent = "Not saved: " + e.message; }
      };
      box.querySelector(".dMerge").onclick = async () => {
        const keep = grp.items[+box.querySelector("input[type=radio]:checked").value], rest = grp.items.filter(x => x !== keep);
        if (!(await askYes(`Merge ${rest.length} product${rest.length > 1 ? "s" : ""} into:\n${keep.name} (${keep.barcode || "no barcode"})?\n\n${rest.map(x => "• " + x.name + " (" + (x.barcode || "no barcode") + ")").join("\n")}`, "Merge"))) return;
        box.querySelectorAll("button").forEach(b => b.disabled = true); msg.textContent = "Merging…";
        try {
          const cur = ((await sb("GET", "docs?kind=eq.setting&id=eq.product_merge&select=data"))[0] || {}).data || {};
          const m = { map: cur.map || {}, names: cur.names || {}, labels: cur.labels || {}, info: cur.info || {} };
          rest.forEach(x => { if (x.key !== keep.key) { m.map[x.key] = keep.key; m.labels[x.key] = x.name; if (m.info[x.key] && !m.info[keep.key]) m.info[keep.key] = m.info[x.key]; } });
          if (m.map[keep.key]) delete m.map[keep.key];
          if (!m.names[keep.key]) m.names[keep.key] = keep.name;
          await sbPut([{ kind: "setting", id: "product_merge", data: { ...m, savedAt: nowIso() } }]);
          DUP.groups.splice(DUP.groups.indexOf(grp), 1); D = null;
          toast(`Merged into ${keep.name}. The tool refreshes within 30 seconds.`, 5000); dupRender(false);
        } catch (e) { box.querySelectorAll("button").forEach(b => b.disabled = false); msg.textContent = "Not merged: " + e.message; }
      };
    });
  }

  async function runSave(list) {
    if (S.busy) return; S.busy = true;
    const msg = $("#abFoot .msg"); $("#abFoot").querySelectorAll("button").forEach(b => b.disabled = true);
    const ok = [], bad = [];
    for (const d of list) {
      if (msg) msg.textContent = `Saving ${d.co.label}…`;
      try { const inv = await saveDraft(d); ok.push(inv.invoiceNo); } catch (e) { bad.push(d.co.label + ": " + e.message); }
    }
    S.busy = false; PLAN = null;
    if (ok.length) toast(`Saved ${ok.join(", ")}. They appear in Sales within 30 seconds.`, 6000);
    if (bad.length) toast("Not saved — " + bad.join(" · "), 8000);
    draw();
  }
})();
