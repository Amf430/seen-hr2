/* حالة أدوات محادثة الموارد البشرية — منطق نقي بلا DOM أو Firebase.

   ⚠️ فشل قراءة السجل لا يثبت أن الكتابة آمنة أو أن المستخدم رأى السياق
   السابق؛ لذلك لا تظهر أي أداة كتابة إلا بعد اكتمال القراءة بنجاح. */

export function hrThreadUiState(loadState, { mayReply = false, mayFinish = false } = {}) {
  const ready = loadState === 'ready';
  return {
    showComposer: ready && mayReply,
    showSend: ready && mayReply,
    showFinish: ready && mayFinish,
    showError: loadState === 'error',
    showClose: true
  };
}
