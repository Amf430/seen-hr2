import { el, esc, uid, toast, openModal, confirmAction } from '../../lib/dom.js';
import { getSettings, getUsers } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { AR_DAYS, ymd } from '../../lib/dates.js';
import { shiftPlansOf, planUsage, shiftText, DEFAULT_PLAN_ID } from '../../lib/shifts.js';
import { card, empty, tableWrap, button, sectionHead, callout } from '../../lib/ui.js';

/* ═══ جدول الأيام السبعة — مصدر واحد ═══
   ⚠️ كان هذا الجدول مكتوباً مرة واحدة داخل بطاقة «شفتات الشركة». الآن
   تستعمله ثلاث شاشات (الشركة · الخطط · القسم)، فاستُخرج بدل أن يُنسخ.
   نسختان من نفس الجدول تعنيان حقلاً يُضاف لواحدة وينسى في الأخرى. */
export function dayTableHtml(days, ns = '') {
  return `
    <table>
      <thead><tr><th>اليوم</th><th>النوع</th><th>من</th><th>إلى</th></tr></thead>
      <tbody>${AR_DAYS.map((dn, i) => {
        const s = (days || {})[i] || { type: 'off', start: '', end: '' };
        return `<tr>
          <td><b>${dn}</b></td>
          <td><select data-d="${i}" class="${ns}shType inline-input">
            <option value="morning"${s.type === 'morning' ? ' selected' : ''}>صباحي</option>
            <option value="evening"${s.type === 'evening' ? ' selected' : ''}>مسائي</option>
            <option value="off"${s.type === 'off' ? ' selected' : ''}>راحة</option></select></td>
          <td><input type="time" data-d="${i}" class="${ns}shStart inline-input" value="${esc(s.start || '')}"></td>
          <td><input type="time" data-d="${i}" class="${ns}shEnd inline-input" value="${esc(s.end || '')}"></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

export function readDayTable(root, ns = '') {
  const out = {};
  AR_DAYS.forEach((_, i) => {
    const type  = root.querySelector(`.${ns}shType[data-d="${i}"]`).value;
    const start = root.querySelector(`.${ns}shStart[data-d="${i}"]`).value;
    const end   = root.querySelector(`.${ns}shEnd[data-d="${i}"]`).value;
    out[i] = { type, start: type === 'off' ? '' : start, end: type === 'off' ? '' : end };
  });
  return out;
}

/* ملخّص الخطة في سطر — أيام العمل وأوقاتها الغالبة */
function planSummary(plan) {
  const work = AR_DAYS.map((_, i) => (plan.days || {})[i]).filter((s) => s && s.type !== 'off');
  if (!work.length) return 'كل الأيام راحة';
  const first = work[0];
  const same  = work.every((s) => s.start === first.start && s.end === first.end);
  return `${work.length} أيام عمل · ${same ? shiftText(first) : 'أوقات مختلطة'}`;
}

/* ═══════════════════════ بطاقة خطط الشفتات ═══════════════════════

   الطلب: «أضيف أكثر من شفت وأحدّد أقسام معيّنة أو أشخاص معيّنين يداومون
   بالشفت ذا، لأن بعض الموظفين يبدأ دوامهم ٢ أو ٣ العصر غير الباقي».

   ⚠️ لا ترحيل: ما دامت settings.shiftPlans فارغة، تُركّب shiftPlansOf() خطة
   واحدة في الذاكرة من settings.shifts وتُعرض هنا للقراءة مع زرّ «تحويل إلى
   خطة مُسمّاة». لا شيء يُكتب في Firestore حتى يضغط الأدمن ذلك الزر. */
function shiftPlansCard() {
  const c = card('خطط الشفتات', null, 'clock',
    'خطة الشفت مجموعة أيام مُسمّاة تُسند لقسم كامل أو لموظف بعينه. أولوية الإسناد: خطة الموظف، ثم خطة قسمه، ثم الخطة الافتراضية.');
  const host = el('div', '');
  c.appendChild(host);

  function draw() {
    const S = getSettings();
    host.innerHTML = '';
    const plans = shiftPlansOf();
    const synthetic = plans.length === 1 && plans[0].synthetic;

    host.appendChild(sectionHead('الخطط',
      button('إضافة خطة', 'btn sm', () => openPlan(null, draw))));

    if (synthetic) {
      host.appendChild(callout('info', 'النظام يعمل الآن بخطة واحدة مُركَّبة من «شفتات الشركة» أدناه',
        'ما زال كل شيء كما هو ولم تُكتب أي بيانات جديدة. اضغط «إضافة خطة» لتعريف شفت مسائي أو ليلي وإسناده لقسم أو لموظف.'));
    }

    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th>الخطة</th><th>الأيام</th><th class="num">قفل الحضور</th>
          <th class="num">مَن يتبعها</th><th>الحالة</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');

    plans.forEach((p) => {
      const use = planUsage(p.id, getUsers());
      const isDefault = S.defaultShiftPlanId === p.id;
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(p.name)}</b>${isDefault ? ' <span class="tag">الافتراضية</span>' : ''}</td>
        <td class="cell-sub">${esc(planSummary(p))}</td>
        <td class="num cell-sub">${p.checkInCutoff ? esc(p.checkInCutoff) : 'نهاية الوردية'}</td>
        <td class="num">${use.depts ? `${use.depts} قسم` : ''}${use.depts && use.employees ? ' · ' : ''}${
          use.employees ? `${use.employees} موظف` : ''}${!use.depts && !use.employees ? '<span class="cell-sub">لا أحد</span>' : ''}</td>
        <td><span class="pill pill--dot ${p.active !== false ? 'active' : 'suspended'}">${
          p.active !== false ? 'نشطة' : 'معطَّلة'}</span></td>`;
      const td = el('td', '');
      const acts = el('div', 'actions-cell');

      if (p.synthetic) {
        acts.appendChild(button('تحويل إلى خطة مُسمّاة', 'btn sm', async () => {
          S.shiftPlans = [{ id: DEFAULT_PLAN_ID, name: 'دوام الشركة',
                            days: { ...(S.shifts || {}) }, active: true }];
          S.defaultShiftPlanId = DEFAULT_PLAN_ID;
          await saveSettings(['shiftPlans', 'defaultShiftPlanId']);
          draw(); toast('صارت خطة محفوظة تقدر تعدّلها', 'ok');
        }));
      } else {
        acts.appendChild(button('تعديل', 'btn sm ghost', () => openPlan(p, draw)));
        if (!isDefault) acts.appendChild(button('اجعلها الافتراضية', 'btn sm ghost', async () => {
          S.defaultShiftPlanId = p.id;
          await saveSettings(['defaultShiftPlanId']);
          draw(); toast('صارت الخطة الافتراضية', 'ok');
        }));
        acts.appendChild(button(p.active !== false ? 'تعطيل' : 'تفعيل', 'btn sm ghost', async () => {
          p.active = p.active === false;
          await saveSettings(['shiftPlans']);
          draw(); toast(p.active ? 'فُعّلت' : 'عُطّلت');
        }));
        acts.appendChild(button('حذف', 'btn sm danger', () => removePlan(p, draw)));
      }
      td.appendChild(acts);
      tr.appendChild(td);
      tb.appendChild(tr);
    });

    host.appendChild(w);
    host.appendChild(el('p', 'help',
      '⚠️ تعطيل الخطة لا يجعل أيام متبعيها راحة — يسقطون لخطة قسمهم ثم للخطة الافتراضية. التعطيل يمنع إسنادها لأحد جديد فقط.'));
  }

  draw();
  return c;
}

/* إضافة/تعديل خطة */
function openPlan(p, after) {
  const S = getSettings();
  const isEdit = !!p;
  const m = openModal(`
    <h3>${isEdit ? 'تعديل خطة' : 'خطة شفت جديدة'}</h3>
    <div class="field">
      <label for="pName">اسم الخطة *</label>
      <input id="pName" value="${esc(p?.name || '')}" placeholder="مثال: الشفت المسائي">
    </div>
    <div id="pDays">${dayTableHtml(p?.days || S.shifts || {}, 'p')}</div>
    <div class="field">
      <label for="pCut">قفل تسجيل الحضور (اختياري)</label>
      <input id="pCut" type="time" value="${esc(p?.checkInCutoff || '')}">
      <div class="help">اتركه فارغاً ليُقفل الحضور عند نهاية الوردية. تسجيل الانصراف لا يُقفل أبداً.</div>
    </div>
    <div class="err" id="pErr"></div>
    <div class="row">
      <button class="btn ghost" id="pCancel">إلغاء</button>
      <button class="btn" id="pOk">${isEdit ? 'حفظ' : 'إضافة'}</button>
    </div>`);

  m.$('#pCancel').onclick = m.close;
  m.$('#pOk').onclick = async () => {
    const err = m.$('#pErr'); err.textContent = '';
    const name = m.$('#pName').value.trim();
    if (!name) { err.textContent = 'اكتب اسم الخطة'; return; }
    if ((S.shiftPlans || []).some((x) => x.name === name && x.id !== p?.id)) {
      err.textContent = 'يوجد خطة بنفس الاسم'; return;
    }
    const days = readDayTable(m.$('#pDays'), 'p');
    const cutoff = m.$('#pCut').value || '';

    /* أول خطة تُحفظ تُنشئ المصفوفة، والشكل القديم يبقى كما هو بلا حذف */
    S.shiftPlans = Array.isArray(S.shiftPlans) ? S.shiftPlans : [];
    if (isEdit) Object.assign(p, { name, days, checkInCutoff: cutoff });
    else S.shiftPlans.push({ id: 'plan_' + uid(), name, days, checkInCutoff: cutoff, active: true });
    if (!S.defaultShiftPlanId) S.defaultShiftPlanId = S.shiftPlans[0].id;

    await saveSettings(['shiftPlans', 'defaultShiftPlanId']);
    m.close(); after();
    toast(isEdit ? 'حُفظت الخطة' : 'أُضيفت الخطة', 'ok');
  };
}

/* نافذة إعلامية بزرّ واحد — confirmAction تعرض «إلغاء» بجانبه، وزرّ إلغاء
   في رسالة لا خيار فيها يجعل المستخدم يتردّد أمام قرار لا وجود له. */
function blockedModal(title, bodyHtml) {
  const m = openModal(`
    <h3>${esc(title)}</h3>
    <div class="modal-body">${bodyHtml}</div>
    <div class="row"><button class="btn" id="bmOk">فهمت</button></div>`);
  m.$('#bmOk').onclick = m.close;
}

/* ⚠️ الحذف ممنوع ما دام أحد يتبعها.
   حذفها من تحت قسم يُسقطه فجأة على الخطة الافتراضية — أي على أوقات دوام
   مختلفة — فيصير قسم كامل «متأخراً» صباح اليوم التالي بلا أن يعرف أحد لماذا. */
async function removePlan(p, after) {
  const S = getSettings();
  const use = planUsage(p.id, getUsers());
  if (use.depts || use.employees) {
    blockedModal('لا يمكن حذف الخطة',
      `يتبعها ${use.depts ? `<b>${use.depts}</b> قسم (${esc(use.deptNames.join('، '))})` : ''}${
        use.depts && use.employees ? ' و' : ''}${use.employees ? `<b>${use.employees}</b> موظف` : ''}.
        <br><br>انقلهم إلى خطة أخرى أولاً. الحذف الآن يسقطهم على الخطة الافتراضية بأوقات مختلفة،
        فيظهرون متأخرين صباح الغد بلا سبب ظاهر.`);
    return;
  }
  if (S.defaultShiftPlanId === p.id) {
    blockedModal('لا يمكن حذف الخطة الافتراضية',
      'اجعل خطة أخرى افتراضية أولاً، ثم احذف هذه.');
    return;
  }
  const yes = await confirmAction({
    title: `حذف ${p.name}`, body: 'لا أحد يتبع هذه الخطة، فحذفها لا يغيّر دوام أحد.',
    confirmLabel: 'حذف'
  });
  if (!yes) return;
  S.shiftPlans = (S.shiftPlans || []).filter((x) => x.id !== p.id);
  await saveSettings(['shiftPlans']);
  after(); toast('حُذفت الخطة');
}

export function render(view) {
  const S = getSettings();

  view.appendChild(shiftPlansCard());

  /* ── الورديات الأسبوعية ── */
  const shCard = card('شفتات الدوام الأسبوعية', null, 'clock',
    'لكل يوم حدّد نوع الوردية ووقت البداية والنهاية. الأقسام تقدر تتجاوزها بورديات خاصة.');
  const wrap = tableWrap(dayTableHtml(S.shifts || {}));
  shCard.appendChild(wrap);
  shCard.appendChild(button('حفظ الشفتات', 'btn sm mt-3', async () => {
    S.shifts = readDayTable(wrap);
    await saveSettings(['shifts']);
    toast('تم حفظ الشفتات', 'ok');
  }));
  view.appendChild(shCard);

  /* ── العطل الرسمية والدوام الخاص ── */
  const exCard = card('العطل الرسمية ودوام خاص بتاريخ محدّد', null, 'calendar',
    'تُطبَّق على جميع الموظفين وتتقدّم على ورديات القسم والشركة. «راحة» تجعل اليوم عطلة رسمية فلا يُحسب غياباً ولا يُخصم.');
  const exHost = el('div', '');
  exCard.appendChild(exHost);

  const add = el('div', 'add-inline');
  add.innerHTML = `
    <div class="field"><label for="nxFrom">من تاريخ</label><input id="nxFrom" type="date"></div>
    <div class="field"><label for="nxTo">إلى تاريخ (اختياري)</label><input id="nxTo" type="date"></div>
    <div class="field"><label for="nxType">النوع</label>
      <select id="nxType">
        <option value="off">راحة / عطلة رسمية</option>
        <option value="hours">دوام خاص</option>
      </select></div>
    <div class="field"><label for="nxStart">من الساعة</label><input id="nxStart" type="time" disabled></div>
    <div class="field"><label for="nxEnd">إلى الساعة</label><input id="nxEnd" type="time" disabled></div>
    <div class="field grow"><label for="nxLabel">الوصف</label>
      <input id="nxLabel" placeholder="مثال: عيد الفطر / دوام رمضان"></div>`;
  const addBtn = button('إضافة', 'btn sm');
  add.appendChild(addBtn);
  exCard.appendChild(add);
  view.appendChild(exCard);

  const nxType = add.querySelector('#nxType');
  nxType.onchange = () => {
    const h = nxType.value === 'hours';
    add.querySelector('#nxStart').disabled = !h;
    add.querySelector('#nxEnd').disabled = !h;
  };

  function drawEx() {
    const list = [...(S.dateExceptions || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    exHost.innerHTML = '';
    if (!list.length) {
      exHost.appendChild(empty('لا استثناءات — أضف العطل الرسمية حتى لا تُحسب غياباً على الموظفين.', 'calendar'));
      return;
    }
    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th class="num">التاريخ</th><th>اليوم</th><th>النوع</th><th class="num">الدوام</th><th>الوصف</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');
    list.forEach((x) => {
      const d = new Date(x.date + 'T00:00:00');
      const tr = el('tr', '');
      tr.innerHTML = `
        <td class="num">${esc(x.date)}</td>
        <td>${isNaN(d) ? '' : AR_DAYS[d.getDay()]}</td>
        <td><span class="pill pill--dot ${x.type === 'off' ? 'holiday' : 'pending'}">${x.type === 'off' ? 'عطلة' : 'دوام خاص'}</span></td>
        <td class="num">${x.type === 'off' ? '—' : esc((x.start || '') + '–' + (x.end || ''))}</td>
        <td>${esc(x.label || '')}</td>`;
      const td = el('td', '');
      td.appendChild(button('حذف', 'btn sm danger', async () => {
        S.dateExceptions = (S.dateExceptions || []).filter((z) => z.id !== x.id);
        await saveSettings(); drawEx(); toast('حُذف');
      }));
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    exHost.appendChild(w);
  }

  addBtn.onclick = async () => {
    const from = add.querySelector('#nxFrom').value;
    const to = add.querySelector('#nxTo').value || from;
    const type = nxType.value;
    const st = add.querySelector('#nxStart').value, en = add.querySelector('#nxEnd').value;
    const label = add.querySelector('#nxLabel').value.trim();

    if (!from) { toast('اختر التاريخ', 'err'); return; }
    if (to < from) { toast('تاريخ النهاية قبل البداية', 'err'); return; }
    if (type === 'hours' && (!st || !en)) { toast('أدخل ساعات الدوام الخاص', 'err'); return; }

    S.dateExceptions = S.dateExceptions || [];
    let n = 0;
    for (let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      const ds = ymd(d);
      /* استبدال أي استثناء لنفس اليوم */
      S.dateExceptions = S.dateExceptions.filter((z) => z.date !== ds);
      S.dateExceptions.push({
        id: uid(), date: ds, type, kind: 'morning',
        start: type === 'hours' ? st : '', end: type === 'hours' ? en : '', label
      });
      n++;
    }
    await saveSettings();
    drawEx();
    add.querySelector('#nxLabel').value = '';
    toast(`أُضيف ${n} يوم`, 'ok');
  };

  drawEx();
}
