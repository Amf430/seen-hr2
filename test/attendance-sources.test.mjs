import {
  PAYROLL_ATTENDANCE_SOURCE, mergeAttendanceSources, payrollAttendanceSource,
  payrollConfigForRun, selectPayrollAttendance, liveAttendanceInfo, sourceRecordUid,
  loadRequiredAttendanceSources
} from '../js/lib/attendance-sources.js';
import {
  applyAllAttendanceAdjustments, adjustedPayrollAttendance
} from '../js/lib/attendance-pipeline.js';
import { payrollRowsForView, payrollRowForEmployee } from '../js/lib/payroll-view.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      توقّعنا ${e}\n      وجاء   ${a}`); }
};
const at = (hm) => new Date(`2026-08-18T${hm}:00`);
const rec = (uid, source, sessions, over = {}) => ({
  id: `${uid}_2026-08-18`, employeeUid: uid, employeeName: 'سالم',
  date: '2026-08-18', source, sessions, ...over
});
const users = [{ id: 'newUid', previousUids: ['oldUid'], name: 'سالم' }];

console.log('\n\x1b[1m═══ عقد وحدات تصحيحات الحضور ═══\x1b[0m');
const adjustmentModule = readFileSync(
  new URL('../js/lib/adjustments.js', import.meta.url), 'utf8'
);
const employeeHome = readFileSync(
  new URL('../js/pages/home-employee.js', import.meta.url), 'utf8'
);
eq('رئيسية الموظف لا تستورد adjustmentsForUsers بلا export مطابق', true,
  /import\s*\{[^}]*\badjustmentsForUsers\b[^}]*\}\s*from\s*['"]\.\.\/lib\/adjustments\.js['"]/.test(employeeHome)
  && /export\s+async\s+function\s+adjustmentsForUsers\s*\(/.test(adjustmentModule));

console.log('\n\x1b[1m═══ توحيد مصدري الحضور ═══\x1b[0m');

let out = mergeAttendanceSources(users, [{ coll: 'zkAttendance', records: [
  rec('newUid', 'device', [{ in: at('08:00'), out: at('16:00') }])
]}]);
eq('مصدر واحد يبقى يوماً واحداً', 1, out.length);
eq('مصدر واحد يحتفظ بحدّيه', ['08:00', '16:00'],
   [out[0].sessions[0].in.toTimeString().slice(0, 5), out[0].sessions[0].out.toTimeString().slice(0, 5)]);
const split = rec('newUid', 'device', [
  { in: at('08:00'), out: at('12:00') }, { in: at('13:00'), out: null }
]);
out = mergeAttendanceSources(users, [{ coll: 'zkAttendance', records: [split] }]);
eq('مصدر واحد يحتفظ بجلساته بلا إعادة بناء', 2, out[0].sessions.length);
eq('والجلسة المفتوحة تبقى مفتوحة', null, out[0].sessions[1].out);

out = mergeAttendanceSources(users, [
  { coll: 'zkAttendance', records: [rec('newUid', 'device', [{ in: at('07:55'), out: at('15:50') }])] },
  { coll: 'attendance', records: [rec('newUid', 'web', [{ in: at('08:20'), out: at('16:10') }])] }
]);
eq('المصدران لا يصيران يومين', 1, out.length);
eq('الدخول الأبكر والخروج الأحدث يكتملان من المصدرين', ['07:55', '16:10'],
   [out[0].sessions[0].in.toTimeString().slice(0, 5), out[0].sessions[0].out.toTimeString().slice(0, 5)]);
eq('هوية المصدر المركبة معلنة', ['zkAttendance', 'attendance'], out[0].__sources);
eq('السجلات الخام محفوظة للتدقيق', 2, out[0].__sourceRecords.length);

out = mergeAttendanceSources(users, [
  { coll: 'zkAttendance', records: [rec('oldUid', 'device', [{ in: at('08:00'), out: null }])] },
  { coll: 'attendance', records: [rec('newUid', 'web', [{ in: at('08:05'), out: at('16:00') }])] }
]);
eq('UID القديم والحالي يندمجان تحت الهوية الحالية', ['newUid', 1], [out[0].employeeUid, out.length]);
eq('خروج المصدر الآخر يكمل الجلسة المفتوحة', '16:00', out[0].sessions[0].out.toTimeString().slice(0, 5));
eq('تصحيح المصدر الفعلي يحتفظ بـUID السجل التاريخي', 'oldUid',
   sourceRecordUid(out[0], 'zkAttendance'));
eq('ولا يأخذ UID الجوال الحالي بدلاً منه', 'newUid',
   sourceRecordUid(out[0], 'attendance'));

out = mergeAttendanceSources(users, [{ coll: 'attendance', records: [{
  employeeUid: 'newUid', date: '2026-08-18', checkIn: at('09:00'), checkOut: at('17:00')
}] }]);
eq('الشكل القديم checkIn/checkOut يبقى بلا إعادة كتابة', ['09:00', '17:00'],
   [out[0].checkIn.toTimeString().slice(0, 5), out[0].checkOut.toTimeString().slice(0, 5)]);

out = mergeAttendanceSources(users, [
  { coll: 'zkAttendance', records: [rec('newUid', 'device', [])] },
  { coll: 'attendance', records: [rec('newUid', 'web', [{ in: at('08:10'), out: null }])] }
]);
eq('سجل فارغ لا يهزم دخولاً صالحاً', '08:10', out[0].sessions[0].in.toTimeString().slice(0, 5));
eq('بلا خروج تبقى الجلسة مفتوحة', null, out[0].sessions[0].out);

out = mergeAttendanceSources(users, [
  { coll: 'attendance', records: [rec('newUid', 'web',
    [{ in: null, out: at('16:00') }], { missedCheckIn: true })] },
  { coll: 'zkAttendance', records: [rec('newUid', 'device', [])] }
]);
eq('دمج المصدرين يحفظ دليل الخروج المعلّم', [true, null, '16:00'],
   [out[0].missedCheckIn, out[0].sessions[0].in,
    out[0].sessions[0].out.toTimeString().slice(0, 5)]);

console.log('\n\x1b[1m═══ الموجودون داخل العمل ودلالة المصدر ═══\x1b[0m');

out = mergeAttendanceSources(users, [{ coll: 'zkAttendance', records: [
  rec('newUid', 'device', [{ in: at('08:00'), out: null }])
]}]);
eq('Physical only يظهر ببصمة', [true, 'physical', 'بصمة', '08:00'],
   (() => { const x = liveAttendanceInfo(out[0]);
     return [x.open, x.sourceKind, x.sourceLabel, x.since.toTimeString().slice(0, 5)]; })());

out = mergeAttendanceSources(users, [{ coll: 'attendance', records: [
  rec('newUid', 'web', [{ in: at('08:05'), out: null }])
]}]);
eq('Mobile only يظهر بجوال', [true, 'mobile', 'جوال'],
   (() => { const x = liveAttendanceInfo(out[0]);
     return [x.open, x.sourceKind, x.sourceLabel]; })());

out = mergeAttendanceSources(users, [
  { coll: 'zkAttendance', records: [rec('newUid', 'device', [{ in: at('08:00'), out: null }])] },
  { coll: 'attendance', records: [rec('newUid', 'web', [{ in: at('08:05'), out: null }])] }
]);
eq('Both ينتج موظفاً واحداً ودلالة المصدرين', [1, true, 'both', 'بصمة + جوال'],
   (() => { const x = liveAttendanceInfo(out[0]);
     return [out.length, x.open, x.sourceKind, x.sourceLabel]; })());

out = mergeAttendanceSources(users, [{ coll: 'zkAttendance', records: [
  rec('newUid', 'device', [{ in: at('08:00'), out: at('16:00') }])
]}]);
eq('Check-out مكتمل لا يظهر داخل العمل', false, liveAttendanceInfo(out[0]).open);
eq('لا حضور اليوم لا يظهر', { open: false, since: null, sourceKind: '', sourceLabel: '' },
   liveAttendanceInfo(null));

out = mergeAttendanceSources(users, [
  { coll: 'zkAttendance', records: [rec('oldUid', 'device', [{ in: at('08:00'), out: null }])] },
  { coll: 'zkAttendance', records: [rec('newUid', 'device', [{ in: at('08:02'), out: null }])] }
]);
eq('previousUids لا يكرر الموظف أو المصدر', [1, 'physical', 'بصمة'],
   [out.length, liveAttendanceInfo(out[0]).sourceKind, liveAttendanceInfo(out[0]).sourceLabel]);

out = mergeAttendanceSources(users, [{ coll: 'attendance', records: [
  rec('newUid', 'web', [{ in: at('08:00'), out: null }]),
  rec('newUid', 'web', [{ in: at('08:10'), out: null }], { id: 'duplicate' })
]}]);
eq('عدة سجلات من المصدر نفسه لا تكرر الموظف ولا تصنع both', [1, 'mobile', 'جوال'],
   [out.length, liveAttendanceInfo(out[0]).sourceKind, liveAttendanceInfo(out[0]).sourceLabel]);

out = mergeAttendanceSources(users, [
  { coll: 'zkAttendance', records: [rec('newUid', 'device', [{ in: at('08:00'), out: null }])] },
  { coll: 'attendance', records: [rec('newUid', 'web', [])] }
]);
eq('Record موحد فارغ من الجوال لا يصنع both', ['physical', 'بصمة'],
   [liveAttendanceInfo(out[0]).sourceKind, liveAttendanceInfo(out[0]).sourceLabel]);

eq('Record بتاريخ آخر لا يثبت مصدراً لهذا اليوم', ['', ''],
   (() => { const merged = { employeeUid: 'newUid', date: '2026-08-18',
       sessions: [{ in: at('08:00'), out: null }],
       __sourceRecords: [{ coll: 'zkAttendance', rec: rec('newUid', 'device',
         [{ in: at('08:00'), out: null }], { date: '2026-08-17' }) }] };
     const x = liveAttendanceInfo(merged); return [x.sourceKind, x.sourceLabel]; })());

eq('جلستان مفتوحتان متناقضتان تتبعان السلوك الآمن الحالي بلا تخمين إغلاق',
   [true, '09:00'],
   (() => { const x = liveAttendanceInfo(rec('newUid', 'device', [
       { in: at('08:00'), out: null }, { in: at('09:00'), out: null }
     ])); return [x.open, x.since.toTimeString().slice(0, 5)]; })());

console.log('\n\x1b[1m═══ مصدر الحضور للمسير ═══\x1b[0m');
eq('غياب الإعداد يرجع للسلوك القديم', PAYROLL_ATTENDANCE_SOURCE.PHYSICAL,
   payrollAttendanceSource({}));
eq('physical يختار الجهاز وحده', 'device',
   selectPayrollAttendance(users, { attendanceSource: 'physical' },
     [rec('newUid', 'device', [])], [rec('newUid', 'web', [])])[0].source);
eq('mobile يختار الجوال وحده', 'web',
   selectPayrollAttendance(users, { attendanceSource: 'mobile' },
     [rec('newUid', 'device', [])], [rec('newUid', 'web', [])])[0].source);
eq('both يوحّد اليوم ولا يكرره', 1,
   selectPayrollAttendance(users, { attendanceSource: 'both' },
     [rec('newUid', 'device', [{ in: at('08:00'), out: at('16:00') }])],
     [rec('newUid', 'web', [{ in: at('08:05'), out: at('16:05') }])]).length);
eq('both يعمل حين يوجد مصدر واحد فقط', 1,
   selectPayrollAttendance(users, { attendanceSource: 'both' },
     [rec('newUid', 'device', [])], []).length);

const companyA = { attendanceSource: 'mobile' };
const companyB = {};
eq('إعداد مستقل لا يسرّب إلى إعداد آخر', ['mobile', 'physical'],
   [payrollAttendanceSource(companyA), payrollAttendanceSource(companyB)]);
eq('المسير غير المعتمد يستعمل إعداد اليوم', 'mobile',
   payrollConfigForRun(companyA, null).attendanceSource);
eq('المسير المعتمد يستعمل مصدر Snapshot', 'physical',
   payrollConfigForRun(companyA, { config: { attendanceSource: 'physical' } }).attendanceSource);
eq('Snapshot قديم بلا الحقل يرجع للجهاز لا لإعداد اليوم', 'physical',
   payrollConfigForRun(companyA, { config: { hoursPerDay: 8 } }).attendanceSource);

console.log('\n\x1b[1m═══ Overlay التصحيحات بلا سجل خام ═══\x1b[0m');
const adj = (field, value, over = {}) => ({
  employeeUid: 'newUid', employeeName: 'سالم', date: '2026-08-18',
  coll: 'zkAttendance', sessionIdx: 0, field, value, status: 'approved',
  at: { toMillis: () => field === 'in' ? 1 : 2 }, ...over
});

let overlaid = applyAllAttendanceAdjustments([], [
  adj('in', at('08:00')), adj('out', at('16:00'))
], 'zkAttendance');
eq('بلا raw وتصحيح دخول/خروج ينشئ يوماً مشتقاً واحداً', [1, true, '08:00', '16:00'],
   [overlaid.length, overlaid[0].__derivedFromAdjustments,
    overlaid[0].sessions[0].in.toTimeString().slice(0, 5),
    overlaid[0].sessions[0].out.toTimeString().slice(0, 5)]);

overlaid = applyAllAttendanceAdjustments([], [adj('in', at('08:00'))], 'zkAttendance');
eq('بلا raw ودخول فقط يبقى بلا خروج', ['08:00', null, false],
   [overlaid[0].sessions[0].in.toTimeString().slice(0, 5),
    overlaid[0].sessions[0].out, overlaid[0].missedCheckIn]);

overlaid = applyAllAttendanceAdjustments([], [adj('out', at('16:00'))], 'zkAttendance');
eq('بلا raw وخروج فقط يحفظ دليل missingIn', [null, '16:00', true],
   [overlaid[0].sessions[0].in,
    overlaid[0].sessions[0].out.toTimeString().slice(0, 5), overlaid[0].missedCheckIn]);

eq('تصحيح timestamp غير صالح لا ينشئ يوماً', 0,
   applyAllAttendanceAdjustments([], [adj('in', 'not-a-date')], 'zkAttendance').length);
eq('تصحيح مرفوض أو ملغى لا ينشئ يوماً', 0,
   applyAllAttendanceAdjustments([], [
     adj('in', at('08:00'), { status: 'rejected' }),
     adj('out', at('16:00'), { status: 'cancelled' })
   ], 'zkAttendance').length);

const rawDay = rec('newUid', 'device', [{ in: at('08:30'), out: at('16:00') }]);
overlaid = applyAllAttendanceAdjustments([rawDay], [adj('in', at('08:00'))], 'zkAttendance');
eq('raw + adjustment يبقى يوماً واحداً ويطبق مرة واحدة', [1, 1, '08:00'],
   [overlaid.length, overlaid[0].__adjustments.length,
    overlaid[0].sessions[0].in.toTimeString().slice(0, 5)]);

eq('Pipeline المسير يطبق التصحيح ثم يختار physical', '08:00',
   adjustedPayrollAttendance(users, { attendanceSource: 'physical' }, [rawDay], [],
     [adj('in', at('08:00'))])[0].sessions[0].in.toTimeString().slice(0, 5));

console.log('\n\x1b[1m═══ القراءة المطلوبة والـSnapshot ═══\x1b[0m');
const emptyRead = await loadRequiredAttendanceSources({ physical: async () => [] });
eq('قراءة ناجحة بلا بيانات تبقى []', [], emptyRead.physical);
let readFailed = false;
try {
  await loadRequiredAttendanceSources({ physical: async () => { throw new Error('denied'); } });
} catch (_e) { readFailed = true; }
eq('فشل المصدر المطلوب يبقى فشلاً ولا يتحول إلى []', true, readFailed);

const frozenRun = {
  config: { attendanceSource: 'physical' },
  rows: [{ uid: 'newUid', name: 'سالم', salary: 9000, net: 8700, total: 300,
           lateMin: 10, earlyMin: 0, absentDays: 1, missingOut: 0 }]
};
const freshChanged = [{ u: users[0], salary: 9000, net: 9000, total: 0 }];
eq('Snapshot المجمد يتقدم على حساب حديث مختلف', [8700, true],
   (() => { const row = payrollRowsForView(frozenRun, freshChanged, users)[0];
     return [row.net, row.__snapshot]; })());
eq('هوية العرض من Snapshot لا من بروفايل عُدّل لاحقاً', 'سالم',
   payrollRowsForView(frozenRun, freshChanged, [{ ...users[0], name: 'اسم جديد' }])[0].u.name);
eq('بروفايل الموظف يجد صف Snapshot عبر previousUid ولا يعيد الحساب', 8700,
   payrollRowForEmployee({ ...frozenRun, rows: [{ ...frozenRun.rows[0], uid: 'oldUid' }] },
     freshChanged[0], users[0]).net);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
if (fail) process.exit(1);
