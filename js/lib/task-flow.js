/* ═══════════════════════════════════════════════════════════════════════════
   نظام المهام — دورة الحياة والصلاحيات والتحليلات

   ⚠️ نقيّة تماماً: لا firebase ولا شبكة ولا DOM. كل ما يقرّر «من يقدر ينقل
   المهمة إلى أين» و«ما حالتها» يعيش هنا ويُختبر في node. الكتابة الفعلية في
   js/lib/tasks.js، والعرض في js/pages/.

   ⚠️ وكل ما هنا **يخفي أزراراً فقط**. الحارس الحقيقي قواعد match /tasks في
   firestore.rules. أي شرط هنا بلا نظير هناك هو وعد بلا سند.
   ═══════════════════════════════════════════════════════════════════════════ */

export const STATUSES = ['new', 'in_progress', 'blocked', 'review', 'done',
                        'cancelled', 'archived'];

export const STATUS_AR = {
  new:         'جديدة',
  in_progress: 'قيد التنفيذ',
  blocked:     'متوقفة',
  review:      'بانتظار الاعتماد',
  done:        'منجزة',
  cancelled:   'ملغاة',
  archived:    'مؤرشفة'
};

/* ═══ الحالات المغلقة ═══
   ⚠️ `cancelled` أُضيفت لأن المهمة التي يُقرَّر ألّا تُنفَّذ لم يكن لها مخرج:
   إمّا تُعتمَد `done` كذباً فتدخل «الإنجاز في الوقت»، أو تبقى مفتوحة للأبد
   فتُحسب متأخرة كل يوم. الاثنان يشوّهان كل رقم في التحليلات.

   ⚠️ وهي **ليست إنجازاً وليست نشِطة**: تُطرح من بسط «المنجزة» ومن مقامها معاً.
   إدخالها في المقام يعاقب من أُلغيت مهمته بقرار مديره. */
export const CLOSED_STATUSES = ['done', 'cancelled', 'archived'];

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
  cancelled:   [],            /* الإلغاء قرار إداري — لا يلغي أحدٌ مهمته */
  archived:    []
};

/* ⚠️ الإلغاء للمدير وحده وفي كل حالة نشِطة. ولو مُنح للموظف لصار مخرجاً من
   أي مهمة ثقيلة بضغطة، وسقط معنى التكليف. */
