/* ═══════════════════════════════════════════════════════════════════════════
   التنقّل — وحدة طرفية، وهي كاسر الدورة في شجرة الاستيراد.

   المشكلة: الراوتر لازم يستورد الصفحات ليعرضها، والصفحات لازم تنادي go()
   و render() — فلو كانت في الراوتر لصارت دورة استيراد مغلقة.
   الحل: هذه الوحدة تملك رقم الصفحة وعدّاد العرض ولا تستورد شيئاً. الصفحات
   تستورد منها، والراوتر يشترك فيها عبر onNavigate().
   ═══════════════════════════════════════════════════════════════════════════ */

let currentPage = 'home';
let renderSeq = 0;
const listeners = new Set();

export const getPage = () => currentPage;

/* الانتقال لصفحة أخرى */
export function go(page) {
  currentPage = page;
  emit();
}

/* إعادة عرض الصفحة الحالية — تحلّ محل نداءات render() المباشرة */
export function rerender() {
  emit();
}

/* يُعاد العرض فقط إذا كانت الصفحة الحالية ضمن القائمة.
   يحافظ على قوائم التحديث اللحظي لكل دور كما هي بالضبط. */
export function rerenderIf(pages) {
  if (pages.includes(currentPage)) emit();
}

export function onNavigate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(currentPage);
}

/* ── حارس العرض ──
   يمنع عرضاً قديماً وبطيئاً من الكتابة فوق عرض أحدث. الراوتر ينادي
   beginRender() مرة واحدة لكل تنقّل ويمرّر الرمز للصفحة؛ والصفحة تتحقق
   isStale(token) بعد كل await يسبق كتابة في الـ DOM. */
export function beginRender() {
  return ++renderSeq;
}
export function isStale(token) {
  return token !== undefined && token !== renderSeq;
}
