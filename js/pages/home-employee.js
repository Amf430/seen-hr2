import { el, esc } from '../lib/dom.js';
import { getMe, getSettings } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { miniRow } from '../components/request-card.js';
import { ownRequests } from './requests-mine.js';
import { go, rerender } from '../lib/nav.js';
import { saveMyContact, CONTACT_LIMITS } from '../lib/users.js';
import { docsOf, docStatus } from '../lib/documents.js';
import { docsList } from '../components/documents-modal.js';
import { contractDaysLeft } from '../lib/dates.js';
import { card, grid, stat, empty, sectionHead, button, contractCell } from '../lib/ui.js';
import { salaryCertificate, bankLetter, leaveStatement } from '../lib/certificates.js';
import { openModal, toast } from '../lib/dom.js';
import { describeRule } from '../lib/geo.js';

export function render(view) {
  const me = getMe();
  const S = getSettings();

  /* الحضور أولاً — هو ما يفتح الموظف الصفحة لأجله كل صباح */
  attendPanel(view);

  /* رصيد الإجازات */
  const bc = card('رصيد إجازاتي');
  const bg = grid(4);
  const types = (S.leaveTypes || []).filter((t) => t.deduct);
  types.forEach((t) => {
    const bal = (me.balances && me.balances[t.id] != null) ? me.balances[t.id] : t.balance;
    bg.appendChild(stat(bal, t.label, bal <= 0 ? 'r' : bal <= 3 ? 'a' : ''));
  });
  if (!types.length) bg.appendChild(el('p', 'desc', 'لا توجد أرصدة معرّفة.'));
  bc.appendChild(bg);
  view.appendChild(bc);

  /* طلباتي — وزرّ التقديم يعيش هنا بدل بطاقة مستقلة */
  const recent = ownRequests().slice(0, 3);
  const rc = card('');
  rc.appendChild(sectionHead('طلباتي',
    button('تقديم طلب', 'btn sm', () => go('new')),
    recent.length ? button('عرض الكل', 'btn sm ghost', () => go('mine')) : null));
  if (!recent.length) rc.appendChild(empty('لا توجد طلبات بعد', 'inbox'));
  else recent.forEach((r) => rc.appendChild(miniRow(r)));
  view.appendChild(rc);

  /* ── خدماتي الذاتية ──
     الأربعة أدناه كانت تُطلب من موظف الموارد البشرية يدوياً، وكل طلب يستهلك
     منه عشر دقائق. البيانات كلها موجودة في النظام أصلاً. */
  const sc = card('');
  sc.appendChild(sectionHead({ text: 'خدماتي الذاتية', icon: 'doc' }));
  sc.appendChild(el('p', 'desc',
    'تُفتح في نافذة جديدة جاهزة للطباعة أو الحفظ كـ PDF من المتصفح.'));
  const svcBar = el('div', 'btn-bar');
  const openOr = (fn) => () => { if (!fn()) toast('اسمح بالنوافذ المنبثقة لهذا الموقع', 'err'); };
  svcBar.append(
    button('تعريف بالراتب', 'btn sm ghost', openOr(() => salaryCertificate(me)), 'doc'),
    button('خطاب تعريف للبنك', 'btn sm ghost', () => askBank(me), 'doc'),
    button('كشف أرصدة إجازاتي', 'btn sm ghost', openOr(() => leaveStatement(me)), 'list'),
    button('تحديث بيانات اتصالي', 'btn sm ghost', () => editContact(me), 'people')
  );
  sc.appendChild(svcBar);
  if (!me.salary) sc.appendChild(el('p', 'help',
    'راتبك غير مُحدَّد في النظام بعد — سيظهر فارغاً في التعريف. راجع الموارد البشرية.'));
  view.appendChild(sc);

  /* ── مستنداتي ──
     يراها ولا يعدّلها: تعديلها بيد الأدمن لأن إخفاء انتهاء إقامة يغرّم الشركة.
     الفائدة له أن يعرف قبل أن يُفاجأ. */
  const myDocs = docsOf(me);
  if (myDocs.length) {
    const dc = card('');
    dc.appendChild(sectionHead({ text: 'مستنداتي', icon: 'doc' }));
    dc.appendChild(docsList(me, { compact: true }));
    const bad = myDocs.map(docStatus).filter((s) => s.state === 'expired' || s.state === 'soon');
    if (bad.length) dc.appendChild(el('p', 'help',
      'راجع الموارد البشرية لتجديد ما قارب انتهاؤه — التجديد يبدأ قبل الانتهاء بمدّة.'));
    view.appendChild(dc);
  }

  /* بطاقتي الوظيفية */
  const dl = contractDaysLeft(me.contractEnd);
  const ic = card('بطاقتي الوظيفية');
  ic.innerHTML += `
    <div class="detail-list">
      <div class="detail-line"><span class="k">الرقم الوظيفي</span><span class="v num">${esc(me.empId || '—')}</span></div>
      <div class="detail-line"><span class="k">القسم</span><span class="v">${esc(me.department || '—')}</span></div>
      <div class="detail-line"><span class="k">المسمى الوظيفي</span><span class="v">${esc(me.jobTitle || '—')}</span></div>
      <div class="detail-line"><span class="k">المدير المباشر</span><span class="v">${esc(me.manager || '—')}</span></div>
      <div class="detail-line"><span class="k">تاريخ المباشرة</span><span class="v num">${esc(me.hireDate || '—')}</span></div>
      <div class="detail-line"><span class="k">انتهاء العقد</span><span class="v">${contractCell(me.contractEnd)}</span></div>
      <div class="detail-line"><span class="k">تسجيل الحضور</span><span class="v">${esc(describeRule(me))}</span></div>
      <div class="detail-line"><span class="k">جوال الدخول</span><span class="v num">${esc(me.phone || '—')}</span></div>
      <div class="detail-line"><span class="k">البريد الشخصي</span><span class="v">${esc(me.personalEmail || '—')}</span></div>
      <div class="detail-line"><span class="k">العنوان</span><span class="v">${esc(me.address || '—')}</span></div>
      <div class="detail-line"><span class="k">شخص الطوارئ</span><span class="v">${
        me.emergencyName || me.emergencyPhone
          ? esc([me.emergencyName, me.emergencyPhone].filter(Boolean).join(' — '))
          : '—'}</span></div>
    </div>`;
  if (dl !== null && dl >= 0 && dl <= 60) {
    ic.appendChild(el('p', 'help', `عقدك ينتهي خلال ${dl} يوم — راجع الموارد البشرية.`));
  }
  view.appendChild(ic);
}


