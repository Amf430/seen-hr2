import { el, esc, toast } from '../lib/dom.js';
import { getRequests, getUsers } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { cycleOf, ymdKsa } from '../lib/dates.js';
import { hm } from '../lib/format.js';
import { fetchAttendance, buildDailyStatus } from '../lib/attendance.js';
import { adjustmentsInRange, adjustedPayrollAttendance } from '../lib/adjustments.js';
import {
  ATTENDANCE_REPORT_SOURCE, attendanceReportRows, reportPayrollSource
} from '../lib/attendance-report.js';
import { attendanceReportExport } from '../lib/excel.js';
import { isStale } from '../lib/nav.js';
import { button, card, empty, pageHead, sectionHead, tableWrap } from '../lib/ui.js';

const SOURCE_LABELS = Object.freeze({
  [ATTENDANCE_REPORT_SOURCE.DEVICE]: 'جهاز البصمة',
  [ATTENDANCE_REPORT_SOURCE.MOBILE]: 'الجوال',
  [ATTENDANCE_REPORT_SOURCE.MERGED]: 'مدموج'
});

const rangeOf = (fromDate, toDate) => ({
  start: new Date(`${fromDate}T00:00:00`),
  end: new Date(`${toDate}T23:59:59.999`),
  key: `${fromDate}_${toDate}`,
  label: `${fromDate} ← ${toDate}`
});

const sourceTagged = (rows, coll) => (rows || []).map((r) => ({
  ...r, source: r.source || coll
}));

