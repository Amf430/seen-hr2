/* ═══════════════════════════════════════════════════════════════════════════
   إعدادات النظام — وثيقة واحدة settings/config يقرأها الجميع ويكتبها الأدمن.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, runTransaction } from './firebase.js';
import { getSettings, setSettings, getMe } from './state.js';
import { uid } from './dom.js';

const REF = () => doc(db, 'settings', 'config');

/* المفاتيح المستقلة داخل وثيقة الإعدادات — كل شاشة إعدادات تملك واحداً أو
   اثنين منها ولا تمسّ البقية. */
const KEYS = ['permissionReasons', 'leaveTypes', 'approvers', 'departments', 'hrTicketCategories',
              'dateExceptions', 'branches', 'payroll', 'company', 'shifts',
              'shiftPlans', 'defaultShiftPlanId', 'leavePolicyDefaults'];

/* القيم الافتراضية تُدمج تحت المحفوظ، فأي مفتاح جديد نضيفه لاحقاً لا يحتاج
   ترحيل بيانات — يظهر بقيمته الافتراضية حتى يحفظ الأدمن. */
const DEFAULTS = {
  permissionReasons: [],
  hrTicketCategories: [],
  leaveTypes: [],
  approvers: [],
  departments: [],
  dateExceptions: [],
  branches: [],
  payroll: { hoursPerDay: 8, daysPerMonth: 30, graceMinutes: 0 },
  company: { lat: null, lng: null, radius: 500 },
  shifts: {},
  /* ⚠️ فارغة عمداً: shiftPlansOf() في shifts.js تُركّب خطة واحدة في الذاكرة
     من `shifts` حين تكون هذه فارغة، فيشتغل النظام يوم النشر بلا ترحيل. */
  shiftPlans: [],
  defaultShiftPlanId: '',
  /* سياسة إجازات افتراضية لكل نوع — غيابها يعني الشكل القديم */
  leavePolicyDefaults: {}
};

export async function loadSettings() {
  const snap = await getDoc(REF());
  if (snap.exists()) {
    setSettings({ ...DEFAULTS, ...snap.data() });
    return;
  }
  const me = getMe();
  if (me && me.role === 'admin') await seedSettings();
  else setSettings({ ...DEFAULTS });
}

/* ═══ الحفظ ═══

   ⚠️ كان setDoc(REF(), getSettings()) — استبدال للوثيقة كاملة. أدمنان يعملان
   في نفس اللحظة، أحدهما على الفروع والآخر على أنواع الإجازات، فيمحو الحفظ
   الثاني عمل الأول بصمت. وهذا وارد فعلياً: chip-card.js يحفظ عند كل إضافة
   وحذف عنصر.

   الآن: معاملة تقرأ الوثيقة الحيّة أولاً، ولا تكتب فوقها إلا المفاتيح التي
   تغيّرت فعلاً في هذه الجلسة. تعديل أدمن آخر على مفتاح لم نلمسه يبقى كما هو.

   `keys` اختياري — بلا تمريره تُقارَن كل المفاتيح، وهو سلوك آمن لكل الشاشات
   القائمة بلا تعديل نداءاتها. */
export async function saveSettings(keys) {
  const local = getSettings();
  const touched = Array.isArray(keys) && keys.length ? keys : KEYS;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(REF());
    const remote = snap.exists() ? snap.data() : {};
    const merged = { ...DEFAULTS, ...remote };
    for (const k of touched) {
      if (local[k] !== undefined) merged[k] = local[k];
    }
    tx.set(REF(), merged);
  });
}

/* حفظ الفروع.
   ⚠️ company تبقى محدَّثة كمرآة للفرع الأول ولا تُحذف أبداً: جسر البصمة
   zk_bridge.py خارج هذا المستودع ويكتب عبر Admin SDK متجاوزاً القواعد، وما
   أقدر أتحقق هل يقرأ settings/config.company أو لا. إبقاء المفتاح حياً يكلّف
   ثلاثة أسطر، وحذفه هو التغيير الوحيد هنا الذي قد يكسر شيئاً لا أراه. */
export async function saveBranches(list) {
  const S = getSettings();
  S.branches = list;
  const first = list.find((b) => b.active !== false) || list[0];
  /* ⚠️ لا بد من مسح المرآة عند إفراغ القائمة. بدون else كان حذف آخر فرع
     يُبقي company بإحداثياته، ثم يعيد branchesOf() تركيبه كـ«المقر الرئيسي»
     — فيرجع الفرع المحذوف من القبر بنفس نطاقه. */
  S.company = first
    ? { lat: first.lat, lng: first.lng, radius: first.radius }
    : { lat: null, lng: null, radius: 500 };
  await saveSettings();
}

export async function seedSettings() {
  setSettings({
    permissionReasons: [
      { id: uid(), label: 'ظرف عائلي' }, { id: uid(), label: 'مراجعة طبية' },
      { id: uid(), label: 'معاملة حكومية' }, { id: uid(), label: 'ظرف طارئ' }
    ],
    /* بذور تُعدَّل من «أنواع الطلبات والاعتمادات» — لا قائمة نهائية */
    hrTicketCategories: [
      { id: uid(), label: 'التأمين الصحي' }, { id: uid(), label: 'الراتب والبدلات' },
      { id: uid(), label: 'الإجازات والأرصدة' }, { id: uid(), label: 'المستندات والشهادات' },
      { id: uid(), label: 'استفسار عام' }
    ],
    leaveTypes: [
      { id: uid(), label: 'إجازة سنوية',      balance: 21, deduct: true },
      { id: uid(), label: 'إجازة مرضية',      balance: 30, deduct: true },
      { id: uid(), label: 'إجازة اضطرارية',   balance: 5,  deduct: true },
      { id: uid(), label: 'إجازة زواج',       balance: 5,  deduct: true },
      { id: uid(), label: 'إجازة وفاة',       balance: 5,  deduct: true },
      { id: uid(), label: 'إجازة وضع',        balance: 70, deduct: true },
      { id: uid(), label: 'إجازة بدون راتب',  balance: 0,  deduct: false, unpaid: true }
    ],
    approvers: [{ id: uid(), name: 'مدير الموارد البشرية' }],
    departments: [],
    dateExceptions: [],
    branches: [],
    payroll: { hoursPerDay: 8, daysPerMonth: 30, graceMinutes: 0 },
    company: { lat: null, lng: null, radius: 500 },
    shifts: {
      0: { type: 'morning', start: '08:00', end: '16:00' }, /* الأحد */
      1: { type: 'morning', start: '08:00', end: '16:00' },
      2: { type: 'morning', start: '08:00', end: '16:00' },
      3: { type: 'morning', start: '08:00', end: '16:00' },
      4: { type: 'morning', start: '08:00', end: '16:00' },
      5: { type: 'off', start: '', end: '' },               /* الجمعة */
      6: { type: 'off', start: '', end: '' }                /* السبت */
    }
  });
  await saveSettings();
}
