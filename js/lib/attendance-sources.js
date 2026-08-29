/* ═══════════════════════════════════════════════════════════════════════════
   توحيد مصدري الحضور على مستوى الموظف واليوم.

   السجل الموحد مشتقّ للقراءة فقط. السجلات الأصلية تبقى مستقلة لأن الجوال
   يحمل الموقع والصورة، والجهاز هو دليل البصمة الفعلية. جمع sessions كما هي
   يضاعف الساعات؛ واختيار وثيقة واحدة يفقد خروجاً موجوداً في الأخرى.
   ═══════════════════════════════════════════════════════════════════════════ */

import { tsToDate } from './format.js';

export const PAYROLL_ATTENDANCE_SOURCE = Object.freeze({
  PHYSICAL: 'physical', MOBILE: 'mobile', BOTH: 'both'
});

export function payrollAttendanceSource(config) {
  const value = config?.attendanceSource;
  return Object.values(PAYROLL_ATTENDANCE_SOURCE).includes(value)
    ? value : PAYROLL_ATTENDANCE_SOURCE.PHYSICAL;
}

export function payrollSourceLabel(config) {
  return {
    physical: 'البصمة الفعلية', mobile: 'بصمة الجوال', both: 'كلا المصدرين'
  }[payrollAttendanceSource(config)];
}

export function payrollConfigForRun(currentConfig, run) {
  if (!run?.config) return { ...currentConfig, attendanceSource: payrollAttendanceSource(currentConfig) };
  return { ...currentConfig, ...run.config, attendanceSource: payrollAttendanceSource(run.config) };
}

export function selectPayrollAttendance(users, config, physical, mobile) {
  const source = payrollAttendanceSource(config);
  if (source === PAYROLL_ATTENDANCE_SOURCE.MOBILE) return mobile || [];
  if (source === PAYROLL_ATTENDANCE_SOURCE.BOTH) {
    return mergeAttendanceSources(users, [
      { coll: 'zkAttendance', records: physical || [] },
      { coll: 'attendance', records: mobile || [] }
    ]);
  }
  return physical || [];
}

/* القراءة الفارغة نجاح مشروع، أما رفض/فشل مصدر مطلوب فيبقى rejection ولا
   يتحول إلى []. تستعمله الشاشات التي ستعرض مؤشرات نهائية من أكثر من مصدر. */
export async function loadRequiredAttendanceSources(loaders) {
  const entries = Object.entries(loaders || {}).filter(([, load]) => typeof load === 'function');
  const values = await Promise.all(entries.map(([, load]) => load()));
  return Object.fromEntries(entries.map(([key], i) => [key, values[i]]));
}

const sessionsOfRecord = (r) => {
  if (!r) return [];
  if (Array.isArray(r.sessions)) return r.sessions;
  return r.checkIn ? [{ in: r.checkIn, out: r.checkOut || null }] : [];
};

const sourceKindOf = (value) => {
  if (value === 'zkAttendance' || value === 'device' || value === 'physical') return 'physical';
  if (value === 'attendance' || value === 'web' || value === 'mobile') return 'mobile';
  return '';
};

export function attendanceSourceLabel(kind) {
  return kind === 'physical' ? 'جهاز البصمة'
    : kind === 'mobile' ? 'الجوال'
    : kind === 'both' ? 'جهاز البصمة + الجوال' : '';
}

/* مصدر كل حدّ لا مصدر اليوم كله. في التقرير المدموج قد يأتي الدخول الأبكر
   من الجهاز والخروج الأحدث من الجوال، لذلك لا تكفي قيمة source='combined'.
   نقرأ السجلات التي حفظها mergeAttendanceSources للتدقيق، بلا إعادة دمج أو
   تغيير أي بصمة. وعند التطابق الحقيقي نذكر المصدرين بدلاً من اختيار أحدهما
   اعتباطاً. */
export function attendanceBoundarySources(record) {
  if (!record) return { inSource: '', outSource: '' };
  const raw = Array.isArray(record.__sourceRecords) && record.__sourceRecords.length
    ? record.__sourceRecords : [{ coll: record.source || '', rec: record }];
  let firstIn = null, lastOut = null;
  let inKinds = new Set(), outKinds = new Set();

  for (const item of raw) {
    const rec = item?.rec;
    if (!rec || (record.date && rec.date && rec.date !== record.date)) continue;
    const kind = sourceKindOf(item.coll || rec.source || '');
    if (!kind) continue;
    for (const session of sessionsOfRecord(rec)) {
      const inDate = tsToDate(session?.in);
      if (inDate) {
        const ms = inDate.getTime();
        if (firstIn == null || ms < firstIn) { firstIn = ms; inKinds = new Set([kind]); }
        else if (ms === firstIn) inKinds.add(kind);
      }
      const outDate = tsToDate(session?.out);
      if (outDate) {
        const ms = outDate.getTime();
        if (lastOut == null || ms > lastOut) { lastOut = ms; outKinds = new Set([kind]); }
        else if (ms === lastOut) outKinds.add(kind);
      }
    }
  }

  const kindOf = (kinds) => kinds.has('physical') && kinds.has('mobile') ? 'both'
    : kinds.has('physical') ? 'physical' : kinds.has('mobile') ? 'mobile' : '';
  return { inSource: kindOf(inKinds), outSource: kindOf(outKinds) };
}

/* UID السجل الخام المقصود، لا UID الوثيقة الموحّدة. الدمج يطبع employeeUid
   إلى الحالي، لكن طلب التصحيح يجب أن يبقى فوق سجل المصدر التاريخي نفسه. */
