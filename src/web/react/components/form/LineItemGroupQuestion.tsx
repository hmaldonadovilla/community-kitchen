import React from 'react';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  getOptionStateValue,
  matchesWhenClause,
  computeTotals,
  optionKey,
  toDependencyValue,
  toOptionSet
} from '../../../core';
import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import {
  DATA_SOURCE_CACHE_CLEARED_EVENT,
  DATA_SOURCE_CACHE_UPDATED_EVENT,
  fetchDataSource,
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
  ValidationRule,
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
  applyInventoryAvailabilitySnapshotToRow,
  normalizeInventoryAvailabilitySnapshotForDisplay
} from '../../features/reservations/availabilitySnapshots';
import {
  resolveReservationResourceFieldIds,
  resolveReservationSourceItemKey
} from '../../features/reservations/sourceFields';
import { resolveUserFacingErrorMessage, upsertInventoryReservationApi } from '../../api';
import { resolveValueMapValue } from './valueMaps';
import {
  collectComputedSelectionEffectInitTargets,
  collectSelectionEffectInitTargets,
  collectSubgroupSeedInitTargets
} from './selectionEffectInit';
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
  resolveSourceFirstAllocationLabelVisibility,
  resolveSourceFirstRowSortMode,
  shouldRemoveSourceFirstAllocationOutputWhenExcluded
} from '../../app/sourceFirstAllocations';
import {
  buildStepDataSourceBootstrapSignature,
  shouldWaitForGuidedReservationSyncOnBootstrap
} from '../../app/stepDataSourceBootstrap';
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
  applyAutoAddSubgroupSingleOptionAnchorFillAction,
  collectAutoAddSubgroupAnchorTargetsAction,
  reconcileAutoAddRowsAction,
  resolveAutoAddDependsOnIds,
  resolveAutoAddDesiredRowsAction
} from '../../features/lineItems/domain/autoAddModeRows';
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
import type {
  LineFileUploadOrderedEntryCheckArgs,
  LineItemGroupQuestionProps
} from './lineItemGroupQuestionTypes';

const GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON = 'guidedStepReservationDeferred';

