/* ═══════════════════════════════════════════════════════════════════════════
   القراءة والكتابة — الجزء الوحيد الذي يلمس Firestore

   ⚠️ ملف منفصل عن calendar.js عمداً — وليس مجرد تنظيم:
   استيراد firebase.js يجلب الـSDK من gstatic وقت الاستيراد، فأي وحدة تلمسه
   لا تُستورد في node إطلاقاً. وضعتُ هذه الدوال في calendar.js أول مرة فسقط
   ملف اختبارها كاملاً (٤٧ اختباراً) لحظة إضافتها.

   القاعدة: كل منطق يُقرَّر يعيش في calendar.js النقيّة، وهذا الملف ينفّذ
   القراءة والكتابة ولا يقرّر شيئاً. لا تنقل منطقاً إلى هنا.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, setDoc, addDoc, deleteDoc, getDocs, query, collection, where,
         serverTimestamp } from './firebase.js';
import { getMe } from './state.js';


/* ⚠️ الاستعلام مقيَّد بالقسم والحالة والمدى — يطابق قاعدة requests حرفياً
   (sameDept للمدير) ويقابله فهرس (department, status, startDate).

   ⚠️ ولا يُنادى للموظف إطلاقاً: قاعدة requests تمنعه، فالنداء يعطيه خطأ
   صلاحيات لا نتيجة فارغة. الشاشة تفحص الدور قبل النداء. */
export async function fetchLeavesForMonth(dept, fromYmd, toYmd) {
  const snap = await getDocs(query(collection(db, 'requests'),
    where('department', '==', dept),
    where('status', '==', 'approved'),
    where('startDate', '<=', toYmd)));
  /* ⚠️ الترشيح على endDate محلياً: Firestore لا يقبل مدَيين على حقلين
     مختلفين في استعلام واحد. الشرط على startDate يقصّ الأغلبية. */
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.type === 'leave' && (r.endDate || '') >= fromYmd);
}

/* ═══ الأحداث ═══

   ⚠️ استعلامان منفصلان لا واحد: القاعدة تسمح بالقراءة إن كان الحدث للشركة
   (department == '') **أو** لقسم القارئ. واستعلام OR واحد لا يُثبت لكل
   نتيجة محتملة أنها تحقّق القاعدة، فيُرفض كاملاً — نفس درس الإعلانات. */
export async function fetchEvents(dept, fromYmd, toYmd) {
  const base = collection(db, 'calendarEvents');
  const qs = [
    query(base, where('department', '==', ''), where('date', '>=', fromYmd), where('date', '<=', toYmd))
  ];
  if (dept) qs.push(
    query(base, where('department', '==', dept), where('date', '>=', fromYmd), where('date', '<=', toYmd)));

  /* فشل أحدهما لا يُسقط الآخر: موظف بلا قسم يجب أن يرى أحداث الشركة */
  const res = await Promise.all(qs.map((q) =>
    getDocs(q).then((s) => s.docs).catch((e) => { console.error('events', e); return []; })));
  const seen = new Map();
  res.flat().forEach((d) => { if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...d.data() }); });
  return [...seen.values()];
}

export async function saveEvent(ev) {
  const me = getMe();
  const payload = {
    title: (ev.title || '').trim().slice(0, 120),
    note:  (ev.note || '').slice(0, 500),
    date:  ev.date,
    /* '' = الشركة كلها. حقل واحد لا اثنان — انظر التعليق في calendar.js */
    department: ev.department || '',
    createdBy: me.id, createdByName: me.name,
    createdAt: serverTimestamp()
  };
  if (ev.id) { await setDoc(doc(db, 'calendarEvents', ev.id), payload); return ev.id; }
  const made = await addDoc(collection(db, 'calendarEvents'), payload);
  return made.id;
}

export const deleteEvent = (id) => deleteDoc(doc(db, 'calendarEvents', id));
