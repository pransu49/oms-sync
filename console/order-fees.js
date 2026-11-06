/* AIKM · Amazon page · Orders tab: real Referral fee + Closing fee (owner, 6 Nov 2026)
   Fees come from Amazon's Finance API (saved on each order by spapi-sync.js -> order.fees, snapshot only).
   - Adds "Referral fee" and "Closing fee" columns (sortable / filterable like the others).
   - "Net profit" (owner, 6 Nov 2026) = same maths as the price robot:
       order total − GST payable on the margin − product cost − Amazon fees − courier − ₹3 return buffer − refunds.
     Amazon's real fees / Easy Ship fee / refunds are used once posted; before that, estimates. Hover = line-by-line breakdown.
   - 0 extra Firebase reads or writes. Loaded by the block at the end of console/amazon-name-search.js (aikmOrderFeesJs). */
(function () {
  if (window.__aikmOrderFees) return; window.__aikmOrderFees = true;
  var tries = 0;
  function ready() { try { return typeof ORDER_COLS !== "undefined" && typeof orderRow === "function" && typeof drawOrders === "function"; } catch (e) { return false; } }
  function boot() { if (!ready()) { if (++tries < 80) setTimeout(boot, 250); return; } setup(); }

  var css = document.createElement("style");
  css.textContent = ".fee-c{white-space:nowrap}.fee-src{display:block;font-size:10px;font-weight:600;letter-spacing:.03em;margin-top:2px}" +
    ".fee-src.amz{color:var(--green,#1E7A4B)}.fee-src.est{color:var(--muted,#8B909B);font-weight:500}" +
    ".fee-ref-tag{display:inline-block;font-size:9.5px;font-weight:700;color:var(--amber,#A86A12);background:var(--amber-soft,#FBF1DF);border-radius:4px;padding:0 4px;margin-left:3px}";
  document.head.appendChild(css);

  function f2(v) { return "₹" + (+v).toFixed(2); }

  /* Same estimate the page already used, so we can swap it for Amazon's real numbers */
  function estimate(e, r) {
    var ref = 0, ship = 0, inv = false;
    (e.items || []).forEach(function (it) {
      var i = r.find(it.sku, it.asin, it.title);
      if (i) { inv = true; ref += calcReferralFee(i.amazonProductType, it.price); var f = calcEasyShipWeightFee(i.weightKg, e.isEasyShip); if (f != null) ship += f; }
    });
    return { inv: inv, ref: ref, ship: ship, close: inv ? calcClosingFee(e.total || 0, e.isEasyShip) : 0 };
  }

  function tip(f) {
    var lines = Object.keys(f.types || {}).map(function (t) { return t + ": ₹" + f.types[t]; });
    return "Charged by Amazon (Finance API)" + (f.refunded ? " · includes refund reversal" : "") + "\n" + lines.join("\n") + "\nTotal Amazon fees: ₹" + f.total;
  }

  function setup() {
    /* 1. Columns (after Shipping) */
    if (!ORDER_COLS.some(function (c) { return c.key === "refFee"; })) {
      var at = ORDER_COLS.findIndex(function (c) { return c.key === "ship"; }) + 1;
      ORDER_COLS.splice(at, 0,
        { key: "refFee", label: "Referral fee", num: true, right: true, fmt: function (v) { return "₹" + v.toFixed(2); } },
        { key: "closeFee", label: "Closing fee", num: true, right: true, fmt: function (v) { return "₹" + v.toFixed(2); } });
    }

    /* 2. Row values + NET profit (same maths as the price robot) */
    var pc = ORDER_COLS.find(function (c) { return c.key === "profit"; }); if (pc) pc.label = "Net profit";
    var orig = window.orderRow;
    window.orderRow = function (e, r) {
      var x = orig(e, r), f = e.fees && (e.fees.total || e.fees.ref || e.fees.close || e.fees.refunded) ? e.fees : null, est = estimate(e, r);
      x.feeSrc = f ? "amz" : (est.inv && !e.isCanceled ? "est" : null);
      x.v.refFee = f ? f.ref : x.feeSrc ? est.ref : null;
      x.v.closeFee = f ? f.close : x.feeSrc ? est.close : null;
      x.net = net(e, r, x, f, est);
      x.v.profit = x.net ? x.net.value : null;
      return x;
    };
    function rate(it, inv) {
      if (it.price > 0 && it.tax > 0) return it.tax / (it.price - it.tax);
      var c = inv && inv.taxCode, t = typeof TAXCODE_RATE !== "undefined" && c in TAXCODE_RATE ? TAXCODE_RATE[c] : 5;
      return t / 100;
    }
    function courier(kg) { var n = Math.max(+kg || .5, .5); return n <= 1 ? 40 : 40 + 30 * Math.ceil(n - 1); }
    function net(e, r, x, f, est) {
      var total = parseFloat(e.total), items = e.items || [];
      if (isNaN(total) || !items.length || x.v.cost == null || x.missingCost) return null;
      var itemSum = 0, outGst = 0, base = 0, kg = 0;
      items.forEach(function (it) {
        var inv = r.find(it.sku, it.asin, it.title), g = rate(it, inv), p = +it.price || 0;
        itemSum += p; outGst += it.tax > 0 ? +it.tax : p * g / (1 + g); base += p - (it.tax > 0 ? +it.tax : p * g / (1 + g));
        kg += (inv && +inv.weightKg ? +inv.weightKg : .5) * (+it.qty || 1);
      });
      var g = base > 0 ? outGst / base : .05;
      var shipIn = Math.max(0, total - itemSum), shipGst = shipIn * g / (1 + g);
      var refund = f && f.refundAmt > 0 ? Math.min(f.refundAmt, total) : 0, keep = total > 0 ? (total - refund) / total : 1;
      var gstOut = (outGst + shipGst) * keep, gstIn = x.v.cost * g / (1 + g), gstPay = Math.max(0, gstOut - gstIn);
      var ref = f ? f.ref : est.ref, close = f ? f.close : est.close, other = f ? (f.other || 0) : 0;
      var cour = e.isEasyShip ? (f && f.ship ? f.ship : (est.ship || 55)) : courier(kg), courSrc = e.isEasyShip ? (f && f.ship ? "Amazon Easy Ship fee" : "Easy Ship fee (estimate)") : "courier (estimate ₹40/kg)";
      var value = total - refund - gstPay - x.v.cost - ref - close - other - (f && !e.isEasyShip ? (f.ship || 0) : 0) - cour - 3;
      var L = [["Order total (incl. GST & shipping)", total]];
      if (refund) L.push(["Refunded to buyer", -refund]);
      L.push(["GST payable (₹" + gstOut.toFixed(2) + " collected − ₹" + gstIn.toFixed(2) + " paid on purchase)", -gstPay],
        ["Product cost", -x.v.cost], ["Referral fee" + (f ? "" : " (estimate)"), -ref], ["Closing fee" + (f ? "" : " (estimate)"), -close]);
      if (other) L.push(["Other Amazon fees", -other]);
      if (f && !e.isEasyShip && f.ship) L.push(["Amazon shipping fees", -f.ship]);
      L.push([courSrc.charAt(0).toUpperCase() + courSrc.slice(1), -cour], ["Return buffer", -3]);
      x.v.ship = cour;   /* Shipping column = the courier cost used here */
      return { value: Math.round(value * 100) / 100, lines: L, real: !!f, refunded: !!(f && f.refunded) };
    }

    /* 3. Draw the two cells in each row */
    var draw = window.drawOrders;
    window.drawOrders = function () {
      draw.apply(this, arguments);
      var body = document.getElementById("spapiOrdersBody"); if (!body) return;
      var byId = {}; (CM.rows.orders || []).forEach(function (x) { byId[x.raw.orderId] = x; });
      var at = ORDER_COLS.findIndex(function (c) { return c.key === "refFee"; }), pAt = ORDER_COLS.findIndex(function (c) { return c.key === "profit"; });
      body.querySelectorAll("tr").forEach(function (tr) {
        if (tr.dataset.fees) return;
        var idCell = tr.querySelector("td[data-orig]"), x = idCell && byId[idCell.dataset.orig]; if (!x) return;
        var e = x.raw, f = e.fees, src = x.feeSrc;
        var cell = function (v, isRef) {
          if (v == null) return '<td class="t-r num fee-c"><span class="t-muted">—</span></td>';
          var lbl = src === "amz" ? '<span class="fee-src amz">✓ Amazon</span>' : '<span class="fee-src est">estimate</span>';
          var extra = isRef && src === "amz" && f.refunded ? '<span class="fee-ref-tag" title="Refund posted — fee partly reversed">refund</span>' : "";
          return '<td class="t-r num fee-c"' + (src === "amz" ? ' title="' + escapeHtml(tip(f)) + '"' : ' title="Amazon has not posted the fee yet (it posts after shipment) — page estimate shown"') + ">" + f2(v) + extra + lbl + "</td>";
        };
        var ref = tr.children[at];
        if (!ref) return;
        ref.insertAdjacentHTML("beforebegin", cell(x.v.refFee, true) + cell(x.v.closeFee, false));
        var pcell = tr.children[pAt];
        if (pcell && x.net) {
          pcell.title = x.net.lines.map(function (l) { return l[0] + ":  " + (l[1] < 0 ? "−₹" : "₹") + Math.abs(l[1]).toFixed(2); }).join("\n") + "\n────────\nNet profit:  " + (x.net.value < 0 ? "−₹" : "₹") + Math.abs(x.net.value).toFixed(2) + "\n\nNot deducted: GST on Amazon fees (you claim it back), TCS / TDS (adjusted in your returns).";
          pcell.style.cursor = "help";
          pcell.insertAdjacentHTML("beforeend", '<span class="fee-src ' + (x.net.refunded ? "est" : x.net.real ? "amz" : "est") + '">' + (x.net.refunded ? "refund incl." : x.net.real ? "✓ after tax" : "after tax · est. fees") + "</span>");
        }
        tr.dataset.fees = "1";
      });
    };

    if (typeof spDirty !== "undefined") { spDirty.orders = true; try { spRender(); } catch (e) {} }
  }
  boot();
})();
