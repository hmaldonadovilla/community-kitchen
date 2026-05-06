import { FieldValue, WebQuestionDefinition } from '../../../../types';
import { matchesWhenClause } from '../../../../core';
import {
  buildSubgroupKey,
  parseSubgroupKey,
  resolveSubgroupKey,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY,
  shouldPersistLineItemRows
} from '../../../app/lineItems';
import { applyValueMapsToLineRow } from '../../../app/valueMaps';
import { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import { CK_RECIPE_INGREDIENTS_DIRTY_KEY } from '../../../app/recipeIngredientsDirty';

export interface SelectionEffectInitTarget {
  group: WebQuestionDefinition;
  groupKey: string;
  rowId: string;
  field: any;
  rawValue: FieldValue;
  signature: string;
}

const hasSelectionEffectInitialValue = (rawValue: FieldValue): boolean =>
  Array.isArray(rawValue)
    ? rawValue.length > 0
    : typeof rawValue === 'boolean'
      ? rawValue === true
      : !isEmptyValue(rawValue);

const toStableSignatureValue = (rawValue: FieldValue): string => {
  if (rawValue === undefined) return '__undefined__';
  try {
    return JSON.stringify(rawValue);
  } catch {
    return `${rawValue ?? ''}`;
  }
};

const normalizeString = (rawValue: unknown): string => {
  if (rawValue === undefined || rawValue === null) return '';
  try {
    return rawValue.toString().trim();
  } catch {
    return '';
  }
};

const shouldRunSelectionEffectsOnInit = (field: any): boolean => field?.ui?.runSelectionEffectsOnInit !== false;

const normalizeSelectionValues = (rawValue: FieldValue): string[] => {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map(entry => normalizeString(entry))
      .filter(Boolean);
  }
  const normalized = normalizeString(rawValue);
  return normalized ? [normalized] : [];
};

const effectSelectionMatches = (effect: any, rawValue: FieldValue): boolean => {
  const triggerValues = Array.isArray(effect?.triggerValues)
    ? effect.triggerValues.map((entry: any) => normalizeString(entry)).filter(Boolean)
    : [];
  if (!triggerValues.length) return true;
  const currentSelections = normalizeSelectionValues(rawValue);
  return currentSelections.some(entry => triggerValues.includes(entry));
};

const resolveSourceSyncConfig = (effect: any): Record<string, any> => {
  const nested =
    effect?.sourceSync && typeof effect.sourceSync === 'object'
      ? effect.sourceSync
      : effect?.sync && typeof effect.sync === 'object'
        ? effect.sync
        : {};
  return {
    ...nested,
    ...(effect?.refreshOnInit !== undefined ? { refreshOnInit: effect.refreshOnInit === true } : {}),
    ...(effect?.forceRefresh !== undefined ? { forceRefresh: effect.forceRefresh === true } : {}),
    ...(effect?.stopWhen ? { stopWhen: effect.stopWhen } : {})
  };
};

const effectRefreshesOnInit = (effect: any): boolean => resolveSourceSyncConfig(effect).refreshOnInit === true;

const effectStopMatches = (effect: any, whenCtx: ReturnType<typeof buildEffectWhenContext>): boolean => {
  const stopWhen = resolveSourceSyncConfig(effect).stopWhen;
  return stopWhen ? matchesWhenClause(stopWhen, whenCtx as any) : false;
};

const buildEffectWhenContext = (args: {
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  topValues: Record<string, FieldValue>;
  lineItems: LineItemState;
}) => ({
  getValue: (fieldId: string) => {
    if (Object.prototype.hasOwnProperty.call(args.rowValues, fieldId)) return args.rowValues[fieldId];
    if (args.parentValues && Object.prototype.hasOwnProperty.call(args.parentValues, fieldId)) return args.parentValues[fieldId];
    if (Object.prototype.hasOwnProperty.call(args.topValues, fieldId)) return args.topValues[fieldId];
    return undefined;
  },
  getLineItems: (groupId: string) => (args.lineItems[groupId] || []) as any[],
  getLineItemKeys: () => Object.keys(args.lineItems || {})
});

