/* ═══════════════════════════════════════════════════════════════════════════
   تقويم الفريق — الطبقات والتضارب والخصوصية (المرحلة ٩)

   ⚠️⚠️ قرار المالك (٢٠٢٦-٠٨-١٢): **الموظف لا يرى إجازات زملائه إطلاقاً** —
   لا أسماءهم ولا أنواعها. الإجازات لمدير القسم وحده.

   وهذا يُلغي مشكلة الخصوصية من جذرها بدل معالجتها: كانت النسخة الأولى تنشر
   وثيقة مُشتقّة فيها أسماء بلا أنواع (نمط leaderboard.js)، والآن لا شيء
   يُنشر أصلاً. المدير يقرأ `requests` مباشرةً — وقاعدتها تمنع الموظف منها
   أصلاً (sameDept تشترط isMgr)، فالحدّ مفروض على السيرفر لا في الواجهة.

   ما يراه الموظف في التقويم: **العطل الرسمية، وورديته، والأحداث** — اجتماع
   أسبوعي يضيفه مدير قسمه، أو حدث على مستوى الشركة يضيفه الأدمن.

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

/* ═══ صفوف الخطّ الزمني ═══
   صفّ لكل موظف، وأشرطة تمتدّ على أيام إجازته داخل الشهر.

   الشبكة الشهرية تجيب «من غائب اليوم؟»، وهذه تجيب «متى يغيب كلٌّ منهم؟» —
   وهو السؤال الذي يقرّر الموافقة على طلب جديد.

   → [{ uid, name, jobTitle, department, bars: [{ start, span, type, status,
        label, clippedStart, clippedEnd }] }]
   ‏start يوم يبدأ من ١، و span بالأيام — كلاهما مقصوص على حدود الشهر.

   ⚠️ المرفوض لا يُرسم إطلاقاً: الشريط يقول «هذا الموظف غائب»، والمرفوض
   حاضر. والمعلّق يُرسم متقطّعاً لأنه احتمال لا التزام.

   ⚠️ القصّ يُعلَّم بـ clippedStart / clippedEnd: إجازة تبدأ الشهر الماضي
   وتنتهي في هذا تُرسم من اليوم الأول، ولولا العلامة لبدت كأنها بدأت فيه. */
export function timelineRows(requests, year, month, users = []) {
  const p2 = (n) => String(n).padStart(2, '0');
  const first = `${year}-${p2(month + 1)}-01`;
  const days = new Date(year, month + 1, 0).getDate();
  const last = `${year}-${p2(month + 1)}-${p2(days)}`;
  const dayOf = (s) => +String(s).slice(8, 10);

  const byUid = new Map();
  const meta = new Map((users || []).map((u) => [u.id, u]));

  for (const r of requests || []) {
    if (!r || r.status === 'rejected' || r.status === 'cancelled') continue;
    const s = r.type === 'permission' ? r.date : r.startDate;
    const e = r.type === 'permission' ? r.date : r.endDate;
    if (!s || !e) continue;
    if (e < first || s > last) continue;          /* خارج الشهر كلياً */

    const clippedStart = s < first, clippedEnd = e > last;
    const start = clippedStart ? 1 : dayOf(s);
    const end   = clippedEnd ? days : dayOf(e);
    if (!(start >= 1 && end >= start)) continue;

    const uid = r.employeeUid || r.employeeName || '—';
    if (!byUid.has(uid)) {
      const u = meta.get(r.employeeUid) || {};
      byUid.set(uid, { uid, name: r.employeeName || u.name || '—',
        jobTitle: u.jobTitle || '', department: r.department || u.department || '', bars: [] });
    }
    byUid.get(uid).bars.push({
      start, span: end - start + 1, type: r.type, status: r.status,
      label: r.categoryLabel || (r.type === 'permission' ? 'استئذان' : 'إجازة'),
      clippedStart, clippedEnd
    });
  }

  const rows = [...byUid.values()];
  rows.forEach((row) => row.bars.sort((a, b) => a.start - b.start));
  return rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/* ═══ الطبقات فوق يوم واحد ═══

   → { ymd, leaves, events, exception, dueTasks, isOff }

   ⚠️ `requests` تُمرَّر فارغة للموظف — لا لأن الواجهة ترشّحها، بل لأنه لا
   يملك قراءتها أصلاً على السيرفر. الترشيح هنا ليس ضابطاً أمنياً. */
export function dayLayers(ymd, { requests = [], exceptions = [], tasks = [],
                                 events = [], dept = '' } = {}) {
  const ex = (exceptions || []).find((x) => x.date === ymd) || null;
  const leaves = leavesOn(requests, ymd, dept)
    .map((r) => ({ uid: r.employeeUid, name: r.employeeName,
                   type: r.categoryLabel || '', days: r.days }));
  const dueTasks = (tasks || []).filter((t) => t.dueDate === ymd
    && t.status !== 'done' && t.status !== 'archived');
  return { ymd, leaves, events: eventsOn(events, ymd, dept),
           exception: ex, dueTasks, isOff: !!ex && ex.type === 'off' };
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



/* ═══════════════════════════════════════════════════════════════════════════
   الأحداث (قرار المالك ٢٠٢٦-٠٨-١٢)

   الأدمن يضيف حدثاً على مستوى الشركة، ومدير القسم يضيف لقسمه **وحده** —
   اجتماع أسبوعي مثلاً. وهذا ما يراه الموظف في تقويمه بدل إجازات زملائه.

   ⚠️ نطاق الحدث حقلٌ واحد لا اثنان: `department` فارغة تعني الشركة كلها.
   حقلان (`forAll` و`department`) يسمحان بحالة متناقضة — «للشركة كلها ولقسم
   المبيعات» — والقاعدة تصير أطول لتمنعها.
   ═══════════════════════════════════════════════════════════════════════════ */

/* أحداث يوم بعينه لمن هو في قسم `dept` */
export function eventsOn(events, ymd, dept) {
  return (events || []).filter((e) =>
    e.date === ymd && (!e.department || e.department === dept));
}

/* ⚠️ مرآةٌ لقاعدة calendarEvents لا بديل عنها: المدير لقسمه، والأدمن للكل.
   لو حُذف هذا السطر سقطت الكتابة على السيرفر برسالة صلاحيات. */
export function canEditEvent(ev, me) {
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (me.role !== 'manager' || !me.department) return false;
  return !!ev && ev.department === me.department;
}
