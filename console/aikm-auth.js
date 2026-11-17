/* ===== AIKM SIGN-IN GATE (owner 17 Nov 2026) =====
   Why: the 3 Firebase databases (aikm--order-file, noworry-b7d56, aikm-oms-sync) were open to anyone ("allow read, write: if true").
   They hold buyer names / addresses (OMS orders). The rules are being locked to signed-in staff only, so every tool page
   must sign in first. This file is loaded on every tool page RIGHT AFTER the Firebase SDK tags (app + firestore + auth),
   BEFORE the page's own scripts:
     1. It creates ONE Firebase app per project (main = [DEFAULT], spapi, oms) and makes every later
        firebase.initializeApp(<same project>, "anyName") return that same app - so one sign-in covers every tab/tool.
     2. It waits for the saved sign-in. Not signed in (or not an allowed account) -> a full-screen "Sign in with Google" card.
     3. Google sign-in per project (one click each, popups must come from a click); the first token is tried on the others first.
   Allowed accounts: ALLOWED below (must match the Firestore rules). Robots use server keys (firebase-admin) and are not affected.
   window.aikmIdToken(projectId) -> Promise<ID token> for REST calls (sale-autobill.js). */
(function () {
  if (window.__aikmAuth) return; window.__aikmAuth = 1;
  var ALLOWED = ["aikmpharma@gmail.com", "prabhat786kushwah@gmail.com"];
  var CFG = {
    main: { apiKey: "AIzaSyDd_XzDHhHqKO9g9ff8k7O32Fs1GLNxhHU", authDomain: "aikm--order-file.firebaseapp.com", projectId: "aikm--order-file", storageBucket: "aikm--order-file.firebasestorage.app", messagingSenderId: "538377843484", appId: "1:538377843484:web:4cc7fe7b6856d8a3ef40d9" },
    spapi: { apiKey: "AIzaSyDuqBUp2zOAv58YHzdTvNO3RFdmv9yIEVQ", authDomain: "noworry-b7d56.firebaseapp.com", projectId: "noworry-b7d56", storageBucket: "noworry-b7d56.firebasestorage.app", messagingSenderId: "786227697874", appId: "1:786227697874:web:e9f8210d11e132a382750b" },
    oms: { apiKey: "AIzaSyCKvAQr48JeVTJzvwcCg0YBNf7SBdaCVsk", authDomain: "aikm-oms-sync.firebaseapp.com", projectId: "aikm-oms-sync", storageBucket: "aikm-oms-sync.firebasestorage.app", messagingSenderId: "464184383750", appId: "1:464184383750:web:4fb422b90e519a87d76687" }
  };
  var fb = window.firebase;
  if (!fb || !fb.initializeApp || !fb.auth) { console.warn("AIKM sign-in: Firebase SDK (app + auth) not loaded before aikm-auth.js"); return; }

  /* ---- 1. one app per project; every later initializeApp for the same project returns it ---- */
  var origInit = fb.initializeApp.bind(fb), origApp = fb.app.bind(fb), canon = {}, alias = {};
  function mk(cfg, name) { try { return name ? origApp(name) : origApp(); } catch (e) { return origInit(cfg, name); } }
  canon[CFG.main.projectId] = mk(CFG.main);                 // [DEFAULT] = main (pages call firebase.firestore())
  canon[CFG.spapi.projectId] = mk(CFG.spapi, "aikm_spapi");
  canon[CFG.oms.projectId] = mk(CFG.oms, "aikm_oms");
  fb.initializeApp = function (cfg, name) {
    var c = cfg && canon[cfg.projectId];
    if (c) { if (typeof name === "string" && name) alias[name] = c; return c; }
    return origInit.apply(fb, arguments);
  };
  fb.app = function (name) { if (typeof name === "string" && alias[name]) return alias[name]; return name === undefined ? origApp() : origApp(name); };
  var apps = [canon[CFG.main.projectId], canon[CFG.spapi.projectId], canon[CFG.oms.projectId]];
  var auths = apps.map(function (a) { return a.auth(); });   // register auth BEFORE any firestore() use -> Firestore waits for the saved sign-in

  window.aikmIdToken = function (projectId) {
    var a = canon[projectId]; if (!a) return Promise.resolve(null);
    var u = a.auth().currentUser; return u ? u.getIdToken() : firstState(a.auth()).then(function (x) { return x ? x.getIdToken() : null; });
  };
  function firstState(au) { return new Promise(function (ok) { var off = au.onAuthStateChanged(function (u) { off(); ok(u); }); }); }
  var okUser = function (u) { return !!(u && u.email && u.emailVerified !== false && ALLOWED.indexOf(String(u.email).toLowerCase()) >= 0); };

  /* ---- 2. check the saved sign-in of all 3 projects ---- */
  var NAMES = ["Main data", "Amazon data", "Order data"];
  function missing() { return auths.map(function (a, i) { return okUser(a.currentUser) ? -1 : i; }).filter(function (i) { return i >= 0; }); }
  Promise.all(auths.map(firstState)).then(function (users) {
    if (users.every(okUser)) { window.aikmUser = users[0].email; return; }
    gate();
  });

  /* ---- 3. sign in: one Google popup per database not signed in yet (each on its own click - browsers block
     popups that are not started by a click). Fast path: the first popup's Google token is tried on the others. ---- */
  function label(btn, msg) {
    var m = missing(), done = 3 - m.length;
    btn.lastChild.textContent = done ? "Continue - " + NAMES[m[0]] + " (" + (done + 1) + " of 3)" : "Sign in with Google";
    if (done) msg.textContent = "✓ " + done + " of 3 signed in. Click once more and pick the same account.";
  }
  function signIn(btn, msg) {
    var m = missing(); if (!m.length) { location.reload(); return; }
    var au = auths[m[0]];
    var p = new fb.auth.GoogleAuthProvider();
    var hint = (auths.filter(function (a) { return okUser(a.currentUser); })[0] || {}).currentUser;
    p.setCustomParameters(hint ? { login_hint: hint.email } : { prompt: "select_account" });
    btn.disabled = true; msg.textContent = "Opening Google sign-in…";
    au.signInWithPopup(p).then(async function (res) {
      if (!okUser(res.user)) { var e0 = res.user && res.user.email; await au.signOut(); throw new Error((e0 || "This account") + " is not allowed to open AIKM tools."); }
      var tok = res.credential && res.credential.accessToken;
      if (tok) await Promise.all(missing().map(function (i) {
        return auths[i].signInWithCredential(fb.auth.GoogleAuthProvider.credential(null, tok)).catch(function () {});
      }));
      if (!missing().length) { msg.textContent = "✓ Signed in - loading…"; location.reload(); return; }
      btn.disabled = false; label(btn, msg);
    }).catch(function (e) { btn.disabled = false; msg.textContent = (e && e.message) || "Sign-in failed - try again."; });
  }
  window.aikmSignOut = function () { Promise.all(auths.map(function (a) { return a.signOut(); })).then(function () { location.reload(); }); };

  function gate() {
    var draw = function () {
      if (document.getElementById("aikmGate")) return;
      var d = document.createElement("div"); d.id = "aikmGate";
      d.innerHTML = '<style>#aikmGate{position:fixed;inset:0;z-index:2147483646;background:linear-gradient(160deg,#0F1E35,#1A2C4A);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif}' +
        '#aikmGate .c{background:#fff;border-radius:18px;padding:34px 34px 28px;width:min(400px,92vw);text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.35);border-top:4px solid #C9A24B}' +
        '#aikmGate .m{width:52px;height:52px;border-radius:14px;margin:0 auto 14px;background:linear-gradient(135deg,#E3C47A,#C9A24B);display:flex;align-items:center;justify-content:center;font:700 22px Lexend,sans-serif;color:#0F1E35}' +
        '#aikmGate h2{font:600 20px Lexend,sans-serif;color:#14213D;margin:0 0 6px}#aikmGate p{color:#4A5468;font-size:13px;line-height:1.55;margin:0 0 20px}' +
        '#aikmGate button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:10px;background:#0F1E35;color:#fff;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px}' +
        '#aikmGate button:hover{background:#243A5E}#aikmGate button[disabled]{opacity:.6;pointer-events:none}#aikmGate .s{margin-top:14px;font-size:12px;color:#8B909B;min-height:16px}</style>' +
        '<div class="c"><div class="m">A</div><h2>AIKM Pharma tools</h2><p>Sign in with your company Google account to open this page. Buyer data is visible only to signed-in staff.</p>' +
        '<button type="button" id="aikmGateBtn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>Sign in with Google</span></button>' +
        '<div class="s" id="aikmGateMsg"></div></div>';
      document.body.appendChild(d);
      var b = document.getElementById("aikmGateBtn"), m = document.getElementById("aikmGateMsg");
      b.onclick = function () { signIn(b, m); }; label(b, m);
    };
    if (document.body) draw(); else document.addEventListener("DOMContentLoaded", draw);
  }
})();
