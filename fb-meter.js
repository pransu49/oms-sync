/**
 * Firebase usage meter for ALL robots (owner 12 Nov 2026: "ensure all syncs work under free limits").
 * Loaded with NODE_OPTIONS="--require ./fb-meter.js" in each workflow. When a robot loads firebase-admin,
 * this counts its Firestore reads / writes / deletes per Firebase project and prints ONE line at exit:
 *   FBMETER <workflow> | <projectId> r=.. w=.. d=.. | ...
 * Counting only — it never reads or writes anything itself. Safe to remove (delete the NODE_OPTIONS lines).
 */
const Module = require('module');
const counts = {};
let hooked = false;
function bucket(fs) {
  let id = 'unknown';
  try { id = (fs._settings && fs._settings.projectId) || fs._projectId || fs.projectId || 'unknown'; } catch (e) {}
  return counts[id] || (counts[id] = { r: 0, w: 0, d: 0 });
}
function hook(admin) {
  if (hooked || !admin || !admin.firestore) return; hooked = true;
  try {
    const F = admin.firestore, DR = F.DocumentReference.prototype, Q = F.Query.prototype, WB = F.WriteBatch.prototype, FS = F.Firestore.prototype;
    ['set', 'update', 'create'].forEach((m) => { const o = DR[m]; DR[m] = function (...a) { bucket(this.firestore).w++; return o.apply(this, a); }; });
    const oDel = DR.delete; DR.delete = function (...a) { bucket(this.firestore).d++; return oDel.apply(this, a); };
    const oQ = Q.get; Q.get = function (...a) { const b = bucket(this.firestore); return oQ.apply(this, a).then((s) => { b.r += Math.max(1, s.size); return s; }); };
    ['set', 'update', 'create'].forEach((m) => { const o = WB[m]; WB[m] = function (ref, ...a) { try { bucket(ref.firestore).w++; } catch (e) {} return o.call(this, ref, ...a); }; });
    const oWD = WB.delete; WB.delete = function (ref, ...a) { try { bucket(ref.firestore).d++; } catch (e) {} return oWD.call(this, ref, ...a); };
    if (FS.getAll) { const o = FS.getAll; FS.getAll = function (...a) { bucket(this).r += a.filter((x) => x && x.path).length; return o.apply(this, a); }; }
    // listeners (onSnapshot) are counted per delivered doc change
    const oSnap = Q.onSnapshot; if (oSnap) Q.onSnapshot = function (next, ...a) { const b = bucket(this.firestore); return oSnap.call(this, (s) => { b.r += Math.max(1, s.docChanges().length); return next && next(s); }, ...a); };
  } catch (e) { console.log('fb-meter: could not hook', e.message); }
}
const oLoad = Module._load;
Module._load = function (request, ...rest) {
  const m = oLoad.call(this, request, ...rest);
  if (request === 'firebase-admin' && !hooked) hook(m);
  return m;
};
process.on('exit', () => {
  const parts = Object.entries(counts).filter(([, c]) => c.r + c.w + c.d).map(([p, c]) => `${p} r=${c.r} w=${c.w} d=${c.d}`);
  console.log(`FBMETER ${process.env.GITHUB_WORKFLOW || 'local'}${process.env.ACCOUNT_LABEL ? ' [' + process.env.ACCOUNT_LABEL + ']' : ''} | ${parts.join(' | ') || 'no firebase use'}`);
});
