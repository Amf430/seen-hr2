/* ═══════════════════════════════════════════════════════════════════════════
   أثر فترات الاستئذان المعتمدة على ساعات الدوام.

   ⚠️ البصمات الأصلية لا تتغيّر. هذه الوحدة تشتق اتحاد فترات العمل المثبتة
   وفترات الاستئذان داخل الوردية، وتعيد الساعات المحتسبة منفصلة عن الفعلية.

   ⚠️ فجوات الجلسات لا تُعاد محاسبتها لكل النظام. لا نستعمل مجموع الجلسات
   إلا في يوم يحمل استئذان «أثناء الدوام» معتمداً، وكانت كل جلساته مكتملة
   وغير متداخلة. غير ذلك يبقى spanSecs القديم، بلا نقص ولا تعويض تخميني.
   ═══════════════════════════════════════════════════════════════════════════ */

import { PERMISSION_KIND, permissionKindOf, requestBelongsToEmployee } from './permission-link.js';

export const MID_SHIFT_PERMISSION = 'استئذان أثناء الدوام';

const HM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const validDate = (v) => v instanceof Date && Number.isFinite(v.getTime());
const asDate = (v) => {
  if (validDate(v)) return v;
  if (v && typeof v.toDate === 'function') {
    const d = v.toDate();
    return validDate(d) ? d : null;
  }
  return null;
};
const secsOf = (list) => list.reduce((n, x) => n + Math.max(0, (x.end - x.start) / 1000), 0);
const midnightOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const atHm = (day, hm, offset = 0) => {
  if (!HM_RE.test(String(hm || ''))) return null;
  const [h, m] = hm.split(':').map(Number);
  const d = midnightOf(day); d.setDate(d.getDate() + offset); d.setHours(h, m, 0, 0);
  return d;
};
const hmMinutes = (hm) => {
  if (!HM_RE.test(String(hm || ''))) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

export function mergeIntervals(intervals) {
  const rows = (intervals || [])
    .filter((x) => validDate(x?.start) && validDate(x?.end) && x.end > x.start)
    .map((x) => ({ start: x.start, end: x.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    if (!prev || row.start > prev.end) out.push({ ...row });
    else if (row.end > prev.end) prev.end = row.end;
  }
  return out;
}

function clipInterval(interval, start, end) {
  if (!interval || !validDate(start) || !validDate(end)) return null;
  const clipped = { start: new Date(Math.max(interval.start, start)), end: new Date(Math.min(interval.end, end)) };
  return clipped.end > clipped.start ? clipped : null;
}

function intersectionSecs(a, b) {
  const aa = mergeIntervals(a), bb = mergeIntervals(b);
  let i = 0, j = 0, total = 0;
  while (i < aa.length && j < bb.length) {
    const start = Math.max(aa[i].start, bb[j].start);
    const end = Math.min(aa[i].end, bb[j].end);
    if (end > start) total += (end - start) / 1000;
    if (aa[i].end <= bb[j].end) i++; else j++;
  }
  return total;
}

export function approvedTimePermissions(requests, employee, dateStr) {
  return (Array.isArray(requests) ? requests : []).filter((r) =>
    r && r.type === 'permission' && r.status === 'approved' &&
    requestBelongsToEmployee(r, employee) && r.date === dateStr && permissionKindOf(r));
}

/* نطبّع المدة من الساعة نفسها: end المساوية أو الأسبق تقع في اليوم التالي.
   ثم نطلب موضعاً واحداً فقط يتقاطع مع الوردية. وجود موضعين محتملين يعني أن
   النص وحده لا يثبت اليوم المقصود، فنفشل مغلقاً ولا نختار الأقرب تخميناً. */
function explicitInterval(startHm, endHm, shiftStart, shiftEnd) {
  const startMin = hmMinutes(startHm), endMin = hmMinutes(endHm);
  if (startMin == null || endMin == null || startMin === endMin) return null;
  const durationMin = (endMin - startMin + 1440) % 1440;
  const candidates = [];
  for (let day = -1; day <= 2; day++) {
    const start = atHm(shiftStart, startHm, day);
    const end = new Date(start.getTime() + durationMin * 60000);
    const clipped = clipInterval({ start, end }, shiftStart, shiftEnd);
    if (clipped) candidates.push(clipped);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/* Legacy يحمل نقطة واحدة لا فترة. لا نربطها بأقرب يوم خارج الوردية: لا بد
   أن تقع داخل حدود الوردية في موضع واحد، وإلا لا يوجد دليل حتمي للتعويض. */
function legacyPoint(time, shiftStart, shiftEnd) {
  if (!HM_RE.test(String(time || ''))) return null;
  const candidates = [];
  for (let day = -1; day <= 2; day++) {
    const point = atHm(shiftStart, time, day);
    if (point >= shiftStart && point <= shiftEnd) candidates.push(point);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function permissionInterval(permission, shiftStart, shiftEnd) {
  if (!permission || !validDate(shiftStart) || !validDate(shiftEnd) || shiftEnd <= shiftStart) return null;
  const kind = permissionKindOf(permission);
  if (!kind) return null;

  const hasStart = Object.hasOwn(permission, 'startTime');
  const hasEnd = Object.hasOwn(permission, 'endTime');
  const hasLegacy = Object.hasOwn(permission, 'time');
  if (hasStart || hasEnd) {
    if (!hasStart || !hasEnd || hasLegacy) return null;
    return explicitInterval(permission.startTime, permission.endTime, shiftStart, shiftEnd);
  }

  if (!hasLegacy || kind === PERMISSION_KIND.MID) return null;
  const point = legacyPoint(permission.time, shiftStart, shiftEnd);
  if (!point) return null;
  if (kind === PERMISSION_KIND.LATE)
    return clipInterval({ start: shiftStart, end: point }, shiftStart, shiftEnd);
  if (kind === PERMISSION_KIND.EARLY)
    return clipInterval({ start: point, end: shiftEnd }, shiftStart, shiftEnd);
  return null;
}

function completedSessions(sessions) {
  const intervals = [];
  for (const s of (Array.isArray(sessions) ? sessions : [])) {
    const start = asDate(s?.in), end = asDate(s?.out);
    if (!start || !end || end <= start || end - start > 36 * 3600000) return { safe: false, intervals: [] };
    intervals.push({ start, end });
  }
  if (!intervals.length) return { safe: false, intervals: [] };
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start < intervals[i - 1].end) return { safe: false, intervals: [] };
  }
  return { safe: true, intervals: mergeIntervals(intervals) };
}

function internalGaps(workedInside) {
  const rows = mergeIntervals(workedInside), gaps = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].start > rows[i - 1].end) gaps.push({ start: rows[i - 1].end, end: rows[i].start });
  }
  return gaps;
}

const violation = (start, end, shiftStart, shiftEnd) => {
  if (!validDate(start) || !validDate(end) || end <= start) return [];
  const x = clipInterval({ start, end }, shiftStart, shiftEnd);
  return x ? [x] : [];
};

export function permissionWorkTime({
  requests, employee, employeeUid, dateStr, shiftStart, shiftEnd, sessions,
  firstIn, lastOut, baseSecs = 0, lateGraceMinutes = 0
}) {
  const actualIn = asDate(firstIn), actualOut = asDate(lastOut);
  const base = Number.isFinite(Number(baseSecs)) ? Math.max(0, Number(baseSecs)) : 0;
  const approved = approvedTimePermissions(requests, employee ?? employeeUid, dateStr);
  const resolved = approved.map((permission) => ({
    permission,
    kind: permissionKindOf(permission),
    interval: permissionInterval(permission, shiftStart, shiftEnd)
  })).filter((x) => x.interval);
  const wantsMid = approved.some((p) => permissionKindOf(p) === PERMISSION_KIND.MID);
  const hasResolvedMid = resolved.some((x) => x.kind === PERMISSION_KIND.MID);
  const sessionState = completedSessions(sessions);
  const validWindow = validDate(shiftStart) && validDate(shiftEnd) && shiftEnd > shiftStart;
  const completedInside = validWindow ? mergeIntervals(sessionState.intervals
    .map((x) => clipInterval(x, shiftStart, shiftEnd)).filter(Boolean)) : [];
  const useSessions = hasResolvedMid && sessionState.safe && validWindow && completedInside.length > 0;
  const applicable = useSessions ? resolved : resolved.filter((x) => x.kind !== PERMISSION_KIND.MID);
  const coveredIntervals = mergeIntervals(applicable.map((x) => x.interval));

  let actualSecs = base, effectiveSecs = base, creditedSecs = 0;
  let workedInside = [];
  if (useSessions) {
    actualSecs = secsOf(sessionState.intervals);
    workedInside = completedInside;
    const outsideSecs = Math.max(0, actualSecs - secsOf(workedInside));
    const officialInside = mergeIntervals([...workedInside, ...coveredIntervals]);
    creditedSecs = Math.max(0, secsOf(officialInside) - secsOf(workedInside));
    effectiveSecs = outsideSecs + secsOf(officialInside);
  } else if (actualIn && actualOut && actualOut > actualIn && validWindow) {
    const actualInside = [clipInterval({ start: actualIn, end: actualOut }, shiftStart, shiftEnd)].filter(Boolean);
    creditedSecs = Math.max(0, secsOf(mergeIntervals([...actualInside, ...coveredIntervals])) - secsOf(actualInside));
    effectiveSecs = base + creditedSecs;
  }

  const lateStart = validDate(shiftStart)
    ? new Date(shiftStart.getTime() + Math.max(0, Number(lateGraceMinutes) || 0) * 60000) : null;
  /* في مسار Mid تصبح الجلسات داخل الوردية هي الدليل: بصمة قبل الوردية لا
     تخفي أن أول عمل داخلها بدأ متأخراً، وبصمة بعدها لا تخفي خروجاً مبكراً. */
  const workStart = useSessions ? workedInside[0].start : actualIn;
  const workEnd = useSessions ? workedInside[workedInside.length - 1].end : actualOut;
  const lateViolation = violation(lateStart, workStart, shiftStart, shiftEnd);
  const earlyViolation = violation(workEnd, shiftEnd, shiftStart, shiftEnd);
  const gaps = useSessions ? internalGaps(workedInside) : [];
  const lateCoveredSecs = intersectionSecs(lateViolation, coveredIntervals);
  const earlyCoveredSecs = intersectionSecs(earlyViolation, coveredIntervals);
  const midCoveredSecs = intersectionSecs(gaps, coveredIntervals);
  const midGapSecs = secsOf(gaps);

  const earlyUncoveredSecs = Math.max(0, secsOf(earlyViolation) - earlyCoveredSecs);
  let effectiveOut = actualOut;
  if (actualOut && earlyCoveredSecs > 0 && earlyUncoveredSecs === 0 && actualOut < shiftEnd) effectiveOut = shiftEnd;

  return {
    approved,
    coveredIntervals,
    actualIn,
    actualOut,
    effectiveOut,
    actualSecs,
    effectiveSecs,
    creditedSecs,
    lateCoveredSecs,
    lateUncoveredSecs: Math.max(0, secsOf(lateViolation) - lateCoveredSecs),
    earlyCoveredSecs,
    earlyUncoveredSecs,
    midGapSecs,
    midCoveredSecs,
    midUncoveredSecs: Math.max(0, midGapSecs - midCoveredSecs),
    usesCompletedSessions: useSessions,
    midFallback: wantsMid && !useSessions,
    adjusted: creditedSecs > 0
  };
}

export function permissionIntervalsLabel(intervals) {
  const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (intervals || []).map((x) => `${hm(x.start)}–${hm(x.end)}`).join('، ');
}
