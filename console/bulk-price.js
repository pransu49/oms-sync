/* AIKM · Amazon page · Competitor Pricing → bulk price drop
   Tick listings (or "select all in this view") and drop the price by ₹1 / ₹2 / ₹3 / ₹4 / ₹5 / any amount,
   or "Beat Buy Box by ₹1". A preview shows every new price, cost and warnings before anything is sent.
   Queues YOUR price pushes in spapiPriceUpdates (same as the Push button) - the sync sends 150 per run.
   Firebase: 0 reads, 1 write per listing queued. Loaded by the block at the end of console/amazon-name-search.js (aikmBulkPriceJs). */
(function () {
  if (window.__aikmBulkPrice) return; window.__aikmBulkPrice = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var toast = function (m, b) { typeof spToast === "function" ? spToast(m, b) : alert(m); };
  var inr = function (v) { return "₹" + (Math.round(v * 100) / 100).toLocaleString("en-IN"); };
  var sel = new Set();

  var css = document.createElement("style");
  css.textContent =
    "#bpBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#FBF9F4;border-bottom:1px solid var(--line-2,#F0ECE2);font-size:12.5px}" +
    "#bpBar label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;color:var(--ink,#14213D)}" +
    "#bpBar .bp-n{color:var(--muted,#8B909B);margin-right:4px}#bpBar .bp-l{font-weight:600;color:var(--ink-2,#4A5468);margin-left:6px}" +
    ".bp-b{all:unset;cursor:pointer;font-size:12px;font-weight:700;border:1px solid var(--line,#E7E1D3);border-radius:8px;padding:5px 11px;background:#fff;color:var(--navy,#0F1E35)}" +
    ".bp-b:hover{background:var(--navy,#0F1E35);color:#fff;border-color:var(--navy,#0F1E35)}.bp-b.gold{background:var(--gold-soft,#F6EEDB);border-color:#E6D3A3}" +
    ".bp-b.gold:hover{background:var(--navy,#0F1E35);color:#fff}.bp-b[disabled]{opacity:.45;pointer-events:none}" +
    "#bpCustom{width:62px;border:1px solid var(--line,#E7E1D3);border-radius:8px;padding:5px 8px;font-size:12px}" +
    ".bpCk{width:17px;height:17px;flex:none;accent-color:#0F1E35;cursor:pointer}" +
    ".bp-ov{position:fixed;inset:0;background:rgba(15,30,53,.45);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".bp-box{background:#fff;border-radius:16px;width:min(1100px,98vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;border-top:3px solid #C9A24B;box-shadow:0 24px 70px rgba(15,30,53,.3);font-family:Inter,system-ui,sans-serif;color:#14213D}" +
    ".bp-head{padding:18px 22px 8px}.bp-head h3{font:600 17px Lexend,sans-serif;margin:4px 0 0}.bp-k{font:600 10.5px Lexend,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#B08A36}" +
    ".bp-sum{display:flex;gap:10px;flex-wrap:wrap;padding:6px 22px 10px;font-size:12.5px}.bp-sum span{background:#FBF9F4;border:1px solid #F0ECE2;border-radius:20px;padding:3px 10px}.bp-sum b{font-weight:700}" +
    ".bp-opt{display:flex;gap:18px;flex-wrap:wrap;padding:0 22px 10px;font-size:12.5px}.bp-opt label{display:inline-flex;gap:6px;align-items:center;cursor:pointer}" +
    ".bp-scroll{flex:1;overflow:auto;border-top:1px solid #F0ECE2}.bp-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}" +
    ".bp-t th{position:sticky;top:0;background:#FBF9F4;text-align:left;font:600 10.5px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8B909B;padding:8px 12px;border-bottom:1px solid #E7E1D3}" +
    ".bp-t td{padding:8px 12px;border-bottom:1px solid #F0ECE2;vertical-align:top}.bp-t .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".bp-t tr.skip td{opacity:.45}.bp-t tr.skip td.why{opacity:1}.bp-why{font-size:11.5px;font-weight:600}.bp-why.bad{color:#B42318}.bp-why.warn{color:#A86A12}.bp-why.ok{color:#1E7A4B}" +
    ".bp-foot{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 22px 16px;border-top:1px solid #F0ECE2}.bp-foot .note{margin-right:auto;font-size:12px;color:#8B909B}" +
    ".bp-go{all:unset;cursor:pointer;background:#0F1E35;color:#fff;border-radius:9px;padding:9px 18px;font-weight:600;font-size:13px}.bp-go[disabled]{opacity:.5;pointer-events:none}" +
    ".bp-no{all:unset;cursor:pointer;border:1px solid #E7E1D3;color:#4A5468;border-radius:9px;padding:9px 16px;font-weight:600;font-size:13px}";
  document.head.appendChild(css);

  /* ---- profit per order (same maths as the "Buy Box lost" tab and the robot): price + 85% of the shipping you charge
         − cost − courier − Amazon closing/referral fee − GST on the margin − ₹3 packing ---- */
  var MIN_PROFIT = 15;
  function profit(x, p) {
    if (x.cost == null || !x.it) return null;
    var i = x.it, n = Math.max(+i.weightKg || 0.5, 0.5);
    var courier = acct() === "sastastore" ? (n <= 1 ? 40 : 40 + 30 * Math.ceil(n - 1)) : Math.max(n <= 0.5 ? 55 : n <= 1 ? 75 : n <= 2 ? 112 : n <= 5 ? 112 + 34 * Math.ceil(n - 2) : 214 + 18 * Math.ceil(n - 5), 45);
    var fee = (p > 1000 ? p * 0.08 : 0) + (p <= 300 ? 2 : p <= 500 ? 23 : p <= 1000 ? 48 : 79);
    var r = (typeof TAXCODE_RATE !== "undefined" && i.taxCode in TAXCODE_RATE ? TAXCODE_RATE[i.taxCode] : 5) / 100;
    return Math.round(p + 0.85 * x.ship - x.cost - courier - fee - (r > 0 ? (p - x.cost) * r / (1 + r) : 0) - 3);
  }
  /* ---- data for one ASIN: my offer, Buy Box, SKU, cost ---- */
  function info(item) {
    var offers = item.offers || [], mine = offers.find(function (o) { return typeof isMineOfferKpi === "function" && isMineOfferKpi(o); }),
      win = offers.find(function (o) { return o.isBuyBoxWinner; });
    var inv = (typeof spapiInventoryRaw !== "undefined" ? spapiInventoryRaw : []).filter(function (i) { return i.asin === item.asin && i.sku; });
    var price = mine ? +mine.price : null, ship = mine ? +mine.shipping || 0 : 0;
    var it = inv.find(function (i) { return price != null && Math.abs((+i.price || 0) - price) < 1 && (i.quantity || 0) > 0; })
      || inv.find(function (i) { return (i.quantity || 0) > 0; }) || inv[0] || null;
    if (price == null && it) price = +it.price || null;
    var c = it && typeof getEffectiveSpapiUnitCost === "function" ? getEffectiveSpapiUnitCost(it.name, it.sku) : null;
    return { asin: item.asin, it: it, sku: it ? it.sku : null, name: it ? it.name : item.asin, price: price, ship: ship, mine: !!mine,
      held: !!(mine && win && typeof isMineOfferKpi === "function" && isMineOfferKpi(win)), winL: win ? (+win.price || 0) + (+win.shipping || 0) : null,
      cost: c ? c.value : null, mrp: it && it.mrp ? +it.mrp : null };
  }
  function viewItems() {
    try { return cmApply("pricing", CM.rows.pricing || [], PR_COLS).map(function (r) { return r.raw; }); }
    catch (e) { return (typeof spapiPricingRaw !== "undefined" ? spapiPricingRaw : []); }
  }
  function byAsin() { var m = new Map(); (typeof spapiPricingRaw !== "undefined" ? spapiPricingRaw : []).forEach(function (p) { p.asin && m.set(p.asin, p); }); return m; }

  /* ---- toolbar + row checkboxes (re-added after every table redraw) ---- */
  function decorate() {
    var c = $("spapiPricingTable_cards"); if (!c) return;
    var tools = c.querySelector(".ap-tools"); if (!tools) return;
    var view = viewItems().filter(function (p) { return (p.offers || []).some(function (o) { return isMineOfferKpi(o); }); });
    if (!$("bpBar")) {
      tools.insertAdjacentHTML("afterend", '<div id="bpBar"><label><input type="checkbox" class="bpCk" id="bpAll"> Select all in this view <span class="bp-n" id="bpViewN"></span></label>' +
        '<span id="bpSelN" style="font-weight:700;color:#B08A36"></span><span class="bp-l">Drop price by</span>' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="bp-b" data-drop="' + n + '">₹' + n + "</button>"; }).join("") +
        '<input id="bpCustom" type="number" min="0.5" step="0.5" placeholder="₹ any"><button type="button" class="bp-b" data-drop="custom">Drop</button>' +
        '<button type="button" class="bp-b gold" data-drop="beat" title="New price = Buy Box (incl. shipping) − ₹1 − your shipping">Beat Buy Box by ₹1</button>' +
        '<button type="button" class="bp-b" id="bpClr">Clear</button></div>');
    }
    $("bpViewN").textContent = "(" + view.length + ")";
    $("bpAll").checked = view.length > 0 && view.every(function (p) { return sel.has(p.asin); });
    $("bpAll").indeterminate = !$("bpAll").checked && view.some(function (p) { return sel.has(p.asin); });
    $("bpSelN").textContent = sel.size ? sel.size + " selected" : "";
    c.querySelectorAll("#bpBar [data-drop], #bpClr").forEach(function (b) { sel.size ? b.removeAttribute("disabled") : b.setAttribute("disabled", ""); });
    var P = byAsin();
    c.querySelectorAll("table.sp-tbl tbody tr").forEach(function (tr) {
      if (tr.querySelector(".bpCk")) { var x = tr.querySelector(".bpCk"); x.checked = sel.has(x.dataset.asin); return; }
      var a = tr.querySelector('td a[href*="/dp/"]'), cell = tr.querySelector(".pcell"); if (!a || !cell) return;
      var asin = (a.getAttribute("href").match(/dp\/([A-Z0-9]+)/i) || [])[1]; if (!asin) return;
      var p = P.get(asin), mine = p && (p.offers || []).some(function (o) { return isMineOfferKpi(o); });
      cell.insertAdjacentHTML("afterbegin", '<input type="checkbox" class="bpCk" data-asin="' + esc(asin) + '"' + (mine ? "" : ' disabled title="You have no live offer on this ASIN"') + (sel.has(asin) ? " checked" : "") + ">");
    });
  }
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.classList || !t.classList.contains("bpCk")) return;
    if (t.id === "bpAll") { viewItems().forEach(function (p) { if (!(p.offers || []).some(function (o) { return isMineOfferKpi(o); })) return; t.checked ? sel.add(p.asin) : sel.delete(p.asin); }); }
    else if (t.dataset.asin) { t.checked ? sel.add(t.dataset.asin) : sel.delete(t.dataset.asin); }
    decorate();
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#bpBar [data-drop], #bpClr"); if (!b) return;
    if (b.id === "bpClr") { sel.clear(); decorate(); return; }
    var d = b.dataset.drop;
    if (d === "custom") { var v = parseFloat($("bpCustom").value); if (!(v > 0)) return toast("Type the amount to drop, e.g. 7", true); preview({ by: v }); }
    else if (d === "beat") preview({ beat: true }); else preview({ by: +d });
  });

  /* ---- preview, checks, queue ---- */
  function plan(mode, skipCost, skipBig) {
    var P = byAsin();
    return Array.from(sel).map(function (asin) {
      var p = P.get(asin); if (!p) return null; var x = info(p), r = { x: x, newP: null, why: "", cls: "ok", skip: false };
      if (!x.sku || x.price == null) { r.skip = true; r.cls = "bad"; r.why = "No SKU / price found"; return r; }
      if (mode.beat) {
        if (x.held) { r.skip = true; r.cls = "warn"; r.why = "You already hold the Buy Box"; return r; }
        if (x.winL == null) { r.skip = true; r.cls = "warn"; r.why = "No Buy Box on this ASIN"; return r; }
        r.newP = Math.floor(x.winL - 1 - x.ship);
        if (r.newP >= x.price) { r.skip = true; r.cls = "warn"; r.why = "Already cheaper than the Buy Box"; return r; }
      } else r.newP = Math.round((x.price - mode.by) * 100) / 100;
      if (!(r.newP > 0)) { r.skip = true; r.cls = "bad"; r.why = "Price would be ₹0 or less"; return r; }
      var cut = (x.price - r.newP) / x.price, pf = profit(x, r.newP); r.pf = pf; r.pf0 = profit(x, x.price);
      if (pf != null && pf < MIN_PROFIT) { r.cls = "bad"; r.why = pf < 0 ? "Loss ₹" + Math.abs(pf) + " per order" : "Only ₹" + pf + "/order (under ₹" + MIN_PROFIT + ")"; if (skipCost) r.skip = true; }
      else if (cut > 0.3) { r.cls = "warn"; r.why = "Big cut: " + Math.round(cut * 100) + "%"; if (skipBig) r.skip = true; }
      else if (pf == null) { r.cls = "warn"; r.why = "No cost mapped — profit unknown"; }
      else { r.why = "Earns ₹" + pf + "/order"; }
      return r;
    }).filter(Boolean);
  }
  function preview(mode) {
    var ov = document.createElement("div"); ov.className = "bp-ov";
    var title = mode.beat ? "Beat Buy Box by ₹1" : "Drop price by " + inr(mode.by);
    ov.innerHTML = '<div class="bp-box"><div class="bp-head"><div class="bp-k">Bulk price change · ' + esc(((typeof SPAPI_ACCOUNTS !== "undefined" && SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); })) || {}).name || acct()) + "</div><h3>" + title + "</h3></div>" +
      '<div class="bp-sum" id="bpSum"></div><div class="bp-opt"><label><input type="checkbox" id="bpSkC" checked> Skip listings that would earn under ₹15/order</label><label><input type="checkbox" id="bpSkB" checked> Skip cuts over 30%</label></div>' +
      '<div class="bp-scroll" id="bpList"></div><div class="bp-foot"><span class="note">Amazon updates at the next sync — up to 150 listings per sync (every 15 min).</span><button type="button" class="bp-no" data-x>Cancel</button><button type="button" class="bp-go" id="bpGo">Send</button></div></div>';
    document.body.appendChild(ov);
    var rows = [];
    function draw() {
      rows = plan(mode, $("bpSkC").checked, $("bpSkB").checked);
      var go = rows.filter(function (r) { return !r.skip; }), below = rows.filter(function (r) { return r.cls === "bad" && !r.skip; }).length, gain = go.reduce(function (a, r) { return a + (r.pf != null && r.pf0 != null ? r.pf - r.pf0 : 0); }, 0);
      $("bpSum").innerHTML = "<span>Selected <b>" + rows.length + "</b></span><span>Will change <b>" + go.length + "</b></span><span>Skipped <b>" + (rows.length - go.length) + "</b></span>" + (below ? '<span style="color:#B42318">Under ₹15/order <b>' + below + "</b></span>" : "") + '<span>Profit per order changes by <b>₹' + gain + "</b> in total</span>";
      $("bpList").innerHTML = '<table class="bp-t"><thead><tr><th>Product</th><th class="r">Now</th><th class="r">New</th><th class="r">Buy Box</th><th class="r">Cost</th><th class="r">Profit now → new</th><th>Check</th></tr></thead><tbody>' +
        rows.map(function (r) { var x = r.x; return '<tr class="' + (r.skip ? "skip" : "") + '"><td>' + esc(String(x.name || "").slice(0, 70)) + '<div style="font-size:11px;color:#8B909B">' + esc(x.sku || "") + " · " + esc(x.asin) + "</div></td>" +
          '<td class="r">' + (x.price != null ? inr(x.price) : "—") + (x.ship ? '<div style="font-size:11px;color:#8B909B">+' + inr(x.ship) + " ship</div>" : "") + '</td><td class="r"><b>' + (r.newP != null && !r.skip ? inr(r.newP) : "—") + "</b></td>" +
          '<td class="r">' + (x.held ? '<span style="color:#1E7A4B">You</span>' : x.winL != null ? inr(x.winL) : "—") + '</td><td class="r">' + (x.cost != null ? inr(x.cost) : "—") + '</td><td class="r">' + (r.pf0 != null ? "₹" + r.pf0 + (r.pf != null && !r.skip ? " → <b>₹" + r.pf + "</b>" : "") : "—") + '</td><td class="why"><span class="bp-why ' + r.cls + '">' + (r.skip ? "Skipped · " : "") + esc(r.why) + "</span></td></tr>"; }).join("") + "</tbody></table>";
      $("bpGo").textContent = go.length ? "Send " + go.length + " price" + (go.length > 1 ? "s" : "") + " to Amazon" : "Nothing to send";
      go.length ? $("bpGo").removeAttribute("disabled") : $("bpGo").setAttribute("disabled", "");
    }
    var close = function () { ov.remove(); };
    ov.querySelector("[data-x]").onclick = close; ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    $("bpSkC").onchange = draw; $("bpSkB").onchange = draw; draw();
    $("bpGo").onclick = async function () {
      var go = rows.filter(function (r) { return !r.skip; }); if (!go.length) return;
      this.setAttribute("disabled", ""); this.textContent = "Sending…";
      try {
        for (var i = 0; i < go.length; i += 400) {
          var b = fbDbSpapi.batch();
          go.slice(i, i + 400).forEach(function (r) {
            b.set(fbDbSpapi.collection("spapiPriceUpdates").doc(acct() + "_" + r.x.sku), { account: acct(), sku: r.x.sku, asin: r.x.asin, oldPrice: r.x.price, newPrice: r.newP,
              status: "pending", source: mode.beat ? "bulk-beat" : "bulk-drop-" + mode.by, requestedAt: firebase.firestore.FieldValue.serverTimestamp() });
          });
          await b.commit();
        }
        close(); go.forEach(function (r) { sel.delete(r.x.asin); }); decorate();
        toast("✓ " + go.length + " price" + (go.length > 1 ? "s" : "") + " queued — Amazon updates at the next sync" + (go.length > 150 ? " (150 per sync)" : ""));
      } catch (e) { this.removeAttribute("disabled"); this.textContent = "Try again"; toast("⚠ Not sent: " + (e.message || e), true); }
    };
  }

  /* ---- keep it on the table after every redraw / account switch ---- */
  function hook() {
    var c = $("spapiPricingTable_cards"); if (!c || c.dataset.bpObs) return !!c;
    c.dataset.bpObs = "1";
    new MutationObserver(function () { if (!$("bpBar") || c.querySelector("table.sp-tbl tbody tr:not(:has(.bpCk))")) decorate(); }).observe(c, { childList: true, subtree: true });
    decorate(); return true;
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#spapiAccountSwitcherWrap button[data-acct]")) sel.clear(); }, true);
  var n = 0, t = setInterval(function () { if (hook() || ++n > 120) clearInterval(t); }, 500);
})();
