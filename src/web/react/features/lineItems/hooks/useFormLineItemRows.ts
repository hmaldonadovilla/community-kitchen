import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';

import { toDependencyValue } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemRowState, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import type { LineItemAddResult, LineItemState, OptionState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import { applyValueMapsToForm, coerceDefaultValue } from '../../../app/valueMaps';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import {
  cascadeRemoveLineItemRows,
  findLineItemDedupConflict,
  isLineItemMaxRowsReached,
  normalizeLineItemDedupRules,
  parseRowSource,
  parseSubgroupKey,
  resolveLineItemRemoveGuard,
  resolveLineItemRowLimits,
  ROW_NON_MATCH_OPTIONS_KEY,
  ROW_SOURCE_KEY,
  seedSubgroupDefaults,
  shouldBlockLineItemRowRemoval
} from '../../../app/lineItems';
import { markRecipeIngredientsDirtyForGroupKey } from '../../../app/recipeIngredientsDirty';
import {
  reconcileOverlayAutoAddModeGroups,
  reconcileOverlayAutoAddModeSubgroups
} from '../../../app/autoAddModeOverlay';
import {
  resolveLineItemDedupMessage,
  resolveLineItemDedupValueToken
} from '../domain/formViewHelpers';

interface UseFormLineItemRowsArgs {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  language: LangCode;
  submitting: boolean;
  subgroupSelectors: Record<string, string>;
  lineItemGroupOverlay: any;
  subgroupOverlay: any;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setCollapsedSubgroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPendingScrollAnchor: Dispatch<SetStateAction<string | null>>;
  setSubgroupSelectors: Dispatch<SetStateAction<Record<string, string>>>;
  ensureLineOptions: (groupId: string, field: any) => void;
  openConfirmDialog?: (config: any) => void;
  onSelectionEffect?: (
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
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  computeRowNonMatchKeys: (args: {
    group: WebQuestionDefinition;
    rowValues: Record<string, FieldValue>;
    lineItemsSnapshot: LineItemState;
    valuesSnapshot: Record<string, FieldValue>;
    subgroupSelectorsSnapshot: Record<string, string>;
  }) => string[];
  matchesOverlayRowFilter: (rowValues: Record<string, FieldValue>, filter?: any) => boolean;
  resolveSubgroupDefs: (groupKey: string) => any;
  clearSelectionEffectsForRow: (groupQuestion: WebQuestionDefinition, row: LineItemRowState) => void;
  runSelectionEffectsForAncestorRows: (
    groupId: string,
    prevLineItems: LineItemState,
    nextLineItems: LineItemState,
    options: { mode: 'init' | 'change'; topValues: Record<string, FieldValue> }
  ) => void;
}

const sanitizePreset = (input?: Record<string, any>): Record<string, any> => {
  if (!input) return {};
  const next: Record<string, any> = { ...input };
  Object.keys(next).forEach(key => {
    const v = next[key];
    if (Array.isArray(v)) {
      next[key] = v[0];
    }
  });
  return next;
};

export function useFormLineItemRows({
  definition,
  values,
  lineItems,
  optionState,
  language,
  submitting,
  subgroupSelectors,
  lineItemGroupOverlay,
  subgroupOverlay,
  setValues,
  setLineItems,
  setCollapsedSubgroups,
  setPendingScrollAnchor,
  setSubgroupSelectors,
  ensureLineOptions,
  openConfirmDialog,
  onSelectionEffect,
  onDiagnostic,
  computeRowNonMatchKeys,
  matchesOverlayRowFilter,
  resolveSubgroupDefs,
  clearSelectionEffectsForRow,
  runSelectionEffectsForAncestorRows
}: UseFormLineItemRowsArgs) {
  const addLineItemRow = useCallback(
    (
      groupId: string,
      preset?: Record<string, any>,
      rowIdOverride?: string,
      options?: { configOverride?: any }
    ) => {
      const applyLineDefaults = (fields: any[], rowValues: Record<string, FieldValue>): Record<string, FieldValue> => {
        if (!Array.isArray(fields) || !fields.length) return rowValues;
        const nextValues = { ...rowValues };
        fields.forEach(field => {
          if (!field || field.defaultValue === undefined) return;
          if (Object.prototype.hasOwnProperty.call(nextValues, field.id)) return;
          const hasAnyOption = Array.isArray(field.options)
            ? field.options.length > 0
            : !!(field.optionsEn?.length || field.optionsFr?.length || field.optionsNl?.length);
          const coerced = coerceDefaultValue({
            type: (field.type || '').toString(),
            raw: field.defaultValue,
            hasAnyOption,
            hasDataSource: !!field.dataSource
          });
          if (coerced !== undefined) {
            nextValues[field.id] = coerced;
          }
        });
        return nextValues;
      };

      setLineItems(prev => {
        const subgroupInfo = parseSubgroupKey(groupId);
        const subgroupDefs = subgroupInfo ? resolveSubgroupDefs(groupId) : null;
        const groupDef = subgroupInfo ? undefined : definition.questions.find(q => q.id === groupId);
        const rootDef = subgroupInfo ? subgroupDefs?.root : undefined;
        const subDef = subgroupInfo ? subgroupDefs?.sub : undefined;
        const baseConfig = subgroupInfo ? subDef : groupDef?.lineItemConfig;
        const effectiveConfig = options?.configOverride || baseConfig;
        const current = prev[groupId] || [];

        let selectorId: string | undefined;
        let selectorValue: FieldValue | undefined;
        if (subgroupInfo) {
          selectorId = effectiveConfig?.sectionSelector?.id;
          selectorValue = subgroupSelectors[groupId];
        } else {
          selectorId = effectiveConfig?.sectionSelector?.id;
          selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
        }

        const rowValuesBase: Record<string, FieldValue> = sanitizePreset(preset);
        if (selectorId && selectorValue !== undefined && selectorValue !== null && rowValuesBase[selectorId] === undefined) {
          rowValuesBase[selectorId] = selectorValue;
        }
        const rowValues = applyLineDefaults(effectiveConfig?.fields || [], rowValuesBase);
        const rowIdPrefix = subgroupInfo?.subGroupId || groupId;
        const rowId = rowIdOverride || `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`;
        const baseGroupForNonMatch: WebQuestionDefinition | undefined = subgroupInfo
          ? effectiveConfig
            ? ({
                ...(rootDef as any),
                id: groupId,
                lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [], subGroups: [] }
              } as WebQuestionDefinition)
            : undefined
          : groupDef;
        const groupForNonMatch: WebQuestionDefinition | undefined =
          !subgroupInfo && effectiveConfig && groupDef
            ? ({
                ...(groupDef as any),
                lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [] }
              } as WebQuestionDefinition)
            : baseGroupForNonMatch;
        if (groupForNonMatch?.lineItemConfig?.fields?.length) {
          const nonMatchKeys = computeRowNonMatchKeys({
            group: groupForNonMatch,
            rowValues,
            lineItemsSnapshot: prev,
            valuesSnapshot: values,
            subgroupSelectorsSnapshot: subgroupSelectors
          });
          if (nonMatchKeys.length) {
            rowValues[ROW_NON_MATCH_OPTIONS_KEY] = nonMatchKeys;
            onDiagnostic?.('optionFilter.nonMatch.seed', { groupId, rowId, keys: nonMatchKeys });
          } else {
            delete rowValues[ROW_NON_MATCH_OPTIONS_KEY];
          }
        }
        const row: LineItemRowState = {
          id: rowId,
          values: rowValues,
          parentId: subgroupInfo?.parentRowId,
          parentGroupId: subgroupInfo?.parentGroupKey
        };
        let nextWithRow: LineItemState = { ...prev, [groupId]: [row, ...current] };
        if (subgroupInfo?.subGroupId === 'MP_INGREDIENTS_LI') {
          const source = parseRowSource((rowValues as any)?.[ROW_SOURCE_KEY]);
          if (source === 'manual') {
            const marked = markRecipeIngredientsDirtyForGroupKey(nextWithRow, groupId);
            if (marked.changed) {
              nextWithRow = marked.lineItems;
              onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
                groupId,
                parentGroupKey: marked.parentGroupKey || null,
                parentRowId: marked.parentRowId || null,
                reason: 'rowAdded'
              });
            }
          }
        }
        const groupDefForDefaults =
          !subgroupInfo && groupDef && effectiveConfig
            ? ({
                ...(groupDef as any),
                lineItemConfig: {
                  ...(effectiveConfig as any),
                  fields: effectiveConfig.fields || [],
                  subGroups: effectiveConfig.subGroups || []
                }
              } as WebQuestionDefinition)
            : groupDef;
        const nextLineItems = groupDefForDefaults ? seedSubgroupDefaults(nextWithRow, groupDefForDefaults, row.id) : nextWithRow;
        const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
          mode: 'init'
        });
        setValues(nextValues);
        return recomputed;
      });
    },
    [computeRowNonMatchKeys, definition, onDiagnostic, resolveSubgroupDefs, setLineItems, setValues, subgroupSelectors, values]
  );

  const addLineItemRowManual = (
    groupId: string,
    preset?: Record<string, any>,
    options?: {
      configOverride?: any;
      rowFilter?: { includeWhen?: any; excludeWhen?: any } | null;
    }
  ): LineItemAddResult | undefined => {
    const isEmptySelectorValue = (value: FieldValue | undefined): boolean => {
      if (value === undefined || value === null) return true;
      if (Array.isArray(value)) return value.length === 0;
      return value.toString().trim() === '';
    };

    const subgroupInfo = parseSubgroupKey(groupId);
    const subgroupDefs = subgroupInfo ? resolveSubgroupDefs(groupId) : null;
    const parentDef = subgroupInfo ? subgroupDefs?.parent : undefined;
    const subDef = subgroupInfo ? subgroupDefs?.sub : undefined;
    const groupDef = subgroupInfo ? undefined : definition.questions.find(q => q.id === groupId);
    const rowFilter = options?.rowFilter || null;
    const baseConfig = subgroupInfo ? subDef : groupDef?.lineItemConfig;
    const effectiveConfig = options?.configOverride || baseConfig;
    const { maxRows: maxRowsLimit } = resolveLineItemRowLimits(effectiveConfig as any);
    const currentRows = lineItems[groupId] || [];
    const currentCount = rowFilter
      ? currentRows.filter(row => matchesOverlayRowFilter(((row as any)?.values || {}) as any, rowFilter)).length
      : currentRows.length;
    if (isLineItemMaxRowsReached(currentCount, maxRowsLimit)) {
      onDiagnostic?.('ui.addRow.blocked', {
        groupId,
        scope: subgroupInfo ? 'sub' : 'line',
        reason: 'maxRows',
        maxRows: maxRowsLimit,
        currentCount
      });
      return { status: 'blocked' };
    }

    let addMode: any;
    let selectorCfg: any;
    let selectorId: string | undefined;
    let selectorValue: FieldValue | undefined;
    let anchorFieldId: string | undefined;
    if (subgroupInfo) {
      addMode = (effectiveConfig as any)?.addMode;
      selectorCfg = (effectiveConfig as any)?.sectionSelector;
      selectorId = selectorCfg?.id;
      selectorValue = selectorId ? ((subgroupSelectors[groupId] as any) as FieldValue) : undefined;
      anchorFieldId =
        (effectiveConfig as any)?.anchorFieldId !== undefined && (effectiveConfig as any)?.anchorFieldId !== null
          ? (effectiveConfig as any).anchorFieldId.toString()
          : undefined;
    } else {
      addMode = (effectiveConfig as any)?.addMode;
      selectorCfg = (effectiveConfig as any)?.sectionSelector;
      selectorId = selectorCfg?.id;
      selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
      anchorFieldId =
        (effectiveConfig as any)?.anchorFieldId !== undefined && (effectiveConfig as any)?.anchorFieldId !== null
          ? (effectiveConfig as any).anchorFieldId.toString()
          : undefined;
    }
    const baseGroupForNonMatch: WebQuestionDefinition | undefined = subgroupInfo
      ? effectiveConfig
        ? ({
            ...(parentDef as any),
            id: groupId,
            lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [], subGroups: [] }
          } as WebQuestionDefinition)
        : undefined
      : groupDef;
    const groupForNonMatch: WebQuestionDefinition | undefined =
      !subgroupInfo && effectiveConfig && groupDef
        ? ({
            ...(groupDef as any),
            lineItemConfig: { ...(effectiveConfig as any), fields: effectiveConfig.fields || [] }
          } as WebQuestionDefinition)
        : baseGroupForNonMatch;
    const inlineMode = addMode === undefined || addMode === null || addMode === 'inline';
    if (inlineMode && selectorCfg?.required && selectorId) {
      const presetSelector =
        preset && Object.prototype.hasOwnProperty.call(preset, selectorId) ? ((preset as any)[selectorId] as FieldValue) : undefined;
      const effectiveSelector = presetSelector !== undefined ? presetSelector : selectorValue;
      if (isEmptySelectorValue(effectiveSelector)) {
        onDiagnostic?.('ui.addRow.blocked', { groupId, reason: 'sectionSelector.required', selectorId });
        return { status: 'blocked' };
      }
    }

    const dedupRules = normalizeLineItemDedupRules((effectiveConfig as any)?.dedupRules);
    if (dedupRules.length) {
      const candidateValues: Record<string, FieldValue> = sanitizePreset(preset);
      const dedupConflict = findLineItemDedupConflict({
        rules: dedupRules,
        rows: currentRows,
        rowValues: candidateValues
      });
      if (dedupConflict) {
        const conflictFieldId = dedupConflict.fields[0];
        const valueToken = resolveLineItemDedupValueToken(candidateValues, conflictFieldId);
        const message = resolveLineItemDedupMessage(dedupConflict.rule, language, valueToken ? { value: valueToken } : undefined);
        onDiagnostic?.('lineItems.dedup.add.blocked', {
          groupId,
          fields: dedupConflict.fields,
          matchRowId: dedupConflict.matchRow.id
        });
        return {
          status: 'duplicate',
          message,
          fieldId: conflictFieldId,
          matchRowId: dedupConflict.matchRow.id
        };
      }
    }

    if (inlineMode && anchorFieldId && preset && Object.prototype.hasOwnProperty.call(preset, anchorFieldId)) {
      const presetVal = (preset as any)[anchorFieldId] as FieldValue;
      if (!isEmptyValue(presetVal as any)) {
        const currentRows = lineItems[groupId] || [];
        const selectorStr = selectorId ? (selectorValue || '').toString().trim() : '';
        const emptyRow = currentRows.find(row => {
          const rowVals = (row as any)?.values || {};
          const keys = Object.keys(rowVals).filter(k => k !== ROW_SOURCE_KEY);
          if (!keys.length) return true;
          if (selectorId && keys.length === 1 && keys[0] === selectorId) {
            const existing = (rowVals as any)[selectorId];
            if (existing === undefined || existing === null || existing === '') return true;
            return existing.toString().trim() === selectorStr;
          }
          return false;
        });

        if (emptyRow) {
          if (subgroupInfo) {
            setCollapsedSubgroups(prev => ({ ...prev, [groupId]: false }));
          }
          const anchor = `${groupId}__${emptyRow.id}`;
          onDiagnostic?.('ui.addRow.manual.fillEmpty', { groupId, rowId: emptyRow.id, anchor, anchorFieldId });
          setPendingScrollAnchor(anchor);
          setLineItems(prev => {
            const rows = prev[groupId] || [];
            const idx = rows.findIndex(row => row.id === emptyRow.id);
            if (idx < 0) return prev;

            const base = rows[idx];
            const nextRowValues: Record<string, FieldValue> = {
              ...(base.values || {}),
              ...sanitizePreset(preset),
              [ROW_SOURCE_KEY]: 'manual'
            };
            if (selectorId && selectorValue !== undefined && selectorValue !== null && nextRowValues[selectorId] === undefined) {
              nextRowValues[selectorId] = selectorValue;
            }
            if (groupForNonMatch?.lineItemConfig?.fields?.length) {
              const nonMatchKeys = computeRowNonMatchKeys({
                group: groupForNonMatch,
                rowValues: nextRowValues,
                lineItemsSnapshot: prev,
                valuesSnapshot: values,
                subgroupSelectorsSnapshot: subgroupSelectors
              });
              if (nonMatchKeys.length) {
                nextRowValues[ROW_NON_MATCH_OPTIONS_KEY] = nonMatchKeys;
                onDiagnostic?.('optionFilter.nonMatch.seed', { groupId, rowId: emptyRow.id, keys: nonMatchKeys });
              } else {
                delete nextRowValues[ROW_NON_MATCH_OPTIONS_KEY];
              }
            }

            const nextRow: LineItemRowState = { ...base, values: nextRowValues };
            const nextRows = [...rows];
            nextRows[idx] = nextRow;
            const nextLineItems = { ...prev, [groupId]: nextRows };
            const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
              mode: 'init'
            });
            setValues(nextValues);
            return recomputed;
          });
          return { status: 'added' };
        }
      }
    }

    const rowIdPrefix = subgroupInfo?.subGroupId || groupId;
    const rowId = `${rowIdPrefix}_${Math.random().toString(16).slice(2)}`;

    if (subgroupInfo) {
      setCollapsedSubgroups(prev => ({ ...prev, [groupId]: false }));
    }
    const anchor = `${groupId}__${rowId}`;
    onDiagnostic?.('ui.addRow.manual', { groupId, rowId, anchor, presetKeys: preset ? Object.keys(preset).slice(0, 10) : [] });
    setPendingScrollAnchor(anchor);
    addLineItemRow(groupId, { ...(preset || {}), [ROW_SOURCE_KEY]: 'manual' }, rowId, { configOverride: effectiveConfig });
    return { status: 'added' };
  };

  useEffect(() => {
    if (!lineItemGroupOverlay.open || !lineItemGroupOverlay.groupId) return;
    const overrideGroup = lineItemGroupOverlay.group;
    const overlayRowFilter = lineItemGroupOverlay.rowFilter || null;
    const group =
      overrideGroup && overrideGroup.type === 'LINE_ITEM_GROUP'
        ? overrideGroup
        : definition.questions.find(q => q.id === lineItemGroupOverlay.groupId && q.type === 'LINE_ITEM_GROUP');
    if (!group) return;
    const groupCfg = (group as any).lineItemConfig;
    if (!groupCfg) return;
    const { minRows, maxRows } = resolveLineItemRowLimits(groupCfg as any);
    if (minRows === undefined || minRows === null || minRows <= 0) return;
    const appliedMinRows = maxRows !== undefined && maxRows !== null ? Math.min(minRows, maxRows) : minRows;
    const rowsAll = lineItems[group.id] || [];
    const rowsMatching = overlayRowFilter
      ? rowsAll.filter(row => matchesOverlayRowFilter(((row as any)?.values || {}) as any, overlayRowFilter))
      : rowsAll;
    if (rowsMatching.length >= appliedMinRows) return;
    const addCount = appliedMinRows - rowsMatching.length;
    onDiagnostic?.('lineItemGroup.overlay.minRows.seed', {
      groupId: group.id,
      minRows: appliedMinRows,
      maxRows: maxRows ?? null,
      addCount
    });
    for (let i = 0; i < addCount; i += 1) {
      addLineItemRow(group.id, undefined, undefined, { configOverride: groupCfg });
    }
  }, [
    addLineItemRow,
    definition.questions,
    lineItemGroupOverlay.group,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.rowFilter,
    lineItems,
    matchesOverlayRowFilter,
    onDiagnostic
  ]);

  useEffect(() => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return;
    const subKey = subgroupOverlay.subKey;
    const subgroupDefs = resolveSubgroupDefs(subKey);
    const subConfigBase = subgroupDefs.sub;
    if (!subConfigBase) return;
    const overlayRowFilter = subgroupOverlay.rowFilter || null;
    const subConfig = subgroupOverlay.groupOverride
      ? applyLineItemGroupOverride(subConfigBase, subgroupOverlay.groupOverride)
      : subConfigBase;
    const { minRows, maxRows } = resolveLineItemRowLimits(subConfig as any);
    if (minRows === undefined || minRows === null || minRows <= 0) return;
    const appliedMinRows = maxRows !== undefined && maxRows !== null ? Math.min(minRows, maxRows) : minRows;
    const rowsAll = lineItems[subKey] || [];
    const rowsMatching = overlayRowFilter
      ? rowsAll.filter(row => matchesOverlayRowFilter(((row as any)?.values || {}) as any, overlayRowFilter))
      : rowsAll;
    if (rowsMatching.length >= appliedMinRows) return;
    const addCount = appliedMinRows - rowsMatching.length;
    const parsed = parseSubgroupKey(subKey);
    onDiagnostic?.('subgroup.overlay.minRows.seed', {
      groupId: subKey,
      rootGroupId: parsed?.rootGroupId || null,
      subGroupId: parsed?.subGroupId || null,
      minRows: appliedMinRows,
      maxRows: maxRows ?? null,
      addCount
    });
    for (let i = 0; i < addCount; i += 1) {
      addLineItemRow(subKey, undefined, undefined, { configOverride: subConfig });
    }
  }, [
    addLineItemRow,
    lineItems,
    matchesOverlayRowFilter,
    onDiagnostic,
    resolveSubgroupDefs,
    subgroupOverlay.groupOverride,
    subgroupOverlay.open,
    subgroupOverlay.rowFilter,
    subgroupOverlay.subKey
  ]);

  const overlayAutoGroupConfigs = useMemo(() => {
    const cfgs: Array<{
      groupId: string;
      anchorField: any;
      dependencyIds: string[];
      selectorId?: string;
    }> = [];
    (definition.questions || []).forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const groupCfg = q.lineItemConfig;
      if (!groupCfg) return;
      const overlayEnabled = !!(groupCfg as any)?.ui?.openInOverlay;
      if (!overlayEnabled) return;
      if ((groupCfg as any)?.addMode !== 'auto') return;
      if (!groupCfg.anchorFieldId) return;

      const anchorFieldId =
        groupCfg.anchorFieldId !== undefined && groupCfg.anchorFieldId !== null ? groupCfg.anchorFieldId.toString() : '';
      const anchorField = anchorFieldId ? (groupCfg.fields || []).find((field: any) => field && field.id === anchorFieldId) : undefined;
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      const rawDependsOn = (anchorField as any)?.optionFilter?.dependsOn;
      const dependencyIds = (Array.isArray(rawDependsOn) ? rawDependsOn : rawDependsOn ? [rawDependsOn] : [])
        .map((id: any) => (id ?? '').toString().trim())
        .filter(Boolean);
      if (!dependencyIds.length) return;

      cfgs.push({
        groupId: q.id,
        anchorField,
        dependencyIds,
        selectorId: groupCfg.sectionSelector?.id
      });
    });
    return cfgs;
  }, [definition.questions]);

  const overlayAutoAddSignature = useMemo(() => {
    if (!overlayAutoGroupConfigs.length) return '';
    return overlayAutoGroupConfigs
      .map(cfg => {
        const depSig = cfg.dependencyIds
          .map(depId => {
            const dep = toDependencyValue((values as any)[depId] as any);
            if (dep === undefined || dep === null) return '';
            return dep.toString();
          })
          .join('||');
        return `${cfg.groupId}:${depSig}`;
      })
      .join('##');
  }, [overlayAutoGroupConfigs, values]);

  useEffect(() => {
    if (submitting) return;
    if (!overlayAutoGroupConfigs.length) return;
    setLineItems(prev => {
      const skipGroupId = lineItemGroupOverlay.open ? (lineItemGroupOverlay.groupId || undefined) : undefined;
      const res = reconcileOverlayAutoAddModeGroups({
        definition,
        values,
        lineItems: prev,
        optionState,
        language,
        ensureLineOptions,
        skipGroupId
      });
      if (!res.changed) return prev;
      setValues(res.values);
      onDiagnostic?.('ui.lineItems.autoAdd.overlay.applyBatch', {
        specCount: res.specCount,
        changedCount: res.changedCount
      });
      return res.lineItems;
    });
  }, [
    submitting,
    overlayAutoGroupConfigs,
    overlayAutoAddSignature,
    definition,
    values,
    optionState,
    language,
    ensureLineOptions,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.groupId,
    onDiagnostic,
    setLineItems,
    setValues
  ]);

  useEffect(() => {
    if (submitting) return;

    setLineItems(prev => {
      const skipParentGroupId = lineItemGroupOverlay.open ? (lineItemGroupOverlay.groupId || undefined) : undefined;
      const res = reconcileOverlayAutoAddModeSubgroups({
        definition,
        values,
        lineItems: prev,
        optionState,
        language,
        subgroupSelectors,
        ensureLineOptions,
        skipParentGroupId
      });
      if (!res.changed) return prev;
      setValues(res.values);
      onDiagnostic?.('ui.lineItems.autoAdd.overlaySubgroups.applyBatch', {
        specCount: res.specCount,
        changedCount: res.changedCount
      });
      return res.lineItems;
    });
  }, [
    submitting,
    definition,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    lineItemGroupOverlay.open,
    lineItemGroupOverlay.groupId,
    onDiagnostic,
    setLineItems,
    setValues
  ]);

  const removeLineRow = (groupId: string, rowId: string) => {
    const resolveRemovalGuardScope = () => {
      const subgroupInfo = parseSubgroupKey(groupId);
      if (subgroupInfo) {
        const subgroupDefs = resolveSubgroupDefs(groupId);
        const subConfigBase = subgroupDefs?.sub;
        const rowFilter = subgroupOverlay.open && subgroupOverlay.subKey === groupId ? subgroupOverlay.rowFilter || null : null;
        const effectiveConfig =
          subgroupOverlay.open && subgroupOverlay.subKey === groupId && subgroupOverlay.groupOverride
            ? applyLineItemGroupOverride(subConfigBase, subgroupOverlay.groupOverride)
            : subConfigBase;
        return { effectiveConfig, rowFilter, scope: 'sub' };
      }
      const overlayGroup =
        lineItemGroupOverlay.open && lineItemGroupOverlay.groupId === groupId && lineItemGroupOverlay.group?.type === 'LINE_ITEM_GROUP'
          ? lineItemGroupOverlay.group
          : null;
      const groupQuestion =
        overlayGroup || definition.questions.find(q => q.id === groupId && q.type === 'LINE_ITEM_GROUP');
      const rowFilter = lineItemGroupOverlay.open && lineItemGroupOverlay.groupId === groupId ? lineItemGroupOverlay.rowFilter || null : null;
      return { effectiveConfig: groupQuestion?.lineItemConfig, rowFilter, scope: 'line' };
    };

    const guardScope = resolveRemovalGuardScope();
    const guard = resolveLineItemRemoveGuard(guardScope.effectiveConfig);
    if (guard) {
      const currentRows = lineItems[groupId] || [];
      const scopedRows = guardScope.rowFilter
        ? currentRows.filter(row => matchesOverlayRowFilter(((row as any)?.values || {}) as any, guardScope.rowFilter))
        : currentRows;
      const targetInScope = scopedRows.some(row => row.id === rowId);
      if (targetInScope && shouldBlockLineItemRowRemoval({ guard, currentCount: scopedRows.length })) {
        const message = resolveLocalizedString(
          guard.message as any,
          language,
          'At least one item must remain.'
        );
        const title = resolveLocalizedString(guard.title as any, language, '');
        onDiagnostic?.('ui.lineItems.remove.blocked', {
          groupId,
          rowId,
          reason: 'removeGuard.minRows',
          minRows: guard.minRows,
          currentCount: scopedRows.length,
          scope: guardScope.scope
        });
        openConfirmDialog?.({
          title,
          message,
          confirmLabel: tSystem('common.ok', language, 'OK'),
          cancelLabel: '',
          showCancel: false,
          showCloseButton: false,
          kind: 'lineItem.removeGuard',
          refId: `${groupId}::${rowId}`,
          onConfirm: () => {}
        });
        return;
      }
    }

    if (onSelectionEffect) {
      const groupQuestion = definition.questions.find(q => q.id === groupId);
      const rows = lineItems[groupId] || [];
      const targetRow = rows.find(row => row.id === rowId);
      if (groupQuestion && targetRow) {
        clearSelectionEffectsForRow(groupQuestion, targetRow);
      }
    }
    const prevLineItems = lineItems;
    const cascade = cascadeRemoveLineItemRows({ lineItems: prevLineItems, roots: [{ groupId, rowId }] });
    const marked = markRecipeIngredientsDirtyForGroupKey(cascade.lineItems, groupId);
    if (marked.changed) {
      onDiagnostic?.('ck-75.recipe.ingredientsDirty.set', {
        groupId,
        parentGroupKey: marked.parentGroupKey || null,
        parentRowId: marked.parentRowId || null,
        reason: 'rowRemoved'
      });
    }
    if (cascade.removedSubgroupKeys.length) {
      setSubgroupSelectors(prevSel => {
        const nextSel = { ...prevSel };
        cascade.removedSubgroupKeys.forEach(key => {
          delete (nextSel as any)[key];
        });
        return nextSel;
      });
    }
    onDiagnostic?.('ui.lineItems.remove.cascade', { groupId, rowId, removedCount: cascade.removed.length });
    const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, marked.lineItems, {
      mode: 'init'
    });
    setValues(nextValues);
    setLineItems(recomputed);
    runSelectionEffectsForAncestorRows(groupId, prevLineItems, recomputed, { mode: 'init', topValues: nextValues });
  };

  return {
    addLineItemRowManual,
    removeLineRow
  };
}
