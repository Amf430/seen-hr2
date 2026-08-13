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

eq('⚠️ الأدمن ١٨ رابطاً — كانت ٢٤ قبل إخراج الإعدادات', 18, count('admin'));
eq('المدير ١٧', 17, count('manager'));
eq('الموظف ١١', 11, count('employee'));

for (const role of ROLES) {
  const big = navFor(role).filter((g) => g.group && g.items.length > 3)
    .map((g) => `${g.group}=${g.items.length}`);
  /* المجموعة المعنونة تُقرأ مجموعةً ما دامت ≤٣؛ وغير المعنونة مستثناة */
  if (role === 'manager') {
    eq('«الطلبات» عند المدير ٤ — نطاق واحد متماسك، مقبول', ['الطلبات=4'], big);
  } else {
    eq(`لا مجموعة معنونة تتجاوز ٣ عناصر — ${role}`, [], big);
  }
}

group('٢. الإعدادات — المزلق الذي يُعيد المستخدم للرئيسية بلا رسالة');

eq('سبعة إعدادات', 7, SETTINGS_PAGES.length);
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
eq('والشارة على «بانتظار موافقتك»', 'inbox', allItems.find((i) => i.badge).id);

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

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
