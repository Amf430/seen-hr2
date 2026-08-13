/* ═══════════════════════════════════════════════════════════════════════════
   كشف حضور الموظف — تحويل صفوف buildDailyStatus إلى شبكة شهر وملخّص.

   ⚠️ وحدة نقيّة مستقلّة عن attendance.js: تلك تجرّ Firebase من CDN فلا تعمل
   في node. هذه تأخذ الصفوف جاهزةً وتُعيد ترتيبها — فتُختبر.

   ⚠️ لا تحسب حالة يوم ولا تقرّر تأخيراً: buildDailyStatus وحدها تفعل ذلك،
   وهي نفسها التي يعتمدها المسير. أي حسبة ثانية هنا تعني رقمين مختلفين لنفس
   الموظف في شاشتين — وهو ما تمنعه قاعدة «حسبة واحدة في مكان واحد».
   ═══════════════════════════════════════════════════════════════════════════ */

const p2 = (n) => String(n).padStart(2, '0');

/* ═══ شبكة الشهر ═══
   → { year, month, label, lead, cells: [{ date, day, cls, inAt, outAt, isToday }] }

   ⚠️ lead هو عدد الخانات الفارغة قبل اليوم الأول — الأسبوع يبدأ الأحد في
   التقويم السعودي (getDay()===0)، فلا إزاحة إضافية.

   ⚠️ الأيام التي لا صفّ لها (عطلة، أو قبل التحاق الموظف) تُرجع cls:'' لا
   'absent': الغياب حكمٌ يُخصم عليه، وغيابُ السجل ليس غياباً. */
export function monthGridOf(rows, year, month, todayYmd = '') {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const byDate = new Map();
  for (const r of rows || []) if (r?.dateStr) byDate.set(r.dateStr, r);

  const cells = [];
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${p2(month + 1)}-${p2(d)}`;
    const r = byDate.get(date);
    cells.push({
      date, day: d,
      cls: r?.cls || '',
      status: r?.status || '',
      inAt: r?.firstIn || null,
      outAt: r?.lastOut || null,
      isToday: date === todayYmd
    });
  }
  return { year, month, days, lead: first.getDay(), cells };
}

/* ═══ ملخّص الشهر ═══
   → { workDays, present, late, absent, leave, missing, onTimePct, avgInMin }

   ⚠️ المقام أيام العمل لا أيام الشهر: الراحة والعطلة الرسمية خارج الحساب،
   وإدخالها يجعل نسبة الالتزام تهبط في كل شهر فيه عطلة طويلة بلا ذنب لأحد.

   ⚠️ الإجازة المعتمَدة تُطرح من المقام أيضاً: من كان في إجازة أسبوعاً لا
   يُحاسب على أيامها — وهي نفس القاعدة في weeklyPunctuality. */
export function monthSummary(rows) {
  const list = (rows || []).filter((r) => r && r.cls);
  const count = (k) => list.filter((r) => r.cls === k).length;
  const present = count('present'), late = count('late'), leave = count('leave');
  const absent = count('absent'), missing = count('missing');
  const workDays = present + late + absent + missing;   /* الإجازة خارج المقام */

  /* متوسّط وقت الدخول — بالدقائق من منتصف الليل، لمن سجّل دخولاً فعلاً */
  const ins = list.map((r) => r.firstIn).filter(Boolean)
    .map((t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); })
    .filter((m) => Number.isFinite(m));
  const avgInMin = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;

  return {
    workDays, present, late, absent, leave, missing,
    attended: present + late,
    onTimePct: workDays ? Math.round((present / workDays) * 100) : null,
    avgInMin
  };
}

/* دقائق من منتصف الليل → «08:54». تُرجع '—' للفارغ فلا تُطبع NaN. */
export function minToHm(min) {
  if (!Number.isFinite(min)) return '—';
  return `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;
}

/* ═══ آخر النشاط ═══
   الأحدث أولاً، والأيام بلا سجل مستبعَدة — «آخر نشاط» لا «كل يوم». */
export function recentActivity(rows, max = 8) {
  return (rows || [])
    .filter((r) => r && r.cls && r.cls !== '')
    .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1))
    .slice(0, max);
}
