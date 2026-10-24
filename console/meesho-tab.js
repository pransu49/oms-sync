/* AIKM Admin Console — Meesho + Snapdeal section inside the Easy Ship tab.
   Loaded by the block at the end of console/easyship-tab.js (aikmMeeshoJs).
   Data: aikm-oms-sync Firestore, aikm_admin/marketplacePack (written by marketplace-pack.js). */
(function () {
  if (window.__aikmMeesho) return; window.__aikmMeesho = true;
  var REPO = "pransu49/oms-sync", WF = "marketplace-pack.yml", TK = "aikm_gh_sync_token";
  var OMS_CFG = { apiKey: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk", authDomain: "aikm-oms-sync.firebaseapp.com", projectId: "aikm-oms-sync",
    storageBucket: "aikm-oms-sync.firebasestorage.app", messagingSenderId: "464184383750", appId: "1:464184383750:web:4fb422b90e519a87d76687" };

  var st = document.createElement("style");
  st.textContent =
    "html#aikm body #mpPanel{margin-bottom:18px;}" +
    "html#aikm body #mpPanel .mp-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}" +
    "html#aikm body #mpPanel .mp-title{font:600 15px/1.2 'Lexend','Inter',sans-serif;color:var(--x-text);display:flex;align-items:center;gap:8px;}" +
    "html#aikm body #mpPanel .mp-title i{color:#D6409F;font-size:18px;}" +
    "html#aikm body #mpPanel .mp-btns{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap;}" +
    "html#aikm body #mpPanel .mp-main{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}" +
    "html#aikm body #mpPanel .mp-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}" +
    "html#aikm body #mpPanel .mp-stat{display:flex;flex-direction:column;gap:3px;padding:6px 12px;border:1px solid var(--x-line);border-bottom:2px solid var(--c);border-radius:8px;background:var(--x-surface);min-width:96px;}" +
    "html#aikm body #mpPanel .mp-stat b{font:700 17px/1 'Lexend','Inter',sans-serif;color:var(--c);}" +
    "html#aikm body #mpPanel .mp-stat span{font-size:11px;color:var(--x-muted);}" +
    "html#aikm body #mpPanel .mp-cols{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;}" +
    "html#aikm body #mpPanel h3{font:600 12px/1 'Inter',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--x-muted);margin:6px 0 8px;display:flex;align-items:center;gap:8px;}" +
    "@media (max-width:1100px){html#aikm body #mpPanel .mp-cols{grid-template-columns:1fr;}}";
  document.head.appendChild(st);

  var data = {}, unsub = null, mpDb = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(ts) { if (!ts) return ""; return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4500);
  }
  function table(head, rows) {
    return '<div class="table-scroll" style="max-height:300px;"><table class="data"><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  }
  function db() {
    if (mpDb) return mpDb;
    if (typeof firebase === "undefined" || !firebase.initializeApp || !firebase.firestore) return null;
    try { var app = (firebase.apps || []).filter(function (a) { return a.name === "omsSync" || (a.options && a.options.projectId === "aikm-oms-sync"); })[0] || firebase.initializeApp(OMS_CFG, "omsSync"); mpDb = app.firestore(); } catch (e) { return null; }
    return mpDb;
  }
  function mainDb() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }

  /* ---------- mount at the top of the Easy Ship page ---------- */
  function mount() {
    var tab = $("tab-easyship"); if (!tab || $("mpPanel")) return !!tab;
    var p = document.createElement("div");
    p.className = "panel"; p.id = "mpPanel";
    p.innerHTML =
      '<div class="mp-top"><span class="mp-title"><i class="ti ti-shopping-bag"></i>Meesho + Snapdeal</span>' +
        '<span class="es-state" id="mpState"><span class="es-dot"></span><span id="mpStateTxt">Connecting…</span></span>' +
        '<span class="es-meta">Auto every day 10 AM · packs all New orders · labels also on Telegram</span>' +
        '<div class="mp-btns">' +
          '<button type="button" class="secondary" id="mpDryBtn" title="Shows what would be packed — packs nothing"><i class="ti ti-eye"></i> Preview</button>' +
          '<button type="button" class="secondary" id="mpTestBtn" title="Packs just 1 order — for testing"><i class="ti ti-flask"></i> Test 1 order</button>' +
          '<button type="button" class="secondary mp-main" id="mpRunBtn"><i class="ti ti-player-play"></i> Run now</button>' +
        "</div></div>" +
      '<div class="mp-stats" id="mpStats"></div>' +
      '<div class="mp-cols"><div>' +
        '<h3>Labels <span id="mpLabelsFor" class="es-meta" style="text-transform:none;letter-spacing:0"></span><button type="button" class="btn-gold" id="mpAllBtn" style="margin-left:auto;display:none;"><i class="ti ti-files"></i> Download all (1 PDF)</button></h3><div id="mpLabels"></div>' +
        '<h3 style="margin-top:14px">Not packed — fix in OMS Guru</h3><div id="mpFailed"></div>' +
      "</div><div>" +
        '<h3>Picklist <span id="mpPickCount" class="es-meta" style="text-transform:none;letter-spacing:0"></span></h3><div id="mpPick"></div>' +
      "</div></div>";
    tab.insertBefore(p, tab.firstChild);
    $("mpRunBtn").addEventListener("click", function () { runNow({ dry_run: "false", limit: "0" }, "Pack ALL New Meesho + Snapdeal orders now?"); });
    $("mpTestBtn").addEventListener("click", function () { runNow({ dry_run: "false", limit: "1" }, "Pack just 1 Meesho / Snapdeal order as a test?"); });
    $("mpDryBtn").addEventListener("click", function () { runNow({ dry_run: "true", limit: "0" }); });
    if (data.live) render();
    return true;
  }

  /* ---------- live data: only while the Easy Ship page is open ---------- */
  function listen() {
    if (unsub || !db()) return;
    unsub = db().collection("aikm_admin").doc("marketplacePack").onSnapshot(function (d) { data = d.exists ? d.data() : {}; render(); }, function () { setState("bad", "Could not read Meesho data"); });
  }
  function stop() { if (unsub) { unsub(); unsub = null; } }
  setInterval(function () {
    var open = !document.hidden && document.querySelector('.tabbtn.active[data-tab="easyship"]');
    if (open) { mount(); listen(); } else stop();
  }, 1500);

  function setState(cls, txt) { var s = $("mpState"); if (!s) return; s.className = "es-state " + (cls || ""); $("mpStateTxt").textContent = txt; }
  function stat(n, label, c) { return '<div class="mp-stat" style="--c:' + c + '"><b>' + n + "</b><span>" + label + "</span></div>"; }

  function render() {
    if (!$("mpPanel")) return;
    var live = data.live || {}, last = data.last || null, dry = data.lastDry || null;
    var running = live.state === "running" && Date.now() - new Date(live.updatedAt).getTime() < 12 * 60000;
    setState(running ? "run" : live.state === "failed" ? "bad" : last ? "ok" : "", running ? live.step : live.state === "failed" ? live.step : last ? "Last run " + when(last.finishedAt) : "Not run yet");
    ["mpRunBtn", "mpTestBtn", "mpDryBtn"].forEach(function (id) { if ($(id)) $(id).disabled = running; });
    var showDry = dry && (!last || dry.at > last.finishedAt);

    var s = "";
    if (last) s += stat(last.packed || 0, "Packed · " + esc(last.date || ""), "#22A06B") + stat((last.failed || []).length, "Not packed", "#E5484D") + stat((last.check || []).length, "Check in OMS", "#E09B12");
    if (dry) s += stat(dry.wouldPack || 0, "Waiting in New · " + when(dry.at), "#3E63DD");
    $("mpStats").innerHTML = s || '<div class="es-meta">No runs yet — click Preview to see waiting orders.</div>';

    // labels (latest run + earlier runs)
    var files = (last && last.files) || {}, accs = Object.keys(files).filter(function (a) { return files[a].pages; });
    $("mpLabelsFor").textContent = last ? "· " + (last.date || "") : "";
    $("mpAllBtn").style.display = accs.length > 1 ? "" : "none";
    var h = accs.map(function (a) { return labelRow(a, files[a], last.runId, false); }).join("");
    (data.history || []).forEach(function (r) { if (!last || r.runId === last.runId) return; Object.keys(r.files || {}).forEach(function (a) { if (r.files[a].pages) h += labelRow(a, r.files[a], r.runId, true, r.date); }); });
    $("mpLabels").innerHTML = h || '<div class="es-empty">No labels yet.</div>';

    // failed + check
    var bad = ((last && last.failed) || []).map(function (f) { return "<tr><td>" + esc(f.orderId) + "</td><td>" + esc(f.account) + "</td><td>" + esc(f.sku) + '</td><td><span class="es-tag">' + esc(f.reason) + "</span></td></tr>"; })
      .concat(((last && last.check) || []).map(function (f) { return "<tr><td>" + esc(f.orderId) + "</td><td>" + esc(f.account) + "</td><td></td><td><span class=\"es-tag amber\">" + esc(f.reason) + "</span></td></tr>"; }));
    $("mpFailed").innerHTML = bad.length ? table(["Order", "Account", "Product", "Why"], bad) : '<div class="es-empty">Nothing — all packed.</div>';

    // picklist, or the preview list when the newest thing is a preview
    if (showDry) {
      var pv = dry.preview || [];
      $("mpPickCount").textContent = "· preview — " + pv.length + " orders would be packed";
      $("mpPick").innerHTML = pv.length ? table(["Order", "Account", "Product"], pv.map(function (o) { return "<tr><td>" + esc(o.orderId) + "</td><td>" + esc(o.account) + "</td><td>" + esc(o.sku) + "</td></tr>"; })) : '<div class="es-empty">No Meesho / Snapdeal orders in New.</div>';
    } else {
      var pk = (last && last.picklist) || [];
      $("mpPickCount").textContent = pk.length ? "· " + pk.reduce(function (a, x) { return a + x.qty; }, 0) + " units" : "";
      $("mpPick").innerHTML = pk.length ? table(["Qty", "Product (SKU)"], pk.map(function (x) { return '<tr><td class="num">' + x.qty + "</td><td>" + esc(x.sku) + "</td></tr>"; })) : '<div class="es-empty">No picklist yet.</div>';
    }
  }
  function labelRow(acc, f, runId, old, date) {
    var size = f.sizeKB ? " · " + (f.sizeKB > 1024 ? (f.sizeKB / 1024).toFixed(1) + " MB" : f.sizeKB + " KB") : "";
    return '<div class="es-acc"' + (old ? ' style="opacity:.75"' : "") + '><div class="es-acc-ic" style="background:#FDEFF7;color:#D6409F"><i class="ti ' + (old ? "ti-history" : "ti-file-text") + '"></i></div><div class="es-acc-info"><div class="es-acc-name">' + esc(acc) +
      '</div><div class="es-acc-sub">' + (old ? "Earlier run · " + esc(date || "") + " · " : "") + f.pages + " labels" + size + (f.missing && f.missing.length ? " · " + f.missing.length + " missing" : "") + "</div></div>" +
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
