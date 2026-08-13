/* ═══════════════════════════════════════════════════════════════════════════
   قائمة الموظف الشخصية — منطق نقيّ

   ⚠️ **To-Do ليس Task.** المهمة جزء من النظام الإداري: تُسنَد ويُعتمد إنجازها
   وتدخل التقارير. وهذه قائمة يرتّب بها الموظف يومه لنفسه — لا يراها مديره،
   ولا تدخل تقريراً، ولا تمسّ تقييمه. أي ميزة تخالف هذا تُلغي سبب وجودها:
   قائمةٌ يقرؤها غيرك تتوقّف عن كونها لك، فتتوقّف عن الاستعمال.

   ⚠️ وثيقة واحدة بمصفوفة لا مجموعة: تُقرأ في **كل فتحة للصفحة الرئيسية**،
   فقراءةٌ واحدة أرخص من خمس عشرة على الخطة المجانية. الثمن أن كل تعديل يعيد
   كتابة المصفوفة — مقبولٌ في قائمة لا يملكها إلا شخص واحد.

   ⚠️ ولا نسخ للمهام: عنصرُ مهمةٍ يحمل `ref` (معرّفها) ولا يحمل عنوانها ولا
   حالتها. النسخة تتباعد عن أصلها خلال يوم — يغيّر المدير الموعد فتبقى النسخة
   على القديم، فيخطّط الموظف ليومه على معلومة كاذبة. الحلّ عند العرض من
   المصفوفة المحمَّلة أصلاً لـ«مهامي» — صفر قراءة إضافية.

   ⚠️ نقيّة تماماً: لا firebase ولا DOM. الكتابة في todo-io.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_ITEMS = 100;
export const MAX_TEXT  = 200;

/* ⚠️ سقف المفتوح لا الكلّ: من عنده تسعون منجزاً لا يُمنع من إضافة واحد جديد،
   وإلا صار التنظيف شرطاً للاستعمال. */
export const MAX_OPEN = 60;

/* ═══ التطبيع ═══
   ⚠️ كل حقل غائب له سلوك افتراضي مطابق للأبسط: عنصر بلا موعد عنصرٌ صالح،
   وبلا `ref` عنصرٌ شخصي. لا حقل إلزامي جديد. */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim().slice(0, MAX_TEXT);
  const ref  = raw.ref ? String(raw.ref).slice(0, 64) : '';
  if (!text && !ref) return null;         /* عنصر بلا نصّ ولا مرجع لا معنى له */
  return {
    id:   String(raw.id || '').slice(0, 40),
    text,
    ref,                                   /* معرّف مهمة — لا نسخة منها */
    due:  isYmd(raw.due) ? raw.due : '',
    remindAt: isYmd(raw.remindAt) ? raw.remindAt : '',
    done: !!raw.done,
    doneAt: isYmd(raw.doneAt) ? raw.doneAt : ''
  };
}

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function normalizeList(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeItem).filter(Boolean).slice(0, MAX_ITEMS);
}

/* ═══ الإضافة ═══
   → { items, error } — error نصّ عربي جاهز للعرض أو ''

   ⚠️ تُرجع مصفوفة جديدة ولا تعدّل الأصل: الشاشة تعرض القديمة حتى تنجح
   الكتابة، فلا تظهر إضافةٌ سقطت في الشبكة كأنها حُفظت. */
export function addItem(items, input, newId) {
  const list = normalizeList(items);
  const item = normalizeItem({ ...input, id: newId, done: false });
  if (!item) return { items: list, error: 'اكتب نصّ التذكير' };

  if (item.ref && list.some((x) => x.ref === item.ref && !x.done))
    return { items: list, error: 'هذه المهمة في قائمتك بالفعل' };

  const open = list.filter((x) => !x.done).length;
  if (open >= MAX_OPEN)
    return { items: list, error: `بلغت ${MAX_OPEN} عنصراً مفتوحاً — اشطب ما أنجزته أولاً` };
  if (list.length >= MAX_ITEMS)
    return { items: list, error: 'القائمة ممتلئة — احذف المنجز القديم' };

  return { items: [...list, item], error: '' };
}

