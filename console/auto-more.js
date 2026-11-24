/* ===== AIKM AUTO "SHOW MORE" (owner 20 Nov 2026) =====
   "Deploy scrolling instead of the 100-more button - everywhere in the tool where load more is available."
   One helper for every list: when a "Show 100 more" / "Show more (N left)" button scrolls into view it is clicked automatically,
   and the scroll position is kept (most lists redraw their table when more rows are added, which would jump to the top).
   Works on the Amazon page (Inventory, Competitor Pricing, Orders, Buy Box lost, OMS inventory) and the console
   (Failed refunds, RTO Check, ...) and on any list added later that uses a "Show/Load ... more" button. 0 Firebase reads.
   Loaded by blocks at the end of console/amazon-name-search.js (aikmAutoMoreJs) and console/refund-tab.js (aikmAutoMoreJs). ===== */
(function () { try {
  if (window.__aikmAutoMore) return; window.__aikmAutoMore = 1;
  var RX = /^\s*(show|load)\s+(\d[\d,]*\s+more\b|more\s*\()/i, NEAR = 350, last = { t: 0, txt: "" };

  var css = document.createElement("style");
  css.textContent = ".aikm-am{opacity:.75;pointer-events:none}.aikm-am::after{content:' · loading as you scroll'}";
  document.head.appendChild(css);

  function scroller(el) {
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return null;
  }
  function path(el) { var a = []; for (var n = el; n && n !== document.body; n = n.parentElement) { var i = 0, s = n; while ((s = s.previousElementSibling)) i++; a.push(i); } return a; }
  function byPath(a) { var n = document.body; for (var i = a.length - 1; i >= 0 && n; i--) n = n.children[a[i]]; return n || null; }
  // owner 24 Nov 2026 ("page unresponsive"): cheap text test FIRST (thousands of buttons on the page), layout only for the few matches;
  // nothing is auto-loaded while a pop-up / confirm box is open
  function buttons() {
    return [].slice.call(document.querySelectorAll("button.tbl-load-btn,[data-bbl-more],[data-omi-more],button")).filter(function (b) {
      return RX.test(b.textContent || "") && !b.disabled && b.offsetParent !== null;
    });
  }
  function modalOpen() {
    return [].some.call(document.querySelectorAll(".admin-modal-overlay,.ll-ov,.rl-ov,.aa-ov"), function (o) { return o.style.display && o.style.display !== "none"; });
  }
  function check() {
    if (document.hidden || modalOpen()) return;
    var bs = buttons(); if (!bs.length) return;
    for (var k = 0; k < bs.length; k++) {
      var b = bs[k], sc = scroller(b), r = b.getBoundingClientRect();
      var bottom = sc ? sc.getBoundingClientRect().bottom : window.innerHeight;
      if (r.top > bottom + NEAR || r.bottom < 0) continue;                       // not near the visible end yet
      var txt = (b.textContent || "").trim();
      if (txt === last.txt && Date.now() - last.t < 900) continue;              // same button did nothing - don't hammer it
      last = { t: Date.now(), txt: txt };
      // remember every scrolled box + the page scroll, click, then put them back (the list may redraw itself)
      var keep = [], y = window.scrollY;
      if (sc) keep.push([path(sc), sc.scrollTop]);
      var restore = function () {
        keep.forEach(function (x) { var n = byPath(x[0]); if (n && Math.abs(n.scrollTop - x[1]) > 2) n.scrollTop = x[1]; });
        if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
      };
      b.classList.add("aikm-am");
      try { b.click(); } catch (e) {}
      restore(); requestAnimationFrame(restore); setTimeout(restore, 60);
      return;                                                                    // one click per check; the next scroll / redraw checks again
    }
  }
  var busy = false;
  function soon() { if (busy) return; busy = true; setTimeout(function () { busy = false; check(); }, 120); }
  document.addEventListener("scroll", soon, { capture: true, passive: true });
  window.addEventListener("resize", soon, { passive: true });
  // no page-wide MutationObserver any more (it re-ran on every small change); a light check every 1.5 s instead
  setInterval(function () { if (!document.hidden) soon(); }, 1500);
  soon();
} catch (e) { console.warn("auto-more", e); } })();
