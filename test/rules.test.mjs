import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs,
         query, where, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';
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
  await setDoc(doc(db, 'users/empU'),   { name: 'سالم', role: 'employee', status: 'active', department: 'المبيعات', empId: '101', salary: 6000, balances: { annual: 21 }, previousUids: ['oldEmpU'] });
  await setDoc(doc(db, 'users/emp2U'),  { name: 'خالد', role: 'employee', status: 'active', department: 'المبيعات', empId: '102', salary: 5000 });
  await setDoc(doc(db, 'users/mgrU'),   { name: 'فهد', role: 'manager', status: 'active', department: 'المبيعات', empId: '103' });
  await setDoc(doc(db, 'users/suspU'),  { name: 'معلّق', role: 'employee', status: 'suspended', department: 'المبيعات', empId: '104' });
  await setDoc(doc(db, 'settings/config'), { branches: [], leaveTypes: [], company: { lat: 21.5, lng: 39.1, radius: 500 } });
  await setDoc(doc(db, 'zkAttendance/empU_2026-07-01'), { employeeUid: 'empU', date: '2026-07-01', sessions: [] });
  /* ── history left under a previous uid, after an access restore ──
     empU carries oldEmpU in previousUids; emp2U carries nothing. Both try to
     read the same record — only the one who owns that past identity may. */
  await setDoc(doc(db, 'zkAttendance/oldEmpU_2026-06-01'),
    { employeeUid: 'oldEmpU', employeeEmpId: '101', employeeName: 'سالم', date: '2026-06-01', sessions: [] });
  await setDoc(doc(db, 'attendance/oldEmpU_2026-06-01'),
    { employeeUid: 'oldEmpU', employeeEmpId: '101', employeeName: 'سالم', date: '2026-06-01', sessions: [] });
  /* تذكرة موارد بشرية يملكها empU، ورسالة واحدة تحتها */
  await setDoc(doc(db, 'hrTickets/tkt1'), {
    employeeUid: 'empU', employeeName: 'سالم', employeeEmpId: '101', department: 'المبيعات',
    categoryId: 'c1', categoryLabel: 'التأمين الصحي', subject: 'بطاقة التأمين',
    status: 'open', lastBy: 'employee', lastText: 'متى تصل؟'
  });
  await setDoc(doc(db, 'hrTickets/tkt1/messages/m1'), {
    byUid: 'empU', byName: 'سالم', byRole: 'employee', text: 'متى تصل بطاقة التأمين؟'
  });
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

/* ═══ خطط الشفتات (المرحلة ٢) ═══
   ⚠️ shiftPlanId يحدّد وقت بداية دوام الموظف، وعليه يُحسب تأخيره ويُخصم
   راتبه. موظف يقدر يكتبه على نفسه يمنح نفسه شفتاً مسائياً صباحَ كل يوم
   يتأخر فيه، فيمحو التأخير قبل أن يراه أحد. الحارس الحقيقي هو أن الحقل
   خارج قائمة only([...]) في match /users — وهذه الاختبارات تحرس القائمة
   من أن يوسّعها أحد لاحقاً بلا انتباه. */
await check('employee grants self a shift plan',      false, () => selfContact({ shiftPlanId: 'plan_pm' }));
await check('employee smuggles shiftPlanId w/ address', false, () => selfContact({ address: 'x', shiftPlanId: 'plan_pm' }));
await check('employee clears own shiftPlanId',        false, () => selfContact({ shiftPlanId: '' }));
await check('manager sets a plan on own dept member', false, () => updateDoc(doc(mgr, 'users/empU'), { shiftPlanId: 'plan_pm' }));
await check('admin assigns a shift plan',             true,  () => updateDoc(doc(admin, 'users/empU'), { shiftPlanId: 'plan_pm' }));
await check('admin clears a shift plan',              true,  () => updateDoc(doc(admin, 'users/empU'), { shiftPlanId: '' }));

/* الخطط نفسها تعيش في settings/config — أدمن فقط، والقاعدة قائمة */
await check('employee writes shiftPlans in settings', false,
  () => updateDoc(doc(emp, 'settings/config'), { shiftPlans: [{ id: 'x', name: 'y' }] }));
await check('manager writes shiftPlans in settings',  false,
  () => updateDoc(doc(mgr, 'settings/config'), { shiftPlans: [{ id: 'x', name: 'y' }] }));
await check('admin writes shiftPlans in settings',    true,
  () => updateDoc(doc(admin, 'settings/config'), {
    shiftPlans: [{ id: 'plan_pm', name: 'المسائي', days: {}, active: true }],
    defaultShiftPlanId: 'plan_pm' }));

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

/* ═══ الاستئذان بأثر رجعي — إعفاء من خصم راتب مضى ═══
   النافذة ثلاثة أيام: يومه وثلاثة قبله. الرابع مرفوض — وهو حدّ القرار
   بالضبط، فاختباره يمسك أي انزلاق بيوم في حساب النافذة. */
await check('PERM: dated 60 days in the past',        false, () =>
  addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-60) })));
await check('PERM: dated 4 days back (past window)',  false, () =>
  addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-4) })));
await check('PERM: dated 5 days back',                false, () =>
  addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-5) })));
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

/* وسوم المرحلة ١ تُختبر في آخر الملف — إنشاؤها للوثيقة هنا كان يُفسد
   اختبار «employee CHECK-IN» أدناه الذي يتوقّع الوثيقة غير موجودة. */
/* ═══ تاريخ تحت معرّف سابق — بعد استعادة الوصول ═══
   استعادة الوصول تُنشئ حساباً بمعرّف جديد، وسجلات الحضور مفهرسة بالمعرّف.
   فبلا هذه القراءة يفقد الموظف تاريخه، ويعتبره المسير غياباً ويخصم عليه.
   والخطر المقابل أن يقرأ موظفٌ تاريخ غيره — فالقراءة مربوطة بـ previousUids
   على ملف القارئ نفسه، وهو حقل لا يكتبه إلا الأدمن. */
/* ═══ لوحة المنتظمين — تُقرأ للجميع وتُكتب للأدمن ═══
   الوثيقة الوحيدة التي يقرأها كل الموظفين عن زملائهم. وهي مقصودة: لوحة
   تحفيز. والبديل كان فتح سجلات الحضور للجميع ليحسبها كل متصفح — ثمن باهظ
   لا يُدفع للوحة. فتبقى السجلات مقفلة كما هي، ولا يُنشر إلا ما يُعرض. */
/* ═══ طلبات الموارد البشرية ═══
   قناة خاصة بين الموظف والموارد البشرية. مدير القسم خارجها عمداً: المالك
   طلبها خاصة، والأمثلة التي ذكرها (تأمين صحي، راتب) لا يكتبها الموظف لو
   كان مديره المباشر يقرأ.

   والمحادثة نفسها «إنشاء فقط»: رسالة قيلت لا تُعدَّل ولا تُمحى، ولا حتى
   من الأدمن — وإلا لم تكن سجلاً لشيء. */
const newTicket = (over = {}) => ({
  employeeUid: 'empU', employeeName: 'سالم', employeeEmpId: '101', department: 'المبيعات',
  categoryId: 'c1', categoryLabel: 'التأمين الصحي', subject: 'سؤال',
  status: 'open', lastBy: 'employee', lastText: 'نص',
  createdAt: serverTimestamp(), lastAt: serverTimestamp(), ...over
});
const newMsg = (over = {}) => ({
  byUid: 'empU', byName: 'سالم', byRole: 'employee', text: 'نص الرسالة',
  at: serverTimestamp(), ...over
});

