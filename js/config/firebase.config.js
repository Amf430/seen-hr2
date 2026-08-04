/* ═══════════════════════════════════════════════════════════════════════════
   إعدادات Firebase

   هذه القيم عامة بطبيعتها — أي شخص يفتح الموقع يقدر يشوفها، وهذا طبيعي ومقصود
   في Firebase. الحماية الحقيقية ليست في إخفاء المفتاح، بل في:
     • قواعد الأمان في firestore.rules
     • تقييد المفتاح على النطاقات المسموحة من Firebase Console
   ═══════════════════════════════════════════════════════════════════════════ */

export const firebaseConfig = {
  apiKey:     'AIzaSyDYSQpDVA4r-9XjitIMn53VfEuOjG1D3jI',
  authDomain: 'seen-hr2.firebaseapp.com',
  projectId:  'seen-hr2'
};

/* بريد المدير — أول دخول بهذا البريد يحاول إنشاء حساب الأدمن.
   قواعد الأمان تمنع الإنشاء الذاتي، فلو رُفض تُنشأ الوثيقة يدوياً من Console. */
export const ADMIN_EMAIL = 'alaahoms43@gmail.com';

/* لاحقة البريد الداخلي المشتق من رقم الجوال — يبقى النظام مجانياً بالكامل */
export const LOGIN_EMAIL_DOMAIN = '@seen-hr.local';

/* ═══ النطاق المعتمد لمفاتيح البصمة (WebAuthn) ═══

   الموقع منشور على GitHub Pages:  https://amf430.github.io/seen-hr2/
   إذاً الأصل (origin) هو  https://amf430.github.io  والمسار /seen-hr2/ لا
   يدخل في الحساب — rp.id نطاق فقط، بلا مسار.

   لماذا 'amf430.github.io' وليس 'github.io':
   المواصفة تمنع استخدام «لاحقة عامة» كـ rp.id، و github.io مُدرج في قائمة
   اللواحق العامة (Public Suffix List) لأن كل مستخدم GitHub يأخذ نطاقاً فرعياً
   تحته. فأصغر نطاق مسموح هو amf430.github.io.

   ⚠️ نتيجة مهمة على الأمان: كل مشروع ثانٍ ينشره نفس الحساب على GitHub Pages
   يشترك مع هذا الموقع في نفس الأصل — نفس localStorage ونفس مفاتيح WebAuthn.
   لو نُشر مشروع آخر تحت amf430.github.io فسيقدر يقرأ فهرس البصمات ويستخدم
   نفس المفاتيح. الحل الجذري نطاق خاص بالنظام وحده. */
export const WEBAUTHN_RP_ID = 'amf430.github.io';
