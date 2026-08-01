/* ═══════════════════════════════════════════════════════════════════════════
   نقطة الدخول الوحيدة لـ Firebase.

   هذا هو الملف الوحيد في المشروع الذي يذكر رابط gstatic — كل الملفات الأخرى
   تستورد منه. لو تغيّرت نسخة الـ SDK يوماً، تتغيّر هنا فقط.
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, createUserWithEmailAndPassword, updatePassword, deleteUser
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  addDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  runTransaction, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { firebaseConfig } from '../config/firebase.config.js';

const fbApp = initializeApp(firebaseConfig);

export const auth = getAuth(fbApp);
export const db   = getFirestore(fbApp);

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
