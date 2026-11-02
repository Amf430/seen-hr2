/* ═══════════════════════════════════════════════════════════════════════════
   كشف حضور الموظف — شبكة الشهر والملخّص

   هذه الأرقام يقرأها الموظف عن نفسه، ويُخصم من راتبه على ما تقوله. نسبة
   التزام محسوبة بمقام خاطئ تتّهمه بما لم يفعل.
   ═══════════════════════════════════════════════════════════════════════════ */

import { cycleGridOf, monthSummary, minToHm, recentActivity } from '../js/lib/timesheet.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const ok = (name, cond) => eq(name, true, !!cond);
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const at = (h, m) => new Date(2026, 7, 3, h, m).getTime();
const ROWS = [
  { dateStr: '2026-08-03', cls: 'present', status: 'حاضر', firstIn: at(8, 0),  lastOut: at(16, 5) },
  { dateStr: '2026-08-04', cls: 'late',    status: 'متأخر', firstIn: at(9, 20), lastOut: at(16, 0) },
  { dateStr: '2026-08-05', cls: 'absent',  status: 'غائب' },
  { dateStr: '2026-08-06', cls: 'leave',   status: 'إجازة: سنوية' },
  { dateStr: '2026-08-07', cls: 'missing', status: 'نسيان بصمة الخروج', firstIn: at(8, 10) }
]
/* ⚠️ صفّ من الشهر الأول للدورة — كان يسقط من الشبكة كلّه. منفصل عن ROWS
   حتى لا يزيح أرقام الملخّص التي تُقاس عليها بقيّة الاختبارات. */
const ROWS_X = ROWS.concat([
  { dateStr: '2026-07-28', cls: 'present', status: 'حاضر', firstIn: at(8, 2), lastOut: at(16, 0) }
]);;

group('١. شبكة الدورة');

/* ⚠️ الدورة ٢٦ ← ٢٥ تعبر شهرين. كانت الشبكة تُرسم على الشهر التقويمي بينما
   العنوان والبطاقات على الدورة — فتسقط أيام ٢٦←٣١ من الشهر الأول من الشبكة
   وهي محسوبة في «أيام حضرتها»، وتظهر مكانها أيام ليست من الدورة أصلاً. */
const g = cycleGridOf(ROWS_X, '2026-07-26', '2026-08-25', '2026-08-04');
eq('⚠️ الشبكة من ٢٦ يوليو إلى ٢٥ أغسطس = ٣١ خانة', 31, g.cells.length);
eq('⚠️ وأولها ٢٦ يوليو لا ١ أغسطس', '2026-07-26', g.cells[0].date);
eq('⚠️ وآخرها ٢٥ أغسطس لا ٣١ أغسطس', '2026-08-25', g.cells[30].date);
eq('والإزاحة يوم بداية الدورة', new Date(2026, 6, 26).getDay(), g.lead);
eq('اليوم ينتقل من شهر إلى شهر', 6, g.cells[0].month);
eq('ثم إلى أغسطس', 7, g.cells[6].month);

const byDate = (d) => g.cells.find((c) => c.date === d);
eq('الثالث من أغسطس حاضر', 'present', byDate('2026-08-03').cls);
eq('والرابع متأخر', 'late', byDate('2026-08-04').cls);
eq('ويُعلَّم أنه اليوم', true, byDate('2026-08-04').isToday);
eq('ووقت دخوله محفوظ', true, byDate('2026-08-04').inAt === at(9, 20));
/* ⚠️ صفّ داخل الشهر الأول من الدورة — وهو ما كان يسقط كلّه */
eq('⚠️ صفّ ٢٨ يوليو يصل الشبكة', 'present', byDate('2026-07-28').cls);

/* ⚠️ الغياب حكمٌ يُخصم عليه — وغياب السجل ليس غياباً */
eq('⚠️ يوم بلا صفّ يبقى بلا حالة لا «غائب»', '', byDate('2026-08-10').cls);
eq('ويحمل تاريخه على أي حال', '2026-08-10', byDate('2026-08-10').date);

/* ⚠️ ثلاث حالات كانت كلها بيضاء: راحة · لم يأتِ بعد · بلا سجلّ */
eq('اليوم بعد اليوم الحالي مستقبل', true, byDate('2026-08-20').isFuture);
eq('واليوم الحالي ليس مستقبلاً', false, byDate('2026-08-04').isFuture);
eq('وما مضى ليس مستقبلاً', false, byDate('2026-07-28').isFuture);

const gOff = cycleGridOf(ROWS_X, '2026-07-26', '2026-08-25', '2026-08-04',
  (d, dow) => dow === 5 || dow === 6);
