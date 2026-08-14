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
import { tasksForAssignee, moveTask, startTimer, stopTimer } from '../lib/tasks.js';
import { boardColumns, dueStateOf, nextStepFor, progressOf, blockInfo,
         timeSummary, MAX_BLOCK_REASON, PRIORITY_AR, STATUS_AR } from '../lib/task-flow.js';
import { isStale, go } from '../lib/nav.js';
import { card, empty, sectionHead, button, loading, callout, pageHead } from '../lib/ui.js';
import { taskBoard } from '../components/task-board.js';
import { ACTIVE_STATUSES } from '../lib/task-flow.js';
import { icon } from '../lib/icons.js';

export async function render(view, token) {
  const me = getMe();
  const today = ymdKsa();

  /* ⚠️ نفس مفتاح تفضيل شاشة المدير: من اختار اللوحة اختارها لنظام المهام
     كلّه لا لشاشة بعينها. مفتاحان يجعلان الشاشتين تتباعدان بلا سبب. */
  const VIEW_KEY = 'seen-hr:tasks-view';
  let mode = 'board';
  try { mode = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch (e) { /* خصوصية مشدّدة */ }

  const viewBtn = button('', 'btn sm ghost', () => {
    mode = mode === 'board' ? 'list' : 'board';
    try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* لا شيء يُفقد */ }
    draw();
  });
  const paintViewBtn = () => {
    viewBtn.innerHTML = icon(mode === 'board' ? 'list' : 'dashboard') +
      (mode === 'board' ? 'عرض قائمة' : 'عرض لوحة');
  };
  paintViewBtn();

  view.appendChild(pageHead('مهامي',
    'المهام المكلَّف بها. عند الانتهاء أرسلها للاعتماد ويعتمدها مديرك.', viewBtn));

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

    paintViewBtn();

    /* ══════════ اللوحة ══════════
       ⚠️ أعمدة الموظف **النشِطة وحدها** لا BOARD_STATUSES: عمود «منجزة»
       يحتاج استعلاماً ثانياً لا يحتاجه الموظف — هو يسأل «وش المطلوب مني
       الحين» لا «ماذا اعتُمد». والمدير يسأل الثانية فيدفع ثمنها.

       ⚠️ ولا زرّ «منجزة» يظهر له بأي حال: dropAllowed ترفضه في كل حالة،
       وهو الحارس نفسه الذي يحرس الأزرار. */
    if (mode === 'board') {
      const bc = card('');
      bc.appendChild(taskBoard({
        tasks, who: 'assignee', today, statuses: ACTIVE_STATUSES,
        onOpen: (t) => go('task', t.id),
        onMove: async (t, to) => {
          try { await moveTask(t, to); toast('حُدّثت الحالة', 'ok'); await draw(); }
          catch (e) { console.error(e); toast('تعذّر تحديث الحالة', 'err'); }
        },
        onNeeds: (t, to, needs) => {
          if (needs === 'reason') openBlock(t, draw);
          else if (needs === 'feedback') openFeedback(t, draw);
        },
        onDeny: (msg) => { if (msg) toast(msg, 'err'); }
      }));
      bc.appendChild(el('p', 'help',
        'اسحب البطاقات بين الأعمدة، أو اضغط بطاقةً للتفاصيل. ' +
        'على الجوال: افتح المهمة وانقلها من زرّ الإجراء — السحب لا يعمل باللمس.'));
      host.appendChild(bc);
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
    /* ⚠️ رقم واحد لا رقمان: progressOf تختار البنود متى وُجدت وإلا التقدير
       اليدوي. كان الشريط والقائمة الفرعية يظهران رقمين متباعدين لنفس المهمة. */
    const pr = progressOf(t);
    const bi = blockInfo(t, null, todayYmd);
    const ts = timeSummary(t);
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
        ${pr.pct !== null && pr.source === 'checklist'
            ? `<span class="text-muted">${pr.pct}٪ من البنود</span>` : ''}
        ${bi.manual && bi.reason ? `<span class="text-amber">${esc(bi.reason.slice(0, 60))}</span>` : ''}
        ${ts.hasOpenEntry ? '<span class="text-green">العدّاد يعمل</span>'
          : ts.actualHours ? `<span class="text-muted">${ts.actualHours} ساعة</span>` : ''}
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
    /* ⚠️ التوقّف يطلب سبباً الآن: «متوقفة» بلا سبب يراها المدير فيطمئنّ
       ولا يسأل، وهي في الحقيقة منسيّة باسم آخر. */
    /* ⚠️ العدّاد من البطاقة مباشرةً: «ابدأ» و«استئناف» و«إيقاف مؤقّت» نفس
       العمليتين على البيانات — فتح مدخلة وإغلاقها — ويختلفن في نيّة المستخدم
       وحدها. فلا تغيير في البيانات ولا في القاعدة، وزرٌّ بدل رحلة صفحتين. */
    if (t.status === 'in_progress') {
      if (ts.hasOpenEntry) {
        acts.appendChild(button('إيقاف العدّاد', 'btn sm ghost', async () => {
          try { await stopTimer(t); await after(); }
          catch (e) { console.error(e); toast('تعذّر', 'err'); }
        }, 'clock'));
      } else if (!ts.atCap) {
        acts.appendChild(button(ts.entries ? 'استئناف' : 'ابدأ العدّاد', 'btn sm ghost', async () => {
          try { await startTimer(t); await after(); }
          catch (e) { console.error(e); toast(e.message === 'timer-cap' ? 'بلغت حدّ المدخلات' : 'تعذّر', 'err'); }
        }, 'clock'));
      }
      acts.appendChild(button('أوقفها مؤقتاً', 'btn sm ghost', () => openBlock(t, after)));
    }
    acts.appendChild(button('التفاصيل', 'btn sm ghost', () => go('task', t.id)));
    box.appendChild(acts);
    return box;
  }

  function openBlock(t, after) {
    const m = openModal(`
      <h3>إيقاف مؤقّت — ${esc(t.title)}</h3>
      <div class="field">
        <label for="bkWhy">ما الذي يمنع التقدّم؟ *</label>
        <textarea id="bkWhy" rows="3" maxlength="${MAX_BLOCK_REASON}"
          placeholder="أنتظر ردّ العميل · ينقصني ملف من المحاسبة · الجهاز معطّل"></textarea>
        <div class="help">يظهر لمديرك بجانب المهمة، فيعرف ما يفكّها بدل أن يسأل.</div>
      </div>
      <div class="err" id="bkErr"></div>
      <div class="row">
        <button class="btn ghost" id="bkCancel">إلغاء</button>
        <button class="btn" id="bkOk">أوقفها</button>
      </div>`);
    m.$('#bkCancel').onclick = m.close;
    m.$('#bkOk').onclick = async () => {
      const why = m.$('#bkWhy').value.trim();
      if (why.length < 3) { m.$('#bkErr').textContent = 'اكتب السبب — كلمتان تكفيان'; return; }
      const b = m.$('#bkOk'); b.disabled = true;
      try {
        await moveTask(t, 'blocked', { blockReason: why.slice(0, MAX_BLOCK_REASON) });
        m.close(); toast('أُوقفت مؤقتاً', 'ok'); await after();
      } catch (e) { console.error(e); m.$('#bkErr').textContent = 'تعذّر الحفظ'; b.disabled = false; }
    };
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
        /* ⚠️ لا `progress: 100` بعد اليوم: progressOf تشتقّ النسبة من الحالة
           والبنود. كتابتها هنا كانت تجعل الشريط ١٠٠٪ بينما البنود ٦٠٪. */
        await moveTask(t, 'review', { employeeFeedback: txt.slice(0, 4000) });
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
