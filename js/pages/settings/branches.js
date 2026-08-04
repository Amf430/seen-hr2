/* ═══════════════════════════════════════════════════════════════════════════
   الفروع ونطاق الحضور — يحلّ محل بطاقة «موقع الشركة» القديمة.

   البيانات الحالية في Firestore ما فيها مصفوفة فروع، فيها {lat,lng,radius}
   فقط. branchesOf() يركّب منها «المقر الرئيسي» تلقائياً، فيفتح الأدمن هذه
   الصفحة أول مرة ويلقى فرعه محفوظاً بإحداثياته — بلا إدخال بيانات ولا ترحيل.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, uid, toast, openModal } from '../../lib/dom.js';
import { getSettings, getUsers } from '../../lib/state.js';
import { branchesOf, getPosition, activeBranches } from '../../lib/geo.js';
import { saveBranches } from '../../lib/settings.js';
import { logAction } from '../../lib/audit.js';
import { openTypedConfirm } from '../../components/review-modals.js';
import { fmtDist } from '../../lib/format.js';
import { card, empty, tableWrap, sectionHead, button, callout } from '../../lib/ui.js';

export function render(view) {
  const S = getSettings();
  /* نطبع الشكل المُركَّب في الذاكرة أول مرة حتى يرى الأدمن فرعه الحالي */
  if (!Array.isArray(S.branches) || !S.branches.length) S.branches = branchesOf();

  const head = card('فروع الشركة', null, 'pin',
    'كل فرع له موقع ونطاق خاص. الموظف يسجّل حضوره من أقرب فرع مسموح له، ويُكتب اسم الفرع على سجله.');
  view.appendChild(head);

  view.appendChild(callout('info', 'النطاق الخاص بكل موظف يُضبط من ملفه',
    'افتح «ملفات الموظفين» ← تعديل ← قسم «الحضور والنطاق» لتغيير نطاق موظف بعينه، أو للسماح له بالتسجيل من أي مكان.'));

  const host = el('div', '');
  view.appendChild(host);

  function draw() {
    host.innerHTML = '';
    const list = S.branches || [];
    const c = card('');
    c.appendChild(sectionHead('الفروع', button('إضافة فرع', 'btn sm', () => openBranch(null, draw, 'plus'))));

    if (!list.length) {
      c.appendChild(empty('لا فروع بعد — أضف أول فرع ليقدر الموظفون يسجّلون حضورهم.', 'pin'));
      host.appendChild(c);
      return;
    }

    const wrap = tableWrap(`
      <table>
        <thead><tr><th>الفرع</th><th>الإحداثيات</th><th>النطاق</th><th>الموظفون المقيّدون به</th><th>الحالة</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = wrap.querySelector('tbody');

    list.forEach((b) => {
      const bound = getUsers().filter((u) => Array.isArray(u.branchIds) && u.branchIds.includes(b.id)).length;
      const tr = el('tr', '');
      tr.innerHTML = `
        <td><b>${esc(b.name)}</b></td>
        <td class="num cell-sub">${Number(b.lat).toFixed(5)}, ${Number(b.lng).toFixed(5)}</td>
        <td class="num">${esc(b.radius)} م</td>
        <td class="num">${bound || '<span class="cell-sub">الكل</span>'}</td>
        <td><span class="pill pill--dot ${b.active !== false ? 'active' : 'suspended'}">${b.active !== false ? 'نشط' : 'موقوف'}</span></td>`;
      const td = el('td', '');
      const cell = el('div', 'actions-cell');
      cell.append(
        button('تعديل', 'btn sm ghost', () => openBranch(b, draw)),
        button(b.active !== false ? 'إيقاف' : 'تفعيل', 'btn sm ghost', async () => {
          b.active = b.active === false;
          await saveBranches(S.branches);
          await logAction('تعديل فرع', `${b.name} — ${b.active ? 'تفعيل' : 'إيقاف'}`);
          draw();
          toast(b.active ? 'فُعّل الفرع' : 'أُوقف الفرع');
        }),
        button('حذف', 'btn sm danger', () => removeBranch(b, draw))
      );
      td.appendChild(cell);
      tr.appendChild(td);
      tb.appendChild(tr);
    });

    c.appendChild(wrap);
    c.appendChild(el('p', 'help',
      'إيقاف الفرع يبقيه في السجلات القديمة لكن ما عاد أحد يسجّل منه. الحذف يزيله نهائياً.'));
    host.appendChild(c);
  }

  draw();
}

/* ── نافذة إضافة/تعديل فرع ── */
function openBranch(b, after) {
  const S = getSettings();
  const isEdit = !!b;
  const m = openModal(`
    <h3>${isEdit ? 'تعديل فرع' : 'إضافة فرع'}</h3>
    <div class="field">
      <label for="bName">اسم الفرع *</label>
      <input id="bName" value="${esc(b?.name || '')}" placeholder="مثال: فرع الروضة">
    </div>
    <div class="form-row">
      <div class="field"><label for="bLat">خط العرض (Latitude)</label>
        <input id="bLat" value="${b?.lat != null ? b.lat : ''}" placeholder="21.543300" inputmode="decimal"></div>
      <div class="field"><label for="bLng">خط الطول (Longitude)</label>
        <input id="bLng" value="${b?.lng != null ? b.lng : ''}" placeholder="39.172800" inputmode="decimal"></div>
    </div>
    <div class="form-row">
      <div class="field"><label for="bRad">نطاق الحضور (متر)</label>
        <input id="bRad" type="number" min="50" step="10" value="${b?.radius || 500}">
        <div class="help">أقل قيمة 50 متر. دقة GPS في الجوال نادراً ما تنزل تحت 20 متر.</div></div>
      <div class="field field--btn">
        <button type="button" class="btn ghost w-full" id="bHere">التقاط موقعي الحالي</button></div>
    </div>
    <div class="help" id="bStatus"></div>
    <div class="err" id="bErr"></div>
    <div class="row">
      <button class="btn ghost" id="bCancel">إلغاء</button>
      <button class="btn" id="bOk">${isEdit ? 'حفظ' : 'إضافة الفرع'}</button>
    </div>`);

  m.$('#bHere').onclick = async () => {
    const st = m.$('#bStatus');
    st.textContent = 'جارٍ تحديد موقعك…';
    try {
      const p = await getPosition();
      m.$('#bLat').value = p.lat.toFixed(6);
      m.$('#bLng').value = p.lng.toFixed(6);
      st.textContent = `تم التقاط موقعك (دقة ±${Math.round(p.acc)} م). تأكد أنك داخل الفرع الآن.`;
    } catch (e) {
      st.textContent = 'تعذّر تحديد الموقع — تأكد من إذن الموقع في المتصفح.';
    }
  };
  m.$('#bCancel').onclick = m.close;

  m.$('#bOk').onclick = async () => {
    const err = m.$('#bErr'); err.textContent = '';
    const name = m.$('#bName').value.trim();
    const lat = parseFloat(m.$('#bLat').value);
    const lng = parseFloat(m.$('#bLng').value);
    const radius = Math.max(50, parseInt(m.$('#bRad').value, 10) || 500);

    if (!name) { err.textContent = 'اكتب اسم الفرع'; return; }
    if (isNaN(lat) || isNaN(lng)) { err.textContent = 'أدخل إحداثيات صحيحة، أو اضغط «التقاط موقعي الحالي»'; return; }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { err.textContent = 'الإحداثيات خارج المدى المنطقي'; return; }
    if ((S.branches || []).some((x) => x.name === name && x.id !== b?.id)) {
      err.textContent = 'يوجد فرع بنفس الاسم'; return;
    }

    const btn = m.$('#bOk'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      if (isEdit) Object.assign(b, { name, lat, lng, radius });
      else (S.branches = S.branches || []).push({ id: 'br_' + uid(), name, lat, lng, radius, active: true });
      await saveBranches(S.branches);
      await logAction(isEdit ? 'تعديل فرع' : 'إضافة فرع', `${name} — نطاق ${radius} م`);
      m.close();
      after();
      toast(isEdit ? 'حُفظ الفرع' : 'أُضيف الفرع', 'ok');
    } catch (e) {
      console.error(e);
      err.textContent = 'تعذّر الحفظ';
      btn.disabled = false; btn.textContent = isEdit ? 'حفظ' : 'إضافة الفرع';
    }
  };
}

function removeBranch(b, after) {
  const S = getSettings();
  const bound = getUsers().filter((u) => Array.isArray(u.branchIds) && u.branchIds.includes(b.id));
  const isLast = activeBranches().length <= 1 && b.active !== false;

  openTypedConfirm({
    title: `حذف ${b.name}`,
    body: `${isLast ? '<b>هذا آخر فرع نشط.</b> بحذفه لن يقدر أي موظف «من الفرع فقط» على تسجيل الحضور.<br><br>' : ''}
           ${bound.length ? `<b>${bound.length}</b> موظف مقيّد بهذا الفرع — بعد الحذف سيُسمح لهم بكل الفروع النشطة بدل أن يُقفل عليهم.<br><br>` : ''}
           السجلات القديمة تحتفظ باسم الفرع كما هو. لو تبي تمنع التسجيل منه فقط، استخدم «إيقاف» بدل الحذف.`,
    phrase: 'حذف',
    confirmLabel: 'حذف الفرع',
    run: async () => {
      S.branches = (S.branches || []).filter((x) => x.id !== b.id);
      await saveBranches(S.branches);
      await logAction('حذف فرع', b.name);
      after();
      toast('حُذف الفرع');
    }
  });
}

export { fmtDist };
