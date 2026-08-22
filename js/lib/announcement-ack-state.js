/* حالة إقرار الإعلان في الواجهة — منطق نقي بلا Firebase.

   ⚠️ الإقرار إنشاء-فقط. لذلك فشل قراءة الوثيقة لا يعني «لم يُقرّ»: إظهار
   الزر حينها قد يحاول إنشاء الوثيقة نفسها ثانيةً ويعطي الموظف خطأً مضللاً. */

export const ACK_STATE = Object.freeze({
  ACKNOWLEDGED: 'acknowledged',
  PENDING: 'pending',
  ERROR: 'error'
});

export async function readAckState(readAck) {
  try {
    return (await readAck()) ? ACK_STATE.ACKNOWLEDGED : ACK_STATE.PENDING;
  } catch (e) {
    return ACK_STATE.ERROR;
  }
}

export async function createAckIfPending(state, createAck) {
  if (state !== ACK_STATE.PENDING) return { state, wrote: false };
  await createAck();
  return { state: ACK_STATE.ACKNOWLEDGED, wrote: true };
}
