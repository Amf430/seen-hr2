import { el, esc, toast } from '../lib/dom.js';
import { getRequests } from '../lib/state.js';
import { cycleOf, reqEventDate, requestsInCycle, STATUS_AR } from '../lib/dates.js';
import { fmtDate } from '../lib/format.js';
import { monthlyExport } from '../lib/excel.js';
import { deleteRequests } from '../lib/requests.js';
import { logAction } from '../lib/audit.js';
import { openTypedConfirm } from '../components/review-modals.js';
import { rerender } from '../lib/nav.js';
import { card, empty, tableWrap, grid, stat, sectionHead, button } from '../lib/ui.js';

export function render(view) {
  const all = getRequests();
  const cur = cycleOf(new Date());
  const map = new Map(); map.set(cur.key, cur);
  all.forEach((r) => { const c = cycleOf(reqEventDate(r)); map.set(c.key, c); });
  const cycles = [...map.values()].sort((a, b) => b.start - a.start);

  const sel = card('اختر الدورة الشهرية', null, 'calendar',
    'كل دورة تبدأ يوم 26 وتنتهي يوم 25 من الشهر التالي. تُصنَّف الطلبات حسب تاريخ الاستئذان أو بداية الإجازة.');
  const dd = el('select', 'select-lg');
  dd.innerHTML = cycles.map((c) =>
    `<option value="${esc(c.key)}">${esc(c.label)}${c.key === cur.key ? ' (الحالية)' : ''}</option>`).join('');
  sel.appendChild(dd);
  view.appendChild(sel);

  const host = el('div', '');
  view.appendChild(host);

  const draw = () => {
    host.innerHTML = '';
    const cyc = cycles.find((c) => c.key === dd.value) || cur;
    const list = requestsInCycle(cyc, all);
    const perms = list.filter((r) => r.type === 'permission');
    const leaves = list.filter((r) => r.type === 'leave');
    const approvedDays = leaves.filter((r) => r.status === 'approved').reduce((s, r) => s + (r.days || 0), 0);

    const g = grid(4);
    g.append(
      stat(list.length, 'إجمالي الطلبات'),
      stat(perms.length, 'استئذانات'),
      stat(leaves.length, 'إجازات'),
      stat(approvedDays, 'أيام إجازة معتمدة', 'g')
    );
    host.appendChild(g);

    const g2 = grid(3);
    g2.append(
      stat(list.filter((r) => r.status === 'approved').length, 'موافق عليها', 'g'),
      stat(list.filter((r) => r.status === 'rejected').length, 'مرفوضة', 'r'),
      stat(list.filter((r) => r.status === 'pending').length, 'تحت المراجعة', 'a')
    );
    host.appendChild(g2);

    const c = card('');
    c.appendChild(sectionHead(`تفاصيل الدورة — ${cyc.label}`,
      button('تصدير Excel', 'btn sm', () => monthlyExport(cyc, all, 'download')),
      button('مسح بيانات الدورة', 'btn sm danger', () => clearCycle(cyc, list, 'trash'))));

    if (!list.length) c.appendChild(empty('لا توجد طلبات في هذه الدورة', 'inbox'));
    else c.appendChild(tableWrap(`
      <table>
        <thead><tr><th>الموظف</th><th>النوع</th><th>التصنيف</th><th>التاريخ</th><th>الأيام</th><th>الحالة</th></tr></thead>
        <tbody>${list.map((r) => `<tr>
          <td><b>${esc(r.employeeName)}</b></td>
          <td>${r.type === 'permission' ? 'استئذان' : 'إجازة'}</td>
          <td>${esc(r.categoryLabel)}</td>
          <td class="num">${r.type === 'permission' ? fmtDate(r.date) : fmtDate(r.startDate) + ' ← ' + fmtDate(r.endDate)}</td>
          <td class="num">${r.type === 'leave' ? r.days : '—'}</td>
          <td><span class="pill pill--dot ${esc(r.status)}">${esc(STATUS_AR[r.status])}</span></td></tr>`).join('')}</tbody>
      </table>`));
    host.appendChild(c);
  };

  dd.onchange = draw;
  draw();
}

/* ⚠️ حذف نهائي بلا رجعة. النسخة القديمة كانت تكتفي بنافذتي confirm()
   متتاليتين — هنا لازم يكتب الأدمن كلمة «مسح» بيده. */
function clearCycle(cyc, list) {
  if (!list.length) { toast('لا توجد بيانات لمسحها في هذه الدورة', 'err'); return; }
  openTypedConfirm({
    title: 'مسح بيانات الدورة',
    body: `سيُحذف <b>${list.length}</b> طلب نهائياً من دورة «${esc(cyc.label)}» — استئذانات وإجازات.
           <br><br>لا يمكن التراجع عن هذا الإجراء إطلاقاً.
           <br>صدّر التقرير أولاً لو تحتاج نسخة.`,
    phrase: 'مسح',
    confirmLabel: 'حذف نهائي',
    run: async () => {
      const n = await deleteRequests(list);
      await logAction('مسح بيانات دورة', `${cyc.label} — ${n} طلب`);
      toast('تم مسح بيانات الدورة', 'ok');
      rerender();
    }
  });
}
