/* ═══════════════════════════════════════════════════════════════════════════
   رئيسية الموظف — ما يفتحها لأجله كل صباح، لا كل ما يخصّه.

   ⚠️ كانت تحمل ستة أقسام: الحضور، الرصيد، الطلبات، الخدمات الذاتية،
   المستندات، والبطاقة الوظيفية. والموظف يفتحها لسبب واحد — تسجيل حضوره —
   فيمرّ على خمسة أقسام لا يريدها ليصل إليه. وفي المقابل كانت قائمته
   الجانبية أربعة روابط فقط، فيبدو النظام أضيق مما هو بينما نصف ما بُني له
   مدفون في صفحة واحدة.

   الآن: الحضور ثم ما يتغيّر يومياً (الرصيد، آخر الطلبات)، وما بقي في صفحاته:
     profile-me   ملفي الوظيفي   — البطاقة والمستندات وبيانات الاتصال
     services     خدماتي         — الشهادات والخطابات
     performance  أدائي          — التزام الدورة بالأرقام
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, toast } from '../lib/dom.js';
import { getMe, getSettings, getRequests } from '../lib/state.js';
import { attendPanel } from '../components/attend-panel.js';
import { miniRow } from '../components/request-card.js';
import { ownRequests } from './requests-mine.js';
import { go, isStale } from '../lib/nav.js';
import { docsOf, docStatus } from '../lib/documents.js';
import { contractDaysLeft, ymdKsa, cycleOf, ymd, AR_DAYS, AR_MONTHS } from '../lib/dates.js';
import { fetchMyAttendance, uidsOf, buildDailyStatus } from '../lib/attendance.js';
import { mergeEarliestIn } from '../lib/hr-stats.js';
import { cycleGridOf, monthSummary, minToHm } from '../lib/timesheet.js';
import { resolveShift } from '../lib/shifts.js';
import { hm } from '../lib/format.js';
import { announcementsFor, isLive, myAck, acknowledge, PRIORITY_AR } from '../lib/announcements.js';
import { card, grid, stat, empty, sectionHead, button, statCard, loading, callout } from '../lib/ui.js';
import { readLeaderboard } from '../lib/leaderboard.js';
import { topPunctualCard } from '../components/top-punctual.js';
import { icon } from '../lib/icons.js';

/* البطاقات التي تنقل الموظف لصفحاته — بديل الأقسام التي كانت محشورة هنا */
const SHORTCUTS = [
  { page: 'performance', ico: 'chart',  title: 'أدائي',
    desc: 'حضورك وتأخيرك وغيابك في هذه الدورة بالأرقام' },
  { page: 'services',    ico: 'doc',    title: 'خدماتي',
    desc: 'تعريف بالراتب · خطاب للبنك · كشف الإجازات' },
  { page: 'profile-me',  ico: 'people', title: 'ملفي الوظيفي',
    desc: 'بطاقتك ومستنداتك وبيانات اتصالك' }
];

