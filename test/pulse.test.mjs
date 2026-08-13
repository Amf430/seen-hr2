/* ═══════════════════════════════════════════════════════════════════════════
   نبض اللوحة — السلسلة اليومية وذكرى الالتحاق

   هذه أول ما يراه المالك عند فتح النظام. خطّ اتجاه مبنيّ على عدّ خاطئ يقول
   «الحضور يرتفع» بينما هو يهبط، وتهنئة بذكرى خاطئة تصل موظفاً في اليوم الغلط.
   ═══════════════════════════════════════════════════════════════════════════ */

import { dailySeries, anniversariesToday } from '../js/lib/pulse.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const win = { start: new Date('2026-08-10T00:00:00'), end: new Date('2026-08-13T23:59:59') };

group('١. السلسلة اليومية');

eq('يوم لكل يوم في النافذة — ٤ أيام', 4, dailySeries([], win).length);
eq('والأيام الفارغة بصفر لا تُحذف',
   [0, 0, 0, 0], dailySeries([], win).map((d) => d.count));

const recs = [
  { date: '2026-08-10', employeeUid: 'u1' },
  { date: '2026-08-10', employeeUid: 'u2' },
  { date: '2026-08-12', employeeUid: 'u1' }
];
eq('العدّ اليومي صحيح', [2, 0, 1, 0], dailySeries(recs, win).map((d) => d.count));

/* ⚠️ للموظف مصدرا حضور مستقلّان — الجوال وجهاز البصمة */
const dup = [
  { date: '2026-08-10', employeeUid: 'u1' },
  { date: '2026-08-10', employeeUid: 'u1' },
  { date: '2026-08-10', employeeUid: 'u2' }
];
eq('⚠️ من بصم بالجوال والجهاز يُعدّ مرّة — العدّ بالموظفين لا بالسجلات',
   [2, 0, 0, 0], dailySeries(dup, win).map((d) => d.count));

eq('سجلّ بلا تاريخ يُتجاهل ولا ينهار',
   [0, 0, 0, 0], dailySeries([{ employeeUid: 'u1' }, null], win).map((d) => d.count));
eq('سجلّ بلا معرّف موظف لا يُعدّ',
   [0, 0, 0, 0], dailySeries([{ date: '2026-08-10' }], win).map((d) => d.count));
eq('سجلّ خارج النافذة لا يدخل',
   [0, 0, 0, 0], dailySeries([{ date: '2026-01-01', employeeUid: 'u1' }], win).map((d) => d.count));
eq('التواريخ بالترتيب', ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'],
   dailySeries([], win).map((d) => d.date));
eq('نافذة يوم واحد تُرجع يوماً', 1,
   dailySeries([], { start: new Date('2026-08-13T00:00:00'), end: new Date('2026-08-13T23:59:59') }).length);
eq('records غير مصفوفة لا تنهار', 4, dailySeries(null, win).length);

group('٢. ذكرى الالتحاق');

const USERS = [
  { name: 'ريم',  hireDate: '2019-08-13', status: 'active' },
  { name: 'سالم', hireDate: '2024-08-13', status: 'active' },
  { name: 'فهد',  hireDate: '2026-08-13', status: 'active' },   /* اليوم نفسه */
  { name: 'نورة', hireDate: '2020-08-13', status: 'suspended' },
  { name: 'خالد', hireDate: '2020-08-12', status: 'active' }    /* أمس */
];

eq('من تطابق ذكراهم اليوم', ['ريم', 'سالم'],
   anniversariesToday(USERS, '2026-08-13').map((x) => x.user.name));
eq('والأقدم أولاً', [7, 2], anniversariesToday(USERS, '2026-08-13').map((x) => x.years));
eq('⚠️ من التحق اليوم نفسه لا ذكرى له — صفر سنوات', false,
   anniversariesToday(USERS, '2026-08-13').some((x) => x.user.name === 'فهد'));
eq('⚠️ والموقوف لا يُهنَّأ', false,
   anniversariesToday(USERS, '2026-08-13').some((x) => x.user.name === 'نورة'));
eq('ومن ذكراه أمس لا يظهر اليوم', false,
   anniversariesToday(USERS, '2026-08-13').some((x) => x.user.name === 'خالد'));

/* ⚠️ 2019-08-13 كـ Date يُفسَّر UTC فيصير 12 أغسطس بتوقيت سالب — والمقارنة
   هنا نصّية فلا تنزلق. */
eq('⚠️ المقارنة نصّية لا بكائن Date — لا انزلاق يوم',
   ['ريم'], anniversariesToday([USERS[0]], '2026-08-13').map((x) => x.user.name));
eq('يوم لا ذكرى فيه', [], anniversariesToday(USERS, '2026-03-03'));

eq('موظف بلا hireDate يُتجاهل', [],
   anniversariesToday([{ name: 'أ', status: 'active' }], '2026-08-13'));
eq('و hireDate ناقص يُتجاهل', [],
   anniversariesToday([{ name: 'أ', hireDate: '2019-08', status: 'active' }], '2026-08-13'));
eq('تاريخ اليوم الفارغ يُرجع فارغاً', [], anniversariesToday(USERS, ''));
eq('users غير مصفوفة لا تنهار', [], anniversariesToday(null, '2026-08-13'));
eq('عنصر null في القائمة لا ينهار', [], anniversariesToday([null], '2026-08-13'));
eq('التاسع والعشرون من فبراير يطابق نفسه',
   ['أ'], anniversariesToday([{ name: 'أ', hireDate: '2020-02-29', status: 'active' }], '2024-02-29')
     .map((x) => x.user.name));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
