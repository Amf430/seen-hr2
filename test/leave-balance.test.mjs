/* ═══════════════════════════════════════════════════════════════════════════
   رصيد الإجازات (المرحلة ٨)

   ⚠️⚠️ أخطر مجموعة اختبارات في المشروع. الرقم الذي تحرسه هذه الملفات يقرّر
   هل يستحقّ موظف إجازته. أي اختبار يسقط هنا يعني رصيداً خاطئاً في يد إنسان.

   ⚠️ والاختبار الأهم ليس أن الجديد يعمل، بل أن **موظفاً بلا leavePolicy
   يطابق سلوك اليوم بالحرف** — فالنظام يشتغل يوم النشر بلا لمس وثيقة واحدة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { leaveBalanceOf, allBalancesOf, policyFor, completedMonths, roundDays,
         carryOverPreview, migrationPreview, previewHasChanges } from '../js/lib/leave-balance.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}` +
    (ok ? '' : `\n      توقّعنا ${e}\n      وجاء   ${a}`));
};
const group = (t) => console.log(`\n\x1b[1m═══ ${t} ═══\x1b[0m`);

const ANNUAL = { id: 'annual', label: 'إجازة سنوية', balance: 21, deduct: true };
const UNPAID = { id: 'unpaid', label: 'بدون راتب',   balance: 0,  deduct: false };
const D = (s) => new Date(s + 'T00:00:00');

/* ═══════════ ١. التوافق الخلفي — الأهم ═══════════ */
group('١. موظف بلا leavePolicy يطابق سلوك اليوم');

const legacy = { id: 'u1', name: 'سالم', hireDate: '2025-01-01', balances: { annual: 13 } };
const lb = leaveBalanceOf(legacy, ANNUAL, D('2026-08-12'));

eq('⚠️ المتبقّي هو نفسه الرقم المعروض اليوم', 13, lb.remaining);
eq('ولا استحقاق تدريجي يُخترع',                'none', lb.accrualMode);
eq('والسياسة مُشتقّة لا مخزَّنة',                true, lb.derived);
eq('والمستهلك صفر (لا leaveUsed بعد)',          0, lb.used);
eq('موظف بلا رصيد إطلاقاً يأخذ رصيد النوع',
   21, leaveBalanceOf({ id: 'u2' }, ANNUAL, D('2026-08-12')).remaining);

/* ⚠️ الإجازة غير الخاصمة لا سياسة لها — إدخالها يعطي «بدون راتب» رصيداً */
eq('⚠️ الإجازة غير الخاصمة تُتجاهَل كلياً',
   { remaining: 0, notDeducted: true },
   (() => { const b = leaveBalanceOf(legacy, UNPAID, D('2026-08-12'));
            return { remaining: b.remaining, notDeducted: b.notDeducted }; })());

/* ═══════════ ٢. الأشهر المكتملة ═══════════ */
group('٢. الشهر المكتمل — لا الأول من الشهر');

eq('من ٢٥ أغسطس إلى ٢٤ سبتمبر = صفر أشهر',  0, completedMonths('2025-08-25', '2025-09-24'));
eq('⚠️ وإلى ٢٥ سبتمبر = شهر واحد',            1, completedMonths('2025-08-25', '2025-09-25'));
eq('⚠️ وإلى ١ سبتمبر = صفر لا شهر',           0, completedMonths('2025-08-25', '2025-09-01'));
eq('سنة كاملة = ١٢',                         12, completedMonths('2025-01-01', '2026-01-01'));
eq('قبل تاريخ البداية = صفر لا سالب',          0, completedMonths('2026-01-01', '2025-01-01'));
eq('تاريخ فاسد = صفر',                        0, completedMonths('لا شيء', '2026-01-01'));

/* ═══════════ ٣. التقريب ═══════════ */
group('٣. التقريب لأقرب نصف يوم لأسفل');

eq('١٢٫٢٥ → ١٢',    12,   roundDays(12.25));
eq('١٢٫٥ تبقى',      12.5, roundDays(12.5));
eq('١٢٫٧٥ → ١٢٫٥',   12.5, roundDays(12.75));
eq('⚠️ لا تقريب لأعلى — لا يُمنح يوم لم يُستحقّ', 12.5, roundDays(12.99));
eq('الصفر صفر',      0,    roundDays(0));

/* ═══════════ ٤. الاستحقاق التدريجي ═══════════ */
group('٤. الاستحقاق الشهري');

