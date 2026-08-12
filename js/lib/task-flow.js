/* ═══════════════════════════════════════════════════════════════════════════
   نظام المهام — دورة الحياة والصلاحيات والتحليلات

   ⚠️ نقيّة تماماً: لا firebase ولا شبكة ولا DOM. كل ما يقرّر «من يقدر ينقل
   المهمة إلى أين» و«ما حالتها» يعيش هنا ويُختبر في node. الكتابة الفعلية في
   js/lib/tasks.js، والعرض في js/pages/.

   ⚠️ وكل ما هنا **يخفي أزراراً فقط**. الحارس الحقيقي قواعد match /tasks في
   firestore.rules. أي شرط هنا بلا نظير هناك هو وعد بلا سند.
   ═══════════════════════════════════════════════════════════════════════════ */

export const STATUSES = ['new', 'in_progress', 'blocked', 'review', 'done', 'archived'];

export const STATUS_AR = {
  new:         'جديدة',
  in_progress: 'قيد التنفيذ',
  blocked:     'متوقفة',
  review:      'بانتظار الاعتماد',
  done:        'منجزة',
  archived:    'مؤرشفة'
};

export const PRIORITY_AR = { low: 'منخفضة', normal: 'عادية', high: 'مرتفعة', urgent: 'عاجلة' };
export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

/* الحالات النشطة — لوحة العمل اليومي لا تقرأ غيرها.
   ⚠️ تُستعمل صراحةً في الاستعلام (`in`) بدل `!=` على archived: القائمة
   الصريحة أرخص وأسرع، و`!=` تحتاج فهرساً إضافياً وتقرأ الأرشيف ثم تطرحه. */
export const ACTIVE_STATUSES = ['new', 'in_progress', 'blocked', 'review'];

/* ═══ الانتقالات المسموحة ═══

   ⚠️ القرار المقصود: الموظف **لا يضع مهمته `done` بنفسه** — يضعها `review`
   والمدير يعتمدها. بلا هذه الخطوة تصير «نسبة الإنجاز» رقماً يكتبه الموظف عن
   نفسه، ويفقد قسم التحليلات قيمته كله.

   المفتاح: الحالة الحالية. القيمة: ما يقدر كلٌّ أن ينقلها إليه. */
const EMPLOYEE_MOVES = {
  new:         ['in_progress'],
  in_progress: ['blocked', 'review'],
  blocked:     ['in_progress'],
  review:      [],            /* بيد المدير الآن — لا يسحبها الموظف */
  done:        [],
  archived:    []
};

const MANAGER_MOVES = {
  new:         ['in_progress', 'blocked'],
  in_progress: ['blocked', 'review', 'done'],
  blocked:     ['in_progress'],
  review:      ['done', 'in_progress'],   /* اعتماد، أو إعادة «يحتاج تحسين» */
  done:        ['archived', 'in_progress'],
  archived:    []
};

/* who: 'assignee' | 'manager' | 'admin' */
export function allowedMoves(task, who) {
  if (!task || !task.status) return [];
  if (who === 'assignee') return EMPLOYEE_MOVES[task.status] || [];
  if (who === 'manager' || who === 'admin') return MANAGER_MOVES[task.status] || [];
  return [];
}

export const canMove = (task, who, to) => allowedMoves(task, who).includes(to);

/* دور المستخدم تجاه مهمة بعينها.
   ⚠️ الترتيب مقصود: الأدمن أولاً، ثم المكلَّف، ثم المدير. الموظف المكلَّف
   الذي هو أيضاً مدير القسم يُعامَل مكلَّفاً على مهمته هو — وإلا اعتمد
   مهمته بنفسه، وهو بالضبط ما تمنعه خطوة review. */
export function roleFor(task, me) {
  if (!task || !me) return null;
  if (me.role === 'admin') return 'admin';
  if (task.assigneeUid === me.id) return 'assignee';
  if (me.role === 'manager' && me.department
      && (task.departments || []).includes(me.department)) return 'manager';
  return null;
}

/* الزرّ الواحد الواضح الذي ينقل الحالة للأمام */
export function nextStepFor(task, who) {
  const moves = allowedMoves(task, who);
  if (!moves.length) return null;
  const preferred = who === 'assignee'
    ? ['in_progress', 'review']
    : ['done', 'in_progress'];
  const to = preferred.find((s) => moves.includes(s)) || moves[0];
  const label = who === 'assignee'
    ? (to === 'in_progress' ? 'ابدأ التنفيذ' : 'أرسلها للاعتماد')
    : (to === 'done' ? 'اعتمد الإنجاز' : 'أعدها للتنفيذ');
  return { to, label };
}

/* ═══ الاستحقاق ═══
   ⚠️ التواريخ نصوص 'YYYY-MM-DD' وتُقارَن نصّياً. المقارنة بكائنات Date
   تُدخل المنطقة الزمنية في حساب لا علاقة له بها. */
export function dueStateOf(task, todayYmd) {
  if (!task || !task.dueDate) return { kind: 'none', days: null, text: '' };
  if (task.status === 'done' || task.status === 'archived')
    return { kind: 'closed', days: null, text: '' };

  const days = daysBetweenYmd(todayYmd, task.dueDate);
  if (days === null) return { kind: 'none', days: null, text: '' };
  if (days < 0)  return { kind: 'overdue', days: -days, text: `متأخرة ${-days} يوم` };
  if (days === 0) return { kind: 'today', days: 0, text: 'تستحق اليوم' };
  if (days === 1) return { kind: 'soon', days: 1, text: 'باقي يوم واحد' };
  if (days <= 3) return { kind: 'soon', days, text: `باقي ${days} أيام` };
  return { kind: 'later', days, text: `باقي ${days} يوماً` };
}

