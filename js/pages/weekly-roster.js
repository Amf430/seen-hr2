import { el, esc, toast, openModal } from '../lib/dom.js';
import { getMe, getSettings, getUsers } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { shiftPlansOf, resolveShift } from '../lib/shifts.js';
import {
  fetchWeeklyRoster, saveWeeklyRosterDraft, submitWeeklyRoster,
  approveWeeklyRoster, returnWeeklyRoster
} from '../lib/weekly-roster-io.js';
import {
  ROSTER_DAYS, ROSTER_REST, ROSTER_STATUS, managedRosterDepartment,
  nextWeekStart, rosterDepartmentAt, weekEndOf
} from '../lib/weekly-roster.js';
import { AR_DAYS, ymdKsa } from '../lib/dates.js';
import { isStale } from '../lib/nav.js';
import { loadRequiredSource } from '../lib/required-source.js';
import { card, callout, empty, loading, pageHead, sectionHead, tableWrap, button } from '../lib/ui.js';

const STATUS_LABEL = {
  draft: 'مسودة', submitted: 'بانتظار الاعتماد', approved: 'معتمد', returned: 'معاد للتعديل'
};

/* option لا يقبل عناصر HTML، لذلك نعزل النطاق بعلامتَي LRI/PDI. أما
   الخلايا فتستخدم bdi صريحاً. القيم نفسها تبقى start ثم end بلا عكس. */
export const rosterTimeRangeText = (start, end) => `\u2066${start}–${end}\u2069`;
export const rosterTimeRangeHtml = (start, end) =>
  `<bdi class="num" dir="ltr">${esc(start || '')}–${esc(end || '')}</bdi>`;

function shiftLabel(sh) {
  if (!sh || sh.type === 'off') return esc(sh?.exLabel || 'راحة');
  const kind = sh.type === 'evening' ? 'مسائي' : 'صباحي';
  return `${kind} ${rosterTimeRangeHtml(sh.start, sh.end)}`;
}

