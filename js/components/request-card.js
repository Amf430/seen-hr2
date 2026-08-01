/* ═══════════════════════════════════════════════════════════════════════════
   بطاقة الطلب — تُستخدم في «طلباتي» و«بانتظار موافقتك» ولوحة القيادة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, extLink } from '../lib/dom.js';
import { fmtDate, fmtDT } from '../lib/format.js';
import { STATUS_AR } from '../lib/dates.js';
import { canApproveType } from '../lib/perms.js';
import { openReject, openRevoke, openWithdraw } from './review-modals.js';
import { approve, hasChain, chainStep, ownsCurrentStep, chainRoleAr } from '../lib/requests.js';

export function requestCard(r, forAdmin) {
  const c = el('div', 'card request-card');
  const isPerm = r.type === 'permission';

  c.appendChild(el('div', 'row-between', `
    <div>
      <div class="request-card__title">
        ${isPerm ? 'استئذان' : 'إجازة'} — ${esc(r.categoryLabel)}
      </div>
      <div class="request-card__sub">
        ${forAdmin ? esc(r.employeeName) + ' · ' : ''}${esc(r.department || '')}
      </div>
    </div>
    <span class="pill pill--dot ${esc(r.status)}">${esc(STATUS_AR[r.status] || r.status)}</span>`));

  /* ⚠️ المرفق يمرّ عبر extLink، الذي يسمح بـ http/https فقط ويضيف
     rel="noopener noreferrer". النسخة القديمة (السطر 859) كانت تمرّره عبر
     esc() وحدها — وesc لا يمنع البروتوكول، فكان رابط "javascript:" يُنفَّذ
     في جلسة الأدمن بمجرد ضغطه. لو كان الرابط غير صالح لا يُعرض إطلاقاً. */
  const attachment = r.attachmentLink ? extLink(r.attachmentLink, 'فتح الرابط') : '';

  c.appendChild(el('div', 'detail-list', `
    ${isPerm ? `
      <div class="detail-line"><span class="k">التاريخ</span><span class="v">${fmtDate(r.date)}</span></div>
      <div class="detail-line"><span class="k">الوقت</span><span class="v num">${esc(r.time || '—')}</span></div>
      <div class="detail-line"><span class="k">السبب</span><span class="v">${esc(r.reasonLabel || '—')}</span></div>
    ` : `
      <div class="detail-line"><span class="k">من تاريخ</span><span class="v">${fmtDate(r.startDate)}</span></div>
      <div class="detail-line"><span class="k">إلى تاريخ</span><span class="v">${fmtDate(r.endDate)}</span></div>
      <div class="detail-line"><span class="k">عدد الأيام</span><span class="v num">${esc(r.days)} يوم</span></div>
    `}
    <div class="detail-line"><span class="k">جهة الاعتماد</span><span class="v">${esc(r.approverName || '—')}</span></div>
    ${r.note ? `<div class="detail-line"><span class="k">ملاحظات</span><span class="v">${esc(r.note)}</span></div>` : ''}
    ${attachment ? `<div class="detail-line"><span class="k">مرفق</span><span class="v">${attachment}</span></div>` : ''}
    <div class="detail-line"><span class="k">قُدّم في</span><span class="v">${fmtDT(r.createdAt)}</span></div>
    ${r.status === 'rejected' && r.rejectReason
      ? `<div class="detail-line"><span class="k text-red">سبب الرفض</span><span class="v text-red">${esc(r.rejectReason)}</span></div>` : ''}
    ${r.status !== 'pending'
      ? `<div class="detail-line"><span class="k">روجِع بواسطة</span><span class="v">${esc(r.reviewedBy || '—')} · ${fmtDT(r.reviewedAt)}</span></div>` : ''}
  `));

  /* ── مسار السلسلة ── */
  if (hasChain(r)) {
    const steps = r.chain.map((role, i) => {
      const done = i < chainStep(r);
      const now  = i === chainStep(r) && r.status === 'pending';
      const sig  = (r.approvals || []).find((a) => a.step === i);
      return `<div class="step ${done ? 'step--done' : now ? 'step--busy' : ''}">
        <span class="step__n">${done ? '✓' : i + 1}</span>
        <span class="step__t">${esc(chainRoleAr(role))}
          <span>${done && sig ? 'وقّعها ' + esc(sig.byName)
                 : now ? 'بانتظار التوقيع الآن' : 'لم تصل بعد'}</span></span></div>`;
    }).join('');
    c.appendChild(el('div', 'steps', steps));
  }

  const bar = el('div', 'btn-bar');
  /* ⚠️ في السلسلة، من يملك الخطوة الحالية هو من يقرّر — لا canApproveType.
     مدير القسم قد يملك خطوة في سلسلة إجازة، وهو ما يمنعه المسار القديم. */
  const mayApprove = forAdmin && (hasChain(r) ? ownsCurrentStep(r) : canApproveType(r));

  if (mayApprove && r.status === 'pending') {
    const no = el('button', 'btn sm danger', 'رفض');
    no.onclick = () => { if (!no.disabled) openReject(r); };
    const ok = el('button', 'btn sm', 'موافقة');
    /* ⚠️ التعطيل أثناء التنفيذ ليس تجميلاً: approve() تخصم من رصيد الإجازة،
       والنقرتان السريعتان كانتا تخصمان مرتين. المعاملة في requests.js تمنع
       الخصم المزدوج حتماً، وهذا يمنع المحاولة من الأساس ويشرح للمستخدم أن
       شيئاً يجري. ويُعطَّل زر الرفض معه: القائمة تُعاد بناؤها بعد الموافقة،
       فالضغطة التالية قد تقع على طلب موظف آخر صعد مكانه.
       الاستعادة في catch لا في finally — عند النجاح تختفي البطاقة أو تتغيّر،
       فإرجاع الزر صالحاً يفتح نافذة لنقرة ثانية على عملية تمّت. */
    ok.onclick = async () => {
      if (ok.disabled) return;
      ok.disabled = true; no.disabled = true;
      ok.textContent = '… جارٍ التنفيذ';
      try { await approve(r); }
      catch (e) { ok.disabled = false; no.disabled = false; ok.textContent = 'موافقة'; }
    };
    bar.append(ok, no);
    c.appendChild(bar);
  } else if (mayApprove && r.status === 'approved') {
    const revoke = el('button', 'btn sm danger', 'إلغاء الموافقة');
    revoke.onclick = () => openRevoke(r);
    bar.append(revoke);
    c.appendChild(bar);
  } else if (!forAdmin && r.status === 'pending') {
    const cancel = el('button', 'btn sm ghost', 'إلغاء الطلب');
    cancel.onclick = () => openWithdraw(r);
    bar.append(cancel);
    c.appendChild(bar);
  }

  return c;
}

/* صف مختصر للوحة القيادة والرئيسية */
export function miniRow(r) {
  const row = el('div', 'list-row');
  row.innerHTML = `
    <div>
      <b>${r.type === 'permission' ? 'استئذان' : 'إجازة'}</b> — ${esc(r.categoryLabel)}
      <div class="list-row__sub">${r.type === 'permission'
        ? fmtDate(r.date)
        : fmtDate(r.startDate) + ' ← ' + fmtDate(r.endDate)}</div>
    </div>
    <span class="pill pill--dot ${esc(r.status)}">${esc(STATUS_AR[r.status] || r.status)}</span>`;
  return row;
}
