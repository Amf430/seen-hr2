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
/* عدّاد الأقفال — نافذة تفتح فوق نافذة يجب ألا تفكّ القفل عند إغلاق واحدة */
let lockCount = 0;
export function lockScroll() {
  if (lockCount++ === 0) document.body.classList.add('is-locked');
}
export function unlockScroll() {
  if (lockCount > 0 && --lockCount === 0) document.body.classList.remove('is-locked');
}

/* ── النافذة المنبثقة ──
   ⚠️ البنية هنا ليست تجميلاً. النسخة السابقة كانت تضع كل المحتوى مباشرة
   داخل .modal، و.modal لها ارتفاع أقصى مع overflow:hidden — فالمحتوى الأطول
   من الشاشة كان يُقصّ ولا يتمرّر، فيتمرّر خلفه الصفحة نفسها. على الجوال يعني
   ذلك أن الزر الذي تريده يبقى خارج المتناول.

   الآن: العنوان ثابت أعلى، والأزرار ثابتة أسفل، والجسم وحده يتمرّر —
   و overscroll-behavior:contain يمنع تسريب التمرير للصفحة خلفه. */
export function openModal(innerHtml) {
  const ov = el('div', 'overlay');
  const m  = el('div', 'modal');

  /* نفكّك ما مرّره المنادي إلى ترويسة/جسم/أزرار بلا أن يغيّر أحد نداءه */
  const tmp = el('div', '', innerHtml);
  const h3   = tmp.querySelector(':scope > h3');
  const foot = tmp.querySelector(':scope > .row');

  if (h3) {
    const head = el('div', 'modal__head');
    head.appendChild(h3);
    m.appendChild(head);
  }
  const body = el('div', 'modal__body');
  while (tmp.firstChild) {
    const node = tmp.firstChild;
    tmp.removeChild(node);
    if (node === foot) continue;
    body.appendChild(node);
  }
  m.appendChild(body);
  if (foot) { foot.classList.add('modal__foot'); m.appendChild(foot); }

  ov.appendChild(m);
  document.body.appendChild(ov);
  lockScroll();

  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ov.remove();
    unlockScroll();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    /* حبس التركيز داخل النافذة — بدونه يهرب Tab لعناصر الصفحة خلفها */
    if (e.key !== 'Tab') return;
    const f = [...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  ov.onclick = (e) => { if (e.target === ov) close(); };
  document.addEventListener('keydown', onKey);

  const firstField = m.querySelector('input, select, textarea, button');
  if (firstField) firstField.focus();

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
