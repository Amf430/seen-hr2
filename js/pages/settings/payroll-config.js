import { el, toast } from '../../lib/dom.js';
import { getSettings } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { payrollConfig } from '../../lib/payroll.js';
import { money } from '../../lib/format.js';
import { logAction } from '../../lib/audit.js';
import { card, button, callout } from '../../lib/ui.js';

export function render(view) {
  const S = getSettings();
  const cfg = payrollConfig();

  const c = card('⚖️ إعدادات حساب الرواتب',
    'تُستخدم في «مسير الرواتب» وفي تحليلات كل موظف. الافتراضي: الراتب ÷ 30 ÷ 8 = قيمة الساعة.');

  const body = el('div', '');
  body.innerHTML = `
    <div class="form-row">
      <div class="field"><label for="pcDays">أيام الشهر للحساب</label>
        <input id="pcDays" type="number" min="1" max="31" value="${cfg.daysPerMonth}">
        <div class="help">قيمة اليوم = الراتب ÷ هذا الرقم</div></div>
      <div class="field"><label for="pcHours">ساعات اليوم للحساب</label>
        <input id="pcHours" type="number" min="1" max="24" step="0.5" value="${cfg.hoursPerDay}">
        <div class="help">قيمة الساعة = قيمة اليوم ÷ هذا الرقم</div></div>
    </div>
    <div class="form-row">
      <div class="field"><label for="pcGrace">سماح التأخير (دقيقة) — لا يُخصم</label>
        <input id="pcGrace" type="number" min="0" max="120" value="${cfg.graceMinutes || 0}">
        <div class="help">يُطرح من دقائق التأخير قبل حساب الخصم.</div></div>
      <div class="field"><label>معاينة</label>
        <div class="preview-box" id="pcPreview"></div></div>
    </div>`;
  c.appendChild(body);

  const prev = () => {
    const d = Number(body.querySelector('#pcDays').value) || 30;
    const h = Number(body.querySelector('#pcHours').value) || 8;
    body.querySelector('#pcPreview').innerHTML =
      `راتب <b>6,000</b> ← قيمة اليوم <b>${money(6000 / d)}</b> · قيمة الساعة <b>${money(6000 / d / h)}</b>`;
  };
  ['pcDays', 'pcHours'].forEach((id) => { body.querySelector('#' + id).oninput = prev; });
  prev();

  c.appendChild(button('حفظ إعدادات الرواتب', 'btn sm mt-3', async () => {
    S.payroll = {
      daysPerMonth: Number(body.querySelector('#pcDays').value) || 30,
      hoursPerDay:  Number(body.querySelector('#pcHours').value) || 8,
      graceMinutes: Number(body.querySelector('#pcGrace').value) || 0
    };
    await saveSettings();
    await logAction('تعديل إعدادات الرواتب',
      `يوم=${S.payroll.daysPerMonth} ساعة=${S.payroll.hoursPerDay} سماح=${S.payroll.graceMinutes}د`);
    toast('حُفظت إعدادات الرواتب', 'ok');
  }));
  view.appendChild(c);

  view.appendChild(callout('warn', 'التغيير يسري بأثر رجعي',
    'المسير يُحسب لحظياً من هذه القيم، فتعديلها يغيّر أرقام الدورات السابقة أيضاً عند فتحها. صدّر المسير قبل التعديل لو تحتاج نسخة من الأرقام القديمة.'));

  /* القواعد المعتمدة — مكتوبة كما ينفّذها الكود بالضبط */
  const rc = card('📐 قواعد الاحتساب المعتمدة');
  rc.innerHTML += `
    <div class="detail-list">
      <div class="detail-line"><span class="k">قيمة اليوم</span><span class="v">الراتب ÷ ${cfg.daysPerMonth}</span></div>
      <div class="detail-line"><span class="k">قيمة الساعة</span><span class="v">قيمة اليوم ÷ ${cfg.hoursPerDay}</span></div>
      <div class="detail-line"><span class="k">التأخير والخروج المبكر</span><span class="v">بالدقائق × قيمة الساعة</span></div>
      <div class="detail-line"><span class="k">الغياب</span><span class="v">يوم كامل × قيمة اليوم</span></div>
      <div class="detail-line"><span class="k">إجازة مدفوعة</span><span class="v">بلا خصم</span></div>
      <div class="detail-line"><span class="k">إجازة بدون راتب</span><span class="v">خصم يوم كامل</span></div>
      <div class="detail-line"><span class="k">استئذان معتمد</span><span class="v">معفى من الخصم</span></div>
      <div class="detail-line"><span class="k">نسيان بصمة الانصراف</span><span class="v">تُحتسب ساعات الوردية ناقص التأخير</span></div>
      <div class="detail-line"><span class="k">مصدر الحضور</span><span class="v">بصمات جهاز ZKTeco فقط</span></div>
    </div>`;
  view.appendChild(rc);
}
