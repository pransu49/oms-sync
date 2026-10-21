/* AIKM Admin Console — Bulk Refund tab (Amazon Order Adjustment file).
   Loaded by easyship-tab.js (no Shopify edit needed).
   Data: aikm_admin/omsRefundOrders in "aikm-oms-sync" — SELF-SHIP orders whose latest NimbusPost shipment is RTO (last 60 days),
   refreshed once a day by refund-sync.yml. Read ONCE when the tab is opened (1 Firebase read).
   Orders not found there are looked up in the 15-day OMS data (only when needed), or in an OMS export file
   uploaded here (that file is read in the browser only — nothing is saved). */
(function(){var st=document.createElement('style');st.textContent="\
html#aikm body #tab-refund .rf-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;}\
html#aikm body #tab-refund textarea#rfIds{width:100%;min-height:96px;resize:vertical;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;}\
html#aikm body #tab-refund .rf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;}\
html#aikm body #tab-refund .rf-meta{font-size:12px;color:var(--x-muted);}\
html#aikm body #tab-refund .rf-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12px;font-weight:600;color:var(--x-text-2);cursor:pointer;}\
html#aikm body #tab-refund .rf-chip.on{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line);}\
html#aikm body #tab-refund td.num,html#aikm body #tab-refund th.num{text-align:right;font-variant-numeric:tabular-nums;}\
html#aikm body #tab-refund td.num b{font-weight:600;}\
html#aikm body #tab-refund td.num,html#aikm body #tab-refund td.num .rf-meta{white-space:nowrap;}\
html#aikm body #tab-refund .rf-tag{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:600;background:var(--x-amber-soft);color:var(--x-amber);white-space:nowrap;}\
html#aikm body #tab-refund .rf-tag.red{background:var(--x-red-soft);color:var(--x-red);}\
html#aikm body #tab-refund .rf-tag.green{background:var(--x-green-soft,rgba(46,160,90,.14));color:var(--x-green);}\
html#aikm body #tab-refund .rf-acc{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--x-line);border-radius:10px;background:var(--x-surface-2);margin-bottom:8px;}\
html#aikm body #tab-refund .rf-acc-info{flex:1;min-width:0;}\
html#aikm body #tab-refund .rf-acc-name{font-weight:600;font-size:13.5px;color:var(--x-text);}\
html#aikm body #tab-refund .rf-acc-sub{font-size:12px;color:var(--x-muted);margin-top:2px;}\
html#aikm body #tab-refund .rf-empty{padding:18px;text-align:center;color:var(--x-muted);font-size:13px;border:1px dashed var(--x-line-2);border-radius:10px;}\
html#aikm body #tab-refund .rf-miss{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--x-red-soft);color:var(--x-red);font-size:12.5px;line-height:1.6;word-break:break-all;}\
html#aikm body #tab-refund .rf-rule{font-size:12px;color:var(--x-muted);line-height:1.65;}\
html#aikm body #tab-refund .rf-rule b{color:var(--x-text-2);}\
html#aikm body #subtab-refund .rf-btn-main{background:var(--x-primary) !important;color:var(--x-primary-ink) !important;border-color:var(--x-primary) !important;}\
@media (max-width:1100px){html#aikm body #tab-refund .rf-grid{grid-template-columns:1fr;}}\
";document.head.appendChild(st);})();

