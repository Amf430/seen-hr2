/* ═══════════════════════════════════════════════════════════════════════════
   تقويم الفريق (المرحلة ٩)

   ⚠️ قرار المالك (٢٠٢٦-٠٨-١٢): الموظف لا يرى إجازات زملائه إطلاقاً. فما
   يُختبر هنا هو الإجازات للمدير، و**الأحداث** التي يراها الجميع — اجتماع
   يضيفه مدير القسم، أو حدث للشركة يضيفه الأدمن.
   ═══════════════════════════════════════════════════════════════════════════ */

import { monthGrid, shiftMonth, leavesOn, dayLayers, conflictOn, conflictsInRange,
         eventsOn, canEditEvent, timelineRows, DEFAULT_CONFLICT_PCT, AR_MONTHS }
  from '../js/lib/calendar.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const LEAVES = [
  { type: 'leave', status: 'approved', employeeUid: 'u1', employeeName: 'سالم',
    department: 'المبيعات', categoryLabel: 'إجازة مرضية', days: 3,
    startDate: '2026-09-16', endDate: '2026-09-18' },
  { type: 'leave', status: 'approved', employeeUid: 'u2', employeeName: 'نورة',
    department: 'المبيعات', categoryLabel: 'إجازة سنوية', days: 5,
    startDate: '2026-09-14', endDate: '2026-09-18' },
  { type: 'leave', status: 'approved', employeeUid: 'u3', employeeName: 'خالد',
    department: 'المبيعات', categoryLabel: 'إجازة وضع', days: 2,
    startDate: '2026-09-18', endDate: '2026-09-19' },
  { type: 'leave', status: 'pending',  employeeUid: 'u4', employeeName: 'ليلى',
    department: 'المبيعات', categoryLabel: 'إجازة سنوية',
    startDate: '2026-09-18', endDate: '2026-09-18' },
  { type: 'leave', status: 'approved', employeeUid: 'u5', employeeName: 'فهد',
    department: 'المالية', categoryLabel: 'إجازة سنوية',
    startDate: '2026-09-18', endDate: '2026-09-18' },
  { type: 'permission', status: 'approved', employeeUid: 'u6', employeeName: 'عمر',
    department: 'المبيعات', date: '2026-09-18' }
];

/* ═══════════ ١. شبكة الشهر ═══════════ */
group('١. شبكة الشهر');

const g = monthGrid(2026, 8);                       /* سبتمبر = فهرس ٨ */
eq('سبتمبر ٣٠ يوماً', 30, g.days.length);
eq('أوله وآخره',  { a: '2026-09-01', z: '2026-09-30' }, { a: g.days[0], z: g.days[29] });
eq('العنوان بالعربية', 'سبتمبر 2026', g.label);
eq('والمفتاح للترتيب',  '2026-09', g.key);
eq('فبراير الكبيسة ٢٩', 29, monthGrid(2028, 1).days.length);
eq('اسم الشهر من الجدول', 'سبتمبر', AR_MONTHS[8]);

eq('التنقّل للشهر التالي',   { year: 2026, month: 9 }, shiftMonth(2026, 8, 1));
eq('وللسابق',               { year: 2026, month: 7 }, shiftMonth(2026, 8, -1));
eq('ويعبر رأس السنة',       { year: 2027, month: 0 }, shiftMonth(2026, 11, 1));
eq('وللخلف كذلك',           { year: 2025, month: 11 }, shiftMonth(2026, 0, -1));

/* ═══════════ ٢. الإجازات في يوم ═══════════ */
group('٢. مَن في إجازة');

eq('ثلاثة في إجازة معتمَدة يوم ١٨', 3, leavesOn(LEAVES, '2026-09-18', 'المبيعات').length);
eq('⚠️ والمعلَّقة لا تُحسب — لم تُعتمد بعد', true,
   !leavesOn(LEAVES, '2026-09-18', 'المبيعات').some((r) => r.employeeUid === 'u4'));
