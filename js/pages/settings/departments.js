import { el, esc, uid, toast, openModal } from '../../lib/dom.js';
import { getSettings, getUsers } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { refreshUsers } from '../../lib/users.js';
import { AR_DAYS } from '../../lib/dates.js';
import { isStale } from '../../lib/nav.js';
import { card, empty, tableWrap, sectionHead, button } from '../../lib/ui.js';

export async function render(view, token) {
  const S = getSettings();

  const head = card('🏢 الأقسام والهيكل',
    'كل قسم يمكن أن يكون له ورديات خاصة ومدير يوافق على استئذانات موظفيه. الموظف يُربَط بالقسم من ملفه.');
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  try { await refreshUsers(); } catch (e) { console.error(e); }
  if (isStale(token)) return;

  function draw() {
    host.innerHTML = '';
    const list = S.departments || [];
    const c = card('');
    c.appendChild(sectionHead('الأقسام', button('➕ إضافة قسم', 'btn sm', () => openDept(null, draw))));

    if (!list.length) {
      c.appendChild(empty('لا أقسام بعد — أضف قسماً ليقدر مديره يوافق على استئذانات موظفيه.', '🏢'));
      host.appendChild(c);
      return;
    }

    const wrap = tableWrap(`
      <table class="tight">
        <thead><tr><th>القسم</th><th>المدير</th><th>الورديات</th><th>الموظفون</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = wrap.querySelector('tbody');

    list.forEach((d) => {
      const mgr = getUsers().find((u) => u.id === d.managerUid);
      const cnt = getUsers().filter((u) => u.department === d.name).length;
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(d.name)}</b></td>
        <td>${mgr
          ? esc(mgr.name) + (mgr.role !== 'manager' && mgr.role !== 'admin'
              ? ' <span class="pill pending">صلاحيته ليست «مدير قسم»</span>' : '')
          : '<span class="text-muted">—</span>'}</td>
        <td>${d.shifts ? '<span class="tag">ورديات خاصة</span>' : '<span class="text-muted">ورديات الشركة</span>'}</td>
        <td class="num">${cnt}</td>`;
      const td = el('td', '');
      const cell = el('div', 'actions-cell');
      cell.append(
        button('المدير', 'btn sm ghost', () => openDeptManager(d, draw)),
        button('الورديات', 'btn sm ghost', () => openDeptShifts(d, draw)),
        button('تعديل الاسم', 'btn sm ghost', () => openDept(d, draw)),
        button('حذف', 'btn sm danger', async () => {
          const m = openModal(`
            <h3>حذف قسم ${esc(d.name)}</h3>
            <div class="help">لن تُحذف بيانات الموظفين، لكن سيرجعون لورديات الشركة العامة.</div>
            <div class="row"><button class="btn ghost" id="x1">تراجع</button><button class="btn danger" id="x2">حذف</button></div>`);
          m.$('#x1').onclick = m.close;
          m.$('#x2').onclick = async () => {
            S.departments = (S.departments || []).filter((z) => z.id !== d.id);
            await saveSettings();
            m.close(); draw(); toast('حُذف القسم');
          };
        })
      );
      td.appendChild(cell);
      tr.appendChild(td);
      tb.appendChild(tr);
    });

    c.appendChild(wrap);
    host.appendChild(c);
  }

  draw();
}

function openDept(d, after) {
  const S = getSettings();
  const isEdit = !!d;
  const m = openModal(`
    <h3>${isEdit ? 'تعديل اسم القسم' : 'إضافة قسم'}</h3>
    <div class="field"><label for="dName">اسم القسم *</label>
      <input id="dName" value="${esc(d?.name || '')}" placeholder="مثال: المبيعات"></div>
    ${isEdit ? '<div class="help">تغيير الاسم لا ينقل الموظفين تلقائياً — عدّل قسم كل موظف من ملفه.</div>' : ''}
    <div class="err" id="dErr"></div>
    <div class="row"><button class="btn ghost" id="dCancel">إلغاء</button>
      <button class="btn" id="dOk">${isEdit ? 'حفظ' : 'إضافة'}</button></div>`);

  m.$('#dCancel').onclick = m.close;
  m.$('#dOk').onclick = async () => {
    const n = m.$('#dName').value.trim();
    if (!n) { m.$('#dErr').textContent = 'اكتب اسم القسم'; return; }
    if ((S.departments || []).some((x) => x.name === n && x.id !== d?.id)) {
      m.$('#dErr').textContent = 'القسم موجود مسبقاً'; return;
    }
    if (isEdit) d.name = n;
    else (S.departments = S.departments || []).push({ id: uid(), name: n, managerUid: '', shifts: null });
    await saveSettings();
    m.close(); after(); toast(isEdit ? 'حُفظ' : 'أُضيف القسم', 'ok');
  };
}

