/* ═══════════════════════════════════════════════════════════════════════════
   نافذة الاستئذان — ثلاثة أيام ثم تُغلق.

   القاعدة تُنفَّذ في ثلاثة مواضع: النموذج (min على حقل التاريخ)، و
   submitRequest، و firestore.rules. هذا الملف يختبر المنطق المشترك الذي
   يقف خلف الأول والثاني، والحدّ نفسه مُختبَر على القاعدة في rules.test.mjs.

   ⚠️ لا نستورد requests.js نفسه: هو يستورد firebase.js التي تجلب SDK من
   gstatic وتُنشئ تطبيقاً حقيقياً وقت الاستيراد. الدالتان صافيتان بلا حالة،
   فنُعيدهما هنا حرفياً — ولو تغيّرت هناك سقط الاختبار على الحدّ.
   ═══════════════════════════════════════════════════════════════════════════ */

const PERM_BACKDATE_DAYS = 3;

const ymd = (d) => d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

function permOldestDate(today) {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - PERM_BACKDATE_DAYS);
  return ymd(d);
}
const permWindowOpen = (dateStr, today) => !!dateStr && dateStr >= permOldestDate(today);

let pass = 0, fail = 0;
const check = (name, expected, actual) => {
  const ok = expected === actual;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `  → توقّعنا ${expected} وجاء ${actual}`));
};

console.log('\n\x1b[1m═══ النافذة من الداخل ═══\x1b[0m');
const T = '2026-08-04';
check('اليوم نفسه',                    true,  permWindowOpen('2026-08-04', T));
check('أمس',                           true,  permWindowOpen('2026-08-03', T));
check('قبل يومين',                     true,  permWindowOpen('2026-08-02', T));
check('قبل ثلاثة أيام — آخر يوم مقبول', true,  permWindowOpen('2026-08-01', T));

console.log('\n\x1b[1m═══ النافذة من الخارج ═══\x1b[0m');
check('قبل أربعة أيام — أول يوم مرفوض', false, permWindowOpen('2026-07-31', T));
check('قبل خمسة أيام',                 false, permWindowOpen('2026-07-30', T));
check('الشهر الماضي',                  false, permWindowOpen('2026-07-04', T));

console.log('\n\x1b[1m═══ المستقبل مفتوح — الاستئذان يُقدَّم مقدَّماً ═══\x1b[0m');
check('غداً',                          true,  permWindowOpen('2026-08-05', T));
check('الأسبوع القادم',                true,  permWindowOpen('2026-08-11', T));

console.log('\n\x1b[1m═══ عبور حدود الشهر والسنة ═══\x1b[0m');
check('أول الشهر يصل آخر الذي قبله',   '2026-07-29', permOldestDate('2026-08-01'));
check('أول مارس بعد فبراير قصير',      '2026-02-26', permOldestDate('2026-03-01'));
check('أول يناير يعبر السنة',          '2025-12-29', permOldestDate('2026-01-01'));
check('استئذان عن ٣١ ديسمبر يوم ٢ يناير', true, permWindowOpen('2025-12-31', '2026-01-02'));

console.log('\n\x1b[1m═══ مدخلات فارغة ═══\x1b[0m');
check('تاريخ فارغ مرفوض',              false, permWindowOpen('', T));
check('undefined مرفوض',               false, permWindowOpen(undefined, T));
check('null مرفوض',                    false, permWindowOpen(null, T));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
