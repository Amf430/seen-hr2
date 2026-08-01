/* ═══════════════════════════════════════════════════════════════════════════
   لبنات الواجهة المشتركة.

   ⚠️ كل نص متغيّر يمرّ عبر esc(). النسخة القديمة كانت تمرّر التسميات مباشرة
   في stat() (السطر 918) و contractCell() (1244)، وكلاهما يعرض بيانات يكتبها
   المستخدم — وهذا يكفي لحقن كود في صفحة الأدمن.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from './dom.js';
import { contractDaysLeft } from './dates.js';
import { icon } from './icons.js';

/* بطاقة رقم */
export function stat(n, label, cls = '') {
  return el('div', 'stat ' + cls,
    `<div class="n">${esc(n)}</div><div class="l">${esc(label)}</div>`);
}

/* صف مفتاح/قيمة */
export function detailLine(k, v, opts = {}) {
  const cls = opts.cls ? ` class="${esc(opts.cls)}"` : '';
  return `<div class="detail-line"><span class="k">${esc(k)}</span><span class="v"${cls}>${opts.html || esc(v)}</span></div>`;
}

/* شبكة */
export const grid = (cols) => el('div', 'grid cols-' + cols);

/* بطاقة بعنوان ووصف.
   ⚠️ ico اسم أيقونة اختياري (مثل 'money')، يحلّ محلّ الإيموجي الذي كان
   يُلصق داخل نصّ العنوان — فيبقى العنوان نصّاً نظيفاً لقارئ الشاشة. */
export function card(title, desc, ico) {
  const c = el('div', 'card');
  if (title) c.appendChild(el('h3', '', (ico ? icon(ico) : '') + esc(title)));
  if (desc)  c.appendChild(el('p', 'desc', esc(desc)));
  return c;
}

/* عنوان قسم مع أزرار على اليسار */
export function sectionHead(title, ...buttons) {
  const bar = el('div', 'row-between');
  const ico = typeof title === 'object' ? title.icon : null;
  const txt = typeof title === 'object' ? title.text : title;
  bar.appendChild(el('h3', '', (ico ? icon(ico) : '') + esc(txt)));
  if (buttons.length) {
    const cluster = el('div', 'cluster');
    buttons.filter(Boolean).forEach((b) => cluster.appendChild(b));
    bar.appendChild(cluster);
  }
  return bar;
}

/* ico اسم أيقونة اختياري — يسبق النص داخل الزر */
export function button(label, cls = 'btn sm', onClick, ico) {
  const b = el('button', cls, (ico ? icon(ico) : '') + esc(label));
  if (onClick) b.onclick = onClick;
  return b;
}

/* الحالة الفارغة — ico اسم أيقونة، والأيقونة زخرفية والنص هو الرسالة */
export const empty = (msg, ico = '') =>
  el('div', 'empty', (ico ? `<div class="big">${icon(ico, 'ic--empty')}</div>` : '') + esc(msg));

export const loading = (msg = 'جارٍ التحميل…') =>
  el('div', 'card', `<div class="empty"><span class="spinner"></span> ${esc(msg)}</div>`);

export const callout = (kind, title, help) =>
  el('div', 'callout callout--' + kind,
    `<b class="callout__title">${esc(title)}</b>${help ? `<div class="help">${esc(help)}</div>` : ''}`);

/* حاوية جدول تمرّر أفقياً داخل نفسها — الصفحة نفسها لا تتمرّر أبداً */
export function tableWrap(html) {
  const w = el('div', 'table-wrap');
  w.innerHTML = html;
  return w;
}

/* خلية انتهاء العقد — كانت تُدرج dateStr بلا تهريب في النسخة القديمة */
export function contractCell(dateStr) {
  const n = contractDaysLeft(dateStr);
  if (n === null) return '—';
  if (n < 0)   return `<span class="pill pill--dot rejected">منتهي (${Math.abs(n)} يوم)</span>`;
  if (n <= 60) return `<span class="pill pill--dot pending">${esc(dateStr)} · ${n} يوم</span>`;
  return `<span class="muted">${esc(dateStr)}</span>`;
}

/* قائمة منسدلة كبيرة (اختيار الدورة) */
export function bigSelect(options, selectedIndex = 0) {
  const s = el('select', 'select-lg');
  s.innerHTML = options.map((o, i) =>
    `<option value="${i}"${i === selectedIndex ? ' selected' : ''}>${esc(o)}</option>`).join('');
  return s;
}

/* شريط تقدّم */
export function bar(pct, color) {
  return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%;background:${color}"></i></div>`;
}

/* ═══════════════════ شريط النبض ═══════════════════

   يحلّ محل أربع شبكات stat متساوية الوزن في لوحة القيادة. الخلية الأولى
   (lead:true) أعرض وبأرضية عنّابية فاتحة — هي الرقم الذي يُفتح النظام لأجله.

   كل خلية: { label, value, unit, sub, tone, ico, meter:{pct,color}, lead }
   tone: '' | 'good' | 'bad' | 'warn'                                        */
export function pulseBand(cells) {
  const box = el('div', 'pulse');
  for (const c of cells) {
    if (!c) continue;
    const cell = el('div', 'pulse__cell' + (c.lead ? ' pulse__cell--lead' : '') +
                              (c.tone ? ' pulse--' + c.tone : ''));
    cell.innerHTML =
      `<div class="pulse__lbl">${c.ico ? icon(c.ico) : ''}${esc(c.label)}</div>` +
      `<div class="pulse__val num">${esc(c.value)}${c.unit ? `<small> ${esc(c.unit)}</small>` : ''}</div>` +
      (c.meter ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, Math.round(c.meter.pct)))}%;background:${c.meter.color}"></i></div>` : '') +
      (c.sub ? `<div class="pulse__sub">${esc(c.sub)}</div>` : '');
    box.appendChild(cell);
  }
  return box;
}

/* رقاقة حالة بنقطة — النقطة تحمل المعنى مع النص، فلا يُقرأ باللون وحده */
export const pill = (cls, text) => `<span class="pill pill--dot ${esc(cls)}">${esc(text)}</span>`;

/* ═══════════════════ قائمة إجراءات الصف ═══════════════════

   items: [{ label, ico, danger, onClick }] — و null يصير فاصلاً.
   تُغلق بالضغط خارجها أو بـ Escape، وتُعيد التركيز للزر بعد الإغلاق.       */
export function rowMenu(items) {
  const wrap = el('div', 'rowmenu');
  const btn  = el('button', 'rowmenu__btn', icon('more'));
  btn.setAttribute('aria-label', 'إجراءات أخرى');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  wrap.appendChild(btn);

  let pop = null;
  const close = () => {
    if (!pop) return;
    pop.remove(); pop = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onKey);
  };
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); btn.focus(); } };

  btn.onclick = (e) => {
    e.stopPropagation();
    if (pop) { close(); return; }
    pop = el('div', 'rowmenu__pop');
    pop.setAttribute('role', 'menu');
    for (const it of items) {
      if (!it) { pop.appendChild(el('hr')); continue; }
      const b = el('button', it.danger ? 'danger' : '', (it.ico ? icon(it.ico) : '') + esc(it.label));
      b.setAttribute('role', 'menuitem');
      b.onclick = () => { close(); it.onClick(); };
      pop.appendChild(b);
    }
    wrap.appendChild(pop);
    btn.setAttribute('aria-expanded', 'true');
    pop.querySelector('button')?.focus();
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey);
  };
  return wrap;
}
