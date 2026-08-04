/* ═══════════════════════════════════════════════════════════════════════════
   اختبار الهيكل التنظيمي — دوال خالصة، بلا محاكي ولا شبكة.

   لماذا منفصل عن rules.test.mjs: هذه دوال جافاسكربت خالصة لا تمسّ Firestore،
   فلا معنى لإقلاع JVM ومحاكي كامل لأجلها. تعمل بـ `node org.test.mjs` وحدها
   في أجزاء من الثانية.

   ⚠️ ما يهمّ حقاً هنا حالتان لا تظهران في البيانات السليمة:
     • حلقة تسلسل (أ مدير ب وب مدير أ) — أي تسلّق ساذج للشجرة يدور للأبد
     • مدير محذوف — مرؤوسوه يجب ألّا يختفوا من الشجرة بصمت
   ═══════════════════════════════════════════════════════════════════════════ */

import { orgTree, flattenTree, allReports, directReports, managerChain,
         wouldCycle, managerCandidates, managerOf } from '../js/lib/org.js';

let pass = 0, fail = 0;
const t = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31m✗\x1b[0m ${label}\n      توقّع ${e}\n      وجد  ${a}`); fail++; }
};
const names = (list) => list.map((u) => u.id);

/* ceo ← (cto ← dev1, dev2) و (cfo ← acct) ، و solo بلا مدير */
const U = [
  { id: 'ceo',  name: 'أ', status: 'active' },
  { id: 'cto',  name: 'ب', status: 'active', managerUid: 'ceo' },
  { id: 'cfo',  name: 'ت', status: 'active', managerUid: 'ceo' },
  { id: 'dev1', name: 'ث', status: 'active', managerUid: 'cto' },
  { id: 'dev2', name: 'ج', status: 'active', managerUid: 'cto' },
  { id: 'acct', name: 'ح', status: 'active', managerUid: 'cfo' },
  { id: 'solo', name: 'خ', status: 'active' }
];

console.log('\n\x1b[1m═══ الشجرة السليمة ═══\x1b[0m');
t('المرؤوسون المباشرون للمدير التقني', names(directReports('cto', U)), ['dev1', 'dev2']);
t('كل من تحت المدير التنفيذي',          names(allReports('ceo', U)).sort(), ['acct','cfo','cto','dev1','dev2']);
t('كل من تحت المدير التقني',            names(allReports('cto', U)).sort(), ['dev1','dev2']);
t('لا أحد تحت المطوّر',                 names(allReports('dev1', U)), []);
t('سلسلة مديري المطوّر صعوداً',          names(managerChain('dev1', U)), ['cto', 'ceo']);
t('مدير المطوّر المباشر',                managerOf(U[3], U).id, 'cto');
t('جذور الشجرة',                        orgTree(U).tree.map((n) => n.u.id), ['ceo', 'solo']);
t('لا يتيم في شجرة سليمة',              orgTree(U).orphans.length, 0);
t('التسطيح يشمل الجميع',                flattenTree(orgTree(U).tree).length, 7);
t('عمق المطوّر في الشجرة',              flattenTree(orgTree(U).tree).find((n) => n.u.id === 'dev1').depth, 2);

console.log('\n\x1b[1m═══ منع الحلقة قبل الحفظ ═══\x1b[0m');
t('جعل المرؤوس مديراً لمديره = حلقة',   wouldCycle('cto', 'dev1', U), true);
t('جعل الشخص مدير نفسه = حلقة',        wouldCycle('cto', 'cto', U), true);
t('جعل حفيده مديراً له = حلقة',         wouldCycle('ceo', 'dev1', U), true);
t('مدير من فرع آخر = لا حلقة',          wouldCycle('dev1', 'cfo', U), false);
t('بلا مدير = لا حلقة',                 wouldCycle('dev1', '', U), false);
t('المرشّحون يستبعدون النفس والحلقة',   names(managerCandidates('cto', U)).sort(), ['acct','ceo','cfo','solo']);

console.log('\n\x1b[1m═══ حلقة موجودة فعلاً في البيانات ═══\x1b[0m');
/* x ← y ← x : لا جذر لهما. بلا حارس الزيارة تدور كل دالة هنا للأبد. */
const C = [
  { id: 'x', name: 'x', status: 'active', managerUid: 'y' },
  { id: 'y', name: 'y', status: 'active', managerUid: 'x' },
  { id: 'z', name: 'z', status: 'active' }
];
const ct = orgTree(C);
t('الحلقة لا تُسقط أحداً بصمت', names(ct.orphans).sort(), ['x', 'y']);
t('من خارج الحلقة يبقى جذراً',  ct.tree.map((n) => n.u.id), ['z']);
t('allReports لا تدور للأبد',   names(allReports('x', C)), ['y']);
t('managerChain لا تدور للأبد', names(managerChain('x', C)), ['y']);

console.log('\n\x1b[1m═══ مدير محذوف ═══\x1b[0m');
const D = [{ id: 'a', name: 'a', status: 'active', managerUid: 'GONE' }];
t('من مديره محذوف يصير جذراً لا يختفي', orgTree(D).tree.map((n) => n.u.id), ['a']);
t('ولا يُعدّ يتيماً',                     orgTree(D).orphans.length, 0);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
