/* ═══════════════════════════════════════════════════════════════════════════
   لوحة المهام — أعمدة بالحالة، والسحب بينها ينقلها

   ⚠️ **السحب لا يتجاوز آلة الحالات.** كل إسقاط يمرّ على `dropAllowed()`
   النقيّة، وهي تنادي `allowedMoves()` نفسها التي تحكم الأزرار. طريقٌ ثانٍ
   بقواعد أرخى يعني أن الموظف يعتمد مهمته بجرّها — وهو بالضبط ما تمنعه
   خطوة «بانتظار الاعتماد».

   ⚠️ وبعض الانتقالات **تفتح نافذة ولا تُكتب مباشرةً**: التوقّف يحتاج سبباً
   (متوقفة بلا سبب مهمةٌ منسيّة باسم آخر)، والاعتماد يحتاج تقييماً وملاحظة.
   الإسقاط يبدأ الإجراء ولا يُنهيه.

   ⚠️ **HTML5 drag-and-drop لا يعمل على اللمس إطلاقاً** — لا على آيفون ولا
   أندرويد. فالسحب تحسينٌ لسطح المكتب، وكل نقلة ممكنة بالسحب ممكنة أيضاً من
   زرّ على البطاقة نفسها. لو صار السحب الطريق الوحيد لصارت اللوحة معطّلة على
   الجهاز الذي يُستعمل منه النظام أكثر.

   ⚠️ والبطاقة زرّ لا `div`: تُفتح بـEnter، وتدخل ترتيب Tab، ويقرؤها قارئ
   الشاشة. لوحةٌ لا تُقاد إلا بالفأرة تُقصي من لا يستعملها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { boardColumns, dueStateOf, progressOf, blockInfo, dropAllowed,
         nextStepFor, isStaleTask, BOARD_STATUSES,
         STATUS_AR, PRIORITY_AR } from '../lib/task-flow.js';
import { icon } from '../lib/icons.js';

const TONE = { urgent: 'r', high: 'a', normal: '', low: '' };

/* رسائل الرفض — تقول **لماذا** لا «غير مسموح» وحدها */
const DENY_AR = {
  same:     '',
  notYours: 'هذه النقلة بيد مديرك — أرسلها للاعتماد وهو يعتمدها',
  blocked:  'لا يمكن نقلها إلى هذه الحالة من حالتها الآن',
  none:     'تعذّر تحديد المهمة'
};

/* ═══ البناء ═══
   opts:
     tasks     المهام المعروضة (محمَّلة أصلاً — لا تقرأ اللوحة شيئاً)
     who       'assignee' | 'manager' | 'admin'
     today     ymdKsa()
     statuses  أعمدة اللوحة
     onOpen    (task) => void        فتح التفاصيل
     onMove    (task, to) => Promise نقلٌ مباشر
     onNeeds   (task, to, needs) => void  نقلٌ يحتاج نافذة أولاً
     onDeny    (msg) => void         تفسير الرفض للمستخدم               */
export function taskBoard({ tasks, who, today, statuses = BOARD_STATUSES,
                            onOpen, onMove, onNeeds, onDeny }) {
  const board = el('div', 'board');
  /* ⚠️ المرجع في متغيّر لا في dataTransfer وحده: سفاري لا يُتيح قراءة
     dataTransfer أثناء dragover، فقرار «هل يُقبل هنا» يحتاج المهمة قبل
     الإسقاط لا بعده. */
  let dragging = null;

  boardColumns(tasks, today, statuses).forEach((col) => {
    const c = el('section', 'board__col');
    c.dataset.status = col.status;
    c.innerHTML =
      `<header class="board__head">
         <span class="board__title">${esc(col.label)}</span>
         <span class="board__count">${col.tasks.length}</span>
       </header>`;
    const body = el('div', 'board__body');

    if (!col.tasks.length) body.appendChild(el('p', 'board__empty', 'لا شيء هنا'));
    col.tasks.forEach((t) => body.appendChild(cardOf(t)));

    /* ── الإسقاط ──
       ⚠️ preventDefault في dragover شرطٌ لقبول الإسقاط أصلاً — بدونه لا
       يقع حدث drop إطلاقاً، وتبدو اللوحة معطّلة بلا رسالة. */
    c.addEventListener('dragover', (e) => {
      if (!dragging) return;
      const v = dropAllowed(dragging, who, col.status);
      if (v.reason === 'same') return;
      e.preventDefault();
      c.classList.add(v.ok ? 'is-over' : 'is-deny');
    });
    c.addEventListener('dragleave', () => c.classList.remove('is-over', 'is-deny'));
    c.addEventListener('drop', (e) => {
      e.preventDefault();
      c.classList.remove('is-over', 'is-deny');
      const t = dragging; dragging = null;
      if (!t) return;
      const v = dropAllowed(t, who, col.status);
      if (!v.ok) { if (v.reason !== 'same' && onDeny) onDeny(DENY_AR[v.reason] || ''); return; }
      if (v.needs) onNeeds(t, col.status, v.needs);
      else onMove(t, col.status);
    });

    c.appendChild(body);
    board.appendChild(c);
  });

  function cardOf(t) {
    const due = dueStateOf(t, today);
    const pr = progressOf(t);
    const bi = blockInfo(t, tasks, today);
    const stale = isStaleTask(t, today);

    const card = el('button', 'tcard' + (due.kind === 'overdue' ? ' tcard--late' : ''));
    card.type = 'button';
    /* ⚠️ يُسحب فقط من يملك نقلةً واحدة على الأقل: بطاقةٌ تُسحب ثم تُرفض
       دائماً تعلّم المستخدم أن اللوحة معطّلة. */
    const movable = nextStepFor(t, who) !== null;
    card.draggable = movable;
    card.innerHTML =
      `<span class="tcard__title">${esc(t.title)}</span>` +
      ((t.departments || []).length
        ? `<span class="tcard__sub">${esc((t.departments || []).join(' · '))}</span>` : '') +
      `<span class="tcard__foot">
         <span class="tcard__who">${esc(t.assigneeName || 'بلا مكلَّف')}${
           t.dueDate ? ' · ' + esc(t.dueDate) : ''}</span>
         <span class="pill pill--dot ${TONE[t.priority] || ''}">${
           esc(PRIORITY_AR[t.priority] || 'عادية')}</span>
       </span>` +
      ((stale || bi.byDeps || t.needsImprovement || pr.source === 'checklist')
        ? `<span class="tcard__flags">${
            stale ? '<span class="text-red">بلا حراك</span>' : ''}${
            t.needsImprovement ? '<span class="text-amber">يحتاج تحسين</span>' : ''}${
            bi.byDeps ? '<span class="text-amber">محجوبة</span>' : ''}${
            pr.source === 'checklist' ? `<span>${pr.pct}٪</span>` : ''}</span>`
        : '');

    card.onclick = () => onOpen(t);
    if (movable) {
      card.addEventListener('dragstart', (e) => {
        dragging = t;
        card.classList.add('is-dragging');
        /* setData إلزامي في فَيَرفُكس وإلا لا يبدأ السحب */
        try { e.dataTransfer.setData('text/plain', t.id); } catch (err) { /* سفاري القديم */ }
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        dragging = null;
        card.classList.remove('is-dragging');
        board.querySelectorAll('.is-over,.is-deny')
          .forEach((x) => x.classList.remove('is-over', 'is-deny'));
      });
    }
    return card;
  }

  return board;
}

export { BOARD_STATUSES, STATUS_AR };
