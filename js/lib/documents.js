/* ═══════════════════════════════════════════════════════════════════════════
   سجل مستندات الموظف وتواريخ انتهائها.

   ── لماذا ليس Firebase Storage ──
   منذ أكتوبر ٢٠٢٤ لا يُفعَّل Storage إلا على خطة Blaze المدفوعة — حتى داخل
   الحصة المجانية. فرفع ملف العقد أو الإقامة إلى مشروعنا غير ممكن اليوم بلا
   بطاقة ائتمان.

   ── ما يفعله هذا الملف بدلاً منه ──
   ما يهمّ فعلاً ليس حفظ الملف، بل **ألّا تنتهي الإقامة دون أن ينتبه أحد** —
   وهذه غرامة نظامية، لا إزعاج. فالسجل هنا يخزّن البيانات الوصفية:
   النوع والرقم وتاريخ الانتهاء ورابطاً اختيارياً للملف حيث هو مرفوع أصلاً
   (Drive أو نظام الأرشيف). التنبيه هو المنتج، لا الملف.

   ── لماذا مصفوفة على وثيقة الموظف لا مجموعة مستقلة ──
   المستندات تُقرأ دائماً مع الموظف ولا تُستعلم وحدها أبداً، وعددها لكل موظف
   بالعشرات لا الآلاف. مجموعة مستقلة تعني قراءة إضافية لكل موظف في لوحة
   القيادة (٣٧ موظفاً = ٣٧ استعلاماً كل فتح)، ومصفوفة تعني صفراً.

   ⚠️ السقف ١٢ مستنداً: القاعدة تفرضه أيضاً. وثيقة Firestore حدّها ١ ميغابايت،
   ومصفوفة بلا سقف على وثيقة يقرأها الجميع تصير تكلفة على كل قراءة.

   ⚠️ وحدة طرفية عمداً: لا تستورد firebase ولا audit. الكتابة تعيش في
   users.js مع بقية الكتابات على وثيقة الموظف. الفائدة ليست تنظيمية فقط —
   بهذا تُختبر دوال التواريخ هنا بـ `node` مباشرة بلا محاكي ولا شبكة، وهو ما
   يفعله documents.test.mjs.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getUsers } from './state.js';
import { contractDaysLeft } from './dates.js';
import { uid as randId } from './dom.js';

export const MAX_DOCS = 12;

/* الأنواع التي لها تاريخ انتهاء يستحق التنبيه، وتلك التي لا تنتهي.
   `warn` عدد أيام التنبيه المبكّر — الإقامة تحتاج مهلة أطول من بطاقة
   التأمين لأن تجديدها يمرّ بجوازات ومكتب عمل. */
export const DOC_KINDS = [
  { id: 'iqama',     label: 'الإقامة',            expires: true,  warn: 60 },
  { id: 'workPermit',label: 'رخصة العمل',         expires: true,  warn: 60 },
  { id: 'passport',  label: 'جواز السفر',         expires: true,  warn: 90 },
  { id: 'nationalId',label: 'الهوية الوطنية',      expires: true,  warn: 45 },
  { id: 'contract',  label: 'عقد العمل',          expires: true,  warn: 60 },
  { id: 'health',    label: 'الشهادة الصحية',      expires: true,  warn: 30 },
  { id: 'insurance', label: 'التأمين الطبي',       expires: true,  warn: 30 },
  { id: 'license',   label: 'رخصة القيادة',       expires: true,  warn: 30 },
  { id: 'degree',    label: 'المؤهل العلمي',       expires: false, warn: 0  },
  { id: 'cert',      label: 'شهادة / دورة',        expires: false, warn: 0  },
  { id: 'offer',     label: 'خطاب التعيين',        expires: false, warn: 0  },
  { id: 'other',     label: 'أخرى',               expires: true,  warn: 30 }
];

export const kindOf  = (id) => DOC_KINDS.find((k) => k.id === id) || DOC_KINDS[DOC_KINDS.length - 1];
export const kindLabel = (id) => kindOf(id).label;

/* حالة مستند واحد — نفس حساب العقد، فلا منطقان لتاريخين */
export function docStatus(d) {
  const k = kindOf(d.kind);
  if (!k.expires || !d.expiresOn) return { state: 'none', left: null, warn: k.warn };
  const left = contractDaysLeft(d.expiresOn);
  if (left === null) return { state: 'none', left: null, warn: k.warn };
  if (left < 0)        return { state: 'expired', left, warn: k.warn };
  if (left <= k.warn)  return { state: 'soon',    left, warn: k.warn };
  return { state: 'ok', left, warn: k.warn };
}

export const docsOf = (u) => Array.isArray(u?.documents) ? u.documents : [];

/* ═══ التنبيهات على مستوى الشركة ═══
   يُبنى من نفس ذاكرة المستخدمين التي تملكها لوحة القيادة — بلا استعلام. */
export function expiringDocs(users = getUsers()) {
  const expired = [], soon = [];
  for (const u of users) {
    if (u.status === 'suspended') continue;
    for (const d of docsOf(u)) {
      const st = docStatus(d);
      if (st.state === 'expired') expired.push({ u, d, ...st });
      else if (st.state === 'soon') soon.push({ u, d, ...st });
    }
  }
  const byLeft = (a, b) => a.left - b.left;
  return { expired: expired.sort(byLeft), soon: soon.sort(byLeft) };
}

/* أسوأ حالة مستند لموظف — لعمود واحد في جدول الموظفين */
export function worstDocState(u) {
  let worst = null;
  for (const d of docsOf(u)) {
    const st = docStatus(d);
    if (st.state === 'expired') return { ...st, d };
    if (st.state === 'soon' && (!worst || st.left < worst.left)) worst = { ...st, d };
  }
  return worst;
}

/* ═══ التطبيع قبل الحفظ ═══
   القاعدة تسمح للأدمن وحده بالكتابة على `documents` وتفرض السقف. القصّ هنا
   يمنع رفضاً محيّراً بعد أن يلصق الأدمن نصاً طويلاً.

   الكتابة نفسها في users.js — هذه الوحدة طرفية. */
const LIMITS = { number: 40, note: 200, link: 500, label: 60 };

export const normalizeDocs = (list) => (list || []).slice(0, MAX_DOCS).map((d) => ({
  id:        d.id || randId(),
  kind:      kindOf(d.kind).id,
  label:     String(d.label  || '').trim().slice(0, LIMITS.label),
  number:    String(d.number || '').trim().slice(0, LIMITS.number),
  issuedOn:  d.issuedOn  || '',
  expiresOn: d.expiresOn || '',
  link:      String(d.link || '').trim().slice(0, LIMITS.link),
  note:      String(d.note || '').trim().slice(0, LIMITS.note)
}));
