import { parseSubgroupKey } from '../../../app/lineItems';
import type { FormErrors } from '../../../types';

export type ValidationErrorIndex = {
  rowErrors: Set<string>;
  subgroupErrors: Set<string>;
};

export const buildValidationErrorIndex = (errors: FormErrors | null | undefined): ValidationErrorIndex => {
  const rowErrors = new Set<string>();
  const subgroupErrors = new Set<string>();
  Object.keys(errors || {}).forEach(key => {
    const parts = key.split('__');
    if (parts.length !== 3) return;
    const prefix = parts[0];
    const rowId = parts[2];
    const info = parseSubgroupKey(prefix);
    if (info) {
      subgroupErrors.add(prefix);
      rowErrors.add(`${info.parentGroupKey}::${info.parentRowId}`);
      return;
    }
    rowErrors.add(`${prefix}::${rowId}`);
  });
  return { rowErrors, subgroupErrors };
};
