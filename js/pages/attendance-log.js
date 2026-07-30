import { el, esc } from '../lib/dom.js';
import { db, doc, getDoc } from '../lib/firebase.js';
import { getUsers, getRequests } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList, ymd, AR_DAYS } from '../lib/dates.js';
import { fmtDur, hm, fmtDT, fmtDist, tsToDate } from '../lib/format.js';
import { fetchAttendance, flattenSessions, buildDailyStatus, sessionsOf } from '../lib/attendance.js';
import { attendanceExport } from '../lib/excel.js';
import { isStale } from '../lib/nav.js';
import { card, empty, tableWrap, sectionHead, button } from '../lib/ui.js';

export async function render(view, token, opt) {
  const cycles = recentCyclesList(12);

  const head = card(
    opt.isDevice ? '🖐️ سجل جهاز البصمة' : '🌐 الحضور من الجوال',
    opt.isDevice
      ? 'سجلات قادمة من جهاز ZKTeco عبر الجسر — لا يستطيع الموظف تعديلها. مستقلة تماماً عن تسجيل الجوال.'
      : 'سجلات يسجّلها الموظف بنفسه من جواله (موقع جغرافي + بصمة جهازه). مستقلة تماماً عن جهاز ZKTeco.');

  const controls = el('div', 'filters');
  controls.innerHTML = `
    <div class="field"><label for="atCyc">الدورة الشهرية</label>
      <select id="atCyc">${cycles.map((c, i) => `<option value="${i}">${esc(c.label)}${i === 0 ? ' (الحالية)' : ''}</option>`).join('')}</select></div>
    <div class="field"><label for="atMode">طريقة العرض</label>
      <select id="atMode">
        <option value="daily">التقرير اليومي (حاضر/متأخر/غائب/إجازة)</option>
        <option value="sessions">سجل الدخول/الخروج التفصيلي</option>
      </select></div>
    <div class="field"><label for="atEmp">الموظف</label><select id="atEmp"><option value="">كل الموظفين</option></select></div>
    <div class="field"><label for="atDate">يوم محدّد</label><input id="atDate" type="date"></div>
    <div class="field"><label for="atStatus">الحالة</label>
      <select id="atStatus">
        <option value="">كل الحالات</option>
        <option value="present">حاضر</option><option value="late">متأخر</option>
        <option value="absent">غائب</option><option value="leave">إجازة</option>
        <option value="missing">نسيان بصمة</option>
      </select></div>
    <div class="field grow"><label for="atSearch">بحث حر</label><input id="atSearch" placeholder="🔍 اسم أو رقم وظيفي…"></div>`;
  head.appendChild(controls);

  const quick = el('div', 'chipbar');
  const bToday = button('📅 اليوم', 'btn sm ghost');
  const bYest  = button('📅 أمس', 'btn sm ghost');
  const bClear = button('✖️ مسح الفرز', 'btn sm ghost');
  quick.append(bToday, bYest, bClear);
  head.appendChild(quick);
  view.appendChild(head);

  if (opt.isDevice) bridgeStatusCard(view);

  const host = el('div', '');
  view.appendChild(host);

  const $c = (s) => controls.querySelector(s);
  const ddCyc = $c('#atCyc'), ddMode = $c('#atMode'), ddEmp = $c('#atEmp'),
        inDate = $c('#atDate'), ddStat = $c('#atStatus'), search = $c('#atSearch');

  let recs = [], loadedKey = '';

  function fillEmps() {
    const cur = ddEmp.value;
    const list = [...getUsers()].filter((u) => u.role !== 'admin')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    ddEmp.innerHTML = '<option value="">كل الموظفين</option>' +
      list.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}${u.empId ? ' — ' + esc(u.empId) : ''}</option>`).join('');
    ddEmp.value = cur;
  }
  const matchQ = (name, empId) => {
    const q = search.value.trim();
    if (!q) return true;
    return (name || '').includes(q) || String(empId || '').includes(q);
  };

  function dailyRows(cyc) {
    let rows = buildDailyStatus(cyc, getUsers(), getRequests(), recs);
    if (ddEmp.value)  rows = rows.filter((r) => r.u.id === ddEmp.value);
    if (inDate.value) rows = rows.filter((r) => r.dateStr === inDate.value);
    if (ddStat.value) rows = rows.filter((r) => r.cls === ddStat.value);
    return rows.filter((r) => matchQ(r.u.name, r.u.empId));
  }
  function sessRows() {
    let rows = flattenSessions(recs);
    if (ddEmp.value)  rows = rows.filter((x) => x.r.employeeUid === ddEmp.value);
    if (inDate.value) rows = rows.filter((x) => x.r.date === inDate.value);
    return rows.filter((x) => matchQ(x.r.employeeName, x.r.employeeEmpId));
  }

  async function draw() {
    const idx = +ddCyc.value, cyc = cycles[idx];
    const key = opt.coll + '#' + idx;
    if (key !== loadedKey) {
      host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ التحميل…</div></div>';
      try {
        await refreshUsers();
        recs = await fetchAttendance(cyc, opt.coll);
        loadedKey = key;
        fillEmps();
      } catch (e) {
        console.error(e);
        host.innerHTML = '<div class="card"><div class="empty">تعذّر التحميل — تأكد من نشر قواعد الأمان المحدّثة</div></div>';
        return;
      }
    }
    if (isStale(token)) return;

    host.innerHTML = '';
    const isDaily = ddMode.value === 'daily';
    ddStat.disabled = !isDaily;
    const rows = isDaily ? dailyRows(cyc) : sessRows();

    const c = card('');
    c.appendChild(sectionHead(
      `${isDaily ? 'التقرير اليومي' : 'سجل الدخول/الخروج'} — ${cyc.label}`,
      button('⬇️ تصدير المعروض (Excel)', 'btn sm',
        () => attendanceExport(cyc, opt, isDaily ? rows : null, isDaily ? null : rows))));

    const bits = [];
    if (ddEmp.value) { const u = getUsers().find((x) => x.id === ddEmp.value); bits.push('الموظف: ' + (u ? u.name : '—')); }
    if (inDate.value) bits.push('اليوم: ' + inDate.value);
    if (isDaily && ddStat.value) bits.push('الحالة: ' + ddStat.options[ddStat.selectedIndex].text);
    c.appendChild(el('p', 'desc', `${rows.length} نتيجة${bits.length ? ' · فرز: ' + bits.join(' · ') : ''}`));

    if (!rows.length) c.appendChild(empty('لا بيانات مطابقة للفرز الحالي', isDaily ? '🗓️' : '🕐'));
    else if (isDaily) c.appendChild(tableWrap(`
      <table>
        <thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>دخول</th><th>خروج</th><th>الساعات</th><th>ملاحظة</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td><b>${esc(r.u.name)}</b></td><td class="num">${esc(r.u.empId || '—')}</td>
          <td class="num">${esc(r.dateStr)}</td><td>${AR_DAYS[r.dow]}</td>
          <td><span class="pill ${esc(r.cls)}">${esc(r.status)}</span></td>
          <td class="num text-green">${r.firstIn ? hm(r.firstIn) : '—'}</td>
          <td class="num text-red">${r.lastOut ? hm(r.lastOut) : '—'}</td>
          <td class="num">${r.secs > 0 ? fmtDur(r.secs) : '—'}</td>
          <td class="cell-sub">${esc(r.note || '')}</td></tr>`).join('')}</tbody>
      </table>`));
    else c.appendChild(tableWrap(`
      <table>
        <thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>التاريخ</th><th>اليوم</th><th>#</th><th>الفرع</th><th>دخول</th><th>خروج</th><th>المدة</th><th>المصدر</th></tr></thead>
        <tbody>${rows.map((row) => {
          const s = row.s || {};
          const dur = (s.in && s.out) ? fmtDur((tsToDate(s.out) - tsToDate(s.in)) / 1000)
                    : (s.in ? '<span class="text-green">مفتوحة</span>' : '—');
          const isDev = (s.source || row.r.source || (opt.isDevice ? 'device' : 'web')) === 'device';
          const place = opt.isDevice ? 'جهاز البصمة'
            : (s.inBranchName || row.r.branchName || (s.inMode === 'remote' ? 'عن بُعد' : '—'));
          const dist = (!opt.isDevice && s.inDist != null) ? ` <span class="cell-sub">(${fmtDist(s.inDist)})</span>` : '';
          return `<tr>
            <td><b>${esc(row.r.employeeName)}</b></td><td class="num">${esc(row.r.employeeEmpId || '—')}</td>
            <td class="num">${esc(row.r.date)}</td><td>${AR_DAYS[row.r.dow] || ''}</td>
            <td class="num">${row.idx + 1}</td>
            <td>${esc(place)}${dist}</td>
            <td class="num text-green">${s.in ? hm(s.in) : '—'}</td>
            <td class="num text-red">${s.out ? hm(s.out) : '—'}</td>
            <td class="num">${dur}</td>
            <td class="cell-sub">${isDev ? '🖐️ الجهاز' : '🌐 الجوال'}</td></tr>`;
        }).join('')}</tbody>
      </table>`));
    host.appendChild(c);
  }

  const setDate = (d) => { inDate.value = ymd(d); draw(); };
  bToday.onclick = () => setDate(new Date());
  bYest.onclick  = () => { const d = new Date(); d.setDate(d.getDate() - 1); setDate(d); };
  bClear.onclick = () => { ddEmp.value = ''; inDate.value = ''; ddStat.value = ''; search.value = ''; draw(); };

  [ddCyc, ddMode, ddEmp, inDate, ddStat].forEach((x) => { x.onchange = draw; });
  search.oninput = draw;
  await draw();
}

