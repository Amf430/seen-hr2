import { el, esc, toast } from '../lib/dom.js';
import { getSettings, getMe } from '../lib/state.js';
import { workingDaysBetween } from '../lib/shifts.js';
import { submitRequest, permOldestDate, permWindowOpen, PERM_BACKDATE_DAYS } from '../lib/requests.js';
import { ymdKsa } from '../lib/dates.js';
import { go } from '../lib/nav.js';
import { card, empty } from '../lib/ui.js';

const approverOptions = () =>
  (getSettings().approvers || []).map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');

export function render(view) {
  const S = getSettings();
  if (!(S.approvers || []).length) {
    view.appendChild(card('', ''));
    view.lastChild.appendChild(empty('لم تُعرَّف جهات اعتماد بعد. تواصل مع الموارد البشرية.', 'gear'));
    return;
  }

  const c = el('div', 'card');
  const tabs = el('div', 'tabs', `
    <button class="active" data-t="permission" type="button">استئذان</button>
    <button data-t="leave" type="button">إجازة</button>`);
  c.appendChild(tabs);
  const host = el('div', '');
  c.appendChild(host);
  view.appendChild(c);

  let type = 'permission';
  const draw = () => { host.innerHTML = ''; host.appendChild(type === 'permission' ? permForm() : leaveForm()); };
  tabs.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      tabs.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      type = b.dataset.t;
      draw();
    };
  });
  draw();
}

