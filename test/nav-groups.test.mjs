/* ═══════════════════════════════════════════════════════════════════════════
   سجلّ الصفحات والتنقّل (المرحلة ب)

   ⚠️ لم يكن على NAV_GROUPS أي اختبار قبل هذا الملف — لا شيء يمنع صفحة من
   الاختفاء من القائمة، ولا من الظهور لدور لا يملكها.

   والمزلق الأخطر أن canOpen() تقرأ NAV_GROUPS وحدها: صفحة تخرج من القائمة
   تصير **غير قابلة للفتح** ويُعاد المستخدم للرئيسية بلا رسالة، ما لم تُضَف
   في DETAIL_PAGES. حصل فعلاً مع صفحة المهمة، ويتكرّر حتماً مع الإعدادات
   السبعة التي خرجت من الشريط إلى صفحة «الإعدادات».
   ═══════════════════════════════════════════════════════════════════════════ */

import { PAGES, NAV_GROUPS, SETTINGS_PAGES, DOCK_FOR, HOME_FOR, canOpen, navFor, dockFor }
  from '../js/config/pages.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const ok = (name, cond) => eq(name, true, !!cond);
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const ROLES = ['admin', 'manager', 'employee'];
const count = (role) => navFor(role).reduce((s, g) => s + g.items.length, 0);
const idsFor = (role) => navFor(role).flatMap((g) => g.items.map((i) => i.id));

group('١. حجم القائمة — سبب المرحلة كلها');

/* ٢٤ ← ١٨ بإخراج الإعدادات، ← ١٧ بدمج مصدرَي الحضور، ← ١٥ بإخراج أرشيف
   المهام وسجل الحركات إلى صفحتيهما، ← ١٦ بإضافة «يومي» (القائمة الشخصية).

   ⚠️ الزيادة الوحيدة المقبولة منذ تقليص القائمة: «يومي» وجهةٌ يومية لا
   شاشة تُفتح عند الحاجة، ودفنها خلف صفحة أخرى يعني ألّا تُستعمل. */
eq("⚠️ الأدمن ١٦ رابطاً — كانت ٢٤", 16, count("admin"));
/* ⚠️ سجل الجهاز خرج من القائمة وصار تبويباً — ويجب أن يبقى قابلاً للفتح */
ok('⚠️ zklog يُفتح رغم غيابه عن الشريط', canOpen('zklog', 'admin'));
ok('ومحجوب عن المدير', !canOpen('zklog', 'manager'));
eq('ورابط الحضور واحد لا اثنان', 1,
   idsFor('admin').filter((id) => id === 'attendance' || id === 'zklog').length);
/* ١٦ ← ١٥ بدمج «تسجيل حضوري» في الرئيسية، ← ١٦ بإضافة «يومي» */
eq('المدير ١٦', 16, count('manager'));
eq('الموظف ١١', 11, count('employee'));
/* ⚠️ «تسجيل حضوري» دُمج في الرئيسية — ويبقى قابلاً للفتح للروابط المحفوظة */
ok('attend يُفتح رغم غيابه عن الشريط', canOpen('attend', 'employee'));
eq('ولا رابط له في القائمة', [], idsFor('employee').filter((id) => id === 'attend'));

for (const role of ROLES) {
  const big = navFor(role).filter((g) => g.group && g.items.length > 3)
    .map((g) => `${g.group}=${g.items.length}`);
  /* المجموعة المعنونة تُقرأ مجموعةً ما دامت ≤٣؛ وغير المعنونة مستثناة */
  if (role === 'manager') {
    eq('«الطلبات» عند المدير ٤ — نطاق واحد متماسك، مقبول', ['الطلبات=4'], big);
  } else if (role === 'admin') {
    eq('«التقارير» عند الأدمن ٤ — كلها تُقرأ ولا تُعدَّل', ['التقارير=4'], big);
  } else {
    eq(`لا مجموعة معنونة تتجاوز ٣ عناصر — ${role}`, [], big);
  }
}

group('٢. الإعدادات — المزلق الذي يُعيد المستخدم للرئيسية بلا رسالة');

/* صارت ثمانية بانضمام «سجل الحركات» — إعدادُ نظامٍ يُقرأ عند التحقيق */
eq('ثمانية في مركز الإعدادات', 8, SETTINGS_PAGES.length);
eq('ولا واحد منها في الشريط الجانبي', [],
   SETTINGS_PAGES.map((s) => s.id).filter((id) => idsFor('admin').includes(id)));
