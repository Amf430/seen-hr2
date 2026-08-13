/* ═══════════════════════════════════════════════════════════════════════════
   نوافذ المراجعة — رفض، إلغاء موافقة، سحب طلب.
   كانت مكرّرة بنفس البنية ثلاث مرات في الملف القديم.
   ═══════════════════════════════════════════════════════════════════════════ */

import { openModal, toast, esc } from '../lib/dom.js';
import { reject, revokeApproval, withdraw } from '../lib/requests.js';

/* نافذة تطلب سبباً نصياً إلزامياً ثم تنفّذ */
function reasonModal({ title, help, placeholder, confirmLabel, busyLabel, run }) {
  const m = openModal(`
    <h3>${esc(title)}</h3>
    ${help ? `<div class="help">${help}</div>` : ''}
    <div class="field">
      <label for="rmReason">السبب (يظهر للموظف) *</label>
      <textarea id="rmReason" placeholder="${esc(placeholder)}"></textarea>
    </div>
    <div class="err" id="rmErr"></div>
    <div class="row">
      <button class="btn ghost" id="rmCancel">تراجع</button>
      <button class="btn danger" id="rmOk">${esc(confirmLabel)}</button>
    </div>`);

  m.$('#rmCancel').onclick = m.close;
  m.$('#rmOk').onclick = async () => {
    const reason = m.$('#rmReason').value.trim();
    if (!reason) { m.$('#rmErr').textContent = 'اكتب السبب أولاً'; m.$('#rmReason').focus(); return; }
    const btn = m.$('#rmOk');
    btn.disabled = true; btn.textContent = busyLabel;
    try { await run(reason); m.close(); }
    catch (e) {
      console.error(e);
      m.$('#rmErr').textContent = 'تعذّر التنفيذ — تحقّق من الإنترنت وحاول مرة ثانية';
      btn.disabled = false; btn.textContent = confirmLabel;
    }
  };
}

/* onDone اختيارية: تُستدعى بعد نجاح الرفض ليحدّث المستدعي عرضه في مكانه.
   المستدعون القدامى يمرّرون معاملاً واحداً ويعملون كما هم. */
export function openReject(r, onDone) {
  reasonModal({
    title: 'رفض الطلب',
    placeholder: 'اكتب سبب الرفض…',
    confirmLabel: 'تأكيد الرفض',
    busyLabel: 'جارٍ الرفض…',
    run: async (reason) => { await reject(r, reason); onDone?.(); }
  });
}

export function openRevoke(r) {
  const returnsBalance = r.type === 'leave' && r.deduct;
  reasonModal({
    title: 'إلغاء الموافقة',
    help: `سيتحول الطلب إلى «مرفوض»${returnsBalance ? '، ويُعاد عدد أيامه المخصومة فوراً لرصيد الموظف' : ''}.`,
    placeholder: 'اكتب سبب إلغاء الموافقة…',
    confirmLabel: 'تأكيد إلغاء الموافقة',
    busyLabel: 'جارٍ التنفيذ…',
    run: (reason) => revokeApproval(r, reason)
  });
}

export function openWithdraw(r) {
  const m = openModal(`
    <h3>إلغاء الطلب</h3>
    <div class="help">سيظل الطلب ظاهراً في سجلك بحالة «ملغي».</div>
    <div class="row">
      <button class="btn ghost" id="wdCancel">تراجع</button>
      <button class="btn danger" id="wdOk">تأكيد الإلغاء</button>
    </div>`);
  m.$('#wdCancel').onclick = m.close;
  m.$('#wdOk').onclick = async () => {
    m.$('#wdOk').disabled = true;
    await withdraw(r);
    m.close();
  };
}

/* تأكيد نصّي: يجب كتابة كلمة بعينها — للإجراءات التي لا رجعة فيها */
export function openTypedConfirm({ title, body, phrase, confirmLabel, run }) {
  const m = openModal(`
    <h3>${esc(title)}</h3>
    <div class="callout callout--danger">${body}</div>
    <div class="field">
      <label for="tcInput">للتأكيد اكتب «${esc(phrase)}»</label>
      <input id="tcInput" autocomplete="off" placeholder="${esc(phrase)}">
    </div>
    <div class="err" id="tcErr"></div>
    <div class="row">
      <button class="btn ghost" id="tcCancel">تراجع</button>
      <button class="btn danger" id="tcOk" disabled>${esc(confirmLabel)}</button>
    </div>`);

  const input = m.$('#tcInput'), ok = m.$('#tcOk');
  input.oninput = () => { ok.disabled = input.value.trim() !== phrase; };
  m.$('#tcCancel').onclick = m.close;
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = 'جارٍ التنفيذ…';
    try { await run(); m.close(); }
    catch (e) {
      console.error(e);
      m.$('#tcErr').textContent = 'تعذّر إكمال العملية';
      ok.disabled = false; ok.textContent = confirmLabel;
    }
  };
}

export { toast };
