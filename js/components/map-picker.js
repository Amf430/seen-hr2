/* ═══════════════════════════════════════════════════════════════════════════
   مُنتقي الموقع على الخريطة — Leaflet + OpenStreetMap

   ── لماذا خريطة أصلاً ──
   تحديد الفرع كان يتطلّب من الأدمن أن يخرج للخرائط، يبحث عن المبنى، ينسخ
   إحداثيتين، ويلصقهما في حقلين نصّيين. والأسوأ أنه كان يضبط «النطاق» بالمتر
   وهو لا يرى ما الذي يغطّيه — فيكتب ٥٠٠ متر ويكتشف بعد شهر أن النطاق يبتلع
   الشارع المجاور ومقهىً فيه، فصار الموظف يسجّل حضوره من طاولة القهوة.
   الدائرة على الخريطة هي الفائدة الحقيقية هنا، لا الدبّوس.

   ── لماذا Leaflet + OSM لا خرائط جوجل ──
   بلا مفتاح API وبلا فوترة وبلا بطاقة ائتمان. النظام كله على خطة Spark
   المجانية، وأي تبعية تطلب حساب فوترة مرفوضة من حيث المبدأ.

   ── لماذا التحميل كسول ──
   Leaflet ≈ ١٤٠ كيلوبايت. هذه الشاشة يفتحها الأدمن وحده، مرّات معدودة في
   عمر النظام. تحميلها مع أول فتح للتطبيق يعني أن كل موظف يدفع ثمن ميزة لن
   يراها أبداً — على جوال وشبكة جوال. فتُحمَّل عند أول فتح للنافذة فقط،
   والوعد مُخزَّن فلا تُحمَّل مرتين.

   ⚠️ هذا المكوّن لا يلمس شكل البيانات إطلاقاً: الفرع يبقى
   {id, name, lat, lng, radius, active} كما هو. هذه طريقة إدخال، لا نموذج
   جديد — ولا علاقة لها بـ haversine ولا nearestBranch ولا geoRuleFor.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, openModal } from '../lib/dom.js';
import { getPosition } from '../lib/geo.js';

const LEAFLET_VER = '1.9.4';
const LEAFLET_JS  = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
/* من صفحة تنزيل Leaflet الرسمية لنفس الإصدار. إبقاؤهما بجوار الرابط يمنع
   تغيير الملف من الـCDN بلا تغيير واعٍ هنا وفي اختبار عقد النشر. */
const LEAFLET_JS_SRI  = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

/* مركز احتياطي حين يُفتح فرع جديد بلا إحداثيات — الرياض */
const FALLBACK = { lat: 24.7136, lng: 46.6753 };
const FALLBACK_ZOOM = 6;
const PICKED_ZOOM   = 17;

/* ⚠️ شرط استخدام Nominatim: طلب واحد في الثانية كحدّ أقصى للمصدر الواحد.
   تجاوزه يُوقف خدمتنا عن كل مستخدمي هذه النسخة، لا عن هذا المتصفح وحده.
   ٨٠٠ms + إلغاء الطلب السابق يُبقينا تحت الحدّ بأمان. */
const SEARCH_DEBOUNCE_MS = 800;
const SEARCH_MIN_CHARS   = 3;

/* ── تحميل Leaflet مرة واحدة ──
   الوعد نفسه مُخزَّن لا نتيجته: نافذتان تُفتحان قبل اكتمال التحميل تنتظران
   نفس الوعد بدل أن تحقن كل واحدة وسماً ثانياً. */