for (const s of SETTINGS_PAGES) {
  ok(`⚠️ ${s.label} يُفتح رغم غيابه عن القائمة`, canOpen(s.id, 'admin'));
}
eq('ولا يفتحها المدير', [],
   SETTINGS_PAGES.filter((s) => canOpen(s.id, 'manager')).map((s) => s.id));
eq('ولا الموظف', [],
   SETTINGS_PAGES.filter((s) => canOpen(s.id, 'employee')).map((s) => s.id));
ok('ورابط «الإعدادات» نفسه في قائمة الأدمن', idsFor('admin').includes('settings'));
ok('ومحجوب عن المدير', !canOpen('settings', 'manager'));
ok('ومحجوب عن الموظف', !canOpen('settings', 'employee'));
ok('لكل إعداد عنوان في PAGES', SETTINGS_PAGES.every((s) => PAGES[s.id]?.title));

group('٣. لا صفحة بلا عنوان ولا عنوان بلا صفحة');

for (const role of ROLES) {
  eq(`كل رابط في قائمة ${role} له عنوان في PAGES`, [],
     idsFor(role).filter((id) => id !== 'home' && !PAGES[id]));
}
ok('الرئيسية معرّفة لكل دور', ROLES.every((r) => HOME_FOR[r]));

group('٤. بيت واحد لكل صفحة');

for (const role of ROLES) {
  const ids = idsFor(role);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  eq(`لا رابط مكرّر في قائمة ${role}`, [], dupes);
}
/* ⚠️ كانت «الإعلانات» في الكتلة العليا للموظف والمدير، وداخل «شؤون الموظفين»
   للأدمن — نفس الصفحة في موضعين حسب من ينظر. */
const annGroups = ROLES.map((r) =>
  navFor(r).find((g) => g.items.some((i) => i.id === 'announcements'))?.group);
eq('⚠️ الإعلانات في نفس المجموعة للأدوار الثلاثة', ['', '', ''], annGroups);

group('٥. الصلاحيات لم تتغيّر بإعادة التجميع');

ok('المسير للأدمن وحده', canOpen('payroll', 'admin') &&
   !canOpen('payroll', 'manager') && !canOpen('payroll', 'employee'));
ok('سجل الحركات للأدمن وحده', canOpen('audit', 'admin') && !canOpen('audit', 'manager'));
ok('⚠️ الحضور من الجوال وسجل البصمة للأدمن وحده — استعلامهما غير مقيَّد بقسم',
   canOpen('attendance', 'admin') && !canOpen('attendance', 'manager') &&
   canOpen('zklog', 'admin') && !canOpen('zklog', 'manager'));
ok('أداء القسم للمدير — استعلامه مقيَّد وله فهرس',
   canOpen('team-perf', 'manager') && canOpen('team-perf', 'admin'));
ok('ملفات الموظفين للأدمن والمدير لا للموظف',
   canOpen('employees', 'manager') && !canOpen('employees', 'employee'));
ok('تسجيل حضوري للموظف والمدير لا للأدمن',
   canOpen('attend', 'employee') && canOpen('attend', 'manager') &&
   !canOpen('attend', 'admin'));
ok('صفحة المهمة للأدوار الثلاثة', ROLES.every((r) => canOpen('task', r)));
ok('بروفايل الموظف للأدمن والمدير', canOpen('profile', 'admin') &&
   canOpen('profile', 'manager') && !canOpen('profile', 'employee'));
ok('معرّف مجهول يُرفض للجميع', ROLES.every((r) => !canOpen('لا-توجد', r)));

group('٦. سلامة الشكل');

const allItems = NAV_GROUPS.flatMap((g) => g.items);
eq('لكل عنصر معرّف وتسمية وأيقونة ودور', [],
   allItems.filter((i) => !i.id || !i.label || !i.icon || !i.roles?.length)
           .map((i) => i.id || '(بلا معرّف)'));
eq('لا دور خارج الثلاثة', [],
   [...new Set(allItems.flatMap((i) => i.roles))].filter((r) => !ROLES.includes(r)));
eq('شارة واحدة فقط — updateBadges تكتب على أول عنصر بها', 1,
   allItems.filter((i) => i.badge).length);
