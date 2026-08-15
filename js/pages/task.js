/* ═══════════════════════════════════════════════════════════════════════════
   صفحة المهمة — مركز كل ما يخصّها في شاشة واحدة

   ⚠️ عمودان على الشاشة العريضة وعمودٌ واحد على الجوال. كانت ستّ بطاقات
   مكدّسة رأسياً، فالمحادثة — وهي المكان الذي يجري فيه العمل فعلاً — تحت
   الطيّة دائماً. الآن: الرئيسي يحمل الوصف والبنود والسجل، والجانبي يحمل
   ما يُقرأ ولا يُكتب فيه (الحالة · المكلَّف · التواريخ · الوقت).

   ⚠️ المحادثة إنشاء-فقط بقاعدتها (allow update, delete: if false)، تماماً
   كخيط hrTickets. خيطٌ يُعدَّل بعد الفعل ليس سجلاً لشيء: المدير يقدر يعيد
   كتابة ما طلبه، والموظف ما وعد به.

   ⚠️ **سجل النشاط مشتقّ لا مخزَّن** — انظر buildTimeline في task-flow.js.
   «يُسجَّل تلقائياً» تعني كوداً على الخادم ولا خادم عندنا، وأي حدث يكتبه
   متصفّح الموظف يستطيع تزويره.

   ⚠️ الاشتراك اللحظي عبر lifecycle.trackSubscription لا onSnapshot عارياً —
   وإلا تسرّب الاشتراك بين الصفحات وبقي يسمع بعد مغادرتها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { fmtDT } from '../lib/format.js';
import { getTask, watchMessages, postMessage, moveTask, updateTask,
         startTimer, stopTimer } from '../lib/tasks.js';
import { roleFor, dueStateOf, progressOf, allowedMoves, timeSummary,
         blockInfo, delegationActive, buildTimeline, filterTimeline,
         MAX_BLOCK_REASON, STATUS_AR, PRIORITY_AR } from '../lib/task-flow.js';
import { trackSubscription } from '../lib/lifecycle.js';
import { isStale, go, getPageArg } from '../lib/nav.js';
import { card, empty, sectionHead, button, loading, callout, detailLine,
         bar, pill } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

/* لون الوسم لكل حالة — تُقرأ باللون والنصّ معاً لا باللون وحده */
const STATUS_TONE = {
  new: '', in_progress: 'i', blocked: 'a', review: 'a',
  done: 'g', cancelled: '', archived: ''
};

const EVENT_ICON = {
  created: 'plus', started: 'clock', blocked: 'alert', review: 'inbox',
  reopened: 'back', done: 'check', cancelled: 'x', archived: 'archive',
  delegated: 'people', message: 'inbox', time: 'clock'
};

/* ⚠️ الوسيط يُقرأ من getPageArg() لا من معامل ثالث — الراوتر ينادي
   render(view, token) فقط، ونمط الصفحات القائمة (employee-profile) هذا. */