const MANAGER_MOVES = {
  new:         ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['blocked', 'review', 'done', 'cancelled'],
  blocked:     ['in_progress', 'cancelled'],
  review:      ['done', 'in_progress', 'cancelled'],  /* اعتماد، أو إعادة «يحتاج تحسين» */
  done:        ['archived', 'in_progress'],
  cancelled:   ['in_progress', 'archived'],           /* الإلغاء يُتراجَع عنه — والأرشفة تُنهيه */
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
  /* ⚠️ الملغاة مغلقة كالمنجزة: مهمةٌ أُلغيت لا «تتأخر» بعد إلغائها، وعدّها
     متأخرةً كل يوم يجعل رقم المتأخرات ينمو بلا عملٍ ناقص وراءه. */
  if (CLOSED_STATUSES.includes(task.status))
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

/* ═══ أعمدة اللوحة ═══

   ⚠️ «منجزة» عمودٌ على اللوحة وليست حالةً نشِطة: المدير يحتاج أن يرى ما
   اعتُمد هذا الأسبوع بجوار ما ينتظره، وإخفاؤه يجعل اللوحة تقول إن لا شيء
   أُنجز. لكنها تُجلب باستعلامها المستقلّ ولا تدخل ACTIVE_STATUSES — تلك
   تُستعمل في `where('status','in',…)` وأي زيادة فيها تُثقل كل قراءة.

   ⚠️ و«متوقفة» عمودٌ لا وسم: المهمة المتوقّفة تحتاج أن تُرى مجموعةً في
   مكان واحد ليُسأل عن كلٍّ منها ما ينتظر. */
export const BOARD_STATUSES = ['new', 'in_progress', 'blocked', 'review', 'done'];

export function boardColumns(tasks, todayYmd, statuses = ACTIVE_STATUSES) {
  const sorted = sortTasks(tasks, todayYmd);
  return statuses.map((s) => ({
    status: s, label: STATUS_AR[s],
    tasks: sorted.filter((t) => t.status === s)
  }));
}

/* ═══ هل يُقبل إسقاط بطاقة في هذا العمود؟ ═══
   → { ok, reason, needs }

   ⚠️ السحب لا يتجاوز آلة الحالات: هو طريقٌ ثانٍ إلى **نفس** allowedMoves
   التي تحكم الأزرار. طريقٌ يتجاوزها يجعل الموظف يعتمد مهمته بجرّها.

   ⚠️ و`needs` تقول للواجهة أن الانتقال يحتاج مدخلاً قبل تنفيذه — لا
   يُكتب بلا سببه: التوقّف بلا سبب مهمةٌ منسيّة، والاعتماد بلا تقييم يُفقد
   التحليلات مادّتها. الإسقاط يفتح النافذة ولا يكتب مباشرةً. */
export function dropAllowed(task, who, toStatus) {
  if (!task || !toStatus) return { ok: false, reason: 'none', needs: null };
  if (task.status === toStatus) return { ok: false, reason: 'same', needs: null };
  if (!canMove(task, who, toStatus)) {
    return { ok: false, needs: null,
      reason: who === 'assignee' ? 'notYours' : 'blocked' };
  }
  const needs = toStatus === 'blocked' ? 'reason'
              : (toStatus === 'done' && task.status === 'review') ? 'approve'
              : (toStatus === 'in_progress' && task.status === 'review') ? 'improve'
              : null;
  return { ok: true, reason: 'ok', needs };
}

/* ═══ شريط لوحة المدير ═══

   ⚠️ كله مشتقّ من **المصفوفة المحمَّلة أصلاً** لـ tasksForDept — صفر قراءة
   إضافية من Firestore. الأرقام التي تحتاج استعلاماً ثانياً لا تستحقّه: لوحة
   المدير تُفتح عشرات المرّات يومياً، والحصّة المجانية ٥٠ ألف قراءة.

   ⚠️ و`stale` ليست زينة — هي أهم رقم في اللوحة. المتأخرة يراها أحد ويسأل
   عنها، والمنسيّة لا يذكرها أحد. */
export function managerPulse(tasks, todayYmd) {
  const active = (tasks || []).filter((t) => ACTIVE_STATUSES.includes(t.status));
  return {
    overdue:      active.filter((t) => dueStateOf(t, todayYmd).kind === 'overdue').length,
    dueToday:     active.filter((t) => dueStateOf(t, todayYmd).kind === 'today').length,
    awaitingMe:   active.filter((t) => t.status === 'review').length,
    stale:        active.filter((t) => isStaleTask(t, todayYmd)).length,
    blocked:      active.filter((t) => t.status === 'blocked').length,
    activeTotal:  active.length
  };
}

/* ═══ حِمل الموظفين ═══
   → [{ uid, name, active, overdue, dueToday, review, load }] الأثقل أولاً

   ⚠️ `load` ليس عدد المهام: مهمة عاجلة متأخرة ليست كمهمة عادية مستحقّة بعد
   شهر. الوزن = الأولوية + غرامة التأخّر. رقمٌ نسبيّ للترتيب وحده — لا يُعرض
   للموظف ولا يدخل تقييمه، وإلا صار هدفاً يُدار بدل أن يكون قياساً.

   ⚠️ ويُحسب على المكلَّف الأصلي: التفويض إضافة لا استبدال، فلا يُنقل الحِمل. */
const LOAD_WEIGHT = { urgent: 4, high: 3, normal: 2, low: 1 };

export function workloadBy(tasks, todayYmd) {
  const map = new Map();
  (tasks || []).filter((t) => ACTIVE_STATUSES.includes(t.status)).forEach((t) => {
    const uid = t.assigneeUid || '';
    if (!uid) return;
    if (!map.has(uid)) map.set(uid, {
      uid, name: t.assigneeName || '', active: 0, overdue: 0, dueToday: 0, review: 0, load: 0
    });
    const row = map.get(uid);
    const due = dueStateOf(t, todayYmd);
    row.active++;
    if (due.kind === 'overdue') row.overdue++;
    if (due.kind === 'today')   row.dueToday++;
    if (t.status === 'review')  row.review++;
    row.load += (LOAD_WEIGHT[t.priority] ?? 2) + (due.kind === 'overdue' ? 3 : 0);
  });
  return [...map.values()].sort((a, b) => b.load - a.load || b.active - a.active);
}

/* ═══ حدّ «عاجلة» الناعم ═══

   ⚠️ تنبيه لا منع — ولا يمكن أن يكون منعاً: فرضه في قاعدة يحتاج عدّ مهام
   القسم داخل القاعدة، وFirestore لا يقدر على استعلام داخل شرط (نفس علّة
   «٣ طلبات تصحيح في الدورة»).

   ولماذا أصلاً: حين يصير كل شيء عاجلاً لا يبقى شيء عاجل، ويفقد الفرز معناه
   لأن نصف اللوحة في المرتبة الأولى. */
export const URGENT_SOFT_CAP = 3;

export function urgentPressure(tasks, cap = URGENT_SOFT_CAP) {
  const urgent = (tasks || []).filter((t) =>
    ACTIVE_STATUSES.includes(t.status) && t.priority === 'urgent');
  return { count: urgent.length, cap, over: urgent.length > cap, tasks: urgent };
}

/* ═══ التحليلات ═══

   ⚠️ لا تُحوَّل هذه الأرقام إلى «تقييم نهائي» رقم واحد يظهر للموظف. تُعرض
   مكوّناتها مفصّلة. الرقم المركّب يبدو موضوعياً وهو ليس كذلك، والناس تُحسّن
   الرقم لا العمل.

   ⚠️ و«الإنجاز في الوقت» يُحسب على المنجزة وحدها: قسمة المنجزة في وقتها على
   كل المهام تخلط «تأخّر» بـ«لم ينتهِ بعد»، فيبدو من عنده مهام جارية متعثّراً. */
export function taskAnalytics(tasks, todayYmd) {
  const all = tasks || [];
  /* ⚠️ الملغاة خارج البسط والمقام معاً: ليست إنجازاً فلا تُحسب منجزةً،
     وليست تقصيراً فلا تُحسب في مقام «الإنجاز في الوقت». إدخالها في المقام
     يعاقب موظفاً أُلغيت مهمته بقرار مديره.

     ⚠️ و`cancelledAt` لا `status` وحدها: الملغاة تُؤرشَف بعد حين
     (cancelled → archived انتقالٌ مسموح)، فتفقد كلمة «ملغاة» من حالتها
     وتدخل «المنجزة» صامتةً. ظهر هذا على المحاكي: مهمتان مؤرشفتان إحداهما
     ملغاة، والشاشة تقول «أُنجزت في وقتها ١٠٠٪». الطابع يبقى بعد الأرشفة
     فهو المرجع. */
  const wasCancelled = (t) => t.status === 'cancelled' || !!t.cancelledAt;
  const done = all.filter((t) => (t.status === 'done' || t.status === 'archived')
                              && !wasCancelled(t));
  const cancelled = all.filter(wasCancelled).length;
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
    cancelled,
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

/* نسبة إنجاز القائمة الفرعية وحدها — لا تُعرض مباشرةً، انظر progressOf */
export function checklistPct(task) {
  const list = (task && task.checklist) || [];
  if (!list.length) return null;
  return Math.round((list.filter((c) => c.done).length / list.length) * 100);
}

/* ═══ نسبة الإنجاز — مصدر واحد ═══

   ⚠️ كان هناك رقمان لنفس الشيء يُعرضان في نفس البطاقة: `progress` يكتبه
   الموظف بيده، و`checklistPct` محسوبة من البنود. يتباعدان حتماً — يشطب
   الموظف ٤ من ٥ بنود ويترك الشريط على ٢٠٪، فيقرأ مديره رقمين متناقضين عن
   نفس المهمة. وهو نقضٌ حرفي لقاعدة المشروع «حسبة واحدة في مكان واحد».

   القاعدة الآن: **البنود تحكم متى وُجدت.** رقمٌ مشتقّ من فعلٍ ملموس أصدق
   من رقم يقدّره صاحبه عن نفسه. وحين لا بنود يبقى التقدير اليدوي — وهو خير
   من لا شيء.

   ⚠️ والمغلقة ١٠٠٪ دائماً عدا الملغاة: الملغاة لم تُنجَز ولم تُترك ناقصة،
   فنسبتها بلا معنى — تُرجع null ولا يُرسم لها شريط.

   → عدد 0..100، أو null حين لا معنى للنسبة
   → source: 'checklist' | 'manual' | 'status' — تشرح للواجهة من أين جاء */
export function progressOf(task) {
  if (!task) return { pct: null, source: 'none' };
  if (task.status === 'cancelled') return { pct: null, source: 'status' };
  if (task.status === 'done' || task.status === 'archived')
    return { pct: 100, source: 'status' };

  const chk = checklistPct(task);
  if (chk !== null) return { pct: chk, source: 'checklist' };

  const manual = Number(task.progress);
  if (Number.isFinite(manual) && manual >= 0 && manual <= 100)
    return { pct: Math.round(manual), source: 'manual' };
  return { pct: 0, source: 'manual' };
}

/* ═══ الحجب بالاعتماديّة — وسمٌ لا حالة ═══

   ⚠️ كان `blocked` يحمل معنيين لا علاقة بينهما في الكود: **حالة** يضعها
   الموظف («أنتظر ردّ عميل») و**حقل** `blockedByTaskIds` («تنتظر مهمة
   أخرى»). فمهمة `in_progress` قد تكون محجوبة باعتماديّة، ومهمة `blocked`
   بلا أي مانع مسجَّل — والمدير يقرأ الكلمة نفسها في الحالين ويفهم شيئين.

   الفصل الآن: الحالة للتوقّف الإنساني وله **سبب مكتوب**، والاعتماديّة وسمٌ
   يُعرض بجانب أي حالة كانت.

   ⚠️ `blocked` بلا سبب مهمةٌ منسيّة باسم آخر — لذلك `blockReason` مطلوب. */
export function blockInfo(task, allTasks, todayYmd) {
  const deps = blockersOf(task, allTasks);
  const manual = task && task.status === 'blocked';
  return {
    byDeps: deps.length > 0,
    deps,
    manual,
    reason: (task && task.blockReason) || '',
    /* ⚠️ توقّفٌ بلا سبب مكتوب ومضى عليه أسبوع = منسيّة، لا متوقّفة */
    reasonMissing: manual && !(task && task.blockReason),
    stale: manual && isStaleTask(task, todayYmd)
  };
}

export const MAX_BLOCK_REASON = 300;

/* ═══════════════════════════════════════════════════════════════════════════
   المرحلة ٧ — التوسعات الثماني

   ⚠️ قرار المالك (٢٠٢٦-٠٨-١٢) ألغى شرط «انتظر أسبوعين قبل التوسعات». الثمن
   المقبول صراحةً: هذه البنود مُصمَّمة على تخمين لا على شكوى حقيقية. لذلك
   بُنيت كلها هنا كدوال نقيّة مستقلة، وأرجحها للتغيير — ٧-د و٧-هـ — لا يعتمد
   عليهما شيء آخر، فحذفهما يكلّف حذف دالة وشاشة.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══ ٧-أ · المهام المتكرّرة ═══

   ⚠️ لا خادم عندنا، فالتوليد يحدث حين يفتح أحدهم اللوحة. والمفتاح كله هو
   **المعرّف الحتمي**: مديران يفتحان اللوحة في نفس الثانية يكتبان نفس
   المعرّف، فتنتج وثيقة واحدة لا اثنتان. لا قفل ولا معاملة ولا علامة
   lastGenerated قابلة للتباعد بين جهازين. */
export const MAX_BACKFILL_DAYS = 30;

const p2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/* رقم الأسبوع ISO — المفتاح الأسبوعي لازم يكون ثابتاً عبر السنة */
export function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  /* الخميس يحدّد السنة التي ينتمي لها الأسبوع في ISO */
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t - yStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${p2(week)}`;
}

/* المعرّف الحتمي لنسخة قالب في فترة بعينها */
export const recurringTaskId = (templateId, periodKey) => `tpl_${templateId}_${periodKey}`;

/* ═══ الفترات المستحقّة غير المولَّدة ═══

   → [{ id, periodKey, dueDate, startDate }]

   ⚠️ التوليد بأثر رجعي محدود بثلاثين يوماً. بدونه يفتح من عاد من إجازة
   شهرين فيجد تسعين مهمة دفعة واحدة — فيتجاهلها كلها، وهو أسوأ من ألا
   تُولَّد أصلاً.

   ⚠️ وتاريخ الاستحقاق يُحسب من **تاريخ الفترة** لا من تاريخ التوليد: مهمة
   الأحد التي وُلِّدت الأربعاء تظهر متأخرة لأنها متأخرة فعلاً، ولا تُمنح
   مهلة جديدة لأن أحداً لم يفتح النظام. */
export function duePeriodsFor(template, todayYmd, existingIds = new Set(),
                              maxBackfillDays = MAX_BACKFILL_DAYS) {
  if (!template || template.active === false) return [];
  const rec = template.recurrence;
  if (!rec || !['daily', 'weekly', 'monthly'].includes(rec.type)) return [];

  const today = new Date(todayYmd + 'T00:00:00');
  if (isNaN(today)) return [];
  const from = new Date(today);
  from.setDate(from.getDate() - maxBackfillDays);

  const out = [];
  for (let d = new Date(from); d <= today; d.setDate(d.getDate() + 1)) {
    let key = null;
    if (rec.type === 'daily') key = ymdOf(d);
    else if (rec.type === 'weekly') {
      if (d.getDay() !== (rec.dow ?? 0)) continue;
      key = isoWeekKey(d);
    } else {
      if (d.getDate() !== (rec.dayOfMonth || 1)) continue;
      key = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
    }
    const id = recurringTaskId(template.id, key);
    if (existingIds.has(id)) continue;
    if (out.some((x) => x.id === id)) continue;

    const due = new Date(d);
    due.setDate(due.getDate() + (Number(rec.dueOffsetDays ?? template.dueOffsetDays) || 0));
    out.push({ id, periodKey: key, startDate: ymdOf(d), dueDate: ymdOf(due) });
  }
  return out;
}

/* ═══ ٧-ج · ربط المهمة بالغياب ═══

   ⚠️ أهم بند في المرحلة كلها — وهو ما يجعل المهام جزءاً من نظام الموارد
   البشرية بدل أداة منفصلة. لا تُسقطه إن ضاق الوقت، أسقط غيره.

   ⚠️ ويقرأ `requests` المعتمَدة كما هي — لا يعيد حساب مدى الإجازة. حسبة
   ثانية للتواريخ تتباعد عن الأولى فيظهر موظف «في إجازة» في شاشة و«حاضر»
   في أخرى. */
export function leaveCovering(requests, uid, ymd) {
  if (!uid || !ymd) return null;
  return (requests || []).find((r) =>
    r.type === 'leave' && r.status === 'approved' && r.employeeUid === uid &&
    r.startDate <= ymd && r.endDate >= ymd) || null;
}

/* المهام التي يستحقّ موعدها بينما مسؤولها في إجازة معتمَدة */
export function tasksHittingLeave(tasks, requests) {
  return (tasks || [])
    .filter((t) => ACTIVE_STATUSES.includes(t.status) && t.dueDate)
    .map((t) => ({ task: t, leave: leaveCovering(requests, t.assigneeUid, t.dueDate) }))
    .filter((x) => x.leave);
}

/* ═══ ٧-د · سجل الوقت الفعلي ═══

   ⚠️ يُعرض للمدير والموظف معاً، ولا يدخل تقييم أحد. تحويل دقّة التقدير إلى
   درجة يجعل الناس تضخّم تقديراتها، فتفقد الرقم ومهارة التقدير معاً. */
export const MAX_TIME_ENTRIES = 50;

export function timeSummary(task) {
  const entries = (task && task.timeEntries) || [];
  const secs = entries.reduce((a, e) => a + (Number(e.secs) || 0), 0);
  const estSecs = (Number(task && task.estimateHours) || 0) * 3600;
  const open = entries.find((e) => e.start && !e.end) || null;
  return {
    entries: entries.length,
    actualSecs: secs,
    actualHours: Math.round((secs / 3600) * 10) / 10,
    estimateHours: Number(task && task.estimateHours) || 0,
    /* null حين لا تقدير — النسبة بلا مرجع رقمٌ بلا معنى */
    pct: estSecs > 0 ? Math.round((secs / estSecs) * 100) : null,
    hasOpenEntry: !!open,
    atCap: entries.length >= MAX_TIME_ENTRIES
  };
}

/* ═══ ٧-هـ · الاعتماديات ═══

   ⚠️⚠️ **لا تُفرض في firestore.rules ولا يمكن**: التحقق يحتاج get() لكل
   مهمة مانعة، وهي قراءة مفوترة على كل كتابة. فهي **إرشاد إداري لا قيد
   أمني** — من يتجاوزها لا يتضرّر أحد مالياً. مكتوب هنا صراحةً حتى لا يظنّها
   قارئ لاحق ضماناً. */
export const MAX_BLOCKERS = 5;

export function blockersOf(task, allTasks) {
  const ids = (task && task.blockedByTaskIds) || [];
  if (!ids.length) return [];
  const byId = new Map((allTasks || []).map((t) => [t.id, t]));
  return ids.map((id) => byId.get(id)).filter(Boolean)
    .filter((t) => t.status !== 'done' && t.status !== 'archived');
}

export function isBlocked(task, allTasks) {
  return blockersOf(task, allTasks).length > 0;
}

/* ═══ ٧-و · تفويض المهام أثناء الإجازة ═══

   ⚠️ التفويض **إضافة لا استبدال**: المكلَّف الأصلي يبقى ظاهراً ويبقى يقرأ،
   وسجل «من نفّذ فعلاً» يبقى صحيحاً في التحليلات.

   ⚠️ و`delegatedUntil` لا تُفرض من القاعدة — لا مؤقّت على السيرفر. الواجهة
   تتجاهل التفويض المنتهي، والمدير يلغيه يدوياً. */
export function delegationActive(task, todayYmd) {
  if (!task || !task.delegatedToUid) return false;
  if (!task.delegatedUntil) return true;
  return task.delegatedUntil >= todayYmd;
}

export function effectiveAssignees(task, todayYmd) {
  const list = [task.assigneeUid].filter(Boolean);
  if (delegationActive(task, todayYmd) && !list.includes(task.delegatedToUid))
    list.push(task.delegatedToUid);
  return list;
}

/* ═══ ٧-ز · الرؤية المشتركة بين قسمين ═══
   ⚠️ المصفوفة موجودة من اليوم الأول (قرار ٥-ز)، فهذا واجهة فقط.
   و`department` المفردة تبقى القسم المالك = departments[0]، وهي المستعملة
   في التحليلات حتى لا تُحسب المهمة مرتين. */
export const MAX_DEPARTMENTS = 3;

export function withDepartments(task, depts) {
  const clean = [...new Set((depts || []).filter(Boolean))].slice(0, MAX_DEPARTMENTS);
  return { ...task, departments: clean, department: clean[0] || '' };
}

/* ═══ ٧-ح · الأرشيف ═══

   ⚠️ لا تُحذف المهام المؤرشفة أبداً. هي مادة التحليلات التاريخية، وحذفها
   يعني فقدان القدرة على المقارنة بين الدورات. */
export const ARCHIVE_AFTER_DAYS = 30;

export function shouldArchive(task, todayYmd, afterDays = ARCHIVE_AFTER_DAYS) {
  if (!task || task.status !== 'done' || !task.doneAtYmd) return false;
  const d = daysBetweenYmd(task.doneAtYmd, todayYmd);
  return d !== null && d >= afterDays;
}

export function dueForArchive(tasks, todayYmd, limit = 20) {
  return (tasks || []).filter((t) => shouldArchive(t, todayYmd)).slice(0, limit);
}

/* بحث الأرشيف — بالعنوان والموظف والتقييم */
export function searchArchive(tasks, { text = '', uid = '', minRating = 0, from = '', to = '' } = {}) {
  const q = text.trim().toLowerCase();
  return (tasks || []).filter((t) => {
    if (q && !(t.title || '').toLowerCase().includes(q)
           && !(t.description || '').toLowerCase().includes(q)) return false;
    if (uid && t.assigneeUid !== uid) return false;
    if (minRating && !(Number(t.managerRating) >= minRating)) return false;
    if (from && (t.doneAtYmd || '') < from) return false;
    if (to && (t.doneAtYmd || '') > to) return false;
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   سجل نشاط المهمة — الدفعة ٢

   ⚠️⚠️ **لماذا مشتقّ لا مخزَّن.** «يُسجَّل تلقائياً» تعني كوداً على الخادم،
   ولا خادم عندنا. وأي حدث يُكتب من متصفّح الموظف يستطيع الموظف تزويره: يكتب
   «المدير اعتمد المهمة» وهو لم يعتمد. **سجل نشاط قابل للتزوير أسوأ من
   غيابه** — لأنه يُقرأ كدليل ويُبنى عليه قرار.

   فالسجل هنا **يُركَّب في الذاكرة** من طوابع لا يكتبها إلا صاحب الصلاحية
   والقاعدة تحرسها: createdAt · startedAt · doneAt · cancelledAt ·
   archivedAt · reopenCount · delegatedBy · رسائل المحادثة · مدخلات الوقت.

   النتيجة: **تسعة أحداث بصفر قراءة إضافية وصفر كتابة وصفر إمكانية تزوير.**

   ⚠️ ولا يُخزَّن شيء: كل ما يظهر هنا موجود أصلاً في وثيقة المهمة. تخزين
   نسخة ثانية منه يعني مصدرين للحقيقة يتباعدان — وهي نفس علّة النسبة
   المزدوجة التي أُصلحت في الدفعة ١.

   ⚠️ الطوابع تصل نصوص 'YYYY-MM-DD' من normalizeTask، والوقت الدقيق يبقى في
   الحقل الأصلي. الترتيب بالتاريخ ثم بترتيب ثابت داخل اليوم — حدثان في يوم
   واحد بلا وقت دقيق يجب ألّا يتبادلا مكانيهما بين إعادتَي رسم.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ترتيب الحدث داخل اليوم الواحد حين تتساوى التواريخ — يتبع منطق دورة الحياة */
const EVENT_RANK = {
  created: 0, delegated: 1, started: 2, blocked: 3, unblocked: 4,
  time: 5, message: 6, review: 7, reopened: 8, cancelled: 9, done: 10, archived: 11
};

export const EVENT_AR = {
  created:   'أُنشئت المهمة',
  started:   'بدأ التنفيذ',
  blocked:   'أُوقفت مؤقتاً',
  review:    'أُرسلت للاعتماد',
  reopened:  'أُعيدت للتحسين',
  done:      'اعتُمد الإنجاز',
  cancelled: 'أُلغيت',
  archived:  'أُرشفت',
  delegated: 'فُوِّضت',
  message:   'تعليق',
  time:      'سجّل وقتاً'
};

/* ═══ بناء السجل ═══
   → [{ kind, ymd, actor, text, meta }] الأقدم أولاً

   ⚠️ `messages` اختيارية: صفحة المهمة تشترك عليها لحظياً وتمرّرها، واللوحة
   لا تقرؤها إطلاقاً — فالسجل يعمل بدونها ناقصاً التعليقات، ولا يفرض قراءة. */
export function buildTimeline(task, messages = []) {
  if (!task) return [];
  const out = [];
  const add = (kind, ymd, actor, text, meta) => {
    if (!ymd) return;
    out.push({ kind, ymd, actor: actor || '', text: text || EVENT_AR[kind] || '', meta: meta || null });
  };

  add('created', task.createdAtYmd, task.createdByName,
      task.assigneeName ? `أُنشئت وكُلِّف بها ${task.assigneeName}` : 'أُنشئت بلا مكلَّف');

  if (task.delegatedToUid && task.delegatedAtYmd)
    add('delegated', task.delegatedAtYmd, task.delegatedByName,
        `فُوِّضت إلى ${task.delegatedToName || ''}${task.delegatedUntil ? ` حتى ${task.delegatedUntil}` : ''}`);

  add('started', task.startedAtYmd, task.assigneeName);

  /* ⚠️ التوقّف الحالي وحده يظهر: الحقل يُستبدل عند كل توقّف، فتاريخ ما قبله
     ضاع. وقد كتبتُ الأثر الكامل في أحداث الطبقة ٢ لا هنا — لا أدّعي سجلاً
     لا أملك بياناته. */
  if (task.status === 'blocked')
    add('blocked', task.blockedAtYmd || task.startedAtYmd, task.assigneeName,
        task.blockReason ? `أُوقفت: ${task.blockReason}` : 'أُوقفت مؤقتاً بلا سبب مكتوب');

  /* ⚠️ لا يُشتقّ «أُرسلت للاعتماد» من وجود doneAt وحده: المهمة مرّت
     بالاعتماد قطعاً، لكن **متى** غير معروف — والتاريخ المخترَع (البداية)
     يضع الحدث قبل أسبوع من وقته الحقيقي. حدثٌ غائب أصدق من حدثٍ مؤرَّخ
     بالتخمين. الوثائق التي كُتبت قبل حقل reviewAt تفقد هذا السطر وحده. */
  if (task.reviewAtYmd) add('review', task.reviewAtYmd, task.assigneeName,
    task.employeeFeedback ? `أُرسلت للاعتماد: ${task.employeeFeedback.slice(0, 120)}` : null);
  else if (task.status === 'review') add('review', task.startedAtYmd, task.assigneeName,
    task.employeeFeedback ? `أُرسلت للاعتماد: ${task.employeeFeedback.slice(0, 120)}` : null);

  /* ⚠️ العدّاد يقول «كم مرّة» ولا يقول «متى». فيُعرض سطراً واحداً بعدده لا
     أسطراً بتواريخ مخترَعة. */
  if (task.reopenCount > 0)
    add('reopened', task.doneAtYmd || task.startedAtYmd, '',
        `أُعيدت للتحسين ${task.reopenCount === 1 ? 'مرة' : `${task.reopenCount} مرات`}` +
        (task.managerNote ? ` — ${task.managerNote.slice(0, 120)}` : ''));

  add('cancelled', task.cancelledAtYmd, '', task.cancelReason ? `أُلغيت: ${task.cancelReason}` : null);
  add('done', task.doneAtYmd, '', task.managerRating ? `اعتُمد الإنجاز · تقييم ${task.managerRating}/5` : null);
  add('archived', task.archivedAtYmd, '');

  (messages || []).forEach((m) => {
    add(m.kind === 'event' ? (m.event || 'message') : 'message',
        m.ymd || null, m.authorName, m.text, { id: m.id, raw: m });
  });

  return out.sort((a, b) =>
    (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0) ||
    ((EVENT_RANK[a.kind] ?? 99) - (EVENT_RANK[b.kind] ?? 99)));
}

/* تصفية السجل — نفس الوثائق، ثلاثة مرشِّحات، صفر قراءة إضافية */
export function filterTimeline(items, mode) {
  if (mode === 'chat')   return (items || []).filter((x) => x.kind === 'message');
  if (mode === 'events') return (items || []).filter((x) => x.kind !== 'message');
  return items || [];
}
