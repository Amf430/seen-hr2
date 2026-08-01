/* ═══════════════════════════════════════════════════════════════════════════
   الاشتراكات اللحظية — تعيش طوال عمر الجلسة.

   ⚠️ قوائم إعادة العرض أدناه منقولة حرفياً من النسخة القديمة. هي التي تحدّد
   أي صفحة تتحدّث تلقائياً عند وصول بيانات جديدة. حذف معرّف من قائمة = توقّف
   التحديث اللحظي لتلك الصفحة بصمت، بلا خطأ ولا أثر.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, collection, query, where, onSnapshot } from '../lib/firebase.js';
import { getMe, setMe, setRequests, getRequests } from '../lib/state.js';
import { sortByCreated } from '../lib/dates.js';
import { rerenderIf } from '../lib/nav.js';
import { refreshUsers } from '../lib/users.js';
import { updateBadges, paintIdentity } from './shell.js';

let unsubReqs = null;
let unsubMe = null;

/* الصفحات التي يُعاد عرضها عند تغيّر ملف المستخدم نفسه */
const ME_PAGES       = ['home', 'new', 'mine', 'attend'];
const EMPLOYEE_PAGES = ['home', 'mine', 'attend'];
const MANAGER_PAGES  = ['home', 'inbox', 'mine', 'attend'];
const ADMIN_PAGES    = ['home', 'inbox', 'reports', 'audit', 'monthly'];

export function subscribeData() {
  unsubscribeAll();
  const me = getMe();

  /* ملف المستخدم نفسه — يحدّث الرصيد فوراً عند خصمه أو إعادته
     دون الحاجة لتسجيل خروج ودخول */
  /* ⚠️ حقول لا تستدعي إعادة عرض الصفحة.
     bioCredentials تُكتب في منتصف تسجيل الحضور (عند ربط بصمة الجهاز أول مرة).
     وبما أن هذه الوثيقة تحت اشتراك لحظي، كانت الكتابة تُعيد عرض الصفحة تحت
     قدمي الموظف بينما هو داخل العملية — فيُهدم زر الحضور ويضيع ما جرى.
     الحل: نقارن ما تغيّر فعلاً، ولا نُعيد العرض إن كان التغيير لا يخصّ الشاشة. */
  const COSMETIC = new Set(['bioCredentials']);
  let prev = { ...me };

  unsubMe = onSnapshot(doc(db, 'users', me.id), (snap) => {
    if (!snap.exists()) return;
    const next = { id: me.id, ...snap.data() };
    const changed = [...new Set([...Object.keys(prev), ...Object.keys(next)])]
      .filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
    prev = { ...next };

    setMe(next);
    paintIdentity();

    /* ⚠️ `!changed.length` شرط أساسي لا تحسين: اللقطة الأولى للاشتراك — وكل
       لقطة يولّدها Firestore محلياً قبل تأكيد الخادم — تصل بلا تغيير فعلي.
       بالشرط القديم (changed.length && …) كانت تسقط للسطر التالي فتُعيد عرض
       الصفحة تحت قدمي الموظف، وهو بالضبط ما يحاول هذا الفحص منعه. */
    if (!changed.length || changed.every((k) => COSMETIC.has(k))) return;
    rerenderIf(ME_PAGES);
  }, (err) => console.error('me', err));

  if (me.role === 'manager') {
    /* مدير القسم: طلبات قسمه فقط، وتشمل طلباته الشخصية */
    const q1 = query(collection(db, 'requests'), where('department', '==', me.department || '—'));
    unsubReqs = onSnapshot(q1, (snap) => {
      /* الطلبات الملغاة تبقى خاصة بصاحبها — المدير يرى ملغاته هو فقط */
      setRequests(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.status !== 'cancelled' || r.employeeUid === me.id)));
      updateBadges();
      rerenderIf(MANAGER_PAGES);
    }, (err) => console.error('reqs', err));
    refreshUsers().catch((e) => console.error(e));

  } else if (me.role === 'admin') {
    unsubReqs = onSnapshot(query(collection(db, 'requests')), (snap) => {
      /* الأدمن لا يرى الملغاة إطلاقاً — قرار منتج مقصود، لا سهو */
      setRequests(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.status !== 'cancelled')));
      updateBadges();
      rerenderIf(ADMIN_PAGES);
    }, (err) => console.error('reqs', err));
    refreshUsers().catch((e) => console.error(e));

  } else {
    const q1 = query(collection(db, 'requests'), where('employeeUid', '==', me.id));
    unsubReqs = onSnapshot(q1, (snap) => {
      setRequests(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      updateBadges();
      rerenderIf(EMPLOYEE_PAGES);
    }, (err) => console.error('reqs', err));
  }
}

export function unsubscribeAll() {
  if (unsubReqs) { unsubReqs(); unsubReqs = null; }
  if (unsubMe)   { unsubMe();   unsubMe = null; }
  setRequests([]);
}

export { getRequests };