eq('⚠️ والاستئذان ليس إجازة', true,
   !leavesOn(LEAVES, '2026-09-18', 'المبيعات').some((r) => r.employeeUid === 'u6'));
eq('وقسم آخر لا يدخل', true,
   !leavesOn(LEAVES, '2026-09-18', 'المبيعات').some((r) => r.employeeUid === 'u5'));
eq('بلا تحديد قسم تُحسب الشركة كلها', 4, leavesOn(LEAVES, '2026-09-18').length);
eq('يوم خارج كل المدَيات', 0, leavesOn(LEAVES, '2026-09-25', 'المبيعات').length);
eq('واليوم الأخير في المدى محسوب', 1, leavesOn(LEAVES, '2026-09-19', 'المبيعات').length);

/* ═══════════ ٣. الإجازات للمدير وحده ═══════════

   ⚠️ الترشيح هنا ليس ضابطاً أمنياً: الموظف لا يملك قراءة `requests` أصلاً
   (قاعدة sameDept تشترط isMgr)، والشاشة لا تستدعيها له. */
group('٣. الإجازات — للمدير');

const mgrDay = dayLayers('2026-09-18', { requests: LEAVES, dept: 'المبيعات' });
eq('المدير يرى ثلاثة في إجازة', 3, mgrDay.leaves.length);
eq('ومعها النوع', 'إجازة وضع', mgrDay.leaves.find((l) => l.uid === 'u3').type);

/* ⚠️ شاشة الموظف تمرّر requests فارغة لأنها لا تستدعيها له أصلاً */
eq('⚠️ بلا requests → لا إجازات في الطبقات',
   0, dayLayers('2026-09-18', { dept: 'المبيعات' }).leaves.length);

/* ═══════════ ٤. الطبقات الأخرى ═══════════ */
group('٤. العطل والمهام فوق اليوم');

const withEx = dayLayers('2026-09-23', {
  exceptions: [{ date: '2026-09-23', type: 'off', label: 'اليوم الوطني' }]
});
eq('العطلة الرسمية تظهر', 'اليوم الوطني', withEx.exception.label);
eq('واليوم يُعلَّم راحة', true, withEx.isOff);
eq('ودوام خاص ليس راحة', false,
   dayLayers('2026-09-23', { exceptions: [{ date: '2026-09-23', type: 'work' }] }).isOff);

const withTasks = dayLayers('2026-09-18', {
  tasks: [
    { id: 'a', dueDate: '2026-09-18', status: 'in_progress' },
    { id: 'b', dueDate: '2026-09-18', status: 'done' },
    { id: 'c', dueDate: '2026-09-19', status: 'new' }
  ]
});
eq('مهمة واحدة مستحقّة ذلك اليوم', 1, withTasks.dueTasks.length);
eq('⚠️ والمنجزة خارج التقويم — لا فائدة من عرض ما انتهى', 'a', withTasks.dueTasks[0].id);

/* ═══════════ ٥. تحذير التضارب ═══════════

   ⚠️ النسبة لا الرقم المطلق: «٤ غائبين» لا تعني شيئاً في قسم من أربعين. */
group('٥. تضارب الإجازات');

eq('الحدّ الافتراضي ٥٠٪', 50, DEFAULT_CONFLICT_PCT);
eq('٣ من ٦ = ٥٠٪ → تحذير',
   { away: 3, staffCount: 6, ratio: 50 },
   (() => { const c = conflictOn('2026-09-18', LEAVES, 'المبيعات', 6);
            return { away: c.away, staffCount: c.staffCount, ratio: c.ratio }; })());
eq('⚠️ و٣ من ٢٠ = ١٥٪ → لا تحذير', null, conflictOn('2026-09-18', LEAVES, 'المبيعات', 20));
eq('والحدّ قابل للتشديد', true, !!conflictOn('2026-09-18', LEAVES, 'المبيعات', 20, 10));
eq('قسم بلا موظفين لا يُقسَم على صفر', null, conflictOn('2026-09-18', LEAVES, 'المبيعات', 0));

