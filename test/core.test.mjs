/* ═══════════════════════════════════════════════════════════════════════════
   القلب الحاسب — الورديات والفروع والصلاحيات.

   هذه الوحدات الثلاث تقرّر من هو «متأخر»، ومن هو «غائب»، ومن يقف «داخل
   الفرع»، ومن يملك حق الاعتماد. وعليها يُبنى الخصم من الراتب. كانت بلا أي
   اختبار — أي إعادة صياغة فيها تغيّر رواتب الناس بصمت ولا يظهر شيء.

   ⚠️ الوحدات المستوردة هنا خالصة تماماً: لا واحدة منها تصل firebase.js ولو
   بشكل غير مباشر، فتُستورد في node بلا محاكي ولا شبكة. (payroll.js و
   attendance.js تجرّان firebase عبر السلسلة، فاختبارهما في المتصفح — انظر
   test/browser/suite.html)

   ⚠️ التواريخ كلها ثابتة. تاريخ «اليوم» يجعل المجموعة تنجح اليوم وتفشل بعد
   شهر بلا أن يتغيّر سطر واحد.
   ═══════════════════════════════════════════════════════════════════════════ */

import { setSettings, setMe } from '../js/lib/state.js';
import { resolveShift, shiftHours, shiftWindowFor, shiftText,
         workingDaysBetween, compensableMin, shiftPlansOf, planById, planUsage,
         DEFAULT_PLAN_ID, checkInWindow, checkInAllowed, attendButtonState,
         LATE_GRACE_MIN, LATE_COMP_MAX_MIN } from '../js/lib/shifts.js';
import { haversine, nearestBranch, geoRuleFor, branchesOf, activeBranches,
         REMOTE_BRANCH_ID } from '../js/lib/geo.js';
import { canApprove, canApproveType, hasChain, chainStep, isLastStep,
         ownsCurrentStep } from '../js/lib/perms.js';
/* ⚠️ ymd() لا toISOString(): الدورة تُبنى على منتصف ليل محلّي، و toISOString
   تحوّله UTC — ففي UTC+3 يقرأ ٢٦ أغسطس على أنه ٢٥. */
import { cycleOf, ymd } from '../js/lib/dates.js';
import { deptCoverageOf, coverageNote, rangeCovered } from '../js/lib/zk-coverage.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

/* ورديات الشركة الافتراضية: الأحد–الخميس ٠٨:٠٠–١٦:٠٠، الجمعة والسبت راحة */
const WEEK = {
  0: { type: 'morning', start: '08:00', end: '16:00' },
  1: { type: 'morning', start: '08:00', end: '16:00' },
  2: { type: 'morning', start: '08:00', end: '16:00' },
  3: { type: 'morning', start: '08:00', end: '16:00' },
  4: { type: 'morning', start: '08:00', end: '16:00' },
  5: { type: 'off', start: '', end: '' },
  6: { type: 'off', start: '', end: '' }
};

const baseSettings = (over = {}) => ({
  shifts: WEEK, departments: [], dateExceptions: [], branches: [],
  leaveTypes: [], approvers: [], company: { lat: null, lng: null, radius: 500 },
  payroll: { hoursPerDay: 8, daysPerMonth: 30, graceMinutes: 0 }, ...over
});

/* ═════════════════════ ١. حلّ الوردية وترتيب أولوياتها ═════════════════════
   الترتيب المعلن: استثناء التاريخ ← وردية القسم ← وردية الشركة.
   كسرُ هذا الترتيب يعني موظفاً يُحاسَب على يوم عطلة رسمية. */
group('١. الورديات — ترتيب الأولوية');

setSettings(baseSettings());
eq('الأحد يوم عمل من وردية الشركة',
   { type: 'morning', src: 'company' },
   (() => { const s = resolveShift('2026-08-02', 0); return { type: s.type, src: s.src }; })());
eq('الجمعة راحة',      'off', resolveShift('2026-08-07', 5).type);
eq('السبت راحة',       'off', resolveShift('2026-08-08', 6).type);

/* وردية القسم تتقدّم على وردية الشركة */
setSettings(baseSettings({
  departments: [{ name: 'الأمن', shifts: { 5: { type: 'evening', start: '16:00', end: '00:00' } } }]
}));
eq('قسم الأمن يداوم الجمعة بينما الشركة راحة',
   { type: 'evening', src: 'dept' },
   (() => { const s = resolveShift('2026-08-07', 5, 'الأمن'); return { type: s.type, src: s.src }; })());
eq('موظف من قسم آخر يبقى على راحة الجمعة',
   'off', resolveShift('2026-08-07', 5, 'المالية').type);
eq('قسم غير معرَّف يسقط لوردية الشركة',
   'company', resolveShift('2026-08-02', 0, 'قسم لا وجود له').src);

/* استثناء التاريخ يتقدّم على الاثنين */
setSettings(baseSettings({
  departments: [{ name: 'الأمن', shifts: { 5: { type: 'evening', start: '16:00', end: '00:00' } } }],
  dateExceptions: [{ date: '2026-08-02', type: 'off', label: 'اليوم الوطني' }]
}));
eq('عطلة رسمية تتقدّم على وردية الشركة', 'off',  resolveShift('2026-08-02', 0).type);
eq('وتتقدّم كذلك على وردية القسم',        'off',  resolveShift('2026-08-02', 0, 'الأمن').type);
eq('واسمها يظهر للمراجع',        'اليوم الوطني', resolveShift('2026-08-02', 0).exLabel);