const resolveInitEffectValue = (
  rawValue: unknown,
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>
): FieldValue => {
  if (typeof rawValue !== 'string') return rawValue as FieldValue;
  const normalized = rawValue.toString().trim();
  if (!normalized) return rawValue as FieldValue;
  if (normalized.startsWith('$row.')) {
    const fieldId = normalized.slice('$row.'.length).trim();
    return fieldId ? rowValues[fieldId] : undefined;
  }
  if (normalized.startsWith('$top.')) {
    const fieldId = normalized.slice('$top.'.length).trim();
    return fieldId ? topValues[fieldId] : undefined;
  }
  return rawValue as FieldValue;
};

const areEquivalentFieldValues = (left: FieldValue, right: FieldValue): boolean => {
  if (right === null && isEmptyValue(left)) return true;
  if (left === null && isEmptyValue(right)) return true;
  return toStableSignatureValue(left) === toStableSignatureValue(right);
};

const fieldUsesSubgroupSeedInit = (group: WebQuestionDefinition, field: any): boolean => {
  const subGroupIds = (((group as any)?.lineItemConfig?.subGroups || []) as any[])
    .map((sub: any) => resolveSubgroupKey(sub))
    .filter(Boolean);
  if (!subGroupIds.length) return false;
  const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
  return effects.some((effect: any) => {
    if (!effect || effect.type !== 'addLineItemsFromDataSource') return false;
    const targetGroupId = normalizeString((effect as any)?.groupId);
    return !!targetGroupId && subGroupIds.includes(targetGroupId);
  });
};

const fieldHasRefreshOnInitEffect = (field: any): boolean => {
  const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
  return effects.some((effect: any) => effectRefreshesOnInit(effect));
};

const collectSetValuesFromDataSourceFieldIds = (field: any): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
  effects.forEach((effect: any) => {
    if (!effect || effect.type !== 'setValuesFromDataSource') return;
    const fieldMapping = effect.fieldMapping && typeof effect.fieldMapping === 'object' ? effect.fieldMapping : {};
    Object.keys(fieldMapping).forEach(fieldId => {
      const normalized = normalizeString(fieldId);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    });
  });
  return out;
};

const fieldHasHydratedDataSourceMappings = (field: any, rowValues: Record<string, FieldValue>): boolean => {
  const mappedFieldIds = collectSetValuesFromDataSourceFieldIds(field);
  if (!mappedFieldIds.length) return false;
  return mappedFieldIds.some(fieldId => hasSelectionEffectInitialValue(rowValues[fieldId]));
};

const subgroupHasHydratedSeedRows = (args: {
  effect: any;
  subGroup: any;
  subRows: any[];
}): boolean => {
  const { effect, subGroup, subRows } = args;
  const anchorFieldId = ((subGroup as any)?.anchorFieldId || '').toString().trim();
  if (!anchorFieldId || !subRows.length) return false;

  if (!shouldPersistLineItemRows(subGroup)) {
    return subRows.some(subRow => {
      const values = (subRow?.values || {}) as Record<string, FieldValue>;
      return hasSelectionEffectInitialValue(values[anchorFieldId]);
    });
  }

  const mappedFieldIds = Object.keys((effect as any)?.lineItemMapping || {})
    .map(fieldId => fieldId.toString().trim())
    .filter(Boolean)
    .filter(fieldId => fieldId !== anchorFieldId);

  return subRows.some(subRow => {
    const values = (subRow?.values || {}) as Record<string, FieldValue>;
    if (!hasSelectionEffectInitialValue(values[anchorFieldId])) return false;
    if (!mappedFieldIds.length) return true;
    return mappedFieldIds.some(fieldId => hasSelectionEffectInitialValue(values[fieldId]));
  });
};

