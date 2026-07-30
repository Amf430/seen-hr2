/* ═══════════════════════════════════════════════════════════════════════════
   أدوات الـ DOM والحماية من الحقن.
   ═══════════════════════════════════════════════════════════════════════════ */

export const $  = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/* إنشاء عنصر: el('div','card','<h3>…</h3>') */
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/* تهريب النص قبل وضعه داخل HTML */
export const esc = (s) =>
  (s == null ? '' : String(s)).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

/* ── تهريب الروابط ──
   esc() وحده لا يكفي داخل href: فهو يهرّب علامات الاقتباس فيمنع الخروج من
   الخاصية، لكنه لا يمنع البروتوكول نفسه. الرابط "javascript:…" يمرّ من esc()
   سليماً تماماً، فيتحوّل إلى تنفيذ كود بمجرد ضغط الأدمن عليه.

   هذا كان ثغرة فعلية: الموظف يكتب الرابط في مرفق طلب الإجازة، والأدمن يفتحه
   من صندوق الطلبات فيُنفَّذ الكود بصلاحيات الأدمن.

   القاعدة هنا: قائمة سماح (http/https فقط) لا قائمة منع — أي بروتوكول آخر
   (javascript:, data:, vbscript:, file:, blob:) يسقط تلقائياً. */
export function safeUrl(u) {
  const raw = (u == null ? '' : String(u)).trim();
  if (!raw) return '';
  let parsed;
  try { parsed = new URL(raw, location.origin); }
  catch (e) { return ''; }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
}

/* رابط خارجي جاهز — يرجع '' لو كان الرابط غير آمن، فلا يُعرض أصلاً.
   rel="noopener noreferrer" يمنع الصفحة المفتوحة من التحكّم بصفحتنا. */
export function extLink(url, label) {
  const safe = safeUrl(url);
  if (!safe) return '';
  return `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

/* معرّف قصير للعناصر المحلية (أنواع الإجازات، الأقسام، الفروع…) */
export const uid = () => Math.random().toString(36).slice(2, 9);

/* ── التنبيهات ──
   textContent وليس innerHTML — الرسائل تحوي أحياناً أسماء موظفين. */
export function toast(msg, type = '') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, 2600);
}

/* ── النوافذ المنبثقة ──
   كانت مكرّرة ست مرات بنفس الشكل. الإغلاق بالضغط خارجها أو بمفتاح Esc
   (المفتاح كان ناقصاً في النسخة القديمة). */
export function openModal(innerHtml) {
  const ov = el('div', 'overlay');
  const m  = el('div', 'modal', innerHtml);
  ov.appendChild(m);
  document.body.appendChild(ov);

  const close = () => {
    ov.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  ov.onclick = (e) => { if (e.target === ov) close(); };
  document.addEventListener('keydown', onKey);

  /* أول حقل يستقبل التركيز — لوحة المفاتيح وحدها تكفي لاستخدام النافذة */
  const first = m.querySelector('input, select, textarea, button');
  if (first) first.focus();

  return { overlay: ov, modal: m, close, $: (s) => m.querySelector(s) };
}

/* تأكيد الإجراءات الخطرة — بديل confirm() الأصلي بنافذة تحترم اتجاه RTL */
export function confirmAction({ title, body, confirmLabel = 'تأكيد', danger = true }) {
  return new Promise((resolve) => {
    const { modal, close } = openModal(`
      <h3>${esc(title)}</h3>
      ${body ? `<div class="modal-body">${body}</div>` : ''}
      <div class="row">
        <button class="btn ghost" data-act="cancel">إلغاء</button>
        <button class="btn ${danger ? 'danger' : ''}" data-act="ok">${esc(confirmLabel)}</button>
      </div>`);
    modal.querySelector('[data-act="cancel"]').onclick = () => { close(); resolve(false); };
    modal.querySelector('[data-act="ok"]').onclick     = () => { close(); resolve(true); };
  });
}
