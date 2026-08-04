/* ═══════════════════════════════════════════════════════════════════════════
   اختبار تمييز «ألغى الموظف» من «عجز الجهاز».

   ⚠️ لماذا يستحقّ هذا اختباراً مستقلاً: هذا السطر تأرجح مرّتين في تاريخ
   المشروع، وكل مرة كسر الطرف المقابل.

     النسخة ١ : أي فشل يمنع التسجيل
                → موظف جواله بلا قفل شاشة يقف داخل الفرع عاجزاً
     النسخة ٢ : لا شيء يمنع التسجيل إطلاقاً
                → من يُلغي شاشة الوجه قصداً يُسجَّل حضوره رغماً عنه،
                  فيصير «داخل العمل» بلا أن يُتمّ شيئاً
     النسخة ٣ : التمييز — وهي المُختبَرة هنا

   إضافة سبب جديد إلى BIO_REASON_AR بلا تصنيفه يقع في أحد الخطأين بصمت،
   ولن يكتشفه أحد إلا من شكوى موظف.
   ═══════════════════════════════════════════════════════════════════════════ */

/* biometric.js تلمس window/location. نودي 24 يوفّر navigator جاهزاً (وهو
   للقراءة فقط، فلا يُعاد تعريفه)، ويكفي إضافة الباقي. defineProperty لا
   الإسناد المباشر: بعض هذه الأسماء معرَّفة كـ getter في نودي الحديث. */
const shim = (name, value) => {
  if (name in globalThis) return;
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
};
shim('location', { hostname: 'localhost', protocol: 'https:', href: 'https://localhost/' });
shim('window', { location: globalThis.location });

const { bioUserCancelled, bioReasonAr } = await import('../js/lib/biometric.js');

let pass = 0, fail = 0;
const t = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`); pass++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      توقّع ${JSON.stringify(expected)}\n      وجد  ${JSON.stringify(actual)}`);
    fail++;
  }
};
const res = (reason, ok = false) => ({ ok, enrolled: true, reason });

console.log('\n\x1b[1m═══ إلغاء متعمَّد — تُلغى العملية ═══\x1b[0m');
t('رفض شاشة التحقق',            bioUserCancelled(res('cancelled')), true);
t('رفض ربط الجهاز أول مرة',      bioUserCancelled(res('declined-enroll')), true);

console.log('\n\x1b[1m═══ عجز الجهاز أو بيئته — تمضي العملية ═══\x1b[0m');
for (const r of ['unsupported-browser', 'in-app-browser', 'no-screen-lock',
                 'insecure-context', 'probe-failed', 'rp-id-mismatch']) {
  t(r, bioUserCancelled(res(r)), false);
}

console.log('\n\x1b[1m═══ الحالات الملتبسة ═══\x1b[0m');
/* بصمة لم تُطابَق قد تكون إصبعاً خاطئاً أو مستشعراً متّسخاً — لا قرار إلغاء */
t('verify-failed ليست إلغاءً',   bioUserCancelled(res('verify-failed')), false);
/* الربط نجح — مسار نجاح لا فشل، ويجب أن يمضي التسجيل بعده */
t('enrolled-now ليست إلغاءً',    bioUserCancelled(res('enrolled-now')), false);

console.log('\n\x1b[1m═══ النجاح لا يُلغى أبداً ═══\x1b[0m');
t('نجاح التحقق',                 bioUserCancelled({ ok: true, enrolled: true, reason: '' }), false);
/* ⚠️ حارس: لو صار ok=true مع سبب إلغاء (تناقض)، النجاح يفوز ولا نُلغي */
t('ok=true يتقدّم على السبب',    bioUserCancelled(res('cancelled', true)), false);

console.log('\n\x1b[1m═══ حراسة المدخلات ═══\x1b[0m');
t('null',                        bioUserCancelled(null), false);
t('undefined',                   bioUserCancelled(undefined), false);
t('كائن بلا سبب',                bioUserCancelled({ ok: false }), false);
t('سبب مجهول',                   bioUserCancelled(res('something-new')), false);

console.log('\n\x1b[1m═══ كل سبب له رسالة عربية ═══\x1b[0m');
for (const r of ['cancelled', 'declined-enroll', 'no-screen-lock', 'enrolled-now',
                 'unsupported-browser', 'in-app-browser', 'insecure-context',
                 'probe-failed', 'rp-id-mismatch', 'verify-failed']) {
  const m = bioReasonAr(r);
  t(`${r} → رسالة مخصّصة`, m !== 'تعذّر التحقق بالبصمة' && m.length > 5, true);
}
t('سبب مجهول يسقط على رسالة عامة', bioReasonAr('nope'), 'تعذّر التحقق بالبصمة');

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
