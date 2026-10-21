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
