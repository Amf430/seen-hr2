/* ═══════════════════════════════════════════════════════════════════════════
   طلبات الموارد البشرية — صفحة واحدة بوجهين

   الموظف يرفع سؤاله ويتابع الردّ، والموارد البشرية تقرأ وتردّ وتُغلق. الشاشة
   نفسها بمنطق واحد: قائمة على اليمين ومحادثة تُفتح منها.

   ⚠️ ملفٌّ واحد لا ملفّان: الفرق بين الوجهين ثلاثة أسطر (من يرى الكلّ، ومن
   يقدر يُغلق، ونصّ الحالة). نسختان متوازيتان كانتا ستفترقان عند أول تعديل،
   فيرى الموظف محادثةً غير التي تراها الموارد البشرية.

   ⚠️ الرسائل تُجلب عند فتح المحادثة لا مع القائمة: قائمة من ثلاثين طلباً
   تعني ثلاثين استعلاماً على مجموعة فرعية لعرض سطرٍ واحد لكلٍّ منها — وسطر
   المعاينة محفوظ على الوثيقة أصلاً (lastText).
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { fmtDate, tsToDate } from '../lib/format.js';
import { isStale } from '../lib/nav.js';
import { card, empty, sectionHead, button, callout } from '../lib/ui.js';
import {
  fetchTickets, fetchMessages, createTicket, replyToTicket, closeTicket,
  ticketCategories, ticketState, TICKET_MAX_SUBJECT, TICKET_MAX_TEXT
} from '../lib/hr-tickets.js';

const when = (ts) => { const d = tsToDate(ts); return d ? fmtDate(d) + ' · ' + d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'; };

export async function render(view, token) {
  const me = getMe();
  const isHr = me.role === 'admin';

  const head = card('');
  head.appendChild(sectionHead(
    { text: isHr ? 'طلبات الموظفين للموارد البشرية' : 'طلباتي للموارد البشرية', icon: 'inbox' },
    isHr ? null : button('طلب جديد', 'btn sm', () => openNew(reload), 'plus')));
  head.appendChild(el('p', 'desc', isHr
    ? 'أسئلة الموظفين واستفساراتهم. ما يُكتب هنا لا يراه مدير القسم — القناة بينك وبين الموظف وحده.'
    : 'اسأل الموارد البشرية عمّا تحتاجه: التأمين الصحي، الراتب، رصيد إجازاتك، مستنداتك. ما تكتبه هنا لا يراه مدير قسمك.'));
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  async function reload() {
    host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ التحميل…</div></div>';
    let list = [];
    try { list = await fetchTickets(); }
    catch (e) {
      console.error(e);
      host.innerHTML = '<div class="card"><div class="empty">تعذّر تحميل الطلبات — تحقّق من اتصالك</div></div>';
      return;
    }
    if (isStale(token)) return;

    host.innerHTML = '';

    /* ⚠️ ما ينتظر ردّ الموارد البشرية أولاً — الترتيب الزمني وحده يدفن سؤالاً
       عمره أسبوع تحت محادثة انتهت اليوم. */
    const waiting = list.filter((t) => t.status !== 'closed' && t.lastBy !== 'hr');
    const rest    = list.filter((t) => !waiting.includes(t));

    if (!list.length) {
      const c = card('');
      c.appendChild(empty(isHr ? 'لا توجد طلبات من الموظفين بعد' : 'لم ترفع أي طلب بعد', 'inbox'));
      if (!isHr) c.appendChild(button('ارفع طلبك الأول', 'btn sm', () => openNew(reload), 'plus'));
      host.appendChild(c);
      return;
    }

    if (isHr && waiting.length) {
      const c = card('');
      c.appendChild(callout('warn', `${waiting.length} طلب بانتظار ردّك`,
        'الموظف يرى أن طلبه وصل ولم يُردّ عليه بعد.'));
      host.appendChild(c);
    }

    const c = card('');
    const box = el('div', 'tk-list');
    [...waiting, ...rest].forEach((t) => box.appendChild(ticketRow(t)));
    c.appendChild(box);
    host.appendChild(c);
  }

  function ticketRow(t) {
    const st = ticketState(t, me.role);
    const row = el('button', 'tk-row' + (st.key === 'todo' ? ' is-todo' : ''));
    row.innerHTML = `
      <span class="tk-main">
        <span class="tk-top">
          <b>${esc(t.subject)}</b>
          <span class="pill pill--dot ${esc(st.cls)}">${esc(st.label)}</span>
        </span>
        <span class="tk-meta">${esc(t.categoryLabel || '—')}${
          isHr ? ' · ' + esc(t.employeeName) + ' · ' + esc(t.department || '—') : ''}</span>
        <span class="tk-last">${esc(t.lastText || '')}</span>
      </span>
      <span class="tk-when">${esc(when(t.lastAt))}</span>`;
    row.onclick = () => openThread(t, reload);
    return row;
  }

  await reload();

  /* ═══ المحادثة ═══ */
  async function openThread(t, after) {
    const st = ticketState(t, me.role);
    const m = openModal(`
      <h3>${esc(t.subject)}</h3>
      <div class="tk-head">
        <span class="pill pill--dot ${esc(st.cls)}">${esc(st.label)}</span>
        <span>${esc(t.categoryLabel || '—')}</span>
        ${isHr ? `<span>${esc(t.employeeName)} · ${esc(t.department || '—')}${
          t.employeeEmpId ? ' · ' + esc(t.employeeEmpId) : ''}</span>` : ''}
      </div>
      <div class="tk-thread" id="tkThread"><div class="empty"><span class="spinner"></span> جارٍ تحميل المحادثة…</div></div>
      <div class="field" id="tkReplyWrap">
        <label for="tkReply">${isHr ? 'ردّك' : 'أضِف ردّاً'}</label>
        <textarea id="tkReply" maxlength="${TICKET_MAX_TEXT}" placeholder="اكتب هنا…"></textarea>
      </div>
      <div class="row">
        <button class="btn ghost" id="tkClose">إغلاق النافذة</button>
        ${isHr && t.status !== 'closed' ? '<button class="btn ghost" id="tkDone">إنهاء الطلب</button>' : ''}
        <button class="btn" id="tkSend">إرسال</button>
      </div>`);

    m.$('#tkClose').onclick = m.close;
    const thread = m.$('#tkThread');

    let msgs = [];
    try { msgs = await fetchMessages(t.id); }
    catch (e) { console.error(e); thread.innerHTML = '<div class="empty text-red">تعذّر تحميل المحادثة</div>'; return; }

    thread.innerHTML = msgs.map((x) => `
      <div class="tk-msg ${x.byRole === 'hr' ? 'is-hr' : 'is-emp'}">
        <div class="tk-msg__who">${esc(x.byName)} · ${x.byRole === 'hr' ? 'الموارد البشرية' : 'الموظف'}</div>
        <div class="tk-msg__text">${esc(x.text)}</div>
        <div class="tk-msg__at">${esc(when(x.at))}</div>
      </div>`).join('');
    thread.scrollTop = thread.scrollHeight;

    if (t.status === 'closed' && !isHr) {
      m.$('#tkReplyWrap').insertAdjacentHTML('beforebegin',
        '<p class="help">هذا الطلب أُنهي. لو أرسلتَ ردّاً سيُفتح من جديد.</p>');
    }

    const send = m.$('#tkSend');
    send.onclick = async () => {
      const txt = m.$('#tkReply').value;
      send.disabled = true; send.textContent = 'جارٍ الإرسال…';
      const ok = await replyToTicket(t, txt);
      if (!ok) { send.disabled = false; send.textContent = 'إرسال'; return; }
      m.close();
      toast('أُرسل الردّ', 'ok');
      await after();
    };

    const done = m.$('#tkDone');
    if (done) done.onclick = async () => {
      done.disabled = true;
      if (await closeTicket(t)) { m.close(); toast('أُنهي الطلب'); await after(); }
      else done.disabled = false;
    };
  }
}

