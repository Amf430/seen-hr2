/* ═══════════════════════════════════════════════════════════════════════════
   أداء موظفي القسم — لمدير القسم وللأدمن

   الطلب: «مدير القسم يقدر يتابع أداء موظفين القسم ونسب الإنضباط».

   ── ثلاثة قرارات مكتوبة هنا لأنها ليست بديهية ──

   ١) حالة اليوم توحّد zkAttendance وattendance قبل buildDailyStatus، فلا
      يُحسب الموظف مرتين ولا تضيع بصمة موجودة في مصدر واحد. اختيار مصدر
      المسير مستقل ويأتي من إعداد الرواتب المركزي.

   ٢) الاستعلام مقيَّد بـ where('department','==',…) للمدير. ليس تحسيناً
      للأداء: قاعدة القراءة تمنحه الوصول عبر sameDept()، وFirestore يرفض
      الاستعلام **كاملاً** ما لم يكن مقيَّداً بحيث تُحقّق كل نتيجة محتملة شرط
      القاعدة. ويحتاج الفهرس المركّب (department, date) منشوراً.

   ٣) ⚠️ والتقييد بالقسم يتخطّى بصمت الوثائق القديمة التي كتبها الجسر قبل
      تحديثه (بلا حقل department). فتُحسب التغطية من البيانات نفسها عبر
      deptCoverageOf() وتُعلنها الشاشة. مدير يقرأ «٣ أيام غياب» محسوبة على
      نصف دورة سيتّخذ قراراً على رقم ناقص وهو يظنّه كاملاً.

   ⚠️ ولا رقم مالي في هذه الشاشة إطلاقاً. لا لأن المدير ممنوع من رؤيته
   (المالك سمح بذلك في ٢٠٢٦-٠٨-١٢)، بل لأنه لا علاقة له بالانضباط: خلط
   الراتب بنسبة الحضور على شاشة واحدة يصنع ربطاً في ذهن القارئ لم يقصده أحد.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast } from '../lib/dom.js';
import { getMe, getUsers, getRequests } from '../lib/state.js';
import { recentCyclesList, cycleOf } from '../lib/dates.js';
import { decimalHoursHHMM, hhmm } from '../lib/format.js';
import { fetchAttendance, buildDailyStatus } from '../lib/attendance.js';
import { teamSummaryOf, trendOf, teamExportRows } from '../lib/team-stats.js';
import { deptCoverageOf, coverageNote } from '../lib/zk-coverage.js';
import { teamPerfExport } from '../lib/excel.js';
import { isStale, go } from '../lib/nav.js';
import { isAdmin } from '../lib/perms.js';
import { card, empty, tableWrap, sectionHead, callout, button, loading,
         pageHead, statCard } from '../lib/ui.js';
import { adjustmentsForAttendanceRecords, adjustedUnifiedAttendance } from '../lib/adjustments.js';

export async function render(view, token) {
  const me = getMe();
  const admin = isAdmin();

  /* ⚠️ المدير محصور بقسمه على السيرفر أصلاً — هذا المُنتقي راحةٌ للأدمن
     الذي يقرأ الشركة كلها، لا ضابط أمني. */
  const depts = admin
    ? [...new Set(getUsers().filter((u) => u.role !== 'admin').map((u) => u.department).filter(Boolean))].sort()
    : [me.department].filter(Boolean);

  if (!depts.length) {
    view.appendChild(card('أداء القسم', null, 'chart'));
    view.appendChild(el('div', 'card', `<div class="empty">${
      admin ? 'لا أقسام معرَّفة بعد.' : 'لم يُسنَد لك قسم — راجع الموارد البشرية.'}</div>`));
    return;
  }

  const cycles = recentCyclesList(6);

  /* ── شريط الاختيار ── */
  /* ⚠️ رأس صفحة لا بطاقة عنوان (الهوية الجديدة) */
  view.appendChild(pageHead(admin ? 'أداء الأقسام' : 'أداء موظفي قسمي',
    'محسوب من سجل يوم موحّد بين جهاز الحضور وتسجيل الجوال. أيام الراحة والعطل الرسمية مستثناة.'));
  const head = card('');

  const bar = el('div', 'cluster');
  const cycSel = el('select', 'select-lg');
  cycSel.innerHTML = cycles.map((c, i) =>
    `<option value="${i}">${esc(c.label)}${i === 0 ? ' (الحالية)' : ''}</option>`).join('');
  bar.appendChild(cycSel);

  let deptSel = null;
  if (admin && depts.length > 1) {
    deptSel = el('select', 'select-lg');
    deptSel.innerHTML = depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    bar.appendChild(deptSel);
  }
  head.appendChild(bar);
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  const currentDept = () => (deptSel ? deptSel.value : depts[0]);

  async function draw() {
    host.innerHTML = '';
    host.appendChild(loading('جارٍ حساب أداء القسم…'));

    const cyc  = cycles[Number(cycSel.value) || 0];
    const dept = currentDept();

    /* الدورة السابقة للمقارنة — يوم واحد قبل بداية الحالية يقع فيها */
    const prevCyc = cycleOf(new Date(cyc.start.getTime() - 86400000));

    const staff = getUsers().filter((u) => u.role !== 'admin' && u.department === dept);
    let recs, prevRecs, webRecs, prevWebRecs, adjustments;
    try {
      /* ⚠️ الأدمن يقرأ بلا تقييد (قاعدته تسمح)، والمدير مقيَّد بقسمه وإلا
         رُفض استعلامه كاملاً. نمرّر القسم في الحالتين: الأدمن يريده فلتراً،
         والمدير يحتاجه شرطاً. */
      [recs, prevRecs, webRecs, prevWebRecs] = await Promise.all([
        fetchAttendance(cyc,     'zkAttendance', dept),
        fetchAttendance(prevCyc, 'zkAttendance', dept),
        fetchAttendance(cyc,     'attendance', dept),
        fetchAttendance(prevCyc, 'attendance', dept)
      ]);
      adjustments = await adjustmentsForAttendanceRecords([
        { coll: 'zkAttendance', records: [...recs, ...prevRecs] },
        { coll: 'attendance', records: [...webRecs, ...prevWebRecs] }
      ]);
    } catch (e) {
      console.error('team-perf', e);
      if (isStale(token)) return;
      host.innerHTML = '';
      host.appendChild(callout('warn', 'تعذّر قراءة سجلات الحضور',
        'فشل مصدر حضور مطلوب أو تصحيحاته؛ لن تُعرض نتيجة ناقصة.'));
      return;
    }
    if (isStale(token)) return;

    const reqs  = getRequests();
    const unified = adjustedUnifiedAttendance(staff, recs, webRecs, adjustments);
    const prevUnified = adjustedUnifiedAttendance(staff, prevRecs, prevWebRecs, adjustments);

    const rows     = buildDailyStatus(cyc,     staff, reqs, unified,     { compensate: admin });
    const prevRows = buildDailyStatus(prevCyc, staff, reqs, prevUnified, { compensate: admin });
    const sum      = teamSummaryOf(rows);
    const prevSum  = teamSummaryOf(prevRows);
    const cov      = deptCoverageOf(recs);

    host.innerHTML = '';

    /* ⚠️ التغطية أولاً وقبل أي رقم. تحذيرٌ تحت الجدول يقرؤه من أكمل قراءته،
       والرقم يُقرأ أولاً ويُبنى عليه القرار. */
    const note = coverageNote(cov);
    if (note) host.appendChild(callout('warn', 'الأرقام أدناه لا تغطّي الدورة كاملة', note));

    if (!sum.totals.days) {
      host.appendChild(el('div', 'card',
        `<div class="empty">لا أيام محسوبة لقسم «${esc(dept)}» في هذه الدورة.</div>`));
      return;
    }

    /* ── بطاقات المؤشرات ── */
    const t = sum.totals;
    const tr = trendOf(t, prevSum.totals);
    /* ⚠️ نصّ خالص لا HTML: statCard تُمرّر قيمتها عبر esc() (كما كانت stat
       قبلها)، فالوسم المحقون يظهر للمستخدم كنصّ خام على الشاشة. اكتُشف
       بالنظر إلى البطاقة في المتصفح — لا اختبار يقرأ ما تراه العين. */
    const kpi = card('');
    kpi.appendChild(sectionHead({ text: `${dept} — ${cyc.label}`, icon: 'chart' }));
    const g = el('div', 'statgrid statgrid--3');
    g.append(
      /* ⚠️ الفرق في حقله لا داخل الرقم: «63%▲63» تُقرأ رقماً واحداً مشوّهاً،
         و statCard تعرضه سطراً مستقلاً بسهمه ولونه. واللون يأتي من `good`
         صراحةً — ارتفاع الالتزام خبرٌ جيّد، بخلاف ارتفاع الغياب. */
      statCard({ label: 'نسبة الالتزام بالوقت', value: `${t.commitmentRate}%`, ico: 'chart',
        tone: t.commitmentRate >= 90 ? 'good' : t.commitmentRate >= 75 ? 'warn' : 'bad',
        sub: 'أيام منضبطة من أيام العمل المحتسبة',
        delta: tr ? { pct: tr.delta, good: true } : null }),
      statCard({ label: 'نسبة الحضور', value: `${t.attendanceRate}%`, ico: 'check',
        tone: t.attendanceRate >= 90 ? 'good' : t.attendanceRate >= 75 ? 'warn' : 'bad',
        sub: 'الحضور الفعلي من أيام العمل المحتسبة' }),
      statCard({ label: 'موظفو القسم', value: t.employeeCount, ico: 'people',
        sub: 'محسوبون في هذه الأرقام' }),
      statCard({ label: 'متوسّط التأخير', value: t.avgLateMinPerLateDay ? `${t.avgLateMinPerLateDay} د` : '—',
        ico: 'clock', tone: t.avgLateMinPerLateDay ? 'warn' : '',
        sub: 'في اليوم المتأخّر وحده' }),
      statCard({ label: 'أيام غياب', value: t.absent, ico: 'alert',
        tone: t.absent ? 'bad' : 'good', sub: t.absent ? 'بلا إجازة معتمَدة' : 'لا غياب' }),
      statCard({ label: 'بصمات خروج ناقصة', value: t.missing, ico: 'gap',
        tone: t.missing ? 'warn' : 'good',
        sub: t.missing ? 'تحتاج تصحيحاً' : 'لا نواقص' })
    );
    kpi.appendChild(g);
    if (tr) kpi.appendChild(el('p', 'help',
      `المقارنة مع الدورة السابقة (${esc(prevCyc.label)}): ${
        tr.dir === 'up' ? 'تحسّن' : tr.dir === 'down' ? 'تراجع' : 'بلا تغيّر'} ${Math.abs(tr.delta)} نقطة.`));
    host.appendChild(kpi);

    /* ── جدول الموظفين ── */
    const c = card('');
    c.appendChild(sectionHead({ text: 'الموظفون', icon: 'people' },
      button('تصدير Excel', 'btn sm ghost', () => {
        teamPerfExport(cyc, dept, teamExportRows(sum));
        toast('صُدِّر الملف', 'ok');
      })));

    const w = tableWrap(`
      <table class="tight">
        <thead><tr>
          <th>الموظف</th><th class="num">أيام</th><th class="num">حاضر</th>
          <th class="num">متأخر</th><th class="num">غائب</th><th class="num">إجازة</th>
          <th class="num">خروج ناقص</th><th class="num">مجموع التأخير</th>
          <th class="num">ساعات</th><th class="num">نسبة الحضور</th><th class="num">الالتزام بالوقت</th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');

    sum.employees.forEach((e) => {
      const row = el('tr', 'row-click');
      row.innerHTML = `
        <td><b>${esc(e.name)}</b>${e.jobTitle ? `<div class="cell-sub">${esc(e.jobTitle)}</div>` : ''}</td>
        <td class="num">${e.days}</td>
        <td class="num text-green">${e.present}</td>
        <td class="num ${e.late ? 'text-amber' : ''}">${e.late || '—'}</td>
        <td class="num ${e.absent ? 'text-red' : ''}">${e.absent || '—'}</td>
        <td class="num">${e.leave || '—'}</td>
        <td class="num ${e.missing ? 'text-amber' : ''}">${e.missing || '—'}</td>
        <td class="num">${e.lateMin ? esc(hhmm(e.lateMin)) : '—'}</td>
        <td class="num">${decimalHoursHHMM(e.secs / 3600)}</td>
        <td class="num">${e.attendanceRate}%</td>
        <td class="num"><b class="${e.commitmentRate >= 90 ? 'text-green' : e.commitmentRate >= 75 ? 'text-amber' : 'text-red'}">${e.commitmentRate}%</b></td>`;
      /* ⚠️ المعرّف 'profile' لا 'employee-profile' — الثاني غير مُسجَّل في
         PAGES ولا في الراوتر، فكان الضغط يُعيد المستخدم للرئيسية بصمت. */
      row.onclick = () => go('profile', e.uid);
      tb.appendChild(row);
    });

    c.appendChild(w);
    c.appendChild(el('p', 'help',
      'الترتيب: نسبة الالتزام بالوقت، ثم نسبة الحضور، ثم الاسم. الإجازة المعتمدة مستثناة من مقام المؤشرين.'));
    host.appendChild(c);
  }

  cycSel.onchange = draw;
  if (deptSel) deptSel.onchange = draw;
  await draw();
}
