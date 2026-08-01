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
import { getUsers, getRequests } from '../lib/state.js';
import { cycleOf, ymd } from '../lib/dates.js';
import { fmtDate as fd, money, hhmm, hm } from '../lib/format.js';
import { fetchAttendance } from '../lib/attendance.js';
import { canApprove } from '../lib/perms.js';
import { go, isStale } from '../lib/nav.js';
import { setProfileUid } from '../lib/state.js';
import { workforce, todayAttendance, contracts, payrollSummary, requestPulse, actionItems } from '../lib/hr-stats.js';
import { card, grid, stat, empty, tableWrap, sectionHead, button, bar } from '../lib/ui.js';
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
  const kpi = grid(4);
  kpi.append(
    stat(w.active, 'موظف على رأس العمل'),
    stat(w.departments.length, 'أقسام'),
    stat(w.remote, 'يعملون عن بُعد'),
    stat(wf.soon.length + wf.expired.length, 'عقود تحتاج متابعة', (wf.expired.length ? 'r' : wf.soon.length ? 'a' : ''))
  );
  view.appendChild(kpi);

  /* ── حاويات تُملأ بعد الجلب ── */
  const liveHost = el('div', ''); view.appendChild(liveHost);
  liveHost.appendChild(card('', '')).appendChild(
    el('div', 'empty', '<span class="spinner"></span> جارٍ قراءة حضور اليوم…'));

  const alertHost = el('div', ''); view.appendChild(alertHost);
  const payHost   = el('div', ''); view.appendChild(payHost);

  /* ── الطلبات: بطاقة واحدة، في الأسفل ── */
  const rp = requestPulse(cyc, reqs, canApprove);
  const rc = card('');
  rc.appendChild(sectionHead('📥 الطلبات',
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
  if (!waiting.length) rc.appendChild(empty('لا توجد طلبات معلّقة', '✅'));
  else waiting.forEach((r) => rc.appendChild(miniRow(r)));
  view.appendChild(rc);

  /* ── الأقسام ── */
  if (w.departments.length) {
    const dc = card('🏢 التوزيع حسب القسم');
    const max = w.departments[0][1] || 1;
    dc.innerHTML += w.departments.map(([name, n]) => `
      <div class="row-between mt-2"><span>${esc(name)}</span><b class="num">${n}</b></div>
      ${bar((n / max) * 100, 'var(--maroon)')}`).join('');
    view.appendChild(dc);
  }

  /* ── اختصارات ── */
  const qc = card('');
  qc.appendChild(sectionHead('اختصارات',
    button('⬇️ تصدير تقرير الدورة', 'btn sm ghost', () => monthlyExport(cyc, getRequests())),
    button('👤 الموظفون', 'btn sm ghost', () => go('employees')),
    button('💵 مسير الرواتب', 'btn sm ghost', () => go('payroll'))));
  view.appendChild(qc);

  /* ═══ الجلب المتأخر ═══ */
  const today = ymd(new Date());
  let todayRecs = [], zk = [];
  try {
    const cur = { start: new Date(today + 'T00:00:00'), end: new Date(today + 'T23:59:59') };
    [todayRecs, zk] = await Promise.all([
      fetchAttendance(cur, 'attendance').catch(() => []),
      fetchAttendance(cyc, 'zkAttendance').catch(() => [])
    ]);
  } catch (e) { console.error(e); }
  if (isStale(token)) return;

  /* الحضور اليوم */
  const ta = todayAttendance(users, todayRecs, reqs);
  liveHost.innerHTML = '';
  const lc = card('');
  lc.appendChild(sectionHead('🟢 اليوم', button('التفاصيل', 'btn sm ghost', () => go('attendance'))));
  if (!ta.expected) {
    lc.appendChild(empty('اليوم راحة أو عطلة رسمية — لا دوام مجدول', '🌙'));
  } else {
    const g = grid(4);
    g.append(
      stat(ta.inNow, 'داخل العمل الآن', 'g'),
      stat(ta.checkedIn + '/' + ta.expected, 'سجّلوا حضورهم'),
      stat(ta.onLeave, 'في إجازة'),
      stat(ta.absent, 'لم يسجّلوا', ta.absent ? 'r' : '')
    );
    lc.appendChild(g);
    if (ta.rate !== null) {
      lc.appendChild(el('div', 'row-between mt-3',
        `<span>نسبة الحضور اليوم</span><b class="num">${ta.rate}%</b>`));
      lc.innerHTML += bar(ta.rate, ta.rate >= 90 ? 'var(--green)' : ta.rate >= 70 ? 'var(--amber)' : 'var(--red)');
    }
    if (ta.insideNow.length) {
      lc.appendChild(tableWrap(`
        <table class="tight">
          <thead><tr><th>داخل العمل الآن</th><th>القسم</th><th>منذ</th></tr></thead>
          <tbody>${ta.insideNow.slice(0, 10).map((x) => `<tr>
            <td><b>${esc(x.u.name)}</b></td>
            <td>${esc(x.u.department || '—')}</td>
            <td class="num">${x.since ? hm(x.since) : '—'}</td></tr>`).join('')}</tbody>
        </table>`));
    }
  }
  liveHost.appendChild(lc);

  /* تكلفة الرواتب */
  const ps = payrollSummary(cyc, users, reqs, zk);
  const pc = card('');
  pc.appendChild(sectionHead('💵 تكلفة الرواتب — هذه الدورة',
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
  const items = actionItems({
    workforceStats: w, contractStats: wf, payroll: ps,
    requests: rp, attendance: ta.expected ? ta : null
  });
  if (items.length) {
    const ac = card('⚠️ يحتاج إجراءً');
    const stack = el('div', 'alert-stack');
    items.forEach((it) => {
      const row = el('button', 'alert-item alert-item--' + it.kind,
        `<span class="alert-item__icon">${it.icon}</span><span>${esc(it.text)}</span><span class="alert-item__go">←</span>`);
      row.onclick = () => go(it.page);
      stack.appendChild(row);
    });
    ac.appendChild(stack);
    alertHost.appendChild(ac);
  }

  /* العقود المنتهية قريباً */
  if (wf.expired.length || wf.soon.length) {
    const cc = card('📄 عقود تحتاج متابعة');
    cc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th>الموظف</th><th>القسم</th><th>ينتهي</th><th>الحالة</th></tr></thead>
        <tbody>${[...wf.expired, ...wf.soon].slice(0, 12).map((x) => `<tr>
          <td><b>${esc(x.u.name)}</b></td>
          <td>${esc(x.u.department || '—')}</td>
          <td class="num">${esc(x.u.contractEnd)}</td>
          <td>${x.left < 0
            ? `<span class="pill rejected">منتهٍ منذ ${Math.abs(x.left)} يوم</span>`
            : `<span class="pill pending">${x.left} يوم</span>`}</td></tr>`).join('')}</tbody>
      </table>`));
    alertHost.appendChild(cc);
  }
}

export { setProfileUid };
