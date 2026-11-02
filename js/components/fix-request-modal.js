/* ═══════════════════════════════════════════════════════════════════════════
   طلب تصحيح بصمة ناقصة (المرحلة ١٠)

   ⚠️ الطلب يُقدَّم **من مكان المشكلة** — من صفّ اليوم الناقص في «أدائي» — لا
   من قائمة طلبات عامة. الموظف الذي يرى «نسيان بصمة الخروج» أمامه يضغط زراً
   بجانبه؛ ولو أرسلناه لقائمة عامة لكان عليه أن يتذكّر اليوم ويعيد وصفه.

   ⚠️ ولا يكتب هذا النموذج في سجل الحضور إطلاقاً. يُنشئ طلباً في `requests`
   يمرّ بسلسلة الاعتماد، والأدمن في الخطوة الأخيرة هو من يكتب التصحيح —
   لأن التعديل يمسّ المسير، ولأن قاعدة attendanceAdjustments تمنع التحديث
   والحذف نهائياً فالخطأ فيه لا يُتراجع عنه.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc, toast, openModal } from '../lib/dom.js';
import { getMe, getRequests, getSettings } from '../lib/state.js';
import { ymdKsa } from '../lib/dates.js';
import { submitRequest, fixWindowOpen, fixOldestDate,
         fixCountInCycle, FIX_MAX_PER_CYCLE, FIX_WINDOW_DAYS } from '../lib/requests.js';
import { fixCycleOf } from '../lib/request-windows.js';
import { sourceRecordUid } from '../lib/attendance-sources.js';

const KIND_AR = {
  missingOut: 'نسيت تسجيل الانصراف',
  missingIn:  'نسيت تسجيل الحضور',
  wrongTime:  'الوقت المسجَّل غير صحيح'
};

/* row: صفّ من buildDailyStatus — يحمل dateStr و cls و rec */
export function openFixRequest(row, after) {
  const me = getMe();
  const today = ymdKsa();

  /* ⚠️ الفحصان قبل فتح النموذج لا بعد ملئه: رفضٌ بعد أن يكتب الموظف سببه
     يجعله يعيد الكتابة بلا سبب مفهوم. */
  if (!fixWindowOpen(row.dateStr, today)) {
    toast(`التصحيح للأيام ${FIX_WINDOW_DAYS} الماضية فقط — أقدم تاريخ مقبول ${fixOldestDate(today)}`, 'err');
    return;
  }
  const cyc = fixCycleOf(row.dateStr);
  if (!cyc) {
    toast('تاريخ سجل الحضور غير صالح — حدّث الصفحة وحاول مرة ثانية', 'err');
    return;
  }
  const used = fixCountInCycle(getRequests(), me, cyc);
  if (used >= FIX_MAX_PER_CYCLE) {
    toast(`استهلكت ${FIX_MAX_PER_CYCLE} طلبات تصحيح في هذه الدورة — راجع مديرك`, 'err');
    return;
  }

  /* ⚠️ الدورة المُقفلة: مسير صُرِف لا يُعاد حسابه بطلب موظف. */
  const closed = (getSettings().closedCycles || []).includes(cyc.key);
  if (closed) {
    toast('دورة هذا الشهر أُغلقت ومسيرها اعتُمد — التصحيح لم يعد ممكناً', 'err');
    return;
  }

  /* ⚠️ `missingIn` صارت حالة يوم قائمة بذاتها (قرار ٢٠٢٦-٠٨-١٣) وتُطابق
     نوع الطلب باسمه. و«غائب» تبقى تحتها أيضاً: من لم يبصم طرفاً واحداً
     يطلب تصحيح دخوله — وهو ما كان يفعله قبل وجود الحالة الجديدة. */
  const kind = (row.cls === 'missingIn' || row.cls === 'absent') ? 'missingIn'
             : row.cls === 'missing' ? 'missingOut' : 'wrongTime';

  const m = openModal(`
    <h3>طلب تصحيح بصمة — ${esc(row.dateStr)}</h3>
    <div class="callout callout--info">
      <b>هذا طلبك ${used + 1} من ${FIX_MAX_PER_CYCLE} في هذه الدورة.</b>
      <div class="help">يعتمده مديرك ثم الموارد البشرية. لا يُعدَّل سجلك حتى يُعتمد.</div>
    </div>
    <div class="field"><label for="fxKind">ما المشكلة؟</label>
      <select id="fxKind">
        ${Object.entries(KIND_AR).map(([k, l]) =>
          `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(l)}</option>`).join('')}
      </select></div>
    <div class="form-row">
      <div class="field"><label for="fxTime">الوقت الصحيح *</label>
        <input id="fxTime" type="time"></div>
      <div class="field"><label for="fxIdx">رقم الجلسة</label>
        <input id="fxIdx" type="number" min="1" max="12" value="1">
        <div class="help">الأولى عادةً، إلا إن كان لك أكثر من دخول وخروج ذلك اليوم.</div></div>
    </div>
    <div class="field"><label for="fxReason">السبب *</label>
      <textarea id="fxReason" rows="3" maxlength="300"
        placeholder="اشرح ما حصل — مثال: خرجت لموعد طبي ونسيت البصمة عند الباب"></textarea>
      <div class="help">١٠ أحرف على الأقل. من سيعتمد الطلب يقرأ هذا السطر ولا يعرف عن يومك غيره.</div></div>
    <div class="err" id="fxErr"></div>
    <div class="row">
      <button class="btn ghost" id="fxCancel">إلغاء</button>
      <button class="btn" id="fxOk">تقديم الطلب</button>
    </div>`);

  m.$('#fxCancel').onclick = m.close;
  m.$('#fxOk').onclick = async () => {
    const err = m.$('#fxErr'); err.textContent = '';
    const time = m.$('#fxTime').value;
    const reason = m.$('#fxReason').value.trim();
    const idx = Math.max(1, Math.min(12, parseInt(m.$('#fxIdx').value, 10) || 1)) - 1;
    const fixKind = m.$('#fxKind').value;

    if (!time) { err.textContent = 'أدخل الوقت الصحيح'; return; }
    if (reason.length < 10) { err.textContent = 'السبب لازم يكون ١٠ أحرف على الأقل'; return; }

    const btn = m.$('#fxOk'); btn.disabled = true; btn.textContent = 'جارٍ التقديم…';
    const request = {
      type: 'attendanceFix',
      date: row.dateStr,
      sessionIdx: idx,
      fixKind,
      /* الحقل الذي سيُصحَّح — تفرضه القاعدة، ويحدّده نوع المشكلة */
      field: fixKind === 'missingIn' ? 'in' : 'out',
      claimedTime: time,
      reason,
      categoryLabel: KIND_AR[fixKind],
      /* ⚠️ نفس سلسلة الاعتماد القائمة — لا مسار موافقات ثانٍ */
      chain: ['manager', 'admin'],
      step: 0,
      approvals: []
    };
    /* لا نخزّن الحقل للحالة العادية. يظهر فقط حين يستهدف الصف سجلاً بقي
       تحت UID تاريخي؛ والقاعدة تثبت أنه ضمن previousUids لهذا الموظف. */
    const targetUid = sourceRecordUid(row.rec, 'zkAttendance');
    if (targetUid && targetUid !== me.id) {
      request.attendanceUid = targetUid;
    }
    const ok = await submitRequest(request);
    if (!ok) { btn.disabled = false; btn.textContent = 'تقديم الطلب'; return; }
    m.close();
    if (after) await after();
  };
}

export { KIND_AR };
