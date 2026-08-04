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

/* ═══ مكدّس الرجوع ═══

   ── لماذا نمسك مكدّساً بدل الاكتفاء بـ history.length ──
   حين يُضاف النظام كأيقونة على الشاشة الرئيسية يفتحه المتصفح في وضع
   standalone: بلا شريط عنوان وبلا زرّي «رجوع» و«تقدّم». فالموظف الذي يدخل
   «خدماتي» أو «ملفي الوظيفي» يجد نفسه بلا طريق للخلف إلا القائمة الجانبية —
   وهي أول ما لا يخطر على باله. الزرّ في الترويسة يعطيه المخرج المألوف.

   و history.length لا يصلح دليلاً: يعدّ كل صفحة زارها التبويب قبل النظام
   أصلاً، فيبقى الزرّ ظاهراً وهو يخرج المستخدم من التطبيق كلّه. المكدّس هنا
   يعدّ تنقّلاتنا نحن وحدها.

   ⚠️ يبقى المكدّس متوازياً مع تاريخ المتصفح خطوةً بخطوة: كل go() تدفع فيه
   وتكتب مدخلاً في التاريخ، و goBack() تنادي history.back() فيرتدّ الاثنان
   معاً. لذلك لا تدفع go({replace:true}) شيئاً — هي تستبدل مدخل التاريخ ولا
   تضيف واحداً. */
const backStack = [];
/* الـ hashchange القادم مصدره go() لا زرّ المتصفح */
let selfNav = false;

export const backStackDepth = () => backStack.length;
export const canGoBack = () => backStack.length > 0;

/* الانتقال الفعلي: يكتب العنوان ويُصدر العرض. لا يمسّ المكدّس إطلاقاً —
   من يناديه هو من يقرّر ما يفعله به. */
function navTo(page, arg, replace) {
  currentPage = page;
  currentArg  = arg;
  const want = hashFor(page, arg);
  /* العنوان نفسه: لا hashchange سيقع، فنُصدر العرض بأنفسنا */
  if (location.hash === want) { emit(); return; }
  if (replace) {
    /* replaceState لا تُطلق hashchange أيضاً — لا حاجة لرفع selfNav */
    history.replaceState(null, '', location.pathname + location.search + want);
    emit();
    return;
  }
  selfNav = true;
  location.hash = want;   /* hashchange هو من يُصدر العرض */
}

/* ── الانتقال لصفحة أخرى ──
   replace: يستبدل مدخل التاريخ بدل أن يضيف واحداً. للتحويلات التي لا يصحّ
   الرجوع إليها — صفحة يمنعها دور المستخدم مثلاً: لو دُفعت في المكدّس لأعادنا
   الرجوعُ إليها، فيحوّلنا الحارس عنها من جديد، بلا مخرج. */
export function go(page, arg = '', { replace = false } = {}) {
  const from = { page: currentPage, arg: currentArg };
  const same = location.hash === hashFor(page, arg);

  /* ⚠️ الاستبدال إلى نفس صفحة قمّة المكدّس يطويهما في واحدة، فتبقى القمّة
     مدخلاً وهمياً: التاريخ ما عاد فيه ما يُرجَع إليه، والمكدّس يزعم العكس.
     هذا يقع في مسار حقيقي — الموظف يفتح صفحة يمنعها دوره وهو في الرئيسية،
     فيدفع go() «الرئيسية» ثم يستبدلها حارسُ الراوتر بـ«الرئيسية» نفسها،
     فيظهر زرّ رجوع يخرجه من التطبيق. نطويها هنا بدل أن نطاردها لاحقاً. */
  if (replace) {
    const top = backStack[backStack.length - 1];
    if (top && top.page === page && top.arg === arg) backStack.pop();
  } else if (!same) {
    backStack.push(from);
  }
  navTo(page, arg, replace);
}

/* رجوع خطوة واحدة داخل النظام. المكدّس فارغ يعني أن هذه أول صفحة في هذه
   الجلسة — كأن يفتح الموظف الأيقونة على رابط محفوظ — فنأخذه للرئيسية بدل
   أن نُخرجه من التطبيق إلى ما كان قبله في التبويب. */
export function goBack(fallback = 'home') {
  const prev = backStack[backStack.length - 1];
  if (!prev) { go(fallback, '', { replace: true }); return; }

  /* الطريق المعتاد: history.back() ليبقى زرّا المتصفح على سطح المكتب
     متّسقين معنا. الـ hashchange الناتج هو من يسحب القمّة — لا نسحبها هنا
     وإلا سُحبت مرّتين. */
  if (hashFor(prev.page, prev.arg) !== location.hash) { history.back(); return; }

  /* المدخل السابق يحمل العنوان نفسه، فـ history.back() لن تُطلق hashchange
     ولن يتحرّك شيء — الزرّ يبدو معطّلاً. نرجع بأنفسنا. */
  backStack.pop();
  navTo(prev.page, prev.arg, true);
}

/* يُنادى عند تسجيل الخروج: مكدّس المستخدم السابق لا يخصّ من يدخل بعده،
   وزرّ الرجوع كان سيعيده لصفحة ليست له. */
export function resetNav() {
  backStack.length = 0;
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
  if (selfNav) {
    /* go() دفعت في المكدّس قبل الكتابة — لا شيء يُضاف هنا */
    selfNav = false;
  } else {
    /* مصدره المتصفح: إن كانت الوجهة قمّة المكدّس فهو رجوع فنسحبها، وإلا فهو
       تقدّم أو عنوان كُتب يدوياً فنُعامله كتنقّل جديد. */
    const top = backStack[backStack.length - 1];
    if (top && top.page === page && top.arg === arg) backStack.pop();
    else backStack.push({ page: currentPage, arg: currentArg });
  }
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
