/* ═══════════════════════════════════════════════════════════════════════════
   تصدير Excel.

   ⚠️ SheetJS ليست وحدة ES — تُحمَّل كـ <script> عادي في index.html، فنستعملها
   من window.XLSX. لا تحاول import.

   ⚠️⚠️ عناوين الأعمدة العربية أدناه منقولة حرفياً. المالك يبني عليها
   جداوله ومعادلاته، فتغيير كلمة واحدة يكسر ملفاته الجاهزة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { AR_DAYS, STATUS_AR, ymdKsa } from './dates.js';
import { fmtDate, hm, tsToDate } from './format.js';
import { toast } from './dom.js';
import { sessionsOf, flattenSessions, fetchAttendance } from './attendance.js';
import { requestsInCycle } from './dates.js';
import { payrollConfig } from './payroll.js';
import { permissionExportFields } from './permission-link.js';
import { payrollSourceLabel } from './attendance-sources.js';

const X = () => window.XLSX;
const permissionPeriod = (r) => r.startTime && r.endTime
  ? `${r.startTime}–${r.endTime}`
  : (r.time || '');

function saveBook(sheets, filename) {
  const wb = X().utils.book_new();
  for (const [name, rows] of sheets) {
    X().utils.book_append_sheet(wb, X().utils.json_to_sheet(rows.length ? rows : [{ 'لا يوجد': '' }]), name);
  }
  X().writeFile(wb, filename);
}

/* ═══ أداء القسم (المرحلة ٤) ═══
   ⚠️ الصفوف تأتي جاهزة من teamExportRows() في team-stats.js — نفس الأرقام
   المعروضة على الشاشة حرفياً. لا يُحسب هنا شيء: ملفٌ يخالف الشاشة التي
   صُدِّر منها يُفقد الثقة في الاثنين معاً. */
export function teamPerfExport(cyc, deptName, rows) {
  if (!rows.length) { toast('لا بيانات للتصدير', 'err'); return; }
  saveBook([[`أداء ${deptName || 'القسم'}`.slice(0, 28), rows]],
           `أداء-${deptName || 'القسم'}-${cyc.key}.xlsx`);
}

/* ═══ كل الطلبات ═══ */
export function exportRequests(requests) {
  if (!requests.length) { toast('لا توجد طلبات للتصدير', 'err'); return; }
  const rows = requests.map((r) => ({
    'الموظف': r.employeeName, 'الرقم الوظيفي': r.employeeEmpId || '', 'القسم': r.department || '',
    'النوع': r.type === 'permission' ? 'استئذان' : 'إجازة', 'التصنيف': r.categoryLabel,
    'التاريخ/البداية': r.type === 'permission' ? r.date : r.startDate,
    'الوقت/النهاية': r.type === 'permission' ? permissionPeriod(r) : r.endDate,
    'الأيام': r.type === 'leave' ? r.days : '', 'السبب': r.reasonLabel || '',
    'جهة الاعتماد': r.approverName || '', 'الحالة': STATUS_AR[r.status],
    'سبب الرفض': r.rejectReason || '', 'روجع بواسطة': r.reviewedBy || '',
    'معرف الطلب': r.id || '', 'تفاصيل الطلب': r.note || '',
    'من الساعة': r.type === 'permission' ? (r.startTime || '') : '',
    'إلى الساعة': r.type === 'permission' ? (r.endTime || '') : ''
  }));
  saveBook([['الطلبات', rows]], 'طلبات_سين_العقارية.xlsx');
  toast('تم التصدير', 'ok');
}

const mapSess = (rows) => rows.map((row) => {
  const s = row.s || {};
  let hours = '';
  if (s.in && s.out) hours = ((tsToDate(s.out) - tsToDate(s.in)) / 3600000).toFixed(2);
  return {
    'الموظف': row.r.employeeName, 'الرقم الوظيفي': row.r.employeeEmpId || '', 'القسم': row.r.department || '',
    'التاريخ': row.r.date, 'اليوم': AR_DAYS[row.r.dow] || '', 'الوردية': row.r.shiftLabel || '',
    'الجلسة': row.idx + 1,
    'وقت الحضور': hm(s.in), 'وقت الانصراف': hm(s.out), 'ساعات العمل': hours,
    /* ⚠️ الأعمدة الجديدة تُضاف في النهاية دائماً. إدراج عمود في المنتصف يزحزح
       كل ما بعده فتنكسر معادلات الملفات الجاهزة عند المالك. */
    'الفرع': s.inBranchName || row.r.branchName || ''
  };
});