setSettings(baseSettings({
  dateExceptions: [{ date: '2026-08-07', type: 'work', kind: 'morning',
                     start: '09:00', end: '13:00', label: 'دوام استثنائي' }]
}));
eq('دوام استثنائي يقلب الجمعة يوم عمل',
   { type: 'morning', start: '09:00', end: '13:00' },
   (() => { const s = resolveShift('2026-08-07', 5); return { type: s.type, start: s.start, end: s.end }; })());

/* ═════════════════════ ٢. ساعات الوردية وعبور منتصف الليل ═════════════════ */
group('٢. ساعات الوردية');

eq('٠٨:٠٠–١٦:٠٠ = ٨ ساعات',   8, shiftHours({ type: 'morning', start: '08:00', end: '16:00' }));
eq('١٦:٠٠–٠٠:٠٠ = ٨ ساعات',   8, shiftHours({ type: 'evening', start: '16:00', end: '00:00' }));
eq('٢٢:٠٠–٠٦:٠٠ يعبر منتصف الليل = ٨',
   8, shiftHours({ type: 'evening', start: '22:00', end: '06:00' }));
eq('٠٩:٣٠–١٣:٠٠ = ٣٫٥',    3.5, shiftHours({ type: 'morning', start: '09:30', end: '13:00' }));
eq('يوم راحة = صفر ساعات',    0, shiftHours({ type: 'off', start: '', end: '' }));
eq('وردية بلا أوقات = صفر',   0, shiftHours({ type: 'morning', start: '', end: '' }));
eq('null = صفر',              0, shiftHours(null));

/* النافذة الفعلية على يوم بعينه */
const win = shiftWindowFor(new Date('2026-08-02T00:00:00'), { type: 'morning', start: '08:00', end: '16:00' });
eq('نافذة الوردية تبدأ ٠٨:٠٠',  8, win.start.getHours());
eq('وتنتهي ١٦:٠٠',             16, win.end.getHours());
eq('طولها ٨ ساعات بالمللي', 8 * 3600000, win.end - win.start);

const night = shiftWindowFor(new Date('2026-08-02T00:00:00'), { type: 'evening', start: '22:00', end: '06:00' });
eq('الوردية الليلية تنتهي في اليوم التالي', 3, night.end.getDate());
eq('وطولها ٨ ساعات لا سالب',       8 * 3600000, night.end - night.start);
eq('يوم الراحة بلا نافذة',                    null, shiftWindowFor(new Date('2026-08-07T00:00:00'), { type: 'off' }));

eq('وصف يوم الراحة', 'راحة', shiftText({ type: 'off' }));
eq('وصف الوردية المسائية', 'مسائي 16:00–00:00', shiftText({ type: 'evening', start: '16:00', end: '00:00' }));

/* ═════════════════════ ٣. أيام العمل بين تاريخين ═════════════════════
   عليها يُبنى خصم رصيد الإجازة. عدّ يوم عطلة ضمنها يخصم من رصيد الموظف
   يوماً لا يعمله. */
group('٣. أيام العمل ضمن مدى — أساس خصم رصيد الإجازة');

setSettings(baseSettings());
eq('الأحد–الخميس = ٥ أيام عمل، بلا عطل',
   { days: 5, off: 0 }, workingDaysBetween('2026-08-02', '2026-08-06'));
eq('أسبوع كامل = ٥ عمل و٢ راحة',
   { days: 5, off: 2 }, workingDaysBetween('2026-08-02', '2026-08-08'));
eq('يوم واحد هو يوم عمل',
   { days: 1, off: 0 }, workingDaysBetween('2026-08-02', '2026-08-02'));
eq('يوم واحد هو جمعة',
   { days: 0, off: 1 }, workingDaysBetween('2026-08-07', '2026-08-07'));
eq('نهاية قبل بداية = صفر لا سالب',
   { days: 0, off: 0 }, workingDaysBetween('2026-08-06', '2026-08-02'));
eq('تاريخ فاسد = صفر لا استثناء',
   { days: 0, off: 0 }, workingDaysBetween('ليس تاريخاً', '2026-08-02'));

setSettings(baseSettings({
  dateExceptions: [{ date: '2026-08-04', type: 'off', label: 'عيد' }]
}));
eq('عطلة رسمية داخل المدى لا تُخصم من الرصيد',
   { days: 4, off: 1 }, workingDaysBetween('2026-08-02', '2026-08-06'));

/* ═════════════════════ ٤. الفروع والنطاق الجغرافي ═════════════════════ */
group('٤. المسافة والفروع');

/* مرجع معروف: درجة عرض واحدة ≈ ١١١٫٢ كم */
const d1 = haversine({ lat: 24.0, lng: 46.0 }, { lat: 25.0, lng: 46.0 });
eq('درجة عرض واحدة ≈ ١١١ كم', true, d1 > 110000 && d1 < 112000);
eq('النقطة مع نفسها = صفر', 0, Math.round(haversine({ lat: 24.7, lng: 46.7 }, { lat: 24.7, lng: 46.7 })));

const RIYADH = { lat: 24.7136, lng: 46.6753 };
/* ‎٠٫٠٠١ درجة عرض ≈ ١١١ م */
const near  = { lat: 24.7146, lng: 46.6753 };
const far   = { lat: 24.7236, lng: 46.6753 };   /* ≈ ١١١١ م */

setSettings(baseSettings({
  branches: [{ id: 'b1', name: 'الفرع الرئيسي', lat: RIYADH.lat, lng: RIYADH.lng, radius: 500 }]
}));
eq('فرع واحد نشط', 1, activeBranches().length);
eq('١١١ م داخل نطاق ٥٠٠', true,  nearestBranch(near, activeBranches()).inside);
eq('١١١١ م خارج نطاق ٥٠٠', false, nearestBranch(far,  activeBranches()).inside);
eq('المسافة تُقرَّب لأقرب متر', true, Math.abs(nearestBranch(near, activeBranches()).dist - 111) <= 2);

