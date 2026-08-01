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

/* ⚠️ تواريخ نسبية لا ثابتة. القواعد الجديدة تقارن التاريخ بـ request.time
   (استئذان لا يسبق اليوم بأكثر من ١٤ يوماً)، فتاريخ مكتوب بنصّه يجعل مجموعة
   الاختبارات تنجح اليوم وتفشل بعد شهر بلا أن يتغيّر شيء في القواعد. */
const dRel = (n) => ymdKsa(new Date(ksaNow().getTime() + n * 86400000));

const validRequest = (over = {}) => ({
  employeeUid: 'empU', employeeName: 'سالم', employeeEmpId: '101', department: 'المبيعات',
  type: 'permission', category: 'تأخير عن الدوام', categoryLabel: 'تأخير عن الدوام',
  date: dRel(0), time: '09:30', status: 'pending',
  reviewedBy: '', reviewedAt: null, rejectReason: '', createdAt: serverTimestamp(), ...over
});

/* إجازة سليمة: ٣ أيام على مدى ٣ أيام تقويمية */
const validLeave = (over = {}) => ({
  ...validRequest(),
  type: 'leave', category: 'annual', categoryLabel: 'إجازة سنوية',
  leaveTypeId: 'annual', deduct: true,
  days: 3, startDate: dRel(7), endDate: dRel(9), ...over
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

/* ═══ بيانات الاتصال الذاتية ═══
   الحقول الأربعة يملكها الموظف. الخطر ليس فيها بل فيما قد يتسلّل معها:
   `phone` هو هوية الدخول، وتعديله يعني اختطاف حساب أو قفل النفس خارجه. */
console.log('\n\x1b[1m═══ 2ب. بيانات الاتصال الذاتية ═══\x1b[0m');
const selfContact = (o) => updateDoc(doc(emp, 'users/empU'), o);

await check('employee edits own contact info',        true,  () => selfContact({
  personalEmail: 'a@b.com', address: 'جدة — حي الصفا', emergencyName: 'أخي', emergencyPhone: '0501234567' }));
await check('employee edits one contact field',       true,  () => selfContact({ address: 'الرياض' }));
await check('employee clears a contact field',        true,  () => selfContact({ address: '' }));

await check('employee rewrites own login phone',      false, () => selfContact({ phone: '0555555555' }));
await check('employee smuggles salary with address',  false, () => selfContact({ address: 'x', salary: 99999 }));
await check('employee smuggles role with email',      false, () => selfContact({ personalEmail: 'a@b.com', role: 'admin' }));
await check('employee sets own managerUid',           false, () => selfContact({ managerUid: 'adminU' }));
await check('employee edits ANOTHER employee contact',false, () => updateDoc(doc(emp, 'users/emp2U'), { address: 'x' }));
await check('suspended edits own contact',            false, () => updateDoc(doc(susp, 'users/suspU'), { address: 'x' }));

/* بلا سقف يصير الحقل تخزيناً مجانياً على حساب الشركة */
await check('address beyond 200 chars',               false, () => selfContact({ address: 'ط'.repeat(201) }));
await check('personalEmail beyond 120 chars',         false, () => selfContact({ personalEmail: 'z'.repeat(121) }));
await check('emergencyPhone beyond 20 chars',         false, () => selfContact({ emergencyPhone: '0'.repeat(21) }));
await check('emergencyName beyond 80 chars',          false, () => selfContact({ emergencyName: 'ن'.repeat(81) }));
await check('address sent as a non-string',           false, () => selfContact({ address: { a: 1 } }));

/* ═══ سجل المستندات ═══
   الخطر المحدّد: موظف يخفي انتهاء إقامته. الغرامة على الشركة لا عليه،
   فالحقل بيد الأدمن وحده مهما بدا أنه «بيانات الموظف نفسه». */
console.log('\n\x1b[1m═══ 2ج. سجل المستندات ═══\x1b[0m');
const aDoc = (o = {}) => ({ id: 'd1', kind: 'iqama', number: '2412345678',
  issuedOn: '2025-01-01', expiresOn: dRel(200), link: '', note: '', ...o });

await check('admin saves documents',                  true,  () => updateDoc(doc(admin, 'users/empU'), { documents: [aDoc()] }));
await check('admin saves 12 documents',               true,  () => updateDoc(doc(admin, 'users/empU'), {
  documents: Array.from({ length: 12 }, (_, i) => aDoc({ id: 'd' + i })) }));
await check('admin clears documents',                 true,  () => updateDoc(doc(admin, 'users/empU'), { documents: [] }));

await check('employee edits OWN documents',           false, () => updateDoc(doc(emp, 'users/empU'), { documents: [aDoc()] }));
await check('employee hides an expired iqama',        false, () => updateDoc(doc(emp, 'users/empU'), {
  documents: [aDoc({ expiresOn: dRel(365) })] }));
await check('employee edits another employee docs',   false, () => updateDoc(doc(emp, 'users/emp2U'), { documents: [aDoc()] }));
await check('manager edits dept employee documents',  false, () => updateDoc(doc(mgr, 'users/empU'), { documents: [aDoc()] }));
await check('13 documents exceeds the cap',           false, () => updateDoc(doc(admin, 'users/empU'), {
  documents: Array.from({ length: 13 }, (_, i) => aDoc({ id: 'd' + i })) }));
await check('documents sent as a non-list',           false, () => updateDoc(doc(admin, 'users/empU'), { documents: 'x' }));

console.log('\n\x1b[1m═══ 3. SUSPENDED EMPLOYEE (the fired-employee case) ═══\x1b[0m');
await check('suspended reads settings',               false, () => getDoc(doc(susp, 'settings/config')));
await check('suspended creates a request',            false, () => addDoc(collection(susp, 'requests'), { ...validRequest(), employeeUid: 'suspU', employeeName: 'معلّق', employeeEmpId: '104' }));
await check('suspended clocks in',                    false, () => setDoc(doc(susp, 'attendance/suspU_' + ymdKsa()), { ...attDoc(), employeeUid: 'suspU', employeeName: 'معلّق', employeeEmpId: '104' }));

console.log('\n\x1b[1m═══ 4. REQUEST FORGERY ═══\x1b[0m');
await check('request routed to another department',   false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), department: 'التسويق' }));
await check('request under a false name',             false, () => addDoc(collection(emp, 'requests'), { ...validRequest(), employeeName: 'المدير' }));
await check('leave with days:-999 (mints balance)',   false, () => addDoc(collection(emp, 'requests'), validLeave({ days: -999 })));
await check('leave with days as a string',            false, () => addDoc(collection(emp, 'requests'), validLeave({ days: '3' })));
await check('javascript: attachment link',            false, () => addDoc(collection(emp, 'requests'), validLeave({ attachmentLink: 'javascript:alert(document.cookie)' })));
await check('data: attachment link',                  false, () => addDoc(collection(emp, 'requests'), validLeave({ attachmentLink: 'data:text/html,<script>x</script>' })));