export function daysBetweenYmd(fromYmd, toYmd) {
  const a = new Date(fromYmd + 'T00:00:00'), b = new Date(toYmd + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ═══ المهمة المنسيّة ═══
   ⚠️ «بلا حراك منذ ٧ أيام» أهم رقم في لوحة المدير. المهمة المنسية أخطر من
   المتأخرة: المتأخرة يراها أحد ويسأل عنها، والمنسية لا يذكرها أحد.
   المرجع آخر رسالة، وإلا آخر بداية، وإلا الإنشاء. */
export const STALE_DAYS = 7;

export function lastActivityYmd(task) {
  return task.lastMessageYmd || task.startedAtYmd || task.createdAtYmd || null;
}

export function isStaleTask(task, todayYmd, limit = STALE_DAYS) {
  if (!task || !ACTIVE_STATUSES.includes(task.status)) return false;
  const last = lastActivityYmd(task);
  if (!last) return false;
  const d = daysBetweenYmd(last, todayYmd);
  return d !== null && d >= limit;
}

/* ═══ فرز اللوحة ═══
   المتأخر أولاً، ثم الأولوية، ثم الأقرب استحقاقاً. المهمة العاجلة المتأخرة
   يجب ألا تختفي تحت عشرين مهمة عادية. */
export function sortTasks(tasks, todayYmd) {
  return [...(tasks || [])].sort((a, b) => {
    const da = dueStateOf(a, todayYmd), db = dueStateOf(b, todayYmd);
    const oa = da.kind === 'overdue' ? 0 : 1, ob = db.kind === 'overdue' ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const pa = PRIORITY_ORDER[a.priority] ?? 2, pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return (a.title || '').localeCompare(b.title || '');
  });
}

/* توزيع المهام على أعمدة اللوحة */
export function boardColumns(tasks, todayYmd) {
  const sorted = sortTasks(tasks, todayYmd);
  return ACTIVE_STATUSES.map((s) => ({
    status: s, label: STATUS_AR[s],
    tasks: sorted.filter((t) => t.status === s)
  }));
}

/* شريط لوحة المدير — الأرقام الثلاثة التي يفتح الشاشة من أجلها */
export function managerPulse(tasks, todayYmd) {
  const active = (tasks || []).filter((t) => ACTIVE_STATUSES.includes(t.status));
  return {
    overdue:      active.filter((t) => dueStateOf(t, todayYmd).kind === 'overdue').length,
    awaitingMe:   active.filter((t) => t.status === 'review').length,
    stale:        active.filter((t) => isStaleTask(t, todayYmd)).length,
    activeTotal:  active.length
  };
}

/* ═══ التحليلات ═══

   ⚠️ لا تُحوَّل هذه الأرقام إلى «تقييم نهائي» رقم واحد يظهر للموظف. تُعرض
   مكوّناتها مفصّلة. الرقم المركّب يبدو موضوعياً وهو ليس كذلك، والناس تُحسّن
   الرقم لا العمل.

   ⚠️ و«الإنجاز في الوقت» يُحسب على المنجزة وحدها: قسمة المنجزة في وقتها على
   كل المهام تخلط «تأخّر» بـ«لم ينتهِ بعد»، فيبدو من عنده مهام جارية متعثّراً. */
export function taskAnalytics(tasks, todayYmd) {
  const all = tasks || [];
  const done = all.filter((t) => t.status === 'done' || t.status === 'archived');
  const onTime = done.filter((t) => !t.dueDate || !t.doneAtYmd
                                 || daysBetweenYmd(t.doneAtYmd, t.dueDate) >= 0);
  const rated = done.filter((t) => typeof t.managerRating === 'number' && t.managerRating > 0);
  const durations = done
    .map((t) => (t.createdAtYmd && t.doneAtYmd) ? daysBetweenYmd(t.createdAtYmd, t.doneAtYmd) : null)
    .filter((n) => n !== null && n >= 0);

  const reopened = all.reduce((a, t) => a + (t.reopenCount || 0), 0);

  return {
    total: all.length,
    active: all.filter((t) => ACTIVE_STATUSES.includes(t.status)).length,
    done: done.length,
    overdueNow: all.filter((t) => dueStateOf(t, todayYmd).kind === 'overdue').length,
    onTimePct: done.length ? Math.round((onTime.length / done.length) * 100) : null,
    avgDays: durations.length
      ? Math.round((durations.reduce((a, n) => a + n, 0) / durations.length) * 10) / 10 : null,
    avgRating: rated.length
      ? Math.round((rated.reduce((a, t) => a + t.managerRating, 0) / rated.length) * 10) / 10 : null,
    reopenRate: done.length ? Math.round((reopened / done.length) * 100) : null,
    staleNow: all.filter((t) => isStaleTask(t, todayYmd)).length
  };
}

/* التحليلات مجمّعة بمفتاح — القسم أو الموظف */
export function analyticsBy(tasks, todayYmd, keyFn) {
  const groups = new Map();
  (tasks || []).forEach((t) => {
    const k = keyFn(t);
    if (!k) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  });
  return [...groups.entries()]
    .map(([key, list]) => ({ key, ...taskAnalytics(list, todayYmd) }))
    .sort((a, b) => b.total - a.total);
}

/* نسبة إنجاز القائمة الفرعية — تُعرض بجوار progress لا بدلاً منه */
export function checklistPct(task) {
  const list = (task && task.checklist) || [];
  if (!list.length) return null;
  return Math.round((list.filter((c) => c.done).length / list.length) * 100);
}
