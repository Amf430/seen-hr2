/* ═══════════════════════════════════════════════════════════════════════════
   لوح بيانات الموظف — يفتح من بطاقة الموظف في «ملفات الموظفين».

   لماذا لوح جانبي لا انتقال للبروفايل: الأدمن يمسح القائمة بحثاً عن معلومة
   واحدة (رقم جوال، تاريخ التحاق، نطاق حضور). الانتقال لصفحة كاملة ثم الرجوع
   يفقده موضعه في القائمة وفرزه في كل مرّة.

   ⚠️ الزرّ الرئيسي «تعديل البيانات» لا «إرسال رسالة» كما في مرجع التصميم:
   لا يوجد نظام مراسلة داخلية بين الموظفين في هذا النظام — القناة الوحيدة
   `hrTickets` وهي من الموظف إلى الموارد البشرية لا العكس. زرٌّ يعِد برسالة
   لا وجود لها أسوأ من غيابه.

   ⚠️ ويظهر للأدمن وحده: قاعدة `allow update` على وثيقة الموظف ترفض كتابة
   مدير القسم. الزرّ المعروض لمن يُرفض طلبه يعلّمه أن النظام معطوب.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { avatar, button } from '../lib/ui.js';
import { money, fmtDate } from '../lib/format.js';
import { roleLabel } from '../lib/perms.js';
import { describeRule } from '../lib/geo.js';
import { managerOf } from '../lib/org.js';

/* صفّ بيانات — يُسقَط كاملاً إن كانت قيمته فارغة، فلا يمتلئ اللوح بشُرَط */
function row(ico, label, value) {
  if (value == null || value === '' || value === '—') return '';
  return `<div class="pdrawer__row">
    <span class="pdrawer__k">${icon(ico)}${esc(label)}</span>
    <span class="pdrawer__v">${value}</span>
  </div>`;
}

export function openPersonDrawer(u, { isAdmin = false, onEdit, onProfile } = {}) {
  const scrim = el('div', 'pdrawer__scrim');
  const panel = el('aside', 'pdrawer');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `بيانات ${u.name || 'الموظف'}`);

  const close = () => {
    scrim.remove(); panel.remove();
    document.removeEventListener('keydown', onKey);
    opener?.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const opener = document.activeElement;

  const x = button('', 'iconbtn pdrawer__x', close, 'x');
  x.setAttribute('aria-label', 'إغلاق');
  panel.appendChild(x);

  const head = el('div', 'pdrawer__head');
  head.appendChild(avatar(u.name, 72));
  head.appendChild(el('h2', 'pdrawer__name', esc(u.name || '—')));
  head.appendChild(el('p', 'pdrawer__role',
    esc([u.jobTitle, u.department].filter(Boolean).join(' · ') || 'موظف')));
  head.appendChild(el('div', 'pdrawer__state',
    `<span class="pill pill--dot ${u.status === 'active' ? 'active' : 'suspended'}">` +
    `${u.status === 'active' ? 'نشط' : 'معلّق'}</span>`));
  panel.appendChild(head);

  const mgr = managerOf(u);
  const body = el('div', 'pdrawer__body');
  body.innerHTML =
    row('people', 'الرقم الوظيفي', esc(u.empId || '')) +
    row('doc', 'الصلاحية', esc(roleLabel(u))) +
    row('building', 'القسم', esc(u.department || '')) +
    row('network', 'المدير المباشر', esc(mgr?.name || u.manager || '')) +
    row('pin', 'نطاق الحضور', esc(describeRule(u))) +
    row('calendar', 'تاريخ الالتحاق', u.hireDate ? esc(fmtDate(u.hireDate)) : '') +
    row('clock', 'انتهاء العقد', u.contractEnd ? esc(fmtDate(u.contractEnd)) : '') +
    /* ⚠️ الراتب للأدمن في العرض فقط — مدير القسم يقرأه من السيرفر بقرار
       المالك (٢٠٢٦-٠٨-١٢). الإخفاء هنا تجميل لا حماية. */
    (isAdmin ? row('money', 'الراتب', u.salary ? `<b class="num">${esc(money(u.salary))}</b>` : '') : '');
  panel.appendChild(body);

  const acts = el('div', 'pdrawer__acts');
  if (isAdmin && onEdit) {
    acts.appendChild(button('تعديل البيانات', 'btn', () => { close(); onEdit(u); }, 'gear'));
  }
  acts.appendChild(button('الملف الكامل', 'btn ghost', () => { close(); onProfile?.(u); }, 'doc'));
  panel.appendChild(acts);

  scrim.onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, panel);
  /* التركيز ينتقل داخل اللوح فور فتحه — وإلا بقي على البطاقة خلفه */
  panel.querySelector('.btn')?.focus();
  return close;
}
