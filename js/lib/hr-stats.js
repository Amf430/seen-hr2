/* ═══════════════════════════════════════════════════════════════════════════
   مؤشرات الموارد البشرية — تغذّي لوحة القيادة.

   سبب وجود هذا الملف: شكوى المالك أن اللوحة تُظهر النظام وكأنه «استئذانات
   وإجازات» فقط. والمشكلة قبل أن تكون في التصميم كانت في البيانات — اللوحة
   القديمة كانت تعرض أربعة عدّادات، كلها عن الطلبات (السطور 1055-1066).

   هنا نحسب مؤشرات المنظمة نفسها: القوى العاملة، الحضور اليوم، تكلفة الرواتب،
   العقود المنتهية، والأقسام. وكل مؤشر مشتقّ من بيانات موجودة فعلاً في النظام
   — لا مؤشرات مخترعة تحتاج بيانات لا نملكها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ymd, contractDaysLeft, requestsInCycle } from './dates.js';
import { sessionsOf, buildDailyStatus } from './attendance.js';
import { resolveShift } from './shifts.js';
import { computePayroll } from './payroll.js';
import { liveAttendanceInfo } from './attendance-sources.js';
import { attendanceMetrics } from './attendance-metrics.js';
import { requestBelongsToEmployee } from './permission-link.js';
import { payrollRowsForView, payrollTotals } from './payroll-view.js';

/* الموظفون الفعليون — الأدمن مستثنى من كل إحصاءات القوى العاملة، تماماً كما
   يستثنيه computePayroll و buildDailyStatus. */
export const staffOf = (users) => users.filter((u) => u.role !== 'admin');

/* ═══ القوى العاملة ═══ */
export function workforce(users) {
  const staff = staffOf(users);
  const active = staff.filter((u) => u.status !== 'suspended');
  const byDept = {};
  active.forEach((u) => {
    const d = u.department || 'بلا قسم';
    byDept[d] = (byDept[d] || 0) + 1;
  });
  return {
    total: staff.length,
    active: active.length,
    suspended: staff.length - active.length,
    departments: Object.entries(byDept).sort((a, b) => b[1] - a[1]),
    noSalary: active.filter((u) => !u.salary).length,
    remote: active.filter((u) => u.workMode === 'remote').length
  };
}

/* ═══ الحضور اليوم ═══
   يُحسب من سجلات اليوم فقط، ولا يعدّ إلا من عليه وردية اليوم — فيوم الراحة
   والعطلة الرسمية لا يُحسبان غياباً. */
export function todayAttendance(users, todayRecs, requests) {
  const staff = staffOf(users).filter((u) => u.status !== 'suspended');
  const dateStr = ymd(new Date());
  const dow = new Date().getDay();
  const recMap = {};
  /* حارس نطاق: Overlay يستطيع اشتقاق سجل بلا raw. لو مرّر منادٍ قائمة أوسع
     من اليوم فلا يجوز لسجل تاريخي أن يستبدل سجل اليوم تحت UID نفسه. */
  todayRecs.filter((r) => r.date === dateStr)
    .forEach((r) => { recMap[r.employeeUid] = r; });

  let inNow = 0, onLeave = 0;
  const insideNow = [];

  for (const u of staff) {
    const leave = requests.find((r) => r.type === 'leave' && r.status === 'approved' &&
      requestBelongsToEmployee(r, u) && r.startDate <= dateStr && r.endDate >= dateStr);
    if (leave) { onLeave++; continue; }

    /* ⚠️ نفس المعامل الرابع المستعمل في attendance.js و payroll.js —
       حسبة واحدة في مكان واحد، وإلا تباعدت أرقام التقرير عن أرقام المسير. */
    const sh = resolveShift(dateStr, dow, u.department, u);
    if (!sh || sh.type === 'off') continue;   /* راحة أو عطلة → خارج الحساب */
    const ss = sessionsOf(recMap[u.id]);
    if (!ss.length) continue;
    const live = liveAttendanceInfo(recMap[u.id]);
    if (live.open) {
      inNow++;
      insideNow.push({ u, since: live.since, sourceKind: live.sourceKind,
                       sourceLabel: live.sourceLabel });
    }
  }

  const dayStart = new Date(dateStr + 'T00:00:00');
  const metrics = attendanceMetrics(buildDailyStatus(
    { start: dayStart, end: new Date(), key: dateStr }, staff, requests, todayRecs));
  const expected = metrics.eligibleDays;
  const checkedIn = metrics.attendanceDays;
  const absent = expected - checkedIn;

  return {
    expected, checkedIn, inNow, onLeave, absent, insideNow,
    rate: metrics.attendanceRate, commitmentRate: metrics.commitmentRate
  };
}