/* ⚠️ «أقرب فرع» = الأقلّ تجاوزاً لنطاقه، لا الأقلّ متراً.
   لو رُتّبت بالمسافة وحدها لرُفض موظف يقف فعلاً داخل الفرع الكبير. */
setSettings(baseSettings({
  branches: [
    { id: 'صغير', name: 'مكتب صغير',  lat: 24.7136, lng: 46.6753, radius: 50 },
    { id: 'كبير', name: 'المقر الكبير', lat: 24.7100, lng: 46.6753, radius: 900 }
  ]
}));
const pick = nearestBranch({ lat: 24.71414, lng: 46.6753 }, activeBranches());
eq('يُختار الفرع الذي هو داخله فعلاً لا الأقرب متراً', 'كبير', pick.b.id);
eq('ويُحتسب داخله', true, pick.inside);

/* النطاق الخاص بالموظف يتقدّم على نطاق الفرع */
eq('نطاق خاص ٢٠٠٠ م يُدخل من كان خارج نطاق فرعه',
   true, nearestBranch(far, [{ id: 'b1', lat: RIYADH.lat, lng: RIYADH.lng, radius: 500 }], 2000).inside);
eq('ونطاق خاص ٥٠ م يُخرج من كان داخله',
   false, nearestBranch(near, [{ id: 'b1', lat: RIYADH.lat, lng: RIYADH.lng, radius: 500 }], 50).inside);

/* الشكل القديم {company:{lat,lng}} يُركَّب فرعاً تلقائياً — بلا ترحيل بيانات */
setSettings(baseSettings({ company: { lat: RIYADH.lat, lng: RIYADH.lng, radius: 300 } }));
eq('الشكل القديم يُنتج المقر الرئيسي تلقائياً', 1, branchesOf().length);
eq('بنطاقه المحفوظ', 300, branchesOf()[0].radius);
eq('ولا فروع أصلاً حين لا إحداثيات', 0,
   (setSettings(baseSettings()), branchesOf().length));

/* ═════════════════════ ٥. قاعدة الموظف الجغرافية ═════════════════════ */
group('٥. قاعدة الموظف — عن بُعد والفروع الموقوفة');

setSettings(baseSettings({
  branches: [
    { id: 'b1', name: 'الرئيسي', lat: 24.7, lng: 46.7, radius: 500 },
    { id: 'b2', name: 'الفرع الثاني', lat: 24.8, lng: 46.8, radius: 500 },
    { id: 'b3', name: 'موقوف', lat: 24.9, lng: 46.9, radius: 500, active: false }
  ]
}));
eq('الافتراضي onsite بكل الفروع النشطة',
   { mode: 'onsite', allowed: 2, orphaned: false },
   (() => { const r = geoRuleFor({}); return { mode: r.mode, allowed: r.allowed.length, orphaned: r.orphaned }; })());
eq('workMode=remote يُعطي وضع «من أي مكان»',
   'remote', geoRuleFor({ workMode: 'remote' }).mode);
eq('المقيَّد بفرع يرى فرعه وحده',
   1, geoRuleFor({ branchIds: ['b1'] }).allowed.length);

/* ⚠️ إيقاف الفرع لا يفتح للموظف كل الفروع — عكس المقصود تماماً */
eq('المقيَّد بفرع موقوف لا يُمنح كل الفروع',
   { allowed: 0, orphaned: true },
   (() => { const r = geoRuleFor({ branchIds: ['b3'] }); return { allowed: r.allowed.length, orphaned: r.orphaned }; })());

eq('نطاق خاص ٨٠٠ يُقبل',   800,  geoRuleFor({ geoRadius: 800 }).radiusOverride);
eq('نطاق خاص ٤٩ يُرفض (دون ٥٠)', null, geoRuleFor({ geoRadius: 49 }).radiusOverride);
eq('نطاق خاص غير رقمي يُرفض',    null, geoRuleFor({ geoRadius: 'كثير' }).radiusOverride);

/* ═════════════════════ ٦. صلاحيات الاعتماد ═════════════════════ */
group('٦. من يعتمد ماذا');

const ADMIN   = { id: 'a1', role: 'admin',    name: 'الأدمن' };
const MGR     = { id: 'm1', role: 'manager',  name: 'المدير',  department: 'المبيعات' };
const EMP     = { id: 'e1', role: 'employee', name: 'الموظف',  department: 'المبيعات' };
const permReq  = { type: 'permission', department: 'المبيعات', employeeUid: 'e1', status: 'pending' };
const leaveReq = { type: 'leave',      department: 'المبيعات', employeeUid: 'e1', status: 'pending' };
const otherDept= { type: 'permission', department: 'المالية',  employeeUid: 'x9', status: 'pending' };

setMe(ADMIN);
eq('الأدمن يعتمد الاستئذان', true, canApproveType(permReq));
eq('والأدمن يعتمد الإجازة',  true, canApproveType(leaveReq));
eq('والأدمن يعتمد لأي قسم',  true, canApproveType(otherDept));

setMe(MGR);
eq('مدير القسم يعتمد استئذان قسمه',      true,  canApproveType(permReq));
/* ⚠️ الإجازة تُعدّل الرصيد، وقاعدة users لا تسمح للمدير بالكتابة على ملف موظفه */
eq('ولا يعتمد الإجازة — تمسّ الرصيد',    false, canApproveType(leaveReq));
eq('ولا يعتمد لقسم غيره',                false, canApprove(otherDept));
eq('ولا يعتمد طلبه هو',                  false,
   canApprove({ ...permReq, employeeUid: 'm1' }));

