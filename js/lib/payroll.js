/* ═══════════════════════════════════════════════════════════════════════════
   مسير الرواتب — قواعد الحساب المعتمدة:
     • قيمة اليوم   = الراتب ÷ 30
     • قيمة الساعة  = قيمة اليوم ÷ 8   (قابلة للتعديل من الإعدادات)
     • الخصم        = (دقائق التأخير + دقائق الخروج المبكر) × قيمة الساعة
     • الغياب       = خصم يوم كامل
     • إجازة مدفوعة = بلا خصم · إجازة بدون راتب = خصم يوم
     • استئذان معتمد (تأخير أو خروج مبكر) = معفى من الخصم
     • المصدر       = بصمات جهاز ZKTeco فقط (zkAttendance)

   ⚠️⚠️ computePayroll منقولة حرفياً من النسخة القديمة (السطور 2233-2313).
   هذا كود يحسب رواتب أشخاص. تغيير ترتيب عملية أو تقريب رقم هنا لا يظهر في
   أي اختبار — يظهر يوم الراتب. لا تُعاد صياغته ولا تُبسَّط حلقاته.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getSettings } from './state.js';
import { ymd } from './dates.js';
import { tsToDate } from './format.js';
import { resolveShift, shiftHours, shiftWindowFor } from './shifts.js';
import { sessionsOf, workedSecs, lastOutOf } from './attendance.js';

export function payrollConfig() {
  return { hoursPerDay: 8, daysPerMonth: 30, graceMinutes: 0, ...(getSettings().payroll || {}) };
}

export function isUnpaidLeave(leave) {
  const lt = (getSettings().leaveTypes || []).find((t) => t.id === (leave.leaveTypeId || leave.category));
  if (lt && lt.unpaid !== undefined) return !!lt.unpaid;
  return /بدون\s*راتب/.test(leave.categoryLabel || '');
}

export function computePayroll(cyc, users, requests, recs) {
  const cfg = payrollConfig();
  const recMap = {}; recs.forEach((r) => { recMap[r.employeeUid + '_' + r.date] = r; });
  const emps = users.filter((u) => u.role !== 'admin');
  const now = new Date();
  const end = (cyc.end < now) ? cyc.end : now;

  return emps.map((u) => {
    const salary = Number(u.salary) || 0;
    const dayRate = cfg.daysPerMonth > 0 ? salary / cfg.daysPerMonth : 0;
    const hourRate = cfg.hoursPerDay > 0 ? dayRate / cfg.hoursPerDay : 0;
    let reqH = 0, workH = 0, lateMin = 0, earlyMin = 0, exemptMin = 0;
    let absentDays = 0, unpaidDays = 0, paidLeaveDays = 0, missingOut = 0, presentDays = 0, lateDays = 0, workDays = 0;
    const details = [];

    /* ⚠️ لا يُحاسَب الموظف على أيام قبل مباشرته.
       الدورة تبدأ يوم 26، فمن باشر في 10 أغسطس كان قبله ~11 يوم عمل في نفس
       الدورة — وكانت تُحسب كلها غياباً ويُخصم عنها يوم كامل لكل يوم. راتب
       6,000 كان ينزل إلى 3,800 في أول مسير له. */
    const hire = u.hireDate ? new Date(u.hireDate + 'T00:00:00') : null;
    const startsAt = (hire && !isNaN(hire) && hire > cyc.start) ? hire : cyc.start;

    for (let d = new Date(startsAt); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = ymd(d), dow = d.getDay();
      const sh = resolveShift(dateStr, dow, u.department);
      if (!sh || sh.type === 'off') continue;
      const need = shiftHours(sh);
      workDays++; reqH += need;

      const leave = requests.find((r) => r.type === 'leave' && r.status === 'approved' &&
        r.employeeUid === u.id && r.startDate <= dateStr && r.endDate >= dateStr);
      if (leave) {
        if (isUnpaidLeave(leave)) {
          unpaidDays++;
          details.push({ dateStr, dow, status: 'إجازة بدون راتب', lm: 0, em: 0, ded: dayRate, need });
        } else {
          paidLeaveDays++; workH += need;
          details.push({ dateStr, dow, status: 'إجازة مدفوعة — ' + (leave.categoryLabel || ''), lm: 0, em: 0, ded: 0, need });
        }
        continue;
      }

      const perms = requests.filter((r) => r.type === 'permission' && r.status === 'approved' &&
        r.employeeUid === u.id && r.date === dateStr);
      const latePerm  = perms.find((p) => (p.category || '').includes('تأخير'));
      const earlyPerm = perms.find((p) => (p.category || '').includes('خروج'));

      const rec = recMap[u.id + '_' + dateStr];
      const ss = sessionsOf(rec);
      const firstIn = ss.length ? tsToDate(ss[0].in) : null;
      const lastOut = lastOutOf(ss);

      if (!firstIn) {
        absentDays++;
        details.push({ dateStr, dow, status: 'غياب', lm: 0, em: 0, ded: dayRate, need });
        continue;
      }
      presentDays++;
      const win = shiftWindowFor(d, sh);
      let lm = 0, em = 0, ex = 0, flag = '';
      if (win) {
        const rawLate = Math.max(0, Math.round((firstIn - win.start) / 60000) - (cfg.graceMinutes || 0));
        if (latePerm) { ex += rawLate; }        /* استئذان معتمد → معفى */
        else          { lm = rawLate; }
        if (!lastOut) {
          flag = 'نسيان بصمة الخروج'; missingOut++;
        } else {
          const rawEarly = Math.max(0, Math.round((win.end - lastOut) / 60000));
          if (earlyPerm) { ex += rawEarly; }
          else           { em = rawEarly; }
        }
      }
      if (lm > 0) lateDays++;
      lateMin += lm; earlyMin += em; exemptMin += ex;
      /* الساعات المحتسبة: الفعلية، وعند نسيان الانصراف نحسب المطلوب ناقص التأخير */
      workH += lastOut ? (workedSecs(ss).secs / 3600) : Math.max(0, need - (lm / 60));
      details.push({ dateStr, dow, status: flag || (lm > 0 ? 'متأخر' : 'حاضر'), lm, em, ex,
                     ded: ((lm + em) / 60) * hourRate, need, in: firstIn, out: lastOut });
    }

    const dedHours  = ((lateMin + earlyMin) / 60) * hourRate;
    const dedAbsent = absentDays * dayRate;
    const dedUnpaid = unpaidDays * dayRate;
    const total = dedHours + dedAbsent + dedUnpaid;
    return { u, salary, dayRate, hourRate, cfg,
             workDays, presentDays, lateDays, absentDays, unpaidDays, paidLeaveDays, missingOut,
             reqH, workH, lateMin, earlyMin, exemptMin,
             dedHours, dedAbsent, dedUnpaid, total, net: Math.max(0, salary - total), details };
  }).sort((a, b) => (a.u.name || '').localeCompare(b.u.name || ''));
}
