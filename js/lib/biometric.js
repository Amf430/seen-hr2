/* ═══════════════════════════════════════════════════════════════════════════
   التحقق بالبصمة / Face ID  (WebAuthn)

   ── ما الذي يثبته هذا التحقق فعلاً، بصراحة ودون تجميل ──
   ما في سيرفر يتحقق من التوقيع (النظام بلا باكند). التحدّي (challenge) يُولَّد
   ويُهمَل في نفس الصفحة. لذلك كل ما يثبته هذا الإجراء:
       «في هذه اللحظة، شخصٌ فتح قفل هذا الجهاز ببصمته أو وجهه أو رمزه».
   وهو لا يثبت أن هذا الشخص هو الموظف، ولا أن المفتاح محبوس في جهازه
   (على أندرويد يُزامَن المفتاح مع حساب Google).
   الضابط الحقيقي للمكان هو السياج الجغرافي، وللوقت قاعدة fresh() في
   Firestore. البصمة طبقة إضافية فقط — ولهذا لا تمنع تسجيل الحضور أبداً عند
   فشلها، بل تُسجَّل نتيجتها كما هي ليراها المدير.

   ── لماذا كانت لا تشتغل على أندرويد وتشتغل على آيفون ──
   الكود القديم كان يطلب مفتاحاً صامتاً غير قابل للاكتشاف مربوطاً بالجهاز،
   وGoogle Password Manager على أندرويد لا يعطي إلا passkey قابلاً للاكتشاف
   ومُزامناً مع حساب Google. فتظهر للموظف شاشة «إنشاء مفتاح مرور» الغريبة
   بدل بصمة سريعة. وإذا ألغاها — وهو الطبيعي — كان الخطأ NotAllowedError
   يخرج من verifyBiometric ويوقف تسجيل الحضور كلياً. على آيفون تظهر Face ID
   لثانية واحدة ولا أحد يلغيها، فما انتبه أحد للمشكلة.

   الأسباب الستة المصلَّحة هنا:
     1. rp.id ما كان محدداً → المفتاح المسجّل على نطاق لا يُرى على نطاق ثانٍ
     2. residentKey:'discouraged' تتجاهله أندرويد أصلاً
     3. user.id كان يحوي Date.now() → مفتاح جديد كل مرة، تتراكم النسخ
     4. أي فشل كان «يُعالَج» بتسجيل مفتاح جديد، ويرجع true بلا تحقق فعلي
     5. معرّف المفتاح كان في localStorage فقط — يُمسح ويختلف بين المتصفحات
     6. transports:['internal'] مكتوبة يدوياً بدل ما يرجعها المُصادِق نفسه
   ═══════════════════════════════════════════════════════════════════════════ */

import { WEBAUTHN_RP_ID } from '../config/firebase.config.js';
import { getMe } from './state.js';

/* ── تحويلات base64url ── */
export function bufToB64url(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlToBuf(b64) {
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4; if (pad) b64 += '='.repeat(4 - pad);
  const s = atob(b64); const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b.buffer;
}
function randChallenge() { const a = new Uint8Array(32); crypto.getRandomValues(a); return a.buffer; }

/* النطاق المعتمد. المفتاح المسجّل على نطاق لا يعمل إطلاقاً على نطاق آخر،
   وFirebase Hosting يخدم نفس الموقع على .web.app و .firebaseapp.com معاً. */
function rpId() {
  const h = location.hostname;
  if (h === WEBAUTHN_RP_ID || h.endsWith('.' + WEBAUTHN_RP_ID)) return WEBAUTHN_RP_ID;
  return h;   /* localhost أو نطاق تجربة — يبقى صالحاً */
}

/* ── رسائل مفهومة للموظف بدل «تعذّر» المبهمة ── */
const BIO_REASON_AR = {
  'insecure-context'   : 'التحقق بالبصمة يحتاج فتح الموقع عبر https',
  'unsupported-browser': 'متصفحك ما يدعم التحقق بالبصمة',
  'in-app-browser'     : 'افتح الرابط في Chrome أو Safari — المتصفح المدمج داخل التطبيقات ما يدعم البصمة',
  'no-screen-lock'     : 'فعّل قفل الشاشة (بصمة أو رمز) من إعدادات جوالك',
  'probe-failed'       : 'تعذّر فحص دعم البصمة على هذا الجهاز',
  'cancelled'          : 'أُلغي التحقق بالبصمة',
  'declined-enroll'    : 'ما تم ربط بصمة هذا الجهاز بحسابك',
  'rp-id-mismatch'     : 'رابط الموقع مختلف عن النطاق المعتمد — راجع الدعم الفني',
  'verify-failed'      : 'ما نجح التحقق بالبصمة'
};
export const bioReasonAr = (r) => BIO_REASON_AR[r] || 'تعذّر التحقق بالبصمة';

/* المتصفحات المدمجة داخل واتساب/انستغرام على أندرويد تعمل في WebView ولا
   تدعم WebAuthn إطلاقاً. آيفون يفتح الروابط في SFSafariViewController الذي
   يدعمها — وهذا سبب إضافي لاختلاف السلوك بين الجهازين. */
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  if (/(FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|MicroMessenger)/i.test(ua)) return true;
  return /Android/i.test(ua) && /\bwv\b/.test(ua);
}

