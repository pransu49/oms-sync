/* AIKM · Amazon page · "New listing" (owner, 13 Nov 2026: "create new listing in Seller Central if not available on Amazon")
   Header button next to "Add ASIN". Creates a brand-new PRODUCT on Amazon (new ASIN) for an item Amazon does not have yet —
   usually a LOTS product (name, brand, barcode, MRP, GST, HSN, photo, cost and stock filled from LOTS).
   1. Fill / pick from LOTS → "Check with Amazon" (Amazon only checks, nothing is listed) or "Create on Amazon".
   2. The sync robot (spapi-sync.js applyPendingNewListings, next sync ≈15 min) — if the barcode is already on Amazon it hands
      it to Add ASIN instead (offer on the existing product). Otherwise it asks Amazon to validate; anything Amazon still needs
      comes back as "Needs details" with a box per missing field. When created, the new ASIN is mapped to the LOTS item.
   Firebase (SP-API project): requests in `spapiNewListingRequests` (<acct>_<id>) — 1 write per send, ~1 read per request when the window opens.
   Loaded by the block at the end of console/amazon-name-search.js (aikmNewListingJs). */
(function () {
  if (window.__aikmNewListing) return; window.__aikmNewListing = true;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var acct = function () { return typeof spapiCurrentAccount !== "undefined" ? spapiCurrentAccount : "praso"; };
  var acctName = function () { try { return (SPAPI_ACCOUNTS.find(function (a) { return a.label === acct(); }) || {}).name || acct(); } catch (e) { return acct(); } };
  var db = function () { return typeof fbDbSpapi !== "undefined" ? fbDbSpapi : null; };
  var toast = function (m, bad) { typeof spToast === "function" ? spToast(m, bad) : alert(m); };

  var css = document.createElement("style");
  css.textContent =
    ".nl-ov{position:fixed;inset:0;background:rgba(15,30,53,.5);backdrop-filter:blur(3px);z-index:1700;display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}" +
    ".nl-box{background:#fff;border-radius:18px;width:min(1080px,100%);box-shadow:0 24px 70px rgba(15,30,53,.3);border-top:3px solid var(--gold,#C9A24B);font:13px 'Inter',system-ui,sans-serif;color:var(--ink,#14213D);overflow:hidden}" +
    ".nl-hd{display:flex;align-items:flex-start;gap:14px;padding:20px 24px 14px;border-bottom:1px solid var(--line-2,#F0ECE2)}" +
    ".nl-k{font:600 10.5px 'Lexend',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-2,#B08A36)}.nl-hd h3{font:600 18px 'Lexend',sans-serif;margin:3px 0 4px}" +
    ".nl-sub{font-size:12.5px;color:var(--muted,#8B909B);max-width:720px;line-height:1.5}.nl-x{all:unset;cursor:pointer;margin-left:auto;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--muted)}.nl-x:hover{background:#F4F1EA;color:var(--ink)}" +
    ".nl-tabs{display:flex;gap:4px;padding:10px 24px 0;border-bottom:1px solid var(--line-2,#F0ECE2)}.nl-tab{all:unset;cursor:pointer;padding:9px 14px;font-weight:600;font-size:12.5px;color:var(--ink-2,#4A5468);border-bottom:2px solid transparent;margin-bottom:-1px}" +
    ".nl-tab.on{color:var(--ink);border-color:var(--gold,#C9A24B)}.nl-tab b{display:inline-flex;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--gold-soft,#F6EEDB);color:#6B5216;font-size:11px;align-items:center;justify-content:center;margin-left:6px}" +
    ".nl-body{display:grid;grid-template-columns:330px 1fr;min-height:420px}.nl-left{border-right:1px solid var(--line-2,#F0ECE2);background:#FCFBF8;display:flex;flex-direction:column;min-width:0}" +
    ".nl-ls{padding:14px 14px 8px}.nl-ls input{all:unset;box-sizing:border-box;width:100%;height:38px;padding:0 12px;border:1px solid var(--line,#E7E1D3);border-radius:10px;background:#fff;font-size:12.5px}" +
    ".nl-ls input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.15)}.nl-lh{font-size:11px;color:var(--muted);padding:6px 2px 0}" +
    ".nl-ll{flex:1;overflow:auto;max-height:520px;padding:4px 8px 12px}.nl-li{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;cursor:pointer;border:1px solid transparent}" +
    ".nl-li:hover{background:#fff;border-color:var(--line-2)}.nl-li.on{background:#fff;border-color:var(--gold)}.nl-li img,.nl-li .nl-ph{width:38px;height:38px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid var(--line-2);flex:none}" +
    ".nl-li .t{font-size:12px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.nl-li .m{font-size:11px;color:var(--muted);margin-top:2px}" +
    ".nl-tag{font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;white-space:nowrap}.nl-tag.new{background:#E6F3EC;color:#1E7A4B}.nl-tag.on{background:#EEF2FA;color:#1F2A44}" +
    ".nl-form{padding:16px 22px 18px;min-width:0}.nl-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 14px}.nl-f{display:flex;flex-direction:column;gap:5px;min-width:0}.nl-f.w2{grid-column:span 2}.nl-f.w4{grid-column:1/-1}" +
    ".nl-f label{font-size:11.5px;font-weight:600;color:var(--ink-2)}.nl-f label i{font-style:normal;color:#B42318}.nl-f small{font-size:11px;color:var(--muted)}" +
    ".nl-f input,.nl-f select,.nl-f textarea{all:unset;box-sizing:border-box;width:100%;min-height:38px;padding:9px 11px;border:1px solid var(--line,#E7E1D3);border-radius:9px;background:#fff;font-size:12.5px;line-height:1.4}" +
    ".nl-f textarea{min-height:76px;white-space:pre-wrap}.nl-f select{appearance:auto}.nl-f input:focus,.nl-f select:focus,.nl-f textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.15)}" +
    ".nl-img{display:flex;gap:10px;align-items:center}.nl-img img{width:60px;height:60px;border-radius:10px;border:1px solid var(--line-2);object-fit:contain;background:#fff;flex:none}" +
    ".nl-sum{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0;font-size:12px}.nl-sum span{background:#FBF9F4;border:1px solid var(--line-2);border-radius:20px;padding:4px 11px}.nl-sum b{font-weight:700}" +
    ".nl-ft{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:14px 22px;border-top:1px solid var(--line-2);background:#FCFBF8}.nl-ft .nl-note{margin-right:auto;font-size:11.5px;color:var(--muted);max-width:520px}" +
    ".nl-b{all:unset;cursor:pointer;box-sizing:border-box;height:40px;padding:0 18px;white-space:nowrap;flex:none;border-radius:10px;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:#fff;color:var(--navy,#0F1E35)}" +
    ".nl-b:hover{border-color:var(--navy)}.nl-b.pri{background:var(--navy,#0F1E35);color:#fff;border-color:var(--navy)}.nl-b.pri:hover{filter:brightness(1.15)}.nl-b[disabled]{opacity:.45;pointer-events:none}" +
    ".nl-req{padding:6px 22px 20px}.nl-r{border:1px solid var(--line-2);border-radius:12px;padding:12px 14px;margin-top:10px;display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:start}" +
    ".nl-r img,.nl-r .nl-ph{width:44px;height:44px;border-radius:8px;object-fit:contain;border:1px solid var(--line-2);background:#fff}.nl-r .t{font-weight:600;font-size:12.5px}.nl-r .m{font-size:11.5px;color:var(--muted);margin-top:3px}" +
    ".nl-st{font-size:11px;font-weight:700;border-radius:20px;padding:3px 10px;white-space:nowrap}.st-pending{background:#F4F1EA;color:#4A5468}.st-checked,.st-live{background:#E6F3EC;color:#1E7A4B}.st-submitted{background:#EEF2FA;color:#1F4E8C}" +
    ".st-needs_info{background:#FBF1DF;color:#A86A12}.st-failed{background:#FCECEA;color:#B42318}.st-exists{background:#F6EEDB;color:#6B5216}" +
    ".nl-iss{margin-top:8px;display:grid;gap:8px}.nl-is{display:grid;grid-template-columns:1fr 240px;gap:10px;align-items:center;background:#FFFBF2;border:1px solid #F1E2BD;border-radius:9px;padding:8px 10px;font-size:11.5px}" +
    ".nl-is b{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6B5216}.nl-is input{all:unset;box-sizing:border-box;height:32px;padding:0 9px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:12px}" +
    ".nl-acts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.nl-acts .nl-b{height:34px;font-size:12px;padding:0 13px}.nl-empty{padding:40px 10px;text-align:center;color:var(--muted)}" +
    "@media(max-width:860px){.nl-body{grid-template-columns:1fr}.nl-left{border-right:0;border-bottom:1px solid var(--line-2)}.nl-ll{max-height:220px}.nl-grid{grid-template-columns:1fr 1fr}.nl-is{grid-template-columns:1fr}}";
  document.head.appendChild(css);

  /* ---------- LOTS products ---------- */
  function lotsList() {
    var prods = null; try { prods = lotsVendor && lotsVendor.products; } catch (e) {}
    if (!prods) return [];
    var onAmz = {}; try { Object.keys(STORE.asinLotsMap || {}).forEach(function (a) { var m = STORE.asinLotsMap[a]; if (m && m.code) onAmz[m.code] = a; }); } catch (e) {}
    return prods.filter(function (x) { return x && x.code && x.name; }).map(function (x) {
      var sl = null; try { sl = bestSlabFor(x.slabs); } catch (e) {}
      var a = String(x.asin || onAmz[x.code] || "").toUpperCase();
      return { code: x.code, name: x.name, brand: x.brand || "", barcode: String(x.barcode || "").replace(/\D/g, ""), mrp: parseFloat(x.mrp) || 0, qty: parseInt(x.qty, 10) || 0,
        cost: sl ? +sl.price : null, gst: x.gst, hsn: x.hsn || "", img: x.img || "", asin: /^[A-Z0-9]{10}$/.test(a) ? a : "" };
    });
  }
  function ensureLots() {
    try { if (typeof lotsVendor !== "undefined" && lotsVendor && lotsVendor.products) return Promise.resolve(); } catch (e) { return Promise.resolve(); }
    return typeof loadLotsCatalog === "function" ? loadLotsCatalog().catch(function () {}) : Promise.resolve();
  }

  /* ---------- requests ---------- */
  var REQ = [], reqFor = null;
  function loadReq() {
    var d = db(); if (!d) return Promise.resolve([]);
    return d.collection("spapiNewListingRequests").where("account", "==", acct()).get().then(function (s) {
      REQ = []; s.forEach(function (x) { var r = x.data(); r._id = x.id; if (r.v === 2) REQ.push(r); });
      REQ.sort(function (a, b) { return (b.requestedAt || 0) - (a.requestedAt || 0); }); reqFor = acct(); return REQ;
    }).catch(function (e) { console.warn("new listings", e); return REQ; });
  }

  /* ---------- window ---------- */
  var ov = null, tab = "new", pick = null, lq = "";
  function open() {
    if (!ov) { ov = document.createElement("div"); ov.className = "nl-ov"; document.body.appendChild(ov); ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); }); }
    ov.style.display = "flex"; document.addEventListener("keydown", onKey);
    draw(); ensureLots().then(function () { if (tab === "new") drawLots(); });
    loadReq().then(function () { drawTabs(); if (tab === "req") drawReq(); });
  }
  function close() { if (ov) ov.style.display = "none"; document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  function openCount() { return REQ.filter(function (r) { return r.status === "needs_info" || r.status === "checked"; }).length; }
  function drawTabs() {
    var t = ov && ov.querySelector(".nl-tabs"); if (!t) return;
    var n = openCount();
    t.innerHTML = '<button type="button" class="nl-tab' + (tab === "new" ? " on" : "") + '" data-t="new">New product</button>' +
      '<button type="button" class="nl-tab' + (tab === "req" ? " on" : "") + '" data-t="req">My requests' + (REQ.length ? "<b>" + (n || REQ.length) + "</b>" : "") + "</button>";
    t.querySelectorAll("[data-t]").forEach(function (b) { b.onclick = function () { tab = b.dataset.t; draw(); if (tab === "req") loadReq().then(drawReq); else drawLots(); }; });
  }
  function draw() {
    ov.innerHTML = '<div class="nl-box"><div class="nl-hd"><div><div class="nl-k">New listing · ' + esc(acctName()) + '</div><h3>Create a new product on Amazon</h3>' +
      '<div class="nl-sub">For items Amazon does not have yet. Pick a LOTS product (details fill in) or type them. The robot checks with Amazon first; if the barcode is already on Amazon it simply lists your offer on that product.</div></div>' +
      '<button type="button" class="nl-x" title="Close">✕</button></div><div class="nl-tabs"></div><div class="nl-main"></div></div>';
    ov.querySelector(".nl-x").onclick = close;
    drawTabs();
    tab === "new" ? drawNew() : drawReq();
  }

  function f(id, label, val, opt) {
    opt = opt || {};
    var inp = opt.select ? '<select id="' + id + '">' + opt.select.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val == null ? "" : val) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"
      : opt.area ? '<textarea id="' + id + '" placeholder="' + esc(opt.ph || "") + '">' + esc(val || "") + "</textarea>"
      : '<input id="' + id + '" type="' + (opt.num ? "number" : "text") + '"' + (opt.num ? ' step="0.01" min="0"' : "") + ' value="' + esc(val == null ? "" : val) + '" placeholder="' + esc(opt.ph || "") + '">';
    return '<div class="nl-f ' + (opt.w || "") + '"><label>' + esc(label) + (opt.req ? " <i>*</i>" : "") + "</label>" + inp + (opt.hint ? "<small>" + esc(opt.hint) + "</small>" : "") + "</div>";
  }
  function drawNew() {
    var p = pick || {};
    var sugg = p.mrp ? Math.floor(p.mrp) : "";   // new product = no other seller yet: start at MRP (same as Add ASIN)
    var cap = function (t) { return String(t || "").replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); };
    var m = ov.querySelector(".nl-main");
    m.innerHTML = '<div class="nl-body"><div class="nl-left"><div class="nl-ls"><input id="nlLq" placeholder="Search LOTS product, code or barcode…" value="' + esc(lq) + '">' +
      '<div class="nl-lh">Products not yet on Amazon are shown first.</div></div><div class="nl-ll" id="nlLl"><div class="nl-empty">Loading LOTS products…</div></div></div>' +
      '<div><div class="nl-form"><div class="nl-grid">' +
      f("nlTitle", "Product name (as on Amazon)", p.name, { w: "w4", req: 1, ph: "Brand + product + size, e.g. Gala Sparkle Magic Scrub Pad 3x4 inch, 5 pcs" }) +
      f("nlBrand", "Brand", cap(p.brand), { req: 1 }) +
      f("nlBarcode", "Barcode (EAN)", p.barcode, { hint: "On the pack. Empty = needs GTIN exemption on Amazon" }) +
      f("nlMrp", "MRP ₹", p.mrp || "", { req: 1, num: 1 }) +
      f("nlPrice", "Selling price ₹", sugg, { req: 1, num: 1, hint: p.mrp ? "No other seller yet — starts at MRP. Robot checks profit." : "" }) +
      f("nlCost", "Cost ₹", p.cost == null ? "" : p.cost, { num: 1, hint: p.code ? "LOTS best slab" : "Used for the profit check" }) +
      f("nlGst", "GST %", p.gst != null && p.gst !== "" ? Number(p.gst) : "", { select: [["", "—"], [0, "0%"], [5, "5%"], [18, "18%"], [40, "40%"]] }) +
      f("nlHsn", "HSN code", p.hsn) +
      f("nlQty", "Stock to list", p.code ? Math.min(p.qty, 50) : 10, { num: 1, hint: p.code ? "Max 50 · LOTS stock under 12 → listed with 0" : "" }) +
      '<div class="nl-f w2"><label>Main photo (link)</label><div class="nl-img">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : "") + '<input id="nlImg" type="text" value="' + esc(p.img || "") + '" placeholder="https://… (white background, 1000 px+)"></div></div>' +
      f("nlPt", "Amazon product type", "", { w: "w2", ph: "Leave empty — Amazon suggests it", hint: "Only if the robot asks, e.g. GROCERY, HEALTH_PERSONAL_CARE" }) +
      f("nlBul", "Key features (one per line, up to 5)", "", { w: "w2", area: 1, ph: "Size / pack\nWhat it does\nWho it is for" }) +
      f("nlDesc", "Description", "", { w: "w2", area: 1, ph: "Optional — the name is used if empty" }) +
      "</div>" + (p.code ? '<div class="nl-sum"><span>LOTS <b>' + esc(p.code) + "</b></span><span>LOTS stock <b>" + p.qty + "</b></span>" + (p.asin ? '<span>Already mapped to <b>' + esc(p.asin) + "</b> — use Add ASIN</span>" : "") + "</div>" : "") +
      '</div><div class="nl-ft"><span class="nl-note">The robot works at the next sync (about 15 min). "Check" lists nothing — it only asks Amazon what is missing.</span>' +
      '<button type="button" class="nl-b" id="nlCheck">Check with Amazon</button><button type="button" class="nl-b pri" id="nlCreate">Create on Amazon</button></div></div></div>';
    var li = $("nlLq"); li.oninput = function () { lq = li.value.toLowerCase(); drawLots(); };
    $("nlCheck").onclick = function () { send(false); };
    $("nlCreate").onclick = function () { send(true); };
    drawLots();
  }
  function drawLots() {
    var box = $("nlLl"); if (!box) return;
    var all = lotsList();
    if (!all.length) { box.innerHTML = '<div class="nl-empty">LOTS products are loading…</div>'; return; }
    var q = lq.trim(), list = all.filter(function (x) { return !q || (x.name + " " + x.code + " " + x.barcode + " " + x.brand).toLowerCase().indexOf(q) >= 0; });
    list.sort(function (a, b) { return (a.asin ? 1 : 0) - (b.asin ? 1 : 0) || b.qty - a.qty; });
    var shown = list.slice(0, 60);
    box.innerHTML = shown.map(function (x, i) {
      return '<div class="nl-li' + (pick && pick.code === x.code ? " on" : "") + '" data-i="' + i + '">' + (x.img ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : '<span class="nl-ph"></span>') +
        '<div style="min-width:0;flex:1"><div class="t">' + esc(x.name) + '</div><div class="m">' + esc(x.code) + " · MRP ₹" + (x.mrp || "—") + " · stock " + x.qty + "</div></div>" +
        (x.asin ? '<span class="nl-tag on">On Amazon</span>' : '<span class="nl-tag new">New</span>') + "</div>";
    }).join("") + (list.length > 60 ? '<div class="nl-lh" style="padding:8px">' + (list.length - 60) + " more — type to narrow</div>" : "") + (list.length ? "" : '<div class="nl-empty">No LOTS product matches.</div>');
    box.querySelectorAll("[data-i]").forEach(function (el) { el.onclick = function () { pick = shown[+el.dataset.i]; var s = box.scrollTop; drawNew(); var b2 = $("nlLl"); b2 && (b2.scrollTop = s); }; });
  }
  function val(id) { var e = $(id); return e ? String(e.value).trim() : ""; }
  async function send(create) {
    var r = { v: 2, account: acct(), title: val("nlTitle"), brand: val("nlBrand"), barcode: val("nlBarcode").replace(/\D/g, ""), mrp: +val("nlMrp") || 0, price: +val("nlPrice") || 0,
      cost: +val("nlCost") || null, gst: val("nlGst") === "" ? null : +val("nlGst"), hsn: val("nlHsn"), qty: parseInt(val("nlQty"), 10) || 0, image: val("nlImg"),
      productType: val("nlPt").toUpperCase().replace(/[^A-Z0-9_]/g, "") || null, bullets: val("nlBul").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5),
      description: val("nlDesc"), lotsCode: pick && pick.code ? String(pick.code) : null, create: !!create, status: "pending", requestedAt: Date.now(), error: null, issues: [] };
    var miss = []; if (!r.title) miss.push("name"); if (!r.brand) miss.push("brand"); if (!r.mrp) miss.push("MRP"); if (!r.price) miss.push("selling price");
    if (miss.length) return toast("⚠ Please fill: " + miss.join(", "), true);
    if (r.price > r.mrp) return toast("⚠ Selling price is above MRP", true);
    if (create) {
      var ok = typeof askPremiumConfirm === "function" ? await askPremiumConfirm({ kicker: "New product on Amazon", title: esc(r.title.slice(0, 80)) + " · " + esc(acctName()),
        message: "The robot will ask Amazon to create this product at ₹" + r.price + " (MRP ₹" + r.mrp + ").\nAmazon checks it first — if anything is missing it comes back as \"Needs details\" and nothing is listed.\n\nIf the barcode is already on Amazon, your offer is added to that product instead.", confirmLabel: "Create on Amazon" }) : confirm("Create this product on Amazon?");
      if (!ok) return;
    }
    try {
      var id = acct() + "_" + Date.now().toString(36);
      await db().collection("spapiNewListingRequests").doc(id).set(r);
      r._id = id; REQ.unshift(r); pick = null;
      toast(create ? "✓ Sent — the robot creates it at the next sync (≈15 min)" : "✓ Sent for checking — result at the next sync (≈15 min)");
      tab = "req"; draw();
    } catch (e) { toast("⚠ Not saved: " + (e.message || e), true); }
  }

  function hintFor(a) {
    if (/length_width|dimensions/.test(a)) return "L x W x H in cm, e.g. 10 x 8 x 2";
    if (/contact|address|manufacturer|packer|importer/.test(a)) return "Name, full address, phone (saved for next products)";
    if (/weight/.test(a)) return "Weight in grams, e.g. 250";
    if (/color|colour/.test(a)) return "e.g. Multicolor, Green";
    if (/size/.test(a)) return "e.g. Standard, 3 x 3 inch, 200 ml";
    if (/material/.test(a)) return "e.g. Plastic, Steel";
    return "Value for " + a.replace(/_/g, " ");
  }
  var ST = { pending: "Waiting for robot", checked: "Amazon OK — ready", submitted: "Sent · Amazon creating", live: "Live on Amazon", needs_info: "Needs details", failed: "Failed", exists: "Already on Amazon" };
  function drawReq() {
    var m = ov && ov.querySelector(".nl-main"); if (!m) return;
    if (!REQ.length) { m.innerHTML = '<div class="nl-empty">No new-listing requests for ' + esc(acctName()) + " yet.</div>"; return; }
    m.innerHTML = '<div class="nl-req">' + REQ.map(function (r) {
      var iss = (r.issues || []).filter(function (x) { return x && (x.attr || x.msg); });
      var info = [r.productType ? "Type " + esc(r.productType) : "", r.sku ? "SKU " + esc(r.sku) : "", "₹" + r.price + " · MRP ₹" + r.mrp, r.profit != null ? "profit ₹" + r.profit + "/order" : "",
        r.asin ? '<a href="https://www.amazon.in/dp/' + esc(r.asin) + '" target="_blank" rel="noopener">' + esc(r.asin) + "</a>" : ""].filter(Boolean).join(" · ");
      var when = r.requestedAt ? new Date(r.requestedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
      return '<div class="nl-r" data-id="' + esc(r._id) + '">' + (r.image ? '<img src="' + esc(r.image) + '" alt="">' : '<span class="nl-ph"></span>') +
        '<div style="min-width:0"><div class="t">' + esc(r.title) + '</div><div class="m">' + info + (when ? " · " + when : "") + "</div>" +
        (r.error ? '<div class="m" style="color:' + (r.status === "failed" ? "#B42318" : "#A86A12") + '">' + esc(r.error) + "</div>" : "") +
        (r.note ? '<div class="m">' + esc(r.note) + "</div>" : "") +
        (r.status === "needs_info" && iss.length ? '<div class="nl-iss">' + iss.map(function (x, k) {
          var a = String(x.attr || "").split(",")[0].trim();
          return '<div class="nl-is"><div>' + (a ? "<b>" + esc(a) + "</b> — " : "") + esc(x.msg || "") + "</div>" + (a ? '<input data-a="' + esc(a) + '" placeholder="' + esc(hintFor(a)) + '" value="' + esc((r.extra || {})[a] || "") + '">' : "<span></span>") + "</div>";
        }).join("") + "</div>" : "") +
        '<div class="nl-acts">' +
        (r.status === "needs_info" ? '<button type="button" class="nl-b pri" data-act="retry">Save details & check again</button>' : "") +
        (r.status === "checked" ? '<button type="button" class="nl-b pri" data-act="create">Create on Amazon</button>' : "") +
        (r.status === "failed" ? '<button type="button" class="nl-b" data-act="again">Try again</button>' : "") +
        (r.status === "exists" && !r.handedOff ? '<button type="button" class="nl-b pri" data-act="create">List my offer on it</button>' : "") +
        "</div></div>" + '<span class="nl-st st-' + esc(r.status) + '">' + esc(ST[r.status] || r.status) + "</span></div>";
    }).join("") + "</div>";
    m.querySelectorAll("[data-act]").forEach(function (b) {
      b.onclick = async function () {
        var card = b.closest(".nl-r"), id = card.dataset.id, r = REQ.find(function (x) { return x._id === id; }); if (!r) return;
        var patch = { status: "pending", requestedAt: Date.now(), error: null };
        if (b.dataset.act === "retry") { var ex = Object.assign({}, r.extra || {}); card.querySelectorAll("[data-a]").forEach(function (i) { if (i.value.trim()) ex[i.dataset.a] = i.value.trim(); }); patch.extra = ex; }
        if (b.dataset.act === "create") {
          var ok = typeof askPremiumConfirm === "function" ? await askPremiumConfirm({ kicker: "New product on Amazon", title: esc(String(r.title).slice(0, 80)), message: "Amazon accepted these details. Create the product now at ₹" + r.price + "?", confirmLabel: "Create on Amazon" }) : confirm("Create now?");
          if (!ok) return; patch.create = true;
        }
        b.disabled = true;
        try { await db().collection("spapiNewListingRequests").doc(id).set(patch, { merge: true }); Object.assign(r, patch); toast("✓ Sent — result at the next sync (≈15 min)"); drawReq(); drawTabs(); }
        catch (e) { b.disabled = false; toast("⚠ Not saved: " + (e.message || e), true); }
      };
    });
  }

  /* ---------- header button (next to Add ASIN) ---------- */
  function addBtn() {
    if ($("nlOpen")) return true;
    var a = $("aaOpen"); if (!a || !a.parentNode) return false;
    var b = document.createElement("button"); b.type = "button"; b.id = "nlOpen"; b.className = "aa-open"; b.title = "Create a product Amazon does not have yet (new ASIN)";
    b.textContent = "New listing"; b.onclick = open;
    a.parentNode.insertBefore(b, a.nextSibling); return true;
  }
  (function wait(i) { if (!addBtn() && i < 120) setTimeout(function () { wait(i + 1); }, 250); })(0);
  var sa = window.setSpapiAccount;
  if (typeof sa === "function") window.setSpapiAccount = function () { REQ = []; reqFor = null; pick = null; return sa.apply(this, arguments); };
  window.aikmNewListing = { open: open };
})();
