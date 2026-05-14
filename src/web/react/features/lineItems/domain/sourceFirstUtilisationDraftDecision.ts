import type { FieldValue } from '../../../../types';

/**
 * Owner: source-first utilisation drafts.
 * Keeps invalid quantity drafts local so validation can block navigation without
 * mutating the selected leftover row on blur.
 */
export const shouldKeepInvalidSourceFirstQuantityDraft = (args: {
  fieldId: string;
  quantityFieldId?: string;
  value: FieldValue;
}): boolean => {
  const fieldId = `${args.fieldId || ''}`.trim();
  const quantityFieldId = `${args.quantityFieldId || ''}`.trim();
  if (!fieldId || !quantityFieldId || fieldId !== quantityFieldId) return false;
  if (args.value === undefined || args.value === null) return true;
  const text = `${args.value}`.trim();
  if (!text) return true;
  const quantity = Number(text);
  return Number.isFinite(quantity) && quantity <= 0;
};
