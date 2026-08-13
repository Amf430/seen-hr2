/* ═══════════════════════════════════════════════════════════════════════════
   كشف حضور الموظف — تحويل صفوف buildDailyStatus إلى شبكة شهر وملخّص.

   ⚠️ وحدة نقيّة مستقلّة عن attendance.js: تلك تجرّ Firebase من CDN فلا تعمل
   في node. هذه تأخذ الصفوف جاهزةً وتُعيد ترتيبها — فتُختبر.

   ⚠️ لا تحسب حالة يوم ولا تقرّر تأخيراً: buildDailyStatus وحدها تفعل ذلك،
   وهي نفسها التي يعتمدها المسير. أي حسبة ثانية هنا تعني رقمين مختلفين لنفس
   الموظف في شاشتين — وهو ما تمنعه قاعدة «حسبة واحدة في مكان واحد».
   ═══════════════════════════════════════════════════════════════════════════ */

const p2 = (n) => String(n).padStart(2, '0');

/* «2026-08-13» → Date محلّي على منتصف الليل.
   ⚠️ لا `new Date('2026-08-13')` — تلك تُقرأ UTC فتُرجع ١٢ أغسطس ٣:٠٠ ص
   بتوقيت الرياض، فينزاح اليوم كلّه خانةً في الشبكة. */
function fromYmd(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/* ═══ شبكة الدورة ═══
   → { start, end, lead, cells: [{ date, day, month, cls, status, inAt, outAt,
                                   isToday, isFuture, isOff }] }

   ⚠️ الشبكة تُرسم على **مدى الدورة** (٢٦ ← ٢٥) لا على الشهر التقويمي.
   كانت تُرسم على الشهر بينما العنوان والبطاقات والصفوف كلها على الدورة —
   فكانت أيام ٢٦←٣١ من الشهر الأول تُحسب في «أيام حضرتها 0/15» ثم تسقط من
   الشبكة، وتظهر مكانها أيام ٢٦←٣١ من الشهر الثاني وهي ليست من الدورة أصلاً.
   الرقم كان صحيحاً والشبكة ناقصة، فبدا النظام مناقضاً لنفسه.

   ⚠️ lead هو عدد الخانات الفارغة قبل أول يوم — الأسبوع يبدأ الأحد
   (getDay()===0) في التقويم السعودي، فلا إزاحة إضافية.

   ⚠️ ثلاث حالات كانت كلها «أبيض» ولا يفرّق بينها شيء:
     • راحة أو عطلة رسمية — لا يُحاسب عليها
     • يوم لم يأتِ بعد
     • يوم لا سجلّ له (قبل تاريخ المباشرة)
   الغياب حكمٌ يُخصم عليه، وغيابُ الصفّ ليس غياباً — فتُميَّز ولا تُلوَّن
   بالأحمر. `isOff` تأتي من نفس `resolveShift` التي بنى بها buildDailyStatus
   الصفوف، فلا حسبة ثانية تتباعد عنها. */
export function cycleGridOf(rows, startYmd, endYmd, todayYmd = '', isOff = null) {
  const byDate = new Map();
  for (const r of rows || []) if (r?.dateStr) byDate.set(r.dateStr, r);

  const start = fromYmd(startYmd), end = fromYmd(endYmd);
  const cells = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const r = byDate.get(date);
    const off = !r && typeof isOff === 'function' && !!isOff(date, d.getDay());
    cells.push({
      date, day: d.getDate(), month: d.getMonth(), dow: d.getDay(),
      cls: r?.cls || (off ? 'off' : ''),
      status: r?.status || (off ? 'راحة' : ''),
      inAt: r?.firstIn || null,
      outAt: r?.lastOut || null,
      isToday: !!todayYmd && date === todayYmd,
      isFuture: !!todayYmd && date > todayYmd,
      isOff: off
    });
  }
  return { start: startYmd, end: endYmd, lead: start.getDay(), cells };
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
