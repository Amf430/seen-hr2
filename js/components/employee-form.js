/* ═══════════════════════════════════════════════════════════════════════════
   نموذج بيانات الموظف — إضافة وتعديل.

   الجديد هنا قسم «الحضور والنطاق»، وهو طلب المالك:
     • من يشتغل من أماكن ثانية → «يسجّل من أي مكان» فيتجاوز السياج الجغرافي
     • نطاق خاص بالمتر لموظف بعينه، يتجاوز نطاق الفرع
     • حصر الموظف بفروع محددة، أو تركه لكل الفروع
   ═══════════════════════════════════════════════════════════════════════════ */

import { openModal, toast, esc, uid } from '../lib/dom.js';
import { getSettings } from '../lib/state.js';
import { activeBranches, branchesOf as allBranches } from '../lib/geo.js';
import { normPhone, isValidSaudiMobile } from '../lib/phone.js';
import { createEmployee, updateEmployee, generateTempPassword } from '../lib/users.js';
import { managerCandidates } from '../lib/org.js';

const ROLE_OPTS = [
  ['employee', 'موظف'],
  ['manager',  'مدير قسم (يوافق على استئذانات قسمه)'],
  ['admin',    'مدير النظام']
];

export function openEmpForm(u = null, after) {
  const isEdit = !!u;
  const S = getSettings();
  /* ⚠️ الفروع النشطة + أي فرع مقيَّد به هذا الموظف حتى لو كان موقوفاً.
     بدون ذلك ما يُعرض له مربّع، فيُقرأ عند الحفظ كأنه غير مختار — فيُمسح
     تقييده بصمت لمجرد أن الأدمن فتح ملفه وضغط حفظ. */
  const picked0 = Array.isArray(u && u.branchIds) ? u.branchIds : [];
  const branches = (() => {
    const act = activeBranches();
    const ids = new Set(act.map((b) => b.id));
    const extra = allBranches().filter((b) => picked0.includes(b.id) && !ids.has(b.id));
    return [...act, ...extra.map((b) => ({ ...b, suspended: true }))];
  })();
  /* المرشّحون لأن يكونوا مديراً — بلا نفسه، وبلا من يخلق حلقة تسلسل */
  const bosses = managerCandidates(u ? u.id : '__new__');
  const mode = (u && u.workMode === 'remote') ? 'remote' : 'onsite';
  const picked = Array.isArray(u && u.branchIds) ? u.branchIds : [];

  const m = openModal(`
    <h3>${isEdit ? 'تعديل بيانات موظف' : 'إضافة موظف'}</h3>

    <div class="form-section">
      <div class="form-section__title">البيانات الأساسية</div>
      <div class="form-row">
        <div class="field"><label for="eName">الاسم *</label>
          <input id="eName" value="${esc(u?.name || '')}"></div>
        <div class="field"><label for="eEmpId">الرقم الوظيفي</label>
          <input id="eEmpId" value="${esc(u?.empId || '')}">
          <div class="help">لازم يطابق رقم الموظف في جهاز البصمة، وإلا ما ارتبطت بصماته بملفه.</div></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="eDept">القسم / الإدارة</label>
          <input id="eDept" list="deptOptions" value="${esc(u?.department || '')}" placeholder="اكتب أو اختر">
          <datalist id="deptOptions">${(S.departments || []).map((d) => `<option value="${esc(d.name)}"></option>`).join('')}</datalist>
          <div class="help">القسم يحدّد الوردية ومدير الموافقات.</div></div>
        <div class="field"><label for="eTitle">المسمى الوظيفي</label>
          <input id="eTitle" value="${esc(u?.jobTitle || '')}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ePhone">الجوال (يُستخدم للدخول) *</label>
          <input id="ePhone" value="${esc(u?.phone || '')}" placeholder="05xxxxxxxx" inputmode="numeric"
                 ${isEdit ? 'disabled' : ''}>
          ${isEdit ? '<div class="help">رقم الدخول لا يُعدَّل من هنا — استخدم «استعادة الوصول».</div>' : ''}</div>
        <div class="field"><label for="eMgrUid">المدير المباشر</label>
          <select id="eMgrUid">
            <option value="">— بلا مدير مباشر —</option>
            ${bosses.map((b) => `<option value="${esc(b.id)}"${
              (u?.managerUid || '') === b.id ? ' selected' : ''}>${esc(b.name)}${
              b.jobTitle ? ' — ' + esc(b.jobTitle) : ''}</option>`).join('')}
          </select>
          <div class="help">${u?.manager && !u?.managerUid
            ? `مسجّل نصّاً: «${esc(u.manager)}» — اختره من القائمة ليربطه النظام فعلياً.`
            : 'يحدّد وجهة الطلبات في سلسلة الموافقات، ومن يظهر له هذا الموظف في «فريقي».'}</div></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section__title">التعاقد والراتب</div>
      <div class="form-row">
        <div class="field"><label for="eSalary">الراتب الشهري (ريال)</label>
          <input id="eSalary" type="number" min="0" step="50" value="${u?.salary != null ? Number(u.salary) : ''}" placeholder="0"></div>
        <div class="field"><label for="eContractEnd">تاريخ انتهاء العقد</label>
          <input id="eContractEnd" type="date" value="${esc(u?.contractEnd || '')}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="eHire">تاريخ المباشرة</label>
          <input id="eHire" type="date" value="${esc(u?.hireDate || '')}"></div>
        <div class="field"><label for="eRole">الصلاحية</label>
          <select id="eRole">${ROLE_OPTS.map(([v, l]) =>
            `<option value="${v}"${(u?.role || 'employee') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section__title">الحضور والنطاق</div>
      <div class="field">
        <label for="eMode">من أين يسجّل حضوره؟</label>
        <select id="eMode">
          <option value="onsite"${mode === 'onsite' ? ' selected' : ''}>من الفرع فقط — داخل النطاق الجغرافي</option>
          <option value="remote"${mode === 'remote' ? ' selected' : ''}>من أي مكان — بلا نطاق</option>
        </select>
        <div class="help">«من أي مكان» لمن يشتغل خارج المقر. يُسجَّل موقعه في السجل للتوثيق، لكن لا يُمنع بسببه.</div>
      </div>

      <div id="onsiteOnly" class="${mode === 'remote' ? 'hidden' : ''}">
        <div class="field">
          <label for="eRadius">نطاق خاص بهذا الموظف (متر)</label>
          <input id="eRadius" type="number" min="50" step="10" value="${u?.geoRadius != null ? Number(u.geoRadius) : ''}"
                 placeholder="اتركه فاضي ليأخذ نطاق الفرع">
          <div class="help">اتركه فاضي = يستخدم نطاق الفرع نفسه. أقل قيمة مقبولة 50 متر.</div>
        </div>
        <div class="field">
          <label>الفروع المسموح له التسجيل منها</label>
          ${branches.length ? `<div class="checkbox-grid">${branches.map((b) => `
            <label class="checkbox"><input type="checkbox" class="eBranch" value="${esc(b.id)}"
              ${picked.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}${b.suspended ? ' <small>(موقوف)</small>' : ''}</label>`).join('')}</div>`
            : '<div class="help">لم تُضَف فروع بعد — أضفها من «الفروع ونطاق الحضور».</div>'}
          <div class="help">لا تختر شيئاً = مسموح له من كل الفروع.</div>
        </div>
      </div>
    </div>

    ${isEdit ? '' : `
    <div class="form-section">
      <div class="form-section__title">الدخول</div>
      <div class="field">
        <label for="ePass">كلمة مرور مبدئية *</label>
        <div class="cluster">
          <input id="ePass" type="text" class="grow" placeholder="6 أحرف على الأقل" autocomplete="off">
          <button type="button" class="btn ghost sm" id="eGen">توليد</button>
        </div>
        <div class="help">الموظف يغيّرها إجبارياً أول ما يدخل. انسخها له الآن — ما تظهر مرة ثانية.</div>
      </div>
    </div>`}

    <div class="err" id="eErr"></div>
    <div class="row">
      <button class="btn ghost" id="eCancel">إلغاء</button>
      <button class="btn" id="eSave">${isEdit ? 'حفظ التعديلات' : 'إنشاء الحساب'}</button>
    </div>`);

  /* إظهار/إخفاء إعدادات الموقع حسب نمط العمل */
  m.$('#eMode').onchange = (e) => {
    m.$('#onsiteOnly').classList.toggle('hidden', e.target.value === 'remote');
  };
  if (!isEdit) {
    m.$('#eGen').onclick = () => {
      const p = generateTempPassword();
      m.$('#ePass').value = p;
      m.$('#ePass').select();
      toast('وُلِّدت كلمة مرور — انسخها قبل الحفظ');
    };
  }
  m.$('#eCancel').onclick = m.close;

  m.$('#eSave').onclick = async () => {
    const err = m.$('#eErr'); err.textContent = '';
    const name = m.$('#eName').value.trim();
    if (!name) { err.textContent = 'الاسم مطلوب'; m.$('#eName').focus(); return; }

    const workMode = m.$('#eMode').value === 'remote' ? 'remote' : 'onsite';
    const radiusRaw = Number(m.$('#eRadius')?.value);
    const branchIds = [...m.modal.querySelectorAll('.eBranch:checked')].map((c) => c.value);

    const base = {
      name,
      empId:       m.$('#eEmpId').value.trim(),
      department:  m.$('#eDept').value.trim(),
      jobTitle:    m.$('#eTitle').value.trim(),
      /* ⚠️ الحقل النصّي القديم يبقى كما هو ولا يُحذف: هو ما يُعرض في بطاقة
         الموظف اليوم، ولا يوجد ترحيل آلي موثوق من نصّ إلى معرّف (اسمان
         متشابهان يكفيان لربط خاطئ). الربط قرار يدوي من الأدمن. */
      manager:     u?.manager || '',
      managerUid:  m.$('#eMgrUid').value || '',
      hireDate:    m.$('#eHire').value,
      salary:      Number(m.$('#eSalary').value) || 0,
      contractEnd: m.$('#eContractEnd').value || '',
      role:        m.$('#eRole').value,
      workMode,
      /* null صراحةً بدل حذف الحقل: التحديث الجزئي لا يمسح حقلاً غائباً،
         فلو أراد الأدمن إلغاء النطاق الخاص لازم نكتب null فوقه. */
      geoRadius:   (workMode === 'onsite' && radiusRaw >= 50) ? Math.round(radiusRaw) : null,
      branchIds:   workMode === 'onsite' ? branchIds : []
    };

    const btn = m.$('#eSave');
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      if (isEdit) {
        await updateEmployee(u.id, base);
        toast('تم الحفظ', 'ok');
      } else {
        const phone = m.$('#ePhone').value.trim();
        const pass  = m.$('#ePass').value;
        if (!isValidSaudiMobile(phone)) throw new Error('bad-phone');
        if (pass.length < 6) throw new Error('weak-pass');
        await createEmployee({ ...base, phone: normPhone(phone) }, pass);
        toast('تم إنشاء الحساب', 'ok');
      }
      m.close();
      if (after) await after();
    } catch (e) {
      console.error(e);
      const map = {
        'bad-phone':                  'أدخل رقم جوال سعودي صحيح (05xxxxxxxx)',
        'weak-pass':                  'كلمة المرور 6 أحرف على الأقل',
        'auth/email-already-in-use':  'رقم الجوال مستخدم مسبقاً',
        'auth/invalid-email':         'صيغة رقم الجوال غير صحيحة',
        'auth/weak-password':         'كلمة المرور ضعيفة',
        'permission-denied':          'ما عندك صلاحية لهذا الإجراء'
      };
      err.textContent = map[e.code] || map[e.message] || 'تعذّر الحفظ';
      btn.disabled = false; btn.textContent = isEdit ? 'حفظ التعديلات' : 'إنشاء الحساب';
    }
  };
}