const buildSeedStateSignature = (args: {
  effect: any;
  subGroup: any;
  subRows: any[];
}): string => {
  const { effect, subGroup, subRows } = args;
  if (!shouldPersistLineItemRows(subGroup)) {
    return subRows
      .map(subRow => {
        const values = (subRow?.values || {}) as Record<string, FieldValue>;
        return Object.keys(values)
          .sort()
          .map(fieldId => `${fieldId}:${toStableSignatureValue(values[fieldId])}`)
          .join('|');
      })
      .join('||') || '__empty__';
  }
  const anchorFieldId = ((subGroup as any)?.anchorFieldId || '').toString().trim();
  const mappedFieldIds = Object.keys((effect as any)?.lineItemMapping || {})
    .map(fieldId => fieldId.toString().trim())
    .filter(Boolean);
  if (!subRows.length) return '__empty__';
  return subRows
    .map(subRow => {
      const values = (subRow?.values || {}) as Record<string, FieldValue>;
      const parts = mappedFieldIds.map(fieldId => `${fieldId}:${toStableSignatureValue(values[fieldId])}`);
      if (anchorFieldId && !mappedFieldIds.includes(anchorFieldId)) {
        parts.unshift(`${anchorFieldId}:${toStableSignatureValue(values[anchorFieldId])}`);
      }
      return parts.join('|');
    })
    .join('||');
};

const resolveEffectTargetGroupKey = (question: WebQuestionDefinition, rowId: string, rawGroupId: unknown): string => {
  const groupId = normalizeString(rawGroupId);
  if (!groupId) return '';
  const subGroupIds = (((question as any)?.lineItemConfig?.subGroups || []) as any[])
    .map((sub: any) => resolveSubgroupKey(sub))
    .filter(Boolean);
  if (subGroupIds.includes(groupId) && rowId) {
    return buildSubgroupKey(question.id, rowId, groupId);
  }
  return groupId;
};

const resolveEffectTargetRows = (args: {
  question: WebQuestionDefinition;
  rowId: string;
  effect: any;
  lineItems: LineItemState;
}): any[] => {
  const targetKey = resolveEffectTargetGroupKey(
    args.question,
    args.rowId,
    (args.effect as any)?.targetPath ?? (args.effect as any)?.groupId
  );
  if (!targetKey) return [];
  const rows = (args.lineItems[targetKey] || []) as any[];
  if (!rows.length) return [];

  const effectId = normalizeString((args.effect as any)?.targetEffectId) || normalizeString((args.effect as any)?.id);
  const hasParentMetadata = rows.some(row => {
    const values = (row?.values || {}) as Record<string, FieldValue>;
    return !!(
      normalizeString(values[ROW_PARENT_GROUP_ID_KEY]) ||
      normalizeString((row as any)?.parentGroupId) ||
      normalizeString(values[ROW_PARENT_ROW_ID_KEY]) ||
      normalizeString((row as any)?.parentId)
    );
  });
  const hasEffectMetadata = rows.some(row => {
    const values = (row?.values || {}) as Record<string, FieldValue>;
    return !!normalizeString(values[ROW_SELECTION_EFFECT_ID_KEY]);
  });

  return rows.filter(row => {
    const values = (row?.values || {}) as Record<string, FieldValue>;
    if (hasParentMetadata) {
      const parentGroupId = normalizeString(values[ROW_PARENT_GROUP_ID_KEY]) || normalizeString((row as any)?.parentGroupId);
      const parentRowId = normalizeString(values[ROW_PARENT_ROW_ID_KEY]) || normalizeString((row as any)?.parentId);
      if (parentGroupId !== args.question.id || parentRowId !== args.rowId) {
        return false;
      }
    }
    if (effectId && hasEffectMetadata) {
      const rowEffectId = normalizeString(values[ROW_SELECTION_EFFECT_ID_KEY]);
      if (rowEffectId !== effectId) {
        return false;
      }
    }
    return true;
  });
};

