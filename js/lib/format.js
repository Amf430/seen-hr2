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