setMe(EMP);
eq('الموظف لا يعتمد شيئاً', false, canApprove(permReq));

/* ═════════════════════ ٧. سلسلة الاعتمادات ═════════════════════ */
group('٧. سلسلة الاعتمادات متعددة الخطوات');

const chained = { type: 'leave', department: 'المبيعات', employeeUid: 'e1', status: 'pending',
                  chain: ['manager', 'admin'], step: 0, approvals: [] };

eq('طلب بلا chain يسلك المسار القديم', false, hasChain(permReq));
eq('وخطوته صفر',                        0,     chainStep(permReq));
eq('طلب بسلسلة يُعرف',                  true,  hasChain(chained));
eq('الخطوة الأولى ليست الأخيرة',        false, isLastStep(chained));
eq('الخطوة الثانية هي الأخيرة',         true,  isLastStep({ ...chained, step: 1 }));

setMe(MGR);
eq('المدير يملك الخطوة الأولى (manager)', true,  ownsCurrentStep(chained));
eq('ولا يملك الثانية (admin)',            false, ownsCurrentStep({ ...chained, step: 1 }));
setMe(ADMIN);
eq('الأدمن لا يملك الخطوة الأولى',        false, ownsCurrentStep(chained));
eq('ويملك الثانية',                       true,  ownsCurrentStep({ ...chained, step: 1 }));

/* ⚠️ الطلب المحسوم لا خطوة فيه — بدونها يُعاد اعتماد طلب سُحب أو رُفض */
eq('طلب معتمَد لا يملك أحد خطوته', false, ownsCurrentStep({ ...chained, step: 1, status: 'approved' }));
eq('وطلب مسحوب كذلك',              false, ownsCurrentStep({ ...chained, step: 1, status: 'cancelled' }));
setMe({ id: 'e1', role: 'manager', name: 'مدير يقدّم لنفسه', department: 'المبيعات' });
eq('ولا يعتمد صاحبُ الطلب خطوته ولو ملك الدور', false, ownsCurrentStep(chained));

/* ═════════════════════ ٨. الدورة الشهرية ٢٦ ← ٢٥ ═════════════════════ */
group('٨. دورة الرواتب — من ٢٦ إلى ٢٥');

eq('يوم ٢٦ يفتح دورة جديدة',   '2026-08-26', ymd(cycleOf('2026-08-26').start));
eq('ويوم ٢٥ يغلق التي قبلها',  '2026-07-26', ymd(cycleOf('2026-08-25').start));
eq('ومنتصف الشهر داخل دورة الشهر السابق', '2026-07-26', ymd(cycleOf('2026-08-10').start));
eq('وأول يناير يعود لديسمبر السابق',      '2025-12-26', ymd(cycleOf('2026-01-05').start));
eq('ونهاية الدورة هي ٢٥ من الشهر التالي', '2026-08-25', ymd(cycleOf('2026-08-10').end));

/* ═════════════════════ ٩. تعويض التأخير ═════════════════════
   خاصية داخلية للأدمن: من تأخّر ثم بقي بعد نهاية ورديته تُقاصّ دقائقه بحدّ
   ساعة. هذه الدالة تقرّر كم يُخصم من راتب الموظف — فحدودها تُختبر واحداً واحداً. */
group('٩. تعويض التأخير بالبقاء بعد الوردية');

/* وردية ٢٠٢٦-٠٨-٠٢ (الأحد) ٠٨:٠٠–١٦:٠٠ */
const cWin = shiftWindowFor(new Date('2026-08-02T00:00:00'), WEEK[0]);
const outAt = (hm) => new Date('2026-08-02T' + hm + ':00');

eq('تأخر ٦٠ د وبقي ٦٠ د → يُعوَّض كاملاً', 60, compensableMin(60, outAt('17:00'), cWin));
eq('تأخر ٣٠ د وبقي ٦٠ د → التعويض بقدر التأخير لا أكثر', 30, compensableMin(30, outAt('17:00'), cWin));
eq('تأخر ٦٠ د وبقي ٣٠ د → التعويض بقدر البقاء', 30, compensableMin(60, outAt('16:30'), cWin));

/* ⚠️ سقف الساعة: بدونه يصير الدوام مفتوحاً — من تأخّر ٣ ساعات وبقي ٣ لا يُخصم عليه شيء */
eq('تأخر ١٨٠ د وبقي ١٨٠ د → السقف ساعة والباقي تأخير', 60, compensableMin(180, outAt('19:00'), cWin));
eq('تأخر ٩٠ د وبقي ٩٠ د → ٦٠ تعويضاً و٣٠ تبقى', 60, compensableMin(90, outAt('17:30'), cWin));

eq('انصرف في وقته → لا تعويض',        0, compensableMin(60, outAt('16:00'), cWin));
eq('انصرف مبكراً → لا تعويض',          0, compensableMin(60, outAt('15:00'), cWin));
eq('لم يتأخر أصلاً → لا تعويض',        0, compensableMin(0,  outAt('19:00'), cWin));
eq('بلا بصمة انصراف → لا تعويض',       0, compensableMin(60, null, cWin));
eq('بلا وردية محدّدة → لا تعويض',      0, compensableMin(60, outAt('19:00'), null));
eq('تأخير سالب (خطأ حساب) → صفر لا سالب', 0, compensableMin(-30, outAt('19:00'), cWin));
eq('السقف المعلن ساعة واحدة', 60, LATE_COMP_MAX_MIN);

