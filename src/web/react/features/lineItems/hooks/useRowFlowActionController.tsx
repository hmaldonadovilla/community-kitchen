import React from 'react';

import {
  buildLocalizedOptions,
  computeAllowedOptions,
  getOptionStateValue,
  toDependencyValue,
  toOptionSet
} from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LineItemGroupConfigOverride,
  LineItemRowState,
  OptionSet,
  RowFlowConfig,
  RowFlowOverlayContextHeaderConfig,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../../types';
import {
  applyLineItemGroupOverride,
  buildLineItemOverlayGroupOverride
} from '../../../app/lineItemTree';
import {
  buildSubgroupKey,
  cascadeRemoveLineItemRows
} from '../../../app/lineItems';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import type { LineItemState, OptionState } from '../../../types';
import { resolveAddOverlayCopy } from '../domain/addOverlayCopy';
import { optionSortFor } from '../domain/lineItemPresentation';
import {
  buildRowFlowContextHeaderAction,
  resolveRowFlowDisplayValueAction
} from '../domain/rowFlowDisplayValue';
import { RowFlowActionControl } from '../components/RowFlowActionControl';
import {
  resolveRowFlowActionPlan,
  resolveRowFlowFieldTarget,
  type RowFlowResolvedEffect,
  type RowFlowResolvedSegment,
  type RowFlowResolvedState
} from '../../steps/domain/rowFlow';
import { resolveValueMapValue } from '../../../components/form/valueMaps';

type RowFlowGroupInfo = {
  groupId: string;
  config: any;
};

