/* ═══════════════════════════════════════════════════════════════════════════
   الأقسام · استثناءات التواريخ · حلّ الوردية

   ترتيب الأولوية:
     1) استثناء تاريخ محدّد (عطلة رسمية أو دوام خاص للشركة كلها)
     2) ورديات خاصة بقسم الموظف
     3) الورديات الأسبوعية العامة

   ⚠️ منقولة حرفياً من النسخة القديمة (السطور 384-438 و 514-520 و 2158-2160).
   التعديل الوحيد المسموح: إضافة export واستبدال SETTINGS/ME بالدوال.
   هذه الدوال تحدّد من هو «متأخر» ومن هو «غائب» — وعليها يُبنى الخصم من
   الراتب. أي إعادة صياغة هنا تغيّر رواتب الناس بصمت.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getSettings, getMe } from './state.js';
import { ymd, hmToDate } from './dates.js';

/* بعد ساعتين من نهاية الوردية → يُعتبر نسيان بصمة خروج */
export const MISSING_OUT_AFTER_MIN = 120;
/* سماح لتسجيل الحضور بعد نهاية الوردية */
export const GRACE_AFTER_END_MIN = 120;
/* دقائق السماح قبل احتساب التأخير في التقرير اليومي */
export const LATE_GRACE_MIN = 15;

/* ═══ تعويض التأخير — داخلي للأدمن ═══

   من تأخّر ثم بقي بعد نهاية ورديته: تُقاصّ دقائق بقائه بدقائق تأخيره، بحدّ
   أقصى ساعة. ما فوق الساعة يبقى تأخيراً يُخصم عليه. من تأخّر ٩٠ د وبقي ٩٠ د
   يُعوَّض ٦٠ ويبقى عليه ٣٠.

   ⚠️ ثابت في الكود لا في `settings`: وثيقة الإعدادات يقرأها كل موظف نشط
   (firestore.rules — `allow read: if isActive()`)، فوضع الحدّ فيها يكشف وجود
   الخاصية لمن يقرأ بياناته من الـAPI مباشرة.

   ⚠️ ولا يُطبَّق هذا في شاشات الموظف. buildDailyStatus لا تعوّض إلا إذا
   طُلب منها صراحةً، والطلب من شاشات الأدمن وحدها. */
export const LATE_COMP_MAX_MIN = 60;

export function compensableMin(lateMin, lastOut, win) {
  if (!(lateMin > 0) || !lastOut || !win) return 0;
  const over = Math.round((lastOut - win.end) / 60000);
  return Math.max(0, Math.min(lateMin, over, LATE_COMP_MAX_MIN));
}

export function deptOf(name) {
  if (!name) return null;
  return (getSettings().departments || []).find((d) => d.name === name) || null;
}

export function dateException(dateStr) {
  return (getSettings().dateExceptions || []).find((x) => x.date === dateStr) || null;
}

/* ═══════════════════ خطط الشفتات المُسمّاة ═══════════════════

   ⚠️ نفس أسلوب branchesOf() في geo.js حرفياً: النظام القديم ما فيه
   shiftPlans، فنُركّب خطة واحدة في الذاكرة من settings.shifts بدل أن نطلب
   ترحيل بيانات. يوم النشر لا تُلمس وثيقة واحدة، والسلوك مطابق للسابق بالحرف.

   الخطة: { id, name, days:{0..6:{type,start,end}}, checkInCutoff, active } */
export const DEFAULT_PLAN_ID = 'plan_default';

export function shiftPlansOf() {
  const S = getSettings();
  const list = Array.isArray(S.shiftPlans) ? S.shiftPlans.filter(Boolean) : [];
  if (list.length) return list;
  /* الشكل القديم مركَّباً كخطة — للعرض والإسناد، ولا يُكتب في Firestore */
  return [{
    id: DEFAULT_PLAN_ID,
    name: 'دوام الشركة',
    days: { ...(S.shifts || {}) },
    active: true,
    synthetic: true          /* مُركَّبة في الذاكرة — الواجهة تعرضها للقراءة */
  }];
}

export const planById = (id) => (id ? shiftPlansOf().find((p) => p.id === id) || null : null);

/* ⚠️ خطة معطَّلة تسقط للطبقة التالية ولا تعني «راحة».
   لو أعدنا off لكل من يتبع خطة عطّلها الأدمن، لصار قسمٌ كامل «غائباً» في
   المسير بضغطة زر واحدة وبلا أي إنذار. التعطيل يعني «لا تُسنَد لأحد جديد»،
   لا «امسح دوام من عليها». */
