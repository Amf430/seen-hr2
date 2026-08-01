/* ═══════════════════════════════════════════════════════════════════════════
   الراوتر — يربط معرّف الصفحة بدالة عرضها.

   هذه الوحدة الوحيدة التي تستورد الصفحات، ولا تستوردها أي صفحة. بهذا تبقى
   شجرة الاستيراد بلا دورات: الصفحات ← المكوّنات ← lib ← الأوراق الطرفية.

   ترتيب العرض مطابق للنسخة القديمة (السطور 798-820):
     تنظيف الصفحة السابقة ← رمز عرض جديد ← الترويسة ← تفريغ ← عرض
   ═══════════════════════════════════════════════════════════════════════════ */

import { $ } from '../lib/dom.js';
import { getMe } from '../lib/state.js';
import { beginRender, onNavigate, getPage, initFromHash, go } from '../lib/nav.js';
import { cleanupPage } from '../lib/lifecycle.js';
import { setPageHeader, setActiveNav } from './shell.js';
import { canOpen } from '../config/pages.js';

import * as dashboard      from '../pages/dashboard.js';
import * as homeEmployee   from '../pages/home-employee.js';
import * as attend         from '../pages/attend.js';
import * as requestNew     from '../pages/request-new.js';
import * as requestsMine   from '../pages/requests-mine.js';
import * as inbox          from '../pages/inbox.js';
import * as employees      from '../pages/employees.js';
import * as employeeProfile from '../pages/employee-profile.js';
import * as orgChart       from '../pages/org-chart.js';
import * as attendanceLog  from '../pages/attendance-log.js';
import * as payroll        from '../pages/payroll.js';
import * as monthly        from '../pages/monthly.js';
import * as reports        from '../pages/reports.js';
import * as audit          from '../pages/audit.js';
import * as setBranches    from '../pages/settings/branches.js';
import * as setOrg         from '../pages/settings/departments.js';
import * as setShifts      from '../pages/settings/shifts.js';
import * as setRequests    from '../pages/settings/leave-types.js';
import * as setPayroll     from '../pages/settings/payroll-config.js';

const RENDERERS = {
  attend:         attend.render,
  new:            requestNew.render,
  mine:           requestsMine.render,
  inbox:          inbox.render,
  employees:      employees.render,
  profile:        employeeProfile.render,
  org:            orgChart.render,
  attendance:     (v, t) => attendanceLog.render(v, t, { coll: 'attendance',   isDevice: false }),
  zklog:          (v, t) => attendanceLog.render(v, t, { coll: 'zkAttendance', isDevice: true  }),
  payroll:        payroll.render,
  monthly:        monthly.render,
  reports:        reports.render,
  audit:          audit.render,
  'set-branches': setBranches.render,
  'set-org':      setOrg.render,
  'set-shifts':   setShifts.render,
  'set-requests': setRequests.render,
  'set-payroll':  setPayroll.render
};

async function render() {
  const page = getPage();
  const me = getMe();
  if (!me) return;

  cleanupPage();
  const token = beginRender();
  setActiveNav();
  setPageHeader(page);

  const view = $('#view');
  view.innerHTML = '';
  /* ⚠️ #view ليست حاوية التمرير — المستند هو الذي يتمرّر، فـ view.scrollTop
     كتابة بلا أثر. الموظف كان ينتقل لصفحة الحضور فيجدها مُمرَّرة لأسفل، تحت
     زر «تسجيل حضور» مباشرة، فيظن أن الزر غير موجود. */
  window.scrollTo(0, 0);

  /* الرئيسية تختلف حسب الدور */
  let fn = (page === 'home')
    ? (me.role === 'admin' ? dashboard.render : homeEmployee.render)
    : RENDERERS[page];

  /* صفحة لا يملكها هذا الدور، أو معرّف مكتوب يدوياً في العنوان — نرجعه
     للرئيسية بدل شاشة فارغة. للترتيب فقط؛ المنع الحقيقي في firestore.rules.

     ⚠️ go() لا مجرّد استبدال الدالة: بعد أن صارت الصفحة في العنوان، ترك
     الـ hash على صفحة ممنوعة يعني أن التحديث التالي يعيد المحاولة نفسها،
     وأن الترويسة والقائمة الجانبية تشيران لصفحة غير المعروضة. */
  if (!fn || (page !== 'home' && !canOpen(page, me.role))) {
    go('home');
    return;
  }

  try {
    await fn(view, token);
  } catch (e) {
    console.error('render:' + page, e);
    view.innerHTML = '<div class="card"><div class="empty">تعذّر عرض هذه الصفحة. حدّث الصفحة وحاول مرة ثانية.</div></div>';
  }
}

export function startRouter() {
  onNavigate(render);
  initFromHash('home');   /* يُكمل من حيث وقف المستخدم قبل التحديث */
  render();
}
