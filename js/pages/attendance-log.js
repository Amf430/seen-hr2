import { el, esc, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { db, doc, getDoc } from '../lib/firebase.js';
import { getUsers, getRequests } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList, ymd, AR_DAYS } from '../lib/dates.js';
import { fmtDur, hm, fmtDT, fmtDist, tsToDate } from '../lib/format.js';
import { fetchAttendance, flattenSessions, buildDailyStatus, sessionsOf } from '../lib/attendance.js';
import { attendanceExport } from '../lib/excel.js';
import { locCell, openSessionDetail } from '../components/location-view.js';
import { REMOTE_LABEL } from '../lib/geo.js';
import { isStale, rerender } from '../lib/nav.js';
import { photoUsage, purgePhotosBefore } from '../lib/photo.js';
import { adjustmentsInRange, applyAll } from '../lib/adjustments.js';
import { openTypedConfirm } from '../components/review-modals.js';
import { logAction } from '../lib/audit.js';
import { card, empty, tableWrap, sectionHead, button, callout, pageHead } from '../lib/ui.js';

/* المصدران — تعريف واحد يُشتقّ منه كل شيء */
const SOURCES = [
  { key: 'web',    coll: 'attendance',   isDevice: false, label: 'من الجوال',
    ico: 'globe',  hint: 'تسجيل ذاتي بالموقع الجغرافي وبصمة الجهاز' },
  { key: 'device', coll: 'zkAttendance', isDevice: true,  label: 'جهاز البصمة',
    ico: 'finger', hint: 'سجل قادم من جهاز ZKTeco عبر الجسر — لا يعدّله أحد' }
];

