/* ═══════════════════════════════════════════════════════════════════════════
   التنسيق — أرقام، تواريخ، مدد. وحدة طرفية.
   ═══════════════════════════════════════════════════════════════════════════ */

export const p2 = (n) => String(n).padStart(2, '0');

/* المبالغ: خانتان عشريتان دائماً، بأرقام لاتينية ليسهل نسخها لملفات Excel */
export const money = (n) =>
  (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* الدقائق كنص عربي: 95 → «1س 35د» */
export const hhmm = (m) => {
  m = Math.round(Math.max(0, m || 0));
  return `${Math.floor(m / 60)}س ${m % 60}د`;
};

/* الثواني كساعة رقمية: 3725 → «01:02:05» */
export function fmtDur(secs) {
  secs = Math.max(0, secs | 0);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return `${p2(h)}:${p2(m)}:${p2(s)}`;
}

/* تاريخ ميلادي بالتقويم العربي */
export function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x)) return '—';
  return x.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/* ═══ التحية حسب الساعة ═══
   تفتح لوحة الأدمن بجملة بشرية بدل صفّ إداري. الحدود بتوقيت الرياض لأن
   التاريخ المُمرَّر محلّي، والنظام كلّه يعمل على UTC+3.
   ⚠️ «مساء الخير» تبدأ من الثانية عشرة ظهراً لا من السادسة: العربية لا تعرف
   «بعد الظهر» تحيةً، وقول «صباح الخير» في الثالثة عصراً خطأ صريح. */
export function greeting(d = new Date()) {
  const h = new Date(d).getHours();
  if (h < 5)  return 'مساء الخير';
  if (h < 12) return 'صباح الخير';
  return 'مساء الخير';
}

/* الاسم الأول وحده — «ريم الأحمد» تصير «ريم».
   التحية بالاسم الكامل تبدو رسميةً كخطاب لا كتحية. */
export function firstName(full) {
  return String(full ?? '').trim().split(/\s+/)[0] || '';
}

/* ═══ الأحرف الأولى للصورة الرمزية ═══
   «ريم الأحمد» ← «را». كلمتان لا أكثر: ثلاثة أحرف لا تسع دائرة ٣٢px.
   ⚠️ «عبد الله بن سعود» ← «عب» لا «عا»: الكلمة الثانية «الله» تبدأ بـ«ا»
   التعريف، فتُسقط أداة التعريف من الكلمة الثانية فصاعداً. */
export function initials(full) {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '؟';
  const strip = (w) => (w.length > 2 && w.startsWith('ال') ? w.slice(2) : w);
  const a = words[0][0] || '';
  const b = words.length > 1 ? (strip(words[1])[0] || '') : '';
  return (a + b) || '؟';
}

/* ═══ درجة لون ثابتة من الاسم ═══
   نفس الاسم يعطي نفس اللون في كل شاشة وكل جلسة — الصورة الرمزية علامةُ تعرّف،
   ولون يتغيّر مع كل عرض يُبطل الغرض.
   ⚠️ مشتقّة من الاسم لا من الترتيب في القائمة: الترتيب يتغيّر بالفرز والبحث. */
export function hueOf(str) {
  const s = String(str ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/* ═══ العدّ العربي ═══
   «٣ موظف في 2 أقسام» عربية مكسورة. الصحيح «٣ موظفين في قسمين».

   ⚠️ العربية ثلاثة أعداد لا اثنان: مفرد، ومثنّى، وجمع — والجمع نفسه ينقسم
   إلى جمع قلّة (٣–١٠) وجمع كثرة (١١+) الذي يعود للمفرد المنصوب.
   forms = [مفرد، مثنّى، جمع]. */
export function plural(n, forms) {
  const [one, two, many] = forms;
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${many}`;
  return `${n} ${one}`;
}

/* اسم اليوم والتاريخ — لرأس الصفحة وحده */
export function fmtDayDate(d = new Date()) {
  const x = new Date(d);
  if (isNaN(x)) return '—';
  return x.toLocaleDateString('ar-SA-u-ca-gregory',
    { weekday: 'long', day: 'numeric', month: 'long' });
}

/* طابع زمني من Firestore أو Date → تاريخ ووقت */
export function fmtDT(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ar-SA-u-ca-gregory', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

/* الوقت فقط: «08:15» */
export function hm(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return '';
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/* طابع Firestore أو نص أو Date → Date (أو null) */
export function tsToDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? null : d;
}

/* المسافة بصيغة مقروءة: 250 → «250 م» · 1400 → «1.4 كم» */
export function fmtDist(m) {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
}
