/* ═══════════════════════════════════════════════════════════════════════════
   جدول المناوبات الأسبوعي للأقسام — منطق نقي وكاش اللقطات المعتمدة.

   الـRoster طبقة اختيارية فقط. لا نتيجة هنا تعيد تعريف الشفت الأساسي:
   إما لقطة Approved صريحة، أو null فيسقط المنادي إلى resolveShift القديم.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ymdKsa } from './dates.js';

export const ROSTER_STATUS = Object.freeze({
  DRAFT: 'draft', SUBMITTED: 'submitted', APPROVED: 'approved', RETURNED: 'returned'
});
export const ROSTER_REST = 'rest';
/* السبت يبقى على سياسة الشفت الأساسية؛ الجدول التشغيلي المطلوب من الأحد للجمعة. */
export const ROSTER_DAYS = Object.freeze([0, 1, 2, 3, 4, 5]);

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
let APPROVED_ENTRIES = new Map();

const pad = (n) => String(n).padStart(2, '0');
const ymdUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function weekStartOf(dateStr) {
  if (!YMD.test(dateStr || '')) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return ymdUtc(d);
}

export function weekEndOf(weekStart) {
  if (!YMD.test(weekStart || '')) return '';
  const d = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDay() !== 0) return '';
  d.setUTCDate(d.getUTCDate() + 6);
  return ymdUtc(d);
}

export function nextWeekStart(now = new Date()) {
  const currentWeek = weekStartOf(ymdKsa(now));
  const d = new Date(`${currentWeek}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return ymdUtc(d);
}

export function rosterIdOf(departmentId, weekStart) {
  if (typeof departmentId !== 'string' || !departmentId || departmentId.length > 80
      || departmentId.includes('/') || !weekEndOf(weekStart)) return '';
  return `${departmentId}_${weekStart}`;
}

export function rosterDepartmentAt(settings, index) {
  const list = Array.isArray(settings?.departments) ? settings.departments : [];
  const d = Number.isInteger(index) ? list[index] : null;
  if (!d || typeof d.id !== 'string' || !d.id || d.id.length > 80 || d.id.includes('/')
      || typeof d.name !== 'string' || !d.name) return null;
  return { departmentId: d.id, departmentIndex: index, department: d.name,
    managerUid: typeof d.managerUid === 'string' ? d.managerUid : '' };
}

export function rosterDepartmentById(settings, departmentId) {
  const list = Array.isArray(settings?.departments) ? settings.departments : [];
  const index = list.findIndex((d) => d?.id === departmentId);
  return rosterDepartmentAt(settings, index);
}

export function managedRosterDepartment(user, settings) {
  if (!user || user.role !== 'manager' || !user.id || !user.department) return null;
  const list = Array.isArray(settings?.departments) ? settings.departments : [];
  const index = list.findIndex((d) => d?.managerUid === user.id && d?.name === user.department);
  return rosterDepartmentAt(settings, index);
}

export function setApprovedRosterEntries(list) {
  const next = new Map();
  for (const x of list || []) {
    const weekStart = x?.weekStart || x?.rosterWeekStart || '';
    const uid = x?.employeeUid || '';
    const departmentId = x?.departmentId || '';
    if (weekStart && uid && departmentId && x.approvedDays && typeof x.approvedDays === 'object') {
      const key = `${weekStart}_${uid}`;
      const sameEmployeeWeek = next.get(key) || [];
      sameEmployeeWeek.push({ ...x, weekStart, departmentId });
      next.set(key, sameEmployeeWeek);
    }
  }
  APPROVED_ENTRIES = next;
}

export const getApprovedRosterEntries = () => [...APPROVED_ENTRIES.values()].flat();
export const clearApprovedRosterEntries = () => { APPROVED_ENTRIES = new Map(); };

const employeeUids = (employee) => [...new Set([
  employee?.id, employee?.uid, ...(Array.isArray(employee?.previousUids) ? employee.previousUids : [])
].filter(Boolean))];

function approvedDayFor(employee, dateStr) {
  const weekStart = weekStartOf(dateStr);
  if (!weekStart) return null;
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  for (const uid of employeeUids(employee)) {
    const candidates = APPROVED_ENTRIES.get(`${weekStart}_${uid}`) || [];
    const exact = employee?.department
      ? candidates.filter((x) => x.department === employee.department) : [];
    /* القسم الحالي يزيل الالتباس إن وُجد أكثر من Parent. وإن كانت لقطة واحدة
       تاريخية لموظف نُقل لاحقاً، تبقى صالحة ولا تتغير بتغيير Default Shift. */
    const entry = exact.length === 1 ? exact[0] : (exact.length ? null
      : (candidates.length === 1 ? candidates[0] : null));
    const day = entry?.approvedDays?.[dow];
    if (day) return day;
  }
  return null;
}

/* → { kind:'rest'|'shift', shift? } | null
   أي لقطة ناقصة تفشل مغلقاً إلى fallback؛ لا نركّب وقتاً من Template حالي
   لأن ذلك سيغيّر تاريخ أسبوع معتمد إذا عُدّل القالب لاحقاً. */
export function resolveRosterDay(employee, dateStr) {
  const day = approvedDayFor(employee, dateStr);
  if (!day) return null;
  if (day.kind === 'rest') return { kind: 'rest' };
  if (day.kind !== 'shift' || !HM.test(day.start || '') || !HM.test(day.end || '')
      || !day.shiftPlanId || !day.planName || !['morning', 'evening'].includes(day.type)) return null;
  return {
    kind: 'shift',
    shift: {
      type: day.type,
      start: day.start,
      end: day.end,
      src: 'weeklyRoster',
      planId: day.shiftPlanId,
      planName: day.planName,
      exLabel: `جدول أسبوعي · ${day.planName}`,
      ...(HM.test(day.checkInCutoff || '') ? { checkInCutoff: day.checkInCutoff } : {})
    }
  };
}

export function isRosterManager(user, settings, departmentId) {
  const cfg = departmentId
    ? rosterDepartmentById(settings, departmentId)
    : managedRosterDepartment(user, settings);
  return !!cfg && user?.role === 'manager' && user.id === cfg.managerUid
    && user.department === cfg.department;
}

export function rosterDaysOk(days) {
  if (!days || typeof days !== 'object' || Array.isArray(days)) return false;
  return Object.entries(days).every(([key, value]) => ROSTER_DAYS.includes(Number(key))
    && typeof value === 'string' && value.length <= 80);
}

/* يحوّل مراجع Draft إلى لقطة لا تعتمد لاحقاً على settings. */
export function snapshotRosterDays(days, plans) {
  if (!rosterDaysOk(days)) throw new Error('invalid-roster-days');
  const out = {};
  for (const dow of ROSTER_DAYS) {
    const code = days[dow] || '';
    if (!code) continue;
    if (code === ROSTER_REST) { out[dow] = { kind: 'rest' }; continue; }
    const plan = (plans || []).find((p) => p?.id === code && p.active !== false);
    const day = plan?.days?.[dow];
    if (!plan || !day || day.type === 'off' || !HM.test(day.start || '') || !HM.test(day.end || ''))
      throw new Error('missing-shift-plan');
    out[dow] = {
      kind: 'shift', shiftPlanId: plan.id, planName: plan.name,
      type: day.type === 'evening' ? 'evening' : 'morning', start: day.start, end: day.end,
      ...(HM.test(plan.checkInCutoff || '') ? { checkInCutoff: plan.checkInCutoff } : {})
    };
  }
  return out;
}
