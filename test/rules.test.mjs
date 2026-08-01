import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs,
         query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import fs from 'fs';

const PROJECT = 'seen-hr2-test';
let pass = 0, fail = 0;
const failures = [];

/* التاريخ بتوقيت الرياض — نفس ما تحسبه القاعدة */
const ksaNow = () => new Date(Date.now() + 3 * 3600 * 1000);
const p2 = (n) => String(n).padStart(2, '0');
const ymdKsa = (d = ksaNow()) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
});

async function check(label, shouldPass, fn) {
  try {
    await (shouldPass ? assertSucceeds(fn()) : assertFails(fn()));
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${shouldPass ? 'ALLOWED ' : 'BLOCKED '} ${label}`);
  } catch (e) {
    fail++;
    failures.push(`${shouldPass ? 'WRONGLY BLOCKED' : 'WRONGLY ALLOWED'}: ${label}`);
    console.log(`  \x1b[31m✗\x1b[0m ${shouldPass ? 'WRONGLY BLOCKED' : 'WRONGLY ALLOWED'} ${label}`);
  }
}

/* ── seed ── */
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/adminU'), { name: 'المدير', role: 'admin', status: 'active', department: 'الموارد البشرية', empId: 'ADMIN' });
  await setDoc(doc(db, 'users/empU'),   { name: 'سالم', role: 'employee', status: 'active', department: 'المبيعات', empId: '101', salary: 6000, balances: { annual: 21 } });
  await setDoc(doc(db, 'users/emp2U'),  { name: 'خالد', role: 'employee', status: 'active', department: 'المبيعات', empId: '102', salary: 5000 });
  await setDoc(doc(db, 'users/mgrU'),   { name: 'فهد', role: 'manager', status: 'active', department: 'المبيعات', empId: '103' });
  await setDoc(doc(db, 'users/suspU'),  { name: 'معلّق', role: 'employee', status: 'suspended', department: 'المبيعات', empId: '104' });
  await setDoc(doc(db, 'settings/config'), { branches: [], leaveTypes: [], company: { lat: 21.5, lng: 39.1, radius: 500 } });
  await setDoc(doc(db, 'zkAttendance/empU_2026-07-01'), { employeeUid: 'empU', date: '2026-07-01', sessions: [] });
  await setDoc(doc(db, 'requests/permOfEmp'), {
    employeeUid: 'empU', employeeName: 'سالم', department: 'المبيعات', type: 'permission',
    status: 'pending', date: '2026-08-01', time: '09:00', reviewedBy: '', reviewedAt: null, rejectReason: ''
  });
  await setDoc(doc(db, 'requests/leaveOfEmp'), {
    employeeUid: 'empU', employeeName: 'سالم', department: 'المبيعات', type: 'leave',
    status: 'pending', days: 3, leaveTypeId: 'annual', deduct: true,
    startDate: '2026-08-10', endDate: '2026-08-12', reviewedBy: '', reviewedAt: null, rejectReason: ''
  });
});

const stranger = env.authenticatedContext('strangerU').firestore();  // signed up, NO users doc
const emp      = env.authenticatedContext('empU').firestore();
const emp2     = env.authenticatedContext('emp2U').firestore();
const mgr      = env.authenticatedContext('mgrU').firestore();
const admin    = env.authenticatedContext('adminU').firestore();
const susp     = env.authenticatedContext('suspU').firestore();
const anon     = env.unauthenticatedContext().firestore();

const validRequest = (over = {}) => ({
  employeeUid: 'empU', employeeName: 'سالم', employeeEmpId: '101', department: 'المبيعات',
  type: 'permission', category: 'تأخير عن الدوام', categoryLabel: 'تأخير عن الدوام',
  date: '2026-08-05', time: '09:30', status: 'pending',
  reviewedBy: '', reviewedAt: null, rejectReason: '', createdAt: serverTimestamp()
});

const session = (over = {}) => ({ in: Timestamp.now(), out: null, inLoc: { lat: 21.5, lng: 39.1 }, source: 'web', ...over });
const attDoc = (over = {}) => ({
  employeeUid: 'empU', employeeName: 'سالم', employeeEmpId: '101', department: 'المبيعات',
  date: ymdKsa(), dow: ksaNow().getUTCDay(), source: 'web', branchId: 'main', branchName: 'المقر',
  workMode: 'onsite', sessions: [session()], ...over
});

console.log('\n\x1b[1m═══ 1. ANONYMOUS AND STRANGER (signed up, no employee profile) ═══\x1b[0m');
await check('anon reads settings',                    false, () => getDoc(doc(anon, 'settings/config')));
await check('stranger reads settings',                false, () => getDoc(doc(stranger, 'settings/config')));
await check('stranger creates a request',             false, () => addDoc(collection(stranger, 'requests'), { ...validRequest(), employeeUid: 'strangerU' }));
await check('stranger creates attendance',            false, () => setDoc(doc(stranger, 'attendance/strangerU_' + ymdKsa()), { ...attDoc(), employeeUid: 'strangerU' }));
await check('stranger writes auditLog',               false, () => addDoc(collection(stranger, 'auditLog'), { action: 'x', detail: 'y', byName: 'z', byUid: 'strangerU', at: serverTimestamp() }));
await check('stranger reads a user doc',              false, () => getDoc(doc(stranger, 'users/empU')));

console.log('\n\x1b[1m═══ 2. PRIVILEGE ESCALATION ═══\x1b[0m');
await check('employee makes self admin',              false, () => updateDoc(doc(emp, 'users/empU'), { role: 'admin' }));
await check('employee raises own salary',             false, () => updateDoc(doc(emp, 'users/empU'), { salary: 99999 }));
await check('employee grants self leave balance',     false, () => updateDoc(doc(emp, 'users/empU'), { balances: { annual: 999 } }));
await check('employee grants self remote work mode',  false, () => updateDoc(doc(emp, 'users/empU'), { workMode: 'remote' }));
await check('employee un-suspends self',              false, () => updateDoc(doc(susp, 'users/suspU'), { status: 'active' }));
await check('employee reads another employee',        false, () => getDoc(doc(emp, 'users/emp2U')));
await check('employee deletes own doc',               false, () => deleteDoc(doc(emp, 'users/empU')));

console.log('\n\x1b[1m═══ 3. SUSPENDED EMPLOYEE (the fired-employee case) ═══\x1b[0m');
await check('suspended reads settings',               false, () => getDoc(doc(susp, 'settings/config')));
await check('suspended creates a request',            false, () => addDoc(collection(susp, 'requests'), { ...validRequest(), employeeUid: 'suspU', employeeName: 'معلّق', employeeEmpId: '104' }));
await check('suspended clocks in',                    false, () => setDoc(doc(susp, 'attendance/suspU_' + ymdKsa()), { ...attDoc(), employeeUid: 'suspU', employeeName: 'معلّق', employeeEmpId: '104' }));

console.log('\n\x1b[1m═══ 4. REQUEST FORGERY ═══\x1b[0m');
await check('request routed to another department',   false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), department: 'التسويق' }));
await check('request under a false name',             false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), employeeName: 'المدير' }));
await check('leave with days:-999 (mints balance)',   false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), type: 'leave', days: -999, startDate: '2026-08-10', endDate: '2026-08-12' }));
await check('leave with days as a string',            false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), type: 'leave', days: '3', startDate: '2026-08-10', endDate: '2026-08-12' }));
await check('javascript: attachment link',            false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), type: 'leave', days: 2, attachmentLink: 'javascript:alert(document.cookie)' }));
await check('data: attachment link',                  false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), type: 'leave', days: 2, attachmentLink: 'data:text/html,<script>x</script>' }));
await check('request pre-approved by its author',     false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), status: 'approved' }));
await check('employee approves own pending request',  false, () => updateDoc(doc(emp, 'requests/permOfEmp'), { status: 'approved', reviewedBy: 'سالم', reviewedAt: serverTimestamp(), rejectReason: '' }));
await check('employee approves a colleague request',  false, () => updateDoc(doc(emp2, 'requests/permOfEmp'), { status: 'approved', reviewedBy: 'خالد', reviewedAt: serverTimestamp(), rejectReason: '' }));
await check('manager approves LEAVE (balances)',      false, () => updateDoc(doc(mgr, 'requests/leaveOfEmp'), { status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp(), rejectReason: '' }));
await check('manager rewrites permission time',       false, () => updateDoc(doc(mgr, 'requests/permOfEmp'), { status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp(), rejectReason: '', time: '13:00' }));
await check('manager attributes decision to admin',   false, () => updateDoc(doc(mgr, 'requests/permOfEmp'), { status: 'approved', reviewedBy: 'المدير', reviewedAt: serverTimestamp(), rejectReason: '' }));
await check('manager approves a WITHDRAWN request',   false, async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'requests/withdrawnReq'), {
    employeeUid: 'emp2U', employeeName: 'خالد', department: 'المبيعات', type: 'permission',
    status: 'cancelled', date: '2026-08-01', time: '09:00', reviewedBy: '', reviewedAt: null, rejectReason: '' }));
  return updateDoc(doc(mgr, 'requests/withdrawnReq'), { status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp(), rejectReason: '' });
});
await check('manager re-opens a REJECTED request',    false, async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'requests/rejectedReq'), {
    employeeUid: 'emp2U', employeeName: 'خالد', department: 'المبيعات', type: 'permission',
    status: 'rejected', date: '2026-08-01', time: '09:00', reviewedBy: 'فهد', reviewedAt: null, rejectReason: 'لا' }));
  return updateDoc(doc(mgr, 'requests/rejectedReq'), { status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp(), rejectReason: '' });
});

console.log('\n\x1b[1m═══ 5. ATTENDANCE FRAUD ═══\x1b[0m');
await check('attendance for a PAST date',             false, () => setDoc(doc(emp, 'attendance/empU_2026-01-10'), { ...attDoc(), date: '2026-01-10' }));
await check('attendance for a FUTURE date',           false, () => setDoc(doc(emp, 'attendance/empU_2027-01-10'), { ...attDoc(), date: '2027-01-10' }));
await check('backdated check-in timestamp',           false, () => setDoc(doc(emp, 'attendance/empU_' + ymdKsa()), { ...attDoc(), sessions: [session({ in: Timestamp.fromMillis(Date.now() - 6 * 3600 * 1000) })] }));
await check('attendance under another uid',           false, () => setDoc(doc(emp, 'attendance/emp2U_' + ymdKsa()), { ...attDoc(), employeeUid: 'emp2U' }));
await check('doc id not matching the date field',     false, () => setDoc(doc(emp, 'attendance/empU_2026-08-09'), { ...attDoc() }));
await check('opening 2 sessions at once',             false, () => setDoc(doc(emp, 'attendance/empU_' + ymdKsa()), { ...attDoc(), sessions: [session(), session()] }));
await check('employee writes zkAttendance (payroll)', false, () => setDoc(doc(emp, 'zkAttendance/empU_' + ymdKsa()), { employeeUid: 'empU', date: ymdKsa(), sessions: [] }));
await check('admin writes zkAttendance',              false, () => setDoc(doc(admin, 'zkAttendance/x_' + ymdKsa()), { employeeUid: 'empU', date: ymdKsa(), sessions: [] }));
await check('employee writes bridge/status',          false, () => setDoc(doc(emp, 'bridge/status'), { deviceOk: true }));

console.log('\n\x1b[1m═══ 6. AUDIT LOG ═══\x1b[0m');
await check('employee writes auditLog at all',        false, () => addDoc(collection(emp, 'auditLog'), { action: 'a', detail: 'b', byName: 'سالم', byUid: 'empU', at: serverTimestamp() }));
await check('employee reads auditLog',                false, () => getDocs(collection(emp, 'auditLog')));
await check('admin forges byName',                    false, () => addDoc(collection(admin, 'auditLog'), { action: 'a', detail: 'b', byName: 'شخص آخر', byUid: 'adminU', at: serverTimestamp() }));
await check('admin edits an audit entry',             false, () => setDoc(doc(admin, 'auditLog/x'), { action: 'a' }));

console.log('\n\x1b[1m═══ 7. LEGITIMATE WRITES — these MUST all succeed ═══\x1b[0m');
await check('employee reads own profile',             true,  () => getDoc(doc(emp, 'users/empU')));
await check('employee reads settings',                true,  () => getDoc(doc(emp, 'settings/config')));
await check('employee submits a permission',          true,  () => addDoc(collection(emp, 'requests'), validRequest()));
await check('employee submits a leave',               true,  () => addDoc(collection(emp, 'requests'), { ...validRequest(), type: 'leave', days: 3, startDate: '2026-08-10', endDate: '2026-08-12', attachmentLink: 'https://drive.google.com/file/x' }));
await check('employee cancels own pending request',   true,  () => updateDoc(doc(emp, 'requests/permOfEmp'), { status: 'cancelled', reviewedAt: serverTimestamp() }));
await check('employee clears mustChangePassword',     true,  () => updateDoc(doc(emp, 'users/empU'), { mustChangePassword: false }));
await check('employee saves bioCredentials',          true,  () => updateDoc(doc(emp, 'users/empU'), { bioCredentials: [{ id: 'abc', rpId: 'amf430.github.io', transports: ['internal'] }] }));
await check('employee CHECK-IN',                      true,  () => setDoc(doc(emp, 'attendance/empU_' + ymdKsa()), attDoc(), { merge: true }));
await check('manager reads own dept requests',        true,  () => getDocs(query(collection(mgr, 'requests'), where('department', '==', 'المبيعات'))));
await check('manager approves a dept permission',     true,  () => updateDoc(doc(mgr, 'requests/permOfEmp2'), { status: 'approved' }).catch(async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'requests/permOfEmp2'), {
    employeeUid: 'emp2U', employeeName: 'خالد', department: 'المبيعات', type: 'permission',
    status: 'pending', date: '2026-08-01', time: '09:00', reviewedBy: '', reviewedAt: null, rejectReason: '' }));
  return updateDoc(doc(mgr, 'requests/permOfEmp2'), { status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp(), rejectReason: '' });
}));
await check('manager writes auditLog',                true,  () => addDoc(collection(mgr, 'auditLog'), { action: 'موافقة على طلب', detail: 'استئذان — خالد', byName: 'فهد', byUid: 'mgrU', at: serverTimestamp() }));
await check('admin reads all users',                  true,  () => getDocs(collection(admin, 'users')));
await check('admin creates an employee',              true,  () => setDoc(doc(admin, 'users/newU'), { name: 'جديد', role: 'employee', status: 'active', department: 'المبيعات', empId: '105' }));
await check('admin edits salary and geofence',        true,  () => updateDoc(doc(admin, 'users/empU'), { salary: 7000, workMode: 'remote', geoRadius: 300, branchIds: ['br_1'] }));
await check('admin suspends an employee',             true,  () => updateDoc(doc(admin, 'users/emp2U'), { status: 'suspended' }));
await check('admin deducts a leave balance',          true,  () => updateDoc(doc(admin, 'users/empU'), { balances: { annual: 18 } }));
await check('admin saves settings (branches)',        true,  () => setDoc(doc(admin, 'settings/config'), { branches: [{ id: 'br_1', name: 'فرع الروضة', lat: 21.5, lng: 39.1, radius: 500, active: true }], company: { lat: 21.5, lng: 39.1, radius: 500 } }, { merge: true }));
await check('admin approves a leave',                 true,  () => updateDoc(doc(admin, 'requests/leaveOfEmp'), { status: 'approved', reviewedBy: 'المدير', reviewedAt: serverTimestamp(), rejectReason: '' }));
await check('admin writes auditLog',                  true,  () => addDoc(collection(admin, 'auditLog'), { action: 'إضافة موظف', detail: 'جديد', byName: 'المدير', byUid: 'adminU', at: serverTimestamp() }));
await check('admin reads auditLog',                   true,  () => getDocs(collection(admin, 'auditLog')));
await check('admin reads zkAttendance',               true,  () => getDocs(collection(admin, 'zkAttendance')));
await check('admin deletes a request',                true,  () => deleteDoc(doc(admin, 'requests/permOfEmp')));

console.log('\n\x1b[1m═══ 8. MULTI-SESSION CHECK-OUT / CHECK-IN ═══\x1b[0m');
/* يحاكي doAttendance حرفياً: يقرأ الوثيقة من السيرفر أولاً ثم يبني عليها.
   الاختبار الأول كان يعدّل الجلسة السابقة أثناء الإضافة، وهذا ما رفضته
   القاعدة بحق — العميل الحقيقي لا يفعل ذلك. */
const attRef = () => doc(emp, 'attendance/empU_' + ymdKsa());
const readSessions = async () => {
  const s = await getDoc(attRef());
  return s.exists() ? (s.data().sessions || []).map((x) => ({ ...x })) : [];
};

let s1;
await env.withSecurityRulesDisabled(async (c) => {
  s1 = { in: Timestamp.fromMillis(Date.now() - 60000), out: null, source: 'web' };
  await setDoc(doc(c.firestore(), 'attendance/empU_' + ymdKsa()), { ...attDoc(), sessions: [s1] });
});

await check('employee CHECK-OUT (closes session)', true, async () => {
  const pre = await readSessions();
  pre[pre.length - 1] = { ...pre[pre.length - 1], out: Timestamp.now() };
  return setDoc(attRef(), { sessions: pre }, { merge: true });
});

await check('rewrites an already-closed session', false, async () => {
  const pre = await readSessions();
  pre[0] = { ...pre[0], in: Timestamp.fromMillis(Date.now() - 9 * 3600 * 1000) };
  return setDoc(attRef(), { sessions: pre }, { merge: true });
});

await check('second CHECK-IN (appends session)', true, async () => {
  const pre = await readSessions();                    /* ← ما نلمس الجلسات السابقة */
  return setDoc(attRef(), { sessions: pre.concat([session()]) }, { merge: true });
});

await check('third CHECK-IN while one is still open', false, async () => {
  const pre = await readSessions();
  return setDoc(attRef(), { sessions: pre.concat([session()]) }, { merge: true });
});

await check('drops a session to hide hours', false, async () => {
  const pre = await readSessions();
  return setDoc(attRef(), { sessions: [pre[pre.length - 1]] }, { merge: true });
});

await check('exceeds 12 sessions in a day', false, async () => {
  const pre = await readSessions();
  return setDoc(attRef(), { sessions: pre.concat(Array.from({ length: 12 }, () => session())) }, { merge: true });
});

console.log(`\n\x1b[1m═══ RESULT: ${pass} passed, ${fail} failed ═══\x1b[0m`);
if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  • ' + f)); }
await env.cleanup();
process.exit(fail ? 1 : 0);
