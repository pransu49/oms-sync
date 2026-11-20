/* ===== AIKM CENTRAL INVENTORY (owner 17 Nov 2026) =====
   "Make a combined inventory like OMS, from where stock gets distributed - after some time I will stop OMS for orders."
   Owner 20 Nov 2026: "deploy central inventory tab in this sp-api, as I don't want a different tool for this" ->
   it is now a TAB on the Amazon page (/pages/amazon), next to Orders / Inventory / Competitor Pricing / OMS inventory.
   The old link /pages/amazon?app=inventory still works: it opens the Amazon page with this tab selected.
   Stock per product = LOTS-GN (+ LOTS-62 for Sasta Store, higher of the two) + OWN stock typed here - units in pending orders of
   all Amazon accounts. Every listing of the product gets that full stock; under 10 free -> 0.
   The numbers are worked out by each account's sync robot (spapi-sync.js runCentralInventory -> spapiSnapshots/<acct>_invPlan).
   This tab: reads the 5 plans (SP-API Firebase) + aikm_admin/invCentral (main) = 6 reads, ONLY when the tab is opened (not on page load);
   writes only when you save own stock or switch an account. An account switched to "AIKM tool" gets its Amazon stock from here. */
(function () {
  if (window.__aikmInvTool) return; window.__aikmInvTool = 1;
  var TAB = "centralinv", OPEN_NOW = /[?&]app=inventory(&|$)/.test(location.search);
  var ACC = [["praso", "Praso"], ["sastastore", "Sasta Store"], ["vishal", "Vishal E-Com"], ["munda", "Ecommerce Munda"], ["aikm", "AIKM Pharma"]];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var nf = function (v) { return v == null || v === "" ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }); };
  var ago = function (t) { if (!t) return "never"; var m = Math.round((Date.now() - t) / 6e4); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
  var toast = function (m, bad) { if (typeof spToast === "function") spToast(m, bad); };
  var PLAN = {}, CTL = { own: {}, live: {} }, KEYS = {}, filt = "all", src = "lots", q = "", page = 0, loaded = false, loading = false;

  /* ---------- layout: a tab on the Amazon page ---------- */
  var st = document.createElement("style"); st.id = "invCss";
  st.textContent =
    "#invApp{padding:2px 0 0}" +
    "#invApp{font-family:Inter,system-ui,sans-serif;color:var(--ink,#14213D)}" +
    ".iv-hd{display:flex;align-items:flex-end;gap:16px;margin:0 0 16px}.iv-hd h2{font:600 22px Lexend,sans-serif;margin:0}.iv-hd p{margin:4px 0 0;color:var(--muted,#8B909B);font-size:12.5px;max-width:760px;line-height:1.5}" +
    ".iv-hd .sp{flex:1}.iv-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:9px;font-size:12.5px;font-weight:600;border:1px solid var(--line,#E7E1D3);background:#fff;color:var(--navy,#0F1E35);white-space:nowrap}" +
    ".iv-btn:hover{border-color:var(--gold,#C9A24B);background:var(--gold-soft,#F6EEDB)}.iv-btn.pri{background:var(--navy,#0F1E35);color:#fff;border-color:var(--navy,#0F1E35)}.iv-btn.pri:hover{background:#243A5E}" +
    ".iv-btn.gold{background:linear-gradient(135deg,#E3C47A,#C9A24B);border-color:#C9A24B;color:#0F1E35}" +
    ".iv-acc{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px}" +
    ".iv-ac{background:#fff;border:1px solid var(--line,#E7E1D3);border-radius:14px;padding:14px;box-shadow:0 1px 2px rgba(15,30,53,.04),0 6px 24px rgba(15,30,53,.05);position:relative;overflow:hidden}" +
    ".iv-ac.live{border-color:#1E7A4B;box-shadow:0 0 0 3px rgba(30,122,75,.12)}.iv-ac.live:before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#1E7A4B}" +
    ".iv-ac h4{margin:0;font:600 14px Lexend,sans-serif;display:flex;align-items:center;gap:8px}.iv-own{font-size:11px;font-weight:600;border-radius:20px;padding:2px 9px}" +
    ".iv-own.oms{background:#F1F0EC;color:#4A5468}.iv-own.aikm{background:#E6F3EC;color:#1E7A4B}.iv-ac .m{font-size:11.5px;color:var(--muted,#8B909B);margin:6px 0 10px;line-height:1.55}.iv-ac .m b{color:var(--ink,#14213D)}" +
    ".iv-k{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px 14px;border-bottom:1px solid var(--line-2,#F0ECE2)}" +
    ".iv-t{all:unset;cursor:pointer;border:1px solid var(--line-2,#F0ECE2);background:var(--cream,#FBF9F4);border-radius:10px;padding:10px 12px}.iv-t:hover{background:#fff;border-color:var(--line,#E7E1D3)}" +
    ".iv-t.on{border-color:var(--gold,#C9A24B);background:var(--gold-soft,#F6EEDB);box-shadow:0 0 0 3px rgba(201,162,75,.15)}" +
    ".iv-t .l{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-2,#4A5468);font-weight:500;white-space:nowrap}.iv-t .d{width:6px;height:6px;border-radius:50%}" +
    ".iv-t .n{font:600 22px Lexend,sans-serif;margin-top:5px;font-variant-numeric:tabular-nums}.iv-t .s{font-size:11px;color:var(--muted,#8B909B)}" +
    ".iv-tools{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line-2,#F0ECE2);flex-wrap:wrap}" +
    ".iv-tools input{border:1px solid var(--line,#E7E1D3);background:var(--cream,#FBF9F4);border-radius:9px;padding:8px 12px;font-size:12.5px;width:320px;outline:none}.iv-tools input:focus{border-color:var(--gold,#C9A24B);background:#fff}" +
    ".iv-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}.iv-tbl th{position:sticky;top:0;z-index:1;background:var(--cream,#FBF9F4);text-align:left;font:600 10.5px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#8B909B);padding:10px 12px;border-bottom:1px solid var(--line,#E7E1D3);white-space:nowrap}" +
    ".iv-tbl td{padding:10px 12px;border-bottom:1px solid var(--line-2,#F0ECE2);vertical-align:middle}.iv-tbl .r{text-align:right;font-variant-numeric:tabular-nums}" +
    ".iv-q{font:600 15px Lexend,sans-serif;font-variant-numeric:tabular-nums}.iv-q.bad{color:#B42318}.iv-q.ok{color:#1E7A4B}" +
    ".iv-own-in{width:74px;border:1px solid var(--line,#E7E1D3);border-radius:8px;padding:6px 8px;font:600 13px Inter,sans-serif;text-align:right;outline:none}.iv-own-in:focus{border-color:var(--gold,#C9A24B);box-shadow:0 0 0 3px rgba(201,162,75,.15)}" +
    ".iv-own-in.dirty{border-color:#C9A24B;background:#FFFBEF}" +
    ".iv-ch{display:inline-flex;align-items:center;gap:5px;font-size:11px;border:1px solid var(--line,#E7E1D3);border-radius:7px;padding:3px 7px;margin:2px 4px 2px 0;white-space:nowrap;background:#fff}" +
    ".iv-ch b{font-variant-numeric:tabular-nums}.iv-ch.diff{border-color:#EBC27A;background:#FBF1DF}.iv-ch.fail{border-color:#F3B8B1;background:#FCECEA}" +
    ".iv-seg{display:inline-flex;background:#EBE6DA;border-radius:10px;padding:3px;gap:2px}.iv-sg{all:unset;cursor:pointer;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:500;color:var(--ink-2,#4A5468);white-space:nowrap}.iv-sg.on{background:#fff;color:var(--ink,#14213D);font-weight:600;box-shadow:0 1px 3px rgba(15,30,53,.1)}" +
    ".iv-sub{font-size:11px;color:var(--muted,#8B909B);margin-top:2px}.iv-empty{padding:50px 20px;text-align:center;color:var(--muted,#8B909B)}" +
    ".iv-end{text-align:center;padding:12px;font-size:11.5px;color:var(--muted,#8B909B)}.iv-tbl th.t-r{text-align:right}.iv-tbl th.cm-th{cursor:pointer}" +
    ".iv-st{display:inline-block;font-size:11px;font-weight:600;border-radius:20px;padding:2px 9px;white-space:nowrap}.iv-st.ok{background:#E6F3EC;color:#1E7A4B}.iv-st.bad{background:#FCECEA;color:#B42318}" +
    ".iv-sel{height:36px;border:1px solid var(--line,#E7E1D3);border-radius:9px;padding:0 10px;font:600 12.5px Inter,sans-serif;color:var(--navy,#0F1E35);background:#fff;outline:none;cursor:pointer}.iv-sel:focus{border-color:var(--gold,#C9A24B)}" +
    ".iv-tools .ap-search{flex:0 1 320px}.iv-more{text-align:center;padding:14px}.iv-scroll{overflow:auto;max-height:calc(100vh - 360px);min-height:240px}" +
    "@media(max-width:1100px){.iv-acc{grid-template-columns:repeat(2,1fr)}.iv-k{grid-template-columns:repeat(3,1fr)}}";
  document.head.appendChild(st);

  function shell() {
    if ($("invApp")) return true;
    var bar = $("spapiRtabbar"), after = $("spapiRpanel-pricing");
    if (!bar || !after || typeof window.switchSpapiSubtabKpi !== "function") return false;
    bar.insertAdjacentHTML("beforeend", '<button class="rtabbtn" id="invTab" data-spapi-r="' + TAB + '"><i class="ti ti-stack-2"></i>Central inventory <span class="rtab-count" id="invCount" title="Products out of stock (under 10 free)">·</span></button>');
    var last = after; while (last.nextElementSibling && last.nextElementSibling.classList.contains("rpanel")) last = last.nextElementSibling;
    last.insertAdjacentHTML("afterend", '<div class="rpanel" id="spapiRpanel-' + TAB + '"><div id="invApp"><div class="iv-hd"><div><h2>Central Inventory</h2><div class=\"iv-sub\" style=\"margin-top:2px\">Final stock for every Amazon listing - replaces OMS Guru inventory</div><p>One stock for every product: <b>LOTS-GN</b> (+ <b>LOTS-62</b> for Sasta Store) + <b>your own stock</b> − <b>pending orders</b> of all Amazon accounts. Every listing gets the same full stock; under 10 free → out of stock. Updates with every Amazon sync (about 15 min).</p></div><span class="sp"></span><button type="button" class="iv-btn" id="ivReload"><i class="ti ti-refresh"></i>Refresh</button></div>' +
      '<div class="iv-acc" id="ivAcc"></div><div class="ap-card" id="ivCard"><div class="iv-empty">Loading stock…</div></div></div></div>');
    /* load the stock only the first time the tab is opened (saves Firebase reads) */
    var sw = window.switchSpapiSubtabKpi;
    window.switchSpapiSubtabKpi = function (n) { sw.apply(this, arguments); if (n === TAB && !loaded && !loading) load(); };
    $("ivReload").onclick = function () { load(true); };
    $("ivAcc").addEventListener("click", function (e) { var b = e.target.closest("[data-sw]"); if (b) switchAcc(b.dataset.sw, b.dataset.to === "1"); });
    $("ivCard").addEventListener("click", function (e) {
      var sg = e.target.closest("[data-src]"); if (sg) { src = sg.dataset.src; if (filt === "unl") filt = "all"; page = 0; draw(); return; }
      var tl = e.target.closest("[data-f]"); if (tl) { filt = tl.dataset.f; page = 0; draw(); return; }
            var sv = e.target.closest("[data-save]"); if (sv) { saveOwn(); return; }
      var mp = e.target.closest("[data-map]"); if (mp && typeof openSpapiMatchModal === "function") { openSpapiMatchModal(mp.dataset.map); toast("Map it to the LOTS product and Save — the next sync picks it up"); }
    });
    $("ivCard").addEventListener("input", function (e) { var i = e.target.closest(".iv-own-in"); if (i) { i.classList.toggle("dirty", String(i.value) !== String(i.dataset.v)); countDirty(); } });
    $("ivCard").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.closest(".iv-own-in")) { e.preventDefault(); saveOwn(); } });
    return true;
  }
  function countDirty() { var n = document.querySelectorAll(".iv-own-in.dirty").length, b = $("ivSave"); if (b) { b.style.display = n ? "" : "none"; b.innerHTML = '<i class="ti ti-device-floppy"></i>Save own stock · ' + n; } }

  /* ---------- data ---------- */
  function load(force) {
    if (typeof fbDbSpapi === "undefined" || typeof fbDb === "undefined") { loading = true; return setTimeout(function () { loading = false; load(force); }, 600); }
    var P = fbDbSpapi.collection("spapiSnapshots"); loading = true;
    return Promise.all(ACC.map(function (a) { return P.doc(a[0] + "_invPlan").get().catch(function () { return null; }); }).concat([fbDb.collection("aikm_admin").doc("invCentral").get().catch(function () { return null; })]))
      .then(function (r) {
        PLAN = {}; KEYS = {};
        ACC.forEach(function (a, i) { var d = r[i]; if (!d || !d.exists) return; var x = d.data(), rows = [], keys = {};
          try { rows = JSON.parse(x.rows || "[]"); keys = JSON.parse(x.keys || "{}"); } catch (e) {}
          PLAN[a[0]] = { at: x.at, live: !!x.live, broken: !!x.broken, lots62: !!x.lots62, stats: x.stats || {}, errs: x.errs || [], rows: rows };
          Object.keys(keys).forEach(function (k) { var v = keys[k], cur = KEYS[k];
            /* same LOTS-GN / own / pending everywhere; LOTS-62 only where that account uses it */
            if (!cur) KEYS[k] = { gn: v[0], s62: v[1], own: v[2], pd: v[3] }; else { if (v[1] != null) cur.s62 = v[1]; cur.pd = Math.max(cur.pd, v[3]); } });
        });
        var c = r[ACC.length]; CTL = (c && c.exists && c.data()) || {}; CTL.own = CTL.own || {}; CTL.live = CTL.live || {};
        Object.keys(CTL.own).forEach(function (k) { if (!KEYS[k]) KEYS[k] = { gn: null, s62: null, own: +CTL.own[k].q || 0, pd: 0 }; else KEYS[k].own = +CTL.own[k].q || 0; });
        loaded = true; loading = false; drawAcc(); draw();
        /* the LOTS price list (stock of every LOTS product) loads a few seconds after this screen - draw again once it is in */
        var tries = 0, wait = setInterval(function () { var n = typeof lotsPriceByCode !== "undefined" ? Object.keys(lotsPriceByCode).length : 0;
          if (n > 500 || ++tries > 60) { clearInterval(wait); if (n > 500) draw(); } }, 1000);
      }).catch(function (e) { loading = false; var c = $("ivCard"); if (c) c.innerHTML = '<div class="iv-empty">Could not load stock - check internet and press Refresh.</div>'; console.warn("central inventory", e); });
  }
  function nameOf(k) {
    if (/^A:/.test(k)) { var m = typeof STORE !== "undefined" && STORE.asinLotsMap ? STORE.asinLotsMap[k.slice(2)] : null; return (m && (m.name || (m.vendor && m.vendor.item))) || k.slice(2); }
    var p = typeof lotsPriceByCode !== "undefined" ? lotsPriceByCode[k] : null; return p ? p.name : (CTL.own[k] && CTL.own[k].n) || "LOTS " + k;
  }
  /* listings per stock key, all accounts */
  function byKey() {
    var M = {};
    ACC.forEach(function (a) { var P = PLAN[a[0]]; if (!P) return;
      P.rows.forEach(function (r) { if (!r[2]) return; r[2].split("+").forEach(function (part) { var k = part.split("*")[0]; (M[k] = M[k] || []).push({ acct: a[0], an: a[1], sku: r[0], asin: r[1], need: +part.split("*")[1] || 1, target: r[3], amz: r[4], st: r[5], combo: r[2].indexOf("+") > 0 }); }); });
    });
    return M;
  }
  function freeOf(K, sasta) { var lots = Math.max(K.gn || 0, sasta ? K.s62 || 0 : 0); return lots + (K.own || 0) - (K.pd || 0); }

  /* ---------- accounts: who owns the Amazon stock ---------- */
  function drawAcc() {
    $("ivAcc").innerHTML = ACC.map(function (a) {
      var P = PLAN[a[0]], on = !!CTL.live[a[0]], s = (P && P.stats) || {};
      return '<div class="iv-ac' + (on ? " live" : "") + '"><h4>' + esc(a[1]) + '<span class="iv-own ' + (on ? "aikm" : "oms") + '">' + (on ? "AIKM tool · LIVE" : "OMS Guru") + "</span></h4>" +
        '<div class="m">' + (P ? "<b>" + nf(s.linked) + "</b> listings linked · <b>" + nf(s.diff) + "</b> differ from Amazon<br><b>" + nf(s.unlinked) + "</b> not linked · pending <b>" + nf(s.pendingUnits) + "</b> units<br>" +
          (on ? "Last push: <b>" + nf(s.pushed) + "</b> updated" + (s.failed ? ', <b style="color:#B42318">' + s.failed + " failed</b>" : "") + " · " : "Preview only · ") + "checked " + ago(P.at) + (P.broken ? '<br><b style="color:#B42318">Stock looks broken - nothing pushed</b>' : "")
          : "Waiting for this account's first sync with the new robot (up to 15 min).") + "</div>" +
        (on ? '<button type="button" class="iv-btn" data-sw="' + a[0] + '" data-to="0"><i class="ti ti-arrow-back-up"></i>Hand back to OMS Guru</button>'
            : '<button type="button" class="iv-btn gold" data-sw="' + a[0] + '" data-to="1"><i class="ti ti-bolt"></i>Run stock from AIKM tool</button>') + "</div>";
    }).join("");
  }
  async function switchAcc(acct, on) {
    var name = (ACC.find(function (a) { return a[0] === acct; }) || [])[1];
    var ok = typeof askPremiumConfirm === "function" ? await askPremiumConfirm({ kicker: on ? "Switch stock to AIKM tool" : "Hand stock back to OMS Guru", title: esc(name),
      message: on ? "From the next sync (about 15 min) this tool sets the Amazon stock of every LOTS-linked listing of " + name + ".\n\nIMPORTANT - do this in OMS Guru too, or both will fight:\nOMS Guru → Channels → " + name + " Amazon → switch OFF inventory sync.\n\nThe old out-of-stock rule is switched off for this account. You can hand it back any time."
        : "The tool stops setting Amazon stock for " + name + " from the next sync.\n\nSwitch inventory sync back ON in OMS Guru for this channel.", confirmLabel: on ? "Switch to AIKM tool" : "Hand back" }) : confirm("Switch?");
    if (!ok) return;
    var patch = {}; patch[acct] = on;
    try { await fbDb.collection("aikm_admin").doc("invCentral").set({ live: patch, liveAt: { [acct]: Date.now() } }, { merge: true }); CTL.live[acct] = on; drawAcc(); toast(on ? "✓ " + name + " - AIKM tool takes over at the next sync" : "✓ " + name + " handed back to OMS Guru"); }
    catch (e) { toast("⚠ Not saved: " + (e.message || e), true); }
  }

  /* ---------- own stock ---------- */
  async function saveOwn() {
    var ins = [].slice.call(document.querySelectorAll(".iv-own-in.dirty")); if (!ins.length) return;
    var own = {}, now = Date.now();
    ins.forEach(function (i) { var k = i.dataset.k, v = Math.max(0, Math.floor(parseFloat(i.value) || 0)); own[k] = { q: v, n: nameOf(k).slice(0, 80), at: now }; });
    try {
      await fbDb.collection("aikm_admin").doc("invCentral").set({ own: own, ownAt: now }, { merge: true });
      Object.keys(own).forEach(function (k) { CTL.own[k] = own[k]; (KEYS[k] = KEYS[k] || { gn: null, s62: null, pd: 0 }).own = own[k].q; });
      toast("✓ Own stock saved for " + ins.length + " product" + (ins.length > 1 ? "s" : "") + " - Amazon updates at the next sync"); draw();
    } catch (e) { toast("⚠ Not saved: " + (e.message || e), true); }
  }

  /* ---------- table (owner 20 Nov 2026: top search + column filters + account filter, rows load while scrolling) ---------- */
  var T = "centralinv", acc = "", CUR = [], CUR_UNL = [], shownN = 0, STEP = 100;
  var COLS = [
    { key: "name", label: "Product", w: "26%" },
    { key: "gn", label: "LOTS-GN", num: true, right: true },
    { key: "s62", label: "LOTS-62", num: true, right: true },
    { key: "own", label: "Own stock", num: true, right: true },
    { key: "pd", label: "Pending", num: true, right: true },
    { key: "fin", label: "Final stock", num: true, right: true },
    { key: "st", label: "Stock", asc: "A → Z", desc: "Z → A" },
    { key: "amz", label: "Amazon listings · stock we set (Amazon now)", asc: "A → Z", desc: "Z → A" }
  ];
  var hasCM = function () { return typeof CM !== "undefined" && typeof cmHead === "function" && typeof cmApply === "function"; };
  if (hasCM()) { CM.cols[T] = COLS; CM.render[T] = function () { draw(); }; }
  function tile(key, label, col, n, sub) { return '<button type="button" class="iv-t' + (filt === key ? " on" : "") + '" data-f="' + key + '"><div class="l"><span class="d" style="background:' + col + '"></span>' + label + '</div><div class="n">' + nf(n) + '</div><div class="s">' + sub + "</div></button>"; }
  function rowHtml(r) { var K = r.K, vend = /^A:/.test(r.k);
    var ch = r.L.map(function (x) { var t = x.target == null ? "—" : nf(x.target); return '<span class="iv-ch ' + (x.st === "diff" ? "diff" : x.st === "fail" ? "fail" : "") + '" title="' + esc(x.sku) + (x.need !== 1 ? " · uses " + x.need + " per listing" : "") + (x.combo ? " · combo" : "") + '">' + esc(x.an) + " <b>" + t + "</b>" + (x.target != null && x.amz !== x.target ? ' <span style="color:#8B909B">(' + nf(x.amz) + ")</span>" : "") + "</span>"; }).join("");
    return '<tr><td><div style="font-weight:500;max-width:340px;line-height:1.35">' + esc(r.name) + '</div><div class="iv-sub">' + (vend ? "Vendor product · ASIN " + esc(r.k.slice(2)) : "LOTS code " + esc(r.k)) + "</div></td>" +
      '<td class="r">' + (vend ? "—" : nf(K.gn)) + '</td><td class="r">' + (vend ? "—" : nf(K.s62)) + "</td>" +
      '<td class="r"><input class="iv-own-in" type="number" min="0" step="1" data-k="' + esc(r.k) + '" data-v="' + (K.own || 0) + '" value="' + (K.own || 0) + '"></td>' +
      '<td class="r">' + (K.pd ? '<span style="color:#A86A12;font-weight:600">' + nf(K.pd) + "</span>" : "0") + "</td>" +
      '<td class="r"><span class="iv-q ' + (r.oos ? "bad" : "ok") + '">' + nf(Math.max(0, Math.floor(r.freeGN))) + "</span>" + (r.free !== r.freeGN ? '<div class="iv-sub">Sasta ' + nf(Math.max(0, Math.floor(r.free))) + "</div>" : "") + "</td>" +
      '<td><span class="iv-st ' + (r.oos ? "bad" : "ok") + '">' + (r.oos ? "Out of stock" : "In stock") + "</span></td>" +
      "<td>" + (ch || '<span class="iv-sub">' + (K.mappedOnly ? "Mapped to LOTS · no live listing on these accounts" : "No Amazon listing linked yet") + "</span>") + "</td></tr>"; }
  function unlHtml(u) { return "<tr><td>" + esc(u.acct) + '</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:11.5px">' + esc(u.sku) + '</td><td><a href="https://www.amazon.in/dp/' + esc(u.asin) + '" target="_blank" rel="noopener">' + esc(u.asin) + '</a></td><td class="r">' + nf(u.amz) +
      "</td><td>" + (u.why === "unlinked" ? "Not mapped to LOTS / a vendor - stock not managed" : "Not in LOTS - type its own stock in the table to manage it") + "</td><td>" + (u.asin ? '<button type="button" class="iv-btn" data-map="' + esc(u.asin) + '"><i class="ti ti-link"></i>Map</button>' : "") + "</td></tr>"; }
  /* next 100 rows are added at the bottom while scrolling - no "Show more" button */
  function more() {
    var tb = $("ivBody"); if (!tb) return;
    var src2 = filt === "unl" ? CUR_UNL : CUR; if (shownN >= src2.length) return;
    var next = src2.slice(shownN, shownN + STEP); shownN += next.length;
    tb.insertAdjacentHTML("beforeend", next.map(filt === "unl" ? unlHtml : rowHtml).join(""));
    var e = $("ivEnd"); if (e) e.textContent = shownN < src2.length ? "Scroll for more · " + nf(src2.length - shownN) + " left" : "";
  }
  function draw() {
    var card = $("ivCard"); if (!card || !loaded) return;
    var M = byKey();
    /* owner 17 Nov 2026: show the LOTS stock of EVERY product mapped to LOTS (also ones with no live listing on these accounts) */
    var LP = typeof lotsPriceByCode !== "undefined" ? lotsPriceByCode : {}, AM = typeof STORE !== "undefined" && STORE.asinLotsMap ? STORE.asinLotsMap : {};
    Object.keys(AM).forEach(function (asin) { var m = AM[asin]; if (!m || (m.vendorName && String(m.vendorName).toUpperCase() !== "LOTS")) return;
      (Array.isArray(m.parts) && m.parts.length ? m.parts : (m.code ? [{ code: m.code }] : [])).forEach(function (x) { var k = String(x.code || ""); if (!k || /^(BUNDLE|VENDOR):/.test(k)) return;
        if (!KEYS[k]) KEYS[k] = { gn: null, s62: null, own: CTL.own[k] ? +CTL.own[k].q || 0 : 0, pd: 0, mappedOnly: true }; }); });
    Object.keys(KEYS).forEach(function (k) { var K = KEYS[k]; if (K.gn == null && !/^A:/.test(k) && LP[k] && LP[k].qty != null && isFinite(parseFloat(LP[k].qty))) K.gn = parseFloat(LP[k].qty); });
    var keys = Object.keys(KEYS).filter(function (k) { return M[k] || KEYS[k].mappedOnly || (CTL.own[k] && +CTL.own[k].q > 0); });
    var rows = keys.map(function (k) { var K = KEYS[k], L = M[k] || [], free = freeOf(K, true), freeGN = freeOf(K, false), vend = /^A:/.test(k), oos = freeGN < (vend ? 1 : 10);
      var diff = L.some(function (x) { return x.st === "diff" || x.st === "fail"; });
      return { k: k, K: K, L: L, name: nameOf(k), free: free, freeGN: freeGN, oos: oos, diff: diff, own: (K.own || 0) > 0, pend: (K.pd || 0) > 0,
        v: { name: nameOf(k), gn: vend ? null : K.gn, s62: vend ? null : K.s62, own: K.own || 0, pd: K.pd || 0, fin: Math.max(0, Math.floor(freeGN)), st: oos ? "Out of stock" : "In stock",
          amz: !L.length ? "No Amazon listing" : diff ? "Amazon differs - fixed at next push" : "Matches Amazon" } }; });
    var unl = []; ACC.forEach(function (a) { if (acc && acc !== a[0]) return; var P = PLAN[a[0]]; if (P) P.rows.forEach(function (r) { if (r[5] === "unlinked" || r[5] === "nostock") unl.push({ acct: a[1], sku: r[0], asin: r[1], amz: r[4], why: r[5] }); }); });
    if (acc) rows = rows.filter(function (r) { return r.L.some(function (x) { return x.acct === acc; }); });
    var nL = rows.filter(function (r) { return !/^A:/.test(r.k); }).length, nV = rows.length - nL;
    rows = rows.filter(function (r) { return src === "all" || (src === "lots") === !/^A:/.test(r.k); });
    var list = filt === "oos" ? rows.filter(function (r) { return r.oos; }) : filt === "in" ? rows.filter(function (r) { return !r.oos; }) : filt === "own" ? rows.filter(function (r) { return r.own; })
      : filt === "pend" ? rows.filter(function (r) { return r.pend; }) : filt === "diff" ? rows.filter(function (r) { return r.diff; }) : rows;
    if (q) { list = list.filter(function (r) { return (r.name + " " + r.k + " " + r.L.map(function (x) { return x.sku + " " + x.asin; }).join(" ")).toLowerCase().indexOf(q) >= 0; });
      unl = unl.filter(function (u) { return (u.acct + " " + u.sku + " " + u.asin).toLowerCase().indexOf(q) >= 0; }); }
    list.sort(function (a, b) { return (b.pend - a.pend) || (a.free - b.free); });
    var base = list.length;
    if (hasCM()) { CM.rows[T] = list; list = cmApply(T, list, COLS); }
    CUR = list; CUR_UNL = unl; shownN = 0;
    var head = '<div class="iv-k">' + tile("all", src === "vendor" ? "Vendor products" : src === "lots" ? "LOTS products" : "All products", "#14213D", rows.length, src === "lots" ? "mapped to LOTS" : "products") + tile("in", "In stock", "#1E7A4B", rows.filter(function (r) { return !r.oos; }).length, "10+ free") +
      tile("oos", "Out of stock", "#B42318", rows.filter(function (r) { return r.oos; }).length, "under 10 free") + tile("pend", "Pending orders", "#C9A24B", rows.filter(function (r) { return r.pend; }).length, "products blocked") +
      tile("own", "Own stock", "#1F4E8C", rows.filter(function (r) { return r.own; }).length, "products in your godown") + tile("diff", "Amazon differs", "#A86A12", rows.filter(function (r) { return r.diff; }).length, "fixed at next push") + "</div>";
    var seg = function (v, l, n) { return '<button type="button" class="iv-sg' + (src === v ? " on" : "") + '" data-src="' + v + '">' + l + (n != null ? " · " + nf(n) : "") + "</button>"; };
    var accSel = '<select class="iv-sel" id="ivAccSel" title="Show one Amazon account"><option value="">All accounts</option>' + ACC.map(function (a) { return '<option value="' + a[0] + '"' + (acc === a[0] ? " selected" : "") + ">" + esc(a[1]) + "</option>"; }).join("") + "</select>";
    var tools = '<div class="iv-tools ap-tools"><div class="ap-search"><i class="ti ti-search"></i><input type="text" id="ivQ" placeholder="Search product, LOTS code, SKU or ASIN…" value="' + esc(q) + '"></div><span class="iv-seg">' + seg("lots", "LOTS products", nL) + seg("vendor", "Vendor products", nV) + seg("all", "All") + "</span>" + accSel +
      '<button type="button" class="iv-btn' + (filt === "unl" ? " gold" : "") + '" data-f="' + (filt === "unl" ? "all" : "unl") + '"><i class="ti ti-link-off"></i>Not linked · ' + nf(unl.length) + '</button><button type="button" class="iv-btn pri" id="ivSave" data-save style="display:none"></button>' +
      '<span class="ap-count">' + nf(filt === "unl" ? unl.length : list.length) + (filt === "unl" ? " listings" : " products") + "</span></div>";
    var bar = filt !== "unl" && hasCM() && typeof cmBar === "function" ? cmBar(T, list.length, base, "products") : "";
    var thead = filt === "unl" ? '<thead><tr><th>Account</th><th>SKU</th><th>ASIN</th><th class="r">Amazon stock</th><th>Why</th><th></th></tr></thead>'
      : hasCM() ? cmHead(T, COLS) : '<thead><tr>' + COLS.map(function (c) { return '<th' + (c.right ? ' class="r"' : "") + ">" + c.label + "</th>"; }).join("") + "</tr></thead>";
    var n = filt === "unl" ? unl.length : list.length;
    var focus = document.activeElement && document.activeElement.id === "ivQ";
    card.innerHTML = head + tools + bar + '<div class="iv-scroll" id="ivScroll"><table class="iv-tbl">' + thead + '<tbody id="ivBody"></tbody></table>' +
      (n ? '<div class="iv-end" id="ivEnd"></div>' : '<div class="iv-empty">Nothing here' + (q || acc || (hasCM() && cmActive(T)) ? " - clear the search or filters." : ".") + "</div>") + "</div>";
    more();
    var sc = $("ivScroll"); sc.addEventListener("scroll", function () { if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 400) more(); }, { passive: true });
    if (sc.scrollHeight <= sc.clientHeight + 10) more();
    var qi = $("ivQ"); qi.oninput = function (e) { var had = document.activeElement === e.target; q = e.target.value.toLowerCase(); draw(); if (had) { var x = $("ivQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); } };
    if (focus) qi.focus();
    $("ivAccSel").onchange = function (e) { acc = e.target.value; draw(); };
    countDirty();
    var cnt = $("invCount"); if (cnt) cnt.textContent = nf(rows.filter(function (r) { return r.oos; }).length);
  }

  var tries = 0;
  function start() { if (!shell()) return ++tries < 100 ? setTimeout(start, 300) : null;
    if (OPEN_NOW) { window.switchSpapiSubtabKpi(TAB); try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
