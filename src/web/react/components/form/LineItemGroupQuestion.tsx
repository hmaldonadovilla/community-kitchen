import React from 'react';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  getOptionStateValue,
  matchesWhenClause,
  toDependencyValue,
  toOptionSet
} from '../../../core';
import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import {
  mutateCachedDataSource,
  peekCachedDataSource
} from '../../../data/dataSources';
import {
  FieldValue,
  LineItemGroupConfigOverride,
  LineItemRowState,
  OptionSet,
  RowFlowActionRef,
  RowFlowConfig,
  RowFlowOverlayContextHeaderConfig,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../types';
import type { InventoryAvailabilitySnapshot } from '../../../../types';
import { resolveLabel } from '../../utils/labels';
import { LineItemState, OptionState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import {
  resolveFieldHelperText,
} from './utils';
import { srOnly } from './ui';
import { SectionInstruction } from './SectionInstruction';
import { toFiniteNumberValue } from './quantityConstraints';
import {
  buildReservationConflictDialogCopy,
  computeReservationConflictUsableQuantity
} from './reservationConflictDialog';
import {
  buildReservationFailureMessage,
  isStepReservationCommitEnabled,
  shouldBlockDataSourceFreshnessForInvalidStepReservation,
  shouldImmediatelySyncStepReservationChange,
  shouldDeferReservationSync
} from './reservationSyncPolicy';
import { resolveReservationDisplayLabel } from '../../features/reservations/displayLabel';
import {
  GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
  type GuidedStepReservationAvailabilityEventDetail
} from '../../features/reservations/liveSyncEvents';
import {
  resolveReservationResourceFieldIds,
  resolveReservationSourceItemKey
} from '../../features/reservations/sourceFields';
import { resolveUserFacingErrorMessage, upsertInventoryReservationApi } from '../../api';
import { resolveValueMapValue } from './valueMaps';
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
  buildVirtualDataSourceRowValuesAction,
  resolveServerCurrentRecordReservedQuantityFromRow
} from './virtualDataSourceRowValues';
import { buildStepDataSourceAvailabilityOptimisticMutationAction } from './stepDataSourceAvailability';
import { applyStepDataSourceDraftUpdateAction } from './stepDataSourceDrafts';
import { applyStepDataSourceExclusiveSelectionRemovalAction } from './stepDataSourceExclusiveSelection';
import {
  applyStepDataSourceNestedPresetNormalizationsAction,
  applyStepDataSourceMatchedOutputRuleAction,
  buildStepDataSourceNestedPresetNormalizationSignatureAction,
  collectStepDataSourceNestedPresetNormalizationsAction,
  decorateStepDataSourceRowForVisibilityAction,
  resolveDataSourceOutputGroupAction,
  resolveStepDataSourceReservationStateForSourceAction,
  resolveStepDataSourceRowsAction,
  resolveStepDataSourceRowsForParentAction
} from './stepDataSourceRows';
import {
  shouldRemoveSourceFirstAllocationOutputWhenExcluded
} from '../../app/sourceFirstAllocations';
import {
  applyLineItemGroupOverride,
  buildLineItemOverlayGroupOverride
} from '../../app/lineItemTree';
import { applyLineItemRowSort } from '../../app/lineItemRowSort';
import { applySourceFirstAncestorSelectionEffects } from '../../app/sourceFirstAncestorSelectionSync';
import {
  fieldByIdSafe,
  normalizeIdValue,
  optionSortFor,
} from '../../features/lineItems/domain/lineItemPresentation';
import { resolveAddOverlayCopy } from '../../features/lineItems/domain/addOverlayCopy';
import {
  buildRowFlowContextHeaderAction,
  resolveRowFlowDisplayValueAction
} from '../../features/lineItems/domain/rowFlowDisplayValue';
import {
  resolveRowFlowActiveFieldMetaAction,
  resolveRowFlowGroupConfigAction
} from '../../features/lineItems/domain/rowFlowGroupConfig';
import { LineItemUploadFailureNotice } from '../../features/lineItems/components/LineItemUploadFailureNotice';
import { LineItemTotals } from '../../features/lineItems/components/LineItemTotals';
import { RowFlowActionControl } from '../../features/lineItems/components/RowFlowActionControl';
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
import type {
  LineFileUploadOrderedEntryCheckArgs,
  LineItemGroupQuestionProps
} from './lineItemGroupQuestionTypes';

const GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON = 'guidedStepReservationDeferred';

import {
  cascadeRemoveLineItemRows,
  buildSubgroupKey,
  resolveSubgroupKey
} from '../../app/lineItems';
import { applyValueMapsToForm } from '../../app/valueMaps';
import {
  resolveRowFlowActionPlan,
  resolveRowFlowFieldTarget,
  resolveRowFlowSegmentActionIds,
  resolveRowFlowState,
  type RowFlowResolvedEffect,
  type RowFlowResolvedSegment,
  type RowFlowResolvedState
} from '../../features/steps/domain/rowFlow';

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
  const rowFlowPromptCompleteRef = React.useRef<Record<string, Record<string, boolean>>>({});
  const rowFlowSelectorOverlayAutoOpenedRef = React.useRef<Record<string, boolean>>({});
  const rowFlowEnabled = Boolean(
    rowFlow &&
      ((rowFlow.mode || '').toString().trim().toLowerCase() === '' ||
        (rowFlow.mode || '').toString().trim().toLowerCase() === 'progressive')
  );
  const rowFlowSubGroupIds = (q.lineItemConfig?.subGroups || [])
    .map(sub => resolveSubgroupKey(sub as any))
    .filter(Boolean);
  const rowFlowActionById = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!rowFlow?.actions) return map;
    rowFlow.actions.forEach(action => {
      const id = (action?.id || '').toString().trim();
      if (!id) return;
      map.set(id, action);
    });
    return map;
  }, [rowFlow]);
  const parentRowById = React.useMemo(() => {
    const map = new Map<string, LineItemRowState>();
    parentRows.forEach(row => {
      map.set(row.id, row);
    });
    return map;
  }, [parentRows]);

  const resolveRowFlowGroupConfig = React.useCallback(
    (groupKey: string): { groupId: string; config: any } | null => {
      return resolveRowFlowGroupConfigAction({
        groupKey,
        currentGroupId: q.id,
        currentLineItemConfig: q.lineItemConfig,
        definitionQuestions: definition.questions
      });
    },
    [definition.questions, q.id, q.lineItemConfig]
  );

  const resolveRowFlowFieldConfig = React.useCallback(
    (groupKey: string, fieldId: string): any | null => {
      if (!groupKey || !fieldId) return null;
      const info = resolveRowFlowGroupConfig(groupKey);
      if (!info?.config) return null;
      return (info.config.fields || []).find((field: any) => field?.id === fieldId) || null;
    },
    [resolveRowFlowGroupConfig]
  );

  const activeFieldMeta = (() => {
    return resolveRowFlowActiveFieldMetaAction({
      activeElement: typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
      resolveGroupConfig: resolveRowFlowGroupConfig,
      resolveFieldConfig: resolveRowFlowFieldConfig
    });
  })();
  const rowFlowStateByRowId = React.useMemo(() => {
    const map = new Map<string, RowFlowResolvedState>();
    if (!rowFlowEnabled) return map;
    parentRows.forEach(row => {
      const state = resolveRowFlowState({
        config: rowFlow as RowFlowConfig,
        groupId: q.id,
        rowId: row.id,
        rowValues: (row.values || {}) as Record<string, FieldValue>,
        lineItems,
        topValues: values,
        subGroupIds: rowFlowSubGroupIds,
        activeFieldPath: activeFieldMeta.path,
        activeFieldType: activeFieldMeta.type
      });
      if (state) map.set(row.id, state);
    });
    return map;
  }, [activeFieldMeta.path, activeFieldMeta.type, lineItems, parentRows, q.id, rowFlow, rowFlowEnabled, rowFlowSubGroupIds, values]);

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
    [language, queueStepDataSourceRefreshTick, resolveCommittedReservationStateForSource, resolveCurrentReservationStateForSource]
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

  const syncStepDataSourceOutputRow = React.useCallback(
    (args: {
      config: any;
      parentRow: LineItemRowState;
      sourceRow: Record<string, any>;
      patch: Record<string, FieldValue>;
    }): LineItemState | null => {
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
          rootGroupId: q.id,
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
            parentGroupId: q.id,
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
      buildVirtualDataSourceRowValues,
      buildStepDataSourceDraftKey,
      definition,
      q.id,
      resolveDataSourceOutputGroup,
      resolveVirtualPreset,
      resolveVirtualPresetValue,
      resolveVirtualRowWhenContext,
      resolveRowFlowGroupConfig,
      latestStepDataSourceSyncedLineItemsRef,
      language,
      setLineItems,
      setStepDataSourceDrafts,
      setValues,
      stepDataSourceDraftsRef,
      validateVirtualFieldRules
    ]
  );

  const syncStepDataSourceOutputRowWithReservation = React.useCallback(
    (
      args: {
        config: any;
        parentRow: LineItemRowState;
        sourceRow: Record<string, any>;
        patch: Record<string, FieldValue>;
      },
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
            groupId: q.id,
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
      const timerKey = `${q.id}::${args.parentRow.id}::${sourceKey}`;
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
            fieldPath: `${q.id}.${quantityFieldId || selectedFieldId || sourceKey}`
          });
          sourceRecordId = `${ensured?.recordId || ''}`.trim();
          if (!ensured?.success || !sourceRecordId) {
            onDiagnostic?.('inventory.reservation.ensureRecordFailed', {
              groupId: q.id,
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
          groupId: q.id,
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
            sourceParentGroupId: q.id,
            sourceParentRowId: args.parentRow.id,
            sourceOutputGroupId: `${args.config?.outputGroupId || ''}`.trim() || undefined,
            sourceOutputKeyFieldId: `${args.config?.outputKeyFieldId || ''}`.trim() || undefined,
            ledgerFormKey: `${reservationConfig.ledgerFormKey || ''}`.trim() || undefined,
            allowedStatuses: Array.isArray(reservationConfig.allowedStatuses) ? reservationConfig.allowedStatuses : undefined
          });
          if (reservationRequestVersionRef.current[timerKey] !== requestVersion) return;
          updateStepDataSourceAvailability(args.config, result.availability);
          onDiagnostic?.('inventory.reservation.response', {
            groupId: q.id,
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
                groupId: q.id,
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
                  refId: `${q.id}::${args.parentRow.id}::${sourceKey}`,
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
                refId: `${q.id}::${args.parentRow.id}::${sourceKey}`,
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
            groupId: q.id,
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
            refId: `${q.id}::${args.parentRow.id}::${sourceKey}`,
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
      language,
      lineItems,
      onGuidedStepReservationDraftStateChange,
      onDiagnostic,
      openConfirmDialog,
      q.id,
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

  const buildDeferredStepReservationTimerKey = React.useCallback(
    (parentRowId: string, sourceKey: string): string =>
      `${q.id}::stepReservationDeferred::${parentRowId || ''}::${sourceKey || ''}`,
    [q.id]
  );

  const requestDeferredStepReservationAutoSaveHold = React.useCallback(() => {
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(true, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [deferredReservationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  const releaseDeferredStepReservationAutoSaveHold = React.useCallback(() => {
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [deferredReservationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  const scheduleDeferredStepReservationAutoSaveHoldRelease = React.useCallback(() => {
    if (!setAutoSaveHold) return;
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
    }
    deferredReservationAutoSaveHoldReleaseTimerRef.current = setTimeout(() => {
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
      setAutoSaveHold(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
    }, 500);
  }, [deferredReservationAutoSaveHoldReleaseTimerRef, setAutoSaveHold]);

  React.useEffect(
    () => () => {
      releaseDeferredStepReservationAutoSaveHold();
    },
    [releaseDeferredStepReservationAutoSaveHold]
  );

  const cancelDeferredStepReservationSync = React.useCallback(
    (args: { parentRowId: string; sourceKey: string }) => {
      const timerKey = buildDeferredStepReservationTimerKey(args.parentRowId, args.sourceKey);
      const timer = reservationDebounceTimersRef.current[timerKey];
      if (!timer) return;
      clearTimeout(timer);
      delete reservationDebounceTimersRef.current[timerKey];
    },
    [buildDeferredStepReservationTimerKey, reservationDebounceTimersRef]
  );

  const queueDeferredStepReservationSync = React.useCallback(
    (args: {
      config: any;
      parentRow: LineItemRowState;
      sourceRow: Record<string, any>;
      sourceKey: string;
      patch: Record<string, FieldValue>;
    }) => {
      const reservationConfig = args.config?.reservation && typeof args.config.reservation === 'object'
        ? args.config.reservation
        : null;
      if (!isStepReservationCommitEnabled(reservationConfig)) return;
      if (!args.sourceKey) return;
      requestDeferredStepReservationAutoSaveHold();
      const timerKey = buildDeferredStepReservationTimerKey(args.parentRow.id, args.sourceKey);
      const previousTimer = reservationDebounceTimersRef.current[timerKey];
      if (previousTimer) {
        clearTimeout(previousTimer);
        delete reservationDebounceTimersRef.current[timerKey];
      }
    },
    [buildDeferredStepReservationTimerKey, requestDeferredStepReservationAutoSaveHold, reservationDebounceTimersRef]
  );

  const rollbackRejectedStepReservations = React.useCallback(
    (rejectedReservations: GuidedStepReservationAvailabilityEventDetail['rejectedReservations']): void => {
      const entries = Array.isArray(rejectedReservations) ? rejectedReservations.filter(Boolean) : [];
      if (!entries.length || !activeStepDataSourceRows.length) return;
      const parentRows = Array.isArray(lineItems[q.id]) ? lineItems[q.id] : [];
      if (!parentRows.length) return;
      const handled = new Set<string>();

      entries.forEach(entry => {
        const sourceParentGroupId = `${entry?.sourceParentGroupId || ''}`.trim();
        if (sourceParentGroupId && sourceParentGroupId !== q.id) return;
        const sourceParentRowId = `${entry?.sourceParentRowId || ''}`.trim();
        const resourceRecordId = `${entry?.resourceRecordId || ''}`.trim();
        const resourceItemId = `${entry?.resourceItemId || ''}`.trim();
        if (!sourceParentRowId || !resourceRecordId) return;
        const parentRow = parentRows.find(candidate => `${candidate?.id || ''}`.trim() === sourceParentRowId);
        if (!parentRow) return;

        activeStepDataSourceRows.forEach(config => {
          const outputGroupId = `${config?.outputGroupId || ''}`.trim();
          const rejectedOutputGroupId = `${entry?.sourceOutputGroupId || ''}`.trim();
          if (rejectedOutputGroupId && outputGroupId && rejectedOutputGroupId !== outputGroupId) return;

          const cached = peekCachedDataSource(config?.dataSource, language) as any;
          const items = Array.isArray(cached?.items) ? cached.items : Array.isArray(cached) ? cached : [];
          const sourceRow =
            items.find((item: Record<string, any>) => {
              if (!item || typeof item !== 'object') return false;
              if (`${item.id ?? ''}`.trim() !== resourceRecordId) return false;
              if (!resourceItemId) return true;
              return resolveReservationSourceItemKey(config, item) === resourceItemId;
            }) || null;
          if (!sourceRow) return;

          const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
          const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
          const modeFieldId = `${config?.modeFieldId || ''}`.trim();
          const patch: Record<string, FieldValue> = {};
          if (selectedFieldId) patch[selectedFieldId] = false;
          if (quantityFieldId) patch[quantityFieldId] = null;
          if (modeFieldId) patch[modeFieldId] = null;
          if (!Object.keys(patch).length) return;

          const rollbackKey = [
            outputGroupId,
            sourceParentRowId,
            resourceRecordId,
            resourceItemId
          ].join('::');
          if (handled.has(rollbackKey)) return;
          handled.add(rollbackKey);

          syncStepDataSourceOutputRowWithReservation(
            {
              config,
              parentRow,
              sourceRow,
              patch
            },
            { skipReservation: true }
          );
        });
      });
    },
    [activeStepDataSourceRows, language, lineItems, q.id, syncStepDataSourceOutputRowWithReservation]
  );

  const commitStepReservationValuesForAvailabilitySnapshots = React.useCallback(
    (snapshots: InventoryAvailabilitySnapshot[] | null | undefined): void => {
      const entries = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
      if (!entries.length || !activeStepDataSourceRows.length || !parentRows.length) return;

      activeStepDataSourceRows.forEach(config => {
        const dataSourceFormKey = `${config?.dataSource?.formKey || ''}`.trim();
        const outputKeyFieldId = `${config?.outputKeyFieldId || config?.rowKeyFieldId || ''}`.trim();
        const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
        const quantityFieldId = `${config?.quantityFieldId || ''}`.trim();
        const modeFieldId = `${config?.modeFieldId || ''}`.trim();
        if (!outputKeyFieldId || !quantityFieldId) return;

        entries.forEach(snapshot => {
          if (!snapshot) return;
          if (dataSourceFormKey && dataSourceFormKey !== `${snapshot.resourceFormKey || ''}`.trim()) return;
          const sourceKey = `${snapshot.resourceItemId || ''}`.trim();
          if (!sourceKey) return;

          parentRows.forEach(parentRow => {
            const output = resolveDataSourceOutputGroup(config, parentRow.id);
            if (!output) return;
            const outputRows = Array.isArray(lineItems[output.key]) ? lineItems[output.key] : [];
            const existingOutputRow =
              outputRows.find(row => `${(row.values as any)?.[outputKeyFieldId] ?? ''}`.trim() === sourceKey) || null;
            const draftKey = buildStepDataSourceDraftKey(config, parentRow.id, sourceKey);
            const draftValues = stepDataSourceDraftsRef.current[draftKey] || null;

            if (!existingOutputRow && !draftValues) {
              if (reservationCommittedValuesRef.current[draftKey]) {
                delete reservationCommittedValuesRef.current[draftKey];
              }
              return;
            }

            const outputValues = (existingOutputRow?.values || null) as Record<string, FieldValue> | null;
            const nextValues: Record<string, FieldValue> = {
              ...(outputValues || {}),
              ...(draftValues || {})
            };
            const selected = selectedFieldId
              ? draftValues && Object.prototype.hasOwnProperty.call(draftValues, selectedFieldId)
                ? draftValues[selectedFieldId] === true
                : Boolean(existingOutputRow)
              : true;
            const committedValues: Record<string, FieldValue> = {};
            if (selectedFieldId) committedValues[selectedFieldId] = selected;
            committedValues[quantityFieldId] =
              selected && !isEmptyValue(nextValues[quantityFieldId] as any)
                ? nextValues[quantityFieldId]
                : null;
            if (modeFieldId) {
              committedValues[modeFieldId] =
                selected && !isEmptyValue(nextValues[modeFieldId] as any)
                  ? nextValues[modeFieldId]
                  : null;
            }
            reservationCommittedValuesRef.current[draftKey] = committedValues;
          });
        });
      });
    },
    [
      activeStepDataSourceRows,
      buildStepDataSourceDraftKey,
      lineItems,
      parentRows,
      resolveDataSourceOutputGroup,
      reservationCommittedValuesRef,
      stepDataSourceDraftsRef
    ]
  );

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length) return;
    if (!currentGuidedStepId) return;

    const parentRowsForGroup = Array.isArray(lineItems[q.id]) ? lineItems[q.id] : [];
    if (!parentRowsForGroup.length) return;

    const staleEntries: Array<{
      config: any;
      parentRow: LineItemRowState;
      keyFieldId: string;
      sourceKey: string;
    }> = [];
    const seen = new Set<string>();

    activeStepDataSourceRows.forEach(config => {
      if (!shouldRemoveSourceFirstAllocationOutputWhenExcluded(config)) return;
      if (isStepDataSourceLoading(config)) return;
      const cached = peekCachedDataSource(config?.dataSource, language);
      if (!cached) return;
      const keyFieldId = `${config?.rowKeyFieldId || ''}`.trim();
      const outputKeyFieldId = `${config?.outputKeyFieldId || keyFieldId}`.trim();
      if (!keyFieldId || !outputKeyFieldId) return;

      parentRowsForGroup.forEach(parentRow => {
        const output = resolveDataSourceOutputGroup(config, parentRow.id);
        if (!output) return;
        const outputRows = Array.isArray(lineItems[output.key]) ? lineItems[output.key] : [];
        if (!outputRows.length) return;

        const eligibleSourceKeys = new Set(
          resolveStepDataSourceRowsForParent(config, parentRow)
            .map(sourceRow => `${sourceRow?.[keyFieldId] ?? ''}`.trim())
            .filter(Boolean)
        );

        outputRows.forEach(outputRow => {
          const sourceKey = `${(outputRow?.values as any)?.[outputKeyFieldId] ?? ''}`.trim();
          if (!sourceKey || eligibleSourceKeys.has(sourceKey)) return;
          const staleKey = [`${config?.id || ''}`.trim(), `${parentRow.id || ''}`.trim(), sourceKey].join('::');
          if (seen.has(staleKey)) return;
          seen.add(staleKey);
          staleEntries.push({ config, parentRow, keyFieldId, sourceKey });
        });
      });
    });

    if (!staleEntries.length) return;

    let syncedLineItems: LineItemState | null = null;
    staleEntries.forEach(entry => {
      const selectedFieldId = `${entry.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${entry.config?.quantityFieldId || ''}`.trim();
      const modeFieldId = `${entry.config?.modeFieldId || ''}`.trim();
      const patch: Record<string, FieldValue> = {};
      if (selectedFieldId) patch[selectedFieldId] = false;
      if (quantityFieldId) patch[quantityFieldId] = null;
      if (modeFieldId) patch[modeFieldId] = null;
      if (!Object.keys(patch).length) return;

      onDiagnostic?.('dataSourceRows.sourceFirst.outputRemovedWhenExcluded', {
        groupId: q.id,
        stepId: currentGuidedStepId,
        configId: `${entry.config?.id || ''}`.trim() || null,
        parentRowId: entry.parentRow.id,
        sourceKey: entry.sourceKey
      });

      const nextSyncedLineItems = syncStepDataSourceOutputRow({
        config: entry.config,
        parentRow: entry.parentRow,
        sourceRow: { [entry.keyFieldId]: entry.sourceKey },
        patch
      });
      if (nextSyncedLineItems) syncedLineItems = nextSyncedLineItems;
    });

    const reason = `sourceRowExcluded:${staleEntries.map(entry => entry.sourceKey).join(',')}`;
    queueStepReservationDraftSnapshotSync(reason, syncedLineItems);
  }, [
    activeStepDataSourceRows,
    currentGuidedStepId,
    isStepDataSourceLoading,
    language,
    lineItems,
    onDiagnostic,
    q.id,
    queueStepReservationDraftSnapshotSync,
    resolveDataSourceOutputGroup,
    resolveStepDataSourceRowsForParent,
    syncStepDataSourceOutputRow
  ]);

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const currentRecordId = `${recordId || ''}`.trim();
    const handleAvailability = (event: Event) => {
      const detail = (event as CustomEvent<GuidedStepReservationAvailabilityEventDetail>)?.detail;
      if (!detail || !Array.isArray(detail.availability) || !detail.availability.length) return;
      if (currentRecordId && `${detail.recordId || ''}`.trim() !== currentRecordId) return;
      if (currentGuidedStepId && `${detail.stepId || ''}`.trim() && `${detail.stepId || ''}`.trim() !== currentGuidedStepId) return;
      applyStepDataSourceAvailabilitySnapshots(detail.availability);
      if (!detail.rejectedReservations?.length) {
        commitStepReservationValuesForAvailabilitySnapshots(detail.availability);
      }
      rollbackRejectedStepReservations(detail.rejectedReservations);
    };
    window.addEventListener(
      GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
      handleAvailability as EventListener
    );
    return () => {
      window.removeEventListener(
        GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
        handleAvailability as EventListener
      );
    };
  }, [
    activeStepDataSourceRows.length,
    applyStepDataSourceAvailabilitySnapshots,
    commitStepReservationValuesForAvailabilitySnapshots,
    currentGuidedStepId,
    recordId,
    rollbackRejectedStepReservations
  ]);

  const seedReservationCommittedValues = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      virtualValues: Record<string, FieldValue>;
    }) => {
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      if (!quantityFieldId || !args.sourceKey) return;
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      if (reservationCommittedValuesRef.current[draftKey]) return;
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const committedValues: Record<string, FieldValue> = {};
      if (selectedFieldId) committedValues[selectedFieldId] = args.virtualValues[selectedFieldId];
      committedValues[quantityFieldId] = args.virtualValues[quantityFieldId];
      if (modeFieldId) committedValues[modeFieldId] = args.virtualValues[modeFieldId];
      reservationCommittedValuesRef.current[draftKey] = committedValues;
    },
    [buildStepDataSourceDraftKey, reservationCommittedValuesRef]
  );

  const stageStepDataSourceDraftPatch = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      virtualValues: Record<string, FieldValue>;
      patch: Record<string, FieldValue>;
    }) => {
      if (!args.sourceKey) return;
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      const modeFieldId = `${args.config?.modeFieldId || ''}`.trim();
      const nextValues: Record<string, FieldValue> = {
        ...(args.virtualValues || {}),
        ...(args.patch || {})
      };

      setStepDataSourceDrafts(prevDrafts => {
        const nextDraft: Record<string, FieldValue> = {};
        if (selectedFieldId) nextDraft[selectedFieldId] = nextValues[selectedFieldId] === true;
        if (quantityFieldId && Object.prototype.hasOwnProperty.call(nextValues, quantityFieldId)) {
          nextDraft[quantityFieldId] =
            nextValues[quantityFieldId] === undefined ? null : nextValues[quantityFieldId];
        }
        if (
          modeFieldId &&
          Object.prototype.hasOwnProperty.call(nextValues, modeFieldId) &&
          nextValues[modeFieldId] !== undefined &&
          nextValues[modeFieldId] !== null &&
          `${nextValues[modeFieldId]}` !== ''
        ) {
          nextDraft[modeFieldId] = nextValues[modeFieldId];
        }

        const previousDraft = prevDrafts[draftKey] || {};
        const nextDraftKeys = Object.keys(nextDraft);
        const previousDraftKeys = Object.keys(previousDraft);
        if (
          nextDraftKeys.length === previousDraftKeys.length &&
          nextDraftKeys.every(key => previousDraft[key] === nextDraft[key])
        ) {
          return prevDrafts;
        }

        const nextDrafts = { ...prevDrafts };
        nextDrafts[draftKey] = nextDraft;
        stepDataSourceDraftsRef.current = nextDrafts;
        return nextDrafts;
      });
    },
    [buildStepDataSourceDraftKey, setStepDataSourceDrafts, stepDataSourceDraftsRef]
  );

  const hasPendingDeferredReservationChange = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      patch: Record<string, FieldValue>;
    }): boolean => {
      const selectedFieldId = `${args.config?.selectedFieldId || ''}`.trim();
      const quantityFieldId = `${args.config?.quantityFieldId || ''}`.trim();
      if (
        !shouldDeferReservationSync({
          patch: args.patch,
          selectedFieldId,
          quantityFieldId
        })
      ) {
        return false;
      }
      const draftKey = buildStepDataSourceDraftKey(args.config, args.parentRowId, args.sourceKey);
      const committedValues = reservationCommittedValuesRef.current[draftKey];
      if (!committedValues) return true;
      const normalizeValue = (value: FieldValue): string | null => {
        if (value === undefined || value === null) return null;
        const text = `${value}`.trim();
        return text ? text : null;
      };
      const nextSelected = selectedFieldId
        ? (Object.prototype.hasOwnProperty.call(args.patch, selectedFieldId)
            ? args.patch[selectedFieldId]
            : committedValues[selectedFieldId]) === true
        : true;
      const committedSelected = selectedFieldId ? committedValues[selectedFieldId] === true : true;
      const nextQuantity = normalizeValue(
        Object.prototype.hasOwnProperty.call(args.patch, quantityFieldId)
          ? args.patch[quantityFieldId]
          : committedValues[quantityFieldId]
      );
      const committedQuantity = normalizeValue(committedValues[quantityFieldId]);
      return nextSelected !== committedSelected || nextQuantity !== committedQuantity;
    },
    [buildStepDataSourceDraftKey, reservationCommittedValuesRef]
  );

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
      getLineItems: groupId => lineItems?.[groupId] || [],
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
        resolveOptionSetForField: (targetField, groupKey) => resolveOptionSetForField(optionState, targetField, groupKey),
        resolveValueMapValue
      });
    },
    [ensureLineOptions, language, optionState, resolveTopValue]
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
        groupId: q.id,
        language,
        resolveTopValue,
        resolveRowFlowFieldConfig,
        resolveRowFlowDisplayValue
      });
    },
    [language, q.id, resolveRowFlowDisplayValue, resolveRowFlowFieldConfig, resolveTopValue]
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
        groupId: q.id,
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
          groupId: q.id,
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
          const baseGroup = definition.questions.find(q => q.id === effect.key && q.type === 'LINE_ITEM_GROUP') as
            | WebQuestionDefinition
            | undefined;
          const overrideGroup =
            baseGroup && effect.groupOverride ? buildOverlayGroupOverride(baseGroup, effect.groupOverride) : undefined;
          if (!baseGroup && effect.groupOverride) {
            onDiagnostic?.('lineItems.rowFlow.overlay.missingGroup', {
              groupId: q.id,
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
          groupId: q.id,
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
            groupId: q.id,
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
              groupId: q.id,
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
                groupId: q.id,
                rowId: row.id,
                targetKey: effect.groupKey,
                reason: 'notEmpty',
                existingCount: existingRows.length
              });
              return;
            }
            effect.rows.forEach(preset => addLineItemRowManual(effect.groupKey, preset));
            onDiagnostic?.('lineItems.rowFlow.action.seedLineItems', {
              groupId: q.id,
              rowId: row.id,
              targetKey: effect.groupKey,
              count: effect.rows.length,
              whenEmpty: effect.whenEmpty
            });
          });
        }

        if (!setEffects.length && !deleteRoots.length) {
          openEffects.forEach(effect => openResolvedOverlay(effect as Extract<RowFlowResolvedEffect, { type: 'openOverlay' }>));
          if (closeEffects.length && ctx.closeOverlay) {
            ctx.closeOverlay();
            onDiagnostic?.('lineItems.rowFlow.action.closeOverlay', { groupId: q.id, rowId: row.id });
          }
          logActionRun();
          return;
        }

        setLineItems(prev => {
          let next = prev;
          let changed = false;
          setEffects.forEach(effect => {
            const rows = next[effect.groupKey] || [];
            const idx = rows.findIndex(r => r.id === effect.rowId);
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
            ctx.runSelectionEffectsForAncestors?.(groupKey, prev, recomputed, {
              mode: 'init',
              topValues: nextValues
            });
          });
          openEffects.forEach(effect => openResolvedOverlay(effect as Extract<RowFlowResolvedEffect, { type: 'openOverlay' }>));
          return recomputed;
        });
        if (closeEffects.length && ctx.closeOverlay) {
          ctx.closeOverlay();
          onDiagnostic?.('lineItems.rowFlow.action.closeOverlay', { groupId: q.id, rowId: row.id });
        }
        logActionRun();
      };

      const confirm = plan.action.confirm;
      const confirmTiming = (() => {
        const rawTiming = (confirm as any)?.timing;
        const timing = (rawTiming === undefined || rawTiming === null ? '' : rawTiming.toString()).trim().toLowerCase();
        return timing === 'after' ? 'after' : 'before';
      })();
      if (confirm && confirmTiming === 'before' && ctx.openConfirmDialog) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        const cancelLabel = resolveLocalizedString(confirm.cancelLabel, language, tSystem('common.cancel', language, 'Cancel'));
        ctx.openConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel,
          showCancel: confirm.showCancel !== false,
          kind: confirm.kind || 'rowFlow',
          refId: `${q.id}::${row.id}::${plan.action.id}`,
          onConfirm: applyEffects
        });
        return;
      }
      applyEffects();
      if (confirm && confirmTiming === 'after' && ctx.openConfirmDialog) {
        const title = resolveLocalizedString(confirm.title, language, tSystem('common.confirm', language, 'Confirm'));
        const message = resolveLocalizedString(confirm.body, language, '');
        const confirmLabel = resolveLocalizedString(confirm.confirmLabel, language, tSystem('common.ok', language, 'OK'));
        ctx.openConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel: '',
          showCancel: false,
          kind: confirm.kind || 'rowFlow.after',
          refId: `${q.id}::${row.id}::${plan.action.id}::after`,
          onConfirm: () => {}
        });
        onDiagnostic?.('lineItems.rowFlow.action.confirm.after', { groupId: q.id, rowId: row.id, actionId: plan.action.id });
      }
    },
    [
      addLineItemRowManual,
      buildOverlayGroupOverride,
      buildRowFlowContextHeader,
      ctx,
      definition,
      language,
      lineItems,
      onDiagnostic,
      openLineItemGroupOverlay,
      openSubgroupOverlay,
      q.id,
      rowFlow,
      rowFlowSubGroupIds,
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
              groupId: q.id,
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
              groupId: q.id,
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
  }, [onDiagnostic, parentRowById, q.id, rowFlowEnabled, rowFlowStateByRowId, runRowFlowActionWithContext]);

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
        groupId: q.id,
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
        (isSubgroupRef ? buildSubgroupKey(q.id, row.id, refGroupId) : refGroupId || target.groupKey);
      if (!targetGroupKey) return;
      const targetInfo = resolveRowFlowGroupConfig(targetGroupKey);
      if (!targetInfo?.config) return;
      const promptGroupOverride = activePrompt.config?.input?.groupOverride;
      if (!promptGroupOverride || typeof promptGroupOverride !== 'object') return;
      const effectiveTargetConfig = applyLineItemGroupOverride(targetInfo.config, promptGroupOverride);
      if (!(effectiveTargetConfig as any)?.ui?.openInOverlay) return;
      const existingRows = (lineItems[targetInfo.groupId] || []) as LineItemRowState[];
      const autoOpenKey = `${q.id}::${rowId}::${activePrompt.id}::${targetInfo.groupId}`;
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
      const optionSetField: OptionSet = resolveOptionSetForField(optionState, anchorField, targetInfo.groupId);
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
        groupId: q.id,
        rowId,
        promptId: activePrompt.id,
        targetGroupId: targetInfo.groupId,
        optionCount: overlayOptions.length
      });
    });
  }, [
    buildOverlayGroupOverride,
    definition.questions,
    ensureLineOptions,
    language,
    lineItems,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    optionState,
    parentRowById,
    q.id,
    resolveRowFlowGroupConfig,
    rowFlow,
    rowFlowEnabled,
    rowFlowStateByRowId,
    rowFlowSubGroupIds,
    setOverlay,
    values
  ]);

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

        const outputActionsLayout = rowFlow?.output?.actionsLayout === 'below' ? 'below' : 'inline';
        const defaultActionScope = rowFlow?.output?.actionsScope === 'group' ? 'group' : 'row';
        const resolveOutputActionScope = (action: RowFlowActionRef): 'row' | 'group' =>
          action.scope === 'group' || action.scope === 'row' ? action.scope : defaultActionScope;
        const hasGroupActions = (rowFlow?.output?.actions || []).some(action => resolveOutputActionScope(action) === 'group');
        const syntheticGroupRow =
          rowFlowEnabled && hasGroupActions && parentRows.length === 0
            ? ({ id: '__rowFlowGroup__', values: {} as Record<string, FieldValue> } as LineItemRowState)
            : null;
        const syntheticGroupState =
          syntheticGroupRow && rowFlow
            ? resolveRowFlowState({
                config: rowFlow as RowFlowConfig,
                groupId: q.id,
                rowId: syntheticGroupRow.id,
                rowValues: syntheticGroupRow.values,
                lineItems,
                topValues: values,
                subGroupIds: rowFlowSubGroupIds,
                activeFieldPath: activeFieldMeta.path,
                activeFieldType: activeFieldMeta.type
              })
            : null;
        const groupActionRow = hasGroupActions ? parentRows[0] || syntheticGroupRow : null;
        const groupActionState =
          groupActionRow && rowFlowEnabled
            ? parentRows.length
              ? rowFlowStateByRowId.get(groupActionRow.id) || null
              : syntheticGroupState
            : null;
        if (rowFlowEnabled && hasGroupActions) {
          const scopeLogKey = `${q.id}::rowFlow::actionsScope`;
          if (!rowFlowLoggedRef.current.has(scopeLogKey)) {
            rowFlowLoggedRef.current.add(scopeLogKey);
            onDiagnostic?.('lineItems.rowFlow.output.actionsScope', { groupId: q.id, scope: 'group' });
          }
        }
        if (rowFlowEnabled && (rowFlow?.output?.segments || []).length) {
          const segmentLayouts = (rowFlow?.output?.segments || []).map(segment => ({
            fieldRef: segment?.fieldRef || '',
            type: (segment?.type || 'field').toString(),
            layout: (segment?.layout || 'inline').toString()
          }));
          const blockSegments = segmentLayouts.filter(segment => segment.layout.toLowerCase() === 'block');
          if (blockSegments.length) {
            const layoutLogKey = `${q.id}::rowFlow::segmentLayouts`;
            if (!rowFlowLoggedRef.current.has(layoutLogKey)) {
              rowFlowLoggedRef.current.add(layoutLogKey);
              onDiagnostic?.('lineItems.rowFlow.output.segmentLayouts', {
                groupId: q.id,
                blockSegments: blockSegments.length,
                segmentLayouts
              });
            }
          }
          const segmentLogKey = `${q.id}::rowFlow::segmentActions`;
          if (!rowFlowLoggedRef.current.has(segmentLogKey)) {
            const segmentActions = (rowFlow?.output?.segments || []).map(segment =>
              resolveRowFlowSegmentActionIds(segment)
            );
            const segmentsWithActions = segmentActions.filter(ids => ids.length > 0);
            if (segmentsWithActions.length) {
              rowFlowLoggedRef.current.add(segmentLogKey);
              const multiActionSegments = segmentActions.filter(ids => ids.length > 1).length;
              onDiagnostic?.('lineItems.rowFlow.output.segmentActions', {
                groupId: q.id,
                segmentsWithActions: segmentsWithActions.length,
                multiActionSegments,
                segmentLayouts
              });
            }
          }
        }
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
