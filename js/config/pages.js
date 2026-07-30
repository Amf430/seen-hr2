/* ═══════════════════════════════════════════════════════════════════════════
   سجل الصفحات — مصدر الحقيقة الوحيد للتنقّل.

   في النسخة القديمة كانت الصفحة معرّفة في أربعة أماكن متوازية: NAV (696) و
   titles (802) و hints (805) وخريطة العرض (815). إضافة صفحة كانت تعني أربع
   تعديلات، ونسيان واحد يعني صفحة بلا عنوان أو بلا رابط. هنا تعريف واحد.

   ⚠️ هذه وحدة طرفية: لا تستورد أي صفحة. الراوتر وحده يربط المعرّف بدالة
   العرض، فلا تنشأ دورة استيراد.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PAGES = {
  home:          { title: 'الرئيسية',              hint: '' },
  attend:        { title: 'الحضور والانصراف',      hint: 'سجّل حضورك وانصرافك' },
  new:           { title: 'تقديم طلب',             hint: 'اختر نوع الطلب واملأ البيانات' },
  mine:          { title: 'طلباتي',                hint: 'تابع حالة طلباتك' },
  inbox:         { title: 'بانتظار موافقتك',       hint: 'راجع الطلبات ووافق أو ارفض' },
  employees:     { title: 'ملفات الموظفين',        hint: 'البيانات والعقود والرواتب والصلاحيات' },
  profile:       { title: 'بروفايل الموظف',        hint: 'الراتب والعقد وتحليلات الالتزام' },
  attendance:    { title: 'الحضور من الجوال',      hint: 'تسجيل ذاتي بالموقع الجغرافي — فرز باليوم أو بالموظف' },
  zklog:         { title: 'سجل جهاز البصمة',       hint: 'سجل مستقل قادم من جهاز ZKTeco — لا يعدّله أحد' },
  payroll:       { title: 'مسير الرواتب — دورة 26 ← 25', hint: 'المستحق لكل موظف حسب بصمة الجهاز' },
  monthly:       { title: 'تقارير الدورات',        hint: 'دورة من 26 إلى 25 — تصدير Excel لكل دورة' },
  reports:       { title: 'تحليلات الطلبات',       hint: 'توزيع الاستئذانات والإجازات' },
  audit:         { title: 'سجل الحركات',           hint: 'من قام بماذا ومتى' },
  'set-org':      { title: 'الأقسام والهيكل',       hint: 'الأقسام ومديروها وورديات كل قسم' },
  'set-branches': { title: 'الفروع ونطاق الحضور',   hint: 'مواقع الفروع ونطاق تسجيل الحضور لكل فرع' },
  'set-shifts':   { title: 'الورديات والعطل',       hint: 'الدوام الأسبوعي والعطل الرسمية والدوام الخاص' },
  'set-requests': { title: 'أنواع الطلبات والاعتمادات', hint: 'أسباب الاستئذان وأنواع الإجازات وجهات الاعتماد' },
  'set-payroll':  { title: 'احتساب الرواتب',        hint: 'قيمة اليوم والساعة ودقائق السماح' }
};

/* عنوان لوحة الأدمن يختلف عن عنوان الموظف لنفس المعرّف */
export const HOME_ADMIN = { title: 'لوحة القيادة', hint: 'نبض الشركة اليوم: القوى العاملة، الحضور، تكلفة الرواتب والطلبات' };

/* ── التنقّل المُجمّع ──
   المجموعة بلا عنوان (group:'') تظهر في الأعلى بلا ترويسة.

   ⚠️ ملاحظة على صلاحيات مدير القسم — تحققتُ منها ولم أفترضها:
   صفحتا «الحضور من الجوال» و«سجل جهاز البصمة» تجلبان السجلات بـ fetchAttendance
   الذي يفلتر بالتاريخ فقط. قاعدة القراءة تمنح المدير الوصول عبر sameDept()،
   وFirestore يرفض الاستعلام كاملاً ما لم يكن مقيَّداً بحيث تحقّق كل نتيجة
   محتملة شرط القاعدة. فتشغيلها للمدير يحتاج where('department','==',…) مع
   فهرس مركّب (department, date) على المجموعتين — وهو شيء يُنشأ من Firebase
   Console ولا أقدر أنشره من هنا.
   لذلك بقيتا للأدمن وحده الآن، وهو نفس سلوك النسخة الحالية بالضبط (مدير
   القسم لا يملكهما اليوم أصلاً). لا تُمنح للمدير قبل إنشاء الفهرسين، وإلا
   ستظهر له الصفحة فارغة مع خطأ صلاحيات. */
export const NAV_GROUPS = [
  { group: '', items: [
    { id: 'home', icon: '📊', label: 'لوحة القيادة', roles: ['admin'] },
    { id: 'home', icon: '🏠', label: 'الرئيسية',     roles: ['employee', 'manager'] }
  ]},

  { group: 'الحضور والدوام', items: [
    { id: 'attend',     icon: '🟢',  label: 'تسجيل حضوري',      roles: ['employee', 'manager'] },
    { id: 'attendance', icon: '🌐',  label: 'الحضور من الجوال', roles: ['admin'] },
    { id: 'zklog',      icon: '🖐️', label: 'سجل جهاز البصمة',  roles: ['admin'] }
  ]},

  { group: 'الطلبات', items: [
    { id: 'inbox',   icon: '📥', label: 'بانتظار موافقتك', roles: ['admin', 'manager'], badge: true },
    { id: 'new',     icon: '➕', label: 'تقديم طلب',       roles: ['employee', 'manager'] },
    { id: 'mine',    icon: '📋', label: 'طلباتي',          roles: ['employee', 'manager'] },
    { id: 'reports', icon: '📈', label: 'تحليلات الطلبات', roles: ['admin'] }
  ]},

  { group: 'شؤون الموظفين', items: [
    { id: 'employees', icon: '👤', label: 'ملفات الموظفين',  roles: ['admin', 'manager'] },
    { id: 'set-org',   icon: '🏢', label: 'الأقسام والهيكل', roles: ['admin'] }
  ]},

  { group: 'الرواتب', items: [
    { id: 'payroll',     icon: '💵', label: 'مسير الرواتب',   roles: ['admin'] },
    { id: 'set-payroll', icon: '⚖️', label: 'احتساب الرواتب', roles: ['admin'] }
  ]},

  { group: 'التقارير والسجلات', items: [
    { id: 'monthly', icon: '📅',  label: 'تقارير الدورات', roles: ['admin'] },
    { id: 'audit',   icon: '🗂️', label: 'سجل الحركات',    roles: ['admin'] }
  ]},

  { group: 'الإعدادات', items: [
    { id: 'set-branches', icon: '📍', label: 'الفروع ونطاق الحضور',        roles: ['admin'] },
    { id: 'set-shifts',   icon: '🕗', label: 'الورديات والعطل',            roles: ['admin'] },
    { id: 'set-requests', icon: '🧾', label: 'أنواع الطلبات والاعتمادات',  roles: ['admin'] }
  ]}
];

/* الصفحة الافتراضية لكل دور */
export const HOME_FOR = { admin: 'home', manager: 'home', employee: 'home' };

/* هل يملك هذا الدور حق فتح هذه الصفحة؟
   للواجهة فقط — الجدار الحقيقي هو firestore.rules. */
export function canOpen(pageId, role) {
  if (pageId === 'profile') return role === 'admin' || role === 'manager';
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.id === pageId && it.roles.includes(role)) return true;
    }
  }
  return false;
}

export function navFor(role) {
  return NAV_GROUPS
    .map((g) => ({ group: g.group, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length);
}
