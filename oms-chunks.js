/**
 * Download saver (15 Nov 2026): Google bills Firestore DOWNLOADS. Robots used to download ALL omsOrders chunks on every run.
 * cachedChunks(collectionRef) lists the chunks with only their small `hash` field, then downloads only the chunks whose hash
 * changed since the last run (the rest come from .cache/oms-chunks.json, kept by the workflow via GitHub cache).
 * Returns an object that behaves like the old query snapshot for what the robots use: forEach / docs / size / empty.
 */
const fs = require('fs');
const FILE = '.cache/oms-chunks.json';
async function cachedChunks(coll) {
  const key = coll.path;
  let all = {}; try { all = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (e) { /* no copy yet */ }
  const mine = all[key] || {};
  const heads = await coll.select('hash').get();
  const ids = [], need = [];
  heads.forEach((d) => { const h = d.get('hash'); ids.push(d.id); if (!h || !mine[d.id] || mine[d.id].hash !== h) need.push(d.ref); });
  const fresh = {};
  if (need.length) {
    for (let i = 0; i < need.length; i += 200) {
      (await coll.firestore.getAll(...need.slice(i, i + 200))).forEach((d) => { if (d.exists) fresh[d.id] = d.data(); });
    }
  }
  const next = {}, docs = [];
  ids.forEach((id) => {
    const data = fresh[id] || mine[id]; if (!data) return;
    next[id] = data;
    docs.push({ id, ref: coll.doc(id), exists: true, data: () => data, get: (f) => data[f] });
  });
  all[key] = next;
  try { fs.mkdirSync('.cache', { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(all)); } catch (e) { /* ignore */ }
  console.log(`OMS chunks: ${ids.length} listed, ${need.length} downloaded, ${ids.length - need.length} from saved copy`);
  return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
}
module.exports = { cachedChunks };
