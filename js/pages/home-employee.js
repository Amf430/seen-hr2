import { el, esc } from '../lib/dom.js';
import { getMe, getSettings } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { miniRow } from '../components/request-card.js';
import { ownRequests } from './requests-mine.js';
import { go } from '../lib/nav.js';
import { contractDaysLeft } from '../lib/dates.js';
import { card, grid, stat, empty, sectionHead, button, contractCell } from '../lib/ui.js';
import { describeRule } from '../lib/geo.js';

export function render(view) {
  const me = getMe();
  const S = getSettings();

  /* الحضور أولاً — هو ما يفتح الموظف الصفحة لأجله كل صباح */
  attendPanel(view);

  /* رصيد الإجازات */
  const bc = card('رصيد إجازاتي');
  const bg = grid(4);
  const types = (S.leaveTypes || []).filter((t) => t.deduct);
  types.forEach((t) => {
    const bal = (me.balances && me.balances[t.id] != null) ? me.balances[t.id] : t.balance;
    bg.appendChild(stat(bal, t.label, bal <= 0 ? 'r' : bal <= 3 ? 'a' : ''));
  });
  if (!types.length) bg.appendChild(el('p', 'desc', 'لا توجد أرصدة معرّفة.'));
  bc.appendChild(bg);
  view.appendChild(bc);

  /* طلباتي — وزرّ التقديم يعيش هنا بدل بطاقة مستقلة */
  const recent = ownRequests().slice(0, 3);
  const rc = card('');
  rc.appendChild(sectionHead('طلباتي',
    button('➕ تقديم طلب', 'btn sm', () => go('new')),
    recent.length ? button('عرض الكل', 'btn sm ghost', () => go('mine')) : null));
  if (!recent.length) rc.appendChild(empty('لا توجد طلبات بعد', '📭'));
  else recent.forEach((r) => rc.appendChild(miniRow(r)));
  view.appendChild(rc);

  /* بطاقتي الوظيفية */
  const dl = contractDaysLeft(me.contractEnd);
  const ic = card('بطاقتي الوظيفية');
  ic.innerHTML += `
    <div class="detail-list">
      <div class="detail-line"><span class="k">الرقم الوظيفي</span><span class="v num">${esc(me.empId || '—')}</span></div>
      <div class="detail-line"><span class="k">القسم</span><span class="v">${esc(me.department || '—')}</span></div>
      <div class="detail-line"><span class="k">المسمى الوظيفي</span><span class="v">${esc(me.jobTitle || '—')}</span></div>
      <div class="detail-line"><span class="k">المدير المباشر</span><span class="v">${esc(me.manager || '—')}</span></div>
      <div class="detail-line"><span class="k">تاريخ المباشرة</span><span class="v num">${esc(me.hireDate || '—')}</span></div>
      <div class="detail-line"><span class="k">انتهاء العقد</span><span class="v">${contractCell(me.contractEnd)}</span></div>
      <div class="detail-line"><span class="k">تسجيل الحضور</span><span class="v">${esc(describeRule(me))}</span></div>
    </div>`;
  if (dl !== null && dl >= 0 && dl <= 60) {
    ic.appendChild(el('p', 'help', `⏳ عقدك ينتهي خلال ${dl} يوم — راجع الموارد البشرية.`));
  }
  view.appendChild(ic);
}
