/* ═══════════════════════════════════════════════════════════════════════════
   لوحة الحضور والانصراف — الساعة الحية، مؤقّت الدوام، وزرّ واحد يتحوّل.

   الجديد:
     • الفروع: يُختار أقرب فرع مسموح، ويُكتب اسمه على السجل
     • «من أي مكان»: يتجاوز فحص المسافة، ويُسجَّل موقعه للتوثيق فقط
     • نطاق خاص لكل موظف يتقدّم على نطاق الفرع
     • البصمة ما عادت تمنع التسجيل أبداً — تُسجَّل نتيجتها كما هي

   ⚠️ الجلسة تبقى مفتوحة حتى يضغط الموظف «انصراف» بنفسه. إغلاق الصفحة أو
   قفل الجوال أو انقطاع الإنترنت لا يسجّل انصرافاً، ولا يُفترض أبداً أن
   غياب البيانات يعني عدم وجود جلسة مفتوحة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, onSnapshot } from '../lib/firebase.js';
import { el, esc, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getMe, getSettings } from '../lib/state.js';
import { ymdKsa, AR_DAYS } from '../lib/dates.js';
import { fmtDate, fmtDur, hm, p2, fmtDist } from '../lib/format.js';
import { sessionsOf, workedSecs } from '../lib/attendance.js';
import { shiftLabelOf, checkInAllowed, myShiftToday, attendButtonState } from '../lib/shifts.js';
import { getPosition, geoRuleFor, nearestBranch, activeBranches, REMOTE_BRANCH_ID, REMOTE_LABEL } from '../lib/geo.js';
import { verifyBiometric, bioReasonAr, bioUserCancelled, setCredentialPersister } from '../lib/biometric.js';
import { capturePhoto, savePhoto } from '../lib/photo.js';
import { saveBioCredentials } from '../lib/users.js';
import { setPageInterval, trackSubscription, onCleanup } from '../lib/lifecycle.js';
import { notifyState, askPermission, checkCheckoutReminder } from '../lib/reminders.js';
import { rerender } from '../lib/nav.js';
import { callout } from '../lib/ui.js';

/* الفهرس البعيد لمفاتيح البصمة يُحفظ على وثيقة الموظف */
setCredentialPersister(saveBioCredentials);

