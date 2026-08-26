import {
  PERMISSION_KIND, permissionKindOf, approvedPermissionsForDay, permissionExportFields,
  permissionDisplayLabel, employeeUidsOf, requestBelongsToEmployee, attendanceUidOf
} from '../js/lib/permission-link.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      توقّعنا ${e}\n      وجاء   ${a}`); }
};

const base = {
  id: 'perm-1', type: 'permission', status: 'approved', employeeUid: 'u1',
  date: '2026-08-18', category: 'تأخير عن الدوام', categoryLabel: 'تأخير عن الدوام',
  reasonLabel: 'مهمة عمل', note: 'زيارة موقع العميل'
};

console.log('\n\x1b[1m═══ ربط الاستئذان بالحضور ═══\x1b[0m');
eq('الحقل الدلالي المتوافق مع الفئة يُقرأ', PERMISSION_KIND.EARLY,
   permissionKindOf({ ...base, category: 'خروج مبكر', permissionKind: 'early' }));
eq('التركيبة المتناقضة تفشل مغلقاً', '',
   permissionKindOf({ ...base, permissionKind: 'early' }));
eq('الطلب القديم يبقى مقروءاً بالمطابقة الدقيقة', PERMISSION_KIND.LATE, permissionKindOf(base));
eq('نص يحتوي الكلمة عرضاً لا يمنح إعفاءً', '',
   permissionKindOf({ ...base, category: 'ملاحظة عن تأخير سابق' }));
eq('قيمة دلالية مجهولة لا تمنح إعفاءً', '',
   permissionKindOf({ ...base, permissionKind: 'unknown' }));

const pending = { ...base, id: 'pending', status: 'pending' };
const rejected = { ...base, id: 'rejected', status: 'rejected' };
const cancelled = { ...base, id: 'cancelled', status: 'cancelled' };
const early = { ...base, id: 'perm-2', permissionKind: 'early', category: 'خروج مبكر', categoryLabel: 'خروج مبكر' };
const mid = { ...base, id: 'perm-3', permissionKind: 'mid', category: 'استئذان أثناء الدوام', categoryLabel: 'استئذان أثناء الدوام' };
const legacyMid = { ...mid, id: 'legacy-mid' }; delete legacyMid.permissionKind;
const linked = approvedPermissionsForDay([base, pending, rejected, cancelled, early, mid, legacyMid], 'u1', '2026-08-18');
eq('المعتمد ذو العقد الصحيح وحده يرتبط باليوم', ['perm-1', 'perm-2', 'perm-3'], linked.all.map((r) => r.id));
eq('الربط يعيد معرّف الطلب الأصلي', 'perm-1', linked.late.id);
eq('النوع الدلالي المتوافق يحدد الخروج المبكر', 'perm-2', linked.early.id);
eq('استئذان أثناء الدوام يحتاج permissionKind صريحاً', ['perm-3'], linked.mid.map((r) => r.id));
eq('الموظف أو اليوم الآخر لا يرث الاستئذان', 0,
   approvedPermissionsForDay([base], 'u2', '2026-08-18').all.length);

const restored = { id: 'u-new', previousUids: ['u-old-1', 'u-old-2'] };
eq('الهوية تجمع الحالي وأكثر من UID سابق بلا تكرار', ['u-new', 'u-old-1', 'u-old-2'],
   employeeUidsOf({ ...restored, previousUids: ['u-old-1', 'u-old-2', 'u-old-1'] }));
eq('طلب UID الحالي يطابق الموظف', true,
   requestBelongsToEmployee({ employeeUid: 'u-new' }, restored));
eq('طلب UID تاريخي ثانٍ يطابق الموظف', true,
   requestBelongsToEmployee({ employeeUid: 'u-old-2' }, restored));
eq('UID تاريخي لموظف آخر لا يطابق', false,
   requestBelongsToEmployee({ employeeUid: 'someone-else-old' }, restored));
eq('الاستئذان التاريخي يرتبط بالهوية الحالية', 1,
   approvedPermissionsForDay([{ ...base, employeeUid: 'u-old-1' }], restored, '2026-08-18').all.length);
eq('attendanceUid يتقدم عند وجوده', 'u-old-2',
   attendanceUidOf({ employeeUid: 'u-new', attendanceUid: 'u-old-2' }));
eq('وثيقة attendanceFix القديمة ترجع إلى employeeUid', 'u-new',
   attendanceUidOf({ employeeUid: 'u-new' }));

eq('حقول Excel تحمل الإثبات والسبب والتفاصيل', {
  exists: 'نعم', ids: 'perm-1 · perm-2 · perm-3',
  types: 'تأخير عن الدوام · خروج مبكر · استئذان أثناء الدوام',
  reasons: 'مهمة عمل · مهمة عمل · مهمة عمل',
  details: 'زيارة موقع العميل · زيارة موقع العميل · زيارة موقع العميل'
}, permissionExportFields(linked.all));
eq('عنوان العرض يجمع الاستئذان وسببه', 'استئذان — مهمة عمل', permissionDisplayLabel(base));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
if (fail) process.exit(1);