export function sourceRecordUid(record, coll = 'zkAttendance') {
  const raw = Array.isArray(record?.__sourceRecords) ? record.__sourceRecords : [];
  const exact = raw.find((item) => item?.coll === coll && item?.rec?.employeeUid);
  if (exact) return exact.rec.employeeUid;
  const any = raw.find((item) => item?.rec?.employeeUid);
  return any?.rec?.employeeUid || record?.employeeUid || '';
}

/* حالة الحضور الحيّ ودلالة مصدره — نقيّة ولا تعرف Dashboard أو DOM.

   ⚠️ `both` لا تُستنتج من كون السجل `combined`: لا يدخل المصدر إلا إذا كان
   له record خام لليوم نفسه وفيه دخول صالح فعلاً. Record فارغ من أحد المصدرين
   لا يحوّل «بصمة» إلى «بصمة + جوال».

   ⚠️ تعريف «داخل الآن» يبقى مطابقاً للسلوك القائم: وجود جلسة ذات دخول صالح
   بلا خروج. عند بيانات متناقضة (أكثر من جلسة مفتوحة مثلاً) لا نزاوج ولا نخترع
   خروجاً؛ نبقيه داخل العمل كما كان `workedSecs()` يفعل، ونأخذ بداية آخر جلسة
   في السجل كما كانت `todayAttendance()` تفعل. */
export function liveAttendanceInfo(record) {
  if (!record) return { open: false, since: null, sourceKind: '', sourceLabel: '' };

  const sessions = sessionsOfRecord(record);
  const open = sessions.some((s) => !!tsToDate(s?.in) && !tsToDate(s?.out));
  const since = open && sessions.length ? tsToDate(sessions[sessions.length - 1]?.in) : null;

  const raw = Array.isArray(record.__sourceRecords) && record.__sourceRecords.length
    ? record.__sourceRecords
    : [{ coll: record.source || '', rec: record }];
  const kinds = new Set();
  for (const item of raw) {
    const rec = item?.rec;
    if (!rec || rec.date !== record.date) continue;
    if (!sessionsOfRecord(rec).some((s) => !!tsToDate(s?.in))) continue;
    const kind = sourceKindOf(item.coll || rec.source || '');
    if (kind) kinds.add(kind);
  }

  const sourceKind = kinds.has('physical') && kinds.has('mobile') ? 'both'
    : kinds.has('physical') ? 'physical'
    : kinds.has('mobile') ? 'mobile' : '';
  const sourceLabel = sourceKind === 'both' ? 'بصمة + جوال'
    : sourceKind === 'physical' ? 'بصمة'
    : sourceKind === 'mobile' ? 'جوال' : '';
  return { open, since, sourceKind, sourceLabel };
}

const aliasesOf = (users) => {
  const out = new Map();
  for (const u of users || []) {
    if (!u?.id) continue;
    out.set(u.id, u.id);
    for (const old of u.previousUids || []) if (old) out.set(old, u.id);
  }
  return out;
};

export function mergeAttendanceSources(users, sourceGroups) {
  const aliases = aliasesOf(users);
  const byDay = new Map();

  for (const group of sourceGroups || []) {
    for (const rec of group?.records || []) {
      if (!rec?.employeeUid || !rec?.date) continue;
      const canonicalUid = aliases.get(rec.employeeUid) || rec.employeeUid;
      const key = canonicalUid + '_' + rec.date;
      const cur = byDay.get(key) || { canonicalUid, date: rec.date, records: [] };
      cur.records.push({ coll: group.coll || rec.source || '', rec });
      byDay.set(key, cur);
    }
  }

  return [...byDay.values()].map(({ canonicalUid, date, records }) => {
    /* مصدر واحد لا يحتاج دمجاً: إبقاء sessions حرفياً يحفظ الفواصل والجلسة
       المفتوحة والشكل القديم. إعادة بنائه بلا داعٍ تغيّر السلوك القائم. */
    if (records.length === 1) {
      const { coll, rec } = records[0];
      return {
        ...rec,
        id: canonicalUid + '_' + date,
        employeeUid: canonicalUid,
        source: coll || rec.source || '',
        __sources: [coll || rec.source || ''].filter(Boolean),
        __sourceRecords: records
      };
    }

    let firstIn = null, lastOut = null;
    for (const { rec } of records) {
      for (const s of sessionsOfRecord(rec)) {
        const i = tsToDate(s.in), o = tsToDate(s.out);
        if (i && (!firstIn || i < firstIn.date)) firstIn = { raw: s.in, date: i };
        if (o && (!lastOut || o > lastOut.date)) lastOut = { raw: s.out, date: o };
      }
    }

    const preferred = records.find((x) => x.rec.employeeUid === canonicalUid)?.rec || records[0].rec;
    const missedCheckIn = records.some(({ rec }) => rec.missedCheckIn === true);
    const sessions = firstIn ? [{
      in: firstIn.raw,
      out: lastOut && lastOut.date > firstIn.date ? lastOut.raw : null,
      source: records.length > 1 ? 'combined' : (records[0].coll || preferred.source || '')
    }] : (missedCheckIn && lastOut ? [{
      in: null, out: lastOut.raw, source: records.length > 1 ? 'combined' : records[0].coll
    }] : []);

    return {
      ...preferred,
      id: canonicalUid + '_' + date,
      employeeUid: canonicalUid,
      date,
      source: records.length > 1 ? 'combined' : (records[0].coll || preferred.source || ''),
      sessions,
      ...(missedCheckIn ? { missedCheckIn: true } : {}),
      __sources: [...new Set(records.map((x) => x.coll).filter(Boolean))],
      __sourceRecords: records
    };
  }).sort((a, b) => a.employeeUid.localeCompare(b.employeeUid) || a.date.localeCompare(b.date));
}
