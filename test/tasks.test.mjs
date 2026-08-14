/* ═══════════════════════════════════════════════════════════════════════════
   نظام المهام — دورة الحياة والصلاحيات والتحليلات (المرحلة ٥)

   ⚠️ كل ما يُختبر هنا يخفي أزراراً فقط. الحارس الحقيقي match /tasks في
   firestore.rules، ويُختبر في rules.test.mjs على المحاكي. وجود اختبار هنا
   لا يعني أن الشرط مفروض على السيرفر — ابحث عن نظيره هناك.

   ⚠️ التواريخ ثابتة. تاريخ «اليوم» يجعل المجموعة تنجح اليوم وتفشل بعد شهر.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  allowedMoves, canMove, roleFor, nextStepFor, dueStateOf, daysBetweenYmd,
  isStaleTask, sortTasks, boardColumns, managerPulse, taskAnalytics,
  analyticsBy, checklistPct, STATUS_AR, ACTIVE_STATUSES, STALE_DAYS,
  /* الدفعة ١ — إصلاح العيوب الثلاثة */
  progressOf, blockInfo, CLOSED_STATUSES, workloadBy, urgentPressure,
  URGENT_SOFT_CAP, STATUSES,
  /* الدفعة ٢ — سجل النشاط المشتقّ */
  buildTimeline, filterTimeline, EVENT_AR,
  /* لوحة السحب */
  dropAllowed, BOARD_STATUSES,
  /* المرحلة ٧ */
  duePeriodsFor, recurringTaskId, isoWeekKey, MAX_BACKFILL_DAYS,
  leaveCovering, tasksHittingLeave,
  timeSummary, MAX_TIME_ENTRIES,
  blockersOf, isBlocked, MAX_BLOCKERS,
  delegationActive, effectiveAssignees,
  withDepartments, MAX_DEPARTMENTS,
  shouldArchive, dueForArchive, searchArchive, ARCHIVE_AFTER_DAYS
} from '../js/lib/task-flow.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const TODAY = '2026-08-12';
const T = (over = {}) => ({
  id: 't1', title: 'مهمة', status: 'new', priority: 'normal',
  departments: ['المبيعات'], department: 'المبيعات',
  assigneeUid: 'u1', createdAtYmd: '2026-08-01', ...over
});

/* ═══════════ ١. دورة الحياة ═══════════

   ⚠️ القرار الجوهري: الموظف لا يضع مهمته `done` بنفسه. بلا خطوة review تصير
   «نسبة الإنجاز» رقماً يكتبه الموظف عن نفسه، ويفقد قسم التحليلات قيمته. */
group('١. الانتقالات المسموحة');

eq('الموظف يبدأ التنفيذ',            ['in_progress'], allowedMoves(T({ status: 'new' }), 'assignee'));
eq('ثم يوقفها أو يرسلها للاعتماد',   ['blocked', 'review'], allowedMoves(T({ status: 'in_progress' }), 'assignee'));
eq('ويستأنف المتوقفة',               ['in_progress'], allowedMoves(T({ status: 'blocked' }), 'assignee'));

eq('⚠️ الموظف لا يضع مهمته منجزة بنفسه',   false, canMove(T({ status: 'in_progress' }), 'assignee', 'done'));
eq('⚠️ ولا يسحبها من الاعتماد',             [],    allowedMoves(T({ status: 'review' }), 'assignee'));
eq('⚠️ ولا يفتح منجزة',                     [],    allowedMoves(T({ status: 'done' }), 'assignee'));

/* ⚠️ 'cancelled' أُضيفت في الدفعة ١: المهمة التي يُقرَّر ألّا تُنفَّذ لم يكن
   لها مخرج، فكانت تُعتمَد كذباً أو تبقى مفتوحة تشوّه كل رقم. */
eq('المدير يعتمد أو يُعيد للتحسين أو يلغي', ['done', 'in_progress', 'cancelled'], allowedMoves(T({ status: 'review' }), 'manager'));
eq('والأدمن مثله',                  ['done', 'in_progress', 'cancelled'], allowedMoves(T({ status: 'review' }), 'admin'));
eq('المدير يؤرشف المنجزة',          ['archived', 'in_progress'], allowedMoves(T({ status: 'done' }), 'manager'));
eq('المؤرشفة لا تتحرّك لأحد',        [], allowedMoves(T({ status: 'archived' }), 'admin'));
eq('من لا دور له لا ينقل شيئاً',     [], allowedMoves(T({ status: 'new' }), null));

/* ═══════════ ٢. دور المستخدم تجاه المهمة ═══════════ */
group('٢. من هو صاحب الدور');

const mgrOfSales = { id: 'm1', role: 'manager', department: 'المبيعات' };
const mgrOfFin   = { id: 'm2', role: 'manager', department: 'المالية' };
const worker     = { id: 'u1', role: 'employee', department: 'المبيعات' };
const other      = { id: 'u9', role: 'employee', department: 'المبيعات' };
const boss       = { id: 'a1', role: 'admin' };

eq('المكلَّف',            'assignee', roleFor(T(), worker));
eq('مدير قسم المهمة',     'manager',  roleFor(T(), mgrOfSales));
eq('مدير قسم آخر → لا شيء', null,     roleFor(T(), mgrOfFin));
eq('زميل غير مكلَّف → لا شيء', null,   roleFor(T(), other));
eq('الأدمن',              'admin',    roleFor(T(), boss));

/* ⚠️ المدير المكلَّف بمهمة يُعامَل مكلَّفاً عليها هو — وإلا اعتمد مهمته بنفسه */
eq('⚠️ مدير مكلَّف بمهمة في قسمه يُعامَل مكلَّفاً لا مديراً',
   'assignee', roleFor(T({ assigneeUid: 'm1' }), mgrOfSales));
eq('فلا يقدر يعتمدها بنفسه',
   false, canMove(T({ assigneeUid: 'm1', status: 'review' }),
                  roleFor(T({ assigneeUid: 'm1', status: 'review' }), mgrOfSales), 'done'));

