/* ═══════════════════════════════════════════════════════════════════════════
   قشرة التطبيق — الشريط الجانبي المُجمّع، الهوية، الشارات، الترويسة.

   الجديد هنا: التنقّل صار مجموعات بعناوين بدل قائمة مسطّحة من عشرة روابط.
   هذا طلب المالك «تقسيم التصنيفات» — وهو أيضاً نصف علاج شكواه الأخرى، لأن
   قائمة مسطّحة تضع «طلباتي» بجانب «مسير الرواتب» تجعل النظام يبدو بلا بنية.
   ═══════════════════════════════════════════════════════════════════════════ */

import { $, el, esc, lockScroll, unlockScroll } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { openPalette, bindPaletteShortcut } from '../components/command-palette.js';
import { bindBell, paintBell } from '../components/notif-panel.js';
import { getMe, getRequests } from '../lib/state.js';
import { navFor, PAGES, HOME_ADMIN, ORG_MANAGER } from '../config/pages.js';
import { getPage, onNavigate } from '../lib/nav.js';
import { canApprove, roleLabel } from '../lib/perms.js';
import { hasChain, ownsCurrentStep } from '../lib/requests.js';

export function paintIdentity() {
  const me = getMe();
  if (!me) return;
  $('#sideName').textContent = me.name || '—';
  $('#sideRole').textContent = me.role === 'admin' ? 'مدير النظام' : (me.jobTitle || roleLabel(me));
}

export function buildNav() {
  const me = getMe();
  const box = $('#navLinks');
  box.innerHTML = '';

  for (const group of navFor(me.role)) {
    if (group.group) {
      box.appendChild(el('div', 'nav-group-title', esc(group.group)));
    }
    const list = el('div', 'nav-group');
    for (const item of group.items) {
      /* ⚠️ item.icon صار اسم أيقونة لا رمز إيموجي. icon() ترجع '' لاسم غير
         معروف بدل أن ترمي — فرابط بلا أيقونة أهون من قائمة تنقّل لا تُبنى. */
      const a = el('a', '', `${icon(item.icon)}<span class="nav-label">${esc(item.label)}</span>`);
      a.dataset.page = item.id;
      if (item.badge) a.dataset.badge = '1';
      /* ── رابط حقيقي بعنوان حقيقي ──
         بعد أن صارت الصفحة في الـ hash، صار للرابط وجهة فعلية. فأُسقط
         role="link" و tabindex="0" و onkeydown — كانت كلها تقليداً يدوياً
         لما يفعله <a href> أصلاً وبشكل أصحّ: يُركَّز بالكيبورد، وينطقه قارئ
         الشاشة رابطاً بوجهته، ويفتحه النقر الأوسط في تبويب جديد، ويُظهر
         المتصفح وجهته في شريط الحالة.
         ولا نحتاج onclick: تغيير الـ hash يُطلق hashchange، والراوتر مشترك فيه. */
      a.setAttribute('href', '#' + encodeURIComponent(item.id));
      list.appendChild(a);
    }
    box.appendChild(list);
  }
  setActiveNav();
  updateBadges();
}

export function setActiveNav() {
  const cur = getPage();
  document.querySelectorAll('#navLinks a').forEach((a) => {
    const on = a.dataset.page === cur;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/* شارة عدد الطلبات المنتظرة — تعدّ ما يستطيع هذا المستخدم اعتماده فقط */
export function updateBadges() {
  const me = getMe();
  if (!me) return;

  /* ⚠️ الجرس يُرسم هنا قبل الخروج المبكر أدناه: الموظف العادي لا شارة له
     على «بانتظار موافقتك» (لا يملك الصفحة أصلاً)، لكن له إشعارات — قرار على
     طلبه، ومستند يقارب الانتهاء. وضعه بعد الخروج يعني جرساً ميتاً للموظفين،
     وهم أكثر من يحتاجه. */
  paintBell();

  if (me.role !== 'admin' && me.role !== 'manager') return;
  const pending = getRequests().filter((r) => r.status === 'pending' &&
    (hasChain(r) ? ownsCurrentStep(r) : canApprove(r))).length;
  const a = document.querySelector('#navLinks a[data-badge]');
  if (!a) return;
  a.querySelector('.badge')?.remove();
  if (pending) {
    const b = el('span', 'badge', String(pending));
    b.setAttribute('aria-label', `${pending} طلب بانتظار المراجعة`);
    a.appendChild(b);
  }
}

export function setPageHeader(pageId) {
  const me = getMe();
  const meta = (pageId === 'home' && me.role === 'admin') ? HOME_ADMIN
             : (pageId === 'org'  && me.role === 'manager') ? ORG_MANAGER
             : (PAGES[pageId] || { title: '', hint: '' });
  $('#pageTitle').textContent = meta.title;
  $('#pageHint').textContent  = meta.hint;
  document.title = meta.title ? `${meta.title} — سين العقارية` : 'إدارة الموارد البشرية — سين العقارية';
}

/* ── الشريط الجانبي على الجوال ── */
export function initShellChrome() {
  const sidebar = $('#sidebar');
  const toggle  = $('#menuToggle');
  const scrim   = $('#navScrim');

  const close = () => {
    if (!sidebar.classList.contains('open')) return;
    sidebar.classList.remove('open');
    if (scrim) scrim.classList.remove('show');
    toggle.setAttribute('aria-expanded', 'false');
    unlockScroll();
  };
  const open = () => {
    sidebar.classList.add('open');
    if (scrim) scrim.classList.add('show');
    toggle.setAttribute('aria-expanded', 'true');
    lockScroll();
  };

  toggle.onclick = () => (sidebar.classList.contains('open') ? close() : open());

  /* ── البحث الموحّد ──
     الاختصار يُركَّب مرة واحدة هنا لا في كل عرض صفحة، وزر ظاهر بجواره لأن
     ⌘K لا وجود له على الجوال. */
  bindPaletteShortcut();
  const search = $('#globalSearch');
  if (search) search.onclick = openPalette;
  bindBell();
  if (scrim) scrim.onclick = close;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  /* ⚠️ يُغلق الدرج عند كل تنقّل. النسخة القديمة كانت تفعل هذا داخل go()
     (السطر 746)، وضاع في التقسيم — فكان الموظف يضغط صفحة على الجوال
     فتبقى القائمة مفتوحة فوق الصفحة التي طلبها. */
  onNavigate(close);

  return { closeSidebar: close };
}

export function showScreen(which) {
  const map = { login: '#loginScreen', password: '#pwScreen', app: '#app' };
  for (const [k, sel] of Object.entries(map)) {
    $(sel).classList.toggle('hidden', k !== which);
  }
  /* الإقلاع اكتمل — يوقف مؤقّت الإنقاذ في index.html */
  if (window.__seenBoot) window.__seenBoot.done = true;
  $('#bootLoading')?.classList.add('hidden');
}

/* يحدّث نص شاشة الإقلاع ومرحلتها.
   الشاشة تبقى ظاهرة حتى تُعرض شاشة حقيقية، لكن الموظف يرى أين وصلنا بدل
   نص ثابت لا يتغيّر — ولو تعلّق الإقلاع تُذكر المرحلة في رسالة الخطأ. */
export function setBootStage(msg) {
  const m = $('#bootMsg');
  if (m) m.textContent = msg;
  const s = $('#bootStage');
  if (s) s.textContent = msg;
}
