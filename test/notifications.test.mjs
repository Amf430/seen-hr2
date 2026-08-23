/* ═══════════════════════════════════════════════════════════════════════════
   اختبار مركز الإشعارات — بلا محاكي ولا شبكة.

   notifications.js تقرأ من state.js وتكتب «المقروء» في localStorage، فيُبنى
   هنا شيم صغير لـ localStorage قبل استيرادها.

   ⚠️ أهمّ ما يُختبر هنا ليس أن الإشعار يظهر، بل **أن المعرّف مستقرّ**:
     • معرّف القرار يحمل الحالة، فلو رُفض طلب ثم اعتُمد وصل إشعار جديد
     • معرّف العقد يحمل «شريحة» لا عدد الأيام، وإلا عاد غير مقروء كل صباح
   وهذان بالضبط ما ينكسر بصمت ولا يلاحظه أحد إلا بعد شهر.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── شيم localStorage ── */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

const state = await import('../js/lib/state.js');
const nf    = await import('../js/lib/notifications.js');

let pass = 0, fail = 0;
const t = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31m✗\x1b[0m ${label}\n      توقّع ${e}\n      وجد  ${a}`); fail++; }
};

const p2 = (n) => String(n).padStart(2, '0');
const dRel = (n) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const titles = (list) => list.map((n) => n.title);
const ids    = (list) => list.map((n) => n.id);

const reset = (me, reqs) => { store.clear(); state.setMe(me); state.setRequests(reqs); };
const EMP = { id: 'empU', name: 'موظف', role: 'employee', department: 'المبيعات', status: 'active' };
const REQ = (o) => ({ id: 'r1', type: 'leave', employeeUid: 'empU', employeeName: 'موظف',
                      department: 'المبيعات', status: 'pending', ...o });

console.log('\n\x1b[1m═══ ١ · قرار على طلبي ═══\x1b[0m');
reset(EMP, [REQ({ status: 'approved', reviewedBy: 'الأدمن' })]);
t('الاعتماد يصل إشعاراً',   titles(nf.buildNotifications()), ['اعتُمد طلب إجازة']);
t('ويحمل من اعتمده',        nf.buildNotifications()[0].body, 'بواسطة الأدمن');

reset(EMP, [REQ({ status: 'rejected', reviewedBy: 'الأدمن', rejectReason: 'الرصيد لا يكفي' })]);
t('الرفض يصل بسببه', nf.buildNotifications()[0].body, 'بواسطة الأدمن · السبب: الرصيد لا يكفي');

reset(EMP, [REQ({ status: 'pending' })]);
t('المعلّق لا يُشعر صاحبه', nf.buildNotifications(), []);
reset(EMP, [REQ({ status: 'cancelled' })]);
t('الملغى لا يُشعر',        nf.buildNotifications(), []);

reset(EMP, [REQ({ id: 'r9', employeeUid: 'other', status: 'approved' })]);
t('طلب غيري لا يصلني', nf.buildNotifications(), []);

console.log('\n\x1b[1m═══ ٢ · طلب ينتظر موافقتي ═══\x1b[0m');
const MGR = { id: 'mgrU', name: 'مدير', role: 'manager', department: 'المبيعات', status: 'active' };
reset(MGR, [REQ({ id: 'r2', type: 'permission', status: 'pending' })]);
t('المدير يُشعر بطلب قسمه', titles(nf.buildNotifications()), ['طلب استئذان ينتظر موافقتك']);

reset(MGR, [REQ({ id: 'r3', department: 'الحسابات', status: 'pending' })]);
t('ولا يُشعر بطلب قسم آخر', nf.buildNotifications(), []);

reset(MGR, [REQ({ id: 'r4', employeeUid: 'mgrU', employeeName: 'مدير', status: 'pending' })]);
t('ولا بطلبه هو',           nf.buildNotifications(), []);

reset(EMP, [REQ({ id: 'r5', employeeUid: 'other', employeeName: 'زميل', status: 'pending' })]);
t('الموظف لا يُشعر بطلبات غيره', nf.buildNotifications(), []);

console.log('\n\x1b[1m═══ ٣ · مستنداتي وعقدي ═══\x1b[0m');
reset({ ...EMP, documents: [{ id: 'd1', kind: 'iqama', expiresOn: dRel(-3) }] }, []);
t('إقامة منتهية', titles(nf.buildNotifications()), ['الإقامة منتهٍ منذ 3 يوم']);

reset({ ...EMP, documents: [{ id: 'd1', kind: 'iqama', expiresOn: dRel(400) }] }, []);
t('إقامة سارية لا تُشعر', nf.buildNotifications(), []);

reset({ ...EMP, contractEnd: dRel(10) }, []);
t('عقد يقارب الانتهاء', titles(nf.buildNotifications()), ['عقدك ينتهي خلال 10 يوم']);
reset({ ...EMP, contractEnd: dRel(300) }, []);
t('عقد بعيد لا يُشعر',  nf.buildNotifications(), []);

console.log('\n\x1b[1m═══ استقرار المعرّف — أهمّ ما هنا ═══\x1b[0m');
/* لو حمل معرّف العقد عدد الأيام لعاد الإشعار غير مقروء كل صباح */
reset({ ...EMP, contractEnd: dRel(20) }, []);
const id20 = ids(nf.buildNotifications())[0];
reset({ ...EMP, contractEnd: dRel(18) }, []);
const id18 = ids(nf.buildNotifications())[0];
t('العقد: يومان مختلفان في نفس الشريحة = نفس المعرّف', id20, id18);

reset({ ...EMP, contractEnd: dRel(20) }, []);
const idFar = ids(nf.buildNotifications())[0];
reset({ ...EMP, contractEnd: dRel(5) }, []);
t('لكن عبور الشريحة يعطي معرّفاً جديداً', ids(nf.buildNotifications())[0] !== idFar, true);

/* لو حمل معرّف القرار رقم الطلب وحده لابتلع الاعتماد بعد الرفض */
reset(EMP, [REQ({ status: 'rejected', reviewedBy: 'أ' })]);
const idRej = ids(nf.buildNotifications())[0];
reset(EMP, [REQ({ status: 'approved', reviewedBy: 'أ' })]);
t('القرار: الرفض والاعتماد معرّفان مختلفان', ids(nf.buildNotifications())[0] !== idRej, true);

console.log('\n\x1b[1m═══ المقروء ═══\x1b[0m');
reset(EMP, [REQ({ id: 'a', status: 'approved' }), REQ({ id: 'b', status: 'rejected' })]);
t('كلاهما غير مقروء بدايةً', nf.unreadCount(), 2);

nf.markSeen(nf.buildNotifications()[0].id);
t('تعليم واحد ينقص العدّاد', nf.unreadCount(), 1);
t('والمقروء مُعلَّم في القائمة', nf.notifications().filter((n) => n.read).length, 1);

nf.markAllSeen();
t('تعليم الكل يصفّر العدّاد', nf.unreadCount(), 0);

/* المقروء لكل مستخدم على حدة — جهاز مشترك لا يخلط إشعارات زميلين.
   ⚠️ بلا مسح المخزن: بقاء ما قرأه الأول هو بالضبط ما نختبره. وتُبدَّل ملكية
   الطلبات مع المستخدم، وإلا صار الصفرُ الناتجُ «لا طلبات له» لا «عزلٌ صحيح». */
state.setMe({ ...EMP, id: 'otherU' });
state.setRequests([REQ({ id: 'a', employeeUid: 'otherU', status: 'approved' }),
                   REQ({ id: 'b', employeeUid: 'otherU', status: 'rejected' })]);
t('زميل على نفس الجهاز يبدأ بغير مقروء', nf.unreadCount(), 2);

/* والعودة للأول لا تُفقده ما قرأه */
state.setMe(EMP);
state.setRequests([REQ({ id: 'a', status: 'approved' }), REQ({ id: 'b', status: 'rejected' })]);
t('والأول يبقى مقروءاً عند عودته', nf.unreadCount(), 0);

console.log('\n\x1b[1m═══ حراسة ═══\x1b[0m');
state.setMe(null);
t('بلا مستخدم لا شيء', nf.buildNotifications(), []);

reset({ ...EMP, documents: 'ليست مصفوفة' }, []);
t('مستندات بنوع خاطئ لا تُسقط النظام', nf.buildNotifications(), []);

reset({ ...EMP, contractEnd: 'ليس تاريخاً' }, []);
t('تاريخ عقد خاطئ لا يُسقط النظام', nf.buildNotifications(), []);

console.log(`\n\x1b[1m═══ النتيجة: ${pass} ناجح، ${fail} فاشل ═══\x1b[0m`);
process.exit(fail ? 1 : 0);
