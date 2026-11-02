/* ═══════════════════════════════════════════════════════════════════════════
   القائمة الشخصية — todo.js

   ⚠️ هذه القائمة **لا يراها أحد غير صاحبها**، والحارس الحقيقي قاعدة
   `match /users/{uid}/private/todos` في firestore.rules — تُختبر في
   rules.test.mjs. ما هنا منطق عرض وتحرير فقط.

   ⚠️ التواريخ ثابتة. تاريخ «اليوم» يجعل المجموعة تنجح اليوم وتفشل بعد شهر.
   ═══════════════════════════════════════════════════════════════════════════ */

import { normalizeItem, normalizeList, addItem, toggleItem, removeItem,
         prunable, pruneDone, dueReminders, todayView,
         todoColumns, bucketOf, dueForBucket, setDue, TODO_BUCKETS, WEEK_DAYS,
         loadMyDaySources, MAX_ITEMS, MAX_TEXT, MAX_OPEN,
         PRUNE_AFTER_DAYS } from '../js/lib/todo.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const TODAY = '2026-08-13';

group('٠. اكتمال مصادر «قائمتي»');

let adminTaskReads = 0;
const adminSources = await loadMyDaySources({
  role: 'admin',
  uid: 'admin-1',
  readTodos: async () => [{ id: 'p1', text: 'خاص' }],
  readTasks: async () => { adminTaskReads++; throw new Error('لا يجب استدعاؤه'); }
});
eq('الأدمن يتخطّى مصدر المهام بلا خطأ',
   { reads: 0, items: 1, tasks: 0 },
   { reads: adminTaskReads, items: adminSources.items.length, tasks: adminSources.tasks.length });

for (const role of ['employee', 'manager']) {
  let outcome = 'resolved';
  try {
    await loadMyDaySources({
      role,
      uid: role + '-1',
      readTodos: async () => [{ id: 'pinned', ref: 'task-1' }],
      readTasks: async () => { throw new Error('task-source-failed'); }
    });
  } catch (e) {
    outcome = e.message;
  }
  eq(`${role}: فشل مصدر المهام لا ينتج []`, 'task-source-failed', outcome);
}

let classifiedPinned = false;
try {
  const loaded = await loadMyDaySources({
    role: 'employee',
    uid: 'employee-1',
    readTodos: async () => [{ id: 'pinned', ref: 'task-1' }],
    readTasks: async () => { throw new Error('task-source-failed'); }
  });
  todayView(loaded.items, new Map(loaded.tasks.map((task) => [task.id, task])), TODAY);
  classifiedPinned = true;
} catch (e) { /* المسار الصحيح: تعرض الصفحة خطأ المصدر وتتوقف قبل التصنيف */ }
eq('فشل المصدر لا يصنّف المهمة المثبّتة كأنها خرجت من النشط', false, classifiedPinned);

group('١. التطبيع — كل غياب له سلوك افتراضي');

eq('نصّ وحده يكفي', 'اتصل بالعميل',
   normalizeItem({ text: 'اتصل بالعميل' }).text);
eq('والمسافات تُقصّ', 'اتصل', normalizeItem({ text: '  اتصل  ' }).text);
/* ⚠️ لا حقل إلزامي جديد: عنصر بلا موعد عنصرٌ صالح تماماً */
eq('بلا موعد صالح',    '',  normalizeItem({ text: 'س' }).due);
eq('وبلا تذكير صالح',  '',  normalizeItem({ text: 'س' }).remindAt);
eq('وبلا مرجع شخصي',   '',  normalizeItem({ text: 'س' }).ref);
eq('وغير منجز افتراضاً', false, normalizeItem({ text: 'س' }).done);

/* ⚠️ عنصر بلا نصّ ولا مرجع لا معنى له — يُسقَط لا يُخزَّن فارغاً */
eq('⚠️ بلا نصّ ولا مرجع يُسقَط', null, normalizeItem({ due: TODAY }));
eq('والفارغ يُسقَط',              null, normalizeItem({ text: '   ' }));
eq('وnull يُسقَط',                null, normalizeItem(null));
eq('ونصّ لا كائن يُسقَط',          null, normalizeItem('اتصل'));
/* ⚠️ عنصر بمرجع بلا نصّ صالح — هذه مهمة نظام، عنوانها من المهمة لا منه */
eq('⚠️ مرجع بلا نصّ صالح', 'tk1', normalizeItem({ ref: 'tk1' }).ref);