export function render(view, token) {
  const me = getMe();
  const S = getSettings();

  /* ── الإعلان أولاً ──
     ⚠️ طلب المالك (٢٠٢٦-٠٨-١٣): الإعلان يصل الموظف في رئيسيته لا في صفحة
     يدخلها باختياره. الإعلان الذي يحتاج فتح صفحة ليُقرأ ليس إعلاناً.

     ⚠️ الحاوية تُوضع الآن ويُملأ محتواها بعد الجلب: لا نؤخّر بطاقة الحضور —
     وهي ما يفتح الموظف الصفحة لأجله — انتظاراً لقراءة شبكة.

     ⚠️ العاجل وحده يُعرض كاملاً؛ وما دونه سطر واحد برابط. لو عُرض كل إعلان
     كاملاً في الرئيسية لصارت لوحَ إعلانات ودُفنت بطاقة الحضور تحته. */
  const annHost = el('div', '');
  view.appendChild(annHost);
  paintAnnouncements(annHost, me, token);

  /* الحضور — هو ما يفتح الموظف الصفحة لأجله كل صباح */
  attendPanel(view);

  /* ── كشف حضوري ──
     ⚠️ صفحة «تسجيل حضوري» دُمجت هنا (طلب المالك ٢٠٢٦-٠٨-١٣): كانت نسخة
     طبق الأصل من هذه الصفحة — نفس بطاقة الساعة ونفس الجدول ونفس الزرّ.
     رابطان يفتحان الشيء ذاته.

     وما أُضيف بدل التكرار هو ما كان ينقص فعلاً: **أي أيام** حضر وأيها تأخّر.
     كان «أدائي» يقول «٦ أيام غياب» ولا يقول متى — رقمٌ يتّهم ولا يُراجَع. */
  const sheetHost = el('div', '');
  view.appendChild(sheetHost);
  paintTimesheet(sheetHost, me, token);

  /* ── ما يحتاج انتباهه ──
     ⚠️ يُعرض هنا لا في صفحته: مستند منتهٍ أو عقد يقارب الانتهاء لا ينفع أن
     ينتظر حتى يفتح الموظف «ملفي». وهو مختصر بسطر — التفصيل في صفحته. */
  const alerts = [];
  const badDocs = docsOf(me).map(docStatus).filter((s) => s.state === 'expired' || s.state === 'soon');
  if (badDocs.length) {
    alerts.push({ page: 'profile-me',
      text: badDocs.some((s) => s.state === 'expired')
        ? `${badDocs.length} من مستنداتك منتهٍ أو يقارب الانتهاء`
        : `${badDocs.length} مستند يقارب الانتهاء`,
      kind: badDocs.some((s) => s.state === 'expired') ? 'danger' : 'warn' });
  }
  const dl = contractDaysLeft(me.contractEnd);
  if (dl !== null && dl <= 60) {
    alerts.push({ page: 'profile-me', kind: dl < 0 ? 'danger' : 'warn',
      text: dl < 0 ? `عقدك منتهٍ منذ ${Math.abs(dl)} يوم` : `عقدك ينتهي خلال ${dl} يوم` });
  }
  if (alerts.length) {
    const ac = card('');
    ac.appendChild(sectionHead({ text: 'يحتاج انتباهك', icon: 'alert' }));
    const stack = el('div', 'alert-stack');
    alerts.forEach((a) => {
      const row = el('button', 'alert-item alert-item--' + a.kind,
        `<span class="alert-item__ic">${icon('alert')}</span>`
        + `<span class="alert-item__body"><span class="alert-item__title">${esc(a.text)}</span></span>`
        + icon('back', 'alert-item__go'));
      row.onclick = () => go(a.page);
      stack.appendChild(row);
    });
    ac.appendChild(stack);
    view.appendChild(ac);
  }

  /* ── رصيد الإجازات ── */
  const types = (S.leaveTypes || []).filter((t) => t.deduct);
  if (types.length) {
    const bc = card('');
    bc.appendChild(sectionHead({ text: 'رصيد إجازاتي', icon: 'calendar' }));
    const bg = grid(4);
    types.forEach((t) => {
      const bal = (me.balances && me.balances[t.id] != null) ? me.balances[t.id] : t.balance;
      bg.appendChild(stat(bal, t.label, bal <= 0 ? 'r' : bal <= 3 ? 'a' : ''));
    });
    bc.appendChild(bg);
    view.appendChild(bc);
  }

  /* ── طلباتي — وزرّ التقديم يعيش هنا بدل بطاقة مستقلة ── */
  const recent = ownRequests().slice(0, 3);
  const rc = card('');
  rc.appendChild(sectionHead('طلباتي',
    button('تقديم طلب', 'btn sm', () => go('new'), 'plus'),
    recent.length ? button('عرض الكل', 'btn sm ghost', () => go('mine'), 'list') : null));
  if (!recent.length) rc.appendChild(empty('لا توجد طلبات بعد', 'inbox'));
  else recent.forEach((r) => rc.appendChild(miniRow(r)));
  view.appendChild(rc);

  /* ── الانتقال لبقية صفحاته ── */
  const qc = card('');
  qc.appendChild(sectionHead({ text: 'اختصارات', icon: 'dashboard' }));
  const gridEl = el('div', 'svc-grid');
  SHORTCUTS.forEach((s) => {
    const b = el('button', 'svc-card',
      `${icon(s.ico)}
       <span class="svc-card__body">
         <b>${esc(s.title)}</b>
         <span>${esc(s.desc)}</span>
       </span>`);
    b.onclick = () => go(s.page);
    gridEl.appendChild(b);
  });
  qc.appendChild(gridEl);
  view.appendChild(qc);

  /* ── أفضل المنتظمين ──
     ⚠️ تُحمّل بعد رسم الصفحة ولا تُؤخّرها: render هنا متزامنة عمداً — الحضور
     هو ما يفتح الموظف الصفحة لأجله كل صباح، وجعلُه ينتظر قراءة شبكة من أجل
     لوحة تحفيز يقلب الأولويات. تظهر البطاقة حين تصل، ولا تظهر أصلاً إن لم
     يكن الأدمن قد نشرها بعد. */
  readLeaderboard().then((data) => {
    /* ⚠️ isStale لا view.isConnected: ‏#view عنصر ثابت يُفرَّغ بـ innerHTML
       ولا يُستبدل، فيبقى isConnected صحيحاً بعد إعادة العرض — فكانت البطاقة
       تُضاف مرتين كلما أُعيد عرض الرئيسية (وهو يقع مع كل لقطة بيانات). */
    if (isStale(token)) return;
    const c = topPunctualCard(data, { meName: me.name });
    if (c) view.appendChild(c);
  });
}

