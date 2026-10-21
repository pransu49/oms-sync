/* AIKM Admin Console — RTO Check tab.
   Loaded by refund-tab.js (no Shopify edit needed).
   Data: aikm-oms-sync  aikm_admin/rtoIndex  (built every 3 h by rto-sync.yml from Amazon returns/orders
         reports for Praso + Sasta Store, and NimbusPost RTOs). Read ONCE when the tab is opened.
   Received / linked return IDs: main console Firebase  aikm_admin/rtoReceived  (listened only while open).
   Amazon never shares the new ATS return ID (515…): search by anything on the label, then "Link" it once. */
(function () {
  if (window.__aikmRto) return; window.__aikmRto = true;
  var REPO = "pransu49/oms-sync", WF = "rto-sync.yml", TK = "aikm_gh_sync_token", PAGE = 40;

  (function () { var st = document.createElement("style"); st.textContent = [
    "html#aikm body #tab-rto .rt-search{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
    "html#aikm body #tab-rto .rt-search input{flex:1;min-width:260px;min-height:46px;font-size:16px;padding:10px 14px;border-radius:12px}",
    "html#aikm body #tab-rto .rt-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}",
    "html#aikm body #tab-rto .rt-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12.5px;font-weight:600;color:var(--x-text-2);cursor:pointer}",
    "html#aikm body #tab-rto .rt-chip b{font-variant-numeric:tabular-nums}",
    "html#aikm body #tab-rto .rt-chip.on{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line)}",
    "html#aikm body #tab-rto .rt-sep{width:1px;background:var(--x-line);margin:0 4px}",
    "html#aikm body #tab-rto .rt-note{margin-top:12px;padding:11px 14px;border-radius:10px;font-size:13px;line-height:1.55;background:var(--x-amber-soft);color:var(--x-amber)}",
    "html#aikm body #tab-rto .rt-note b{color:inherit}",
    "html#aikm body #tab-rto .rt-card{border:1px solid var(--x-line);border-radius:12px;background:var(--x-surface);padding:14px 16px;margin-bottom:10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 16px}",
    "html#aikm body #tab-rto .rt-card.got{opacity:.72}",
    "html#aikm body #tab-rto .rt-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    "html#aikm body #tab-rto .rt-oid{font:600 15px/1.2 ui-monospace,Menlo,Consolas,monospace;color:var(--x-text);cursor:pointer}",
    "html#aikm body #tab-rto .rt-tag{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;background:var(--x-surface-2);color:var(--x-text-2);border:1px solid var(--x-line)}",
    "html#aikm body #tab-rto .rt-tag.way{background:var(--x-amber-soft);color:var(--x-amber);border-color:transparent}",
    "html#aikm body #tab-rto .rt-tag.back{background:var(--x-green-soft,rgba(46,160,90,.14));color:var(--x-green);border-color:transparent}",
    "html#aikm body #tab-rto .rt-tag.cust{background:var(--x-red-soft);color:var(--x-red);border-color:transparent}",
    "html#aikm body #tab-rto .rt-tag.gold{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line)}",
    "html#aikm body #tab-rto .rt-line{font-size:13px;color:var(--x-text-2);margin-top:6px;line-height:1.5}",
    "html#aikm body #tab-rto .rt-line b{color:var(--x-text);font-weight:600}",
    "html#aikm body #tab-rto .rt-muted{color:var(--x-muted);font-size:12px}",
    "html#aikm body #tab-rto .rt-ids{font:12.5px/1.6 ui-monospace,Menlo,Consolas,monospace;color:var(--x-text-2);margin-top:6px}",
    "html#aikm body #tab-rto .rt-ids span{margin-right:14px;white-space:nowrap}",
    "html#aikm body #tab-rto mark{background:var(--x-gold-soft);color:var(--x-gold);border-radius:4px;padding:0 3px}",
    "html#aikm body #tab-rto .rt-ids mark{background:var(--x-gold-soft);color:var(--x-gold);border-radius:4px;padding:0 3px}",
    "html#aikm body #tab-rto .rt-act{display:flex;flex-direction:column;gap:6px;align-items:stretch;min-width:150px}",
    "html#aikm body #tab-rto .rt-act button{white-space:nowrap}",
    "html#aikm body #tab-rto .rt-money{font-size:13px;margin-top:6px}",
    "html#aikm body #tab-rto .rt-empty{padding:22px;text-align:center;color:var(--x-muted);font-size:13.5px;border:1px dashed var(--x-line-2);border-radius:12px}",
    "@media (max-width:760px){html#aikm body #tab-rto .rt-card{grid-template-columns:1fr}html#aikm body #tab-rto .rt-act{flex-direction:row;flex-wrap:wrap}}",
  ].join(""); document.head.appendChild(st); })();

  var S = { rows: [], at: null, errors: [], loaded: false, loading: null, q: "", k: "rto", s: "", acc: "", shown: PAGE, rec: {}, unsub: null, pend: "" };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function inr(n) { return n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"; }
  function dd(s) { if (!s) return ""; var d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? s : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
  function today() { var d = new Date(Date.now() + 5.5 * 36e5); return d.toISOString().slice(0, 10); }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4500);
  }
  function short(acc) { return /praso/i.test(acc) ? "Praso" : /sasta/i.test(acc) ? "Sasta Store" : acc || "Self-ship"; }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }

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
  function load(force) {
    if (S.loaded && !force) return Promise.resolve();
    if (S.loading) return S.loading;
    S.loading = new Promise(function (res) {
      var w = setInterval(function () {
        if (!db()) return; clearInterval(w);
        var ref = db().collection("aikm_admin").doc("rtoIndex");
        timed(ref.get(), 12000).catch(function () { try { db().enableNetwork(); } catch (e) {} return timed(ref.get(), 25000); })
          .then(function (d) {
            var x = d.exists ? d.data() : {};
            try { S.rows = JSON.parse(x.rows || "[]"); } catch (e) { S.rows = []; }
            S.at = x.at || null; S.errors = x.errors || []; S.loaded = true;
            S.rows.forEach(function (r) { r._t = text(r); });
          })
          .catch(function () { toast("Could not read RTO data — check internet, then click the tab again.", true); })
          .then(function () { S.loading = null; render(); res(); });
      }, 300);
    });
    return S.loading;
  }
  function listen() {
    if (S.unsub || !mainDb()) return;
    S.unsub = mainDb().collection("aikm_admin").doc("rtoReceived").onSnapshot(function (d) { S.rec = (d.exists && d.data().m) || {}; render(); }, function () {});
  }
  function stop() { if (S.unsub) { S.unsub(); S.unsub = null; } }
  function save(orderId, patch) {
    if (!mainDb()) { toast("Not connected — try again in a moment.", true); return; }
    var m = {}; m[orderId] = Object.assign({}, S.rec[orderId] || {}, patch, { by: "console", at: new Date().toISOString() });
    S.rec[orderId] = m[orderId]; render();
    mainDb().collection("aikm_admin").doc("rtoReceived").set({ m: m }, { merge: true }).catch(function (e) { toast("Not saved: " + e.message, true); });
  }

  /* ---------- search ---------- */
  function text(r) {
    return [r.o, r.a, r.a2, r.ra, r.n, r.ci, r.st, r.pin, r.inv, short(r.acc)].concat((r.items || []).map(function (i) { return i.t + " " + i.sku + " " + i.asin; })).join(" ").toLowerCase();
  }
  function matches(r, q) {
    if (!q) return true;
    var rec = S.rec[r.o] || {}, hay = r._t + " " + (rec.id || "").toLowerCase();
    var dq = digits(q);
    if (dq.length >= 8 && hay.replace(/[^0-9 ]/g, " ").indexOf(dq) >= 0) return true;
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function isId(q) { var d = digits(q); return d.length >= 10 && d.length === q.replace(/[\s-]/g, "").length; }
  function list(ignoreChips) {
    var q = S.q.trim();
    return S.rows.filter(function (r) {
      if (!ignoreChips) {
        if (S.k && r.k !== S.k) return false;
        if (S.s === "got" ? !(S.rec[r.o] || {}).r : S.s && (r.s !== S.s || (S.s === "back" && (S.rec[r.o] || {}).r))) return false;
        if (S.acc && short(r.acc) !== S.acc) return false;
      }
      return matches(r, q);
    });
  }

  /* ---------- page ---------- */
  function mount() {
    var bar = $("mainTabbar"), content = document.querySelector(".app-content");
    if (!bar || !content || $("tab-rto")) return;
    var b = document.createElement("button");
    b.className = "tabbtn"; b.dataset.tab = "rto";
    b.innerHTML = '<i class="ti ti-truck-return tab-ic"></i>RTO Check';
    var after = bar.querySelector('[data-tab="refund"]') || bar.querySelector('[data-tab="easyship"]') || bar.querySelector('[data-tab="selfship"]');
    after ? after.insertAdjacentElement("afterend", b) : bar.appendChild(b);

    var sub = document.createElement("div");
    sub.className = "subtabbar no-print"; sub.id = "subtab-rto"; sub.style.display = "none";
    sub.innerHTML = '<span class="subtab-label">RTO Check</span><span class="rt-muted" id="rtSyncLine">Praso + Sasta Store · Amazon + NimbusPost · last 60 days</span><span style="flex:1"></span>' +
      '<button type="button" class="subbtn" id="rtSyncBtn" title="Pull the latest returns from Amazon now (about 3–5 minutes)"><i class="ti ti-refresh"></i> Update now</button>';
    content.insertBefore(sub, content.firstChild);

    var p = document.createElement("div");
    p.id = "tab-rto"; p.className = "tabpanel";
    p.innerHTML =
      '<div class="panel"><div class="rt-search">' +
        '<input type="text" id="rtQ" autocomplete="off" placeholder="Scan or type anything from the RTO parcel — return ID, AWB, order ID, customer, PIN, city or product">' +
        '<button type="button" class="secondary" id="rtClear"><i class="ti ti-x"></i> Clear</button></div>' +
        '<div class="rt-chips" id="rtChips"></div><div id="rtNote"></div></div>' +
      '<div id="rtList"><div class="rt-empty">Loading…</div></div>';
    content.appendChild(p);

    b.addEventListener("click", function () {
      document.querySelectorAll(".tabbtn").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".tabpanel").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".subtabbar").forEach(function (x) { x.style.display = "none"; });
      b.classList.add("active"); p.classList.add("active"); sub.style.display = "flex";
      try { document.body.classList.remove("sidebar-open"); $("appSidebarBackdrop").classList.remove("show"); } catch (e) {}
      load(false); var w = setInterval(function () { if (mainDb()) { clearInterval(w); listen(); } }, 500);
      setTimeout(function () { try { $("rtQ").focus(); } catch (e) {} }, 60);
    });
    document.addEventListener("click", function (e) { var t = e.target.closest(".tabbtn[data-tab]"); if (t && t.dataset.tab !== "rto") stop(); });

    var deb; $("rtQ").addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () { S.q = $("rtQ").value; S.shown = PAGE; render(); }, 150); });
    $("rtQ").addEventListener("keydown", function (e) { if (e.key === "Enter") { S.q = $("rtQ").value; S.shown = PAGE; render(); } });
    $("rtClear").addEventListener("click", function () { $("rtQ").value = ""; S.q = ""; S.pend = ""; S.shown = PAGE; render(); $("rtQ").focus(); });
    $("rtSyncBtn").addEventListener("click", syncNow);
    p.addEventListener("click", function (e) {
      var c = e.target.closest("[data-rt-f]");
      if (c) { var f = c.dataset.rtF.split(":"); S[f[0]] = S[f[0]] === f[1] && f[0] !== "k" ? "" : f[1]; S.shown = PAGE; render(); return; }
      var cp = e.target.closest("[data-rt-copy]"); if (cp) { try { navigator.clipboard.writeText(cp.dataset.rtCopy); toast("Copied " + cp.dataset.rtCopy); } catch (er) {} return; }
      var got = e.target.closest("[data-rt-got]"); if (got) { var id = got.dataset.rtGot, cur = S.rec[id] || {}; save(id, { r: cur.r ? "" : today() }); toast(cur.r ? "Marked as not received" : "Marked received ✓"); return; }
      var ln = e.target.closest("[data-rt-link]"); if (ln) { var q = S.pend; save(ln.dataset.rtLink, { id: q, r: (S.rec[ln.dataset.rtLink] || {}).r || today() }); S.pend = ""; $("rtQ").value = q; S.q = q; render(); toast("Linked " + q + " to " + ln.dataset.rtLink + " and marked received ✓"); return; }
      var cx = e.target.closest("#rtCancelLink"); if (cx) { S.pend = ""; render(); return; }
      var more = e.target.closest("#rtMore"); if (more) { S.shown += PAGE; render(); }
    });
  }

  /* ---------- render ---------- */
  function chipsHtml() {
    var base = S.rows.filter(function (r) { return (!S.acc || short(r.acc) === S.acc) && matches(r, S.q.trim()); });
    function n(fn) { return base.filter(fn).length.toLocaleString("en-IN"); }
    var inK = function (r) { return r.k === S.k; };
    var c = [
      ["k:rto", "RTO (undelivered)", n(function (r) { return r.k === "rto"; })],
      ["k:cust", "Customer returns", n(function (r) { return r.k === "cust"; })],
      "|",
      ["s:way", "On the way back", n(function (r) { return inK(r) && r.s === "way" && !(S.rec[r.o] || {}).r; })],
      ["s:back", "Amazon says returned", n(function (r) { return inK(r) && r.s === "back" && !(S.rec[r.o] || {}).r; })],
      ["s:got", "Received by me", n(function (r) { return inK(r) && (S.rec[r.o] || {}).r; })],
      "|",
      ["acc:Praso", "Praso", ""], ["acc:Sasta Store", "Sasta Store", ""],
    ];
    return c.map(function (x) {
      if (x === "|") return '<span class="rt-sep"></span>';
      var f = x[0].split(":"), on = S[f[0]] === f[1];
      return '<span class="rt-chip' + (on ? " on" : "") + '" data-rt-f="' + esc(x[0]) + '">' + esc(x[1]) + (x[2] !== "" ? " <b>" + x[2] + "</b>" : "") + "</span>";
    }).join("");
  }
  function card(r, q) {
    var rec = S.rec[r.o] || {}, got = !!rec.r, dq = digits(q);
    function hl(v) { v = String(v || ""); return dq.length >= 6 && v.indexOf(dq) >= 0 ? "<mark>" + esc(v) + "</mark>" : esc(v); }
    var st = got ? ['back', "Received " + dd(rec.r)] : r.s === "back" ? ["back", "Returned to you " + dd(r.rd || r.nd)] : ["way", "On the way back" + (r.rq ? " · since " + dd(r.rq) : "")];
    var items = (r.items && r.items.length ? r.items : []).map(function (i) { return "<b>" + esc(i.t || i.sku) + "</b> × " + (i.q || 1); }).join("<br>");
    var cod = /cod/i.test(r.pay || "");
    var selfShip = !!r.nb || r.src === "nimbus";
    var money = r.ref ? '<span class="rt-tag gold">Refunded to buyer ' + inr(r.ref) + "</span>" :
      cod ? '<span class="rt-muted">COD — no money was collected, nothing to refund</span>' :
      !r.pay ? "" : selfShip ? '<span class="rt-tag cust">Prepaid — refund it from the Bulk Refund tab</span>' :
      '<span class="rt-muted">Prepaid — Amazon refunds the buyer itself (Easy Ship)</span>';
    return '<div class="rt-card' + (got ? " got" : "") + '"><div>' +
      '<div class="rt-top"><span class="rt-oid" data-rt-copy="' + esc(r.o) + '" title="Click to copy">' + hl(r.o) + "</span>" +
        '<span class="rt-tag">' + esc(short(r.acc)) + (r.es ? " · Easy Ship" : r.src === "nimbus" || r.nb ? " · Self-ship" : "") + "</span>" +
        '<span class="rt-tag ' + st[0] + '">' + esc(st[1]) + "</span>" +
        (r.k === "cust" ? '<span class="rt-tag cust">Customer return' + (r.rs ? " · " + esc(r.rs) : "") + "</span>" : "") + "</div>" +
      '<div class="rt-line">' + (items || '<span class="rt-muted">Product not known</span>') + "</div>" +
      '<div class="rt-line"><b>' + esc(r.n || "Customer") + "</b> · " + esc([r.ci, r.st].filter(Boolean).join(", ")) + (r.pin ? " · " + hl(r.pin) : "") + "</div>" +
      '<div class="rt-line rt-muted">Ordered ' + (dd(r.d || r.cr) || "—") + (r.rq ? " · Return started " + dd(r.rq) : "") + ((r.rd || r.nd) ? " · Back to you " + dd(r.rd || r.nd) : "") +
        (r.v ? " · " + inr(r.v) : "") + (r.pay ? " · " + esc(/cod/i.test(r.pay) ? "COD" : "Prepaid") : "") + (r.inv ? " · Invoice " + esc(r.inv) : "") + (r.sf ? " · SAFE-T: " + esc(r.sf) : "") + "</div>" +
      '<div class="rt-ids"><span>AWB ' + hl(r.a || "—") + "</span>" + (r.a2 ? "<span>AWB " + hl(r.a2) + "</span>" : "") +
        (r.ra ? "<span>Return ID " + hl(r.ra) + "</span>" : "") + (rec.id ? "<span>Return ID " + hl(rec.id) + " ✓</span>" : "") + "</div>" +
      (money ? '<div class="rt-money">' + money + "</div>" : "") +
    '</div><div class="rt-act">' +
      (S.pend && (r._t + " " + (rec.id || "")).indexOf(S.pend) < 0 ? '<button type="button" class="btn-gold" data-rt-link="' + esc(r.o) + '"><i class="ti ti-link"></i> This is the parcel</button>' : "") +
      '<button type="button" class="' + (got ? "secondary" : "btn-gold") + '" data-rt-got="' + esc(r.o) + '"><i class="ti ' + (got ? "ti-arrow-back-up" : "ti-check") + '"></i> ' + (got ? "Undo received" : "Mark received") + "</button>" +
    "</div></div>";
  }
  function render() {
    if (!$("tab-rto")) return;
    if (S.at && S.at.toDate) {
      var m = Math.round((Date.now() - S.at.toDate().getTime()) / 60000);
      $("rtSyncLine").textContent = "Updated " + (m < 1 ? "just now" : m < 120 ? m + " min ago" : Math.round(m / 60) + " h ago") + " · Praso + Sasta Store · Amazon + NimbusPost · last 60 days" + (S.errors.length ? " · ⚠ " + S.errors.length + " account error" : "");
    }
    $("rtChips").innerHTML = chipsHtml();
    if (!S.loaded) return;
    var q = S.q.trim(), rows = list(false), note = "";
    if (q && !rows.length) {
      var any = list(true);
      if (any.length) { S.k = any[0].k; S.s = ""; S.acc = ""; rows = list(false); $("rtChips").innerHTML = chipsHtml(); }
    }
    if (q && isId(q) && !rows.length) S.pend = digits(q);
    if (S.pend && S.pend === digits(q)) note = '<div class="rt-note"><b>' + esc(S.pend) + '</b> is not known yet — Amazon does not share the new return ID.<br>Now type the <b>PIN, city, customer name or product</b> from the label, then press <b>“This is the parcel”</b> on the right order. Next time this ID is found instantly.</div>';
    else if (S.pend) note = '<div class="rt-note">Finding the order for return ID <b>' + esc(S.pend) + '</b> — press <b>“This is the parcel”</b> on the right order. <button type="button" class="mini-link" id="rtCancelLink">Cancel</button></div>';
    $("rtNote").innerHTML = note;
    if (!S.rows.length) { $("rtList").innerHTML = '<div class="rt-empty">No RTO data yet — press <b>Update now</b> (top right) and reopen this tab in 5 minutes.</div>'; return; }
    if (!rows.length) { $("rtList").innerHTML = S.pend && S.pend === digits(q) ? "" : '<div class="rt-empty">Nothing matches. Try the PIN code or customer name from the label.</div>'; return; }
    $("rtList").innerHTML = rows.slice(0, S.shown).map(function (r) { return card(r, q); }).join("") +
      (rows.length > S.shown ? '<div style="text-align:center;margin:14px 0"><button type="button" class="secondary" id="rtMore">Show more (' + (rows.length - S.shown) + " left)</button></div>" : "");
  }

  /* ---------- Update now (GitHub job) ---------- */
  async function getToken() {
    var t = "";
    try { if (mainDb()) { var d = await mainDb().collection("aikm_admin").doc("ghSync").get(); t = (d.exists && d.data().token) || ""; } } catch (e) {}
    if (!t) try { t = localStorage.getItem(TK) || ""; } catch (e) {}
    return String(t).replace(/^\s*bearer\s+/i, "").trim();
  }
  async function syncNow() {
    var tok = await getToken();
    if (!tok) { toast("GitHub token missing — click any 'Sync OMS now' button once to set it up, then try again.", true); return; }
    $("rtSyncBtn").disabled = true;
    try {
      var r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/dispatches", {
        method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }) });
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
      toast("Updating from Amazon — takes about 3–5 minutes. The list refreshes by itself.");
      setTimeout(function () { load(true); }, 5 * 60000);
    } catch (err) { toast("Could not start: " + err.message, true); }
    setTimeout(function () { $("rtSyncBtn").disabled = false; }, 60000);
  }

  mount(); document.addEventListener("DOMContentLoaded", mount);
  var tries = 0, w = setInterval(function () { tries++; if ($("tab-rto") || tries > 40) { clearInterval(w); return; } mount(); }, 500);
})();