/* ═══════════ ٣. الزرّ الواحد ═══════════ */
group('٣. الزرّ الواحد الواضح');

eq('جديدة + موظف → ابدأ التنفيذ',
   { to: 'in_progress', label: 'ابدأ التنفيذ' }, nextStepFor(T({ status: 'new' }), 'assignee'));
eq('قيد التنفيذ + موظف → أرسلها للاعتماد',
   { to: 'review', label: 'أرسلها للاعتماد' }, nextStepFor(T({ status: 'in_progress' }), 'assignee'));
eq('بانتظار الاعتماد + مدير → اعتمد',
   { to: 'done', label: 'اعتمد الإنجاز' }, nextStepFor(T({ status: 'review' }), 'manager'));
eq('منجزة + موظف → لا زرّ', null, nextStepFor(T({ status: 'done' }), 'assignee'));

/* ═══════════ ٤. الاستحقاق ═══════════ */
group('٤. عدّاد الاستحقاق');

eq('فرق الأيام', 3, daysBetweenYmd('2026-08-12', '2026-08-15'));
eq('بالسالب',   -2, daysBetweenYmd('2026-08-12', '2026-08-10'));
eq('تاريخ فاسد → null', null, daysBetweenYmd('لا شيء', '2026-08-10'));

eq('تستحق اليوم', { kind: 'today', text: 'تستحق اليوم' },
   (() => { const s = dueStateOf(T({ dueDate: TODAY }), TODAY); return { kind: s.kind, text: s.text }; })());
eq('باقي يوم',    { kind: 'soon', text: 'باقي يوم واحد' },
   (() => { const s = dueStateOf(T({ dueDate: '2026-08-13' }), TODAY); return { kind: s.kind, text: s.text }; })());
eq('متأخرة ٣ أيام', { kind: 'overdue', text: 'متأخرة 3 يوم' },
   (() => { const s = dueStateOf(T({ dueDate: '2026-08-09' }), TODAY); return { kind: s.kind, text: s.text }; })());
eq('بلا تاريخ استحقاق', 'none', dueStateOf(T(), TODAY).kind);
/* ⚠️ المنجزة لا تُعرض «متأخرة» — أُنجزت، وتذكيرها بالتأخير ضجيج لا معلومة */
eq('⚠️ المنجزة المتأخرة لا تُعرض متأخرة',
   'closed', dueStateOf(T({ status: 'done', dueDate: '2026-08-01' }), TODAY).kind);
eq('والمؤرشفة كذلك',
   'closed', dueStateOf(T({ status: 'archived', dueDate: '2026-08-01' }), TODAY).kind);

/* ═══════════ ٥. المهمة المنسيّة ═══════════

   ⚠️ أهم رقم في لوحة المدير. المتأخرة يراها أحد ويسأل عنها، والمنسية لا
   يذكرها أحد — فهي أخطر. */
group('٥. بلا حراك منذ ٧ أيام');

eq('الحدّ المعلن سبعة أيام', 7, STALE_DAYS);
eq('آخر رسالة قبل ٨ أيام → منسيّة',
   true, isStaleTask(T({ status: 'in_progress', lastMessageYmd: '2026-08-04' }), TODAY));
eq('آخر رسالة أمس → ليست منسيّة',
   false, isStaleTask(T({ status: 'in_progress', lastMessageYmd: '2026-08-11' }), TODAY));
eq('الرسالة تتقدّم على تاريخ الإنشاء',
   false, isStaleTask(T({ status: 'in_progress', createdAtYmd: '2026-07-01', lastMessageYmd: TODAY }), TODAY));
eq('بلا رسائل يُرجَع لتاريخ الإنشاء',
   true, isStaleTask(T({ status: 'in_progress', createdAtYmd: '2026-07-01' }), TODAY));
/* ⚠️ المنجزة ليست منسيّة — انتهت. عدّها يجعل الرقم بلا معنى بعد شهر. */
eq('⚠️ المنجزة لا تُحسب منسيّة',
   false, isStaleTask(T({ status: 'done', createdAtYmd: '2026-01-01' }), TODAY));

/* ═══════════ ٦. فرز اللوحة ═══════════

   ⚠️ المتأخر أولاً ثم الأولوية. المهمة العاجلة المتأخرة يجب ألا تختفي تحت
   عشرين مهمة عادية. */
group('٦. فرز اللوحة');

const mix = [
  T({ id: 'a', title: 'عادية', priority: 'normal', dueDate: '2026-08-20' }),
  T({ id: 'b', title: 'عاجلة', priority: 'urgent', dueDate: '2026-08-20' }),
  T({ id: 'c', title: 'متأخرة عادية', priority: 'normal', dueDate: '2026-08-05' }),
  T({ id: 'd', title: 'بلا استحقاق', priority: 'high' })
];
eq('المتأخر أولاً ثم العاجل', ['c', 'b', 'd', 'a'], sortTasks(mix, TODAY).map((t) => t.id));

const cols = boardColumns([
  T({ id: 'x', status: 'new' }), T({ id: 'y', status: 'review' }),
  T({ id: 'z', status: 'done' })
], TODAY);
eq('أعمدة اللوحة أربعة نشطة', ACTIVE_STATUSES, cols.map((c) => c.status));
eq('⚠️ المنجزة خارج اللوحة اليومية', 0,
   cols.reduce((a, c) => a + c.tasks.length, 0) - 2);
eq('عناوين الأعمدة بالعربية', 'بانتظار الاعتماد', STATUS_AR.review);

/* ═══════════ ٧. شريط لوحة المدير ═══════════ */
group('٧. نبض لوحة المدير');

/* ⚠️ لاحظ lastMessageYmd على الأوليَين: بدونه تُحسبان منسيّتين أيضاً، لأن
   تاريخ إنشائهما الافتراضي قبل أكثر من سبعة أيام — وهو سلوك صحيح، فالمهمة
   المتأخرة التي لم يتكلّم فيها أحد منسيّةٌ ومتأخرة معاً. */
