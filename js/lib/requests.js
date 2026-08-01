/* ═══════════════════════════════════════════════════════════════════════════
   طلبات الاستئذان والإجازة — الإنشاء والموافقة والرفض وتعديل الأرصدة.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, collection, addDoc, updateDoc, deleteDoc, getDocs, query, where,
  serverTimestamp, runTransaction
} from './firebase.js';
import { getMe, getSettings } from './state.js';
import { toast, safeUrl } from './dom.js';
import { logAction } from './audit.js';

/* ── إنشاء طلب ──
   الحقول التعريفية (الاسم، القسم، الرقم الوظيفي) تُقرأ من ملف الموظف نفسه.
   القاعدة على السيرفر تتحقق أنها تطابق الملف فعلاً، فما عاد الموظف يقدر
   يرسل قسماً غير قسمه ليوجّه طلبه لمدير أسهل. */
export async function submitRequest(data) {
  const me = getMe();
  /* الرابط يُنظَّف قبل الحفظ. القاعدة ترفض أي بروتوكول غير http/https أصلاً،
     لكن التنظيف هنا يعطي الموظف رسالة مفهومة بدل رفض غامض من Firestore. */
  if (data.attachmentLink) {
    const clean = safeUrl(data.attachmentLink);
    if (!clean) { toast('رابط المرفق غير صالح — لازم يبدأ بـ https', 'err'); return false; }
    data.attachmentLink = clean;
  }
  try {
    await addDoc(collection(db, 'requests'), {
      ...data,
      employeeUid:   me.id,
      employeeName:  me.name,
      employeeEmpId: me.empId || '',
      department:    me.department || '',
      status: 'pending',
      rejectReason: '',
      reviewedBy: '',
      reviewedAt: null,
      createdAt: serverTimestamp()
    });
    toast('تم تقديم الطلب بنجاح', 'ok');
    return true;
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied'
      ? 'رُفض الطلب — تأكد أن بياناتك في النظام مكتملة'
      : 'تعذّر تقديم الطلب', 'err');
    return false;
  }
}

/* ── تعديل رصيد الإجازة ذرّياً. sign=-1 خصم، sign=+1 إعادة ──
   منقولة من السطور 1125-1136. transaction حتى لا يضيع خصم عند موافقتين
   متتاليتين على نفس اللحظة. */
export async function adjustBalance(r, sign) {
  const uref = doc(db, 'users', r.employeeUid);
  const t = (getSettings().leaveTypes || []).find((x) => x.id === r.leaveTypeId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(uref);
    if (!snap.exists()) return;
    const bal = { ...(snap.data().balances || {}) };
    const cur = (bal[r.leaveTypeId] != null) ? bal[r.leaveTypeId] : (t ? t.balance : 0);
    /* Math.max(0,…) يمنع الرصيد السالب. وقاعدة القبول على السيرفر تمنع
       days السالبة أصلاً، وهي التي كانت تسمح بتحويل الخصم إلى زيادة. */
    bal[r.leaveTypeId] = Math.max(0, cur + sign * (r.days || 0));
    tx.update(uref, { balances: bal });
  });
}

export async function approve(r) {
  const me = getMe();
  try {
    await updateDoc(doc(db, 'requests', r.id), {
      status: 'approved', reviewedBy: me.name, reviewedAt: serverTimestamp(), rejectReason: ''
    });
    if (r.type === 'leave' && r.deduct && r.leaveTypeId) await adjustBalance(r, -1);
    await logAction('موافقة على طلب', `${r.type === 'permission' ? 'استئذان' : 'إجازة'} — ${r.employeeName}`);
    toast('تمت الموافقة على الطلب', 'ok');
  } catch (e) { console.error(e); toast('تعذّر تنفيذ الموافقة', 'err'); }
}

export async function reject(r, reason) {
  const me = getMe();
  await updateDoc(doc(db, 'requests', r.id), {
    status: 'rejected', rejectReason: reason, reviewedBy: me.name, reviewedAt: serverTimestamp()
  });
  await logAction('رفض طلب', `${r.employeeName} — ${reason}`);
  toast('تم رفض الطلب');
}

/* إلغاء موافقة سابقة — يُعاد الرصيد المخصوم قبل تغيير الحالة */
export async function revokeApproval(r, reason) {
  const me = getMe();
  if (r.type === 'leave' && r.deduct && r.leaveTypeId) await adjustBalance(r, +1);
  await updateDoc(doc(db, 'requests', r.id), {
    status: 'rejected', rejectReason: reason, reviewedBy: me.name, reviewedAt: serverTimestamp()
  });
  await logAction('إلغاء موافقة',
    `${r.type === 'permission' ? 'استئذان' : 'إجازة'} — ${r.employeeName} — ${reason}`);
  toast('تم إلغاء الموافقة' + ((r.type === 'leave' && r.deduct) ? ' وإعادة الرصيد' : ''), 'ok');
}

/* سحب الموظف لطلبه — القاعدة تسمح فقط بـ pending ← cancelled */
export async function withdraw(r) {
  try {
    await updateDoc(doc(db, 'requests', r.id), { status: 'cancelled', reviewedAt: serverTimestamp() });
    toast('تم إلغاء الطلب');
  } catch (e) { console.error(e); toast('تعذّر الإلغاء', 'err'); }
}

/* حذف كل طلبات دورة — إجراء إداري لا رجعة فيه */
export async function deleteRequests(list) {
  let done = 0;
  for (const r of list) {
    await deleteDoc(doc(db, 'requests', r.id));
    done++;
  }
  return done;
}

export async function requestsOfUser(uid) {
  const snap = await getDocs(query(collection(db, 'requests'), where('employeeUid', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