eq(`النصّ مسقوف بـ${MAX_TEXT}`, MAX_TEXT,
   normalizeItem({ text: 'س'.repeat(MAX_TEXT + 50) }).text.length);
eq('وتاريخ فاسد يُهمَل', '', normalizeItem({ text: 'س', due: '13-08-2026' }).due);
eq('ورقم يُهمَل',        '', normalizeItem({ text: 'س', due: 20260813 }).due);

eq(`القائمة مسقوفة بـ${MAX_ITEMS}`, MAX_ITEMS,
   normalizeList(Array.from({ length: MAX_ITEMS + 20 }, (_, i) => ({ text: 'س' + i }))).length);
eq('وnull لا ينهار', 0, normalizeList(null).length);
eq('ونصّ لا ينهار',  0, normalizeList('س').length);

group('٢. الإضافة');

const r1 = addItem([], { text: 'راجع العقد' }, 'a1');
eq('يُضاف',            1, r1.items.length);
eq('بلا خطأ',         '', r1.error);
eq('ويحمل معرّفه', 'a1', r1.items[0].id);

/* ⚠️ تُرجع مصفوفة جديدة ولا تعدّل الأصل: الشاشة تعرض القديمة حتى تنجح
   الكتابة، فلا تظهر إضافةٌ سقطت في الشبكة كأنها حُفظت. */
const base = [];
addItem(base, { text: 'س' }, 'x');
eq('⚠️ الأصل لا يُعدَّل', 0, base.length);

eq('بلا نصّ يُرفض برسالة', 'اكتب نصّ التذكير', addItem([], { text: '  ' }, 'a').error);

/* ⚠️ نفس المهمة مرّتين في اليوم بلا معنى */
const withRef = addItem([], { ref: 'tk1' }, 'a1').items;
eq('⚠️ نفس المهمة لا تُضاف مرّتين', 'هذه المهمة في قائمتك بالفعل',
   addItem(withRef, { ref: 'tk1' }, 'a2').error);
/* ⚠️ لكن بعد إنجازها يجوز إعادتها — سياق جديد */
const refDone = withRef.map((x) => ({ ...x, done: true }));
eq('وبعد إنجازها تُقبل', '', addItem(refDone, { ref: 'tk1' }, 'a3').error);

/* ⚠️ السقف على المفتوح لا الكلّ: من عنده تسعون منجزاً لا يُمنع من إضافة
   واحد، وإلا صار التنظيف شرطاً للاستعمال. */
const manyOpen = Array.from({ length: MAX_OPEN }, (_, i) => ({ id: 'o' + i, text: 'س' + i }));
eq(`⚠️ يُرفض عند ${MAX_OPEN} مفتوحاً`, true,
   addItem(manyOpen, { text: 'جديد' }, 'n').error.includes(String(MAX_OPEN)));
const manyDone = Array.from({ length: MAX_OPEN }, (_, i) => ({ id: 'd' + i, text: 'س' + i, done: true }));
eq('⚠️ والمنجز الكثير لا يمنع الإضافة', '', addItem(manyDone, { text: 'جديد' }, 'n').error);

group('٣. الشطب والحذف');

const two = [{ id: 'a', text: 'أ' }, { id: 'b', text: 'ب' }];
eq('الشطب يقلب الحالة', true,  toggleItem(two, 'a', TODAY)[0].done);
eq('ويسجّل تاريخه',   TODAY, toggleItem(two, 'a', TODAY)[0].doneAt);
eq('ولا يمسّ غيره',   false, toggleItem(two, 'a', TODAY)[1].done);
/* ⚠️ إلغاء الشطب يمحو التاريخ — وإلا حُذف العنصر لاحقاً بتاريخ إنجاز قديم */
const flipped = toggleItem(toggleItem(two, 'a', TODAY), 'a', TODAY);
eq('⚠️ وإلغاء الشطب يمحو تاريخه', '', flipped[0].doneAt);
eq('ومعرّف مجهول لا ينهار', 2, toggleItem(two, 'zz', TODAY).length);
eq('الحذف يُنقص واحداً',    1, removeItem(two, 'a').length);
eq('ومعرّف مجهول لا يحذف',  2, removeItem(two, 'zz').length);

