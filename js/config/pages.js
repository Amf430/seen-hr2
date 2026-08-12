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
  'profile-me':  { title: 'ملفي الوظيفي',          hint: 'بطاقتك ومستنداتك وبيانات اتصالك' },
  services:      { title: 'خدماتي',                hint: 'تعريف بالراتب · خطاب للبنك · كشف الإجازات' },
  performance:   { title: 'أدائي',                 hint: 'حضورك وتأخيرك وغيابك في هذه الدورة' },
  inbox:         { title: 'بانتظار موافقتك',       hint: 'راجع الطلبات ووافق أو ارفض' },
  employees:     { title: 'ملفات الموظفين',        hint: 'البيانات والعقود والرواتب والصلاحيات' },
  profile:       { title: 'بروفايل الموظف',        hint: 'الراتب والعقد وتحليلات الالتزام' },
  'team-perf':   { title: 'أداء القسم',             hint: 'نسب الانضباط والتأخير والغياب لموظفي قسمك' },
  org:           { title: 'الهيكل التنظيمي',        hint: 'من يتبع من — الشجرة الإدارية كاملة' },
  attendance:    { title: 'الحضور من الجوال',      hint: 'تسجيل ذاتي بالموقع الجغرافي — فرز باليوم أو بالموظف' },
  zklog:         { title: 'سجل جهاز البصمة',       hint: 'سجل مستقل قادم من جهاز ZKTeco — لا يعدّله أحد' },
  payroll:       { title: 'مسير الرواتب — دورة 26 ← 25', hint: 'المستحق لكل موظف حسب بصمة الجهاز' },
  monthly:       { title: 'تقارير الدورات',        hint: 'دورة من 26 إلى 25 — تصدير Excel لكل دورة' },
  reports:       { title: 'تحليلات الطلبات',       hint: 'توزيع الاستئذانات والإجازات' },
  'hr-desk':     { title: 'الموارد البشرية',        hint: 'اسأل الموارد البشرية — تأمين · راتب · إجازات · مستندات' },
  audit:         { title: 'سجل الحركات',           hint: 'من قام بماذا ومتى' },
  'set-org':      { title: 'الأقسام والهيكل',       hint: 'الأقسام ومديروها وورديات كل قسم' },
  'set-branches': { title: 'الفروع ونطاق الحضور',   hint: 'مواقع الفروع ونطاق تسجيل الحضور لكل فرع' },
  'set-shifts':   { title: 'الورديات والعطل',       hint: 'الدوام الأسبوعي والعطل الرسمية والدوام الخاص' },
  'set-requests': { title: 'أنواع الطلبات والاعتمادات', hint: 'أسباب الاستئذان وأنواع الإجازات وجهات الاعتماد' },
  'set-payroll':  { title: 'احتساب الرواتب',        hint: 'قيمة اليوم والساعة ودقائق السماح' }
};

/* عنوان لوحة الأدمن يختلف عن عنوان الموظف لنفس المعرّف */
export const HOME_ADMIN = { title: 'لوحة القيادة', hint: 'نبض الشركة اليوم: القوى العاملة، الحضور، تكلفة الرواتب والطلبات' };

/* نفس الصفحة، لكن الأدمن يقف على الطرف الآخر منها: يقرأ ويردّ ويُغلق */
export const HR_DESK_ADMIN = { title: 'طلبات الموظفين',
  hint: 'استفسارات الموظفين للموارد البشرية — قناة لا يراها مدير القسم' };

/* نفس صفحة الهيكل، لكن المدير يرى فرعه منها لا الشجرة كاملة */
export const ORG_MANAGER = { title: 'فريقي', hint: 'من يتبعك مباشرةً ومن تحتهم' };

/* نفس الصفحة، لكن المدير لا يرى منها إلا قسمه — تحرسه sameDept() على السيرفر
   لا هذا العنوان. العنوان يمنع سوء الفهم فقط: «ملفات الموظفين» توحي بأنه
   يرى الشركة كلها ثم يجد قائمة قصيرة، فيظنّ الشاشة معطوبة. */
