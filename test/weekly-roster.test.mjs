import { setSettings } from '../js/lib/state.js';
import { resolveShift, shiftHours } from '../js/lib/shifts.js';
import {
  ROSTER_REST, clearApprovedRosterEntries, isRosterManager, managedRosterDepartment,
  nextWeekStart, resolveRosterDay, rosterDepartmentById, rosterIdOf,
  setApprovedRosterEntries, snapshotRosterDays,
  weekEndOf, weekStartOf
} from '../js/lib/weekly-roster.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual), ok = e === a;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}`
    + (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const throws = (name, fn) => {
  try { fn(); fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}`); }
  catch { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
};

const WEEK = Object.fromEntries([0, 1, 2, 3, 4].map((d) =>
  [d, { type: 'morning', start: '09:00', end: '18:00' }]));
WEEK[5] = { type: 'off', start: '', end: '' };
WEEK[6] = { type: 'off', start: '', end: '' };
const evening = {
  id: 'plan_pm', name: 'مسائي', active: true,
  days: Object.fromEntries([0, 1, 2, 3, 4, 5].map((d) =>
    [d, { type: 'evening', start: '14:00', end: '23:00' }]))
};
const morning = {
  id: 'plan_am', name: 'صباحي', active: true,
  days: Object.fromEntries([0, 1, 2, 3, 4, 5].map((d) =>
    [d, { type: 'morning', start: '09:00', end: '18:00' }]))
};
const settings = {
  shifts: WEEK, shiftPlans: [morning, evening], defaultShiftPlanId: '',
  departments: [
    { id: 'sales', name: 'المبيعات', managerUid: 'mgr' },
    { id: 'finance', name: 'المالية', managerUid: 'finMgr' }
  ], dateExceptions: []
};
const emp = { id: 'e1', name: 'أحمد', department: 'المبيعات' };
const financeEmp = { id: 'f1', name: 'سارة', department: 'المالية' };

console.log('\n\x1b[1m═══ أسبوع الـRoster والـfallback ═══\x1b[0m');
setSettings(settings); clearApprovedRosterEntries();
eq('بداية الأسبوع الأحد', '2026-08-30', weekStartOf('2026-09-02'));
eq('نهاية الأسبوع بعد ستة أيام', '2026-09-05', weekEndOf('2026-08-30'));
eq('الأسبوع التالي محسوب من تاريخ ثابت', '2026-09-06', nextWeekStart(new Date('2026-09-02T12:00:00')));
eq('هوية الـRoster تجمع القسم والأسبوع', 'sales_2026-08-30', rosterIdOf('sales', '2026-08-30'));
eq('لا Roster يحفظ الشفت الأساسي بالحرف', ['morning', '09:00', '18:00', 'company'],
  (() => { const s = resolveShift('2026-09-02', 3, emp.department, emp); return [s.type, s.start, s.end, s.src]; })());

console.log('\n\x1b[1m═══ اللقطات المعتمدة ═══\x1b[0m');
const rawDays = { 0: 'plan_pm', 1: 'plan_pm', 2: ROSTER_REST, 5: 'plan_am' };
const approvedDays = snapshotRosterDays(rawDays, [morning, evening]);
setApprovedRosterEntries([{ departmentId: 'sales', department: 'المبيعات',
  weekStart: '2026-08-30', employeeUid: 'e1', approvedDays }]);
eq('Approved Evening يتغلب على الشفت الأساسي', ['evening', '14:00', '23:00', 'weeklyRoster'],
  (() => { const s = resolveShift('2026-08-30', 0, emp.department, emp); return [s.type, s.start, s.end, s.src]; })());
eq('نفس الموظف مسائي أكثر من يوم', '14:00', resolveShift('2026-08-31', 1, emp.department, emp).start);
eq('الراحة البديلة تعيد يوم off رسمي', ['off', 'weeklyRoster'],
  (() => { const s = resolveShift('2026-09-01', 2, emp.department, emp); return [s.type, s.src]; })());
eq('Friday work يتغلب على الراحة العامة', ['morning', '09:00', '18:00'],
  (() => { const s = resolveShift('2026-09-04', 5, emp.department, emp); return [s.type, s.start, s.end]; })());
eq('اليوم بلا Assignment يرجع إلى default', ['morning', 'company'],
  (() => { const s = resolveShift('2026-09-03', 4, emp.department, emp); return [s.type, s.src]; })());
eq('موظف آخر لا يتأثر', 'company', resolveShift('2026-08-30', 0, 'المبيعات', { id: 'e2' }).src);
eq('أسبوع آخر لا يتأثر', 'company', resolveShift('2026-09-06', 0, emp.department, emp).src);
setApprovedRosterEntries([
  { departmentId: 'sales', department: 'المبيعات', weekStart: '2026-08-30', employeeUid: 'e1', approvedDays },
  { departmentId: 'finance', department: 'المالية', weekStart: '2026-08-30', employeeUid: 'f1',
    approvedDays: snapshotRosterDays({ 0: 'plan_am' }, [morning, evening]) }
]);
eq('قسم ثانٍ يقرأ Roster مستقلًا في الأسبوع نفسه', ['morning', 'weeklyRoster'],
  (() => { const s = resolveShift('2026-08-30', 0, financeEmp.department, financeEmp); return [s.type, s.src]; })());
eq('قسم بلا Roster يبقى على Default Shift', 'company',
  resolveShift('2026-08-30', 0, 'الدعم', { id: 's1', department: 'الدعم' }).src);
setApprovedRosterEntries([{ departmentId: 'sales', department: 'المبيعات',
  weekStart: '2026-08-30', employeeUid: 'e1', approvedDays }]);
eq('اللقطة التاريخية الوحيدة تبقى بعد نقل الموظف لقسم آخر', 'weeklyRoster',
  resolveShift('2026-08-30', 0, 'الدعم', { ...emp, department: 'الدعم' }).src);
setApprovedRosterEntries([
  { departmentId: 'sales', department: 'المبيعات', weekStart: '2026-08-30', employeeUid: 'e1', approvedDays },
  { departmentId: 'finance', department: 'المالية', weekStart: '2026-08-30', employeeUid: 'e1',
    approvedDays: snapshotRosterDays({ 0: 'plan_am' }, [morning, evening]) }
]);
eq('جدولان بلا تطابق قسم حاسم يفشلان مغلقاً إلى Default', 'company',
  resolveShift('2026-08-30', 0, 'الدعم', { ...emp, department: 'الدعم' }).src);
eq('تطابق القسم يحسم الجدولين للـRoster الصحيح', 'evening',
  resolveShift('2026-08-30', 0, emp.department, emp).type);

console.log('\n\x1b[1m═══ التاريخ وFail closed ═══\x1b[0m');
settings.shiftPlans[1].days[0] = { type: 'morning', start: '10:00', end: '19:00' };
eq('تغيير Template لاحقاً لا يغير Snapshot الماضي', ['evening', '14:00', '23:00'],
  (() => { const s = resolveShift('2026-08-30', 0, emp.department, emp); return [s.type, s.start, s.end]; })());
setApprovedRosterEntries([{ departmentId: 'sales', department: 'المبيعات',
  weekStart: '2026-08-30', employeeUid: 'e1', approvedDays: {
  0: { kind: 'shift', shiftPlanId: 'ghost', planName: 'مفقود', type: 'evening', start: '', end: '23:00' }
} }]);
eq('Snapshot ناقصة تفشل إلى fallback بلا تخمين', 'company', resolveShift('2026-08-30', 0, emp.department, emp).src);
setApprovedRosterEntries([{ departmentId: 'sales', department: 'المبيعات',
  weekStart: '2026-08-30', employeeUid: 'e1', days: rawDays }]);
eq('Draft/Submitted/Returned بلا approvedDays لا تؤثر', 'company', resolveShift('2026-08-30', 0, emp.department, emp).src);
throws('Shift ID غير موجود يمنع إنشاء Snapshot', () => snapshotRosterDays({ 0: 'ghost' }, [morning, evening]));

console.log('\n\x1b[1m═══ الورديات الليلية والمسؤول ═══\x1b[0m');
const night = { id: 'night', name: 'ليلي', active: true,
  days: { 0: { type: 'evening', start: '22:00', end: '06:00' } } };
const snapNight = snapshotRosterDays({ 0: 'night' }, [night]);
setApprovedRosterEntries([{ departmentId: 'sales', department: 'المبيعات',
  weekStart: '2026-08-30', employeeUid: 'e1', approvedDays: snapNight }]);
eq('Snapshot ليلية تعبر منتصف الليل', 8, shiftHours(resolveShift('2026-08-30', 0, emp.department, emp)));
const salesMgr = { id: 'mgr', role: 'manager', department: 'المبيعات' };
const finMgr = { id: 'finMgr', role: 'manager', department: 'المالية' };
eq('مدير المبيعات المحدد مخول لقسمه', true, isRosterManager(salesMgr, settings, 'sales'));
eq('مدير القسم الثاني مخول لقسمه', true, isRosterManager(finMgr, settings, 'finance'));
eq('Manager لا يستطيع إدارة قسم آخر', false, isRosterManager(salesMgr, settings, 'finance'));
eq('مدير غير محدد لا يرث الصلاحية', false,
  isRosterManager({ id: 'other', role: 'manager', department: 'المبيعات' }, settings, 'sales'));
eq('قسم بلا managerUid لا يمنح أي Manager صلاحية تلقائياً', false,
  isRosterManager({ id: 'supportMgr', role: 'manager', department: 'الدعم' }, {
    departments: [{ id: 'support', name: 'الدعم' }]
  }, 'support'));
const reordered = { ...settings, departments: [settings.departments[1], settings.departments[0]] };
eq('إعادة الترتيب تبقي departmentId مصدراً للهوية', 'mgr',
  rosterDepartmentById(reordered, 'sales').managerUid);
eq('إعادة الترتيب لا تمنح مدير المبيعات القسم الآخر', false,
  isRosterManager(salesMgr, reordered, 'finance'));
eq('اكتشاف قسم المدير يعيد index الحالي بعد الترتيب', 1,
  managedRosterDepartment(salesMgr, reordered).departmentIndex);

clearApprovedRosterEntries();
console.log(`\n${pass} ناجح، ${fail} فاشل`);
if (fail) process.exit(1);
