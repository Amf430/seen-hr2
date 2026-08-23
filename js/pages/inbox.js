/* ═══════════════════════════════════════════════════════════════════════════
   بانتظار موافقتك — الطلبات التي يقرّرها هذا المستخدم.

   أُعيد تصميمها على شكل جدول بصور رمزية وإجراءات مدمجة (مرجع «Leaves»):
   الصفّ يقول من ولماذا ومتى وكم، والقرار في طرفه. البطاقة القديمة كانت
   تعرض نفس البيانات في مساحة أربعة أضعاف، فلا يظهر على الشاشة إلا طلبان.

   ⚠️ رقاقات الأنواع أعلى الصفحة تعرض **عدد الطلبات المعلّقة لكل نوع** لا
   أرصدة الإجازات كما في مرجع التصميم. سبب الفرق أن مرجعهم يعرض رصيد **من
   ينظر**، ومن ينظر هنا أدمن يقرّر لغيره — ورصيده هو لا يعني شيئاً في هذه
   الشاشة. رصيد كل موظف يظهر في بطاقة طلبه وفي بروفايله.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getMe, getRequests } from '../lib/state.js';
import { canApprove, canApproveType } from '../lib/perms.js';
import { hasChain, ownsCurrentStep, approve } from '../lib/requests.js';
import { openReject } from '../components/review-modals.js';
import { empty, callout, pageHead, button, avatar, tableWrap } from '../lib/ui.js';
import { STATUS_AR } from '../lib/dates.js';
import { fmtDate, plural } from '../lib/format.js';
import { go } from '../lib/nav.js';

/* ⚠️ حالة الفرز خارج render عمداً.
   كل موافقة تكتب في Firestore، فيُطلق الاشتراك اللحظي إعادة عرض الصفحة —
   وكانت تُعيد بناء الفلاتر بقيمها الافتراضية، فيضيع ما اختاره المراجع وما
   كتبه في البحث في اللحظة التي يشتغل فيها. */
const filterState = { status: 'pending', type: '', search: '', view: 'table' };