/* ⚠️ الفرق الجوهري عن النسخة القديمة: عند رمي الاستثناء نرجع «غير متاح»،
   لا true. الكود القديم كان يفترض النجاح فيصل الموظف لطريق مسدود. */
export async function bioCapability() {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure-context' };
  if (!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create))
    return { ok: false, reason: 'unsupported-browser' };
  if (isInAppBrowser()) return { ok: false, reason: 'in-app-browser' };
  try {
    const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return ok ? { ok: true } : { ok: false, reason: 'no-screen-lock' };
  } catch (e) {
    return { ok: false, reason: 'probe-failed' };
  }
}

/* ═══════════════ مخزن معرّفات المفاتيح ═══════════════
   localStorage وحده لا يكفي: يُمسح مع «مسح بيانات التصفح»، وهو منفصل لكل
   متصفح على نفس الجوال — وموظفو أندرويد يبدّلون المتصفحات أكثر بكثير.
   نضيف نسخة على وثيقة الموظف لتعبر المتصفحات.

   ⚠️ بصراحة: القاعدة تسمح للموظف بالكتابة في هذه القائمة، فهي فهرس مساعد
   لمنع تكرار التسجيل — وليست دليلاً على شيء. ما في كود يثق بمحتواها. */
const storeKey = () => `seenBioCred_v2_${getMe() ? getMe().id : 'x'}_${rpId()}`;

function localCreds() {
  try {
    const j = JSON.parse(localStorage.getItem(storeKey()) || '[]');
    return Array.isArray(j) ? j : [];
  } catch (e) { return []; }
}
function saveLocalCreds(list) {
  try { localStorage.setItem(storeKey(), JSON.stringify(list.slice(-5))); } catch (e) {}
}

/* ترحيل المفتاح القديم حتى لا نعيد تسجيل كل الموظفين الحاليين */
function migrateLegacy() {
  try {
    const me = getMe(); if (!me) return;
    const legacyKey = 'seenBioCred_' + me.id;
    const old = localStorage.getItem(legacyKey);
    if (old && !localCreds().length) {
      saveLocalCreds([{ id: old, rpId: rpId(), transports: [] }]);
    }
    if (old) localStorage.removeItem(legacyKey);
  } catch (e) {}
}

function knownCreds() {
  migrateLegacy();
  const me = getMe();
  const out = new Map();
  localCreds().forEach((c) => { if (c && c.id) out.set(c.id, c); });
  (Array.isArray(me && me.bioCredentials) ? me.bioCredentials : [])
    .filter((c) => c && c.id && c.rpId === rpId())
    .forEach((c) => { if (!out.has(c.id)) out.set(c.id, c); });
  return [...out.values()];
}

function credDescriptors() {
  return knownCreds().map((c) => ({
    type: 'public-key',
    id: b64urlToBuf(c.id),
    /* transports تُعاد كما أرجعها المُصادِق وقت التسجيل — لا تُخترع يدوياً.
       تثبيت 'internal' يدوياً كان يمنع أندرويد من عرض المسار الذي يشتغل. */
    ...(Array.isArray(c.transports) && c.transports.length ? { transports: c.transports } : {})
  }));
}