/* ═══ شريط الإعلانات في الرئيسية ═══
   ⚠️ الإقرار من هنا مباشرةً: الأدمن يحتاج أن يعرف من قرأ، والموظف لا يفتح
   صفحة الإعلانات ليقرّ. زرٌّ واحد في مكان القراءة أصدق من رحلة صفحتين.

   ⚠️ فشل الجلب لا يُظهر خطأً: الرئيسية تعمل بلا إعلانات، ورسالة حمراء في
   أعلى الشاشة كل صباح لأن قراءةً ثانوية فشلت أسوأ من غياب الإعلان. */
async function paintAnnouncements(host, me, token) {
  let list = [];
  try { list = await announcementsFor(me, 10); }
  catch (e) { console.error('home-ann', e); return; }
  if (isStale(token)) return;

  const today = ymdKsa();
  const live = list.filter((a) => isLive(a, today))
    .sort((a, b) => (b.publishAt?.seconds || 0) - (a.publishAt?.seconds || 0));
  if (!live.length) return;

  /* العاجل والمهمّ يُعرضان كاملَين؛ والعادي سطراً واحداً */
  const loud = live.filter((a) => a.priority === 'urgent' || a.priority === 'important').slice(0, 2);
  const quiet = live.filter((a) => !loud.includes(a));

  host.innerHTML = '';
  for (const a of loud) {
    const box = el('div', 'annbar annbar--' + esc(a.priority || 'normal'));
    box.innerHTML =
      `<span class="annbar__tag">${icon(a.priority === 'urgent' ? 'alert' : 'megaphone')}` +
        `${esc(PRIORITY_AR[a.priority] || 'إعلان')}</span>` +
      `<div class="annbar__body">` +
        `<b class="annbar__title">${esc(a.title || '')}</b>` +
        `<p class="annbar__text">${esc(a.body || '')}</p>` +
      `</div>`;
    const acts = el('div', 'annbar__acts');
    /* ⚠️ زرّ الإقرار يظهر لمن لم يُقرّ وحده — ولا يظهر إطلاقاً إن كان الإعلان
       لا يطلب إقراراً. عرضُه لمن أقرّ يجعله يضغطه ثانيةً بلا معنى. */
    if (a.requireAck) {
      myAck(a.id, me.id).then((done) => {
        if (isStale(token)) return;
        if (done) { acts.appendChild(el('span', 'annbar__done', icon('check') + 'تم اطّلاعك')); return; }
        const b = button('أقرّ بالاطّلاع', 'btn sm', async () => {
          b.disabled = true;
          try { await acknowledge(a.id); acts.innerHTML = ''; acts.appendChild(el('span', 'annbar__done', icon('check') + 'تم اطّلاعك')); }
          catch (e) { console.error(e); toast('تعذّر تسجيل الاطّلاع', 'err'); b.disabled = false; }
        }, 'check');
        acts.appendChild(b);
      }).catch((e) => console.error('ack', e));
    }
    acts.appendChild(button('كل الإعلانات', 'btn sm ghost', () => go('announcements')));
    box.appendChild(acts);
    host.appendChild(box);
  }

  if (quiet.length) {
    const line = el('button', 'annline');
    line.type = 'button';
    line.onclick = () => go('announcements');
    line.innerHTML = `${icon('megaphone')}<span>${esc(quiet[0].title || 'إعلان جديد')}</span>` +
      (quiet.length > 1 ? `<b class="annline__more">و${quiet.length - 1} غيره</b>` : '') +
      `<span class="annline__go">${icon('back')}</span>`;
    host.appendChild(line);
  }
}

