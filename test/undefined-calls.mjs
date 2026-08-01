import fs from 'fs';
import path from 'path';

const ROOT = '/home/akera/Coding/alla/seen-hr2';

function walk(d, o = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, o);
    else if (f.endsWith('.js')) o.push(p);
  }
  return o;
}

const GLOBALS = new Set((
  'window document navigator location console Math JSON Date Object Array String Number Boolean ' +
  'Promise Set Map WeakMap RegExp Error TypeError URL URLSearchParams Intl crypto localStorage ' +
  'sessionStorage setTimeout setInterval clearTimeout clearInterval atob btoa isNaN isFinite ' +
  'parseInt parseFloat encodeURIComponent decodeURIComponent TextEncoder TextDecoder Uint8Array ' +
  'Uint32Array Int32Array Float64Array ArrayBuffer PublicKeyCredential performance fetch FileReader ' +
  'Blob File Image alert confirm prompt requestAnimationFrame cancelAnimationFrame matchMedia ' +
  'getComputedStyle CustomEvent Event MouseEvent KeyboardEvent AbortController structuredClone ' +
  'queueMicrotask Notification Audio FormData Headers Request Response IntersectionObserver ' +
  'MutationObserver ResizeObserver DOMParser XMLHttpRequest history screen'
).split(' '));

const KEYWORDS = /^(if|for|while|switch|catch|return|typeof|new|function|await|import|export|else|do|throw|delete|void|in|of|case|yield|instanceof|super|class|try|finally|const|let|var)$/;

let problems = 0;

for (const file of walk(path.join(ROOT, 'js'))) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const declared = new Set();

  // imports
  for (const m of raw.matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)?["'][^"']+["']/g)) {
    const clause = (m[1] || '').trim();
    if (!clause) continue;
    const braces = clause.match(/{([\s\S]*)}/);
    if (braces) {
      braces[1].split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => {
        const parts = x.split(/\s+as\s+/);
        declared.add((parts[1] || parts[0]).trim());
      });
    }
    const ns = clause.match(/\*\s+as\s+([\w$]+)/);
    if (ns) declared.add(ns[1]);
    const dflt = clause.replace(/{[\s\S]*}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, ' ').trim().split(/\s+/)[0];
    if (dflt && dflt !== '*') declared.add(dflt);
  }
  // declarations
  for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:export\s+)?class\s+([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g))
    m[1].split(',').map((x) => x.trim().split(':').pop().trim().replace(/=.*/, '').replace(/\./g, '').trim())
      .filter(Boolean).forEach((x) => declared.add(x));
  // params
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|{)/g))
    m[1].split(',').forEach((x) => {
      const n = x.trim().split(/[=:\s]/)[0].replace(/[{}[\].]/g, '');
      if (n) declared.add(n);
    });
  for (const m of src.matchAll(/(?:^|[^.\w$])([\w$]+)\s*=>/g)) declared.add(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([\w$]+)/g)) declared.add(m[1]);

  // bare identifiers being CALLED
  const bad = new Set();
  for (const m of src.matchAll(/(?:^|[^.\w$'"`])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const n = m[1];
    if (declared.has(n) || GLOBALS.has(n) || KEYWORDS.test(n)) continue;
    bad.add(n);
  }
  if (bad.size) {
    problems++;
    console.log('  ✗ ' + path.relative(ROOT, file) + '  →  ' + [...bad].join(', '));
  }
}
console.log(problems ? `\n${problems} module(s) call something they never import` : '  ✓ no undefined calls');
