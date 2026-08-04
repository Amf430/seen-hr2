/* فحص واحد فقط: اسم يُستعمل ولم يُستورَد ولم يُعرَّف.

   ⚠️ هذا هو الفحص الذي كان ناقصاً. الدمج بين الفرعين أنتج أربع حالات من هذا
   النوع (ymd ×3، openModal، chainRoleAr ×2، showMoney) — وكلها مرّت من كل ما
   كنا نفحصه: الملفات تُحلَّل نحوياً بلا خطأ، وكل استيراد يشير لصادرة حقيقية،
   ولا دورات استيراد. الانفجار وقت التشغيل وحده: ymd داخل نبضة الساعة فانكسرت
   رئيسية كل موظف، و showMoney عند فتح بروفايل موظف بلا راتب.

       npx eslint js

   لا قواعد أسلوب هنا عمداً — الهدف كشف الأعطال لا التنسيق. */
export default [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
        console: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', requestAnimationFrame: 'readonly', crypto: 'readonly',
        fetch: 'readonly', atob: 'readonly', btoa: 'readonly', alert: 'readonly',
        confirm: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
        Notification: 'readonly', FileReader: 'readonly', Blob: 'readonly', File: 'readonly',
        Image: 'readonly', FormData: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        AbortController: 'readonly', performance: 'readonly', history: 'readonly',
        matchMedia: 'readonly', getComputedStyle: 'readonly', structuredClone: 'readonly',
        PublicKeyCredential: 'readonly', IntersectionObserver: 'readonly',
        MutationObserver: 'readonly', ResizeObserver: 'readonly',
        /* SheetJS سكربت عادي لا وحدة — يُستعمل من window.XLSX */
        XLSX: 'readonly'
      }
    },
    rules: { 'no-undef': 'error' }
  }
];
