import { el, esc, uid, toast, openModal } from '../../lib/dom.js';
/* ⚠️ chainRoleAr و openModal سقطتا في الدمج، وكلتاهما تُستدعى في مسار العرض
   نفسه (chainRoleAr في السطر 31 داخل draw) — فكانت الصفحة ترمي عند فتحها. */
import { chainRoleAr } from '../../lib/requests.js';
import { getSettings } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { chipCard } from '../../components/chip-card.js';
import { card, empty, button } from '../../lib/ui.js';

export function render(view) {
  const S = getSettings();

  /* أسباب الاستئذان */
  view.appendChild(chipCard({
    title: 'أسباب الاستئذان', icon: 'clock', key: 'permissionReasons',
    fields: ['label'], labels: ['السبب'],
    renderItem: (item) => esc(item.label),
    build: (vals, mkId) => ({ id: mkId(), label: vals.label })
  }));

  /* ── تصنيفات طلبات الموارد البشرية ──
     تُدار هنا مع بقية القوائم بدل أن تكون ثابتة في الكود: التأمين الصحي
     اليوم قد يصير «بدل سكن» غداً، وتعديلها لا يستحق نشر إصدار. */
  view.appendChild(chipCard({
    title: 'تصنيفات طلبات الموارد البشرية', icon: 'inbox', key: 'hrTicketCategories',
    fields: ['label'], labels: ['التصنيف'],
    renderItem: (item) => esc(item.label),
    build: (vals, mkId) => ({ id: mkId(), label: vals.label })
  }));

  /* ── أنواع الإجازات ──
     ⚠️ كانت تُعرض كـ«شريحة» واحدة تحمل: الاسم، والرصيد، وحالة الراتب،
     ومسار الاعتماد، وزرَّين، وزرّ حذف. والشريحة عنصر سطريّ مصمَّم لوسم قصير،
     فكان كل ذلك يلتفّ ويتداخل على أي شاشة.

     والأسوأ من الازدحام تناقضٌ في المعنى: النصّ يكتب الحالة («بدون راتب»)
     والزرّ بجواره يكتب الإجراء المضادّ («مدفوعة») — كلمتان متعاكستان
     متلاصقتان، فلا يُعرف أيّهما الوصف وأيّهما الزرّ.

     الآن: صفٌّ لكل نوع. الحالة شارات ملوّنة تُقرأ ولا تُضغط، والإجراء زرّ
     يبدأ بفعل صريح («اجعلها…») فلا يلتبس بالوصف. */
  const lc = card('أنواع الإجازات',
    'الرصيد = عدد الأيام السنوية. «يُخصم من الرصيد» يقلّل رصيد الموظف عند الموافقة. «بدون راتب» تعني أن اليوم يُخصم من الراتب في المسير.');
  const rows = el('div', 'lt-list');
  lc.appendChild(rows);

  const draw = () => {
    rows.innerHTML = '';
    const list = S.leaveTypes || [];
    if (!list.length) { rows.appendChild(el('p', 'desc', 'لا توجد أنواع.')); return; }

    list.forEach((t) => {
      const unpaid = (t.unpaid !== undefined) ? !!t.unpaid : /بدون\s*راتب/.test(t.label || '');
      const chain = Array.isArray(t.approvalChain) ? t.approvalChain : [];
      const chainTxt = chain.length ? chain.map(chainRoleAr).join(' ← ') : 'الموارد البشرية مباشرةً';

      const row = el('div', 'lt-row');
      row.innerHTML = `
        <div class="lt-row__main">
          <b>${esc(t.label)}</b>
          <div class="lt-badges">
            <span class="pill pill--dot ${t.deduct ? 'pending' : ''}">${
              t.deduct ? 'يُخصم من الرصيد · ' + esc(t.balance) + ' يوم' : 'لا يُخصم من الرصيد'}</span>
            <span class="pill pill--dot ${unpaid ? 'rejected' : 'active'}">${
              unpaid ? 'بدون راتب' : 'مدفوعة'}</span>
          </div>
          <div class="lt-chain">
            <span class="k">مسار الاعتماد</span>
            <span class="v">${esc(chainTxt)}</span>
          </div>
        </div>`;

      const acts = el('div', 'lt-row__acts');

      /* ⚠️ السلسلة تُنسخ على الطلب وقت تقديمه لا وقت اعتماده — فتغييرها هنا
         لا يمسّ الطلبات المقدَّمة، وهذا مقصود: مسار طلب لا يتبدّل تحت قدمي
         من قدّمه. */
      acts.appendChild(button('تعديل المسار', 'btn sm ghost', () => openChain(t, draw), 'gear'));

      /* الزرّ يبدأ بفعل، فلا يُقرأ وصفاً للحالة */
      acts.appendChild(button(unpaid ? 'اجعلها مدفوعة' : 'اجعلها بدون راتب',
        'btn sm ghost', async () => {
          t.unpaid = !unpaid;
          await saveSettings(['leaveTypes']); draw();
          toast(t.unpaid ? 'صارت بدون راتب' : 'صارت مدفوعة', 'ok');
        }, 'money'));

      const x = button('حذف', 'btn sm ghost danger', async () => {
        S.leaveTypes = (S.leaveTypes || []).filter((z) => z.id !== t.id);
        await saveSettings(['leaveTypes']); draw();
        toast('حُذف النوع', 'ok');
      }, 'trash');
      acts.appendChild(x);

      row.appendChild(acts);
      rows.appendChild(row);
    });
  };
  draw();

  const add = el('div', 'add-inline');
  add.innerHTML = `
    <div class="field grow"><label for="nlName">نوع الإجازة</label>
      <input id="nlName" placeholder="مثال: إجازة سنوية"></div>
    <div class="field"><label for="nlBal">الرصيد (يوم)</label>
      <input id="nlBal" type="number" value="0" min="0"></div>
    <div class="field"><label for="nlDed">يُخصم من الرصيد؟</label>
      <select id="nlDed"><option value="true">نعم</option><option value="false">لا</option></select></div>
    <div class="field"><label for="nlPaid">مدفوعة الراتب؟</label>
      <select id="nlPaid"><option value="true">مدفوعة</option><option value="false">بدون راتب</option></select></div>`;
  add.appendChild(button('إضافة', 'btn sm', async () => {
    const n = add.querySelector('#nlName').value.trim();
    if (!n) { toast('اكتب اسم النوع', 'err'); return; }
    S.leaveTypes = S.leaveTypes || [];
    S.leaveTypes.push({
      id: uid(), label: n,
      balance: parseInt(add.querySelector('#nlBal').value, 10) || 0,
      deduct: add.querySelector('#nlDed').value === 'true',
      unpaid: add.querySelector('#nlPaid').value === 'false'
    });
    await saveSettings();
    draw();
    add.querySelector('#nlName').value = '';
    toast('أُضيف', 'ok');
  }));
  lc.appendChild(add);
  view.appendChild(lc);

  /* جهات الاعتماد */
  view.appendChild(chipCard({
    title: 'جهات الاعتماد (المُستأذَن منهم)', icon: 'check', key: 'approvers',
    fields: ['name'], labels: ['الاسم / الجهة'],
    renderItem: (item) => esc(item.name),
    build: (vals, mkId) => ({ id: mkId(), name: vals.name })
  }));

  if (!(S.approvers || []).length) {
    const w = card('');
    w.appendChild(empty('بدون جهة اعتماد واحدة على الأقل، ما يقدر أي موظف يقدّم طلباً.', 'alert'));
    view.appendChild(w);
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   سلسلة الموافقات لنوع إجازة.

   بلا سلسلة يسلك الطلب المسار القديم: الموارد البشرية تعتمده مباشرةً. هذا
   هو الوضع الافتراضي لكل الأنواع القائمة، فلا شيء يتغيّر حتى تُضاف سلسلة.
   ═══════════════════════════════════════════════════════════════════════════ */
const STEP_OPTS = [['manager', 'مدير القسم'], ['admin', 'الموارد البشرية']];

function openChain(t, after) {
  const cur = Array.isArray(t.approvalChain) ? [...t.approvalChain] : [];

  const m = openModal(`
    <h3>مسار اعتماد «${esc(t.label)}»</h3>
    <div class="help">الطلب يمرّ بالخطوات بالترتيب. لا يصير معتمَداً — ولا يُخصم الرصيد —
    إلا بعد آخر خطوة. الرفض في أي خطوة يوقف السلسلة فوراً.</div>
    <div id="chSteps" class="steps"></div>
    <div class="form-row">
      <div class="field"><label for="chAdd">إضافة خطوة</label>
        <select id="chAdd">${STEP_OPTS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><button class="btn ghost" id="chAddBtn" type="button">أضف للنهاية</button></div>
    </div>
    <div class="err" id="chErr"></div>
    <div class="row">
      <button class="btn ghost" id="chClear">بلا سلسلة (المسار المباشر)</button>
      <button class="btn" id="chSave">حفظ المسار</button>
    </div>`);

  const paint = () => {
    const box = m.$('#chSteps');
    if (!cur.length) {
      box.innerHTML = '<p class="help">بلا سلسلة — تعتمده الموارد البشرية مباشرةً.</p>';
      return;
    }
    box.innerHTML = '';
    cur.forEach((role, i) => {
      const row = el('div', 'step',
        `<span class="step__n">${i + 1}</span><span class="step__t">${esc(chainRoleAr(role))}</span>`);
      const del = el('button', 'chip__x', '×');
      del.setAttribute('aria-label', 'حذف الخطوة');
      del.onclick = () => { cur.splice(i, 1); paint(); };
      row.appendChild(del);
      box.appendChild(row);
    });
  };

  m.$('#chAddBtn').onclick = () => {
    if (cur.length >= 4) { m.$('#chErr').textContent = 'الحدّ الأقصى أربع خطوات'; return; }
    m.$('#chErr').textContent = '';
    cur.push(m.$('#chAdd').value);
    paint();
  };
  m.$('#chClear').onclick = async () => {
    delete t.approvalChain;
    await saveSettings(['leaveTypes']);
    m.close(); after(); toast('صار المسار مباشراً', 'ok');
  };
  m.$('#chSave').onclick = async () => {
    if (!cur.length) { m.$('#chErr').textContent = 'أضف خطوة واحدة على الأقل، أو اختر «بلا سلسلة»'; return; }
    t.approvalChain = cur;
    await saveSettings(['leaveTypes']);
    m.close(); after(); toast('حُفظ مسار الاعتماد', 'ok');
  };
  paint();
}
