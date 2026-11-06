/* AIKM · Amazon page · Orders tab: real Referral fee + Closing fee (owner, 6 Nov 2026)
   Fees come from Amazon's Finance API (saved on each order by spapi-sync.js -> order.fees, snapshot only).
   - Adds "Referral fee" and "Closing fee" columns (sortable / filterable like the others).
   - Est. profit uses Amazon's real fees when they are posted (after shipment); until then the old estimate is used.
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

    /* 2. Row values + profit with real fees */
    var orig = window.orderRow;
    window.orderRow = function (e, r) {
      var x = orig(e, r), f = e.fees, est = estimate(e, r);
      if (f && (f.total || f.ref || f.close)) {
        x.v.refFee = f.ref; x.v.closeFee = f.close; x.feeSrc = "amz";
        if (x.v.profit != null) {
          /* swap estimated fees for Amazon's: referral + closing always; Easy Ship fee too when Amazon charged one */
          var shipSwap = e.isEasyShip && f.ship ? est.ship - f.ship : 0;
          x.v.profit = x.v.profit + est.ref + est.close - f.ref - f.close - (f.other || 0) + shipSwap;
        }
      } else if (est.inv && !e.isCanceled) {
        x.v.refFee = est.ref; x.v.closeFee = est.close; x.feeSrc = "est";
      } else { x.v.refFee = null; x.v.closeFee = null; x.feeSrc = null; }
      return x;
    };

    /* 3. Draw the two cells in each row */
    var draw = window.drawOrders;
    window.drawOrders = function () {
      draw.apply(this, arguments);
      var body = document.getElementById("spapiOrdersBody"); if (!body) return;
      var byId = {}; (CM.rows.orders || []).forEach(function (x) { byId[x.raw.orderId] = x; });
      var at = ORDER_COLS.findIndex(function (c) { return c.key === "refFee"; });
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
        tr.dataset.fees = "1";
      });
    };

    if (typeof spDirty !== "undefined") { spDirty.orders = true; try { spRender(); } catch (e) {} }
  }
  boot();
})();
