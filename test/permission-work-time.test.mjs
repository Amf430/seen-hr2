/* فترات الاستئذان المحتسبة — وحدة نقيّة بلا Firebase. */
import {
  MID_SHIFT_PERMISSION, approvedTimePermissions, permissionInterval,
  permissionWorkTime, permissionIntervalsLabel
} from '../js/lib/permission-work-time.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual), ok = e === a;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (name) => console.log(`\n\x1b[1m═══ ${name} ═══\x1b[0m`);
const at = (date, hm) => new Date(`${date}T${hm}:00`);
const D = '2026-08-03';
const SHIFT = { shiftStart: at(D, '08:00'), shiftEnd: at(D, '16:00') };
const p = (category, startTime, endTime, over = {}) => ({
  id: `${category}-${startTime}`, type: 'permission', status: 'approved', employeeUid: 'u1', date: D,
  category, startTime, endTime, ...over
});
const session = (start, end, date = D, endDate = date) => ({ in: at(date, start), out: end ? at(endDate, end) : null });
const calc = (requests, sessions, firstIn, lastOut, baseSecs, over = {}) => permissionWorkTime({
  requests, employeeUid: 'u1', dateStr: D, sessions, firstIn, lastOut, baseSecs, ...SHIFT, ...over
});
const hours = (n) => Math.round((n / 3600) * 1000) / 1000;

group('اختيار الطلبات المعتمدة');
const early = p('خروج مبكر', '15:00', '16:00');
eq('المعتمد لليوم والموظف فقط', 1, approvedTimePermissions([early], 'u1', D).length);
eq('Pending صفر تأثير', 0, approvedTimePermissions([{ ...early, status:'pending' }], 'u1', D).length);
eq('Rejected صفر تأثير', 0, approvedTimePermissions([{ ...early, status:'rejected' }], 'u1', D).length);
eq('يوم مختلف صفر تأثير', 0, approvedTimePermissions([{ ...early, date:'2026-08-04' }], 'u1', D).length);

group('Late كامل وجزئي');
{
  const ss = [session('09:00', '16:00')];
  const full = calc([p('تأخير عن الدوام','08:00','09:00')], ss, at(D,'09:00'), at(D,'16:00'), 7*3600);
  eq('Late كامل يعيد اليوم إلى ٨ ساعات', { effective:8, credit:1, uncovered:0 },
    { effective:hours(full.effectiveSecs), credit:hours(full.creditedSecs), uncovered:hours(full.lateUncoveredSecs) });
  const partial = calc([p('تأخير عن الدوام','08:00','08:30')], ss, at(D,'09:00'), at(D,'16:00'), 7*3600);
  eq('Late جزئي يعوّض نصف ساعة فقط', { effective:7.5, credit:.5, uncovered:.5 },
    { effective:hours(partial.effectiveSecs), credit:hours(partial.creditedSecs), uncovered:hours(partial.lateUncoveredSecs) });
}

group('Early كامل وجزئي');
{
  const ss = [session('08:00', '15:00')];
  const full = calc([p('خروج مبكر','15:00','16:00')], ss, at(D,'08:00'), at(D,'15:00'), 7*3600);
  eq('Early كامل يعيد اليوم إلى ٨ ساعات', { effective:8, credit:1, uncovered:0, out:'16:00' },
    { effective:hours(full.effectiveSecs), credit:hours(full.creditedSecs), uncovered:hours(full.earlyUncoveredSecs), out:full.effectiveOut.toTimeString().slice(0,5) });
  const partial = calc([p('خروج مبكر','15:30','16:00')], ss, at(D,'08:00'), at(D,'15:00'), 7*3600);
  eq('Early جزئي لا يغطي الفجوة ١٥:٠٠–١٥:٣٠', { effective:7.5, credit:.5, uncovered:.5, out:'15:00' },
    { effective:hours(partial.effectiveSecs), credit:hours(partial.creditedSecs), uncovered:hours(partial.earlyUncoveredSecs), out:partial.effectiveOut.toTimeString().slice(0,5) });
}

group('Mid-shift كامل وجزئي');
const split = [session('08:00','12:00'), session('13:00','16:00')];
{
  const full = calc([p(MID_SHIFT_PERMISSION,'12:00','13:00')], split, at(D,'08:00'), at(D,'16:00'), 8*3600);
  eq('الجلسات المكتملة تصبح الدليل في يوم Mid-shift فقط', true, full.usesCompletedSessions);
  eq('Mid كامل: ٧ فعلية و٨ محتسبة', { actual:7, effective:8, credit:1, uncovered:0 },
    { actual:hours(full.actualSecs), effective:hours(full.effectiveSecs), credit:hours(full.creditedSecs), uncovered:hours(full.midUncoveredSecs) });

  const partial = calc([p(MID_SHIFT_PERMISSION,'12:15','12:45')], split, at(D,'08:00'), at(D,'16:00'), 8*3600);
  eq('Mid جزئي: يبقى نصف ساعة نقص', { actual:7, effective:7.5, credit:.5, uncovered:.5 },
    { actual:hours(partial.actualSecs), effective:hours(partial.effectiveSecs), credit:hours(partial.creditedSecs), uncovered:hours(partial.midUncoveredSecs) });
}

