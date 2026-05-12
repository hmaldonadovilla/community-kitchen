import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { FieldValue, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import type { FormErrors, LineItemState, OptionState } from '../../../types';
import { applyClearOnChange, isClearOnChangeEnabled } from '../../../app/clearOnChange';
import { reconcileAutoAddModeGroups, reconcileAutoAddModeSubgroups } from '../../../app/autoAddModeOverlay';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import {
  buildLineContextId,
  findLineItemDedupConflict,
  normalizeLineItemDedupRules,
  parseRowNonMatchOptions,
  parseSubgroupKey,
  ROW_NON_MATCH_OPTIONS_KEY
} from '../../../app/lineItems';
import { isIngredientNameFieldId, normalizeIngredientNameIfAllCaps } from '../../../app/ingredientsCreateRules';
import { clearSelectionEffectSourceMetadata } from '../../../app/selectionEffectSourceMetadata';
import { selectionEffectDependsOnField } from '../../../app/selectionEffectDependencies';
import { applyExclusiveLineSelection } from '../../../app/exclusiveLineSelection';
import { markRecipeIngredientsDirtyForGroupKey } from '../../../app/recipeIngredientsDirty';
import { isEmptyValue } from '../../../utils/values';
import {
  areFieldValuesEqual,
  hasSelectionEffects,
  resolveLineItemDedupMessage,
  resolveLineItemDedupValueToken
} from '../../lineItems/domain/formViewHelpers';
import { isLineItemDedupErrorMessage } from '../../lineItems/domain/lineItemDedupErrors';

type UserEditResult = { deferMutation?: boolean; skipSelectionEffects?: boolean };

type SelectionEffectHandler = (
  q: WebQuestionDefinition,
  value: FieldValue,
  opts?: {
    lineItem?: { groupId: string; rowId: string; rowValues: any };
    contextId?: string;
    forceContextReset?: boolean;
    preferLookupSourceValue?: boolean;
    snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState };
  }
) => void;

type OrderedEntryBlock = { missingFieldPath: string } | null | undefined;

interface UseFormFieldChangeHandlersArgs {
  definition: WebFormDefinition;
  language: LangCode;
  submitting: boolean;
  ingredientNameTransformEnabled: boolean;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  guidedLastUserEditAtRef: MutableRefObject<number>;
  clearOnChangeOrderedFieldIds: string[];
  optionState: OptionState;
  subgroupSelectors: Record<string, string>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setErrors: Dispatch<SetStateAction<FormErrors>>;
  isFieldLockedByDedup: (fieldId: string) => boolean;
  resolveOrderedEntryBlock: (target: any, group?: WebQuestionDefinition) => OrderedEntryBlock;
  blurActiveElement: (reason: string, meta?: Record<string, unknown>) => void;
  triggerOrderedEntryValidation: (
    target: any,
    missingFieldPath: string,
    opts?: { source?: string }
  ) => void;
  clearOverlayOpenActionSuppression: (key: string) => void;
  ensureLineOptions: (groupId: string, field: any) => void;
  attemptOverlayDetailAutoOpen: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    rowValues: Record<string, FieldValue>;
    nextValues: Record<string, FieldValue>;
    nextLineItems: LineItemState;
    triggerFieldId?: string;
    source: 'change' | 'blur';
  }) => void;
  computeRowNonMatchKeys: (args: { group: WebQuestionDefinition; rowValues: Record<string, FieldValue> }) => string[];
  runSelectionEffectsForAncestorRows: (
    sourceGroupKey: string,
    prevLineItems: LineItemState,
    nextLineItems: LineItemState,
    options?: { mode?: 'init' | 'change' | 'blur'; topValues?: Record<string, FieldValue> }
  ) => void;
  onStatusClear?: () => void;
  onUserEdit?: (args: {
    scope: 'top' | 'line';
    fieldPath: string;
    fieldId?: string;
    groupId?: string;
    rowId?: string;
    event?: 'change' | 'blur';
    tag?: string;
    inputType?: string;
    nextValue?: FieldValue;
  }) => UserEditResult | void;
  onAutomatedMutation?: (args: {
    scope: 'line';
    fieldPath: string;
    fieldId?: string;
    groupId?: string;
    rowId?: string;
    source: 'selectionEffectInit';
    nextValue?: FieldValue;
  }) => void;
  onSelectionEffect?: SelectionEffectHandler;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}

