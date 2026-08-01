/* ═══════════════════════════════════════════════════════════════════════════
   الموظفون — القراءة والإنشاء والتعديل والتعليق والحذف واستعادة الوصول.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
  serverTimestamp, createAuthAccount
} from './firebase.js';
import { getMe, getSettings, getUsers, setUsers } from './state.js';
import { normPhone } from './phone.js';
import { LOGIN_EMAIL_DOMAIN } from '../config/firebase.config.js';
import { logAction } from './audit.js';

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
  const newUid = await createAuthAccount(email, password);

  const balances = {};
  (getSettings().leaveTypes || []).forEach((t) => { if (t.deduct) balances[t.id] = t.balance; });

  await setDoc(doc(db, 'users', newUid), {
    ...base, email, status: 'active', balances,
    mustChangePassword: true, createdAt: serverTimestamp()
  });
  await logAction('إضافة موظف', `${base.name} (${base.phone})`);
  return newUid;
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

  const newUid = await createAuthAccount(email, tempPassword);

  const { id, ...data } = u;
  await setDoc(doc(db, 'users', newUid), { ...data, email, mustChangePassword: true });

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

export { emailFor };
