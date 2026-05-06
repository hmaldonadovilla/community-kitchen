import React from 'react';
import {
  getOptionStateValue,
  matchesWhenClause,
  toOptionSet
} from '../../../core';
import {
  FieldValue,
  LineItemRowState,
  OptionSet,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../types';
import { resolveLabel } from '../../utils/labels';
import { OptionState } from '../../types';
import {
  resolveFieldHelperText,
} from './utils';
import { srOnly } from './ui';
import { SectionInstruction } from './SectionInstruction';
import { toFiniteNumberValue } from './quantityConstraints';
import { shouldHideSupplementalHelperTextForDataSourceRows } from './lineItemGroupQuestionHelperText';
import { buildSourceFirstPresentationEntries } from './sourceFirstPresentationEntries';
import { resolveVirtualPresetAction, resolveVirtualPresetValueAction } from './virtualPreset';
import {
  allowsVirtualIntegerOnlyAction,
  buildVirtualRowWhenContext,
  resolveVirtualMaxFieldIdAction,
  validateVirtualFieldRulesAction
} from './virtualRowContext';
import {
  resolveLocalReservationQuantityForVisibility,
  resolveReservationQuantityFromValues
} from './reservationQuantity';
import {
  buildVirtualDataSourceRowValuesAction
} from './virtualDataSourceRowValues';
import {
  applyStepDataSourceNestedPresetNormalizationsAction,
  buildStepDataSourceNestedPresetNormalizationSignatureAction,
  collectStepDataSourceNestedPresetNormalizationsAction,
  decorateStepDataSourceRowForVisibilityAction,
  resolveDataSourceOutputGroupAction,
  resolveStepDataSourceReservationStateForSourceAction,
  resolveStepDataSourceRowsAction,
  resolveStepDataSourceRowsForParentAction
} from './stepDataSourceRows';
import {
  applyLineItemRowSort
} from '../../app/lineItemRowSort';
import { LineItemUploadFailureNotice } from '../../features/lineItems/components/LineItemUploadFailureNotice';
import { LineItemTotals } from '../../features/lineItems/components/LineItemTotals';
import { RowFlowGroupOutputActions } from '../../features/lineItems/components/RowFlowGroupOutputActions';
import { LineItemGroupRowsRenderer } from '../../features/lineItems/components/LineItemGroupRowsRenderer';
import { LineItemSectionSelectorControl } from '../../features/lineItems/components/LineItemSectionSelectorControl';
import { SourceFirstAllocationList } from '../../features/lineItems/components/SourceFirstAllocationList';
import { LineItemTableModeRenderer } from '../../features/lineItems/components/LineItemTableModeRenderer';
import { useLineItemAttentionAutoExpand } from '../../features/lineItems/components/useLineItemAttentionAutoExpand';
import { useLineItemGroupControls } from '../../features/lineItems/components/useLineItemGroupControls';
import { useLineItemAutoAddEffects } from '../../features/lineItems/hooks/useLineItemAutoAddEffects';
import { useGuidedStepDataSourceState } from '../../features/lineItems/hooks/useGuidedStepDataSourceState';
import { useLineItemGroupPresentationState } from '../../features/lineItems/hooks/useLineItemGroupPresentationState';
import { useLineItemSelectionEffectInit } from '../../features/lineItems/hooks/useLineItemSelectionEffectInit';
import { useRowFlowActionController } from '../../features/lineItems/hooks/useRowFlowActionController';
import { useRowFlowGroupOutputState } from '../../features/lineItems/hooks/useRowFlowGroupOutputState';
import { useRowFlowRuntimeState } from '../../features/lineItems/hooks/useRowFlowRuntimeState';
import { useStepDataSourceAvailabilityReconciliation } from '../../features/lineItems/hooks/useStepDataSourceAvailabilityReconciliation';
import { useStepDataSourceOutputSync } from '../../features/lineItems/hooks/useStepDataSourceOutputSync';
import { useStepDataSourceReservationDrafts } from '../../features/lineItems/hooks/useStepDataSourceReservationDrafts';
import type {
  LineFileUploadOrderedEntryCheckArgs,
  LineItemGroupQuestionProps
} from './lineItemGroupQuestionTypes';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

export const LineItemGroupQuestion: React.FC<LineItemGroupQuestionProps> = ({
  q,
  ctx,
  rowFlow,
  rowFilter,
  dataSourceRows,
  dataSourceBootstrap,
  hideInlineSubgroups,
  hideToolbars,
  supplementalHelperText,
  hideSupplementalHelperWhenNoSourceRows
}) => {
  const {
    formKey,
    recordId,
    recordMeta,
    definition,
    language,
    values,
    resolveVisibilityValue,
    getTopValue: getTopValueFromCtx,
    setValues,
    lineItems,
    setLineItems,
    isSubmitting: isSubmittingFromCtx,
    submitting,
    isFieldLockedByDedup,
    errors,
    setErrors,
    warningByField,
    optionState,
    setOptionState,
    ensureLineOptions,
    renderChoiceControl,
    openInfoOverlay,
    openFileOverlay,
    checkFileUploadOrderedEntry,
    openSubgroupOverlay,
    openLineItemGroupOverlay,
    addLineItemRowManual,
    removeLineRow,
    setAutoSaveHold,
    ensureRecordId,
    queueGuidedStepReservationDraftSync,
    onGuidedStepReservationDraftStateChange,
    waitForGuidedStepReservationDraftSync,
    handleLineFieldChange,
    collapsedGroups,
    toggleGroupCollapsed,
    collapsedRows,
    setCollapsedRows,
    collapsedSubgroups,
    setCollapsedSubgroups,
    subgroupSelectors,
    setSubgroupSelectors,
    subgroupBottomRefs,
    fileInputsRef,
    dragState: _dragState,
    incrementDrag: _incrementDrag,
    decrementDrag: _decrementDrag,
    uploadAnnouncements,
    uploadFailures,
    onRetryUploadFailure,
    openConfirmDialog,
    handleLineFileInputChange,
    handleLineFileDrop: _handleLineFileDrop,
    removeLineFile,
    clearLineFiles,
    errorIndex,
    setOverlay,
    onDiagnostic
  } = ctx;

  const renderUploadFailure = React.useCallback(
    (fieldPath: string, disabled?: boolean) => (
      <LineItemUploadFailureNotice
        language={language}
        fieldPath={fieldPath}
        failure={uploadFailures?.[fieldPath]}
        disabled={disabled}
        onRetry={onRetryUploadFailure}
      />
    ),
    [language, onRetryUploadFailure, uploadFailures]
  );

  const isFileUploadOrderedEntryBlocked = React.useCallback(
    (args: LineFileUploadOrderedEntryCheckArgs): boolean => Boolean(checkFileUploadOrderedEntry?.(args)),
    [checkFileUploadOrderedEntry]
  );

  const resolveTopValue = React.useCallback(
    (fieldId: string): FieldValue | undefined => {
      if (getTopValueFromCtx) return getTopValueFromCtx(fieldId);
      if (resolveVisibilityValue) return resolveVisibilityValue(fieldId);
      return values[fieldId];
    },
    [getTopValueFromCtx, resolveVisibilityValue, values]
  );

  const isIncludedByRowFilter = React.useCallback(
    (rowValues: Record<string, FieldValue>): boolean => {
      if (!rowFilter) return true;
      const includeWhen = (rowFilter as any)?.includeWhen;
      const excludeWhen = (rowFilter as any)?.excludeWhen;
      const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
      const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
      const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
      return includeOk && !excludeMatch;
    },
    [rowFilter]
  );

  const renderRowsAll = lineItems[q.id] || [];
  const parentRowsFiltered = rowFilter
    ? renderRowsAll.filter(r => isIncludedByRowFilter(((r as any)?.values || {}) as any))
    : renderRowsAll;
  const parentRows = applyLineItemRowSort({
    rows: parentRowsFiltered,
    fields: q.lineItemConfig?.fields || [],
    config: (q.lineItemConfig?.ui as any)?.rowSort
  });
  const latestValuesRef = React.useRef(values);
  latestValuesRef.current = values;

  const groupChoiceSearchDefault = (q.lineItemConfig?.ui as any)?.choiceSearchEnabled;
  const groupHelperCfg = resolveFieldHelperText({ ui: q.ui, language });
  const groupHelperText = groupHelperCfg.text;
  const groupHelperNode =
    groupHelperText && !submitting && q.readOnly !== true && q.ui?.renderAsLabel !== true
      ? <div className="ck-field-helper">{groupHelperText}</div>
      : null;
  const isSubmittingNow = isSubmittingFromCtx === true;
  const isLineFieldLockedByRule = React.useCallback(
    (fieldId: string | undefined | null): boolean => {
      if (isSubmittingNow) return true;
      const id = fieldId !== undefined && fieldId !== null ? fieldId.toString().trim() : '';
      if (!id) return submitting;
      if (typeof isFieldLockedByDedup === 'function') return isFieldLockedByDedup(id);
      return submitting;
    },
    [isFieldLockedByDedup, isSubmittingNow, submitting]
  );
  const isLineFieldInteractionBlocked = React.useCallback(
    (field: any): boolean => isLineFieldLockedByRule(field?.id),
    [isLineFieldLockedByRule]
  );
  const isLineFieldInputDisabled = React.useCallback(
    (field: any): boolean => isLineFieldInteractionBlocked(field) || field?.readOnly === true,
    [isLineFieldInteractionBlocked]
  );

  // IMPORTANT: section selectors can commit their value on blur (e.g., SearchableSelect).
  // When the user clicks "Add" while the selector still has focus, the click handler can run
  // before React state has re-rendered with the committed value. These refs ensure we can
  // read the latest committed selector values synchronously in the Add handlers.
  const latestSectionSelectorValueRef = React.useRef<string>('');
  const latestSubgroupSelectorValueRef = React.useRef<Record<string, string>>({});
  const selectorSearchLoggedRef = React.useRef<Set<string>>(new Set());
  const selectorOverlayLoggedRef = React.useRef<Set<string>>(new Set());
  const selectorLabelLoggedRef = React.useRef<Set<string>>(new Set());
  const overlayOpenActionLoggedRef = React.useRef<Set<string>>(new Set());
  const rowFlowLoggedRef = React.useRef<Set<string>>(new Set());
  const rowFlowPromptRef = React.useRef<Record<string, string>>({});
  const {
    rowFlowEnabled,
    rowFlowSubGroupIds,
    rowFlowActionById,
    parentRowById,
    resolveRowFlowGroupConfig,
    resolveRowFlowFieldConfig,
    activeFieldMeta,
    rowFlowStateByRowId
  } = useRowFlowRuntimeState({
    q,
    definitionQuestions: definition.questions,
    rowFlow,
    parentRows,
    lineItems,
    values
  });

  const {
    currentGuidedStepId,
    activeStepDataSourceRows,
    sourceFirstDataSourceRows,
    stepDataSourceRefreshTick,
    queueStepDataSourceRefreshTick,
    stepDataSourceDrafts,
    setStepDataSourceDrafts,
    stepDataSourceDraftsRef,
    reservationDebounceTimersRef,
    reservationRequestVersionRef,
    reservationCommittedValuesRef,
    reservationSyncCounterRef,
    latestStepDataSourceSyncedLineItemsRef,
    deferredReservationAutoSaveHoldReleaseTimerRef,
    isStepDataSourceLoading,
    queueStepReservationDraftSnapshotSync,
    queueImmediateStepReservationDraftSync,
    updateStepDataSourceAvailability,
    applyStepDataSourceAvailabilitySnapshots
  } = useGuidedStepDataSourceState({
    groupId: q.id,
    definition,
    recordId,
    language,
    values,
    lineItems,
    dataSourceRows,
    dataSourceBootstrap,
    parentRowCount: parentRows.length,
    resolveTopValue,
    queueGuidedStepReservationDraftSync,
    waitForGuidedStepReservationDraftSync,
    onDiagnostic
  });

  const toFiniteNumber = React.useCallback((value: any): number => toFiniteNumberValue(value), []);

  const resolveVirtualRowWhenContext = React.useCallback(
    (args: {
      rowValues: Record<string, FieldValue>;
      parentValues?: Record<string, FieldValue>;
    }): VisibilityContext => buildVirtualRowWhenContext({ ...args, lineItems, resolveTopValue }),
    [lineItems, resolveTopValue]
  );

  const validateVirtualFieldRules = React.useCallback(
    (
      field: any,
      rowValues: Record<string, FieldValue>,
      parentValues?: Record<string, FieldValue>
    ): string[] => {
      return validateVirtualFieldRulesAction({
        field,
        rowValues,
        parentValues,
        language,
        lineItems,
        resolveTopValue
      });
    },
    [language, lineItems, resolveTopValue]
  );

  const resolveVirtualPresetValue = React.useCallback(
    (
      raw: any,
      args: {
        rowValues: Record<string, FieldValue>;
        parentValues?: Record<string, FieldValue>;
        sourceRow?: Record<string, any>;
      }
    ): FieldValue | undefined => {
      return resolveVirtualPresetValueAction({ raw, context: args, resolveTopValue });
    },
    [resolveTopValue]
  );

  const resolveVirtualPreset = React.useCallback(
    (
      preset: Record<string, any> | undefined,
      args: {
        rowValues: Record<string, FieldValue>;
        parentValues?: Record<string, FieldValue>;
        sourceRow?: Record<string, any>;
      }
    ): Record<string, FieldValue> => {
      return resolveVirtualPresetAction({ preset, context: args, resolveTopValue });
    },
    [resolveTopValue]
  );

  const buildStepDataSourceDraftKey = React.useCallback(
    (config: any, parentRowId: string, sourceKey: string): string => {
      const configId = `${config?.id || 'datasourceRows'}`.trim();
      return `${q.id}::${configId}::${parentRowId}::${sourceKey}`;
    },
    [q.id]
  );

  const decorateStepDataSourceRowForVisibility = React.useCallback(
    (config: any, sourceRow: Record<string, any>, _currentParentRowId?: string): Record<string, any> => {
      return decorateStepDataSourceRowForVisibilityAction({
        config,
        sourceRow,
        groupId: q.id,
        parentRows,
        lineItems,
        stepDataSourceDrafts: stepDataSourceDraftsRef.current,
        reservationCommittedValues: reservationCommittedValuesRef.current,
        buildStepDataSourceDraftKey,
        resolveLocalReservationQuantityForVisibility,
        resolveReservationQuantityFromValues
      });
    },
    [buildStepDataSourceDraftKey, lineItems, parentRows, q.id, reservationCommittedValuesRef, stepDataSourceDraftsRef]
  );

  const resolveStepDataSourceRows = React.useCallback(
    (config: any, currentParentRowId?: string): any[] => {
      return resolveStepDataSourceRowsAction({
        config,
        currentParentRowId,
        refreshTick: stepDataSourceRefreshTick,
        isStepDataSourceLoading,
        language,
        values,
        lineItems,
        decorateStepDataSourceRowForVisibility
      });
    },
    [decorateStepDataSourceRowForVisibility, isStepDataSourceLoading, language, lineItems, stepDataSourceRefreshTick, values]
  );

  const resolveStepDataSourceRowsForParent = React.useCallback(
    (config: any, parentRow: LineItemRowState): any[] => {
      return resolveStepDataSourceRowsForParentAction({
        config,
        parentRow,
        values,
        lineItems,
        resolveStepDataSourceRows
      });
    },
    [lineItems, resolveStepDataSourceRows, values]
  );

  const sourceFirstPresentationEntries = React.useMemo(
    () =>
      buildSourceFirstPresentationEntries({
        sourceFirstDataSourceRows,
        stepDataSourceDrafts,
        parentRows,
        values,
        lineItems,
        language,
        isStepDataSourceLoading,
        resolveStepDataSourceRows,
        decorateStepDataSourceRowForVisibility
      }),
    [
      decorateStepDataSourceRowForVisibility,
      isStepDataSourceLoading,
      language,
      lineItems,
      parentRows,
      resolveStepDataSourceRows,
      sourceFirstDataSourceRows,
      stepDataSourceDrafts,
      values
    ]
  );

  const hideSupplementalHelper = React.useMemo(
    () =>
      shouldHideSupplementalHelperTextForDataSourceRows({
        hideWhenNoSourceRows: hideSupplementalHelperWhenNoSourceRows,
        entries: sourceFirstPresentationEntries
      }),
    [hideSupplementalHelperWhenNoSourceRows, sourceFirstPresentationEntries]
  );

  const supplementalHelperTextTrimmed = (supplementalHelperText || '').toString().trim();
  const supplementalHelperNode =
    supplementalHelperTextTrimmed &&
    !hideSupplementalHelper &&
    !submitting &&
    q.readOnly !== true &&
    q.ui?.renderAsLabel !== true ? (
      <SectionInstruction
        id={`ck-linegroup-instruction-${q.id}`}
        language={language}
        text={supplementalHelperTextTrimmed}
      />
    ) : null;

  React.useEffect(() => {
    if (!sourceFirstPresentationEntries.length) return;
    sourceFirstPresentationEntries.forEach(entry => {
      if (entry.loading || entry.visibleSourceRows.length || !entry.sourceRows.length) return;
      onDiagnostic?.('dataSourceRows.sourceFirst.empty', {
        groupId: q.id,
        configId: `${entry.config?.id || ''}`.trim(),
        sourceRowCount: entry.sourceRows.length,
        parentRowCount: parentRows.length,
        reason: 'noEligibleParentMatches'
      });
    });
  }, [onDiagnostic, parentRows.length, q.id, sourceFirstPresentationEntries]);

  const resolveDataSourceOutputGroup = React.useCallback(
    (config: any, parentRowId: string): { key: string; subConfig: any | null } | null =>
      resolveDataSourceOutputGroupAction({
        config,
        groupId: q.id,
        subGroups: q.lineItemConfig?.subGroups || [],
        parentRowId
      }),
    [q.id, q.lineItemConfig?.subGroups]
  );

  const resolveReservationStateForSource = React.useCallback(
    (
      config: any,
      sourceKey: string,
      currentParentRowId?: string,
      mode: 'local' | 'committed' = 'local'
    ): { totalReservedQuantity: number; currentRowQuantity: number } => {
      return resolveStepDataSourceReservationStateForSourceAction({
        config,
        sourceKey,
        currentParentRowId,
        mode,
        parentRows,
        lineItems,
        stepDataSourceDrafts: stepDataSourceDraftsRef.current,
        reservationCommittedValues: reservationCommittedValuesRef.current,
        buildStepDataSourceDraftKey,
        resolveDataSourceOutputGroup,
        resolveLocalReservationQuantityForVisibility,
        resolveReservationQuantityFromValues
      });
    },
    [
      buildStepDataSourceDraftKey,
      lineItems,
      parentRows,
      resolveDataSourceOutputGroup,
      reservationCommittedValuesRef,
      stepDataSourceDraftsRef
    ]
  );

  const resolveCurrentReservationStateForSource = React.useCallback(
    (config: any, sourceKey: string, currentParentRowId?: string): { totalReservedQuantity: number; currentRowQuantity: number } =>
      resolveReservationStateForSource(config, sourceKey, currentParentRowId, 'local'),
    [resolveReservationStateForSource]
  );

  const resolveCommittedReservationStateForSource = React.useCallback(
    (config: any, sourceKey: string, currentParentRowId?: string): { totalReservedQuantity: number; currentRowQuantity: number } =>
      resolveReservationStateForSource(config, sourceKey, currentParentRowId, 'committed'),
    [resolveReservationStateForSource]
  );

  const buildVirtualDataSourceRowValues = React.useCallback(
    (args: {
      config: any;
      sourceRow: Record<string, any>;
      outputRow?: LineItemRowState | null;
      draftValues?: Record<string, FieldValue> | null;
      parentRowId?: string;
    }): Record<string, FieldValue> =>
      buildVirtualDataSourceRowValuesAction({
        ...args,
        resolveCurrentReservationStateForSource,
      resolveCommittedReservationStateForSource
    }),
    [resolveCommittedReservationStateForSource, resolveCurrentReservationStateForSource]
  );

  const resolveVirtualMaxFieldId = React.useCallback(
    (
      field: any,
      rowValues: Record<string, FieldValue>,
      parentValues: Record<string, FieldValue>
    ): string => {
      return resolveVirtualMaxFieldIdAction({ field, rowValues, parentValues, lineItems, resolveTopValue });
    },
    [lineItems, resolveTopValue]
  );

  const allowsVirtualIntegerOnly = React.useCallback(
    (
      field: any,
      rowValues: Record<string, FieldValue>,
      parentValues: Record<string, FieldValue>
    ): boolean => {
      return allowsVirtualIntegerOnlyAction({ field, rowValues, parentValues, lineItems, resolveTopValue });
    },
    [lineItems, resolveTopValue]
  );

  const {
    syncStepDataSourceOutputRow,
    syncStepDataSourceOutputRowWithReservation
  } = useStepDataSourceOutputSync({
    groupId: q.id,
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
  });

  const {
    seedReservationCommittedValues,
    stageStepDataSourceDraftPatch,
    queueDeferredStepReservationSync,
    hasPendingDeferredReservationChange,
    cancelDeferredStepReservationSync,
    scheduleDeferredStepReservationAutoSaveHoldRelease
  } = useStepDataSourceReservationDrafts({
    groupId: q.id,
    buildStepDataSourceDraftKey,
    reservationCommittedValuesRef,
    reservationDebounceTimersRef,
    deferredReservationAutoSaveHoldReleaseTimerRef,
    setAutoSaveHold,
    setStepDataSourceDrafts,
    stepDataSourceDraftsRef
  });

  useStepDataSourceAvailabilityReconciliation({
    groupId: q.id,
    recordId,
    currentGuidedStepId,
    activeStepDataSourceRows,
    parentRows,
    lineItems,
    language,
    stepDataSourceDraftsRef,
    reservationCommittedValuesRef,
    buildStepDataSourceDraftKey,
    resolveDataSourceOutputGroup,
    resolveStepDataSourceRowsForParent,
    isStepDataSourceLoading,
    applyStepDataSourceAvailabilitySnapshots,
    queueStepReservationDraftSnapshotSync,
    syncStepDataSourceOutputRow,
    syncStepDataSourceOutputRowWithReservation,
    onDiagnostic
  });

  const stepDataSourceNormalizationSignatureRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length || !parentRows.length) {
      stepDataSourceNormalizationSignatureRef.current = '';
      return;
    }
    const pending = collectStepDataSourceNestedPresetNormalizationsAction({
      activeStepDataSourceRows,
      parentRows,
      lineItems,
      rootGroupId: q.id,
      stepDataSourceDrafts,
      resolveDataSourceOutputGroup,
      resolveStepDataSourceRowsForParent,
      buildStepDataSourceDraftKey,
      buildVirtualDataSourceRowValues,
      matchesWhenClause,
      resolveVirtualRowWhenContext,
      resolveVirtualPreset,
      resolveRowFlowGroupConfig
    });

    const signature = buildStepDataSourceNestedPresetNormalizationSignatureAction(pending);
    if (!signature) {
      stepDataSourceNormalizationSignatureRef.current = '';
      return;
    }
    if (stepDataSourceNormalizationSignatureRef.current === signature) return;
    stepDataSourceNormalizationSignatureRef.current = signature;
    setLineItems(prev => {
      return applyStepDataSourceNestedPresetNormalizationsAction({
        previousLineItems: prev,
        pending
      });
    });
  }, [
    buildStepDataSourceDraftKey,
    buildVirtualDataSourceRowValues,
    lineItems,
    parentRows,
    q.id,
    resolveDataSourceOutputGroup,
    resolveRowFlowGroupConfig,
    resolveStepDataSourceRowsForParent,
    resolveVirtualPreset,
    resolveVirtualRowWhenContext,
    setLineItems,
    stepDataSourceDrafts,
    activeStepDataSourceRows
  ]);

  const {
    buildRowFlowFieldCtx,
    resolveRowFlowDisplayValue,
    buildOverlayGroupOverride,
    renderRowFlowActionControlWithContext
  } = useRowFlowActionController({
    groupId: q.id,
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
    closeOverlay: ctx.closeOverlay,
    openConfirmDialog,
    runSelectionEffectsForAncestors: ctx.runSelectionEffectsForAncestors,
    onDiagnostic
  });

  const buildRowFlowGroupDefinition = (groupKey: string, groupConfig: any): WebQuestionDefinition => ({
    ...(q as any),
    id: groupKey,
    lineItemConfig: {
      ...(groupConfig as any),
      fields: groupConfig?.fields || [],
      subGroups: groupConfig?.subGroups || []
    }
  });

  const buildOptionSetForLineField = React.useCallback(
    (field: any, groupKey: string): OptionSet => resolveOptionSetForField(optionState, field, groupKey),
    [optionState]
  );

  useLineItemAutoAddEffects({
    q,
    definition,
    language,
    submitting,
    values,
    lineItems,
    optionState,
    subgroupSelectors,
    latestValuesRef,
    buildOptionSetForLineField,
    ensureLineOptions,
    setLineItems,
    setValues,
    onDiagnostic
  });

  useLineItemSelectionEffectInit({
    q,
    definition,
    submitting,
    values,
    lineItems,
    recordMeta,
    handleLineFieldChange,
    onDiagnostic
  });

        const {
          selectorCfg,
          selectorValue,
          selectorOptions,
          selectorControl,
          renderAddButton,
          showAddTop,
          showAddBottom,
          showSelectorTop,
          showSelectorBottom,
          useSelectorSearch
        } = useLineItemGroupControls({
          q,
          values,
          language,
          submitting,
          optionState,
          latestSectionSelectorValueRef,
          selectorSearchLoggedRef,
          selectorOverlayLoggedRef,
          selectorLabelLoggedRef,
          buildOptionSetForLineField,
          ensureLineOptions,
          setValues,
          setOptionState,
          setOverlay,
          addLineItemRowManual,
          onDiagnostic
        });

        const {
          liUi,
          isTableMode,
          hideGroupLabel,
          messageFieldsAll,
          tableFieldsAll,
          tableFields,
          tableFieldIdSet,
          tableTotals,
          toolbarTotals,
          genericNonMatchWarnings,
          useValidationNonMatchWarnings,
          useDescriptiveNonMatchWarnings,
          shouldRenderTopToolbar,
          shouldRenderBottomToolbar,
          warningsFor,
          filterWarnings,
          hasWarning,
          renderWarnings
        } = useLineItemGroupPresentationState({
          q,
          parentRows,
          rowFlowEnabled,
          errors,
          language,
          hideToolbars,
          showAddTop,
          showAddBottom,
          showSelectorTop,
          showSelectorBottom,
          warningByField,
          onDiagnostic
        });

        useLineItemAttentionAutoExpand({
          q,
          parentRows,
          collapsedRows,
          warningByField,
          errorIndex,
          lineItems,
          language,
          resolveTopValue,
          filterWarnings,
          setCollapsedRows,
          onDiagnostic
        });

        if (isTableMode && !rowFlowEnabled) {
          return (
            <LineItemTableModeRenderer
              q={q}
              liUi={liUi}
              tableFieldsAll={tableFieldsAll}
              tableFields={tableFields}
              tableFieldIdSet={tableFieldIdSet}
              messageFieldsAll={messageFieldsAll}
              parentRows={parentRows}
              lineItems={lineItems}
              values={values}
              optionState={optionState}
              language={language}
              errors={errors}
              groupHelperNode={groupHelperNode}
              supplementalHelperNode={supplementalHelperNode}
              hideGroupLabel={hideGroupLabel}
              shouldRenderTopToolbar={shouldRenderTopToolbar}
              shouldRenderBottomToolbar={shouldRenderBottomToolbar}
              showSelectorTop={showSelectorTop}
              showSelectorBottom={showSelectorBottom}
              showAddTop={showAddTop}
              showAddBottom={showAddBottom}
              selectorControl={selectorControl}
              toolbarTotals={toolbarTotals}
              tableTotals={tableTotals}
              useDescriptiveNonMatchWarnings={useDescriptiveNonMatchWarnings}
              useValidationNonMatchWarnings={useValidationNonMatchWarnings}
              genericNonMatchWarnings={genericNonMatchWarnings}
              groupChoiceSearchDefault={groupChoiceSearchDefault}
              uploadAnnouncements={uploadAnnouncements}
              fileInputsRef={fileInputsRef}
              hasWarning={hasWarning}
              renderWarnings={renderWarnings}
              warningsFor={warningsFor}
              renderAddButton={renderAddButton}
              ensureLineOptions={ensureLineOptions}
              renderChoiceControl={renderChoiceControl}
              handleLineFieldChange={handleLineFieldChange}
              isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
              isLineFieldInputDisabled={isLineFieldInputDisabled}
              resolveTopValue={resolveTopValue}
              removeLineRow={removeLineRow}
              renderUploadFailure={renderUploadFailure}
              isFileUploadOrderedEntryBlocked={isFileUploadOrderedEntryBlocked}
              openFileOverlay={openFileOverlay}
              handleLineFileInputChange={handleLineFileInputChange}
              setErrors={setErrors}
              onDiagnostic={onDiagnostic}
            />
          );
        }

        const {
          outputActionsLayout,
          defaultActionScope,
          resolveOutputActionScope,
          groupActionRow,
          groupActionState
        } = useRowFlowGroupOutputState({
          groupId: q.id,
          rowFlow,
          rowFlowEnabled,
          parentRows,
          lineItems,
          values,
          rowFlowSubGroupIds,
          activeFieldMeta,
          rowFlowStateByRowId,
          rowFlowLoggedRef,
          onDiagnostic
        });
        const hideParentRowsForSourceFirst = sourceFirstPresentationEntries.some(
          entry =>
            (entry.visibleSourceRows.length > 0 || !!entry.emptyStateMessage) &&
            (entry.config as any)?.hideParentRowsWhenPresentationActive !== false
        );

        const renderSourceFirstDataSourceConfigs = (): React.ReactNode => (
          <SourceFirstAllocationList
            entries={sourceFirstPresentationEntries}
            language={language}
            parentRows={parentRows}
            lineItems={lineItems}
            stepDataSourceDrafts={stepDataSourceDrafts}
            buildVirtualDataSourceRowValues={buildVirtualDataSourceRowValues}
            buildStepDataSourceDraftKey={buildStepDataSourceDraftKey}
            resolveDataSourceOutputGroup={resolveDataSourceOutputGroup}
            resolveVirtualRowWhenContext={resolveVirtualRowWhenContext}
            validateVirtualFieldRules={validateVirtualFieldRules}
            isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
            allowsVirtualIntegerOnly={allowsVirtualIntegerOnly}
            resolveVirtualMaxFieldId={resolveVirtualMaxFieldId}
            toFiniteNumber={toFiniteNumber}
            seedReservationCommittedValues={seedReservationCommittedValues}
            stageStepDataSourceDraftPatch={stageStepDataSourceDraftPatch}
            queueDeferredStepReservationSync={queueDeferredStepReservationSync}
            hasPendingDeferredReservationChange={hasPendingDeferredReservationChange}
            cancelDeferredStepReservationSync={cancelDeferredStepReservationSync}
            scheduleDeferredStepReservationAutoSaveHoldRelease={scheduleDeferredStepReservationAutoSaveHoldRelease}
            syncStepDataSourceOutputRowWithReservation={syncStepDataSourceOutputRowWithReservation}
          />
        );

        return (
            <div
              key={q.id}
              className="card ck-full-width"
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h3 style={hideGroupLabel ? { ...srOnly, margin: 0 } : { margin: 0 }}>{resolveLabel(q, language)}</h3>
            </div>
              {groupHelperNode}
              {supplementalHelperNode}
              {errors[q.id] ? <div className="error">{errors[q.id]}</div> : null}
              {renderWarnings(q.id)}
              {shouldRenderTopToolbar ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
                    {showSelectorTop ? selectorControl : null}
                    {showAddTop ? renderAddButton() : null}
                  </div>
                </div>
              ) : null}
            {renderSourceFirstDataSourceConfigs()}
            <LineItemGroupRowsRenderer
              q={q}
              parentRows={parentRows}
              sourceFirstDataSourceRows={sourceFirstDataSourceRows}
              hideParentRowsForSourceFirst={hideParentRowsForSourceFirst}
              rowFlowEnabled={rowFlowEnabled}
              rowFlowStateByRowId={rowFlowStateByRowId}
              rowFlowSubGroupIds={rowFlowSubGroupIds}
              definition={definition}
              language={language}
              values={values}
              errors={errors}
              submitting={submitting}
              groupChoiceSearchDefault={groupChoiceSearchDefault}
              activeFieldMeta={activeFieldMeta}
              rowFlow={rowFlow}
              outputActionsLayout={outputActionsLayout}
              rowFlowLoggedRef={rowFlowLoggedRef}
              rowFlowPromptRef={rowFlowPromptRef}
              onDiagnostic={onDiagnostic}
              renderRowFlowActionControlWithContext={renderRowFlowActionControlWithContext}
              resolveOutputActionScope={resolveOutputActionScope}
              resolveRowFlowGroupConfig={resolveRowFlowGroupConfig}
              resolveRowFlowFieldConfig={resolveRowFlowFieldConfig}
              buildRowFlowGroupDefinition={buildRowFlowGroupDefinition}
              buildRowFlowFieldCtx={buildRowFlowFieldCtx}
              resolveRowFlowDisplayValue={resolveRowFlowDisplayValue}
              optionState={optionState}
              ensureLineOptions={ensureLineOptions}
              renderWarnings={renderWarnings}
              renderChoiceControl={renderChoiceControl}
              handleLineFieldChange={handleLineFieldChange}
              setErrors={setErrors}
              isLineFieldInputDisabled={isLineFieldInputDisabled}
              isLineFieldInteractionBlocked={isLineFieldInteractionBlocked}
              openFileOverlay={openFileOverlay}
              handleLineFileInputChange={handleLineFileInputChange}
              fileInputsRef={fileInputsRef}
              addLineItemRowManual={addLineItemRowManual}
              buildOverlayGroupOverride={buildOverlayGroupOverride}
              openSubgroupOverlay={openSubgroupOverlay}
              openLineItemGroupOverlay={openLineItemGroupOverlay}
              resolveTopValue={resolveTopValue}
              lineItems={lineItems}
              collapsedRows={collapsedRows}
              setCollapsedRows={setCollapsedRows}
              errorIndex={errorIndex}
              overlayOpenActionLoggedRef={overlayOpenActionLoggedRef}
              hasWarning={hasWarning}
              useDescriptiveNonMatchWarnings={useDescriptiveNonMatchWarnings}
              latestValuesRef={latestValuesRef}
              setValues={setValues}
              setLineItems={setLineItems}
              ctx={ctx}
              setSubgroupSelectors={setSubgroupSelectors}
              removeLineFile={removeLineFile}
              clearLineFiles={clearLineFiles}
              isFileUploadOrderedEntryBlocked={isFileUploadOrderedEntryBlocked}
              uploadAnnouncements={uploadAnnouncements}
              renderUploadFailure={renderUploadFailure}
              removeLineRow={removeLineRow}
              collapsedGroups={collapsedGroups}
              toggleGroupCollapsed={toggleGroupCollapsed}
              activeStepDataSourceRows={activeStepDataSourceRows}
              stepDataSourceDrafts={stepDataSourceDrafts}
              resolveStepDataSourceRowsForParent={resolveStepDataSourceRowsForParent}
              resolveDataSourceOutputGroup={resolveDataSourceOutputGroup}
              buildStepDataSourceDraftKey={buildStepDataSourceDraftKey}
              buildVirtualDataSourceRowValues={buildVirtualDataSourceRowValues}
              resolveVirtualRowWhenContext={resolveVirtualRowWhenContext}
              validateVirtualFieldRules={validateVirtualFieldRules}
              allowsVirtualIntegerOnly={allowsVirtualIntegerOnly}
              resolveVirtualMaxFieldId={resolveVirtualMaxFieldId}
              toFiniteNumber={toFiniteNumber}
              seedReservationCommittedValues={seedReservationCommittedValues}
              queueDeferredStepReservationSync={queueDeferredStepReservationSync}
              hasPendingDeferredReservationChange={hasPendingDeferredReservationChange}
              cancelDeferredStepReservationSync={cancelDeferredStepReservationSync}
              syncStepDataSourceOutputRowWithReservation={syncStepDataSourceOutputRowWithReservation}
              hideInlineSubgroups={hideInlineSubgroups}
              collapsedSubgroups={collapsedSubgroups}
              subgroupSelectors={subgroupSelectors}
              latestSubgroupSelectorValueRef={latestSubgroupSelectorValueRef}
              selectorSearchLoggedRef={selectorSearchLoggedRef}
              selectorOverlayLoggedRef={selectorOverlayLoggedRef}
              subgroupBottomRefs={subgroupBottomRefs}
              buildOptionSetForLineField={buildOptionSetForLineField}
              setOptionState={setOptionState}
              setOverlay={setOverlay}
              setCollapsedSubgroups={setCollapsedSubgroups}
              openInfoOverlay={openInfoOverlay}
            />
            {rowFlowEnabled && defaultActionScope === 'group' ? (
              <RowFlowGroupOutputActions
                groupActionRow={groupActionRow}
                groupActionState={groupActionState}
                outputActionsLayout={outputActionsLayout}
                resolveOutputActionScope={resolveOutputActionScope}
                renderRowFlowActionControlWithContext={renderRowFlowActionControlWithContext}
              />
            ) : null}
            {shouldRenderBottomToolbar ? (
              <div className="line-item-toolbar">
                {showSelectorBottom && selectorCfg ? (
                  <LineItemSectionSelectorControl
                    selectorCfg={selectorCfg}
                    value={selectorValue}
                    language={language}
                    options={selectorOptions}
                    disabled={submitting}
                    searchEnabled={useSelectorSearch}
                    labelStyle={{ fontWeight: 600 }}
                    diagnosticPayload={{ scope: 'lineItems.selector', fieldId: selectorCfg.id }}
                    onDiagnostic={onDiagnostic}
                    onChange={nextValue => {
                      setValues(prev => {
                        if (prev[selectorCfg.id] === nextValue) return prev;
                        return { ...prev, [selectorCfg.id]: nextValue };
                      });
                    }}
                  />
                ) : null}
                <div className="line-item-toolbar-actions">
                  {showAddBottom ? renderAddButton() : null}
                  <LineItemTotals totals={toolbarTotals} />
                </div>
              </div>
            ) : null}
          </div>
        );
};