group('٤. تنظيف المنجز القديم');

const mixed = [
  { id: 'old',  text: 'قديم',  done: true,  doneAt: '2026-07-20' },
  { id: 'new',  text: 'حديث',  done: true,  doneAt: '2026-08-12' },
  { id: 'open', text: 'مفتوح', done: false }
];
eq(`القديم بعد ${PRUNE_AFTER_DAYS} يوماً`, ['old'], prunable(mixed, TODAY).map((x) => x.id));
eq('والحديث يبقى',   ['new', 'open'], pruneDone(mixed, TODAY).map((x) => x.id));
/* ⚠️ المفتوح لا يُحذف مهما قدُم — لم يُنجَز بعد */
eq('⚠️ المفتوح لا يُحذف أبداً', true,
   pruneDone([{ id: 'x', text: 'س', done: false, doneAt: '2020-01-01' }], TODAY).length === 1);
eq('ومنجز بلا تاريخ لا يُحذف', 1,
   pruneDone([{ id: 'x', text: 'س', done: true }], TODAY).length);

group('٥. التذكيرات');

const rem = [
  { id: 'a', text: 'فات',   remindAt: '2026-08-10' },
  { id: 'b', text: 'اليوم', remindAt: TODAY },
  { id: 'c', text: 'لاحقاً', remindAt: '2026-08-20' },
  { id: 'd', text: 'منجز',  remindAt: '2026-08-01', done: true }
];
/* ⚠️ الفائت يظهر: من فتح النظام بعد يومين يجب أن يرى ما فاته لا أن يُطوى */
eq('⚠️ الفائت والمستحقّ اليوم', ['a', 'b'], dueReminders(rem, TODAY).map((x) => x.id));
eq('والأقدم أولاً',              'a',       dueReminders(rem, TODAY)[0].id);
eq('والمنجز لا يُذكِّر',          false,     dueReminders(rem, TODAY).some((x) => x.id === 'd'));
eq('وبلا تذكير لا شيء',           0,        dueReminders([{ id: 'x', text: 'س' }], TODAY).length);

group('٦. قائمة اليوم');

const tasksById = new Map([
  ['tk1', { id: 'tk1', title: 'مهمة حيّة', status: 'in_progress' }]
]);
const dayItems = [
  { id: '1', ref: 'tk1' },
  { id: '2', ref: 'tk-gone' },
  { id: '3', text: 'شخصي بموعد', due: '2026-08-14' },
  { id: '4', text: 'شخصي بلا موعد' },
  { id: '5', text: 'فات موعده',  due: '2026-08-01' },
  { id: '6', text: 'منجز', done: true, doneAt: '2026-08-12' }
];
const v = todayView(dayItems, tasksById, TODAY);
eq('مهام النظام مفصولة',   2, v.tasks.length);
eq('والشخصية مفصولة',      3, v.personal.length);
eq('والمنجز مفصول',        1, v.done.length);

/* ⚠️ المرجع يُحَلّ من المصفوفة المحمَّلة — لا نسخة، فأي تعديل يظهر فوراً */
eq('⚠️ المهمة تُحَلّ من مرجعها', 'مهمة حيّة',
   v.tasks.find((x) => x.item.id === '1').task.title);
/* ⚠️ التي خرجت من النشِط تُرجَع null ولا تُحذف: الاختفاء الصامت يجعل
   الموظف يظنّ أنه فقد شيئاً */
eq('⚠️ والمهمة الغائبة null لا محذوفة', null,
   v.tasks.find((x) => x.item.id === '2').task);

/* ⚠️ ما بلا موعد في الآخر لا الأول: ليس عاجلاً، ووضعه فوق المؤرَّخ يدفن
   ما له وقت */
eq('⚠️ الأقرب موعداً أولاً', ['5', '3', '4'], v.personal.map((x) => x.id));

eq('الفائت يُعدّ',      1, v.overdue);
eq('والمستحقّ اليوم',   0, v.dueToday);
eq('ومستحقّ اليوم يُعدّ', 1,
   todayView([{ id: 'x', text: 'س', due: TODAY }], new Map(), TODAY).dueToday);

