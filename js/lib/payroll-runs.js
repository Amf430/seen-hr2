/* ═══════════════════════════════════════════════════════════════════════════
   اعتماد المسير وتجميده.

   ── المشكلة التي يحلّها هذا الملف ──
   computePayroll() تحسب المسير لحظياً من الورديات والإعدادات والسجلات كما هي
   الآن. هذا صحيح ما دامت الدورة جارية، وخطأ محاسبي فادح بعد الصرف: لو عدّل
   الأدمن وردية قسم أو أضاف عطلة رسمية بأثر رجعي، تغيّرت أرقام شهر مضى —
   والملف الذي صُرِفت عليه الرواتب لم يعد له أصل في النظام.

   ── الحل ──
   لقطة تُكتب مرة واحدة وقت الاعتماد وتحمل:
     • الصفوف النهائية لكل موظف (اسمه ورقمه وراتبه وخصومه ومستحقه)
     • الإجماليات
     • القواعد التي حُسبت بها (hoursPerDay, daysPerMonth, graceMinutes)
     • من اعتمد ومتى

   بعد الاعتماد تعرض الصفحة اللقطة لا الحساب. الفرق يظهر للمالك صراحةً لو
   تغيّرت البيانات لاحقاً — فيعرف أن هناك تعديلاً بعد الصرف بدل أن يبتلعه
   الرقم بصمت.

   ⚠️ إضافة فقط في firestore.rules — لا تعديل ولا حذف حتى للأدمن. مسير مصروف
   لا يُمحى؛ الخطأ فيه يُصحَّح بقيد تسوية في الدورة التالية.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from './firebase.js';
import { getMe } from './state.js';
import { payrollConfig } from './payroll.js';
import { logAction } from './audit.js';

/* ⚠️ الصفوف تُختصر عمداً: computePayroll ترجع مع كل صف مصفوفة details فيها
   يوم بيوم. تخزينها لأربعين موظفاً يتجاوز حدّ الوثيقة (مليون بايت). نحفظ
   الأرقام النهائية التي صُرِف عليها — وهي وحدها ما يُحتجّ به محاسبياً.
   التفصيل اليومي يبقى قابلاً لإعادة الاشتقاق من المصدر المحفوظ في config.
   أما الأرقام المحتجّ بها فهي الصفوف المختصرة نفسها، لا إعادة الاشتقاق. */
function slimRow(r) {
  return {
    uid: r.u.id, name: r.u.name || '', empId: r.u.empId || '',
    department: r.u.department || '', jobTitle: r.u.jobTitle || '',
    salary: r.salary, dayRate: +r.dayRate.toFixed(2), hourRate: +r.hourRate.toFixed(2),
    workDays: r.workDays, presentDays: r.presentDays, lateDays: r.lateDays,
    absentDays: r.absentDays, unpaidDays: r.unpaidDays, paidLeaveDays: r.paidLeaveDays,
    missingOut: r.missingOut,
    lateMin: r.lateMin, earlyMin: r.earlyMin, gapMin: r.gapMin || 0, exemptMin: r.exemptMin,
    reqH: +r.reqH.toFixed(2), workH: +r.workH.toFixed(2),
    recordedWorkH: +(Number.isFinite(r.recordedWorkH) ? r.recordedWorkH : r.workH).toFixed(2),
    dedHours: +r.dedHours.toFixed(2), dedAbsent: +r.dedAbsent.toFixed(2),
    dedUnpaid: +r.dedUnpaid.toFixed(2),
    total: +r.total.toFixed(2), net: +r.net.toFixed(2)
  };
}

export async function approveRun(cyc, rows, config = payrollConfig()) {
  const me = getMe();
  const slim = rows.map(slimRow);
  const totals = slim.reduce((a, r) => ({
    salary: a.salary + r.salary, total: a.total + r.total, net: a.net + r.net,
    absentDays: a.absentDays + r.absentDays, lateMin: a.lateMin + r.lateMin,
    earlyMin: a.earlyMin + r.earlyMin, gapMin: a.gapMin + (r.gapMin || 0),
    missingOut: a.missingOut + r.missingOut,
    headcount: a.headcount + 1
  }), { salary: 0, total: 0, net: 0, absentDays: 0, lateMin: 0, earlyMin: 0, gapMin: 0, missingOut: 0, headcount: 0 });

  await setDoc(doc(db, 'payrollRuns', cyc.key), {
    cycleKey: cyc.key,
    cycleLabel: cyc.label,
    approvedBy: me.name,
    approvedByUid: me.id,
    approvedAt: serverTimestamp(),
    rows: slim,
    totals,
    config
  });
  await logAction('اعتماد مسير الرواتب',
    `${cyc.label} — ${totals.headcount} موظفاً · المستحق ${totals.net.toFixed(2)}`);
  return { rows: slim, totals };
}

export async function getRun(cycleKey) {
  const snap = await getDoc(doc(db, 'payrollRuns', cycleKey));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listRuns() {
  const snap = await getDocs(collection(db, 'payrollRuns'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.cycleKey < b.cycleKey ? 1 : -1));
}

/* ═══ المقارنة ═══
   بعد الاعتماد نحسب المسير من جديد ونقارنه باللقطة. أي فرق يعني أن بيانات
   الدورة تغيّرت بعد الصرف — وردية عُدِّلت، عطلة أُضيفت، بصمة صُحِّحت. الفرق
   يُعرض للمالك صراحةً بدل أن يبتلعه الرقم. */
export function diffAgainstRun(run, freshRows) {
  if (!run) return [];
  const byUid = {};
  (run.rows || []).forEach((r) => { byUid[r.uid] = r; });
  const out = [];
  for (const f of freshRows) {
    const old = byUid[f.u.id];
    const net = +f.net.toFixed(2);
    if (!old) { out.push({ name: f.u.name, kind: 'new', was: null, now: net }); continue; }
    if (Math.abs(old.net - net) >= 0.01)
      out.push({ name: f.u.name, kind: 'changed', was: old.net, now: net, delta: +(net - old.net).toFixed(2) });
  }
  const freshIds = new Set(freshRows.map((f) => f.u.id));
  (run.rows || []).forEach((r) => {
    if (!freshIds.has(r.uid)) out.push({ name: r.name, kind: 'gone', was: r.net, now: null });
  });
  return out;
}
