/* ═══════════════════════════════════════════════════════════════════════════
   أدائي — التزام الموظف في الدورة، بالأرقام والألوان.

   ── لماذا يراه الموظف ──
   كان الالتزام معلوماً للأدمن وحده (بروفايل الموظف)، بينما صاحبه لا يعرف
   عدد أيام تأخيره إلا حين يُخصم من راتبه. الرقم الذي يُحاسَب عليه يجب أن
   يكون أمامه قبل الخصم لا بعده.

   ⚠️ نفس الدوال التي يستعملها المسير حرفياً — buildDailyStatus هي المصدر
   الوحيد لقرار «حاضر/متأخر/غائب». حساب مستقل هنا يعني رقمين مختلفين لنفس
   اليوم: واحد يراه الموظف وآخر يُخصم به، وهذا أسوأ من ألّا يرى شيئاً.

   ⚠️ المصدر zkAttendance (جهاز البصمة) لا attendance (تسجيل الجوال) — لأنه
   ما يُحسب عليه المسير فعلاً.

   ⚠️ القراءة بمعرّف الوثيقة لا بالاستعلام: قاعدة zkAttendance تسمح للموظف
   بسجلاته هو فقط، وFirestore يرفض أي استعلام بمدى ما لم يكن مقيَّداً بحيث
   تحقّق كل نتيجة محتملة شرط القاعدة. fetchMyAttendance تقرأ الوثائق مباشرةً
   فلا تحتاج فهرساً ولا صلاحية أوسع.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { getMe, getRequests } from '../lib/state.js';
import { recentCyclesList, AR_DAYS } from '../lib/dates.js';
import { hhmm, hm, fmtDur, p2 } from '../lib/format.js';
import { fetchMyAttendance, buildDailyStatus, uidsOf,
         sessionsOf, lastOutOf } from '../lib/attendance.js';
import { tsToDate } from '../lib/format.js';
import { isStale, go } from '../lib/nav.js';
import { PERM_BACKDATE_DAYS } from '../lib/requests.js';
import { card, grid, stat, empty, tableWrap, bar, sectionHead, callout, button } from '../lib/ui.js';

export async function render(view, token) {
  const me = getMe();

  const cycles = recentCyclesList(12);
  const pick = card('');
  pick.appendChild(sectionHead({ text: 'أدائي', icon: 'chart' }));
  pick.appendChild(el('p', 'desc',
    'محسوب من بصمات جهاز الحضور. أيام الراحة والعطل الرسمية مستثناة — لا تُحتسب عليك.'));
  const dd = el('select', 'select-lg');
  dd.innerHTML = cycles.map((c, i) =>
    `<option value="${i}">${esc(c.label)}${i === 0 ? ' (الحالية)' : ''}</option>`).join('');
  pick.appendChild(dd);
  view.appendChild(pick);

  const host = el('div', '');
  view.appendChild(host);

  async function draw() {
    const cyc = cycles[+dd.value];
    host.innerHTML = '<div class="card"><div class="empty"><span class="spinner"></span> جارٍ الحساب…</div></div>';

    /* ⚠️ المصدران معاً: zkAttendance هو ما يُحسب عليه المسير ويبقى أساس
       الأرقام أعلاه، و attendance (تسجيل الجوال) يُعرض بجانبه للمقارنة.
       الموظف يسأل «بصمت وما ظهر» — وبلا عرض المصدرين لا جواب عنده. */
    let recs = [], webRecs = [];
    try {
      [recs, webRecs] = await Promise.all([
        fetchMyAttendance(cyc, uidsOf(me), 'zkAttendance'),
        fetchMyAttendance(cyc, uidsOf(me), 'attendance').catch(() => [])
      ]);
    }
    catch (e) {
      console.error(e);
      host.innerHTML = '<div class="card"><div class="empty">تعذّر تحميل سجلّك — تحقّق من اتصالك</div></div>';
      return;
    }
    if (isStale(token)) return;

    const reqs = getRequests().filter((r) => r.employeeUid === me.id);
    const rows = buildDailyStatus(cyc, [me], reqs, recs);

    host.innerHTML = '';
    if (!rows.length) {
      const c = card('');
      c.appendChild(empty('لا أيام عمل في هذه الدورة بعد', 'calendar'));
      host.appendChild(c);
      return;
    }

    const cnt = (k) => rows.filter((r) => r.cls === k).length;
    const pres = cnt('present'), late = cnt('late'), abs = cnt('absent'),
          miss = cnt('missing'), lv = cnt('leave');
    const total = rows.length;
    /* الإجازة المعتمدة ليست غياباً — تُحسب ضمن الالتزام */
    const commit = Math.round(((pres + late + lv) / total) * 100);
    const lateMin = rows.reduce((a, r) => a + (r.lateMin || 0), 0);

    /* ── الأرقام الأربعة بألوانها ──
       الأخضر حاضر في الوقت · الأصفر متأخر · الأحمر غائب */
    const g = grid(4);
    g.append(
      stat(pres, 'حضور في الوقت', 'g'),
      stat(late, 'أيام تأخير', late ? 'a' : ''),
      stat(abs,  'أيام غياب',   abs ? 'r' : ''),
      stat(lv,   'أيام إجازة')
    );
    const sc = card('');
    sc.appendChild(sectionHead({ text: `أيام الدورة — ${cyc.label}`, icon: 'calendar' }));
    sc.appendChild(g);

    const g2 = grid(3);
    g2.append(
      stat(commit + '%', 'نسبة الالتزام', commit >= 90 ? 'g' : commit >= 75 ? 'a' : 'r'),
      stat(lateMin ? hhmm(lateMin) : '—', 'إجمالي التأخير', lateMin ? 'a' : ''),
      stat(miss, 'نسيان بصمة انصراف', miss ? 'a' : '')
    );
    sc.appendChild(g2);
    host.appendChild(sc);

    /* ── أيام تأخير ما زالت نافذة استئذانها مفتوحة ──
       ⚠️ التنبيه هنا لا في جدول «يوماً بيوم» وحده: الجدول أسفل الصفحة
       ويُقرأ بالبحث لا بالمرور، والنافذة ثلاثة أيام — من لا يراها اليوم
       يخسرها. هذه هي النقطة العملية كلها في القاعدة الجديدة. */
    const openDays = rows.filter((r) => r.excusable);
    if (openDays.length) {
      const c = card('');
      c.appendChild(callout('warn', `${openDays.length} يوم تأخير بلا استئذان`,
        `ما زال بإمكانك تقديم استئذان عن: ${openDays.map((r) => r.dateStr).join(' · ')}. ` +
        `تُقبل الاستئذانات حتى ${PERM_BACKDATE_DAYS} أيام من تاريخ اليوم المعني، وبعدها يُعتمد التأخير بدون عذر ويبقى في الخصم.`));
      c.appendChild(button('تقديم استئذان', 'btn sm', () => go('new'), 'plus'));
      host.appendChild(c);
    }

    /* ⚠️ نسيان بصمة الانصراف يُحسب يوماً بلا ساعات في المسير — الموظف يجب
       أن يعرف أنه ليس تفصيلاً شكلياً. */
    if (miss) {
      const c = card('');
      c.appendChild(callout('warn', `${miss} يوم بلا بصمة انصراف`,
        'اليوم بلا بصمة انصراف لا تُحتسب ساعاته كاملةً. راجع الموارد البشرية لتصحيحه.'));
      host.appendChild(c);
    }

    /* ── التوزيع ── */
    const bc = card('');
    bc.appendChild(sectionHead({ text: 'التوزيع', icon: 'chart' }));
    const seg = (n, label, color) => n === 0 ? '' :
      `<div class="row-between mt-2"><span>${label}</span><b class="num">${n} يوم (${Math.round(n / total * 100)}%)</b></div>` +
      bar((n / total) * 100, color);
    bc.innerHTML += seg(pres, 'حاضر في الوقت', 'var(--green)')
                  + seg(late, 'متأخر',        'var(--amber)')
                  + seg(abs,  'غائب',         'var(--red)')
                  + seg(lv,   'إجازة',        'var(--info)')
                  + seg(miss, 'نسيان بصمة',   'var(--violet)');
    host.appendChild(bc);

    /* ── يوماً بيوم ──
       الأحدث أولاً: الموظف يسأل عن أمس لا عن أول الشهر. */
    const dc = card('');
    dc.appendChild(sectionHead({ text: 'يوماً بيوم', icon: 'list' }));
    dc.appendChild(tableWrap(`
      <table class="tight">
        <thead><tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>دخول</th><th>خروج</th><th>الساعات</th><th>ملاحظة</th></tr></thead>
        <tbody>${[...rows].reverse().map((r) => `<tr>
          <td class="num">${esc(r.dateStr)}</td>
          <td>${AR_DAYS[r.dow]}</td>
          <td><span class="pill pill--dot ${esc(r.cls)}">${esc(r.status)}</span></td>
          <td class="num text-green">${r.firstIn ? hm(r.firstIn) : '—'}</td>
          <td class="num text-red">${r.lastOut ? hm(r.lastOut) : '—'}</td>
          <td class="num">${r.secs > 0 ? fmtDur(r.secs) : '—'}</td>
          <td class="cell-sub">${esc(r.note || '')}</td></tr>`).join('')}</tbody>
      </table>`));
    host.appendChild(dc);

    /* ── المصدران جنباً إلى جنب ── */
    host.appendChild(sourceCard('البصمة الحقيقية — جهاز ZKTeco', 'finger', recs,
      'هذا هو المصدر الذي يُحسب عليه راتبك. يكتبه الجهاز في المكتب ولا يُعدَّل من التطبيق.'));
    host.appendChild(sourceCard('بصمة الجوال — تسجيل من التطبيق', 'globe', webRecs,
      'تسجيلك الذاتي من الجوال مع موقعك. للتوثيق والمتابعة — لا يحلّ محلّ بصمة الجهاز في المسير.'));
  }

  dd.onchange = draw;
  await draw();
}

