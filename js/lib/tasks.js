/* ═══════════════════════════════════════════════════════════════════════════
   المهام — القراءة والكتابة في Firestore

   ⚠️ كل قرار «من يقدر ينقل إلى أين» في js/lib/task-flow.js النقيّة. هذا
   الملف ينفّذ الكتابة ولا يقرّر شيئاً.

   ⚠️ حقل القسم مصفوفة `departments` من اليوم الأول، و`department` نسخة مفردة
   منها للفهرسة والعرض = departments[0]. القاعدة تشترط تطابقهما عند الإنشاء
   وتمنع تغيّرهما بعده. راجع ٥-ز في PROMPT-new-features.md قبل أن تلمس هذا.

   ⚠️ لا مجموعة `notifications`. اقرأ التعليق أعلى js/lib/notifications.js:
   الإشعارات تُشتقّ من الاشتراك اللحظي على المهام نفسها، لا من وثائق تُكتب
   لكل مستخدم — تلك ثغرة إغراق تحتاج Cloud Functions لسدّها.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, collection, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, runTransaction
} from './firebase.js';
import { getMe } from './state.js';
import { ymdKsa } from './dates.js';
import { logAction } from './audit.js';
import { ACTIVE_STATUSES, STATUS_AR } from './task-flow.js';

const COLL = 'tasks';
const ref  = (id) => doc(db, COLL, id);
const msgs = (id) => collection(db, COLL, id, 'messages');

/* ═══ التطبيع عند القراءة ═══
   ⚠️ الطوابع الزمنية تصل Timestamp من Firestore، والمنطق النقي يقارن نصوص
   'YYYY-MM-DD'. التحويل هنا مرة واحدة بدل أن يتكرّر في كل شاشة — وتكراره
   يعني شاشةً تنسى المنطقة الزمنية فتُظهر «متأخرة يوماً» لمهمة سُلّمت اليوم. */
const ymdOf = (ts) => {
  if (!ts) return null;
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return isNaN(d) ? null : ymdKsa(d);
};

export function normalizeTask(id, data) {
  return {
    id, ...data,
    departments: Array.isArray(data.departments) ? data.departments
               : (data.department ? [data.department] : []),
    createdAtYmd:   ymdOf(data.createdAt),
    startedAtYmd:   ymdOf(data.startedAt),
    doneAtYmd:      ymdOf(data.doneAt),
    lastMessageYmd: ymdOf(data.lastMessageAt)
  };
}

/* ═══ الإنشاء ═══ */
export async function createTask(input) {
  const me = getMe();
  const depts = (input.departments || []).filter(Boolean).slice(0, 3);
  if (!depts.length) throw new Error('no-department');

  const payload = {
    title: (input.title || '').trim().slice(0, 120),
    description: (input.description || '').slice(0, 4000),
    departments: depts,
    department: depts[0],              /* نسخة مفردة للفهرسة — القاعدة تشترط التطابق */
    assigneeUid:  input.assigneeUid || '',
    assigneeName: input.assigneeName || '',
    createdBy: me.id, createdByName: me.name,
    createdAt: serverTimestamp(),
    startDate: input.startDate || '',
    dueDate:   input.dueDate || '',
    priority:  ['low','normal','high','urgent'].includes(input.priority) ? input.priority : 'normal',
    estimateHours: Number(input.estimateHours) || 0,
    tags: (input.tags || []).slice(0, 5),
    status: 'new',
    progress: 0,
    employeeFeedback: '', managerNote: '', managerRating: 0,
    needsImprovement: false, reopenCount: 0,
    messageCount: 0,
    checklist: (input.checklist || []).slice(0, 20)
  };

  const created = await addDoc(collection(db, COLL), payload);
  await logAction('إنشاء مهمة', `${payload.title} — ${payload.assigneeName || 'بلا مكلَّف'}`);
  return created.id;
}

/* ═══ إنشاء بمعرّف حتمي (المرحلة ٧-أ: المهام المتكرّرة) ═══
   ⚠️ المعرّف الحتمي هو كل الحيلة: مديران يفتحان اللوحة في نفس الثانية
   يكتبان نفس المعرّف فتنتج وثيقة واحدة لا اثنتان. لا قفل ولا معاملة ولا
   علامة lastGenerated قابلة للتباعد. */
