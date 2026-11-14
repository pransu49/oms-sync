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
      "html#aikm body #hubShipTable{width:100%;border-collapse:separate;border-spacing:0;}" +
      "html#aikm body #hubShipTable thead th{position:sticky;top:0;z-index:1;background:#FBF9F4 !important;font-size:10.5px !important;letter-spacing:.06em;padding:9px 10px !important;white-space:nowrap;}" +
      "html#aikm body #hubShipTable td{vertical-align:middle !important;font-size:12.5px;padding:7px 10px !important;border-bottom:1px solid #F0ECE2 !important;line-height:1.3;}" +
      "html#aikm body #hubShipTable tbody tr{transition:background .12s;}html#aikm body #hubShipTable tbody tr:hover td{background:#FCFBF7 !important;}" +
      "html#aikm body #hubShipTable tr.hs-on td{background:#FBF5E6 !important;}html#aikm body #hubShipTable tr.hs-on td:first-child{box-shadow:inset 3px 0 0 #C9A24B;}" +
      "html#aikm body #hubShipTable .hs-ck{width:30px;padding-right:0 !important;}html#aikm body #hubShipTable .hs-ck input{accent-color:#0F1E35;width:15px;height:15px;}" +
      "html#aikm body #hubShipTable .hs-nw{white-space:nowrap;}" +
      "html#aikm body #hubShipTable .hs-mono{display:block;font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#14213D;letter-spacing:.01em;}" +
      "html#aikm body #hubShipTable .hs-acc,html#aikm body #hubShipTable .hs-cour,html#aikm body #hubShipTable .hs-buy span,html#aikm body #hubShipTable .hs-time span{display:block;font-size:10.5px;color:#8B909B;margin-top:2px;letter-spacing:.02em;}" +
      "html#aikm body #hubShipTable .hs-acc{text-transform:uppercase;font-weight:600;}" +
      "html#aikm body #hubShipTable .hs-cour{font-weight:600;color:#B08A36;}" +
      "html#aikm body #hubShipTable .hs-buy{max-width:200px;}html#aikm body #hubShipTable .hs-buy b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      "html#aikm body #hubShipTable .hs-buy span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      "html#aikm body #hubShipTable .hs-it{max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}" +
      "html#aikm body #hubShipTable .hs-it em{font-style:normal;font-weight:700;color:#B08A36;}html#aikm body #hubShipTable .hs-more{font-style:normal;font-size:10.5px;font-weight:700;background:#F1F0EC;color:#4A5468;border-radius:10px;padding:1px 6px;}" +
      "html#aikm body #hubShipTable .hs-time{font-size:12px;color:#4A5468;}" +
      "html#aikm body #hubShipTable .hs-act{width:1%;white-space:nowrap;text-align:right;}" +
      "html#aikm body #hubShipTable .hs-ib{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;padding:0 9px;box-sizing:border-box;border-radius:8px;border:1px solid #E7E1D3;background:#fff;font-size:12px;font-weight:600;color:#0F1E35;margin-left:5px;transition:all .12s;}" +
      "html#aikm body #hubShipTable .hs-ib:hover{background:#0F1E35;border-color:#0F1E35;color:#fff;}html#aikm body #hubShipTable .hs-ib[disabled]{opacity:.6;pointer-events:none;}" +
      "html#aikm body #hubShipTable .hs-cx{padding:0;width:28px;color:#B42318;}html#aikm body #hubShipTable .hs-cx:hover{background:#B42318;border-color:#B42318;color:#fff;}" +
      "html#aikm body #hubLblPill{position:fixed;right:22px;bottom:84px;z-index:2147483000;display:none;align-items:center;gap:10px;background:#0F1E35;color:#fff;border-radius:12px;padding:11px 15px;font:500 12.5px Inter,system-ui,sans-serif;box-shadow:0 12px 34px rgba(15,30,53,.3);border-left:3px solid #C9A24B;max-width:360px;}" +
      "html#aikm body #hubLblPill b{color:#E3C47A;font-variant-numeric:tabular-nums;}html#aikm body #hubLblPill a{color:#E3C47A;font-weight:700;}html#aikm body #hubLblPill .x{cursor:pointer;opacity:.6;margin-left:4px;}" +
      "html#aikm body #hubLblPill .sp{width:14px;height:14px;border:2px solid rgba(255,255,255,.25);border-top-color:#C9A24B;border-radius:50%;animation:hubspin2 .8s linear infinite;flex:none;}@keyframes hubspin2{to{transform:rotate(360deg)}}" +
      "html#aikm body .hub-st{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;background:var(--x-surface-2);border:1px solid var(--x-line);color:var(--x-text-2);}" +
      "html#aikm body .hub-st.t{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line);}" +
      "html#aikm body .hub-st.d{background:var(--x-green-soft);color:var(--x-green);border-color:transparent;}" +
      "html#aikm body .hub-st.r{background:var(--x-red-soft);color:var(--x-red);border-color:transparent;}" +
      /* premium + aligned (owner 14 Nov 2026) */
      "html#aikm body #aikmShipHub .nb-card{padding:26px 28px !important;border-radius:16px;}" +
      "html#aikm body #aikmShipHub .nb-title{font-size:22px;letter-spacing:-.01em;}" +
      "html#aikm body #aikmShipHub .nb-kpis{grid-template-columns:repeat(6,minmax(0,1fr)) !important;gap:12px;margin:16px 0 14px;}" +
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
      "html#aikm body #aikmShipHub .hub-sub{font-size:9.5px;font-weight:600;letter-spacing:.04em;text-transform:none;color:var(--x-muted);margin-top:2px;}" +
      "html#aikm body #aikmShipHub .hub-oms{font-size:11.5px;color:var(--x-text-2);margin-top:3px;white-space:nowrap;font-variant-numeric:tabular-nums;}" +
      "html#aikm body #aikmShipHub #psTable tr.nb-row-loss td{background:color-mix(in srgb,var(--x-red-soft) 55%,transparent) !important;}" +
      "html#aikm body #aikmShipHub .nb-actions{position:sticky;bottom:0;background:var(--x-surface);padding:12px 0 2px;margin-top:0;border-top:1px solid var(--x-line);z-index:2;}" +
      "html#aikm body #aikmShipHub .lb-bar{background:var(--x-surface-2) !important;border:1px solid var(--x-line) !important;border-radius:12px !important;padding:10px 14px !important;margin:0 0 12px !important;}" +
      "html#aikm body #aikmShipHub .lb-bar b.lb-loss{color:var(--x-red) !important;}" +
      /* SaaS layout (owner 14 Nov 2026): tabs + tools on one line, chips row, one-line rule bar, tidy top toolbar */
      "html#aikm body #aikmShipHub .hub-bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:8px 16px;border-bottom:1px solid var(--x-line);margin:20px 0 0;}" +
      "html#aikm body #aikmShipHub .hub-tabs{border-bottom:0 !important;margin:0 !important;overflow:visible !important;flex-wrap:nowrap !important;}" +
      "html#aikm body #aikmShipHub .hub-tabs button{background:transparent !important;border:0 !important;border-bottom:3px solid transparent !important;border-radius:0 !important;box-shadow:none !important;padding:10px 14px 11px !important;min-height:0 !important;height:auto !important;margin:0 0 -1px !important;color:var(--x-text-2) !important;font-weight:600 !important;}" +
      "html#aikm body #aikmShipHub .hub-tabs button.on{border-bottom-color:#D4AF37 !important;color:var(--x-text) !important;}" +
      "html#aikm body #aikmShipHub .hub-tabs button:hover{color:var(--x-text) !important;}" +
      "html#aikm body #aikmShipHub .hub-tools{display:flex;align-items:center;gap:8px;padding-bottom:8px;flex-wrap:nowrap;}" +
      "html#aikm body #aikmShipHub .hub-tools{margin-left:auto;}" +
      "html#aikm body #aikmShipHub .hub-bar{margin:0 !important;}html#aikm body #selfshipProshipPanel .nb-card{padding-top:10px !important;}" +
      "html#aikm body #aikmShipHub .hub-find{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0;}" +
      "html#aikm body #aikmShipHub .hub-find select{width:150px !important;border-radius:10px !important;height:36px;}" +
      "html#aikm body #aikmShipHub .hub-find #psRefresh{width:36px !important;height:36px;padding:0 !important;display:inline-flex;align-items:center;justify-content:center;border-radius:10px !important;}" +
      "html#aikm body #aikmShipHub .hub-find .hub-search input{width:220px !important;height:36px;}" +
      "html#aikm body #aikmShipHub .hub-chiprow .nb-chips{flex:1 1 auto;min-width:0;}" +
      "html#aikm body #aikmShipHub .hub-sep{width:1px;height:24px;background:var(--x-line);margin:0 2px;}" +
      "html#aikm body #aikmShipHub .ps-conn{padding:0 6px 0 11px !important;height:36px;box-sizing:border-box;border-radius:10px !important;font-size:12px !important;}" +
      "html#aikm body #aikmShipHub .ps-conn button{font-size:11.5px;padding:4px 8px;border-radius:7px;background:#fff;border:1px solid var(--x-line);color:#0F1E35 !important;}" +
      "html#aikm body #aikmShipHub button.hub-ico{all:unset;cursor:pointer;width:36px;height:36px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:3px;border-radius:10px;border:1px solid var(--x-line);background:#fff;color:#0F1E35;font-size:16px;position:relative;}" +
      "html#aikm body #aikmShipHub button.hub-ico:hover{background:#0F1E35;color:#fff;border-color:#0F1E35;}" +
      "html#aikm body #aikmShipHub #hubSetWarn:not(:empty){position:absolute;top:-4px;right:-4px;width:9px;height:9px;border-radius:50%;background:#B42318;font-size:0;overflow:hidden;}" +
      "html#aikm body #aikmShipHub .hub-job{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin:12px 0 0;padding:10px 14px;border-radius:12px;border:1px solid var(--x-line);background:#FBF9F4;font-size:12.5px;}" +
      "html#aikm body #aikmShipHub .hub-job.run{border-color:#E6D3A3;background:#FBF5E6;}html#aikm body #aikmShipHub .hub-job.bad{border-left:3px solid #B42318;}html#aikm body #aikmShipHub .hub-job.ok{border-left:3px solid #1E7A4B;}" +
      "html#aikm body #aikmShipHub .hj-t{font-weight:700;color:#14213D;display:inline-flex;align-items:center;gap:6px;}" +
      "html#aikm body #aikmShipHub .hj-n{color:#4A5468;}html#aikm body #aikmShipHub .hj-n b{font:700 15px Lexend,Inter,sans-serif;color:#14213D;margin-left:3px;font-variant-numeric:tabular-nums;}" +
      "html#aikm body #aikmShipHub .hj-n.ok b{color:#1E7A4B;}html#aikm body #aikmShipHub .hj-n.bad b{color:#B42318;}" +
      "html#aikm body #aikmShipHub .hj-bar{flex:0 0 160px;height:6px;border-radius:6px;background:#EFE7D2;overflow:hidden;}html#aikm body #aikmShipHub .hj-bar i{display:block;height:100%;background:#C9A24B;}" +
      "html#aikm body #aikmShipHub .hj-act{margin-left:auto;display:flex;gap:8px;}" +
      "html#aikm body #aikmShipHub .hj-act button{all:unset;cursor:pointer;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid var(--x-line);background:#fff;color:#0F1E35;}" +
      "html#aikm body #aikmShipHub .hj-act button.bad{color:#B42318;border-color:#F3B8B1;}html#aikm body #aikmShipHub .hj-act button:hover{background:#0F1E35;color:#fff;border-color:#0F1E35;}" +
      /* console sub-bar above (Sync / Push / Confirm / Rejected): one tidy row, status texts become tooltips */
      "html#aikm body #subtab-selfship{display:flex !important;align-items:center;gap:8px;flex-wrap:wrap;}" +
      "html#aikm body #subtab-selfship .sn-pushinfo,html#aikm body #subtab-selfship .sn-amzinfo{display:none !important;}" +
      "html#aikm body #subtab-selfship .sn-btn,html#aikm body #subtab-selfship .pe-btn,html#aikm body #subtab-selfship button{height:34px;box-sizing:border-box;border-radius:9px !important;padding:0 13px !important;font-size:12px !important;}" +
      "html#aikm body #subtab-selfship .sn-btn.sn-amz,html#aikm body #subtab-selfship .sn-btn.sn-push{background:#fff !important;color:#0F1E35 !important;border:1px solid var(--x-line) !important;}" +
      "html#aikm body #subtab-selfship .sn-btn.sn-amz .ti{color:#FF9900 !important;}html#aikm body #subtab-selfship .sn-btn.sn-push .ti{color:#C9A24B !important;}" +
      "html#aikm body #subtab-selfship .sn-btn.sn-err-dot::after{content:'';width:7px;height:7px;border-radius:50%;background:#B42318;margin-left:4px;}" +
      "html#aikm body #aikmShipHub .cx-awb{white-space:nowrap;}" +
      "html#aikm body #aikmShipHub .lb-bar:has(b.lb-loss[style*='none']) .lb-row2{border-left:0 !important;padding-left:0 !important;margin-left:0 !important;}" +
      "html#aikm body #aikmShipHub .hub-search{position:relative;display:inline-flex;align-items:center;}" +
      "html#aikm body #aikmShipHub .hub-search i{position:absolute;left:11px;font-size:15px;color:var(--x-muted);pointer-events:none;}" +
      "html#aikm body #aikmShipHub .hub-search input{width:230px !important;padding-left:34px !important;border-radius:10px !important;}" +
      "html#aikm body #aikmShipHub .hub-tools select{width:160px !important;border-radius:10px !important;}" +
      "html#aikm body #aikmShipHub .hub-tools #psRefresh{width:38px !important;padding:0 !important;display:inline-flex;align-items:center;justify-content:center;border-radius:10px !important;}" +
      "html#aikm body #aikmShipHub .hub-chiprow{display:flex !important;align-items:center;gap:12px;margin:14px 0 0 !important;}" +
      "html#aikm body #aikmShipHub .hub-chiprow .nb-chips{margin:0 !important;flex:1;}" +
      "html#aikm body #aikmShipHub .hub-lbl{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--x-muted);text-transform:uppercase;white-space:nowrap;}" +
      "html#aikm body #aikmShipHub .hub-note{white-space:nowrap;font-size:12px;}" +
      "html#aikm body #aikmShipHub .lb-bar{flex-wrap:wrap !important;gap:8px 10px !important;}" +
      "html#aikm body #aikmShipHub .lb-bar span,html#aikm body #aikmShipHub .lb-bar b{white-space:nowrap;}" +
      "html#aikm body #aikmShipHub .lb-bar .lb-row2{flex-basis:auto !important;flex:1;justify-content:flex-start;border-left:1px solid var(--x-line);padding-left:14px;margin-left:4px;}" +
      "html#aikm body #aikmShipHub .lb-bar .lb-n{margin-left:0 !important;font-size:12px;}" +
      "html#aikm body #aikmShipHub .lb-bar input.lb-q{width:220px !important;}" +
      "html#aikm body #aikmShipHub th.hub-sort{cursor:pointer;user-select:none;}html#aikm body #aikmShipHub th.hub-sort:hover{color:var(--x-text) !important;}" +
      "html#aikm body #aikmShipHub th.hub-sort i{font-size:13px;vertical-align:-2px;}" +
      /* top toolbar of Amazon Self-Ship: one tidy line */
      "html#aikm body #subtab-selfship{display:flex;flex-wrap:wrap;align-items:center;gap:8px !important;max-width:none !important;padding:10px 14px !important;border-style:solid !important;border-color:var(--x-line) !important;background:var(--x-surface) !important;border-radius:14px !important;}" +
      "html#aikm body #subtab-selfship .subtab-label{font-size:15px !important;letter-spacing:0 !important;text-transform:none !important;color:var(--x-text) !important;font-weight:700 !important;margin-right:auto !important;font-family:var(--x-brand-font);}" +
      "html#aikm body #subtab-selfship :is(.sn-pushinfo,.sn-amzinfo){max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;color:var(--x-muted);}" +
      "html#aikm body #subtab-selfship :is(button,.sn-btn,.pe-btn){height:32px;min-height:32px !important;border-radius:9px !important;}" +
      "@media (max-width:1300px){html#aikm body #aikmShipHub .hub-search input{width:210px !important;}html#aikm body #aikmShipHub .hub-tools select{width:140px !important;}}" +
      "html#aikm body #aikmShipHub .hub-lbl{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#0F1E35;padding:5px 10px;border-radius:8px;border:1px solid var(--x-line);background:#fff;white-space:nowrap;}" +
      "html#aikm body #aikmShipHub .hub-lbl:hover{background:#0F1E35;color:#fff;border-color:#0F1E35;}html#aikm body #aikmShipHub .hub-lbl[disabled]{opacity:.6;pointer-events:none;}" +
      "html#aikm body #aikmShipHub .hub-map{all:unset;cursor:pointer;font-size:11px;font-weight:600;color:var(--x-muted);margin-left:6px;padding:1px 7px;border-radius:6px;border:1px solid var(--x-line);white-space:nowrap;}" +
      "html#aikm body #aikmShipHub .hub-map.need{color:#1A1405;background:#D4AF37;border-color:#D4AF37;}" +
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
    function ago(ts) { var m = Math.round((Date.now() - ts) / 6e4); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; var h = Math.round(m / 60); return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago"; }
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
        feedFallback(); frMedAt = 0;
        if (isOpen()) { renderDates(); if (typeof buildPool === "function") setTimeout(buildPool, 0); }
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
        '<div class="hub-bar"><div class="hub-tabs" id="hubTabs"></div>' +
          '<div class="nb-filter-row hub-tools">' +
          '<div class="ps-conn" id="psConn" title="ProShip connection"><i class="dot"></i><span id="psConnTxt">ProShip</span><button type="button" id="psTest" title="Test the ProShip login now">Test</button></div>' +
          '<button type="button" id="hubSet" class="hub-ico" title="Pickup address &amp; default box \u2014 saved online for every computer"><i class="ti ti-settings"></i><span id="hubSetWarn"></span></button>' +
          '<button type="button" id="hubOld" class="hub-ico" title="Old tools: confirmation file, fake ship, manual tracking"><i class="ti ti-tools"></i></button></div></div>' +
        '<div id="hubJobBar" style="display:none;"></div>' +

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

        '<div class="nb-filter hub-chiprow"><span class="hub-lbl" id="hubDateLbl">SLA</span><div class="nb-chips" id="psDates"></div><span class="nb-muted hub-note" id="psPoolNote" style="display:none !important"></span>' +
          '<div class="hub-find"><span class="hub-search"><i class="ti ti-search"></i><input type="text" id="psQ" autocomplete="off" placeholder="Search order, buyer, product, PIN"></span>' +
          '<select id="psAcct"><option value="">All accounts</option></select>' +
          '<button type="button" id="psRefresh" title="Refresh"><i class="ti ti-refresh"></i></button></div></div>' +
        '<div id="psResult" style="display:none;">' +
          '<div class="nb-kpis" id="psKpis"></div>' +
          '<div id="hubShipWrap" style="display:none;"><div class="table-scroll"><table class="data" id="hubShipTable"><thead><tr>' +
            '<th class="hs-ck"><input type="checkbox" id="hubShipAll" title="Select all (for bulk labels)"></th><th>SLA</th><th>Order</th><th>Buyer</th><th>Items</th><th>AWB \u00b7 courier</th><th>Status</th><th>Booked</th><th class="hs-act">Actions</th>' +
          '</tr></thead><tbody id="hubShipBody"></tbody></table></div></div>' +
          '<div id="psPoolWrap"><div class="table-scroll"><table class="data" id="psTable"><thead><tr>' +
            '<th style="width:28px;"><input type="checkbox" id="psAll" title="Select all"></th><th>SLA</th><th>Order</th><th>Buyer &amp; address</th><th>Items</th><th class="r hub-sort" id="hubPSort" title="Sort by profit">Profit <i class="ti ti-arrows-sort" id="hubPSortI"></i><div class="hub-sub">our tool \u00b7 OMS</div></th><th class="r">Weight</th><th>Status</th>' +
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
    var shipSel = {}, shipShown = [], lblInfo = {};   // Shipped tabs: orders ticked for bulk labels

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
      if (testing && (!at || at.getTime() < testing)) { box.className = "ps-conn"; txt.innerHTML = '<i class="ti ti-loader-2 ps-spin"></i> Testing\u2026'; return; }
      testing = 0;
      if (!check) { box.className = "ps-conn"; txt.textContent = "ProShip"; box.title = "ProShip connection not tested yet"; return; }
      box.className = "ps-conn " + (check.ok ? "ok" : "bad");
      txt.textContent = "ProShip"; box.title = (check.ok ? "ProShip connected" : "ProShip NOT connected") + (at ? " \u00b7 tested " + when(at) : "");
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
      /* status texts of Push / Confirm become the buttons' tooltips (the texts are hidden by CSS) */
      try {
        var sb = document.getElementById("subtab-selfship");
        if (sb) [[".sn-pushinfo", ".sn-push"], [".sn-amzinfo", ".sn-amz"]].forEach(function (p) {
          var i = sb.querySelector(p[0]), btn = sb.querySelector(p[1]); if (!i || !btn) return;
          var t = (i.textContent || "").trim(); if (t && btn.title !== t) btn.title = t;
          btn.classList.toggle("sn-err-dot", i.classList.contains("sn-err"));
        });
      } catch (e) {}
      var all = [].slice.call(document.querySelectorAll('#subtab-selfship [data-sync-now="oms,nimbus"]'));
      var keep = all.filter(function (x) { return x.dataset.hubFixed; })[0];
      all.forEach(function (x) { if (keep && x !== keep) x.remove(); });
      var b = keep ? null : all[0];
      if (!b) return;
      var n = b.cloneNode(false); n.dataset.hubFixed = "1"; n.className = b.className;
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
    fixSyncBtn(); setInterval(fixSyncBtn, 3000);

    if (isOpen()) setTimeout(function () { hookPanel(); hookIdx(); fillSettings(); pickupNote(); showConn(); build(); }, 0);

    /* ---------- pending self-ship pool (same rules as the NimbusPost / Zippy files) ---------- */
    var pool = [], lastRows = [], selDate = "all", selAcct = "", selQ = "", busy = false, jobRes = {};
    var view = "toship", shipRows = [], pSort = 0; // pSort: 0 = default, 1 = profit low->high, -1 = high->low
    var VIEWS = [["toship", "To ship"], ["hold", "On hold"], ["failed", "Failed"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["rto", "RTO / Cancelled"]];
    /* loss rule (same amount as the red Loss bar): flagged orders ship only when profit is above it */
    window.addEventListener("aikm-loss-limit", function () { if (typeof buildPool === "function") setTimeout(buildPool, 0); });
    function lossLimit() { try { var v = localStorage.getItem("aikm_loss_above"); return v === null ? "40" : v; } catch (e) { return "40"; } }
    function profitOk(r) { var l = lossLimit(); return l !== "" && r.profit > +l; }
    function isHold(r) { return r.state !== "ok" || (r.loss && !profitOk(r)); }
    function poolView() { return view === "toship" || view === "hold" || view === "failed"; }
    /* owner 14 Nov 2026: shipped orders leave To ship at once (they are in Shipped); orders the last ship job could NOT ship
       are in their own "Failed" tab with ProShip's reason, so "200 to ship -> 180 shipped, 20 failed" is clear. */
    function failedOf(r) { return !liveShip(r.id) && jobRes[r.id] && jobRes[r.id].e ? jobRes[r.id].e : ""; }
    function poolKind(r) { if (liveShip(r.id)) return ""; if (failedOf(r)) return "failed"; return isHold(r) ? "hold" : "toship"; }
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
      var L = skus[sku] || null, asin = String((L && L.a) || o.asin || "").toUpperCase(), P = mapPatch(acctKey(o.channel), asin, ix);
      /* old / relisted SKU without a cost: use another SKU of the SAME ASIN that has one (mapping is saved per ASIN) */
      if ((!L || L.c == null) && asin) { for (var k2 in skus) { var S2 = skus[k2]; if (S2 && S2.c != null && String(S2.a || "").toUpperCase() === asin) { L = Object.assign({}, S2, L || {}, { c: S2.c, k: S2.k, g: S2.g, fp: S2.fp }); break; } } }
      if (!P) return L;
      return Object.assign({ a: asin, g: 5, fp: 2 }, L || {}, { c: P.c, k: L && L.k != null ? L.k : 45 });
    }
    /* Mapping saved just now on this computer: used until the next SP-API sync rebuilds listingIndex with it (max 6 h). */
    function mapPatches() { try { return JSON.parse(localStorage.getItem("aikm_map_patch") || "{}") || {}; } catch (e) { return {}; } }
    function mapPatch(acct, asin, ix) {
      if (!asin) return null; var all = mapPatches(), P = all[acct + "|" + asin]; if (!P) return null;
      var up = 0; try { up = ix && ix.updatedAt && ix.updatedAt.toMillis ? ix.updatedAt.toMillis() : 0; } catch (e) {}
      if (Date.now() - P.at > 6 * 36e5 || (up && up > P.at + 60e3)) return null;
      return P.c != null ? P : null;
    }
    /* Profit of one OMS line WITHOUT the courier (the courier is taken once per order below, from ProShip).
       Buyer shipping: the part above GST is ours - GST on shipping is charged at the item's GST rate (owner 14 Nov 2026:
       "why 15% shipping margin" - it was a flat 15% guess for that GST; now exact per item). OMS shipping is PER UNIT -> x qty. */
    function lineProfit(o) {
      var L = listingOf(o); if (!L || L.c == null || L.k == null) return null;
      var price = num(o.price), q = Math.max(1, num(o.qty) || 1); if (!(price > 0)) return null;
      var g = (L.g != null ? L.g : 5) / 100, fee = L.fp != null ? L.fp : 2;
      var gst = g > 0 ? (price - L.c) * g / (1 + g) * q : 0, shipNet = num(o.shippingCharge) * q / (1 + g);
      return { p: price * q + shipNet - L.c * q - fee * q - gst - 3, est: L.k * (1 + 0.25 * (q - 1)) };
    }
    /* Courier cost: the real ProShip freight of this shipment (proshipIndex r, saved at booking); not booked yet = the median
       ProShip freight of this account's recent shipments; no ProShip data yet = the robot's estimate. */
    var frMed = {}, frMedAt = 0, frAll = null;
    function freightMedian(acct) {
      if (Date.now() - frMedAt > 60000) {
        frMedAt = Date.now(); var by = {}, all = [];
        Object.keys(idx || {}).forEach(function (k) { var v = idx[k]; if (v && v.r > 0 && v.s !== "cancelled") { (by[v.ac || ""] = by[v.ac || ""] || []).push(v.r); all.push(v.r); } });
        var avg = function (l) { return Math.round(l.reduce(function (a, b) { return a + b; }, 0) / l.length * 100) / 100; };
        frMed = {}; Object.keys(by).forEach(function (a) { if (by[a].length >= 5) frMed[a] = { v: avg(by[a]), n: by[a].length }; });
        frAll = all.length ? { v: avg(all), n: all.length, by: frMed } : null;
      }
      return frMed[acct] ? frMed[acct].v : null;
    }
    function freightAvg() { freightMedian(""); return frAll; }
    function isSelfShipPending(o) {
      return /amazon/i.test(o.channel || "") && phone10(o.buyerPhone).length >= 10 && !String(o.awb || "").trim() &&
        /^(new|ready to ship|pending|confirmed)$/i.test(String(o.status || "").trim());
    }
    function makeRow(id, live) {
      var o = live[0], items = {}, order = [];
      live.forEach(function (x) {
        var key = x.sku || x.productName;
        if (!items[key]) { var Lx = listingOf(x); items[key] = { sku: x.sku || "", name: x.productName || x.sku || "Item", qty: 0, price: num(x.price), ship: 0, line: x,
          mapped: !!(Lx && Lx.c != null), asin: String((Lx && Lx.a) || x.asin || "").toUpperCase() }; order.push(key); }
        var q = num(x.qty) || 1; items[key].qty += q; items[key].ship += num(x.shippingCharge) * q;
      });
      var list = order.map(function (k) { return items[k]; });
      var cod = live.reduce(function (s, x) { return s + num(x.codCollectible); }, 0);
      var isCod = cod > 0 || /^cod$/i.test(String(o.orderType || "").trim());
      var total = list.reduce(function (s, it) { return s + it.price * it.qty + it.ship; }, 0);
      var r = { id: id, o: o, sla: ymd(o.slaDate), items: list, isCod: isCod, cod: r2(cod > 0 ? cod : (isCod ? total : 0)), weight: weightFor(list), state: "ok", note: "Ready" };
      var omsLoss = typeof isOmsOrderLoss === "function" && live.some(function (x) { return isOmsOrderLoss(x); });
      r.omsProfit = r2(live.reduce(function (s, x) { return s + (parseFloat(x.profit) || 0); }, 0));
      var ep = 0, est = 0, all = true; live.forEach(function (x) { var p = lineProfit(x); if (p == null) all = false; else { ep += p.p; est = Math.max(est, p.est); } });
      var shp = liveShip(id), med = freightMedian(account(o.channel));
      r.freight = shp && shp.r > 0 ? shp.r : med != null ? med : est;
      r.freightSrc = shp && shp.r > 0 ? "ProShip charge" : med != null ? "ProShip average" : "estimate";
      ep -= r.freight;
      r.src = all ? "tool" : "oms";
      r.profit = all ? Math.round(ep) : r.omsProfit;
      var orderVal = live.reduce(function (s, x) { return s + num(x.price) * (num(x.qty) || 1) + num(x.shippingCharge); }, 0);
      /* flagged: our tool's profit decides when it can be worked out (under the robot's rule: Rs 15 or 10% of the order);
         OMS Guru's own flag only for orders our tool cannot price (no cost mapped) */
      /* owner 14 Nov 2026 ("loss orders are not reflecting"): a loss order = profit BELOW the owner's own amount on the loss bar
         ("Ship them only when profit is above Rs [40]", localStorage aikm_loss_above); bar empty = the robot's rule (Rs 15 / 10% of order) */
      var lim = lossLimit(), cut = lim === "" ? Math.min(15, 0.1 * orderVal) : +lim;
      r.loss = all ? r.profit < cut : (omsLoss || r.omsProfit < cut);
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
      $("psPoolNote").textContent = data.length ? pool.length + " orders waiting" : "OMS data loading\u2026";
      
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
      if (poolView()) return pool.filter(function (r) { return poolKind(r) === view; });
      return shipRows.filter(function (r) { return r.stage === view; });
    }
    function acctOf(r) { return r.acct || account(r.o.channel); }
    function renderTabs() {
      buildShipRows();
      var n = { toship: 0, hold: 0, failed: 0, shipped: 0, delivered: 0, rto: 0 };
      pool.forEach(function (r) { if (selAcct && acctOf(r) !== selAcct) return; var k = poolKind(r); if (k) n[k]++; });
      shipRows.forEach(function (r) { if (selAcct && acctOf(r) !== selAcct) return; n[r.stage]++; });
      $("hubTabs").innerHTML = VIEWS.map(function (v) {
        return '<button type="button" data-v="' + v[0] + '" class="' + (v[0] === view ? "on " : "") + (v[0] === "hold" || v[0] === "failed" ? "hold" : "") + '"' + (v[0] === "failed" && !n.failed ? ' style="display:none"' : "") + '>' + v[1] + " <span>" + n[v[0]] + "</span></button>";
      }).join("");
      document.querySelectorAll("#hubTabs button").forEach(function (b) { b.addEventListener("click", function () { if (view !== b.dataset.v) { view = b.dataset.v; selDate = "all"; renderDates(); } }); });
    }
    function renderDates() {
      renderTabs();
      $("hubDateLbl").textContent = poolView() ? "SLA" : "SLA \u00b7 labels";
      
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
      $("hubShipWrap").style.display = "none"; $("psPoolWrap").style.display = ""; $("psShip").style.display = ""; lblBtnText();
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
      }).sort(function (a, b) {
        if (pSort) return pSort * ((a.profit || 0) - (b.profit || 0)) || a.id.localeCompare(b.id);
        /* default: loss / low-profit orders on top, lowest profit first (owner 14 Nov 2026); the rest by SLA date */
        return (b.loss - a.loss) || (a.loss && b.loss ? (a.profit || 0) - (b.profit || 0) : 0) ||
          (a.sla || "9999").localeCompare(b.sla || "9999") || account(a.o.channel).localeCompare(account(b.o.channel)) || a.id.localeCompare(b.id);
      });
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
        kpi("Accounts", Object.keys(rows.reduce(function (m, r) { m[r.acct] = 1; return m; }, {})).length, "") +
        avgShipKpi(rows.map(function (r) { return r.v.r || 0; }));
      $("hubShipBody").innerHTML = rows.length ? rows.slice(0, 1500).map(function (r) {
        var o = r.o, v = r.v, st = prettySt(v), cls = r.stage === "delivered" ? "d" : r.stage === "rto" ? "r" : /pickup pending/i.test(st) ? "" : "t";
        var its = Object.keys(r.items), itTxt = its.map(function (k) { return k + " \u00d7 " + r.items[k]; }).join(" + ");
        var canCancel = r.stage === "shipped" && /pickup pending|booked|manifest/i.test(st);
        return '<tr' + (shipSel[r.id] ? ' class="hs-on"' : "") + ">" +
          '<td class="hs-ck"><input type="checkbox" class="hub-lsel" data-id="' + esc(r.id) + '"' + (shipSel[r.id] ? " checked" : "") + "></td>" +
          '<td class="hs-nw"><b>' + (r.sla ? esc(niceDay(r.sla)) : "\u2014") + "</b></td>" +
          '<td class="hs-nw"><span class="hs-mono">' + esc(r.id) + '</span><span class="hs-acc">' + esc(r.acct) + "</span></td>" +
          '<td class="hs-buy"><b>' + esc(o.buyerName || "\u2014") + "</b><span>" + esc([o.buyerCity, o.buyerPincode].filter(Boolean).join(" \u00b7 ")) + "</span></td>" +
          '<td class="hs-it" title="' + esc(itTxt) + '">' + (its.length ? esc(its[0]) + ' <em>\u00d7 ' + r.items[its[0]] + "</em>" + (its.length > 1 ? ' <i class="hs-more">+' + (its.length - 1) + "</i>" : "") : "") + "</td>" +
          '<td class="hs-nw"><span class="hs-mono">' + esc(v.a) + '</span><span class="hs-cour">' + esc(v.c || "ProShip") + "</span></td>" +
          '<td><span class="hub-st ' + cls + '">' + esc(st) + "</span></td>" +
          '<td class="hs-nw hs-time">' + (v.t ? esc(when(v.t)) + "<span>" + esc(ago(v.t)) + "</span>" : "") + "</td>" +
          '<td class="hs-act"><button type="button" class="hs-ib hub-lbl" data-id="' + esc(r.id) + '" title="Download this label (PDF)"><i class="ti ti-printer"></i><span>Label</span></button>' +
          (canCancel ? '<button type="button" class="hs-ib hs-cx ps-x" data-awb="' + esc(v.a) + '" data-id="' + esc(r.id) + '" title="Cancel this shipment"><i class="ti ti-x"></i></button>' : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="9" class="nb-muted" style="text-align:center;padding:22px !important;">Nothing here.</td></tr>';
      shipShown = rows.slice(0, 1500).map(function (r) { return r.id; });
      rows.forEach(function (r) { lblInfo[r.id] = { acct: r.acct || "", items: Object.keys(r.items).map(function (k) { return [k, r.items[k]]; }) }; });
      Object.keys(shipSel).forEach(function (k) { if (shipShown.indexOf(k) < 0) delete shipSel[k]; });
      $("hubShipBody").querySelectorAll(".hub-lsel").forEach(function (c) { c.addEventListener("change", function () { if (c.checked) shipSel[c.dataset.id] = 1; else delete shipSel[c.dataset.id]; c.closest("tr").classList.toggle("hs-on", c.checked); lblBtnText(); }); });
      $("hubShipBody").querySelectorAll(".hub-lbl").forEach(function (b) { b.addEventListener("click", function () { labelsFor([b.dataset.id], b); }); });
      var all = $("hubShipAll"); if (all) all.checked = shipShown.length > 0 && shipShown.every(function (k) { return shipSel[k]; });
      lblBtnText();
      $("hubShipBody").querySelectorAll(".ps-x").forEach(function (b) { b.addEventListener("click", function () { cancelShip(b.dataset.id, b.dataset.awb); }); });
      $("psResult").style.display = "block";
      $("psNote").textContent = "Labels: tick orders (or press Label on one), then Download. Nothing ticked = all labels of the SLA date chip.";
    }
    function kpi(l, n, cls, tip) { return '<div class="nb-kpi ' + cls + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + '><div class="nb-kpi-n">' + n + '</div><div class="nb-kpi-l">' + l + "</div></div>"; }
    /* Average ProShip shipping cost (owner 14 Nov 2026): real freight incl. GST that ProShip charged (proshipIndex r) */
    function avgShipKpi(list) {
      var a = list ? (function () { var l = list.filter(function (x) { return x > 0; }); return l.length ? { v: l.reduce(function (s, x) { return s + x; }, 0) / l.length, n: l.length } : null; })() : freightAvg();
      if (!a) return kpi("Avg shipping cost", "\u2014", "", "Shows once ProShip has charged shipments");
      var tip = "Real ProShip freight incl. GST, " + a.n + " shipments";
      if (!list && a.by) tip += " \u00b7 " + Object.keys(a.by).map(function (k) { return k + " \u20b9" + a.by[k].v.toFixed(1) + " (" + a.by[k].n + ")"; }).join(" \u00b7 ");
      return kpi("Avg shipping cost \u00b7 ProShip", "\u20b9" + a.v.toFixed(1), "", tip);
    }
    function render() {
      var sel = 0, bad = 0, done = 0, loss = 0, minus = 0;
      var selP = 0; lastRows.forEach(function (r) { if (r.sel) { sel++; selP += r.profit || 0; } if (r.state !== "ok") bad++; if (r.ship) done++; if (r.loss) loss++; if (r.profit < 0) minus++; });
      $("psKpis").innerHTML =
        kpi(view === "hold" ? "On hold" : "Orders to ship", lastRows.length, "") + kpi("Selected to ship", sel, "nb-ok") + kpi("Expected profit (selected)", rs(Math.round(selP)), selP < 0 ? "nb-bad" : "nb-ok") +
        kpi(lossLimit() === "" ? "Loss / low profit" : "Profit below \u20b9" + lossLimit(), loss, loss ? "nb-bad" : "", minus + " of them are a real loss (profit in minus)") + kpi("Need a fix", bad, bad ? "nb-bad" : "") + avgShipKpi();
      var body = $("psBody");
      body.innerHTML = lastRows.length ? lastRows.map(function (r, i) {
        var o = r.o, ok = r.state === "ok", sh = r.ship, f = inFile[r.id], err = jobRes[r.id] && jobRes[r.id].e;
        var tag = sh ? "nb-tag-ok" : !ok || err || r.loss ? "nb-tag-bad" : f ? "nb-tag-warn" : "nb-tag-ok";
        var note = sh ? "Shipped \u00b7 " + (sh.c || "ProShip") : !ok ? r.note : err ? "Not shipped" : r.loss ? (profitOk(r) ? "Low profit \u00b7 shipping" : r.profit < 0 ? "Real loss \u2014 on hold" : "Profit below \u20b9" + lossLimit() + " \u2014 on hold") : f ? "In " + f.w + " file " + when(f.t) : "Ready";
        var jr = jobRes[r.id] || {};
        var under = sh ? '<div class="cx-awb" style="margin-top:5px;">' + esc(sh.a) + "</div>" +
          (jr.g ? '<div class="nb-muted nb-small">' + (jr.ats ? "ATS \u00b7 " : "") + "sent " + jr.g + " g</div>" : "") +
          (jr.warn ? '<div class="nb-small" style="color:var(--x-red);max-width:240px;white-space:normal;margin-top:3px;">\u26a0 ' + esc(jr.warn) + "</div>" : "") +
          '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;"><button type="button" class="hub-lbl" data-id="' + esc(r.id) + '" title="Download this label (PDF)"><i class="ti ti-printer"></i> Label</button>' +
          '<button type="button" class="ps-x" data-awb="' + esc(sh.a) + '" data-id="' + esc(r.id) + '">Cancel shipment</button></div>'
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
          '<td class="ps-items">' + r.items.map(function (it, k) { return "<div>" + esc(it.name) + " <b>\u00d7 " + it.qty + '</b> <span class="nb-muted nb-small">' + rs(it.price) + "</span>" +
            ' <button type="button" class="hub-map' + (it.mapped ? "" : " need") + '" data-i="' + i + '" data-k="' + k + '" title="' + (it.mapped ? "Change the mapping on the Amazon page" : "No cost mapped - map it on the Amazon page") + '">' +
            (it.mapped ? '<i class="ti ti-link"></i> Remap' : '<i class="ti ti-link-plus"></i> Map') + "</button></div>"; }).join("") + "</td>" +
          '<td class="r"><div class="hub-pf ' + (r.profit < 0 ? "neg" : r.loss && !profitOk(r) ? "low" : "ok") + '"' +
            (r.src === "oms" ? ' title="No cost mapped for this product in the Amazon tool - OMS Guru profit shown"' : ' title="Our tool: price + 85% shipping - cost - courier - Amazon fees - GST on margin - Rs 3"') + ">" +
            (r.loss ? '<span class="nb-loss">LOSS \u00b7 ' + rs(r.profit) + "</span>" : rs(r.profit)) + "</div>" +
            '<div class="hub-oms">' + (r.src === "tool" ? "OMS " + rs(r.omsProfit) : "our tool: no cost mapped") + "</div>" +
            (r.src === "tool" ? '<div class="hub-oms" title="Courier cost used: ' + esc(r.freightSrc) + '">ship ' + rs(r.freight) + " \u00b7 " + (r.freightSrc === "ProShip charge" ? "ProShip" : r.freightSrc === "ProShip average" ? "ProShip avg" : "est.") + "</div>" : "") + "</td>" +
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
      lastRows.forEach(function (r) { if (r.ship) lblInfo[r.id] = { acct: acctOf(r), items: (r.items || []).map(function (x) { return [x.name, x.qty]; }) }; });
      body.querySelectorAll(".hub-lbl").forEach(function (b) { b.addEventListener("click", function () { labelsFor([b.dataset.id], b); }); });
      lblBtnText();
      body.querySelectorAll(".hub-map").forEach(function (b) { b.addEventListener("click", function () { var r = lastRows[+b.dataset.i]; if (r) openMap(r, r.items[+b.dataset.k]); }); });
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
          busy = true; jobRes = j.results || {}; jobBar(j);
          show("psStatus", "<b>" + (j.total || j.count || "") + " orders</b> \u2014 " + esc(j.step || "Starting on the server\u2026") + ' <span class="nb-muted">(about 1 minute per 100 orders \u2014 you can switch tabs or close this page, it keeps running)</span>', "run");
          renderTabs(); render(); return;
        }
        var wasBusy = busy; busy = false; jobRes = j.results || {}; jobBar(j);
        if (st === "failed") show("psStatus", "<b>Could not ship.</b> " + esc(j.step || ""), "bad");
        else {
          var errs = Object.keys(jobRes).filter(function (k) { return jobRes[k].e; });
          show("psStatus", "<b>" + esc(j.step || "Done") + "</b>" + (j.made ? " \u2014 AWBs are going to OMS Guru now; Amazon is confirmed after the next OMS sync. Click <b>Download labels</b> to print." : "") +
            (errs.length ? '<div class="nb-muted nb-small" style="margin-top:6px;">Not shipped: ' + errs.slice(0, 8).map(function (k) { return esc(k) + " (" + esc(jobRes[k].e) + ")"; }).join(" \u00b7 ") + (errs.length > 8 ? " \u2026" : "") + "</div>" : ""), errs.length && !j.made ? "bad" : "ok");
        }
        if (wasBusy) lastRows.forEach(function (r) { r.touched = false; });
        renderDates();
      }, function (e) { busy = false; show("psStatus", "Could not read the job: " + esc(e.message || e), "bad"); render(); });
    }
    /* One clear line for the last ship job: sent · shipped · failed (owner 14 Nov 2026) */
    function jobBar(j) {
      var b = $("hubJobBar"); if (!b) return;
      var res = j.results || {}, ids = Object.keys(res), ok = ids.filter(function (k) { return res[k].a; }).length, bad = ids.filter(function (k) { return res[k].e; }).length;
      var total = j.total || j.count || Object.keys(j.ids || {}).length || ids.length, running = j.status === "queued" || j.status === "running";
      var ts = j.createdAt && j.createdAt.toDate ? j.createdAt.toDate() : null;
      var pct = total ? Math.round(ids.length / total * 100) : 0;
      b.style.display = "flex";
      b.className = "hub-job" + (running ? " run" : bad ? " bad" : " ok");
      b.innerHTML = '<span class="hj-t">' + (running ? '<i class="ti ti-loader-2 ps-spin"></i> Shipping now' : "Last ship job") + (ts ? " \u00b7 " + esc(when(ts.getTime())) : "") + "</span>" +
        '<span class="hj-n">Sent <b>' + total + "</b></span>" +
        '<span class="hj-n ok">\u2713 Shipped <b>' + ok + "</b></span>" +
        '<span class="hj-n bad">\u2715 Failed <b>' + bad + "</b></span>" +
        (running ? '<span class="hj-bar"><i style="width:' + pct + '%"></i></span><span class="hj-n">' + ids.length + " / " + total + "</span>" : "") +
        '<span class="hj-act">' + (ok ? '<button type="button" data-hj="shipped">View shipped</button>' : "") + (bad ? '<button type="button" data-hj="failed" class="bad">View failed</button>' : "") + "</span>";
      b.querySelectorAll("[data-hj]").forEach(function (x) { x.onclick = function () { view = x.dataset.hj; selDate = "all"; renderDates(); }; });
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

    /* ---------- MAP = the SP-API (Amazon page) mapping window, opened INSIDE this screen (owner 14 Nov 2026:
       "use the SP-API one, it has images etc" + "deploy it inside, don't redirect").
       Shopify forbids framing /pages/amazon (frame-ancestors 'none'), so the page HTML is fetched and run in a srcdoc
       iframe (same site, own globals - no clash with the console). Only its mapping window is shown (embed CSS).
       Loaded once per console visit, then reused: window.aikmOpenMap(asin, acct) inside the frame.
       The frame reports back (window.aikmMapEvt): open / close {saved, cost} / error. A saved mapping is applied here at
       once (localStorage aikm_map_patch, until the next SP-API sync has it). Firebase: the Amazon page's normal load
       (~1 per console visit, only when Map is clicked); saving = the Amazon page's own save (spapiAsinLotsMap / ...2). ---------- */
    var MF = null;
    var EMBED_CSS = "html,body{background:transparent!important;overflow:hidden!important}" +
      "body>*:not(#spapiMatchModal):not(#spToast):not(#premiumPromptModal):not(#premiumConfirmModal):not(script):not(style){display:none!important}";
    function mapFrame() {
      if (MF) return MF;
      var ov = document.createElement("div"); ov.id = "hubMapOv";
      ov.style.cssText = "position:fixed;inset:0;z-index:2147482000;display:none;align-items:center;justify-content:center;background:rgba(15,30,53,.45);";
      ov.innerHTML = '<div id="hubMapLoad" style="background:#fff;border-radius:14px;border-top:3px solid #C9A24B;padding:22px 26px;font:500 13.5px Inter,system-ui,sans-serif;color:#14213D;box-shadow:0 24px 70px rgba(15,30,53,.3);display:flex;gap:12px;align-items:center;max-width:420px">' +
        '<span style="width:18px;height:18px;border:2px solid #E7E1D3;border-top-color:#C9A24B;border-radius:50%;animation:hubspin .8s linear infinite;flex:none"></span><span id="hubMapMsg">Opening the mapping window…</span>' +
        '<button type="button" id="hubMapX" style="all:unset;cursor:pointer;margin-left:8px;color:#8B909B;font-size:18px">×</button></div>' +
        '<style>@keyframes hubspin{to{transform:rotate(360deg)}}</style>';
      var f = document.createElement("iframe"); f.title = "Map product";
      f.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;visibility:hidden;";
      f.setAttribute("allowtransparency", "true");
      ov.appendChild(f); document.body.appendChild(ov);
      ov.querySelector("#hubMapX").onclick = function () { closeMapOv(); };
      MF = { ov: ov, f: f, ready: null, cur: null };
      return MF;
    }
    function closeMapOv() { if (!MF) return; MF.ov.style.display = "none"; MF.f.style.visibility = "hidden"; MF.cur = null; }
    function loadMapFrame() {
      var M = mapFrame(); if (M.ready) return M.ready;
      M.ready = fetch("/pages/amazon", { credentials: "same-origin", cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("Amazon page answered " + r.status); return r.text();
      }).then(function (html) {
        var inject = '<base href="' + location.origin + '/"><script>window.AIKM_EMBED=1;<\/script><style>' + EMBED_CSS + "</style>";
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + inject; }) : inject + html;
        return new Promise(function (ok) { M.f.onload = function () { ok(M.f.contentWindow); }; M.f.srcdoc = html; });
      }).catch(function (e) { M.ready = null; throw e; });
      return M.ready;
    }
    window.aikmMapEvt = function (ev) {
      if (!MF || !ev) return;
      if (ev.type !== "close" && (!MF.cur || (ev.asin && ev.asin !== MF.cur.asin))) return;
      if (ev.type === "open") { MF.f.style.visibility = "visible"; MF.ov.querySelector("#hubMapLoad").style.display = "none"; MF.ov.style.background = "transparent"; return; }
      if (ev.type === "error") { var m = MF.ov.querySelector("#hubMapMsg"); m && (m.textContent = ev.msg || "Mapping window could not open."); return; }
      if (ev.type === "close") {
        closeMapOv();
        if (ev.saved && ev.asin) {
          var all = mapPatches(), key = (ev.acct || (MF.cur && MF.cur.acct) || "") + "|" + String(ev.asin).toUpperCase();
          if (ev.cost != null) { all[key] = { c: Math.round(ev.cost * 100) / 100, at: Date.now(), name: ev.name || "" }; }
          Object.keys(all).forEach(function (k) { if (Date.now() - all[k].at > 6 * 36e5) delete all[k]; });
          try { localStorage.setItem("aikm_map_patch", JSON.stringify(all)); } catch (e) {}
          toastHub(ev.cost != null ? "✓ Mapping saved · cost ₹" + (Math.round(ev.cost * 100) / 100) + " · profit updated" : "✓ Mapping saved · profit updates at the next SP-API sync");
          setTimeout(buildPool, 0);
        } else if (!ev.wasSaved) toastHub("Not saved \u2014 the product shown was only a suggestion. Open Map again and press Save mapping.");
      }
    };
    function toastHub(msg) {
      var t = document.getElementById("hubToast");
      if (!t) { t = document.createElement("div"); t.id = "hubToast"; t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0F1E35;color:#fff;font:500 13px Inter,system-ui,sans-serif;padding:11px 18px;border-radius:10px;border-left:3px solid #C9A24B;box-shadow:0 10px 30px rgba(15,30,53,.25);z-index:2147483600;transition:opacity .25s"; document.body.appendChild(t); }
      t.textContent = msg; t.style.opacity = "1"; clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = "0"; }, 3500);
    }
    function openMap(r, it) {
      if (!it) return;
      if (!it.asin) { alert("This order has no ASIN yet, so it cannot be mapped here.\n\nMap it in Order Mapper, or wait for the next SP-API sync."); return; }
      var M = mapFrame(), acct = acctKey(it.line.channel) || "";
      M.cur = { asin: it.asin, acct: acct };
      M.f.style.visibility = "hidden"; M.ov.style.background = "rgba(15,30,53,.45)";
      var ld = M.ov.querySelector("#hubMapLoad"); ld.style.display = "flex"; M.ov.querySelector("#hubMapMsg").textContent = M.ready ? "Opening the mapping window…" : "Loading the mapping window (first time takes a few seconds)…";
      M.ov.style.display = "flex";
      loadMapFrame().then(function (w) {
        var tries = 0;
        (function go() {
          if (!M.cur || M.cur.asin !== it.asin) return;
          if (w && typeof w.aikmOpenMap === "function") return void w.aikmOpenMap(it.asin, acct);
          if (++tries < 120) return void setTimeout(go, 500);
          window.aikmMapEvt({ type: "error", msg: "Mapping window did not load. Close and try again." });
        })();
      }).catch(function (e) { window.aikmMapEvt({ type: "error", msg: "Mapping window could not load: " + (e.message || e) }); });
    }

    /* ---------- labels (the normal label robot: NimbusPost + ProShip labels of the SLA date, product name + QTY printed) ---------- */
    var lblUnsub = null, lblBusy = false, lblRowBtn = null;
    function lblBtnText() {
      var b = $("psLabels"); if (!b) return;
      var onShip = view !== "toship" && view !== "hold", n = onShip ? Object.keys(shipSel).length : shippedHere().length;
      b.innerHTML = '<i class="ti ti-printer"></i> ' + (n ? "Download " + n + (onShip ? "" : " shipped") + " label" + (n > 1 ? "s" : "") : "Download labels (SLA date)");
    }
    /* Labels for chosen orders (owner 14 Nov 2026: "download label one by one and in bulk"): same label robot
       (nimbus-labels.yml), job labelJobs/<id> {ids:[...]} -> one PDF with product names stamped. ~25 Firebase reads per job. */
    function labelsFor(ids, rowBtn) {
      ids = (ids || []).filter(Boolean);
      if (!ids.length) return;
      if (ids.length > 2000) { alert("Please choose up to 2,000 orders at a time."); return; }
      /* send the product names with the job, so the robot does not have to read all OMS orders again (faster) */
      var info = {}, all = true; ids.forEach(function (k) { if (lblInfo[k] && lblInfo[k].items.length) info[k] = lblInfo[k]; else all = false; });
      runLabelJob({ ids: ids, sla: "", acct: "", orders: all ? JSON.stringify(info) : "" }, ids.length === 1 ? "Label " + ids[0] : ids.length + " labels", rowBtn);
    }
    function shippedHere() { return (lastRows || []).filter(function (r) { return r.ship; }).map(function (r) { return r.id; }); }
    function labels() {
      var n = Object.keys(shipSel).length;
      if (n && view !== "toship" && view !== "hold") return labelsFor(Object.keys(shipSel));
      if ((view === "toship" || view === "hold") && shippedHere().length) return labelsFor(shippedHere());
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

    function runLabelJob(job, title, rowBtn) {
      var d = db();
      if (!d) { alert("Still connecting \u2014 try again in a few seconds."); return; }
      if (typeof window.aikmGhDispatch !== "function") { alert("Please reload the console (Ctrl + Shift + R) and try again."); return; }
      if (lblBusy) { alert("A label download is already running \u2014 please wait a moment."); return; }
      lblBusy = true; lblRowBtn = rowBtn || null;
      if (lblRowBtn) { lblRowBtn.disabled = true; lblRowBtn.innerHTML = '<i class="ti ti-loader"></i><span>Making\u2026</span>'; }
      var head = "<b>" + esc(title) + "</b> \u2014 ", fresh = true, t0 = Date.now(), nLbl = (job.ids || []).length || 0;
      var est = nLbl ? Math.round(18 + nLbl * 0.25) : 60, stepTxt = "Starting the label robot\u2026";
      show("psLblStatus", head + "starting on the server (about " + est + " s)\u2026", "run");
      /* floating timer (owner 14 Nov 2026: "deploy time as well"): elapsed seconds + estimate, visible wherever you scroll */
      var pill = document.getElementById("hubLblPill");
      if (!pill) { pill = document.createElement("div"); pill.id = "hubLblPill"; document.body.appendChild(pill); }
      var secs = function () { return Math.round((Date.now() - t0) / 1000); };
      var tick = function () { if (!lblBusy) return; pill.style.display = "flex"; pill.innerHTML = '<span class="sp"></span><span>' + esc(title) + " \u00b7 <b>" + secs() + " s</b> of about " + est + " s<br><span style=\"opacity:.7;font-size:11.5px\">" + esc(stepTxt) + "</span></span>"; };
      var timer = setInterval(tick, 1000); tick();
      var finish = function (html) { clearInterval(timer); pill.style.display = "flex"; pill.innerHTML = html + '<span class="x" title="Close">\u00d7</span>'; pill.querySelector(".x").onclick = function () { pill.style.display = "none"; }; };
      var done = function () { lblBusy = false; clearInterval(timer); if (lblRowBtn) { lblRowBtn.disabled = false; lblRowBtn.innerHTML = '<i class="ti ti-printer"></i><span>Label</span>'; lblRowBtn = null; } };
      var ref = d.collection("labelJobs").doc();
      ref.set(Object.assign({ onlyNew: false, status: "queued", step: "Waiting for the server\u2026", createdAt: firebase.firestore.FieldValue.serverTimestamp() }, job))
        .then(function () {
          if (lblUnsub) lblUnsub();
          lblUnsub = ref.onSnapshot(function (doc) {
            if (!doc.exists) return;
            var j = doc.data(), st = j.status || "queued";
            if (st === "queued" || st === "running") { stepTxt = j.step || "Starting\u2026"; show("psLblStatus", head + esc(stepTxt), "run"); return; }
            done();
            if (st === "failed") { show("psLblStatus", head + "could not make the labels. " + esc(j.step || ""), "bad"); finish('<span>\u26a0 ' + esc(title) + " failed after " + secs() + " s</span>"); return; }
            if (j.url) finish('<span>\u2713 ' + esc(title) + " ready in <b>" + secs() + ' s</b> \u00b7 <a href="' + esc(j.url) + '" rel="noopener">Download again</a></span>');
            else finish("<span>" + esc(j.step || "No labels.") + "</span>");
            if (j.url) {
              show("psLblStatus", head + "<b>" + j.count + ' label' + (j.count > 1 ? "s" : "") + ' ready</b> <a class="ps-dl" href="' + esc(j.url) + '" rel="noopener"><i class="ti ti-download"></i> Download PDF</a>' +
                (j.noLabel && j.noLabel.length ? '<div class="nb-muted nb-small" style="margin-top:6px;">' + j.noLabel.length + " label(s) not returned by ProShip: " + esc(j.noLabel.slice(0, 5).join(", ")) + "</div>" : "") +
                (j.missingCount ? '<div class="nb-muted nb-small" style="margin-top:6px;">' + j.missingCount + " order(s) have no ProShip shipment: " + esc((j.missing || []).slice(0, 5).join(", ")) + "</div>" : ""), "ok");
              if (fresh) { fresh = false; var x = document.createElement("a"); x.href = j.url; x.rel = "noopener"; document.body.appendChild(x); x.click(); setTimeout(function () { x.remove(); }, 500); }
            } else show("psLblStatus", head + esc(j.step || "No labels."), "");
          }, function () { done(); });
          return window.aikmGhDispatch("nimbus-labels.yml", { job_id: ref.id });
        })
        .catch(function (e) { done(); show("psLblStatus", "Could not start: " + esc(e.message || e), "bad"); });
    }

    $("psShip").addEventListener("click", ship);
    $("hubShipAll").addEventListener("change", function () {
      var on = this.checked; shipShown.forEach(function (k) { if (on) shipSel[k] = 1; else delete shipSel[k]; });
      $("hubShipBody").querySelectorAll(".hub-lsel").forEach(function (c) { c.checked = on; c.closest("tr").classList.toggle("hs-on", on); }); lblBtnText();
    });
    $("hubPSort").addEventListener("click", function () {
      pSort = pSort === 0 ? 1 : pSort === 1 ? -1 : 0;
      $("hubPSortI").className = "ti " + (pSort === 1 ? "ti-sort-ascending" : pSort === -1 ? "ti-sort-descending" : "ti-arrows-sort");
      pickRows();
    });
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
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/loss-bulk.js" + (ref === "main" ? "?v=" + Math.floor(Date.now() / 6e5) : ""); document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/loss-bulk.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();
