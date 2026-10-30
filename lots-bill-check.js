/**
 * LOTS-GN bill check robot.
 *
 * Every 10 min, 10 AM – 8 PM IST (started after each OMS sync run):
 *   1. Looks for today's LOTS-GN tax invoice in LOTS' invoice storage — the same place the
 *      Purchase Bills page auto-fetches from (no login, no OTP).
 *   2. Finds which Order Mapper batch(es) the bill belongs to (Firestore lotsCartQueue). Big orders go to
 *      LOTS in batches of 160 and LOTS bills each placed batch separately, so every bill is matched to the
 *      batch(es) it covers — each batch's final cart incl. your "Save my final cart" edits.
 *   3. Compares bill vs cart and sends Telegram: not billed, billed but not ordered, qty differences
 *      — with a PDF report.
 * Read-only on LOTS. It never changes the cart or the bill.
 *
 *   node lots-bill-check.js            normal run (only new bills are checked)
 *   node lots-bill-check.js 1061027IN/005527   re-check one bill now (sends Telegram again)
 *   node lots-bill-check.js --dry      re-check today's bills, log only (no Telegram, nothing saved)
 *
 * Firebase use: 1 read per run when there is no new bill; ~30 reads + 1 write when a new bill arrives.
 * Secrets: FIREBASE_SERVICE_ACCOUNT (main AIKM Firebase, has lotsCartQueue), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
 * LOTS code -> barcode list: lots-item-master.json from the public lots-price-sync repo.
 */
const fs = require('fs');
const path = require('path');

const CARD = process.env.LOTS_INVOICE_CARD || '5687000000233754'; // same card as the Purchase Bills page
const GN_PREFIX = '106';                 // LOTS-GN bill numbers start with 106 (LOTS-62 = 102)
const STATE_DOC = ['aikm_admin', 'lotsBillCheck'];
const QUEUE = 'lotsCartQueue';
const LOOKBACK_H = 96;                   // an order is billed within 4 days

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const r2 = (n) => Math.round(n * 100) / 100;
const keyOf = (c) => String(c == null ? '' : c).trim().replace(/^0+(?=\d)/, '');
function istNow() { const d = new Date(Date.now() + 5.5 * 3600e3); return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), min: d.getUTCMinutes() }; }
const istDate = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const inr = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

// ---------------- 1) LOTS invoice storage (same calls as the Purchase Bills page) ----------------
async function invoiceBase() {
  const r = await fetch('https://prd-wrapper-api.lotswholesale.com/inv/v1/card/' + encodeURIComponent(CARD));
  if (!r.ok) throw new Error(`LOTS invoice list did not answer (HTTP ${r.status})`);
  const a = await r.json();
  if (!a[0] || !a[0].url) throw new Error('LOTS invoice list is empty for this card');
  return a[0].url.split('/o/')[0] + '/o/';
}
async function listInvoices(base, prefix) {
  const out = []; let start = '';
  for (let p = 0; p < 40; p++) {
    const u = `${base}?prefix=${encodeURIComponent(`prod/${CARD}/${prefix}`)}&fields=name,size,timeCreated${start ? '&start=' + encodeURIComponent(start) : ''}`;
    const j = await (await fetch(u)).json();
    out.push(...(j.objects || []));
    if (!j.nextStartWith) break;
    start = j.nextStartWith;
  }
  return out.map((o) => {
    const file = o.name.split('/').pop().replace(/\.pdf$/i, '').replace(/^\d{8}-/, '');
    return { obj: o.name, file, no: file.replace('-', '/'), type: (file.match(/^\d+([A-Z]{2})-/) || [])[1] || '', at: o.timeCreated, url: base + o.name.split('/').map(encodeURIComponent).join('/') };
  });
}

