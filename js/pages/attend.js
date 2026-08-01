import { el, esc } from '../lib/dom.js';
import { db, doc, getDoc } from '../lib/firebase.js';
import { getMe } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { cycleOf, ymd, AR_DAYS } from '../lib/dates.js';
import { fmtDur, hm } from '../lib/format.js';
import { sessionsOf, workedSecs, fetchMyAttendance } from '../lib/attendance.js';
import { resolveShift, shiftWindowFor } from '../lib/shifts.js';
import { isStale } from '../lib/nav.js';
import { card, tableWrap, empty, grid, stat } from '../lib/ui.js';

/* ⚠️ ساعات يوم واحد، مع قصّ الجلسة المفتوحة عند نهاية ورديتها.
   بلا `until` كانت الجلسة التي نسي صاحبها بصمة الانصراف تعدّ حتى اللحظة —
   فيظهر يوم 27 يوليو بـ«114:23:44» ساعة. هذا هو نفس الخطأ الذي أُصلح في
   buildDailyStatus، وكان ما زال قائماً في هذه الصفحة وحدها.
   الوردية تُحلّ بنفس ترتيب الأولوية المعتمد: استثناء التاريخ ← وردية القسم
   ← الوردية العامة. */
function daySecs(rec, deptName) {
  const d  = new Date(rec.date + 'T00:00:00');
  if (isNaN(d)) return workedSecs(sessionsOf(rec)).secs;
  const sh = resolveShift(rec.date, d.getDay(), deptName);
  const w  = shiftWindowFor(d, sh);
  return workedSecs(sessionsOf(rec), w ? w.end.getTime() : null).secs;
}

export async function render(view, token) {
  attendPanel(view);

  const me = getMe();
  const cyc = cycleOf(new Date());

  const c = card('سجلّي في هذه الدورة', cyc.label, 'calendar');
  const host = el('div', '', '<div class="empty"><span class="spinner"></span> جارٍ التحميل…</div>');
  c.appendChild(host);
  view.appendChild(c);

  /* الموظف يقرأ سجلاته هو فقط — القاعدة ترفض استعلاماً غير مقيّد به،
     فنفلتر محلياً بعد الجلب المقيّد بالتاريخ ونتعامل مع الرفض بهدوء. */
  let mine = [];
  try { mine = await fetchMyAttendance(cyc, me.id, 'attendance'); }
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

  const totalSecs = mine.reduce((s, r) => s + daySecs(r, me.department), 0);
  const g = grid(3);
  g.append(
    stat(mine.length, 'أيام حضور'),
    stat(fmtDur(totalSecs), 'مجموع ساعات الدورة'),
    stat(fmtDur(totalSecs / mine.length), 'متوسط اليوم')
  );
  host.appendChild(g);

  host.appendChild(tableWrap(`
    <table class="tight">
      <thead><tr><th>التاريخ</th><th>اليوم</th><th>المكان</th><th>دخول</th><th>خروج</th><th>الجلسات</th><th>الساعات</th></tr></thead>
      <tbody>${mine.map((r) => {
        const ss = sessionsOf(r);
        const last = ss[ss.length - 1];
        const secs = daySecs(r, me.department);
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
