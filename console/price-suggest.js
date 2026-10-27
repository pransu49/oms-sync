/* AIKM · Amazon page · 💡 Price suggestions
   The Amazon robot no longer changes prices (owner, 27 Oct 2026). It saves what it WOULD change in
   ONE doc per account: spapiSnapshots/<acct>_priceSuggest (SP-API Firebase) - 1 read per page open. This panel lists them; "Apply" queues YOUR price push
   (same as the Push button on the page) - Amazon updates at the next sync, about 15 min.
   Loaded by the block at the end of console/amazon-name-search.js (aikmPriceSuggestJs). */
(function () {
  if (window.__aikmPriceSuggest) return; window.__aikmPriceSuggest = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var acctName = function () { return ((typeof SPAPI_ACCOUNTS !== "undefined" && SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); })) || {}).name || acct(); };
  var toast = function (m, b) { typeof spToast === "function" ? spToast(m, b) : alert(m); };
  var KIND = { lower: ["⬇ Lower to win Buy Box", "#1E7A4B", "#E6F3EC"], raise: ["⬆ Raise (holding Buy Box)", "#1F4E8C", "#E8ECF4"], loss_guard: ["⬆ Raise — selling at a loss", "#A86A12", "#FBF1DF"],
    undo: ["↩ Go back to old price", "#A86A12", "#FBF1DF"], blocked: ["🛠 Amazon blocked the price", "#B42318", "#FCECEA"] };
  var rows = [], filt = "all", sel = new Set();

  var css = document.createElement("style");
  css.textContent = ".ps-open{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 13px;border-radius:9px;font-size:12.5px;font-weight:600;color:#fff;border:1px solid rgba(201,162,75,.6);background:rgba(201,162,75,.12);white-space:nowrap}" +
    ".ps-open:hover{background:rgba(201,162,75,.28)}.ps-open b{background:#C9A24B;color:#0F1E35;border-radius:20px;padding:0 7px;font-size:11px}" +
    ".ps-ov{position:fixed;inset:0;background:rgba(15,30,53,.45);backdrop-filter:blur(3px);z-index:1500;display:none;align-items:center;justify-content:center;padding:16px}" +
    ".ps-box{background:#fff;border-radius:16px;width:min(1200px,98vw);height:min(860px,94vh);display:flex;flex-direction:column;overflow:hidden;border-top:3px solid #C9A24B;box-shadow:0 24px 70px rgba(15,30,53,.3);font-family:Inter,system-ui,sans-serif;color:#14213D}" +
    ".ps-head{padding:18px 22px 10px;display:flex;gap:14px;border-bottom:1px solid #F0ECE2}.ps-head h3{font:600 17px Lexend,sans-serif;margin:4px 0 0}.ps-k{font:600 10.5px Lexend,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#B08A36}" +
    ".ps-x{all:unset;cursor:pointer;margin-left:auto;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#4A5468}.ps-x:hover{background:#FBF9F4}" +
    ".ps-note{margin:12px 22px 0;padding:10px 14px;background:#F6EEDB;border:1px solid #EBDDBA;border-radius:10px;font-size:12.5px;line-height:1.55}" +
    ".ps-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 22px}.ps-chip{all:unset;cursor:pointer;border:1px solid #E7E1D3;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:600;color:#4A5468;background:#fff}.ps-chip.on{background:#0F1E35;color:#fff;border-color:#0F1E35}" +
    ".ps-btn{all:unset;cursor:pointer;font-size:12.5px;font-weight:600;border-radius:9px;padding:8px 14px;background:#0F1E35;color:#fff}.ps-btn.ghost{background:#fff;color:#4A5468;border:1px solid #E7E1D3}.ps-btn[disabled]{opacity:.5;pointer-events:none}" +
    ".ps-scroll{flex:1;overflow:auto;border-top:1px solid #F0ECE2}.ps-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}.ps-t th{position:sticky;top:0;background:#FBF9F4;text-align:left;font:600 10.5px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8B909B;padding:9px 12px;border-bottom:1px solid #E7E1D3;white-space:nowrap}" +
    ".ps-t td{padding:10px 12px;border-bottom:1px solid #F0ECE2;vertical-align:top}.ps-nm{font-weight:500;max-width:330px;line-height:1.35}.ps-sub{font-size:11px;color:#8B909B;margin-top:2px}.ps-p{display:inline-block;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600;white-space:nowrap}" +
    ".ps-why{max-width:360px;font-size:11.5px;color:#4A5468;line-height:1.45}.ps-pr{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}.ps-in{width:76px;border:1px solid #E7E1D3;border-radius:7px;padding:5px 8px;font-size:12.5px}.ps-empty{padding:60px 20px;text-align:center;color:#8B909B}";
  document.head.appendChild(css);

  var ov = document.createElement("div"); ov.className = "ps-ov"; ov.id = "psOv";
  ov.innerHTML = '<div class="ps-box"><div class="ps-head"><div><div class="ps-k">Amazon robot · suggestions only</div><h3 id="psTitle">Price suggestions</h3></div><button type="button" class="ps-x" id="psX" title="Close (Esc)">×</button></div>' +
    '<div class="ps-note">The robot <b>no longer changes prices</b>. It checks every full sync and lists what it would change and why. Tick the ones you agree with and press <b>Apply</b> (you can edit the price first) — Amazon updates at the next sync (~15 min). <b>Dismiss</b> hides a suggestion until the robot finds a new price for it.</div>' +
    '<div class="ps-tools" id="psTools"></div><div class="ps-scroll" id="psBody"></div></div>';
  document.body.appendChild(ov);

  function db() { return typeof fbDbSpapi !== "undefined" ? fbDbSpapi : null; }
  function sref() { return db().collection("spapiSnapshots").doc(acct() + "_priceSuggest"); }
  var FP = function (sku, f) { return new firebase.firestore.FieldPath("items", sku, f); };
  async function load() {
    $("psBody").innerHTML = '<div class="ps-empty">Loading suggestions…</div>';
    try {
      var d = await sref().get(), items = (d.exists && d.data().items) || {};
      rows = []; Object.keys(items).forEach(function (k) { var x = items[k]; x._id = k; if (x.status === "open") rows.push(x); });
      var u = {}; (typeof spapiOrdersRaw !== "undefined" ? spapiOrdersRaw || [] : []).forEach(function (o) { if (o.isCanceled || !o.purchaseDate || Date.now() - Date.parse(o.purchaseDate) > 30 * 864e5) return; (o.items || []).forEach(function (it) { if (it.asin) u[it.asin] = (u[it.asin] || 0) + (+it.qty || 1); }); });
      rows.forEach(function (r) { r.u30 = u[r.asin] || 0; });
      rows.sort(function (a, b) { return b.u30 - a.u30 || (b.at || 0) - (a.at || 0); });
      sel.clear(); draw(); count();
    } catch (e) { $("psBody").innerHTML = '<div class="ps-empty">Could not load — ' + esc(e.message || e) + '</div>'; }
  }
  function list() { return rows.filter(function (r) { return filt === "all" || r.kind === filt || (filt === "raise" && r.kind === "loss_guard"); }); }
  function draw() {
    $("psTitle").textContent = "Price suggestions · " + acctName();
    var cnt = function (k) { return rows.filter(function (r) { return k === "all" || r.kind === k || (k === "raise" && r.kind === "loss_guard"); }).length; };
    $("psTools").innerHTML = [["all", "All"], ["lower", "⬇ Lower"], ["raise", "⬆ Raise"], ["blocked", "🛠 Blocked"], ["undo", "↩ Undo"]].map(function (f) { return '<button type="button" class="ps-chip' + (filt === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + " · " + cnt(f[0]) + "</button>"; }).join("") +
      '<span style="flex:1"></span><span style="font-size:12px;color:#8B909B" id="psSel"></span><button type="button" class="ps-btn ghost" id="psDis">Dismiss</button><button type="button" class="ps-btn" id="psApply">Apply selected</button>';
    var l = list();
    if (!l.length) { $("psBody").innerHTML = '<div class="ps-empty">No suggestions right now. The robot checks at every full sync (Praso hourly, Sasta Store every 2 hours).</div>'; selTxt(); return; }
    $("psBody").innerHTML = '<table class="ps-t"><thead><tr><th style="width:34px"><input type="checkbox" id="psAll"></th><th>Product</th><th>Suggestion</th><th>Now</th><th>Suggested</th><th>Sold 30d</th><th>Why</th></tr></thead><tbody>' +
      l.map(function (r) { var k = KIND[r.kind] || ["Change", "#4A5468", "#F1F0EC"]; return '<tr data-id="' + esc(r._id) + '"><td><input type="checkbox" class="psCk"' + (sel.has(r._id) ? " checked" : "") + '></td>' +
        '<td><div class="ps-nm">' + esc(r.name || r.sku) + '</div><div class="ps-sub">' + esc(r.sku) + (r.asin ? ' · <a href="https://www.amazon.in/dp/' + esc(r.asin) + '" target="_blank" rel="noopener">' + esc(r.asin) + "</a>" : "") + (r.mrp ? " · MRP ₹" + esc(r.mrp) : "") + '</div></td>' +
        '<td><span class="ps-p" style="color:' + k[1] + ";background:" + k[2] + '">' + k[0] + '</span><div class="ps-sub">' + (r.at && typeof spAgo === "function" ? spAgo(r.at) : "") + '</div></td>' +
        '<td class="ps-pr">₹' + esc(r.oldPrice) + '</td><td><input class="ps-in" type="number" step="1" value="' + esc(r.newPrice) + '"></td><td class="ps-pr">' + r.u30 + '</td><td class="ps-why">' + esc(r.why) + "</td></tr>"; }).join("") + "</tbody></table>";
    selTxt();
  }
  function selTxt() { var e = $("psSel"); e && (e.textContent = sel.size ? sel.size + " selected" : ""); ["psApply", "psDis"].forEach(function (id) { var b = $(id); b && (sel.size ? b.removeAttribute("disabled") : b.setAttribute("disabled", "")); }); }
  function count() { var b = $("psOpen"); if (b) b.innerHTML = "💡 Price suggestions" + (rows.length ? " <b>" + rows.length + "</b>" : ""); }
  async function apply() {
    var pick = rows.filter(function (r) { return sel.has(r._id); }).map(function (r) { var tr = document.querySelector('#psBody tr[data-id="' + CSS.escape(r._id) + '"]'), v = tr ? parseFloat(tr.querySelector(".ps-in").value) : r.newPrice; return { r: r, price: v }; });
    var bad = pick.filter(function (p) { return !(p.price > 0) || (p.r.mrp && p.price > p.r.mrp); });
    if (bad.length) return toast("Check the price for " + (bad[0].r.name || bad[0].r.sku) + " (must be above 0 and not above MRP)", true);
    var ok = typeof askPremiumConfirm === "function" ? await askPremiumConfirm({ kicker: "Apply price suggestions", title: pick.length + " listing" + (pick.length > 1 ? "s" : ""), message: pick.slice(0, 12).map(function (p) { return "• " + String(p.r.name || p.r.sku).slice(0, 40) + ": ₹" + p.r.oldPrice + " → ₹" + p.price; }).join("\n") + (pick.length > 12 ? "\n+" + (pick.length - 12) + " more" : "") + "\n\nAmazon updates at the next sync (about 15 min).", confirmLabel: "Apply " + pick.length }) : confirm("Apply " + pick.length + " prices?");
    if (!ok) return;
    try {
      for (var i = 0; i < pick.length; i += 200) {
        var b = db().batch();
        pick.slice(i, i + 200).forEach(function (p) {
          b.set(db().collection("spapiPriceUpdates").doc(acct() + "_" + p.r.sku), { account: acct(), sku: p.r.sku, asin: p.r.asin || null, oldPrice: p.r.oldPrice ?? null, newPrice: p.price, status: "pending", source: "suggestion", requestedAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await b.commit();
        var args = []; pick.slice(i, i + 200).forEach(function (p) { args.push(FP(p.r._id, "status"), "applied", FP(p.r._id, "appliedPrice"), p.price); });
        await sref().update.apply(sref(), args);
      }
      toast("✓ " + pick.length + " price" + (pick.length > 1 ? "s" : "") + " queued — Amazon updates at the next sync");
      rows = rows.filter(function (r) { return !sel.has(r._id); }); sel.clear(); draw(); count();
    } catch (e) { toast("⚠ Not saved: " + (e.message || e), true); }
  }
  async function dismiss() {
    try { var args = []; sel.forEach(function (id) { args.push(FP(id, "status"), "dismissed"); }); await sref().update.apply(sref(), args);
      toast("Dismissed " + sel.size); rows = rows.filter(function (r) { return !sel.has(r._id); }); sel.clear(); draw(); count(); } catch (e) { toast("⚠ Not saved: " + (e.message || e), true); }
  }
  function open() { ov.style.display = "flex"; load(); }
  function close() { ov.style.display = "none"; }
  $("psX").onclick = close; ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ov.style.display === "flex") close(); });
  $("psTools").addEventListener("click", function (e) { var f = e.target.closest("[data-f]"); if (f) { filt = f.dataset.f; sel.clear(); draw(); return; } if (e.target.id === "psApply") apply(); if (e.target.id === "psDis") dismiss(); });
  $("psBody").addEventListener("change", function (e) {
    if (e.target.id === "psAll") { list().forEach(function (r) { e.target.checked ? sel.add(r._id) : sel.delete(r._id); }); document.querySelectorAll("#psBody .psCk").forEach(function (c) { c.checked = e.target.checked; }); selTxt(); return; }
    if (e.target.classList.contains("psCk")) { var id = e.target.closest("tr").dataset.id; e.target.checked ? sel.add(id) : sel.delete(id); selTxt(); }
  });
  function addBtn() {
    var r = $("spRefreshBtn"); if (!r || $("psOpen")) return !!$("psOpen");
    var b = document.createElement("button"); b.type = "button"; b.id = "psOpen"; b.className = "ps-open"; b.title = "Price changes the robot suggests — you decide"; b.innerHTML = "💡 Price suggestions"; b.onclick = open;
    r.parentNode.insertBefore(b, $("rlOpen") || r); return true;
  }
  var n = 0, t = setInterval(function () { if ((addBtn() && db()) || ++n > 60) { clearInterval(t); if (db()) setTimeout(function () { sref().get().then(function (d) { var it = (d.exists && d.data().items) || {}, c = Object.keys(it).filter(function (k) { return it[k].status === "open"; }).length; rows = new Array(c); count(); rows = []; }).catch(function () {}); }, 3000); } }, 500);
  document.addEventListener("click", function (e) { if (e.target.closest("#spapiAccountSwitcherWrap button[data-acct]")) setTimeout(function () { if (ov.style.display === "flex") load(); }, 300); }, true);
})();