const pulse = managerPulse([
  T({ id: '1', status: 'in_progress', dueDate: '2026-08-05', lastMessageYmd: '2026-08-11' }),
  T({ id: '2', status: 'review', lastMessageYmd: '2026-08-11' }),
  T({ id: '3', status: 'in_progress', createdAtYmd: '2026-07-01' }),       /* منسيّة */
  T({ id: '4', status: 'done', dueDate: '2026-08-01' })                    /* خارج الحساب */
], TODAY);
eq('المتأخرة',   1, pulse.overdue);
eq('بانتظاري',   1, pulse.awaitingMe);
eq('المنسيّة',    1, pulse.stale);
eq('⚠️ المنجزة خارج كل الأرقام', 3, pulse.activeTotal);

/* ═══════════ ٨. التحليلات ═══════════

   ⚠️ «الإنجاز في الوقت» على المنجزة وحدها. قسمتها على كل المهام تخلط
   «تأخّر» بـ«لم ينتهِ بعد»، فيبدو من عنده مهام جارية متعثّراً. */
group('٨. التحليلات');

const done1 = T({ id: 'd1', status: 'done', dueDate: '2026-08-10', doneAtYmd: '2026-08-09',
                  createdAtYmd: '2026-08-01', managerRating: 5 });
const done2 = T({ id: 'd2', status: 'done', dueDate: '2026-08-10', doneAtYmd: '2026-08-12',
                  createdAtYmd: '2026-08-02', managerRating: 3, reopenCount: 1 });
const live  = T({ id: 'l1', status: 'in_progress', dueDate: '2026-08-30' });

const an = taskAnalytics([done1, done2, live], TODAY);
eq('الإجمالي',            3, an.total);
eq('النشطة',              1, an.active);
eq('المنجزة',             2, an.done);
eq('الإنجاز في الوقت = ١ من ٢', 50, an.onTimePct);
eq('متوسط زمن الإنجاز',   9, an.avgDays);
eq('متوسط التقييم',       4, an.avgRating);
eq('معدّل الإعادة',        50, an.reopenRate);
eq('⚠️ الجارية لا تُحسب متأخرة قبل استحقاقها', 0, an.overdueNow);

eq('بلا مهام منجزة → لا نسبة مخترَعة',
   { onTimePct: null, avgDays: null, avgRating: null },
   (() => { const a = taskAnalytics([live], TODAY);
            return { onTimePct: a.onTimePct, avgDays: a.avgDays, avgRating: a.avgRating }; })());
eq('لا مهام إطلاقاً → أصفار بلا استثناء', 0, taskAnalytics([], TODAY).total);

/* التجميع بمفتاح */
const byDept = analyticsBy([
  T({ id: 'p', department: 'المبيعات', status: 'done', doneAtYmd: TODAY }),
  T({ id: 'q', department: 'المبيعات' }),
  T({ id: 'r', department: 'المالية' })
], TODAY, (t) => t.department);
eq('مجموعتان',                    2, byDept.length);
eq('الأكثر مهامّاً أولاً',        'المبيعات', byDept[0].key);
eq('وعدد مهامه',                  2, byDept[0].total);

/* ═══════════ ٩. القائمة الفرعية ═══════════ */
group('٩. القائمة الفرعية');
eq('نصفها منجز', 50, checklistPct(T({ checklist: [{ done: true }, { done: false }] })));
eq('كلها منجزة', 100, checklistPct(T({ checklist: [{ done: true }] })));
eq('⚠️ بلا قائمة → null لا صفر (الصفر يُقرأ «لم يبدأ»)', null, checklistPct(T()));

/* ═══════════════════════════════════════════════════════════════════════════
   المرحلة ٧ — التوسعات الثماني
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════ ١٠. المهام المتكرّرة (٧-أ) ═══════════

   ⚠️ لا خادم، فالتوليد يحدث عند فتح اللوحة. والصحّة كلها على **المعرّف
   الحتمي**: مديران يفتحان في نفس الثانية → نفس المعرّف → وثيقة واحدة. */
group('١٠. المهام المتكرّرة — المعرّف الحتمي');

const TPL = (over = {}) => ({
  id: 'w1', title: 'تقرير أسبوعي', active: true,
  recurrence: { type: 'weekly', dow: 0, dueOffsetDays: 3 }, ...over
});

eq('المعرّف يجمع القالب والفترة', 'tpl_w1_2026-W33', recurringTaskId('w1', '2026-W33'));
eq('⚠️ ونداؤه مرتين يعطي نفس المعرّف — لا ازدواج',
   recurringTaskId('w1', '2026-W33'), recurringTaskId('w1', '2026-W33'));

/* أسبوعي: الأحد (dow=0). ٢٠٢٦-٠٨-١٢ أربعاء، فآخر أحد هو ٠٩ أغسطس. */
/* ⚠️ ٢٠٢٦-٠٨-١٢ أربعاء، والنافذة تبدأ ١٣ يوليو. فالآحاد داخلها أربعة:
   ١٩ و٢٦ يوليو، و٢ و٩ أغسطس. (١٢ يوليو أحدٌ لكنه خارج النافذة بيوم.) */
const weekly = duePeriodsFor(TPL(), TODAY);
eq('يولّد آحاد النافذة الأربعة', 4, weekly.length);
eq('والاستحقاق = تاريخ الفترة + الإزاحة',
   { startDate: '2026-08-09', dueDate: '2026-08-12' },
   (() => { const x = weekly[weekly.length - 1]; return { startDate: x.startDate, dueDate: x.dueDate }; })());
/* ⚠️ الاستحقاق من تاريخ الفترة لا من تاريخ التوليد — مهمة الأحد التي
   وُلِّدت الأربعاء متأخرة فعلاً ولا تُمنح مهلة جديدة. */
eq('⚠️ أقدم فترة تُولَّد باستحقاقها القديم (١٩ يوليو + ٣)',
   '2026-07-22', weekly[0].dueDate);

eq('⚠️ ما وُلِّد سابقاً لا يُعاد', 3,
   duePeriodsFor(TPL(), TODAY, new Set([recurringTaskId('w1', isoWeekKey(new Date('2026-08-09T00:00:00')))])).length);

