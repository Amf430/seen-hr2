/* ═══════════════════════════════════════════════════════════════════════════
   سياسة الإجازات — ضبط المستحقّ والاستحقاق التدريجي (المرحلة ٨)

   ⚠️⚠️ شرط المالك المكتوب، وهو ملزم: **لا تُطبَّق أي سياسة ولا ترحيل رصيد
   قبل عرض جدول معاينة يقارن رصيد كل موظف قبل وبعد.** كل زرّ تطبيق في هذه
   الصفحة يمرّ بالمعاينة أولاً، بلا استثناء وبلا مسار مختصر.

   ⚠️ ولا ترحيل تلقائي في الخلفية إطلاقاً. إسقاط أيام إجازة من رصيد إنسان
   قرارٌ يضغطه أدمن بعد أن يرى أثره بالاسم والرقم.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast, openModal, confirmAction } from '../../lib/dom.js';
import { getSettings, getUsers } from '../../lib/state.js';
import { updateEmployee, refreshUsers } from '../../lib/users.js';
import { logAction } from '../../lib/audit.js';
import { leaveBalanceOf, migrationPreview, previewHasChanges,
         carryOverPreview, policyFor } from '../../lib/leave-balance.js';
import { isStale } from '../../lib/nav.js';
import { card, empty, tableWrap, sectionHead, button, callout, grid, stat, loading } from '../../lib/ui.js';

/* ⚠️ async و await refreshUsers() قبل أي رسم — نمط departments.js و
   employees.js. الصفحة كانت متزامنة تقرأ getUsers() فوراً، فعلى تحميل بارد
   (فتح الرابط مباشرة أو إعادة تحميل) تُرسم قبل وصول الموظفين فتعرض «٠ موظف»
   وجدول معاينة فارغاً — والأدمن يقرأ ذلك «لا أحد يتأثر» ويطبّق بثقة.

   اكتُشف بإعادة تحميل الصفحة في المتصفح؛ التنقّل إليها من القائمة كان يخفيه
   لأن الموظفين يكونون محمَّلين أصلاً. */
