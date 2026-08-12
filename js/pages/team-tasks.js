/* ═══════════════════════════════════════════════════════════════════════════
   مهام القسم — لوحة مدير القسم

   ⚠️ «بلا حراك منذ ٧ أيام» أهم رقم في هذه الشاشة، وهو أول ما يُعرض. المهمة
   المتأخرة يراها أحد ويسأل عنها؛ المنسيّة لا يذكرها أحد — فهي أخطر.

   ⚠️ الاستعلام مقيَّد بـ departments array-contains ويقابله taskDept() في
   القاعدة. أي تباعد بين الاثنين = رفض كامل وشاشة فارغة، لا نتيجة منقوصة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal, uid } from '../lib/dom.js';
import { getMe, getUsers } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { tasksForDept, createTask, moveTask, updateTask } from '../lib/tasks.js';
import { sortTasks, dueStateOf, managerPulse, isStaleTask, roleFor,
         nextStepFor, STATUS_AR, PRIORITY_AR } from '../lib/task-flow.js';
import { isStale, go } from '../lib/nav.js';
import { isAdmin } from '../lib/perms.js';
import { card, grid, stat, tableWrap, sectionHead, button, loading, callout } from '../lib/ui.js';

export async function render(view, token) {
  const me = getMe();
  const admin = isAdmin();
  const today = ymdKsa();

  const depts = admin
    ? [...new Set(getUsers().filter((u) => u.role !== 'admin').map((u) => u.department).filter(Boolean))].sort()
    : [me.department].filter(Boolean);

  if (!depts.length) {
    view.appendChild(card('مهام القسم', null, 'check'));
    view.appendChild(el('div', 'card', '<div class="empty">لم يُسنَد لك قسم.</div>'));
    return;
  }

  const head = card('');
  const bar = el('div', 'cluster');
  let deptSel = null;
  if (depts.length > 1) {
    deptSel = el('select', 'select-lg');
    deptSel.innerHTML = depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    bar.appendChild(deptSel);
  }
  head.appendChild(sectionHead({ text: 'مهام القسم', icon: 'check' },
    button('مهمة جديدة', 'btn sm', () => openTaskForm(null))));
  head.appendChild(el('p', 'desc', 'تابع ما وصلت إليه مهام قسمك، واعتمد المنجز منها.'));
  if (deptSel) head.appendChild(bar);
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  const currentDept = () => (deptSel ? deptSel.value : depts[0]);
  /* موظفو القسم — للتكليف. المدير لا يكلّف خارج قسمه. */
  const staffOf = (d) => getUsers().filter((u) => u.role !== 'admin' && u.department === d);

  let filterStatus = '', filterUid = '', onlyLate = false;

  async function draw() {
    host.innerHTML = '';
    host.appendChild(loading('جارٍ تحميل مهام القسم…'));
    const dept = currentDept();

    let tasks;
    try { tasks = await tasksForDept(dept); }
    catch (e) {
      console.error('team-tasks', e);
      if (isStale(token)) return;
      host.innerHTML = '';
      host.appendChild(callout('warn', 'تعذّر تحميل المهام',
        'الغالب أن فهرس (departments, status, dueDate) غير منشور بعد. راجع firestore.indexes.json.'));
      return;
    }
    if (isStale(token)) return;

    host.innerHTML = '';
    const pulse = managerPulse(tasks, today);

    /* ⚠️ الترتيب مقصود: المنسيّة أولاً لأنها الوحيدة التي لا يذكّر بها أحد */
    const g = grid(3);
    g.append(
      stat(String(pulse.stale), 'بلا حراك ٧ أيام', pulse.stale ? 'r' : 'ok'),
      stat(String(pulse.overdue), 'متأخرة', pulse.overdue ? 'a' : 'ok'),
      stat(String(pulse.awaitingMe), 'بانتظار اعتمادي', pulse.awaitingMe ? 'a' : '')
    );
    const kpi = card('');
    kpi.appendChild(g);
    if (pulse.stale) kpi.appendChild(el('p', 'help',
      'المهمة المنسيّة أخطر من المتأخرة: المتأخرة يسأل عنها أحد، والمنسيّة لا يذكرها أحد.'));
    host.appendChild(kpi);

    /* ── الفلاتر ── */
    const fc = card('');
    const fbar = el('div', 'cluster');
    const stSel = el('select', '');
    stSel.innerHTML = '<option value="">كل الحالات</option>' +
      ['new','in_progress','blocked','review'].map((s) =>
        `<option value="${s}"${filterStatus === s ? ' selected' : ''}>${esc(STATUS_AR[s])}</option>`).join('');
    const uSel = el('select', '');
    uSel.innerHTML = '<option value="">كل الموظفين</option>' +
      staffOf(dept).map((u) => `<option value="${esc(u.id)}"${filterUid === u.id ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
    const lateBtn = button(onlyLate ? '✓ المتأخرة فقط' : 'المتأخرة فقط',
      'btn sm ' + (onlyLate ? '' : 'ghost'), () => { onlyLate = !onlyLate; draw(); });
    stSel.onchange = () => { filterStatus = stSel.value; draw(); };
    uSel.onchange  = () => { filterUid = uSel.value; draw(); };
    fbar.append(stSel, uSel, lateBtn);
    fc.appendChild(fbar);
    host.appendChild(fc);

    let list = tasks;
    if (filterStatus) list = list.filter((t) => t.status === filterStatus);
    if (filterUid)    list = list.filter((t) => t.assigneeUid === filterUid);
    if (onlyLate)     list = list.filter((t) => dueStateOf(t, today).kind === 'overdue');

    const c = card('');
    c.appendChild(sectionHead({ text: `المهام (${list.length})`, icon: 'check' }));
    if (!list.length) {
      c.appendChild(el('div', 'empty', 'لا مهام مطابقة.'));
      host.appendChild(c);
      return;
    }

    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th>المهمة</th><th>المكلَّف</th><th>الحالة</th>
          <th class="num">الاستحقاق</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');

    sortTasks(list, today).forEach((t) => {
      const due = dueStateOf(t, today);
      const stale = isStaleTask(t, today);
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(t.title)}</b>
          <div class="cell-sub">${esc(PRIORITY_AR[t.priority] || '')}${
            stale ? ' · <span class="text-red">بلا حراك</span>' : ''}${
            t.needsImprovement ? ' · <span class="text-amber">يحتاج تحسين</span>' : ''}</div></td>
        <td>${esc(t.assigneeName || '—')}</td>
        <td><span class="pill pill--dot ${t.status === 'review' ? 'pending' : ''}">${esc(STATUS_AR[t.status])}</span></td>
        <td class="num ${due.kind === 'overdue' ? 'text-red' : ''}">${esc(due.text || t.dueDate || '—')}</td>`;
      const td = el('td', '');
      const acts = el('div', 'actions-cell');
      const who = roleFor(t, me);
      const step = nextStepFor(t, who);
      if (step && t.status === 'review') {
        acts.appendChild(button('اعتماد', 'btn sm', () => openApprove(t)));
        acts.appendChild(button('يحتاج تحسين', 'btn sm ghost', () => openImprove(t)));
      }
      acts.appendChild(button('فتح', 'btn sm ghost', () => go('task', t.id)));
      td.appendChild(acts);
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    c.appendChild(w);
    host.appendChild(c);
  }

  /* ── اعتماد ── */
  function openApprove(t) {
    const m = openModal(`
      <h3>اعتماد: ${esc(t.title)}</h3>
      ${t.employeeFeedback ? `<div class="callout callout--info"><b>ما كتبه الموظف</b>
        <div class="help">${esc(t.employeeFeedback)}</div></div>` : ''}
      <div class="field"><label for="apRate">التقييم (١–٥)</label>
        <select id="apRate">${[5,4,3,2,1].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></div>
      <div class="field"><label for="apNote">ملاحظة الاعتماد</label>
        <input id="apNote" placeholder="اختياري"></div>
      <div class="row">
        <button class="btn ghost" id="apCancel">إلغاء</button>
        <button class="btn" id="apOk">اعتماد الإنجاز</button>
      </div>`);
    m.$('#apCancel').onclick = m.close;
    m.$('#apOk').onclick = async () => {
      try {
        await moveTask(t, 'done', {
          managerRating: Number(m.$('#apRate').value) || 0,
          managerNote: m.$('#apNote').value.trim().slice(0, 500)
        });
        m.close(); toast('اعتُمدت المهمة', 'ok'); await draw();
      } catch (e) { console.error(e); toast('تعذّر الاعتماد', 'err'); }
    };
  }

  /* ── إعادة للتحسين ──
     ⚠️ سبب الإعادة إلزامي: «يحتاج تحسين» بلا سبب يترك الموظف يخمّن، فيعيد
     نفس العمل ويُعاد إليه ثانيةً. وreopenCount يزيد تلقائياً في moveTask. */
  function openImprove(t) {
    const m = openModal(`
      <h3>إعادة للتنفيذ: ${esc(t.title)}</h3>
      <div class="field"><label for="imNote">ما الذي يحتاج تحسيناً؟ *</label>
        <textarea id="imNote" rows="4"></textarea>
        <div class="help">يظهر للموظف على المهمة. بلا سبب واضح سيعيد العمل نفسه.</div></div>
      <div class="err" id="imErr"></div>
      <div class="row">
        <button class="btn ghost" id="imCancel">إلغاء</button>
        <button class="btn" id="imOk">أعدها للتنفيذ</button>
      </div>`);
    m.$('#imCancel').onclick = m.close;
    m.$('#imOk').onclick = async () => {
      const note = m.$('#imNote').value.trim();
      if (note.length < 5) { m.$('#imErr').textContent = 'اكتب سبب الإعادة'; return; }
      try {
        await moveTask(t, 'in_progress', { managerNote: note.slice(0, 500) });
        m.close(); toast('أُعيدت للتنفيذ', 'ok'); await draw();
      } catch (e) { console.error(e); toast('تعذّر', 'err'); }
    };
  }

  /* ── إنشاء / تعديل ── */
  function openTaskForm(t) {
    const dept = currentDept();
    const staff = staffOf(dept);
    const isEdit = !!t;
    const m = openModal(`
      <h3>${isEdit ? 'تعديل مهمة' : 'مهمة جديدة'}</h3>
      <div class="field"><label for="tkTitle">العنوان *</label>
        <input id="tkTitle" maxlength="120" value="${esc(t?.title || '')}"></div>
      <div class="field"><label for="tkDesc">التفاصيل</label>
        <textarea id="tkDesc" rows="4" maxlength="4000">${esc(t?.description || '')}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="tkWho">المكلَّف *</label>
          <select id="tkWho">
            <option value="">— اختر —</option>
            ${staff.map((u) => `<option value="${esc(u.id)}"${t?.assigneeUid === u.id ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}
          </select>
          <div class="help">موظفو ${esc(dept)} وحدهم — لا تقدر تكلّف خارج قسمك.</div></div>
        <div class="field"><label for="tkPri">الأولوية</label>
          <select id="tkPri">${['normal','low','high','urgent'].map((p) =>
            `<option value="${p}"${(t?.priority || 'normal') === p ? ' selected' : ''}>${esc(PRIORITY_AR[p])}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="tkStart">تبدأ في</label>
          <input id="tkStart" type="date" value="${esc(t?.startDate || '')}"></div>
        <div class="field"><label for="tkDue">تاريخ الاستحقاق</label>
          <input id="tkDue" type="date" value="${esc(t?.dueDate || '')}"></div>
      </div>
      <div class="field"><label for="tkEst">الوقت المقدَّر (ساعات)</label>
        <input id="tkEst" type="number" min="0" step="0.5" value="${t?.estimateHours || ''}">
        <div class="help">للمقارنة بالفعلي لاحقاً. ليس مؤشراً في تقييم أحد.</div></div>
      <div class="err" id="tkErr"></div>
      <div class="row">
        <button class="btn ghost" id="tkCancel">إلغاء</button>
        <button class="btn" id="tkOk">${isEdit ? 'حفظ' : 'إنشاء المهمة'}</button>
      </div>`);

    m.$('#tkCancel').onclick = m.close;
    m.$('#tkOk').onclick = async () => {
      const err = m.$('#tkErr'); err.textContent = '';
      const title = m.$('#tkTitle').value.trim();
      const who   = m.$('#tkWho').value;
      if (!title) { err.textContent = 'اكتب عنوان المهمة'; return; }
      if (!who)   { err.textContent = 'اختر الموظف المكلَّف'; return; }
      const start = m.$('#tkStart').value, due = m.$('#tkDue').value;
      if (start && due && due < start) { err.textContent = 'تاريخ الاستحقاق قبل تاريخ البداية'; return; }

      const person = staff.find((u) => u.id === who);
      const payload = {
        title, description: m.$('#tkDesc').value.trim(),
        departments: [dept],
        assigneeUid: who, assigneeName: person ? person.name : '',
        startDate: start, dueDate: due,
        priority: m.$('#tkPri').value,
        estimateHours: Number(m.$('#tkEst').value) || 0
      };
      const b = m.$('#tkOk'); b.disabled = true; b.textContent = 'جارٍ الحفظ…';
      try {
        if (isEdit) await updateTask(t.id, payload);
        else        await createTask(payload);
        m.close(); toast(isEdit ? 'حُفظت' : 'أُنشئت المهمة', 'ok'); await draw();
      } catch (e) {
        console.error(e);
        err.textContent = 'تعذّر الحفظ';
        b.disabled = false; b.textContent = isEdit ? 'حفظ' : 'إنشاء المهمة';
      }
    };
  }

  if (deptSel) deptSel.onchange = draw;
  await draw();
}

export { uid };
