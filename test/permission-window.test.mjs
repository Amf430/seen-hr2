/* ═══════════════════════════════════════════════════════════════════════════
   النوافذ الزمنية للطلبات — الاستئذان (٣ أيام) وتصحيح البصمة (٧ أيام).

   القاعدة تُنفَّذ في ثلاثة مواضع: النموذج (min على حقل التاريخ)، و
   submitRequest، و firestore.rules. هذا الملف يختبر المنطق المشترك خلف
   الأول والثاني، والحدّ نفسه مُختبَر على القاعدة في rules.test.mjs.

   ⚠️ كانت الدوال **مُعاد كتابتها هنا** لأن requests.js يستورد firebase.js
   التي تجلب SDK من gstatic وقت الاستيراد. وكان تعليق هذا الملف يدّعي أن
   تغييرها في المصدر يُسقط الاختبار — وهذا لم يكن صحيحاً: النسختان
   مستقلّتان، فتغيير الحدّ في المصدر يمرّ بينما يحرس الاختبار رقماً مهجوراً.

   الآن الدوال في js/lib/request-windows.js النقيّة، ويستوردها هذا الملف
   و requests.js معاً — فالحدّ واحد فعلاً لا اثنان متشابهان.
   ═══════════════════════════════════════════════════════════════════════════ */

import { PERM_BACKDATE_DAYS, permOldestDate, permWindowOpen,
         FIX_WINDOW_DAYS, FIX_MAX_PER_CYCLE, fixOldestDate, fixWindowOpen,
         fixCountInCycle, fixableAttendanceRows,
         fixCycleOf } from '../js/lib/request-windows.js';

let pass = 0, fail = 0;
const check = (name, expected, actual) => {
  const ok = expected === actual;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `  → توقّعنا ${expected} وجاء ${actual}`));
};

console.log('\n\x1b[1m═══ النافذة من الداخل ═══\x1b[0m');
const T = '2026-08-04';
check('اليوم نفسه',                    true,  permWindowOpen('2026-08-04', T));
check('أمس',                           true,  permWindowOpen('2026-08-03', T));
check('قبل يومين',                     true,  permWindowOpen('2026-08-02', T));
check('قبل ثلاثة أيام — آخر يوم مقبول', true,  permWindowOpen('2026-08-01', T));

console.log('\n\x1b[1m═══ النافذة من الخارج ═══\x1b[0m');
check('قبل أربعة أيام — أول يوم مرفوض', false, permWindowOpen('2026-07-31', T));
check('قبل خمسة أيام',                 false, permWindowOpen('2026-07-30', T));
check('الشهر الماضي',                  false, permWindowOpen('2026-07-04', T));

console.log('\n\x1b[1m═══ المستقبل مفتوح — الاستئذان يُقدَّم مقدَّماً ═══\x1b[0m');
check('غداً',                          true,  permWindowOpen('2026-08-05', T));
check('الأسبوع القادم',                true,  permWindowOpen('2026-08-11', T));

console.log('\n\x1b[1m═══ عبور حدود الشهر والسنة ═══\x1b[0m');
check('أول الشهر يصل آخر الذي قبله',   '2026-07-29', permOldestDate('2026-08-01'));
check('أول مارس بعد فبراير قصير',      '2026-02-26', permOldestDate('2026-03-01'));
check('أول يناير يعبر السنة',          '2025-12-29', permOldestDate('2026-01-01'));
check('استئذان عن ٣١ ديسمبر يوم ٢ يناير', true, permWindowOpen('2025-12-31', '2026-01-02'));

console.log('\n\x1b[1m═══ مدخلات فارغة ═══\x1b[0m');
check('تاريخ فارغ مرفوض',              false, permWindowOpen('', T));
check('undefined مرفوض',               false, permWindowOpen(undefined, T));
check('null مرفوض',                    false, permWindowOpen(null, T));


/* ═══════════ نافذة تصحيح البصمة (المرحلة ١٠) ═══════════

   ⚠️ نفس منطق نافذة الاستئذان لكن بسبعة أيام لا ثلاثة، والفرق مقصود:
   الاستئذان يمحو تأخيراً، والتصحيح يضيف بصمة ناقصة — والثاني يُكتشف متأخراً
   عادةً (الموظف لا يعرف أنه نسي حتى يرى «نسيان بصمة» في أدائه).

   ⚠️ والعدد مكرَّر في firestore.rules (fixOk). الجدار هناك، وهذا يعطي
   الرسالة المفهومة قبل الاصطدام به. */
console.log('\n\x1b[1m═══ نافذة تصحيح البصمة ═══\x1b[0m');

check('الحدّ المعلن سبعة أيام', 7, FIX_WINDOW_DAYS);
check('والسقف الشهري ثلاثة',    3, FIX_MAX_PER_CYCLE);
check('أقدم تاريخ مقبول', '2026-08-05', fixOldestDate('2026-08-12'));

check('اليوم مقبول',              true,  fixWindowOpen('2026-08-12', '2026-08-12'));
check('قبل ستة أيام مقبول',        true,  fixWindowOpen('2026-08-06', '2026-08-12'));
check('حدّ النافذة بالضبط مقبول',  true,  fixWindowOpen('2026-08-05', '2026-08-12'));
check('قبله بيوم مرفوض',          false, fixWindowOpen('2026-08-04', '2026-08-12'));
/* ⚠️ المستقبل مرفوض: تصحيح ليوم لم يأتِ بعد ليس تصحيحاً */
check('⚠️ تاريخ في المستقبل مرفوض', false, fixWindowOpen('2026-08-13', '2026-08-12'));
check('تاريخ فارغ مرفوض',          false, fixWindowOpen('', '2026-08-12'));

