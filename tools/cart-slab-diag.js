// LOTS cart best-slab check (read-only, owner 22 Nov 2026): for the newest cart upload, does every product sit at
// LOTS' cheapest slab? Reads the newest ~10 lotsCartQueue docs + the LOTS catalogue chunks (~20). Prints, saves nothing.
const admin = require('firebase-admin');
const db = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }).firestore();
const norm = (c) => String(c == null ? '' : c).trim().replace(/^0+(?=\d)/, '');
(async () => {
  const q = await db.collection('lotsCartQueue').orderBy('createdAtMs', 'desc').limit(10).get();
  const reqs = q.docs.map((d) => ({ id: d.id, ...d.data() }));
  reqs.forEach((r) => console.log(`${new Date(r.createdAtMs).toISOString()} ${r.id} ${r.type || 'push'} ${r.store || 'lots'} ${r.status} items ${(r.items || []).length} cart ${(r.cartLines || []).length} bumps ${(r.slabBumps || []).length}`));
  const r = reqs.find((x) => x.type !== 'readCart' && x.status === 'done') || reqs[0];
  const key = r.store === 'lots62' ? 'lots62Catalog' : 'lotsCatalog';
  const ch = await db.collection('aikm_admin').doc(key).collection('chunks').get();
  const meta = await db.collection('aikm_admin').doc(key).get();
  console.log(`\nChecking ${r.id} (${r.store || 'lots'}) against ${key} saved ${meta.exists ? JSON.stringify(meta.data().savedAt) : '?'}`);
  const by = {}; ch.docs.forEach((d) => (d.data().products || []).forEach((p) => { by[norm(p.code)] = p; }));
  const sent = {}; (r.items || []).forEach((i) => { sent[norm(i.code)] = Number(i.qty); });
  const bump = {}; (r.slabBumps || []).forEach((b) => { bump[norm(b.code)] = b; });
  const lines = r.cartLines && r.cartLines.length ? r.cartLines : (r.items || []);
  let ok = 0, notBest = [], noCat = 0;
  lines.forEach((l) => {
    const k = norm(l.code), p = by[k], q = Number(l.qty) || 0;
    if (!p || !p.slabs || !p.slabs.length) { noCat++; return; }
    const s = p.slabs.slice().sort((a, b) => a.min - b.min);
    let b = null; s.forEach((x) => { if (x.price > 0 && (!b || x.price < b.price)) b = x; });
    if (q >= b.min) { ok++; return; }
    notBest.push({ code: k, name: (l.name || p.name || '').slice(0, 40), sentReq: sent[k], cart: q, cartPrice: l.price, best: `${b.min}+ @${b.price}`, slabs: s.map((x) => `${x.min}-${x.max == null ? '+' : x.max}@${x.price}`).join(' '), stock: p.qty, bumped: bump[k] ? `${bump[k].from}->${bump[k].to}` : '' });
  });
  console.log(`Cart lines ${lines.length}: at best slab ${ok} · NOT at best slab ${notBest.length} · not in catalogue ${noCat}`);
  notBest.slice(0, 60).forEach((x) => console.log(`  ${x.code} ${x.name} | request ${x.sentReq} | cart ${x.cart} @${x.cartPrice} | best ${x.best} | slabs ${x.slabs} | stock ${x.stock} | robot ${x.bumped || 'no bump'}`));
  const sample = r.cartSample ? r.cartSample.replace(/"(createdBy|updatedBy)":"[^"]*"/g, '') : '';
  console.log('\nCart sample (no personal fields):', sample.slice(0, 3000));
})().catch((e) => { console.error(e); process.exit(1); });