export const EMPLOYEES_MANAGER = { title: 'موظفو قسمي',
  hint: 'بيانات موظفي قسمك — تقدر تضيف موظفاً جديداً لقسمك' };

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
    { id: 'home', icon: 'dashboard', label: 'لوحة القيادة', roles: ['admin'] },
    { id: 'home', icon: 'home', label: 'الرئيسية',     roles: ['employee', 'manager'] }
  ]},

  { group: 'الحضور والدوام', items: [
    { id: 'attend',     icon: 'clock',  label: 'تسجيل حضوري',      roles: ['employee', 'manager'] },
    { id: 'attendance', icon: 'globe',  label: 'الحضور من الجوال', roles: ['admin'] },
    { id: 'zklog',      icon: 'finger', label: 'سجل جهاز البصمة',  roles: ['admin'] }
  ]},

  { group: 'حسابي', items: [
    { id: 'profile-me',  icon: 'people',   label: 'ملفي الوظيفي', roles: ['employee', 'manager'] },
    { id: 'performance', icon: 'chart',    label: 'أدائي',        roles: ['employee', 'manager'] },
    { id: 'services',    icon: 'doc',      label: 'خدماتي',       roles: ['employee', 'manager'] }
  ]},

  { group: 'الطلبات', items: [
    { id: 'inbox',   icon: 'inbox', label: 'بانتظار موافقتك', roles: ['admin', 'manager'], badge: true },
    { id: 'new',     icon: 'plus', label: 'تقديم طلب',       roles: ['employee', 'manager'] },
    { id: 'mine',    icon: 'list', label: 'طلباتي',          roles: ['employee', 'manager'] },
    { id: 'reports', icon: 'chart', label: 'تحليلات الطلبات', roles: ['admin'] },
    { id: 'hr-desk', icon: 'inbox', label: 'طلبات الموظفين',   roles: ['admin'] },
    { id: 'hr-desk', icon: 'inbox', label: 'الموارد البشرية',  roles: ['employee', 'manager'] }
  ]},

  { group: 'شؤون الموظفين', items: [
    { id: 'employees', icon: 'people', label: 'ملفات الموظفين',  roles: ['admin', 'manager'] },
    /* ⚠️ تُفتح للمدير لأن استعلامها مقيَّد بـ where('department','==',…) ويقابله
       فهرس (department, date) في firestore.indexes.json. لا تنسخ هذا السطر لصفحة
       أخرى قبل أن تقيّد استعلامها وتنشر فهرسها — وإلا شاشة فارغة بخطأ صلاحيات. */
    { id: 'team-perf', icon: 'chart', label: 'أداء القسم',      roles: ['admin', 'manager'] },
    { id: 'org',       icon: 'network', label: 'الهيكل التنظيمي', roles: ['admin'] },
    { id: 'org',       icon: 'network', label: 'فريقي',           roles: ['manager'] },
    { id: 'set-org',   icon: 'building', label: 'الأقسام والهيكل', roles: ['admin'] }
  ]},

  { group: 'الرواتب', items: [
    { id: 'payroll',     icon: 'money', label: 'مسير الرواتب',   roles: ['admin'] },
    { id: 'set-payroll', icon: 'scale', label: 'احتساب الرواتب', roles: ['admin'] }
  ]},

  { group: 'التقارير والسجلات', items: [
    { id: 'monthly', icon: 'calendar',  label: 'تقارير الدورات', roles: ['admin'] },
    { id: 'audit',   icon: 'archive', label: 'سجل الحركات',    roles: ['admin'] }
  ]},

  { group: 'الإعدادات', items: [
    { id: 'set-branches', icon: 'pin', label: 'الفروع ونطاق الحضور',        roles: ['admin'] },
    { id: 'set-shifts',   icon: 'clock', label: 'الورديات والعطل',            roles: ['admin'] },
    { id: 'set-requests', icon: 'tag', label: 'أنواع الطلبات والاعتمادات',  roles: ['admin'] }
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
