/* ===== Amazon page (dalbhaat.in/pages/amazon) · Add ASIN window: search by product name + bulk listing =====
   Loaded by one <script> line at the end of the Shopify template page.amazon.liquid.
   Searches the LOTS catalogue by name; ticked products are queued for the Add ASIN robot
   (spapi-sync.js applyAddAsinRequests) by barcode, or by ASIN when there is no barcode.
   Already-listed products are relisted by the robot (new SKU, old SKU deleted). */
(function () {
  if (window.__aaNameSearch) return; window.__aaNameSearch = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var acct = function () { try { return spapiCurrentAccount; } catch (e) { return "praso"; } };
  var toast = function (m, b) { try { spToast(m, b); } catch (e) { alert(m); } };
  // Page globals (declared with let/function in the page's own script - shared by all classic scripts)
  var G = {
    inv: function () { return typeof spapiInventoryRaw !== "undefined" ? spapiInventoryRaw : []; },
    lots: function () { return typeof lotsVendor !== "undefined" ? lotsVendor : null; },
    load: function () { return typeof loadLotsCatalog === "function" ? loadLotsCatalog : null; },
    prices: function () { return typeof lotsPriceByCode !== "undefined" ? lotsPriceByCode : {}; },
    db: function () { return typeof fbDbSpapi !== "undefined" ? fbDbSpapi : null; }
  };

  function init() {
    var ov = $("aaOv"), form = ov && ov.querySelector(".aa-form");
    if (!form || $("aaName")) return !!form;
    var css = document.createElement("style");
    css.textContent = ".aa-srch{display:flex;gap:8px;align-items:center;padding:12px 22px;border-bottom:1px solid var(--line-2)}" +
      ".aa-srch input{flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;padding:9px 12px;font:13px 'Inter',sans-serif;color:var(--ink);outline:none}" +
      ".aa-srch input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.15)}" +
      ".aa-res{max-height:34vh;overflow:auto;border-bottom:1px solid var(--line-2);display:none}" +
      ".aa-ri{display:flex;align-items:center;gap:10px;padding:8px 22px;border-bottom:1px solid var(--line-2);cursor:pointer;font-size:12.5px}" +
      ".aa-ri:hover{background:var(--cream)}.aa-ri.off{opacity:.5;cursor:not-allowed}.aa-ri.on{background:var(--gold-soft)}" +
      ".aa-ri input{width:16px;height:16px;accent-color:var(--navy);flex:none}" +
      ".aa-ri img,.aa-ri .aa-noimg{width:36px;height:36px;object-fit:contain;border:1px solid var(--line);border-radius:7px;background:#fff;flex:none}" +
      ".aa-ri .aa-rn{flex:1;min-width:0}.aa-ri .aa-rn b{display:block;color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".aa-ri .aa-rn span{color:var(--muted);font-size:11.5px}" +
      "@media(max-width:860px){.aa-srch{flex-wrap:wrap}.aa-srch input{flex-basis:100%}}";
    document.head.appendChild(css);
    form.insertAdjacentHTML("afterend",
      '<div class="aa-srch"><input id="aaName" type="text" placeholder="Or search by product name — e.g. tata salt 1kg (LOTS catalogue)" autocomplete="off">' +
      '<button type="button" class="aa-scan" id="aaSelAll">Select all</button><button type="button" class="aa-go" id="aaBulk">＋ List selected (0)</button></div>' +
      '<div class="aa-res" id="aaRes"></div>');
    var rule = ov.querySelector(".aa-rule");
    if (rule) rule.insertAdjacentHTML("beforeend", '<br><b>Already listed?</b> The robot <b>relists</b> it: a fresh listing with a new SKU, then the old SKU is deleted (FBA listings are never touched). ' +
      '<b>Product name</b>: search, tick the products, press <b>List selected</b>.');

    var pick = new Map(), hits = [], sT = null;
    var bcRe = /^\d{8}$|^\d{12,14}$/, isBc = function (t) { return bcRe.test(t); };
    var keyOf = function (p) { return p.barcode ? String(p.barcode).replace(/\D/g, "") : (p.asin ? String(p.asin).toUpperCase() : ""); };
    var okKey = function (k) { return isBc(k) || /^[A-Z0-9]{10}$/.test(k); };
    var bulkBtn = function () { $("aaBulk").textContent = "＋ List selected (" + pick.size + ")"; };
    var listed = function () { var s = new Set(); (G.inv() || []).forEach(function (x) { x && x.asin && s.add(String(x.asin).toUpperCase()); }); return s; };

    async function search() {
      var q = $("aaName").value.trim().toLowerCase(), box = $("aaRes");
      if (q.length < 2) { box.style.display = "none"; box.innerHTML = ""; hits = []; return; }
      box.style.display = "block";
      var lv = G.lots();
      if (!lv) { box.innerHTML = '<div class="aa-empty">Product list not available on this page.</div>'; return; }
      if (!lv.products) {
        box.innerHTML = '<div class="aa-empty">Loading LOTS catalogue…</div>';
        try { var ld = G.load(); ld && await ld(); } catch (e) {}
        if (!lv.products) { box.innerHTML = '<div class="aa-empty">Could not load the LOTS catalogue — check internet.</div>'; return; }
      }
      var qt = q.split(/\s+/).filter(Boolean), L = listed(), prices = G.prices() || {};
      hits = lv.products.filter(function (p) {
        if (!p || !p.name) return false;
        var t = (p.name + " " + (p.brand || "") + " " + (p.code || "") + " " + (p.barcode || "")).toLowerCase();
        return qt.every(function (w) { return t.indexOf(w) >= 0; });
      }).map(function (p) { var k = keyOf(p); return { p: p, k: k, ok: okKey(k), listed: !!(p.asin && L.has(String(p.asin).toUpperCase())) }; })
        .sort(function (a, b) { return (b.ok - a.ok) || a.p.name.localeCompare(b.p.name); }).slice(0, 80);
      if (!hits.length) { box.innerHTML = '<div class="aa-empty">No product matches — try fewer words.</div>'; return; }
      box.innerHTML = hits.map(function (h, i) {
        var pr = prices[h.p.code] || {}, mrp = parseFloat(pr.mrp || h.p.mrp), st = parseFloat(pr.qty), im = pr.img || h.p.img;
        var img = im ? '<img src="' + esc(im) + '" loading="lazy" alt="">' : '<span class="aa-noimg"></span>';
        var info = [h.p.barcode ? "▥ " + esc(h.p.barcode) : "", h.p.asin ? esc(h.p.asin) : "", mrp > 0 ? "MRP ₹" + mrp : "",
          isNaN(st) ? "" : (st > 0 ? st + " in stock" : "Out of stock")].filter(Boolean).join(" · ");
        var tag = !h.ok ? '<span class="pill na">No barcode / ASIN</span>' : h.listed ? '<span class="pill warn">Listed · will relist</span>' : "";
        var on = pick.has(h.k);
        return '<label class="aa-ri' + (h.ok ? "" : " off") + (on ? " on" : "") + '" data-i="' + i + '"><input type="checkbox" ' + (h.ok ? "" : "disabled ") + (on ? "checked" : "") + ">" + img +
          '<div class="aa-rn"><b>' + esc(h.p.name) + "</b><span>" + (info || "Code " + esc(h.p.code)) + "</span></div>" + tag + "</label>";
      }).join("");
    }

    $("aaName").addEventListener("input", function () { clearTimeout(sT); sT = setTimeout(search, 200); });
    $("aaName").addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    $("aaRes").addEventListener("change", function (e) {
      var r = e.target.closest(".aa-ri"); if (!r) return; var h = hits[+r.dataset.i]; if (!h || !h.ok) return;
      if (e.target.checked) pick.set(h.k, h.p); else pick.delete(h.k);
      r.classList.toggle("on", e.target.checked); bulkBtn();
    });
    $("aaSelAll").onclick = function () {
      var ok = hits.filter(function (h) { return h.ok; }); if (!ok.length) return toast("Search a product name first", true);
      var all = ok.every(function (h) { return pick.has(h.k); });
      ok.forEach(function (h) { all ? pick.delete(h.k) : pick.set(h.k, h.p); }); search(); bulkBtn();
    };
    $("aaBulk").onclick = async function () {
      if (!pick.size) return toast("Tick one or more products first", true);
      var db = G.db(); if (!db) return toast("Not connected — reload the page", true);
      var qty = Math.max(1, parseInt($("aaQty").value) || 10), b = $("aaBulk"), items = Array.from(pick.entries());
      b.classList.add("busy");
      try {
        for (var i = 0; i < items.length; i += 400) {
          var batch = db.batch();
          items.slice(i, i + 400).forEach(function (e) {
            var k = e[0], p = e[1], bc = isBc(k);
            batch.set(db.collection("spapiAddAsin").doc(acct() + "_" + (bc ? "bc_" : "") + k), { account: acct(), asin: bc ? "" : k, barcode: bc ? k : null, name: p.name || null,
              qty: qty, cost: null, mrp: null, gst: null, status: "pending", requestedAt: Date.now(), error: null, price: null, profit: null });
          });
          await batch.commit();
        }
        toast("✓ " + items.length + " product" + (items.length > 1 ? "s" : "") + " queued — the robot lists " + (items.length > 1 ? "them" : "it") + " at the next sync");
        pick.clear(); bulkBtn(); $("aaName").value = ""; search();
      } catch (e) { toast("⚠ Not saved: " + (e.message || e), true); } finally { b.classList.remove("busy"); }
    };
    return true;
  }
  if (!init()) { var n = 0, t = setInterval(function () { if (init() || ++n > 60) clearInterval(t); }, 500); }
})();