const activePlan = (id) => { const p = planById(id); return p && p.active !== false ? p : null; };

/* يوم من خطة — undefined لو الخطة ناقصة ذلك اليوم، فيسقط للطبقة التالية
   بدل أن يُحسب راحةً. خطة مشوّهة يجب ألا تُنقص راتب أحد. */
const dayOfPlan = (plan, dow) => (plan && plan.days ? plan.days[dow] : null) || null;

/* ⚠️ checkInCutoff يُنسخ على الوردية المُرجَعة لا على الخطة وحدها.
   المرحلة ١ (قفل تسجيل الحضور) تستقبل «وردية» لا «خطة»، وبلا هذا النسخ
   ما فيه طريق يوصّل قيمة القفل من الخطة إلى دالة النافذة. غيابه = undefined
   = القفل يسقط إلى نهاية الوردية، وهو سلوك اليوم بالضبط. */
const fromPlan = (s, plan, src) => ({
  ...s,
  src,
  planId: plan.id,
  planName: plan.name,
  exLabel: 'خطة ' + plan.name,
  ...(plan.checkInCutoff ? { checkInCutoff: plan.checkInCutoff } : {})
});

/* ═══ حلّ الوردية ═══

   ترتيب الأولوية (الطبقتان ٢ و٣ جديدتان):
     ١) استثناء التاريخ            — عطلة رسمية أو دوام خاص للشركة كلها
     ٢) خطة شفت الموظف             emp.shiftPlanId
     ٣) خطة شفت القسم              department.shiftPlanId
     ٤) ورديات القسم القديمة        department.shifts[dow]   ← توافق خلفي
     ٥) الخطة الافتراضية / settings.shifts[dow]

   ⚠️ المعامل الرابع `emp` اختياري بالكامل. كل نداء قديم بلا تمريره
   (attendance.js · hr-stats.js · payroll.js · pages/attend.js) لازم يعطي
   نفس النتيجة السابقة بالحرف — وهذا مُغطّى باختبارات في core.test.mjs. */
export function resolveShift(dateStr, dow, deptName, emp) {
  const ex = dateException(dateStr);
  if (ex) {
    if (ex.type === 'off')
      return { type: 'off', start: '', end: '', src: 'exception', exLabel: ex.label || 'عطلة رسمية' };
    return { type: ex.kind || 'morning', start: ex.start || '', end: ex.end || '',
             src: 'exception', exLabel: ex.label || 'دوام خاص' };
  }

  /* ٢) خطة الموظف — تتقدّم على قسمه */
  const ep = emp ? activePlan(emp.shiftPlanId) : null;
  const eDay = dayOfPlan(ep, dow);
  if (eDay) return fromPlan(eDay, ep, 'empPlan');

  const d = deptOf(deptName);

  /* ٣) خطة القسم */
  const dp = d ? activePlan(d.shiftPlanId) : null;
  const dDay = dayOfPlan(dp, dow);
  if (dDay) return fromPlan(dDay, dp, 'deptPlan');

  /* ٤) الشكل القديم لورديات القسم — يبقى يعمل ولا يُرحَّل تلقائياً */
  if (d && d.shifts && d.shifts[dow])
    return { ...d.shifts[dow], src: 'dept', exLabel: 'وردية قسم ' + d.name };

  /* ٥) الخطة الافتراضية إن عُرّفت، وإلا settings.shifts كما كان */
  const S = getSettings();
  const def = activePlan(S.defaultShiftPlanId);
  const defDay = dayOfPlan(def, dow);
  if (defDay) return fromPlan(defDay, def, 'plan');

  const s = (S.shifts || {})[dow];
  return s ? { ...s, src: 'company' } : { type: 'off', start: '', end: '', src: 'none' };
}

/* مَن يتبع خطة — لحراسة الحذف في الواجهة */
export function planUsage(planId, users) {
  const depts = (getSettings().departments || []).filter((d) => d.shiftPlanId === planId);
  const emps  = (users || []).filter((u) => u.shiftPlanId === planId);
  return { depts: depts.length, employees: emps.length, deptNames: depts.map((d) => d.name) };
}

/* عدد ساعات الوردية المطلوبة — يدعم العبور لمنتصف الليل */
export function shiftHours(sh) {
  if (!sh || sh.type === 'off' || !sh.start || !sh.end) return 0;
  const [h1, m1] = sh.start.split(':').map(Number), [h2, m2] = sh.end.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1); if (mins <= 0) mins += 1440;
  return mins / 60;
}

