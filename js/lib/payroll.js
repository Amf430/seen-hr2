/* ═══════════════════════════════════════════════════════════════════════════
   مسير الرواتب — قواعد الحساب المعتمدة:
     • قيمة اليوم   = الراتب ÷ 30
     • قيمة الساعة  = قيمة اليوم ÷ 8   (قابلة للتعديل من الإعدادات)
     • الخصم        = (التأخير + الخروج المبكر + فجوة غير مغطاة) × قيمة الساعة
     • الغياب       = خصم يوم كامل
     • إجازة مدفوعة = بلا خصم · إجازة بدون راتب = خصم يوم
     • فترة استئذان معتمدة = معفاة من الخصم بلا تكرار مع وقت العمل
     • المصدر       = يحدّده payroll.attendanceSource؛ غيابه يعني جهاز ZKTeco

   ⚠️⚠️ قلب computePayroll منقول من النسخة القديمة. اختيار المصدر يتم قبل
   دخوله؛ لا يعرف الدالة إن كان السجل جهازاً أو جوالاً أو موحداً، ولذلك لا
   توجد ثلاث نسخ من معادلة الخصم يمكن أن تتباعد.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getSettings } from './state.js';
import { ymd } from './dates.js';
import { resolveShift, shiftHours, shiftWindowFor, compensableMin } from './shifts.js';
import { sessionsOf, dayBounds, recFor, permissionAuditNote } from './attendance.js';
import { requestBelongsToEmployee } from './permission-link.js';
import { permissionWorkTime, permissionIntervalsLabel } from './permission-work-time.js';
import { missingPunchPenaltyState } from './attendance-pipeline.js';

export function payrollConfig() {
  return { hoursPerDay: 8, daysPerMonth: 30, graceMinutes: 0,
           attendanceSource: 'physical', ...(getSettings().payroll || {}) };
}

export function isUnpaidLeave(leave) {
  const lt = (getSettings().leaveTypes || []).find((t) => t.id === (leave.leaveTypeId || leave.category));
  if (lt && lt.unpaid !== undefined) return !!lt.unpaid;
  return /بدون\s*راتب/.test(leave.categoryLabel || '');
}

export function computePayroll(cyc, users, requests, recs, opts = {}) {
  const cfg = { ...payrollConfig(), ...(opts.config || {}) };
  const recMap = {}; recs.forEach((r) => { recMap[r.employeeUid + '_' + r.date] = r; });
  const emps = users.filter((u) => u.role !== 'admin');
  const now = new Date();
  const end = (cyc.end < now) ? cyc.end : now;

  return emps.map((u) => {
    const salary = Number(u.salary) || 0;
    const dayRate = cfg.daysPerMonth > 0 ? salary / cfg.daysPerMonth : 0;
    const hourRate = cfg.hoursPerDay > 0 ? dayRate / cfg.hoursPerDay : 0;
    let reqH = 0, workH = 0, recordedWorkH = 0;
    let lateMin = 0, earlyMin = 0, gapMin = 0, exemptMin = 0, compMin = 0;
    let missingPunchPenaltyMin = 0;
    let absentDays = 0, unpaidDays = 0, paidLeaveDays = 0, missingOut = 0, presentDays = 0, lateDays = 0, workDays = 0, compDays = 0;
    const details = [];

    /* ⚠️ لا يُحاسَب الموظف على أيام قبل مباشرته.
       الدورة تبدأ يوم 26، فمن باشر في 10 أغسطس كان قبله ~11 يوم عمل في نفس
       الدورة — وكانت تُحسب كلها غياباً ويُخصم عنها يوم كامل لكل يوم. راتب
       6,000 كان ينزل إلى 3,800 في أول مسير له. */
    const hire = u.hireDate ? new Date(u.hireDate + 'T00:00:00') : null;
    const startsAt = (hire && !isNaN(hire) && hire > cyc.start) ? hire : cyc.start;

    for (let d = new Date(startsAt); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = ymd(d), dow = d.getDay();
      /* ⚠️ المعامل الرابع (وثيقة الموظف) يجعل خطة شفته الخاصة تُطبَّق على
         مسيره هو. موظف بلا shiftPlanId لا يتغيّر عليه شيء إطلاقاً — وهذا
         حال كل الموظفين حتى يُسند الأدمن أول خطة. */
      const sh = resolveShift(dateStr, dow, u.department, u);
      if (!sh || sh.type === 'off') continue;
      const need = shiftHours(sh);
      workDays++; reqH += need;

      const leave = requests.find((r) => r.type === 'leave' && r.status === 'approved' &&
        requestBelongsToEmployee(r, u) && r.startDate <= dateStr && r.endDate >= dateStr);
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

      /* ⚠️ recFor لا recMap[u.id + …]: من استُعيد وصوله تاريخُه تحت UID
         سابق، والبحث بالحالي وحده يجعل كل يوم مضى «غياباً» فيُخصم يوماً
         كاملاً عن كل واحد. راجع restoreAccess في users.js. */
      const rec = recFor(recMap, u, dateStr);
      const ss = sessionsOf(rec);
      const penalty = missingPunchPenaltyState(rec);
      const penaltyMin = penalty.minutes;
      const penalizedMissingIn = penalty.byField.in > 0 && rec?.missedCheckIn === true;
      /* ⚠️ حدّا اليوم لا مزاوجة الجلسات: بصمة مكرّرة أو منسيّة كانت تقلب دور
         كل بصمة بعدها، فتصير بصمة الانصراف «دخولاً» مفتوحاً — يُحسب اليوم
         «نسيان بصمة الخروج» ويُخصم على خروج مبكر لم يقع. انظر dayBounds. */
      const { firstIn, lastOut, spanSecs } = dayBounds(ss,
        penalizedMissingIn ? { missedCheckIn: true } : {});
      const win = shiftWindowFor(d, sh);
      const permissionEffect = permissionWorkTime({
        requests,
        employee: u,
        dateStr,
        sessions: ss,
        firstIn,
        lastOut,
        baseSecs: spanSecs,
        shiftStart: win ? win.start : null,
        shiftEnd: win ? win.end : null,
        lateGraceMinutes: cfg.graceMinutes || 0
      });

      /* بصمة الدخول المفقودة لا تسمح باستنتاج دخول أو تأخير. عند وجود خصم
         إداري صريح نطبّق ساعاته وحدها، مع إبقاء الخروج المعروف كما هو.
         بلا خصم تبقى معاملة المسير السابقة حرفياً. */
      if (!firstIn && penalizedMissingIn && lastOut) {
        presentDays++;
        const em = win ? Math.max(0, Math.round(permissionEffect.earlyUncoveredSecs / 60)) : 0;
        const ex = win ? Math.max(0, Math.round((permissionEffect.earlyCoveredSecs
          + permissionEffect.midCoveredSecs) / 60)) : 0;
        earlyMin += em;
        exemptMin += ex;
        missingPunchPenaltyMin += penaltyMin;
        workH += Math.max(0, need - ((em + penaltyMin) / 60));
        const permissionNote = permissionAuditNote(permissionEffect, firstIn, lastOut);
        details.push({ dateStr, dow, status: 'نسيان بصمة الحضور — تعديل إداري معتمد',
          lm: 0, em, gm: 0, ex, cm: 0, pm: penaltyMin,
          ded: ((em + penaltyMin) / 60) * hourRate, need,
          in: null, out: lastOut, actualSecs: 0, effectiveSecs: 0, creditedSecs: 0,
          permissionIntervals: permissionEffect.coveredIntervals,
          permissionIntervalsLabel: permissionIntervalsLabel(permissionEffect.coveredIntervals),
          note: permissionNote, permissions: permissionEffect.approved });
        continue;
      }
      if (!firstIn) {
        absentDays++;
        details.push({ dateStr, dow, status: 'غياب', lm: 0, em: 0, ded: dayRate, need,
                       permissions: permissionEffect.approved });
        continue;
      }
      presentDays++;
      let lm = 0, em = 0, gm = 0, ex = 0, cm = 0, flag = '';
      if (win) {
        const uncoveredLate = Math.max(0, Math.round(permissionEffect.lateUncoveredSecs / 60));
        /* تعويض البقاء يطال الجزء الذي لم تغطّه فترات الاستئذان فقط. */
        cm = compensableMin(uncoveredLate, lastOut, win);
        lm = uncoveredLate - cm;
        if (!lastOut) {
          flag = 'نسيان بصمة الخروج'; missingOut++;
        } else {
          em = Math.max(0, Math.round(permissionEffect.earlyUncoveredSecs / 60));
        }
        gm = Math.max(0, Math.round(permissionEffect.midUncoveredSecs / 60));
        ex = Math.max(0, Math.round((permissionEffect.lateCoveredSecs
          + permissionEffect.earlyCoveredSecs + permissionEffect.midCoveredSecs) / 60));
        if (!flag && gm > 0) flag = 'نقص أثناء الوردية';
      }
      if (lm > 0) lateDays++;
      if (cm > 0) { compMin += cm; compDays++; }
      lateMin += lm; earlyMin += em; gapMin += gm; exemptMin += ex;
      missingPunchPenaltyMin += penaltyMin;
      /* الساعات الفعلية تبقى ما تثبته البصمات. الساعات الرسمية تضم فترات
         الاستئذان المعتمدة داخل الوردية، من دون لمس الأصل. وعند نسيان
         الانصراف يبقى fallback المسير الحالي ولا نسميه ساعات فعلية.
         ⚠️ كانت مجموع الجلسات المزدوجة، وهي غير موثوقة: بصمة زائدة تقلب دور
         ما بعدها فتظهر ساعات لا علاقة لها بالواقع (٥٧ دقيقة ليوم كامل). */
      const fallbackHours = Math.max(0, need - ((lm + penaltyMin) / 60));
      if (lastOut) recordedWorkH += permissionEffect.actualSecs / 3600;
      workH += lastOut ? (permissionEffect.effectiveSecs / 3600) : fallbackHours;
      const permissionNote = permissionAuditNote(permissionEffect, firstIn, lastOut);
      details.push({ dateStr, dow,
                     status: flag || (lm > 0 ? 'متأخر' : (cm > 0 ? 'حاضر — عُوِّض التأخير' : 'حاضر')),
                     lm, em, gm, ex, cm, pm: penaltyMin,
                     ded: ((lm + em + gm + penaltyMin) / 60) * hourRate, need,
                     in: firstIn, out: lastOut, effectiveOut: permissionEffect.effectiveOut,
                     actualSecs: lastOut ? permissionEffect.actualSecs : 0,
                     effectiveSecs: lastOut ? permissionEffect.effectiveSecs : 0,
                     creditedSecs: permissionEffect.creditedSecs,
                     permissionIntervals: permissionEffect.coveredIntervals,
                     permissionIntervalsLabel: permissionIntervalsLabel(permissionEffect.coveredIntervals),
                     note: permissionNote,
                     permissions: permissionEffect.approved });
    }

    const dedHours  = ((lateMin + earlyMin + gapMin + missingPunchPenaltyMin) / 60) * hourRate;
    const dedAbsent = absentDays * dayRate;
    const dedUnpaid = unpaidDays * dayRate;
    const total = dedHours + dedAbsent + dedUnpaid;
    return { u, salary, dayRate, hourRate, cfg,
             workDays, presentDays, lateDays, absentDays, unpaidDays, paidLeaveDays, missingOut,
             reqH, workH, recordedWorkH, lateMin, earlyMin, gapMin, exemptMin,
             missingPunchPenaltyMin, compMin, compDays,
             dedHours, dedAbsent, dedUnpaid, total, net: Math.max(0, salary - total), details };
  }).sort((a, b) => (a.u.name || '').localeCompare(b.u.name || ''));
}