// ---------------- 2) Read the LOTS PDF (port of the Purchase Bills page reader) ----------------
async function parseBill(buf) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false }).promise;
  const rows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const lines = [];
    for (const t of tc.items) {
      if (!t.str || !t.str.trim()) continue;
      const y = t.transform[5];
      let l = lines.find((x) => Math.abs(x.y - y) < 2.5);
      if (!l) lines.push(l = { y, it: [] });
      l.it.push({ x: t.transform[4], s: t.str.trim() });
    }
    lines.sort((a, b) => b.y - a.y).forEach((l) => rows.push(l.it.sort((a, b) => a.x - b.x).map((x) => x.s)));
  }
  const field = (re) => {
    for (const r of rows) for (let i = 0; i < r.length; i++) if (re.test(r[i])) { const m = r[i].match(/:\s*(.+)$/); return (m && m[1].trim()) || r[i + 1] || ''; }
    return '';
  };
  const billNo = field(/^(Tax Invoice No\.|Credit Note No\.):?/);
  const dateTxt = field(/^(Invoice Date|Credit Note Date):?/);
  const items = []; let totalRow = null, skipped = 0;
  for (const t of rows) {
    if (t[0] === 'Total:') { totalRow = t; break; }
    const a = /^[A-Z]$/.test(t[0]) ? t.slice(1) : /^[A-Z]\s+\d{6,14}$/.test(t[0]) ? [t[0].replace(/^[A-Z]\s+/, ''), ...t.slice(1)] : t;
    if (!/^\d{6,14}$/.test(a[0]) || a.length < 15) continue;
    const d = a.slice(-14), [q, , , amt, disc, taxable, cgst, , sgst] = d;
    const nameParts = a.slice(1, a.length - 14);
    const hsn = /^\d{4,8}$/.test(nameParts[nameParts.length - 1]) ? nameParts.pop() : '';
    if (!/^[\d.]+$/.test(q) || !hsn) { skipped++; continue; }
    items.push({ barcode: a[0], name: nameParts.join(' '), hsn, qty: num(q), amount: num(amt), disc: Math.abs(num(disc)), taxable: num(taxable), gst: r2(num(cgst) + num(sgst)), total: num(d[12]), rate: num(d[13]) });
  }
  const sum = items.reduce((s, x) => s + x.total, 0);
  let printed = 0;
  if (totalRow) { const n = totalRow.filter((x) => /^-?[\d,]+\.\d+$/.test(x)).map(num); printed = n[n.length - 1] || 0; }
  const [, dd, mm, yy] = dateTxt.match(/(\d{2})\/(\d{2})\/(\d{4})/) || [];
  return { billNo, billDate: yy ? `${yy}-${mm}-${dd}` : '', items, sum: r2(sum), total: Math.round(printed || sum), ok: !skipped && items.length > 0 && Math.abs(sum - printed) < 1 };
}

// ---------------- 3) The ordered cart (same merge as the Picking List PDF in the console) ----------------
function groupsFrom(docs) {
  // docs: [{id, d}] newest first. One group = one order (all its batches + "save my final cart" re-reads).
  const done = docs.filter((x) => x.d.status === 'done' && (x.d.store || 'lots') === 'lots');
  const groups = new Map();
  for (const x of done) {
    const d = x.d;
    if (d.type === 'readCart' && !d.refreshOf && !d.standalone) continue;       // plain cart peeks
    const root = d.standalone ? x.id : (d.batchOf || d.refreshOf || x.id);
    if (d.standalone && d.sideOf) { /* LOTS-GN side cart for a LOTS-62 order = its own order */ }
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(d);
  }
  return [...groups.entries()].map(([root, series]) => ({ root, ...mergeSeries(series.sort((a, b) => (a.batchNo || 1) - (b.batchNo || 1) || (a.createdAtMs || 0) - (b.createdAtMs || 0))) }));
}
function mergeSeries(series) {
  const byBatch = {}, nums = [];
  series.forEach((x) => {
    const bn = x.batchNo || 1;
    if (!byBatch[bn]) { byBatch[bn] = { push: null, refresh: null }; nums.push(bn); }
    if (x.type === 'readCart') { if (!byBatch[bn].refresh || (x.createdAtMs || 0) > (byBatch[bn].refresh.createdAtMs || 0)) byBatch[bn].refresh = x; }
    else byBatch[bn].push = x;
  });
  nums.sort((a, b) => a - b);
  const lines = {}, order = [], units = []; let failed = [], edited = 0;
  nums.forEach((bn) => {
    const g = byBatch[bn], use = g.refresh || g.push;
    if (g.refresh) edited++;
    const ul = {};
    (use.cartLines || []).forEach((l) => {
      const k = keyOf(l.code), q = Number(l.qty) || 0; if (q <= 0) return;
      if (!ul[k]) ul[k] = { code: k, name: l.name || '', qty: 0, total: 0, price: l.price };
      ul[k].qty += q; ul[k].total += l.total != null ? Number(l.total) : (l.price != null ? l.price * q : 0);
    });
    units.push({ bn, edited: !!g.refresh, atMs: use.cartReadAtMs || use.createdAtMs || 0, lines: Object.values(ul).map((x) => ({ ...x, total: r2(x.total) })) });
    (use.cartLines || []).forEach((l) => {
      const k = keyOf(l.code), q = Number(l.qty) || 0; if (q <= 0) return;
      if (!lines[k]) { lines[k] = { code: k, name: l.name || '', qty: 0, total: 0, price: l.price }; order.push(k); }
      const m = lines[k]; m.qty += q; m.total += l.total != null ? Number(l.total) : (l.price != null ? l.price * q : 0);
    });
    ((g.push || {}).failedItems || []).forEach((f) => failed.push(f));
  });
  failed = failed.filter((f) => !lines[keyOf(f.code)]);
  const times = series.map((s) => s.cartReadAtMs || s.createdAtMs || 0);
  const newest = series.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))[0] || {};
  return {
    createdAtMs: (series[0] || {}).createdAtMs || 0, lastAtMs: Math.max(...times), batches: nums.length, edited, units,
    batchTotal: Math.max(nums.length, ...series.map((x) => x.batchTotal || 1)), waiting: (newest.remainingItems || []).length,
    lines: order.map((k) => ({ ...lines[k], total: r2(lines[k].total) })), failed,
  };
}

