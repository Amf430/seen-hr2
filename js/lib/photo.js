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
   تحقّق آلي. الالتقاط من بثّ الكاميرا الحيّ وحده، فلا طريق في الواجهة لصورة
   من المعرض (انظر «الالتقاط» أدناه لما يبقى خارج يد المتصفح).
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, collection, getDocs, query, where, deleteDoc, serverTimestamp } from './firebase.js';
import { getMe } from './state.js';
import { ymdKsa } from './dates.js';
import { openModal, el, toast } from './dom.js';

export const PHOTO_MAX_W    = 640;
export const PHOTO_QUALITY  = 0.5;
/* الحدّ في firestore.rules هو ٢٥٠ ألف حرف — نقصّ دونه بهامش */
export const PHOTO_MAX_CHARS = 240000;

/* ═══ الالتقاط — كاميرا حيّة لا ملف ═══

   ⚠️ قرار المالك ٢٠٢٦-١١-٠٢: صورة «من أي مكان» لا تُختار من الاستوديو.
   النسخة السابقة كانت input[type=file][capture] — مفضّلة يومها لأنها تفتح
   كاميرا النظام بلا معاينة مخصّصة ولا إذن منفصل. لكن ذلك الحقل حقلُ ملف في
   النهاية: على أندرويد يعرض «الملفات/المعرض» بجانب الكاميرا، وعلى سطح المكتب
   منتقي ملفات صريح، فكان «تصوير المكان» يقبل صورة الأمس. getUserMedia لا
   يعرف الملفات أصلاً — الإطار يُؤخذ من بثّ الكاميرا لحظة الضغط، ولا طريق
   في الواجهة لإدخال صورة محفوظة.

   ⚠️ ما يبقى خارج يد المتصفح: كاميرا افتراضية على سطح المكتب (OBS وأمثاله)
   تبثّ ما يشاء صاحبها، والكونسول يرسل أي JPEG. الأول يكشفه المدير بالنظر،
   والثاني لا يستحقّ العناء: القاعدة تشترط أن تُكتب الصورة مع البصمة نفسها،
   فالمزوِّر يحتاج كتابة الطلب يدوياً عند كل بصمة.

   ⚠️ متصفح بلا getUserMedia (متصفحات داخل التطبيقات غالباً) يُمنع ولا
   يُعطى بديلاً: الرجوع لحقل الملف يعيد الاستوديو من الباب الخلفي. الرسالة
   تطلب Safari أو Chrome — بقرار المالك.

   ⚠️⚠️ لماذا زرّ «افتح الكاميرا» داخل النافذة، لا فتح البثّ فور ظهورها ⚠️⚠️
   getUserMedia نفسها لا تشترط لمسة، لكن video.play() على آيفون قد تُرفض
   خارج «تفعيل» ناتج عن لمسة المستخدم — وبين لمسة زرّ التسجيل وهذه اللحظة
   مرّت قراءة Firestore وقفلة GPS، فالتفعيل منتهٍ. لمسة طازجة هنا تجعل
   الإذن والتشغيل في لحظة واحدة يضمنها المتصفح. ولأن للنافذة زرّ إلغاء
   ظاهراً، لا يُستنتج الإلغاء من شيء — وكل طرق الإغلاق تحسم الوعد مرة واحدة
   وتطفئ الكاميرا. */
