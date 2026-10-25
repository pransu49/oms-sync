/* AIKM Admin Console — Meesho + Snapdeal page inside the Easy Ship tab.
   A switch in the Easy Ship top bar flips between [Amazon Easy Ship | Meesho + Snapdeal].
   The Meesho page is its own block (#tab-mp) shown in place of #tab-easyship, with the same layout.
   Loaded by the block at the end of console/easyship-tab.js (aikmMeeshoJs).
   Data: aikm-oms-sync Firestore, aikm_admin/marketplacePack (written by marketplace-pack.js). */
(function () {
  if (window.__aikmMeesho) return; window.__aikmMeesho = true;
  var REPO = "pransu49/oms-sync", WF = "marketplace-pack.yml", TK = "aikm_gh_sync_token", MODE_KEY = "aikm_es_mode";
  var OMS_CFG = { apiKey: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk", authDomain: "aikm-oms-sync.firebaseapp.com", projectId: "aikm-oms-sync",
    storageBucket: "aikm-oms-sync.firebasestorage.app", messagingSenderId: "464184383750", appId: "1:464184383750:web:4fb422b90e519a87d76687" };

  var P = "html#aikm body #tab-mp ";
  var st = document.createElement("style");
  st.textContent =
    /* switch in the top bar */
    "html#aikm body .mp-switch{display:inline-flex;padding:3px;border:1px solid var(--x-line);border-radius:11px;background:var(--x-surface-2);margin-right:6px;}" +
    "html#aikm body .mp-switch button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:8px;font:600 13px/1 'Inter',sans-serif;color:var(--x-muted);transition:background .15s,color .15s;}" +
    "html#aikm body .mp-switch button i{font-size:15px;}" +
    "html#aikm body .mp-switch button:hover{color:var(--x-text);}" +
    "html#aikm body .mp-switch button.on{background:var(--x-surface);color:var(--x-text);box-shadow:0 1px 2px rgba(15,30,53,.12);}" +
    "html#aikm body .mp-switch button:focus-visible{outline:2px solid var(--x-gold);outline-offset:2px;}" +
    "html#aikm body #subtab-easyship .mp-btn-main{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}" +
    "html#aikm body #subtab-easyship .mp-meta{font-size:12px;color:var(--x-muted);}" +
    /* page — same look as the Easy Ship page */
    P + ".es-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;}" +
    P + ".es-state{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface);font-size:12.5px;font-weight:600;color:var(--x-text-2);}" +
    P + ".es-dot{width:8px;height:8px;border-radius:50%;background:var(--x-muted);}" +
    P + ".es-state.run .es-dot{background:var(--x-amber);animation:esPulse 1.2s infinite;}" +
    P + ".es-state.ok .es-dot{background:var(--x-green);}" +
    P + ".es-state.bad .es-dot{background:var(--x-red);}" +
    P + ".es-meta{font-size:12px;color:var(--x-muted);}" +
    P + ".es-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;}" +
    P + ".es-acc{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--x-line);border-radius:10px;background:var(--x-surface-2);margin-bottom:8px;}" +
    P + ".es-acc-ic{width:38px;height:38px;flex:0 0 38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--x-gold-soft);color:var(--x-gold);font-size:19px;}" +
    P + ".es-acc-name{font-weight:600;font-size:13.5px;color:var(--x-text);}" +
    P + ".es-acc-sub{font-size:12px;color:var(--x-muted);margin-top:2px;}" +
    P + ".es-acc-info{flex:1;min-width:0;}" +
    P + ".es-empty{padding:18px;text-align:center;color:var(--x-muted);font-size:13px;border:1px dashed var(--x-line-2);border-radius:10px;}" +
    P + ".es-tag{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:600;background:var(--x-red-soft);color:var(--x-red);}" +
    P + ".es-tag.amber{background:var(--x-amber-soft);color:var(--x-amber);}" +
    P + ".es-rule{font-size:12px;color:var(--x-muted);line-height:1.6;}" +
    P + ".es-rule b{color:var(--x-text-2);}" +
    P + "td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}" +
    "@keyframes esPulse{50%{opacity:.35;}}" +
    "@media (max-width:1100px){" + P + ".es-grid{grid-template-columns:1fr;}}";
  document.head.appendChild(st);

  var data = {}, unsub = null, mpDb = null;
  var mode = "amazon"; try { mode = localStorage.getItem(MODE_KEY) === "meesho" ? "meesho" : "amazon"; } catch (e) {}
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(ts) { if (!ts) return ""; return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
  function nice(iso) { if (!iso) return ""; return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }); }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4500);
  }
  function table(head, rows) {
    return '<div class="table-scroll" style="max-height:360px;"><table class="data"><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  }
  function kpi(id, label, subId) {
    return '<div class="cx-kpi"><div class="cx-kpi-label" id="' + id + 'L">' + label + '</div><div class="cx-kpi-num" id="' + id + '">–</div><div class="cx-kpi-sub" id="' + subId + '">&nbsp;</div></div>';
  }
  function db() {
    if (mpDb) return mpDb;
    if (typeof firebase === "undefined" || !firebase.initializeApp || !firebase.firestore) return null;
    try { var app = (firebase.apps || []).filter(function (a) { return a.name === "omsSync" || (a.options && a.options.projectId === "aikm-oms-sync"); })[0] || firebase.initializeApp(OMS_CFG, "omsSync"); mpDb = app.firestore(); } catch (e) { return null; }
    return mpDb;
  }
  function mainDb() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }

  /* ---------- mount: switch in the top bar + the Meesho page ---------- */
  function mount() {
    var sub = $("subtab-easyship"), tab = $("tab-easyship");
    if (!sub || !tab) return false;
    if ($("tab-mp")) return true;
    // existing Easy Ship top-bar items get a marker so they can be hidden in Meesho mode
    [].slice.call(sub.children).forEach(function (el) { el.setAttribute("data-es-ctl", "1"); });
    var label = sub.querySelector(".subtab-label"); if (label) label.style.display = "none";
    var sw = document.createElement("div");
    sw.className = "mp-switch"; sw.id = "mpSwitch"; sw.setAttribute("role", "tablist");
    sw.innerHTML = '<button type="button" role="tab" data-mode="amazon"><i class="ti ti-brand-amazon"></i>Amazon Easy Ship</button>' +
      '<button type="button" role="tab" data-mode="meesho"><i class="ti ti-shopping-bag"></i>Meesho + Snapdeal</button>';
    sub.insertBefore(sw, sub.firstChild);
    var ctl = document.createElement("div");
    ctl.id = "mpCtl"; ctl.style.cssText = "display:none;flex:1;align-items:center;gap:8px;flex-wrap:wrap;";
    ctl.innerHTML = '<span class="mp-meta">Auto every day 10 AM · packs all New orders · labels also on Telegram</span><span style="flex:1"></span>' +
      '<button type="button" class="subbtn" id="mpDryBtn" title="Shows what would be packed — packs nothing"><i class="ti ti-eye"></i> Preview</button>' +
      '<button type="button" class="subbtn" id="mpTestBtn" title="Packs just 1 order — for testing"><i class="ti ti-flask"></i> Test 1 order</button>' +
      '<button type="button" class="subbtn mp-btn-main" id="mpRunBtn"><i class="ti ti-player-play"></i> Run now</button>';
    sub.appendChild(ctl);
    sw.addEventListener("click", function (e) { var b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode); });

    var p = document.createElement("div");
    p.id = "tab-mp"; p.style.display = "none";
    p.innerHTML =
      '<div class="es-head"><span class="es-state" id="mpState"><span class="es-dot"></span><span id="mpStateTxt">Connecting…</span></span><span class="es-meta" id="mpLastLine"></span></div>' +
      '<div class="cx-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr)) !important;">' +
        kpi("mpKpiPacked", "Packed (last run)", "mpKpiPackedSub") + kpi("mpKpiFailed", "Not packed", "mpKpiFailedSub") +
        kpi("mpKpiCheck", "Check in OMS", "mpKpiCheckSub") + kpi("mpKpiWait", "Waiting in New", "mpKpiWaitSub") +
      "</div>" +
      '<div class="es-grid"><div>' +
        '<div class="panel"><h2>Labels <span id="mpLabelsFor" class="es-meta"></span><button type="button" class="btn-gold" id="mpAllBtn" style="margin-left:auto;display:none;"><i class="ti ti-files"></i> Download all labels (1 PDF)</button></h2><div id="mpLabels"></div></div>' +
        '<div class="panel"><h2>Not packed — fix in OMS Guru <span class="es-meta" id="mpFailedCount"></span></h2><div id="mpFailed"></div></div>' +
        '<div class="panel"><h2>Check in OMS <span class="es-meta" id="mpCheckCount"></span></h2><small class="hint">Not packed — the order already has a label but is still in New, or its page could not be opened.</small><div id="mpCheck" style="margin-top:10px"></div></div>' +
      "</div><div>" +
        '<div class="panel"><h2 id="mpPickTitle">Picklist <span class="es-meta" id="mpPickCount"></span></h2><div id="mpPick"></div></div>' +
        '<div class="panel"><h2>How it works</h2><div class="es-rule">' +
          "<b>When:</b> every day at 10 AM (all 7 days). Run now = straight away.<br>" +
          "<b>Which orders:</b> all <b>New</b> orders of the Meesho and Snapdeal accounts in OMS Guru. Amazon orders are never touched.<br>" +
          "<b>Packing:</b> same as ticking the orders in OMS Guru's New tab and clicking <b>Pack Orders</b>; box size / weight come from OMS.<br>" +
          "<b>Check:</b> an order counts as packed only when OMS shows its shipping label (waits up to 15 min).<br>" +
          "<b>Labels:</b> one PDF per account here; on Telegram all accounts come in ONE combined PDF, sorted by product.</div></div>" +
      "</div></div>";
    tab.insertAdjacentElement("afterend", p);

    $("mpRunBtn").addEventListener("click", function () { runNow({ dry_run: "false", limit: "0" }, "Pack ALL New Meesho + Snapdeal orders now?"); });
    $("mpTestBtn").addEventListener("click", function () { runNow({ dry_run: "false", limit: "1" }, "Pack just 1 Meesho / Snapdeal order as a test?"); });
    $("mpDryBtn").addEventListener("click", function () { runNow({ dry_run: "true", limit: "0" }); });
    apply();
    if (data.live) render();
    return true;
  }

  function easyOpen() { return !!document.querySelector('.tabbtn.active[data-tab="easyship"]'); }
  function setMode(m) { mode = m; try { localStorage.setItem(MODE_KEY, m); } catch (e) {} apply(); }
  function apply() {
    var sub = $("subtab-easyship"), tab = $("tab-easyship"), p = $("tab-mp"); if (!sub || !tab || !p) return;
    var open = easyOpen(), mp = mode === "meesho";
    [].slice.call(document.querySelectorAll("#mpSwitch button")).forEach(function (b) { var on = b.dataset.mode === mode; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    [].slice.call(sub.querySelectorAll("[data-es-ctl]")).forEach(function (el) { if (el.classList.contains("subtab-label")) return; el.style.display = mp ? "none" : ""; });
    $("mpCtl").style.display = mp ? "flex" : "none";
    // Easy Ship page: hide it in Meesho mode (only while the Easy Ship tab is open; otherwise leave it to the console)
    if (open) tab.style.display = mp ? "none" : ""; else tab.style.display = "";
    p.style.display = open && mp ? "block" : "none";
    if (open && mp) listen(); else stop();
  }

  /* ---------- live data: only while the Meesho page is showing ---------- */
  function listen() {
    if (unsub || !db()) return;
    unsub = db().collection("aikm_admin").doc("marketplacePack").onSnapshot(function (d) { data = d.exists ? d.data() : {}; render(); }, function () { setState("bad", "Could not read Meesho data"); });
  }
  function stop() { if (unsub) { unsub(); unsub = null; } }
  document.addEventListener("click", function (e) { if (e.target.closest(".tabbtn[data-tab]")) setTimeout(function () { mount(); apply(); }, 0); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else apply(); });
  setInterval(function () { if (mount()) apply(); }, 1500);

  function setState(cls, txt) { var s = $("mpState"); if (!s) return; s.className = "es-state " + (cls || ""); $("mpStateTxt").textContent = txt; }
  function setKpi(id, n, sub, label) { $(id).textContent = n; $(id + "Sub").innerHTML = sub || "&nbsp;"; if (label) $(id + "L").textContent = label; }

  function render() {
    if (!$("tab-mp")) return;
    var live = data.live || {}, last = data.last || null, dry = data.lastDry || null;
    var running = live.state === "running" && Date.now() - new Date(live.updatedAt).getTime() < 12 * 60000;
    setState(running ? "run" : live.state === "failed" ? "bad" : last ? "ok" : "", running ? live.step : live.state === "failed" ? live.step : last ? "Last run " + when(last.finishedAt) : "Not run yet");
    ["mpRunBtn", "mpTestBtn", "mpDryBtn"].forEach(function (id) { if ($(id)) $(id).disabled = running; });
    var showDry = dry && (!last || dry.at > last.finishedAt);
    $("mpLastLine").textContent = last ? nice(last.date) + " · " + (last.trigger === "schedule" ? "auto 10 AM" : last.trigger || "manual") : "";

    var failed = (last && last.failed) || [], check = (last && last.check) || [];
    setKpi("mpKpiPacked", last ? last.packed || 0 : "–", last ? "on " + nice(last.date) : "");
    setKpi("mpKpiFailed", last ? failed.length : "–", failed.length ? "need fixing in OMS" : last ? "none" : "");
    setKpi("mpKpiCheck", last ? check.length : "–", check.length ? "look in OMS" : last ? "none" : "");
    setKpi("mpKpiWait", dry ? dry.wouldPack || 0 : "–", dry ? "at " + when(dry.at) + " (Preview)" : "click Preview");
    var kp = document.querySelectorAll("#tab-mp .cx-kpi");
    kp[1].classList.toggle("cx-kpi-danger", failed.length > 0); kp[2].classList.toggle("cx-kpi-warn", check.length > 0);

    // labels (latest run + earlier runs)
    var files = (last && last.files) || {}, accs = Object.keys(files).filter(function (a) { return files[a].pages; });
    $("mpLabelsFor").textContent = last ? "· " + nice(last.date) : "";
    $("mpAllBtn").style.display = accs.length > 1 ? "" : "none";
    var h = accs.map(function (a) { return labelRow(a, files[a], last.runId, false); }).join("");
    (data.history || []).forEach(function (r) { if (!last || r.runId === last.runId) return; Object.keys(r.files || {}).forEach(function (a) { if (r.files[a].pages) h += labelRow(a, r.files[a], r.runId, true, r.date); }); });
    $("mpLabels").innerHTML = h || '<div class="es-empty">No labels yet.</div>';

    $("mpFailedCount").textContent = failed.length ? "· " + failed.length : "";
    $("mpFailed").innerHTML = failed.length ? table(["Order", "Account", "Product", "Why"], failed.map(function (f) { return "<tr><td>" + esc(f.orderId) + "</td><td>" + esc(f.account) + "</td><td>" + esc(f.sku) + '</td><td><span class="es-tag">' + esc(f.reason) + "</span></td></tr>"; })) : '<div class="es-empty">Nothing — all packed.</div>';
    $("mpCheckCount").textContent = check.length ? "· " + check.length : "";
    $("mpCheck").innerHTML = check.length ? table(["Order", "Account", "Why"], check.map(function (f) { return "<tr><td>" + esc(f.orderId) + "</td><td>" + esc(f.account) + '</td><td><span class="es-tag amber">' + esc(f.reason) + "</span></td></tr>"; })) : '<div class="es-empty">Nothing to check.</div>';

    // picklist, or the preview list when the newest thing is a preview
    if (showDry) {
      var pv = dry.preview || [];
      $("mpPickTitle").firstChild.textContent = "Ready to pack (preview) ";
      $("mpPickCount").textContent = "· " + pv.length + " orders";
      $("mpPick").innerHTML = pv.length ? table(["Order", "Account", "Product"], pv.map(function (o) { return "<tr><td>" + esc(o.orderId) + "</td><td>" + esc(o.account) + "</td><td>" + esc(o.sku) + "</td></tr>"; })) : '<div class="es-empty">No Meesho / Snapdeal orders in New.</div>';
    } else {
      var pk = (last && last.picklist) || [];
      $("mpPickTitle").firstChild.textContent = "Picklist ";
      $("mpPickCount").textContent = pk.length ? "· " + pk.reduce(function (a, x) { return a + x.qty; }, 0) + " units" : "";
      $("mpPick").innerHTML = pk.length ? table(["Qty", "Product (SKU)"], pk.map(function (x) { return '<tr><td class="num">' + x.qty + "</td><td>" + esc(x.sku) + "</td></tr>"; })) : '<div class="es-empty">No picklist yet.</div>';
    }
  }
  function labelRow(acc, f, runId, old, date) {
    var size = f.sizeKB ? " · " + (f.sizeKB > 1024 ? (f.sizeKB / 1024).toFixed(1) + " MB" : f.sizeKB + " KB") : "";
    return '<div class="es-acc"' + (old ? ' style="opacity:.75"' : "") + '><div class="es-acc-ic"><i class="ti ' + (old ? "ti-history" : "ti-file-text") + '"></i></div><div class="es-acc-info"><div class="es-acc-name">' + esc(acc) +
      '</div><div class="es-acc-sub">' + (old ? "Earlier run · " + nice(date) + " · " : "") + f.pages + " labels" + size + (f.missing && f.missing.length ? " · " + f.missing.length + " missing" : "") + "</div></div>" +
      '<button type="button" class="' + (old ? "secondary" : "btn-gold") + '" data-mp-dl="' + esc(acc) + '" data-mp-run="' + esc(runId) + '"><i class="ti ti-download"></i>' + (old ? "" : " Download PDF") + "</button></div>";
  }

  /* ---------- downloads ---------- */
  function fileFor(acc, runId) {
    if (data.last && data.last.runId === runId) return (data.last.files || {})[acc];
    var r = (data.history || []).filter(function (h) { return h.runId === runId; })[0];
    return r && r.files && r.files[acc];
  }
  async function bytesOf(f) {
    var parts = await Promise.all((f.docIds || []).map(function (id) { return db().collection("aikm_admin").doc("marketplacePack").collection("labels").doc(id).get(); }));
    var arrs = parts.map(function (d) { var b = d.get("data"); return b && b.toUint8Array ? b.toUint8Array() : new Uint8Array(0); });
    var n = arrs.reduce(function (a, x) { return a + x.length; }, 0), out = new Uint8Array(n), o = 0;
    arrs.forEach(function (x) { out.set(x, o); o += x.length; });
    return out;
  }
  function saveBlob(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  document.addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-mp-dl]"); if (!btn || !db()) return;
    var f = fileFor(btn.dataset.mpDl, btn.dataset.mpRun);
    if (!f || !(f.docIds || []).length) { toast("This PDF is not saved in the console — check Telegram.", true); return; }
    var old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Preparing…';
    try { saveBlob(new Blob([await bytesOf(f)], { type: "application/pdf" }), f.fileName || "labels.pdf"); }
    catch (err) { toast("Download failed: " + err.message, true); }
    btn.disabled = false; btn.innerHTML = old;
  });
  var pdfLib = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve();
    if (!pdfLib) pdfLib = new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"; sc.onload = res; sc.onerror = function () { pdfLib = null; rej(new Error("could not load PDF tool")); }; document.head.appendChild(sc); });
    return pdfLib;
  }
  document.addEventListener("click", async function (e) {
    var btn = e.target.closest("#mpAllBtn"); if (!btn || !db() || !data.last) return;
    var files = data.last.files || {}, accs = Object.keys(files).filter(function (a) { return (files[a].docIds || []).length; });
    if (!accs.length) return;
    var old = btn.innerHTML; btn.disabled = true;
    try {
      btn.innerHTML = '<i class="ti ti-loader"></i> Loading…';
      await loadPdfLib();
      var out = await PDFLib.PDFDocument.create(), pages = 0;
      for (var i = 0; i < accs.length; i++) {
        btn.innerHTML = '<i class="ti ti-loader"></i> ' + esc(accs[i]) + " (" + (i + 1) + "/" + accs.length + ")…";
        var src = await PDFLib.PDFDocument.load(await bytesOf(files[accs[i]]), { ignoreEncryption: true });
        var cp = await out.copyPages(src, src.getPageIndices());
        cp.forEach(function (pg) { out.addPage(pg); }); pages += cp.length;
      }
      saveBlob(new Blob([await out.save({ useObjectStreams: true })], { type: "application/pdf" }), "Meesho_Snapdeal_ALL_" + (data.last.date || "") + ".pdf");
      toast(pages + " labels in one PDF.");
    } catch (err) { toast("Download failed: " + err.message, true); }
    btn.disabled = false; btn.innerHTML = old;
  });

  /* ---------- run buttons (same shared GitHub token as the other Sync-now buttons) ---------- */
  async function getToken() {
    var t = "";
    try { if (mainDb()) { var d = await mainDb().collection("aikm_admin").doc("ghSync").get(); t = (d.exists && d.data().token) || ""; } } catch (e) {}
    if (!t) try { t = localStorage.getItem(TK) || ""; } catch (e) {}
    return String(t).replace(/^\s*bearer\s+/i, "").trim();
  }
  async function runNow(inputs, confirmMsg) {
    if (!db()) { toast("Still connecting — try again in a few seconds.", true); return; }
    if (confirmMsg && !confirm(confirmMsg + "\n\nThis packs the orders in OMS Guru and cannot be undone.")) return;
    var tok = await getToken();
    if (!tok) { toast("GitHub token missing — click any 'Sync OMS now' button once to set it up, then try again.", true); return; }
    inputs.channels = "Meesho,Snapdeal";
    setState("run", "Starting…");
    try {
      var r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/dispatches", {
        method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: inputs }) });
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
      toast(inputs.dry_run === "true" ? "Preview started — results in about 1–2 minutes." : "Meesho + Snapdeal run started — labels appear here when done (5–20 minutes).");
      listen();
    } catch (err) { setState("bad", "Could not start: " + err.message); toast("Could not start: " + err.message, true); }
  }
})();