/* ═════════════════ ١٠. خطط الشفتات المتعدّدة (المرحلة ٢) ═════════════════

   الطلب: «بعض الأحيان عندي موظفين يبدأ دوامهم ٢ أو ٣ العصر غير الباقي».
   الخطر: هذه الطبقة تدخل بين الموظف وحساب تأخيره — أي خطأ فيها يخصم من
   راتب إنسان. فالاختبار الأهم هنا ليس أن الجديد يعمل، بل أن **القديم لم
   يتحرّك بالحرف** لمن لا خطة له. */
group('١٠. خطط الشفتات — التوافق الخلفي أولاً');

const EVENING = {
  0: { type: 'evening', start: '15:00', end: '23:00' },
  1: { type: 'evening', start: '15:00', end: '23:00' },
  2: { type: 'evening', start: '15:00', end: '23:00' },
  3: { type: 'evening', start: '15:00', end: '23:00' },
  4: { type: 'evening', start: '15:00', end: '23:00' },
  5: { type: 'off', start: '', end: '' },
  6: { type: 'off', start: '', end: '' }
};
const planEvening = { id: 'plan_pm', name: 'الشفت المسائي', days: EVENING, active: true };

/* ── بلا أي خطة: كل شيء كما كان ── */
setSettings(baseSettings());
eq('بلا shiftPlans تُركَّب خطة واحدة في الذاكرة', 1, shiftPlansOf().length);
eq('وهي مُعلَّمة أنها مُركَّبة لا محفوظة', true, shiftPlansOf()[0].synthetic);
eq('ومعرّفها هو الافتراضي المعلن', DEFAULT_PLAN_ID, shiftPlansOf()[0].id);
eq('وأيامها هي ورديات الشركة نفسها', WEEK[0], shiftPlansOf()[0].days[0]);

eq('موظف بلا خطة ولا قسم → سلوك اليوم بالحرف',
   { type: 'morning', src: 'company' },
   (() => { const s = resolveShift('2026-08-02', 0, '', { id: 'u1' }); return { type: s.type, src: s.src }; })());
eq('ونداء بلا المعامل الرابع إطلاقاً يعطي نفس النتيجة',
   { type: 'morning', src: 'company' },
   (() => { const s = resolveShift('2026-08-02', 0); return { type: s.type, src: s.src }; })());

/* ── خطة الموظف تتقدّم على قسمه وعلى الشركة ── */
setSettings(baseSettings({
  shiftPlans: [planEvening],
  departments: [{ name: 'المبيعات', shifts: { 0: { type: 'morning', start: '09:00', end: '17:00' } } }]
}));
eq('موظف بخطة مسائية → خطته تفوز على وردية قسمه',
   { type: 'evening', start: '15:00', src: 'empPlan' },
   (() => { const s = resolveShift('2026-08-02', 0, 'المبيعات', { shiftPlanId: 'plan_pm' });
            return { type: s.type, start: s.start, src: s.src }; })());
eq('وزميله بلا خطة يبقى على وردية القسم',
   { type: 'morning', start: '09:00', src: 'dept' },
   (() => { const s = resolveShift('2026-08-02', 0, 'المبيعات', { id: 'u2' });
            return { type: s.type, start: s.start, src: s.src }; })());

/* ── خطة القسم بين خطة الموظف والورديات القديمة ── */
setSettings(baseSettings({
  shiftPlans: [planEvening],
  departments: [{ name: 'الأمن', shiftPlanId: 'plan_pm',
                  shifts: { 0: { type: 'morning', start: '09:00', end: '17:00' } } }]
}));
eq('خطة القسم تتقدّم على ورديات القسم القديمة',
   { type: 'evening', src: 'deptPlan' },
   (() => { const s = resolveShift('2026-08-02', 0, 'الأمن'); return { type: s.type, src: s.src }; })());

/* ── الطبقات الخمس مرتّبة: استثناء التاريخ يعلو الجميع ── */
setSettings(baseSettings({
  shiftPlans: [planEvening],
  departments: [{ name: 'الأمن', shiftPlanId: 'plan_pm' }],
  dateExceptions: [{ date: '2026-08-02', type: 'off', label: 'اليوم الوطني' }]
}));
eq('عطلة رسمية تتقدّم حتى على خطة الموظف', 'off',
   resolveShift('2026-08-02', 0, 'الأمن', { shiftPlanId: 'plan_pm' }).type);
eq('واسمها هو الظاهر لا اسم الخطة', 'اليوم الوطني',
   resolveShift('2026-08-02', 0, 'الأمن', { shiftPlanId: 'plan_pm' }).exLabel);

/* ── ⚠️ خطة معطَّلة لا تعني «راحة» ──
   لو أعادت off لصار قسم كامل غائباً في المسير بضغطة تعطيل واحدة. */
setSettings(baseSettings({
  shiftPlans: [{ ...planEvening, active: false }],
  departments: [{ name: 'الأمن', shiftPlanId: 'plan_pm' }]
}));
eq('خطة معطَّلة تسقط للطبقة التالية ولا تُغيّب أحداً',
   { type: 'morning', src: 'company' },
   (() => { const s = resolveShift('2026-08-02', 0, 'الأمن', { shiftPlanId: 'plan_pm' });
            return { type: s.type, src: s.src }; })());

/* ── ⚠️ خطة ناقصة اليوم تسقط ولا تُحسب راحة ── */
setSettings(baseSettings({
  shiftPlans: [{ id: 'plan_half', name: 'ناقصة', days: { 1: EVENING[1] }, active: true }]
}));
eq('خطة بلا تعريف لليوم المطلوب تسقط للشركة',
   'company', resolveShift('2026-08-02', 0, '', { shiftPlanId: 'plan_half' }).src);
eq('واليوم المعرَّف فيها يعمل', 'empPlan',
   resolveShift('2026-08-03', 1, '', { shiftPlanId: 'plan_half' }).src);