export function attendPanel(view) {
  const me = getMe();
  /* ⚠️ تاريخ الرياض لا التاريخ المحلي — معرّف الوثيقة لازم يطابق todayKsa()
     في firestore.rules، وإلا رُفضت كل كتابة من جهاز على منطقة زمنية أخرى.

     ⚠️⚠️ كل مقارنة بـ dateStr في هذا الملف لازم تستعمل ymdKsa() لا ymd().
     الدمج أنتج ثلاث مقارنات بـ ymd() — وهي غير مستورَدة هنا أصلاً، فكانت
     ترمي ReferenceError داخل attendPanel، فتُظهر «تعذّر عرض هذه الصفحة» في
     رئيسية كل موظف. ولو استُوردت ymd بدل تصحيحها لعاد خطأ المنطقة الزمنية:
     موظف خارج UTC+3 يرى «تغيّر التاريخ» في منتصف نهاره وتُعاد الصفحة بلا
     نهاية. */
  const now = new Date(), dow = now.getDay(), dateStr = ymdKsa(now);
  const rule = geoRuleFor(me);

  /* ── بطاقة الساعة ── */
  const hero = el('div', 'attend-hero');
  /* ⚠️ عمودان: الساعة وسياق اليوم في جهة، والفعل في الجهة الأخرى (طلب
     المالك). كان الزرّ في بطاقة ثانية أسفل جدولٍ يكرّر ما في التقويم تحته —
     فيقرأ الموظف حالته ثلاث مرّات قبل أن يصل إلى الزرّ. */
  hero.innerHTML = `
   <div class="hero__row">
    <div class="hero__clock">
    <div class="clock-day">${AR_DAYS[dow]}</div>
    <div class="clock-time num" id="liveClock">
      <span class="clock-seg" id="ckH">--</span><span class="clock-sep">:</span
      ><span class="clock-seg" id="ckM">--</span><span class="clock-sep">:</span
      ><span class="clock-seg clock-seg--s" id="ckS">--</span>
    </div>
    <div class="clock-date">${fmtDate(now)}</div>
    <div class="shift-line">${icon('clock')} ورديتك اليوم: ${esc(shiftLabelOf(dow))}</div>
    <div class="hero__geo ${rule.mode === 'remote' ? 'is-anywhere' : ''}" id="heroGeo">${
      rule.mode === 'remote'
        ? icon('globe') + ' مسموح لك التسجيل من أي مكان'
        : icon('pin') + ' ' + esc(rule.allowed.length === 1 ? rule.allowed[0].name
            : rule.allowed.length ? `${rule.allowed.length} فروع مسموحة` : 'لا يوجد فرع')
    }</div>
    </div>
    <div class="hero__act">
      <div class="todaycard" id="heroAct">
        <div class="todaycard__info">
          <span class="todaycard__label">اليوم</span>
          <div class="work-timer" id="workTimer"><span class="wt-idle">…</span></div>
        </div>
      </div>
    </div>
   </div>`;
  view.appendChild(hero);

  const clockEl = hero.querySelector('#liveClock');
  const segH = hero.querySelector('#ckH'), segM = hero.querySelector('#ckM'), segS = hero.querySelector('#ckS');

  /* ═══ كتابة الساعة بحركة ═══
     ⚠️ الخانة تُكتب **فقط حين تتغيّر قيمتها**: كتابة الثلاث كل ثانية تُعيد
     تشغيل حركة الساعات والدقائق ستّين مرة في الدقيقة، فتهتزّ الساعة كلها
     بلا سبب. المقارنة قبل الكتابة تجعل الحركة تقع عند التغيّر وحده.

     ⚠️ prefers-reduced-motion يُطفئ الحركة في CSS لا هنا — المنطق واحد،
     والتفضيل شأن العرض. */
  const bump = (elm, val) => {
    if (!elm || elm.textContent === val) return;
    elm.textContent = val;
    elm.classList.remove('is-tick');
    void elm.offsetWidth;          /* يُجبر إعادة تشغيل الحركة */
    elm.classList.add('is-tick');
  };
  const writeClock = (t) => {
    bump(segH, p2(t.getHours()));
    bump(segM, p2(t.getMinutes()));
    bump(segS, p2(t.getSeconds()));
  };
  const timerEl = hero.querySelector('#workTimer');

  /* لا فرع ولا وضع «عن بُعد» → ما يقدر يسجّل */
  if (rule.mode !== 'remote' && !rule.allowed.length) {
    /* حالتان مختلفتان: لا فروع أصلاً، أو له فرع لكنه موقوف. الرسالة الواحدة
       كانت تُرسل الموظف للموارد البشرية بشكوى خاطئة. */
    view.appendChild(el('div', 'card',
      `<div class="empty"><div class="big">${icon('pin', 'ic--empty')}</div>${
        rule.orphaned
          ? 'الفرع المسند لك موقوف حالياً. تواصل مع الموارد البشرية.'
          : 'لم يُضَف أي فرع للشركة بعد. تواصل مع الموارد البشرية.'
      }</div>`));
    const tickOnly = () => {
      const t = new Date();
      writeClock(t);
    };
    tickOnly(); setPageInterval(tickOnly, 1000);
    return;
  }

  /* ⚠️ الجدول التفصيلي حُذف (طلب المالك): «الحالة الآن» و«أول حضور» و«آخر
     انصراف» كانت تكرّر ما يقوله مؤقّت الدوام فوقها وتقويم الكشف تحتها —
     ثلاث قراءات لحالة واحدة. المكان وعدد الجلسات في تفاصيل اليوم بالتقويم.

     ⚠️ statusBox بقي متغيّراً فارغاً لا عنصراً في الصفحة: paintStatus ما
     زالت تُستدعى من paintAll ومن مستمع اللقطات، وحذفُها يحتاج تتبّع خمسة
     مواضع — فتُترك تكتب في عنصر غير معلَّق، وهو أرخص من كسر المستمع. */
  const statusBox = el('div', '');

  const actBtn = el('button', 'btn btn--xl', '…');
  actBtn.disabled = true;
  hero.querySelector('#heroAct').appendChild(actBtn);

  const card = el('div', 'card');

  const bioNote = el('p', 'help', '');
  card.appendChild(bioNote);
  /* تنبيه «بصمت على الجهاز فقط» — يُملأ من paintZkNote */
  const zkNote = el('div', '');
  card.appendChild(zkNote);
  const gateNote = el('div', '');
  card.appendChild(gateNote);
  card.appendChild(el('p', 'help',
    rule.mode === 'remote'
      ? 'حسابك مسموح له التسجيل من أي مكان. يُسجَّل موقعك على السجل للتوثيق فقط.'
      : `سيُطلب إذن الموقع. لازم تكون داخل نطاق الفرع${rule.radiusOverride != null ? ` (نطاقك الخاص ${rule.radiusOverride} م)` : ''}.`));
  card.appendChild(el('p', 'help',
    'جلستك تبقى مفتوحة حتى تضغط «تسجيل انصراف» بنفسك — إغلاق الصفحة أو قفل الجوال لا يسجّل انصراف.'));
  view.appendChild(card);

  const ref = doc(db, 'attendance', me.id + '_' + dateStr);
  /* ═══ سجل جهاز البصمة لنفس اليوم ═══
     ⚠️ مصدر ثانٍ مستقلّ تماماً: الجهاز في المكتب يكتب zkAttendance عبر
     الجسر، والتطبيق يكتب attendance. الموظف الذي بصم على الجهاز فقط كان
     يرى «لم تُسجّل بعد» فيظن أن بصمته ضاعت — وهي موجودة، لكن في المصدر
     الآخر الذي لا تقرأه هذه اللوحة.

     ⚠️ ولا يُغني أحدهما عن الآخر: المسير يُحسب من الجهاز، وصورة الموقع
     والإحداثيات لا تأتي إلا من الجوال. فنُظهر الحالة الحقيقية («داخل
     العمل») ونُبقي زرّ التسجيل من الجوال مطلوباً. */
  const zkRef = doc(db, 'zkAttendance', me.id + '_' + dateStr);
  let todayDoc = null, zkDoc = null, loaded = false, loadErr = false, busy = false;

  const isOpen = () => sessionsOf(todayDoc).some((s) => !s.out);
  /* دخل من الجهاز ولم يسجّل من الجوال بعد */
  const zkSessions = () => sessionsOf(zkDoc);
  const zkOnly = () => zkSessions().length > 0 && sessionsOf(todayDoc).length === 0;
  const zkFirstIn = () => { const ss = zkSessions(); return ss.length ? ss[0].in : null; };

  function paintTimer() {
    const ss = sessionsOf(todayDoc);
    if (!ss.length) {
      /* ⚠️ «لم تُسجّل بعد» كذبة على من بصم على الجهاز. نُظهر حالته الحقيقية
         ونترك التنبيه أدناه يشرح ما ينقصه. */
      if (zkOnly()) {
        const { secs, open } = workedSecs(zkSessions());
        timerEl.className = 'work-timer ' + (open ? 'live' : 'done');
        timerEl.innerHTML =
          `<span class="wt-label">داخل العمل — من جهاز البصمة</span>` +
          `<span class="wt-val num">${fmtDur(secs)}</span>`;
        return;
      }
      timerEl.className = 'work-timer';
      timerEl.innerHTML = '<span class="wt-idle">لم تُسجّل الحضور بعد</span>';
      return;
    }
    const { secs, open } = workedSecs(ss);
    timerEl.className = 'work-timer ' + (open ? 'live' : 'done');
    timerEl.innerHTML =
      `<span class="wt-label">${open ? 'داخل العمل' : 'خارج العمل — مجموع اليوم'}</span>` +
      `<span class="wt-val num">${fmtDur(secs)}</span>`;
  }

  /* ⚠️ القرار كله في attendButtonState() النقيّة داخل shifts.js — هنا رسمٌ
     فقط. الخلل الأصلي كان قراراً مدفوناً في هذا الملف الذي لا يُختبر في node. */
  function paintBtn() {
    if (busy) return;
    const st = attendButtonState({
      loaded, loadErr, hasOpenSession: isOpen(),
      gate: (loaded && !loadErr && !isOpen()) ? checkInGate() : null
    });
    actBtn.disabled = st.disabled;
    /* ⚠️ الصيغة تتبع الفعل لا الحالة: الحضور فعلٌ إيجابي فيمتلئ أخضر،
       والانصراف فعلٌ يُنهي فيُحدَّد أحمر بلا ملء — كما في مرجع التصميم.
       والتأخير يصبغه كهرمانياً: الزرّ يعمل لكنه يقول إنك متأخر قبل الضغط. */
    actBtn.className = 'btn attendbtn attendbtn--'
      + (st.kind === 'out' ? 'out' : st.late ? 'late' : 'in');
    actBtn.innerHTML = icon('clock') + esc(st.label);
  }

  /* بوّابة تسجيل الحضور — مصدر واحد تستعمله اللوحة والتنفيذ معاً، فلا
     يعرض الزرّ شيئاً وتقرّر الكتابة غيره. */
  function checkInGate() {
    return checkInAllowed(new Date(), myShiftToday(), {
      hasSessionToday: sessionsOf(todayDoc).length > 0,
      allowLate: getSettings().allowLateCheckIn !== false
    });
  }

  /* سطر يشرح للموظف حالته بدل زرّ مقفل بلا تفسير */
  function paintGateNote() {
    gateNote.innerHTML = '';
    if (!loaded || loadErr || isOpen()) return;
    const g = checkInGate();
    if (g.ok && g.late) {
      gateNote.appendChild(callout('warn', 'انتهى وقت تسجيل الحضور لورديتك',
        'ما زال بإمكانك التسجيل لأنك لم تسجّل اليوم إطلاقاً، وسيُوسم السجل «حضور متأخر» ويظهر لمديرك.'));
    } else if (!g.ok && g.reason === 'closed') {
      gateNote.appendChild(callout('warn', 'انتهى وقت تسجيل الحضور لورديتك',
        'راجع مديرك أو قدّم طلب تصحيح بصمة.'));
    } else if (!g.ok && g.reason === 'early' && g.opensAt) {
      gateNote.appendChild(callout('info', 'لم يبدأ وقت التسجيل بعد',
        `يفتح التسجيل الساعة ${hm(g.opensAt)}.`));
    }
  }

  function paintStatus() {
    if (loadErr) {
      statusBox.innerHTML = '<div class="empty text-red">تعذّر قراءة سجل اليوم. لم يتغيّر شيء — حدّث الصفحة وحاول مرة ثانية.</div>';
      return;
    }
    const ss = sessionsOf(todayDoc);
    const open = isOpen();
    const first = ss[0], last = ss[ss.length - 1];
    const where = todayDoc && todayDoc.branchName ? esc(todayDoc.branchName) : '—';
    statusBox.innerHTML = `
      <div class="detail-line"><span class="k">الحالة الآن</span><span class="v ${(open || zkOnly()) ? 'text-green' : 'text-muted'}">${
        open ? 'داخل العمل'
             : zkOnly() ? 'داخل العمل — من جهاز البصمة'
             : (ss.length ? 'خارج العمل' : 'لم تُسجّل بعد')}</span></div>
      <div class="detail-line"><span class="k">المكان</span><span class="v">${where}</span></div>
      <div class="detail-line"><span class="k">عدد جلسات اليوم</span><span class="v num">${ss.length}</span></div>
      <div class="detail-line"><span class="k">أول حضور</span><span class="v num text-green">${first ? hm(first.in) : '—'}</span></div>
      <div class="detail-line"><span class="k">آخر انصراف</span><span class="v num text-red">${(last && last.out) ? hm(last.out) : '—'}</span></div>`;
  }

  /* ⚠️ تنبيه لا منع: الموظف داخل العمل فعلاً، وبصمته على الجهاز هي ما
     يُحسب عليه الراتب. ما ينقص هو تسجيل الجوال — وهو مصدر الموقع والصورة.
     فالرسالة تُخبره بما ينقص ولا تُنكر ما فعل. */
  function paintZkNote() {
    zkNote.innerHTML = '';
    if (!zkOnly()) return;
    const t = zkFirstIn();
    zkNote.appendChild(callout('warn',
      `بصمت على جهاز الحضور${t ? ' الساعة ' + hm(t) : ''}`,
      'حضورك مسجَّل على الجهاز ويُحسب في راتبك. تبقى خطوة واحدة: سجّل من الجوال أيضاً ' +
      'ليُوثَّق موقعك — جهاز البصمة لا يسجّل أين كنت.'));
  }

  const paintAll = () => { paintStatus(); paintTimer(); paintBtn(); paintZkNote(); paintGateNote(); };

  /* اشتراك لحظي: الحالة تُستعاد صحيحة عند إعادة فتح الصفحة أو الجوال */
  trackSubscription(onSnapshot(ref,
    (snap) => { todayDoc = snap.exists() ? snap.data() : null; loaded = true; loadErr = false; paintAll(); },
    (err) => { console.error('att', err); loaded = true; loadErr = true; paintAll(); }));

  /* ⚠️ اشتراك ثانٍ مستقلّ، وفشلُه لا يُعطّل اللوحة: الجسر قد يكون متوقّفاً
     أو السجل غير موجود اليوم — وكلاهما حالة طبيعية لا خطأ. الموظف الذي
     يسجّل من جواله وحده يجب ألّا يرى «تعذّر قراءة حالتك» لأن جهاز البصمة
     في المكتب صامت. */
  trackSubscription(onSnapshot(zkRef,
    (snap) => { zkDoc = snap.exists() ? snap.data() : null; paintAll(); },
    (err) => { console.error('zk', err); zkDoc = null; paintAll(); }));

  actBtn.onclick = async () => {
    if (!loaded || loadErr || busy) return;
    /* ⚠️ لو تغيّر اليوم والتبويب مفتوح، الوثيقة المربوطة صارت لأمس. الكتابة
       تُرفض من القاعدة برسالة مضلّلة عن ساعة الجهاز، أو — أسوأ — تُغلق جلسة
       أمس بطابع اليوم فتظهر وردية 24 ساعة. نُعيد البناء بدل ذلك. */
    if (ymdKsa() !== dateStr) { toast('تغيّر التاريخ — جارٍ التحديث'); rerender(); return; }
    await doAttendance(isOpen() ? 'out' : 'in', ref, actBtn, bioNote, rule,
      (b) => { busy = b; if (!b) paintAll(); });
  };

  /* ── تذكير الانصراف ──
     ⚠️ الإذن يُطلب بضغطة الموظف لا تلقائياً: طلبه بلا سياق يرفضه المستخدم
     غالباً، والرفض في كثير من المتصفحات نهائي لا يُستعاد إلا من الإعدادات. */
  const remindRow = el('p', 'help', '');
  card.appendChild(remindRow);
  const paintRemind = () => {
    const st = notifyState();
    if (st === 'granted') {
      remindRow.textContent = 'تذكير الانصراف مُفعَّل — سيصلك تنبيه لو انتهت وردية اليوم وجلستك مفتوحة.';
      return;
    }
    if (st === 'unsupported' || st === 'denied') {
      remindRow.textContent = st === 'denied'
        ? 'تذكير الانصراف موقوف — فعّل الإشعارات لهذا الموقع من إعدادات متصفحك.'
        : '';
      return;
    }
    remindRow.textContent = '';
    remindRow.appendChild(document.createTextNode('يمكن تنبيهك لو نسيت تسجيل الانصراف. '));
    const b = el('button', 'btn ghost sm', 'فعّل التذكير');
    b.onclick = async () => { await askPermission(); paintRemind(); };
    remindRow.appendChild(b);
  };
  paintRemind();

  const tick = () => {
    const t = new Date();
    /* عبور منتصف الليل — أعد بناء اللوحة كاملة على اليوم الجديد */
    if (ymdKsa(t) !== dateStr) { rerender(); return; }
    writeClock(t);
    paintTimer(); paintBtn();
    /* الفحص كل ثانية رخيص: يخرج فوراً ما لم تكن هناك جلسة مفتوحة، ولا يُطلق
       التنبيه إلا مرة واحدة في اليوم بفضل الحارس في reminders.js. */
    checkCheckoutReminder(isOpen());
  };
  tick();
  setPageInterval(tick, 1000);

  /* الجوال يُجمّد التبويبات في الخلفية، فالمؤقّت لا يعمل ليلاً. عند العودة
     للتبويب نتحقق من التاريخ فوراً بدل انتظار النبضة التالية. */
  const onVisible = () => { if (!document.hidden && ymdKsa() !== dateStr) rerender(); };
  document.addEventListener('visibilitychange', onVisible);
  onCleanup(() => document.removeEventListener('visibilitychange', onVisible));
}

