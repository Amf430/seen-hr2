/* ═══════════════════════════════════════════════════════════════════════════
   نموذج صفّ تقرير الحضور.

   لا حساب حضور هنا: الصف يدخل بعد buildDailyStatus، ثم تُطبّق عليه طبقة
   العرض نفسها التي تستعملها شاشات الحضور. هذا يبقي التقرير وExcel وجهين
   لنفس النتيجة، ولا ينشئ تعريفاً ثالثاً للساعات أو الاستئذانات.
   ═══════════════════════════════════════════════════════════════════════════ */

import { AR_DAYS } from './dates.js';
import { decimalHoursHHMM } from './format.js';
import { attendancePresentation } from './attendance-presentation.js';
import { attendanceBoundarySources, attendanceSourceLabel } from './attendance-sources.js';

export const ATTENDANCE_REPORT_SOURCE = Object.freeze({
  DEVICE: 'device', MOBILE: 'mobile', MERGED: 'merged'
});

export function reportPayrollSource(source) {
  return source === ATTENDANCE_REPORT_SOURCE.DEVICE ? 'physical'
    : source === ATTENDANCE_REPORT_SOURCE.MOBILE ? 'mobile' : 'both';
}

const timeMinutes = (value) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const dateMinutes = (value) => value instanceof Date && Number.isFinite(value.getTime())
  ? value.getHours() * 60 + value.getMinutes() : null;

const shiftLabel = (shift) => {
  if (!shift) return '';
  const name = shift.planName || (shift.type === 'evening' ? 'مسائي' : 'صباحي');
  const range = shift.start && shift.end ? `${shift.start}–${shift.end}` : '';
  return [name, range].filter(Boolean).join(' ');
};

export function attendanceReportRow(day) {
  const presentation = attendancePresentation(day);
  const sources = attendanceBoundarySources(day?.rec);
  const shiftName = day?.shift?.planName ||
    (day?.shift?.type === 'evening' ? 'مسائي' : day?.shift ? 'صباحي' : '');
  return {
    employeeUid: day?.u?.id || '',
    employee: day?.u?.name || '',
    employeeId: day?.u?.empId || '',
    department: day?.u?.department || '',
    date: day?.dateStr || '',
    dow: day?.dow,
    day: AR_DAYS[day?.dow] || '',
    shift: shiftLabel(day?.shift),
    shiftName,
    shiftStart: day?.shift?.start || '',
    shiftEnd: day?.shift?.end || '',
    officialIn: presentation.officialIn,
    inSource: attendanceSourceLabel(sources.inSource),
    officialOut: presentation.officialOut,
    outSource: attendanceSourceLabel(sources.outSource),
    workedHours: decimalHoursHHMM(Math.max(0, Number(day?.secs) || 0) / 3600),
    status: day?.status || '',
    statusClass: day?.cls || '',
    permission: presentation.hasApproved ? (presentation.permissionType || 'معتمد') : '',
    note: presentation.note || '',
    presentation,
    dayRow: day
  };
}

/* الوقتان فرزٌ يومي متكرر: «من الوقت» يخص الدخول الرسمي و«إلى الوقت» يخص
   الخروج الرسمي. عند تفعيل حدّ وغياب بصمته لا نخمن وقتاً لتمرير الصف. */
export function attendanceReportRows(days, filters = {}) {
  const fromMinutes = timeMinutes(filters.fromTime);
  const toMinutes = timeMinutes(filters.toTime);
  return (days || []).map(attendanceReportRow).filter((row) => {
    if (filters.fromDate && row.date < filters.fromDate) return false;
    if (filters.toDate && row.date > filters.toDate) return false;
    if (filters.department && row.department !== filters.department) return false;
    if (filters.employeeUid && row.employeeUid !== filters.employeeUid) return false;
    if (filters.status && row.statusClass !== filters.status) return false;
    const inMinutes = dateMinutes(row.officialIn);
    const outMinutes = dateMinutes(row.officialOut);
    if (fromMinutes != null && (inMinutes == null || inMinutes < fromMinutes)) return false;
    if (toMinutes != null && (outMinutes == null || outMinutes > toMinutes)) return false;
    return true;
  });
}