/* ═══ بطاقة مصدر واحد ═══
   ⚠️ لا تُعيد حساب «متأخر» ولا «غائب»: هذه البطاقة تعرض ما سجّله المصدر
   حرفياً — دخول وخروج وساعات. قرار الحالة يبقى لـ buildDailyStatus وحدها
   أعلى الصفحة، وإلا ظهر للموظف رقمان مختلفان لنفس اليوم. */
function sourceCard(title, ico, recs, desc) {
  const c = card('');
  c.appendChild(sectionHead({ text: title, icon: ico }));
  c.appendChild(el('p', 'desc', desc));

  if (!recs.length) {
    c.appendChild(empty('لا سجلات من هذا المصدر في هذه الدورة', ico));
    return c;
  }

  const rows = [...recs].sort((a, b) => (a.date < b.date ? 1 : -1));
  let secs = 0, days = 0, openDays = 0;
  const body = rows.map((r) => {
    const ss = sessionsOf(r);
    const first = ss.length ? tsToDate(ss[0].in) : null;
    const out = lastOutOf(ss);
    const w = ss.reduce((a, s) => {
      const i = tsToDate(s.in), o = tsToDate(s.out);
      return a + ((i && o) ? (o - i) / 1000 : 0);
    }, 0);
    secs += w; days++;
    if (!out) openDays++;
    return `<tr>
      <td class="num">${esc(r.date)}</td>
      <td class="num text-green">${first ? hm(first) : '—'}</td>
      <td class="num text-red">${out ? hm(out) : '—'}</td>
      <td class="num">${ss.length}</td>
      <td class="num">${w > 0 ? fmtDur(w) : '—'}</td></tr>`;
  }).join('');

  const g = grid(3);
  g.append(
    stat(days, 'أيام مسجّلة'),
    stat(fmtDur(secs), 'مجموع الساعات'),
    stat(openDays, 'بلا خروج', openDays ? 'a' : '')
  );
  c.appendChild(g);
  c.appendChild(tableWrap(`
    <table class="tight">
      <thead><tr><th>التاريخ</th><th>أول دخول</th><th>آخر خروج</th><th>جلسات</th><th>الساعات</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`));
  return c;
}