/* نافذة الوردية كتواريخ فعلية على يوم معيّن */
export function shiftWindowFor(baseDate, sh) {
  if (!sh || sh.type === 'off' || !sh.start || !sh.end) return null;
  const st = hmToDate(baseDate, sh.start); let en = hmToDate(baseDate, sh.end);
  if (en <= st) en = new Date(en.getTime() + 86400000);
  return { start: st, end: en };
}

export function shiftText(sh) {
  if (!sh || sh.type === 'off') return sh && sh.exLabel ? sh.exLabel : 'راحة';
  const kind = sh.type === 'evening' ? 'مسائي' : 'صباحي';
  return `${kind} ${sh.start || ''}–${sh.end || ''}`;
}

/* وردية اليوم للمستخدم الحالي.
   ⚠️ تمرّر getMe() كمعامل رابع: بدونه يرى الموظف صاحب الخطة الخاصة وردية
   قسمه على شاشته بينما يُحاسبه المسير على خطته هو — رقمان لنفس اليوم. */
export function myShiftToday(base) {
  const d = base || new Date();
  const me = getMe();
  return resolveShift(ymd(d), d.getDay(), me ? me.department : '', me);
}

export function shiftLabelOf(dow) {
  const d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  const me = getMe();
  const sh = resolveShift(ymd(d), dow, me ? me.department : '', me);
  return shiftText(sh);
}

/* ═══════════════════ نافذة تسجيل الحضور (المرحلة ١) ═══════════════════

   ⚠️ الخلل الذي تُصلحه هذه الكتلة: shiftEndPassed() كانت تُستعمل لتعطيل زرّ
   اللوحة **كله** بعد نهاية الوردية بساعتين — بما فيه زرّ الانصراف. فمن دخل
   ونسي الانصراف يجد الزر مقفلاً ولا يقدر يخرج، وتبقى جلسته مفتوحة إلى
   الأبد فتُقرأ «نسيان بصمة خروج» عليه هو.

   القراران منفصلان تماماً من الآن:
     • تسجيل الانصراف — **متاح دائماً** ما دامت هناك جلسة مفتوحة. لا يُقفل أبداً.
     • تسجيل الحضور  — محكوم بنافذة الوردية وحده.

   والقفل مرتبط بالوردية لا بساعة ثابتة: بعد المرحلة ٢ صار في الشركة موظفون
   يبدأ دوامهم ٣ العصر، وقفل ثابت على ٤:٠٠ يمنعهم من تسجيل حضورهم أصلاً. */

/* ⚠️⚠️ صراحةً عن حدود هذا القفل — لا تدّعِ غير هذا في أي شاشة:
   كل ما في هذه الكتلة يعمل في **متصفح الموظف**، فهو ترتيب واجهة لا حماية.
   من يفتح أدوات المطوّر يتجاوزه في ثوانٍ.

   الحارس الحقيقي على السيرفر في `match /attendance` هو سقف مطلق ورخيص:
   `d().date == todayKsa() || yesterKsa()` مع `fresh()` — أي لا كتابة في
   الماضي ولا بطابع زمني مزوّر. أما القفل الدقيق حسب نافذة الوردية فلا
   يمكن فرضه في قاعدة: التحقق منه يحتاج `get()` على settings و users في كل
   كتابة حضور، وهي قراءة مفوترة على حساب المالك في كل بصمة لكل موظف.

   ⚠️ وبعد قرار ٢٠٢٦-٠٨-١٣ لم يعد هناك «تسجيل متأخر يُوسم»: النافذة تُغلق
   ولا حضور بعدها. فالتعويض على السيرفر أضعف مما كان — لأن الواجهة صارت
   تمنع أكثر، والسيرفر لم يتغيّر. من يتجاوز الواجهة يسجّل حضوراً في أي وقت
   من يومه، ولا يظهر عليه وسم يفضحه.

   الردّ العملي: الحضور الذي يُحسب عليه المسير **من جهاز البصمة** لا من
   الجوال (مزلق ٧)، وسجلّ الجوال للموقع والصورة. فالتلاعب هنا لا يحرّك
   راتباً بذاته. قوله صراحةً خير من وعد أمني لا سند له. */

