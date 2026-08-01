/* ═══════════════════════════════════════════════════════════════════════════
   عرض موقع التسجيل — الرابط والبطاقة والصورة.

   المتطلّب: «يتم إرفاق موقع تسجيل الدخول في السجل بحيث بإستطاعتي التأكد من
   موقعه أثناء تسجيل الدخول».

   ⚠️ الموقع كان مُخزَّناً منذ البداية — inLoc{lat,lng} و inAcc و inDist
   و inBranchName كلها تُكتب في كل جلسة منذ النسخة الحالية. الناقص كان العرض
   فقط: لا رابط ولا خريطة ولا طريقة لرؤيته. هذه الوحدة تُخرجه للسطح.

   ⚠️ الخريطة من OpenStreetMap لا Google Maps: بلا مفتاح API، وبلا حصّة
   استخدام، وبلا حساب فوترة — فيبقى النظام مجانياً. الرابط يفتح في تبويب
   جديد بـ rel="noopener" مثل بقية الروابط الخارجية.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, openModal } from '../lib/dom.js';
import { fmtDist, fmtDT } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import { photosOfDate } from '../lib/photo.js';
import { isAdmin } from '../lib/perms.js';
import { openAdjust } from './adjust-modal.js';

/* ── الروابط ──
   نقطة على الخريطة عند تكبير ١٧ — يكفي لتمييز مبنى عن آخر.
   الإحداثيات أرقام محسوبة لا نص من المستخدم، لكن نُمرّرها عبر Number() على
   أي حال: قيمة غريبة في البيانات لا يجوز أن تبني رابطاً غريباً. */
export function mapUrl(lat, lng) {
  const a = Number(lat), b = Number(lng);
  if (!isFinite(a) || !isFinite(b)) return '';
  return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=17/${a}/${b}`;
}

/* صورة خريطة ثابتة بلا مفتاح — إطار OSM المدمج */
export function mapEmbed(lat, lng, span = 0.004) {
  const a = Number(lat), b = Number(lng);
  if (!isFinite(a) || !isFinite(b)) return '';
  const bbox = [b - span, a - span / 2, b + span, a + span / 2].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${a},${b}`;
}

/* ── خلية مختصرة داخل الجدول ──
   تُرجع '' لو لا موقع — فالصف يبقى نظيفاً بلا رابط ميّت. */
export function locCell(loc, dist) {
  if (!loc || loc.lat == null || loc.lng == null) return '<span class="muted">—</span>';
  const url = mapUrl(loc.lat, loc.lng);
  if (!url) return '<span class="muted">—</span>';
  return `<a class="loc-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"
    title="فتح الموقع على الخريطة">${icon('pin')}<span class="num">${
      dist != null ? esc(fmtDist(dist)) : 'الموقع'}</span></a>`;
}

/* ═══ نافذة تفصيل الجلسة ═══
   كل ما سُجِّل عن دخول أو خروج واحد: الموقع على خريطة حيّة، المسافة عن الفرع،
   دقّة الـ GPS، نتيجة البصمة، وصورة الإثبات إن وُجدت. */
