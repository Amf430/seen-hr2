/* ═══════════════════════════════════════════════════════════════════════════
   يومي — مهام النظام التي اخترتَها ليومك، وقائمتك الشخصية

   ⚠️ **قائمة مسطّحة لا بطاقات** (مرجع المالك: Microsoft To Do). النسخة الأولى
   كانت أربع بطاقات لكل قسم عنوانٌ ووصفٌ وإطار — فبند التذكير الواحد يجلس
   داخل صندوقين. قائمة المهام تُقرأ بالمسح السريع لا بالقراءة، والإطارات
   تكسر المسح: العين تتوقّف عند كل حدّ.

   ⚠️ والإضافة سطرٌ واحد يتوسّع عند التركيز لا نموذجٌ بثلاثة حقول ظاهرة
   دائماً. حقلا التاريخ كانا يشغلان نصف عرض الصندوق لخيارين يستعملهما
   المستخدم في واحد من كل عشرة بنود.

   ⚠️ **قائمتان بينهما فرق بصري صريح ونصّ مكتوب.** الخلط بينهما يُفقد
   الاثنتين معناهما: مهمة النظام لها مدير وتدخل التقارير، والتذكير الشخصي
   لا يراه أحد ولا يدخل شيئاً. من لا يعرف أيّهما يكتب، يكتب في الأسلم —
   فيتوقّف عن استعمال القائمة الشخصية أصلاً.

   ⚠️ مهام النظام **مراجع لا نسخ**: العنصر يحمل معرّف المهمة وحده، ويُحَلّ من
   المصفوفة المحمَّلة لـ«مهامي». فأي تعديل على المهمة الأصلية يظهر هنا فوراً،
   وصفر قراءة إضافية.

   ⚠️ ولا إشعار والتطبيق مغلق — لا خادم عندنا. «التذكير» هنا معناه: يظهر في
   الرئيسية وفي هذه الصفحة حين يحين موعده. مكتوبٌ في الشاشة لا في تعليق فقط.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, uid, openModal } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { greeting, firstName, fmtDayDate } from '../lib/format.js';
import { readTodos, writeTodos } from '../lib/todo-io.js';
import { addItem, toggleItem, removeItem, todayView, prunable, pruneDone,
         dueReminders, MAX_TEXT, PRUNE_AFTER_DAYS } from '../lib/todo.js';
import { tasksForAssignee } from '../lib/tasks.js';
import { dueStateOf, progressOf, STATUS_AR } from '../lib/task-flow.js';
import { isStale, go } from '../lib/nav.js';
import { button, loading, callout } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

export async function render(view, token) {
  const me = getMe();
  const today = ymdKsa();

  /* ⚠️ ترويسة بتاريخ اليوم وتحية باسمه — لا سطر عنوانٍ جافّ. هذه صفحةٌ
     تُفتح كل صباح، والتاريخ فيها معلومة تُستعمل لا زينة. */
  const head = el('header', 'dayhead');
  head.innerHTML =
    `<div>
       <h1 class="dayhead__title">يومي</h1>
       <p class="dayhead__sub">${esc(greeting())}، ${esc(firstName(me.name || ''))}</p>
     </div>
     <span class="dayhead__date">${esc(fmtDayDate())}</span>`;
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);
  host.appendChild(loading('جارٍ تحميل قائمتك…'));

  let items = [], tasks = [];
  try {
    [items, tasks] = await Promise.all([
      readTodos(),
      /* ⚠️ الأدمن ليست له مهام مكلَّف بها — والاستعلام يفشل بلا ضرر، فالقائمة
         الشخصية تعمل وحدها. */
      tasksForAssignee(me.id).catch(() => [])
    ]);
  } catch (e) {
    console.error('my-day', e);
    if (isStale(token)) return;
    host.innerHTML = '';
    host.appendChild(callout('warn', 'تعذّرت قراءة قائمتك',
      'أعد تحميل الصفحة. لم يُحذف شيء — القائمة محفوظة.'));
    return;
  }
  if (isStale(token)) return;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  let showDone = false;

  async function save(next) {
    try { items = await writeTodos(next); draw(); return true; }
    catch (e) { console.error('todo-save', e); toast('تعذّر الحفظ', 'err'); return false; }
  }

  function draw() {
    host.innerHTML = '';
    const v = todayView(items, byId, today);
    const due = dueReminders(items, today);

    if (due.length) host.appendChild(callout('warn',
      due.length === 1 ? 'تذكير حان وقته' : `${due.length} تذكيرات حان وقتها`,
      due.slice(0, 4).map((x) => x.text).join(' · ')));

    host.appendChild(quickAdd());

    /* ══════════ مهام النظام ══════════ */
    host.appendChild(sectionLabel(`مهام النظام (${v.tasks.length})`,
      'رسمية · لها مدير · تدخل التقارير',
      button('اختر من مهامي', 'btn sm ghost', openPick, 'plus')));
    if (!v.tasks.length) {
      host.appendChild(el('p', 'daylist__empty', 'لم تختر مهمة ليومك بعد.'));
    } else {
      const l = el('div', 'daylist');
      v.tasks.forEach(({ item, task }) => l.appendChild(taskRow(item, task)));
      host.appendChild(l);
    }

    /* ══════════ القائمة الشخصية ══════════
       ⚠️ الوعد يُكتب في الشاشة لا في تعليق: الوعد الذي لا يُقرأ لا يُصدَّق،
       والقائمة التي يظنّها الموظف مقروءة لا يكتب فيها ما ينفعه. */
    host.appendChild(sectionLabel(`قائمتي الشخصية (${v.personal.length})`,
      'لك وحدك — لا يراها مديرك ولا الموارد البشرية، ولا تدخل تقاريرك ولا تقييمك',
      null, 'shield'));
    if (!v.personal.length) {
      host.appendChild(el('p', 'daylist__empty', 'لا تذكيرات. اكتب واحداً في الأعلى.'));
    } else {
      const l = el('div', 'daylist daylist--private');
      v.personal.forEach((x) => l.appendChild(todoRow(x)));
      host.appendChild(l);
    }

    /* ══════════ المنجز — مطويّ ══════════
       ⚠️ مطويّ لا محذوف ولا معروض: عشرون بنداً منجزاً فوق ثلاثة مفتوحة تدفن
       ما بقي، وحذفها يفقد الموظف إحساس ما أنجزه. */
    if (v.done.length) {
      const t = el('button', 'donetoggle' + (showDone ? ' is-open' : ''));
      t.type = 'button';
      t.innerHTML = `${icon('back')}<span>أنجزتها (${v.done.length})</span>`;
      t.onclick = () => { showDone = !showDone; draw(); };
      host.appendChild(t);
      if (showDone) {
        const l = el('div', 'daylist daylist--done');
        v.done.slice(0, 30).forEach((x) => l.appendChild(todoRow(x)));
        host.appendChild(l);
        const old = prunable(items, today);
        if (old.length) {
          const p = el('div', 'daylist__foot');
          p.appendChild(button(`احذف ${old.length} قديماً`, 'btn sm ghost',
            () => save(pruneDone(items, today)), 'trash'));
          p.appendChild(el('span', 'help',
            `ما مضى على إنجازه ${PRUNE_AFTER_DAYS} يوماً. لا يُحذف تلقائياً — الحذف لا رجعة فيه والقرار لك.`));
          host.appendChild(p);
        }
      }
    }
  }

  /* ── الإضافة السريعة ──
     ⚠️ سطرٌ واحد يتوسّع عند التركيز: الموعد والتذكير يُستعملان في بندٍ من
     كل عشرة، وإظهارهما دائماً يجعل «اكتب سطراً» تبدو استمارة. */
  function quickAdd() {
    const box = el('div', 'quickadd');
    const row = el('div', 'quickadd__row');
    const plus = el('span', 'quickadd__ic', icon('plus'));
    const txt = el('input', 'quickadd__input');
    txt.placeholder = 'أضف مهمة';
    txt.maxLength = MAX_TEXT;
    row.append(plus, txt);

    const opts = el('div', 'quickadd__opts');
    const dueIn = el('input', ''); dueIn.type = 'date';
    const remind = el('input', ''); remind.type = 'date';
    opts.append(
      labelled('موعد', dueIn), labelled('تذكير', remind),
      button('أضف', 'btn sm', commit, 'plus'));

    const errEl = el('div', 'err', '');
    box.append(row, opts, errEl);

    const open = () => box.classList.add('is-open');
    txt.onfocus = open;
    txt.oninput = () => { if (txt.value) open(); };
    /* ⚠️ Enter يضيف ويُعيد التركيز للحقل: من يكتب قائمةً يكتب بنوداً
       متتابعة، وإعادةُ يده إلى الفأرة بين كل بندين تُنهي الجلسة عند الثاني. */
    txt.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };

    async function commit() {
      const r = addItem(items, { text: txt.value, due: dueIn.value, remindAt: remind.value }, uid());
      if (r.error) { errEl.textContent = r.error; return; }
      errEl.textContent = '';
      if (await save(r.items)) {
        const next = host.querySelector('.quickadd__input');
        if (next) next.focus();
      }
    }
    return box;
  }

  function labelled(text, input) {
    const w = el('label', 'quickadd__field');
    w.appendChild(el('span', '', esc(text)));
    w.appendChild(input);
    return w;
  }

  /* ── صفّ مهمة نظام ──
     ⚠️ بلا مربّع اختيار: المهمة الرسمية لا تُنجَز من هنا — الموظف يرسلها
     للاعتماد ومديره يعتمدها. مربّعٌ هنا يوهم بغير ذلك. */
  function taskRow(item, task) {
    const r = el('div', 'dayrow dayrow--task');
    if (!task) {
      /* ⚠️ لا تُحذف تلقائياً: الاختفاء الصامت يجعل الموظف يظنّ أنه فقد شيئاً */
      r.innerHTML =
        `<span class="dayrow__ic">${icon('check')}</span>
         <span class="dayrow__body"><span class="dayrow__text is-gone">خرجت من مهامك النشِطة</span>
         <span class="dayrow__meta"><span>اعتُمدت أو أُلغيت</span></span></span>`;
    } else {
      const d = dueStateOf(task, today);
      const pr = progressOf(task);
      r.innerHTML =
        `<span class="dayrow__ic">${icon('check')}</span>
         <span class="dayrow__body">
           <button class="dayrow__text as-link" type="button">${esc(task.title)}</button>
           <span class="dayrow__meta">
             <span>${esc(STATUS_AR[task.status] || '')}</span>
             ${d.text ? `<span class="${d.kind === 'overdue' ? 'text-red' : d.kind === 'today' ? 'text-amber' : ''}">${esc(d.text)}</span>` : ''}
             ${pr.source === 'checklist' ? `<span>${pr.pct}٪ من البنود</span>` : ''}
           </span>
         </span>`;
      r.querySelector('.as-link').onclick = () => go('task', task.id);
    }
    r.appendChild(rowAction('أزل من يومي', 'x', () => save(removeItem(items, item.id))));
    return r;
  }

  function todoRow(x) {
    const r = el('div', 'dayrow' + (x.done ? ' is-done' : ''));
    /* ⚠️ مربّع دائري مبنيّ بزرّ لا بـ<input type=checkbox>: المربّع الأصلي
       يختلف شكله بين ويندوز وآيفون وأندرويد، فتبدو القائمة نظاماً مختلفاً
       لكل موظف. والزرّ يحمل aria-pressed فيبقى مفهوماً لقارئ الشاشة. */
    const box = el('button', 'dayrow__check' + (x.done ? ' is-on' : ''));
    box.type = 'button';
    box.setAttribute('aria-pressed', x.done ? 'true' : 'false');
    box.setAttribute('aria-label', x.done ? 'إلغاء الإنجاز' : 'أنجزته');
    box.innerHTML = icon('check');
    box.onclick = () => save(toggleItem(items, x.id, today));

    const late = !x.done && x.due && x.due < today;
    const body = el('span', 'dayrow__body');
    body.innerHTML =
      `<span class="dayrow__text">${esc(x.text)}</span>` +
      ((x.due || x.remindAt)
        ? `<span class="dayrow__meta">
             ${x.due ? `<span class="${late ? 'text-red' : x.due === today ? 'text-amber' : ''}">${
               late ? 'فات موعدها · ' + esc(x.due) : x.due === today ? 'اليوم' : esc(x.due)}</span>` : ''}
             ${x.remindAt ? `<span>${icon('clock')}تذكير ${esc(x.remindAt)}</span>` : ''}
           </span>`
        : '');

    r.append(box, body, rowAction('حذف', 'trash', () => save(removeItem(items, x.id))));
    return r;
  }

  /* ⚠️ زرّ الصفّ يظهر عند التمرير أو التركيز فقط — لكنه يبقى في شجرة
     الوصول دائماً ويأخذ Tab. الإخفاء بـopacity لا بـdisplay لهذا السبب. */
  function rowAction(label, ico, onClick) {
    const b = el('button', 'dayrow__act', icon(ico));
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.onclick = onClick;
    return b;
  }

  function sectionLabel(text, help, action, ico) {
    const h = el('div', 'daysec');
    const box = el('div', 'daysec__box');
    box.innerHTML =
      `<span class="daysec__title">${ico ? icon(ico) : ''}${esc(text)}</span>` +
      (help ? `<span class="daysec__help">${esc(help)}</span>` : '');
    h.appendChild(box);
    if (action) h.appendChild(action);
    return h;
  }

  /* اختيار مهمة من مهامي — بلا نسخ، المرجع وحده */
  function openPick() {
    const chosen = new Set(items.filter((x) => x.ref && !x.done).map((x) => x.ref));
    const avail = tasks.filter((t) => !chosen.has(t.id));
    const m = openModal(`
      <h3>اختر مهامّ ليومك</h3>
      ${avail.length ? '' : '<div class="empty">كل مهامك النشِطة في يومك بالفعل.</div>'}
      <div class="picklist">${avail.map((t) => `
        <label class="checkbox"><input type="checkbox" value="${esc(t.id)}">
          ${esc(t.title)} <span class="cell-sub">${esc(STATUS_AR[t.status] || '')}${
            t.dueDate ? ' · ' + esc(t.dueDate) : ''}</span></label>`).join('')}</div>
      <div class="row">
        <button class="btn ghost" id="pkCancel">إلغاء</button>
        <button class="btn" id="pkOk"${avail.length ? '' : ' disabled'}>أضف ليومي</button>
      </div>`);
    m.$('#pkCancel').onclick = m.close;
    m.$('#pkOk').onclick = () => {
      let next = items;
      m.modal.querySelectorAll('.picklist input:checked').forEach((c) => {
        const r = addItem(next, { ref: c.value, text: '' }, uid());
        if (!r.error) next = r.items;
      });
      m.close(); save(next);
    };
  }

  draw();
}
