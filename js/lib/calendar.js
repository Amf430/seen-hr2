/* ═══════════════════════════════════════════════════════════════════════════
   تقويم الفريق — الطبقات والتضارب والخصوصية (المرحلة ٩)

   ⚠️⚠️ الخصوصية هي القيد الحاكم هنا، لا العرض.
   نوع الإجازة معلومة صحّية أو شخصية أحياناً: مرضية · وضع · وفاة. الزميل
   يحتاج يعرف أن فلاناً غير موجود، **لا لماذا**. فكل ما يخرج لزميل من هذه
   الوحدة اسمٌ ويومٌ فقط — بلا نوع ولا سبب ولا مدى.

   ⚠️ وهذا ليس اختياراً تجميلياً: قاعدة `requests` تمنع الموظف من قراءة طلبات
   زملائه أصلاً (sameDept تشترط isMgr). فلا سبيل لعرض «مَن غائب» للموظف إلا
   بوثيقة مُشتقّة يكتبها من يملك القراءة — نفس ما فعلته leaderboard.js
   بالضبط، ولنفس السبب. اقرأ تعليقها قبل أن تغيّر هذا.

   ⚠️ نقيّة تماماً — لا firebase ولا DOM — فتُختبر في node.
   ═══════════════════════════════════════════════════════════════════════════ */

const p2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/* ═══ شبكة الشهر ═══
   → { key, label, days: ['YYYY-MM-DD', …], lead }
   `lead` عدد الخانات الفارغة قبل أول يوم — الأسبوع يبدأ الأحد كما في النظام. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const days = [];
  for (let d = new Date(first); d.getMonth() === month; d.setDate(d.getDate() + 1))
    days.push(ymdOf(d));
  return {
    key: `${year}-${p2(month + 1)}`,
    label: `${AR_MONTHS[month]} ${year}`,
    days,
    lead: first.getDay()
  };
}

export function shiftMonth(year, month, by) {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/* ═══ الإجازات المعتمَدة في يوم ═══
   ⚠️ تقرأ `requests` كما هي ولا تُعيد حساب المدى. حسبة ثانية للتواريخ
   تتباعد عن الأولى فيظهر موظف «في إجازة» في شاشة و«حاضر» في أخرى. */
export function leavesOn(requests, ymd, deptOf) {
  return (requests || []).filter((r) =>
    r.type === 'leave' && r.status === 'approved' &&
    r.startDate <= ymd && r.endDate >= ymd &&
    (!deptOf || r.department === deptOf));
}

/* ═══ الطبقات فوق يوم واحد ═══

   → { ymd, leaves, exception, dueTasks, isOff }

   ⚠️ `view` يحكم ما يخرج:
     'full' — للمدير والأدمن: النوع والسبب ظاهران، فهما يملكان القراءة أصلاً.
     'peer' — للزميل: الاسم فقط. لا نوع ولا سبب ولا تصنيف.
   الافتراضي 'peer' عمداً: من ينسى تمرير الوسيط يحصل على الأقل كشفاً لا
   الأكثر. */
export function dayLayers(ymd, { requests = [], exceptions = [], tasks = [],
                                 dept = '', view = 'peer' } = {}) {
  const ex = (exceptions || []).find((x) => x.date === ymd) || null;
  const leaves = leavesOn(requests, ymd, dept).map((r) => (view === 'full'
    ? { uid: r.employeeUid, name: r.employeeName, type: r.categoryLabel || '', days: r.days }
    /* ⚠️ الزميل يأخذ الاسم وحده — النوع معلومة صحّية أحياناً */
    : { uid: r.employeeUid, name: r.employeeName }));
  const dueTasks = (tasks || []).filter((t) => t.dueDate === ymd
    && t.status !== 'done' && t.status !== 'archived');
  return { ymd, leaves, exception: ex, dueTasks, isOff: !!ex && ex.type === 'off' };
}

/* ═══ تحذير التضارب ═══

   ⚠️ النسبة من عدد موظفي القسم لا رقم مطلق: «٤ في إجازة» لا تعني شيئاً في
   قسم من أربعين، وتعني توقّف العمل في قسم من ستة.

   ⚠️ والحدّ قابل للضبط (settings.leaveConflictThreshold) لأن الأقسام تختلف:
   قسم المبيعات يحتمل نصفه غائباً، وقسم الأمن لا. */
export const DEFAULT_CONFLICT_PCT = 50;

export function conflictOn(ymd, requests, dept, staffCount, pct = DEFAULT_CONFLICT_PCT) {
  if (!staffCount) return null;
  const away = leavesOn(requests, ymd, dept).length;
  const ratio = Math.round((away / staffCount) * 100);
  if (ratio < pct) return null;
  return { ymd, away, staffCount, ratio };
}

export function conflictsInRange(days, requests, dept, staffCount, pct = DEFAULT_CONFLICT_PCT) {
  return (days || []).map((d) => conflictOn(d, requests, dept, staffCount, pct)).filter(Boolean);
}

/* عدد الزملاء في إجازة خلال مدى — للتنبيه قبل تقديم الطلب.
   ⚠️ يستثني مقدّم الطلب نفسه: «٣ من زملائك» لا تشمله هو. */
export function peersAwayInRange(awayDays, fromYmd, toYmd, excludeUid = '') {
  const names = new Set();
  Object.entries(awayDays || {}).forEach(([ymd, list]) => {
    if (ymd < fromYmd || ymd > toYmd) return;
    (list || []).forEach((p) => { if (p.uid !== excludeUid) names.add(p.name || p.uid); });
  });
  return [...names];
}

/* ═══ الوثيقة المنشورة ═══

   ⚠️ ما يُنشر: اليوم، والاسم، والمعرّف. **لا نوع ولا سبب ولا تاريخ بداية
   ولا نهاية** — الزميل يعرف أن فلاناً غير موجود ذلك اليوم، ولا يعرف غير ذلك.
   حتى المدى لا يُنشر: معرفة أن زميلاً في إجازة ثلاثة أسابيع تقول شيئاً عن
   نوعها.

   ⚠️ وتحمل `at` ويُعرض تاريخها: تُحدَّث حين يفتح مديرٌ التقويم لا تلقائياً،
   ولوحة قديمة تُقرأ على أنها اليوم أسوأ من لوحة مؤرَّخة. */
export function buildAwayDoc(days, requests, dept, staffCount) {
  const out = {};
  (days || []).forEach((ymd) => {
    const list = leavesOn(requests, ymd, dept)
      .map((r) => ({ uid: r.employeeUid, name: r.employeeName || '' }));
    if (list.length) out[ymd] = list;
  });
  return { department: dept, staffCount: staffCount || 0, days: out };
}
