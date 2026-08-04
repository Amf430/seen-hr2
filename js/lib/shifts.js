/* ═══════════════════════════════════════════════════════════════════════════
   الأقسام · استثناءات التواريخ · حلّ الوردية

   ترتيب الأولوية:
     1) استثناء تاريخ محدّد (عطلة رسمية أو دوام خاص للشركة كلها)
     2) ورديات خاصة بقسم الموظف
     3) الورديات الأسبوعية العامة

   ⚠️ منقولة حرفياً من النسخة القديمة (السطور 384-438 و 514-520 و 2158-2160).
   التعديل الوحيد المسموح: إضافة export واستبدال SETTINGS/ME بالدوال.
   هذه الدوال تحدّد من هو «متأخر» ومن هو «غائب» — وعليها يُبنى الخصم من
   الراتب. أي إعادة صياغة هنا تغيّر رواتب الناس بصمت.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getSettings, getMe } from './state.js';
import { ymd, hmToDate } from './dates.js';

/* بعد ساعتين من نهاية الوردية → يُعتبر نسيان بصمة خروج */
export const MISSING_OUT_AFTER_MIN = 120;
/* سماح لتسجيل الحضور بعد نهاية الوردية */
export const GRACE_AFTER_END_MIN = 120;
/* دقائق السماح قبل احتساب التأخير في التقرير اليومي */
export const LATE_GRACE_MIN = 15;

export function deptOf(name) {
  if (!name) return null;
  return (getSettings().departments || []).find((d) => d.name === name) || null;
}

export function dateException(dateStr) {
  return (getSettings().dateExceptions || []).find((x) => x.date === dateStr) || null;
}

export function resolveShift(dateStr, dow, deptName) {
  const ex = dateException(dateStr);
  if (ex) {
    if (ex.type === 'off')
      return { type: 'off', start: '', end: '', src: 'exception', exLabel: ex.label || 'عطلة رسمية' };
    return { type: ex.kind || 'morning', start: ex.start || '', end: ex.end || '',
             src: 'exception', exLabel: ex.label || 'دوام خاص' };
  }
  const d = deptOf(deptName);
  if (d && d.shifts && d.shifts[dow])
    return { ...d.shifts[dow], src: 'dept', exLabel: 'وردية قسم ' + d.name };
  const s = (getSettings().shifts || {})[dow];
  return s ? { ...s, src: 'company' } : { type: 'off', start: '', end: '', src: 'none' };
}

/* عدد ساعات الوردية المطلوبة — يدعم العبور لمنتصف الليل */
export function shiftHours(sh) {
  if (!sh || sh.type === 'off' || !sh.start || !sh.end) return 0;
  const [h1, m1] = sh.start.split(':').map(Number), [h2, m2] = sh.end.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1); if (mins <= 0) mins += 1440;
  return mins / 60;
}

/* نافذة الوردية كتواريخ فعلية على يوم معيّن */
export function shiftWindowFor(baseDate, sh) {
  if (!sh || sh.type === 'off' || !sh.start || !sh.end) return null;
  const st = hmToDate(baseDate, sh.start); let en = hmToDate(baseDate, sh.end);
  if (en <= st) en = new Date(en.getTime() + 86400000);
  return { start: st, end: en };
}

export function shiftText(sh) {
  if (!sh || sh.type === 'off') return sh && sh.exLabel ? sh.exLabel : 'راحة';
  const kind = sh.type === 'evening' ? 'مسائي' : 'صباحي';
  return `${kind} ${sh.start || ''}–${sh.end || ''}`;
}

/* وردية اليوم للمستخدم الحالي */
export function myShiftToday(base) {
  const d = base || new Date();
  const me = getMe();
  return resolveShift(ymd(d), d.getDay(), me ? me.department : '');
}

export function shiftLabelOf(dow) {
  const d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  const me = getMe();
  const sh = resolveShift(ymd(d), dow, me ? me.department : '');
  return shiftText(sh);
}

export function shiftEndPassed() {
  const now = new Date();
  const w = shiftWindowFor(now, myShiftToday(now));
  if (!w) return false;
  return now > new Date(w.end.getTime() + GRACE_AFTER_END_MIN * 60000);
}

/* ═══ أيام الإجازة الفعلية ═══

   ⚠️ كانت في lib/dates.js وتقرأ SETTINGS.shifts وحدها. الآن تمرّ بـ
   resolveShift() فتحترم نفس ترتيب الأولوية الذي يعتمده المسير والتقارير:
     ١) استثناء التاريخ (عطلة رسمية أو دوام خاص)
     ٢) وردية قسم الموظف
     ٣) الوردية الأسبوعية العامة

   الأثر العملي: إجازة تمرّ على عيد رسمي ما عاد يُخصم العيد فيها من رصيد
   الموظف، وعدد الأيام المخصوم صار مطابقاً لعدد الأيام التي يعفيها المسير.

   deptName اختياري — لو لم يُمرَّر يسقط للورديات العامة، وهو سلوك النسخة
   السابقة بالضبط. */
export function workingDaysBetween(a, b, deptName) {
  const start = new Date(a + 'T00:00:00'), end = new Date(b + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return { days: 0, off: 0 };
  let n = 0, off = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const sh = resolveShift(ymd(d), d.getDay(), deptName);
    if (!sh || sh.type === 'off') off++; else n++;
  }
  return { days: Math.max(0, n), off };
}