const effectTargetRowsAreHydrated = (args: {
  question: WebQuestionDefinition;
  rowId: string;
  effect: any;
  lineItems: LineItemState;
}): boolean => {
  const rows = resolveEffectTargetRows(args);
  if (!rows.length) return false;
  const mappedFieldIds = Object.keys((args.effect as any)?.lineItemMapping || {})
    .map(fieldId => normalizeString(fieldId))
    .filter(Boolean);
  if (!mappedFieldIds.length) return true;
  return rows.some(row => {
    const values = (row?.values || {}) as Record<string, FieldValue>;
    return mappedFieldIds.some(fieldId => hasSelectionEffectInitialValue(values[fieldId]));
  });
};

const isRecipeIngredientsDirty = (rowValues: Record<string, FieldValue>): boolean => {
  const raw = (rowValues as any)?.[CK_RECIPE_INGREDIENTS_DIRTY_KEY];
  return raw === true || (typeof raw === 'string' && raw.trim().toLowerCase() === 'true');
};

const effectNeedsInit = (args: {
  question: WebQuestionDefinition;
  rowId: string;
  field: any;
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  lineItems: LineItemState;
  topValues: Record<string, FieldValue>;
}): boolean => {
  const effects = Array.isArray(args.field?.selectionEffects) ? args.field.selectionEffects : [];
  const sourceValue = args.rowValues[(args.field?.id || '').toString()] as FieldValue;
  const whenCtx = buildEffectWhenContext({
    rowValues: args.rowValues,
    parentValues: args.parentValues,
    topValues: args.topValues,
    lineItems: args.lineItems
  });
  return effects.some((effect: any) => {
    if (!effect || typeof effect !== 'object') return false;
    if (!effectSelectionMatches(effect, sourceValue)) return false;
    if (effect?.when && !matchesWhenClause((effect as any).when, whenCtx as any)) return false;
    if (effectStopMatches(effect, whenCtx)) return false;
    switch ((effect.type || '').toString()) {
      case 'setValuesFromDataSource':
        if (effectRefreshesOnInit(effect)) return true;
        return !fieldHasHydratedDataSourceMappings(args.field, args.rowValues);
      case 'setValue': {
        const fieldId = normalizeString((effect as any)?.fieldId);
        if (!fieldId) return false;
        if (fieldId.startsWith('__ck')) return false;
        const expectedValue = resolveInitEffectValue((effect as any)?.value, args.rowValues, args.topValues);
        return !areEquivalentFieldValues(args.rowValues[fieldId], expectedValue);
      }
      case 'addLineItems':
        return resolveEffectTargetRows({
          question: args.question,
          rowId: args.rowId,
          effect,
          lineItems: args.lineItems
        }).length === 0;
      case 'deleteLineItems':
        return resolveEffectTargetRows({
          question: args.question,
          rowId: args.rowId,
          effect,
          lineItems: args.lineItems
        }).length > 0;
      case 'addLineItemsFromDataSource':
        if (isRecipeIngredientsDirty(args.rowValues)) return false;
        if (effectRefreshesOnInit(effect)) return true;
        return !effectTargetRowsAreHydrated({
          question: args.question,
          rowId: args.rowId,
          effect,
          lineItems: args.lineItems
        });
      default:
        return true;
    }
  });
};

const buildNestedGroupQuestion = (groupKey: string, subGroup: any, fallbackQuestion: WebQuestionDefinition): WebQuestionDefinition =>
  ({
    ...(fallbackQuestion as any),
    id: groupKey,
    lineItemConfig: {
      ...(subGroup as any),
      fields: (subGroup as any)?.fields || [],
      subGroups: (subGroup as any)?.subGroups || []
    }
  }) as WebQuestionDefinition;

