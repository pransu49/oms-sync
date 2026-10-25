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
    var listed = function () { var s = new Set(); (G.inv() || []).forEach(function (x) { x && x.asin && s.add(String(x.asin).toUpperCase()); }); return s; };
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    var K = function (t) { return '<span class="aa-kbd">' + t + "</span>"; };

    /* ---- Pricing: same maths as the robot (spapi-sync.js orderProfit), for a new 0.5 kg listing ---- */
    var MIN_P = 15, TGT_P = 20;
    var selfShip = function () { return acct() === "sastastore"; };
    var shipChg = function () { return selfShip() ? 74 : 80; };              // shipping charge the customer pays
    var shipCost = function () { return selfShip() ? 40 : 55; };             // our courier / Easy Ship cost
    var fee = function (p) { return (p > 1000 ? p * 0.08 : 0) + (p <= 300 ? 2 : p <= 500 ? 23 : p <= 1000 ? 48 : 79); };
    function profitAt(cost, p, gstPct) { var r = (gstPct != null && !isNaN(gstPct) ? +gstPct : 5) / 100;
      return Math.round(p + 0.85 * shipChg() - cost - shipCost() - fee(p) - (r > 0 ? (p - cost) * r / (1 + r) : 0) - 3); }
    function priceFor(cost, gstPct, want) { for (var p = Math.max(1, Math.floor(cost)); p < cost * 4 + 500; p++) if (profitAt(cost, p, gstPct) >= want) return p; return null; }
    function costOf(p) { var pr = G.prices()[p.code] || {}, sl = (pr.slabs || p.slabs || []), b = null;
      sl.forEach(function (x) { var v = +x.price; if (v > 0 && (b == null || v < b)) b = v; }); return b; }
    function pricing(p) {
      var pr = G.prices()[p.code] || {}, cost = costOf(p), mrp = parseFloat(pr.mrp || p.mrp),
        gst = pr.gst != null && pr.gst !== "" ? +pr.gst : (p.gst != null && p.gst !== "" ? +p.gst : null);
      if (!(cost > 0)) return { cost: null, mrp: mrp > 0 ? mrp : null };
      var mn = priceFor(cost, gst, MIN_P), tg = priceFor(cost, gst, TGT_P);
      return { cost: cost, mrp: mrp > 0 ? mrp : null, gst: gst, min: mn, tgt: tg, loss: mn == null || (mrp > 0 && mn > mrp) };
    }
    // Check a typed price: below the Rs 15 floor -> red box + note (the robot would refuse it)
    function checkPrice(h, sel) {
      var v = parseFloat(sel.price); sel.bad = false; sel.note = "";
      if (!(v > 0)) return;
      var P = h.P || pricing(h.p);
      if (P.mrp && v > P.mrp) { sel.note = "Above MRP — robot uses ₹" + Math.floor(P.mrp); return; }
      if (P.cost != null) { var pf = profitAt(P.cost, Math.floor(v), P.gst); sel.note = "Profit ₹" + pf + "/order"; if (pf < MIN_P) { sel.bad = true; sel.note = "Only ₹" + pf + "/order — min ₹" + P.min; } }
    }

    function bulkBtn() { $("aaCnt").textContent = pick.size; $("aaBulk").classList.toggle("dim", !pick.size); drawBar(); }
    function drawBar() {
      var bar = $("aaBar"); if (!bar || !hits.length) return;
      var ok = hits.filter(function (h) { return h.ok; }), all = ok.length && ok.every(function (h) { return pick.has(h.k); });
      bar.innerHTML = "<span><b>" + hits.length + "</b> result" + (hits.length > 1 ? "s" : "") + (hits.length >= 80 ? " (top 80)" : "") + "</span>" +
        (pick.size ? "<span><b>" + pick.size + "</b> selected</span>" : "") +
        (ok.length ? '<button type="button" class="aa-lnk" id="aaSelAll">' + (all ? "Unselect all" : "Select all") + "</button>" : "") +
        (pick.size ? '<button type="button" class="aa-lnk" id="aaClr">Clear</button>' : "") +
        '<span class="aa-keys"><span>' + K("↑") + K("↓") + " move</span><span>" + K("Space") + "/" + K("Enter") + " select</span><span>" + K("Tab") + " price</span><span>" + K(isMac ? "⌘" : "Ctrl") + K("A") + " all</span><span>" +
        K(isMac ? "⌘" : "Ctrl") + K("↵") + " list</span><span>" + K("Esc") + " clear</span></span>";
    }
    function setHi(i, scroll) {
      var rows = $("aaRl").querySelectorAll(".aa-ri"); if (!rows.length) { hi = -1; return; }
      hi = Math.max(0, Math.min(rows.length - 1, i));
      rows.forEach(function (r, j) { r.classList.toggle("hi", j === hi); });
      if (scroll !== false) rows[hi].scrollIntoView({ block: "nearest" });
    }
    function toggle(i) {
      var h = hits[i]; if (!h || !h.ok) return;
      if (pick.has(h.k)) pick.delete(h.k); else pick.set(h.k, { p: h.p, price: "" });
      redrawRows(); bulkBtn();
    }
    function selectAll() {
      var ok = hits.filter(function (h) { return h.ok; }); if (!ok.length) return;
      var all = ok.every(function (h) { return pick.has(h.k); });
      ok.forEach(function (h) { all ? pick.delete(h.k) : (pick.has(h.k) || pick.set(h.k, { p: h.p, price: "" })); });
      redrawRows(); bulkBtn();
    }

    function priceHtml(h, sel) {
      var P = h.P;
      if (sel && sel.note) return 'Your price<br><span class="' + (sel.bad ? "lo" : "gd") + '">' + esc(sel.note) + "</span>";
      if (P.cost == null) return "Cost —<br>from mapping";
      var tg = P.tgt && (!P.mrp || P.tgt <= P.mrp) ? P.tgt : (P.mrp ? Math.floor(P.mrp) : P.tgt);
      return "Cost <b>₹" + P.cost.toFixed(2) + "</b>" + (P.gst != null ? " · GST " + P.gst + "%" : "") + "<br>" +
        (P.loss ? '<span class="lo">Can\'t earn ₹' + MIN_P + (P.mrp ? " under MRP" : "") + "</span>" :
          "Min <b>₹" + P.min + '</b> · Target <span class="gd">₹' + tg + "</span>");
    }
    // Re-render rows in place (keeps scroll + highlight) after selection changes
    function redrawRows() { var rl = $("aaRl"); if (!hits.length) return; var top = rl.scrollTop, keep = hi; renderRows(); rl.scrollTop = top; setHi(keep, false); }
    async function search() {
      var q = $("aaName").value.trim().toLowerCase(), box = $("aaRes"), rl = $("aaRl");
      if (q.length < 2) { box.style.display = "none"; rl.innerHTML = ""; hits = []; hi = -1; lastQ = ""; return; }
      box.style.display = "block";
      var lv = G.lots();
      if (!lv) { $("aaBar").innerHTML = ""; rl.innerHTML = '<div class="aa-msg">Product list not available on this page.</div>'; return; }
      if (!lv.products) {
        $("aaBar").innerHTML = ""; rl.innerHTML = '<div class="aa-msg">Loading LOTS catalogue…</div>';
        try { var ld = G.load(); ld && await ld(); } catch (e) {}
        if (!lv.products) { rl.innerHTML = '<div class="aa-msg">Could not load the LOTS catalogue — check internet.</div>'; return; }
      }
      var qt = q.split(/\s+/).filter(Boolean), L = listed(), prices = G.prices() || {};
      hits = lv.products.filter(function (p) {
        if (!p || !p.name) return false;
        var t = (p.name + " " + (p.brand || "") + " " + (p.code || "") + " " + (p.barcode || "")).toLowerCase();
        return qt.every(function (w) { return t.indexOf(w) >= 0; });
      }).map(function (p) { var k = keyOf(p); return { p: p, k: k, ok: okKey(k), listed: !!(p.asin && L.has(String(p.asin).toUpperCase())) }; })
        .sort(function (a, b) { return (b.ok - a.ok) || a.p.name.localeCompare(b.p.name); }).slice(0, 80);
      if (!hits.length) { $("aaBar").innerHTML = ""; rl.innerHTML = '<div class="aa-msg">No product matches “' + esc(q) + '” — try fewer words.</div>'; hi = -1; return; }
      renderRows();
      drawBar();
      setHi(q === lastQ && hi >= 0 ? hi : 0, false); lastQ = q;
    }
    function renderRows() {
      var prices = G.prices() || {};
      $("aaRl").innerHTML = hits.map(function (h, i) {
        var pr = prices[h.p.code] || {}, mrp = parseFloat(pr.mrp || h.p.mrp), st = parseFloat(pr.qty), im = pr.img || h.p.img;
        var img = '<span class="aa-im">' + (im ? '<img src="' + esc(im) + '" loading="lazy" alt="" onerror="this.remove()">' : "") + "</span>";
        var meta = [mrp > 0 ? '<span class="mrp">MRP ₹' + mrp + "</span>" : "",
          isNaN(st) ? "" : (st > 0 ? '<span class="aa-dot in">' + st + " in stock</span>" : '<span class="aa-dot out">Out of stock</span>'),
          h.p.barcode ? '<span class="mono">' + esc(h.p.barcode) + "</span>" : "", h.p.asin ? '<span class="mono">' + esc(h.p.asin) + "</span>" : "",
          !h.p.barcode && !h.p.asin ? "Code " + esc(h.p.code) : ""].filter(Boolean).join("");
        var tag = !h.ok ? '<span class="aa-tag no">No barcode / ASIN</span>' : h.listed ? '<span class="aa-tag re">Listed · will relist</span>' : "";
        h.P = pricing(h.p); var sel = pick.get(h.k);
        var prc = '<div class="aa-pr" data-pr="' + i + '">' + priceHtml(h, sel) + "</div>";
        var yp = sel ? '<label class="aa-yp' + (sel.bad ? " bad" : "") + '" title="Your selling price. Empty = robot prices it (₹1 under Buy Box, ₹15+ profit)">₹<input data-yp="' + i + '" inputmode="decimal" placeholder="auto" value="' + esc(sel.price || "") + '"></label>' : "";
        return '<div class="aa-ri' + (h.ok ? "" : " off") + (pick.has(h.k) ? " on" : "") + '" data-i="' + i + '"><span class="aa-ck">' + CHECK + "</span>" + img +
          '<div class="aa-rn"><b>' + esc(h.p.name) + '</b><div class="aa-meta">' + meta + "</div></div>" + tag + prc + yp + "</div>";
      }).join("");
    }

    var inp = $("aaName");
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
    $("aaRl").addEventListener("mousemove", function (e) { var r = e.target.closest(".aa-ri"); if (r && +r.dataset.i !== hi) setHi(+r.dataset.i, false); });
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
      if (bad.length) return toast("⚠ " + bad.length + " price" + (bad.length > 1 ? "s are" : " is") + " below ₹" + MIN_P + " profit (red box) — raise it or clear it for auto price", true);
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
    return true;
  }
  if (!init()) { var n = 0, t = setInterval(function () { if (init() || ++n > 60) clearInterval(t); }, 500); }
})();

/* ===== DO NOT REMOVE — loads the Meesho tab (console/meesho-tab.js) on this Amazon page. Keep this block when replacing amazon-name-search.js. ===== */
(function () { try { if (document.getElementById("aikmMeeshoJs")) return;
  function add(ref) { if (document.getElementById("aikmMeeshoJs")) return; var s = document.createElement("script"); s.id = "aikmMeeshoJs"; s.defer = true;
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/meesho-tab.js"; document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/meesho-tab.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();
