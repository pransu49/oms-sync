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
  function setMax(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; } // only real changes (the observer would loop)

  var css = document.createElement("style");
  css.textContent =
    ".lb-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0 12px;padding:9px 14px;border-radius:12px;font-size:13px;" +
    "border:1px solid color-mix(in srgb,var(--x-red,#c0392b) 30%,transparent);background:var(--x-red-soft,#fbeae7);}" +
    ".lb-bar b{color:var(--x-red,#c0392b);}" +
    ".lb-bar input.lb-max{width:84px !important;height:32px !important;min-height:32px !important;padding:0 10px !important;border-radius:8px !important;" +
    "font-size:13px !important;font-weight:700 !important;box-sizing:border-box;}" +
    ".lb-bar .lb-n{color:var(--x-text-2,#3b4659);margin-left:auto;white-space:nowrap;}";
  document.head.appendChild(css);

  /* ---- loss rows, read from the table ---- */
  function rowsOf(table) {
    var out = [];
    table.querySelectorAll("tbody tr.nb-row-loss").forEach(function (tr) {
      var cb = tr.querySelector('input[type="checkbox"][data-i]');
      if (!cb || cb.disabled) return;
      var m = (tr.textContent || "").match(/LOSS\s*[\u00b7.:-]?\s*-?\s*\u20b9?\s*-?\s*([\d,]+(?:\.\d+)?)/i);
      var x = tr.querySelector(".cx-awb");
      out.push({ i: cb.getAttribute("data-i"), cls: cb.className.split(" ")[0], on: cb.checked,
        loss: m ? parseFloat(m[1].replace(/,/g, "")) : 0, id: x ? x.textContent.trim() : "i" + cb.getAttribute("data-i") });
    });
    return out;
  }

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
      var want = r.loss > +max;
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
      if (!table.querySelector("tbody tr.nb-row-loss")) return;
      var anchor = table.closest(".table-scroll") || table;
      bar = document.createElement("div"); bar.className = "lb-bar no-print";
      bar.innerHTML = '<b>Loss orders</b><span>Ship loss orders with loss above \u20b9</span>' +
        '<input type="number" class="lb-max" min="0" step="1" title="Loss orders above this amount are ticked to ship. Empty = tick by hand.">' +
        '<span class="lb-n"></span>';
      anchor.parentNode.insertBefore(bar, anchor);
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
    var rows = rowsOf(table);
    bar.style.display = rows.length ? "" : "none";
    var on = rows.filter(function (r) { return r.on; }).length;
    setText(bar.querySelector(".lb-n"), rows.length + " loss orders \u00b7 " + on + " ticked to ship");
  }

  var pending = false;
  function scan() { pending = false; TABLES.forEach(ensure); }
  new MutationObserver(function () { if (!pending && !muting) { pending = true; setTimeout(scan, 250); } })
    .observe(document.body, { childList: true, subtree: true });
  scan();
})();
