import { el, esc } from '../lib/dom.js';
import { getMe, getRequests } from '../lib/state.js';
import { canApprove, canApproveType } from '../lib/perms.js';
import { requestCard } from '../components/request-card.js';
import { empty, callout } from '../lib/ui.js';

/* ⚠️ حالة الفرز خارج render عمداً.
   كل موافقة تكتب في Firestore، فيُطلق الاشتراك اللحظي إعادة عرض الصفحة —
   وكانت تُعيد بناء الفلاتر بقيمها الافتراضية، فيضيع ما اختاره المراجع وما
   كتبه في البحث في اللحظة التي يشتغل فيها. */
const filterState = { status: 'pending', type: '', search: '' };

export function render(view) {
  const me = getMe();

  const filt = el('div', 'filters');
  filt.innerHTML = `
    <div class="field"><label for="fStatus">الحالة</label>
      <select id="fStatus">
        <option value="pending">تحت المراجعة</option>
        <option value="">الكل</option>
        <option value="approved">موافق عليها</option>
        <option value="rejected">مرفوضة</option>
      </select></div>
    <div class="field"><label for="fType">النوع</label>
      <select id="fType">
        <option value="">الكل</option>
        <option value="permission">استئذان</option>
        <option value="leave">إجازة</option>
      </select></div>
    <div class="field grow"><label for="fSearch">بحث بالاسم</label>
      <input id="fSearch" placeholder="اسم الموظف…"></div>`;
  view.appendChild(filt);

  if (me.role === 'manager') {
    view.appendChild(callout('info',
      `صلاحيتك: استئذانات قسم «${me.department || '—'}»`,
      'طلبات الإجازة يعتمدها مدير الموارد البشرية لأنها تُعدّل أرصدة الموظف.'));
  }

  /* استرجاع الحالة المحفوظة قبل أول رسم */
  filt.querySelector('#fStatus').value = filterState.status;
  filt.querySelector('#fType').value   = filterState.type;
  filt.querySelector('#fSearch').value = filterState.search;

  const host = el('div', '');
  view.appendChild(host);

  const draw = () => {
    host.innerHTML = '';
    const st = filt.querySelector('#fStatus').value;
    const ty = filt.querySelector('#fType').value;
    const s  = filt.querySelector('#fSearch').value.trim();
    filterState.status = st; filterState.type = ty; filterState.search = filt.querySelector('#fSearch').value;

    let list = getRequests().filter((r) => (!st || r.status === st) && (!ty || r.type === ty));
    if (me.role === 'manager') list = list.filter((r) => canApprove(r));
    if (s) list = list.filter((r) => (r.employeeName || '').includes(s));

    if (!list.length) { host.appendChild(empty('لا طلبات مطابقة', '📭')); return; }

    /* ما يستطيع اعتماده فعلاً يأتي أولاً */
    const actionable = list.filter((r) => r.status === 'pending' && canApproveType(r));
    const rest = list.filter((r) => !actionable.includes(r));

    if (actionable.length) {
      host.appendChild(el('h3', 'section-title', `بانتظار قرارك (${actionable.length})`));
      actionable.forEach((r) => host.appendChild(requestCard(r, true)));
    }
    if (rest.length) {
      if (actionable.length) host.appendChild(el('h3', 'section-title', 'بقية الطلبات'));
      rest.forEach((r) => host.appendChild(requestCard(r, true)));
    }
  };

  ['fStatus', 'fType'].forEach((id) => { filt.querySelector('#' + id).onchange = draw; });
  filt.querySelector('#fSearch').oninput = draw;
  draw();
}
