/* ═══════════════════════════════════════════════════════════════════════════
   رسوم SVG — مولّدات نقيّة تأخذ أرقاماً وتُرجع نصّ SVG.

   لماذا هنا لا في الصفحات: الرسم حسبة قبل أن يكون شكلاً — مقياس، ومدى،
   وإحداثيات. الحسبة تُختبر في node، والصفحة تلصق النصّ وحسب.

   ⚠️ بلا أي مكتبة. لا Chart.js ولا D3 ولا شيء من CDN — فلا سطر جديد في
   Content-Security-Policy، ولا تبعية تسقط يوم يسقط مضيفها. مرجع التصميم
   نفسه يولّد رسومه بـ SVG خالص، فما نقلناه هو الطريقة لا المكتبة.

   ⚠️ كل نصّ يدخل SVG يمرّ بـ esc(): تسمية القسم يكتبها الأدمن، و«<» واحدة
   في اسم قسم تكسر المستند كلّه.

   ⚠️ الاتجاه: SVG لا يعرف RTL. المحور الأفقي هنا يسير **يساراً←يميناً**
   دائماً، والزمن يُقرأ من اليسار كأي رسم بياني. لا تعكسه: عكسُ المحور يجعل
   الأحدث في اليسار بينما التسميات تحته تُقرأ من اليمين، فيتناقض الاثنان.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from './dom.js';

/* ── أدوات ── */
const num = (v) => (Number.isFinite(v) ? v : 0);
const round = (v) => Math.round(v * 100) / 100;

/* يحوّل قيمة إلى إحداثي رأسي داخل ارتفاع h مع هامش pad */
function scaleY(v, min, max, h, pad) {
  const range = max - min || 1;
  return round(h - pad - ((v - min) / range) * (h - pad * 2));
}

/* ═══ خطّ الاتجاه المصغّر ═══
   يرافق كل رقم في البطاقة: الرقم يقول «كم»، والخطّ يقول «إلى أين».
   المدى مشتقّ من البيانات نفسها لا من صفر — فرق ٣٪ في نسبة انضباط يجب أن
   يُرى، ولو بدأ المحور من صفر لظهر خطّاً مسطّحاً بلا معنى. */
export function sparkline(data, opts = {}) {
  const pts = (Array.isArray(data) ? data : []).map(num);
  const W = opts.width || 80, H = opts.height || 28;
  const color = opts.color || 'var(--maroon-2)';
  if (pts.length < 2) return `<svg width="${W}" height="${H}" aria-hidden="true"></svg>`;

  const min = Math.min(...pts), max = Math.max(...pts);
  const x = (i) => round((i / (pts.length - 1)) * W);
  const y = (v) => scaleY(v, min, max, H, 2);

  const line = pts.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const lastX = x(pts.length - 1), lastY = y(pts[pts.length - 1]);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" style="display:block">` +
    `<path d="${area}" fill="${color}" fill-opacity=".10"/>` +
    `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${color}"/>` +
    `</svg>`;
}

/* ═══ حلقة حالة اليوم ═══
   segments: [{ value, color, label }]
   تحلّ محلّ صفّ نصّي «٠ من ٢». الحلقة تُقرأ في لمحة: نسبة الحاضرين مساحةٌ
   لا رقم. والمجموع في وسطها لأن العين تقع على المركز أولاً.

   ⚠️ الشريحة الصفرية تُحذف لا تُرسم بطول صفر: قوس بطول صفر مع stroke-linecap
   مستدير يرسم **نقطة** على المحيط، فتظهر حالة لا وجود لها. */
export function donut(segments, opts = {}) {
  const segs = (Array.isArray(segments) ? segments : [])
    .map((s) => ({ ...s, value: Math.max(0, num(s.value)) }))
    .filter((s) => s.value > 0);
  const size = opts.size || 148;
  const thickness = opts.thickness || 14;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segs.reduce((s, x) => s + x.value, 0);

  const track = `<circle cx="${c}" cy="${c}" r="${round(r)}" fill="none" ` +
    `stroke="var(--surface-3)" stroke-width="${thickness}"/>`;

  if (!total) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" ` +
      `aria-label="${esc(opts.emptyLabel || 'لا بيانات')}">${track}</svg>`;
  }

  let offset = 0;
  const arcs = segs.map((s) => {
    const len = round((s.value / total) * circ);
    const dash = `${len} ${round(circ - len)}`;
    /* -90deg ليبدأ القوس من أعلى الدائرة لا من يمينها */
    const a = `<circle cx="${c}" cy="${c}" r="${round(r)}" fill="none" ` +
      `stroke="${s.color}" stroke-width="${thickness}" ` +
      `stroke-dasharray="${dash}" stroke-dashoffset="${round(-offset)}" ` +
      `transform="rotate(-90 ${c} ${c})"><title>${esc(s.label || '')}</title></circle>`;
    offset += len;
    return a;
  }).join('');

  const center = opts.centerValue == null ? '' :
    `<text x="${c}" y="${c - 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-size="${opts.centerSize || 26}" font-weight="700" fill="var(--ink)">${esc(String(opts.centerValue))}</text>` +
    (opts.centerLabel ?
      `<text x="${c}" y="${c + 20}" text-anchor="middle" font-size="11" fill="var(--muted-strong)">${esc(opts.centerLabel)}</text>` : '');

  const desc = segs.map((s) => `${s.label}: ${s.value}`).join('، ');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" ` +
    `aria-label="${esc(desc)}">${track}${arcs}${center}</svg>`;
}

