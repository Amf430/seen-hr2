/* ═══════════════════════════════════════════════════════════════════════════
   لوحة القيادة.

   شكوى المالك كانت أن اللوحة تُظهر النظام وكأنه «استئذانات وإجازات» فقط.
   السبب أن اللوحة القديمة كانت أربعة عدّادات كلها عن الطلبات.

   هنا الترتيب مقلوب: القوى العاملة ثم الحضور اليوم ثم تكلفة الرواتب ثم ما
   يحتاج إجراءً — والطلبات بطاقة واحدة في الأسفل. كل رقم مشتقّ من بيانات
   موجودة فعلاً، ومن نفس الدوال المعتمدة (computePayroll) حتى لا يختلف رقم
   اللوحة عن رقم المسير أبداً.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getUsers, getRequests, getMe } from '../lib/state.js';
import { cycleOf, ymdKsa } from '../lib/dates.js';
import { fmtDate as fd, money, hhmm, hm, greeting, firstName, fmtDayDate } from '../lib/format.js';
import { fetchAttendance } from '../lib/attendance.js';
import { payrollConfig } from '../lib/payroll.js';
import { canApprove } from '../lib/perms.js';
import { go, isStale } from '../lib/nav.js';
import { setProfileUid } from '../lib/state.js';
import { workforce, todayAttendance, contracts, payrollSummary, requestPulse, actionItems,
         weeklyPunctuality, weekWindow } from '../lib/hr-stats.js';
import { dailySeries, anniversariesToday } from '../lib/pulse.js';
import { donut, barList } from '../lib/charts.js';
import { hasChain, ownsCurrentStep } from '../lib/requests.js';
import { publishLeaderboard, readLeaderboard } from '../lib/leaderboard.js';
import { topPunctualCard } from '../components/top-punctual.js';
import { expiringDocs, kindLabel } from '../lib/documents.js';
import { card, grid, stat, empty, tableWrap, sectionHead, button, statCard, callout } from '../lib/ui.js';
import { miniRow, approvalRow } from '../components/request-card.js';
import { monthlyExport } from '../lib/excel.js';
import { adjustmentsInRange, adjustedUnifiedAttendance, adjustedPayrollAttendance } from '../lib/adjustments.js';
import { loadRequiredAttendanceSources, payrollConfigForRun, payrollSourceLabel } from '../lib/attendance-sources.js';
import { getRun } from '../lib/payroll-runs.js';

export async function render(view, token) {
  const cyc = cycleOf(new Date());
  const users = getUsers();
  const reqs = getRequests();

  /* ── الافتتاح: تحية ووقت ثم سطر يشرح اليوم ──
     كان شريط الدورة أول ما تراه: صحيح ومفيد، لكنه يفتح الشاشة بمعلومة إدارية
     لا بحال الشركة. الدورة انتقلت إلى سطر السياق تحت التحية. */
  const me = getMe();
  const now = new Date();
  const head = el('header', 'pagehead');
  head.innerHTML =
    `<div class="pagehead__when">${esc(fmtDayDate(now))} · ${esc(hm(now))}</div>` +
    `<h1 class="pagehead__title">${esc(greeting(now))}${me?.name ? '، ' + esc(firstName(me.name)) : ''}</h1>` +
    `<p class="pagehead__sub">نبض الشركة اليوم · الدورة ${esc(cyc.label)} — يبدأ عدّ جديد في ${esc(fd(cyc.nextReset))}</p>`;
  view.appendChild(head);

  /* ── القوى العاملة — تُرسم فوراً، لا تنتظر أي جلب ── */
  const wf = contracts(users);
  const w = workforce(users);

  /* ⚠️ شريط النبض يُملأ بعد جلب حضور اليوم، لكنه يُرسم الآن بأرقام القوى
     العاملة وحدها. الحاوية تُستبدل لاحقاً بدل أن تبقى الشاشة فارغة —
     الأدمن يرى القوى العاملة فوراً بينما يُقرأ الحضور. */
  const pulseHost = el('div', '');
  const firstGrid = el('div', 'statgrid');
  firstGrid.append(
    statCard({ label: 'الحضور اليوم', value: '…', ico: 'dot', sub: 'جارٍ قراءة حضور اليوم' }),
    statCard({ label: 'على رأس العمل', value: w.active, ico: 'people' }),
    statCard({ label: 'يعملون عن بُعد', value: w.remote, ico: 'globe', tone: 'info' }),
    statCard({ label: 'عقود تحتاج متابعة', value: wf.soon.length + wf.expired.length, ico: 'doc',
      tone: wf.expired.length ? 'bad' : wf.soon.length ? 'warn' : 'good',
      sub: wf.expired.length ? `${wf.expired.length} منها منتهٍ فعلاً` : 'خلال ٦٠ يوماً' })
  );
  pulseHost.appendChild(firstGrid);
  view.appendChild(pulseHost);

  /* ── حاويات تُملأ بعد الجلب ── */
  const liveHost = el('div', ''); view.appendChild(liveHost);

  const alertHost = el('div', ''); view.appendChild(alertHost);
  const payHost   = el('div', ''); view.appendChild(payHost);

  /* ── الطلبات: بطاقة واحدة، في الأسفل ── */
  const rp = requestPulse(cyc, reqs, canApprove);
  {
    const rc = card('');
    rc.appendChild(sectionHead({ text: 'الطلبات', icon: 'inbox' },
      button('عرض الكل', 'btn sm ghost', () => go('inbox'))));
    const rg = grid(4);
    rg.append(
      stat(rp.pending, 'بانتظار المراجعة', rp.pending ? 'a' : ''),
      stat(rp.cycleTotal, 'طلبات الدورة'),
      stat(rp.permissions, 'استئذانات'),
      stat(rp.leaves, 'إجازات')
    );
    rc.appendChild(rg);
    const waiting = reqs.filter((r) => r.status === 'pending').slice(0, 3);
    if (!waiting.length) rc.appendChild(empty('لا توجد طلبات معلّقة', 'check'));
    else waiting.forEach((r) => rc.appendChild(miniRow(r)));
    view.appendChild(rc);
  }

  /* ⚠️ «التوزيع حسب القسم» انتقل إلى الصفّ غير المتماثل بجوار حلقة اليوم،
     ويُبنى بعد الجلب من w2 لا من w — الأولى كانت تُلتقط قبل وصول القائمة
     فتعرض أقساماً فارغة. */

  /* ── تحديثات اليوم ──
     يقابل «Today's updates» في مرجع التصميم: ثلاثة أعمدة بأيقونات ملوّنة.
     المصادر هنا حقيقية — إعلان منشور، وذكرى التحاق من hireDate. ولا أعياد
     ميلاد: الحقل غير موجود في وثيقة الموظف، ورسمُه فارغاً يوحي بأننا نتتبّعه. */
  const updHost = el('div', ''); view.appendChild(updHost);

  /* ── اختصارات ── */
  const qc = card('');
  qc.appendChild(sectionHead('اختصارات',
    button('تصدير تقرير الدورة', 'btn sm ghost', () => monthlyExport(cyc, getRequests()), 'download'),
    button('الموظفون', 'btn sm ghost', () => go('employees')),
    button('مسير الرواتب', 'btn sm ghost', () => go('payroll'))));
  view.appendChild(qc);

  /* ═══ الجلب المتأخر ═══ */
  const today = ymdKsa(new Date());
  const wk = weekWindow();
  let todayRecs = [], zk = [], cycleWeb = [], weekWeb = [], weekZk = [], adjustments = [], run = null;
  try {
    /* ⚠️ نافذة الأسبوع تُجلب كاملةً من المصدرين: لوحة المنتظمين تحسب
       «أيّهما أبكر»، ولا يكفيها سجل اليوم من الجوال ولا دورة الجهاز وحدها. */
    const adjFrom = ymdKsa(wk.start < cyc.start ? wk.start : cyc.start);
    const adjTo = ymdKsa(wk.end > cyc.end ? wk.end : cyc.end);
    const loaded = await Promise.all([
      loadRequiredAttendanceSources({
        physical: () => fetchAttendance(cyc, 'zkAttendance'),
        mobile: () => fetchAttendance(cyc, 'attendance')
      }),
      loadRequiredAttendanceSources({
        physical: () => fetchAttendance(wk, 'zkAttendance'),
        mobile: () => fetchAttendance(wk, 'attendance')
      }),
      adjustmentsInRange(adjFrom, adjTo),
      getRun(cyc.key)
    ]);
    zk = loaded[0].physical;
    cycleWeb = loaded[0].mobile;
    weekZk = loaded[1].physical;
    weekWeb = loaded[1].mobile;
    adjustments = loaded[2];
    run = loaded[3];
    todayRecs = cycleWeb.filter((r) => r.date === today);
  } catch (e) {
    console.error(e);
    if (isStale(token)) return;
    pulseHost.innerHTML = '';
    pulseHost.appendChild(callout('warn', 'تعذّرت قراءة حقيقة الحضور',
      'لم تُعرض مؤشرات الحضور لأن أحد مصادر السجل أو التصحيحات المعتمدة لم يُقرأ كاملاً.'));
    return;
  }
  if (isStale(token)) return;

  /* ⚠️ تُقرأ قائمة الموظفين من جديد هنا، ولا يُعاد استعمال `users` المُلتقطة
     في أول السطور.

     refreshUsers() تعمل بالتوازي مع أول عرض للوحة (انظر subscribeData)، فعند
     أول تحميل تُعرض اللوحة والقائمة ما زالت فارغة. و`users` مُلتقطة مرة واحدة
     قبل الـawait، فتبقى فارغة إلى آخر العرض مهما وصل بعدها.

     الأثر لم يكن رقماً ناقصاً بل جملةً كاذبة: expected=0 يعني «لا أحد عليه
     وردية»، فيكتب الشريط «راحة أو عطلة رسمية — لا دوام مجدول» في وسط يوم
     عمل عادي. ويبقى كذلك حتى ينتقل الأدمن لصفحة أخرى ويعود. */
  const staff = getUsers();
  /* ⚠️ وكل ما اشتُقّ من القائمة يُعاد اشتقاقه: wf و w حُسبتا قبل الـawait
     أيضاً، فكانتا تعرضان «٠ على رأس العمل» و«٠ عقود تحتاج متابعة» في نفس
     اللحظة — أرقام تبدو معقولة فلا يشكّ فيها أحد. */
  const wf2 = contracts(staff);
  const w2  = workforce(staff);

  /* ── أفضل المنتظمين أسبوعياً ──
     الأدمن يحسبها هنا لأنه الوحيد الذي يقرأ سجلات الجميع، ثم ينشرها في
     وثيقة صغيرة يقرأها الموظفون في رئيسيتهم. بلا هذا النشر تخرج اللوحة
     فارغة عند كل موظف — قاعدة zkAttendance تسمح له بسجلاته هو فقط.

     ⚠️ النشر لا يُعطّل اللوحة إن فشل: بطاقة تحفيز لا تستحق أن تُسقط لوحة
     القيادة كلها، فنعرض المحسوب محلياً ونمضي. */
  const weekAdjustments = adjustments.filter((a) =>
    a.date >= ymdKsa(wk.start) && a.date <= ymdKsa(wk.end));
  const weekUnified = adjustedUnifiedAttendance(staff, weekZk, weekWeb, weekAdjustments);
  const punc = weeklyPunctuality(staff, weekUnified, reqs);
  if (punc.board.length) {
    publishLeaderboard({ board: punc.board, window: punc.window, minDays: punc.minDays })
      .catch((e) => console.error('publish leaderboard', e));
  }
  readLeaderboard().then((data) => {
    /* المنشور أولاً ليطابق ما يراه الموظف بالضبط؛ وإن لم يُنشر بعد فالمحسوب */
    /* ⚠️ الاسم puncCard لا card: `card` مستورَدة من ui.js في أعلى الملف،
       وتسميتها هنا تُظلّلها داخل هذه الدالة — فأول من يحتاج card() لاحقاً
       يجدها بطاقةَ لوحةٍ لا دالةَ بناء. */
    const puncCard = topPunctualCard(data || {
      top: punc.board.slice(0, 3).map((x, i) => ({ rank: i + 1, name: x.name,
        department: x.department, rate: x.rate, days: x.counted })),
      from: ymdKsa(punc.window.start), to: ymdKsa(punc.window.end), minDays: punc.minDays, at: new Date()
    });
    /* نفس السبب: #view لا يُستبدل، فـ isConnected لا يكشف إعادة العرض */
    if (isStale(token)) return;
    if (puncCard) view.appendChild(puncCard);
  });

  /* ── شريط النبض النهائي: الحضور الحيّ يتصدّر ── */
  const todayUnified = adjustedUnifiedAttendance(
    staff, zk.filter((r) => r.date === today), todayRecs,
    adjustments.filter((a) => a.date === today));
  const ta = todayAttendance(staff, todayUnified, reqs);
  const rateColor = (r) => r >= 90 ? 'var(--green)' : r >= 70 ? 'var(--amber)' : 'var(--red)';

  /* ⚠️ سلسلة الأسبوع من المصدرين معاً: الجوال وجهاز البصمة مستقلّان، ومن
     يقرأ أحدهما وحده يرى نصف الحضور. dailySeries تعدّ الموظفين لا السجلات
     فلا يُحسب من بصم في الاثنين مرّتين. */
  const series = dailySeries(weekUnified, weekWindow());
  const spark = series.map((d) => d.count);

  pulseHost.innerHTML = '';
  const sg = el('div', 'statgrid');
  sg.append(
    ta.expected
      ? statCard({ label: 'الحضور اليوم', value: `${ta.rate ?? 0}٪`, ico: 'dot',
          tone: ta.rate >= 90 ? 'good' : ta.rate >= 70 ? 'warn' : 'bad',
          sub: `سجّل ${ta.checkedIn} من ${ta.expected} · داخل العمل الآن ${ta.inNow}`,
          spark, onClick: () => go('attendance') })
      : statCard({ label: 'اليوم', value: 'راحة', ico: 'calendar',
          sub: 'راحة أو عطلة رسمية — لا دوام مجدول' }),
    statCard({ label: 'لم يسجّلوا', value: ta.expected ? ta.absent : '—', ico: 'alert',
      tone: ta.absent ? 'bad' : 'good',
      sub: ta.expected ? `من أصل ${ta.expected} عليهم وردية` : 'لا دوام اليوم',
      onClick: ta.expected ? () => go('attendance') : null }),
    statCard({ label: 'في إجازة', value: ta.onLeave, ico: 'doc', tone: 'info',
      sub: `${w2.active} على رأس العمل · ${w2.remote} عن بُعد` }),
    statCard({ label: 'عقود تحتاج متابعة', value: wf2.soon.length + wf2.expired.length, ico: 'doc',
      tone: wf2.expired.length ? 'bad' : wf2.soon.length ? 'warn' : 'good',
      sub: wf2.expired.length ? `${wf2.expired.length} منها منتهٍ فعلاً` : 'خلال ٦٠ يوماً',
      onClick: () => go('employees') })
  );
  pulseHost.appendChild(sg);

  /* ── صفّ غير متماثل: حلقة اليوم بجوار توزيع الأقسام ── */
  const split = el('div', 'split');

  const ringCard = card('');
  ringCard.appendChild(sectionHead({ text: 'لقطة اليوم', icon: 'dot' },
    button('كل السجل', 'btn sm ghost', () => go('attendance'))));
  const ring = el('div', 'ringbox');
  const segs = [
    { value: ta.checkedIn, color: 'var(--green)', label: 'سجّل حضوره' },
    { value: ta.onLeave,   color: 'var(--info)',  label: 'في إجازة' },
    { value: ta.absent,    color: 'var(--red)',   label: 'لم يسجّل' }
  ];
  ring.innerHTML = donut(segs, {
    centerValue: ta.expected ? `${ta.rate ?? 0}٪` : '—',
    centerLabel: ta.expected ? `من ${ta.expected}` : 'لا دوام',
    emptyLabel: 'لا دوام مجدول اليوم'
  }) + `<div class="legend">${segs.map((s) => `
      <div class="legend__row">
        <span class="legend__dot" style="background:${s.color}"></span>
        <span class="legend__label">${esc(s.label)}</span>
        <span class="legend__value num">${s.value}</span>
      </div>`).join('')}</div>`;
  ringCard.appendChild(ring);

  const deptCard = card('');
  deptCard.appendChild(sectionHead({ text: 'التوزيع حسب القسم', icon: 'building' },
    button('الموظفون', 'btn sm ghost', () => go('employees'))));
  deptCard.innerHTML += w2.departments.length
    ? barList(w2.departments.map(([name, n]) => ({ label: name, value: n })))
    : '';
  if (!w2.departments.length) deptCard.appendChild(empty('لا أقسام بعد', 'building'));

  split.append(deptCard, ringCard);
  pulseHost.appendChild(split);

  /* من هو داخل العمل الآن */
  liveHost.innerHTML = '';
  if (ta.insideNow.length) {
    const lc = card('');
    lc.appendChild(sectionHead({ text: `داخل العمل الآن (${ta.inNow})`, icon: 'dot' },
      button('كل السجل', 'btn sm ghost', () => go('attendance'))));
    lc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th>الموظف</th><th>القسم</th><th>المصدر</th><th class="num">منذ</th></tr></thead>
        <tbody>${ta.insideNow.slice(0, 10).map((x) => `<tr>
          <td><b>${esc(x.u.name)}</b></td>
          <td>${esc(x.u.department || '—')}</td>
          <td>${esc(x.sourceLabel || '—')}</td>
          <td class="num">${x.since ? hm(x.since) : '—'}</td></tr>`).join('')}</tbody>
      </table>`));
    if (ta.insideNow.length > 10)
      lc.appendChild(el('p', 'help', `و${ta.insideNow.length - 10} آخرون.`));
    liveHost.appendChild(lc);
  }

  /* ── صفّ: الطلبات المعلّقة | تفصيل الرواتب ── */
  const currentPayrollCfg = payrollConfig();
  const effectivePayrollCfg = payrollConfigForRun(currentPayrollCfg, run);
  let ps;
  if (run) {
    ps = payrollSummary(cyc, staff, reqs, [], { config: effectivePayrollCfg, run });
  } else {
    const payrollRecs = adjustedPayrollAttendance(
      staff, effectivePayrollCfg, zk, cycleWeb, adjustments);
    ps = payrollSummary(cyc, staff, reqs, payrollRecs,
      { config: effectivePayrollCfg, run: null });
  }
  const paySplit = el('div', 'split split--even');

  /* الاعتمادات — قرار من اللوحة بلا فتح صفحة */
  const apc = card('');
  const pendingList = reqs.filter((r) =>
    r.status === 'pending' && (hasChain(r) ? ownsCurrentStep(r) : canApprove(r)));
  const paintApprovals = () => {
    apc.innerHTML = '';
    apc.appendChild(sectionHead({ text: 'بانتظار موافقتك', icon: 'inbox' },
      button('كل الطلبات', 'btn sm ghost', () => go('inbox'))));
    apc.appendChild(el('p', 'help', `${pendingList.length} بانتظار قرارك`));
    if (!pendingList.length) { apc.appendChild(empty('لا شيء ينتظر قرارك', 'check')); return; }
    /* ⚠️ القرار يُحدّث اللوحة في مكانها ولا ينقل المستخدم لصفحة الطلبات.
       الغرض من الاعتماد هنا أن يُنجزه الأدمن دون مغادرة لوحته — ونقلُه بعد
       كل موافقة يجعل اللوحة بابَ عبور لا مكانَ عمل، ويضيّع بقيّة ما كان
       يقرؤه فيها.
       أربعة صفوف فقط: اللوحة نظرة عامة، والبقيّة في صفحتها. */
    pendingList.slice(0, 4).forEach((r) => apc.appendChild(approvalRow(r, () => {
      const i = pendingList.indexOf(r);
      if (i >= 0) pendingList.splice(i, 1);
      paintApprovals();
    })));
    if (pendingList.length > 4)
      apc.appendChild(el('p', 'help', `و${pendingList.length - 4} طلبات أخرى في صفحة الطلبات.`));
  };
  paintApprovals();

  /* تفصيل الرواتب — إلى أين يذهب المسير، وأين نحن من الدورة */
  const pc = card('');
  pc.appendChild(sectionHead({ text: 'تفصيل الرواتب', icon: 'money' },
    button('فتح المسير', 'btn sm ghost', () => go('payroll'))));
  {
    pc.appendChild(el('p', 'help', run
      ? `لقطة المسير المعتمدة والمجمّدة — المصدر وقت الاعتماد: ${payrollSourceLabel(effectivePayrollCfg)}`
      : `إلى أين يذهب مسير هذه الدورة — المصدر: ${payrollSourceLabel(effectivePayrollCfg)}`));

    /* ⚠️ الشرائح: المستحق + الخصومات = إجمالي الرواتب. لا نضيف «ضرائب» ولا
       «بدلات» كما في مرجع التصميم — لا وجود لهما في بياناتنا. */
    const paySegs = [
      { value: Math.max(0, ps.net), color: 'var(--green)', label: 'المستحق' },
      { value: Math.max(0, ps.total), color: 'var(--red)', label: 'الخصومات' }
    ];
    const payRing = el('div', 'ringbox');
    const gross = ps.salary || 1;
    payRing.innerHTML = donut(paySegs, {
      centerValue: money(ps.net), centerLabel: 'المستحق', centerSize: 15,
      emptyLabel: 'لا مسير محسوب بعد'
    }) + `<div class="legend">${paySegs.map((s) => `
        <div class="legend__row">
          <span class="legend__dot" style="background:${s.color}"></span>
          <span class="legend__label">${esc(s.label)}</span>
          <span class="legend__value num">${Math.round((s.value / gross) * 100)}٪</span>
        </div>`).join('')}
        <div class="legend__row">
          <span class="legend__dot" style="background:var(--amber)"></span>
          <span class="legend__label">تأخير وخروج مبكر</span>
          <span class="legend__value num">${esc(hhmm(ps.lateMin + ps.earlyMin))}</span>
        </div></div>`;
    pc.appendChild(payRing);
  }

  /* تقدّم الدورة — أيام حقيقية، لا خطوات اعتماد لا وجود لها عندنا */
  const dayMs = 86400000;
  const spanDays = Math.max(1, Math.round((cyc.end - cyc.start) / dayMs) + 1);
  const goneDays = Math.min(spanDays, Math.max(0, Math.round((new Date() - cyc.start) / dayMs) + 1));
  const leftDays = Math.max(0, spanDays - goneDays);
  const prog = el('div', 'cycleprog');
  prog.innerHTML =
    `<div class="cycleprog__head">` +
      `<span>مضى ${goneDays} من ${spanDays} يوماً</span>` +
      `<span>${leftDays ? `يُقفل بعد ${leftDays} يوماً` : 'تُقفل اليوم'}</span>` +
    `</div>` +
    `<span class="cycleprog__track"><i style="inline-size:${Math.round((goneDays / spanDays) * 100)}%"></i></span>`;
  pc.appendChild(prog);

  paySplit.append(apc, pc);
  payHost.appendChild(paySplit);

  /* ── تحديثات اليوم ── */
  const anniv = anniversariesToday(staff, today);
  const newHires = staff.filter((u) => typeof u.hireDate === 'string' &&
    (new Date(today) - new Date(u.hireDate)) / 86400000 <= 30 &&
    new Date(u.hireDate) <= new Date(today));
  const updates = [
    ...anniv.slice(0, 2).map((x) => ({
      ico: 'people', tone: 'info', title: `${x.user.name} — ${x.years} سنوات`,
      body: `التحق في ${fd(x.user.hireDate)}. شكراً على ${x.years} سنوات من العمل.` })),
    ...newHires.slice(0, 2).map((u) => ({
      ico: 'plus', tone: 'good', title: `${u.name} انضمّ حديثاً`,
      body: `${u.jobTitle || 'موظف'} · ${u.department || '—'} — التحق في ${fd(u.hireDate)}.` })),
    ...(wf2.expired.length ? [{ ico: 'alert', tone: 'bad',
      title: `${wf2.expired.length} عقد منتهٍ`,
      body: 'عقود تجاوزت تاريخ انتهائها ولم تُجدَّد بعد. افتح ملفات الموظفين لتجديدها.' }] : [])
  ];
  if (updates.length) {
    const uc = card('');
    uc.appendChild(sectionHead({ text: 'تحديثات اليوم', icon: 'megaphone' },
      button('الإعلانات', 'btn sm ghost', () => go('announcements'))));
    const ug = el('div', 'updates');
    ug.innerHTML = updates.slice(0, 3).map((u) => `
      <div class="update">
        <span class="update__ic update__ic--${esc(u.tone)}">${icon(u.ico)}</span>
        <div class="update__body">
          <b class="update__title">${esc(u.title)}</b>
          <p class="update__text">${esc(u.body)}</p>
        </div>
      </div>`).join('');
    uc.appendChild(ug);
    updHost.appendChild(uc);
  }

  /* ما يحتاج إجراءً */
  const ds = expiringDocs(staff);
  const items = actionItems({
    workforceStats: w, contractStats: wf, payroll: ps,
    requests: rp, attendance: ta.expected ? ta : null, docStats: ds
  });
  if (items.length) {
    const ac = card('يحتاج إجراءً', null, 'alert');
    const stack = el('div', 'alert-stack');
    items.forEach((it) => {
      const row = el('button', 'alert-item alert-item--' + it.kind,
        `<span class="alert-item__ic">${icon(it.icon)}</span>`
        + `<span class="alert-item__body"><span class="alert-item__title">${esc(it.text)}</span></span>`
        + icon('back', 'alert-item__go'));
      row.onclick = () => go(it.page);
      stack.appendChild(row);
    });
    ac.appendChild(stack);
    alertHost.appendChild(ac);
  }

  /* ── المستندات المنتهية ──
     فوق العقود لأنها أشدّ إلحاحاً: إقامة منتهية = غرامة على الشركة بأثر يومي. */
  if (ds.expired.length || ds.soon.length) {
    const dc = card('مستندات تحتاج تجديداً', null, 'alert');
    dc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th>الموظف</th><th>المستند</th><th class="num">ينتهي</th><th>الحالة</th></tr></thead>
        <tbody>${[...ds.expired, ...ds.soon].slice(0, 12).map((x) => `<tr>
          <td><b>${esc(x.u.name)}</b><div class="cell-sub">${esc(x.u.department || '—')}</div></td>
          <td>${esc(kindLabel(x.d.kind))}</td>
          <td class="num">${esc(x.d.expiresOn || '—')}</td>
          <td>${x.left < 0
            ? `<span class="pill pill--dot rejected">منتهٍ منذ ${Math.abs(x.left)} يوم</span>`
            : `<span class="pill pill--dot pending">${x.left} يوم</span>`}</td></tr>`).join('')}</tbody>
      </table>`));
    if (ds.expired.length + ds.soon.length > 12) {
      dc.appendChild(el('p', 'help',
        `يُعرض ١٢ من ${ds.expired.length + ds.soon.length} — الأقرب انتهاءً أولاً.`));
    }
    alertHost.appendChild(dc);
  }

  /* العقود المنتهية قريباً */
  if (wf2.expired.length || wf2.soon.length) {
    const cc = card('عقود تحتاج متابعة', null, 'doc');
    cc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th>الموظف</th><th>القسم</th><th class="num">ينتهي</th><th>الحالة</th></tr></thead>
        <tbody>${[...wf2.expired, ...wf2.soon].slice(0, 12).map((x) => `<tr>
          <td><b>${esc(x.u.name)}</b></td>
          <td>${esc(x.u.department || '—')}</td>
          <td class="num">${esc(x.u.contractEnd)}</td>
          <td>${x.left < 0
            ? `<span class="pill pill--dot rejected">منتهٍ منذ ${Math.abs(x.left)} يوم</span>`
            : `<span class="pill pill--dot pending">${x.left} يوم</span>`}</td></tr>`).join('')}</tbody>
      </table>`));
    alertHost.appendChild(cc);
  }
}

export { setProfileUid };
