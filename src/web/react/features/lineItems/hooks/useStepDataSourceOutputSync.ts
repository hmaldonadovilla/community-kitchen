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
import { resolveUserFacingErrorMessage, upsertInventoryReservationApi } from '../../../api';
import { applySourceFirstAncestorSelectionEffects } from '../../../app/sourceFirstAncestorSelectionSync';
import { applyValueMapsToForm } from '../../../app/valueMaps';
import type { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';
import {
  buildReservationConflictDialogCopy,
  computeReservationConflictUsableQuantity
} from '../../../components/form/reservationConflictDialog';
import {
  buildReservationFailureMessage,
  isStepReservationCommitEnabled,
  shouldBlockDataSourceFreshnessForInvalidStepReservation,
  shouldImmediatelySyncStepReservationChange
} from '../../../components/form/reservationSyncPolicy';
import { applyStepDataSourceDraftUpdateAction } from '../../../components/form/stepDataSourceDrafts';
import { applyStepDataSourceExclusiveSelectionRemovalAction } from '../../../components/form/stepDataSourceExclusiveSelection';
import { buildStepDataSourceAvailabilityOptimisticMutationAction } from '../../../components/form/stepDataSourceAvailability';
import {
  applyStepDataSourceMatchedOutputRuleAction
} from '../../../components/form/stepDataSourceRows';
import {
  resolveServerCurrentRecordReservedQuantityFromRow
} from '../../../components/form/virtualDataSourceRowValues';
import { resolveReservationDisplayLabel } from '../../reservations/displayLabel';
import { resolveReservationResourceFieldIds } from '../../reservations/sourceFields';
import {
  fieldByIdSafe,
  normalizeIdValue
} from '../domain/lineItemPresentation';

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
  reservationCommittedValuesRef: React.MutableRefObject<Record<string, Record<string, FieldValue>>>;
  reservationDebounceTimersRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  reservationRequestVersionRef: React.MutableRefObject<Record<string, number>>;
  reservationSyncCounterRef: React.MutableRefObject<number>;
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
  resolveCurrentReservationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalReservedQuantity: number; currentRowQuantity: number };
  resolveCommittedReservationStateForSource: (
    config: any,
    sourceKey: string,
    currentParentRowId?: string
  ) => { totalReservedQuantity: number; currentRowQuantity: number };
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
  onGuidedStepReservationDraftStateChange?: (event: any) => void;
  queueImmediateStepReservationDraftSync: (args: {
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
 * Keeps source-row output mutation, reservation sync, rollback, and value-map
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
  reservationCommittedValuesRef,
  reservationDebounceTimersRef,
  reservationRequestVersionRef,
  reservationSyncCounterRef,
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
  resolveCurrentReservationStateForSource,
  resolveCommittedReservationStateForSource,
  queueStepDataSourceRefreshTick,
  updateStepDataSourceAvailability,
  validateVirtualFieldRules,
  toFiniteNumber,
  ensureRecordId,
  onGuidedStepReservationDraftStateChange,
  queueImmediateStepReservationDraftSync,
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
        serverCurrentRecordReservedQuantity?: number;
        localCurrentRecordReservedQuantity?: number;
      }
    ): void => {
      const mutation = buildStepDataSourceAvailabilityOptimisticMutationAction({
        config,
        sourceRow: args.sourceRow,
        sourceKey: args.sourceKey,
        parentRowId: args.parentRowId,
        serverCurrentRecordReservedQuantity: args.serverCurrentRecordReservedQuantity,
        localCurrentRecordReservedQuantity: args.localCurrentRecordReservedQuantity,
        resolveCommittedReservationStateForSource,
        resolveCurrentReservationStateForSource
      });
      if (!mutation) return;

      mutateCachedDataSource(mutation.dataSourceConfig, language, mutation.updateItems);
      queueStepDataSourceRefreshTick();
    },
    [
      language,
      queueStepDataSourceRefreshTick,
      resolveCommittedReservationStateForSource,
      resolveCurrentReservationStateForSource
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
        latestValuesRef.current = reconciled.values;
        setValues(reconciled.values);
        latestStepDataSourceSyncedLineItemsRef.current = reconciled.lineItems;
        syncedLineItems = reconciled.lineItems;
        return reconciled.lineItems;
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

  const syncStepDataSourceOutputRowWithReservation = React.useCallback(
    (
      args: StepDataSourceOutputSyncArgs,
      options?: { skipReservation?: boolean }
    ) => {
      const patchTouchesLine = Object.keys(args.patch || {}).length > 0;
      if (!patchTouchesLine) return;
      const reservationConfig = args.config?.reservation && typeof args.config.reservation === 'object'
        ? args.config.reservation
        : null;
      const sourceFormKey = `${formKey || ''}`.trim();
      const resourceFormKey = `${args.config?.dataSource?.formKey || reservationConfig?.resourceFormKey || ''}`.trim();
      const resourceRecordId = `${args.sourceRow?.id || ''}`.trim();
      const keyFieldId = `${args.config?.rowKeyFieldId || ''}`.trim();
      const output = resolveDataSourceOutputGroup(args.config, args.parentRow.id);
      const outputKeyFieldId = `${args.config?.outputKeyFieldId || keyFieldId}`.trim();
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const sourceKey = `${args.sourceRow?.[keyFieldId] ?? ''}`.trim();
      const patchTouchesReservation =
        Object.prototype.hasOwnProperty.call(args.patch, selectedFieldId) ||
        Object.prototype.hasOwnProperty.call(args.patch, quantityFieldId);
      const canManageReservation =
        !!reservationConfig &&
        reservationConfig.enabled !== false &&
        !!sourceFormKey &&
        !!resourceFormKey &&
        !!resourceRecordId &&
        !!quantityFieldId &&
        !!keyFieldId &&
        !!output &&
        !!outputKeyFieldId &&
        !!sourceKey;
      const draftKey = canManageReservation
        ? buildStepDataSourceDraftKey(args.config, args.parentRow.id, sourceKey)
        : '';

      let virtualValues: Record<string, FieldValue> | null = null;
      let nextVirtualValues: Record<string, FieldValue> | null = null;
      let optimisticServerCurrentRecordReservedQuantity: number | undefined;
      let optimisticLocalCurrentRecordReservedQuantity: number | undefined;

      if (canManageReservation) {
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
        if (!reservationCommittedValuesRef.current[draftKey]) {
          const committedValues: Record<string, FieldValue> = {};
          if (selectedFieldId) committedValues[selectedFieldId] = virtualValues[selectedFieldId];
          committedValues[quantityFieldId] = virtualValues[quantityFieldId];
          if (modeFieldId) committedValues[modeFieldId] = virtualValues[modeFieldId];
          reservationCommittedValuesRef.current[draftKey] = committedValues;
        }
        nextVirtualValues = { ...virtualValues, ...args.patch } as Record<string, FieldValue>;
        const currentSelected = selectedFieldId ? virtualValues[selectedFieldId] === true : true;
        const nextSelected = selectedFieldId ? nextVirtualValues[selectedFieldId] === true : true;
        const currentRowQuantity = currentSelected ? toFiniteNumber(virtualValues[quantityFieldId]) : 0;
        const nextRowQuantity = nextSelected ? toFiniteNumber(nextVirtualValues[quantityFieldId]) : 0;
        const currentReservationState = resolveCurrentReservationStateForSource(args.config, sourceKey, args.parentRow.id);
        const committedReservationState = resolveCommittedReservationStateForSource(args.config, sourceKey, args.parentRow.id);
        optimisticLocalCurrentRecordReservedQuantity = Math.max(
          0,
          currentReservationState.totalReservedQuantity - currentRowQuantity + nextRowQuantity
        );
        optimisticServerCurrentRecordReservedQuantity = resolveServerCurrentRecordReservedQuantityFromRow(
          args.sourceRow,
          committedReservationState.totalReservedQuantity
        );
      }

      const syncedLineItems = syncStepDataSourceOutputRow(args);

      if (options?.skipReservation) return;
      if (!canManageReservation) return;

      if (patchTouchesReservation) {
        updateStepDataSourceAvailabilityOptimistically(args.config, {
          sourceRow: args.sourceRow,
          sourceKey,
          parentRowId: args.parentRow.id,
          serverCurrentRecordReservedQuantity: optimisticServerCurrentRecordReservedQuantity,
          localCurrentRecordReservedQuantity: optimisticLocalCurrentRecordReservedQuantity
        });
      }

      const resolvedVirtualValues = virtualValues || {};
      if (!reservationCommittedValuesRef.current[draftKey]) {
        const committedValues: Record<string, FieldValue> = {};
        if (selectedFieldId) committedValues[selectedFieldId] = resolvedVirtualValues[selectedFieldId];
        committedValues[quantityFieldId] = resolvedVirtualValues[quantityFieldId];
        if (modeFieldId) committedValues[modeFieldId] = resolvedVirtualValues[modeFieldId];
        reservationCommittedValuesRef.current[draftKey] = committedValues;
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
      if (isStepReservationCommitEnabled(reservationConfig)) {
        const syncArgs = {
          patch: args.patch,
          selectedFieldId,
          quantityFieldId,
          selectedValue: selectedFieldId ? resolvedNextVirtualValues[selectedFieldId] : true,
          quantityValue: resolvedNextVirtualValues[quantityFieldId],
          hasValidationErrors
        };
        const shouldSyncImmediately = shouldImmediatelySyncStepReservationChange(syncArgs);
        const pendingInvalid = shouldBlockDataSourceFreshnessForInvalidStepReservation(syncArgs);
        if (pendingInvalid || shouldSyncImmediately) {
          onGuidedStepReservationDraftStateChange?.({
            stepId: currentGuidedStepId,
            groupId,
            parentRowId: args.parentRow.id,
            sourceKey,
            pendingInvalid,
            reason: pendingInvalid ? 'invalidReservationDraft' : 'reservationSyncQueued',
            patchFields: Object.keys(args.patch || {}).sort()
          });
        }
        if (shouldSyncImmediately) {
          queueImmediateStepReservationDraftSync({
            config: args.config,
            parentRowId: args.parentRow.id,
            sourceKey,
            patch: args.patch,
            snapshotLineItems: syncedLineItems
          });
        }
        return;
      }
      if (!patchTouchesReservation) return;
      const selected = selectedFieldId ? resolvedNextVirtualValues[selectedFieldId] === true : true;
      const quantity = selected ? toFiniteNumber(resolvedNextVirtualValues[quantityFieldId]) : 0;
      const debounceMs = Number.isFinite(Number(reservationConfig.debounceMs))
        ? Number(reservationConfig.debounceMs)
        : 250;
      const timerKey = `${groupId}::${args.parentRow.id}::${sourceKey}`;
      const previousTimer = reservationDebounceTimersRef.current[timerKey];
      if (previousTimer) {
        clearTimeout(previousTimer);
        delete reservationDebounceTimersRef.current[timerKey];
      }

      const runReservationSync = async () => {
        let sourceRecordId = `${recordId || ''}`.trim();
        if (!sourceRecordId && ensureRecordId) {
          const ensured = await ensureRecordId({
            reason: 'inventoryReservation',
            fieldPath: `${groupId}.${quantityFieldId || selectedFieldId || sourceKey}`
          });
          sourceRecordId = `${ensured?.recordId || ''}`.trim();
          if (!ensured?.success || !sourceRecordId) {
            onDiagnostic?.('inventory.reservation.ensureRecordFailed', {
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
        const requestVersion = (reservationSyncCounterRef.current += 1);
        reservationRequestVersionRef.current[timerKey] = requestVersion;
        onDiagnostic?.('inventory.reservation.request', {
          groupId,
          parentRowId: args.parentRow.id,
          resourceRecordId,
          resourceItemId: sourceKey,
          quantity
        });
        const { kindFieldId, unitFieldId } = resolveReservationResourceFieldIds(args.config);
        try {
          const result = await upsertInventoryReservationApi({
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
            ledgerFormKey: `${reservationConfig.ledgerFormKey || ''}`.trim() || undefined,
            allowedStatuses: Array.isArray(reservationConfig.allowedStatuses) ? reservationConfig.allowedStatuses : undefined
          });
          if (reservationRequestVersionRef.current[timerKey] !== requestVersion) return;
          updateStepDataSourceAvailability(args.config, result.availability);
          onDiagnostic?.('inventory.reservation.response', {
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
            const message = buildReservationFailureMessage(
              resolveUserFacingErrorMessage(
                result,
                result.message || tSystem('inventory.reservationUpdateFailed', language, 'Failed to update the reservation.')
              ) || '',
              tSystem('inventory.reservationUpdateFailed', language, 'Failed to update the reservation.'),
              tSystem(
                'inventory.reservationUpdateFailedDetail',
                language,
                "We couldn't update the reservation properly. Please try again."
              ),
              {
                availability: result.availability,
                itemId: sourceKey,
                itemLabel: resolveReservationDisplayLabel(args.config, args.sourceRow, sourceKey),
                unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) : ''
              }
            );
            if (message) {
              onDiagnostic?.('inventory.reservation.rejected', {
                groupId,
                parentRowId: args.parentRow.id,
                resourceRecordId,
                resourceItemId: sourceKey,
                message
              });
              const rollbackQty = Math.max(0, toFiniteNumber(result.availability?.currentReservationQuantity));
              const committedValues = reservationCommittedValuesRef.current[draftKey] || {};
              const committedModeValue =
                modeFieldId && Object.prototype.hasOwnProperty.call(committedValues, modeFieldId)
                  ? committedValues[modeFieldId]
                  : null;
              const usableQty = computeReservationConflictUsableQuantity(result.availability);
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

              const conflictDialog = buildReservationConflictDialogCopy({
                language,
                dialog:
                  reservationConfig?.conflictDialog && typeof reservationConfig.conflictDialog === 'object'
                    ? reservationConfig.conflictDialog
                    : null,
                availability: result.availability,
                requestedQuantity: quantity,
                itemId: sourceKey,
                itemLabel: resolveReservationDisplayLabel(args.config, args.sourceRow, sourceKey),
                unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) : '',
                fallbackTitle: tSystem('common.notice', language, 'Notice'),
                fallbackMessage: tSystem(
                  'inventory.reservationConflict',
                  language,
                  'This item was updated by another user. {availableWithUnit} are available now for {itemLabel}. Do you want to use the available amount or cancel this change?'
                ),
                fallbackConfirmLabel: tSystem(
                  'inventory.useAvailable',
                  language,
                  'Use available amount'
                ),
                fallbackCancelLabel: tSystem(
                  'inventory.cancelAction',
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
                  kind: 'inventoryReservationConflict',
                  refId: `${groupId}::${args.parentRow.id}::${sourceKey}`,
                  onConfirm: () => {
                    syncStepDataSourceOutputRowWithReservation(
                      {
                        ...args,
                        patch: resolvedPatch
                      },
                      { skipReservation: Math.abs(usableQty - rollbackQty) < 1e-9 }
                    );
                  },
                  onCancel: () => {
                    syncStepDataSourceOutputRowWithReservation(
                      {
                        ...args,
                        patch: rollbackPatch
                      },
                      { skipReservation: true }
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
                kind: 'inventoryReservationRejected',
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
            reservationCommittedValuesRef.current[draftKey] = committedValues;
          }
        } catch (error) {
          if (reservationRequestVersionRef.current[timerKey] !== requestVersion) return;
          const committedValues = reservationCommittedValuesRef.current[draftKey] || {};
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
          const message = buildReservationFailureMessage(
            resolveUserFacingErrorMessage(
              error,
              tSystem('inventory.reservationUpdateFailed', language, 'Failed to update the reservation.')
            ) || '',
            tSystem('inventory.reservationUpdateFailed', language, 'Failed to update the reservation.'),
            tSystem(
              'inventory.reservationUpdateFailedDetail',
              language,
              "We couldn't update the reservation properly. Please try again."
            ),
            {
              itemId: sourceKey,
              itemLabel: resolveReservationDisplayLabel(args.config, args.sourceRow, sourceKey),
              unit: unitFieldId ? normalizeIdValue(args.sourceRow?.[unitFieldId]) : ''
            }
          );
          onDiagnostic?.('inventory.reservation.error', {
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
            kind: 'inventoryReservationRejected',
            refId: `${groupId}::${args.parentRow.id}::${sourceKey}`,
            onConfirm: () => {},
            onCancel: () => {}
          });
        }
      };

      if (quantity <= 0) {
        void runReservationSync();
        return;
      }

      reservationDebounceTimersRef.current[timerKey] = setTimeout(() => {
        delete reservationDebounceTimersRef.current[timerKey];
        void runReservationSync();
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
      onGuidedStepReservationDraftStateChange,
      onDiagnostic,
      openConfirmDialog,
      queueImmediateStepReservationDraftSync,
      recordId,
      resolveCommittedReservationStateForSource,
      resolveCurrentReservationStateForSource,
      resolveDataSourceOutputGroup,
      reservationCommittedValuesRef,
      reservationDebounceTimersRef,
      reservationRequestVersionRef,
      reservationSyncCounterRef,
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
    syncStepDataSourceOutputRowWithReservation
  };
};
