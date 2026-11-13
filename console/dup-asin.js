/* AIKM · Amazon page · Inventory (owner, 12 Nov 2026)
   1. "Duplicate ASINs" tile -> listings grouped by ASIN (same ASIN together), one "KEEP" per ASIN
      (most units sold in 30 days, then most stock, then oldest listing). Tick the rest and delete them in bulk:
      queued in main-Firebase `spapiListingDeletions` (1 write each); the sync robot deletes them on Amazon (max 200 per run).
   2. Every inventory row shows when the listing was created on Amazon (`openDate` from the listings report).
   3. (owner, 13 Nov 2026) "All 4 accounts" switch: the same ASIN in stock on MORE THAN ONE of our Amazon accounts, grouped by ASIN,
      one KEEP (the account holding the Buy Box, then lowest price, then most stock, then oldest). Nothing is pre-ticked here;
      "Tick all except KEEP" ticks the rest. Deletes are queued per account in the same `spapiListingDeletions` collection.
      Reads: ~25 per open of the all-accounts view (other accounts' inventory + pricing snapshot chunks), kept 5 min in memory.
   Loaded by the block at the end of console/amazon-name-search.js (aikmDupAsinJs). 1 read per open of the duplicate view. */
(function () {
  if (window.__aikmDupAsin) return; window.__aikmDupAsin = true;
  var tries = 0;
  function ready() { try { return typeof renderInventoryCards === "function" && typeof spapiInventoryRaw !== "undefined" && typeof fbDb !== "undefined"; } catch (e) { return false; } }
  function boot() { if (!ready()) { if (++tries < 80) setTimeout(boot, 250); return; } setup(); }

  var css = document.createElement("style");
  css.textContent =
    ".dpa-grp td{background:#FDFCF8}.dpa-grp .dpa-h{display:flex;align-items:center;gap:12px}" +
    ".dpa-grp b{font:600 13px 'Lexend',sans-serif;color:var(--ink)}.dpa-n{font-size:11px;font-weight:600;color:var(--gold-2);background:var(--gold-soft);border-radius:20px;padding:1px 8px}" +
    "tr.dpa-row td{border-bottom:1px solid var(--line-2)}tr.dpa-row.del td{background:#FFF7F6}tr.dpa-row td:first-child{padding-left:34px}" +
    ".dpa-keep{font-size:10px;font-weight:700;letter-spacing:.04em;color:#fff;background:var(--green);border-radius:5px;padding:2px 7px}" +
    ".dpa-why{font-size:10.5px;color:var(--muted);margin-top:3px}.dpa-date{font-size:11px;color:var(--ink-2);white-space:nowrap}" +
    ".dpa-del{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#fff;background:var(--red);border-radius:9px;padding:7px 13px}" +
    ".dpa-del:hover{filter:brightness(1.08)}.dpa-del[disabled]{opacity:.45;pointer-events:none}" +
    ".dpa-cb{width:16px;height:16px;accent-color:var(--red);cursor:pointer}.lst-date{font-size:10.5px;color:var(--muted);margin-top:3px}" +
    ".dpa-seg{display:inline-flex;background:var(--line-2,#EEF0F3);border-radius:10px;padding:3px;gap:2px}" +
    ".dpa-seg button{all:unset;cursor:pointer;font-size:12px;font-weight:600;color:var(--ink-2);padding:6px 12px;border-radius:8px;white-space:nowrap}" +
    ".dpa-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.12)}" +
    ".dpa-acct{display:inline-block;font-size:11px;font-weight:600;color:var(--navy,#1F2A44);background:#EEF2FA;border-radius:6px;padding:2px 8px;white-space:nowrap}" +
    ".dpa-bb{font-size:11px;font-weight:600;color:var(--green)}.dpa-tick{all:unset;cursor:pointer;font-size:12px;font-weight:600;color:var(--ink-2);border:1px solid var(--line);border-radius:9px;padding:6px 12px;background:#fff}" +
    ".dpa-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--line-2)}" +
    ".dpa-l,.dpa-r{display:flex;align-items:center;gap:10px}.dpa-l{flex:1 1 auto;min-width:0}.dpa-bar .ap-search{flex:0 1 320px;width:320px;min-width:180px;max-width:100%;margin:0;height:38px;box-sizing:border-box}" +
    ".dpa-cnt{font-size:12px;color:var(--muted);white-space:nowrap;margin-right:4px}.dpa-cnt b{color:var(--ink);font-weight:600}" +
    ".dpa-bar .dpa-seg{height:38px;box-sizing:border-box;align-items:center}.dpa-bar .dpa-seg button{padding:7px 14px}" +
    ".dpa-bar .dpa-tick,.dpa-bar .dpa-del{height:38px;box-sizing:border-box;padding:0 15px;border-radius:10px;display:inline-flex;align-items:center;gap:7px;font-size:12.5px}" +
    ".dpa-bar .dpa-tick:hover{border-color:var(--ink-2)}" +
    ".dpa-note{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:9px 18px;background:#FBF8F1;border-bottom:1px solid var(--line-2);font-size:12px;color:var(--ink-2)}" +
    ".dpa-note i{color:var(--gold-2);font-size:15px;vertical-align:-2px;margin-right:6px}.dpa-note a{all:unset;cursor:pointer;font-weight:600;color:var(--ink);white-space:nowrap}.dpa-note a:hover{text-decoration:underline}" +
    "@media(max-width:1100px){.dpa-l,.dpa-r{flex-wrap:wrap;width:100%}.dpa-r{justify-content:flex-end}}@media(max-width:700px){.dpa-bar .ap-search{flex:1 1 100%;width:100%}}";
  document.head.appendChild(css);

  var esc = function (s) { return typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s); };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var safeId = function (sku) { return acct() + "_" + String(sku).replace(/\//g, "%2F"); };

  /* "2024-05-12 10:22:33 IST" / "12/05/2024 10:22:33 IST" -> "12 May '24, 10:22 AM" */
  function fmtDate(s) {
    if (!s) return "";
    var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/) || null, d;
    if (m) d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    else { var n = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]?(\d{1,2})?:?(\d{2})?/); if (n) d = new Date(+n[3], +n[2] - 1, +n[1], +(n[4] || 0), +(n[5] || 0)); }
    if (!d || isNaN(d)) return String(s);
    return d.getDate() + " " + d.toLocaleString("en-IN", { month: "short" }) + " '" + String(d.getFullYear()).slice(-2) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }
  function dateKey(s) { var t = Date.parse(String(s || "").replace(" IST", "+05:30").replace(" ", "T")); return isNaN(t) ? Infinity : t; }

  var queued = {}, queuedFor = null, ticked = {}, q = "";
  var mode = "one"; try { if (localStorage.getItem("aikmDupMode") === "all") mode = "all"; } catch (e) {}
  function setMode(m) { mode = m; try { localStorage.setItem("aikmDupMode", m); } catch (e) {} q = ""; renderInventoryCards(); }
  function seg() {
    var n = (typeof SPAPI_ACCOUNTS !== "undefined" ? SPAPI_ACCOUNTS.length : 4);
    return '<div class="dpa-seg"><button type="button" data-dpm="one" class="' + (mode === "one" ? "on" : "") + '">This account</button>' +
      '<button type="button" data-dpm="all" class="' + (mode === "all" ? "on" : "") + '">All ' + n + ' accounts</button></div>';
  }
  function bindSeg(c) { c.querySelectorAll("[data-dpm]").forEach(function (b) { b.onclick = function () { if (b.dataset.dpm !== mode) setMode(b.dataset.dpm); }; }); }
  function loadQueued() {
    var a = acct(); if (queuedFor === a) return Promise.resolve();
    return fbDb.collection("spapiListingDeletions").where("account", "==", a).where("status", "==", "pending").get()
      .then(function (s) { queued = {}; s.forEach(function (d) { var x = d.data(); x.sku && (queued[x.sku] = 1); }); queuedFor = a; })
      .catch(function () { queuedFor = a; });
  }
  function sold30() {
    var u = {}, now = Date.now();
    (spapiOrdersRaw || []).forEach(function (o) {
      if (o.isCanceled || !o.purchaseDate || (now - Date.parse(o.purchaseDate)) / 864e5 > 30) return;
      (o.items || []).forEach(function (it) { if (it.sku) u[it.sku] = (u[it.sku] || 0) + (+it.qty || 1); });
    });
    return u;
  }
  function groups() {
    var inv = spapiInventoryRaw || [], inStockN = {}, by = {}, u = sold30();
    inv.forEach(function (e) { if (e.asin && (e.quantity || 0) > 0) inStockN[e.asin] = (inStockN[e.asin] || 0) + 1; });
    inv.forEach(function (e) { if (e.asin && inStockN[e.asin] > 1) (by[e.asin] || (by[e.asin] = [])).push(e); });
    return Object.keys(by).map(function (a) {
      var l = by[a].map(function (e) { return { e: e, u: u[e.sku] || 0, fba: (e.fulfillmentChannel || "DEFAULT") !== "DEFAULT" }; });
      l.sort(function (x, y) { return (y.u - x.u) || ((y.e.quantity || 0) - (x.e.quantity || 0)) || (dateKey(x.e.openDate) - dateKey(y.e.openDate)) || String(x.e.sku).localeCompare(y.e.sku); });
      l[0].keep = true;
      l[0].why = l[0].u ? l[0].u + " sold in 30 days" : (l[0].e.quantity || 0) > 0 ? "most stock" : "oldest listing";
      var units = l.reduce(function (s, x) { return s + x.u; }, 0);
      return { asin: a, name: (l.find(function (x) { return x.e.name; }) || l[0]).e.name || "", rows: l, units: units };
    }).sort(function (x, y) { return y.units - x.units || x.name.localeCompare(y.name); });
  }

  var CLEAR = "spapiKpiFilter=null;renderSpapiKpis();renderInventoryCards()";
  function bar(o) {
    return '<div class="dpa-bar"><div class="dpa-l">' + seg() + '<div class="ap-search"><i class="ti ti-search"></i><input type="text" id="dpaQ" placeholder="' + o.ph + '" value="' + esc(q) + '"></div></div>' +
      '<div class="dpa-r"><span class="dpa-cnt"><b>' + o.asins + '</b> ASINs · <b>' + o.listings + '</b> listings' + (o.nQ ? ' · <b>' + o.nQ + '</b> queued' : '') + '</span>' +
      (o.tickAll ? '<button type="button" class="dpa-tick" id="dpaTickAll"><i class="ti ti-checks"></i>Tick all except KEEP</button>' : '') +
      '<button type="button" class="dpa-del" id="dpaDel"' + (o.nTick ? "" : " disabled") + '><i class="ti ti-trash"></i>Delete ' + o.nTick + ' ticked from Amazon</button></div></div>' +
      '<div class="dpa-note"><span><i class="ti ti-info-circle"></i>' + o.hint + '</span><a onclick="' + CLEAR + '">Clear filter ✕</a></div>';
  }
  function setDelBtn(n) { var d = document.getElementById("dpaDel"); if (!d) return; d.disabled = !n; d.innerHTML = '<i class="ti ti-trash"></i>Delete ' + n + " ticked from Amazon"; }
  function drawDup() {
    var c = document.getElementById("spapiInventoryTable_cards"); if (!c) return;
    var G = groups(), all = [];
    G.forEach(function (g) { g.rows.forEach(function (r) { if (!r.keep && !r.fba && !queued[r.e.sku] && ticked[r.e.sku] === undefined) ticked[r.e.sku] = true; all.push(r); }); });
    var list = q ? G.filter(function (g) { return (g.asin + " " + g.name + " " + g.rows.map(function (r) { return r.e.sku; }).join(" ")).toLowerCase().indexOf(q) >= 0; }) : G;
    var nTick = all.filter(function (r) { return ticked[r.e.sku] && !queued[r.e.sku]; }).length, nQ = all.filter(function (r) { return queued[r.e.sku]; }).length;
    var rows = list.map(function (g) {
      return '<tr class="dpa-grp"><td colspan="8"><div class="dpa-h">' + (typeof thumb === "function" ? thumb(g.asin, 40) : "") +
        '<div><b>' + esc(g.name || "—") + '</b><div class="t-sub"><a class="t-mono" href="https://www.amazon.in/dp/' + esc(g.asin) + '" target="_blank" rel="noopener">' + esc(g.asin) + '</a> · <span class="dpa-n">' + g.rows.length + ' listings</span>' + (g.units ? ' · ' + g.units + ' sold in 30 days' : "") + '</div></div></div></td></tr>' +
        g.rows.map(function (r) {
          var e = r.e, sku = esc(e.sku), oos = (e.quantity || 0) <= 0, isQ = queued[e.sku], on = !!ticked[e.sku] && !isQ;
          var act = isQ ? '<span class="pill warn">Queued · deletes at next sync</span>'
            : r.keep ? '<span class="dpa-keep">KEEP</span><div class="dpa-why">' + esc(r.why) + "</div>"
            : r.fba ? '<span class="pill navy">FBA</span><div class="dpa-why">FBA stock — not ticked</div>' : "";
          return '<tr class="dpa-row' + (on ? " del" : "") + '" data-sku="' + sku + '">' +
            '<td style="width:34px">' + (isQ ? "" : '<input type="checkbox" class="dpa-cb" data-dpa="' + sku + '"' + (on ? " checked" : "") + ">") + "</td>" +
            '<td><span class="t-mono">' + sku + "</span></td>" +
            '<td class="dpa-date">' + (e.openDate ? esc(fmtDate(e.openDate)) : '<span class="t-muted">—</span>') + "</td>" +
            '<td><span class="pill ' + (oos ? "bad" : "ok") + ' num">' + (oos ? "Out of stock" : e.quantity + " in stock") + "</span></td>" +
            '<td class="num">' + (e.price != null ? "₹" + e.price : "—") + "</td>" +
            '<td class="num">' + r.u + "</td>" +
            '<td>' + (e.fulfillmentChannel && e.fulfillmentChannel !== "DEFAULT" ? "FBA" : "Self / Easy Ship") + "</td>" +
            "<td>" + act + "</td></tr>";
        }).join("");
    }).join("");
    c.innerHTML = bar({ ph: "Search product, SKU or ASIN…", asins: list.length, listings: all.length, nQ: nQ, nTick: nTick,
        hint: "Same ASIN listed more than once in this account. One <b>KEEP</b> per ASIN (most sold, then most stock, then oldest) — the others are ticked." }) +
      '<div class="ap-scroll"><table class="sp-tbl"><thead><tr><th></th><th>SKU</th><th>Listed on</th><th>Amazon stock</th><th>Price</th><th>Sold 30d</th><th>Shipping</th><th>Action</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      (list.length ? "" : (typeof spEmpty === "function" ? spEmpty("ti-circle-check", "No duplicate ASINs", "Every in-stock ASIN has one listing.") : "")) + "</div>";
    bindSeg(c);
    var qi = document.getElementById("dpaQ");
    qi.oninput = function (ev) { q = ev.target.value.toLowerCase(); drawDup(); var x = document.getElementById("dpaQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); };
    /* tick/untick in place - no redraw, so the list stays where you are (owner 13 Nov 2026) */
    c.onchange = function (ev) { var b = ev.target.closest("[data-dpa]"); if (!b) return; ticked[b.dataset.dpa] = b.checked;
      var tr = b.closest("tr"); tr && tr.classList.toggle("del", b.checked);
      setDelBtn(all.filter(function (r) { return ticked[r.e.sku] && !queued[r.e.sku]; }).length); };
    document.getElementById("dpaDel").onclick = function () { del(all.filter(function (r) { return ticked[r.e.sku] && !queued[r.e.sku]; })); };
  }

  async function del(list) {
    if (!list.length) return;
    var keepSkus = {}; groups().forEach(function (g) { var left = g.rows.filter(function (r) { return !(ticked[r.e.sku] && !queued[r.e.sku]) && !queued[r.e.sku]; }); keepSkus[g.asin] = left.length; });
    var empty = Object.keys(keepSkus).filter(function (a) { return keepSkus[a] === 0; });
    if (empty.length) { typeof spToast === "function" && spToast("⚠ Keep at least one listing for every ASIN — " + empty.length + " ASIN(s) would be removed completely", true); return; }
    var name = ((typeof SPAPI_ACCOUNTS !== "undefined" && SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); })) || {}).name || acct();
    var ok = typeof askPremiumConfirm === "function" ? await askPremiumConfirm({ kicker: "Delete duplicate listings", title: list.length + " listing" + (list.length > 1 ? "s" : "") + " · " + esc(name),
      message: "These SKUs will be DELETED from Amazon at the next sync (about 15 min). This cannot be undone.\nEach ASIN keeps its KEEP listing.\n\nAlso remove the deleted SKUs from OMS Guru if they are linked there.", confirmLabel: "Delete " + list.length + " from Amazon" }) : confirm("Delete " + list.length + " listings from Amazon?");
    if (!ok) return;
    try {
      for (var i = 0; i < list.length; i += 400) {
        var b = fbDb.batch();
        list.slice(i, i + 400).forEach(function (r) {
          b.set(fbDb.collection("spapiListingDeletions").doc(safeId(r.e.sku)), { account: acct(), sku: r.e.sku, name: r.e.name || null, asin: r.e.asin || null,
            status: "pending", source: "duplicate-bulk", requestedAt: firebase.firestore.FieldValue.serverTimestamp() });
          queued[r.e.sku] = 1;
        });
        await b.commit();
      }
      typeof spToast === "function" && spToast("✓ " + list.length + " listings queued — deleted on Amazon at the next sync");
    } catch (e) { typeof spToast === "function" && spToast("⚠ Not all queued: " + (e.message || e), true); }
    drawDup();
  }


  /* ===== All accounts: same ASIN in stock on more than one of our accounts ===== */
  var AX = { data: null, at: 0, loading: null, owner: {}, queued: {}, ticked: {} };
  var accts = function () { return (typeof SPAPI_ACCOUNTS !== "undefined" ? SPAPI_ACCOUNTS : [{ label: acct(), name: acct() }]); };
  var acctName = function (l) { return (accts().find(function (a) { return a.label === l; }) || {}).name || l; };
  var kOf = function (a, sku) { return a + "|" + sku; };
  function loadAll(force) {
    if (AX.loading) return AX.loading;
    if (!force && AX.data && Date.now() - AX.at < 5 * 60e3) return Promise.resolve(AX.data);
    var C = fbDbSpapi.collection("spapiSnapshots"), cur = acct();
    AX.loading = Promise.all(accts().map(function (a) {
      if (a.label === cur && (spapiInventoryRaw || []).length) return Promise.resolve({ label: a.label, inv: (spapiInventoryRaw || []).slice(), pr: (typeof spapiPricingRaw !== "undefined" ? spapiPricingRaw : []) || [] });
      return C.doc(a.label + "_meta").get().then(function (m) {
        if (!m.exists || !m.data().run) return { label: a.label, inv: [], pr: [] };
        var md = m.data(), ch = md.chunks || {}, jobs = [];
        ["inventory", "pricing"].forEach(function (kind) { for (var i = 0; i < (ch[kind] || 0); i++) jobs.push(C.doc(a.label + "_" + kind + "_" + md.run + "_" + i).get().then(function (d) { return { kind: kind, items: (d.exists && d.data().items) || [] }; })); });
        return Promise.all(jobs).then(function (ps) {
          var out = { label: a.label, inv: [], pr: [] };
          ps.forEach(function (p) { (p.kind === "inventory" ? out.inv : out.pr).push.apply(p.kind === "inventory" ? out.inv : out.pr, p.items); });
          return out;
        });
      }).catch(function () { return { label: a.label, inv: [], pr: [] }; });
    }).concat([
      C.doc("ourSellers").get().then(function (d) { var ids = (d.exists && d.data().ids) || {}; AX.owner = {}; Object.keys(ids).forEach(function (l) { if (ids[l]) AX.owner[ids[l]] = l; }); }).catch(function () {}),
      fbDb.collection("spapiListingDeletions").where("status", "==", "pending").get().then(function (s) { AX.queued = {}; s.forEach(function (d) { var x = d.data(); x.sku && x.account && (AX.queued[kOf(x.account, x.sku)] = 1); }); }).catch(function () {})
    ])).then(function (res) { AX.data = res.slice(0, accts().length); AX.at = Date.now(); AX.loading = null; return AX.data; })
      .catch(function (e) { AX.loading = null; console.warn("dup all accounts", e); return AX.data || []; });
    return AX.loading;
  }
  function groupsAll() {
    var by = {}, bb = {};
    (AX.data || []).forEach(function (A) {
      (A.pr || []).forEach(function (p) { if (!p || !p.asin || bb[p.asin]) return; var w = (p.offers || []).find(function (o) { return o.isBuyBoxWinner; }); if (w) bb[p.asin] = { owner: AX.owner[w.sellerId] || null, price: (w.price || 0) + (w.shipping || 0) }; });
      (A.inv || []).forEach(function (e) { if (e && e.asin && e.sku) (by[e.asin] || (by[e.asin] = [])).push({ a: A.label, e: e, fba: (e.fulfillmentChannel || "DEFAULT") !== "DEFAULT" }); });
    });
    return Object.keys(by).map(function (asin) {
      var l = by[asin], inAcc = {};
      l.forEach(function (r) { if ((r.e.quantity || 0) > 0) inAcc[r.a] = 1; });
      if (Object.keys(inAcc).length < 2) return null;
      var b = bb[asin] || null, own = b && b.owner;
      l.forEach(function (r) { r.bb = !!(own && own === r.a && (r.e.quantity || 0) > 0); });
      l.sort(function (x, y) {
        return (y.bb - x.bb) || ((((y.e.quantity || 0) > 0) ? 1 : 0) - (((x.e.quantity || 0) > 0) ? 1 : 0)) ||
          ((x.e.price || Infinity) - (y.e.price || Infinity)) || ((y.e.quantity || 0) - (x.e.quantity || 0)) || (dateKey(x.e.openDate) - dateKey(y.e.openDate));
      });
      l[0].keep = true;
      l[0].why = l[0].bb ? "holds the Buy Box" : "lowest price in stock";
      return { asin: asin, name: (l.find(function (x) { return x.e.name; }) || l[0]).e.name || "", rows: l, accts: Object.keys(inAcc).length, bb: b };
    }).filter(Boolean).sort(function (x, y) { return y.accts - x.accts || y.rows.length - x.rows.length || x.name.localeCompare(y.name); });
  }
  function drawAll() {
    var c = document.getElementById("spapiInventoryTable_cards"); if (!c) return;
    if (!AX.data) {
      c.innerHTML = '<div class="dpa-bar"><div class="dpa-l">' + seg() + '</div><div class="dpa-r"><span class="dpa-cnt">Loading all accounts…</span></div></div>' + (typeof spSkeleton === "function" ? '<div class="ap-scroll">' + spSkeleton() + "</div>" : "");
      bindSeg(c); loadAll().then(function () { if (mode === "all" && spapiKpiFilter === "duplicate") drawAll(); }); return;
    }
    var G = groupsAll(), all = [], T = AX.ticked, Qd = AX.queued;
    G.forEach(function (g) { g.rows.forEach(function (r) { all.push(r); }); });
    var list = q ? G.filter(function (g) { return (g.asin + " " + g.name + " " + g.rows.map(function (r) { return r.e.sku + " " + acctName(r.a); }).join(" ")).toLowerCase().indexOf(q) >= 0; }) : G;
    var isT = function (r) { return T[kOf(r.a, r.e.sku)] && !Qd[kOf(r.a, r.e.sku)]; };
    var nTick = all.filter(isT).length, nQ = all.filter(function (r) { return Qd[kOf(r.a, r.e.sku)]; }).length;
    var rows = list.map(function (g) {
      return '<tr class="dpa-grp"><td colspan="8"><div class="dpa-h">' + (typeof thumb === "function" ? thumb(g.asin, 40) : "") +
        '<div><b>' + esc(g.name || "—") + '</b><div class="t-sub"><a class="t-mono" href="https://www.amazon.in/dp/' + esc(g.asin) + '" target="_blank" rel="noopener">' + esc(g.asin) + '</a> · <span class="dpa-n">in stock on ' + g.accts + ' accounts</span>' +
        (g.bb ? ' · Buy Box ₹' + Math.round(g.bb.price) + ' ' + (g.bb.owner ? "· " + esc(acctName(g.bb.owner)) : "· other seller") : "") + '</div></div></div></td></tr>' +
        g.rows.map(function (r) {
          var e = r.e, k = kOf(r.a, e.sku), oos = (e.quantity || 0) <= 0, isQ = Qd[k], on = isT(r);
          var act = isQ ? '<span class="pill warn">Queued · deletes at next sync</span>'
            : r.keep ? '<span class="dpa-keep">KEEP</span><div class="dpa-why">' + esc(r.why) + "</div>"
            : r.fba ? '<span class="pill navy">FBA</span>' : "";
          return '<tr class="dpa-row' + (on ? " del" : "") + '">' +
            '<td style="width:34px">' + (isQ ? "" : '<input type="checkbox" class="dpa-cb" data-dpk="' + esc(k) + '"' + (on ? " checked" : "") + ">") + "</td>" +
            '<td><span class="dpa-acct">' + esc(acctName(r.a)) + '</span><div class="t-mono" style="margin-top:4px">' + esc(e.sku) + "</div></td>" +
            '<td class="dpa-date">' + (e.openDate ? esc(fmtDate(e.openDate)) : '<span class="t-muted">—</span>') + "</td>" +
            '<td><span class="pill ' + (oos ? "bad" : "ok") + ' num">' + (oos ? "Out of stock" : e.quantity + " in stock") + "</span></td>" +
            '<td class="num">' + (e.price != null ? "₹" + e.price : "—") + "</td>" +
            '<td>' + (r.bb ? '<span class="dpa-bb"><i class="ti ti-trophy"></i> Buy Box</span>' : '<span class="t-muted">—</span>') + "</td>" +
            '<td>' + (r.fba ? "FBA" : "Self / Easy Ship") + "</td>" +
            "<td>" + act + "</td></tr>";
        }).join("");
    }).join("");
    c.innerHTML = bar({ ph: "Search product, SKU, ASIN or account…", asins: list.length, listings: all.length, nQ: nQ, nTick: nTick, tickAll: true,
        hint: "Same ASIN in stock on more than one of your accounts. <b>KEEP</b> = the account holding the Buy Box (else the lowest price). Nothing is ticked for you." }) +
      '<div class="ap-scroll"><table class="sp-tbl"><thead><tr><th></th><th>Account · SKU</th><th>Listed on</th><th>Amazon stock</th><th>Price</th><th>Buy Box</th><th>Shipping</th><th>Action</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      (list.length ? "" : (typeof spEmpty === "function" ? spEmpty("ti-circle-check", "No duplicates across accounts", "No ASIN is in stock on more than one of your accounts.") : "")) + "</div>";
    bindSeg(c);
    var qi = document.getElementById("dpaQ");
    qi.oninput = function (ev) { q = ev.target.value.toLowerCase(); drawAll(); var x = document.getElementById("dpaQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); };
    c.onchange = function (ev) { var b = ev.target.closest("[data-dpk]"); if (!b) return; T[b.dataset.dpk] = b.checked;
      var tr = b.closest("tr"); tr && tr.classList.toggle("del", b.checked); setDelBtn(all.filter(isT).length); };
    document.getElementById("dpaTickAll").onclick = function () {
      list.forEach(function (g) { g.rows.forEach(function (r) { if (!r.keep && !r.fba) T[kOf(r.a, r.e.sku)] = true; }); });
      c.querySelectorAll("[data-dpk]").forEach(function (b) { var on = !!T[b.dataset.dpk]; b.checked = on; var tr = b.closest("tr"); tr && tr.classList.toggle("del", on); });
      setDelBtn(all.filter(isT).length); };
    document.getElementById("dpaDel").onclick = function () { delAll(all.filter(isT), G); };
  }
  async function delAll(list, G) {
    if (!list.length) return;
    var T = AX.ticked, Qd = AX.queued;
    var empty = G.filter(function (g) { return !g.rows.some(function (r) { var k = kOf(r.a, r.e.sku); return !T[k] && !Qd[k]; }); });
    if (empty.length) { typeof spToast === "function" && spToast("⚠ Keep at least one listing for every ASIN — " + empty.length + " ASIN(s) would be removed from all accounts", true); return; }
    var per = {}; list.forEach(function (r) { per[r.a] = (per[r.a] || 0) + 1; });
    var lines = Object.keys(per).map(function (a) { return "• " + acctName(a) + ": " + per[a]; }).join("\n");
    var ok = typeof askPremiumConfirm === "function" ? await askPremiumConfirm({ kicker: "Delete duplicates across accounts", title: list.length + " listing" + (list.length > 1 ? "s" : "") + " · " + Object.keys(per).length + " account" + (Object.keys(per).length > 1 ? "s" : ""),
      message: "These SKUs will be DELETED from Amazon at each account's next sync (about 15 min). This cannot be undone.\n\n" + lines + "\n\nAlso remove the deleted SKUs from OMS Guru if they are linked there.", confirmLabel: "Delete " + list.length + " from Amazon" }) : confirm("Delete " + list.length + " listings from Amazon?");
    if (!ok) return;
    try {
      for (var i = 0; i < list.length; i += 400) {
        var b = fbDb.batch();
        list.slice(i, i + 400).forEach(function (r) {
          b.set(fbDb.collection("spapiListingDeletions").doc(r.a + "_" + String(r.e.sku).replace(/\//g, "%2F")), { account: r.a, sku: r.e.sku, name: r.e.name || null, asin: r.e.asin || null,
            status: "pending", source: "duplicate-cross-account", requestedAt: firebase.firestore.FieldValue.serverTimestamp() });
          Qd[kOf(r.a, r.e.sku)] = 1; if (r.a === acct()) queued[r.e.sku] = 1;
        });
        await b.commit();
      }
      typeof spToast === "function" && spToast("✓ " + list.length + " listings queued — deleted on Amazon at each account's next sync");
    } catch (e) { typeof spToast === "function" && spToast("⚠ Not all queued: " + (e.message || e), true); }
    drawAll();
  }

  /* Listing date on every normal inventory row */
  function addDates() {
    var c = document.getElementById("spapiInventoryTable_cards"); if (!c || typeof invBySku === "undefined") return;
    c.querySelectorAll("tr[data-sku]").forEach(function (tr) {
      if (tr.dataset.ld) return; tr.dataset.ld = "1";
      var it = invBySku.get(tr.dataset.sku), info = tr.querySelector(".pinfo");
      if (it && it.openDate && info) info.insertAdjacentHTML("beforeend", '<div class="lst-date"><i class="ti ti-calendar"></i> Listed ' + esc(fmtDate(it.openDate)) + "</div>");
    });
  }

  function setup() {
    var orig = window.renderInventoryCards;
    window.renderInventoryCards = function () {
      if (typeof spapiKpiFilter !== "undefined" && spapiKpiFilter === "duplicate") {
        if (mode === "all") { drawAll(); return; }
        drawDup(); loadQueued().then(drawDup); return;
      }
      orig.apply(this, arguments); addDates();
    };
    var sa = window.setSpapiAccount;
    if (typeof sa === "function") window.setSpapiAccount = function (a) { queuedFor = null; ticked = {}; q = ""; AX.data = null; return sa.apply(this, arguments); };
    if (typeof spDirty !== "undefined") { spDirty.inventory = true; try { spRender(); } catch (e) {} }
  }
  boot();
})();
