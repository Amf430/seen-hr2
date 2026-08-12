/* ═══════════════════════════════════════════════════════════════════════════
   رصيد الإجازات — الاشتقاق الواضح والاستحقاق التدريجي

   ⚠️⚠️ أخطر وحدة في النظام. الرقم الذي تُرجعه هذه الدالة يُقرَّر على أساسه
   هل يستحقّ الموظف إجازته أو لا. خطأ هنا يعطيه أياماً لا يستحقّها أو يسلبه
   أياماً استحقّها — وكلاهما يُكتشف متأخراً وبعد أن يكون قد بنى عليه.

   ── المشكلة التي تحلّها ──
   `user.balances` عدّاد **مختلط**: يبدأ بالرصيد السنوي ثم تنقص منه معاملة
   الاعتماد. فلا يمكن عرض «المستحقّ حتى اليوم» ولا «المحجوز في طلب معلّق»
   ولا «المرحَّل من السنة الماضية» — كلها ذائبة في رقم واحد لا يقول من أين
   جاء. والموظف الذي يرى «١٣ يوماً» لا يعرف هل هي بعد خصم طلبه المعلّق أو لا.

   الحل: فصل **السياسة** عن **الاستهلاك**.
     user.leavePolicy[typeId]  ← يضبطها الأدمن: المستحقّ السنوي وطريقة الاستحقاق
     user.leaveUsed[typeId]    ← المستهلك المعتمَد، تكتبه المعاملة وحدها

   والمتبقّي **يُشتقّ** ولا يُخزَّن، فلا يتباعد رقمان أبداً.

   ⚠️ نقيّة تماماً — لا firebase ولا شبكة — فتُختبر في node. وهذا شرط لا
   ترفٌ في وحدة تقرّر أرصدة الناس.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ⚠️ التقريب لأقرب نصف يوم **لأسفل**.
   لأعلى يمنح يوماً لم يُستحقّ بعد؛ وبلا تقريب يرى الموظف ١٢٫٢٤٩٩٩٩ على
   شاشته. النصف هو أصغر وحدة إجازة يتعامل بها الناس فعلاً. */
export const roundDays = (n) => Math.floor((Number(n) || 0) * 2) / 2;

/* عدد الأشهر المكتملة بين تاريخين.

   ⚠️ «الشهر المكتمل» يُحتسب عند مرور اليوم المقابل من الشهر التالي، لا في
   الأول من كل شهر. موظف بدأ ٢٥ أغسطس لا يستحقّ شهراً كاملاً في ١ سبتمبر —
   يستحقّه في ٢٥ سبتمبر. الحساب بالأول من الشهر يمنح الموظفين الجدد شهراً
   مجانياً كل سنة. */
