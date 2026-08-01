/* ═══════════════════════════════════════════════════════════════════════════
   دورة حياة الصفحة.

   في النسخة القديمة كان المؤقّت (uiTimer) والاشتراك اللحظي على الحضور
   (unsubAtt) متغيّرين عامّين، لمجرد أن render() لازم يوقفهما قبل كل عرض.
   هنا: من ينشئ مؤقّتاً أو اشتراكاً يسجّل طريقة إيقافه، والراوتر ينظّف الكل
   قبل عرض أي صفحة. أي صفحة جديدة تقدر تملك مواردها بلا متغيّر عام إضافي.
   ═══════════════════════════════════════════════════════════════════════════ */

let disposers = [];

/* سجّل دالة تنظيف تُنفَّذ عند مغادرة الصفحة */
export function onCleanup(fn) {
  if (typeof fn === 'function') disposers.push(fn);
  return fn;
}

/* مؤقّت متكرّر يتوقف تلقائياً عند مغادرة الصفحة */
export function setPageInterval(fn, ms) {
  const id = setInterval(fn, ms);
  onCleanup(() => clearInterval(id));
  return id;
}

/* اشتراك لحظي على Firestore يُلغى تلقائياً عند مغادرة الصفحة */
export function trackSubscription(unsub) {
  onCleanup(unsub);
  return unsub;
}

/* يُستدعى من الراوتر كأول سطر في كل عرض */
export function cleanupPage() {
  const list = disposers;
  disposers = [];
  for (const fn of list) {
    try { fn(); } catch (e) { console.error('cleanup', e); }
  }
}
