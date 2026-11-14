/* AIKM - loss-order rule bar (owner 13 Nov 2026).
   ONE small bar above every self-ship table that has loss orders:
     Amazon shipping confirmation (#cfTable), ProShip (#psTable), NimbusPost file (#nbTable), Zippy file (#zpTable)
   Rule: "Ship loss orders with loss ABOVE Rs [40]" - those are ticked automatically, loss orders at or below the amount
   are unticked. The amount is always editable (saved on this computer, localStorage aikm_loss_above). Empty = rule off.
   Each order is set by the rule once, so a manual tick / untick afterwards stays (changing the amount re-applies it).
   Works only through the table's own checkboxes, so every panel's own loss confirmation still runs. 0 Firebase.
   FAST: while ticking, the panel's <x>Kpis box is renamed so each per-tick redraw stops at its first line;
   ONE normal redraw at the end. Loaded by the block at the end of console/proship-tab.js (aikmLossBulkJs). */
(function () {
  if (window.__aikmLossBulk) return; window.__aikmLossBulk = true;
  var KPI = { cfTable: "cfKpis", psTable: "psKpis", nbTable: "nbKpis", zpTable: "zpKpis" };
  var TABLES = Object.keys(KPI);
  var KEY = "aikm_loss_above";

  function getMax() { try { var v = localStorage.getItem(KEY); return v === null ? "40" : v; } catch (e) { return "40"; } }
  function setMax(v) { try { localStorage.setItem(KEY, v); } catch (e) {} try { clearTimeout(setMax._t); setMax._t = setTimeout(function () { window.dispatchEvent(new Event("aikm-loss-limit")); }, 500); } catch (e) {} }
  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; } // only real changes (the observer would loop)

  var css = document.createElement("style");
  css.textContent =
    ".lb-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0 12px;padding:9px 14px;border-radius:12px;font-size:13px;" +
    "border:1px solid color-mix(in srgb,var(--x-red,#c0392b) 30%,transparent);background:var(--x-red-soft,#fbeae7);}" +
    ".lb-bar b{color:var(--x-red,#c0392b);}" +
    ".lb-bar input.lb-max{width:84px !important;height:32px !important;min-height:32px !important;padding:0 10px !important;border-radius:8px !important;" +
    "font-size:13px !important;font-weight:700 !important;box-sizing:border-box;}" +
    ".lb-bar .lb-row2{flex-basis:100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;}" +
    ".lb-bar .lb-row2 b{color:var(--x-text,#0F1E35);}" +
    ".lb-bar input.lb-q{width:280px !important;height:32px !important;min-height:32px !important;padding:0 10px !important;border-radius:8px !important;font-size:13px !important;box-sizing:border-box;}" +
    ".lb-bar button.lb-tick,.lb-bar button.lb-untick{all:unset;cursor:pointer;padding:7px 14px;border-radius:8px;font-weight:700;font-size:12.5px;white-space:nowrap;}" +
    ".lb-bar button.lb-tick{background:#D4AF37;color:#1A1405;}.lb-bar button.lb-untick{background:var(--x-surface,#fff);border:1px solid var(--x-line,#e7e2d3);}" +
    ".lb-bar .lb-ship{margin-left:auto;white-space:nowrap;font-weight:600;}.lb-bar .lb-ok{color:var(--x-green,#1f8a4c);}.lb-bar .lb-no{color:var(--x-red,#c0392b);}" +
    ".lb-bar .lb-mt{color:var(--x-text-2,#3b4659);font-weight:500;}" +
    ".lb-bar .lb-n{color:var(--x-text-2,#3b4659);margin-left:auto;white-space:nowrap;}";
  document.head.appendChild(css);

  /* ---- loss rows, read from the table ---- */
  function rowsOf(table) {
    var out = [];
    table.querySelectorAll("tbody tr.nb-row-loss").forEach(function (tr) {
      var cb = tr.querySelector('input[type="checkbox"][data-i]');
      if (!cb || cb.disabled) return;
      // the tag shows PROFIT: "LOSS \u00b7 \u20b942" = +42 (low profit), "LOSS \u00b7 \u20b9-43" = a real loss of 43
      var m = (tr.textContent || "").match(/LOSS\s*\u00b7?\s*(-?)\s*\u20b9\s*(-?)\s*([\d,]+(?:\.\d+)?)/i);
      var x = tr.querySelector(".cx-awb");
      out.push({ i: cb.getAttribute("data-i"), cls: cb.className.split(" ")[0], on: cb.checked,
        profit: m ? (m[1] || m[2] ? -1 : 1) * parseFloat(m[3].replace(/,/g, "")) : -Infinity, id: x ? x.textContent.trim() : "i" + cb.getAttribute("data-i") });
    });
    return out;
  }

  /* ---- every order row (for the product search + the ship / not-shipped counts) ---- */
  function allRows(table) {
    var out = [];
    table.querySelectorAll('tbody input[type="checkbox"][data-i]').forEach(function (cb) {
      if (cb.disabled) return;
      var tr = cb.closest("tr"), it = tr && tr.querySelector(".nb-items, .ps-items, .zp-items");
      out.push({ i: cb.getAttribute("data-i"), cls: cb.className.split(" ")[0], on: cb.checked,
        items: ((it || tr || {}).textContent || "").toLowerCase() });
    });
    return out;
  }
  function hit(r, q) { var w = q.toLowerCase().split(/\s+/).filter(Boolean); return w.length && w.every(function (x) { return r.items.indexOf(x) >= 0; }); }

  /* ---- set checkboxes fast ---- */
  var muting = false;
  window.addEventListener("error", function (e) { if (muting) { e.preventDefault(); e.stopImmediatePropagation(); return true; } }, true);
  function setBoxes(table, list) { // list: [{row, on}]
    if (!list.length) return;
    var kpi = document.getElementById(KPI[table.id]), last = null;
    muting = true; if (kpi) kpi.id = kpi.id + "__lbwait";
    try {
      list.forEach(function (x) {
        var cb = table.querySelector("input." + x.row.cls + '[data-i="' + x.row.i + '"]');
        if (cb && !cb.disabled && cb.checked !== x.on) { cb.checked = x.on; try { cb.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} last = cb; }
      });
    } finally { if (kpi) kpi.id = KPI[table.id]; muting = false; }
    if (last) try { last.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} // one real redraw
  }

  /* ---- apply the rule (each order once per amount; changing the amount applies it again) ---- */
  var done = {};
  function apply(id) {
    var table = document.getElementById(id); if (!table) return;
    var max = getMax(), list = [];
    if (max !== "") rowsOf(table).forEach(function (r) {
      var k = id + "|" + r.id; if (done[k] === max) return; done[k] = max; // set once per amount
      var want = r.profit > +max; // minus (real loss) is never above the amount -> never ticked
      if (r.on !== want) list.push({ row: r, on: want });
    });
    setBoxes(table, list);
    paint(id);
  }

  /* ---- the bar ---- */
  function barOf(table) { var a = table.closest(".table-scroll") || table, b = a.previousElementSibling; return b && b.classList.contains("lb-bar") ? b : null; }
  function ensure(id) {
    var table = document.getElementById(id); if (!table) return;
    var bar = barOf(table);
    if (!bar) {
      if (!table.querySelector('tbody input[type="checkbox"][data-i]')) return;
      var anchor = table.closest(".table-scroll") || table;
      bar = document.createElement("div"); bar.className = "lb-bar no-print";
      bar.innerHTML = '<b class="lb-loss">Loss orders</b><span class="lb-loss">Ship them only when profit is above \u20b9</span>' +
        '<input type="number" class="lb-max lb-loss" min="0" step="1" title="Flagged orders with profit above this amount are ticked to ship. Minus amounts (real loss) are never ticked. Empty = tick by hand.">' +
        '<span class="lb-n lb-loss"></span>' +
        '<div class="lb-row2"><b>Product</b><input type="text" class="lb-q" placeholder="Product name, e.g. exo dishwash" autocomplete="off">' +
        '<button type="button" class="lb-tick">Tick</button><button type="button" class="lb-untick">Untick</button>' +
        '<span class="lb-ship"></span></div>';
      anchor.parentNode.insertBefore(bar, anchor);
      var q = bar.querySelector(".lb-q");
      q.addEventListener("input", function () { paint(id); });
      function bulk(on) { var v = q.value.trim(); if (!v) { q.focus(); return; }
        setBoxes(table, allRows(table).filter(function (r) { return r.on !== on && hit(r, v); }).map(function (r) { return { row: r, on: on }; })); paint(id); }
      bar.querySelector(".lb-tick").addEventListener("click", function () { bulk(true); });
      bar.querySelector(".lb-untick").addEventListener("click", function () { bulk(false); });
      var inp = bar.querySelector(".lb-max"), t;
      inp.value = getMax();
      inp.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () {
          setMax(inp.value.trim());
          document.querySelectorAll(".lb-bar .lb-max").forEach(function (o) { if (o !== inp) o.value = inp.value; });
          TABLES.forEach(apply);
        }, 500);
      });
    }
    apply(id);
  }
  function paint(id) {
    var table = document.getElementById(id), bar = table && barOf(table); if (!bar) return;
    var rows = rowsOf(table), all = allRows(table);
    bar.style.display = all.length ? "" : "none";
    bar.querySelectorAll(".lb-loss").forEach(function (x) { x.style.display = rows.length ? "" : "none"; });
    var on = rows.filter(function (r) { return r.on; }).length, ship = all.filter(function (r) { return r.on; }).length;
    var q = bar.querySelector(".lb-q").value.trim(), m = q ? all.filter(function (r) { return hit(r, q); }) : [];
    var mOn = m.filter(function (r) { return r.on; }).length;
    setText(bar.querySelector(".lb-tick"), q ? "Tick " + (m.length - mOn) : "Tick");
    setText(bar.querySelector(".lb-untick"), q ? "Untick " + mOn : "Untick");
    var html = (q ? '<span class="lb-mt">' + m.length + " match \u00b7 </span>" : "") +
      '<span class="lb-ok">Ship ' + ship + '</span> \u00b7 <span class="lb-no">Not shipped ' + (all.length - ship) + "</span>";
    var sh = bar.querySelector(".lb-ship"); if (sh.innerHTML !== html) sh.innerHTML = html;
    setText(bar.querySelector(".lb-n"), rows.length + " flagged \u00b7 " + on + " ticked to ship \u00b7 " + rows.filter(function (r) { return r.profit < 0; }).length + " real loss (minus)");
  }

  var pending = false;
  function scan() { pending = false; TABLES.forEach(ensure); }
  new MutationObserver(function () { if (!pending && !muting) { pending = true; setTimeout(scan, 250); } })
    .observe(document.body, { childList: true, subtree: true });
  scan();
})();