function openDeptManager(d, after) {
  const opts = '<option value="">— بلا مدير —</option>' +
    [...getUsers()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((u) => `<option value="${esc(u.id)}"${d.managerUid === u.id ? ' selected' : ''}>${esc(u.name)}${u.department ? ' — ' + esc(u.department) : ''}</option>`).join('');

  const m = openModal(`
    <h3>مدير قسم ${esc(d.name)}</h3>
    <div class="field"><label for="dmSel">المدير المسؤول عن الموافقات</label>
      <select id="dmSel">${opts}</select></div>
    <div class="help">لكي يوافق فعلياً: صلاحيته لازم تكون «مدير قسم» وقسمه نفس هذا القسم — الشرطان معاً، وقاعدة الأمان تتحقق منهما على السيرفر.</div>
    <div class="row"><button class="btn ghost" id="dmCancel">إلغاء</button><button class="btn" id="dmOk">حفظ</button></div>`);
  m.$('#dmCancel').onclick = m.close;
  m.$('#dmOk').onclick = async () => {
    d.managerUid = m.$('#dmSel').value || '';
    await saveSettings();
    m.close(); after(); toast('حُفظ المدير', 'ok');
  };
}

function openDeptShifts(d, after) {
  const S = getSettings();
  const base = d.shifts || S.shifts || {};
  const m = openModal(`
    <h3>ورديات قسم ${esc(d.name)}</h3>
    <div class="help">${d.shifts ? 'هذا القسم يستخدم ورديات خاصة.' : 'هذا القسم يستخدم ورديات الشركة حالياً — الحفظ يجعلها خاصة به.'}</div>
    <div class="table-wrap mt-3"><table class="tight">
      <thead><tr><th>اليوم</th><th>النوع</th><th>من</th><th>إلى</th></tr></thead>
      <tbody>${AR_DAYS.map((dn, i) => {
        const sh = base[i] || { type: 'off', start: '', end: '' };
        return `<tr>
          <td><b>${dn}</b></td>
          <td><select data-d="${i}" class="dsType inline-input">
            <option value="morning"${sh.type === 'morning' ? ' selected' : ''}>صباحي</option>
            <option value="evening"${sh.type === 'evening' ? ' selected' : ''}>مسائي</option>
            <option value="off"${sh.type === 'off' ? ' selected' : ''}>راحة</option></select></td>
          <td><input type="time" data-d="${i}" class="dsStart inline-input" value="${esc(sh.start || '')}"></td>
          <td><input type="time" data-d="${i}" class="dsEnd inline-input" value="${esc(sh.end || '')}"></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="row">
      <button class="btn ghost" id="dsUse">استخدم ورديات الشركة</button>
      <button class="btn" id="dsOk">حفظ ورديات القسم</button>
    </div>
    <button class="btn link" id="dsCancel">إلغاء</button>`);

  m.$('#dsCancel').onclick = m.close;
  m.$('#dsUse').onclick = async () => {
    d.shifts = null; await saveSettings(); m.close(); after(); toast('رجع القسم لورديات الشركة', 'ok');
  };
  m.$('#dsOk').onclick = async () => {
    const ns = {};
    AR_DAYS.forEach((_, i) => {
      const type = m.modal.querySelector(`.dsType[data-d="${i}"]`).value;
      const start = m.modal.querySelector(`.dsStart[data-d="${i}"]`).value;
      const end = m.modal.querySelector(`.dsEnd[data-d="${i}"]`).value;
      ns[i] = { type, start: type === 'off' ? '' : start, end: type === 'off' ? '' : end };
    });
    d.shifts = ns; await saveSettings(); m.close(); after(); toast('حُفظت ورديات القسم', 'ok');
  };
}
