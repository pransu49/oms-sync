/* AIKM Admin Console — Failed Refunds tab.
   Loaded by the block at the end of refund-tab.js (no Shopify edit needed).
   Shows every refund line the Refund robot sent that Amazon REJECTED, with the reason in plain words
   and what to do, so it can be refunded by hand in Seller Central.
   Data (read ONCE per tab open / Refresh — about 4 reads):
     aikm-oms-sync  aikm_admin/refundLog         (robot results: status "error")
     aikm-oms-sync  aikm_admin/refundChecks      (Amazon Finance refund records -> hides already-refunded orders)
     aikm-oms-sync  aikm_admin/refundFailedDone  ("Mark refunded" ticks, 1 write each)
     main console   aikm_admin/refundUpload      (Amazon refund CSV uploads -> hides already-refunded orders)
   A failed line disappears by itself when: the robot later refunds the same item, Amazon's records show the
   order refunded, the order is in an uploaded refund CSV, or you click "Mark refunded". */
(function () {
  if (window.__aikmRefundFailed) return; window.__aikmRefundFailed = true;

  (function () { var st = document.createElement("style"); st.textContent = [
    "html#aikm body #subtab-rffail #ffRetry{background:var(--x-primary,#1f2a44) !important;color:var(--x-primary-ink,#fff) !important;border-color:var(--x-primary,#1f2a44) !important}",
    "html#aikm body #tab-rffail .ff-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
    "html#aikm body #tab-rffail .ff-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12.5px;font-weight:600;color:var(--x-text-2);cursor:pointer}",
    "html#aikm body #tab-rffail .ff-chip b{font-variant-numeric:tabular-nums}",
    "html#aikm body #tab-rffail .ff-chip.on{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line)}",
    "html#aikm body #tab-rffail .ff-sep{width:1px;height:22px;background:var(--x-line);margin:0 4px}",
    "html#aikm body #tab-rffail .ff-search{flex:1;min-width:220px;min-height:36px;padding:6px 12px;border-radius:10px}",
    "html#aikm body #tab-rffail .ff-card{border:1px solid var(--x-line);border-radius:12px;background:var(--x-surface);padding:14px 16px;margin-bottom:10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 16px}",
    "html#aikm body #tab-rffail .ff-card.done{opacity:.6}",
    "html#aikm body #tab-rffail .ff-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    "html#aikm body #tab-rffail .ff-oid{font:600 15px/1.2 ui-monospace,Menlo,Consolas,monospace;color:var(--x-text);cursor:pointer}",
    "html#aikm body #tab-rffail .ff-tag{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;background:var(--x-surface-2);color:var(--x-text-2);border:1px solid var(--x-line)}",
    "html#aikm body #tab-rffail .ff-tag.red{background:var(--x-red-soft);color:var(--x-red);border-color:transparent}",
    "html#aikm body #tab-rffail .ff-tag.amber{background:var(--x-amber-soft);color:var(--x-amber);border-color:transparent}",
    "html#aikm body #tab-rffail .ff-tag.green{background:var(--x-green-soft,rgba(46,160,90,.14));color:var(--x-green);border-color:transparent}",
    "html#aikm body #tab-rffail .ff-why{font-size:13.5px;font-weight:600;color:var(--x-text);margin-top:8px}",
    "html#aikm body #tab-rffail .ff-fix{font-size:12.5px;color:var(--x-text-2);margin-top:4px;line-height:1.55;padding:8px 11px;border-radius:9px;background:var(--x-surface-2)}",
    "html#aikm body #tab-rffail .ff-fix b{color:var(--x-text)}",
    "html#aikm body #tab-rffail .ff-muted{color:var(--x-muted);font-size:12px;margin-top:6px}",
    "html#aikm body #tab-rffail .ff-split{font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;color:var(--x-text-2);margin-top:6px}",
    "html#aikm body #tab-rffail .ff-split span{margin-right:14px;white-space:nowrap}",
    "html#aikm body #tab-rffail .ff-amt{font-size:18px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;color:var(--x-text)}",
    "html#aikm body #tab-rffail .ff-act{display:flex;flex-direction:column;gap:6px;align-items:stretch;min-width:170px}",
    "html#aikm body #tab-rffail .ff-act a,html#aikm body #tab-rffail .ff-act button{white-space:nowrap;justify-content:center;text-decoration:none}",
    "html#aikm body #tab-rffail .ff-empty{padding:26px;text-align:center;color:var(--x-muted);font-size:13.5px;border:1px dashed var(--x-line-2);border-radius:12px}",
    "html#aikm body #tab-rffail .ff-badge{display:inline-block;min-width:18px;padding:0 6px;margin-left:6px;border-radius:10px;background:var(--x-red);color:#fff;font-size:10.5px;font-weight:700;line-height:18px;text-align:center}",
    "@media (max-width:760px){html#aikm body #tab-rffail .ff-card{grid-template-columns:1fr}html#aikm body #tab-rffail .ff-act{flex-direction:row;flex-wrap:wrap}}",
  ].join(""); document.head.appendChild(st); })();

  var S = { log: [], checks: {}, upload: {}, done: {}, loaded: false, loading: null, k: "", acc: "", q: "", show: "open", shown: 40, at: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function when(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4500);
  }
  function short(a) { return /praso/i.test(a) ? "Praso" : /sasta/i.test(a) ? "Sasta Store" : a || "Amazon"; }

  /* ---------- reason in plain words + what to do ---------- */
  var KINDS = {
    tax: { label: "Tax / shipping tax", tag: "red",
      why: "Amazon did not accept the tax amounts the robot sent.",
      fix: "Open the order → <b>Refund order</b> → reason <b>Customer Return</b> → tick <b>Refund full amount</b> → <b>Submit</b>. Amazon fills the correct tax lines itself (including any small extra tax rows)." },
    price: { label: "Item price", tag: "red",
      why: "The item price sent is more than Amazon allows for this order.",
      fix: "Open the order → <b>Refund order</b> → look at <b>Prior refund</b>. If it is ₹0, tick <b>Refund full amount</b> → <b>Submit</b>. If money was already refunded, nothing more is due — click <b>Mark refunded</b> here." },
    data: { label: "Order details didn't match", tag: "amber",
      why: "Amazon could not match the order item (the order may have several items, or it was changed/cancelled).",
      fix: "Open the order and check its status. If it is still unpaid back, use <b>Refund order</b> → <b>Refund full amount</b> → <b>Submit</b>. If it was cancelled, the buyer was never charged — click <b>Mark refunded</b>." },
    send: { label: "Robot couldn't reach Amazon", tag: "amber",
      why: "The refund never reached Amazon (connection or access problem). No money moved.",
      fix: "Send it again from the <b>Bulk Refund</b> tab (<b>Refund now</b>), or refund it by hand: <b>Refund order</b> → <b>Refund full amount</b> → <b>Submit</b>." },
    promo: { label: "Has promotion", tag: "amber",
      why: "This order had a discount/promotion, so the robot leaves it to you.",
      fix: "Open the order → <b>Refund order</b> → tick <b>Refund full amount</b> → <b>Submit</b>. Amazon handles the promotion lines itself." },
    part: { label: "Partly refunded", tag: "amber",
      why: "Some money was already refunded on this order.",
      fix: "Open the order → <b>Refund order</b> → check <b>Prior refund</b> and refund only what is still due → <b>Submit</b>. If nothing is due, click <b>Mark refunded</b>." },
    other: { label: "Other", tag: "amber",
      why: "Amazon rejected this refund.",
      fix: "Open the order → <b>Refund order</b> → tick <b>Refund full amount</b> → <b>Submit</b>. Amazon's own message is shown below." },
  };
  function kindOf(e) {
    var m = String(e.msg || "");
    if (/tax or shipping tax/i.test(m)) return "tax";
    if (/item price is not eligible/i.test(m)) return "price";
    if (/promotion/i.test(m)) return "promo";
    if (/Partly refunded/i.test(m)) return "part";
    if (/incomplete or invalid|Bad order|not found on Amazon/i.test(m)) return "data";
    if (/Could not send|Could not read the order|feed (FATAL|CANCELLED|UNKNOWN)/i.test(m)) return "send";
    return "other";
  }
  function amazonMsg(m) { return String(m || "").replace(/\s*For help.*$/i, "").trim(); }
  function scUrl(o) { return "https://sellercentral.amazon.in/orders-v3/order/" + encodeURIComponent(o); }

  /* ---------- Firebase ---------- */
  var OMS_CFG = { apiKey: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk", authDomain: "aikm-oms-sync.firebaseapp.com", projectId: "aikm-oms-sync",
    storageBucket: "aikm-oms-sync.firebasestorage.app", messagingSenderId: "464184383750", appId: "1:464184383750:web:4fb422b90e519a87d76687" };
  var omsDb = null;
  function db() {
    if (omsDb) return omsDb;
    if (typeof firebase === "undefined" || !firebase.initializeApp || !firebase.firestore) return null;
    try { var app = (firebase.apps || []).filter(function (a) { return a.name === "omsSync" || (a.options && a.options.projectId === "aikm-oms-sync"); })[0] || firebase.initializeApp(OMS_CFG, "omsSync"); omsDb = app.firestore(); } catch (e) { return null; }
    return omsDb;
  }
  function mainDb() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }
  function timed(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]); }
  function get(d, ref) { return timed(ref.get(), 15000).catch(function () { try { d.enableNetwork(); } catch (e) {} return timed(ref.get(), 25000); }); }

  function load(force) {
    if (S.loaded && !force) return Promise.resolve();
    if (S.loading) return S.loading;
    S.loading = new Promise(function (res) {
      var w = setInterval(function () {
        if (!db()) return; clearInterval(w);
        var a = db().collection("aikm_admin");
        var jobs = [
          get(db(), a.doc("refundLog")).then(function (d) { S.log = (d.exists && d.data().entries) || []; }),
          get(db(), a.doc("refundChecks")).then(function (d) { S.checks = (d.exists && d.data().orders) || {}; }).catch(function () {}),
          get(db(), a.doc("refundFailedDone")).then(function (d) { S.done = (d.exists && d.data().m) || {}; }).catch(function () {}),
          mainDb() ? get(mainDb(), mainDb().collection("aikm_admin").doc("refundUpload")).then(function (d) {
            var up = {}, x = (d.exists && d.data().accts) || {};
            Object.keys(x).forEach(function (k) { Object.assign(up, (x[k] || {}).orders || {}); }); S.upload = up;
          }).catch(function () {}) : Promise.resolve(),
        ];
        Promise.all(jobs).then(function () { S.loaded = true; S.at = new Date(); })
          .catch(function () { toast("Could not read refund results — check internet, then click Refresh.", true); })
          .then(function () { S.loading = null; render(); res(); });
      }, 300);
    });
    return S.loading;
  }

  /* ---------- build the list ---------- */
  function rows() {
    var log = (S.log || []).filter(function (e) { return e && !e.probe && e.i; });
    var latest = {}, failed = {};
    log.forEach(function (e) { // log is newest first
      if (!latest[e.i]) latest[e.i] = e;
      if (e.status === "error" && !failed[e.i]) failed[e.i] = e;
    });
    var out = [];
    Object.keys(failed).forEach(function (i) {
      var e = failed[i], last = latest[i];
      var r = Object.assign({}, last.status === "error" ? last : e); r.k = kindOf(r);
      if (last.status === "done") r.fixed = "Refunded by the robot " + when(last.at);
      else if (last.status === "skipped") r.fixed = last.msg.replace(/ - .*$/, "");
      else if (S.checks[e.o]) r.fixed = "Amazon shows ₹" + S.checks[e.o].r + " refunded" + (S.checks[e.o].at ? " on " + S.checks[e.o].at : "");
      else if (S.upload[e.o]) r.fixed = "In Amazon refund file" + (S.upload[e.o][0] ? " (" + S.upload[e.o][0] + ")" : "");
      else if (S.done[e.i]) r.fixed = "Marked refunded " + when(S.done[e.i].at);
      out.push(r);
    });
    return out.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  var RETRY = { tax: 1, price: 1, data: 1, send: 1, other: 1 }, ROBOT = { "SASTA STORE": 1, "PRASO ENTERPRISES": 1 };
  function retryable() { return rows().filter(function (r) { return !r.fixed && RETRY[r.k] && ROBOT[r.a]; }); }
  async function getToken() {
    var t = "";
    try { if (mainDb()) { var d = await mainDb().collection("aikm_admin").doc("ghSync").get(); t = (d.exists && d.data().token) || ""; } } catch (e) {}
    if (!t) try { t = localStorage.getItem("aikm_gh_sync_token") || ""; } catch (e) {}
    return String(t).replace(/^\s*bearer\s+/i, "").trim();
  }
  async function retry() {
    var list = retryable(); if (!list.length) { toast("Nothing the robot can send again.", true); return; }
    var amt = list.reduce(function (s, r) { return s + Number(r.amt || 0); }, 0), orders = {}; list.forEach(function (r) { orders[r.o] = 1; });
    if (!confirm("SEND AGAIN WITH AMAZON'S AMOUNTS\n\n" + Object.keys(orders).length + " order(s) · " + list.length + " line(s) · up to " + inr(amt) +
      "\n\nThe robot first reads each order's exact item / tax / shipping / shipping-tax from Amazon, skips cancelled and already-refunded orders, then refunds the rest in FULL.\nMoney goes back to customers and cannot be undone.\n\nGo ahead?")) return;
    var payload = list.map(function (r) { return { a: r.a, o: r.o, i: r.i, r: r.r || "CustomerReturn", ip: r.ip || 0, it: r.it || 0, sp: r.sp || 0, stx: r.stx || 0, full: 1 }; });
    var tok = await getToken();
    if (!tok) { toast("GitHub token missing — click any 'Sync OMS now' button once to set it up, then try again.", true); return; }
    $("ffRetry").disabled = true;
    try {
      var res = await fetch("https://api.github.com/repos/pransu49/oms-sync/actions/workflows/refund-robot.yml/dispatches", {
        method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { lines: JSON.stringify(payload), requested_by: "failed-tab" } }) });
      if (res.status !== 204) throw new Error("GitHub said " + res.status);
      toast("Robot started — about 2–4 min per 50 orders. Click Refresh later to see results.");
    } catch (err) { toast("Could not start the robot: " + err.message, true); }
    setTimeout(function () { if ($("ffRetry")) $("ffRetry").disabled = false; }, 60000);
  }
  function filtered(all) {
    var q = S.q.trim().toLowerCase();
    return all.filter(function (r) {
      if (S.show === "open" ? r.fixed : !r.fixed) return false;
      if (S.k && r.k !== S.k) return false;
      if (S.acc && short(r.a) !== S.acc) return false;
      if (q && (r.o + " " + r.i + " " + r.a + " " + r.msg).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- page ---------- */
  function kpi(id, label, subId) {
    return '<div class="cx-kpi"><div class="cx-kpi-label">' + label + '</div><div class="cx-kpi-num" id="' + id + '">–</div><div class="cx-kpi-sub" id="' + subId + '">&nbsp;</div></div>';
  }
  function mount() {
    var bar = $("mainTabbar"), content = document.querySelector(".app-content");
    if (!bar || !content || $("tab-rffail")) return;
    var b = document.createElement("button");
    b.className = "tabbtn"; b.dataset.tab = "rffail";
    b.innerHTML = '<i class="ti ti-receipt-off tab-ic"></i>Failed Refunds<span class="ff-badge" id="ffBadge" style="display:none"></span>';
    var after = bar.querySelector('[data-tab="refund"]') || bar.querySelector('[data-tab="easyship"]');
    after ? after.insertAdjacentElement("afterend", b) : bar.appendChild(b);

    var sub = document.createElement("div");
    sub.className = "subtabbar no-print"; sub.id = "subtab-rffail"; sub.style.display = "none";
    sub.innerHTML = '<span class="subtab-label">Failed Refunds</span><span class="ff-muted" id="ffAt" style="margin:0">Refunds Amazon rejected — do these by hand in Seller Central</span><span style="flex:1"></span>' +
      '<button type="button" class="subbtn rf-btn-main" id="ffRetry" title="Robot re-sends these with Amazon\'s exact amounts"><i class="ti ti-send"></i> Send again <b id="ffRetryN"></b></button>' +
      '<button type="button" class="subbtn" id="ffCsv" title="Download this list (Excel / CSV)"><i class="ti ti-download"></i> Download list</button>' +
      '<button type="button" class="subbtn" id="ffRefresh"><i class="ti ti-refresh"></i> Refresh</button>';
    content.insertBefore(sub, content.firstChild);

    var p = document.createElement("div");
    p.id = "tab-rffail"; p.className = "tabpanel";
    p.innerHTML =
      '<div class="cx-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr)) !important;">' +
        kpi("ffKOpen", "To refund by hand", "ffKOpenSub") + kpi("ffKAmt", "Amount pending", "ffKAmtSub") +
        kpi("ffKTop", "Main reason", "ffKTopSub") + kpi("ffKFixed", "Already sorted", "ffKFixedSub") +
      "</div>" +
      '<div class="panel"><div class="ff-chips" id="ffChips"></div></div>' +
      '<div id="ffList"><div class="ff-empty">Loading…</div></div>';
    content.appendChild(p);

    b.addEventListener("click", function () {
      document.querySelectorAll(".tabbtn").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".tabpanel").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".subtabbar").forEach(function (x) { x.style.display = "none"; });
      b.classList.add("active"); p.classList.add("active"); sub.style.display = "flex";
      try { document.body.classList.remove("sidebar-open"); $("appSidebarBackdrop").classList.remove("show"); } catch (e) {}
      load(false);
    });
    $("ffRefresh").addEventListener("click", function () { $("ffList").innerHTML = '<div class="ff-empty">Loading…</div>'; load(true); });
    $("ffCsv").addEventListener("click", csv);
    $("ffRetry").addEventListener("click", retry);
    p.addEventListener("input", function (e) { if (e.target.id === "ffQ") { S.q = e.target.value; S.shown = 40; renderList(); } });
    p.addEventListener("click", function (e) {
      var c = e.target.closest("[data-ff-f]");
      if (c) { var f = c.dataset.ffF.split(":"); S[f[0]] = (S[f[0]] === f[1] && f[0] !== "show") ? "" : f[1]; S.shown = 40; render(); return; }
      var cp = e.target.closest("[data-ff-copy]"); if (cp) { try { navigator.clipboard.writeText(cp.dataset.ffCopy); toast("Copied " + cp.dataset.ffCopy); } catch (er) {} return; }
      var mk = e.target.closest("[data-ff-done]"); if (mk) { mark(mk.dataset.ffDone, mk.dataset.ffO, mk.dataset.how !== "undo"); return; }
      if (e.target.closest("#ffMore")) { S.shown += 40; renderList(); }
    });
    // badge: count failures quietly once the console is ready (same 4 reads as opening the tab, once per page load)
    setTimeout(function () { load(false); }, 6000);
  }

  function mark(i, o, on) {
    if (!db()) { toast("Not connected — try again in a moment.", true); return; }
    var m = {};
    if (on) { m[i] = { at: new Date().toISOString(), o: o, by: "console" }; S.done[i] = m[i]; }
    else { m[i] = firebase.firestore.FieldValue.delete(); delete S.done[i]; }
    render();
    db().collection("aikm_admin").doc("refundFailedDone").set({ m: m }, { merge: true })
      .then(function () { toast(on ? "Marked refunded — " + o : "Moved back to the list — " + o); })
      .catch(function (e) { toast("Not saved: " + e.message, true); });
  }

  /* ---------- render ---------- */
  function render() { renderTop(); renderList(); }
  function renderTop() {
    if (!$("ffChips")) return;
    var all = rows(), open = all.filter(function (r) { return !r.fixed; }), fixed = all.length - open.length;
    var amt = open.reduce(function (s, r) { return s + Number(r.amt || 0); }, 0);
    var byK = {}; open.forEach(function (r) { byK[r.k] = (byK[r.k] || 0) + 1; });
    var top = Object.keys(byK).sort(function (a, b) { return byK[b] - byK[a]; })[0];
    var orders = {}; open.forEach(function (r) { orders[r.o] = 1; });
    $("ffKOpen").textContent = S.loaded ? open.length : "–";
    $("ffKOpenSub").textContent = S.loaded ? Object.keys(orders).length + " order(s)" : "";
    $("ffKAmt").textContent = S.loaded ? inr(amt) : "–";
    $("ffKAmtSub").textContent = S.loaded ? "as sent by the robot" : "";
    $("ffKTop").textContent = top ? KINDS[top].label : (S.loaded ? "None" : "–");
    $("ffKTopSub").textContent = top ? byK[top] + " of " + open.length : "";
    $("ffKFixed").textContent = S.loaded ? fixed : "–";
    $("ffKFixedSub").textContent = S.loaded ? "refunded later / marked" : "";
    if ($("ffAt") && S.at) $("ffAt").textContent = "Refunds Amazon rejected — do these by hand in Seller Central · updated " + when(S.at);
    var rn = retryable().length; if ($("ffRetryN")) { $("ffRetryN").textContent = rn ? "(" + rn + ")" : ""; $("ffRetry").style.display = rn ? "" : "none"; }
    var bd = $("ffBadge"); if (bd) { bd.textContent = open.length; bd.style.display = open.length ? "inline-block" : "none"; }

    var base = all.filter(function (r) { return S.show === "open" ? !r.fixed : !!r.fixed; });
    function n(fn) { return base.filter(fn).length; }
    var c = [["show:open", "To do", open.length], ["show:fixed", "Sorted", fixed], "|"]
      .concat(Object.keys(KINDS).filter(function (k) { return all.some(function (r) { return r.k === k; }); })
        .map(function (k) { return ["k:" + k, KINDS[k].label, n(function (r) { return r.k === k; })]; }))
      .concat(["|", ["acc:Sasta Store", "Sasta Store", n(function (r) { return short(r.a) === "Sasta Store"; })], ["acc:Praso", "Praso", n(function (r) { return short(r.a) === "Praso"; })]]);
    var q = $("ffQ") ? $("ffQ").value : S.q;
    $("ffChips").innerHTML = c.map(function (x) {
      if (x === "|") return '<span class="ff-sep"></span>';
      var f = x[0].split(":"), on = S[f[0]] === f[1];
      return '<span class="ff-chip' + (on ? " on" : "") + '" data-ff-f="' + esc(x[0]) + '">' + esc(x[1]) + " <b>" + x[2] + "</b></span>";
    }).join("") + '<input type="text" class="ff-search" id="ffQ" placeholder="Search order ID…" value="' + esc(q) + '">';
  }
  function card(r) {
    var K = KINDS[r.k];
    var split = (r.ip != null) ? '<div class="ff-split">Robot sent: <span>Item ' + inr(r.ip) + '</span><span>Tax ' + inr(r.it) + '</span><span>Ship ' + inr(r.sp) + '</span><span>Ship tax ' + inr(r.stx) + "</span></div>" : "";
    return '<div class="ff-card' + (r.fixed ? " done" : "") + '"><div>' +
      '<div class="ff-top"><span class="ff-oid" data-ff-copy="' + esc(r.o) + '" title="Click to copy">' + esc(r.o) + "</span>" +
        '<span class="ff-tag">' + esc(short(r.a)) + "</span>" +
        '<span class="ff-tag ' + K.tag + '">' + esc(K.label) + "</span>" +
        (r.fixed ? '<span class="ff-tag green">✓ ' + esc(r.fixed) + "</span>" : "") + "</div>" +
      '<div class="ff-why">' + esc(K.why) + "</div>" +
      (r.fixed ? "" : '<div class="ff-fix"><b>How to refund:</b> ' + K.fix + "</div>") +
      split +
      '<div class="ff-muted">Amazon said: “' + esc(amazonMsg(r.msg)) + "”" + (r.feedId ? " · feed " + esc(r.feedId) : "") + "</div>" +
      '<div class="ff-muted">Item ID ' + esc(r.i) + " · failed " + esc(when(r.at)) + "</div>" +
    "</div>" +
    '<div class="ff-act"><div class="ff-amt">' + inr(r.amt) + "</div>" +
      '<a class="btn-gold" href="' + scUrl(r.o) + '" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Open in Seller Central</a>' +
      (r.fixed && S.done[r.i] ? '<button type="button" class="secondary" data-ff-done="' + esc(r.i) + '" data-ff-o="' + esc(r.o) + '" data-how="undo"><i class="ti ti-arrow-back-up"></i> Undo</button>' :
        r.fixed ? "" : '<button type="button" class="secondary" data-ff-done="' + esc(r.i) + '" data-ff-o="' + esc(r.o) + '"><i class="ti ti-check"></i> Mark refunded</button>') +
    "</div></div>";
  }
  function renderList() {
    if (!$("ffList")) return;
    if (!S.loaded) { $("ffList").innerHTML = '<div class="ff-empty">Loading…</div>'; return; }
    var list = filtered(rows());
    if (!list.length) {
      $("ffList").innerHTML = '<div class="ff-empty">' + (S.show === "open" ? "🎉 No failed refunds pending. Everything the robot sent has gone through, or has been sorted." : "Nothing sorted yet.") + "</div>";
      return;
    }
    $("ffList").innerHTML = list.slice(0, S.shown).map(card).join("") +
      (list.length > S.shown ? '<div style="text-align:center;margin:12px 0"><button type="button" class="secondary" id="ffMore">Show more (' + (list.length - S.shown) + " left)</button></div>" : "");
  }

  function csv() {
    var list = filtered(rows());
    if (!list.length) { toast("Nothing to download.", true); return; }
    var head = ["Account", "Order ID", "Order Item ID", "Amount sent", "Item", "Tax", "Shipping", "Shipping tax", "Reason", "What to do", "Amazon message", "Failed on", "Status"];
    var strip = function (h) { return String(h || "").replace(/<[^>]+>/g, ""); };
    var lines = [head].concat(list.map(function (r) {
      return [r.a, r.o, "'" + r.i, r.amt, r.ip, r.it, r.sp, r.stx, KINDS[r.k].label, strip(KINDS[r.k].fix), amazonMsg(r.msg), when(r.at), r.fixed || "To refund"];
    })).map(function (row) { return row.map(function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "Failed_Refunds_" + new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  var tries = 0, iv = setInterval(function () { mount(); if ($("tab-rffail") || ++tries > 120) clearInterval(iv); }, 500);
})();