const cOff = gOff.cells.find((c) => c.date === '2026-08-01');   /* سبت */
eq('⚠️ يوم الراحة يُوسم راحةً لا فراغاً', 'off', cOff.cls);
eq('ونصّه «راحة»', 'راحة', cOff.status);
eq('و isOff مرفوعة', true, cOff.isOff);
/* ⚠️ الصفّ يتقدّم على المُحدِّد: من عمل في يوم راحته لا يُمحى عمله */
eq('⚠️ صفّ موجود يغلب حكم الراحة', 'missing',
   gOff.cells.find((c) => c.date === '2026-08-07').cls);   /* جمعة وله صفّ */
eq('بلا مُحدِّد لا راحة إطلاقاً', '', g.cells.find((c) => c.date === '2026-08-01').cls);

eq('دورة فبراير الكبيسة ٣١ خانة', 31,
   cycleGridOf([], '2024-01-26', '2024-02-25').cells.length);
eq('صفوف فارغة لا تنهار', 31, cycleGridOf([], '2026-07-26', '2026-08-25').cells.length);
eq('null لا ينهار', 31, cycleGridOf(null, '2026-07-26', '2026-08-25').cells.length);
eq('صفّ بلا تاريخ يُتجاهل', '',
   cycleGridOf([{ cls: 'present' }], '2026-07-26', '2026-08-25').cells[0].cls);
eq('بلا تاريخ اليوم لا يُعلَّم شيء', 0,
   cycleGridOf(ROWS_X, '2026-07-26', '2026-08-25').cells.filter((c) => c.isToday).length);
eq('ولا يُعلَّم مستقبل', 0,
   cycleGridOf(ROWS_X, '2026-07-26', '2026-08-25').cells.filter((c) => c.isFuture).length);

group('٢. ملخّص الشهر');

const s = monthSummary(ROWS);
eq('حاضر في الوقت', 1, s.present);
eq('متأخر', 1, s.late);
eq('غائب', 1, s.absent);
eq('نسيان بصمة', 1, s.missing);
eq('إجازة', 1, s.leave);
/* ⚠️ الإجازة خارج المقام: من كان في إجازة لا يُحاسب على أيامها */
eq('⚠️ أيام العمل ٤ — الإجازة مطروحة من المقام', 4, s.workDays);
eq('ومن لديه دليل حضور فعلي ٣', 3, s.attended);
eq('نسبة الحضور ٣ من ٤ = ٧٥٪', 75, s.attendanceRate);
eq('نسبة الالتزام يوم واحد من ٤ = ٢٥٪', 25, s.commitmentRate);

const noWork = monthSummary([{ dateStr: '2026-08-01', cls: 'leave' }]);
eq('⚠️ شهر كله إجازة لا يُقسم على صفر', null, noWork.commitmentRate);
eq('صفوف فارغة', null, monthSummary([]).commitmentRate);
eq('null لا ينهار', 0, monthSummary(null).workDays);
eq('صفّ بلا cls يُتجاهل', 0, monthSummary([{ dateStr: '2026-08-01' }]).workDays);

/* المتوسّط: 08:00 و09:20 و08:10 = 480 و560 و490 → 510 = 08:30 */
eq('متوسّط الدخول بالدقائق', 510, s.avgInMin);
eq('ويُعرض 08:30', '08:30', minToHm(s.avgInMin));
eq('ومن لا دخول له لا متوسّط', null, monthSummary([{ dateStr: 'x', cls: 'absent' }]).avgInMin);

group('٣. تنسيق الوقت');

eq('منتصف الليل', '00:00', minToHm(0));
eq('صباحاً', '08:54', minToHm(534));
eq('مساءً', '16:05', minToHm(965));
eq('⚠️ null يعطي شرطة لا NaN', '—', minToHm(null));
eq('و undefined كذلك', '—', minToHm(undefined));
eq('والنصّ كذلك', '—', minToHm('لا'));

group('٤. آخر النشاط');

const r = recentActivity(ROWS);
eq('الأحدث أولاً', '2026-08-07', r[0].dateStr);
eq('والأقدم آخراً', '2026-08-03', r[r.length - 1].dateStr);
eq('خمسة صفوف لها حالة', 5, r.length);
eq('⚠️ يوم بلا حالة لا يُعدّ نشاطاً', 5,
   recentActivity([...ROWS, { dateStr: '2026-08-08', cls: '' }]).length);
eq('والحدّ يُحترم', 2, recentActivity(ROWS, 2).length);
eq('فارغ لا ينهار', [], recentActivity([]));
eq('null لا ينهار', [], recentActivity(null));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