/* ═══════════════════ تنفيذ التسجيل ═══════════════════ */
async function doAttendance(kind, ref, btn, bioNote, rule, setBusy) {
  const me = getMe();
  setBusy(true); btn.disabled = true;
  const fail = (msg) => { toast(msg, 'err'); setBusy(false); };

  /* ⚠️ الفحص هنا مؤقّت لا نهائي: القرار الحقيقي يُعاد بعد قراءة السيرفر
     في ① — بين فتح الصفحة والضغط قد يكون الموظف سجّل من تبويب آخر. */
  if (kind === 'in') {
    const g = checkInAllowed(new Date(), myShiftToday(), {
      hasSessionToday: false,
      allowLate: getSettings().allowLateCheckIn !== false
    });
    if (!g.ok) return fail('انتهى وقت تسجيل الحضور لورديتك');
  }

  /* ① الحالة الحقيقية من السيرفر قبل أي كتابة — بلا تخمين.
     القاعدة تشترط أن تبقى الجلسات السابقة كما هي، فالقراءة الطازجة ضرورية. */
  btn.textContent = 'تحقّق من حالتك…';
  let pre;
  try { const snap = await getDoc(ref); pre = snap.exists() ? snap.data() : null; }
  catch (e) { console.error(e); return fail('تعذّر قراءة سجل اليوم — تحقّق من الإنترنت'); }

  const preSessions = sessionsOf(pre).map((x) => ({ ...x }));
  const openIdx = (() => {
    for (let i = preSessions.length - 1; i >= 0; i--) if (!preSessions[i].out) return i;
    return -1;
  })();
  if (kind === 'in'  && openIdx >= 0) return fail('أنت مسجّل دخول بالفعل — سجّل الانصراف أولاً');
  if (kind === 'out' && openIdx < 0)  return fail('لست مسجّل دخول حالياً');
  if (kind === 'in'  && preSessions.length >= 12) return fail('وصلت الحد الأقصى لجلسات اليوم');

  /* ⚠️ القرار النهائي لتسجيل الحضور — بعد معرفة جلسات اليوم الحقيقية من
     السيرفر. القاعدة المعتمَدة: من لم يسجّل اليوم إطلاقاً يُسمح له بحضور
     متأخر موسوم، ومن عنده جلسة سابقة انتهى يومه.
     ⚠️ ولا تُطبَّق هذه البوّابة على الانصراف أبداً — الانصراف لا يُقفل. */
  const shiftNow = myShiftToday();
  const gate = kind === 'in'
    ? checkInAllowed(new Date(), shiftNow, {
        hasSessionToday: preSessions.length > 0,
        allowLate: getSettings().allowLateCheckIn !== false
      })
    : { ok: true };
  if (!gate.ok) {
    return fail(gate.reason === 'done'
      ? 'أنهيت دوامك اليوم — لا يمكن تسجيل حضور جديد'
      : gate.reason === 'early'
        ? 'لم يبدأ وقت تسجيل الحضور لورديتك بعد'
        : 'انتهى وقت تسجيل الحضور لورديتك');
  }

  /* ② الموقع — فشله قاتل للموظف داخل الفرع فقط */
  btn.textContent = 'تحديد الموقع…';
  let pos = null;
  try { pos = await getPosition(); }
  catch (e) {
    if (rule.mode !== 'remote')
      return fail(e.code === 1 ? 'رفضت إذن الموقع — لا يمكن التسجيل' : 'تعذّر تحديد موقعك');
    pos = null;   /* عن بُعد: الموقع للتوثيق فقط */
  }

  /* ③ الفرع والمسافة */
  let near = null, branchId = REMOTE_BRANCH_ID, branchName = REMOTE_LABEL;
  if (rule.mode === 'remote') {
    if (pos) {
      const list = rule.allowed.length ? rule.allowed : activeBranches();
      near = list.length ? nearestBranch(pos, list, null) : null;
      /* موجود فعلاً داخل فرع → وثّقه باسمه بدل «عن بُعد» */
      if (near && near.inside) { branchId = near.b.id; branchName = near.b.name; }
    }
  } else {
    if (pos.acc && pos.acc > 1000)
      return fail(`دقة الموقع ضعيفة (±${Math.round(pos.acc)} م) — شغّل GPS واقترب من نافذة`);
    near = nearestBranch(pos, rule.allowed, rule.radiusOverride);
    if (!near.inside)
      return fail(`أنت خارج نطاق ${near.b.name} (${fmtDist(near.dist)}، والمسموح ${near.rad} م). اقترب من الفرع.`);
    branchId = near.b.id; branchName = near.b.name;
  }

  /* ═══ ③ب صورة إثبات الموقع ═══

     مطلوبة فقط ممن يسجّل من خارج نطاق المبنى: وضع «من أي مكان»، أو من كان
     داخل الوضع الميداني لكنه فعلياً خارج حدود أي فرع.
     من يسجّل داخل الفرع لا يُطلب منه شيء — لا يُثقَل الطريق الطبيعي بخطوة.

     ⚠️ تُلتقط قبل الحفظ لا بعده: صورة تفشل بعد كتابة الجلسة تترك سجلاً بلا
     دليل، ولا وسيلة لإجبار الموظف على إعادتها. */
  const needsPhoto = rule.mode === 'remote' || !(near && near.inside);
  let photo = null;
  if (needsPhoto) {
    btn.textContent = 'التقاط صورة الموقع…';
    /* capturePhoto تفتح نافذتها وتتولّى أخطاء الضغط بنفسها — تُرجع الصورة أو
       null لو أغلق الموظف النافذة، ولا ترمي. */
    photo = await capturePhoto();
    if (!photo)
      return fail('تسجيلك من خارج نطاق الفرع يحتاج صورة للموقع — افتح الكاميرا وصوّر مكانك');
  }

  /* ④ البصمة — عجزُ الجهاز لا يمنع، وإلغاءُ الموظف يمنع.
     ⚠️ الفرق بين الحالتين هو كل شيء هنا:

     النسخة الأقدم كانت تمنع التسجيل عند أي فشل، فالموظف الذي جواله بلا
     قفل شاشة يقف داخل الفرع عاجزاً عن التسجيل — عطل حقيقي.
     ثم صُحِّح بأن يمضي التسجيل مهما كانت النتيجة، وهذا بالغ في الاتجاه
     المضادّ: من يضغط «تسجيل الحضور» ثم يُلغي شاشة الوجه/البصمة قد ألغى
     العملية قصداً — ومع ذلك كان حضوره يُسجَّل، فيكتشف أنه «داخل العمل»
     بلا أن يُتمّ شيئاً، ولا سبيل للتراجع إلا بانصراف وهمي.

     فالمعيار ليس «هل نجحت البصمة» بل «من أوقفها»:
       • ألغاها الموظف بنفسه  → إلغاء العملية كاملةً، ولا يُكتب شيء
       • عجز الجهاز أو بيئته  → تمضي وتُسجَّل النتيجة على الجلسة للمراجعة */
  btn.textContent = 'تحقّق بالبصمة…';
  const bio = await verifyBiometric();

  /* إلغاء متعمَّد: رفض شاشة التحقق، أو رفض ربط الجهاز أول مرة. كلاهما
     ضغطةُ «إلغاء» من الموظف لا قصورٌ في الجهاز. */
  if (bioUserCancelled(bio)) {
    bioNote.textContent = '';
    /* ليس خطأً بل قرار الموظف — رسالة محايدة لا حمراء */
    toast(kind === 'in' ? 'أُلغي تسجيل الحضور' : 'أُلغي تسجيل الانصراف');
    setBusy(false);
    return;
  }

  /* «تم الربط» نجاح لا فشل — إلحاق «سيُسجَّل حضورك بدونها» به يخبر الموظف
     أن الربط فشل وهو قد نجح للتو. */
  bioNote.textContent = bio.ok ? ''
    : bio.reason === 'enrolled-now' ? bioReasonAr(bio.reason)
    : (bioReasonAr(bio.reason) + ' — سيُسجَّل حضورك بدونها');

  /* ⑤ الكتابة */
  btn.textContent = 'جارٍ الحفظ…';
  try {
    const now = new Date(), dow = now.getDay();
    const loc = pos ? { lat: pos.lat, lng: pos.lng } : null;

    if (kind === 'in') {
      const sessions = preSessions.concat([{
        in: now, out: null,
        inLoc: loc,
        inAcc: pos ? Math.round(pos.acc || 0) : null,
        inDist: near ? near.dist : null,
        inBranchId: branchId, inBranchName: branchName,
        inMode: rule.mode, inGeoDenied: !pos,
        inBio: bio.ok, inBioReason: bio.ok ? '' : (bio.reason || ''),
        /* علامة على السجل أن لهذه الجلسة صورة إثبات — الأدمن يعرف أين يبحث
           بلا استعلام إضافي على كل صف. */
        inPhoto: !!photo,
        /* ⚠️ وسمان للمراجعة لا للمنع — الحضور سُجّل فعلاً في الحالتين.
           lateCheckIn: سجّل بعد قفل نافذة ورديته لأنه لم يسجّل اليوم إطلاقاً.
           offDayWork:  دوام في يوم راحته. لا نمنعه، لكن لا نُخفيه عن مديره. */
        ...(gate.late ? { lateCheckIn: true } : {}),
        ...(gate.reason === 'offDay' ? { offDayWork: true } : {}),
        source: 'web'
      }]);
      await setDoc(ref, {
        employeeUid: me.id, employeeName: me.name, employeeEmpId: me.empId || '',
        department: me.department || '', date: ymdKsa(now), dow,
        shiftLabel: shiftLabelOf(dow), source: 'web',
        branchId, branchName, workMode: rule.mode,
        ...(gate.late ? { lateCheckIn: true } : {}),
        sessions
      }, { merge: true });
      /* ⚠️ الصورة تُحفظ بعد نجاح الجلسة. لو فشل حفظها لا نُبطل الحضور — الموظف
         سجّل فعلاً، وموقعه محفوظ على الجلسة. نُبلغه فقط ليعيد المحاولة. */
      if (photo) {
        try { await savePhoto({ dateStr: ymdKsa(now), sessionIdx: sessions.length - 1, kind: 'in', photo, pos }); }
        catch (e) { console.error('photo', e); toast('سُجّل حضورك، لكن تعذّر رفع الصورة', 'err'); }
      }
      toast(`تم تسجيل الحضور — ${branchName}`, 'ok');
    } else {
      const sessions = preSessions;
      sessions[openIdx] = {
        ...sessions[openIdx],
        out: now,
        outLoc: loc,
        outAcc: pos ? Math.round(pos.acc || 0) : null,
        outDist: near ? near.dist : null,
        outBranchId: branchId, outBranchName: branchName,
        outMode: rule.mode, outGeoDenied: !pos,
        outBio: bio.ok, outBioReason: bio.ok ? '' : (bio.reason || ''),
        outPhoto: !!photo
      };
      await setDoc(ref, { sessions }, { merge: true });
      if (photo) {
        try { await savePhoto({ dateStr: ymdKsa(now), sessionIdx: openIdx, kind: 'out', photo, pos }); }
        catch (e) { console.error('photo', e); toast('سُجّل انصرافك، لكن تعذّر رفع الصورة', 'err'); }
      }
      toast('تم تسجيل الانصراف', 'ok');
    }
  } catch (e) {
    console.error(e);
    return fail(e.code === 'permission-denied'
      ? 'رُفض الحفظ — تأكد أن ساعة جهازك مضبوطة على الوقت الصحيح'
      : 'تعذّر الحفظ — تحقّق من الإنترنت');
  }
  setBusy(false);
}
