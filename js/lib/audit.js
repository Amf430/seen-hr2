/* ═══════════════════════════════════════════════════════════════════════════
   سجل الحركات — من فعل ماذا ومتى.

   السجل «إضافة فقط»: القواعد تمنع التعديل والحذف نهائياً، حتى على الأدمن.
   وصلاحية الكتابة محصورة بالأدمن ومدير القسم، لأن كل نداء logAction في
   التطبيق يأتي من إجراء إداري أصلاً — وهذا يغلق باب إغراق السجل من حسابات
   الموظفين. و byName مثبّت على الاسم الحقيقي في القاعدة، فما عاد أحد يقدر
   ينسب حركة لشخص ثانٍ.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from './firebase.js';
import { getMe } from './state.js';

/* الحدود مطابقة لما تفرضه firestore.rules — نقصّها هنا حتى لا تُرفض الكتابة
   بصمت لو طالت التفاصيل (اسم موظف طويل + سبب رفض مطوّل مثلاً). */
const MAX_ACTION = 100;
const MAX_DETAIL = 500;

export async function logAction(action, detail) {
  const me = getMe();
  if (!me) return;
  try {
    await addDoc(collection(db, 'auditLog'), {
      action: String(action || '').slice(0, MAX_ACTION),
      detail: String(detail || '').slice(0, MAX_DETAIL),
      byName: me.name,
      byUid:  me.id,
      at: serverTimestamp()
    });
  } catch (e) {
    /* لا نُفشل العملية الأصلية لأجل السجل — لكن لا نبتلع الخطأ بصمت أيضاً.
       النسخة القديمة كانت catch(e){} فارغة، فلو انكسر السجل ما عرف أحد. */
    console.error('logAction', e);
  }
}

/* ⚠️ limit مهم: النسخة القديمة كانت تجلب المجموعة كاملة ثم تقصّها لمئة في
   المتصفح. مع سجل كبير = بطء وتكلفة قراءات بلا داعٍ. */
export async function fetchAuditLog(n = 100) {
  const snap = await getDocs(query(collection(db, 'auditLog'), orderBy('at', 'desc'), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
