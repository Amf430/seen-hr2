/* ═══════════════════════════════════════════════════════════════════════════
   طلبات الاستئذان والإجازة — الإنشاء والموافقة والرفض وتعديل الأرصدة.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, collection, addDoc, updateDoc, deleteDoc, getDocs, query, where,
  serverTimestamp, runTransaction
} from './firebase.js';
import { getMe, getSettings } from './state.js';
import { hasChain, chainStep, isLastStep, ownsCurrentStep,
         CHAIN_ROLE_AR, chainRoleAr } from './perms.js';
import { toast, safeUrl } from './dom.js';
import { logAction } from './audit.js';
import { ymd, ymdKsa } from './dates.js';

/* ═══════════════════════════════════════════════════════════════════════════
   نافذة الاستئذان — ثلاثة أيام ثم تُغلق

   قرار المالك: الاستئذان يُقدَّم عن يومه أو عن ثلاثة أيام مضت على الأكثر.
   بعدها تُغلق الحالة نهائياً، ويُعتمد التأخير أو الخروج المبكر ذلك اليوم
   «بدون عذر» — يعني يبقى في الحساب ويُخصم عليه.

   ── لماذا نافذة أصلاً ──
   الاستئذان المعتمد يمحو دقائق التأخير من المسير (انظر payroll.js). فبلا
   حدّ زمني يقدر الموظف — بعد أن يرى الخصم في مسيره — أن يقدّم استئذاناً عن
   يوم في أول الشهر فيُلغيه بأثر رجعي. الحدّ يجعل العذر يُقدَّم وقته، حين
   يذكر الجميع ما جرى فعلاً، لا بعد أن يظهر الرقم.

   ⚠️ الحدّ على تاريخ الاستئذان لا على وقت التقديم: «حتى ثلاثة أيام من
   تاريخه». والمقارنة بنصوص YYYY-MM-DD لا بالطوابع الزمنية — نصوص التواريخ
   ترتّب معجمياً فتُقارن مباشرة، وحساب الفروق بالطوابع يُدخِل ساعة اليوم في
   المقارنة فتنقص النافذة يوماً كاملاً قرب منتصف الليل.

   ⚠️ نفس العدد مكرَّر في firestore.rules (permOk). الجدار الحقيقي هناك —
   هذا الملف يعطي الرسالة المفهومة قبل أن يصطدم بها الموظف. أي تغيير هنا
   يتغيّر هناك، وإلا رُفض الطلب برسالة صلاحيات غامضة.
   ═══════════════════════════════════════════════════════════════════════════ */
export const PERM_BACKDATE_DAYS = 3;

/* أقدم تاريخ يقبل استئذاناً اليوم — بتاريخ الرياض لا بتاريخ جهاز الموظف */
export function permOldestDate(today = ymdKsa()) {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - PERM_BACKDATE_DAYS);
  return ymd(d);
}

/* هل ما زالت نافذة الاستئذان مفتوحة على هذا اليوم؟ */
export function permWindowOpen(dateStr, today = ymdKsa()) {
  return !!dateStr && dateStr >= permOldestDate(today);
}

/* ── إنشاء طلب ──
   الحقول التعريفية (الاسم، القسم، الرقم الوظيفي) تُقرأ من ملف الموظف نفسه.
   القاعدة على السيرفر تتحقق أنها تطابق الملف فعلاً، فما عاد الموظف يقدر
   يرسل قسماً غير قسمه ليوجّه طلبه لمدير أسهل. */
export async function submitRequest(data) {
  const me = getMe();
  /* ⚠️ الحارس هنا لا في النموذج وحده: النموذج يضبط min على حقل التاريخ،
     لكن الحقل يُعدَّل من أدوات المطوّر، والصفحة قد تبقى مفتوحة عبر منتصف
     الليل فيصير التاريخ الذي كان مقبولاً خارج النافذة. */
  if (data.type === 'permission' && !permWindowOpen(data.date)) {
    toast(`أُغلقت نافذة الاستئذان عن ${data.date} — تُقبل حتى ${PERM_BACKDATE_DAYS} أيام من تاريخه`, 'err');
    return false;
  }
  /* الرابط يُنظَّف قبل الحفظ. القاعدة ترفض أي بروتوكول غير http/https أصلاً،
     لكن التنظيف هنا يعطي الموظف رسالة مفهومة بدل رفض غامض من Firestore. */
  if (data.attachmentLink) {
    const clean = safeUrl(data.attachmentLink);
    if (!clean) { toast('رابط المرفق غير صالح — لازم يبدأ بـ https', 'err'); return false; }
    data.attachmentLink = clean;
  }
  try {
    await addDoc(collection(db, 'requests'), {
      ...data,
      employeeUid:   me.id,
      employeeName:  me.name,
      employeeEmpId: me.empId || '',
      department:    me.department || '',
      status: 'pending',
      rejectReason: '',
      reviewedBy: '',
      reviewedAt: null,
      createdAt: serverTimestamp()
    });
    toast('تم تقديم الطلب بنجاح', 'ok');
    return true;
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied'
      ? 'رُفض الطلب — تأكد أن بياناتك في النظام مكتملة'
      : 'تعذّر تقديم الطلب', 'err');
    return false;
  }
}

