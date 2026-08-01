/* ═══════════════════════════════════════════════════════════════════════════
   نافذة التصحيح اليدوي لسجل الحضور.

   ⚠️ لا تعدّل الجلسة الأصلية إطلاقاً. تكتب قيداً في attendanceAdjustments
   يُقرأ فوق الأصل. الأصل يبقى للأبد، والتصحيح يُعرض بجانبه بسببه واسم من
   أجراه — فمن يراجع السجل يرى الاثنين ويعرف ماذا جرى.

   ⚠️ السبب إلزامي وتفرضه القاعدة على السيرفر (٣ أحرف على الأقل)، لا الواجهة
   وحدها. تصحيح بلا سبب لا يختلف عن التزوير.
   ═══════════════════════════════════════════════════════════════════════════ */

import { openModal, esc, toast } from '../lib/dom.js';
import { hm, tsToDate, fmtDate } from '../lib/format.js';
import { sessionsOf } from '../lib/attendance.js';
import { addAdjustment } from '../lib/adjustments.js';
import { hmToDate } from '../lib/dates.js';
import { rerender } from '../lib/nav.js';

export function openAdjust(rec, sessionIdx, coll) {
  const s = sessionsOf(rec)[sessionIdx] || {};
  const inD = tsToDate(s.in), outD = tsToDate(s.out);
  const dayDate = new Date(rec.date + 'T00:00:00');

  const m = openModal(`
    <h3>تصحيح سجل حضور</h3>
    <div class="callout callout--warn">
      <b class="callout__title">السجل الأصلي لا يُمسّ</b>
      <div class="help">يُضاف قيد تصحيح يُقرأ فوقه ويظهر بجانبه في كل شاشة وتقرير،
      ويُسجَّل في سجل الحركات باسمك. لا يمكن حذفه بعد الحفظ — الخطأ يُصحَّح بقيد مضادّ.</div>
    </div>

    <div class="detail-list">
      <div class="detail-line"><span class="k">الموظف</span><span class="v">${esc(rec.employeeName || '—')}</span></div>
      <div class="detail-line"><span class="k">التاريخ</span><span class="v">${esc(fmtDate(dayDate))} · ${esc(rec.date)}</span></div>
      <div class="detail-line"><span class="k">الجلسة</span><span class="v num">${sessionIdx + 1}</span></div>
      <div class="detail-line"><span class="k">المصدر</span><span class="v">${
        coll === 'zkAttendance' ? 'جهاز البصمة' : 'تسجيل الجوال'}</span></div>
    </div>

    <div class="form-row">
      <div class="field">
        <label for="adjField">الحقل المراد تصحيحه</label>
        <select id="adjField">
          <option value="out">وقت الانصراف — الحالي ${outD ? hm(outD) : 'غير مسجّل'}</option>
          <option value="in">وقت الحضور — الحالي ${inD ? hm(inD) : 'غير مسجّل'}</option>
        </select>
      </div>
      <div class="field">
        <label for="adjTime">الوقت الصحيح</label>
        <input id="adjTime" type="time" value="${outD ? esc(hm(outD)) : ''}">
      </div>
    </div>

    <div class="form-row one">
      <div class="field">
        <label for="adjReason">سبب التصحيح (إلزامي — يظهر في السجل) *</label>
        <textarea id="adjReason" placeholder="مثال: نسي بصمة الانصراف، وأكّد مديره المباشر خروجه الساعة 16:10"></textarea>
      </div>
    </div>

    <div class="err" id="adjErr"></div>
    <div class="row">
      <button class="btn ghost" id="adjCancel">تراجع</button>
      <button class="btn" id="adjSave">حفظ التصحيح</button>
    </div>`);

  /* تبديل الحقل يملأ الوقت بالقيمة الحالية له — لا بقيمة الحقل الآخر */
  m.$('#adjField').onchange = (e) => {
    const d = e.target.value === 'in' ? inD : outD;
    m.$('#adjTime').value = d ? hm(d) : '';
  };
  m.$('#adjCancel').onclick = m.close;

  m.$('#adjSave').onclick = async () => {
    const err = m.$('#adjErr'); err.textContent = '';
    const field  = m.$('#adjField').value;
    const time   = m.$('#adjTime').value;
    const reason = m.$('#adjReason').value.trim();

    if (!time)             { err.textContent = 'أدخل الوقت الصحيح'; return; }
    if (reason.length < 3) { err.textContent = 'اكتب سبب التصحيح — إلزامي وتفرضه قواعد الأمان'; return; }

    let value = hmToDate(dayDate, time);
    if (!value) { err.textContent = 'صيغة الوقت غير صحيحة'; return; }

    /* ⚠️ وردية تعبر منتصف الليل: انصراف الساعة 01:00 يخصّ اليوم التالي.
       بلا هذا التعديل تصير المدة سالبة فتُقرأ صفراً في كل حساب. */
    if (field === 'out' && inD && value < inD) value = new Date(value.getTime() + 86400000);

    const btn = m.$('#adjSave');
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      await addAdjustment({ rec, coll, sessionIdx, field, value, reason });
      m.close();
      toast('حُفظ التصحيح — الأصل باقٍ كما هو', 'ok');
      rerender();
    } catch (e) {
      console.error(e);
      err.textContent = e.code === 'permission-denied'
        ? 'رُفض الحفظ — التصحيح لمدير النظام وحده'
        : 'تعذّر حفظ التصحيح';
      btn.disabled = false; btn.textContent = 'حفظ التصحيح';
    }
  };
}
