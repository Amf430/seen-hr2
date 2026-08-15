/* ═══════════════════════════════════════════════════════════════════════════
   تسميات أعمدة الجدول على الجوال (المرحلة ج-٢)

   الجدول عرضه الأدنى ٧٦٠px فيتمرّر أفقياً على الجوال، ويبقى **جزء** من العمود
   ظاهراً: «000.00» من ١٢٬٠٠٠٫٠٠ و«‎-27» من 2026-09-27. الرقم المنقوص يُقرأ
   رقماً صحيحاً — معلومة كاذبة لا مجرّد قصّ. فيصير الصفّ بطاقةً وكل خلية سطرَ
   «تسمية · قيمة».

   ما يُختبر هنا هو المنطق النقيّ وحده: اشتقاق المفتاح، وتخطّي الترويسة
   الفارغة، والتهريب، ونصّ القواعد. الحقن في document في ui.js بلا اختبار
   **عن قصد** — لا يعمل في node، وقيمته تحت هذا السطر صفر.
   ═══════════════════════════════════════════════════════════════════════════ */

import { labelKey, columnLabels, escapeContent, labelRules, TABLE_CARD_BREAKPOINT }
  from '../js/lib/table-labels.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const ok = (name, cond) => eq(name, true, !!cond);
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

/* الترويسات الحقيقية من js/pages/employees.js — بالدورين */
const EMP_ADMIN = ['الاسم', 'الرقم الوظيفي', 'القسم', 'الراتب', 'الحضور',
                   'انتهاء العقد', 'المستندات', 'الحالة', 'الصلاحية', ''];
const EMP_MANAGER = ['الاسم', 'الرقم الوظيفي', 'القسم', 'الحضور',
                     'انتهاء العقد', 'المستندات', 'الحالة', 'الصلاحية', ''];

group('١. التسميات — الترويسة الفارغة');

eq('نصّ الترويسة يصير تسمية', ['الاسم', 'القسم'], columnLabels(['الاسم', 'القسم']));
eq('⚠️ الترويسة الفارغة بلا تسمية — وإلا بطاقة بسطر فاضٍ',
   ['الاسم', null], columnLabels(['الاسم', '']));
eq('⚠️ والمسافات وحدها فراغ أيضاً', [null], columnLabels(['   ']));
eq('وسطر جديد ومسافة فراغ',        [null], columnLabels(['\n  ']));
eq('undefined فراغ لا انهيار',      [null], columnLabels([undefined]));
eq('null فراغ لا انهيار',           [null], columnLabels([null]));
eq('المسافات حول النصّ تُقصّ',       ['الاسم'], columnLabels([' الاسم ']));
eq('مصفوفة فارغة تُرجع فارغة',      [], columnLabels([]));

eq('عمود الأزرار في جدول الموظفين هو الأخير وحده',
   [false, false, false, false, false, false, false, false, false, true],
   columnLabels(EMP_ADMIN).map((l) => l === null));

group('٢. المفتاح');

eq('نفس الترويسات ⇒ نفس المفتاح', labelKey(EMP_ADMIN), labelKey([...EMP_ADMIN]));
ok('⚠️ ترويسات الأدمن والمدير تختلف ⇒ مفتاحان — «الراتب» موجود عند أحدهما فقط',
   labelKey(EMP_ADMIN) !== labelKey(EMP_MANAGER));
ok('الترتيب يغيّر المفتاح', labelKey(['أ', 'ب']) !== labelKey(['ب', 'أ']));
ok('⚠️ الفاصل يمنع التصادم: [«اب»,«ج»] ليست [«ا»,«بج»]',
   labelKey(['اب', 'ج']) !== labelKey(['ا', 'بج']));
ok('المفتاح صالح كقيمة سمة — حروف وأرقام فقط',
   /^[a-z0-9]+$/.test(labelKey(EMP_ADMIN)));
eq('المفتاح لا يحمل إشارة سالبة', false, labelKey(['￿￿￿']).includes('-'));

group('٣. التهريب — قاعدة مكسورة تُسقط التسمية بصمت');

eq('الاقتباس يُهرَّب',        'a\\"b',  escapeContent('a"b'));
eq('الخلفية تُهرَّب',         'a\\\\b',  escapeContent('a\\b'));
eq('والخلفية قبل الاقتباس',   '\\\\\\"', escapeContent('\\"'));
eq('السطر الجديد بصيغة CSS',  'a\\A b',  escapeContent('a\nb'));
eq('العربي يمرّ كما هو',      'انتهاء العقد', escapeContent('انتهاء العقد'));

group('٤. نصّ القواعد');

const css = labelRules(EMP_ADMIN, 'K');

ok('يلتفّ بنقطة الجوال', css.startsWith(`@media (max-width:${TABLE_CARD_BREAKPOINT}px){`));
eq('⚠️ النقطة ٨٦٠ لا ٥٦٠ — الجدول ٧٦٠px فالقصّ يبدأ قرب ٨٠٠', 860, TABLE_CARD_BREAKPOINT);
ok('العمود الأول تسميته الاسم',
   css.includes('[data-tw="K"] tbody td:nth-child(1)::before{content:"الاسم"}'));
ok('والرابع الراتب — nth-child يبدأ من ١ لا من ٠',
   css.includes('[data-tw="K"] tbody td:nth-child(4)::before{content:"الراتب"}'));
ok('⚠️ العاشر بلا ::before إطلاقاً — محاذاة فقط',
   css.includes('[data-tw="K"] tbody td:nth-child(10){justify-content:flex-end}'));
eq('عدد قواعد ::before = عدد الترويسات غير الفارغة',
   9, (css.match(/::before/g) || []).length);
eq('المفتاح يظهر في كل قاعدة', 10, (css.match(/\[data-tw="K"\]/g) || []).length);
eq('ترويسات فارغة تماماً تُرجع نصاً فارغاً', '', labelRules([], 'K'));

const cssAuto = labelRules(['الاسم']);
ok('المفتاح يُشتقّ تلقائياً إن لم يُمرَّر',
   cssAuto.includes(`[data-tw="${labelKey(['الاسم'])}"]`));

group('٥. ترويسة عدائية — النصّ يكتبه المستخدم في بعض الجداول');

const evil = labelRules(['"}body{display:none}'], 'K');

/* ⚠️ لا يكفي البحث عن السلسلة الخبيثة: الناتج المُهرَّب يحتويها كجزء منه
   («\"}body…») وهي هناك غير ضارّة. الخاصية الصحيحة أن لا يبقى **اقتباس غير
   مهرَّب** سوى حاصرتَي القيمة — فبإسقاط المهرَّب يجب أن يتبقّى اثنان بالضبط. */
const bareQuotes = (s) => (s.replace(/\\\\/g, '').replace(/\\"/g, '').match(/"/g) || []).length;

eq('التهريب يسبق } الخارجة', '\\"}body{display:none}', escapeContent('"}body{display:none}'));
eq('⚠️ لا اقتباس حرّ داخل القاعدة — حاصرتان فقط لا أكثر',
   2, bareQuotes(evil.slice(evil.indexOf('content:'))));
ok('والقيمة كلها تبقى داخل content واحدة',
   evil.includes('content:"\\"}body{display:none}"'));
eq('ولا تنشأ قاعدة ::before ثانية', 1, (evil.match(/::before/g) || []).length);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
