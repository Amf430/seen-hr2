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
  'my-tasks':    { title: 'مهامي',                  hint: 'المهام المكلَّف بها — ابدأها وأرسلها للاعتماد' },
  'team-tasks':  { title: 'مهام القسم',             hint: 'تكليف ومتابعة واعتماد مهام موظفي قسمك' },
  task:          { title: 'تفاصيل المهمة',          hint: 'الحالة والقائمة الفرعية والمحادثة' },
  'tasks-analytics': { title: 'تحليلات المهام',     hint: 'أرقام المهام لكل قسم وموظف بجانب أرقام الحضور' },
  'tasks-archive': { title: 'أرشيف المهام',       hint: 'المنجزة منذ ٣٠ يوماً — بحث بالعنوان والموظف والتقييم' },
  'team-calendar': { title: 'تقويم الفريق',       hint: 'الإجازات والشفتات والعطل في شاشة واحدة' },
  announcements: { title: 'الإعلانات',             hint: 'رسائل الموارد البشرية للموظفين' },
  'set-leave-policy': { title: 'سياسة الإجازات',   hint: 'المستحقّ السنوي والاستحقاق التدريجي والترحيل' },
  'set-task-templates': { title: 'قوالب المهام',  hint: 'قوالب جاهزة ومهام متكرّرة تُولَّد تلقائياً' },
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
  'set-payroll':  { title: 'احتساب الرواتب',        hint: 'قيمة اليوم والساعة ودقائق السماح' },
  settings:       { title: 'الإعدادات',             hint: 'الأقسام والفروع والورديات والطلبات والإجازات والرواتب' }
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
/* ── مبدأ التجميع ──
   المجموعة تُقرأ مجموعةً ما دامت قصيرة؛ الثمانية تُقرأ قائمة. كانت «شؤون
   الموظفين» تضمّ ثمانية عناصر تخلط الملفات والأداء والمهام والهيكل والإعلانات
   وإعداداً — فبدت القائمة بلا بنية. الآن كل مجموعة نطاق واحد.

   ⚠️ الإعدادات السبعة خرجت من هنا إلى صفحة «الإعدادات» (المعرّف settings).
   كانت موزّعة على ثلاث مجموعات: set-org في «شؤون الموظفين» و set-payroll في
   «الرواتب» وخمسة في «الإعدادات» — ثلاثة أماكن لشيء واحد.
   **وخروجها من هنا يعني أن canOpen ترفضها**، فأُضيفت كلها في DETAIL_PAGES
   أدناه. بلا ذلك يُعاد الأدمن للرئيسية بلا رسالة عند فتح أي إعداد.

   ⚠️ المجموعة بلا عنوان تُستثنى من حدّ الثلاثة: لا ترويسة تُمسح بالعين فيها،
   وهي كتلة الوصول السريع لا تصنيفاً. */
export const NAV_GROUPS = [
  { group: '', items: [
    { id: 'home', icon: 'dashboard', label: 'لوحة القيادة', roles: ['admin'] },
    { id: 'home', icon: 'home', label: 'الرئيسية',     roles: ['employee', 'manager'] },
    { id: 'my-tasks', icon: 'check', label: 'مهامي', roles: ['employee', 'manager'] },
    { id: 'team-calendar', icon: 'calendar', label: 'تقويم الفريق', roles: ['employee', 'manager', 'admin'] },
    /* ⚠️ بيت واحد للإعلانات. كانت هنا للموظف والمدير، وداخل «شؤون الموظفين»
       للأدمن — نفس الصفحة في موضعين حسب من ينظر. */
    { id: 'announcements', icon: 'megaphone', label: 'الإعلانات', roles: ['employee', 'manager', 'admin'] }
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
    { id: 'hr-desk', icon: 'inbox', label: 'طلبات الموظفين',   roles: ['admin'] },
    { id: 'hr-desk', icon: 'inbox', label: 'الموارد البشرية',  roles: ['employee', 'manager'] },
    { id: 'reports', icon: 'chart', label: 'تحليلات الطلبات', roles: ['admin'] }
  ]},

  { group: 'الموظفون', items: [
    { id: 'employees', icon: 'people', label: 'ملفات الموظفين',  roles: ['admin', 'manager'] },
    /* ⚠️ تُفتح للمدير لأن استعلامها مقيَّد بـ where('department','==',…) ويقابله
       فهرس (department, date) في firestore.indexes.json. لا تنسخ هذا السطر لصفحة
       أخرى قبل أن تقيّد استعلامها وتنشر فهرسها — وإلا شاشة فارغة بخطأ صلاحيات. */
    { id: 'team-perf', icon: 'chart', label: 'أداء القسم',      roles: ['admin', 'manager'] },
    { id: 'org',       icon: 'network', label: 'الهيكل التنظيمي', roles: ['admin'] },
    { id: 'org',       icon: 'network', label: 'فريقي',           roles: ['manager'] }
  ]},

  { group: 'المهام', items: [
    { id: 'team-tasks', icon: 'check', label: 'مهام القسم',    roles: ['admin', 'manager'] },
    { id: 'tasks-archive', icon: 'archive', label: 'أرشيف المهام', roles: ['admin', 'manager'] },
    { id: 'tasks-analytics', icon: 'chart', label: 'تحليلات المهام', roles: ['admin'] }
  ]},

  { group: 'الرواتب والتقارير', items: [
    { id: 'payroll', icon: 'money', label: 'مسير الرواتب',   roles: ['admin'] },
    { id: 'monthly', icon: 'calendar',  label: 'تقارير الدورات', roles: ['admin'] },
    { id: 'audit',   icon: 'archive', label: 'سجل الحركات',    roles: ['admin'] }
  ]},

  { group: 'الإعدادات', items: [
    { id: 'settings', icon: 'gear', label: 'الإعدادات', roles: ['admin'] }
  ]}
];

