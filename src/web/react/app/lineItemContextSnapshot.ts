import type { FieldValue } from '../../types';
import type { LineItemState } from '../types';
import { parseSubgroupKey } from './lineItems';

const normalizeFieldId = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};

const coerceComparableNumber = (value: FieldValue): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const areSnapshotValuesEqual = (left: FieldValue, right: FieldValue): boolean => {
  if (left === right) return true;
  const leftNumber = coerceComparableNumber(left);
  const rightNumber = coerceComparableNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber === rightNumber;
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftValues = Array.isArray(left) ? left : [];
    const rightValues = Array.isArray(right) ? right : [];
    return leftValues.length === rightValues.length && leftValues.every((value, idx) => value === rightValues[idx]);
  }
  return false;
};

export const buildLineItemContextSnapshot = (
  lineItems: LineItemState,
  groupKey: string,
  rowId: string
): Record<string, FieldValue> | null => {
  const rows = lineItems[groupKey] || [];
  const row = rows.find(candidate => candidate?.id === rowId);
  if (!row) return null;
  const snapshot: Record<string, FieldValue> = { ...((row.values || {}) as Record<string, FieldValue>) };
  const mergeMissing = (source?: Record<string, FieldValue>) => {
    if (!source) return;
    Object.entries(source).forEach(([fieldId, value]) => {
      if (Object.prototype.hasOwnProperty.call(snapshot, fieldId)) return;
      snapshot[fieldId] = value;
    });
  };

  let currentKey = groupKey;
  let info = parseSubgroupKey(currentKey);
  while (info) {
    const currentInfo = info;
    const parentRows = lineItems[currentInfo.parentGroupKey] || [];
    const parentRow = parentRows.find(candidate => candidate?.id === currentInfo.parentRowId);
    mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
    currentKey = currentInfo.parentGroupKey;
    info = parseSubgroupKey(currentKey);
  }
  return snapshot;
};

export const isLineItemContextSnapshotCurrent = (args: {
  lineItems: LineItemState;
  groupKey?: string;
  rowId?: string;
  snapshotValues?: Record<string, FieldValue>;
  fieldIds?: string[];
}): boolean => {
  const groupKey = normalizeFieldId(args.groupKey);
  const rowId = normalizeFieldId(args.rowId);
  if (!groupKey || !rowId) return true;
  const fieldIds = Array.from(new Set((args.fieldIds || []).map(normalizeFieldId).filter(Boolean)));
  if (!fieldIds.length) return true;
  const current = buildLineItemContextSnapshot(args.lineItems, groupKey, rowId);
  if (!current) return false;
  const snapshot = args.snapshotValues || {};
  return fieldIds.every(fieldId => {
    if (!Object.prototype.hasOwnProperty.call(current, fieldId)) return true;
    if (!Object.prototype.hasOwnProperty.call(snapshot, fieldId)) return true;
    return areSnapshotValuesEqual(current[fieldId], snapshot[fieldId]);
  });
};
