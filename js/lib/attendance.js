/* ═══════════════════════════════════════════════════════════════════════════
   سجلات الحضور — الجلسات والحالة اليومية.

   ⚠️ sessionsOf و workedSecs و lastOutOf و buildDailyStatus منقولة حرفياً
   (السطور 503-513، 2151-2156، 2160-2213). buildDailyStatus هي التي تقرّر
   «حاضر / متأخر / غائب / إجازة / نسيان بصمة» لكل يوم لكل موظف، وتظهر في
   التقارير وفي بروفايل الموظف. لا تُعاد صياغتها.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, collection, query, where, getDocs } from './firebase.js';
import { ymd, AR_DAYS } from './dates.js';
import { tsToDate } from './format.js';
import { resolveShift, shiftWindowFor, compensableMin,
         MISSING_OUT_AFTER_MIN, LATE_GRACE_MIN } from './shifts.js';
/* ⚠️ لا دورة استيراد: requests.js لا يستورد هذا الملف ولا شيء في شجرته
   (state / perms / dom / audit / dates / firebase) يصل إليه. */
import { permWindowOpen } from './requests.js';
import { hm } from './format.js';
import { employeeUidsOf, requestBelongsToEmployee, permissionDisplayLabel } from './permission-link.js';
import { dayBounds } from './attendance-metrics.js';
import { permissionWorkTime, permissionIntervalsLabel } from './permission-work-time.js';

/* ═══ كل معرّفات الموظف — الحالي وما سبقه ═══

   سجلات الحضور مُفهرسة بالـUID (`zkAttendance/{uid}_{date}`)، و«استعادة
   الوصول» تُنشئ حساباً جديداً بـUID جديد. فبلا هذه القائمة يتيتّم تاريخ
   الموظف كله عند أول استعادة، ويعتبره المسير غياباً فيخصم عليه.

   ⚠️ هنا لا في users.js: المسير و buildDailyStatus يستوردان هذا الملف
   أصلاً، ووضعها في users.js كان يجرّ إدارة الموظفين كاملةً إلى شجرة
   استيراد المسير بلا داعٍ.

   ⚠️ الحالي أولاً — السجل الحالي أولى عند التطابق. */
export const uidsOf = employeeUidsOf;

/* أول سجل يوجد لهذا الموظف في هذا اليوم، تحت أيٍّ من معرّفاته */
export const recFor = (recMap, u, dateStr) => {
  for (const uid of uidsOf(u)) {
    const r = recMap[uid + '_' + dateStr];
    if (r) return r;
  }
  return undefined;
};

/* الشكل القديم كان checkIn/checkOut مفردين، والجديد مصفوفة جلسات.
   ندعم الاثنين حتى تبقى السجلات القديمة مقروءة. */
export function sessionsOf(d) {
  if (!d) return [];
  if (Array.isArray(d.sessions)) return d.sessions;
  if (d.checkIn) return [{ in: d.checkIn, out: d.checkOut || null, inLoc: d.checkInLoc, outLoc: d.checkOutLoc }];
  return [];
}

/* ⚠️ `until` معامل جديد لم يكن في النسخة القديمة، ووجوده يصلح خطأً حقيقياً:
   الجلسة المفتوحة كانت تُحتسب من وقت الدخول حتى «الآن» مهما مضى. موظف نسي
   بصمة الانصراف يوم 27 يوليو كان يظهر في التقرير بـ«114:23:44» ساعة — العدّاد
   ظلّ يزيد خمسة أيام. مع تمرير `until` تُقصّ الجلسة المفتوحة عند نهاية
   ورديتها، فيظهر رقم منطقي.

   بلا `until` يبقى السلوك كما كان تماماً — وهذا مقصود: مؤقّت الدوام الحيّ في
   شاشة الحضور يحتاج فعلاً أن يعدّ حتى اللحظة. */