export function capturePhoto() {
  return new Promise((resolve) => {
    let settled = false;
    let stream = null;
    /* ⚠️ الكاميرا تُطفأ في كل طريق للخروج — بثٌّ منسيّ يُبقي ضوء الكاميرا
       مشتعلاً على جوال الموظف ويستنزف بطّاريته بلا أن يعرف لماذا. */
    const stop = () => { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } };
    const settle = (v) => { if (settled) return; settled = true; stop(); resolve(v); };

    const { modal, close } = openModal(`
      <h3>صورة إثبات الموقع</h3>
      <p class="help">تسجيلك من أي مكان يحتاج صورة حيّة لمكانك. اضغط «افتح الكاميرا»، وجّهها لما حولك، ثم «التقط».</p>
      <div class="shot" data-slot="body"></div>
      <div class="row">
        <button class="btn ghost" data-act="cancel">إلغاء</button>
        <button class="btn" data-act="open">افتح الكاميرا</button>
        <button class="btn" data-act="snap" hidden>التقط</button>
        <button class="btn ghost" data-act="retake" hidden>أعد الالتقاط</button>
        <button class="btn" data-act="use" hidden>أرسِل الصورة</button>
      </div>`, () => settle(null));

    const body = modal.querySelector('[data-slot="body"]');
    const btn  = (a) => modal.querySelector(`[data-act="${a}"]`);
    const show = (...acts) => ['open', 'snap', 'retake', 'use'].forEach((a) => { btn(a).hidden = !acts.includes(a); });
    const say  = (msg, cls = '') => { body.innerHTML = ''; body.appendChild(el('p', 'shot__msg ' + cls, msg)); };
    /* يُربط قبل أي خروج مبكر — المتصفح غير المدعوم يحتاج «إلغاء» يعمل أيضاً */
    btn('cancel').onclick = () => { settle(null); close(); };

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      say('هذا المتصفح لا يفتح الكاميرا مباشرة. افتح رابط النظام في Safari أو Chrome ثم سجّل من هناك.', 'text-red');
      show();
      return;
    }
    say('الكاميرا مغلقة.');

    /* عنصر الفيديو يُنشأ مرّة ويُعاد استعماله عند «أعد الالتقاط» — البثّ يبقى
       مفتوحاً بين اللقطتين فلا يُسأل الموظف عن الإذن مرّتين. */
    const video = el('video', 'shot__video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');   /* سفاري الأقدم يقرأ السمة لا الخاصية */
    let shot = null;

    const live = () => { body.innerHTML = ''; body.appendChild(video); show('snap'); };

    btn('open').onclick = async () => {
      btn('open').disabled = true;
      say('جارٍ فتح الكاميرا…');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false
        });
        /* أُغلقت النافذة أثناء انتظار الإذن — البثّ وصل متأخراً، نطفئه فوراً */
        if (settled) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        live();
      } catch (e) {
        console.error('camera', e);
        stop();
        btn('open').disabled = false;
        say(e && e.name === 'NotAllowedError'
          ? 'رفضت إذن الكاميرا. اسمح للموقع باستعمال الكاميرا من إعدادات المتصفح ثم اضغط «افتح الكاميرا» مجدداً.'
          : e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')
            ? 'لم نجد كاميرا على هذا الجهاز — سجّل من جوالك.'
            : 'تعذّر فتح الكاميرا في هذا المتصفح. افتح رابط النظام في Safari أو Chrome ثم سجّل من هناك.', 'text-red');
      }
    };

    btn('snap').onclick = () => {
      try {
        shot = encodeJpeg(video, video.videoWidth, video.videoHeight);
      } catch (e) {
        console.error('photo', e);
        /* videoWidth صفر = البثّ لم يرسل إطاراً بعد. نبقى على المعاينة ليعيد */
        toast(e.message === 'photo-too-large'
          ? 'الصورة كبيرة جداً حتى بعد الضغط — التقطها مجدداً'
          : 'الكاميرا لم تجهز بعد — انتظر لحظة ثم التقط', 'err');
        return;
      }
      body.innerHTML = '';
      const img = el('img', 'shot__img');
      img.src = shot;
      img.alt = 'صورة الموقع';
      body.appendChild(img);
      show('retake', 'use');
    };

    btn('retake').onclick = () => { shot = null; live(); };
    btn('use').onclick = () => { if (shot) { settle(shot); close(); } };
  });
}

/* ═══ الترميز ═══
   يرسم المصدر (إطار الفيديو، أو أي عنصر قابل للرسم) مصغّراً إلى عرض ٦٤٠
   على الأكثر، ويُرجع data URL بصيغة JPEG. الشفافية غير مطلوبة، وJPEG أصغر
   من PNG بمراحل لصور الكاميرا. */
export function encodeJpeg(src, srcW, srcH, maxW = PHOTO_MAX_W, quality = PHOTO_QUALITY) {
  if (!(srcW > 0 && srcH > 0)) throw new Error('photo-unreadable');
  const scale = Math.min(1, maxW / srcW);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(src, 0, 0, w, h);

  let out = cv.toDataURL('image/jpeg', quality);
  /* صورة عالية التفاصيل قد تتجاوز الحدّ رغم التصغير — نخفض الجودة تدريجياً
     بدل أن نرفض التسجيل على الموظف الواقف خارج الفرع. */
  let q = quality;
  while (out.length > PHOTO_MAX_CHARS && q > 0.2) {
    q -= 0.1;
    out = cv.toDataURL('image/jpeg', q);
  }
  if (out.length > PHOTO_MAX_CHARS) throw new Error('photo-too-large');
  return out;
}

/* ═══ الحفظ — داخل دفعة البصمة نفسها ═══
   المعرّف uid_YYYY-MM-DD_idx_kind — فصورة الحضور وصورة الانصراف لنفس الجلسة
   وثيقتان مستقلّتان.

   ⚠️ لا تُحفظ الصورة وحدها بعد اليوم: تُضاف إلى writeBatch الذي يكتب الجلسة،
   فإمّا تُكتبان معاً وإمّا لا شيء. القاعدة على attendance تشترط لمن هو
   «من أي مكان» أن تكون الصورة في الدفعة نفسها (at == request.time)، فصورة
   تُرفع قبل البصمة أو بعدها لا تُحسب. وحفظها منفصلاً كان يترك جلسة بلا
   دليل كلما انقطعت الشبكة بين الكتابتين.

   dateStr هو تاريخ وثيقة الحضور لا «اليوم»: صفحة بقيت مفتوحة عبر منتصف
   الليل تغلق جلسة على وثيقة الأمس، والقاعدة تبني معرّف الصورة من تاريخ
   الوثيقة. */
export const photoId = (uid, dateStr, idx, kind) => `${uid}_${dateStr}_${idx}_${kind}`;

export function stagePhoto(batch, { dateStr, sessionIdx, kind, photo, pos }) {
  const me = getMe();
  const id = photoId(me.id, dateStr, sessionIdx, kind);
  batch.set(doc(db, 'attendancePhotos', id), {
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