/* ═══ تقرير الدورة الشهرية ═══ */
export async function monthlyExport(cyc, allRequests) {
  const list = requestsInCycle(cyc, allRequests);
  let att = [], attDev = [];
  try { att = await fetchAttendance(cyc, 'attendance'); } catch (e) { console.error(e); }
  try { attDev = await fetchAttendance(cyc, 'zkAttendance'); } catch (e) { console.error(e); }
  if (!list.length && !att.length && !attDev.length) { toast('لا توجد بيانات في هذه الدورة', 'err'); return; }

  const perms = list.filter((r) => r.type === 'permission');
  const leaves = list.filter((r) => r.type === 'leave');

  const summary = [
    { 'البند': 'الدورة', 'القيمة': cyc.label },
    { 'البند': 'من تاريخ', 'القيمة': fmtDate(cyc.start) },
    { 'البند': 'إلى تاريخ', 'القيمة': fmtDate(cyc.end) },
    { 'البند': 'إجمالي الطلبات', 'القيمة': list.length },
    { 'البند': 'عدد الاستئذانات', 'القيمة': perms.length },
    { 'البند': 'عدد الإجازات', 'القيمة': leaves.length },
    { 'البند': 'موافق عليها', 'القيمة': list.filter((r) => r.status === 'approved').length },
    { 'البند': 'مرفوضة', 'القيمة': list.filter((r) => r.status === 'rejected').length },
    { 'البند': 'تحت المراجعة', 'القيمة': list.filter((r) => r.status === 'pending').length },
    { 'البند': 'أيام الإجازات المعتمدة', 'القيمة': leaves.filter((r) => r.status === 'approved').reduce((s, r) => s + (r.days || 0), 0) },
    { 'البند': 'تاريخ التقرير', 'القيمة': fmtDate(new Date()) }
  ];
  const permRows = perms.map((r) => ({
    'الموظف': r.employeeName, 'الرقم الوظيفي': r.employeeEmpId || '', 'القسم': r.department || '',
    'نوع الاستئذان': r.categoryLabel, 'التاريخ': r.date, 'الوقت': permissionPeriod(r), 'السبب': r.reasonLabel || '',
    'جهة الاعتماد': r.approverName || '', 'الحالة': STATUS_AR[r.status],
    'سبب الرفض': r.rejectReason || '', 'روجع بواسطة': r.reviewedBy || '',
    'معرف الطلب': r.id || '', 'تفاصيل الطلب': r.note || '',
    'من الساعة': r.startTime || '', 'إلى الساعة': r.endTime || ''
  }));
  const leaveRows = leaves.map((r) => ({
    'الموظف': r.employeeName, 'الرقم الوظيفي': r.employeeEmpId || '', 'القسم': r.department || '',
    'نوع الإجازة': r.categoryLabel, 'من': r.startDate, 'إلى': r.endDate, 'عدد الأيام': r.days,
    'جهة الاعتماد': r.approverName || '', 'الحالة': STATUS_AR[r.status],
    'سبب الرفض': r.rejectReason || '', 'روجع بواسطة': r.reviewedBy || ''
  }));

  saveBook([
    ['ملخص الدورة', summary],
    ['الاستئذانات', permRows],
    ['الإجازات', leaveRows],
    ['حضور الموقع', mapSess(flattenSessions(att))],
    ['بصمات الجهاز', mapSess(flattenSessions(attDev))]
  ], `تقرير_سين_${cyc.key}.xlsx`);
  toast('تم تصدير التقرير الشهري', 'ok');
}

