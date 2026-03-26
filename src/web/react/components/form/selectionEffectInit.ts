import { FieldValue, WebQuestionDefinition } from '../../../types';
import {
  buildSubgroupKey,
  resolveSubgroupKey,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY,
  shouldPersistLineItemRows
} from '../../app/lineItems';
import { applyValueMapsToLineRow } from './valueMaps';
import { LineItemState } from '../../types';
import { isEmptyValue } from '../../utils/values';

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
  } catch (_) {
    return `${rawValue ?? ''}`;
  }
};

const normalizeString = (rawValue: unknown): string => {
  if (rawValue === undefined || rawValue === null) return '';
  try {
    return rawValue.toString().trim();
  } catch (_) {
    return '';
  }
};

const shouldRunSelectionEffectsOnInit = (field: any): boolean => field?.ui?.runSelectionEffectsOnInit !== false;

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

const buildEffectOwnedOutputSignature = (args: {
  question: WebQuestionDefinition;
  rowId: string;
  field: any;
  lineItems: LineItemState;
}): string => {
  const { question, rowId, field, lineItems } = args;
  const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
  const parts = effects
    .map((effect: any) => {
      if (!effect || (effect.type !== 'addLineItems' && effect.type !== 'deleteLineItems')) return '';
      const effectId =
        normalizeString((effect as any)?.targetEffectId) || normalizeString((effect as any)?.id);
      const targetKey = resolveEffectTargetGroupKey(
        question,
        rowId,
        (effect as any)?.targetPath ?? (effect as any)?.groupId
      );
      if (!effectId || !targetKey) return '';
      const rows = (lineItems[targetKey] || []) as any[];
      const matchingRows = rows.filter(row => {
        const values = (row?.values || {}) as Record<string, FieldValue>;
        const rowEffectId = normalizeString(values[ROW_SELECTION_EFFECT_ID_KEY]);
        if (rowEffectId !== effectId) return false;
        const parentGroupId = normalizeString(values[ROW_PARENT_GROUP_ID_KEY]) || normalizeString((row as any)?.parentGroupId);
        const parentRowId = normalizeString(values[ROW_PARENT_ROW_ID_KEY]) || normalizeString((row as any)?.parentId);
        if (!parentGroupId && !parentRowId) return true;
        return parentGroupId === question.id && parentRowId === rowId;
      });
      return `${targetKey}:${effectId}:${matchingRows.length}`;
    })
    .filter(Boolean);
  return parts.join('||');
};

const fieldHasEffectOwnedOutputRows = (args: {
  question: WebQuestionDefinition;
  rowId: string;
  field: any;
  lineItems: LineItemState;
}): boolean => {
  const signature = buildEffectOwnedOutputSignature(args);
  if (!signature) return false;
  return signature
    .split('||')
    .map(part => {
      const countText = part.split(':').pop() || '';
      const count = Number(countText);
      return Number.isFinite(count) ? count : 0;
    })
    .some(count => count > 0);
};

