/* ═══════════════════════════════════════════════════════════════════════════
   بذور المحاكي — شركة كاملة مصطنعة لقيادة النظام عليها.

   ينشئ ثلاثة حسابات دخول حقيقية في محاكي Auth، وملفاتها في محاكي Firestore،
   ومعها الإعدادات والفروع والورديات وأنواع الإجازات وسجلات حضور وطلبات —
   حتى تكون كل شاشة في النظام عليها ما تعرضه، لا شاشة فارغة تُخفي أعطالها.

   ⚠️ يكتب في المحاكي وحده. FIRESTORE_EMULATOR_HOST و FIREBASE_AUTH_EMULATOR_HOST
   يُضبطان هنا في الكود لا في البيئة، فلا يمكن تشغيله على الإنتاج بالخطأ.

   ⚠️ الكتابة تتجاوز القواعد عمداً (withSecurityRulesDisabled): البذر مسألة
   بيضة ودجاجة — القاعدة تشترط وجود ملف الأدمن ليُسمح بإنشاء الملفات، وملف
   الأدمن نفسه لا يُنشأ إلا بأدمن. القواعد تُختبر في rules.test.mjs، وهنا
   نُجهّز الحالة فقط.

   التشغيل:  node seed-emulator.mjs      (والمحاكيان يعملان)
   ═══════════════════════════════════════════════════════════════════════════ */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

const PROJECT = 'seen-hr2';
const AUTH_HOST = '127.0.0.1:9099';
const FS_HOST   = '127.0.0.1:8080';
const DOMAIN = '@seen-hr.local';

/* ═══ الحسابات ═══ */
export const ACCOUNTS = [
  { key:'admin',   phone:'0500000001', pass:'Test12345!', name:'ريم الأحمد',
    role:'admin',    department:'الموارد البشرية', jobTitle:'مدير النظام',   empId:'A001', salary:18000 },
  { key:'manager', phone:'0500000002', pass:'Test12345!', name:'فهد العتيبي',
    role:'manager',  department:'المبيعات',        jobTitle:'مدير المبيعات', empId:'M001', salary:14000 },
  { key:'employee',phone:'0500000003', pass:'Test12345!', name:'سالم القحطاني',
    role:'employee', department:'المبيعات',        jobTitle:'مندوب مبيعات',  empId:'E001', salary:9000 }
];
const emailOf = (a) => a.phone + DOMAIN;

/* ═══ إنشاء حساب في محاكي Auth عبر واجهته المباشرة ═══
   المحاكي يقبل أي apiKey — لا مفتاح حقيقي هنا ولا اتصال بجوجل. */
async function createAuthUser(email, password) {
  const url = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await res.json();
  if (!res.ok) {
    /* الحساب موجود من تشغيل سابق — نسجّل الدخول لنأخذ الـuid نفسه */
    if (body.error && /EMAIL_EXISTS/.test(body.error.message)) {
      const inUrl = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
      const r2 = await fetch(inUrl, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email, password, returnSecureToken:true }) });
      const b2 = await r2.json();
      if (!r2.ok) throw new Error('signIn failed: ' + JSON.stringify(b2));
      return b2.localId;
    }
    throw new Error('signUp failed: ' + JSON.stringify(body));
  }
  return body.localId;
}

async function clearAuth() {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method:'DELETE' });
}

/* ═══ التواريخ ═══ */
const ymd = (d) => d.getFullYear() + '-' +
  String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const at = (d, hhmm) => {
  const [h,m] = hhmm.split(':').map(Number);
  const x = new Date(d); x.setHours(h, m, 0, 0); return x;
};

const WEEK = {
  0:{type:'morning',start:'08:00',end:'16:00'}, 1:{type:'morning',start:'08:00',end:'16:00'},
  2:{type:'morning',start:'08:00',end:'16:00'}, 3:{type:'morning',start:'08:00',end:'16:00'},
  4:{type:'morning',start:'08:00',end:'16:00'},
  5:{type:'off',start:'',end:''}, 6:{type:'off',start:'',end:''}
};

