/* ═══════════════════════════════════════════════════════════════════════════
   الشهادات الذاتية — تعريف بالراتب، خطاب تعريف، كشف الإجازات.

   ── لماذا الطباعة لا مكتبة PDF ──
   كل مكتبات توليد PDF في المتصفح (jsPDF, pdfmake) تحتاج تضمين خطّ عربي كامل
   لأن PDF لا يعرف Tajawal، فيُضاف نصف ميغابايت لكل زيارة — ثم يبقى تشكيل
   النص العربي وربط الحروف مشكلة قائمة في أكثرها.

   المتصفح نفسه يطبع العربية بشكل مثالي ويحوّلها PDF عبر «حفظ كـ PDF» في
   نافذة الطباعة. مجاني، بلا مكتبة، وبخط النظام الصحيح.

   ⚠️ الشهادة تُبنى في نافذة مستقلة لا في الصفحة: الطباعة من الصفحة نفسها
   تحتاج @media print تُخفي كل شيء آخر، وأي شاشة جديدة تُضاف لاحقاً تكسرها
   بصمت. النافذة المستقلة تحمل مستندها وحدها ولا تتأثر بما بعدها.

   ⚠️⚠️ ولهذا زرّ الرجوع هنا، داخل الوثيقة، لا في ترويسة النظام.
   هذه النافذة ليست صفحة من التطبيق: لا قشرة له ولا ترويسة ولا راوتر، فزرّ
   الرجوع في topbar لا وجود له فيها أصلاً. والموظف الذي يفتح «تعريف بالراتب»
   من أيقونة الشاشة الرئيسية يصل إلى مستند بلا شريط عنوان وبلا أي مخرج —
   يظنّ النظام علِق. كل وثيقة تمرّ من shell() فيصلها الزرّ، فلا تُنسى واحدة
   حين تُضاف شهادة رابعة. */

import { esc } from './dom.js';
import { leaveBalanceOf } from './leave-balance.js';
import { money, fmtDate } from './format.js';
import { getSettings } from './state.js';
import { payrollConfig } from './payroll.js';

const COMPANY = 'شركة سين العقارية';

/* ⚠️ عنوان مطلق لا نسبي. الوثيقة تُبنى في نافذة about:blank عبر
   document.write، وقاعدة العنوان فيها ليست صفحتنا — فمسار نسبي مثل
   img/mark.png لا يُحلّ، فتُطبع الوثيقة بلا شعار. new URL تبنيه من عنوان
   الصفحة الحالية، والنافذة من نفس الأصل فتقرؤه بلا مانع. */
/* 192 لا 1024: الشعار يُعرض 56px، وعند طباعة 300dpi يقارب 175px — فـ192
   تكفي بهامش، و1024 تعني 47 ك.ب تُحمَّل بلا فائدة في كل شهادة. */
const markUrl = () => new URL('img/icon-192.png', location.href).href;

/* ⚠️ كل قيمة تمرّ عبر esc(): المستند يُبنى بـ innerHTML في نافذة جديدة،
   واسم الموظف بيانات يكتبها الأدمن. حقن هنا يعمل في سياق نطاقنا. */
