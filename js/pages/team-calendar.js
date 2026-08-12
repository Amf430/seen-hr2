/* ═══════════════════════════════════════════════════════════════════════════
   تقويم الفريق (المرحلة ٩)

   مَن في إجازة، ومَن على شفت مسائي، والعطل القادمة — في شاشة واحدة، لتقليل
   التضارب قبل وقوعه لا بعده.

   ⚠️⚠️ الخصوصية أولاً: نوع الإجازة معلومة صحّية أحياناً (مرضية · وضع ·
   وفاة). المدير والأدمن يريانه لأنهما يملكان قراءة الطلب أصلاً؛ **الزميل
   يرى الاسم وحده**. القرار كله في dayLayers(view) داخل calendar.js، وهنا
   نمرّر الوسيط الصحيح فقط.

   ⚠️ والزميل لا يقدر يقرأ طلبات زملائه أصلاً (قاعدة requests)، فما يراه
   يأتي من وثيقة teamAway المنشورة — يكتبها المدير حين يفتح هذه الشاشة.
   لذلك تحمل تاريخها ويُعرض: لوحة قديمة تُقرأ على أنها اليوم أسوأ من مؤرَّخة.

   ⚠️ الشبكة الشهرية لا تُقرأ على شاشة جوال — تنقلب قائمة أسبوعية تحت 640px،
   والنظام يُستعمل من الجوال أكثر من سطح المكتب.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast } from '../lib/dom.js';
import { getMe, getUsers, getSettings } from '../lib/state.js';
import { ymdKsa, AR_DAYS } from '../lib/dates.js';
import { fmtDT } from '../lib/format.js';
import { monthGrid, shiftMonth, dayLayers, conflictsInRange,
         DEFAULT_CONFLICT_PCT } from '../lib/calendar.js';
import { fetchLeavesForMonth, publishAway, readAway } from '../lib/calendar-io.js';
import { resolveShift, shiftText } from '../lib/shifts.js';
import { tasksForDept } from '../lib/tasks.js';
import { isStale } from '../lib/nav.js';
import { isAdmin, isManager } from '../lib/perms.js';
import { card, empty, sectionHead, button, loading, callout } from '../lib/ui.js';

export async function render(view, token) {
  const me = getMe();
  const admin = isAdmin();
  /* ⚠️ الرؤية الكاملة لمن يملك قراءة الطلب على السيرفر — لا لمن نراه أهلاً */
  const full = admin || isManager();
  const today = ymdKsa();

  const depts = admin
    ? [...new Set(getUsers().filter((u) => u.role !== 'admin').map((u) => u.department).filter(Boolean))].sort()
    : [me.department].filter(Boolean);

  if (!depts.length) {
    view.appendChild(card('تقويم الفريق', null, 'calendar'));
    view.appendChild(el('div', 'card', '<div class="empty">لم يُسنَد لك قسم.</div>'));
    return;
  }

  let cur = { year: new Date().getFullYear(), month: new Date().getMonth() };

  const head = card('');
  head.appendChild(sectionHead({ text: 'تقويم الفريق', icon: 'calendar' }));
  head.appendChild(el('p', 'desc', full
    ? 'الإجازات المعتمَدة والشفتات والعطل الرسمية في شاشة واحدة.'
    : 'مَن من زملائك غير موجود. لا تظهر أسباب الإجازات ولا أنواعها — لأحد.'));

  const bar = el('div', 'cluster');
  const prevBtn = button('‹ السابق', 'btn sm ghost', () => { cur = shiftMonth(cur.year, cur.month, -1); draw(); });
  const nextBtn = button('التالي ›', 'btn sm ghost', () => { cur = shiftMonth(cur.year, cur.month, 1); draw(); });
  const monthLbl = el('b', '');
  let deptSel = null;
  if (depts.length > 1) {
    deptSel = el('select', '');
    deptSel.innerHTML = depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    deptSel.onchange = draw;
    bar.appendChild(deptSel);
  }
  bar.append(prevBtn, monthLbl, nextBtn);
  head.appendChild(bar);
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  const currentDept = () => (deptSel ? deptSel.value : depts[0]);

  async function draw() {
    host.innerHTML = '';
    host.appendChild(loading('جارٍ بناء التقويم…'));

    const dept = currentDept();
    const g = monthGrid(cur.year, cur.month);
    monthLbl.textContent = g.label;

    const staff = getUsers().filter((u) => u.role !== 'admin' && u.department === dept);
    const S = getSettings();
    const pct = Number(S.leaveConflictThreshold) || DEFAULT_CONFLICT_PCT;

    let leaves = [], awayDoc = null, tasks = [];
    if (full) {
      try {
        leaves = await fetchLeavesForMonth(dept, g.days[0], g.days[g.days.length - 1]);
      } catch (e) {
        console.error('calendar', e);
        if (isStale(token)) return;
        host.innerHTML = '';
        host.appendChild(callout('warn', 'تعذّر قراءة الإجازات',
          'الغالب أن فهرس (department, status, startDate) غير منشور بعد.'));
        return;
      }
      /* المهام طبقة اختيارية — فشلها لا يُسقط التقويم */
      try { tasks = await tasksForDept(dept); } catch (e) { console.error('cal-tasks', e); }
    } else {
      try { awayDoc = await readAway(dept); } catch (e) { console.error('away', e); }
    }
    if (isStale(token)) return;
    host.innerHTML = '';

    /* ⚠️ النشر بعد القراءة مباشرةً — هذه اللحظة الوحيدة المتاحة بلا خادم.
       وفشله لا يُعطّل الشاشة: التقويم أمام المدير سليم، والمتضرّر الوحيد
       تأخّر لوحة الزملاء يوماً. */
    if (full) {
      publishAway(dept, g.days, leaves, staff.length)
        .catch((e) => console.error('publish-away', e));
    }

    /* ── تحذير التضارب ── */
    const conflicts = full
      ? conflictsInRange(g.days, leaves, dept, staff.length, pct)
      : [];
    if (conflicts.length) {
      const worst = conflicts.slice().sort((a, b) => b.ratio - a.ratio)[0];
      host.appendChild(callout('warn',
        `${conflicts.length} يوم فيه تضارب إجازات`,
        `أشدّها ${worst.ymd}: ${worst.away} من ${worst.staffCount} في قسم ${dept} — ${worst.ratio}٪. ` +
        `الحدّ المضبوط ${pct}٪، ويُعدَّل من إعدادات النظام.`));
    }

    if (!full && awayDoc) {
      host.appendChild(callout('info', 'هذه اللوحة تُحدَّث حين يفتح مديرك التقويم',
        `آخر تحديث: ${awayDoc.at ? esc(fmtDT(awayDoc.at)) : '—'}. لا تُظهر أنواع الإجازات ولا أسبابها.`));
    }
    if (!full && !awayDoc) {
      host.appendChild(el('div', 'card',
        '<div class="empty">لم تُنشر لوحة الغياب لقسمك بعد — تظهر بعد أن يفتح مديرك التقويم.</div>'));
      return;
    }

    /* ── الشبكة ── */
    const c = card('');
    const grid = el('div', 'cal-grid');
    AR_DAYS.forEach((d) => grid.appendChild(el('div', 'cal-head', esc(d))));
    for (let i = 0; i < g.lead; i++) grid.appendChild(el('div', 'cal-pad'));

    g.days.forEach((ymd) => {
      const L = full
        ? dayLayers(ymd, { requests: leaves, exceptions: S.dateExceptions || [],
                           tasks, dept, view: 'full' })
        : { ymd, leaves: (awayDoc.days || {})[ymd] || [],
            exception: (S.dateExceptions || []).find((x) => x.date === ymd) || null,
            dueTasks: [], isOff: false };
      L.isOff = !!L.exception && L.exception.type === 'off';

      /* الوردية تُحسب محلياً من الإعدادات المحمَّلة — بلا قراءة إضافية */
      const d = new Date(ymd + 'T00:00:00');
      const sh = resolveShift(ymd, d.getDay(), dept);
      const off = L.isOff || !sh || sh.type === 'off';

      const cell = el('div', 'cal-day'
        + (ymd === today ? ' cal-day--today' : '')
        + (off ? ' cal-day--off' : ''));
      cell.innerHTML = `<div class="cal-num num">${Number(ymd.slice(8))}</div>`;

      if (L.exception) cell.appendChild(el('div', 'cal-tag cal-tag--holiday', esc(L.exception.label || 'عطلة')));
      else if (sh && sh.type === 'evening') cell.appendChild(el('div', 'cal-tag cal-tag--evening', esc(shiftText(sh))));

      L.leaves.forEach((l) => {
        /* ⚠️ النوع يُعرض للمدير وحده. الزميل لا يصله أصلاً من dayLayers. */
        cell.appendChild(el('div', 'cal-tag cal-tag--leave',
          esc(l.name) + (l.type ? ` · ${esc(l.type)}` : '')));
      });
      L.dueTasks.forEach((t) =>
        cell.appendChild(el('div', 'cal-tag cal-tag--task', esc(t.title))));

      grid.appendChild(cell);
    });

    c.appendChild(grid);
    c.appendChild(el('p', 'help', full
      ? 'الوردية المسائية موسومة، والعطل الرسمية من «الورديات والعطل». طبقة المهام تُظهر تواريخ الاستحقاق.'
      : '⚠️ تظهر أسماء من هم في إجازة فقط. أنواع الإجازات وأسبابها لا تُعرض لزميل — ولا تُنشر أصلاً.'));
    host.appendChild(c);
  }

  await draw();
}

export { empty, toast };
