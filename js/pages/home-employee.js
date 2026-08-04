/* ═══════════════════════════════════════════════════════════════════════════
   رئيسية الموظف — ما يفتحها لأجله كل صباح، لا كل ما يخصّه.

   ⚠️ كانت تحمل ستة أقسام: الحضور، الرصيد، الطلبات، الخدمات الذاتية،
   المستندات، والبطاقة الوظيفية. والموظف يفتحها لسبب واحد — تسجيل حضوره —
   فيمرّ على خمسة أقسام لا يريدها ليصل إليه. وفي المقابل كانت قائمته
   الجانبية أربعة روابط فقط، فيبدو النظام أضيق مما هو بينما نصف ما بُني له
   مدفون في صفحة واحدة.

   الآن: الحضور ثم ما يتغيّر يومياً (الرصيد، آخر الطلبات)، وما بقي في صفحاته:
     profile-me   ملفي الوظيفي   — البطاقة والمستندات وبيانات الاتصال
     services     خدماتي         — الشهادات والخطابات
     performance  أدائي          — التزام الدورة بالأرقام
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { getMe, getSettings } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { miniRow } from '../components/request-card.js';
import { ownRequests } from './requests-mine.js';
import { go } from '../lib/nav.js';
import { docsOf, docStatus } from '../lib/documents.js';
import { contractDaysLeft } from '../lib/dates.js';
import { card, grid, stat, empty, sectionHead, button } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

/* البطاقات التي تنقل الموظف لصفحاته — بديل الأقسام التي كانت محشورة هنا */
const SHORTCUTS = [
  { page: 'performance', ico: 'chart',  title: 'أدائي',
    desc: 'حضورك وتأخيرك وغيابك في هذه الدورة بالأرقام' },
  { page: 'services',    ico: 'doc',    title: 'خدماتي',
    desc: 'تعريف بالراتب · خطاب للبنك · كشف الإجازات' },
  { page: 'profile-me',  ico: 'people', title: 'ملفي الوظيفي',
    desc: 'بطاقتك ومستنداتك وبيانات اتصالك' }
];

export function render(view) {
  const me = getMe();
  const S = getSettings();

  /* الحضور أولاً — هو ما يفتح الموظف الصفحة لأجله كل صباح */
  attendPanel(view);

  /* ── ما يحتاج انتباهه ──
     ⚠️ يُعرض هنا لا في صفحته: مستند منتهٍ أو عقد يقارب الانتهاء لا ينفع أن
     ينتظر حتى يفتح الموظف «ملفي». وهو مختصر بسطر — التفصيل في صفحته. */
  const alerts = [];
  const badDocs = docsOf(me).map(docStatus).filter((s) => s.state === 'expired' || s.state === 'soon');
  if (badDocs.length) {
    alerts.push({ page: 'profile-me',
      text: badDocs.some((s) => s.state === 'expired')
        ? `${badDocs.length} من مستنداتك منتهٍ أو يقارب الانتهاء`
        : `${badDocs.length} مستند يقارب الانتهاء`,
      kind: badDocs.some((s) => s.state === 'expired') ? 'danger' : 'warn' });
  }
  const dl = contractDaysLeft(me.contractEnd);
  if (dl !== null && dl <= 60) {
    alerts.push({ page: 'profile-me', kind: dl < 0 ? 'danger' : 'warn',
      text: dl < 0 ? `عقدك منتهٍ منذ ${Math.abs(dl)} يوم` : `عقدك ينتهي خلال ${dl} يوم` });
  }
  if (alerts.length) {
    const ac = card('');
    ac.appendChild(sectionHead({ text: 'يحتاج انتباهك', icon: 'alert' }));
    const stack = el('div', 'alert-stack');
    alerts.forEach((a) => {
      const row = el('button', 'alert-item alert-item--' + a.kind,
        `<span class="alert-item__ic">${icon('alert')}</span>`
        + `<span class="alert-item__body"><span class="alert-item__title">${esc(a.text)}</span></span>`
        + icon('back', 'alert-item__go'));
      row.onclick = () => go(a.page);
      stack.appendChild(row);
    });
    ac.appendChild(stack);
    view.appendChild(ac);
  }

  /* ── رصيد الإجازات ── */
  const types = (S.leaveTypes || []).filter((t) => t.deduct);
  if (types.length) {
    const bc = card('');
    bc.appendChild(sectionHead({ text: 'رصيد إجازاتي', icon: 'calendar' }));
    const bg = grid(4);
    types.forEach((t) => {
      const bal = (me.balances && me.balances[t.id] != null) ? me.balances[t.id] : t.balance;
      bg.appendChild(stat(bal, t.label, bal <= 0 ? 'r' : bal <= 3 ? 'a' : ''));
    });
    bc.appendChild(bg);
    view.appendChild(bc);
  }

  /* ── طلباتي — وزرّ التقديم يعيش هنا بدل بطاقة مستقلة ── */
  const recent = ownRequests().slice(0, 3);
  const rc = card('');
  rc.appendChild(sectionHead('طلباتي',
    button('تقديم طلب', 'btn sm', () => go('new'), 'plus'),
    recent.length ? button('عرض الكل', 'btn sm ghost', () => go('mine'), 'list') : null));
  if (!recent.length) rc.appendChild(empty('لا توجد طلبات بعد', 'inbox'));
  else recent.forEach((r) => rc.appendChild(miniRow(r)));
  view.appendChild(rc);

  /* ── الانتقال لبقية صفحاته ── */
  const qc = card('');
  qc.appendChild(sectionHead({ text: 'اختصارات', icon: 'dashboard' }));
  const gridEl = el('div', 'svc-grid');
  SHORTCUTS.forEach((s) => {
    const b = el('button', 'svc-card',
      `${icon(s.ico)}
       <span class="svc-card__body">
         <b>${esc(s.title)}</b>
         <span>${esc(s.desc)}</span>
       </span>`);
    b.onclick = () => go(s.page);
    gridEl.appendChild(b);
  });
  qc.appendChild(gridEl);
  view.appendChild(qc);
}
