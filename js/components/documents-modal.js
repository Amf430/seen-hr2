/* ═══════════════════════════════════════════════════════════════════════════
   نافذة إدارة مستندات الموظف — للأدمن وحده.

   ── لماذا التحرير كله في نافذة واحدة ──
   المستندات تُراجع دفعةً واحدة (يفتح الأدمن ملف الموظف عند التجديد فيحدّث
   الإقامة ورخصة العمل معاً)، لا واحداً واحداً. حفظ واحد يكتب المصفوفة كاملة،
   وهو ما تتوقّعه القاعدة أصلاً.

   ⚠️ الرابط يمرّ بـ safeUrl قبل العرض: حقل نصّي يكتبه الأدمن ويُعرض كرابط
   قابل للنقر، و `javascript:` فيه ينفّذ في سياق نطاقنا. extLink تتكفّل بذلك.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, openModal, toast, extLink, uid as randId } from '../lib/dom.js';
import { DOC_KINDS, MAX_DOCS, docsOf, docStatus, kindOf } from '../lib/documents.js';
import { saveDocuments } from '../lib/users.js';

export function openDocsModal(user, after) {
  /* نسخة عمل — لا تُكتب على الموظف إلا عند الحفظ */
  let list = docsOf(user).map((d) => ({ ...d }));

  const m = openModal(`
    <h3>مستندات ${esc(user.name || '')}</h3>
    <p class="help">بيانات المستند وتاريخ انتهائه ورابط اختياري لمكان الملف.
      رفع الملفات نفسها يحتاج خطة Firebase المدفوعة — والمهم هنا هو التنبيه قبل الانتهاء.</p>
    <div id="dmList"></div>
    <div class="row-between" style="margin-block-start:var(--sp-3)">
      <button class="btn sm ghost" id="dmAdd">إضافة مستند</button>
      <span class="help" id="dmCount"></span>
    </div>
    <div class="err" id="dmErr" role="alert"></div>
    <div class="row">
      <button class="btn ghost" id="dmCancel">تراجع</button>
      <button class="btn" id="dmSave">حفظ</button>
    </div>`);

  const host  = m.$('#dmList');
  const count = m.$('#dmCount');
  const addBtn = m.$('#dmAdd');

  function draw() {
    host.innerHTML = '';
    if (!list.length) {
      host.appendChild(el('div', 'empty', 'لا مستندات مسجّلة بعد.'));
    }
    list.forEach((d, i) => host.appendChild(row(d, i)));
    count.textContent = `${list.length} من ${MAX_DOCS}`;
    addBtn.disabled = list.length >= MAX_DOCS;
  }

  function row(d, i) {
    const k = kindOf(d.kind);
    const st = docStatus(d);
    const wrap = el('div', 'doc-edit');

    wrap.innerHTML = `
      <div class="doc-edit__head">
        <select class="doc-kind" aria-label="نوع المستند">
          ${DOC_KINDS.map((o) => `<option value="${esc(o.id)}"${o.id === k.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
        <button class="btn sm ghost danger doc-del" type="button">حذف</button>
      </div>
      <div class="doc-edit__grid">
        <label>الرقم<input class="doc-num" value="${esc(d.number || '')}" maxlength="40" placeholder="رقم المستند"></label>
        <label>تاريخ الإصدار<input class="doc-iss" type="date" value="${esc(d.issuedOn || '')}"></label>
        <label class="doc-exp-cell">تاريخ الانتهاء<input class="doc-exp" type="date" value="${esc(d.expiresOn || '')}"${k.expires ? '' : ' disabled'}></label>
        <label>رابط الملف (اختياري)<input class="doc-link" value="${esc(d.link || '')}" maxlength="500" placeholder="https://…"></label>
      </div>
      <label class="doc-note-cell">ملاحظة<input class="doc-note" value="${esc(d.note || '')}" maxlength="200" placeholder="اختياري"></label>
      <div class="doc-edit__foot"></div>`;

    /* شارة الحالة — تُحدَّث فوراً عند تغيير التاريخ، فيرى الأدمن أثر ما كتب */
    const foot = wrap.querySelector('.doc-edit__foot');
    const paintFoot = () => {
      const s = docStatus(d);
      foot.innerHTML = '';
      if (s.state === 'expired') foot.innerHTML = `<span class="pill pill--dot rejected">منتهٍ منذ ${Math.abs(s.left)} يوم</span>`;
      else if (s.state === 'soon') foot.innerHTML = `<span class="pill pill--dot pending">ينتهي خلال ${s.left} يوم</span>`;
      else if (s.state === 'ok') foot.innerHTML = `<span class="pill pill--dot active">سارٍ · ${s.left} يوم</span>`;
      else if (!kindOf(d.kind).expires) foot.innerHTML = `<span class="muted">لا ينتهي</span>`;
      /* extLink تُعيد نصّاً لا عنصراً — وقد مرّ بـ safeUrl داخلها */
      if (d.link) foot.innerHTML += ' ' + extLink(d.link, 'فتح الملف');
    };
    paintFoot();

    const q = (s) => wrap.querySelector(s);
    q('.doc-kind').onchange = (e) => {
      d.kind = e.target.value;
      const nk = kindOf(d.kind);
      const exp = q('.doc-exp');
      exp.disabled = !nk.expires;
      if (!nk.expires) { d.expiresOn = ''; exp.value = ''; }
      paintFoot();
    };
    q('.doc-num').oninput  = (e) => { d.number = e.target.value; };
    q('.doc-iss').onchange = (e) => { d.issuedOn = e.target.value; };
    q('.doc-exp').onchange = (e) => { d.expiresOn = e.target.value; paintFoot(); };
    q('.doc-link').oninput = (e) => { d.link = e.target.value; };
    q('.doc-note').oninput = (e) => { d.note = e.target.value; };
    q('.doc-del').onclick  = () => { list.splice(i, 1); draw(); };
    return wrap;
  }

  addBtn.onclick = () => {
    if (list.length >= MAX_DOCS) return;
    list.push({ id: randId(), kind: 'iqama', number: '', issuedOn: '', expiresOn: '', link: '', note: '' });
    draw();
  };

  m.$('#dmCancel').onclick = m.close;
  m.$('#dmSave').onclick = async () => {
    const err = m.$('#dmErr');
    /* تاريخ انتهاء قبل الإصدار خطأ إدخال صامت — يمرّ ثم يُنبَّه عليه بلا سبب */
    const bad = list.find((d) => d.issuedOn && d.expiresOn && d.expiresOn < d.issuedOn);
    if (bad) { err.textContent = `«${kindOf(bad.kind).label}»: تاريخ الانتهاء قبل تاريخ الإصدار`; return; }

    const btn = m.$('#dmSave');
    btn.disabled = true;
    try {
      await saveDocuments(user, list);
      m.close();
      toast('حُفظت المستندات');
      if (after) await after();
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      err.textContent = 'تعذّر الحفظ — تحقّق من اتصالك وأعد المحاولة';
    }
  };

  draw();
}

/* ═══ العرض للقراءة — في البروفايل وشاشة الموظف ═══ */
export function docsList(u, { compact = false } = {}) {
  const docs = docsOf(u);
  const host = el('div', 'doc-view');
  if (!docs.length) {
    host.appendChild(el('div', 'empty', 'لا مستندات مسجّلة.'));
    return host;
  }
  /* الأقرب انتهاءً أولاً — وما لا ينتهي في الآخر */
  const sorted = [...docs].sort((a, b) => {
    const sa = docStatus(a), sb = docStatus(b);
    if (sa.left === null) return 1;
    if (sb.left === null) return -1;
    return sa.left - sb.left;
  });

  sorted.forEach((d) => {
    const k = kindOf(d.kind), s = docStatus(d);
    const it = el('div', 'doc-item');
    const badge = s.state === 'expired' ? `<span class="pill pill--dot rejected">منتهٍ منذ ${Math.abs(s.left)} يوم</span>`
                : s.state === 'soon'    ? `<span class="pill pill--dot pending">ينتهي خلال ${s.left} يوم</span>`
                : s.state === 'ok'      ? `<span class="pill pill--dot active">سارٍ</span>`
                : `<span class="muted">لا ينتهي</span>`;
    it.innerHTML = `
      <div class="doc-item__main">
        <b>${esc(k.label)}</b>
        ${d.number ? `<span class="cell-sub num">${esc(d.number)}</span>` : ''}
        ${!compact && d.note ? `<span class="cell-sub">${esc(d.note)}</span>` : ''}
        ${d.link ? extLink(d.link, 'فتح الملف') : ''}
      </div>
      <div class="doc-item__side">
        ${d.expiresOn ? `<span class="num muted">${esc(d.expiresOn)}</span>` : ''}
        ${badge}
      </div>`;
    host.appendChild(it);
  });
  return host;
}