/* ⚠️ سقف الثلاثين يوماً: من عاد من إجازة شهرين لا يجد تسعين مهمة.
   والعدد ٣١ لا ٣٠ لأن الطرفين محسوبان: من ١٣ يوليو إلى ١٢ أغسطس ضمناً. */
eq('⚠️ التوليد الرجعي محدود بنافذة الثلاثين يوماً', 31,
   duePeriodsFor(TPL({ recurrence: { type: 'daily', dueOffsetDays: 0 } }), TODAY).length);
eq('والسقف قابل للتضييق', 8,
   duePeriodsFor(TPL({ recurrence: { type: 'daily', dueOffsetDays: 0 } }), TODAY, new Set(), 7).length);

eq('القالب المعطَّل لا يولّد شيئاً', 0, duePeriodsFor(TPL({ active: false }), TODAY).length);
eq('القالب بلا تكرار لا يولّد شيئاً',  0, duePeriodsFor(TPL({ recurrence: null }), TODAY).length);
eq('نوع تكرار مجهول لا يولّد شيئاً',   0, duePeriodsFor(TPL({ recurrence: { type: 'كل شروق' } }), TODAY).length);

/* شهري */
const monthly = duePeriodsFor(TPL({ recurrence: { type: 'monthly', dayOfMonth: 1, dueOffsetDays: 5 } }), TODAY);
eq('الشهري يولّد فترة واحدة في نافذة الثلاثين', 1, monthly.length);
eq('ومفتاحها بالسنة والشهر', '2026-08', monthly[0].periodKey);

/* مفتاح الأسبوع عبر حدود السنة */
eq('أسبوع ISO يعبر رأس السنة صحيحاً', '2026-W01', isoWeekKey(new Date('2026-01-01T00:00:00')));

/* ═══════════ ١١. ربط المهمة بالغياب (٧-ج) ═══════════ */
group('١١. المهمة يستحقّ موعدها ومسؤولها في إجازة');

const leaves = [
  { type: 'leave', status: 'approved', employeeUid: 'u1', startDate: '2026-08-10', endDate: '2026-08-18' },
  { type: 'leave', status: 'pending',  employeeUid: 'u2', startDate: '2026-08-10', endDate: '2026-08-18' },
  { type: 'permission', status: 'approved', employeeUid: 'u3', date: '2026-08-12' }
];
eq('إجازة معتمَدة تغطّي اليوم', true, !!leaveCovering(leaves, 'u1', '2026-08-12'));
eq('⚠️ والمعلَّقة لا تُحسب — لم تُعتمد بعد', null, leaveCovering(leaves, 'u2', '2026-08-12'));
eq('والاستئذان ليس إجازة', null, leaveCovering(leaves, 'u3', '2026-08-12'));
eq('خارج المدى لا يُحسب', null, leaveCovering(leaves, 'u1', '2026-08-20'));

const hits = tasksHittingLeave([
  T({ id: 'a', status: 'in_progress', assigneeUid: 'u1', dueDate: '2026-08-13' }),
  T({ id: 'b', status: 'in_progress', assigneeUid: 'u1', dueDate: '2026-08-25' }),
  T({ id: 'c', status: 'done',        assigneeUid: 'u1', dueDate: '2026-08-13' })
], leaves);
eq('مهمة واحدة تصطدم بالإجازة', 1, hits.length);
eq('وهي الصحيحة', 'a', hits[0].task.id);
eq('⚠️ والمنجزة خارج التنبيه — لا فائدة من تحذير عمّا انتهى', true,
   !hits.some((h) => h.task.id === 'c'));

/* ═══════════ ١٢. سجل الوقت الفعلي (٧-د) ═══════════ */
group('١٢. الوقت الفعلي مقابل المقدَّر');

eq('بلا مدخلات → أصفار',
   { entries: 0, actualHours: 0, pct: null },
   (() => { const s = timeSummary(T()); return { entries: s.entries, actualHours: s.actualHours, pct: s.pct }; })());

const timed = T({ estimateHours: 4, timeEntries: [{ secs: 7200 }, { secs: 3600 }] });
eq('المجموع ثلاث ساعات', 3, timeSummary(timed).actualHours);
eq('ونسبته من المقدَّر ٧٥٪',  75, timeSummary(timed).pct);
/* ⚠️ بلا تقدير لا نسبة — نسبة بلا مرجع رقم بلا معنى */
eq('⚠️ بلا تقدير → null لا صفر', null, timeSummary(T({ timeEntries: [{ secs: 3600 }] })).pct);
eq('المدخلة المفتوحة تُكتشف', true, timeSummary(T({ timeEntries: [{ start: 1, end: null }] })).hasOpenEntry);
eq('والمغلقة لا', false, timeSummary(T({ timeEntries: [{ start: 1, end: 2, secs: 60 }] })).hasOpenEntry);
eq('السقف خمسون مدخلة', 50, MAX_TIME_ENTRIES);
eq('وبلوغه يُعلَن', true,
   timeSummary(T({ timeEntries: Array.from({ length: 50 }, () => ({ secs: 1 })) })).atCap);

/* ═══════════ ١٣. الاعتماديات (٧-هـ) ═══════════

   ⚠️ إرشاد إداري لا قيد أمني — لا يمكن فرضها في قاعدة (تحتاج get() لكل
   مانع، وهي قراءة مفوترة على كل كتابة). */
group('١٣. الاعتماديات — إرشاد لا قيد');

const all = [
  T({ id: 'x', status: 'done' }),
  T({ id: 'y', status: 'in_progress' }),
  T({ id: 'z', status: 'archived' })
];
eq('المانع المنجز لا يمنع', 0, blockersOf(T({ blockedByTaskIds: ['x'] }), all).length);
eq('والمؤرشف كذلك',        0, blockersOf(T({ blockedByTaskIds: ['z'] }), all).length);
eq('والجاري يمنع',          1, blockersOf(T({ blockedByTaskIds: ['y'] }), all).length);
eq('ومعرّف لمهمة محذوفة يُتجاهَل', 0, blockersOf(T({ blockedByTaskIds: ['ghost'] }), all).length);
eq('isBlocked تلخّصها', true, isBlocked(T({ blockedByTaskIds: ['y', 'x'] }), all));
eq('بلا موانع → غير محجوبة', false, isBlocked(T(), all));
eq('السقف خمسة موانع', 5, MAX_BLOCKERS);

