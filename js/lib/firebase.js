/* ═══════════════════════════════════════════════════════════════════════════
   نقطة الدخول الوحيدة لـ Firebase.

   هذا هو الملف الوحيد في المشروع الذي يذكر رابط gstatic — كل الملفات الأخرى
   تستورد منه. لو تغيّرت نسخة الـ SDK يوماً، تتغيّر هنا فقط.
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, createUserWithEmailAndPassword, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  addDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  runTransaction
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
  runTransaction
};

/* ── إنشاء حساب لموظف جديد دون تسجيل خروج الأدمن ──
   ينشئ تطبيق Firebase ثانوي مؤقت، ينشئ الحساب، ثم يهدم التطبيق.
   النسخة القديمة كانت تنسى deleteApp فتتراكم النسخ في الذاكرة كل إضافة موظف. */
export async function createAuthAccount(email, password) {
  const secondary = initializeApp(firebaseConfig, 'secondary_' + Date.now());
  try {
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secAuth);
    return uid;
  } finally {
    /* يُنفَّذ حتى عند رمي الخطأ — وإلا تسرّبت نسخة التطبيق */
    try { await deleteApp(secondary); } catch (e) { /* لا شيء نفعله */ }
  }
}
