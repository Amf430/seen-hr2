import { el, esc, uid, toast } from '../../lib/dom.js';
import { getSettings } from '../../lib/state.js';
import { saveSettings } from '../../lib/settings.js';
import { AR_DAYS, ymd } from '../../lib/dates.js';
import { card, empty, tableWrap, button } from '../../lib/ui.js';

export function render(view) {
  const S = getSettings();

  /* ── الورديات الأسبوعية ── */
  const shCard = card('🕗 شفتات الدوام الأسبوعية',
    'لكل يوم حدّد نوع الوردية ووقت البداية والنهاية. الأقسام تقدر تتجاوزها بورديات خاصة.');
  const shifts = S.shifts || {};
  const wrap = tableWrap(`
    <table>
      <thead><tr><th>اليوم</th><th>النوع</th><th>من</th><th>إلى</th></tr></thead>
      <tbody>${AR_DAYS.map((dn, i) => {
        const s = shifts[i] || { type: 'off', start: '', end: '' };
        return `<tr>
          <td><b>${dn}</b></td>
          <td><select data-d="${i}" class="shType inline-input">
            <option value="morning"${s.type === 'morning' ? ' selected' : ''}>صباحي</option>
            <option value="evening"${s.type === 'evening' ? ' selected' : ''}>مسائي</option>
            <option value="off"${s.type === 'off' ? ' selected' : ''}>راحة</option></select></td>
          <td><input type="time" data-d="${i}" class="shStart inline-input" value="${esc(s.start || '')}"></td>
          <td><input type="time" data-d="${i}" class="shEnd inline-input" value="${esc(s.end || '')}"></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`);
  shCard.appendChild(wrap);
  shCard.appendChild(button('حفظ الشفتات', 'btn sm mt-3', async () => {
    const ns = {};
    AR_DAYS.forEach((_, i) => {
      const type = wrap.querySelector(`.shType[data-d="${i}"]`).value;
      const start = wrap.querySelector(`.shStart[data-d="${i}"]`).value;
      const end = wrap.querySelector(`.shEnd[data-d="${i}"]`).value;
      ns[i] = { type, start: type === 'off' ? '' : start, end: type === 'off' ? '' : end };
    });
    S.shifts = ns;
    await saveSettings();
    toast('تم حفظ الشفتات', 'ok');
  }));
  view.appendChild(shCard);

  /* ── العطل الرسمية والدوام الخاص ── */
  const exCard = card('📅 العطل الرسمية ودوام خاص بتاريخ محدّد',
    'تُطبَّق على جميع الموظفين وتتقدّم على ورديات القسم والشركة. «راحة» تجعل اليوم عطلة رسمية فلا يُحسب غياباً ولا يُخصم.');
  const exHost = el('div', '');
  exCard.appendChild(exHost);

  const add = el('div', 'add-inline');
  add.innerHTML = `
    <div class="field"><label for="nxFrom">من تاريخ</label><input id="nxFrom" type="date"></div>
    <div class="field"><label for="nxTo">إلى تاريخ (اختياري)</label><input id="nxTo" type="date"></div>
    <div class="field"><label for="nxType">النوع</label>
      <select id="nxType">
        <option value="off">راحة / عطلة رسمية</option>
        <option value="hours">دوام خاص</option>
      </select></div>
    <div class="field"><label for="nxStart">من الساعة</label><input id="nxStart" type="time" disabled></div>
    <div class="field"><label for="nxEnd">إلى الساعة</label><input id="nxEnd" type="time" disabled></div>
    <div class="field grow"><label for="nxLabel">الوصف</label>
      <input id="nxLabel" placeholder="مثال: عيد الفطر / دوام رمضان"></div>`;
  const addBtn = button('إضافة', 'btn sm');
  add.appendChild(addBtn);
  exCard.appendChild(add);
  view.appendChild(exCard);

  const nxType = add.querySelector('#nxType');
  nxType.onchange = () => {
    const h = nxType.value === 'hours';
    add.querySelector('#nxStart').disabled = !h;
    add.querySelector('#nxEnd').disabled = !h;
  };

  function drawEx() {
    const list = [...(S.dateExceptions || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    exHost.innerHTML = '';
    if (!list.length) {
      exHost.appendChild(empty('لا استثناءات — أضف العطل الرسمية حتى لا تُحسب غياباً على الموظفين.', '📅'));
      return;
    }
    const w = tableWrap(`
      <table class="tight">
        <thead><tr><th>التاريخ</th><th>اليوم</th><th>النوع</th><th>الدوام</th><th>الوصف</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = w.querySelector('tbody');
    list.forEach((x) => {
      const d = new Date(x.date + 'T00:00:00');
      const tr = el('tr', '');
      tr.innerHTML = `
        <td class="num">${esc(x.date)}</td>
        <td>${isNaN(d) ? '' : AR_DAYS[d.getDay()]}</td>
        <td><span class="pill ${x.type === 'off' ? 'holiday' : 'pending'}">${x.type === 'off' ? 'عطلة' : 'دوام خاص'}</span></td>
        <td class="num">${x.type === 'off' ? '—' : esc((x.start || '') + '–' + (x.end || ''))}</td>
        <td>${esc(x.label || '')}</td>`;
      const td = el('td', '');
      td.appendChild(button('حذف', 'btn sm danger', async () => {
        S.dateExceptions = (S.dateExceptions || []).filter((z) => z.id !== x.id);
        await saveSettings(); drawEx(); toast('حُذف');
      }));
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    exHost.appendChild(w);
  }

  addBtn.onclick = async () => {
    const from = add.querySelector('#nxFrom').value;
    const to = add.querySelector('#nxTo').value || from;
    const type = nxType.value;
    const st = add.querySelector('#nxStart').value, en = add.querySelector('#nxEnd').value;
    const label = add.querySelector('#nxLabel').value.trim();

    if (!from) { toast('اختر التاريخ', 'err'); return; }
    if (to < from) { toast('تاريخ النهاية قبل البداية', 'err'); return; }
    if (type === 'hours' && (!st || !en)) { toast('أدخل ساعات الدوام الخاص', 'err'); return; }

    S.dateExceptions = S.dateExceptions || [];
    let n = 0;
    for (let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      const ds = ymd(d);
      /* استبدال أي استثناء لنفس اليوم */
      S.dateExceptions = S.dateExceptions.filter((z) => z.date !== ds);
      S.dateExceptions.push({
        id: uid(), date: ds, type, kind: 'morning',
        start: type === 'hours' ? st : '', end: type === 'hours' ? en : '', label
      });
      n++;
    }
    await saveSettings();
    drawEx();
    add.querySelector('#nxLabel').value = '';
    toast(`أُضيف ${n} يوم`, 'ok');
  };

  drawEx();
}