/* ═══ حدود النافذة — قرار المالك ٢٠٢٦-٠٨-١٣ ═══

   ⚠️ **هذا القرار يعكس قرار ٢٠٢٦-٠٨-١٢** المسجَّل في CLAUDE.md، فلا تقرأ
   القديم وتظنّه سارياً: كان «الحضور المتأخر مسموح لمن لم يسجّل اليوم إطلاقاً
   وموسوماً lateCheckIn». صار الآن: **بعد النافذة لا تسجيل حضور إطلاقاً.**

   ولماذا: «متأخر جداً» و«حاضر» كانا يدخلان النظام بالفعل نفسه — ضغطة على
   نفس الزرّ — والفرق وسمٌ يقرؤه المدير إن انتبه له. من وصل الثانية ظهراً
   لوردية تبدأ الثامنة لم يداوم يومه، وتسجيلُه «حضوراً» يجعل الرقم يقول
   غير الواقع. الآن يُسجَّل ما جرى فعلاً: انصرافٌ بلا دخول، ويومٌ عليه
   «نسيان بصمة الحضور» يُصحَّح بطلب يعتمده مديره.

   ساعة قبل البداية بدل ساعتين: من يجي بدري يسجّل، والساعتان كانتا تفتحان
   الباب من السادسة صباحاً لوردية الثامنة بلا سبب. */
export const CHECK_IN_EARLY_MIN = 60;

/* ⚠️ من **بداية الوردية** لا من فتح النافذة: أربع ساعات بعد الثامنة تعني
   الثانية عشرة، لا الواحدة. حسابُها من `opensAt` يمدّ المهلة ساعةً زائدة
   بصمت. */
export const CHECK_IN_LATE_MIN = 240;

/* → { opensAt, closesAt } | null   (null = يوم راحة، فلا نافذة ولا قفل) */
export function checkInWindow(baseDate, shift) {
  const win = shiftWindowFor(baseDate, shift);
  if (!win) return null;
  const opensAt = new Date(win.start.getTime() - CHECK_IN_EARLY_MIN * 60000);

  /* ⚠️ الأقرب من الاثنين: بداية الوردية + أربع ساعات، أو نهايتها. وردية
     مدّتها ثلاث ساعات لا تُفتح نافذة حضورها بعد انتهائها بساعة. */
  const byPolicy = new Date(win.start.getTime() + CHECK_IN_LATE_MIN * 60000);
  let closesAt = byPolicy < win.end ? byPolicy : win.end;
  if (shift && shift.checkInCutoff) {
    const c = hmToDate(baseDate, shift.checkInCutoff);
    /* ⚠️ قفل صريح قبل بداية الوردية يخصّ اليوم التالي لا الماضي — وردية
       ٢٢:٠٠–٠٦:٠٠ بقفل ٠٢:٠٠ تعني الثانية فجراً بعد بدايتها، لا قبلها بعشرين ساعة. */
    if (c) closesAt = c <= win.start ? new Date(c.getTime() + 86400000) : c;
  }
  return { opensAt, closesAt };
}

/* → { ok, reason, closesAt, opensAt }

   ⚠️ قرار المالك ٢٠٢٦-٠٨-١٣ — **ناسخٌ لقرار ٢٠٢٦-٠٨-١٢**:
   بعد إغلاق النافذة **لا تسجيل حضور إطلاقاً**، وسواءٌ سجّل اليوم أم لم
   يسجّل. الوسم `lateCheckIn` والمعامل `allowLate` سقطا معاً — لا تُعدهما.

     قبل الفتح          → early   (لم يبدأ وقت التسجيل)
     داخل النافذة       → open
     بعدها ولديه جلسة   → done    (أنهى يومه)
     بعدها بلا جلسة     → missedIn (فاتته البصمة — يُسجَّل انصرافه ويُصحَّح بطلب)

   ⚠️ والفرق بين `done` و`missedIn` ليس تجميلاً: الأول أنهى يومه فلا شيء
   يفعله، والثاني أمامه إجراء — انصرافٌ يُسجَّل الآن وطلب تصحيح بعده. */
export function checkInAllowed(now, shift, opts = {}) {
  const { hasSessionToday = false } = opts;
  const w = checkInWindow(now, shift);

  /* ⚠️ يوم الراحة يبقى مفتوحاً كما هو اليوم. لا نمنع أحداً من العمل في
     يوم راحته — العمل يُسجَّل ويُوسم، والقرار الإداري يأتي بعده لا قبله. */
  if (!w) return { ok: true, reason: 'offDay', closesAt: null };

  if (now < w.opensAt)  return { ok: false, reason: 'early', opensAt: w.opensAt, closesAt: w.closesAt };
  if (now <= w.closesAt) return { ok: true,  reason: 'open',  closesAt: w.closesAt };

  if (hasSessionToday)  return { ok: false, reason: 'done',     closesAt: w.closesAt };
  return { ok: false, reason: 'missedIn', closesAt: w.closesAt };
}

