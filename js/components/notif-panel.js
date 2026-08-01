/* ═══════════════════════════════════════════════════════════════════════════
   جرس الإشعارات ولوحته.

   يقرأ من notifications.js، وهي تشتقّ كل شيء من البيانات المتدفّقة أصلاً —
   فلا استعلام هنا ولا انتظار. فتح اللوحة عملية محلية بحتة.

   ⚠️ نافذة لا قائمة منسدلة: القائمة المنسدلة تحتاج تموضعاً مطلقاً يتكسّر على
   الجوال (الشريط العلوي ضيّق، والقائمة تخرج خارج الشاشة)، ونظامنا RTL فيتضاعف
   الالتباس. openModal مستعملة في كل النظام وتتكفّل بقفل التمرير وEscape
   وإرجاع التركيز.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { openModal } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { go } from '../lib/nav.js';
import { icon } from '../lib/icons.js';
import { fmtDate } from '../lib/format.js';
import { notifications, unreadCount, markSeen, markAllSeen } from '../lib/notifications.js';

/* وقت مقروء بشريّاً — «قبل ٣ ساعات» أوضح من طابع زمني كامل في قائمة */
function ago(at) {
  if (!at) return '';
  const ms = at.toMillis ? at.toMillis() : +new Date(at);
  if (!ms || isNaN(ms)) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1)   return 'الآن';
  if (min < 60)  return `قبل ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24)    return `قبل ${h} ساعة`;
  const d = Math.round(h / 24);
  if (d <= 7)    return `قبل ${d} يوم`;
  return fmtDate(new Date(ms));
}

export function openNotifPanel() {
  const m = openModal(`
    <div class="row-between">
      <h3>الإشعارات</h3>
      <button class="btn sm ghost" id="nfAll">تعليم الكل كمقروء</button>
    </div>
    <div class="nf-list" id="nfList" role="list"></div>
    <div class="row"><button class="btn ghost" id="nfClose">إغلاق</button></div>`);

  const list = m.$('#nfList');
  m.$('#nfClose').onclick = m.close;
  m.$('#nfAll').onclick = () => { markAllSeen(); draw(); paintBell(); };

  function draw() {
    const items = notifications();
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = `<div class="cp-empty">${icon('check', 'ic--empty')}<div>لا شيء جديد — كل شيء على ما يُرام.</div></div>`;
      m.$('#nfAll').style.display = 'none';
      return;
    }
    m.$('#nfAll').style.display = items.some((n) => !n.read) ? '' : 'none';

    items.forEach((n) => {
      const row = el('button', 'nf-row' + (n.read ? ' is-read' : '') + (n.tone ? ' nf-row--' + n.tone : ''),
        `${icon(n.ico)}
         <span class="nf-row__body">
           <b>${esc(n.title)}</b>
           ${n.body ? `<span>${esc(n.body)}</span>` : ''}
         </span>
         <span class="nf-row__side">
           ${n.at ? `<span class="nf-row__ago">${esc(ago(n.at))}</span>` : ''}
           ${n.read ? '' : '<span class="nf-dot" aria-label="غير مقروء"></span>'}
         </span>`);
      row.setAttribute('role', 'listitem');
      row.onclick = () => {
        markSeen(n.id);
        m.close();
        paintBell();
        if (n.page) go(n.page, n.arg || '');
      };
      list.appendChild(row);
    });
  }

  draw();
}

/* ═══ الجرس في الشريط العلوي ═══
   يُعاد رسم عدّاده من subscriptions.js مع كل لقطة جديدة — نفس نقطة
   updateBadges بالضبط، فلا يتباعد الرقمان. */
export function paintBell() {
  const btn = document.getElementById('notifBell');
  if (!btn) return;
  if (!getMe()) { btn.hidden = true; return; }
  btn.hidden = false;

  const n = unreadCount();
  btn.querySelector('.badge')?.remove();
  if (n) {
    const b = el('span', 'badge', n > 99 ? '99+' : String(n));
    b.setAttribute('aria-hidden', 'true');
    btn.appendChild(b);
  }
  btn.setAttribute('aria-label', n ? `الإشعارات — ${n} غير مقروء` : 'الإشعارات');
}

let bound = false;
export function bindBell() {
  if (bound) return;
  bound = true;
  const btn = document.getElementById('notifBell');
  if (btn) btn.onclick = openNotifPanel;
}
