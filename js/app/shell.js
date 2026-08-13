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
import { navFor, dockFor, PAGES, HOME_ADMIN, ORG_MANAGER, EMPLOYEES_MANAGER, HR_DESK_ADMIN } from '../config/pages.js';
import { getPage, onNavigate, goBack, canGoBack } from '../lib/nav.js';
import { canApproveType, roleLabel } from '../lib/perms.js';
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

/* ── شريط الوجهات السفلي (الجوال) ──
   يُبنى مرّة واحدة بعد معرفة الدور. الخامس زرّ «المزيد» يفتح الدرج، فالقائمة
   كاملة تبقى على بُعد لمسة واحدة ولا يفقد الجوال شيئاً.

   ⚠️ الوجهات روابط <a href> حقيقية كروابط القائمة: تُركَّز بالكيبورد، وينطقها
   قارئ الشاشة روابطَ بوجهاتها، ولا تحتاج onclick لأن تغيير الـ hash يُطلق
   hashchange والراوتر مشترك فيه. */
export function buildDock() {
  const me = getMe();
  const box = $('#dock');
  if (!box || !me) return;

  const items = dockFor(me.role);
  if (!items.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '';

  /* المؤشّر المنزلق — عنصر واحد يتحرّك بـ transform بدل تلوين خلفية كل زرّ.
     يُوضع أولاً ليبقى خلف الوجهات. */
  box.appendChild(el('span', 'dock__bead', ''));

  for (const it of items) {
    const a = el('a', 'dock__item',
      `<span class="dock__ic">${icon(it.icon)}</span>` +
      `<span class="dock__lbl">${esc(it.short)}</span>`);
    a.dataset.page = it.id;
    if (it.badge) a.dataset.badge = '1';
    a.setAttribute('href', '#' + encodeURIComponent(it.id));
    box.appendChild(a);
  }

  const more = el('button', 'dock__item dock__more',
    `<span class="dock__ic">${icon('more')}</span><span class="dock__lbl">المزيد</span>`);
  more.type = 'button';
  more.setAttribute('aria-label', 'فتح القائمة كاملة');
  more.setAttribute('aria-controls', 'sidebar');
  more.onclick = () => $('#menuToggle')?.click();
  box.appendChild(more);

  /* الوسم أولاً ثم الوضع الفوري — الترتيب مقصود: placeBead تقرأ .active */
  document.querySelectorAll('#dock .dock__item').forEach((a) => {
    const on = a.dataset.page === getPage();
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
  });
  placeBead(true);
}

/* موضع المؤشّر يُقاس من العنصر نفسه لا يُحسب من ترتيبه: الحساب بالترتيب يفترض
   عرضاً متساوياً ويقلب الاتجاه في RTL.

   ⚠️ ويُقاس بـ getBoundingClientRect لا بـ offsetLeft: الدوك position:fixed،
   وoffsetLeft لعنصره يُقاس من الحاوية الأولية لا من الدوك — فطرح offsetLeft
   الدوك يحسب الإزاحة مرّتين. ظهر المؤشّر منزاحاً ١٣px قبل هذا التصحيح.
   والمستطيلات تعطي إحداثيات نافذة موحّدة، فالفرق بينها صحيح في الاتجاهين. */
function placeBead(instant = false) {
  const box = $('#dock');
  if (!box || box.hidden) return;
  const bead = box.querySelector('.dock__bead');
  const on = box.querySelector('.dock__item.active');
  if (!bead) return;
  if (!on) { bead.style.opacity = '0'; return; }

  const boxRect = box.getBoundingClientRect();
  const onRect = on.getBoundingClientRect();
  /* الدوك مخفيّ على سطح المكتب فمستطيله صفر — لا نكتب قياساً باطلاً */
  if (!boxRect.width) return;

  /* ⚠️ أول وضع بلا انتقال: الحبّة تبدأ عند translateX(0) أي فوق أول وجهة،
     فيراها المستخدم تنزلق من مكان خاطئ عند كل فتح للتطبيق. الانتقال معناه
     «انتقلتَ من هنا إلى هنا»، ولا انتقال في أول رسم. */
  if (instant) bead.style.transition = 'none';

  /* ⚠️ الحبّة دائرة تتمركز على الوجهة لا شريط بعرضها: مقاسها ثابت من CSS
     (--bead)، والموضع مركزُ الوجهة ناقص نصف القطر. الشريط بعرض الوجهة كان
     يتمدّد ويتقلّص مع طول التسمية فيبدو كأنه يتنفّس عند كل انتقال. */
  const size = parseFloat(getComputedStyle(box).getPropertyValue('--bead')) || 46;
  bead.style.opacity = '1';
  bead.style.transform =
    `translateX(${onRect.left - boxRect.left + onRect.width / 2 - size / 2}px)`;

  if (instant) {
    void bead.offsetWidth;      /* يُجبر الحساب قبل إعادة الانتقال */
    bead.style.transition = '';
  }
}

export function setActiveNav() {
  const cur = getPage();
  document.querySelectorAll('#navLinks a').forEach((a) => {
    const on = a.dataset.page === cur;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('#dock .dock__item').forEach((a) => {
    const on = a.dataset.page === cur;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  placeBead();
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
  /* ⚠️ canApproveType لا canApprove — لازم تطابق ما تعدّه صفحة «بانتظار
     موافقتك» في inbox.js، وهي تعدّ بـ canApproveType.

     الفرق ليس شكلياً: canApprove تُرجع true لمدير القسم على طلبات الإجازة،
     لكن الإجازة تُعدّل رصيد الموظف فيعتمدها الأدمن وحده. فكانت الشارة تقول
     لمدير القسم «٤» ثم يفتح الصفحة فيجد ثلاثة وسطراً يشرح أن الإجازات ليست
     له — رقم يعِد بعمل لا وجود له. */
  const pending = getRequests().filter((r) => r.status === 'pending' &&
    (hasChain(r) ? ownsCurrentStep(r) : canApproveType(r))).length;
  /* الشارة على القائمة **وعلى الدوك** معاً: من يعمل من الجوال لا يفتح الدرج
     ليكتشف أن عنده طلبات تنتظره. */
  document.querySelectorAll('#navLinks a[data-badge], #dock .dock__item[data-badge]')
    .forEach((a) => {
      a.querySelector('.badge')?.remove();
      if (!pending) return;
      const b = el('span', 'badge', String(pending));
      b.setAttribute('aria-label', `${pending} طلب بانتظار المراجعة`);
      a.appendChild(b);
    });
}

/* ── زرّ الرجوع ──
   يظهر في كل صفحة عدا الرئيسية، حتى حين يكون المكدّس فارغاً: الموظف الذي
   فتح الأيقونة على صفحة محفوظة يحتاج مخرجاً بقدر من وصلها بالتنقّل، و
   goBack() تأخذه للرئيسية في تلك الحالة. إخفاؤه عليه يعني حبسه في الصفحة. */
export function paintBackBtn(pageId) {
  const b = $('#backBtn');
  if (!b) return;
  b.hidden = pageId === 'home';
  b.setAttribute('aria-label', canGoBack() ? 'رجوع للصفحة السابقة' : 'رجوع للرئيسية');
}

export function setPageHeader(pageId) {
  const me = getMe();
  const meta = (pageId === 'home' && me.role === 'admin') ? HOME_ADMIN
             : (pageId === 'employees' && me.role === 'manager') ? EMPLOYEES_MANAGER
             : (pageId === 'org'  && me.role === 'manager') ? ORG_MANAGER
             : (pageId === 'hr-desk' && me.role === 'admin') ? HR_DESK_ADMIN
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

  const MOBILE = () => window.matchMedia('(max-width: 860px)').matches;
  /* ⚠️ الدرج المغلق مخفي بـ transform فقط، فيبقى في ترتيب التنقّل وفي شجرة
     الوصول: مستخدم لوحة المفاتيح أو قارئ الشاشة يدخل قائمة غير مرئية. */
  const syncInert = () => { sidebar.inert = MOBILE() && !sidebar.classList.contains('open'); };

  const close = () => {
    if (!sidebar.classList.contains('open')) { syncInert(); return; }
    sidebar.classList.remove('open');
    if (scrim) scrim.classList.remove('show');
    toggle.setAttribute('aria-expanded', 'false');
    syncInert();
    unlockScroll();
    toggle.focus();
  };
  const open = () => {
    sidebar.classList.add('open');
    if (scrim) scrim.classList.add('show');
    toggle.setAttribute('aria-expanded', 'true');
    syncInert();
    lockScroll();
    sidebar.querySelector('a')?.focus();
  };

  toggle.onclick = () => (sidebar.classList.contains('open') ? close() : open());

  /* ⚠️ يُركَّب مرة واحدة هنا لا في كل عرض صفحة: الزرّ عنصر ثابت في الترويسة،
     فإعادة ربطه مع كل تنقّل تُراكم لا شيء لكنها تُخفي أين رُبط فعلاً. */
  const back = $('#backBtn');
  if (back) back.onclick = () => goBack();

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
  /* المؤشّر مقيس بالبكسل، فتغيّر العرض يُبطل قياسه — يُعاد مع كل تغيّر مقاس */
  window.addEventListener('resize', () => { syncInert(); placeBead(); });
  syncInert();

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
