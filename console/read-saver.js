/* AIKM read saver (21 Oct 2026) — loaded by the block at the end of console/refund-tab.js.
   Order-entry data (aikm_admin/data/entriesChunks) used to be cut into 500-entry pieces in whatever order
   each computer happened to hold them, so every save from any computer rewrote ALL ~23 pieces and every
   open console tab had to re-read all of them (thousands of Firebase reads a day).
   Now each entry always goes to the same piece (by its AWB / order no.), sorted the same way on every
   computer, so a save only rewrites the piece(s) that really changed. Other collections are untouched. */
(function () {
  if (window.__aikmReadSaver) return; window.__aikmReadSaver = true;
  var tries = 0;
  (function wait() {
    if (typeof pushChunkedArrayWithHash !== "function" || typeof crypto_hashLite !== "function" || typeof fbDb === "undefined") {
      if (++tries < 240) setTimeout(wait, 500); return;
    }
    var original = pushChunkedArrayWithHash;
    function key(e) { return String((e && e.awb) || "") + "|" + String((e && e.orderNo) || ""); }
    function h(s) { var n = 2166136261; for (var i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = Math.imul(n, 16777619); } n ^= n >>> 16; n = Math.imul(n, 0x45d9f3b); n ^= n >>> 16; return n >>> 0; }  // FNV-1a + mix: even spread
    async function bucketed(all) {
      var col = fbDb.collection("aikm_admin").doc("data").collection("entriesChunks"), prev = {}, ids;
      if (typeof __entriesListenerLive !== "undefined" && __entriesListenerLive) { Object.assign(prev, entriesChunksHashCache); ids = new Set(Object.keys(entriesChunksHashCache)); }
      else { var s = await col.get(); s.docs.forEach(function (d) { prev[d.id] = d.data().hash; }); ids = new Set(s.docs.map(function (d) { return d.id; })); }
      // OMS Guru orders are NOT saved here: every console tab already builds them itself from the OMS
      // Guru data it listens to. Saving them (≈10,000 rows, re-stamped each day) made every save rewrite
      // everything. Only orders from files you upload by hand are saved.
      all = all.filter(function (e) { return !(e && e.sourceFile === "OMS Guru (auto-sync)"); });
      var B = 8; while (all.length / B > 400) B *= 2;
      var buckets = []; for (var i = 0; i < B; i++) buckets.push([]);
      all.forEach(function (e) { var k = key(e); buckets[h(k) % B].push({ k: k, j: JSON.stringify(e), e: e }); });
      var used = new Set(), wrote = 0;
      for (var b = 0; b < B; b++) {
        var items = buckets[b].sort(function (x, y) { return x.k < y.k ? -1 : x.k > y.k ? 1 : x.j < y.j ? -1 : x.j > y.j ? 1 : 0; }).map(function (x) { return x.e; });
        var id = "chunk_" + b, hash = crypto_hashLite(items); used.add(id);
        if (prev[id] !== hash) {
          await col.doc(id).set({ items: items, hash: hash }); wrote++;
          try { entriesChunksCache[id] = items; entriesChunksHashCache[id] = hash; } catch (e) {}
        }
      }
      var batch = fbDb.batch(), del = 0;
      ids.forEach(function (id) { if (!used.has(id)) { batch.delete(col.doc(id)); del++; try { delete entriesChunksCache[id]; delete entriesChunksHashCache[id]; } catch (e) {} } });
      if (del) await batch.commit();
      if (wrote || del) console.log("[read-saver] order entries: " + wrote + " piece(s) saved, " + del + " removed (of " + B + ")");
    }
    window.pushChunkedArrayWithHash = function (name, arr, size) {
      if (name === "entriesChunks") return bucketed(arr || []);
      return original.apply(this, arguments);
    };
    // When saved entries arrive from another computer, put this tab's OMS Guru orders back in right after.
    if (typeof rebuildMapsFromEntries === "function" && typeof integrateOmsIntoMasterData === "function") {
      var origRebuild = rebuildMapsFromEntries, again = null;
      window.rebuildMapsFromEntries = function () {
        var r = origRebuild.apply(this, arguments);
        clearTimeout(again); again = setTimeout(function () { try { if (window.omsOrdersRaw && window.omsOrdersRaw.length) integrateOmsIntoMasterData(); } catch (e) {} }, 0);
        return r;
      };
    }
    console.log("[read-saver] active");
  })();
})();

