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
import { getUsers, getRequests } from '../lib/state.js';
import { cycleOf, ymd } from '../lib/dates.js';
import { fmtDate as fd, money, hhmm, hm } from '../lib/format.js';
import { fetchAttendance } from '../lib/attendance.js';
import { canApprove } from '../lib/perms.js';
import { go, isStale } from '../lib/nav.js';
import { setProfileUid } from '../lib/state.js';
import { workforce, todayAttendance, contracts, payrollSummary, requestPulse, actionItems,
         weeklyPunctuality, weekWindow } from '../lib/hr-stats.js';
import { publishLeaderboard, readLeaderboard } from '../lib/leaderboard.js';
import { topPunctualCard } from '../components/top-punctual.js';
import { expiringDocs, kindLabel } from '../lib/documents.js';
import { card, grid, stat, empty, tableWrap, sectionHead, button, bar, pulseBand } from '../lib/ui.js';
import { miniRow } from '../components/request-card.js';
import { monthlyExport } from '../lib/excel.js';

export async function render(view, token) {
  const cyc = cycleOf(new Date());
  const users = getUsers();
  const reqs = getRequests();

  /* ── شريط الدورة ── */
  const band = el('div', 'period-band');
  band.innerHTML = `
    <div>
      <div class="period-band__label">الدورة الشهرية الحالية</div>
      <div class="period-band__value">${esc(cyc.label)}</div>
    </div>
    <div class="period-band__side">
      <div class="period-band__label">يبدأ عدّ جديد في</div>
      <div class="period-band__value sm">${fd(cyc.nextReset)}</div>
    </div>`;
  view.appendChild(band);

  /* ── القوى العاملة — تُرسم فوراً، لا تنتظر أي جلب ── */
  const wf = contracts(users);
  const w = workforce(users);

  /* ⚠️ شريط النبض يُملأ بعد جلب حضور اليوم، لكنه يُرسم الآن بأرقام القوى
     العاملة وحدها. الحاوية تُستبدل لاحقاً بدل أن تبقى الشاشة فارغة —
     الأدمن يرى القوى العاملة فوراً بينما يُقرأ الحضور. */
  const pulseHost = el('div', '');
  pulseHost.appendChild(pulseBand([
    { label: 'داخل العمل الآن', value: '…', ico: 'dot', lead: true,
      sub: 'جارٍ قراءة حضور اليوم' },
    { label: 'على رأس العمل', value: w.active, ico: 'people' },
    { label: 'يعملون عن بُعد', value: w.remote, ico: 'globe' },
    { label: 'عقود تحتاج متابعة', value: wf.soon.length + wf.expired.length, ico: 'doc',
      tone: wf.expired.length ? 'bad' : wf.soon.length ? 'warn' : '',
      sub: wf.expired.length ? `${wf.expired.length} منها منتهٍ فعلاً` : 'خلال ٦٠ يوماً' }
  ]));
  view.appendChild(pulseHost);

  /* ── حاويات تُملأ بعد الجلب ── */
  const liveHost = el('div', ''); view.appendChild(liveHost);

  const alertHost = el('div', ''); view.appendChild(alertHost);
  const payHost   = el('div', ''); view.appendChild(payHost);

  /* ── الطلبات: بطاقة واحدة، في الأسفل ── */
  const rp = requestPulse(cyc, reqs, canApprove);
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

  /* ── الأقسام ── */
  if (w.departments.length) {
    const dc = card('التوزيع حسب القسم', null, 'building');
    const max = w.departments[0][1] || 1;
    dc.innerHTML += w.departments.map(([name, n]) => `
      <div class="row-between mt-2"><span>${esc(name)}</span><b class="num">${n}</b></div>
      ${bar((n / max) * 100, 'var(--maroon)')}`).join('');
    view.appendChild(dc);
  }

  /* ── اختصارات ── */
  const qc = card('');
  qc.appendChild(sectionHead('اختصارات',
    button('تصدير تقرير الدورة', 'btn sm ghost', () => monthlyExport(cyc, getRequests()), 'download'),
    button('الموظفون', 'btn sm ghost', () => go('employees')),
    button('مسير الرواتب', 'btn sm ghost', () => go('payroll'))));
  view.appendChild(qc);

  /* ═══ الجلب المتأخر ═══ */
  const today = ymd(new Date());
  let todayRecs = [], zk = [], weekWeb = [], weekZk = [];
  try {
    const cur = { start: new Date(today + 'T00:00:00'), end: new Date(today + 'T23:59:59') };
    /* ⚠️ نافذة الأسبوع تُجلب كاملةً من المصدرين: لوحة المنتظمين تحسب
       «أيّهما أبكر»، ولا يكفيها سجل اليوم من الجوال ولا دورة الجهاز وحدها. */
    const wk = weekWindow();
    [todayRecs, zk, weekWeb, weekZk] = await Promise.all([
      fetchAttendance(cur, 'attendance').catch(() => []),
      fetchAttendance(cyc, 'zkAttendance').catch(() => []),
      fetchAttendance(wk, 'attendance').catch(() => []),
      fetchAttendance(wk, 'zkAttendance').catch(() => [])
    ]);
  } catch (e) { console.error(e); }
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
  const punc = weeklyPunctuality(staff, weekZk, weekWeb, reqs);
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
      from: ymd(punc.window.start), to: ymd(punc.window.end), minDays: punc.minDays, at: new Date()
    });
    /* نفس السبب: #view لا يُستبدل، فـ isConnected لا يكشف إعادة العرض */
    if (isStale(token)) return;
    if (puncCard) view.appendChild(puncCard);
  });

  /* ── شريط النبض النهائي: الحضور الحيّ يتصدّر ── */
  const ta = todayAttendance(staff, todayRecs, reqs);
  const rateColor = (r) => r >= 90 ? 'var(--green)' : r >= 70 ? 'var(--amber)' : 'var(--red)';

  pulseHost.innerHTML = '';
  pulseHost.appendChild(pulseBand([
    ta.expected
      ? { label: 'داخل العمل الآن', value: ta.inNow, unit: `/ ${ta.expected}`, ico: 'dot',
          lead: true, tone: 'good',
          meter: ta.rate !== null ? { pct: ta.rate, color: rateColor(ta.rate) } : null,
          sub: ta.rate !== null ? `سجّل حضوره ${ta.checkedIn} من ${ta.expected} — ${ta.rate}٪` : '' }
      : { label: 'اليوم', value: 'راحة', ico: 'calendar', lead: true,
          sub: 'راحة أو عطلة رسمية — لا دوام مجدول' },
    { label: 'لم يسجّلوا', value: ta.expected ? ta.absent : '—', ico: 'alert',
      tone: ta.absent ? 'bad' : '',
      sub: ta.expected ? `من أصل ${ta.expected} عليهم وردية` : 'لا دوام اليوم' },
    { label: 'في إجازة', value: ta.onLeave, ico: 'doc',
      sub: `${w2.active} على رأس العمل · ${w2.remote} عن بُعد` },
    { label: 'عقود تحتاج متابعة', value: wf2.soon.length + wf2.expired.length, ico: 'doc',
      tone: wf2.expired.length ? 'bad' : wf2.soon.length ? 'warn' : '',
      sub: wf2.expired.length ? `${wf2.expired.length} منها منتهٍ فعلاً` : 'خلال ٦٠ يوماً' }
  ]));

  /* من هو داخل العمل الآن */
  liveHost.innerHTML = '';
  if (ta.insideNow.length) {
    const lc = card('');
    lc.appendChild(sectionHead({ text: `داخل العمل الآن (${ta.inNow})`, icon: 'dot' },
      button('كل السجل', 'btn sm ghost', () => go('attendance'))));
    lc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th>الموظف</th><th>القسم</th><th>منذ</th></tr></thead>
        <tbody>${ta.insideNow.slice(0, 10).map((x) => `<tr>
          <td><b>${esc(x.u.name)}</b></td>
          <td>${esc(x.u.department || '—')}</td>
          <td class="num">${x.since ? hm(x.since) : '—'}</td></tr>`).join('')}</tbody>
      </table>`));
    if (ta.insideNow.length > 10)
      lc.appendChild(el('p', 'help', `و${ta.insideNow.length - 10} آخرون.`));
    liveHost.appendChild(lc);
  }

  /* تكلفة الرواتب */
  const ps = payrollSummary(cyc, staff, reqs, zk);
  const pc = card('');
  pc.appendChild(sectionHead({ text: 'تكلفة الرواتب — هذه الدورة', icon: 'money' },
    button('فتح المسير', 'btn sm ghost', () => go('payroll'))));
  const pg = grid(4);
  pg.append(
    stat(money(ps.salary), 'إجمالي الرواتب'),
    stat(money(ps.total), 'إجمالي الخصومات', ps.total ? 'r' : ''),
    stat(money(ps.net), 'المستحق', 'g'),
    stat(hhmm(ps.lateMin + ps.earlyMin), 'تأخير وخروج مبكر', 'a')
  );
  pc.appendChild(pg);
  pc.appendChild(el('p', 'help', 'محسوبة حتى اليوم من بصمات جهاز ZKTeco — نفس قواعد المسير بالضبط.'));
  payHost.appendChild(pc);

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
        <thead><tr><th>الموظف</th><th>المستند</th><th>ينتهي</th><th>الحالة</th></tr></thead>
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
        <thead><tr><th>الموظف</th><th>القسم</th><th>ينتهي</th><th>الحالة</th></tr></thead>
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
