import { WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LangCode, ValidationError } from '../types';
import { checkRule, validateRules } from '../rules/validation';
import { matchesWhenClause } from '../rules/visibility';
import {
  getRowValue,
  getValue,
  isEmptyLineItemRow,
  isFieldHidden,
  findFieldElement
} from './dom';

interface ValidationResult {
  errors: ValidationError[];
}

function getLineItemRowCount(groupId: string, formEl: HTMLFormElement): number {
  const container = formEl.querySelector<HTMLElement>('[data-line-item="' + groupId + '"]');
  if (!container) return 0;
  return Array.from(container.querySelectorAll<HTMLElement>('.line-item-row')).filter(row => {
    return !row.classList.contains('is-hidden-field') && !isEmptyLineItemRow(row);
  }).length;
}

function fileInputMissing(name: string, formEl: HTMLFormElement): boolean {
  const el = formEl.querySelector<HTMLInputElement>('input[type="file"][name="' + name + '"]');
  if (!el) return false;
  if (isFieldHidden(name, formEl)) return false;
  return !(el.files && el.files.length > 0);
}

export function validateFormWithBundle(definition: WebFormDefinition, language: LangCode, formEl: HTMLFormElement): ValidationResult {
  const errors: ValidationError[] = [];

  // Required line-item groups with no rows
  const missingRequiredLineItem = definition.questions.find(
    q => q.type === 'LINE_ITEM_GROUP' && q.required && !isFieldHidden(q.id, formEl) && getLineItemRowCount(q.id, formEl) === 0
  );
  if (missingRequiredLineItem) {
    errors.push({
      fieldId: missingRequiredLineItem.id,
      message:
        language === 'FR'
          ? 'Ajoutez au moins une ligne.'
          : language === 'NL'
          ? 'Voeg minstens één regel toe.'
          : 'Please add at least one line.',
      scope: 'main'
    });
    return { errors };
  }

  // Required file uploads
  definition.questions
    .filter(q => q.type === 'FILE_UPLOAD' && q.required)
    .forEach(fq => {
      if (fileInputMissing(fq.id, formEl)) {
        errors.push({
          fieldId: fq.id,
          message:
            language === 'FR'
              ? 'Veuillez téléverser un fichier.'
              : language === 'NL'
              ? 'Upload een bestand.'
              : 'Please upload a file.',
          scope: 'main'
        });
      }
    });
  if (errors.length) return { errors };

  // Main question validation rules
  const mainRules = definition.questions.flatMap(q => (q.validationRules || []).map(rule => ({ rule, scope: 'main' as const })));
  const ctx = {
    language,
    getValue: (fieldId: string) => getValue(formEl, fieldId),
    isHidden: (fieldId: string) => isFieldHidden(fieldId, formEl)
  };
  errors.push(...validateRules(mainRules.map(r => r.rule), ctx));
  if (errors.length) return { errors };

  // Line-item validation rules
  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      const container = formEl.querySelector<HTMLElement>('[data-line-item="' + group.id + '"]');
      if (!container) return;
      const rows = Array.from(container.querySelectorAll<HTMLElement>('.line-item-row')).filter(
        r => !r.classList.contains('is-hidden-field') && !isEmptyLineItemRow(r)
      );
      (group.lineItemConfig?.fields || []).forEach(field => {
        (field.validationRules || []).forEach(rule => {
          rows.forEach(row => {
            if (!rule?.then?.fieldId) return;
            const thenName = group.id + '__' + rule.then.fieldId;
            const ctx = {
              getValue: (fieldId: string) => getValue(formEl, fieldId),
              getLineValue: (_rowId: string, fieldId: string) => getRowValue(row, fieldId)
            };
            const rowId = row.dataset.rowId || '';
            if (!matchesWhenClause(rule.when as any, ctx as any, { rowId, linePrefix: group.id })) return;
            if (isFieldHidden(rule.then.fieldId, formEl, row)) return;
            const targetVal = getRowValue(row, thenName);
            const msg = checkRule(targetVal, rule.then, language, rule.message);
            if (msg) {
              errors.push({
                fieldId: rule.then.fieldId,
                message: msg,
                scope: 'line',
                rowId: row.dataset.rowId
              });
            }
          });
        });
      });
    });

  if (errors.length && typeof console !== 'undefined' && console.warn) {
    console.warn('[validation] errors', errors);
  }
  return { errors };
}

export function resolveFieldElement(err: ValidationError, formEl: HTMLFormElement): HTMLElement | null {
  if (err.scope === 'line' && err.rowId) {
    const row = formEl.querySelector<HTMLElement>('[data-row-id="' + err.rowId + '"]');
    if (row) {
      return findFieldElement(err.fieldId, row, row);
    }
  }
  return findFieldElement(err.fieldId, formEl);
}
