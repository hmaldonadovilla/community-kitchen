import type { FieldValue } from '../../../../types';
import type { LineItemState } from '../../../types';

type ComparableJson =
  | string
  | number
  | boolean
  | null
  | ComparableJson[]
  | { [key: string]: ComparableJson };

const normalizeComparableValue = (value: unknown): ComparableJson => {
  if (value === undefined) return { __ckUndefined: true };
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return { __ckDate: Number.isNaN(value.getTime()) ? '' : value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(entry => normalizeComparableValue(entry));
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, ComparableJson>>((acc, key) => {
        acc[key] = normalizeComparableValue(source[key]);
        return acc;
      }, {});
  }
  return `${value ?? ''}`;
};

const comparableSignature = (value: unknown): string => JSON.stringify(normalizeComparableValue(value));

export const areLineItemFieldValuesEqual = (left: FieldValue, right: FieldValue): boolean => {
  if (left === right) return true;
  return comparableSignature(left) === comparableSignature(right);
};

export const areFieldValueRecordsEqual = (
  left: Record<string, FieldValue> | null | undefined,
  right: Record<string, FieldValue> | null | undefined
): boolean => {
  if (left === right) return true;
  const leftValues = left || {};
  const rightValues = right || {};
  const leftKeys = Object.keys(leftValues);
  const rightKeys = Object.keys(rightValues);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key =>
    Object.prototype.hasOwnProperty.call(rightValues, key) &&
    areLineItemFieldValuesEqual(leftValues[key], rightValues[key])
  );
};

export const areLineItemStatesEqual = (
  left: LineItemState | null | undefined,
  right: LineItemState | null | undefined
): boolean => {
  if (left === right) return true;
  const leftState = left || {};
  const rightState = right || {};
  const leftKeys = Object.keys(leftState).sort();
  const rightKeys = Object.keys(rightState).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let keyIndex = 0; keyIndex < leftKeys.length; keyIndex += 1) {
    const key = leftKeys[keyIndex];
    if (key !== rightKeys[keyIndex]) return false;
    const leftRows = leftState[key] || [];
    const rightRows = rightState[key] || [];
    if (leftRows.length !== rightRows.length) return false;
    for (let rowIndex = 0; rowIndex < leftRows.length; rowIndex += 1) {
      if (comparableSignature(leftRows[rowIndex]) !== comparableSignature(rightRows[rowIndex])) {
        return false;
      }
    }
  }
  return true;
};
