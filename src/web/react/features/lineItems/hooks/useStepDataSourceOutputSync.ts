import React from 'react';

import { matchesWhenClause } from '../../../../core';
import { tSystem } from '../../../../systemStrings';
import { mutateCachedDataSource } from '../../../../data/dataSources';
import type {
  FieldValue,
  LineItemRowState,
  VisibilityContext,
  WebFormDefinition
} from '../../../../types';
import { resolveUserFacingErrorMessage, upsertBankUtilisationApi } from '../../../api';
import { applySourceFirstAncestorSelectionEffects } from '../../../app/sourceFirstAncestorSelectionSync';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import type { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import {
  buildUtilisationConflictDialogCopy,
  computeUtilisationConflictUsableQuantity
} from '../../../components/form/utilisationConflictDialog';
import {
  buildUtilisationFailureMessage,
  isStepUtilisationCommitEnabled,
  resolveStepUtilisationDraftStateDecision,
  shouldImmediatelySyncStepUtilisationChange
} from '../../../components/form/utilisationSyncPolicy';
import { applyStepDataSourceDraftUpdateAction } from '../domain/stepDataSourceDrafts';
import { applyStepDataSourceExclusiveSelectionRemovalAction } from '../domain/stepDataSourceExclusiveSelection';
import {
  buildStepDataSourceAvailabilityOptimisticMutationAction,
  shouldApplyStepDataSourceAvailabilityOptimisticMutation
} from '../domain/stepDataSourceAvailability';
import {
  applyStepDataSourceMatchedOutputRuleAction
} from '../domain/stepDataSourceRows';
import {
  resolveServerCurrentRecordUtilisedQuantityFromRow
} from '../domain/virtualDataSourceRowValues';
import { resolveUtilisationDisplayLabel } from '../../utilisations/displayLabel';
import { resolveUtilisationResourceFieldIds } from '../../utilisations/sourceFields';
import {
  fieldByIdSafe,
  normalizeIdValue
} from '../domain/lineItemPresentation';
import {
  areFieldValueRecordsEqual,
  areLineItemStatesEqual
} from '../domain/lineItemStateComparison';

type StepDataSourceOutputSyncArgs = {
  config: any;
  parentRow: LineItemRowState;
  sourceRow: Record<string, any>;
  patch: Record<string, FieldValue>;
};

type UseStepDataSourceOutputSyncArgs = {
  groupId: string;
  formKey?: string | null;
  recordId?: string | null;
  currentGuidedStepId?: string | null;
  definition: WebFormDefinition;
  language: string;
  lineItems: LineItemState;
  latestValuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  latestStepDataSourceSyncedLineItemsRef: React.MutableRefObject<LineItemState | null>;
  stepDataSourceDraftsRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  utilisationCommittedValuesRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  utilisationDebounceTimersRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  utilisationRequestVersionRef: React.MutableRefObject<Record<string, number>>;
  utilisationSyncCounterRef: React.MutableRefObject<number>;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  setStepDataSourceDrafts: React.Dispatch<React.SetStateAction<Record<string, Record<string, FieldValue>>>>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  buildStepDataSourceDraftKey: (config: any, parentRowId: string, sourceKey: string) => string;
  buildVirtualDataSourceRowValues: (args: {
    config: any;
    sourceRow: Record<string, any>;
    outputRow?: LineItemRowState | null;
    draftValues?: Record<string, FieldValue> | null;
    parentRowId?: string;
  }) => Record<string, FieldValue>;
  resolveDataSourceOutputGroup: (
    config: any,
    parentRowId: string
  ) => { key: string; subConfig: any | null } | null;
  resolveVirtualPreset: (
    preset: Record<string, any> | undefined,
    args: {
      rowValues: Record<string, FieldValue>;
      parentValues?: Record<string, FieldValue>;
      sourceRow?: Record<string, any>;
    }
  ) => Record<string, FieldValue>;
  resolveVirtualPresetValue: (
    raw: any,
    args: {
      rowValues: Record<string, FieldValue>;
      parentValues?: Record<string, FieldValue>;
      sourceRow?: Record<string, any>;
    }
  ) => FieldValue | undefined;
  resolveVirtualRowWhenContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
  resolveRowFlowGroupConfig: (groupKey: string) => { groupId: string; config: any } | null;
  resolveCurrentUtilisationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalUtilisedQuantity: number; currentRowQuantity: number };
  resolveCommittedUtilisationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalUtilisedQuantity: number; currentRowQuantity: number };
  queueStepDataSourceRefreshTick: () => void;
  updateStepDataSourceAvailability: (config: any, availability: any) => void;
  validateVirtualFieldRules: (
    field: any,
    rowValues: Record<string, FieldValue>,
    parentValues?: Record<string, FieldValue>
  ) => string[];
  toFiniteNumber: (value: any) => number;
  ensureRecordId?: (args: {
    reason: string;
    fieldPath: string;
  }) => Promise<{ success?: boolean; recordId?: string | null; message?: string | null } | null | undefined>;
  onGuidedStepUtilisationDraftStateChange?: (event: any) => void;
  queueImmediateStepUtilisationDraftSync: (args: {
    config: any;
    parentRowId: string;
    sourceKey: string;
    patch: Record<string, FieldValue>;
    snapshotLineItems: LineItemState | null;
  }) => void;
  openConfirmDialog?: (config: any) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: guided step data-source output synchronization.
 * Keeps source-row output mutation, utilisation sync, rollback, and value-map
 * recomputation outside the line-item group renderer shell.
 */