export async function render(view, token) {
  const me = getMe();
  const today = ymdKsa();
  const id = getPageArg() || '';

  if (!id) {
    view.appendChild(el('div', 'card', '<div class="empty">لا مهمة محدّدة.</div>'));
    return;
  }

  view.appendChild(loading('جارٍ فتح المهمة…'));

  let t;
  try { t = await getTask(id); }
  catch (e) {
    console.error('task', e);
    if (isStale(token)) return;
    view.innerHTML = '';
    view.appendChild(callout('warn', 'تعذّر فتح المهمة', 'قد لا تكون من صلاحيتك.'));
    return;
  }
  if (isStale(token)) return;
  view.innerHTML = '';

  if (!t) {
    view.appendChild(el('div', 'card', '<div class="empty">المهمة غير موجودة أو حُذفت.</div>'));
    return;
  }

  const who = roleFor(t, me);
  if (!who) {
    view.appendChild(el('div', 'card', '<div class="empty">لا صلاحية لك على هذه المهمة.</div>'));
    return;
  }

  const due = dueStateOf(t, today);
  const pr  = progressOf(t);
  const bi  = blockInfo(t, null, today);

  /* ══════════ الترويسة ══════════ */
  const head = el('header', 'taskhead');
  head.innerHTML =
    `<div class="taskhead__top">
       <button class="btn sm ghost" id="tkBack">${icon('back')}رجوع</button>
       <div class="taskhead__pills">
         ${pill(STATUS_TONE[t.status] || '', STATUS_AR[t.status] || t.status)}
         ${pill(t.priority === 'urgent' ? 'r' : t.priority === 'high' ? 'a' : '',
                PRIORITY_AR[t.priority] || 'عادية')}
         ${due.text ? pill(due.kind === 'overdue' ? 'r' : due.kind === 'today' ? 'a' : '', due.text) : ''}
       </div>
     </div>
     <h1 class="taskhead__title">${esc(t.title)}</h1>`;
  head.querySelector('#tkBack').onclick =
    () => go(who === 'assignee' ? 'my-tasks' : 'team-tasks');
  view.appendChild(head);

  /* ⚠️ التنبيهات فوق العمودين لا داخل أحدهما: ملاحظة «يحتاج تحسين» المدفونة
     في عمود جانبي يعيد الموظف معها نفس العمل فتُعاد إليه ثانيةً. */
  if (t.needsImprovement && t.managerNote)
    view.appendChild(callout('warn', 'أُعيدت للتحسين', t.managerNote));
  if (t.status === 'cancelled')
    view.appendChild(callout('info', 'هذه المهمة ملغاة',
      'لا تُحسب منجزةً ولا متأخرة. يعيدها مدير القسم للتنفيذ إن لزم.'));
  if (bi.reasonMissing)
    view.appendChild(callout('warn', 'متوقفة بلا سبب مكتوب',
      'لا أحد يعرف ما تنتظره — والمهمة المتوقّفة بلا سبب منسيّةٌ باسم آخر.'));
  if (t.delegatedToUid) {
    const live = delegationActive(t, today);
    view.appendChild(callout(live ? 'info' : 'warn',
      live ? `مفوَّضة إلى ${t.delegatedToName || ''}` : 'تفويض منتهٍ',
      live
        ? `${t.delegatedUntil ? 'حتى ' + t.delegatedUntil + '. ' : ''}المكلَّف الأصلي ما زال على المهمة — التفويض إضافة لا استبدال.`
        : `انتهى في ${t.delegatedUntil}. النظام بلا خادم فلا يلغيه تلقائياً — يلغيه المدير من لوحة القسم.`));
  }
  /* ⚠️ إرشاد إداري لا قيد أمني: لا يمكن فرض الاعتماديات في قاعدة (تحتاج
     get() لكل مانع، وهي قراءة مفوترة على كل كتابة). */
  if ((t.blockedByTaskIds || []).length)
    view.appendChild(callout('warn', 'هذه المهمة تنتظر مهامّ أخرى',
      'ابدأها بعد إنجاز ما يسبقها. تنبيه تنظيمي — النظام لا يمنعك.'));

  /* ══════════ العمودان ══════════ */
  const cols = el('div', 'taskgrid');
  const main = el('div', 'taskgrid__main');
  const side = el('aside', 'taskgrid__side');
  cols.append(main, side);
  view.appendChild(cols);

  /* ── الوصف ── */
  if (t.description) {
    const d = card('');
    d.appendChild(sectionHead({ text: 'الوصف', icon: 'doc' }));
    d.appendChild(el('p', 'desc', esc(t.description)));
    main.appendChild(d);
  }

  /* ── القائمة الفرعية ──
     ⚠️ لا انتقال تلقائي إلى «بانتظار الاعتماد» عند اكتمال البنود: الموظف
     يشطب ثم يراجع عمله قبل الإرسال، والنقل التلقائي يسلبه هذه اللحظة ويضع
     المهمة أمام مديره قبل أن ينتهي فعلاً. اقتراحٌ بارز لا فرض. */
  if ((t.checklist || []).length) {
    const cc = card('');
    const done = t.checklist.filter((c) => c.done).length;
    cc.appendChild(sectionHead({
      text: `القائمة الفرعية — ${done}/${t.checklist.length}`, icon: 'check' }));
    t.checklist.forEach((item, i) => {
      const row = el('label', 'checkbox');
      row.innerHTML = `<input type="checkbox" ${item.done ? 'checked' : ''}
        ${who === 'assignee' ? '' : 'disabled'}> ${esc(item.text || '')}`;
      if (who === 'assignee') {
        row.querySelector('input').onchange = async (ev) => {
          const next = t.checklist.map((c, j) => (j === i ? { ...c, done: ev.target.checked } : c));
          try { await updateTask(t.id, { checklist: next }); go('task', t.id); }
          catch (e) { console.error(e); toast('تعذّر الحفظ', 'err'); ev.target.checked = !ev.target.checked; }
        };
      }
      cc.appendChild(row);
    });
    if (who === 'assignee' && done === t.checklist.length && t.status === 'in_progress')
      cc.appendChild(callout('info', 'اكتملت كل البنود',
        'راجع عملك ثم أرسلها للاعتماد من زرّ الإجراء — لا يرسلها النظام عنك.'));
    main.appendChild(cc);
  }

  /* ── السجل والمحادثة: ثلاثة مرشِّحات على خيط واحد ──
     ⚠️ نفس البيانات، صفر قراءة إضافية. وخلط النشاط بالتعليقات في تيّار واحد
     بلا فصل يجعل الاثنين غير مقروءين. */
  const thread = card('');
  const tabs = el('div', 'tabs');
  let mode = 'all', msgs = [];
  const list = el('div', 'timeline');

  [['all', 'الكل'], ['chat', 'المحادثة'], ['events', 'النشاط']].forEach(([k, lbl]) => {
    const b = el('button', 'tab' + (k === mode ? ' is-on' : ''), esc(lbl));
    b.dataset.mode = k;
    b.onclick = () => {
      mode = k;
      tabs.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-on', x.dataset.mode === k));
      paint();
    };
    tabs.appendChild(b);
  });
  thread.appendChild(sectionHead({ text: 'سجل المهمة', icon: 'list' }));
  thread.appendChild(tabs);
  thread.appendChild(list);

  function paint() {
    const items = filterTimeline(buildTimeline(t, msgs), mode);
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(empty(mode === 'chat' ? 'لا رسائل بعد.' : 'لا نشاط بعد.', 'list'));
      return;
    }
    items.forEach((x) => {
      const mine = x.kind === 'message' && x.meta && x.meta.raw && x.meta.raw.authorUid === me.id;
      const row = el('div', 'tl' + (x.kind === 'message' ? ' tl--msg' : '') + (mine ? ' tl--mine' : ''));
      const when = (x.meta && x.meta.raw && x.meta.raw.createdAt) ? fmtDT(x.meta.raw.createdAt) : x.ymd;
      row.innerHTML =
        `<span class="tl__ic">${icon(EVENT_ICON[x.kind] || 'dot')}</span>` +
        '<div class="tl__body">' +
          `<div class="tl__head">${x.actor ? `<b>${esc(x.actor)}</b>` : ''}` +
          `<span class="cell-sub">${esc(when || '')}</span></div>` +
          `<div class="tl__text">${esc(x.text)}</div>` +
        '</div>';
      list.appendChild(row);
    });
    if (mode !== 'events') list.scrollTop = list.scrollHeight;
  }
  paint();

  const composer = el('div', 'cluster');
  const input = el('input', 'grow');
  input.placeholder = 'اكتب رسالة حول هذه المهمة…';
  input.maxLength = 2000;
  const send = button('إرسال', 'btn sm', async () => {
    const text = input.value.trim();
    if (!text) return;
    send.disabled = true;
    try { await postMessage(t.id, text); input.value = ''; }
    catch (e) { console.error(e); toast('تعذّر الإرسال', 'err'); }
    finally { send.disabled = false; }
  });
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send.click(); } };
  composer.append(input, send);
  thread.appendChild(composer);
  thread.appendChild(el('p', 'help',
    'الرسائل لا تُعدَّل ولا تُحذف — هذا سجل المهمة. وأحداث النشاط مشتقّة من المهمة نفسها ولا يكتبها أحد بيده.'));
  main.appendChild(thread);

  trackSubscription(watchMessages(t.id, (l) => { msgs = l; paint(); }, (e) => {
    console.error('thread', e);
    list.innerHTML = '';
    list.appendChild(empty('تعذّر تحميل المحادثة.', 'inbox'));
  }));

  /* ══════════ العمود الجانبي ══════════ */

  const moves = allowedMoves(t, who);
  if (moves.length) {
    const mc = card('');
    mc.appendChild(sectionHead({ text: 'الإجراء', icon: 'gear' }));
    const acts = el('div', 'sidebtns');
    moves.forEach((to) => {
      acts.appendChild(button(STATUS_AR[to],
        'btn sm ghost' + (to === 'cancelled' ? ' danger' : ''), async () => {
          if (to === 'blocked') { openBlock(); return; }
          try { await moveTask(t, to); toast('حُدّثت الحالة', 'ok'); go('task', t.id); }
          catch (e) { console.error(e); toast('تعذّر تحديث الحالة', 'err'); }
        }));
    });
    mc.appendChild(acts);
    side.appendChild(mc);
  }

  const info = card('');
  info.appendChild(sectionHead({ text: 'المعلومات', icon: 'info' }));
  info.appendChild(el('div', 'detail-list', [
    detailLine('المكلَّف', t.assigneeName || '—'),
    detailLine('القسم', (t.departments || []).join(' · ') || '—'),
    detailLine('البداية', t.startDate || '—'),
    detailLine('الاستحقاق', t.dueDate || '—'),
    detailLine('أنشأها', t.createdByName || '—'),
    detailLine('أُنشئت في', t.createdAtYmd || '—'),
    bi.manual && bi.reason ? detailLine('سبب التوقّف', bi.reason) : '',
    t.reopenCount ? detailLine('أُعيدت للتحسين', `${t.reopenCount} مرة`) : '',
    t.managerRating ? detailLine('التقييم', `${t.managerRating}/5`) : ''
  ].join('')));
  if (pr.pct !== null) {
    info.appendChild(el('div', '', bar(pr.pct)));
    info.appendChild(el('p', 'help', pr.source === 'checklist'
      ? 'النسبة محسوبة من بنود القائمة الفرعية.'
      : pr.source === 'status' ? 'المهمة مغلقة.'
      : 'تقدير يدوي — أضف قائمة فرعية ليُحسب تلقائياً.'));
  }
  side.appendChild(info);

  /* ── الوقت الفعلي ──
     ⚠️ يُعرض للمدير والموظف معاً، **ولا يدخل تقييم أحد**. تحويل دقّة التقدير
     إلى درجة يجعل الناس تضخّم تقديراتها، فتفقد الرقم ومهارة التقدير معاً.

     ⚠️ «إيقاف مؤقّت» و«إنهاء» نفس العملية على البيانات — إغلاق المدخلة —
     ويختلفان في نيّة المستخدم وحدها، و«الاستئناف» مدخلةٌ جديدة. فالنموذج
     يدعم الأربعة بلا أي تغيير في البيانات ولا في القاعدة. */
  const ts = timeSummary(t);
  if (who === 'assignee' || ts.entries) {
    const tc = card('');
    tc.appendChild(sectionHead({ text: 'الوقت الفعلي', icon: 'clock' }));
    tc.appendChild(el('div', 'detail-list', [
      detailLine('المسجَّل', `${ts.actualHours} ساعة (${ts.entries} مدخلة)`),
      detailLine('المقدَّر', ts.estimateHours ? `${ts.estimateHours} ساعة` : '—'),
      detailLine('النسبة', ts.pct === null ? '— (بلا تقدير)' : `${ts.pct}%`)
    ].join('')));
    if (who === 'assignee' && t.status === 'in_progress') {
      const btns = el('div', 'sidebtns');
      if (ts.hasOpenEntry) {
        btns.appendChild(el('span', 'pill pill--dot g', 'العدّاد يعمل'));
        btns.appendChild(button('إيقاف مؤقّت', 'btn sm ghost', () => toggleTimer(false)));
      } else if (!ts.atCap) {
        btns.appendChild(button(ts.entries ? 'استئناف' : 'ابدأ العدّاد', 'btn sm', () => toggleTimer(true)));
      }
      tc.appendChild(btns);
      if (ts.atCap) tc.appendChild(el('p', 'help', 'بلغت ٥٠ مدخلة — الحدّ الأقصى.'));
    }
    tc.appendChild(el('p', 'help',
      'يُعرض لك ولمديرك معاً، ولا يدخل في تقييمك. الغرض مقارنة المقدَّر بالفعلي لتحسين التقدير لا لمحاسبة أحد.'));
    side.appendChild(tc);
  }

  if (t.employeeFeedback) {
    const fb = card('');
    fb.appendChild(sectionHead({ text: 'ما كتبه الموظف', icon: 'doc' }));
    fb.appendChild(el('p', 'desc', esc(t.employeeFeedback)));
    side.appendChild(fb);
  }

  async function toggleTimer(start) {
    try {
      if (start) await startTimer(t); else await stopTimer(t);
      go('task', t.id);
    } catch (e) {
      console.error(e);
      toast(e.message === 'timer-cap' ? 'بلغت الحدّ الأقصى للمدخلات' : 'تعذّر تحديث العدّاد', 'err');
    }
  }

  /* ⚠️ سبب التوقّف إلزامي: «متوقفة» بلا سبب يقرؤها المدير فيطمئنّ ولا يسأل */
  function openBlock() {
    const m = openModal(`
      <h3>إيقاف مؤقّت</h3>
      <div class="field">
        <label for="tbWhy">ما الذي يمنع التقدّم؟ *</label>
        <textarea id="tbWhy" rows="3" maxlength="${MAX_BLOCK_REASON}"
          placeholder="أنتظر ردّ العميل · ينقصني ملف من المحاسبة"></textarea>
        <div class="help">يظهر لمديرك بجانب المهمة، فيعرف ما يفكّها بدل أن يسأل.</div>
      </div>
      <div class="err" id="tbErr"></div>
      <div class="row">
        <button class="btn ghost" id="tbCancel">إلغاء</button>
        <button class="btn" id="tbOk">أوقفها</button>
      </div>`);
    m.$('#tbCancel').onclick = m.close;
    m.$('#tbOk').onclick = async () => {
      const why = m.$('#tbWhy').value.trim();
      if (why.length < 3) { m.$('#tbErr').textContent = 'اكتب السبب — كلمتان تكفيان'; return; }
      try {
        await moveTask(t, 'blocked', { blockReason: why.slice(0, MAX_BLOCK_REASON) });
        m.close(); go('task', t.id);
      } catch (e) { console.error(e); m.$('#tbErr').textContent = 'تعذّر الحفظ'; }
    };
  }
}
