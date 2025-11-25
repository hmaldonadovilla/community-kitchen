import { WebFormDefinition } from '../../types';
import { isEmptyLineItemRow, getRowValue } from './dom';

export function syncLineItemPayload(definition: WebFormDefinition, formEl: HTMLFormElement): void {
  definition.questions.forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    const container = formEl.querySelector<HTMLElement>('[data-line-item="' + q.id + '"]');
    const hidden = formEl.querySelector<HTMLInputElement>('[name="' + q.id + '_json"]');
    if (!container || !hidden) return;

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.line-item-row')).filter(
      r => !r.classList.contains('is-hidden-field') && !isEmptyLineItemRow(r)
    );
    const data = rows.map(row => {
      const result: Record<string, unknown> = {};
      (q.lineItemConfig?.fields || []).forEach(field => {
        const name = q.id + '__' + field.id;
        const inputs = row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name="' + name + '"]');
        if (!inputs || inputs.length === 0) return;
        if (inputs[0].type === 'checkbox') {
          const selected = Array.from(inputs)
            .filter(i => (i as HTMLInputElement).checked)
            .map(i => (i as HTMLInputElement).value);
          result[field.id] = selected.join(', ');
        } else {
          result[field.id] = (inputs[0] as HTMLInputElement | HTMLSelectElement).value;
        }
      });
      return result;
    });

    hidden.value = JSON.stringify(data);
  });
}

export function buildPayloadFromForm(formEl: HTMLFormElement): Promise<Record<string, unknown>> {
  const fd = new FormData(formEl);
  const payload: Record<string, unknown> = {};
  const fileReads: Promise<void>[] = [];

  const addValue = (key: string, val: unknown) => {
    if (payload[key] === undefined) {
      payload[key] = val;
    } else if (Array.isArray(payload[key])) {
      (payload[key] as unknown[]).push(val);
    } else {
      payload[key] = [payload[key], val];
    }
  };

  fd.forEach((val, key) => {
    if (val instanceof File) {
      if (!val || (!val.name && val.size === 0)) return;
      const reader = new FileReader();
      const p = new Promise<void>(resolve => {
        reader.onload = () => {
          addValue(key, {
            name: val.name || 'upload',
            data: reader.result,
            type: val.type || 'application/octet-stream'
          });
          resolve();
        };
        reader.onerror = () => resolve();
      });
      reader.readAsDataURL(val);
      fileReads.push(p);
    } else {
      addValue(key, val);
    }
  });

  return Promise.all(fileReads).then(() => payload);
}
