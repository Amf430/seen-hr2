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
import { getMe } from '../lib/state.js';
import { ymd, AR_DAYS } from '../lib/dates.js';
import { fmtDate, fmtDur, hm, p2, fmtDist } from '../lib/format.js';
import { sessionsOf, workedSecs } from '../lib/attendance.js';
import { shiftLabelOf, shiftEndPassed } from '../lib/shifts.js';
import { getPosition, geoRuleFor, nearestBranch, activeBranches, REMOTE_BRANCH_ID, REMOTE_LABEL } from '../lib/geo.js';
import { verifyBiometric, bioReasonAr, setCredentialPersister } from '../lib/biometric.js';
import { saveBioCredentials } from '../lib/users.js';
import { setPageInterval, trackSubscription } from '../lib/lifecycle.js';

/* الفهرس البعيد لمفاتيح البصمة يُحفظ على وثيقة الموظف */
setCredentialPersister(saveBioCredentials);

export function attendPanel(view) {
  const me = getMe();
  const now = new Date(), dow = now.getDay(), dateStr = ymd(now);
  const rule = geoRuleFor(me);

  /* ── بطاقة الساعة ── */
  const hero = el('div', 'attend-hero');
  hero.innerHTML = `
    <div class="clock-day">${AR_DAYS[dow]}</div>
    <div class="clock-time num" id="liveClock">--:--:--</div>
    <div class="clock-date">${fmtDate(now)}</div>
    <div class="shift-line">🕗 ورديتك اليوم: ${esc(shiftLabelOf(dow))}</div>
    <div class="hero__geo ${rule.mode === 'remote' ? 'is-anywhere' : ''}" id="heroGeo">${
      rule.mode === 'remote'
        ? '🌍 مسموح لك التسجيل من أي مكان'
        : '📍 ' + esc(rule.allowed.length === 1 ? rule.allowed[0].name
            : rule.allowed.length ? `${rule.allowed.length} فروع مسموحة` : 'لا يوجد فرع')
    }</div>
    <div class="work-timer" id="workTimer"><span class="wt-idle">…</span></div>`;
  view.appendChild(hero);

  const clockEl = hero.querySelector('#liveClock');
  const timerEl = hero.querySelector('#workTimer');

  /* لا فرع ولا وضع «عن بُعد» → ما يقدر يسجّل */
  if (rule.mode !== 'remote' && !rule.allowed.length) {
    view.appendChild(el('div', 'card',
      '<div class="empty"><div class="big">📍</div>لم يُضَف أي فرع للشركة بعد. تواصل مع الموارد البشرية.</div>'));
    const tickOnly = () => {
      const t = new Date();
      clockEl.textContent = `${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}`;
    };
    tickOnly(); setPageInterval(tickOnly, 1000);
    return;
  }

  const card = el('div', 'card');
  const statusBox = el('div', '', '<div class="empty"><span class="spinner"></span> جارٍ تحميل حالتك…</div>');
  card.appendChild(statusBox);

  const actBtn = el('button', 'btn btn--xl', '…');
  actBtn.disabled = true;
  card.appendChild(actBtn);

  const bioNote = el('p', 'help', '');
  card.appendChild(bioNote);
  card.appendChild(el('p', 'help',
    rule.mode === 'remote'
      ? '🌍 حسابك مسموح له التسجيل من أي مكان. يُسجَّل موقعك على السجل للتوثيق فقط.'
      : `سيُطلب إذن الموقع. لازم تكون داخل نطاق الفرع${rule.radiusOverride != null ? ` (نطاقك الخاص ${rule.radiusOverride} م)` : ''}.`));
  card.appendChild(el('p', 'help',
    '🔒 جلستك تبقى مفتوحة حتى تضغط «تسجيل انصراف» بنفسك — إغلاق الصفحة أو قفل الجوال لا يسجّل انصراف.'));
  view.appendChild(card);

  const ref = doc(db, 'attendance', me.id + '_' + dateStr);
  let todayDoc = null, loaded = false, loadErr = false, busy = false;

  const isOpen = () => sessionsOf(todayDoc).some((s) => !s.out);

  function paintTimer() {
    const ss = sessionsOf(todayDoc);
    if (!ss.length) {
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

  function paintBtn() {
    if (busy) return;
    if (!loaded)  { actBtn.disabled = true;  actBtn.className = 'btn btn--xl'; actBtn.textContent = '… جارٍ التحميل'; return; }
    if (loadErr)  { actBtn.disabled = true;  actBtn.className = 'btn btn--xl'; actBtn.textContent = '⚠️ تعذّر قراءة حالتك — حدّث الصفحة'; return; }
    if (isOpen()) { actBtn.disabled = false; actBtn.className = 'btn btn--xl danger'; actBtn.textContent = '🔴 تسجيل انصراف'; return; }
    if (shiftEndPassed()) { actBtn.disabled = true; actBtn.className = 'btn btn--xl'; actBtn.textContent = '⛔ انتهى وقت الدوام'; return; }
    actBtn.disabled = false; actBtn.className = 'btn btn--xl'; actBtn.textContent = '🟢 تسجيل حضور';
  }

  function paintStatus() {
    if (loadErr) {
      statusBox.innerHTML = '<div class="empty text-red">⚠️ تعذّر قراءة سجل اليوم. لم يتغيّر شيء — حدّث الصفحة وحاول مرة ثانية.</div>';
      return;
    }
    const ss = sessionsOf(todayDoc);
    const open = isOpen();
    const first = ss[0], last = ss[ss.length - 1];
    const where = todayDoc && todayDoc.branchName ? esc(todayDoc.branchName) : '—';
    statusBox.innerHTML = `
      <div class="detail-line"><span class="k">الحالة الآن</span><span class="v ${open ? 'text-green' : 'text-muted'}">${
        open ? '🟢 داخل العمل' : (ss.length ? 'خارج العمل' : 'لم تُسجّل بعد')}</span></div>
      <div class="detail-line"><span class="k">المكان</span><span class="v">${where}</span></div>
      <div class="detail-line"><span class="k">عدد جلسات اليوم</span><span class="v num">${ss.length}</span></div>
      <div class="detail-line"><span class="k">أول حضور</span><span class="v num text-green">${first ? hm(first.in) : '—'}</span></div>
      <div class="detail-line"><span class="k">آخر انصراف</span><span class="v num text-red">${(last && last.out) ? hm(last.out) : '—'}</span></div>`;
  }

  const paintAll = () => { paintStatus(); paintTimer(); paintBtn(); };

  /* اشتراك لحظي: الحالة تُستعاد صحيحة عند إعادة فتح الصفحة أو الجوال */
  trackSubscription(onSnapshot(ref,
    (snap) => { todayDoc = snap.exists() ? snap.data() : null; loaded = true; loadErr = false; paintAll(); },
    (err) => { console.error('att', err); loaded = true; loadErr = true; paintAll(); }));

  actBtn.onclick = async () => {
    if (!loaded || loadErr || busy) return;
    await doAttendance(isOpen() ? 'out' : 'in', ref, actBtn, bioNote, rule,
      (b) => { busy = b; if (!b) paintAll(); });
  };

  const tick = () => {
    const t = new Date();
    clockEl.textContent = `${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}`;
    paintTimer(); paintBtn();
  };
  tick();
  setPageInterval(tick, 1000);
}

/* ═══════════════════ تنفيذ التسجيل ═══════════════════ */
async function doAttendance(kind, ref, btn, bioNote, rule, setBusy) {
  const me = getMe();
  setBusy(true); btn.disabled = true;
  const fail = (msg) => { toast(msg, 'err'); setBusy(false); };

  if (kind === 'in' && shiftEndPassed())
    return fail('انتهى وقت الدوام الرسمي — لا يمكن تسجيل الحضور');

  /* ① الحالة الحقيقية من السيرفر قبل أي كتابة — بلا تخمين.
     القاعدة تشترط أن تبقى الجلسات السابقة كما هي، فالقراءة الطازجة ضرورية. */
  btn.textContent = '🔄 تحقّق من حالتك…';
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

  /* ② الموقع — فشله قاتل للموظف داخل الفرع فقط */
  btn.textContent = '📍 تحديد الموقع…';
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

  /* ④ البصمة — لا تمنع التسجيل أبداً.
     في النسخة القديمة كان إلغاء الموظف لشاشة المفتاح على أندرويد يرمي
     NotAllowedError فيوقف الحفظ كلياً، فيقف داخل الفرع عاجزاً عن التسجيل. */
  btn.textContent = '👆 تحقّق بالبصمة…';
  const bio = await verifyBiometric();
  /* «تم الربط» نجاح لا فشل — لا نُلحق به «سيُسجَّل حضورك بدونها» */
  bioNote.textContent = bio.ok ? ''
    : bio.reason === 'enrolled-now' ? ('✅ ' + bioReasonAr(bio.reason))
    : ('ℹ️ ' + bioReasonAr(bio.reason) + ' — سيُسجَّل حضورك بدونها');

  /* ⑤ الكتابة */
  btn.textContent = '💾 جارٍ الحفظ…';
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
        source: 'web'
      }]);
      await setDoc(ref, {
        employeeUid: me.id, employeeName: me.name, employeeEmpId: me.empId || '',
        department: me.department || '', date: ymd(now), dow,
        shiftLabel: shiftLabelOf(dow), source: 'web',
        branchId, branchName, workMode: rule.mode,
        sessions
      }, { merge: true });
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
        outBio: bio.ok, outBioReason: bio.ok ? '' : (bio.reason || '')
      };
      await setDoc(ref, { sessions }, { merge: true });
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