export async function render(view, token) {
  const S = getSettings();
  const types = (S.leaveTypes || []).filter((t) => t.deduct);

  const head = card('سياسة الإجازات', null, 'calendar',
    'المستحقّ السنوي لكل موظف وطريقة استحقاقه. الرصيد يُشتقّ من السياسة والمستهلك، ولا يُخزَّن رقماً مجرَّداً.');
  view.appendChild(head);

  if (!types.length) {
    view.appendChild(el('div', 'card',
      '<div class="empty">لا أنواع إجازات خاصمة — عرّفها من «أنواع الطلبات والاعتمادات».</div>'));
    return;
  }

  view.appendChild(callout('info', 'لا شيء يُكتب قبل أن ترى الجدول',
    'كل تطبيق في هذه الصفحة يعرض أولاً مقارنة «قبل / بعد» لكل موظف. راجعها ثم قرّر.'));

  const host = el('div', '');
  host.appendChild(loading('جارٍ تحميل الموظفين…'));
  view.appendChild(host);

  try { await refreshUsers(); } catch (e) { console.error('leave-policy', e); }
  if (isStale(token)) return;

  function draw() {
    host.innerHTML = '';
    const staff = getUsers().filter((u) => u.role !== 'admin');

    /* ── الحالة الآن ── */
    const prev = migrationPreview(staff, types, new Date());
    const changed = prev.filter((p) => p.rows.some((r) => r.delta !== 0));

    const sum = card('');
    sum.appendChild(sectionHead({ text: 'الحالة الآن', icon: 'chart' }));
    const g = grid(3);
    g.append(
      stat(String(staff.length), 'موظف'),
      stat(String(staff.filter((u) => u.leavePolicy).length), 'له سياسة مضبوطة'),
      stat(String(changed.length), 'سيتغيّر رصيده', changed.length ? 'a' : 'ok')
    );
    sum.appendChild(g);
    sum.appendChild(el('p', 'help', changed.length
      ? 'هؤلاء رصيدهم المعروض اليوم يختلف عمّا يعطيه النموذج الجديد. افتح المعاينة قبل أي تطبيق.'
      : '⚠️ لا فروق: تطبيق النموذج الجديد الآن لا يغيّر رصيد أحد.'));
    sum.appendChild(button('معاينة قبل / بعد لكل موظف', 'btn sm', () => openPreview(prev)));
    host.appendChild(sum);

    /* ── السياسة الافتراضية على مستوى الشركة ── */
    const dc = card('');
    dc.appendChild(sectionHead({ text: 'السياسة الافتراضية للشركة', icon: 'gear' }));
    dc.appendChild(el('p', 'desc',
      'تُطبَّق على من لا سياسة خاصة له. تعديلها لا يكتب شيئاً على الموظفين — يُغيّر ما يُشتقّ لهم.'));
    const dw = tableWrap(`
      <table class="tight">
        <thead><tr><th>نوع الإجازة</th><th class="num">المستحقّ السنوي</th>
          <th class="num">الاستحقاق</th><th class="num">سقف الترحيل</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const dtb = dw.querySelector('tbody');
    types.forEach((t) => {
      const pol = (S.leavePolicyDefaults || {})[t.id] || {};
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(t.label)}</b></td>
        <td class="num">${esc(pol.annualDays != null ? pol.annualDays : t.balance)}</td>
        <td class="num cell-sub">${esc(modeAr(pol.accrualMode || 'none'))}</td>
        <td class="num">${esc(pol.carryOverMax || 0)}</td>`;
      const td = el('td', '');
      td.appendChild(button('ضبط', 'btn sm ghost', () => openDefault(t, pol)));
      tr.appendChild(td);
      dtb.appendChild(tr);
    });
    dc.appendChild(dw);
    host.appendChild(dc);

    /* ── لكل موظف ── */
    const ec = card('');
    ec.appendChild(sectionHead({ text: 'الموظفون', icon: 'people' }));
    const ew = tableWrap(`
      <table class="tight">
        <thead><tr><th>الموظف</th><th>القسم</th>
          ${types.map((t) => `<th class="num">${esc(t.label)}</th>`).join('')}
          <th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const etb = ew.querySelector('tbody');
    staff.forEach((u) => {
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(u.name)}</b>${u.leavePolicy ? '' : ' <span class="cell-sub">(افتراضية)</span>'}</td>
        <td>${esc(u.department || '—')}</td>
        ${types.map((t) => {
          const b = leaveBalanceOf(u, t, new Date());
          return `<td class="num"><b>${esc(b.remaining)}</b>
            <div class="cell-sub">${esc(b.used)} مستهلك</div></td>`;
        }).join('')}`;
      const td = el('td', '');
      td.appendChild(button('السياسة', 'btn sm ghost', () => openForUser(u)));
      tr.appendChild(td);
      etb.appendChild(tr);
    });
    ec.appendChild(ew);
    host.appendChild(ec);

    /* ── الترحيل السنوي ── */
    const cc = card('');
    cc.appendChild(sectionHead({ text: 'الترحيل لنهاية السنة', icon: 'archive' }));
    cc.appendChild(el('p', 'desc',
      'يُطبَّق في ١ يناير عادةً. النظام لا ينفّذه تلقائياً أبداً — تضغطه أنت بعد المعاينة.'));
    cc.appendChild(button('معاينة الترحيل', 'btn sm', () => openCarryPreview(staff)));
    host.appendChild(cc);
  }

  const modeAr = (m) => m === 'monthly' ? 'تدريجي شهري' : m === 'annual' ? 'دفعة سنوية' : 'ثابت';

  /* ═══ المعاينة الإلزامية ═══ */
  /* ⚠️ النافذة الافتراضية ٥٢٠px والجدول ٧٦٠px، فأعمدة «قبل/بعد/الفرق» تقع
     خلف تمرير أفقي — وهي كل الغرض من المعاينة. اكتُشف بفتحها في المتصفح:
     البيانات كلها صحيحة في الـDOM، والأدمن لا يراها. `.modal--lg` موجودة في
     css/03-components.css منذ البداية ولم تكن مستعمَلة. */
  const widen = (m) => m.modal.classList.add('modal--lg');

  function openPreview(prev) {
    const rowsHtml = prev.map((p) => p.rows.map((r, i) => `
      <tr class="${r.delta !== 0 ? 'row-alt' : ''}">
        ${i === 0 ? `<td rowspan="${p.rows.length}"><b>${esc(p.name)}</b>
          <div class="cell-sub">${esc(p.department)}</div></td>` : ''}
        <td>${esc(r.label)}</td>
        <td class="num">${esc(r.before)}</td>
        <td class="num">${esc(r.after)}</td>
        <td class="num ${r.delta > 0 ? 'text-green' : r.delta < 0 ? 'text-red' : 'text-muted'}">
          ${r.delta > 0 ? '+' : ''}${esc(r.delta)}</td>
      </tr>`).join('')).join('');

    widen(openModal(`
      <h3>معاينة: رصيد كل موظف قبل وبعد</h3>
      ${previewHasChanges(prev)
        ? '<div class="callout callout--warn"><b>فيه فروق.</b><div class="help">راجع العمود الأخير قبل أي تطبيق — الرقم الأحمر يعني رصيداً ينقص.</div></div>'
        : '<div class="callout callout--info"><b>لا فروق إطلاقاً.</b><div class="help">النموذج الجديد يعطي نفس الأرقام المعروضة اليوم.</div></div>'}
      <div class="table-wrap"><table class="tight">
        <thead><tr><th>الموظف</th><th>النوع</th><th class="num">قبل</th>
          <th class="num">بعد</th><th class="num">الفرق</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
      <p class="help">هذه معاينة فقط — لم يُكتب شيء.</p>
      <div class="row"><button class="btn" onclick="this.closest('.overlay').remove()">إغلاق</button></div>`));
  }

  /* ═══ السياسة الافتراضية ═══ */
  function openDefault(t, pol) {
    const m = policyModal(`السياسة الافتراضية — ${t.label}`, pol, t);
    m.$('#lpOk').onclick = async () => {
      const next = readPolicy(m);
      S.leavePolicyDefaults = { ...(S.leavePolicyDefaults || {}), [t.id]: next };
      const { saveSettings } = await import('../../lib/settings.js');
      await saveSettings(['leavePolicyDefaults']);
      await logAction('ضبط سياسة إجازات', `${t.label} — افتراضية`);
      m.close(); draw(); toast('حُفظت السياسة الافتراضية', 'ok');
    };
  }

  /* ═══ سياسة موظف بعينه ═══ */
  function openForUser(u) {
    const rows = types.map((t) => {
      const pol = policyFor(u, t);
      const b = leaveBalanceOf(u, t, new Date());
      return `<tr>
        <td><b>${esc(t.label)}</b></td>
        <td class="num">${esc(pol.annualDays)}</td>
        <td class="num">${esc(pol.openingBalance)}</td>
        <td class="num">${esc(modeAr(pol.accrualMode))}</td>
        <td class="num"><b>${esc(b.remaining)}</b></td></tr>`;
    }).join('');

    const m = openModal(`
      <h3>سياسة إجازات ${esc(u.name)}</h3>
      <div class="table-wrap"><table class="tight">
        <thead><tr><th>النوع</th><th class="num">المستحقّ</th><th class="num">مرحَّل</th>
          <th class="num">الاستحقاق</th><th class="num">المتبقّي</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="field"><label for="lpType">عدّل نوعاً</label>
        <select id="lpType">${types.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></div>
      <div class="row">
        <button class="btn ghost" id="lpClose">إغلاق</button>
        <button class="btn" id="lpEdit">عدّل هذا النوع</button>
      </div>`);
    m.$('#lpClose').onclick = m.close;
    m.$('#lpEdit').onclick = () => {
      const t = types.find((x) => x.id === m.$('#lpType').value);
      m.close();
      openUserType(u, t);
    };
  }

  function openUserType(u, t) {
    const pol = policyFor(u, t);
    const m = policyModal(`${u.name} — ${t.label}`, pol, t, true);
    m.$('#lpOk').onclick = async () => {
      const next = readPolicy(m);
      const before = leaveBalanceOf(u, t, new Date()).remaining;
      const after  = leaveBalanceOf({ ...u, leavePolicy: { ...(u.leavePolicy || {}), [t.id]: next } },
                                    t, new Date()).remaining;
      /* ⚠️ حتى تعديل موظف واحد يمرّ بمعاينة — الأدمن يخطئ أيضاً، والفرق
         بين ٢١ و٢٫١ خطأ لوحة مفاتيح واحد. */
      const reason = m.$('#lpReason').value.trim();
      if (!reason) { m.$('#lpErr').textContent = 'اكتب سبب التعديل — يُسجَّل في سجل الحركات'; return; }
      const ok = await confirmAction({
        title: 'تأكيد التعديل',
        body: `<b>${esc(u.name)} — ${esc(t.label)}</b><br><br>
          الرصيد المتبقّي: <b>${before}</b> ← <b>${after}</b>
          ${after !== before ? `<span class="${after < before ? 'text-red' : 'text-green'}">
            (${after > before ? '+' : ''}${Math.round((after - before) * 2) / 2})</span>` : ' (بلا تغيير)'}
          <div class="help">السبب: ${esc(reason)}</div>`,
        confirmLabel: 'طبّق التعديل', danger: after < before
      });
      if (!ok) return;
      try {
        await updateEmployee(u.id, { leavePolicy: { ...(u.leavePolicy || {}), [t.id]: next } });
        await logAction('تعديل سياسة إجازة', `${u.name} — ${t.label} — ${reason}`);
        m.close(); draw(); toast('طُبّقت السياسة', 'ok');
      } catch (e) { console.error(e); m.$('#lpErr').textContent = 'تعذّر الحفظ'; }
    };
  }

  function policyModal(title, pol, t, withReason = false) {
    return openModal(`
      <h3>${esc(title)}</h3>
      <div class="form-row">
        <div class="field"><label for="lpAnnual">المستحقّ السنوي (يوم)</label>
          <input id="lpAnnual" type="number" min="0" step="0.5"
            value="${esc(pol.annualDays != null ? pol.annualDays : (t.balance || 0))}"></div>
        <div class="field"><label for="lpOpen">الرصيد الافتتاحي (مرحَّل)</label>
          <input id="lpOpen" type="number" step="0.5" value="${esc(pol.openingBalance || 0)}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="lpMode">طريقة الاستحقاق</label>
          <select id="lpMode">
            <option value="none"${(pol.accrualMode || 'none') === 'none' ? ' selected' : ''}>ثابت — الرصيد كما هو</option>
            <option value="monthly"${pol.accrualMode === 'monthly' ? ' selected' : ''}>تدريجي شهري</option>
            <option value="annual"${pol.accrualMode === 'annual' ? ' selected' : ''}>دفعة واحدة سنوياً</option>
          </select>
          <div class="help">«تدريجي» يمنح جزءاً من المستحقّ كل شهر مكتمل من تاريخ المباشرة.</div></div>
        <div class="field"><label for="lpCarry">سقف الترحيل للسنة التالية</label>
          <input id="lpCarry" type="number" min="0" step="0.5" value="${esc(pol.carryOverMax || 0)}">
          <div class="help">صفر = لا ترحيل.</div></div>
      </div>
      <div class="field"><label for="lpStart">بداية الاستحقاق (اختياري)</label>
        <input id="lpStart" type="date" value="${esc(pol.accrualStart || '')}">
        <div class="help">اتركه فارغاً ليُحسب من تاريخ المباشرة.</div></div>
      ${withReason ? `<div class="field"><label for="lpReason">سبب التعديل *</label>
        <input id="lpReason" placeholder="يُسجَّل في سجل الحركات"></div>` : ''}
      <div class="err" id="lpErr"></div>
      <div class="row">
        <button class="btn ghost" id="lpCancel">إلغاء</button>
        <button class="btn" id="lpOk">${withReason ? 'معاينة ثم تطبيق' : 'حفظ'}</button>
      </div>`);
  }

  const readPolicy = (m) => ({
    annualDays:     Number(m.$('#lpAnnual').value) || 0,
    openingBalance: Number(m.$('#lpOpen').value) || 0,
    accrualMode:    m.$('#lpMode').value,
    accrualStart:   m.$('#lpStart').value || '',
    carryOverMax:   Number(m.$('#lpCarry').value) || 0
  });

  /* ═══ معاينة الترحيل ═══ */
  function openCarryPreview(staff) {
    const rows = staff.map((u) => types.map((t) => {
      const c = carryOverPreview(u, t, new Date());
      if (!c.before && !c.dropped) return '';
      return `<tr>
        <td><b>${esc(u.name)}</b></td><td>${esc(t.label)}</td>
        <td class="num">${esc(c.before)}</td>
        <td class="num text-green">${esc(c.carried)}</td>
        <td class="num ${c.dropped ? 'text-red' : 'text-muted'}">${esc(c.dropped)}</td>
        <td class="num cell-sub">${esc(c.carryOverMax)}</td></tr>`;
    }).join('')).join('');

    widen(openModal(`
      <h3>معاينة الترحيل — لم يُنفَّذ شيء</h3>
      <div class="callout callout--warn"><b>هذه معاينة فقط.</b>
        <div class="help">إسقاط أيام إجازة قرارٌ لا يُتخذ تلقائياً. راجع العمود الأحمر: هذه أيام سيفقدها الموظف.</div></div>
      <div class="table-wrap"><table class="tight">
        <thead><tr><th>الموظف</th><th>النوع</th><th class="num">قبل</th>
          <th class="num">يُرحَّل</th><th class="num">يسقط</th><th class="num">السقف</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">لا أرصدة للترحيل.</td></tr>'}</tbody>
      </table></div>
      <p class="help">⚠️ تنفيذ الترحيل غير مُفعَّل في هذه النسخة عمداً — يُضاف بعد أن تراجع هذا الجدول على بيانات حقيقية وتوافق عليه.</p>
      <div class="row"><button class="btn" onclick="this.closest('.overlay').remove()">إغلاق</button></div>`));
  }

  draw();
}

export { empty };
