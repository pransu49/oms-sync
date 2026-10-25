// attendance-alerts.js - Telegram alerts from the staff attendance page (dalbhaat.in/pages/attendance).
//   - every check-in / check-out (late check-ins are marked)
//   - "not checked in" once per person per day, after their start time + grace minutes
//   - today's attendance numbers are saved for the 9 pm daily summary
// READ-ONLY on the attendance project (sasta-attendance). Its own memory (what was already sent)
// lives in the console project: aikm_admin/attendanceAlerts.
// Needs secrets: FIREBASE_SERVICE_ACCOUNT_ATTENDANCE (sasta-attendance), FIREBASE_SERVICE_ACCOUNT (console).
const admin = require('firebase-admin');
const { notify, esc, LINE } = require('./telegram');

const IST = 5.5 * 3600e3;
const istDate = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const istTime = (iso) => new Date(new Date(iso).getTime() + IST).toISOString().slice(11, 16)
  .replace(/^(\d\d):(\d\d)$/, (_, h, m) => `${(+h % 12) || 12}:${m} ${+h < 12 ? 'am' : 'pm'}`);
const hm = (h) => { const t = Math.round(h * 60); return `${Math.floor(t / 60)}h ${String(t % 60).padStart(2, '0')}m`; };
// "09:30" on a given IST date -> epoch ms
const atIst = (date, hhmm, plusMin = 0) => { const [h, m] = String(hhmm || '09:30').split(':').map(Number); return Date.parse(`${date}T00:00:00Z`) - IST + ((h * 60 + m + plusMin) * 60e3); };
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