/* ═══════════ ١٤. التفويض أثناء الإجازة (٧-و) ═══════════ */
group('١٤. التفويض — إضافة لا استبدال');

eq('بلا تفويض → غير نشط', false, delegationActive(T(), TODAY));
eq('تفويض بلا نهاية → نشط', true, delegationActive(T({ delegatedToUid: 'u9' }), TODAY));
eq('تفويض ينتهي اليوم → ما زال نشطاً', true,
   delegationActive(T({ delegatedToUid: 'u9', delegatedUntil: TODAY }), TODAY));
/* ⚠️ delegatedUntil لا تُفرض من القاعدة — الواجهة تتجاهل المنتهي */
eq('⚠️ تفويض منتهٍ أمس → تتجاهله الواجهة', false,
   delegationActive(T({ delegatedToUid: 'u9', delegatedUntil: '2026-08-11' }), TODAY));

eq('⚠️ المكلَّف الأصلي يبقى مع المندوب لا يُستبدل',
   ['u1', 'u9'], effectiveAssignees(T({ delegatedToUid: 'u9' }), TODAY));
eq('والتفويض المنتهي لا يضيف أحداً',
   ['u1'], effectiveAssignees(T({ delegatedToUid: 'u9', delegatedUntil: '2026-01-01' }), TODAY));
eq('وتفويض لنفس الشخص لا يكرّره',
   ['u1'], effectiveAssignees(T({ delegatedToUid: 'u1' }), TODAY));

/* ═══════════ ١٥. الأقسام المشتركة (٧-ز) ═══════════ */
group('١٥. المشاركة بين قسمين');

eq('المفردة تتبع أول المصفوفة',
   { departments: ['المبيعات', 'المالية'], department: 'المبيعات' },
   (() => { const t = withDepartments(T(), ['المبيعات', 'المالية']);
            return { departments: t.departments, department: t.department }; })());
eq('المكرّر يُزال', ['المبيعات'], withDepartments(T(), ['المبيعات', 'المبيعات']).departments);
eq('والفارغ يُزال',  ['المبيعات'], withDepartments(T(), ['المبيعات', '', null]).departments);
eq('والسقف ثلاثة أقسام', 3,
   withDepartments(T(), ['أ', 'ب', 'ج', 'د']).departments.length);
eq('وقائمة فارغة تترك المفردة فارغة', '', withDepartments(T(), []).department);

/* ═══════════ ١٦. الأرشيف (٧-ح) ═══════════ */
group('١٦. الأرشفة والبحث');

eq('الحدّ ثلاثون يوماً', 30, ARCHIVE_AFTER_DAYS);
eq('منجزة قبل ٣١ يوماً → تُؤرشف', true,
   shouldArchive(T({ status: 'done', doneAtYmd: '2026-07-12' }), TODAY));
eq('منجزة أمس → لا',              false,
   shouldArchive(T({ status: 'done', doneAtYmd: '2026-08-11' }), TODAY));
eq('⚠️ والجارية لا تُؤرشف مهما طالت', false,
   shouldArchive(T({ status: 'in_progress', doneAtYmd: '2026-01-01' }), TODAY));
eq('ومنجزة بلا تاريخ إنجاز لا تُؤرشف', false,
   shouldArchive(T({ status: 'done' }), TODAY));

eq('الدفعة محدودة حتى لا تُكتب مئة وثيقة عند فتح اللوحة', 2,
   dueForArchive([
     T({ id: '1', status: 'done', doneAtYmd: '2026-01-01' }),
     T({ id: '2', status: 'done', doneAtYmd: '2026-01-02' }),
     T({ id: '3', status: 'done', doneAtYmd: '2026-01-03' })
   ], TODAY, 2).length);

const arch = [
  T({ id: 'a', title: 'تقرير المبيعات', assigneeUid: 'u1', managerRating: 5, doneAtYmd: '2026-06-01' }),
  T({ id: 'b', title: 'جرد المخزن',     assigneeUid: 'u2', managerRating: 3, doneAtYmd: '2026-07-01' })
];
eq('البحث بالعنوان',        1, searchArchive(arch, { text: 'مبيعات' }).length);
eq('والبحث بلا حساسية حالة', 1, searchArchive(arch, { text: 'المبيعات' }).length);
eq('والفلترة بالموظف',      1, searchArchive(arch, { uid: 'u2' }).length);
eq('والفلترة بالتقييم',     1, searchArchive(arch, { minRating: 4 }).length);
eq('والفلترة بالمدى',       1, searchArchive(arch, { from: '2026-06-15' }).length);
eq('وبلا فلتر يرجع الكل',   2, searchArchive(arch, {}).length);


group('١٧. ⚠️ العيب الأول — رقم واحد لنسبة الإنجاز');

/* ⚠️ كان `progress` اليدوي و checklistPct يُعرضان معاً في نفس البطاقة،
   فيتباعدان: يشطب الموظف ٤ من ٥ بنود ويترك الشريط على ٢٠٪. */
const pgChk = { status: 'in_progress', progress: 20,
  checklist: [{ done: true }, { done: true }, { done: true }, { done: true }, { done: false }] };
eq('⚠️ البنود تغلب التقدير اليدوي', 80,  progressOf(pgChk).pct);
eq('والمصدر معلَن للواجهة',        'checklist', progressOf(pgChk).source);

eq('وبلا بنود يبقى التقدير اليدوي', 45,
   progressOf({ status: 'in_progress', progress: 45 }).pct);
eq('ومصدره «يدوي»', 'manual', progressOf({ status: 'in_progress', progress: 45 }).source);