/* ═══ سجل الحضور المعروض ═══ */
export function attendanceExport(cyc, opt, dailyRowsList, sessRowsList) {
  const tag = opt.isDevice ? 'بصمات_الجهاز' : 'حضور_الموقع';
  const sheets = [];
  if (dailyRowsList) {
    sheets.push(['التقرير اليومي', dailyRowsList.map((r) => {
      const p = permissionExportFields(r.permissions);
      return ({
      'الموظف': r.u.name, 'الرقم الوظيفي': r.u.empId || '', 'القسم': r.u.department || '',
      'التاريخ': r.dateStr, 'اليوم': AR_DAYS[r.dow],
      'الوردية': r.shift ? ((r.shift.type === 'evening' ? 'مسائي ' : 'صباحي ') + (r.shift.start || '') + '–' + (r.shift.end || '')) : '',
      'الحالة': r.status, 'دخول': r.firstIn ? hm(r.firstIn) : '', 'خروج': r.lastOut ? hm(r.lastOut) : '',
      'ساعات العمل': r.secs > 0 ? (r.secs / 3600).toFixed(2) : '', 'ملاحظة': r.note || '',
      'يوجد استئذان معتمد': p.exists, 'معرف طلب الاستئذان': p.ids,
      'نوع الاستئذان': p.types, 'سبب الاستئذان': p.reasons, 'تفاصيل الاستئذان': p.details,
      /* «خروج» أعلاه يبقى الفعلي للتدقيق، وهذه الأعمدة الجديدة في النهاية
         تصرّح بما استعملته الحسبة من دون زحزحة أعمدة الملفات القائمة. */
      'خروج محتسب': r.effectiveOut ? hm(r.effectiveOut) : '',
      'ساعات فعلية': r.actualSecs > 0 ? (r.actualSecs / 3600).toFixed(2) : '',
      'فترات استئذان محتسبة': r.permissionIntervalsLabel || '',
      'دقائق استئذان محتسبة': r.creditedSecs > 0 ? Math.round(r.creditedSecs / 60) : 0,
      'دقائق نقص أثناء الوردية': r.midGapMin || 0
    }); })]);
  }
  if (sessRowsList) {
    sheets.push(['الجلسات التفصيلية', sessRowsList.map((row) => {
      const s = row.s || {};
      let hours = ''; if (s.in && s.out) hours = ((tsToDate(s.out) - tsToDate(s.in)) / 3600000).toFixed(2);
      return {
        'الموظف': row.r.employeeName, 'الرقم الوظيفي': row.r.employeeEmpId || '', 'القسم': row.r.department || '',
        'التاريخ': row.r.date, 'اليوم': AR_DAYS[row.r.dow] || '', 'الوردية': row.r.shiftLabel || '',
        'الجلسة': row.idx + 1,
        'وقت الحضور': hm(s.in), 'وقت الانصراف': hm(s.out), 'ساعات العمل': hours,
        'المصدر': (s.source || row.r.source || (opt.isDevice ? 'device' : 'web')) === 'device' ? 'جهاز البصمة' : 'الموقع',
        /* عمود جديد — في النهاية دائماً، ومن الجلسة نفسها لا من جذر الوثيقة */
        'الفرع': s.inBranchName || row.r.branchName || ''
      };
    })]);
  }
  saveBook(sheets, `${tag}_${cyc.key}.xlsx`);
  toast('تم تصدير المعروض', 'ok');
}

