/* ═══════════════════════════════════════════════════════════════════════════
   الصلاحيات — نسخة الواجهة.

   ⚠️ هذه الدوال تخفي الأزرار وترتّب الشاشات فقط. الحماية الحقيقية في
   firestore.rules — لأن هذا الكود يعمل داخل متصفح الموظف، ومن يفتح أدوات
   المطوّر يقدر يغيّر أي شرط هنا في ثانية. القاعدة على السيرفر هي الجدار،
   وهذا مجرد ترتيب للشاشة. لا تُضِف تحقّقاً هنا وتظن أنك أمّنت شيئاً.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getMe } from './state.js';

export const ROLE_AR = {
  admin:   'مدير النظام',
  manager: 'مدير قسم',
  employee:'موظف'
};

export const isAdmin   = () => { const m = getMe(); return !!m && m.role === 'admin'; };
export const isManager = () => { const m = getMe(); return !!m && m.role === 'manager'; };
export const isBoss    = () => isAdmin() || isManager();

export const roleLabel = (u) => ROLE_AR[u && u.role] || 'موظف';

/* من يملك حق الموافقة: مدير النظام لكل الطلبات، ومدير القسم لطلبات قسمه فقط
   وليس لطلباته هو. منقولة من السطور 824-829. */
export function canApprove(r) {
  const me = getMe();
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (me.role === 'manager')
    return !!r.department && r.department === me.department && r.employeeUid !== me.id;
  return false;
}

/* مدير القسم يوافق على الاستئذانات فقط — الإجازات تُعدّل الأرصدة فيعتمدها
   الأدمن وحده. هذا يطابق قاعدة requests في firestore.rules نصّاً. */
export function canApproveType(r) {
  const me = getMe();
  if (!me) return false;
  if (me.role === 'admin') return true;
  return canApprove(r) && r.type === 'permission';
}