console.log('\n\x1b[1m═══ 5ج. طلبات الموارد البشرية ═══\x1b[0m');
await check('employee raises a ticket',               true,  () => addDoc(collection(emp, 'hrTickets'), newTicket()));
await check('employee reads own ticket',              true,  () => getDoc(doc(emp, 'hrTickets/tkt1')));
await check('admin reads any ticket',                 true,  () => getDoc(doc(admin, 'hrTickets/tkt1')));
await check('employee reads own thread',              true,  () => getDocs(collection(emp, 'hrTickets/tkt1/messages')));
await check('employee replies on own ticket',         true,  () => addDoc(collection(emp, 'hrTickets/tkt1/messages'), newMsg()));
await check('admin replies as hr',                    true,  () => addDoc(collection(admin, 'hrTickets/tkt1/messages'), newMsg({ byUid: 'adminU', byName: 'المدير', byRole: 'hr' })));
await check('admin closes a ticket',                  true,  () => updateDoc(doc(admin, 'hrTickets/tkt1'), { status: 'closed', closedAt: serverTimestamp() }));

/* ⚠️ الخصوصية هي الميزة — لو قرأها المدير أو موظف آخر سقط معناها كله */
await check('MANAGER reads an employee ticket',       false, () => getDoc(doc(mgr, 'hrTickets/tkt1')));
await check('MANAGER reads the thread',               false, () => getDocs(collection(mgr, 'hrTickets/tkt1/messages')));
await check('another employee reads the ticket',      false, () => getDoc(doc(emp2, 'hrTickets/tkt1')));
await check('another employee reads the thread',      false, () => getDocs(collection(emp2, 'hrTickets/tkt1/messages')));
await check('another employee posts into the thread', false, () => addDoc(collection(emp2, 'hrTickets/tkt1/messages'), newMsg({ byUid: 'emp2U', byName: 'خالد' })));
await check('stranger reads the ticket',              false, () => getDoc(doc(stranger, 'hrTickets/tkt1')));

/* ⚠️ لا تُزوَّر هوية ولا دور */
await check('ticket raised for someone else',         false, () => addDoc(collection(emp, 'hrTickets'), newTicket({ employeeUid: 'emp2U' })));
await check('ticket raised with a false name',        false, () => addDoc(collection(emp, 'hrTickets'), newTicket({ employeeName: 'المدير' })));
await check('ticket raised into another department',  false, () => addDoc(collection(emp, 'hrTickets'), newTicket({ department: 'المالية' })));
await check('employee posts a message AS hr',         false, () => addDoc(collection(emp, 'hrTickets/tkt1/messages'), newMsg({ byRole: 'hr' })));
await check('employee posts under another name',      false, () => addDoc(collection(emp, 'hrTickets/tkt1/messages'), newMsg({ byName: 'المدير' })));

/* ⚠️ الإغلاق للموارد البشرية، والعنوان لا يُعاد كتابته بعد الردّ */
await check('employee closes own ticket',             false, () => updateDoc(doc(emp, 'hrTickets/tkt1'), { status: 'closed' }));
await check('employee retitles the ticket',           false, () => updateDoc(doc(emp, 'hrTickets/tkt1'), { subject: 'شيء آخر' }));
await check('employee edits a sent message',          false, () => updateDoc(doc(emp, 'hrTickets/tkt1/messages/m1'), { text: 'غيّرت كلامي' }));
await check('ADMIN edits a sent message',             false, () => updateDoc(doc(admin, 'hrTickets/tkt1/messages/m1'), { text: 'غيّرت كلامي' }));
await check('admin deletes a sent message',           false, () => deleteDoc(doc(admin, 'hrTickets/tkt1/messages/m1')));
await check('employee deletes own ticket',            false, () => deleteDoc(doc(emp, 'hrTickets/tkt1')));

console.log('\n\x1b[1m═══ 5أ. لوحة المنتظمين ═══\x1b[0m');
await check('employee reads the board',               true,  () => getDoc(doc(emp, 'leaderboard/weekly')));
await check('manager reads the board',                true,  () => getDoc(doc(mgr, 'leaderboard/weekly')));
await check('admin publishes the board',              true,  () => setDoc(doc(admin, 'leaderboard/weekly'), { top: [], at: serverTimestamp() }));
await check('employee publishes the board',           false, () => setDoc(doc(emp, 'leaderboard/weekly'), { top: [{ name: 'أنا', rate: 100 }] }));
await check('manager publishes the board',            false, () => setDoc(doc(mgr, 'leaderboard/weekly'), { top: [] }));
await check('suspended employee reads the board',     false, () => getDoc(doc(susp, 'leaderboard/weekly')));
await check('stranger reads the board',               false, () => getDoc(doc(stranger, 'leaderboard/weekly')));
await check('anon reads the board',                   false, () => getDoc(doc(anon, 'leaderboard/weekly')));

console.log('\n\x1b[1m═══ 5ب. المعرّفات السابقة ═══\x1b[0m');
await check('employee reads own zk history under a previous uid', true,
  () => getDoc(doc(emp, 'zkAttendance/oldEmpU_2026-06-01')));
await check('employee reads own web history under a previous uid', true,
  () => getDoc(doc(emp, 'attendance/oldEmpU_2026-06-01')));
await check("another employee reads that same past record", false,
  () => getDoc(doc(emp2, 'zkAttendance/oldEmpU_2026-06-01')));
await check('stranger reads a past record',           false,
  () => getDoc(doc(stranger, 'zkAttendance/oldEmpU_2026-06-01')));
/* الحقل نفسه هو الحارس — فلو كتبه الموظف لمنح نفسه تاريخ غيره */
await check('employee grants self a previous uid',    false,
  () => updateDoc(doc(emp2, 'users/emp2U'), { previousUids: ['oldEmpU'] }));
await check('admin sets previousUids',                true,
  () => updateDoc(doc(admin, 'users/emp2U'), { previousUids: [] }));
/* ولا يفتح هذا بابَ الكتابة على سجل الجهاز إطلاقاً */
await check('employee writes a past-uid zk record',   false,
  () => setDoc(doc(emp, 'zkAttendance/oldEmpU_2026-06-02'), { employeeUid: 'oldEmpU', date: '2026-06-02', sessions: [] }));

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
/* حافّة النافذة من الداخل — آخر يوم مقبول. لو ضاقت النافذة يوماً سقط هذا. */
await check('permission filed 3 days late (edge)',    true,  () => addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-3) })));
await check('permission filed 1 day late',            true,  () => addDoc(collection(emp, 'requests'), validRequest({ date: dRel(-1) })));
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

/* ═══ 9. وسوم الحضور المتأخر ودوام يوم الراحة (المرحلة ١) ═══

   ⚠️ القفل حسب نافذة الوردية يعيش في الواجهة وحدها. القاعدة لا تقدر تتحقق
   منه بتكلفة معقولة: كل تحقق يحتاج get() على settings و users في كل كتابة
   حضور، وهي قراءة مفوترة على حساب المالك في كل بصمة لكل موظف كل يوم.

   فما تحرسه القاعدة هو السقف المطلق الرخيص (اليوم أو أمس + fresh)، والقفل
   الدقيق تعويضه **رصدٌ لا منع**: السجل خارج النافذة يحمل lateCheckIn ويظهر
   مُعلَّماً لمديره. هذه الاختبارات تُثبت أمرين: أن القاعدة تقبل الوسم، وأن
   الوسم **ليس تصريح مرور** يفتح ما كان مقفلاً.

   ⚠️ في آخر الملف عمداً: هذه الاختبارات تكتب على attendance/empU_اليوم،
   وإنشاؤها مبكراً كان يُفسد اختبار «employee CHECK-IN» الذي يتوقّع الوثيقة
   غير موجودة. الحالة المشتركة بين الاختبارات تُدار بالترتيب هنا لا بالحظ. */
console.log('\n\x1b[1m═══ 9. LATE CHECK-IN TAGS ═══\x1b[0m');

/* نبدأ من صفحة نظيفة حتى لا نرث جلسات القسم الثامن */
await env.withSecurityRulesDisabled(async (c) =>
  deleteDoc(doc(c.firestore(), 'attendance/empU_' + ymdKsa())));

