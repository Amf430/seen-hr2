import { el, esc, toast, openModal } from '../lib/dom.js';
import { getMe, getUsers, setProfileUid } from '../lib/state.js';
import { refreshUsers, toggleSuspend, deleteEmployee, restoreAccess } from '../lib/users.js';
import { requestsOfUser } from '../lib/requests.js';
import { db, doc, updateDoc } from '../lib/firebase.js';
import { openEmpForm } from '../components/employee-form.js';
import { openTypedConfirm } from '../components/review-modals.js';
import { go, rerender, isStale } from '../lib/nav.js';
import { money } from '../lib/format.js';
import { roleLabel } from '../lib/perms.js';
import { describeRule } from '../lib/geo.js';
import { card, tableWrap, empty, contractCell, button } from '../lib/ui.js';

export async function render(view, token) {
  const me = getMe();
  const isAdmin = me.role === 'admin';

  const bar = el('div', 'toolbar');
  bar.innerHTML = `<input id="empSearch" class="search-input" placeholder="🔍 بحث بالاسم أو القسم أو الرقم الوظيفي…">`;
  /* مدير القسم لا يقدر ينشئ أو يعدّل — القاعدة ترفضه، فلا نعرض أزراراً تفشل */
  if (isAdmin) bar.appendChild(button('➕ إضافة موظف', 'btn sm', () => openEmpForm(null, afterChange)));
  view.appendChild(bar);

  const c = card('');
  const host = el('div', '', '<div class="empty"><span class="spinner"></span> جارٍ التحميل…</div>');
  c.appendChild(host);
  view.appendChild(c);

  async function afterChange() { await refreshUsers(); draw(); }

  function draw() {
    const s = (view.querySelector('#empSearch')?.value || '').trim();
    let list = [...getUsers()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (s) list = list.filter((u) =>
      (u.name || '').includes(s) || (u.department || '').includes(s) || String(u.empId || '').includes(s));

    host.innerHTML = '';
    if (!list.length) { host.appendChild(empty('لا يوجد موظفون')); return; }
    host.appendChild(el('p', 'desc', `${list.length} موظف`));

    const wrap = tableWrap(`
      <table>
        <thead><tr>
          <th>الاسم</th><th>الرقم الوظيفي</th><th>القسم</th>
          ${isAdmin ? '<th>الراتب</th>' : ''}
          <th>الحضور</th><th>انتهاء العقد</th><th>الحالة</th><th>الصلاحية</th><th></th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = wrap.querySelector('tbody');

    list.forEach((u) => {
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(u.name)}</b><div class="cell-sub">${esc(u.jobTitle || '')}</div></td>
        <td class="num">${esc(u.empId || '—')}</td>
        <td>${esc(u.department || '—')}</td>
        ${isAdmin ? `<td class="money">${u.salary ? money(u.salary) : '<span class="text-red">—</span>'}</td>` : ''}
        <td><span class="cell-sub">${esc(describeRule(u))}</span></td>
        <td>${contractCell(u.contractEnd)}</td>
        <td><span class="pill ${u.status === 'active' ? 'active' : 'suspended'}">${u.status === 'active' ? 'نشط' : 'معلّق'}</span></td>
        <td>${u.role === 'employee' ? 'موظف' : `<span class="tag">${esc(roleLabel(u))}</span>`}</td>`;

      const act = el('td', '');
      const cell = el('div', 'actions-cell');
      cell.appendChild(button('👤 بروفايل', 'btn sm', () => { setProfileUid(u.id); go('profile'); }));
      if (isAdmin) {
        cell.appendChild(button('تعديل', 'btn sm ghost', () => openEmpForm(u, afterChange)));
        cell.appendChild(button('استعادة الوصول', 'btn sm ghost', () => openRestore(u, afterChange)));
        cell.appendChild(button(u.status === 'active' ? 'تعليق' : 'تفعيل', 'btn sm ghost', async () => {
          try {
            const ns = await toggleSuspend(u);
            toast(ns === 'suspended' ? 'تم تعليق الحساب' : 'تم تفعيل الحساب');
            await afterChange();
          } catch (e) { console.error(e); toast('تعذّر التنفيذ', 'err'); }
        }));
        if (u.id !== me.id) {
          cell.appendChild(button('حذف', 'btn sm danger', () => openDelete(u, afterChange)));
        }
      }
      act.appendChild(cell);
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    host.appendChild(wrap);
  }

  try { await refreshUsers(); } catch (e) { console.error(e); }
  if (isStale(token)) return;
  draw();
  const search = view.querySelector('#empSearch');
  if (search) search.oninput = draw;
}

/* ── حذف ── */
function openDelete(u, after) {
  openTypedConfirm({
    title: `حذف ${u.name}`,
    body: `يُحذف ملف الموظف وكل بياناته من النظام.<br><br>
           <b>حساب الدخول يبقى في Firebase Authentication</b> ولازم يُحذف يدوياً من Console.
           لكن بعد حذف الملف ما عاد يقدر يقرأ ولا يكتب أي شيء — القواعد تشترط وجود ملف موظف.`,
    phrase: 'حذف',
    confirmLabel: 'حذف نهائي',
    run: async () => { await deleteEmployee(u); await after(); toast('تم حذف الملف'); }
  });
}

/* ── استعادة الوصول ── */
function openRestore(u, after) {
  const m = openModal(`
    <h3>استعادة الوصول — ${esc(u.name)}</h3>
    <div class="callout callout--warn">
      <b class="callout__title">الخطوة ١ — من Firebase Console</b>
      <div class="help">Authentication → Users، دوّر عن حساب الموظف
      (<b>${esc(u.email || '')}</b>) واحذفه من هناك.</div>
    </div>
    <div class="help">الخطوة ٢: اضغط الزر تحت. بينشئ حساب دخول جديد بنفس رقم الجوال وكلمة مرور
    مؤقتة عشوائية، وينقل كل بيانات الموظف وسجل طلباته للحساب الجديد تلقائياً.</div>
    <div class="err" id="raErr"></div>
    <div class="row">
      <button class="btn ghost" id="raCancel">إلغاء</button>
      <button class="btn" id="raOk">تم الحذف — إنشاء حساب جديد</button>
    </div>`);

  m.$('#raCancel').onclick = m.close;
  m.$('#raOk').onclick = async () => {
    const btn = m.$('#raOk');
    btn.disabled = true; btn.textContent = 'جارٍ الاستعادة…';
    try {
      const { tempPassword } = await restoreAccess(u, requestsOfUser,
        (reqId, newUid) => updateDoc(doc(db, 'requests', reqId), { employeeUid: newUid }));
      m.close();
      await after();
      showTempPassword(u, tempPassword);
    } catch (e) {
      console.error(e);
      m.$('#raErr').textContent = e.code === 'auth/email-already-in-use'
        ? 'الحساب لسه موجود في Authentication — تأكد إنك حذفته أولاً'
        : 'تعذّرت الاستعادة';
      btn.disabled = false; btn.textContent = 'تم الحذف — إنشاء حساب جديد';
    }
  };
}

/* ⚠️ تُعرض مرة واحدة فقط ولا تُكتب في سجل الحركات.
   النسخة القديمة كانت تستعمل «123456» ثابتة وتسجّلها في السجل بنصّها. */
function showTempPassword(u, pw) {
  const m = openModal(`
    <h3>تم إنشاء الحساب</h3>
    <div class="callout callout--warn">
      <b class="callout__title">انسخ كلمة المرور الآن</b>
      <div class="help">ما راح تظهر مرة ثانية، وما تُحفظ في أي سجل.</div>
    </div>
    <div class="field">
      <label>كلمة المرور المؤقتة لـ ${esc(u.name)}</label>
      <input id="tpVal" value="${esc(pw)}" readonly class="mono">
    </div>
    <div class="help">الموظف يغيّرها إجبارياً أول ما يدخل.</div>
    <div class="row"><button class="btn" id="tpCopy">نسخ</button><button class="btn ghost" id="tpDone">تم</button></div>`);
  m.$('#tpVal').select();
  m.$('#tpCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(pw); toast('نُسخت', 'ok'); }
    catch (e) { m.$('#tpVal').select(); toast('انسخها يدوياً'); }
  };
  m.$('#tpDone').onclick = m.close;
}

export { rerender };
