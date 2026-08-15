/* ═══════════════════════════════════════════════════════════════════════════
   تحليلات المهام — للموارد البشرية (أدمن)

   ⚠️⚠️ لا تُحوَّل هذه الأرقام إلى «تقييم نهائي» رقم واحد يظهر للموظف. تُعرض
   مكوّناتها مفصّلة عمداً. الرقم المركّب يبدو موضوعياً وهو ليس كذلك، والناس
   تُحسّن الرقم لا العمل.

   ── لماذا الجدولان مدموجان ──
   الالتزام في الحضور والالتزام في المهام في جدول واحد. الموظف المنضبط في
   الحضور والمتعثّر في المهام حالةٌ مختلفة تماماً عن العكس: الأول قد يكون
   مثقلاً أو بلا وضوح، والثاني قد يكون منتِجاً بساعات مرنة. والجدولان
   المنفصلان لا يُظهران هذا الفرق أبداً.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { getUsers, getRequests } from '../lib/state.js';
import { ymdKsa, cycleOf } from '../lib/dates.js';
import { allTasks } from '../lib/tasks.js';
import { taskAnalytics, analyticsBy } from '../lib/task-flow.js';
import { barList } from '../lib/charts.js';
import { fetchAttendance, buildDailyStatus } from '../lib/attendance.js';
import { teamSummaryOf } from '../lib/team-stats.js';
import { isStale } from '../lib/nav.js';
import { card, tableWrap, sectionHead, loading, callout, pageHead, statCard } from '../lib/ui.js';

export async function render(view, token) {
  const today = ymdKsa();
  const cyc = cycleOf(new Date());

  /* ⚠️ رأس صفحة لا بطاقة عنوان — الهوية الجديدة: البنية بالحدّ لا بالظلّ،
     والعنوان لا يستهلك بطاقة كاملة بلا معلومة. */
  view.appendChild(pageHead('تحليلات المهام',
    'أرقام المهام لكل قسم ولكل موظف، مقروءة بجانب أرقام الانضباط في الحضور.'));

  const host = el('div', '');
  host.appendChild(loading('جارٍ حساب التحليلات…'));
  view.appendChild(host);

  let tasks, zk;
  try {
    [tasks, zk] = await Promise.all([allTasks(), fetchAttendance(cyc, 'zkAttendance')]);
  } catch (e) {
    console.error('tasks-analytics', e);
    if (isStale(token)) return;
    host.innerHTML = '';
    host.appendChild(callout('warn', 'تعذّر تحميل البيانات', 'راجع الفهارس المنشورة.'));
    return;
  }
  if (isStale(token)) return;
  host.innerHTML = '';

  if (!tasks.length) {
    host.appendChild(el('div', 'card', '<div class="empty">لا مهام في النظام بعد.</div>'));
    return;
  }

  /* ── الإجمالي ── */
  const an = taskAnalytics(tasks, today);
  const sg = el('div', 'statgrid statgrid--3');
  sg.append(
    statCard({ label: 'إجمالي المهام', value: an.total, ico: 'check',
      sub: `${an.active} نشِطة الآن` }),
    statCard({ label: 'متأخرة الآن', value: an.overdueNow, ico: 'clock',
      tone: an.overdueNow ? 'bad' : 'good',
      sub: an.overdueNow ? 'تجاوزت موعدها ولم تُغلق' : 'لا شيء تجاوز موعده' }),
    statCard({ label: 'أُنجزت في وقتها', value: an.onTimePct === null ? '—' : an.onTimePct + '٪',
      ico: 'check', tone: an.onTimePct === null ? '' : an.onTimePct >= 80 ? 'good' : 'warn',
      sub: 'على المنجزة وحدها' }),
    statCard({ label: 'متوسّط زمن الإنجاز', value: an.avgDays === null ? '—' : an.avgDays,
      ico: 'clock', sub: an.avgDays === null ? 'لا بيانات كافية' : 'يوماً من الإنشاء للاعتماد' }),
    statCard({ label: 'معدّل الإعادة', value: an.reopenRate === null ? '—' : an.reopenRate + '٪',
      ico: 'back', tone: an.reopenRate && an.reopenRate > 20 ? 'warn' : '',
      sub: 'أُعيدت للتحسين بعد إرسالها' }),
    /* ⚠️ الملغاة تُعرض ولا تُخفى: عددٌ كبير منها يقول شيئاً عن التخطيط لا
       عن الموظفين — ولا تدخل «في الوقت» بسطاً ولا مقاماً. */
    statCard({ label: 'ملغاة', value: an.cancelled, ico: 'x',
      sub: 'خارج حساب الإنجاز — لا إنجازٌ ولا تقصير' })
  );
  host.appendChild(sg);
  host.appendChild(el('p', 'help',
    '«أُنجزت في وقتها» محسوبة على المنجزة وحدها — خلطها بالجارية يجعل من عنده عمل مفتوح يبدو متعثّراً.'));

  /* ── لكل قسم ── */
  const byDept = analyticsBy(tasks, today, (t) => t.department);
  const dc = card('');
  dc.appendChild(sectionHead({ text: 'حسب القسم', icon: 'building' }));
  /* ⚠️ barList يبني HTML لا SVG: النصّ العربي داخل SVG لا يرث الاتجاه
     فينقلب ترتيب الكلمات. الشريط هنا عنصر عادي بحدّ ولون. */
  if (byDept.length > 1) dc.appendChild(el('div', '',
    barList(byDept.slice(0, 8).map((d) => ({ label: d.key, value: d.total })))));
  dc.appendChild(tableWrap(`
    <table class="tight">
      <thead><tr><th>القسم</th><th class="num">المهام</th><th class="num">نشطة</th>
        <th class="num">متأخرة</th><th class="num">في الوقت</th><th class="num">متوسط الأيام</th>
        <th class="num">التقييم</th><th class="num">الإعادة</th></tr></thead>
      <tbody>${byDept.map((d) => `<tr>
        <td><b>${esc(d.key)}</b></td>
        <td class="num">${d.total}</td>
        <td class="num">${d.active}</td>
        <td class="num ${d.overdueNow ? 'text-red' : ''}">${d.overdueNow || '—'}</td>
        <td class="num">${d.onTimePct === null ? '—' : d.onTimePct + '%'}</td>
        <td class="num">${d.avgDays === null ? '—' : d.avgDays}</td>
        <td class="num">${d.avgRating === null ? '—' : d.avgRating}</td>
        <td class="num">${d.reopenRate === null ? '—' : d.reopenRate + '%'}</td>
      </tr>`).join('')}</tbody>
    </table>`));
  host.appendChild(dc);

  /* ── الجدول المدموج: الحضور مقابل المهام ── */
  const staff = getUsers().filter((u) => u.role !== 'admin');
  const attRows = buildDailyStatus(cyc, staff, getRequests(), zk, { compensate: true });
  const attSum  = teamSummaryOf(attRows);
  const attByUid = new Map(attSum.employees.map((e) => [e.uid, e]));
  const byUser = analyticsBy(tasks, today, (t) => t.assigneeUid);

  const uc = card('');
  uc.appendChild(sectionHead({ text: 'الموظفون — الحضور مقابل المهام', icon: 'people' }));
  uc.appendChild(el('p', 'desc',
    'المنضبط في الحضور والمتعثّر في المهام حالة مختلفة تماماً عن العكس. اقرأ العمودين معاً لا كلاً على حدة.'));
  uc.appendChild(tableWrap(`
    <table class="tight">
      <thead><tr><th>الموظف</th><th>القسم</th>
        <th class="num">التزام الحضور</th><th class="num">مهام</th><th class="num">منجزة</th>
        <th class="num">متأخرة</th><th class="num">في الوقت</th><th class="num">التقييم</th></tr></thead>
      <tbody>${byUser.map((r) => {
        const u = staff.find((x) => x.id === r.key);
        if (!u) return '';
        const att = attByUid.get(r.key);
        return `<tr>
          <td><b>${esc(u.name)}</b></td>
          <td>${esc(u.department || '—')}</td>
          <td class="num">${att ? `<b class="${att.overall >= 90 ? 'text-green' : att.overall >= 75 ? 'text-amber' : 'text-red'}">${att.overall}%</b>` : '—'}</td>
          <td class="num">${r.total}</td>
          <td class="num">${r.done}</td>
          <td class="num ${r.overdueNow ? 'text-red' : ''}">${r.overdueNow || '—'}</td>
          <td class="num">${r.onTimePct === null ? '—' : r.onTimePct + '%'}</td>
          <td class="num">${r.avgRating === null ? '—' : r.avgRating}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`));
  uc.appendChild(el('p', 'help',
    '⚠️ هذه مكوّنات لا درجة. لا يُشتقّ منها رقم واحد يُعرض للموظف — الرقم المركّب يبدو موضوعياً وهو ليس كذلك.'));
  host.appendChild(uc);
}