let leafletPromise = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = el('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      css.integrity = LEAFLET_CSS_SRI;
      css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
    }
    const s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.integrity = LEAFLET_JS_SRI;
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload  = () => (window.L ? resolve(window.L) : reject(new Error('leaflet-missing')));
    /* الفشل يُنسي الوعد حتى تُعيد المحاولة فتحةٌ لاحقة بدل أن تفشل للأبد */
    s.onerror = () => { leafletPromise = null; reject(new Error('leaflet-load-failed')); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

/* ═══════════════════════════════════════════════════════════════════════════
   openMapPicker({ lat, lng, radius, name })
     → Promise<{ lat, lng, radius } | null>

   يُرجع null إن أُغلقت النافذة بلا تأكيد (زرّ إلغاء · Esc · ضغطة خارجها).
   ⚠️ يُرجع radius أيضاً وليس {lat,lng} فقط: النطاق يُعدَّل داخل النافذة
   لأن الدائرة لا تُقرأ إلا وهي تتغيّر أمام العين، فلو لم نُرجعه لضاع تعديل
   المستخدم صامتاً — وهو أسوأ من ألا نعرضه أصلاً.
   ═══════════════════════════════════════════════════════════════════════════ */
export function openMapPicker({ lat, lng, radius = 500, name = '' } = {}) {
  return new Promise((resolve) => {
    const hasStart = Number.isFinite(lat) && Number.isFinite(lng);
    let cur = hasStart ? { lat, lng } : { ...FALLBACK };
    let rad = Math.max(50, parseInt(radius, 10) || 500);
    let done = false;

    const m = openModal(`
      <h3>تحديد موقع${name ? ' — ' + esc(name) : ' الفرع'}</h3>

      <div class="field">
        <label for="mpSearch">ابحث عن المكان</label>
        <input id="mpSearch" placeholder="مثال: حي الروضة، جدة" autocomplete="off">
        <div class="help" id="mpSearchHelp">اكتب اسم الحي أو المبنى، أو اسحب الدبّوس على الخريطة مباشرة.</div>
        <div id="mpResults" class="map-picker__results" hidden></div>
      </div>

      <div id="mpMap" class="map-picker__canvas"></div>

      <div class="form-row">
        <div class="field"><label for="mpRad">نطاق الحضور (متر)</label>
          <input id="mpRad" type="number" min="50" step="10" value="${rad}">
          <div class="help">الدائرة الزرقاء على الخريطة هي هذا النطاق بالضبط.</div></div>
        <div class="field field--btn">
          <button type="button" class="btn ghost w-full" id="mpHere">موقعي الحالي</button></div>
      </div>

      <div class="help" id="mpCoords"></div>
      <div class="err" id="mpErr"></div>

      <div class="row">
        <button class="btn ghost" id="mpCancel">إلغاء</button>
        <button class="btn" id="mpOk" disabled>استخدام هذا الموقع</button>
      </div>`,
      /* onClose يُنادى مهما كان طريق الإغلاق — بدونه يبقى الوعد معلّقاً للأبد
         لو أغلق المستخدم بـ Esc أو بضغطة خارج النافذة. */
      () => { if (!done) resolve(null); });

    const $map     = m.$('#mpMap');
    const $coords  = m.$('#mpCoords');
    const $err     = m.$('#mpErr');
    const $ok      = m.$('#mpOk');
    const $radIn   = m.$('#mpRad');
    const $search  = m.$('#mpSearch');
    const $results = m.$('#mpResults');

    m.$('#mpCancel').onclick = m.close;

    let map = null, marker = null, circle = null;

    const showCoords = () => {
      $coords.textContent = `${cur.lat.toFixed(6)}, ${cur.lng.toFixed(6)} — نطاق ${rad} م`;
    };

    /* نقل الدبّوس: مصدر واحد لتحريك العلامة والدائرة والنص معاً، حتى لا
       يتباعد ما تراه العين عمّا سيُحفظ. */
    const moveTo = (p, recenter = false) => {
      cur = { lat: p.lat, lng: p.lng };
      if (marker) marker.setLatLng([cur.lat, cur.lng]);
      if (circle) circle.setLatLng([cur.lat, cur.lng]);
      if (recenter && map) map.setView([cur.lat, cur.lng], Math.max(map.getZoom(), PICKED_ZOOM));
      $ok.disabled = false;
      showCoords();
    };

    showCoords();

    loadLeaflet().then((L) => {
      map = L.map($map, { zoomControl: true, attributionControl: true })
        .setView([cur.lat, cur.lng], hasStart ? PICKED_ZOOM : FALLBACK_ZOOM);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      circle = L.circle([cur.lat, cur.lng], { radius: rad, weight: 1 }).addTo(map);
      marker = L.marker([cur.lat, cur.lng], { draggable: true }).addTo(map);

      marker.on('dragend', () => moveTo(marker.getLatLng()));
      map.on('click', (e) => moveTo(e.latlng));

      /* ⚠️ الخريطة تُبنى داخل نافذة رُسمت للتوّ، فقد تقيس ارتفاعاً صفراً
         وتظهر رمادية. invalidateSize بعد إطار واحد يجبرها على إعادة القياس. */
      requestAnimationFrame(() => {
        map.invalidateSize();
        /* ⚠️ ثم نضبط الإطار على الدائرة لا على تكبير ثابت.
           اكتُشف بتشغيل النافذة فعلاً: عند تكبير ١٧ يكون نصف قطر ٥٠٠ متر
           أكبر من الخريطة المرئية، فالدائرة مرسومة لكن خارج الإطار — والأدمن
           لا يرى النطاق الذي فتح الخريطة لأجله. لا اختبار يلتقط هذا: العناصر
           كلها موجودة في DOM وتقارير الفحص خضراء، والخلل في ما تراه العين.

           ⚠️ ولا نُعيد الضبط مع كل تغيير في حقل النطاق: القفز مع كل ضغطة
           مفتاح يجعل الخريطة تهتزّ تحت يد من يكتب. مرة واحدة عند الفتح. */
        if (hasStart && circle) {
          try { map.fitBounds(circle.getBounds(), { padding: [24, 24], maxZoom: PICKED_ZOOM }); }
          catch { /* دائرة بلا حدود صالحة — يبقى التكبير الافتراضي */ }
        }
      });

      /* فرع جديد بلا إحداثيات: لا نُفعّل «استخدام هذا الموقع» على مركز
         الرياض الافتراضي — يحفظ الأدمن موقعاً لم يختره وهو يظنّه اختار. */
      $ok.disabled = !hasStart;
    }).catch(() => {
      $map.classList.add('map-picker__canvas--failed');
      $map.textContent = 'تعذّر تحميل الخريطة — تأكد من الاتصال بالإنترنت.';
      $err.textContent = 'الخريطة غير متاحة الآن. تقدر تكتب الإحداثيات يدوياً في حقلي الفرع بعد إغلاق هذه النافذة.';
    });

    /* ── النطاق يتغيّر → الدائرة تتغيّر لحظياً ── */
    $radIn.oninput = () => {
      rad = Math.max(50, parseInt($radIn.value, 10) || 500);
      if (circle) circle.setRadius(rad);
      showCoords();
    };

    /* ── موقعي الحالي ── */
    m.$('#mpHere').onclick = async () => {
      const btn = m.$('#mpHere');
      btn.disabled = true; btn.textContent = 'جارٍ التحديد…';
      $err.textContent = '';
      try {
        const p = await getPosition();
        moveTo(p, true);
        $err.textContent = '';
        m.$('#mpSearchHelp').textContent = `تم التقاط موقعك (دقة ±${Math.round(p.acc)} م).`;
      } catch {
        $err.textContent = 'تعذّر تحديد موقعك — تأكد من إذن الموقع في المتصفح.';
      } finally {
        btn.disabled = false; btn.textContent = 'موقعي الحالي';
      }
    };

    /* ── البحث بالاسم عبر Nominatim ──
       ⚠️ الخريطة لازم تبقى صالحة للاستعمال بالسحب لو سقط البحث كلياً:
       الخدمة مجانية وبلا ضمان، وربطُ الميزة كلها بها يعني أن تعطّلها
       يعطّل تحديد الفروع. البحث تسهيل، والسحب هو الطريق المضمون. */
    let searchTimer = null, searchAbort = null;

    const closeResults = () => { $results.hidden = true; $results.innerHTML = ''; };

    $search.oninput = () => {
      clearTimeout(searchTimer);
      if (searchAbort) searchAbort.abort();
      const q = $search.value.trim();
      if (q.length < SEARCH_MIN_CHARS) { closeResults(); return; }

      searchTimer = setTimeout(async () => {
        searchAbort = new AbortController();
        const url = 'https://nominatim.openstreetmap.org/search'
          + '?format=json&limit=5&accept-language=ar&countrycodes=sa'
          + '&q=' + encodeURIComponent(q);
        try {
          const res  = await fetch(url, { signal: searchAbort.signal });
          if (!res.ok) throw new Error('search-http-' + res.status);
          const list = await res.json();
          if (!Array.isArray(list) || !list.length) {
            $results.hidden = false;
            $results.innerHTML = '<div class="map-picker__none">لا نتائج — اسحب الدبّوس على الخريطة بدلاً من ذلك.</div>';
            return;
          }
          $results.hidden = false;
          $results.innerHTML = '';
          list.forEach((r) => {
            const b = el('button', 'map-picker__hit');
            b.type = 'button';
            b.textContent = r.display_name;
            b.onclick = () => {
              moveTo({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) }, true);
              closeResults();
              $search.value = '';
            };
            $results.appendChild(b);
          });
        } catch (e) {
          if (e.name === 'AbortError') return;   /* طلب أحدث ألغى هذا — لا خطأ */
          $results.hidden = false;
          $results.innerHTML = '<div class="map-picker__none">تعذّر البحث الآن — اسحب الدبّوس على الخريطة.</div>';
        }
      }, SEARCH_DEBOUNCE_MS);
    };

    /* Enter داخل حقل البحث يجب ألا يُرسل النموذج ولا يُغلق النافذة */
    $search.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault(); };

    $ok.onclick = () => {
      done = true;
      m.close();
      resolve({ lat: cur.lat, lng: cur.lng, radius: rad });
    };
  });
}
