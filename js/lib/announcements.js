/* ═══════════════════════════════════════════════════════════════════════════
   الإعلانات — رسائل الموارد البشرية الجماعية

   ── لماذا مجموعة Firestore جديدة مقبولة هنا وقد رُفضت في notifications ──
   ⚠️ اقرأ التعليق الطويل أعلى js/lib/notifications.js أولاً حتى لا يبدو هذا
   تناقضاً. رُفضت مجموعة `notifications` بسبب **ثغرة إغراق**: أي قاعدة تسمح
   لموظف بالكتابة في وثيقة موجّهة لغيره تسمح له بإغراق أي مستخدم بآلاف
   الوثائق، وسدّها يحتاج Cloud Functions وهي خارج الخطة المجانية.

   الإعلانات مختلفة جوهرياً: **الكتابة للأدمن وحده**، والقراءة للجميع، ووثيقة
   واحدة يقرؤها مئة موظف بدل مئة وثيقة. لا ثغرة إغراق أصلاً — الموظف لا يكتب
   شيئاً — والتكلفة قراءة واحدة لكل موظف عند الفتح.

   ⚠️ ولا بريد ولا SMS ولا Push. كلها تحتاج خادماً يوقّع الرسالة، أي Cloud
   Functions، أي خطة Blaze. هذا مركز إعلانات **داخل التطبيق**: الموظف يفتح
   النظام فيراها. قُلها صراحةً للأدمن في الواجهة.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, collection, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { getMe } from './state.js';
import { logAction } from './audit.js';

const COLL = 'announcements';
const ref  = (id) => doc(db, COLL, id);
const acks = (id) => collection(db, COLL, id, 'acks');

export const PRIORITY_AR = { normal: 'عادي', important: 'مهم', urgent: 'عاجل' };

/* من يصله هذا الإعلان — تُستعمل في المعاينة الإلزامية قبل الإرسال */
export function audienceOf(a, users) {
  const staff = (users || []).filter((u) => u.status !== 'suspended');
  if (a.audienceAll) return staff;
  const depts = new Set(a.audienceDepts || []);
  const uids  = new Set(a.audienceUids || []);
  return staff.filter((u) => depts.has(u.department) || uids.has(u.id));
}

/* هل يقع الإعلان داخل نافذته الزمنية اليوم؟
   ⚠️ الترشيح محلي لا في الاستعلام: إضافة publishAt/expiresAt كشرطين في
   الاستعلام تحتاج فهرساً لكل تركيبة جمهور، والعدد صغير أصلاً (limit 20). */
export function isLive(a, todayYmd) {
  if (a.publishAt && a.publishAt > todayYmd) return false;
  if (a.expiresAt && a.expiresAt < todayYmd) return false;
  return true;
}

export async function createAnnouncement(input) {
  const me = getMe();
  const payload = {
    title: (input.title || '').trim().slice(0, 120),
    body:  (input.body || '').slice(0, 5000),
    audienceAll:   !!input.audienceAll,
    audienceDepts: (input.audienceDepts || []).slice(0, 30),
    audienceUids:  (input.audienceUids || []).slice(0, 50),
    priority: ['normal','important','urgent'].includes(input.priority) ? input.priority : 'normal',
    pinned: !!input.pinned,
    publishAt: input.publishAt || '',
    expiresAt: input.expiresAt || '',
    requireAck: !!input.requireAck,
    createdBy: me.id, createdByName: me.name,
    createdAt: serverTimestamp(),
    ackCount: 0
  };
  const created = await addDoc(collection(db, COLL), payload);
  await logAction('إرسال إعلان', payload.title);
  return created.id;
}

/* ⚠️ التعديل بعد الإرسال يُعلَّم ويُؤرَّخ. لا تعديل صامت لرسالة قرأها الناس:
   من قرأ النسخة الأولى يجب أن يعرف أن ما يراه غيره اليوم ليس ما قرأه هو. */
export async function editAnnouncement(id, fields) {
  const me = getMe();
  await updateDoc(ref(id), { ...fields, editedAt: serverTimestamp(), editedByName: me.name });
  await logAction('تعديل إعلان', fields.title || id);
}

export const deleteAnnouncement = (id) => deleteDoc(ref(id));

/* ═══ الإقرار بالاطّلاع ═══
   ⚠️ وثيقة معرّفها uid الموظف — فلا يقدر يُقرّ نيابةً عن غيره، والقاعدة
   تشترط request.auth.uid == uid. ولا تُسحب: allow update, delete: if false. */
export async function acknowledge(id) {
  const me = getMe();
  await setDoc(doc(acks(id), me.id), {
    uid: me.id, name: me.name, department: me.department || '', at: serverTimestamp()
  });
}

export async function myAck(id, uid) {
  const s = await getDoc(doc(acks(id), uid));
  return s.exists();
}

/* ⚠️ العدد الموثوق هو عدد وثائق acks لا العدّاد ackCount.
   العدّاد تكتبه الواجهة وقد يتأخّر — لا تبنِ عليه قراراً إدارياً. */
export async function ackList(id) {
  const snap = await getDocs(acks(id));
  return snap.docs.map((d) => d.data());
}

/* ═══ القراءة ═══

   ⚠️⚠️ ثلاثة مستمعين منفصلين لا استعلام واحد. القاعدة تسمح بالقراءة إن
   تحقّق **أحد** ثلاثة شروط، وFirestore يرفض الاستعلام كاملاً ما لم يكن
   مقيَّداً بحيث تُحقّق كل نتيجة محتملة شرط القاعدة. استعلام واحد بـ OR
   لا يُحقّق ذلك، فيُرفض ويعطي شاشة فارغة بخطأ صلاحيات.

   ندمج النتائج محلياً ونزيل المكرّر بالمعرّف. */
export async function announcementsFor(me, max = 20) {
  const base = collection(db, COLL);
  const queries = [
    query(base, where('audienceAll', '==', true), orderBy('publishAt', 'desc'), limit(max))
  ];
  if (me.department)
    queries.push(query(base, where('audienceDepts', 'array-contains', me.department),
                       orderBy('publishAt', 'desc'), limit(max)));
  queries.push(query(base, where('audienceUids', 'array-contains', me.id),
                     orderBy('publishAt', 'desc'), limit(max)));

  /* ⚠️ فشل مستمع واحد لا يُسقط البقية: موظف بلا قسم أو بلا إعلانات موجّهة
     له يجب أن يرى إعلانات «الكل» لا شاشة خطأ. */
  const results = await Promise.all(queries.map((q) =>
    getDocs(q).then((s) => s.docs).catch((e) => { console.error('ann', e); return []; })));

  const seen = new Map();
  results.flat().forEach((d) => { if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...d.data() }); });
  return [...seen.values()];
}

/* الأدمن يقرأ الكل — قاعدته تسمح، ولا حاجة للمستمعين الثلاثة */
export async function allAnnouncements(max = 100) {
  const snap = await getDocs(query(collection(db, COLL), orderBy('publishAt', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