(function () {
  if (window.__aikmRefund) return; window.__aikmRefund = true;
  var REPO = "pransu49/oms-sync", WF = "refund-sync.yml", TK = "aikm_gh_sync_token";
  var REASONS = [["CustomerCancel", "Buyer Cancelled"], ["CustomerReturn", "Customer Return"], ["CouldNotShip", "Could Not Ship"], ["NoInventory", "No Inventory"], ["GeneralAdjustment", "General Adjustment"]];
  var HEAD = ["order-id", "order-item-id", "adjustment-reason-code", "currency", "item-price-adj", "item-tax-adj", "shipping-price-adj", "shipping-tax-adj", "gift-wrap-price-adj", "gift-wrap-tax-adj", "item-promotion-adj", "item-promotion-id", "ship-promotion-adj", "ship-promotion-id"];

  /* ---------- 1. sidebar item + page ---------- */
  function mount() {
    var bar = document.getElementById("mainTabbar"), content = document.querySelector(".app-content");
    if (!bar || !content || document.getElementById("tab-refund")) return;
    var b = document.createElement("button");
    b.className = "tabbtn"; b.dataset.tab = "refund";
    b.innerHTML = '<i class="ti ti-receipt-refund tab-ic"></i>Bulk Refund';
    var after = bar.querySelector('[data-tab="easyship"]') || bar.querySelector('[data-tab="selfship"]');
    after ? after.insertAdjacentElement("afterend", b) : bar.appendChild(b);

    var sub = document.createElement("div");
    sub.className = "subtabbar no-print"; sub.id = "subtab-refund"; sub.style.display = "none";
    sub.innerHTML = '<span class="subtab-label">Amazon Bulk Refund</span>' +
      '<span class="rf-meta" id="rfSyncLine">Self-ship refund pending · NimbusPost · last 60 days</span>' +
      '<span style="flex:1"></span>' +
      '<label class="subbtn" style="cursor:pointer;" title="Order older than 60 days? Upload an OMS Guru export (zip / csv / xlsx). Read here only, nothing is saved."><i class="ti ti-upload"></i> Upload OMS export<input type="file" id="rfFile" accept=".zip,.csv,.xlsx,.xls" style="display:none"></label>' +
      '<button type="button" class="subbtn" id="rfSyncBtn" title="Pull the latest 60 days from OMS Guru now (about 3–6 minutes)"><i class="ti ti-refresh"></i> Update now</button>';
    content.insertBefore(sub, content.firstChild);

    var p = document.createElement("div");
    p.id = "tab-refund"; p.className = "tabpanel";
    p.innerHTML =
      '<div class="cx-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr)) !important;">' +
        kpi("rfKpiAvail", "Refund pending", "rfKpiAvailSub") + kpi("rfKpiSel", "Selected to refund", "rfKpiSelSub") +
        kpi("rfKpiAmt", "Total refund", "rfKpiAmtSub") + kpi("rfKpiAcc", "Files to upload", "rfKpiAccSub") +
      "</div>" +
      '<div class="rf-grid"><div>' +
        '<div class="panel"><h2>1 · Pick orders</h2>' +
          '<textarea id="rfIds" placeholder="Paste Amazon order IDs here — one per line, or copy a whole column from Excel.&#10;e.g. 408-1718820-2871569"></textarea>' +
          '<div class="rf-row"><button type="button" class="btn-gold" id="rfFindBtn"><i class="ti ti-search"></i> Find orders</button>' +
          '<span class="rf-meta">or show from NimbusPost:</span>' +
          '<span class="rf-chip" data-rf-show="rto">Returned (RTO)</span><span class="rf-chip" data-rf-show="late">Pickup missed</span><span class="rf-chip" data-rf-show="lost">Lost / damaged</span><span class="rf-chip" data-rf-show="all">All refund pending</span>' +
          '<button type="button" class="secondary" id="rfClearBtn" style="margin-left:auto;"><i class="ti ti-x"></i> Clear</button></div>' +
          '<div id="rfMiss"></div></div>' +
        '<div class="panel"><h2>2 · Check amounts <span class="rf-meta" id="rfCount"></span>' +
          '<label class="rf-meta" style="margin-left:auto;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="rfShipChk" checked> Refund shipping too</label></h2>' +
          '<small class="hint">Same split as Seller Central\'s refund screen: price without tax + tax, shipping without tax + tax.</small>' +
          '<div id="rfTable" style="margin-top:10px"><div class="rf-empty">Paste order IDs above, or pick Returned / Pickup missed / Lost / All.</div></div></div>' +
      '</div><div>' +
        '<div class="panel"><h2>3 · Download &amp; upload</h2>' +
          '<label class="rf-meta" for="rfReason" style="display:block;margin-bottom:6px;">Reason for refund</label>' +
          '<select id="rfReason" style="width:100%;min-height:36px;margin-bottom:12px;">' + REASONS.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("") + "</select>" +
          '<div id="rfFiles"><div class="rf-empty">Select orders first.</div></div></div>' +
        '<div class="panel"><h2>Refund robot <span class="rf-meta" id="rfRobotState"></span></h2><div id="rfRobot"><div class="rf-empty">No robot refunds yet.</div></div></div>' +
        '<div class="panel"><h2>How to upload</h2><div class="rf-rule">' +
          "<b>SASTA STORE &amp; Praso:</b> tick orders → check amounts → <b>Refund now</b>. The robot sends it to Amazon and shows Refunded / Failed below.<br><br><b>Other accounts:</b><br>" +
          "<b>1.</b> Download the file for an account.<br>" +
          "<b>2.</b> Log into <b>that account</b> in Seller Central.<br>" +
          "<b>3.</b> Orders → <b>Upload Order Related Files</b> → <b>Order Adjustment</b> → upload.<br>" +
          "<b>4.</b> Check <b>Review File Status</b> → should say Done, 0 errors.<br><br>" +
          "<b>Refund pending when:</b> shipment returned (any RTO stage), lost/damaged, or not picked up after Amazon\'s Deliver By date (SASTA STORE &amp; Praso).<br>" +
          "<b>Self-ship only:</b> status comes from NimbusPost (OMS often still says Shipped). Easy Ship orders are never listed.<br>" +
          "<b>Safe:</b> Amazon never refunds more than the customer paid — an order already refunded is rejected, not paid twice.<br>" +
          "<b>Older than 60 days?</b> Use <b>Upload OMS export</b> (top right)." +
        "</div></div>" +
      "</div></div>";
    content.appendChild(p);

    b.addEventListener("click", function () {
      document.querySelectorAll(".tabbtn").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".tabpanel").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".subtabbar").forEach(function (x) { x.style.display = "none"; });
      b.classList.add("active"); p.classList.add("active"); sub.style.display = "flex";
      try { document.body.classList.remove("sidebar-open"); document.getElementById("appSidebarBackdrop").classList.remove("show"); } catch (e) {}
      load(false);
    });

    $("rfFindBtn").addEventListener("click", find);
    $("rfIds").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) find(); });
    $("rfClearBtn").addEventListener("click", function () { $("rfIds").value = ""; sel = []; missing = []; chip(""); render(); });
    $("rfShipChk").addEventListener("change", render);
    $("rfReason").addEventListener("change", render);
    $("rfSyncBtn").addEventListener("click", syncNow);
    $("rfFile").addEventListener("change", uploadExport);
    p.addEventListener("click", function (e) {
      var c = e.target.closest("[data-rf-show]"); if (c) { showStatus(c.dataset.rfShow); return; }
      var d = e.target.closest("[data-rf-dl]"); if (d) { download(d.dataset.rfDl); return; }
      var rn = e.target.closest("[data-rf-now]"); if (rn) { refundNow(rn.dataset.rfNow); return; }
      var x = e.target.closest("[data-rf-x]"); if (x) { sel = sel.filter(function (o) { return o.i !== x.dataset.rfX; }); render(); }
    });
    p.addEventListener("change", function (e) {
      if (e.target.id === "rfAll") { var on = e.target.checked; sel.forEach(function (o) { o.off = !on; }); render(); }
      else if (e.target.dataset && e.target.dataset.rfOn) { var o = sel.filter(function (x) { return x.i === e.target.dataset.rfOn; })[0]; if (o) { o.off = !e.target.checked; render(); } }
    });
  }
  function kpi(id, label, subId) {
    return '<div class="cx-kpi"><div class="cx-kpi-label">' + label + '</div><div class="cx-kpi-num" id="' + id + '">–</div><div class="cx-kpi-sub" id="' + subId + '">&nbsp;</div></div>';
  }
  mount(); document.addEventListener("DOMContentLoaded", mount);

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function r2(n) { return Math.round((n + 1e-9) * 100) / 100; }
  function f2(n) { return (Math.round(n * 100) / 100).toFixed(2); }
  function inr(n) { return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function cleanId(v) { return String(v == null ? "" : v).replace(/^[`'\s]+/, "").trim(); }
  function today() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
  function when(ts) { if (!ts) return ""; var d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4500);
  }
  function chip(k) { document.querySelectorAll("#tab-refund [data-rf-show]").forEach(function (c) { c.classList.toggle("on", c.dataset.rfShow === k); }); }
  function isAmazon(ch) { return /amazon/i.test(ch || "") && !/fba/i.test(ch || ""); }
  function accName(ch) { return String(ch || "").replace(/\s*-\s*amazon\s*$/i, "").trim() || "Amazon"; }

  // Same split as Seller Central: per-unit price without tax (2 decimals) × qty, tax = rest.
  function split(gross, qty, rate) {
    var unitNet = r2(gross / (1 + rate / 100)), net = r2(unitNet * qty), tax = r2(gross * qty - net);
    return [net, tax];
  }
  function calc(o) {
    var it = split(o.p, o.q, o.t), sh = $("rfShipChk").checked ? split(o.s, o.q, o.t) : [0, 0];
    return { ip: it[0], it: it[1], sp: sh[0], stx: sh[1], tot: r2(it[0] + it[1] + sh[0] + sh[1]) };
  }

  /* ---------- 2. data (read once per tab open) ---------- */
  var store = [], storeAt = null, loaded = false, loading = null, extra = {}, fifteen = null;
  var sel = [], missing = [];
  var OMS_CFG = { apiKey: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk", authDomain: "aikm-oms-sync.firebaseapp.com", projectId: "aikm-oms-sync",
    storageBucket: "aikm-oms-sync.firebasestorage.app", messagingSenderId: "464184383750", appId: "1:464184383750:web:4fb422b90e519a87d76687" };
  var rfDb = null;
  function db() {
    if (rfDb) return rfDb;
    if (typeof firebase === "undefined" || !firebase.initializeApp || !firebase.firestore) return null;
    try { var app = (firebase.apps || []).filter(function (a) { return a.name === "omsSync" || (a.options && a.options.projectId === "aikm-oms-sync"); })[0] || firebase.initializeApp(OMS_CFG, "omsSync"); rfDb = app.firestore(); } catch (e) { return null; }
    return rfDb;
  }
  function mainDb() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }
  function load(force) {
    if (loaded && !force) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res) {
      var w = setInterval(function () {
        if (!db()) return; clearInterval(w);
        var ref = db().collection("aikm_admin").doc("omsRefundOrders");
        function timed(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]); }
        // the console's idle-pause can leave Firebase switched off -> switch it on and try again
        timed(ref.get(), 12000).catch(function () { try { db().enableNetwork(); } catch (e) {} return timed(ref.get(), 25000); })
          .then(function (d) { var x = d.exists ? d.data() : {}; store = x.orders || []; storeAt = x.at || null; loaded = true; })
          .catch(function () { toast("Could not read refund data — check internet, then click the tab again.", true); })
          .then(function () { loading = null; render(); res(); });
      }, 300);
    });
    return loading;
  }
  // Refund robot log (aikm_admin/refundLog) — listened to only while this tab is open
  var rlog = { entries: [] }, unsubLog = null;
  function refunded(i) { return (rlog.entries || []).filter(function (e) { return e.i === i && e.status === "done" && !e.probe; })[0] || null; }
  function listenLog() {
    if (unsubLog || !db()) return;
    unsubLog = db().collection("aikm_admin").doc("refundLog").onSnapshot(function (d) { rlog = d.exists ? d.data() : { entries: [] }; render(); }, function () {});
  }
  function stopLog() { if (unsubLog) { unsubLog(); unsubLog = null; } }
  document.addEventListener("click", function (e) {
    var t = e.target.closest(".tabbtn[data-tab]"); if (!t) return;
    if (t.dataset.tab === "refund") { load(false); var w = setInterval(function () { if (db()) { clearInterval(w); listenLog(); } }, 500); }
    else stopLog();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopLog(); else if (document.querySelector('.tabbtn.active[data-tab="refund"]')) listenLog();
  });

  // 15-day OMS data — only read when a pasted order is not in the 60-day refund list
  function loadFifteen() {
    if (fifteen) return Promise.resolve(fifteen);
    return db().collection("aikm_admin").doc("omsOrders").collection("chunks").get().then(function (snap) {
      fifteen = {};
      snap.forEach(function (d) { (d.data().orders || []).forEach(function (o) {
        if (!isAmazon(o.channel) || !o.channelOrderId) return;
        (fifteen[o.channelOrderId] = fifteen[o.channelOrderId] || []).push({ a: accName(o.channel), o: o.channelOrderId, i: o.channelSubOrderId, q: num(o.qty) || 1,
          p: num(o.price), s: num(o.shippingCharge), t: num(o.taxRate), st: o.status || "", d: o.orderDate || "", ty: o.orderType || "", n: o.productName || o.sku || "" });
      }); });
      return fifteen;
    });
  }

  function indexBy(list) { var m = {}; list.forEach(function (o) { (m[o.o] = m[o.o] || []).push(o); }); return m; }
  function addSel(lines) {
    var have = {}; sel.forEach(function (o) { have[o.i] = 1; });
    lines.forEach(function (o) { if (o.i && !have[o.i]) { have[o.i] = 1; sel.push(Object.assign({}, o, { off: !o.nb || !!refunded(o.i) })); } }); // not refund pending / already refunded -> unticked
  }

  async function find() {
    var ids = ($("rfIds").value.match(/\d{3}-\d{7}-\d{7}/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (!ids.length) { toast("No Amazon order IDs found in the box (format 123-1234567-1234567).", true); return; }
    $("rfFindBtn").disabled = true; chip("");
    try {
      await load(false);
      var m = indexBy(store), ext = extra, left = [];
      ids.forEach(function (id) { var l = m[id] || ext[id]; if (l) addSel(l); else left.push(id); });
      if (left.length && db()) {
        $("rfMiss").innerHTML = '<div class="rf-meta" style="margin-top:10px">Looking in the last 15 days of OMS data…</div>';
        var f = await loadFifteen(); var still = [];
        left.forEach(function (id) { if (f[id]) addSel(f[id]); else still.push(id); });
        left = still;
      }
      missing = left;
    } catch (e) { toast("Lookup failed: " + e.message, true); }
    $("rfFindBtn").disabled = false; render();
  }
  async function showStatus(k) {
    await load(false); chip(k); sel = []; missing = [];
    addSel(store.filter(function (o) {
      return !refunded(o.i) && (k === "all" ? true : k === "rto" ? /^rto/.test(o.nb) : o.nb === k);
    }));
    sel.forEach(function (o) { o.off = true; }); // nothing ticked until you choose
    render();
    toast(sel.length + " refund-pending line(s) shown — tick the ones to refund.");
  }

  /* ---------- 3. render ---------- */
  function render() {
    if (!$("tab-refund")) return;
    $("rfSyncLine").textContent = loaded ? "Self-ship refund pending · NimbusPost · last 60 days · updated " + (when(storeAt) || "never — click Update now") : "Self-ship RTO · NimbusPost · last 60 days";
    var pend = store.filter(function (o) { return !refunded(o.i); });
    $("rfKpiAvail").textContent = loaded ? pend.length : "–";
    $("rfKpiAvailSub").textContent = loaded ? pend.filter(function (o) { return /^rto/.test(o.nb); }).length + " returned · " + pend.filter(function (o) { return o.nb === "late"; }).length + " pickup missed · " + pend.filter(function (o) { return o.nb === "lost"; }).length + " lost" : "loading…";

    $("rfMiss").innerHTML = missing.length ? '<div class="rf-miss"><b>Not found (' + missing.length + "):</b> " + missing.map(esc).join(", ") +
      '<br><span style="opacity:.85">Not found in OMS — older than 70 days? Upload an OMS export (top right) and click Find again.</span></div>' : "";

    sel.forEach(function (o) { if (refunded(o.i)) o.off = true; });
    var on = sel.filter(function (o) { return !o.off; });
    $("rfCount").textContent = sel.length ? "· " + on.length + " of " + sel.length + " ticked" : "";
    if (!sel.length) { $("rfTable").innerHTML = '<div class="rf-empty">Paste order IDs above, or pick Returned / Pickup missed / Lost / All.</div>'; }
    else {
      var rows = sel.map(function (o) {
        var c = calc(o);
        var dd = function (x) { return x ? x.slice(8, 10) + "/" + x.slice(5, 7) : ""; };
        var rf = refunded(o.i);
        if (rf) o.off = true;
        var tag = rf ? "rf-tag green" : o.nb ? "rf-tag red" : "rf-tag";
        var nsTxt = rf ? "Refunded ✓ " + new Date(rf.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : o.nb ? "Refund pending" : "Not refund pending";
        var why = /^rto/.test(o.nb || "") ? "Shipment returned · " + o.ns.replace(/^rto/i, "RTO")
          : o.nb === "late" ? "Not picked up · Deliver By " + dd(o.db) + " passed"
          : o.nb === "lost" ? (/damage/i.test(o.ns) ? "Damaged" : "Lost") + " in transit"
          : "Not RTO / lost / late in NimbusPost";
        return "<tr" + (o.off ? ' style="opacity:.5"' : "") + "><td><input type='checkbox' data-rf-on='" + esc(o.i) + "'" + (o.off ? "" : " checked") + (rf ? " disabled title='Already refunded by the robot'" : "") + "></td>" +
          "<td class='cx-awb'>" + esc(o.o) + "<div class='rf-meta'>" + esc(o.i) + "</div></td><td>" + esc(o.a) + "</td>" +
          "<td style='max-width:220px'><div style='white-space:nowrap;overflow:hidden;text-overflow:ellipsis' title='" + esc(o.n) + "'>" + esc(o.n) + "</div><div class='rf-meta'>Qty " + o.q + " · " + esc(o.ty) + "</div></td>" +
          "<td><span class='" + tag + "'>" + esc(nsTxt) + "</span><div class='rf-meta' style='color:var(--x-text-2)'>" + esc(why) + "</div><div class='rf-meta'>" + (o.aw ? esc(o.aw) + (o.nd && o.nb !== "late" ? " · " + esc(dd(o.nd)) : "") : "") + "</div><div class='rf-meta'>OMS: " + esc(o.st) + "</div></td>" +
          "<td class='num'>" + f2(c.ip) + "<div class='rf-meta'>+" + f2(c.it) + " tax</div></td>" +
          "<td class='num'>" + f2(c.sp) + "<div class='rf-meta'>+" + f2(c.stx) + " tax</div></td>" +
          "<td class='num'><b>" + inr(c.tot) + "</b></td>" +
          "<td><button type='button' class='secondary' data-rf-x='" + esc(o.i) + "' title='Remove' style='padding:2px 7px;min-height:0'><i class='ti ti-x'></i></button></td></tr>";
      });
      var allOn = on.length === sel.length;
      $("rfTable").innerHTML = '<div class="table-scroll" style="max-height:520px;"><table class="data"><thead><tr><th><input type="checkbox" id="rfAll"' + (allOn ? " checked" : "") + '></th>' +
        "<th>Order / item ID</th><th>Account</th><th>Product</th><th>Status</th><th class='num'>Item</th><th class='num'>Shipping</th><th class='num'>Refund</th><th></th></tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
    }

    // per-account files
    var by = {};
    on.forEach(function (o) { var c = calc(o); var b = by[o.a] = by[o.a] || { n: 0, amt: 0, orders: {} }; b.n++; b.amt = r2(b.amt + c.tot); b.orders[o.o] = 1; });
    var accs = Object.keys(by).sort(), total = accs.reduce(function (s, a) { return s + by[a].amt; }, 0);
    $("rfKpiSel").textContent = sel.length ? on.length : "–";
    $("rfKpiSelSub").textContent = sel.length ? "order lines ticked" : "";
    $("rfKpiAmt").textContent = on.length ? inr(total) : "–";
    $("rfKpiAmtSub").textContent = on.length ? ($("rfShipChk").checked ? "item + shipping, incl. tax" : "item only, incl. tax") : "";
    $("rfKpiAcc").textContent = on.length ? accs.length : "–";
    $("rfKpiAccSub").textContent = on.length ? "one per Amazon account" : "";
    $("rfFiles").innerHTML = accs.length ? accs.map(function (a) {
      return '<div class="rf-acc"><div class="rf-acc-info"><div class="rf-acc-name">' + esc(a) + '</div><div class="rf-acc-sub">' + Object.keys(by[a].orders).length + " order(s) · " + inr(by[a].amt) +
        (ROBOT[a] ? " · <b style='color:var(--x-green)'>robot</b>" : " · upload file by hand") + '</div></div>' +
        (ROBOT[a] ? '<button type="button" class="btn-gold" data-rf-now="' + esc(a) + '" title="Robot sends this refund to Amazon now"><i class="ti ti-send"></i> Refund now</button>' : "") +
        '<button type="button" class="' + (ROBOT[a] ? "secondary" : "btn-gold") + '" data-rf-dl="' + esc(a) + '" title="Download the Order Adjustment file"><i class="ti ti-download"></i>' + (ROBOT[a] ? "" : " File") + '</button></div>';
    }).join("") : '<div class="rf-empty">Select orders first.</div>';
    renderRobot();
  }

  /* ---------- Refund robot (only on your command) ---------- */
  var ROBOT = { "SASTA STORE": 1, "PRASO ENTERPRISES": 1 }, RWF = "refund-robot.yml";
  async function refundNow(acc) {
    var reason = $("rfReason").value, reasonTxt = $("rfReason").selectedOptions[0].textContent;
    var lines = sel.filter(function (o) { return !o.off && o.a === acc && !refunded(o.i); });
    if (!lines.length) return;
    var live = rlog.live || {};
    if (live.state === "running" && Date.now() - new Date(live.updatedAt).getTime() < 25 * 60000) { toast("The robot is still working on the last refund — wait for it to finish.", true); return; }
    var amt = lines.reduce(function (s, o) { return s + calc(o).tot; }, 0);
    var orders = {}; lines.forEach(function (o) { orders[o.o] = 1; });
    if (!confirm("REFUND NOW — " + acc + "\n\n" + Object.keys(orders).length + " order(s) · " + lines.length + " line(s) · " + inr(amt) + "\nReason: " + reasonTxt +
      "\n\nThe robot sends this to Amazon now. Money goes back to the customers and cannot be undone.\nAll details checked?")) return;
    var payload = lines.map(function (o) { var c = calc(o); return { a: o.a, o: o.o, i: o.i, r: reason, ip: c.ip, it: c.it, sp: c.sp, stx: c.stx }; });
    var json = JSON.stringify(payload);
    if (json.length > 60000) { toast("Too many lines for one go (" + lines.length + ") — untick some and send in two parts.", true); return; }
    var tok = await getToken();
    if (!tok) { toast("GitHub token missing — click any 'Sync OMS now' button once to set it up, then try again.", true); return; }
    try {
      var r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + RWF + "/dispatches", {
        method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { lines: json, requested_by: "console" } }) });
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
      rlog.live = { state: "running", step: acc + ": starting…", updatedAt: new Date().toISOString() };
      render(); listenLog();
      toast("Refund robot started for " + acc + " — results show here in about 2–5 minutes.");
    } catch (err) { toast("Could not start the robot: " + err.message, true); }
  }
  function renderRobot() {
    if (!$("rfRobot")) return;
    var live = rlog.live || {}, running = live.state === "running" && Date.now() - new Date(live.updatedAt).getTime() < 25 * 60000;
    $("rfRobotState").textContent = running ? "· working: " + (live.step || "") : "";
    var ent = (rlog.entries || []).filter(function (e) { return !e.probe; }).slice(0, 40);
    $("rfRobot").innerHTML = ent.length ? '<div class="table-scroll" style="max-height:300px;"><table class="data"><tbody>' + ent.map(function (e) {
      var t = e.status === "done" ? "rf-tag green" : e.status === "skipped" ? "rf-tag" : "rf-tag red";
      return "<tr><td class='cx-awb'>" + esc(e.o) + "<div class='rf-meta'>" + esc(e.a) + " · " + new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) + "</div></td>" +
        "<td class='num'>" + inr(e.amt || 0) + "</td><td><span class='" + t + "'>" + (e.status === "done" ? "Refunded" : e.status === "skipped" ? "Skipped" : "Failed") + "</span>" +
        (e.status !== "done" ? "<div class='rf-meta' style='white-space:normal;max-width:220px'>" + esc(e.msg) + "</div>" : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>" : '<div class="rf-empty">' + (running ? "Working… results appear here." : "No robot refunds yet.") + "</div>";
  }

  /* ---------- 4. the Amazon file ---------- */
  function download(acc) {
    var reason = $("rfReason").value, reasonTxt = $("rfReason").selectedOptions[0].textContent;
    var lines = sel.filter(function (o) { return !o.off && o.a === acc; });
    if (!lines.length) return;
    var amt = lines.reduce(function (s, o) { return s + calc(o).tot; }, 0);
    if (!confirm("Refund file for " + acc + "\n\n" + lines.length + " order line(s) · " + inr(amt) + "\nReason: " + reasonTxt +
      "\n\nMoney moves only when you upload this file in Seller Central (log into " + acc + ").")) return;
    var rows = [HEAD.join("\t")];
    lines.forEach(function (o) { var c = calc(o);
      rows.push([o.o, o.i, reason, "INR", f2(c.ip), f2(c.it), c.sp || c.stx ? f2(c.sp) : "", c.sp || c.stx ? f2(c.stx) : "", "", "", "", "", "", ""].join("\t")); });
    var blob = new Blob([rows.join("\r\n") + "\r\n"], { type: "text/plain" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "Refund_" + acc.replace(/[^A-Za-z0-9]+/g, "_") + "_" + today() + ".txt";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Downloaded — upload it in Seller Central → Upload Order Related Files → Order Adjustment.");
  }

  /* ---------- 5. OMS export upload (fallback for older orders) ---------- */
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  async function uploadExport(e) {
    var file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file) return;
    try {
      var rows;
      if (/\.zip$/i.test(file.name)) {
        if (typeof JSZip === "undefined") await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
        var zip = await JSZip.loadAsync(file), entry = Object.values(zip.files).filter(function (f) { return /\.(csv|xlsx?)$/i.test(f.name); })[0];
        if (!entry) throw new Error("no CSV/Excel file inside the zip");
        rows = sheetRows(XLSX.read(await entry.async("uint8array"), { type: "array", raw: true }));
      } else {
        rows = sheetRows(XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", raw: true }));
      }
      var n = 0;
      rows.forEach(function (r) {
        var ch = pick(r, ["Channel Name"]); if (!isAmazon(ch)) return;
        var o = { a: accName(ch), o: cleanId(pick(r, ["Channel Order Id"])), i: cleanId(pick(r, ["Channel Sub Order Id"])), q: num(pick(r, ["Qty"])) || 1,
          p: num(pick(r, ["Selling Price Per Item"])), s: num(pick(r, ["Shipping Charge Per Item"])), t: num(pick(r, ["Tax Rate"])),
          st: pick(r, ["Order Status"]), d: pick(r, ["Order Date"]), ty: pick(r, ["Order Type"]), n: pick(r, ["Product Name"]) };
        if (!o.o || !o.i) return;
        var l = extra[o.o] = extra[o.o] || []; if (!l.some(function (x) { return x.i === o.i; })) { l.push(o); n++; }
      });
      if (!n) throw new Error("no Amazon orders found — is this an OMS Guru 'Export Data' file?");
      toast(n + " Amazon order line(s) loaded from " + file.name + " — now paste IDs and click Find.");
      if (missing.length) find();
    } catch (err) { toast("Could not read that file: " + err.message, true); }
  }
  function sheetRows(wb) { return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false }); }
  function pick(r, names) {
    var keys = Object.keys(r);
    for (var i = 0; i < names.length; i++) { var k = keys.filter(function (x) { return x.trim().toLowerCase() === names[i].toLowerCase(); })[0]; if (k && r[k] !== "") return String(r[k]); }
    return "";
  }

  /* ---------- 6. Update now (GitHub job) ---------- */
  async function getToken() {
    var t = "";
    try { if (mainDb()) { var d = await mainDb().collection("aikm_admin").doc("ghSync").get(); t = (d.exists && d.data().token) || ""; } } catch (e) {}
    if (!t) try { t = localStorage.getItem(TK) || ""; } catch (e) {}
    return String(t).replace(/^\s*bearer\s+/i, "").trim();
  }
  async function syncNow() {
    var tok = await getToken();
    if (!tok) { toast("GitHub token missing — click any 'Sync OMS now' button once to set it up, then try again.", true); return; }
    $("rfSyncBtn").disabled = true;
    try {
      var r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/dispatches", {
        method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }) });
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
      toast("Updating from OMS Guru — takes about 3–6 minutes. Reopen this tab after that.");
      setTimeout(function () { load(true); }, 6 * 60000);
    } catch (err) { toast("Could not start: " + err.message, true); }
    setTimeout(function () { $("rfSyncBtn").disabled = false; }, 60000);
  }
})();

/* ===== Loads the Loss Orders "Fix prices" panel (console/loss-tab.js). Keep this block. ===== */
(function () { try { if (document.getElementById("aikmLossJs")) return;
  function add(ref) { if (document.getElementById("aikmLossJs")) return; var s = document.createElement("script"); s.id = "aikmLossJs"; s.defer = true;
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/loss-tab.js"; document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/loss-tab.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();

/* ===== Loads the Firebase read saver (console/read-saver.js) — keeps order-entry saves from rewriting
   every piece. Keep this block when replacing refund-tab.js. ===== */
(function () { try { if (document.getElementById("aikmReadSaverJs")) return;
  function add(ref) { if (document.getElementById("aikmReadSaverJs")) return; var s = document.createElement("script"); s.id = "aikmReadSaverJs"; s.defer = true;
    s.src = "https://cdn.jsdelivr.net/gh/pransu49/oms-sync@" + ref + "/console/read-saver.js"; document.head.appendChild(s); }
  var done = false, t = setTimeout(function () { if (!done) { done = true; add("main"); } }, 4000);
  fetch("https://api.github.com/repos/pransu49/oms-sync/commits?path=console/read-saver.js&per_page=1")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (done) return; done = true; clearTimeout(t); add(j && j[0] && j[0].sha ? j[0].sha : "main"); })
    .catch(function () { if (!done) { done = true; clearTimeout(t); add("main"); } });
} catch (e) {} })();
