/* ═══════════════════════════════════════════════════════════════════════════
   بطاقة «أفضل المنتظمين هذا الأسبوع»

   واحدة تُعرض في رئيسية الموظف وفي لوحة الأدمن معاً. مكوّن مشترك لا نسختان:
   لوحتان تعرضان نفس الترتيب بشكلين مختلفين تجعلان الموظف يشكّ في الرقم.

   ⚠️ تعرض الاسم والقسم والنسبة فقط. هذه لوحة تحفيز لا تقرير التزام —
   والأخير موجود للأدمن في «تحليلات» وفي بروفايل كل موظف. عرض من هو الأسوأ
   على الجميع عقوبةٌ علنية، وليست ما طُلب.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { card, sectionHead } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { fmtDate, tsToDate } from '../lib/format.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/* data: الوثيقة المنشورة {top, from, to, minDays, at} — أو null */
export function topPunctualCard(data, { meName = '' } = {}) {
  if (!data || !data.top || !data.top.length) return null;

  const c = card('');
  c.appendChild(sectionHead({ text: 'أفضل المنتظمين هذا الأسبوع', icon: 'chart' }));
  c.appendChild(el('p', 'desc',
    `أعلى نسبة دخول في الوقت خلال ${esc(data.from)} ← ${esc(data.to)}. ` +
    `تُحتسب من بصمة الجهاز أو الجوال — أيّهما أبكر.`));

  const list = el('div', 'tp-list');
  data.top.forEach((x, i) => {
    /* الموظف نفسه يُميَّز — أن ترى اسمك في القائمة هو المقصود كلّه */
    const isMe = meName && x.name === meName;
    const row = el('div', 'tp-row' + (isMe ? ' is-me' : ''));
    row.innerHTML = `
      <span class="tp-medal" aria-hidden="true">${MEDALS[i] || (i + 1)}</span>
      <span class="tp-who">
        <b>${esc(x.name)}${isMe ? ' <span class="tp-you">أنت</span>' : ''}</b>
        <small>${esc(x.department || '—')} · ${x.days} يوم</small>
      </span>
      <span class="tp-rate num">${x.rate}%</span>`;
    list.appendChild(row);
  });
  c.appendChild(list);

  /* ⚠️ التاريخ ليس تجميلاً: اللوحة تُحدَّث حين يفتح الأدمن لوحته، فقد تتأخّر.
     رقمٌ بلا تاريخ يُقرأ على أنه اليوم. */
  const at = tsToDate(data.at);
  c.appendChild(el('p', 'help',
    `${icon('clock')} آخر تحديث: ${at ? esc(fmtDate(at)) : '—'} · ` +
    `يظهر من داوم ${data.minDays || 3} أيام فأكثر في هذه الفترة.`));
  return c;
}
