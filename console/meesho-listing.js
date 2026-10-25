/* ===== Amazon page (dalbhaat.in/pages/amazon) · Meesho Listing tab: Meesho Listing Robot =====
   Loaded by the block at the end of console/amazon-name-search.js (aikmMeeshoListingJs).
   1. Pick Amazon products (this account's inventory).
   2. Drop in ANY Meesho bulk-upload template (any category) - the tab reads its columns and dropdowns itself.
   3. Fill file: details come from Amazon (meesho-robot.js reads the catalogue -> spapiSnapshots/meesho_<ASIN>),
      columns are matched by name, dropdown columns get a valid Meesho choice, the rest is shown to pick.
   4. Download - the same template with only the product rows written in (dropdowns, hidden sheets kept). */
(function () {
  if (window.__aikmMeeshoListing) return; window.__aikmMeeshoListing = true;
  var ID = "meesho", REPO = "pransu49/oms-sync", WF = "meesho-robot.yml", TK = "aikm_gh_sync_token", SK = "aikm_meesho_settings";
  var JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  var NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  var MAX = 100, FRESH_MS = 30 * 864e5;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, bad) { try { spToast(m, bad); } catch (e) { alert(m); } };
  var inv = function () { try { return spapiInventoryRaw || []; } catch (e) { return []; } };
  var acct = function () { try { return spapiCurrentAccount; } catch (e) { return "praso"; } };
  var spDb = function () { try { return fbDbSpapi || null; } catch (e) { return null; } };
  var mainDb = function () { try { return fbDb || null; } catch (e) { return null; } };

  /* ---------- state ---------- */
  var pick = new Map();          // asin -> inventory item
  var q = "", tpl = null, grid = null, onlyNeed = true, busy = false;
  var S = loadSet();
  function loadSet() {
    var d = { pct: 0, stock: 10, brand: "", mfr: "", packer: "", importer: "", country: "India" };
    try { var s = JSON.parse(localStorage.getItem(SK) || "{}"); Object.keys(d).forEach(function (k) { if (s[k] != null) d[k] = s[k]; }); } catch (e) {}
    return d;
  }
  function saveSet() { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) {} }

  /* ---------- styles ---------- */
  function css() {
    if ($("msCss")) return;
    var st = document.createElement("style"); st.id = "msCss";
    st.textContent = [
      "#msBody{padding:0;font-family:'Inter',sans-serif;color:var(--ink)}",
      ".ms-hd{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--line-2)}",
      ".ms-hd h3{margin:0;font:600 17px 'Inter',sans-serif;color:var(--ink)}",
      ".ms-hd p{margin:3px 0 0;font-size:12.5px;color:var(--muted)}",
      ".ms-steps{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}",
      ".ms-st{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:20px;border:1px solid var(--line-2);font-size:12px;color:var(--muted);background:#fff}",
      ".ms-st b{width:18px;height:18px;border-radius:50%;background:#EEEBE3;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;font-size:11px}",
      ".ms-st.ok{color:var(--ink);border-color:rgba(201,162,75,.5);background:var(--gold-soft,#F7F1E3)}.ms-st.ok b{background:var(--navy);color:#fff}",
      ".ms-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:0}",
      ".ms-col{padding:16px 22px;min-width:0}.ms-col+.ms-col{border-left:1px solid var(--line-2)}",
      ".ms-lbl{font:600 12px 'Inter',sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;display:flex;align-items:center;gap:8px}",
      ".ms-lbl span{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500}",
      ".ms-in{width:100%;box-sizing:border-box;height:40px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font:13.5px 'Inter',sans-serif;color:var(--ink);background:#FCFBF8;outline:none}",
      ".ms-in:focus{background:#fff;border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.14)}",
      ".ms-list{margin-top:10px;max-height:380px;overflow:auto;border:1px solid var(--line-2);border-radius:12px}",
      ".ms-it{display:flex;align-items:center;gap:12px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--line-2)}",
      ".ms-it:last-child{border-bottom:0}.ms-it:hover{background:#FAF8F3}.ms-it.on{background:var(--gold-soft,#F7F1E3)}",
      ".ms-ck{width:18px;height:18px;border-radius:5px;border:1.5px solid #C9C7BF;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;line-height:1}",
      ".ms-it.on .ms-ck{background:var(--navy);border-color:var(--navy)}",
      ".ms-im{width:40px;height:40px;border-radius:8px;border:1px solid var(--line-2);background:#fff;flex:none;overflow:hidden}",
      ".ms-im img{width:100%;height:100%;object-fit:contain}",
      ".ms-nm{flex:1;min-width:0}.ms-nm b{display:block;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".ms-nm small{font-size:11.5px;color:var(--muted)}",
      ".ms-pr{font-size:12.5px;font-weight:600;white-space:nowrap}",
      ".ms-lnk{all:unset;cursor:pointer;color:var(--navy);font-weight:600;font-size:12px}.ms-lnk:hover{text-decoration:underline}",
      ".ms-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:22px 16px;border:1.5px dashed #D6D1C4;border-radius:14px;background:#FCFBF8;cursor:pointer;transition:border-color .15s,background .15s}",
      ".ms-drop:hover,.ms-drop.over{border-color:var(--gold);background:#fff}",
      ".ms-drop i{font-size:26px;color:var(--gold)}.ms-drop b{font-size:13.5px}.ms-drop small{font-size:12px;color:var(--muted)}",
      ".ms-tpl{margin-top:10px;padding:10px 12px;border-radius:10px;background:#F3F7F2;color:#2E5E3E;font-size:12.5px;line-height:1.6}",
      ".ms-tpl.bad{background:#FBEDEB;color:#9B2C22}",
      ".ms-set{margin-top:16px;border:1px solid var(--line-2);border-radius:12px}",
      ".ms-set summary{cursor:pointer;padding:11px 14px;font-weight:600;font-size:13px;list-style:none}",
      ".ms-set summary::-webkit-details-marker{display:none}",
      ".ms-set summary small{font-weight:400;color:var(--muted);margin-left:6px}",
      ".ms-sg{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 14px 14px}",
      ".ms-sg label{font-size:11.5px;color:var(--muted);display:flex;flex-direction:column;gap:4px}",
      ".ms-sg label.w{grid-column:1/-1}",
      ".ms-sg input,.ms-sg textarea{box-sizing:border-box;width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:13px 'Inter',sans-serif;color:var(--ink);background:#fff;outline:none}",
      ".ms-sg textarea{min-height:52px;resize:vertical}",
      ".ms-go{all:unset;box-sizing:border-box;cursor:pointer;margin-top:16px;width:100%;height:46px;border-radius:12px;background:var(--navy);color:#fff;font:600 14px 'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px}",
      ".ms-go:hover{opacity:.93}.ms-go.dim{opacity:.35;pointer-events:none}.ms-go.gold{background:var(--gold);color:var(--navy)}",
      ".ms-note{margin-top:8px;font-size:12px;color:var(--muted);text-align:center;min-height:16px}",
      ".ms-res{border-top:1px solid var(--line-2);padding:16px 22px}",
      ".ms-sum{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}",
      ".ms-pill{padding:6px 11px;border-radius:20px;font-size:12.5px;font-weight:600}",
      ".ms-pill.g{background:#EAF4EC;color:#2E7D4F}.ms-pill.y{background:#FFF4D6;color:#8A6200}.ms-pill.n{background:#F1EFEA;color:var(--muted)}",
      ".ms-sum .ms-go{width:auto;margin:0 0 0 auto;padding:0 22px;height:42px}",
      ".ms-tw{overflow:auto;max-height:62vh;border:1px solid var(--line-2);border-radius:12px}",
      ".ms-t{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%}",
      ".ms-t th,.ms-t td{border-bottom:1px solid var(--line-2);border-right:1px solid var(--line-2);padding:6px 8px;vertical-align:top;background:#fff}",
      ".ms-t thead th{position:sticky;top:0;z-index:2;background:#FAF8F3;text-align:left;font-weight:600;min-width:150px;max-width:240px}",
      ".ms-t th.p,.ms-t td.p{position:sticky;left:0;z-index:1;min-width:190px;max-width:220px;background:#FCFBF8}",
      ".ms-t thead th.p{z-index:3}",
      ".ms-t th small{display:block;font-weight:400;color:var(--muted);font-size:11px;margin-top:2px}",
      ".ms-req{color:#B4382F;margin-left:3px}",
      ".ms-all{display:flex;gap:4px;margin-top:6px}.ms-all input{flex:1;min-width:0;height:28px;border:1px solid var(--line);border-radius:7px;padding:0 7px;font-size:12px}",
      ".ms-all button{all:unset;cursor:pointer;height:28px;padding:0 8px;border-radius:7px;background:var(--navy);color:#fff;font-size:11.5px;font-weight:600}",
      ".ms-c{width:100%;box-sizing:border-box;border:1px solid transparent;border-radius:6px;padding:4px 6px;font:12.5px 'Inter',sans-serif;color:var(--ink);background:transparent;outline:none}",
      ".ms-c:hover{border-color:var(--line)}.ms-c:focus{border-color:var(--gold);background:#fff}",
      "td.need{background:#FFF8E1}td.need .ms-c{border-color:#E9C46A;background:#fff}",
      "td.bad .ms-c{border-color:#D9534F}",
      ".ms-pn{font-weight:600;font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
      ".ms-pn+small{color:var(--muted);font-size:11px}",
      ".ms-bar{height:6px;border-radius:3px;background:#EEEBE3;overflow:hidden;margin-top:8px}.ms-bar i{display:block;height:100%;background:var(--gold);transition:width .4s}",
      "@media(max-width:980px){.ms-grid{grid-template-columns:1fr}.ms-col+.ms-col{border-left:0;border-top:1px solid var(--line-2)}.ms-steps{display:none}.ms-sg{grid-template-columns:1fr}}"
    ].join("");
    document.head.appendChild(st);
  }

  /* ---------- 1. tab + layout ---------- */
  function setup() {
    var bar = $("spapiRtabbar"), last = $("spapiRpanel-pricing");
    if (!bar || !last || $("msTab")) return;
    css();
    bar.insertAdjacentHTML("beforeend", '<button class="rtabbtn" id="msTab" data-spapi-r="' + ID + '"><i class="ti ti-robot"></i>Meesho</button>');
    var panel = $("spapiRpanel-" + ID) || (function () {
      var host = document.querySelectorAll('.rpanel[id^="spapiRpanel-"]'); var after = host[host.length - 1] || last;
      after.insertAdjacentHTML("afterend", '<div class="rpanel" id="spapiRpanel-' + ID + '"><div class="ap-card" id="msBody"></div></div>');
      return $("spapiRpanel-" + ID);
    })();
    var sw = window.switchSpapiSubtabKpi;
    if (typeof sw === "function") window.switchSpapiSubtabKpi = function (n) { sw(n); if (n === ID) draw(); };
    bar.addEventListener("click", function (e) { var b = e.target.closest('[data-spapi-r="' + ID + '"]'); if (b && typeof sw !== "function") { document.querySelectorAll("#spapiRtabbar .rtabbtn").forEach(function (x) { x.classList.toggle("active", x === b); }); document.querySelectorAll(".rpanel").forEach(function (p) { p.classList.toggle("active", p === panel); }); draw(); } });
  }

  function draw() {
    var body = $("msBody"); if (!body) return;
    if (!$("msQ")) {
      body.innerHTML =
        '<div class="ms-hd"><div><h3>Meesho Listing Robot</h3><p>Pick products, drop in any Meesho template, download it filled in.</p></div>' +
        '<div class="ms-steps"><span class="ms-st" id="msS1"><b>1</b>Pick products</span><span class="ms-st" id="msS2"><b>2</b>Add template</span><span class="ms-st" id="msS3"><b>3</b>Fill &amp; download</span></div></div>' +
        '<div class="ms-grid"><div class="ms-col">' +
          '<div class="ms-lbl">1 · Products on Amazon <span id="msCnt"></span></div>' +
          '<input class="ms-in" id="msQ" placeholder="Search product name, SKU or ASIN…" autocomplete="off" spellcheck="false">' +
          '<div class="ms-list" id="msList"></div>' +
        '</div><div class="ms-col">' +
          '<div class="ms-lbl">2 · Meesho template</div>' +
          '<label class="ms-drop" id="msDrop"><i class="ti ti-file-spreadsheet"></i><b>Drop the Meesho template here</b><small>Meesho panel → Catalog Upload → Bulk upload → pick category → Download template (.xlsx)</small>' +
          '<input type="file" id="msFile" accept=".xlsx,.xlsm" style="display:none"></label>' +
          '<div id="msTpl"></div>' +
          '<details class="ms-set" id="msSet"><summary>Your details &amp; price <small>saved on this computer</small></summary><div class="ms-sg">' +
            '<label>Meesho price vs Amazon (%)<input id="msPct" type="number" step="1" placeholder="0 = same price"></label>' +
            '<label>Stock when Amazon shows 0<input id="msStock" type="number" min="0" step="1"></label>' +
            '<label>Brand (empty = Amazon brand)<input id="msBrand" placeholder="e.g. Generic"></label>' +
            '<label>Country of origin<input id="msCountry"></label>' +
            '<label class="w">Manufacturer name &amp; address<textarea id="msMfr" placeholder="Name, full address, PIN"></textarea></label>' +
            '<label class="w">Packer name &amp; address (empty = same as manufacturer)<textarea id="msPacker"></textarea></label>' +
            '<label class="w">Importer name &amp; address (only for imported goods)<textarea id="msImporter"></textarea></label>' +
          '</div></details>' +
          '<button type="button" class="ms-go dim" id="msGo"><i class="ti ti-wand"></i>Fill Meesho file</button>' +
          '<div class="ms-note" id="msNote"></div>' +
        '</div></div>' +
        '<div class="ms-res" id="msRes" style="display:none"></div>';
      wire();
    }
    drawList(); drawSteps();
  }

  function wire() {
    var t; $("msQ").addEventListener("input", function (e) { clearTimeout(t); t = setTimeout(function () { q = e.target.value.trim().toLowerCase(); drawList(); }, 120); });
    $("msList").addEventListener("click", function (e) {
      var a = e.target.closest("[data-ms-all]"); if (a) { selectShown(); return; }
      if (e.target.closest("[data-ms-clr]")) { pick.clear(); drawList(); drawSteps(); return; }
      var r = e.target.closest("[data-asin]"); if (!r) return;
      var k = r.dataset.asin;
      if (pick.has(k)) pick.delete(k); else { if (pick.size >= MAX) return toast("Up to " + MAX + " products per file", true); pick.set(k, byAsin()[k]); }
      drawList(); drawSteps();
    });
    var drop = $("msDrop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) readTemplate(f); });
    $("msFile").addEventListener("change", function (e) { var f = e.target.files && e.target.files[0]; if (f) readTemplate(f); e.target.value = ""; });
    var map = { msPct: "pct", msStock: "stock", msBrand: "brand", msCountry: "country", msMfr: "mfr", msPacker: "packer", msImporter: "importer" };
    Object.keys(map).forEach(function (id) {
      var el = $(id), k = map[id]; el.value = S[k] == null ? "" : S[k];
      el.addEventListener("input", function () { S[k] = el.type === "number" ? (el.value === "" ? (k === "pct" ? 0 : 10) : +el.value) : el.value; saveSet(); });
    });
    if (!S.mfr) $("msSet").open = true;
    $("msGo").addEventListener("click", fill);
  }

  /* ---------- product list ---------- */
  function byAsin() {
    var m = {};
    inv().forEach(function (i) {
      if (!i || !i.asin) return; var a = String(i.asin).toUpperCase(), o = m[a];
      // one row per product: prefer own-shipped, in stock
      var score = function (x) { return ((x.fulfillmentChannel || "DEFAULT") === "DEFAULT" ? 2 : 0) + (x.quantity > 0 ? 1 : 0); };
      if (!o || score(i) > score(o)) m[a] = i;
    });
    return m;
  }
  var shown = [];
  function drawList() {
    var list = $("msList"); if (!list) return;
    var all = byAsin(), keys = Object.keys(all);
    if (!keys.length) { list.innerHTML = '<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px">Loading Amazon products… (open Inventory once if this stays empty)</div>'; $("msCnt").textContent = ""; return; }
    var words = q.split(/\s+/).filter(Boolean);
    shown = keys.map(function (k) { return all[k]; }).filter(function (i) {
      if (!words.length) return true;
      var t = ((i.name || "") + " " + (i.sku || "") + " " + i.asin).toLowerCase();
      return words.every(function (w) { return t.indexOf(w) >= 0; });
    }).sort(function (a, b) { return (pick.has(b.asin) - pick.has(a.asin)) || ((b.quantity > 0) - (a.quantity > 0)) || String(a.name).localeCompare(String(b.name)); }).slice(0, 60);
    $("msCnt").innerHTML = (pick.size ? "<b>" + pick.size + "</b> selected · " : "") + keys.length + " products";
    var head = '<div class="ms-it" style="cursor:default;background:#FCFBF8;padding:7px 12px"><span style="font-size:12px;color:var(--muted)">' + (q ? shown.length + (shown.length >= 60 ? "+" : "") + " found" : "Showing 60 — search to find more") + '</span><span style="flex:1"></span>' +
      '<button type="button" class="ms-lnk" data-ms-all>Select shown</button>' + (pick.size ? '<span style="width:12px"></span><button type="button" class="ms-lnk" data-ms-clr>Clear</button>' : "") + "</div>";
    list.innerHTML = head + (shown.length ? shown.map(function (i) {
      var on = pick.has(i.asin);
      return '<div class="ms-it' + (on ? " on" : "") + '" data-asin="' + esc(i.asin) + '"><span class="ms-ck">' + (on ? "✓" : "") + '</span><span class="ms-im">' + (i.img ? '<img src="' + esc(i.img) + '" loading="lazy" alt="" onerror="this.remove()">' : "") + "</span>" +
        '<div class="ms-nm"><b title="' + esc(i.name) + '">' + esc(i.name || i.asin) + "</b><small>" + esc(i.asin) + " · " + (i.quantity > 0 ? i.quantity + " in stock" : "0 stock") + "</small></div>" +
        '<span class="ms-pr">' + (i.price ? "₹" + Math.round(i.price) : "—") + "</span></div>";
    }).join("") : '<div style="padding:18px;text-align:center;color:var(--muted);font-size:13px">No product matches.</div>');
  }
  function selectShown() {
    var allOn = shown.every(function (i) { return pick.has(i.asin); });
    shown.forEach(function (i) { if (allOn) pick.delete(i.asin); else if (pick.size < MAX) pick.set(i.asin, i); });
    drawList(); drawSteps();
  }
  function drawSteps() {
    var s1 = pick.size > 0, s2 = !!tpl;
    $("msS1") && $("msS1").classList.toggle("ok", s1);
    $("msS2") && $("msS2").classList.toggle("ok", s2);
    $("msS3") && $("msS3").classList.toggle("ok", !!grid);
    var go = $("msGo"); if (go) { go.classList.toggle("dim", !(s1 && s2) || busy); go.innerHTML = '<i class="ti ti-wand"></i>Fill Meesho file' + (s1 ? " · " + pick.size + " product" + (pick.size > 1 ? "s" : "") : ""); }
    if (!busy && $("msNote")) $("msNote").textContent = !s1 ? "Tick the products to list" : !s2 ? "Now drop in the Meesho template" : "";
  }

  /* ---------- 2. read the template (any category) ---------- */
  var zipLib = null;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (zipLib) return zipLib;
    zipLib = new Promise(function (ok, no) { var s = document.createElement("script"); s.src = JSZIP; s.onload = function () { ok(window.JSZip); }; s.onerror = function () { zipLib = null; no(new Error("Could not load the Excel reader — check internet")); }; document.head.appendChild(s); });
    return zipLib;
  }
  var X = function (s) { return new DOMParser().parseFromString(s, "application/xml"); };
  var kids = function (el, name) { return Array.prototype.filter.call(el.childNodes || [], function (n) { return n.nodeType === 1 && n.localName === name; }); };
  var all = function (el, name) { return Array.prototype.slice.call(el.getElementsByTagNameNS("*", name)); };
  var txt = function (el) { return all(el, "t").filter(function (t) { return !t.parentNode || t.parentNode.localName !== "rPh"; }).map(function (t) { return t.textContent; }).join(""); };
  function colNum(L) { var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + (L.charCodeAt(i) - 64); return n - 1; }
  function colLet(n) { var s = ""; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function ref(r) { var m = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(r).trim()); return m ? { c: colNum(m[1]), r: +m[2] } : null; }
  function range(s) {
    var p = String(s).replace(/\$/g, "").split(":"), a = /^([A-Z]+)?(\d+)?$/.exec(p[0]), b = /^([A-Z]+)?(\d+)?$/.exec(p[1] || p[0]);
    if (!a || !b) return null;
    return { c1: a[1] ? colNum(a[1]) : 0, r1: a[2] ? +a[2] : 1, c2: b[1] ? colNum(b[1]) : 16383, r2: b[2] ? +b[2] : 1048576 };
  }

  async function readTemplate(file) {
    var box = $("msTpl");
    if (/\.xls$/i.test(file.name)) { box.innerHTML = '<div class="ms-tpl bad">This is an old .xls file. Open it in Excel → Save As → .xlsx, then drop it here.</div>'; return; }
    box.innerHTML = '<div class="ms-tpl" style="background:#F6F4EE;color:var(--muted)">Reading template…</div>';
    try {
      var JSZip = await loadZip(), zip = await JSZip.loadAsync(await file.arrayBuffer());
      var rd = async function (p) { var f = zip.file(p); return f ? f.async("string") : null; };
      var wb = X(await rd("xl/workbook.xml")), relsDoc = X(await rd("xl/_rels/workbook.xml.rels")), rels = {};
      all(relsDoc, "Relationship").forEach(function (r) { var t = r.getAttribute("Target"); rels[r.getAttribute("Id")] = t.charAt(0) === "/" ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); });
      var ssXml = await rd("xl/sharedStrings.xml"), ss = ssXml ? all(X(ssXml), "si").map(txt) : [];
      var sheets = all(wb, "sheet").map(function (s) { return { name: s.getAttribute("name"), hidden: !!s.getAttribute("state") && s.getAttribute("state") !== "visible", path: rels[s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || s.getAttribute("r:id")] }; });
      var names = {}; all(wb, "definedName").forEach(function (d) { names[d.getAttribute("name").toLowerCase()] = d.textContent; });
      var cache = {};
      async function cells(path) {   // path -> { doc, rows: {r: {c: {v, f}}} }
        if (cache[path]) return cache[path];
        var doc = X(await rd(path)), rows = {};
        all(doc, "row").forEach(function (row) {
          var rn = +row.getAttribute("r"), o = rows[rn] = {}, ci = 0;
          kids(row, "c").forEach(function (c) {
            var rr = c.getAttribute("r"), pos = rr ? ref(rr) : null, col = pos ? pos.c : ci; ci = col + 1;
            var t = c.getAttribute("t"), v = kids(c, "v")[0], f = kids(c, "f")[0], val = "";
            if (t === "s" && v) val = ss[+v.textContent] || ""; else if (t === "inlineStr") val = txt(c); else if (v) val = v.textContent;
            o[col] = { v: String(val).trim(), f: !!f };
          });
        });
        return (cache[path] = { doc: doc, rows: rows });
      }
      // find the sheet + row holding the column names
      var KEY = /product ?name|sku|\bgst\b|\bhsn\b|price|\bmrp\b|image|weight|inventory|stock|colou?r|brand|description|country|manufacturer|packer|material|fabric|\bsize\b/i;
      var best = null;
      for (var i = 0; i < sheets.length; i++) {
        var sh = sheets[i]; if (sh.hidden || !sh.path || !zip.file(sh.path)) continue;
        var cs = await cells(sh.path);
        for (var r = 1; r <= 15; r++) {
          var row = cs.rows[r]; if (!row) continue;
          var score = Object.keys(row).filter(function (c) { return row[c].v && row[c].v.length < 90 && KEY.test(row[c].v); }).length;
          if (score >= 4 && (!best || score > best.score)) best = { sh: sh, r: r, score: score };
        }
      }
      if (!best) throw new Error("Could not find the product columns in this file. Is it a Meesho bulk-upload template?");
      var main = await cells(best.sh.path), hr = best.r, hrow = main.rows[hr];
      var cols = Object.keys(hrow).map(Number).sort(function (a, b) { return a - b; }).filter(function (c) { return hrow[c].v; }).map(function (c) {
        var raw = hrow[c].v; return { idx: c, letter: colLet(c), raw: raw, head: raw.replace(/\*/g, "").replace(/\s+/g, " ").trim(), req: /\*/.test(raw) || /mandatory|required/i.test(raw), hint: "", options: null };
      });
      // dropdown lists (both Excel styles)
      var dvs = all(main.doc, "dataValidation"), minStart = null;
      for (var d = 0; d < dvs.length; d++) {
        var dv = dvs[d]; if ((dv.getAttribute("type") || "") !== "list") continue;
        var sq = dv.getAttribute("sqref") || ((all(dv, "sqref")[0] || {}).textContent) || "";
        var f1 = all(dv, "formula1")[0]; if (!f1) continue;
        var fx = ((all(f1, "f")[0] || f1).textContent || "").trim();
        var opts = await listValues(fx, sheets, names, cells, best.sh.path);
        sq.split(/\s+/).filter(Boolean).forEach(function (part) {
          var g = range(part); if (!g) return;
          cols.forEach(function (col) { if (col.idx >= g.c1 && col.idx <= g.c2 && g.r2 > hr) { if (opts && opts.length && !col.options) col.options = opts; } });
          if (g.r1 > hr && g.r1 <= hr + 12 && (minStart == null || g.r1 < minStart)) minStart = g.r1;
        });
      }
      // first empty row after the column names (skips hint / example rows)
      var isEmpty = function (rn) { var row = main.rows[rn]; return !row || cols.every(function (c) { var x = row[c.idx]; return !x || !x.v || x.f; }); };
      var start = minStart || hr + 1;
      while (start <= hr + 12 && !isEmpty(start)) start++;
      for (var h = hr + 1; h < start; h++) { var hrw = main.rows[h] || {}; cols.forEach(function (c) { var x = hrw[c.idx]; if (x && x.v) { if (/mandatory|required|compulsory/i.test(x.v)) c.req = true; if (!c.hint) c.hint = x.v.slice(0, 160); } }); }
      tpl = { name: file.name, zip: zip, path: best.sh.path, sheet: best.sh.name, doc: main.doc, hr: hr, start: start, cols: cols };
      grid = null; $("msRes").style.display = "none";
      var dd = cols.filter(function (c) { return c.options; }).length, rq = cols.filter(function (c) { return c.req; }).length;
      box.innerHTML = '<div class="ms-tpl"><b>✓ ' + esc(file.name) + "</b><br>Sheet “" + esc(best.sh.name) + "” · " + cols.length + " columns" + (rq ? " · " + rq + " required" : "") + (dd ? " · " + dd + " with Meesho choices" : "") + " · products start at row " + start + "</div>";
    } catch (e) {
      tpl = null; box.innerHTML = '<div class="ms-tpl bad">' + esc(e.message || e) + "</div>";
    }
    drawSteps();
  }
  async function listValues(fx, sheets, names, cells, mainPath) {
    fx = fx.replace(/^=/, "");
    if (/^".*"$/.test(fx)) return fx.slice(1, -1).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (/indirect|offset/i.test(fx)) return null;              // depends on another column - shown as a free box
    if (names[fx.toLowerCase()]) fx = names[fx.toLowerCase()].replace(/^=/, "");
    var m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(fx), shName = m ? (m[1] || m[2]).replace(/''/g, "'") : null, rg = range(m ? m[3] : fx);
    if (!rg) return null;
    var sh = shName ? sheets.filter(function (s) { return s.name === shName; })[0] : null;
    if (shName && !sh) return null;
    var cs = await cells(sh ? sh.path : mainPath), out = [];
    for (var r = rg.r1; r <= Math.min(rg.r2, rg.r1 + 2000); r++) { var row = cs.rows[r]; if (!row) continue; for (var c = rg.c1; c <= Math.min(rg.c2, rg.c1 + 5); c++) if (row[c] && row[c].v) out.push(row[c].v); }
    return out.length ? Array.from(new Set(out)).slice(0, 800) : null;
  }

  /* ---------- 3. Amazon details (robot) ---------- */
  async function token() {
    var t = "";
    try { if (mainDb()) { var d = await mainDb().collection("aikm_admin").doc("ghSync").get(); t = (d.exists && d.data().token) || ""; } } catch (e) {}
    if (!t) try { t = localStorage.getItem(TK) || ""; } catch (e) {}
    return String(t).replace(/^\s*bearer\s+/i, "").trim();
  }
  async function getDocs(asins) {
    var db = spDb(), out = {}; if (!db) return out;
    await Promise.all(asins.map(function (a) { return db.collection("spapiSnapshots").doc("meesho_" + a).get().then(function (d) { if (d.exists) out[a] = d.data(); }).catch(function () {}); }));
    return out;
  }
  function note(html, pct) { var n = $("msNote"); if (n) n.innerHTML = html + (pct != null ? '<div class="ms-bar"><i style="width:' + Math.max(4, pct) + '%"></i></div>' : ""); }
  async function details(asins) {
    note("Checking saved Amazon details…", 5);
    var have = await getDocs(asins), now = Date.now();
    var miss = asins.filter(function (a) { return !have[a] || !(now - (have[a].at || 0) < FRESH_MS); });
    if (!miss.length) return { d: have };
    var tok = await token();
    if (!tok) return { d: have, warn: "Robot not connected (GitHub token missing) — filled from basic Amazon data only. Click any “Sync OMS now” button once in the console to connect it." };
    var req = "m" + now.toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      var r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/dispatches", {
        method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { asins: miss.join(","), req_id: req } }) });
      if (r.status !== 204) throw new Error("GitHub said " + r.status);
    } catch (e) { return { d: have, warn: "Robot could not start (" + e.message + ") — filled from basic Amazon data only." }; }
    var db = spDb(), t0 = Date.now(), job = null;
    while (Date.now() - t0 < 5 * 60e3) {
      var sec = Math.round((Date.now() - t0) / 1000);
      note("Robot is reading " + miss.length + " product" + (miss.length > 1 ? "s" : "") + " from Amazon… " + (job && job.ok ? job.ok + "/" + miss.length + " · " : "") + sec + "s <small>(about 1 minute)</small>", Math.min(92, 8 + sec * 1.2));
      await new Promise(function (ok) { setTimeout(ok, 6000); });
      try { var j = await db.collection("spapiSnapshots").doc("meesho_job_" + req).get(); job = j.exists ? j.data() : null; } catch (e) {}
      if (job && (job.status === "done" || job.status === "failed")) break;
    }
    var fresh = await getDocs(miss); Object.keys(fresh).forEach(function (k) { have[k] = fresh[k]; });
    var left = miss.filter(function (a) { return !fresh[a]; });
    return { d: have, warn: !job ? "Robot took too long — filled what was ready. Try Fill again in a minute." : job.status === "failed" ? "Robot failed (" + (job.error || "see GitHub") + ") — filled from basic data." : left.length ? left.length + " product(s) not found in Amazon's catalogue — basic data used." : "" };
  }

  /* ---------- 4. match columns to product data ---------- */
  function gstOf(p) {
    var g = null; try { g = gstPctFromTaxCode(p.taxCode); } catch (e) {}
    var n = parseFloat(g); if (!isNaN(n)) return n;
    n = parseFloat(p.taxPercent); return isNaN(n) ? "" : n;
  }
  function toCm(x) { if (!x || x.v == null) return ""; var f = { mm: 0.1, m: 100, in: 2.54, inches: 2.54 }[String(x.u).toLowerCase()] || 1; return Math.round(x.v * f * 10) / 10; }
  function price(p) { var v = Number(p.price) || 0; if (!v) return ""; v = Math.round(v * (1 + (Number(S.pct) || 0) / 100)); var m = Number(p.mrp) || 0; return m && v > m ? Math.floor(m) : v; }
  function descr(p, d) {
    var b = (d && d.bullets) || [], t = (d && d.description) || "";
    var s = b.map(function (x) { return "• " + x; }).join("\n");
    if (t && s.indexOf(t.slice(0, 40)) < 0) s += (s ? "\n\n" : "") + t;
    return (s || (d && d.title) || p.name || "").slice(0, 3000);
  }
  var RULES = [
    [/group id|catalog id|meesho id|variation|parent sku|\bean\b|barcode|gtin|\bupc\b|size chart|video/, function () { return ""; }],
    [/wrong|defective/, function (x) { return price(x.p); }],
    [/\bmrp\b|maximum retail/, function (x) { return x.p.mrp ? Math.round(x.p.mrp) : ""; }],
    [/price/, function (x) { return price(x.p); }],
    [/\bgst\b/, function (x) { return gstOf(x.p); }],
    [/\bhsn\b/, function (x) { return x.p.hsnCode || ""; }, "text"],
    [/weight/, function (x) { var g = (x.d && x.d.weightG) || (x.p.weightKg ? x.p.weightKg * 1000 : 0); if (!g) return ""; return /\bkg|kilo/.test(x.h) ? Math.round(g / 10) / 100 : Math.round(g); }],
    [/net quantity|pack of|no\.? of (pieces|items)|number of (pieces|items)/, function (x) { var o = (x.d && x.d.other) || {}; return o.number_of_items || o.number_of_pieces || o.unit_count || "1"; }],
    [/inventory|stock|available quantity|quantity available|^qty/, function (x) { return x.p.quantity > 0 ? x.p.quantity : (Number(S.stock) || 0); }],
    [/sku|style id|style code|product id/, function (x) { return x.p.sku || x.p.asin; }, "text"],
    [/product name|title|catalog name|^name$/, function (x) { return (x.d && x.d.title) || x.p.name || ""; }, "text"],
    [/image|photo|picture/, function (x) { var im = (x.d && x.d.images && x.d.images.length ? x.d.images : (x.p.img ? [x.p.img] : [])); return im[x.slot] || ""; }, "text"],
    [/brand/, function (x) { return S.brand || (x.d && x.d.brand) || ""; }, "text"],
    [/country/, function (x) { return (x.d && x.d.countryOfOrigin) || S.country || "India"; }],
    [/manufacturer/, function (x) { return S.mfr || (x.d && x.d.manufacturer) || ""; }, "text"],
    [/packer/, function () { return S.packer || S.mfr || ""; }, "text"],
    [/importer/, function () { return S.importer || ""; }, "text"],
    [/description|about (the )?product|product details/, function (x) { return descr(x.p, x.d); }, "text"],
    [/colou?r/, function (x) { return (x.d && x.d.color) || ""; }],
    [/material|fabric/, function (x) { return (x.d && x.d.material) || ""; }],
    [/\bsize\b/, function (x) { return (x.d && x.d.size) || "Free Size"; }],
    [/length/, function (x) { return toCm(x.d && x.d.dims && x.d.dims.l); }],
    [/width|breadth/, function (x) { return toCm(x.d && x.d.dims && x.d.dims.w); }],
    [/height|depth/, function (x) { return toCm(x.d && x.d.dims && x.d.dims.h); }],
    [/pattern|print/, function (x) { return (x.d && x.d.pattern) || ""; }],
    [/model/, function (x) { return (x.d && x.d.modelNumber) || ""; }, "text"]
  ];
  var STOP = { of: 1, the: 1, and: 1, or: 1, in: 1, for: 1, cm: 1, mm: 1, gm: 1, gms: 1, g: 1, kg: 1, ml: 1, inch: 1, inches: 1, product: 1, type: 0, n: 1 };
  function guess(h, d) {   // any other column: find an Amazon attribute with the same words
    if (!d || !d.other) return "";
    var w = h.replace(/\(.*?\)/g, " ").toLowerCase().split(/[^a-z]+/).filter(function (x) { return x.length > 1 && !STOP[x]; });
    if (!w.length) return "";
    var best = "", bs = 0;
    Object.keys(d.other).forEach(function (k) {
      var parts = k.split("_"), hit = w.filter(function (x) { return parts.some(function (p) { return p === x || p === x.replace(/s$/, "") || p.replace(/s$/, "") === x; }); }).length;
      if (hit === w.length && hit / parts.length > bs) { bs = hit / parts.length; best = d.other[k]; }
    });
    return best;
  }
  function snap(v, opts) {   // make the value one of Meesho's choices, or "" when nothing fits
    if (!opts || v === "" || v == null) return { v: v == null ? "" : v };
    var s = String(v).trim(), lo = s.toLowerCase(), nz = function (x) { return String(x).toLowerCase().replace(/[^a-z0-9.]/g, ""); };
    var num = parseFloat(s), hit;
    if (!isNaN(num) && /^[\d.\s%a-z]*$/i.test(s)) { hit = opts.filter(function (o) { return parseFloat(o) === num && /^[\d.\s%]*$/.test(o); })[0]; if (hit) return { v: hit }; }
    hit = opts.filter(function (o) { return o.toLowerCase() === lo; })[0] || opts.filter(function (o) { return nz(o) === nz(s); })[0];
    if (hit) return { v: hit };
    var inside = opts.filter(function (o) { return o.length > 2 && new RegExp("(^|[^a-z])" + o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)").test(lo); }).sort(function (a, b) { return b.length - a.length; });
    if (inside[0]) return { v: inside[0] };
    var cont = opts.filter(function (o) { return lo.length > 2 && o.toLowerCase().indexOf(lo) >= 0; }).sort(function (a, b) { return a.length - b.length; });
    if (cont[0]) return { v: cont[0] };
    return { v: "", was: s };
  }

  async function fill() {
    if (!tpl || !pick.size || busy) return;
    busy = true; drawSteps();
    try {
      var items = Array.from(pick.values()).filter(Boolean), r = await details(items.map(function (i) { return String(i.asin).toUpperCase(); }));
      grid = { rows: items.map(function (p) {
        var d = r.d[String(p.asin).toUpperCase()] || null, slot = 0, vals = {};
        tpl.cols.forEach(function (c) {
          var h = c.head.toLowerCase(), rule = RULES.filter(function (x) { return x[0].test(h); })[0], v, kind = rule ? rule[2] : "";
          var x = { p: p, d: d, h: h, slot: 0 };
          if (rule && /image|photo|picture/.test(h)) { var n = /(\d+)/.exec(h); x.slot = n ? Math.max(0, +n[1] - 1) : /front|main/.test(h) ? 0 : /back/.test(h) ? 1 : /side/.test(h) ? 2 : slot; slot = Math.max(slot, x.slot) + 1; }
          v = rule ? rule[1](x) : guess(c.head, d);
          var sn = snap(v, c.options);
          vals[c.idx] = { v: sn.v === "" || sn.v == null ? "" : String(sn.v), was: sn.was || "", auto: sn.v !== "" && sn.v != null, text: kind === "text" };
        });
        return { p: p, d: d, vals: vals };
      }), warn: r.warn || "" };
      drawGrid();
      note(r.warn ? "⚠ " + esc(r.warn) : "Done — check the yellow boxes below, then download.");
    } catch (e) { note("⚠ " + esc(e.message || e)); }
    busy = false; drawSteps();
  }

  /* ---------- 5. review grid ---------- */
  function needCols() {
    var anyReq = tpl.cols.some(function (c) { return c.req; });
    return tpl.cols.filter(function (c) { return grid.rows.some(function (r) { return !r.vals[c.idx].v; }) && (anyReq ? c.req : true); });
  }
  function counts() {
    var auto = 0, need = 0, tot = 0;
    grid.rows.forEach(function (r) { tpl.cols.forEach(function (c) { var v = r.vals[c.idx]; if (v.v) auto++; if (c.req && !v.v) need++; tot++; }); });
    return { auto: auto, need: need, tot: tot };
  }
  function drawGrid() {
    var res = $("msRes"); res.style.display = "";
    var n = counts(), nc = needCols(), cols = onlyNeed && nc.length ? nc : tpl.cols, dl = "";
    var head = cols.map(function (c) {
      var id = "msDl" + c.idx; if (c.options) dl += '<datalist id="' + id + '">' + c.options.map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") + "</datalist>";
      return '<th title="' + esc(c.hint || c.raw) + '">' + esc(c.head) + (c.req ? '<span class="ms-req">*</span>' : "") + "<small>" + (c.options ? c.options.length + " Meesho choices" : "type any value") + "</small>" +
        '<div class="ms-all"><input data-all="' + c.idx + '"' + (c.options ? ' list="' + id + '"' : "") + ' placeholder="Same for all"><button type="button" data-allgo="' + c.idx + '">Apply</button></div></th>';
    }).join("");
    var body = grid.rows.map(function (r, ri) {
      return '<tr><td class="p"><div class="ms-pn" title="' + esc(r.p.name) + '">' + esc(r.p.name) + "</div><small>" + esc(r.p.asin) + (r.d ? "" : " · basic data") + "</small></td>" + cols.map(function (c) {
        var v = r.vals[c.idx], need = !v.v && (c.req || (onlyNeed && nc.length));
        var bad = v.v && c.options && c.options.indexOf(v.v) < 0;
        return '<td class="' + (need ? "need" : "") + (bad ? " bad" : "") + '"' + (v.was ? ' title="Amazon says: ' + esc(v.was) + '"' : "") + '><input class="ms-c" data-r="' + ri + '" data-c="' + c.idx + '" value="' + esc(v.v) + '"' + (c.options ? ' list="msDl' + c.idx + '"' : "") + (v.was ? ' placeholder="' + esc(("Amazon: " + v.was).slice(0, 40)) + '"' : "") + "></td>";
      }).join("") + "</tr>";
    }).join("");
    res.innerHTML = '<div class="ms-sum"><span class="ms-pill g">✓ ' + n.auto + " boxes filled by the robot</span>" +
      (n.need ? '<span class="ms-pill y">' + n.need + " required boxes need you</span>" : '<span class="ms-pill g">All required boxes filled</span>') +
      (nc.length ? '<button type="button" class="ms-lnk" id="msTog">' + (onlyNeed ? "Show all " + tpl.cols.length + " columns" : "Show only columns that need you") + "</button>" : "") +
      '<button type="button" class="ms-go gold" id="msDl"><i class="ti ti-download"></i>Download Meesho file</button></div>' +
      dl + '<div class="ms-tw"><table class="ms-t"><thead><tr><th class="p">Product</th>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>" +
      '<div class="ms-note" style="text-align:left">Tip: yellow = Meesho needs it. Use <b>Same for all</b> to fill a whole column at once. Then upload the downloaded file in Meesho → Catalog Upload → Bulk upload.</div>';
    res.oninput = function (e) {
      var el = e.target; if (!el.dataset || el.dataset.r == null) return;
      var v = grid.rows[+el.dataset.r].vals[+el.dataset.c]; v.v = el.value.trim(); v.auto = false;
      var td = el.parentNode, c = tpl.cols.filter(function (x) { return x.idx === +el.dataset.c; })[0];
      td.classList.toggle("need", !v.v && !!c.req); td.classList.toggle("bad", !!(v.v && c.options && c.options.indexOf(v.v) < 0));
    };
    res.onclick = function (e) {
      if (e.target.closest("#msTog")) { onlyNeed = !onlyNeed; drawGrid(); return; }
      if (e.target.closest("#msDl")) { download(); return; }
      var b = e.target.closest("[data-allgo]"); if (!b) return;
      var idx = +b.dataset.allgo, inp = res.querySelector('[data-all="' + idx + '"]'), v = inp.value.trim();
      if (!v) return toast("Type or pick a value first", true);
      grid.rows.forEach(function (r) { r.vals[idx].v = v; r.vals[idx].auto = false; });
      drawGrid(); toast("Filled for all " + grid.rows.length + " products");
    };
    drawSteps();
  }

  /* ---------- 6. write the file ---------- */
  function setCell(doc, sd, rows, rn, ci, val, asText) {
    var row = rows[rn];
    if (!row) {
      row = doc.createElementNS(NS, "row"); row.setAttribute("r", rn);
      var after = Array.prototype.filter.call(sd.childNodes, function (n) { return n.nodeType === 1 && +n.getAttribute("r") > rn; })[0];
      sd.insertBefore(row, after || null); rows[rn] = row;
    }
    row.removeAttribute("spans");
    var R = colLet(ci) + rn, cs = kids(row, "c"), c = cs.filter(function (x) { return x.getAttribute("r") === R; })[0];
    if (!c) {
      c = doc.createElementNS(NS, "c"); c.setAttribute("r", R);
      var nxt = cs.filter(function (x) { var p = ref(x.getAttribute("r") || ""); return p && p.c > ci; })[0];
      row.insertBefore(c, nxt || null);
    }
    if (kids(c, "f").length) return false;          // never overwrite a formula
    while (c.firstChild) c.removeChild(c.firstChild);
    c.removeAttribute("t");
    if (!asText && /^-?\d+(\.\d+)?$/.test(val) && val.length < 15) { var v = doc.createElementNS(NS, "v"); v.textContent = val; c.appendChild(v); }
    else {
      c.setAttribute("t", "inlineStr");
      var is = doc.createElementNS(NS, "is"), t = doc.createElementNS(NS, "t");
      t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"); t.textContent = val;
      is.appendChild(t); c.appendChild(is);
    }
    return true;
  }
  async function download() {
    var n = counts();
    if (n.need && !confirm(n.need + " required boxes are still empty — Meesho will reject those products. Download anyway?")) return;
    try {
      var doc = X(new XMLSerializer().serializeToString(tpl.doc)), sd = all(doc, "sheetData")[0], rows = {};
      all(sd, "row").forEach(function (r) { rows[+r.getAttribute("r")] = r; });
      var maxC = 0;
      grid.rows.forEach(function (r, i) {
        tpl.cols.forEach(function (c) { var v = r.vals[c.idx]; if (v.v === "") return; setCell(doc, sd, rows, tpl.start + i, c.idx, v.v, v.text); if (c.idx > maxC) maxC = c.idx; });
      });
      var dim = all(doc, "dimension")[0], lastRow = tpl.start + grid.rows.length - 1;
      if (dim) { var g = range(dim.getAttribute("ref") || "A1"); if (g) dim.setAttribute("ref", "A1:" + colLet(Math.max(g.c2 > 16000 ? 0 : g.c2, maxC)) + Math.max(g.r2 > 1e6 ? 0 : g.r2, lastRow)); }
      var out = new XMLSerializer().serializeToString(doc);
      if (!/^<\?xml/.test(out)) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + out;
      tpl.zip.file(tpl.path, out);
      var blob = await tpl.zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var a = document.createElement("a"), d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = tpl.name.replace(/\.(xlsx|xlsm)$/i, "") + "_filled_" + d.getDate() + "-" + (d.getMonth() + 1) + "." + (/\.xlsm$/i.test(tpl.name) ? "xlsm" : "xlsx");
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast("Downloaded — upload it in Meesho → Catalog Upload → Bulk upload");
    } catch (e) { toast("Could not make the file: " + (e.message || e), true); }
  }

  /* ---------- start ---------- */
  var go = function () { try { setup(); } catch (e) { console.warn("Meesho tab:", e); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  setTimeout(go, 3000);
})();