await check('late check-in tag accepted',              true,
  () => setDoc(doc(emp, 'attendance/empU_' + ymdKsa()), { ...attDoc(), lateCheckIn: true }));
await check('off-day work tag on the session',         true, async () => {
  await env.withSecurityRulesDisabled(async (c) =>
    deleteDoc(doc(c.firestore(), 'attendance/empU_' + ymdKsa())));
  return setDoc(doc(emp, 'attendance/empU_' + ymdKsa()),
    { ...attDoc(), sessions: [session({ offDayWork: true })] });
});

/* الوسم لا يفتح ما أقفلته القاعدة */
await check('late tag does NOT unlock a past date',    false,
  () => setDoc(doc(emp, 'attendance/empU_2026-01-10'), { ...attDoc(), date: '2026-01-10', lateCheckIn: true }));
await check('late tag does NOT unlock a backdated in', false, async () => {
  await env.withSecurityRulesDisabled(async (c) =>
    deleteDoc(doc(c.firestore(), 'attendance/empU_' + ymdKsa())));
  return setDoc(doc(emp, 'attendance/empU_' + ymdKsa()),
    { ...attDoc(), lateCheckIn: true, sessions: [session({ in: Timestamp.fromMillis(Date.now() - 6 * 3600 * 1000) })] });
});
await check('late tag does NOT unlock another uid',    false,
  () => setDoc(doc(emp, 'attendance/emp2U_' + ymdKsa()), { ...attDoc(), employeeUid: 'emp2U', lateCheckIn: true }));

/* ═══ 10. مدير القسم ينشئ موظفاً في قسمه (المرحلة ٣) ═══

   الطلب: «مدير القسم يقدر يشوف الموظفين ويضيف موظفين تابعين لقسمه فقط، ما
   يقدر يشوف بيانات باقي الموظفين ولا أي حد برا قسمه».

   ⚠️ القراءة خارج القسم كانت محروسة أصلاً بـ sameDept()، والجديد هنا هو
   الإنشاء. وكل اختبار أدناه يقابل تصعيداً محدّداً لا افتراضاً:
     • قسم آخر     → يكسب قراءة على موظف لم يُعطَ له
     • دور manager → يصنع مديراً ثانياً فينتهي فحص الأدوار
     • salary      → القراءة مسموحة بقرار المالك، أما الكتابة فهي المسير
     • createdBy   → حساب بلا كاتب معروف لا يمكن التحقيق فيه لاحقاً

   ⚠️ ولاحظ: قراءة الراتب **مسموحة** لمدير القسم بقرار المالك (٢٠٢٦-٠٨-١٢)،
   وهناك اختبار صريح أدناه يُثبتها حتى لا يظنّ أحد لاحقاً أنها ثغرة فيسدّها
   ويكسر سلوكاً مقصوداً. */
console.log('\n\x1b[1m═══ 10. MANAGER CREATES AN EMPLOYEE ═══\x1b[0m');

const newEmp = (over = {}) => ({
  name: 'موظف جديد', department: 'المبيعات', role: 'employee',
  status: 'active', createdBy: 'mgrU', phone: '0501112233', ...over
});

await check('manager creates in OWN dept',            true,
  () => setDoc(doc(mgr, 'users/newHire1'), newEmp()));
await check('manager creates in ANOTHER dept',        false,
  () => setDoc(doc(mgr, 'users/newHire2'), newEmp({ department: 'المالية' })));
await check('manager creates with NO department',     false,
  () => setDoc(doc(mgr, 'users/newHire3'), newEmp({ department: '' })));
await check('manager mints a second manager',         false,
  () => setDoc(doc(mgr, 'users/newHire4'), newEmp({ role: 'manager' })));
await check('manager mints an admin',                 false,
  () => setDoc(doc(mgr, 'users/newHire5'), newEmp({ role: 'admin' })));
await check('manager sets a salary on creation',      false,
  () => setDoc(doc(mgr, 'users/newHire6'), newEmp({ salary: 9000 })));
/* ⚠️ صفر ليس «بلا راتب» — الحقل موجود، والقاعدة تشترط غيابه */
await check('manager sends salary: 0',                false,
  () => setDoc(doc(mgr, 'users/newHire7'), newEmp({ salary: 0 })));
await check('manager creates a pre-suspended acct',   false,
  () => setDoc(doc(mgr, 'users/newHire8'), newEmp({ status: 'suspended' })));
await check('manager forges createdBy',               false,
  () => setDoc(doc(mgr, 'users/newHire9'), newEmp({ createdBy: 'adminU' })));
await check('manager omits createdBy',                false,
  () => setDoc(doc(mgr, 'users/newHire10'), (() => { const o = newEmp(); delete o.createdBy; return o; })()));
await check('plain employee creates an employee',     false,
  () => setDoc(doc(emp, 'users/newHire11'), newEmp({ createdBy: 'empU' })));
await check('suspended manager creates',              false,
  () => setDoc(doc(susp, 'users/newHire12'), newEmp({ createdBy: 'suspU' })));

/* الكتابة على موظف قائم تبقى ممنوعة على المدير — الإنشاء وحده فُتح */
await check('manager edits a salary in own dept',     false,
  () => updateDoc(doc(mgr, 'users/empU'), { salary: 1 }));
await check('manager promotes own dept member',       false,
  () => updateDoc(doc(mgr, 'users/empU'), { role: 'manager' }));
await check('manager suspends own dept member',       false,
  () => updateDoc(doc(mgr, 'users/empU'), { status: 'suspended' }));

/* القراءة: داخل القسم مسموحة بكاملها، وخارجه ممنوعة */
await check('manager reads own dept member (salary included — owner decision)', true,
  () => getDoc(doc(mgr, 'users/empU')));
await check('manager reads someone OUTSIDE own dept', false,
  () => getDoc(doc(mgr, 'users/adminU')));

/* ═══ 11. استعلام أداء القسم (المرحلة ٤) ═══

   ⚠️ هذه أهم اختبارات المرحلة، وهي تختبر شيئاً لا يُرى في الواجهة إطلاقاً:
   Firestore يرفض الاستعلام **كاملاً** ما لم يكن مقيَّداً بحيث تُحقّق كل نتيجة
   محتملة شرط القاعدة. فاستعلام المدير بالتاريخ وحده لا يُرجع نتيجة منقوصة —
   يُرجع خطأ صلاحيات وشاشة فارغة.

   والفرق بين السطرين الأولين أدناه هو المرحلة ٤ كلها: نفس المدير، ونفس
   البيانات، ونفس القاعدة — والفارق `where('department','==',…)` وحده. */
console.log('\n\x1b[1m═══ 11. TEAM PERFORMANCE QUERY ═══\x1b[0m');

await check('manager queries attendance by date ONLY',        false,
  () => getDocs(query(collection(mgr, 'attendance'), where('date', '>=', '2026-01-01'))));
await check('manager queries attendance WITH department',     true,
  () => getDocs(query(collection(mgr, 'attendance'),
    where('department', '==', 'المبيعات'), where('date', '>=', '2026-01-01'))));

await check('manager queries zkAttendance by date ONLY',      false,
  () => getDocs(query(collection(mgr, 'zkAttendance'), where('date', '>=', '2026-01-01'))));
await check('manager queries zkAttendance WITH department',   true,
  () => getDocs(query(collection(mgr, 'zkAttendance'),
    where('department', '==', 'المبيعات'), where('date', '>=', '2026-01-01'))));

/* ⚠️ التقييد بقسم غيره لا يُنجّيه — sameDept() تقارن بقسمه هو لا بما كتبه */
await check('manager queries ANOTHER department',             false,
  () => getDocs(query(collection(mgr, 'zkAttendance'),
    where('department', '==', 'المالية'), where('date', '>=', '2026-01-01'))));

/* الموظف العادي لا يُفتح له هذا الطريق مهما قيّد */
await check('employee queries dept attendance',               false,
  () => getDocs(query(collection(emp, 'zkAttendance'), where('department', '==', 'المبيعات'))));
