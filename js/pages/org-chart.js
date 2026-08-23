/* ═══════════════════════════════════════════════════════════════════════════
   الهيكل التنظيمي — من يتبع من.

   ── لماذا صفحة واحدة لدورين ──
   الأدمن يريد الشجرة كاملة، والمدير يريد فريقه. وهما نفس العرض بجذر مختلف:
   الأدمن جذره الشركة، والمدير جذره نفسه. فصلهما لصفحتين يعني نسخة ثانية من
   نفس منطق الرسم تتباعد عن الأولى مع أول تعديل.

   ── لماذا جدول لا رسم شجري ──
   الرسم الشجري (صناديق وخطوط) يحتاج تمريراً أفقياً على الجوال ويكسر قارئ
   الشاشة. الجدول المُزاح بالعمق يقرأ صحيحاً، ويُبحث فيه، ويطبع.

   ⚠️ العمق يُزاح بـ padding-inline-start لا بمسافات في النصّ: النظام RTL،
   والمسافات تنهار في HTML ولا يفهمها قارئ الشاشة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { getMe, getUsers } from '../lib/state.js';
import { refreshUsers } from '../lib/users.js';
import { orgTree, flattenTree, directReports, allReports, managerOf } from '../lib/org.js';
import { go, isStale } from '../lib/nav.js';
import { card, tableWrap, empty, button, callout, sectionHead , statCard } from '../lib/ui.js';
import { roleLabel } from '../lib/perms.js';

export async function render(view, token) {
  const me = getMe();
  const isAdmin = me.role === 'admin';

  const bar = el('div', 'toolbar');
  bar.innerHTML = `<input id="orgSearch" class="search-input" placeholder="بحث بالاسم أو القسم أو المسمّى…">`;
  view.appendChild(bar);

  const host = el('div', '');
  view.appendChild(host);

  try { await refreshUsers(); } catch (e) { console.error(e); }
  if (isStale(token)) return;
  draw();
  const search = view.querySelector('#orgSearch');
  if (search) search.oninput = draw;

  function draw() {
    const q = (view.querySelector('#orgSearch')?.value || '').trim();
    host.innerHTML = '';
    const users = getUsers();

    /* ── المدير: فريقه وحده ── */
    if (!isAdmin) return drawTeam(host, me, users, q);

    /* ── الأدمن: الشركة كاملة ── */
    const { tree, orphans } = orgTree(users);
    const rows = flattenTree(tree);

    /* حقل managerUid اختياري وجديد. لو لم يُملأ بعد فالشجرة كلها جذور —
       وعرضها بلا تفسير يبدو خللاً. */
    const linked = users.filter((u) => u.managerUid).length;
    const sc = card('');
    const sg = el('div', 'statgrid');
    sg.append(
      statCard({ label: 'موظف', value: users.length, ico: 'people', sub: 'في الشركة كلها' }),
      statCard({ label: 'مرتبط بمدير', value: linked, ico: 'network',
        tone: linked === 0 ? 'bad' : linked < users.length / 2 ? 'warn' : 'good',
        sub: linked === users.length ? 'الشجرة مكتملة' : `${users.length - linked} بلا ارتباط` }),
      statCard({ label: 'بلا مدير مباشر', value: tree.length, ico: 'alert',
        sub: 'رؤوس الشجرة' }),
      statCard({ label: 'أعمق مستوى', value: maxDepth(tree), ico: 'building',
        sub: 'طبقات الإدارة' })
    );
    sc.appendChild(sg);
    if (linked < users.length) {
      sc.appendChild(callout('warn', `${users.length - linked} موظفاً بلا مدير مباشر`,
        'الحقل يُملأ من «ملفات الموظفين ← تعديل البيانات ← المدير المباشر». ' +
        'بدونه لا يظهر الموظف تحت أحد، ولا تصل طلباته لمديره تلقائياً.'));
    }
    host.appendChild(sc);

    const tc = card('');
    tc.appendChild(sectionHead({ text: 'الشجرة التنظيمية', icon: 'building' }));
    const visible = q ? rows.filter((n) => matches(n.u, q)) : rows;
    if (!visible.length) tc.appendChild(empty(q ? 'لا نتائج' : 'لا يوجد موظفون', 'people'));
    else tc.appendChild(treeTable(visible, users, q));
    host.appendChild(tc);

    /* من سقط خارج الشجرة بسبب حلقة تسلسل — يُعرض بدل أن يختفي بصمت */
    if (orphans.length) {
      const oc = card('');
      oc.appendChild(sectionHead({ text: 'خارج الشجرة', icon: 'alert' }));
      oc.appendChild(callout('err', 'حلقة تسلسل إداري',
        'هؤلاء يتبع بعضهم بعضاً في دائرة مغلقة، فلا جذر لهم. صحّح «المدير المباشر» لأحدهم.'));
      oc.appendChild(treeTable(orphans.map((u) => ({ u, depth: 0, children: [] })), users, q));
      host.appendChild(oc);
    }
  }
}

