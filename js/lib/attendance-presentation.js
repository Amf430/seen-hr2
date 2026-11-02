/* ╭─── عرض أثر الاستئذان على الحضور ───╮
   هذه الوحدة لا تحسب الدوام: تستهلك فقط الفترات المعتمدة التي
   حسمها permissionWorkTime. ولذلك تبقى البصمات الفعلية مرجع التدقيق،
   ويتغيّر فقط ما يراه القارئ في الجدول والتقرير. */

import { hm, tsToDate } from './format.js';
import { PERMISSION_KIND, permissionKindOf } from './permission-link.js';
import { permissionIntervalsLabel } from './permission-work-time.js';

const KIND_LABEL = Object.freeze({
  [PERMISSION_KIND.LATE]: 'تأخير',
  [PERMISSION_KIND.EARLY]: 'خروج مبكر',
  [PERMISSION_KIND.MID]: 'أثناء الدوام'
});

const validDate = (v) => {
  const d = tsToDate(v);
  return d && Number.isFinite(d.getTime()) ? d : null;
};

const validIntervals = (rows) => (Array.isArray(rows) ? rows : [])
  .map((x) => ({ start: validDate(x?.start), end: validDate(x?.end) }))
  .filter((x) => x.start && x.end && x.end > x.start);

const HM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const hasNumber = (v) => v !== '' && v != null && Number.isFinite(Number(v));
const roundedMinutes = (v) => Math.max(0, Math.round(Number(v) || 0));
const secondsMinutes = (v) => roundedMinutes((Number(v) || 0) / 60);

/* نثبت أن Early نفسه — لا مجرد فترة Mid مجاورة — يصل إلى نهاية الوردية.
   نطابق عقد الطلب مع الفترة التي طبّعها المحرك بالفعل، لذلك الطلب غير
   القابل للإسناد للوردية لا يستطيع تغيير العرض. */
const earlyReachesShiftEnd = (permissions, intervals, shiftStart, shiftEnd) => {
  if (!shiftStart || !shiftEnd || shiftEnd <= shiftStart) return false;
  const terminal = intervals.filter((x) => x.end.getTime() === shiftEnd.getTime());
  if (!terminal.length) return false;
  const shiftEndHm = hm(shiftEnd);
  return permissions.some((permission) => {
    if (permissionKindOf(permission) !== PERMISSION_KIND.EARLY) return false;
    const startHm = permission?.startTime || permission?.time;
    const endHm = permission?.endTime || shiftEndHm; /* Legacy Early → shiftEnd */
    if (!HM_RE.test(String(startHm || '')) || endHm !== shiftEndHm) return false;
    const [hour, minute] = startHm.split(':').map(Number);
    const start = new Date(shiftEnd);
    start.setHours(hour, minute, 0, 0);
    if (start >= shiftEnd) start.setDate(start.getDate() - 1);
    if (start < shiftStart || start >= shiftEnd) return false;
    return terminal.some((x) => x.start <= start);
  });
};

const explicitPeriods = (permissions) => [...new Set((permissions || [])
  .filter((r) => r?.startTime && r?.endTime)
  .map((r) => `${r.startTime}–${r.endTime}`))].join('، ');

/* الجدول يعرض HH:MM، والمؤشرات نفسها تقرّب النقص إلى دقيقة. فجوة أقل من
   نصف دقيقة لا ينبغي أن تبقي الحدّ الرسمي على بصمة تبدو للمستخدم مغطاة؛
   هذا قرار عرض فقط ولا يغيّر ثانية واحدة في الساعات المحتسبة. */
const roundsToZeroMinutes = (milliseconds) =>
  Math.round(Math.max(0, Number(milliseconds) || 0) / 60000) === 0;

/* الوقت الرسمي هو حدّ اتحاد البصمات مع الفترات التي اعتمدها
   المحرك فعلاً. لا ننشئ حداً مفقوداً: بلا بصمة دخول أو خروج نعرض
   الفراغ، حتى لو وجد طلب معتمد. */