/* ═══ طلب جديد — للموظف ═══ */
function openNew(after) {
  const cats = ticketCategories();
  if (!cats.length) {
    const m = openModal(`<h3>طلب جديد</h3>
      <div class="empty">لم تُعرَّف تصنيفات الطلبات بعد. تواصل مع الموارد البشرية.</div>
      <div class="row"><button class="btn ghost" id="nOk">إغلاق</button></div>`);
    m.$('#nOk').onclick = m.close;
    return;
  }

  const m = openModal(`
    <h3>طلب جديد للموارد البشرية</h3>
    <div class="form-row">
      <div class="field"><label for="nCat">التصنيف</label>
        <select id="nCat">${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="nSub">العنوان</label>
        <input id="nSub" type="text" maxlength="${TICKET_MAX_SUBJECT}" placeholder="مثال: استفسار عن بطاقة التأمين"></div>
    </div>
    <div class="form-row one">
      <div class="field"><label for="nTxt">التفاصيل</label>
        <textarea id="nTxt" maxlength="${TICKET_MAX_TEXT}" placeholder="اكتب سؤالك أو طلبك بالتفصيل…"></textarea>
        <div class="help">اذكر التاريخ أو اليوم المقصود إن كان سؤالك عن يوم بعينه — يوفّر عليك جولة أسئلة.</div></div>
    </div>
    <div class="row">
      <button class="btn ghost" id="nCancel">إلغاء</button>
      <button class="btn" id="nSend">إرسال الطلب</button>
    </div>`);

  m.$('#nCancel').onclick = m.close;
  m.$('#nSend').onclick = async () => {
    const b = m.$('#nSend');
    b.disabled = true; b.textContent = 'جارٍ الإرسال…';
    const id = await createTicket({
      categoryId: m.$('#nCat').value,
      subject:    m.$('#nSub').value,
      text:       m.$('#nTxt').value
    });
    if (!id) { b.disabled = false; b.textContent = 'إرسال الطلب'; return; }
    m.close();
    await after();
  };
}
