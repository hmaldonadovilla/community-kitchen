import type { FieldValue, WebFormDefinition, WebQuestionDefinition } from '../../types';
import type { LineItemState } from '../types';
import { applyValueMapsToLineRow, type ApplyValueMapsMode } from './valueMaps';
import { buildLineContextId, parseSubgroupKey, resolveSubgroupKey } from './lineItems';

type AncestorSelectionEffectMode = 'init' | 'change' | 'blur';

type RunSelectionEffectsForAncestorsArgs = {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  onSelectionEffect: (
    q: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
    }
  ) => void;
  sourceGroupKey: string;
  prevLineItems: LineItemState;
  nextLineItems: LineItemState;
  options?: { mode?: AncestorSelectionEffectMode; topValues?: Record<string, FieldValue> };
};

const hasSelectionEffects = (field: any): boolean =>
  Array.isArray(field?.selectionEffects) && field.selectionEffects.length > 0;

const coerceComparableNumber = (value: FieldValue): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const areFieldValuesEqual = (a: FieldValue, b: FieldValue): boolean => {
  if (a === b) return true;
  const numA = coerceComparableNumber(a);
  const numB = coerceComparableNumber(b);
  if (numA !== null && numB !== null) return numA === numB;
  if (Array.isArray(a) || Array.isArray(b)) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    if (arrA.length !== arrB.length) return false;
    return arrA.every((val, idx) => val === arrB[idx]);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }
  return false;
};

const buildSelectionEffectRowValuesForKey = (args: {
  groupKey: string;
  targetRowId: string;
  nextLineItems: LineItemState;
}): Record<string, FieldValue> => {
  const { groupKey, targetRowId, nextLineItems } = args;
  const rows = nextLineItems[groupKey] || [];
  const row = rows.find(r => r.id === targetRowId);
  const merged: Record<string, FieldValue> = { ...(row?.values || {}) };

  const mergeMissing = (source?: Record<string, FieldValue>) => {
    if (!source) return;
    Object.entries(source).forEach(([key, val]) => {
      if (Object.prototype.hasOwnProperty.call(merged, key)) return;
      merged[key] = val;
    });
  };

  let currentKey = groupKey;
  let info = parseSubgroupKey(currentKey);
  while (info) {
    const currentInfo = info;
    const parentRows = nextLineItems[currentInfo.parentGroupKey] || [];
    const parentRow = parentRows.find(r => r.id === currentInfo.parentRowId);
    mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
    currentKey = currentInfo.parentGroupKey;
    info = parseSubgroupKey(currentKey);
  }

  return merged;
};

const resolveEffectFieldsForGroupKey = (definition: WebFormDefinition, groupKey: string): any[] => {
  const parsed = parseSubgroupKey(groupKey);
  if (!parsed) {
    const root = definition.questions.find(q => q.id === groupKey);
    return (root?.lineItemConfig?.fields || []) as any[];
  }

  const root = definition.questions.find(q => q.id === parsed.rootGroupId && q.type === 'LINE_ITEM_GROUP');
  if (!root) return [];

  let current: any = root;
  for (let i = 0; i < parsed.path.length; i += 1) {
    const subId = parsed.path[i];
    const subs = (current?.lineItemConfig?.subGroups || current?.subGroups || []) as any[];
    const match = subs.find(s => resolveSubgroupKey(s) === subId);
    if (!match) return [];
    current = match;
  }
  return (current?.fields || current?.lineItemConfig?.fields || []) as any[];
};

const resolveAncestorDiffModes = (mode: AncestorSelectionEffectMode): { prevMode: ApplyValueMapsMode; nextMode: ApplyValueMapsMode } => {
  // When blur-derived values are recomputed, the previous state still reflects the "change" phase.
  // Comparing blur->blur would erase the very diff we need to detect.
  return { prevMode: mode === 'blur' ? 'change' : mode, nextMode: mode };
};

export const runSelectionEffectsForAncestors = (args: RunSelectionEffectsForAncestorsArgs): void => {
  const { definition, values, onSelectionEffect, sourceGroupKey, prevLineItems, nextLineItems, options } = args;
  const mode = options?.mode || 'change';
  const topValuesForMode = options?.topValues || values;
  const { prevMode, nextMode } = resolveAncestorDiffModes(mode);

  const runSelectionEffectsForRow = (groupKey: string, targetRowId: string) => {
    const prevRows = prevLineItems[groupKey] || [];
    const nextRows = nextLineItems[groupKey] || [];
    const prevRow = prevRows.find(r => r.id === targetRowId);
    const nextRow = nextRows.find(r => r.id === targetRowId);
    if (!nextRow) return;

    const groupFields = resolveEffectFieldsForGroupKey(definition, groupKey);
    const effectFields = groupFields.filter(hasSelectionEffects);
    if (!effectFields.length) return;

    const prevComputed = prevRow
      ? applyValueMapsToLineRow(groupFields, prevRow.values || {}, topValuesForMode, { mode: prevMode }, {
          groupKey,
          rowId: targetRowId,
          lineItems: prevLineItems
        })
      : {};

    const nextComputed = applyValueMapsToLineRow(groupFields, nextRow.values || {}, topValuesForMode, { mode: nextMode }, {
      groupKey,
      rowId: targetRowId,
      lineItems: nextLineItems
    });

    const rowValues = {
      ...buildSelectionEffectRowValuesForKey({ groupKey, targetRowId, nextLineItems }),
      ...nextComputed
    };

    effectFields.forEach(effectField => {
      const prevValue = (prevComputed as Record<string, FieldValue>)[effectField.id];
      const nextValue = (nextComputed as Record<string, FieldValue>)[effectField.id];
      if (areFieldValuesEqual(prevValue, nextValue)) return;

      const contextId = buildLineContextId(groupKey, targetRowId, effectField.id);
      const effectQuestion = effectField as unknown as WebQuestionDefinition;
      onSelectionEffect(effectQuestion, nextValue ?? null, {
        contextId,
        lineItem: { groupId: groupKey, rowId: targetRowId, rowValues }
      });
    });
  };

  const subgroupInfo = parseSubgroupKey(sourceGroupKey);
  if (!subgroupInfo?.parentGroupKey || !subgroupInfo.parentRowId) return;

  let currentKey = subgroupInfo.parentGroupKey;
  let currentRowId = subgroupInfo.parentRowId;
  while (currentKey && currentRowId) {
    runSelectionEffectsForRow(currentKey, currentRowId);
    const nextInfo = parseSubgroupKey(currentKey);
    if (!nextInfo?.parentGroupKey || !nextInfo.parentRowId) break;
    currentKey = nextInfo.parentGroupKey;
    currentRowId = nextInfo.parentRowId;
  }
};

export const __test__ = {
  resolveAncestorDiffModes,
  areFieldValuesEqual
};