function permForm() {
  const S = getSettings();
  /* ⚠️ بتاريخ الرياض لا بتاريخ الجهاز: موظف على منطقة زمنية أخرى كان يرى
     حدّاً أدنى بيوم كامل عن الذي تفرضه القاعدة على الخادم. */
  const today  = ymdKsa();
  const oldest = permOldestDate(today);
  const f = el('div', '');
  f.innerHTML = `
    <div class="form-row">
      <div class="field"><label for="pfCat">نوع الاستئذان</label>
        <select id="pfCat">
          <option value="تأخير عن الدوام">تأخير عن الدوام</option>
          <option value="خروج مبكر">خروج مبكر</option>
        </select></div>
      <div class="field"><label for="pfReason">السبب</label>
        <select id="pfReason">${(S.permissionReasons || []).map((r) =>
          `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="field"><label for="pfDate">التاريخ</label>
        <input id="pfDate" type="date" min="${esc(oldest)}" value="${esc(today)}">
        <div class="help">يُقبل الاستئذان عن يومه وحتى ${PERM_BACKDATE_DAYS} أيام مضت
          (من ${esc(oldest)}). بعدها تُغلق الحالة ويُعتمد التأخير أو الخروج المبكر بدون عذر.</div></div>
      <div class="field"><label for="pfTime">الوقت</label><input id="pfTime" type="time"></div>
    </div>
    <div class="form-row one">
      <div class="field"><label for="pfApprover">جهة الاعتماد (المُستأذَن منه)</label>
        <select id="pfApprover">${approverOptions()}</select></div>
    </div>
    <div class="form-row one">
      <div class="field"><label for="pfNote">ملاحظات (اختياري)</label>
        <textarea id="pfNote" placeholder="تفاصيل إضافية…"></textarea></div>
    </div>
    <button class="btn w-auto" id="pfSubmit" type="button">تقديم طلب الاستئذان</button>`;

  f.querySelector('#pfSubmit').onclick = async (e) => {
    const btn = e.currentTarget;
    const cat = f.querySelector('#pfCat').value;
    const date = f.querySelector('#pfDate').value;
    const time = f.querySelector('#pfTime').value;
    const rId = f.querySelector('#pfReason').value;
    const aId = f.querySelector('#pfApprover').value;
    const note = f.querySelector('#pfNote').value.trim();
    if (!date || !time) { toast('أدخل التاريخ والوقت', 'err'); return; }
    /* ⚠️ يُعاد الحساب على تاريخ اليوم الآن لا على `today` المحفوظ عند بناء
       النموذج: صفحة تُركت مفتوحة ليلاً تعبر منتصف الليل، فتزحف النافذة. */
    if (!permWindowOpen(date)) {
      toast(`أُغلقت نافذة الاستئذان عن ${date} — تُقبل حتى ${PERM_BACKDATE_DAYS} أيام من تاريخه`, 'err');
      return;
    }
    if (!rId) { toast('اختر السبب', 'err'); return; }
    if (!aId) { toast('اختر جهة الاعتماد', 'err'); return; }

    const reason = (S.permissionReasons || []).find((x) => x.id === rId);
    const appr = (S.approvers || []).find((x) => x.id === aId);
    btn.disabled = true; btn.textContent = 'جارٍ التقديم…';
    const ok = await submitRequest({
      type: 'permission', category: cat, categoryLabel: cat, date, time,
      reasonId: rId, reasonLabel: reason?.label || '',
      approverId: aId, approverName: appr?.name || '', note
    });
    if (ok) go('mine');
    else { btn.disabled = false; btn.textContent = 'تقديم طلب الاستئذان'; }
  };
  return f;
}

function leaveForm() {
  const S = getSettings();
  const f = el('div', '');
  f.innerHTML = `
    <div class="form-row">
      <div class="field"><label for="lfType">نوع الإجازة</label>
        <select id="lfType">${(S.leaveTypes || []).map((t) =>
          `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="lfApprover">جهة الاعتماد</label>
        <select id="lfApprover">${approverOptions()}</select></div>
    </div>
    <div class="form-row">
      <div class="field"><label for="lfStart">من تاريخ</label><input id="lfStart" type="date"></div>
      <div class="field"><label for="lfEnd">إلى تاريخ</label><input id="lfEnd" type="date"></div>
    </div>
    <div class="help" id="lfDays"></div>
    <div class="form-row one">
      <div class="field"><label for="lfAtt">رابط مرفق (اختياري — مثل تقرير طبي على Google Drive)</label>
        <input id="lfAtt" type="url" placeholder="https://…">
        <div class="help">روابط https فقط.</div></div>
    </div>
    <div class="form-row one">
      <div class="field"><label for="lfNote">ملاحظات (اختياري)</label><textarea id="lfNote"></textarea></div>
    </div>
    <button class="btn w-auto" id="lfSubmit" type="button">تقديم طلب الإجازة</button>`;

  /* قسم مقدّم الطلب — يحدّد ورديته، فيحدّد أي أيام تُحتسب من رصيده */
  const myDept = () => { const m = getMe(); return m ? m.department : ''; };

  const upd = () => {
    const s = f.querySelector('#lfStart').value, e = f.querySelector('#lfEnd').value;
    if (!s || !e) { f.querySelector('#lfDays').textContent = ''; return; }
    const w = workingDaysBetween(s, e, myDept());
    f.querySelector('#lfDays').textContent =
      `المدة: ${w.days} يوم عمل` + (w.off ? ` (تم استثناء ${w.off} يوم راحة وعطلة رسمية)` : '');

  };
  f.querySelector('#lfStart').onchange = upd;
  f.querySelector('#lfEnd').onchange = upd;

  f.querySelector('#lfSubmit').onclick = async (e) => {
    const btn = e.currentTarget;
    const tId = f.querySelector('#lfType').value;
    const s = f.querySelector('#lfStart').value;
    const en = f.querySelector('#lfEnd').value;
    const aId = f.querySelector('#lfApprover').value;
    const att = f.querySelector('#lfAtt').value.trim();
    const note = f.querySelector('#lfNote').value.trim();

    if (!s || !en) { toast('أدخل تاريخ البداية والنهاية', 'err'); return; }
    if (new Date(en) < new Date(s)) { toast('تاريخ النهاية قبل البداية', 'err'); return; }
    if (!aId) { toast('اختر جهة الاعتماد', 'err'); return; }

    const t = (S.leaveTypes || []).find((x) => x.id === tId);
    const appr = (S.approvers || []).find((x) => x.id === aId);
    const wd = workingDaysBetween(s, en, myDept());
    if (!wd.days) { toast('المدة المختارة كلها أيام راحة أو عطل رسمية', 'err'); return; }

    btn.disabled = true; btn.textContent = 'جارٍ التقديم…';
    const ok = await submitRequest({
      type: 'leave', category: tId, categoryLabel: t?.label || '',
      startDate: s, endDate: en, days: wd.days,
      approverId: aId, approverName: appr?.name || '',
      note, attachmentLink: att, leaveTypeId: tId, deduct: t?.deduct ?? false,
      /* ⚠️ السلسلة تُنسخ من نوع الإجازة وقت التقديم وتُجمَّد على الطلب.
         قراءتها من الإعدادات وقت الاعتماد تعني أن تعديل الإعدادات يغيّر
         مسار طلبات قُدِّمت قبله. نوع بلا سلسلة ⇒ الطلب بلا حقل chain،
         فيسلك المسار القديم حرفياً. */
      ...(Array.isArray(t?.approvalChain) && t.approvalChain.length
        ? { chain: t.approvalChain, step: 0, approvals: [] } : {})
    });
    if (ok) go('mine');
    else { btn.disabled = false; btn.textContent = 'تقديم طلب الإجازة'; }
  };
  return f;
}
