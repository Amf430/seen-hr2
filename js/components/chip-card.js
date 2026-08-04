/* ═══════════════════════════════════════════════════════════════════════════
   بطاقة قائمة قابلة للإضافة والحذف — تُستخدم لأسباب الاستئذان وجهات الاعتماد.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, uid, toast } from '../lib/dom.js';
import { getSettings } from '../lib/state.js';
import { saveSettings } from '../lib/settings.js';

export function chipCard({ title, icon, key, fields, labels, renderItem, build }) {
  const S = getSettings();
  const card = el('div', 'card');
  card.appendChild(el('h3', '', `${icon} ${esc(title)}`));
  const chips = el('div', 'chips');
  card.appendChild(chips);

  const draw = () => {
    chips.innerHTML = '';
    const list = S[key] || [];
    if (!list.length) { chips.appendChild(el('span', 'desc', 'لا توجد عناصر.')); return; }
    list.forEach((item) => {
      const c = el('span', 'chip', renderItem(item));
      const x = el('button', 'chip__x', '×');
      x.setAttribute('aria-label', 'حذف');
      x.onclick = async () => {
        S[key] = (S[key] || []).filter((z) => z.id !== item.id);
        await saveSettings();
        draw();
      };
      c.appendChild(x);
      chips.appendChild(c);
    });
  };
  draw();

  const add = el('div', 'add-inline');
  add.innerHTML = fields.map((f, i) =>
    `<div class="field"><label for="add_${key}_${f}">${esc(labels[i])}</label><input id="add_${key}_${f}"></div>`).join('');
  const btn = el('button', 'btn sm', 'إضافة');
  btn.onclick = async () => {
    const vals = {}; let ok = true;
    fields.forEach((f) => {
      const v = add.querySelector('#add_' + key + '_' + f).value.trim();
      if (!v) ok = false;
      vals[f] = v;
    });
    if (!ok) { toast('أكمل الحقول', 'err'); return; }
    S[key] = S[key] || [];
    S[key].push(build(vals, uid));
    await saveSettings();
    draw();
    fields.forEach((f) => { add.querySelector('#add_' + key + '_' + f).value = ''; });
    toast('أُضيف', 'ok');
  };
  add.appendChild(btn);
  card.appendChild(add);
  return card;
}
