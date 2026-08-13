/* ═══════════════════════════════════════════════════════════════════════════
   صفحة المهمة الواحدة — التفاصيل والقائمة الفرعية وخيط المحادثة

   ⚠️ المحادثة إنشاء-فقط بقاعدتها (allow update, delete: if false)، تماماً
   كخيط hrTickets. خيطٌ يُعدَّل بعد الفعل ليس سجلاً لشيء: المدير يقدر يعيد
   كتابة ما طلبه، والموظف ما وعد به.

   ⚠️ الاشتراك اللحظي عبر lifecycle.trackSubscription لا onSnapshot عارياً —
   وإلا تسرّب الاشتراك بين الصفحات وبقي يسمع بعد مغادرتها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { fmtDT } from '../lib/format.js';
import { getTask, watchMessages, postMessage, moveTask, updateTask,
         startTimer, stopTimer } from '../lib/tasks.js';
import { roleFor, dueStateOf, progressOf, allowedMoves, timeSummary,
         blockersOf, delegationActive, STATUS_AR, PRIORITY_AR } from '../lib/task-flow.js';
import { trackSubscription } from '../lib/lifecycle.js';
import { isStale, go, getPageArg } from '../lib/nav.js';
import { card, empty, sectionHead, button, loading, callout, detailLine, bar } from '../lib/ui.js';

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
  const head = card('');
  head.appendChild(sectionHead({ text: t.title, icon: 'check' },
    button('رجوع', 'btn sm ghost', () => go(who === 'assignee' ? 'my-tasks' : 'team-tasks'))));
  /* ⚠️ detailLine و bar تُرجعان نصّاً لا عنصراً — تُجمَّع في innerHTML */
  head.appendChild(el('div', 'detail-list', [
    detailLine('الحالة', STATUS_AR[t.status] || t.status),
    detailLine('المكلَّف', t.assigneeName || '—'),
    detailLine('الأولوية', PRIORITY_AR[t.priority] || '—'),
    detailLine('الاستحقاق', t.dueDate ? `${t.dueDate}${due.text ? ' · ' + due.text : ''}` : '—'),
    detailLine('أنشأها', t.createdByName || '—')
  ].join('')));
  if (t.description) head.appendChild(el('p', 'desc', esc(t.description)));
  /* ⚠️ شريط واحد من مصدر واحد. كان يُرسم من `t.progress` اليدوي بينما
     عنوان القائمة الفرعية تحته يقول رقماً آخر — رقمان لنفس المهمة في نفس
     الشاشة. progressOf تحسم: البنود متى وُجدت. */
  const pr = progressOf(t);
  if (pr.pct !== null) {
    head.appendChild(el('div', '', bar(pr.pct)));
    head.appendChild(el('p', 'help', pr.source === 'checklist'
      ? 'النسبة محسوبة من بنود القائمة الفرعية.'
      : pr.source === 'status' ? 'المهمة مغلقة.' : 'تقدير يدوي — أضف قائمة فرعية ليُحسب تلقائياً.'));
  }
  view.appendChild(head);

  /* ⚠️ ملاحظة المدير تُعرض بارزة حين تكون «تحتاج تحسين» — الموظف الذي لا
     يرى السبب يعيد نفس العمل فيُعاد إليه ثانيةً. */
  if (t.needsImprovement && t.managerNote) {
    view.appendChild(callout('warn', 'أُعيدت للتحسين', esc(t.managerNote)));
  }
  if (t.employeeFeedback) {
    const fb = card('');
    fb.appendChild(sectionHead({ text: 'ما كتبه الموظف', icon: 'note' }));
    fb.appendChild(el('p', 'desc', esc(t.employeeFeedback)));
    view.appendChild(fb);
  }

  /* ── القائمة الفرعية ── */
  if ((t.checklist || []).length) {
    const cc = card('');
    const dn = t.checklist.filter((c) => c.done).length;
    cc.appendChild(sectionHead({ text: `القائمة الفرعية — ${dn}/${t.checklist.length}`, icon: 'check' }));
    t.checklist.forEach((item, i) => {
      const row = el('label', 'checkbox');
      row.innerHTML = `<input type="checkbox" ${item.done ? 'checked' : ''}
        ${who === 'assignee' ? '' : 'disabled'}> ${esc(item.text || '')}`;
      if (who === 'assignee') {
        row.querySelector('input').onchange = async (ev) => {
          const next = t.checklist.map((c, j) => (j === i ? { ...c, done: ev.target.checked } : c));
          try { await updateTask(t.id, { checklist: next }); t.checklist = next; }
          catch (e) { console.error(e); toast('تعذّر الحفظ', 'err'); ev.target.checked = !ev.target.checked; }
        };
      }
      cc.appendChild(row);
    });
    view.appendChild(cc);
  }

  /* ── ٧-د · سجل الوقت الفعلي ──
     ⚠️ يُعرض للمدير والموظف معاً، **ولا يدخل تقييم أحد**. تحويل دقّة التقدير
     إلى درجة يجعل الناس تضخّم تقديراتها، فتفقد الرقم ومهارة التقدير معاً.
     مكتوب في الشاشة نفسها لا في تعليق فقط. */
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
      const btn = button(ts.hasOpenEntry ? 'أوقف العدّاد' : 'ابدأ العدّاد',
        'btn sm' + (ts.hasOpenEntry ? ' danger' : ''), async () => {
          btn.disabled = true;
          try {
            if (ts.hasOpenEntry) await stopTimer(t); else await startTimer(t);
            go('task', t.id);
          } catch (e) {
            console.error(e);
            toast(e.message === 'timer-cap' ? 'بلغت الحدّ الأقصى للمدخلات' : 'تعذّر تحديث العدّاد', 'err');
            btn.disabled = false;
          }
        });
      tc.appendChild(btn);
      if (ts.atCap) tc.appendChild(el('p', 'help', 'بلغت ٥٠ مدخلة — الحدّ الأقصى.'));
    }
    tc.appendChild(el('p', 'help',
      'يُعرض لك ولمديرك معاً، ولا يدخل في تقييمك. الغرض مقارنة المقدَّر بالفعلي لتحسين التقدير لا لمحاسبة أحد.'));
    view.appendChild(tc);
  }

  /* ── ٧-هـ · الاعتماديات ──
     ⚠️ إرشاد إداري لا قيد أمني: لا يمكن فرضها في قاعدة (تحتاج get() لكل
     مانع، وهي قراءة مفوترة على كل كتابة). لا أحد يتضرّر مالياً من تجاوزها. */
  if ((t.blockedByTaskIds || []).length) {
    view.appendChild(callout('warn', 'هذه المهمة تنتظر مهامّ أخرى',
      'ابدأها بعد إنجاز ما يسبقها. هذا تنبيه تنظيمي — النظام لا يمنعك.'));
  }

  /* ── ٧-و · التفويض ── */
  if (t.delegatedToUid) {
    const live = delegationActive(t, today);
    view.appendChild(callout(live ? 'info' : 'warn',
      live ? `مفوَّضة إلى ${t.delegatedToName || ''}` : 'تفويض منتهٍ',
      live
        ? `${t.delegatedUntil ? 'حتى ' + t.delegatedUntil + '. ' : ''}المكلَّف الأصلي ما زال على المهمة — التفويض إضافة لا استبدال.`
        : `انتهى في ${t.delegatedUntil}. النظام بلا خادم فلا يلغيه تلقائياً — يلغيه المدير من لوحة القسم.`));
  }

  /* ── نقل الحالة ── */
  const moves = allowedMoves(t, who);
  if (moves.length) {
    const mc = card('');
    mc.appendChild(sectionHead({ text: 'الإجراء', icon: 'gear' }));
    const acts = el('div', 'actions-cell');
    moves.forEach((to) => acts.appendChild(button(STATUS_AR[to], 'btn sm ghost', async () => {
      try { await moveTask(t, to); toast('حُدّثت الحالة', 'ok'); go('task', t.id); }
      catch (e) { console.error(e); toast('تعذّر تحديث الحالة', 'err'); }
    })));
    mc.appendChild(acts);
    view.appendChild(mc);
  }

  /* ── المحادثة ── */
  const chat = card('');
  chat.appendChild(sectionHead({ text: 'المحادثة', icon: 'chat' }));
  const thread = el('div', 'thread');
  chat.appendChild(thread);

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
  chat.appendChild(composer);
  chat.appendChild(el('p', 'help', 'الرسائل لا تُعدَّل ولا تُحذف — هذا سجل المهمة.'));
  view.appendChild(chat);

  trackSubscription(watchMessages(t.id, (list) => {
    thread.innerHTML = '';
    if (!list.length) { thread.appendChild(empty('لا رسائل بعد.', 'chat')); return; }
    list.forEach((mm) => {
      const mine = mm.authorUid === me.id;
      const b = el('div', 'msg' + (mine ? ' msg--mine' : ''));
      b.innerHTML = `<div class="msg__head"><b>${esc(mm.authorName || '')}</b>
        <span class="cell-sub">${esc(fmtDT(mm.createdAt))}</span></div>
        <div class="msg__body">${esc(mm.text || '')}</div>`;
      thread.appendChild(b);
    });
    thread.scrollTop = thread.scrollHeight;
  }, (e) => {
    console.error('thread', e);
    thread.innerHTML = '';
    thread.appendChild(empty('تعذّر تحميل المحادثة.', 'chat'));
  }));
}