export function attendancePresentation(input = {}) {
  const actualIn = validDate(input.firstIn ?? input.actualIn);
  const actualOut = validDate(input.lastOut ?? input.actualOut);
  const intervals = validIntervals(input.permissionIntervals ?? input.coveredIntervals);
  const permissions = Array.isArray(input.permissions)
    ? input.permissions : (Array.isArray(input.approved) ? input.approved : []);
  const kinds = [...new Set(permissions.map(permissionKindOf).filter(Boolean))];
  const shiftStart = validDate(input.shiftStart);
  const shiftEnd = validDate(input.shiftEnd);

  let officialIn = actualIn;
  let officialOut = actualOut;
  if (actualIn && intervals.length) {
    /* لا نقدّم وقت الدخول لمجرد وجود تغطية جزئية منفصلة عنه. يتغيّر الحد
       المعروض فقط حين تصل الفترة المعتمدة إلى البصمة الفعلية؛ أما الفجوة
       غير المغطاة فتبقي وقت الدخول الفعلي ظاهراً. */
    const connected = intervals.filter((x) => x.start < actualIn && x.end >= actualIn);
    const minuteConnected = kinds.includes(PERMISSION_KIND.LATE)
      ? intervals.filter((x) => x.start < actualIn && x.end < actualIn &&
        roundsToZeroMinutes(actualIn - x.end))
      : [];
    connected.push(...minuteConnected);
    if (connected.length)
      officialIn = new Date(Math.min(actualIn.getTime(), ...connected.map((x) => x.start.getTime())));
  }
  const effectiveOut = validDate(input.effectiveOut);
  /* effectiveOut يبقى مرجع الساعات. العرض وحده يصل إلى shiftEnd عندما يثبت
     أن Early Approved نفسه يغطي النهاية؛ الفجوة قبله تبقى رقماً مستقلاً. */
  if (actualOut && effectiveOut && effectiveOut > actualOut) officialOut = effectiveOut;
  if (actualOut && shiftEnd > actualOut &&
      earlyReachesShiftEnd(permissions, intervals, shiftStart, shiftEnd)) officialOut = shiftEnd;
  else if (actualOut && kinds.includes(PERMISSION_KIND.EARLY)) {
    const minuteConnected = intervals.filter((x) => x.end > actualOut &&
      roundsToZeroMinutes(x.start - actualOut));
    if (minuteConnected.length)
      officialOut = new Date(Math.max(actualOut.getTime(), ...minuteConnected.map((x) => x.end.getTime())));
  }

  const periods = permissionIntervalsLabel(intervals) || explicitPeriods(permissions);
  const type = kinds.map((k) => KIND_LABEL[k]).filter(Boolean).join(' · ');
  const inChanged = !!(actualIn && officialIn && officialIn < actualIn);
  const outChanged = !!(actualOut && officialOut && officialOut > actualOut);
  const evidence = [
    inChanged ? `دخول فعلي ${hm(actualIn)}` : '',
    outChanged ? `خروج فعلي ${hm(actualOut)}` : ''
  ].filter(Boolean);

  const permissionNote = permissions.length
    ? `استئذان معتمد${periods ? ` ${periods}` : ''}` : '';
  const deductibleLateMinutes = hasNumber(input.lateMin) ? roundedMinutes(input.lateMin)
    : hasNumber(input.punctualityLateMin) ? roundedMinutes(input.punctualityLateMin)
    : secondsMinutes(input.lateUncoveredSecs);
  const uncoveredEarlyMinutes = hasNumber(input.uncoveredEarlyMinutes)
    ? roundedMinutes(input.uncoveredEarlyMinutes)
    : hasNumber(input.earlyUncoveredSecs) ? secondsMinutes(input.earlyUncoveredSecs)
    : roundedMinutes(input.punctualityEarlyMin);
  const uncoveredMidMinutes = hasNumber(input.uncoveredMidMinutes)
    ? roundedMinutes(input.uncoveredMidMinutes) : secondsMinutes(input.midUncoveredSecs);
  /* يبقى للتوافق مع أي مستهلك قديم، لكن الواجهات لا تعرض هذا الجمع بعد الآن. */
  const uncoveredMin = deductibleLateMinutes + uncoveredEarlyMinutes + uncoveredMidMinutes;
  const baseNote = String(input.note || '')
    .replace(/\s*·\s*يمكن تقديم استئذان عنه/g, '')
    .replace(/\s*·\s*بدون عذر/g, '');

  return {
    actualIn,
    actualOut,
    officialIn,
    officialOut,
    approved: permissions,
    hasApproved: permissions.length > 0,
    permissionType: type,
    permissionNote,
    deductibleLateMinutes,
    uncoveredEarlyMinutes,
    uncoveredMidMinutes,
    uncoveredMin,
    note: permissions.length
      ? [...evidence, permissionNote].filter(Boolean).join(' — ')
      : baseNote
  };
}
