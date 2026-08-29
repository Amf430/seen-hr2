import { el, esc } from '../lib/dom.js';
import { getUsers, getRequests, getProfileUid, setProfileUid, getMe } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList, reqEventDate, contractDaysLeft, AR_DAYS } from '../lib/dates.js';
import { money, hhmm, hm, fmtDur, p2 } from '../lib/format.js';
import { fetchMyAttendance, buildDailyStatus, uidsOf } from '../lib/attendance.js';
import { computePayroll, payrollConfig } from '../lib/payroll.js';
import { shiftText } from '../lib/shifts.js';
import { describeRule } from '../lib/geo.js';
import { openEmpForm } from '../components/employee-form.js';
import { go, isStale, rerender, getPageArg } from '../lib/nav.js';
import { roleLabel } from '../lib/perms.js';
import { card, empty, tableWrap, button, bar, sectionHead, statCard, callout } from '../lib/ui.js';
import { salaryCertificate, leaveStatement } from '../lib/certificates.js';
import { directReports, managerOf, managerChain } from '../lib/org.js';
import { openDocsModal, docsList } from '../components/documents-modal.js';
import { adjustmentsForAttendanceRecords, adjustedUnifiedAttendance } from '../lib/adjustments.js';
import { attendanceMetrics } from '../lib/attendance-metrics.js';
import { attendancePresentation } from '../lib/attendance-presentation.js';
import { requestBelongsToEmployee } from '../lib/permission-link.js';
import { adjustedPayrollAttendance } from '../lib/attendance-pipeline.js';
import {
  loadRequiredAttendanceSources, payrollConfigForRun, payrollSourceLabel
} from '../lib/attendance-sources.js';
import { getRun } from '../lib/payroll-runs.js';
import { payrollRowForEmployee } from '../lib/payroll-view.js';
import { loadRequiredSource } from '../lib/required-source.js';

