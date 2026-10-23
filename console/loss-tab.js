/* AIKM Admin Console — Loss Orders: clear summary + "Fix price on Amazon".
   Loaded by refund-tab.js (no Shopify edit needed). Adds a panel on top of the Loss Orders tab:
     • 4 summary cards (loss orders, real loss, money lost, products to fix)
     • products grouped by SKU, worst first, with Amazon price, MRP and a suggested price
     • "Push" sends the new price to Amazon (queued in spapiPriceUpdates; the Amazon sync applies it
       within ~15 min, keeps MRP, and refuses prices above MRP).
   Reads: OMS orders already in the page (0 extra reads), listingIndex (shared with Self-Ship),
   and spapiPriceUpdates (only after this tab is opened). Writes only when you press Push. */
(function () {
  if (window.__aikmLossTab) return; window.__aikmLossTab = 1;

  var FEE_SHARE = 0.75;                 // of every ₹1 price rise, about ₹0.75 reaches profit (GST + Amazon fee)
  var S = { view: "fix", days: 7, target: 20, q: "", lix: {}, req: {}, reqUnsub: null, lixUnsub: null, lastSig: "" };
  function db() { return typeof fbDb !== "undefined" && fbDb ? fbDb : null; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function inr(n) { return n == null || isNaN(n) ? "—" : "₹" + Math.round(Number(n)).toLocaleString("en-IN"); }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function when(o) {
    var s = String(o.orderDate || ""), m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    var d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(s.replace(" ", "T"));
    return isNaN(d) ? 0 : d.getTime();
  }
  function isAmazon(ch) { return /amazon/i.test(ch || ""); }
  function acctName(ch) { return String(ch || "").replace(/\s*-\s*(Amazon|Meesho|Flipkart|Snapdeal|Shopify).*$/i, "").trim(); }
  function lix() { return window.__nbLIX && Object.keys(window.__nbLIX).length ? window.__nbLIX : S.lix; }
  function acctKey(ch) {
    var n = acctName(ch).toLowerCase().replace(/[^a-z0-9]/g, ""), ks = Object.keys(lix());
    return ks.filter(function (k) { return n === k; })[0] || ks.filter(function (k) { return n.indexOf(k) === 0 || k.indexOf(n) === 0; })[0] || "";
  }
  function listing(o) {
    var ak = acctKey(o.channel), ix = lix()[ak]; if (!ix) return null;
    var skus = ix.skus || {}, sku = o.sku;
    if (!skus[sku]) { var ol = (ix.orders || {})[o.channelOrderId] || []; if (ol.length === 1) sku = ol[0].s; }
    var x = skus[sku]; if (!x) return null;
    return { acct: ak, sku: sku, asin: x.a || "", price: x.p, mrp: x.m, img: x.i || "", f: x.f, t: x.t, e: x.e, c: x.c, k: x.k, g: x.g, fp: x.fp };
  }
  var MIN_PROFIT = 15, MIN_PCT = 0.10;   // same as the price robot: a loss order earns under Rs 15 AND under 10% of the order value
  function minFor(o) { return Math.min(MIN_PROFIT, MIN_PCT * (num(o.total) || 0)); }
  // Same maths as the price robot, per order: price + 85% of the buyer's shipping charge - product cost - courier
  // - Amazon fees (Amazon's own estimate) - GST on the margin - Rs 3 kept for returns. null = not enough data.
  function ourProfit(o, L) {
    if (!L || L.c == null || L.k == null) return null;
    var price = num(o.price), q = Math.max(1, num(o.qty) || 1); if (!(price > 0)) return null;
    var g = (L.g != null ? L.g : 5) / 100, fee = L.fp != null ? L.fp : 2;
    var courier = L.k * (1 + 0.25 * (q - 1));
    var gst = g > 0 ? (price - L.c) * g / (1 + g) * q : 0;
    return Math.round(price * q + 0.85 * num(o.shippingCharge) - L.c * q - courier - fee * q - gst - 3);
  }
  function isLoss(o) { return typeof isOmsOrderLoss === "function" ? isOmsOrderLoss(o) : (!/cancel/i.test(o.status || "") && num(o.profit) < 20); }
  function toast(msg, bad) {
    var t = document.createElement("div"); t.textContent = msg;
    t.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:99999;padding:11px 16px;border-radius:10px;font:600 13px/1.35 inherit;color:#fff;max-width:380px;box-shadow:0 8px 24px rgba(0,0,0,.25);background:" + (bad ? "#B42318" : "#0F1E35");
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4500);
  }

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent = [
    "html#aikm body #lxPanel{margin-bottom:16px}",
    "html#aikm body #lxPanel .lx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}",
    "html#aikm body #lxPanel h2{margin:0 0 4px;font-family:Lexend,var(--x-brand-font,inherit)}",
    "html#aikm body #lxPanel .lx-sub{display:block !important;font-size:12px;color:var(--x-muted);line-height:1.5;max-width:720px}",
    "html#aikm body #lxPanel .lx-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
    "html#aikm body #lxPanel .lx-chip{padding:6px 12px;border-radius:20px;border:1px solid var(--x-line);background:var(--x-surface-2);font-size:12px;font-weight:600;color:var(--x-text-2);cursor:pointer}",
    "html#aikm body #lxPanel .lx-chip.on{background:var(--x-gold-soft);color:var(--x-gold);border-color:var(--x-gold-line)}",
    "html#aikm body #lxPanel .lx-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}",
    "@media (max-width:900px){html#aikm body #lxPanel .lx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    "html#aikm body #lxPanel .lx-kpi{border:1px solid var(--x-line);border-radius:12px;padding:12px 14px;background:var(--x-surface)}",
    "html#aikm body #lxPanel .lx-kpi b{display:block;font:700 22px/1.1 Lexend,var(--x-brand-font,inherit);color:var(--x-text);font-variant-numeric:tabular-nums}",
    "html#aikm body #lxPanel .lx-kpi span{font-size:11.5px;color:var(--x-muted)}",
    "html#aikm body #lxPanel .lx-kpi.red b{color:var(--x-red)} html#aikm body #lxPanel .lx-kpi.gold b{color:var(--x-gold)}",
    "html#aikm body #lxPanel .lx-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}",
    "html#aikm body #lxPanel .lx-bar input{padding:7px 10px;border-radius:8px;border:1px solid var(--x-line);background:var(--x-surface);color:var(--x-text);font:inherit;font-size:12px}",
    "html#aikm body #lxPanel #lxQ{flex:1;min-width:200px}",
    "html#aikm body #lxPanel #lxTarget{width:70px}",
    "html#aikm body #lxPanel table{width:100%;font-size:12px;border-collapse:collapse}",
    "html#aikm body #lxPanel th{text-align:left;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--x-muted);padding:8px 8px;border-bottom:1px solid var(--x-line)}",
    "html#aikm body #tab-lossorders #lxPanel #lxBody tr:nth-child(n),html#aikm body #tab-lossorders #lxPanel #lxBody tr:nth-child(n) td{background:var(--x-surface) !important;color:var(--x-text) !important;opacity:1 !important;filter:none !important}",
    "html#aikm body #tab-lossorders #lxPanel #lxBody tr:nth-child(n):hover td{background:var(--x-surface-2) !important}",
    "html#aikm body #lxPanel td{padding:9px 8px;border-bottom:1px solid var(--x-line-2,var(--x-line));vertical-align:middle;font-variant-numeric:tabular-nums}",
    "html#aikm body #lxPanel .num{text-align:right;white-space:nowrap}",
    "html#aikm body #lxPanel .lx-prod{display:flex;gap:10px;align-items:center;min-width:240px}",
    "html#aikm body #lxPanel .lx-prod img{width:38px;height:38px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid var(--x-line);flex:none}",
    "html#aikm body #lxPanel .lx-name{font-weight:600;color:var(--x-text);line-height:1.3}",
    "html#aikm body #lxPanel .lx-ids{font-size:11px;color:var(--x-muted);margin-top:2px}",
    "html#aikm body #lxPanel .lx-ids a{color:var(--x-gold)}",
    "html#aikm body #tab-lossorders #lxPanel #lxBody tr td.neg{color:var(--x-red) !important;font-weight:700}",
    "html#aikm body #tab-lossorders #lxPanel #lxBody tr td.low{color:var(--x-amber) !important;font-weight:700}",
    "html#aikm body #tab-lossorders #lxPanel #lxBody tr td.sug{color:var(--x-gold) !important;font-weight:700}",
    "html#aikm body #tab-lossorders #lxPanel #lxBody tr .lx-ids{color:var(--x-muted) !important}",
    "html#aikm body #lxPanel .lx-push{display:flex;gap:6px;align-items:center;justify-content:flex-end}",
    "html#aikm body #lxPanel .lx-push input{width:78px;padding:6px 8px;border-radius:7px;border:1px solid var(--x-line);background:var(--x-surface);color:var(--x-text);font:inherit;font-size:12px;text-align:right}",
    "html#aikm body #lxPanel .lx-push button{padding:6px 12px;font-size:12px;border-radius:7px}",
    "html#aikm body #lxPanel .lx-tag{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}",
    "html#aikm body #lxPanel .t-ok{background:var(--x-green-soft);color:var(--x-green)}",
    "html#aikm body #lxPanel .t-warn{background:var(--x-amber-soft);color:var(--x-amber)}",
    "html#aikm body #lxPanel .t-bad{background:var(--x-red-soft);color:var(--x-red)}",
    "html#aikm body #lxPanel .t-mute{background:var(--x-surface-2);color:var(--x-muted)}",
    "html#aikm body #lxPanel .lx-empty{padding:22px;text-align:center;color:var(--x-muted);font-size:12.5px}",
    "html#aikm body #lxPanel .lx-more{margin-top:10px;font-size:12px;color:var(--x-muted)}",
    "html#aikm body #tab-lossorders .lx-oldhead{font-size:15px}"
  ].join("\n");
  document.head.appendChild(css);

  /* ---------- build panel ---------- */
  function mount() {
    var tab = $("tab-lossorders"); if (!tab) return false;
    if ($("lxPanel")) return true;
    var wrap = tab.querySelector(".wrap-wide") || tab, old = wrap.querySelector(".panel");
    var p = document.createElement("div"); p.className = "panel"; p.id = "lxPanel";
    p.innerHTML =
      '<div class="lx-head"><div><h2>Fix loss-making products</h2>' +
      '<div class="lx-sub">Each row is one product that sold with low or negative profit. Set a new price and press <strong>Push</strong> — Amazon updates within about 15 minutes. ' +
      'Profit = price + buyer\'s shipping charge − product cost − courier − Amazon fees − GST (same maths as the price robot). A loss order earns under ₹15 and under 10% of the order value. Where an account isn\'t linked or a cost isn\'t mapped, OMS Guru\'s profit is used and marked <b>OMS</b>.</div></div>' +
      '<div class="lx-chips" id="lxDays"><span class="lx-chip" data-d="1">Today</span><span class="lx-chip on" data-d="7">7 days</span><span class="lx-chip" data-d="30">30 days</span><span class="lx-chip" data-d="0">All</span></div></div>' +
      '<div class="lx-kpis" id="lxKpis"></div>' +
      '<div class="lx-bar"><span class="lx-chips" id="lxView"><span class="lx-chip on" data-v="fix">Ready to fix</span><span class="lx-chip" data-v="all">All products</span></span><input id="lxQ" placeholder="Search product, SKU or ASIN…">' +
      '<span style="font-size:12px;color:var(--x-muted)">At least ₹15 or 10% of the order — same rule as the price robot</span>' +
      '<button type="button" id="lxPushAll">Push all suggested prices</button></div>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Product</th><th>Account</th><th class="num">Loss orders</th><th class="num">Profit / order</th><th class="num">Total profit</th>' +
      '<th class="num">Amazon price</th><th class="num">MRP</th><th class="num">Suggested</th><th class="num">New price</th><th>Status</th></tr></thead><tbody id="lxBody"></tbody></table></div>' +
      '<div class="lx-more" id="lxMore"></div>';
    wrap.insertBefore(p, old || wrap.firstChild);
    if (old) {
      var h = old.querySelector("h2"); if (h && h.firstChild && h.firstChild.nodeType === 3) { h.firstChild.textContent = "All loss orders (order list) "; h.classList.add("lx-oldhead"); }
      var hint = old.querySelector("small.hint"); if (hint) hint.textContent = "Every loss order one by one, for checking or Excel export. Fix prices from the table above.";
    }
    $("lxDays").addEventListener("click", function (e) { var c = e.target.closest(".lx-chip"); if (!c) return; S.days = +c.dataset.d;
      [].forEach.call($("lxDays").children, function (x) { x.classList.toggle("on", x === c); }); render(true); });
    $("lxView").addEventListener("click", function (e) { var c = e.target.closest(".lx-chip"); if (!c) return; S.view = c.dataset.v;
      [].forEach.call($("lxView").children, function (x) { x.classList.toggle("on", x === c); }); render(true); });
    $("lxQ").addEventListener("input", function () { S.q = this.value.trim().toLowerCase(); render(true); });
    $("lxPushAll").addEventListener("click", pushAll);
    $("lxBody").addEventListener("click", function (e) { var b = e.target.closest(".lx-go"); if (b) pushOne(b.dataset.k); });
    $("lxBody").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.classList.contains("lx-np")) pushOne(e.target.dataset.k); });
    return true;
  }

  /* ---------- data ---------- */
  var ROWS = {}, LIST = [];
  function build() {
    var raw = window.omsOrdersRaw || [], cut = S.days ? (S.days === 1 ? new Date().setHours(0, 0, 0, 0) : Date.now() - S.days * 864e5) : 0;
    var g = {}, totals = { n: 0, real: 0, lost: 0 };
    totals.ours = 0;
    raw.forEach(function (o) {
      if (/cancel/i.test(o.status || "")) return;
      var t = when(o); if (cut && (!t || t < cut)) return;
      var L = isAmazon(o.channel) ? listing(o) : null, mine = ourProfit(o, L);
      // our own maths (cost mapping + Amazon fees + courier + GST) where we have it, else OMS Guru's profit
      if (mine != null ? mine >= minFor(o) : !isLoss(o)) return;
      var pr = mine != null ? mine : num(o.profit), qty = Math.max(1, num(o.qty) || 1);
      totals.n++; if (mine != null) totals.ours++; if (pr < 0) { totals.real++; totals.lost += -pr; }
      var key = (L ? L.acct + "|" + L.sku : acctName(o.channel) + "|" + (o.sku || o.productName));
      var r = g[key] || (g[key] = { key: key, name: o.productName || o.sku, sku: (L && L.sku) || o.sku || "", acct: acctName(o.channel), amazon: isAmazon(o.channel), L: L, n: 0, profit: 0, units: 0, total: 0, src: mine != null ? "ours" : "OMS" });
      r.n++; r.profit += pr; r.units += qty; r.total += num(o.total);
      if (!r.L && L) r.L = L;
    });
    LIST = Object.keys(g).map(function (k) {
      var r = g[k], L = r.L; r.avg = r.profit / r.n; r.qtyPer = r.units / r.n;
      r.sug = null; r.note = "";
      if (!r.amazon) r.note = "Change on " + (/flipkart/i.test(r.key) ? "Flipkart" : /meesho/i.test(r.key) ? "Meesho" : "that channel") + " by hand";
      else if (!L) r.note = acctKey(r.key.split("|")[0]) ? "SKU not found on Amazon" : "Account not linked — change by hand";
      else if (/^unmapped/i.test(r.name || "")) r.note = "Not mapped in OMS Guru — profit may be wrong, map it first";
      else if (L.price && L.t != null) {
        // same maths as the price robot: cost + shipping charge paid by the buyer - courier - Amazon fees
        if (L.e >= S.target) r.note = "Earns ₹" + L.e + "/order at today's price — no change needed";
        else if (L.mrp && L.t > L.mrp) r.note = "Needs " + inr(L.t) + " — above MRP " + inr(L.mrp) + ". Check cost / mapping";
        else r.sug = L.t;
      }
      else if (L.price) {
        var need = S.target - r.avg;
        if (need <= 0) r.note = "Profit already at target";
        else {
          var s = Math.ceil(L.price + need / (r.qtyPer * FEE_SHARE));
          if (L.mrp && s > L.mrp) { r.sug = null; r.note = "Needs " + inr(s) + " — above MRP " + inr(L.mrp) + ". Check cost / mapping"; }
          else r.sug = s;
        }
      }
      return r;
    }).sort(function (a, b) { return a.profit - b.profit; });
    ROWS = {}; LIST.forEach(function (r) { ROWS[r.key] = r; });
    return totals;
  }

  function isQueued(r) { var q = r.L && S.req[r.L.acct + "_" + r.L.sku]; return !!(q && (q.status === "pending" || (q.status === "applied" && Date.now() - (q.appliedAt && q.appliedAt.toMillis ? q.appliedAt.toMillis() : 0) < 3 * 864e5))); }
  function statusFor(r) {
    if (!r.L) return '<span class="lx-tag t-mute">' + esc(r.note) + "</span>";
    var q = S.req[r.L.acct + "_" + r.L.sku], ms = function (ts) { return ts && ts.toMillis ? ts.toMillis() : 0; };
    if (q && q.status === "pending") return '<span class="lx-tag t-warn">Queued ' + inr(q.newPrice) + " · next sync</span>";
    if (q && q.status === "applied" && q.verified === false) return '<span class="lx-tag t-warn" title="Amazon accepted it. Checking it is live at the next sync.">Sent ' + inr(q.newPrice) + " · Amazon checking</span>";
    if (q && q.status === "applied" && Date.now() - ms(q.verifiedAt || q.appliedAt) < 3 * 864e5) return '<span class="lx-tag t-ok">✓ Live on Amazon ' + inr(q.newPrice) + "</span>";
    if (q && q.status === "failed" && Date.now() - ms(q.failedAt) < 3 * 864e5) return '<span class="lx-tag t-bad" title="' + esc(q.error || "") + '">Amazon refused · ' + esc(String(q.error || "").replace(/^Amazon rejected the change \([A-Z_]+\):?\s*/, "").slice(0, 70)) + "</span>";
    return r.note ? '<span class="lx-tag t-mute">' + esc(r.note) + "</span>" : '<span class="lx-tag t-mute">Not changed yet</span>';
  }

  var MAX = 120;
  function render(force) {
    if (!mount()) return;
    var raw = window.omsOrdersRaw || [], sig = raw.length + "|" + Object.keys(lix()).length + "|" + JSON.stringify(S.req).length + "|" + S.days + "|" + S.target + "|" + S.q;
    if (!force && sig === S.lastSig) return; S.lastSig = sig;
    var t = build(), fix = LIST.filter(function (r) { return r.sug; }).length;
    $("lxKpis").innerHTML =
      kpi(t.n, "Loss orders (under ₹15 / 10%)", "red") + kpi(t.real, "Sold below cost (profit under ₹0)", t.real ? "red" : "") +
      kpi(inr(t.lost), "Money lost on those orders", t.lost ? "red" : "") + kpi(fix, "Amazon prices ready to fix", "gold");
    var rows = LIST.filter(function (r) { return (S.view === "all" || r.sug || isQueued(r)) && (!S.q || (r.name + " " + r.sku + " " + (r.L ? r.L.asin : "") + " " + r.acct).toLowerCase().indexOf(S.q) > -1); });
    $("lxView").children[0].textContent = "Ready to fix (" + LIST.filter(function (r) { return r.sug || isQueued(r); }).length + ")";
    $("lxView").children[1].textContent = "All products (" + LIST.length + ")";
    $("lxPushAll").disabled = !fix;
    if (!raw.length) { $("lxBody").innerHTML = '<tr><td colspan="10" class="lx-empty">Waiting for OMS orders to load…</td></tr>'; $("lxMore").textContent = ""; return; }
    if (!rows.length) { $("lxBody").innerHTML = '<tr><td colspan="10" class="lx-empty">' + (LIST.length ? (S.view === "fix" && !S.q ? "No Amazon price to fix right now. Open \u201cAll products\u201d to see the rest." : "No product matches your search.") : "No loss orders in this period — nice.") + "</td></tr>"; $("lxMore").textContent = ""; return; }
    $("lxBody").innerHTML = rows.slice(0, MAX).map(function (r) {
      var L = r.L, k = esc(r.key), ids = "SKU " + esc(r.sku || "—") + (L && L.asin ? ' · <a href="https://www.amazon.in/dp/' + esc(L.asin) + '" target="_blank" rel="noopener">' + esc(L.asin) + "</a>" : "");
      var cls = r.avg < 0 ? "neg" : "low";
      var push = L ? '<div class="lx-push"><input type="number" min="1" step="1" class="lx-np" data-k="' + k + '" value="' + (r.sug || "") + '" placeholder="₹"><button type="button" class="lx-go" data-k="' + k + '">Push</button></div>' : '<span style="color:var(--x-muted)">—</span>';
      return "<tr><td><div class=\"lx-prod\">" + (L && L.img ? '<img src="' + esc(L.img) + '" alt="" loading="lazy">' : "") +
        '<div><div class="lx-name">' + esc(r.name) + '</div><div class="lx-ids">' + ids + "</div></div></div></td>" +
        "<td>" + esc(r.acct) + "</td><td class=\"num\">" + r.n + '</td><td class="num ' + cls + '">' + inr(r.avg) + (r.src === "OMS" ? ' <span class="lx-tag t-mute" title="Profit from OMS Guru - our own maths needs a linked account and a cost mapping">OMS</span>' : "") + '</td><td class="num ' + cls + '">' + inr(r.profit) + "</td>" +
        '<td class="num">' + (L ? inr(L.price) + (L.e != null ? '<div class="lx-ids">earns ' + inr(L.e) + "/order</div>" : "") : "—") + '</td><td class="num">' + (L ? inr(L.mrp) : "—") + '</td><td class="num sug">' + (r.sug ? inr(r.sug) : "—") + "</td>" +
        '<td class="num">' + push + "</td><td>" + statusFor(r) + "</td></tr>";
    }).join("");
    $("lxMore").textContent = (rows.length > MAX ? "Showing the worst " + MAX + " of " + rows.length + " products. Search to find others. " : "") +
      "Suggested price = the price that earns ₹" + S.target + " per order after product cost, courier and Amazon fees (the buyer's shipping charge counted as income). Never above MRP. Prices you push here are left alone by the robot for 7 days.";
  }
  function kpi(v, l, c) { return '<div class="lx-kpi ' + (c || "") + '"><b>' + v + "</b><span>" + l + "</span></div>"; }

  /* ---------- push ---------- */
  function queue(r, price) {
    return db().collection("spapiPriceUpdates").doc(r.L.acct + "_" + r.L.sku).set({
      account: r.L.acct, sku: r.L.sku, asin: r.L.asin || null, oldPrice: r.L.price == null ? null : r.L.price, newPrice: price,
      status: "pending", source: "console", from: "loss-orders", requestedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  function check(r, v) {
    if (!(v > 0)) return "Enter a valid price.";
    if (r.L.mrp && v > r.L.mrp) return "₹" + v + " is above MRP " + inr(r.L.mrp) + " — Amazon will refuse it.";
    return "";
  }
  function pushOne(key) {
    var r = ROWS[key]; if (!r || !r.L) return;
    if (!db()) return toast("Firebase not connected yet — wait a few seconds.", true);
    var inp = [].filter.call(document.querySelectorAll("#lxBody .lx-np"), function (x) { return x.dataset.k === key; })[0], v = Math.round(num(inp && inp.value) * 100) / 100;
    var bad = check(r, v); if (bad) return toast(bad, true);
    var msg = "Change Amazon price?\n\n" + r.name + "\n" + r.acct + " · SKU " + r.L.sku + "\n\n" + inr(r.L.price) + "  →  ₹" + v +
      (r.L.price && v < r.L.price ? "\n\n⚠ This LOWERS the price." : "") + "\n\nAmazon updates at the next sync (about 15 min).";
    if (!confirm(msg)) return;
    queue(r, v).then(function () { toast("Queued — Amazon updates in about 15 minutes."); }).catch(function (e) { toast("Not saved — check internet. " + (e.message || e), true); });
  }
  function pushAll() {
    if (!db()) return toast("Firebase not connected yet — wait a few seconds.", true);
    var list = LIST.filter(function (r) { var q = S.req[r.L && r.L.acct + "_" + r.L.sku]; return r.sug && !(q && q.status === "pending"); });
    if (!list.length) return toast("Nothing to push.");
    var preview = list.slice(0, 12).map(function (r) { return "• " + String(r.name).slice(0, 42) + ": " + inr(r.L.price) + " → ₹" + r.sug; }).join("\n");
    if (!confirm("Push " + list.length + " new price(s) to Amazon?\n\n" + preview + (list.length > 12 ? "\n…and " + (list.length - 12) + " more" : "") + "\n\nAll are raises and none is above MRP. Amazon updates within about 15 minutes.")) return;
    var b = db().batch();
    list.slice(0, 450).forEach(function (r) {
      b.set(db().collection("spapiPriceUpdates").doc(r.L.acct + "_" + r.L.sku), { account: r.L.acct, sku: r.L.sku, asin: r.L.asin || null,
        oldPrice: r.L.price == null ? null : r.L.price, newPrice: r.sug, status: "pending", source: "console", from: "loss-orders",
        requestedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    b.commit().then(function () { toast(list.length + " price(s) queued — Amazon updates in about 15 minutes."); }).catch(function (e) { toast("Not saved — " + (e.message || e), true); });
  }

  /* ---------- live data (only after the tab is opened) ---------- */
  function hook() {
    if (!db()) return;
    if (!S.reqUnsub) S.reqUnsub = db().collection("spapiPriceUpdates").where("source", "==", "console").onSnapshot(function (s) {
      var m = {}; s.forEach(function (d) { m[d.id] = d.data() || {}; }); S.req = m; if (visible()) render();
    }, function (e) { console.warn("Loss tab: price requests", e); });
    if (!S.lixUnsub && !(window.__nbLIX && Object.keys(window.__nbLIX).length)) S.lixUnsub = db().collection("listingIndex").onSnapshot(function (s) {
      var m = {}; s.forEach(function (d) { m[d.id] = d.data() || {}; }); S.lix = m; if (visible()) render();
    }, function (e) { console.warn("Loss tab: listing index", e); });
  }
  function visible() { var t = $("tab-lossorders"); return t && t.offsetParent !== null; }
  function tick() { if (visible()) { mount(); hook(); render(); } }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest('[data-tab="lossorders"]'); if (b) setTimeout(function () { hook(); render(true); }, 60); }, true);
  mount(); setInterval(tick, 4000); tick();
})();
