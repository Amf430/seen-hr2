/* ═══════════════════════════════════════════════════════════════════════════
   تقويم الفريق (المرحلة ٩)

   ⚠️ أهم ما يُختبر هنا ليس الشبكة بل **الخصوصية**: أن نوع الإجازة لا يخرج
   لزميل أبداً. نوعها معلومة صحّية أحياناً (مرضية · وضع · وفاة)، وتسريبها
   لا يُتراجع عنه.
   ═══════════════════════════════════════════════════════════════════════════ */

import { monthGrid, shiftMonth, leavesOn, dayLayers, conflictOn, conflictsInRange,
         peersAwayInRange, buildAwayDoc, DEFAULT_CONFLICT_PCT, AR_MONTHS }
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

/* ═══════════ ٣. الخصوصية — أهم اختبار في الملف ═══════════

   ⚠️ نوع الإجازة معلومة صحّية أحياناً. تسريبها لزميل لا يُتراجع عنه. */
group('٣. الخصوصية — ما يراه الزميل');

const peer = dayLayers('2026-09-18', { requests: LEAVES, dept: 'المبيعات' });
const full = dayLayers('2026-09-18', { requests: LEAVES, dept: 'المبيعات', view: 'full' });

eq('الزميل يرى ثلاثة أسماء', 3, peer.leaves.length);
eq('⚠️⚠️ ولا يرى نوع الإجازة إطلاقاً', true,
   peer.leaves.every((l) => l.type === undefined));
eq('⚠️ ولا عدد الأيام — المدى يقول شيئاً عن النوع', true,
   peer.leaves.every((l) => l.days === undefined));
eq('⚠️ ولا «إجازة وضع» تظهر في أي حقل', true,
   !JSON.stringify(peer).includes('وضع'));
eq('⚠️ ولا «مرضية»', true, !JSON.stringify(peer).includes('مرضية'));
eq('الاسم وحده يخرج له', ['سالم', 'نورة', 'خالد'], peer.leaves.map((l) => l.name));

eq('والمدير يرى النوع — يملك القراءة أصلاً', 'إجازة وضع',
   full.leaves.find((l) => l.uid === 'u3').type);
/* ⚠️ الافتراضي هو الأقل كشفاً: من ينسى تمرير view يحصل على رؤية الزميل */
eq('⚠️ الافتراضي بلا وسيط = رؤية الزميل لا المدير', true,
   dayLayers('2026-09-18', { requests: LEAVES, dept: 'المبيعات' })
     .leaves.every((l) => l.type === undefined));

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

/* ═══════════ ٦. تنبيه ما قبل تقديم الطلب ═══════════ */
group('٦. «٣ من زملائك في إجازة»');

const away = { '2026-09-17': [{ uid: 'u1', name: 'سالم' }],
               '2026-09-18': [{ uid: 'u1', name: 'سالم' }, { uid: 'u2', name: 'نورة' }],
               '2026-09-25': [{ uid: 'u9', name: 'بعيد' }] };

eq('زميلان في المدى بلا تكرار', ['سالم', 'نورة'],
   peersAwayInRange(away, '2026-09-16', '2026-09-20'));
eq('⚠️ ومقدّم الطلب لا يُحسب على نفسه', ['نورة'],
   peersAwayInRange(away, '2026-09-16', '2026-09-20', 'u1'));
eq('وخارج المدى لا يدخل', true,
   !peersAwayInRange(away, '2026-09-16', '2026-09-20').includes('بعيد'));
eq('مدى خالٍ → لا أحد', [], peersAwayInRange(away, '2026-10-01', '2026-10-05'));

/* ═══════════ ٧. الوثيقة المنشورة ═══════════

   ⚠️ ما يُنشر للزميل: اليوم والاسم فقط. لا نوع ولا سبب ولا مدى — حتى المدى
   يقول شيئاً عن النوع. */
group('٧. ما يُنشَر للزملاء');

const doc = buildAwayDoc(['2026-09-17', '2026-09-18', '2026-09-25'], LEAVES, 'المبيعات', 6);
eq('يومان فيهما غياب فقط', ['2026-09-17', '2026-09-18'], Object.keys(doc.days));
eq('وعدد موظفي القسم محفوظ للنسبة', 6, doc.staffCount);
eq('⚠️⚠️ لا نوع إجازة في الوثيقة المنشورة', true, !JSON.stringify(doc).includes('إجازة'));
eq('⚠️ ولا عدد أيام', true, !JSON.stringify(doc).includes('"days":3'));
eq('الاسم والمعرّف فقط', ['uid', 'name'], Object.keys(doc.days['2026-09-18'][0]));
eq('والمعلَّقة لا تُنشر', true,
   !JSON.stringify(doc).includes('ليلى'));
eq('واليوم بلا غياب لا يُكتب أصلاً', true, !('2026-09-25' in doc.days));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
