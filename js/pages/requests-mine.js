import { el } from '../lib/dom.js';
import { getMe, getRequests } from '../lib/state.js';
import { requestCard } from '../components/request-card.js';
import { go } from '../lib/nav.js';
import { card, empty, button } from '../lib/ui.js';

/* مدير القسم يرى طلبات قسمه كلها في الكاش، فنفصل طلباته هو */
export function ownRequests() {
  const me = getMe();
  const all = getRequests();
  return me.role === 'manager' ? all.filter((r) => r.employeeUid === me.id) : all;
}

export function render(view) {
  const MY = ownRequests();

  if (!MY.length) {
    const c = card('');
    c.appendChild(empty('لا توجد طلبات بعد', '📭'));
    c.appendChild(button('➕ تقديم طلب', 'btn sm', () => go('new')));
    view.appendChild(c);
    return;
  }

  const filt = el('div', 'filters');
  filt.innerHTML = `
    <div class="field"><label for="fStatus">الحالة</label>
      <select id="fStatus">
        <option value="">الكل</option>
        <option value="pending">تحت المراجعة</option>
        <option value="approved">تمت الموافقة</option>
        <option value="rejected">مرفوض</option>
        <option value="cancelled">ملغي</option>
      </select></div>
    <div class="field"><label for="fType">النوع</label>
      <select id="fType">
        <option value="">الكل</option>
        <option value="permission">استئذان</option>
        <option value="leave">إجازة</option>
      </select></div>`;
  view.appendChild(filt);

  const host = el('div', '');
  view.appendChild(host);

  const draw = () => {
    host.innerHTML = '';
    const st = filt.querySelector('#fStatus').value;
    const ty = filt.querySelector('#fType').value;
    const list = MY.filter((r) => (!st || r.status === st) && (!ty || r.type === ty));
    if (!list.length) { host.appendChild(empty('لا نتائج مطابقة')); return; }
    host.appendChild(el('p', 'desc', `${list.length} من ${MY.length} طلب`));
    list.forEach((r) => host.appendChild(requestCard(r, false)));
  };
  filt.querySelector('#fStatus').onchange = draw;
  filt.querySelector('#fType').onchange = draw;
  draw();
}
