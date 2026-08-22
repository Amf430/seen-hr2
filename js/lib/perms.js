/* ═══════════════════════════════════════════════════════════════════════════
   الصلاحيات — نسخة الواجهة.

   ⚠️ هذه الدوال تخفي الأزرار وترتّب الشاشات فقط. الحماية الحقيقية في
   firestore.rules — لأن هذا الكود يعمل داخل متصفح الموظف، ومن يفتح أدوات
   المطوّر يقدر يغيّر أي شرط هنا في ثانية. القاعدة على السيرفر هي الجدار،
   وهذا مجرد ترتيب للشاشة. لا تُضِف تحقّقاً هنا وتظن أنك أمّنت شيئاً.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getMe } from './state.js';
import { requestBelongsToEmployee } from './permission-link.js';

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
    return !!r.department && r.department === me.department
      && !requestBelongsToEmployee(r, me);
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

/* ═══ سلسلة الموافقات متعددة المستويات ═══

   ⚠️ نُقلت هذه من requests.js: هي أسئلة صلاحية خالصة عن (طلبٍ + المستخدم
   الحالي)، لا عمليات كتابة. وبقاؤها هناك كان يجرّ firebase.js — ومعه الـCDN —
   إلى كل من يسألها، فيمنع اختبارها بـ node وحده. requests.js تُعيد تصديرها
   فلم يتغيّر أي مستورد قائم.

   ⚠️ الطلب بلا حقل chain يسلك المسار القديم حرفياً: hasChain تُرجع false
   فيسقط المنادي على canApprove. مطابق لدالة hasChain() في firestore.rules —
   وأي تباعد بينهما يعني زرّاً يظهر للمستخدم ثم ترفضه القاعدة. */
export const hasChain = (r) => Array.isArray(r.chain) && r.chain.length > 0;
export const chainStep = (r) => (hasChain(r) ? (r.step || 0) : 0);
export const isLastStep = (r) => hasChain(r) && chainStep(r) + 1 >= r.chain.length;

export const CHAIN_ROLE_AR = { manager: 'مدير القسم', admin: 'الموارد البشرية' };
export const chainRoleAr = (k) => CHAIN_ROLE_AR[k] || k;

/* هل يملك المستخدم الحالي الخطوة المنتظرة؟ */
export function ownsCurrentStep(r) {
  const me = getMe();
  if (!me || !hasChain(r) || r.status !== 'pending') return false;
  if (requestBelongsToEmployee(r, me)) return false;
  const role = r.chain[chainStep(r)];
  if (role === 'admin')   return me.role === 'admin';
  if (role === 'manager') return me.role === 'manager' && !!me.department && me.department === r.department;
  return false;
}