// ---------------- 4) Compare ----------------
// Ratcliff/Obershelp similarity (same as Python difflib ratio) on cleaned names
function ratio(a, b) {
  if (!a.length && !b.length) return 1;
  const m = (s1, e1, s2, e2) => {
    let best = 0, bi = 0, bj = 0;
    for (let i = s1; i < e1; i++) for (let j = s2; j < e2; j++) {
      let k = 0; while (i + k < e1 && j + k < e2 && a[i + k] === b[j + k]) k++;
      if (k > best) { best = k; bi = i; bj = j; }
    }
    if (!best) return 0;
    return best + m(s1, bi, s2, bj) + m(bi + best, e1, bj + best, e2);
  };
  return (2 * m(0, a.length, 0, b.length)) / (a.length + b.length);
}
const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
function nameScore(cartName, billName) {
  const c = clean(cartName), b = clean(billName);
  // LOTS cuts bill names at 40 characters: compare against the same length too
  return Math.max(ratio(c, b), b.length >= 30 && c.length > b.length ? ratio(c.slice(0, b.length), b) : 0);
}
function compare(cart, bill, master) {
  const billBy = new Map(); bill.items.forEach((b) => {
    const x = billBy.get(b.barcode);
    if (x) { x.qty += b.qty; x.total += b.total; } else billBy.set(b.barcode, { ...b });
  });
  const billList = [...billBy.values()], used = new Set();
  const pairs = [], open = [];
  for (const c of cart.lines) {
    const bc = master[c.code] && master[c.code].b;
    const hit = bc && billBy.get(bc);
    if (hit && !used.has(hit.barcode)) { used.add(hit.barcode); pairs.push([c, hit]); } else open.push(c);
  }
  // name match for the rest (bill often uses a newer barcode than the LOTS catalogue)
  const cand = [];
  for (const c of open) for (const b of billList) if (!used.has(b.barcode)) { const s = nameScore(c.name, b.name); if (s >= 0.84) cand.push([s, c, b]); }
  cand.sort((x, y) => y[0] - x[0]);
  const matched = new Set();
  for (const [, c, b] of cand) { if (matched.has(c.code) || used.has(b.barcode)) continue; matched.add(c.code); used.add(b.barcode); pairs.push([c, b]); }
  // same qty + similar name = LOTS billed a different variant (e.g. Closeup -> Colgate, Natural Care -> Carton)
  const swaps = [], sc = [];
  for (const c of open) if (!matched.has(c.code)) for (const b of billList) if (!used.has(b.barcode) && Math.abs(b.qty - c.qty) < 0.001) { const s = nameScore(c.name, b.name); if (s >= 0.7) sc.push([s, c, b]); }
  sc.sort((x, y) => y[0] - x[0]);
  for (const [, c, b] of sc) { if (matched.has(c.code) || used.has(b.barcode)) continue; matched.add(c.code); used.add(b.barcode); swaps.push({ name: c.name, billName: b.name, qty: c.qty, cartTotal: c.total, billTotal: b.total }); }
  const notBilled = open.filter((c) => !matched.has(c.code)).sort((a, b) => b.total - a.total);
  const extra = billList.filter((b) => !used.has(b.barcode)).sort((a, b) => b.total - a.total);
  // same qty but a very different value = pack size billed wrong (e.g. 2 cases of 12 ordered, 2 single bottles billed)
  const packOff = (c, b) => Math.abs(b.qty - c.qty) < 0.001 && c.total > 50 && (b.total < 0.6 * c.total || b.total > 1.6 * c.total);
  const qtyDiff = pairs.filter(([c, b]) => Math.abs(b.qty - c.qty) > 0.001 || packOff(c, b))
    .map(([c, b]) => (packOff(c, b)
      ? { name: c.name || b.name, billName: b.name, cartQty: c.qty, billQty: b.qty, rate: b.rate, value: r2(b.total - c.total), pack: true, cartTotal: c.total, billTotal: b.total }
      : { name: c.name || b.name, billName: b.name, cartQty: c.qty, billQty: b.qty, rate: b.rate, value: r2((b.qty - c.qty) * b.rate) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const cartTotal = r2(cart.lines.reduce((s, x) => s + x.total, 0));
  return {
    notBilled, extra, qtyDiff, swaps, matchedOk: pairs.length - qtyDiff.length, cartTotal, cartLines: cart.lines.length,
    cartUnits: cart.lines.reduce((s, x) => s + x.qty, 0),
    notBilledValue: r2(notBilled.reduce((s, x) => s + x.total, 0)), extraValue: r2(extra.reduce((s, x) => s + x.total, 0)),
    qtyValue: r2(qtyDiff.reduce((s, x) => s + x.value, 0)),
  };
}
function hitter(bill, master) {
  const bcs = new Set(bill.items.map((b) => b.barcode)), names = bill.items.map((b) => clean(b.name));
  return (c) => {
    const bc = master[c.code] && master[c.code].b;
    if (bc && bcs.has(bc)) return true;
    const cn = clean(c.name);
    return names.some((n) => n && (cn.startsWith(n.slice(0, 25)) || n.startsWith(cn.slice(0, 25))));
  };
}
// Which batch(es) does this bill cover? One LOTS bill = one placed batch (sometimes 2 batches billed together).
// - coverage = share of a batch's products found on the bill (batches never share products, so this is sharp)
// - the same order re-sent / re-saved: keep only the newest copy (skip a batch whose products are already picked)
// - a batch already matched to an earlier bill is used only if nothing else fits (= possible duplicate bill)
function pickBatches(groups, bill, master, billedUnits) {
  const hit = hitter(bill, master), units = [];
  groups.forEach((g) => g.units.forEach((u) => {
    if (!u.lines.length) return;
    const cov = u.lines.filter(hit).length / u.lines.length;
    units.push({ ...u, root: g.root, id: `${g.root}#${u.bn}`, group: g, cov, billedIn: billedUnits[`${g.root}#${u.bn}`] || null });
  }));
  // an older send of the same products (order re-sent / re-built) is replaced by the newer one
  units.forEach((u) => {
    const mine = new Set(u.lines.map((l) => l.code));
    u.superseded = units.some((v) => v !== u && v.atMs > u.atMs && v.lines.filter((l) => mine.has(l.code)).length >= mine.size * 0.5);
  });
  const pickFrom = (min) => {
    const c = units.filter((u) => u.cov >= min && !u.superseded)
      .sort((a, b) => (!!a.billedIn - !!b.billedIn) || (Math.round(b.cov * 20) - Math.round(a.cov * 20)) || (b.atMs - a.atMs));
    const pick = [], covered = new Set();
    for (const u of c) {
      const codes = u.lines.map((l) => l.code), dup = codes.filter((x) => covered.has(x)).length;
      if (dup >= codes.length * 0.5) continue;
      pick.push(u); codes.forEach((x) => covered.add(x));
    }
    return pick;
  };
  let pick = pickFrom(0.5);
  if (!pick.length) pick = pickFrom(0.2).slice(0, 1);     // heavily short-billed: best single batch
  log('Batches:', units.map((u) => `${u.root.slice(0, 6)}#${u.bn} ${u.lines.length} items cov ${u.cov.toFixed(2)}${u.billedIn ? ' billed ' + u.billedIn : ''}${u.superseded ? ' (older copy)' : ''}`).join(' | ') || 'none');
  return pick;
}
function cartOf(pick) {
  const m = {};
  pick.forEach((u) => u.lines.forEach((l) => { const x = m[l.code] || (m[l.code] = { ...l, qty: 0, total: 0 }); x.qty += l.qty; x.total = r2(x.total + l.total); }));
  return { lines: Object.values(m) };
}
// one line per batch of the order(s): which bill it went on, or still waiting
function batchStatus(pick, billNo, billedUnits) {
  const roots = [...new Set(pick.map((u) => u.root))], ids = new Set(pick.map((u) => u.id)), out = [];
  roots.forEach((r) => {
    const g = pick.find((u) => u.root === r).group;
    if (g.batchTotal <= 1 && !g.waiting) return;
    const parts = [];
    for (let bn = 1; bn <= g.batchTotal; bn++) {
      const id = `${r}#${bn}`, u = g.units.find((x) => x.bn === bn);
      parts.push(`B${bn} ${ids.has(id) ? '🧾 this bill' : billedUnits[id] ? '✅ ' + billedUnits[id] : u ? '⏳ not billed yet' : '⏸ not sent to LOTS yet'}`);
    }
    out.push(`Order of ${new Date(g.createdAtMs + 5.5 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')} · ${g.batchTotal} batches: ${parts.join(' · ')}${g.waiting ? ` · ${g.waiting} products still waiting to be sent` : ''}`);
  });
  return out;
}
function overlap(cart, bill, master) {
  const bcs = new Set(bill.items.map((b) => b.barcode)), names = bill.items.map((b) => clean(b.name));
  let hit = 0;
  for (const c of cart.lines) {
    const bc = master[c.code] && master[c.code].b;
    if (bc && bcs.has(bc)) { hit++; continue; }
    const cn = clean(c.name); if (names.some((n) => n && (cn.startsWith(n.slice(0, 25)) || n.startsWith(cn.slice(0, 25))))) hit++;
  }
  return cart.lines.length ? hit / Math.max(cart.lines.length, bill.items.length) : 0;
}

// ---------------- 5) PDF report (navy / gold / cream) ----------------
async function reportPdf(bill, res, order) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const NAVY = rgb(0.078, 0.129, 0.239), GOLD = rgb(0.831, 0.647, 0.216), CREAM = rgb(0.957, 0.933, 0.875), ZEBRA = rgb(0.984, 0.973, 0.945);
  const LINE = rgb(0.886, 0.851, 0.761), INK = rgb(0.1, 0.12, 0.17), MUTED = rgb(0.36, 0.38, 0.44), RED = rgb(0.706, 0.137, 0.094), GREEN = rgb(0.118, 0.482, 0.29), WHITE = rgb(1, 1, 1);
  const safe = (s) => String(s == null ? '' : s).replace(/₹/g, 'Rs ').replace(/[×]/g, 'x').replace(/[–—−]/g, '-').replace(/·/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 34, CW = W - 2 * M;
  let page, y, pageNo = 0;
  const text = (t, x, yy, o = {}) => page.drawText(safe(t), { x, y: yy, size: o.size || 8.5, font: o.bold ? bold : reg, color: o.color || INK });
  const fit = (t, w, f, s) => { t = safe(t); while (t.length > 1 && f.widthOfTextAtSize(t, s) > w) t = t.slice(0, -2); return t; };
  const footer = () => { text('AIKM PHARMA PRIVATE LIMITED - LOTS-GN bill vs cart check', M, 18, { size: 7, color: MUTED }); const p = `Page ${pageNo}`; text(p, W - M - reg.widthOfTextAtSize(p, 7), 18, { size: 7, color: MUTED }); };
  const newPage = (first) => {
    if (page) footer();
    page = pdf.addPage([W, H]); pageNo++;
    const bh = first ? 70 : 34;
    page.drawRectangle({ x: 0, y: H - bh, width: W, height: bh, color: NAVY });
    page.drawRectangle({ x: 0, y: H - bh - 3, width: W, height: 3, color: GOLD });
    if (first) {
      text('LOTS-GN Bill vs Cart - Reconciliation', M, H - 34, { size: 16, bold: true, color: GOLD });
      text(`Invoice ${bill.billNo} dated ${bill.billDate.split('-').reverse().join('/')}  -  Order Mapper cart of ${new Date(order.createdAtMs + 5.5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} IST${order.batchLabel ? ` - ${order.batchLabel}` : ''}${order.edited ? ' incl. your edits' : ''}`, M, H - 54, { size: 8.5, color: rgb(0.9, 0.88, 0.8) });
    } else text('LOTS-GN Bill vs Cart - ' + bill.billNo, M, H - 22, { size: 10, bold: true, color: GOLD });
    y = H - bh - 3 - 18;
  };
  const ensure = (h) => { if (y - h < 34) newPage(false); };
  newPage(true);
  // KPI strip
  const k = [['CART VALUE', inr(res.cartTotal)], ['BILLED', inr(bill.total)], [res.cartTotal >= bill.total ? 'CART - BILL' : 'BILL OVER CART', inr(Math.abs(res.cartTotal - bill.total))],
    ['NOT BILLED', `${res.notBilled.length} items - ${inr(res.notBilledValue)}`], ['EXTRA BILLED', res.extra.length ? `${res.extra.length} items - ${inr(res.extraValue)}` : 'None']];
  const kw = CW / 5;
  page.drawRectangle({ x: M, y: y - 34, width: CW, height: 40, color: CREAM, borderColor: GOLD, borderWidth: 0.6 });
  k.forEach(([a, b], i) => { text(a, M + 8 + i * kw, y - 8, { size: 6.5, color: MUTED }); text(fit(b, kw - 12, bold, 8.5), M + 8 + i * kw, y - 24, { size: 8.5, bold: true, color: i >= 2 && !(i === 4 && !res.extra.length) ? RED : i === 4 ? GREEN : INK }); });
  y -= 52;
  if (order.dupOf && order.dupOf.length) { text(`WARNING: these products were already billed in ${order.dupOf.join(', ')} - possible duplicate bill.`, M, y, { size: 9.5, bold: true, color: RED }); y -= 16; }
  (order.status || []).forEach((t) => { text(t.replace(/🧾|✅|⏳|⏸/g, '').replace(/\s+/g, ' '), M, y, { size: 8, color: MUTED }); y -= 12; });
  if ((order.status || []).length) y -= 6;
  const table = (title, head, widths, rows, total, colorCol) => {
    ensure(60);
    text(title, M, y, { size: 11, bold: true, color: NAVY }); y -= 10;
    const xs = []; let acc = M; widths.forEach((w) => { xs.push(acc); acc += w * CW; });
    const hdr = () => { page.drawRectangle({ x: M, y: y - 14, width: CW, height: 16, color: NAVY }); head.forEach((h, i) => text(h, xs[i] + 4, y - 9, { size: 7.5, bold: true, color: GOLD })); y -= 16; };
    hdr();
    rows.concat(total ? [total] : []).forEach((r, ri) => {
      const isTot = total && ri === rows.length;
      if (y - 15 < 34) { newPage(false); hdr(); }
      page.drawRectangle({ x: M, y: y - 14, width: CW, height: 15, color: isTot ? CREAM : ri % 2 ? ZEBRA : WHITE, borderColor: LINE, borderWidth: 0.3 });
      r.forEach((c, i) => text(fit(c, widths[i] * CW - 8, isTot ? bold : reg, 7.8), xs[i] + 4, y - 10, { size: 7.8, bold: isTot, color: colorCol && colorCol(ri, i, isTot) || INK }));
      y -= 15;
    });
    y -= 14;
  };
  let sec = 0;
  if (res.notBilled.length) table(`${++sec}. In cart but NOT billed (${res.notBilled.length} items)`, ['#', 'Product', 'LOTS code', 'Qty', 'Price', 'Amount'], [0.05, 0.47, 0.14, 0.08, 0.12, 0.14],
    res.notBilled.map((c, i) => [i + 1, c.name, c.code, c.qty, c.price != null ? inr(c.price) : '-', inr(c.total)]),
    ['', 'Total not billed', '', res.notBilled.reduce((s, x) => s + x.qty, 0), '', inr(res.notBilledValue)]);
  if (res.extra.length) table(`${++sec}. Billed but NOT in cart (${res.extra.length} items)`, ['#', 'Product (as billed)', 'Barcode', 'Qty', 'Rate', 'Amount'], [0.05, 0.45, 0.17, 0.07, 0.12, 0.14],
    res.extra.map((b, i) => [i + 1, b.name, b.barcode, b.qty, inr(b.rate), inr(b.total)]), ['', 'Total extra billed', '', '', '', inr(res.extraValue)], (ri, i) => (i === 5 ? RED : null));
  if (res.qtyDiff.length) table(`${++sec}. Billed with different qty or pack (${res.qtyDiff.length} items)`, ['#', 'Product', 'Cart qty', 'Billed', 'Diff', 'Value impact'], [0.05, 0.47, 0.1, 0.1, 0.08, 0.2],
    res.qtyDiff.map((q, i) => { const d = q.billQty - q.cartQty; return [i + 1, q.name + (q.pack ? ' (pack size? value differs)' : ''), q.cartQty, q.billQty, q.pack ? 'pack' : (d > 0 ? '+' : '') + d, (q.value > 0 ? '+' : '-') + inr(Math.abs(q.value)) + (q.value > 0 ? ' extra billed' : ' short billed')]; }),
    ['', 'Net qty impact', '', '', '', (res.qtyValue > 0 ? '+' : '-') + inr(Math.abs(res.qtyValue))],
    (ri, i, tot) => (i >= 4 ? ((tot ? res.qtyValue : res.qtyDiff[ri].value) > 0 ? RED : GREEN) : null));
  if (res.swaps.length) table(`${++sec}. Different variant billed (${res.swaps.length} items)`, ['#', 'In cart', 'Billed as', 'Qty', 'Cart', 'Bill'], [0.05, 0.33, 0.33, 0.07, 0.11, 0.11],
    res.swaps.map((w, i) => [i + 1, w.name, w.billName, w.qty, inr(w.cartTotal), inr(w.billTotal)]));
  if (!res.notBilled.length && !res.extra.length && !res.qtyDiff.length && !res.swaps.length) { text('All good - every cart item is billed with the same quantity.', M, y, { size: 11, bold: true, color: GREEN }); y -= 20; }
  ensure(30);
  text(`${res.matchedOk} cart items match the bill exactly. Red = you pay more than ordered. Green = billed less. Items LOTS could not add to the cart (out of stock) are not counted.`, M, y, { size: 7.5, color: MUTED });
  footer();
  return Buffer.from(await pdf.save());
}

// ---------------- 6) Telegram ----------------
let DRY = process.argv.includes('--dry');
async function tg(method, body, isForm) {
  if (DRY) { log(`[dry run] Telegram ${method}:`, isForm ? '(PDF)' : String(body.text).replace(/<[^>]+>/g, '').slice(0, 1500)); return true; }
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) { log('Telegram not sent: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing'); return false; }
  try {
    let res;
    if (isForm) { body.append('chat_id', chat); res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body }); }
    else res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, disable_web_page_preview: true, ...body }) });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) log('Telegram error:', j.description || res.status);
    return !!j.ok;
  } catch (e) { log('Telegram error:', e.message); return false; }
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function message(bill, res, order) {
  const ok = !res.notBilled.length && !res.extra.length && !res.qtyDiff.length && !res.swaps.length;
  const L = [];
  L.push(`${ok ? '✅' : '🧾'} <b>LOTS-GN bill check</b> — ${esc(bill.billNo)}${order.batchLabel ? ` · ${esc(order.batchLabel)}` : ''}`);
  L.push(`Cart ${inr0(res.cartTotal)} (${res.cartLines} items) · Bill ${inr0(bill.total)} (${bill.items.length} lines)`);
  if (order.dupOf && order.dupOf.length) L.push(`🚨 <b>These products were already billed in ${esc(order.dupOf.join(', '))} — possible DUPLICATE bill.</b>`);
  (order.status || []).forEach((t) => L.push(esc(t)));
  if (ok) { L.push('', 'Every cart item of this batch is billed with the same quantity.'); return L.join('\n'); }
  const list = (arr, fmt, max = 8) => arr.slice(0, max).map(fmt).concat(arr.length > max ? [`  …and ${arr.length - max} more (see PDF)`] : []);
  if (res.notBilled.length) { L.push('', `❌ <b>Not billed: ${res.notBilled.length} items · ${inr0(res.notBilledValue)}</b>`); L.push(...list(res.notBilled, (c) => `• ${esc(c.name)} ×${c.qty} — ${inr0(c.total)}`)); }
  if (res.extra.length) { L.push('', `⚠️ <b>Billed but NOT ordered: ${res.extra.length} items · ${inr0(res.extraValue)}</b>`); L.push(...list(res.extra, (b) => `• ${esc(b.name)} ×${b.qty} — ${inr0(b.total)}`)); }
  if (res.qtyDiff.length) { L.push('', `↕️ <b>Qty / pack different: ${res.qtyDiff.length} items</b>`); L.push(...list(res.qtyDiff, (q) => q.pack
    ? `• ${esc(q.name)}: qty ${q.cartQty} both, but billed ${inr0(q.billTotal)} vs cart ${inr0(q.cartTotal)} — pack size? (${q.value > 0 ? '+' : '−'}${inr0(Math.abs(q.value))})`
    : `• ${esc(q.name)}: cart ${q.cartQty} → bill ${q.billQty} (${q.value > 0 ? '+' : '−'}${inr0(Math.abs(q.value))})`)); }
  if (res.swaps.length) { L.push('', `🔁 <b>Different variant billed: ${res.swaps.length}</b>`); L.push(...list(res.swaps, (w) => `• ${esc(w.name)} → billed as ${esc(w.billName)} ×${w.qty}`)); }
  L.push('', `✔ ${res.matchedOk} items match.${res.extra.length || res.qtyDiff.some((q) => q.value > 0) ? ' Count the extra stock before paying.' : ' Check the delivery and claim the short items.'}`);
  return L.join('\n');
}