eq('يوم واحد متضارب في المدى', 1,
   conflictsInRange(['2026-09-17', '2026-09-18', '2026-09-19'], LEAVES, 'المبيعات', 6).length);

/* ═══════════ ٦. الأحداث ═══════════

   ⚠️ نطاق الحدث حقلٌ واحد: قسم، أو فارغ = الشركة كلها. حقلان يسمحان بحالة
   متناقضة والقاعدة تصير أطول لتمنعها. */
group('٦. أحداث التقويم');

const EVENTS = [
  { id: 'e1', title: 'اجتماع المبيعات الأسبوعي', date: '2026-09-18', department: 'المبيعات' },
  { id: 'e2', title: 'اجتماع الشركة العام',       date: '2026-09-18', department: '' },
  { id: 'e3', title: 'اجتماع المالية',            date: '2026-09-18', department: 'المالية' },
  { id: 'e4', title: 'يوم آخر',                   date: '2026-09-20', department: '' }
];

eq('موظف المبيعات يرى حدثه وحدث الشركة', ['e1', 'e2'],
   eventsOn(EVENTS, '2026-09-18', 'المبيعات').map((e) => e.id));
eq('⚠️ ولا يرى حدث قسم آخر', true,
   !eventsOn(EVENTS, '2026-09-18', 'المبيعات').some((e) => e.id === 'e3'));
eq('وموظف المالية يرى حدثه وحدث الشركة', ['e2', 'e3'],
   eventsOn(EVENTS, '2026-09-18', 'المالية').map((e) => e.id));
eq('ومن بلا قسم يرى أحداث الشركة فقط', ['e2'],
   eventsOn(EVENTS, '2026-09-18', '').map((e) => e.id));
eq('ويوم آخر لا يخلط', ['e4'], eventsOn(EVENTS, '2026-09-20', 'المبيعات').map((e) => e.id));

/* الأحداث تدخل طبقات اليوم */
eq('الحدث يظهر في طبقات اليوم', 2,
   dayLayers('2026-09-18', { events: EVENTS, dept: 'المبيعات' }).events.length);

group('٦-ب. مَن يعدّل حدثاً');
const adminU = { role: 'admin' };
const mgrSales = { role: 'manager', department: 'المبيعات' };
const mgrFin   = { role: 'manager', department: 'المالية' };
const empU     = { role: 'employee', department: 'المبيعات' };

eq('الأدمن يعدّل أي حدث',            true,  canEditEvent(EVENTS[0], adminU));
eq('وحتى حدث الشركة',                true,  canEditEvent(EVENTS[1], adminU));
eq('مدير القسم يعدّل حدث قسمه',      true,  canEditEvent(EVENTS[0], mgrSales));
eq('⚠️ ولا يعدّل حدث الشركة',         false, canEditEvent(EVENTS[1], mgrSales));
eq('⚠️ ولا حدث قسم آخر',              false, canEditEvent(EVENTS[2], mgrSales));
eq('ومدير المالية عكسه',             true,  canEditEvent(EVENTS[2], mgrFin));
eq('⚠️ والموظف لا يعدّل شيئاً',        false, canEditEvent(EVENTS[0], empU));
eq('ومدير بلا قسم لا يعدّل',          false, canEditEvent(EVENTS[0], { role: 'manager', department: '' }));

group('١٥. الخطّ الزمني — صفّ لكل موظف');

const TL = [
  { type: 'leave', status: 'approved', employeeUid: 'u1', employeeName: 'سالم',
    startDate: '2026-04-18', endDate: '2026-04-24', categoryLabel: 'سنوية' },
  { type: 'leave', status: 'pending', employeeUid: 'u2', employeeName: 'نورة',
    startDate: '2026-04-28', endDate: '2026-05-03', categoryLabel: 'سنوية' },
  { type: 'leave', status: 'rejected', employeeUid: 'u3', employeeName: 'خالد',
    startDate: '2026-04-10', endDate: '2026-04-12' },
  { type: 'permission', status: 'approved', employeeUid: 'u4', employeeName: 'ريم',
    date: '2026-04-05', categoryLabel: 'تأخير' },
  { type: 'leave', status: 'approved', employeeUid: 'u5', employeeName: 'فهد',
    startDate: '2026-03-28', endDate: '2026-04-02' },
  { type: 'leave', status: 'approved', employeeUid: 'u6', employeeName: 'عمر',
    startDate: '2026-06-01', endDate: '2026-06-05' }
];
const tl = timelineRows(TL, 2026, 3, [{ id: 'u1', jobTitle: 'مندوب مبيعات' }]);

