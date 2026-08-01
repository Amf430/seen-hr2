/* ═══════════════════════════════════════════════════════════════════════════
   التواريخ والدورة الشهرية.

   ⚠️ cycleOf منقولة حرفياً من النسخة القديمة (السطور 356-366). الدورة تبدأ
   يوم 26 وتنتهي 25 من الشهر التالي، وكل تقارير الرواتب مبنية عليها — أي
   تعديل هنا يغيّر رواتب الناس بصمت. لا تُعاد صياغتها.
   ═══════════════════════════════════════════════════════════════════════════ */


export const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                          'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
export const AR_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

export const STATUS_AR = {
  pending:   'تحت المراجعة',
  approved:  'تمت الموافقة',
  rejected:  'مرفوض',
  cancelled: 'ملغي'
};

/* تاريخ بصيغة YYYY-MM-DD حسب التوقيت المحلي */
export function ymd(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/* ═══ الدورة الشهرية: من 26 إلى 25 — منقولة حرفياً ═══ */
export function cycleOf(dateInput) {
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  let startY = d.getFullYear(), startM = d.getMonth();
  if (d.getDate() < 26) { startM -= 1; if (startM < 0) { startM = 11; startY -= 1; } }
  const start = new Date(startY, startM, 26, 0, 0, 0, 0);
  let endM = startM + 1, endY = startY; if (endM > 11) { endM = 0; endY += 1; }
  const end = new Date(endY, endM, 25, 23, 59, 59, 999);
  const key = `${startY}-${String(startM + 1).padStart(2, '0')}`;
  const label = `26 ${AR_MONTHS[startM]} ← 25 ${AR_MONTHS[endM]} ${endY}`;
  return { start, end, key, label, nextReset: new Date(endY, endM, 26) };
}

/* آخر n دورة، الأحدث أولاً */
export function recentCyclesList(n = 12) {
  const arr = [];
  let d = new Date();
  for (let i = 0; i < n; i++) {
    const c = cycleOf(d);
    arr.push(c);
    d = new Date(c.start);
    d.setDate(d.getDate() - 1);
  }
  return arr;
}

/* تاريخ الحدث الفعلي للطلب — لا تاريخ تقديمه.
   للاستئذان: تاريخه. للإجازة: تاريخ بدايتها. */
export function reqEventDate(r) {
  const s = r.type === 'permission' ? r.date : r.startDate;
  if (s) return new Date(s + 'T00:00:00');
  return (r.createdAt && r.createdAt.toDate) ? r.createdAt.toDate() : new Date();
}

export function requestsInCycle(cycle, requests) {
  return requests.filter((r) => {
    const d = reqEventDate(r);
    return d >= cycle.start && d <= cycle.end;
  });
}

/* «08:30» على يوم معيّن → Date */
export function hmToDate(base, hhmmStr) {
  if (!hhmmStr) return null;
  const [h, m] = hhmmStr.split(':').map(Number);
  const x = new Date(base);
  x.setHours(h, m, 0, 0);
  return x;
}


/* عدد الأيام المتبقية على انتهاء العقد (سالب = منتهٍ) */
export function contractDaysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

/* ترتيب تنازلي حسب وقت الإنشاء */
export function sortByCreated(arr) {
  return arr.sort((a, b) => {
    const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now();
    const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now();
    return tb - ta;
  });
}