console.log('\n\x1b[1m═══ مسار تصحيح البصمة في صفحة الأداء ═══\x1b[0m');
const correctionRows = [
  { cls: 'missing',   dateStr: '2026-08-12' },
  { cls: 'missingIn', dateStr: '2026-08-11' },
  { cls: 'absent',    dateStr: '2026-08-10' },
  { cls: 'present',   dateStr: '2026-08-12' },
  { cls: 'late',      dateStr: '2026-08-12' },
  { cls: 'leave',     dateStr: '2026-08-12' },
  { cls: 'missing',   dateStr: '2026-08-04' }
];
const correctionKinds = fixableAttendanceRows(correctionRows, '2026-08-12').map((r) => r.cls);
check('missingOut يظهر له مسار التصحيح', true, correctionKinds.includes('missing'));
check('missingIn يظهر له مسار التصحيح',  true, correctionKinds.includes('missingIn'));
check('الغياب القابل للتصحيح يظهر له المسار', true, correctionKinds.includes('absent'));
check('الحالات السليمة لا يظهر لها المسار', false,
  correctionKinds.some((cls) => ['present', 'late', 'leave'].includes(cls)));
check('اليوم الناقص خارج النافذة لا يظهر له المسار', 3, correctionKinds.length);

console.log('\n\x1b[1m═══ دورة سجل التصحيح عند حدّ 25 ← 26 ═══\x1b[0m');
const previousCycle = fixCycleOf('2026-08-25');
const currentCycle = fixCycleOf('2026-08-26');
check('سجل يوم 25 يتبع الدورة السابقة', '2026-07', previousCycle?.key);
check('يوم 26 يفتح دورة جديدة', '2026-08', currentCycle?.key);
check('تصحيح سجل 25 لا يستخدم دورة يوم 26', false, previousCycle?.key === currentCycle?.key);
check('تاريخ سجل فاسد لا يسقط إلى دورة اليوم', null, fixCycleOf('2026-02-30'));

/* ═══ عدّاد الدورة ═══
   ⚠️ المرفوض لا يُحسب: طلب رُفض لم يستهلك شيئاً، وحسابه يعاقب الموظف مرتين. */
console.log('\n\x1b[1m═══ عدّاد طلبات التصحيح في الدورة ═══\x1b[0m');

const cyc = { start: new Date('2026-07-26T00:00:00'), end: new Date('2026-08-25T23:59:59') };
const reqs = [
  { type: 'attendanceFix', employeeUid: 'u1', status: 'pending',  date: '2026-08-01' },
  { type: 'attendanceFix', employeeUid: 'u1', status: 'approved', date: '2026-08-05' },
  { type: 'attendanceFix', employeeUid: 'u1', status: 'rejected', date: '2026-08-07' },
  { type: 'attendanceFix', employeeUid: 'u2', status: 'approved', date: '2026-08-03' },
  { type: 'leave',         employeeUid: 'u1', status: 'approved', date: '2026-08-02' },
  { type: 'attendanceFix', employeeUid: 'u1', status: 'approved', date: '2026-07-01' }
];
const restored = { id: 'u-new', previousUids: ['u1', 'u-old-2'] };
check('المعلّق والمعتمَد يُحسبان', 2, fixCountInCycle(reqs, 'u1', cyc));
check('⚠️ والمرفوض لا يُحسب — لم يستهلك شيئاً',
   2, fixCountInCycle(reqs.filter((r) => r.status !== 'rejected'), 'u1', cyc));
check('وطلبات موظف آخر لا تُحسب عليه', 1, fixCountInCycle(reqs, 'u2', cyc));
check('وخارج الدورة لا يُحسب',         2, fixCountInCycle(reqs, 'u1', cyc));
check('موظف بلا طلبات → صفر',          0, fixCountInCycle(reqs, 'u9', cyc));
check('العدّاد يجمع UID الحالي والتاريخي', 2, fixCountInCycle(reqs, restored, cyc));


/* ═══ النداء بوسيط واحد — الانحدار الذي كشفته اختبارات المتصفح ═══

   ⚠️ ثلاثة مواضع تنادي هذه الدوال بوسيط واحد وتعتمد على المعامل الافتراضي
   `today = ymdKsa()`. إسقاطه مرةً جعل المقارنة `dateStr >= undefined` ترجع
   false دائماً — فرُفض **كل** طلب استئذان، ووُسم كل يوم تأخير «بدون عذر».
   ولم يلتقطه eslint ولا اختبارات node لأنها كانت تمرّر الوسيطين دائماً. */
console.log('\n\x1b[1m═══ النداء بوسيط واحد ═══\x1b[0m');

const todayKsa = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
check('⚠️ اليوم مقبول بلا تمرير today',        true,  permWindowOpen(todayKsa));
check('⚠️ وتاريخ قديم مرفوض بلا تمرير today',  false, permWindowOpen('2020-01-01'));
check('permOldestDate بلا وسيط تُرجع تاريخاً', true,  /^\d{4}-\d{2}-\d{2}$/.test(permOldestDate()));
check('⚠️ fixWindowOpen اليوم مقبول بلا وسيط',  true,  fixWindowOpen(todayKsa));
check('fixOldestDate بلا وسيط تُرجع تاريخاً',   true,  /^\d{4}-\d{2}-\d{2}$/.test(fixOldestDate()));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
