/* ═══════════════════════════════════════════════════════════════════════════
   تقويم الفريق (المرحلة ٩)

   مَن في إجازة، ومَن على شفت مسائي، والعطل القادمة — في شاشة واحدة، لتقليل
   التضارب قبل وقوعه لا بعده.

   ⚠️⚠️ قرار المالك: **الموظف لا يرى إجازات زملائه إطلاقاً**. الإجازات لمدير
   القسم وحده — وهو يملك قراءة `requests` على السيرفر أصلاً، والموظف ممنوع
   منها بالقاعدة. فالحدّ مفروض في المكان الصحيح، والشاشة لا تدّعي حراسة.

   ما يراه الموظف: العطل الرسمية، وورديته، و**الأحداث** — اجتماع أسبوعي
   يضيفه مدير قسمه، أو حدث للشركة يضيفه الأدمن.

   ⚠️ الشبكة الشهرية لا تُقرأ على شاشة جوال — تنقلب قائمة أسبوعية تحت 640px،
   والنظام يُستعمل من الجوال أكثر من سطح المكتب.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal, confirmAction } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getMe, getUsers, getSettings } from '../lib/state.js';
import { ymdKsa, AR_DAYS } from '../lib/dates.js';
import { fmtDT } from '../lib/format.js';
import { monthGrid, shiftMonth, dayLayers, conflictsInRange, canEditEvent, timelineRows,
         DEFAULT_CONFLICT_PCT } from '../lib/calendar.js';
import { fetchLeavesForMonth, fetchEvents, saveEvent, deleteEvent } from '../lib/calendar-io.js';
import { resolveShift, shiftText } from '../lib/shifts.js';
import { tasksForDept } from '../lib/tasks.js';
import { isStale } from '../lib/nav.js';
import { isAdmin, isManager } from '../lib/perms.js';
import { card, empty, sectionHead, button, loading, callout, avatar } from '../lib/ui.js';

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
  head.appendChild(sectionHead({ text: 'تقويم الفريق', icon: 'calendar' },
    full ? button('إضافة حدث', 'btn sm', () => openEvent(null)) : null));
  head.appendChild(el('p', 'desc', full
    ? 'الإجازات المعتمَدة والشفتات والعطل والأحداث في شاشة واحدة.'
    : 'ورديتك والعطل الرسمية وأحداث قسمك.'));

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

  /* ── الشبكة أو الخطّ الزمني ──
     الشبكة تجيب «من غائب اليوم؟»، والخطّ الزمني يجيب «متى يغيب كلٌّ منهم؟» —
     وهو السؤال الذي يقرّر الموافقة على طلب جديد. المدير يحتاج الاثنين.

     ⚠️ الخطّ الزمني لمن يرى الطلبات وحده (أدمن أو مدير). الموظف لا يملك
     قراءة `requests` على السيرفر أصلاً، فصفّه سيكون فارغاً دائماً — وعرضُ
     مبدّلٍ لعرضٍ فارغ وعدٌ كاذب. */
  let mode = 'grid';
  if (full) {
    const tg = el('div', 'viewtoggle');
    tg.setAttribute('role', 'group');
    tg.setAttribute('aria-label', 'طريقة عرض التقويم');
    const tb = (m, label, ico) => {
      const b = el('button', 'viewtoggle__btn' + (mode === m ? ' is-on' : ''), icon(ico) + esc(label));
      b.type = 'button';
      b.onclick = () => {
        mode = m;
        tg.querySelectorAll('.viewtoggle__btn').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        draw();
      };
      return b;
    };
    tg.append(tb('grid', 'شبكة الشهر', 'calendar'), tb('timeline', 'خطّ زمني', 'chart'));
    bar.appendChild(tg);
  }

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

    const from = g.days[0], to = g.days[g.days.length - 1];
    let leaves = [], tasks = [], events = [];

    /* الأحداث للجميع — الموظف يراها وهي كل ما يراه من طبقات الناس */
    try { events = await fetchEvents(dept, from, to); }
    catch (e) { console.error('events', e); }

    /* ⚠️ الإجازات لا تُطلَب للموظف إطلاقاً: قاعدة requests تمنعه، فالنداء
       يعطيه خطأ صلاحيات لا نتيجة فارغة. الفحص على الدور قبل النداء. */
    if (full) {
      try { leaves = await fetchLeavesForMonth(dept, from, to); }
      catch (e) {
        console.error('calendar', e);
        if (isStale(token)) return;
        host.innerHTML = '';
        host.appendChild(callout('warn', 'تعذّر قراءة الإجازات',
          'الغالب أن فهرس (department, status, startDate) غير منشور بعد.'));
        return;
      }
      try { tasks = await tasksForDept(dept); } catch (e) { console.error('cal-tasks', e); }
    }
    if (isStale(token)) return;
    host.innerHTML = '';

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

    /* ── الخطّ الزمني ── */
    if (mode === 'timeline') {
      host.appendChild(timelineCard(g, leaves, staff, dept));
      return;
    }

    /* ── الشبكة ── */
    const c = card('');
    const grid = el('div', 'cal-grid');
    AR_DAYS.forEach((d) => grid.appendChild(el('div', 'cal-head', esc(d))));
    for (let i = 0; i < g.lead; i++) grid.appendChild(el('div', 'cal-pad'));

    g.days.forEach((ymd) => {
      const L = dayLayers(ymd, { requests: leaves, exceptions: S.dateExceptions || [],
                                 tasks, events, dept });

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

      /* ⚠️ leaves فارغة للموظف لأن الاستعلام لم يُنفَّذ له أصلاً */
      L.leaves.forEach((l) => cell.appendChild(el('div', 'cal-tag cal-tag--leave',
        esc(l.name) + (l.type ? ` · ${esc(l.type)}` : ''))));

      L.events.forEach((ev) => {
        const tag = el('div', 'cal-tag cal-tag--event',
          esc(ev.title) + (ev.department ? '' : ' · الشركة'));
        if (canEditEvent(ev, me)) { tag.style.cursor = 'pointer'; tag.onclick = () => openEvent(ev); }
        cell.appendChild(tag);
      });

      L.dueTasks.forEach((t) =>
        cell.appendChild(el('div', 'cal-tag cal-tag--task', esc(t.title))));

      grid.appendChild(cell);
    });

    c.appendChild(grid);
    c.appendChild(el('p', 'help', full
      ? 'الوردية المسائية موسومة، والعطل من «الورديات والعطل»، والأحداث تُضغط لتعديلها. الإجازات تظهر لك ولا تظهر للموظفين.'
      : 'ورديتك والعطل الرسمية وأحداث قسمك. إجازات الزملاء لا تظهر هنا.'));
    host.appendChild(c);
  }

  /* ── إضافة/تعديل حدث ──
     ⚠️ نطاق الحدث حقلٌ واحد: قسم، أو فارغ = الشركة كلها. والأدمن وحده يقدر
     يجعله للشركة — مرآةٌ لقاعدة calendarEvents لا بديل عنها. */
  /* ═══ بطاقة الخطّ الزمني ═══
     صفّ لكل موظف، وأعمدة الأيام، وأشرطة تمتدّ على الإجازة.

     ⚠️ الأعمدة شبكة CSS بعدد أيام الشهر — لا عرض ثابت لكل يوم: فبراير ٢٨
     ومارس ٣١، والعرض الثابت يجعل الشهرين مختلفَي الطول على الشاشة فتُقارن
     أطوالهما بالخطأ.

     ⚠️ الاتجاه: الأيام تسير **يميناً←يساراً** كبقيّة الواجهة العربية،
     فالشبكة داخل صفحة rtl ترتّب عمودها الأول يميناً تلقائياً. */
  function timelineCard(g, leaves, staff, dept) {
    const c = card('');
    c.appendChild(sectionHead({ text: 'خطّ إجازات الفريق', icon: 'chart' }));
    c.appendChild(el('p', 'desc', `${g.label} · قسم ${esc(dept)}`));

    const rows = timelineRows(leaves, cur.year, cur.month, staff);
    if (!rows.length) {
      c.appendChild(empty('لا إجازات ولا استئذانات في هذا الشهر', 'calendar'));
      return c;
    }

    const n = g.days.length;
    const todayIdx = g.days.indexOf(today) + 1;   /* ٠ إن كان اليوم خارج الشهر */

    const wrap = el('div', 'tl');
    wrap.style.setProperty('--tl-days', n);

    /* ترويسة الأيام */
    const head2 = el('div', 'tl__row tl__row--head');
    head2.appendChild(el('div', 'tl__who', ''));
    const scale = el('div', 'tl__scale');
    for (let d = 1; d <= n; d++) {
      const cell = el('span', 'tl__day' + (d === todayIdx ? ' is-today' : ''), String(d));
      scale.appendChild(cell);
    }
    head2.appendChild(scale);
    wrap.appendChild(head2);

    for (const r of rows) {
      const row = el('div', 'tl__row');
      const who = el('div', 'tl__who');
      who.appendChild(avatar(r.name, 30));
      who.appendChild(el('div', 'tl__id',
        `<b>${esc(r.name)}</b>${r.jobTitle ? `<span>${esc(r.jobTitle)}</span>` : ''}`));
      row.appendChild(who);

      const track = el('div', 'tl__track');
      if (todayIdx) {
        const mark = el('span', 'tl__now');
        mark.style.setProperty('--at', todayIdx);
        track.appendChild(mark);
      }
      for (const b of r.bars) {
        const bar2 = el('span', 'tl__bar tl__bar--' + esc(b.status) +
          (b.type === 'permission' ? ' tl__bar--point' : '') +
          (b.clippedStart ? ' is-clip-start' : '') + (b.clippedEnd ? ' is-clip-end' : ''),
          `<span class="tl__lbl">${esc(b.label)}</span>`);
        bar2.style.setProperty('--from', b.start);
        bar2.style.setProperty('--span', b.span);
        bar2.title = `${b.label} — ${b.span} يوم` +
          (b.status === 'pending' ? ' (بانتظار الاعتماد)' : '');
        track.appendChild(bar2);
      }
      row.appendChild(track);
      wrap.appendChild(row);
    }

    c.appendChild(wrap);
    c.appendChild(el('div', 'tl__legend',
      '<span class="tl__key"><i class="tl__swatch tl__bar--approved"></i>معتمَدة</span>' +
      '<span class="tl__key"><i class="tl__swatch tl__bar--pending"></i>بانتظار الاعتماد</span>' +
      (todayIdx ? '<span class="tl__key"><i class="tl__swatch tl__swatch--now"></i>اليوم</span>' : '')));
    return c;
  }

  function openEvent(ev) {
    const isEdit = !!ev;
    const m = openModal(`
      <h3>${isEdit ? 'تعديل حدث' : 'حدث جديد'}</h3>
      <div class="field"><label for="evTitle">العنوان *</label>
        <input id="evTitle" maxlength="120" value="${esc(ev?.title || '')}"
               placeholder="مثال: اجتماع القسم الأسبوعي"></div>
      <div class="field"><label for="evDate">التاريخ *</label>
        <input id="evDate" type="date" value="${esc(ev?.date || today)}"></div>
      <div class="field"><label for="evNote">ملاحظة</label>
        <textarea id="evNote" rows="2" maxlength="500">${esc(ev?.note || '')}</textarea></div>
      <div class="field"><label for="evScope">النطاق</label>
        <select id="evScope" ${admin ? '' : 'disabled'}>
          <option value="${esc(currentDept())}"${ev && ev.department ? ' selected' : ''}>قسم ${esc(currentDept())}</option>
          ${admin ? `<option value=""${ev && !ev.department ? ' selected' : ''}>الشركة كلها</option>` : ''}
        </select>
        <div class="help">${admin
          ? 'حدث الشركة يراه كل الموظفين.'
          : 'مدير القسم يضيف لقسمه وحده — حدث الشركة يضيفه مدير النظام.'}</div></div>
      <div class="err" id="evErr"></div>
      <div class="row">
        ${isEdit ? '<button class="btn danger" id="evDel">حذف</button>' : ''}
        <button class="btn ghost" id="evCancel">إلغاء</button>
        <button class="btn" id="evOk">${isEdit ? 'حفظ' : 'إضافة'}</button>
      </div>`);

    m.$('#evCancel').onclick = m.close;
    const del = m.$('#evDel');
    if (del) del.onclick = async () => {
      const yes = await confirmAction({ title: `حذف «${ev.title}»`,
        body: 'يختفي من تقويم كل من يراه.', confirmLabel: 'حذف' });
      if (!yes) return;
      try { await deleteEvent(ev.id); m.close(); toast('حُذف الحدث'); await draw(); }
      catch (e) { console.error(e); toast('تعذّر الحذف', 'err'); }
    };
    m.$('#evOk').onclick = async () => {
      const err = m.$('#evErr'); err.textContent = '';
      const title = m.$('#evTitle').value.trim();
      const date = m.$('#evDate').value;
      if (!title) { err.textContent = 'اكتب عنوان الحدث'; return; }
      if (!date)  { err.textContent = 'اختر التاريخ'; return; }
      try {
        await saveEvent({ id: ev?.id, title, date, note: m.$('#evNote').value.trim(),
                          department: m.$('#evScope').value });
        m.close(); toast(isEdit ? 'حُفظ الحدث' : 'أُضيف الحدث', 'ok'); await draw();
      } catch (e) { console.error(e); err.textContent = 'تعذّر الحفظ'; }
    };
  }

  await draw();
}

export { empty, toast };
