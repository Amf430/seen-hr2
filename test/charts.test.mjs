/* ═══════════════════════════════════════════════════════════════════════════
   رسوم SVG (إعادة تصميم الواجهة)

   الرسم حسبة قبل أن يكون شكلاً — مقياس ومدى وإحداثيات. وهذه الحسبة تقرّر ما
   يراه المالك: شريحة بحجم خاطئ في حلقة الحضور تعني نسبة حضور خاطئة تُقرأ
   بثقة، تماماً كالرقم المقصوص الذي أصلحناه في الجداول.

   ⚠️ ما لا يُختبر هنا: الشكل النهائي على الشاشة. الاختبار يضمن أن الأعداد
   صحيحة والمستند سليم؛ أما التناسب البصري فيُرى بالعين ولا يُدّعى هنا.
   ═══════════════════════════════════════════════════════════════════════════ */

import { sparkline, donut, stackedBars, barList, delta } from '../js/lib/charts.js';

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

/* عدّاد وسوم مفتوحة/مغلقة — مستند SVG مكسور لا يُرسم إطلاقاً */
const balanced = (svg) => {
  const open = (svg.match(/<(circle|rect|path|text|svg|g)\b(?![^>]*\/>)/g) || []).length;
  const close = (svg.match(/<\/(circle|rect|path|text|svg|g)>/g) || []).length;
  const self = (svg.match(/<(circle|rect|path|text)\b[^>]*\/>/g) || []).length;
  return { open, close, self };
};

group('١. خطّ الاتجاه');

const sp = sparkline([1, 5, 3, 9]);
ok('يُرجع svg', sp.startsWith('<svg') && sp.endsWith('</svg>'));
ok('فيه مساحة وخطّ ونقطة أخيرة', (sp.match(/<path/g) || []).length === 2 && sp.includes('<circle'));
ok('النقطة الأخيرة عند أقصى اليمين', sp.includes('cx="80"'));
eq('⚠️ نقطة واحدة لا تصنع خطّاً — svg فارغ لا انهيار',
   true, sparkline([5]).includes('</svg>') && !sparkline([5]).includes('<path'));
eq('ومصفوفة فارغة كذلك', true, !sparkline([]).includes('<path'));
eq('وغير المصفوفة كذلك', true, !sparkline(null).includes('<path'));
ok('⚠️ المدى من البيانات لا من صفر — قيم متقاربة تُرى',
   sparkline([90, 91, 92]).includes('<path'));
ok('قيم متساوية لا تقسم على صفر', sparkline([7, 7, 7]).includes('<path'));
ok('لا NaN في أي إحداثي', !/NaN|undefined/.test(sparkline([1, NaN, 3])));

group('٢. الحلقة');

const d = donut([
  { value: 6, color: 'g', label: 'حاضر' },
  { value: 2, color: 'a', label: 'متأخر' },
  { value: 2, color: 'r', label: 'غائب' }
], { centerValue: 8, centerLabel: 'من 10' });

eq('ثلاث شرائح + مسار', 4, (d.match(/<circle/g) || []).length);
ok('المجموع في المركز', d.includes('>8</text>'));
ok('والتسمية تحته', d.includes('من 10'));
ok('تبدأ من أعلى الدائرة', d.includes('rotate(-90'));
ok('وصف بديل لقارئ الشاشة', d.includes('aria-label="حاضر: 6، متأخر: 2، غائب: 2"'));

/* ⚠️ قوس بطول صفر مع طرف مستدير يرسم نقطة على المحيط — حالة لا وجود لها */
const dz = donut([{ value: 5, color: 'g', label: 'حاضر' }, { value: 0, color: 'r', label: 'غائب' }]);
eq('⚠️ الشريحة الصفرية تُحذف لا تُرسم', 2, (dz.match(/<circle/g) || []).length);
eq('والسالبة تُعامل صفراً', 2,
   (donut([{ value: 5, color: 'g' }, { value: -3, color: 'r' }]).match(/<circle/g) || []).length);

const d0 = donut([], { emptyLabel: 'لا حضور اليوم' });
ok('⚠️ بلا بيانات: مسار فقط بلا قسمة على صفر', d0.includes('<circle') && !d0.includes('stroke-dasharray'));
ok('ووصفه يقول ذلك', d0.includes('لا حضور اليوم'));

