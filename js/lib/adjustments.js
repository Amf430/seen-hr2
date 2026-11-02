/* ═══════════════════════════════════════════════════════════════════════════
   التصحيح اليدوي الموثَّق لسجل الحضور.

   ── المشكلة ──
   موظف نسي بصمة الانصراف. المسير يحتسب يومه «نسيان بصمة»، والأدمن عاجز: لا
   توجد أي طريقة في النظام لتصحيح بصمة ناقصة.

   ── لماذا لا نعدّل sessions مباشرة ──
   الجلسات الأصلية دليل. لحظة ما نسمح للأدمن بإعادة كتابتها يصير كل سجل في
   النظام قابلاً للتعديل بلا أثر، فيفقد السجل كله قيمته — بما فيه السجلات
   التي يُحتجّ بها في نزاع عمّالي.

   ── الحل ──
   قيد تصحيح منفصل يُقرأ فوق الأصل ولا يمسّه. الأصل يبقى للأبد، والتصحيح
   يُعرض بجانبه بسببه واسم من أجراه. من يراجع السجل يرى الاثنين.

   ⚠️ إضافة فقط في firestore.rules — لا تعديل ولا حذف حتى للأدمن. تصحيح خاطئ
   يُلغى بتصحيح مضادّ يظهر هو الآخر في السجل.
   ⚠️ السبب إلزامي (٣ أحرف على الأقل، تفرضه القاعدة لا الواجهة): تصحيح بلا
   سبب لا يختلف عن التزوير.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, setDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from './firebase.js';
import { getMe } from './state.js';
import { logAction } from './audit.js';
import { tsToDate } from './format.js';
import { employeeUidsOf } from './permission-link.js';
import {
  applyAttendanceAdjustments, applyAllAttendanceAdjustments,
  adjustedUnifiedAttendance, adjustedPayrollAttendance,
  missingPunchPenaltyState, MISSING_PUNCH_ADJUSTMENT
} from './attendance-pipeline.js';

/* المعرّف يحمل كل ما يميّز التصحيح — فإعادة تصحيح نفس الحقل تُنشئ قيداً
   جديداً بختم زمني مختلف بدل أن تكتب فوق السابق. */
const adjId = (a) => `${a.employeeUid}_${a.date}_${a.coll}_${a.sessionIdx}_${a.field}_${Date.now()}`;

export async function addAdjustment({ rec, coll, sessionIdx, field, value, reason }) {
  const me = getMe();
  const payload = {
    employeeUid:  rec.employeeUid,
    employeeName: rec.employeeName || '',
    date:         rec.date,
    coll,
    sessionIdx,
    field,                                   /* 'in' أو 'out' */
    value:        Timestamp.fromDate(value),
    reason:       reason.trim(),
    byUid:        me.id,
    byName:       me.name,
    at:           serverTimestamp()
  };
  await setDoc(doc(db, 'attendanceAdjustments', adjId(payload)), payload);
  await logAction('تصحيح سجل حضور',
    `${payload.employeeName} — ${payload.date} — ${field === 'in' ? 'دخول' : 'خروج'} — ${payload.reason}`);
}

/* خصم البصمة الناقصة سياسة مالية موثّقة، لا تصحيح وقت. لذلك لا يحمل value
   ولا يمرّ على Timestamp.fromDate إطلاقاً، ويبقى raw attendance كما هو. */
export async function addMissingPunchPenalty({
  rec, coll, sessionIdx, field, action = 'apply', penaltyMinutes, reason
}) {
  const minutes = Number(penaltyMinutes);
  if (!['in', 'out'].includes(field)
      || !['attendance', 'zkAttendance'].includes(coll)
      || !Number.isInteger(sessionIdx) || sessionIdx < 0 || sessionIdx >= 12
      || !((action === 'apply' && [60, 120, 180].includes(minutes))
        || (action === 'reverse' && minutes === 0)))
    throw new Error('invalid-missing-punch-penalty');
  const me = getMe();
  const payload = {
    adjustmentType: MISSING_PUNCH_ADJUSTMENT,
    employeeUid: rec.employeeUid,
    employeeName: rec.employeeName || '',
    date: rec.date,
    coll,
    sessionIdx,
    field,
    action,
    penaltyMinutes: minutes,
    reason: reason.trim(),
    byUid: me.id,
    byName: me.name,
    at: serverTimestamp()
  };
  // المعرّف التلقائي يحفظ كل حركة كسجل مستقل حتى لو تمّت حركتان في الملّي ثانية نفسها.
  await setDoc(doc(collection(db, 'attendanceAdjustments')), payload);
  const label = field === 'in' ? 'دخول' : 'خروج';
  const effect = action === 'apply' ? `خصم ${minutes / 60} س` : 'عكس الخصم';
  await logAction('تعديل خصم بصمة ناقصة',
    `${payload.employeeName} — ${payload.date} — بصمة ${label} — ${effect} — ${payload.reason}`);
}

