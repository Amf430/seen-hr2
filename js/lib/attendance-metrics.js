/* ═══════════════════════════════════════════════════════════════════════════
   مؤشرا الحضور والانضباط — منطق نقي لا يعرف Firebase ولا الواجهة.

   Attendance Rate يجيب: هل وُجد الموظف فعلياً في يوم العمل؟
   Commitment Rate يجيب: هل كان اليوم الحاضر منضبطاً زمنياً بالكامل؟

   ⚠️ لا أوزان جزئية. اليوم المنضبط إمّا كامل أو غير منضبط، والإجازة المعتمدة
   خارج المقام. إبقاء القرار هنا يمنع كل شاشة من اختراع معنى مختلف للنسبة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { tsToDate } from './format.js';

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

/* توزيع الحالات كما يظهر في صفحة «أدائي».
   ⚠️ هذا عدٌّ للعرض فقط؛ لا يغيّر معنى الحضور أو الالتزام أدناه. إبقاؤه
   نقيّاً يمنع نسيان حالة من الرسم بينما تبقى داخلة في إجمالي الأيام. */
const DISTRIBUTION_CLASSES = ['present', 'late', 'absent', 'leave', 'missing', 'missingIn'];
export function attendanceDistribution(rows) {
  const counts = Object.fromEntries(DISTRIBUTION_CLASSES.map((cls) => [cls, 0]));
  for (const row of rows || []) {
    if (Object.hasOwn(counts, row?.cls)) counts[row.cls]++;
  }
  return {
    counts,
    total: (rows || []).length,
    counted: Object.values(counts).reduce((sum, n) => sum + n, 0)
  };
}

/* حدّا اليوم مع دعم حالة «انصراف فقط» المعلَّمة صراحةً.

   ⚠️ لا نستنتج missingIn من أي timestamp منفرد: سجلات الجهاز القديمة قد تحمل
   بصمة واحدة هي دخول فعلي. الدليل الدلالي هو missedCheckIn الذي تحرسه قواعد
   Firestore. وإذا أضاف تصحيحٌ معتمَد وقت الدخول، يعود اليوم للمسار العادي. */
export function dayBounds(sessions, opts = {}) {
  const ins = [], outs = [], all = [];
  for (const s of sessions || []) {
    const i = tsToDate(s?.in), o = tsToDate(s?.out);
    if (i) { ins.push(i); all.push(i); }
    if (o) { outs.push(o); all.push(o); }
  }

  if (opts.missedCheckIn === true && !ins.length && outs.length) {
    const lastOut = outs.reduce((a, b) => (a > b ? a : b));
    return { firstIn: null, lastOut, spanSecs: 0, hasAttendanceEvidence: true };
  }

  let first = null, last = null;
  for (const t of all) {
    if (!first || t < first) first = t;
    if (!last || t > last) last = t;
  }
  return {
    firstIn: first,
    lastOut: (first && last && last > first) ? last : null,
    spanSecs: (first && last && last > first) ? (last - first) / 1000 : 0,
    hasAttendanceEvidence: !!first
  };
}

const isFullDayExcused = (r) => r?.cls === 'leave' || r?.fullDayExcused === true;
const hasEvidence = (r) => {
  if (!r) return false;
  if (typeof r.hasAttendanceEvidence === 'boolean') return r.hasAttendanceEvidence;
  return !!(r.firstIn || r.lastOut);
};
const violationMinutes = (r, preferred, fallback) => {
  const value = r?.[preferred] ?? r?.[fallback] ?? 0;
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
};

export function attendanceMetrics(rows) {
  const eligible = (rows || []).filter((r) => r?.cls && !isFullDayExcused(r));
  const attended = eligible.filter(hasEvidence);
  const committed = attended.filter((r) => {
    if (r.cls === 'missing' || r.cls === 'missingIn' || r.cls === 'absent') return false;
    if (r.cls === 'late') return false;
    if (violationMinutes(r, 'punctualityLateMin', 'lateMin') > 0) return false;
    if (violationMinutes(r, 'punctualityEarlyMin', 'earlyMin') > 0) return false;
    return true;
  });

  return {
    eligibleDays: eligible.length,
    attendanceDays: attended.length,
    committedDays: committed.length,
    excludedDays: (rows || []).filter(isFullDayExcused).length,
    attendanceRate: pct(attended.length, eligible.length),
    commitmentRate: pct(committed.length, eligible.length)
  };
}
