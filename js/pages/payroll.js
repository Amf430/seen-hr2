import { el, esc } from '../lib/dom.js';
import { getUsers, getRequests, setProfileUid } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList } from '../lib/dates.js';
import { money, hhmm } from '../lib/format.js';
import { fetchAttendance } from '../lib/attendance.js';
import { computePayroll, payrollConfig } from '../lib/payroll.js';
import { payrollExport } from '../lib/excel.js';
import { go, isStale } from '../lib/nav.js';
import { card, empty, tableWrap, grid, stat, sectionHead, button, callout } from '../lib/ui.js';

export async function render(view, token) {
  const cycles = recentCyclesList(12);
  const cfg = payrollConfig();

  const head = card('💵 مسير الرواتب — الدورة من 26 إلى 25',
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

    const rowsPay = computePayroll(cyc, getUsers(), getRequests(), recs);
    const noSalary = rowsPay.filter((r) => !r.salary).length;
    const tot = rowsPay.reduce((a, r) => ({
      salary: a.salary + r.salary, dedHours: a.dedHours + r.dedHours, dedAbsent: a.dedAbsent + r.dedAbsent,
      dedUnpaid: a.dedUnpaid + r.dedUnpaid, total: a.total + r.total, net: a.net + r.net,
      lateMin: a.lateMin + r.lateMin, earlyMin: a.earlyMin + r.earlyMin, missingOut: a.missingOut + r.missingOut
    }), { salary: 0, dedHours: 0, dedAbsent: 0, dedUnpaid: 0, total: 0, net: 0, lateMin: 0, earlyMin: 0, missingOut: 0 });

    host.innerHTML = '';

    if (+dd.value === 0)
      host.appendChild(callout('warn', '⚠️ الدورة الحالية لم تنتهِ بعد',
        'الأرقام تُحسب حتى اليوم فقط، وستتغيّر حتى تاريخ 25.'));
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
      button('⬇️ تصدير المسير (Excel)', 'btn sm', () => payrollExport(cyc, rowsPay))));

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
        <td><b>${esc(r.u.name)}</b>${r.missingOut ? ` <span class="pill missing">${r.missingOut} بلا انصراف</span>` : ''}</td>
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
      tr.onclick = () => { setProfileUid(r.u.id); go('profile'); };
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