const visitLineItemGroups = (args: {
  question: WebQuestionDefinition;
  lineItems: LineItemState;
  groupKey?: string;
  rows?: any[];
  visit: (entry: { question: WebQuestionDefinition; groupKey: string; rows: any[] }) => void;
}): void => {
  const groupKey = args.groupKey || args.question.id;
  const rows = Array.isArray(args.rows) ? args.rows : ((args.lineItems[groupKey] || []) as any[]);
  args.visit({ question: args.question, groupKey, rows });

  const subGroups = (((args.question as any)?.lineItemConfig?.subGroups || []) as any[]).filter(Boolean);
  if (!rows.length || !subGroups.length) return;

  rows.forEach(row => {
    const parentRowId = normalizeString((row as any)?.id);
    if (!parentRowId) return;

    subGroups.forEach(subGroup => {
      const subGroupId = resolveSubgroupKey(subGroup);
      if (!subGroupId) return;
      const subGroupKey = buildSubgroupKey(groupKey, parentRowId, subGroupId);
      visitLineItemGroups({
        question: buildNestedGroupQuestion(subGroupKey, subGroup, args.question),
        groupKey: subGroupKey,
        rows: (args.lineItems[subGroupKey] || []) as any[],
        lineItems: args.lineItems,
        visit: args.visit
      });
    });
  });
};

const resolveImmediateParentValues = (
  groupKey: string,
  lineItems: LineItemState
): Record<string, FieldValue> | undefined => {
  const parsed = parseSubgroupKey(groupKey);
  if (!parsed) return undefined;
  const parentRows = (lineItems[parsed.parentGroupKey] || []) as any[];
  const parentRow = parentRows.find(row => row?.id === parsed.parentRowId);
  return parentRow?.values || undefined;
};

const collectSelectionEffectTargetsForGroup = (
  group: WebQuestionDefinition,
  groupKey: string,
  rows: any[],
  lineItems: LineItemState,
  topValues: Record<string, FieldValue>
): SelectionEffectInitTarget[] => {
  const fieldsWithSelectionEffects = (((group as any)?.lineItemConfig?.fields || (group as any)?.fields || []) as any[]).filter(
    (field: any) =>
      shouldRunSelectionEffectsOnInit(field) &&
      (!fieldUsesSubgroupSeedInit(group, field) || fieldHasRefreshOnInitEffect(field)) &&
      Array.isArray(field?.selectionEffects) &&
      field.selectionEffects.length > 0
  );
  if (!fieldsWithSelectionEffects.length || !rows.length) return [];

  const targets: SelectionEffectInitTarget[] = [];
  const parentValues = resolveImmediateParentValues(groupKey, lineItems);
  rows.forEach(row => {
    const rowValues = row?.values || {};
    fieldsWithSelectionEffects.forEach((field: any) => {
      const rawValue = rowValues[field.id];
      if (!hasSelectionEffectInitialValue(rawValue)) return;
      if (
        !effectNeedsInit({
          question: group,
          rowId: row?.id || '',
          field,
          rowValues,
          parentValues,
          lineItems,
          topValues
        })
      ) {
        return;
      }
      targets.push({
        group,
        groupKey,
        rowId: row?.id || '',
        field,
        rawValue,
        signature: [groupKey, row?.id || '', field.id, toStableSignatureValue(rawValue)].join('::')
      });
    });
  });

  return targets;
};

export const collectSelectionEffectInitTargets = (
  question: WebQuestionDefinition,
  lineItems: LineItemState,
  topValues: Record<string, FieldValue> = {}
): SelectionEffectInitTarget[] => {
  const targets: SelectionEffectInitTarget[] = [];
  visitLineItemGroups({
    question,
    lineItems,
    visit: entry => {
      targets.push(
        ...collectSelectionEffectTargetsForGroup(entry.question, entry.groupKey, entry.rows, lineItems, topValues)
      );
    }
  });
  return targets;
};

