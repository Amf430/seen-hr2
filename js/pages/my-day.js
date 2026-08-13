/* ═══════════════════════════════════════════════════════════════════════════
   يومي — مهام النظام التي اخترتَها ليومك، وقائمتك الشخصية

   ⚠️ **قائمتان بينهما فرق بصري صريح ونصّ مكتوب.** الخلط بينهما يُفقد الاثنتين
   معناهما: مهمة النظام لها مدير وتدخل التقارير، والتذكير الشخصي لا يراه أحد
   ولا يدخل شيئاً. من لا يعرف أيّهما يكتب، يكتب في الأسلم — فيتوقّف عن
   استعمال القائمة الشخصية أصلاً.

   ⚠️ مهام النظام **مراجع لا نسخ**: العنصر يحمل معرّف المهمة وحده، ويُحَلّ من
   المصفوفة المحمَّلة لـ«مهامي». فأي تعديل على المهمة الأصلية يظهر هنا فوراً،
   وصفر قراءة إضافية.

   ⚠️ ولا إشعار والتطبيق مغلق — لا خادم عندنا. «التذكير» هنا معناه: يظهر في
   الرئيسية وفي هذه الصفحة حين يحين موعده. مكتوبٌ في الشاشة لا في تعليق فقط.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, uid } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { readTodos, writeTodos } from '../lib/todo-io.js';
import { addItem, toggleItem, removeItem, todayView, prunable, pruneDone,
         dueReminders, MAX_TEXT, PRUNE_AFTER_DAYS } from '../lib/todo.js';
import { tasksForAssignee } from '../lib/tasks.js';
import { dueStateOf, progressOf, STATUS_AR, PRIORITY_AR } from '../lib/task-flow.js';
import { isStale, go } from '../lib/nav.js';
import { card, sectionHead, button, loading, callout, empty, pageHead, pill } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

export async function render(view, token) {
  const me = getMe();
  const today = ymdKsa();

  view.appendChild(pageHead('يومي',
    'ما اخترتَه من مهامك ليومك، وتذكيراتك الخاصة. القائمة الشخصية لك وحدك.'));

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

  async function save(next) {
    try { items = await writeTodos(next); draw(); }
    catch (e) { console.error('todo-save', e); toast('تعذّر الحفظ', 'err'); }
  }

  function draw() {
    host.innerHTML = '';
    const v = todayView(items, byId, today);
    const due = dueReminders(items, today);

    /* ── تذكيرات حان وقتها ──
       ⚠️ الفائت يظهر معها لا يُطوى: من فتح النظام بعد يومين يجب أن يرى ما فاته. */
    if (due.length) host.appendChild(callout('warn',
      `${due.length === 1 ? 'تذكير حان وقته' : `${due.length} تذكيرات حان وقتها`}`,
      due.slice(0, 4).map((x) => x.text).join(' · ')));

    /* ══════════ الإضافة السريعة ══════════ */
    const addCard = card('');
    addCard.appendChild(sectionHead({ text: 'أضف إلى قائمتك', icon: 'plus' }));
    const row = el('div', 'cluster');
    const txt = el('input', 'grow');
    txt.placeholder = 'اتّصل بالعميل · جهّز ملف العقد · راجع الفاتورة';
    txt.maxLength = MAX_TEXT;
    const dueIn = el('input', '');
    dueIn.type = 'date'; dueIn.title = 'موعد اختياري';
    const remind = el('input', '');
    remind.type = 'date'; remind.title = 'تذكير اختياري';
    const errEl = el('div', 'err', '');
    const add = button('أضف', 'btn sm', () => {
      const r = addItem(items, { text: txt.value, due: dueIn.value, remindAt: remind.value }, uid());
      if (r.error) { errEl.textContent = r.error; return; }
      errEl.textContent = ''; txt.value = ''; dueIn.value = ''; remind.value = '';
      save(r.items);
    }, 'plus');
    /* ⚠️ Enter يضيف: نموذجٌ يحتاج فأرةً لإضافة سطر واحد لا يُستعمل مرّتين */
    txt.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } };
    row.append(txt, dueIn, remind, add);
    addCard.appendChild(row);
    addCard.appendChild(errEl);
    addCard.appendChild(el('p', 'help',
      'اكتب واضغط Enter. الموعد والتذكير اختياريان — والتذكير يظهر في رئيسيتك يوم موعده.'));
    host.appendChild(addCard);

    /* ══════════ مهام النظام ══════════ */
    const tc = card('');
    tc.appendChild(sectionHead({ text: `مهام النظام في يومي (${v.tasks.length})`, icon: 'check' },
      button('اختر من مهامي', 'btn sm ghost', () => openPick(), 'plus')));
    tc.appendChild(el('p', 'desc',
      'مهام رسمية لها مدير وتدخل التقارير. هذه إشارات إليها لا نسخ — أي تعديل عليها يظهر هنا فوراً.'));
    if (!v.tasks.length) {
      tc.appendChild(empty('لم تختر مهمة ليومك بعد.', 'check'));
    } else {
      v.tasks.forEach(({ item, task }) => tc.appendChild(taskRow(item, task)));
    }
    host.appendChild(tc);

    /* ══════════ القائمة الشخصية ══════════ */
    /* ⚠️ card() وسيطها الأول **عنوان** لا صنف — تمريرُ صنفٍ إليها يطبعه
       على الشاشة نصّاً. الصنف يُضاف بعدها. */
    const pc = card('');
    pc.classList.add('private');
    pc.appendChild(sectionHead({ text: `قائمتي الشخصية (${v.personal.length})`, icon: 'list' }));
    /* ⚠️ الوعد يُكتب في الشاشة لا في تعليق: الوعد الذي لا يُقرأ لا يُصدَّق،
       والقائمة التي يظنّها الموظف مقروءة لا يكتب فيها ما ينفعه. */
    pc.appendChild(el('p', 'desc private__note',
      `${icon('shield')} هذه لك وحدك — لا يراها مديرك ولا الموارد البشرية، ولا تدخل تقاريرك ولا تقييمك.`));
    if (!v.personal.length) {
      pc.appendChild(empty('لا تذكيرات. أضف واحداً من الأعلى.', 'list'));
    } else {
      v.personal.forEach((x) => pc.appendChild(personalRow(x)));
    }
    host.appendChild(pc);

    /* ══════════ المنجز ══════════ */
    if (v.done.length) {
      const dc = card('');
      const old = prunable(items, today);
      dc.appendChild(sectionHead({ text: `أنجزتها (${v.done.length})`, icon: 'archive' },
        old.length
          ? button(`احذف ${old.length} قديماً`, 'btn sm ghost',
              () => save(pruneDone(items, today)), 'trash')
          : null));
      v.done.slice(0, 20).forEach((x) => dc.appendChild(personalRow(x)));
      if (old.length) dc.appendChild(el('p', 'help',
        `ما مضى على إنجازه ${PRUNE_AFTER_DAYS} يوماً يمكن حذفه. لا يُحذف تلقائياً — الحذف لا رجعة فيه والقرار لك.`));
      host.appendChild(dc);
    }
  }

  /* صفّ مهمة نظام — يُحَلّ من المصفوفة المحمَّلة، ولا يُنسخ منه شيء */
  function taskRow(item, task) {
    const r = el('div', 'todo todo--task');
    if (!task) {
      /* ⚠️ لا تُحذف تلقائياً: الاختفاء الصامت يجعل الموظف يظنّ أنه فقد شيئاً */
      r.innerHTML = `<span class="todo__ic">${icon('check')}</span>
        <div class="todo__body"><span class="todo__text is-gone">خرجت هذه المهمة من مهامك النشِطة</span>
        <span class="cell-sub">اعتُمدت أو أُلغيت — احذفها من يومك</span></div>`;
    } else {
      const d = dueStateOf(task, today);
      const pr = progressOf(task);
      r.innerHTML = `<span class="todo__ic">${icon('check')}</span>
        <div class="todo__body">
          <button class="todo__text as-link" type="button">${esc(task.title)}</button>
          <span class="todo__meta">
            ${pill(task.status === 'review' ? 'a' : task.status === 'blocked' ? 'a' : '',
                   STATUS_AR[task.status] || '')}
            ${d.text ? `<span class="${d.kind === 'overdue' ? 'text-red' : d.kind === 'today' ? 'text-amber' : 'text-muted'}">${esc(d.text)}</span>` : ''}
            ${pr.source === 'checklist' ? `<span class="text-muted">${pr.pct}٪ من البنود</span>` : ''}
            <span class="text-muted">${esc(PRIORITY_AR[task.priority] || '')}</span>
          </span>
        </div>`;
      r.querySelector('.as-link').onclick = () => go('task', task.id);
    }
    const rm = button('أزل', 'btn sm ghost', () => save(removeItem(items, item.id)), 'x');
    r.appendChild(rm);
    return r;
  }

  function personalRow(x) {
    const r = el('div', 'todo' + (x.done ? ' is-done' : ''));
    const box = el('input', '');
    box.type = 'checkbox'; box.checked = x.done;
    box.className = 'todo__box';
    box.onchange = () => save(toggleItem(items, x.id, today));
    const body = el('div', 'todo__body');
    const late = !x.done && x.due && x.due < today;
    body.innerHTML =
      `<span class="todo__text">${esc(x.text)}</span>` +
      ((x.due || x.remindAt)
        ? `<span class="todo__meta">
             ${x.due ? `<span class="${late ? 'text-red' : x.due === today ? 'text-amber' : 'text-muted'}">${
               late ? 'فات موعدها · ' : x.due === today ? 'اليوم · ' : ''}${esc(x.due)}</span>` : ''}
             ${x.remindAt ? `<span class="text-muted">${icon('clock')}تذكير ${esc(x.remindAt)}</span>` : ''}
           </span>`
        : '');
    r.append(box, body, button('حذف', 'btn sm ghost', () => save(removeItem(items, x.id)), 'trash'));
    return r;
  }

  /* اختيار مهمة من مهامي — بلا نسخ، المرجع وحده */
  function openPick() {
    import('../lib/dom.js').then(({ openModal }) => {
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
    });
  }

  draw();
}
