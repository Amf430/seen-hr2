/* ═══════════════════════════════════════════════════════════════════════════
   الهيكل التنظيمي والمدير المباشر.

   ── المشكلة ──
   حقل `manager` على وثيقة الموظف نصّ حرّ: «أ. فهد» أو «فهد الحربي» أو «مدير
   المبيعات». لا يربط بأحد، فلا يستطيع النظام أن يعرف من مدير من — ولا أن
   يوجّه طلباً، ولا أن يعرض لمدير فريقه.

   ── الحل ──
   `managerUid` يشير إلى وثيقة موظف حقيقية. والحقل النصّي القديم يبقى كما هو
   ولا يُحذف: هو ما يُعرض اليوم في بطاقة الموظف، ولا نملك ترحيلاً آلياً موثوقاً
   من نصّ إلى معرّف (اسمان متشابهان يكفيان لربط خاطئ). المطابقة تبقى قراراً
   يدوياً من الأدمن، ويقترح عليه النظام المرشّحين.

   ⚠️ حلقة تسلسل: لو صار أ مديرَ ب وب مديرَ أ، فأي تسلّق للشجرة يدور للأبد.
   كل دالة هنا تحمل حارس زيارة، و `wouldCycle` تمنع الحلقة عند الحفظ أصلاً.
   ═══════════════════════════════════════════════════════════════════════════ */

import { getUsers } from './state.js';

const byId = (users) => {
  const m = new Map();
  users.forEach((u) => m.set(u.id, u));
  return m;
};

/* المرؤوسون المباشرون */
export function directReports(uid, users = getUsers()) {
  return users.filter((u) => u.managerUid === uid)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/* كل من تحت هذا الشخص، مهما نزلت الشجرة */
export function allReports(uid, users = getUsers()) {
  const seen = new Set([uid]);
  const out = [];
  const walk = (id) => {
    for (const u of users) {
      if (u.managerUid !== id || seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(u);
      walk(u.id);
    }
  };
  walk(uid);
  return out;
}

/* سلسلة المديرين صعوداً — الأقرب أولاً */
export function managerChain(uid, users = getUsers()) {
  const map = byId(users);
  const chain = [];
  const seen = new Set([uid]);
  let cur = map.get(uid);
  while (cur && cur.managerUid && !seen.has(cur.managerUid)) {
    const boss = map.get(cur.managerUid);
    if (!boss) break;
    seen.add(boss.id);
    chain.push(boss);
    cur = boss;
  }
  return chain;
}

export const managerOf = (u, users = getUsers()) =>
  (u && u.managerUid) ? (byId(users).get(u.managerUid) || null) : null;

/* ⚠️ يمنع الحلقة قبل الحفظ: هل جعل `bossId` مديراً لـ `uid` يخلق دورة؟
   يكفي أن نسأل: هل uid موجود أصلاً في سلسلة مديري bossId؟ */
export function wouldCycle(uid, bossId, users = getUsers()) {
  if (!bossId) return false;
  if (bossId === uid) return true;
  return managerChain(bossId, users).some((m) => m.id === uid);
}

/* المرشّحون لأن يكونوا مديراً لهذا الموظف — بلا نفسه وبلا من يخلق حلقة */
export function managerCandidates(uid, users = getUsers()) {
  return users
    .filter((u) => u.id !== uid && u.status !== 'suspended' && !wouldCycle(uid, u.id, users))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/* ═══ الشجرة ═══
   الجذور: من لا مدير له، أو من مديره غير موجود (حُذف مثلاً) — فلا يسقط أحد
   خارج الشجرة بصمت. */
export function orgTree(users = getUsers()) {
  const map = byId(users);
  const roots = users.filter((u) => !u.managerUid || !map.has(u.managerUid));
  const seen = new Set();
  const build = (u, depth) => {
    if (seen.has(u.id) || depth > 12) return null;
    seen.add(u.id);
    return {
      u, depth,
      children: directReports(u.id, users).map((c) => build(c, depth + 1)).filter(Boolean)
    };
  };
  const tree = roots
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((r) => build(r, 0)).filter(Boolean);
  /* من بقي خارج الشجرة بسبب حلقة — يُعرض منفصلاً بدل أن يختفي */
  const orphans = users.filter((u) => !seen.has(u.id));
  return { tree, orphans };
}

/* تسطيح الشجرة لصفوف قابلة للعرض في جدول */
export function flattenTree(nodes, out = []) {
  for (const n of nodes) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}