export function toggleItem(items, id, todayYmd) {
  return normalizeList(items).map((x) =>
    x.id === id ? { ...x, done: !x.done, doneAt: !x.done ? (todayYmd || '') : '' } : x);
}

export const removeItem = (items, id) => normalizeList(items).filter((x) => x.id !== id);

/* ═══ تنظيف المنجز القديم ═══
   ⚠️ لا يُنفَّذ تلقائياً بلا علم صاحبها: الحذف لا رجعة فيه، والقرار له.
   الشاشة تعرض العدد وتعرض الزرّ. */
export const PRUNE_AFTER_DAYS = 14;

export function prunable(items, todayYmd, afterDays = PRUNE_AFTER_DAYS) {
  return normalizeList(items).filter((x) =>
    x.done && x.doneAt && daysBetween(x.doneAt, todayYmd) >= afterDays);
}

export function pruneDone(items, todayYmd, afterDays = PRUNE_AFTER_DAYS) {
  const drop = new Set(prunable(items, todayYmd, afterDays).map((x) => x.id));
  return normalizeList(items).filter((x) => !drop.has(x.id));
}

function daysBetween(fromYmd, toYmd) {
  const a = new Date(fromYmd + 'T00:00:00'), b = new Date(toYmd + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ═══ التذكيرات المستحقّة ═══

   ⚠️⚠️ بلا خادم **لا يوجد إشعار والتطبيق مغلق** — لا Push ولا رسالة ولا
   بريد، كلها تحتاج Cloud Functions. فالتذكير هنا معناه: يظهر في الصفحة
   الرئيسية حين يحين موعده. لا تَعِد الموظف بغير هذا في أي نصّ ظاهر —
   تذكيرٌ لا يأتي أسوأ من لا تذكير.

   ⚠️ والمستحقّ يشمل الفائت: من فتح النظام بعد يومين يجب أن يرى ما فاته لا
   أن يُطوى بصمت. */
export function dueReminders(items, todayYmd) {
  return normalizeList(items)
    .filter((x) => !x.done && x.remindAt && x.remindAt <= todayYmd)
    .sort((a, b) => (a.remindAt < b.remindAt ? -1 : 1));
}

/* ═══ قائمة اليوم ═══
   → { tasks: [{ item, task }], personal: [...], done: [...] }

   ⚠️ عنصر المهمة يُحَلّ من `byId` — وهي المصفوفة المحمَّلة أصلاً لـ«مهامي».
   والمهمة التي خرجت من النشِط (اعتُمدت أو أُلغيت) تُرجَع بـ`task: null`
   ولا تُحذف من القائمة تلقائياً: الحذف قرار صاحبها، والاختفاء الصامت يجعله
   يظنّ أنه فقد شيئاً. */
export function todayView(items, tasksById, todayYmd) {
  const list = normalizeList(items);
  const byId = tasksById instanceof Map ? tasksById : new Map();
  const open = list.filter((x) => !x.done);
  return {
    tasks:    open.filter((x) => x.ref).map((x) => ({ item: x, task: byId.get(x.ref) || null })),
    personal: open.filter((x) => !x.ref).sort(byDue),
    done:     list.filter((x) => x.done).sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1)),
    overdue:  open.filter((x) => x.due && x.due < todayYmd).length,
    dueToday: open.filter((x) => x.due === todayYmd).length
  };
}

/* الأقرب موعداً أولاً، وما بلا موعد في الآخر — لا في الأول: عنصرٌ بلا موعد
   ليس عاجلاً، ووضعه فوق المؤرَّخ يدفن ما له وقت. */
function byDue(a, b) {
  if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
  if (a.due) return -1;
  if (b.due) return 1;
  return 0;
}
