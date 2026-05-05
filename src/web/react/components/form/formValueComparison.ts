import type { FieldValue } from '../../../types';
import type { LineItemState } from '../../types';

/**
 * Owner: FormView blur-derived change detection.
 * Compares top-level form values and line-item row values without depending on
 * React state or DOM APIs.
 */
export const areFormFieldValuesShallowEqual = (a: FieldValue, b: FieldValue): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? a : [a];
    const bb = Array.isArray(b) ? b : [b];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
      if ((aa[i] as any) !== (bb[i] as any)) return false;
    }
    return true;
  }
  return false;
};

export const diffFormValues = (
  a: Record<string, FieldValue>,
  b: Record<string, FieldValue>
): string[] => {
  const changed: string[] = [];
  const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
  keys.forEach(key => {
    if (!areFormFieldValuesShallowEqual((a as any)[key], (b as any)[key])) changed.push(key);
  });
  return changed;
};

export const areLineItemsShallowEqual = (a: LineItemState, b: LineItemState): boolean => {
  if (a === b) return true;
  const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
  for (const key of keys) {
    const leftRows = (a as any)[key] || [];
    const rightRows = (b as any)[key] || [];
    if (leftRows.length !== rightRows.length) return false;
    for (let i = 0; i < leftRows.length; i += 1) {
      const leftRow = leftRows[i];
      const rightRow = rightRows[i];
      if (!leftRow || !rightRow) return false;
      if (leftRow.id !== rightRow.id) return false;
      const leftValues = leftRow.values || {};
      const rightValues = rightRow.values || {};
      const valueKeys = Array.from(new Set([...Object.keys(leftValues), ...Object.keys(rightValues)]));
      for (const fieldId of valueKeys) {
        if (!areFormFieldValuesShallowEqual((leftValues as any)[fieldId], (rightValues as any)[fieldId])) {
          return false;
        }
      }
    }
  }
  return true;
};
