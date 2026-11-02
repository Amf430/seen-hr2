/* غياب وثيقة حالة الجسر يختلف عن تعذّر قراءتها: الأول يعني أن الجسر لم
   يرسل نبضاً بعد، والثاني لا يثبت شيئاً عن حالة الجسر نفسه. */
export async function readBridgeStatus(read) {
  try {
    const data = await read();
    return { status: data ? 'ready' : 'missing', data: data || null, error: null };
  } catch (error) {
    return { status: 'error', data: null, error };
  }
}