eq('بلا بنود ولا تقدير → صفر لا null', 0, progressOf({ status: 'new' }).pct);
eq('المنجزة ١٠٠٪ مهما قال الحقل', 100,
   progressOf({ status: 'done', progress: 10 }).pct);
eq('والمؤرشفة كذلك', 100, progressOf({ status: 'archived' }).pct);

/* ⚠️ الملغاة لم تُنجَز ولم تُترك ناقصة — النسبة بلا معنى فلا يُرسم شريط */
eq('⚠️ الملغاة بلا نسبة إطلاقاً', null,
   progressOf({ status: 'cancelled', progress: 60 }).pct);
eq('null لا ينهار', null, progressOf(null).pct);
/* ⚠️ قيمة خارج المدى لا تُصدَّق: القاعدة تحرسها لكن وثيقة قديمة قد تحملها */
eq('تقدير فاسد يسقط إلى صفر', 0, progressOf({ status: 'new', progress: 900 }).pct);

group('١٨. ⚠️ العيب الثاني — التوقّف اليدوي غير الحجب بالاعتماديّة');

const bDep = { id: 'b1', status: 'in_progress', blockedByTaskIds: ['x'] };
const bAll = [{ id: 'x', status: 'in_progress', title: 'مانعة' }];
const iDep = blockInfo(bDep, bAll, '2026-08-13');
eq('⚠️ مهمة تعمل ومحجوبة باعتماديّة معاً', true,  iDep.byDeps);
eq('وليست متوقّفة يدوياً',                 false, iDep.manual);

const bMan = { id: 'b2', status: 'blocked', blockReason: 'أنتظر ردّ العميل',
               createdAtYmd: '2026-08-12' };
const iMan = blockInfo(bMan, [], '2026-08-13');
eq('⚠️ متوقّفة يدوياً بلا أي اعتماديّة', true, iMan.manual);
eq('وليست محجوبة',                       false, iMan.byDeps);
eq('وسببها محفوظ', 'أنتظر ردّ العميل', iMan.reason);
eq('ولا ينقصها سبب',                     false, iMan.reasonMissing);

/* ⚠️ «متوقفة» بلا سبب يراها المدير فيطمئنّ — وهي منسيّة باسم آخر */
eq('⚠️ توقّف بلا سبب يُرفع علمه', true,
   blockInfo({ status: 'blocked', createdAtYmd: '2026-08-12' }, [], '2026-08-13').reasonMissing);
eq('وتوقّف قديم يُوسم منسيّاً', true,
   blockInfo({ status: 'blocked', blockReason: 'س', createdAtYmd: '2026-08-01' },
             [], '2026-08-13').stale);

group('١٩. ⚠️ العيب الثالث — الملغاة');

eq('«ملغاة» في قائمة الحالات', true,  STATUSES.includes('cancelled'));
eq('وليست حالةً نشِطة',        false, ACTIVE_STATUSES.includes('cancelled'));
eq('وهي مغلقة',                true,  CLOSED_STATUSES.includes('cancelled'));

/* ⚠️ الإلغاء قرار إداري: الموظف لا يخرج من مهمة ثقيلة بضغطة */
eq('⚠️ الموظف لا يلغي مهمته', false, canMove({ status: 'in_progress' }, 'assignee', 'cancelled'));
eq('ولا من «جديدة»',           false, canMove({ status: 'new' }, 'assignee', 'cancelled'));
eq('والمدير يلغي من التنفيذ',  true,  canMove({ status: 'in_progress' }, 'manager', 'cancelled'));
eq('ومن الانتظار',             true,  canMove({ status: 'review' }, 'manager', 'cancelled'));
eq('ولا يلغي منجزة',           false, canMove({ status: 'done' }, 'manager', 'cancelled'));
eq('والإلغاء يُتراجَع عنه',    true,  canMove({ status: 'cancelled' }, 'manager', 'in_progress'));
eq('والموظف لا يحيي ملغاة',    false, canMove({ status: 'cancelled' }, 'assignee', 'in_progress'));

/* ⚠️ الملغاة لا «تتأخر» — عدّها متأخرة كل يوم ينفخ رقم المتأخرات بلا عمل ناقص */
eq('⚠️ الملغاة مغلقة فلا تتأخر', 'closed',
   dueStateOf({ status: 'cancelled', dueDate: '2026-01-01' }, '2026-08-13').kind);

/* ⚠️ خارج البسط والمقام معاً: ليست إنجازاً وليست تقصيراً */
const anC = taskAnalytics([
  { status: 'done',      dueDate: '2026-08-10', doneAtYmd: '2026-08-09' },
  { status: 'cancelled', dueDate: '2026-08-01' },
  { status: 'in_progress' }
], '2026-08-13');
eq('⚠️ الملغاة لا تُحسب منجزة',        1, anC.done);
eq('ولا تدخل مقام «في الوقت»',        100, anC.onTimePct);
eq('ولا تُعدّ نشِطة',                    1, anC.active);
eq('وتُعدّ وحدها',                       1, anC.cancelled);

/* ⚠️ ظهر على المحاكي: الملغاة تُؤرشَف بعد حين (cancelled → archived انتقالٌ
   مسموح) فتفقد كلمة «ملغاة» وتدخل المنجزة صامتةً — فقالت الشاشة «أُنجزت في
   وقتها ١٠٠٪» على مهمتين إحداهما ملغاة. الطابع cancelledAt يبقى بعد
   الأرشفة، فهو المرجع لا الحالة. */
const anArch = taskAnalytics([
  { status: 'archived', doneAtYmd: '2026-08-09', dueDate: '2026-08-10' },
  { status: 'archived', cancelledAt: 'X', dueDate: '2026-08-01' }
], '2026-08-13');
eq('⚠️ ملغاة مؤرشفة لا تُحسب منجزة',  1, anArch.done);
eq('ولا ترفع نسبة الإنجاز زوراً',   100, anArch.onTimePct);
eq('وتُعدّ ملغاةً بعد أرشفتها',        1, anArch.cancelled);
eq('ولا تُعدّ متأخرة الآن',              0, anC.overdueNow);

