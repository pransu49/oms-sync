/* ===== console/zippy-tab.js \u2014 Self-Ship \u2192 Zippy bulk order file + Zippy tracking upload
   Loaded by the block at the end of console/refund-tab.js (aikmZippyJs). =====
   Self-Ship \u2192 Zippy bulk order file (built from OMS Guru live data, same flow as the NimbusPost file) =====
   Output = Zippy's "order_xlsx_upload_india" template: sheet "India", one row per product, order details repeated. */
(function () {
  var tries = 0;
  var wait = setInterval(function () {
    tries++;
    if (document.getElementById("fsTabNimbus") && document.getElementById("tab-selfship")) { clearInterval(wait); setTimeout(init, 1500); }
    else if (tries > 240) clearInterval(wait);
  }, 500);

  function init() {
    if (window.__aikmZippyV2) return; window.__aikmZippyV2 = true;
    // an older copy (Shopify theme asset) may have added the button first: replace it with this version
    var oldBtn = document.getElementById("fsTabZippy");
    if (oldBtn) { var oldPanel = document.getElementById("selfshipZippyPanel"); if (oldPanel) oldPanel.remove(); oldBtn.remove(); }
    var tab = document.getElementById("tab-selfship");

    /* ---------- styles (re-uses the NimbusPost panel look) ---------- */
    var css = document.createElement("style");
    css.id = "aikm-zippy-css";
    css.textContent =
      "@media screen{" +
      "html#aikm body #selfshipZippyPanel .nb-card{padding:22px 24px !important;}" +
      "html#aikm body #selfshipZippyPanel .card > div.nb-head{display:block !important;background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;}" +
      "html#aikm body .zp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:10px;}" +
      "html#aikm body .zp-grid label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:600;color:var(--x-muted);}" +
      "html#aikm body .zp-grid label b{color:var(--x-red);}" +
      "html#aikm body .zp-grid input{width:100%;box-sizing:border-box;}" +
      "html#aikm body .zp-grid .zp-wide{grid-column:span 2;}" +
      "html#aikm body .zp-sub{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--x-muted);margin:4px 0 8px;text-transform:uppercase;}" +
      "html#aikm body #selfshipZippyPanel button.nb-chip{border-radius:20px !important;padding:6px 12px !important;min-height:0 !important;display:inline-flex;align-items:center;gap:7px;font-weight:600 !important;}" +
      "html#aikm body #selfshipZippyPanel button.nb-chip span{background:var(--x-raise);color:var(--x-text-2);border-radius:20px;padding:0 7px;font-size:11px;line-height:18px;}" +
      "html#aikm body #selfshipZippyPanel button.nb-chip.on{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}" +
      "html#aikm body #selfshipZippyPanel button.nb-chip.on span{background:rgba(255,255,255,.18);color:inherit;}" +
      "html#aikm body #selfshipZippyPanel button.nb-chip.over:not(.on){color:var(--x-red) !important;}" +
      "html#aikm body #zpTable td{vertical-align:top !important;font-size:12.5px;}" +
      "html#aikm body #zpTable :is(td,th){padding-left:10px !important;padding-right:10px !important;}" +
      "html#aikm body #zpTable input[type=checkbox]{width:16px;height:16px;accent-color:#D4AF37;cursor:pointer;}" +
      "html#aikm body #zpTable .cx-awb{font-size:12px;}" +
      "html#aikm body #zpTable tr.nb-row-loss td{background:var(--x-red-soft) !important;opacity:1 !important;}" +
      "html#aikm body #zpTable tr.nb-row-loss td:first-child{box-shadow:inset 3px 0 0 var(--x-red);}" +
      "html#aikm body #zpTable .zp-items div+div{margin-top:4px;}" +
      "html#aikm body #zpTable .zp-items b{color:var(--x-gold);font-weight:700;white-space:nowrap;}" +
      "html#aikm body #zpTable .nb-w{width:76px !important;min-height:30px !important;}" +
      "@media (max-width:900px){html#aikm body .zp-grid{grid-template-columns:1fr 1fr;}}" +
      "}";
    document.head.appendChild(css);

    /* ---------- settings (saved for every computer) ---------- */
    var LS_KEY = "aikm_zippy_settings_v1";
    var DEF = { fn: "", ln: "", phone: "", email: "", a1: "", a2: "", city: "", state: "", pin: "", weight: 0.5, l: 20, b: 15, h: 10, skuWeights: {} };
    var settings = Object.assign({}, DEF);
    try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
    var nbWeights = {};
    try { nbWeights = (JSON.parse(localStorage.getItem("aikm_nimbus_settings_v1") || "{}").skuWeights) || {}; } catch (e) {}
    var cloudRef = null, expRef = null, exported = {}, nbExported = {};

    function db() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }
    function saveSettings() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
      if (cloudRef) cloudRef.set(settings, { merge: true }).catch(function (e) { console.warn("Zippy settings save failed", e); });
    }
    function hookCloud() {
      var d = db();
      if (cloudRef || !d) return;
      cloudRef = d.collection("aikm_admin").doc("zippySettings");
      cloudRef.onSnapshot(function (s) {
        if (!s.exists) { if (settings.fn || settings.a1) saveSettings(); return; }
        var x = s.data() || {};
        Object.assign(settings, x, { skuWeights: Object.assign({}, settings.skuWeights, x.skuWeights || {}) });
        try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
        fillSettings();
      }, function (e) { console.warn("Zippy settings sync error", e); });
      d.collection("aikm_admin").doc("nimbusSettings").onSnapshot(function (s) {
        nbWeights = (s.exists && s.data().skuWeights) || nbWeights;
      }, function () {});
      expRef = d.collection("aikm_admin").doc("zippyExported");
      expRef.onSnapshot(function (s) { exported = (s.exists && s.data().ids) || {}; if (panel.style.display === "block") pickRows(); },
        function (e) { console.warn("Zippy exported sync error", e); });
      d.collection("aikm_admin").doc("nimbusExported").onSnapshot(function (s) {
        nbExported = (s.exists && s.data().ids) || {}; if (panel.style.display === "block") pickRows();
      }, function () {});
    }
    var hookTimer = setInterval(function () { hookCloud(); if (cloudRef) clearInterval(hookTimer); }, 3000);

    /* ---------- helpers ---------- */
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^\d.\-]/g, "")); return isNaN(n) ? 0 : n; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function normId(v) { return String(v || "").replace(/^`+/, "").replace(/\s+/g, "").trim(); }
    function phone10(p) { var d = String(p || "").replace(/\D/g, ""); if (d.length > 10) d = d.slice(-10); return d; }
    function account(ch) { return String(ch || "").replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, "").trim(); }
    function ymd(s) {
      var d = new Date(String(s || "").replace(/\s+\d{1,2}:\d{2}.*$/, ""));
      if (isNaN(d)) return "";
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function todayYmd() { return ymd(new Date().toDateString()); }
    function splitName(n) {
      var p = String(n || "").trim().split(/\s+/).filter(Boolean);
      if (!p.length) return ["", ""];
      if (p.length === 1) return [p[0], "."];
      return [p.slice(0, -1).join(" "), p[p.length - 1]];
    }
    function weightFor(items) {
      var tot = 0, all = true;
      items.forEach(function (it) { var w = settings.skuWeights[it.sku] || nbWeights[it.sku]; if (w) tot += w * it.qty; else all = false; });
      return all && tot > 0 ? r2(tot) : num(settings.weight) || DEF.weight;
    }

    /* ---------- pill button ---------- */
    var nbBtn = document.getElementById("fsTabNimbus");
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "fsTabZippy";
    btn.style.cssText = "all:unset;cursor:pointer;background:var(--fs-pill-bg);color:var(--fs-pill-text);font-size:11.5px;font-weight:600;padding:7px 16px;border-radius:20px;display:flex;align-items:center;gap:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);";
    btn.innerHTML = '<i class="ti ti-file-spreadsheet" style="font-size:13px;color:#D4AF37;"></i>Zippy file';
    nbBtn.parentNode.insertBefore(btn, nbBtn.nextSibling);

    /* ---------- panel ---------- */
    var panel = document.createElement("div");
    panel.id = "selfshipZippyPanel";
    panel.style.display = "none";
    function field(id, label, req, cls, type) {
      return '<label class="' + (cls || "") + '"><span>' + label + (req ? " <b>*</b>" : "") + '</span><input type="' + (type || "text") + '" id="' + id + '"' + (type === "number" ? ' step="0.01" min="0.01"' : "") + "></label>";
    }
    panel.innerHTML =
      '<div class="card nb-card">' +
        '<div class="nb-head"><div><div class="nb-kicker">ZIPPY \u00b7 BULK ORDER UPLOAD</div>' +
        '<div class="nb-title">Create Zippy shipments from OMS Guru data</div>' +
        '<div class="nb-sub">Pick an SLA date \u2192 check the orders \u2192 download \u2192 upload the Excel in Zippy (Orders \u2192 Bulk upload). Only Amazon self-ship orders that are still <b>New</b> in OMS Guru (no AWB yet) are listed.</div></div></div>' +
        '<div class="nb-set">' +
          '<div class="nb-set-title"><i class="ti ti-building-warehouse"></i>Pickup (sender) address <span id="zpSetSaved" class="nb-muted"></span></div>' +
          '<div class="zp-grid">' +
            field("zpFn", "First name", 1) + field("zpLn", "Last name", 1) + field("zpPhone", "Phone (10 digits)", 1) + field("zpEmail", "Email", 1) +
            field("zpA1", "Address line 1", 1, "zp-wide") + field("zpA2", "Address line 2", 0, "zp-wide") +
            field("zpCity", "City", 1) + field("zpState", "State", 1) + field("zpPin", "Pincode", 1) + "<span></span>" +
          "</div>" +
          '<div class="zp-sub">Default box</div>' +
          '<div class="zp-grid">' +
            field("zpW", "Weight (kg)", 0, "", "number") + field("zpL", "Length (cm)", 0, "", "number") + field("zpB", "Breadth (cm)", 0, "", "number") + field("zpH", "Height (cm)", 0, "", "number") +
          "</div>" +
          '<div class="nb-muted nb-small">Saved for every computer. Return address = same as pickup. Product weights you set in the NimbusPost file are used here too.</div>' +
        "</div>" +
        '<div class="nb-filter">' +
          '<div class="nb-lbl">SLA date <span class="nb-muted" id="zpPoolNote"></span></div>' +
          '<div class="nb-chips" id="zpDates"></div>' +
          '<div class="nb-filter-row"><select id="zpAcct"><option value="">All accounts</option></select>' +
          '<button type="button" id="zpRefresh"><i class="ti ti-refresh"></i> Refresh</button></div>' +
        "</div>" +
        '<div id="zpResult" style="display:none;">' +
          '<div class="nb-kpis" id="zpKpis"></div>' +
          '<div class="table-scroll"><table class="data" id="zpTable"><thead><tr>' +
            '<th style="width:28px;"><input type="checkbox" id="zpAll" title="Select all"></th><th>Order</th><th>Buyer</th><th>Items</th><th>Weight (kg)</th><th>Status</th>' +
          '</tr></thead><tbody id="zpBody"></tbody></table></div>' +
          '<div class="nb-actions"><button type="button" id="zpDownload" class="btn-gold"><i class="ti ti-download"></i> Download Zippy file</button>' +
          '<span id="zpDlNote" class="nb-muted"></span></div>' +
        "</div>" +
      "</div>";
    panel.innerHTML +=
      '<div class="card nb-card" style="margin-top:14px;">' +
        '<div class="nb-head"><div><div class="nb-kicker">ZIPPY \u00b7 TRACKING \u2192 OMS GURU \u2192 AMAZON</div>' +
        '<div class="nb-title">Upload Zippy shipments export</div>' +
        '<div class="nb-sub">After Zippy creates the shipments, download the shipments list from Zippy (Excel or CSV) and drop it here. The AWBs are pushed to OMS Guru and then confirmed on Amazon automatically, the same way NimbusPost works. They also show up in Self-Ship \u2192 Confirmation.</div></div></div>' +
        '<div class="nb-actions" style="margin-top:14px;">' +
          '<input type="file" id="zpExpFile" accept=".xlsx,.xls,.csv" style="display:none">' +
          '<button type="button" id="zpExpBtn" class="btn-gold"><i class="ti ti-upload"></i> Upload Zippy export</button>' +
          '<button type="button" id="zpPushNow"><i class="ti ti-send"></i> Push to OMS now</button>' +
          '<span id="zpExpNote" class="nb-muted"></span>' +
        "</div>" +
        '<div id="zpExpInfo" class="nb-muted nb-small" style="margin-top:8px;"></div>' +
      "</div>";
    var nbPanel = document.getElementById("selfshipNimbusPanel");
    var anchor = nbPanel || document.getElementById("selfshipFakeShipPanel") || document.getElementById("selfshipGenerateGroup");
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);

    var MAP = { zpFn: "fn", zpLn: "ln", zpPhone: "phone", zpEmail: "email", zpA1: "a1", zpA2: "a2", zpCity: "city", zpState: "state", zpPin: "pin", zpW: "weight", zpL: "l", zpB: "b", zpH: "h" };
    function fillSettings() {
      Object.keys(MAP).forEach(function (id) { var el = document.getElementById(id); if (el && document.activeElement !== el) el.value = settings[MAP[id]] == null ? "" : settings[MAP[id]]; });
    }
    fillSettings();
    Object.keys(MAP).forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        Object.keys(MAP).forEach(function (k) {
          var v = document.getElementById(k).value.trim();
          settings[MAP[k]] = /^(weight|l|b|h)$/.test(MAP[k]) ? (num(v) || DEF[MAP[k]]) : v;
        });
        saveSettings();
        var s = document.getElementById("zpSetSaved"); s.textContent = "\u00b7 saved"; setTimeout(function () { s.textContent = ""; }, 1500);
      });
    });

    /* ---------- view switching (adds "Zippy" to Generate / Fake ship / NimbusPost) ---------- */
    var ON = { bg: "#0F1E35", fg: "#F5F4EC", sh: "0 4px 12px rgba(15,30,53,.24)" }, OFF = { bg: "var(--fs-pill-bg)", fg: "var(--fs-pill-text)", sh: "0 1px 3px rgba(0,0,0,.06)" };
    function paint(b, on) { if (!b) return; var s = on ? ON : OFF; b.style.background = s.bg; b.style.color = s.fg; b.style.boxShadow = s.sh; }
    var prevSwitch = window.switchSelfShipView;
    window.switchSelfShipView = function (view, byUser) {
      // theme switch re-calls this with "generate" \u2014 keep Zippy open in that case
      if (!byUser && view === "generate" && panel.style.display === "block") view = "zippy";
      if (view === "zippy") {
        ["selfshipGenerateGroup", "selfshipFakeShipPanel", "selfshipNimbusPanel"].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = "none"; });
        panel.style.display = "block";
        tab.querySelectorAll(".wrap > .foot, .wrap > .rule-box").forEach(function (x) { if (!x.dataset.zpHid) x.dataset.zpHid = x.style.display || "-"; x.style.display = "none"; });
        ["fsTabGenerate", "fsTabFakeShip", "fsTabNimbus"].forEach(function (id) { paint(document.getElementById(id), false); });
        paint(btn, true);
        hookCloud(); fillSettings(); build();
        return;
      }
      panel.style.display = "none"; paint(btn, false);
      tab.querySelectorAll("[data-zp-hid]").forEach(function (x) { x.style.display = x.dataset.zpHid === "-" ? "" : x.dataset.zpHid; delete x.dataset.zpHid; });
      prevSwitch(view, byUser);
    };
    btn.addEventListener("click", function () { window.switchSelfShipView("zippy", true); });

    /* ---------- pending self-ship pool ---------- */
    var pool = [], lastRows = [], selDate = "", selAcct = "";
    function isSelfShipPending(o) {
      return /amazon/i.test(o.channel || "") && phone10(o.buyerPhone).length >= 10 && !String(o.awb || "").trim() &&
        /^(new|ready to ship|pending|confirmed)$/i.test(String(o.status || "").trim());
    }
    function makeRow(id, live) {
      var o = live[0];
      var items = {}, order = [];
      live.forEach(function (x) {
        var key = x.sku || x.productName;
        if (!items[key]) { items[key] = { sku: x.sku || "", name: x.productName || x.sku || "Item", qty: 0, price: num(x.price), ship: 0, hsn: x.hsn || "", tax: num(x.taxRate) }; order.push(key); }
        var q = num(x.qty) || 1; items[key].qty += q; items[key].ship += num(x.shippingCharge) * q;
      });
      var list = order.map(function (k) { return items[k]; });
      var cod = live.reduce(function (s, x) { return s + num(x.codCollectible); }, 0);
      var isCod = cod > 0 || /^cod$/i.test(String(o.orderType || "").trim());
      var total = list.reduce(function (s, it) { return s + it.price * it.qty + it.ship; }, 0);
      var r = { id: id, o: o, sla: ymd(o.slaDate), items: list, isCod: isCod, cod: r2(cod > 0 ? cod : (isCod ? total : 0)), weight: weightFor(list), state: "ok", note: "Ready" };
      var p = live.reduce(function (s, x) { return s + (parseFloat(x.profit) || 0); }, 0);
      r.loss = typeof isOmsOrderLoss === "function" && live.some(function (x) { return isOmsOrderLoss(x); });
      r.profit = r2(p);
      var missing = [];
      if (!String(o.buyerAddress1 || "").trim() && !String(o.buyerAddress2 || "").trim()) missing.push("address");
      if (!/^\d{6}$/.test(String(o.buyerPincode || "").trim())) missing.push("pincode");
      if (!o.buyerCity) missing.push("city");
      if (!o.buyerState) missing.push("state");
      if (missing.length) { r.state = "bad"; r.note = "Missing " + missing.join(", "); }
      return r;
    }
    function buildPool() {
      var data = window.omsOrdersRaw || [];
      var by = {};
      data.forEach(function (o) { if (!isSelfShipPending(o)) return; var k = normId(o.channelOrderId); if (k) (by[k] = by[k] || []).push(o); });
      var keep = {}; pool.forEach(function (r) { keep[r.id] = r; });
      pool = Object.keys(by).map(function (id) {
        var r = makeRow(id, by[id]), old = keep[id];
        if (old) { r.weight = old.weight; if (old.touched) { r.sel = old.sel; r.touched = true; } }
        return r;
      });
      var accts = {}; pool.forEach(function (r) { accts[account(r.o.channel)] = 1; });
      var sel = document.getElementById("zpAcct"), cur = sel.value;
      sel.innerHTML = '<option value="">All accounts</option>' + Object.keys(accts).sort().map(function (a) { return "<option" + (a === cur ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("");
      document.getElementById("zpPoolNote").textContent = data.length ? "\u00b7 " + pool.length + " self-ship orders waiting" : "\u00b7 OMS data loading\u2026";
      renderDates();
    }
    function niceDay(k) {
      var t = todayYmd(), p = k.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
      var tm = new Date(); tm.setDate(tm.getDate() + 1);
      var label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      if (k === t) return "Today \u00b7 " + label;
      if (k === ymd(tm.toDateString())) return "Tomorrow \u00b7 " + label;
      return d.toLocaleDateString("en-IN", { weekday: "short" }) + " \u00b7 " + label;
    }
    function renderDates() {
      var t = todayYmd(), counts = {}, over = 0;
      pool.forEach(function (r) { if (selAcct && account(r.o.channel) !== selAcct) return; if (r.sla && r.sla < t) over++; else counts[r.sla || "none"] = (counts[r.sla || "none"] || 0) + 1; });
      var keys = Object.keys(counts).sort();
      var opts = (over ? [["overdue", "Overdue", over]] : []).concat(keys.map(function (k) { return [k, k === "none" ? "No SLA date" : niceDay(k), counts[k]]; }));
      if (!opts.some(function (o) { return o[0] === selDate; })) selDate = opts.length ? (counts[t] ? t : opts[0][0]) : "";
      document.getElementById("zpDates").innerHTML = opts.length ? opts.map(function (o) {
        return '<button type="button" class="nb-chip' + (o[0] === selDate ? " on" : "") + (o[0] === "overdue" ? " over" : "") + '" data-k="' + o[0] + '">' + esc(o[1]) + " <span>" + o[2] + "</span></button>";
      }).join("") : '<span class="nb-muted">No self-ship orders waiting right now.</span>';
      document.querySelectorAll("#zpDates .nb-chip").forEach(function (b) { b.addEventListener("click", function () { selDate = b.dataset.k; renderDates(); }); });
      pickRows();
    }
    function pickRows() {
      var t = todayYmd();
      lastRows = pool.filter(function (r) {
        if (selAcct && account(r.o.channel) !== selAcct) return false;
        if (selDate === "overdue") return r.sla && r.sla < t;
        if (selDate === "none") return !r.sla;
        return r.sla === selDate;
      }).sort(function (a, b) { return (b.loss - a.loss) || account(a.o.channel).localeCompare(account(b.o.channel)) || a.id.localeCompare(b.id); });
      lastRows.forEach(function (r) {
        if (!r.touched) r.sel = r.state === "ok" && !exported[r.id] && !nbExported[r.id] && !r.loss;
        if (r.state !== "ok") r.sel = false;
      });
      render();
    }
    function build() { buildPool(); }

    function kpi(l, n, cls) { return '<div class="nb-kpi ' + cls + '"><div class="nb-kpi-n">' + n + '</div><div class="nb-kpi-l">' + l + "</div></div>"; }
    function when(ts) { return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
    function render() {
      var sel = 0, bad = 0, done = 0, loss = 0;
      lastRows.forEach(function (r) { if (r.sel) sel++; if (r.state !== "ok") bad++; if (exported[r.id]) done++; if (r.loss) loss++; });
      document.getElementById("zpKpis").innerHTML =
        kpi("Orders on this date", lastRows.length, "") + kpi("Selected for file", sel, "nb-ok") + kpi("Loss orders", loss, loss ? "nb-bad" : "") +
        kpi("Need a fix", bad, bad ? "nb-bad" : "") + kpi("Already in Zippy file", done, done ? "nb-warnk" : "");
      var body = document.getElementById("zpBody");
      body.innerHTML = lastRows.length ? lastRows.map(function (r, i) {
        var o = r.o, ok = r.state === "ok", zw = exported[r.id], nw = nbExported[r.id];
        var tag = !ok || (r.loss && !zw) ? "nb-tag-bad" : (zw || nw) ? "nb-tag-warn" : "nb-tag-ok";
        var note = !ok ? r.note : r.loss && !zw ? "Loss \u2014 tick to ship" : zw ? "Zippy file " + when(zw) : nw ? "In NimbusPost file " + when(nw) : "Ready";
        return '<tr class="' + (r.sel ? "" : "nb-row-out") + (r.loss ? " nb-row-loss" : "") + '">' +
          '<td><input type="checkbox" class="zp-sel" data-i="' + i + '"' + (r.sel ? " checked" : "") + (ok ? "" : " disabled") + "></td>" +
          '<td><div class="cx-awb">' + esc(r.id) + '</div><div class="nb-muted nb-small">' + esc(account(o.channel)) + "</div>" +
            '<div style="margin-top:5px;">' + (r.isCod ? '<span class="nb-pay nb-cod">COD \u20b9' + r.cod.toLocaleString("en-IN") + "</span>" : '<span class="nb-pay">Prepaid</span>') + "</div>" +
            '<div style="margin-top:5px;">' + (r.loss ? '<span class="nb-loss">LOSS \u00b7 \u20b9' + r.profit.toLocaleString("en-IN") + "</span>" : '<span class="nb-muted nb-small">Profit \u20b9' + r.profit.toLocaleString("en-IN") + "</span>") + "</div></td>" +
          '<td><div class="nb-name">' + esc(o.buyerName || "") + "</div>" +
            '<div class="nb-muted nb-small">' + esc([o.buyerCity, o.buyerState, o.buyerPincode].filter(Boolean).join(" \u00b7 ")) + "</div></td>" +
          '<td class="zp-items">' + r.items.map(function (it) { return "<div>" + esc(it.name) + " <b>\u00d7 " + it.qty + '</b> <span class="nb-muted nb-small">\u20b9' + r2(it.price).toLocaleString("en-IN") + "</span></div>"; }).join("") + "</td>" +
          '<td><input type="number" step="0.01" min="0.01" class="nb-w" data-i="' + i + '" value="' + r.weight + '"></td>' +
          '<td><span class="nb-tag ' + tag + '">' + esc(note) + "</span></td></tr>";
      }).join("") : '<tr><td colspan="6" class="nb-muted" style="text-align:center;padding:22px !important;">No orders for this SLA date.</td></tr>';
      body.querySelectorAll(".nb-w").forEach(function (inp) {
        inp.addEventListener("change", function () {
          var r = lastRows[+inp.dataset.i], w = num(inp.value);
          if (!(w > 0)) { inp.value = r.weight; return; }
          r.weight = r2(w);
          if (r.items.length === 1 && r.items[0].sku) { settings.skuWeights[r.items[0].sku] = r2(w / r.items[0].qty); saveSettings(); }
        });
      });
      body.querySelectorAll(".zp-sel").forEach(function (cb) {
        cb.addEventListener("change", function () { var r = lastRows[+cb.dataset.i]; r.sel = cb.checked; r.touched = true; render(); });
      });
      var okRows = lastRows.filter(function (r) { return r.state === "ok" && !r.loss; });
      document.getElementById("zpAll").checked = okRows.length > 0 && okRows.every(function (r) { return r.sel; });
      document.getElementById("zpResult").style.display = "block";
      document.getElementById("zpDownload").disabled = !sel;
      document.getElementById("zpDlNote").textContent = sel ? sel + " order(s) will go in the file." : "Select at least one order.";
    }
    function markExported(ids) {
      var now = Date.now(), cut = now - 20 * 864e5, next = {};
      Object.keys(exported).forEach(function (k) { if (exported[k] > cut) next[k] = exported[k]; });
      ids.forEach(function (k) { next[k] = now; });
      exported = next;
      if (expRef) expRef.set({ ids: next }).catch(function (e) { console.warn("Zippy exported save failed", e); });
    }

    /* ---------- file (exact columns of Zippy's order_xlsx_upload_india template) ---------- */
    var HEAD = ["Shipment type*", "order number* ", "order date ", "order time", "sender first name *", "sender last name *", "sender phone number* ( xxx-xxx-xxxx)", "sender email id *", "sender address line 1 *", "sender address line 2 ", "sender city*", "sender state*", "sender country*", "sender postal code*", "Is return address same ( yes/no)*", "return first name *", "return last name *", "return phone number* ( xxx-xxx-xxxx)", "return email id *", "return address line 1 *", "return address line 2 ", "return city*", "return state*", "return country*", "return postal code*", "receiver name", "receiver phone number*( xxx-xxx-xxxx)", "receiver email id", "receiver address line 1 *", "receiver address line 2 ", "receiver city*", "receiver state*", "receiver country*", "receiver postal code*", "receiver gst", " pkg L *( cm ) ", "pkg* B ( cm )", "pkg* H ( cm )", "pkg Weight* ( kg )", "Is hazardous( yes/no) ?*", "product sku", "unit price*", "currency*", "quantity*", "product category", "hs code", "product name*", "tax rate( %)", "product description", "Product discount"];
    var CATEGORY = "Dry Goods & Supplements";

    function checkSender() {
      var s = settings, miss = [];
      if (!s.fn) miss.push("first name"); if (!s.ln) miss.push("last name");
      if (phone10(s.phone).length !== 10) miss.push("10-digit phone");
      if (!/@/.test(s.email || "")) miss.push("email");
      if (!s.a1) miss.push("address line 1"); if (!s.city) miss.push("city"); if (!s.state) miss.push("state");
      if (!/^\d{6}$/.test(String(s.pin || "").trim())) miss.push("6-digit pincode");
      return miss;
    }
    function download() {
      if (typeof XLSX === "undefined") { alert("Excel library not loaded yet \u2014 refresh the page and try again."); return; }
      var miss = checkSender();
      if (miss.length) { alert("Fill the pickup (sender) address first:\n\u2022 " + miss.join("\n\u2022 ")); document.getElementById("zpFn").focus(); return; }
      var rows = lastRows.filter(function (r) { return r.sel && r.state === "ok"; });
      if (!rows.length) return;
      var L = rows.filter(function (r) { return r.loss; });
      if (L.length && !confirm("\u26a0 " + L.length + " LOSS order(s) selected:\n\n" + L.slice(0, 15).map(function (r) { return "\u2022 " + r.id + "  \u20b9" + r.profit; }).join("\n") + "\n\nShip these loss orders anyway?")) return;
      var again = rows.filter(function (r) { return exported[r.id] || nbExported[r.id]; }).length;
      if (again && !confirm(again + " selected order(s) were already put in a Zippy or NimbusPost file before. Include them again?")) return;

      // A\u2192Z by product name, so labels for the same product come out together
      var iname = function (it) { return String(it.name || it.sku || "").trim().toLowerCase(); };
      rows.forEach(function (r) { r._its = r.items.slice().sort(function (x, y) { return iname(x).localeCompare(iname(y), "en", { numeric: true, sensitivity: "base" }); }); });
      rows = rows.slice().sort(function (a, b) { return a._its.map(iname).join("|").localeCompare(b._its.map(iname).join("|"), "en", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id); });

      var s = settings, sPhone = Number(phone10(s.phone)), sPin = Number(String(s.pin).trim());
      var sender = [s.fn, s.ln, sPhone, s.email, s.a1, s.a2 || "", s.city, s.state, "India", sPin];
      var out = [HEAD];
      rows.forEach(function (r) {
        var o = r.o, email = String(o.buyerEmail || "").trim();
        var a1 = String(o.buyerAddress1 || "").trim(), a2 = String(o.buyerAddress2 || "").trim();
        if (!a1) { a1 = a2; a2 = ""; }
        // unit prices: Zippy collects COD = \u03a3 price \u00d7 qty, so fold shipping / rounding into the first item
        var its = r._its.map(function (it) { return { it: it, price: r2(it.price) }; });
        if (r.isCod && r.cod > 0) {
          var sum = its.reduce(function (t, x) { return t + x.price * x.it.qty; }, 0), diff = r2(r.cod - sum);
          if (Math.abs(diff) >= 0.01) its[0].price = r2(its[0].price + diff / its[0].it.qty);
        }
        its.forEach(function (x) {
          var it = x.it;
          out.push([r.isCod ? "COD" : "Prepaid", r.id, "", ""]
            .concat(sender, ["Yes"], sender)
            .concat([String(o.buyerName || "").trim(), Number(phone10(o.buyerPhone)), /@/.test(email) ? email : "", a1, a2,
              String(o.buyerCity || "").trim(), String(o.buyerState || "").trim(), "India", Number(String(o.buyerPincode).trim()), "",
              num(s.l) || DEF.l, num(s.b) || DEF.b, num(s.h) || DEF.h, r.weight, "no",
              it.sku, x.price, "INR", it.qty, CATEGORY, it.hsn || "", it.name, it.tax || "", it.name, ""]));
        });
      });
      var ws = XLSX.utils.aoa_to_sheet(out);
      ws["!cols"] = HEAD.map(function (h) { return { wch: Math.max(12, Math.min(28, h.length)) }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "India");
      var d = new Date(), stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + "_" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
      XLSX.writeFile(wb, "Zippy_Bulk_Orders_" + stamp + ".xlsx");
      markExported(rows.map(function (r) { return r.id; }));
      rows.forEach(function (r) { r.sel = false; r.touched = true; });
      render();
      document.getElementById("zpDlNote").textContent = "Downloaded " + rows.length + " order(s) (" + (out.length - 1) + " product rows). Upload it in Zippy \u2192 Orders \u2192 Bulk upload.";
    }

    /* ---------- Zippy shipments export -> aikm_admin/zippyIndex (read by the OMS push + Amazon confirm jobs) ---------- */
    var zIdx = {}, zIdxAt = null, zRef = null;
    function nid(v) { return String(v || "").replace(/^`+/, "").replace(/^#/, "").replace(/\s+/g, "").trim(); }
    // feed Zippy AWBs into the Self-Ship confirmation's tracking lookup (shown there as an uploaded tracking file)
    function feedFallback() {
      try {
        var fb = (typeof fallbackIndex !== "undefined" && fallbackIndex) ? fallbackIndex : {};
        var n = 0;
        Object.keys(zIdx).forEach(function (k) { var v = zIdx[k]; if (v && v.a && v.s !== "cancelled" && !fb[k]) { fb[k] = { tracker: v.a, carrier: v.c || "", zippy: 1 }; n++; } });
        if (n) fallbackIndex = fb;
      } catch (e) {}
    }
    function showIdxInfo() {
      var el = document.getElementById("zpExpInfo"); if (!el) return;
      var n = Object.keys(zIdx).length;
      el.textContent = n ? n + " Zippy AWBs saved" + (zIdxAt ? " \u00b7 last upload " + when(zIdxAt) : "") : "No Zippy export uploaded yet.";
    }
    function hookIdx() {
      var d = db(); if (zRef || !d) return;
      zRef = d.collection("aikm_admin").doc("zippyIndex");
      zRef.onSnapshot(function (s) {
        try { zIdx = s.exists && s.data().data ? JSON.parse(s.data().data) : {}; } catch (e) { zIdx = {}; }
        zIdxAt = s.exists && s.data().updatedAt && s.data().updatedAt.toDate ? s.data().updatedAt.toDate() : null;
        feedFallback(); showIdxInfo();
      }, function (e) { console.warn("Zippy index read error", e); });
    }
    var idxTimer = setInterval(function () { hookIdx(); if (zRef) clearInterval(idxTimer); }, 3000);
    setInterval(feedFallback, 30000); // the console can reset its tracking file; put Zippy AWBs back

    function pickCol(h, tests, avoid) {
      for (var t = 0; t < tests.length; t++) for (var i = 0; i < h.length; i++) if (tests[t].test(h[i]) && !(avoid && avoid.test(h[i]))) return i;
      return -1;
    }
    function parseExport(rows) {
      var hr = -1, h = [];
      for (var r = 0; r < Math.min(rows.length, 15); r++) {
        var cand = (rows[r] || []).map(function (x) { return String(x == null ? "" : x).trim().toLowerCase(); });
        if (cand.some(function (x) { return /order/.test(x); }) && cand.some(function (x) { return /awb|tracking|waybill/.test(x); })) { hr = r; h = cand; break; }
      }
      if (hr < 0) return { error: "Could not find an Order number column and an AWB / tracking column in this file." };
      var cO = pickCol(h, [/^order\s*(number|no\.?|#)$/, /^(amazon|channel|marketplace)\s*order\s*(id|number|no\.?)$/, /^order\s*id$/, /order\s*(number|no)/, /order\s*id/, /^order$/], /zippy|internal|shipment|item|sub/);
      var cA = pickCol(h, [/^awb(\s*(number|no\.?))?$/, /^tracking\s*(number|no\.?|id)?$/, /awb/, /tracking/, /waybill/], /rto|return|url|link|status/);
      var cC = pickCol(h, [/^courier(\s*name)?$/, /^carrier(\s*name)?$/, /courier/, /carrier/], /service|code|id/);
      var cS = pickCol(h, [/^(shipment\s*)?status$/, /current\s*status/, /status/], /sub|manifest|payment|label/);
      if (cO < 0 || cA < 0) return { error: "Could not find an Order number column and an AWB / tracking column in this file." };
      var out = {}, n = 0;
      rows.slice(hr + 1).forEach(function (row) {
        if (!row) return;
        var id = nid(row[cO]), a = String(row[cA] == null ? "" : row[cA]).replace(/^`+/, "").trim();
        if (!id || !a) return;
        var st = cS >= 0 ? String(row[cS] || "").trim() : "";
        out[id] = { a: a, c: cC >= 0 ? String(row[cC] || "").trim() : "", s: /cancel/i.test(st) ? "cancelled" : "ok", st: st.slice(0, 40), t: Date.now() };
        n++;
      });
      return { map: out, count: n, cols: [h[cO], h[cA], cC >= 0 ? h[cC] : "-", cS >= 0 ? h[cS] : "-"] };
    }
    function onExport(file) {
      var note = document.getElementById("zpExpNote");
      if (typeof XLSX === "undefined") { alert("Excel library not loaded yet \u2014 refresh the page and try again."); return; }
      note.textContent = "Reading " + file.name + "\u2026";
      var fr = new FileReader();
      fr.onload = function () {
        var res;
        try {
          var wb = XLSX.read(new Uint8Array(fr.result), { type: "array", raw: false });
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
          res = parseExport(rows);
        } catch (e) { res = { error: "Could not read this file: " + (e.message || e) }; }
        if (res.error) { note.textContent = ""; alert(res.error); return; }
        if (!res.count) { note.textContent = "No rows with an AWB found in this file."; return; }
        // how many match self-ship orders still waiting in OMS Guru
        var waiting = {};
        (window.omsOrdersRaw || []).forEach(function (o) { if (/amazon/i.test(o.channel || "") && !String(o.awb || "").trim() && !/cancel/i.test(o.status || "")) waiting[nid(o.channelOrderId)] = 1; });
        var match = Object.keys(res.map).filter(function (k) { return waiting[k] && res.map[k].s !== "cancelled"; }).length;
        var cut = Date.now() - 45 * 864e5, next = {};
        Object.keys(zIdx).forEach(function (k) { if (zIdx[k] && zIdx[k].t > cut) next[k] = zIdx[k]; });
        Object.keys(res.map).forEach(function (k) { next[k] = res.map[k]; });
        var d = db();
        if (!d) { alert("Not connected to the console cloud yet \u2014 wait a few seconds and try again."); return; }
        d.collection("aikm_admin").doc("zippyIndex").set({ data: JSON.stringify(next), count: Object.keys(next).length, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
          .then(function () {
            zIdx = next; feedFallback();
            note.textContent = "\u2713 " + res.count + " AWBs saved \u00b7 " + match + " are self-ship orders waiting for tracking in OMS Guru. They go to OMS Guru with the next push (within ~30 min), or press \u201cPush to OMS now\u201d.";
            console.log("Zippy export columns used:", res.cols);
            if (typeof window.__aikmCfRefresh === "function") window.__aikmCfRefresh();
          })
          .catch(function (e) { note.textContent = ""; alert("Not saved \u2014 " + (e.message || e)); });
      };
      fr.readAsArrayBuffer(file);
    }
    document.getElementById("zpExpBtn").addEventListener("click", function () { document.getElementById("zpExpFile").click(); });
    document.getElementById("zpExpFile").addEventListener("change", function (e) { var f = e.target.files && e.target.files[0]; if (f) onExport(f); e.target.value = ""; });
    document.getElementById("zpPushNow").addEventListener("click", function () {
      var note = document.getElementById("zpExpNote");
      if (typeof window.aikmGhDispatch !== "function") { alert("Use the \u201cPush tracking to OMS\u201d button in Nimbus Tracking."); return; }
      note.textContent = "Starting push to OMS Guru\u2026";
      window.aikmGhDispatch("oms-push-tracking.yml", { dry_run: "false" })
        .then(function () { note.textContent = "\u2713 Push started \u2014 OMS Guru is updated in about 2 minutes. Amazon is confirmed after the next OMS sync."; })
        .catch(function (e) { note.textContent = ""; alert(e.message || e); });
    });

    document.getElementById("zpDownload").addEventListener("click", download);
    document.getElementById("zpRefresh").addEventListener("click", build);
    document.getElementById("zpAcct").addEventListener("change", function (e) { selAcct = e.target.value; renderDates(); });
    document.getElementById("zpAll").addEventListener("change", function (e) {
      lastRows.forEach(function (r) { if (r.state === "ok" && (!r.loss || !e.target.checked)) { r.sel = e.target.checked; r.touched = true; } }); render();
    });
    setInterval(function () { if (panel.style.display === "block" && document.activeElement && !document.activeElement.classList.contains("nb-w")) buildPool(); }, 60000);
    window.__zippyBuild = build; window.__zippyRows = function () { return lastRows; };
  }
})();
