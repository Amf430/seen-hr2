import { el, esc, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getUsers, getRequests } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList, ymd } from '../lib/dates.js';
import { money, hhmm, fmtDT } from '../lib/format.js';
import { fetchAttendance } from '../lib/attendance.js';
import { computePayroll, payrollConfig } from '../lib/payroll.js';
import { payrollExport } from '../lib/excel.js';
import { approveRun, getRun, diffAgainstRun } from '../lib/payroll-runs.js';
import { adjustmentsInRange, applyAll } from '../lib/adjustments.js';
import { openTypedConfirm } from '../components/review-modals.js';
import { go, isStale, rerender } from '../lib/nav.js';
import { card, empty, tableWrap, grid, stat, sectionHead, button, callout } from '../lib/ui.js';

export async function render(view, token) {
  const cycles = recentCyclesList(12);
  const cfg = payrollConfig();

  const head = card('مسير الرواتب — الدورة من 26 إلى 25', null, 'money',
    `قيمة اليوم = الراتب ÷ ${cfg.daysPerMonth} · قيمة الساعة = قيمة اليوم ÷ ${cfg.hoursPerDay}. ` +
    'الخصم بالساعات للتأخير والخروج المبكر، والغياب بخصم يوم كامل. المصدر: بصمات جهاز ZKTeco فقط.');
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
    let recs = [];
    try { await refreshUsers(); recs = await fetchAttendance(cyc, 'zkAttendance'); }
    catch (e) { console.error(e); host.innerHTML = '<div class="card"><div class="empty">تعذّر التحميل — تأكد من نشر قواعد الأمان</div></div>'; return; }
    if (isStale(token)) return;

    /* التصحيحات اليدوية تُطبَّق فوق سجلات الجهاز قبل الحساب — الأصل في
       zkAttendance لا يُمسّ، والقيد يُقرأ فوقه. */
    let adjs = [];
    try { adjs = await adjustmentsInRange(ymd(cyc.start), ymd(cyc.end)); }
    catch (e) { console.error('adjustments', e); }
    if (isStale(token)) return;
    recs = applyAll(recs, adjs);

    let run = null;
    try { run = await getRun(cyc.key); } catch (e) { console.error('run', e); }
    if (isStale(token)) return;

    const rowsPay = computePayroll(cyc, getUsers(), getRequests(), recs);
    const noSalary = rowsPay.filter((r) => !r.salary).length;
    const tot = rowsPay.reduce((a, r) => ({
      salary: a.salary + r.salary, dedHours: a.dedHours + r.dedHours, dedAbsent: a.dedAbsent + r.dedAbsent,
      dedUnpaid: a.dedUnpaid + r.dedUnpaid, total: a.total + r.total, net: a.net + r.net,
      lateMin: a.lateMin + r.lateMin, earlyMin: a.earlyMin + r.earlyMin, missingOut: a.missingOut + r.missingOut
    }), { salary: 0, dedHours: 0, dedAbsent: 0, dedUnpaid: 0, total: 0, net: 0, lateMin: 0, earlyMin: 0, missingOut: 0 });

    host.innerHTML = '';

    /* ═══ حالة الاعتماد ═══
       ⚠️ بعد الاعتماد نقارن اللقطة بالحساب الحالي. أي فرق يعني أن بيانات
       الدورة تغيّرت بعد الصرف — وردية عُدِّلت، عطلة أُضيفت، بصمة صُحِّحت.
       الفرق يُعرض صراحةً بدل أن يبتلعه الرقم بصمت، وهذا هو أصل الميزة. */
    if (run) {
      const drift = diffAgainstRun(run, rowsPay);
      const bn = el('div', 'run-banner' + (drift.length ? ' run-banner--drift' : ''));
      bn.innerHTML = icon(drift.length ? 'alert' : 'shield') +
        `<div><b>${drift.length ? 'مسير معتمَد — لكن البيانات تغيّرت بعده' : 'مسير معتمَد ومجمَّد'}</b>
         <div class="help">اعتمده ${esc(run.approvedBy)} · ${fmtDT(run.approvedAt)} ·
         المستحق وقت الاعتماد <b class="num">${money(run.totals.net)}</b></div></div>`;
      host.appendChild(bn);
      if (drift.length) {
        const dc = card('فروق ظهرت بعد الاعتماد', 'الأرقام أدناه محسوبة الآن — المعتمَد هو ما في اللقطة.', 'alert');
        dc.appendChild(tableWrap(`
          <table class="tight">
            <thead><tr><th>الموظف</th><th>المعتمَد</th><th>المحسوب الآن</th><th>الفرق</th></tr></thead>
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
        : button('اعتماد المسير وتجميده', 'btn sm', () => confirmApprove(cyc, rowsPay), 'shield')));

    if (!rowsPay.length) { c.appendChild(empty('لا يوجد موظفون')); host.appendChild(c); return; }

    const wrap = tableWrap(`
      <table class="tight payroll-table">
        <thead><tr>
          <th>الموظف</th><th>القسم</th><th>الراتب</th><th>قيمة الساعة</th>
          <th>أيام العمل</th><th>حضور</th><th>غياب</th><th>إجازة مدفوعة</th><th>بدون راتب</th>
          <th>تأخير</th><th>خروج مبكر</th><th>خصم ساعات</th><th>خصم غياب</th><th>إجمالي الخصم</th><th>المستحق</th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = wrap.querySelector('tbody');

    rowsPay.forEach((r) => {
      const tr = el('tr', 'row-clickable');
      tr.innerHTML = `
        <td><b>${esc(r.u.name)}</b>${r.missingOut ? ` <span class="pill pill--dot missing">${r.missingOut} بلا انصراف</span>` : ''}</td>
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
function confirmApprove(cyc, rowsPay) {
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
      await approveRun(cyc, rowsPay);
      toast('اعتُمد المسير وجُمِّد', 'ok');
      rerender();
    }
  });
}
