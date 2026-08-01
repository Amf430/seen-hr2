/* ═══════════════════════════════════════════════════════════════════════════
   التنقّل — وحدة طرفية، وهي كاسر الدورة في شجرة الاستيراد.

   المشكلة: الراوتر لازم يستورد الصفحات ليعرضها، والصفحات لازم تنادي go()
   و render() — فلو كانت في الراوتر لصارت دورة استيراد مغلقة.
   الحل: هذه الوحدة تملك رقم الصفحة وعدّاد العرض ولا تستورد شيئاً. الصفحات
   تستورد منها، والراوتر يشترك فيها عبر onNavigate().

   ── لماذا الصفحة في عنوان الموقع ──
   كانت الصفحة متغيّراً في الذاكرة وحدها، فأي تحديث للصفحة (F5) أو استعادة
   للتبويب يرجع بالمستخدم إلى «الرئيسية» مهما كان يعمل عليه. صار موضعها في
   `location.hash`، فيُكمل من حيث وقف — ويعمل زرّا «رجوع» و«تقدّم» في
   المتصفح، ويصير الرابط قابلاً للمشاركة.

   الصيغة: `#page` أو `#page/arg` — و `arg` اليوم هو معرّف الموظف في صفحة
   البروفايل، لأنها الصفحة الوحيدة التي لا يكفيها اسمها لتُعرض.

   ⚠️ لا نستعمل history.pushState بمسارات حقيقية: النظام يُستضاف على GitHub
   Pages، ومسار مثل /employees يرجع 404 عند التحديث لأن الخادم يبحث عن ملف
   بهذا الاسم. الـ hash لا يصل الخادم أصلاً، فيعمل في أي استضافة بلا إعداد.
   ═══════════════════════════════════════════════════════════════════════════ */

let currentPage = 'home';
let currentArg  = '';
let renderSeq = 0;
const listeners = new Set();

export const getPage    = () => currentPage;
export const getPageArg = () => currentArg;

/* ── العنوان ── */
function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return { page: '', arg: '' };
  const i = raw.indexOf('/');
  const page = i === -1 ? raw : raw.slice(0, i);
  const arg  = i === -1 ? ''  : raw.slice(i + 1);
  try {
    return { page: decodeURIComponent(page), arg: decodeURIComponent(arg) };
  } catch (e) {
    /* hash مشوّه يدوياً (%ZZ) يجعل decodeURIComponent ترمي — نتجاهله */
    return { page: '', arg: '' };
  }
}

const hashFor = (page, arg) =>
  '#' + encodeURIComponent(page) + (arg ? '/' + encodeURIComponent(arg) : '');

/* ── الانتقال لصفحة أخرى ──
   الكتابة في الـ hash تُطلق hashchange، وهو من يُصدر الحدث — فلا ينتشر
   العرض مرّتين. وإن لم يتغيّر العنوان (نفس الصفحة) نُصدره مباشرة. */
export function go(page, arg = '') {
  currentPage = page;
  currentArg  = arg;
  const want = hashFor(page, arg);
  if (location.hash !== want) location.hash = want;
  else emit();
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

/* ── الإقلاع ──
   يُستدعى مرة واحدة من الراوتر. يقرأ العنوان الحالي فيُكمل من حيث وقف،
   ويستبدل مدخل التاريخ بدل أن يضيف واحداً — حتى لا يعلق زرّ «رجوع» على
   أول تحميل. */
export function initFromHash(fallbackPage = 'home') {
  const { page, arg } = parseHash();
  currentPage = page || fallbackPage;
  currentArg  = page ? arg : '';
  const want = hashFor(currentPage, currentArg);
  if (location.hash !== want) {
    history.replaceState(null, '', location.pathname + location.search + want);
  }
}

/* زرّا «رجوع» و«تقدّم»، وأي تعديل يدوي للعنوان */
window.addEventListener('hashchange', () => {
  const { page, arg } = parseHash();
  if (!page) return;
  currentPage = page;
  currentArg  = arg;
  emit();
});

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
