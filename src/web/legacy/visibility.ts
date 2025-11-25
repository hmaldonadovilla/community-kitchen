import { WebQuestionDefinition } from '../../types';
import { shouldHideField } from '../rules/visibility';
import { getRowValue, getValue, toggleFieldVisibility } from './dom';

interface ApplyVisibilityOptions {
  definition: { questions: WebQuestionDefinition[] };
  formEl: HTMLFormElement;
  language: string;
}

export function applyVisibility(options: ApplyVisibilityOptions): void {
  const { definition, formEl } = options;

  definition.questions.forEach(q => {
    if (q.visibility) {
      const ctx = { getValue: (fieldId: string) => getValue(formEl, fieldId) };
      const shouldHide = shouldHideField(q.visibility, ctx, { linePrefix: q.type === 'LINE_ITEM_GROUP' ? q.id : undefined });
      const holder = formEl.querySelector<HTMLElement>('[data-qid="' + q.id + '"]');
      toggleFieldVisibility(holder, shouldHide);
    }

    if (q.type === 'LINE_ITEM_GROUP') {
      const container = formEl.querySelector<HTMLElement>('[data-line-item="' + q.id + '"]');
      if (!container) return;
      const rows = Array.from(container.querySelectorAll<HTMLElement>('.line-item-row'));
      rows.forEach(row => {
        const rowCtx = {
          getValue: (fieldId: string) => getValue(formEl, fieldId),
          getLineValue: (_rowId: string, fieldId: string) => getRowValue(row, fieldId)
        };
        (q.lineItemConfig?.fields || []).forEach(field => {
          if (!field.visibility) return;
          const hide = shouldHideField(field.visibility, rowCtx, { rowId: row.dataset.rowId, linePrefix: q.id });
          const cell =
            row.querySelector<HTMLElement>('[data-field-id="' + field.id + '"][data-group-id="' + q.id + '"]') ||
            row.querySelector<HTMLElement>('[name="' + q.id + '__' + field.id + '"]')?.closest('div');
          toggleFieldVisibility(cell || row, hide);
        });
      });
    }
  });
}
