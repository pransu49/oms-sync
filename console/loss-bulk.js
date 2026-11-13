/* AIKM \u2014 bulk tick for LOSS orders (owner 13 Nov 2026: "one by one takes too much time").
   Adds ONE bar above every self-ship table that has loss orders:
     Amazon shipping confirmation (#cfTable) \u00b7 ProShip (#psTable) \u00b7 NimbusPost file (#nbTable) \u00b7 Zippy file (#zpTable)
   Rules: loss up to \u20b920 / \u20b935 / \u20b940 / any amount, product name contains\u2026, account.
   Works only through the table's own checkboxes (same as clicking them), so every panel's own checks still apply
   (e.g. the loss confirmation box before shipping / making the file). No Firebase reads or writes.
   Loaded by the block at the end of console/proship-tab.js (aikmLossBulkJs). */
(function () {
  if (window.__aikmLossBulk) return; window.__aikmLossBulk = true;
  var TABLES = ["cfTable", "psTable", "nbTable", "zpTable"];
  var CHIPS = [20, 35, 40];

  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; } // no needless DOM changes (the observer would loop)
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var css = document.createElement("style");
  css.textContent =
    "html#aikm body .lb-bar,.lb-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 12px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--x-red,#c0392b) 30%,transparent);" +
    "border-radius:12px;background:var(--x-red-soft,#fbeae7);font-size:12.5px;}" +
    ".lb-bar .lb-t{font-weight:700;color:var(--x-red,#c0392b);margin-right:4px;white-space:nowrap;}" +
    ".lb-bar button.lb-chip{all:unset;cursor:pointer;padding:5px 11px;border-radius:20px;background:var(--x-surface,#fff);border:1px solid var(--x-line,#e7e2d3);font-weight:600;font-size:12px;white-space:nowrap;}" +
    ".lb-bar button.lb-chip.on{background:var(--x-primary,#0F1E35);color:var(--x-primary-ink,#F5F4EC);border-color:var(--x-primary,#0F1E35);}" +
    ".lb-bar button.lb-chip span{opacity:.65;margin-left:4px;font-weight:500;}" +
    ".lb-bar input,.lb-bar select{height:32px !important;min-height:32px !important;padding:0 10px !important;border-radius:8px !important;font-size:12.5px !important;box-sizing:border-box;}" +
    ".lb-bar input.lb-max{width:110px !important;}.lb-bar input.lb-q{width:220px !important;}" +
    ".lb-bar button.lb-go{all:unset;cursor:pointer;padding:7px 14px;border-radius:8px;background:#D4AF37;color:#1A1405;font-weight:700;font-size:12.5px;white-space:nowrap;}" +
    ".lb-bar button.lb-go[disabled]{opacity:.45;cursor:default;}" +
    ".lb-bar button.lb-off{all:unset;cursor:pointer;padding:7px 12px;border-radius:8px;border:1px solid var(--x-line,#e7e2d3);background:var(--x-surface,#fff);font-weight:600;font-size:12px;white-space:nowrap;}" +
    ".lb-bar .lb-auto{flex-basis:100%;display:flex;align-items:center;gap:6px;font-weight:600;color:var(--x-text,#0F1E35);padding-top:6px;border-top:1px dashed color-mix(in srgb,var(--x-red,#c0392b) 25%,transparent);}" +
    ".lb-bar .lb-auto input.lb-auto-on{width:16px;height:16px;accent-color:#D4AF37;}.lb-bar .lb-auto input.lb-auto-max{width:72px !important;}" +
    ".lb-bar .lb-n{color:var(--x-text-2,#3b4659);white-space:nowrap;}";
  document.head.appendChild(css);

  /* ---- read the loss rows straight from the table ---- */
  function lossRows(table) {
    var out = [];
    table.querySelectorAll("tbody tr.nb-row-loss").forEach(function (tr) {
      var cb = tr.querySelector('input[type="checkbox"][data-i]');
      if (!cb || cb.disabled) return;
      var txt = tr.textContent || "";
      var m = txt.match(/LOSS\s*[\u00b7.:-]?\s*-?\s*\u20b9?\s*-?\s*([\d,]+(?:\.\d+)?)/i);
      var items = tr.querySelector(".nb-items, .ps-items");
      var cells = tr.querySelectorAll("td");
      var acct = "";
      for (var c = 0; c < cells.length && !acct; c++) {
        var cx = cells[c].querySelector(".cx-awb");
        if (cx && cx.nextElementSibling && /nb-muted/.test(cx.nextElementSibling.className)) acct = (cx.nextElementSibling.textContent || "").trim();
      }
      out.push({ i: cb.getAttribute("data-i"), cls: cb.className, on: cb.checked, loss: m ? parseFloat(m[1].replace(/,/g, "")) : 0,
        items: (items ? items.textContent : txt).toLowerCase(), acct: acct });
    });
    return out;
  }

  function match(r, st) {
    if (st.max !== "" && !(r.loss <= +st.max)) return false;
    if (st.q) { var words = st.q.toLowerCase().split(/\s+/).filter(Boolean); if (!words.every(function (w) { return r.items.indexOf(w) >= 0; })) return false; }
    if (st.acct && r.acct.toLowerCase() !== st.acct.toLowerCase()) return false;
    return true;
  }

  /* ---- tick / untick FAST (owner 13 Nov 2026: was slow) ----
     Each panel re-draws ALL rows after every single tick (~1,200 rows x 200 ticks). Every panel's draw starts with
     document.getElementById("<x>Kpis") \u2014 so while we tick, that box gets another id: the draw stops at once (after the
     row is already ticked), and ONE normal draw runs at the end. The errors of the stopped draws are hidden. */
  var KPI = { cfTable: "cfKpis", psTable: "psKpis", nbTable: "nbKpis", zpTable: "zpKpis" };
  var muting = false;
  window.addEventListener("error", function (e) { if (muting) { e.preventDefault(); e.stopImmediatePropagation(); return true; } }, true);
  function apply(table, list, on, bar, done) {
    if (!list.length) { done(); return; }
    var cls = list[0].cls.split(" ")[0], kpi = document.getElementById(KPI[table.id] || ""), last = null;
    bar.classList.add("lb-busy");
    muting = true;
    if (kpi) kpi.id = kpi.id + "__lbwait";
    try {
      list.forEach(function (r) {
        var cb = table.querySelector("input." + cls + '[data-i="' + r.i + '"]');
        if (cb && !cb.disabled && cb.checked !== on) { cb.checked = on; try { cb.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} last = cb; }
      });
    } finally {
      if (kpi) kpi.id = KPI[table.id];
      muting = false;
    }
    // one real draw with everything ticked
    if (last) { var cb = table.querySelector("input." + cls + '[data-i="' + last.getAttribute("data-i") + '"]') || last; try { cb.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} }
    bar.classList.remove("lb-busy");
    done();
  }

  /* ---- automatic rule: "ship loss orders up to \u20b9X" (saved on this computer; default \u20b940) ---- */
  var AUTO_KEY = "aikm_loss_auto";
  function autoMax() { try { var v = localStorage.getItem(AUTO_KEY); return v === null ? "40" : v; } catch (e) { return "40"; } }
  function setAuto(v) { try { localStorage.setItem(AUTO_KEY, v); } catch (e) {} }
  var autoDone = {}; // table|order id -> already auto-ticked once (a manual untick afterwards is respected)
  function rowId(table, i) { var cb = table.querySelector('input[data-i="' + i + '"]'), tr = cb && cb.closest("tr"), x = tr && tr.querySelector(".cx-awb"); return x ? x.textContent.trim() : "i" + i; }
  function runAuto(id) {
    var max = autoMax(); if (max === "") return;
    var table = document.getElementById(id), anchor = table && (table.closest(".table-scroll") || table), bar = anchor && anchor.previousElementSibling;
    if (!bar || !bar.classList.contains("lb-bar") || bar.classList.contains("lb-busy")) return;
    var list = lossRows(table).filter(function (r) {
      if (r.on || !(r.loss <= +max)) return false;
      var k = id + "|" + rowId(table, r.i); if (autoDone[k]) return false; autoDone[k] = 1; return true;
    });
    if (list.length) apply(table, list, true, bar, function () { refresh(id); });
  }

  /* ---- one bar per table ---- */
  function ensure(id) {
    var table = document.getElementById(id); if (!table) return;
    var anchor = table.closest(".table-scroll") || table;
    var bar = anchor.previousElementSibling && anchor.previousElementSibling.classList.contains("lb-bar") ? anchor.previousElementSibling : null;
    var rows = lossRows(table);
    if (!bar) {
      if (!rows.length && !table.querySelector("tbody tr.nb-row-loss")) return;
      bar = document.createElement("div"); bar.className = "lb-bar no-print"; bar.dataset.for = id;
      bar.innerHTML =
        '<span class="lb-t">Loss orders</span>' +
        CHIPS.map(function (v) { return '<button type="button" class="lb-chip" data-max="' + v + '">Loss up to \u20b9' + v + '<span></span></button>'; }).join("") +
        '<button type="button" class="lb-chip" data-max="">Any loss<span></span></button>' +
        '<input type="number" class="lb-max" min="0" step="1" placeholder="Max \u20b9 loss" title="Loss up to this amount">' +
        '<input type="text" class="lb-q" placeholder="Product name contains\u2026" autocomplete="off">' +
        '<select class="lb-acct"><option value="">All accounts</option></select>' +
        '<button type="button" class="lb-go">Tick</button>' +
        '<button type="button" class="lb-off">Untick all loss</button>' +
        '<span class="lb-n"></span>' +
        '<label class="lb-auto" title="Saved on this computer"><input type="checkbox" class="lb-auto-on"> Always tick loss orders up to \u20b9' +
        '<input type="number" class="lb-auto-max" min="0" step="1"> automatically</label>';
      anchor.parentNode.insertBefore(bar, anchor);
      bar._st = { max: "", q: "", acct: "" };
      var maxI = bar.querySelector(".lb-max"), qI = bar.querySelector(".lb-q"), aS = bar.querySelector(".lb-acct");
      bar.querySelectorAll(".lb-chip").forEach(function (b) {
        b.addEventListener("click", function () { bar._st.max = b.dataset.max; maxI.value = b.dataset.max; refresh(id); });
      });
      maxI.addEventListener("input", function () { bar._st.max = maxI.value.trim(); refresh(id); });
      qI.addEventListener("input", function () { bar._st.q = qI.value.trim(); refresh(id); });
      aS.addEventListener("change", function () { bar._st.acct = aS.value; refresh(id); });
      bar.querySelector(".lb-go").addEventListener("click", function () {
        var list = lossRows(table).filter(function (r) { return !r.on && match(r, bar._st); });
        if (!list.length) return;
        apply(table, list, true, bar, function () { refresh(id); });
      });
      var aOn = bar.querySelector(".lb-auto-on"), aMax = bar.querySelector(".lb-auto-max");
      var am = autoMax(); aOn.checked = am !== ""; aMax.value = am || "40";
      function saveAuto() { setAuto(aOn.checked ? (aMax.value.trim() || "40") : ""); autoDone = {}; document.querySelectorAll(".lb-bar").forEach(function (b2) { syncAuto(b2); }); TABLES.forEach(runAuto); }
      aOn.addEventListener("change", saveAuto);
      aMax.addEventListener("change", saveAuto);
      bar.querySelector(".lb-off").addEventListener("click", function () {
        var list = lossRows(table).filter(function (r) { return r.on; });
        if (!list.length) return;
        apply(table, list, false, bar, function () { refresh(id); });
      });
    }
    refresh(id, rows);
  }

  function syncAuto(bar) { var am = autoMax(), on = bar.querySelector(".lb-auto-on"), mx = bar.querySelector(".lb-auto-max");
    if (on && document.activeElement !== mx) { on.checked = am !== ""; if (am) mx.value = am; } }
  function refresh(id, rows) {
    var table = document.getElementById(id); if (!table) return;
    var anchor = table.closest(".table-scroll") || table, bar = anchor.previousElementSibling;
    if (!bar || !bar.classList.contains("lb-bar") || bar.classList.contains("lb-busy")) return;
    rows = rows || lossRows(table);
    bar.style.display = rows.length ? "" : "none";
    if (!rows.length) return;
    var st = bar._st;
    bar.querySelectorAll(".lb-chip").forEach(function (b) {
      var v = b.dataset.max, n = rows.filter(function (r) { return v === "" || r.loss <= +v; }).length;
      setText(b.querySelector("span"), "\u00b7 " + n);
      b.classList.toggle("on", st.max === v && (v !== "" || bar.querySelector(".lb-max").value === ""));
    });
    var aS = bar.querySelector(".lb-acct"), accts = {};
    rows.forEach(function (r) { if (r.acct) accts[r.acct] = 1; });
    var want = '<option value="">All accounts</option>' + Object.keys(accts).sort().map(function (a) { return '<option value="' + esc(a) + '"' + (a === st.acct ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("");
    if (aS._last !== want) { aS.innerHTML = want; aS._last = want; }
    var m = rows.filter(function (r) { return match(r, st); }), todo = m.filter(function (r) { return !r.on; }).length, on = rows.filter(function (r) { return r.on; }).length;
    var go = bar.querySelector(".lb-go");
    setText(go, todo ? "Tick " + todo + " loss order" + (todo > 1 ? "s" : "") : "Tick");
    go.disabled = !todo;
    bar.querySelector(".lb-off").style.display = on ? "" : "none";
    setText(bar.querySelector(".lb-n"), rows.length + " loss orders \u00b7 " + on + " ticked" + (m.length !== rows.length ? " \u00b7 " + m.length + " match" : ""));
  }

  /* ---- keep the bars in step with the tables (they re-draw on every change) ---- */
  var pending = false;
  function scan() { pending = false; TABLES.forEach(ensure); TABLES.forEach(runAuto); }
  new MutationObserver(function () { if (!pending) { pending = true; setTimeout(scan, 250); } })
    .observe(document.body, { childList: true, subtree: true });
  scan();
})();
