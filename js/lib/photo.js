/* ═══════════════════════════════════════════════════════════════════════════
   صورة إثبات الموقع — الالتقاط والضغط والحفظ.

   المتطلّب: من يسجّل حضوره خارج نطاق المبنى الرئيسي يصوّر موقعه، ويُرفق
   الموقع الجغرافي بالسجل ليتحقّق منه الأدمن.

   ── لماذا لا Firebase Storage ──
   Storage صار يشترط خطة Blaze المدفوعة (تتطلّب بطاقة ائتمانية حتى لو بقي
   الاستهلاك مجانياً). فالصورة تُضغط هنا في المتصفح وتُخزَّن base64 في وثيقة
   Firestore مستقلة — يبقى النظام على الخطة المجانية بالكامل.

   ── حساب المساحة ──
   ٦٤٠ بكسل عرضاً بجودة ٠٫٥ ≈ ٤٠ كيلوبايت للصورة (base64 يزيدها ٣٣٪ ≈ ٥٣ ك.ب).
   ٤٠ موظفاً × صورتين يومياً ≈ ٤ ميغابايت يومياً ≈ ١٢٠ ميغابايت شهرياً.
   الحدّ المجاني ١ غيغابايت، والحذف التلقائي بعد ثلاث دورات يبقيه دون الثلث.

   ── ما تثبته الصورة وما لا تثبته، بصراحة ──
   تثبت أن كاميرا هذا الجهاز التقطت هذا المشهد في هذه اللحظة تقريباً. لا تثبت
   أن الملتقِط هو الموظف، ولا تمنع تصوير شاشة أخرى. الضابط الحقيقي للوقت يبقى
   قاعدة fresh() المربوطة بساعة الخادم، والصورة دليل بشري يراجعه المدير — لا
   تحقّق آلي. capture="environment" تطلب الكاميرا الخلفية، ومعظم المتصفحات
   تحترمها لكن لا شيء يمنع اختيار صورة من المعرض على سطح المكتب.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, setDoc, collection, getDocs, query, where, deleteDoc, serverTimestamp } from './firebase.js';
import { getMe } from './state.js';
import { ymdKsa } from './dates.js';
import { openModal, el } from './dom.js';

export const PHOTO_MAX_W    = 640;
export const PHOTO_QUALITY  = 0.5;
/* الحدّ في firestore.rules هو ٢٥٠ ألف حرف — نقصّ دونه بهامش */
export const PHOTO_MAX_CHARS = 240000;

/* ═══ الالتقاط ═══
   input[type=file][capture] بدل getUserMedia عمداً: يفتح كاميرا النظام
   بواجهتها المألوفة، ولا يحتاج إذناً دائماً، ويعمل على آيفون وأندرويد بلا
   اختلاف. getUserMedia كان يحتاج معاينة مخصّصة وإذناً منفصلاً.

   ⚠️⚠️ لماذا نافذة بزرّ يضغطه الموظف، ولا inp.click() برمجياً ⚠️⚠️

   المتصفحات لا تفتح منتقي الملفات/الكاميرا إلا ضمن «تفعيل مؤقّت» ناتج عن
   لمسة المستخدم، وهذا التفعيل يُستهلك وينتهي بعد ثوانٍ قليلة. وفي مسار
   التسجيل تمرّ بين لمسة الزرّ وبين الالتقاط خطوتان طويلتان: قراءة سجل
   اليوم من Firestore، ثم إذن الموقع وانتظار قفلة GPS. عندها يكون التفعيل
   قد انتهى، فينفّذ المتصفح inp.click() بلا أي أثر: لا كاميرا ولا طلب إذن
   ولا رسالة خطأ.

   والأسوأ أن الوعد كان يعلَّق للأبد: النسخة السابقة كانت تنتظر إمّا change
   وإمّا رجوع التركيز للنافذة، ولا واحد منهما يقع حين لا يُفتح شيء أصلاً —
   فيبقى الزرّ عالقاً على «التقاط صورة الموقع…» ولا يُسجَّل الحضور.

   الحل أن نُعيد اللمسة إلى مكانها: نفتح نافذة فيها زرّ صريح، وضغطة الموظف
   عليه هي التي تفتح الكاميرا مباشرة — تفعيل طازج، لا انتظار قبله. ولأن
   للنافذة زرّ إلغاء ظاهراً، ما عاد الإلغاء يُستنتج من التركيز أبداً. */
