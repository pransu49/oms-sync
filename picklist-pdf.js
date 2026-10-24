// picklist-pdf.js — one premium picklist PDF design used by every robot
// (Amazon Easy Ship, Amazon self-ship / NimbusPost labels, Meesho + Snapdeal).
//
//   const { picklistPdf, sendTelegramPdf } = require('./picklist-pdf');
//   const bytes = await picklistPdf({ title: 'Meesho + Snapdeal', date: '2026-10-24', orders: 45,
//     rows: [{ name: 'TOOR-1KG', qty: 12, accounts: { 'Praso · Meesho': 8, 'Sasta · Snapdeal': 4 } }] });
//   await sendTelegramPdf('Picklist.pdf', bytes, 'caption');
//
// CLI (used by the Python label robot):  node picklist-pdf.js picklist.json
//   picklist.json = { title, date, orders, rows, fileName, caption }  -> builds and sends to Telegram
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const NAVY = rgb(0.043, 0.094, 0.188);      // #0b1830
const GOLD = rgb(0.788, 0.635, 0.294);      // #c9a24b
const CREAM = rgb(0.98, 0.969, 0.937);      // #faf7ef
const ZEBRA = rgb(0.988, 0.984, 0.969);
const LINE = rgb(0.886, 0.867, 0.82);
const INK = rgb(0.13, 0.15, 0.2);
const MUTED = rgb(0.45, 0.47, 0.52);
const WHITE = rgb(1, 1, 1);

// the built-in PDF font only knows basic Latin — keep text safe and readable
const safe = (s) => String(s == null ? '' : s).replace(/₹/g, 'Rs ').replace(/[×✕]/g, 'x').replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();

function wrap(text, font, size, maxW, maxLines) {
  const words = safe(text).split(' '); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) { cur = t; continue; }
    if (cur) lines.push(cur);
    cur = w;
    while (font.widthOfTextAtSize(cur, size) > maxW && cur.length > 1) { // very long word: cut it
      let k = cur.length; while (k > 1 && font.widthOfTextAtSize(cur.slice(0, k), size) > maxW) k--;
      lines.push(cur.slice(0, k)); cur = cur.slice(k);
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '...'); }
  return lines.length ? lines : [''];
}

