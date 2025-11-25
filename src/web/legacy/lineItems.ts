import { WebQuestionDefinition } from '../../types';
import { applyFilters } from './filters';
import { applyVisibility } from './visibility';
import { computeTotals } from '../lineItems';
import { isEmptyLineItemRow } from './dom';

export function addLineItemRowFromBundle(
  group: WebQuestionDefinition,
  formEl: HTMLFormElement,
  presetValues: Record<string, string | number> = {}
): void {
  if (group.type !== 'LINE_ITEM_GROUP') return;
  const container = formEl.querySelector<HTMLElement>('[data-line-item="' + group.id + '"]');
  if (!container) return;
  const rowsWrapper = container.querySelector<HTMLElement>('.line-item-rows') || container;
  const row = document.createElement('div');
  row.className = 'line-item-row';
  row.dataset.rowId = group.id + '_' + Math.random().toString(16).slice(2);
  row.dataset.groupId = group.id;

  (group.lineItemConfig?.fields || []).forEach(field => {
    const cell = document.createElement('div');
    cell.dataset.fieldId = field.id;
    cell.dataset.groupId = group.id;
    const lbl = document.createElement('label');
    lbl.dataset.enLabel = field.labelEn || '';
    lbl.dataset.frLabel = field.labelFr || '';
    lbl.dataset.nlLabel = field.labelNl || '';
    lbl.textContent = '';
    if (field.required) {
      const star = document.createElement('span');
      star.className = 'required-star';
      star.textContent = '*';
      lbl.appendChild(star);
    }
    const labelText = document.createElement('span');
    labelText.dataset.labelText = 'true';
    labelText.textContent = field.labelEn || '';
    lbl.appendChild(labelText);
    cell.appendChild(lbl);

    let input: HTMLElement;
    if (field.type === 'CHOICE') {
      const select = document.createElement('select');
      select.dataset.fieldId = field.id;
      select.dataset.labelEn = (field.labelEn || '').toLowerCase();
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '';
      select.appendChild(emptyOpt);
      (field.options || []).forEach((opt, idx) => {
        const option = document.createElement('option');
        option.value = opt;
        option.dataset.enLabel = opt;
        option.dataset.frLabel = field.optionsFr?.[idx] || opt;
        option.dataset.nlLabel = field.optionsNl?.[idx] || opt;
        option.textContent = opt;
        select.appendChild(option);
      });
      select.dataset.originalOptions = JSON.stringify({ en: field.options || [], fr: field.optionsFr || [], nl: field.optionsNl || [] });
      if (field.optionFilter) select.dataset.dependsOn = field.optionFilter.dependsOn as any;
      input = select;
    } else if (field.type === 'CHECKBOX') {
      const wrap = document.createElement('div');
      wrap.dataset.fieldName = group.id + '__' + field.id;
      wrap.dataset.fieldId = field.id;
      wrap.dataset.labelEn = (field.labelEn || '').toLowerCase();
      (field.options || []).forEach((opt, idx) => {
        const checkbox = document.createElement('label');
        checkbox.className = 'inline';
        checkbox.style.fontWeight = '400';
        checkbox.dataset.enLabel = opt;
        checkbox.dataset.frLabel = field.optionsFr?.[idx] || opt;
        checkbox.dataset.nlLabel = field.optionsNl?.[idx] || opt;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt;
        cb.name = group.id + '__' + field.id;
        const span = document.createElement('span');
        span.className = 'option-label';
        span.textContent = opt;
        checkbox.appendChild(cb);
        checkbox.appendChild(span);
        wrap.appendChild(checkbox);
      });
      wrap.dataset.originalOptions = JSON.stringify({ en: field.options || [], fr: field.optionsFr || [], nl: field.optionsNl || [] });
      if (field.optionFilter) wrap.dataset.dependsOn = field.optionFilter.dependsOn as any;
      input = wrap;
    } else {
      const inp = document.createElement('input');
      inp.type = field.type === 'NUMBER' ? 'number' : 'text';
      if (field.type === 'NUMBER') inp.step = 'any';
      inp.name = group.id + '__' + field.id;
      input = inp;
    }

    if (input && (input as HTMLInputElement | HTMLSelectElement).tagName !== 'DIV') {
      const cast = input as HTMLInputElement | HTMLSelectElement;
      cast.required = !!field.required;
      cast.name = group.id + '__' + field.id;
      cast.dataset.fieldId = field.id;
      cast.dataset.labelEn = (field.labelEn || '').toLowerCase();
      if (presetValues[field.id] !== undefined && 'value' in cast) {
        (cast as any).value = presetValues[field.id];
      }
    }

    cell.appendChild(input);
    row.appendChild(cell);
  });

  const actions = document.createElement('div');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'secondary';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    if (row.parentElement) row.parentElement.removeChild(row);
    computeLineItemTotals(group, formEl);
  });
  actions.appendChild(removeBtn);
  row.appendChild(actions);

  row.addEventListener('input', () => computeLineItemTotals(group, formEl));
  row.addEventListener('change', () => computeLineItemTotals(group, formEl));

  rowsWrapper.appendChild(row);
  applyFilters({ definition: { questions: [group] } as any, language: 'EN', formEl, scopeRow: row });
  applyVisibility({ definition: { questions: [group] } as any, language: 'EN', formEl });
  computeLineItemTotals(group, formEl);
}

export function computeLineItemTotals(group: WebQuestionDefinition, formEl: HTMLFormElement): void {
  if (group.type !== 'LINE_ITEM_GROUP' || !group.lineItemConfig?.totals?.length) return;
  const container = formEl.querySelector<HTMLElement>('[data-line-item="' + group.id + '"]');
  if (!container) return;
  const holder = container.querySelector<HTMLElement>('[data-line-totals]');
  if (!holder) return;
  const rows = Array.from(container.querySelectorAll<HTMLElement>('.line-item-row')).filter(
    r => !r.classList.contains('is-hidden-field') && !isEmptyLineItemRow(r)
  );
  holder.innerHTML = '';
  const rowData = rows.map(row => {
    const values: Record<string, any> = {};
    (group.lineItemConfig?.fields || []).forEach(field => {
      const name = group.id + '__' + field.id;
      const val = row.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + name + '"]')?.value || '';
      values[field.id] = val;
    });
    return { id: row.dataset.rowId || '', values };
  });
  const totals = computeTotals({ config: group.lineItemConfig, rows: rowData }, 'EN');
  totals.forEach(t => {
    const pill = document.createElement('div');
    pill.className = 'line-item-total-pill';
    pill.textContent = t.label ? t.label + ': ' + t.value : String(t.value);
    holder.appendChild(pill);
  });
}