/* ── معرّف خطة لا وجود له لا يكسر شيئاً ── */
setSettings(baseSettings({ shiftPlans: [planEvening] }));
eq('shiftPlanId يشير لخطة محذوفة → يسقط للشركة بلا خطأ',
   'company', resolveShift('2026-08-02', 0, '', { shiftPlanId: 'plan_ghost' }).src);
eq('planById لمعرّف غير موجود → null', null, planById('plan_ghost'));

/* ── الخطة الافتراضية على مستوى الشركة ── */
setSettings(baseSettings({ shiftPlans: [planEvening], defaultShiftPlanId: 'plan_pm' }));
eq('الخطة الافتراضية تحلّ محلّ settings.shifts للجميع',
   { type: 'evening', src: 'plan' },
   (() => { const s = resolveShift('2026-08-02', 0); return { type: s.type, src: s.src }; })());

/* ── ⚠️ الوصلة إلى المرحلة ١: checkInCutoff لازم يركب الوردية ── */
group('١٠-ب. checkInCutoff يصل من الخطة إلى الوردية');
setSettings(baseSettings({
  shiftPlans: [{ ...planEvening, checkInCutoff: '18:30' }]
}));
eq('قفل الحضور المُعرَّف في الخطة يظهر على الوردية المُرجَعة', '18:30',
   resolveShift('2026-08-02', 0, '', { shiftPlanId: 'plan_pm' }).checkInCutoff);
setSettings(baseSettings({ shiftPlans: [planEvening] }));
eq('وخطة بلا قفل صريح لا تخترع واحداً', undefined,
   resolveShift('2026-08-02', 0, '', { shiftPlanId: 'plan_pm' }).checkInCutoff);
eq('والمسار القديم بلا خطط لا قفل فيه إطلاقاً', undefined,
   resolveShift('2026-08-02', 0).checkInCutoff);

/* ── أيام الإجازة تُحسب على خطة الموظف ── */
group('١٠-ج. الإجازة تحترم خطة شفت الموظف');
setSettings(baseSettings({
  shiftPlans: [{ id: 'plan_tue', name: 'راحته الثلاثاء',
                 days: { ...WEEK, 2: { type: 'off', start: '', end: '' },
                         5: { type: 'morning', start: '08:00', end: '16:00' } },
                 active: true }]
}));
eq('موظف راحته الثلاثاء لا يُخصم منه الثلاثاء',
   { days: 4, off: 1 },
   workingDaysBetween('2026-08-02', '2026-08-06', '', { shiftPlanId: 'plan_tue' }));
eq('وزميله على دوام الشركة يُخصم منه الأيام الخمسة',
   { days: 5, off: 0 },
   workingDaysBetween('2026-08-02', '2026-08-06', ''));

/* ── حراسة الحذف ── */
group('١٠-د. مَن يتبع الخطة');
setSettings(baseSettings({
  shiftPlans: [planEvening],
  departments: [{ name: 'الأمن', shiftPlanId: 'plan_pm' }, { name: 'المالية' }]
}));
eq('تُحصى الأقسام والموظفون التابعون للخطة',
   { depts: 1, employees: 2, deptNames: ['الأمن'] },
   planUsage('plan_pm', [{ shiftPlanId: 'plan_pm' }, { shiftPlanId: 'plan_pm' }, { shiftPlanId: 'x' }]));
eq('وخطة لا يتبعها أحد تُحصى صفراً',
   { depts: 0, employees: 0, deptNames: [] }, planUsage('plan_none', []));

/* ═════════════ ١١. نافذة تسجيل الحضور وقفلها (المرحلة ١) ═════════════

   الخلل الأصلي: زرّ اللوحة كان يُعطَّل **كله** بعد نهاية الوردية بساعتين،
   فمن نسي الانصراف لا يقدر يخرج. القراران منفصلان الآن:
     • الانصراف لا يُقفل أبداً — تحرسه اللوحة لا هذه الدالة
     • الحضور محكوم بالنافذة، ومن لم يسجّل اليوم إطلاقاً يُسمح له متأخراً

   القرار المعتمَد من المالك (٢٠٢٦-٠٨-١٢): «ما سجّل حضور ولا مرة → يبان له
   تسجيل حضور. فيه تسجيل حضور قديم → خلاص.» */
group('١١. نافذة تسجيل الحضور');

const MORNING = { type: 'morning', start: '08:00', end: '16:00' };
const at = (hhmm, day = '2026-08-02') => new Date(`${day}T${hhmm}:00`);

const w1 = checkInWindow(at('12:00'), MORNING);
eq('النافذة تفتح قبل الوردية بساعتين', 6, w1.opensAt.getHours());
eq('وتُقفل عند نهاية الوردية',        16, w1.closesAt.getHours());
eq('يوم الراحة بلا نافذة إطلاقاً', null, checkInWindow(at('12:00'), { type: 'off' }));

/* قفل صريح من الخطة يتقدّم على نهاية الوردية */
eq('checkInCutoff الصريح يُقصّر النافذة', 10,
   checkInWindow(at('12:00'), { ...MORNING, checkInCutoff: '10:00' }).closesAt.getHours());

/* ⚠️ وردية عابرة لمنتصف الليل: القفل ٠٢:٠٠ يعني فجر الغد لا فجر اليوم */
const nightPlan = { type: 'evening', start: '22:00', end: '06:00', checkInCutoff: '02:00' };
const wn = checkInWindow(at('23:00'), nightPlan);
eq('قفل ٠٢:٠٠ على وردية ليلية يقع في اليوم التالي', 3, wn.closesAt.getDate());
eq('ونافذتها تفتح ٢٠:٠٠ من نفس اليوم', 20, wn.opensAt.getHours());

