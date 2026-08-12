/* ═══════════════════════════════════════════════════════════════════════════
   تجميع أداء الفريق — لكل موظف وللقسم كله

   ⚠️ هذه الوحدة **لا تحسب حالة يوم واحد إطلاقاً**. تستقبل صفوف
   buildDailyStatus() كما هي وتجمعها. هذا مقصود ومكتوب هنا حتى لا يُعاد
   الحساب: من يحسب «متأخر» مرة ثانية بشروط مختلفة قليلاً يعطي لنفس الموظف
   رقمي تأخير مختلفين في شاشتين — وهو أسوأ من ألا تكون الشاشة موجودة، لأن
   المدير يبني عليه قراراً إدارياً ولا يعرف أيّهما الصحيح.

   ⚠️ ونقيّة تماماً — لا firebase ولا شبكة — فتُختبر في node. وهذا هو سبب
   وجودها منفصلة عن hr-stats.js التي تجرّ attendance.js وتجرّ معها firebase.
   ═══════════════════════════════════════════════════════════════════════════ */

/* الأصناف التي تُرجعها buildDailyStatus في حقل cls */
const CLASSES = ['present', 'late', 'absent', 'leave', 'missing'];

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

/* ═══ teamSummaryOf(rows) ═══

   rows: خرج buildDailyStatus — لكل صف { u, cls, lateMin, secs, … }

   → {
       employees: [{ uid, name, department, jobTitle,
                     days, present, late, absent, leave, missing,
                     lateMin, secs, onTime, overall }]     مرتّبة بالالتزام
       totals:    نفس الحقول للقسم كله + employeeCount
     }

   ⚠️ تعريف النسبتين — مكتوب هنا لأنه قرار لا بديهية:
     onTime  = الحاضر في وقته ÷ كل الأيام المحسوبة
     overall = (حاضر + متأخر + إجازة) ÷ كل الأيام المحسوبة
   أي أن `overall` تقيس «هل جاء أصلاً»، و`onTime` تقيس «هل جاء في وقته».
   الإجازة المعتمَدة تُحسب التزاماً في `overall` ولا تُحسب في `onTime` — لأن
   الإجازة حقّ لا تقصير، لكنها ليست انضباطاً في الحضور يُكافأ عليه.

   ⚠️ ونسختها هنا مطابقة لِما في complianceRate() داخل hr-stats.js عمداً:
   شاشة الأدمن وشاشة المدير لازم تقولان الرقم نفسه عن الموظف نفسه. */
export function teamSummaryOf(rows) {
  const byUid = new Map();

  (rows || []).forEach((r) => {
    if (!r || !r.u) return;
    const id = r.u.id;
    if (!byUid.has(id)) {
      byUid.set(id, {
        uid: id, name: r.u.name || '', department: r.u.department || '',
        jobTitle: r.u.jobTitle || '',
        days: 0, present: 0, late: 0, absent: 0, leave: 0, missing: 0,
        lateMin: 0, secs: 0
      });
    }
    const e = byUid.get(id);
    e.days++;
    /* ⚠️ cls غير متوقّع لا يُسقط الصف من المقام: عدد الأيام يجب أن يبقى
       صحيحاً حتى لو أضيف صنف جديد في buildDailyStatus ولم يُحدَّث هذا الملف.
       نسبة محسوبة على مقام ناقص أخطر من صنف غير معدود. */
    if (CLASSES.includes(r.cls)) e[r.cls]++;
    e.lateMin += r.lateMin || 0;
    e.secs    += r.secs || 0;
  });

  const employees = [...byUid.values()].map((e) => ({
    ...e,
    onTime:  pct(e.present, e.days),
    overall: pct(e.present + e.late + e.leave, e.days)
  }));

  /* الأقل التزاماً أولاً؟ لا — الأعلى أولاً، والمدير يقلب الترتيب إن أراد.
     قائمة تفتح على الأسوأ تُقرأ كقائمة عقاب، وهذه شاشة متابعة لا محاسبة. */
  employees.sort((a, b) => b.overall - a.overall || a.lateMin - b.lateMin
                        || (a.name || '').localeCompare(b.name || ''));

  const sum = (k) => employees.reduce((a, e) => a + e[k], 0);
  const days = sum('days');
  const totals = {
    employeeCount: employees.length,
    days,
    present: sum('present'), late: sum('late'), absent: sum('absent'),
    leave: sum('leave'), missing: sum('missing'),
    lateMin: sum('lateMin'), secs: sum('secs'),
    onTime:  pct(sum('present'), days),
    overall: pct(sum('present') + sum('late') + sum('leave'), days),
    /* متوسط دقائق التأخير **على الأيام المتأخرة وحدها** لا على كل الأيام.
       القسمة على كل الأيام تُميّع الرقم: قسم فيه متأخر واحد بساعة يظهر
       «متوسط دقيقتين» فلا يلفت أحداً، والمشكلة عند شخص واحد لا موزّعة. */
    avgLateMinPerLateDay: sum('late') > 0 ? Math.round(sum('lateMin') / sum('late')) : 0
  };

  return { employees, totals };
}

/* ═══ اتجاه المقارنة بين دورتين ═══
   → { delta, dir }  حيث dir ∈ 'up' | 'down' | 'flat'
   ⚠️ يُرجع null حين لا تكون هناك دورة سابقة بأيام محسوبة — سهمٌ أخضر مبنيّ
   على «صفر سابقاً» يقرأه المدير تحسّناً وهو لا شيء. */
export function trendOf(current, previous, key = 'overall') {
  if (!previous || !previous.days) return null;
  if (!current || !current.days) return null;
  const delta = (current[key] || 0) - (previous[key] || 0);
  return { delta, dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

/* صفوف التصدير — نفس أرقام الشاشة بالضبط، لا حساب ثانٍ */
export function teamExportRows(summary) {
  return (summary.employees || []).map((e) => ({
    'الموظف': e.name,
    'المسمى': e.jobTitle,
    'أيام محسوبة': e.days,
    'حاضر': e.present,
    'متأخر': e.late,
    'غائب': e.absent,
    'إجازة': e.leave,
    'بصمة خروج ناقصة': e.missing,
    'مجموع دقائق التأخير': e.lateMin,
    'ساعات العمل': Math.round((e.secs / 3600) * 10) / 10,
    'الالتزام %': e.overall,
    'في الوقت %': e.onTime
  }));
}
