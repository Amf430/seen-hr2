/* ═══════════════════════════════════════════════════════════════════════════
   الموقع الجغرافي · الفروع · نطاق كل موظف

   يغطّي طلبين من المالك:
     • فروع متعددة للشركة — الموظف يسجّل من أي فرع هو فيه
     • نطاق خاص لكل موظف، ومن يشتغل من أماكن ثانية يسجّل «من أي مكان»

   ⚠️ بصراحة عن حدود هذه الحماية: التحقّق من الموقع يتم في المتصفح، والمتصفح
   جهاز الموظف. من يفتح أدوات المطوّر يقدر يزوّر إحداثياته في ثوانٍ. قواعد
   Firestore لا تقدر تتحقق من GPS. هذا لم يتغيّر عن النسخة السابقة، والضابط
   الحقيقي للوقت هو قاعدة fresh() التي تربط الطابع الزمني بوقت السيرفر.
   السياج الجغرافي يمنع الخطأ العابر، لا الغشّ المتعمّد.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getSettings } from './state.js';

export const DEFAULT_BRANCH_ID = 'main';
export const REMOTE_BRANCH_ID  = 'remote';
export const REMOTE_LABEL      = 'عن بُعد';

/* ── قراءة الموقع من الجهاز ── */
export function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('no-geo'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (err) => rej(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/* المسافة بالأمتار بين إحداثيتين */
export function haversine(a, b) {
  const R = 6371000, toR = (x) => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ═══════════════════ الفروع ═══════════════════

   ⚠️ هذه الدالة هي القارئ الوحيد لـ SETTINGS.company في المشروع كله.
   البيانات الحالية في Firestore ما فيها مصفوفة branches — فيها الشكل القديم
   {lat,lng,radius} فقط. لذلك نُركّب منه «المقر الرئيسي» تلقائياً، فيشتغل
   النظام يوم النشر بلا أي تدخّل من الأدمن وبلا ترحيل بيانات، وبنفس سلوك
   اليوم بالضبط: فرع واحد، نطاق واحد، كل الموظفين onsite. */
export function branchesOf() {
  const S = getSettings();
  const list = (S.branches || []).filter((b) => b && b.lat != null && b.lng != null);
  if (list.length) {
    return list.map((b) => ({
      ...b,
      radius: Number(b.radius) || 500,
      active: b.active !== false
    }));
  }
  const co = S.company || {};
  if (co.lat != null && co.lng != null) {
    return [{
      id: DEFAULT_BRANCH_ID,
      name: 'المقر الرئيسي',
      lat: co.lat,
      lng: co.lng,
      radius: Number(co.radius) || 500,
      active: true
    }];
  }
  return [];
}

export const activeBranches = () => branchesOf().filter((b) => b.active);
export const branchById = (id) => branchesOf().find((b) => b.id === id) || null;

/* ═══════════════════ قاعدة الموظف ═══════════════════

   كل القيم الافتراضية هي «الحقل غير موجود»، فما في وثيقة موظف واحدة تحتاج
   تعديل، وما في أحد يتغيّر وصوله يوم النشر.

     workMode  : 'onsite' | 'remote'   — غائب ⇒ onsite
     geoRadius : رقم بالمتر            — غائب أو أقل من 50 ⇒ نطاق الفرع نفسه
     branchIds : []                    — غائبة أو فاضية ⇒ كل الفروع النشطة

   ⚠️ الموظف لا يقدر يمنح نفسه وضع «عن بُعد»: قاعدة users في firestore.rules
   تحصر تعديل الموظف لملفه في mustChangePassword و bioCredentials فقط، وكل ما
   عداهما للأدمن وحده. تحققتُ من القاعدة نصّاً، لا افتراضاً. */
export function geoRuleFor(u) {
  const mode = (u && u.workMode === 'remote') ? 'remote' : 'onsite';
  const all = activeBranches();
  const ids = Array.isArray(u && u.branchIds) ? u.branchIds.filter(Boolean) : [];

  let allowed = ids.length ? all.filter((b) => ids.includes(b.id)) : all;
  /* فروعه المسندة اتحذفت من الإعدادات → نرجّعه لكل الفروع بدل ما نقفل عليه */
  if (!allowed.length) allowed = all;

  const ov = Number(u && u.geoRadius);
  return { mode, allowed, radiusOverride: (ov >= 50) ? Math.round(ov) : null };
}

/* أقرب فرع = الأقل تجاوزاً لنطاقه، لا الأقل متراً.
   فرع صغير على بعد 60 م ونطاقه 50، مقابل فرع كبير على بعد 200 م ونطاقه 500:
   الثاني هو الصحيح — الموظف داخله فعلاً. */
export function nearestBranch(pos, list, radiusOverride) {
  let best = null;
  for (const b of list) {
    const dist = haversine(pos, { lat: b.lat, lng: b.lng });
    const rad  = (radiusOverride != null) ? radiusOverride : (Number(b.radius) || 500);
    const over = dist - rad;
    if (!best || over < best.over || (over === best.over && dist < best.dist)) {
      best = { b, dist: Math.round(dist), rad, over, inside: dist <= rad };
    }
  }
  return best;
}

/* وصف مقروء لقاعدة الموظف — يظهر في صفحة الموظفين وفي شاشة الحضور */
export function describeRule(u) {
  const r = geoRuleFor(u);
  if (r.mode === 'remote') return 'يسجّل من أي مكان';
  const all = activeBranches();
  const scope = (r.allowed.length === all.length)
    ? 'كل الفروع'
    : r.allowed.map((b) => b.name).join('، ');
  return r.radiusOverride != null
    ? `${scope} · نطاق خاص ${r.radiusOverride} م`
    : scope;
}