/* ═══ حالة زرّ اللوحة — دالة نقيّة عمداً ═══

   ⚠️ سبب إخراجها من attend-panel.js إلى هنا: الخلل الأصلي كان في هذا القرار
   بالضبط (سطر واحد يعطّل الزر كله بعد الوردية فيحبس من نسي الانصراف)، وكان
   مدفوناً في ملف يجرّ firebase فلا يُختبر في node إطلاقاً. الآن يُختبر.

   ⚠️ الترتيب هنا ليس تجميلاً: الجلسة المفتوحة تُفحص **قبل** أي شرط زمني،
   فلا يوجد فرع واحد يستطيع أن يُعطّل الانصراف. لا تُدخل شرطاً قبلها. */
export function attendButtonState({ loaded, loadErr, hasOpenSession, gate }) {
  if (!loaded) return { kind: 'wait', disabled: true,  label: '… جارٍ التحميل' };
  if (loadErr) return { kind: 'err',  disabled: true,  label: 'تعذّر قراءة حالتك — حدّث الصفحة' };
  if (hasOpenSession) return { kind: 'out', disabled: false, label: 'تسجيل انصراف' };

  if (!gate || !gate.ok) {
    const r = gate && gate.reason;
    /* ⚠️ من فاتته نافذة الحضور ليس بلا إجراء: يُسجَّل انصرافه الآن — وهو ما
       جرى فعلاً — ويحمل يومه «نسيان بصمة الحضور» يُصحَّح بطلب يعتمده مديره.
       تعطيلُ الزرّ عليه يترك اليوم غياباً كاملاً وهو داوم. */
    if (r === 'missedIn') {
      return { kind: 'out-missing', disabled: false, reason: r,
        label: 'تسجيل انصراف', missedIn: true };
    }
    return { kind: 'blocked', disabled: true, reason: r,
      label: r === 'done'  ? 'أنهيت دوامك اليوم'
           : r === 'early' ? 'لم يبدأ وقت التسجيل بعد'
           : 'انتهى وقت تسجيل الحضور لورديتك' };
  }
  return { kind: 'in', disabled: false, label: 'تسجيل حضور' };
}

/* ⚠️ بقيت للتوافق ولا تُستعمل في تعطيل أي زر.
   استعمالها الوحيد المشروع: هل مضى وقت الوردية أصلاً — للعرض لا للمنع.
   من يحتاج قرار «هل يُسمح بتسجيل حضور» يستعمل checkInAllowed() وحدها. */
export function shiftEndPassed() {
  const now = new Date();
  const w = shiftWindowFor(now, myShiftToday(now));
  if (!w) return false;
  return now > new Date(w.end.getTime() + GRACE_AFTER_END_MIN * 60000);
}

/* ═══ أيام الإجازة الفعلية ═══

   ⚠️ كانت في lib/dates.js وتقرأ SETTINGS.shifts وحدها. الآن تمرّ بـ
   resolveShift() فتحترم نفس ترتيب الأولوية الذي يعتمده المسير والتقارير:
     ١) استثناء التاريخ (عطلة رسمية أو دوام خاص)
     ٢) وردية قسم الموظف
     ٣) الوردية الأسبوعية العامة

   الأثر العملي: إجازة تمرّ على عيد رسمي ما عاد يُخصم العيد فيها من رصيد
   الموظف، وعدد الأيام المخصوم صار مطابقاً لعدد الأيام التي يعفيها المسير.

   deptName اختياري — لو لم يُمرَّر يسقط للورديات العامة، وهو سلوك النسخة
   السابقة بالضبط. و emp اختياري كذلك: بتمريره تُحسب أيام الإجازة على خطة
   شفت الموظف نفسه، فمن يوم راحته الثلاثاء لا يُخصم منه الثلاثاء. */
export function workingDaysBetween(a, b, deptName, emp) {
  const start = new Date(a + 'T00:00:00'), end = new Date(b + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return { days: 0, off: 0 };
  let n = 0, off = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const sh = resolveShift(ymd(d), d.getDay(), deptName, emp);
    if (!sh || sh.type === 'off') off++; else n++;
  }
  return { days: Math.max(0, n), off };
}