export async function render(view, token, opt) {
  const cycles = recentCyclesList(12);

  /* ⚠️ صفحة واحدة لمصدرين — طلب المالك (٢٠٢٦-٠٨-١٣).
     كانتا صفحتين منفصلتين في الشريط الجانبي، والأدمن يقارن بينهما باستمرار:
     من بصم على الجهاز ولم يسجّل من جواله، والعكس. الانتقال بينهما كان يعني
     مغادرة الصفحة وفقدان الفرز المضبوط.

     ⚠️ المصدران يبقيان **مستقلّين تماماً** في البيانات: مجموعتان مختلفتان،
     وقاعدة zkAttendance تمنع الكتابة على السيرفر (`allow write: if false`).
     الدمج في العرض وحده — ولا يُفهم منه أن أحدهما يُغني عن الآخر.

     إعادة العرض كاملةً عند التبديل: الصفحة بلا مؤقّتات ولا اشتراكات
     (تحقّقتُ)، فلا شيء يتسرّب. والرمز token يبقى صالحاً لأننا لم ننتقل. */
  let src = SOURCES.find((s) => s.isDevice === !!opt.isDevice) || SOURCES[0];
  opt = { coll: src.coll, isDevice: src.isDevice };

  view.appendChild(pageHead('سجلات الحضور',
    'مصدران مستقلّان — الجوال وجهاز البصمة. لا يُغني أحدهما عن الآخر.'));

  const srcBar = el('div', 'viewtoggle viewtoggle--wide');
  srcBar.setAttribute('role', 'group');
  srcBar.setAttribute('aria-label', 'مصدر السجلات');
  for (const s of SOURCES) {
    const on = s.key === src.key;
    const b = el('button', 'viewtoggle__btn' + (on ? ' is-on' : ''), icon(s.ico) + esc(s.label));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    if (!on) b.onclick = () => { view.innerHTML = ''; render(view, token, { isDevice: s.isDevice }); };
    srcBar.appendChild(b);
  }
  view.appendChild(srcBar);

  const head = card(null, src.hint,
    opt.isDevice
      ? 'سجلات قادمة من جهاز ZKTeco عبر الجسر — لا يستطيع الموظف تعديلها. مستقلة تماماً عن تسجيل الجوال.'
      : 'سجلات يسجّلها الموظف بنفسه من جواله (موقع جغرافي + بصمة جهازه). مستقلة تماماً عن جهاز ZKTeco.');

  /* ⚠️ الشهر باسمه لا بمدى الدورة. كانت القائمة تقول «26 يوليو ← 25 أغسطس
     2026 (الحالية)» — ٣٠ محرفاً تشرح تعريف الدورة في كل خيار، بينما الأدمن
     يبحث عن شهر. تعريف الدورة مكتوب مرّةً تحت الاختيار لمن يحتاجه.
     cycleName يأخذ اسم الشهر الذي **تنتهي** فيه الدورة: دورة ٢٦ يوليو ←
     ٢٥ أغسطس هي «أغسطس» عند من يديرها، لا «يوليو». */
  const cycleName = (c) => {
    const e = new Date(c.end);
    return e.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' });
  };

  const controls = el('div', 'filters filters--tidy');
  controls.innerHTML = `
    <div class="field"><label for="atCyc">الشهر</label>
      <select id="atCyc">${cycles.map((c, i) =>
        `<option value="${i}">${esc(cycleName(c))}${i === 0 ? ' — الحالي' : ''}</option>`).join('')}</select></div>
    <div class="field"><label for="atEmp">الموظف</label><select id="atEmp"><option value="">كل الموظفين</option></select></div>
    <div class="field"><label for="atStatus">الحالة</label>
      <select id="atStatus">
        <option value="">كل الحالات</option>
        <option value="present">حاضر</option><option value="late">متأخر</option>
        <option value="absent">غائب</option><option value="leave">إجازة</option>
        <option value="missing">نسيان بصمة</option>
      </select></div>
    <div class="field grow"><label for="atSearch">بحث</label><input id="atSearch" placeholder="اسم أو رقم وظيفي…"></div>`;
  head.appendChild(controls);

  /* الصفّ الثاني: ما يُستعمل أقلّ — طريقة العرض ويوم محدّد والاختصارات */
  const more = el('div', 'filters filters--tidy filters--sub');
  more.innerHTML = `
    <div class="field"><label for="atMode">طريقة العرض</label>
      <select id="atMode">
        <option value="daily">التقرير اليومي</option>
        <option value="sessions">دخول وخروج تفصيلي</option>
      </select></div>
    <div class="field"><label for="atDate">يوم محدّد</label><input id="atDate" type="date"></div>`;
  const quick = el('div', 'chipbar');
  const bToday = button('اليوم', 'btn sm ghost', null, 'calendar');
  const bYest  = button('أمس', 'btn sm ghost', null, 'calendar');
  const bClear = button('مسح الفرز', 'btn sm ghost', null, 'x');
  quick.append(bToday, bYest, bClear);
  more.appendChild(quick);
  head.appendChild(more);
  head.appendChild(el('p', 'help',
    'الدورة الشهرية من ٢٦ إلى ٢٥ — الشهر المعروض هو الذي تُقفل فيه الدورة.'));
  view.appendChild(head);

  if (opt.isDevice) bridgeStatusCard(view);
  else photoUsageCard(view, cycles);

  const host = el('div', '');
  view.appendChild(host);

  /* ⚠️ الحقول موزّعة على صفّين (controls و more) بعد ترتيب الفرز — البحث في
     head يشملهما معاً. البحث في controls وحده كان يُرجع null لحقلَي «طريقة
     العرض» و«يوم محدّد» فتسقط الصفحة عند أول قراءة لقيمتهما. */
  const $c = (s) => head.querySelector(s);
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
    /* صفحة أدمن — التعويض يُطبَّق هنا ولا يُطبَّق في «أدائي» عند الموظف */
    let rows = buildDailyStatus(cyc, getUsers(), getRequests(), recs, { compensate: true });
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
        /* ── التصحيحات تُقرأ فوق الأصل ──
           ⚠️ بدون هذا كان السجل يعرض الوقت الخاطئ بعد تصحيحه: القيد يُحفظ
           فعلاً ويُطبَّق في المسير، لكن الشاشة التي صحّح منها الأدمن تبقى على
           حالها — فيظنّ أن الحفظ فشل ويكرّره. المسير كان الشاشة الوحيدة
           التي تطبّقها (payroll.js). */
        try {
          const adjs = await adjustmentsInRange(ymd(cyc.start), ymd(cyc.end));
          recs = applyAll(recs, adjs.filter((a) => a.coll === opt.coll));
        } catch (e) { console.error('adjustments', e); }
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
      button('تصدير المعروض (Excel)', 'btn sm',
        () => attendanceExport(cyc, opt, isDaily ? rows : null, isDaily ? null : rows))));

    const bits = [];
    if (ddEmp.value) { const u = getUsers().find((x) => x.id === ddEmp.value); bits.push('الموظف: ' + (u ? u.name : '—')); }
    if (inDate.value) bits.push('اليوم: ' + inDate.value);
    if (isDaily && ddStat.value) bits.push('الحالة: ' + ddStat.options[ddStat.selectedIndex].text);
    c.appendChild(el('p', 'desc', `${rows.length} نتيجة${bits.length ? ' · فرز: ' + bits.join(' · ') : ''}`));

    if (!rows.length) c.appendChild(empty('لا بيانات مطابقة للفرز الحالي', isDaily ? 'calendar' : 'clock'));
    else if (isDaily) {
      /* ── التقرير اليومي قابل للنقر أيضاً ──
         هنا وحده تظهر الحالة (حاضر/متأخر/غائب/نسيان بصمة)، فهنا يكتشف الأدمن
         الخطأ. كان التصحيح متاحاً في العرض التفصيلي فقط — أي أن الشاشة التي
         تُظهر المشكلة غير الشاشة التي تحلّها، ولا شيء يربطهما.

         ⚠️ «غائب» بلا سجل إطلاقاً لا يُفتح: لا جلسة تُصحَّح. تسجيل حضور لم
         يُبصم أصلاً عملٌ آخر، ولو فُتحت النافذة لعرضت جلسة فارغة بلا معنى. */
      const openIdxOf = (r) => {
        const ss = sessionsOf(r.rec);
        const i = ss.findIndex((s) => !s.out);
        return i === -1 ? Math.max(0, ss.length - 1) : i;
      };
      const wrap = tableWrap(`
        <table>
          <thead><tr><th>الموظف</th><th class="num">الرقم الوظيفي</th><th class="num">التاريخ</th><th>اليوم</th><th>الحالة</th><th class="num">دخول</th><th class="num">خروج</th><th class="num">الساعات</th><th>ملاحظة</th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const can = sessionsOf(r.rec).length > 0;
            return `<tr${can ? ` data-daily="${i}" class="is-clickable"` : ''}>
            <td><b>${esc(r.u.name)}</b></td><td class="num">${esc(r.u.empId || '—')}</td>
            <td class="num">${esc(r.dateStr)}</td><td>${AR_DAYS[r.dow]}</td>
            <td><span class="pill pill--dot ${esc(r.cls)}">${esc(r.status)}</span></td>
            <td class="num text-green">${r.firstIn ? hm(r.firstIn) : '—'}</td>
            <td class="num text-red">${r.lastOut ? hm(r.lastOut) : '—'}</td>
            <td class="num">${r.secs > 0 ? fmtDur(r.secs) : '—'}</td>
            <td class="cell-sub">${esc(r.note || '')}</td></tr>`;
          }).join('')}</tbody>
        </table>`);
      wrap.querySelectorAll('tr[data-daily]').forEach((tr) => {
        tr.onclick = () => {
          const r = rows[+tr.dataset.daily];
          openSessionDetail(r.rec, openIdxOf(r), opt.isDevice);
        };
      });
      c.appendChild(wrap);
      c.appendChild(el('p', 'help',
        'اضغط أي صف لعرض تفصيله وتصحيحه يدوياً. الصفوف بلا أي بصمة لا تُفتح.'));
    }
    else {
      /* ⚠️ عمودا «الموقع» و«إثبات» جديدان، وأُضيفا قبل «المصدر» عمداً:
         تصدير Excel يبني أعمدته في lib/excel.js بترتيبه المستقل، فترتيب
         الشاشة لا يمسّ ملفات المالك الجاهزة. */
      const wrap = tableWrap(`
        <table>
          <thead><tr><th>الموظف</th><th class="num">الرقم الوظيفي</th><th class="num">التاريخ</th><th>اليوم</th><th class="num">#</th><th>الفرع</th><th class="num">دخول</th><th class="num">خروج</th><th class="num">المدة</th>${
            opt.isDevice ? '' : '<th>الموقع</th><th>إثبات</th>'}<th>المصدر</th></tr></thead>
          <tbody>${rows.map((row, i) => {
            const s = row.s || {};
            const dur = (s.in && s.out) ? fmtDur((tsToDate(s.out) - tsToDate(s.in)) / 1000)
                      : (s.in ? '<span class="text-green">مفتوحة</span>' : '—');
            const isDev = (s.source || row.r.source || (opt.isDevice ? 'device' : 'web')) === 'device';
            const place = opt.isDevice ? 'جهاز البصمة'
              : (s.inBranchName || row.r.branchName || (s.inMode === 'remote' ? 'عن بُعد' : '—'));
            const outside = !opt.isDevice && (s.inMode === 'remote' ||
              (s.inDist != null && s.inBranchName === REMOTE_LABEL));
            /* علامة التصحيح — الأصل مُصحَّح، والقارئ يجب أن يعرف */
            const mark = (f) => s[f + 'Adjusted'] ? '<span class="adj-mark" title="صُحِّح يدوياً">مُصحَّح</span>' : '';
            return `<tr data-row="${i}" class="is-clickable">
              <td><b>${esc(row.r.employeeName)}</b></td><td class="num">${esc(row.r.employeeEmpId || '—')}</td>
              <td class="num">${esc(row.r.date)}</td><td>${AR_DAYS[row.r.dow] || ''}</td>
              <td class="num">${row.idx + 1}</td>
              <td>${esc(place)}${outside ? ' <span class="pill pill--dot missing">خارج النطاق</span>' : ''}</td>
              <td class="num text-green">${s.in ? hm(s.in) : '—'}${mark('in')}</td>
              <td class="num text-red">${s.out ? hm(s.out) : '—'}${mark('out')}</td>
              <td class="num">${dur}</td>
              ${opt.isDevice ? '' : `<td>${locCell(s.inLoc, s.inDist)}</td>
              <td>${(s.inPhoto || s.outPhoto)
                ? '<span class="pill pill--dot active">صورة</span>'
                : '<span class="muted">—</span>'}</td>`}
              <td class="cell-sub">${isDev ? 'الجهاز' : 'الجوال'}</td></tr>`;
          }).join('')}</tbody>
        </table>`);

      /* الصف كله يفتح التفصيل — عدا ضغط رابط الخريطة نفسه.
         ⚠️ كان مشروطاً بـ !opt.isDevice، فكانت صفوف جهاز البصمة غير قابلة
         للنقر إطلاقاً — ومعها زرّ «تصحيح يدوي» داخل النافذة. أي أن أكثر
         الحالات حاجةً للتصحيح (موظف نسي بصمة الانصراف على الجهاز) كانت
         الحالة الوحيدة التي لا يُوصل إليها. نافذة التفصيل تتعامل مع
         isDevice أصلاً وتمرّر 'zkAttendance' للتصحيح — كانت جاهزة ولم تُوصَل. */
      wrap.querySelectorAll('tr[data-row]').forEach((tr) => {
        tr.onclick = (e) => {
          if (e.target.closest('a')) return;
          const row = rows[+tr.dataset.row];
          openSessionDetail(row.r, row.idx, opt.isDevice);
        };
      });
      c.appendChild(wrap);
    }
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
    c.innerHTML = `<h3>حالة جسر البصمة</h3>
      <div class="callout callout--warn"><b class="callout__title">لم يُسجّل الجسر أي نبض بعد</b>
      <div class="help">شغّل <b>zk_bridge.py</b> على الكمبيوتر المتصل بشبكة الجهاز.</div></div>`;
    return;
  }

  const last = d.lastRun && d.lastRun.toDate ? d.lastRun.toDate() : null;
  const mins = last ? Math.round((Date.now() - last.getTime()) / 60000) : 9999;
  const alive = mins < 15;
  const unk = d.unknownIds || [];

  c.innerHTML = `<h3>حالة جسر البصمة</h3>
    <div class="detail-list">
      <div class="detail-line"><span class="k">الجسر</span><span class="v ${alive ? 'text-green' : 'text-red'}">${alive ? 'يعمل' : 'متوقّف أو منقطع'}</span></div>
      <div class="detail-line"><span class="k">آخر نبض</span><span class="v">${last ? fmtDT(last) + ` (قبل ${mins} دقيقة)` : '—'}</span></div>
      <div class="detail-line"><span class="k">الاتصال بالجهاز</span><span class="v ${d.deviceOk ? 'text-green' : 'text-red'}">${d.deviceOk ? 'ناجح' : '❌ فاشل'}</span></div>
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

/* ═══════════════════════════════════════════════════════════════════════════
   استهلاك صور إثبات الموقع.

   ⚠️ سبب وجود هذه البطاقة: الصور تُخزَّن في Firestore لا في Storage (الأخير
   يشترط خطة Blaze المدفوعة). الحدّ المجاني غيغابايت واحد، والصور تنمو بلا
   سقف طبيعي — بلا لوحة تُظهر الاستهلاك يمتلئ الحدّ بصمت ويتوقّف النظام كله
   عن الكتابة، لا الصور وحدها.

   الحذف بضغطة الأدمن لا تلقائياً: لا رجعة فيه، والقرار له لا للكود.
   ═══════════════════════════════════════════════════════════════════════════ */
const FREE_TIER_BYTES = 1024 * 1024 * 1024;   /* ١ غيغابايت */
const mb = (b) => (b / 1048576).toFixed(1);

async function photoUsageCard(view, cycles) {
  const c = card('صور إثبات الموقع', 'تُلتقط ممن يسجّل خارج نطاق فرعه أو بوضع «من أي مكان».', 'camera');
  const host = el('div', '', '<div class="empty"><span class="spinner"></span> جارٍ حساب المساحة…</div>');
  c.appendChild(host);
  view.appendChild(c);

  let u;
  try { u = await photoUsage(); }
  catch (e) { console.error(e); host.innerHTML = '<p class="help">تعذّر قراءة مخزون الصور.</p>'; return; }

  /* أقدم دورة نُبقيها — كل ما قبلها قابل للحذف */
  const keepFrom = cycles[Math.min(2, cycles.length - 1)];
  const cutoff = ymd(keepFrom.start);
  const pct = Math.min(100, (u.bytes / FREE_TIER_BYTES) * 100);

  host.innerHTML = `
    <div class="usage">
      <div>
        <b class="num">${u.count}</b> صورة · <b class="num">${mb(u.bytes)}</b> م.ب
        <div class="help">من أصل ١٠٢٤ م.ب في الحدّ المجاني (${pct.toFixed(1)}٪)</div>
      </div>
      <div class="usage__bar"><i style="width:${Math.max(1, pct)}%"></i></div>
    </div>`;

  host.appendChild(button(`حذف الصور الأقدم من ${cutoff}`, 'btn sm ghost', () => {
    openTypedConfirm({
      title: 'حذف صور الدورات القديمة',
      body: `تُحذف كل صورة إثبات قبل <b>${esc(cutoff)}</b> — أي ما قبل الدورات الثلاث الأخيرة.<br><br>
             سجلات الحضور نفسها والمواقع الجغرافية <b>لا تُمسّ</b>. الصور وحدها.`,
      phrase: 'حذف',
      confirmLabel: 'حذف الصور القديمة',
      run: async () => {
        const n = await purgePhotosBefore(cutoff);
        await logAction('حذف صور إثبات قديمة', `${n} صورة قبل ${cutoff}`);
        toast(`حُذفت ${n} صورة`, 'ok');
        rerender();
      }
    });
  }, 'trash'));

  if (pct > 60) host.appendChild(callout('warn', 'المخزون تجاوز ٦٠٪ من الحدّ المجاني',
    'احذف الصور القديمة — امتلاء الحدّ يوقف كل كتابة في النظام لا الصور وحدها.'));
}
