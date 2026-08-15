/* ═══════════════════════════════════════════════════════════════════════════
   أرشيف المهام (٧-ح)

   ⚠️ صفحة مستقلة تماماً، **واللوحة اليومية لا تقرأ الأرشيف إطلاقاً** — وهذا
   كل الهدف. لوحة المدير مقيَّدة بالحالات النشطة صراحةً (`status in [...]`)
   لا بـ `!= 'archived'`: القائمة الصريحة أرخص ولا تحتاج فهرساً زائداً، و`!=`
   تقرأ الأرشيف ثم تطرحه فتدفع ثمنه في كل فتح.

   ⚠️ ولا تُحذف المؤرشفة أبداً. هي مادة التحليلات التاريخية، وحذفها يعني
   فقدان القدرة على المقارنة بين الدورات.
   ═══════════════════════════════════════════════════════════════════════════ */

import { el, esc } from '../lib/dom.js';
import { getMe, getUsers } from '../lib/state.js';
import { archivedTasksForDept } from '../lib/tasks.js';
import { searchArchive, taskAnalytics, PRIORITY_AR, STATUS_AR } from '../lib/task-flow.js';
import { isStale, go } from '../lib/nav.js';
import { isAdmin } from '../lib/perms.js';
import { card, empty, tableWrap, sectionHead, loading, callout, pageHead,
         statCard, pill, button } from '../lib/ui.js';
import { ymdKsa } from '../lib/dates.js';

export async function render(view, token) {
  const me = getMe();
  const admin = isAdmin();

  const depts = admin
    ? [...new Set(getUsers().filter((u) => u.role !== 'admin').map((u) => u.department).filter(Boolean))].sort()
    : [me.department].filter(Boolean);

  if (!depts.length) {
    view.appendChild(card('أرشيف المهام', null, 'archive'));
    view.appendChild(el('div', 'card', '<div class="empty">لم يُسنَد لك قسم.</div>'));
    return;
  }

  /* ⚠️ رأس صفحة لا بطاقة عنوان: البطاقة كانت تشغل ثلث الشاشة بلا معلومة
     واحدة، والأرشيف يُفتح للبحث لا للقراءة. */
  view.appendChild(pageHead('المهام المنجزة والمقفلة',
    'ما مضى على إنجازه ٣٠ يوماً — يُنقل هنا تلقائياً لتبقى اللوحة اليومية خفيفة، ولا يُحذف أبداً.',
    button('رجوع لمهام القسم', 'btn sm ghost', () => go('team-tasks'), 'back')));

  const sumHost = el('div', '');
  view.appendChild(sumHost);

  const head = card('');
  const bar = el('div', 'cluster');
  const q = el('input', 'grow');
  q.placeholder = 'ابحث في العنوان أو التفاصيل…';
  const uSel = el('select', '');
  const rSel = el('select', '');
  rSel.innerHTML = '<option value="0">كل التقييمات</option>' +
    [5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} فأعلى</option>`).join('');
  let deptSel = null;
  if (depts.length > 1) {
    deptSel = el('select', '');
    deptSel.innerHTML = depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    bar.appendChild(deptSel);
  }
  bar.append(q, uSel, rSel);
  head.appendChild(bar);
  view.appendChild(head);

  const host = el('div', '');
  view.appendChild(host);

  const currentDept = () => (deptSel ? deptSel.value : depts[0]);
  let loaded = [];

  async function load() {
    host.innerHTML = '';
    host.appendChild(loading('جارٍ تحميل الأرشيف…'));
    try { loaded = await archivedTasksForDept(currentDept()); }
    catch (e) {
      console.error('archive', e);
      if (isStale(token)) return;
      host.innerHTML = '';
      host.appendChild(callout('warn', 'تعذّر تحميل الأرشيف',
        'الغالب أن فهرس (departments, status, archivedAt) غير منشور بعد.'));
      return;
    }
    if (isStale(token)) return;

    uSel.innerHTML = '<option value="">كل الموظفين</option>' +
      [...new Map(loaded.map((t) => [t.assigneeUid, t.assigneeName])).entries()]
        .filter(([id]) => id)
        .map(([id, name]) => `<option value="${esc(id)}">${esc(name || id)}</option>`).join('');
    draw();
  }

  function draw() {
    host.innerHTML = '';
    /* ⚠️ الأرقام من نفس المصفوفة المجلوبة — الأرشيف كلّه في الذاكرة أصلاً،
       فالملخّص مجاني. ولوحة اليوم لا تقرأ هذه المجموعة إطلاقاً. */
    sumHost.innerHTML = '';
    if (loaded.length) {
      const an = taskAnalytics(loaded, ymdKsa());
      const sg = el('div', 'statgrid statgrid--3');
      sg.append(
        statCard({ label: 'مهام مؤرشفة', value: an.total, ico: 'archive',
          sub: 'محفوظة للمقارنة بين الدورات' }),
        statCard({ label: 'أُنجزت في وقتها', value: an.onTimePct === null ? '—' : an.onTimePct + '٪',
          ico: 'check', tone: an.onTimePct >= 80 ? 'good' : an.onTimePct >= 50 ? 'warn' : 'bad',
          sub: 'محسوبة على المنجزة وحدها' }),
        statCard({ label: 'متوسّط زمن الإنجاز', value: an.avgDays === null ? '—' : an.avgDays,
          ico: 'clock', sub: an.avgDays === null ? 'لا بيانات كافية' : 'يوماً من الإنشاء للاعتماد' })
      );
      sumHost.appendChild(sg);
    }
    const rows = searchArchive(loaded, {
      text: q.value, uid: uSel.value, minRating: Number(rSel.value) || 0
    });

    const c = card('');
    c.appendChild(sectionHead({ text: `النتائج (${rows.length} من ${loaded.length})`, icon: 'archive' }));
    if (!rows.length) {
      c.appendChild(empty(loaded.length ? 'لا نتائج مطابقة.' : 'لا مهام مؤرشفة بعد.', 'archive'));
      host.appendChild(c);
      return;
    }

    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th>المهمة</th><th>المكلَّف</th><th>الحالة</th><th class="num">أُنجزت</th>
          <th class="num">التقييم</th><th class="num">الإعادات</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');
    rows.forEach((t) => {
      const tr = el('tr', 'row-click');
      tr.innerHTML = `
        <td><b>${esc(t.title)}</b>
          <div class="cell-sub">${esc(PRIORITY_AR[t.priority] || '')}</div></td>
        <td>${esc(t.assigneeName || '—')}</td>
        <td>${pill(t.cancelledAt || t.status === 'cancelled' ? '' : 'g',
                   t.cancelledAt || t.status === 'cancelled'
                     ? STATUS_AR.cancelled : (STATUS_AR[t.status] || t.status))}</td>
        <td class="num">${esc(t.doneAtYmd || t.cancelledAtYmd || '—')}</td>
        <td class="num">${t.managerRating ? esc(t.managerRating) : '—'}</td>
        <td class="num ${t.reopenCount ? 'text-amber' : ''}">${t.reopenCount || '—'}</td>
        <td></td>`;
      tr.onclick = () => go('task', t.id);
      tb.appendChild(tr);
    });
    c.appendChild(w);
    host.appendChild(c);
  }

  /* بحث محلي — الأرشيف مجلوب كاملاً، فلا استعلام جديد لكل حرف */
  q.oninput = draw;
  uSel.onchange = draw;
  rSel.onchange = draw;
  if (deptSel) deptSel.onchange = load;

  await load();
}
