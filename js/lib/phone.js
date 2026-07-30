/* ═══════════════════════════════════════════════════════════════════════════
   أرقام الجوال ← بريد دخول داخلي

   Firebase يحتاج بريداً للدخول، والموظفون يعرفون أرقام جوالهم فقط. نحوّل
   الرقم لبريد داخلي وهمي فيبقى النظام مجانياً بالكامل بلا رسائل SMS.
   ═══════════════════════════════════════════════════════════════════════════ */

import { LOGIN_EMAIL_DOMAIN } from '../config/firebase.config.js';

/* توحيد صيغة الرقم السعودي: 00966 / +966 / 966 / 5xxxxxxxx ← 05xxxxxxxx */
export function normPhone(v) {
  let d = (v || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = '0' + d;
  return d;
}

/* لو أُدخل بريد حقيقي (فيه @) — مثل بريد المدير — يُستخدم كما هو */
export function toLoginEmail(input) {
  const v = (input || '').trim();
  if (v.includes('@')) return v.toLowerCase();
  return normPhone(v) + LOGIN_EMAIL_DOMAIN;
}

/* تحقّق مبدئي قبل إنشاء الحساب */
export const isValidSaudiMobile = (v) => /^05\d{8}$/.test(normPhone(v));