const collectSelectionEffectTargetsForGroup = (
  group: WebQuestionDefinition,
  groupKey: string,
  rows: any[],
  lineItems: LineItemState
): SelectionEffectInitTarget[] => {
  const fieldsWithSelectionEffects = (((group as any)?.lineItemConfig?.fields || (group as any)?.fields || []) as any[]).filter(
    (field: any) =>
      shouldRunSelectionEffectsOnInit(field) &&
      !fieldUsesSubgroupSeedInit(group, field) &&
      Array.isArray(field?.selectionEffects) &&
      field.selectionEffects.length > 0
  );
  if (!fieldsWithSelectionEffects.length || !rows.length) return [];

  const targets: SelectionEffectInitTarget[] = [];
  rows.forEach(row => {
    const rowValues = row?.values || {};
    fieldsWithSelectionEffects.forEach((field: any) => {
      const rawValue = rowValues[field.id];
      if (!hasSelectionEffectInitialValue(rawValue)) return;
      if (fieldHasHydratedDataSourceMappings(field, rowValues)) return;
      if (
        fieldHasEffectOwnedOutputRows({
          question: group,
          rowId: row?.id || '',
          field,
          lineItems
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
  lineItems: LineItemState
): SelectionEffectInitTarget[] => {
  const targets: SelectionEffectInitTarget[] = [];
  const currentRows = (lineItems[question.id] || []) as any[];

  targets.push(...collectSelectionEffectTargetsForGroup(question, question.id, currentRows, lineItems));

  const subGroups = ((question.lineItemConfig as any)?.subGroups || []) as any[];
  if (!currentRows.length || !subGroups.length) return targets;

  subGroups.forEach(sub => {
    const subId = resolveSubgroupKey(sub);
    if (!subId) return;
    currentRows.forEach(parentRow => {
      if (!parentRow?.id) return;
      const subKey = buildSubgroupKey(question.id, parentRow.id, subId);
      const subRows = (lineItems[subKey] || []) as any[];
      if (!subRows.length) return;
      const subGroupQuestion: WebQuestionDefinition = {
        ...(question as any),
        id: subKey,
        lineItemConfig: {
          ...(sub as any),
          fields: (sub as any)?.fields || [],
          subGroups: (sub as any)?.subGroups || []
        }
      } as WebQuestionDefinition;
      targets.push(...collectSelectionEffectTargetsForGroup(subGroupQuestion, subKey, subRows, lineItems));
    });
  });

  return targets;
};

export const collectSubgroupSeedInitTargets = (
  question: WebQuestionDefinition,
  lineItems: LineItemState
): SelectionEffectInitTarget[] => {
  const targets: SelectionEffectInitTarget[] = [];
  const currentRows = (lineItems[question.id] || []) as any[];
  const rootFields = (((question as any)?.lineItemConfig?.fields || []) as any[]).filter(
    (field: any) =>
      shouldRunSelectionEffectsOnInit(field) &&
      Array.isArray(field?.selectionEffects) &&
      field.selectionEffects.length > 0
  );
  const subGroups = (((question as any)?.lineItemConfig?.subGroups || []) as any[]).filter(Boolean);
  if (!currentRows.length || !rootFields.length || !subGroups.length) return targets;

  currentRows.forEach(row => {
    const rowValues = (row?.values || {}) as Record<string, FieldValue>;
    rootFields.forEach((field: any) => {
      const rawValue = rowValues[field.id];
      if (!hasSelectionEffectInitialValue(rawValue)) return;
      const effects = (field.selectionEffects || []) as any[];
      effects.forEach((effect: any) => {
        if (effect?.type !== 'addLineItemsFromDataSource') return;
        const rawTargetGroupId = effect?.groupId;
        const targetGroupId = rawTargetGroupId === undefined || rawTargetGroupId === null
          ? ''
          : rawTargetGroupId.toString().trim();
        if (!targetGroupId) return;
        const subGroup = subGroups.find((candidate: any) => resolveSubgroupKey(candidate) === targetGroupId);
        if (!subGroup || !row?.id) return;
        const subKey = buildSubgroupKey(question.id, row.id, targetGroupId);
        const subRows = (lineItems[subKey] || []) as any[];
        const hasHydratedSeedRows = subgroupHasHydratedSeedRows({
          effect,
          subGroup,
          subRows
        });
        if (hasHydratedSeedRows) return;
        targets.push({
          group: question,
          groupKey: question.id,
          rowId: row?.id || '',
          field,
          rawValue,
          signature: [
            question.id,
            row?.id || '',
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

  return targets;
};

export const collectComputedSelectionEffectInitTargets = (
  question: WebQuestionDefinition,
  lineItems: LineItemState,
  topValues: Record<string, FieldValue>
): SelectionEffectInitTarget[] => {
  const targets: SelectionEffectInitTarget[] = [];
  const currentRows = (lineItems[question.id] || []) as any[];
  const groupFields = (((question as any)?.lineItemConfig?.fields || []) as any[]).filter(Boolean);
  const effectFields = groupFields.filter(
    (field: any) =>
      shouldRunSelectionEffectsOnInit(field) &&
      Array.isArray(field?.selectionEffects) &&
      field.selectionEffects.length > 0
  );
  if (!currentRows.length || !effectFields.length) return targets;

  currentRows.forEach(row => {
    const computedValues = applyValueMapsToLineRow(groupFields, (row?.values || {}) as Record<string, FieldValue>, topValues, { mode: 'change' }, {
      groupKey: question.id,
      rowId: row?.id || '',
      lineItems
    });
    effectFields.forEach((field: any) => {
      const rawValue = (computedValues as Record<string, FieldValue>)[field.id];
      if (!hasSelectionEffectInitialValue(rawValue)) return;
      if (
        fieldHasEffectOwnedOutputRows({
          question,
          rowId: row?.id || '',
          field,
          lineItems
        })
      ) {
        return;
      }
      targets.push({
        group: question,
        groupKey: question.id,
        rowId: row?.id || '',
        field,
        rawValue,
        signature: [question.id, row?.id || '', field.id, 'computed', toStableSignatureValue(rawValue)].join('::')
      });
    });
  });

  return targets;
};
