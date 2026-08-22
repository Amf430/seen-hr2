/* ═══════════════════════════════════════════════════════════════════════════
   خطّ القراءة المشتق للحضور: الأصل الخام + التصحيحات المعتمدة.

   هذه الوحدة نقيّة عمداً: لا Firebase ولا DOM ولا كتابة. السجل المشتق الذي
   ينشأ من تصحيح بلا أصل يعيش في الذاكرة فقط، ثم يمرّ إلى buildDailyStatus أو
   computePayroll مثل أي دليل يومي آخر من دون أن يلمس وثيقة الحضور الخام.
   ═══════════════════════════════════════════════════════════════════════════ */

import { tsToDate } from './format.js';
import { mergeAttendanceSources, selectPayrollAttendance } from './attendance-sources.js';

const VALID_FIELDS = new Set(['in', 'out']);
const VALID_COLLS = new Set(['attendance', 'zkAttendance']);

/* وثائق attendanceAdjustments الحالية لا تحمل status: وجودها يعني أنها
   كُتبت بعد اعتماد الأدمن وتحت قاعدة create-only. أما كائن اختبار/قديم يحمل
   status صريحاً فلا يُقبل إلا approved، كي لا يحوّل طلباً مرفوضاً إلى دليل. */
export function validAttendanceAdjustment(a, coll = '') {
  return !!a
    && (a.status == null || a.status === 'approved')
    && typeof a.employeeUid === 'string' && a.employeeUid.length > 0
    && typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date)
    && Number.isInteger(a.sessionIdx) && a.sessionIdx >= 0 && a.sessionIdx < 12
    && VALID_FIELDS.has(a.field)
    && (!coll || a.coll == null || a.coll === coll)
    && (a.coll == null || VALID_COLLS.has(a.coll))
    && !!tsToDate(a.value);
}

const adjustmentTime = (a) => {
  if (a?.at?.toMillis) return a.at.toMillis();
  return tsToDate(a?.at)?.getTime() || 0;
};

const validForRecord = (a, rec, coll) => validAttendanceAdjustment(a, coll)
  && a.employeeUid === rec.employeeUid && a.date === rec.date;

/* ⚠️ نسخة جديدة دائماً عند التطبيق: سجلات fetchAttendance مشتركة بين
   الشاشات، وتعديلها في مكانها يسرّب التصحيح إلى مستهلك لم يطلبه. */
export function applyAttendanceAdjustments(rec, adjustments, coll = '') {
  const mine = (adjustments || [])
    .filter((a) => validForRecord(a, rec, coll))
    .sort((a, b) => adjustmentTime(a) - adjustmentTime(b));
  if (!mine.length) return rec;

  const sessions = (Array.isArray(rec.sessions)
    ? rec.sessions
    : rec.checkIn ? [{ in: rec.checkIn, out: rec.checkOut || null }] : [])
    .map((s) => ({ ...s }));
  const applied = [];
  for (const a of mine) {
    while (sessions.length <= a.sessionIdx) sessions.push({ in: null, out: null });
    const s = sessions[a.sessionIdx];
    s[a.field] = a.value;
    s[a.field + 'Adjusted'] = true;
    applied.push(a);
  }
  const hasIn = sessions.some((s) => !!tsToDate(s?.in));
  const hasOut = sessions.some((s) => !!tsToDate(s?.out));
  return {
    ...rec,
    sessions,
    missedCheckIn: hasOut && !hasIn,
    __adjustments: applied,
    __adjusted: applied.length > 0
  };
}

/* يبني مفاتيح الأيام من اتحاد الأصل والدليل المصحّح، لا من الأصل وحده.
   لذلك يستطيع تصحيح صالح أن يثبت يوماً مفقود السجل، بينما التصحيح الفارغ
   أو المرفوض لا ينشئ شيئاً. ولا ينشأ يوم ثانٍ إن كان الأصل موجوداً. */
export function applyAllAttendanceAdjustments(recs, adjustments, coll = '') {
  const source = recs || [];
  const valid = (adjustments || []).filter((a) => validAttendanceAdjustment(a, coll));
  if (!valid.length) return source;

  const out = [...source];
  const keys = new Set(source
    .filter((r) => r?.employeeUid && r?.date)
    .map((r) => `${r.employeeUid}_${r.date}`));

  for (const a of valid) {
    const key = `${a.employeeUid}_${a.date}`;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({
      id: key,
      employeeUid: a.employeeUid,
      employeeName: a.employeeName || '',
      date: a.date,
      source: coll || a.coll || '',
      sessions: [],
      __derivedFromAdjustments: true
    });
  }
  return out.map((r) => applyAttendanceAdjustments(r, valid, coll));
}

const adjustedSources = (physical, mobile, adjustments) => {
  const adjs = adjustments || [];
  return {
    physical: applyAllAttendanceAdjustments(
      physical || [], adjs.filter((a) => a.coll === 'zkAttendance'), 'zkAttendance'),
    mobile: applyAllAttendanceAdjustments(
      mobile || [], adjs.filter((a) => a.coll === 'attendance'), 'attendance')
  };
};

/* المصدر اليومي الموحّد: التصحيح على مجموعته أولاً ثم الدمج. */
export function adjustedUnifiedAttendance(users, physical, mobile, adjustments) {
  const adjusted = adjustedSources(physical, mobile, adjustments);
  return mergeAttendanceSources(users, [
    { coll: 'zkAttendance', records: adjusted.physical },
    { coll: 'attendance', records: adjusted.mobile }
  ]);
}

/* Pipeline المسير الوحيد الذي تستعمله صفحة المسير واللوحة والبروفايل. */
export function adjustedPayrollAttendance(users, config, physical, mobile, adjustments) {
  const adjusted = adjustedSources(physical, mobile, adjustments);
  return selectPayrollAttendance(users, config, adjusted.physical, adjusted.mobile);
}
