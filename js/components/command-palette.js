/* ═══════════════════════════════════════════════════════════════════════════
   البحث الموحّد — ⌘K / Ctrl+K.

   ٣٧ موظفاً اليوم، ومئتان غداً. صندوق واحد يقفز لأي موظف أو طلب أو صفحة بلا
   المرور بثلاث شاشات.

   ⚠️ يبحث في الكاش المحمَّل فقط (getUsers / getRequests) ولا يستعلم من
   Firestore إطلاقاً. سببان: البحث الفوري على كل ضغطة مفتاح يستنزف حصّة
   القراءات المجانية بلا مقابل، والنتائج التي يراها المستخدم يجب أن تكون
   نفسها التي تعرضها الشاشات — لا أن يجد في البحث موظفاً لا يراه في الجدول.

   ⚠️ لا يتجاوز الصلاحيات: الكاش نفسه مبنيّ على استعلامات محكومة بقواعد
   Firestore، فمدير القسم لا يرى في البحث إلا ما يراه في شاشاته.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc, openModal, toast, uid } from '../lib/dom.js';
import { getUsers, getRequests, getMe } from '../lib/state.js';
import { go } from '../lib/nav.js';
import { PAGES, canOpen, NAV_GROUPS } from '../config/pages.js';
import { readTodos, writeTodos } from '../lib/todo-io.js';
import { addItem } from '../lib/todo.js';
import { icon } from '../lib/icons.js';
import { STATUS_AR } from '../lib/dates.js';
import { fmtDate } from '../lib/format.js';

const norm = (s) => (s == null ? '' : String(s))
  /* التشكيل والهمزات: «مُحمَّد» و«محمد» و«احمد» و«أحمد» يجب أن تتطابق */
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .toLowerCase().trim();

const hit = (hay, q) => norm(hay).includes(q);

/* ⚠️ الكتابة هنا لا في الصفحة: الغرض كلّه ألّا يغادر المستخدم ما يفعله.
   والفشل يُقال صراحةً — عنصرٌ ظنّ أنه حُفظ ولم يُحفظ أسوأ من رفضٍ ظاهر. */
async function quickAdd(text) {
  try {
    const cur = await readTodos();
    const r = addItem(cur, { text }, uid());
    if (r.error) { toast(r.error, 'err'); return; }
    await writeTodos(r.items);
    toast('أُضيف إلى قائمتك', 'ok');
  } catch (e) { console.error('quick-add', e); toast('تعذّرت الإضافة', 'err'); }
}

/* ── جمع النتائج ── */
function search(q, raw) {
  const me = getMe();
  if (!me) return [];
  const out = [];

  /* ── الإضافة السريعة إلى القائمة الشخصية ──
     ⚠️ أعيد استعمال ⌘K بدل اختصار جديد وواجهة جديدة: المستخدم يعرف هذا
     الصندوق أصلاً، واختصارٌ ثانٍ يُتعلَّم مرّةً ويُنسى.

     ⚠️ وأول النتائج دائماً لا آخرها: من كتب نصّاً حرّاً لا يطابق صفحةً ولا
     موظفاً يريد الأغلب أن يسجّله. والنصّ نفسه يبقى قابلاً للبحث تحته. */
  const text = String(raw || '').trim();
  if (text.length >= 2) {
    out.push({ kind: 'todo', id: 'todo-add', ico: 'plus',
      title: `أضف «${text}» إلى قائمتي`,
      sub: 'قائمة شخصية — لا يراها أحد غيرك',
      run: () => quickAdd(text) });
  }

  /* الصفحات المتاحة لهذا الدور */
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (!it.roles.includes(me.role)) continue;
      const meta = PAGES[it.id] || {};
      if (!hit(it.label, q) && !hit(meta.hint, q) && !hit(g.group, q)) continue;
      if (out.some((r) => r.kind === 'page' && r.id === it.id)) continue;
      out.push({ kind: 'page', id: it.id, ico: it.icon, title: it.label,
                 sub: g.group || meta.hint || '', run: () => go(it.id) });
    }
  }

  /* الموظفون — للأدمن ومدير القسم فقط */
  if (me.role === 'admin' || me.role === 'manager') {
    for (const u of getUsers()) {
      if (!hit(u.name, q) && !hit(u.empId, q) && !hit(u.department, q) && !hit(u.jobTitle, q)) continue;
      out.push({ kind: 'emp', id: u.id, ico: 'people', title: u.name || '—',
                 sub: [u.jobTitle, u.department, u.empId && 'رقم ' + u.empId].filter(Boolean).join(' · '),
                 badge: u.status === 'suspended' ? 'معلّق' : '',
                 run: () => go('profile', u.id) });
    }
  }

  /* الطلبات */
  for (const r of getRequests()) {
    if (!hit(r.employeeName, q) && !hit(r.categoryLabel, q) && !hit(r.reasonLabel, q)) continue;
    const when = r.type === 'permission' ? r.date : r.startDate;
    out.push({ kind: 'req', id: r.id, ico: 'inbox',
               title: `${r.type === 'permission' ? 'استئذان' : 'إجازة'} — ${r.categoryLabel || ''}`,
               sub: `${r.employeeName || ''} · ${when ? fmtDate(when) : ''}`,
               badge: STATUS_AR[r.status] || '',
               run: () => go(r.status === 'pending' && (me.role === 'admin' || me.role === 'manager') ? 'inbox' : 'mine') });
  }

  /* الصفحات أولاً — من يكتب «رواتب» يريد الشاشة لا موظفاً اسمه كذلك */
  const rank = { page: 0, emp: 1, req: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 40);
}