/* ═══ العقود ═══ */
export function contracts(users, withinDays = 60) {
  const staff = staffOf(users).filter((u) => u.status !== 'suspended');
  const withDate = staff
    .map((u) => ({ u, left: contractDaysLeft(u.contractEnd) }))
    .filter((x) => x.left !== null);
  return {
    expired:  withDate.filter((x) => x.left < 0).sort((a, b) => a.left - b.left),
    soon:     withDate.filter((x) => x.left >= 0 && x.left <= withinDays).sort((a, b) => a.left - b.left),
    tracked:  withDate.length,
    untracked: staff.length - withDate.length
  };
}

/* ═══ تكلفة الرواتب للدورة ═══
   نفس دالة المسير المعتمدة — لا حساب مستقل، حتى لا يختلف رقم اللوحة عن رقم
   المسير أبداً. */
export function payrollSummary(cyc, users, requests, recs, opts = {}) {
  if (opts.run) {
    const rows = payrollRowsForView(opts.run, [], users);
    return { rows, freshRows: [], ...payrollTotals(rows) };
  }
  const freshRows = computePayroll(cyc, users, requests, recs, { config: opts.config });
  const rows = payrollRowsForView(null, freshRows, users);
  return { rows, freshRows, ...payrollTotals(rows) };
}

/* ═══ الالتزام خلال الدورة ═══ */
export function complianceRate(cyc, users, requests, attendanceRecs) {
  const rows = buildDailyStatus(cyc, users, requests, attendanceRecs);
  return rows.length ? attendanceMetrics(rows) : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   أفضل المنتظمين أسبوعياً — لوحة تحفيز

   ── دمج المصدرين ──
   للموظف مصدرا حضور: جهاز البصمة (zkAttendance) وتسجيل الجوال (attendance).
   المطلوب «أيّهما أولاً» — فمن بصم على الجهاز ٠٧:٥٥ ثم سجّل من جواله ٠٨:٢٠
   حضر السابعة والخمسين، لا الثامنة والعشرين. أخذُ مصدرٍ واحد يظلم من يستعمل
   الآخر.

   ⚠️ المقارنة على أول دخول في اليوم لا على وجود السجل: السجلان قد يوجدان
   معاً، والأبكر هو الحقيقة.

   ── تعريف الانتظام ──
   الأيام المحسوبة = أيام العمل التي ليست إجازة معتمدة. والمنتظم = من دخل في
   وقته (buildDailyStatus تُرجعه 'present'، وهي تُدخل استئذان التأخير المعتمد
   في الحساب فلا يُظلم صاحبه).

   ⚠️ الإجازة تُطرح من المقام لا تُحسب انتظاماً: من كان في إجازة أسبوعاً كاملاً
   كان سيتصدّر بـ ١٠٠٪ بلا أن يداوم يوماً.

   ⚠️ حدّ أدنى من الأيام. بدونه يتصدّر من داوم يوماً واحداً في وقته على من
   داوم خمسة أيام وتأخّر مرة — وهو عكس ما تكافئه اللوحة. */
export const MIN_DAYS_FOR_BOARD = 3;

/* نافذة الأيام السبعة المنتهية اليوم — على شكل دورة تفهمها buildDailyStatus */
export function weekWindow(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end, key: ymd(start) + '_' + ymd(end), label: `${ymd(start)} ← ${ymd(end)}` };
}


