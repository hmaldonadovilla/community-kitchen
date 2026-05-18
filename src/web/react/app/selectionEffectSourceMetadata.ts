import { FieldValue, WebFormDefinition } from '../../types';
import { LineItemState } from '../types';
import { parseSubgroupKey, resolveSubgroupKey } from './lineItems';
import { isEmptyValue } from '../utils/values';

const normalizeString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};

const normalizeToken = (raw: unknown): string => normalizeString(raw).replace(/[\s_-]/g, '').toLowerCase();

const isSourceTrackingField = (targetFieldId: string, sourceFieldId: string, lookupSourceFieldId: string): boolean => {
  const normalizedTarget = normalizeString(targetFieldId);
  if (!normalizedTarget) return false;
  if (lookupSourceFieldId && normalizedTarget === lookupSourceFieldId) return true;

  const targetToken = normalizeToken(normalizedTarget);
  const sourceToken = normalizeToken(sourceFieldId);
  if (targetToken.endsWith('sourceid') || targetToken.endsWith('sourceupdatedat')) return true;
  return sourceToken === 'id' || sourceToken === 'updatedat' || sourceToken === 'lastupdatedat';
};

export const collectSelectionEffectSourceMetadataFieldIds = (field: any, changedFieldId: string): string[] => {
  const changedId = normalizeString(changedFieldId);
  if (!changedId) return [];
  const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (fieldId: unknown) => {
    const normalized = normalizeString(fieldId);
    if (!normalized || normalized === changedId || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  effects.forEach((effect: any) => {
    if (!effect || typeof effect !== 'object') return;
    const lookupSourceFieldId = normalizeString(effect.lookupSourceFieldId);
    add(lookupSourceFieldId);

    const mappings = [effect.parentFieldMapping, effect.fieldMapping].filter(
      mapping => mapping && typeof mapping === 'object' && !Array.isArray(mapping)
    );
    mappings.forEach(mapping => {
      Object.entries(mapping as Record<string, unknown>).forEach(([targetFieldId, sourceFieldId]) => {
        if (isSourceTrackingField(targetFieldId, normalizeString(sourceFieldId), lookupSourceFieldId)) {
          add(targetFieldId);
        }
      });
    });
  });

  return out;
};

export const clearSelectionEffectSourceMetadata = (
  rowValues: Record<string, FieldValue>,
  field: any,
  changedFieldId: string
): Record<string, FieldValue> => {
  const fieldIds = collectSelectionEffectSourceMetadataFieldIds(field, changedFieldId);
  if (!fieldIds.length) return rowValues;

  let changed = false;
  const next = { ...(rowValues || {}) };
  fieldIds.forEach(fieldId => {
    if ((next as any)[fieldId] === null) return;
    (next as any)[fieldId] = null;
    changed = true;
  });
  return changed ? next : rowValues;
};

const collectSourceMappedValuePreserveRules = (
  fields: any[]
): Array<{ sourceFieldId: string; mappedFieldIds: string[] }> => {
  const rules: Array<{ sourceFieldId: string; mappedFieldIds: string[] }> = [];
  (fields || []).forEach(field => {
    const sourceFieldId = normalizeString(field?.id);
    if (!sourceFieldId) return;
    const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
    effects.forEach((effect: any) => {
      if (!effect || effect.type !== 'setValuesFromDataSource') return;
      const fieldMapping = effect.fieldMapping && typeof effect.fieldMapping === 'object' ? effect.fieldMapping : {};
      const mappedFieldIds = Object.keys(fieldMapping)
        .map(normalizeString)
        .filter(fieldId => fieldId && fieldId !== sourceFieldId);
      if (!mappedFieldIds.length) return;
      rules.push({ sourceFieldId, mappedFieldIds });
    });
  });
  return rules;
};

const resolveLineItemFieldsForGroupKey = (definition: WebFormDefinition, groupKey: string): any[] => {
  const parsed = parseSubgroupKey(groupKey);
  if (!parsed) {
    const root = (definition.questions || []).find(q => q.id === groupKey && q.type === 'LINE_ITEM_GROUP');
    return (root?.lineItemConfig?.fields || []) as any[];
  }

  const root = (definition.questions || []).find(q => q.id === parsed.rootGroupId && q.type === 'LINE_ITEM_GROUP');
  if (!root) return [];
  let current: any = root;
  for (let i = 0; i < parsed.path.length; i += 1) {
    const subId = parsed.path[i];
    const subGroups = (current?.lineItemConfig?.subGroups || current?.subGroups || []) as any[];
    const match = subGroups.find(sub => resolveSubgroupKey(sub as any) === subId);
    if (!match) return [];
    current = match;
  }
  return (current?.fields || current?.lineItemConfig?.fields || []) as any[];
};

const areEquivalentFieldValues = (left: FieldValue, right: FieldValue): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftList = Array.isArray(left) ? left : [];
    const rightList = Array.isArray(right) ? right : [];
    return leftList.length === rightList.length && leftList.every((entry, idx) => entry === rightList[idx]);
  }
  return false;
};

export const preserveSelectionEffectSourceMappedValues = (args: {
  definition: WebFormDefinition;
  previousLineItems: LineItemState;
  nextLineItems: LineItemState;
}): LineItemState => {
  const previousLineItems = args.previousLineItems || {};
  const nextLineItems = args.nextLineItems || {};
  let updatedState = nextLineItems;

  Object.keys(nextLineItems).forEach(groupKey => {
    const rows = nextLineItems[groupKey] || [];
    if (!Array.isArray(rows) || !rows.length) return;
    const fields = resolveLineItemFieldsForGroupKey(args.definition, groupKey);
    const rules = collectSourceMappedValuePreserveRules(fields);
    if (!rules.length) return;

    const previousRowsById = new Map((previousLineItems[groupKey] || []).map(row => [row.id, row]));
    let nextRows = rows;
    rows.forEach((row, rowIndex) => {
      const previousRow = previousRowsById.get(row.id);
      if (!previousRow) return;
      const rowValues = (row.values || {}) as Record<string, FieldValue>;
      const previousValues = (previousRow.values || {}) as Record<string, FieldValue>;
      let nextValues = rowValues;

      rules.forEach(rule => {
        if (!areEquivalentFieldValues(previousValues[rule.sourceFieldId], rowValues[rule.sourceFieldId])) return;
        rule.mappedFieldIds.forEach(fieldId => {
          const previousValue = previousValues[fieldId];
          if (isEmptyValue(previousValue)) return;
          if (!isEmptyValue(rowValues[fieldId])) return;
          if (nextValues === rowValues) nextValues = { ...rowValues };
          nextValues[fieldId] = previousValue;
        });
      });

      if (nextValues === rowValues) return;
      if (updatedState === nextLineItems) updatedState = { ...nextLineItems };
      if (nextRows === rows) nextRows = rows.slice();
      nextRows[rowIndex] = { ...row, values: nextValues };
    });

    if (nextRows !== rows) {
      updatedState[groupKey] = nextRows;
    }
  });

  return updatedState;
};
