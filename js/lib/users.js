/* ═══════════════════════════════════════════════════════════════════════════
   الموظفون — القراءة والإنشاء والتعديل والتعليق والحذف واستعادة الوصول.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
  serverTimestamp, createAuthAccount
} from './firebase.js';
import { getMe, getSettings, getUsers, setUsers, patchMe } from './state.js';
import { normPhone } from './phone.js';
import { LOGIN_EMAIL_DOMAIN } from '../config/firebase.config.js';
import { logAction } from './audit.js';
import { normalizeDocs } from './documents.js';

/* الأدمن يقرأ الكل، ومدير القسم يقرأ قسمه فقط — مطابق لقاعدة users */
export async function refreshUsers() {
  const me = getMe();
  const q1 = (me.role === 'manager')
    ? query(collection(db, 'users'), where('department', '==', me.department || '—'))
    : query(collection(db, 'users'));
  const s = await getDocs(q1);
  setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })));
  return getUsers();
}

/* ── كلمة مرور مؤقتة ──
   النسخة القديمة كانت تستعمل «123456» ثابتة لكل استعادة وصول، وتكتبها في
   سجل الحركات بنصّها الصريح (السطر 1530). أي شخص يفتح السجل كان يقدر يدخل
   بحساب أي موظف استُعيد وصوله ولم يغيّر كلمته بعد.

   البديل: كلمة عشوائية قوية تُعرض للأدمن مرة واحدة في الشاشة لينقلها للموظف،
   ولا تُكتب في السجل ولا في أي مكان آخر. */
export function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

const emailFor = (phone) => normPhone(phone) + LOGIN_EMAIL_DOMAIN;

/* ── إنشاء موظف ──
   يُنشأ حساب الدخول عبر تطبيق Firebase ثانوي حتى لا يُسجَّل خروج الأدمن،
   والتطبيق الثانوي يُهدم بعدها (النسخة القديمة كانت تنساه فيتراكم). */
export async function createEmployee(base, password) {
  const phoneDigits = normPhone(base.phone);
  const email = phoneDigits + LOGIN_EMAIL_DOMAIN;
  const acct = await createAuthAccount(email, password);

  const balances = {};
  (getSettings().leaveTypes || []).forEach((t) => { if (t.deduct) balances[t.id] = t.balance; });

  /* ⚠️ فشل كتابة الملف يُتبَع بحذف حساب Auth فوراً. بدون هذا التراجع كان
     رقم الجوال يُقفل نهائياً: الحساب موجود في Auth بلا ملف، وكل إعادة محاولة
     ترجع auth/email-already-in-use، ولا مخرج إلا الحذف اليدوي من Console. */
  try {
    await setDoc(doc(db, 'users', acct.uid), {
      ...base, email, status: 'active', balances,
      mustChangePassword: true, createdAt: serverTimestamp()
    });
  } catch (e) {
    await acct.rollback();
    throw e;
  }
  await acct.done();

  await logAction('إضافة موظف', `${base.name} (${base.phone})`);
  return acct.uid;
}

export async function updateEmployee(id, fields) {
  await updateDoc(doc(db, 'users', id), fields);
  await logAction('تعديل موظف', fields.name || id);
}

export async function toggleSuspend(u) {
  const ns = u.status === 'active' ? 'suspended' : 'active';
  await updateDoc(doc(db, 'users', u.id), { status: ns });
  await logAction(ns === 'suspended' ? 'تعليق حساب' : 'تفعيل حساب', u.name);
  return ns;
}

/* ⚠️ يُحذف ملف الموظف من Firestore، لكن حساب الدخول يبقى في Firebase
   Authentication ولازم يُحذف يدوياً من Console.
   الفرق عن السابق: القواعد الجديدة تشترط وجود ملف الموظف (hasP) لأي عملية،
   فالحساب اليتيم ما عاد يقدر يقرأ ولا يكتب أي شيء — صار قشرة فارغة. */
export async function deleteEmployee(u) {
  await deleteDoc(doc(db, 'users', u.id));
  await logAction('حذف موظف', u.name);
}