const KIND_AR = { page: 'شاشة', emp: 'موظف', req: 'طلب', todo: 'أضف' };

export function openPalette() {
  const m = openModal(`
    <h3>البحث في النظام</h3>
    <div class="field">
      <label for="cpQ" class="sr-only">ابحث</label>
      <input id="cpQ" class="cp-input" autocomplete="off" placeholder="اسم موظف، رقم وظيفي، قسم، أو اسم شاشة…">
    </div>
    <div class="cp-list" id="cpList" role="listbox" aria-label="نتائج البحث"></div>
    <p class="help">↑ ↓ للتنقّل · Enter للفتح · Esc للإغلاق</p>
    <div class="row"><button class="btn ghost" id="cpClose">إغلاق</button></div>`);

  const input = m.$('#cpQ'), list = m.$('#cpList');
  let results = [], active = 0;
  m.$('#cpClose').onclick = m.close;

  const draw = () => {
    list.innerHTML = '';
    if (!results.length) {
      list.innerHTML = `<div class="cp-empty">${
        input.value.trim() ? 'لا نتائج مطابقة' : 'اكتب للبحث…'}</div>`;
      return;
    }
    results.forEach((r, i) => {
      const row = el('button', 'cp-row' + (i === active ? ' is-active' : ''),
        `${icon(r.ico)}<span class="cp-row__body"><b>${esc(r.title)}</b>${
          r.sub ? `<span>${esc(r.sub)}</span>` : ''}</span>` +
        (r.badge ? `<span class="pill pill--dot ${esc(r.kind === 'req' ? 'pending' : 'suspended')}">${esc(r.badge)}</span>` : '') +
        `<span class="cp-row__kind">${KIND_AR[r.kind]}</span>`);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === active ? 'true' : 'false');
      row.onclick = () => { m.close(); r.run(); };
      list.appendChild(row);
    });
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  input.oninput = () => {
    const q = norm(input.value);
    results = q.length >= 1 ? search(q, input.value) : [];
    active = 0;
    draw();
  };

  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); m.close(); results[active].run(); }
  };

  draw();
  input.focus();
}

/* ⚠️ يُركَّب مرة واحدة على مستوى التطبيق لا لكل صفحة — التركيب في كل عرض
   يُراكم مستمعين على document، فتُفتح نوافذ بعدد الصفحات التي زارها المستخدم. */
let bound = false;
export function bindPaletteShortcut() {
  if (bound) return;
  bound = true;
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      /* لا تفتح فوق نافذة مفتوحة، ولا قبل تسجيل الدخول */
      if (!getMe() || document.querySelector('.overlay')) return;
      e.preventDefault();
      openPalette();
    }
  });
}
