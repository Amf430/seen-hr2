/* ═══════════════════════════════════════════════════════════════════════════
   كشف حضور الموظف — شبكة الشهر والملخّص

   هذه الأرقام يقرأها الموظف عن نفسه، ويُخصم من راتبه على ما تقوله. نسبة
   التزام محسوبة بمقام خاطئ تتّهمه بما لم يفعل.
   ═══════════════════════════════════════════════════════════════════════════ */

import { monthGridOf, monthSummary, minToHm, recentActivity } from '../js/lib/timesheet.js';

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
];

group('١. شبكة الشهر');

const g = monthGridOf(ROWS, 2026, 7, '2026-08-04');
eq('أغسطس ٣١ يوماً', 31, g.cells.length);
eq('والأول يقع يوم الأحد → بلا إزاحة', new Date(2026, 7, 1).getDay(), g.lead);
eq('اليوم الثالث حاضر', 'present', g.cells[2].cls);
eq('والرابع متأخر', 'late', g.cells[3].cls);
eq('ويُعلَّم أنه اليوم', true, g.cells[3].isToday);
eq('ووقت دخوله محفوظ', true, g.cells[3].inAt === at(9, 20));

/* ⚠️ الغياب حكمٌ يُخصم عليه — وغياب السجل ليس غياباً */
eq('⚠️ يوم بلا صفّ يبقى بلا حالة لا «غائب»', '', g.cells[9].cls);
eq('ويحمل تاريخه على أي حال', '2026-08-10', g.cells[9].date);

eq('شهر كبيس ٢٩ يوماً', 29, monthGridOf([], 2024, 1).cells.length);
eq('صفوف فارغة لا تنهار', 31, monthGridOf([], 2026, 7).cells.length);
eq('null لا ينهار', 31, monthGridOf(null, 2026, 7).cells.length);
eq('صفّ بلا تاريخ يُتجاهل', '', monthGridOf([{ cls: 'present' }], 2026, 7).cells[0].cls);
eq('بلا تاريخ اليوم لا يُعلَّم شيء', 0,
   monthGridOf(ROWS, 2026, 7).cells.filter((c) => c.isToday).length);

group('٢. ملخّص الشهر');

const s = monthSummary(ROWS);
eq('حاضر في الوقت', 1, s.present);
eq('متأخر', 1, s.late);
eq('غائب', 1, s.absent);
eq('نسيان بصمة', 1, s.missing);
eq('إجازة', 1, s.leave);
/* ⚠️ الإجازة خارج المقام: من كان في إجازة لا يُحاسب على أيامها */
eq('⚠️ أيام العمل ٤ — الإجازة مطروحة من المقام', 4, s.workDays);
eq('ومن حضر فعلاً ٢', 2, s.attended);
eq('نسبة الالتزام ١ من ٤ = ٢٥٪', 25, s.onTimePct);

const noWork = monthSummary([{ dateStr: '2026-08-01', cls: 'leave' }]);
eq('⚠️ شهر كله إجازة لا يُقسم على صفر', null, noWork.onTimePct);
eq('صفوف فارغة', null, monthSummary([]).onTimePct);
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
