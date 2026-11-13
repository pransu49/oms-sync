/* ===== console/proship-tab.js \u2014 Self-Ship \u2192 ProShip (Prozo): ship Amazon self-ship orders straight from the console
   Loaded by the block at the end of console/refund-tab.js (aikmProshipJs). Owner 13 Nov 2026.
   No file upload: tick orders \u2192 "Ship via ProShip" \u2192 the server robot (proship.js, workflow proship.yml) creates the
   shipments and writes the AWBs to aikm_admin/proshipIndex (\u2192 OMS Guru \u2192 Amazon, same road as NimbusPost / Zippy).
   Labels: the normal label robot (nimbus-labels.yml) adds ProShip labels of the SLA date by itself.
   Firebase reads: proshipIndex 1 per console load (+1 per robot write); settings + check + 2 "already in a file" docs
   only when this panel is opened; 1 job doc while a job runs. ===== */
(function () {
  var tries = 0;
  var wait = setInterval(function () {
    tries++;
    var base = document.getElementById("fsTabNimbus") && document.getElementById("tab-selfship");
    // start after the Zippy button exists (it wraps the same view switch); don't wait for it for ever
    if (base && (document.getElementById("fsTabZippy") || tries > 40)) { clearInterval(wait); setTimeout(init, 800); }
    else if (tries > 240) clearInterval(wait);
  }, 500);

  function init() {
    if (window.__aikmProshipV1) return; window.__aikmProshipV1 = true;
    var tab = document.getElementById("tab-selfship");

    /* ---------- styles (re-uses the NimbusPost panel look) ---------- */
    var css = document.createElement("style");
    css.id = "aikm-proship-css";
    css.textContent =
      "@media screen{" +
      "html#aikm body #selfshipProshipPanel .nb-card{padding:22px 24px !important;}" +
      "html#aikm body #selfshipProshipPanel .card > div.nb-head{display:flex !important;justify-content:space-between;align-items:flex-start;gap:14px;background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;}" +
      "html#aikm body #selfshipProshipPanel .nb-filter{margin-top:18px;}" +
      "html#aikm body .ps-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:10px;}" +
      "html#aikm body .ps-grid label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:600;color:var(--x-muted);}" +
      "html#aikm body .ps-grid label b{color:var(--x-red);}" +
      "html#aikm body .ps-grid input{width:100%;box-sizing:border-box;}" +
      "html#aikm body .ps-grid .ps-wide{grid-column:span 2;}" +
      "html#aikm body .ps-sub{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--x-muted);margin:4px 0 8px;text-transform:uppercase;}" +
      "html#aikm body .ps-conn{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-size:12px;font-weight:600;padding:7px 12px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface-2);color:var(--x-text-2);}" +
      "html#aikm body .ps-conn i.dot{width:8px;height:8px;border-radius:50%;background:var(--x-muted);display:inline-block;}" +
      "html#aikm body .ps-conn.ok i.dot{background:var(--x-green);}html#aikm body .ps-conn.bad i.dot{background:var(--x-red);}" +
      "html#aikm body .ps-conn button{all:unset;cursor:pointer;color:var(--x-gold);font-weight:700;}" +
      "html#aikm body details.ps-fold{border:1px solid var(--x-line);border-radius:10px;background:var(--x-surface-2);margin-top:14px;}" +
      "html#aikm body details.ps-fold > summary{cursor:pointer;list-style:none;padding:11px 14px;font-size:12.5px;font-weight:600;color:var(--x-text);display:flex;align-items:center;gap:8px;}" +
      "html#aikm body details.ps-fold > summary::-webkit-details-marker{display:none;}" +
      "html#aikm body details.ps-fold > summary .nb-muted{font-weight:500;}" +
      "html#aikm body details.ps-fold > div{padding:4px 14px 12px;}" +
      "html#aikm body #selfshipProshipPanel button.nb-chip{border-radius:20px !important;padding:6px 12px !important;min-height:0 !important;display:inline-flex;align-items:center;gap:7px;font-weight:600 !important;}" +
      "html#aikm body #selfshipProshipPanel button.nb-chip span{background:var(--x-raise);color:var(--x-text-2);border-radius:20px;padding:0 7px;font-size:11px;line-height:18px;}" +
      "html#aikm body #selfshipProshipPanel button.nb-chip.on{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}" +
      "html#aikm body #selfshipProshipPanel button.nb-chip.on span{background:rgba(255,255,255,.18);color:inherit;}" +
      "html#aikm body #selfshipProshipPanel button.nb-chip.over:not(.on){color:var(--x-red) !important;}" +
      "html#aikm body #psTable td{vertical-align:top !important;font-size:12.5px;}" +
      "html#aikm body #psTable :is(td,th){padding-left:10px !important;padding-right:10px !important;}" +
      "html#aikm body #psTable input[type=checkbox]{width:16px;height:16px;accent-color:#D4AF37;cursor:pointer;}" +
      "html#aikm body #psTable .cx-awb{font-size:12px;}" +
      "html#aikm body #psTable tr.nb-row-loss td{background:var(--x-red-soft) !important;opacity:1 !important;}" +
      "html#aikm body #psTable tr.nb-row-loss td:first-child{box-shadow:inset 3px 0 0 var(--x-red);}" +
      "html#aikm body #psTable .ps-items div+div{margin-top:4px;}" +
      "html#aikm body #psTable .ps-items b{color:var(--x-gold);font-weight:700;white-space:nowrap;}" +
      "html#aikm body #psTable .nb-w{width:76px !important;min-height:30px !important;}" +
      "html#aikm body #psTable .ps-x{all:unset;cursor:pointer;font-size:11px;color:var(--x-red);text-decoration:underline;margin-top:5px;display:inline-block;}" +
      "html#aikm body .ps-status{margin-top:14px;padding:12px 14px;border-radius:10px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12.5px;color:var(--x-text);line-height:1.6;}" +
      "html#aikm body .ps-status.run{border-color:var(--x-gold-line);background:var(--x-gold-soft);}" +
      "html#aikm body .ps-status.ok{border-color:color-mix(in srgb,var(--x-green) 35%,transparent);background:var(--x-green-soft);}" +
      "html#aikm body .ps-status.bad{border-color:color-mix(in srgb,var(--x-red) 35%,transparent);background:var(--x-red-soft);color:var(--x-red);}" +
      "html#aikm body .ps-status a.ps-dl{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:6px 14px;border-radius:8px;background:var(--x-gold);color:#1A1405 !important;font-weight:600;text-decoration:none;}" +
      "html#aikm body .ps-rates{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;}" +
      "html#aikm body .ps-rates :is(td,th){padding:6px 8px !important;text-align:left;border-bottom:1px solid var(--x-line);}" +
      "html#aikm body .ps-rates th{font-size:11px;color:var(--x-muted);font-weight:600;}" +
      "html#aikm body .ps-spin{display:inline-block;animation:psspin 1s linear infinite;}@keyframes psspin{to{transform:rotate(360deg);}}" +
      "@media (max-width:900px){html#aikm body .ps-grid{grid-template-columns:1fr 1fr;}}" +
      "}";
    document.head.appendChild(css);

    /* ---------- helpers ---------- */
    function db() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^\d.\-]/g, "")); return isNaN(n) ? 0 : n; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function nid(v) { return String(v || "").replace(/^`+/, "").replace(/^#/, "").replace(/\s+/g, "").trim(); }
    function phone10(p) { var d = String(p || "").replace(/\D/g, ""); if (d.length > 10) d = d.slice(-10); return d; }
    function account(ch) { return String(ch || "").replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, "").trim(); }
    function ymd(s) {
      var d = new Date(String(s || "").replace(/\s+\d{1,2}:\d{2}.*$/, ""));
      if (isNaN(d)) return "";
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function todayYmd() { return ymd(new Date().toDateString()); }
    function when(ts) { return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
    function rs(n) { return "\u20b9" + r2(n).toLocaleString("en-IN"); }

    /* ---------- settings (saved for every computer) ---------- */
    var LS_KEY = "aikm_proship_settings_v1";
    var DEF = { name: "", phone: "", email: "", address: "", city: "", state: "", pin: "", gstin: "", weight: 0.5, l: 20, b: 15, h: 10, skuWeights: {} };
    var settings = Object.assign({}, DEF);
    try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
    var otherWeights = {};
    try {
      Object.assign(otherWeights, (JSON.parse(localStorage.getItem("aikm_nimbus_settings_v1") || "{}").skuWeights) || {});
      Object.assign(otherWeights, (JSON.parse(localStorage.getItem("aikm_zippy_settings_v1") || "{}").skuWeights) || {});
    } catch (e) {}
    var setRef = null, hooked = false, setLoaded = false, inFile = {}, check = null;

    function saveSettings() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
      if (setRef) setRef.set(settings, { merge: true }).catch(function (e) { console.warn("ProShip settings save failed", e); });
    }
    function pickupReady() {
      var s = settings, miss = [];
      if (!s.name) miss.push("name"); if (phone10(s.phone).length !== 10) miss.push("10-digit phone");
      if (!/@/.test(s.email || "")) miss.push("email"); if (!s.address) miss.push("address");
      if (!s.city) miss.push("city"); if (!s.state) miss.push("state");
      if (!/^\d{6}$/.test(String(s.pin || "").trim())) miss.push("6-digit pincode");
      return miss;
    }
    // opened for the first time: settings (live), connection check (live), "already in a NimbusPost / Zippy file" marks (once)
    function hookPanel() {
      var d = db(); if (hooked || !d) return; hooked = true;
      setRef = d.collection("aikm_admin").doc("proshipSettings");
      setRef.onSnapshot(function (s) {
        if (!s.exists) {
          if (settings.name || settings.address) { setLoaded = true; saveSettings(); pickupNote(); return; }
          // first use: start from the pickup address already typed for Zippy
          d.collection("aikm_admin").doc("zippySettings").get().then(function (z) {
            if (!z.exists || settings.address) return; var x = z.data() || {};
            Object.assign(settings, { name: [x.fn, x.ln].filter(Boolean).join(" ").replace(/\s+\.$/, ""), phone: x.phone || "", email: x.email || "", address: [x.a1, x.a2].filter(Boolean).join(", "),
              city: x.city || "", state: x.state || "", pin: x.pin || "", weight: x.weight || DEF.weight, l: x.l || DEF.l, b: x.b || DEF.b, h: x.h || DEF.h });
            setLoaded = true; fillSettings(); pickupNote(); if (panel.style.display === "block") build();
          }).catch(function () { setLoaded = true; pickupNote(); });
          return;
        }
        var x = s.data() || {};
        Object.assign(settings, x, { skuWeights: Object.assign({}, settings.skuWeights, x.skuWeights || {}) });
        try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
        setLoaded = true; fillSettings(); pickupNote(); if (panel.style.display === "block") build();
      }, function (e) { setLoaded = true; console.warn("ProShip settings sync error", e); });
      d.collection("aikm_admin").doc("proshipCheck").onSnapshot(function (s) { check = s.exists ? s.data() : null; showConn(); }, function () {});
      loadInFile();
    }
    function loadInFile() {
      var d = db(); if (!d) return;
      ["nimbusExported", "zippyExported"].forEach(function (name) {
        d.collection("aikm_admin").doc(name).get().then(function (s) {
          var ids = (s.exists && s.data().ids) || {};
          Object.keys(ids).forEach(function (k) { if (!inFile[k] || ids[k] > inFile[k].t) inFile[k] = { t: ids[k], w: name === "nimbusExported" ? "NimbusPost" : "Zippy" }; });
          if (panel.style.display === "block") pickRows();
        }).catch(function () {});
      });
    }

    /* ---------- ProShip AWBs (1 small doc, written by the robot) ---------- */
    var idx = {}, idxRef = null;
    function liveShip(id) { var v = idx[id]; return v && v.a && v.s !== "cancelled" ? v : null; }
    // feed ProShip AWBs into the Self-Ship confirmation's tracking lookup (same as Zippy)
    function feedFallback() {
      try {
        var fb = (typeof fallbackIndex !== "undefined" && fallbackIndex) ? fallbackIndex : {}, n = 0;
        Object.keys(idx).forEach(function (k) { var v = idx[k]; if (v && v.a && v.s !== "cancelled" && !fb[k]) { fb[k] = { tracker: v.a, carrier: v.c || "", proship: 1 }; n++; } });
        if (n) fallbackIndex = fb;
      } catch (e) {}
    }
    function hookIdx() {
      var d = db(); if (idxRef || !d) return;
      idxRef = d.collection("aikm_admin").doc("proshipIndex");
      idxRef.onSnapshot(function (s) {
        try { idx = s.exists && s.data().data ? JSON.parse(s.data().data) : {}; } catch (e) { idx = {}; }
        feedFallback();
        if (panel.style.display === "block") pickRows();
        if (typeof window.__aikmCfRefresh === "function") window.__aikmCfRefresh();
      }, function (e) { console.warn("ProShip index read error", e); });
    }
    var idxTimer = setInterval(function () { hookIdx(); if (idxRef) clearInterval(idxTimer); }, 3000);
    setInterval(feedFallback, 30000);

    /* ---------- pill button ---------- */
    var after = document.getElementById("fsTabZippy") || document.getElementById("fsTabNimbus");
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "fsTabProship";
    btn.style.cssText = "all:unset;cursor:pointer;background:var(--fs-pill-bg);color:var(--fs-pill-text);font-size:11.5px;font-weight:600;padding:7px 16px;border-radius:20px;display:flex;align-items:center;gap:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);";
    btn.innerHTML = '<i class="ti ti-truck-delivery" style="font-size:13px;color:#D4AF37;"></i>ProShip';
    after.parentNode.insertBefore(btn, after.nextSibling);

    /* ---------- panel ---------- */
    var panel = document.createElement("div");
    panel.id = "selfshipProshipPanel";
    panel.style.display = "none";
    function field(id, label, req, cls, type) {
      return '<label class="' + (cls || "") + '"><span>' + label + (req ? " <b>*</b>" : "") + '</span><input type="' + (type || "text") + '" id="' + id + '"' + (type === "number" ? ' step="0.01" min="0.01"' : "") + "></label>";
    }
    panel.innerHTML =
      '<div class="card nb-card">' +
        '<div class="nb-head"><div><div class="nb-kicker">PROSHIP \u00b7 DIRECT SHIPPING</div>' +
        '<div class="nb-title">Ship Amazon self-ship orders through ProShip</div>' +
        '<div class="nb-sub">Pick an SLA date \u2192 tick the orders \u2192 <b>Ship via ProShip</b>. No file to upload: the shipments are created on the server, the AWBs go to OMS Guru and Amazon by themselves. Only Amazon self-ship orders that are still <b>New</b> (no AWB yet) are listed.</div></div>' +
        '<div class="ps-conn" id="psConn"><i class="dot"></i><span id="psConnTxt">Not tested yet</span><button type="button" id="psTest">Test connection</button></div></div>' +

        '<details class="ps-fold" id="psSetFold"><summary><i class="ti ti-building-warehouse"></i>Pickup address &amp; default box <span class="nb-muted" id="psSetNote"></span><span id="psSetSaved" class="nb-muted"></span></summary><div>' +
          '<div class="ps-grid">' +
            field("psName", "Pickup name (company)", 1, "ps-wide") + field("psPhone", "Phone (10 digits)", 1) + field("psEmail", "Email", 1) +
            field("psAddr", "Full pickup address", 1, "ps-wide") + field("psCity", "City", 1) + field("psState", "State", 1) +
            field("psPin", "Pincode", 1) + field("psGst", "GSTIN (optional)", 0) + "<span></span><span></span>" +
          "</div>" +
          '<div class="ps-sub">Default box</div>' +
          '<div class="ps-grid">' +
            field("psW", "Weight (kg)", 0, "", "number") + field("psL", "Length (cm)", 0, "", "number") + field("psB", "Breadth (cm)", 0, "", "number") + field("psH", "Height (cm)", 0, "", "number") +
          "</div>" +
          '<div class="nb-muted nb-small">Saved for every computer. Use the same pickup address that is registered in ProShip. Product weights set in the NimbusPost / Zippy file are used here too.</div>' +
        "</div></details>" +
        '<details class="ps-fold" id="psRateFold" style="display:none;"><summary><i class="ti ti-receipt-2"></i><span id="psRateTitle">ProShip rates</span> <span class="nb-muted" id="psRateNote"></span></summary><div id="psRates"></div></details>' +

        '<div class="nb-filter">' +
          '<div class="nb-lbl">SLA date <span class="nb-muted" id="psPoolNote"></span></div>' +
          '<div class="nb-chips" id="psDates"></div>' +
          '<div class="nb-filter-row"><select id="psAcct"><option value="">All accounts</option></select>' +
          '<button type="button" id="psRefresh"><i class="ti ti-refresh"></i> Refresh</button></div>' +
        "</div>" +
        '<div id="psResult" style="display:none;">' +
          '<div class="nb-kpis" id="psKpis"></div>' +
          '<div class="table-scroll"><table class="data" id="psTable"><thead><tr>' +
            '<th style="width:28px;"><input type="checkbox" id="psAll" title="Select all"></th><th>Order</th><th>Buyer</th><th>Items</th><th>Weight (kg)</th><th>Status</th>' +
          '</tr></thead><tbody id="psBody"></tbody></table></div>' +
          '<div class="nb-actions"><button type="button" id="psShip" class="btn-gold"><i class="ti ti-truck-delivery"></i> Ship via ProShip</button>' +
          '<button type="button" id="psLabels"><i class="ti ti-printer"></i> Download labels</button>' +
          '<span id="psNote" class="nb-muted"></span></div>' +
          '<div id="psStatus" class="ps-status" style="display:none;"></div>' +
          '<div id="psLblStatus" class="ps-status" style="display:none;"></div>' +
        "</div>" +
      "</div>";
    var anchor = document.getElementById("selfshipZippyPanel") || document.getElementById("selfshipNimbusPanel") || document.getElementById("selfshipFakeShipPanel") || document.getElementById("selfshipGenerateGroup");
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    function $(id) { return document.getElementById(id); }

    var MAP = { psName: "name", psPhone: "phone", psEmail: "email", psAddr: "address", psCity: "city", psState: "state", psPin: "pin", psGst: "gstin", psW: "weight", psL: "l", psB: "b", psH: "h" };
    function fillSettings() {
      Object.keys(MAP).forEach(function (id) { var el = $(id); if (el && document.activeElement !== el) el.value = settings[MAP[id]] == null ? "" : settings[MAP[id]]; });
    }
    function pickupNote() {
      var miss = pickupReady();
      $("psSetNote").textContent = !setLoaded && miss.length ? "" : miss.length ? "\u00b7 fill this first" : "\u00b7 " + settings.name + ", " + settings.city + " " + settings.pin;
      $("psSetNote").style.color = miss.length ? "var(--x-red)" : "";
      if (miss.length && setLoaded && !$("psSetFold").dataset.auto) { $("psSetFold").open = true; $("psSetFold").dataset.auto = "1"; }
    }
    fillSettings();
    Object.keys(MAP).forEach(function (id) {
      $(id).addEventListener("change", function () {
        Object.keys(MAP).forEach(function (k) {
          var v = $(k).value.trim();
          settings[MAP[k]] = /^(weight|l|b|h)$/.test(MAP[k]) ? (num(v) || DEF[MAP[k]]) : v;
        });
        saveSettings(); pickupNote();
        var s = $("psSetSaved"); s.textContent = " \u00b7 saved"; setTimeout(function () { s.textContent = ""; }, 1500);
      });
    });

    /* ---------- connection + rates (written by the robot's "check" run) ---------- */
    var testing = 0;
    function showConn() {
      var box = $("psConn"), txt = $("psConnTxt"), at = check && check.at && check.at.toDate ? check.at.toDate() : null;
      if (testing && (!at || at.getTime() < testing)) { box.className = "ps-conn"; txt.innerHTML = '<i class="ti ti-loader-2 ps-spin"></i> Testing\u2026 about 1 minute'; return; }
      testing = 0;
      if (!check) { box.className = "ps-conn"; txt.textContent = "Not tested yet"; return; }
      box.className = "ps-conn " + (check.ok ? "ok" : "bad");
      txt.textContent = (check.ok ? "Connected" : "Not connected") + (at ? " \u00b7 " + when(at) : "");
      var rates = check.rates || [];
      $("psRateFold").style.display = rates.length || check.note ? "" : "none";
      $("psRateTitle").textContent = check.ok ? "ProShip rates" : "Connection problem";
      if (!check.ok) $("psRateFold").open = true;
      if (!rates.length) { $("psRates").innerHTML = '<div class="nb-muted nb-small">' + esc(check.note || "") + "</div>"; $("psRateNote").textContent = ""; return; }
      var by = {}; rates.forEach(function (r) { (by[r.city] = by[r.city] || { city: r.city, to: r.to, zone: r.zone })[r.g] = r; });
      $("psRateNote").textContent = "\u00b7 cheapest courier, incl. GST, from " + (check.from || "");
      $("psRates").innerHTML = '<table class="ps-rates"><thead><tr><th>To</th><th>Zone</th><th>500 g</th><th>1 kg</th><th>Days</th></tr></thead><tbody>' +
        Object.keys(by).map(function (c) {
          var x = by[c], a = x[500], b = x[1000];
          return "<tr><td>" + esc(c) + ' <span class="nb-muted">' + esc(x.to) + "</span></td><td>" + esc(x.zone || "-") + "</td><td>" + (a ? "<b>" + rs(a.p) + '</b> <span class="nb-muted">' + esc(a.c) + "</span>" : "-") + "</td><td>" + (b ? "<b>" + rs(b.p) + '</b> <span class="nb-muted">' + esc(b.c) + "</span>" : "-") + "</td><td>" + esc((a || b || {}).tat || "-") + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    function dispatch(inputs) {
      if (typeof window.aikmGhDispatch !== "function") return Promise.reject(new Error("Please reload the console (Ctrl + Shift + R) and try again."));
      return window.aikmGhDispatch("proship.yml", inputs);
    }
    $("psTest").addEventListener("click", function () {
      testing = Date.now() - 5000; showConn();
      dispatch({ mode: "check" }).catch(function (e) { testing = 0; showConn(); alert(e.message || e); });
      setTimeout(function () { if (testing) { testing = 0; showConn(); alert("The test did not finish. Try again in a minute; if it repeats, tell Claude."); } }, 240000);
    });

    /* ---------- view switching (adds "ProShip" to Generate / Fake ship / NimbusPost / Zippy) ---------- */
    var ON = { bg: "#0F1E35", fg: "#F5F4EC", sh: "0 4px 12px rgba(15,30,53,.24)" }, OFF = { bg: "var(--fs-pill-bg)", fg: "var(--fs-pill-text)", sh: "0 1px 3px rgba(0,0,0,.06)" };
    function paint(b, on) { if (!b) return; var s = on ? ON : OFF; b.style.background = s.bg; b.style.color = s.fg; b.style.boxShadow = s.sh; }
    var prevSwitch = window.switchSelfShipView;
    window.switchSelfShipView = function (view, byUser) {
      // theme switch re-calls this with "generate" \u2014 keep ProShip open in that case
      if (!byUser && view === "generate" && panel.style.display === "block") view = "proship";
      if (view === "proship") {
        if (panel.style.display !== "block") { try { prevSwitch("generate", true); } catch (e) {} } // closes NimbusPost / Zippy / Fake ship cleanly
        ["selfshipGenerateGroup", "selfshipFakeShipPanel", "selfshipNimbusPanel", "selfshipZippyPanel"].forEach(function (id) { var el = $(id); if (el) el.style.display = "none"; });
        panel.style.display = "block";
        tab.querySelectorAll(".wrap > .foot, .wrap > .rule-box").forEach(function (x) { if (!x.dataset.psHid) x.dataset.psHid = x.style.display || "-"; x.style.display = "none"; });
        ["fsTabGenerate", "fsTabFakeShip", "fsTabNimbus", "fsTabZippy"].forEach(function (id) { paint($(id), false); });
        paint(btn, true);
        hookPanel(); hookIdx(); fillSettings(); pickupNote(); showConn(); build();
        return;
      }
      panel.style.display = "none"; paint(btn, false);
      tab.querySelectorAll("[data-ps-hid]").forEach(function (x) { x.style.display = x.dataset.psHid === "-" ? "" : x.dataset.psHid; delete x.dataset.psHid; });
      prevSwitch(view, byUser);
    };
    btn.addEventListener("click", function () { window.switchSelfShipView("proship", true); });

    /* ---------- pending self-ship pool (same rules as the NimbusPost / Zippy files) ---------- */
    var pool = [], lastRows = [], selDate = "", selAcct = "", busy = false, jobRes = {};
    function weightFor(items) {
      var tot = 0, all = true;
      items.forEach(function (it) { var w = settings.skuWeights[it.sku] || otherWeights[it.sku]; if (w) tot += w * it.qty; else all = false; });
      return all && tot > 0 ? r2(tot) : num(settings.weight) || DEF.weight;
    }
    function isSelfShipPending(o) {
      return /amazon/i.test(o.channel || "") && phone10(o.buyerPhone).length >= 10 && !String(o.awb || "").trim() &&
        /^(new|ready to ship|pending|confirmed)$/i.test(String(o.status || "").trim());
    }
    function makeRow(id, live) {
      var o = live[0], items = {}, order = [];
      live.forEach(function (x) {
        var key = x.sku || x.productName;
        if (!items[key]) { items[key] = { sku: x.sku || "", name: x.productName || x.sku || "Item", qty: 0, price: num(x.price), ship: 0 }; order.push(key); }
        var q = num(x.qty) || 1; items[key].qty += q; items[key].ship += num(x.shippingCharge) * q;
      });
      var list = order.map(function (k) { return items[k]; });
      var cod = live.reduce(function (s, x) { return s + num(x.codCollectible); }, 0);
      var isCod = cod > 0 || /^cod$/i.test(String(o.orderType || "").trim());
      var total = list.reduce(function (s, it) { return s + it.price * it.qty + it.ship; }, 0);
      var r = { id: id, o: o, sla: ymd(o.slaDate), items: list, isCod: isCod, cod: r2(cod > 0 ? cod : (isCod ? total : 0)), weight: weightFor(list), state: "ok", note: "Ready" };
      r.loss = typeof isOmsOrderLoss === "function" && live.some(function (x) { return isOmsOrderLoss(x); });
      r.profit = r2(live.reduce(function (s, x) { return s + (parseFloat(x.profit) || 0); }, 0));
      var missing = [];
      if (!String(o.buyerAddress1 || "").trim() && !String(o.buyerAddress2 || "").trim()) missing.push("address");
      if (!/^\d{6}$/.test(String(o.buyerPincode || "").trim())) missing.push("pincode");
      if (!o.buyerCity) missing.push("city");
      if (!o.buyerState) missing.push("state");
      if (missing.length) { r.state = "bad"; r.note = "Missing " + missing.join(", "); }
      return r;
    }
    function buildPool() {
      var data = window.omsOrdersRaw || [], by = {};
      data.forEach(function (o) { if (!isSelfShipPending(o)) return; var k = nid(o.channelOrderId); if (k) (by[k] = by[k] || []).push(o); });
      var keep = {}; pool.forEach(function (r) { keep[r.id] = r; });
      pool = Object.keys(by).map(function (id) {
        var r = makeRow(id, by[id]), old = keep[id];
        if (old) { if (old.wTouched) { r.weight = old.weight; r.wTouched = true; } if (old.touched) { r.sel = old.sel; r.touched = true; } }
        return r;
      });
      var accts = {}; pool.forEach(function (r) { accts[account(r.o.channel)] = 1; });
      var sel = $("psAcct"), cur = sel.value;
      sel.innerHTML = '<option value="">All accounts</option>' + Object.keys(accts).sort().map(function (a) { return "<option" + (a === cur ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("");
      $("psPoolNote").textContent = data.length ? "\u00b7 " + pool.length + " self-ship orders waiting" : "\u00b7 OMS data loading\u2026";
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
      $("psDates").innerHTML = opts.length ? opts.map(function (o) {
        return '<button type="button" class="nb-chip' + (o[0] === selDate ? " on" : "") + (o[0] === "overdue" ? " over" : "") + '" data-k="' + o[0] + '">' + esc(o[1]) + " <span>" + o[2] + "</span></button>";
      }).join("") : '<span class="nb-muted">No self-ship orders waiting right now.</span>';
      document.querySelectorAll("#psDates .nb-chip").forEach(function (b) { b.addEventListener("click", function () { selDate = b.dataset.k; renderDates(); }); });
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
        r.ship = liveShip(r.id);
        if (!r.touched) r.sel = r.state === "ok" && !inFile[r.id] && !r.loss;
        if (r.state !== "ok" || r.ship) r.sel = false;
      });
      render();
    }
    function build() { buildPool(); }

    function kpi(l, n, cls) { return '<div class="nb-kpi ' + cls + '"><div class="nb-kpi-n">' + n + '</div><div class="nb-kpi-l">' + l + "</div></div>"; }
    function render() {
      var sel = 0, bad = 0, done = 0, loss = 0;
      lastRows.forEach(function (r) { if (r.sel) sel++; if (r.state !== "ok") bad++; if (r.ship) done++; if (r.loss) loss++; });
      $("psKpis").innerHTML =
        kpi("Orders on this date", lastRows.length, "") + kpi("Selected to ship", sel, "nb-ok") + kpi("Loss orders", loss, loss ? "nb-bad" : "") +
        kpi("Need a fix", bad, bad ? "nb-bad" : "") + kpi("Shipped in ProShip", done, done ? "nb-warnk" : "");
      var body = $("psBody");
      body.innerHTML = lastRows.length ? lastRows.map(function (r, i) {
        var o = r.o, ok = r.state === "ok", sh = r.ship, f = inFile[r.id], err = jobRes[r.id] && jobRes[r.id].e;
        var tag = sh ? "nb-tag-ok" : !ok || err || r.loss ? "nb-tag-bad" : f ? "nb-tag-warn" : "nb-tag-ok";
        var note = sh ? "Shipped \u00b7 " + (sh.c || "ProShip") : !ok ? r.note : err ? "Not shipped" : r.loss ? "Loss \u2014 tick to ship" : f ? "In " + f.w + " file " + when(f.t) : "Ready";
        var under = sh ? '<div class="cx-awb" style="margin-top:5px;">' + esc(sh.a) + '</div><button type="button" class="ps-x" data-awb="' + esc(sh.a) + '" data-id="' + esc(r.id) + '">Cancel shipment</button>'
          : err ? '<div class="nb-muted nb-small" style="margin-top:5px;max-width:220px;white-space:normal;">' + esc(err) + "</div>" : "";
        return '<tr class="' + (r.sel || sh ? "" : "nb-row-out") + (r.loss && !sh ? " nb-row-loss" : "") + '">' +
          '<td><input type="checkbox" class="ps-sel" data-i="' + i + '"' + (r.sel ? " checked" : "") + (ok && !sh ? "" : " disabled") + "></td>" +
          '<td><div class="cx-awb">' + esc(r.id) + '</div><div class="nb-muted nb-small">' + esc(account(o.channel)) + "</div>" +
            '<div style="margin-top:5px;">' + (r.isCod ? '<span class="nb-pay nb-cod">COD ' + rs(r.cod) + "</span>" : '<span class="nb-pay">Prepaid</span>') + "</div>" +
            '<div style="margin-top:5px;">' + (r.loss ? '<span class="nb-loss">LOSS \u00b7 ' + rs(r.profit) + "</span>" : '<span class="nb-muted nb-small">Profit ' + rs(r.profit) + "</span>") + "</div></td>" +
          '<td><div class="nb-name">' + esc(o.buyerName || "") + "</div>" +
            '<div class="nb-muted nb-small">' + esc([o.buyerCity, o.buyerState, o.buyerPincode].filter(Boolean).join(" \u00b7 ")) + "</div></td>" +
          '<td class="ps-items">' + r.items.map(function (it) { return "<div>" + esc(it.name) + " <b>\u00d7 " + it.qty + '</b> <span class="nb-muted nb-small">' + rs(it.price) + "</span></div>"; }).join("") + "</td>" +
          '<td><input type="number" step="0.01" min="0.01" class="nb-w" data-i="' + i + '" value="' + r.weight + '"' + (sh ? " disabled" : "") + "></td>" +
          '<td><span class="nb-tag ' + tag + '">' + esc(note) + "</span>" + under + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="nb-muted" style="text-align:center;padding:22px !important;">No orders for this SLA date.</td></tr>';
      body.querySelectorAll(".nb-w").forEach(function (inp) {
        inp.addEventListener("change", function () {
          var r = lastRows[+inp.dataset.i], w = num(inp.value);
          if (!(w > 0)) { inp.value = r.weight; return; }
          r.weight = r2(w); r.wTouched = true;
          if (r.items.length === 1 && r.items[0].sku) { settings.skuWeights[r.items[0].sku] = r2(w / r.items[0].qty); saveSettings(); }
        });
      });
      body.querySelectorAll(".ps-sel").forEach(function (cb) {
        cb.addEventListener("change", function () { var r = lastRows[+cb.dataset.i]; r.sel = cb.checked; r.touched = true; render(); });
      });
      body.querySelectorAll(".ps-x").forEach(function (b) { b.addEventListener("click", function () { cancelShip(b.dataset.id, b.dataset.awb); }); });
      var okRows = lastRows.filter(function (r) { return r.state === "ok" && !r.loss && !r.ship; });
      $("psAll").checked = okRows.length > 0 && okRows.every(function (r) { return r.sel; });
      $("psResult").style.display = "block";
      $("psShip").disabled = !sel || busy;
      $("psShip").innerHTML = busy ? '<i class="ti ti-loader-2 ps-spin"></i> Shipping\u2026' : '<i class="ti ti-truck-delivery"></i> Ship ' + (sel ? sel + " order" + (sel > 1 ? "s" : "") + " " : "") + "via ProShip";
      $("psNote").textContent = busy ? "" : sel ? "" : done && done === lastRows.length ? "All orders of this date are shipped." : "Tick at least one order.";
    }

    /* ---------- ship ---------- */
    var LAST = "aikm_ps_job", unsub = null;
    function show(el, html, cls) { var s = $(el); s.style.display = "block"; s.className = "ps-status " + (cls || ""); s.innerHTML = html; }
    function watch(id) {
      var d = db(); if (!d) return;
      if (unsub) unsub();
      unsub = d.collection("proshipJobs").doc(id).onSnapshot(function (doc) {
        if (!doc.exists) { try { localStorage.removeItem(LAST); } catch (e) {} return; }
        var j = doc.data(), st = j.status || "queued";
        var ts = (j.updatedAt || j.createdAt), age = ts && ts.toDate ? Date.now() - ts.toDate().getTime() : 0;
        if ((st === "queued" || st === "running") && age > 40 * 60000) { st = "failed"; j.step = "The server did not finish this job. Check the rows below, then try again."; }
        else if (st !== "queued" && st !== "running" && age > 12 * 3600e3) { // yesterday's job: nothing to show
          try { localStorage.removeItem(LAST); } catch (e) {} busy = false; jobRes = {}; $("psStatus").style.display = "none"; if (unsub) { unsub(); unsub = null; } pickRows(); return;
        }
        if (st === "queued" || st === "running") {
          busy = true; jobRes = j.results || {};
          show("psStatus", "<b>" + (j.total || j.count || "") + " orders</b> \u2014 " + esc(j.step || "Starting on the server\u2026") + ' <span class="nb-muted">(you can switch tabs \u2014 it keeps running)</span>', "run");
          render(); return;
        }
        var wasBusy = busy; busy = false; jobRes = j.results || {};
        if (st === "failed") show("psStatus", "<b>Could not ship.</b> " + esc(j.step || ""), "bad");
        else {
          var errs = Object.keys(jobRes).filter(function (k) { return jobRes[k].e; });
          show("psStatus", "<b>" + esc(j.step || "Done") + "</b>" + (j.made ? " \u2014 AWBs are going to OMS Guru now; Amazon is confirmed after the next OMS sync. Click <b>Download labels</b> to print." : "") +
            (errs.length ? '<div class="nb-muted nb-small" style="margin-top:6px;">Not shipped: ' + errs.slice(0, 8).map(function (k) { return esc(k) + " (" + esc(jobRes[k].e) + ")"; }).join(" \u00b7 ") + (errs.length > 8 ? " \u2026" : "") + "</div>" : ""), errs.length && !j.made ? "bad" : "ok");
        }
        if (wasBusy) lastRows.forEach(function (r) { r.touched = false; });
        pickRows();
      }, function (e) { busy = false; show("psStatus", "Could not read the job: " + esc(e.message || e), "bad"); render(); });
    }
    function ship() {
      if (busy) return;
      var d = db();
      if (!d) { alert("Still connecting \u2014 try again in a few seconds."); return; }
      var miss = pickupReady();
      if (miss.length) { $("psSetFold").open = true; alert("Fill the pickup address first:\n\u2022 " + miss.join("\n\u2022 ")); $("psName").focus(); return; }
      var rows = lastRows.filter(function (r) { return r.sel && r.state === "ok" && !r.ship; });
      if (!rows.length) return;
      if (rows.length > 300) { alert("Please ship at most 300 orders at a time (" + rows.length + " ticked)."); return; }
      var L = rows.filter(function (r) { return r.loss; });
      if (L.length && !confirm("\u26a0 " + L.length + " LOSS order(s) selected:\n\n" + L.slice(0, 15).map(function (r) { return "\u2022 " + r.id + "  " + rs(r.profit); }).join("\n") + "\n\nShip these loss orders anyway?")) return;
      var again = rows.filter(function (r) { return inFile[r.id]; });
      if (again.length && !confirm(again.length + " selected order(s) were already put in a NimbusPost or Zippy file. If that file was uploaded, they will ship TWICE.\n\nShip them through ProShip anyway?")) return;
      if (!confirm("Create " + rows.length + " shipment" + (rows.length > 1 ? "s" : "") + " in ProShip now?\n\nShipping charges are taken from the ProShip wallet. Pickup from: " + settings.name + ", " + settings.city + " " + settings.pin)) return;
      var ids = {}; rows.forEach(function (r) { ids[r.id] = r.weight; });
      busy = true; jobRes = {}; render();
      show("psStatus", "<b>" + rows.length + " orders</b> \u2014 starting on the server\u2026", "run");
      var ref = d.collection("proshipJobs").doc();
      ref.set({ status: "queued", step: "Waiting for the server\u2026", ids: ids, count: rows.length, sla: selDate,
        box: { l: num(settings.l) || DEF.l, b: num(settings.b) || DEF.b, h: num(settings.h) || DEF.h },
        pickup: { name: settings.name, phone: phone10(settings.phone), email: settings.email, address: settings.address, city: settings.city, state: settings.state, pin: String(settings.pin).trim(), gstin: settings.gstin || "" },
        createdAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { try { localStorage.setItem(LAST, ref.id); } catch (e) {} watch(ref.id); return dispatch({ mode: "ship", job_id: ref.id }); })
        .catch(function (e) {
          busy = false; show("psStatus", "Could not start: " + esc(e.message || e), "bad"); render();
          ref.set({ status: "failed", step: "Could not start: " + String(e.message || e).slice(0, 200) }, { merge: true }).catch(function () {});
        });
    }
    function cancelShip(id, awb) {
      if (!confirm("Cancel the ProShip shipment of order " + id + "?\nAWB " + awb + "\n\nUse this only before the courier picks it up.")) return;
      dispatch({ mode: "cancel", awbs: awb })
        .then(function () { show("psStatus", "Cancelling AWB " + esc(awb) + "\u2026 the order comes back as \u201cReady\u201d in about 1 minute.", "run"); })
        .catch(function (e) { alert(e.message || e); });
    }

    /* ---------- labels (the normal label robot: NimbusPost + ProShip labels of the SLA date, product name + QTY printed) ---------- */
    var lblUnsub = null, lblBusy = false;
    function labels() {
      if (lblBusy) return;
      var d = db(), sla = /^\d{4}-\d{2}-\d{2}$/.test(selDate) ? selDate : "";
      if (!sla) { alert("Pick one SLA date (not \u201cOverdue\u201d) to download its labels."); return; }
      if (!d) { alert("Still connecting \u2014 try again in a few seconds."); return; }
      if (typeof window.aikmGhDispatch !== "function") { alert("Please reload the console (Ctrl + Shift + R) and try again."); return; }
      lblBusy = true; show("psLblStatus", "<b>Labels SLA " + esc(sla) + "</b> \u2014 starting on the server\u2026", "run");
      var ref = d.collection("labelJobs").doc(), fresh = true;
      ref.set({ sla: sla, acct: selAcct, onlyNew: false, status: "queued", step: "Waiting for the server\u2026", createdAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () {
          if (lblUnsub) lblUnsub();
          lblUnsub = ref.onSnapshot(function (doc) {
            if (!doc.exists) return;
            var j = doc.data(), st = j.status || "queued", head = "<b>Labels SLA " + esc(j.sla || sla) + "</b> \u2014 ";
            if (st === "queued" || st === "running") { show("psLblStatus", head + esc(j.step || "Starting\u2026"), "run"); return; }
            lblBusy = false;
            if (st === "failed") { show("psLblStatus", head + "could not make the labels. " + esc(j.step || ""), "bad"); return; }
            if (j.url) {
              show("psLblStatus", head + "<b>" + j.count + ' labels ready</b> <a class="ps-dl" href="' + esc(j.url) + '" rel="noopener"><i class="ti ti-download"></i> Download PDF</a>' +
                (j.noLabel && j.noLabel.length ? '<div class="nb-muted nb-small" style="margin-top:6px;">' + j.noLabel.length + " label(s) not returned: " + esc(j.noLabel.slice(0, 5).join(", ")) + "</div>" : ""), "ok");
              if (fresh) { fresh = false; var x = document.createElement("a"); x.href = j.url; x.rel = "noopener"; document.body.appendChild(x); x.click(); setTimeout(function () { x.remove(); }, 500); }
            } else show("psLblStatus", head + esc(j.step || "No labels."), "");
          }, function () { lblBusy = false; });
          return window.aikmGhDispatch("nimbus-labels.yml", { job_id: ref.id });
        })
        .catch(function (e) { lblBusy = false; show("psLblStatus", "Could not start: " + esc(e.message || e), "bad"); });
    }

    $("psShip").addEventListener("click", ship);
    $("psLabels").addEventListener("click", labels);
    $("psRefresh").addEventListener("click", function () { loadInFile(); build(); });
    $("psAcct").addEventListener("change", function (e) { selAcct = e.target.value; renderDates(); });
    $("psAll").addEventListener("change", function (e) {
      lastRows.forEach(function (r) { if (r.state === "ok" && !r.ship && (!r.loss || !e.target.checked)) { r.sel = e.target.checked; r.touched = true; } }); render();
    });
    setInterval(function () { if (panel.style.display === "block" && !busy && document.activeElement && !document.activeElement.classList.contains("nb-w")) buildPool(); }, 60000);
    try { var last = localStorage.getItem(LAST); if (last) { var lt = setInterval(function () { if (db()) { clearInterval(lt); watch(last); } }, 3000); } } catch (e) {}
    window.__proshipBuild = build; window.__proshipRows = function () { return lastRows; };
  }
})();
