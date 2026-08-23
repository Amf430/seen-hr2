import { attendanceDistribution, attendanceMetrics,
         dayBounds } from '../js/lib/attendance-metrics.js';
import { attendanceDerivedSourcesReady,
         attendanceExportAvailable } from '../js/lib/attendance-export-state.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      توقّعنا ${e}\n      وجاء   ${a}`); }
};
const at = (hm) => new Date(`2026-08-18T${hm}:00`);
const row = (cls, over = {}) => ({ cls, ...over });
const present = (over = {}) => row('present', {
  firstIn: at('08:00'), lastOut: at('16:00'), hasAttendanceEvidence: true,
  punctualityLateMin: 0, punctualityEarlyMin: 0, ...over
});

console.log('\n\x1b[1m═══ دليل الحضور وحالة missingIn ═══\x1b[0m');

let b = dayBounds([{ in: null, out: at('16:00') }], { missedCheckIn: true });
eq('خروج معلّم بلا دخول يصل إلى missingIn', [null, '16:00', true],
   [b.firstIn, b.lastOut.toTimeString().slice(0, 5), b.hasAttendanceEvidence]);

b = dayBounds([{ in: null, out: at('16:00') }]);
eq('خروج بلا الوسم لا يُفترض تلقائياً missingIn', ['16:00', null],
   [b.firstIn.toTimeString().slice(0, 5), b.lastOut]);

b = dayBounds([{ in: null, out: null }], { missedCheckIn: true });
eq('Record معلّم لكن بلا timestamp ليس دليل حضور', [null, null, false],
   [b.firstIn, b.lastOut, b.hasAttendanceEvidence]);

b = dayBounds([{ in: at('08:10'), out: at('16:00') }], { missedCheckIn: true });
eq('إضافة دخول مصحح تعيد اليوم للمسار الطبيعي', ['08:10', '16:00', true],
   [b.firstIn.toTimeString().slice(0, 5), b.lastOut.toTimeString().slice(0, 5), b.hasAttendanceEvidence]);

b = dayBounds([
  { in: at('09:50'), out: at('10:47') }, { in: at('18:00'), out: null }
]);
eq('سلوك بصمات الجهاز غير المنتظمة محفوظ', ['09:50', '18:00'],
   [b.firstIn.toTimeString().slice(0, 5), b.lastOut.toTimeString().slice(0, 5)]);

console.log('\n\x1b[1m═══ توزيع حالات الدورة ═══\x1b[0m');

const distributionRows = [
  present(),
  row('late', { hasAttendanceEvidence: true }),
  row('absent'),
  row('leave'),
  row('missing', { hasAttendanceEvidence: true }),
  row('missingIn', { hasAttendanceEvidence: true })
];
const distribution = attendanceDistribution(distributionRows);
eq('missingIn يُحتسب داخل التوزيع', 1, distribution.counts.missingIn);
eq('مجموع أعداد التوزيع لا يفقد يوم missingIn',
   distribution.total, distribution.counted);
eq('إضافة missingIn للتوزيع لا تغيّر حساب الحضور والالتزام', [80, 20],
   (() => { const x = attendanceMetrics(distributionRows);
     return [x.attendanceRate, x.commitmentRate]; })());

console.log('\n\x1b[1m═══ Attendance Rate وCommitment Rate ═══\x1b[0m');

eq('موظف ملتزم بالكامل',
   { eligibleDays: 5, attendanceDays: 5, committedDays: 5, excludedDays: 0,
     attendanceRate: 100, commitmentRate: 100 },
   attendanceMetrics(Array.from({ length: 5 }, () => present())));

eq('الحاضر المتأخر يومياً: حضور 100 والتزام 0', [100, 0],
   (() => { const x = attendanceMetrics(Array.from({ length: 5 }, () =>
     row('late', { firstIn: at('08:30'), lastOut: at('17:00'), hasAttendanceEvidence: true,
       punctualityLateMin: 30, punctualityEarlyMin: 0 })));
     return [x.attendanceRate, x.commitmentRate]; })());

eq('البقاء بعد الدوام لا يمحو التأخير من الالتزام', [100, 0],
   (() => { const x = attendanceMetrics([present({
     cls: 'present', lateMin: 0, compMin: 60, punctualityLateMin: 60,
     firstIn: at('09:00'), lastOut: at('17:00')
   })]); return [x.attendanceRate, x.commitmentRate]; })());

