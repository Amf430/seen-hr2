/* ═══════════════════════════════════════════════════════════════════════════
   ملفي الوظيفي — ما يخصّ الموظف من بيانات.

   ── لماذا فُصلت عن الرئيسية ──
   كانت الرئيسية تحمل ستة أقسام: الحضور، الرصيد، الطلبات، الخدمات، المستندات،
   والبطاقة الوظيفية. الموظف يفتحها كل صباح لسبب واحد — تسجيل حضوره — فيمرّ
   على خمسة أقسام لا يريدها ليصل إليه.

   والقائمة الجانبية كانت تعرض له أربعة روابط فقط، فيبدو النظام أضيق مما هو
   بينما نصف ما بُني له مدفون داخل صفحة واحدة.

   التقسيم هنا بحسب نيّة الموظف لا نوع المحتوى:
     هذه الصفحة  : بياناتي — أقرؤها وأصحّح ما يخصّني منها
     my-services : أوراق أطلبها وأطبعها
     الرئيسية    : ما أفتحه يومياً

   ⚠️ ما يعدّله الموظف هنا محدود بأربعة حقول تفرضها قاعدة users، وليست
   الواجهة. `phone` ليس منها: هو هوية الدخول (انظر CONTACT_LIMITS في
   users.js).
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, openModal, toast } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { contractDaysLeft } from '../lib/dates.js';
import { describeRule } from '../lib/geo.js';
import { managerOf } from '../lib/org.js';
import { getUsers } from '../lib/state.js';
import { card, grid, stat, sectionHead, button, contractCell, callout } from '../lib/ui.js';
import { saveMyContact, CONTACT_LIMITS } from '../lib/users.js';
import { docsOf, docStatus } from '../lib/documents.js';
import { docsList } from '../components/documents-modal.js';
import { rerender, go } from '../lib/nav.js';
import { roleLabel } from '../lib/perms.js';

export function render(view) {
  const me = getMe();

  /* ── ترويسة الهوية ──
     نفس شكل بروفايل الأدمن للموظف، فيرى نفسه كما يراه النظام. */
  const hd = el('div', 'hero-card');
  hd.innerHTML = `
    <div class="row-between">
      <div>
        <div class="hero-card__name">${esc(me.name || '—')}</div>
        <div class="hero-card__meta">${esc(me.jobTitle || '—')} · ${esc(me.department || 'بلا قسم')} · الرقم الوظيفي ${esc(me.empId || '—')}</div>
        <div class="hero-card__sub num">${esc(me.phone || '')}</div>
      </div>
      <div class="text-start">
        <span class="pill pill--dot ${me.status === 'active' ? 'active' : 'suspended'}">${
          me.status === 'active' ? 'نشط' : 'موقوف'}</span>
        <div class="hero-card__sub">${esc(roleLabel(me))}</div>
      </div>
    </div>`;
  view.appendChild(hd);

  /* ── نظرة سريعة ── */
  const dl = contractDaysLeft(me.contractEnd);
  const bad = docsOf(me).map(docStatus).filter((s) => s.state === 'expired' || s.state === 'soon');
  const sc = card('');
  const sg = grid(3);
  sg.append(
    stat(me.hireDate || '—', 'تاريخ المباشرة'),
    stat(me.contractEnd || '—', 'انتهاء العقد' + (dl !== null ? ` · ${dl < 0 ? 'منتهٍ' : dl + ' يوم'}` : ''),
      dl !== null && dl < 0 ? 'r' : (dl !== null && dl <= 60 ? 'a' : '')),
    stat(docsOf(me).length, 'مستنداتي', bad.length ? 'a' : '')
  );
  sc.appendChild(sg);
  view.appendChild(sc);

  /* ── بيانات التعاقد ──
     ⚠️ لا راتب هنا. الموظف يرى راتبه في «تعريف بالراتب» من صفحة الخدمات،
     وهي وثيقة يطلبها قصداً — لا رقم يقع عليه بصره كلما فتح ملفه في مكتب
     مفتوح. */
  const boss = managerOf(me, getUsers());
  const ic = card('');
  ic.appendChild(sectionHead({ text: 'بطاقتي الوظيفية', icon: 'people' }));
  ic.innerHTML += `
    <div class="detail-list">
      <div class="detail-line"><span class="k">الرقم الوظيفي</span><span class="v num">${esc(me.empId || '—')}</span></div>
      <div class="detail-line"><span class="k">القسم</span><span class="v">${esc(me.department || '—')}</span></div>
      <div class="detail-line"><span class="k">المسمى الوظيفي</span><span class="v">${esc(me.jobTitle || '—')}</span></div>
      <div class="detail-line"><span class="k">المدير المباشر</span><span class="v">${
        esc(boss ? boss.name : (me.manager || '—'))}</span></div>
      <div class="detail-line"><span class="k">تاريخ المباشرة</span><span class="v num">${esc(me.hireDate || '—')}</span></div>
      <div class="detail-line"><span class="k">انتهاء العقد</span><span class="v">${contractCell(me.contractEnd)}</span></div>
      <div class="detail-line"><span class="k">تسجيل الحضور</span><span class="v">${esc(describeRule(me))}</span></div>
    </div>`;
  if (dl !== null && dl >= 0 && dl <= 60) {
    ic.appendChild(el('p', 'help', `عقدك ينتهي خلال ${dl} يوم — راجع الموارد البشرية.`));
  }
  view.appendChild(ic);

  /* ── بيانات الاتصال ── */
  const cc = card('');
  cc.appendChild(sectionHead({ text: 'بيانات الاتصال', icon: 'inbox' },
    button('تحديث', 'btn sm', () => editContact(me), 'gear')));
  cc.innerHTML += `
    <div class="detail-list">
      <div class="detail-line"><span class="k">جوال الدخول</span><span class="v num">${esc(me.phone || '—')}</span></div>
      <div class="detail-line"><span class="k">البريد الشخصي</span><span class="v">${esc(me.personalEmail || '—')}</span></div>
      <div class="detail-line"><span class="k">العنوان</span><span class="v">${esc(me.address || '—')}</span></div>
      <div class="detail-line"><span class="k">شخص الطوارئ</span><span class="v">${
        me.emergencyName || me.emergencyPhone
          ? esc([me.emergencyName, me.emergencyPhone].filter(Boolean).join(' — '))
          : '—'}</span></div>
    </div>`;
  cc.appendChild(el('p', 'help',
    'جوال الدخول يغيّره الأدمن وحده — هو اسم المستخدم الذي تسجّل به الدخول.'));
  view.appendChild(cc);

  /* ── مستنداتي ──
     يراها ولا يعدّلها: من يقدر يعدّل تاريخ انتهاء إقامته يقدر يخفيه،
     والغرامة على الشركة لا عليه. */
  const dc = card('');
  dc.appendChild(sectionHead({ text: 'مستنداتي', icon: 'doc' }));
  dc.appendChild(docsList(me));
  if (bad.length) {
    dc.appendChild(callout('warn', `${bad.length} مستند يحتاج تجديداً`,
      'راجع الموارد البشرية — التجديد يبدأ قبل الانتهاء بمدّة.'));
  }
  view.appendChild(dc);

  const nav = el('div', 'btn-bar');
  nav.append(
    button('خدماتي', 'btn sm ghost', () => go('services'), 'doc'),
    button('طلباتي', 'btn sm ghost', () => go('mine'), 'list')
  );
  view.appendChild(nav);
}

/* ── تحديث بيانات الاتصال ──
   أكثر أربعة حقول تقادماً في أي نظام موارد بشرية، وكلها لا تخصّ أحداً غير
   صاحبها. القاعدة تسمح للموظف بها وحدها على وثيقته. */
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
