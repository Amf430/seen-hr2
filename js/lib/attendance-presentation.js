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
  /* الخروج الرسمي يلتزم effectiveOut الذي أقرّه المحرك؛ لا نحوله إلى نهاية
     فترة جزئية وبينها وبين البصمة فجوة غير مغطاة. */
  if (actualOut && effectiveOut && effectiveOut > actualOut) officialOut = effectiveOut;
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
  const hasMinuteFields = Number.isFinite(Number(input.punctualityLateMin)) ||
    Number.isFinite(Number(input.punctualityEarlyMin));
  const uncoveredMin = hasMinuteFields
    ? Math.max(0, Math.round(Number(input.punctualityLateMin) || 0)) +
      Math.max(0, Math.round(Number(input.punctualityEarlyMin) || 0))
    : Math.max(0, Math.round(((Number(input.lateUncoveredSecs) || 0) +
      (Number(input.earlyUncoveredSecs) || 0) +
      (Number(input.midUncoveredSecs) || 0)) / 60));
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
    uncoveredMin,
    note: permissions.length
      ? [...evidence, permissionNote].filter(Boolean).join(' — ')
      : baseNote
  };
}