/* ── هل يمسّ هذا الطلب رصيد الموظف؟ ──
   إجازة، بخصم، ولها نوع معرَّف. الاستئذان لا يمسّ الرصيد أبداً. */
const touchesBalance = (r) => r.type === 'leave' && !!r.deduct && !!r.leaveTypeId;

/* ⚠️ الرصيد الجديد بعد التعديل. sign=-1 خصم، sign=+1 إعادة.
   Math.max(0,…) يمنع الرصيد السالب، وقاعدة القبول على السيرفر تمنع days
   السالبة أصلاً — وهي التي كانت تسمح بتحويل الخصم إلى زيادة. */
function nextBalances(userData, r, sign) {
  const t = (getSettings().leaveTypes || []).find((x) => x.id === r.leaveTypeId);
  const bal = { ...((userData && userData.balances) || {}) };
  const cur = (bal[r.leaveTypeId] != null) ? bal[r.leaveTypeId] : (t ? t.balance : 0);
  bal[r.leaveTypeId] = Math.max(0, cur + sign * (r.days || 0));
  return bal;
}

/* ═══════════════════════════════════════════════════════════════════════════
   مراجعة طلب — تغيير الحالة وتعديل الرصيد في معاملة واحدة.

   ⚠️ لماذا معاملة واحدة، وليس نداءين متتاليين كما كان:
     1. الحالة كانت تُحدَّث أولاً ثم يُخصم الرصيد. لو انقطع الإنترنت أو أُغلق
        التبويب بينهما يبقى الطلب معتمداً والرصيد لم يُخصم — بلا أي أثر.
     2. زر «موافقة» كان بلا تعطيل، فنقرتان سريعتان تنفّذان الخصم مرتين.
        فحص `status` داخل المعاملة يجعل الثانية تفشل حتماً: لا يكفي تعطيل
        الزر، لأن تبويبين مفتوحين أو مديرين اثنين يتجاوزانه.

   ⚠️ ترتيب Firestore الإلزامي: كل القراءات قبل أي كتابة داخل المعاملة.
   ═══════════════════════════════════════════════════════════════════════════ */
async function reviewRequest(r, { from, to, sign, fields }) {
  const rref = doc(db, 'requests', r.id);
  /* sign=0 (الرفض) لا يمسّ الرصيد إطلاقاً — لا قراءة للمستخدم ولا كتابة.
     مهمّ لمدير القسم: قاعدة users لا تسمح له بالكتابة على ملف موظفه. */
  const needsBalance = sign !== 0 && touchesBalance(r);
  const uref = needsBalance ? doc(db, 'users', r.employeeUid) : null;

  await runTransaction(db, async (tx) => {
    /* ── القراءات ── */
    const snap = await tx.get(rref);
    if (!snap.exists()) throw new Error('request-gone');
    if (snap.data().status !== from) throw new Error('already-reviewed');
    const usnap = needsBalance ? await tx.get(uref) : null;

    /* ── الكتابات ── */
    tx.update(rref, { status: to, ...fields });
    if (needsBalance && usnap && usnap.exists()) {
      tx.update(uref, { balances: nextBalances(usnap.data(), r, sign) });
    }
  });
}

const REVIEW_ERRORS = {
  'already-reviewed': 'هذا الطلب روجِع بالفعل — حدّث الصفحة لترى حالته الحالية',
  'step-moved':       'تقدّمت السلسلة خطوةً بينما كانت الصفحة مفتوحة — حدّثها',
  'request-gone':     'الطلب لم يعد موجوداً',
  'permission-denied':'ما عندك صلاحية لمراجعة هذا الطلب'
};
const reviewError = (e) => REVIEW_ERRORS[e.code] || REVIEW_ERRORS[e.message] || 'تعذّر تنفيذ العملية';

/* ═══════════════════ سلسلة الموافقات ═══════════════════

   الطلب الذي يحمل حقل `chain` يمرّ بخطوات: كل معتمِد يوقّع خطوته، والطلب
   لا يصير «معتمَداً» إلا بعد آخر خطوة — وعندها فقط يُخصم الرصيد.

   ⚠️ الطلب بلا حقل chain يسلك المسار القديم حرفياً. لا ترحيل بيانات، ولا
   طلب قائم يتغيّر معناه. مطابق تماماً لما تفعله قاعدة hasChain() في
   firestore.rules.

   ⚠️ الرصيد يُخصم عند الخطوة الأخيرة وحدها. خصمه عند كل خطوة يعني خصماً
   مضاعفاً؛ وخصمه عند الأولى يعني خصماً من رصيد طلبٍ قد يُرفض لاحقاً. */
