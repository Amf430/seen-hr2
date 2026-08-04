/* ═══════════════════════════════════════════════════════════════════════════
   لوحة أفضل المنتظمين — النشر والقراءة

   ── لماذا وثيقة منشورة، ولا يحسبها كل موظف عنده ──
   الموظف لا يقرأ سجلات زملائه، وهذا مقصود: قاعدة zkAttendance تسمح له
   بسجلاته هو فقط، و sameDept() تشترط أن يكون مديراً. فلو حسبنا اللوحة في
   متصفح الموظف لخرجت فارغة دائماً — أو لاضطررنا لفتح سجلات الحضور للجميع،
   وهو ثمن باهظ للوحة تحفيز.

   فالأدمن يحسبها من لوحته (يقرأ الكل أصلاً) ويكتب النتيجة في وثيقة واحدة
   صغيرة، والموظف يقرأها. لا تحتوي إلا ما يُعرض: الاسم والقسم والنسبة.
   لا رواتب، ولا تواريخ حضور، ولا معرّفات مفيدة لأحد.

   ⚠️ تُحدَّث حين يفتح الأدمن لوحته، لا تلقائياً. لذلك تحمل `at` ويُعرض
   تاريخها للموظف — لوحة قديمة تُقرأ على أنها اليوم أسوأ من لوحة مؤرَّخة.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, serverTimestamp } from './firebase.js';

const REF = () => doc(db, 'leaderboard', 'weekly');

/* عدد من يُعرضون. ثلاثة كما طلب المالك — والقائمة الطويلة تُذهب معنى «الأفضل». */
export const TOP_N = 3;

/* يكتبها الأدمن. تُقصّ إلى TOP_N قبل الكتابة: ما لا يُعرض لا يُنشر. */
export async function publishLeaderboard({ board, window: win, minDays }) {
  await setDoc(REF(), {
    top: board.slice(0, TOP_N).map((x, i) => ({
      rank: i + 1,
      name: x.name,
      department: x.department || '',
      rate: x.rate,
      days: x.counted
    })),
    from: win.start.toISOString().slice(0, 10),
    to:   win.end.toISOString().slice(0, 10),
    minDays,
    at: serverTimestamp()
  });
}

/* يقرأها الجميع. تُرجع null لو لم تُنشر بعد — والصفحة تخفي البطاقة عندها
   بدل أن تعرض لوحة فارغة تبدو عطلاً. */
export async function readLeaderboard() {
  try {
    const snap = await getDoc(REF());
    if (!snap.exists()) return null;
    const d = snap.data();
    return (d.top && d.top.length) ? d : null;
  } catch (e) {
    console.error('leaderboard', e);
    return null;
  }
}