/* الإعدادات السبعة — تُفتح من صفحة «الإعدادات» لا من الشريط الجانبي.
   المصدر الوحيد لبطاقاتها، فلا تُكتب مرّتين. */
export const SETTINGS_PAGES = [
  { id: 'set-org',            icon: 'building', label: 'الأقسام والهيكل' },
  { id: 'set-branches',       icon: 'pin',      label: 'الفروع ونطاق الحضور' },
  { id: 'set-shifts',         icon: 'clock',    label: 'الورديات والعطل' },
  { id: 'set-requests',       icon: 'tag',      label: 'أنواع الطلبات والاعتمادات' },
  { id: 'set-leave-policy',   icon: 'calendar', label: 'سياسة الإجازات' },
  { id: 'set-task-templates', icon: 'check',    label: 'قوالب المهام' },
  { id: 'set-payroll',        icon: 'scale',    label: 'احتساب الرواتب' }
];

/* الصفحة الافتراضية لكل دور */
export const HOME_FOR = { admin: 'home', manager: 'home', employee: 'home' };

/* ── شريط الوجهات السفلي على الجوال ──
   أربع وجهات لكل دور، وخامسها زرّ «المزيد» يفتح الدرج بالقائمة كاملة.

   ⚠️ التسمية هنا **قصيرة** لا تسمية القائمة: «بانتظار موافقتك» لا تسع خُمس
   شاشة عرضها ٣٩٠px فتُقصّ. أما الأيقونة فتُشتقّ من NAV_GROUPS ولا تُكتب هنا،
   حتى لا تتباعد أيقونتان لصفحة واحدة.

   ⚠️ كل معرّف هنا يجب أن يمرّ canOpen() لدوره، وإلا وجهةٌ تُعيد المستخدم
   للرئيسية بمجرّد لمسها. يحرسه اختبار في test/nav-groups.test.mjs. */
export const DOCK_FOR = {
  admin: [
    { id: 'home',       short: 'اللوحة' },
    { id: 'inbox',      short: 'الطلبات' },
    { id: 'attendance', short: 'الحضور' },
    { id: 'payroll',    short: 'الرواتب' }
  ],
  manager: [
    { id: 'home',     short: 'الرئيسية' },
    { id: 'attend',   short: 'حضوري' },
    { id: 'inbox',    short: 'الطلبات' },
    { id: 'my-tasks', short: 'مهامي' }
  ],
  employee: [
    { id: 'home',     short: 'الرئيسية' },
    { id: 'attend',   short: 'حضوري' },
    { id: 'my-tasks', short: 'مهامي' },
    { id: 'mine',     short: 'طلباتي' }
  ]
};

/* يركّب وجهات الدوك: التسمية القصيرة من DOCK_FOR، والأيقونة والشارة من
   NAV_GROUPS — مصدر واحد لكل معلومة. */
export function dockFor(role) {
  const items = DOCK_FOR[role] || [];
  return items.map((d) => {
    const nav = NAV_GROUPS.flatMap((g) => g.items)
      .find((i) => i.id === d.id && i.roles.includes(role));
    return { id: d.id, short: d.short, icon: nav?.icon || 'dot', badge: !!nav?.badge };
  });
}

/* هل يملك هذا الدور حق فتح هذه الصفحة؟
   للواجهة فقط — الجدار الحقيقي هو firestore.rules. */
/* ⚠️ الصفحات التفصيلية لا تظهر في القائمة الجانبية — تُفتح من صفّ في جدول
   أو بطاقة في لوحة. وcanOpen تقرأ NAV_GROUPS وحدها، فالصفحة الغائبة عنها
   تُرفض ويُعاد المستخدم للرئيسية بلا رسالة.

   ⚠️ هذا ما حصل فعلاً مع صفحة المهمة: كانت مُسجَّلة في PAGES وفي الراوتر
   ومربوطة بزرّ «التفاصيل والمحادثة» — والزرّ يُعيدك للرئيسية. لم يكشفه أي
   اختبار لأن الاختبارات لا تضغط أزراراً؛ كشفه الضغط عليه في المتصفح.

   فكل صفحة تفصيلية جديدة تُضاف هنا، وإلا صارت غير قابلة للفتح. */
const DETAIL_PAGES = {
  /* بروفايل الموظف: يفتحه الأدمن ومدير القسم من جدول الموظفين */
  profile: ['admin', 'manager'],
  /* ⚠️ صفحات الإعدادات السبع: خرجت من NAV_GROUPS إلى بطاقات صفحة «الإعدادات»،
     فلولا وجودها هنا لرفضتها canOpen وأُعيد الأدمن للرئيسية بلا رسالة — وهو
     نفس ما حصل مع صفحة المهمة. تُشتقّ من SETTINGS_PAGES فلا تتباعد قائمتان. */
  ...Object.fromEntries(SETTINGS_PAGES.map((p) => [p.id, ['admin']])),
  /* صفحة المهمة: يفتحها المكلَّف من «مهامي»، والمدير من «مهام القسم».
     الصلاحية الحقيقية داخل الصفحة نفسها عبر roleFor()، وقاعدة
     match /tasks تحرس القراءة على السيرفر. */
  task: ['admin', 'manager', 'employee']
};

export function canOpen(pageId, role) {
  if (DETAIL_PAGES[pageId]) return DETAIL_PAGES[pageId].includes(role);
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
