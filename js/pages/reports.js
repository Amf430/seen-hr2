import { el, esc } from '../lib/dom.js';
import { getRequests } from '../lib/state.js';
import { card, grid, stat, tableWrap, empty, sectionHead, button } from '../lib/ui.js';
import { exportRequests } from '../lib/excel.js';
import { STATUS_AR } from '../lib/dates.js';

export function render(view) {
  const reqs = getRequests();
  const byType = (t) => reqs.filter((r) => r.type === t).length;

  const g = grid(4);
  g.append(
    stat(byType('permission'), 'طلبات استئذان'),
    stat(byType('leave'), 'طلبات إجازة'),
    stat(reqs.filter((r) => r.status === 'approved').length, 'موافق عليها', 'g'),
    stat(reqs.filter((r) => r.status === 'rejected').length, 'مرفوضة', 'r')
  );
  view.appendChild(g);

  /* الطلبات حسب الموظف */
  const c = card('👤 الطلبات حسب الموظف');
  const counts = {};
  reqs.forEach((r) => { counts[r.employeeName] = (counts[r.employeeName] || 0) + 1; });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!rows.length) c.appendChild(empty('لا بيانات'));
  else c.appendChild(tableWrap(`
    <table>
      <thead><tr><th>الموظف</th><th>عدد الطلبات</th></tr></thead>
      <tbody>${rows.map(([n, k]) => `<tr><td>${esc(n)}</td><td class="num"><b>${k}</b></td></tr>`).join('')}</tbody>
    </table>`));
  view.appendChild(c);

  /* حسب التصنيف */
  const byCat = {};
  reqs.forEach((r) => {
    const k = (r.type === 'permission' ? 'استئذان: ' : 'إجازة: ') + (r.categoryLabel || '—');
    byCat[k] = (byCat[k] || 0) + 1;
  });
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (catRows.length) {
    const cc = card('🏷️ الطلبات حسب التصنيف');
    cc.appendChild(tableWrap(`
      <table>
        <thead><tr><th>التصنيف</th><th>العدد</th></tr></thead>
        <tbody>${catRows.map(([n, k]) => `<tr><td>${esc(n)}</td><td class="num"><b>${k}</b></td></tr>`).join('')}</tbody>
      </table>`));
    view.appendChild(cc);
  }

  const exp = card('', '');
  exp.appendChild(sectionHead('📤 تصدير البيانات',
    button('⬇️ تصدير الطلبات (Excel)', 'btn sm', () => exportRequests(getRequests()))));
  exp.appendChild(el('p', 'desc', 'تصدير جميع الطلبات إلى ملف Excel جاهز للطباعة أو الأرشفة.'));
  view.appendChild(exp);
}

export { STATUS_AR };
