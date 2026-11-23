/* ===== AIKM LISTINGS IN LOSS (owner 23 Nov 2026: "check for loss and make visible") =====
   Header button "In loss · N" on the Amazon page: every listing of the open account whose profit per order at today's price is
   below ₹0 (robot maths from listingIndex/<acct>: price + buyer shipping - cost - courier - Amazon fees). Listings the robot created
   (SKU N-...) are tagged "Robot listing". Each row: price now, profit, safe price (lowest that earns ₹15 or 10%), target price
   (₹20 profit) and a price box + Push. "Push safe price to all ticked" queues them in spapiPriceUpdates (same as the Push button).
   Firebase: 1 read per account per page open (main listingIndex/<acct>, cached 5 min); 1 write per price pushed.
   Loaded by the block at the end of console/amazon-name-search.js (aikmLossListJs). ===== */
(function () {
  if (window.__aikmLossList) return; window.__aikmLossList = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, b) { try { spToast(m, b); } catch (e) { alert(m); } };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var acctName = function () { try { return (SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); }) || {}).name || acct(); } catch (e) { return acct(); } };
  var cache = {}, ROWS = [], filt = "live", tick = new Set();

  var css = document.createElement("style");
  css.textContent =
    "#llOpen{background:#FCECEA!important;color:#B42318!important;border-color:#F3B8B1!important}#llOpen.ok{background:rgba(255,255,255,.08)!important;color:#fff!important;border-color:rgba(255,255,255,.18)!important}" +
    "#llOpen b{margin-left:6px;background:#B42318;color:#fff;border-radius:10px;padding:0 7px;font-size:11.5px}#llOpen.ok b{background:#1E7A4B}" +
    ".ll-ov{position:fixed;inset:0;background:rgba(15,30,53,.5);z-index:1500;display:none;align-items:center;justify-content:center;padding:16px}" +
    ".ll-box{background:#fff;border-radius:16px;width:min(1240px,98vw);height:min(880px,94vh);display:flex;flex-direction:column;overflow:hidden;border-top:3px solid #B42318;box-shadow:0 24px 70px rgba(15,30,53,.3);font-family:Inter,system-ui,sans-serif}" +
    ".ll-head{display:flex;align-items:flex-start;gap:14px;padding:18px 22px 10px}.ll-head h3{font:600 17px Lexend,sans-serif;margin:4px 0 0;color:#14213D}" +
    ".ll-k{font:600 10.5px Lexend,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#B42318}.ll-sub{font-size:12px;color:#8B909B;margin-top:4px;line-height:1.5}" +
    ".ll-x{all:unset;cursor:pointer;margin-left:auto;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#4A5468}.ll-x:hover{background:#FBF9F4}" +
    ".ll-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 22px;border-top:1px solid #F0ECE2;border-bottom:1px solid #F0ECE2;background:#FBF9F4}" +
    ".ll-chip{all:unset;cursor:pointer;font:600 12px Inter,sans-serif;padding:7px 12px;border-radius:9px;border:1px solid #E7E1D3;background:#fff;color:#4A5468}.ll-chip.on{background:#0F1E35;border-color:#0F1E35;color:#fff}" +
    ".ll-q{height:34px;border:1px solid #E7E1D3;border-radius:9px;padding:0 12px;font:13px Inter,sans-serif;width:240px;outline:none}.ll-q:focus{border-color:#C9A24B}" +
    ".ll-go{all:unset;cursor:pointer;margin-left:auto;font:600 12.5px Inter,sans-serif;padding:8px 14px;border-radius:9px;background:#0F1E35;color:#fff}.ll-go.dim{opacity:.35;pointer-events:none}" +
    ".ll-scroll{flex:1;overflow:auto}.ll-t{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}" +
    ".ll-t th{position:sticky;top:0;background:#fff;text-align:left;font:600 10.5px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8B909B;padding:9px 12px;border-bottom:1px solid #E7E1D3;white-space:nowrap;z-index:1}" +
    ".ll-t td{padding:10px 12px;border-bottom:1px solid #F0ECE2;vertical-align:middle;color:#14213D}.ll-t .r{text-align:right;font-variant-numeric:tabular-nums}" +
    ".ll-pc{display:flex;align-items:center;gap:10px}.ll-im{flex:none;width:44px;height:44px;border:1px solid #E7E1D3;border-radius:8px;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center}.ll-im img{width:100%;height:100%;object-fit:contain;padding:2px;box-sizing:border-box}" +
    ".ll-nm{font-weight:500;max-width:380px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ll-s{font-size:11px;color:#8B909B;margin-top:2px}" +
    ".ll-loss{display:inline-block;background:#FEE4E2;color:#B42318;font-weight:700;border-radius:20px;padding:2px 9px}.ll-tag{display:inline-block;font-size:10px;font-weight:700;background:#F6EEDB;color:#B08A36;border-radius:5px;padding:1px 6px;margin-left:6px}" +
    ".ll-in{width:70px;border:1px solid #E7E1D3;border-radius:7px;padding:5px 7px;font:600 12.5px Inter,sans-serif;text-align:right}.ll-push{all:unset;cursor:pointer;font:600 11.5px Inter,sans-serif;padding:5px 10px;border-radius:7px;border:1px solid #E7E1D3;margin-left:5px}.ll-push:hover{background:#0F1E35;color:#fff;border-color:#0F1E35}" +
    ".ll-empty{padding:70px 20px;text-align:center;color:#8B909B}" +
    "#premiumConfirmModal,#premiumPromptModal{z-index:1700!important}.ll-q2{display:block;font-size:11px;font-weight:600;color:#1E7A4B;margin-top:3px}";
  document.head.appendChild(css);

  /* owner 23 Nov 2026: "deploy option for update mapping, as some have wrong mapping" */
  var remapped = {};
  function mapOf(asin) {
    try { var m = STORE.asinLotsMap && STORE.asinLotsMap[asin];
      if (m) return { saved: true, txt: (m.vendorName && m.vendorName !== "LOTS" ? m.vendorName + " · " : "LOTS · ") + (m.name || m.code || "") };
      var nm = (spapiInventoryRaw || []).find(function (i) { return i.asin === asin && i.name; }), r = nm && typeof resolveSpapiLotsMatch === "function" ? resolveSpapiLotsMatch(nm.name, asin) : null;
      return r ? { saved: false, txt: "Guess · " + (r.name || r.code) } : null; } catch (e) { return null; }
  }
  function fixMap(asin) {
    if (typeof openSpapiMatchModal !== "function") return toast("Mapping window not loaded yet — refresh the page", true);
    var ov = $("llOv"), mm; ov.style.display = "none"; openSpapiMatchModal(asin); mm = $("spapiMatchModal");
    var before = JSON.stringify((STORE.asinLotsMap || {})[asin] || null);
    var ob = new MutationObserver(function () { if (mm.style.display !== "none") return; ob.disconnect();
      if (JSON.stringify((STORE.asinLotsMap || {})[asin] || null) !== before) { remapped[asin] = 1; toast("✓ Mapping saved — profit and safe price update after the next sync (~15 min)"); }
      ov.style.display = "flex"; rows(); });
    ob.observe(mm, { attributes: true, attributeFilter: ["style"] });
  }
  function load(force) {
    var a = acct(), c = cache[a];
    if (!force && c && Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.d);
    if (typeof fbDb === "undefined" || !fbDb) return Promise.reject(new Error("not connected"));
    return fbDb.collection("listingIndex").doc(a).get().then(function (d) { var x = (d.exists && d.data().skus) || {}; cache[a] = { at: Date.now(), d: x }; return x; });
  }
  function build(skus) {
    var nm = {}; (typeof spapiInventoryRaw !== "undefined" ? spapiInventoryRaw || [] : []).forEach(function (i) { if (i.sku) nm[i.sku] = i; });
    ROWS = Object.keys(skus).map(function (k) { var x = skus[k]; if (x.e == null || !(x.p > 0) || x.e >= 0) return null; var inv = nm[k] || {};
      return { sku: k, asin: x.a || inv.asin || "", name: inv.name || "", img: x.i || inv.img || "", p: x.p, mrp: x.m, q: x.q, e: x.e, f: x.f, t: x.t, c: x.c, robot: /^N-/.test(k) }; })
      .filter(Boolean).sort(function (a, b) { return a.e - b.e; });
  }
  function shown() {
    var q = ($("llQ") && $("llQ").value || "").toLowerCase().trim();
    return ROWS.filter(function (r) { return (filt === "all" || (filt === "live" ? r.q > 0 : filt === "robot" ? r.robot && r.q > 0 : r.q <= 0)) && (!q || (r.name + " " + r.sku + " " + r.asin).toLowerCase().indexOf(q) >= 0); });
  }
  function btn() {
    var b = $("llOpen"); if (b) return b;
    var ref = $("cfOpen") || $("psOpen") || $("rlOpen") || $("aaOpen"); if (!ref || !ref.parentNode) return null;
    b = document.createElement("button"); b.type = "button"; b.id = "llOpen"; b.className = ref.className || "aa-open"; b.title = "Listings that lose money on every order at today's price";
    b.onclick = open; ref.parentNode.insertBefore(b, ref.nextSibling); return b;
  }
  function paint() { var b = btn(); if (!b) return; var n = ROWS.filter(function (r) { return r.q > 0; }).length; b.classList.toggle("ok", !n); b.innerHTML = "📉 In loss<b>" + (n || "✓") + "</b>"; }
  function overlay() {
    var o = $("llOv"); if (o) return o;
    document.body.insertAdjacentHTML("beforeend", '<div class="ll-ov" id="llOv"><div class="ll-box"><div class="ll-head"><div><div class="ll-k">Listings in loss</div><h3 id="llTitle"></h3>' +
      '<div class="ll-sub">Profit per order at today\'s price, same maths as the robot (price + buyer shipping − cost − courier − Amazon fees). <b>Safe</b> = lowest price earning ₹15 or 10%. <b>Target</b> = ₹20 profit. Numbers refresh after each sync.</div></div>' +
      '<button type="button" class="ll-x" id="llX" title="Close (Esc)">×</button></div><div class="ll-bar" id="llBar"></div><div class="ll-scroll" id="llBody"></div></div></div>');
    o = $("llOv");
    $("llX").onclick = close; o.addEventListener("click", function (e) { e.target === o && close(); });
    document.addEventListener("keydown", function (e) { e.key === "Escape" && o.style.display === "flex" && close(); });
    o.addEventListener("click", function (e) {
      var c = e.target.closest("[data-f]"); if (c) { filt = c.dataset.f; draw(); return; }
      var mb = e.target.closest("[data-map]"); if (mb) { fixMap(mb.dataset.map); return; }
      var p = e.target.closest("[data-push]"); if (p) { var r = ROWS.find(function (x) { return x.sku === p.dataset.push; }), inp = o.querySelector('[data-in="' + CSS.escape(p.dataset.push) + '"]');
        if (r && inp) pushOne(r, inp.value); return; }
      if (e.target.id === "llAll") { var s = shown(), all = s.length && s.every(function (r) { return tick.has(r.sku); }); s.forEach(function (r) { all ? tick.delete(r.sku) : tick.add(r.sku); }); draw(); return; }
      if (e.target.id === "llGo") pushTicked();
    });
    o.addEventListener("change", function (e) { var t = e.target.closest("[data-tk]"); if (t) { t.checked ? tick.add(t.dataset.tk) : tick.delete(t.dataset.tk); bar(); } });
    o.addEventListener("input", function (e) { if (e.target.id === "llQ") rows(); });
    return o;
  }
  function bar() {
    var n = function (f) { return ROWS.filter(function (r) { return f === "all" || (f === "live" ? r.q > 0 : f === "robot" ? r.robot && r.q > 0 : r.q <= 0); }).length; };
    var q = $("llQ") ? $("llQ").value : "", k = Array.from(tick).filter(function (s) { return ROWS.some(function (r) { return r.sku === s; }); }).length;
    $("llBar").innerHTML = [["live", "Live (in stock)"], ["robot", "Robot listings"], ["oos", "Out of stock"], ["all", "All"]].map(function (c) { return '<button type="button" class="ll-chip' + (filt === c[0] ? " on" : "") + '" data-f="' + c[0] + '">' + c[1] + " · " + n(c[0]) + "</button>"; }).join("") +
      '<input class="ll-q" id="llQ" placeholder="Search product, SKU or ASIN…" value="' + esc(q) + '"><button type="button" class="ll-go' + (k ? "" : " dim") + '" id="llGo">Push safe price to ' + k + " ticked</button>";
  }
  function rows() {
    var s = shown(), f2 = function (v) { return v == null ? "—" : "₹" + (Math.round(v * 100) / 100).toLocaleString("en-IN"); };
    $("llBody").innerHTML = s.length ? '<table class="ll-t"><thead><tr><th><input type="checkbox" id="llAll" title="Tick all shown"></th><th>Product</th><th>Mapped to</th><th class="r">Stock</th><th class="r">Price now</th><th class="r">Cost</th><th class="r">Profit / order</th><th class="r">Safe price</th><th class="r">Target</th><th class="r">MRP</th><th>New price</th></tr></thead><tbody>' +
      s.map(function (r) { var sug = !remapped[r.asin] && r.f && (!r.mrp || r.f <= r.mrp) ? r.f : null;
        return "<tr><td><input type=\"checkbox\" data-tk=\"" + esc(r.sku) + "\"" + (tick.has(r.sku) ? " checked" : "") + (sug ? "" : " disabled title=\"No price under MRP earns ₹15 - check the cost mapping\"") + "></td>" +
          '<td><div class="ll-pc"><a class="ll-im" href="https://www.amazon.in/dp/' + esc(r.asin) + '" target="_blank" rel="noopener">' + (r.img ? '<img loading="lazy" src="' + esc(String(r.img).replace(/\.([a-z]+)$/i, "._SL100_.$1")) + '" alt="">' : "") + "</a><div><div class=\"ll-nm\">" + esc(r.name || r.sku) + "</div>" +
          '<div class="ll-s">' + esc(r.sku) + (r.robot ? '<span class="ll-tag">Robot listing</span>' : "") + " · " + esc(r.asin) + "</div></div></div></td>" +
          (function () { var m = mapOf(r.asin); return '<td style="min-width:180px">' + (remapped[r.asin] ? '<div class="ll-s" style="color:#1E7A4B;font-weight:600">✓ Updated · new profit after next sync</div>' : "") +
          '<div class="ll-s" style="color:' + (m && m.saved ? "#14213D" : "#A86A12") + ';max-width:220px;line-height:1.35">' + (m ? esc(m.txt) : "Not mapped") + "</div>" +
          '<button type="button" class="ll-push" style="margin:4px 0 0" data-map="' + esc(r.asin) + '">Fix mapping</button></td>'; })() +
          '<td class="r">' + (r.q > 0 ? r.q : '<span style="color:#8B909B">0</span>') + '</td><td class="r"><b>' + f2(r.p) + '</b></td><td class="r">' + f2(r.c) + '</td><td class="r"><span class="ll-loss">₹' + r.e + "</span></td>" +
          '<td class="r">' + (sug ? "<b>₹" + sug + "</b>" : remapped[r.asin] ? '<span style="color:#8B909B">after sync</span>' : '<span style="color:#B42318">above MRP</span>') + '</td><td class="r">' + (r.t ? "₹" + r.t : "—") + '</td><td class="r">' + f2(r.mrp) + "</td>" +
          '<td style="white-space:nowrap"><input class="ll-in" data-in="' + esc(r.sku) + '" type="number" value="' + (sug || "") + '"><button type="button" class="ll-push" data-push="' + esc(r.sku) + '">Push</button>' + (queued[r.sku] ? '<span class="ll-q2">✓ Queued ₹' + queued[r.sku] + ' · next sync</span>' : "") + "</td></tr>"; }).join("") + "</tbody></table>"
      : '<div class="ll-empty">✓ No listings in loss here.</div>';
  }
  function draw() { $("llTitle").textContent = acctName() + " · " + ROWS.filter(function (r) { return r.q > 0; }).length + " live listings lose money"; bar(); rows(); var q = $("llQ"); q.oninput = rows; }
  function open() { overlay().style.display = "flex"; $("llBody").innerHTML = '<div class="ll-empty">Loading…</div>'; $("llBar").innerHTML = "";
    load().then(function (d) { build(d); paint(); draw(); }).catch(function (e) { $("llBody").innerHTML = '<div class="ll-empty">Could not load: ' + esc(e.message || e) + "</div>"; }); }
  function close() { $("llOv").style.display = "none"; }
  var queued = {};
  function write(list) {
    var db = typeof fbDbSpapi !== "undefined" ? fbDbSpapi : null; if (!db) { toast("Not connected — reload the page", true); return Promise.reject(); }
    var b = db.batch(); list.forEach(function (x) { b.set(db.collection("spapiPriceUpdates").doc(acct() + "_" + x.r.sku.replace(/\//g, "%2F")), { account: acct(), sku: x.r.sku, asin: x.r.asin || null, oldPrice: x.r.p, newPrice: x.p, status: "pending", source: "loss-list", requestedAt: firebase.firestore.FieldValue.serverTimestamp() }); });
    return b.commit().then(function () { list.forEach(function (x) { queued[x.r.sku] = x.p; tick.delete(x.r.sku); }); rows(); bar(); })
      .catch(function (e) { toast("⚠ Not queued: " + (e.message || e), true); throw e; });
  }
  function pushOne(r, val) {
    var n = Math.round(parseFloat(val)); if (!(n > 0)) return toast("Type a price first", true);
    if (r.mrp && n > r.mrp) return toast("₹" + n + " is above the MRP ₹" + r.mrp, true);
    var go = function () { write([{ r: r, p: n }]).then(function () { toast("✓ ₹" + r.p + " → ₹" + n + " queued — Amazon updates at the next sync (~15 min)"); }).catch(function () {}); };
    if (typeof askPremiumConfirm !== "function") return go();
    askPremiumConfirm({ kicker: "Push price to Amazon", title: esc(r.name || r.sku), message: "₹" + r.p + " → ₹" + n + (r.f && n < r.f ? "\n\n⚠ Below the safe price ₹" + r.f + " — still a loss / under ₹15 profit." : "") + "\n\nAmazon is updated at the next sync.", confirmLabel: "Push ₹" + n }).then(function (ok) { ok && go(); });
  }
  function pushTicked() {
    var list = ROWS.filter(function (r) { return tick.has(r.sku) && !remapped[r.asin] && r.f && (!r.mrp || r.f <= r.mrp); }); if (!list.length) return;
    var go = function () { write(list.map(function (r) { return { r: r, p: r.f }; })).then(function () { toast("✓ " + list.length + " price" + (list.length > 1 ? "s" : "") + " queued — Amazon updates at the next sync"); }).catch(function () {}); };
    if (typeof askPremiumConfirm === "function") askPremiumConfirm({ kicker: "Push safe prices", title: list.length + " listing" + (list.length > 1 ? "s" : ""), message: "Each ticked listing goes to its SAFE price (lowest that earns ₹15 or 10% per order).\n\nAmazon is updated at the next sync.", confirmLabel: "Queue " + list.length }).then(function (ok) { ok && go(); });
    else go();
  }
  // count on the button: after the page has loaded, and again when the account changes
  var lastA = null;
  setInterval(function () { if (!btn()) return; var a = acct(); if (a === lastA) return; lastA = a; tick.clear(); load().then(function (d) { build(d); paint(); }).catch(function () {}); }, 2000);
})();
