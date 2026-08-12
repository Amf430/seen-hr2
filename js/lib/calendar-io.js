/* ═══════════════════════════════════════════════════════════════════════════
   القراءة والكتابة — الجزء الوحيد الذي يلمس Firestore

   ⚠️ ملف منفصل عن calendar.js عمداً — وليس مجرد تنظيم:
   استيراد firebase.js يجلب الـSDK من gstatic وقت الاستيراد، فأي وحدة تلمسه
   لا تُستورد في node إطلاقاً. وضعتُ هذه الدوال في calendar.js أول مرة فسقط
   ملف اختبارها كاملاً (٤٧ اختباراً) لحظة إضافتها.

   القاعدة: كل منطق يُقرَّر يعيش في calendar.js النقيّة، وهذا الملف ينفّذ
   القراءة والكتابة ولا يقرّر شيئاً. لا تنقل منطقاً إلى هنا.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, getDocs, query, collection, where,
         serverTimestamp } from './firebase.js';
import { getMe } from './state.js';
import { buildAwayDoc } from './calendar.js';

const awayRef = (dept) => doc(db, 'teamAway', dept);

/* ⚠️ الاستعلام مقيَّد بالقسم والحالة والمدى — يطابق قاعدة requests حرفياً
   (sameDept للمدير) ويقابله فهرس (department, status, startDate).

   ⚠️ ولا نقرأ إلا إجازات الشهر المعروض: قراءة كل الطلبات ثم الترشيح محلياً
   تدفع ثمن كل سجل في المجموعة عند كل فتح. */
export async function fetchLeavesForMonth(dept, fromYmd, toYmd) {
  const snap = await getDocs(query(collection(db, 'requests'),
    where('department', '==', dept),
    where('status', '==', 'approved'),
    where('startDate', '<=', toYmd)));
  /* ⚠️ الترشيح على endDate محلياً: Firestore لا يقبل مدَيين على حقلين
     مختلفين في استعلام واحد. الشرط على startDate يقصّ الأغلبية، والباقي
     رخيص محلياً. */
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.type === 'leave' && (r.endDate || '') >= fromYmd);
}

export async function publishAway(dept, days, requests, staffCount) {
  const payload = buildAwayDoc(days, requests, dept, staffCount);
  await setDoc(awayRef(dept), {
    ...payload, at: serverTimestamp(), byName: getMe().name
  });
}

export async function readAway(dept) {
  if (!dept) return null;
  const s = await getDoc(awayRef(dept));
  return s.exists() ? s.data() : null;
}
