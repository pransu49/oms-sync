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
    css.textContent = [
      "#aaOv{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(15,30,53,.55)!important}",
      ".aa-srch{display:flex;gap:10px;align-items:center;padding:14px 22px;border-bottom:1px solid var(--line-2);background:#fff}",
      ".aa-sbox{position:relative;flex:1;min-width:0}",
      ".aa-sbox svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--muted);pointer-events:none}",
      ".aa-sbox input{width:100%;box-sizing:border-box;height:44px;border:1px solid var(--line);border-radius:12px;padding:0 64px 0 42px;font:14px 'Inter',sans-serif;color:var(--ink);background:#FCFBF8;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}",
      ".aa-sbox input::placeholder{color:#9A9A92}",
      ".aa-sbox input:focus{background:#fff;border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,162,75,.14)}",
      ".aa-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#fff;font:600 10.5px ui-monospace,Menlo,monospace;color:var(--ink-2,#555);box-sizing:border-box}",
      ".aa-sbox .aa-kbd{position:absolute;right:12px;top:50%;transform:translateY(-50%)}",
      ".aa-bulk{all:unset;cursor:pointer;height:44px;padding:0 18px;border-radius:12px;background:var(--navy);color:#fff;font:600 13px 'Inter',sans-serif;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;transition:opacity .15s,transform .1s}",
      ".aa-bulk:hover{opacity:.92}.aa-bulk:active{transform:scale(.98)}.aa-bulk.dim{opacity:.38;pointer-events:none}.aa-bulk.busy{opacity:.6;pointer-events:none}",
      ".aa-bulk .aa-cnt{min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--gold);color:var(--navy);font-size:12px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}",
      ".aa-res{display:none;border-bottom:1px solid var(--line-2);background:#fff}",
      ".aa-rbar{display:flex;align-items:center;gap:14px;padding:9px 22px;font:500 12px 'Inter',sans-serif;color:var(--muted);border-bottom:1px solid var(--line-2);background:#FCFBF8}",
      ".aa-rbar b{color:var(--ink);font-weight:600}",
      ".aa-lnk{all:unset;cursor:pointer;color:var(--navy);font-weight:600}.aa-lnk:hover{text-decoration:underline}",
      ".aa-keys{margin-left:auto;display:flex;gap:12px;align-items:center;font-size:11px}.aa-keys span{display:inline-flex;gap:4px;align-items:center}",
      ".aa-rl{max-height:36vh;overflow:auto;padding:6px 10px}",
      ".aa-ri{display:flex;align-items:center;gap:14px;padding:10px 12px;margin:2px 0;border-radius:12px;cursor:pointer;border:1px solid transparent;position:relative;transition:background .12s,border-color .12s}",
      ".aa-ri:hover{background:#FAF8F3}",
      ".aa-ri.hi{background:#FAF8F3;border-color:var(--line)}",
      ".aa-ri.hi:before{content:'';position:absolute;left:-1px;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--gold)}",
      ".aa-ri.on{background:var(--gold-soft);border-color:rgba(201,162,75,.45)}",
      ".aa-ri.off{opacity:.45;cursor:not-allowed}",
      ".aa-ck{width:20px;height:20px;border-radius:6px;border:1.5px solid #C9C7BF;background:#fff;flex:none;display:flex;align-items:center;justify-content:center;transition:all .12s}",
      ".aa-ck svg{width:12px;height:12px;color:#fff;opacity:0}",
      ".aa-ri.on .aa-ck{background:var(--navy);border-color:var(--navy)}.aa-ri.on .aa-ck svg{opacity:1}",
      ".aa-ri .aa-im{width:46px;height:46px;border-radius:10px;border:1px solid var(--line-2);background:#fff;flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden}",
      ".aa-ri .aa-im img{width:100%;height:100%;object-fit:contain;padding:3px;box-sizing:border-box}",
      ".aa-rn{flex:1;min-width:0}",
      ".aa-rn b{display:block;font:600 13.5px 'Inter',sans-serif;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px}",
      ".aa-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font:12px 'Inter',sans-serif;color:var(--muted)}",
      ".aa-meta .mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:.02em}",
      ".aa-meta .mrp{color:var(--ink);font-weight:600}",
      ".aa-dot{display:inline-flex;align-items:center;gap:5px}.aa-dot:before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}",
      ".aa-dot.in{color:var(--green,#2E7D4F)}.aa-dot.out{color:var(--red,#B4382F)}",
      ".aa-tag{flex:none;font:600 11px 'Inter',sans-serif;padding:4px 10px;border-radius:20px;white-space:nowrap}",
      ".aa-tag.re{background:#FFF4DE;color:#9A6A12}.aa-tag.no{background:#F1F0EC;color:var(--muted)}",
      ".aa-pr{flex:none;text-align:right;min-width:150px;font:12px 'Inter',sans-serif;color:var(--muted);line-height:1.5}",
      ".aa-pr b{color:var(--ink);font-weight:600}.aa-pr .lo{color:var(--red,#B4382F);font-weight:600}.aa-pr .gd{color:var(--green,#2E7D4F);font-weight:600}",
      ".aa-yp{flex:none;display:flex;align-items:center;gap:4px;height:34px;padding:0 10px;border:1px solid var(--line);border-radius:9px;background:#fff;font:600 12px 'Inter',sans-serif;color:var(--muted);cursor:text}",
      ".aa-yp input{all:unset;width:64px;font:600 13px 'Inter',sans-serif;color:var(--ink)}.aa-yp input::placeholder{color:#AAA;font-weight:500}",
      ".aa-yp:focus-within{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.15)}.aa-yp.bad{border-color:var(--red,#B4382F);color:var(--red,#B4382F)}",
      ".aa-msg{padding:28px 20px;text-align:center;color:var(--muted);font:13px 'Inter',sans-serif}",
      ".aa-help{all:unset;cursor:pointer;font:600 12px 'Inter',sans-serif;color:var(--navy);padding:10px 22px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--line-2)}",
      ".aa-help:hover{background:#FAF8F3}",
      "@media(max-width:860px){.aa-ri{flex-wrap:wrap}.aa-pr{min-width:0;text-align:left;flex:1;padding-left:34px}.aa-srch{flex-wrap:wrap}.aa-sbox{flex-basis:100%}.aa-bulk{flex:1;justify-content:center}.aa-keys,.aa-sbox .aa-kbd{display:none}}"
    ].join("");
    document.head.appendChild(css);
    var CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.4 2.3 4.6-5"/></svg>';
    form.insertAdjacentHTML("afterend",
      '<div class="aa-srch"><div class="aa-sbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="aaName" type="text" placeholder="Search products by name, brand or barcode…" autocomplete="off" spellcheck="false"><span class="aa-kbd" title="Press / to search">/</span></div>' +
      '<button type="button" class="aa-bulk dim" id="aaBulk" title="List the selected products (Ctrl + Enter)">List selected <span class="aa-cnt" id="aaCnt">0</span></button></div>' +
      '<div class="aa-res" id="aaRes"><div class="aa-rbar" id="aaBar"></div><div class="aa-rl" id="aaRl"></div></div>');
    var rule = ov.querySelector(".aa-rule");
    if (rule) {
      // The page's own text still says Rs 15 / Rs 20 - the robot now wins the Buy Box down to Rs 5 profit (24 Oct 2026)
      rule.innerHTML = rule.innerHTML
        .replace(/if that still earns <b>₹15\+ per order<\/b>, otherwise the price that earns <b>₹20 per order<\/b>/, "if that still earns <b>₹15 or 10% per order</b> (never below cost), otherwise the lowest price that does")
        .replace(/can't earn ₹15 are not listed/, "can't earn ₹15 or 10% are not listed");
      rule.insertAdjacentHTML("beforeend", '<br><b>Already listed?</b> The robot <b>relists</b> it: a fresh listing with a new SKU, then the old SKU is deleted (FBA listings are never touched). ' +
        '<b>Product name</b>: search, select products (click or <b>Enter</b>), then <b>List selected</b> (<b>Ctrl + Enter</b>).');
      rule.style.display = "none";
      rule.insertAdjacentHTML("beforebegin", '<button type="button" class="aa-help" id="aaHelp">ⓘ How the robot lists &amp; prices products <span id="aaHelpA">▾</span></button>');
      $("aaHelp").onclick = function () { var o = rule.style.display === "none"; rule.style.display = o ? "" : "none"; $("aaHelpA").textContent = o ? "▴" : "▾"; };
    }

    var pick = new Map(), hits = [], hi = -1, sT = null, lastQ = "", nav = false;   // nav: moving with arrows -> Space selects
    var bcRe = /^\d{8}$|^\d{12,14}$/, isBc = function (t) { return bcRe.test(t); };
    var keyOf = function (p) { return p.barcode ? String(p.barcode).replace(/\D/g, "") : (p.asin ? String(p.asin).toUpperCase() : ""); };
    var okKey = function (k) { return isBc(k) || /^[A-Z0-9]{10}$/.test(k); };
    var listedFor = null, listedSet = new Set();
    var listed = function () { var inv = G.inv() || []; if (listedFor === inv) return listedSet; listedFor = inv; listedSet = new Set();
      inv.forEach(function (x) { x && x.asin && listedSet.add(String(x.asin).toUpperCase()); }); return listedSet; };
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    var K = function (t) { return '<span class="aa-kbd">' + t + "</span>"; };

    /* ---- Pricing: same maths as the robot (spapi-sync.js orderProfit), for a new 0.5 kg listing ---- */
    var TGT_P = 20, RULE = "₹15 or 10%";   // same as the robot: profit >= Rs 15 OR 10% of the order (price + shipping), never below cost
    var selfShip = function () { return acct() === "sastastore"; };
    var shipChg = function () { return selfShip() ? 74 : 80; };              // shipping charge the customer pays
    var shipCost = function () { return selfShip() ? 40 : 55; };             // our courier / Easy Ship cost
    var fee = function (p) { return (p > 1000 ? p * 0.08 : 0) + (p <= 300 ? 2 : p <= 500 ? 23 : p <= 1000 ? 48 : 79); };
    function profitAt(cost, p, gstPct) { var r = (gstPct != null && !isNaN(gstPct) ? +gstPct : 5) / 100;
      return Math.round(p + 0.85 * shipChg() - cost - shipCost() - fee(p) - (r > 0 ? (p - cost) * r / (1 + r) : 0) - 3); }
    function minAt(p) { return Math.min(15, 0.10 * (p + shipChg())); }
    function okAt(cost, p, gstPct) { return p >= cost && profitAt(cost, p, gstPct) >= minAt(p); }
    function floorFor(cost, gstPct) { for (var p = Math.max(1, Math.ceil(cost)); p < cost * 4 + 500; p++) if (okAt(cost, p, gstPct)) return p; return null; }
    function priceFor(cost, gstPct, want) { for (var p = Math.max(1, Math.floor(cost)); p < cost * 4 + 500; p++) if (profitAt(cost, p, gstPct) >= want) return p; return null; }
    function costOf(p) { var pr = G.prices()[p.code] || {}, sl = (pr.slabs || p.slabs || []), b = null;
      sl.forEach(function (x) { var v = +x.price; if (v > 0 && (b == null || v < b)) b = v; }); return b; }
    var priceCache = new Map(), priceCacheFor = null;
    function pricing(p) {
      var key = acct() + "|" + p.code;
      if (priceCacheFor !== G.prices()) { priceCache.clear(); priceCacheFor = G.prices(); }
      if (!priceCache.has(key)) priceCache.set(key, pricingRaw(p));
      return priceCache.get(key);
    }
    function pricingRaw(p) {
      var pr = G.prices()[p.code] || {}, cost = costOf(p), mrp = parseFloat(pr.mrp || p.mrp),
        gst = pr.gst != null && pr.gst !== "" ? +pr.gst : (p.gst != null && p.gst !== "" ? +p.gst : null);
      if (!(cost > 0)) return { cost: null, mrp: mrp > 0 ? mrp : null };
      var mn = floorFor(cost, gst), tg = priceFor(cost, gst, TGT_P);
      return { cost: cost, mrp: mrp > 0 ? mrp : null, gst: gst, min: mn, tgt: tg, loss: mn == null || (mrp > 0 && mn > mrp) };
    }
    // Check a typed price: below the rule (Rs 15 or 10%, never below cost) -> red box + note (the robot would refuse it)
    function checkPrice(h, sel) {
      var v = parseFloat(sel.price); sel.bad = false; sel.note = "";
      if (!(v > 0)) return;
      var P = h.P || pricing(h.p);
      if (P.mrp && v > P.mrp) { sel.note = "Above MRP — robot uses ₹" + Math.floor(P.mrp); return; }
      if (P.cost != null) { var pf = profitAt(P.cost, Math.floor(v), P.gst); sel.note = "Profit ₹" + pf + "/order"; if (!okAt(P.cost, Math.floor(v), P.gst)) { sel.bad = true; sel.note = (Math.floor(v) < P.cost ? "Below cost" : "Only ₹" + pf + "/order") + " — min ₹" + P.min; } }
    }

    function bulkBtn() { $("aaCnt").textContent = pick.size; $("aaBulk").classList.toggle("dim", !pick.size); drawBar(); }
    function drawBar() {
      var bar = $("aaBar"); if (!bar || !hits.length) return;
      var ok = hits.filter(function (h) { return h.ok; }), all = ok.length && ok.every(function (h) { return pick.has(h.k); });
      bar.innerHTML = "<span><b>" + hits.length + "</b> result" + (hits.length > 1 ? "s" : "") + ((hits.total || 0) > hits.length ? " of " + hits.total + " — type more to narrow" : "") + "</span>" +
        (pick.size ? "<span><b>" + pick.size + "</b> selected</span>" : "") +
        (ok.length ? '<button type="button" class="aa-lnk" id="aaSelAll">' + (all ? "Unselect all" : "Select all") + "</button>" : "") +
        (pick.size ? '<button type="button" class="aa-lnk" id="aaClr">Clear</button>' : "") +
        '<span class="aa-keys"><span>' + K("↑") + K("↓") + " move</span><span>" + K("Space") + "/" + K("Enter") + " select</span><span>" + K("Tab") + " price</span><span>" + K(isMac ? "⌘" : "Ctrl") + K("A") + " all</span><span>" +
        K(isMac ? "⌘" : "Ctrl") + K("↵") + " list</span><span>" + K("Esc") + " clear</span></span>";
    }
    var rowEls = [];   // row elements of the current results (filled by renderRows)
    function setHi(i, scroll) {
      if (!rowEls.length) { hi = -1; return; }
      if (i >= rowEls.length - 3) moreRows();
      var old = rowEls[hi]; hi = Math.max(0, Math.min(rowEls.length - 1, i));
      if (old && old !== rowEls[hi]) old.classList.remove("hi");
      rowEls[hi].classList.add("hi");
      if (scroll !== false) rowEls[hi].scrollIntoView({ block: "nearest" });
    }
    // Update ONE row after (un)selecting: tick, price box, price text - the photo is not touched
    function updateRow(i) {
      var r = rowEls[i], h = hits[i]; if (!r || !h) return;
      var sel = pick.get(h.k), on = !!sel; if (r.classList.contains("on") === on && !on) return;
      r.classList.toggle("on", on);
      var yp = r.querySelector(".aa-yp");
      if (on && !yp) r.insertAdjacentHTML("beforeend", ypHtml(i, sel)); else if (!on && yp) yp.remove();
      var pr = r.querySelector(".aa-pr"); pr && (pr.innerHTML = priceHtml(h, sel));
    }
    function ypHtml(i, sel) { return '<label class="aa-yp' + (sel.bad ? " bad" : "") + '" title="Your selling price. Empty = robot prices it (₹1 under Buy Box, never below ₹15 or 10% profit)">₹<input data-yp="' + i + '" inputmode="decimal" placeholder="auto" value="' + esc(sel.price || "") + '"></label>'; }
    function toggle(i) {
      var h = hits[i]; if (!h || !h.ok) return;
      if (pick.has(h.k)) pick.delete(h.k); else pick.set(h.k, { p: h.p, price: "" });
      updateRow(i); bulkBtn();
    }
    function selectAll() {
      var ok = hits.filter(function (h) { return h.ok; }); if (!ok.length) return;
      var all = ok.every(function (h) { return pick.has(h.k); });
      ok.forEach(function (h) { all ? pick.delete(h.k) : (pick.has(h.k) || pick.set(h.k, { p: h.p, price: "" })); });
      hits.forEach(function (h, i) { updateRow(i); }); bulkBtn();
    }

    function priceHtml(h, sel) {
      var P = h.P;
      if (sel && sel.note) return 'Your price<br><span class="' + (sel.bad ? "lo" : "gd") + '">' + esc(sel.note) + "</span>";
      if (P.cost == null) return "Cost —<br>from mapping";
      var tg = P.tgt && (!P.mrp || P.tgt <= P.mrp) ? P.tgt : (P.mrp ? Math.floor(P.mrp) : P.tgt);
      return "Cost <b>₹" + P.cost.toFixed(2) + "</b>" + (P.gst != null ? " · GST " + P.gst + "%" : "") + "<br>" +
        (P.loss ? '<span class="lo">Can\'t earn ' + RULE + (P.mrp ? " under MRP" : "") + "</span>" :
          "Min <b>₹" + P.min + '</b> · Target <span class="gd">₹' + tg + "</span>");
    }
    // Re-render rows in place (keeps scroll + highlight) after selection changes
    function redrawRows() { hits.forEach(function (h, i) { updateRow(i); }); }
    // Search index: each product's lowercase text + key, built once per catalogue (not on every keystroke)
    var ixFor = null, ixList = [];
    function index(products) {
      if (ixFor === products && ixList.length) return ixList;
      ixFor = products; ixList = [];
      products.forEach(function (p) { if (!p || !p.name) return; var k = keyOf(p);
        ixList.push({ p: p, k: k, ok: okKey(k), t: (p.name + " " + (p.brand || "") + " " + (p.code || "") + " " + (p.barcode || "")).toLowerCase() }); });
      return ixList;
    }
    async function search() {
      var q = $("aaName").value.trim().toLowerCase(), box = $("aaRes"), rl = $("aaRl");
      rowEls = [];
      if (q.length < 2) { box.style.display = "none"; rl.innerHTML = ""; hits = []; hi = -1; lastQ = ""; return; }
      box.style.display = "block";
      var lv = G.lots();
      if (!lv) { $("aaBar").innerHTML = ""; rl.innerHTML = '<div class="aa-msg">Product list not available on this page.</div>'; return; }
      if (!lv.products) {
        $("aaBar").innerHTML = ""; rl.innerHTML = '<div class="aa-msg">Loading LOTS catalogue…</div>';
        try { var ld = G.load(); ld && await ld(); } catch (e) {}
        if (!lv.products) { rl.innerHTML = '<div class="aa-msg">Could not load the LOTS catalogue — check internet.</div>'; return; }
      }
      var qt = q.split(/\s+/).filter(Boolean), L = listed(), ix = index(lv.products), found = [];
      for (var n = 0; n < ix.length; n++) { var t = ix[n].t, ok = true; for (var w = 0; w < qt.length; w++) if (t.indexOf(qt[w]) < 0) { ok = false; break; } if (ok) found.push(ix[n]); }
      // Sort only what is shown: listable first, names starting with the search first, then A-Z (plain compare - fast)
      var q0 = qt[0], rank = function (x) { return (x.ok ? 0 : 2) + (x.t.indexOf(q0) === 0 ? 0 : 1); };
      var total = found.length, cmp = function (a, b) { return rank(a) - rank(b) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0); };
      if (total > 400) {   // many matches: pick the best 80 by rank without sorting everything
        var bk = [[], [], [], []]; found.forEach(function (x) { var r = rank(x); bk[r].length < 80 && bk[r].push(x); });
        found = bk[0].concat(bk[1], bk[2], bk[3]).slice(0, 80);
      }
      found.sort(cmp);
      hits = found.slice(0, 80).map(function (x) { var p = x.p; return { p: p, k: x.k, ok: x.ok, listed: !!(p.asin && L.has(String(p.asin).toUpperCase())) }; });
      hits.total = total;
      if (!hits.length) { $("aaBar").innerHTML = ""; rl.innerHTML = '<div class="aa-msg">No product matches “' + esc(q) + '” — try fewer words.</div>'; hi = -1; return; }
      renderRows();
      drawBar();
      setHi(q === lastQ && hi >= 0 ? hi : 0, false); lastQ = q;
    }
    // Draw rows in chunks of 30: the first chunk at once, more when you scroll / arrow near the end (keeps typing smooth)
    var CHUNK = 30;
    function renderRows() { $("aaRl").innerHTML = ""; rowEls = []; moreRows(); }
    function moreRows() {
      var from = rowEls.length; if (from >= hits.length) return false;
      var prices = G.prices() || {}, rl = $("aaRl");
      rl.insertAdjacentHTML("beforeend", hits.slice(from, from + CHUNK).map(function (h, j) { var i = from + j;
        var pr = prices[h.p.code] || {}, mrp = parseFloat(pr.mrp || h.p.mrp), st = parseFloat(pr.qty), im = pr.img || h.p.img;
        var img = '<span class="aa-im">' + (im ? '<img src="' + esc(im) + '" loading="lazy" alt="" onerror="this.remove()">' : "") + "</span>";
        var meta = [mrp > 0 ? '<span class="mrp">MRP ₹' + mrp + "</span>" : "",
          isNaN(st) ? "" : (st > 0 ? '<span class="aa-dot in">' + st + " in stock</span>" : '<span class="aa-dot out">Out of stock</span>'),
          h.p.barcode ? '<span class="mono">' + esc(h.p.barcode) + "</span>" : "", h.p.asin ? '<span class="mono">' + esc(h.p.asin) + "</span>" : "",
          !h.p.barcode && !h.p.asin ? "Code " + esc(h.p.code) : ""].filter(Boolean).join("");
        var tag = !h.ok ? '<span class="aa-tag no">No barcode / ASIN</span>' : h.listed ? '<span class="aa-tag re">Listed · will relist</span>' : "";
        h.P = pricing(h.p); var sel = pick.get(h.k);
        var prc = '<div class="aa-pr" data-pr="' + i + '">' + priceHtml(h, sel) + "</div>";
        var yp = sel ? ypHtml(i, sel) : "";
        return '<div class="aa-ri' + (h.ok ? "" : " off") + (pick.has(h.k) ? " on" : "") + '" data-i="' + i + '"><span class="aa-ck">' + CHECK + "</span>" + img +
          '<div class="aa-rn"><b>' + esc(h.p.name) + '</b><div class="aa-meta">' + meta + "</div></div>" + tag + prc + yp + "</div>";
      }).join(""));
      rowEls = Array.prototype.slice.call(rl.children);
      return true;
    }

    var inp = $("aaName");
    inp.addEventListener("focus", function () { var lv = G.lots(); if (lv && lv.products && ixFor !== lv.products) setTimeout(function () { index(lv.products); }, 0); });
    inp.addEventListener("input", function () { clearTimeout(sT); sT = setTimeout(search, 150); });
    inp.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      // Space selects the highlighted product once you are moving with the arrows; while typing it is a normal space
      if (e.key === " " && !mod && nav && hi >= 0 && hits.length) { e.preventDefault(); toggle(hi); return; }
      if (e.key.length === 1 && e.key !== " " && !mod) nav = false;   // typing letters -> back to typing mode
      if (e.key === "Backspace" || e.key === "Delete") nav = false;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { nav = true; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!hits.length) return; e.preventDefault();
        var d = e.key === "ArrowDown" ? 1 : -1;
        if (e.shiftKey && hi >= 0 && hits[hi] && hits[hi].ok && !pick.has(hits[hi].k)) toggle(hi);   // Shift+↑/↓ selects while moving
        setHi(hi + d);
        if (e.shiftKey && hits[hi] && hits[hi].ok && !pick.has(hits[hi].k)) toggle(hi);
      } else if (e.key === "Tab" && !e.shiftKey && hi >= 0 && hits[hi] && pick.has(hits[hi].k)) {
        var box = $("aaRl").querySelector('[data-yp="' + hi + '"]'); if (box) { e.preventDefault(); box.focus(); box.select(); }
      } else if (e.key === "Enter" && mod) { e.preventDefault(); $("aaBulk").click(); }
      else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0) { toggle(hi); } }
      else if (mod && (e.key === "a" || e.key === "A") && hits.length) { e.preventDefault(); selectAll(); }   // Ctrl+A = select all results (again = unselect)
      else if (e.key === "Escape" && (inp.value || pick.size)) {
        e.preventDefault(); e.stopPropagation();   // first Esc clears; Esc on an empty box closes the window
        if (inp.value) { inp.value = ""; search(); } else { pick.clear(); redrawRows(); bulkBtn(); }
      }
    });
    // "/" or Ctrl+K anywhere in the window jumps to the name search
    document.addEventListener("keydown", function (e) {
      if (ov.style.display !== "flex") return;
      var t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K"))) { e.preventDefault(); inp.focus(); inp.select(); }
    });
    $("aaRl").addEventListener("mousedown", function (e) { if (e.target.closest(".aa-yp")) return; if (e.target.closest(".aa-ri")) e.preventDefault(); });   // keep focus in the search box
    $("aaRl").addEventListener("click", function (e) { if (e.target.closest(".aa-yp")) return; var r = e.target.closest(".aa-ri"); if (!r) return; var i = +r.dataset.i; setHi(i, false); toggle(i); nav = true; inp.focus(); });
    $("aaRl").addEventListener("scroll", function () { var rl = this; if (rl.scrollTop + rl.clientHeight > rl.scrollHeight - 200) moreRows(); }, { passive: true });
    $("aaRl").addEventListener("mouseover", function (e) { var r = e.target.closest(".aa-ri"); if (r && +r.dataset.i !== hi) setHi(+r.dataset.i, false); });
    // "Your price" box: live profit check; Enter / Esc goes back to the search box
    $("aaRl").addEventListener("input", function (e) {
      var i = e.target.dataset.yp; if (i == null) return; var h = hits[+i], sel = h && pick.get(h.k); if (!sel) return;
      sel.price = e.target.value.replace(/[^0-9.]/g, ""); checkPrice(h, sel);
      e.target.parentNode.classList.toggle("bad", !!sel.bad); var pr = $("aaRl").querySelector('[data-pr="' + i + '"]'); pr && (pr.innerHTML = priceHtml(h, sel));
    });
    $("aaRl").addEventListener("keydown", function (e) {
      if (e.target.dataset.yp == null) return;
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("aaBulk").click(); return; }
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); inp.focus(); }
    });
    $("aaBar").addEventListener("click", function (e) {
      if (e.target.id === "aaSelAll") { selectAll(); inp.focus(); }
      if (e.target.id === "aaClr") { pick.clear(); redrawRows(); bulkBtn(); inp.focus(); }
    });
    $("aaBulk").onclick = async function () {
      if (!pick.size) return toast("Select one or more products first", true);
      var db = G.db(); if (!db) return toast("Not connected — reload the page", true);
      var items = Array.from(pick.entries()), bad = items.filter(function (e) { return e[1].bad; });
      if (bad.length) return toast("⚠ " + bad.length + " price" + (bad.length > 1 ? "s are" : " is") + " below the " + RULE + " profit rule (red box) — raise it or clear it for auto price", true);
      var qty = Math.max(1, parseInt($("aaQty").value) || 10), b = $("aaBulk");
      b.classList.add("busy");
      try {
        for (var i = 0; i < items.length; i += 400) {
          var batch = db.batch();
          items.slice(i, i + 400).forEach(function (e) {
            var k = e[0], p = e[1].p, wp = parseFloat(e[1].price), bc = isBc(k);
            batch.set(db.collection("spapiAddAsin").doc(acct() + "_" + (bc ? "bc_" : "") + k), { account: acct(), asin: bc ? "" : k, barcode: bc ? k : null, name: p.name || null,
              qty: qty, cost: null, mrp: null, gst: null, wantPrice: wp > 0 ? wp : null, status: "pending", requestedAt: Date.now(), error: null, price: null, profit: null });
          });
          await batch.commit();
        }
        toast("✓ " + items.length + " product" + (items.length > 1 ? "s" : "") + " queued — the robot lists " + (items.length > 1 ? "them" : "it") + " at the next sync");
        pick.clear(); bulkBtn(); inp.value = ""; search(); inp.focus();
      } catch (e) { toast("⚠ Not saved: " + (e.message || e), true); } finally { b.classList.remove("busy"); }
    };
    initList(ov);
    initAttention();
    initMapFix();
    return true;
  }

  /* ===== Mapping fix (owner, 24 Oct 2026: "when we map the product it is not getting saved, listing got stuck") =====
     1. All Amazon -> LOTS / vendor mappings live in ONE Firestore document (aikm_admin/spapiAsinLotsMap, 1 MB limit).
        When it is full every save fails. Saves now fall back to aikm_admin/spapiAsinLotsMap2 (the robot reads both).
     2. The overflow mappings are loaded into the page once, so mapped products show as mapped.
     3. Map from an Add ASIN row: when the Map window closes with a new mapping, the row goes back to the robot
        (no Retry click) and the Add ASIN window opens again. */
  function initMapFix() {
    if (window.__aaMapFix) return; window.__aaMapFix = true;
    var ADM = function () { try { return ADMIN(); } catch (e) { return typeof fbDb !== "undefined" && fbDb ? fbDb.collection("aikm_admin") : null; } };
    var say = function (m, bad) { try { spToast(m, bad); } catch (e) { toast(m, bad); } };
    var isRecord = function (v) { return v && typeof v === "object" && (v.savedAt || v.parts || v.code || v.vendorName); };
    // 1. save with fallback
    (function patch() {
      if (typeof fsMerge !== "function") return void setTimeout(patch, 1000);
      if (fsMerge.__aikm) return;
      var orig = fsMerge;
      var f = function (docId, field, patchObj) {
        if (docId !== "spapiAsinLotsMap") return orig.apply(this, arguments);
        var A = ADM(); if (!A) return orig.apply(this, arguments);
        var stamp = new Date().toISOString();
        var hasDeletes = Object.keys(patchObj || {}).some(function (k) { return !isRecord(patchObj[k]); });
        return A.doc("spapiAsinLotsMap").set({ map: patchObj, savedAt: stamp }, { merge: true }).then(function () {
          if (hasDeletes) A.doc("spapiAsinLotsMap2").set({ map: patchObj, savedAt: stamp }, { merge: true }).catch(function () {});
          say("✓ Saved");
        }).catch(function (e) {
          console.warn("Main mapping record not saved - using the overflow record", e);
          return A.doc("spapiAsinLotsMap2").set({ map: patchObj, savedAt: stamp }, { merge: true })
            .then(function () { say("✓ Saved"); })
            .catch(function (e2) { console.warn("Overflow mapping not saved", e2); say("⚠ Mapping not saved — " + (e2.message || e2), true); });
        });
      };
      f.__aikm = true;
      try { fsMerge = f; } catch (e) {} window.fsMerge = f;
    })();
    // 2. load overflow mappings into the page once
    (function loadOverflow(n) {
      var ok = false; try { ok = typeof STORE !== "undefined" && STORE && STORE.asinLotsMap && Object.keys(STORE.asinLotsMap).length > 0; } catch (e) {}
      if (!ok) return void (n < 40 && setTimeout(function () { loadOverflow(n + 1); }, 1500));
      var A = ADM(); if (!A) return;
      A.doc("spapiAsinLotsMap2").get().then(function (d) {
        var m2 = (d.exists && d.data().map) || {}, k = Object.keys(m2); if (!k.length) return;
        k.forEach(function (a) { var r = m2[a], cur = STORE.asinLotsMap[a]; if (isRecord(r) && (!cur || String(r.savedAt || "") >= String(cur.savedAt || ""))) STORE.asinLotsMap[a] = r; });
        try { matchMemo.clear(); } catch (e) {} try { spMarkAllDirty(); spRender(); } catch (e) {}
      }).catch(function (e) { console.warn("Overflow mappings not loaded", e); });
    })(0);
    // 3. Map from an Add ASIN row -> auto retry + reopen
    var list = $("aaList"); if (!list) return;
    list.addEventListener("click", function (e) {
      var b = e.target.closest('[data-aa="map"]'); if (!b) return;
      var tr = b.closest("tr"), link = tr && tr.querySelector('a[href*="/dp/"]');
      var asin = link ? (link.getAttribute("href").split("/dp/")[1] || "").replace(/[^A-Z0-9]/gi, "").toUpperCase() : "";
      if (!asin) return;
      var docId = b.getAttribute("data-asin"), before = "";
      try { before = JSON.stringify(STORE.asinLotsMap[asin] || null); } catch (x) {}
      var tries = 0, wait = setInterval(function () {
        var mm = $("spapiMatchModal"); if (!mm && ++tries < 20) return; clearInterval(wait); if (!mm) return;
        var obs = new MutationObserver(function () {
          if (mm.style.display !== "none") return;
          obs.disconnect();
          var after = ""; try { after = JSON.stringify(STORE.asinLotsMap[asin] || null); } catch (x) {}
          var db = G.db();
          if (after !== before && after !== "null" && db) {
            db.collection("spapiAddAsin").doc(docId).set({ status: "pending", error: null, requestedAt: Date.now() }, { merge: true })
              .then(function () { say("✓ Mapped — the robot lists it at the next sync (about 15 min)"); })
              .catch(function (x) { say("Mapped, but the row was not re-queued — press Retry", true); });
          }
          setTimeout(function () { var o = $("aaOpen"); o && o.click(); }, 300);
        });
        obs.observe(mm, { attributes: true, attributeFilter: ["style"] });
      }, 150);
    }, true);
  }

  /* ===== "Needs attention" panel: listings the robot can't price (no cost) and listings with no live offer =====
     Data: spapiSnapshots/<account>_bbForecast, written by the robot after each full sync (1 read when opened). */
  function initAttention() {
    if ($("atOv")) return;
    var css = document.createElement("style");
    css.textContent = [
      ".at-sum{display:flex;flex-wrap:wrap;gap:10px;padding:14px 22px;border-bottom:1px solid var(--line-2);background:var(--cream)}",
      ".at-k{flex:1;min-width:140px;background:#fff;border:1px solid var(--line-2);border-radius:12px;padding:10px 14px}",
      ".at-k b{display:block;font:700 22px 'Lexend',sans-serif;color:var(--ink)}.at-k span{font:500 11.5px 'Inter',sans-serif;color:var(--muted)}",
      ".at-k.g b{color:var(--green,#2E7D4F)}.at-k.r b{color:var(--red,#B4382F)}",
      ".at-tabs{display:flex;gap:6px;padding:12px 22px 0;border-bottom:1px solid var(--line-2)}",
      ".at-tab{all:unset;cursor:pointer;padding:9px 14px;font:600 13px 'Inter',sans-serif;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}",
      ".at-tab.on{color:var(--ink);border-color:var(--gold)}.at-tab i{font-style:normal;margin-left:6px;padding:1px 7px;border-radius:9px;background:#F1F0EC;font-size:11px}",
      ".at-why{font:500 12px 'Inter',sans-serif;color:var(--ink-2,#555);line-height:1.45}.at-why b{color:var(--ink)}",
      ".at-ok{color:var(--green,#2E7D4F);font-weight:700}",
      ".at-hot td{background:#F2FAF4}"
    ].join("");
    document.head.appendChild(css);
    document.body.insertAdjacentHTML("beforeend",
      '<div class="aa-ov" id="atOv"><div class="aa-box">' +
      '<div class="aa-head"><div><div class="aa-kick">Amazon robot</div><h3 id="atTitle">Needs attention</h3></div><button type="button" class="aa-x" id="atX" title="Close (Esc)">×</button></div>' +
      '<div class="at-sum" id="atSum"></div>' +
      '<div class="at-tabs"><button type="button" class="at-tab on" data-t="cost">Needs cost<i id="atNc">0</i></button><button type="button" class="at-tab" data-t="offer">No offer<i id="atNo">0</i></button></div>' +
      '<div class="aa-lbar" id="atBar"></div><div class="aa-list" id="atList"></div></div></div>');
    var D = null, tab = "cost", rf = "all", q = "", reopen = null;
    var R = { restock_lots: ["ok", "Restock — LOTS has stock"], not_selling: ["warn", "Hidden by Amazon"], hidden_price: ["warn", "Behind 20 cheaper offers"],
      no_sellers: ["bad", "Listing inactive"], out_of_stock: ["na", "Out of stock"], fba: ["na", "FBA"] };
    var ST = { lost: ["bad", "Lost Buy Box"], none: ["na", "No offer"], held: ["ok", "Holding Buy Box"] };
    var acctName = function () { try { return (SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); }) || {}).name || acct(); } catch (e) { return acct(); } };
    var mapped = function (x) { try { if (typeof getSpapiManualCost === "function" && getSpapiManualCost(x.sku) != null) return true; return !!(STORE && STORE.asinLotsMap && STORE.asinLotsMap[x.asin]); } catch (e) { return false; } };
    var ago = function (t) { var m = (Date.now() - t) / 60000; return m < 90 ? Math.round(m) + " min ago" : Math.round(m / 60) + " h ago"; };
    var SC = function (sku) { return "https://sellercentral.amazon.in/myinventory/inventory?searchTerm=" + encodeURIComponent(sku); };

    function open() { $("atOv").style.display = "flex"; $("atTitle").textContent = "Needs attention · " + acctName(); load(); }
    function close() { $("atOv").style.display = "none"; }
    async function load() {
      var db = G.db(); $("atList").innerHTML = '<div class="aa-empty">Loading…</div>'; $("atSum").innerHTML = "";
      if (!db) { $("atList").innerHTML = '<div class="aa-empty">Not connected — reload the page.</div>'; return; }
      try { var d = await db.collection("spapiSnapshots").doc(acct() + "_bbForecast").get(); D = d.exists ? d.data() : null; }
      catch (e) { $("atList").innerHTML = '<div class="aa-empty">Could not load — check internet.</div>'; return; }
      draw();
    }
    function draw() {
      if (!D || !D.noCost) { $("atSum").innerHTML = ""; $("atBar").innerHTML = ""; $("atList").innerHTML = '<div class="aa-empty">No data yet — it appears after the next full robot sync (about 1 hour).</div>'; return; }
      var nc = D.noCost.filter(function (x) { return !mapped(x); }).length;
      $("atSum").innerHTML =
        '<div class="at-k g"><b>' + (D.held || 0) + '</b><span>Holding Buy Box (checked)</span></div>' +
        '<div class="at-k g"><b>+' + (D.win || 0) + '</b><span>Robot can win within ' + esc(D.ruleText || "the rule") + '</span></div>' +
        '<div class="at-k r"><b>' + nc + '</b><span>Need a cost to be priced</span></div>' +
        '<div class="at-k"><b>' + ((D.noOfferBy || {}).restock_lots || 0) + '</b><span>Out of stock on Amazon, in stock at LOTS</span></div>' +
        '<div class="at-k"><b>' + (D.rule || 0) + '</b><span>Lost — competitor below your profit rule</span></div>';
      $("atNc").textContent = nc; $("atNo").textContent = D.noOfferCount || 0;
      document.querySelectorAll(".at-tab").forEach(function (b) { b.classList.toggle("on", b.dataset.t === tab); });
      var list = tab === "cost" ? D.noCost : D.noOffer, counts = {};
      if (tab === "offer") list.forEach(function (x) { counts[x.r] = (counts[x.r] || 0) + 1; });
      var chips = tab === "offer" ? ['<button type="button" class="aa-chip' + (rf === "all" ? " on" : "") + '" data-rf="all">All <i>' + list.length + "</i></button>"].concat(
        Object.keys(R).filter(function (k) { return counts[k]; }).map(function (k) { return '<button type="button" class="aa-chip' + (rf === k ? " on" : "") + '" data-rf="' + k + '">' + R[k][1] + " <i>" + counts[k] + "</i></button>"; })).join("") : "";
      var hint = tab === "cost" ? '<span class="at-why">The robot skips these — no cost known. Press <b>Map</b> (link the LOTS / vendor product) or <b>Type cost</b>. Best sellers and lost Buy Boxes first.</span>' : "";
      var kf = document.activeElement && document.activeElement.id === "atQ";
      $("atBar").innerHTML = hint + chips + '<span class="aa-lf"><input id="atQ" type="text" placeholder="Filter by name, SKU, ASIN…" value="' + esc(q) + '" autocomplete="off"></span>';
      if (kf) { var qi = $("atQ"); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
      var ql = q.toLowerCase(), rows = list.filter(function (x) { return (tab === "cost" || rf === "all" || x.r === rf) && (!ql || (x.name + " " + x.sku + " " + x.asin).toLowerCase().indexOf(ql) >= 0); });
      if (!rows.length) { $("atList").innerHTML = '<div class="aa-empty">' + (list.length ? "Nothing matches." : tab === "cost" ? "Every in-stock listing has a cost. 👍" : "Every listing has a live offer. 👍") + "</div>"; return; }
      var head = tab === "cost" ? "<th>Product</th><th>Buy Box</th><th>Price</th><th>Sold 30 d</th><th></th>" : "<th>Product</th><th>Why no offer</th><th>Stock</th><th>Sold 30 d</th><th>What to do</th>";
      $("atList").innerHTML = '<table class="aa-tbl"><thead><tr>' + head + "</tr></thead><tbody>" + rows.slice(0, 400).map(function (x) {
        var prod = '<td><div class="t-name">' + esc(x.name || x.sku) + '</div><div class="t-sub"><a href="https://www.amazon.in/dp/' + esc(x.asin) + '" target="_blank" rel="noopener">' + esc(x.asin) + '</a> · <span class="t-mono">' + esc(x.sku) + "</span></div></td>";
        if (tab === "cost") {
          var s2 = ST[x.st] || ["na", x.st], done = mapped(x);
          return "<tr>" + prod + '<td><span class="pill ' + s2[0] + '">' + s2[1] + '</span></td><td class="num">' + (x.price ? "₹" + x.price : "—") + '</td><td class="num">' + (x.u30 || 0) + "</td>" +
            '<td style="white-space:nowrap">' + (done ? '<span class="at-ok">✓ Cost saved</span>' : '<button class="aa-mini" data-at="map" data-asin="' + esc(x.asin) + '">Map</button><button class="aa-mini" data-at="cost" data-sku="' + esc(x.sku) + '" data-name="' + esc(x.name) + '">Type cost</button>') + "</td></tr>";
        }
        var r = R[x.r] || ["na", x.r], stock = "Amazon " + (x.qty || 0) + (x.lq != null ? " · LOTS " + x.lq : "");
        var todo = { restock_lots: "Update stock in <b>OMS Guru</b> — LOTS has " + x.lq + ". Easy sale.", not_selling: "The relist robot works on it (new SKU). Nothing to do.",
          hidden_price: "Robot lowers it if it stays within your profit rule; otherwise check the cost.", no_sellers: 'Check it in <a href="' + SC(x.sku) + '" target="_blank" rel="noopener">Seller Central</a> (inactive / suppressed).',
          out_of_stock: "Restock when LOTS has it (LOTS low or unknown).", fba: "Amazon-fulfilled — managed in Seller Central." }[x.r] || "";
        return '<tr class="' + (x.r === "restock_lots" ? "at-hot" : "") + '">' + prod + '<td><span class="pill ' + r[0] + '">' + r[1] + '</span></td><td class="num">' + esc(stock) + '</td><td class="num">' + (x.u30 || 0) + '</td><td><div class="at-why">' + todo + "</div></td></tr>";
      }).join("") + "</tbody></table>" + (rows.length > 400 ? '<div class="aa-empty">Showing 400 of ' + rows.length + " — filter to see more.</div>" : "") +
      '<div class="aa-empty" style="padding:14px">Updated ' + ago(D.at) + " by the robot · refreshes every full sync</div>";
    }
    $("atX").onclick = close;
    $("atOv").addEventListener("click", function (e) { if (e.target === $("atOv")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("atOv").style.display === "flex") { if (e.target.id === "atQ" && q) { q = ""; draw(); } else close(); } });
    document.querySelector("#atOv .at-tabs").addEventListener("click", function (e) { var b = e.target.closest(".at-tab"); if (!b) return; tab = b.dataset.t; rf = "all"; q = ""; draw(); });
    $("atBar").addEventListener("click", function (e) { var c = e.target.closest("[data-rf]"); if (c) { rf = c.dataset.rf; draw(); } });
    $("atBar").addEventListener("input", function (e) { if (e.target.id === "atQ") { q = e.target.value; draw(); } });
    $("atList").addEventListener("click", async function (e) {
      var b = e.target.closest("[data-at]"); if (!b) return;
      if (b.dataset.at === "map") {
        if (typeof openSpapiMatchModal !== "function") return toast("Map is not available on this page", true);
        close(); openSpapiMatchModal(b.dataset.asin);
        // reopen this panel when the Map window closes
        var mm = $("spapiMatchModal"); if (mm && !reopen) { reopen = new MutationObserver(function () { if (mm.style.display === "none") { reopen.disconnect(); reopen = null; $("atOv").style.display = "flex"; draw(); } }); reopen.observe(mm, { attributes: true, attributeFilter: ["style"] }); }
        return;
      }
      if (b.dataset.at === "cost") {
        var v = typeof askTextPrompt === "function" ? await askTextPrompt({ kicker: "Cost per unit", title: esc(b.dataset.name || b.dataset.sku), message: "Cost of ONE Amazon unit incl. GST. The robot uses it from the next sync.", confirmLabel: "Save cost" }) : prompt("Cost of one unit incl. GST (₹)");
        if (v == null) return; var n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
        if (!(n > 0)) return toast("Enter a number above 0", true);
        if (typeof setSpapiManualCost !== "function") return toast("Saving cost is not available on this page", true);
        setSpapiManualCost(b.dataset.sku, n); toast("✓ Cost ₹" + n + " saved — the robot prices it at the next sync"); draw();
      }
    });
    function addBtn() {
      var a = $("aaOpen"); if (!a) return false; if ($("atOpen")) return true;
      var b = document.createElement("button"); b.type = "button"; b.id = "atOpen"; b.className = "aa-open"; b.title = "Listings the robot can't price, and listings with no live offer";
      b.innerHTML = "⚠ Needs attention"; b.onclick = open; a.parentNode.insertBefore(b, a.nextSibling); return true;
    }
    if (!addBtn()) { var n2 = 0, t2 = setInterval(function () { if (addBtn() || ++n2 > 60) clearInterval(t2); }, 500); }
  }

  /* ===== Robot requests list (drawn by the page): status filter, text filter, bulk select / delete / retry =====
     Works on the rows the page already draws (no extra database reads). Doc id = account_bc_<barcode> or account_<ASIN>. */
  function initList(ov) {
    var list = $("aaList"); if (!list || $("aaLbar")) return;
    var css = document.createElement("style");
    css.textContent = [
      ".aa-lbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 22px;border-bottom:1px solid var(--line-2);background:#fff}",
      ".aa-chip{all:unset;cursor:pointer;height:30px;padding:0 12px;border-radius:15px;border:1px solid var(--line);font:600 12px 'Inter',sans-serif;color:var(--ink-2,#555);display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:background .12s,border-color .12s}",
      ".aa-chip:hover{border-color:var(--gold)}",
      ".aa-chip i{font-style:normal;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#F1F0EC;font-size:11px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}",
      ".aa-chip.on{background:var(--navy);border-color:var(--navy);color:#fff}.aa-chip.on i{background:rgba(255,255,255,.18);color:#fff}",
      ".aa-chip.bad i{background:#FBE9E7;color:var(--red,#B4382F)}.aa-chip.on.bad i{background:rgba(255,255,255,.18);color:#fff}",
      ".aa-lf{margin-left:auto;position:relative}.aa-lf input{height:30px;width:200px;box-sizing:border-box;border:1px solid var(--line);border-radius:15px;padding:0 12px;font:12.5px 'Inter',sans-serif;color:var(--ink);outline:none}",
      ".aa-lf input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.14)}",
      ".aa-bbar{display:none;align-items:center;gap:10px;padding:8px 22px;background:var(--navy);color:#fff;font:500 12.5px 'Inter',sans-serif}",
      ".aa-bbar b{font-weight:700}.aa-bbar .sp{flex:1}",
      ".aa-bb{all:unset;cursor:pointer;height:30px;padding:0 14px;border-radius:8px;font:600 12px 'Inter',sans-serif;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);color:#fff}",
      ".aa-bb:hover{background:rgba(255,255,255,.22)}.aa-bb.del{background:#C0392B}.aa-bb.del:hover{background:#A93226}.aa-bb.busy{opacity:.6;pointer-events:none}",
      ".aa-tbl td.aa-cc,.aa-tbl th.aa-cc{width:34px;padding-right:0!important}",
      ".aa-lck{width:17px;height:17px;accent-color:var(--navy);cursor:pointer;margin:2px 0 0}",
      ".aa-tbl tr.aa-sel td{background:var(--gold-soft)}",
      ".aa-lnone{padding:30px 20px;text-align:center;color:var(--muted);font:13px 'Inter',sans-serif}",
      "@media(max-width:860px){.aa-lf{margin-left:0;flex-basis:100%}.aa-lf input{width:100%}}"
    ].join("");
    document.head.appendChild(css);

    var GROUPS = [
      { k: "all", t: "All" }, { k: "pending", t: "Waiting" }, { k: "listed", t: "Listed" },
      { k: "failed", t: "Failed", bad: 1 }, { k: "needs", t: "Needs cost / MRP", bad: 1 }, { k: "loss", t: "Not profitable", bad: 1 },
      { k: "blocked", t: "Brand approval", bad: 1 }, { k: "exists", t: "Already listed" }
    ];
    var PILL = { "waiting for robot": "pending", "listed": "listed", "already listed": "exists", "needs cost": "needs_cost", "needs mrp": "needs_mrp",
      "needs brand approval": "blocked", "not profitable": "loss", "failed": "failed" };
    var groupOf = function (st) { return st === "needs_cost" || st === "needs_mrp" ? "needs" : st; };
    var filt = "all", ftxt = "", sel = new Set(), busy = false;

    list.insertAdjacentHTML("beforebegin",
      '<div class="aa-lbar" id="aaLbar"></div>' +
      '<div class="aa-bbar" id="aaBbar"><span><b id="aaBn">0</b> selected</span><span class="sp"></span>' +
      '<button type="button" class="aa-bb" id="aaBretry" title="Send the selected failed / needs-cost / not-profitable rows to the robot again">↻ Retry</button>' +
      '<button type="button" class="aa-bb del" id="aaBdel" title="Remove from this list (does not touch Amazon)">🗑 Delete</button>' +
      '<button type="button" class="aa-bb" id="aaBclr">Clear</button></div>');

    function rowInfo(tr) {
      var pill = tr.querySelector(".pill"), st = pill ? PILL[pill.textContent.trim().toLowerCase()] || "other" : "other";
      var bc = "", asin = "";
      tr.querySelectorAll(".t-mono").forEach(function (m) { var t = m.textContent.trim(); if (t.charAt(0) === "▥") bc = t.replace(/\D/g, ""); });
      var a = tr.querySelector('a[href*="/dp/"]'); if (a) asin = (a.getAttribute("href").split("/dp/")[1] || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      var btn = tr.querySelector("[data-aa][data-asin]"), id = btn ? btn.getAttribute("data-asin") : (bc ? acct() + "_bc_" + bc : asin ? acct() + "_" + asin : "");
      return { id: id, st: st, g: groupOf(st), text: tr.textContent.toLowerCase() };
    }

    var obs = new MutationObserver(function () { if (!decorating) schedule(); }), decorating = false, rq = 0;
    function schedule() { if (rq) return; rq = requestAnimationFrame(function () { rq = 0; decorate(); }); }
    function decorate() {
      decorating = true;
      try {
        var tbl = list.querySelector("table.aa-tbl"), counts = {}, ids = new Set(), shown = 0;
        GROUPS.forEach(function (g) { counts[g.k] = 0; });
        if (tbl) {
          var hr = tbl.querySelector("thead tr");
          if (hr && !hr.querySelector(".aa-cc")) hr.insertAdjacentHTML("afterbegin", '<th class="aa-cc"><input type="checkbox" class="aa-lck" id="aaLall" title="Select all shown"></th>');
          var nm = tbl.querySelector(".aa-lnone"); nm && nm.parentNode.removeChild(nm);
          tbl.querySelectorAll("tbody tr").forEach(function (tr) {
            if (!tr.dataset.aaid) { var inf = rowInfo(tr); tr.dataset.aaid = inf.id; tr.dataset.aag = inf.g; tr.dataset.aat = inf.text;
              tr.insertAdjacentHTML("afterbegin", '<td class="aa-cc"><input type="checkbox" class="aa-lck" ' + (inf.id ? "" : "disabled") + "></td>"); }
            var id = tr.dataset.aaid, g = tr.dataset.aag; ids.add(id); counts.all++; if (counts[g] != null) counts[g]++;
            var vis = (filt === "all" || g === filt) && (!ftxt || tr.dataset.aat.indexOf(ftxt) >= 0);
            tr.style.display = vis ? "" : "none"; if (vis) shown++;
            var on = sel.has(id); tr.classList.toggle("aa-sel", on); var c = tr.querySelector(".aa-lck"); if (c) c.checked = on;
          });
          sel.forEach(function (id) { if (!ids.has(id)) sel.delete(id); });   // rows that are gone
          var all = $("aaLall"); if (all) { var vis = visibleIds(); all.checked = vis.length > 0 && vis.every(function (id) { return sel.has(id); }); }
          if (!shown && counts.all) tbl.querySelector("tbody").insertAdjacentHTML("beforeend", '<tr class="aa-lnone"><td colspan="9" class="aa-lnone">Nothing matches this filter.</td></tr>');
        } else sel.clear();
        drawChips(counts); drawBulk();
      } finally { obs.takeRecords(); decorating = false; }
    }
    function visibleIds() { var out = []; list.querySelectorAll("tbody tr[data-aaid]").forEach(function (tr) { if (tr.style.display !== "none" && tr.dataset.aaid) out.push(tr.dataset.aaid); }); return out; }
    function drawChips(c) {
      var bar = $("aaLbar"), keepFocus = document.activeElement && document.activeElement.id === "aaLf";
      var chips = GROUPS.filter(function (g) { return g.k === "all" || c[g.k] || filt === g.k; }).map(function (g) {
        return '<button type="button" class="aa-chip' + (filt === g.k ? " on" : "") + (g.bad && c[g.k] ? " bad" : "") + '" data-f="' + g.k + '">' + g.t + " <i>" + (c[g.k] || 0) + "</i></button>"; }).join("");
      var chipBox = $("aaChips");
      if (!chipBox) { bar.innerHTML = '<span id="aaChips" style="display:contents"></span><span class="aa-lf"><input id="aaLf" type="text" placeholder="Filter by name, barcode, ASIN…" autocomplete="off"></span>'; chipBox = $("aaChips"); }
      chipBox.innerHTML = chips;
      if (keepFocus) $("aaLf").focus();
    }
    function drawBulk() { $("aaBn").textContent = sel.size; $("aaBbar").style.display = sel.size ? "flex" : "none"; resetDel(); }
    var delT = null;
    function resetDel() { clearTimeout(delT); var d = $("aaBdel"); if (d && !busy) { d.dataset.arm = ""; d.textContent = "🗑 Delete"; } }

    $("aaLbar").addEventListener("click", function (e) { var c = e.target.closest("[data-f]"); if (!c) return; filt = c.dataset.f; sel.clear(); decorate(); });
    $("aaLbar").addEventListener("input", function (e) { if (e.target.id !== "aaLf") return; ftxt = e.target.value.trim().toLowerCase(); decorate(); });
    $("aaLbar").addEventListener("keydown", function (e) { if (e.target.id === "aaLf" && e.key === "Escape" && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ""; ftxt = ""; decorate(); } });
    list.addEventListener("change", function (e) {
      if (!e.target.classList.contains("aa-lck")) return;
      if (e.target.id === "aaLall") { var v = visibleIds(), on = e.target.checked; v.forEach(function (id) { on ? sel.add(id) : sel.delete(id); }); }
      else { var tr = e.target.closest("tr"), id = tr && tr.dataset.aaid; if (!id) return; e.target.checked ? sel.add(id) : sel.delete(id); }
      decorate();
    });
    $("aaBclr").onclick = function () { sel.clear(); decorate(); };
    function col() { var db = G.db(); return db ? db.collection("spapiAddAsin") : null; }
    async function runBatch(ids, fn) {
      var db = G.db(); for (var i = 0; i < ids.length; i += 400) { var b = db.batch(); ids.slice(i, i + 400).forEach(function (id) { fn(b, col().doc(id)); }); await b.commit(); }
    }
    $("aaBdel").onclick = async function () {
      var d = this, ids = Array.from(sel); if (!ids.length || !G.db()) return;
      if (!d.dataset.arm) { d.dataset.arm = "1"; d.textContent = "Click again to delete " + ids.length; clearTimeout(delT); delT = setTimeout(resetDel, 3500); return; }
      busy = true; d.classList.add("busy"); d.textContent = "Deleting…";
      try { await runBatch(ids, function (b, ref) { b.delete(ref); }); sel.clear(); toast("✓ " + ids.length + " row" + (ids.length > 1 ? "s" : "") + " removed from the list (Amazon not touched)"); }
      catch (e) { toast("⚠ Not deleted: " + (e.message || e), true); }
      finally { busy = false; d.classList.remove("busy"); decorate(); }
    };
    $("aaBretry").onclick = async function () {
      var b = this, rows = [];
      list.querySelectorAll("tbody tr[data-aaid]").forEach(function (tr) { if (sel.has(tr.dataset.aaid)) rows.push(tr.dataset); });
      var ids = rows.filter(function (r) { return r.aag !== "pending" && r.aag !== "listed"; }).map(function (r) { return r.aaid; });
      if (!ids.length) return toast("Nothing to retry — Waiting and Listed rows are skipped", true);
      b.classList.add("busy");
      try { await runBatch(ids, function (bt, ref) { bt.set(ref, { status: "pending", error: null, requestedAt: Date.now() }, { merge: true }); }); sel.clear();
        toast("✓ " + ids.length + " sent to the robot again" + (ids.length < rows.length ? " (" + (rows.length - ids.length) + " Waiting/Listed skipped)" : "")); }
      catch (e) { toast("⚠ Not saved: " + (e.message || e), true); }
      finally { b.classList.remove("busy"); decorate(); }
    };
    // Reset filters each time the window opens / account changes; then follow every redraw of the list
    new MutationObserver(function () { if (ov.style.display === "flex") { filt = "all"; ftxt = ""; sel.clear(); var f = $("aaLf"); f && (f.value = ""); decorate(); } })
      .observe(ov, { attributes: true, attributeFilter: ["style"] });
    obs.observe(list, { childList: true, subtree: true });
    decorate();
  }
  if (!init()) { var n = 0, t = setInterval(function () { if (init() || ++n > 60) clearInterval(t); }, 500); }
})();

/* ===== DO NOT REMOVE — loads the Meesho Listing tab (console/meesho-listing.js) on this Amazon page. Keep this block when replacing amazon-name-search.js. ===== */
(function () { try { if (document.getElementById("aikmMeeshoListingJs")) return;
  function add(ref) { if (document.getElementById("aikmMeeshoListingJs")) return; var s = document.createElement("script"); s.id = "aikmMeeshoListingJs"; s.defer = true;
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/meesho-listing.js"; document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/meesho-listing.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();

/* ===== DO NOT REMOVE — loads 💡 Price suggestions (console/price-suggest.js) on this Amazon page. Keep this block when replacing amazon-name-search.js. ===== */
(function () { try { if (document.getElementById("aikmPriceSuggestJs")) return;
  function add(ref) { if (document.getElementById("aikmPriceSuggestJs")) return; var s = document.createElement("script"); s.id = "aikmPriceSuggestJs"; s.defer = true;
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/price-suggest.js"; document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/price-suggest.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();
