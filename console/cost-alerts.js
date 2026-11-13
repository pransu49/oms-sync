/* AIKM · Amazon page · "Fix costs" alert (owner 13 Nov 2026: "share an alert or pop up in tool to fix")
   Wrong product costs make every profit number wrong. This checks every product SOLD in the last 30 days (this account)
   and lists the ones whose cost looks wrong:
     • No cost            – not mapped to LOTS / vendor, no manual cost
     • Pack not counted   – Amazon title says "Pack of 10" / "x2" / "Combo of 2" but the mapping counts 1 unit
     • Different product  – the mapped LOTS item shares almost no words with the Amazon title (e.g. Rice → Sugar)
     • Size differs       – 1 kg on Amazon vs 400 g in LOTS (and the pack does not explain it)
     • Cost above price   – cost of one unit is higher than its selling price
   Header button "Fix costs · N" (red count) + a small pop-up once per visit. Each row: "Fix mapping" (the page's own Map
   window, saved per ASIN → fixes all orders) or "Looks right" (hides it; saved in main Firebase aikm_admin/costCheckOk).
   Firebase: 1 read per page open + 1 write per "Looks right". Loaded by the block at the end of console/amazon-name-search.js (aikmCostAlertsJs). */
(function () {
  if (window.__aikmCostAlerts) return; window.__aikmCostAlerts = true;
  if (/[?&]app=meesho/.test(location.search)) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var toast = function (m, bad) { typeof spToast === "function" ? spToast(m, bad) : console.log(m); };

  var css = document.createElement("style");
  css.textContent =
    "#cfOpen .cf-n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#E5484D;color:#fff;font:700 11px 'Inter',sans-serif}" +
    "#cfOpen.cf-ok .cf-n{background:#2FA36B}" +
    ".cf-pop{position:fixed;right:22px;bottom:22px;z-index:1650;width:min(380px,calc(100vw - 32px));background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(15,30,53,.28);border-top:3px solid #E5484D;padding:16px 18px;font:13px 'Inter',system-ui,sans-serif;color:var(--ink,#14213D);animation:cfIn .25s ease}" +
    "@keyframes cfIn{from{transform:translateY(12px);opacity:0}}.cf-pop b{font:600 14px 'Lexend',sans-serif;display:block;margin-bottom:4px}.cf-pop p{margin:0 0 12px;color:var(--ink-2,#4A5468);line-height:1.45;font-size:12.5px}" +
    ".cf-pop .cf-x{position:absolute;top:8px;right:10px;all:unset;cursor:pointer;color:var(--muted);font-size:16px;padding:4px}" +
    ".cf-btn{all:unset;cursor:pointer;box-sizing:border-box;height:34px;padding:0 14px;border-radius:9px;font-weight:600;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#E7E1D3);background:#fff;color:var(--navy,#0F1E35);white-space:nowrap}" +
    ".cf-btn:hover{border-color:var(--navy)}.cf-btn.pri{background:var(--navy,#0F1E35);color:#fff;border-color:var(--navy)}.cf-btn.pri:hover{filter:brightness(1.15)}" +
    ".cf-ov{position:fixed;inset:0;background:rgba(15,30,53,.5);backdrop-filter:blur(3px);z-index:1700;display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}" +
    ".cf-box{background:#fff;border-radius:18px;width:min(1120px,100%);box-shadow:0 24px 70px rgba(15,30,53,.3);border-top:3px solid #E5484D;font:13px 'Inter',system-ui,sans-serif;color:var(--ink,#14213D);overflow:hidden}" +
    ".cf-hd{display:flex;gap:14px;align-items:flex-start;padding:20px 24px 14px;border-bottom:1px solid var(--line-2,#F0ECE2)}.cf-k{font:600 10.5px 'Lexend',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#C2352F}" +
    ".cf-hd h3{font:600 18px 'Lexend',sans-serif;margin:3px 0 4px}.cf-sub{font-size:12.5px;color:var(--muted,#8B909B);max-width:760px;line-height:1.5}.cf-hx{all:unset;cursor:pointer;margin-left:auto;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--muted)}.cf-hx:hover{background:#F4F1EA}" +
    ".cf-chips{display:flex;gap:8px;flex-wrap:wrap;padding:12px 24px;border-bottom:1px solid var(--line-2);background:#FCFBF8}.cf-chip{all:unset;cursor:pointer;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;border:1px solid var(--line);background:#fff;color:var(--ink-2)}" +
    ".cf-chip.on{background:var(--navy,#0F1E35);color:#fff;border-color:var(--navy)}.cf-chip i{font-style:normal;opacity:.7;margin-left:4px}" +
    ".cf-list{max-height:62vh;overflow:auto}.cf-t{width:100%;border-collapse:collapse}.cf-t th{position:sticky;top:0;background:#fff;text-align:left;font:600 10.5px 'Lexend',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 14px;border-bottom:1px solid var(--line-2)}" +
    ".cf-t td{padding:12px 14px;border-bottom:1px solid var(--line-2);vertical-align:top}.cf-t tr:hover td{background:#FCFBF8}.cf-nm{font-weight:600;font-size:12.5px;line-height:1.35;max-width:380px}.cf-s{font-size:11.5px;color:var(--muted);margin-top:3px}" +
    ".cf-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;margin:0 4px 4px 0;white-space:nowrap}.t-none{background:#FCECEA;color:#B42318}.t-pack{background:#FBF1DF;color:#A86A12}.t-diff{background:#FCECEA;color:#B42318}.t-size{background:#FBF1DF;color:#A86A12}.t-loss{background:#FCECEA;color:#B42318}" +
    ".cf-why{font-size:11.5px;color:var(--ink-2);margin-top:2px;max-width:330px}.cf-acts{display:flex;gap:6px;justify-content:flex-end}.cf-acts .cf-btn{height:32px;font-size:12px;padding:0 12px}.cf-empty{padding:50px 10px;text-align:center;color:var(--muted)}" +
    "@media(max-width:760px){.cf-t thead{display:none}.cf-t td{display:block;border:0;padding:6px 16px}.cf-t tr{display:block;border-bottom:1px solid var(--line-2);padding:8px 0}.cf-acts{justify-content:flex-start}}";
  document.head.appendChild(css);

  /* ---------- checks ---------- */
  var STOP = { pack: 1, of: 1, the: 1, and: 1, with: 1, for: 1, combo: 1, set: 1, new: 1, free: 1, india: 1, pcs: 1, pieces: 1, piece: 1, pouch: 1, pouches: 1, bottle: 1, jar: 1, box: 1, gm: 1, gms: 1, grams: 1, gram: 1, kg: 1, ml: 1, ltr: 1, litre: 1, liter: 1, pp: 1, each: 1, total: 1 };
  function words(t) {
    return String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !STOP[w] && !/^\d/.test(w); })
      .map(function (w) { return w.replace(/(ies)$/, "y").replace(/([^s])s$/, "$1").replace(/^haldirams?$/, "haldiram").replace(/^mothers?$/, "mother"); });
  }
  function overlap(a, b) {
    var A = words(a), B = words(b); if (!A.length || !B.length) return 1;
    var jA = A.join(""), jB = B.join(""), n = 0, m = 0;
    A.forEach(function (w) { if (jB.indexOf(w) >= 0) n++; }); B.forEach(function (w) { if (jA.indexOf(w) >= 0) m++; });
    return Math.max(n / A.length, m / B.length, n / Math.min(A.length, B.length) * 0.999 > 1 ? 1 : n / Math.min(A.length, B.length));
  }
  function size(t) {   // the largest size written in the name ("1.02 G (1000 G + 20 G)" -> 1000)
    var re = /(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|grams?|ml|l|ltr|lt|litres?|liters?)\b/gi, m, best = null;
    while ((m = re.exec(String(t || "")))) { var v = +m[1], u = m[2].toLowerCase(); v = /^(kg|kgs|l|ltr|lt|litre|litres|liter|liters)$/.test(u) ? v * 1000 : v; if (v > 0 && (best == null || v > best)) best = v; }
    return best;
  }
  function amzPack(t) {
    var s = String(t || ""), m = /pack\s*of\s*(\d{1,3})|set\s*of\s*(\d{1,2})|combo\s*of\s*(\d{1,2})|\b(\d{1,2})\s*[x×*]\s*\d|\d\s*(?:g|gm|ml|kg|l|ltr)?\s*[x×*]\s*(\d{1,2})\b|\[\s*pack\s*of\s*(\d{1,3})/i.exec(s);
    var n = m ? +(m[1] || m[2] || m[3] || m[4] || m[5] || m[6]) : 1; return n >= 2 && n <= 100 ? n : 1;
  }
  function lotsPackIn(name) {
    var k = /\bpk\s*-?(\d{1,3})\b|\bpack\s*of\s*(\d{1,3})|[x×*]\s*(\d{1,2})\s*$/i.exec(String(name || "")); if (k) { var n = +(k[1] || k[2] || k[3]); if (n >= 2 && n <= 100) return n; }
    try { return typeof lotsPackFromName === "function" ? lotsPackFromName(name) : 1; } catch (e) { return 1; }
  }

  var OK = null;   // { "<acct>|<asin>": "<cost key>" } — "Looks right" ticks
  function loadOk() {
    if (OK) return Promise.resolve(OK);
    try { return fbDb.collection("aikm_admin").doc("costCheckOk").get().then(function (d) { OK = (d.exists && d.data().ok) || {}; return OK; }).catch(function () { OK = {}; return OK; }); }
    catch (e) { OK = {}; return Promise.resolve(OK); }
  }
  function check() {
    var by = {}, now = Date.now();
    (spapiOrdersRaw || []).forEach(function (o) {
      if (o.isCanceled || !o.purchaseDate || now - Date.parse(o.purchaseDate) > 30 * 864e5) return;
      (o.items || []).forEach(function (it) {
        if (!it.asin) return;
        var r = by[it.asin] || (by[it.asin] = { asin: it.asin, title: it.title || "", sku: it.sku, units: 0, orders: 0, revenue: 0, last: "" });
        var q = +it.qty || 1; r.units += q; r.orders++; r.revenue += ((+it.price || 0) + (it.priceExGst ? 0 : (+it.tax || 0)));
        // what the buyer paid per unit INCLUDING shipping (self-ship sellers charge shipping separately)
        var units = (o.items || []).reduce(function (s, x) { return s + (+x.qty || 1); }, 0) || 1, paid = parseFloat(o.total) / units;
        if (o.purchaseDate > r.last) { r.last = o.purchaseDate; r.sku = it.sku; r.title = it.title || r.title; r.unitPrice = (o.items || []).length === 1 && paid > 0 ? paid : null; }
      });
    });
    var out = [];
    Object.keys(by).forEach(function (a) {
      var r = by[a], c = null, m = null, map = (STORE.asinLotsMap || {})[a] || null, lotsName = "", units = 1, issues = [];
      try { c = getEffectiveSpapiUnitCost(r.title, r.sku); } catch (e) {}
      try { m = resolveSpapiLotsMatch(r.title, a); } catch (e) {}
      var lp = m && typeof lotsPriceByCode !== "undefined" ? lotsPriceByCode[m.code] : null;
      lotsName = map && map.parts && map.parts.length === 1 ? (map.parts[0].name || map.name || "") : (lp && !lp.bundle ? lp.name : (m && m.name) || (map && map.name) || "");
      if (map && map.parts && map.parts.length) units = map.parts.reduce(function (s, x) { var lpk = Math.max(1, parseInt(x.lotsPack) || 1); return s + Math.max(1, +x.qty || 1) / lpk * lotsPackIn(x.name); }, 0);
      else if (map && map.vendor && +map.vendor.qty > 0) units = +map.vendor.qty * lotsPackIn(map.vendor.item || "");   // vendor / purchase-bill mapping ("2 × Odomos cream")
      else units = lotsPackIn(lotsName);
      var manual = c && c.source === "manual", vendor = !!(map && map.vendorName && map.vendorName !== "LOTS");
      if (!c) issues.push({ k: "none", t: "No cost", why: "Not mapped to LOTS or a vendor — profit can't be worked out." });
      else if (!manual) {
        var ap = amzPack(r.title), combo = map && map.parts && map.parts.length > 1;
        if (ap > 1 && !combo && units < ap) issues.push({ k: "pack", t: "Pack not counted", why: "Amazon sells a pack of " + ap + " — the mapping counts " + (Math.round(units * 100) / 100) + "." });
        if (!vendor && lotsName && !combo) {
          var ov = overlap(r.title, lotsName);
          if (ov < 0.34) issues.push({ k: "diff", t: "Different product?", why: "Mapped to “" + lotsName + "”." });
          var s1 = size(r.title), s2 = size(lotsName);
          if (s1 && s2 && ov >= 0.34) { var tot = s2 * Math.max(1, units), per = s1 * Math.max(1, ap), far = function (x, y) { return Math.abs(x - y) / Math.max(x, y) > 0.3; };
            /* the Amazon title may give the size of one piece (30 g × 6) or the total (180 g) */
            if (far(tot, per) && far(tot, s1) && far(s2, s1)) issues.push({ k: "size", t: "Size differs", why: "Amazon " + fmtSize(s1) + (ap > 1 ? " × " + ap : "") + " vs LOTS " + fmtSize(s2) + (units > 1 ? " × " + units : "") + "." }); }
        }
        if (r.unitPrice && c.value > r.unitPrice * 1.02) issues.push({ k: "loss", t: "Cost above price", why: "Cost ₹" + Math.round(c.value) + " vs buyer paid ₹" + Math.round(r.unitPrice) + " incl. shipping." });
      }
      if (!issues.length) return;
      var key = acct() + "|" + a, stamp = (c ? Math.round(c.value) : "none") + "|" + issues.map(function (x) { return x.k; }).join(",");
      if (OK && OK[key] === stamp) return;
      out.push({ asin: a, title: r.title, sku: r.sku, units: r.units, orders: r.orders, revenue: r.revenue, cost: c ? c.value : null, manual: manual, lotsName: lotsName, issues: issues, key: key, stamp: stamp });
    });
    out.sort(function (x, y) { return y.units - x.units; });
    return out;
  }
  function fmtSize(g) { return g >= 1000 ? (Math.round(g / 100) / 10) + (g % 1000 ? "" : "") + " kg/L" : g + " g/ml"; }

  /* ---------- header button + pop-up ---------- */
  var LIST = [], shownFor = {}, filt = "all";
  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.4 3.9 2.6 17.5A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.5L13.6 3.9a1.8 1.8 0 0 0-3.2 0z"/><path d="M12 16.5h.01"/></svg>';
  function btn() {
    var b = $("cfOpen");
    if (!b) {
      var ref = $("rlOpen") || $("psOpen") || $("aaOpen"); if (!ref || !ref.parentNode) return null;
      b = document.createElement("button"); b.type = "button"; b.id = "cfOpen"; b.className = "aa-open"; b.title = "Products sold in the last 30 days whose cost looks wrong";
      b.onclick = function () { openList(); };
      ref.parentNode.insertBefore(b, ref.nextSibling);
    }
    return b;
  }
  function paintBtn() {
    var b = btn(); if (!b) return;
    var n = LIST.length; b.classList.toggle("cf-ok", !n);
    b.innerHTML = '<span class="ap-ic" style="display:inline-flex">' + ICON + "</span>Fix costs <span class=\"cf-n\">" + (n || "✓") + "</span>";
  }
  function pop() {
    if (!LIST.length || shownFor[acct()]) return; shownFor[acct()] = 1;
    var old = document.querySelector(".cf-pop"); old && old.remove();
    var none = LIST.filter(function (x) { return x.issues.some(function (i) { return i.k === "none"; }); }).length;
    var d = document.createElement("div"); d.className = "cf-pop";
    d.innerHTML = '<button type="button" class="cf-x" title="Close">✕</button><b>' + LIST.length + " product" + (LIST.length > 1 ? "s have" : " has") + " a wrong or missing cost</b>" +
      "<p>Profit on their orders is not correct" + (none ? " — " + none + " have no cost at all" : "") + ". It takes about 30 seconds each to fix the mapping.</p>" +
      '<div style="display:flex;gap:8px"><button type="button" class="cf-btn pri" data-go>Fix now</button><button type="button" class="cf-btn" data-later>Later</button></div>';
    document.body.appendChild(d);
    d.querySelector("[data-go]").onclick = function () { d.remove(); openList(); };
    d.querySelector("[data-later]").onclick = d.querySelector(".cf-x").onclick = function () { d.remove(); };
    setTimeout(function () { d.parentNode && d.remove(); }, 20000);
  }

  /* ---------- list window ---------- */
  var ov = null;
  var TAGS = [["all", "All"], ["none", "No cost"], ["pack", "Pack not counted"], ["diff", "Different product"], ["size", "Size differs"], ["loss", "Cost above price"]];
  function openList() {
    if (!ov) { ov = document.createElement("div"); ov.className = "cf-ov"; document.body.appendChild(ov); ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeList(); }); }
    ov.style.display = "flex"; drawList(); document.addEventListener("keydown", onKey);
  }
  function closeList() { if (ov) ov.style.display = "none"; document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") closeList(); }
  function drawList() {
    if (!ov || ov.style.display === "none") return;
    var cnt = {}; LIST.forEach(function (x) { x.issues.forEach(function (i) { cnt[i.k] = (cnt[i.k] || 0) + 1; }); });
    var rows = LIST.filter(function (x) { return filt === "all" || x.issues.some(function (i) { return i.k === filt; }); });
    var name = ""; try { name = (SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); }) || {}).name || acct(); } catch (e) {}
    ov.innerHTML = '<div class="cf-box"><div class="cf-hd"><div><div class="cf-k">Cost check · ' + esc(name) + '</div><h3>' + (LIST.length ? LIST.length + " products need a cost fix" : "All costs look right") + "</h3>" +
      '<div class="cf-sub">Products sold in the last 30 days. A wrong cost makes every profit number of that product wrong. “Fix mapping” opens the Map window — the fix is saved per ASIN, so all past and future orders are corrected. “Looks right” hides it until its cost changes.</div></div>' +
      '<button type="button" class="cf-hx" title="Close">✕</button></div>' +
      '<div class="cf-chips">' + TAGS.filter(function (t) { return t[0] === "all" || cnt[t[0]]; }).map(function (t) { return '<button type="button" class="cf-chip' + (filt === t[0] ? " on" : "") + '" data-f="' + t[0] + '">' + t[1] + "<i>" + (t[0] === "all" ? LIST.length : cnt[t[0]]) + "</i></button>"; }).join("") + "</div>" +
      '<div class="cf-list">' + (rows.length ? '<table class="cf-t"><thead><tr><th>Product</th><th>Problem</th><th>Our cost</th><th>Sold 30d</th><th></th></tr></thead><tbody>' + rows.map(function (x) {
        return '<tr data-a="' + esc(x.asin) + '"><td><div class="cf-nm">' + esc(x.title) + '</div><div class="cf-s"><a href="https://www.amazon.in/dp/' + esc(x.asin) + '" target="_blank" rel="noopener">' + esc(x.asin) + "</a> · " + esc(x.sku || "") + "</div></td>" +
          "<td>" + x.issues.map(function (i) { return '<span class="cf-tag t-' + i.k + '">' + esc(i.t) + '</span><div class="cf-why">' + esc(i.why) + "</div>"; }).join("") + "</td>" +
          '<td class="num">' + (x.cost != null ? "₹" + x.cost.toFixed(2) + (x.manual ? '<div class="cf-s">typed by hand</div>' : x.lotsName ? '<div class="cf-s">' + esc(String(x.lotsName).slice(0, 40)) + "</div>" : "") : '<span class="t-muted">—</span>') + "</td>" +
          '<td class="num">' + x.units + '<div class="cf-s">' + x.orders + " order" + (x.orders > 1 ? "s" : "") + "</div></td>" +
          '<td><div class="cf-acts"><button type="button" class="cf-btn pri" data-act="map">Fix mapping</button>' + (x.issues.some(function (i) { return i.k === "none"; }) ? "" : '<button type="button" class="cf-btn" data-act="ok">Looks right</button>') + "</div></td></tr>";
      }).join("") + "</tbody></table>" : '<div class="cf-empty">Nothing to fix here. ✓</div>') + "</div></div>";
    ov.querySelector(".cf-hx").onclick = closeList;
    ov.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { filt = b.dataset.f; drawList(); }; });
    ov.querySelectorAll("[data-act]").forEach(function (b) {
      b.onclick = function () {
        var a = b.closest("tr").dataset.a, x = LIST.find(function (y) { return y.asin === a; }); if (!x) return;
        if (b.dataset.act === "map") {
          if (typeof openSpapiMatchModal !== "function") return toast("Map is not available on this page", true);
          closeList(); openSpapiMatchModal(a); watchFix(); return;
        }
        OK = OK || {}; OK[x.key] = x.stamp;
        try { fbDb.collection("aikm_admin").doc("costCheckOk").set({ ok: (function () { var o = {}; o[x.key] = x.stamp; return o; })() }, { merge: true }); } catch (e) {}
        LIST = LIST.filter(function (y) { return y !== x; }); paintBtn(); drawList(); toast("✓ Marked as right");
      };
    });
  }
  /* after the Map window closes, re-check and come back to the list */
  function watchFix() {
    var t = setInterval(function () {
      var open = [].slice.call(document.querySelectorAll(".admin-modal-overlay")).some(function (m) { return m.style.display && m.style.display !== "none"; });
      if (open) return; clearInterval(t);
      setTimeout(function () { run(); if (LIST.length) openList(); }, 400);
    }, 600);
  }

  var lastSig = "";
  function run() {
    try {
      if (typeof spapiOrdersRaw === "undefined" || !spapiOrdersRaw || !spapiOrdersRaw.length || typeof getEffectiveSpapiUnitCost !== "function") return;
      if (typeof lotsVendor !== "undefined" && lotsVendor && !lotsVendor.products) return;   // wait for LOTS prices
      LIST = check(); paintBtn(); drawList();
      setTimeout(pop, 1500);
    } catch (e) { console.warn("cost check", e); }
  }
  (function boot(i) {
    if (!btn() || typeof spapiOrdersRaw === "undefined" || !(spapiOrdersRaw || []).length || (typeof lotsVendor !== "undefined" && lotsVendor && !lotsVendor.products)) { if (i < 240) setTimeout(function () { boot(i + 1); }, 500); return; }
    loadOk().then(function () { setTimeout(run, 1200); });
    setInterval(function () {   // account switch / new data
      var sig = acct() + ":" + ((spapiOrdersRaw || []).length) + ":" + Object.keys((typeof STORE !== "undefined" && STORE.asinLotsMap) || {}).length;
      if (sig !== lastSig) { lastSig = sig; run(); }
    }, 3000);
  })(0);
})();
