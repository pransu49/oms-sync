/* AIKM Admin Console — Complaints tab.
   Loaded by refund-tab.js (block aikmComplaintsJs). No Shopify edit needed.
   ⭐ Feedback + account health: aikm-oms-sync aikm_admin/complaintsIndex (complaints-sync.yml, from Amazon SP-API).
      Read ONCE when the tab is opened.
   💬 Buyer messages + Seller Support cases: main Firebase collection amazon_complaints (Gmail robot per account).
      Read only when the Messages view is opened (latest 40). Replies are sent by the Gmail robot only after "Approve & send".
   Handled marks: main Firebase aikm_admin/complaintsDone. */
(function () {
  if (window.__aikmComplaints) return; window.__aikmComplaints = true;
  var REPO = "pransu49/oms-sync", WF = "complaints-sync.yml", TK = "aikm_gh_sync_token";

  (function () { var st = document.createElement("style"); st.textContent = [
    "html#aikm body #tab-complaints .cp-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:14px}",
    "html#aikm body #tab-complaints .cp-hcard{background:var(--x-surface);border:1px solid var(--x-line);border-radius:12px;padding:14px 16px}",
    "html#aikm body #tab-complaints .cp-hhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-weight:700;font-size:14px;color:var(--x-text)}",
    "html#aikm body #tab-complaints .cp-hgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
    "html#aikm body #tab-complaints .cp-m{background:var(--x-surface-2);border:1px solid var(--x-line);border-radius:9px;padding:8px 10px}",
    "html#aikm body #tab-complaints .cp-m b{display:block;font-size:16px;color:var(--x-text);font-variant-numeric:tabular-nums}",
    "html#aikm body #tab-complaints .cp-m span{font-size:11px;color:var(--x-muted)}",
    "html#aikm body #tab-complaints .cp-m.bad{border-color:color-mix(in srgb,var(--x-red) 45%,var(--x-line));background:var(--x-red-soft)}",
    "html#aikm body #tab-complaints .cp-m.bad b{color:var(--x-red)}",
    "html#aikm body #tab-complaints .cp-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
    "html#aikm body #tab-complaints .cp-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12.5px;font-weight:600;color:var(--x-text-2);cursor:pointer}",
    "html#aikm body #tab-complaints .cp-chip.on{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line)}",
    "html#aikm body #tab-complaints .cp-sep{width:1px;height:22px;background:var(--x-line)}",
    "html#aikm body #tab-complaints input#cpQ{flex:1;min-width:220px;min-height:38px;padding:8px 12px;border-radius:10px}",
    "html#aikm body #tab-complaints .cp-card{border:1px solid var(--x-line);border-radius:12px;background:var(--x-surface);padding:14px 16px;margin-bottom:10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px}",
    "html#aikm body #tab-complaints .cp-card.done{opacity:.6}",
    "html#aikm body #tab-complaints .cp-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    "html#aikm body #tab-complaints .cp-stars{color:var(--x-gold);letter-spacing:1px;font-size:14px}",
    "html#aikm body #tab-complaints .cp-stars.low{color:var(--x-red)}",
    "html#aikm body #tab-complaints .cp-oid{font:600 13.5px ui-monospace,Menlo,Consolas,monospace;color:var(--x-text);cursor:pointer}",
    "html#aikm body #tab-complaints .cp-tag{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:var(--x-surface-2);color:var(--x-text-2);border:1px solid var(--x-line);white-space:nowrap}",
    "html#aikm body #tab-complaints .cp-tag.red{background:var(--x-red-soft);color:var(--x-red);border-color:transparent}",
    "html#aikm body #tab-complaints .cp-tag.green{background:var(--x-green-soft);color:var(--x-green);border-color:transparent}",
    "html#aikm body #tab-complaints .cp-tag.amber{background:var(--x-amber-soft);color:var(--x-amber);border-color:transparent}",
    "html#aikm body #tab-complaints .cp-msg{margin-top:8px;font-size:14px;line-height:1.5;color:var(--x-text);white-space:pre-wrap}",
    "html#aikm body #tab-complaints .cp-line{margin-top:6px;font-size:12.5px;color:var(--x-text-2)}",
    "html#aikm body #tab-complaints .cp-next{margin-top:8px;font-size:12.5px;font-weight:600;color:var(--x-gold)}",
    "html#aikm body #tab-complaints .cp-act{display:flex;flex-direction:column;gap:6px;min-width:150px}",
    "html#aikm body #tab-complaints .cp-act a,html#aikm body #tab-complaints .cp-act button{white-space:nowrap;text-align:center;text-decoration:none}",
    "html#aikm body #tab-complaints .cp-act a{display:inline-block;padding:7px 12px;border-radius:8px;border:1px solid var(--x-line-2);color:var(--x-text);font-weight:600;font-size:12.5px}",
    "html#aikm body #tab-complaints textarea.cp-reply{width:100%;min-height:70px;margin-top:8px;padding:8px 10px;border-radius:8px}",
    "html#aikm body #tab-complaints .cp-empty{padding:22px;text-align:center;color:var(--x-muted);border:1px dashed var(--x-line-2);border-radius:12px}",
    "html#aikm body #tab-complaints .cp-note{padding:10px 14px;border-radius:10px;background:var(--x-amber-soft);color:var(--x-amber);font-size:12.5px;margin-bottom:12px}",
    "@media (max-width:760px){html#aikm body #tab-complaints .cp-card{grid-template-columns:1fr}html#aikm body #tab-complaints .cp-act{flex-direction:row;flex-wrap:wrap}html#aikm body #tab-complaints .cp-hgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  ].join(""); document.head.appendChild(st); })();

  var S = { items: [], health: {}, errors: {}, at: null, loaded: false, loading: null, view: "neg", acc: "", q: "", done: {}, msgs: null, msgLoading: false, unsub: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function short(a) { return /praso/i.test(a || "") ? "Praso" : /sasta/i.test(a || "") ? "Sasta Store" : (a || ""); }
  function dd(s) { if (!s) return ""; var d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? s : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
  function pct(r) { return r == null ? "—" : (Math.round(r * 10000) / 100) + "%"; }
  function toast(msg, warn) {
    var t = document.createElement("div"); t.className = "mh-toast" + (warn ? " warn" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4500);
  }
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

  function load(force) {
    if (S.loaded && !force) return Promise.resolve();
    if (S.loading) return S.loading;
    S.loading = new Promise(function (res) {
      var w = setInterval(function () {
        if (!db()) return; clearInterval(w);
        var a = db().collection("aikm_admin").doc("complaintsIndex").get().then(function (d) {
          var x = d.exists ? d.data() : {}; S.items = x.items || []; S.health = x.health || {}; S.errors = x.errors || {}; S.at = x.at || null; S.loaded = true;
        }).catch(function () { toast("Could not read complaints — check internet and open the tab again.", true); });
        var b = mainDb() ? mainDb().collection("aikm_admin").doc("complaintsDone").get().then(function (d) { S.done = (d.exists && d.data().m) || {}; }).catch(function () {}) : null;
        Promise.all([a, b]).then(function () { S.loading = null; render(); res(); });
      }, 300);
    });
    return S.loading;
  }
  function loadMsgs() {
    if (S.msgs || S.msgLoading || !mainDb()) return;
    S.msgLoading = true; render();
    S.unsub = mainDb().collection("amazon_complaints").orderBy("receivedAt", "desc").limit(40).onSnapshot(function (snap) {
      S.msgs = []; snap.forEach(function (d) { var x = d.data(); if (x.type === "test") return; x._id = d.id; S.msgs.push(x); });
      S.msgLoading = false; render();
    }, function (e) { S.msgLoading = false; S.msgs = []; toast("Could not read messages: " + e.message, true); render(); });
  }
  function stopMsgs() { if (S.unsub) { S.unsub(); S.unsub = null; S.msgs = null; } }
  function markDone(key, on) {
    if (!mainDb()) return;
    var m = {}; m[key] = on ? { at: new Date().toISOString() } : firebase.firestore.FieldValue.delete();
    if (on) S.done[key] = m[key]; else delete S.done[key];
    mainDb().collection("aikm_admin").doc("complaintsDone").set({ m: m }, { merge: true }).catch(function (e) { toast("Not saved: " + e.message, true); });
    render();
  }

  /* ---------- page ---------- */
  function mount() {
    var bar = $("mainTabbar"), content = document.querySelector(".app-content");
    if (!bar || !content || $("tab-complaints")) return;
    var b = document.createElement("button");
    b.className = "tabbtn"; b.dataset.tab = "complaints";
    b.innerHTML = '<i class="ti ti-message-report tab-ic"></i>Complaints<span class="rtab-count" id="cpSideCount" style="display:none">0</span>';
    var after = bar.querySelector('[data-tab="rto"]') || bar.querySelector('[data-tab="refund"]');
    after ? after.insertAdjacentElement("afterend", b) : bar.appendChild(b);
    var sub = document.createElement("div");
    sub.className = "subtabbar no-print"; sub.id = "subtab-complaints"; sub.style.display = "none";
    sub.innerHTML = '<span class="subtab-label">Complaints</span><span class="cp-muted" id="cpSyncLine" style="font-size:12px;color:var(--x-muted)">Amazon feedback + account health · buyer messages from Gmail</span><span style="flex:1"></span>' +
      '<button type="button" class="subbtn" id="cpSyncBtn" title="Fetch the latest feedback and account health from Amazon now (about 2–4 minutes)"><i class="ti ti-refresh"></i> Update now</button>';
    content.insertBefore(sub, content.firstChild);
    var p = document.createElement("div");
    p.id = "tab-complaints"; p.className = "tabpanel";
    p.innerHTML = '<div class="cp-health" id="cpHealth"></div>' +
      '<div class="panel"><div class="cp-chips" id="cpChips"></div>' +
      '<div class="cp-chips" style="margin-top:10px"><input type="text" id="cpQ" placeholder="Search order ID, customer, product, words in the complaint…"></div></div>' +
      '<div id="cpNote"></div><div id="cpList"><div class="cp-empty">Loading…</div></div>';
    content.appendChild(p);

    b.addEventListener("click", function () {
      document.querySelectorAll(".tabbtn").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".tabpanel").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".subtabbar").forEach(function (x) { x.style.display = "none"; });
      b.classList.add("active"); p.classList.add("active"); sub.style.display = "flex";
      try { document.body.classList.remove("sidebar-open"); $("appSidebarBackdrop").classList.remove("show"); } catch (e) {}
      load(false); if (S.view === "msg") loadMsgs();
    });
    document.addEventListener("click", function (e) { var t = e.target.closest(".tabbtn[data-tab]"); if (t && t.dataset.tab !== "complaints") stopMsgs(); });
    var deb; $("cpQ").addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () { S.q = $("cpQ").value.trim().toLowerCase(); render(); }, 150); });
    $("cpSyncBtn").addEventListener("click", syncNow);
    p.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cp-f]"); if (c) { var f = c.dataset.cpF.split(":"); if (f[0] === "acc") S.acc = S.acc === f[1] ? "" : f[1]; else { S.view = f[1]; if (S.view === "msg") loadMsgs(); } render(); return; }
      var cp = e.target.closest("[data-cp-copy]"); if (cp) { try { navigator.clipboard.writeText(cp.dataset.cpCopy); toast("Copied " + cp.dataset.cpCopy); } catch (er) {} return; }
      var dn = e.target.closest("[data-cp-done]"); if (dn) { markDone(dn.dataset.cpDone, !S.done[dn.dataset.cpDone]); return; }
      var ap = e.target.closest("[data-cp-send]"); if (ap) { sendReply(ap.dataset.cpSend); return; }
    });
  }

  function healthCard(acc, h) {
    if (!h) return "";
    var m = function (label, val, bad, sub) { return '<div class="cp-m' + (bad ? " bad" : "") + '"><b>' + val + "</b><span>" + label + (sub ? " · " + sub : "") + "</span></div>"; };
    var o = h.odr || {};
    var bad = function (x) { return x && x.s && !/GOOD|HEALTHY|NONE/i.test(x.s); };
    return '<div class="cp-hcard"><div class="cp-hhead"><span>' + esc(short(acc)) + '</span><span class="cp-tag ' + (/NORMAL/i.test(h.status) ? "green" : "red") + '">Account ' + esc((h.status || "").toLowerCase() || "—") + "</span></div>" +
      '<div class="cp-hgrid">' +
        m("Order defect rate", pct(o.r), bad(o), "target < " + pct(o.t)) +
        m("Negative feedback", o.negFb != null ? o.negFb : "—", o.negFb > 0) +
        m("A-to-z claims", o.claims != null ? o.claims : "—", o.claims > 0) +
        m("Chargebacks", o.chargebacks != null ? o.chargebacks : "—", o.chargebacks > 0) +
        m("Late shipment", pct((h.late || {}).r), bad(h.late)) +
        m("On-time delivery", pct((h.ontime || {}).r), bad(h.ontime)) +
      "</div>" + (h.ahr ? '<div class="cp-line">Account Health Rating: <b>' + esc(h.ahr.score != null ? h.ahr.score : "—") + "</b> · " + esc(h.ahr.s || "") + "</div>" : "") + "</div>";
  }
  function fbList() {
    return S.items.filter(function (x) {
      if (S.acc && short(x.acc) !== S.acc) return false;
      if (S.view === "neg" && !(x.rt <= 2)) return false;
      if (S.view === "neu" && x.rt !== 3) return false;
      if (S.view === "open" && (!(x.rt <= 2) || S.done[x.acc + "|" + x.o])) return false;
      if (S.q && (x.o + " " + x.c + " " + (x.p || "") + " " + (x.n || "") + " " + (x.ci || "")).toLowerCase().indexOf(S.q) < 0) return false;
      return true;
    });
  }
  function fbCard(x) {
    var key = x.acc + "|" + x.o, done = !!S.done[key];
    var tags = [];
    if (x.ref) tags.push('<span class="cp-tag green">Refunded' + (x.ref > 1 ? " ₹" + Math.round(x.ref) : "") + "</span>");
    if (x.rto) tags.push('<span class="cp-tag ' + (x.rto === "cust" ? "amber" : "red") + '">' + (x.rto === "back" ? "RTO received" : x.rto === "way" ? "RTO on the way" : "Customer return") + "</span>");
    if (x.ship) tags.push('<span class="cp-tag">Courier: ' + esc(x.ship) + "</span>");
    if (x.resp) tags.push('<span class="cp-tag green">You replied</span>');
    return '<div class="cp-card' + (done ? " done" : "") + '"><div>' +
      '<div class="cp-top"><span class="cp-stars' + (x.rt <= 2 ? " low" : "") + '">' + "★".repeat(x.rt) + "☆".repeat(Math.max(0, 5 - x.rt)) + "</span>" +
        '<span class="cp-oid" data-cp-copy="' + esc(x.o) + '" title="Click to copy">' + esc(x.o) + "</span>" +
        '<span class="cp-tag">' + esc(short(x.acc)) + "</span><span class=\"cp-tag\">" + esc(dd(x.d)) + "</span>" + tags.join("") + "</div>" +
      '<div class="cp-msg">' + esc(x.c || "(no comment)") + "</div>" +
      (x.p ? '<div class="cp-line"><b>' + esc(x.p) + "</b>" + (x.q ? " × " + esc(x.q) : "") + "</div>" : "") +
      ((x.n || x.ci) ? '<div class="cp-line">' + esc([x.n, x.ci, x.pin].filter(Boolean).join(" · ")) + (x.pay ? " · " + esc(/cod/i.test(x.pay) ? "COD" : "Prepaid") : "") + (x.st ? " · OMS: " + esc(x.st) : "") + (x.a ? " · AWB " + esc(x.a) : "") + "</div>" : "") +
      (x.resp ? '<div class="cp-line">Your reply: ' + esc(x.resp) + "</div>" : "") +
      (x.next && !done ? '<div class="cp-next">👉 ' + esc(x.next) + "</div>" : "") +
      '</div><div class="cp-act">' +
        '<a href="https://sellercentral.amazon.in/orders-v3/order/' + encodeURIComponent(x.o) + '" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Open order</a>' +
        '<a href="https://sellercentral.amazon.in/feedback-manager/index.html" target="_blank" rel="noopener"><i class="ti ti-star"></i> Feedback Manager</a>' +
        '<button type="button" class="' + (done ? "secondary" : "btn-gold") + '" data-cp-done="' + esc(key) + '"><i class="ti ' + (done ? "ti-arrow-back-up" : "ti-check") + '"></i> ' + (done ? "Undo handled" : "Mark handled") + "</button>" +
      "</div></div>";
  }
  function msgCard(m) {
    var st = m.status || "new", when = m.receivedAt && m.receivedAt.toDate ? m.receivedAt.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    var tag = st === "replied" ? '<span class="cp-tag green">Replied</span>' : st === "approved" || st === "sending" ? '<span class="cp-tag amber">Sending…</span>' : st === "error" ? '<span class="cp-tag red">Send failed</span>' : '<span class="cp-tag red">New</span>';
    return '<div class="cp-card"><div>' +
      '<div class="cp-top"><span class="cp-tag">' + (m.type === "support" ? "Seller Support" + (m.caseId ? " #" + esc(m.caseId) : "") : "Buyer message") + "</span>" +
        (m.orderId ? '<span class="cp-oid" data-cp-copy="' + esc(m.orderId) + '">' + esc(m.orderId) + "</span>" : "") +
        '<span class="cp-tag">' + esc(m.account || "") + "</span><span class=\"cp-tag\">" + esc(when) + "</span>" + tag + "</div>" +
      '<div class="cp-line"><b>' + esc(m.subject || "") + "</b>" + (m.buyerName ? " · " + esc(m.buyerName) : "") + "</div>" +
      '<div class="cp-msg">' + esc((m.message || "").slice(0, 1500)) + "</div>" +
      (m.error ? '<div class="cp-line" style="color:var(--x-red)">' + esc(m.error) + "</div>" : "") +
      (st === "new" || st === "error" ? '<textarea class="cp-reply" id="cpR_' + esc(m._id) + '" placeholder="Type your reply…">' + esc(m.replyText || "") + "</textarea>" : (m.replyText ? '<div class="cp-line">Your reply: ' + esc(m.replyText) + "</div>" : "")) +
      '</div><div class="cp-act">' +
        (m.orderId ? '<a href="https://sellercentral.amazon.in/orders-v3/order/' + encodeURIComponent(m.orderId) + '" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Open order</a>' : "") +
        (st === "new" || st === "error" ? '<button type="button" class="btn-gold" data-cp-send="' + esc(m._id) + '"><i class="ti ti-send"></i> Approve &amp; send</button>' : "") +
      "</div></div>";
  }
  function sendReply(id) {
    var t = ($("cpR_" + id) || {}).value || "";
    if (!t.trim()) { toast("Type a reply first.", true); return; }
    if (!confirm("Send this reply from the account's Gmail?\n\n" + t.slice(0, 400))) return;
    mainDb().collection("amazon_complaints").doc(id).update({ replyText: t.trim(), status: "approved" })
      .then(function () { toast("Approved — the Gmail robot sends it within 5 minutes."); })
      .catch(function (e) { toast("Not saved: " + e.message, true); });
  }

  function render() {
    if (!$("tab-complaints")) return;
    var negOpen = S.items.filter(function (x) { return x.rt <= 2 && !S.done[x.acc + "|" + x.o]; }).length;
    var sc = $("cpSideCount"); if (sc) { sc.textContent = negOpen; sc.style.display = negOpen ? "" : "none"; }
    if (S.at && S.at.toDate) { var mn = Math.round((Date.now() - S.at.toDate().getTime()) / 60000); $("cpSyncLine").textContent = "Amazon feedback + account health · updated " + (mn < 1 ? "just now" : mn < 120 ? mn + " min ago" : Math.round(mn / 60) + " h ago") + " · buyer messages from Gmail"; }
    $("cpHealth").innerHTML = Object.keys(S.health).sort().map(function (a) { return healthCard(a, S.health[a]); }).join("");
    var cnt = function (fn) { return S.items.filter(function (x) { return (!S.acc || short(x.acc) === S.acc) && fn(x); }).length; };
    var accs = []; S.items.forEach(function (x) { var s = short(x.acc); if (accs.indexOf(s) < 0) accs.push(s); });
    $("cpChips").innerHTML = [
      ["view:open", "To handle", cnt(function (x) { return x.rt <= 2 && !S.done[x.acc + "|" + x.o]; })],
      ["view:neg", "Negative (1–2★)", cnt(function (x) { return x.rt <= 2; })],
      ["view:neu", "Neutral (3★)", cnt(function (x) { return x.rt === 3; })],
      ["view:all", "All feedback", cnt(function () { return true; })],
      ["view:msg", "💬 Buyer messages & cases", S.msgs ? S.msgs.length : ""],
    ].map(function (c) { var f = c[0].split(":"); return '<span class="cp-chip' + (S.view === f[1] ? " on" : "") + '" data-cp-f="' + c[0] + '">' + esc(c[1]) + (c[2] !== "" ? " <b>" + c[2] + "</b>" : "") + "</span>"; }).join("") +
      '<span class="cp-sep"></span>' + accs.map(function (a) { return '<span class="cp-chip' + (S.acc === a ? " on" : "") + '" data-cp-f="acc:' + esc(a) + '">' + esc(a) + "</span>"; }).join("");
    var errs = Object.keys(S.errors || {});
    $("cpNote").innerHTML = errs.length ? '<div class="cp-note">⚠ Amazon did not allow: ' + errs.map(function (a) { return "<b>" + esc(short(a)) + "</b>"; }).join(", ") + " — that account's key needs the new Amazon roles (re-authorize the app and update its GitHub key).</div>" : "";
    if (!S.loaded) return;
    if (S.view === "msg") {
      if (S.msgLoading && !S.msgs) { $("cpList").innerHTML = '<div class="cp-empty">Loading messages…</div>'; return; }
      var ms = (S.msgs || []).filter(function (m) { return (!S.acc || short(m.account) === S.acc) && (!S.q || ((m.orderId || "") + " " + (m.subject || "") + " " + (m.message || "") + " " + (m.buyerName || "")).toLowerCase().indexOf(S.q) >= 0); });
      $("cpList").innerHTML = ms.length ? ms.map(msgCard).join("") : '<div class="cp-empty">No buyer messages yet. Amazon does not share buyer messages through its API — they come from each account\'s Gmail robot. Right now only <b>Praso</b>\'s Gmail is connected.</div>';
      return;
    }
    var list = fbList();
    $("cpList").innerHTML = list.length ? list.slice(0, 150).map(fbCard).join("") : '<div class="cp-empty">' + (S.items.length ? "Nothing here 🎉" : "No feedback yet — press <b>Update now</b> (top right).") + "</div>";
  }

  async function getToken() {
    var t = "";
    try { if (mainDb()) { var d = await mainDb().collection("aikm_admin").doc("ghSync").get(); t = (d.exists && d.data().token) || ""; } } catch (e) {}
    if (!t) try { t = localStorage.getItem(TK) || ""; } catch (e) {}
    return String(t).replace(/^\s*bearer\s+/i, "").trim();
  }
  async function syncNow() {
    var tok = await getToken();
    if (!tok) { toast("GitHub token missing — click any 'Sync OMS now' button once to set it up, then try again.", true); return; }
    $("cpSyncBtn").disabled = true;
    try {
      var r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/dispatches", { method: "POST",
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main" }) });
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
      toast("Fetching from Amazon — about 2–4 minutes. The list refreshes by itself.");
      setTimeout(function () { load(true); }, 4 * 60000);
    } catch (err) { toast("Could not start: " + err.message, true); }
    setTimeout(function () { $("cpSyncBtn").disabled = false; }, 60000);
  }

  mount(); document.addEventListener("DOMContentLoaded", mount);
  var tries = 0, w = setInterval(function () { tries++; if ($("tab-complaints") || tries > 40) { clearInterval(w); return; } mount(); }, 500);
  // side badge: count of negative feedback to handle (1 read once per page load, after 8 s)
  setTimeout(function () { if (!S.loaded) load(false); }, 8000);
})();
