/* ═══════════════════════════════════════════════════════════════════════════
   الإعلانات — شاشة الأدمن للإرسال والمتابعة، وشاشة الموظف للقراءة والإقرار

   ⚠️ المعاينة قبل الإرسال إلزامية وتُظهر العدد الحقيقي: «ستصل ٤٧ موظفاً في
   ٥ أقسام». رسالة تصل الشركة كلها لا تُرسَل بضغطة واحدة بلا تأكيد — والخطأ
   فيها لا يُتراجع عنه، لأن من قرأها قرأها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal, confirmAction } from '../lib/dom.js';
import { getMe, getUsers } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { fmtDT } from '../lib/format.js';
import {
  createAnnouncement, editAnnouncement, deleteAnnouncement, allAnnouncements,
  announcementsFor, acknowledge, ackList, audienceOf, isLive, PRIORITY_AR
} from '../lib/announcements.js';
import { isStale } from '../lib/nav.js';
import { isAdmin } from '../lib/perms.js';
import { card, empty, tableWrap, sectionHead, button, loading, callout } from '../lib/ui.js';

export async function render(view, token) {
  return isAdmin() ? adminView(view, token) : employeeView(view, token);
}

/* ═══════════════════ الأدمن ═══════════════════ */
async function adminView(view, token) {
  const today = ymdKsa();
  const head = card('');
  head.appendChild(sectionHead({ text: 'الإعلانات', icon: 'megaphone' },
    button('إعلان جديد', 'btn sm', () => openForm(null))));
  head.appendChild(el('p', 'desc',
    'رسائل للموظفين — للجميع أو لأقسام أو لأشخاص محدّدين.'));
  /* ⚠️ الحدّ يُقال للأدمن صراحةً في الواجهة لا في تعليق كود */
  head.appendChild(callout('info', 'تظهر للموظف عند فتحه النظام',
    'ليست رسالة نصية ولا بريداً ولا إشعار جوال — النظام على الخطة المجانية بلا خادم يرسل نيابةً عنه.'));
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  async function draw() {
    host.innerHTML = '';
    host.appendChild(loading('جارٍ التحميل…'));
    let list;
    try { list = await allAnnouncements(); }
    catch (e) {
      console.error('ann', e); if (isStale(token)) return;
      host.innerHTML = ''; host.appendChild(callout('warn', 'تعذّر التحميل', '')); return;
    }
    if (isStale(token)) return;
    host.innerHTML = '';

    if (!list.length) {
      host.appendChild(el('div', 'card', '<div class="empty">لا إعلانات بعد.</div>'));
      return;
    }
    const c = card('');
    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th>العنوان</th><th>الجمهور</th><th>الأولوية</th>
          <th class="num">الإقرارات</th><th>الحالة</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');
    list.forEach((a) => {
      const reach = audienceOf(a, getUsers()).length;
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(a.title)}</b>${a.pinned ? ' <span class="tag">مثبّت</span>' : ''}
          ${a.editedAt ? '<div class="cell-sub">مُعدَّلة</div>' : ''}</td>
        <td class="cell-sub">${a.audienceAll ? 'الجميع'
          : [(a.audienceDepts || []).length ? `${a.audienceDepts.length} قسم` : '',
             (a.audienceUids || []).length ? `${a.audienceUids.length} شخص` : ''].filter(Boolean).join(' · ')}
          <div class="cell-sub">${reach} موظف</div></td>
        <td><span class="pill pill--dot ${a.priority === 'urgent' ? 'r' : a.priority === 'important' ? 'a' : ''}">${
          esc(PRIORITY_AR[a.priority] || 'عادي')}</span></td>
        <td class="num">${a.requireAck ? `${a.ackCount || 0} / ${reach}` : '—'}</td>
        <td>${isLive(a, today) ? '<span class="pill pill--dot active">ظاهر</span>'
                               : '<span class="pill pill--dot suspended">خارج المدة</span>'}</td>`;
      const td = el('td', '');
      const acts = el('div', 'actions-cell');
      if (a.requireAck) acts.appendChild(button('من أقرّ؟', 'btn sm ghost', () => openAcks(a)));
      acts.appendChild(button('تعديل', 'btn sm ghost', () => openForm(a)));
      acts.appendChild(button('حذف', 'btn sm danger', async () => {
        const yes = await confirmAction({ title: `حذف «${a.title}»`,
          body: 'من قرأه قرأه — الحذف يزيله من الشاشة ولا يلغي وصوله.', confirmLabel: 'حذف' });
        if (!yes) return;
        try { await deleteAnnouncement(a.id); toast('حُذف'); await draw(); }
        catch (e) { console.error(e); toast('تعذّر الحذف', 'err'); }
      }));
      td.appendChild(acts); tr.appendChild(td); tb.appendChild(tr);
    });
    c.appendChild(w);
    host.appendChild(c);
  }

  async function openAcks(a) {
    /* ⚠️ العدد الموثوق هو وثائق acks لا العدّاد — يُحسب هنا عند الفتح */
    let rows = [];
    try { rows = await ackList(a.id); } catch (e) { console.error(e); }
    const reached = audienceOf(a, getUsers());
    const done = new Set(rows.map((r) => r.uid));
    const missing = reached.filter((u) => !done.has(u.id));
    openModal(`
      <h3>الإقرار بالاطّلاع — ${esc(a.title)}</h3>
      <div class="callout callout--info"><b>أقرّ ${rows.length} من ${reached.length}</b>
        <div class="help">هذا العدد محسوب من وثائق الإقرار الآن، لا من العدّاد المخزّن.</div></div>
      <div class="field"><label>لم يُقرّوا بعد (${missing.length})</label>
        <div class="help">${missing.length ? esc(missing.map((u) => u.name).join('، ')) : 'الجميع أقرّ.'}</div></div>
      <div class="row"><button class="btn" onclick="this.closest('.overlay').remove()">إغلاق</button></div>`);
  }

  function openForm(a) {
    const isEdit = !!a;
    const users = getUsers().filter((u) => u.role !== 'admin');
    const depts = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
    const m = openModal(`
      <h3>${isEdit ? 'تعديل إعلان' : 'إعلان جديد'}</h3>
      <div class="field"><label for="anTitle">العنوان *</label>
        <input id="anTitle" maxlength="120" value="${esc(a?.title || '')}"></div>
      <div class="field"><label for="anBody">النص *</label>
        <textarea id="anBody" rows="6" maxlength="5000">${esc(a?.body || '')}</textarea></div>
      <div class="field"><label for="anWho">الجمهور</label>
        <select id="anWho">
          <option value="all"${a?.audienceAll !== false ? ' selected' : ''}>الجميع</option>
          <option value="depts"${a && !a.audienceAll && (a.audienceDepts||[]).length ? ' selected' : ''}>أقسام محدّدة</option>
          <option value="uids"${a && !a.audienceAll && (a.audienceUids||[]).length ? ' selected' : ''}>أشخاص محدّدون</option>
        </select></div>
      <div class="field hidden" id="anDeptsBox"><label>الأقسام</label>
        <div class="checkbox-grid">${depts.map((d) => `<label class="checkbox">
          <input type="checkbox" class="anDept" value="${esc(d)}"
            ${(a?.audienceDepts || []).includes(d) ? 'checked' : ''}> ${esc(d)}</label>`).join('')}</div></div>
      <div class="field hidden" id="anUidsBox"><label>الأشخاص (٥٠ كحد أقصى)</label>
        <div class="checkbox-grid">${users.map((u) => `<label class="checkbox">
          <input type="checkbox" class="anUid" value="${esc(u.id)}"
            ${(a?.audienceUids || []).includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</div></div>
      <div class="form-row">
        <div class="field"><label for="anPri">الأولوية</label>
          <select id="anPri">${['normal','important','urgent'].map((p) =>
            `<option value="${p}"${(a?.priority || 'normal') === p ? ' selected' : ''}>${esc(PRIORITY_AR[p])}</option>`).join('')}</select></div>
        <div class="field"><label for="anPub">تاريخ الظهور</label>
          <input id="anPub" type="date" value="${esc(a?.publishAt || ymdKsa())}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="anExp">تاريخ الانتهاء (اختياري)</label>
          <input id="anExp" type="date" value="${esc(a?.expiresAt || '')}"></div>
        <div class="field"><label class="checkbox"><input type="checkbox" id="anPin"
          ${a?.pinned ? 'checked' : ''}> تثبيت في أعلى الرئيسية</label>
          <label class="checkbox"><input type="checkbox" id="anAck"
          ${a?.requireAck ? 'checked' : ''}> يتطلّب إقراراً بالاطّلاع</label></div>
      </div>
      <div class="err" id="anErr"></div>
      <div class="row">
        <button class="btn ghost" id="anCancel">إلغاء</button>
        <button class="btn" id="anOk">${isEdit ? 'حفظ التعديل' : 'معاينة ثم إرسال'}</button>
      </div>`);

    const who = m.$('#anWho');
    const sync = () => {
      m.$('#anDeptsBox').classList.toggle('hidden', who.value !== 'depts');
      m.$('#anUidsBox').classList.toggle('hidden', who.value !== 'uids');
    };
    who.onchange = sync; sync();
    m.$('#anCancel').onclick = m.close;

    m.$('#anOk').onclick = async () => {
      const err = m.$('#anErr'); err.textContent = '';
      const title = m.$('#anTitle').value.trim();
      const body  = m.$('#anBody').value.trim();
      if (!title) { err.textContent = 'اكتب العنوان'; return; }
      if (!body)  { err.textContent = 'اكتب نص الإعلان'; return; }

      const mode = who.value;
      const payload = {
        title, body,
        audienceAll: mode === 'all',
        audienceDepts: mode === 'depts'
          ? [...m.modal.querySelectorAll('.anDept:checked')].map((x) => x.value) : [],
        audienceUids: mode === 'uids'
          ? [...m.modal.querySelectorAll('.anUid:checked')].map((x) => x.value) : [],
        priority: m.$('#anPri').value,
        pinned: m.$('#anPin').checked,
        publishAt: m.$('#anPub').value,
        expiresAt: m.$('#anExp').value,
        requireAck: m.$('#anAck').checked
      };
      if (mode === 'depts' && !payload.audienceDepts.length) { err.textContent = 'اختر قسماً واحداً على الأقل'; return; }
      if (mode === 'uids'  && !payload.audienceUids.length)  { err.textContent = 'اختر شخصاً واحداً على الأقل'; return; }
      if (payload.audienceUids.length > 50) { err.textContent = 'الحد الأقصى ٥٠ شخصاً'; return; }

      const reach = audienceOf(payload, users);
      const deptCount = new Set(reach.map((u) => u.department).filter(Boolean)).size;

      /* ⚠️ المعاينة إلزامية للإرسال الجديد. رسالة تصل كل الشركة لا تُرسَل
         بضغطة واحدة، والخطأ فيها لا يُتراجع عنه لأن من قرأها قرأها. */
      if (!isEdit) {
        const ok = await confirmAction({
          title: 'تأكيد الإرسال',
          body: `<b>ستصل ${reach.length} موظفاً في ${deptCount} قسم.</b>
            <div class="help">تظهر لهم عند فتح النظام — ليست رسالة نصية.</div>
            <hr><b>${esc(title)}</b><div class="help" style="white-space:pre-wrap">${esc(body)}</div>`,
          confirmLabel: `إرسال إلى ${reach.length} موظفاً`, danger: false
        });
        if (!ok) return;
      }

      const b = m.$('#anOk'); b.disabled = true; b.textContent = 'جارٍ الحفظ…';
      try {
        if (isEdit) await editAnnouncement(a.id, payload);
        else        await createAnnouncement(payload);
        m.close(); toast(isEdit ? 'حُفظ التعديل' : 'أُرسل الإعلان', 'ok'); await draw();
      } catch (e) {
        console.error(e); err.textContent = 'تعذّر الحفظ';
        b.disabled = false; b.textContent = isEdit ? 'حفظ التعديل' : 'معاينة ثم إرسال';
      }
    };
  }

  await draw();
}

/* ═══════════════════ الموظف ═══════════════════ */
async function employeeView(view, token) {
  const me = getMe();
  const today = ymdKsa();

  const head = card('');
  head.appendChild(sectionHead({ text: 'إعلانات الموارد البشرية', icon: 'megaphone' }));
  view.appendChild(head);

  const host = el('div', '');
  host.appendChild(loading('جارٍ التحميل…'));
  view.appendChild(host);

  let list;
  try { list = await announcementsFor(me); }
  catch (e) {
    console.error('ann', e); if (isStale(token)) return;
    host.innerHTML = ''; host.appendChild(callout('warn', 'تعذّر تحميل الإعلانات', '')); return;
  }
  if (isStale(token)) return;
  host.innerHTML = '';

  const live = list.filter((a) => isLive(a, today))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
                 || (b.publishAt || '').localeCompare(a.publishAt || ''));

  if (!live.length) {
    host.appendChild(el('div', 'card', '<div class="empty">لا إعلانات حالياً.</div>'));
    return;
  }

  live.forEach((a) => {
    const c = card('');
    c.appendChild(sectionHead({ text: a.title,
      icon: a.priority === 'urgent' ? 'alert' : 'megaphone' }));
    c.appendChild(el('p', 'desc', esc(a.body)));
    c.appendChild(el('p', 'help',
      `${esc(a.createdByName || 'الموارد البشرية')} · ${esc(a.publishAt || '')}${
        a.editedAt ? ' · مُعدَّلة' : ''}`));
    if (a.requireAck) {
      const b = button('اطّلعت', 'btn sm', async () => {
        b.disabled = true;
        try { await acknowledge(a.id); toast('شكراً — سُجّل اطّلاعك', 'ok'); b.textContent = '✓ سُجّل اطّلاعك'; }
        catch (e) { console.error(e); toast('تعذّر التسجيل', 'err'); b.disabled = false; }
      });
      c.appendChild(b);
      c.appendChild(el('p', 'help', 'الإقرار لا يُسحب بعد تسجيله.'));
    }
    host.appendChild(c);
  });
}

export { empty };
