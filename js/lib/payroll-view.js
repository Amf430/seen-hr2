/* صفوف العرض المجمّدة وتجميعها — نقيّة كي لا تعيد أي شاشة تفسير Snapshot. */

const userForSnapshot = (r, users) => {
  const current = (users || []).find((u) =>
    u?.id === r.uid || (u?.previousUids || []).includes(r.uid));
  /* الهوية الحالية مطلوبة للرابط فقط. الاسم والقسم والمسمى من اللقطة نفسها
     حتى لا يغيّر تعديل بروفايل اليوم ملف مسير صُرف في الماضي. */
  return {
    ...(current || {}),
    id: current?.id || r.uid,
    name: r.name ?? current?.name ?? '',
    empId: r.empId ?? current?.empId ?? '',
    department: r.department ?? current?.department ?? '',
    jobTitle: r.jobTitle ?? current?.jobTitle ?? ''
  };
};

export function snapshotPayrollRows(run, users) {
  if (!run) return [];
  return (run.rows || []).map((r) => ({
    ...r,
    u: userForSnapshot(r, users),
    cfg: { ...(run.config || {}) },
    details: [],
    __snapshot: true
  }));
}

export function payrollRowsForView(run, freshRows, users) {
  return run ? snapshotPayrollRows(run, users) : (freshRows || []);
}

export function payrollRowForEmployee(run, freshRow, employee) {
  if (!run) return freshRow || null;
  const ids = new Set([employee?.id, ...(employee?.previousUids || [])].filter(Boolean));
  const row = (run.rows || []).find((r) => ids.has(r.uid));
  return row ? snapshotPayrollRows({ ...run, rows: [row] }, [employee])[0] : null;
}

export function payrollTotals(rows) {
  return (rows || []).reduce((a, r) => ({
    salary: a.salary + (Number(r.salary) || 0),
    dedHours: a.dedHours + (Number(r.dedHours) || 0),
    dedAbsent: a.dedAbsent + (Number(r.dedAbsent) || 0),
    dedUnpaid: a.dedUnpaid + (Number(r.dedUnpaid) || 0),
    total: a.total + (Number(r.total) || 0),
    net: a.net + (Number(r.net) || 0),
    lateMin: a.lateMin + (Number(r.lateMin) || 0),
    earlyMin: a.earlyMin + (Number(r.earlyMin) || 0),
    gapMin: a.gapMin + (Number(r.gapMin) || 0),
    absentDays: a.absentDays + (Number(r.absentDays) || 0),
    missingOut: a.missingOut + (Number(r.missingOut) || 0)
  }), { salary: 0, dedHours: 0, dedAbsent: 0, dedUnpaid: 0, total: 0, net: 0,
        lateMin: 0, earlyMin: 0, gapMin: 0, absentDays: 0, missingOut: 0 });
}
