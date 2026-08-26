/* ═══════════════════════════════════════════════════════════════════════════
   ربط الاستئذان بأثره على الحضور والمسير.

   ⚠️ permissionKind هو المصدر الدلالي للطلبات الجديدة. المطابقة الدقيقة
   أدناه للبيانات القديمة فقط؛ لا includes() لأن نصاً أطول أو تصنيفاً تغيّر
   اسمه لا يجوز أن يمنح إعفاءً من خصم الراتب بالصدفة.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PERMISSION_KIND = Object.freeze({ LATE: 'late', EARLY: 'early', MID: 'mid' });

/* هوية الموظف ليست UID واحداً بعد استعادة الوصول. هذه الوحدة نقيّة ومشتركة
   بين الحضور والمسير والطلبات حتى لا يربط كل مستهلك التاريخ بطريقة مختلفة. */
export function employeeUidsOf(employee) {
  if (typeof employee === 'string') return employee ? [employee] : [];
  if (!employee) return [];
  return [...new Set([employee.id, ...(employee.previousUids || [])].filter(Boolean))];
}

export function requestBelongsToEmployee(request, employee) {
  return !!request && employeeUidsOf(employee).includes(request.employeeUid);
}

/* طلب قديم لا يحمل attendanceUid كان يستهدف employeeUid نفسه. الحقل الجديد
   لا يغيّر معنى employeeUid؛ بل يحفظ فقط مفتاح سجل الحضور التاريخي. */
export function attendanceUidOf(request) {
  return request?.attendanceUid || request?.employeeUid || '';
}

const CATEGORY_KIND = Object.freeze({
  'تأخير عن الدوام': PERMISSION_KIND.LATE,
  'خروج مبكر': PERMISSION_KIND.EARLY,
  'استئذان أثناء الدوام': PERMISSION_KIND.MID
});
const LEGACY_KIND = Object.freeze({
  'تأخير عن الدوام': PERMISSION_KIND.LATE,
  'خروج مبكر': PERMISSION_KIND.EARLY
});

export function permissionKindOf(r) {
  if (!r || r.type !== 'permission') return '';
  if ('permissionKind' in r) {
    /* الحقل هو المصدر الدلالي، لكن الفئة جزء من عقد التخزين والعرض. تركيبة
       متناقضة تُرفض في القراءة أيضاً حتى لا تمنح وثيقة قديمة مشوّهة إعفاءً. */
    return CATEGORY_KIND[r.category] === r.permissionKind ? r.permissionKind : '';
  }
  return LEGACY_KIND[r.category] || '';
}

export function approvedPermissionsForDay(requests, employee, date) {
  const all = (requests || []).filter((r) =>
    r.type === 'permission' && r.status === 'approved' &&
    requestBelongsToEmployee(r, employee) && r.date === date && permissionKindOf(r));
  return {
    all,
    late: all.find((r) => permissionKindOf(r) === PERMISSION_KIND.LATE) || null,
    early: all.find((r) => permissionKindOf(r) === PERMISSION_KIND.EARLY) || null,
    mid: all.filter((r) => permissionKindOf(r) === PERMISSION_KIND.MID)
  };
}

export function permissionExportFields(list) {
  const perms = list || [];
  return {
    exists: perms.length ? 'نعم' : '',
    ids: perms.map((r) => r.id || '').filter(Boolean).join(' · '),
    types: perms.map((r) => r.categoryLabel || r.category || '').filter(Boolean).join(' · '),
    reasons: perms.map((r) => r.reasonLabel || '').filter(Boolean).join(' · '),
    details: perms.map((r) => r.note || '').filter(Boolean).join(' · ')
  };
}

export function permissionDisplayLabel(r) {
  return `استئذان — ${r?.reasonLabel || r?.categoryLabel || r?.category || 'بدون سبب محدد'}`;
}
