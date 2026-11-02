/* ═══════════════════════════════════════════════════════════════════════════
   قراءة وكتابة جدول المناوبات الأسبوعي للأقسام.

   الحساب لا يستعلم من Firestore. هذه الوحدة تحمّل Approved snapshots إلى
   الكاش النقي، ثم resolveShift يقرأها محلياً مثل الإعدادات الحالية.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  db, doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, runTransaction, serverTimestamp
} from './firebase.js';
import { getMe, getSettings } from './state.js';
import { shiftPlansOf } from './shifts.js';
import { ymdKsa } from './dates.js';
import { logAction } from './audit.js';
import {
  ROSTER_STATUS, isRosterManager, rosterDepartmentById, rosterDaysOk, rosterIdOf,
  setApprovedRosterEntries, snapshotRosterDays, weekEndOf
} from './weekly-roster.js';

const rosterRef = (departmentId, weekStart) => {
  const id = rosterIdOf(departmentId, weekStart);
  if (!id) throw new Error('invalid-roster-id');
  return doc(db, 'weeklyRosters', id);
};
const entriesRef = (departmentId, weekStart) =>
  collection(rosterRef(departmentId, weekStart), 'entries');
const entryRef = (departmentId, weekStart, uid) =>
  doc(rosterRef(departmentId, weekStart), 'entries', uid);
const mapDoc = (d) => ({ id: d.id, ...d.data() });

async function entriesVisibleTo(me, roster) {
  if (!roster || roster.status !== ROSTER_STATUS.APPROVED) return [];
  const addParent = (x) => ({ ...x, weekStart: roster.weekStart,
    departmentId: roster.departmentId, department: roster.department });
  if (me.role === 'admin' || (me.role === 'manager' && me.department === roster.department)) {
    const snap = await getDocs(entriesRef(roster.departmentId, roster.weekStart));
    return snap.docs.map((d) => addParent(mapDoc(d)));
  }
  if (me.department !== roster.department) return [];
  const ids = [...new Set([me.id, ...(Array.isArray(me.previousUids) ? me.previousUids : [])].filter(Boolean))];
  const snaps = await Promise.all(ids.map((uid) => getDoc(entryRef(roster.departmentId, roster.weekStart, uid))));
  return snaps.filter((s) => s.exists()).map((s) => addParent(mapDoc(s)));
}

async function installApproved(rosterDocs) {
  const me = getMe();
  const rosters = (rosterDocs || []).map(mapDoc);
  const nested = await Promise.all(rosters.map((r) => entriesVisibleTo(me, r)));
  setApprovedRosterEntries(nested.flat());
  return nested.flat();
}

function approvedRostersQuery(me = getMe()) {
  if (me?.role === 'admin') return query(collection(db, 'weeklyRosters'),
    where('status', '==', ROSTER_STATUS.APPROVED));
  if (!me?.department) return null;
  /* قيدا مساواة فقط؛ Firestore يدمجهما من الفهارس الأحادية الموجودة، فلا
     نضيف Composite Index لمجرد هذا الـoverride الاختياري. */
  return query(collection(db, 'weeklyRosters'),
    where('status', '==', ROSTER_STATUS.APPROVED),
    where('department', '==', me.department));
}

export async function loadApprovedWeeklyRosters() {
  const q = approvedRostersQuery();
  if (!q) { setApprovedRosterEntries([]); return []; }
  const snap = await getDocs(q);
  return installApproved(snap.docs);
}

/* تغيّر Parent هو الحدث الوحيد الذي يغيّر الفعالية. Entries في Approved
   مجمّدة، وتعديل Draft/Returned لا يجب أن يعيد حساب حضور أي شخص. */
export function subscribeApprovedWeeklyRosters(onChange) {
  const q = approvedRostersQuery();
  if (!q) {
    setApprovedRosterEntries([]);
    if (onChange) onChange([]);
    return () => {};
  }
  return onSnapshot(q, async (snap) => {
    try {
      const entries = await installApproved(snap.docs);
      if (onChange) onChange(entries);
    } catch (e) { console.error('weeklyRosters', e); }
  }, (e) => console.error('weeklyRosters', e));
}

export async function fetchWeeklyRoster(departmentId, weekStart) {
  const me = getMe();
  let roster = null;
  if (me?.role === 'manager') {
    /* getDoc لوثيقة غير موجودة لا يملك resource ليثبت same-department في
       Rules. الاستعلام المقيد يثبت القسم والأسبوع حتى عندما تكون النتيجة صفر. */
    const snap = await getDocs(query(collection(db, 'weeklyRosters'),
      where('department', '==', me.department), where('weekStart', '==', weekStart)));
    const found = snap.docs.find((d) => d.data().departmentId === departmentId);
    roster = found ? mapDoc(found) : null;
  } else {
    const snap = await getDoc(rosterRef(departmentId, weekStart));
    roster = snap.exists() ? mapDoc(snap) : null;
  }
  if (!roster) return { roster: null, entries: [] };
  const es = await getDocs(entriesRef(departmentId, weekStart));
  return { roster, entries: es.docs.map(mapDoc) };
}

function assertRosterManager(departmentId) {
  const me = getMe(), settings = getSettings();
  if (!isRosterManager(me, settings, departmentId)) throw new Error('not-roster-manager');
  const cfg = rosterDepartmentById(settings, departmentId);
  if (!cfg) throw new Error('invalid-department');
  return { me, cfg };
}

