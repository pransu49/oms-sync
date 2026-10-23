/* AIKM Admin Console — LOTS Products: "Price mismatch" button.
   Loaded by refund-tab.js (no Shopify edit needed).
   Shows only the products whose best price differs between LOTS-GN and LOTS-62, biggest gap first.
   LOTS-62 prices come from the copy the LOTS-62 add-on already keeps in this browser
   (localStorage "aikmLots62Cache"), so this costs no extra Firebase reads. */
(function () {
  if (window.__aikmPriceMismatch) return; window.__aikmPriceMismatch = true;
  var CACHE_KEY = "aikmLots62Cache", by62 = {}, savedAt = null, on = false, btn = null;

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
      return true;
    } catch (e) { return false; }
  }

  (function () { var st = document.createElement("style"); st.textContent = [
    "#tab-lotsproducts .pm-btn{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 13px;border-radius:10px;border:1px solid var(--x-line,#e3e3e3);background:var(--x-surface,#fff);color:var(--x-text,#1d2433);font-family:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap}",
    "#tab-lotsproducts .pm-btn:hover{border-color:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn i{width:8px;height:8px;border-radius:50%;background:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn b{padding:2px 8px;border-radius:20px;background:var(--x-red-soft,#FDECEA);color:var(--x-red,#B42318);font-size:12px;font-variant-numeric:tabular-nums}",
    "#tab-lotsproducts .pm-btn.on{background:var(--x-red-soft,#FDECEA);border-color:var(--x-red,#B42318);color:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn.on b{background:var(--x-red,#B42318);color:#fff}"
  ].join("\n"); document.head.appendChild(st); })();

  function paint() {
    if (!btn) return;
    var ready = Object.keys(by62).length && products().length;
    btn.classList.toggle("on", on);
    btn.title = on ? "Showing price mismatches (biggest gap first). Click to show all." : "Show products priced differently at LOTS-GN and LOTS-62";
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
      return list.filter(function (p) { return gap(p) != null; }).sort(function (a, b) { return gap(b) - gap(a); });
    };
    getFilteredLotsProducts.__pm = true;
  }

  (function place() {
    var anchor = document.getElementById("lots62Filter") || document.getElementById("lotsBrandFilter");
    if (!anchor) return void setTimeout(place, 1500);
    wrap();
    readCache();
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
