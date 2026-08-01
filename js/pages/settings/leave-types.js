import { el, esc, uid, toast } from '../../lib/dom.js';
import { getSettings } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { chipCard } from '../../components/chip-card.js';
import { card, empty, button } from '../../lib/ui.js';

export function render(view) {
  const S = getSettings();

  /* أسباب الاستئذان */
  view.appendChild(chipCard({
    title: 'أسباب الاستئذان', icon: '🕐', key: 'permissionReasons',
    fields: ['label'], labels: ['السبب'],
    renderItem: (item) => esc(item.label),
    build: (vals, mkId) => ({ id: mkId(), label: vals.label })
  }));

  /* أنواع الإجازات */
  const lc = card('🏖️ أنواع الإجازات',
    'الرصيد = عدد الأيام السنوية. «يُخصم من الرصيد» يقلّل رصيد الموظف عند الموافقة. «بدون راتب» تعني أن اليوم يُخصم من الراتب في المسير.');
  const chips = el('div', 'chips');
  lc.appendChild(chips);

  const draw = () => {
    chips.innerHTML = '';
    const list = S.leaveTypes || [];
    if (!list.length) { chips.appendChild(el('span', 'desc', 'لا توجد أنواع.')); return; }
    list.forEach((t) => {
      const unpaid = (t.unpaid !== undefined) ? !!t.unpaid : /بدون\s*راتب/.test(t.label || '');
      const c = el('span', 'chip',
        `${esc(t.label)} <small>${t.deduct ? 'رصيد ' + esc(t.balance) : 'بدون خصم رصيد'} · ${unpaid ? '❌ بدون راتب' : '💰 مدفوعة'}</small>`);
      const tg = el('button', 'chip__act', unpaid ? '💰' : '🚫');
      tg.title = unpaid ? 'اجعلها مدفوعة' : 'اجعلها بدون راتب';
      tg.onclick = async () => {
        t.unpaid = !unpaid;
        await saveSettings(); draw();
        toast(t.unpaid ? 'صارت بدون راتب' : 'صارت مدفوعة', 'ok');
      };
      const x = el('button', 'chip__x', '×');
      x.setAttribute('aria-label', 'حذف');
      x.onclick = async () => {
        S.leaveTypes = (S.leaveTypes || []).filter((z) => z.id !== t.id);
        await saveSettings(); draw();
      };
      c.append(tg, x);
      chips.appendChild(c);
    });
  };
  draw();

  const add = el('div', 'add-inline');
  add.innerHTML = `
    <div class="field grow"><label for="nlName">نوع الإجازة</label>
      <input id="nlName" placeholder="مثال: إجازة سنوية"></div>
    <div class="field"><label for="nlBal">الرصيد (يوم)</label>
      <input id="nlBal" type="number" value="0" min="0"></div>
    <div class="field"><label for="nlDed">يُخصم من الرصيد؟</label>
      <select id="nlDed"><option value="true">نعم</option><option value="false">لا</option></select></div>
    <div class="field"><label for="nlPaid">مدفوعة الراتب؟</label>
      <select id="nlPaid"><option value="true">مدفوعة</option><option value="false">بدون راتب</option></select></div>`;
  add.appendChild(button('إضافة', 'btn sm', async () => {
    const n = add.querySelector('#nlName').value.trim();
    if (!n) { toast('اكتب اسم النوع', 'err'); return; }
    S.leaveTypes = S.leaveTypes || [];
    S.leaveTypes.push({
      id: uid(), label: n,
      balance: parseInt(add.querySelector('#nlBal').value, 10) || 0,
      deduct: add.querySelector('#nlDed').value === 'true',
      unpaid: add.querySelector('#nlPaid').value === 'false'
    });
    await saveSettings();
    draw();
    add.querySelector('#nlName').value = '';
    toast('أُضيف', 'ok');
  }));
  lc.appendChild(add);
  view.appendChild(lc);

  /* جهات الاعتماد */
  view.appendChild(chipCard({
    title: 'جهات الاعتماد (المُستأذَن منهم)', icon: '✅', key: 'approvers',
    fields: ['name'], labels: ['الاسم / الجهة'],
    renderItem: (item) => esc(item.name),
    build: (vals, mkId) => ({ id: mkId(), name: vals.name })
  }));

  if (!(S.approvers || []).length) {
    const w = card('');
    w.appendChild(empty('بدون جهة اعتماد واحدة على الأقل، ما يقدر أي موظف يقدّم طلباً.', '⚠️'));
    view.appendChild(w);
  }
}
