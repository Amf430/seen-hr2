/* مصدر مطلوب لا يجوز تمثيل فشله بقائمة فارغة؛ القائمة الفارغة نتيجة صحيحة
   فقط إذا نجحت القراءة فعلاً. إبقاء الحالتين منفصلتين يمنع الشاشات الإدارية
   من عرض أصفار أو معاينات ناقصة على أنها حقيقة. */
export async function loadRequiredSource(load, read) {
  try {
    await load();
    return { status: 'ready', data: read(), error: null };
  } catch (error) {
    return { status: 'error', data: null, error };
  }
}
