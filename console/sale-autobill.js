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
    { id: "sasta", re: /^sasta/i, gstin: "09AEWFS5594P1ZI", label: "Sasta Store" },
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
  async function fsList(db, path) {
    const out = []; let tok = "";
    for (let i = 0; i < 200; i++) {
      const r = await fetch(fsBase(db, path) + `?pageSize=50&key=${FS[db].k}` + (tok ? "&pageToken=" + encodeURIComponent(tok) : ""));
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
  async function loadAll(progress) {
    progress("Loading orders…");
    const [omsChunks, asinDoc, mmChunks, lotsChunks] = await Promise.all([
      fsList("oms", "aikm_admin/omsOrders/chunks"),
      fsDoc("main", "aikm_admin/spapiAsinLotsMap").catch(() => null),
      fsList("main", "aikm_admin/masterMapping/chunks").catch(() => []),
      fsList("main", "aikm_admin/lotsCatalog/chunks").catch(() => []),
    ]);
    progress("Loading purchase bills…");
    const rows = await sbAll(`kind=in.(bill,customer,setting,product_hsn,autobill_map,autobill_done)&select=kind,id,data`);
    const by = k => rows.filter(r => r.kind === k);

    const orders = omsChunks.flatMap(c => c.orders || []);
    const asinMap = (asinDoc && asinDoc.map) || {};
    const mm = Object.assign({}, ...mmChunks.map(c => c.map || {}));
    const lots = {}; lotsChunks.forEach(c => (c.products || []).forEach(p => { if (p && p.code) lots[String(p.code)] = p; }));
    const settings = (by("setting").find(r => r.id === "company") || {}).data || {};
    const merge = (by("setting").find(r => r.id === "product_merge") || {}).data || {};
    const hsnOver = {}; by("product_hsn").forEach(r => { if (r.data && r.data.key && r.data.hsn) hsnOver[r.data.key] = String(r.data.hsn); });
    const userMap = {}; by("autobill_map").forEach(r => { userMap[r.id] = r.data; });
    const done = {}; by("autobill_done").forEach(r => { done[r.id] = r.data; });
    const customers = by("customer").map(r => r.data).filter(Boolean);

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
    D = { orders, asinMap, mm, lots, settings, merge, prods, byCode, byBc, byName, userMap, done, customers, loadedAt: Date.now() };
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
      out.push({ p, units: (num(pt.qty) || 1) * packMult(pt.orderPackQty ? pt : r), via });
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
  const EDIT = {};          // user changes to rate / hsn / qty, per draft line:  EDIT[draftId][lineKey] = {...}
  function buildDrafts(date) {
    const list = shippedOrders().filter(o => o._date === date);
    const drafts = COMPANIES.map(co => ({ co, id: date + "__" + co.gstin, date, orders: new Set(), lines: new Map(), unmatched: new Map(), lotsOnly: 0 }));
    const byCo = Object.fromEntries(drafts.map(d => [d.co.id, d]));
    for (const o of list) {
      const d = byCo[o._co.id], q = num(o.qty) || 1;
      d.orders.add(o.channelOrderId);
      const m = matchLine(o);
      if (!m) {
        const k = o.asin ? "asin:" + o.asin : "sku:" + normKey(o.sku);
        const u = d.unmatched.get(k) || { k, asin: o.asin || "", sku: o.sku || "", name: o.productName || o.sku, qty: 0, channel: o.channel };
        u.qty += q; d.unmatched.set(k, u); continue;
      }
      for (const { p, units, via } of m) {
        const L = d.lines.get(p.key) || { key: p.key, p, qty: 0, via, orders: 0 };
        L.qty += q * units; L.orders++; d.lines.set(p.key, L);
      }
    }
    for (const d of drafts) {
      const ed = EDIT[d.id] || {};
      d.items = [...d.lines.values()].sort((a, b) => a.p.name.localeCompare(b.p.name)).map(L => {
        const pr = priceFor(L.p), e = ed[L.key] || {};
        const rate = e.rate != null ? e.rate : pr.rate, qty = e.qty != null ? e.qty : L.qty, hsn = (e.hsn != null ? e.hsn : L.p.hsn || "");
        const pct = L.p.cost ? (rate / L.p.cost - 1) * 100 : 0, cap = L.p.mrp > 0 ? L.p.mrp / (1 + L.p.gst / 100) : Infinity;
        if (L.p.noBill) d.lotsOnly++;
        return { L, p: L.p, qty, rate, hsn: String(hsn || ""), pct, capped: pr.capped && e.rate == null, overMrp: rate > cap + 0.005, hsnBad: !/^(\d{4}|\d{6}|\d{8})$/.test(String(hsn || "")) };
      });
      const calc = calcTotals(d.items);
      Object.assign(d, calc, {
        done: D.done[d.id] || null,
        low: d.items.filter(i => i.pct < MIN_PCT - 0.05).length,
        hsnBad: d.items.filter(i => i.hsnBad).length,
        overMrp: d.items.filter(i => i.overMrp).length,
        avgPct: calc.cost ? (calc.taxable / calc.cost - 1) * 100 : 0,
      });
    }
    return drafts;
  }
  function calcTotals(items) {
    let taxable = 0, gst = 0, cost = 0;
    items.forEach(i => { const tx = money(i.qty * i.rate); taxable += tx; gst += money(tx * i.p.gst / 200) * 2; cost += i.qty * i.p.cost; });
    taxable = money(taxable); gst = money(gst);
    const gross = money(taxable + gst);
    return { taxable, gst, cost: money(cost), total: Math.round(gross), profit: money(taxable - cost) };
  }
  function dateSummary() {
    const all = shippedOrders(), m = new Map();
    all.forEach(o => { const x = m.get(o._date) || { date: o._date, orders: new Set() }; x.orders.add(o.channelOrderId); m.set(o._date, x); });
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map(x => {
      const doneN = COMPANIES.filter(c => D.done[x.date + "__" + c.gstin]).length;
      return { date: x.date, orders: x.orders.size, doneN };
    });
  }

  /* =====================================================================
     SAVE — creates a normal sale invoice (same format and number series as the tool)
     ===================================================================== */
  async function saveDraft(d) {
    if (!d.items.length) throw new Error("No matched products in this bill.");
    if (d.hsnBad) throw new Error("Enter the HSN for every product first (red boxes).");
    if (d.overMrp) throw new Error("A rate is above MRP. Lower it first.");
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
      notes: `Auto bill · orders shipped ${fmtD(d.date)} · ${d.orders.size} orders`, items, updatedAt: nowIso(),
      taxable, cgst, sgst, igst, roundOff: money(total - gross), total, cancelledAt: "", source: "autobill",
    };
    await sbPut([{ kind: "sale", id: inv.id, fy, data: inv }]);
    await sbPut([{ kind: "autobill_done", id: d.id, data: { invoiceId: inv.id, invoiceNo: inv.invoiceNo, total, at: nowIso() } }]);
    const hsnRows = d.items.filter(i => i.hsn && i.hsn !== i.p.hsn).map(i => ({ kind: "product_hsn", id: i.p.key, data: { key: i.p.key, name: i.p.name, hsn: String(i.hsn) } }));
    if (hsnRows.length) await sbPut(hsnRows);
    D.done[d.id] = { invoiceId: inv.id, invoiceNo: inv.invoiceNo, total };
    delete EDIT[d.id];
    return inv;
  }
  async function rememberPick(u, prodKey, mult) {
    const rows = [];
    const data = prodKey === "__skip" ? { ignore: true, name: u.name } : { prodKey, mult: Math.max(1, num(mult) || 1), name: u.name };
    if (u.asin) rows.push({ kind: "autobill_map", id: "asin:" + u.asin, data });
    if (u.sku) rows.push({ kind: "autobill_map", id: "sku:" + normKey(u.sku), data });
    await sbPut(rows);
    rows.forEach(r => { D.userMap[r.id] = r.data; });
  }

  /* =====================================================================
     UI
     ===================================================================== */
  const CSS = `
  .ab-root{position:fixed;inset:0;z-index:50;display:flex}
  .ab-scrim{position:absolute;inset:0;background:rgba(5,15,18,.45)}
  .ab-panel{position:relative;margin-left:auto;width:min(1180px,100%);height:100%;background:var(--bg);display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.2)}
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
      <div class="ab-head"><h2>Auto sale bills<small>From orders shipped · cost + ${MIN_PCT}–${MAX_PCT}% · never above MRP</small></h2><button class="btn small" id="abReload" title="Load latest orders">Refresh</button><button class="btn small" id="abClose">Close</button></div>
      <div class="ab-body" id="abBody"><div class="ab-load" id="abLoad">Loading…</div></div>
      <div class="ab-foot" id="abFoot" hidden></div></div></div>`;
    $("#abScrim").onclick = close; $("#abClose").onclick = close;
    $("#abReload").onclick = () => { D = null; open(); };
    try {
      if (!D || Date.now() - D.loadedAt > 10 * 60 * 1000) await loadAll(t => { const l = $("#abLoad"); if (l) l.textContent = t; });
    } catch (e) { $("#abBody").innerHTML = `<div class="ab-load">Could not load: ${esc(e.message)}<br><br><button class="btn" id="abRetry">Try again</button></div>`; $("#abRetry").onclick = () => { D = null; open(); }; return; }
    const ds = dateSummary();
    if (!ds.length) { $("#abBody").innerHTML = `<div class="ab-load">No shipped orders found in the last 15 days.</div>`; return; }
    if (!S.date || !ds.some(x => x.date === S.date)) {
      const y = addDays(todayIso(), -1);
      S.date = (ds.find(x => x.date <= y && x.doneN < COMPANIES.length) || ds.find(x => x.date <= y) || ds[0]).date;
    }
    draw();
  }

  function draw() {
    const ds = dateSummary();
    S.drafts = buildDrafts(S.date);
    let d = S.drafts.find(x => x.co.id === S.co);
    if (!d || (!d.items.length && !d.unmatched.size && !d.done)) d = S.drafts.find(x => x.items.length || x.unmatched.size) || S.drafts[0];
    S.co = d.co.id;
    const pill = (cls, t) => `<span class="pill ${cls}">${t}</span>`;
    const card = x => {
      const empty = !x.items.length && !x.unmatched.size;
      return `<button type="button" class="ab-card${x.done ? " done" : ""}" data-co="${x.co.id}" aria-pressed="${x.co.id === S.co}">
        <h3>${esc(x.co.label)}</h3>
        <div class="big">${empty ? "—" : inr(x.total)}</div>
        <div class="meta">${x.orders.size} orders · ${x.items.length} products${x.items.length ? ` · avg ${x.avgPct.toFixed(1)}%` : ""}</div>
        <div class="tags">${x.done ? pill("good", "Saved " + esc(x.done.invoiceNo)) : empty ? pill("", "No orders") : pill("warn", "Draft")}${x.unmatched.size ? pill("bad", x.unmatched.size + " not matched") : ""}${x.hsnBad && !x.done ? pill("bad", x.hsnBad + " HSN missing") : ""}${x.low && !x.done ? pill("warn", x.low + " under 15%") : ""}</div></button>`;
    };
    $("#abBody").innerHTML = `
      <div class="ab-dates">${ds.map(x => `<button type="button" class="ab-date" data-d="${x.date}" aria-pressed="${x.date === S.date}"><b>${dayName(x.date)} ${fmtD(x.date)}</b><span>${x.orders} orders · ${x.doneN === COMPANIES.length ? '<i class="ok">✓ billed</i>' : x.doneN ? x.doneN + "/4 billed" : "not billed"}</span></button>`).join("")}</div>
      <div class="ab-cards">${S.drafts.map(card).join("")}</div>
      <div id="abDetail"></div>`;
    $("#abBody").querySelectorAll(".ab-date").forEach(b => b.onclick = () => { S.date = b.dataset.d; draw(); });
    $("#abBody").querySelectorAll(".ab-card").forEach(b => b.onclick = () => { S.co = b.dataset.co; draw(); });
    detail(d);
  }

  function detail(d) {
    const box = $("#abDetail"), foot = $("#abFoot");
    foot.hidden = false;
    const readyAll = S.drafts.filter(x => !x.done && x.items.length && !x.hsnBad && !x.overMrp);
    if (d.done) {
      box.innerHTML = `<div class="banner info">Bill <b>${esc(d.done.invoiceNo)}</b> (${inr(d.done.total)}) is already saved for ${esc(d.co.label)} — orders shipped ${fmtD(d.date)}. Open it from the Sales list to view or print.</div>`;
      foot.innerHTML = `<span class="msg"></span>${readyAll.length ? `<button class="btn primary" id="abAll">Approve all ${readyAll.length} ready bills</button>` : ""}`;
      wireAll(readyAll); return;
    }
    if (!d.items.length && !d.unmatched.size) { box.innerHTML = `<div class="ab-load">No orders shipped for ${esc(d.co.label)} on ${fmtD(d.date)}.</div>`; foot.innerHTML = `<span class="msg"></span>${readyAll.length ? `<button class="btn primary" id="abAll">Approve all ${readyAll.length} ready bills</button>` : ""}`; wireAll(readyAll); return; }
    const prodOpts = [...D.prods.values()].sort((a, b) => a.name.localeCompare(b.name));
    box.innerHTML = `
      ${d.unmatched.size ? `<div class="ab-sec"><h4>Not matched — pick the purchased product once (remembered)</h4></div>
      <datalist id="abProds">${prodOpts.map(p => `<option value="${esc(p.name)}">${esc(p.sup)} · ${inr(p.cost, 2)}</option>`).join("")}</datalist>
      <div class="tablebox ab-um"><table class="ab-t"><thead><tr><th>Sold as</th><th class="r">Qty</th><th>Purchased product</th><th>Units per sale</th><th></th></tr></thead><tbody>
      ${[...d.unmatched.values()].map((u, i) => `<tr data-i="${i}"><td><span class="pn">${esc(u.name)}</span><div class="sub">${esc([u.asin, u.sku].filter(Boolean).join(" · "))}</div></td><td class="r num">${u.qty}</td><td><input list="abProds" class="abPick" placeholder="Type product name"></td><td><input class="abMult" type="number" min="1" step="1" value="1" style="width:64px"></td><td style="white-space:nowrap"><button class="btn small primary abSave">Save</button> <button class="btn small abSkip" title="Not billed (gift, freebie, own stock)">Skip</button></td></tr>`).join("")}
      </tbody></table></div>` : ""}
      <div class="ab-sec"><h4>Bill to ${esc(d.co.label)} · shipped ${dayName(d.date)} ${fmtD(d.date)}</h4>
        <div class="ab-sum"><span>Cost <b>${inr(d.cost)}</b></span><span>Taxable <b>${inr(d.taxable)}</b></span><span>GST <b>${inr(d.gst)}</b></span><span>Profit <b>${inr(d.profit)}</b> (${d.avgPct.toFixed(1)}%)</span></div></div>
      <div class="tablebox"><table class="ab-t"><thead><tr><th>Product</th><th class="hm">HSN</th><th class="r">Qty</th><th class="r hm">Cost/unit</th><th class="r">Rate (ex-GST)</th><th class="r">Profit %</th><th class="r hm">MRP</th><th class="r hm">GST</th><th class="r">Amount</th></tr></thead><tbody>
      ${d.items.map((i, n) => `<tr data-n="${n}" class="${i.overMrp || i.hsnBad ? "bad" : i.pct < MIN_PCT - 0.05 ? "warn" : ""}">
        <td><span class="pn">${esc(i.p.name)}</span><div class="sub">${esc(i.p.noBill ? "No purchase bill yet — LOTS list price" : i.p.sup + (i.p.date ? " · " + fmtD(i.p.date) : ""))} · ${esc(i.L.via)}</div></td>
        <td class="hm"><input class="h${i.hsnBad ? " bad" : ""}" data-k="hsn" value="${esc(i.hsn)}" inputmode="numeric" placeholder="HSN"></td>
        <td class="r"><input data-k="qty" value="${i.qty}" inputmode="decimal" style="width:60px"></td>
        <td class="r num hm">${inr(i.p.cost, 2)}</td>
        <td class="r"><input data-k="rate" class="${i.overMrp ? "bad" : ""}" value="${i.rate.toFixed(2)}" inputmode="decimal"></td>
        <td class="r num">${i.pct.toFixed(1)}%${i.capped ? `<div class="sub">MRP limit</div>` : ""}</td>
        <td class="r num hm">${i.p.mrp ? inr(i.p.mrp, 2) : "—"}</td>
        <td class="r num hm">${i.p.gst}%</td>
        <td class="r num">${inr(i.qty * i.rate * (1 + i.p.gst / 100), 2)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="note" style="margin:0">Rate = purchase cost + ${MAX_PCT}%. Where that crosses MRP it is lowered to MRP (yellow = below ${MIN_PCT}%, red = fix before saving). Your edits stay until you close this window.</p>`;
    // edits
    box.querySelectorAll("tr[data-n] input").forEach(inp => inp.onchange = () => {
      const i = d.items[+inp.closest("tr").dataset.n], k = inp.dataset.k;
      const e = ((EDIT[d.id] ||= {})[i.L.key] ||= {});
      e[k] = k === "hsn" ? inp.value.trim() : num(inp.value);
      draw();
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
    const block = d.hsnBad ? `Enter ${d.hsnBad} missing HSN` : d.overMrp ? "A rate is above MRP" : "";
    foot.innerHTML = `<span class="msg">${d.unmatched.size ? `<span class="up">${d.unmatched.size} product${d.unmatched.size > 1 ? "s" : ""} not matched will be left out.</span>` : block ? `<span class="up">${block}</span>` : `${d.items.length} products · total <b>${inr(d.total)}</b>`}</span>
      ${readyAll.length > 1 ? `<button class="btn" id="abAll">Approve all ${readyAll.length} ready</button>` : ""}
      <button class="btn primary" id="abOne" ${block || !d.items.length ? "disabled" : ""}>Approve &amp; save bill</button>`;
    $("#abOne").onclick = async () => {
      if (d.unmatched.size && !confirm(`${d.unmatched.size} not-matched products will NOT be on this bill. Save anyway?`)) return;
      await runSave([d]);
    };
    wireAll(readyAll);
  }
  function wireAll(list) {
    const b = $("#abAll"); if (!b) return;
    b.onclick = async () => {
      const um = list.filter(x => x.unmatched.size).length;
      if (!confirm(`Save ${list.length} bill${list.length > 1 ? "s" : ""} for ${fmtD(S.date)}?${um ? `\n${um} of them have not-matched products that will be left out.` : ""}`)) return;
      await runSave(list);
    };
  }
  async function runSave(list) {
    if (S.busy) return; S.busy = true;
    const msg = $("#abFoot .msg"); $("#abFoot").querySelectorAll("button").forEach(b => b.disabled = true);
    const ok = [], bad = [];
    for (const d of list) {
      if (msg) msg.textContent = `Saving ${d.co.label}…`;
      try { const inv = await saveDraft(d); ok.push(inv.invoiceNo); } catch (e) { bad.push(d.co.label + ": " + e.message); }
    }
    S.busy = false;
    if (ok.length) toast(`Saved ${ok.join(", ")}. They appear in Sales within 30 seconds.`, 6000);
    if (bad.length) toast("Not saved — " + bad.join(" · "), 8000);
    draw();
  }
})();