// ---------------- main ----------------
let db = null;
function initDb() {
  if (db) return db;
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.AIKM_FIREBASE_SERVICE_ACCOUNT)) });
  return (db = admin.firestore());
}
async function loadMaster() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'lots-item-master.json'), 'utf8')); } catch (e) { /* not in this repo */ }
  try {
    const r = await fetch('https://raw.githubusercontent.com/pransu49/lots-price-sync/main/lots-item-master.json');
    if (r.ok) return await r.json();
  } catch (e) { /* fall through */ }
  log('LOTS item master not available — matching by name only'); return {};
}

async function checkBill(inv, master, state, force) {
  log(`Checking ${inv.no} (uploaded ${inv.at})`);
  const buf = Buffer.from(await (await fetch(inv.url)).arrayBuffer());
  const bill = await parseBill(buf);
  if (!bill.items.length) throw new Error(`Could not read the items of LOTS bill ${inv.no}`);
  log(`Bill ${bill.billNo}: ${bill.items.length} lines, total ${bill.total}, lines add up: ${bill.ok}`);
  const billAtMs = new Date(inv.at).getTime();
  const snap = await initDb().collection(QUEUE).where('createdAtMs', '>=', billAtMs - LOOKBACK_H * 3600e3).orderBy('createdAtMs', 'desc').limit(40).get();
  const groups = groupsFrom(snap.docs.map((x) => ({ id: x.id, d: x.data() })))
    .filter((g) => g.lines.length && g.createdAtMs < billAtMs);
  const billedUnits = {};
  Object.values(state.done || {}).forEach((x) => { if (x.no !== inv.no) (x.units || []).forEach((id) => { billedUnits[id] = x.no; }); });
  const pick = pickBatches(groups, bill, master, billedUnits);
  if (!pick.length) {
    const sentNo = await tg('sendMessage', { text: `🧾 LOTS-GN bill ${inv.no} (${inr0(bill.total)}, ${bill.items.length} lines) arrived, but no matching LOTS-GN order was found in the Order Mapper for the last 4 days. Was it ordered by hand? Use "Read hand-filled LOTS cart" before ordering next time.` });
    return { no: inv.no, at: inv.at, root: null, units: [], billTotal: bill.total, note: 'no matching order', sent: sentNo };
  }
  const dupOf = [...new Set(pick.filter((u) => u.billedIn).map((u) => u.billedIn))];
  const order = {
    ...cartOf(pick), createdAtMs: Math.min(...pick.map((u) => u.group.createdAtMs)), edited: pick.some((u) => u.edited),
    batchLabel: pick[0].group.batchTotal > 1 || pick.length > 1 ? 'Batch ' + pick.map((u) => u.bn).sort((a, b) => a - b).join(' + ') + ' of ' + Math.max(...pick.map((u) => u.group.batchTotal)) : '',
    status: batchStatus(pick, inv.no, billedUnits), dupOf,
  };
  log(`Bill covers: ${pick.map((u) => `${u.root.slice(0, 6)}#${u.bn} (${u.lines.length} items, cov ${u.cov.toFixed(2)})`).join(' + ')}${dupOf.length ? ' — ALREADY BILLED in ' + dupOf.join(', ') : ''}`);
  const res = compare(order, bill, master);
  log(`Not billed ${res.notBilled.length} (${res.notBilledValue}) · extra ${res.extra.length} (${res.extraValue}) · qty diff ${res.qtyDiff.length} · ok ${res.matchedOk}`);
  const pdfBuf = await reportPdf(bill, res, order);
  const fileName = `LOTS-GN_Bill_Check_${bill.billNo.replace(/\//g, '-')}.pdf`;
  if (process.env.OUT_DIR) fs.writeFileSync(path.join(process.env.OUT_DIR, fileName), pdfBuf);
  const text = message(bill, res, order);
  if (process.env.OUT_DIR) fs.writeFileSync(path.join(process.env.OUT_DIR, fileName.replace('.pdf', '.txt')), text);
  let sent = await tg('sendMessage', { text, parse_mode: 'HTML' });
  if (!sent) sent = await tg('sendMessage', { text: text.replace(/<[^>]+>/g, '') });
  const fd = new FormData();
  fd.append('document', new Blob([pdfBuf], { type: 'application/pdf' }), fileName);
  fd.append('caption', `LOTS-GN ${bill.billNo} vs cart`);
  await tg('sendDocument', fd, true);
  return {
    no: inv.no, at: inv.at, root: pick[0].root, units: pick.map((u) => u.id), billTotal: bill.total, cartTotal: res.cartTotal, checkedAt: new Date().toISOString(), sent,
    notBilled: res.notBilled.map((c) => ({ code: c.code, name: c.name, qty: c.qty, total: c.total })),
    extra: res.extra.map((b) => ({ barcode: b.barcode, name: b.name, qty: b.qty, total: b.total })),
    qtyDiff: res.qtyDiff.map((q) => ({ name: q.name, cartQty: q.cartQty, billQty: q.billQty, value: q.value })), swaps: res.swaps, matchedOk: res.matchedOk,
  };
}

async function main() {
  const arg = process.argv.slice(2).find((x) => x && !x.startsWith('--'));
  const only = arg ? arg.replace('/', '-') : null;
  const now = istNow();
  const master = await loadMaster();
  const base = await invoiceBase();
  const all = await listInvoices(base, only || `${GN_PREFIX}`);
  const today = all.filter((x) => x.type === 'IN' && x.file.startsWith(GN_PREFIX) && (only ? x.file === only : istDate(x.at) === now.date));
  log(`LOTS-GN bills ${only ? 'asked for' : 'uploaded today'}: ${today.map((x) => x.no).join(', ') || 'none'}`);

  // bills from the last 3 days that were never checked (robot did not run that day) are checked too
  if (!only) {
    const back = all.filter((x) => x.type === 'IN' && x.file.startsWith(GN_PREFIX) && Date.now() - new Date(x.at).getTime() < 3 * 86400e3 && !today.includes(x));
    today.push(...back);
  }
  // no LOTS-GN bill and before the 3 PM reminder: nothing to do, don't touch Firebase
  if (!only && !DRY && !today.length && now.hour < 15) { log('No bill yet - nothing to do.'); return; }
  const ref = initDb().collection(STATE_DOC[0]).doc(STATE_DOC[1]);
  const state = (await ref.get()).data() || { done: {} };
  state.done = state.done || {};
  // new bills + bills whose Telegram alert did not go out yet (max 3 tries)
  const todo = today.filter((x) => only || DRY || !state.done[x.file] || (!state.done[x.file].sent && (state.done[x.file].tries || 1) < 3));
  let changed = false;
  for (const inv of todo) {
    try { const tries = ((state.done[inv.file] || {}).tries || 0) + 1; state.done[inv.file] = { ...(await checkBill(inv, master, state, !!only)), tries }; changed = true; }
    catch (e) { log('FAILED', inv.no, e.message); await tg('sendMessage', { text: `🔴 LOTS-GN bill check failed for ${inv.no}: ${e.message}` }); }
  }
  // 3 PM: batches of the newest LOTS-GN order still without a bill -> one reminder a day
  if (!only && !DRY && now.hour >= 15 && state.noBillAlert !== now.date) {
    const snap = await initDb().collection(QUEUE).where('createdAtMs', '>=', Date.now() - 30 * 3600e3).orderBy('createdAtMs', 'desc').limit(30).get();
    const g = groupsFrom(snap.docs.map((x) => ({ id: x.id, d: x.data() }))).filter((x) => x.lines.length).sort((a, b) => b.lastAtMs - a.lastAtMs)[0];
    if (g) {
      const billed = new Set(); Object.values(state.done).forEach((x) => (x.units || []).forEach((id) => billed.add(id)));
      const open = g.units.filter((u) => u.lines.length && !billed.has(`${g.root}#${u.bn}`));
      if (open.length) {
        const val = open.reduce((s, u) => s + u.lines.reduce((t, l) => t + l.total, 0), 0);
        await tg('sendMessage', { text: `⏳ LOTS-GN: no bill yet for ${g.batchTotal > 1 ? 'batch ' + open.map((u) => u.bn).join(', ') + ' of ' + g.batchTotal : 'your last order'} (${open.reduce((s, u) => s + u.lines.length, 0)} items, ${inr0(val)}). The robot keeps checking until 4 PM — ask LOTS to upload the bill.` });
      }
    }
    state.noBillAlert = now.date; changed = true;
  }
  if (changed && !DRY) {
    const keys = Object.keys(state.done).sort((a, b) => (state.done[b].at || '').localeCompare(state.done[a].at || '')).slice(0, 60);
    state.done = Object.fromEntries(keys.map((k) => [k, state.done[k]]));
    state.updatedAt = new Date().toISOString();
    await ref.set(state);
  }
  log('Done.');
}

module.exports = { pickBatches, cartOf, batchStatus, parseBill, mergeSeries, groupsFrom, compare, overlap, reportPdf, message, nameScore, listInvoices, invoiceBase };
if (require.main === module) main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  const isQuota = /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e && e.message));
  if (isQuota) { console.log('Firebase daily limit reached — will try on the next run.'); process.exit(0); }
  process.exit(1);
});