/* ═══ كشف الحضور الشهري ═══
   مبنيّ على المرجع الذي أرسله المالك: تقويم ملوّن بأوقات الدخول + آخر نشاط.

   ⚠️ الحالة تأتي من buildDailyStatus — نفس الدالة التي يعتمدها المسير. لا
   حسبة ثانية هنا: حسبتان للتأخير تتباعدان تعنيان رقمين مختلفين لنفس الموظف.

   ⚠️ المصدران يُدمجان بـ mergeEarliestIn: من بصم على الجهاز ٠٧:٥٥ ثم سجّل
   من جواله ٠٨:٢٠ حضر السابعة والخمسين. أخذُ مصدرٍ واحد يظلم من يستعمل الآخر.

   ⚠️ بلا compensate — التعويض شاشة أدمن. الموظف يرى تأخيره كما هو، ولا
   يُبنى على شاشته وعدٌ بتعويض يقرّره غيره. */
async function paintTimesheet(host, me, token) {
  const cyc = cycleOf(new Date());
  host.appendChild(loading('جارٍ قراءة كشف حضورك…'));

  /* ⚠️ بلا `.catch(() => [])` — ولا على مصدرٍ واحد. المصدران يُدمجان، فسقوط
     أحدهما وحده يكفي لتحويل أيام حاضرة إلى غياب. القراءة إمّا تنجح كاملةً
     أو تُقال للموظف صراحةً: «تعذّرت» لا «غائب». */
  let recs = [];
  try {
    const [zk, web] = await Promise.all([
      fetchMyAttendance(cyc, uidsOf(me), 'zkAttendance'),
      fetchMyAttendance(cyc, uidsOf(me), 'attendance')
    ]);
    recs = mergeEarliestIn(zk, web);
  } catch (e) {
    console.error('timesheet', e);
    if (isStale(token)) return;
    host.innerHTML = '';
    const c = card('');
    c.appendChild(sectionHead({ text: 'كشف حضوري', icon: 'calendar' }));
    c.appendChild(callout('warn', 'تعذّرت قراءة سجلّ حضورك',
      'لم نصل إلى السجلات — وهذا ليس غياباً. أعد تحميل الصفحة، وإن تكرّر فأبلغ الموارد البشرية.'));
    host.appendChild(c);
    return;
  }
  if (isStale(token)) return;

  const rows = buildDailyStatus(cyc, [me], getRequests(), recs)
    .filter((r) => r.u.id === me.id);
  const today = ymdKsa();
  /* ⚠️ نفس resolveShift التي بنى بها buildDailyStatus الصفوف — لا حسبة
     ثانية. تلك تتخطّى يوم الراحة بـ`continue` فلا يصل الشبكةَ صفٌّ يقول
     «راحة»، والشبكة وحدها لا تفرّق حينها بين راحةٍ ويومٍ لم يأتِ بعد. */
  const isOff = (dateStr, dow) => {
    const s = resolveShift(dateStr, dow, me.department, me);
    return !s || s.type === 'off';
  };
  const grid2 = cycleGridOf(rows, ymd(cyc.start), ymd(cyc.end), today, isOff);
  const sum = monthSummary(rows);

  host.innerHTML = '';

  const sg = el('div', 'statgrid');
  sg.append(
    statCard({ label: 'أيام حضرتها', value: `${sum.attended}/${sum.workDays}`, ico: 'check',
      tone: sum.onTimePct >= 90 ? 'good' : sum.onTimePct >= 70 ? 'warn' : 'bad',
      sub: sum.onTimePct === null ? 'لا أيام عمل بعد' : `${sum.onTimePct}٪ في الوقت` }),
    statCard({ label: 'متوسّط دخولك', value: minToHm(sum.avgInMin), ico: 'clock',
      sub: sum.avgInMin === null ? 'لم تسجّل دخولاً بعد' : 'في هذه الدورة' }),
    statCard({ label: 'مرات التأخير', value: sum.late, ico: 'alert',
      tone: sum.late ? 'warn' : 'good',
      sub: sum.late ? 'يُخصم عليها بدقائقها' : 'لا تأخير — أحسنت' }),
    statCard({ label: 'أيام الإجازة', value: sum.leave, ico: 'calendar', tone: 'info',
      sub: 'معتمَدة في هذه الدورة' })
  );
  host.appendChild(sg);

  const cal = card('');
  cal.appendChild(sectionHead({ text: 'كشف حضوري', icon: 'calendar' }));
  cal.appendChild(el('p', 'desc', `${esc(cyc.label)} — لون كل يوم يقول حالته`));
  const box = el('div', 'sheet');
  AR_DAYS.forEach((d) => box.appendChild(el('div', 'sheet__head', esc(d))));
  for (let i = 0; i < grid2.lead; i++) box.appendChild(el('div', ''));
  let lastMonth = -1;
  for (const c of grid2.cells) {
    const cell = el('div', 'sheet__day' + (c.cls ? ' is-' + c.cls : '') +
      (c.isFuture ? ' is-future' : '') + (c.isToday ? ' is-today' : ''));
    /* ⚠️ اسم الشهر على أول خانة وعلى أول يوم من الشهر التالي: الدورة تعبر
       شهرين، و«٢٦» وحده لا يقول أيّ ٢٦ — يوليو أم أغسطس. */
    const mark = (c.month !== lastMonth) ? `<span class="sheet__m">${esc(AR_MONTHS[c.month])}</span>` : '';
    lastMonth = c.month;
    cell.innerHTML = mark + `<span class="sheet__n num">${c.day}</span>` +
      (c.inAt ? `<span class="sheet__t num">${esc(hm(c.inAt))}</span>`
              : c.cls === 'leave' ? '<span class="sheet__t">إجازة</span>'
              : c.isOff ? '<span class="sheet__t">راحة</span>' : '');
    if (c.status) cell.title = `${c.date} — ${c.status}`;
    box.appendChild(cell);
  }
  cal.appendChild(box);
  cal.appendChild(el('div', 'sheet__legend',
    ['present:في الوقت', 'late:متأخر', 'leave:إجازة', 'absent:غائب',
     'missing:نسيان بصمة', 'off:راحة']
      .map((x) => { const [k, l] = x.split(':');
        return `<span class="sheet__key"><i class="sheet__sw is-${k}"></i>${l}</span>`; }).join('')));
  host.appendChild(cal);

}