await check('suspended manager queries own dept',             false,
  () => getDocs(query(collection(susp, 'zkAttendance'), where('department', '==', 'المبيعات'))));

/* الأدمن يقرأ بلا تقييد — وهو ما يجعل حساب التغطية ممكناً أصلاً */
await check('admin queries zkAttendance unconstrained',       true,
  () => getDocs(query(collection(admin, 'zkAttendance'), where('date', '>=', '2026-01-01'))));

/* ═══ «كشف حضوري» — الموظف يقرأ سجلّ نفسه ═══

   ⚠️ هذه بعينها كُسرت في الإنتاج: الشاشة استعلمت بالتاريخ وحده فرُدّ
   الاستعلام كاملاً، وابتلعت الشاشة الرفض بـ`.catch(() => [])` فقرأت صفر
   سجلات — و buildDailyStatus تقرأ صفر سجلات غياباً. فظهر موظف حاضر كلَّ
   أيامه غائباً في كلّها. الاختبار هنا يحرس شكل الاستعلام لا القاعدة وحدها. */
await check('employee queries OWN attendance (uid + date)',   true,
  () => getDocs(query(collection(emp, 'attendance'),
    where('employeeUid', 'in', ['empU']), where('date', '>=', '2026-01-01'))));
await check('employee queries OWN zkAttendance (uid + date)', true,
  () => getDocs(query(collection(emp, 'zkAttendance'),
    where('employeeUid', 'in', ['empU']), where('date', '>=', '2026-01-01'))));

/* ⚠️ ومعرّفه القديم معه: استعادة الوصول تُنشئ uid جديداً وسجلاته القديمة
   مفهرسة بالقديم — isMine() تقبل الاثنين، فلا يتيتّم تاريخه. */
await check('employee queries own + previous uid',            true,
  () => getDocs(query(collection(emp, 'zkAttendance'),
    where('employeeUid', 'in', ['empU', 'oldEmpU']), where('date', '>=', '2026-01-01'))));

/* ⚠️ والحدّ يبقى: معرّف واحد ليس له في القائمة يُسقط الاستعلام كلَّه */
await check('employee sneaks another uid into the list',      false,
  () => getDocs(query(collection(emp, 'zkAttendance'),
    where('employeeUid', 'in', ['empU', 'someoneElse']), where('date', '>=', '2026-01-01'))));
await check('employee queries attendance by date ONLY',       false,
  () => getDocs(query(collection(emp, 'attendance'), where('date', '>=', '2026-01-01'))));

/* ═══ 12. المهام (المرحلة ٥) ═══

   ⚠️ حقل القسم مصفوفة `departments` من اليوم الأول، فـ sameDept() لا تصلح
   هنا — تقارن حقلاً مفرداً. الحارس دالتان جديدتان: taskDept()/taskDeptNew().

   ⚠️ وأخطر تصعيد في هذه المجموعة ليس القراءة بل **تغيير departments**: مدير
   ينقل مهمة إلى قسم آخر يسحب معه صلاحية قراءتها. لذلك deptUnchanged() مفروضة
   على فرع المدير وفرع الأدمن معاً، لا مكتوبة في تعليق. */
console.log('\n\x1b[1m═══ 12. TASKS ═══\x1b[0m');

const task = (over = {}) => ({
  title: 'تجهيز التقرير', description: '',
  departments: ['المبيعات'], department: 'المبيعات',
  assigneeUid: 'empU', assigneeName: 'سالم',
  createdBy: 'mgrU', createdByName: 'فهد',
  createdAt: serverTimestamp(),
  status: 'new', progress: 0, priority: 'normal',
  startDate: '', dueDate: '', tags: [], checklist: [], ...over
});

/* ── الإنشاء ── */
await check('manager creates a task in own dept',      true,
  () => setDoc(doc(mgr, 'tasks/tk1'), task()));
await check('manager creates in ANOTHER dept',         false,
  () => setDoc(doc(mgr, 'tasks/tk2'), task({ departments: ['المالية'], department: 'المالية' })));
await check('employee creates a task',                 false,
  () => setDoc(doc(emp, 'tasks/tk3'), task({ createdBy: 'empU', createdByName: 'سالم' })));
await check('task created already in_progress',        false,
  () => setDoc(doc(mgr, 'tasks/tk4'), task({ status: 'in_progress' })));
await check('createdBy forged',                        false,
  () => setDoc(doc(mgr, 'tasks/tk5'), task({ createdBy: 'adminU' })));
/* ⚠️ department المفردة لازم تطابق departments[0] وإلا تباعد الفهرس عن القاعدة */
await check('singular department disagrees with array', false,
  () => setDoc(doc(mgr, 'tasks/tk6'), task({ departments: ['المبيعات'], department: 'المالية' })));
await check('empty departments array',                 false,
  () => setDoc(doc(mgr, 'tasks/tk7'), task({ departments: [], department: '' })));
await check('title beyond 120 chars',                  false,
  () => setDoc(doc(mgr, 'tasks/tk8'), task({ title: 'ط'.repeat(121) })));
await check('empty title',                             false,
  () => setDoc(doc(mgr, 'tasks/tk9'), task({ title: '' })));
await check('description beyond 4000',                 false,
  () => setDoc(doc(mgr, 'tasks/tk10'), task({ description: 'د'.repeat(4001) })));
await check('checklist beyond 20 items',               false,
  () => setDoc(doc(mgr, 'tasks/tk11'), task({ checklist: Array.from({ length: 21 }, () => ({ text: 'x' })) })));
await check('unknown priority',                        false,
  () => setDoc(doc(mgr, 'tasks/tk12'), task({ priority: 'critical' })));
await check('admin creates in any dept',               true,
  () => setDoc(doc(admin, 'tasks/tk13'),
    task({ departments: ['المالية'], department: 'المالية', createdBy: 'adminU', createdByName: 'المدير' })));

/* ── القراءة ── */
await check('assignee reads own task',                 true,  () => getDoc(doc(emp, 'tasks/tk1')));
await check('manager reads task in own dept',          true,  () => getDoc(doc(mgr, 'tasks/tk1')));
await check('manager reads task in ANOTHER dept',      false, () => getDoc(doc(mgr, 'tasks/tk13')));
await check('unrelated employee reads a task',         false, () => getDoc(doc(emp2, 'tasks/tk13')));
await check('admin reads any task',                    true,  () => getDoc(doc(admin, 'tasks/tk13')));
await check('manager queries own dept tasks',          true,
  () => getDocs(query(collection(mgr, 'tasks'), where('departments', 'array-contains', 'المبيعات'))));
await check('manager queries tasks unconstrained',     false,
  () => getDocs(query(collection(mgr, 'tasks'))));
await check('employee queries own assigned tasks',     true,
  () => getDocs(query(collection(emp, 'tasks'), where('assigneeUid', '==', 'empU'))));
await check('employee queries someone else assigned',  false,
  () => getDocs(query(collection(emp, 'tasks'), where('assigneeUid', '==', 'emp2U'))));

/* ── تحديث الموظف المكلَّف ── */
await check('assignee starts the task',                true,
  () => updateDoc(doc(emp, 'tasks/tk1'), { status: 'in_progress', progress: 10 }));
await check('assignee sends it for review',            true,
  () => updateDoc(doc(emp, 'tasks/tk1'), { status: 'review', employeeFeedback: 'تم' }));