/* ═══ الثغرة الحرجة: days لا يطابق مدى التاريخ ═══
   الهجوم: سنة كاملة إجازة مدفوعة مقابل خصم يوم واحد من الرصيد.
   adjustBalance يخصم days، بينما computePayroll يدفع كل يوم بين
   startDate و endDate. */
await check('LEAVE: 1 day claimed over a full year',  false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ days: 1, startDate: dRel(1), endDate: dRel(365) })));
await check('LEAVE: 2 days claimed over 30',          false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ days: 2, startDate: dRel(1), endDate: dRel(30) })));
await check('LEAVE: endDate before startDate',        false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ days: 1, startDate: dRel(9), endDate: dRel(7) })));
await check('LEAVE: no startDate at all',             false, () => {
  const r = validLeave(); delete r.startDate;
  return addDoc(collection(emp, 'requests'), r);
});
await check('LEAVE: malformed date string',           false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ startDate: '10/08/2026', endDate: '12/08/2026' })));
await check('LEAVE: empty leaveTypeId',               false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ leaveTypeId: '' })));
await check('LEAVE: days exceeds 365',                false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ days: 400, startDate: dRel(1), endDate: dRel(500) })));
/* حدّا القيد بالضبط. لـ days=5 الأرضية هي days*2+7 = 17 يوم فرق بين
   التاريخين، أي ١٨ يوماً تقويمياً شاملة الطرفين. يوم واحد فوقها يُرفض. */