const monthly = {
  id: 'u3', name: 'نورة', hireDate: '2026-01-01',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 5, accrualMode: 'monthly',
                           accrualStart: '2026-01-01', carryOverMax: 10 } },
  leaveUsed: { annual: 3 }
};
const m7 = leaveBalanceOf(monthly, ANNUAL, D('2026-08-01'));
eq('سبعة أشهر مكتملة من ٢١ يوماً = ١٢٫٢٥ → ١٢', 12, m7.accrued);
eq('الرصيد الافتتاحي كما ضُبط',                  5, m7.opening);
eq('المستهلك من leaveUsed',                      3, m7.used);
eq('المتبقّي = ٥ + ١٢ − ٣',                      14, m7.remaining);
eq('⚠️ ويُعلَن متى يزيد الرصيد',                  '2026-09-01', m7.nextAccrualYmd);
/* ⚠️ الزيادة المعلَنة ليست ثابتة (١٫٧٥ شهرياً) وهذا مقصود لا خلل:
   التقريب لنصف يوم لأسفل يجعل الرصيد يقفز ١٢ → ١٤ بين الشهرين السابع
   والثامن، ثم ١٤ → ١٥٫٥ بعده. المعلَن هو الفرق الحقيقي الذي سيراه الموظف
   على شاشته، لا المعدّل النظري — ووعدُه بـ١٫٧٥ ثم إعطاؤه ٢ يفقده الثقة
   بالرقمين معاً. */
eq('وبكم يزيد فعلاً (لا بالمعدّل النظري)',         2, m7.nextAccrualDays);
eq('والقفزة التالية تختلف عنها',                 1.5,
   leaveBalanceOf(monthly, ANNUAL, D('2026-09-01')).nextAccrualDays);

eq('السنة المكتملة تعطي المستحقّ كاملاً',
   21, leaveBalanceOf(monthly, ANNUAL, D('2027-01-01')).accrued);
eq('⚠️ ولا تتجاوزه بعد سنتين',
   21, leaveBalanceOf(monthly, ANNUAL, D('2028-01-01')).accrued);
eq('وبعد اكتمالها لا يُعلَن استحقاق قادم',
   null, leaveBalanceOf(monthly, ANNUAL, D('2027-06-01')).nextAccrualYmd);

/* الدفعة الواحدة */
const annualMode = { id: 'u4', hireDate: '2026-06-01',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 0, accrualMode: 'annual' } } };
eq('accrualMode=annual يمنح المستحقّ كاملاً فوراً',
   21, leaveBalanceOf(annualMode, ANNUAL, D('2026-06-02')).accrued);

/* ⚠️ موظف عُيّن منتصف السنة */
group('٤-ب. موظف عُيّن منتصف السنة');
const midYear = { id: 'u5', hireDate: '2026-07-01',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 0, accrualMode: 'monthly' } } };
eq('⚠️ بلا accrualStart يُرجَع لتاريخ المباشرة',
   1.5, leaveBalanceOf(midYear, ANNUAL, D('2026-08-01')).accrued);
eq('ولا يُمنح رصيد سنة كاملة في شهره الأول',
   1.5, leaveBalanceOf(midYear, ANNUAL, D('2026-08-01')).remaining);
eq('وقبل اكتمال شهره الأول لا شيء',
   0, leaveBalanceOf(midYear, ANNUAL, D('2026-07-20')).accrued);

/* ═══════════ ٥. الطلب المعلّق يحجز ولا يخصم ═══════════ */
group('٥. الحجز مقابل الخصم');

const pend = [{ leaveTypeId: 'annual', days: 3 }];
const withPend = leaveBalanceOf(monthly, ANNUAL, D('2026-08-01'), pend);
eq('الطلب المعلّق يُحجز',            3, withPend.pending);
eq('ويقلّل المتبقّي',                11, withPend.remaining);
eq('⚠️ ولا يلمس المستهلك',           3, withPend.used);
eq('⚠️ والرفض يُعيد الحجز تلقائياً لأنه مشتقّ لا مخزَّن',
   14, leaveBalanceOf(monthly, ANNUAL, D('2026-08-01'), []).remaining);
eq('الطلبات المعلّقة لأنواع أخرى لا تُحسب',
   14, leaveBalanceOf(monthly, ANNUAL, D('2026-08-01'), [{ leaveTypeId: 'sick', days: 5 }]).remaining);

/* ═══════════ ٦. الرصيد السالب ═══════════ */
group('٦. الرصيد السالب يُكشف للأدمن ولا يُخفى');

const over = { id: 'u6',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 2, accrualMode: 'none' } },
  leaveUsed: { annual: 9 } };
