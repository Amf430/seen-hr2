/* ═══════════════════════════════════════════════════════════════════════════
   طلبات الموارد البشرية — قناة تواصل بين الموظف والموارد البشرية

   ── لماذا ليست «طلباً» كالاستئذان والإجازة ──
   الاستئذان والإجازة قراران: يُعتمدان أو يُرفضان، ويمسّان الرصيد والمسير.
   وهذا شيء آخر تماماً — سؤال يُطرح وجواب يُعطى: «متى ينزل التأمين؟»،
   «كم رصيدي يوم كذا؟». لا اعتماد ولا رفض، بل محادثة تنتهي حين تنتهي.

   فخلطُهما في مجموعة واحدة كان سيُدخل أسئلة الموظفين في صندوق الاعتمادات
   وفي تحليلات الطلبات وفي كل مكان يعدّ «الطلبات المعلّقة» — فيصير رقم
   الاعتمادات كاذباً.

   ── الشكل ──
   وثيقة للطلب، ومجموعة فرعية للرسائل تحته. والرسائل مجموعة فرعية لا مصفوفة
   على الوثيقة: المصفوفة تُكتب كاملةً في كل إضافة، فالقاعدة تحتاج أن تتحقّق
   أن ما سبق لم يتغيّر — وهو فحص لا يُكتب لعدد رسائل مفتوح (انظر الفحص
   المفكوك يدوياً لـ sessions في firestore.rules، وهو ممكن لأنها ١٢ فقط).
   المجموعة الفرعية تجعلها «إنشاء فقط»: `allow update, delete: if false`،
   فلا تُعدَّل رسالة قيلت ولا تُمحى.

   ⚠️ الحالة حقلان لا واحد: status (مفتوح/مغلق) و lastBy (من تكلّم أخيراً).
   «بانتظار ردّ الموارد البشرية» ليست حالةً ثالثة بل استنتاج من الاثنين —
   وحالةٌ ثالثة تُشتَقّ من غيرها تتناقض معه عاجلاً أو آجلاً.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, collection, addDoc, updateDoc, deleteDoc, getDocs, query, where,
  serverTimestamp
} from './firebase.js';
import { getMe, getSettings } from './state.js';
import { toast } from './dom.js';
import { logAction } from './audit.js';

export const TICKET_MAX_SUBJECT = 120;
export const TICKET_MAX_TEXT    = 2000;

export const ticketCategories = () => getSettings().hrTicketCategories || [];

/* الوسم المعروض — يجمع الحقلين في جملة واحدة يفهمها الطرفان */
export function ticketState(t, forRole) {
  if (t.status === 'closed') return { key: 'closed', label: 'مغلق', cls: '' };
  const waitingHr = t.lastBy !== 'hr';
  if (forRole === 'admin') {
    return waitingHr
      ? { key: 'todo',    label: 'بانتظار ردّك',            cls: 'pending' }
      : { key: 'replied', label: 'رددتَ — بانتظار الموظف',  cls: 'approved' };
  }
  return waitingHr
    ? { key: 'sent',    label: 'بانتظار الموارد البشرية', cls: 'pending' }
    : { key: 'answered', label: 'وصلك ردّ',               cls: 'approved' };
}

const trim = (s, max) => String(s || '').trim().slice(0, max);

/* ── إنشاء طلب ──
   الوثيقة ثم أول رسالة. لو فشلت الرسالة نحذف الوثيقة: طلب بلا نصّ يظهر
   للموارد البشرية سطراً فارغاً لا تعرف ما المطلوب فيه. */