export async function saveWeeklyRosterDraft(departmentId, weekStart, rows) {
  const { me, cfg } = assertRosterManager(departmentId);
  const weekEnd = weekEndOf(weekStart);
  if (!weekEnd) throw new Error('invalid-week-start');
  const valid = (rows || []).filter((r) => r?.employeeUid && rosterDaysOk(r.days));
  if (valid.length !== (rows || []).length) throw new Error('invalid-roster-entry');
  const current = await getDoc(rosterRef(departmentId, weekStart));
  const old = current.exists() ? current.data() : null;
  if (old && (old.departmentId !== departmentId
      || ![ROSTER_STATUS.DRAFT, ROSTER_STATUS.RETURNED].includes(old.status)))
    throw new Error('roster-not-editable');

  if (!old) {
    await setDoc(rosterRef(departmentId, weekStart), {
      weekStart, weekEnd, departmentId, departmentIndex: cfg.departmentIndex,
      department: cfg.department, status: ROSTER_STATUS.DRAFT,
      createdByUid: me.id, createdByName: me.name, createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(), submittedByUid: '', submittedAt: null,
      reviewedByUid: '', reviewedByName: '', reviewedAt: null, returnNote: ''
    });
  } else {
    /* إعادة ترتيب departments لا تغيّر الهوية: نكتب index الحالي فقط بعد أن
       isRosterManager أثبت departmentId نفسه. القاعدة تعيد الإثبات على السيرفر. */
    await updateDoc(rosterRef(departmentId, weekStart), {
      departmentIndex: cfg.departmentIndex, department: cfg.department,
      updatedAt: serverTimestamp()
    });
  }

  const existing = await getDocs(entriesRef(departmentId, weekStart));
  const existingByUid = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const keep = new Set(valid.map((r) => r.employeeUid));
  await Promise.all(existing.docs.filter((d) => !keep.has(d.id)).map((d) => deleteDoc(d.ref)));
  await Promise.all(valid.map((r) => {
    const approvedDays = existingByUid.get(r.employeeUid)?.approvedDays;
    return setDoc(entryRef(departmentId, weekStart, r.employeeUid), {
      employeeUid: r.employeeUid,
      employeeName: String(r.employeeName || '').slice(0, 120),
      department: cfg.department,
      days: r.days,
      /* تبقى اللقطة التاريخية كما هي عند Returned؛ الاعتماد التالي وحده يستبدلها. */
      ...(approvedDays ? { approvedDays } : {}),
      updatedAt: serverTimestamp()
    });
  }));
  await logAction('حفظ جدول مناوبات', `${weekStart} — ${cfg.department}`);
}

export async function submitWeeklyRoster(departmentId, weekStart) {
  const { me } = assertRosterManager(departmentId);
  const { roster, entries } = await fetchWeeklyRoster(departmentId, weekStart);
  if (!roster || ![ROSTER_STATUS.DRAFT, ROSTER_STATUS.RETURNED].includes(roster.status))
    throw new Error('roster-not-submittable');
  if (entries.some((e) => !rosterDaysOk(e.days))) throw new Error('invalid-roster-entry');
  await updateDoc(rosterRef(departmentId, weekStart), {
    status: ROSTER_STATUS.SUBMITTED, submittedByUid: me.id,
    submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), returnNote: ''
  });
  await logAction('إرسال جدول مناوبات', `${weekStart} — ${roster.department}`);
}

export async function approveWeeklyRoster(departmentId, weekStart) {
  const me = getMe();
  if (me?.role !== 'admin') throw new Error('not-admin');
  const { roster, entries } = await fetchWeeklyRoster(departmentId, weekStart);
  if (!roster || roster.status !== ROSTER_STATUS.SUBMITTED) throw new Error('roster-not-approvable');
  const plans = shiftPlansOf();
  const snapshots = entries.map((e) => ({ ref: entryRef(departmentId, weekStart, e.employeeUid),
    approvedDays: snapshotRosterDays(e.days, plans) }));
  await runTransaction(db, async (tx) => {
    const parent = await tx.get(rosterRef(departmentId, weekStart));
    if (!parent.exists() || parent.data().status !== ROSTER_STATUS.SUBMITTED
        || parent.data().departmentId !== departmentId)
      throw new Error('roster-status-changed');
    snapshots.forEach((x) => tx.update(x.ref, {
      approvedDays: x.approvedDays, updatedAt: serverTimestamp()
    }));
    tx.update(rosterRef(departmentId, weekStart), {
      status: ROSTER_STATUS.APPROVED, reviewedByUid: me.id, reviewedByName: me.name,
      reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), returnNote: ''
    });
  });
  await loadApprovedWeeklyRosters();
  await logAction('اعتماد جدول مناوبات', `${weekStart} — ${roster.department}`);
}

export async function returnWeeklyRoster(departmentId, weekStart, note) {
  const me = getMe();
  if (me?.role !== 'admin') throw new Error('not-admin');
  const text = String(note || '').trim();
  if (!text || text.length > 300) throw new Error('invalid-return-note');
  const snap = await getDoc(rosterRef(departmentId, weekStart));
  if (!snap.exists() || ![ROSTER_STATUS.SUBMITTED, ROSTER_STATUS.APPROVED].includes(snap.data().status))
    throw new Error('roster-not-returnable');
  if (snap.data().status === ROSTER_STATUS.APPROVED && ymdKsa() >= weekStart)
    throw new Error('approved-week-started');
  await updateDoc(rosterRef(departmentId, weekStart), {
    status: ROSTER_STATUS.RETURNED, returnNote: text,
    reviewedByUid: me.id, reviewedByName: me.name, reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await loadApprovedWeeklyRosters();
  await logAction('إرجاع جدول مناوبات', `${weekStart} — ${text}`);
}
