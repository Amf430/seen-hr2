/* ═══════════════════════════════════════════════════════════════════════════
   نقطة انطلاق التطبيق.

   هي الوحيدة التي تعرف كل الطبقات، ولهذا تستطيع ربط المصادقة بالواجهة دون
   أن تعرف إحداهما الأخرى: auth.js يستقبل نداءات راجعة، وmain.js يقرّر ماذا
   يُعرض في كل حالة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { $, toast } from './lib/dom.js';
import { initAuth, login, logout, requestPasswordReset, changeOwnPassword, authError } from './lib/auth.js';
import { getMe, resetState } from './lib/state.js';
import { loadSettings } from './lib/settings.js';
import { go, resetNav } from './lib/nav.js';
import { cleanupPage } from './lib/lifecycle.js';
import { buildNav, paintIdentity, showScreen, initShellChrome, setBootStage } from './app/shell.js';
import { subscribeData, unsubscribeAll } from './app/subscriptions.js';
import { startRouter } from './app/router.js';

initShellChrome();

/* ── شاشة الدخول ── */
const loginBtn = $('#loginBtn');
loginBtn.onclick = async () => {
  const raw = $('#loginEmail').value.trim();
  const pass = $('#loginPass').value;
  const err = $('#loginErr');
  err.textContent = '';
  if (!raw || !pass) { err.textContent = 'أدخل رقم الجوال وكلمة المرور'; return; }

  loginBtn.disabled = true; loginBtn.textContent = 'جارٍ الدخول…';
  try { await login(raw, pass); }
  catch (e) { err.textContent = authError(e.code); }
  loginBtn.disabled = false; loginBtn.textContent = 'تسجيل الدخول';
};
$('#loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
$('#loginEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginPass').focus(); });

$('#resetBtn').onclick = async () => {
  const raw = $('#loginEmail').value.trim();
  const err = $('#loginErr');
  if (!raw) { err.textContent = 'اكتب رقم جوالك أولاً ثم اضغط استعادة'; return; }
  try {
    await requestPasswordReset(raw);
    toast('أُرسل رابط استعادة كلمة المرور إلى بريدك', 'ok');
  } catch (e) {
    err.textContent = e.code === 'local-account'
      ? 'لإعادة تعيين كلمة المرور تواصل مع الأدمن — يقدر يغيّرها لك مباشرة'
      : authError(e.code);
  }
};

$('#logoutBtn').onclick = () => logout();

/* ── شاشة تغيير كلمة المرور لأول مرة ── */
const pwBtn = $('#pwSaveBtn');
pwBtn.onclick = async () => {
  const np = $('#pwNew').value, cf = $('#pwConfirm').value;
  const err = $('#pwErr'); err.textContent = '';
  if (np.length < 6) { err.textContent = 'كلمة المرور 6 أحرف على الأقل'; return; }
  if (np !== cf)     { err.textContent = 'كلمتا المرور غير متطابقتين'; return; }

  pwBtn.disabled = true; pwBtn.textContent = 'جارٍ الحفظ…';
  try {
    await changeOwnPassword(np);
    $('#pwNew').value = ''; $('#pwConfirm').value = '';
    await enterApp();
    toast('تم تعيين كلمة المرور', 'ok');
  } catch (e) {
    console.error(e);
    err.textContent = e.code === 'auth/requires-recent-login'
      ? 'انتهت الجلسة، سجّل الدخول من جديد ثم أعد المحاولة'
      : 'تعذّر تغيير كلمة المرور';
  }
  pwBtn.disabled = false; pwBtn.textContent = 'حفظ ومتابعة';
};
$('#pwConfirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') pwBtn.click(); });

/* ── دخول التطبيق ── */
let routerStarted = false;
async function enterApp() {
  setBootStage('جارٍ تحميل إعدادات النظام…');
  await loadSettings();
  showScreen('app');
  paintIdentity();
  buildNav();
  subscribeData();
  if (!routerStarted) { startRouter(); routerStarted = true; }
  /* دخول ثانٍ في نفس التبويب — replace لا دفع: صفحة المستخدم السابق لا
     يصحّ أن تبقى في مكدّس الرجوع لمن دخل بعده. */
  else go('home', '', { replace: true });
}

/* ── ربط المصادقة بالواجهة ── */
setBootStage('جارٍ التحقق من الجلسة…');

initAuth({
  onBeforeLoad: () => setBootStage('جارٍ تحميل بيانات حسابك…'),
  onSignedOut: () => {
    unsubscribeAll();
    cleanupPage();
    resetState();
    resetNav();
    showScreen('login');
  },
  onNeedsPassword: () => showScreen('password'),
  onAuthenticated: enterApp,
  onError: (msg) => {
    $('#loginErr').textContent = msg;
    showScreen('login');
  }
});
