import { ExclusiveLineSelectionConfig } from '../../../types';
import { FieldValue } from '../../types';
import { cascadeRemoveLineItemRows, buildSubgroupKey, parseSubgroupKey } from './lineItems';
import { LineItemState } from '../types';

const isSelectionActive = (value: FieldValue): boolean => {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  if (typeof value === 'number') return value === 1;
  return false;
};

const normalizeComparable = (value: FieldValue): string => {
  if (Array.isArray(value)) {
    return value
      .map(entry => normalizeComparable(entry as FieldValue))
      .filter(Boolean)
      .join('||');
  }
  if (value === undefined || value === null) return '';
  return value.toString().trim().toLowerCase();
};

const resolveScopeKeys = (lineItems: LineItemState, groupKey: string, scope: ExclusiveLineSelectionConfig['scope']): string[] => {
  if (scope !== 'sameSubgroupAcrossRoot') return [groupKey];
  const parsed = parseSubgroupKey(groupKey);
  if (!parsed) return [groupKey];
  return Object.keys(lineItems).filter(candidateKey => {
    const candidate = parseSubgroupKey(candidateKey);
    if (!candidate) return false;
    return candidate.rootGroupId === parsed.rootGroupId && candidate.subGroupId === parsed.subGroupId;
  });
};

export const applyExclusiveLineSelection = (args: {
  lineItems: LineItemState;
  groupKey: string;
  rowId: string;
  fieldId: string;
  value: FieldValue;
  rowValues: Record<string, FieldValue>;
  config?: ExclusiveLineSelectionConfig;
}): LineItemState => {
  const { lineItems, groupKey, rowId, fieldId, value, rowValues, config } = args;
  if (!config || !isSelectionActive(value)) return lineItems;
  const keyFieldId = (config.keyFieldId || '').toString().trim();
  if (!keyFieldId) return lineItems;
  const targetComparable = normalizeComparable(rowValues[keyFieldId]);
  if (!targetComparable) return lineItems;

  const scopeKeys = resolveScopeKeys(lineItems, groupKey, config.scope);
  const clearFieldIds = Array.from(
    new Set(
      [fieldId, ...(Array.isArray(config.clearFieldIds) ? config.clearFieldIds : [])]
        .map((entry: string) => (entry !== undefined && entry !== null ? entry.toString().trim() : ''))
        .filter(Boolean)
    )
  );
  const clearSubGroupIds = Array.from(
    new Set(
      (Array.isArray(config.clearSubGroupIds) ? config.clearSubGroupIds : [])
        .map((entry: string) => (entry !== undefined && entry !== null ? entry.toString().trim() : ''))
        .filter(Boolean)
    )
  );

  let changed = false;
  const rootsToRemove: Array<{ groupId: string; rowId: string }> = [];
  const nextLineItems: LineItemState = { ...lineItems };

  scopeKeys.forEach(scopeKey => {
    const rows = nextLineItems[scopeKey] || [];
    if (!rows.length) return;
    const nextRows = rows.map(row => {
      if (scopeKey === groupKey && row.id === rowId) return row;
      const rowComparable = normalizeComparable((row.values || {})[keyFieldId] as FieldValue);
      if (!rowComparable || rowComparable !== targetComparable) return row;
      const nextRowValues = { ...(row.values || {}) } as Record<string, FieldValue>;
      clearFieldIds.forEach(clearFieldId => {
        nextRowValues[clearFieldId] = clearFieldId === fieldId ? false : null;
      });
      clearSubGroupIds.forEach((subGroupId: string) => {
        const subgroupKey = buildSubgroupKey(scopeKey, row.id, subGroupId);
        const subgroupRows = nextLineItems[subgroupKey] || [];
        subgroupRows.forEach(subRow => {
          rootsToRemove.push({ groupId: subgroupKey, rowId: subRow.id });
        });
      });
      changed = true;
      return { ...row, values: nextRowValues };
    });
    nextLineItems[scopeKey] = nextRows;
  });

  if (!changed) return lineItems;
  if (!rootsToRemove.length) return nextLineItems;
  const existingRoots = rootsToRemove.filter(root => Array.isArray(nextLineItems[root.groupId]) && nextLineItems[root.groupId].length > 0);
  if (!existingRoots.length) return nextLineItems;
  return cascadeRemoveLineItemRows({ lineItems: nextLineItems, roots: existingRoots }).lineItems;
};