const dSum = donut([{ value: 1, color: 'a' }, { value: 1, color: 'b' }, { value: 2, color: 'c' }]);
const dashes = [...dSum.matchAll(/stroke-dasharray="([\d.]+)/g)].map((m) => +m[1]);
const circ = 2 * Math.PI * ((148 - 14) / 2);
ok('⚠️ مجموع الأقواس = محيط الدائرة بالضبط',
   Math.abs(dashes.reduce((a, b) => a + b, 0) - circ) < 0.5);
ok('والشريحة النصفية نصف المحيط', Math.abs(dashes[2] - circ / 2) < 0.5);

group('٣. الأعمدة المكدّسة');

const sb = stackedBars([
  { label: 'الأحد', parts: [{ value: 8, color: 'g', label: 'حاضر' }, { value: 2, color: 'r', label: 'غائب' }] },
  { label: 'الإثنين', parts: [{ value: 10, color: 'g', label: 'حاضر' }] }
]);
eq('ثلاث شرائح', 3, (sb.match(/<rect/g) || []).length);
eq('وتسمية لكل يوم', 2, (sb.match(/<text/g) || []).length);
ok('التسمية العربية مكتوبة كما هي', sb.includes('>الأحد<'));
ok('الأعمدة متساوية الارتفاع — المقارنة تركيب لا حجم',
   sb.includes('height="134"') || /height="\d+"/.test(sb));

const sbEmpty = stackedBars([{ label: 'الجمعة', parts: [] }]);
ok('⚠️ يوم بلا بيانات يرسم خطاً رفيعاً لا عموداً كاملاً', sbEmpty.includes('height="2"'));
ok('وتسميته تبقى', sbEmpty.includes('الجمعة'));
eq('قائمة فارغة لا تنهار', true, stackedBars([]).includes('</svg>'));

group('٤. الأشرطة الأفقية');

const bl = barList([{ label: 'المبيعات', value: 8 }, { label: 'المالية', value: 4 }]);
ok('⚠️ HTML لا SVG — النصّ العربي داخل SVG لا يرث الاتجاه ولا يلتفّ',
   bl.startsWith('<div class="barlist"') && !bl.includes('<svg'));
ok('الأطول يملأ ١٠٠٪', bl.includes('inline-size:100%'));
ok('والنصف يملأ ٥٠٪', bl.includes('inline-size:50%'));
eq('قائمة فارغة تُرجع نصاً فارغاً', '', barList([]));
ok('قيم صفرية لا تقسم على صفر', barList([{ label: 'أ', value: 0 }]).includes('inline-size:0%'));

group('٥. سهم الفرق');

ok('صاعد', delta(3.2).includes('↑') && delta(3.2).includes('delta--good'));
ok('هابط', delta(-3.2).includes('↓') && delta(-3.2).includes('delta--bad'));
ok('ثابت بلا سهم', !delta(0).includes('↑') && !delta(0).includes('↓'));
/* ⚠️ ارتفاع الغياب ليس خبراً ساراً — الاتجاه لا يقرّر الحكم */
ok('⚠️ ارتفاع مع good:false يُقرأ سيّئاً', delta(5, { good: false }).includes('delta--bad'));
ok('وانخفاضه يُقرأ جيّداً', delta(-5, { good: false }).includes('delta--good'));

group('٦. الحقن — التسميات يكتبها الأدمن');

const evil = '<script>alert(1)</script>';
ok('⚠️ تسمية القسم مهرَّبة في الأشرطة', !barList([{ label: evil, value: 1 }]).includes('<script'));
ok('وفي الحلقة', !donut([{ value: 1, color: 'g', label: evil }]).includes('<script'));
ok('وفي الأعمدة', !stackedBars([{ label: evil, parts: [{ value: 1, color: 'g' }] }]).includes('<script'));
ok('وفي نصّ الفرق', !delta(5, { text: evil }).includes('<script'));
ok('و«<» وحدها تُهرَّب فلا تكسر المستند',
   donut([{ value: 1, color: 'g', label: 'أ<ب' }]).includes('أ&lt;ب'));

group('٧. سلامة المستند');

for (const [name, svg] of [['sparkline', sp], ['donut', d], ['stackedBars', sb]]) {
  const b = balanced(svg);
  eq(`${name}: كل وسم مفتوح له مغلق`, b.open, b.close);
  ok(`${name}: لا NaN ولا undefined`, !/NaN|undefined/.test(svg));
}

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