/* ═══ أعمدة مكدّسة عبر الأيام ═══
   days: [{ label, parts: [{ value, color }] }]
   كل عمود يوم، وارتفاع الشريحة نسبتها من اليوم — فالأيام متساوية الارتفاع
   والمقارنة بينها مقارنة تركيب لا مقارنة حجم. */
export function stackedBars(days, opts = {}) {
  const rows = Array.isArray(days) ? days : [];
  const W = opts.width || 560, H = opts.height || 150;
  const gap = opts.gap ?? 6;
  const labelH = 16;
  const plotH = H - labelH;
  if (!rows.length) return `<svg width="${W}" height="${H}" aria-hidden="true"></svg>`;

  const bw = round((W - gap * (rows.length - 1)) / rows.length);
  const bars = rows.map((d, i) => {
    const parts = (d.parts || []).map((p) => ({ ...p, value: Math.max(0, num(p.value)) }));
    const tot = parts.reduce((s, p) => s + p.value, 0);
    const x = round(i * (bw + gap));
    if (!tot) {
      return `<rect x="${x}" y="${plotH - 2}" width="${bw}" height="2" rx="1" fill="var(--surface-3)"/>` +
        `<text x="${round(x + bw / 2)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="var(--muted-strong)">${esc(d.label || '')}</text>`;
    }
    let y = plotH;
    const segs = parts.filter((p) => p.value > 0).map((p) => {
      const h = round((p.value / tot) * plotH);
      y = round(y - h);
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${p.color}"><title>${esc(p.label || '')}: ${p.value}</title></rect>`;
    }).join('');
    return segs +
      `<text x="${round(x + bw / 2)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="var(--muted-strong)">${esc(d.label || '')}</text>`;
  }).join('');

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" ` +
    `aria-label="${esc(opts.label || 'توزيع يومي')}" style="display:block;overflow:visible">${bars}</svg>`;
}

/* ═══ أشرطة أفقية مسمّاة ═══
   items: [{ label, value }] — التوزيع حسب القسم مثلاً.
   ⚠️ HTML لا SVG عمداً: النصّ العربي داخل SVG لا يرث اتجاه الصفحة ولا يلتفّ،
   واسم القسم يطول. الشريط هنا عنصران بعرض نسبي، فيتصرّف كأي نصّ عربي. */
export function barList(items, opts = {}) {
  const rows = (Array.isArray(items) ? items : [])
    .map((r) => ({ label: String(r.label ?? ''), value: Math.max(0, num(r.value)) }));
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.value), 1);
  const color = opts.color || 'var(--maroon-2)';

  return `<div class="barlist">` + rows.map((r) => {
    const pct = round((r.value / max) * 100);
    return `<div class="barlist__row">` +
      `<span class="barlist__label">${esc(r.label)}</span>` +
      `<span class="barlist__track"><i style="inline-size:${pct}%;background:${color}"></i></span>` +
      `<span class="barlist__value num">${esc(String(r.value))}</span>` +
      `</div>`;
  }).join('') + `</div>`;
}

/* ═══ سهم الفرق ═══
   يرافق الرقم: صاعد أخضر، هابط أحمر، وثابت رمادي بلا سهم.
   ⚠️ الاتجاه ليس حكماً: ارتفاع الغياب ليس خبراً ساراً. لذلك good تُمرَّر
   صراحةً من الصفحة ولا تُشتقّ من الإشارة. */
export function delta(pct, opts = {}) {
  const v = num(pct);
  if (Math.round(v * 10) === 0) {
    return `<span class="delta delta--flat">${esc(opts.text || 'بلا تغيّر')}</span>`;
  }
  const up = v > 0;
  const good = opts.good === undefined ? up : (up ? opts.good : !opts.good);
  const arrow = up ? '↑' : '↓';
  const cls = good ? 'delta--good' : 'delta--bad';
  const label = opts.text || `${Math.abs(round(v))}٪ عن الدورة السابقة`;
  return `<span class="delta ${cls}"><span aria-hidden="true">${arrow}</span> ${esc(label)}</span>`;
}
