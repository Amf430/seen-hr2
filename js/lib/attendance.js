/* ═══════════════════════════════════════════════════════════════════════════
   سجلات الحضور — الجلسات والحالة اليومية.

   ⚠️ sessionsOf و workedSecs و lastOutOf و buildDailyStatus منقولة حرفياً
   (السطور 503-513، 2151-2156، 2160-2213). buildDailyStatus هي التي تقرّر
   «حاضر / متأخر / غائب / إجازة / نسيان بصمة» لكل يوم لكل موظف، وتظهر في
   التقارير وفي بروفايل الموظف. لا تُعاد صياغتها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, collection, query, where, getDocs } from './firebase.js';
import { ymd, AR_DAYS } from './dates.js';
import { tsToDate } from './format.js';
import { resolveShift, shiftWindowFor, MISSING_OUT_AFTER_MIN, LATE_GRACE_MIN } from './shifts.js';
import { hmToDate } from './dates.js';
import { hm } from './format.js';

/* الشكل القديم كان checkIn/checkOut مفردين، والجديد مصفوفة جلسات.
   ندعم الاثنين حتى تبقى السجلات القديمة مقروءة. */
export function sessionsOf(d) {
  if (!d) return [];
  if (Array.isArray(d.sessions)) return d.sessions;
  if (d.checkIn) return [{ in: d.checkIn, out: d.checkOut || null, inLoc: d.checkInLoc, outLoc: d.checkOutLoc }];
  return [];
}

/* ⚠️ `until` معامل جديد لم يكن في النسخة القديمة، ووجوده يصلح خطأً حقيقياً:
   الجلسة المفتوحة كانت تُحتسب من وقت الدخول حتى «الآن» مهما مضى. موظف نسي
   بصمة الانصراف يوم 27 يوليو كان يظهر في التقرير بـ«114:23:44» ساعة — العدّاد
   ظلّ يزيد خمسة أيام. مع تمرير `until` تُقصّ الجلسة المفتوحة عند نهاية
   ورديتها، فيظهر رقم منطقي.

   بلا `until` يبقى السلوك كما كان تماماً — وهذا مقصود: مؤقّت الدوام الحيّ في
   شاشة الحضور يحتاج فعلاً أن يعدّ حتى اللحظة. */
export function workedSecs(sessions, until) {
  let t = 0, open = false;
  for (const s of sessions) {
    const i = tsToDate(s.in); if (!i) continue;
    const o = tsToDate(s.out);
    if (o) t += (o - i) / 1000;
    else {
      const stop = (until != null) ? Math.min(Date.now(), until) : Date.now();
      t += Math.max(0, (stop - i) / 1000);
      open = true;
    }
  }
  return { secs: t, open };
}

export function lastOutOf(sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].out) return tsToDate(sessions[i].out);
  }
  return null;
}

/* ── سجلات الموظف نفسه ──
   ⚠️ لا تستعمل fetchAttendance هنا. هي تستعلم بالتاريخ فقط، وقاعدة القراءة
   تسمح للموظف بسجلاته هو فقط — وFirestore يرفض الاستعلام كاملاً ما لم يكن
   مقيَّداً بحيث تحقّق كل نتيجة محتملة شرط القاعدة. النتيجة كانت أن بطاقة
   «سجلّي في هذه الدورة» ما تظهر أبداً لأي موظف.

   إضافة where('employeeUid','==',uid) تحلّها لكنها تحتاج فهرساً مركّباً
   يُنشأ من Console. ومعرّف الوثيقة معروف مسبقاً (uid_YYYY-MM-DD)، فنقرأها
   مباشرة بلا استعلام ولا فهرس. */
export async function fetchMyAttendance(cycle, uid, coll = 'attendance') {
  const now = new Date();
  const end = (cycle.end < now) ? cycle.end : now;
  const days = [];
  for (let d = new Date(cycle.start); d <= end; d.setDate(d.getDate() + 1)) days.push(ymd(d));

  const snaps = await Promise.all(
    days.map((ds) => getDoc(doc(db, coll, `${uid}_${ds}`)).catch(() => null))
  );
  return snaps
    .filter((s) => s && s.exists())
    .map((s) => ({ id: s.id, ...s.data() }));
}

/* جلب سجلات الحضور ضمن دورة — من أي مجموعة (الموقع أو الجهاز).
   للأدمن فقط: القاعدة تسمح له بقراءة الكل، فالاستعلام بالتاريخ يمرّ. */
