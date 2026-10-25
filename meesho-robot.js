// meesho-robot.js
// Reads full product details from Amazon's catalogue for the products picked in the Meesho tab
// (dalbhaat.in/pages/amazon -> Meesho). Started only by that tab ("Fill file"). Never runs by itself.
//
// Input (workflow_dispatch): ASINS = comma list (max 100), REQ_ID = id the page waits on.
// Output (Firestore noworry / SPAPI project, collection spapiSnapshots - the page can already read it):
//   meesho_<ASIN>       -> title, brand, bullets, description, images, colour, material, size, dims, other attributes
//   meesho_job_<REQ_ID> -> { status: 'done' | 'failed', ok, missing[] }  (the page watches this one doc)
// The Meesho file itself is filled in the browser - this robot only reads Amazon.

const SellingPartnerAPI = require('amazon-sp-api');
const admin = require('firebase-admin');

const MARKETPLACE_ID = 'A21TJRUUN4KGV';
const COL = 'spapiSnapshots';
const ASINS = [...new Set(String(process.env.ASINS || '').toUpperCase().split(/[^A-Z0-9]+/).filter((a) => /^[A-Z0-9]{10}$/.test(a)))].slice(0, 100);
const REQ_ID = String(process.env.REQ_ID || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || ('r' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_SPAPI)) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const sp = new SellingPartnerAPI({
  region: 'eu', refresh_token: process.env.SPAPI_REFRESH_TOKEN,
  credentials: { SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_CLIENT_SECRET },
});

const COUNTRY = { IN: 'India', CN: 'China', US: 'United States', VN: 'Vietnam', BD: 'Bangladesh', TH: 'Thailand', TW: 'Taiwan', JP: 'Japan', KR: 'South Korea', DE: 'Germany', IT: 'Italy', GB: 'United Kingdom', MY: 'Malaysia', ID: 'Indonesia', LK: 'Sri Lanka', NP: 'Nepal', AE: 'United Arab Emirates', TR: 'Turkey' };
const UNIT = { centimeters: 'cm', millimeters: 'mm', meters: 'm', inches: 'in', grams: 'g', kilograms: 'kg', milliliters: 'ml', liters: 'l', pounds: 'lb', ounces: 'oz' };
const clean = (s) => String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// One Amazon attribute -> a plain text value ("Red", "2 kg", "10 x 5 x 3 cm")
function flat(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  const one = (x) => {
    if (x == null) return '';
    if (typeof x !== 'object') return String(x);
    if (x.value != null && typeof x.value !== 'object') return String(x.value) + (x.unit ? ' ' + (UNIT[x.unit] || x.unit) : '');
    if (x.length || x.width || x.height) {
      const p = ['length', 'width', 'height'].map((k) => x[k] && x[k].value).filter((v) => v != null);
      const u = (x.length || x.width || x.height || {}).unit;
      return p.join(' x ') + (u ? ' ' + (UNIT[u] || u) : '');
    }
    return Object.entries(x).filter(([k]) => !/marketplace_id|language_tag/.test(k)).map(([, v]) => (typeof v === 'object' ? one(v) : v)).filter(Boolean).join(' ');
  };
  return [...new Set(arr.map(one).map((s) => clean(s)).filter(Boolean))].join(', ').slice(0, 400);
}
function dims(arr) {
  const x = Array.isArray(arr) && arr[0];
  if (!x) return null;
  const g = (k) => (x[k] && x[k].value != null ? { v: Number(x[k].value), u: UNIT[x[k].unit] || x[k].unit || '' } : null);
  const l = g('length'), w = g('width'), h = g('height');
  return l || w || h ? { l, w, h } : null;
}
function weight(arr) {
  const x = Array.isArray(arr) && arr[0];
  if (!x || x.value == null) return null;
  const v = Number(x.value), u = String(x.unit || '').toLowerCase();
  if (!(v > 0)) return null;
  return Math.round(u.startsWith('kilo') ? v * 1000 : u.startsWith('pound') ? v * 453.6 : u.startsWith('ounce') ? v * 28.35 : v);   // grams
}
function images(it) {
  const set = (it.images || []).find((x) => x.marketplaceId === MARKETPLACE_ID) || (it.images || [])[0];
  const best = {};
  ((set && set.images) || []).forEach((im) => {
    const k = im.variant || 'X';
    if (!best[k] || (im.height || 0) > (best[k].height || 0)) best[k] = im;
  });
  const order = (k) => (k === 'MAIN' ? 0 : /^PT\d+$/.test(k) ? Number(k.slice(2)) : 99);
  return Object.keys(best).sort((a, b) => order(a) - order(b)).map((k) => best[k].link.replace(/\._[^.\/]+_(\.[a-z]+)$/i, '$1')).slice(0, 9);
}