/* ── تحديث بيانات الاتصال ──
   أكثر أربعة حقول تقادماً في أي نظام موارد بشرية، وكلها لا تخصّ أحداً غير
   صاحبها. القاعدة تسمح للموظف بها وحدها على وثيقته.

   ⚠️ رقم الجوال ليس هنا: هو اسم المستخدم الذي يدخل به، وتغييره يحتاج تغييراً
   مقابلاً في حساب المصادقة لا تقدر عليه الواجهة. يُعرض للقراءة مع إشارة
   لمن يراجعه. */
function editContact(me) {
  const m = openModal(`
    <h3>تحديث بيانات اتصالي</h3>
    <div class="field">
      <label for="ctEmail">البريد الإلكتروني الشخصي</label>
      <input id="ctEmail" type="email" maxlength="${CONTACT_LIMITS.personalEmail}"
             value="${esc(me.personalEmail || '')}" placeholder="name@example.com" autocomplete="email">
    </div>
    <div class="field">
      <label for="ctAddr">عنوان السكن</label>
      <input id="ctAddr" maxlength="${CONTACT_LIMITS.address}"
             value="${esc(me.address || '')}" placeholder="المدينة — الحي" autocomplete="street-address">
    </div>
    <div class="field">
      <label for="ctEmName">اسم شخص للطوارئ</label>
      <input id="ctEmName" maxlength="${CONTACT_LIMITS.emergencyName}"
             value="${esc(me.emergencyName || '')}" placeholder="الاسم وصلة القرابة" autocomplete="off">
    </div>
    <div class="field">
      <label for="ctEmPhone">جوال شخص الطوارئ</label>
      <input id="ctEmPhone" inputmode="numeric" maxlength="${CONTACT_LIMITS.emergencyPhone}"
             value="${esc(me.emergencyPhone || '')}" placeholder="05xxxxxxxx" autocomplete="off">
      <div class="help">جوالك للدخول (${esc(me.phone || '—')}) يغيّره الأدمن وحده —
        لأنه اسم المستخدم الذي تسجّل به الدخول.</div>
    </div>
    <div class="err" id="ctErr" role="alert"></div>
    <div class="row">
      <button class="btn ghost" id="ctCancel">تراجع</button>
      <button class="btn" id="ctSave">حفظ</button>
    </div>`);

  m.$('#ctCancel').onclick = m.close;
  m.$('#ctSave').onclick = async () => {
    const email = m.$('#ctEmail').value.trim();
    const err = m.$('#ctErr');
    /* تحقّق واحد فقط: بريد مكتوب بصيغة خاطئة يُكتشف الآن لا بعد أن يفشل
       إرسال إليه لاحقاً. البقية نصّ حرّ لا صيغة له. */
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      err.textContent = 'صيغة البريد الإلكتروني غير صحيحة';
      return;
    }
    const btn = m.$('#ctSave');
    btn.disabled = true;
    try {
      await saveMyContact({
        personalEmail:  email,
        address:        m.$('#ctAddr').value,
        emergencyName:  m.$('#ctEmName').value,
        emergencyPhone: m.$('#ctEmPhone').value
      });
      m.close();
      toast('حُدِّثت بياناتك');
      rerender();
    } catch (e) {
      btn.disabled = false;
      err.textContent = 'تعذّر الحفظ — تحقّق من اتصالك وأعد المحاولة';
    }
  };
}

/* اسم البنك يُطبع في الخطاب، فيُسأل عنه بدل تركه «إلى من يهمه الأمر» */
function askBank(me) {
  const m = openModal(`
    <h3>خطاب تعريف للبنك</h3>
    <div class="field">
      <label for="blName">اسم البنك (اختياري)</label>
      <input id="blName" placeholder="مثال: مصرف الراجحي" autocomplete="off">
      <div class="help">اتركه فارغاً ليُكتب «إلى من يهمه الأمر».</div>
    </div>
    <div class="row">
      <button class="btn ghost" id="blCancel">تراجع</button>
      <button class="btn" id="blOk">إصدار الخطاب</button>
    </div>`);
  m.$('#blCancel').onclick = m.close;
  m.$('#blOk').onclick = () => {
    const ok = bankLetter(me, m.$('#blName').value.trim());
    m.close();
    if (!ok) toast('اسمح بالنوافذ المنبثقة لهذا الموقع', 'err');
  };
}