eq('تأخير غطاه الاستئذان بالكامل ينجح', [100, 100],
   (() => { const x = attendanceMetrics([present({ firstIn: at('08:30'), punctualityLateMin: 0 })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('استئذان يغطي جزءاً فقط يبقي اليوم غير منضبط', [100, 0],
   (() => { const x = attendanceMetrics([row('late', {
     firstIn: at('08:45'), lastOut: at('16:00'), hasAttendanceEvidence: true,
     punctualityLateMin: 15, punctualityEarlyMin: 0
   })]); return [x.attendanceRate, x.commitmentRate]; })());

eq('الخروج المبكر غير المغطى يفشل الالتزام', [100, 0],
   (() => { const x = attendanceMetrics([present({ lastOut: at('15:30'), punctualityEarlyMin: 30 })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('الخروج المبكر المغطى بالكامل ينجح', [100, 100],
   (() => { const x = attendanceMetrics([present({ lastOut: at('15:30'), punctualityEarlyMin: 0 })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('missingIn دليل حضور لكنه غير منضبط', [100, 0],
   (() => { const x = attendanceMetrics([row('missingIn', {
     firstIn: null, lastOut: at('16:00'), hasAttendanceEvidence: true
   })]); return [x.attendanceRate, x.commitmentRate]; })());

eq('missingOut دليل حضور لكنه غير منضبط', [100, 0],
   (() => { const x = attendanceMetrics([row('missing', {
     firstIn: at('08:00'), lastOut: null, hasAttendanceEvidence: true
   })]); return [x.attendanceRate, x.commitmentRate]; })());

eq('missingOut المصحح يعاد تصنيفه كحضور منضبط', [100, 100],
   (() => { const x = attendanceMetrics([present({ firstIn: at('08:00'), lastOut: at('16:00') })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('missingIn المصحح يعاد تصنيفه كحضور منضبط', [100, 100],
   (() => { const x = attendanceMetrics([present({ firstIn: at('08:00'), lastOut: at('16:00') })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('سجل ناقص بلا دليل لا يرفع Attendance Rate', [0, 0],
   (() => { const x = attendanceMetrics([row('missingIn', { hasAttendanceEvidence: false })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('الغياب يدخل المقام ولا البسط', [0, 0],
   (() => { const x = attendanceMetrics([row('absent', { hasAttendanceEvidence: false })]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('الإجازة المعتمدة خارج البسط والمقام',
   { eligibleDays: 1, attendanceDays: 1, committedDays: 1, excludedDays: 1,
     attendanceRate: 100, commitmentRate: 100 },
   attendanceMetrics([present(), row('leave')]));

eq('يوم رسمي معفى بالكامل خارج المقام', [1, 1],
   (() => { const x = attendanceMetrics([present(), row('officialExcuse', { fullDayExcused: true })]);
     return [x.eligibleDays, x.excludedDays]; })());

eq('لا أيام محتسبة يعيد null لا نسبة مضللة', [null, null],
   (() => { const x = attendanceMetrics([row('leave')]);
     return [x.attendanceRate, x.commitmentRate]; })());

eq('التقريب موحد لأقرب عدد صحيح', [67, 33],
   (() => { const x = attendanceMetrics([
     present(),
     row('late', { firstIn: at('08:30'), lastOut: at('16:00'), hasAttendanceEvidence: true,
       punctualityLateMin: 30 }),
     row('absent', { hasAttendanceEvidence: false })
   ]); return [x.attendanceRate, x.commitmentRate]; })());

console.log('\n\x1b[1m═══ اكتمال مصدر تصدير الحضور ═══\x1b[0m');
eq('التقرير اليومي المكتمل قابل للتصدير', true,
   attendanceExportAvailable({ mode: 'daily', requestsReady: true, adjustmentsReady: true }));
eq('فشل الطلبات يمنع تصدير تقرير يومي ناقص', false,
   attendanceExportAvailable({ mode: 'daily', requestsReady: false, adjustmentsReady: true }));
eq('فشل التصحيحات يمنع تصدير تقرير يومي بأوقات خام', false,
   attendanceExportAvailable({ mode: 'daily', requestsReady: true, adjustmentsReady: false }));
eq('سجل الجلسات الخام لا يعتمد على الطلبات أو التصحيحات', true,
   attendanceExportAvailable({ mode: 'sessions', requestsReady: false, adjustmentsReady: false }));
eq('لا تُثبّت الدورة في الكاش إذا كان مصدر مشتق ناقصاً', false,
   attendanceDerivedSourcesReady({ requestsReady: true, adjustmentsReady: false }));
eq('تُثبّت الدورة في الكاش بعد اكتمال المصدرين فقط', true,
   attendanceDerivedSourcesReady({ requestsReady: true, adjustmentsReady: true }));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
if (fail) process.exit(1);
