/* ═══════════════════════════════════════════════════════════════════════════
   نبض اللوحة — حسبات نقيّة تُغذّي لوحة القيادة.

   ⚠️ ملف مستقلّ عن hr-stats.js عمداً: تلك تستورد attendance.js التي تجرّ
   Firebase من CDN وقت الاستيراد، فلا تعمل في node إطلاقاً ولا تُختبر. وهذه
   الحسبات تقرّر ما يراه المالك على أول شاشة — فتُختبر.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ymd } from './dates.js';

/* ═══ سلسلة يومية: كم موظفاً سجّل حضوره كل يوم في النافذة ═══

   تُغذّي خطّ الاتجاه في بطاقة الحضور. الرقم وحده يقول «اليوم ٨٧٪» ولا يقول
   أصاعد هو أم هابط، وهذه هي السلسلة التي تقوله.

   ⚠️ العدّ بالموظفين لا بالسجلات: للموظف مصدرا حضور مستقلّان (الجوال وجهاز
   البصمة) ولا يُغني أحدهما عن الآخر، فقد يكون له سجلّان في اليوم — وعدّ
   السجلات يضاعفه. المفتاح employeeUid داخل مجموعة كل يوم.

   ⚠️ الأيام الفارغة تبقى بصفر ولا تُحذف: حذفها يجعل عطلة نهاية الأسبوع
   تختفي فيلتصق الخميس بالأحد، ويُقرأ الخطّ كأن الدوام متّصل. */
export function dailySeries(records, win) {
  const start = new Date(win.start); start.setHours(0, 0, 0, 0);
  const end = new Date(win.end); end.setHours(0, 0, 0, 0);
  const byDay = new Map();
  for (const r of records || []) {
    if (!r?.date) continue;
    if (!byDay.has(r.date)) byDay.set(r.date, new Set());
    if (r.employeeUid) byDay.get(r.date).add(r.employeeUid);
  }
  const out = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = ymd(d);
    out.push({ date: key, count: byDay.get(key)?.size || 0, dow: d.getDay() });
  }
  return out;
}

/* ═══ ذكرى الالتحاق اليوم ═══
   يقابل «Work anniversary» في مرجع التصميم.

   ⚠️ لا أعياد ميلاد: لا يوجد حقل تاريخ ميلاد في وثيقة الموظف إطلاقاً. إضافته
   تعني حقلاً جديداً وقاعدةً تحرسه وسقفاً له — وليست مسألة عرض.

   ⚠️ المقارنة بالشهر واليوم من النصّ مباشرةً لا بكائن Date: تحويل «2019-04-19»
   إلى Date يفسّره UTC، فمن التحق يوم ١٩ يظهر يوم ١٨ لمن يقرأ بتوقيت الرياض.

   ⚠️ من التحق اليوم نفسه ليست له ذكرى (صفر سنوات)، والموقوف لا يُهنَّأ. */
export function anniversariesToday(users, todayYmd) {
  const t = String(todayYmd || '');
  const md = t.slice(5, 10);
  if (md.length !== 5) return [];
  return (users || [])
    .filter((u) => u && u.status !== 'suspended' && typeof u.hireDate === 'string' &&
                   u.hireDate.length >= 10 && u.hireDate.slice(5, 10) === md)
    .map((u) => ({ user: u, years: +t.slice(0, 4) - +u.hireDate.slice(0, 4) }))
    .filter((x) => Number.isFinite(x.years) && x.years > 0)
    .sort((a, b) => b.years - a.years);
}