/* Idle pause tuning (7 Nov 2026). The idle-pause snippet switched Firebase off after 10 min of no activity.
   Waking a tab after 30+ min off makes Firebase re-read EVERYTHING the page listens to (~250 reads), while
   staying connected costs only ~100 reads an hour - so short pauses cost more than they saved (every morning
   all tabs woke up at once). Now the connection is only switched off after 3 hours of no activity. */
(function () {
  if (window.__aikmIdleTune) return; window.__aikmIdleTune = true;
  var LONG = 3 * 3600e3, last = Date.now(), off = false, tries = 0;
  ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, function () { last = Date.now(); if (off) { off = false; each("enableNetwork"); } }, { passive: true, capture: true });
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { last = Date.now(); if (off) { off = false; each("enableNetwork"); } } });
  var real = null;
  function each(fn) { try { firebase.apps.forEach(function (a) { try { var p = (real && fn === "disableNetwork" ? real : a.firestore()[fn]).call(a.firestore()); p && p.catch && p.catch(function () {}); } catch (e) {} }); } catch (e) {} }
  (function hook() {
    if (!(window.firebase && firebase.firestore && firebase.firestore.Firestore)) { if (++tries < 240) setTimeout(hook, 500); return; }
    var P = firebase.firestore.Firestore.prototype; real = P.disableNetwork;
    // the snippet's 10-minute pause is ignored; our own timer pauses after 3 hours
    P.disableNetwork = function () { return Date.now() - last >= LONG ? real.call(this) : Promise.resolve(); };
    var css = document.createElement("style"); css.textContent = "#aikmIdleBar{display:none!important}"; document.head.appendChild(css);
    setInterval(function () { if (!off && Date.now() - last >= LONG) { off = true; each("disableNetwork"); } }, 60e3);
  })();
})();

/* Live Status honesty fix (12 Nov 2026). The Firebase card only ESTIMATES read/write/delete charges; the real bill
   also has download (data transfer) charges. When all projects are on the free Spark plan, Google gives no usage
   numbers and cannot charge - say that instead of a ₹0.00 "Blaze" card and wrong setup steps. */
(function () {
  if (window.__aikmFbCard) return; window.__aikmFbCard = 1;
  var U = null, at = 0, busy = false;
  function load(cb) {
    if (U && Date.now() - at < 10 * 60e3) return cb(U);
    if (busy || typeof fbDb === "undefined" || !fbDb) return; busy = true;
    fbDb.collection("aikm_admin").doc("firebaseUsage").get().then(function (d) { U = d.exists ? d.data() : {}; at = Date.now(); busy = false; cb(U); }, function () { busy = false; });
  }
  function fix(box) {
    load(function (u) {
      var free = u.plan === "free" || (u.projects && Object.keys(u.projects).length && Object.keys(u.projects).every(function (k) { return u.projects[k].freePlan; }));
      var kick = box.querySelector(".fb-kick");
      if (free) {
        if (kick) kick.textContent = "Firebase · Free plan (Spark)";
        box.querySelectorAll(".fb-kpis, .fb-budget, .fb-need").forEach(function (el) { el.style.display = "none"; });
        if (!box.querySelector(".aikm-free-note")) {
          var n = document.createElement("div"); n.className = "aikm-free-note";
          n.style.cssText = "margin:12px 0;padding:12px 14px;border-radius:12px;background:#E7F4EC;color:#1E5B3B;font-size:13px;line-height:1.5";
          n.innerHTML = "<b>No charges possible</b> — billing is switched off on all 3 Firebase projects, so Google cannot bill you.<br>" +
            "Free limits: 50,000 reads/day per project and <b>10 GB of downloads per month</b>. If a limit is reached, that tool stops until the limit resets.<br>" +
            "Google does not share usage numbers on the free plan — see <b>Firebase console → Usage and billing</b>.";
          (kick && kick.closest(".fb-head") ? kick.closest(".fb-head") : box.firstChild).insertAdjacentElement("afterend", n);
        }
      } else if (!box.querySelector(".aikm-est-note")) {
        if (kick) kick.textContent = kick.textContent.replace(/Blaze plan/i, "Blaze plan · estimate");
        var m = document.createElement("div"); m.className = "aikm-est-note";
        m.style.cssText = "margin:8px 0 0;font-size:12px;color:#A66A00";
        m.textContent = "Estimate of read/write/delete charges only — your real bill also includes download (data transfer) and storage charges. Real bill: Google Cloud Billing → Reports.";
        box.appendChild(m);
      }
    });
  }
  new MutationObserver(function () {
    var box = document.querySelector(".fb-box"); if (box && !box.__aikmFixed) { box.__aikmFixed = 1; fix(box); }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