/* ⚠️ جوهر القرار التصميمي: الموظف لا يعتمد مهمته بنفسه */
await check('⚠️ assignee marks it DONE',                false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { status: 'done' }));
await check('assignee changes the title',              false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { title: 'عنوان آخر' }));
await check('assignee changes the due date',           false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { dueDate: '2027-01-01' }));
await check('assignee reassigns to someone else',      false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { assigneeUid: 'emp2U' }));
await check('assignee rates their own work',           false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { managerRating: 5 }));
/* ⚠️ بلا حدّ المدى يكتب الموظف 900 فتفقد كل نسب الإنجاز معناها */
await check('⚠️ assignee writes progress: 900',         false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { progress: 900 }));
await check('assignee writes negative progress',       false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { progress: -5 }));
await check('assignee writes progress as a string',    false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { progress: '50' }));
await check('assignee feedback beyond 4000',           false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { employeeFeedback: 'ف'.repeat(4001) }));
await check('assignee timeEntries beyond 50',          false,
  () => updateDoc(doc(emp, 'tasks/tk1'), { timeEntries: Array.from({ length: 51 }, () => ({ secs: 1 })) }));
await check('unrelated employee updates a task',       false,
  () => updateDoc(doc(emp2, 'tasks/tk1'), { status: 'in_progress' }));

/* ── المدير والأدمن ── */
await check('manager approves the task',               true,
  () => updateDoc(doc(mgr, 'tasks/tk1'), { status: 'done', managerRating: 4, managerNote: 'ممتاز' }));
/* ⚠️ التصعيد الأخطر: نقل المهمة لقسم آخر يسحب معه صلاحية القراءة */
await check('⚠️ manager moves task to ANOTHER dept',    false,
  () => updateDoc(doc(mgr, 'tasks/tk1'), { departments: ['المالية'], department: 'المالية' }));
await check('⚠️ admin moves task to another dept',      false,
  () => updateDoc(doc(admin, 'tasks/tk1'), { departments: ['المالية'], department: 'المالية' }));
await check('manager of another dept updates it',      false,
  () => updateDoc(doc(mgr, 'tasks/tk13'), { status: 'done' }));
await check('assignee deletes the task',               false, () => deleteDoc(doc(emp, 'tasks/tk1')));
await check('manager deletes the task',                false, () => deleteDoc(doc(mgr, 'tasks/tk1')));
await check('admin deletes the task',                  true,  () => deleteDoc(doc(admin, 'tasks/tk13')));

/* ── المحادثة: إنشاء فقط، كما في hrTickets ── */
const msg = (over = {}) => ({
  authorUid: 'empU', authorName: 'سالم', authorRole: 'employee',
  text: 'بدأت فيها', kind: 'msg', createdAt: serverTimestamp(), ...over
});
await check('assignee posts a message',                true,
  () => setDoc(doc(emp, 'tasks/tk1/messages/m1'), msg()));
await check('manager posts a message',                 true,
  () => setDoc(doc(mgr, 'tasks/tk1/messages/m2'), msg({ authorUid: 'mgrU', authorName: 'فهد', authorRole: 'manager' })));
await check('unrelated employee posts',                false,
  () => setDoc(doc(emp2, 'tasks/tk1/messages/m3'), msg({ authorUid: 'emp2U', authorName: 'ليلى' })));
await check('message under a forged name',             false,
  () => setDoc(doc(emp, 'tasks/tk1/messages/m4'), msg({ authorName: 'فهد' })));
await check('message beyond 2000 chars',               false,
  () => setDoc(doc(emp, 'tasks/tk1/messages/m5'), msg({ text: 'ر'.repeat(2001) })));
await check('empty message',                           false,
  () => setDoc(doc(emp, 'tasks/tk1/messages/m6'), msg({ text: '' })));
/* ⚠️ 'system' من الواجهة وحدها عبر تحديث المهمة — لا يكتبه مستخدم */
await check("message with kind 'system'",              false,
  () => setDoc(doc(emp, 'tasks/tk1/messages/m7'), msg({ kind: 'system' })));
await check('assignee reads the thread',               true,
  () => getDocs(collection(emp, 'tasks/tk1/messages')));
await check('unrelated employee reads the thread',     false,
  () => getDocs(collection(emp2, 'tasks/tk1/messages')));
/* ⚠️ خيط يُعدَّل بعد الفعل ليس سجلاً لشيء */
await check('⚠️ editing a sent message',                false,
  () => updateDoc(doc(emp, 'tasks/tk1/messages/m1'), { text: 'غيّرت رأيي' }));
await check('⚠️ deleting a sent message (even admin)',  false,
  () => deleteDoc(doc(admin, 'tasks/tk1/messages/m1')));

/* ═══ 13. الإعلانات (المرحلة ١١) ═══

   ⚠️ لماذا هذه المجموعة مقبولة وقد رُفضت `notifications`: هناك الموظف يكتب
   وثيقة موجّهة لغيره — أي أنه يقدر يُغرق أي مستخدم بآلاف الوثائق. هنا الأدمن
   وحده يكتب، والموظف يقرأ فقط، فلا ثغرة إغراق أصلاً. الاختبارات أدناه تُثبت
   الشقّين: أن الموظف لا يكتب، وأنه لا يقرأ ما ليس موجّهاً له. */
console.log('\n\x1b[1m═══ 13. ANNOUNCEMENTS ═══\x1b[0m');

const ann = (over = {}) => ({
  title: 'اجتماع الأحد', body: 'الاجتماع الساعة ١٠',
  audienceAll: true, audienceDepts: [], audienceUids: [],
  priority: 'normal', pinned: false, publishAt: '2026-08-01', expiresAt: '',
  requireAck: false, createdBy: 'adminU', createdByName: 'المدير',
  createdAt: serverTimestamp(), ackCount: 0, ...over
});

await check('admin publishes to everyone',            true,
  () => setDoc(doc(admin, 'announcements/an1'), ann()));
await check('admin publishes to a department',        true,
  () => setDoc(doc(admin, 'announcements/an2'),
    ann({ audienceAll: false, audienceDepts: ['المالية'] })));
await check('admin publishes to named people',        true,
  () => setDoc(doc(admin, 'announcements/an3'),
    ann({ audienceAll: false, audienceUids: ['emp2U'] })));

/* ⚠️ الشقّ الأول: لا كتابة من غير الأدمن — وهنا يموت خطر الإغراق */
await check('⚠️ employee publishes an announcement',   false,
  () => setDoc(doc(emp, 'announcements/an4'), ann({ createdBy: 'empU', createdByName: 'سالم' })));
await check('⚠️ manager publishes an announcement',    false,
  () => setDoc(doc(mgr, 'announcements/an5'), ann({ createdBy: 'mgrU', createdByName: 'فهد' })));
await check('admin forges createdBy',                 false,
  () => setDoc(doc(admin, 'announcements/an6'), ann({ createdBy: 'mgrU' })));
await check('title beyond 120 chars',                 false,
  () => setDoc(doc(admin, 'announcements/an7'), ann({ title: 'ع'.repeat(121) })));
await check('body beyond 5000 chars',                 false,
  () => setDoc(doc(admin, 'announcements/an8'), ann({ body: 'ن'.repeat(5001) })));
await check('audienceUids beyond 50',                 false,
  () => setDoc(doc(admin, 'announcements/an9'),
    ann({ audienceAll: false, audienceUids: Array.from({ length: 51 }, (_, i) => 'u' + i) })));
await check('unknown priority',                       false,
  () => setDoc(doc(admin, 'announcements/an10'), ann({ priority: 'حرج' })));

/* ⚠️ الشقّ الثاني: القراءة محصورة بمن وُجّه إليه */
/* إعلان موجَّه لـ empU بالاسم — للتحقق من الفرع الثالث في قاعدة القراءة */
await check('admin publishes to empU by name',        true,
  () => setDoc(doc(admin, 'announcements/an11'),
    ann({ audienceAll: false, audienceUids: ['empU'] })));

await check('employee reads an all-hands notice',     true,  () => getDoc(doc(emp, 'announcements/an1')));
await check('employee reads a notice aimed at them',  true,  () => getDoc(doc(emp, 'announcements/an11')));
await check('employee reads notice for OWN dept',     false, () => getDoc(doc(emp, 'announcements/an2')));
await check('employee reads notice aimed at another', false, () => getDoc(doc(emp, 'announcements/an3')));
await check('suspended reads an all-hands notice',    false, () => getDoc(doc(susp, 'announcements/an1')));
/* ⚠️ emp2U عُلّق في القسم ٦ أعلاه (`admin suspends an employee`)، فقراءته
   مرفوضة بـ isActive() ولو كان الإعلان موجّهاً له بالاسم. هذا سلوك مقصود
   يُختبر هنا صراحةً: التعليق يقطع كل شيء، لا الكتابة وحدها. */