await check('LEAVE: 5 days, span 1 past the floor',   false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ days: 5, startDate: dRel(1), endDate: dRel(19) })));
await check('LEAVE: 6 days over a 3-day span',        false, () =>
  addDoc(collection(emp, 'requests'), validLeave({ days: 6, startDate: dRel(1), endDate: dRel(3) })));

/* ═══ الاستئذان بأثر رجعي — إعفاء من خصم راتب مضى ═══ */
await check('PERM: dated 60 days in the past',        false, () =>
  addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-60) })));
await check('PERM: forged category (fake exemption)', false, () =>
  addDoc(collection(emp, 'requests'), validRequest({ category: 'تأخير مختلق يعفيني' })));
await check('PERM: malformed date',                   false, () =>
  addDoc(collection(emp, 'requests'), validRequest({ date: '2026-8-5' })));
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

console.log('\n\x1b[1m═══ 5ب. صور إثبات الموقع ═══\x1b[0m');
/* JPEG صغير صالح — يكفي لاختبار القاعدة لا لعرضه */
const JPEG = 'data:image/jpeg;base64,' + '/9j/4AAQSkZJRgABAQAAAQABAAD'.repeat(3) + 'A=';
const photo = (over = {}) => ({
  employeeUid: 'empU', employeeName: 'سالم', department: 'المبيعات',
  date: ymdKsa(), sessionIdx: 0, kind: 'in', photo: JPEG,
  lat: 21.5, lng: 39.1, acc: 12, at: serverTimestamp(), ...over
});
const pid = (uid = 'empU', k = 'in') => `attendancePhotos/${uid}_${ymdKsa()}_0_${k}`;

await check('photo under another uid',               false, () => setDoc(doc(emp, `attendancePhotos/emp2U_${ymdKsa()}_0_in`), photo({ employeeUid: 'emp2U' })));
await check('photo doc id not matching own uid',     false, () => setDoc(doc(emp, `attendancePhotos/hacker_${ymdKsa()}_0_in`), photo()));
await check('photo for a PAST date',                 false, () => setDoc(doc(emp, 'attendancePhotos/empU_2026-01-05_0_in'), photo({ date: '2026-01-05' })));
await check('non-jpeg payload (svg/xss vector)',     false, () => setDoc(doc(emp, pid()), photo({ photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })));
await check('arbitrary string as photo',             false, () => setDoc(doc(emp, pid()), photo({ photo: 'javascript:alert(1)' })));
await check('oversized photo (free-tier abuse)',     false, () => setDoc(doc(emp, pid()), photo({ photo: 'data:image/jpeg;base64,' + 'A'.repeat(260000) })));
await check('extra field smuggled in',               false, () => setDoc(doc(emp, pid()), photo({ note: 'x' })));
await check('sessionIdx out of range',               false, () => setDoc(doc(emp, pid()), photo({ sessionIdx: 99 })));
await check('unknown kind',                          false, () => setDoc(doc(emp, pid()), photo({ kind: 'lunch' })));
await check('suspended uploads a photo',             false, () => setDoc(doc(susp, `attendancePhotos/suspU_${ymdKsa()}_0_in`), photo({ employeeUid: 'suspU', employeeName: 'معلّق' })));
await check('employee reads photos of others',       false, () => getDocs(collection(emp, 'attendancePhotos')));

/* ⚠️ ترتيب مقصود: الإنشاء المشروع أولاً، ثم محاولات العبث بنفس الوثيقة.
   لو سبقته محاولة كتابة ناجحة على نفس المعرّف لصار «الإنشاء المشروع» تعديلاً
   فيُرفض — وهو ما وقع في أول صياغة لهذه الاختبارات. */
