/* AIKM console — premium look (owner 23 Nov 2026, "apply" the Self-Ship redesign preview to the whole console).
   A design layer only: colours, sidebar, page header, cards, tabs, tables, buttons. No data, no Firebase, no behaviour changes.
   Switch: open the console with ?theme=premium (or ?theme=classic to go back); the choice is kept per browser
   (localStorage aikm_theme). Default = premium once AIKM_PREMIUM_DEFAULT is true below. */
(function () {
  "use strict";
  if (window.__aikmPremTheme) return; window.__aikmPremTheme = 1;
  var AIKM_PREMIUM_DEFAULT = false;
  var KEY = "aikm_theme", root = document.documentElement;
  function getPref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setPref(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  try {
    var q = new URLSearchParams(location.search).get("theme");
    if (q === "premium" || q === "classic") setPref(q);
  } catch (e) {}
  var pref = getPref();
  var on = pref ? pref === "premium" : AIKM_PREMIUM_DEFAULT;
  if (window.AIKM_EMBED) on = false;

  var P = "html#aikm.aikm-prem body";
  var css = [
    /* ---------- palette (dark default, light toggle) ---------- */
    P + "{--x-bg:#070C15;--x-surface:#0E1624;--x-surface-2:#0B121F;--x-raise:#141F33;--x-line:#1A2638;--x-line-2:#24324B;" +
      "--x-text:#EEF1F6;--x-text-2:#C2CAD8;--x-muted:#7C879B;--x-gold:#E7C866;--x-gold-2:#F2D886;--x-gold-soft:rgba(231,200,102,.12);--x-gold-line:rgba(231,200,102,.32);" +
      "--x-green:#5FC184;--x-green-soft:rgba(95,193,132,.12);--x-red:#F0787A;--x-red-soft:rgba(240,120,122,.12);--x-amber:#E9B04F;--x-amber-soft:rgba(233,176,79,.12);" +
      "--x-primary:#D4AF37;--x-primary-ink:#1A1405;--x-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 18px 40px -22px rgba(0,0,0,.7);" +
      "--x-radius:18px;--x-radius-sm:11px;--x-side:#060A12;--x-side-line:#121B2B;--x-side-text:#9AA6BA;--x-side-hi:#FFFFFF;}",
    P + "[data-theme=\"light\"]{--x-bg:#F5F3EE;--x-surface:#FFFFFF;--x-surface-2:#FAF8F4;--x-raise:#F3F0E8;--x-line:#ECE8DF;--x-line-2:#E2DDD1;" +
      "--x-text:#0E1A2E;--x-text-2:#3D4759;--x-muted:#7D8494;--x-gold:#B8901F;--x-gold-2:#9A7614;--x-gold-soft:#F7EFD6;--x-gold-line:#E8D494;" +
      "--x-green:#167A4A;--x-green-soft:#E4F3EA;--x-red:#B42318;--x-red-soft:#FCE9E7;--x-amber:#A15C07;--x-amber-soft:#FDF1DB;" +
      "--x-primary:#0F1E35;--x-primary-ink:#FFFFFF;--x-shadow:0 1px 2px rgba(14,26,46,.04),0 12px 32px -18px rgba(14,26,46,.22);" +
      "--x-side:#0D1828;--x-side-line:#16243A;--x-side-text:#9AA6BA;--x-side-hi:#FFFFFF;}",
    P + "{font-family:Inter,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;-webkit-font-smoothing:antialiased;}",

    /* ---------- sidebar: full width with labels + groups (desktop) ---------- */
    "@media screen and (min-width:901px){" +
      P + " .app-shell > .app-sidebar{width:248px !important;background:var(--x-side) !important;border-right:1px solid var(--x-side-line) !important;box-shadow:none !important;padding:16px 12px 14px !important;box-sizing:border-box !important;display:flex !important;flex-direction:column !important;}" +
      P + " .app-shell > .app-sidebar > *{width:auto !important;min-width:0 !important;}" +
      P + " .app-shell > .app-main{margin-left:248px !important;width:calc(100% - 248px) !important;}" +
      P + " .app-sidebar .topbar{min-height:0 !important;padding:4px 8px 16px !important;border:0 !important;background:transparent !important;}" +
      P + " .app-sidebar .topbar::after{display:none !important;}" +
      P + " .app-sidebar .topbar > :not(.aikm-pbrand){display:none !important;}" +
      P + " .aikm-pbrand{display:flex;align-items:center;gap:11px;}" +
      P + " .aikm-pbrand .m{width:36px;height:36px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:linear-gradient(140deg,#F2D886,#C9A43A);color:#1A1405;font:600 17px/1 Lexend,Inter,sans-serif;box-shadow:0 6px 16px -6px rgba(201,164,58,.6);}" +
      P + " .aikm-pbrand b{display:block;font:500 15px/1.2 Lexend,Inter,sans-serif;color:#fff;letter-spacing:-.01em;}" +
      P + " .aikm-pbrand span{display:block;font:400 11.5px/1.3 Inter,sans-serif;color:#66728A;margin-top:2px;text-transform:none;letter-spacing:0;}" +
      P + " .app-sidebar .tabbar{padding:0 !important;gap:0 !important;display:flex !important;flex-direction:column !important;}" +
      P + " .app-sidebar .tabbtn{display:flex !important;align-items:center !important;gap:11px !important;height:38px !important;min-height:38px !important;padding:0 12px !important;margin:1px 0 !important;border-radius:11px !important;border:0 !important;background:transparent !important;box-shadow:none !important;color:var(--x-side-text) !important;font:500 13.5px/1 Inter,system-ui,sans-serif !important;letter-spacing:0 !important;text-transform:none !important;transition:background .15s,color .15s !important;}" +
      P + " .app-sidebar .tabbtn:hover{background:rgba(255,255,255,.05) !important;color:#fff !important;}" +
      P + " .app-sidebar .tabbtn .tab-ic{color:inherit !important;font-size:17px !important;opacity:.9;}" +
      P + " .app-sidebar .tabbtn.active{background:linear-gradient(90deg,rgba(231,200,102,.17),rgba(231,200,102,.04)) !important;color:#fff !important;box-shadow:inset 2px 0 0 #E7C866 !important;}" +
      P + " .app-sidebar .tabbtn.active .tab-ic{color:#E7C866 !important;opacity:1;}" +
      P + " .app-sidebar .tabbtn.active::before{display:none !important;}" +
      P + " .app-sidebar .tabbtn .rtab-count{margin-left:auto !important;position:static !important;width:auto !important;height:auto !important;min-width:18px !important;padding:2px 7px !important;border-radius:7px !important;font:600 11px/1.2 Lexend,Inter,sans-serif !important;color:#1A1405 !important;background:#E7C866 !important;}" +
      P + " .app-sidebar .aikm-pgrp{font:600 10.5px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#4D5A72;padding:16px 12px 7px;}" +
      P + " .app-sidebar .aikm-pgrp:first-child{padding-top:4px;}" +
      P + " .app-sidebar .backend-access{margin-top:auto !important;border-radius:12px !important;color:var(--x-side-text) !important;}" +
    "}",

    /* ---------- top bar: frosted ---------- */
    P + " .app-header{background:color-mix(in srgb,var(--x-bg) 80%,transparent) !important;-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--x-line) !important;box-shadow:none !important;}",
    P + " .app-content{padding:26px 34px 56px !important;}",

    /* ---------- page header (the bar under the top bar) ---------- */
    P + " .app-content .subtabbar, html#aikm.aikm-prem body #subtab-selfship{background:transparent !important;border:0 !important;box-shadow:none !important;padding:2px 0 20px !important;margin:0 0 4px !important;gap:10px !important;}",
    P + " .app-content .subtabbar .subtab-label, html#aikm.aikm-prem body #subtab-selfship .subtab-label{font:600 28px/1.15 Lexend,Inter,sans-serif !important;letter-spacing:-.025em !important;color:var(--x-text) !important;text-transform:none !important;margin-right:auto !important;}",
    P + " .app-content .subtabbar :is(button,.sn-btn,.pe-btn), html#aikm.aikm-prem body #subtab-selfship :is(button,.sn-btn,.pe-btn){height:40px !important;min-height:40px !important;padding:0 15px !important;border-radius:12px !important;font:600 13px/1 Inter,system-ui,sans-serif !important;box-shadow:var(--x-shadow) !important;}",

    /* ---------- cards + KPIs ---------- */
    P + " .tabpanel .nb-card{border-radius:20px !important;border:1px solid var(--x-line) !important;background:var(--x-surface) !important;box-shadow:var(--x-shadow) !important;}",
    P + " .tabpanel :is(.nb-kpi,.cx-kpi){border-radius:16px !important;border:1px solid var(--x-line) !important;background:var(--x-surface) !important;box-shadow:var(--x-shadow) !important;padding:16px 18px !important;}",
    P + " .tabpanel :is(.nb-kpi-n,.cx-kpi-num){font-family:Lexend,Inter,sans-serif !important;font-weight:600 !important;font-size:26px !important;letter-spacing:-.02em !important;font-variant-numeric:tabular-nums;}",
    P + " .tabpanel :is(.nb-kpi-l,.cx-kpi-label){font-size:12px !important;color:var(--x-muted) !important;letter-spacing:.01em !important;text-transform:none !important;}",

    /* ---------- Self-Ship status tabs -> segmented control ---------- */
    P + " .hub-tabs{display:inline-flex !important;gap:2px !important;padding:4px !important;border-radius:13px !important;background:var(--x-surface-2) !important;border:1px solid var(--x-line) !important;}",
    P + " .hub-tabs button{padding:8px 14px !important;border-radius:9px !important;border-bottom:0 !important;margin:0 !important;color:var(--x-muted) !important;font-weight:600 !important;}",
    P + " .hub-tabs button:hover{color:var(--x-text) !important;}",
    P + " .hub-tabs button.on{background:var(--x-surface) !important;color:var(--x-text) !important;box-shadow:0 1px 2px rgba(14,26,46,.1),0 0 0 1px var(--x-line) !important;}",
    P + " .hub-tabs button.on span{background:var(--x-gold-soft) !important;color:var(--x-gold) !important;border-color:transparent !important;}",

    /* ---------- tables ---------- */
    P + " .tabpanel table thead th{font:600 11px/1.3 Inter,system-ui,sans-serif !important;letter-spacing:.07em !important;text-transform:uppercase !important;color:var(--x-muted) !important;background:var(--x-surface-2) !important;border-bottom:1px solid var(--x-line) !important;}",
    P + " .tabpanel table tbody td{border-bottom-color:var(--x-line) !important;}",
    P + " .tabpanel table tbody tr{transition:background .12s;}",
    P + " .tabpanel table tbody tr:hover > td{background-color:color-mix(in srgb,var(--x-raise) 70%,transparent) !important;}",

    /* ---------- fields ---------- */
    P + " .tabpanel :is(input[type=text],input[type=search],input[type=number],input[type=date],select){border-radius:11px !important;border-color:var(--x-line-2) !important;background-color:var(--x-surface-2) !important;}",
    P + " .tabpanel :is(input[type=text],input[type=search],input[type=number],select):focus{border-color:var(--x-gold) !important;box-shadow:0 0 0 3px var(--x-gold-soft) !important;outline:0 !important;}",

    /* ---------- look switch (bottom of the sidebar) ---------- */
    "#aikmLook{position:static;margin:10px 4px 0;flex:none;display:none;align-items:center;justify-content:center;gap:8px;height:30px;padding:0 12px;border-radius:10px;border:1px solid #1C2A40;background:#0F1B2D;color:#9AA6BA;font:600 11.5px/1 Inter,system-ui,sans-serif;cursor:pointer;}",
    "#aikmLook:hover{color:#fff;}",
    "html#aikm.aikm-prem #aikmLook{display:inline-flex;}",
    "@media (max-width:900px){#aikmLook{display:none !important;}}"
  ].join("\n");

  /* side menu groups (buttons moved into order; their own click handlers stay) */
  var GROUPS = [
    ["Ship", ["selfship", "easyship", "nimbusdash", "courier", "orders", "labelprinter", "rto"]],
    ["Money", ["lossorders", "refund", "complaints"]],
    ["Stock", ["lotsproducts", "omsorders"]],
    ["Files", ["documents"]]
  ];
  function groupMenu() {
    var bar = document.getElementById("mainTabbar") || document.querySelector(".app-sidebar .tabbar");
    if (!bar || bar.getAttribute("data-prem-grouped")) return !!bar;
    var used = {};
    GROUPS.forEach(function (g) {
      var label = document.createElement("div"); label.className = "aikm-pgrp"; label.textContent = g[0];
      var any = false, frag = document.createDocumentFragment(); frag.appendChild(label);
      g[1].forEach(function (t) {
        var b = bar.querySelector('.tabbtn[data-tab="' + t + '"]');
        if (b) { frag.appendChild(b); used[t] = 1; any = true; }
      });
      if (any) bar.appendChild(frag);
    });
    /* tabs not in a group (new ones, hidden ones) keep going after the groups */
    [].slice.call(bar.querySelectorAll(".tabbtn")).forEach(function (b) { if (!used[b.getAttribute("data-tab")]) bar.appendChild(b); });
    bar.setAttribute("data-prem-grouped", "1");
    return true;
  }

  function brand() {
    var tb = document.querySelector(".app-sidebar .topbar");
    if (!tb || tb.querySelector(".aikm-pbrand")) return;
    var d = document.createElement("div"); d.className = "aikm-pbrand";
    d.innerHTML = '<div class="m">A</div><div><b>AIKM Ops</b><span>AIKM Pharma Pvt Ltd</span></div>';
    tb.insertBefore(d, tb.firstChild);
  }
  function apply() {
    if (!document.getElementById("aikm-prem-css")) {
      var st = document.createElement("style"); st.id = "aikm-prem-css"; st.textContent = css; document.head.appendChild(st);
    }
    if (!document.querySelector('link[data-aikm-prem-font]')) {
      var l = document.createElement("link"); l.rel = "stylesheet"; l.setAttribute("data-aikm-prem-font", "1");
      l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@400;500;600&display=swap";
      document.head.appendChild(l);
    }
    root.classList.add("aikm-prem");
    /* the slim icon rail is replaced by the full menu: keep the shell's "open" state on */
    root.classList.add("aikm-rail-open");
    new MutationObserver(function () {
      if (root.classList.contains("aikm-prem") && !root.classList.contains("aikm-rail-open") && window.innerWidth > 900) root.classList.add("aikm-rail-open");
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
    var tries = 0, t = setInterval(function () { var ok = groupMenu(); brand(); if (ok || ++tries > 40) clearInterval(t); }, 500);
  }

  function addSwitch() {
    var ex = document.getElementById("aikmLook"), sd = document.querySelector(".app-sidebar");
    if (ex) { if (sd && ex.parentNode !== sd) sd.appendChild(ex); return; }
    var b = document.createElement("button"); b.type = "button"; b.id = "aikmLook";
    b.title = "Switch back to the classic console look";
    b.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#E7C866"></span>New look · back to classic';
    b.onclick = function () { setPref("classic"); location.reload(); };
    var side = document.querySelector(".app-sidebar");
    (side || document.body).appendChild(b);
  }

  function start() { if (on) { apply(); var n = 0, t = setInterval(function () { addSwitch(); if (document.querySelector(".app-sidebar #aikmLook") || ++n > 40) clearInterval(t); }, 500); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.aikmPremium = function (v) { setPref(v ? "premium" : "classic"); location.reload(); };
})();
