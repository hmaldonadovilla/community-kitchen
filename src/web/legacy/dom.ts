import { WebQuestionDefinition } from '../../types';
import { FieldValue } from '../types';

export function getValue(formEl: HTMLElement | Document, name: string): FieldValue {
  const els = formEl.querySelectorAll<HTMLElement>('[name="' + name + '"]');
  if (!els || els.length === 0) return '';
  const el = els[0];
  if (el instanceof HTMLSelectElement) return el.value;
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') {
      return Array.from(els).filter((e): e is HTMLInputElement => e instanceof HTMLInputElement && e.checked).map(e => e.value);
    }
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement) return el.value;
  return '';
}

export function getRowValue(row: HTMLElement, name: string): FieldValue {
  let els = row.querySelectorAll<HTMLElement>('[name="' + name + '"]');
  if (!els || els.length === 0) {
    const wrapper = row.querySelector<HTMLElement>('[data-field-name="' + name + '"]');
    if (wrapper) {
      els = wrapper.querySelectorAll<HTMLElement>('input');
    }
  }
  if (!els || els.length === 0) return '';
  const el = els[0];
  if (el instanceof HTMLSelectElement) return el.value;
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') {
      return Array.from(els).filter((e): e is HTMLInputElement => e instanceof HTMLInputElement && e.checked).map(e => e.value);
    }
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement) return el.value;
  return '';
}

export function toggleFieldVisibility(holder: HTMLElement | null, shouldHide: boolean): void {
  if (!holder) return;
  if (shouldHide) {
    holder.classList.add('is-hidden-field');
    const inputs = holder.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
    inputs.forEach(input => {
      const data = (input as any).dataset || {};
      if (data.originalRequired === undefined) data.originalRequired = input.required ? 'true' : 'false';
      input.required = false;
      if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) {
        input.checked = false;
      } else {
        try { input.value = ''; } catch (_) { /* ignore */ }
      }
    });
    const err = holder.querySelector<HTMLElement>('.field-error');
    if (err) err.remove();
  } else {
    holder.classList.remove('is-hidden-field');
    const inputs = holder.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
    inputs.forEach(input => {
      const data = (input as any).dataset || {};
      if (data.originalRequired === 'true') input.required = true;
    });
  }
}

export function findLineItemRows(groupId: string, root: Document | HTMLElement): HTMLElement[] {
  const container = root.querySelector<HTMLElement>('[data-line-item="' + groupId + '"]');
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('.line-item-row'));
}

export function findQuestionHolder(questionId: string, root: Document | HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-qid="' + questionId + '"]');
}

export function getOptionSet(q: WebQuestionDefinition): { en: string[]; fr: string[]; nl: string[] } {
  return q.options || { en: [], fr: [], nl: [] };
}

export function findFieldElement(fieldId: string, formEl: HTMLElement | Document, scope?: HTMLElement | null): HTMLElement | null {
  const ctx = scope || formEl;
  return (
    ctx.querySelector<HTMLElement>('[data-field-id="' + fieldId + '"]') ||
    ctx.querySelector<HTMLElement>('[name="' + fieldId + '"]') ||
    ctx.querySelector<HTMLElement>('[name$="__' + fieldId + '"]') ||
    ctx.querySelector<HTMLElement>('[data-field-name$="__' + fieldId + '"]')
  );
}

export function isFieldHidden(fieldId: string, formEl: HTMLElement | Document, scope?: HTMLElement | null): boolean {
  const el = findFieldElement(fieldId, formEl, scope);
  if (!el) return false;
  const hiddenHolder = el.closest<HTMLElement>('.is-hidden-field');
  return !!hiddenHolder;
}

export function isEmptyLineItemRow(row: HTMLElement): boolean {
  const inputs = Array.from(row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
  for (const input of inputs) {
    if (input instanceof HTMLInputElement) {
      if (input.type === 'checkbox' || input.type === 'radio') {
        if (input.checked) return false;
      } else {
        const val = (input.value || '').trim();
        if (val !== '') return false;
      }
    } else if (input instanceof HTMLSelectElement) {
      const val = (input.value || '').trim();
      if (val !== '') return false;
    } else if (input instanceof HTMLTextAreaElement) {
      const val = (input.value || '').trim();
      if (val !== '') return false;
    }
  }
  return true;
}