export const useStepDataSourceOutputSync = ({
  groupId,
  formKey,
  recordId,
  currentGuidedStepId,
  definition,
  language,
  lineItems,
  latestValuesRef,
  latestStepDataSourceSyncedLineItemsRef,
  stepDataSourceDraftsRef,
  utilisationCommittedValuesRef,
  utilisationDebounceTimersRef,
  utilisationRequestVersionRef,
  utilisationSyncCounterRef,
  setLineItems,
  setStepDataSourceDrafts,
  setValues,
  buildStepDataSourceDraftKey,
  buildVirtualDataSourceRowValues,
  resolveDataSourceOutputGroup,
  resolveVirtualPreset,
  resolveVirtualPresetValue,
  resolveVirtualRowWhenContext,
  resolveRowFlowGroupConfig,
  resolveCurrentUtilisationStateForSource,
  resolveCommittedUtilisationStateForSource,
  queueStepDataSourceRefreshTick,
  updateStepDataSourceAvailability,
  validateVirtualFieldRules,
  toFiniteNumber,
  ensureRecordId,
  onGuidedStepUtilisationDraftStateChange,
  queueImmediateStepUtilisationDraftSync,
  openConfirmDialog,
  onDiagnostic
}: UseStepDataSourceOutputSyncArgs) => {
  const updateStepDataSourceAvailabilityOptimistically = React.useCallback(
    (
      config: any,
      args: {
        sourceRow: Record<string, any>;
        sourceKey: string;
        parentRowId: string;
        serverCurrentRecordUtilisedQuantity?: number;
        localCurrentRecordUtilisedQuantity?: number;
      }
    ): void => {
      const mutation = buildStepDataSourceAvailabilityOptimisticMutationAction({
        config,
        sourceRow: args.sourceRow,
        sourceKey: args.sourceKey,
        parentRowId: args.parentRowId,
        serverCurrentRecordUtilisedQuantity: args.serverCurrentRecordUtilisedQuantity,
        localCurrentRecordUtilisedQuantity: args.localCurrentRecordUtilisedQuantity,
        resolveCommittedUtilisationStateForSource,
        resolveCurrentUtilisationStateForSource
      });
      if (!mutation) return;

      mutateCachedDataSource(mutation.dataSourceConfig, language, mutation.updateItems);
      queueStepDataSourceRefreshTick();
    },
    [
      language,
      queueStepDataSourceRefreshTick,
      resolveCommittedUtilisationStateForSource,
      resolveCurrentUtilisationStateForSource
    ]
  );

  const syncStepDataSourceOutputRow = React.useCallback(
    (args: StepDataSourceOutputSyncArgs): LineItemState | null => {
      const output = resolveDataSourceOutputGroup(args.config, args.parentRow.id);
      if (!output) return null;
      const keyFieldId = (args.config?.rowKeyFieldId || '').toString().trim();
      if (!keyFieldId) return null;
      const sourceKey = `${(args.sourceRow as any)?.[keyFieldId] ?? ''}`.trim();
      if (!sourceKey) return null;
      const selectedFieldId = (args.config?.selectedFieldId || '').toString().trim();
      const quantityFieldId = (args.config?.quantityFieldId || '').toString().trim();
      const modeFieldId = (args.config?.modeFieldId || '').toString().trim();
      const exclusiveSelectionKeyFieldId = (
        args.config?.exclusiveSelection?.keyFieldId ||
        args.config?.outputKeyFieldId ||
        keyFieldId
      )
        .toString()
        .trim();
      const sameRootScope = ((args.config?.exclusiveSelection?.scope || '').toString().trim().toLowerCase() === 'sameroot');
      const sourceFieldMapping = args.config?.sourceFieldMapping && typeof args.config.sourceFieldMapping === 'object'
        ? (args.config.sourceFieldMapping as Record<string, string>)
        : {};
      const outputKeyFieldId = (args.config?.outputKeyFieldId || keyFieldId).toString().trim();
      const defaultModeValue = (args.config?.defaultModeValue ?? '').toString().trim();
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRow.id, sourceKey);
      let syncedLineItems: LineItemState | null = null;

      setLineItems(prev => {
        const outputRows = prev[output.key] || [];
        const existingOutputRow = outputRows.find(row => `${(row.values as any)?.[outputKeyFieldId] ?? ''}` === sourceKey) || null;
        const currentDraft = stepDataSourceDraftsRef.current[draftKey] || null;
        const currentRowValues = buildVirtualDataSourceRowValues({
          config: { ...args.config, sourceFieldMapping },
          sourceRow: args.sourceRow,
          outputRow: existingOutputRow,
          draftValues: currentDraft,
          parentRowId: args.parentRow.id
        });
        const nextRowValues: Record<string, FieldValue> = { ...currentRowValues, ...args.patch };

        if (selectedFieldId && args.patch[selectedFieldId] === true) {
          if (quantityFieldId && isEmptyValue(nextRowValues[quantityFieldId])) {
            const defaults = Array.isArray(args.config?.quantityDefaultRules) ? (args.config.quantityDefaultRules as any[]) : [];
            const matchedDefault = defaults.find(rule =>
              !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
                rowValues: nextRowValues,
                parentValues: args.parentRow.values as Record<string, FieldValue>
              }))
            );
            if (matchedDefault) {
              const resolved = resolveVirtualPresetValue(matchedDefault.value, {
                rowValues: nextRowValues,
                parentValues: args.parentRow.values as Record<string, FieldValue>
              });
              if (resolved !== undefined) nextRowValues[quantityFieldId] = resolved;
            }
          }
          if (modeFieldId && isEmptyValue(nextRowValues[modeFieldId]) && defaultModeValue) {
            nextRowValues[modeFieldId] = defaultModeValue;
          }
        }

        const shouldSelect = selectedFieldId ? nextRowValues[selectedFieldId] === true : true;
        const quantityValue = quantityFieldId ? Number(nextRowValues[quantityFieldId]) : undefined;
        const hasPositiveQty =
          quantityFieldId ? Number.isFinite(quantityValue) && !Number.isNaN(quantityValue) && Number(quantityValue) > 0 : true;

        let nextState: LineItemState = applyStepDataSourceExclusiveSelectionRemovalAction({
          lineItems: prev,
          rootGroupId: groupId,
          outputGroupKey: output.key,
          outputGroupId: (args.config?.outputGroupId || '').toString().trim(),
          exclusiveSelectionKeyFieldId,
          sourceKey,
          sameRootScope
        });

        setStepDataSourceDrafts(prevDrafts => {
          const nextDrafts = applyStepDataSourceDraftUpdateAction({
            previousDrafts: prevDrafts,
            draftKey,
            shouldSelect,
            selectedFieldId,
            quantityFieldId,
            modeFieldId,
            rowValues: nextRowValues
          });
          if (nextDrafts !== prevDrafts) {
            stepDataSourceDraftsRef.current = nextDrafts;
          }
          return nextDrafts;
        });

        const quantityField = quantityFieldId ? fieldByIdSafe(args.config?.fields, quantityFieldId) : null;
        const modeField = modeFieldId ? fieldByIdSafe(args.config?.fields, modeFieldId) : null;
        const hasValidationErrors =
          (quantityField ? validateVirtualFieldRules(quantityField, nextRowValues, args.parentRow.values as Record<string, FieldValue>).length > 0 : false) ||
          (modeField ? validateVirtualFieldRules(modeField, nextRowValues, args.parentRow.values as Record<string, FieldValue>).length > 0 : false);

        const matchedRule = Array.isArray(args.config?.outputRules)
          ? (args.config.outputRules as any[]).find(rule =>
              matchesWhenClause(rule?.when as any, resolveVirtualRowWhenContext({
                rowValues: nextRowValues,
                parentValues: args.parentRow.values as Record<string, FieldValue>
              }))
            )
          : null;

        if (shouldSelect && hasPositiveQty && !hasValidationErrors && matchedRule) {
          const preset = resolveVirtualPreset(matchedRule.preset as any, {
            rowValues: nextRowValues,
            parentValues: args.parentRow.values as Record<string, FieldValue>,
            sourceRow: args.sourceRow
          });
          const outputGroupConfig = (output.subConfig || resolveRowFlowGroupConfig(output.key)?.config) as any;
          nextState = applyStepDataSourceMatchedOutputRuleAction({
            previousLineItems: prev,
            nextState,
            outputKey: output.key,
            outputGroupConfig,
            existingOutputRow,
            parentGroupId: groupId,
            parentRowId: args.parentRow.id,
            outputGroupId: (args.config?.outputGroupId || 'row').toString().trim(),
            outputKeyFieldId,
            sourceKey,
            quantityFieldId,
            modeFieldId,
            rowValues: nextRowValues,
            preset,
            matchedRule
          });
        }

        const latestValues = latestValuesRef.current || {};
        const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, nextState, {
          mode: 'change'
        });
        const reconciled = applySourceFirstAncestorSelectionEffects({
          definition,
          language,
          values: nextValues,
          prevLineItems: prev,
          nextLineItems: recomputed,
          sourceGroupKey: output.key
        });
        const valuesChanged = !areFieldValueRecordsEqual(latestValues, reconciled.values);
        const lineItemsChanged = !areLineItemStatesEqual(prev, reconciled.lineItems);
        const committedValues = valuesChanged ? reconciled.values : latestValues;
        const committedLineItems = lineItemsChanged ? reconciled.lineItems : prev;
        latestValuesRef.current = committedValues;
        if (valuesChanged) {
          setValues(committedValues);
        }
        latestStepDataSourceSyncedLineItemsRef.current = committedLineItems;
        syncedLineItems = committedLineItems;
        return lineItemsChanged ? committedLineItems : prev;
      });
      return syncedLineItems;
    },
    [
      buildStepDataSourceDraftKey,
      buildVirtualDataSourceRowValues,
      definition,
      groupId,
      latestStepDataSourceSyncedLineItemsRef,
      latestValuesRef,
      language,
      resolveDataSourceOutputGroup,
      resolveRowFlowGroupConfig,
      resolveVirtualPreset,
      resolveVirtualPresetValue,
      resolveVirtualRowWhenContext,
      setLineItems,
      setStepDataSourceDrafts,
      setValues,
      stepDataSourceDraftsRef,
      validateVirtualFieldRules
    ]
  );

  const syncStepDataSourceOutputRowWithUtilisation = React.useCallback(
    (
      args: StepDataSourceOutputSyncArgs,
      options?: { skipUtilisation?: boolean }
    ) => {
      const patchTouchesLine = Object.keys(args.patch || {}).length > 0;
      if (!patchTouchesLine) return;
      const utilisationConfig = args.config?.utilisation && typeof args.config.utilisation === 'object'
        ? args.config.utilisation
        : null;
      const sourceFormKey = `${formKey || ''}`.trim();
      const resourceFormKey = `${args.config?.dataSource?.formKey || utilisationConfig?.resourceFormKey || ''}`.trim();
      const resourceRecordId = `${args.sourceRow?.id || ''}`.trim();
      const keyFieldId = `${args.config?.rowKeyFieldId || ''}`.trim();
      const output = resolveDataSourceOutputGroup(args.config, args.parentRow.id);
      const outputKeyFieldId = `${args.config?.outputKeyFieldId || keyFieldId}`.trim();
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const sourceKey = `${args.sourceRow?.[keyFieldId] ?? ''}`.trim();
      const patchTouchesUtilisation =
        Object.prototype.hasOwnProperty.call(args.patch, selectedFieldId) ||
        Object.prototype.hasOwnProperty.call(args.patch, quantityFieldId);
      const canManageUtilisation =
        !!utilisationConfig &&
        utilisationConfig.enabled !== false &&
        !!sourceFormKey &&
        !!resourceFormKey &&
        !!resourceRecordId &&
        !!quantityFieldId &&
        !!keyFieldId &&
        !!output &&
        !!outputKeyFieldId &&
        !!sourceKey;
      const draftKey = canManageUtilisation
        ? buildStepDataSourceDraftKey(args.config, args.parentRow.id, sourceKey)
        : '';

      let virtualValues: Record<string, FieldValue> | null = null;
      let nextVirtualValues: Record<string, FieldValue> | null = null;
      let optimisticServerCurrentRecordUtilisedQuantity: number | undefined;
      let optimisticLocalCurrentRecordUtilisedQuantity: number | undefined;

      if (canManageUtilisation) {
        const outputRows = lineItems[output.key] || [];
        const existingOutputRow =
          outputRows.find(candidate => `${(candidate.values as any)?.[outputKeyFieldId] ?? ''}` === sourceKey) || null;
        virtualValues = buildVirtualDataSourceRowValues({
          config: args.config,
          sourceRow: args.sourceRow,
          outputRow: existingOutputRow,
          draftValues: stepDataSourceDraftsRef.current[draftKey] || null,
          parentRowId: args.parentRow.id
        });
        if (!utilisationCommittedValuesRef.current[draftKey]) {
          const committedValues: Record<string, FieldValue> = {};
          if (selectedFieldId) committedValues[selectedFieldId] = virtualValues[selectedFieldId];
          committedValues[quantityFieldId] = virtualValues[quantityFieldId];
          if (modeFieldId) committedValues[modeFieldId] = virtualValues[modeFieldId];
          utilisationCommittedValuesRef.current[draftKey] = committedValues;
        }
        nextVirtualValues = { ...virtualValues, ...args.patch } as Record<string, FieldValue>;
        const currentSelected = selectedFieldId ? virtualValues[selectedFieldId] === true : true;
        const nextSelected = selectedFieldId ? nextVirtualValues[selectedFieldId] === true : true;
        const currentRowQuantity = currentSelected ? toFiniteNumber(virtualValues[quantityFieldId]) : 0;
        const nextRowQuantity = nextSelected ? toFiniteNumber(nextVirtualValues[quantityFieldId]) : 0;
        const currentUtilisationState = resolveCurrentUtilisationStateForSource(args.config, sourceKey, args.parentRow.id);
        const committedUtilisationState = resolveCommittedUtilisationStateForSource(args.config, sourceKey, args.parentRow.id);
        optimisticLocalCurrentRecordUtilisedQuantity = Math.max(
          0,
          currentUtilisationState.totalUtilisedQuantity - currentRowQuantity + nextRowQuantity
        );
        optimisticServerCurrentRecordUtilisedQuantity = resolveServerCurrentRecordUtilisedQuantityFromRow(
          args.sourceRow,
          committedUtilisationState.totalUtilisedQuantity
        );
      }

      const syncedLineItems = syncStepDataSourceOutputRow(args);

      if (!canManageUtilisation) return;

      const resolvedVirtualValues = virtualValues || {};
      if (!utilisationCommittedValuesRef.current[draftKey]) {
        const committedValues: Record<string, FieldValue> = {};
        if (selectedFieldId) committedValues[selectedFieldId] = resolvedVirtualValues[selectedFieldId];
        committedValues[quantityFieldId] = resolvedVirtualValues[quantityFieldId];
        if (modeFieldId) committedValues[modeFieldId] = resolvedVirtualValues[modeFieldId];
        utilisationCommittedValuesRef.current[draftKey] = committedValues;
      }
      const resolvedNextVirtualValues = (nextVirtualValues || { ...resolvedVirtualValues, ...args.patch }) as Record<string, FieldValue>;
      const quantityField = quantityFieldId ? fieldByIdSafe(args.config?.fields, quantityFieldId) : null;
      const modeField = modeFieldId ? fieldByIdSafe(args.config?.fields, modeFieldId) : null;
      const hasValidationErrors =
        (quantityField
          ? validateVirtualFieldRules(quantityField, resolvedNextVirtualValues, args.parentRow.values as Record<string, FieldValue>).length > 0
          : false) ||
        (modeField
          ? validateVirtualFieldRules(modeField, resolvedNextVirtualValues, args.parentRow.values as Record<string, FieldValue>).length > 0
          : false);
      const stepUtilisationDraftStateArgs = {
        patch: args.patch,
        selectedFieldId,
        quantityFieldId,
        selectedValue: selectedFieldId ? resolvedNextVirtualValues[selectedFieldId] : true,
        quantityValue: resolvedNextVirtualValues[quantityFieldId],
        hasValidationErrors
      };
      if (options?.skipUtilisation) {
        if (isStepUtilisationCommitEnabled(utilisationConfig) && patchTouchesUtilisation) {
          const draftStateDecision = resolveStepUtilisationDraftStateDecision({
            ...stepUtilisationDraftStateArgs,
            notifyWhenValid: true,
            validReason: 'utilisationDraftValid'
          });
          if (draftStateDecision) {
            onGuidedStepUtilisationDraftStateChange?.({
              stepId: currentGuidedStepId,
              groupId,
              parentRowId: args.parentRow.id,
              sourceKey,
              pendingInvalid: draftStateDecision.pendingInvalid,
              reason: draftStateDecision.reason,
              patchFields: Object.keys(args.patch || {}).sort()
            });
          }
        }
        return;
      }

      if (
        shouldApplyStepDataSourceAvailabilityOptimisticMutation({
          patchTouchesUtilisation,
          hasValidationErrors
        })
      ) {
        updateStepDataSourceAvailabilityOptimistically(args.config, {
          sourceRow: args.sourceRow,
          sourceKey,
          parentRowId: args.parentRow.id,
          serverCurrentRecordUtilisedQuantity: optimisticServerCurrentRecordUtilisedQuantity,
          localCurrentRecordUtilisedQuantity: optimisticLocalCurrentRecordUtilisedQuantity
        });
      }

      if (isStepUtilisationCommitEnabled(utilisationConfig)) {
        const shouldSyncImmediately = shouldImmediatelySyncStepUtilisationChange(stepUtilisationDraftStateArgs);
        const draftStateDecision = resolveStepUtilisationDraftStateDecision(stepUtilisationDraftStateArgs);
        if (draftStateDecision) {
          onGuidedStepUtilisationDraftStateChange?.({
            stepId: currentGuidedStepId,
            groupId,
            parentRowId: args.parentRow.id,
            sourceKey,
            pendingInvalid: draftStateDecision.pendingInvalid,
            reason: draftStateDecision.reason,
            patchFields: Object.keys(args.patch || {}).sort()
          });
        }
        if (shouldSyncImmediately) {
          queueImmediateStepUtilisationDraftSync({
            config: args.config,
            parentRowId: args.parentRow.id,
            sourceKey,
            patch: args.patch,
            snapshotLineItems: syncedLineItems
          });
        }
        return;
      }
      if (!patchTouchesUtilisation) return;
      const selected = selectedFieldId ? resolvedNextVirtualValues[selectedFieldId] === true : true;
      const quantity = selected ? toFiniteNumber(resolvedNextVirtualValues[quantityFieldId]) : 0;
      const debounceMs = Number.isFinite(Number(utilisationConfig.debounceMs))
        ? Number(utilisationConfig.debounceMs)
        : 250;
      const timerKey = `${groupId}::${args.parentRow.id}::${sourceKey}`;
      const previousTimer = utilisationDebounceTimersRef.current[timerKey];
      if (previousTimer) {
        clearTimeout(previousTimer);
        delete utilisationDebounceTimersRef.current[timerKey];
      }

      const runUtilisationSync = async () => {
        let sourceRecordId = `${recordId || ''}`.trim();
        if (!sourceRecordId && ensureRecordId) {
          const ensured = await ensureRecordId({
            reason: 'bankUtilisation',
            fieldPath: `${groupId}.${quantityFieldId || selectedFieldId || sourceKey}`
          });
          sourceRecordId = `${ensured?.recordId || ''}`.trim();
          if (!ensured?.success || !sourceRecordId) {
            onDiagnostic?.('bank.utilisation.ensureRecordFailed', {
              groupId,
              parentRowId: args.parentRow.id,
              resourceRecordId,
              resourceItemId: sourceKey,
              message: ensured?.message || null
            });
            return;
          }
        }
        if (!sourceRecordId) return;
        const requestVersion = (utilisationSyncCounterRef.current += 1);
        utilisationRequestVersionRef.current[timerKey] = requestVersion;
        onDiagnostic?.('bank.utilisation.request', {
          groupId,
          parentRowId: args.parentRow.id,
          resourceRecordId,
          resourceItemId: sourceKey,
          quantity
        });
        const { kindFieldId, unitFieldId } = resolveUtilisationResourceFieldIds(args.config);
        try {
          const result = await upsertBankUtilisationApi({
            resourceFormKey,
            resourceRecordId,
            resourceItemId: sourceKey,
            resourceKind: kindFieldId ? normalizeIdValue(args.sourceRow?.[kindFieldId]) || undefined : undefined,
            quantity,
            unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) || undefined : undefined,
            sourceFormKey,
            sourceRecordId,
            sourceParentGroupId: groupId,
            sourceParentRowId: args.parentRow.id,
            sourceOutputGroupId: `${args.config?.outputGroupId || ''}`.trim() || undefined,
            sourceOutputKeyFieldId: `${args.config?.outputKeyFieldId || ''}`.trim() || undefined,
            utilisationFormKey: `${utilisationConfig.utilisationFormKey || ''}`.trim() || undefined,
            allowedStatuses: Array.isArray(utilisationConfig.allowedStatuses) ? utilisationConfig.allowedStatuses : undefined
          });
          if (utilisationRequestVersionRef.current[timerKey] !== requestVersion) return;
          updateStepDataSourceAvailability(args.config, result.availability);
          onDiagnostic?.('bank.utilisation.response', {
            groupId,
            parentRowId: args.parentRow.id,
            resourceRecordId,
            resourceItemId: sourceKey,
            success: result.success,
            conflict: result.conflict === true,
            released: result.released === true,
            freeQuantity: result.availability?.freeQuantity
          });
          if (!result.success) {
            const message = buildUtilisationFailureMessage(
              resolveUserFacingErrorMessage(
                result,
                result.message || tSystem('bank.utilisationUpdateFailed', language, 'Failed to update the utilisation.')
              ) || '',
              tSystem('bank.utilisationUpdateFailed', language, 'Failed to update the utilisation.'),
              tSystem(
                'bank.utilisationUpdateFailedDetail',
                language,
                "We couldn't update the utilisation properly. Please try again."
              ),
              {
                availability: result.availability,
                itemId: sourceKey,
                itemLabel: resolveUtilisationDisplayLabel(args.config, args.sourceRow, sourceKey),
                unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) : ''
              }
            );
            if (message) {
              onDiagnostic?.('bank.utilisation.rejected', {
                groupId,
                parentRowId: args.parentRow.id,
                resourceRecordId,
                resourceItemId: sourceKey,
                message
              });
              const rollbackQty = Math.max(0, toFiniteNumber(result.availability?.currentUtilisationQuantity));
              const committedValues = utilisationCommittedValuesRef.current[draftKey] || {};
              const committedModeValue =
                modeFieldId && Object.prototype.hasOwnProperty.call(committedValues, modeFieldId)
                  ? committedValues[modeFieldId]
                  : null;
              const usableQty = computeUtilisationConflictUsableQuantity(result.availability);
              const rollbackPatch: Record<string, FieldValue> = {
                ...(selectedFieldId ? { [selectedFieldId]: rollbackQty > 0 } : {}),
                [quantityFieldId]: rollbackQty > 0 ? `${rollbackQty}` : null
              };
              if (modeFieldId) {
                rollbackPatch[modeFieldId] = rollbackQty > 0 ? committedModeValue : null;
              }
              const resolvedPatch: Record<string, FieldValue> = {
                ...(selectedFieldId ? { [selectedFieldId]: usableQty > 0 } : {}),
                [quantityFieldId]: usableQty > 0 ? `${usableQty}` : null
              };
              if (modeFieldId && usableQty <= 0) {
                resolvedPatch[modeFieldId] = null;
              }

              const conflictDialog = buildUtilisationConflictDialogCopy({
                language,
                dialog:
                  utilisationConfig?.conflictDialog && typeof utilisationConfig.conflictDialog === 'object'
                    ? utilisationConfig.conflictDialog
                    : null,
                availability: result.availability,
                requestedQuantity: quantity,
                itemId: sourceKey,
                itemLabel: resolveUtilisationDisplayLabel(args.config, args.sourceRow, sourceKey),
                unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) : '',
                fallbackTitle: tSystem('common.notice', language, 'Notice'),
                fallbackMessage: tSystem(
                  'bank.utilisationConflict',
                  language,
                  'This item was updated by another user. {availableWithUnit} are available now for {itemLabel}. Do you want to use the available amount or cancel this change?'
                ),
                fallbackConfirmLabel: tSystem(
                  'bank.useAvailable',
                  language,
                  'Use available amount'
                ),
                fallbackCancelLabel: tSystem(
                  'bank.cancelAction',
                  language,
                  'Cancel action'
                )
              });

              if (result.conflict === true && openConfirmDialog) {
                openConfirmDialog({
                  title: conflictDialog.title,
                  message: conflictDialog.message,
                  confirmLabel: conflictDialog.confirmLabel,
                  cancelLabel: conflictDialog.cancelLabel,
                  showCancel: conflictDialog.showCancel,
                  showCloseButton: conflictDialog.showCloseButton,
                  dismissOnBackdrop: conflictDialog.dismissOnBackdrop,
                  primaryAction: conflictDialog.primaryAction,
                  kind: 'bankUtilisationConflict',
                  refId: `${groupId}::${args.parentRow.id}::${sourceKey}`,
                  onConfirm: () => {
                    syncStepDataSourceOutputRowWithUtilisation(
                      {
                        ...args,
                        patch: resolvedPatch
                      },
                      { skipUtilisation: Math.abs(usableQty - rollbackQty) < 1e-9 }
                    );
                  },
                  onCancel: () => {
                    syncStepDataSourceOutputRowWithUtilisation(
                      {
                        ...args,
                        patch: rollbackPatch
                      },
                      { skipUtilisation: true }
                    );
                  }
                });
                return;
              }

              syncStepDataSourceOutputRow(
                {
                  ...args,
                  patch: rollbackPatch
                }
              );
              openConfirmDialog?.({
                title: tSystem('common.notice', language, 'Notice'),
                message,
                confirmLabel: tSystem('common.ok', language, 'OK'),
                cancelLabel: tSystem('common.cancel', language, 'Cancel'),
                showCancel: false,
                showCloseButton: true,
                dismissOnBackdrop: true,
                kind: 'bankUtilisationRejected',
                refId: `${groupId}::${args.parentRow.id}::${sourceKey}`,
                onConfirm: () => {},
                onCancel: () => {}
              });
            }
          } else {
            const committedValues: Record<string, FieldValue> = {};
            if (selectedFieldId) committedValues[selectedFieldId] = selected;
            committedValues[quantityFieldId] = quantity > 0 ? `${quantity}` : null;
            if (modeFieldId) committedValues[modeFieldId] = resolvedNextVirtualValues[modeFieldId] ?? null;
            utilisationCommittedValuesRef.current[draftKey] = committedValues;
          }
        } catch (error) {
          if (utilisationRequestVersionRef.current[timerKey] !== requestVersion) return;
          const committedValues = utilisationCommittedValuesRef.current[draftKey] || {};
          const rollbackPatch: Record<string, FieldValue> = {
            ...(selectedFieldId
              ? {
                  [selectedFieldId]:
                    Object.prototype.hasOwnProperty.call(committedValues, selectedFieldId) &&
                    committedValues[selectedFieldId] === true
                }
              : {}),
            [quantityFieldId]:
              Object.prototype.hasOwnProperty.call(committedValues, quantityFieldId) &&
              committedValues[quantityFieldId] !== undefined &&
              committedValues[quantityFieldId] !== null &&
              `${committedValues[quantityFieldId]}`.trim() !== ''
                ? `${committedValues[quantityFieldId]}`
                : null
          };
          if (modeFieldId) {
            rollbackPatch[modeFieldId] =
              Object.prototype.hasOwnProperty.call(committedValues, modeFieldId) &&
              committedValues[modeFieldId] !== undefined &&
              committedValues[modeFieldId] !== null &&
              `${committedValues[modeFieldId]}`.trim() !== ''
                ? committedValues[modeFieldId]
                : null;
          }
          syncStepDataSourceOutputRow({
            ...args,
            patch: rollbackPatch
          });
          const message = buildUtilisationFailureMessage(
            resolveUserFacingErrorMessage(
              error,
              tSystem('bank.utilisationUpdateFailed', language, 'Failed to update the utilisation.')
            ) || '',
            tSystem('bank.utilisationUpdateFailed', language, 'Failed to update the utilisation.'),
            tSystem(
              'bank.utilisationUpdateFailedDetail',
              language,
              "We couldn't update the utilisation properly. Please try again."
            ),
            {
              itemId: sourceKey,
              itemLabel: resolveUtilisationDisplayLabel(args.config, args.sourceRow, sourceKey),
              unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) : ''
            }
          );
          onDiagnostic?.('bank.utilisation.error', {
            groupId,
            parentRowId: args.parentRow.id,
            resourceRecordId,
            resourceItemId: sourceKey,
            message: (error as any)?.message || String(error || '')
          });
          openConfirmDialog?.({
            title: tSystem('common.notice', language, 'Notice'),
            message,
            confirmLabel: tSystem('common.ok', language, 'OK'),
            cancelLabel: tSystem('common.cancel', language, 'Cancel'),
            showCancel: false,
            showCloseButton: true,
            dismissOnBackdrop: true,
            kind: 'bankUtilisationRejected',
            refId: `${groupId}::${args.parentRow.id}::${sourceKey}`,
            onConfirm: () => {},
            onCancel: () => {}
          });
        }
      };

      if (quantity <= 0) {
        void runUtilisationSync();
        return;
      }

      utilisationDebounceTimersRef.current[timerKey] = setTimeout(() => {
        delete utilisationDebounceTimersRef.current[timerKey];
        void runUtilisationSync();
      }, Math.max(0, debounceMs));
    },
    [
      buildStepDataSourceDraftKey,
      buildVirtualDataSourceRowValues,
      currentGuidedStepId,
      ensureRecordId,
      formKey,
      groupId,
      language,
      lineItems,
      onGuidedStepUtilisationDraftStateChange,
      onDiagnostic,
      openConfirmDialog,
      queueImmediateStepUtilisationDraftSync,
      recordId,
      resolveCommittedUtilisationStateForSource,
      resolveCurrentUtilisationStateForSource,
      resolveDataSourceOutputGroup,
      utilisationCommittedValuesRef,
      utilisationDebounceTimersRef,
      utilisationRequestVersionRef,
      utilisationSyncCounterRef,
      stepDataSourceDraftsRef,
      syncStepDataSourceOutputRow,
      toFiniteNumber,
      updateStepDataSourceAvailability,
      updateStepDataSourceAvailabilityOptimistically,
      validateVirtualFieldRules
    ]
  );

  return {
    syncStepDataSourceOutputRow,
    syncStepDataSourceOutputRowWithUtilisation
  };
};