eq('والشارة على طلبات الاستئذان والإجازات', 'inbox', allItems.find((i) => i.badge).id);

/* ⚠️ صفحتان خرجتا من الشريط إلى داخل صفحتيهما — ويجب أن تبقيا قابلتين للفتح */
ok('أرشيف المهام يُفتح من «مهام القسم»', canOpen('tasks-archive', 'manager'));
ok('وسجل الحركات من «الإعدادات»', canOpen('audit', 'admin'));
eq('ولا واحدة منهما في الشريط', [],
   ['tasks-archive', 'audit'].filter((id) => idsFor('admin').includes(id)));

group('٧. شريط الوجهات السفلي (الجوال)');

for (const role of ROLES) {
  const d = dockFor(role);
  eq(`أربع وجهات لـ ${role} — والخامس «المزيد» زرّ لا وجهة`, 4, d.length);
  /* ⚠️ الحارس الأهم: وجهة لا يملكها الدور تُعيده للرئيسية بمجرّد لمسها */
  eq(`⚠️ كل وجهة يفتحها ${role} فعلاً`, [],
     d.filter((i) => !canOpen(i.id, role)).map((i) => i.id));
  eq(`لكل وجهة أيقونة — ${role}`, [], d.filter((i) => !i.icon || i.icon === 'dot').map((i) => i.id));
  eq(`ولكل وجهة تسمية قصيرة — ${role}`, [], d.filter((i) => !i.short).map((i) => i.id));
  /* التسمية تشغل خُمس شاشة ٣٩٠px ≈ ٧٨px، فالطويلة تُقصّ بثلاث نقاط */
  eq(`ولا تسمية أطول من ٨ محارف — ${role}`, [],
     d.filter((i) => i.short.length > 8).map((i) => i.short));
  eq(`لا وجهة مكرّرة — ${role}`, 4, new Set(d.map((i) => i.id)).size);
  ok(`الرئيسية أول وجهة — ${role}`, d[0].id === 'home');
  eq(`وكل وجهة في الشريط الجانبي أيضاً — ${role}`, [],
     d.map((i) => i.id).filter((id) => !idsFor(role).includes(id)));
}

eq('الأدوار الثلاثة كلها لها دوك', 3, Object.keys(DOCK_FOR).length);
eq('⚠️ الشارة تصل الدوك — المدير يرى طلباته المنتظرة بلا فتح الدرج',
   true, dockFor('manager').some((i) => i.id === 'inbox' && i.badge));
eq('والأدمن كذلك', true, dockFor('admin').some((i) => i.id === 'inbox' && i.badge));
eq('والموظف بلا شارة — لا يعتمد شيئاً', 0, dockFor('employee').filter((i) => i.badge).length);
eq('دور مجهول يُرجع دوكاً فارغاً لا انهياراً', 0, dockFor('لا-دور').length);

/* ⚠️ محتوى دوك الموظف — طلب المالك ٢٠٢٦-٠٨-١٣: «قائمتي» مكان «أدائي».
   الدوك أربع خانات وما دخله يُخرج غيره، فالمحتوى قرارٌ يُحرَس لا تفصيل.
   السبب: الدوك يُفتح كل يوم، و«أدائي» تُقرأ مرّة في الدورة عند السؤال عن
   خصم — بقيت في الشريط الجانبي وخرجت من الاختصار وحده. */
eq('⚠️ «قائمتي» في دوك الموظف', true,
   dockFor('employee').some((i) => i.id === 'my-day'));
eq('⚠️ و«أدائي» خرجت من الدوك', false,
   dockFor('employee').some((i) => i.id === 'performance'));
eq('لكنها باقية في شريطه الجانبي', true, idsFor('employee').includes('performance'));
eq('وتسميتها القصيرة «قائمتي»', 'قائمتي',
   dockFor('employee').find((i) => i.id === 'my-day').short);
/* ⚠️ الاسم لا يزاحم «مهامي»: الاثنان في نفس الدوك، وتشابههما يجعل الموظف
   يضغط الخطأ كل مرّة. */
eq('⚠️ لا تسميتين متطابقتين في دوك الموظف',
   dockFor('employee').length,
   new Set(dockFor('employee').map((i) => i.short)).size);
eq('ولم يعد اسم الصفحة «يومي» في أي مكان', 'قائمتي', PAGES['my-day'].title);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