(async () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_ATTENDANCE) { console.log('Not set up yet: add the GitHub secret FIREBASE_SERVICE_ACCOUNT_ATTENDANCE (key of the sasta-attendance Firebase project). Skipping.'); return; }
  const att = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_ATTENDANCE)) }, 'att').firestore();
  const main = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }, 'main').firestore();

  const now = Date.now();
  const today = istDate(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(today, -dow), weekEnd = addDays(weekStart, 6);

  const [empS, setS, shiftS, recS, leaveS, holS, woS, stS] = await Promise.all([
    att.collection('attendance_employees').select('name', 'active', 'shiftId', 'weeklyOffDay', 'displayId').get(),
    att.collection('attendance_settings').doc('main').get(),
    att.collection('attendance_shifts').get(),
    att.collection('attendance_records').where('date', '==', today).get(),
    att.collection('attendance_leaves').where('date', '==', today).get(),
    att.collection('attendance_holidays').where('date', '==', today).get(),
    att.collection('attendance_weekoffs').where('date', '>=', weekStart).where('date', '<=', weekEnd).get(),
    main.collection('aikm_admin').doc('attendanceAlerts').get(),
  ]);

  const set = setS.data() || {};
  const grace = set.graceMinutes ?? 15;
  const shifts = Object.fromEntries(shiftS.docs.map((d) => [d.id, d.data()]));
  const emps = empS.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.active !== false);
  const rec = {}; recS.forEach((d) => { const r = d.data(); if (r.employeeId) rec[r.employeeId] = r; });
  const onLeave = new Set(leaveS.docs.map((d) => d.data()).filter((l) => l.status === 'approved').map((l) => l.employeeId));
  const holiday = holS.docs.some((d) => d.data().status !== 'pending');
  const weekOffs = woS.docs.map((d) => d.data());

  const startOf = (e) => (e.shiftId && shifts[e.shiftId] ? shifts[e.shiftId].startTime : set.officeStartTime) || '09:30';
  const reqHours = (e) => (e.shiftId && shifts[e.shiftId] ? shifts[e.shiftId].requiredHours : set.requiredHoursDefault) ?? 9;
  const isOff = (e) => {
    const manual = weekOffs.filter((w) => w.employeeId === e.id);
    if (manual.length) return manual.some((w) => w.date === today);
    const fixed = e.weeklyOffDay !== undefined && e.weeklyOffDay !== null ? e.weeklyOffDay : (set.weeklyOffDayDefault ?? 0);
    return dow === +fixed;
  };
  const dayType = (r, e) => {
    if (!r || !r.punchIn || !r.punchOut) return null;
    const h = (Date.parse(r.punchOut) - Date.parse(r.punchIn)) / 3600e3, need = reqHours(e);
    return { h, label: h >= need ? 'Full day' : h >= need / 2 ? 'Half day' : 'Too short', icon: h >= need ? '✅' : h >= need / 2 ? '🌓' : '⚠️' };
  };

  // memory resets every day. The very first run ever only learns what already happened (no flood).
  let st = stS.exists ? stS.data() : {};
  const firstRun = !stS.exists;
  if (st.date !== today) st = { date: today, inSent: {}, outSent: {}, notInSent: {}, day: {} };

  const events = [];
  for (const e of emps) {
    const r = rec[e.id];
    if (r && r.punchIn && st.inSent[e.id] !== r.punchIn) {
      if (!firstRun) {
        const lateMin = Math.round((Date.parse(r.punchIn) - atIst(today, startOf(e))) / 60e3);
        events.push({ t: r.punchIn, line: `🟢 <b>${esc(e.name)}</b>  checked in · ${istTime(r.punchIn)}${r.isLate ? `  🔸 <b>Late</b>${lateMin > 0 ? ` ${hm(lateMin / 60).replace(/^0h /, '')}` : ''}` : ''}` });
      }
      st.inSent[e.id] = r.punchIn;
    }
    if (r && r.punchOut && st.outSent[e.id] !== r.punchOut) {
      if (!firstRun) {
        const d = dayType(r, e);
        events.push({ t: r.punchOut, line: `🔴 <b>${esc(e.name)}</b>  checked out · ${istTime(r.punchOut)}${d ? `\n      ${d.icon} ${hm(d.h)} · ${d.label}` : ''}` });
      }
      st.outSent[e.id] = r.punchOut;
    }
  }
  events.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  // not checked in after start time + grace (working day, not on leave / off / holiday)
  const expected = holiday ? [] : emps.filter((e) => !isOff(e) && !onLeave.has(e.id));
  const notIn = expected.filter((e) => !(rec[e.id] && rec[e.id].punchIn) && now > atIst(today, startOf(e), grace) && !st.notInSent[e.id]);
  const istHour = new Date(now + IST).getUTCHours();
  const quiet = istHour >= 21 || istHour < 7; // no "not checked in" alerts at night

  const msgs = [];
  if (events.length) msgs.push(`🕘 <b>Attendance</b>\n${LINE}\n` + events.map((x) => x.line).join('\n'));
  if (notIn.length && !quiet && !firstRun) {
    msgs.push(`⚠️ <b>Not checked in yet</b>\n${LINE}\n` + notIn.map((e) => `• <b>${esc(e.name)}</b>  <i>shift ${esc(startOf(e))}</i>`).join('\n'));
  }
  notIn.forEach((e) => { st.notInSent[e.id] = true; });

  // today's numbers for the 9 pm summary
  const present = [], late = [], stillIn = [], absent = [], leave = [], off = [];
  for (const e of emps) {
    const r = rec[e.id];
    if (r && r.punchIn) { present.push(e); if (r.isLate) late.push(e); if (!r.punchOut) stillIn.push(e); continue; }
    if (holiday || isOff(e)) off.push(e); else if (onLeave.has(e.id)) leave.push(e); else absent.push(e);
  }
  const hours = Object.fromEntries(present.map((e) => { const d = dayType(rec[e.id], e); return [e.name, d ? +d.h.toFixed(2) : null]; }));
  const names = (a) => a.map((e) => e.name);
  st.day = { [today]: { total: emps.length, present: names(present), late: names(late), stillIn: names(stillIn), absent: names(absent), leave: names(leave), off: names(off), hours, holiday, at: new Date(now + IST).toISOString().slice(11, 16) + ' IST' } };

  for (const m of msgs) await notify(m, { html: true });
  await main.collection('aikm_admin').doc('attendanceAlerts').set(st);
  console.log(`Attendance ${today}: ${present.length}/${emps.length} in, ${events.length} new punch(es), ${notIn.length} not-in alert(s)${firstRun ? ' (first run ever - learned only, nothing sent)' : ''}.`);
})().catch((e) => { console.error('ATTENDANCE ALERTS FAILED:', e.message); process.exit(1); });
