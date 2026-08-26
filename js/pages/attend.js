import { el, esc } from '../lib/dom.js';
import { db, doc, getDoc } from '../lib/firebase.js';
import { getMe, getRequests } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { cycleOf, ymd, AR_DAYS } from '../lib/dates.js';
import { fmtDur, hm } from '../lib/format.js';
import { sessionsOf, workedSecs, dayBounds, fetchMyAttendance, uidsOf } from '../lib/attendance.js';
import { permissionWorkTime } from '../lib/permission-work-time.js';
import { resolveShift, shiftWindowFor } from '../lib/shifts.js';
import { isStale } from '../lib/nav.js';
import { tableWrap, empty, pageHead, statCard } from '../lib/ui.js';

/* ⚠️ ساعات يوم واحد، مع قصّ الجلسة المفتوحة عند نهاية ورديتها.
   بلا `until` كانت الجلسة التي نسي صاحبها بصمة الانصراف تعدّ حتى اللحظة —
   فيظهر يوم 27 يوليو بـ«114:23:44» ساعة. هذا هو نفس الخطأ الذي أُصلح في
   buildDailyStatus، وكان ما زال قائماً في هذه الصفحة وحدها.
   الوردية تُحلّ بنفس ترتيب الأولوية المعتمد: استثناء التاريخ ← وردية القسم
   ← الوردية العامة. */
export function dayWork(rec, deptName, emp, requests) {
  const sessions = sessionsOf(rec);
  const d  = new Date(rec.date + 'T00:00:00');
  if (isNaN(d)) return { secs:workedSecs(sessions).secs };
  const sh = resolveShift(rec.date, d.getDay(), deptName, emp);
  const w  = shiftWindowFor(d, sh);
  /* خط الأساس هنا يبقى مجموع جلسات الجوال كما كان؛ لا نبدّله إلى span.
     الاستئذان يضيف فترته فقط، وMid المعتمد هو وحده الذي يطلب اتحاد الجلسات. */
  const rawSecs = workedSecs(sessions, w ? w.end.getTime() : null).secs;
  const { firstIn, lastOut } = dayBounds(sessions);
  const effect = permissionWorkTime({
    requests, employeeUid:emp.id, dateStr:rec.date, sessions, firstIn, lastOut,
    baseSecs:rawSecs, shiftStart:w ? w.start : null, shiftEnd:w ? w.end : null,
    lateGraceMinutes:0
  });
  return { secs:lastOut ? effect.effectiveSecs : rawSecs, effect };
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

  const requests = getRequests();
  const days = mine.map((r) => ({ r, work:dayWork(r, me.department, me, requests) }));
  const totalSecs = days.reduce((s, x) => s + x.work.secs, 0);
  const sg = el('div', 'statgrid');
  sg.append(
    statCard({ label: 'أيام حضور', value: mine.length, ico: 'calendar',
      sub: 'سجّلت فيها من جوالك' }),
    statCard({ label: 'مجموع ساعات الدورة', value: fmtDur(totalSecs), ico: 'clock',
      sub: 'بعد الاستئذانات المعتمدة' }),
    statCard({ label: 'متوسّط اليوم', value: fmtDur(totalSecs / mine.length), ico: 'chart',
      sub: 'على أيام حضورك وحدها' })
  );
  host.appendChild(sg);

  host.appendChild(tableWrap(`
    <table class="tight">
      <thead><tr><th class="num">التاريخ</th><th>اليوم</th><th>المكان</th><th class="num">دخول</th><th class="num">خروج</th><th class="num">الجلسات</th><th class="num">الساعات</th></tr></thead>
      <tbody>${days.map(({ r, work }) => {
        const ss = sessionsOf(r);
        const last = ss[ss.length - 1];
        const secs = work.secs;
        const d = new Date(r.date + 'T00:00:00');
        return `<tr>
          <td class="num">${esc(r.date)}</td>
          <td>${AR_DAYS[isNaN(d) ? 0 : d.getDay()]}</td>
          <td>${esc(r.branchName || '—')}</td>
          <td class="num text-green">${ss.length ? hm(ss[0].in) : '—'}</td>
          <td class="num text-red">${(last && last.out) ? hm(last.out) : '<span class="pill pill--dot missing">مفتوحة</span>'}</td>
          <td class="num">${ss.length}</td>
          <td class="num" title="${work.effect?.creditedSecs ? `يشمل ${Math.round(work.effect.creditedSecs / 60)} د باستئذان معتمد` : ''}">${secs > 0 ? fmtDur(secs) : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`));
}

export { ymd };