import {
  ROW_NON_MATCH_OPTIONS_KEY,
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
  const warningModeLoggedRef = React.useRef<Set<string>>(new Set());
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

  const guidedStepFieldId = `${(definition as any)?.steps?.stateFields?.prefix || '__ckStep'}`.trim() || '__ckStep';
  const currentGuidedStepId = `${resolveTopValue(guidedStepFieldId) ?? ''}`.trim();
  const stepDataSourceRows = React.useMemo(
    () => (Array.isArray(dataSourceRows) ? dataSourceRows.filter(Boolean) : []),
    [dataSourceRows]
  );
  const topLevelVisibilityContext = React.useMemo<VisibilityContext>(
    () => ({
      getValue: (fieldId: string) => resolveTopValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    }),
    [lineItems, resolveTopValue]
  );
  const activeStepDataSourceRows = React.useMemo(
    () =>
      stepDataSourceRows.filter(config => {
        const when = (config as any)?.presentationWhen;
        return !when || matchesWhenClause(when as any, topLevelVisibilityContext);
      }),
    [stepDataSourceRows, topLevelVisibilityContext]
  );
  const sourceFirstDataSourceRows = React.useMemo(
    () =>
      activeStepDataSourceRows.filter(config => {
        if (`${(config as any)?.presentation || ''}`.trim() !== 'sourceFirstAllocations') return false;
        return true;
      }),
    [activeStepDataSourceRows]
  );
  const [stepDataSourceRefreshTick, setStepDataSourceRefreshTick] = React.useState(0);
  const stepDataSourceRefreshHandleRef = React.useRef<{
    kind: 'raf' | 'timeout';
    handle: number | ReturnType<typeof setTimeout>;
  } | null>(null);
  const queueStepDataSourceRefreshTick = React.useCallback(() => {
    if (stepDataSourceRefreshHandleRef.current) return;
    const flush = () => {
      stepDataSourceRefreshHandleRef.current = null;
      setStepDataSourceRefreshTick(prev => prev + 1);
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      stepDataSourceRefreshHandleRef.current = {
        kind: 'raf',
        handle: window.requestAnimationFrame(flush)
      };
      return;
    }
    stepDataSourceRefreshHandleRef.current = {
      kind: 'timeout',
      handle: setTimeout(flush, 0)
    };
  }, []);
  React.useEffect(
    () => () => {
      const pending = stepDataSourceRefreshHandleRef.current;
      stepDataSourceRefreshHandleRef.current = null;
      if (!pending) return;
      if (
        pending.kind === 'raf' &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(pending.handle as number);
        return;
      }
      clearTimeout(pending.handle as ReturnType<typeof setTimeout>);
    },
    []
  );
  const [stepDataSourceLoadingCounts, setStepDataSourceLoadingCounts] = React.useState<Record<string, number>>({});
  const [stepDataSourceDrafts, setStepDataSourceDrafts] = React.useState<Record<string, Record<string, FieldValue>>>({});
  const stepDataSourceDraftsRef = React.useRef<Record<string, Record<string, FieldValue>>>({});
  const stepDataSourceRecordIdRef = React.useRef<string>('');
  const stepDataSourceBootstrapSignatureRef = React.useRef<string>('');
  const reservationDebounceTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const reservationRequestVersionRef = React.useRef<Record<string, number>>({});
  const reservationCommittedValuesRef = React.useRef<Record<string, Record<string, FieldValue>>>({});
  const reservationSyncCounterRef = React.useRef(0);
  const latestStepDataSourceSyncedLineItemsRef = React.useRef<LineItemState | null>(null);
  const deferredReservationAutoSaveHoldReleaseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceFirstPresentationLoggedRef = React.useRef<string>('');
  const pendingStepReservationDraftSyncRef = React.useRef<{
    stepId: string;
    reason: string;
  } | null>(null);
  const shouldWaitForReservationSyncBeforeBootstrap = React.useMemo(
    () => shouldWaitForGuidedReservationSyncOnBootstrap(dataSourceBootstrap),
    [dataSourceBootstrap]
  );
  const [pendingStepReservationDraftSyncTick, setPendingStepReservationDraftSyncTick] = React.useState(0);
  const stepDataSourceBootstrapSignature = React.useMemo(
    () =>
      buildStepDataSourceBootstrapSignature({
        recordId,
        language,
        stepId: currentGuidedStepId,
        configs: activeStepDataSourceRows,
        bootstrap: dataSourceBootstrap
      }),
    [activeStepDataSourceRows, currentGuidedStepId, dataSourceBootstrap, language, recordId]
  );

  React.useEffect(() => {
    stepDataSourceDraftsRef.current = stepDataSourceDrafts;
  }, [stepDataSourceDrafts]);

  React.useEffect(() => {
    return () => {
      Object.values(reservationDebounceTimersRef.current).forEach(timer => {
        clearTimeout(timer);
      });
      reservationDebounceTimersRef.current = {};
      reservationCommittedValuesRef.current = {};
    };
  }, []);

  const toFiniteNumber = React.useCallback((value: any): number => toFiniteNumberValue(value), []);

  const buildStepDataSourceLoadKey = React.useCallback(
    (config: any): string => {
      const dataSource = config?.dataSource && typeof config.dataSource === 'object' ? config.dataSource : config;
      return JSON.stringify({
        sourceId: `${dataSource?.id || ''}`.trim(),
        sourceFormKey: `${dataSource?.formKey || ''}`.trim(),
        projection: Array.isArray(dataSource?.projection)
          ? dataSource.projection.map((entry: any) => `${entry ?? ''}`.trim()).filter(Boolean)
          : [],
        language: `${language || 'EN'}`.trim().toUpperCase()
      });
    },
    [language]
  );

  const mutateStepDataSourceLoading = React.useCallback(
    (configs: any[], delta: 1 | -1) => {
      const candidates = Array.isArray(configs) ? configs.filter(Boolean) : [];
      if (!candidates.length) return;
      setStepDataSourceLoadingCounts(prev => {
        let changed = false;
        const next = { ...prev };
        candidates.forEach(config => {
          const key = buildStepDataSourceLoadKey(config);
          const current = Number(next[key] || 0);
          const nextValue = Math.max(0, current + delta);
          if (nextValue === current) return;
          changed = true;
          if (nextValue > 0) next[key] = nextValue;
          else delete next[key];
        });
        return changed ? next : prev;
      });
    },
    [buildStepDataSourceLoadKey]
  );

  const beginStepDataSourceLoading = React.useCallback(
    (configs: any[]) => mutateStepDataSourceLoading(configs, 1),
    [mutateStepDataSourceLoading]
  );

  const endStepDataSourceLoading = React.useCallback(
    (configs: any[]) => mutateStepDataSourceLoading(configs, -1),
    [mutateStepDataSourceLoading]
  );

  const isStepDataSourceLoading = React.useCallback(
    (config: any): boolean => {
      const key = buildStepDataSourceLoadKey(config);
      return Number(stepDataSourceLoadingCounts[key] || 0) > 0;
    },
    [buildStepDataSourceLoadKey, stepDataSourceLoadingCounts]
  );

  const queueImmediateStepReservationDraftSync = React.useCallback(
    (args: {
      config: any;
      parentRowId: string;
      sourceKey: string;
      patch: Record<string, FieldValue>;
      snapshotLineItems?: LineItemState | null;
    }) => {
      if (!queueGuidedStepReservationDraftSync) return;
      if (!currentGuidedStepId) return;
      const reason = `lineItem:${q.id}:${args.parentRowId}:${args.sourceKey}:${Object.keys(args.patch).sort().join(',') || 'change'}`;
      onDiagnostic?.('guidedStep.reservationSync.queued', {
        groupId: q.id,
        stepId: currentGuidedStepId,
        parentRowId: args.parentRowId,
        sourceKey: args.sourceKey,
        patchFields: Object.keys(args.patch).sort()
      });
      const snapshotLineItems = args.snapshotLineItems || latestStepDataSourceSyncedLineItemsRef.current || null;
      if (snapshotLineItems) {
        latestStepDataSourceSyncedLineItemsRef.current = null;
        queueGuidedStepReservationDraftSync({
          stepId: currentGuidedStepId,
          reason,
          snapshotLineItems
        });
        return;
      }
      pendingStepReservationDraftSyncRef.current = {
        stepId: currentGuidedStepId,
        reason
      };
      setPendingStepReservationDraftSyncTick(prev => prev + 1);
    },
    [currentGuidedStepId, onDiagnostic, q.id, queueGuidedStepReservationDraftSync]
  );

  const updateStepDataSourceAvailability = React.useCallback(
    (config: any, availability: InventoryAvailabilitySnapshot | null | undefined): void => {
      if (!config?.dataSource || !availability) return;
      mutateCachedDataSource(config.dataSource, language, items =>
        items.map(item => {
          if (!item || typeof item !== 'object') return item;
          const matchesRecord = `${item.id ?? ''}`.trim() === `${availability.resourceRecordId || ''}`.trim();
          const matchesItem =
            !availability.resourceItemId ||
            resolveReservationSourceItemKey(config, item) === `${availability.resourceItemId}`.trim();
          if (!matchesRecord || !matchesItem) return item;
          return applyInventoryAvailabilitySnapshotToRow(item, availability);
        })
      );
      queueStepDataSourceRefreshTick();
    },
    [language, queueStepDataSourceRefreshTick]
  );

  const applyStepDataSourceAvailabilitySnapshots = React.useCallback(
    (snapshots: InventoryAvailabilitySnapshot[] | null | undefined): void => {
      const entries = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
      if (!entries.length || !activeStepDataSourceRows.length) return;
      activeStepDataSourceRows.forEach(config => {
        const dataSourceFormKey = `${config?.dataSource?.formKey || ''}`.trim();
        entries.forEach(snapshot => {
          if (!snapshot) return;
          if (dataSourceFormKey && dataSourceFormKey !== `${snapshot.resourceFormKey || ''}`.trim()) return;
          updateStepDataSourceAvailability(config, normalizeInventoryAvailabilitySnapshotForDisplay(snapshot));
        });
      });
    },
    [activeStepDataSourceRows, updateStepDataSourceAvailability]
  );

  React.useEffect(() => {
    if (!stepDataSourceRows.length) {
      stepDataSourceBootstrapSignatureRef.current = '';
      return;
    }
    const normalizedRecordId = `${recordId || ''}`.trim();
    const recordChanged = stepDataSourceRecordIdRef.current !== normalizedRecordId;
    stepDataSourceRecordIdRef.current = normalizedRecordId;
    if (recordChanged) {
      const timerKeys = Object.keys(reservationDebounceTimersRef.current);
      if (timerKeys.length) {
        timerKeys.forEach(key => {
          const timer = reservationDebounceTimersRef.current[key];
          if (timer) clearTimeout(timer);
          delete reservationDebounceTimersRef.current[key];
        });
      }
      reservationRequestVersionRef.current = {};
      reservationCommittedValuesRef.current = {};
      if (Object.keys(stepDataSourceDraftsRef.current).length) {
        stepDataSourceDraftsRef.current = {};
        setStepDataSourceDrafts({});
      }
    }
    if (!activeStepDataSourceRows.length) {
      stepDataSourceBootstrapSignatureRef.current = '';
      return;
    }
    if (!recordChanged && stepDataSourceBootstrapSignatureRef.current === stepDataSourceBootstrapSignature) {
      return;
    }
    let cancelled = false;
    const configEntries = activeStepDataSourceRows
      .map(candidate => {
        if (!candidate || typeof candidate !== 'object') return null;
        const dataSource = (candidate as any).dataSource;
        if (!dataSource || typeof dataSource !== 'object') return null;
        const shouldForceRefresh =
          recordChanged ||
          (candidate as any).forceRefreshOnMount === true ||
          Boolean((candidate as any).availability) ||
          Boolean((candidate as any).reservationBehavior);
        return { dataSource, shouldForceRefresh };
      })
      .filter((candidate): candidate is { dataSource: any; shouldForceRefresh: boolean } => Boolean(candidate));
    if (!configEntries.length) return;

    const runBootstrap = async () => {
      const loadingEntries = configEntries.map(({ dataSource }) => ({ dataSource, id: dataSource?.id }));
      stepDataSourceBootstrapSignatureRef.current = stepDataSourceBootstrapSignature;
      beginStepDataSourceLoading(loadingEntries);
      try {
        if (
          shouldWaitForReservationSyncBeforeBootstrap &&
          normalizedRecordId &&
          waitForGuidedStepReservationDraftSync
        ) {
          onDiagnostic?.('guidedStep.dataSourceBootstrap.wait.start', {
            groupId: q.id,
            stepId: currentGuidedStepId || null,
            recordId: normalizedRecordId
          });
          const waitResult = await waitForGuidedStepReservationDraftSync({
            recordId: normalizedRecordId,
            stepId: currentGuidedStepId || undefined,
            reason: `stepDataSourceBootstrap:${q.id}`
          });
          if (cancelled) return;
          if (!waitResult.ok) {
            onDiagnostic?.('guidedStep.dataSourceBootstrap.wait.blocked', {
              groupId: q.id,
              stepId: currentGuidedStepId || null,
              recordId: normalizedRecordId,
              message: waitResult.message || null
            });
            return;
          }
          onDiagnostic?.('guidedStep.dataSourceBootstrap.wait.done', {
            groupId: q.id,
            stepId: currentGuidedStepId || null,
            recordId: normalizedRecordId
          });
        }

        const pendingFetches = configEntries
          .filter(({ dataSource, shouldForceRefresh }) => shouldForceRefresh || !peekCachedDataSource(dataSource, language))
          .map(({ dataSource, shouldForceRefresh }) => ({
            config: dataSource,
            promise: fetchDataSource(
              dataSource,
              language,
              shouldForceRefresh ? { forceRefresh: true } : undefined
            ).catch(() => null)
          }));
        if (!pendingFetches.length) {
          if (!cancelled) {
            queueStepDataSourceRefreshTick();
          }
          return;
        }
        await Promise.all(pendingFetches.map(entry => entry.promise));
        if (!cancelled) {
          queueStepDataSourceRefreshTick();
        }
      } finally {
        endStepDataSourceLoading(loadingEntries);
      }
    };

    void runBootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    activeStepDataSourceRows,
    beginStepDataSourceLoading,
    currentGuidedStepId,
    endStepDataSourceLoading,
    language,
    onDiagnostic,
    q.id,
    queueStepDataSourceRefreshTick,
    recordId,
    shouldWaitForReservationSyncBeforeBootstrap,
    stepDataSourceBootstrapSignature,
    stepDataSourceRows,
    waitForGuidedStepReservationDraftSync
  ]);

  React.useEffect(() => {
    if (!activeStepDataSourceRows.length) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    let cancelled = false;
    const watchedDataSourceIds = new Set(
      activeStepDataSourceRows
        .map(candidate =>
          candidate && typeof candidate === 'object' ? `${(candidate as any)?.dataSource?.id || ''}`.trim() : ''
        )
        .filter(Boolean)
    );

    const handleCacheCleared = () => {
      const configs = activeStepDataSourceRows
        .map(candidate => (candidate && typeof candidate === 'object' ? (candidate as any).dataSource : null))
        .filter((candidate): candidate is any => Boolean(candidate && typeof candidate === 'object'));
      if (!configs.length) {
        queueStepDataSourceRefreshTick();
        return;
      }
      beginStepDataSourceLoading(configs.map(config => ({ dataSource: config, id: config?.id })));
      Promise.all(configs.map(config => fetchDataSource(config, language, { forceRefresh: true }).catch(() => null)))
        .then(() => {
          if (cancelled) return;
          queueStepDataSourceRefreshTick();
        })
        .finally(() => {
          endStepDataSourceLoading(configs.map(config => ({ dataSource: config, id: config?.id })));
        });
    };

    const handleCacheUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const dataSourceId = `${detail?.id || ''}`.trim();
      if (dataSourceId && !watchedDataSourceIds.has(dataSourceId)) return;
      queueStepDataSourceRefreshTick();
    };

    window.addEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCacheCleared as EventListener);
    window.addEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleCacheUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCacheCleared as EventListener);
      window.removeEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleCacheUpdated as EventListener);
    };
  }, [activeStepDataSourceRows, beginStepDataSourceLoading, endStepDataSourceLoading, language, queueStepDataSourceRefreshTick]);

  React.useEffect(() => {
    const pending = pendingStepReservationDraftSyncRef.current;
    if (!pending || !queueGuidedStepReservationDraftSync) return;
    pendingStepReservationDraftSyncRef.current = null;
    const snapshotLineItems = latestStepDataSourceSyncedLineItemsRef.current || lineItems;
    latestStepDataSourceSyncedLineItemsRef.current = null;
    queueGuidedStepReservationDraftSync({
      stepId: pending.stepId,
      reason: pending.reason,
      snapshotLineItems
    });
  }, [
    lineItems,
    pendingStepReservationDraftSyncTick,
    queueGuidedStepReservationDraftSync,
    stepDataSourceDrafts,
    values
  ]);

  React.useEffect(() => {
    if (!sourceFirstDataSourceRows.length) {
      sourceFirstPresentationLoggedRef.current = '';
      return;
    }
    const countRows = (config: any): number => {
      if (!config?.dataSource || typeof config.dataSource !== 'object') return 0;
      const cached = peekCachedDataSource(config.dataSource, language);
      const items = Array.isArray((cached as any)?.items) ? (cached as any).items : Array.isArray(cached) ? cached : [];
      return items.length;
    };
    const signature = sourceFirstDataSourceRows
      .map(config => `${(config as any)?.id || 'datasource'}:${countRows(config)}`)
      .join('|');
    if (!signature || sourceFirstPresentationLoggedRef.current === signature) return;
    sourceFirstPresentationLoggedRef.current = signature;
    onDiagnostic?.('dataSourceRows.sourceFirst.enabled', {
      groupId: q.id,
      configIds: sourceFirstDataSourceRows.map(config => `${(config as any)?.id || ''}`.trim()).filter(Boolean),
      allocationLabelVisibilityByConfig: sourceFirstDataSourceRows.map(config => ({
        id: `${(config as any)?.id || ''}`.trim() || 'datasource',
        visibility: resolveSourceFirstAllocationLabelVisibility(
          (config as any)?.allocationLabelVisibility ?? (config as any)?.ui?.allocationLabelVisibility
        )
      })),
      rowSortByConfig: sourceFirstDataSourceRows.map(config => ({
        id: `${(config as any)?.id || ''}`.trim() || 'datasource',
        sort: resolveSourceFirstRowSortMode((config as any)?.sourceFirstRowSort ?? (config as any)?.ui?.sourceFirstRowSort)
      })),
      sourceRowCount: sourceFirstDataSourceRows.reduce((count, config) => count + countRows(config), 0),
      parentRowCount: parentRows.length
    });
  }, [language, onDiagnostic, parentRows.length, q.id, sourceFirstDataSourceRows]);

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
    [buildStepDataSourceDraftKey, lineItems, parentRows, q.id]
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
      resolveDataSourceOutputGroup
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
      language,
      setLineItems,
      setValues,
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
  }, [setAutoSaveHold]);

  const releaseDeferredStepReservationAutoSaveHold = React.useCallback(() => {
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
    }
    setAutoSaveHold?.(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
  }, [setAutoSaveHold]);

  const scheduleDeferredStepReservationAutoSaveHoldRelease = React.useCallback(() => {
    if (!setAutoSaveHold) return;
    if (deferredReservationAutoSaveHoldReleaseTimerRef.current) {
      clearTimeout(deferredReservationAutoSaveHoldReleaseTimerRef.current);
    }
    deferredReservationAutoSaveHoldReleaseTimerRef.current = setTimeout(() => {
      deferredReservationAutoSaveHoldReleaseTimerRef.current = null;
      setAutoSaveHold(false, { reason: GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON });
    }, 500);
  }, [setAutoSaveHold]);

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
    [buildDeferredStepReservationTimerKey]
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
    [buildDeferredStepReservationTimerKey, requestDeferredStepReservationAutoSaveHold]
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
      resolveDataSourceOutputGroup
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
    if (syncedLineItems && queueGuidedStepReservationDraftSync) {
      latestStepDataSourceSyncedLineItemsRef.current = null;
      queueGuidedStepReservationDraftSync({
        stepId: currentGuidedStepId,
        reason,
        snapshotLineItems: syncedLineItems
      });
      return;
    }
    pendingStepReservationDraftSyncRef.current = {
      stepId: currentGuidedStepId,
      reason
    };
    setPendingStepReservationDraftSyncTick(prev => prev + 1);
  }, [
    activeStepDataSourceRows,
    currentGuidedStepId,
    isStepDataSourceLoading,
    language,
    lineItems,
    onDiagnostic,
    q.id,
    queueGuidedStepReservationDraftSync,
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
    [buildStepDataSourceDraftKey]
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
    [buildStepDataSourceDraftKey]
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
    [buildStepDataSourceDraftKey]
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

  const warningsFor = (fieldPath: string): string[] => {
    const key = (fieldPath || '').toString();
    const list = key && warningByField ? (warningByField as any)[key] : undefined;
    return Array.isArray(list) ? list.filter(Boolean).map(m => (m || '').toString()) : [];
  };
  const filterWarnings = (msgs: string[]): string[] => {
    if (!msgs.length) return msgs;
    if (useValidationNonMatchWarnings) return msgs;
    return msgs.filter(msg => !genericNonMatchWarnings.has(msg));
  };
  const hasWarning = (fieldPath: string): boolean => filterWarnings(warningsFor(fieldPath)).length > 0;
  const renderWarnings = (fieldPath: string): React.ReactNode => {
    const msgs = filterWarnings(warningsFor(fieldPath));
    if (!msgs.length) return null;
    return msgs.map((m, idx) => (
      <div key={`${fieldPath}-warning-${idx}`} className="warning">
        {m}
      </div>
    ));
  };

  const buildOptionSetForLineField = React.useCallback(
    (field: any, groupKey: string): OptionSet => resolveOptionSetForField(optionState, field, groupKey),
    [optionState]
  );

  // Auto-add should only reconcile when the controlling dependency values change (or when anchor options arrive),
  // not when the user removes a row or edits unrelated fields.
  const autoCfg = q.lineItemConfig;
  const autoAnchorField =
    autoCfg?.addMode === 'auto' && autoCfg.anchorFieldId
      ? (autoCfg.fields || []).find((f: any) => f && f.id === autoCfg.anchorFieldId)
      : undefined;
  const autoAnchorIsChoice = !!autoAnchorField && (autoAnchorField as any).type === 'CHOICE';
  const autoDependencyIds = autoAnchorIsChoice ? resolveAutoAddDependsOnIds(autoAnchorField) : [];
  const autoDepSignature = autoDependencyIds
    .map(depId => {
      const dep = toDependencyValue((values as any)[depId] as any);
      if (dep === undefined || dep === null) return '';
      return dep.toString();
    })
    .join('||');
  const autoAnchorOptionSetKey =
    autoAnchorIsChoice && autoAnchorField ? optionKey((autoAnchorField as any).id, q.id) : '';
  const autoAnchorOptionSet = autoAnchorOptionSetKey ? optionState[autoAnchorOptionSetKey] : undefined;

  // Auto addMode: when dependency fields are valid, or when there is no dependency filter,
  // auto-create one row per allowed anchor option.
  React.useEffect(() => {
    if (submitting) return;
    const cfg = q.lineItemConfig;
    if (!cfg || cfg.addMode !== 'auto' || !cfg.anchorFieldId) return;
    const anchorField = (cfg.fields || []).find(f => f.id === cfg.anchorFieldId);
    if (!anchorField || anchorField.type !== 'CHOICE') return;
    const dependencyIds = resolveAutoAddDependsOnIds(anchorField);

    // Ensure anchor options are loaded so allowed values can be computed.
    ensureLineOptions(q.id, anchorField);

    const { valid, desired, depVals } = resolveAutoAddDesiredRowsAction({
      groupKey: q.id,
      anchorField,
      dependencyIds,
      getDependencyRaw: depId => values[depId],
      buildOptionSetForLineField,
      language
    });

    const selectorId = cfg.sectionSelector?.id;
    const selectorValue = selectorId ? (values as any)[selectorId] : undefined;
    if (!valid) return;

    const spec = {
      targetKey: q.id,
      anchorFieldId: anchorField.id,
      desired,
      depVals,
      selectorId,
      selectorValue
    };

    setLineItems(prev => {
      const currentRows = prev[q.id] || [];
      const res = reconcileAutoAddRowsAction({ currentRows, ...spec });
      if (!res.changed) return prev;
      const nextState = { ...prev, [q.id]: res.rows };
      const latestValues = latestValuesRef.current || {};
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, nextState, {
        mode: 'change'
      });
      latestValuesRef.current = nextValues;
      setValues(nextValues);
      onDiagnostic?.('ui.lineItems.autoAdd.apply', {
        targetKey: q.id,
        anchorFieldId: anchorField.id,
        valid,
        desiredCount: res.desiredCount,
        nextRowCount: res.rows.length,
        contextId: res.contextId
      });
      return recomputed;
    });
  }, [
    buildOptionSetForLineField,
    definition,
    language,
    submitting,
    q.id,
    q.lineItemConfig,
    q.lineItemConfig?.addMode,
    q.lineItemConfig?.anchorFieldId,
    // Only re-run when controlling dependency values change (or when the anchor options set changes)
    autoDepSignature,
    autoAnchorOptionSet,
    ensureLineOptions,
    onDiagnostic,
    setLineItems,
    setValues,
    values
  ]);

  // Auto addMode for subgroups (per parent row).
  React.useEffect(() => {
    if (submitting) return;
    const parentCfg = q.lineItemConfig;
    if (!parentCfg?.subGroups?.length) return;
    const parentRows = lineItems[q.id] || [];
    if (!parentRows.length) return;

    const autoSubs = parentCfg.subGroups.filter(sub => (sub as any).addMode === 'auto' && (sub as any).anchorFieldId);
    if (!autoSubs.length) return;
    const specs: Array<{
      targetKey: string;
      anchorFieldId: string;
      desired: string[];
      depVals: (string | number | null | undefined)[];
      selectorId?: string;
      selectorValue?: FieldValue;
    }> = [];

    autoSubs.forEach(sub => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      const anchorField = ((sub as any).fields || []).find((f: any) => f.id === (sub as any).anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      const dependencyIds = resolveAutoAddDependsOnIds(anchorField);

      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);

        const selectorId = (sub as any).sectionSelector?.id;
        const selectorValue = selectorId ? (subgroupSelectors as any)[subKey] : undefined;

        const { valid, desired, depVals } = resolveAutoAddDesiredRowsAction({
          groupKey: subKey,
          anchorField,
          dependencyIds,
          getDependencyRaw: depId => {
            if (selectorId && depId === selectorId) return selectorValue;
            const fromRow = row.values ? (row.values as any)[depId] : undefined;
            if (fromRow !== undefined && fromRow !== null && fromRow !== '') return fromRow;
            return (values as any)[depId];
          },
          buildOptionSetForLineField,
          language
        });
        if (!valid) return;

        specs.push({
          targetKey: subKey,
          anchorFieldId: anchorField.id,
          desired,
          depVals,
          selectorId,
          selectorValue
        });
      });
    });

    if (!specs.length) return;

    setLineItems(prev => {
      let next: any = prev;
      let changedCount = 0;
      specs.forEach(spec => {
        const currentRows = (next[spec.targetKey] || prev[spec.targetKey] || []) as any[];
        const res = reconcileAutoAddRowsAction({ currentRows, ...spec });
        if (!res.changed) return;
        if (next === prev) next = { ...prev };
        (next as any)[spec.targetKey] = res.rows;
        changedCount += 1;
      });
      if (next === prev) return prev;
      const latestValues = latestValuesRef.current || {};
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, next as any, {
        mode: 'change'
      });
      latestValuesRef.current = nextValues;
      setValues(nextValues);
      onDiagnostic?.('ui.lineItems.autoAdd.applyBatch', {
        parentGroupId: q.id,
        specCount: specs.length,
        changedCount
      });
      return recomputed;
    });
  }, [
    buildOptionSetForLineField,
    definition,
    onDiagnostic,
    submitting,
    q,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    setLineItems,
    setValues
  ]);

  const initializedSelectionEffectsRef = React.useRef<Set<string>>(new Set());
  const initSourceQuestion = React.useMemo(
    () => definition.questions.find(entry => entry.id === q.id) || q,
    [definition, q]
  );
  const selectionEffectInitTopValues = React.useMemo(
    () =>
      ({
        ...(values as Record<string, FieldValue>),
        ...(recordMeta?.id !== undefined ? { id: recordMeta.id as FieldValue } : {}),
        ...(recordMeta?.createdAt !== undefined ? { createdAt: recordMeta.createdAt as FieldValue } : {}),
        ...(recordMeta?.updatedAt !== undefined ? { updatedAt: recordMeta.updatedAt as FieldValue } : {}),
        ...(recordMeta?.status !== undefined ? { status: recordMeta.status as FieldValue, STATUS: recordMeta.status as FieldValue } : {}),
        ...(recordMeta?.pdfUrl !== undefined ? { pdfUrl: recordMeta.pdfUrl as FieldValue } : {})
      }) as Record<string, FieldValue>,
    [recordMeta?.createdAt, recordMeta?.id, recordMeta?.pdfUrl, recordMeta?.status, recordMeta?.updatedAt, values]
  );

  React.useEffect(() => {
    if (submitting) return;
    const targets = [
      ...collectSelectionEffectInitTargets(initSourceQuestion, lineItems, selectionEffectInitTopValues),
      ...collectSubgroupSeedInitTargets(initSourceQuestion, lineItems),
      ...collectComputedSelectionEffectInitTargets(initSourceQuestion, lineItems, selectionEffectInitTopValues)
    ];
    if (!targets.length) {
      initializedSelectionEffectsRef.current.clear();
      return;
    }

    const nextKeys = new Set<string>();
    targets.forEach(target => {
      nextKeys.add(target.signature);
      if (initializedSelectionEffectsRef.current.has(target.signature)) return;

      initializedSelectionEffectsRef.current.add(target.signature);
      onDiagnostic?.('selectionEffects.initRowValue', {
        groupId: target.groupKey,
        rowId: target.rowId || null,
        fieldId: target.field.id
      });
      const initField =
        target.field && typeof target.field === 'object' && target.field.readOnly === true
          ? { ...target.field, readOnly: false }
          : target.field;
      handleLineFieldChange(target.group as any, target.rowId, initField, target.rawValue as any, {
        source: 'selectionEffectInit'
      });
    });

    initializedSelectionEffectsRef.current.forEach(signature => {
      if (!nextKeys.has(signature)) initializedSelectionEffectsRef.current.delete(signature);
    });
  }, [submitting, initSourceQuestion, lineItems, selectionEffectInitTopValues, handleLineFieldChange, onDiagnostic]);

  // Autofill subgroup anchor choice when there is exactly 1 allowed option (avoid extra tap).
  // This covers cases where subgroup rows already exist (e.g., seeded minRows/defaults) and the anchor is still empty.
  React.useEffect(() => {
    if (submitting) return;
    const parentCfg = q.lineItemConfig;
    if (!parentCfg?.subGroups?.length) return;
    const parentRows = (lineItems[q.id] || []) as any[];
    if (!parentRows.length) return;

    const subgroupTargets = collectAutoAddSubgroupAnchorTargetsAction(parentCfg);
    if (!subgroupTargets.length) return;

    // Prime option loads for subgroup anchor fields.
    subgroupTargets.forEach(({ sub, subId, anchorFieldId }) => {
      const anchorField = (sub.fields || []).find((f: any) => f?.id === anchorFieldId);
      if (!anchorField || anchorField.type !== 'CHOICE') return;
      parentRows.forEach(row => {
        const subKey = buildSubgroupKey(q.id, row.id, subId);
        ensureLineOptions(subKey, anchorField);
      });
    });

    setLineItems(prev => {
      const fillResult = applyAutoAddSubgroupSingleOptionAnchorFillAction({
        previousLineItems: prev,
        parentGroupId: q.id,
        subgroupTargets,
        values: values as Record<string, FieldValue>,
        subgroupSelectors,
        buildOptionSetForLineField,
        language
      });
      if (!fillResult.changed) return prev;
      fillResult.diagnostics.forEach(entry => {
        onDiagnostic?.('ui.subgroup.anchor.autofillSingleOption', entry);
      });
      const latestValues = latestValuesRef.current || {};
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, latestValues, fillResult.lineItems, {
        mode: 'change'
      });
      latestValuesRef.current = nextValues;
      setValues(nextValues);
      return recomputed;
    });
  }, [
    buildOptionSetForLineField,
    definition,
    onDiagnostic,
    submitting,
    q,
    values,
    language,
    optionState,
    lineItems,
    subgroupSelectors,
    ensureLineOptions,
    setLineItems,
    setValues
  ]);

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

        const groupTotals = computeTotals({ config: q.lineItemConfig!, rows: parentRows, groupId: q.id, invalidFieldPaths: errors }, language);
        const liUi = q.lineItemConfig?.ui;
        const uiMode = (liUi?.mode || 'default').toString().trim().toLowerCase();
        const isTableMode = uiMode === 'table';
        const hideGroupLabel = q.ui?.hideLabel === true;

        React.useEffect(() => {
          if (!onDiagnostic) return;
          if (liUi?.addButtonPlacement && liUi.addButtonPlacement !== 'both') {
            onDiagnostic('ui.lineItems.addButtonPlacement', { groupId: q.id, value: liUi.addButtonPlacement });
          }
        }, [onDiagnostic, liUi?.addButtonPlacement, q.id]);

        const nonMatchWarningModeRaw = (liUi as any)?.nonMatchWarningMode;
        const nonMatchWarningModeCandidate =
          nonMatchWarningModeRaw !== undefined && nonMatchWarningModeRaw !== null
            ? nonMatchWarningModeRaw.toString().trim().toLowerCase()
            : '';
        const nonMatchWarningMode: 'descriptive' | 'validation' | 'both' =
          nonMatchWarningModeCandidate === 'validation' ||
          nonMatchWarningModeCandidate === 'rules' ||
          nonMatchWarningModeCandidate === 'rule' ||
          nonMatchWarningModeCandidate === 'generic'
            ? 'validation'
            : nonMatchWarningModeCandidate === 'both' || nonMatchWarningModeCandidate === 'all'
              ? 'both'
              : 'descriptive';
        const useValidationNonMatchWarnings = nonMatchWarningMode !== 'descriptive';
        const useDescriptiveNonMatchWarnings = nonMatchWarningMode !== 'validation';
        if (nonMatchWarningModeCandidate) {
          const warningKey = `${q.id}::nonMatchWarningMode`;
          if (!warningModeLoggedRef.current.has(warningKey)) {
            warningModeLoggedRef.current.add(warningKey);
            onDiagnostic?.('ui.lineItems.nonMatchWarningMode', { groupId: q.id, mode: nonMatchWarningMode });
          }
        }

        const messageFieldsAll = q.lineItemConfig?.fields || [];
        const tableColumnIdsRaw = isTableMode && Array.isArray(liUi?.tableColumns) ? liUi?.tableColumns : [];
        const tableColumnIds = tableColumnIdsRaw
          .map(id => (id !== undefined && id !== null ? id.toString().trim() : ''))
          .filter(Boolean);
        const tableFieldsAll = messageFieldsAll;
        const tableFields = isTableMode
          ? (tableColumnIds.length ? tableColumnIds : tableFieldsAll.map(f => f.id))
              .map(fid => tableFieldsAll.find(f => f.id === fid))
              .filter((field): field is (typeof tableFieldsAll)[number] => Boolean(field))
          : [];
        const tableFieldIdSet = new Set(tableFields.map(field => field.id));
        const isSourceFirstAllocations = (() => {
          if (!rowFlowEnabled) return false;
          const dataSourceRowsCfg = Array.isArray((q.lineItemConfig as any)?.dataSourceRows)
            ? ((q.lineItemConfig as any).dataSourceRows as any[])
            : [];
          return dataSourceRowsCfg.some(cfg => ((cfg?.presentation || '').toString().trim().toLowerCase() === 'sourcefirstallocations'));
        })();
        const tableTotals =
          isTableMode && !rowFlowEnabled
            ? groupTotals.filter(total => {
                const key = (total.key || '').toString();
                return key ? tableFieldIdSet.has(key) : false;
              })
            : [];
        const toolbarTotals = isTableMode && !rowFlowEnabled ? [] : isSourceFirstAllocations ? [] : groupTotals;
        const genericNonMatchWarnings = (() => {
          const seen = new Set<string>();
          messageFieldsAll.forEach(field => {
            const rules = Array.isArray((field as any)?.validationRules)
              ? ((field as any).validationRules as ValidationRule[])
              : [];
            rules.forEach((rule: ValidationRule) => {
              if (!rule || (rule as any)?.level !== 'warning') return;
              const when = (rule as any)?.when;
              if (!when || typeof when !== 'object') return;
              if ((when as any)?.fieldId !== ROW_NON_MATCH_OPTIONS_KEY) return;
              const msg = resolveLocalizedString((rule as any)?.message, language, '');
              const text = msg ? msg.toString().trim() : '';
              if (text) seen.add(text);
            });
          });
          return seen;
        })();

        const shouldRenderTopToolbar = !hideToolbars && (showSelectorTop || showAddTop);
        const shouldRenderBottomToolbar =
          !hideToolbars && (parentRows.length > 0 || showAddBottom) && (showAddBottom || showSelectorBottom || toolbarTotals.length > 0);

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
