import { el, esc } from '../lib/dom.js';
import { getUsers, getRequests, getProfileUid, setProfileUid, getMe } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { recentCyclesList, reqEventDate, contractDaysLeft, AR_DAYS } from '../lib/dates.js';
import { money, hhmm, hm, fmtDur, p2 } from '../lib/format.js';
import { fetchMyAttendance, buildDailyStatus, uidsOf } from '../lib/attendance.js';
import { computePayroll, payrollConfig } from '../lib/payroll.js';
import { shiftText } from '../lib/shifts.js';
import { describeRule } from '../lib/geo.js';
import { openEmpForm } from '../components/employee-form.js';
import { go, isStale, rerender, getPageArg } from '../lib/nav.js';
import { roleLabel } from '../lib/perms.js';
import { card, grid, stat, empty, tableWrap, button, bar, sectionHead } from '../lib/ui.js';
import { salaryCertificate, leaveStatement } from '../lib/certificates.js';
import { directReports, managerOf, managerChain } from '../lib/org.js';
import { openDocsModal, docsList } from '../components/documents-modal.js';

export async function render(view, token) {
  if (!getUsers().length) { try { await refreshUsers(); } catch (e) { console.error(e); } }
  if (isStale(token)) return;

  /* ── مصدر معرّف الموظف ──
     العنوان أولاً (#profile/UID) فيصمد أمام التحديث ومشاركة الرابط؛
     والحالة في الذاكرة احتياطٌ للتنقّل الداخلي. ونزامنهما حتى تبقى
     setProfileUid صحيحة لمن يقرؤها. */
  const uid = getPageArg() || getProfileUid();
  if (uid && uid !== getProfileUid()) setProfileUid(uid);
  const u = getUsers().find((x) => x.id === uid);
  if (!u) {
    const c = card('');
    c.appendChild(empty('لم يُحدَّد موظف. ارجع لصفحة «ملفات الموظفين» واختر بروفايل.', 'people'));
    c.appendChild(button('ملفات الموظفين', 'btn sm ghost', () => go('employees')));
    view.appendChild(c);
    return;
  }

  /* ترويسة */
  const hd = el('div', 'hero-card');
  hd.innerHTML = `
    <div class="row-between">
      <div>
        <div class="hero-card__name">${esc(u.name)}</div>
        <div class="hero-card__meta">${esc(u.jobTitle || '—')} · ${esc(u.department || 'بلا قسم')} · الرقم الوظيفي ${esc(u.empId || '—')}</div>
        <div class="hero-card__sub num">${esc(u.phone || '')}</div>
      </div>
      <div class="text-start">
        <span class="pill pill--dot ${u.status === 'active' ? 'active' : 'suspended'}">${u.status === 'active' ? 'نشط' : 'معلّق'}</span>
        <div class="hero-card__sub">${esc(roleLabel(u))}</div>
      </div>
    </div>`;
  view.appendChild(hd);

  /* الأدمن وحده يرى الرواتب ويحرّر — تُستعمل في عدة مواضع أدناه */
  const isAdmin = getMe().role === 'admin';

  const bar2 = el('div', 'btn-bar');
  bar2.appendChild(button('كل الموظفين', 'btn sm ghost', () => go('employees')));
  /* ⚠️ قاعدة users تسمح بالتعديل للأدمن وحده، فالزر عند مدير القسم كان يفشل
     دائماً برسالة «ما عندك صلاحية». صفحة الموظفين تتجنّب هذا أصلاً — لا
     تُعرض أزرار محكوم عليها بالفشل. */
  if (isAdmin) {
    bar2.appendChild(button('تعديل البيانات والراتب', 'btn sm',
      () => openEmpForm(u, async () => { await refreshUsers(); rerender(); }, 'gear')));
  }
  view.appendChild(bar2);

  /* التعاقد */
  const cfg = payrollConfig();
  const dl = contractDaysLeft(u.contractEnd);
  /* ⚠️ الراتب لمدير النظام فقط. صفحة «ملفات الموظفين» تخفي عمود الراتب عن
     مدير القسم، وكانت هذه الصفحة تعرضه له كاملاً مع تفصيل الخصومات —
     تسريب رواتب كل مرؤوسيه بخطوتين. */
  const cd = card(isAdmin ? 'التعاقد والراتب' : 'التعاقد', null, 'money');
  const cg = grid(isAdmin ? 4 : 2);
  if (isAdmin) {
    cg.append(
      stat(u.salary ? money(u.salary) : '—', 'الراتب الشهري (ريال)'),
      stat(u.salary ? money(u.salary / (cfg.daysPerMonth || 30) / (cfg.hoursPerDay || 8)) : '—', 'قيمة الساعة (ريال)')
    );
  }
  cg.append(
    stat(u.contractEnd || '—', 'انتهاء العقد' + (dl !== null ? ` · ${dl < 0 ? 'منتهٍ' : dl + ' يوم متبقّي'}` : ''),
      dl !== null && dl < 0 ? 'r' : (dl !== null && dl <= 60 ? 'a' : '')),
    stat(u.hireDate || '—', 'تاريخ المباشرة')
  );
  cd.appendChild(cg);
  cd.appendChild(el('p', 'help', 'تسجيل الحضور: ' + describeRule(u)));
  view.appendChild(cd);

  /* ── المستندات ──
     الأدمن وحده يحرّر (القاعدة تفرضه)؛ مدير القسم يرى ولا يعدّل. */
  const dc = card('');
  dc.appendChild(sectionHead({ text: 'المستندات وتواريخ الانتهاء', icon: 'doc' },
    isAdmin ? button('إدارة المستندات', 'btn sm', () => openDocsModal(u, async () => {
      await refreshUsers(); rerender();
    }), 'gear') : null));
  dc.appendChild(docsList(u));
  view.appendChild(dc);

  /* اختيار الدورة */
  const cycles = recentCyclesList(12);
  const pick = card('تحليلات الالتزام', null, 'chart',
    'المصدر: بصمات جهاز ZKTeco. أيام الراحة والعطل الرسمية مستثناة من الحساب.');
  const dd = el('select', 'select-lg');
  dd.innerHTML = cycles.map((c, i) => `<option value="${i}">${esc(c.label)}${i === 0 ? ' (الحالية)' : ''}</option>`).join('');
  pick.appendChild(dd);
  view.appendChild(pick);

  const host = el('div', '');
  view.appendChild(host);

  async function draw() {
    const cyc = cycles[+dd.value];
    host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ الحساب…</div></div>';
    let recs = [];
    /* قراءة مباشرة بمعرّف الوثيقة — الاستعلام بالمدى مرفوض لغير الأدمن،
       وهذه الصفحة تحتاج موظفاً واحداً فقط فلا تحتاج استعلاماً ولا فهرساً. */
    try { recs = await fetchMyAttendance(cyc, uidsOf(u), 'zkAttendance'); }
    catch (e) { console.error(e); host.innerHTML = '<div class="card"><div class="empty">تعذّر تحميل سجل البصمة</div></div>'; return; }
    if (isStale(token)) return;

    const mine = recs;
    const reqs = getRequests().filter((r) => r.employeeUid === u.id);
    const rows = buildDailyStatus(cyc, [u], reqs, mine);
    /* ⚠️ computePayroll تُسقط دور admin عمداً (لا مسير للأدمن)، فتُرجع مصفوفة
       فارغة حين يكون هذا البروفايل لأدمن — و [0] عندها undefined. كان الوصول
       إلى pay.lateMin بعدها يرمي فتنهار الصفحة كلها إلى «تعذّر عرض هذه
       الصفحة»: أي بروفايل أدمن كان مكسوراً بالكامل، لا بطاقة الراتب وحدها.
       الآن الغياب حالة معلَنة: إحصاءات الحضور تُعرض كاملة، وما يعتمد على
       المسير يُستبدل بسطر يشرح السبب. */
    const pay = computePayroll(cyc, [u], reqs, mine)[0] || null;

    const cnt = (k) => rows.filter((r) => r.cls === k).length;
    const pres = cnt('present'), late = cnt('late'), abs = cnt('absent'),
          miss = cnt('missing'), lv = cnt('leave');
    const total = rows.length || 1;
    const commit = Math.round(((pres + late + lv) / total) * 100);
    const onTime = Math.round((pres / total) * 100);
    const ins = rows.filter((r) => r.firstIn).map((r) => r.firstIn.getHours() * 60 + r.firstIn.getMinutes());
    const avgIn = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;

    host.innerHTML = '';
    const g = grid(4);
    g.append(
      stat(commit + '%', 'نسبة الالتزام (حضور + إجازة)', commit >= 90 ? 'g' : commit >= 75 ? 'a' : 'r'),
      stat(onTime + '%', 'حضور في الوقت', 'g'),
      stat(late, 'أيام تأخير', 'a'),
      stat(abs, 'أيام غياب', 'r')
    );
    host.appendChild(g);

    const g2 = grid(4);
    g2.append(
      stat(pay ? hhmm(pay.lateMin) : '—', 'إجمالي التأخير', pay ? 'a' : ''),
      stat(pay ? hhmm(pay.earlyMin) : '—', 'خروج مبكر', pay ? 'a' : ''),
      stat(miss, 'نسيان بصمة خروج'),
      stat(avgIn !== null ? `${p2(Math.floor(avgIn / 60))}:${p2(avgIn % 60)}` : '—', 'متوسط وقت الحضور')
    );
    host.appendChild(g2);

    const g3 = grid(4);
    g3.append(
      stat(pay ? pay.workH.toFixed(1) : '—', 'ساعات عمل فعلية'),
      stat(pay ? pay.reqH.toFixed(1) : '—', 'ساعات مطلوبة'),
      stat(lv, 'أيام إجازة'),
      stat(reqs.filter((r) => { const d = reqEventDate(r); return d >= cyc.start && d <= cyc.end; }).length, 'طلبات في الدورة')
    );
    host.appendChild(g3);

    /* توزيع الأيام */
    const bc = card('توزيع أيام الدورة');
    const seg = (n, label, color) =>
      `<div class="row-between mt-2"><span>${label}</span><b class="num">${n} يوم (${Math.round(n / total * 100)}%)</b></div>` +
      bar((n / total) * 100, color);
    bc.innerHTML += seg(pres, 'حاضر في الوقت', 'var(--green)') + seg(late, 'متأخر', 'var(--amber)') +
                    seg(abs, 'غائب', 'var(--red)') + seg(lv, 'إجازة', 'var(--info)') +
                    seg(miss, 'نسيان بصمة', 'var(--violet)');
    host.appendChild(bc);

    /* أثر الخصم — للأدمن وحده، فهو تفصيل رواتب */
    if (!isAdmin) {
      /* مدير القسم لا يرى أرقام الراتب إطلاقاً */
    } else if (!pay) {
      const w = card('');
      w.appendChild(empty('لا يُحتسب مسير رواتب لحساب مدير النظام.', 'money'));
      w.appendChild(el('p', 'help',
        'إحصاءات الحضور أعلاه محسوبة كاملةً من بصمات الجهاز — المستثنى هو المسير وحده.'));
      host.appendChild(w);
    } else if (u.salary) {
      const pc = card('أثر الالتزام على راتب هذه الدورة', null, 'money');
      pc.innerHTML += `
        <div class="detail-list">
          <div class="detail-line"><span class="k">الراتب الأساسي</span><span class="v money">${money(pay.salary)}</span></div>
          <div class="detail-line"><span class="k">خصم الساعات (${hhmm(pay.lateMin + pay.earlyMin)} × ${money(pay.hourRate)})</span><span class="v money neg">− ${money(pay.dedHours)}</span></div>
          <div class="detail-line"><span class="k">خصم الغياب (${pay.absentDays} يوم × ${money(pay.dayRate)})</span><span class="v money neg">− ${money(pay.dedAbsent)}</span></div>
          <div class="detail-line"><span class="k">خصم إجازة بدون راتب (${pay.unpaidDays} يوم)</span><span class="v money neg">− ${money(pay.dedUnpaid)}</span></div>
          <div class="detail-line detail-line--total"><span class="k">المستحق</span><span class="v money net">${money(pay.net)}</span></div>
        </div>
        ${pay.exemptMin ? `<p class="help">أُعفي ${hhmm(pay.exemptMin)} بسبب استئذانات معتمدة.</p>` : ''}
        ${pay.missingOut ? `<p class="help text-violet">${pay.missingOut} يوم بلا بصمة انصراف — راجعها قبل اعتماد المسير.</p>` : ''}`;
      host.appendChild(pc);
    } else {
      /* ⚠️ كان `else if (showMoney)` — بقيّة من حلّ تعارض الدمج، والاسم غير
         معرَّف في هذا الملف. يُرمى ReferenceError عند فتح الأدمن لبروفايل
         موظف بلا راتب محدَّد، وهي حالة كل موظف جديد. والفرع داخل isAdmin
         أصلاً، فالشرط كان زائداً حتى لو كان الاسم صحيحاً. */
      const w = card('');
      w.appendChild(empty('لم يُحدَّد راتب لهذا الموظف — اضغط «تعديل البيانات والراتب» لإضافته.'));
      host.appendChild(w);
    }

    /* تفصيل الأيام */
    const dc = card('تفصيل أيام الدورة', null, 'calendar');
    if (!rows.length) dc.appendChild(empty('لا أيام عمل في هذه الدورة'));
    else dc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th class="num">التاريخ</th><th>اليوم</th><th>الوردية</th><th>الحالة</th><th class="num">دخول</th><th class="num">خروج</th><th class="num">الساعات</th><th>ملاحظة</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="num">${esc(r.dateStr)}</td>
          <td>${AR_DAYS[r.dow]}</td>
          <td class="cell-sub">${esc(shiftText(r.shift))}</td>
          <td><span class="pill pill--dot ${esc(r.cls)}">${esc(r.status)}</span></td>
          <td class="num text-green">${r.firstIn ? hm(r.firstIn) : '—'}</td>
          <td class="num text-red">${r.lastOut ? hm(r.lastOut) : '—'}</td>
          <td class="num">${r.secs > 0 ? fmtDur(r.secs) : '—'}</td>
          <td class="cell-sub">${esc(r.note || '')}</td></tr>`).join('')}</tbody>
      </table>`));
    host.appendChild(dc);
  }

  dd.onchange = draw;
  await draw();
}
