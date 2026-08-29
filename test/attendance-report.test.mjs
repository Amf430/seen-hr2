import {
  ATTENDANCE_REPORT_SOURCE, attendanceReportRow, attendanceReportRows, reportPayrollSource
} from '../js/lib/attendance-report.js';

let pass = 0, fail = 0;
const eq = (name, expected, actual) => {
  const e = JSON.stringify(expected), a = JSON.stringify(actual);
  if (e === a) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      توقّعنا ${e}\n      وجاء   ${a}`); }
};

const at = (date, hm) => new Date(`${date}T${hm}:00`);
const day = (over = {}) => {
  const date = over.date || '2026-08-24';
  const firstIn = Object.hasOwn(over, 'firstIn') ? over.firstIn : at(date, '09:00');
  const lastOut = Object.hasOwn(over, 'lastOut') ? over.lastOut : at(date, '18:00');
  const source = over.source || 'zkAttendance';
  return {
    u: { id:over.uid || 'e1', name:over.name || 'سالم', empId:'104',
      department:over.department || 'المبيعات' },
    dateStr:date, dow:new Date(`${date}T00:00:00`).getDay(),
    shift:{ type:'morning', start:'09:00', end:'18:00' },
    firstIn, lastOut, effectiveOut:over.effectiveOut || lastOut,
    secs:over.secs ?? 8.63 * 3600, status:over.status || 'حاضر', cls:over.cls || 'present',
    lateMin:over.lateMin || 0,
    note:over.note || '', permissions:over.permissions || [],
    permissionIntervals:over.permissionIntervals || [],
    rec:{ employeeUid:over.uid || 'e1', employeeName:over.name || 'سالم', date, source,
      sessions:[{ in:firstIn, out:lastOut }], ...(over.rec || {}) }
  };
};

console.log('\n\x1b[1m═══ نموذج تقرير الحضور ═══\x1b[0m');

eq('مصادر الصفحة تُحوّل إلى اختيار الـpipeline الحالي',
  ['physical','mobile','both'], [
    reportPayrollSource(ATTENDANCE_REPORT_SOURCE.DEVICE),
    reportPayrollSource(ATTENDANCE_REPORT_SOURCE.MOBILE),
    reportPayrollSource(ATTENDANCE_REPORT_SOURCE.MERGED)
  ]);

const base = attendanceReportRow(day());
eq('صف التقرير يحمل الأعمدة الإدارية الأساسية', {
  employee:'سالم', employeeId:'104', department:'المبيعات', date:'2026-08-24',
  shift:'صباحي 09:00–18:00', inSource:'جهاز البصمة', outSource:'جهاز البصمة',
  hours:'08:38', status:'حاضر'
}, {
  employee:base.employee, employeeId:base.employeeId, department:base.department, date:base.date,
  shift:base.shift, inSource:base.inSource, outSource:base.outSource,
  hours:base.workedHours, status:base.status
});

const rows = [
  day(),
  day({ uid:'e2', name:'نورة', department:'المالية', date:'2026-08-25',
    firstIn:at('2026-08-25','14:00'), lastOut:at('2026-08-25','23:00'),
    source:'attendance', status:'متأخر', cls:'late' })
];
eq('فلتر الموظف', ['نورة'], attendanceReportRows(rows, { employeeUid:'e2' }).map((r) => r.employee));
eq('فلتر القسم', ['سالم'], attendanceReportRows(rows, { department:'المبيعات' }).map((r) => r.employee));
eq('فلتر التاريخ', ['نورة'], attendanceReportRows(rows,
  { fromDate:'2026-08-25', toDate:'2026-08-25' }).map((r) => r.employee));
eq('فلتر الحالة', ['نورة'], attendanceReportRows(rows, { status:'late' }).map((r) => r.employee));
eq('فلتر الوقت يستخدم الدخول والخروج الرسميين', ['نورة'], attendanceReportRows(rows,
  { fromTime:'13:00', toTime:'23:00' }).map((r) => r.employee));
eq('صف بلا دخول لا يمر من فلتر دخول بلا تخمين', 0,
  attendanceReportRows([day({ firstIn:null, lastOut:at('2026-08-24','18:00') })],
    { fromTime:'08:00' }).length);

const approved = day({
  firstIn:at('2026-08-24','09:29'), lastOut:at('2026-08-24','16:49'),
  effectiveOut:at('2026-08-24','18:00'),
  permissions:[
    { type:'permission', status:'approved', category:'تأخير عن الدوام',
      permissionKind:'late', startTime:'09:00', endTime:'09:46' },
    { type:'permission', status:'approved', category:'خروج مبكر',
      permissionKind:'early', startTime:'16:30', endTime:'18:00' }
  ],
  permissionIntervals:[
    { start:at('2026-08-24','09:00'), end:at('2026-08-24','09:46') },
    { start:at('2026-08-24','16:30'), end:at('2026-08-24','18:00') }
  ]
});
const approvedRow = attendanceReportRow(approved);
eq('الاستئذان يعرض الوقت الرسمي ويبقي actual في الملاحظة', {
  in:'09:00', out:'18:00', permission:'تأخير · خروج مبكر',
  note:'دخول فعلي 09:29 — خروج فعلي 16:49 — استئذان معتمد 09:00–09:46، 16:30–18:00'
}, {
  in:approvedRow.officialIn.toTimeString().slice(0,5),
  out:approvedRow.officialOut.toTimeString().slice(0,5),
  permission:approvedRow.permission, note:approvedRow.note
});
eq('بناء التقرير لا يغيّر البصمات الفعلية', ['09:29','16:49'], [
  approved.rec.sessions[0].in.toTimeString().slice(0,5),
  approved.rec.sessions[0].out.toTimeString().slice(0,5)
]);

eq('دقائق التأخير الخاضعة للخصم تأتي من lateMin النهائي لا من الملاحظة', [15, 0, 45], [
  attendanceReportRow(day({ lateMin:15, note:'تأخير خام 45 ومغطى 30' })).deductibleLateMinutes,
  attendanceReportRow(day({ lateMin:0, note:'مغطى بالكامل' })).deductibleLateMinutes,
  attendanceReportRow(day({ lateMin:45, note:'بلا استئذان' })).deductibleLateMinutes
]);

const missingOut = day({
  status:'نسيان بصمة الخروج', cls:'missing', lastOut:null,
  rec:{ sessions:[{ in:at('2026-08-24','09:00'), out:null }],
    __penaltyAdjustments:[{
      id:'p1', adjustmentType:'missingPunchPenalty', employeeUid:'e1', date:'2026-08-24',
      coll:'zkAttendance', sessionIdx:0, field:'out', action:'apply', penaltyMinutes:120,
      at:{ toMillis:()=>1 }
    }] }
});
const missingOutRow = attendanceReportRow(missingOut);
eq('التقرير يفصل خصم البصمة الناقصة ويختصر الملاحظة', {
  penalty:'02:00', minutes:120, note:'بصمة خروج مفقودة — تعديل إداري معتمد', out:null
}, {
  penalty:missingOutRow.missingPunchPenalty,
  minutes:missingOutRow.missingPunchPenaltyMinutes,
  note:missingOutRow.note,
  out:missingOut.rec.sessions[0].out
});

console.log(`\n${pass} ناجح، ${fail} فاشل`);
if (fail) process.exit(1);
