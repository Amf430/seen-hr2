/* ═══════════════════════════════════════════════════════════════════════════
   قوالب المهام والمهام المتكرّرة (٧-أ و ٧-ب)

   ⚠️ لا خادم عندنا، فالمهمة المتكرّرة تُولَّد **حين يفتح أحدهم لوحة المدير**.
   الحدّ مكتوب في الواجهة للأدمن لا في تعليق كود فقط: لو لم يفتح أحد النظام
   يوم الأحد، تُنشأ مهمة الأحد عند أول فتح لاحق — بتاريخ استحقاقها الصحيح لا
   بتاريخ التوليد، فلا تُفقد لكنها تظهر متأخرة.

   ⚠️ والتوليد بأثر رجعي محدود بثلاثين يوماً: من يعود من إجازة شهرين يجب ألا
   يجد تسعين مهمة دفعة واحدة — سيتجاهلها كلها، وهو أسوأ من ألا تُولَّد.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, uid, toast, openModal, confirmAction } from '../../lib/dom.js';
import { getSettings, getUsers } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { refreshUsers } from '../../lib/users.js';
import { PRIORITY_AR, MAX_BACKFILL_DAYS } from '../../lib/task-flow.js';
import { isStale } from '../../lib/nav.js';
import { card, empty, tableWrap, sectionHead, button, callout, loading } from '../../lib/ui.js';
import { loadRequiredSource } from '../../lib/required-source.js';

const RECUR_AR = { '': 'بلا تكرار (قالب يدوي)', daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري' };
const DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export async function render(view, token) {
  const S = getSettings();

  const head = card('قوالب المهام', null, 'check',
    'قالب يُملأ بضغطة عند إنشاء مهمة، أو قالب متكرّر يُنشئ مهمته تلقائياً كل أسبوع أو شهر.');
  view.appendChild(head);

  view.appendChild(callout('warn', 'المتكرّرة تُولَّد عند فتح لوحة مهام القسم',
    `النظام على الخطة المجانية بلا خادم، فلا شيء يعمل في الخلفية. لو لم يفتح أحد اللوحة يوم الاستحقاق، ` +
    `تُنشأ المهمة عند أول فتح لاحق — بتاريخ استحقاقها الصحيح، فتظهر متأخرة ولا تُفقد. ` +
    `والتوليد الرجعي محدود بـ ${MAX_BACKFILL_DAYS} يوماً.`));

  const host = el('div', '');
  host.appendChild(loading('جارٍ التحميل…'));
  view.appendChild(host);

  const usersSource = await loadRequiredSource(refreshUsers, getUsers);
  if (isStale(token)) return;
  if (usersSource.status === 'error') {
    console.error('templates', usersSource.error);
    host.innerHTML = '';
    host.appendChild(callout('danger', 'تعذّر تحميل الموظفين',
      'لن تُعرض خيارات تكليف ناقصة، ولن تتاح كتابة القوالب حتى تنجح القراءة.'));
    return;
  }

  function draw() {
    host.innerHTML = '';
    const list = S.taskTemplates || [];
    const c = card('');
    c.appendChild(sectionHead({ text: `القوالب (${list.length})`, icon: 'check' },
      button('قالب جديد', 'btn sm', () => openTpl(null))));

    if (!list.length) {
      c.appendChild(empty('لا قوالب بعد. القالب يوفّر إعادة كتابة نفس المهمة كل مرة.', 'check'));
      host.appendChild(c);
      return;
    }

    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th>القالب</th><th>التكرار</th><th>المكلَّف</th>
          <th class="num">الاستحقاق بعد</th><th>الحالة</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');
    list.forEach((t) => {
      const rec = t.recurrence;
      const recTxt = !rec ? RECUR_AR['']
        : rec.type === 'weekly' ? `أسبوعي — ${DOW_AR[rec.dow ?? 0]}`
        : rec.type === 'monthly' ? `شهري — يوم ${rec.dayOfMonth || 1}`
        : 'يومي';
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(t.title)}</b>
          ${(t.checklist || []).length ? `<div class="cell-sub">${t.checklist.length} خطوة</div>` : ''}</td>
        <td class="cell-sub">${esc(recTxt)}</td>
        <td>${esc(t.assigneeName || '—')}</td>
        <td class="num">${rec ? esc(String(rec.dueOffsetDays ?? 0)) + ' يوم' : '—'}</td>
        <td><span class="pill pill--dot ${t.active !== false ? 'active' : 'suspended'}">${
          t.active !== false ? 'نشط' : 'موقوف'}</span></td>`;
      const td = el('td', '');
      const acts = el('div', 'actions-cell');
      acts.append(
        button('تعديل', 'btn sm ghost', () => openTpl(t)),
        button(t.active !== false ? 'إيقاف' : 'تفعيل', 'btn sm ghost', async () => {
          t.active = t.active === false;
          await saveSettings(['taskTemplates']);
          draw(); toast(t.active ? 'فُعّل' : 'أُوقف');
        }),
        button('حذف', 'btn sm danger', async () => {
          const yes = await confirmAction({ title: `حذف «${t.title}»`,
            body: 'المهام التي وُلِّدت منه سابقاً تبقى كما هي — الحذف يوقف التوليد المستقبلي فقط.',
            confirmLabel: 'حذف' });
          if (!yes) return;
          S.taskTemplates = (S.taskTemplates || []).filter((x) => x.id !== t.id);
          await saveSettings(['taskTemplates']);
          draw(); toast('حُذف القالب');
        })
      );
      td.appendChild(acts); tr.appendChild(td); tb.appendChild(tr);
    });
    c.appendChild(w);
    host.appendChild(c);
  }

  function openTpl(t) {
    const isEdit = !!t;
    const staff = getUsers().filter((u) => u.role !== 'admin');
    const depts = [...new Set(staff.map((u) => u.department).filter(Boolean))].sort();
    const rec = t?.recurrence;
    const m = openModal(`
      <h3>${isEdit ? 'تعديل قالب' : 'قالب جديد'}</h3>
      <div class="field"><label for="tpTitle">العنوان *</label>
        <input id="tpTitle" maxlength="120" value="${esc(t?.title || '')}"></div>
      <div class="field"><label for="tpDesc">التفاصيل</label>
        <textarea id="tpDesc" rows="3" maxlength="4000">${esc(t?.description || '')}</textarea></div>
      <div class="field"><label for="tpSteps">الخطوات (سطر لكل خطوة)</label>
        <textarea id="tpSteps" rows="4" placeholder="عقد&#10;تأمين&#10;بريد">${
          esc((t?.checklist || []).map((c) => c.text).join('\n'))}</textarea>
        <div class="help">حتى ٢٠ خطوة. تظهر للموظف كقائمة يعلّم عليها.</div></div>
      <div class="form-row">
        <div class="field"><label for="tpDept">القسم</label>
          <select id="tpDept"><option value="">كل الأقسام</option>
            ${depts.map((d) => `<option value="${esc(d)}"${
              (t?.departments || []).includes(d) ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <div class="field"><label for="tpWho">المكلَّف</label>
          <select id="tpWho"><option value="">— يُحدَّد عند الإنشاء —</option>
            ${staff.map((u) => `<option value="${esc(u.id)}"${
              t?.assigneeUid === u.id ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="tpPri">الأولوية</label>
          <select id="tpPri">${['normal','low','high','urgent'].map((p) =>
            `<option value="${p}"${(t?.priority || 'normal') === p ? ' selected' : ''}>${esc(PRIORITY_AR[p])}</option>`).join('')}</select></div>
        <div class="field"><label for="tpRec">التكرار</label>
          <select id="tpRec">${Object.entries(RECUR_AR).map(([k, l]) =>
            `<option value="${k}"${(rec?.type || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      </div>
      <div class="form-row" id="tpRecOpts">
        <div class="field"><label for="tpDow">يوم الأسبوع</label>
          <select id="tpDow">${DOW_AR.map((d, i) =>
            `<option value="${i}"${(rec?.dow ?? 0) === i ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <div class="field"><label for="tpDom">يوم الشهر</label>
          <input id="tpDom" type="number" min="1" max="28" value="${esc(String(rec?.dayOfMonth || 1))}">
          <div class="help">حتى ٢٨ — الأيام ٢٩ و٣٠ و٣١ لا توجد في كل شهر.</div></div>
        <div class="field"><label for="tpOff">الاستحقاق بعد (يوم)</label>
          <input id="tpOff" type="number" min="0" max="60" value="${esc(String(rec?.dueOffsetDays ?? 3))}"></div>
      </div>
      <div class="err" id="tpErr"></div>
      <div class="row">
        <button class="btn ghost" id="tpCancel">إلغاء</button>
        <button class="btn" id="tpOk">${isEdit ? 'حفظ' : 'إضافة'}</button>
      </div>`);

    const recSel = m.$('#tpRec');
    const sync = () => { m.$('#tpRecOpts').classList.toggle('hidden', !recSel.value); };
    recSel.onchange = sync; sync();
    m.$('#tpCancel').onclick = m.close;

    m.$('#tpOk').onclick = async () => {
      const err = m.$('#tpErr'); err.textContent = '';
      const title = m.$('#tpTitle').value.trim();
      if (!title) { err.textContent = 'اكتب عنوان القالب'; return; }

      const type = recSel.value;
      /* ⚠️ القالب المتكرّر بلا مكلَّف يولّد مهاماً بلا صاحب لا يراها أحد في
         «مهامي» — فتتراكم في لوحة المدير وحدها. */
      if (type && !m.$('#tpWho').value) { err.textContent = 'القالب المتكرّر يحتاج مكلَّفاً — وإلا وُلِّدت مهام بلا صاحب'; return; }

      const person = staff.find((u) => u.id === m.$('#tpWho').value);
      const steps = m.$('#tpSteps').value.split('\n').map((x) => x.trim()).filter(Boolean)
        .slice(0, 20).map((text) => ({ id: uid(), text, done: false }));
      const dept = m.$('#tpDept').value;

      const next = {
        id: t?.id || 'tpl_' + uid(),
        title, description: m.$('#tpDesc').value.trim(),
        checklist: steps,
        departments: dept ? [dept] : [],
        assigneeUid: m.$('#tpWho').value || '', assigneeName: person ? person.name : '',
        priority: m.$('#tpPri').value,
        estimateHours: t?.estimateHours || 0,
        active: t?.active !== false,
        recurrence: type ? {
          type,
          dow: Number(m.$('#tpDow').value) || 0,
          dayOfMonth: Math.min(28, Math.max(1, Number(m.$('#tpDom').value) || 1)),
          dueOffsetDays: Math.max(0, Number(m.$('#tpOff').value) || 0)
        } : null
      };

      S.taskTemplates = Array.isArray(S.taskTemplates) ? S.taskTemplates : [];
      if (isEdit) Object.assign(t, next);
      else S.taskTemplates.push(next);
      await saveSettings(['taskTemplates']);
      m.close(); draw(); toast(isEdit ? 'حُفظ القالب' : 'أُضيف القالب', 'ok');
    };
  }

  draw();
}
