/* ═══════════════════════════════════════════════════════════════════════════
   يكشف الأسماء المستعمَلة في وحدة دون أن تكون مستورَدة أو معرَّفة فيها.

   لماذا هذا الفحص موجود: الدمج بين فرعين أنتج ثلاث حالات من هذا النوع دفعة
   واحدة (ymd و openModal و chainRoleAr). ولا شيء من أدوات الفحص الأخرى يراها:
   الملفات تُحلَّل نحوياً بلا خطأ، وكل الاستيرادات تشير لصادرات حقيقية، ولا
   دورات استيراد. الانفجار يحدث وقت التشغيل فقط — وفي حالة ymd كان داخل نبضة
   الساعة، أي فوراً في رئيسية كل موظف.

   ⚠️ نسخة أولى من هذا الفحص بحثت عن «اسم متبوع بقوس» فقط، ففاتها chainRoleAr
   لأنها تُمرَّر كمرجع: chain.map(chainRoleAr). هذه النسخة تفحص كل إشارة لاسم،
   لا النداءات وحدها.

       node test/undefined-refs.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GLOBALS = new Set((
  'window document navigator location console Math JSON Object Array String Number Boolean Symbol ' +
  'BigInt Date Promise Set Map WeakMap WeakSet RegExp Error TypeError RangeError SyntaxError ' +
  'URL URLSearchParams Intl crypto localStorage sessionStorage indexedDB ' +
  'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame ' +
  'atob btoa isNaN isFinite parseInt parseFloat encodeURIComponent decodeURIComponent encodeURI decodeURI ' +
  'TextEncoder TextDecoder Uint8Array Uint16Array Uint32Array Int8Array Int32Array Float32Array Float64Array ' +
  'ArrayBuffer DataView PublicKeyCredential performance fetch FileReader Blob File Image FormData ' +
  'Headers Request Response AbortController structuredClone queueMicrotask Notification Audio ' +
  'IntersectionObserver MutationObserver ResizeObserver DOMParser XMLHttpRequest history screen ' +
  'alert confirm prompt getComputedStyle matchMedia CustomEvent Event MouseEvent KeyboardEvent Node ' +
  'HTMLElement Element globalThis undefined NaN Infinity arguments'
).split(' ').filter(Boolean));

const KEYWORDS = new Set((
  'if else for while do switch case default break continue return function class extends super this ' +
  'new delete typeof instanceof in of void throw try catch finally const let var import export from as ' +
  'async await yield static get set true false null debugger with'
).split(' '));

/* يزيل التعليقات والنصوص حتى لا تُحسب كلماتها أسماء */
function strip(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; out += '""'; continue;
    }
    if (c === '`') {                        /* قوالب: نُبقي ما داخل ${} فقط */
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1; i += 2; const s = i;
          while (i < n && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; if (depth) i++; }
          out += ' ' + src.slice(s, i) + ' '; i++; continue;
        }
        i++;
      }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function walk(d, o = []) {
  for (const f of fs.readdirSync(d)) {
    if (f === 'node_modules') continue;
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, o);
    else if (f.endsWith('.js')) o.push(p);
  }
  return o;
}

let bad = 0, scanned = 0;

for (const file of walk(path.join(ROOT, 'js'))) {
  scanned++;
  const raw = fs.readFileSync(file, 'utf8');
  const src = strip(raw);
  const declared = new Set();

  for (const m of raw.matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)?["'][^"']+["']/g)) {
    const clause = (m[1] || '').trim(); if (!clause) continue;
    const br = clause.match(/{([\s\S]*)}/);
    if (br) br[1].split(',').map((x) => x.trim()).filter(Boolean)
      .forEach((x) => { const p = x.split(/\s+as\s+/); declared.add((p[1] || p[0]).trim()); });
    const ns = clause.match(/\*\s+as\s+([\w$]+)/); if (ns) declared.add(ns[1]);
    const df = clause.replace(/{[\s\S]*}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, ' ').trim().split(/\s+/)[0];
    if (df && df !== '*') declared.add(df);
  }
  for (const m of src.matchAll(/(?:function|class)\s+([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g))
    m[1].split(',').map((x) => x.trim().split(':').pop().trim().replace(/=.*/, '').replace(/^\.\.\./, '').trim())
      .filter(Boolean).forEach((x) => declared.add(x));
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g))
    m[1].split(',').forEach((x) => {
      const t = x.trim().replace(/^\.\.\./, '');
      if (t.startsWith('{') || t.startsWith('[')) {
        t.replace(/[{}[\]]/g, '').split(',').map((y) => y.trim().split(':').pop().trim().replace(/=.*/, '').trim())
          .filter(Boolean).forEach((y) => declared.add(y));
      } else { const nn = t.split(/[=\s]/)[0]; if (nn) declared.add(nn); }
    });
  for (const m of src.matchAll(/(?:^|[^.\w$])([\w$]+)\s*=>/g)) declared.add(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:^|\s)(?:for)\s*\(\s*(?:const|let|var)?\s*([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/([\w$]+)\s*:/g)) declared.add(m[1]);   /* مفاتيح الكائنات وlabels */

  const missing = new Map();
  const lines = src.split('\n');
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)/g)) {
      const name = m[2];
      if (declared.has(name) || GLOBALS.has(name) || KEYWORDS.has(name)) continue;
      if (!missing.has(name)) missing.set(name, idx + 1);
    }
  });

  if (missing.size) {
    bad++;
    console.log('  \x1b[31m✗\x1b[0m ' + path.relative(ROOT, file));
    for (const [name, line] of missing) console.log(`      ${name}  (first used line ${line})`);
  }
}

console.log(bad
  ? `\n\x1b[31m${bad}\x1b[0m of ${scanned} modules reference something undefined`
  : `\n\x1b[32m✓\x1b[0m all ${scanned} modules: every name is imported or declared`);
process.exit(bad ? 1 : 0);