const ob = leaveBalanceOf(over, ANNUAL, D('2026-08-12'));
eq('المعروض للموظف لا ينزل تحت الصفر',  0, ob.remaining);
eq('⚠️ لكن الرقم الحقيقي محفوظ للأدمن', -7, ob.rawRemaining);

/* ═══════════ ٧. الترحيل السنوي ═══════════ */
group('٧. الترحيل — معاينة لا تنفيذ');

const carry = { id: 'u7',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 18, accrualMode: 'none', carryOverMax: 10 } },
  leaveUsed: { annual: 0 } };
eq('يُرحَّل حتى السقف ويسقط الباقي',
   { before: 18, carried: 10, dropped: 8 },
   (() => { const c = carryOverPreview(carry, ANNUAL, D('2026-12-31'));
            return { before: c.before, carried: c.carried, dropped: c.dropped }; })());

const noCarry = { id: 'u8',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 6, accrualMode: 'none', carryOverMax: 0 } } };
eq('⚠️ سقف صفر = لا ترحيل، كل المتبقّي يسقط',
   { carried: 0, dropped: 6 },
   (() => { const c = carryOverPreview(noCarry, ANNUAL, D('2026-12-31'));
            return { carried: c.carried, dropped: c.dropped }; })());

const under = { id: 'u9',
  leavePolicy: { annual: { annualDays: 21, openingBalance: 4, accrualMode: 'none', carryOverMax: 10 } } };
eq('المتبقّي تحت السقف يُرحَّل كاملاً بلا إسقاط',
   { carried: 4, dropped: 0 },
   (() => { const c = carryOverPreview(under, ANNUAL, D('2026-12-31'));
            return { carried: c.carried, dropped: c.dropped }; })());

/* ═══════════ ٨. جدول المعاينة قبل أي تطبيق ═══════════

   ⚠️ شرط المالك: لا يُطبَّق شيء قبل أن يرى هذا الجدول. */
group('٨. معاينة الترحيل — قبل/بعد');

const staff = [
  { id: 'a', name: 'سالم', role: 'employee', department: 'المبيعات', balances: { annual: 13 } },
  { id: 'b', name: 'نورة', role: 'employee', department: 'المالية',
    hireDate: '2026-01-01', balances: { annual: 21 },
    leavePolicy: { annual: { annualDays: 21, openingBalance: 5, accrualMode: 'monthly',
                             accrualStart: '2026-01-01' } },
    leaveUsed: { annual: 3 } },
  { id: 'z', name: 'المدير', role: 'admin', balances: { annual: 30 } }
];
const prev = migrationPreview(staff, [ANNUAL, UNPAID], D('2026-08-01'));

eq('⚠️ الأدمن خارج الجدول',              2, prev.length);
eq('⚠️ والإجازة غير الخاصمة خارج الأعمدة', 1, prev[0].rows.length);
eq('من بلا سياسة: لا فرق إطلاقاً',
   { before: 13, after: 13, delta: 0 },
   (() => { const r = prev[0].rows[0]; return { before: r.before, after: r.after, delta: r.delta }; })());
eq('ومن له سياسة: الفرق ظاهر بالرقم',
   { before: 21, after: 14, delta: -7 },
   (() => { const r = prev[1].rows[0]; return { before: r.before, after: r.after, delta: r.delta }; })());

eq('الجدول يعلن أن فيه فروقاً', true, previewHasChanges(prev));
eq('⚠️ وجدول بلا فروق يعلن أن التطبيق آمن', false,
   previewHasChanges(migrationPreview([staff[0]], [ANNUAL], D('2026-08-01'))));

/* ═══════════ ٩. كل الأنواع لموظف ═══════════ */
group('٩. كل الأنواع دفعةً');
const all = allBalancesOf(monthly, [ANNUAL, UNPAID], D('2026-08-01'));
eq('الخاصمة وحدها تُرجَع', 1, all.length);
eq('ومعها نوعها للعرض', 'إجازة سنوية', all[0].type.label);

/* ═══════════ ١٠. السياسة المؤثّرة ═══════════ */
group('١٠. قراءة السياسة');
eq('accrualMode غير معروف يسقط إلى none',
   'none', policyFor({ leavePolicy: { annual: { accrualMode: 'حسب المزاج' } } }, ANNUAL).accrualMode);
eq('السياسة المخزَّنة ليست مُشتقّة',
   false, policyFor({ leavePolicy: { annual: { annualDays: 21 } } }, ANNUAL).derived);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
