/* التقرير اليومي يشتقّ التصنيف من الطلبات ويطبّق التصحيحات، فلا يصبح ملفه
   صالحاً للتصدير إن فشل أحد المصدرين. سجل الجلسات الخام لا يعتمد عليهما. */
export const attendanceDerivedSourcesReady = ({ requestsReady, adjustmentsReady }) =>
  requestsReady && adjustmentsReady;

export function attendanceExportAvailable({ mode, requestsReady, adjustmentsReady }) {
  return mode === 'sessions'
    || (mode === 'daily' && attendanceDerivedSourcesReady({ requestsReady, adjustmentsReady }));
}
