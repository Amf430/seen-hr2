/* ═══════════════════════════════════════════════════════════════════════════
   اختبار ملفّي النشر — firebase.json و firestore.indexes.json

   ── لماذا يستحق هذا اختباراً ──
   هذان الملفان لا يكسران شيئاً على جهاز المطوّر: التطبيق يشتغل محلياً بلا CSP
   وبلا فهارس. يكسران في الإنتاج وحده، وبعد النشر، وبطريقتين صامتتين:

   • تبعية CDN جديدة بلا إدخالها في Content-Security-Policy → المتصفح يحجبها
     بلا خطأ في الشيفرة، فتظهر شاشة نصفها فارغ والسبب في تبويب Console وحده.
   • استعلام مركّب بلا فهرس منشور → Firestore يرفض الاستعلام **كاملاً**،
     فالشاشة فارغة مع خطأ صلاحيات يبدو وكأنه مشكلة في القواعد.

   الاختبار يمسح js/ ويستخرج كل مضيف خارجي مذكور في الشيفرة، ثم يتحقّق أنه
   مُصرَّح به في CSP. فمن يضيف مكتبة من CDN غداً وينسى الترويسة، يسقط عنده
   `npm test` قبل أن يصل الأمر إلى مستخدم.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const t = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31m✗\x1b[0m ${label}\n      توقّع ${e}\n      وجد  ${a}`); fail++; }
};
const ok = (label, cond) => t(label, !!cond, true);

const fb  = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));
const csp = fb.hosting.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy').value;

/* ═══ ١. ملف الفهارس ═══ */
console.log('\n\x1b[1m═══ ١. ملف الفهارس ═══\x1b[0m');

let idx = null;
try { idx = JSON.parse(readFileSync(join(ROOT, 'firestore.indexes.json'), 'utf8')); } catch { /* يبقى null */ }

ok('firestore.indexes.json موجود وصالح', idx !== null);
ok('فيه مصفوفة indexes', Array.isArray(idx && idx.indexes));
ok('فيه مصفوفة fieldOverrides', Array.isArray(idx && idx.fieldOverrides));

/* بلا هذا المفتاح لا ينشر firebase الفهارس إطلاقاً — والملف يصير زينة */
t('firebase.json يشير إلى ملف الفهارس', fb.firestore.indexes, 'firestore.indexes.json');
t('ويشير إلى ملف القواعد', fb.firestore.rules, 'firestore.rules');

/* ملفات الإعداد يجب ألا تُنشر كأصول عامة على الاستضافة */
['firebase.json', 'firestore.rules', 'firestore.indexes.json'].forEach((f) => {
  ok(`${f} مستثنى من النشر العام`, fb.hosting.ignore.includes(f));
});

/* ═══ ٢. ترويسات الأمان لم تُضعَّف ═══ */
console.log('\n\x1b[1m═══ ٢. ترويسات الأمان ═══\x1b[0m');

[
  ["frame-ancestors 'none'", 'منع التأطير'],
  ["object-src 'none'",      'منع الكائنات المدمجة'],
  ["base-uri 'self'",        'تثبيت base'],
  ["default-src 'self'",     'الافتراضي محصور بالمصدر']
].forEach(([needle, label]) => ok(`CSP: ${label}`, csp.includes(needle)));

ok("لا 'unsafe-eval' في CSP", !csp.includes('unsafe-eval'));
ok('لا * مفتوحة في CSP', !/(^|\s)\*[\s;]/.test(csp));

const others = fb.hosting.headers.flatMap((h) => h.headers).map((h) => h.key);
['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy',
 'Permissions-Policy', 'Strict-Transport-Security'].forEach((k) => {
  ok(`ترويسة ${k} باقية`, others.includes(k));
});

/* ═══ ٣. كل مضيف خارجي في الشيفرة مُصرَّح به في CSP ═══ */
console.log('\n\x1b[1m═══ ٣. مضيفو CDN مقابل CSP ═══\x1b[0m');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