export async function createTicket({ categoryId, subject, text }) {
  const me = getMe();
  const cat = ticketCategories().find((c) => c.id === categoryId);
  const body = trim(text, TICKET_MAX_TEXT);
  const title = trim(subject, TICKET_MAX_SUBJECT);
  if (!cat)   { toast('اختر التصنيف', 'err'); return null; }
  if (!title) { toast('اكتب عنواناً مختصراً', 'err'); return null; }
  if (!body)  { toast('اكتب تفاصيل طلبك', 'err'); return null; }

  let ref;
  try {
    ref = await addDoc(collection(db, 'hrTickets'), {
      employeeUid:   me.id,
      employeeName:  me.name,
      employeeEmpId: me.empId || '',
      department:    me.department || '',
      categoryId: cat.id, categoryLabel: cat.label,
      subject: title,
      status: 'open',
      lastBy: 'employee',
      lastText: body.slice(0, 140),
      createdAt: serverTimestamp(),
      lastAt:    serverTimestamp()
    });
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied'
      ? 'رُفض الطلب — تأكد أن بياناتك في النظام مكتملة'
      : 'تعذّر إرسال الطلب', 'err');
    return null;
  }

  try {
    await addMessageDoc(ref.id, body);
  } catch (e) {
    console.error(e);
    await deleteDoc(ref).catch(() => {});
    toast('تعذّر إرسال الطلب', 'err');
    return null;
  }
  toast('أُرسل طلبك للموارد البشرية', 'ok');
  return ref.id;
}

async function addMessageDoc(ticketId, text) {
  const me = getMe();
  await addDoc(collection(db, 'hrTickets', ticketId, 'messages'), {
    byUid:  me.id,
    byName: me.name,
    byRole: me.role === 'admin' ? 'hr' : 'employee',
    text,
    at: serverTimestamp()
  });
}

/* ── ردّ على طلب قائم ──
   ⚠️ الرسالة أولاً ثم ترويسة الطلب: لو انعكس الترتيب وفشلت الرسالة لبقيت
   الترويسة تقول إن هناك ردّاً لا وجود له. */
export async function replyToTicket(t, text) {
  const me = getMe();
  const body = trim(text, TICKET_MAX_TEXT);
  if (!body) { toast('اكتب ردّك أولاً', 'err'); return false; }
  const asHr = me.role === 'admin';
  try {
    await addMessageDoc(t.id, body);
    await updateDoc(doc(db, 'hrTickets', t.id), {
      lastBy: asHr ? 'hr' : 'employee',
      lastText: body.slice(0, 140),
      lastAt: serverTimestamp(),
      /* ردّ الموظف على طلب مغلق يفتحه من جديد — أهون من أن يُنشئ طلباً
         ثانياً عن الموضوع نفسه فتنقطع المحادثة نصفين. */
      status: 'open'
    });
    return true;
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied' ? 'ما عندك صلاحية للردّ هنا' : 'تعذّر إرسال الردّ', 'err');
    return false;
  }
}

/* الإغلاق للموارد البشرية وحدها — القاعدة تفرضه، وهذا للواجهة فقط */
export async function closeTicket(t) {
  try {
    await updateDoc(doc(db, 'hrTickets', t.id), { status: 'closed', closedAt: serverTimestamp() });
    await logAction('إغلاق طلب موارد بشرية', `${t.employeeName} — ${t.subject}`);
    return true;
  } catch (e) {
    console.error(e); toast('تعذّر إغلاق الطلب', 'err'); return false;
  }
}

/* ── القراءة ──
   ⚠️ بلا orderBy في الاستعلام: الترتيب مع شرط المساواة يحتاج فهرساً مركّباً
   يُنشأ من Console، والعدد هنا عشرات لا آلاف — فالترتيب في المتصفح أرخص من
   فهرس ينساه من ينشر النظام في مكان آخر. */
export async function fetchTickets() {
  const me = getMe();
  const q = (me.role === 'admin')
    ? query(collection(db, 'hrTickets'))
    : query(collection(db, 'hrTickets'), where('employeeUid', '==', me.id));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.lastAt?.seconds || 0) - (a.lastAt?.seconds || 0));
}

export async function fetchMessages(ticketId) {
  const snap = await getDocs(collection(db, 'hrTickets', ticketId, 'messages'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
}
