/* ═══════════════════════════════════════════════════════════════════════════
   مركز الإشعارات — البديل المجاني للإشعارات الفورية.

   ── لماذا لا مجموعة `notifications` في Firestore ──
   كان الحلّ البديهي: مجموعة يكتب فيها المعتمِد إشعاراً للموظف. رفضتُه لثلاثة
   أسباب، أثقلها الثاني:

     ١. تكلفة: كتابة لكل حدث، وقراءة لكل فتح، واشتراك لحظي ثالث لكل مستخدم —
        على نظام كل بياناته مقروءة أصلاً.
     ٢. ⚠️ ثغرة إغراق: ليُشعَر المديرُ بطلب جديد، يجب أن يُسمح للموظف بالكتابة
        في وثيقة موجّهة لشخص آخر. وأي قاعدة تسمح بذلك تسمح لموظف واحد بإغراق
        أي مستخدم بآلاف الإشعارات. سدّها يحتاج Cloud Functions — أي خطة Blaze،
        وهي بالضبط ما نتجنّبه.
     ٣. تكرار مصدر الحقيقة: حالة الطلب موجودة على الطلب نفسه. نسخها في إشعار
        يعني حالتين تتباعدان عند أول فشل كتابة.

   ── ما يفعله هذا الملف بدلاً منه ──
   يشتقّ الإشعارات من البيانات المتدفّقة أصلاً. راجع subscriptions.js: كل
   مستخدم مشترك لحظياً فيما يحتاجه بالضبط —
     الموظف : طلباته هو + وثيقته هو
     المدير  : طلبات قسمه
     الأدمن  : كل الطلبات
   فالحدث الذي يستحقّ إشعاراً موجود في الذاكرة قبل أن نسأل عنه. صفر قراءة
   إضافية، صفر كتابة، صفر قاعدة جديدة، وصفر باب لإغراق أحد.

   ── الحدّ الصريح ──
   هذا مركز إشعارات، لا Push. لا يصل شيء والتطبيق مغلق — إرسال Push يحتاج
   خادماً يوقّع الرسالة، أي Cloud Functions، أي Blaze. ما يعالجه هذا الملف هو
   أن الموظف يفتح النظام فيعرف فوراً ما تغيّر، بدل أن يتصفّح صفحاته بحثاً عنه.
   (وتذكير الانصراف في reminders.js يطلق إشعار نظام حقيقياً ما دام التبويب
   مفتوحاً — وهو أقصى ما يمكن مجاناً.)

   ⚠️ «المقروء» في localStorage لا في Firestore: هو شأن هذا الجهاز وهذا
   المستخدم، ولا يستحق كتابة في القاعدة. وثمنه أن فتح النظام على جهاز آخر
   يُظهر الإشعارات غير مقروءة — وهو ثمن مقبول مقابل ألّا يكلّف شيئاً.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getMe, getRequests } from './state.js';
import { canApprove, hasChain, ownsCurrentStep } from './perms.js';
import { contractDaysLeft } from './dates.js';
import { docsOf, docStatus, kindLabel } from './documents.js';

/* سقف ما نُبقيه من معرّفات مقروءة. بلا سقف ينمو المفتاح بلا نهاية حتى يضرب
   حدّ localStorage (٥ ميغابايت) فترمي setItem ويتوقّف التعليم كمقروء. */
const SEEN_CAP = 300;

const seenKey = () => {
  const me = getMe();
  return `seenNotifs_${me ? me.id : 'x'}`;
};