await check('⚠️ suspended reads a notice aimed at THEM', false,
  () => getDoc(doc(emp2, 'announcements/an3')));

/* الاستعلامات — ثلاثة مستمعين منفصلين لأن OR واحد يُرفض */
await check('employee queries audienceAll',           true,
  () => getDocs(query(collection(emp, 'announcements'), where('audienceAll', '==', true))));
await check('employee queries own dept notices',      true,
  () => getDocs(query(collection(emp, 'announcements'), where('audienceDepts', 'array-contains', 'المبيعات'))));
await check('employee queries announcements openly',  false,
  () => getDocs(query(collection(emp, 'announcements'))));

/* الإقرار بالاطّلاع */
await check('employee acknowledges as themselves',    true,
  () => setDoc(doc(emp, 'announcements/an1/acks/empU'),
    { uid: 'empU', name: 'سالم', department: 'المبيعات', at: serverTimestamp() }));
await check('⚠️ employee acknowledges FOR someone else', false,
  () => setDoc(doc(emp, 'announcements/an1/acks/emp2U'),
    { uid: 'emp2U', name: 'خالد', at: serverTimestamp() }));
await check('acknowledgement under a forged name',    false,
  () => setDoc(doc(emp2, 'announcements/an1/acks/emp2U'),
    { uid: 'emp2U', name: 'سالم', at: serverTimestamp() }));
/* ⚠️ الإقرار لا يُسحب — وهذا كل معناه */
await check('⚠️ withdrawing an acknowledgement',       false,
  () => deleteDoc(doc(emp, 'announcements/an1/acks/empU')));
await check('⚠️ editing an acknowledgement',           false,
  () => updateDoc(doc(emp, 'announcements/an1/acks/empU'), { at: serverTimestamp() }));
await check('employee reads own acknowledgement',     true,
  () => getDoc(doc(emp, 'announcements/an1/acks/empU')));
await check('employee reads ANOTHER acknowledgement', false,
  () => getDoc(doc(emp2, 'announcements/an1/acks/empU')));
await check('admin reads every acknowledgement',      true,
  () => getDocs(collection(admin, 'announcements/an1/acks')));

/* ⚠️ get() و list() سؤالان مختلفان — ونجاح الأول لا يقول شيئاً عن الثاني.
   كانت هذه المجموعة تفحص قراءة الأدمن لوثيقة **بمعرّفها** فتمرّ عبر شروط
   الجمهور، بينما شاشة الأدمن تحتاج **سرد** المجموعة كلها لإدارتها —
   وFirestore يرفض السرد ما لم يثبت أن كل نتيجة محتملة تحقّق القاعدة.
   فكانت الشاشة تعرض «تعذّر التحميل»، والإعلان الذي أرسله الأدمن للتوّ
   لا يراه هو نفسه. كُشف بالإرسال في المتصفح لا بهذه الاختبارات. */
await check('⚠️ admin LISTS all announcements',        true,
  () => getDocs(collection(admin, 'announcements')));
await check('⚠️ admin lists ordered by publishAt',     true,
  () => getDocs(query(collection(admin, 'announcements'), orderBy('publishAt', 'desc'), limit(50))));
await check('manager still cannot list them all',     false,
  () => getDocs(collection(mgr, 'announcements')));
await check('employee still cannot list them all',    false,
  () => getDocs(collection(emp, 'announcements')));

/* ═══ 14. رصيد الإجازات (المرحلة ٨) ═══

   ⚠️⚠️ أخطر حقول في النظام. `leavePolicy` تحدّد كم يستحقّ الموظف،
   و`leaveUsed` كم استهلك، و`balances` العدّاد القديم. موظف يكتب أياً منها
   على نفسه يمنح نفسه إجازةً لا يستحقّها — والاكتشاف يأتي بعد أن يكون أخذها.

   الحارس هو قائمة only([...]) المغلقة في match /users. هذه الاختبارات تحرس
   القائمة من أن يوسّعها أحد لاحقاً بلا انتباه. */
console.log('\n\x1b[1m═══ 14. LEAVE BALANCE FIELDS ═══\x1b[0m');

await check('⚠️ employee sets own leavePolicy',        false,
  () => selfContact({ leavePolicy: { annual: { annualDays: 99 } } }));
await check('⚠️ employee lowers own leaveUsed',        false,
  () => selfContact({ leaveUsed: { annual: 0 } }));
await check('⚠️ employee raises own balances',         false,
  () => selfContact({ balances: { annual: 99 } }));
await check('employee smuggles leaveUsed w/ address',  false,
  () => selfContact({ address: 'x', leaveUsed: { annual: 0 } }));
await check('manager edits leavePolicy of own dept',   false,
  () => updateDoc(doc(mgr, 'users/empU'), { leavePolicy: { annual: { annualDays: 30 } } }));
await check('manager lowers leaveUsed of own dept',    false,
  () => updateDoc(doc(mgr, 'users/empU'), { leaveUsed: { annual: 0 } }));

await check('admin sets a leave policy',               true,
  () => updateDoc(doc(admin, 'users/empU'),
    { leavePolicy: { annual: { annualDays: 21, openingBalance: 5, accrualMode: 'monthly' } } }));
await check('admin writes leaveUsed',                  true,
  () => updateDoc(doc(admin, 'users/empU'), { leaveUsed: { annual: 3 } }));

/* السياسة الافتراضية تعيش في settings — أدمن فقط، والقاعدة قائمة */
await check('employee writes leavePolicyDefaults',     false,
  () => updateDoc(doc(emp, 'settings/config'), { leavePolicyDefaults: { annual: { annualDays: 99 } } }));
await check('admin writes leavePolicyDefaults',        true,
  () => updateDoc(doc(admin, 'settings/config'), { leavePolicyDefaults: { annual: { annualDays: 21 } } }));

/* ═══ 15. طلب تصحيح بصمة (المرحلة ١٠) ═══

   ⚠️ الطلب **يطلب فقط**. التصحيح نفسه يبقى في attendanceAdjustments التي
   تسمح بالإنشاء للأدمن وحده وتمنع التحديث والحذف نهائياً. لا شيء هنا يعطي
   الموظف كتابةً في سجل حضوره.

   ⚠️ والسقف الشهري (٣ في الدورة) **ليس هنا** ولا يمكن أن يكون: عدّ طلبات
   الموظف الأخرى يحتاج استعلاماً داخل القاعدة وFirestore لا يقدر عليه. هو
   في الواجهة وحدها ومكتوب هناك أنه ليس ضماناً من السيرفر. */
console.log('\n\x1b[1m═══ 15. ATTENDANCE FIX REQUESTS ═══\x1b[0m');

const fixReq = (over = {}) => ({
  type: 'attendanceFix', employeeUid: 'empU', employeeName: 'سالم',
  employeeEmpId: '101', department: 'المبيعات',
  date: ymdKsa(), sessionIdx: 0, fixKind: 'missingOut', field: 'out',
  claimedTime: '17:30',
  reason: 'خرجت لموعد طبي ونسيت البصمة عند الباب',
  status: 'pending', reviewedBy: '', reviewedAt: null, rejectReason: '',
  chain: ['manager', 'admin'], step: 0, approvals: [],
  createdAt: serverTimestamp(), ...over
});

await check('employee files a fix for themselves',    true,
  () => addDoc(collection(emp, 'requests'), fixReq()));
await check('⚠️ employee files a fix for SOMEONE ELSE', false,
  () => addDoc(collection(emp, 'requests'), fixReq({ employeeUid: 'emp2U', employeeName: 'خالد' })));

