/* ═══════════════════════════════════════════════════════════════════════════
   قائمة الموظف الشخصية — القراءة والكتابة

   ⚠️ كل قرار في todo.js النقيّة. هذا الملف يكتب ولا يقرّر.

   ⚠️ الوثيقة `users/{uid}/private/todos` — مجموعة فرعية تحت وثيقة الموظف.
   وقواعد Firestore **لا تنحدر إلى المجموعات الفرعية**، فقاعدة `sameDept()`
   التي تمنح المدير قراءة `users/{uid}` لا تصل هذه الوثيقة. هذا سبب وجودها
   هنا لا كحقل على وثيقة الموظف.

   ⚠️ ولا `isAdmin()` في قاعدتها عمداً: الوعد أن أحداً لا يقرأها، وأدمنٌ
   يقرأها يكسر الوعد كما يكسره المدير.

   ⚠️ قراءة واحدة لكل القائمة — تُقرأ في كل فتحة للرئيسية، ومجموعةٌ بوثيقة
   لكل عنصر تعني عشرين قراءة بدل واحدة على الخطة المجانية.
   ═══════════════════════════════════════════════════════════════════════════ */

import { db, doc, getDoc, setDoc, serverTimestamp } from './firebase.js';
import { getMe } from './state.js';
import { normalizeList } from './todo.js';

const myRef = () => doc(db, 'users', getMe().id, 'private', 'todos');

/* ⚠️ الوثيقة الغائبة ليست خطأً — هي الحالة الأولى لكل موظف جديد. */
export async function readTodos() {
  const s = await getDoc(myRef());
  return s.exists() ? normalizeList(s.data().items) : [];
}

/* ⚠️ `updatedAt` مطلوبة في القاعدة (`== request.time`): بلا طابع من السيرفر
   يستطيع جهازٌ متأخّر الساعة أن يكتب فوق أحدث نسخة بلا أن يظهر ذلك. */
export async function writeTodos(items) {
  const clean = normalizeList(items);
  await setDoc(myRef(), { items: clean, updatedAt: serverTimestamp() });
  return clean;
}

/* ⚠️ لا logAction هنا: سجل التدقيق للأفعال الإدارية — الرصيد والاعتماد
   والراتب. تسجيلُ أن موظفاً شطب تذكيراً شخصياً في سجلٍّ يقرأه الأدمن يُبطل
   خصوصية القائمة من الباب الخلفي. */