export async function render(view, token) {
  view.appendChild(pageHead('تقارير الحضور والانصراف',
    'تقرير إداري حسب الفترة والمصدر — بنفس حسابات الحضور والمسير الحالية.'));

  const current = cycleOf(new Date());
  const today = ymdKsa();
  const filters = card('خيارات التقرير');
  filters.innerHTML += `
    <div class="filters filters--tidy">
      <div class="field"><label for="arFromDate">من تاريخ</label>
        <input id="arFromDate" type="date" value="${esc(ymdKsa(current.start))}"></div>
      <div class="field"><label for="arToDate">إلى تاريخ</label>
        <input id="arToDate" type="date" value="${esc(today)}"></div>
      <div class="field"><label for="arFromTime">من الوقت <span class="muted">(اختياري)</span></label>
        <input id="arFromTime" type="time"></div>
      <div class="field"><label for="arToTime">إلى الوقت <span class="muted">(اختياري)</span></label>
        <input id="arToTime" type="time"></div>
      <div class="field"><label for="arDepartment">القسم</label>
        <select id="arDepartment"><option value="">كل الأقسام</option></select></div>
      <div class="field"><label for="arEmployee">الموظف</label>
        <select id="arEmployee"><option value="">كل الموظفين</option></select></div>
      <div class="field"><label for="arSource">المصدر</label>
        <select id="arSource">
          <option value="device">جهاز البصمة</option>
          <option value="mobile">الجوال</option>
          <option value="merged" selected>مدموج</option>
        </select></div>
      <div class="field"><label for="arStatus">الحالة <span class="muted">(اختياري)</span></label>
        <select id="arStatus">
          <option value="">كل الحالات</option>
          <option value="present">حاضر</option><option value="late">متأخر</option>
          <option value="absent">غائب</option><option value="leave">إجازة</option>
          <option value="missing">نسيان بصمة الخروج</option>
          <option value="missingIn">نسيان بصمة الحضور</option>
        </select></div>
    </div>`;
  const actions = el('div', 'actions');
  const showBtn = button('عرض التقرير', 'btn', null, 'chart');
  const excelBtn = button('تحميل Excel', 'btn secondary', null, 'download');
  excelBtn.disabled = true;
  actions.append(showBtn, excelBtn);
  filters.appendChild(actions);
  filters.appendChild(el('p', 'help',
    'فلتر الوقت يطبّق «من» على الدخول الرسمي و«إلى» على الخروج الرسمي. الأوقات الفعلية تبقى في الملاحظة عند تعديلها باستئذان معتمد.'));
  view.appendChild(filters);

  const host = el('div');
  view.appendChild(host);

  const $ = (selector) => filters.querySelector(selector);
  const fromDate = $('#arFromDate'), toDate = $('#arToDate');
  const fromTime = $('#arFromTime'), toTime = $('#arToTime');
  const department = $('#arDepartment'), employee = $('#arEmployee');
  const source = $('#arSource'), status = $('#arStatus');
  let reportRows = [];

  const availableUsers = () => getUsers().filter((u) => u.role !== 'admin');
  function fillDepartments() {
    const selected = department.value;
    const names = [...new Set(availableUsers().map((u) => u.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    department.innerHTML = '<option value="">كل الأقسام</option>' +
      names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    department.value = names.includes(selected) ? selected : '';
  }
  function fillEmployees() {
    const selected = employee.value;
    const users = availableUsers()
      .filter((u) => !department.value || u.department === department.value)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    employee.innerHTML = '<option value="">كل الموظفين</option>' + users.map((u) =>
      `<option value="${esc(u.id)}">${esc(u.name)}${u.empId ? ` — ${esc(u.empId)}` : ''}</option>`).join('');
    employee.value = users.some((u) => u.id === selected) ? selected : '';
  }

  try {
    await refreshUsers();
    if (isStale(token)) return;
    fillDepartments();
    fillEmployees();
  } catch (e) {
    console.error(e);
    toast('تعذّر تحميل قائمة الموظفين', 'err');
  }
  department.onchange = fillEmployees;

  function drawRows(rows, label) {
    host.innerHTML = '';
    const box = card('');
    box.appendChild(sectionHead(`نتائج التقرير — ${label}`));
    box.appendChild(el('p', 'desc', `${rows.length} نتيجة · المصدر: ${SOURCE_LABELS[source.value]}`));
    if (!rows.length) box.appendChild(empty('لا بيانات مطابقة للفلاتر', 'clock'));
    else box.appendChild(tableWrap(`
      <table>
        <thead><tr>
          <th>الموظف</th><th>الرقم الوظيفي</th><th>القسم</th><th>التاريخ</th><th>اليوم</th>
          <th>الوردية</th><th>الدخول</th><th>مصدر الدخول</th><th>الخروج</th><th>مصدر الخروج</th>
          <th>ساعات العمل</th><th>الحالة</th><th>الاستئذان</th><th>الملاحظة</th>
        </tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td><b>${esc(r.employee)}</b></td><td class="num">${esc(r.employeeId || '—')}</td>
          <td>${esc(r.department || '—')}</td><td class="num">${esc(r.date)}</td><td>${esc(r.day)}</td>
          <td>${r.shiftStart && r.shiftEnd
            ? `${esc(r.shiftName)} <bdi dir="ltr">${esc(r.shiftStart)}–${esc(r.shiftEnd)}</bdi>`
            : esc(r.shift || '—')}</td>
          <td class="num text-green">${r.officialIn ? hm(r.officialIn) : '—'}</td><td>${esc(r.inSource || '—')}</td>
          <td class="num text-red">${r.officialOut ? hm(r.officialOut) : '—'}</td><td>${esc(r.outSource || '—')}</td>
          <td class="num">${esc(r.workedHours)}</td>
          <td><span class="pill pill--dot ${esc(r.statusClass)}">${esc(r.status)}</span></td>
          <td>${esc(r.permission || '—')}</td>
          <td class="cell-note"><div class="truncate" title="${esc(r.note)}">${esc(r.note || '—')}</div></td>
        </tr>`).join('')}</tbody>
      </table>`));
    host.appendChild(box);
  }

  showBtn.onclick = async () => {
    if (!fromDate.value || !toDate.value || fromDate.value > toDate.value) {
      toast('تحقق من نطاق التاريخ', 'err'); return;
    }
    showBtn.disabled = true;
    excelBtn.disabled = true;
    host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ إعداد التقرير…</div></div>';
    try {
      await refreshUsers();
      const users = getUsers();
      const range = rangeOf(fromDate.value, toDate.value);
      const wantsDevice = source.value !== ATTENDANCE_REPORT_SOURCE.MOBILE;
      const wantsMobile = source.value !== ATTENDANCE_REPORT_SOURCE.DEVICE;
      const [physicalRaw, mobileRaw, adjustments] = await Promise.all([
        wantsDevice ? fetchAttendance(range, 'zkAttendance') : Promise.resolve([]),
        wantsMobile ? fetchAttendance(range, 'attendance') : Promise.resolve([]),
        adjustmentsInRange(fromDate.value, toDate.value)
      ]);
      if (isStale(token)) return;
      const physical = sourceTagged(physicalRaw, 'zkAttendance');
      const mobile = sourceTagged(mobileRaw, 'attendance');
      const records = adjustedPayrollAttendance(users,
        { attendanceSource: reportPayrollSource(source.value) }, physical, mobile, adjustments);
      const days = buildDailyStatus(range, users, getRequests(), records, { compensate: true });
      reportRows = attendanceReportRows(days, {
        fromDate: fromDate.value, toDate: toDate.value,
        fromTime: fromTime.value, toTime: toTime.value,
        department: department.value, employeeUid: employee.value, status: status.value
      });
      drawRows(reportRows, range.label);
      excelBtn.disabled = !reportRows.length;
    } catch (e) {
      console.error(e);
      reportRows = [];
      host.innerHTML = '<div class="card"><div class="empty">تعذّر إعداد التقرير — أعد المحاولة</div></div>';
      toast('تعذّر إعداد تقرير الحضور', 'err');
    } finally {
      showBtn.disabled = false;
    }
  };

  excelBtn.onclick = () => attendanceReportExport(reportRows, {
    fromDate: fromDate.value, toDate: toDate.value
  });
}