export function workedSecs(sessions, until) {
  let t = 0, open = false;
  for (const s of sessions) {
    const i = tsToDate(s.in); if (!i) continue;
    const o = tsToDate(s.out);
    if (o) t += (o - i) / 1000;
    else {
      const stop = (until != null) ? Math.min(Date.now(), until) : Date.now();
      t += Math.max(0, (stop - i) / 1000);
      open = true;
    }
  }
  return { secs: t, open };
}

export function lastOutOf(sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].out) return tsToDate(sessions[i].out);
  }
  return null;
}

/* ═══ حدّا اليوم — أول بصمة وآخر بصمة ═══

   الجهاز يسجّل بصمات لا جلسات، والجسر يزاوجها بالتناوب: بصمة تفتح جلسة
   والتالية تقفلها (bridge/zk_bridge.py — push_punch). فبصمة واحدة زائدة أو
   ناقصة تقلب دور كل ما بعدها لبقية اليوم.

   الحالة الواقعية: موظف بصم ٠٩:٥٠ دخولاً، ثم بصم ١٠:٤٧، ثم نسي أنه بصم
   فبصم ١٨:٠٠ عند انصرافه. التناوب قرأ ١٨:٠٠ «دخولاً» جديداً بقي مفتوحاً،
   فظهر اليوم بـ«نسيان بصمة الخروج» وخروجه المسجَّل ١٠:٤٧ — وساعاته ٥٧ دقيقة.

   فيُقرأ اليوم بحدّيه: أبكر بصمة دخولاً وأحدث بصمة خروجاً، أياً كان موقعها
   في الجلسات. الجلسات تبقى كما كتبها الجهاز — `zkAttendance` سجل لا يُعدَّل
   (`allow write: if false`) والتصحيح في القراءة وحدها، فينسحب على السجلات
   القديمة أيضاً بلا أي كتابة.

   ⚠️ الثمن المقصود: فترة الخروج في منتصف اليوم لم تعد تُطرح من الساعات
   المعروضة — اليوم صار مدىً واحداً من أول بصمة لآخرها. وهذا لا يمسّ الخصم:
   الخصم مبني على دقائق التأخير والخروج المبكر لا على الساعات.

   ⚠️ بصمة واحدة في اليوم كلّه تبقى دخولاً بلا خروج، فنسيان الانصراف
   الحقيقي ما زال يُكتشف. */
export { dayBounds };

/* ── سجلات الموظف نفسه ──
   ⚠️ لا تستعمل fetchAttendance هنا. هي تستعلم بالتاريخ فقط، وقاعدة القراءة
   تسمح للموظف بسجلاته هو فقط — وFirestore يرفض الاستعلام كاملاً ما لم يكن
   مقيَّداً بحيث تحقّق كل نتيجة محتملة شرط القاعدة، فيعود `permission-denied`
   لا نتيجةً منقوصة. وقعت هذه بعينها في «كشف حضوري»: الشاشة ابتلعت الرفض
   بـ`.catch(() => [])` فقرأت صفر سجلات، و buildDailyStatus تقرأ صفر سجلات
   غياباً — فظهر موظفٌ حاضرٌ كلَّ أيامه غائباً في كلّها. ما عجزنا عن قراءته
   ليس غياباً، ولا يُعرض كأنه هو.

   ⚠️ كانت هذه الدالة تقرأ يوماً يوماً بـgetDoc تفادياً للفهرس المركّب: معرّف
   الوثيقة معروف مسبقاً (uid_YYYY-MM-DD) فلا تحتاج استعلاماً. سقط ذلك السبب —
   `firestore.indexes.json` صار موجوداً ومنشوراً (المرحلة ٠)، والثمن كان
   ٦٢ قراءة نقطية في كل فتحة صفحة (٣١ يوماً × مجموعتين) بينما الاستعلام
   الواحد يقرأ الموجود وحده. على الخطة المجانية هذا فرق يُحسب.

   ⚠️ `in` لا `==`: «استعادة الوصول» تُنشئ حساباً بـuid جديد وسجلاته القديمة
   مفهرسة بالقديم. القاعدة `isMine()` تقبل الاثنين فيقبلهما الاستعلام — وإلا
   يتيتّم تاريخ الموظف كله عند أول استعادة ويظهر غياباً لم يقع.

   ⚠️ الموظف يحتاج (employeeUid,date). المدير يضيف department، ويستفيد من
   دمج الفهرسين الموجودين (department,date) و(employeeUid,date) لكل مجموعة.
   الإنتاج لا يبنيهما من الملف تلقائياً، فيجب التحقق أنهما READY قبل الواجهة. */
