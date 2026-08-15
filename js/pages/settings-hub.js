/* ═══════════════════════════════════════════════════════════════════════════
   الإعدادات — بطاقة لكل إعداد.

   سبب وجودها: كانت الإعدادات السبعة سبعة روابط في الشريط الجانبي موزّعة على
   ثلاث مجموعات — set-org في «شؤون الموظفين» و set-payroll في «الرواتب»
   وخمسة في «الإعدادات». فكان الأدمن يبحث عن إعداد في ثلاثة أماكن، وكانت
   قائمته ٢٤ رابطاً لا يظهر نصفها إلا بتمرير.

   ⚠️ البطاقات تُشتقّ من SETTINGS_PAGES في js/config/pages.js — نفس المصفوفة
   التي تمنح الصفحات حقّ الفتح في DETAIL_PAGES. كتابتها هنا من جديد تعني
   قائمتين تتباعدان: إعداد يظهر بطاقةً ولا يُفتح، أو يُفتح ولا تراه.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { go } from '../lib/nav.js';
import { SETTINGS_PAGES, PAGES } from '../config/pages.js';

export function render(view) {
  const grid = el('div', 'grid cols-3 settings-hub');

  for (const s of SETTINGS_PAGES) {
    const meta = PAGES[s.id] || { title: s.label, hint: '' };
    /* رابط حقيقي بوجهة حقيقية: يُركَّز بالكيبورد، وينطقه قارئ الشاشة رابطاً،
       ويفتحه النقر الأوسط في تبويب — وهو ما لا يعطيه <div> بـ onclick. */
    const a = el('a', 'card settings-hub__item',
      `<span class="settings-hub__ic">${icon(s.icon)}</span>` +
      `<span class="settings-hub__body">` +
        `<b class="settings-hub__title">${esc(meta.title)}</b>` +
        `<span class="settings-hub__hint">${esc(meta.hint || '')}</span>` +
      `</span>`);
    a.setAttribute('href', '#' + encodeURIComponent(s.id));
    /* go() ليدخل الإعداد مكدّس الرجوع، فيعود زرّ «رجوع» إلى الإعدادات لا للرئيسية */
    a.onclick = (e) => { e.preventDefault(); go(s.id); };
    grid.appendChild(a);
  }

  view.appendChild(grid);
}