export async function createTaskWithId(id, input) {
  const snap = await getDoc(ref(id));
  if (snap.exists()) return false;          /* موجودة — توفير كتابة، والصحّة على المعرّف */
  const me = getMe();
  const depts = (input.departments || []).filter(Boolean).slice(0, 3);
  await setDoc(ref(id), {
    ...input,
    departments: depts, department: depts[0],
    createdBy: me.id, createdByName: me.name,
    createdAt: serverTimestamp(),
    status: 'new', progress: 0, messageCount: 0,
    employeeFeedback: '', managerNote: '', managerRating: 0,
    needsImprovement: false, reopenCount: 0
  });
  return true;
}

/* ═══ نقل الحالة ═══
   ⚠️ الطوابع تُكتب مع الانتقال لا بعده: startedAt عند أول in_progress،
   و doneAt عند الاعتماد. فصلهما يترك مهمة منجزة بلا تاريخ إنجاز، فتسقط من
   كل حساب «متوسط زمن الإنجاز» بصمت. */
export async function moveTask(task, to, extra = {}) {
  const patch = { status: to, ...extra };
  if (to === 'in_progress' && !task.startedAt) patch.startedAt = serverTimestamp();
  if (to === 'done') patch.doneAt = serverTimestamp();
  /* إعادة من review إلى in_progress = «يحتاج تحسين» — عدّادها مؤشر جودة */
  if (to === 'in_progress' && task.status === 'review') {
    patch.reopenCount = (task.reopenCount || 0) + 1;
    patch.needsImprovement = true;
  }
  if (to === 'done') patch.needsImprovement = false;
  await updateDoc(ref(task.id), patch);
}

export const updateTask   = (id, fields) => updateDoc(ref(id), fields);
export const deleteTask   = (id) => deleteDoc(ref(id));
export const getTask      = async (id) => {
  const s = await getDoc(ref(id));
  return s.exists() ? normalizeTask(s.id, s.data()) : null;
};

/* ═══ المحادثة ═══
   ⚠️ الرسالة وعدّادها في **معاملة واحدة**. فصلهما يترك خيطاً فيه رسالة لا
   يظهر لها أثر في اللوحة، فلا يعرف المدير أن فيه جديداً — وهو نفس الدرس
   المكتوب فوق requests.js:140. */
export async function postMessage(taskId, text) {
  const me = getMe();
  const clean = (text || '').trim().slice(0, 2000);
  if (!clean) return;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref(taskId));
    if (!snap.exists()) throw new Error('task-gone');
    const n = (snap.data().messageCount || 0) + 1;
    tx.set(doc(msgs(taskId)), {
      authorUid: me.id, authorName: me.name, authorRole: me.role || 'employee',
      text: clean, kind: 'msg', createdAt: serverTimestamp()
    });
    tx.update(ref(taskId), { messageCount: n, lastMessageAt: serverTimestamp() });
  });
}

export function watchMessages(taskId, cb, onErr) {
  return onSnapshot(query(msgs(taskId), orderBy('createdAt', 'asc'), limit(200)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onErr);
}

/* ═══ الاستعلامات ═══

   ⚠️ كل استعلام هنا يطابق قاعدته حرفياً. أي تباعد = رفض كامل وشاشة فارغة.
     الموظف : assigneeUid == uid          ← taskAssignee() في القاعدة
     المدير  : departments array-contains  ← taskDept() في القاعدة
   ولا تستعمل `!=` على الحالة: القائمة الصريحة أرخص، وتتفادى فهرساً زائداً. */
export async function tasksForAssignee(uid, statuses = ACTIVE_STATUSES) {
  const snap = await getDocs(query(collection(db, COLL),
    where('assigneeUid', '==', uid), where('status', 'in', statuses)));
  return snap.docs.map((d) => normalizeTask(d.id, d.data()));
}

export async function tasksForDept(dept, statuses = ACTIVE_STATUSES) {
  const snap = await getDocs(query(collection(db, COLL),
    where('departments', 'array-contains', dept), where('status', 'in', statuses)));
  return snap.docs.map((d) => normalizeTask(d.id, d.data()));
}

/* الأرشيف — صفحة مستقلة، واللوحة اليومية لا تقرؤه إطلاقاً */
export async function archivedTasksForDept(dept, max = 200) {
  const snap = await getDocs(query(collection(db, COLL),
    where('departments', 'array-contains', dept),
    where('status', '==', 'archived'),
    orderBy('archivedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => normalizeTask(d.id, d.data()));
}

/* كل المهام للأدمن — للتحليلات */
export async function allTasks(statuses = null) {
  const parts = [collection(db, COLL)];
  if (statuses) parts.push(where('status', 'in', statuses));
  const snap = await getDocs(query(...parts));
  return snap.docs.map((d) => normalizeTask(d.id, d.data()));
}

export { STATUS_AR };
