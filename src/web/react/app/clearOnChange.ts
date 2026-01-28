import type { FieldValue, WebFormDefinition } from '../../types';
import type { LineItemState } from '../types';
import { normalizeRecordValues } from './records';
import { buildInitialLineItems } from './lineItems';
import { applyValueMapsToForm } from './valueMaps';

export const applyClearOnChange = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  fieldId: string;
  nextValue: FieldValue;
}): { values: Record<string, FieldValue>; lineItems: LineItemState; clearedFieldIds: string[]; clearedGroupKeys: string[] } => {
  const { definition, lineItems, fieldId, nextValue } = args;
  const normalizedFieldId = (fieldId || '').toString().trim();
  if (!normalizedFieldId) {
    return { values: args.values, lineItems: args.lineItems, clearedFieldIds: [], clearedGroupKeys: [] };
  }

  const clearedFieldIds = definition.questions
    .filter(q => q.type !== 'LINE_ITEM_GROUP')
    .map(q => (q.id || '').toString())
    .filter(id => id && id !== normalizedFieldId);

  const clearedGroupKeys = Object.keys(lineItems || {}).filter(key => (lineItems[key] || []).length > 0);

  const resetValues = normalizeRecordValues(definition);
  const baseValues: Record<string, FieldValue> = { ...resetValues, [normalizedFieldId]: nextValue };
  const initialLineItems = buildInitialLineItems(definition, baseValues);
  const mapped = applyValueMapsToForm(definition, baseValues, initialLineItems, {
    mode: 'change',
    lockedTopFields: [normalizedFieldId]
  });

  return {
    values: mapped.values,
    lineItems: mapped.lineItems,
    clearedFieldIds,
    clearedGroupKeys
  };
};
