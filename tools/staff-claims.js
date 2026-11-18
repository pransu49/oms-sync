// tools/staff-claims.js — gives the staff Google accounts the 'authenticated' role in the MAIN Firebase project (aikm--order-file),
// so their sign-in is accepted by Supabase (Purchase & Sales database, "staff only" rule since the 18 Nov 2026 security check).
// Accounts NOT in the list lose the role. The list is typed by the owner when running the workflow (never stored in the code).
// Firebase: 0 Firestore reads/writes (Auth only).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const want = String(process.env.STAFF_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
if (!want.length) { console.error('Type the staff Google accounts in the "emails" box.'); process.exit(1); }

(async () => {
  let given = 0, removed = 0, missing = [];
  for (const e of want) {
    try {
      const u = await admin.auth().getUserByEmail(e);
      await admin.auth().setCustomUserClaims(u.uid, { ...(u.customClaims || {}), role: 'authenticated' });
      given++;
    } catch (err) { missing.push(e.replace(/(.{2}).*@/, '$1***@')); }
  }
  let page;
  do {
    page = await admin.auth().listUsers(1000, page && page.pageToken);
    for (const u of page.users) {
      if (u.customClaims && u.customClaims.role && !want.includes(String(u.email || '').toLowerCase())) {
        const c = { ...u.customClaims }; delete c.role; await admin.auth().setCustomUserClaims(u.uid, c); removed++;
      }
    }
  } while (page.pageToken);
  console.log(`role given: ${given}, removed from others: ${removed}` + (missing.length ? `, not signed in yet (sign in once on a tool page, then run again): ${missing.join(', ')}` : ''));
})().catch(e => { console.error('staff-claims failed:', e.message); process.exit(1); });