function shell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>${esc(title)} — ${COMPANY}</title>
<style>
  @page { size: A4; margin: 22mm 18mm; }
  *{box-sizing:border-box}
  body{font-family:'Tajawal',system-ui,'Segoe UI','Noto Sans Arabic',Tahoma,sans-serif;
    color:#241d1a;line-height:1.95;margin:0;font-size:15px}
  .head{display:flex;align-items:center;gap:14px;
    border-bottom:2px solid #240215;padding-bottom:14px;margin-bottom:26px}
  .seal{width:56px;height:56px;flex:none;object-fit:contain}
  /* ⚠️ الطباعة تُسقط الصور والخلفيات افتراضياً في بعض المتصفحات. هذه
     تُجبرها على طباعة الشعار — وثيقة رسمية بلا شعار ليست وثيقة. */
  @media print{ .seal{ -webkit-print-color-adjust:exact; print-color-adjust:exact } }
  .head b{display:block;font-size:19px;color:#240215}
  .head span{display:block;font-size:12px;color:#6f645d}
  h1{font-size:20px;margin:0 0 6px;text-align:center;color:#240215}
  .meta{text-align:center;font-size:12px;color:#6f645d;margin-bottom:26px}
  table{width:100%;border-collapse:collapse;margin:18px 0}
  th,td{border:1px solid #e7ded7;padding:9px 12px;text-align:right;font-size:14px}
  th{background:#f7eeee;color:#240215;font-weight:700;width:38%}
  td.num,th.num{font-variant-numeric:tabular-nums}
  p{margin:0 0 12px}
  .sign{margin-top:52px;display:flex;justify-content:space-between;gap:30px}
  .sign div{flex:1;text-align:center;font-size:13px}
  .sign .line{border-top:1px solid #241d1a;margin-top:52px;padding-top:7px;color:#6f645d}
  .foot{margin-top:34px;border-top:1px solid #e7ded7;padding-top:12px;
    font-size:11px;color:#6f645d;text-align:center}
  .no-print{margin:18px 0;text-align:center;display:flex;gap:10px;justify-content:center;
    flex-wrap:wrap}
  .no-print button{font:inherit;font-size:15px;padding:10px 26px;border:0;border-radius:9px;
    background:#240215;color:#fff;cursor:pointer;min-height:44px}
  /* زرّ العودة ثانوي: الطباعة هي سبب فتح الوثيقة، والعودة مخرجها */
  .no-print button.back{background:#fff;color:#240215;border:1px solid #d9cec6}
  .close-hint{text-align:center;font-size:13px;color:#6f645d;margin:0}
  @media print{ .no-print,.close-hint{display:none} }
</style></head><body>
<div class="head">
  <img class="seal" src="${esc(markUrl())}" alt="${esc(COMPANY)}">
  <div><b>${COMPANY}</b><span>إدارة الموارد البشرية</span></div>
</div>
${bodyHtml}
<div class="foot">
  صدرت هذه الوثيقة إلكترونياً من نظام إدارة الموارد البشرية بتاريخ ${esc(fmtDate(new Date()))}.
</div>
<div class="no-print">
  <button onclick="window.print()">طباعة / حفظ PDF</button>
  <button class="back" id="backBtn">رجوع</button>
</div>
<p class="close-hint" id="closeHint" hidden>أغلق هذه النافذة من المتصفح للعودة إلى النظام.</p>
<script>
/* ⚠️ window.close() تنجح على نافذة فتحها سكربت، لكن آيفون في وضع standalone
   قد يفتحها في سفاري نفسه — تطبيق آخر لا تملك هذه الصفحة إغلاقه. فبدل زرّ
   يبدو معطّلاً بلا تفسير، نُظهر السطر الذي يقول للموظف ماذا يفعل. */
document.getElementById('backBtn').onclick = function () {
  window.close();
  setTimeout(function () {
    if (!window.closed) document.getElementById('closeHint').hidden = false;
  }, 400);
};
</script>
</body></html>`;
}

function present(title, html) {
  const w = window.open('', '_blank');
  /* حاجب النوافذ المنبثقة قد يمنعها — نُبلغ المنادي بدل أن نفشل بصمت */
  if (!w) return false;
  w.document.write(shell(title, html));
  w.document.close();
  return true;
}

/* ═══ تعريف بالراتب ═══ */
export function salaryCertificate(u) {
  const cfg = payrollConfig();
  const day  = u.salary ? u.salary / (cfg.daysPerMonth || 30) : 0;
  const hour = day / (cfg.hoursPerDay || 8);
  return present('تعريف بالراتب', `
    <h1>شهادة تعريف بالراتب</h1>
    <div class="meta">To Whom It May Concern</div>
    <p>تشهد ${COMPANY} بأن الموظف المذكور أدناه يعمل لديها، وبأن بياناته الوظيفية كما يلي:</p>
    <table>
      <tr><th>الاسم</th><td>${esc(u.name || '—')}</td></tr>
      <tr><th>الرقم الوظيفي</th><td class="num">${esc(u.empId || '—')}</td></tr>
      <tr><th>المسمى الوظيفي</th><td>${esc(u.jobTitle || '—')}</td></tr>
      <tr><th>القسم / الإدارة</th><td>${esc(u.department || '—')}</td></tr>
      <tr><th>تاريخ المباشرة</th><td class="num">${esc(u.hireDate || '—')}</td></tr>
      <tr><th>الراتب الشهري الأساسي</th><td class="num">${u.salary ? esc(money(u.salary)) + ' ريال سعودي' : '—'}</td></tr>
      <tr><th>قيمة اليوم</th><td class="num">${u.salary ? esc(money(day)) + ' ريال' : '—'}</td></tr>
      <tr><th>قيمة الساعة</th><td class="num">${u.salary ? esc(money(hour)) + ' ريال' : '—'}</td></tr>
      <tr><th>حالة الموظف</th><td>${u.status === 'active' ? 'على رأس العمل' : 'موقوف'}</td></tr>
    </table>
    <p>وقد أُعطيت له هذه الشهادة بناءً على طلبه، دون أدنى مسؤولية على الشركة تجاه الغير.</p>
    <div class="sign">
      <div><div class="line">مدير الموارد البشرية</div></div>
      <div><div class="line">الختم الرسمي</div></div>
    </div>`);
}

/* ═══ خطاب تعريف للبنك ═══ */
export function bankLetter(u, bankName) {
  return present('خطاب تعريف', `
    <h1>خطاب تعريف بموظف</h1>
    <div class="meta">${bankName ? 'إلى: ' + esc(bankName) : 'إلى من يهمه الأمر'}</div>
    <p>السلام عليكم ورحمة الله وبركاته،</p>
    <p>تفيدكم ${COMPANY} بأن الموظف <b>${esc(u.name || '—')}</b>،
       الرقم الوظيفي <b>${esc(u.empId || '—')}</b>، يشغل وظيفة
       <b>${esc(u.jobTitle || '—')}</b> في ${esc(u.department || '—')}،
       ومباشر للعمل لدينا منذ <b>${esc(u.hireDate || '—')}</b>،
       وراتبه الشهري الأساسي <b>${u.salary ? esc(money(u.salary)) + ' ريال سعودي' : '—'}</b>.</p>
    <p>حُرِّر هذا الخطاب بناءً على طلب الموظف لتقديمه لجهتكم الموقّرة،
       ولا تتحمّل الشركة أي التزام مالي تجاه أي طرف بموجبه.</p>
    <div class="sign">
      <div><div class="line">مدير الموارد البشرية</div></div>
      <div><div class="line">الختم الرسمي</div></div>
    </div>`);
}

/* ═══ كشف أرصدة الإجازات ═══

   ⚠️ الحسبة القديمة كانت: المستهلك = t.balance − bal، أي الرصيد السنوي
   **العام لنوع الإجازة** ناقص المتبقّي. وهي تنكسر في حالتين:

     • موظف له مستحقّ سنوي مختلف عن العام (٢٥ بدل ٢١) → رقم مستهلك خاطئ
     • لحظة تشغيل الاستحقاق التدريجي → «المستهلك» يصير الفرق بين المستحقّ
       الكامل وما استُحقّ حتى اليوم، فيظهر موظف لم يأخذ يوماً واحداً وقد
       «استهلك» تسعة أيام.

   وهذه شهادة **تُطبع وتُسلَّم لجهة خارجية** — بنك أو سفارة أو جهة حكومية.
   فالرقم فيها يجب أن يكون مشتقّاً من نفس المصدر الذي تعرضه الشاشة، لا
   محسوباً هنا بطريقة ثانية. */
export function leaveStatement(u, pendingRequests = []) {
  const types = (getSettings().leaveTypes || []).filter((t) => t.deduct);
  if (!types.length) return present('كشف الإجازات',
    '<h1>كشف أرصدة الإجازات</h1><p>لا توجد أنواع إجازات معرَّفة في النظام.</p>');

  const now = new Date();
  const rows = types.map((t) => {
    const b = leaveBalanceOf(u, t, now, pendingRequests);
    return `<tr>
      <td>${esc(t.label)}</td>
      <td class="num">${esc(b.annualDays || t.balance)}</td>
      <td class="num">${esc(b.opening)}</td>
      <td class="num">${esc(b.accrued)}</td>
      <td class="num">${esc(b.used)}</td>
      <td class="num"><b>${esc(b.remaining)}</b></td></tr>`;
  }).join('');

  return present('كشف الإجازات', `
    <h1>كشف أرصدة الإجازات</h1>
    <div class="meta">${esc(u.name || '')} · الرقم الوظيفي ${esc(u.empId || '—')} ·
      ${esc(u.department || '—')}</div>
    <table>
      <thead><tr><th>نوع الإجازة</th><th class="num">المستحقّ السنوي</th>
        <th class="num">رصيد مرحَّل</th><th class="num">مستحقّ حتى اليوم</th>
        <th class="num">المستهلك</th><th class="num">المتبقّي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>الأرصدة أعلاه محدَّثة لحظة إصدار الكشف، وتشمل الإجازات المعتمدة فقط —
       الطلبات تحت المراجعة لم تُخصم بعد.</p>
    <div class="sign">
      <div><div class="line">مدير الموارد البشرية</div></div>
      <div><div class="line">توقيع الموظف</div></div>
    </div>`);
}
