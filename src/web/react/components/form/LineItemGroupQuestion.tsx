import React from 'react';
import {
  getOptionStateValue,
  matchesWhenClause,
  toOptionSet
} from '../../../core';
import {
  FieldValue,
  OptionSet,
  WebQuestionDefinition
} from '../../../types';
import { resolveLabel } from '../../utils/labels';
import { OptionState } from '../../types';
import {
  resolveFieldHelperText,
} from './utils';
import { srOnly } from './ui';
import { SectionInstruction } from './SectionInstruction';
import {
  applyStepDataSourceNestedPresetNormalizationsAction,
  buildStepDataSourceNestedPresetNormalizationSignatureAction,
  collectStepDataSourceNestedPresetNormalizationsAction
} from '../../features/lineItems/domain/stepDataSourceRows';
import {
  applyLineItemRowSort
} from '../../app/lineItemRowSort';
import { collectSourceFirstSentenceFieldErrorMap } from '../../features/lineItems/domain/lineItemPresentation';
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
import { useStepDataSourceUtilisationDrafts } from '../../features/lineItems/hooks/useStepDataSourceUtilisationDrafts';
import { useStepDataSourceRowProjection } from '../../features/lineItems/hooks/useStepDataSourceRowProjection';
import type {
  LineFileUploadOrderedEntryCheckArgs,
  LineItemGroupQuestionProps
} from './lineItemGroupQuestionTypes';

const resolveOptionSetForField = (optionState: OptionState, field: any, parentId?: string): OptionSet =>
  getOptionStateValue(optionState, field.id, parentId) || toOptionSet(field);

