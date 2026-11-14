/* ===== console/proship-tab.js \u2014 Self-Ship \u2192 ProShip (Prozo): ship Amazon self-ship orders straight from the console
   Loaded by the block at the end of console/refund-tab.js (aikmProshipJs). Owner 13 Nov 2026.
   Own side-menu tab "ProShip" (data-tab="proship", link /pages/console?tab=proship), full page width,
   ALL orders waiting to ship listed by default (SLA-date chips filter). The Self-Ship "ProShip" pill just opens this tab.
   No file upload: tick orders \u2192 "Ship via ProShip" \u2192 the server robot (proship.js, workflow proship.yml) creates the
   shipments and writes the AWBs to aikm_admin/proshipIndex (\u2192 OMS Guru \u2192 Amazon, same road as NimbusPost / Zippy).
   Labels: the normal label robot (nimbus-labels.yml) adds ProShip labels of the SLA date by itself.
   Firebase reads: proshipIndex 1 per console load (+1 per robot write); settings + check + 2 "already in a file" docs
   only when this panel is opened; 1 job doc while a job runs. ===== */
(function () {
  var tries = 0;
  var wait = setInterval(function () {
    tries++;
    var base = document.getElementById("mainTabbar") && document.querySelector(".app-content") && document.getElementById("tab-selfship");
    // start after the NimbusPost / Zippy pills exist (so our shortcut pill sits next to them); don't wait for them for ever
    if (base && ((document.getElementById("fsTabNimbus") && document.getElementById("fsTabZippy")) || tries > 40)) { clearInterval(wait); setTimeout(init, 800); }
    else if (tries > 240) clearInterval(wait);
  }, 500);

  function init() {
    if (window.__aikmProshipV1) return; window.__aikmProshipV1 = true;

    /* ---------- styles (re-uses the NimbusPost panel look) ---------- */
    var css = document.createElement("style");
    css.id = "aikm-proship-css";
    css.textContent =
      "@media screen{" +
      "html#aikm body #selfshipProshipPanel .nb-card{padding:22px 24px !important;}" +
      "html#aikm body #tab-proship{max-width:none !important;width:100% !important;}" +
      "html#aikm body #selfshipProshipPanel{width:100%;}" +
      "html#aikm body #selfshipProshipPanel .nb-card{background:var(--x-surface);border:1px solid var(--x-line);border-radius:14px;box-shadow:var(--x-shadow);max-width:none !important;}" +
      "html#aikm body #selfshipProshipPanel .nb-sub{max-width:900px;}" +
      "html#aikm body #selfshipProshipPanel .nb-filter-row input#psQ{flex:1;min-width:260px;max-width:520px;}" +
      "html#aikm body #psTable{width:100%;}" +
      "html#aikm body #psTable thead th{position:sticky;top:0;z-index:1;background:var(--x-surface-2);}" +
      "html#aikm body #psTable .ps-addr{max-width:340px;white-space:normal;color:var(--x-text-2);font-size:12px;margin-top:2px;line-height:1.4;}" +
      "html#aikm body #psTable .ps-sla{white-space:nowrap;font-weight:600;}" +
      "html#aikm body #psTable .ps-sla.over{color:var(--x-red);}" +
      "html#aikm body #selfshipProshipPanel .nb-card > div.nb-head{display:flex !important;justify-content:space-between;align-items:flex-start;gap:14px;background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;}" +
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
      "html#aikm body #aikmShipHub{width:100%;margin-bottom:16px;}" +
      "html#aikm body #tab-selfship:not(.hub-old-on) > div.wrap{display:none !important;}" +
      "html#aikm body #tab-selfship.hub-old-on > #aikmShipHub{display:none !important;}" +
      "html#aikm body .hub-top{display:flex;align-items:center;gap:10px;flex-shrink:0;}" +
      "html#aikm body button.hub-old{all:unset;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;font-weight:600;color:var(--x-muted);padding:7px 12px;border-radius:20px;border:1px solid var(--x-line);}" +
      "html#aikm body .hub-tabs{display:flex;gap:4px;margin:18px 0 4px;border-bottom:1px solid var(--x-line);overflow-x:auto;}" +
      "html#aikm body .hub-tabs button{all:unset;cursor:pointer;padding:10px 16px;font-size:13px;font-weight:600;color:var(--x-text-2);border-bottom:3px solid transparent;margin-bottom:-1px;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;}" +
      "html#aikm body .hub-tabs button span{font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:var(--x-surface-2);color:var(--x-text-2);border:1px solid var(--x-line);}" +
      "html#aikm body .hub-tabs button.on{color:var(--x-text);border-bottom-color:#D4AF37;}" +
      "html#aikm body .hub-tabs button.on span{background:#0F1E35;color:#F3E2A6;border-color:#0F1E35;}" +
      "html#aikm body .hub-tabs button.hold span{color:var(--x-red);}" +
      "html#aikm body #hubShipTable{width:100%;}html#aikm body #hubShipTable td{vertical-align:top !important;font-size:12.5px;}" +
      "html#aikm body #hubShipTable thead th{position:sticky;top:0;z-index:1;background:var(--x-surface-2);}" +
      "html#aikm body #hubShipTable .ps-items div+div{margin-top:4px;}html#aikm body #hubShipTable .ps-items b{color:var(--x-gold);}" +
      "html#aikm body #hubShipTable .ps-x{all:unset;cursor:pointer;font-size:11px;color:var(--x-red);text-decoration:underline;}" +
      "html#aikm body .hub-st{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;background:var(--x-surface-2);border:1px solid var(--x-line);color:var(--x-text-2);}" +
      "html#aikm body .hub-st.t{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line);}" +
      "html#aikm body .hub-st.d{background:var(--x-green-soft);color:var(--x-green);border-color:transparent;}" +
      "html#aikm body .hub-st.r{background:var(--x-red-soft);color:var(--x-red);border-color:transparent;}" +
      /* premium + aligned (owner 14 Nov 2026) */
      "html#aikm body #aikmShipHub .nb-card{padding:26px 28px !important;border-radius:16px;}" +
      "html#aikm body #aikmShipHub .nb-title{font-size:22px;letter-spacing:-.01em;}" +
      "html#aikm body #aikmShipHub .nb-kpis{grid-template-columns:repeat(5,minmax(0,1fr)) !important;gap:12px;margin:16px 0 14px;}" +
      "html#aikm body #aikmShipHub .nb-kpi{padding:12px 16px;border-radius:12px;background:var(--x-surface);}" +
      "html#aikm body #aikmShipHub .nb-kpi-n{font-size:22px;}" +
      "html#aikm body #aikmShipHub .nb-kpi.nb-bad{background:var(--x-surface);border:1px solid color-mix(in srgb,var(--x-red) 35%,transparent);}" +
      "html#aikm body #aikmShipHub .nb-filter-row{gap:10px;}" +
      "html#aikm body #aikmShipHub .nb-filter-row :is(input,select,button){height:38px !important;min-height:38px !important;box-sizing:border-box;}" +
      "html#aikm body #aikmShipHub .table-scroll{border:1px solid var(--x-line);border-radius:12px;overflow:auto;max-height:70vh;}" +
      "html#aikm body #aikmShipHub table.data{border-collapse:separate;border-spacing:0;margin:0 !important;}" +
      "html#aikm body #aikmShipHub table.data thead th{font-size:11px !important;letter-spacing:.06em;text-transform:uppercase;color:var(--x-muted) !important;font-weight:700 !important;padding-top:11px !important;padding-bottom:11px !important;border-bottom:1px solid var(--x-line) !important;white-space:nowrap;}" +
      "html#aikm body #aikmShipHub table.data td{padding-top:12px !important;padding-bottom:12px !important;border-bottom:1px solid var(--x-line) !important;}" +
      "html#aikm body #aikmShipHub table.data tr:last-child td{border-bottom:0 !important;}" +
      "html#aikm body #aikmShipHub table.data tbody tr:hover td{background:var(--x-surface-2);}" +
      "html#aikm body #aikmShipHub :is(th,td).r{text-align:right !important;}" +
      "html#aikm body #aikmShipHub td.r .nb-w{margin-left:auto;display:block;text-align:right;}" +
      "html#aikm body #aikmShipHub .hub-pf{font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums;white-space:nowrap;}" +
      "html#aikm body #aikmShipHub .hub-pf.ok{color:var(--x-green);}html#aikm body #aikmShipHub .hub-pf.low{color:var(--x-amber);}html#aikm body #aikmShipHub .hub-pf.neg{color:var(--x-red);}" +
      "html#aikm body #aikmShipHub .hub-pf .nb-loss{font-size:11px;}" +
      "html#aikm body #aikmShipHub #psTable tr.nb-row-loss td{background:color-mix(in srgb,var(--x-red-soft) 55%,transparent) !important;}" +
      "html#aikm body #aikmShipHub .nb-actions{position:sticky;bottom:0;background:var(--x-surface);padding:12px 0 2px;margin-top:0;border-top:1px solid var(--x-line);z-index:2;}" +
      "html#aikm body #aikmShipHub .lb-bar{background:var(--x-surface-2) !important;border:1px solid var(--x-line) !important;border-radius:12px !important;padding:10px 14px !important;margin:0 0 12px !important;}" +
      "html#aikm body #aikmShipHub .lb-bar b.lb-loss{color:var(--x-red) !important;}" +
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
            setLoaded = true; fillSettings(); pickupNote(); if (isOpen()) build();
          }).catch(function () { setLoaded = true; pickupNote(); });
          return;
        }
        var x = s.data() || {};
        Object.assign(settings, x, { skuWeights: Object.assign({}, settings.skuWeights, x.skuWeights || {}) });
        try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
        setLoaded = true; fillSettings(); pickupNote(); if (isOpen()) build();
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
          if (isOpen()) pickRows();
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
        if (isOpen()) renderDates();
        if (typeof window.__aikmCfRefresh === "function") window.__aikmCfRefresh();
      }, function (e) { console.warn("ProShip index read error", e); });
    }
    var idxTimer = setInterval(function () { hookIdx(); if (idxRef) clearInterval(idxTimer); }, 3000);
    setInterval(feedFallback, 30000);

    /* ---------- Shipping dashboard INSIDE Amazon Self-Ship (owner 14 Nov 2026: "make ProShip inside Amazon Self-Ship,
       aggregator dashboard like Shiprocket / NimbusPost"). The old Self-Ship screen (.wrap) is hidden behind "Old tools". ---------- */
    var bar = document.getElementById("mainTabbar"), selfTab = document.getElementById("tab-selfship");
    var tpanel = document.createElement("div");
    tpanel.id = "aikmShipHub";
    selfTab.insertBefore(tpanel, selfTab.firstChild);
    function isOpen() { return selfTab.classList.contains("active"); }
    /* old links /pages/console?tab=proship keep working: a hidden menu item that opens Self-Ship */
    var tbtn = document.createElement("button");
    tbtn.className = "tabbtn"; tbtn.dataset.tab = "proship"; tbtn.style.setProperty("display", "none", "important");
    bar.appendChild(tbtn);
    tbtn.addEventListener("click", function (e) { e.stopImmediatePropagation(); var b = bar.querySelector('.tabbtn[data-tab="selfship"]'); if (b) b.click(); }, true);
    var selfBtn = bar.querySelector('.tabbtn[data-tab="selfship"]');
    if (selfBtn) selfBtn.addEventListener("click", function () { setTimeout(function () { hookPanel(); hookIdx(); fillSettings(); pickupNote(); showConn(); build(); }, 0); });

    /* NimbusPost + Zippy switched off (owner 13 Nov 2026: ProShip ships everything now) — hide their pills, panels and the
       "Upload NimbusPost export" button. Their code stays loaded (other panels read their weight settings). */
    var off = document.createElement("style"); off.id = "aikm-ship-off-css";
    off.textContent = "#fsTabNimbus,#fsTabZippy,#selfshipNimbusPanel,#selfshipZippyPanel,#cfUpload,#cfUpNote,#ndHvBanner{display:none !important;}" +
      /* side-menu items: the menu's own styles use html#aikm ... !important, so this needs the same weight */
      "html#aikm body #mainTabbar .tabbtn[data-tab=\"nimbusdash\"],html#aikm body #mainTabbar .tabbtn[data-tab*=\"zippy\"],html#aikm body .tabbtn[data-tab=\"nimbusdash\"],html#aikm body .tabbtn[data-tab*=\"zippy\"]{display:none !important;}";  // NimbusPost / Zippy off (owner 13 Nov 2026) - side-menu items hidden too
    document.head.appendChild(off);
    /* belt and braces: hide the side-menu buttons inline too (beats any menu style), re-checked as other tabs load */
    var hideOff = function () {
      document.querySelectorAll('.tabbtn[data-tab="nimbusdash"],.tabbtn[data-tab*="zippy"]').forEach(function (b) {
        if (b.style.display !== "none") { b.style.setProperty("display", "none", "important"); if (b.classList.contains("active")) { var c = document.querySelector('.tabbtn[data-tab="courier"]'); if (c) c.click(); } }
      });
    };
    hideOff(); [1500, 4000, 8000, 15000].forEach(function (t) { setTimeout(hideOff, t); });

    /* ---------- panel ---------- */
    var panel = document.createElement("div");
    panel.id = "selfshipProshipPanel";
    function field(id, label, req, cls, type) {
      return '<label class="' + (cls || "") + '"><span>' + label + (req ? " <b>*</b>" : "") + '</span><input type="' + (type || "text") + '" id="' + id + '"' + (type === "number" ? ' step="0.01" min="0.01"' : "") + "></label>";
    }
    panel.innerHTML =
      '<div class="nb-card">' +
        '<div class="nb-head"><div><div class="nb-kicker">AMAZON SELF-SHIP \u00b7 SHIPPING VIA PROSHIP</div>' +
        '<div class="nb-title">Orders</div>' +
        '<div class="nb-sub">Tick \u2192 <b>Ship</b>. AWBs go to OMS Guru and Amazon by themselves. ATS orders go at <b>450 g</b>, others at the weight shown.</div></div>' +
        '<div class="hub-top"><div class="ps-conn" id="psConn"><i class="dot"></i><span id="psConnTxt">Not tested yet</span><button type="button" id="psTest">Test connection</button></div>' +
        '<button type="button" id="hubSet" class="hub-old" title="Pickup address &amp; default box \u2014 saved online for every computer"><i class="ti ti-settings"></i> Settings <span id="hubSetWarn"></span></button>' +
        '<button type="button" id="hubOld" class="hub-old" title="The previous Self-Ship screen (confirmation file, manual tracking)">Old tools</button></div></div>' +
        '<div class="hub-tabs" id="hubTabs"></div>' +

        '<div id="hubSettings" style="display:none;">' +
        '<details class="ps-fold" id="psSetFold" open><summary><i class="ti ti-building-warehouse"></i>Pickup address &amp; default box <span class="nb-muted" id="psSetNote"></span><span id="psSetSaved" class="nb-muted"></span></summary><div>' +
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
        "</div>" +

        '<div class="nb-filter">' +
          '<div class="nb-lbl"><span id="hubDateLbl">SLA date</span> <span class="nb-muted" id="psPoolNote"></span></div>' +
          '<div class="nb-chips" id="psDates"></div>' +
          '<div class="nb-filter-row"><input type="text" id="psQ" autocomplete="off" placeholder="Search order ID, buyer, product, city or PIN">' +
          '<select id="psAcct"><option value="">All accounts</option></select>' +
          '<button type="button" id="psRefresh"><i class="ti ti-refresh"></i> Refresh</button></div>' +
        "</div>" +
        '<div id="psResult" style="display:none;">' +
          '<div class="nb-kpis" id="psKpis"></div>' +
          '<div id="hubShipWrap" style="display:none;"><div class="table-scroll"><table class="data" id="hubShipTable"><thead><tr>' +
            '<th>SLA</th><th>Order</th><th>Buyer</th><th>Items</th><th>AWB &amp; courier</th><th>Status</th><th>Booked</th><th></th>' +
          '</tr></thead><tbody id="hubShipBody"></tbody></table></div></div>' +
          '<div id="psPoolWrap"><div class="table-scroll"><table class="data" id="psTable"><thead><tr>' +
            '<th style="width:28px;"><input type="checkbox" id="psAll" title="Select all"></th><th>SLA</th><th>Order</th><th>Buyer &amp; address</th><th>Items</th><th class="r">Exp. profit</th><th class="r">Weight</th><th>Status</th>' +
          '</tr></thead><tbody id="psBody"></tbody></table></div></div>' +
          '<div class="nb-actions"><button type="button" id="psShip" class="btn-gold"><i class="ti ti-truck-delivery"></i> Ship via ProShip</button>' +
          '<button type="button" id="psLabels"><i class="ti ti-printer"></i> Download labels</button>' +
          '<span id="psNote" class="nb-muted"></span></div>' +
          '<div id="psStatus" class="ps-status" style="display:none;"></div>' +
          '<div id="psLblStatus" class="ps-status" style="display:none;"></div>' +
        "</div>" +
      "</div>";
    tpanel.appendChild(panel);
    function $(id) { return document.getElementById(id); }

    var MAP = { psName: "name", psPhone: "phone", psEmail: "email", psAddr: "address", psCity: "city", psState: "state", psPin: "pin", psGst: "gstin", psW: "weight", psL: "l", psB: "b", psH: "h" };
    function fillSettings() {
      Object.keys(MAP).forEach(function (id) { var el = $(id); if (el && document.activeElement !== el) el.value = settings[MAP[id]] == null ? "" : settings[MAP[id]]; });
    }
    function pickupNote() {
      var miss = pickupReady();
      $("psSetNote").textContent = !setLoaded && miss.length ? "" : miss.length ? "\u00b7 fill this first" : "\u00b7 " + settings.name + ", " + settings.city + " " + settings.pin;
      $("psSetNote").style.color = miss.length ? "var(--x-red)" : "";
      var w = $("hubSetWarn"); if (w) { w.textContent = miss.length && setLoaded ? "\u00b7 pickup address missing" : ""; w.style.color = "var(--x-red)"; }
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
      if (!check.ok) { $("psRateFold").open = true; $("hubSettings").style.display = ""; }
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

    /* Self-Ship sub-menu: "Sync OMS + NimbusPost now" -> "Sync OMS + ProShip now" (NimbusPost is off, owner 14 Nov 2026) */
    function fixSyncBtn() {
      var b = document.querySelector('#subtab-selfship [data-sync-now="oms,nimbus"]');
      if (!b || b.dataset.hubFixed) return;
      var n = b.cloneNode(false); n.dataset.hubFixed = "1"; n.removeAttribute("data-sync-now"); n.className = b.className;
      n.innerHTML = '<i class="ti ti-refresh"></i> Sync OMS + ProShip now'; n.title = "Fetch new OMS Guru orders and refresh ProShip shipment statuses";
      n.addEventListener("click", function () {
        if (typeof window.aikmGhDispatch !== "function") { alert("Please reload the console (Ctrl + Shift + R) and try again."); return; }
        n.disabled = true; n.innerHTML = '<i class="ti ti-loader-2 ps-spin"></i> Syncing\u2026';
        Promise.all([window.aikmGhDispatch("sync-workflow.yml", {}), window.aikmGhDispatch("proship.yml", { mode: "sync" })])
          .then(function () { n.innerHTML = '<i class="ti ti-check"></i> Started \u2014 new data in 2\u20133 min'; })
          .catch(function (e) { alert(e.message || e); })
          .then(function () { setTimeout(function () { n.disabled = false; n.innerHTML = '<i class="ti ti-refresh"></i> Sync OMS + ProShip now'; }, 90000); });
      });
      b.parentNode.replaceChild(n, b);
    }
    fixSyncBtn(); [1500, 5000, 10000, 20000].forEach(function (t) { setTimeout(fixSyncBtn, t); });

    if (isOpen()) setTimeout(function () { hookPanel(); hookIdx(); fillSettings(); pickupNote(); showConn(); build(); }, 0);

    /* ---------- pending self-ship pool (same rules as the NimbusPost / Zippy files) ---------- */
    var pool = [], lastRows = [], selDate = "all", selAcct = "", selQ = "", busy = false, jobRes = {};
    var view = "toship", shipRows = [];
    var VIEWS = [["toship", "To ship"], ["hold", "On hold"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["rto", "RTO / Cancelled"]];
    /* loss rule (same amount as the red Loss bar): flagged orders ship only when profit is above it */
    function lossLimit() { try { var v = localStorage.getItem("aikm_loss_above"); return v === null ? "40" : v; } catch (e) { return "40"; } }
    function profitOk(r) { var l = lossLimit(); return l !== "" && r.profit > +l; }
    function isHold(r) { return r.state !== "ok" || (r.loss && !profitOk(r)); }
    function poolView() { return view === "toship" || view === "hold"; }
    /* shipped side: every ProShip AWB of the last days (one small doc), buyer + items from OMS */
    function stageOf(v) {
      var st = String(v.st || "").toUpperCase();
      if (v.s === "cancelled" || /CANCEL/.test(st) || /RTO|RETURN/.test(st)) return "rto";
      if (/DELIVERED/.test(st)) return "delivered";
      return "shipped";
    }
    function prettySt(v) {
      if (v.s === "cancelled") return "Cancelled";
      var st = String(v.st || "Booked").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      return st === "Order Placed" ? "Pickup pending" : st;
    }
    function buildShipRows() {
      var by = {};
      (window.omsOrdersRaw || []).forEach(function (o) { var k = nid(o.channelOrderId); if (k) (by[k] = by[k] || []).push(o); });
      shipRows = Object.keys(idx).filter(function (k) { return idx[k] && idx[k].a; }).map(function (k) {
        var v = idx[k], live = by[k] || [], o = live[0] || {};
        var items = {}; live.forEach(function (x) { var n = x.productName || x.sku || "Item"; items[n] = (items[n] || 0) + (num(x.qty) || 1); });
        return { id: k, v: v, o: o, sla: ymd(o.slaDate), acct: v.ac || account(o.channel), stage: stageOf(v), items: items };
      });
    }
    function weightFor(items) {
      var tot = 0, all = true;
      items.forEach(function (it) { var w = settings.skuWeights[it.sku] || otherWeights[it.sku]; if (w) tot += w * it.qty; else all = false; });
      return all && tot > 0 ? r2(tot) : num(settings.weight) || DEF.weight;
    }
    /* ---------- expected profit from OUR tool (owner 14 Nov 2026) ----------
       listingIndex/<account> (written by every SP-API sync): per SKU cost c, courier k, GST g, Amazon fee fp. Same maths as the
       price robot and the Loss Orders tab: price + 85% of the buyer's shipping - cost - courier - fees - GST on the margin - Rs 3.
       Falls back to OMS Guru's profit when a SKU has no cost mapped. Re-uses the console's copy (__nbLIX) when it is loaded. */
    var myLix = {}, lixUnsub = null;
    function lixAll() { return window.__nbLIX && Object.keys(window.__nbLIX).length ? window.__nbLIX : myLix; }
    function hookLix() {
      var d = db(); if (lixUnsub || !d || (window.__nbLIX && Object.keys(window.__nbLIX).length)) return;
      lixUnsub = true;
      lixUnsub = d.collection("listingIndex").onSnapshot(function (sn) {
        var m = {}; sn.forEach(function (x) { m[x.id] = x.data() || {}; }); myLix = m; if (isOpen()) setTimeout(buildPool, 0);
      }, function (e) { console.warn("Self-Ship: listing index", e); });
    }
    function acctKey(ch) {
      var n = account(ch).toLowerCase().replace(/[^a-z0-9]/g, ""), ks = Object.keys(lixAll());
      return ks.filter(function (k) { return n === k; })[0] || ks.filter(function (k) { return n.indexOf(k) === 0 || k.indexOf(n) === 0; })[0] || "";
    }
    function listingOf(o) {
      var ix = lixAll()[acctKey(o.channel)]; if (!ix) return null;
      var skus = ix.skus || {}, sku = o.sku;
      if (!skus[sku]) { var ol = (ix.orders || {})[nid(o.channelOrderId)] || []; if (ol.length === 1) sku = ol[0].s; }
      return skus[sku] || null;
    }
    function lineProfit(o) {
      var L = listingOf(o); if (!L || L.c == null || L.k == null) return null;
      var price = num(o.price), q = Math.max(1, num(o.qty) || 1); if (!(price > 0)) return null;
      var g = (L.g != null ? L.g : 5) / 100, fee = L.fp != null ? L.fp : 2, courier = L.k * (1 + 0.25 * (q - 1));
      var gst = g > 0 ? (price - L.c) * g / (1 + g) * q : 0;
      return price * q + 0.85 * num(o.shippingCharge) - L.c * q - courier - fee * q - gst - 3;
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
      var omsLoss = typeof isOmsOrderLoss === "function" && live.some(function (x) { return isOmsOrderLoss(x); });
      r.omsProfit = r2(live.reduce(function (s, x) { return s + (parseFloat(x.profit) || 0); }, 0));
      var ep = 0, all = true; live.forEach(function (x) { var p = lineProfit(x); if (p == null) all = false; else ep += p; });
      r.src = all ? "tool" : "oms";
      r.profit = all ? Math.round(ep) : r.omsProfit;
      var orderVal = live.reduce(function (s, x) { return s + num(x.price) * (num(x.qty) || 1) + num(x.shippingCharge); }, 0);
      /* flagged: our tool's profit decides when it can be worked out (under the robot's rule: Rs 15 or 10% of the order);
         OMS Guru's own flag only for orders our tool cannot price (no cost mapped) */
      r.loss = all ? r.profit < Math.min(15, 0.1 * orderVal) : omsLoss;
      var missing = [];
      if (!String(o.buyerAddress1 || "").trim() && !String(o.buyerAddress2 || "").trim()) missing.push("address");
      if (!/^\d{6}$/.test(String(o.buyerPincode || "").trim())) missing.push("pincode");
      if (!o.buyerCity) missing.push("city");
      if (!o.buyerState) missing.push("state");
      if (missing.length) { r.state = "bad"; r.note = "Missing " + missing.join(", "); }
      return r;
    }
    function buildPool() {
      hookLix();
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
    function viewBase() {
      if (poolView()) return pool.filter(function (r) { return isHold(r) === (view === "hold"); });
      return shipRows.filter(function (r) { return r.stage === view; });
    }
    function acctOf(r) { return r.acct || account(r.o.channel); }
    function renderTabs() {
      buildShipRows();
      var n = { toship: 0, hold: 0, shipped: 0, delivered: 0, rto: 0 };
      pool.forEach(function (r) { if (selAcct && acctOf(r) !== selAcct) return; n[isHold(r) ? "hold" : "toship"]++; });
      shipRows.forEach(function (r) { if (selAcct && acctOf(r) !== selAcct) return; n[r.stage]++; });
      $("hubTabs").innerHTML = VIEWS.map(function (v) {
        return '<button type="button" data-v="' + v[0] + '" class="' + (v[0] === view ? "on " : "") + (v[0] === "hold" ? "hold" : "") + '">' + v[1] + " <span>" + n[v[0]] + "</span></button>";
      }).join("");
      document.querySelectorAll("#hubTabs button").forEach(function (b) { b.addEventListener("click", function () { if (view !== b.dataset.v) { view = b.dataset.v; selDate = "all"; renderDates(); } }); });
    }
    function renderDates() {
      renderTabs();
      $("hubDateLbl").textContent = poolView() ? "SLA date" : "SLA date (for labels)";
      $("psPoolNote").style.display = poolView() ? "" : "none";
      var t = todayYmd(), counts = {}, over = 0, tot = 0;
      viewBase().forEach(function (r) { if (selAcct && acctOf(r) !== selAcct) return; tot++; if (r.sla && r.sla < t) over++; else counts[r.sla || "none"] = (counts[r.sla || "none"] || 0) + 1; });
      var keys = Object.keys(counts).sort();
      var opts = (tot ? [["all", "All orders", tot]] : []).concat(over ? [["overdue", "Overdue", over]] : []).concat(keys.map(function (k) { return [k, k === "none" ? "No SLA date" : niceDay(k), counts[k]]; }));
      if (!opts.some(function (o) { return o[0] === selDate; })) selDate = "all";
      $("psDates").innerHTML = opts.length ? opts.map(function (o) {
        return '<button type="button" class="nb-chip' + (o[0] === selDate ? " on" : "") + (o[0] === "overdue" ? " over" : "") + '" data-k="' + o[0] + '">' + esc(o[1]) + " <span>" + o[2] + "</span></button>";
      }).join("") : '<span class="nb-muted">Nothing here right now.</span>';
      document.querySelectorAll("#psDates .nb-chip").forEach(function (b) { b.addEventListener("click", function () { selDate = b.dataset.k; renderDates(); }); });
      pickRows();
    }
    function pickRows() {
      var t = todayYmd();
      var q = selQ.toLowerCase().replace(/\s+/g, " ").trim();
      if (!poolView()) { renderShip(q, t); return; }
      $("hubShipWrap").style.display = "none"; $("psPoolWrap").style.display = ""; $("psShip").style.display = "";
      lastRows = viewBase().filter(function (r) {
        if (selAcct && account(r.o.channel) !== selAcct) return false;
        if (q) {
          var o = r.o, hay = [r.id, o.buyerName, o.buyerCity, o.buyerState, o.buyerPincode, o.buyerAddress1, o.buyerAddress2, account(o.channel)]
            .concat(r.items.map(function (it) { return it.name + " " + it.sku; })).join(" ").toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        if (selDate === "all") return true;
        if (selDate === "overdue") return r.sla && r.sla < t;
        if (selDate === "none") return !r.sla;
        return r.sla === selDate;
      }).sort(function (a, b) { return (b.loss - a.loss) || (a.sla || "9999").localeCompare(b.sla || "9999") || account(a.o.channel).localeCompare(account(b.o.channel)) || a.id.localeCompare(b.id); });
      lastRows.forEach(function (r) {
        r.ship = liveShip(r.id);
        if (!r.touched) r.sel = r.state === "ok" && !inFile[r.id] && (!r.loss || profitOk(r));
        if (r.state !== "ok" || r.ship) r.sel = false;
      });
      render();
    }
    function build() { buildPool(); }

    function renderShip(q, t) {
      $("psPoolWrap").style.display = "none"; $("hubShipWrap").style.display = ""; $("psShip").style.display = "none";
      var rows = viewBase().filter(function (r) {
        if (selAcct && r.acct !== selAcct) return false;
        if (q) {
          var o = r.o, hay = [r.id, r.v.a, r.v.c, o.buyerName, o.buyerCity, o.buyerPincode, r.acct].concat(Object.keys(r.items)).join(" ").toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        if (selDate === "all") return true;
        if (selDate === "overdue") return r.sla && r.sla < t;
        if (selDate === "none") return !r.sla;
        return r.sla === selDate;
      }).sort(function (a, b) { return (b.v.t || 0) - (a.v.t || 0); });
      var pick = rows.filter(function (r) { return /pickup pending|booked|manifest/i.test(prettySt(r.v)); }).length;
      $("psKpis").innerHTML = kpi("Orders", rows.length, "") +
        (view === "shipped" ? kpi("Pickup pending", pick, pick ? "nb-warnk" : "") + kpi("In transit", rows.length - pick, "nb-ok") : "") +
        kpi("Accounts", Object.keys(rows.reduce(function (m, r) { m[r.acct] = 1; return m; }, {})).length, "");
      $("hubShipBody").innerHTML = rows.length ? rows.slice(0, 1500).map(function (r) {
        var o = r.o, v = r.v, st = prettySt(v), cls = r.stage === "delivered" ? "d" : r.stage === "rto" ? "r" : /pickup pending/i.test(st) ? "" : "t";
        return "<tr>" +
          '<td><div class="ps-sla">' + (r.sla ? esc(niceDay(r.sla)) : '<span class="nb-muted">\u2014</span>') + "</div></td>" +
          '<td><div class="cx-awb">' + esc(r.id) + '</div><div class="nb-muted nb-small">' + esc(r.acct) + "</div></td>" +
          '<td><div class="nb-name">' + esc(o.buyerName || "") + '</div><div class="nb-muted nb-small">' + esc([o.buyerCity, o.buyerPincode].filter(Boolean).join(" \u00b7 ")) + "</div></td>" +
          '<td class="ps-items">' + Object.keys(r.items).map(function (k) { return "<div>" + esc(k) + " <b>\u00d7 " + r.items[k] + "</b></div>"; }).join("") + "</td>" +
          '<td><div class="cx-awb">' + esc(v.a) + '</div><div class="nb-muted nb-small">' + esc(v.c || "ProShip") + "</div></td>" +
          '<td><span class="hub-st ' + cls + '">' + esc(st) + "</span></td>" +
          '<td class="nb-muted nb-small">' + (v.t ? esc(when(v.t)) : "") + "</td>" +
          "<td>" + (r.stage === "shipped" && /pickup pending|booked|manifest/i.test(st) ? '<button type="button" class="ps-x" data-awb="' + esc(v.a) + '" data-id="' + esc(r.id) + '">Cancel</button>' : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="8" class="nb-muted" style="text-align:center;padding:22px !important;">Nothing here.</td></tr>';
      $("hubShipBody").querySelectorAll(".ps-x").forEach(function (b) { b.addEventListener("click", function () { cancelShip(b.dataset.id, b.dataset.awb); }); });
      $("psResult").style.display = "block";
      $("psNote").textContent = view === "shipped" ? "Labels: pick an SLA date above, then Download labels." : "";
    }
    function kpi(l, n, cls) { return '<div class="nb-kpi ' + cls + '"><div class="nb-kpi-n">' + n + '</div><div class="nb-kpi-l">' + l + "</div></div>"; }
    function render() {
      var sel = 0, bad = 0, done = 0, loss = 0;
      var selP = 0; lastRows.forEach(function (r) { if (r.sel) { sel++; selP += r.profit || 0; } if (r.state !== "ok") bad++; if (r.ship) done++; if (r.loss) loss++; });
      $("psKpis").innerHTML =
        kpi(view === "hold" ? "On hold" : "Orders to ship", lastRows.length, "") + kpi("Selected to ship", sel, "nb-ok") + kpi("Expected profit (selected)", rs(Math.round(selP)), selP < 0 ? "nb-bad" : "nb-ok") +
        kpi("Loss / low profit", loss, loss ? "nb-bad" : "") + kpi("Need a fix", bad, bad ? "nb-bad" : "");
      var body = $("psBody");
      body.innerHTML = lastRows.length ? lastRows.map(function (r, i) {
        var o = r.o, ok = r.state === "ok", sh = r.ship, f = inFile[r.id], err = jobRes[r.id] && jobRes[r.id].e;
        var tag = sh ? "nb-tag-ok" : !ok || err || r.loss ? "nb-tag-bad" : f ? "nb-tag-warn" : "nb-tag-ok";
        var note = sh ? "Shipped \u00b7 " + (sh.c || "ProShip") : !ok ? r.note : err ? "Not shipped" : r.loss ? (profitOk(r) ? "Low profit \u00b7 shipping" : r.profit < 0 ? "Real loss \u2014 on hold" : "Profit below \u20b9" + lossLimit() + " \u2014 on hold") : f ? "In " + f.w + " file " + when(f.t) : "Ready";
        var jr = jobRes[r.id] || {};
        var under = sh ? '<div class="cx-awb" style="margin-top:5px;">' + esc(sh.a) + "</div>" +
          (jr.g ? '<div class="nb-muted nb-small">' + (jr.ats ? "ATS \u00b7 " : "") + "sent " + jr.g + " g</div>" : "") +
          (jr.warn ? '<div class="nb-small" style="color:var(--x-red);max-width:240px;white-space:normal;margin-top:3px;">\u26a0 ' + esc(jr.warn) + "</div>" : "") +
          '<button type="button" class="ps-x" data-awb="' + esc(sh.a) + '" data-id="' + esc(r.id) + '">Cancel shipment</button>'
          : err ? '<div class="nb-muted nb-small" style="margin-top:5px;max-width:220px;white-space:normal;">' + esc(err) + "</div>" : "";
        return '<tr class="' + (r.sel || sh ? "" : "nb-row-out") + (r.loss && !sh ? " nb-row-loss" : "") + '">' +
          '<td><input type="checkbox" class="ps-sel" data-i="' + i + '"' + (r.sel ? " checked" : "") + (ok && !sh ? "" : " disabled") + "></td>" +
          '<td><div class="ps-sla' + (r.sla && r.sla < todayYmd() ? " over" : "") + '">' + (r.sla ? esc(niceDay(r.sla)) : '<span class="nb-muted">\u2014</span>') + "</div>" +
            (r.sla && r.sla < todayYmd() ? '<div class="nb-small" style="color:var(--x-red);">Overdue</div>' : "") + "</td>" +
          '<td><div class="cx-awb">' + esc(r.id) + '</div><div class="nb-muted nb-small">' + esc(account(o.channel)) + "</div>" +
            '<div style="margin-top:6px;">' + (r.isCod ? '<span class="nb-pay nb-cod">COD ' + rs(r.cod) + "</span>" : '<span class="nb-pay">Prepaid</span>') + "</div></td>" +
          '<td><div class="nb-name">' + esc(o.buyerName || "") + "</div>" +
            '<div class="ps-addr">' + esc([o.buyerAddress1, o.buyerAddress2].filter(Boolean).join(", ")) + "</div>" +
            '<div class="nb-muted nb-small">' + esc([o.buyerCity, o.buyerState, o.buyerPincode].filter(Boolean).join(" \u00b7 ")) + "</div></td>" +
          '<td class="ps-items">' + r.items.map(function (it) { return "<div>" + esc(it.name) + " <b>\u00d7 " + it.qty + '</b> <span class="nb-muted nb-small">' + rs(it.price) + "</span></div>"; }).join("") + "</td>" +
          '<td class="r"><div class="hub-pf ' + (r.profit < 0 ? "neg" : r.loss && !profitOk(r) ? "low" : "ok") + '"' +
            (r.src === "oms" ? ' title="No cost mapped for this product in the Amazon tool - OMS Guru profit shown"' : ' title="Our tool: price + 85% shipping - cost - courier - Amazon fees - GST on margin - Rs 3 (OMS Guru says ' + rs(r.omsProfit) + ')"') + ">" +
            (r.loss ? '<span class="nb-loss">LOSS \u00b7 ' + rs(r.profit) + "</span>" : rs(r.profit)) + "</div>" +
            '<div class="nb-muted nb-small">' + (r.src === "tool" ? "our calc" : "OMS") + "</div></td>" +
          '<td class="r"><input type="number" step="0.01" min="0.01" class="nb-w" data-i="' + i + '" value="' + r.weight + '"' + (sh ? " disabled" : "") + "></td>" +
          '<td><span class="nb-tag ' + tag + '">' + esc(note) + "</span>" + under + "</td></tr>";
      }).join("") : '<tr><td colspan="8" class="nb-muted" style="text-align:center;padding:22px !important;">' + (pool.length ? "No orders here." : "No self-ship orders waiting right now.") + "</td></tr>";
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
      var okRows = lastRows.filter(function (r) { return r.state === "ok" && !r.ship && (view === "hold" || !r.loss || profitOk(r)); });
      $("psAll").checked = okRows.length > 0 && okRows.every(function (r) { return r.sel; });
      $("psResult").style.display = "block";
      $("psShip").disabled = !sel || busy;
      $("psShip").innerHTML = busy ? '<i class="ti ti-loader-2 ps-spin"></i> Shipping\u2026' : '<i class="ti ti-truck-delivery"></i> Ship ' + (sel ? sel + " order" + (sel > 1 ? "s" : "") + " " : "") + "via ProShip";
      $("psNote").textContent = busy ? "" : sel ? "" : done && done === lastRows.length ? "All orders in this view are shipped." : "Tick at least one order.";
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
        if ((st === "queued" || st === "running") && age > 150 * 60000) { st = "failed"; j.step = "The server did not finish this job. Check the rows below, then try again."; }
        else if (st !== "queued" && st !== "running" && age > 12 * 3600e3) { // yesterday's job: nothing to show
          try { localStorage.removeItem(LAST); } catch (e) {} busy = false; jobRes = {}; $("psStatus").style.display = "none"; if (unsub) { unsub(); unsub = null; } pickRows(); return;
        }
        if (st === "queued" || st === "running") {
          busy = true; jobRes = j.results || {};
          show("psStatus", "<b>" + (j.total || j.count || "") + " orders</b> \u2014 " + esc(j.step || "Starting on the server\u2026") + ' <span class="nb-muted">(about 1 minute per 100 orders \u2014 you can switch tabs or close this page, it keeps running)</span>', "run");
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
      if (miss.length) { $("hubSettings").style.display = ""; alert("Fill the pickup address first:\n\u2022 " + miss.join("\n\u2022 ")); $("psName").focus(); return; }
      var rows = lastRows.filter(function (r) { return r.sel && r.state === "ok" && !r.ship; });
      if (!rows.length) return;
      if (rows.length > 2000) { alert("Please ship at most 2,000 orders at a time (" + rows.length + " ticked)."); return; }
      var L = rows.filter(function (r) { return r.loss; });
      if (L.length && !confirm("\u26a0 " + L.length + " LOSS order(s) selected:\n\n" + L.slice(0, 15).map(function (r) { return "\u2022 " + r.id + "  " + rs(r.profit); }).join("\n") + "\n\nShip these loss orders anyway?")) return;
      var again = rows.filter(function (r) { return inFile[r.id]; });
      if (again.length && !confirm(again.length + " selected order(s) were already put in a NimbusPost or Zippy file. If that file was uploaded, they will ship TWICE.\n\nShip them through ProShip anyway?")) return;
      if (!confirm("Create " + rows.length + " shipment" + (rows.length > 1 ? "s" : "") + " in ProShip now?\n\nShipping charges are taken from the ProShip wallet. Pickup from: " + settings.name + ", " + settings.city + " " + settings.pin)) return;
      var ids = {}; rows.forEach(function (r) { ids[r.id] = r.weight; });
      busy = true; jobRes = {}; render();
      show("psStatus", "<b>" + rows.length + " orders</b> \u2014 starting on the server\u2026", "run");
      var ref = d.collection("proshipJobs").doc();
      // a console tab left open for long can lose its Firebase connection: then the save waits for ever and the
      // button stays on "Shipping\u2026" (owner 13 Nov 2026). Wake the connection after 15 s, give up after 60 s.
      var saved = false, nudge = setTimeout(function () { if (!saved) { show("psStatus", "<b>" + rows.length + " orders</b> \u2014 reconnecting to the server\u2026", "run"); try { d.enableNetwork(); } catch (e) {} } }, 15000);
      var giveUp = new Promise(function (_, rej) { setTimeout(function () { if (!saved) rej(new Error("No connection to the server. Press Ctrl + Shift + R to reload the page, then click Ship again \u2014 nothing was shipped.")); }, 60000); });
      Promise.race([ref.set({ status: "queued", step: "Waiting for the server\u2026", ids: ids, count: rows.length, sla: selDate,
        box: { l: num(settings.l) || DEF.l, b: num(settings.b) || DEF.b, h: num(settings.h) || DEF.h },
        pickup: { name: settings.name, phone: phone10(settings.phone), email: settings.email, address: settings.address, city: settings.city, state: settings.state, pin: String(settings.pin).trim(), gstin: settings.gstin || "" },
        createdAt: firebase.firestore.FieldValue.serverTimestamp() }), giveUp])
        .then(function () { saved = true; clearTimeout(nudge); try { localStorage.setItem(LAST, ref.id); } catch (e) {} watch(ref.id); return dispatch({ mode: "ship", job_id: ref.id }); })
        .catch(function (e) {
          clearTimeout(nudge);
          busy = false; show("psStatus", "Could not start: " + esc(e.message || e), "bad"); render();
          if (!saved) { ref.delete().catch(function () {}); return; } // a late save must not leave a job behind
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
      if (!sla) { alert("Labels are made per SLA date.\n\nClick one date chip above (e.g. \u201cToday\u201d), then Download labels."); return; }
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
    $("hubSet").addEventListener("click", function () { var h = $("hubSettings"); h.style.display = h.style.display === "none" ? "" : "none"; });
    $("hubOld").addEventListener("click", function () {
      selfTab.classList.add("hub-old-on");
      if (!$("hubBack")) {
        var back = document.createElement("button"); back.type = "button"; back.id = "hubBack"; back.className = "hub-old";
        back.style.cssText = "margin:0 0 12px;display:inline-block;"; back.textContent = "\u2190 Back to the new Orders screen";
        back.addEventListener("click", function () { selfTab.classList.remove("hub-old-on"); });
        var w = selfTab.querySelector(":scope > div.wrap"); if (w) w.insertBefore(back, w.firstChild);
      }
    });
    $("psLabels").addEventListener("click", labels);
    $("psRefresh").addEventListener("click", function () { loadInFile(); build(); });
    $("psAcct").addEventListener("change", function (e) { selAcct = e.target.value; renderDates(); });
    var qT; $("psQ").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { selQ = $("psQ").value; pickRows(); }, 150); });
    $("psAll").addEventListener("change", function (e) {
      lastRows.forEach(function (r) { if (r.state === "ok" && !r.ship && (view === "hold" || !r.loss || profitOk(r) || !e.target.checked)) { r.sel = e.target.checked; r.touched = true; } }); render();
    });
    setInterval(function () { if (isOpen() && !busy && document.activeElement && !document.activeElement.classList.contains("nb-w") && document.activeElement.id !== "psQ") buildPool(); }, 60000);
    try { var last = localStorage.getItem(LAST); if (last) { var lt = setInterval(function () { if (db()) { clearInterval(lt); watch(last); } }, 3000); } } catch (e) {}
    window.__proshipBuild = build; window.__proshipRows = function () { return lastRows; };
  }
})();

/* ===== DO NOT REMOVE - loads the bulk "tick loss orders" bar (console/loss-bulk.js) for the confirmation, ProShip,
   NimbusPost and Zippy tables (owner 13 Nov 2026). Keep this block when replacing proship-tab.js. ===== */
(function () { try { if (document.getElementById("aikmLossBulkJs")) return;
  function add(ref) { if (document.getElementById("aikmLossBulkJs")) return; var s = document.createElement("script"); s.id = "aikmLossBulkJs"; s.defer = true;
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/loss-bulk.js"; document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/loss-bulk.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();
