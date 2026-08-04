/* ═══════════════════════════════════════════════════════════════════════════
   نقطة الدخول الوحيدة لـ Firebase.

   هذا هو الملف الوحيد في المشروع الذي يذكر رابط gstatic — كل الملفات الأخرى
   تستورد منه. لو تغيّرت نسخة الـ SDK يوماً، تتغيّر هنا فقط.
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, createUserWithEmailAndPassword, updatePassword, deleteUser
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  addDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  runTransaction, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { firebaseConfig } from '../config/firebase.config.js';

const fbApp = initializeApp(firebaseConfig);

export const auth = getAuth(fbApp);
export const db   = getFirestore(fbApp);

/* ═══ المحاكي المحلي — للتجربة وحدها ═══

   ── لماذا يوجد هذا أصلاً ──
   قيادة النظام كاملاً من شاشة الدخول إلى آخر صفحة كانت تتطلّب حساباً حقيقياً
   على الإنتاج، وكل ضغطة زرّ فيه تكتب سجلاً حقيقياً: حضور بتاريخ اليوم لموظف
   حقيقي، وطلب يصل صندوق مدير حقيقي، وسطر في auditLog لا يُحذف أبداً
   (allow update, delete: if false). فالتجربة نفسها كانت تلوّث ما تختبره.

   مع المحاكي تُقاد الأدوار الثلاثة على بيانات مصطنعة، ولا يُكتب حرف واحد في
   الإنتاج، وتُعاد التجربة كلما تغيّر شيء.

   ⚠️⚠️ الشرط hostname وحده يفصل الاثنين، فاقرأه بدقة قبل تعديله:
   يعمل على localhost و 127.0.0.1 فقط. النظام منشور على
   amf430.github.io — وهو ليس أياً منهما، فلا يمرّ هذا الفرع في الإنتاج
   إطلاقاً ولا يتغيّر سلوكه بحرف. أي توسيع لهذا الشرط يوجّه بيانات حقيقية
   إلى خادم وهمي، أو أسوأ: يوجّه بيانات التجربة إلى الإنتاج.

   ⚠️ ولا يكفي hostname وحده: نشترط أيضاً وجود العَلَم في localStorage، حتى
   لا يتحوّل أي فتح محلي للنظام (تصفّح عادي على جهاز مطوّر) إلى محاكي بصمت
   فيظنّ أن بياناته اختفت. يُفعَّل من صفحة البذور.

   التفعيل:  localStorage.setItem('seen-hr:emulator', '1')  ثم أعد التحميل. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
export const usingEmulator = (() => {
  if (typeof window === 'undefined') return false;
  if (!LOCAL_HOSTS.includes(location.hostname)) return false;
  let on = false;
  try { on = localStorage.getItem('seen-hr:emulator') === '1'; } catch (e) { on = false; }
  if (!on) return false;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.log('[seen-hr] يعمل على المحاكي المحلي — لا اتصال بالإنتاج');
  return true;
})();

export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, createUserWithEmailAndPassword, updatePassword,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  addDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  runTransaction, Timestamp
};

/* ═══ إنشاء حساب لموظف جديد دون تسجيل خروج الأدمن ═══

   ينشئ تطبيق Firebase ثانوي مؤقت وينشئ الحساب فيه، فتبقى جلسة الأدمن سليمة.

   ⚠️ لماذا لا تُغلق الدالة على نفسها كما كانت:
   إنشاء الموظف عمليتان — حساب في Auth ثم ملف في Firestore. لو فشلت الثانية
   (شبكة، permission-denied، إغلاق التبويب) يبقى حساب Auth بلا ملف موظف. قواعد
   الأمان تجعله قشرة عاجزة، لكن رقم الجوال يصير محجوزاً: كل محاولة إعادة تعطي
   auth/email-already-in-use، ولا وسيلة لحذفه إلا يدوياً من Firebase Console.

   الآن تُرجع الدالة الجلسة مفتوحة مع `rollback` و `done`. المنادي يستدعي
   rollback() لو فشلت الخطوة الثانية — فيُحذف الحساب الجديد قبل أن يقفل الرقم.
   deleteUser يعمل هنا لأن الحساب مُسجَّل دخوله للتوّ في التطبيق الثانوي،
   فالعملية «حديثة» بمعنى Firebase.

   ⚠️ done() إلزامي في كل المسارات — بدونه تتسرّب نسخة التطبيق الثانوي. */
export async function createAuthAccount(email, password) {
  const secondary = initializeApp(firebaseConfig, 'secondary_' + Date.now());
  const secAuth = getAuth(secondary);
  const destroy = async () => {
    try { await signOut(secAuth); } catch (e) { /* لا شيء نفعله */ }
    try { await deleteApp(secondary); } catch (e) { /* لا شيء نفعله */ }
  };

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(secAuth, email, password);
  } catch (e) {
    await destroy();
    throw e;
  }

  return {
    uid: cred.user.uid,
    /* يُحذف الحساب الجديد ثم تُهدم النسخة الثانوية */
    rollback: async () => {
      try { await deleteUser(cred.user); }
      catch (e) { console.error('rollback deleteUser', e); }
      await destroy();
    },
    /* نجحت العملية كاملة — تُهدم النسخة الثانوية فقط */
    done: destroy
  };
}
