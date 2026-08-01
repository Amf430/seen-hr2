/* ═══════════════════════════════════════════════════════════════════════════
   تذكير الانصراف — البديل المجاني للإشعارات الفورية.

   ── لماذا ليس Web Push ──
   استقبال FCM مجاني، لكن إرساله يحتاج خادماً يوقّع الرسالة بمفتاح المشروع —
   أي Cloud Functions، وهي حصرية على خطة Blaze المدفوعة. لا مخرج من هذا:
   لا يمكن إرسال إشعار Push من متصفح الموظف نفسه.

   ── ما يفعله هذا الملف بدلاً منه ──
   Notification API المحلية — مجانية بالكامل وتعمل بلا خادم. تُطلق تذكيراً
   حقيقياً على مستوى نظام التشغيل بشرطين:
     • أذن الموظف بالإشعارات
     • الصفحة مفتوحة في تبويب (ولو في الخلفية)

   ── حدود هذا الحلّ، بصراحة ──
   لو أغلق الموظف المتصفح تماماً فلا تذكير. الفائدة الحقيقية تظهر في الحالة
   الشائعة: الموظف يترك النظام مفتوحاً في تبويب طوال الدوام، فيصله التنبيه
   عند نهاية ورديته. هذا يعالج معظم حالات «نسيان بصمة الانصراف» بلا تكلفة —
   وليس كلّها.

   ⚠️ لا يُطلب الإذن عند فتح الصفحة. طلب الإذن بلا سياق يرفضه المستخدم غالباً،
   ورفضه في كثير من المتصفحات نهائي لا يُستعاد إلا من الإعدادات. الطلب يجري
   بضغطة الموظف نفسه من شاشة الحضور.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getMe } from './state.js';
import { myShiftToday } from './shifts.js';
import { shiftWindowFor } from './shifts.js';

/* دقائق بعد نهاية الوردية يُطلق عندها التذكير — قبل عتبة «نسيان البصمة»
   (١٢٠ دقيقة في shifts.js) بوقت كافٍ ليتصرّف الموظف. */
export const REMIND_AFTER_END_MIN = 10;

export const notifySupported = () => typeof Notification !== 'undefined';
export const notifyState = () => (notifySupported() ? Notification.permission : 'unsupported');

export async function askPermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch (e) { return 'denied'; }
}

function fire(title, body, tag) {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, { body, tag, lang: 'ar', dir: 'rtl', renotify: false });
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch (e) { return false; }
}

/* ── مفتاح «أُرسل اليوم» ──
   localStorage لا Firestore: التذكير شأن هذا الجهاز وهذا اليوم، ولا معنى
   لتكلفة كتابة في القاعدة لأجله. ولا نريد تذكيراً مكرراً كل دقيقة. */
const sentKey = (kind) => {
  const me = getMe();
  const d = new Date();
  return `seenRemind_${kind}_${me ? me.id : 'x'}_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const alreadySent = (kind) => { try { return !!localStorage.getItem(sentKey(kind)); } catch (e) { return false; } };
const markSent    = (kind) => { try { localStorage.setItem(sentKey(kind), '1'); } catch (e) {} };

/* ═══ الفحص الدوري ═══

   يُستدعى من مؤقّت شاشة الحضور، فيعيش ويموت مع الصفحة عبر lifecycle.js.

   `isOpen` تُمرَّر من المنادي لأنه يملك اللقطة اللحظية للسجل — قراءتها من
   هنا تعني استعلاماً إضافياً كل دقيقة بلا داعٍ. */
export function checkCheckoutReminder(isOpen) {
  if (!isOpen || alreadySent('out')) return;
  const now = new Date();
  const w = shiftWindowFor(now, myShiftToday(now));
  if (!w) return;
  if (now < new Date(w.end.getTime() + REMIND_AFTER_END_MIN * 60000)) return;

  const ok = fire('لم تسجّل انصرافك بعد',
    'انتهت وردية اليوم وجلستك ما زالت مفتوحة. افتح النظام وسجّل انصرافك حتى لا يُحتسب اليوم «نسيان بصمة».',
    'seen-checkout');
  if (ok) markSent('out');
}