type UseRowFlowActionControllerArgs = {
  groupId: string;
  definition: WebFormDefinition;
  language: string;
  rowFlow?: RowFlowConfig;
  rowFlowEnabled: boolean;
  rowFlowSubGroupIds: string[];
  rowFlowActionById: Map<string, any>;
  parentRowById: Map<string, LineItemRowState>;
  rowFlowStateByRowId: Map<string, RowFlowResolvedState>;
  lineItems: LineItemState;
  values: Record<string, FieldValue>;
  optionState: OptionState;
  submitting: boolean;
  latestValuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
  resolveRowFlowGroupConfig: (groupKey: string) => RowFlowGroupInfo | null;
  resolveRowFlowFieldConfig: (groupKey: string, fieldId: string) => any | null;
  ensureLineOptions: (groupId: string, field: any) => void;
  addLineItemRowManual: (groupKey: string, preset?: Record<string, any>) => void;
  openLineItemGroupOverlay: (groupOrId: WebQuestionDefinition | string, options?: any) => void;
  openSubgroupOverlay: (groupKey: string, options?: any) => void;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  setSubgroupSelectors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setOverlay: React.Dispatch<React.SetStateAction<any>>;
  closeOverlay?: () => void;
  openConfirmDialog?: (config: any) => void;
  runSelectionEffectsForAncestors?: (
    groupKey: string,
    previousLineItems: LineItemState,
    nextLineItems: LineItemState,
    options?: any
  ) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: row-flow action orchestration.
 * Keeps action execution, prompt automation, and overlay launching outside the
 * line-item group renderer shell.
 */
export const useRowFlowActionController = ({
  groupId,
  definition,
  language,
  rowFlow,
  rowFlowEnabled,
  rowFlowSubGroupIds,
  rowFlowActionById,
  parentRowById,
  rowFlowStateByRowId,
  lineItems,
  values,
  optionState,
  submitting,
  latestValuesRef,
  resolveTopValue,
  resolveRowFlowGroupConfig,
  resolveRowFlowFieldConfig,
  ensureLineOptions,
  addLineItemRowManual,
  openLineItemGroupOverlay,
  openSubgroupOverlay,
  setLineItems,
  setSubgroupSelectors,
  setValues,
  setOverlay,
  closeOverlay,
  openConfirmDialog,
  runSelectionEffectsForAncestors,
  onDiagnostic
}: UseRowFlowActionControllerArgs) => {
  const rowFlowPromptCompleteRef = React.useRef<Record<string, Record<string, boolean>>>({});
  const rowFlowSelectorOverlayAutoOpenedRef = React.useRef<Record<string, boolean>>({});

  const resolveOptionSetForLineField = React.useCallback(
    (field: any, parentId?: string): OptionSet => getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field),
    [optionState]
  );

  const buildRowFlowFieldCtx = React.useCallback(
    (args: { rowValues: Record<string, FieldValue>; parentValues?: Record<string, FieldValue> }): VisibilityContext => ({
      getValue: fid =>
        (args.rowValues as any)[fid] ??
        (args.parentValues as any)?.[fid] ??
        resolveTopValue(fid),
      getLineValue: (_rowId, fid) =>
        (args.rowValues as any)[fid] ??
        (args.parentValues as any)?.[fid] ??
        resolveTopValue(fid),
      getLineItems: targetGroupId => lineItems?.[targetGroupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    }),
    [lineItems, resolveTopValue]
  );

  const resolveRowFlowDisplayValue = React.useCallback(
    (
      segment: RowFlowResolvedSegment,
      targetGroupKey: string,
      field: any,
      parentValues?: Record<string, FieldValue>,
      fallbackGroupKey?: string,
      fallbackField?: any,
      fallbackParentValues?: Record<string, FieldValue>
    ): { text: string; hasValue: boolean } => {
      return resolveRowFlowDisplayValueAction({
        segment,
        targetGroupKey,
        field,
        parentValues,
        fallbackGroupKey,
        fallbackField,
        fallbackParentValues,
        language,
        resolveTopValue,
        ensureLineOptions,
        resolveOptionSetForField: (targetField, targetGroupKeyArg) =>
          resolveOptionSetForLineField(targetField, targetGroupKeyArg),
        resolveValueMapValue
      });
    },
    [ensureLineOptions, language, resolveOptionSetForLineField, resolveTopValue]
  );

  const buildRowFlowContextHeader = React.useCallback(
    (args: {
      config?: RowFlowOverlayContextHeaderConfig;
      rowId: string;
      rowValues: Record<string, FieldValue>;
      rowFlowState: RowFlowResolvedState;
    }): string => {
      return buildRowFlowContextHeaderAction({
        ...args,
        groupId,
        language,
        resolveTopValue,
        resolveRowFlowFieldConfig,
        resolveRowFlowDisplayValue
      });
    },
    [groupId, language, resolveRowFlowDisplayValue, resolveRowFlowFieldConfig, resolveTopValue]
  );

  const buildOverlayGroupOverride = React.useCallback(
    (group: WebQuestionDefinition, override?: LineItemGroupConfigOverride) => {
      return buildLineItemOverlayGroupOverride(group, override);
    },
    []
  );

  const runRowFlowActionWithContext = React.useCallback(
    (args: { actionId: string; row: LineItemRowState; rowFlowState: RowFlowResolvedState }) => {
      const { actionId, row, rowFlowState } = args;
      const plan = resolveRowFlowActionPlan({
        actionId,
        config: rowFlow as RowFlowConfig,
        state: rowFlowState,
        groupId,
        rowId: row.id,
        rowValues: row.values || {},
        lineItems,
        topValues: values,
        subGroupIds: rowFlowSubGroupIds
      });
      if (!plan) return;

      const resolveOverlayContextHeader = (effect: RowFlowResolvedEffect): string => {
        if (effect.type !== 'openOverlay') return '';
        const headerConfig = effect.overlayContextHeader || rowFlow?.overlayContextHeader;
        if (!headerConfig) return '';
        return buildRowFlowContextHeader({
          config: headerConfig,
          rowId: row.id,
          rowValues: (row.values || {}) as Record<string, FieldValue>,
          rowFlowState
        });
      };
      const resolveOverlayHelperText = (effect: RowFlowResolvedEffect): string => {
        if (effect.type !== 'openOverlay') return '';
        const helperConfig = effect.overlayHelperText;
        if (!helperConfig) return '';
        return buildRowFlowContextHeader({
          config: helperConfig,
          rowId: row.id,
          rowValues: (row.values || {}) as Record<string, FieldValue>,
          rowFlowState
        });
      };

      const logActionRun = () => {
        onDiagnostic?.('lineItems.rowFlow.action.run', {
          groupId,
          rowId: row.id,
          actionId: plan.action.id,
          effectCount: plan.effects.length
        });
      };
      const openResolvedOverlay = (effect: Extract<RowFlowResolvedEffect, { type: 'openOverlay' }>) => {
        const contextHeader = resolveOverlayContextHeader(effect);
        const hasContextHeader = Boolean(contextHeader);
        const helperText = resolveOverlayHelperText(effect);
        const hasHelperText = Boolean(helperText);
        if (effect.targetKind === 'line') {
          const baseGroup = definition.questions.find(question => question.id === effect.key && question.type === 'LINE_ITEM_GROUP') as
            | WebQuestionDefinition
            | undefined;
          const overrideGroup =
            baseGroup && effect.groupOverride ? buildOverlayGroupOverride(baseGroup, effect.groupOverride) : undefined;
          if (!baseGroup && effect.groupOverride) {
            onDiagnostic?.('lineItems.rowFlow.overlay.missingGroup', {
              groupId,
              rowId: row.id,
              targetKey: effect.key
            });
          }
          const groupOrId = overrideGroup || effect.key;
          openLineItemGroupOverlay(groupOrId, {
            rowFilter: effect.rowFilter || null,
            hideInlineSubgroups: effect.hideInlineSubgroups,
            hideCloseButton: effect.hideCloseButton,
            closeButtonLabel: resolveLocalizedString(effect.closeButtonLabel as any, language, ''),
            closeConfirm: effect.closeConfirm,
            overlaySession: effect.overlaySession,
            source: 'overlayOpenAction',
            label: resolveLocalizedString(effect.label as any, language, ''),
            contextHeader: contextHeader || undefined,
            helperText: helperText || undefined,
            rowFlow: effect.rowFlow
          });
        } else {
          openSubgroupOverlay(effect.key, {
            rowFilter: effect.rowFilter || null,
            hideInlineSubgroups: effect.hideInlineSubgroups,
            groupOverride: effect.groupOverride,
            hideCloseButton: effect.hideCloseButton,
            closeButtonLabel: resolveLocalizedString(effect.closeButtonLabel as any, language, ''),
            closeConfirm: effect.closeConfirm,
            overlaySession: effect.overlaySession,
            source: 'overlayOpenAction',
            label: resolveLocalizedString(effect.label as any, language, ''),
            contextHeader: contextHeader || undefined,
            helperText: helperText || undefined,
            rowFlow: effect.rowFlow
          });
        }
        onDiagnostic?.('lineItems.rowFlow.overlay.open', {
          groupId,
          rowId: row.id,
          targetKey: effect.key,
          targetKind: effect.targetKind,
          hasOverride: !!effect.groupOverride,
          hasRowFlow: !!effect.rowFlow,
          hasContextHeader,
          hasHelperText,
          hideCloseButton: !!effect.hideCloseButton,
          hasOverlaySession: !!effect.overlaySession
        });
      };
      const applyEffects = () => {
        const deleteRoots: Array<{ groupId: string; rowId: string }> = [];
        const setEffects = plan.effects.filter(effect => effect.type === 'setValue');
        const deleteEffects = plan.effects.filter(effect => effect.type === 'deleteLineItems');
        const deleteRowEffects = plan.effects.filter(effect => effect.type === 'deleteRow');
        const addEffects = plan.effects.filter(effect => effect.type === 'addLineItems');
        const seedEffects = plan.effects.filter(effect => effect.type === 'seedLineItemsFromReference');
        const openEffects = plan.effects.filter(effect => effect.type === 'openOverlay');
        const closeEffects = plan.effects.filter(effect => effect.type === 'closeOverlay');

        deleteEffects.forEach(effect => {
          effect.rowIds.forEach(rowId => deleteRoots.push({ groupId: effect.groupKey, rowId }));
        });
        deleteRowEffects.forEach(effect => {
          deleteRoots.push({ groupId: effect.groupKey, rowId: effect.rowId });
        });
        if (deleteRowEffects.length) {
          onDiagnostic?.('lineItems.rowFlow.action.deleteRow', {
            groupId,
            rowId: row.id,
            count: deleteRowEffects.length
          });
        }

        if (addEffects.length) {
          addEffects.forEach(effect => {
            const count = effect.count || 1;
            for (let idx = 0; idx < count; idx += 1) {
              addLineItemRowManual(effect.groupKey, effect.preset as Record<string, any> | undefined);
            }
            onDiagnostic?.('lineItems.rowFlow.action.addLineItems', {
              groupId,
              rowId: row.id,
              targetKey: effect.groupKey,
              count,
              hasPreset: !!effect.preset
            });
          });
        }
        if (seedEffects.length) {
          seedEffects.forEach(effect => {
            const existingRows = lineItems[effect.groupKey] || [];
            if (effect.whenEmpty && existingRows.length) {
              onDiagnostic?.('lineItems.rowFlow.action.seedLineItems.skip', {
                groupId,
                rowId: row.id,
                targetKey: effect.groupKey,
                reason: 'notEmpty',
                existingCount: existingRows.length
              });
              return;
            }
            effect.rows.forEach(preset => addLineItemRowManual(effect.groupKey, preset));
            onDiagnostic?.('lineItems.rowFlow.action.seedLineItems', {
              groupId,
              rowId: row.id,
              targetKey: effect.groupKey,
              count: effect.rows.length,
              whenEmpty: effect.whenEmpty
            });
          });
        }

        if (!setEffects.length && !deleteRoots.length) {
          openEffects.forEach(effect => openResolvedOverlay(effect as Extract<RowFlowResolvedEffect, { type: 'openOverlay' }>));
          if (closeEffects.length && closeOverlay) {
            closeOverlay();
            onDiagnostic?.('lineItems.rowFlow.action.closeOverlay', { groupId, rowId: row.id });
          }
          logActionRun();
          return;
        }

        setLineItems(prev => {
          let next = prev;
          let changed = false;
          setEffects.forEach(effect => {
            const rows = next[effect.groupKey] || [];
            const idx = rows.findIndex(candidate => candidate.id === effect.rowId);
            if (idx < 0) return;
            const base = rows[idx];
            const nextRowValues = { ...(base.values || {}), [effect.fieldId]: effect.value };
            const nextRow = { ...base, values: nextRowValues };
            const nextRows = [...rows];
            nextRows[idx] = nextRow;
            if (next === prev) next = { ...prev };
            next[effect.groupKey] = nextRows;
            changed = true;
          });

          if (deleteRoots.length) {
            const cascade = cascadeRemoveLineItemRows({ lineItems: next, roots: deleteRoots });
            if (cascade.removedSubgroupKeys.length) {
              setSubgroupSelectors(prevSel => {
                const nextSel = { ...prevSel };
                cascade.removedSubgroupKeys.forEach(key => {
                  delete (nextSel as any)[key];
                });
                return nextSel;
              });
            }
            next = cascade.lineItems;
            changed = true;
          }

          if (!changed) return prev;
          const latestValues = latestValuesRef.current || {};
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, next, {
            mode: 'init'
          });
          latestValuesRef.current = nextValues;
          setValues(nextValues);
          const touchedKeys = new Set<string>();
          setEffects.forEach(effect => touchedKeys.add(effect.groupKey));
          deleteEffects.forEach(effect => touchedKeys.add(effect.groupKey));
          touchedKeys.forEach(groupKey => {
            runSelectionEffectsForAncestors?.(groupKey, prev, recomputed, {
              mode: 'init',
              topValues: nextValues
            });
          });
          openEffects.forEach(effect => openResolvedOverlay(effect as Extract<RowFlowResolvedEffect, { type: 'openOverlay' }>));
          return recomputed;
        });
        if (closeEffects.length && closeOverlay) {
          closeOverlay();
          onDiagnostic?.('lineItems.rowFlow.action.closeOverlay', { groupId, rowId: row.id });
        }
        logActionRun();
      };

      const confirm = plan.action.confirm;
      const confirmTiming = (() => {
        const rawTiming = (confirm as any)?.timing;
        const timing = (rawTiming === undefined || rawTiming === null ? '' : rawTiming.toString()).trim().toLowerCase();
        return timing === 'after' ? 'after' : 'before';
      })();
      if (confirm && confirmTiming === 'before' && openConfirmDialog) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        const cancelLabel = resolveLocalizedString(confirm.cancelLabel, language, tSystem('common.cancel', language, 'Cancel'));
        openConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel,
          showCancel: confirm.showCancel !== false,
          kind: confirm.kind || 'rowFlow',
          refId: `${groupId}::${row.id}::${plan.action.id}`,
          onConfirm: applyEffects
        });
        return;
      }
      applyEffects();
      if (confirm && confirmTiming === 'after' && openConfirmDialog) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        openConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel: '',
          showCancel: false,
          kind: confirm.kind || 'rowFlow.after',
          refId: `${groupId}::${row.id}::${plan.action.id}::after`,
          onConfirm: () => {}
        });
        onDiagnostic?.('lineItems.rowFlow.action.confirm.after', { groupId, rowId: row.id, actionId: plan.action.id });
      }
    },
    [
      addLineItemRowManual,
      buildOverlayGroupOverride,
      buildRowFlowContextHeader,
      closeOverlay,
      definition,
      groupId,
      language,
      latestValuesRef,
      lineItems,
      onDiagnostic,
      openConfirmDialog,
      openLineItemGroupOverlay,
      openSubgroupOverlay,
      rowFlow,
      rowFlowSubGroupIds,
      runSelectionEffectsForAncestors,
      setLineItems,
      setSubgroupSelectors,
      setValues,
      values
    ]
  );

  const renderRowFlowActionControlWithContext = React.useCallback(
    (args: { actionId: string; row: LineItemRowState; rowFlowState: RowFlowResolvedState }) => {
      const action = rowFlowActionById.get(args.actionId);
      if (!action) return null;
      const disabled = submitting;
      return (
        <RowFlowActionControl
          key={action.id}
          action={action}
          language={language}
          disabled={disabled}
          onRun={() => runRowFlowActionWithContext({ actionId: action.id, row: args.row, rowFlowState: args.rowFlowState })}
        />
      );
    },
    [language, rowFlowActionById, runRowFlowActionWithContext, submitting]
  );

  React.useEffect(() => {
    if (!rowFlowEnabled) return;
    rowFlowStateByRowId.forEach((state, rowId) => {
      const row = parentRowById.get(rowId);
      if (!row) return;
      state.prompts.forEach(prompt => {
        const autoActions = prompt.config.onCompleteActions || [];
        if (!autoActions.length) return;
        const tracker = rowFlowPromptCompleteRef.current[rowId] || {};
        const hasTracked = Object.prototype.hasOwnProperty.call(tracker, prompt.id);
        const wasComplete = tracker[prompt.id] === true;
        const nowComplete = prompt.complete && prompt.showWhenOk !== false;
        if (!hasTracked) {
          tracker[prompt.id] = nowComplete;
          rowFlowPromptCompleteRef.current[rowId] = tracker;
          if (nowComplete) {
            onDiagnostic?.('lineItems.rowFlow.prompt.autoAction.skipInit', {
              groupId,
              rowId,
              promptId: prompt.id,
              actionCount: autoActions.length
            });
          }
          return;
        }
        if (!wasComplete && nowComplete) {
          autoActions.forEach(actionId => {
            runRowFlowActionWithContext({ actionId, row, rowFlowState: state });
            onDiagnostic?.('lineItems.rowFlow.prompt.autoAction', {
              groupId,
              rowId,
              promptId: prompt.id,
              actionId
            });
          });
        }
        tracker[prompt.id] = nowComplete;
        rowFlowPromptCompleteRef.current[rowId] = tracker;
      });
    });
  }, [groupId, onDiagnostic, parentRowById, rowFlowEnabled, rowFlowStateByRowId, runRowFlowActionWithContext]);

  React.useEffect(() => {
    if (!rowFlowEnabled || !rowFlow) return;
    rowFlowStateByRowId.forEach((state, rowId) => {
      const row = parentRowById.get(rowId);
      if (!row) return;
      const activePromptId = (state.activePromptId || '').toString().trim();
      if (!activePromptId) return;
      const activePrompt = state.prompts.find(prompt => prompt.id === activePromptId && prompt.visible);
      if (!activePrompt) return;
      const inputKind = (activePrompt.config?.input?.kind || 'field').toString().trim().toLowerCase();
      if (inputKind !== 'selectoroverlay') return;
      const targetRef = (activePrompt.config?.input?.targetRef || '').toString().trim();
      if (!targetRef) return;
      const target = resolveRowFlowFieldTarget({
        fieldRef: `${targetRef}.`,
        groupId,
        rowId: row.id,
        rowValues: row.values || {},
        references: state.references
      });
      if (!target?.refId) return;
      const ref = state.references[target.refId];
      const refGroupId = (ref?.groupId || target.groupId || '').toString().trim();
      if (!refGroupId) return;
      const isSubgroupRef = rowFlowSubGroupIds.includes(refGroupId);
      const targetGroupKey =
        target.primaryRow?.groupKey ||
        (isSubgroupRef ? buildSubgroupKey(groupId, row.id, refGroupId) : refGroupId || target.groupKey);
      if (!targetGroupKey) return;
      const targetInfo = resolveRowFlowGroupConfig(targetGroupKey);
      if (!targetInfo?.config) return;
      const promptGroupOverride = activePrompt.config?.input?.groupOverride;
      if (!promptGroupOverride || typeof promptGroupOverride !== 'object') return;
      const effectiveTargetConfig = applyLineItemGroupOverride(targetInfo.config, promptGroupOverride);
      if (!(effectiveTargetConfig as any)?.ui?.openInOverlay) return;
      const existingRows = (lineItems[targetInfo.groupId] || []) as LineItemRowState[];
      const autoOpenKey = `${groupId}::${rowId}::${activePrompt.id}::${targetInfo.groupId}`;
      if (existingRows.length > 0) {
        delete rowFlowSelectorOverlayAutoOpenedRef.current[autoOpenKey];
        return;
      }
      if (rowFlowSelectorOverlayAutoOpenedRef.current[autoOpenKey]) return;

      const anchorFieldId =
        effectiveTargetConfig?.anchorFieldId !== undefined && effectiveTargetConfig?.anchorFieldId !== null
          ? effectiveTargetConfig.anchorFieldId.toString()
          : '';
      const anchorField = anchorFieldId
        ? (effectiveTargetConfig?.fields || []).find((field: any) => field.id === anchorFieldId)
        : null;
      if (!anchorField || anchorField.type !== 'CHOICE') return;

      ensureLineOptions(targetInfo.groupId, anchorField);
      const optionSetField: OptionSet = resolveOptionSetForLineField(anchorField, targetInfo.groupId);
      const dependencyIds = (
        Array.isArray(anchorField.optionFilter?.dependsOn)
          ? anchorField.optionFilter?.dependsOn
          : [anchorField.optionFilter?.dependsOn || '']
      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
      const depVals = dependencyIds.map((dep: string) =>
        toDependencyValue((row.values as any)[dep] ?? (target.parentValues as any)?.[dep] ?? values[dep])
      );
      const allowed = computeAllowedOptions(anchorField.optionFilter, optionSetField, depVals);
      const localized = buildLocalizedOptions(optionSetField, allowed, language, { sort: optionSortFor(anchorField) });
      const seen = new Set<string>();
      const overlayOptions = localized
        .map(opt => ({ value: opt.value, label: opt.label, searchText: opt.searchText }))
        .filter(opt => {
          const key = (opt.value || '').toString().trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (!overlayOptions.length) return;

      rowFlowSelectorOverlayAutoOpenedRef.current[autoOpenKey] = true;
      const promptCloseButtonLabel = resolveLocalizedString(activePrompt.config?.input?.closeButtonLabel as any, language, '').trim();

      if (isSubgroupRef && targetGroupKey) {
        openSubgroupOverlay(targetGroupKey, {
          groupOverride: promptGroupOverride,
          source: 'system',
          closeButtonLabel: promptCloseButtonLabel || undefined
        });
      } else {
        const baseGroup = definition.questions.find(
          question => question.id === targetInfo.groupId && question.type === 'LINE_ITEM_GROUP'
        ) as WebQuestionDefinition | undefined;
        const overrideGroup = baseGroup ? buildOverlayGroupOverride(baseGroup, promptGroupOverride) : undefined;
        if (overrideGroup) {
          openLineItemGroupOverlay(overrideGroup, {
            source: 'system',
            closeButtonLabel: promptCloseButtonLabel || undefined
          });
        }
      }

      const addOverlayCopy = resolveAddOverlayCopy(effectiveTargetConfig, language);
      setOverlay({
        open: true,
        options: overlayOptions,
        groupId: targetInfo.groupId,
        anchorFieldId: anchorField.id,
        selected: [],
        title: addOverlayCopy.title,
        helperText: addOverlayCopy.helperText,
        searchHelperText: addOverlayCopy.searchHelperText,
        placeholder:
          addOverlayCopy.placeholder ||
          resolveLocalizedString(activePrompt.config?.input?.placeholder, language, '') ||
          undefined
      });
      onDiagnostic?.('lineItems.rowFlow.selector.autoOpen', {
        groupId,
        rowId,
        promptId: activePrompt.id,
        targetGroupId: targetInfo.groupId,
        optionCount: overlayOptions.length
      });
    });
  }, [
    buildOverlayGroupOverride,
    definition,
    ensureLineOptions,
    groupId,
    language,
    lineItems,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    parentRowById,
    resolveOptionSetForLineField,
    resolveRowFlowGroupConfig,
    rowFlow,
    rowFlowEnabled,
    rowFlowStateByRowId,
    rowFlowSubGroupIds,
    setOverlay,
    values
  ]);

  return {
    buildRowFlowFieldCtx,
    resolveRowFlowDisplayValue,
    buildOverlayGroupOverride,
    renderRowFlowActionControlWithContext
  };
};
