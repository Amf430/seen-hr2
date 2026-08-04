/* ═══════════════════════════════════════════════════════════════════════════
   الأيقونات — مجموعة خطّية واحدة.

   لماذا استُبدلت الإيموجي (📊 💵 📥 🟢 …):
     • شكلها يختلف بين ويندوز وآيفون وأندرويد — فالنظام يبدو مختلفاً لكل موظف
     • لا تأخذ لون النص، فتبقى ملوّنة داخل زر عنّابي أو شريط جانبي داكن
     • قارئ الشاشة ينطقها حرفياً: «رسم بياني مع اتجاه صاعد» قبل كل عنوان
     • لا وزن لها ولا سماكة، فلا تنسجم مع خط Tajawal

   المجموعة هنا: سماكة 1.6 بكسل، نهايات دائرية، ترث currentColor — فتتلوّن
   تلقائياً مع النص أينما وُضعت. المقاس يُضبط من CSS لا من الوسم.

   ⚠️ الأيقونة زخرفية دائماً: كل استدعاء يضع aria-hidden، والمعنى يأتي من
   النص المجاور. لا تستعمل أيقونة وحدها بلا نص أو aria-label على الحاوية.
   ═══════════════════════════════════════════════════════════════════════════ */

const P = {
  /* ── التنقّل ── */
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  home:      '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
  globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z"/>',
  finger:    '<path d="M12 3a6 6 0 0 0-6 6v3"/><path d="M18 9a6 6 0 0 0-3-5.2"/><path d="M9 10a3 3 0 0 1 6 0v4"/><path d="M12 10v6"/><path d="M6.5 15c0 3 1 5 2.5 6"/><path d="M17.5 13c0 4-1 6.5-2.5 8"/>',
  inbox:     '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M4.5 6.5 3 13v5.5A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5V13l-1.5-6.5A2 2 0 0 0 17.6 5H6.4a2 2 0 0 0-1.9 1.5Z"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  list:      '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  chart:     '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  people:    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16.5 11.5h5M19 9v5"/>',
  building:  '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  money:     '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9v6M18 9v6"/>',
  scale:     '<path d="M12 4v16M7 20h10"/><path d="M4 9h6l-3-4z"/><path d="M14 9h6l-3-4z"/><path d="M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3M14 9c0 1.7 1.3 3 3 3s3-1.3 3-3"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  archive:   '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9"/><path d="M10 13h4"/>',
  pin:       '<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  tag:       '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5 12.5 20 3 12.5Z"/><circle cx="8" cy="8" r="1.4"/>',
  /* الهيكل التنظيمي: صندوق فوق وصندوقان تحته بخطوط تفرّع */
  network:   '<rect x="9" y="3" width="6" height="4.5" rx="1"/><rect x="2.5" y="16.5" width="6" height="4.5" rx="1"/><rect x="15.5" y="16.5" width="6" height="4.5" rx="1"/><path d="M12 7.5v4M5.5 16.5v-2.2a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v2.2"/>',

  /* ── الحالة والإجراءات ── */
  dot:       '<circle cx="12" cy="12" r="4.5"/>',
  check:     '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  x:         '<path d="M6 6l12 12M18 6 6 18"/>',
  alert:     '<path d="M12 3.5 22 20H2L12 3.5Z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  info:      '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  doc:       '<path d="M14 3v5h5"/><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z"/>',
  gap:       '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M9 12h6"/>',
  camera:    '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.3-2h6l1.3 2h2.7A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-10Z"/><circle cx="12" cy="13" r="3.6"/>',
  map:       '<path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z"/><path d="M9 4v14M15 6.5v14"/>',
  download:  '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 18v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  search:    '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  more:      '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  trash:     '<path d="M4 7h16"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7"/><path d="M10 11v6M14 11v6"/>',
  back:      '<path d="m14 6-6 6 6 6"/>',
  logout:    '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8 6 12l4 4M6 12h9"/>',
  login:     '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  gear:      '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"/>',
  shield:    '<path d="M12 3 4.5 6v6c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>'
};

/* ── التوليد ──
   viewBox ثابت 24×24، والمقاس من CSS عبر .ic — فتغيير الحجم مكان واحد. */
export function icon(name, cls = '') {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const hasIcon = (name) => !!P[name];
export { P as ICON_PATHS };
