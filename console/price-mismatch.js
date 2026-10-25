/* AIKM Admin Console — LOTS Products: "Price mismatch" button.
   Loaded by refund-tab.js (no Shopify edit needed).
   Shows only the products whose best price differs between LOTS-GN and LOTS-62.
   Order: mapped on Amazon (SP-API page) first, then biggest gap -> smallest.
   Also shows the LOTS-62 MRP on each card / table row (read once per LOTS-62 sync, kept in localStorage),
   and restyles the product cards (design "A": both MRPs, % off as a tag, one status line under the prices).
   LOTS-62 prices come from the copy the LOTS-62 add-on already keeps in this browser
   (localStorage "aikmLots62Cache"). Amazon mapping = aikm_admin/spapiAsinLotsMap, which the page
   already listens to; listening to the same doc again shares that listener (no extra reads). */
(function () {
  if (window.__aikmPriceMismatch) return; window.__aikmPriceMismatch = true;
  var CACHE_KEY = "aikmLots62Cache", by62 = {}, savedAt = null, on = false, btn = null, mapped = {};

  // LOTS item codes that are mapped to an Amazon ASIN (same rules as the page's own "Mapped on Amazon")
  (function watchMap() {
    if (typeof fbDb === "undefined" || !fbDb) return void setTimeout(watchMap, 2000);
    // main mapping record + overflow record (spapiAsinLotsMap2, used when the main one is full - 24 Oct 2026)
    var maps = { a: {}, b: {} };
    function rebuild() {
      var m = {};
      [maps.a, maps.b].forEach(function (map) { Object.keys(map).forEach(function (asin) {
        var r = map[asin]; if (!r) return;
        if (r.vendorName && String(r.vendorName).toUpperCase() !== "LOTS") return;
        var parts = Array.isArray(r.parts) && r.parts.length ? r.parts : (r.code ? [{ code: r.code }] : []);
        parts.forEach(function (x) { if (x && x.code) m[String(x.code)] = 1; });
      }); });
      mapped = m;
      if (on) redraw();
    }
    ["spapiAsinLotsMap", "spapiAsinLotsMap2"].forEach(function (id, k) {
      fbDb.collection("aikm_admin").doc(id).onSnapshot(function (d) { maps[k ? "b" : "a"] = (d.exists && d.data().map) || {}; rebuild(); },
        function (e) { console.warn("Price mismatch: Amazon mapping read failed", e); });
    });
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
  function inr(n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v) { var n = Number(v); return v == null || v === "" || isNaN(n) ? null : n; }
  function mrpHtml(p) {
    var m = mrp62[keyOf(p.code)]; if (m == null || isNaN(m)) return "";
    var gn = Number(p.mrp), diff = gn && Math.abs(gn - m) >= 0.01;
    return '<div class="pm-mrp' + (diff ? " diff" : "") + '"' + (diff ? ' title="LOTS-GN MRP ' + inr(gn) + '"' : "") + ">MRP " + inr(m) + (diff ? " ≠ GN" : "") + "</div>";
  }
  function pageList() {
    if (typeof getFilteredLotsProducts !== "function") return [];
    var size = typeof LOTS_PAGE_SIZE !== "undefined" ? LOTS_PAGE_SIZE : 50, pg = typeof lotsProductsPage !== "undefined" ? lotsProductsPage : 0;
    return getFilteredLotsProducts().slice(pg * size, pg * size + size);
  }
  // table: LOTS-62 MRP under the LOTS-62 price
  function put(el, p) {
    if (!el || !p) return;
    var h = mrpHtml(p), cur = el.querySelector(".pm-mrp");
    if (cur && cur.outerHTML === h) return;
    if (cur) cur.remove();
    if (h) el.insertAdjacentHTML("beforeend", h);
  }

  // ---------- cards: design "A" (both MRPs, one-line status footer, % off as a tag) ----------
  function cardA(card, p) {
    card.classList.add("ca");
    var a = best(p.slabs), gnM = num(p.mrp);
    // % off MRP tag next to the Amazon tag
    var off = gnM && a ? Math.round((1 - a / gnM) * 1000) / 10 : 0, tagTxt = off > 0 ? off + "% off MRP" : "";
    var bad = card.querySelector(".lx-cbadges"), tag = card.querySelector(".ca-off");
    if (tagTxt) {
      if (!bad) { bad = document.createElement("div"); bad.className = "lx-cbadges"; var nm = card.querySelector(".lx-name"); if (nm) nm.after(bad); else card.prepend(bad); }
      if (!tag) { tag = document.createElement("span"); tag.className = "lx-tag ca-off"; bad.appendChild(tag); }
      if (tag.textContent !== tagTxt) tag.textContent = tagTxt;
    } else if (tag) tag.remove();
    // compare box
    var cx = card.querySelector(".l62-card.cx"); if (!cx) return;
    var sig = p.code + "|" + (mrpAt || "") + "|" + savedAt;
    if (cx._ca === sig) return;
    cx._ca = sig;
    var cols = cx.querySelectorAll(".cx-col"), q = by62[keyOf(p.code)], m62 = q ? num(mrp62[keyOf(p.code)]) : null;
    var mDiff = gnM != null && m62 != null && Math.abs(gnM - m62) >= 0.01;
    function mrpLine(col, txt, cls, title) {
      if (!col || col.querySelector(".cx-na")) return;
      var el = col.querySelector(".ca-mrp");
      if (!el) { el = document.createElement("span"); var st = col.querySelector(".cx-st"); if (st) col.insertBefore(el, st); else col.appendChild(el); }
      el.className = "ca-mrp" + (cls ? " " + cls : ""); el.textContent = txt; if (title) el.title = title; else el.removeAttribute("title");
    }
    mrpLine(cols[0], gnM != null ? "MRP " + inr(gnM) : "MRP —");
    if (q) mrpLine(cols[1], m62 != null ? "MRP " + inr(m62) + (mDiff ? " ≠ GN" : "") : (Object.keys(mrp62).length ? "MRP —" : "MRP …"), mDiff ? "diff" : "", mDiff ? "LOTS-GN MRP " + inr(gnM) : "");
    // footer: price result on the left, chips on the right
    var foot = cx.querySelector(".cx-foot"); if (!foot) { foot = document.createElement("div"); foot.className = "cx-foot"; cx.appendChild(foot); }
    var b = q ? best(q.slabs) : null, left = "", lc = "", chips = [];
    if (!q) left = "Not at LOTS-62";
    else if (a != null && b != null) {
      var d = Math.round(Math.abs(a - b) * 100) / 100;
      if (d < 0.01) left = "Same price";
      else { left = (b < a ? "LOTS-62" : "LOTS-GN") + " cheaper by " + inr(d); lc = "win"; }
    }
    if (mDiff) chips.push(["red", "MRP differs " + inr(Math.round(Math.abs(gnM - m62) * 100) / 100)]);
    if (q) {
      var gnIn = p.qty == null || Number(p.qty) > 0, in62 = q.qty == null || Number(q.qty) > 0;
      if (gnIn && !in62) chips.push(["green", "Only GN in stock"]);
      else if (!gnIn && in62) chips.push(["gold", "Only 62 in stock"]);
      else if (!gnIn && !in62) chips.push(["red", "Out at both"]);
    }
    foot.innerHTML = '<span class="ca-left ' + lc + '">' + esc(left) + "</span>" + chips.map(function (c) { return '<span class="ca-chip ' + c[0] + '">' + esc(c[1]) + "</span>"; }).join("");
  }

  var tabObs = null;
  function paintMrp() {
    var grid = document.getElementById("lotsCards"), body = document.getElementById("lotsProductsBody");
    var cards = grid && grid.style.display !== "none" ? grid.querySelectorAll(".lx-card") : [];
    var rows = body && Object.keys(mrp62).length ? body.querySelectorAll("tr") : [];
    var needRows = [].some.call(rows, function (r) { return r.querySelector("td.l62-td .l62"); });
    if (!cards.length && !needRows) return;
    var page = pageList();
    [].forEach.call(cards, function (c, i) { if (page[i]) cardA(c, page[i]); });
    if (needRows) [].forEach.call(rows, function (r, i) { put(r.querySelector("td.l62-td .l62"), page[i]); });
    if (tabObs) tabObs.takeRecords(); // our own changes don't trigger another paint
  }
  var mrpT = null;
  function paintMrpSoon() { clearTimeout(mrpT); mrpT = setTimeout(paintMrp, 80); }
  (function watchTab() {
    var tab = document.getElementById("tab-lotsproducts");
    if (!tab) return void setTimeout(watchTab, 2000);
    tabObs = new MutationObserver(paintMrpSoon);
    tabObs.observe(tab, { childList: true, subtree: true });
    paintMrpSoon();
  })();

  (function () { var st = document.createElement("style"); st.textContent = [
    "#tab-lotsproducts .pm-btn{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 13px;border-radius:10px;border:1px solid var(--x-line,#e3e3e3);background:var(--x-surface,#fff);color:var(--x-text,#1d2433);font-family:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap}",
    "#tab-lotsproducts .pm-btn:hover{border-color:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn i{width:8px;height:8px;border-radius:50%;background:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn b{padding:2px 8px;border-radius:20px;background:var(--x-red-soft,#FDECEA);color:var(--x-red,#B42318);font-size:12px;font-variant-numeric:tabular-nums}",
    "#tab-lotsproducts .pm-btn.on{background:var(--x-red-soft,#FDECEA);border-color:var(--x-red,#B42318);color:var(--x-red,#B42318)}",
    "#tab-lotsproducts .pm-btn.on b{background:var(--x-red,#B42318);color:#fff}",
    "#tab-lotsproducts .pm-mrp{margin-top:3px;font-size:11px;font-weight:500;color:var(--x-muted,#8a8f98);white-space:nowrap}",
    "#tab-lotsproducts .pm-mrp.diff{color:var(--x-red,#B42318);font-weight:600}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca{padding:14px;gap:10px;border-radius:14px;overflow:hidden}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cimg{margin:-14px -14px 0;height:124px;border:0;border-bottom:1px solid var(--x-line-2);border-radius:0;background:#fff}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-name{font-size:13.5px;font-weight:600;line-height:1.35}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cbadges{gap:6px;margin-top:-2px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cbadges .lx-tag{border-radius:6px;padding:2px 8px;letter-spacing:.04em}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-tag.ca-off{background:var(--x-gold-soft);color:var(--x-gold);border:1px solid var(--x-gold-line);text-transform:none;letter-spacing:0}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cslabline{gap:0;flex-wrap:nowrap;border:1px solid var(--x-line);border-radius:10px;overflow:hidden}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cslabline span{flex:1 1 0;min-width:0;border:0;border-radius:0;border-right:1px solid var(--x-line);background:transparent;padding:6px 2px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cslabline span:last-child{border-right:0}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cslabline span.best{background:var(--x-gold-soft)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cslabline b{font-size:12.5px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cslabline i{font-size:10px;color:var(--x-muted)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .l62-card.cx{background:var(--x-surface);border:1px solid var(--x-line);border-radius:10px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-col{padding:9px 10px;gap:2px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-col + .cx-col{border-left:1px solid var(--x-line)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-k{font-size:9.5px;letter-spacing:.06em;white-space:nowrap}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-col b{font-size:16px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-mrp{font-size:10.5px;color:var(--x-text-2);white-space:nowrap}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-mrp.diff{color:var(--x-red);font-weight:600}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-st{display:flex;align-items:center;gap:5px;font-weight:500;font-size:11px}",
    'html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-st::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}',
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .cx-foot{flex-wrap:wrap;gap:5px 6px;padding:7px 10px;background:var(--x-surface-2);border-top:1px solid var(--x-line);white-space:normal}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-left{font-size:11px;color:var(--x-text-2);margin-right:auto;white-space:nowrap}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-left.win{color:var(--x-green);font-weight:600}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-chip{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:6px;white-space:nowrap}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-chip.green{background:var(--x-green-soft);color:var(--x-green)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-chip.gold{background:var(--x-gold-soft);color:var(--x-gold)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .ca-chip.red{background:var(--x-red-soft);color:var(--x-red)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .pm-mrp{display:none}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca > div[data-lxtip],html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-amz{background:none;border:0;border-top:1px dashed var(--x-line);border-radius:0;padding:10px 0 0;display:flex;flex-direction:column;gap:6px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca > div[data-lxtip] .lx-ours{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;margin:0}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cmeta{margin:auto -14px -14px;padding:10px 14px;background:var(--x-surface-2);border-top:1px solid var(--x-line);grid-template-columns:1fr 1.25fr;gap:8px 12px}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cmeta span{font-size:9px;color:var(--x-muted)}",
    "html body #tab-lotsproducts #lotsCards .lx-card.ca .lx-cmeta b{font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:500}"
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
