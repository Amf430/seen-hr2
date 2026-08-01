/* ═══════════════════════════════════════════════════════════════════════════
   اختبار التنقّل — بقاء الصفحة بعد التحديث.

   nav.js تلمس window و location، فتُبنى هنا نسخة صغيرة منهما قبل استيرادها.
   الهدف ليس محاكاة متصفح كامل، بل التحقّق من المنطق الذي انكسر فعلاً:
   الصفحة كانت متغيّراً في الذاكرة، فكل تحديث يرجع بالمستخدم إلى «الرئيسية».

   ⚠️ الاستيراد ديناميكي (بعد بناء الشيم) لأن nav.js تُسجّل مستمع hashchange
   لحظة تحميلها — والاستيراد الساكن يُرفع لأعلى الملف فيسبق الشيم.
   ═══════════════════════════════════════════════════════════════════════════ */

let pass = 0, fail = 0;
const t = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31m✗\x1b[0m ${label}\n      توقّع ${e}\n      وجد  ${a}`); fail++; }
};

/* ── شيم المتصفح ── */
const handlers = {};
let replaced = null;
const loc = {
  pathname: '/', search: '', _hash: '',
  get hash() { return this._hash; },
  set hash(v) {
    const next = v.startsWith('#') ? v : '#' + v;
    if (next === this._hash) return;
    this._hash = next;
    (handlers.hashchange || []).forEach((fn) => fn());   /* المتصفح يُطلقه عند التغيير */
  }
};
globalThis.location = loc;
globalThis.history = { replaceState: (_s, _t, url) => { replaced = url; } };
globalThis.window = {
  addEventListener: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); }
};

const nav = await import('../js/lib/nav.js');
const { go, getPage, getPageArg, initFromHash, rerender, rerenderIf, onNavigate } = nav;

/* عدّاد العرض — كل انتقال يجب أن يُعيد العرض مرة واحدة لا مرّتين */
let renders = [];
onNavigate((p) => renders.push(p));
const reset = () => { renders = []; };

console.log('\n\x1b[1m═══ الانتقال يكتب في العنوان ═══\x1b[0m');
reset(); go('employees');
t('العنوان صار #employees', loc.hash, '#employees');
t('الصفحة الحالية',        getPage(), 'employees');
t('عرض واحد لا مرّتان',     renders, ['employees']);

reset(); go('profile', 'abc123');
t('العنوان يحمل المعرّف', loc.hash, '#profile/abc123');
t('المعرّف مقروء',        getPageArg(), 'abc123');
t('عرض واحد',            renders.length, 1);

reset(); go('employees');
t('العودة تمسح المعرّف', [loc.hash, getPageArg()], ['#employees', '']);

/* الانتقال لنفس الصفحة لا يغيّر العنوان — ومع ذلك يجب أن يُعاد العرض */
reset(); go('employees');
t('نفس الصفحة تُعاد عرضاً', renders, ['employees']);

console.log('\n\x1b[1m═══ الاستئناف بعد التحديث ═══\x1b[0m');
/* هذا هو العطل المُبلَّغ عنه: تحديث الصفحة كان يرجع للرئيسية */
loc._hash = '#payroll';
initFromHash('home');
t('يُكمل من المسير لا من الرئيسية', getPage(), 'payroll');

loc._hash = '#profile/xyz789';
initFromHash('home');
t('بروفايل يستعيد صفحته',  getPage(), 'profile');
t('بروفايل يستعيد معرّفه', getPageArg(), 'xyz789');

loc._hash = '';
replaced = null;
initFromHash('home');
t('بلا hash يسقط على الافتراضي', getPage(), 'home');
t('يُكتب الافتراضي في العنوان',   replaced, '/#home');

console.log('\n\x1b[1m═══ رجوع المتصفح وعنوان مكتوب يدوياً ═══\x1b[0m');
reset();
loc.hash = '#audit';                    /* كأنّ المستخدم ضغط «رجوع» */
t('hashchange يحدّث الصفحة', getPage(), 'audit');
t('hashchange يُعيد العرض',  renders, ['audit']);

reset();
loc._hash = '#%ZZbad';                  /* عنوان مشوّه — decodeURIComponent ترمي */
initFromHash('home');
t('عنوان مشوّه لا يُسقط النظام', getPage(), 'home');

console.log('\n\x1b[1m═══ ترميز المحارف ═══\x1b[0m');
go('set-org');
t('الشرطة تبقى كما هي', loc.hash, '#set-org');
go('profile', 'a b/c');
t('المعرّف يُرمَّز',      loc.hash, '#profile/a%20b%2Fc');
t('ويُفكّ صحيحاً',        getPageArg(), 'a b/c');

console.log('\n\x1b[1m═══ rerender و rerenderIf ═══\x1b[0m');
go('inbox'); reset();
rerender();
t('rerender يُعيد العرض بلا تغيير العنوان', [renders, loc.hash], [['inbox'], '#inbox']);
reset(); rerenderIf(['inbox', 'mine']);
t('rerenderIf يعمل على صفحة مطابقة', renders, ['inbox']);
reset(); rerenderIf(['payroll']);
t('rerenderIf يصمت على غير المطابقة', renders, []);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
