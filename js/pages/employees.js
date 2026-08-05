import { el, esc, toast, openModal } from '../lib/dom.js';
import { getMe, getUsers } from '../lib/state.js';
import { refreshUsers, toggleSuspend, deleteEmployee, restoreAccess,
         findOrphanHistory, linkPreviousUids } from '../lib/users.js';
import { requestsOfUser } from '../lib/requests.js';
import { db, doc, updateDoc } from '../lib/firebase.js';
import { openEmpForm } from '../components/employee-form.js';
import { openTypedConfirm } from '../components/review-modals.js';
import { go, rerender, isStale } from '../lib/nav.js';
import { money } from '../lib/format.js';
import { roleLabel } from '../lib/perms.js';
import { describeRule } from '../lib/geo.js';
import { card, tableWrap, empty, contractCell, button, rowMenu } from '../lib/ui.js';
import { docsOf, worstDocState, kindLabel } from '../lib/documents.js';

export async function render(view, token) {
  const me = getMe();
  const isAdmin = me.role === 'admin';

  const bar = el('div', 'toolbar');
  bar.innerHTML = `<input id="empSearch" class="search-input" placeholder="بحث بالاسم أو القسم أو الرقم الوظيفي…">`;
  /* مدير القسم لا يقدر ينشئ أو يعدّل — القاعدة ترفضه، فلا نعرض أزراراً تفشل */
  if (isAdmin) bar.appendChild(button('إضافة موظف', 'btn sm', () => openEmpForm(null, afterChange, 'plus')));
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
          <th>الاسم</th><th class="num">الرقم الوظيفي</th><th>القسم</th>
          ${isAdmin ? '<th class="money">الراتب</th>' : ''}
          <th>الحضور</th><th>انتهاء العقد</th><th>المستندات</th><th>الحالة</th><th>الصلاحية</th><th></th>
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
        <td>${docCell(u)}</td>
        <td><span class="pill pill--dot ${u.status === 'active' ? 'active' : 'suspended'}">${u.status === 'active' ? 'نشط' : 'معلّق'}</span></td>
        <td>${u.role === 'employee' ? 'موظف' : `<span class="tag">${esc(roleLabel(u))}</span>`}</td>`;

      /* ⚠️ إجراء أساسي ظاهر، والبقية خلف قائمة واحدة.
         كان الصف يحمل خمسة أزرار: ٤٠ موظفاً = ٢٠٠ هدف لمس في شاشة واحدة،
         و«حذف» بجوار «بروفايل» بفارق ٤ بكسل على الجوال. */
      const act = el('td', '');
      const cell = el('div', 'actions-cell');
      cell.appendChild(button('بروفايل', 'btn sm', () => go('profile', u.id), 'people'));
      if (isAdmin) {
        cell.appendChild(rowMenu([
          { label: 'تعديل البيانات', ico: 'gear', onClick: () => openEmpForm(u, afterChange) },
          { label: u.status === 'active' ? 'تعليق الحساب' : 'تفعيل الحساب',
            ico: u.status === 'active' ? 'x' : 'check',
            onClick: async () => {
              try {
                const ns = await toggleSuspend(u);
                toast(ns === 'suspended' ? 'تم تعليق الحساب' : 'تم تفعيل الحساب');
                await afterChange();
              } catch (e) { console.error(e); toast('تعذّر التنفيذ', 'err'); }
            } },
          { label: 'استعادة الوصول', ico: 'login', onClick: () => openRestore(u, afterChange) },
          { label: 'استرجاع سجلات سابقة', ico: 'archive', onClick: () => openReclaim(u, afterChange) },
          u.id !== me.id ? null : undefined,
          u.id !== me.id
            ? { label: 'حذف الملف', ico: 'trash', danger: true, onClick: () => openDelete(u, afterChange) }
            : undefined
        ].filter((x) => x !== undefined)));
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

/* أسوأ مستند فقط في خلية واحدة — الجدول عريض أصلاً، وما يهمّ هو وجود
   مشكلة لا تعدادها. التفصيل في البروفايل. */
function docCell(u) {
  const n = docsOf(u).length;
  if (!n) return '<span class="muted">—</span>';
  const w = worstDocState(u);
  if (!w) return `<span class="muted">${n} مستند</span>`;
  return w.state === 'expired'
    ? `<span class="pill pill--dot rejected">${esc(kindLabel(w.d.kind))} منتهٍ</span>`
    : `<span class="pill pill--dot pending">${esc(kindLabel(w.d.kind))} · ${w.left} يوم</span>`;
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

/* ── استرجاع سجلات سابقة ──
   لمن استُعيد وصوله قبل إصلاح restoreAccess: تاريخه ما زال في قاعدة البيانات
   تحت معرّف قديم، والمسير يعتبر أيامه غياباً ويخصم عليها. هذه الشاشة تجده
   وتعرضه على الأدمن ليربطه. */
async function openReclaim(u, after) {
  const m = openModal(`
    <h3>استرجاع سجلات سابقة — ${esc(u.name)}</h3>
    <div class="help">استعادة الوصول تُنشئ حساباً جديداً بمعرّف جديد، وسجلات الحضور
      مفهرسة بالمعرّف. فسجلات ما قبل الاستعادة تبقى في النظام لكنها لا تُنسب لأحد —
      والمسير يعتبر تلك الأيام غياباً ويخصم عليها. نبحث عنها بالرقم الوظيفي
      «${esc(u.empId || '—')}».</div>
    <div id="rcBody"><div class="empty"><span class="spinner"></span> جارٍ البحث…</div></div>
    <div class="row">
      <button class="btn ghost" id="rcCancel">إغلاق</button>
      <button class="btn" id="rcOk" hidden>اربط السجلات</button>
    </div>`);
  m.$('#rcCancel').onclick = m.close;
  const body = m.$('#rcBody'), ok = m.$('#rcOk');

  if (!String(u.empId || '').trim()) {
    body.innerHTML = '<div class="empty">لا رقم وظيفي على هذا الملف — والبحث يعتمد عليه. أضِفه أولاً من «تعديل البيانات».</div>';
    return;
  }

  let res;
  try { res = await findOrphanHistory(u); }
  catch (e) { console.error(e); body.innerHTML = '<div class="empty text-red">تعذّر البحث — تحقّق من اتصالك.</div>'; return; }

  if (!res.found.length) {
    body.innerHTML = '<div class="empty">لا سجلات يتيمة لهذا الرقم الوظيفي. تاريخ الموظف كامل كما هو.</div>';
    return;
  }

  body.innerHTML = `<table class="tight"><thead><tr>
      <th class="num">المعرّف السابق</th><th>الاسم وقتها</th><th class="num">عدد السجلات</th><th class="num">من</th><th class="num">إلى</th></tr></thead>
    <tbody>${res.found.map((f) => `<tr>
      <td class="num" style="font-size:11px">${esc(f.uid)}</td>
      <td>${esc(f.name || '—')}</td>
      <td class="num">${f.count}</td>
      <td class="num">${esc(f.from)}</td>
      <td class="num">${esc(f.to)}</td></tr>`).join('')}</tbody></table>
    <div class="help">⚠️ تأكّد أن الاسم والتواريخ تخصّ هذا الموظف فعلاً. لو أُعيد استعمال
      الرقم الوظيفي لموظف آخر سابق، فالربط ينسب تاريخ شخص لشخص — ولا تفعله.</div>`;
  ok.hidden = false;
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = 'جارٍ الربط…';
    try {
      await linkPreviousUids(u, res.found.map((f) => f.uid));
      m.close();
      toast(`رُبطت ${res.found.reduce((a, f) => a + f.count, 0)} سجلاً`, 'ok');
      await after();
    } catch (e) {
      console.error(e);
      ok.disabled = false; ok.textContent = 'اربط السجلات';
      toast('تعذّر الربط', 'err');
    }
  };
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