export function completedMonths(fromYmd, asOfYmd) {
  const a = new Date(fromYmd + 'T00:00:00'), b = new Date(asOfYmd + 'T00:00:00');
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  /* لم يبلغ اليوم المقابل بعد → الشهر الأخير غير مكتمل */
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

const ymdOf = (d) => {
  const x = (d instanceof Date) ? d : new Date(d);
  if (isNaN(x)) return null;
  const p2 = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`;
};

/* ═══ السياسة المؤثّرة لنوع إجازة ═══

   ⚠️ التوافق الخلفي على نمط branchesOf() في geo.js: غياب leavePolicy لا
   يعني «لا سياسة» بل يعني السياسة القديمة مُركَّبة في الذاكرة:
     accrualMode: 'none'  → لا استحقاق تدريجي
     openingBalance       → الرصيد الحالي في user.balances كما هو
   والنتيجة لازم تطابق الرقم المعروض اليوم **بالحرف**. */
export function policyFor(user, type) {
  const stored = user && user.leavePolicy && user.leavePolicy[type.id];
  if (stored) {
    return {
      annualDays:     Number(stored.annualDays) || 0,
      openingBalance: Number(stored.openingBalance) || 0,
      accrualMode:    ['monthly', 'annual', 'none'].includes(stored.accrualMode)
                        ? stored.accrualMode : 'none',
      accrualStart:   stored.accrualStart || '',
      carryOverMax:   Number(stored.carryOverMax) || 0,
      effectiveFrom:  stored.effectiveFrom || '',
      derived: false
    };
  }
  /* الشكل القديم مُركَّباً — لا يُكتب في Firestore */
  const legacy = (user && user.balances && user.balances[type.id] != null)
    ? Number(user.balances[type.id]) : Number(type.balance) || 0;
  return {
    annualDays: Number(type.balance) || 0,
    openingBalance: legacy,
    accrualMode: 'none',
    accrualStart: '', carryOverMax: 0, effectiveFrom: '',
    derived: true
  };
}

/* ═══ leaveBalanceOf ═══

   → { opening, accrued, used, pending, remaining, annualDays, accrualMode,
       asOf, derived, nextAccrualYmd, nextAccrualDays }

   remaining = opening + accrued − used − pending

   ⚠️ `pending` يُحجز ولا يُخصم: الطلب المعلّق يقلّل المتاح للموظف حتى لا
   يقدّم طلبين يتجاوز مجموعهما رصيده، لكنه لا يلمس `leaveUsed`. الرفض يُعيد
   الحجز تلقائياً لأنه مشتقّ لا مخزَّن — وهذا سبب اشتقاقه أصلاً. */
export function leaveBalanceOf(user, type, asOf = new Date(), pendingRequests = []) {
  const pol   = policyFor(user, type);
  const asOfY = ymdOf(asOf) || ymdOf(new Date());

  /* ⚠️ الإجازات غير الخاصمة (deduct: false) لا سياسة لها ولا استحقاق.
     إدخالها في الحساب يعطي «بدون راتب» رصيداً سنوياً لا معنى له. */
  if (!type.deduct) {
    return { opening: 0, accrued: 0, used: 0, pending: 0, remaining: 0,
             annualDays: 0, accrualMode: 'none', asOf: asOfY, derived: pol.derived,
             nextAccrualYmd: null, nextAccrualDays: 0, notDeducted: true };
  }

  const used = Number((user && user.leaveUsed && user.leaveUsed[type.id]) || 0);
  const pending = roundDays((pendingRequests || [])
    .filter((r) => r.leaveTypeId === type.id)
    .reduce((a, r) => a + (Number(r.days) || 0), 0));

  let accrued = 0, nextAccrualYmd = null, nextAccrualDays = 0;

  if (pol.accrualMode === 'annual') {
    accrued = pol.annualDays;
  } else if (pol.accrualMode === 'monthly') {
    /* البداية: accrualStart إن وُجد، وإلا تاريخ المباشرة */
    const start = pol.accrualStart || (user && user.hireDate) || '';
    if (start) {
      const months = Math.min(12, completedMonths(start, asOfY));
      accrued = roundDays(pol.annualDays * (months / 12));
      /* ⚠️ «متى يزيد رصيدك» تُلغي نصف أسئلة الموارد البشرية. تُحسب هنا لا
         في الواجهة حتى لا تتباعد عن الرقم الذي بجانبها. */
      if (months < 12) {
        const s = new Date(start + 'T00:00:00');
        const nxt = new Date(s);
        nxt.setMonth(s.getMonth() + months + 1);
        nextAccrualYmd  = ymdOf(nxt);
        nextAccrualDays = roundDays(pol.annualDays * ((months + 1) / 12)) - accrued;
      }
    }
  }
  /* 'none' → لا استحقاق تدريجي، والرصيد كله في opening (سلوك اليوم) */

  const remaining = roundDays(pol.openingBalance + accrued - used - pending);

  return {
    opening: roundDays(pol.openingBalance),
    accrued: roundDays(accrued),
    used: roundDays(used),
    pending,
    remaining: Math.max(0, remaining),
    /* ⚠️ الرصيد السالب يُعرض للأدمن ولا يُخفى: قصّه عند الصفر في العرض
       الإداري يُخفي خطأ إدخال بدل أن يكشفه. */
    rawRemaining: remaining,
    annualDays: pol.annualDays,
    accrualMode: pol.accrualMode,
    asOf: asOfY,
    derived: pol.derived,
    nextAccrualYmd, nextAccrualDays
  };
}

/* كل الأنواع الخاصمة لموظف واحد */
export function allBalancesOf(user, leaveTypes, asOf = new Date(), pending = []) {
  return (leaveTypes || []).filter((t) => t.deduct)
    .map((t) => ({ type: t, ...leaveBalanceOf(user, t, asOf, pending) }));
}

/* ═══ الترحيل السنوي ═══

   ⚠️ لا يُنفَّذ تلقائياً في الخلفية أبداً. إسقاط أيام إجازة من رصيد إنسان
   قرارٌ لا يُتخذ بلا موافقة صريحة، فهذه الدالة **تحسب المعاينة فقط**
   والأدمن هو من يضغط التنفيذ بعد أن يرى الجدول.

   carryOverMax = 0 يعني «لا ترحيل» — كل المتبقّي يسقط. */
export function carryOverPreview(user, type, asOf = new Date(), pending = []) {
  const pol = policyFor(user, type);
  const bal = leaveBalanceOf(user, type, asOf, pending);
  const keep = Math.min(bal.remaining, pol.carryOverMax);
  return {
    before: bal.remaining,
    carried: roundDays(keep),
    dropped: roundDays(bal.remaining - keep),
    carryOverMax: pol.carryOverMax
  };
}

/* ═══ جدول المعاينة قبل أي تطبيق ═══

   ⚠️ شرط المالك المكتوب: «لا تُطبَّق أي سياسة أو ترحيل رصيد قبل عرض جدول
   معاينة يقارن رصيد كل موظف قبل وبعد». هذه الدالة تبني ذلك الجدول ولا
   تكتب شيئاً إطلاقاً. */
export function migrationPreview(users, leaveTypes, asOf = new Date(), pendingByUid = {}) {
  const types = (leaveTypes || []).filter((t) => t.deduct);
  return (users || []).filter((u) => u.role !== 'admin').map((u) => ({
    uid: u.id, name: u.name, department: u.department || '',
    rows: types.map((t) => {
      /* الرقم المعروض اليوم — من العدّاد المختلط القديم */
      const before = (u.balances && u.balances[t.id] != null)
        ? Number(u.balances[t.id]) : Number(t.balance) || 0;
      const after = leaveBalanceOf(u, t, asOf, pendingByUid[u.id] || []);
      return {
        typeId: t.id, label: t.label,
        before: roundDays(before),
        after: after.remaining,
        delta: roundDays(after.remaining - before),
        derived: after.derived
      };
    })
  }));
}

/* هل تختلف نتيجة النموذج الجديد عن المعروض اليوم لأي موظف؟
   ⚠️ تُستعمل لتلوين الجدول: صفر فروق يعني أن التطبيق آمن تماماً. */
export function previewHasChanges(preview) {
  return (preview || []).some((p) => p.rows.some((r) => r.delta !== 0));
}
