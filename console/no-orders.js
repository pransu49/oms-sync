/* ===== AIKM NO ORDERS (owner 26 Nov 2026: "an option where I can see no orders has been received on ASIN from last 15 days, on all accounts") =====
   Header button "No orders 15d · N" on the Amazon page. Pop-up lists every ASIN that is in stock on at least one of our accounts and got
   NO order in the last N days (7 / 15 / 30 / 60) - on ALL accounts together (default) or on one account (chips).
   Data: main listingIndex/<acct> of all 5 accounts (robot adds lo = last order day of the ASIN on that account from its 90-day order
   snapshot, od = listing date, n = title). Firebase: 5 reads per page open (cached 5 min), 0 writes.
   Loaded by the block at the end of console/amazon-name-search.js (aikmNoOrdersJs). ===== */
(function () {
  if (window.__aikmNoOrders) return; window.__aikmNoOrders = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, b) { try { spToast(m, b); } catch (e) { alert(m); } };
  var ACC = [["praso", "Praso"], ["sastastore", "Sasta Store"], ["vishal", "Vishal"], ["munda", "Munda"], ["aikm", "AIKM"]];
  try { (SPAPI_ACCOUNTS || []).forEach(function (a) { if (a && a.label && !ACC.some(function (x) { return x[0] === a.label; })) ACC.push([a.label, a.name || a.label]); }); } catch (e) {}
  var accName = function (l) { var f = ACC.find(function (x) { return x[0] === l; }); return f ? f[1] : l; };
  var DATA = null, at = 0, busy = null, days = 15, accF = "all", q = "", shown = 100, waitAcc = [];

  var css = document.createElement("style");
  css.textContent =
    "#noOpen b{margin-left:6px;background:#A86A12;color:#fff;border-radius:10px;padding:0 7px;font-size:11.5px}" +
    ".no-ov{position:fixed;inset:0;background:rgba(15,30,53,.5);z-index:1500;display:none;align-items:center;justify-content:center;padding:16px}" +
    ".no-box{background:#fff;border-radius:16px;width:min(1280px,98vw);height:min(900px,94vh);display:flex;flex-direction:column;overflow:hidden;border-top:3px solid #C9A24B;box-shadow:0 24px 70px rgba(15,30,53,.3);font-family:Inter,system-ui,sans-serif}" +
    ".no-head{display:flex;align-items:flex-start;gap:14px;padding:18px 22px 10px}.no-head h3{font:600 18px Lexend,sans-serif;margin:4px 0 0;color:#14213D}" +
    ".no-k{font:600 10.5px Lexend,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#B08A36}.no-sub{font-size:12.5px;color:#6B7280;margin-top:4px;line-height:1.5}" +
    ".no-x{all:unset;cursor:pointer;margin-left:auto;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#4A5468}.no-x:hover{background:#FBF9F4}" +
    ".no-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 22px;border-top:1px solid #F0ECE2;border-bottom:1px solid #F0ECE2;background:#FBF9F4}" +
    ".no-chip{all:unset;cursor:pointer;font:600 12.5px Inter,sans-serif;padding:7px 12px;border-radius:999px;border:1px solid #E7E1D3;background:#fff;color:#4A5468}.no-chip.on{background:#0F1E35;border-color:#0F1E35;color:#fff}" +
    ".no-chip b{margin-left:5px;color:#A86A12}.no-chip.on b{color:#fff}.no-sep{width:1px;height:22px;background:#E7E1D3;margin:0 4px}" +
    ".no-q{height:34px;border:1px solid #E7E1D3;border-radius:9px;padding:0 12px;font:13px Inter,sans-serif;width:230px;outline:none}.no-q:focus{border-color:#C9A24B}" +
    ".no-dl{all:unset;cursor:pointer;margin-left:auto;font:600 12.5px Inter,sans-serif;padding:8px 14px;border-radius:9px;background:#0F1E35;color:#fff}" +
    ".no-note{padding:8px 22px;font-size:12px;color:#A86A12;background:#FFF8E8;border-bottom:1px solid #F3E3BC}" +
    ".no-scroll{flex:1;overflow:auto}.no-t{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px}" +
    ".no-t th{position:sticky;top:0;background:#fff;text-align:left;font:600 11px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8B909B;padding:10px 14px;border-bottom:1px solid #E7E1D3;white-space:nowrap;z-index:1}" +
    ".no-t td{padding:12px 14px;border-bottom:1px solid #F0ECE2;vertical-align:middle;color:#14213D}.no-t tr:hover td{background:#FCFAF5}.no-t .r{text-align:right;font-variant-numeric:tabular-nums}" +
    ".no-pc{display:flex;align-items:center;gap:12px}.no-im{flex:none;width:48px;height:48px;border:1px solid #E7E1D3;border-radius:9px;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;color:#C9C3B4}.no-im img{width:100%;height:100%;object-fit:contain;padding:2px;box-sizing:border-box}" +
    ".no-nm{font-weight:600;max-width:420px;line-height:1.35}.no-s{font-size:11.5px;color:#8B909B;margin-top:3px}.no-s a{color:inherit}" +
    ".no-ac{display:inline-block;font-size:11.5px;border:1px solid #E7E1D3;border-radius:7px;padding:3px 8px;margin:2px 4px 2px 0;white-space:nowrap;background:#fff}.no-ac.oos{opacity:.5}" +
    ".no-last{font-weight:600;color:#B42318}.no-last.never{color:#6B7280}.no-new{display:inline-block;font-size:10.5px;font-weight:700;background:#E7F0FB;color:#1F4E8C;border-radius:5px;padding:1px 6px;margin-left:6px}" +
    ".no-empty{padding:70px 20px;text-align:center;color:#8B909B}.no-more{all:unset;cursor:pointer;display:block;margin:14px auto;font:600 12.5px Inter,sans-serif;padding:8px 16px;border-radius:9px;border:1px solid #E7E1D3}";
  document.head.appendChild(css);

  function load(force) {
    if (!force && DATA && Date.now() - at < 5 * 60e3) return Promise.resolve(DATA);
    if (busy) return busy;
    var db = typeof fbDb !== "undefined" ? fbDb : null; if (!db) return Promise.reject(new Error("Not connected"));
    busy = Promise.all(ACC.map(function (a) { return db.collection("listingIndex").doc(a[0]).get().then(function (d) { return [a[0], (d.exists && d.data().skus) || {}]; }).catch(function () { return [a[0], {}]; }); }))
      .then(function (res) { DATA = res; at = Date.now(); busy = null; return res; }, function (e) { busy = null; throw e; });
    return busy;
  }
  var dayMs = 864e5, today = function () { return Date.now(); };
  function ago(d) { if (!d) return null; var t = Date.parse(d + "T12:00:00+05:30"); return isNaN(t) ? null : Math.floor((today() - t) / dayMs); }
  function fmtDay(d) { var t = new Date(d + "T12:00:00+05:30"); return isNaN(t) ? d : t.getDate() + " " + t.toLocaleString("en-US", { month: "short" }); }

  /* one row per ASIN: listings of the chosen accounts, last order = newest across them */
  function build() {
    var by = {}; waitAcc = [];
    (DATA || []).forEach(function (r) {
      var a = r[0], sk = r[1], keys = Object.keys(sk);
      if (keys.length && !keys.some(function (k) { return sk[k] && sk[k].lo !== undefined; })) waitAcc.push(accName(a));
      if (accF !== "all" && a !== accF) return;
      keys.forEach(function (sku) { var v = sk[sku] || {}, asin = String(v.a || "").toUpperCase(); if (!asin || v.lo === undefined) return;
        var g = by[asin] || (by[asin] = { asin: asin, name: "", img: "", lo: "", od: "", stock: 0, ls: [] });
        g.ls.push({ acct: a, sku: sku, p: v.p, q: +v.q || 0, fba: v.fc === 1 });
        if (!g.name && v.n) g.name = v.n; if (!g.img && v.i) g.img = v.i;
        if (v.lo && v.lo > g.lo) g.lo = v.lo; if (v.od && (!g.od || v.od < g.od)) g.od = v.od;
        g.stock += Math.max(0, +v.q || 0); });
    });
    return Object.keys(by).map(function (k) { var g = by[k]; g.since = g.lo ? ago(g.lo) : null; g.age = g.od ? ago(g.od) : null; return g; })
      .filter(function (g) { return g.stock > 0 && (g.since == null || g.since >= days); });
  }
  function rowsNow() {
    var s = q.trim().toLowerCase();
    return build().filter(function (g) { return !s || (g.name + " " + g.asin + " " + g.ls.map(function (l) { return l.sku; }).join(" ")).toLowerCase().indexOf(s) >= 0; })
      .sort(function (a, b) { return b.stock - a.stock || (b.since == null ? 999 : b.since) - (a.since == null ? 999 : a.since); });
  }
  function btn() {
    var b = $("noOpen"); if (b) return b;
    var ref = $("llOpen") || $("psOpen") || $("rlOpen") || $("aaOpen"); if (!ref || !ref.parentNode) return null;
    b = document.createElement("button"); b.type = "button"; b.id = "noOpen"; b.className = ref.className || "aa-open";
    b.title = "In-stock ASINs with no order in the last 15 days, on all our Amazon accounts";
    b.onclick = open; ref.parentNode.insertBefore(b, ref.nextSibling); return b;
  }
  function paint() { var b = btn(); if (!b) return; var n = DATA ? build().length : 0; b.innerHTML = "💤 No orders " + days + "d" + (DATA ? "<b>" + n + "</b>" : ""); }
  function overlay() {
    var o = $("noOv"); if (o) return o;
    document.body.insertAdjacentHTML("beforeend", '<div class="no-ov" id="noOv"><div class="no-box"><div class="no-head"><div><div class="no-k">All Amazon accounts</div><h3>No orders in the last <span id="noDaysT">15</span> days</h3>' +
      '<div class="no-sub">In-stock ASINs that got no order on any of the chosen accounts. Most stock first. Last order looks back up to 90 days.</div></div><button type="button" class="no-x" id="noX" title="Close (Esc)">×</button></div>' +
      '<div class="no-bar" id="noBar"></div><div id="noNote"></div><div class="no-scroll" id="noBody"></div></div></div>');
    o = $("noOv");
    o.addEventListener("click", function (e) {
      if (e.target === o || e.target.closest("#noX")) { o.style.display = "none"; return; }
      var c = e.target.closest("[data-d]"); if (c) { days = +c.dataset.d; shown = 100; draw(); paint(); return; }
      c = e.target.closest("[data-a]"); if (c) { accF = c.dataset.a; shown = 100; draw(); return; }
      if (e.target.closest("#noMore")) { shown += 100; draw(); return; }
      if (e.target.closest("#noDl")) dl();
    });
    o.addEventListener("input", function (e) { if (e.target.id === "noQ") { q = e.target.value; shown = 100; drawBody(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && o.style.display === "flex") o.style.display = "none"; });
    return o;
  }
  function draw() {
    $("noDaysT").textContent = days;
    var counts = {}; var keep = accF; ACC.forEach(function (a) { accF = a[0]; counts[a[0]] = build().length; }); accF = "all"; counts.all = build().length; accF = keep;
    $("noBar").innerHTML = [7, 15, 30, 60].map(function (d) { return '<button type="button" class="no-chip' + (d === days ? " on" : "") + '" data-d="' + d + '">' + d + " days</button>"; }).join("") +
      '<span class="no-sep"></span><button type="button" class="no-chip' + (accF === "all" ? " on" : "") + '" data-a="all">All accounts<b>' + counts.all + "</b></button>" +
      ACC.map(function (a) { return counts[a[0]] ? '<button type="button" class="no-chip' + (accF === a[0] ? " on" : "") + '" data-a="' + a[0] + '">' + esc(a[1]) + "<b>" + counts[a[0]] + "</b></button>" : ""; }).join("") +
      '<input class="no-q" id="noQ" placeholder="Search product, ASIN or SKU…" value="' + esc(q) + '"><button type="button" class="no-dl" id="noDl">⬇ Download CSV</button>';
    $("noNote").innerHTML = waitAcc.length ? '<div class="no-note">' + esc(waitAcc.join(", ")) + ": last-order data arrives with the next sync of " + (waitAcc.length > 1 ? "those accounts" : "that account") + " (about 15 min) — not counted yet.</div>" : "";
    drawBody();
  }
  function drawBody() {
    var R = rowsNow(), part = R.slice(0, shown);
    $("noBody").innerHTML = !R.length ? '<div class="no-empty">' + (DATA ? "Every in-stock ASIN got an order in the last " + days + " days." : "Loading…") + "</div>" :
      '<table class="no-t"><thead><tr><th>Product</th><th>Listed on (price · stock)</th><th class="r">Total stock</th><th>Last order</th><th>Listed since</th></tr></thead><tbody>' +
      part.map(function (g) {
        var img = g.img ? '<img loading="lazy" alt="" src="' + esc(String(g.img).replace(/\.([a-z]+)$/i, "._SL120_.$1")) + '" onerror="this.remove()">' : "—";
        return "<tr><td><div class=\"no-pc\"><a class=\"no-im\" href=\"https://www.amazon.in/dp/" + esc(g.asin) + '" target="_blank" rel="noopener">' + img + '</a><div><div class="no-nm">' + esc(g.name || "Title loads with the next sync") +
          (g.age != null && g.age < days ? '<span class="no-new" title="Listed less than ' + days + ' days ago">New · ' + g.age + " d</span>" : "") + '</div><div class="no-s"><a href="https://www.amazon.in/dp/' + esc(g.asin) + '" target="_blank" rel="noopener">' + esc(g.asin) + "</a></div></div></div></td>" +
          "<td>" + g.ls.sort(function (a, b) { return b.q - a.q; }).map(function (l) { return '<span class="no-ac' + (l.q > 0 ? "" : " oos") + '" title="SKU ' + esc(l.sku) + '">' + esc(accName(l.acct)) + (l.fba ? " FBA" : "") + (l.p != null ? " · ₹" + l.p : "") + " · " + l.q + "</span>"; }).join("") + "</td>" +
          '<td class="r"><b>' + g.stock + "</b></td>" +
          "<td>" + (g.lo ? '<span class="no-last">' + g.since + " days ago</span><div class=\"no-s\">" + fmtDay(g.lo) + "</div>" : '<span class="no-last never">None in 90 days</span>') + "</td>" +
          "<td>" + (g.od ? fmtDay(g.od) + '<div class="no-s">' + g.age + " days</div>" : "—") + "</td></tr>";
      }).join("") + "</tbody></table>" + (R.length > shown ? '<button type="button" class="no-more" id="noMore">Show 100 more (' + (R.length - shown) + " left)</button>" : "");
  }
  function dl() {
    var R = rowsNow(), cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [["ASIN", "Product", "Total stock", "Last order", "Days since last order", "Listed since", "Listings (account · SKU · price · stock)"].join(",")]
      .concat(R.map(function (g) { return [g.asin, g.name, g.stock, g.lo || "none in 90 days", g.since == null ? "" : g.since, g.od || "",
        g.ls.map(function (l) { return accName(l.acct) + " · " + l.sku + " · " + (l.p != null ? l.p : "") + " · " + l.q; }).join(" | ")].map(cell).join(","); }));
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
    a.download = "No orders " + days + " days " + (accF === "all" ? "all accounts" : accName(accF)) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }
  function open() {
    var o = overlay(); o.style.display = "flex"; draw();
    load(false).then(function () { draw(); paint(); }).catch(function (e) { toast("⚠ Could not load: " + (e.message || e), true); });
  }
  (function start(n) {
    if (!btn()) { if (n < 60) setTimeout(function () { start(n + 1); }, 1000); return; }
    paint();
    setTimeout(function () { load(false).then(paint).catch(function () {}); }, 6000);
  })(0);
})();