/* {s}.tile.openstreetmap.org يحمل نائباً في الاسم — نطبّعه إلى نطاق البدل
   حتى يطابق الشكل الذي تُكتب به القاعدة في CSP. */
const normalize = (host) => host.replace(/^\{s\}\./, '*.');

const hosts = new Set();
walk(join(ROOT, 'js')).forEach((file) => {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/https:\/\/([a-z0-9.*{}-]+)/gi)) hosts.add(normalize(m[1]));
});

/* المضيفون المسموح لهم بالغياب عن CSP: مذكورون في تعليقات أو نصوص إسناد
   لا في طلب شبكة. أي إضافة هنا تحتاج سبباً مكتوباً. */
const NOT_FETCHED = new Set([
  'unpkg.com/leaflet@1.9.4/dist/leaflet.js',   /* الثابت الكامل — المضيف نفسه مُغطّى */
  /* WEBAUTHN_RP_ID: نصّ يوقّع عليه المتصفح، لا عنوان يُطلب من الشبكة.
     إدخاله في CSP بلا معنى — اقرأ التعليق في js/config/firebase.config.js */
  'amf430.github.io',
  'amf430.github.io/seen-hr2/',
]);

const cspAllows = (host) => {
  if (csp.includes(host)) return true;
  /* نطاق البدل: *.googleapis.com يغطّي firestore.googleapis.com */
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (csp.includes('*.' + parts.slice(i).join('.'))) return true;
  }
  return false;
};

let unlisted = [];
hosts.forEach((h) => {
  const bare = h.split('/')[0];
  if (NOT_FETCHED.has(h)) return;
  if (!cspAllows(bare)) unlisted.push(bare);
});
unlisted = [...new Set(unlisted)];

t('لا مضيف خارجي في js/ خارج CSP', unlisted, []);
ok('مُسح شيء فعلاً (حراسة ضد مسح فارغ)', hosts.size >= 3);

/* المضيفون الذين أدخلتهم المرحلة ٦ — مذكورون بالاسم حتى يسقط الاختبار
   لو حذفهم أحد من CSP وترك الخريطة تعمل محلياً وتنكسر منشورةً. */
console.log('\n\x1b[1m═══ ٤. مضيفو الخريطة (المرحلة ٦) ═══\x1b[0m');
ok('unpkg.com في script-src', /script-src[^;]*unpkg\.com/.test(csp));
ok('unpkg.com في style-src',  /style-src[^;]*unpkg\.com/.test(csp));
/* أيقونة الدبّوس الافتراضية في Leaflet تُطلب من unpkg بجوار ملف CSS */
ok('unpkg.com في img-src',    /img-src[^;]*unpkg\.com/.test(csp));
ok('خوادم البلاطات في img-src', /img-src[^;]*\*\.tile\.openstreetmap\.org/.test(csp));
ok('nominatim في connect-src', /connect-src[^;]*nominatim\.openstreetmap\.org/.test(csp));

/* ⚠️ خلل حيّ كشفه هذا الاختبار أول مرة شُغّل (٢٠٢٦-٠٨-١٢):
   location-view.js:85 يعرض خريطة OSM داخل <iframe> منذ الكوميت c1b6132،
   وCSP ما كان فيه frame-src إطلاقاً. و frame-src يرث default-src 'self'
   عند غيابه — أي أن الإطار كان **محجوباً في الإنتاج** طوال تلك المدة:
   الأدمن يفتح «تفصيل الجلسة» فيرى مربّعاً فارغاً بلا خطأ ولا تفسير.
   ⚠️ frame-src غير frame-ancestors: الأولى «ماذا نُضمّن نحن»، والثانية
   «من يقدر يُضمّننا» وتبقى 'none'. لا تحذف إحداهما ظنّاً أنها الأخرى. */
ok('frame-src يسمح بخريطة OSM المدمجة', /frame-src[^;]*www\.openstreetmap\.org/.test(csp));
ok("frame-ancestors ما زالت 'none'", /frame-ancestors 'none'/.test(csp));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
