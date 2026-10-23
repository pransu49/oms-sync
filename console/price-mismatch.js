/* AIKM Admin Console — LOTS Products: "Price mismatch" button.
   Loaded by refund-tab.js (no Shopify edit needed).
   Shows only the products whose best price differs between LOTS-GN and LOTS-62.
   Order: mapped on Amazon (SP-API page) first, then biggest gap -> smallest.
   Also shows the LOTS-62 MRP on each card / table row (read once per LOTS-62 sync, kept in localStorage).
   LOTS-62 prices come from the copy the LOTS-62 add-on already keeps in this browser
   (localStorage "aikmLots62Cache"). Amazon mapping = aikm_admin/spapiAsinLotsMap, which the page
   already listens to; listening to the same doc again shares that listener (no extra reads). */
(function () {
  if (window.__aikmPriceMismatch) return; window.__aikmPriceMismatch = true;
  var CACHE_KEY = "aikmLots62Cache", by62 = {}, savedAt = null, on = false, btn = null, mapped = {};

  // LOTS item codes that are mapped to an Amazon ASIN (same rules as the page's own "Mapped on Amazon")
  (function watchMap() {
    if (typeof fbDb === "undefined" || !fbDb) return void setTimeout(watchMap, 2000);
    fbDb.collection("aikm_admin").doc("spapiAsinLotsMap").onSnapshot(function (d) {
      var map = (d.exists && d.data().map) || {}, m = {};
      Object.keys(map).forEach(function (asin) {
        var r = map[asin]; if (!r) return;
        if (r.vendorName && String(r.vendorName).toUpperCase() !== "LOTS") return;
        var parts = Array.isArray(r.parts) && r.parts.length ? r.parts : (r.code ? [{ code: r.code }] : []);
        parts.forEach(function (x) { if (x && x.code) m[String(x.code)] = 1; });
      });
      mapped = m;
      if (on) redraw();
    }, function (e) { console.warn("Price mismatch: Amazon mapping read failed", e); });
  })();
  function isMapped(p) { return !!mapped[String(p.code)]; }
  function rank(p) { return isMapped(p) ? 0 : 1; }

  function keyOf(c) { return String(c == null ? "" : c).trim().replace(/^0+(?=\d)/, ""); }
  function best(slabs) { return slabs && slabs.length ? Math.min.apply(null, slabs.map(function (s) { return Number(s.price); })) : null; }
  // price gap (₹) between LOTS-GN and LOTS-62, or null when it can't be compared / is the same
  function gap(p) {
    var q = by62[keyOf(p.code)]; if (!q) return null;
    var a = best(p.slabs), b = best(q.slabs);
    if (a == null || b == null || isNaN(a) || isNaN(b)) return null;
    var d = Math.round(Math.abs(a - b) * 100) / 100;
    return d >= 0.01 ? d : null;
  }
  function products() { return (typeof lotsVendor !== "undefined" && lotsVendor.products) || []; }
  function count() { var n = 0; products().forEach(function (p) { if (gap(p) != null) n++; }); return n; }

  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!c || !c.products || c.savedAt === savedAt) return false;
      savedAt = c.savedAt; by62 = {};
      c.products.forEach(function (p) { by62[keyOf(p.code)] = p; });
      loadMrp();
      return true;
    } catch (e) { return false; }
  }

  // ---------- LOTS-62 MRP (the LOTS-62 add-on's browser copy has no MRP, so keep our own small copy) ----------
  var MRP_KEY = "aikmLots62Mrp", mrp62 = {}, mrpAt = null, mrpBusy = false;
  function loadMrp() {
    if (!savedAt || mrpAt === savedAt || mrpBusy) return;
    try { var c = JSON.parse(localStorage.getItem(MRP_KEY) || "null"); if (c && c.savedAt === savedAt && c.m) { mrp62 = c.m; mrpAt = savedAt; paintMrpSoon(); return; } } catch (e) {}
    if (typeof fbDb === "undefined" || !fbDb) return void setTimeout(loadMrp, 2000);
    mrpBusy = true; var want = savedAt;
    fbDb.collection("aikm_admin").doc("lots62Catalog").collection("chunks").get().then(function (snap) {
      var m = {};
      snap.forEach(function (d) { (d.data().products || []).forEach(function (p) { if (p && p.code != null && p.mrp != null) m[keyOf(p.code)] = Number(p.mrp); }); });
      mrp62 = m; mrpAt = want;
      try { localStorage.setItem(MRP_KEY, JSON.stringify({ savedAt: want, m: m })); } catch (e) {}
      paintMrpSoon();
    }).catch(function (e) { console.warn("LOTS-62 MRP read failed", e); }).then(function () { mrpBusy = false; });
  }
  function inr(n) { return "\u20B9" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function mrpHtml(p) {
    var m = mrp62[keyOf(p.code)]; if (m == null || isNaN(m)) return "";
    var gn = Number(p.mrp), diff = gn && Math.abs(gn - m) >= 0.01;
    return '<div class="pm-mrp' + (diff ? " diff" : "") + '"' + (diff ? ' title="LOTS-GN MRP ' + inr(gn) + '"' : "") + ">MRP " + inr(m) + (diff ? " \u2260 GN" : "") + "</div>";
  }
  function pageList() {
    if (typeof getFilteredLotsProducts !== "function") return [];
    var size = typeof LOTS_PAGE_SIZE !== "undefined" ? LOTS_PAGE_SIZE : 50, pg = typeof lotsProductsPage !== "undefined" ? lotsProductsPage : 0;
    return getFilteredLotsProducts().slice(pg * size, pg * size + size);
  }
  function put(el, p) {
    if (!el || !p) return;
    var h = mrpHtml(p), cur = el.querySelector(".pm-mrp");
    if (cur && cur.outerHTML === h) return;
    if (cur) cur.remove();
    if (h) el.insertAdjacentHTML("beforeend", h);
  }
  function paintMrp() {
    if (!Object.keys(mrp62).length) return;
    var grid = document.getElementById("lotsCards"), body = document.getElementById("lotsProductsBody");
    var cards = grid && grid.style.display !== "none" ? grid.querySelectorAll(".lx-card") : [];
    var rows = body ? body.querySelectorAll("tr") : [];
    var needCards = [].some.call(cards, function (c) { return c.querySelector(".l62-card .cx-col:nth-child(2)"); });
    var needRows = [].some.call(rows, function (r) { return r.querySelector("td.l62-td .l62"); });
    if (!needCards && !needRows) return;
    var page = pageList();
    [].forEach.call(cards, function (c, i) { put(c.querySelector(".l62-card .cx-col:nth-child(2)"), page[i]); });
    [].forEach.call(rows, function (r, i) { put(r.querySelector("td.l62-td .l62"), page[i]); });
  }
  var mrpT = null;
  function paintMrpSoon() { clearTimeout(mrpT); mrpT = setTimeout(paintMrp, 120); }
  (function watchTab() {
    var tab = document.getElementById("tab-lotsproducts");
    if (!tab) return void setTimeout(watchTab, 2000);
    new MutationObserver(function (list) {
      // ignore our own MRP lines, so we don't loop
      if (list.every(function (m) { return [].every.call(m.addedNodes, function (n) { return n.classList && n.classList.contains("pm-mrp"); }) && [].every.call(m.removedNodes, function (n) { return n.classList && n.classList.contains("pm-mrp"); }); })) return;
      paintMrpSoon();
    }).observe(tab, { childList: true, subtree: true });
  })();

  (function () { var st = document.createElement("style"); st.textContent = [
    "#tab-lotsproducts .pm-btn{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 13px;border-radius:10px;border:1px solid var(--x-line,#e3e3e3);background:var(--x-surface,#fff);color:var(--x-text,#1d2433);font-family:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap}",
    "#tab-lotsproducts .pm-btn:hover{border-color:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn i{width:8px;height:8px;border-radius:50%;background:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn b{padding:2px 8px;border-radius:20px;background:var(--x-red-soft,#FDECEA);color:var(--x-red,#B42318);font-size:12px;font-variant-numeric:tabular-nums}",
    "#tab-lotsproducts .pm-btn.on{background:var(--x-red-soft,#FDECEA);border-color:var(--x-red,#B42318);color:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn.on b{background:var(--x-red,#B42318);color:#fff}",
    "#tab-lotsproducts .pm-mrp{margin-top:3px;font-size:11px;font-weight:500;color:var(--x-muted,#8a8f98);white-space:nowrap}",
    "#tab-lotsproducts .pm-mrp.diff{color:var(--x-red,#B42318);font-weight:600}"
  ].join("\n"); document.head.appendChild(st); })();

  function paint() {
    if (!btn) return;
    var ready = Object.keys(by62).length && products().length;
    btn.classList.toggle("on", on);
    btn.title = on ? "Showing price mismatches: Amazon-mapped first, then biggest gap to smallest. Click to show all." : "Show products priced differently at LOTS-GN and LOTS-62";
    btn.innerHTML = "<i></i>Price mismatch" + (ready ? "<b>" + count().toLocaleString("en-IN") + "</b>" : "") + (on ? " ✕" : "");
  }
  function redraw() {
    if (typeof lotsProductsPage !== "undefined") lotsProductsPage = 0;
    if (typeof renderLotsProductsTable === "function") renderLotsProductsTable();
    paint();
  }

  // add the filter on top of all the other filters (search, brand, KPI tiles, LOTS-62 dropdown)
  function wrap() {
    if (typeof getFilteredLotsProducts !== "function" || getFilteredLotsProducts.__pm) return;
    var orig = getFilteredLotsProducts;
    getFilteredLotsProducts = function () {
      var list = orig.apply(this, arguments);
      if (!on) return list;
      return list.filter(function (p) { return gap(p) != null; }).sort(function (a, b) { return rank(a) - rank(b) || gap(b) - gap(a); });
    };
    getFilteredLotsProducts.__pm = true;
  }

  (function place() {
    var anchor = document.getElementById("lots62Filter") || document.getElementById("lotsBrandFilter");
    if (!anchor) return void setTimeout(place, 1500);
    wrap();
    readCache(); loadMrp();
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "pm-btn"; btn.id = "lotsPriceMismatch";
    anchor.insertAdjacentElement("afterend", btn);
    btn.addEventListener("click", function () {
      if (!on && !Object.keys(by62).length) { readCache(); if (!Object.keys(by62).length) { alert("LOTS-62 prices are still loading. Try again in a few seconds."); return; } }
      on = !on; wrap(); redraw();
    });
    paint();
    // pick up new LOTS-62 prices after its daily sync (and the first download on a new browser)
    setInterval(function () { if (readCache()) { if (on) redraw(); else paint(); } else if (btn && !btn.querySelector("b")) paint(); }, 5000);
  })();
})();