eq('صفّ لكل موظف له إجازة في الشهر', ['ريم', 'سالم', 'فهد', 'نورة'], tl.map((r) => r.name));
eq('مرتّبة بالاسم', true, tl.map((r) => r.name).join() === [...tl.map((r) => r.name)].sort((a, b) => a.localeCompare(b)).join());
eq('⚠️ المرفوض لا يُرسم — الشريط يقول «غائب» والمرفوض حاضر', false,
   tl.some((r) => r.name === 'خالد'));
eq('وإجازة شهر آخر لا تدخل', false, tl.some((r) => r.name === 'عمر'));

const salem = tl.find((r) => r.name === 'سالم');
eq('يبدأ يوم ١٨', 18, salem.bars[0].start);
eq('ويمتدّ ٧ أيام — الطرفان محسوبان', 7, salem.bars[0].span);
eq('والمسمّى يأتي من قائمة الموظفين', 'مندوب مبيعات', salem.jobTitle);

const fahd = tl.find((r) => r.name === 'فهد');
eq('⚠️ ما بدأ الشهر الماضي يُقصّ لليوم الأول', 1, fahd.bars[0].start);
eq('ويُعلَّم مقصوص البداية', true, fahd.bars[0].clippedStart);
eq('ومدّته داخل الشهر يومان', 2, fahd.bars[0].span);

const noura = tl.find((r) => r.name === 'نورة');
eq('⚠️ ما يمتدّ للشهر التالي يُقصّ لآخر يوم', 3, noura.bars[0].span);
eq('ويُعلَّم مقصوص النهاية', true, noura.bars[0].clippedEnd);
eq('والمعلّق يبقى معلّقاً — يُرسم متقطّعاً', 'pending', noura.bars[0].status);

const reem = tl.find((r) => r.name === 'ريم');
eq('الاستئذان يوم واحد', 1, reem.bars[0].span);
eq('ويأخذ تاريخه من date لا startDate', 5, reem.bars[0].start);

eq('شهر بلا إجازات يُرجع فارغاً', [], timelineRows(TL, 2026, 0, []));
eq('قائمة فارغة لا تنهار', [], timelineRows([], 2026, 3, []));
eq('null لا ينهار', [], timelineRows(null, 2026, 3, null));
eq('طلب بلا تواريخ يُتجاهل', [],
   timelineRows([{ type: 'leave', status: 'approved', employeeName: 'أ' }], 2026, 3, []));
/* فبراير ٢٠٢٤ كبيسة — ٢٩ يوماً */
eq('⚠️ آخر يوم في شهر كبيس يُقصّ على ٢٩ لا ٢٨', 29,
   timelineRows([{ type: 'leave', status: 'approved', employeeName: 'أ',
     startDate: '2024-02-27', endDate: '2024-03-05' }], 2024, 1, [])[0].bars[0].span + 26);

const multi = timelineRows([
  { type: 'leave', status: 'approved', employeeUid: 'u1', employeeName: 'سالم',
    startDate: '2026-04-20', endDate: '2026-04-21' },
  { type: 'leave', status: 'approved', employeeUid: 'u1', employeeName: 'سالم',
    startDate: '2026-04-05', endDate: '2026-04-06' }
], 2026, 3, []);
eq('إجازتان لموظف واحد في صفّ واحد', 1, multi.length);
eq('ومرتّبتان بالتاريخ', [5, 20], multi[0].bars.map((b) => b.start));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