export function weeklyPunctuality(users, attendanceRecs, requests, now = new Date()) {
  const win = weekWindow(now);
  const rows = buildDailyStatus(win, users, requests, attendanceRecs);

  const byUid = new Map();
  for (const r of rows) {
    const cur = byUid.get(r.u.id) ||
      { uid: r.u.id, name: r.u.name || '', department: r.u.department || '', rows: [] };
    cur.rows.push(r); byUid.set(r.u.id, cur);
  }

  const board = [...byUid.values()]
    .map((x) => ({ ...x, ...attendanceMetrics(x.rows) }))
    .filter((x) => x.eligibleDays >= MIN_DAYS_FOR_BOARD)
    .map(({ rows: _rows, ...x }) => ({ ...x, counted: x.eligibleDays, rate: x.commitmentRate }))
    .sort((a, b) => (b.commitmentRate ?? -1) - (a.commitmentRate ?? -1)
                  || (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1)
                  || a.name.localeCompare(b.name));

  return { window: win, board, qualified: board.length, minDays: MIN_DAYS_FOR_BOARD };
}

/* ═══ الطلبات — مؤشر واحد، لا أربعة ═══ */
export function requestPulse(cyc, requests, canApproveFn) {
  const inCyc = requestsInCycle(cyc, requests);
  const pending = requests.filter((r) => r.status === 'pending');
  return {
    pending: pending.length,
    mine: canApproveFn ? pending.filter(canApproveFn).length : pending.length,
    cycleTotal: inCyc.length,
    approved: inCyc.filter((r) => r.status === 'approved').length,
    rejected: inCyc.filter((r) => r.status === 'rejected').length,
    permissions: inCyc.filter((r) => r.type === 'permission').length,
    leaves: inCyc.filter((r) => r.type === 'leave').length
  };
}

/* ═══ ما يحتاج إجراءً — يجمع كل التنبيهات في مكان واحد ═══ */
export function actionItems({ workforceStats, contractStats, payroll, requests, attendance, docStats }) {
  const out = [];
  if (requests && requests.mine)
    out.push({ kind: 'warn', icon: 'inbox', text: `${requests.mine} طلب ينتظر موافقتك`, page: 'inbox' });
  /* أعلى من العقود عمداً: إقامة منتهية غرامة نظامية فورية، والعقد المنتهي
     مسألة تُسوَّى إدارياً. الترتيب هنا هو ترتيب الإلحاح. */
  if (docStats && docStats.expired.length)
    out.push({ kind: 'danger', icon: 'alert', text: `${docStats.expired.length} مستند منتهٍ (إقامة/رخصة)`, page: 'employees' });
  if (docStats && docStats.soon.length)
    out.push({ kind: 'warn', icon: 'doc', text: `${docStats.soon.length} مستند يقارب الانتهاء`, page: 'employees' });
  if (contractStats && contractStats.expired.length)
    out.push({ kind: 'danger', icon: 'doc', text: `${contractStats.expired.length} عقد منتهٍ`, page: 'employees' });
  if (contractStats && contractStats.soon.length)
    out.push({ kind: 'warn', icon: 'clock', text: `${contractStats.soon.length} عقد ينتهي خلال 60 يوم`, page: 'employees' });
  if (workforceStats && workforceStats.noSalary)
    out.push({ kind: 'danger', icon: 'money', text: `${workforceStats.noSalary} موظف بلا راتب محدّد`, page: 'employees' });
  if (payroll && payroll.missingOut)
    out.push({ kind: 'violet', icon: 'gap', text: `${payroll.missingOut} يوم بلا بصمة انصراف`, page: 'zklog' });
  if (attendance && attendance.absent)
    out.push({ kind: 'warn', icon: 'alert', text: `${attendance.absent} غائب اليوم`, page: 'attendance' });
  return out;
}