/* ── القرار: قبل النافذة · داخلها · بعدها ── */
const gate = (hhmm, over = {}) =>
  checkInAllowed(at(hhmm), MORNING, { hasSessionToday: false, allowLate: true, ...over });

eq('الخامسة صباحاً — قبل فتح النافذة',
   { ok: false, reason: 'early' },
   (() => { const g = gate('05:00'); return { ok: g.ok, reason: g.reason }; })());
eq('السابعة — داخل النافذة المبكرة',
   { ok: true, reason: 'open' },
   (() => { const g = gate('07:00'); return { ok: g.ok, reason: g.reason }; })());
eq('العاشرة — داخل الدوام',
   { ok: true, reason: 'open' },
   (() => { const g = gate('10:00'); return { ok: g.ok, reason: g.reason }; })());

/* ⚠️ جوهر طلب المالك — الحالتان المتقابلتان بعد القفل */
eq('السادسة مساءً ولم يسجّل اليوم إطلاقاً → مسموح وموسوم',
   { ok: true, reason: 'late', late: true },
   (() => { const g = gate('18:00'); return { ok: g.ok, reason: g.reason, late: g.late }; })());
eq('السادسة مساءً وعنده جلسة اليوم → انتهى يومه',
   { ok: false, reason: 'done' },
   (() => { const g = gate('18:00', { hasSessionToday: true }); return { ok: g.ok, reason: g.reason }; })());

/* الإعداد يقفل المتأخر لمن أراد ذلك لاحقاً */
eq('allowLateCheckIn=false يمنع المتأخر حتى لمن لم يسجّل',
   { ok: false, reason: 'closed' },
   (() => { const g = gate('18:00', { allowLate: false }); return { ok: g.ok, reason: g.reason }; })());

/* ── يوم الراحة يبقى مفتوحاً ── */
eq('يوم الراحة: التسجيل متاح ويُوسم offDayWork',
   { ok: true, reason: 'offDay' },
   (() => { const g = checkInAllowed(at('10:00'), { type: 'off' }, { hasSessionToday: false });
            return { ok: g.ok, reason: g.reason }; })());
eq('وحتى بعد منتصف النهار في يوم الراحة', true,
   checkInAllowed(at('23:00'), { type: 'off' }, {}).ok);

/* ── الوردية المسائية: القفل يتبعها هي لا الساعة ٤ ──
   هذا هو سبب ربط القفل بالوردية أصلاً — موظف يبدأ ٣ العصر. */
const PM = { type: 'evening', start: '15:00', end: '23:00' };
eq('من يبدأ ٣ العصر يقدر يسجّل الساعة ٤ عصراً',
   true, checkInAllowed(at('16:00'), PM, {}).ok);
eq('وقفل ثابت على ٤:٠٠ كان سيمنعه — النافذة تتبع ورديته',
   true, checkInAllowed(at('22:00'), PM, {}).ok);
eq('وبعد نهاية ورديته وعنده جلسة → انتهى',
   false, checkInAllowed(at('23:30'), PM, { hasSessionToday: true }).ok);

/* ═════════ ١٢. زرّ اللوحة — الانصراف لا يُقفل أبداً (المرحلة ١) ═════════

   ⚠️ هذه المجموعة تحرس الخلل الأصلي بعينه: سطر واحد كان يعطّل الزر كله بعد
   نهاية الوردية بساعتين، فمن دخل ونسي الانصراف يجد الزر مقفلاً ولا يقدر
   يخرج — فتبقى جلسته مفتوحة وتُقرأ عليه هو «نسيان بصمة خروج».

   القاعدة التي لا تُكسر: hasOpenSession=true ⇒ زرّ انصراف مُفعَّل، **مهما
   كانت البوّابة**. لو سقط أي اختبار هنا فقد عاد الخلل. */
group('١٢. زرّ اللوحة — الانصراف مفتوح دائماً');

const btn = (over = {}) => attendButtonState({
  loaded: true, loadErr: false, hasOpenSession: false, gate: { ok: true }, ...over });

eq('جلسة مفتوحة → انصراف مُفعَّل',
   { kind: 'out', disabled: false },
   (() => { const s = btn({ hasOpenSession: true }); return { kind: s.kind, disabled: s.disabled }; })());

/* الحالات الأربع التي كانت تقفل الزر — كلها لازم تبقى مفتوحة للانصراف */
[['بوّابة مقفلة', { ok: false, reason: 'closed' }],
 ['انتهى يومه',   { ok: false, reason: 'done'   }],
 ['قبل النافذة',  { ok: false, reason: 'early'  }],
 ['بلا بوّابة',    null]
].forEach(([label, g]) => {
  const s = btn({ hasOpenSession: true, gate: g });
  eq(`${label} + جلسة مفتوحة → الانصراف يبقى مُفعَّلاً`,
     { kind: 'out', disabled: false }, { kind: s.kind, disabled: s.disabled });
});

/* بلا جلسة مفتوحة: البوّابة هي الحاكمة */
eq('بلا جلسة + بوّابة مفتوحة → زرّ حضور',
   { kind: 'in', disabled: false, late: false },
   (() => { const s = btn(); return { kind: s.kind, disabled: s.disabled, late: s.late }; })());
eq('بلا جلسة + بوّابة متأخرة → حضور متأخر',
   { kind: 'in', disabled: false, late: true, label: 'تسجيل حضور متأخر' },
   (() => { const s = btn({ gate: { ok: true, late: true } });
            return { kind: s.kind, disabled: s.disabled, late: s.late, label: s.label }; })());
