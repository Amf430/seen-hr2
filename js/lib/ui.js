/* ═══════════════════════════════════════════════════════════════════════════
   لبنات الواجهة المشتركة.

   ⚠️ كل نص متغيّر يمرّ عبر esc(). النسخة القديمة كانت تمرّر التسميات مباشرة
   في stat() (السطر 918) و contractCell() (1244)، وكلاهما يعرض بيانات يكتبها
   المستخدم — وهذا يكفي لحقن كود في صفحة الأدمن.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from './dom.js';
import { contractDaysLeft } from './dates.js';

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

/* بطاقة بعنوان ووصف */
export function card(title, desc) {
  const c = el('div', 'card');
  if (title) c.appendChild(el('h3', '', esc(title)));
  if (desc)  c.appendChild(el('p', 'desc', esc(desc)));
  return c;
}

/* عنوان قسم مع أزرار على اليسار */
export function sectionHead(title, ...buttons) {
  const bar = el('div', 'row-between');
  bar.appendChild(el('h3', '', esc(title)));
  if (buttons.length) {
    const cluster = el('div', 'cluster');
    buttons.filter(Boolean).forEach((b) => cluster.appendChild(b));
    bar.appendChild(cluster);
  }
  return bar;
}

export function button(label, cls = 'btn sm', onClick) {
  const b = el('button', cls, esc(label));
  if (onClick) b.onclick = onClick;
  return b;
}

export const empty = (msg, icon = '') =>
  el('div', 'empty', (icon ? `<div class="big">${icon}</div>` : '') + esc(msg));

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
  if (n < 0)   return `<span class="pill rejected">منتهي (${Math.abs(n)} يوم)</span>`;
  if (n <= 60) return `<span class="pill pending">${esc(dateStr)} · ${n} يوم</span>`;
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