export function useFormFieldChangeHandlers({
  definition,
  language,
  submitting,
  ingredientNameTransformEnabled,
  valuesRef,
  lineItemsRef,
  guidedLastUserEditAtRef,
  clearOnChangeOrderedFieldIds,
  optionState,
  subgroupSelectors,
  setValues,
  setLineItems,
  setErrors,
  isFieldLockedByDedup,
  resolveOrderedEntryBlock,
  blurActiveElement,
  triggerOrderedEntryValidation,
  clearOverlayOpenActionSuppression,
  ensureLineOptions,
  attemptOverlayDetailAutoOpen,
  computeRowNonMatchKeys,
  runSelectionEffectsForAncestorRows,
  onStatusClear,
  onUserEdit,
  onAutomatedMutation,
  onSelectionEffect,
  onDiagnostic
}: UseFormFieldChangeHandlersArgs) {
  const handleFieldChange = (q: WebQuestionDefinition, value: FieldValue) => {
    if (submitting) return;
    if (q.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'readOnly' });
      return;
    }
    if (isFieldLockedByDedup(q.id)) {
      onDiagnostic?.('field.change.blocked', { scope: 'top', fieldId: q.id, reason: 'fieldDisableRule' });
      return;
    }
    const orderedBlock = resolveOrderedEntryBlock({ scope: 'top', questionId: q.id });
    if (orderedBlock) {
      blurActiveElement('orderedEntry.blocked', { scope: 'top', fieldId: q.id });
      triggerOrderedEntryValidation({ scope: 'top', questionId: q.id }, orderedBlock.missingFieldPath, {
        source: 'change'
      });
      return;
    }
    const nextValue =
      ingredientNameTransformEnabled && isIngredientNameFieldId(q.id) && typeof value === 'string'
        ? normalizeIngredientNameIfAllCaps(value)
        : value;
    guidedLastUserEditAtRef.current = Date.now();
    const userEditResult = onUserEdit?.({ scope: 'top', fieldPath: q.id, fieldId: q.id, event: 'change', nextValue });
    clearOverlayOpenActionSuppression(q.id);
    if (onStatusClear) onStatusClear();
    if (userEditResult?.deferMutation) return;
    const currentValues = valuesRef.current;
    const currentLineItems = lineItemsRef.current;
    if (
      isClearOnChangeEnabled((q as any).clearOnChange) &&
      !isEmptyValue(currentValues[q.id]) &&
      !isEmptyValue(nextValue) &&
      !areFieldValuesEqual(currentValues[q.id], nextValue)
    ) {
      const cleared = applyClearOnChange({
        definition,
        values: currentValues,
        lineItems: currentLineItems,
        fieldId: q.id,
        nextValue,
        orderedFieldIds: clearOnChangeOrderedFieldIds
      });
      let nextValuesAfterClear = cleared.values;
      let nextLineItemsAfterClear = cleared.lineItems;
      const reconciledGroups = reconcileAutoAddModeGroups({
        definition,
        values: nextValuesAfterClear,
        lineItems: nextLineItemsAfterClear,
        optionState,
        language,
        ensureLineOptions
      });
      if (reconciledGroups.changed) {
        nextValuesAfterClear = reconciledGroups.values;
        nextLineItemsAfterClear = reconciledGroups.lineItems;
      }
      const reconciledSubgroups = reconcileAutoAddModeSubgroups({
        definition,
        values: nextValuesAfterClear,
        lineItems: nextLineItemsAfterClear,
        optionState,
        language,
        subgroupSelectors,
        ensureLineOptions
      });
      if (reconciledSubgroups.changed) {
        nextValuesAfterClear = reconciledSubgroups.values;
        nextLineItemsAfterClear = reconciledSubgroups.lineItems;
      }
      onDiagnostic?.('field.clearOnChange', {
        fieldId: q.id,
        clearedFieldCount: cleared.clearedFieldIds.length,
        clearedGroupCount: cleared.clearedGroupKeys.length,
        autoAddGroupRebuilds: reconciledGroups.changedCount,
        autoAddSubgroupRebuilds: reconciledSubgroups.changedCount
      });
      setValues(nextValuesAfterClear);
      setLineItems(nextLineItemsAfterClear);
      valuesRef.current = nextValuesAfterClear;
      lineItemsRef.current = nextLineItemsAfterClear;
      setErrors({});
      if (onSelectionEffect) {
        onSelectionEffect(q, nextValue, {
          snapshots: {
            values: nextValuesAfterClear,
            lineItems: nextLineItemsAfterClear
          }
        });
      }
      return;
    }
    const baseValues = { ...currentValues, [q.id]: nextValue };
    const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(
      definition,
      baseValues,
      currentLineItems,
      {
        mode: 'change',
        lockedTopFields: [q.id]
      }
    );
    setValues(nextValues);
    if (nextLineItems !== currentLineItems) {
      setLineItems(nextLineItems);
    }
    valuesRef.current = nextValues;
    lineItemsRef.current = nextLineItems;
    setErrors(prev => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    if (onSelectionEffect) {
      onSelectionEffect(q, nextValue, {
        snapshots: {
          values: nextValues,
          lineItems: nextLineItems
        }
      });
    }
  };

  const handleLineFieldChange = (
    group: WebQuestionDefinition,
    rowId: string,
    field: any,
    value: FieldValue,
    options?: { source?: 'user' | 'selectionEffectInit' }
  ) => {
    if (submitting) return;
    const changeSource = options?.source === 'selectionEffectInit' ? 'selectionEffectInit' : 'user';
    if (field?.readOnly === true) {
      onDiagnostic?.('field.change.blocked', { scope: 'line', fieldPath: `${group.id}__${field?.id || ''}__${rowId}`, reason: 'readOnly' });
      return;
    }
    if (isFieldLockedByDedup((field?.id || '').toString())) {
      onDiagnostic?.('field.change.blocked', {
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        reason: 'fieldDisableRule'
      });
      return;
    }
    const orderedBlock = resolveOrderedEntryBlock(
      {
        scope: 'line',
        groupId: group.id,
        rowId,
        fieldId: (field?.id || '').toString()
      },
      group
    );
    if (orderedBlock && changeSource !== 'selectionEffectInit') {
      blurActiveElement('orderedEntry.blocked', {
        scope: 'line',
        groupId: group.id,
        fieldId: (field?.id || '').toString(),
        rowId
      });
      triggerOrderedEntryValidation(
        {
          scope: 'line',
          groupId: group.id,
          rowId,
          fieldId: (field?.id || '').toString()
        },
        orderedBlock.missingFieldPath,
        { source: 'change' }
      );
      return;
    }
    let userEditResult: UserEditResult | void = undefined;
    if (changeSource === 'selectionEffectInit') {
      onAutomatedMutation?.({
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        fieldId: (field?.id || '').toString(),
        groupId: group.id,
        rowId,
        source: 'selectionEffectInit',
        nextValue: value
      });
    } else {
      guidedLastUserEditAtRef.current = Date.now();
      userEditResult = onUserEdit?.({
        scope: 'line',
        fieldPath: `${group.id}__${field?.id || ''}__${rowId}`,
        fieldId: (field?.id || '').toString(),
        groupId: group.id,
        rowId,
        event: 'change',
        nextValue: value
      });
    }
    clearOverlayOpenActionSuppression(`${group.id}__${field?.id || ''}__${rowId}`);
    if (onStatusClear) onStatusClear();
    if (userEditResult?.deferMutation) return;
    const skipSelectionEffects = userEditResult?.skipSelectionEffects === true;
    const currentLineItems = lineItemsRef.current;
    const currentValues = valuesRef.current;
    const existingRows = currentLineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    let nextRowValues: Record<string, FieldValue> = { ...(currentRow?.values || {}), [field.id]: value };
    if (changeSource !== 'selectionEffectInit') {
      nextRowValues = clearSelectionEffectSourceMetadata(nextRowValues, field, (field?.id || '').toString());
    }
    const dedupRules = normalizeLineItemDedupRules((group.lineItemConfig as any)?.dedupRules);
    const dedupRuleMessages = dedupRules
      .map(rule => {
        const fieldId = (rule.fields || []).map(fid => (fid ?? '').toString().trim()).filter(Boolean)[0];
        if (!fieldId) return null;
        const valueToken = resolveLineItemDedupValueToken(nextRowValues, fieldId);
        return {
          fieldId,
          message: resolveLineItemDedupMessage(rule, language, valueToken ? { value: valueToken } : undefined),
          fields: rule.fields
        };
      })
      .filter(Boolean) as Array<{ fieldId: string; message: string; fields: string[] }>;
    const dedupConflict = findLineItemDedupConflict({
      rules: dedupRules,
      rows: existingRows,
      rowValues: nextRowValues,
      excludeRowId: rowId
    });
    if (dedupConflict) {
      const conflictFieldId = dedupConflict.fields[0];
      const valueToken = resolveLineItemDedupValueToken(nextRowValues, conflictFieldId);
      const conflictMessage = resolveLineItemDedupMessage(
        dedupConflict.rule,
        language,
        valueToken ? { value: valueToken } : undefined
      );
      const conflictPath = `${group.id}__${conflictFieldId}__${rowId}`;
      setErrors(prev => {
        const next = { ...prev };
        dedupRuleMessages.forEach(entry => {
          const key = `${group.id}__${entry.fieldId}__${rowId}`;
          if (isLineItemDedupErrorMessage({ rules: dedupRules, language, message: next[key] })) delete next[key];
        });
        next[conflictPath] = conflictMessage;
        return next;
      });
      onDiagnostic?.('lineItems.dedup.blocked', {
        groupId: group.id,
        rowId,
        fields: dedupConflict.fields,
        matchRowId: dedupConflict.matchRow.id
      });
      return;
    }
    const nonMatchKeys = computeRowNonMatchKeys({ group, rowValues: nextRowValues });
    const existingNonMatchKeys = parseRowNonMatchOptions((currentRow?.values as any)?.[ROW_NON_MATCH_OPTIONS_KEY]);
    const nonMatchSame =
      nonMatchKeys.length === existingNonMatchKeys.length &&
      nonMatchKeys.every((val, idx) => val === existingNonMatchKeys[idx]);
    if (nonMatchKeys.length) {
      nextRowValues[ROW_NON_MATCH_OPTIONS_KEY] = nonMatchKeys;
      if (!nonMatchSame) {
        onDiagnostic?.('optionFilter.nonMatch.update', {
          groupId: group.id,
          rowId,
          fieldId: (field?.id || '').toString(),
          keys: nonMatchKeys
        });
      }
    } else {
      delete nextRowValues[ROW_NON_MATCH_OPTIONS_KEY];
    }
    const nextRows = existingRows.map(row =>
      row.id === rowId ? { ...row, values: nextRowValues } : row
    );
    let updatedLineItems: LineItemState = { ...currentLineItems, [group.id]: nextRows };
    updatedLineItems = applyExclusiveLineSelection({
      lineItems: updatedLineItems,
      groupKey: group.id,
      rowId,
      fieldId: (field?.id || '').toString(),
      value,
      rowValues: nextRowValues,
      config: (field as any)?.ui?.exclusiveLineSelection
    });
    if (changeSource !== 'selectionEffectInit') {
      const marked = markRecipeIngredientsDirtyForGroupKey(updatedLineItems, group.id);
      if (marked.changed) {
        updatedLineItems = marked.lineItems;
        onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
          groupId: group.id,
          parentGroupKey: marked.parentGroupKey || null,
          parentRowId: marked.parentRowId || null,
          reason: 'fieldChange',
          fieldId: (field?.id || '').toString()
        });
      }
    }
    const { values: nextValues, lineItems: finalLineItems } = applyValueMapsToForm(
      definition,
      currentValues,
      updatedLineItems,
      {
        mode: 'change'
      }
    );
    const syncedLineItems = finalLineItems;
    setLineItems(syncedLineItems);
    setValues(nextValues);
    valuesRef.current = nextValues;
    lineItemsRef.current = syncedLineItems;
    const updatedRow = (syncedLineItems[group.id] || []).find(r => r.id === rowId);
    const updatedRowValues = ((updatedRow?.values || nextRowValues) as Record<string, FieldValue>) || nextRowValues;
    attemptOverlayDetailAutoOpen({
      group,
      rowId,
      rowValues: updatedRowValues,
      nextValues,
      nextLineItems: syncedLineItems,
      triggerFieldId: (field?.id || '').toString(),
      source: 'change'
    });
    setErrors(prev => {
      const next = { ...prev };
      delete next[group.id];
      delete next[`${group.id}__${field.id}__${rowId}`];
      dedupRuleMessages.forEach(entry => {
        const key = `${group.id}__${entry.fieldId}__${rowId}`;
        if (isLineItemDedupErrorMessage({ rules: dedupRules, language, message: next[key] })) delete next[key];
      });
      return next;
    });
    if (onSelectionEffect && !skipSelectionEffects) {
      const selectionEffectRowValues = (() => {
        const merged: Record<string, FieldValue> = { ...updatedRowValues };
        const mergeMissing = (source?: Record<string, FieldValue>) => {
          if (!source) return;
          Object.entries(source).forEach(([key, val]) => {
            if (Object.prototype.hasOwnProperty.call(merged, key)) return;
            merged[key] = val;
          });
        };
        let currentKey = group.id;
        let info = parseSubgroupKey(currentKey);
        while (info) {
          const currentInfo = info;
          const parentRows = syncedLineItems[currentInfo.parentGroupKey] || [];
          const parentRow = parentRows.find(r => r.id === currentInfo.parentRowId);
          mergeMissing((parentRow?.values || {}) as Record<string, FieldValue>);
          currentKey = currentInfo.parentGroupKey;
          info = parseSubgroupKey(currentKey);
        }
        return merged;
      })();
      const effectFields = (group.lineItemConfig?.fields || []).filter(hasSelectionEffects);
      if (effectFields.length) {
        effectFields.forEach(effectField => {
          const isSourceField = effectField.id === field.id;
          const dependsOnChangedField = !isSourceField && selectionEffectDependsOnField(effectField, field.id);
          if (!isSourceField && !dependsOnChangedField) {
            return;
          }
          const contextId = buildLineContextId(group.id, rowId, effectField.id);
          const currentValue = updatedRowValues[effectField.id] as FieldValue;
          const effectQuestion = effectField as unknown as WebQuestionDefinition;
          if (!isSourceField && dependsOnChangedField) {
            onSelectionEffect(effectQuestion, currentValue ?? null, {
              contextId,
              lineItem: { groupId: group.id, rowId, rowValues: selectionEffectRowValues },
              forceContextReset: true,
              ...(changeSource === 'selectionEffectInit' ? { preferLookupSourceValue: true } : {}),
              snapshots: {
                values: nextValues,
                lineItems: syncedLineItems
              }
            });
            return;
          }
          const isClearingSource = isSourceField && isEmptyValue(value as FieldValue);
          const payloadValue = isSourceField
            ? isClearingSource
              ? null
              : currentValue ?? null
            : currentValue ?? null;
          onSelectionEffect(effectQuestion, payloadValue, {
            contextId,
            lineItem: { groupId: group.id, rowId, rowValues: selectionEffectRowValues },
            forceContextReset: true,
            ...(changeSource === 'selectionEffectInit' ? { preferLookupSourceValue: true } : {}),
            snapshots: {
              values: nextValues,
              lineItems: syncedLineItems
            }
          });
        });
      }

      runSelectionEffectsForAncestorRows(group.id, currentLineItems, syncedLineItems, { mode: 'change', topValues: nextValues });
    } else if (skipSelectionEffects) {
      onDiagnostic?.('field.change.selectionEffects.held', {
        scope: 'line',
        groupId: group.id,
        rowId,
        fieldId: (field?.id || '').toString(),
        reason: 'fieldChangeDialog.number.pending'
      });
    }
  };

  return {
    handleFieldChange,
    handleLineFieldChange
  };
}
