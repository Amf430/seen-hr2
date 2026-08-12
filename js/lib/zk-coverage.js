/* ═══════════════════════════════════════════════════════════════════════════
   تغطية حقل `department` في سجل جهاز البصمة

   ── المشكلة التي تحلّها هذه الوحدة ──
   `bridge/zk_bridge.py` يكتب `department` على وثائق zkAttendance منذ الكوميت
   69b6b12. أما الوثائق المكتوبة قبل تثبيت تلك النسخة على جهاز المكتب فلا
   تحمل الحقل إطلاقاً.

   وشاشة مدير القسم (المرحلة ٤) لازم تفلتر بـ where('department','==',…)
   وإلا رفض Firestore الاستعلام كاملاً. والاستعلام المُقيَّد **لا يُخطئ ولا
   يرفض** الوثائق الناقصة — يتخطّاها بصمت. النتيجة شاشة تعمل وتبدو سليمة
   وفيها أيام ناقصة، ولا أحد يشكّ فيها. وهذا أسوأ من شاشة فارغة: الشاشة
   الفارغة تُبلّغ عن نفسها، والناقصة تكذب بثقة.

   ── لماذا نشتقّ التاريخ ولا نكتبه يدوياً ──
   تاريخ التثبيت مكتوباً في الكود يصير كذبة يوم يُعاد تثبيت الجسر، أو يوم
   يتعطّل أسبوعاً ثم يعود. الاشتقاق من البيانات نفسها يبقى صحيحاً بلا صيانة،
   ويكشف الانقطاع الجديد كما يكشف القديم.

   ⚠️ هذه الوحدة نقيّة تماماً — لا تستورد firebase ولا تقرأ شبكة. تستقبل
   السجلات المجلوبة وتحسب. لذلك تُختبر في node.
   ═══════════════════════════════════════════════════════════════════════════ */

/* اليوم التالي لتاريخ 'YYYY-MM-DD' بصيغته نفسها */
function dayAfter(ymdStr) {
  const d = new Date(ymdStr + 'T00:00:00');
  if (isNaN(d)) return ymdStr;
  d.setDate(d.getDate() + 1);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

const hasDept = (r) => typeof r.department === 'string' && r.department !== '';

/* ═══ deptCoverageOf(records) ═══

   records: وثائق zkAttendance كما تُقرأ — يكفي أن تحمل { date, department }

   → {
        total,           عدد السجلات المفحوصة
        withDept,        كم منها يحمل قسماً
        withoutDept,     كم منها بلا قسم
        firstDeptDate,   أقدم تاريخ ظهر فيه الحقل        | null
        lastMissingDate, أحدث تاريخ غاب فيه الحقل         | null
        safeFrom,        أول تاريخ تصير التغطية بعده كاملة | null
        complete         لا سجل واحد ناقص
      }

   ⚠️ `safeFrom` ليس أقدم تاريخ فيه الحقل — بل **اليوم التالي لآخر يوم ناقص**.
   الفرق جوهري: لو كتب الجسر القسم يوماً ثم توقّف أسبوعاً ثم عاد، فأقدم ظهور
   للحقل يبقى قديماً بينما التغطية الحقيقية تبدأ بعد الانقطاع. الأخذ بأقدم
   ظهور يعني شاشةً تدّعي تغطية أسبوعٍ لا تملكه. */
export function deptCoverageOf(records) {
  const rows = (records || []).filter((r) => r && typeof r.date === 'string' && r.date);

  let withDept = 0, withoutDept = 0;
  let firstDeptDate = null, lastMissingDate = null;

  for (const r of rows) {
    if (hasDept(r)) {
      withDept++;
      if (!firstDeptDate || r.date < firstDeptDate) firstDeptDate = r.date;
    } else {
      withoutDept++;
      if (!lastMissingDate || r.date > lastMissingDate) lastMissingDate = r.date;
    }
  }

  const complete = rows.length > 0 && withoutDept === 0;
  const safeFrom = !rows.length ? null
    : withoutDept === 0 ? firstDeptDate
    : dayAfter(lastMissingDate);

  return { total: rows.length, withDept, withoutDept,
           firstDeptDate, lastMissingDate, safeFrom, complete };
}

/* ═══ جملة عربية تُعرض للمدير ═══
   ⚠️ الشاشة لازم تقول تغطيتها بنفسها. مدير يقرأ «٣ أيام غياب» لا يعرف أنها
   محسوبة على نصف الدورة ما لم نقلها له، وسيتّخذ قراراً إدارياً على رقم ناقص. */
export function coverageNote(cov) {
  if (!cov || !cov.total) return null;
  if (cov.complete) return null;
  return `⚠️ سجلات جهاز البصمة قبل ${cov.safeFrom} لا تحمل القسم، فلا تدخل في هذه الأرقام. `
       + `(${cov.withoutDept} سجلاً من ${cov.total} خارج الحساب — آخرها ${cov.lastMissingDate}.)`;
}

/* هل نطاق التواريخ المطلوب يقع كاملاً داخل التغطية؟
   تُستعمل قبل رسم الشاشة: النطاق الواقع كلّه قبل safeFrom يعني أرقاماً صفرية
   مضلّلة، والأصدق أن تُرفض الشاشة بدل أن تعرض أصفاراً تبدو حقيقة. */
export function rangeCovered(cov, fromYmd, toYmd) {
  if (!cov || !cov.safeFrom) return true;      /* لا بيانات نحكم بها → لا ندّعي نقصاً */
  if (cov.complete) return true;
  if (toYmd < cov.safeFrom) return false;      /* النطاق كله خارج التغطية */
  return fromYmd >= cov.safeFrom;
}
