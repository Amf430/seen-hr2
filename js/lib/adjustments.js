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

/* ═══ الجلب ═══ */
export async function adjustmentsInRange(fromDate, toDate) {
  const snap = await getDocs(query(
    collection(db, 'attendanceAdjustments'),
    where('date', '>=', fromDate),
    where('date', '<=', toDate)
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ═══ التطبيق ═══

   ⚠️ ترتيب مقصود: القيد الأحدث يفوز. مصفوفة التصحيحات تُرتَّب بالوقت ثم
   تُطبَّق بالترتيب، فالتصحيح المضادّ الذي كُتب لاحقاً يمحو أثر السابق منطقياً
   بلا أن يُحذف أيٌّ منهما من السجل.

   ⚠️ الدالة تُرجع نسخة جديدة ولا تعدّل السجل الأصلي في مكانه — سجلات
   fetchAttendance مشتركة بين عدة شاشات، وتعديلها في مكانه يسرّب التصحيح إلى
   حسابات لم تطلبه. */
export function applyAdjustments(rec, adjustments) {
  const mine = (adjustments || [])
    .filter((a) => a.employeeUid === rec.employeeUid && a.date === rec.date)
    .sort((a, b) => {
      const ta = a.at && a.at.toMillis ? a.at.toMillis() : 0;
      const tb = b.at && b.at.toMillis ? b.at.toMillis() : 0;
      return ta - tb;
    });
  if (!mine.length) return rec;

  const sessions = (rec.sessions || []).map((s) => ({ ...s }));
  const applied = [];
  for (const a of mine) {
    let s = sessions[a.sessionIdx];
    /* تصحيح على جلسة غير موجودة: ينشئها لو كان دخولاً — الحالة الواقعية هي
       موظف حضر ولم تُسجَّل بصمته إطلاقاً. */
    if (!s) {
      if (a.field !== 'in') continue;
      while (sessions.length <= a.sessionIdx) sessions.push({ in: null, out: null });
      s = sessions[a.sessionIdx];
    }
    s[a.field] = a.value;
    s[a.field + 'Adjusted'] = true;
    applied.push(a);
  }
  return { ...rec, sessions, __adjustments: applied, __adjusted: applied.length > 0 };
}

/* تطبيق دفعة كاملة — يُستدعى مرة واحدة بعد الجلب بدل مرة لكل صف */
export function applyAll(recs, adjustments) {
  if (!adjustments || !adjustments.length) return recs;
  return recs.map((r) => applyAdjustments(r, adjustments));
}

export { tsToDate };