function niceDate(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (isNaN(d)) return safe(ymd);
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAY[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

async function picklistPdf({ title, date, orders, rows, note }) {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 36;                 // A4, 0.5 inch margins
  const list = (rows || []).filter((r) => r && r.qty > 0)
    .sort((a, b) => safe(a.name).localeCompare(safe(b.name)));   // A-Z = same order as the labels
  const units = list.reduce((a, r) => a + r.qty, 0);
  const multiAcc = list.some((r) => Object.keys(r.accounts || {}).length > 0);
  const made = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(11, 16);

  // columns
  const cNo = M + 10, cName = M + 40, cQtyR = W - M - 52, cBox = W - M - 34;
  const ACC_W = 160;                                     // accounts column (name + its qty)
  const nameW = (multiAcc ? cQtyR - 48 - ACC_W - 14 : cQtyR - 48) - cName;
  const cAcc = cName + nameW + 14, cAccR = cAcc + ACC_W;

  let page, y, pageNo = 0;
  const pages = [];
  const header = (first) => {
    page = pdf.addPage([W, H]); pages.push(page); pageNo++;
    const bandH = first ? 104 : 54;
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: NAVY });
    page.drawRectangle({ x: 0, y: H - bandH - 3, width: W, height: 3, color: GOLD });
    page.drawText('A I K M', { x: M, y: H - 26, size: 8, font: bold, color: GOLD });
    page.drawText('PICKLIST', { x: M, y: H - (first ? 52 : 44), size: first ? 22 : 14, font: bold, color: WHITE });
    if (first) page.drawText(safe(title), { x: M, y: H - 74, size: 12, font: reg, color: rgb(0.85, 0.82, 0.72) });
    const dt = niceDate(date);
    page.drawText(dt, { x: W - M - bold.widthOfTextAtSize(dt, first ? 12 : 10), y: H - (first ? 52 : 44), size: first ? 12 : 10, font: bold, color: WHITE });
    if (first) { const t = `Generated ${made} IST`; page.drawText(t, { x: W - M - reg.widthOfTextAtSize(t, 8.5), y: H - 74, size: 8.5, font: reg, color: rgb(0.75, 0.73, 0.66) }); }
    y = H - bandH - 3 - 22;

    if (first) { // three stat cards
      const stats = [['ORDERS', orders ?? '-'], ['UNITS TO PICK', units], ['PRODUCTS', list.length]];
      const gap = 12, cw = (W - 2 * M - 2 * gap) / 3, ch = 58;
      stats.forEach(([k, v], i) => {
        const x = M + i * (cw + gap);
        page.drawRectangle({ x, y: y - ch, width: cw, height: ch, color: CREAM, borderColor: LINE, borderWidth: 0.8 });
        page.drawRectangle({ x, y: y - ch, width: 3, height: ch, color: GOLD });
        page.drawText(k, { x: x + 14, y: y - 18, size: 7.5, font: bold, color: MUTED });
        page.drawText(String(v), { x: x + 14, y: y - 46, size: 22, font: bold, color: NAVY });
      });
      y -= ch + 24;
      if (note) { page.drawText(safe(note), { x: M, y, size: 8.5, font: reg, color: MUTED }); y -= 16; }
    }
    // table head
    page.drawText('#', { x: cNo, y, size: 7.5, font: bold, color: MUTED });
    page.drawText('PRODUCT', { x: cName, y, size: 7.5, font: bold, color: MUTED });
    if (multiAcc) page.drawText('ACCOUNTS', { x: cAcc, y, size: 7.5, font: bold, color: MUTED });
    page.drawText('QTY', { x: cQtyR - bold.widthOfTextAtSize('QTY', 7.5), y, size: 7.5, font: bold, color: MUTED });
    page.drawText('DONE', { x: cBox - 3, y, size: 7.5, font: bold, color: MUTED });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: NAVY });
  };

  header(true);
  const FOOT = 70;
  list.forEach((r, i) => {
    const nameLines = wrap(r.name, bold, 10.5, nameW, 3);
    const accLines = multiAcc ? Object.entries(r.accounts || {}).sort((a, b) => b[1] - a[1]).map(([a, q]) => [safe(a), String(q)]) : [];
    const accShown = accLines.slice(0, 3);
    const lines = Math.max(nameLines.length, accShown.length, 1);
    const rh = Math.max(30, 14 + lines * 12.5);
    if (y - rh < FOOT) header(false);
    const top = y;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: top - rh, width: W - 2 * M, height: rh, color: ZEBRA });
    const mid = top - rh / 2;
    page.drawText(String(i + 1), { x: cNo, y: mid - 3, size: 9, font: reg, color: MUTED });
    nameLines.forEach((t, k) => page.drawText(t, { x: cName, y: top - 17 - k * 12.5, size: 10.5, font: bold, color: INK }));
    accShown.forEach(([a, q], k) => {
      const yy = top - 16.5 - k * 12.5, qw2 = bold.widthOfTextAtSize(q, 8);
      let t = a; while (t.length > 1 && reg.widthOfTextAtSize(t, 8) > ACC_W - qw2 - 10) t = t.slice(0, -1);
      if (t !== a) t = t.replace(/.$/, '...');
      page.drawText(t, { x: cAcc, y: yy, size: 8, font: reg, color: MUTED });
      page.drawText(q, { x: cAccR - qw2, y: yy, size: 8, font: bold, color: INK });
    });
    if (accLines.length > 3) page.drawText(`+${accLines.length - 3} more`, { x: cAcc, y: top - 16.5 - 3 * 12.5, size: 7, font: reg, color: MUTED });
    // qty pill
    const qs = String(r.qty), qw = Math.max(30, bold.widthOfTextAtSize(qs, 13) + 16);
    page.drawRectangle({ x: cQtyR - qw, y: mid - 10, width: qw, height: 20, color: NAVY });
    page.drawText(qs, { x: cQtyR - qw / 2 - bold.widthOfTextAtSize(qs, 13) / 2, y: mid - 4.5, size: 13, font: bold, color: WHITE });
    // tick box
    page.drawRectangle({ x: cBox, y: mid - 7, width: 14, height: 14, borderColor: NAVY, borderWidth: 1 });
    y = top - rh;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  });
  if (!list.length) { page.drawText('Nothing to pick.', { x: cName, y: y - 24, size: 11, font: reg, color: MUTED }); y -= 40; }

  // total + sign-off
  if (y - 90 < FOOT - 30) header(false);
  y -= 18;
  page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 26, color: CREAM, borderColor: LINE, borderWidth: 0.8 });
  page.drawText('TOTAL UNITS', { x: cName, y: y - 17, size: 8.5, font: bold, color: MUTED });
  const ts = String(units);
  page.drawText(ts, { x: cQtyR - bold.widthOfTextAtSize(ts, 13) - 8, y: y - 18, size: 13, font: bold, color: NAVY });
  y -= 64;
  [['Picked by', M], ['Checked by', W / 2 + 10]].forEach(([t, x]) => {
    page.drawLine({ start: { x: x + 62, y }, end: { x: x + 230, y }, thickness: 0.8, color: MUTED });
    page.drawText(t, { x, y: y + 2, size: 9, font: reg, color: MUTED });
  });

  pages.forEach((p, k) => {
    const t = `Page ${k + 1} of ${pages.length}`;
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: LINE });
    p.drawText(`AIKM  -  ${safe(title)}  -  ${niceDate(date)}`, { x: M, y: 22, size: 7.5, font: reg, color: MUTED });
    p.drawText(t, { x: W - M - reg.widthOfTextAtSize(t, 7.5), y: 22, size: 7.5, font: reg, color: MUTED });
  });
  void pageNo;
  return Buffer.from(await pdf.save());
}

async function sendTelegramPdf(fileName, bytes, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) { console.log('Telegram not set up — picklist PDF not sent'); return false; }
  try {
    const fd = new FormData();
    fd.append('chat_id', chat);
    if (caption) fd.append('caption', String(caption).slice(0, 1000));
    fd.append('document', new Blob([bytes], { type: 'application/pdf' }), fileName);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.log('Telegram picklist not sent:', j.description || r.status);
    return !!j.ok;
  } catch (e) { console.log('Telegram picklist not sent:', e.message); return false; }
}

module.exports = { picklistPdf, sendTelegramPdf };

if (require.main === module) {
  (async () => {
    const j = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
    const bytes = await picklistPdf(j);
    if (process.argv[3]) { require('fs').writeFileSync(process.argv[3], bytes); console.log('Picklist saved:', process.argv[3]); return; }
    const ok = await sendTelegramPdf(j.fileName || 'Picklist.pdf', bytes, j.caption || '');
    console.log(ok ? 'Picklist PDF sent to Telegram.' : 'Picklist PDF not sent.');
  })().catch((e) => { console.log('Picklist skipped:', e.message); });
}
