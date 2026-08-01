/* ═══════════════════════════════════════════════════════════════════════════
   الحالة المشتركة — وحدة طرفية (leaf): لا تستورد أي شيء من التطبيق.

   كانت هذه متغيّرات عامة في الملف الواحد. صارت هنا خلف دوال، حتى تتشارك
   الصفحات نفس البيانات دون أن تستورد بعضها (وبالتالي دون دورات استيراد).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── المستخدم الحالي ── */
let ME = null;
export const getMe = () => ME;
export const setMe = (u) => { ME = u; };
/* تعديل حقل واحد دون استبدال الكائن كله */
export const patchMe = (fields) => { if (ME) Object.assign(ME, fields); };

/* ── الإعدادات ──
   ⚠️ getSettings() يُرجع الكائن الحي عمداً، لا نسخة منه.
   شاشات الإعدادات تعدّل الكائن في مكانه ثم تستدعي saveSettings()، فلو
   أرجعنا نسخة دفاعية لصارت كل تلك الشاشات تحفظ لا شيء بصمت. */
const EMPTY_SETTINGS = {
  permissionReasons: [], leaveTypes: [], approvers: [], departments: [],
  dateExceptions: [], branches: [], payroll: {}, company: {}, shifts: {}
};
let SETTINGS = { ...EMPTY_SETTINGS };
export const getSettings = () => SETTINGS;
export const setSettings = (s) => { SETTINGS = s; };

/* ── الكاش ──
   لكل واحد كاتب واحد فقط: الطلبات من app/subscriptions.js، والمستخدمون من
   lib/users.js. كل من عداهما يقرأ فقط. */
let CACHE_REQUESTS = [];
let CACHE_USERS = [];
export const getRequests = () => CACHE_REQUESTS;
export const setRequests = (list) => { CACHE_REQUESTS = list; };
export const getUsers = () => CACHE_USERS;
export const setUsers = (list) => { CACHE_USERS = list; };

/* ── الموظف المعروض في صفحة البروفايل ──
   صفحتان تتواصلان عبر هذه الوحدة الطرفية بدل أن تستورد إحداهما الأخرى. */
let PROFILE_UID = null;
export const getProfileUid = () => PROFILE_UID;
export const setProfileUid = (id) => { PROFILE_UID = id; };

/* يُستدعى عند تسجيل الخروج حتى لا تتسرّب بيانات موظف لجلسة موظف آخر */
export function resetState() {
  ME = null;
  SETTINGS = { ...EMPTY_SETTINGS };
  CACHE_REQUESTS = [];
  CACHE_USERS = [];
  PROFILE_UID = null;
}