/* بطاقة حالة الجسر — تظهر في صفحة جهاز البصمة فقط */
async function bridgeStatusCard(host) {
  const c = card('');
  c.innerHTML = '<div class="empty"><span class="spinner"></span> جارٍ قراءة حالة الجسر…</div>';
  host.appendChild(c);

  let d = null;
  try { const snap = await getDoc(doc(db, 'bridge', 'status')); d = snap.exists() ? snap.data() : null; }
  catch (e) { d = null; }

  if (!d) {
    c.innerHTML = `<h3>🔌 حالة جسر البصمة</h3>
      <div class="callout callout--warn"><b class="callout__title">لم يُسجّل الجسر أي نبض بعد</b>
      <div class="help">شغّل <b>zk_bridge.py</b> على الكمبيوتر المتصل بشبكة الجهاز.</div></div>`;
    return;
  }

  const last = d.lastRun && d.lastRun.toDate ? d.lastRun.toDate() : null;
  const mins = last ? Math.round((Date.now() - last.getTime()) / 60000) : 9999;
  const alive = mins < 15;
  const unk = d.unknownIds || [];

  c.innerHTML = `<h3>🔌 حالة جسر البصمة</h3>
    <div class="detail-list">
      <div class="detail-line"><span class="k">الجسر</span><span class="v ${alive ? 'text-green' : 'text-red'}">${alive ? '🟢 يعمل' : '🔴 متوقّف أو منقطع'}</span></div>
      <div class="detail-line"><span class="k">آخر نبض</span><span class="v">${last ? fmtDT(last) + ` (قبل ${mins} دقيقة)` : '—'}</span></div>
      <div class="detail-line"><span class="k">الاتصال بالجهاز</span><span class="v ${d.deviceOk ? 'text-green' : 'text-red'}">${d.deviceOk ? '✅ ناجح' : '❌ فاشل'}</span></div>
      <div class="detail-line"><span class="k">عنوان الجهاز</span><span class="v num">${esc(d.deviceIp || '—')}</span></div>
      <div class="detail-line"><span class="k">سجلات في الجهاز</span><span class="v num">${d.readCount != null ? d.readCount : '—'}</span></div>
      <div class="detail-line"><span class="k">رُفع في آخر دورة</span><span class="v num">${d.newCount != null ? d.newCount : '—'}</span></div>
      ${d.error ? `<div class="detail-line"><span class="k">آخر خطأ</span><span class="v text-red">${esc(d.error)}</span></div>` : ''}
    </div>
    ${unk.length ? `<div class="callout callout--warn mt-3">
      <b class="callout__title">أرقام بصمة غير مرتبطة بأي موظف</b>
      <div class="help"><b>${unk.map(esc).join('، ')}</b><br>
      افتح «ملفات الموظفين» واكتب الرقم في حقل «الرقم الوظيفي» للموظف الصحيح.</div></div>` : ''}`;
}

export { sessionsOf };
