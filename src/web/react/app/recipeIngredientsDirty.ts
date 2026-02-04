import { FieldValue, LineItemRowState } from '../../types';
import { LineItemState } from '../types';
import { parseSubgroupKey } from './lineItems';

export const CK_RECIPE_INGREDIENTS_DIRTY_KEY = '__ckRecipeIngredientsDirty';
export const CK_RECIPE_INGREDIENTS_SUBGROUP_ID = 'MP_INGREDIENTS_LI';

export const markRecipeIngredientsDirtyForGroupKey = (
  lineItems: LineItemState,
  groupKey: string
): { lineItems: LineItemState; changed: boolean; parentGroupKey?: string; parentRowId?: string } => {
  const parsed = parseSubgroupKey(groupKey);
  if (!parsed) return { lineItems, changed: false };
  if (parsed.subGroupId !== CK_RECIPE_INGREDIENTS_SUBGROUP_ID) return { lineItems, changed: false };
  const parentGroupKey = parsed.parentGroupKey;
  const parentRowId = parsed.parentRowId;
  const parentRows = lineItems[parentGroupKey] || [];
  const idx = parentRows.findIndex(r => r.id === parentRowId);
  if (idx < 0) return { lineItems, changed: false, parentGroupKey, parentRowId };
  const row = parentRows[idx] as LineItemRowState;
  const values = (row?.values || {}) as Record<string, FieldValue>;
  if ((values as any)[CK_RECIPE_INGREDIENTS_DIRTY_KEY] === true) {
    return { lineItems, changed: false, parentGroupKey, parentRowId };
  }
  const nextRow: LineItemRowState = {
    ...row,
    values: { ...values, [CK_RECIPE_INGREDIENTS_DIRTY_KEY]: true }
  };
  const nextRows = [...parentRows];
  nextRows[idx] = nextRow;
  return {
    lineItems: { ...lineItems, [parentGroupKey]: nextRows },
    changed: true,
    parentGroupKey,
    parentRowId
  };
};