eq('بلا جلسة + انتهى يومه → مقفل برسالته',
   { disabled: true, label: 'أنهيت دوامك اليوم' },
   (() => { const s = btn({ gate: { ok: false, reason: 'done' } });
            return { disabled: s.disabled, label: s.label }; })());
eq('بلا جلسة + قبل النافذة → مقفل برسالته',
   { disabled: true, label: 'لم يبدأ وقت التسجيل بعد' },
   (() => { const s = btn({ gate: { ok: false, reason: 'early' } });
            return { disabled: s.disabled, label: s.label }; })());

/* التحميل والخطأ يسبقان كل شيء */
eq('قبل التحميل → مقفل',   true, btn({ loaded: false }).disabled);
eq('خطأ قراءة → مقفل',     true, btn({ loadErr: true }).disabled);
eq('⚠️ لكن خطأ القراءة مع جلسة مفتوحة لا يحبس الموظف… يبقى مقفلاً عمداً',
   'err', btn({ loadErr: true, hasOpenSession: true }).kind);

/* ═══════ ١٣. تغطية `department` في سجل جهاز البصمة (المرحلة ٤) ═══════

   شاشة المدير تفلتر بـ where('department','==',…) وإلا رُفض الاستعلام كاملاً.
   والوثائق القديمة بلا الحقل **تُتخطّى بصمت** — لا خطأ ولا رفض. فالشاشة
   تعمل وتبدو سليمة وأيام منها ناقصة. هذه المجموعة تحرس اكتشاف ذلك النقص. */
group('١٣. تغطية القسم في سجل الجهاز');

const rec = (date, dept) => (dept === undefined ? { date } : { date, department: dept });

eq('لا سجلات → لا ادّعاء بشيء',
   { total: 0, complete: false, safeFrom: null },
   (() => { const c = deptCoverageOf([]); return { total: c.total, complete: c.complete, safeFrom: c.safeFrom }; })());

eq('كل السجلات تحمل القسم → تغطية كاملة',
   { withoutDept: 0, complete: true, safeFrom: '2026-08-01' },
   (() => { const c = deptCoverageOf([rec('2026-08-01','المبيعات'), rec('2026-08-02','المبيعات')]);
            return { withoutDept: c.withoutDept, complete: c.complete, safeFrom: c.safeFrom }; })());

eq('قديمة بلا قسم ثم جديدة به → التغطية تبدأ بعد آخر ناقص',
   { withDept: 2, withoutDept: 2, lastMissingDate: '2026-07-15', safeFrom: '2026-07-16' },
   (() => { const c = deptCoverageOf([
              rec('2026-07-14'), rec('2026-07-15'),
              rec('2026-07-16','المبيعات'), rec('2026-08-01','المالية')]);
            return { withDept: c.withDept, withoutDept: c.withoutDept,
                     lastMissingDate: c.lastMissingDate, safeFrom: c.safeFrom }; })());

/* ⚠️ جوهر الدالة: انقطاع الجسر بعد أن بدأ يكتب القسم.
   الأخذ بأقدم ظهور للحقل يعطي ٢٠٢٦-٠٧-٠١ ويدّعي تغطية أسبوعٍ لا نملكه. */
eq('انقطاع في المنتصف → العبرة بآخر ناقص لا بأول ظهور',
   { firstDeptDate: '2026-07-01', lastMissingDate: '2026-07-20', safeFrom: '2026-07-21' },
   (() => { const c = deptCoverageOf([
              rec('2026-07-01','المبيعات'), rec('2026-07-19'), rec('2026-07-20'),
              rec('2026-07-21','المبيعات')]);
            return { firstDeptDate: c.firstDeptDate, lastMissingDate: c.lastMissingDate,
                     safeFrom: c.safeFrom }; })());

eq('قسم فارغ يُعامَل كغائب لا كموجود',
   1, deptCoverageOf([rec('2026-08-01', '')]).withoutDept);
eq('سجل بلا تاريخ يُستبعَد من الحساب',
   1, deptCoverageOf([rec('2026-08-01','المبيعات'), { department: 'المالية' }]).total);
eq('نهاية الشهر تُحسب صحيحة عند الانتقال ليوم تالٍ',
   '2026-08-01', deptCoverageOf([rec('2026-07-31')]).safeFrom);

/* الجملة المعروضة للمدير */
eq('تغطية كاملة → لا تحذير يُعرض', null,
   coverageNote(deptCoverageOf([rec('2026-08-01','المبيعات')])));
eq('تغطية ناقصة → تحذير يذكر التاريخ الآمن', true,
   (coverageNote(deptCoverageOf([rec('2026-07-15'), rec('2026-07-16','المبيعات')])) || '')
     .includes('2026-07-16'));

/* حراسة النطاق قبل الرسم */
const covPartial = deptCoverageOf([rec('2026-07-15'), rec('2026-07-16','المبيعات')]);
eq('نطاق كله قبل التغطية → مرفوض',       false, rangeCovered(covPartial, '2026-07-01', '2026-07-10'));
eq('نطاق يبدأ داخل التغطية → مقبول',      true,  rangeCovered(covPartial, '2026-07-16', '2026-08-01'));
eq('نطاق يعبر حدّ التغطية → مرفوض',       false, rangeCovered(covPartial, '2026-07-10', '2026-08-01'));
eq('تغطية كاملة → كل نطاق مقبول',        true,
   rangeCovered(deptCoverageOf([rec('2026-08-01','المبيعات')]), '2020-01-01', '2030-01-01'));
eq('لا بيانات → لا ندّعي نقصاً',          true,  rangeCovered(deptCoverageOf([]), '2026-01-01', '2026-12-31'));

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
