/* ═══════════════════════════════════════════════════════════════════════════
   المصادقة.

   لا تستورد هذه الوحدة أي صفحة ولا القشرة ولا الراوتر — تستقبل نداءات
   راجعة (callbacks) من main.js. بهذا تنحلّ الدورة التي كانت في النسخة
   القديمة، حيث كان onAuthStateChanged ينادي enterApp() و loadSettings()
   مباشرة (السطور 583-591).
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  auth, db, doc, getDoc, setDoc, updateDoc, serverTimestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, updatePassword
} from './firebase.js';
import { ADMIN_EMAIL } from '../config/firebase.config.js';
import { getMe, setMe, patchMe } from './state.js';
import { toLoginEmail } from './phone.js';

export const AUTH_ERRORS = {
  'auth/invalid-credential':     'بيانات الدخول غير صحيحة',
  'auth/user-not-found':         'الحساب غير موجود',
  'auth/wrong-password':         'كلمة المرور غير صحيحة',
  'auth/invalid-email':          'صيغة البريد غير صحيحة',
  'auth/too-many-requests':      'محاولات كثيرة، حاول لاحقاً',
  'auth/network-request-failed': 'تعذّر الاتصال بالشبكة',
  'auth/user-disabled':          'هذا الحساب موقوف'
};
export const authError = (code) => AUTH_ERRORS[code] || 'تعذّر تسجيل الدخول';

export async function login(rawInput, password) {
  const email = toLoginEmail(rawInput);
  await signInWithEmailAndPassword(auth, email, password);
}

export const logout = () => signOut(auth);

/* استعادة كلمة المرور تعمل فقط للبريد الحقيقي — أرقام الجوال تُحوّل لبريد
   داخلي وهمي لا يصله شيء، فالموظف يراجع الأدمن. */
export async function requestPasswordReset(rawInput) {
  if (!rawInput.includes('@')) {
    const err = new Error('local-account');
    err.code = 'local-account';
    throw err;
  }
  await sendPasswordResetEmail(auth, rawInput);
}

export async function changeOwnPassword(newPassword) {
  await updatePassword(auth.currentUser, newPassword);
  await updateDoc(doc(db, 'users', getMe().id), { mustChangePassword: false });
  patchMe({ mustChangePassword: false });
}

/* تحميل ملف الموظف المرتبط بالحساب */
async function loadMe(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) { setMe({ id: user.uid, ...snap.data() }); return; }

  /* أول دخول ببريد الأدمن — محاولة إنشاء ملف الأدمن تلقائياً.
     قواعد الأمان تمنع الإنشاء الذاتي عمداً (allow create: if isAdmin)، فلو
     رُفض تُنشأ الوثيقة يدوياً من Console. الرسالة تشرح ذلك للمستخدم. */
  if (user.email === ADMIN_EMAIL) {
    const data = {
      name: 'مدير الموارد البشرية', empId: 'ADMIN', department: 'الموارد البشرية',
      jobTitle: 'مدير النظام', email: user.email, phone: '', manager: '', hireDate: '',
      role: 'admin', status: 'active', balances: {}, createdAt: serverTimestamp()
    };
    try {
      await setDoc(ref, data);
      setMe({ id: user.uid, ...data });
      return { seeded: true };
    } catch (e) {
      console.error(e);
      throw new Error('admin-blocked');
    }
  }
  throw new Error('no-profile');
}

export const LOAD_ERRORS = {
  'no-profile':    'لا يوجد ملف موظف مرتبط بهذا الحساب. تواصل مع الموارد البشرية.',
  'admin-blocked': 'قواعد الأمان تمنع إنشاء حساب الأدمن تلقائياً. أنشئ وثيقة في Firestore داخل users بمعرّف حسابك (UID) وبها role: "admin".',
  'suspended':     'هذا الحساب معلّق. راجع الموارد البشرية.'
};

/* ── نقطة الدخول ──
   main.js يمرّر ما يجب فعله في كل حالة، فتبقى هذه الوحدة جاهلة بالواجهة. */
export function initAuth({ onSignedOut, onNeedsPassword, onAuthenticated, onError }) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { setMe(null); onSignedOut(); return; }
    try {
      const res = await loadMe(user);

      /* الحساب المعلّق يُخرَج فوراً.
         ⚠️ هذا للواجهة فقط — الحماية الفعلية في القاعدة isActive() التي
         ترفض كل قراءة وكتابة للحساب المعلّق. في النسخة السابقة كان هذا
         الفحص هو الوحيد، فكان الموظف المعلّق يبقى يقرأ ويكتب من الكونسول. */
      if (getMe().status === 'suspended') {
        await signOut(auth);
        onError(LOAD_ERRORS.suspended);
        return;
      }
      if (getMe().mustChangePassword) { onNeedsPassword(); return; }
      await onAuthenticated(res && res.seeded);
    } catch (e) {
      console.error(e);
      onError(LOAD_ERRORS[e.message] || 'تعذّر تحميل بيانات الحساب');
      await signOut(auth);
    }
  });
}