export async function fetchAttendance(cycle, coll = 'attendance') {
  const s1 = ymd(cycle.start), s2 = ymd(cycle.end);
  const q1 = query(collection(db, coll), where('date', '>=', s1), where('date', '<=', s2));
  const snap = await getDocs(q1);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* تسطيح الجلسات لصفوف قابلة للعرض والتصدير */
export function flattenSessions(recs) {
  const rows = [];
  recs.forEach((r) => {
    const ss = sessionsOf(r);
    if (!ss.length) { rows.push({ r, idx: 0, s: null }); return; }
    ss.forEach((s, i) => rows.push({ r, idx: i, s }));
  });
  rows.sort((a, b) =>
    (a.r.employeeName || '').localeCompare(b.r.employeeName || '') ||
    (a.r.date > b.r.date ? 1 : -1) || a.idx - b.idx);
  return rows;
}

/* ═══ الحالة اليومية (حاضر/متأخر/غائب/إجازة) مع ربط الاستئذان — منقولة حرفياً ═══ */
export function buildDailyStatus(cyc, users, requests, recs) {
  const recMap = {}; recs.forEach((r) => { recMap[r.employeeUid + '_' + r.date] = r; });
  const emps = users.filter((u) => u.role !== 'admin');
  const now = new Date();
  const end = (cyc.end < now) ? cyc.end : now;
  const rows = [];
  emps.forEach((u) => {
    /* لا غياب قبل تاريخ المباشرة — نفس علّة المسير */
    const hire = u.hireDate ? new Date(u.hireDate + 'T00:00:00') : null;
    const startsAt = (hire && !isNaN(hire) && hire > cyc.start) ? hire : cyc.start;
    for (let d = new Date(startsAt); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = ymd(d), dow = d.getDay();
      const shift = resolveShift(dateStr, dow, u.department);
      if (!shift || shift.type === 'off') continue;   /* راحة أو عطلة رسمية → لا يُحاسب عليها */
      const leave = requests.find((r) => r.type === 'leave' && r.status === 'approved' &&
        r.employeeUid === u.id && r.startDate <= dateStr && r.endDate >= dateStr);
      const perms = requests.filter((r) => r.type === 'permission' && r.status === 'approved' &&
        r.employeeUid === u.id && r.date === dateStr);
      const latePerm = perms.find((p) => (p.category || '').includes('تأخير'));
      const earlyPerm = perms.find((p) => (p.category || '').includes('خروج'));
      const rec = recMap[u.id + '_' + dateStr];
      const sessions = sessionsOf(rec);
      const firstIn = sessions.length ? tsToDate(sessions[0].in) : null;
      const lastOut = lastOutOf(sessions);
      const openSess = sessions.some((s) => !s.out);
      const win = shiftWindowFor(d, shift);
      /* الجلسة المفتوحة تُقصّ عند نهاية الوردية بدل أن تعدّ حتى الآن */
      const { secs } = workedSecs(sessions, win ? win.end.getTime() : null);
      let status, cls, note = '', lateMin = 0;
      if (leave) { status = 'إجازة: ' + (leave.categoryLabel || ''); cls = 'leave'; }
      else if (firstIn) {
        /* نسيان بصمة الخروج: جلسة مفتوحة ومضى أكثر من ساعتين على نهاية الوردية */
        if (openSess && win && now > new Date(win.end.getTime() + MISSING_OUT_AFTER_MIN * 60000)) {
          status = 'نسيان بصمة الخروج'; cls = 'missing';
          note = `دخل ${hm(firstIn)} ولم يسجّل انصراف — مضى أكثر من ساعتين على نهاية الوردية`;
        } else {
          const allowedStr = (latePerm && latePerm.time) ? latePerm.time : (shift.start || '');
          const allowedBase = hmToDate(d, allowedStr);
          if (allowedBase) {
            const grace = new Date(allowedBase.getTime() + LATE_GRACE_MIN * 60000);
            if (firstIn > grace) {
              lateMin = Math.round((firstIn - allowedBase) / 60000);
              status = 'متأخر'; cls = 'late'; note = `تأخر ${lateMin} د`;
            } else { status = 'حاضر'; cls = 'present'; }
          } else { status = 'حاضر'; cls = 'present'; }
        }
        if (latePerm)  note = (note ? note + ' · ' : '') + `استئذان تأخير حتى ${latePerm.time || ''}`;
        if (earlyPerm) note = (note ? note + ' · ' : '') + `استئذان خروج مبكر ${earlyPerm.time || ''}`;
      } else {
        status = 'غائب'; cls = 'absent';
        if (latePerm)       note = `استئذان تأخير حتى ${latePerm.time || ''}`;
        else if (earlyPerm) note = `استئذان خروج مبكر ${earlyPerm.time || ''}`;
      }
      if (shift.src === 'exception' && shift.exLabel) note = (note ? note + ' · ' : '') + shift.exLabel;
      else if (shift.src === 'dept')                  note = (note ? note + ' · ' : '') + 'وردية القسم';
      rows.push({ u, dateStr, dow, shift, status, cls, note, firstIn, lastOut, secs, rec, openSess, lateMin });
    }
  });
  rows.sort((a, b) => (a.u.name || '').localeCompare(b.u.name || '') || (a.dateStr > b.dateStr ? 1 : -1));
  return rows;
}

export { AR_DAYS };