/* تُستدعى من طبقة أعلى لحفظ القائمة على وثيقة الموظف أيضاً */
let persistRemote = async () => {};
export function setCredentialPersister(fn) { persistRemote = fn; }

async function rememberCred(rec) {
  const list = [...localCreds().filter((c) => c.id !== rec.id), rec].slice(-5);
  saveLocalCreds(list);
  try { await persistRemote(list.map(({ id, rpId, transports }) => ({ id, rpId, transports }))); }
  catch (e) { /* الفهرس المحلي كافٍ — لا نُفشل التسجيل لأجل النسخة البعيدة */ }
}

/* ═══════════════ التسجيل ═══════════════ */
async function enroll() {
  const me = getMe();
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randChallenge(),
      /* rp.id مثبّت الآن — بدونه يختلف المفتاح بين .web.app و .firebaseapp.com */
      rp: { id: rpId(), name: 'إدارة الموارد البشرية — سين العقارية' },
      user: {
        /* ثابت بلا Date.now(): إعادة التسجيل تستبدل المفتاح بدل ما تكدّس نسخاً */
        id: new TextEncoder().encode(me.id),
        name: me.phone || me.email || me.id,
        displayName: me.name || 'موظف'
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      /* residentKey غير مذكورة عمداً: أندرويد يتجاهل 'discouraged' ويصنع
         passkey مُزامناً على أي حال، وتركها للمنصّة يعطي أنظف تجربة على
         الجهازين. userVerification مطلوب — هذا هو أصل الفكرة. */
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      /* يمنع تسجيل مفتاح ثانٍ على نفس الجهاز */
      excludeCredentials: credDescriptors(),
      timeout: 60000,
      attestation: 'none'
    }
  });

  const transports = (cred.response && typeof cred.response.getTransports === 'function')
    ? (cred.response.getTransports() || []) : [];
  const rec = { id: bufToB64url(cred.rawId), rpId: rpId(), transports };
  await rememberCred(rec);
  return rec;
}

/* ═══════════════ التحقق ═══════════════
   يُرجع دائماً كائناً — لا يرمي أبداً. المنادي يقرّر ماذا يفعل بالنتيجة،
   والقرار المتّخذ في شاشة الحضور هو: لا تمنع الموظف من التسجيل أبداً. */
export async function verifyBiometric() {
  const cap = await bioCapability();
  if (!cap.ok) return { ok: false, enrolled: false, reason: cap.reason };

  const have = knownCreds();

  /* أول مرة على هذا الجهاز → تسجيل.
     ⚠️ التسجيل ليس تحققاً: نرجع enrolled:true و ok:false حتى لا يُحسب
     مجرد إنشاء مفتاح كأنه إثبات هوية — وهذا بالضبط خطأ النسخة القديمة. */
  if (!have.length) {
    try {
      await enroll();
      return { ok: false, enrolled: true, reason: 'enrolled-now' };
    } catch (e) {
      if (e.name === 'NotAllowedError')  return { ok: false, enrolled: false, reason: 'declined-enroll' };
      if (e.name === 'SecurityError')    return { ok: false, enrolled: false, reason: 'rp-id-mismatch' };
      if (e.name === 'InvalidStateError') return { ok: false, enrolled: true,  reason: 'enrolled-now' };
      console.error('bio enroll', e);
      return { ok: false, enrolled: false, reason: 'declined-enroll' };
    }
  }

  try {
    const a = await navigator.credentials.get({
      publicKey: {
        challenge: randChallenge(),
        rpId: rpId(),
        allowCredentials: credDescriptors(),
        userVerification: 'required',
        timeout: 60000
      }
    });
    return a ? { ok: true, enrolled: true, reason: '' }
             : { ok: false, enrolled: true, reason: 'verify-failed' };
  } catch (e) {
    /* الإلغاء يُبلَّغ كما هو ولا يُعالَج بتسجيل مفتاح جديد.
       إعادة التسجيل الصامتة كانت تُفرغ التحقق من معناه وتكدّس المفاتيح. */
    if (e.name === 'NotAllowedError') return { ok: false, enrolled: true, reason: 'cancelled' };
    if (e.name === 'SecurityError')   return { ok: false, enrolled: true, reason: 'rp-id-mismatch' };
    console.error('bio verify', e);
    return { ok: false, enrolled: true, reason: 'verify-failed' };
  }
}
