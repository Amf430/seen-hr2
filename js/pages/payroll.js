import { el, esc, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getUsers, getRequests, getMe } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList, ymdKsa } from '../lib/dates.js';
import { money, hhmm, fmtDT } from '../lib/format.js';
import { fetchAttendance } from '../lib/attendance.js';
import { computePayroll, payrollConfig } from '../lib/payroll.js';
import { payrollExport } from '../lib/excel.js';
import { approveRun, getRun, diffAgainstRun } from '../lib/payroll-runs.js';
import { adjustmentsInRange, adjustedPayrollAttendance } from '../lib/adjustments.js';
import { openTypedConfirm } from '../components/review-modals.js';
import { go, isStale, rerender } from '../lib/nav.js';
import { card, empty, tableWrap, grid, stat, sectionHead, button, callout, pageHead } from '../lib/ui.js';
import {
  PAYROLL_ATTENDANCE_SOURCE, payrollAttendanceSource, payrollSourceLabel,
  payrollConfigForRun, loadRequiredAttendanceSources
} from '../lib/attendance-sources.js';
import { payrollRowsForView, payrollTotals } from '../lib/payroll-view.js';

export async function render(view, token) {
  const cycles = recentCyclesList(12);
  const cfg = payrollConfig();

  view.appendChild(pageHead('مسير الرواتب',
    `الدورة من ٢٦ إلى ٢٥ — مصدر الحضور الحالي: ${payrollSourceLabel(cfg)}`));

  const head = card(null, null, 'money',
    `قيمة اليوم = الراتب ÷ ${cfg.daysPerMonth} · قيمة الساعة = قيمة اليوم ÷ ${cfg.hoursPerDay}. ` +
    `الخصم بالساعات للتأخير والخروج المبكر، والغياب بخصم يوم كامل. المصدر: ${payrollSourceLabel(cfg)}.`);
  const dd = el('select', 'select-lg');
  dd.innerHTML = cycles.map((c, i) =>
    `<option value="${i}">${esc(c.label)}${i === 0 ? ' (الحالية — غير مكتملة)' : ''}</option>`).join('');
  head.appendChild(dd);
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  async function draw() {
    const cyc = cycles[+dd.value];
    host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ حساب المسير…</div></div>';
    let run = null;
    try { run = await getRun(cyc.key); }
    catch (e) {
      console.error('run', e);
      host.innerHTML = '<div class="card"><div class="empty">تعذّرت قراءة حالة اعتماد المسير — لن يُعرض حساب حي مكان Snapshot محتمل</div></div>';
      return;
    }
    if (isStale(token)) return;

    /* المسير المعتمد يقارن بمصدره المحفوظ، لا بإعداد اليوم. تغيير المصدر
       لا يصنع drift تاريخياً وهمياً ولا يغيّر اللقطة المجمدة. */
    const effectiveCfg = payrollConfigForRun(cfg, run);
    const source = payrollAttendanceSource(effectiveCfg);
    let physical = [], mobile = [], adjs = [], freshRows = [];
    try {
        await refreshUsers();
        const loaded = await Promise.all([
          loadRequiredAttendanceSources({
            ...(source !== PAYROLL_ATTENDANCE_SOURCE.MOBILE
              ? { physical: () => fetchAttendance(cyc, 'zkAttendance') } : {}),
            ...(source !== PAYROLL_ATTENDANCE_SOURCE.PHYSICAL
              ? { mobile: () => fetchAttendance(cyc, 'attendance') } : {})
          }),
          adjustmentsInRange(ymdKsa(cyc.start), ymdKsa(cyc.end))
        ]);
        physical = loaded[0].physical || [];
        mobile = loaded[0].mobile || [];
        adjs = loaded[1];
        const recs = adjustedPayrollAttendance(
          getUsers(), effectiveCfg, physical, mobile, adjs);
        freshRows = computePayroll(cyc, getUsers(), getRequests(), recs, { config: effectiveCfg });
    } catch (e) {
      console.error(e);
      if (!run) {
        host.innerHTML = '<div class="card"><div class="empty">تعذّر تحميل مصدر الحضور المختار أو تصحيحاته — لا يمكن حساب مسير موثوق</div></div>';
        return;
      }
      /* اللقطة نفسها مكتفية بذاتها. فشل المقارنة الحية لا يحوّلها إلى
         حساب جديد ولا يمنع عرض الأرقام التي اعتُمدت فعلاً. */
      freshRows = [];
    }
    if (isStale(token)) return;
    /* اللقطة المجمدة هي المعروضة والمصدّرة. الحساب الحديث يبقى للمقارنة فقط
       كي لا يعيد تغيير الإعداد الحالي تفسير راتب صُرف فعلاً. */
    const rowsPay = payrollRowsForView(run, freshRows, getUsers());
    const noSalary = rowsPay.filter((r) => !r.salary).length;
    const tot = payrollTotals(rowsPay);

    host.innerHTML = '';

    /* ═══ حالة الاعتماد ═══
       ⚠️ بعد الاعتماد نقارن اللقطة بالحساب الحالي. أي فرق يعني أن بيانات
       الدورة تغيّرت بعد الصرف — وردية عُدِّلت، عطلة أُضيفت، بصمة صُحِّحت.
       الفرق يُعرض صراحةً بدل أن يبتلعه الرقم بصمت، وهذا هو أصل الميزة. */
    if (run) {
      const drift = freshRows.length ? diffAgainstRun(run, freshRows) : [];
      const bn = el('div', 'run-banner' + (drift.length ? ' run-banner--drift' : ''));
      bn.innerHTML = icon(drift.length ? 'alert' : 'shield') +
        `<div><b>${drift.length ? 'مسير معتمَد — لكن البيانات تغيّرت بعده' : 'مسير معتمَد ومجمَّد'}</b>
         <div class="help">اعتمده ${esc(run.approvedBy)} · ${fmtDT(run.approvedAt)} ·
         المستحق وقت الاعتماد <b class="num">${money(run.totals.net)}</b></div></div>`;
      host.appendChild(bn);
      host.appendChild(callout('info', 'مصدر هذه اللقطة: ' + payrollSourceLabel(effectiveCfg),
        'يُستخدم المصدر المحفوظ مع المسير المعتمد، حتى لو تغيّر إعداد الشركة لاحقاً.'));
      if (!freshRows.length) {
        host.appendChild(callout('info', 'المقارنة الحية غير متاحة',
          'الأرقام المعروضة من اللقطة المجمدة نفسها؛ لم يُعد تفسيرها من بيانات اليوم.'));
      } else if (drift.length) {
        const dc = card('فروق ظهرت بعد الاعتماد', 'الأرقام أدناه محسوبة الآن — المعتمَد هو ما في اللقطة.', 'alert');
        dc.appendChild(tableWrap(`
          <table class="tight">
            <thead><tr><th>الموظف</th><th class="money">المعتمَد</th><th class="money">المحسوب الآن</th><th class="money">الفرق</th></tr></thead>
            <tbody>${drift.map((d) => `<tr>
              <td><b>${esc(d.name)}</b></td>
              <td class="money">${d.was != null ? money(d.was) : '—'}</td>
              <td class="money">${d.now != null ? money(d.now) : '—'}</td>
              <td class="money ${d.delta > 0 ? 'text-green' : 'text-red'}">${
                d.delta != null ? (d.delta > 0 ? '+ ' : '− ') + money(Math.abs(d.delta)) : (d.kind === 'new' ? 'موظف جديد' : 'حُذف')}</td>
            </tr>`).join('')}</tbody>
          </table>`));
        host.appendChild(dc);
      }
    } else if (+dd.value === 0) {
      host.appendChild(callout('warn', 'الدورة الحالية لم تنتهِ بعد',
        'الأرقام تُحسب حتى اليوم فقط، وستتغيّر حتى تاريخ 25.'));
    }
    if (noSalary)
      host.appendChild(callout('danger', `${noSalary} موظف بلا راتب محدّد`,
        'افتح بروفايل الموظف وأضف الراتب، وإلا سيظهر مستحقّه صفراً.'));
    if (tot.missingOut)
      host.appendChild(callout('violet', `${tot.missingOut} يوم بلا بصمة انصراف`,
        'في هذه الأيام حُسبت ساعات الوردية المطلوبة ناقص التأخير. راجعها قبل اعتماد المسير.'));

    const g = grid(4);
    g.append(
      stat(money(tot.salary), 'إجمالي الرواتب الأساسية'),
      stat(money(tot.total), 'إجمالي الخصومات', 'r'),
      stat(money(tot.net), 'إجمالي المستحق', 'g'),
      stat(rowsPay.length, 'عدد الموظفين')
    );
    host.appendChild(g);

    const g2 = grid(3);
    g2.append(
      stat(hhmm(tot.lateMin), 'إجمالي التأخير', 'a'),
      stat(hhmm(tot.earlyMin), 'إجمالي الخروج المبكر', 'a'),
      stat(money(tot.dedAbsent + tot.dedUnpaid), 'خصم الغياب والإجازات غير المدفوعة', 'r')
    );
    host.appendChild(g2);

    const c = card('');
    c.appendChild(sectionHead(`مسير ${cyc.label}`,
      button('تصدير المسير (Excel)', 'btn sm', () => payrollExport(cyc, rowsPay), 'download'),
      /* الاعتماد يُخفى للدورة الجارية: تجميد أرقام ما زالت تتغيّر حتى ٢٥
         يُنتج لقطة لا تطابق ما سيُصرف فعلاً. */
      (run || +dd.value === 0) ? null
        : button('اعتماد المسير وتجميده', 'btn sm',
          () => confirmApprove(cyc, rowsPay, effectiveCfg), 'shield')));

    if (!rowsPay.length) { c.appendChild(empty('لا يوجد موظفون')); host.appendChild(c); return; }

    const wrap = tableWrap(`
      <table class="tight payroll-table">
        <thead><tr>
          <th>الموظف</th><th>القسم</th><th class="money">الراتب</th><th class="money">قيمة الساعة</th>
          <th class="num">أيام العمل</th><th class="num">حضور</th><th class="num">غياب</th><th class="num">إجازة مدفوعة</th><th class="num">بدون راتب</th>
          <th class="num">تأخير</th><th class="num">خروج مبكر</th><th class="money">خصم ساعات</th><th class="money">خصم غياب</th><th class="money">إجمالي الخصم</th><th class="money">المستحق</th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = wrap.querySelector('tbody');

    rowsPay.forEach((r) => {
      const tr = el('tr', 'row-clickable');
      tr.innerHTML = `
        <td><b>${esc(r.u.name)}</b>${r.missingOut ? ` <span class="pill pill--dot missing">${r.missingOut} بلا انصراف</span>` : ''}${compBadge(r)}</td>
        <td>${esc(r.u.department || '—')}</td>
        <td class="money">${r.salary ? money(r.salary) : '<span class="text-red">—</span>'}</td>
        <td class="money">${money(r.hourRate)}</td>
        <td class="num">${r.workDays}</td>
        <td class="num text-green">${r.presentDays}</td>
        <td class="num text-red">${r.absentDays || '—'}</td>
        <td class="num">${r.paidLeaveDays || '—'}</td>
        <td class="num">${r.unpaidDays || '—'}</td>
        <td class="num">${r.lateMin ? hhmm(r.lateMin) : '—'}</td>
        <td class="num">${r.earlyMin ? hhmm(r.earlyMin) : '—'}</td>
        <td class="money neg">${r.dedHours ? '− ' + money(r.dedHours) : '—'}</td>
        <td class="money neg">${(r.dedAbsent + r.dedUnpaid) ? '− ' + money(r.dedAbsent + r.dedUnpaid) : '—'}</td>
        <td class="money neg">${r.total ? '− ' + money(r.total) : '—'}</td>
        <td class="money net">${money(r.net)}</td>`;
      tr.onclick = () => go('profile', r.u.id);
      tb.appendChild(tr);
    });

    const totRow = el('tr', 'row-total');
    totRow.innerHTML = `
      <td colspan="11">الإجمالي</td>
      <td class="money neg">− ${money(tot.dedHours)}</td>
      <td class="money neg">− ${money(tot.dedAbsent + tot.dedUnpaid)}</td>
      <td class="money neg">− ${money(tot.total)}</td>
      <td class="money net">${money(tot.net)}</td>`;
    tb.appendChild(totRow);

    c.appendChild(wrap);
    c.appendChild(el('p', 'help', 'اضغط على أي صف لفتح بروفايل الموظف وتفصيل أيامه.'));
    host.appendChild(c);
  }

  dd.onchange = draw;
  await draw();
}


/* ═══════════════════════════════════════════════════════════════════════════
   اعتماد المسير.

   ⚠️ تأكيد بكتابة كلمة لا بضغطة: العملية لا رجعة فيها إطلاقاً — القاعدة
   تمنع التعديل والحذف حتى على الأدمن. مسير مصروف لا يُمحى، والخطأ فيه يُصحَّح
   بقيد تسوية في الدورة التالية.
   ═══════════════════════════════════════════════════════════════════════════ */
function confirmApprove(cyc, rowsPay, config) {
  const net = rowsPay.reduce((a, r) => a + r.net, 0);
  const noSalary = rowsPay.filter((r) => !r.salary).length;
  const missing = rowsPay.reduce((a, r) => a + r.missingOut, 0);

  openTypedConfirm({
    title: `اعتماد مسير ${cyc.label}`,
    body: `تُحفظ الأرقام الحالية لقطةً مجمّدة لا تتغيّر بعدها مهما عُدِّلت الورديات أو الإعدادات.
           <br><br>عدد الموظفين <b>${rowsPay.length}</b> · إجمالي المستحق <b>${esc(money(net))}</b> ريال
           ${noSalary ? `<br><br><b>تنبيه:</b> ${noSalary} موظف بلا راتب محدّد — سيُعتمدون بصفر.` : ''}
           ${missing ? `<br><b>تنبيه:</b> ${missing} يوم بلا بصمة انصراف — صحّحها أولاً إن أردت.` : ''}
           <br><br><b>لا يمكن التعديل ولا الحذف بعد الاعتماد.</b>`,
    phrase: 'اعتماد',
    confirmLabel: 'اعتماد وتجميد',
    run: async () => {
      await approveRun(cyc, rowsPay, config);
      toast('اعتُمد المسير وجُمِّد', 'ok');
      rerender();
    }
  });
}

/* ═══ شارة التعويض — للأدمن وحده ═══

   المطلوب أن يبقى الموظف غير عالم بالخاصية. مدير القسم يفتح بروفايل موظفيه،
   فتُقصر الشارة على دور admin وحده. الأرقام نفسها (دقائق التأخير بعد التعويض)
   يراها المدير كما هي — بلا ما يسمّي له السبب. */
function compBadge(r) {
  if (!r.compMin || getMe().role !== 'admin') return '';
  return ` <span class="pill pill--dot present" title="عُوِّض تأخيره ببقائه بعد الدوام — ${r.compDays} يوم">` +
         `تعويض ${esc(hhmm(r.compMin))}</span>`;
}
