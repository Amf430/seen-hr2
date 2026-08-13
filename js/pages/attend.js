import { el, esc } from '../lib/dom.js';
import { db, doc, getDoc } from '../lib/firebase.js';
import { getMe } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { cycleOf, ymd, AR_DAYS } from '../lib/dates.js';
import { fmtDur, hm } from '../lib/format.js';
import { sessionsOf, workedSecs, fetchMyAttendance, uidsOf } from '../lib/attendance.js';
import { resolveShift, shiftWindowFor } from '../lib/shifts.js';
import { isStale } from '../lib/nav.js';
import { tableWrap, empty, pageHead, statCard } from '../lib/ui.js';

/* ⚠️ ساعات يوم واحد، مع قصّ الجلسة المفتوحة عند نهاية ورديتها.
   بلا `until` كانت الجلسة التي نسي صاحبها بصمة الانصراف تعدّ حتى اللحظة —
   فيظهر يوم 27 يوليو بـ«114:23:44» ساعة. هذا هو نفس الخطأ الذي أُصلح في
   buildDailyStatus، وكان ما زال قائماً في هذه الصفحة وحدها.
   الوردية تُحلّ بنفس ترتيب الأولوية المعتمد: استثناء التاريخ ← وردية القسم
   ← الوردية العامة. */
function daySecs(rec, deptName, emp) {
  const d  = new Date(rec.date + 'T00:00:00');
  if (isNaN(d)) return workedSecs(sessionsOf(rec)).secs;
  const sh = resolveShift(rec.date, d.getDay(), deptName, emp);
  const w  = shiftWindowFor(d, sh);
  return workedSecs(sessionsOf(rec), w ? w.end.getTime() : null).secs;
}

export async function render(view, token) {
  attendPanel(view);

  const me = getMe();
  const cyc = cycleOf(new Date());

  /* ⚠️ رأس صفحة لا بطاقة عنوان (الهوية الجديدة): البطاقة كانت تشغل عرض
     الشاشة كاملاً لتقول اسم الصفحة، والصفحة تُفتح لقراءة الجدول. */
  view.appendChild(pageHead('سجلّي في هذه الدورة', cyc.label));
  const host = el('div', '', '<div class="empty"><span class="spinner"></span> جارٍ التحميل…</div>');
  view.appendChild(host);

  /* الموظف يقرأ سجلاته هو فقط — القاعدة ترفض استعلاماً غير مقيّد به،
     فنفلتر محلياً بعد الجلب المقيّد بالتاريخ ونتعامل مع الرفض بهدوء. */
  let mine = [];
  try { mine = await fetchMyAttendance(cyc, uidsOf(me), 'attendance'); }
  catch (e) {
    console.error(e);
    if (isStale(token)) return;
    host.innerHTML = '';
    host.appendChild(empty('تعذّر تحميل سجلّك — حدّث الصفحة'));
    return;
  }
  if (isStale(token)) return;
  mine.sort((a, b) => (a.date < b.date ? 1 : -1));

  host.innerHTML = '';
  if (!mine.length) { host.appendChild(empty('ما سجّلت حضوراً في هذه الدورة بعد', 'calendar')); return; }

  const totalSecs = mine.reduce((s, r) => s + daySecs(r, me.department, me), 0);
  const sg = el('div', 'statgrid');
  sg.append(
    statCard({ label: 'أيام حضور', value: mine.length, ico: 'calendar',
      sub: 'سجّلت فيها من جوالك' }),
    statCard({ label: 'مجموع ساعات الدورة', value: fmtDur(totalSecs), ico: 'clock',
      sub: 'من أول بصمة لآخرها' }),
    statCard({ label: 'متوسّط اليوم', value: fmtDur(totalSecs / mine.length), ico: 'chart',
      sub: 'على أيام حضورك وحدها' })
  );
  host.appendChild(sg);

  host.appendChild(tableWrap(`
    <table class="tight">
      <thead><tr><th class="num">التاريخ</th><th>اليوم</th><th>المكان</th><th class="num">دخول</th><th class="num">خروج</th><th class="num">الجلسات</th><th class="num">الساعات</th></tr></thead>
      <tbody>${mine.map((r) => {
        const ss = sessionsOf(r);
        const last = ss[ss.length - 1];
        const secs = daySecs(r, me.department, me);
        const d = new Date(r.date + 'T00:00:00');
        return `<tr>
          <td class="num">${esc(r.date)}</td>
          <td>${AR_DAYS[isNaN(d) ? 0 : d.getDay()]}</td>
          <td>${esc(r.branchName || '—')}</td>
          <td class="num text-green">${ss.length ? hm(ss[0].in) : '—'}</td>
          <td class="num text-red">${(last && last.out) ? hm(last.out) : '<span class="pill pill--dot missing">مفتوحة</span>'}</td>
          <td class="num">${ss.length}</td>
          <td class="num">${secs > 0 ? fmtDur(secs) : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`));
}

export { ymd };