function compact(it) {
  const a = it.attributes || {}, sm = (it.summaries || []).find((x) => x.marketplaceId === MARKETPLACE_ID) || (it.summaries || [])[0] || {};
  const pt = ((it.productTypes || [])[0] || {}).productType || '';
  const coo = flat(a.country_of_origin);
  const other = {};
  Object.keys(a).forEach((k) => {
    if (/^(bullet_point|product_description|item_name|brand|externally_assigned_product_identifier|merchant_suggested_asin|supplier_declared_dg_hz_regulation|purchasable_offer|list_price|maximum_retail_price|fulfillment_availability|main_product_image_locator|other_product_image_locator_\d+|child_parent_sku_relationship|parentage_level)$/.test(k)) return;
    const v = flat(a[k]);
    if (v && Object.keys(other).length < 80) other[k] = v.slice(0, 200);
  });
  return {
    asin: it.asin, at: Date.now(), productType: pt,
    title: clean(sm.itemName || flat(a.item_name)),
    brand: clean(sm.brand || flat(a.brand)),
    bullets: (a.bullet_point || []).map((b) => clean(b.value)).filter(Boolean).slice(0, 10),
    description: clean(flat(a.product_description)).slice(0, 3000),
    images: images(it),
    color: flat(a.color) || clean(sm.color || ''),
    material: flat(a.material) || flat(a.fabric_type),
    size: flat(a.size) || clean(sm.size || ''),
    pattern: flat(a.pattern),
    countryOfOrigin: COUNTRY[coo.toUpperCase()] || coo,
    manufacturer: flat(a.manufacturer) || clean(sm.manufacturer || ''),
    modelNumber: flat(a.model_number) || clean(sm.modelNumber || ''),
    weightG: weight(a.item_weight) || weight(a.item_package_weight),
    dims: dims(a.item_dimensions) || dims(a.item_length_width_height) || dims(a.item_package_dimensions),
    other,
  };
}

async function main() {
  const job = db.collection(COL).doc(`meesho_job_${REQ_ID}`);
  console.log(`Meesho robot: ${ASINS.length} ASIN(s), request ${REQ_ID}`);
  if (!ASINS.length) { await job.set({ status: 'failed', error: 'No ASINs given', at: Date.now() }); return; }
  await job.set({ status: 'running', total: ASINS.length, at: Date.now() });
  const got = new Set();
  for (let i = 0; i < ASINS.length; i += 20) {
    const chunk = ASINS.slice(i, i + 20);
    let items = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await sp.callAPI({
          operation: 'searchCatalogItems', endpoint: 'catalogItems', options: { version: '2022-04-01' },
          query: { marketplaceIds: [MARKETPLACE_ID], identifiers: chunk, identifiersType: 'ASIN', includedData: ['summaries', 'attributes', 'images', 'productTypes'], pageSize: 20 },
        });
        items = res.items || (res.payload && res.payload.items) || [];
        break;
      } catch (e) {
        console.warn(`Catalogue call failed (try ${attempt}):`, e.message || e);
        await sleep(3000 * attempt);
      }
    }
    const batch = db.batch();
    items.forEach((it) => { if (!it || !it.asin) return; got.add(it.asin); batch.set(db.collection(COL).doc(`meesho_${it.asin}`), compact(it)); });
    await batch.commit();
    await job.set({ status: 'running', total: ASINS.length, ok: got.size, at: Date.now() }, { merge: true });
    if (i === 0 && items[0]) console.log('Sample:', JSON.stringify(compact(items[0])).slice(0, 800));
    await sleep(600);
  }
  const missing = ASINS.filter((a) => !got.has(a));
  await job.set({ status: 'done', total: ASINS.length, ok: got.size, missing, at: Date.now() });
  console.log(`Done: ${got.size} read, ${missing.length} not found${missing.length ? ' (' + missing.join(', ') + ')' : ''}.`);
}

main().catch(async (e) => {
  console.error('Meesho robot FAILED:', e.message || e);
  try { await db.collection(COL).doc(`meesho_job_${REQ_ID}`).set({ status: 'failed', error: String(e.message || e).slice(0, 300), at: Date.now() }); } catch (x) {}
  process.exit(1);
});
