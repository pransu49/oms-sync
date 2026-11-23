/* AIKM staff sign-in for vendor prices on the Counter Billing POS (/pages/pos, template page.counter-billing.liquid).
   Loaded by 2 script tags before </body> (Shopify template limit 256 KB, so the code lives here).
   Needs firebase-app-compat + firebase-auth-compat 10.12.2 loaded first. Owner 23 Nov 2026. */
(function () {
  if (window.__aikmPosStaff || typeof firebase === "undefined") return; window.__aikmPosStaff = 1;
  var CFG = { apiKey: "AIzaSyDd_XzDHhHqKO9g9ff8k7O32Fs1GLNxhHU", authDomain: "aikm--order-file.firebaseapp.com",
    projectId: "aikm--order-file", appId: "1:538377843484:web:4cc7fe7b6856d8a3ef40d9" };
  var app = firebase.apps.filter(function (a) { return a.name === "aikm_staff"; })[0] || firebase.initializeApp(CFG, "aikm_staff");
  // the POS sets up its own database only when firebase.apps is empty - keep our sign-in app out of that list
  try {
    var d = Object.getOwnPropertyDescriptor(firebase, "apps");
    if (d && d.get && d.configurable) Object.defineProperty(firebase, "apps", { configurable: true,
      get: function () { return d.get.call(firebase).filter(function (a) { return a.name !== "aikm_staff"; }); } });
  } catch (e) {}
  var auth = app.auth(), user = null, readyFn, ready = new Promise(function (r) { readyFn = r; });
  auth.onAuthStateChanged(function (u) { user = u; readyFn(); pill(); });
  setTimeout(readyFn, 5000);

  function pill() {
    var p = document.getElementById("aikmStaffPill");
    if (user) { if (p) p.remove(); return; }
    if (p) return;
    p = document.createElement("button"); p.id = "aikmStaffPill"; p.type = "button";
    p.textContent = "Sign in for vendor prices";
    p.title = "Vendor prices come from the purchase database, which is open to AIKM staff only. One Google sign-in per computer.";
    p.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:99999;background:#0B1F3A;color:#fff;border:1px solid #C9A227;" +
      "border-radius:999px;padding:10px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25)";
    p.onclick = function () {
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(function (r) {
        return r.user.getIdTokenResult(true);
      }).then(function (t) {
        if (!t.claims || t.claims.role !== "authenticated") { alertBox("This Google account is not AIKM staff, so vendor prices stay off."); return; }
        alertBox("Signed in. Press Refresh now in Price sync to load vendor prices.");
      }).catch(function (e) { alertBox("Sign-in did not finish: " + (e && e.message || e)); });
    };
    (document.body || document.documentElement).appendChild(p);
  }
  function alertBox(t) {
    var b = document.createElement("div");
    b.textContent = t;
    b.style.cssText = "position:fixed;left:16px;bottom:64px;z-index:99999;background:#fff;color:#0B1F3A;border:1px solid #C9A227;" +
      "border-radius:10px;padding:10px 14px;font:500 13px system-ui,sans-serif;max-width:320px;box-shadow:0 6px 18px rgba(0,0,0,.2)";
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 6000);
  }

  var oFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\//.test(url)) return oFetch(input, init);
    return ready.then(function () { return user ? user.getIdToken() : null; }).catch(function () { return null; }).then(function (tok) {
      if (!tok) return oFetch(input, init);
      var o = {}; for (var k in (init || {})) o[k] = init[k];
      var h = new Headers(o.headers || {}); h.set("Authorization", "Bearer " + tok); o.headers = h;
      return oFetch(input, o);
    });
  };
})();