/* ═══ الجلب ═══ */
export async function adjustmentsInRange(fromDate, toDate) {
  const snap = await getDocs(query(
    collection(db, 'attendanceAdjustments'),
    where('date', '>=', fromDate),
    where('date', '<=', toDate)
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* الموظف يقرأ تصحيحاته تحت UID الحالي وما سبقه. نقيّد كل Query بالهوية
   نفسها ثم نطبّق مدى التاريخ محلياً، لأن جمع UID + مدى يحتاج فهرساً مركباً
   جديداً بينما قواعد القراءة تثبت الهوية على كل نتيجة بالفعل. */
export async function adjustmentsForUsers(users, fromDate, toDate) {
  const ids = [...new Set((users || []).flatMap(employeeUidsOf))];
  const snaps = await Promise.all(ids.map((employeeUid) => getDocs(query(
    collection(db, 'attendanceAdjustments'), where('employeeUid', '==', employeeUid)
  ))));
  return [...new Map(snaps.flatMap((snap) => snap.docs
    .map((d) => ({ id: d.id, ...d.data() })))
    .filter((a) => a.date >= fromDate && a.date <= toDate)
    .map((a) => [a.id, a])).values()];
}

/* المدير لا يستطيع سرد تصحيحات UID تاريخي بقيد الهوية وحده: القاعدة تثبت
   القسم من سجل الحضور الخام، ولذلك يجب أن يثبت الاستعلام نفس السجل بدقة
   (المصدر + UID + التاريخ). هذا ليس ترشيحاً في المتصفح؛ كل Query يطابق
   adjustmentSourceSameDept() حرفياً، وأي سجل من قسم آخر يبقى مرفوضاً. */
export async function adjustmentsForAttendanceRecords(sources) {
  const keys = new Map();
  for (const source of sources || []) {
    if (!['attendance', 'zkAttendance'].includes(source?.coll)) continue;
    for (const rec of source.records || []) {
      if (!rec?.employeeUid || !rec?.date) continue;
      const key = source.coll + '|' + rec.employeeUid + '|' + rec.date;
      keys.set(key, { coll: source.coll, employeeUid: rec.employeeUid, date: rec.date });
    }
  }

  const base = collection(db, 'attendanceAdjustments');
  const snaps = await Promise.all([...keys.values()].map((k) => getDocs(query(base,
    where('coll', '==', k.coll),
    where('employeeUid', '==', k.employeeUid),
    where('date', '==', k.date)
  ))));
  return [...new Map(snaps.flatMap((snap) => snap.docs.map((d) =>
    [d.id, { id: d.id, ...d.data() }]))).values()];
}

/* ═══ التطبيق ═══

   ⚠️ ترتيب مقصود: القيد الأحدث يفوز. مصفوفة التصحيحات تُرتَّب بالوقت ثم
   تُطبَّق بالترتيب، فالتصحيح المضادّ الذي كُتب لاحقاً يمحو أثر السابق منطقياً
   بلا أن يُحذف أيٌّ منهما من السجل.

   ⚠️ الدالة تُرجع نسخة جديدة ولا تعدّل السجل الأصلي في مكانه — سجلات
   fetchAttendance مشتركة بين عدة شاشات، وتعديلها في مكانه يسرّب التصحيح إلى
   حسابات لم تطلبه. */
export const applyAdjustments = applyAttendanceAdjustments;

/* تطبيق دفعة كاملة — يُستدعى مرة واحدة بعد الجلب بدل مرة لكل صف */
export function applyAll(recs, adjustments) {
  return applyAllAttendanceAdjustments(recs, adjustments);
}

export {
  tsToDate, adjustedUnifiedAttendance, adjustedPayrollAttendance,
  missingPunchPenaltyState
};