export function render(view) {
  const me = getMe();

  const host = el('div', '');

  const draw = () => {
    view.innerHTML = '';
    const all = getRequests();

    /* ما يستطيع هذا المستخدم اعتماده فعلاً — الرقم الذي يهمّه */
    const mine = all.filter((r) => r.status === 'pending' &&
      (hasChain(r) ? ownsCurrentStep(r) : canApproveType(r)));
    const perm = mine.filter((r) => r.type === 'permission').length;
    const leave = mine.filter((r) => r.type === 'leave').length;

    view.appendChild(pageHead('بانتظار موافقتك',
      mine.length
        ? `${plural(mine.length, ['طلب واحد', 'طلبان', 'طلبات'])} بانتظار قرارك · ` +
          `${perm} استئذان · ${leave} إجازة`
        : 'لا شيء ينتظر قرارك الآن',
      button('تقويم الفريق', 'btn sm ghost', () => go('team-calendar'), 'calendar')));

    if (me.role === 'manager') {
      view.appendChild(callout('info',
        `صلاحيتك: استئذانات قسم «${me.department || '—'}»`,
        'طلبات الإجازة يعتمدها مدير الموارد البشرية لأنها تُعدّل أرصدة الموظف.'));
    }

    const filt = el('div', 'filters');
    filt.innerHTML = `
      <div class="field"><label for="fStatus">الحالة</label>
        <select id="fStatus">
          <option value="pending">تحت المراجعة</option>
          <option value="">الكل</option>
          <option value="approved">موافق عليها</option>
          <option value="rejected">مرفوضة</option>
        </select></div>
      <div class="field"><label for="fType">النوع</label>
        <select id="fType">
          <option value="">الكل</option>
          <option value="permission">استئذان</option>
          <option value="leave">إجازة</option>
        </select></div>
      <div class="field grow"><label for="fSearch">بحث بالاسم</label>
        <input id="fSearch" placeholder="اسم الموظف…"></div>`;
    filt.querySelector('#fStatus').value = filterState.status;
    filt.querySelector('#fType').value   = filterState.type;
    filt.querySelector('#fSearch').value = filterState.search;
    view.appendChild(filt);
    view.appendChild(host);

    ['fStatus', 'fType'].forEach((id) => {
      filt.querySelector('#' + id).onchange = () => {
        filterState.status = filt.querySelector('#fStatus').value;
        filterState.type = filt.querySelector('#fType').value;
        paint();
      };
    });
    filt.querySelector('#fSearch').oninput = () => {
      filterState.search = filt.querySelector('#fSearch').value;
      paint();
    };
    paint();
  };

  function paint() {
    host.innerHTML = '';
    const { status: st, type: ty } = filterState;
    const s = filterState.search.trim();

    let list = getRequests().filter((r) => (!st || r.status === st) && (!ty || r.type === ty));
    /* مدير القسم يرى ما يخصّه: طلبات قسمه، أو ما يملك فيه خطوة في السلسلة */
    if (me.role === 'manager') list = list.filter((r) => canApprove(r) || ownsCurrentStep(r));
    if (s) list = list.filter((r) => (r.employeeName || '').includes(s));

    if (!list.length) { host.appendChild(empty('لا طلبات مطابقة', 'inbox')); return; }

    /* ⚠️ جدول واحد بعمود إجراءات — لا قسمان. مرجع التصميم يضع الكلّ في
       جدول واحد: الصفّ الذي يملك قراره يحمل ✓ و✗، والمحسوم يحمل «—». وهو
       أصدق أيضاً — القسمان كانا يوحيان بأن «بقيّة الطلبات» نوع مختلف، وهي
       نفسها بعد أن حُسمت أو لأنها ليست من صلاحيته.

       ⚠️ وما يملك قراره يتصدّر الترتيب: هو سبب فتح الشاشة. */
    const canAct = (r) => r.status === 'pending' &&
      (hasChain(r) ? ownsCurrentStep(r) : canApproveType(r));
    const sorted = [...list].sort((a, b) => (canAct(b) ? 1 : 0) - (canAct(a) ? 1 : 0));
    host.appendChild(requestsTable(sorted, canAct));
  }

  /* الجدول — صورة رمزية، نوع، تصنيف، تواريخ، أيام، سبب، تفاصيل، حالة، إجراءات. */
  function requestsTable(rows, canAct) {
    const body = rows.map((r, i) => {
      const when = r.type === 'permission'
        ? `${fmtDate(r.date)}${r.time ? ` · ${r.time}` : ''}`
        : `${fmtDate(r.startDate)} ← ${fmtDate(r.endDate)}`;
      const days = r.type === 'permission' ? '—' : (r.days || 1);
      /* ⚠️ «—» لا زرّ معطّل: المعطّل يوحي بأنه سيعمل لو ضُغط بقوة */
      const acts = canAct(r)
        ? `<span class="rowacts">
             <button type="button" class="iconbtn iconbtn--ok" data-ok="${i}" aria-label="الموافقة على طلب ${esc(r.employeeName || '')}">${icon('check')}</button>
             <button type="button" class="iconbtn iconbtn--no" data-no="${i}" aria-label="رفض طلب ${esc(r.employeeName || '')}">${icon('x')}</button>
           </span>`
        : '<span class="muted">—</span>';
      return `<tr>
        <td><span class="cellwho">${avatar(r.employeeName, 28).outerHTML}<b>${esc(r.employeeName || '—')}</b></span></td>
        <td>${r.type === 'permission' ? 'استئذان' : 'إجازة'}</td>
        <td>${esc(r.categoryLabel || '—')}</td>
        <td>${esc(when)}</td>
        <td class="num">${esc(String(days))}</td>
        <td>${esc(r.reasonLabel || r.reason || '—')}</td>
        <td>${esc(r.note || '—')}</td>
        <td><span class="pill pill--dot ${esc(r.status)}">${esc(STATUS_AR[r.status] || r.status)}</span></td>
        <td>${acts}</td>
      </tr>`;
    }).join('');

    /* ⚠️ tableWrap لا div.table-wrap: هي التي تسم الأعمدة فيصير الجدول
       بطاقات على الجوال. الحاوية الخام تتركه يتمرّر أفقياً ويُقصّ. */
    const wrap = tableWrap(`<table><thead><tr>
      <th>الموظف</th><th>النوع</th><th>التصنيف</th><th>التاريخ</th>
      <th class="num">الأيام</th><th>السبب</th><th>التفاصيل</th><th>الحالة</th><th></th>
    </tr></thead><tbody>${body}</tbody></table>`);

    /* المعالجات تُربط بعد البناء — الصفّ نصّ، والمعالج لا يُكتب في نصّ */
    wrap.querySelectorAll('[data-ok]').forEach((b) => {
      b.onclick = async () => {
        const r = rows[+b.dataset.ok];
        wrap.querySelectorAll('.iconbtn').forEach((x) => { x.disabled = true; });
        try { await approve(r); toast('تمت الموافقة'); paint(); }
        catch (e) {
          console.error(e); toast('تعذّر تنفيذ الموافقة', 'err');
          wrap.querySelectorAll('.iconbtn').forEach((x) => { x.disabled = false; });
        }
      };
    });
    wrap.querySelectorAll('[data-no]').forEach((b) => {
      b.onclick = () => openReject(rows[+b.dataset.no], paint);
    });
    return wrap;
  }

  draw();
}