export function capturePhoto() {
  return new Promise((resolve) => {
    let settled = false;
    /* أيّ طريق للإغلاق يحسم الوعد مرة واحدة — لا تعليق بعد اليوم */
    const settle = (v) => { if (settled) return; settled = true; resolve(v); };

    const { modal, close } = openModal(`
      <h3>صورة إثبات الموقع</h3>
      <p class="help">تسجيلك من خارج نطاق الفرع يحتاج صورة لمكانك. اضغط «افتح الكاميرا»، صوّر ما حولك، ثم أرسِل الصورة.</p>
      <div class="shot" data-slot="body"></div>
      <div class="row">
        <button class="btn ghost" data-act="cancel">إلغاء</button>
        <label class="btn" data-act="shoot"><span data-slot="shootLabel">افتح الكاميرا</span>
          <input type="file" accept="image/*" capture="environment" hidden>
        </label>
        <button class="btn" data-act="use" hidden>أرسِل الصورة</button>
      </div>`, () => settle(null));

    const body     = modal.querySelector('[data-slot="body"]');
    const shootLbl = modal.querySelector('[data-slot="shootLabel"]');
    const inp      = modal.querySelector('input[type="file"]');
    const useBtn   = modal.querySelector('[data-act="use"]');
    let shot = null;

    const say = (msg, cls = '') => { body.innerHTML = ''; body.appendChild(el('p', 'shot__msg ' + cls, msg)); };
    say('لم تُلتقط صورة بعد.');

    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      /* إغلاق الكاميرا بلا تصوير يترك الحقل فارغاً — نبقى في النافذة ليعيد */
      if (!file) return;
      /* الملف نفسه مرّتين متتاليتين لا يطلق change — نُفرّغ الحقل بعد قراءته */
      inp.value = '';
      say('جارٍ تجهيز الصورة…');
      useBtn.hidden = true;
      shot = null;
      try {
        shot = await compress(file);
      } catch (e) {
        console.error('photo', e);
        say(e.message === 'photo-too-large'
          ? 'الصورة كبيرة جداً حتى بعد الضغط — أعد التقاطها من مسافة أقرب.'
          : 'تعذّرت قراءة هذه الصورة — أعد المحاولة.', 'text-red');
        return;
      }
      body.innerHTML = '';
      const img = el('img', 'shot__img');
      img.src = shot;
      img.alt = 'صورة الموقع';
      body.appendChild(img);
      shootLbl.textContent = 'أعد الالتقاط';
      useBtn.hidden = false;
    };

    modal.querySelector('[data-act="cancel"]').onclick = () => { settle(null); close(); };
    useBtn.onclick = () => { if (shot) { settle(shot); close(); } };
  });
}

/* ═══ الضغط ═══
   يُرجع data URL بصيغة JPEG. الشفافية غير مطلوبة، وJPEG أصغر من PNG بمراحل
   لصور الكاميرا. */
export function compress(file, maxW = PHOTO_MAX_W, quality = PHOTO_QUALITY) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / (img.width || maxW));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      let out = cv.toDataURL('image/jpeg', quality);
      /* صورة عالية التفاصيل قد تتجاوز الحدّ رغم التصغير — نخفض الجودة تدريجياً
         بدل أن نرفض التسجيل على الموظف الواقف خارج الفرع. */
      let q = quality;
      while (out.length > PHOTO_MAX_CHARS && q > 0.2) {
        q -= 0.1;
        out = cv.toDataURL('image/jpeg', q);
      }
      if (out.length > PHOTO_MAX_CHARS) { reject(new Error('photo-too-large')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('photo-unreadable')); };
    img.src = url;
  });
}

/* ═══ الحفظ ═══
   المعرّف uid_YYYY-MM-DD_idx_kind — فصورة الحضور وصورة الانصراف لنفس الجلسة
   وثيقتان مستقلّتان، وإعادة المحاولة تكتب فوق نفسها بلا تكرار. */
export const photoId = (uid, dateStr, idx, kind) => `${uid}_${dateStr}_${idx}_${kind}`;

export async function savePhoto({ dateStr, sessionIdx, kind, photo, pos }) {
  const me = getMe();
  const id = photoId(me.id, dateStr, sessionIdx, kind);
  await setDoc(doc(db, 'attendancePhotos', id), {
    employeeUid:  me.id,
    employeeName: me.name,
    department:   me.department || '',
    date:         dateStr,
    sessionIdx,
    kind,
    photo,
    lat: pos ? pos.lat : null,
    lng: pos ? pos.lng : null,
    acc: pos ? Math.round(pos.acc || 0) : null,
    at:  serverTimestamp()
  });
  return id;
}

/* ═══ القراءة — للأدمن ═══ */
export async function photosOfDate(dateStr) {
  const snap = await getDocs(query(collection(db, 'attendancePhotos'), where('date', '==', dateStr)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function photosOfEmployee(uid, fromDate, toDate) {
  const snap = await getDocs(query(
    collection(db, 'attendancePhotos'),
    where('employeeUid', '==', uid),
    where('date', '>=', fromDate),
    where('date', '<=', toDate)
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ═══ التنظيف ═══
   الصور دليل مؤقّت لا أرشيف. الحذف بعد الدورات الثلاث الأخيرة يبقي الاستهلاك
   ثابتاً بدل أن ينمو بلا سقف حتى يمتلئ الغيغابايت المجاني.
   يُستدعى من صفحة الأدمن بضغطة، لا تلقائياً: الحذف لا رجعة فيه، والقرار
   للأدمن لا للكود. */
export async function purgePhotosBefore(dateStr) {
  const snap = await getDocs(query(collection(db, 'attendancePhotos'), where('date', '<', dateStr)));
  let n = 0;
  for (const d of snap.docs) { await deleteDoc(d.ref); n++; }
  return n;
}

/* حجم المخزون الحالي تقريباً — يُعرض للأدمن قبل التنظيف */
export async function photoUsage() {
  const snap = await getDocs(collection(db, 'attendancePhotos'));
  let bytes = 0;
  snap.docs.forEach((d) => { bytes += (d.data().photo || '').length; });
  return { count: snap.size, bytes };
}

export { ymdKsa };