group('الاتحاد والـoverlap');
{
  const overlap = calc([
    p(MID_SHIFT_PERMISSION,'12:00','12:45'),
    p(MID_SHIFT_PERMISSION,'12:30','13:00',{ id:'p2' })
  ], split, at(D,'08:00'), at(D,'16:00'), 8*3600);
  eq('طلبان متداخلان لا يضاعفان التعويض', 1, hours(overlap.creditedSecs));
  eq('الفترات المدمجة تظهر مرة واحدة', '12:00–13:00', permissionIntervalsLabel(overlap.coveredIntervals));

  const overlapsWork = calc([p(MID_SHIFT_PERMISSION,'11:30','12:30')], split,
    at(D,'08:00'), at(D,'16:00'), 8*3600);
  eq('الجزء المتداخل مع عمل فعلي لا يُعوّض ثانية', .5, hours(overlapsWork.creditedSecs));
  eq('والجزء غير المغطى من الفجوة يبقى نقصاً', .5, hours(overlapsWork.midUncoveredSecs));
}

group('النقص خارج فترة Mid يبقى مستقلاً');
{
  const boundary = [session('07:30','08:00'), session('09:00','12:00'), session('13:00','16:00')];
  const r = calc([p(MID_SHIFT_PERMISSION,'12:00','13:00')], boundary,
    at(D,'07:30'), at(D,'16:00'), 8.5*3600);
  eq('بصمة قبل الوردية لا تمحو ساعة Late غير مغطاة',
    { late:1, mid:0, credit:1 },
    { late:hours(r.lateUncoveredSecs), mid:hours(r.midUncoveredSecs), credit:hours(r.creditedSecs) });
}

group('Legacy بلا Migration');
{
  const legacyLate = { ...p('تأخير عن الدوام','08:00','09:00'), time:'09:00' };
  delete legacyLate.startTime; delete legacyLate.endTime;
  const legacyEarly = { ...legacyLate, category:'خروج مبكر', time:'15:00' };
  eq('Late القديم = بداية الوردية إلى time', '08:00–09:00', permissionIntervalsLabel([
    permissionInterval(legacyLate, SHIFT.shiftStart, SHIFT.shiftEnd)]));
  eq('Early القديم = time إلى نهاية الوردية', '15:00–16:00', permissionIntervalsLabel([
    permissionInterval(legacyEarly, SHIFT.shiftStart, SHIFT.shiftEnd)]));
}

group('وردية تتجاوز منتصف الليل');
{
  const night = { shiftStart: at(D,'22:00'), shiftEnd: at('2026-08-04','06:00') };
  const r = calc([p('خروج مبكر','03:30','06:00')],
    [session('22:00','03:30',D,'2026-08-04')], at(D,'22:00'), at('2026-08-04','03:30'), 5.5*3600, night);
  eq('Early الليلي يُربط باليوم التالي', { effective:8, out:'2026-08-04T06:00' }, {
    effective:hours(r.effectiveSecs),
    out:`${r.effectiveOut.getFullYear()}-${String(r.effectiveOut.getMonth()+1).padStart(2,'0')}-${String(r.effectiveOut.getDate()).padStart(2,'0')}T${r.effectiveOut.toTimeString().slice(0,5)}`
  });
}

group('حماية البصمات والوقت الزائد');
{
  const actualOut = at(D,'17:00');
  const afterShift = calc([early], [session('08:00','17:00')], at(D,'08:00'), actualOut, 9*3600);
  eq('الخروج بعد نهاية الوردية لا يُقلّل الوقت ولا يستبدل البصمة',
    { effective:9, credit:0, out:'17:00', same:true },
    { effective:hours(afterShift.effectiveSecs), credit:afterShift.creditedSecs,
      out:afterShift.effectiveOut.toTimeString().slice(0,5), same:afterShift.actualOut === actualOut });

  const missingOut = calc([early], [session('08:00',null)], at(D,'08:00'), null, 0);
  eq('بلا checkout لا تُنشأ بصمة أو نهاية محتسبة',
    { effective:0, credit:0, actualOut:null, effectiveOut:null },
    { effective:missingOut.effectiveSecs, credit:missingOut.creditedSecs,
      actualOut:missingOut.actualOut, effectiveOut:missingOut.effectiveOut });
}

group('البصمات المفتوحة أو الغامضة');
{
  const open = calc([p(MID_SHIFT_PERMISSION,'12:00','13:00')],
    [session('08:00','12:00'), session('13:00',null)], at(D,'08:00'), at(D,'13:00'), 5*3600);
  eq('Open sessions ترجع للـfallback بلا تعويض Mid',
    { fallback:true, sessions:false, credit:0, effective:5 },
    { fallback:open.midFallback, sessions:open.usesCompletedSessions, credit:open.creditedSecs, effective:hours(open.effectiveSecs) });

  const ambiguous = calc([p(MID_SHIFT_PERMISSION,'12:00','13:00')],
    [session('08:00','13:00'), session('12:00','16:00')], at(D,'08:00'), at(D,'16:00'), 8*3600);
  eq('الجلسات المتداخلة غامضة وتبقى على spanSecs',
    { fallback:true, credit:0, effective:8 },
    { fallback:ambiguous.midFallback, credit:ambiguous.creditedSecs, effective:hours(ambiguous.effectiveSecs) });
}

group('Pending / Rejected لا يغيران اليوم العادي');
{
  const reqs = [
    p(MID_SHIFT_PERMISSION,'12:00','13:00',{status:'pending'}),
    p(MID_SHIFT_PERMISSION,'12:00','13:00',{status:'rejected', id:'r2'})
  ];
  const r = calc(reqs, split, at(D,'08:00'), at(D,'16:00'), 8*3600);
  eq('لا يُعاد تعريف spanSecs بلا Mid Approved',
    { approved:0, sessions:false, credit:0, effective:8 },
    { approved:r.approved.length, sessions:r.usesCompletedSessions, credit:r.creditedSecs, effective:hours(r.effectiveSecs) });
}

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