/* ═══ مسير الرواتب ═══ */
export function payrollExport(cyc, rowsPay) {
  const cfg = rowsPay[0]?.cfg || payrollConfig();
  const summary = rowsPay.map((r) => ({
    'الموظف': r.u.name, 'الرقم الوظيفي': r.u.empId || '', 'القسم': r.u.department || '', 'المسمى': r.u.jobTitle || '',
    'الراتب الأساسي': r.salary, 'قيمة اليوم': +r.dayRate.toFixed(2), 'قيمة الساعة': +r.hourRate.toFixed(2),
    'أيام العمل في الدورة': r.workDays, 'أيام الحضور': r.presentDays, 'أيام التأخير': r.lateDays,
    'أيام الغياب': r.absentDays, 'إجازة مدفوعة (يوم)': r.paidLeaveDays, 'إجازة بدون راتب (يوم)': r.unpaidDays,
    'أيام بلا بصمة انصراف': r.missingOut,
    'دقائق التأخير': r.lateMin, 'دقائق الخروج المبكر': r.earlyMin, 'دقائق معفاة باستئذان': r.exemptMin,
    'ساعات مطلوبة': +r.reqH.toFixed(2),
    'ساعات فعلية': +(Number.isFinite(r.recordedWorkH) ? r.recordedWorkH : r.workH).toFixed(2),
    'خصم الساعات': +r.dedHours.toFixed(2), 'خصم الغياب': +r.dedAbsent.toFixed(2),
    'خصم إجازة بدون راتب': +r.dedUnpaid.toFixed(2),
    'إجمالي الخصم': +r.total.toFixed(2), 'المستحق': +r.net.toFixed(2),
    'ساعات محتسبة بعد الاستئذانات': +r.workH.toFixed(2),
    'دقائق نقص أثناء الوردية': r.gapMin || 0
  }));
  const details = [];
  rowsPay.forEach((r) => (r.details || []).forEach((d) => {
    const p = permissionExportFields(d.permissions);
    details.push({
    'الموظف': r.u.name, 'الرقم الوظيفي': r.u.empId || '', 'التاريخ': d.dateStr, 'اليوم': AR_DAYS[d.dow] || '',
    'الحالة': d.status, 'ساعات مطلوبة': +(d.need || 0).toFixed(2),
    'دخول': d.in ? hm(d.in) : '', 'خروج': d.out ? hm(d.out) : '',
    'دقائق تأخير': d.lm || 0, 'دقائق خروج مبكر': d.em || 0, 'دقائق معفاة': d.ex || 0,
    'خصم اليوم': +(d.ded || 0).toFixed(2),
    'معرف طلب الاستئذان': p.ids, 'نوع الاستئذان': p.types, 'سبب الاستئذان': p.reasons,
    'تفاصيل الاستئذان': p.details,
    'خروج محتسب': d.effectiveOut ? hm(d.effectiveOut) : '',
    'ساعات فعلية': d.actualSecs > 0 ? +(d.actualSecs / 3600).toFixed(2) : '',
    'ساعات محتسبة': d.effectiveSecs > 0 ? +(d.effectiveSecs / 3600).toFixed(2) : '',
    'ملاحظة': d.note || '',
    'دقائق نقص أثناء الوردية': d.gm || 0,
    'فترات استئذان محتسبة': d.permissionIntervalsLabel || '',
    'دقائق استئذان محتسبة': d.creditedSecs > 0 ? Math.round(d.creditedSecs / 60) : 0
  }); }));
  const rules = [
    { 'البند': 'الدورة', 'القيمة': cyc.label },
    { 'البند': 'من', 'القيمة': ymdKsa(cyc.start) },
    { 'البند': 'إلى', 'القيمة': ymdKsa(cyc.end) },
    { 'البند': 'قيمة اليوم', 'القيمة': 'الراتب ÷ ' + cfg.daysPerMonth },
    { 'البند': 'قيمة الساعة', 'القيمة': 'قيمة اليوم ÷ ' + cfg.hoursPerDay },
    { 'البند': 'سماح التأخير', 'القيمة': (cfg.graceMinutes || 0) + ' دقيقة' },
    { 'البند': 'خصم نقص الساعات', 'القيمة': 'التأخير + الخروج المبكر + الفجوة غير المغطاة، بالساعات × قيمة الساعة' },
    { 'البند': 'خصم الغياب', 'القيمة': 'يوم كامل × قيمة اليوم' },
    { 'البند': 'الإجازات المدفوعة', 'القيمة': 'بلا خصم' },
    { 'البند': 'إجازة بدون راتب', 'القيمة': 'خصم يوم كامل' },
    { 'البند': 'الاستئذان المعتمد', 'القيمة': 'الفترة المعتمدة تُضم إلى الوقت المحتسب داخل الوردية بلا تكرار، مع إبقاء البصمات الفعلية' },
    { 'البند': 'مصدر الحضور', 'القيمة': payrollSourceLabel(cfg) },
    { 'البند': 'تاريخ إصدار المسير', 'القيمة': fmtDate(new Date()) }
  ];
  saveBook([['مسير الرواتب', summary], ['تفصيل الأيام', details], ['قواعد الحساب', rules]],
    `مسير_رواتب_${cyc.key}.xlsx`);
  toast('تم تصدير المسير', 'ok');
}

export { sessionsOf };