group('٢٠. حِمل الموظفين وضغط «العاجلة»');

const wl = [
  { assigneeUid: 'a', assigneeName: 'سالم', status: 'in_progress', priority: 'urgent', dueDate: '2026-08-01' },
  { assigneeUid: 'a', assigneeName: 'سالم', status: 'review',      priority: 'normal' },
  { assigneeUid: 'b', assigneeName: 'ريم',  status: 'in_progress', priority: 'low' },
  { assigneeUid: 'c', assigneeName: 'ملغاة', status: 'cancelled',  priority: 'urgent' },
  { assigneeUid: '',  status: 'in_progress', priority: 'high' }
];
const load = workloadBy(wl, '2026-08-13');
eq('الأثقل أولاً',                'a',  load[0].uid);
eq('وعدد مهامه النشِطة',            2,  load[0].active);
eq('ومتأخّرته',                     1,  load[0].overdue);
eq('وما ينتظر اعتماده',             1,  load[0].review);
/* ⚠️ الوزن لا العدد: عاجلة متأخرة (٤+٣) + عادية (٢) = ٩ مقابل منخفضة = ١ */
eq('⚠️ الوزن يفرّق العاجل المتأخر', 9,  load[0].load);
eq('ريم أخفّ',                      1,  load[1].load);
/* ⚠️ الملغاة والمهمة بلا مكلَّف خارج الحساب */
eq('⚠️ الملغاة لا تُحمَّل على أحد',  2,  load.length);

const up = urgentPressure([
  { status: 'in_progress', priority: 'urgent' }, { status: 'new', priority: 'urgent' },
  { status: 'review', priority: 'urgent' },      { status: 'blocked', priority: 'urgent' },
  { status: 'done', priority: 'urgent' },        { status: 'cancelled', priority: 'urgent' }
]);
eq('العاجلة النشِطة وحدها تُعدّ', 4, up.count);
eq('وتجاوزت الحدّ',            true, up.over);
eq('والحدّ الافتراضي ثلاثة', 3, URGENT_SOFT_CAP);
eq('وتحت الحدّ لا ضغط', false,
   urgentPressure([{ status: 'new', priority: 'urgent' }]).over);

group('٢١. لوحة المدير — الأرقام الستة من مصفوفة واحدة');

const pl = managerPulse([
  { status: 'in_progress', dueDate: '2026-08-01' },              /* متأخرة */
  { status: 'in_progress', dueDate: '2026-08-13' },              /* اليوم */
  { status: 'review' },
  { status: 'blocked', blockReason: 'س' },
  { status: 'in_progress', createdAtYmd: '2026-07-20' },         /* منسيّة */
  { status: 'done' }, { status: 'cancelled' }
], '2026-08-13');
eq('المتأخرة',            1, pl.overdue);
eq('المستحقّة اليوم',      1, pl.dueToday);
eq('بانتظار الاعتماد',     1, pl.awaitingMe);
eq('المتوقّفة',            1, pl.blocked);
eq('⚠️ المنسيّة — أهمّها', 1, pl.stale);
/* ⚠️ المغلقة والملغاة خارج «النشِط» */
eq('والنشِط لا يشمل المغلقة', 5, pl.activeTotal);


group('٢٢. ⚠️ سجل النشاط — مشتقّ لا مخزَّن');

/* ⚠️⚠️ لماذا مشتقّ: «يُسجَّل تلقائياً» تعني كوداً على الخادم ولا خادم عندنا،
   وأي حدث يكتبه متصفّح الموظف يستطيع تزويره — يكتب «المدير اعتمد المهمة»
   وهو لم يعتمد. فالسجل يُركَّب من طوابع لا يكتبها إلا صاحب الصلاحية. */
const tlTask = {
  title: 'تقرير', createdAtYmd: '2026-08-01', createdByName: 'نورة',
  assigneeName: 'سالم', startedAtYmd: '2026-08-03',
  reviewAtYmd: '2026-08-06', doneAtYmd: '2026-08-08',
  status: 'done', reopenCount: 1, managerRating: 4, employeeFeedback: 'تم التقرير'
};
const tlMsgs = [
  { id: 'm1', ymd: '2026-08-04', authorName: 'سالم', text: 'بدأت', kind: 'msg', authorUid: 'u1' },
  { id: 'm2', ymd: '2026-08-07', authorName: 'نورة', text: 'ملاحظة', kind: 'msg', authorUid: 'u2' }
];
const tl = buildTimeline(tlTask, tlMsgs);
eq('الأقدم أولاً',            '2026-08-01', tl[0].ymd);
eq('وأوّله الإنشاء',            'created',    tl[0].kind);
eq('ويحمل من أنشأ',            'نورة',       tl[0].actor);
eq('ومن كُلِّف بها في نصّه',    true, tl[0].text.includes('سالم'));
eq('والأحدث آخراً',            '2026-08-08', tl[tl.length - 1].ymd);

const kinds = tl.map((x) => x.kind);
eq('البدء مشتقّ من startedAt',   true, kinds.includes('started'));
eq('والإرسال للاعتماد',          true, kinds.includes('review'));
eq('والاعتماد',                  true, kinds.includes('done'));
eq('والإعادة للتحسين',           true, kinds.includes('reopened'));
eq('والتعليقات في نفس الخيط',    2,    kinds.filter((k) => k === 'message').length);
/* ⚠️ لا حدث بلا تاريخ: تاريخٌ مخترَع أسوأ من حدث غائب */
eq('⚠️ لا يُضاف حدث بلا تاريخ',  0,    tl.filter((x) => !x.ymd).length);

/* ⚠️ العدّاد يقول «كم مرّة» ولا يقول «متى» — سطر بعدده لا أسطر بتواريخ مخترَعة */
eq('الإعادة سطر واحد بعددها', 1, tl.filter((x) => x.kind === 'reopened').length);
eq('وعددها في نصّه',           true,
   tl.find((x) => x.kind === 'reopened').text.includes('مرة'));