await check('employee uploads check-in photo',       true,  () => setDoc(doc(emp, pid()), photo()));
/* السجل إضافة فقط: لا يستبدل الموظف صورة رفعها، فلا يبدّل صورة أمس بصورة اليوم */
await check('employee OVERWRITES own photo',         false, () => setDoc(doc(emp, pid()), photo({ acc: 99 })));
await check('employee EDITS an uploaded photo',      false, () => updateDoc(doc(emp, pid()), { acc: 1 }));
await check('employee DELETES own photo',            false, () => deleteDoc(doc(emp, pid())));
await check('employee uploads check-out photo',      true,  () => setDoc(doc(emp, pid('empU', 'out')), photo({ kind: 'out' })));
await check('admin reads all photos',                true,  () => getDocs(collection(admin, 'attendancePhotos')));
await check('manager reads own dept photos',         true,  () => getDocs(query(collection(mgr, 'attendancePhotos'), where('department', '==', 'المبيعات'))));
await check('admin purges an old photo',             true,  () => deleteDoc(doc(admin, pid())));

console.log('\n\x1b[1m═══ 5ج. المسير المعتمد والتصحيحات ═══\x1b[0m');
const run = (over = {}) => ({
  cycleKey: '2026-07', cycleLabel: 'دورة تجريبية',
  approvedBy: 'المدير', approvedByUid: 'adminU', approvedAt: serverTimestamp(),
  rows: [{ uid: 'empU', net: 5000 }], totals: { net: 5000 }, config: { hoursPerDay: 8 }, ...over
});
await check('employee approves a payroll run',       false, () => setDoc(doc(emp, 'payrollRuns/2026-07'), run({ approvedByUid: 'empU', approvedBy: 'سالم' })));
await check('manager approves a payroll run',        false, () => setDoc(doc(mgr, 'payrollRuns/2026-07'), run({ approvedByUid: 'mgrU', approvedBy: 'فهد' })));
await check('admin forges the approver name',        false, () => setDoc(doc(admin, 'payrollRuns/2026-07'), run({ approvedBy: 'شخص آخر' })));
await check('cycleKey not matching the doc id',      false, () => setDoc(doc(admin, 'payrollRuns/2026-09'), run()));
await check('admin approves a payroll run',          true,  () => setDoc(doc(admin, 'payrollRuns/2026-07'), run()));
/* ⚠️ جوهر الميزة: مسير مصروف لا يُعدَّل ولا يُحذف — ولا حتى من اعتمده */
await check('admin EDITS an approved run',           false, () => updateDoc(doc(admin, 'payrollRuns/2026-07'), { totals: { net: 1 } }));
await check('admin RE-approves over a run',          false, () => setDoc(doc(admin, 'payrollRuns/2026-07'), run({ totals: { net: 9 } })));
await check('admin DELETES an approved run',         false, () => deleteDoc(doc(admin, 'payrollRuns/2026-07')));
await check('employee reads the approved run',       true,  () => getDoc(doc(emp, 'payrollRuns/2026-07')));

const adj = (over = {}) => ({
  employeeUid: 'empU', employeeName: 'سالم', date: ymdKsa(), coll: 'zkAttendance',
  sessionIdx: 0, field: 'out', value: Timestamp.now(),
  reason: 'نسي بصمة الانصراف وأكّد مديره خروجه', byUid: 'adminU', byName: 'المدير',
  at: serverTimestamp(), ...over
});
await check('employee adjusts own attendance',       false, () => setDoc(doc(emp, 'attendanceAdjustments/a1'), adj({ byUid: 'empU', byName: 'سالم' })));
await check('manager adjusts attendance',            false, () => setDoc(doc(mgr, 'attendanceAdjustments/a2'), adj({ byUid: 'mgrU', byName: 'فهد' })));
await check('adjustment with NO reason',             false, () => setDoc(doc(admin, 'attendanceAdjustments/a3'), adj({ reason: '' })));
await check('adjustment with a 2-char reason',       false, () => setDoc(doc(admin, 'attendanceAdjustments/a4'), adj({ reason: 'اه' })));
await check('adjustment on an unknown field',        false, () => setDoc(doc(admin, 'attendanceAdjustments/a5'), adj({ field: 'salary' })));
await check('adjustment on an unknown collection',   false, () => setDoc(doc(admin, 'attendanceAdjustments/a6'), adj({ coll: 'users' })));
await check('adjustment with a string value',        false, () => setDoc(doc(admin, 'attendanceAdjustments/a7'), adj({ value: '16:00' })));
await check('admin records an adjustment',           true,  () => setDoc(doc(admin, 'attendanceAdjustments/a8'), adj()));
await check('admin EDITS an adjustment',             false, () => updateDoc(doc(admin, 'attendanceAdjustments/a8'), { reason: 'سبب آخر' }));
await check('admin DELETES an adjustment',           false, () => deleteDoc(doc(admin, 'attendanceAdjustments/a8')));