export async function render(view, token) {
  if (!getUsers().length) {
    const usersSource = await loadRequiredSource(refreshUsers, getUsers);
    if (isStale(token)) return;
    if (usersSource.status === 'error') {
      console.error('employee-profile', usersSource.error);
      view.appendChild(callout('danger', 'تعذّر تحميل ملف الموظف',
        'تعذر تحميل قائمة الموظفين، لذلك لم يُفسَّر الرابط على أنه موظف غير موجود.'));
      return;
    }
  }
  if (isStale(token)) return;

  /* ── مصدر معرّف الموظف ──
     العنوان أولاً (#profile/UID) فيصمد أمام التحديث ومشاركة الرابط؛
     والحالة في الذاكرة احتياطٌ للتنقّل الداخلي. ونزامنهما حتى تبقى
     setProfileUid صحيحة لمن يقرؤها. */
  const uid = getPageArg() || getProfileUid();
  if (uid && uid !== getProfileUid()) setProfileUid(uid);
  const u = getUsers().find((x) => x.id === uid);
  if (!u) {
    const c = card('');
    c.appendChild(empty('لم يُحدَّد موظف. ارجع لصفحة «ملفات الموظفين» واختر بروفايل.', 'people'));
    c.appendChild(button('ملفات الموظفين', 'btn sm ghost', () => go('employees')));
    view.appendChild(c);
    return;
  }

  /* الأدمن وحده يرى الرواتب ويحرّر — تُستعمل في عدة مواضع أدناه */
  const isAdmin = getMe().role === 'admin';

  /* ترويسة */
  const hd = el('div', 'hero-card');
  hd.innerHTML = `
    <div class="row-between">
      <div>
        <div class="hero-card__name">${esc(u.name)}</div>
        <div class="hero-card__meta">${esc(u.jobTitle || '—')} · ${esc(u.department || 'بلا قسم')} · الرقم الوظيفي ${esc(u.empId || '—')}</div>
        <div class="hero-card__sub num">${esc(u.phone || '')}</div>
      </div>
      <div class="text-start">
        <span class="pill pill--dot ${u.status === 'active' ? 'active' : 'suspended'}">${u.status === 'active' ? 'نشط' : 'معلّق'}</span>
        <div class="hero-card__sub">${esc(roleLabel(u))}</div>
      </div>
    </div>`;
  view.appendChild(hd);

  const bar2 = el('div', 'btn-bar');
  bar2.appendChild(button('كل الموظفين', 'btn sm ghost', () => go('employees')));
  /* ⚠️ قاعدة users تسمح بالتعديل للأدمن وحده، فالزر عند مدير القسم كان يفشل
     دائماً برسالة «ما عندك صلاحية». صفحة الموظفين تتجنّب هذا أصلاً — لا
     تُعرض أزرار محكوم عليها بالفشل. */
  if (isAdmin) {
    bar2.appendChild(button('تعديل البيانات والراتب', 'btn sm',
      () => openEmpForm(u, async () => { await refreshUsers(); rerender(); }, 'gear')));
  }
  view.appendChild(bar2);

  /* التعاقد */
  const cfg = payrollConfig();
  const dl = contractDaysLeft(u.contractEnd);
  /* ⚠️ الراتب لمدير النظام فقط. صفحة «ملفات الموظفين» تخفي عمود الراتب عن
     مدير القسم، وكانت هذه الصفحة تعرضه له كاملاً مع تفصيل الخصومات —
     تسريب رواتب كل مرؤوسيه بخطوتين. */
  const cd = card(isAdmin ? 'التعاقد والراتب' : 'التعاقد', null, 'money');
  const cg = el('div', 'statgrid');
  if (isAdmin) {
    cg.append(
      statCard({ label: 'الراتب الشهري', value: u.salary ? money(u.salary) : '—', ico: 'money',
        sub: u.salary ? 'ريال' : 'غير مُحدَّد — تُصدَر الشهادات فارغة' }),
      statCard({ label: 'قيمة الساعة', ico: 'clock',
        value: u.salary ? money(u.salary / (cfg.daysPerMonth || 30) / (cfg.hoursPerDay || 8)) : '—',
        sub: 'أساس حساب الخصم' })
    );
  }
  cg.append(
    statCard({ label: 'انتهاء العقد', value: u.contractEnd || '—', ico: 'doc',
      tone: dl !== null && dl < 0 ? 'bad' : (dl !== null && dl <= 60 ? 'warn' : ''),
      sub: dl === null ? 'غير مسجَّل' : dl < 0 ? `منتهٍ منذ ${Math.abs(dl)} يوم` : `باقي ${dl} يوماً` }),
    statCard({ label: 'تاريخ المباشرة', value: u.hireDate || '—', ico: 'calendar',
      sub: u.hireDate ? 'بداية الخدمة' : 'غير مسجَّل' })
  );
  cd.appendChild(cg);
  cd.appendChild(el('p', 'help', 'تسجيل الحضور: ' + describeRule(u)));
  view.appendChild(cd);

  /* ── المستندات ──
     الأدمن وحده يحرّر (القاعدة تفرضه)؛ مدير القسم يرى ولا يعدّل. */
  {
    const dc = card('');
    dc.appendChild(sectionHead({ text: 'المستندات وتواريخ الانتهاء', icon: 'doc' },
      isAdmin ? button('إدارة المستندات', 'btn sm', () => openDocsModal(u, async () => {
        await refreshUsers(); rerender();
      }), 'gear') : null));
    dc.appendChild(docsList(u));
    view.appendChild(dc);
  }

  /* اختيار الدورة */
  const cycles = recentCyclesList(12);
  const pick = card('تحليلات الالتزام', null, 'chart',
    'المصدر: سجل يوم موحّد بين جهاز ZKTeco وتسجيل الجوال. أيام الراحة والعطل مستثناة.');
  const dd = el('select', 'select-lg');
  dd.innerHTML = cycles.map((c, i) => `<option value="${i}">${esc(c.label)}${i === 0 ? ' (الحالية)' : ''}</option>`).join('');
  pick.appendChild(dd);
  view.appendChild(pick);

  const host = el('div', '');
  view.appendChild(host);

  async function draw() {
    const cyc = cycles[+dd.value];
    host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ الحساب…</div></div>';
    let recs = [], webRecs = [], adjustments = [], run = null;
    /* مدير القسم يثبت نطاقه داخل الاستعلام نفسه: القسم + هوية الموظف
       الحالية/السابقة + التاريخ. فلترة القسم بعد القراءة لا تمرّ من Rules. */
    try {
      const loaded = await Promise.all([
        loadRequiredAttendanceSources({
          physical: () => fetchMyAttendance(cyc, uidsOf(u), 'zkAttendance', u.department || ''),
          mobile: () => fetchMyAttendance(cyc, uidsOf(u), 'attendance', u.department || '')
        }),
        /* لقطة المسير تحمل صفوف الشركة كاملة. المدير لا يحتاجها لبطاقات
           الحضور، ولا توجد قراءة جزئية آمنة من مصفوفة rows داخل الوثيقة. */
        isAdmin ? getRun(cyc.key) : Promise.resolve(null)
      ]);
      recs = loaded[0].physical;
      webRecs = loaded[0].mobile;
      run = loaded[1];
      adjustments = await adjustmentsForAttendanceRecords([
        { coll: 'zkAttendance', records: recs },
        { coll: 'attendance', records: webRecs }
      ]);
    }
    catch (e) { console.error(e); host.innerHTML = '<div class="card"><div class="empty">تعذّر تحميل سجل البصمة</div></div>'; return; }
    if (isStale(token)) return;

    const mine = adjustedUnifiedAttendance([u], recs, webRecs, adjustments);
    const reqs = getRequests().filter((r) => requestBelongsToEmployee(r, u));
    const rows = buildDailyStatus(cyc, [u], reqs, mine, { compensate: true });
    /* ⚠️ computePayroll تُسقط دور admin عمداً (لا مسير للأدمن)، فتُرجع مصفوفة
       فارغة حين يكون هذا البروفايل لأدمن — و [0] عندها undefined. كان الوصول
       إلى pay.lateMin بعدها يرمي فتنهار الصفحة كلها إلى «تعذّر عرض هذه
       الصفحة»: أي بروفايل أدمن كان مكسوراً بالكامل، لا بطاقة الراتب وحدها.
       الآن الغياب حالة معلَنة: إحصاءات الحضور تُعرض كاملة، وما يعتمد على
       المسير يُستبدل بسطر يشرح السبب. */
    const effectiveCfg = payrollConfigForRun(cfg, run);
    const payrollRecs = !run ? adjustedPayrollAttendance(
      [u], effectiveCfg, recs, webRecs, adjustments) : [];
    const freshPay = !run
      ? (computePayroll(cyc, [u], reqs, payrollRecs, { config: effectiveCfg })[0] || null)
      : null;
    /* الأدمن يأخذ اللقطة المجمدة كما هي. المدير لا يعيد حساب بديل Live
       عندما يُمنع من اللقطة، لأن ذلك سيغيّر تاريخ دورة معتمدة بصمت. */
    const pay = payrollRowForEmployee(run, freshPay, u);
    const payrollUnavailable = 'لا يوجد صف مسير لهذا الحساب';

    const cnt = (k) => rows.filter((r) => r.cls === k).length;
    const pres = cnt('present'), late = cnt('late'), abs = cnt('absent'),
          miss = cnt('missing'), lv = cnt('leave');
    const total = rows.length || 1;
    const metrics = attendanceMetrics(rows);
    const ins = rows.filter((r) => r.firstIn).map((r) => r.firstIn.getHours() * 60 + r.firstIn.getMinutes());
    const avgIn = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;

    host.innerHTML = '';
    const g = el('div', 'statgrid');
    g.append(
      statCard({ label: 'نسبة الحضور', value: metrics.attendanceRate === null ? '—' : metrics.attendanceRate + '%', ico: 'chart',
        tone: metrics.attendanceRate >= 90 ? 'good' : metrics.attendanceRate >= 75 ? 'warn' : 'bad',
        sub: 'الحضور الفعلي من أيام العمل المحتسبة' }),
      statCard({ label: 'نسبة الالتزام بالوقت', value: metrics.commitmentRate === null ? '—' : metrics.commitmentRate + '%', ico: 'check',
        tone: metrics.commitmentRate >= 90 ? 'good' : metrics.commitmentRate >= 75 ? 'warn' : 'bad', sub: 'بلا مخالفات زمنية' }),
      statCard({ label: 'أيام تأخير', value: late, ico: 'clock',
        tone: late ? 'warn' : 'good', sub: late ? 'يُخصم عليها بدقائقها' : 'لا تأخير' }),
      statCard({ label: 'أيام غياب', value: abs, ico: 'alert',
        tone: abs ? 'bad' : 'good', sub: abs ? 'بلا إجازة معتمَدة' : 'لا غياب' })
    );
    host.appendChild(g);

    const g2 = el('div', 'statgrid');
    g2.append(
      statCard({ label: 'إجمالي التأخير', value: pay ? hhmm(pay.lateMin) : '—', ico: 'clock',
        tone: pay && pay.lateMin ? 'warn' : '',
        sub: pay ? 'مجموع دقائق الدورة' : payrollUnavailable }),
      statCard({ label: 'خروج مبكر', value: pay ? hhmm(pay.earlyMin) : '—', ico: 'login',
        tone: pay && pay.earlyMin ? 'warn' : '',
        sub: pay ? 'قبل نهاية الوردية' : payrollUnavailable }),
      statCard({ label: 'نقص أثناء الوردية', value: pay ? hhmm(pay.gapMin || 0) : '—', ico: 'gap',
        tone: pay && pay.gapMin ? 'warn' : '',
        sub: pay ? 'غير مغطى باستئذان' : payrollUnavailable }),
      statCard({ label: 'نسيان بصمة خروج', value: miss, ico: 'gap',
        tone: miss ? 'warn' : 'good', sub: miss ? 'تحتاج تصحيحاً' : 'لا نواقص' }),
      statCard({ label: 'متوسّط وقت الحضور', ico: 'clock',
        value: avgIn !== null ? `${p2(Math.floor(avgIn / 60))}:${p2(avgIn % 60)}` : '—',
        sub: 'على أيام حضوره' })
    );
    host.appendChild(g2);

    const g3 = el('div', 'statgrid');
    g3.append(
      statCard({ label: 'ساعات عمل محتسبة', value: pay ? pay.workH.toFixed(1) : '—', ico: 'clock',
        sub: pay
          ? (run ? 'من لقطة المسير المعتمدة بعد الاستئذانات' : `حسب ${payrollSourceLabel(effectiveCfg)} بعد الاستئذانات`)
          : payrollUnavailable }),
      statCard({ label: 'ساعات مطلوبة', value: pay ? pay.reqH.toFixed(1) : '—', ico: 'scale',
        sub: pay ? 'حسب وردياته' : payrollUnavailable }),
      statCard({ label: 'أيام إجازة', value: lv, ico: 'calendar', sub: 'معتمَدة في الدورة' }),
      statCard({ label: 'طلبات في الدورة', ico: 'inbox',
        value: reqs.filter((r) => { const d = reqEventDate(r); return d >= cyc.start && d <= cyc.end; }).length,
        sub: 'استئذان وإجازة' })
    );
    host.appendChild(g3);

    /* توزيع الأيام */
    const bc = card('توزيع أيام الدورة');
    const seg = (n, label, color) =>
      `<div class="row-between mt-2"><span>${label}</span><b class="num">${n} يوم (${Math.round(n / total * 100)}%)</b></div>` +
      bar((n / total) * 100, color);
    bc.innerHTML += seg(pres, 'حاضر في الوقت', 'var(--green)') + seg(late, 'متأخر', 'var(--amber)') +
                    seg(abs, 'غائب', 'var(--red)') + seg(lv, 'إجازة', 'var(--info)') +
                    seg(miss, 'نسيان بصمة', 'var(--violet)');
    host.appendChild(bc);

    /* أثر الخصم — للأدمن وحده، فهو تفصيل رواتب */
    if (!isAdmin) {
      /* مدير القسم لا يرى أرقام الراتب إطلاقاً */
    } else if (!pay) {
      const w = card('');
      w.appendChild(empty(payrollUnavailable, 'money'));
      w.appendChild(el('p', 'help',
        'إحصاءات الحضور أعلاه من المصدرين الموحّدين — المستثنى هو المسير وحده.'));
      host.appendChild(w);
    } else if (pay.salary) {
      const pc = card(run
        ? 'أثر الالتزام على الراتب — لقطة معتمدة ومجمّدة'
        : 'أثر الالتزام على راتب هذه الدورة', null, 'money');
      pc.innerHTML += `
        <div class="detail-list">
          <div class="detail-line"><span class="k">الراتب الأساسي</span><span class="v money">${money(pay.salary)}</span></div>
          <div class="detail-line"><span class="k">خصم الساعات (${hhmm(pay.lateMin + pay.earlyMin + (pay.gapMin || 0))} × ${money(pay.hourRate)})</span><span class="v money neg">− ${money(pay.dedHours)}</span></div>
          <div class="detail-line"><span class="k">خصم الغياب (${pay.absentDays} يوم × ${money(pay.dayRate)})</span><span class="v money neg">− ${money(pay.dedAbsent)}</span></div>
          <div class="detail-line"><span class="k">خصم إجازة بدون راتب (${pay.unpaidDays} يوم)</span><span class="v money neg">− ${money(pay.dedUnpaid)}</span></div>
          <div class="detail-line detail-line--total"><span class="k">المستحق</span><span class="v money net">${money(pay.net)}</span></div>
        </div>
        ${pay.exemptMin ? `<p class="help">أُعفي ${hhmm(pay.exemptMin)} بسبب استئذانات معتمدة.</p>` : ''}
        ${pay.missingOut ? `<p class="help text-violet">${pay.missingOut} يوم بلا بصمة انصراف — راجعها قبل اعتماد المسير.</p>` : ''}`;
      host.appendChild(pc);
    } else {
      /* ⚠️ كان `else if (showMoney)` — بقيّة من حلّ تعارض الدمج، والاسم غير
         معرَّف في هذا الملف. يُرمى ReferenceError عند فتح الأدمن لبروفايل
         موظف بلا راتب محدَّد، وهي حالة كل موظف جديد. والفرع داخل isAdmin
         أصلاً، فالشرط كان زائداً حتى لو كان الاسم صحيحاً. */
      const w = card('');
      w.appendChild(empty('لم يُحدَّد راتب لهذا الموظف — اضغط «تعديل البيانات والراتب» لإضافته.'));
      host.appendChild(w);
    }

    /* تفصيل الأيام */
    const dc = card('تفصيل أيام الدورة', null, 'calendar');
    if (!rows.length) dc.appendChild(empty('لا أيام عمل في هذه الدورة'));
    else dc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th class="num">التاريخ</th><th>اليوم</th><th>الوردية</th><th>الحالة</th><th class="num">دخول</th><th class="num">خروج</th><th class="num">الساعات</th><th>ملاحظة</th></tr></thead>
        <tbody>${rows.map((r) => {
          const p = attendancePresentation(r);
          return `<tr>
          <td class="num">${esc(r.dateStr)}</td>
          <td>${AR_DAYS[r.dow]}</td>
          <td class="cell-sub">${esc(shiftText(r.shift))}</td>
          <td><span class="pill pill--dot ${esc(r.cls)}">${esc(r.status)}</span></td>
          <td class="num text-green">${p.officialIn ? hm(p.officialIn) : '—'}</td>
          <td class="num text-red">${p.officialOut ? hm(p.officialOut) : '—'}</td>
          <td class="num">${r.secs > 0 ? fmtDur(r.secs) : '—'}</td>
          <td class="cell-sub">${esc(r.note || '')}</td></tr>`;
        }).join('')}</tbody>
      </table>`));
    host.appendChild(dc);
  }

  dd.onchange = draw;
  await draw();
}
