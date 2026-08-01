/* ═══════════════════════════════════════════════════════════════════════════
   اختبار سجل المستندات — دوال خالصة، بلا محاكي ولا شبكة.

   ⚠️ التواريخ نسبية (`dRel`) لا مكتوبة بنصّها: `docStatus` تقارن باليوم الحالي،
   فتاريخ ثابت يجعل المجموعة تنجح اليوم وتفشل بعد شهر بلا أن يتغيّر شيء.
   ═══════════════════════════════════════════════════════════════════════════ */

import { docStatus, expiringDocs, worstDocState, docsOf,
         kindOf, kindLabel, DOC_KINDS, MAX_DOCS } from '../js/lib/documents.js';

let pass = 0, fail = 0;
const t = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31m✗\x1b[0m ${label}\n      توقّع ${e}\n      وجد  ${a}`); fail++; }
};

const p2 = (n) => String(n).padStart(2, '0');
const dRel = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const D = (kind, expiresOn, over = {}) => ({ id: 'x', kind, expiresOn, ...over });

console.log('\n\x1b[1m═══ حالة المستند ═══\x1b[0m');
t('إقامة تنتهي بعد سنة = سارية',        docStatus(D('iqama', dRel(365))).state, 'ok');
t('إقامة انتهت أمس = منتهية',           docStatus(D('iqama', dRel(-1))).state, 'expired');
t('إقامة تنتهي اليوم ليست منتهية',      docStatus(D('iqama', dRel(0))).state, 'soon');
t('إقامة خلال ٥٩ يوماً = تحذير',        docStatus(D('iqama', dRel(59))).state, 'soon');
t('إقامة عند حدّ الـ٦٠ = تحذير',        docStatus(D('iqama', dRel(60))).state, 'soon');
t('إقامة بعد ٦١ يوماً = سارية',         docStatus(D('iqama', dRel(61))).state, 'ok');
t('عدد الأيام المتبقّية صحيح',          docStatus(D('iqama', dRel(30))).left, 30);

console.log('\n\x1b[1m═══ مهل مختلفة لأنواع مختلفة ═══\x1b[0m');
/* الجواز يحتاج مهلة أطول من التأمين — تجديده يمرّ بجهة خارجية */
t('جواز خلال ٧٠ يوماً = تحذير (مهلته ٩٠)', docStatus(D('passport', dRel(70))).state, 'soon');
t('تأمين خلال ٧٠ يوماً = سارٍ (مهلته ٣٠)',  docStatus(D('insurance', dRel(70))).state, 'ok');
t('تأمين خلال ٢٩ يوماً = تحذير',            docStatus(D('insurance', dRel(29))).state, 'soon');

console.log('\n\x1b[1m═══ ما لا ينتهي ═══\x1b[0m');
t('المؤهل العلمي لا ينتهي مهما كان التاريخ', docStatus(D('degree', dRel(-999))).state, 'none');
t('الشهادة لا تنتهي',                        docStatus(D('cert', dRel(-999))).state, 'none');
t('مستند بلا تاريخ انتهاء',                  docStatus(D('iqama', '')).state, 'none');
t('نوع مجهول يسقط على «أخرى»',               kindOf('NOPE').id, 'other');
t('«أخرى» تنتهي فعلاً',                      docStatus(D('NOPE', dRel(-1))).state, 'expired');

console.log('\n\x1b[1m═══ تنبيهات الشركة ═══\x1b[0m');
const U = [
  { id: 'a', name: 'أ', status: 'active',    documents: [D('iqama', dRel(-5)), D('passport', dRel(400))] },
  { id: 'b', name: 'ب', status: 'active',    documents: [D('iqama', dRel(10))] },
  { id: 'c', name: 'ج', status: 'active',    documents: [D('iqama', dRel(900))] },
  { id: 'd', name: 'د', status: 'suspended', documents: [D('iqama', dRel(-100))] },
  { id: 'e', name: 'ه', status: 'active' }
];
const ex = expiringDocs(U);
t('المنتهية',                   ex.expired.map((x) => x.u.id), ['a']);
t('المقاربة',                   ex.soon.map((x) => x.u.id), ['b']);
t('الموقوف لا يُنبَّه عليه',     ex.expired.concat(ex.soon).some((x) => x.u.id === 'd'), false);
t('من بلا مستندات لا يظهر',      ex.expired.concat(ex.soon).some((x) => x.u.id === 'e'), false);
t('السارية لا تظهر',            ex.expired.concat(ex.soon).some((x) => x.u.id === 'c'), false);

/* الأقرب انتهاءً أولاً — وإلا صار الترتيب عشوائياً في لوحة مقصوصة على ١٢ */
const many = [{ id: 'z', name: 'ز', status: 'active',
  documents: [D('iqama', dRel(50)), D('workPermit', dRel(5)), D('nationalId', dRel(20))] }];
t('الترتيب بالأقرب انتهاءً', expiringDocs(many).soon.map((x) => x.d.kind),
  ['workPermit', 'nationalId', 'iqama']);

console.log('\n\x1b[1m═══ أسوأ حالة لموظف ═══\x1b[0m');
t('المنتهي يغلب المقارب', worstDocState(U[0]).state, 'expired');
t('بلا منتهٍ يُختار الأقرب', worstDocState(many[0]).d.kind, 'workPermit');
t('بلا مشاكل = لا شيء',     worstDocState(U[2]), null);
t('بلا مستندات = لا شيء',   worstDocState(U[4]), null);

console.log('\n\x1b[1m═══ حراسة المدخلات ═══\x1b[0m');
t('docsOf على موظف بلا حقل',   docsOf({}), []);
t('docsOf على undefined',      docsOf(undefined), []);
t('docsOf على حقل ليس مصفوفة', docsOf({ documents: 'x' }), []);
t('السقف يطابق القاعدة',       MAX_DOCS, 12);
t('كل نوع له تسمية',           DOC_KINDS.every((k) => !!kindLabel(k.id)), true);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