export async function fetchMyAttendance(cycle, uid, coll = 'attendance', department = '') {
  const uids = (Array.isArray(uid) ? uid : [uid]).filter(Boolean).slice(0, 30);
  if (!uids.length) return [];
  const parts = [collection(db, coll)];
  /* ⚠️ مدير القسم يحتاج القيود الثلاثة داخل Query نفسها. فلترة القسم بعد
     القراءة لا تثبت sameDept()، وقراءة القسم كله توسّع البيانات بلا حاجة. */
  if (department) parts.push(where('department', '==', department));
  parts.push(where('employeeUid', 'in', uids),
    where('date', '>=', ymd(cycle.start)), where('date', '<=', ymd(cycle.end)));
  const snap = await getDocs(query(...parts));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* جلب سجلات الحضور ضمن دورة — من أي مجموعة (الموقع أو الجهاز).
   للأدمن فقط: القاعدة تسمح له بقراءة الكل، فالاستعلام بالتاريخ يمرّ. */
/* ⚠️ `dept` ليس تحسيناً للأداء — بدونه لا تعمل الشاشة لمدير القسم إطلاقاً.
   قاعدة القراءة تمنحه الوصول عبر sameDept()، وFirestore يرفض الاستعلام
   **كاملاً** ما لم يكن مقيَّداً بحيث تُحقّق كل نتيجة محتملة شرط القاعدة.
   فاستعلام بالتاريخ وحده من حساب مدير = خطأ صلاحيات وشاشة فارغة، لا نتيجة
   منقوصة.

   ⚠️ ويحتاج فهرساً مركّباً `(department, date)` على المجموعتين — منشوراً
   قبل فتح الشاشة. انظر firestore.indexes.json.

   ⚠️⚠️ والتقييد بالقسم يتخطّى بصمت أي وثيقة بلا حقل `department` (السجلات
   التي كتبها الجسر قبل تحديثه). لا خطأ ولا رفض — أيام ناقصة في شاشة تبدو
   سليمة. لذلك تُمرَّر النتيجة على deptCoverageOf() في js/lib/zk-coverage.js
   وتُعلن الشاشة تغطيتها بنفسها. */
export async function fetchAttendance(cycle, coll = 'attendance', dept = '') {
  const s1 = ymd(cycle.start), s2 = ymd(cycle.end);
  const parts = [collection(db, coll)];
  if (dept) parts.push(where('department', '==', dept));
  parts.push(where('date', '>=', s1), where('date', '<=', s2));
  const snap = await getDocs(query(...parts));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* تسطيح الجلسات لصفوف قابلة للعرض والتصدير */
export function flattenSessions(recs) {
  const rows = [];
  recs.forEach((r) => {
    const ss = sessionsOf(r);
    if (!ss.length) { rows.push({ r, idx: 0, s: null }); return; }
    ss.forEach((s, i) => rows.push({ r, idx: i, s }));
  });
  rows.sort((a, b) =>
    (a.r.employeeName || '').localeCompare(b.r.employeeName || '') ||
    (a.r.date > b.r.date ? 1 : -1) || a.idx - b.idx);
  return rows;
}

/* الملاحظة تعرض الدليل الفعلي والفترات المحتسبة معاً، بدلاً من أن تتغيّر
   الساعات بصمت. وعند غموض جلسات استئذان منتصف الوردية نصرّح بالـfallback
   ولا ننسب للنظام وقتاً لا تثبته البصمات. */
export function permissionAuditNote(effect, firstIn, lastOut) {
  if (!effect?.approved?.length) return '';
  const labels = [...new Set(effect.approved.map(permissionDisplayLabel).filter(Boolean))].join(' · ');
  const withLabels = (text) => labels ? `${text} — ${labels}` : text;
  const actual = [firstIn ? `دخول فعلي ${hm(firstIn)}` : '', lastOut ? `خروج فعلي ${hm(lastOut)}` : '']
    .filter(Boolean).join(' — ');
  if (effect.midFallback) {
    return withLabels(`${actual ? actual + ' — ' : ''}استئذان أثناء الدوام معتمد، ولم يُطبّق على الساعات لعدم اكتمال أو وضوح الجلسات`);
  }
  const periods = permissionIntervalsLabel(effect.coveredIntervals);
  if (!periods) return withLabels(`${actual ? actual + ' — ' : ''}استئذان معتمد، وتعذّر تحديد الفترة المحتسبة`);
  const creditedMin = Math.round((effect.creditedSecs || 0) / 60);
  const categories = [...new Set(effect.approved.map((r) => r.category).filter(Boolean))];
  const permissionLabel = categories.length === 1 ? `استئذان ${categories[0]} معتمد` : 'استئذانات معتمدة';
  const throughShiftEnd = effect.actualOut && effect.effectiveOut && effect.effectiveOut > effect.actualOut
    && effect.earlyCoveredSecs > 0 && effect.earlyUncoveredSecs === 0
    ? ` حتى نهاية الوردية ${hm(effect.effectiveOut)}` : ` ${periods}`;
  return withLabels(`${actual ? actual + ' — ' : ''}${permissionLabel}${throughShiftEnd}`
    + (creditedMin ? ` — احتُسب ${creditedMin} د` : ' — لا تعويض إضافي لتداخل الفترة مع وقت العمل'));
}

/* ═══ الحالة اليومية (حاضر/متأخر/غائب/إجازة) مع ربط الاستئذان — منقولة حرفياً ═══

   ⚠️ opts.compensate: تعويض التأخير ببقاء الموظف بعد الوردية. مُطفأ افتراضياً
   عمداً — شاشة «أدائي» ولوحة المنتظمين يراهما الموظف، وتعويضٌ يظهر فيهما يكشف
   الخاصية. لا تُشغّله إلا من شاشة لا يفتحها إلا الأدمن. */
export function buildDailyStatus(cyc, users, requests, recs, opts = {}) {
  const compensate = !!opts.compensate;
  const recMap = {}; recs.forEach((r) => { recMap[r.employeeUid + '_' + r.date] = r; });
  const emps = users.filter((u) => u.role !== 'admin');
  const now = new Date();
  const end = (cyc.end < now) ? cyc.end : now;
  const rows = [];
  emps.forEach((u) => {
    /* لا غياب قبل تاريخ المباشرة — نفس علّة المسير */
    const hire = u.hireDate ? new Date(u.hireDate + 'T00:00:00') : null;
    const startsAt = (hire && !isNaN(hire) && hire > cyc.start) ? hire : cyc.start;
    for (let d = new Date(startsAt); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = ymd(d), dow = d.getDay();
      /* ⚠️ خطة شفت الموظف تتقدّم على قسمه — انظر resolveShift في shifts.js.
         بلا تمرير `u` هنا يُحسب «متأخر» على وردية قسمه لا على ورديته، فمن
         دوامه ٣ العصر يظهر متأخراً سبع ساعات كل يوم. */
      const shift = resolveShift(dateStr, dow, u.department, u);
      if (!shift || shift.type === 'off') continue;   /* راحة أو عطلة رسمية → لا يُحاسب عليها */
      const leave = requests.find((r) => r.type === 'leave' && r.status === 'approved' &&
        requestBelongsToEmployee(r, u) && r.startDate <= dateStr && r.endDate >= dateStr);
      const rec = recFor(recMap, u, dateStr);
      const sessions = sessionsOf(rec);
      /* اليوم بحدّيه لا بمزاوجة الجلسات — انظر dayBounds */
      const { firstIn, lastOut, spanSecs, hasAttendanceEvidence } = dayBounds(sessions, {
        missedCheckIn: rec?.missedCheckIn === true
      });
      const openSess = !!firstIn && !lastOut;
      const win = shiftWindowFor(d, shift);
      const permissionEffect = permissionWorkTime({
        requests,
        employee: u,
        dateStr,
        sessions,
        firstIn,
        lastOut,
        baseSecs: spanSecs,
        shiftStart: win ? win.start : null,
        shiftEnd: win ? win.end : null,
        /* السماح يحدد هل اليوم متأخر، لكنه لا يُطرح من عدد الدقائق عند
           تجاوزه؛ هذا يحفظ تعريف شاشة الحضور الحالي بالحرف. */
        lateGraceMinutes: 0
      });
      /* المدى من أول بصمة لآخرها. وبلا بصمة خروج تُقصّ الجلسة المفتوحة عند
         نهاية الوردية بدل أن تعدّ حتى الآن. الاستئذان يغيّر الحد المحتسب
         في الذاكرة فقط، ويبقى lastOut هو الخروج الفعلي. */
      const secs = lastOut ? permissionEffect.effectiveSecs
                           : workedSecs(sessions, win ? win.end.getTime() : null).secs;
      let status, cls, note = '', lateMin = 0, compMin = 0, excusable = false;
      let punctualityLateMin = 0, punctualityEarlyMin = 0;
      if (leave) { status = 'إجازة: ' + (leave.categoryLabel || ''); cls = 'leave'; }
      else if (firstIn) {
        /* نسيان بصمة الخروج: جلسة مفتوحة ومضى أكثر من ساعتين على نهاية الوردية */
        if (openSess && win && now > new Date(win.end.getTime() + MISSING_OUT_AFTER_MIN * 60000)) {
          status = 'نسيان بصمة الخروج'; cls = 'missing';
          note = `دخل ${hm(firstIn)} ولم يسجّل انصراف — مضى أكثر من ساعتين على نهاية الوردية`;
        } else {
          if (win) {
            const grace = new Date(win.start.getTime() + LATE_GRACE_MIN * 60000);
            if (firstIn > grace) {
              const uncoveredLate = Math.max(0, Math.round(permissionEffect.lateUncoveredSecs / 60));
              /* البقاء بعد الدوام قد يعوّض مالياً، لكنه لا يمحو أن بداية اليوم
                 كانت متأخرة في مؤشر الانضباط. الاستئذان يمحو الجزء الذي
                 يغطيه وحده، قبل تطبيق تعويض البقاء. */
              punctualityLateMin = uncoveredLate;
              compMin = compensate ? compensableMin(uncoveredLate, lastOut, win) : 0;
              lateMin = uncoveredLate - compMin;
              if (lateMin > 0) {
                status = 'متأخر'; cls = 'late';
                note = compMin ? `تأخر ${lateMin} د بعد تعويض ${compMin} د` : `تأخر ${lateMin} د`;
              } else {
                /* التعويض أو الاستئذان غطّى التأخير كاملاً. */
                status = 'حاضر'; cls = 'present';
                if (compMin) note = `عوّض تأخير ${uncoveredLate} د ببقائه بعد الدوام`;
              }
            } else { status = 'حاضر'; cls = 'present'; }
          } else { status = 'حاضر'; cls = 'present'; }
        }
        if (lastOut && win && lastOut < win.end)
          punctualityEarlyMin = Math.max(0, Math.round(permissionEffect.earlyUncoveredSecs / 60));
        /* attendanceMetrics في main يقرأ بوابتَي مخالفة زمنية فقط، ولا
           يعيد حساب الساعات. في يوم Mid المعتمد وحده نضم النقص الداخلي
           غير المغطى إلى البوابة الثانية كي لا يبدو اليوم ملتزماً، من دون
           تغيير أي يوم عادي أو منح الاستئذان إعفاءً لمخالفة أخرى. */
        punctualityEarlyMin += Math.max(0, Math.round(permissionEffect.midUncoveredSecs / 60));
        /* ── نافذة الاستئذان ──
           يوم متأخر بلا استئذان معتمد: إمّا النافذة ما زالت مفتوحة فيُقال
           للموظف كم بقي له، أو أُغلقت فيُعتمد التأخير «بدون عذر» ويبقى في
           الخصم. الرقم كان يظهر عارياً بلا إشارة إلى أن له مخرجاً في وقته. */
        if (cls === 'late' && permissionEffect.lateUncoveredSecs > 0) {
          excusable = permWindowOpen(dateStr);
          note += excusable ? ' · يمكن تقديم استئذان عنه' : ' · بدون عذر';
        }
      } else if (lastOut) {
        /* ═══ نسيان بصمة الحضور — قرار المالك ٢٠٢٦-٠٨-١٣ ═══
           ⚠️ انصرافٌ بلا دخول ليس غياباً: الموظف كان هنا، ودليله بصمة
           خروجه. فاتته نافذة الحضور (تُغلق بعد بداية ورديته بأربع ساعات)
           فسجّل انصرافه وحده.

           ⚠️ ولا تُحسب حضوراً أيضاً — لا وقت دخول يُقاس عليه تأخير. تبقى
           حالة ثالثة تُصحَّح بطلب `attendanceFix` يعتمده المدير، وعندها
           يُكتب وقت الدخول ويُعاد حساب اليوم. */
        status = 'نسيان بصمة الحضور'; cls = 'missingIn';
        note = `سجّل انصرافه ${hm(lastOut)} بلا بصمة دخول — يُصحَّح بطلب`;
        if (permWindowOpen(dateStr)) note += ' · النافذة ما زالت مفتوحة';
      } else {
        status = 'غائب'; cls = 'absent';
      }
      const permissionNote = permissionAuditNote(permissionEffect, firstIn, lastOut);
      if (permissionNote) note = (note ? note + ' · ' : '') + permissionNote;
      if (shift.src === 'exception' && shift.exLabel) note = (note ? note + ' · ' : '') + shift.exLabel;
      else if (shift.src === 'dept')                  note = (note ? note + ' · ' : '') + 'وردية القسم';
      rows.push({ u, dateStr, dow, shift, status, cls, note, firstIn, lastOut,
                  shiftStart: win ? win.start : null,
                  shiftEnd: win ? win.end : null,
                  effectiveOut: permissionEffect.effectiveOut,
                  actualSecs: lastOut ? permissionEffect.actualSecs : secs,
                  secs,
                  creditedSecs: permissionEffect.creditedSecs,
                  permissionIntervals: permissionEffect.coveredIntervals,
                  permissionIntervalsLabel: permissionIntervalsLabel(permissionEffect.coveredIntervals),
                  earlyUncoveredSecs: permissionEffect.earlyUncoveredSecs,
                  midUncoveredSecs: permissionEffect.midUncoveredSecs,
                  midGapMin: Math.round(permissionEffect.midUncoveredSecs / 60),
                  permissionFallback: permissionEffect.midFallback,
                  requiredSecs: win ? Math.max(0, (win.end - win.start) / 1000) : 0,
                  rec,
                  permissions: permissionEffect.approved,
                  openSess, lateMin, compMin, excusable, hasAttendanceEvidence,
                  punctualityLateMin, punctualityEarlyMin });
    }
  });
  rows.sort((a, b) => (a.u.name || '').localeCompare(b.u.name || '') || (a.dateStr > b.dateStr ? 1 : -1));
  return rows;
}

export { AR_DAYS };
