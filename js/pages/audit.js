import { el, esc } from '../lib/dom.js';
import { fmtDT } from '../lib/format.js';
import { fetchAuditLog } from '../lib/audit.js';
import { isStale } from '../lib/nav.js';
import { card, tableWrap, empty } from '../lib/ui.js';

export async function render(view, token) {
  const c = card('🗂️ آخر الحركات', 'السجل «إضافة فقط» — لا يُعدَّل ولا يُحذف، حتى من مدير النظام.');
  const host = el('div', '', '<div class="empty"><span class="spinner"></span> جارٍ التحميل…</div>');
  c.appendChild(host);
  view.appendChild(c);

  let logs;
  try { logs = await fetchAuditLog(100); }
  catch (e) { console.error(e); host.innerHTML = ''; host.appendChild(empty('تعذّر تحميل السجل')); return; }
  if (isStale(token)) return;

  host.innerHTML = '';
  if (!logs.length) { host.appendChild(empty('لا حركات بعد')); return; }

  host.appendChild(tableWrap(`
    <table>
      <thead><tr><th>الحركة</th><th>التفاصيل</th><th>بواسطة</th><th>الوقت</th></tr></thead>
      <tbody>${logs.map((l) => `<tr>
        <td><b>${esc(l.action)}</b></td>
        <td>${esc(l.detail)}</td>
        <td>${esc(l.byName)}</td>
        <td class="num">${fmtDT(l.at)}</td>
      </tr>`).join('')}</tbody>
    </table>`));
  host.appendChild(el('p', 'help', `أحدث ${logs.length} حركة.`));
}