/* ⚠️ نُقلت مسنداتُ السلسلة (hasChain / chainStep / isLastStep / ownsCurrentStep)
   إلى perms.js: هي أسئلة صلاحية خالصة عن طلبٍ ومستخدم، لا عمليات كتابة.
   وبقاؤها هنا كان يجرّ firebase.js — ومعه الـCDN — إلى كل من يسألها، فيمنع
   اختبارها بـ node وحده. تُعاد تصديرها أدناه فلا يتغيّر أي مستورد. */
async function approveChainStep(r) {
  const me = getMe();
  const rref = doc(db, 'requests', r.id);
  const last = isLastStep(r);
  const needsBalance = last && touchesBalance(r);
  const uref = needsBalance ? doc(db, 'users', r.employeeUid) : null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(rref);
    if (!snap.exists()) throw new Error('request-gone');
    const cur = snap.data();
    if (cur.status !== 'pending') throw new Error('already-reviewed');
    if ((cur.step || 0) !== chainStep(r)) throw new Error('step-moved');
    const usnap = needsBalance ? await tx.get(uref) : null;

    tx.update(rref, {
      step: (cur.step || 0) + 1,
      approvals: [...(cur.approvals || []),
        { byUid: me.id, byName: me.name, step: cur.step || 0, at: new Date() }],
      status: last ? 'approved' : 'pending',
      reviewedBy: me.name,
      reviewedAt: serverTimestamp(),
      rejectReason: ''
    });
    if (needsBalance && usnap && usnap.exists()) {
      tx.update(uref, { balances: nextBalances(usnap.data(), r, -1) });
    }
  });
}

export async function approve(r) {
  const me = getMe();
  try {
    if (hasChain(r)) {
      await approveChainStep(r);
      await logAction(isLastStep(r) ? 'اعتماد نهائي لطلب' : 'اعتماد خطوة في سلسلة الموافقات',
        `${r.type === 'permission' ? 'استئذان' : 'إجازة'} — ${r.employeeName} — خطوة ${chainStep(r) + 1}/${r.chain.length}`);
      toast(isLastStep(r) ? 'اعتُمد الطلب نهائياً' : 'وُقِّعت خطوتك — انتقل الطلب للخطوة التالية', 'ok');
      return;
    }
    await reviewRequest(r, {
      from: 'pending', to: 'approved', sign: -1,
      fields: { reviewedBy: me.name, reviewedAt: serverTimestamp(), rejectReason: '' }
    });
  } catch (e) {
    console.error(e);
    toast(reviewError(e), 'err');
    throw e;                      /* المنادي يعيد تفعيل الزر */
  }
  await logAction('موافقة على طلب', `${r.type === 'permission' ? 'استئذان' : 'إجازة'} — ${r.employeeName}`);
  toast('تمت الموافقة على الطلب', 'ok');
}

export async function reject(r, reason) {
  const me = getMe();
  await reviewRequest(r, {
    from: 'pending', to: 'rejected', sign: 0,   /* لم يُخصم شيء بعد → لا شيء يُعاد */
    fields: { rejectReason: reason, reviewedBy: me.name, reviewedAt: serverTimestamp() }
  });
  await logAction('رفض طلب', `${r.employeeName} — ${reason}`);
  toast('تم رفض الطلب');
}

/* إلغاء موافقة سابقة — يُعاد الرصيد المخصوم مع تغيير الحالة، لا قبله.
   الشرط from:'approved' يمنع إعادة الرصيد مرتين لو ضُغط الزر من تبويبين. */
export async function revokeApproval(r, reason) {
  const me = getMe();
  await reviewRequest(r, {
    from: 'approved', to: 'rejected', sign: +1,
    fields: { rejectReason: reason, reviewedBy: me.name, reviewedAt: serverTimestamp() }
  });
  await logAction('إلغاء موافقة',
    `${r.type === 'permission' ? 'استئذان' : 'إجازة'} — ${r.employeeName} — ${reason}`);
  toast('تم إلغاء الموافقة' + (touchesBalance(r) ? ' وإعادة الرصيد' : ''), 'ok');
}

/* سحب الموظف لطلبه — القاعدة تسمح فقط بـ pending ← cancelled */
export async function withdraw(r) {
  try {
    await updateDoc(doc(db, 'requests', r.id), { status: 'cancelled', reviewedAt: serverTimestamp() });
    toast('تم إلغاء الطلب');
  } catch (e) { console.error(e); toast('تعذّر الإلغاء', 'err'); }
}

/* حذف كل طلبات دورة — إجراء إداري لا رجعة فيه */
export async function deleteRequests(list) {
  let done = 0;
  for (const r of list) {
    await deleteDoc(doc(db, 'requests', r.id));
    done++;
  }
  return done;
}

export async function requestsOfUser(uid) {
  const snap = await getDocs(query(collection(db, 'requests'), where('employeeUid', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export { hasChain, chainStep, isLastStep, ownsCurrentStep, CHAIN_ROLE_AR, chainRoleAr };