const SOURCE_FIRST_STEP_ERROR_PREFIX = 'ckSourceFirstStep';

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
    queueGuidedStepUtilisationDraftSync,
    onGuidedStepUtilisationDraftStateChange,
    waitForGuidedStepUtilisationDraftSync,
    waitForPendingSharedDataMutations,
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
    utilisationDebounceTimersRef,
    utilisationRequestVersionRef,
    utilisationCommittedValuesRef,
    utilisationSyncCounterRef,
    latestStepDataSourceSyncedLineItemsRef,
    deferredUtilisationAutoSaveHoldReleaseTimerRef,
    isStepDataSourceLoading,
    queueStepUtilisationDraftSnapshotSync,
    queueImmediateStepUtilisationDraftSync,
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
    queueGuidedStepUtilisationDraftSync,
    waitForGuidedStepUtilisationDraftSync,
    waitForPendingSharedDataMutations,
    onDiagnostic
  });

  const {
    toFiniteNumber,
    resolveVirtualRowWhenContext,
    validateVirtualFieldRules,
    resolveVirtualPresetValue,
    resolveVirtualPreset,
    buildStepDataSourceDraftKey,
    resolveDataSourceOutputGroup,
    resolveCurrentUtilisationStateForSource,
    resolveCommittedUtilisationStateForSource,
    buildVirtualDataSourceRowValues,
    resolveStepDataSourceRowsForParent,
    sourceFirstPresentationEntries,
    hideSupplementalHelper,
    resolveVirtualMaxFieldId,
    allowsVirtualIntegerOnly
  } = useStepDataSourceRowProjection({
    q,
    language,
    values,
    lineItems,
    parentRows,
    sourceFirstDataSourceRows,
    stepDataSourceDrafts,
    stepDataSourceDraftsRef,
    utilisationCommittedValuesRef,
    stepDataSourceRefreshTick,
    isStepDataSourceLoading,
    hideSupplementalHelperWhenNoSourceRows,
    resolveTopValue,
    onDiagnostic
  });

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

  const sourceFirstValidationErrorPrefix = React.useMemo(
    () => `${SOURCE_FIRST_STEP_ERROR_PREFIX}:${currentGuidedStepId || 'unguided'}:${q.id}:`,
    [currentGuidedStepId, q.id]
  );

  const sourceFirstValidationErrors = React.useMemo(() => {
    const next: Record<string, string> = {};
    if (!sourceFirstPresentationEntries.length) return next;

    sourceFirstPresentationEntries.forEach((entry: any, entryIndex: number) => {
      const config = entry?.config || {};
      const fields = Array.isArray(config?.fields) ? (config.fields as any[]) : [];
      const fieldById = new Map<string, any>();
      fields.forEach(field => {
        const id = field?.id ? field.id.toString() : '';
        if (id) fieldById.set(id, field);
      });
      if (!fieldById.size) return;

      const uiCfg = config?.ui && typeof config.ui === 'object' ? config.ui : {};
      const compactSentenceRows = Array.isArray(uiCfg.compactSentenceRows) ? (uiCfg.compactSentenceRows as any[]) : [];
      if (!compactSentenceRows.length) return;

      const selectedFieldId = `${config?.selectedFieldId || ''}`.trim();
      const rowKeyFieldId = `${config?.rowKeyFieldId || ''}`.trim();
      const outputKeyFieldId = `${config?.outputKeyFieldId || rowKeyFieldId}`.trim();
      const configId = `${config?.id || entryIndex}`.trim() || `${entryIndex}`;

      (entry.visibleSourceRows || []).forEach((visible: any) => {
        const sourceRow = (visible?.sourceRow || {}) as Record<string, any>;
        const sourceKey = `${sourceRow?.[rowKeyFieldId] ?? ''}`.trim();
        if (!sourceKey) return;

        (visible?.eligibleParents || []).forEach((parentRow: any) => {
          const parentRowId = `${parentRow?.id || ''}`.trim();
          if (!parentRowId) return;

          const output = resolveDataSourceOutputGroup(config, parentRowId);
          const outputRows = output ? lineItems[output.key] || [] : [];
          const existingOutputRow =
            outputRows.find((candidate: any) => `${(candidate.values as any)?.[outputKeyFieldId] ?? ''}`.trim() === sourceKey) || null;
          const draftKey = buildStepDataSourceDraftKey(config, parentRowId, sourceKey);
          const virtualValues = buildVirtualDataSourceRowValues({
            config,
            sourceRow,
            outputRow: existingOutputRow,
            draftValues: stepDataSourceDrafts[draftKey] || null,
            parentRowId
          });
          const isSelected = selectedFieldId ? virtualValues[selectedFieldId] === true : true;
          if (!isSelected) return;

          const parentValues = (parentRow.values || {}) as Record<string, FieldValue>;
          const sentenceRule = compactSentenceRows.find(
            (rule: any) =>
              !rule?.when ||
              matchesWhenClause(
                rule.when as any,
                resolveVirtualRowWhenContext({
                  rowValues: virtualValues,
                  parentValues
                })
              )
          );
          const sentenceParts = Array.isArray(sentenceRule?.parts) ? (sentenceRule.parts as any[]) : [];
          if (!sentenceParts.length) return;

          const fieldErrors = collectSourceFirstSentenceFieldErrorMap({
            parts: sentenceParts,
            fieldById,
            virtualValues,
            parentValues,
            validateFieldRules: validateVirtualFieldRules
          });

          Object.entries(fieldErrors).forEach(([fieldId, message]) => {
            if (!message) return;
            next[`${sourceFirstValidationErrorPrefix}${configId}:${parentRowId}:${sourceKey}:${fieldId}`] = message;
          });
        });
      });
    });

    return next;
  }, [
    buildStepDataSourceDraftKey,
    buildVirtualDataSourceRowValues,
    lineItems,
    resolveDataSourceOutputGroup,
    resolveVirtualRowWhenContext,
    sourceFirstPresentationEntries,
    sourceFirstValidationErrorPrefix,
    stepDataSourceDrafts,
    validateVirtualFieldRules
  ]);

  React.useEffect(() => {
    setErrors((prev: Record<string, string>) => {
      const next = { ...(prev || {}) };
      let changed = false;
      Object.keys(next).forEach(key => {
        if (key.startsWith(sourceFirstValidationErrorPrefix)) {
          delete next[key];
          changed = true;
        }
      });
      Object.entries(sourceFirstValidationErrors).forEach(([key, message]) => {
        if (next[key] !== message) {
          next[key] = message;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    return () => {
      setErrors((prev: Record<string, string>) => {
        const next = { ...(prev || {}) };
        let changed = false;
        Object.keys(next).forEach(key => {
          if (key.startsWith(sourceFirstValidationErrorPrefix)) {
            delete next[key];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
  }, [setErrors, sourceFirstValidationErrorPrefix, sourceFirstValidationErrors]);

  const {
    syncStepDataSourceOutputRow,
    syncStepDataSourceOutputRowWithUtilisation
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
  });

  const {
    seedUtilisationCommittedValues,
    stageStepDataSourceDraftPatch,
    queueDeferredStepUtilisationSync,
    hasPendingDeferredUtilisationChange,
    cancelDeferredStepUtilisationSync,
    scheduleDeferredStepUtilisationAutoSaveHoldRelease
  } = useStepDataSourceUtilisationDrafts({
    groupId: q.id,
    buildStepDataSourceDraftKey,
    utilisationCommittedValuesRef,
    utilisationDebounceTimersRef,
    deferredUtilisationAutoSaveHoldReleaseTimerRef,
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
    utilisationCommittedValuesRef,
    buildStepDataSourceDraftKey,
    resolveDataSourceOutputGroup,
    resolveStepDataSourceRowsForParent,
    isStepDataSourceLoading,
    applyStepDataSourceAvailabilitySnapshots,
    queueStepUtilisationDraftSnapshotSync,
    syncStepDataSourceOutputRow,
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
            seedUtilisationCommittedValues={seedUtilisationCommittedValues}
            stageStepDataSourceDraftPatch={stageStepDataSourceDraftPatch}
            queueDeferredStepUtilisationSync={queueDeferredStepUtilisationSync}
            hasPendingDeferredUtilisationChange={hasPendingDeferredUtilisationChange}
            cancelDeferredStepUtilisationSync={cancelDeferredStepUtilisationSync}
            scheduleDeferredStepUtilisationAutoSaveHoldRelease={scheduleDeferredStepUtilisationAutoSaveHoldRelease}
            syncStepDataSourceOutputRowWithUtilisation={syncStepDataSourceOutputRowWithUtilisation}
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
              seedUtilisationCommittedValues={seedUtilisationCommittedValues}
              queueDeferredStepUtilisationSync={queueDeferredStepUtilisationSync}
              hasPendingDeferredUtilisationChange={hasPendingDeferredUtilisationChange}
              cancelDeferredStepUtilisationSync={cancelDeferredStepUtilisationSync}
              syncStepDataSourceOutputRowWithUtilisation={syncStepDataSourceOutputRowWithUtilisation}
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