/* ═══ عرض المدير: فريقي ═══ */
function drawTeam(host, me, users, q) {
  const direct = directReports(me.id, users);
  const all = allReports(me.id, users);
  const boss = managerOf(me, users);

  const sc = card('');
  const suspended = all.filter((u) => u.status !== 'active').length;
  const sg = el('div', 'statgrid');
  sg.append(
    statCard({ label: 'يتبعني مباشرةً', value: direct.length, ico: 'people',
      sub: 'المستوى الأول تحتك' }),
    statCard({ label: 'في فريقي كاملاً', value: all.length, ico: 'network',
      sub: 'بكل المستويات' }),
    statCard({ label: 'حساب معلّق', value: suspended, ico: 'alert',
      tone: suspended ? 'warn' : 'good',
      sub: suspended ? 'لا يستطيع الدخول' : 'كل الحسابات نشِطة' })
  );
  sc.appendChild(sg);
  if (boss) sc.appendChild(el('p', 'help', `مديرك المباشر: ${esc(boss.name || '—')}`));
  host.appendChild(sc);

  const tc = card('');
  tc.appendChild(sectionHead({ text: 'فريقي', icon: 'people' }));

  /* ⚠️ حدّ حقيقي لا تجميل: قاعدة users تمنح المدير قراءة قسمه وحده
     (sameDept)، و refreshUsers تستعلم بالقسم مطابقةً لها. فلو كان أحد
     مرؤوسيك مسجَّلاً في قسم آخر لن يظهر هنا — ليس خطأ في الربط بل حدّ
     صلاحية. توسيعه يحتاج تعديل القاعدة نفسها، لا الواجهة. */
  tc.appendChild(el('p', 'desc',
    `يُعرض من هم في قسمك (${esc(me.department || '—')}) ويتبعونك في الهيكل.`));

  if (!all.length) {
    tc.appendChild(empty('لا يتبعك أحد في الهيكل التنظيمي بعد', 'people'));
    tc.appendChild(el('p', 'help',
      'الأدمن يربط الموظف بمديره من «ملفات الموظفين ← تعديل البيانات ← المدير المباشر».'));
  } else {
    /* شجرة فرعية جذرها المدير نفسه — بنفس دالة الرسم */
    const sub = subtree(me, users, 0);
    const rows = flattenTree(sub.children);
    const visible = q ? rows.filter((n) => matches(n.u, q)) : rows;
    if (!visible.length) tc.appendChild(empty('لا نتائج', 'people'));
    else tc.appendChild(treeTable(visible, users, q));
  }
  host.appendChild(tc);
}

/* شجرة فرعية بحارس زيارة — نفس حماية org.js من الحلقة */
function subtree(u, users, depth, seen = new Set()) {
  if (seen.has(u.id) || depth > 12) return { u, depth, children: [] };
  seen.add(u.id);
  return {
    u, depth,
    children: directReports(u.id, users).map((c) => subtree(c, users, depth + 1, seen))
  };
}

const matches = (u, q) =>
  (u.name || '').includes(q) || (u.department || '').includes(q) ||
  (u.jobTitle || '').includes(q) || String(u.empId || '').includes(q);

function maxDepth(nodes, d = 0) {
  let m = nodes.length ? d + 1 : d;
  for (const n of nodes) m = Math.max(m, maxDepth(n.children, d + 1));
  return m;
}

/* ═══ الجدول ═══
   عند البحث تُعرض النتائج مسطّحة بعمق صفر: الإزاحة بلا الأب الذي فوقها
   تُضلِّل أكثر مما تفيد. */
function treeTable(nodes, users, q) {
  const wrap = tableWrap(`
    <table>
      <thead><tr>
        <th>الموظف</th><th>القسم</th><th class="num">يتبعه</th><th>الحالة</th><th>الصلاحية</th><th></th>
      </tr></thead>
      <tbody></tbody>
    </table>`);
  const tb = wrap.querySelector('tbody');

  nodes.forEach((n) => {
    const u = n.u;
    const kids = directReports(u.id, users).length;
    const pad = q ? 0 : Math.min(n.depth, 8) * 18;
    const tr = el('tr', '');
    tr.innerHTML = `
      <td>
        <div class="org-cell" style="padding-inline-start:${pad}px">
          ${n.depth && !q ? '<span class="org-branch" aria-hidden="true"></span>' : ''}
          <span>
            <b>${esc(u.name || '—')}</b>
            <span class="cell-sub">${esc(u.jobTitle || '')}</span>
          </span>
        </div>
      </td>
      <td>${esc(u.department || '—')}</td>
      <td class="num">${kids || '—'}</td>
      <td><span class="pill pill--dot ${u.status === 'active' ? 'active' : 'suspended'}">${
        u.status === 'active' ? 'نشط' : 'معلّق'}</span></td>
      <td>${u.role === 'employee' ? 'موظف' : `<span class="tag">${esc(roleLabel(u))}</span>`}</td>`;

    const act = el('td', '');
    act.appendChild(button('بروفايل', 'btn sm ghost',
      () => go('profile', u.id), 'people'));
    tr.appendChild(act);
    tb.appendChild(tr);
  });
  return wrap;
}