eq('null لا ينهار',        0, todayView(null, null, TODAY).personal.length);
eq('وخريطة ناقصة لا تنهار', null,
   todayView([{ id: '1', ref: 'zz' }], null, TODAY).tasks[0].task);


group('٧. أعمدة القائمة — بالموعد لا بالحالة');

/* ⚠️ القائمة الشخصية بلا آلة حالات: عنصرها منجزٌ أو غير منجز. فأعمدة
   «جديدة ← قيد التنفيذ» عليها اختراعُ مراحل لا وجود لها. العمود هنا
   الموعد — وهو السؤال الوحيد الذي يطرحه صاحب القائمة. */
eq('خمسة أعمدة', 5, TODO_BUCKETS.length);
eq('و«فات موعدها» لا يقبل إسقاطاً', false,
   TODO_BUCKETS.find((b) => b.key === 'overdue').accepts);
eq('وبقيّتها تقبل', 4, TODO_BUCKETS.filter((b) => b.accepts).length);

eq('بلا موعد → بلا موعد', 'none',    bucketOf({ text: 'س' }, TODAY));
eq('أمس → فات موعدها',   'overdue', bucketOf({ due: '2026-08-12' }, TODAY));
eq('اليوم → اليوم',       'today',   bucketOf({ due: TODAY }, TODAY));
eq('غداً → هذا الأسبوع',  'week',    bucketOf({ due: '2026-08-14' }, TODAY));
/* ⚠️ ستة أيام قادمة لا «حتى الخميس»: أسبوعٌ ينتهي بيوم ثابت يفرغ العمود
   يوم الأربعاء ويملؤه يوم السبت بلا أن يتغيّر شيء. */
eq(`وآخر يوم في الأسبوع (+${WEEK_DAYS})`, 'week', bucketOf({ due: '2026-08-19' }, TODAY));
eq('واليوم الذي يليه → لاحقاً',            'later', bucketOf({ due: '2026-08-20' }, TODAY));

const cols = todoColumns([
  { id: '1', text: 'فات',   due: '2026-08-01' },
  { id: '2', text: 'اليوم', due: TODAY },
  { id: '3', text: 'قريب',  due: '2026-08-16' },
  { id: '4', text: 'بعيد',  due: '2026-09-30' },
  { id: '5', text: 'بلا' },
  { id: '6', text: 'منجز',  due: TODAY, done: true }
], TODAY);
eq('كل عمود ببنده', [1, 1, 1, 1, 1], cols.map((c) => c.items.length));
/* ⚠️ المنجز خارج الأعمدة كلها: لوحةٌ فيها عمود «منجز» تجعل الشطب رحلةَ سحب */
eq('⚠️ والمنجز خارجها كلها', 0,
   cols.reduce((a, c) => a + c.items.filter((x) => x.done).length, 0));

/* ── ما يصير إليه الموعد عند الإسقاط ── */
eq('الإسقاط في «اليوم» يجعله لليوم', TODAY, dueForBucket('today', TODAY));
eq('و«بلا موعد» يمسحه',              '',    dueForBucket('none', TODAY));
eq('و«هذا الأسبوع» آخر الأسبوع', '2026-08-19', dueForBucket('week', TODAY));
eq('و«لاحقاً» بعده',              '2026-08-20', dueForBucket('later', TODAY));
/* ⚠️ null لا نصّ فارغ: الفارغ يمسح الموعد، وnull تعني «لا تفعل شيئاً».
   الخلط بينهما يجعل الإسقاط على «فات موعدها» يمسح موعد البند. */
eq('⚠️ و«فات موعدها» يُرجع null لا فراغاً', null, dueForBucket('overdue', TODAY));
eq('وعمودٌ مجهول كذلك',                     null, dueForBucket('xx', TODAY));

eq('setDue يغيّر موعد بنده وحده', ['2026-09-01', ''],
   setDue([{ id: 'a', text: 'أ' }, { id: 'b', text: 'ب' }], 'a', '2026-09-01')
     .map((x) => x.due));
eq('ومعرّف مجهول لا يغيّر شيئاً', 2, setDue([{ id: 'a', text: 'أ' }, { id: 'b', text: 'ب' }], 'z', TODAY).length);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
