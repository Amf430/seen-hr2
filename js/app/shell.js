/* ═══════════════════════════════════════════════════════════════════════════
   قشرة التطبيق — الشريط الجانبي المُجمّع، الهوية، الشارات، الترويسة.

   الجديد هنا: التنقّل صار مجموعات بعناوين بدل قائمة مسطّحة من عشرة روابط.
   هذا طلب المالك «تقسيم التصنيفات» — وهو أيضاً نصف علاج شكواه الأخرى، لأن
   قائمة مسطّحة تضع «طلباتي» بجانب «مسير الرواتب» تجعل النظام يبدو بلا بنية.
   ═══════════════════════════════════════════════════════════════════════════ */

import { $, el, esc, lockScroll, unlockScroll } from '../lib/dom.js';
import { getMe, getRequests } from '../lib/state.js';
import { navFor, PAGES, HOME_ADMIN } from '../config/pages.js';
import { go, getPage, onNavigate } from '../lib/nav.js';
import { canApprove, roleLabel } from '../lib/perms.js';

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
      const a = el('a', '', `<span class="ic" aria-hidden="true">${item.icon}</span><span class="nav-label">${esc(item.label)}</span>`);
      a.dataset.page = item.id;
      if (item.badge) a.dataset.badge = '1';
      a.setAttribute('role', 'link');
      a.setAttribute('tabindex', '0');
      a.onclick = () => go(item.id);
      a.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(item.id); } };
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
  if (!me || (me.role !== 'admin' && me.role !== 'manager')) return;
  const pending = getRequests().filter((r) => r.status === 'pending' && canApprove(r)).length;
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
  const meta = (pageId === 'home' && me.role === 'admin') ? HOME_ADMIN : (PAGES[pageId] || { title: '', hint: '' });
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