export const collectSubgroupSeedInitTargets = (
  question: WebQuestionDefinition,
  lineItems: LineItemState
): SelectionEffectInitTarget[] => {
  const targets: SelectionEffectInitTarget[] = [];
  visitLineItemGroups({
    question,
    lineItems,
    visit: entry => {
      const currentRows = entry.rows;
      const fields = (((entry.question as any)?.lineItemConfig?.fields || []) as any[]).filter(
        (field: any) =>
          shouldRunSelectionEffectsOnInit(field) &&
          Array.isArray(field?.selectionEffects) &&
          field.selectionEffects.length > 0
      );
      const subGroups = (((entry.question as any)?.lineItemConfig?.subGroups || []) as any[]).filter(Boolean);
      if (!currentRows.length || !fields.length || !subGroups.length) return;

      currentRows.forEach(row => {
        const rowId = normalizeString((row as any)?.id);
        if (!rowId) return;
        const rowValues = (row?.values || {}) as Record<string, FieldValue>;

        fields.forEach((field: any) => {
          const rawValue = rowValues[field.id];
          if (!hasSelectionEffectInitialValue(rawValue)) return;
          const effects = (field.selectionEffects || []) as any[];
          effects.forEach((effect: any) => {
            if (effect?.type !== 'addLineItemsFromDataSource') return;
            if (effectRefreshesOnInit(effect)) return;
            const targetGroupId = normalizeString(effect?.groupId);
            if (!targetGroupId) return;
            const subGroup = subGroups.find((candidate: any) => resolveSubgroupKey(candidate) === targetGroupId);
            if (!subGroup) return;
            const subKey = buildSubgroupKey(entry.groupKey, rowId, targetGroupId);
            const subRows = (lineItems[subKey] || []) as any[];
            const hasHydratedSeedRows = subgroupHasHydratedSeedRows({
              effect,
              subGroup,
              subRows
            });
            if (hasHydratedSeedRows) return;
            targets.push({
              group: entry.question,
              groupKey: entry.groupKey,
              rowId,
              field,
              rawValue,
              signature: [
                entry.groupKey,
                rowId,
                field.id,
                'seedSubgroup',
                targetGroupId,
                toStableSignatureValue(rawValue),
                buildSeedStateSignature({ effect, subGroup, subRows })
              ].join('::')
            });
          });
        });
      });
    }
  });
  return targets;
};

export const collectComputedSelectionEffectInitTargets = (
  question: WebQuestionDefinition,
  lineItems: LineItemState,
  topValues: Record<string, FieldValue>
): SelectionEffectInitTarget[] => {
  const targets: SelectionEffectInitTarget[] = [];
  visitLineItemGroups({
    question,
    lineItems,
    visit: entry => {
      const currentRows = entry.rows;
      const parentValues = resolveImmediateParentValues(entry.groupKey, lineItems);
      const groupFields = (((entry.question as any)?.lineItemConfig?.fields || []) as any[]).filter(Boolean);
      const effectFields = groupFields.filter(
        (field: any) =>
          shouldRunSelectionEffectsOnInit(field) &&
          Array.isArray(field?.selectionEffects) &&
          field.selectionEffects.length > 0
      );
      if (!currentRows.length || !effectFields.length) return;

      currentRows.forEach(row => {
        const rowId = normalizeString((row as any)?.id);
        if (!rowId) return;
        const computedValues = applyValueMapsToLineRow(
          groupFields,
          (row?.values || {}) as Record<string, FieldValue>,
          topValues,
          { mode: 'change' },
          {
            groupKey: entry.groupKey,
            rowId,
            lineItems
          }
        );
        effectFields.forEach((field: any) => {
          const rawValue = (computedValues as Record<string, FieldValue>)[field.id];
          if (!hasSelectionEffectInitialValue(rawValue)) return;
          if (
            !effectNeedsInit({
              question: entry.question,
              rowId,
              field,
              rowValues: computedValues as Record<string, FieldValue>,
              parentValues,
              lineItems,
              topValues
            })
          ) {
            return;
          }
          targets.push({
            group: entry.question,
            groupKey: entry.groupKey,
            rowId,
            field,
            rawValue,
            signature: [entry.groupKey, rowId, field.id, 'computed', toStableSignatureValue(rawValue)].join('::')
          });
        });
      });
    }
  });
  return targets;
};