const shiftWeek = (weekStart, delta) => {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

const dateForDow = (weekStart, dow) => {
  const d = new Date(`${weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + dow);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

const statusPill = (status) => `<span class="pill pill--dot ${
  status === 'approved' ? 'approved' : status === 'returned' ? 'rejected' : 'pending'}">${
  STATUS_LABEL[status] || 'غير محفوظ'}</span>`;

function planOptions(plans, dow, current) {
  const working = plans.filter((p) => p.active !== false && p.days?.[dow]
    && p.days[dow].type !== 'off' && p.days[dow].start && p.days[dow].end);
  return `<option value=""${!current ? ' selected' : ''}>الشفت الأساسي</option>
    <option value="${ROSTER_REST}"${current === ROSTER_REST ? ' selected' : ''}>راحة</option>
    ${working.map((p) => `<option value="${esc(p.id)}"${current === p.id ? ' selected' : ''}>${
      esc(p.name)} · ${rosterTimeRangeText(esc(p.days[dow].start), esc(p.days[dow].end))}</option>`).join('')}`;
}

function approvedLabel(day, fallback) {
  if (!day) return fallback;
  if (day.kind === 'rest') return 'راحة';
  return `${esc(day.planName || '')}<div class="cell-sub">${rosterTimeRangeHtml(day.start, day.end)}</div>`;
}

export async function render(view, token) {
  const me = getMe(), S = getSettings();
  const managerDepartment = managedRosterDepartment(me, S);
  const manager = !!managerDepartment;
  const admin = me.role === 'admin';
  const departments = (S.departments || []).map((_, i) => rosterDepartmentAt(S, i)).filter(Boolean);
  view.appendChild(pageHead('جدول المناوبات الأسبوعي', 'Override اختياري للقسم فوق الشفت الرسمي'));

  if (!admin && !manager) {
    view.appendChild(callout('info', 'إعداد الجدول محصور بمدير القسم المحدد',
      'يجب أن تكون مدير القسم المعيّن في إعدادات الأقسام حتى تنشئ الجدول وترسله للاعتماد.'));
    return;
  }
  if (!departments.length) {
    view.appendChild(callout('info', 'لا توجد أقسام', 'أضف قسماً من الإعدادات أولاً.'));
    return;
  }

  const host = el('div', ''); host.appendChild(loading('جارٍ تحميل موظفي القسم…')); view.appendChild(host);
  const source = await loadRequiredSource(refreshUsers, getUsers);
  if (isStale(token)) return;
  if (source.status === 'error') {
    host.innerHTML = ''; host.appendChild(callout('danger', 'تعذّر تحميل الموظفين', 'لن يُعرض جدول ناقص. حدّث الصفحة وحاول مجددًا.'));
    return;
  }

  let weekStart = nextWeekStart();
  let departmentId = managerDepartment?.departmentId || departments[0].departmentId;
  async function draw() {
    const dept = departments.find((d) => d.departmentId === departmentId);
    if (!dept) {
      host.innerHTML = ''; host.appendChild(callout('danger', 'القسم غير موجود', 'اختر قسماً صالحاً ثم حاول.')); return;
    }
    host.innerHTML = ''; host.appendChild(loading('جارٍ تحميل الجدول…'));
    let data;
    try { data = await fetchWeeklyRoster(dept.departmentId, weekStart); }
    catch (e) {
      console.error(e); host.innerHTML = ''; host.appendChild(callout('danger', 'تعذّر تحميل جدول الأسبوع', 'تحقق من الاتصال ثم أعد المحاولة.')); return;
    }
    const { roster, entries } = data;
    const status = roster?.status || '';
    const editable = manager && managerDepartment.departmentId === dept.departmentId
      && (!status || status === ROSTER_STATUS.DRAFT || status === ROSTER_STATUS.RETURNED);
    const staff = getUsers().filter((u) => u.role !== 'admin' && u.department === dept.department && u.status !== 'inactive')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const byUid = new Map(entries.map((e) => [e.employeeUid, e]));
    const plans = shiftPlansOf();

    host.innerHTML = '';
    const nav = card('');
    if (admin) {
      const deptField = el('div', 'field');
      deptField.innerHTML = `<label for="rosterDept">القسم</label><select id="rosterDept">${departments.map((d) =>
        `<option value="${esc(d.departmentId)}"${d.departmentId === dept.departmentId ? ' selected' : ''}>${esc(d.department)}</option>`).join('')}</select>`;
      deptField.querySelector('select').onchange = (e) => { departmentId = e.target.value; draw(); };
      nav.appendChild(deptField);
    } else {
      nav.appendChild(el('div', 'mb-2', `القسم: <b>${esc(dept.department)}</b>`));
    }
    nav.appendChild(sectionHead('الأسبوع', el('div', 'actions-cell', '')));
    const navActions = nav.querySelector('.actions-cell');
    navActions.append(
      button('السابق', 'btn sm ghost', () => { weekStart = shiftWeek(weekStart, -1); draw(); }),
      el('b', 'num', `${esc(weekStart)} ← ${esc(weekEndOf(weekStart))}`),
      button('التالي', 'btn sm ghost', () => { weekStart = shiftWeek(weekStart, 1); draw(); })
    );
    nav.appendChild(el('div', 'mt-2', `الحالة: ${statusPill(status)}`));
    if (status === ROSTER_STATUS.RETURNED && roster.returnNote)
      nav.appendChild(callout('warn', 'ملاحظة الموارد البشرية', esc(roster.returnNote)));
    host.appendChild(nav);

    const c = card('');
    c.appendChild(sectionHead('المناوبات', null));
    if (!staff.length) {
      c.appendChild(empty(`لا يوجد موظفون في قسم ${esc(dept.department)}.`, 'people')); host.appendChild(c); return;
    }
    const wrap = tableWrap(`<table class="tight"><thead><tr><th>الموظف</th>${ROSTER_DAYS.map((d) =>
      `<th>${AR_DAYS[d]}<div class="cell-sub num">${dateForDow(weekStart, d).slice(5)}</div></th>`).join('')}</tr></thead><tbody></tbody></table>`);
    const tb = wrap.querySelector('tbody');
    staff.forEach((u) => {
      const entry = byUid.get(u.id) || {};
      const tr = el('tr', ''); tr.dataset.uid = u.id; tr.dataset.name = u.name || '';
      tr.innerHTML = `<td><b>${esc(u.name)}</b><div class="cell-sub">${esc(u.empId || '')}</div></td>` + ROSTER_DAYS.map((dow) => {
        const code = entry.days?.[dow] || '';
        if (editable) return `<td><select class="inline-input" data-day="${dow}">${planOptions(plans, dow, code)}</select></td>`;
        const base = shiftLabel(resolveShift(dateForDow(weekStart, dow), dow, u.department, u));
        if (status === ROSTER_STATUS.APPROVED) return `<td>${approvedLabel(entry.approvedDays?.[dow], base)}</td>`;
        if (code === ROSTER_REST) return '<td>راحة</td>';
        const p = plans.find((x) => x.id === code), day = p?.days?.[dow];
        return `<td>${code ? (p && day ? `${esc(p.name)}<div class="cell-sub">${rosterTimeRangeHtml(day.start, day.end)}</div>` : 'قالب غير موجود') : base}</td>`;
      }).join('');
      tb.appendChild(tr);
    });
    c.appendChild(wrap);

    const actions = el('div', 'row mt-3');
    const collect = () => [...tb.querySelectorAll('tr')].map((tr) => ({
      employeeUid: tr.dataset.uid, employeeName: tr.dataset.name,
      days: Object.fromEntries([...tr.querySelectorAll('select[data-day]')].map((s) => [s.dataset.day, s.value]))
    }));
    if (editable) {
      actions.append(
        button('حفظ مسودة', 'btn ghost', async () => {
          try { await saveWeeklyRosterDraft(dept.departmentId, weekStart, collect()); toast('حُفظت المسودة', 'ok'); await draw(); }
          catch (e) { console.error(e); toast('تعذّر حفظ المسودة', 'err'); }
        }),
        button('إرسال للاعتماد', 'btn', async () => {
          try {
            await saveWeeklyRosterDraft(dept.departmentId, weekStart, collect());
            await submitWeeklyRoster(dept.departmentId, weekStart); toast('أُرسل الجدول للاعتماد', 'ok'); await draw();
          } catch (e) { console.error(e); toast(e.message === 'missing-shift-plan' ? 'يوجد شفت غير صالح' : 'تعذّر إرسال الجدول', 'err'); }
        })
      );
    }
    if (admin && status === ROSTER_STATUS.SUBMITTED) {
      actions.append(button('اعتماد', 'btn', async () => {
        try { await approveWeeklyRoster(dept.departmentId, weekStart); toast('اعتُمد جدول الأسبوع', 'ok'); await draw(); }
        catch (e) { console.error(e); toast(e.message === 'missing-shift-plan' ? 'يوجد Shift Template غير صالح' : 'تعذّر اعتماد الجدول', 'err'); }
      }));
    }
    if (admin && [ROSTER_STATUS.SUBMITTED, ROSTER_STATUS.APPROVED].includes(status)) {
      const started = ymdKsa() >= weekStart;
      if (!(status === ROSTER_STATUS.APPROVED && started)) actions.append(button('إرجاع للتعديل', 'btn ghost', () => {
        const m = openModal(`<h3>إرجاع جدول الأسبوع</h3><div class="field"><label for="rrNote">ملاحظة مختصرة *</label><textarea id="rrNote" maxlength="300"></textarea></div><div class="row"><button class="btn ghost" id="rrCancel">إلغاء</button><button class="btn" id="rrOk">إرجاع</button></div>`);
        m.$('#rrCancel').onclick = m.close;
        m.$('#rrOk').onclick = async () => {
          try { await returnWeeklyRoster(dept.departmentId, weekStart, m.$('#rrNote').value); m.close(); toast('أُعيد الجدول للتعديل', 'ok'); await draw(); }
          catch (e) { console.error(e); toast('اكتب ملاحظة صحيحة ثم حاول', 'err'); }
        };
      }));
    }
    if (actions.childElementCount) c.appendChild(actions);
    if (admin && status === ROSTER_STATUS.APPROVED && ymdKsa() >= weekStart)
      c.appendChild(callout('info', 'الأسبوع بدأ', 'لا يمكن إعادة جدول معتمد للتعديل بأثر رجعي ضمن هذا الإصدار.'));
    host.appendChild(c);
  }

  await draw();
}