/* ⚠️ حدثان في يوم واحد لا يتبادلان مكانيهما بين إعادتَي رسم */
const sameDay = buildTimeline({ createdAtYmd: '2026-08-01', startedAtYmd: '2026-08-01',
  doneAtYmd: '2026-08-01', status: 'done' }, []);
eq('⚠️ ترتيب ثابت داخل اليوم', ['created', 'started', 'done'], sameDay.map((x) => x.kind));

eq('null لا ينهار',        0, buildTimeline(null).length);
eq('وبلا رسائل يعمل',      true, buildTimeline(tlTask).length > 0);
eq('ومهمة فارغة لا تنهار', 0, buildTimeline({}).length);

/* ⚠️ التوقّف الحالي وحده يظهر — الحقل يُستبدل فتاريخ ما قبله ضاع */
const blk = buildTimeline({ createdAtYmd: '2026-08-01', status: 'blocked',
  blockedAtYmd: '2026-08-05', blockReason: 'أنتظر العميل' }, []);
eq('التوقّف يظهر بسببه', true,
   blk.find((x) => x.kind === 'blocked').text.includes('أنتظر العميل'));
eq('وبلا سبب يُقال ذلك', true,
   buildTimeline({ createdAtYmd: '2026-08-01', status: 'blocked', blockedAtYmd: '2026-08-05' }, [])
     .find((x) => x.kind === 'blocked').text.includes('بلا سبب'));

/* ⚠️ ثلاثة مرشِّحات على نفس البيانات — صفر قراءة إضافية */
eq('مرشِّح المحادثة',  2, filterTimeline(tl, 'chat').length);
eq('ومرشِّح النشاط',  tl.length - 2, filterTimeline(tl, 'events').length);
eq('و«الكل» لا يحذف', tl.length, filterTimeline(tl, 'all').length);
eq('ووضع مجهول يرجع الكل', tl.length, filterTimeline(tl, 'xx').length);
eq('null لا ينهار', 0, filterTimeline(null, 'chat').length);

eq('لكل حدث نصّ عربي', true, !!EVENT_AR.created && !!EVENT_AR.cancelled);


group('٢٣. لوحة السحب — الإسقاط لا يتجاوز آلة الحالات');

/* ⚠️ السحب طريقٌ ثانٍ إلى نفس allowedMoves لا بابٌ خلفيّ. لو مرّ إسقاطٌ
   تمنعه الأزرار، صار الموظف يعتمد مهمته بجرّها — وهو ما تمنعه خطوة
   «بانتظار الاعتماد» التي يقوم عليها قسم التحليلات كله. */
const D = (status, who, to) => dropAllowed({ status }, who, to);

eq('الموظف يبدأ التنفيذ بالسحب',      true,  D('new', 'assignee', 'in_progress').ok);
eq('ويرسلها للاعتماد',                 true,  D('in_progress', 'assignee', 'review').ok);
/* ⚠️ الحارس الأهم في الملف كله */
eq('⚠️ الموظف لا يُسقطها في «منجزة»', false, D('review', 'assignee', 'done').ok);
eq('ويُقال له لماذا لا «ممنوع» وحدها', 'notYours', D('review', 'assignee', 'done').reason);
eq('⚠️ ولا يسحبها من الاعتماد',        false, D('review', 'assignee', 'in_progress').ok);
eq('⚠️ ولا يلغيها',                    false, D('in_progress', 'assignee', 'cancelled').ok);
eq('والمدير يعتمد',                    true,  D('review', 'manager', 'done').ok);

/* ⚠️ الإسقاط في العمود نفسه ليس رفضاً — لا رسالة ولا كتابة */
eq('⚠️ الإسقاط في مكانه لا يفعل شيئاً', 'same', D('new', 'manager', 'new').reason);
eq('ولا يُعدّ مسموحاً',                  false, D('new', 'manager', 'new').ok);

/* ⚠️ ثلاثة انتقالات تفتح نافذة ولا تُكتب مباشرةً: قيمةٌ تُكتب بلا سببها
   تُفقد معناها — متوقفة بلا سبب، ومعتمَدة بلا تقييم. */
eq('التوقّف يطلب سبباً قبل الكتابة',  'reason',  D('in_progress', 'manager', 'blocked').needs);
eq('والاعتماد يطلب تقييماً',           'approve', D('review', 'manager', 'done').needs);
eq('والإعادة تطلب ملاحظة',             'improve', D('review', 'manager', 'in_progress').needs);
eq('والبدء لا يطلب شيئاً',             null,      D('new', 'manager', 'in_progress').needs);

eq('مهمة معدومة لا تنهار', false, dropAllowed(null, 'manager', 'done').ok);
eq('وحالة معدومة كذلك',    false, dropAllowed({ status: 'new' }, 'manager', '').ok);

group('٢٤. أعمدة اللوحة');

/* ⚠️ «منجزة» عمودٌ ولا تدخل ACTIVE_STATUSES: تلك تُستعمل في
   `where('status','in',…)` وكل زيادة فيها تُثقل قراءة اللوحة اليومية. */
eq('خمسة أعمدة على اللوحة', 5, BOARD_STATUSES.length);
eq('⚠️ و«منجزة» فيها',      true,  BOARD_STATUSES.includes('done'));
eq('⚠️ وليست في النشِطة',    false, ACTIVE_STATUSES.includes('done'));
eq('و«متوقفة» عمودٌ لا وسم', true,  BOARD_STATUSES.includes('blocked'));
eq('والملغاة ليست عموداً',   false, BOARD_STATUSES.includes('cancelled'));

const bcols = boardColumns([
  { id: '1', status: 'new', title: 'أ' },
  { id: '2', status: 'done', title: 'ب' },
  { id: '3', status: 'blocked', title: 'ج' }
], '2026-08-13', BOARD_STATUSES);
eq('عمودٌ لكل حالة ولو فارغاً', 5, bcols.length);
eq('والمنجزة تجد عمودها', 1, bcols.find((c) => c.status === 'done').tasks.length);
eq('والافتراضي يبقى النشِطة وحدها', 4, boardColumns([], '2026-08-13').length);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