export function seenIds() {
  try {
    const raw = localStorage.getItem(seenKey());
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
}

function writeSeen(set) {
  try {
    localStorage.setItem(seenKey(), JSON.stringify([...set].slice(-SEEN_CAP)));
  } catch (e) { /* وضع التصفّح الخاص يمنع الكتابة — الإشعارات تبقى تعمل */ }
}

export function markSeen(ids) {
  const s = seenIds();
  (Array.isArray(ids) ? ids : [ids]).forEach((i) => s.add(i));
  writeSeen(s);
}

export function markAllSeen() {
  markSeen(buildNotifications().map((n) => n.id));
}

/* ═══ البناء ═══
   المعرّف يحمل الحالة لا الطلب وحده: `dec_<id>_approved` يختلف عن
   `dec_<id>_rejected`. فلو رُفض طلب ثم أُعيد فتحه واعتُمد، وصل إشعار جديد
   بدل أن يبتلعه معرّف قديم صار مقروءاً. */
export function buildNotifications() {
  const me = getMe();
  if (!me) return [];
  const out = [];
  const reqs = getRequests();

  const typeLabel = (r) => (r.type === 'leave' ? 'إجازة' : 'استئذان');
  const when = (r) => r.reviewedAt || r.createdAt || null;

  /* ── ١ · قرار على طلبي ──
     الحدث الذي كان يفرض على الموظف أن يفتح «طلباتي» ويتفقّد بنفسه. */
  for (const r of reqs) {
    if (r.employeeUid !== me.id) continue;
    if (r.status !== 'approved' && r.status !== 'rejected') continue;
    out.push({
      id: `dec_${r.id}_${r.status}`,
      at: when(r),
      page: 'mine',
      ico: r.status === 'approved' ? 'check' : 'x',
      tone: r.status === 'approved' ? 'good' : 'bad',
      title: r.status === 'approved'
        ? `اعتُمد طلب ${typeLabel(r)}`
        : `رُفض طلب ${typeLabel(r)}`,
      body: [r.reviewedBy ? `بواسطة ${r.reviewedBy}` : '',
             r.status === 'rejected' && r.rejectReason ? `السبب: ${r.rejectReason}` : '']
        .filter(Boolean).join(' · ')
    });
  }

  /* ── ٢ · طلب ينتظر موافقتي ──
     نفس شرط الشارة في shell.js حرفياً — فلا يختلف عدد الجرس عن عدد الشارة. */
  if (me.role === 'admin' || me.role === 'manager') {
    for (const r of reqs) {
      if (r.status !== 'pending') continue;
      if (!(hasChain(r) ? ownsCurrentStep(r) : canApprove(r))) continue;
      out.push({
        id: `req_${r.id}`,
        at: when(r),
        page: 'inbox',
        ico: 'inbox',
        tone: 'warn',
        title: `طلب ${typeLabel(r)} ينتظر موافقتك`,
        body: [r.employeeName, r.department].filter(Boolean).join(' · ')
      });
    }
  }

  /* ── ٣ · مستنداتي ──
     الإقامة المنتهية غرامة على الشركة، لكن الموظف هو من يجدّدها. */
  for (const d of docsOf(me)) {
    const st = docStatus(d);
    if (st.state !== 'expired' && st.state !== 'soon') continue;
    out.push({
      id: `doc_${d.id}_${st.state}`,
      at: null,
      page: 'home',
      ico: st.state === 'expired' ? 'alert' : 'doc',
      tone: st.state === 'expired' ? 'bad' : 'warn',
      title: st.state === 'expired'
        ? `${kindLabel(d.kind)} منتهٍ منذ ${Math.abs(st.left)} يوم`
        : `${kindLabel(d.kind)} ينتهي خلال ${st.left} يوم`,
      body: 'راجع الموارد البشرية للتجديد'
    });
  }

  /* ── ٤ · عقدي ──
     ⚠️ المعرّف يحمل «شريحة» لا العدد: بلا ذلك يتغيّر المعرّف كل يوم فيعود
     الإشعار غير مقروء كل صباح حتى ينتهي العقد. */
  const dl = contractDaysLeft(me.contractEnd);
  if (dl !== null && dl <= 60) {
    const bucket = dl < 0 ? 'expired' : dl <= 14 ? 'd14' : dl <= 30 ? 'd30' : 'd60';
    out.push({
      id: `contract_${bucket}`,
      at: null,
      page: 'home',
      ico: dl < 0 ? 'alert' : 'calendar',
      tone: dl < 0 ? 'bad' : 'warn',
      title: dl < 0 ? `عقدك منتهٍ منذ ${Math.abs(dl)} يوم` : `عقدك ينتهي خلال ${dl} يوم`,
      body: 'راجع الموارد البشرية'
    });
  }

  /* الأحدث أولاً، وما لا تاريخ له (المستندات والعقد) في الأعلى لأنه دائم */
  return out.sort((a, b) => {
    const ta = a.at && a.at.toMillis ? a.at.toMillis() : (a.at ? +new Date(a.at) : Infinity);
    const tb = b.at && b.at.toMillis ? b.at.toMillis() : (b.at ? +new Date(b.at) : Infinity);
    return tb - ta;
  });
}

/* الإشعارات مع حالة القراءة — هذا ما تستهلكه الواجهة */
export function notifications() {
  const seen = seenIds();
  return buildNotifications().map((n) => ({ ...n, read: seen.has(n.id) }));
}

export const unreadCount = () => notifications().filter((n) => !n.read).length;