console.log('\n\x1b[1m═══ 5د. سلسلة الموافقات ═══\x1b[0m');
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  const base = {
    employeeUid: 'empU', employeeName: 'سالم', employeeEmpId: '101', department: 'المبيعات',
    type: 'leave', leaveTypeId: 'annual', deduct: true, days: 2,
    startDate: '2026-09-01', endDate: '2026-09-02', status: 'pending',
    reviewedBy: '', reviewedAt: null, rejectReason: '',
    chain: ['manager', 'admin'], step: 0, approvals: []
  };
  await setDoc(doc(d, 'requests/ch1'), base);                       /* الخطوة ٠ = مدير القسم */
  await setDoc(doc(d, 'requests/ch2'), { ...base, step: 1 });       /* الخطوة ١ = الأدمن     */
  await setDoc(doc(d, 'requests/ch3'), { ...base, employeeUid: 'mgrU', employeeName: 'فهد', employeeEmpId: '103' });
});
const sign = (by, step) => ({ byUid: by, byName: by === 'mgrU' ? 'فهد' : 'المدير', step, at: Timestamp.now() });

await check('CHAIN: admin skips the manager step',   false, () => updateDoc(doc(admin, 'requests/ch1'), { step: 1, approvals: [sign('adminU', 0)], status: 'pending', reviewedBy: 'المدير', reviewedAt: serverTimestamp() }));
await check('CHAIN: manager jumps two steps',        false, () => updateDoc(doc(mgr, 'requests/ch1'), { step: 2, approvals: [sign('mgrU', 0)], status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: manager approves outright',      false, () => updateDoc(doc(mgr, 'requests/ch1'), { status: 'approved', step: 1, approvals: [sign('mgrU', 0)], reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: manager rewrites the chain',     false, () => updateDoc(doc(mgr, 'requests/ch1'), { step: 1, chain: ['manager'], approvals: [sign('mgrU', 0)], status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: signature attributed to another',false, () => updateDoc(doc(mgr, 'requests/ch1'), { step: 1, approvals: [sign('adminU', 0)], status: 'pending', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: manager signs own request',      false, () => updateDoc(doc(mgr, 'requests/ch3'), { step: 1, approvals: [sign('mgrU', 0)], status: 'pending', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: manager acts on admin step',     false, () => updateDoc(doc(mgr, 'requests/ch2'), { step: 2, approvals: [sign('mgrU', 1)], status: 'approved', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: reject with no reason',          false, () => updateDoc(doc(mgr, 'requests/ch1'), { status: 'rejected', rejectReason: '', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: employee signs a step',          false, () => updateDoc(doc(emp, 'requests/ch1'), { step: 1, approvals: [sign('empU', 0)], status: 'pending', reviewedBy: 'سالم', reviewedAt: serverTimestamp() }));
await check('CHAIN: request pre-signed at creation', false, () => addDoc(collection(emp, 'requests'), validLeave({ chain: ['admin'], step: 1, approvals: [sign('empU', 0)] })));

await check('CHAIN: manager signs step 0',           true,  () => updateDoc(doc(mgr, 'requests/ch1'), { step: 1, approvals: [sign('mgrU', 0)], status: 'pending', reviewedBy: 'فهد', reviewedAt: serverTimestamp() }));
await check('CHAIN: admin signs the final step',     true,  () => updateDoc(doc(admin, 'requests/ch1'), { step: 2, approvals: [sign('mgrU', 0), sign('adminU', 1)], status: 'approved', reviewedBy: 'المدير', reviewedAt: serverTimestamp() }));
await check('CHAIN: admin rejects with a reason',    true,  () => updateDoc(doc(admin, 'requests/ch2'), { status: 'rejected', rejectReason: 'الرصيد غير كافٍ', reviewedBy: 'المدير', reviewedAt: serverTimestamp() }));
await check('CHAIN: employee submits with a chain',  true,  () => addDoc(collection(emp, 'requests'), validLeave({ chain: ['manager', 'admin'], step: 0, approvals: [] })));

console.log('\n\x1b[1m═══ 6. AUDIT LOG ═══\x1b[0m');
await check('employee writes auditLog at all',        false, () => addDoc(collection(emp, 'auditLog'), { action: 'a', detail: 'b', byName: 'سالم', byUid: 'empU', at: serverTimestamp() }));
await check('employee reads auditLog',                false, () => getDocs(collection(emp, 'auditLog')));
await check('admin forges byName',                    false, () => addDoc(collection(admin, 'auditLog'), { action: 'a', detail: 'b', byName: 'شخص آخر', byUid: 'adminU', at: serverTimestamp() }));
await check('admin edits an audit entry',             false, () => setDoc(doc(admin, 'auditLog/x'), { action: 'a' }));

console.log('\n\x1b[1m═══ 7. LEGITIMATE WRITES — these MUST all succeed ═══\x1b[0m');
await check('employee reads own profile',             true,  () => getDoc(doc(emp, 'users/empU')));
await check('employee reads settings',                true,  () => getDoc(doc(emp, 'settings/config')));
await check('employee submits a permission',          true,  () => addDoc(collection(emp, 'requests'), validRequest()));
await check('permission for an early-out',            true,  () => addDoc(collection(emp, 'requests'), validRequest({ category: 'خروج مبكر' })));
await check('permission filed 5 days late',           true,  () => addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-5) })));
await check('permission for next week',               true,  () => addDoc(collection(emp, 'requests'), validRequest({ date: dRel(7) })));
await check('employee submits a leave',               true,  () => addDoc(collection(emp, 'requests'), validLeave({ attachmentLink: 'https://drive.google.com/file/x' })));
/* أيام العمل أقلّ من المدى التقويمي — إجازة تمرّ على راحة أو عطلة رسمية.
   هذا هو السبب في أن القاعدة سقف لا مساواة. */
await check('leave: 5 workdays over a 7-day span',    true,  () => addDoc(collection(emp, 'requests'), validLeave({ days: 5, startDate: dRel(14), endDate: dRel(20) })));
await check('leave: single day',                      true,  () => addDoc(collection(emp, 'requests'), validLeave({ days: 1, startDate: dRel(3), endDate: dRel(3) })));
/* إجازة سنوية كاملة تمرّ على أربع عطل نهاية أسبوع وعيد — الحالة الأوسع واقعياً */
await check('leave: 21 workdays over 30 calendar',    true,  () => addDoc(collection(emp, 'requests'), validLeave({ days: 21, startDate: dRel(30), endDate: dRel(59) })));
await check('leave: 1 workday over a long weekend',   true,  () => addDoc(collection(emp, 'requests'), validLeave({ days: 1, startDate: dRel(3), endDate: dRel(6) })));
/* الحدّ الأقصى المسموح بالضبط — يثبت أن الأرضية لا تُضيّق على طلب مشروع */
await check('leave: 5 days at the exact floor',       true,  () => addDoc(collection(emp, 'requests'), validLeave({ days: 5, startDate: dRel(1), endDate: dRel(18) })));
await check('unpaid leave (deduct:false)',            true,  () => addDoc(collection(emp, 'requests'), validLeave({ deduct: false, leaveTypeId: 'unpaid', categoryLabel: 'إجازة بدون راتب' })));
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