/* ── استعادة الوصول ──
   يُنشأ حساب دخول جديد بنفس رقم الجوال، وتُنقل بيانات الموظف وكل طلباته
   للحساب الجديد حتى لا يضيع شيء، ثم يُحذف الملف القديم.
   كلمة المرور تُرجَع للمنادي ليعرضها للأدمن — ولا تُسجَّل في سجل الحركات. */
export async function restoreAccess(u, requestsOfUser, updateRequestOwner) {
  const phoneDigits = normPhone(u.phone);
  const email = phoneDigits ? phoneDigits + LOGIN_EMAIL_DOMAIN : u.email;
  const oldUid = u.id;
  const tempPassword = generateTempPassword();

  const acct = await createAuthAccount(email, tempPassword);
  const newUid = acct.uid;

  const { id, ...data } = u;
  /* نفس التراجع: لو فشلت كتابة الملف الجديد نحذف الحساب بدل أن يُقفل الرقم
     ويصير الموظف بلا حساب قديم ولا جديد. */
  try {
    await setDoc(doc(db, 'users', newUid), { ...data, email, mustChangePassword: true });
  } catch (e) {
    await acct.rollback();
    throw e;
  }
  await acct.done();

  const olds = await requestsOfUser(oldUid);
  for (const r of olds) await updateRequestOwner(r.id, newUid);

  await deleteDoc(doc(db, 'users', oldUid));
  /* التفاصيل بلا كلمة المرور — عمداً */
  await logAction('استعادة وصول موظف', `${u.name} — أُنشئ حساب جديد بكلمة مرور مؤقتة`);
  return { newUid, tempPassword };
}

/* فهرس مفاتيح البصمة على وثيقة الموظف. القاعدة تسمح للموظف بتحديث هذا
   الحقل وحده (مع mustChangePassword)، وتشترط أن يكون قائمة بحد أقصى 5. */
export async function saveBioCredentials(list) {
  const me = getMe();
  if (!me) return;
  await updateDoc(doc(db, 'users', me.id), { bioCredentials: list.slice(0, 5) });
}

/* ═══ بيانات الاتصال — يحدّثها الموظف بنفسه ═══

   الحقول الأربعة هي كل ما تسمح به القاعدة للموظف على وثيقته (مع
   mustChangePassword و bioCredentials). القصّ هنا ليس تجميلاً: القاعدة ترفض
   الكتابة كاملةً لو تجاوز أي حقل سقفه، فالقصّ يمنع رفضاً محيّراً بعد أن
   لصق الموظف عنواناً طويلاً.

   ⚠️ `phone` ليس منها ولن يكون: هو هوية الدخول، وتغييره يحتاج تغييراً
   مقابلاً في Firebase Auth لا تقدر عليه الواجهة. يبقى بيد الأدمن. */
export const CONTACT_LIMITS = {
  personalEmail: 120, address: 200, emergencyName: 80, emergencyPhone: 20
};

export async function saveMyContact(fields) {
  const me = getMe();
  if (!me) return;
  const clean = {};
  for (const [k, max] of Object.entries(CONTACT_LIMITS)) {
    if (k in fields) clean[k] = String(fields[k] ?? '').trim().slice(0, max);
  }
  if (!Object.keys(clean).length) return;
  await updateDoc(doc(db, 'users', me.id), clean);
  /* الحالة المحلية تُحدَّث فوراً: لا اشتراك حيّ على وثيقة الموظف نفسه،
     فبدون هذا يبقى ما يراه قديماً حتى يعيد تحميل الصفحة. */
  patchMe(clean);
  await logAction('تحديث بيانات الاتصال', me.name || '');
}

/* ═══ مستندات الموظف ═══
   الكتابة تعيش هنا مع بقية الكتابات على وثيقة الموظف، حتى تبقى
   documents.js وحدة طرفية قابلة للاختبار بـ node وحده.

   القاعدة تسمح للأدمن وحده — الموظف الذي يقدر يعدّل تاريخ انتهاء إقامته
   يقدر يخفي انتهاءها، والغرامة على الشركة لا عليه. */
export async function saveDocuments(user, list) {
  const docs = normalizeDocs(list);
  await updateDoc(doc(db, 'users', user.id), { documents: docs });
  await logAction('تحديث مستندات موظف', `${user.name || ''} — ${docs.length} مستند`);
  return docs;
}

export { emailFor };