export async function openSessionDetail(rec, sessionIdx, isDevice) {
  const s = (rec.sessions || [])[sessionIdx] || {};
  const rows = [];

  const side = (kind) => {
    const p = kind === 'in'
      ? { loc: s.inLoc,  acc: s.inAcc,  dist: s.inDist,  branch: s.inBranchName,
          mode: s.inMode, denied: s.inGeoDenied, bio: s.inBio, reason: s.inBioReason, has: s.inPhoto }
      : { loc: s.outLoc, acc: s.outAcc, dist: s.outDist, branch: s.outBranchName,
          mode: s.outMode, denied: s.outGeoDenied, bio: s.outBio, reason: s.outBioReason, has: s.outPhoto };
    const label = kind === 'in' ? 'الحضور' : 'الانصراف';
    if (!p.loc && !p.branch) return `<div class="loc-side"><h4>${label}</h4>
      <p class="help">لا بيانات موقع مسجّلة.</p></div>`;
    return `<div class="loc-side">
      <h4>${label}</h4>
      <div class="detail-list">
        <div class="detail-line"><span class="k">المكان</span><span class="v">${esc(p.branch || '—')}</span></div>
        <div class="detail-line"><span class="k">المسافة عن الفرع</span><span class="v num">${
          p.dist != null ? esc(fmtDist(p.dist)) : '—'}</span></div>
        <div class="detail-line"><span class="k">دقّة الـ GPS</span><span class="v num">${
          p.acc != null ? '±' + esc(p.acc) + ' م' : '—'}</span></div>
        <div class="detail-line"><span class="k">وضع التسجيل</span><span class="v">${
          p.mode === 'remote' ? 'من أي مكان' : 'من الفرع'}</span></div>
        <div class="detail-line"><span class="k">إذن الموقع</span><span class="v ${
          p.denied ? 'text-red' : 'text-green'}">${p.denied ? 'مرفوض' : 'مُنِح'}</span></div>
        <div class="detail-line"><span class="k">البصمة</span><span class="v ${
          p.bio ? 'text-green' : 'text-muted'}">${p.bio ? 'نجحت' : esc(p.reason || 'بدونها')}</span></div>
        <div class="detail-line"><span class="k">الإحداثيات</span><span class="v num" dir="ltr">${
          p.loc ? esc(Number(p.loc.lat).toFixed(5)) + ', ' + esc(Number(p.loc.lng).toFixed(5)) : '—'}</span></div>
      </div>
      ${p.loc ? `<iframe class="loc-map" loading="lazy" referrerpolicy="no-referrer"
          src="${esc(mapEmbed(p.loc.lat, p.loc.lng))}" title="خريطة موقع ${label}"></iframe>
        <a class="btn ghost sm" href="${esc(mapUrl(p.loc.lat, p.loc.lng))}"
           target="_blank" rel="noopener noreferrer">فتح في الخريطة</a>` : ''}
      <div class="loc-photo" data-kind="${kind}"></div>
    </div>`;
  };

  rows.push(side('in'));
  if (s.out) rows.push(side('out'));

  const m = openModal(`
    <h3>تفصيل الجلسة ${sessionIdx + 1} — ${esc(rec.employeeName || '')}</h3>
    <p class="help">${esc(rec.date || '')} · ${esc(rec.shiftLabel || '')}${
      isDevice ? ' · مصدرها جهاز البصمة (لا موقع)' : ''}</p>
    <div class="loc-grid">${rows.join('')}</div>
    <div class="row">
      ${isAdmin() ? '<button class="btn ghost" id="lcFix">تصحيح يدوي</button>' : ''}
      <button class="btn ghost" id="lcClose">إغلاق</button>
    </div>`);
  m.$('#lcClose').onclick = m.close;
  const fix = m.$('#lcFix');
  if (fix) fix.onclick = () => { m.close(); openAdjust(rec, sessionIdx, isDevice ? 'zkAttendance' : 'attendance'); };

  /* الصور تُجلب بعد فتح النافذة — لا تؤخّر ظهور بقية التفاصيل */
  if (!isDevice && (s.inPhoto || s.outPhoto)) {
    try {
      const all = await photosOfDate(rec.date);
      for (const kind of ['in', 'out']) {
        const box = m.modal.querySelector(`.loc-photo[data-kind="${kind}"]`);
        if (!box) continue;
        const ph = all.find((x) => x.employeeUid === rec.employeeUid &&
                                   x.sessionIdx === sessionIdx && x.kind === kind);
        if (!ph) continue;
        box.innerHTML = `<div class="loc-photo__label">صورة إثبات الموقع · ${esc(fmtDT(ph.at))}</div>
          <img src="${esc(ph.photo)}" alt="صورة موقع التسجيل" class="loc-photo__img">`;
      }
    } catch (e) {
      console.error('photos', e);
      m.modal.querySelectorAll('.loc-photo').forEach((b) => {
        b.innerHTML = '<p class="help text-red">تعذّر تحميل صورة الإثبات.</p>';
      });
    }
  }
}
