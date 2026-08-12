/* ═══════════════════════════════════════════════════════════════════════════
   أداء موظفي القسم — لمدير القسم وللأدمن

   الطلب: «مدير القسم يقدر يتابع أداء موظفين القسم ونسب الإنضباط».

   ── ثلاثة قرارات مكتوبة هنا لأنها ليست بديهية ──

   ١) المصدر هو zkAttendance (جهاز البصمة) لا attendance (تسجيل الجوال).
      لأن المسير يُحسب على الجهاز. ولو حسبت هذه الشاشة من الجوال بينما
      «أدائي» تحسب من الجهاز، لصار للموظف الواحد رقما تأخير مختلفان في
      شاشتين — والمدير يبني قراراً على أحدهما ولا يعرف أيّهما الصحيح.

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
import { hhmm } from '../lib/format.js';
import { fetchAttendance, buildDailyStatus } from '../lib/attendance.js';
import { teamSummaryOf, trendOf, teamExportRows } from '../lib/team-stats.js';
import { deptCoverageOf, coverageNote } from '../lib/zk-coverage.js';
import { teamPerfExport } from '../lib/excel.js';
import { isStale, go } from '../lib/nav.js';
import { isAdmin } from '../lib/perms.js';
import { card, grid, stat, empty, tableWrap, sectionHead, callout, button, loading } from '../lib/ui.js';

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
  const head = card('');
  head.appendChild(sectionHead({ text: admin ? 'أداء الأقسام' : 'أداء موظفي قسمي', icon: 'chart' }));
  head.appendChild(el('p', 'desc',
    'محسوب من بصمات جهاز الحضور — وهو المصدر الذي يُحسب عليه المسير. أيام الراحة والعطل الرسمية مستثناة.'));

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

    let recs, prevRecs;
    try {
      /* ⚠️ الأدمن يقرأ بلا تقييد (قاعدته تسمح)، والمدير مقيَّد بقسمه وإلا
         رُفض استعلامه كاملاً. نمرّر القسم في الحالتين: الأدمن يريده فلتراً،
         والمدير يحتاجه شرطاً. */
      [recs, prevRecs] = await Promise.all([
        fetchAttendance(cyc,     'zkAttendance', dept),
        fetchAttendance(prevCyc, 'zkAttendance', dept)
      ]);
    } catch (e) {
      console.error('team-perf', e);
      if (isStale(token)) return;
      host.innerHTML = '';
      host.appendChild(callout('warn', 'تعذّر قراءة سجلات الحضور',
        'الغالب أن الفهرس المركّب (department, date) غير منشور بعد. راجع firestore.indexes.json وانشره: firebase deploy --only firestore:indexes'));
      return;
    }
    if (isStale(token)) return;

    const staff = getUsers().filter((u) => u.role !== 'admin' && u.department === dept);
    const reqs  = getRequests();

    const rows     = buildDailyStatus(cyc,     staff, reqs, recs,     { compensate: admin });
    const prevRows = buildDailyStatus(prevCyc, staff, reqs, prevRecs, { compensate: admin });
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
    const arrow = !tr ? ''
      : tr.dir === 'up'   ? ` <span class="text-green">▲ ${tr.delta}</span>`
      : tr.dir === 'down' ? ` <span class="text-red">▼ ${Math.abs(tr.delta)}</span>`
      : ' <span class="text-muted">=</span>';

    const kpi = card('');
    kpi.appendChild(sectionHead({ text: `${dept} — ${cyc.label}`, icon: 'chart' }));
    const g = grid(3);
    g.append(
      stat(`${t.overall}%${arrow}`, 'الالتزام العام', t.overall >= 90 ? 'ok' : t.overall >= 75 ? 'a' : 'r'),
      stat(`${t.onTime}%`, 'حضور في الوقت', t.onTime >= 90 ? 'ok' : t.onTime >= 75 ? 'a' : 'r'),
      stat(String(t.employeeCount), 'موظفو القسم'),
      stat(t.avgLateMinPerLateDay ? `${t.avgLateMinPerLateDay} د` : '—', 'متوسط التأخير في اليوم المتأخر', t.avgLateMinPerLateDay ? 'a' : ''),
      stat(String(t.absent), 'أيام غياب', t.absent ? 'r' : 'ok'),
      stat(String(t.missing), 'بصمات خروج ناقصة', t.missing ? 'a' : 'ok')
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
          <th class="num">ساعات</th><th class="num">الالتزام</th>
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
        <td class="num">${Math.round(e.secs / 360) / 10}</td>
        <td class="num"><b class="${e.overall >= 90 ? 'text-green' : e.overall >= 75 ? 'text-amber' : 'text-red'}">${e.overall}%</b></td>`;
      /* الضغط يفتح ملف الموظف — نفس صفحة الأدمن، وقواعدها هي التي تحكم ما يراه */
      row.onclick = () => go('employee-profile', e.uid);
      tb.appendChild(row);
    });

    c.appendChild(w);
    c.appendChild(el('p', 'help',
      'الالتزام = (حاضر + متأخر + إجازة) ÷ الأيام المحسوبة — يقيس الحضور أصلاً. و«في الوقت» يقيس الانضباط في موعد البداية.'));
    host.appendChild(c);
  }

  cycSel.onchange = draw;
  if (deptSel) deptSel.onchange = draw;
  await draw();
}
