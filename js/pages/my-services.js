/* ═══════════════════════════════════════════════════════════════════════════
   خدماتي — الأوراق التي كان الموظف يطلبها من الموارد البشرية.

   كل واحدة من هذه الثلاث كانت تستهلك عشر دقائق من موظف الموارد البشرية،
   والبيانات كلها موجودة في النظام أصلاً.

   ⚠️ تُفتح في نافذة مستقلة تحمل مستندها وحدها — لا تُطبع الصفحة الحالية.
   الطباعة من الصفحة نفسها تحتاج @media print تُخفي كل شيء آخر، وأي قسم
   يُضاف لاحقاً يكسرها بصمت (انظر certificates.js).
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, openModal, toast } from '../lib/dom.js';
import { getMe, getSettings } from '../lib/state.js';
import { card, sectionHead, button, callout, pageHead, statCard } from '../lib/ui.js';
import { salaryCertificate, bankLetter, leaveStatement } from '../lib/certificates.js';
import { icon } from '../lib/icons.js';
import { go } from '../lib/nav.js';

/* حاجب النوافذ المنبثقة يمنعها بصمت — نُبلغ الموظف بدل أن يظنّ الزر معطّلاً */
const openOr = (fn) => () => { if (!fn()) toast('اسمح بالنوافذ المنبثقة لهذا الموقع', 'err'); };

const SERVICES = [
  { id: 'salary', ico: 'money', title: 'تعريف بالراتب',
    desc: 'شهادة رسمية بالراتب والمسمّى وتاريخ المباشرة — لمن يطلبها منك.',
    run: (me) => openOr(() => salaryCertificate(me)) },
  { id: 'bank', ico: 'doc', title: 'خطاب تعريف للبنك',
    desc: 'موجَّه لبنك تحدّده باسمه، أو «إلى من يهمه الأمر».',
    run: (me) => () => askBank(me) },
  { id: 'leave', ico: 'list', title: 'كشف أرصدة إجازاتي',
    desc: 'رصيدك السنوي والمستهلك والمتبقّي لكل نوع إجازة.',
    run: (me) => openOr(() => leaveStatement(me)) }
];

export function render(view) {
  const me = getMe();
  const S = getSettings();

  /* ⚠️ رأس صفحة لا بطاقة عنوان (الهوية الجديدة) */
  view.appendChild(pageHead('خدماتي الذاتية',
    'تُصدَر فوراً بلا مراجعة أحد، وتُفتح في نافذة جديدة جاهزة للطباعة أو الحفظ كـ PDF.',
    button('تقديم طلب', 'btn sm', () => go('new'), 'plus'),
    button('ملفي الوظيفي', 'btn sm ghost', () => go('profile-me'), 'people')));

  /* ── الخدمات ── */
  const list = el('div', 'svc-grid');
  SERVICES.forEach((s) => {
    const b = el('button', 'svc-card',
      `${icon(s.ico)}
       <span class="svc-card__body">
         <b>${esc(s.title)}</b>
         <span>${esc(s.desc)}</span>
       </span>`);
    b.onclick = s.run(me);
    list.appendChild(b);
  });
  const sc = card('');
  sc.appendChild(list);
  /* ⚠️ الراتب غير محدَّد يعني شهادة فارغة — يُقال قبل الضغط لا بعده */
  if (!me.salary) {
    sc.appendChild(callout('warn', 'راتبك غير مُحدَّد في النظام',
      'سيظهر فارغاً في «تعريف بالراتب» و«خطاب البنك». راجع الموارد البشرية.'));
  }
  view.appendChild(sc);

  /* ── رصيد الإجازات — السياق الذي يُطلب الكشف لأجله ── */
  const types = (S.leaveTypes || []).filter((t) => t.deduct);
  if (types.length) {
    const bc = card('');
    bc.appendChild(sectionHead({ text: 'رصيدي الحالي', icon: 'calendar' }));
    /* ⚠️ بطاقة لكل نوع لا رقم عارٍ: الرقم يقول «كم»، والسطر تحته يقول
       «ماذا يعني» — رصيد صفر ورصيد يومين حالتان مختلفتان تماماً. */
    const bg = el('div', 'statgrid');
    types.forEach((t) => {
      const bal = (me.balances && me.balances[t.id] != null) ? me.balances[t.id] : t.balance;
      bg.appendChild(statCard({ label: t.label, value: bal, ico: 'calendar',
        tone: bal <= 0 ? 'bad' : bal <= 3 ? 'warn' : 'good',
        sub: bal <= 0 ? 'لا رصيد متبقٍّ' : bal <= 3 ? 'رصيد منخفض' : 'يوماً متاحاً' }));
    });
    bc.appendChild(bg);
    bc.appendChild(el('p', 'help',
      'الأرصدة تشمل الإجازات المعتمدة فقط — الطلبات تحت المراجعة لم تُخصم بعد.'));
    view.appendChild(bc);
  }

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