/* النافذة سبعة أيام — تصحيح شهر مضى يعني إعادة حساب مسير صُرِف */
await check('fix dated 30 days ago',                  false,
  () => addDoc(collection(emp, 'requests'), fixReq({ date: dRel(-30) })));
await check('fix dated 8 days ago',                   false,
  () => addDoc(collection(emp, 'requests'), fixReq({ date: dRel(-8) })));
await check('fix dated 6 days ago',                   true,
  () => addDoc(collection(emp, 'requests'), fixReq({ date: dRel(-6) })));
await check('⚠️ fix dated in the FUTURE',              false,
  () => addDoc(collection(emp, 'requests'), fixReq({ date: dRel(3) })));

/* السبب — «نسيت» لا تشرح شيئاً لمن سيعتمد */
await check('reason under 10 chars',                  false,
  () => addDoc(collection(emp, 'requests'), fixReq({ reason: 'نسيت' })));
await check('reason beyond 300 chars',                false,
  () => addDoc(collection(emp, 'requests'), fixReq({ reason: 'س'.repeat(301) })));

/* الوقت لازم يكون قابلاً للتحويل لطابع زمني في خطوة الأدمن */
await check('claimedTime as free text',               false,
  () => addDoc(collection(emp, 'requests'), fixReq({ claimedTime: 'بعد العصر' })));
await check('claimedTime as 25:00',                   false,
  () => addDoc(collection(emp, 'requests'), fixReq({ claimedTime: '25:00' })));
await check('unknown fixKind',                        false,
  () => addDoc(collection(emp, 'requests'), fixReq({ fixKind: 'مزاجي' })));
await check('unknown field',                          false,
  () => addDoc(collection(emp, 'requests'), fixReq({ field: 'salary' })));
await check('sessionIdx of 99',                       false,
  () => addDoc(collection(emp, 'requests'), fixReq({ sessionIdx: 99 })));

/* السلسلة تبدأ من الصفر — لا طلب «مرّ على مديره» أصلاً */
await check('fix pre-approved at step 1',             false,
  () => addDoc(collection(emp, 'requests'), fixReq({ step: 1 })));
await check('fix created already approved',           false,
  () => addDoc(collection(emp, 'requests'), fixReq({ status: 'approved' })));

/* ⚠️ الحدّ الأهم: الطلب لا يفتح الكتابة في سجل الحضور */
await check('⚠️ employee writes attendanceAdjustments directly', false,
  () => setDoc(doc(emp, 'attendanceAdjustments/hack1'), {
    employeeUid: 'empU', employeeName: 'سالم', date: ymdKsa(), coll: 'zkAttendance',
    sessionIdx: 0, field: 'out', value: Timestamp.now(), reason: 'طلبي معتمد',
    byUid: 'empU', byName: 'سالم', at: serverTimestamp() }));
await check('⚠️ manager writes attendanceAdjustments',  false,
  () => setDoc(doc(mgr, 'attendanceAdjustments/hack2'), {
    employeeUid: 'empU', employeeName: 'سالم', date: ymdKsa(), coll: 'zkAttendance',
    sessionIdx: 0, field: 'out', value: Timestamp.now(), reason: 'اعتمدت الطلب',
    byUid: 'mgrU', byName: 'فهد', at: serverTimestamp() }));
await check('admin writes the adjustment',            true,
  () => setDoc(doc(admin, 'attendanceAdjustments/fix1'), {
    employeeUid: 'empU', employeeName: 'سالم', date: ymdKsa(), coll: 'zkAttendance',
    sessionIdx: 0, field: 'out', value: Timestamp.now(),
    reason: 'طلب تصحيح معتمَد — خرجت لموعد طبي', byUid: 'adminU', byName: 'المدير',
    at: serverTimestamp() }));
/* ⚠️ ولا يُتراجع عنه — الخطأ يُصحَّح بقيد مضادّ لا بمحو الأصل */
await check('⚠️ admin edits a written adjustment',      false,
  () => updateDoc(doc(admin, 'attendanceAdjustments/fix1'), { reason: 'غيّرت رأيي' }));
await check('⚠️ admin deletes a written adjustment',    false,
  () => deleteDoc(doc(admin, 'attendanceAdjustments/fix1')));

/* ═══ 16. تفويض المهام (المرحلة ٧-و) ═══

   ⚠️ التفويض **إضافة لا استبدال**: المندوب يقرأ ويحدّث، والمكلَّف الأصلي
   يبقى على المهمة ويظل يقرؤها — وسجل «من نفّذ فعلاً» يبقى صحيحاً.

   ⚠️ و`delegatedUntil` **لا تُفرض من القاعدة**: لا مؤقّت على السيرفر ولا
   ساعة في القواعد غير request.time. الواجهة تتجاهل المنتهي، والمدير يلغيه.
   الحارس الحقيقي أن المدير وحده يقدر يضبط الحقل أصلاً. */
console.log('\n\x1b[1m═══ 16. TASK DELEGATION ═══\x1b[0m');

/* ⚠️ emp2U عُلّق في القسم ٦ (`admin suspends an employee`)، و isActive()
   تقطع كل شيء على المعلَّق — فلا يقرأ مهمة فُوِّضت له ولو بالاسم. نُعيد
   تفعيله هنا لأن هذا القسم يختبر التفويض لا التعليق.

   ⚠️ والحالة المشتركة بين أقسام هذا الملف تُدار بالترتيب صراحةً لا بالحظ:
   قسمٌ يعتمد على حالة أرساها قسم قبله يسقط بلا أن يكون في الكود عيب. */
await env.withSecurityRulesDisabled(async (c) =>
  updateDoc(doc(c.firestore(), 'users/emp2U'), { status: 'active' }));

await check('manager creates a task to delegate',     true,
  () => setDoc(doc(mgr, 'tasks/dg1'), task()));
await check('manager delegates to another member',    true,
  () => updateDoc(doc(mgr, 'tasks/dg1'),
    { delegatedToUid: 'emp2U', delegatedToName: 'خالد', delegatedByUid: 'mgrU', delegatedUntil: '2026-12-31' }));

/* المندوب يقرأ ويحدّث */
await check('delegate reads the task',                true,  () => getDoc(doc(emp2, 'tasks/dg1')));
await check('delegate moves it forward',              true,
  () => updateDoc(doc(emp2, 'tasks/dg1'), { status: 'in_progress', progress: 20 }));
await check('delegate posts in the thread',           true,
  () => setDoc(doc(emp2, 'tasks/dg1/messages/dm1'), msg({ authorUid: 'emp2U', authorName: 'خالد' })));

/* ⚠️ والمكلَّف الأصلي لم يفقد شيئاً */
await check('⚠️ original assignee still reads it',     true,  () => getDoc(doc(emp, 'tasks/dg1')));
await check('⚠️ original assignee still updates it',   true,
  () => updateDoc(doc(emp, 'tasks/dg1'), { progress: 30 }));

/* والمندوب لا يرث صلاحيات المدير */
await check('delegate cannot approve it',             false,
  () => updateDoc(doc(emp2, 'tasks/dg1'), { status: 'done' }));
await check('delegate cannot rewrite the title',      false,
  () => updateDoc(doc(emp2, 'tasks/dg1'), { title: 'عنوان آخر' }));
/* ⚠️ ولا يفوّض المهمة لنفسه ولا لغيره — الحقل بيد المدير وحده */
await check('⚠️ delegate re-delegates the task',       false,
  () => updateDoc(doc(emp2, 'tasks/dg1'), { delegatedToUid: 'empU' }));
/* ⚠️ القيمة لازم تختلف عن الحالية وإلا كان التغيير صفراً و only() تمرّ على
   مجموعة مفاتيح فارغة — فيبدو الاختبار ناجحاً وهو لم يختبر شيئاً. كُشف
   حين مرّ هذا السطر وهو يكتب نفس القيمة المضبوطة قبله بسطرين. */
