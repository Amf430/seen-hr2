/* ═══════════════════════════════════════════════════════════════════════════
   مهامي — لوحة الموظف المكلَّف

   ⚠️ زرّ واحد واضح لكل بطاقة ينقل الحالة للأمام، لا قائمة حالات. الموظف لا
   يحتاج يتعلّم آلة الحالات — يحتاج يعرف «وش المطلوب مني الحين».

   ⚠️ ولا يوجد زرّ «منجزة» إطلاقاً: الموظف يرسلها للاعتماد والمدير يعتمدها.
   بلا هذه الخطوة تصير نسبة الإنجاز رقماً يكتبه الموظف عن نفسه.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { tasksForAssignee, moveTask } from '../lib/tasks.js';
import { boardColumns, dueStateOf, nextStepFor, checklistPct,
         PRIORITY_AR, STATUS_AR } from '../lib/task-flow.js';
import { isStale, go } from '../lib/nav.js';
import { card, empty, sectionHead, button, loading, callout } from '../lib/ui.js';

export async function render(view, token) {
  const me = getMe();
  const today = ymdKsa();

  const head = card('');
  head.appendChild(sectionHead({ text: 'مهامي', icon: 'check' }));
  head.appendChild(el('p', 'desc',
    'المهام المكلَّف بها. عند الانتهاء أرسلها للاعتماد ويعتمدها مديرك.'));
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  async function draw() {
    host.innerHTML = '';
    host.appendChild(loading('جارٍ تحميل مهامك…'));

    let tasks;
    try { tasks = await tasksForAssignee(me.id); }
    catch (e) {
      console.error('my-tasks', e);
      if (isStale(token)) return;
      host.innerHTML = '';
      host.appendChild(callout('warn', 'تعذّر تحميل المهام',
        'الغالب أن فهرس (assigneeUid, status, dueDate) غير منشور بعد.'));
      return;
    }
    if (isStale(token)) return;

    host.innerHTML = '';
    if (!tasks.length) {
      host.appendChild(el('div', 'card',
        '<div class="empty">لا مهام مكلَّف بها حالياً.</div>'));
      return;
    }

    boardColumns(tasks, today).forEach((col) => {
      if (!col.tasks.length) return;
      const c = card('');
      c.appendChild(sectionHead({ text: `${col.label} (${col.tasks.length})`, icon: 'check' }));
      col.tasks.forEach((t) => c.appendChild(taskCard(t, draw, today)));
      host.appendChild(c);
    });
  }

  function taskCard(t, after, todayYmd) {
    const due = dueStateOf(t, todayYmd);
    const chk = checklistPct(t);
    const box = el('div', 'task-card' + (due.kind === 'overdue' ? ' task-card--overdue' : ''));
    box.innerHTML = `
      <div class="task-card__top">
        <b>${esc(t.title)}</b>
        <span class="pill pill--dot ${t.priority === 'urgent' ? 'r' : t.priority === 'high' ? 'a' : ''}">${
          esc(PRIORITY_AR[t.priority] || 'عادية')}</span>
      </div>
      ${t.description ? `<div class="cell-sub">${esc(t.description.slice(0, 140))}</div>` : ''}
      <div class="task-card__meta">
        ${due.text ? `<span class="${due.kind === 'overdue' ? 'text-red' : due.kind === 'today' ? 'text-amber' : 'text-muted'}">${esc(due.text)}</span>` : ''}
        ${chk !== null ? `<span class="text-muted">القائمة الفرعية ${chk}%</span>` : ''}
        ${t.messageCount ? `<span class="text-muted">${t.messageCount} رسالة</span>` : ''}
      </div>`;

    const acts = el('div', 'actions-cell');
    const step = nextStepFor(t, 'assignee');
    if (step) {
      acts.appendChild(button(step.label, 'btn sm', async () => {
        /* ⚠️ الإرسال للاعتماد يفتح نافذة فيدباك إلزامية: ماذا أُنجز وما
           العوائق. بلا هذا يصل المدير إشعارٌ بلا معلومة فيسأل عمّا في النافذة. */
        if (step.to === 'review') { openFeedback(t, after); return; }
        try { await moveTask(t, step.to); toast('حُدّثت الحالة', 'ok'); await after(); }
        catch (e) { console.error(e); toast('تعذّر تحديث الحالة', 'err'); }
      }));
    }
    if (t.status === 'in_progress') {
      acts.appendChild(button('أوقفها مؤقتاً', 'btn sm ghost', async () => {
        try { await moveTask(t, 'blocked'); await after(); }
        catch (e) { console.error(e); toast('تعذّر', 'err'); }
      }));
    }
    acts.appendChild(button('التفاصيل والمحادثة', 'btn sm ghost', () => go('task', t.id)));
    box.appendChild(acts);
    return box;
  }

  function openFeedback(t, after) {
    const m = openModal(`
      <h3>${esc(t.title)}</h3>
      <div class="field">
        <label for="fbText">ماذا أُنجز؟ *</label>
        <textarea id="fbText" rows="5" placeholder="ما الذي تم، وما العوائق إن وُجدت، وكم استغرق تقريباً"></textarea>
        <div class="help">يقرأه مديرك قبل الاعتماد. الوصف الواضح يوفّر عليك أسئلة لاحقة.</div>
      </div>
      <div class="err" id="fbErr"></div>
      <div class="row">
        <button class="btn ghost" id="fbCancel">إلغاء</button>
        <button class="btn" id="fbOk">أرسلها للاعتماد</button>
      </div>`);
    m.$('#fbCancel').onclick = m.close;
    m.$('#fbOk').onclick = async () => {
      const txt = m.$('#fbText').value.trim();
      if (txt.length < 5) { m.$('#fbErr').textContent = 'اكتب ما أُنجز — سطر واحد يكفي'; return; }
      const b = m.$('#fbOk'); b.disabled = true; b.textContent = 'جارٍ الإرسال…';
      try {
        await moveTask(t, 'review', { employeeFeedback: txt.slice(0, 4000), progress: 100 });
        m.close(); toast('أُرسلت للاعتماد', 'ok'); await after();
      } catch (e) {
        console.error(e);
        m.$('#fbErr').textContent = 'تعذّر الإرسال';
        b.disabled = false; b.textContent = 'أرسلها للاعتماد';
      }
    };
  }

  await draw();
}

export { STATUS_AR };
