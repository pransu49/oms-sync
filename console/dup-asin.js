/* AIKM · Amazon page · Inventory (owner, 12 Nov 2026)
   1. "Duplicate ASINs" tile -> listings grouped by ASIN (same ASIN together), one "KEEP" per ASIN
      (most units sold in 30 days, then most stock, then oldest listing). Tick the rest and delete them in bulk:
      queued in main-Firebase `spapiListingDeletions` (1 write each); the sync robot deletes them on Amazon (max 200 per run).
   2. Every inventory row shows when the listing was created on Amazon (`openDate` from the listings report).
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
    ".dpa-cb{width:16px;height:16px;accent-color:var(--red);cursor:pointer}.lst-date{font-size:10.5px;color:var(--muted);margin-top:3px}";
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
    c.innerHTML = '<div class="ap-tools"><div class="ap-search"><i class="ti ti-search"></i><input type="text" id="dpaQ" placeholder="Search product, SKU or ASIN…" value="' + esc(q) + '"></div>' +
      '<span class="t-muted" style="font-size:12px">Same ASIN listed more than once. One <b>KEEP</b> per ASIN (most sold, then most stock, then oldest); the others are ticked.</span>' +
      '<button type="button" class="dpa-del" id="dpaDel"' + (nTick ? "" : " disabled") + '><i class="ti ti-trash"></i>Delete ' + nTick + " ticked from Amazon</button>" +
      '<span class="ap-count">' + list.length + " ASINs · " + all.length + " listings" + (nQ ? " · " + nQ + " queued" : "") + "</span></div>" +
      (typeof spFilterBar === "function" ? spFilterBar("duplicate ASINs", list.length + " ASINs", "spapiKpiFilter=null;renderSpapiKpis();renderInventoryCards()") : "") +
      '<div class="ap-scroll"><table class="sp-tbl"><thead><tr><th></th><th>SKU</th><th>Listed on</th><th>Amazon stock</th><th>Price</th><th>Sold 30d</th><th>Shipping</th><th>Action</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      (list.length ? "" : (typeof spEmpty === "function" ? spEmpty("ti-circle-check", "No duplicate ASINs", "Every in-stock ASIN has one listing.") : "")) + "</div>";
    var qi = document.getElementById("dpaQ");
    qi.oninput = function (ev) { q = ev.target.value.toLowerCase(); drawDup(); var x = document.getElementById("dpaQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); };
    c.onchange = function (ev) { var b = ev.target.closest("[data-dpa]"); if (!b) return; ticked[b.dataset.dpa] = b.checked; drawDup(); };
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
      if (typeof spapiKpiFilter !== "undefined" && spapiKpiFilter === "duplicate") { drawDup(); loadQueued().then(drawDup); return; }
      orig.apply(this, arguments); addDates();
    };
    var sa = window.setSpapiAccount;
    if (typeof sa === "function") window.setSpapiAccount = function (a) { queuedFor = null; ticked = {}; q = ""; return sa.apply(this, arguments); };
    if (typeof spDirty !== "undefined") { spDirty.inventory = true; try { spRender(); } catch (e) {} }
  }
  boot();
})();