await check('⚠️ assignee re-points the delegation',    false,
  () => updateDoc(doc(emp, 'tasks/dg1'), { delegatedToUid: 'mgrU' }));
await check('⚠️ assignee clears the delegation',       false,
  () => updateDoc(doc(emp, 'tasks/dg1'), { delegatedToUid: '' }));
await check('⚠️ assignee extends delegatedUntil',      false,
  () => updateDoc(doc(emp, 'tasks/dg1'), { delegatedUntil: '2099-01-01' }));

/* بعد إلغاء التفويض يعود المندوب غريباً */
await check('manager clears the delegation',          true,
  () => updateDoc(doc(mgr, 'tasks/dg1'), { delegatedToUid: '', delegatedToName: '', delegatedUntil: '' }));
await check('former delegate can no longer update',   false,
  () => updateDoc(doc(emp2, 'tasks/dg1'), { progress: 90 }));

/* ═══ الحقول الجديدة في المرحلة ٧ ═══ */
await check('assignee logs time entries',             true,
  () => updateDoc(doc(emp, 'tasks/dg1'), { timeEntries: [{ start: 1, end: 2, secs: 60 }], actualSecs: 60 }));
await check('assignee sets blockedByTaskIds',         false,
  () => updateDoc(doc(emp, 'tasks/dg1'), { blockedByTaskIds: ['tk1'] }));
await check('manager sets blockedByTaskIds',          true,
  () => updateDoc(doc(mgr, 'tasks/dg1'), { blockedByTaskIds: ['tk1'] }));
await check('task created with 6 blockers',           false,
  () => setDoc(doc(mgr, 'tasks/dg2'),
    task({ blockedByTaskIds: ['a', 'b', 'c', 'd', 'e', 'f'] })));
await check('manager archives a task',                true,
  () => updateDoc(doc(mgr, 'tasks/dg1'), { status: 'archived', archivedAt: serverTimestamp() }));

/* ⚠️ والقالب يعيش في settings — أدمن فقط */
await check('manager writes taskTemplates',           false,
  () => updateDoc(doc(mgr, 'settings/config'), { taskTemplates: [{ id: 'x', title: 'y' }] }));
await check('admin writes taskTemplates',             true,
  () => updateDoc(doc(admin, 'settings/config'), { taskTemplates: [{ id: 'x', title: 'y', active: true }] }));

/* ═══ 17. أحداث التقويم (المرحلة ٩) ═══

   ⚠️ قرار المالك (٢٠٢٦-٠٨-١٢): الموظف لا يرى إجازات زملائه إطلاقاً. فما
   يراه في التقويم هو **الأحداث** — اجتماع يضيفه مدير قسمه، أو حدث للشركة
   يضيفه الأدمن. وهذا ألغى الحاجة لأي وثيقة مُشتقّة تُنشر.

   ⚠️ ونطاق الحدث حقلٌ واحد: `department` فارغة = الشركة كلها. حقلان
   (forAll و department) يسمحان بحالة متناقضة — «للشركة ولقسم المبيعات» —
   والقاعدة تصير أطول لتمنعها. */
console.log('\n\x1b[1m═══ 17. CALENDAR EVENTS ═══\x1b[0m');

const ev = (over = {}) => ({
  title: 'اجتماع القسم الأسبوعي', note: '', date: '2026-09-20',
  department: 'المبيعات', createdBy: 'mgrU', createdByName: 'فهد',
  createdAt: serverTimestamp(), ...over
});

/* المدير: قسمه وحده */
await check('manager adds an event for own dept',     true,
  () => setDoc(doc(mgr, 'calendarEvents/ev1'), ev()));
await check('⚠️ manager adds one for ANOTHER dept',    false,
  () => setDoc(doc(mgr, 'calendarEvents/ev2'), ev({ department: 'المالية' })));
/* ⚠️ حدث الشركة قرار الأدمن — والمدير يصله بترك القسم فارغاً */
await check('⚠️ manager adds a COMPANY-WIDE event',    false,
  () => setDoc(doc(mgr, 'calendarEvents/ev3'), ev({ department: '' })));
await check('manager forges createdBy',               false,
  () => setDoc(doc(mgr, 'calendarEvents/ev4'), ev({ createdBy: 'adminU' })));
await check('manager forges createdByName',           false,
  () => setDoc(doc(mgr, 'calendarEvents/ev5'), ev({ createdByName: 'المدير' })));

/* الأدمن: أي نطاق */
await check('admin adds a company-wide event',        true,
  () => setDoc(doc(admin, 'calendarEvents/ev6'),
    ev({ department: '', createdBy: 'adminU', createdByName: 'المدير' })));
await check('admin adds one for any dept',            true,
  () => setDoc(doc(admin, 'calendarEvents/ev7'),
    ev({ department: 'المالية', createdBy: 'adminU', createdByName: 'المدير' })));

/* الموظف لا يكتب شيئاً */
await check('⚠️ employee adds an event',               false,
  () => setDoc(doc(emp, 'calendarEvents/ev8'), ev({ createdBy: 'empU', createdByName: 'سالم' })));

/* الحدود على الشكل */
await check('title beyond 120 chars',                 false,
  () => setDoc(doc(mgr, 'calendarEvents/ev9'), ev({ title: 'ع'.repeat(121) })));
await check('empty title',                            false,
  () => setDoc(doc(mgr, 'calendarEvents/ev10'), ev({ title: '' })));
await check('note beyond 500 chars',                  false,
  () => setDoc(doc(mgr, 'calendarEvents/ev11'), ev({ note: 'ن'.repeat(501) })));
await check('a malformed date',                       false,
  () => setDoc(doc(mgr, 'calendarEvents/ev12'), ev({ date: 'الأحد القادم' })));
/* ⚠️ قائمة مفاتيح مغلقة — حقل جديد لا يتسلّل */
await check('⚠️ an extra field smuggled in',           false,
  () => setDoc(doc(mgr, 'calendarEvents/ev13'), { ...ev(), employeeUid: 'empU' }));

/* القراءة: الشركة أو قسم القارئ */
await check('employee reads own dept event',          true,  () => getDoc(doc(emp, 'calendarEvents/ev1')));
await check('employee reads a company-wide event',    true,  () => getDoc(doc(emp, 'calendarEvents/ev6')));
await check('⚠️ employee reads ANOTHER dept event',    false, () => getDoc(doc(emp, 'calendarEvents/ev7')));
await check('employee queries own dept events',       true,
  () => getDocs(query(collection(emp, 'calendarEvents'), where('department', '==', 'المبيعات'))));
await check('employee queries company-wide events',   true,
  () => getDocs(query(collection(emp, 'calendarEvents'), where('department', '==', ''))));
await check('⚠️ employee queries events unconstrained', false,
  () => getDocs(collection(emp, 'calendarEvents')));

/* الحذف بنفس حدّ الكتابة */
await check('manager deletes own dept event',         true,  () => deleteDoc(doc(mgr, 'calendarEvents/ev1')));
await check('⚠️ manager deletes a company event',      false, () => deleteDoc(doc(mgr, 'calendarEvents/ev6')));
await check('⚠️ manager deletes another dept event',   false, () => deleteDoc(doc(mgr, 'calendarEvents/ev7')));
await check('employee deletes an event',              false, () => deleteDoc(doc(emp, 'calendarEvents/ev6')));
await check('admin deletes any event',                true,  () => deleteDoc(doc(admin, 'calendarEvents/ev7')));

/* ⚠️ والأصل يبقى مقفلاً: التقويم لم يفتح إجازات الزملاء للموظف */
await check('⚠️ employee still cannot read peer leave requests', false,
  () => getDocs(query(collection(emp, 'requests'), where('department', '==', 'المبيعات'))));

console.log(`\n\x1b[1m═══ RESULT: ${pass} passed, ${fail} failed ═══\x1b[0m`);
if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  • ' + f)); }
await env.cleanup();
process.exit(fail ? 1 : 0);