async function main() {
  console.log('\n\x1b[1m═══ بذر المحاكي ═══\x1b[0m');

  await clearAuth();
  console.log('  ✓ حسابات Auth السابقة مُسحت');

  const uids = {};
  for (const a of ACCOUNTS) {
    uids[a.key] = await createAuthUser(emailOf(a), a.pass);
    console.log(`  ✓ حساب ${a.role}: ${emailOf(a)}  →  ${uids[a.key]}`);
  }

  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') }
  });
  await env.clearFirestore();
  console.log('  ✓ Firestore مُسح');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (path, data) => db.doc(path).set(data);

    /* ── الإعدادات ── */
    await set('settings/config', {
      shifts: WEEK,
      departments: [
        { name:'المبيعات', manager: uids.manager },
        { name:'الموارد البشرية', manager: uids.admin },
        { name:'المالية', manager: '' }
      ],
      dateExceptions: [{ date: ymd(shift(3)), type:'off', label:'إجازة اليوم الوطني' }],
      branches: [
        { id:'b-main', name:'المقر الرئيسي', lat:24.7136, lng:46.6753, radius:500, active:true },
        { id:'b-north', name:'فرع الشمال',   lat:24.8000, lng:46.6300, radius:300, active:true },
        { id:'b-old',  name:'الفرع القديم',  lat:24.6000, lng:46.7000, radius:300, active:false }
      ],
      leaveTypes: [
        { id:'lt-annual', label:'إجازة سنوية',      balance:21, deduct:true },
        { id:'lt-sick',   label:'إجازة مرضية',      balance:30, deduct:true },
        { id:'lt-unpaid', label:'إجازة بدون راتب',  balance:30, deduct:true, unpaid:true }
      ],
      permissionReasons: [
        { id:'pr-1', label:'مراجعة مستشفى' },
        { id:'pr-2', label:'ظرف عائلي' },
        { id:'pr-3', label:'زحام مروري' }
      ],
      approvers: [
        { id: uids.manager, name:'فهد العتيبي' },
        { id: uids.admin,   name:'ريم الأحمد' }
      ],
      payroll: { hoursPerDay:8, daysPerMonth:30, graceMinutes:0 },
      company: { lat:24.7136, lng:46.6753, radius:500 }
    });

    /* ── الموظفون ── */
    for (const a of ACCOUNTS) {
      await set(`users/${uids[a.key]}`, {
        name:a.name, empId:a.empId, department:a.department, jobTitle:a.jobTitle,
        email: emailOf(a), phone:a.phone, role:a.role, status:'active',
        manager: a.role === 'employee' ? uids.manager : '',
        hireDate:'2023-01-15', salary:a.salary,
        balances: { 'lt-annual': 21, 'lt-sick': 30, 'lt-unpaid': 30 },
        branchIds: [], workMode: 'onsite',
        idExpiry: ymd(shift(20)),            /* مستند يقارب الانتهاء — لتنبيه العقود */
        contractEnd: ymd(shift(45)),
        createdAt: new Date()
      });
    }

    /* ── سجلات حضور: آخر ١٤ يوماً، فيها تأخير وغياب ونسيان بصمة ── */
    let late = 0, absent = 0, missing = 0, present = 0;
    for (let i = 14; i >= 1; i--) {
      const d = shift(-i), ds = ymd(d), dow = d.getDay();
      if (dow === 5 || dow === 6) continue;
      for (const a of ACCOUNTS) {
        if (a.role === 'admin') continue;
        let inHm = '08:00', outHm = '16:00', skip = false, noOut = false;
        if (a.role === 'employee') {
          if (i === 10) { skip = true; absent++; }
          else if (i === 8)  { inHm = '08:45'; late++; }
          else if (i === 6)  { noOut = true; missing++; }
          else if (i === 4)  { outHm = '15:00'; }
          else present++;
        }
        if (skip) continue;
        const doc = {
          employeeUid: uids[a.key], employeeName:a.name, employeeEmpId:a.empId,
          department:a.department, date: ds, dow,
          branchId:'b-main', branchName:'المقر الرئيسي', workMode:'onsite', source:'device',
          sessions: [{ in: at(d, inHm), out: noOut ? null : at(d, outHm),
                       inBranchId:'b-main', inBranchName:'المقر الرئيسي' }]
        };
        await set(`zkAttendance/${uids[a.key]}_${ds}`, doc);
        await set(`attendance/${uids[a.key]}_${ds}`, { ...doc, source:'web' });
      }
    }

    /* ── الطلبات: معلّق ومعتمد ومرفوض، استئذان وإجازة ── */
    const reqs = [
      { id:'req-perm-pending', type:'permission', status:'pending',
        employeeUid: uids.employee, employeeName:'سالم القحطاني', employeeEmpId:'E001',
        department:'المبيعات', date: ymd(shift(-1)), time:'09:30',
        category:'تأخير عن الدوام', categoryLabel:'تأخير عن الدوام',
        reasonId:'pr-1', reasonLabel:'مراجعة مستشفى',
        approverId: uids.manager, approverName:'فهد العتيبي',
        note:'موعد مستشفى مسبق', reviewedBy:'', reviewedAt:null, rejectReason:'',
        createdAt: new Date() },
      { id:'req-perm-approved', type:'permission', status:'approved',
        employeeUid: uids.employee, employeeName:'سالم القحطاني', employeeEmpId:'E001',
        department:'المبيعات', date: ymd(shift(-8)), time:'09:00',
        category:'تأخير عن الدوام', categoryLabel:'تأخير عن الدوام',
        reasonId:'pr-3', reasonLabel:'زحام مروري',
        approverId: uids.manager, approverName:'فهد العتيبي',
        note:'', reviewedBy:'فهد العتيبي', reviewedAt:new Date(), rejectReason:'',
        createdAt: new Date() },
      { id:'req-leave-pending', type:'leave', status:'pending',
        employeeUid: uids.employee, employeeName:'سالم القحطاني', employeeEmpId:'E001',
        department:'المبيعات', startDate: ymd(shift(10)), endDate: ymd(shift(14)), days:3,
        leaveTypeId:'lt-annual', categoryLabel:'إجازة سنوية', deduct:true,
        approverId: uids.admin, approverName:'ريم الأحمد',
        note:'سفر عائلي', reviewedBy:'', reviewedAt:null, rejectReason:'',
        createdAt: new Date() },
      { id:'req-leave-rejected', type:'leave', status:'rejected',
        employeeUid: uids.employee, employeeName:'سالم القحطاني', employeeEmpId:'E001',
        department:'المبيعات', startDate: ymd(shift(-20)), endDate: ymd(shift(-18)), days:2,
        leaveTypeId:'lt-sick', categoryLabel:'إجازة مرضية', deduct:true,
        approverId: uids.admin, approverName:'ريم الأحمد',
        note:'', reviewedBy:'ريم الأحمد', reviewedAt:new Date(),
        rejectReason:'بلا تقرير طبي', createdAt: new Date() },
      { id:'req-mgr-leave', type:'leave', status:'pending',
        employeeUid: uids.manager, employeeName:'فهد العتيبي', employeeEmpId:'M001',
        department:'المبيعات', startDate: ymd(shift(20)), endDate: ymd(shift(22)), days:2,
        leaveTypeId:'lt-annual', categoryLabel:'إجازة سنوية', deduct:true,
        approverId: uids.admin, approverName:'ريم الأحمد',
        note:'', reviewedBy:'', reviewedAt:null, rejectReason:'', createdAt: new Date() }
    ];
    for (const r of reqs) { const { id, ...rest } = r; await set(`requests/${id}`, rest); }

    await set('auditLog/seed-1', { action:'بذر بيانات التجربة', detail:'من seed-emulator.mjs',
      byName:'ريم الأحمد', byUid: uids.admin, at: new Date() });

    console.log(`  ✓ حضور: ${present} منتظم · ${late} تأخير · ${absent} غياب · ${missing} نسيان بصمة`);
    console.log(`  ✓ طلبات: ${reqs.length} (معلّق ومعتمد ومرفوض)`);
  });

  await env.cleanup();

  console.log('\n\x1b[1m═══ الحسابات ═══\x1b[0m');
  for (const a of ACCOUNTS) {
    console.log(`  ${a.role.padEnd(9)} ${a.phone}  كلمة المرور: ${a.pass}   (${a.name})`);
  }
  console.log('\n  افتح النظام على http://localhost:8777 وفعّل المحاكي أولاً:');
  console.log("    localStorage.setItem('seen-hr:emulator','1')\n");
  process.exit(0);
}

main().catch((e) => { console.error('\n✗ فشل البذر:', e); process.exit(1); });
