import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOptionStateValue,
  loadOptionsFromDataSource,
  mergeOptionStateValue,
  optionKey,
  peekOptionsFromDataSource,
  normalizeLanguage
} from '../core';
import {
  AnalyticsSnapshot,
  FieldValue,
  FieldChangeDialogConfig,
  LangCode,
  LocalizedString,
  SelectionEffect,
  SystemActionGateDialogActionConfig,
  StepMilestoneActionConfig,
  SystemActionGateDialogConfig,
  WebFormDefinition,
  WebQuestionDefinition,
  WebFormSubmission
} from '../types';
import type {
  BankUtilisationPlanRequest,
  BankUtilisationPlanScope
} from '../../types';
import {
  BootstrapContext,
  submit,
  checkDedupConflictApi,
  triggerFollowupBatch,
  clearHtmlRenderClientCache,
  clearMarkdownRenderClientCache,
  invalidateClientSharedDataCaches,
  consumePrefetchedHomeBootstrapApi,
  fetchHomeBootstrapApi,
  fetchSummaryRecordApi,
  fetchSortedBatch,
  FollowupBatchResponse,
  ListSort,
  ListResponse,
  ListItem,
  fetchRecordById,
  fetchRecordByRowNumber,
  fetchRecordsByRowNumbers,
  getRecordVersionApi,
  seedSummaryHtmlTemplateCache,
  resolveUserFacingErrorMessage
} from './api';
import type { FollowupBatchOptions } from './api';
import { AppHeader } from './components/app/AppHeader';
import { AppHeaderStatus, shouldRenderAppHeaderSaveNotice } from './components/app/AppHeaderStatus';
import { AppOrientationBlocker } from './components/app/AppOrientationBlocker';
import { AppActionBar } from './components/app/AppActionBars';
import { AppMainViews } from './components/app/AppMainViews';
import { ValidationHeaderNotice } from './components/app/ValidationHeaderNotice';
import { useAppHeaderNavigation } from './components/app/useAppHeaderNavigation';
import { useAppViewportState } from './components/app/useAppViewportState';
import { matchesWhenClause } from '../rules/visibility';
import { type ReportOverlayState } from './components/app/ReportOverlay';
import { AppOverlays } from './components/app/AppOverlays';
import { DedupCheckingNotice, DedupDuplicateNotice } from './components/app/AppNotices';
import { useAppActionBarState } from './components/app/useAppActionBarState';
import { useAppActionNotices } from './components/app/useAppActionNotices';
import { useDedupDialogPresentation } from './components/app/useDedupDialogPresentation';
import { useSubmitGateEnableDialog } from './components/app/useSubmitGateEnableDialog';
import { useSystemActionGateState } from './components/app/useSystemActionGateState';
import { useAppPerfOpenRecordBridge, type AppRecordSelectHandler } from './components/app/useAppPerfOpenRecordBridge';
import { useAppPerfTools } from './components/app/useAppPerfTools';
import { useAppNavigationPerf } from './components/app/useAppNavigationPerf';
import { useAppDiagnostics } from './components/app/useAppDiagnostics';
import { useAppDialogState } from './components/app/useAppDialogState';
import { useAutoSaveNotice } from './components/app/useAutoSaveNotice';
import { useAppAutoSaveDedupConfig } from './components/app/useAppAutoSaveDedupConfig';
import { useDedupProgressDialog } from './components/app/useDedupProgressDialog';
import { useReadOnlyFilesOverlay } from './components/app/useReadOnlyFilesOverlay';
import { useButtonTextWrapObserver } from './components/app/useButtonTextWrapObserver';
import { useReadyForProductionUnlockConfig } from './components/app/useReadyForProductionUnlockConfig';
import { useAppStatusTransitions } from './components/app/useAppStatusTransitions';
import { useAppCustomButtons } from './components/app/useAppCustomButtons';
import {
  pruneOptionStateForDataSource,
  shouldClearOptionStateAfterDataSourceCacheClear
} from './app/dataSourceOptionState';
import { useOpenUrlFieldAction } from './components/app/useOpenUrlFieldAction';
import { useAppReportPreviewActions } from './components/app/useAppReportPreviewActions';
import { useAppSubmitDialogConfig } from './components/app/useAppSubmitDialogConfig';
import { useAppTemplatePrefetch } from './components/app/useAppTemplatePrefetch';
import { useAppSelectionEffects } from './components/app/useAppSelectionEffects';
import { useAppDedupDialogHandlers } from './components/app/useAppDedupDialogHandlers';
import { usePendingFollowupBatchWait } from './components/app/usePendingFollowupBatchWait';
import {
  usePendingSharedDataMutations,
  type PendingSharedDataMutationEntry
} from './components/app/usePendingSharedDataMutations';
import { useServerGeneratedTopValues } from './components/app/useServerGeneratedTopValues';
import { useCreateNewRecordAction } from './components/app/useCreateNewRecordAction';
import { useCreateRecordPresetAction } from './components/app/useCreateRecordPresetAction';
import { useDuplicateCurrentRecordAction } from './components/app/useDuplicateCurrentRecordAction';
import { useUpdateRecordButtonAction } from './components/app/useUpdateRecordButtonAction';
import { HTML_PREVIEW_STYLES, MARKDOWN_PREVIEW_STYLES } from './components/app/previewStyles';
import { FORM_VIEW_STYLES } from './components/form/styles';
import { FormErrors, LineItemState, OptionState, View } from './types';
import { useBlockingOverlay } from './features/overlays/useBlockingOverlay';
import { useConfirmDialog } from './features/overlays/useConfirmDialog';
import { FieldChangeDialogInputState, useFieldChangeDialog } from './features/fieldChangeDialog/useFieldChangeDialog';
import {
  useConfiguredDialogActionRunner,
  type ConfiguredDialogActionRunner
} from './features/steps/hooks/useConfiguredDialogActionRunner';
import { runUpdateRecordAction } from './features/customActions/updateRecord/runUpdateRecordAction';
import type { GuidedExternalSyncSignal } from './features/steps/domain/guidedExternalSyncSignal';
import {
  buildDraftPayload,
  buildUploadDraftPayload,
  buildSubmissionPayload,
  chainSerializedSubmissionRequest,
  collectRuntimeLineItemFieldIds,
  collectValidationWarnings,
  computeUrlOnlyUploadUpdates,
  isSubmissionStaleMessage,
  markNoopIfUnchanged,
  prepareClientDataVersionDispatch,
  resolveFollowupActionResultMeta,
  resolveExistingRecordId,
  resolveCurrentClientDataVersion,
  settleClientDataVersionAfterDispatch,
  shouldAdoptIncomingRecordSnapshotMetaOnly,
  shouldApplyIncomingRecordSnapshot,
  stripRuntimeLineItemStateFields,
  validateForm
} from './app/submission';
import { buildValidationContext } from './app/validation';
import { clearBundledHtmlClientCaches } from './app/bundledHtmlClientRenderer';
import { shouldShowRecordLoadingPlaceholder } from './app/recordOpenState';
import { resolveUiRecordStatus } from './app/recordMeta';
import {
  shouldApplyPrefetchedRecordPreview,
  shouldDiscardRecordLoadResult,
  shouldWaitForRecordPrefetchBeforeIndividualFetch,
  type RecordSnapshotPrefetchSource
} from './app/recordLoadGuard';
import {
  resolveCurrentOpenRecordId,
  resolveKnownClientDataVersion,
  resolveRecordVersionCheckComparison
} from './app/recordLifecycle';
import {
  resolveDeferredRecordFreshnessResumeAction,
  resolveRecordFreshnessMetaOnlyAdoptionRule,
  resolveRecordFreshnessConfig,
  resolveRecordFreshnessSyncBlockers,
  resolveRecordFreshnessTimerDelay,
  shouldPreserveLocalDraftAfterMetaOnlyAdoption,
  shouldRealignGuidedStepAfterStaleSync
} from './app/recordFreshness';
import { buildRecordSyncComparableFingerprint } from './app/recordSyncReview';
import { buildSuccessfulSubmissionSnapshot } from './app/submissionSnapshotState';
import {
  buildDataSourceFreshnessBaselineKey,
  buildDataSourceFreshnessSnapshotSignature,
  primeDataSourceFreshnessWatchBaselines,
  resolveActiveDataSourceFreshnessWatches,
  resolveDataSourceFreshnessBaselineComparison,
  resolveDataSourceFreshnessSignatureFieldIds,
  resolveDataSourceFreshnessTimerDelay,
  resolveDataSourceFreshnessWatches
} from './app/dataSourceFreshness';
import {
  buildDataSourceConfigLookup,
  filterDataSourceFreshnessWatchesByDataSourceIds,
  resolveDataSourceConfigById
} from './app/dataSourceVisibility';
import {
  resolvePendingSharedDataMutationMatches,
  resolveStepDataSourceTargetFormKeys
} from './app/sharedDataMutations';
import {
  shouldArmAutoSaveHoldForReportAction,
  shouldHoldAutoSaveForReportOverlay
} from './app/reportPreviewAutosave';
import {
  readOpenUrlRuntimeEnvironment,
  shouldUseInAppPdfPreview
} from './app/openUrlField';
import { runSelectionEffects as runSelectionEffectsHelper } from './app/selectionEffects';
import { isRetryableRecordBusyMessage as isRetryableRecordBusyMessageValue } from './app/retryableRecordBusy';
import {
  buildFormDataSourceRefreshKey,
  filterFormOpenPrefetchDataSources,
  normalizeDataSourcePrefetchRetryDelays
} from './app/dataSourcePrefetchPolicy';
import { getPerfNow } from './app/perfClock';
import { collectListViewRuleColumnDependencies } from './app/listViewRuleColumns';
import { collectListViewMetricDependencies } from './app/listViewMetric';
import { resolveInitialListSearchValue } from './app/listViewSearch';
import { isHiddenHtmlTemplateUpdateRecordAction } from './app/htmlTemplateActionGate';
import {
  buildHomeListLocalCacheKey,
  readHomeListLocalCache,
  resolveGlobalCacheVersion,
  writeHomeListLocalCache
} from './app/homeListLocalCache';
import {
  clearDateSearchLocalCacheFamily,
  readDateSearchLocalCache,
  writeDateSearchLocalCache,
  type DateSearchCacheDescriptor
} from './app/dateSearchLocalCache';
import {
  readCachedRecordSnapshot,
  writeCachedRecordSnapshot,
  writeCachedRecordSnapshots
} from './app/recordLocalCache';
import { annotateListResponseWithInitialDateFilter } from './app/homeListResponse';
import { hasIncompleteRejectDedupKeys } from './app/dedupKeyUtils';
import {
  computeDedupKeyFieldIdMap,
  computeDedupKeyFingerprint,
  computeDedupSignatureFromValues
} from './app/dedupPrecheck';
import {
  resolveDedupIncompleteHomeDialogConfig,
  resolveDedupIncompleteHomeDialogCopy
} from './app/dedupIncompleteHomeDialog';
import {
  applyFieldChangeDialogTargets,
  resolveFieldChangeDialogConfirmUpdates,
  evaluateFieldChangeDialogWhenWithFallback,
  finalizeInitialDateChangeDialogEntry,
  resolveFieldChangeDialogCancelAction,
  resolveFieldChangeDialogSource,
  shouldDeferFieldChangeMutation,
  shouldHoldFieldChangeSelectionEffects,
  shouldSuppressInitialDateChangeDialog,
  type FieldChangeDialogTargetUpdate
} from './app/fieldChangeDialog';
import { buildFieldChangeDialogInputsAction } from './app/fieldChangeDialogInputs';
import {
  buildCanonicalNonMatchWarningLineItems,
  collectNonMatchWarningPaths
} from './app/nonMatchWarningFields';
import {
  buildInitialLineItems,
  parseSubgroupKey,
  resolveSubgroupKey
} from './app/lineItems';
import { preserveSelectionEffectSourceMappedValues } from './app/selectionEffectSourceMetadata';
import { normalizeRecordValues } from './app/records';
import { applyValueMapsToForm } from './app/valueMaps';
import { applyClearOnChange, isClearOnChangeEnabled } from './app/clearOnChange';
import { reconcileAutoAddModeGroups } from './app/autoAddModeOverlay';
import {
  bumpUploadFieldInvalidationVersion,
  getUploadFieldInvalidationVersion,
  resolveInvalidatedUploadFieldPathsFromDialogUpdates,
  wasUploadFieldInvalidated
} from './app/uploadFieldInvalidation';
import { mergeSavedUploadUrlItems, mergeUploadedFieldItems } from './app/uploadFieldMerge';
import { resolveUploadBusyOverlayTransition } from './app/uploadBusyOverlay';
import { resolveUploadBlockUntilSaved } from './app/uploadTransaction';
import {
  buildUploadQueueKey,
  resolveUploadQueueBusyState,
  shouldAutosaveAfterUploadQueueDrained
} from './app/uploadQueue';
import {
  applyUploadValueToFormState,
  applyUploadValueToPayloadValues,
  buildUploadNonTargetFingerprint,
  extractUploadValueFromMeta,
  resolveUploadTransactionTarget,
  splitUploadValue,
  uploadCompletionMatchesCurrentDraft
} from './app/uploadTransactionState';
import {
  buildCompletedDraftSaveFingerprint,
  buildDraftSaveFingerprint,
  buildDraftStateFingerprint
} from './app/draftSaveFingerprint';
import { waitForActiveDraftSaveTransactionsAction } from './app/draftSaveActiveWait';
import { triggerDedupDeleteOnKeyChangeAction } from './app/dedupDeleteOnKeyChange';
import {
  resolveSubmitPreparationMessageKey,
  shouldShowSubmitPreparationOverlay,
  type SubmitWaitQueuePolicy
} from './app/submitPreparation';
import { shouldWaitBeforeLeavingRecord } from './app/navigationPendingWork';
import { shouldSkipCleanDraftSnapshotSave } from './app/snapshotSave';
import { shouldClearStatusAfterSuccessfulSave } from './app/saveFailureStatus';
import { shouldSkipGuidedStepBackgroundSync } from './app/guidedStepBackgroundSync';
import {
  aggregateContiguousPrefetchedPageItems,
  aggregatePrefetchedPageItems,
  isCompletePrefetchedListResponse
} from './app/listPrefetch';
import {
  hasLoadedListResponse,
  mergeListItemsWithRecordCache,
  mergeListRecordSnapshotCache,
  removeListCacheRowPure,
  upsertListCacheRowPure
} from './app/listCache';
import {
  releaseDeferredAnalyticsPrefetchKey,
  reserveDeferredAnalyticsPrefetchKey,
  shouldPrefetchDeferredAnalytics,
  shouldRequestHomeAnalyticsRefreshOnListEnter
} from './app/deferredAnalyticsPrefetch';
import { shouldApplyDedupPrecheckResult } from './app/dedupRaceGuards';
import { resolveFollowupResultApplicationTarget } from './app/followupResultScope';
import type { GuidedStepsVirtualState } from './features/steps/domain/resolveVirtualStepField';
import {
  GENERATED_SUBMIT_EFFECT_RECORDS_FIELD,
  filterGeneratedRecordsForDialog,
  getGeneratedRecordsFromFollowupResult,
  mergeGeneratedSubmitEffectRecordsIntoValues,
  renderGeneratedRecordLine,
  selectMilestoneConfirmationDialog,
  selectMilestoneProgressDialog
} from './features/steps/domain/milestoneDialogs';
import { applyRecordDeltaToAnalyticsSnapshot } from './analytics/liveSnapshot';
import { runWithConcurrencyLimit } from './utils/runWithConcurrencyLimit';
import { shouldBypassCopyCurrentRecordDestructiveChange } from './app/copyProfile';
import { hasInvalidRejectDedupKeyValues } from './app/copyDraftCreation';
import { resolveCopyCurrentRecordDialog } from './app/copyCurrentRecordDialog';
import {
  areReportFollowupActions,
  resolveOptimisticStatusTransitionForActions
} from './app/followupParallel';
import {
  cloneLineItemStateSnapshot,
  mergeGuidedUtilisationLineItemsFromSnapshot
} from './features/utilisations/stepUtilisationPlan';
import {
  issueUtilisationRequestEpoch,
  shouldApplyUtilisationPlanResponse
} from './features/utilisations/utilisationResponsePolicy';
import {
  shouldDeferUtilisationDraftSyncToDeleteOnKeyChange,
  shouldSkipUtilisationDraftSyncForDeleteOnKeyChange
} from './features/utilisations/domain/utilisationDraftSyncGuards';
import {
  useGuidedUtilisationPlanSync,
  type GuidedUtilisationSyncMeta,
  type GuidedUtilisationSyncOutcome
} from './features/utilisations/hooks/useGuidedUtilisationPlanSync';
import { saveGuidedUtilisationDraft } from './features/utilisations/services/guidedUtilisationDraftSave';
import type {
  GuidedUtilisationSyncFreshness,
  GuidedUtilisationSyncWaitResult
} from './features/utilisations/domain/utilisationSyncFreshness';
import {
  hasEnteredLineItemValues,
  hasEnteredTopLevelValues,
  hasIncompleteConfiguredFields,
  resolveDebouncedAutoSaveDelay,
  shouldArmAutoSaveForUserEditEvent,
  shouldScheduleAutoSaveAfterPendingFollowup,
  shouldSuppressAutomatedAutoSave,
  shouldSuppressPostPersistAutoSave,
  shouldSuppressSelectionEffectInitAutoSave,
  shouldRetainPendingDebouncedAutoSave,
  shouldForceAutoSaveOnConfiguredBlur,
  isBlockingDedupConflict,
  shouldShowDedupProgressDialogState
} from './app/autoSaveDedup';
import {
  applyIngredientActivationSystemFields,
  getIngredientNameValidationMessage,
  isIngredientCreateAutoSaveReady,
  isIngredientNameFieldId,
  isIngredientsManagementForm
} from './app/ingredientsCreateRules';
import packageJson from '../../../package.json';
import githubMarkdownCss from 'github-markdown-css/github-markdown-light.css';
import { resolveLabel } from './utils/labels';
import { tSystem, tSystemOptional } from '../systemStrings';
import { resolveLocalizedString, resolveOptionalLocalizedString } from '../i18n';
import { isEmptyValue } from './utils/values';
import {
  clearFetchDataSourceCache,
  DATA_SOURCE_CACHE_CLEARED_EVENT,
  DATA_SOURCE_CACHE_UPDATED_EVENT,
  fetchDataSource,
  prefetchDataSources
} from '../data/dataSources';
import { collectDataSourceConfigsForPrefetch, isHomePrefetchEligibleDataSource } from '../data/dataSourcePrefetch';
import {
  guidedStepRequiresPersistedRecord,
  shouldWaitForActiveDraftSaveBeforeEnsuringRecord
} from './features/steps/domain/guidedStepRecordRequirement';
import {
  applyUploadedFieldOverridesToState,
  applyUploadedFieldOverridesToPayload,
  type UploadedFieldValueOverride
} from './features/uploads/domain/uploadedFieldOverrides';
import {
  useQrScannerAppIntegration,
  type QrScannerSubmissionMeta
} from './features/uploads/hooks/useQrScannerAppIntegration';
import {
  matchesStatusTransition,
  resolveStatusTransitionValue
} from '../../domain/statusTransitions';

type SubmissionMeta = QrScannerSubmissionMeta;

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

type FieldChangePending = {
  fieldPath: string;
  scope: 'top' | 'line';
  fieldId: string;
  groupId?: string;
  rowId?: string;
  dialog: FieldChangeDialogConfig;
  effectQuestion?: WebQuestionDefinition;
  selectionEffects?: SelectionEffect[];
  prevSnapshot: { values: Record<string, FieldValue>; lineItems: LineItemState };
  prevValue?: FieldValue;
  nextValue: FieldValue;
  allowEmptyNextValue?: boolean;
  autoSaveSnapshot: {
    dirty: boolean;
    queued: boolean;
    lastSeen: { values: Record<string, FieldValue>; lineItems: LineItemState } | null;
  };
};

// Build marker to verify deployed bundle version in UI
const BUILD_MARKER = `v${(packageJson as any).version || 'dev'}`;

// Remaining list pages are purely background enrichment for the home list.
// Delay them so they do not compete with more valuable boot work such as
// data source warmup and first-record snapshot hydration.
const HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS = 9000;
const HOME_ANALYTICS_PREFETCH_DELAY_MS = 1400;
const HOME_DATA_SOURCE_PREFETCH_DELAY_MS = 2200;
const HOME_RECORD_PREFETCH_DELAY_MS = 250;
const RETRYABLE_AUTOSAVE_DELAYS_MS = [1500, 3000, 5000];
const DRAFT_SNAPSHOT_RETRY_DELAYS_MS = [0, 1500, 3000];
const GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON = 'guidedStepUtilisationDeferred';
const SELECTION_EFFECT_INIT_AUTOSAVE_SUPPRESS_MS = 30000;
const POST_PERSIST_AUTOSAVE_SUPPRESS_MS = 30000;

type RecordSnapshotPrefetchRequest = {
  promise: Promise<Record<string, WebFormSubmission>>;
  source: RecordSnapshotPrefetchSource;
  startedAt: number;
  rowNumbers: number[];
};

const App: React.FC<BootstrapContext> = ({ definition, formKey, record, analytics, analyticsRev, envTag }) => {
  const availableLanguages = useMemo(
    () => (definition.languages && definition.languages.length ? definition.languages : ['EN']) as Array<'EN' | 'FR' | 'NL'>,
    [definition.languages]
  );
  const defaultLanguage = normalizeLanguage(definition.defaultLanguage || availableLanguages[0] || record?.language);
  const allowLanguageSelection = definition.languageSelectorEnabled !== false && availableLanguages.length > 1;
  const initialLanguage = allowLanguageSelection ? normalizeLanguage(record?.language || defaultLanguage) : defaultLanguage;
  const [language, setLanguage] = useState<LangCode>(initialLanguage);
  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const normalized = normalizeRecordValues(definition, record?.values);
    const initialLineItems = buildInitialLineItems(definition, record?.values);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
    return mapped.values;
  });
  const [lineItems, setLineItems] = useState<LineItemState>(() => {
    const normalized = normalizeRecordValues(definition, record?.values);
    const initialLineItems = buildInitialLineItems(definition, record?.values);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
    return mapped.lineItems;
  });
  const ingredientsFormActive = isIngredientsManagementForm(formKey);
  const ingredientCreateAutoSaveReady = ingredientsFormActive ? isIngredientCreateAutoSaveReady(values as any) : true;
  const [view, setView] = useState<View>('list');
  const [submitting, setSubmitting] = useState(false);
  const [reportOverlay, setReportOverlay] = useState<ReportOverlayState>({
    open: false,
    title: '',
    pdfPhase: 'idle'
  });
  const reportPdfSeqRef = useRef<number>(0);
  const [homeFirstDataReadyAtMs, setHomeFirstDataReadyAtMs] = useState<number>(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const formNavigateToFieldRef = useRef<((fieldKey: string) => void) | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [validationNoticeHidden, setValidationNoticeHidden] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<{
    top: Array<{ message: string; fieldPath: string }>;
    byField: Record<string, string[]>;
  }>({
    top: [],
    byField: {}
  });
  const warningTouchedRef = useRef<Set<string>>(new Set());
  const nonMatchWarningPathsRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [statusLevel, setStatusLevel] = useState<'info' | 'success' | 'error' | null>(null);
  const statusRef = useRef<string | null>(status);
  const statusLevelRef = useRef<'info' | 'success' | 'error' | null>(statusLevel);
  type DedupConflictInfo = { ruleId: string; message: string; existingRecordId?: string; existingRowNumber?: number };
  const [dedupChecking, setDedupChecking] = useState<boolean>(false);
  const [dedupConflict, setDedupConflict] = useState<DedupConflictInfo | null>(null);
  const [dedupNotice, setDedupNotice] = useState<DedupConflictInfo | null>(null);
  type ListDedupPromptState = {
    conflict: DedupConflictInfo;
    source: string;
    buttonId: string;
    qIdx?: number | null;
    values: Record<string, FieldValue>;
  };
  const [listDedupPrompt, setListDedupPrompt] = useState<ListDedupPromptState | null>(null);
  const [precreateDedupChecking, setPrecreateDedupChecking] = useState<boolean>(false);
  const dedupCheckingRef = useRef<boolean>(false);
  const dedupConflictRef = useRef<DedupConflictInfo | null>(null);
  const dedupSignatureRef = useRef<string>('');
  const dedupCheckSeqRef = useRef<number>(0);
  const dedupCheckTimerRef = useRef<number | null>(null);
  const lastDedupCheckedSignatureRef = useRef<string>('');
  type RecordStaleInfo = {
    recordId: string;
    message: string;
    cachedVersion?: number;
    serverVersion?: number;
    serverRow?: number;
  };
  type SynchronizeStaleRecordFn = (args: {
    reason: string;
    recordId: string;
    cachedVersion?: number | null;
    serverVersion?: number | null;
    serverRow?: number | null;
  }) => Promise<boolean>;
  type RecordSnapshotApplyMode = 'ignored' | 'metaOnly' | 'applied';
  const [recordStale, setRecordStale] = useState<RecordStaleInfo | null>(null);
  const recordStaleRef = useRef<RecordStaleInfo | null>(null);
  const submitPrecheckInFlightRef = useRef<boolean>(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const submitConfirmedRef = useRef(false);
  const submitPipelineInFlightRef = useRef(false);
  const updateRecordActionInFlightRef = useRef(false);
  const ensureDraftRecordIdActionRef = useRef<
    ((args?: { reason?: string; fieldPath?: string }) => Promise<{ success: boolean; recordId?: string; message?: string }>) | null
  >(null);
  const flushPendingDraftSaveActionRef = useRef<((reason: string) => Promise<{ ok: boolean; message?: string }>) | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string>(record?.id || '');
  const [selectedRecordSnapshot, setSelectedRecordSnapshot] = useState<WebFormSubmission | null>(record || null);
  const [prefetchedSummaryHtml, setPrefetchedSummaryHtml] = useState<{ recordId: string; html: string } | null>(null);
  const [recordLoadingId, setRecordLoadingId] = useState<string | null>(null);
  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);
  const [optionState, setOptionState] = useState<OptionState>({});
  const [tooltipState, setTooltipState] = useState<Record<string, Record<string, string>>>({});
  const preloadPromisesRef = useRef<Record<string, Promise<void> | undefined>>({});
  const optionStateRef = useRef<OptionState>({});
  const tooltipStateRef = useRef<Record<string, Record<string, string>>>({});
  const recordFetchSeqRef = useRef(0);
  const lastRecordSnapshotApplyModeRef = useRef<{
    mode: RecordSnapshotApplyMode;
    recordId: string | null;
    dataVersion: number | null;
  }>({
    mode: 'ignored',
    recordId: null,
    dataVersion: null
  });
  const [externalScrollAnchor, setExternalScrollAnchor] = useState<string | null>(null);
  const [lastSubmissionMeta, setLastSubmissionMeta] = useState<SubmissionMeta | null>(() =>
    record
      ? {
          id: record.id,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          status: record.status || null
        }
      : null
  );
  const { debugEnabled, logEvent } = useAppDiagnostics();
  /**
   * Tracks whether the current form session represents a "create new record" flow (blank/new preset/copy),
   * even after autosave generates a record id. Used to enforce dedup rules on drafts without breaking edits
   * of existing records loaded from the list.
   */
  const createFlowRef = useRef<boolean>(false);
  const homeLoadStartedAtRef = useRef<number>(getPerfNow());
  const homeTimeToDataMeasuredRef = useRef(false);
  const homePerfInitialisedRef = useRef(false);
  const { isMobile, isCompact, blockLandscape } = useAppViewportState({
    portraitOnlyEnabled: definition.portraitOnly === true,
    language,
    onDiagnostic: logEvent
  });
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    statusLevelRef.current = statusLevel;
  }, [statusLevel]);
  useEffect(() => {
    const normalized = (status || '').toString().trim().replace(/\.+$/, '').toLowerCase();
    if (normalized !== 'report sent') return;
    if (statusLevel !== 'success') {
      setStatusLevel('success');
    }
    const timer = globalThis.setTimeout(() => {
      const current = (statusRef.current || '').toString().trim().replace(/\.+$/, '').toLowerCase();
      if (current !== 'report sent') return;
      statusRef.current = null;
      statusLevelRef.current = null;
      setStatus(null);
      setStatusLevel(null);
      logEvent('status.reportSent.autoClear', { delayMs: 3000 });
    }, 3000);
    return () => globalThis.clearTimeout(timer);
  }, [logEvent, status, statusLevel]);
  const clearSaveFailureStatusAfterSuccessfulSave = useCallback(
    (reason: string) => {
      if (
        !shouldClearStatusAfterSuccessfulSave({
          status: statusRef.current,
          statusTone: statusLevelRef.current
        })
      ) {
        return;
      }
      statusRef.current = null;
      statusLevelRef.current = null;
      setStatus(null);
      setStatusLevel(null);
      logEvent('status.saveFailure.cleared', { reason });
    },
    [logEvent]
  );
  const resolveUiErrorMessage = useCallback(
    (err: any, fallback: string) => resolveUserFacingErrorMessage(err, fallback),
    []
  );
  const resolveLogMessage = useCallback(
    (err: any, fallback: string) => (err?.message || err?.toString?.() || fallback).toString(),
    []
  );
  const isRetryableRecordBusyMessage = useCallback(isRetryableRecordBusyMessageValue, []);
  const { perfEnabled, perfMark, perfMeasure } = useAppPerfTools(envTag);

  const {
    statusTransitions,
    closedStatusLabel,
    matchesClosedStatus,
    resolveStatusAutoView
  } = useAppStatusTransitions({ definition, language });
  const { readyForProductionUnlockResolution, readyForProductionUnlockSet } =
    useReadyForProductionUnlockConfig(definition);
  const autoSaveEnabled = Boolean(definition.autoSave?.enabled);
  const {
    autoSaveNoticeOpen,
    autoSaveNoticeTitle,
    autoSaveNoticeMessage,
    autoSaveNoticeConfirmLabel,
    autoSaveNoticeCancelLabel,
    dismissAutoSaveNotice,
    setIngredientNameBlurredForAutoSave
  } = useAutoSaveNotice({
    autoSaveEnabled,
    formKey,
    language,
    view,
    ingredientsFormActive,
    ingredientCreateAutoSaveReady,
    createFlowRef,
    logEvent
  });
  const {
    autoSaveEnableFieldIds,
    dedupPrecheckRules,
    dedupTriggerFieldIdMap,
    dedupIdentityFieldIdMap,
    dedupCheckDialogCopy,
    dedupCheckDialogEnabled
  } = useAppAutoSaveDedupConfig({ definition, language });
  const {
    dedupProgress,
    hideDedupProgressDialog,
    showDedupProgressDialog
  } = useDedupProgressDialog({
    view,
    dedupCheckDialogEnabled,
    dedupChecking
  });

  // Feature overlays (kept out of App.tsx as much as possible; App only wires them).
  const customConfirm = useConfirmDialog({ closeOnKey: view, eventPrefix: 'ui.customConfirm', onDiagnostic: logEvent });
  const fieldChangeDialog = useFieldChangeDialog({ closeOnKey: view, eventPrefix: 'ui.fieldChangeDialog', onDiagnostic: logEvent });
  const updateRecordBusy = useBlockingOverlay({ eventPrefix: 'button.updateRecord.busy', onDiagnostic: logEvent });
  const navigateHomeBusy = useBlockingOverlay({ eventPrefix: 'navigate.home.busy', onDiagnostic: logEvent });
  const copyRecordBusy = useBlockingOverlay({ eventPrefix: 'record.copy.busy', onDiagnostic: logEvent });
  const submitPreparationBusy = useBlockingOverlay({ eventPrefix: 'submit.prepare.busy', onDiagnostic: logEvent });
  const recordSyncBusy = useBlockingOverlay({ eventPrefix: 'record.sync.busy', onDiagnostic: logEvent });
  const destructiveChangeBusy = useBlockingOverlay({ eventPrefix: 'fieldChange.destructive.busy', onDiagnostic: logEvent });
  const guidedMilestoneBusy = useBlockingOverlay({ eventPrefix: 'guidedStep.milestone.busy', onDiagnostic: logEvent });
  const guidedStepAdvanceBusy = useBlockingOverlay({ eventPrefix: 'guidedStep.advance.busy', onDiagnostic: logEvent });
  const uploadBusy = useBlockingOverlay({ eventPrefix: 'upload.busy', onDiagnostic: logEvent });
  const updateRecordBusyOpen = updateRecordBusy.state.open;
  const recordSyncBusyOpen = recordSyncBusy.state.open;

  useButtonTextWrapObserver({ view, language });

  const {
    systemActionGateDialog,
    openSystemActionGateDialog,
    closeSystemActionGateDialog,
    copyCurrentRecordDialog,
    setCopyCurrentRecordDialog,
    closeCopyCurrentRecordDialog
  } = useAppDialogState({ language, logEvent });

  const fieldChangePendingRef = useRef<Record<string, FieldChangePending>>({});
  const fieldChangeActiveRef = useRef<FieldChangePending | null>(null);
  const ensureLineOptionsRef = useRef<(groupId: string, field: any) => void>(() => {});
  const fieldChangeDateInitialEntryInProgressRef = useRef<Record<string, boolean>>({});
  const fieldChangeDateInitialEntryCompletedRef = useRef<Record<string, boolean>>({});
  const copyCurrentRecordDestructiveChangeBypassFieldIdsRef = useRef<Record<string, true>>({});
  const resetFieldChangeTransientState = useCallback(() => {
    fieldChangePendingRef.current = {};
    fieldChangeActiveRef.current = null;
    fieldChangeDateInitialEntryInProgressRef.current = {};
    fieldChangeDateInitialEntryCompletedRef.current = {};
    copyCurrentRecordDestructiveChangeBypassFieldIdsRef.current = {};
  }, []);
  const waitForActiveDraftSaveTransactions = useCallback(
    async (reason: string, timeoutMs = 18_000): Promise<{ ok: boolean; message?: string }> => {
      return waitForActiveDraftSaveTransactionsAction({
        reason,
        timeoutMs,
        autoSaveInFlightRef,
        draftSaveRequestInFlightRef,
        draftSaveRequestPromiseRef,
        lastDraftSaveFailureRef,
        logEvent
      });
    },
    [logEvent]
  );
  const consumeCopyCurrentRecordDestructiveChangeBypass = useCallback((fieldIdRaw: string | undefined) => {
    const fieldId = (fieldIdRaw || '').toString().trim();
    if (!fieldId) return;
    if (!copyCurrentRecordDestructiveChangeBypassFieldIdsRef.current[fieldId]) return;
    delete copyCurrentRecordDestructiveChangeBypassFieldIdsRef.current[fieldId];
  }, []);
  const pendingDeletedRecordIdsRef = useRef<string[]>([]);
  const readyForProductionUnlockTransitionAttemptedRef = useRef<Set<string>>(new Set());
  const selectionEffectAsyncPendingCountRef = useRef(0);
  const [selectionEffectAsyncPendingCount, setSelectionEffectAsyncPendingCount] = useState(0);
  const [pendingDeletedRecordApplyTick, setPendingDeletedRecordApplyTick] = useState(0);

  const resolveOptionGroupKey = useCallback(
    (args: {
      targetScope: 'top' | 'row' | 'parent' | 'effect';
      contextGroupId?: string;
      effectGroupId?: string;
    }): string | undefined => {
      const contextGroupId = (args.contextGroupId || '').toString().trim();
      if (args.targetScope === 'top') return undefined;
      if (args.targetScope === 'effect' && args.effectGroupId) {
        const effectGroupId = args.effectGroupId.toString().trim();
        if (effectGroupId.includes('::')) return effectGroupId;
        if (!contextGroupId) return effectGroupId || undefined;
        const parsed = parseSubgroupKey(contextGroupId);
        if (parsed) return `${parsed.parentGroupId}::${effectGroupId}`;
        return effectGroupId || undefined;
      }
      if (!contextGroupId) return undefined;
      const parsed = parseSubgroupKey(contextGroupId);
      if (!parsed) return contextGroupId;
      if (args.targetScope === 'parent') return parsed.parentGroupId;
      return `${parsed.parentGroupId}::${parsed.subGroupId}`;
    },
    []
  );

  const buildFieldChangeDialogInputs = useCallback(
    (pending: FieldChangePending): { inputs: FieldChangeDialogInputState[]; values: Record<string, FieldValue> } => {
      return buildFieldChangeDialogInputsAction({
        pending,
        definition,
        values: valuesRef.current,
        lineItems: lineItemsRef.current,
        optionState,
        language: languageRef.current,
        resolveOptionGroupKey
      });
    },
    [definition, optionState, resolveOptionGroupKey]
  );

  const revertFieldChangePending = useCallback(
    (pending: FieldChangePending, reason: string, extra?: Record<string, unknown>) => {
      setValues(pending.prevSnapshot.values);
      setLineItems(pending.prevSnapshot.lineItems);
      valuesRef.current = pending.prevSnapshot.values;
      lineItemsRef.current = pending.prevSnapshot.lineItems;
      dedupHoldRef.current = false;
      autoSaveDirtyRef.current = pending.autoSaveSnapshot.dirty;
      autoSaveQueuedRef.current = pending.autoSaveSnapshot.queued;
      setDraftSave({ phase: autoSaveDirtyRef.current ? 'dirty' : 'idle' });
      fieldChangeActiveRef.current = null;
      delete fieldChangePendingRef.current[pending.fieldPath];
      logEvent('fieldChangeDialog.reverted', {
        reason,
        fieldPath: pending.fieldPath,
        fieldId: pending.fieldId,
        groupId: pending.groupId || null,
        rowId: pending.rowId || null,
        ...extra
      });
    },
    [logEvent, setLineItems, setValues]
  );

  const triggerDedupDeleteOnKeyChange = useCallback(
    async (source: string, extra?: Record<string, unknown>): Promise<boolean> => {
      dedupDeleteOnKeyChangePendingRef.current = true;
      try {
        return await triggerDedupDeleteOnKeyChangeAction({
          source,
          extra,
          definition,
          formKey,
          submittingRef,
          selectedRecordIdRef,
          selectedRecordSnapshotRef,
          lastSubmissionMetaRef,
          pendingDeletedRecordIdsRef,
          dedupDeleteOnKeyChangeInFlightRef,
          valuesRef,
          lineItemsRef,
          dedupKeyFingerprintBaselineRef,
          dedupHoldRef,
          autoSaveDirtyRef,
          autoSaveQueuedRef,
          autoSaveTimerRef,
          autoSaveInFlightRef,
          uploadQueueRef,
          languageRef,
          recordDataVersionRef,
          optimisticClientDataVersionRef,
          recordRowNumberRef,
          recordStaleRef,
          recordSessionRef,
          createFlowRef,
          createFlowUserEditedRef,
          autoSaveUserEditedRef,
          dedupBaselineSignatureRef,
          optionStateRef,
          tooltipStateRef,
          preloadPromisesRef,
          homeListLocalCacheKey,
          setSelectedRecordId,
          setSelectedRecordSnapshot,
          setLastSubmissionMeta,
          setRecordStale,
          setDraftSave,
          setPendingDeletedRecordApplyTick,
          setValues,
          setLineItems,
          setErrors,
          setValidationWarnings,
          setValidationAttempted,
          setValidationNoticeHidden,
          setOptionState,
          setTooltipState,
          waitForActiveDraftSaveTransactions,
          submitCurrentRecordMutation,
          rememberAutoSaveSeenState,
          ensureLineOptions,
          logEvent,
          resolveLogMessage
        });
      } finally {
        dedupDeleteOnKeyChangePendingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [definition, formKey, logEvent, resolveLogMessage, setSelectedRecordId, waitForActiveDraftSaveTransactions]
  );

  const handleFieldChangeDialogConfirm = useCallback(
    async (inputValues: Record<string, FieldValue>) => {
      const pending = fieldChangeActiveRef.current;
      if (!pending) return;
      const lockSeq = destructiveChangeBusy.lock({
        title: tSystemOptional('navigation.waitSavingTitle', languageRef.current, ''),
        message: tSystem('navigation.waitSaving', languageRef.current, 'Do not leave this page while your changes are being saved'),
        kind: 'fieldChangeDialog',
        diagnosticMeta: { fieldPath: pending.fieldPath, fieldId: pending.fieldId }
      });
      try {
        const dialogCfg = pending.dialog;
        const baseTargetScope: 'top' | 'row' = pending.scope === 'top' ? 'top' : 'row';
        const updates: FieldChangeDialogTargetUpdate[] = [
          {
            target: { scope: baseTargetScope, fieldId: pending.fieldId },
            value: pending.nextValue
          }
        ];
        (dialogCfg.inputs || []).forEach(inputCfg => {
          const inputId = (inputCfg?.id || '').toString().trim();
          if (!inputId) return;
          if (!inputCfg?.target) return;
          const value = inputValues[inputId];
          if (value === undefined) return;
          updates.push({ target: inputCfg.target, value });
        });
        const dialogSelectionEffects = (pending.selectionEffects || []).filter(
          (effect): effect is SelectionEffect & { groupId: string } => !!effect?.groupId
        );
        const confirmUpdates = resolveFieldChangeDialogConfirmUpdates({
          dialog: dialogCfg,
          definition,
          context: { scope: pending.scope, groupId: pending.groupId },
          selectionEffects: dialogSelectionEffects
        });
        if (confirmUpdates.length) {
          updates.push(...confirmUpdates);
          logEvent('fieldChangeDialog.confirmUpdates.applied', {
            fieldPath: pending.fieldPath,
            fieldId: pending.fieldId,
            updateCount: confirmUpdates.length,
            targets: confirmUpdates.map(update => ({
              scope: update.target.scope,
              fieldId: update.target.fieldId,
              effectId: update.target.effectId || null
            }))
          });
        }

        const sourceQuestion =
          pending.scope === 'top'
            ? definition.questions.find(question => `${question?.id || ''}`.trim() === `${pending.fieldId || ''}`.trim()) || null
            : null;
        const bypassCopyCurrentRecordDestructiveChange = shouldBypassCopyCurrentRecordDestructiveChange({
          scope: pending.scope,
          fieldId: pending.fieldId,
          isCreateFlow: createFlowRef.current,
          bypassFieldIds: copyCurrentRecordDestructiveChangeBypassFieldIdsRef.current
        });
        const shouldApplyClearOnChange =
          !bypassCopyCurrentRecordDestructiveChange &&
          pending.scope === 'top' &&
          isClearOnChangeEnabled((sourceQuestion as any)?.clearOnChange) &&
          !isEmptyValue((valuesRef.current as any)?.[pending.fieldId]) &&
          !isEmptyValue(pending.nextValue) &&
          (valuesRef.current as any)?.[pending.fieldId] !== pending.nextValue;
        const dedupDeleteEnabled =
          (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;
        const topFieldId = pending.scope === 'top' ? (pending.fieldId || '').toString() : '';
        const isTopDedupKeyChange = Boolean(
          topFieldId &&
            (dedupIdentityFieldIdsRef.current[topFieldId] || dedupIdentityFieldIdsRef.current[topFieldId.toLowerCase()]) &&
            dedupDeleteEnabled
        );
        const releaseLineItemsBeforeDestructiveChange = isTopDedupKeyChange
          ? cloneLineItemStateSnapshot(lineItemsRef.current)
          : null;

        if (isTopDedupKeyChange) {
          dedupDeleteOnKeyChangePendingRef.current = true;
          logEvent('dedupDeleteOnKeyChange.pending.armed', {
            source: 'fieldChangeDialog.confirm',
            fieldId: topFieldId,
            fieldPath: pending.fieldPath || null
          });
        }

        if (shouldApplyClearOnChange || isTopDedupKeyChange) {
          const activeSaveWait = await waitForActiveDraftSaveTransactions(
            `fieldChangeDialog.confirm.${pending.fieldPath || pending.fieldId || 'field'}`
          );
          if (!activeSaveWait.ok) {
            const message = (activeSaveWait.message || 'Could not save the latest changes.').toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('fieldChangeDialog.confirm.waitActiveSave.failed', {
              fieldPath: pending.fieldPath,
              fieldId: pending.fieldId,
              message
            });
            return;
          }
        }

        let nextBaseValues = valuesRef.current;
        let nextBaseLineItems = lineItemsRef.current;
        let remainingUpdates = updates;
        let clearedUploadFieldIds: string[] = [];

        if (shouldApplyClearOnChange) {
          const cleared = applyClearOnChange({
            definition,
            values: valuesRef.current,
            lineItems: lineItemsRef.current,
            fieldId: pending.fieldId,
            nextValue: pending.nextValue,
            orderedFieldIds: (definition.questions || [])
              .map(question => `${question?.id || ''}`.trim())
              .filter(Boolean)
          });
          const reconciledState = reconcileAutoAddModeGroups({
            definition,
            values: cleared.values,
            lineItems: cleared.lineItems,
            optionState: optionStateRef.current,
            language: languageRef.current,
            ensureLineOptions: ensureLineOptionsRef.current
          });
          nextBaseValues = reconciledState.changed ? reconciledState.values : cleared.values;
          nextBaseLineItems = reconciledState.changed ? reconciledState.lineItems : cleared.lineItems;
          remainingUpdates = updates.slice(1);
          clearedUploadFieldIds = cleared.clearedFieldIds.filter(fieldId => {
            const question = definition.questions.find(q => `${q?.id || ''}`.trim() === fieldId);
            return `${question?.type || ''}`.trim().toUpperCase() === 'FILE_UPLOAD';
          });
          logEvent('fieldChangeDialog.clearOnChange.applied', {
            fieldPath: pending.fieldPath,
            fieldId: pending.fieldId,
            clearedFieldCount: cleared.clearedFieldIds.length,
            clearedGroupCount: cleared.clearedGroupKeys.length,
            autoAddGroupRebuilds: reconciledState.changedCount
          });
        } else if (bypassCopyCurrentRecordDestructiveChange) {
          consumeCopyCurrentRecordDestructiveChangeBypass(pending.fieldId);
          logEvent('fieldChangeDialog.copyDraftBypass', {
            fieldPath: pending.fieldPath,
            fieldId: pending.fieldId,
            phase: 'confirm'
          });
        }

        const applied = applyFieldChangeDialogTargets({
          definition,
          values: nextBaseValues,
          lineItems: nextBaseLineItems,
          updates: remainingUpdates,
          context: { scope: pending.scope, groupId: pending.groupId, rowId: pending.rowId }
        });
        const mapped = applyValueMapsToForm(definition, applied.values, applied.lineItems, { mode: 'change' });

        const dedupMode = (dialogCfg.dedupMode || 'auto') as 'auto' | 'always' | 'never';
        const hasDedupKeyUpdate = updates.some(update => {
          if (update.target.scope !== 'top') return false;
          const fid = (update.target.fieldId || '').toString();
          if (!fid) return false;
          return Boolean(dedupTriggerFieldIdsRef.current[fid] || dedupTriggerFieldIdsRef.current[fid.toLowerCase()]);
        });
        const shouldRunFieldDedup =
          !isTopDedupKeyChange && (dedupMode === 'always' || (dedupMode === 'auto' && hasDedupKeyUpdate));

        if (shouldRunFieldDedup) {
          const signature = computeDedupSignatureFromValues(dedupPrecheckRules, mapped.values as any);
          if (signature) {
            const startedAt = Date.now();
            setDedupChecking(true);
            logEvent('dedup.fieldChange.check.start', {
              source: 'fieldChangeDialog',
              fieldId: pending.fieldId,
              signatureLen: signature.length
            });
            try {
              const payload = buildDraftPayload({
                definition,
                formKey,
                language: languageRef.current,
                values: mapped.values,
                lineItems: mapped.lineItems
              }) as any;
              const res = await checkDedupConflictApi(payload);
              if (res?.success) {
                const conflict: any = (res as any)?.conflict || null;
                if (conflict?.existingRecordId) {
                  const info: DedupConflictInfo = {
                    ruleId: conflict.ruleId,
                    message: conflict.message,
                    existingRecordId: conflict.existingRecordId,
                    existingRowNumber: conflict.existingRowNumber
                  };
                  setDedupNotice(info);
                  setDedupConflict(info);
                  setDedupChecking(false);
                  logEvent('dedup.fieldChange.rejected', {
                    fieldPath: pending.fieldPath,
                    fieldId: pending.fieldId,
                    ruleId: info.ruleId || null,
                    existingRecordId: info.existingRecordId || null
                  });
                  revertFieldChangePending(pending, 'dedupConflict', { ruleId: info.ruleId || null });
                  return;
                }
              }
              logEvent('dedup.fieldChange.check.ok', { source: 'fieldChangeDialog', fieldId: pending.fieldId });
            } catch (err: any) {
              const msg = (err?.message || err?.toString?.() || 'Failed').toString();
              logEvent('dedup.fieldChange.check.exception', {
                source: 'fieldChangeDialog',
                fieldId: pending.fieldId,
                message: msg
              });
            } finally {
              setDedupChecking(false);
              logEvent('dedup.fieldChange.check.end', {
                source: 'fieldChangeDialog',
                durationMs: Date.now() - startedAt
              });
            }
          }
        } else if (isTopDedupKeyChange && hasDedupKeyUpdate) {
          logEvent('dedup.fieldChange.check.skipped', {
            source: 'fieldChangeDialog',
            fieldId: pending.fieldId,
            reason: 'dedupDeleteOnKeyChange'
          });
        }

        const applyUploadInvalidation = (
          fieldPaths: string[],
          meta?: { reason?: string; sourceFieldPath?: string; sourceFieldId?: string }
        ) => {
          const uniquePaths = Array.from(
            new Set(
              (fieldPaths || [])
                .map(fieldPath => (fieldPath || '').toString().trim())
                .filter(Boolean)
            )
          );
          if (!uniquePaths.length) return;
          const invalidated = uniquePaths.map(fieldPath => {
            const nextVersion = bumpUploadFieldInvalidationVersion(uploadFieldInvalidationVersionsRef.current, fieldPath);
            uploadedFieldValueOverridesRef.current.delete(fieldPath);
            return { fieldPath, version: nextVersion };
          });
          logEvent('upload.field.invalidate', {
            reason: meta?.reason || null,
            sourceFieldPath: meta?.sourceFieldPath || null,
            sourceFieldId: meta?.sourceFieldId || null,
            targetCount: invalidated.length,
            targets: invalidated
          });
        };
        const invalidatedUploadFieldPaths = [
          ...resolveInvalidatedUploadFieldPathsFromDialogUpdates({
            definition,
            updates: confirmUpdates,
            context: {
              scope: pending.scope,
              groupId: pending.groupId,
              rowId: pending.rowId
            },
            selectionEffects: dialogSelectionEffects
          }),
          ...clearedUploadFieldIds
        ];
        applyUploadInvalidation(invalidatedUploadFieldPaths, {
          reason: shouldApplyClearOnChange ? 'fieldChangeDialog.clearOnChange' : 'fieldChangeDialog.confirmUpdates',
          sourceFieldPath: pending.fieldPath,
          sourceFieldId: pending.fieldId
        });

        setValues(mapped.values);
        setLineItems(mapped.lineItems);
        valuesRef.current = mapped.values;
        lineItemsRef.current = mapped.lineItems;
        const updatedTopFieldIds = Array.from(
          new Set(
            updates
              .filter(update => update.target.scope === 'top')
              .map(update => (update.target.fieldId || '').toString().trim())
              .filter(Boolean)
          )
        );

        if (shouldApplyClearOnChange) {
          setErrors({});
        } else {
          setErrors(prev => {
            const next = { ...(prev || {}) };
            delete next[pending.fieldPath];
            delete next[pending.fieldId];
            updatedTopFieldIds.forEach(fieldId => {
              delete next[fieldId];
            });
            return next;
          });
        }
        dedupHoldRef.current = isTopDedupKeyChange;
        if (isTopDedupKeyChange) {
          autoSaveDirtyRef.current = false;
          autoSaveQueuedRef.current = false;
          setDraftSave({ phase: 'paused' });
        } else {
          autoSaveDirtyRef.current = true;
          if (pending.fieldPath) uploadedFieldValueOverridesRef.current.delete(pending.fieldPath);
          updatedTopFieldIds.forEach(fieldId => {
            uploadedFieldValueOverridesRef.current.delete(fieldId);
          });
          setDraftSave({ phase: 'dirty' });
        }

        const selectionEffects = pending.selectionEffects || [];
        if (selectionEffects.length && pending.effectQuestion) {
          const lineItemContext =
            pending.scope === 'line' && pending.groupId && pending.rowId
              ? {
                  groupId: pending.groupId,
                  rowId: pending.rowId,
                  rowValues:
                    (mapped.lineItems[pending.groupId] || []).find(r => r.id === pending.rowId)?.values ||
                    (lineItemsRef.current[pending.groupId] || []).find(r => r.id === pending.rowId)?.values ||
                    {}
                }
              : undefined;
          runSelectionEffectsHelper({
            definition,
            question: pending.effectQuestion,
            value: pending.nextValue,
            language,
            values: mapped.values,
            lineItems: mapped.lineItems,
            setValues,
            setLineItems,
            logEvent,
            opts: lineItemContext ? { lineItem: lineItemContext } : undefined,
            effectOverrides: applied.effectOverrides,
            onRowAppended: ({ anchor, targetKey, rowId, source }) => {
              setExternalScrollAnchor(anchor);
              logEvent('ui.selectionEffect.rowAppended', { anchor, targetKey, rowId, source: source || null });
            }
          });
        }

        if (isTopDedupKeyChange) {
          await triggerDedupDeleteOnKeyChange('fieldChangeDialog.confirm', {
            fieldId: topFieldId,
            fieldPath: pending.fieldPath,
            ...(releaseLineItemsBeforeDestructiveChange
              ? { releaseLineItems: releaseLineItemsBeforeDestructiveChange }
              : {})
          });
        }

        fieldChangeActiveRef.current = null;
        delete fieldChangePendingRef.current[pending.fieldPath];
        logEvent('fieldChangeDialog.applied', {
          fieldPath: pending.fieldPath,
          fieldId: pending.fieldId,
          groupId: pending.groupId || null,
          rowId: pending.rowId || null,
          confirmUpdateCount: confirmUpdates.length
        });
      } finally {
        if (!dedupDeleteOnKeyChangeInFlightRef.current) {
          dedupDeleteOnKeyChangePendingRef.current = false;
        }
        destructiveChangeBusy.unlock(lockSeq, { source: 'fieldChangeDialog' });
      }
    },
    [
      dedupPrecheckRules,
      definition,
      destructiveChangeBusy,
      formKey,
      language,
      logEvent,
      consumeCopyCurrentRecordDestructiveChangeBypass,
      revertFieldChangePending,
      setExternalScrollAnchor,
      setLineItems,
      setValues,
      triggerDedupDeleteOnKeyChange,
      setErrors,
      waitForActiveDraftSaveTransactions
    ]
  );

  const handleFieldChangeDialogCancel = useCallback(() => {
    const pending = fieldChangeActiveRef.current;
    if (!pending) return;
    const cancelAction = resolveFieldChangeDialogCancelAction(pending.dialog);
    revertFieldChangePending(
      pending,
      cancelAction === 'discardDraftAndGoHome' ? 'cancel.discardDraftAndGoHome' : 'cancel',
      { cancelAction }
    );
    if (cancelAction !== 'discardDraftAndGoHome') return;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    dedupHoldRef.current = false;
    autoSaveDirtyRef.current = false;
    autoSaveQueuedRef.current = false;
    setDraftSave({ phase: 'idle' });
    setView('list');
    setStatus(null);
    setStatusLevel(null);
    logEvent('fieldChangeDialog.cancelAction.discardDraftAndGoHome', {
      fieldPath: pending.fieldPath,
      fieldId: pending.fieldId,
      groupId: pending.groupId || null,
      rowId: pending.rowId || null
    });
  }, [logEvent, revertFieldChangePending]);

  const openFieldChangeDialog = useCallback(
    (pending: FieldChangePending) => {
      if (!pending || fieldChangeDialog.state.open) return;
      fieldChangeActiveRef.current = pending;
      const dialogCfg = pending.dialog;
      const title = resolveOptionalLocalizedString(
        dialogCfg.title,
        languageRef.current,
        tSystem('fieldChangeDialog.title', languageRef.current, 'Confirm change')
      );
      const message = resolveLocalizedString(
        dialogCfg.message,
        languageRef.current,
        tSystem('fieldChangeDialog.message', languageRef.current, 'Review this change before continuing.')
      );
      const confirmLabel = resolveLocalizedString(
        dialogCfg.confirmLabel,
        languageRef.current,
        tSystem('common.confirm', languageRef.current, 'Confirm')
      );
      const cancelLabel = resolveLocalizedString(
        dialogCfg.cancelLabel,
        languageRef.current,
        tSystem('common.cancel', languageRef.current, 'Cancel')
      );

      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      dedupHoldRef.current = true;
      setDraftSave({ phase: 'paused' });

      const resolvedInputs = buildFieldChangeDialogInputs(pending);
      fieldChangeDialog.open({
        title,
        message,
        confirmLabel,
        cancelLabel,
        inputs: resolvedInputs.inputs,
        values: resolvedInputs.values,
        kind: 'fieldChange',
        refId: pending.fieldPath,
        onConfirm: handleFieldChangeDialogConfirm,
        onCancel: handleFieldChangeDialogCancel
      });
    },
    [buildFieldChangeDialogInputs, fieldChangeDialog, handleFieldChangeDialogCancel, handleFieldChangeDialogConfirm]
  );

  const handleUserEdit = useCallback(
    (args: {
      scope: 'top' | 'line';
      fieldPath: string;
      fieldId?: string;
      groupId?: string;
      rowId?: string;
      event?: 'change' | 'blur';
      tag?: string;
      inputType?: string;
      nextValue?: FieldValue;
    }): { deferMutation?: boolean; skipSelectionEffects?: boolean } | void => {
      try {
        const fieldPath = (args?.fieldPath || '').toString();
        const fieldId = (args?.fieldId || '').toString();
        const fieldKey = fieldPath || fieldId;
        const autoSaveDirtyBefore = autoSaveDirtyRef.current;
        const autoSaveQueuedBefore = autoSaveQueuedRef.current;
        const hasNextValue = Object.prototype.hasOwnProperty.call(args || {}, 'nextValue');
        const shouldArmAutoSave = shouldArmAutoSaveForUserEditEvent({
          event: args?.event || null,
          hasNextValue
        });
        if (shouldArmAutoSave) {
          pendingAutomatedAutoSaveSourceRef.current = '';
          selectionEffectInitAutoSaveSuppressStartedAtRef.current = 0;
          selectionEffectInitAutoSaveSuppressUntilRef.current = 0;
          selectionEffectInitAutoSaveHadDirtyAtStartRef.current = false;
          postPersistAutoSaveSuppressUntilRef.current = 0;
          postPersistAutoSavePersistedLocalMutationAtRef.current = 0;
          if (prefetchedSummaryHtml) {
            setPrefetchedSummaryHtml(null);
          }
          // Clear stale dedup notice on any new user edit.
          if (dedupNotice) setDedupNotice(null);

          // Arm autosave on first user edit during create-flow (segmented controls won't emit native input events).
          if (createFlowRef.current && !createFlowUserEditedRef.current) {
            createFlowUserEditedRef.current = true;
            logEvent('autosave.armed.userEdit', { fieldPath: fieldPath || fieldId || null });
          }
          if (!autoSaveUserEditedRef.current) {
            autoSaveUserEditedRef.current = true;
          }
          const editAt = Date.now();
          lastUserInteractionRef.current = editAt;
          lastLocalRecordMutationAtRef.current = editAt;
          // Mark dirty immediately on user edits so navigation handlers can flush autosave
          // even if the debounced autosave effect hasn't run yet.
          autoSaveDirtyRef.current = true;
        }

        // For top-level dedup trigger fields: hold autosave while dedup precheck settles.
        const isDedupTriggerKey =
          (fieldId && dedupTriggerFieldIdsRef.current[fieldId]) || (fieldPath && dedupTriggerFieldIdsRef.current[fieldPath]);
        const isDedupIdentityKey =
          (fieldId && dedupIdentityFieldIdsRef.current[fieldId]) || (fieldPath && dedupIdentityFieldIdsRef.current[fieldPath]);

        // Field-level guarded change dialog (ck-47)
        if (args?.event === 'change' && fieldKey && args.nextValue !== undefined) {
          const source = resolveFieldChangeDialogSource({
            definition,
            scope: args.scope,
            fieldId,
            groupId: args.groupId
          });
          const changeType = (source?.question?.type || source?.field?.type || '').toString().toUpperCase();
          const bypassCopyCurrentRecordDestructiveChange = shouldBypassCopyCurrentRecordDestructiveChange({
            scope: args.scope,
            fieldId,
            isCreateFlow: createFlowRef.current,
            bypassFieldIds: copyCurrentRecordDestructiveChangeBypassFieldIdsRef.current
          });
          const prevValue =
            args.scope === 'line' && args.groupId && args.rowId
              ? (lineItemsRef.current[args.groupId] || []).find(row => row.id === args.rowId)?.values?.[fieldId]
              : valuesRef.current[fieldId];
          const existingPending = fieldChangePendingRef.current[fieldKey];
          const effectivePrevValue =
            !isEmptyValue(prevValue as FieldValue)
              ? (prevValue as FieldValue)
              : !isEmptyValue(existingPending?.prevValue as FieldValue)
                ? (existingPending?.prevValue as FieldValue)
                : (prevValue as FieldValue);
          const suppressInitialDateDialog = shouldSuppressInitialDateChangeDialog({
            scope: args.scope,
            fieldType: changeType,
            fieldPath: fieldKey,
            fieldId,
            prevValue: effectivePrevValue,
            nextValue: args.nextValue as FieldValue,
            baselineValues: lastAutoSaveSeenRef.current?.values || null,
            initialEntryInProgressByFieldPath: fieldChangeDateInitialEntryInProgressRef.current,
            initialEntryCompletedByFieldPath: fieldChangeDateInitialEntryCompletedRef.current
          });
          const hasExistingValueChange =
            !isEmptyValue(effectivePrevValue) &&
            effectivePrevValue !== args.nextValue;
          const allowEmptyNextValue = hasExistingValueChange && isEmptyValue(args.nextValue as FieldValue);
          const dialogCfg = source?.dialog;
          const topQuestionClearOnChangeEnabled =
            args.scope === 'top' && isClearOnChangeEnabled((source?.question as any)?.clearOnChange);
          if (
            bypassCopyCurrentRecordDestructiveChange &&
            !isEmptyValue(args.nextValue as FieldValue) &&
            (Boolean(dialogCfg?.when) || topQuestionClearOnChangeEnabled)
          ) {
            if (fieldChangePendingRef.current[fieldKey]) {
              delete fieldChangePendingRef.current[fieldKey];
            }
            consumeCopyCurrentRecordDestructiveChangeBypass(fieldId);
            logEvent('fieldChangeDialog.copyDraftBypass', {
              fieldPath: fieldKey,
              fieldId,
              phase: 'change'
            });
          } else if (dialogCfg?.when && hasExistingValueChange && !suppressInitialDateDialog) {
            const dialogEvaluationState = applyUploadedFieldOverridesToState({
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              overrides: uploadedFieldValueOverridesRef.current
            });
            const existing = fieldChangePendingRef.current[fieldKey];
            const prevSnapshot = existing?.prevSnapshot || {
              values: dialogEvaluationState.values,
              lineItems: dialogEvaluationState.lineItems
            };
            const validity = evaluateFieldChangeDialogWhenWithFallback({
              when: dialogCfg.when,
              scope: args.scope,
              fieldId,
              groupId: args.groupId,
              rowId: args.rowId,
              nextValue: args.nextValue,
              values: dialogEvaluationState.values,
              lineItems: dialogEvaluationState.lineItems,
              fallbackValues: prevSnapshot.values,
              fallbackLineItems: prevSnapshot.lineItems,
              allowEmptyNextValue
            });
            const shouldTrigger = validity.matches;
            const shouldHoldSelectionEffects = shouldHoldFieldChangeSelectionEffects({
              dialog: dialogCfg,
              scope: args.scope,
              fieldType: changeType,
              shouldTrigger,
              hasExistingValueChange,
              nextValue: args.nextValue as FieldValue,
              suppressInitialDateDialog
            });
            if (shouldTrigger) {
              const pending: FieldChangePending = {
                fieldPath: fieldKey,
                scope: args.scope,
                fieldId,
                groupId: args.groupId,
                rowId: args.rowId,
                dialog: dialogCfg,
                effectQuestion: source?.question || (source?.field as any) || undefined,
                selectionEffects: (source?.question || source?.field)?.selectionEffects || [],
                prevSnapshot,
                prevValue: effectivePrevValue,
                nextValue: args.nextValue,
                allowEmptyNextValue,
                autoSaveSnapshot: {
                  dirty: autoSaveDirtyBefore,
                  queued: autoSaveQueuedBefore,
                  lastSeen: lastAutoSaveSeenRef.current
                }
              };
              fieldChangePendingRef.current[fieldKey] = pending;
              logEvent('fieldChangeDialog.pending', {
                fieldPath: fieldKey,
                fieldId,
                groupId: args.groupId || null,
                rowId: args.rowId || null
              });
              if (validity.matchedOn === 'fallback') {
                logEvent('fieldChangeDialog.pending.revalidatedFromSnapshot', {
                  fieldPath: fieldKey,
                  fieldId,
                  groupId: args.groupId || null,
                  rowId: args.rowId || null,
                  phase: 'change'
                });
              }
              if (
                shouldDeferFieldChangeMutation({
                  dialog: dialogCfg,
                  fieldType: changeType,
                  shouldTrigger,
                  prevValue: effectivePrevValue,
                  nextValue: args.nextValue as FieldValue,
                  suppressInitialDateDialog
                })
              ) {
                logEvent('fieldChangeDialog.mutation.deferred', {
                  fieldPath: fieldKey,
                  fieldId,
                  groupId: args.groupId || null,
                  rowId: args.rowId || null,
                  fieldType: changeType
                });
                openFieldChangeDialog(pending);
                return { deferMutation: true };
              }
              if (shouldHoldSelectionEffects) {
                return { skipSelectionEffects: true };
              }
            } else if (existing && changeType === 'NUMBER' && allowEmptyNextValue) {
              fieldChangePendingRef.current[fieldKey] = {
                ...existing,
                nextValue: args.nextValue,
                allowEmptyNextValue
              };
              logEvent('fieldChangeDialog.pending.baselineRetained', {
                fieldPath: fieldKey,
                fieldId,
                groupId: args.groupId || null,
                rowId: args.rowId || null
              });
              if (shouldHoldSelectionEffects) {
                return { skipSelectionEffects: true };
              }
            } else if (changeType === 'NUMBER' && allowEmptyNextValue) {
              fieldChangePendingRef.current[fieldKey] = {
                fieldPath: fieldKey,
                scope: args.scope,
                fieldId,
                groupId: args.groupId,
                rowId: args.rowId,
                dialog: dialogCfg,
                effectQuestion: source?.question || (source?.field as any) || undefined,
                selectionEffects: (source?.question || source?.field)?.selectionEffects || [],
                prevSnapshot,
                prevValue: effectivePrevValue,
                nextValue: args.nextValue,
                allowEmptyNextValue,
                autoSaveSnapshot: {
                  dirty: autoSaveDirtyBefore,
                  queued: autoSaveQueuedBefore,
                  lastSeen: lastAutoSaveSeenRef.current
                }
              };
              logEvent('fieldChangeDialog.pending.baseline', {
                fieldPath: fieldKey,
                fieldId,
                groupId: args.groupId || null,
                rowId: args.rowId || null
              });
              if (shouldHoldSelectionEffects) {
                return { skipSelectionEffects: true };
              }
            } else if (fieldChangePendingRef.current[fieldKey]) {
              delete fieldChangePendingRef.current[fieldKey];
              logEvent('fieldChangeDialog.pending.cleared', { fieldPath: fieldKey, fieldId });
            }
          } else if (fieldChangePendingRef.current[fieldKey]) {
            delete fieldChangePendingRef.current[fieldKey];
          }
        }

        const isTopIngredientNameField =
          ingredientsFormActive && args?.scope === 'top' && isIngredientNameFieldId(fieldId || fieldKey);

        if (isTopIngredientNameField && args?.event === 'change') {
          setIngredientNameBlurredForAutoSave(false);
        }

        if (args?.event === 'blur' && fieldKey) {
          if (isTopIngredientNameField) {
            setIngredientNameBlurredForAutoSave(true);
            const nextMessage = getIngredientNameValidationMessage((valuesRef.current as any)?.INGREDIENT_NAME);
            setErrors(prev => {
              const current = (prev || {})[fieldKey];
              if (!nextMessage && !current) return prev;
              if (nextMessage === current) return prev;
              const next = { ...(prev || {}) };
              if (nextMessage) next[fieldKey] = nextMessage;
              else delete next[fieldKey];
              return next;
            });
            if (nextMessage) {
              logEvent('validation.ingredients.name.invalid', { message: nextMessage });
            }
          }

          const finalizedInitialDateEntry = finalizeInitialDateChangeDialogEntry({
            fieldPath: fieldKey,
            initialEntryInProgressByFieldPath: fieldChangeDateInitialEntryInProgressRef.current,
            initialEntryCompletedByFieldPath: fieldChangeDateInitialEntryCompletedRef.current
          });
          if (finalizedInitialDateEntry && fieldChangePendingRef.current[fieldKey]) {
            delete fieldChangePendingRef.current[fieldKey];
            logEvent('fieldChangeDialog.pending.cleared', {
              fieldPath: fieldKey,
              fieldId,
              reason: 'initialDateEntry.completed'
            });
            return;
          }
          const pending = fieldChangePendingRef.current[fieldKey];
          if (pending) {
            const dialogEvaluationState = applyUploadedFieldOverridesToState({
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              overrides: uploadedFieldValueOverridesRef.current
            });
            const validity = evaluateFieldChangeDialogWhenWithFallback({
              when: pending.dialog?.when,
              scope: pending.scope,
              fieldId: pending.fieldId,
              groupId: pending.groupId,
              rowId: pending.rowId,
              nextValue: pending.nextValue,
              values: dialogEvaluationState.values,
              lineItems: dialogEvaluationState.lineItems,
              fallbackValues: pending.prevSnapshot.values,
              fallbackLineItems: pending.prevSnapshot.lineItems,
              allowEmptyNextValue: pending.allowEmptyNextValue
            });
            if (!validity.matches) {
              delete fieldChangePendingRef.current[fieldKey];
              logEvent('fieldChangeDialog.pending.cleared', { fieldPath: fieldKey, fieldId });
              return;
            }
            if (validity.matchedOn === 'fallback') {
              logEvent('fieldChangeDialog.pending.revalidatedFromSnapshot', {
                fieldPath: fieldKey,
                fieldId: pending.fieldId,
                groupId: pending.groupId || null,
                rowId: pending.rowId || null
              });
            }
            openFieldChangeDialog(pending);
            return;
          }
        }

        if (fieldKey && fieldChangePendingRef.current[fieldKey]) {
          // Skip standard dedup blur logic while a guarded change is pending.
          return;
        }

        if (args?.scope === 'top' && (isDedupTriggerKey || isDedupIdentityKey)) {
          if (shouldArmAutoSave && isDedupTriggerKey) {
            if (dedupConflictRef.current) {
              dedupConflictRef.current = null;
              setDedupConflict(null);
            }
            if (!dedupHoldRef.current) {
              // Hold autosave while dedup-key edits settle; precheck runs once keys are complete.
              dedupHoldRef.current = true;
              autoSaveDirtyRef.current = true;
              if (autoSaveTimerRef.current) {
                globalThis.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
              }
              setDraftSave({ phase: 'idle' });
              logEvent('autosave.hold.dedupKeyChange', {
                fieldId: fieldId || fieldPath || null,
                fieldPath: fieldPath || fieldId || null,
                event: args?.event || null
              });
            }
          }
          if (args?.event === 'blur' && isDedupIdentityKey) {
            void triggerDedupDeleteOnKeyChange('dedupKey.blur', {
              fieldId: fieldId || null,
              fieldPath: fieldPath || null
            });
          }
        }

        if (args?.scope === 'top' && args?.event === 'blur') {
          const shouldForceAutoSave = shouldForceAutoSaveOnConfiguredBlur({
            autoSaveEnabled,
            isCreateFlow: createFlowRef.current,
            scope: args.scope,
            event: args.event,
            fieldPath,
            fieldId,
            enableWhenFieldIds: autoSaveEnableFieldIds,
            values: valuesRef.current as any,
            dedupSignature: (dedupSignatureRef.current || '').toString(),
            lastDedupCheckedSignature: (lastDedupCheckedSignatureRef.current || '').toString(),
            dedupChecking: dedupCheckingRef.current,
            dedupConflict: isBlockingDedupConflict(dedupConflictRef.current),
            dedupHold: dedupHoldRef.current
          });

          if (shouldForceAutoSave && (autoSaveDirtyRef.current || autoSaveQueuedRef.current)) {
            // Release stale dedup hold before forcing immediate save.
            dedupHoldRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            autoSaveDirtyRef.current = true;
            setDraftSave(prev => (prev.phase === 'saving' || prev.phase === 'dirty' ? prev : { phase: 'dirty' }));
            logEvent('autosave.trigger.configuredBlur', {
              fieldId: fieldId || null,
              fieldPath: fieldPath || null
            });
            void performAutoSaveRef.current('configuredFields.blurReady');
          }
        }

        // Warnings UX: recompute and show inline warnings for the field that just blurred.
        if (args?.event === 'blur' && fieldPath) {
          warningTouchedRef.current.add(fieldPath);
          try {
            const warnings = collectValidationWarnings({
              definition,
              language: languageRef.current,
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              phase: 'submit',
              uiView: 'edit'
            });
            const touched = warningTouchedRef.current;
            const byField: Record<string, string[]> = {};
            Object.keys(warnings.byField || {}).forEach(k => {
              if (touched.has(k)) byField[k] = (warnings.byField as any)[k];
            });
            setValidationWarnings({ top: warnings.top || [], byField });
            logEvent('validation.warnings.blur', {
              fieldPath,
              tag: args?.tag || null,
              inputType: args?.inputType || null,
              touchedCount: touched.size,
              visibleFieldCount: Object.keys(byField).length,
              totalTopCount: (warnings.top || []).length
            });
          } catch (err: any) {
            // Never block editing because of warning computation bugs.
            logEvent('validation.warnings.blur.failed', { message: err?.message || err || 'unknown' });
          }
        }
      } catch {
        // ignore
      }
    },
    [
      dedupNotice,
      definition,
      autoSaveEnabled,
      autoSaveEnableFieldIds,
      ingredientsFormActive,
      logEvent,
      consumeCopyCurrentRecordDestructiveChangeBypass,
      openFieldChangeDialog,
      prefetchedSummaryHtml,
      setErrors,
      setIngredientNameBlurredForAutoSave,
      triggerDedupDeleteOnKeyChange
    ]
  );

  const handleAutomatedMutation = useCallback(
    (args: {
      scope: 'line';
      fieldPath: string;
      fieldId?: string;
      groupId?: string;
      rowId?: string;
      source: 'selectionEffectInit';
      nextValue?: FieldValue;
    }) => {
      pendingAutomatedAutoSaveSourceRef.current = (args.source || '').toString();
      if (args.source === 'selectionEffectInit') {
        const now = Date.now();
        if (!selectionEffectInitAutoSaveSuppressUntilRef.current || selectionEffectInitAutoSaveSuppressUntilRef.current <= now) {
          selectionEffectInitAutoSaveSuppressStartedAtRef.current = now;
          selectionEffectInitAutoSaveHadDirtyAtStartRef.current =
            autoSaveDirtyRef.current ||
            autoSaveQueuedRef.current ||
            autoSaveInFlightRef.current ||
            draftSaveRequestInFlightRef.current;
        }
        selectionEffectInitAutoSaveSuppressUntilRef.current = Math.max(
          selectionEffectInitAutoSaveSuppressUntilRef.current || 0,
          now + SELECTION_EFFECT_INIT_AUTOSAVE_SUPPRESS_MS
        );
      }
      logEvent('autosave.automatedMutation', {
        source: args.source,
        fieldPath: args.fieldPath || null,
        fieldId: args.fieldId || null,
        groupId: args.groupId || null,
        rowId: args.rowId || null
      });
    },
    [logEvent]
  );

  useEffect(() => {
    dedupCheckingRef.current = dedupChecking;
  }, [dedupChecking]);

  useEffect(() => {
    dedupConflictRef.current = dedupConflict;
  }, [dedupConflict]);

  useEffect(() => {
    recordStaleRef.current = recordStale;
  }, [recordStale]);

  const { hasTemplateRenderTargets } = useAppTemplatePrefetch({
    definition,
    formKey,
    language,
    view,
    homeFirstDataReadyAtMs,
    logEvent
  });

  useEffect(() => {
    // Enforce language config changes from the definition.
    if (!allowLanguageSelection) {
      if (language !== defaultLanguage) {
        setLanguage(defaultLanguage);
        logEvent('i18n.language.forcedDefault', { defaultLanguage, reason: 'languageSelectorDisabled' });
      }
      return;
    }
    const normalized = normalizeLanguage(language as any);
    if (!availableLanguages.includes(normalized as any)) {
      setLanguage(defaultLanguage);
      logEvent('i18n.language.reset', { prev: language, defaultLanguage, availableLanguages });
    }
  }, [allowLanguageSelection, availableLanguages, defaultLanguage, language, logEvent]);

  const formSubmitActionRef = useRef<(() => void) | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});
  const formBackActionRef = useRef<(() => void) | null>(null);
  const orderedEntryEnabled = definition.submitValidation?.enforceFieldOrder === true;
  const [guidedUiState, setGuidedUiState] = useState<{
    activeStepId: string | null;
    activeStepIndex: number;
    stepCount: number;
    isFirst: boolean;
    isFinal: boolean;
    forwardGateSatisfied: boolean;
    backAllowed: boolean;
    backVisible: boolean;
    backLabel: string;
    stepSubmitLabel?: string | LocalizedString;
  } | null>(null);
  const [formIsValid, setFormIsValid] = useState<boolean>(() => (orderedEntryEnabled ? false : true));
  const [requestedGuidedStepId, setRequestedGuidedStepId] = useState<string | null>(null);
  const guidedExternalSyncTokenRef = useRef<number>(0);
  const [guidedExternalSyncSignal, setGuidedExternalSyncSignal] = useState<GuidedExternalSyncSignal | null>(null);
  const [draftSave, setDraftSave] = useState<{ phase: DraftSavePhase; message?: string; updatedAt?: string }>(() => ({
    phase: 'idle'
  }));

  useEffect(() => {
    if (!orderedEntryEnabled) {
      setFormIsValid(true);
    }
  }, [orderedEntryEnabled]);

  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveDirtyRef = useRef<boolean>(false);
  const autoSaveInFlightRef = useRef<boolean>(false);
  const autoSaveQueuedRef = useRef<boolean>(false);
  const autoSaveInFlightBlockerLogRef = useRef<{ blocker: string; token: unknown } | null>(null);
  const draftSaveRequestInFlightRef = useRef<boolean>(false);
  const draftSaveRequestPromiseRef = useRef<Promise<any> | null>(null);
  const submissionRequestPromiseRef = useRef<Promise<any> | null>(null);
  const optimisticClientDataVersionRef = useRef<number | null>(
    record && Number.isFinite(Number((record as any).dataVersion)) ? Number((record as any).dataVersion) : null
  );
  const recordSyncPromiseRef = useRef<Promise<boolean> | null>(null);
  const synchronizeStaleRecordRef = useRef<SynchronizeStaleRecordFn>(async () => false);
  const draftSaveRequestFingerprintRef = useRef<{ recordId: string; fingerprint: string } | null>(null);
  const lastCompletedDraftSaveFingerprintRef = useRef<{ recordId: string; fingerprint: string } | null>(null);
  const lastDraftSaveFailureRef = useRef<{ message: string; recordId?: string | null } | null>(null);
  const performAutoSaveRef = useRef<(reason: string) => Promise<void>>(async () => undefined);
  const autoSaveUserEditedRef = useRef<boolean>(false);
  const retryableAutoSaveFailureCountRef = useRef<number>(0);
  const [autoSaveHold, setAutoSaveHold] = useState<{ hold: boolean; reason?: string }>(() => ({ hold: false }));
  const autoSaveHoldRef = useRef<{ hold: boolean; reason?: string }>({ hold: false });
  const prevAutoSaveHoldRef = useRef<boolean>(false);
  const prevAutoSaveHoldReasonRef = useRef<string>('');
  const lastAutoSaveBlockedHoldLogRef = useRef<string>('');
  const lastUserInteractionRef = useRef<number>(0);
  const lastLocalRecordMutationAtRef = useRef<number>(0);
  const lastExternalRecordSyncAtRef = useRef<number>(0);
  const lastRecordServerActivityAtRef = useRef<number>(record && (record as any).id ? Date.now() : 0);
  const recordFreshnessTimerRef = useRef<number | null>(null);
  const recordFreshnessCheckPromiseRef = useRef<Promise<void> | null>(null);
  const performRecordFreshnessCheckRef = useRef<(reason: string) => Promise<void>>(async () => undefined);
  const pendingDeferredRecordFreshnessSyncRef = useRef<Parameters<SynchronizeStaleRecordFn>[0] | null>(null);
  const resumeDeferredRecordFreshnessSyncRef = useRef<(reason: string) => boolean>(() => false);
  const dataSourceFreshnessTimerRef = useRef<number | null>(null);
  const dataSourceFreshnessCheckPromiseRef = useRef<Promise<void> | null>(null);
  const performDataSourceFreshnessCheckRef = useRef<(reason: string) => Promise<void>>(async () => undefined);
  const lastDataSourceFreshnessServerActivityAtByWatchKeyRef = useRef<Record<string, number>>({});
  const dataSourceFreshnessSignatureBaselineByKeyRef = useRef<
    Record<
      string,
      {
        signature: string;
        recordId: string;
        stepId: string;
        sessionId: number;
      }
    >
  >({});
  const lastAutoSaveSeenRef = useRef<{ values: Record<string, FieldValue>; lineItems: LineItemState } | null>(null);
  const lastAutoSaveStateFingerprintRef = useRef<string>('');
  const pendingAutomatedAutoSaveSourceRef = useRef<string>('');
  const selectionEffectInitAutoSaveSuppressStartedAtRef = useRef<number>(0);
  const selectionEffectInitAutoSaveSuppressUntilRef = useRef<number>(0);
  const selectionEffectInitAutoSaveHadDirtyAtStartRef = useRef<boolean>(false);
  const postPersistAutoSaveSuppressUntilRef = useRef<number>(0);
  const postPersistAutoSavePersistedLocalMutationAtRef = useRef<number>(0);
  const latestRenderedAutoSaveStateFingerprintRef = useRef<string>('');
  const utilisationSyncPromiseRef = useRef<Promise<GuidedUtilisationSyncOutcome> | null>(null);
  const utilisationSyncEpochRef = useRef<number>(0);
  const lastAppliedGuidedUtilisationDraftSyncEpochRef = useRef<number>(0);
  const pendingGuidedUtilisationDraftSyncRef = useRef<{
    stepId: string;
    recordId: string;
    plan: BankUtilisationPlanRequest;
    requestEpoch: number;
    sessionId: number;
  } | null>(null);
  const invalidGuidedUtilisationDraftsRef = useRef<
    Record<
      string,
      {
        recordId: string;
        sessionId: number;
        stepId: string;
        groupId: string;
        parentRowId: string;
        sourceKey: string;
        reason: string;
        updatedAt: number;
      }
    >
  >({});
  const pendingFollowupBatchPromisesRef = useRef<
    Map<
      string,
      Promise<{
        success: boolean;
        message?: string;
        recordId: string;
        stepId?: string;
        sessionId: number;
        reason: string;
      }>
    >
  >(new Map());
  const configuredDialogActionRunnerRef = useRef<ConfiguredDialogActionRunner | null>(null);
  const pendingFollowupStatusByRecordRef = useRef<Map<string, string>>(new Map());
  const applyPendingFollowupStatusesToRecordCache = useCallback(
    (records: Record<string, WebFormSubmission>): Record<string, WebFormSubmission> => {
      const pending = pendingFollowupStatusByRecordRef.current;
      if (!pending.size) return records;
      let next = records;
      pending.forEach((status, recordId) => {
        const id = (recordId || '').toString().trim();
        const statusValue = (status || '').toString();
        const existing = id ? next[id] : null;
        if (!existing || !statusValue) return;
        const existingValues = ((existing as any).values || {}) as Record<string, any>;
        if (existing.status === statusValue && existingValues.status === statusValue) return;
        if (next === records) next = { ...records };
        next[id] = {
          ...existing,
          status: statusValue,
          values: {
            ...existingValues,
            status: statusValue
          }
        } as any;
      });
      return next;
    },
    []
  );
  const utilisationSyncMetaRef = useRef<GuidedUtilisationSyncMeta | null>(null);
  const utilisationManagedScopesRef = useRef<{ recordId: string; scopes: BankUtilisationPlanScope[] } | null>(null);
  const guidedStepBackgroundSyncPromiseRef = useRef<Promise<void> | null>(null);
  const guidedStepBackgroundSyncPendingRef = useRef<{
    stepId: string;
    nextStepId?: string;
    trigger: 'next' | 'auto';
    sessionId: number;
    fingerprint: string;
  } | null>(null);
  const guidedStepBackgroundSyncActiveFingerprintRef = useRef<string>('');
  const guidedStepBackgroundSyncPendingFingerprintRef = useRef<string>('');
  const guidedStepImmediateSyncPromiseRef = useRef<Promise<void> | null>(null);
  const guidedStepLastUtilisationSyncFreshnessRef = useRef<GuidedUtilisationSyncFreshness | null>(null);
  const guidedStepImmediateSyncPendingRef = useRef<{
    stepId: string;
    reason: string;
    sessionId: number;
    utilisationEpoch: number;
    fingerprint: string;
    persistSnapshot: boolean;
    snapshotLineItems?: LineItemState;
    releaseScopes?: BankUtilisationPlanScope[];
  } | null>(null);
  const guidedStepImmediateSyncActiveFingerprintRef = useRef<string>('');
  const guidedStepImmediateSyncPendingFingerprintRef = useRef<string>('');
  const recordFreshnessConfigRef = useRef(resolveRecordFreshnessConfig((definition as any)?.recordFreshness));
  const dataSourceFreshnessWatchesRef = useRef(resolveDataSourceFreshnessWatches((definition as any)?.recordFreshness));
  const activeGuidedStepIdRef = useRef<string>((guidedUiState?.activeStepId || '').toString().trim());
  const recordLoadingIdRef = useRef<string | null>(recordLoadingId);
  /**
   * Monotonic session counter used to ignore late async results (autosave, uploads, etc)
   * after the user switches to a different record/create flow.
   */
  const recordSessionRef = useRef<number>(0);
  const [recordSessionKey, setRecordSessionKey] = useState<number>(0);
  const getCurrentRecordSessionId = useCallback(() => recordSessionRef.current, []);
  const {
    pendingSharedDataMutationsRef,
    trackPendingSharedDataMutation,
    waitForPendingSharedDataMutations
  } = usePendingSharedDataMutations({
    definition,
    getCurrentSessionId: getCurrentRecordSessionId,
    logEvent
  });
  const uploadQueueRef = useRef<Map<string, Promise<{ success: boolean; message?: string; items?: string[]; value?: string }>>>(new Map());
  const uploadQueueBlockingRef = useRef<Map<string, boolean>>(new Map());
  const uploadQueueBusyTitleRef = useRef<Map<string, string>>(new Map());
  const uploadQueueBusyMessageRef = useRef<Map<string, string>>(new Map());
  const uploadBusySeqRef = useRef<number | null>(null);
  const uploadedFieldValueOverridesRef = useRef<Map<string, UploadedFieldValueOverride>>(new Map());
  const uploadFieldInvalidationVersionsRef = useRef<Map<string, number>>(new Map());
  const [, setUploadQueueSize] = useState<number>(() => uploadQueueRef.current.size);
  const listOpenViewSubmitTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const summarySubmitIntentRef = useRef<boolean>(false);
  const navigateHomeInFlightRef = useRef<boolean>(false);
  const syncUploadQueueSize = useCallback(() => {
    const { uploadsInFlight, blockingUploadsInFlight, busyTitle, busyMessage } = resolveUploadQueueBusyState({
      uploadQueueSize: uploadQueueRef.current.size,
      blockingByKey: uploadQueueBlockingRef.current,
      busyTitleByKey: uploadQueueBusyTitleRef.current,
      busyMessageByKey: uploadQueueBusyMessageRef.current,
      defaultBusyTitle: tSystemOptional('navigation.waitTitle', language, 'Please wait'),
      defaultBusyMessage: tSystem('navigation.waitPhotos', language, 'Please wait while your files finish uploading.')
    });
    setUploadQueueSize(uploadsInFlight);
    const transition = resolveUploadBusyOverlayTransition({
      uploadsInFlight: blockingUploadsInFlight,
      activeSeq: uploadBusySeqRef.current
    });
    if (transition === 'lock') {
      uploadBusySeqRef.current = uploadBusy.lock({
        title: busyTitle,
        message: busyMessage,
        kind: 'upload',
        diagnosticMeta: { uploadsInFlight, blockingUploadsInFlight }
      });
      return;
    }
    if (transition === 'none' && uploadBusySeqRef.current !== null && blockingUploadsInFlight > 0) {
      uploadBusy.setTitle(uploadBusySeqRef.current, busyTitle);
      uploadBusy.setMessage(uploadBusySeqRef.current, busyMessage);
    }
    if (transition === 'unlock') {
      const seq = uploadBusySeqRef.current;
      uploadBusySeqRef.current = null;
      if (seq !== null) uploadBusy.unlock(seq, { uploadsInFlight, blockingUploadsInFlight });
    }
  }, [language, uploadBusy]);

  const scheduleLatestAutoSave = useCallback(
    (reason: string, delayMs: number): number | null => {
      const nextDelay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
      autoSaveQueuedRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const timerId = globalThis.setTimeout(() => {
        autoSaveTimerRef.current = null;
        autoSaveQueuedRef.current = false;
        logEvent('autosave.timer.fire', {
          reason,
          dirty: autoSaveDirtyRef.current,
          queued: autoSaveQueuedRef.current
        });
        void performAutoSaveRef.current(reason);
      }, nextDelay) as any;
      autoSaveTimerRef.current = timerId as any;
      logEvent('autosave.queue.latest', { reason, delayMs: nextDelay });
      return timerId as any;
    },
    [logEvent]
  );

  const blockAutoSaveForInFlight = useCallback(
    (args: { blocker: string; token: unknown; eventName: string; details: Record<string, unknown> }) => {
      autoSaveQueuedRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const previous = autoSaveInFlightBlockerLogRef.current;
      if (previous?.blocker === args.blocker && previous.token === args.token) return;
      autoSaveInFlightBlockerLogRef.current = {
        blocker: args.blocker,
        token: args.token
      };
      logEvent(args.eventName, args.details);
    },
    [logEvent]
  );

  const logAutoSaveBlockedByHold = useCallback(
    (reason: string) => {
      const holdReason = autoSaveHoldRef.current.reason || '';
      const signature = `${reason}::${holdReason}`;
      if (lastAutoSaveBlockedHoldLogRef.current === signature) return;
      lastAutoSaveBlockedHoldLogRef.current = signature;
      logEvent('autosave.blocked.hold', { reason, holdReason: holdReason || null });
    },
    [logEvent]
  );

  const runtimeLineItemFieldIds = useMemo(
    () => collectRuntimeLineItemFieldIds(definition),
    [definition]
  );

  const buildPersistedDraftStateFingerprint = useCallback(
    (args: { language: LangCode; values: Record<string, FieldValue>; lineItems: LineItemState }) =>
      buildDraftStateFingerprint({
        formKey,
        language: args.language,
        values: args.values,
        lineItems: stripRuntimeLineItemStateFields(args.lineItems, runtimeLineItemFieldIds)
      }),
    [formKey, runtimeLineItemFieldIds]
  );

  const rememberAutoSaveSeenState = useCallback(
    (nextValues: Record<string, FieldValue>, nextLineItems: LineItemState) => {
      lastAutoSaveSeenRef.current = { values: nextValues, lineItems: nextLineItems };
      lastAutoSaveStateFingerprintRef.current = buildPersistedDraftStateFingerprint({
        language: languageRef.current,
        values: nextValues,
        lineItems: nextLineItems
      });
    },
    [buildPersistedDraftStateFingerprint]
  );

  const markPostPersistAutoSaveSuppress = useCallback((persistedLocalMutationAtMs?: number | null) => {
    const now = Date.now();
    postPersistAutoSaveSuppressUntilRef.current = now + POST_PERSIST_AUTOSAVE_SUPPRESS_MS;
    postPersistAutoSavePersistedLocalMutationAtRef.current =
      Number.isFinite(Number(persistedLocalMutationAtMs))
        ? Number(persistedLocalMutationAtMs)
        : lastLocalRecordMutationAtRef.current || 0;
    autoSaveUserEditedRef.current = false;
  }, []);

  const scheduleRetryableAutoSaveRecovery = useCallback(
    (reason: string, message: string) => {
      const attempt = Math.min(retryableAutoSaveFailureCountRef.current + 1, RETRYABLE_AUTOSAVE_DELAYS_MS.length);
      retryableAutoSaveFailureCountRef.current = attempt;
      const delayMs =
        RETRYABLE_AUTOSAVE_DELAYS_MS[Math.max(0, attempt - 1)] ||
        RETRYABLE_AUTOSAVE_DELAYS_MS[RETRYABLE_AUTOSAVE_DELAYS_MS.length - 1] ||
        1500;
      autoSaveDirtyRef.current = true;
      setDraftSave({ phase: 'saving' });
      scheduleLatestAutoSave(`${reason}.retryableBusy`, delayMs);
      logEvent('autosave.retryableBusy.retryScheduled', {
        reason,
        attempt,
        delayMs,
        message
      });
    },
    [logEvent, scheduleLatestAutoSave]
  );

  const waitForDraftSaveRequest = useCallback(
    async (reason: string, timeoutMs = 10000): Promise<void> => {
      if (!draftSaveRequestInFlightRef.current || !draftSaveRequestPromiseRef.current) return;
      const startedAt = Date.now();
      logEvent('draftSave.wait.begin', { reason });
      while (draftSaveRequestInFlightRef.current && draftSaveRequestPromiseRef.current) {
        const inFlight = draftSaveRequestPromiseRef.current;
        try {
          await inFlight;
        } catch {
          // ignore and re-check state below
        }
        if (!draftSaveRequestInFlightRef.current) break;
        if (Date.now() - startedAt > timeoutMs) break;
        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 80));
      }
      logEvent('draftSave.wait.done', {
        reason,
        durationMs: Date.now() - startedAt,
        stillInFlight: draftSaveRequestInFlightRef.current
      });
    },
    [logEvent]
  );

  const runDraftSaveRequest = useCallback(
    async <T,>(reason: string, runner: () => Promise<T>): Promise<T> => {
      const previousPromise = draftSaveRequestPromiseRef.current;
      const promise = chainSerializedSubmissionRequest(previousPromise, async () => runner());
      draftSaveRequestPromiseRef.current = promise as Promise<any>;
      draftSaveRequestInFlightRef.current = true;
      if (previousPromise) {
        logEvent('draftSave.serialized', { reason });
      }
      void promise.finally(() => {
        const hadQueuedAutoSave = autoSaveDirtyRef.current || autoSaveQueuedRef.current;
        if (draftSaveRequestPromiseRef.current === promise) {
          draftSaveRequestPromiseRef.current = null;
          draftSaveRequestInFlightRef.current = false;
        }
        if (!submittingRef.current && hadQueuedAutoSave) {
          scheduleLatestAutoSave('draftSave.release', 0);
        }
      });
      return promise;
    },
    [logEvent, scheduleLatestAutoSave]
  );

  const runSerializedSubmissionRequest = useCallback(
    async <T,>(reason: string, runner: () => Promise<T>): Promise<T> => {
      const previousPromise = submissionRequestPromiseRef.current;
      const promise = chainSerializedSubmissionRequest(previousPromise, async () => runner());
      submissionRequestPromiseRef.current = promise as Promise<any>;
      if (previousPromise) {
        logEvent('submit.serialized', { reason });
      }
      void promise.finally(() => {
        if (submissionRequestPromiseRef.current === promise) {
          submissionRequestPromiseRef.current = null;
        }
      });
      return promise;
    },
    [logEvent]
  );

  const runSerializedFollowupBatchRequest = useCallback(
    async (args: {
      recordId: string;
      actions: string[];
      reason: string;
      options?: FollowupBatchOptions;
    }): Promise<FollowupBatchResponse> => {
      return runSerializedSubmissionRequest(`followup:${args.reason}`, async () => {
        if (args.options?.emailDispatchMode === 'direct') {
          logEvent('followup.batch.directEmailDispatch', {
            recordId: args.recordId,
            reason: args.reason,
            actions: args.actions
          });
          return triggerFollowupBatch(formKey, args.recordId, args.actions, args.options);
        }
        return triggerFollowupBatch(formKey, args.recordId, args.actions, args.options);
      });
    },
    [formKey, logEvent, runSerializedSubmissionRequest]
  );

  const getCurrentKnownClientDataVersion = useCallback(
    () =>
      resolveKnownClientDataVersion({
        recordDataVersion: recordDataVersionRef.current,
        optimisticClientDataVersion: optimisticClientDataVersionRef.current,
        lastSubmissionMetaDataVersion: lastSubmissionMetaRef.current?.dataVersion,
        selectedRecordSnapshotDataVersion: (selectedRecordSnapshotRef.current as any)?.dataVersion
      }),
    []
  );

  const buildCurrentDraftSaveResponse = useCallback(
    (recordId: string) => ({
      success: true,
      meta: {
        id: recordId,
        updatedAt: lastSubmissionMetaRef.current?.updatedAt || selectedRecordSnapshotRef.current?.updatedAt || '',
        dataVersion: getCurrentKnownClientDataVersion() || undefined,
        rowNumber: recordRowNumberRef.current || undefined,
        status: lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || null
      }
    }),
    [getCurrentKnownClientDataVersion]
  );

  const isGuidedUtilisationDraftSyncEpochApplied = useCallback((requestEpoch?: number | null): boolean => {
    const epoch = Number(requestEpoch || 0);
    return Number.isFinite(epoch) && epoch > 0 && lastAppliedGuidedUtilisationDraftSyncEpochRef.current >= epoch;
  }, []);

  const attachPendingGuidedUtilisationDraftSyncToPayload = useCallback(
    (payload: any, reason: string): any => {
      const pending = pendingGuidedUtilisationDraftSyncRef.current;
      if (!pending || !payload) return payload;
      if ((payload as any).__ckMutationPlan?.utilisationPlan) return payload;
      if (
        shouldDeferUtilisationDraftSyncToDeleteOnKeyChange({
          dedupDeleteOnKeyChangeInFlight: dedupDeleteOnKeyChangeInFlightRef.current,
          dedupDeletePending: dedupDeleteOnKeyChangePendingRef.current
        })
      ) {
        return payload;
      }
      const payloadRecordId =
        (((payload as any)?.id || selectedRecordIdRef.current || selectedRecordSnapshotRef.current?.id || '') as any)
          .toString?.()
          .trim?.() || '';
      if (pending.recordId && payloadRecordId && pending.recordId !== payloadRecordId) return payload;
      const clientDataVersion =
        resolveCurrentClientDataVersion((payload as any).__ckClientDataVersion) ||
        resolveCurrentClientDataVersion(getCurrentKnownClientDataVersion());
      const nextPayload = {
        ...(payload || {}),
        __ckMutationPlan: {
          ...(((payload as any).__ckMutationPlan || {}) as Record<string, any>),
          utilisationPlan: {
            ...(pending.plan || {}),
            clientDataVersion: clientDataVersion || undefined,
            refreshMode: 'none'
          },
          guidedUtilisationDraftSync: {
            stepId: pending.stepId,
            clientMutationSeq: pending.requestEpoch
          }
        }
      };
      logEvent('guidedStep.utilisationDraft.attachedToSave', {
        reason,
        recordId: pending.recordId || payloadRecordId || null,
        stepId: pending.stepId,
        utilisationEpoch: pending.requestEpoch
      });
      return nextPayload;
    },
    [getCurrentKnownClientDataVersion, logEvent]
  );

  const markGuidedUtilisationDraftSyncSettledFromPayload = useCallback(
    (payload: any, response: any, reason: string) => {
      if (!response?.success) return;
      const sync = (payload as any)?.__ckMutationPlan?.guidedUtilisationDraftSync;
      const requestEpoch = Number(sync?.clientMutationSeq || 0);
      if (!Number.isFinite(requestEpoch) || requestEpoch <= 0) return;
      if (!(response as any)?.utilisationResult && !(response as any)?.meta?.utilisationPlan) return;
      lastAppliedGuidedUtilisationDraftSyncEpochRef.current = Math.max(
        lastAppliedGuidedUtilisationDraftSyncEpochRef.current,
        requestEpoch
      );
      const pending = pendingGuidedUtilisationDraftSyncRef.current;
      if (pending && pending.requestEpoch <= requestEpoch) {
        pendingGuidedUtilisationDraftSyncRef.current = null;
      }
      logEvent('guidedStep.utilisationDraft.settled', {
        reason,
        recordId: ((payload?.id || pending?.recordId || '') as any).toString?.().trim?.() || null,
        stepId: (sync?.stepId || pending?.stepId || '').toString() || null,
        utilisationEpoch: requestEpoch
      });
    },
    [logEvent]
  );

  const runCoalescedDraftSaveRequest = useCallback(
    async <T extends { success?: boolean; meta?: any },>(
      reason: string,
      payload: any,
      runner: (nextPayload: any) => Promise<T>
    ): Promise<T> => {
      const fingerprint = buildDraftSaveFingerprint(payload);
      if (
        fingerprint &&
        draftSaveRequestInFlightRef.current &&
        draftSaveRequestPromiseRef.current &&
        draftSaveRequestFingerprintRef.current?.recordId === fingerprint.recordId &&
        draftSaveRequestFingerprintRef.current?.fingerprint === fingerprint.fingerprint
      ) {
        logEvent('draftSave.coalesced.inFlight', {
          reason,
          recordId: fingerprint.recordId
        });
        return draftSaveRequestPromiseRef.current as Promise<T>;
      }

      if (
        fingerprint &&
        lastCompletedDraftSaveFingerprintRef.current?.recordId === fingerprint.recordId &&
        lastCompletedDraftSaveFingerprintRef.current?.fingerprint === fingerprint.fingerprint
      ) {
        logEvent('draftSave.coalesced.cached', {
          reason,
          recordId: fingerprint.recordId
        });
        lastDraftSaveFailureRef.current = null;
        return buildCurrentDraftSaveResponse(fingerprint.recordId) as T;
      }

      draftSaveRequestFingerprintRef.current = fingerprint;
      try {
        const result = await runDraftSaveRequest(reason, () => runner(payload));
        if (fingerprint && result?.success) {
          lastCompletedDraftSaveFingerprintRef.current = fingerprint;
        }
        markGuidedUtilisationDraftSyncSettledFromPayload(payload, result, reason);
        if ((result as any)?.success === false) {
          const message = (((result as any)?.message || 'Failed to save the current record.') as any).toString();
          if (isRetryableRecordBusyMessage(message)) {
            lastDraftSaveFailureRef.current = null;
            logEvent('draftSave.retryableBusy.failureIgnored', {
              reason,
              recordId: fingerprint?.recordId || ((result as any)?.meta?.id || payload?.id || '').toString().trim() || null,
              message
            });
            return result;
          }
          lastDraftSaveFailureRef.current = {
            recordId: fingerprint?.recordId || ((result as any)?.meta?.id || payload?.id || '').toString().trim() || null,
            message
          };
        } else {
          lastDraftSaveFailureRef.current = null;
        }
        return result;
      } catch (err: any) {
        const message = resolveUiErrorMessage(err, 'Failed to save the current record.') || 'Failed to save the current record.';
        const logMessage = resolveLogMessage(err, message);
        if (isRetryableRecordBusyMessage(message) || isRetryableRecordBusyMessage(logMessage)) {
          lastDraftSaveFailureRef.current = null;
          logEvent('draftSave.retryableBusy.exceptionIgnored', {
            reason,
            recordId: fingerprint?.recordId || ((payload?.id || '') as any).toString?.().trim?.() || null,
            message: logMessage || message
          });
          throw err;
        }
        lastDraftSaveFailureRef.current = {
          recordId: fingerprint?.recordId || ((payload?.id || '') as any).toString?.().trim?.() || null,
          message
        };
        throw err;
      } finally {
        if (
          draftSaveRequestFingerprintRef.current?.recordId === fingerprint?.recordId &&
          draftSaveRequestFingerprintRef.current?.fingerprint === fingerprint?.fingerprint
        ) {
          draftSaveRequestFingerprintRef.current = null;
        }
      }
    },
    [
      buildCurrentDraftSaveResponse,
      isRetryableRecordBusyMessage,
      logEvent,
      markGuidedUtilisationDraftSyncSettledFromPayload,
      resolveLogMessage,
      resolveUiErrorMessage,
      runDraftSaveRequest
    ]
  );

  const submitCurrentRecordMutation = useCallback(
    async (reason: string, payload: any, runner?: (nextPayload: any) => Promise<any>): Promise<any> => {
      return runSerializedSubmissionRequest(reason, async () => {
        const currentRecordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
        const previousClientDataVersion = resolveCurrentClientDataVersion((payload as any)?.__ckClientDataVersion);
        const prepared = prepareClientDataVersionDispatch({
          payload,
          currentRecordId,
          currentDataVersion: getCurrentKnownClientDataVersion(),
          optimisticDataVersion: optimisticClientDataVersionRef.current
        });
        const nextPayload = prepared.payload;
        const nextClientDataVersion = resolveCurrentClientDataVersion((nextPayload as any)?.__ckClientDataVersion);
        if ((nextPayload as any)?.__ckMutationPlan?.utilisationPlan) {
          (nextPayload as any).__ckMutationPlan = {
            ...((nextPayload as any).__ckMutationPlan || {}),
            utilisationPlan: {
              ...((nextPayload as any).__ckMutationPlan.utilisationPlan || {}),
              clientDataVersion: nextClientDataVersion || undefined
            }
          };
        }
        if (previousClientDataVersion !== nextClientDataVersion) {
          logEvent('submit.clientDataVersion.sync', {
            reason,
            recordId:
              currentRecordId ||
              ((nextPayload?.id || nextPayload?.__ckDeleteRecordId || '') as any).toString?.().trim?.() ||
              null,
            previousClientDataVersion,
            nextClientDataVersion
          });
        }
        optimisticClientDataVersionRef.current = prepared.optimisticDataVersion;
        try {
          const response = runner ? await runner(nextPayload) : await submit(nextPayload);
          optimisticClientDataVersionRef.current = settleClientDataVersionAfterDispatch({
            success: Boolean(response?.success),
            confirmedDataVersion: getCurrentKnownClientDataVersion(),
            optimisticDataVersion: optimisticClientDataVersionRef.current,
            responseDataVersion: (response as any)?.meta?.dataVersion
          });
          return response;
        } catch (err) {
          optimisticClientDataVersionRef.current = settleClientDataVersionAfterDispatch({
            success: false,
            confirmedDataVersion: getCurrentKnownClientDataVersion(),
            optimisticDataVersion: optimisticClientDataVersionRef.current
          });
          throw err;
        }
      });
    },
    [getCurrentKnownClientDataVersion, logEvent, runSerializedSubmissionRequest]
  );

  const getCurrentOpenRecordId = useCallback(
    () =>
      resolveCurrentOpenRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }),
    []
  );

  const buildInvalidGuidedUtilisationDraftKey = useCallback(
    (args: {
      recordId?: string | null;
      sessionId?: number | null;
      stepId?: string | null;
      groupId?: string | null;
      parentRowId?: string | null;
      sourceKey?: string | null;
    }): string =>
      [
        Number.isFinite(Number(args.sessionId)) ? Number(args.sessionId) : recordSessionRef.current,
        (args.recordId || getCurrentOpenRecordId() || '').toString().trim(),
        (args.stepId || '').toString().trim(),
        (args.groupId || '').toString().trim(),
        (args.parentRowId || '').toString().trim(),
        (args.sourceKey || '').toString().trim()
      ].join('::'),
    [getCurrentOpenRecordId]
  );

  const resolveInvalidGuidedUtilisationDraftsForStep = useCallback(
    (stepId?: string | null) => {
      const normalizedStepId = (stepId || '').toString().trim();
      if (!normalizedStepId) return [];
      const recordId = getCurrentOpenRecordId();
      const sessionId = recordSessionRef.current;
      return Object.values(invalidGuidedUtilisationDraftsRef.current).filter(
        entry =>
          entry.stepId === normalizedStepId &&
          entry.recordId === recordId &&
          entry.sessionId === sessionId
      );
    },
    [getCurrentOpenRecordId]
  );

  const clearRecordFreshnessTimer = useCallback(() => {
    if (recordFreshnessTimerRef.current) {
      globalThis.clearTimeout(recordFreshnessTimerRef.current);
      recordFreshnessTimerRef.current = null;
    }
  }, []);

  const scheduleRecordFreshnessCheck = useCallback(
    (reason: string) => {
      clearRecordFreshnessTimer();
      const currentDataVersion = getCurrentKnownClientDataVersion();
      const delayMs = resolveRecordFreshnessTimerDelay({
        config: recordFreshnessConfigRef.current,
        view: viewRef.current,
        recordId: getCurrentOpenRecordId(),
        hasServerVersion: Number.isFinite(Number(currentDataVersion)) && Number(currentDataVersion) > 0,
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAt: lastRecordServerActivityAtRef.current || null
      });
      if (delayMs === null) return;
      const nextDelayMs = Math.max(1000, Math.floor(delayMs));
      recordFreshnessTimerRef.current = globalThis.setTimeout(() => {
        recordFreshnessTimerRef.current = null;
        void performRecordFreshnessCheckRef.current('heartbeat');
      }, nextDelayMs) as unknown as number;
      logEvent('record.freshness.schedule', {
        reason,
        recordId: getCurrentOpenRecordId() || null,
        delayMs: nextDelayMs,
        quietWindowMs: recordFreshnessConfigRef.current.quietWindowMs
      });
    },
    [clearRecordFreshnessTimer, getCurrentKnownClientDataVersion, getCurrentOpenRecordId, logEvent]
  );

  const markRecordFreshnessServerTouch = useCallback(
    (args: { reason: string; recordId?: string | null }) => {
      const currentRecordId = getCurrentOpenRecordId();
      const targetRecordId = (args.recordId || currentRecordId || '').toString().trim();
      if (currentRecordId && targetRecordId && currentRecordId !== targetRecordId) return;
      lastRecordServerActivityAtRef.current = Date.now();
      logEvent('record.freshness.touch', {
        reason: args.reason,
        recordId: targetRecordId || currentRecordId || null,
        quietWindowMs: recordFreshnessConfigRef.current.quietWindowMs
      });
      scheduleRecordFreshnessCheck(args.reason);
    },
    [getCurrentOpenRecordId, logEvent, scheduleRecordFreshnessCheck]
  );

  const getRecordFreshnessSyncBlockers = useCallback(
    () => {
      const currentRecordId = getCurrentOpenRecordId();
      return resolveRecordFreshnessSyncBlockers({
        dirty: autoSaveDirtyRef.current,
        draftSavePhase: draftSave.phase,
        autoSaveQueued: autoSaveQueuedRef.current,
        autoSaveInFlight: autoSaveInFlightRef.current,
        draftSaveInFlight: draftSaveRequestInFlightRef.current,
        submissionInFlight: Boolean(submissionRequestPromiseRef.current) || submittingRef.current,
        uploadInFlight: uploadQueueRef.current.size > 0,
        qrScannerInFlight:
          autoSaveHoldRef.current.hold && autoSaveHoldRef.current.reason === 'qrScannerSession',
        recordSyncInFlight: Boolean(recordSyncPromiseRef.current) || Boolean(recordLoadingIdRef.current),
        utilisationSyncInFlight: Boolean(utilisationSyncPromiseRef.current),
        guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
        guidedStepBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current),
        followupBatchInFlight: currentRecordId ? pendingFollowupBatchPromisesRef.current.has(currentRecordId) : false,
        lastUserInteractionAt: lastUserInteractionRef.current || null,
        now: Date.now()
      });
    },
    [draftSave.phase, getCurrentOpenRecordId]
  );

  const performRecordFreshnessCheck = useCallback(
    async (reason: string): Promise<void> => {
      const recordId = getCurrentOpenRecordId();
      const baselineVersionRaw = getCurrentKnownClientDataVersion();
      const baselineVersion =
        Number.isFinite(Number(baselineVersionRaw)) && Number(baselineVersionRaw) > 0 ? Number(baselineVersionRaw) : null;
      const delayMs = resolveRecordFreshnessTimerDelay({
        config: recordFreshnessConfigRef.current,
        view: viewRef.current,
        recordId,
        hasServerVersion: baselineVersion !== null,
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAt: lastRecordServerActivityAtRef.current || null
      });
      if (delayMs === null || !recordId || baselineVersion === null) {
        clearRecordFreshnessTimer();
        return;
      }
      if (recordFreshnessCheckPromiseRef.current) {
        logEvent('record.freshness.check.skipped', { reason, recordId, skipReason: 'inFlight' });
        scheduleRecordFreshnessCheck(`${reason}.inFlight`);
        return;
      }
      const syncBlockersAtStart = getRecordFreshnessSyncBlockers();
      if (syncBlockersAtStart.length) {
        logEvent('record.freshness.check.skipped', {
          reason,
          recordId,
          skipReason: 'syncBlocked',
          blockers: syncBlockersAtStart,
          dirty: autoSaveDirtyRef.current,
          draftSavePhase: draftSave.phase,
          autoSaveQueued: autoSaveQueuedRef.current
        });
        scheduleRecordFreshnessCheck(`${reason}.syncBlocked`);
        return;
      }
      if (
        autoSaveInFlightRef.current ||
        draftSaveRequestInFlightRef.current ||
        Boolean(submissionRequestPromiseRef.current) ||
        uploadQueueRef.current.size > 0 ||
        Boolean(recordSyncPromiseRef.current) ||
        Boolean(guidedStepImmediateSyncPromiseRef.current) ||
        Boolean(guidedStepBackgroundSyncPromiseRef.current) ||
        pendingFollowupBatchPromisesRef.current.has(recordId) ||
        submittingRef.current
      ) {
        logEvent('record.freshness.check.skipped', {
          reason,
          recordId,
          skipReason: 'serverWorkInFlight',
          uploadsInFlight: uploadQueueRef.current.size,
          autoSaveInFlight: autoSaveInFlightRef.current,
          draftSaveInFlight: draftSaveRequestInFlightRef.current,
          submissionInFlight: Boolean(submissionRequestPromiseRef.current),
          recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
          guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
          guidedStepBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current),
          followupBatchInFlight: pendingFollowupBatchPromisesRef.current.has(recordId)
        });
        scheduleRecordFreshnessCheck(`${reason}.serverWorkInFlight`);
        return;
      }

      const startedAt = Date.now();
      lastRecordServerActivityAtRef.current = startedAt;
      logEvent('record.freshness.check.start', {
        reason,
        recordId,
        cachedVersion: baselineVersion,
        rowNumberHint: recordRowNumberRef.current || null
      });
      const promise = (async () => {
        try {
          const result = await getRecordVersionApi(formKey, recordId, recordRowNumberRef.current || null);
          if (selectedRecordIdRef.current !== recordId) return;
          if (!result?.success) {
            logEvent('record.freshness.check.error', {
              reason,
              recordId,
              message: result?.message || 'failed',
              durationMs: Date.now() - startedAt
            });
            scheduleRecordFreshnessCheck(`${reason}.error`);
            return;
          }

          const serverVersion = Number(result.dataVersion);
          const serverRow = Number.isFinite(Number(result.rowNumber)) ? Number(result.rowNumber) : null;
          if (serverRow && serverRow >= 2) {
            recordRowNumberRef.current = serverRow;
          }
          markRecordFreshnessServerTouch({ reason: `recordFreshness.${reason}`, recordId });
          const localVersionNow = Number(getCurrentKnownClientDataVersion());
          const effectiveBaseline =
            Number.isFinite(localVersionNow) && localVersionNow > 0 ? localVersionNow : baselineVersion;
          if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== effectiveBaseline) {
            const syncBlockers = getRecordFreshnessSyncBlockers();
            const shouldDeferSync = syncBlockers.length > 0;
            logEvent('record.freshness.check.stale', {
              reason,
              recordId,
              cachedVersion: effectiveBaseline,
              serverVersion,
              serverRow,
              deferred: shouldDeferSync,
              dirty: autoSaveDirtyRef.current,
              draftSavePhase: draftSave.phase,
              autoSaveQueued: autoSaveQueuedRef.current,
              blockers: syncBlockers
            });
            if (shouldDeferSync) {
              pendingDeferredRecordFreshnessSyncRef.current = {
                reason: 'recordFreshness.stale',
                recordId,
                cachedVersion: effectiveBaseline,
                serverVersion,
                serverRow
              };
              logEvent('record.freshness.check.stale.deferred', {
                reason,
                recordId,
                cachedVersion: effectiveBaseline,
                serverVersion,
                serverRow,
                draftSavePhase: draftSave.phase,
                autoSaveQueued: autoSaveQueuedRef.current,
                blockers: syncBlockers
              });
              scheduleRecordFreshnessCheck(`${reason}.staleDeferred`);
              return;
            }
            pendingDeferredRecordFreshnessSyncRef.current = null;
            await synchronizeStaleRecordRef.current({
              reason: 'recordFreshness.stale',
              recordId,
              cachedVersion: effectiveBaseline,
              serverVersion,
              serverRow
            });
            return;
          }

          logEvent('record.freshness.check.match', {
            reason,
            recordId,
            serverVersion: Number.isFinite(serverVersion) ? serverVersion : null,
            durationMs: Date.now() - startedAt
          });
        } catch (err: any) {
          logEvent('record.freshness.check.exception', {
            reason,
            recordId,
            message: err?.message || err?.toString?.() || 'failed',
            durationMs: Date.now() - startedAt
          });
          scheduleRecordFreshnessCheck(`${reason}.exception`);
        } finally {
          recordFreshnessCheckPromiseRef.current = null;
        }
      })();
      recordFreshnessCheckPromiseRef.current = promise;
      return promise;
    },
    [
      clearRecordFreshnessTimer,
      draftSave.phase,
      formKey,
      getCurrentKnownClientDataVersion,
      getCurrentOpenRecordId,
      getRecordFreshnessSyncBlockers,
      logEvent,
      markRecordFreshnessServerTouch,
      scheduleRecordFreshnessCheck
    ]
  );
  performRecordFreshnessCheckRef.current = performRecordFreshnessCheck;

  const resolveWatchedDataSourceConfig = useCallback(
    (dataSourceId: string) => {
      return resolveDataSourceConfigById(collectDataSourceConfigsForPrefetch(definition), dataSourceId);
    },
    [definition]
  );

  const dataSourceFreshnessWatchIsStopped = useCallback((watch: { stopWhen?: any }): boolean => {
    if (!watch?.stopWhen) return false;
    const metaSource: any = selectedRecordSnapshotRef.current || lastSubmissionMetaRef.current || null;
    const currentValues = valuesRef.current || {};
    const currentLineItems = lineItemsRef.current || {};
    const topValues: Record<string, FieldValue> = {
      ...(currentValues as Record<string, FieldValue>),
      ...(metaSource?.id !== undefined ? { id: metaSource.id as FieldValue } : {}),
      ...(metaSource?.createdAt !== undefined ? { createdAt: metaSource.createdAt as FieldValue } : {}),
      ...(metaSource?.updatedAt !== undefined ? { updatedAt: metaSource.updatedAt as FieldValue } : {}),
      ...(metaSource?.status !== undefined ? { status: metaSource.status as FieldValue, STATUS: metaSource.status as FieldValue } : {}),
      ...(metaSource?.pdfUrl !== undefined ? { pdfUrl: metaSource.pdfUrl as FieldValue } : {})
    };
    return matchesWhenClause(watch.stopWhen, {
      getValue: (fieldId: string) => topValues[fieldId],
      getLineItems: (groupId: string) => (currentLineItems[groupId] || []) as any[],
      getLineItemKeys: () => Object.keys(currentLineItems || {})
    } as any);
  }, []);

  const resolveRunnableDataSourceFreshnessWatches = useCallback(
    (stepId?: string | null) =>
      resolveActiveDataSourceFreshnessWatches({
        watches: dataSourceFreshnessWatchesRef.current,
        stepId
      }).filter(watch => !dataSourceFreshnessWatchIsStopped(watch)),
    [dataSourceFreshnessWatchIsStopped]
  );

  const clearDataSourceFreshnessTimer = useCallback(() => {
    if (dataSourceFreshnessTimerRef.current) {
      globalThis.clearTimeout(dataSourceFreshnessTimerRef.current);
      dataSourceFreshnessTimerRef.current = null;
    }
  }, []);

  const scheduleDataSourceFreshnessCheck = useCallback(
    (reason: string) => {
      clearDataSourceFreshnessTimer();
      const activeWatches = resolveRunnableDataSourceFreshnessWatches(activeGuidedStepIdRef.current);
      const now = Date.now();
      const primed = primeDataSourceFreshnessWatchBaselines({
        watches: activeWatches,
        now,
        lastServerActivityAtByWatchKey: lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current
      });
      if (primed.initializedWatchKeys.length) {
        lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current = primed.lastServerActivityAtByWatchKey;
        logEvent('datasource.freshness.baseline', {
          reason,
          recordId: getCurrentOpenRecordId() || null,
          stepId: activeGuidedStepIdRef.current || null,
          watchKeys: primed.initializedWatchKeys,
          dataSourceIds: Array.from(new Set(activeWatches.flatMap(watch => watch.dataSourceIds)))
        });
      }
      const delayMs = resolveDataSourceFreshnessTimerDelay({
        watches: activeWatches,
        view: viewRef.current,
        recordId: getCurrentOpenRecordId(),
        recordLoading: Boolean(recordLoadingIdRef.current),
        now,
        lastServerActivityAtByWatchKey: primed.lastServerActivityAtByWatchKey
      });
      if (delayMs === null) return;
      const nextDelayMs = Math.max(1000, Math.floor(delayMs));
      dataSourceFreshnessTimerRef.current = globalThis.setTimeout(() => {
        dataSourceFreshnessTimerRef.current = null;
        void performDataSourceFreshnessCheckRef.current('heartbeat');
      }, nextDelayMs) as unknown as number;
      logEvent('datasource.freshness.schedule', {
        reason,
        recordId: getCurrentOpenRecordId() || null,
        stepId: activeGuidedStepIdRef.current || null,
        delayMs: nextDelayMs,
        watchKeys: activeWatches.map(watch => watch.key),
        dataSourceIds: Array.from(new Set(activeWatches.flatMap(watch => watch.dataSourceIds)))
      });
    },
    [clearDataSourceFreshnessTimer, getCurrentOpenRecordId, logEvent, resolveRunnableDataSourceFreshnessWatches]
  );

  const markDataSourceFreshnessServerTouch = useCallback(
    (args: { reason: string; stepId?: string | null; dataSourceIds?: string[] | null }) => {
      const activeWatches = resolveRunnableDataSourceFreshnessWatches(
        (args.stepId || activeGuidedStepIdRef.current || '').toString().trim()
      );
      const watches = filterDataSourceFreshnessWatchesByDataSourceIds(activeWatches, args.dataSourceIds);
      if (!watches.length) return;
      const touchedAt = Date.now();
      watches.forEach(watch => {
        lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = touchedAt;
      });
      logEvent('datasource.freshness.touch', {
        reason: args.reason,
        recordId: getCurrentOpenRecordId() || null,
        stepId: (args.stepId || activeGuidedStepIdRef.current || '').toString().trim() || null,
        watchKeys: watches.map(watch => watch.key),
        dataSourceIds: Array.from(new Set(watches.flatMap(watch => watch.dataSourceIds)))
      });
      scheduleDataSourceFreshnessCheck(args.reason);
    },
    [getCurrentOpenRecordId, logEvent, resolveRunnableDataSourceFreshnessWatches, scheduleDataSourceFreshnessCheck]
  );

  const performDataSourceFreshnessCheck = useCallback(
    async (reason: string): Promise<void> => {
      const recordId = getCurrentOpenRecordId();
      const stepId = activeGuidedStepIdRef.current;
      const sessionId = recordSessionRef.current;
      const activeWatches = resolveRunnableDataSourceFreshnessWatches(stepId);
      const delayMs = resolveDataSourceFreshnessTimerDelay({
        watches: activeWatches,
        view: viewRef.current,
        recordId,
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAtByWatchKey: lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current
      });
      if (delayMs === null) {
        clearDataSourceFreshnessTimer();
        return;
      }
      const dueWatches = activeWatches.filter(watch => {
        const watchDelayMs = resolveDataSourceFreshnessTimerDelay({
          watches: [watch],
          view: viewRef.current,
          recordId,
          recordLoading: Boolean(recordLoadingIdRef.current),
          now: Date.now(),
          lastServerActivityAtByWatchKey: lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current
        });
        return watchDelayMs !== null && watchDelayMs <= 0;
      });
      if (!dueWatches.length) {
        scheduleDataSourceFreshnessCheck(`${reason}.waiting`);
        return;
      }
      const invalidUtilisationDrafts = resolveInvalidGuidedUtilisationDraftsForStep(stepId);
      if (invalidUtilisationDrafts.length) {
        const skippedAt = Date.now();
        dueWatches.forEach(watch => {
          lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = skippedAt;
        });
        logEvent('datasource.freshness.check.skipped', {
          reason,
          recordId,
          stepId,
          skipReason: 'invalidGuidedUtilisationDraft',
          blockers: invalidUtilisationDrafts.map(entry => ({
            groupId: entry.groupId,
            parentRowId: entry.parentRowId,
            sourceKey: entry.sourceKey,
            reason: entry.reason
          }))
        });
        scheduleDataSourceFreshnessCheck(`${reason}.invalidGuidedUtilisationDraft`);
        return;
      }
      if (dataSourceFreshnessCheckPromiseRef.current) {
        logEvent('datasource.freshness.check.skipped', {
          reason,
          recordId,
          stepId,
          skipReason: 'inFlight'
        });
        scheduleDataSourceFreshnessCheck(`${reason}.inFlight`);
        return;
      }
      const dueWatchTargetFormKeys = resolveStepDataSourceTargetFormKeys(
        dueWatches.flatMap(watch =>
          watch.dataSourceIds.map(dataSourceId => resolveWatchedDataSourceConfig(dataSourceId)).filter(Boolean)
        )
      );
      const pendingSharedDataMatches = resolvePendingSharedDataMutationMatches({
        pending: Array.from(pendingSharedDataMutationsRef.current.values()),
        targetFormKeys: dueWatchTargetFormKeys
      }) as PendingSharedDataMutationEntry[];
      if (pendingSharedDataMatches.length) {
        const skippedAt = Date.now();
        dueWatches.forEach(watch => {
          lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = skippedAt;
        });
        logEvent('datasource.freshness.check.skipped', {
          reason,
          recordId,
          stepId,
          skipReason: 'pendingSharedDataMutation',
          targetFormKeys: dueWatchTargetFormKeys,
          pendingCount: pendingSharedDataMatches.length,
          pendingIds: pendingSharedDataMatches.map(entry => entry.id),
          pendingRecordIds: Array.from(new Set(pendingSharedDataMatches.map(entry => entry.recordId).filter(Boolean))),
          pendingReasons: Array.from(new Set(pendingSharedDataMatches.map(entry => entry.reason).filter(Boolean)))
        });
        scheduleDataSourceFreshnessCheck(`${reason}.pendingSharedDataMutation`);
        return;
      }
      if (
        autoSaveInFlightRef.current ||
        draftSaveRequestInFlightRef.current ||
        Boolean(submissionRequestPromiseRef.current) ||
        uploadQueueRef.current.size > 0 ||
        Boolean(recordSyncPromiseRef.current) ||
        Boolean(utilisationSyncPromiseRef.current) ||
        Boolean(guidedStepImmediateSyncPromiseRef.current) ||
        Boolean(guidedStepBackgroundSyncPromiseRef.current) ||
        submittingRef.current ||
        Boolean(recordLoadingIdRef.current)
      ) {
        logEvent('datasource.freshness.check.skipped', {
          reason,
          recordId,
          stepId,
          skipReason: 'serverWorkInFlight',
          uploadsInFlight: uploadQueueRef.current.size,
          autoSaveInFlight: autoSaveInFlightRef.current,
          draftSaveInFlight: draftSaveRequestInFlightRef.current,
          submissionInFlight: Boolean(submissionRequestPromiseRef.current),
          recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
          utilisationSyncInFlight: Boolean(utilisationSyncPromiseRef.current),
          guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
          guidedStepBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current)
        });
        scheduleDataSourceFreshnessCheck(`${reason}.serverWorkInFlight`);
        return;
      }

      const startedAt = Date.now();
      dueWatches.forEach(watch => {
        lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = startedAt;
      });
      logEvent('datasource.freshness.check.start', {
        reason,
        recordId,
        stepId,
        watchKeys: dueWatches.map(watch => watch.key),
        dataSourceIds: Array.from(new Set(dueWatches.flatMap(watch => watch.dataSourceIds)))
      });
      const promise = (async () => {
        try {
          const changedWatches: typeof dueWatches = [];
          for (const watch of dueWatches) {
            let watchChanged = false;

            for (const dataSourceId of watch.dataSourceIds) {
              const config = resolveWatchedDataSourceConfig(dataSourceId);
              if (!config) {
                logEvent('datasource.freshness.check.skipped', {
                  reason,
                  recordId,
                  stepId,
                  watchKey: watch.key,
                  dataSourceId,
                  skipReason: 'missingConfig'
                });
                continue;
              }
              const signatureFieldIds = resolveDataSourceFreshnessSignatureFieldIds(config);
              const utilisationSyncEpochAtFetchStart = utilisationSyncEpochRef.current;
              const refreshed = await fetchDataSource(config, languageRef.current, {
                forceRefresh: true,
                shouldCommit: () =>
                  utilisationSyncEpochRef.current === utilisationSyncEpochAtFetchStart &&
                  !utilisationSyncPromiseRef.current
              }).catch(() => null);
              if (recordSessionRef.current !== sessionId) return;
              if (selectedRecordIdRef.current !== recordId) return;
              if (viewRef.current !== 'form') return;
              if (activeGuidedStepIdRef.current !== stepId) return;
              if (
                utilisationSyncEpochRef.current !== utilisationSyncEpochAtFetchStart ||
                utilisationSyncPromiseRef.current
              ) {
                logEvent('datasource.freshness.check.skipped', {
                  reason,
                  recordId,
                  stepId,
                  watchKey: watch.key,
                  dataSourceId,
                  skipReason: 'utilisationSyncStarted',
                  durationMs: Date.now() - startedAt
                });
                continue;
              }
              if (!refreshed) {
                logEvent('datasource.freshness.check.error', {
                  reason,
                  recordId,
                  stepId,
                  watchKey: watch.key,
                  dataSourceId,
                  message: 'failed',
                  durationMs: Date.now() - startedAt
                });
                continue;
              }
              const afterSignature = buildDataSourceFreshnessSnapshotSignature(refreshed, {
                fieldIds: signatureFieldIds
              });
              const baselineKey = buildDataSourceFreshnessBaselineKey({
                watchKey: watch.key,
                dataSourceId
              });
              const baselineEntry = baselineKey ? dataSourceFreshnessSignatureBaselineByKeyRef.current[baselineKey] : null;
              const scopedBaselineSignature =
                baselineEntry &&
                baselineEntry.recordId === (recordId || '').toString() &&
                baselineEntry.stepId === (stepId || '').toString() &&
                baselineEntry.sessionId === sessionId
                  ? baselineEntry.signature
                  : null;
              const baselineComparison = resolveDataSourceFreshnessBaselineComparison({
                baselineSignature: scopedBaselineSignature,
                nextSignature: afterSignature
              });
              if (baselineKey && (baselineComparison.shouldPrimeBaseline || baselineComparison.changed)) {
                dataSourceFreshnessSignatureBaselineByKeyRef.current[baselineKey] = {
                  signature: afterSignature,
                  recordId: (recordId || '').toString(),
                  stepId: (stepId || '').toString(),
                  sessionId
                };
              }
              if (baselineComparison.shouldPrimeBaseline) {
                logEvent('datasource.freshness.check.baselinePrimed', {
                  reason,
                  recordId,
                  stepId,
                  watchKey: watch.key,
                  dataSourceId,
                  durationMs: Date.now() - startedAt
                });
                continue;
              }
              if (baselineComparison.changed) {
                watchChanged = true;
              }
            }

            lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = Date.now();
            if (watchChanged) {
              changedWatches.push(watch);
              logEvent('datasource.freshness.check.changed', {
                reason,
                recordId,
                stepId,
                watchKey: watch.key,
                dataSourceIds: watch.dataSourceIds,
                durationMs: Date.now() - startedAt
              });
            } else {
              logEvent('datasource.freshness.check.match', {
                reason,
                recordId,
                stepId,
                watchKey: watch.key,
                dataSourceIds: watch.dataSourceIds,
                durationMs: Date.now() - startedAt
              });
            }
          }

          if (selectedRecordIdRef.current !== recordId) return;
          if (viewRef.current !== 'form') return;
          if (activeGuidedStepIdRef.current !== stepId) return;

          const changedWatch = changedWatches[0];
          if (!changedWatch) return;
          const dialog = changedWatch.dialog;
          await new Promise<void>(resolve => {
            customConfirm.openConfirm({
              title: resolveOptionalLocalizedString(
                dialog?.title,
                languageRef.current,
                tSystem('common.notice', languageRef.current, 'Notice')
              ),
              message:
                resolveLocalizedString(
                  dialog?.message,
                  languageRef.current,
                  'The available source data changed while you were editing. We loaded the latest availability. Please review this step before continuing.'
                ) ||
                'The available source data changed while you were editing. We loaded the latest availability. Please review this step before continuing.',
              confirmLabel: resolveLocalizedString(
                dialog?.confirmLabel,
                languageRef.current,
                tSystem('common.ok', languageRef.current, 'OK')
              ),
              cancelLabel: resolveLocalizedString(
                dialog?.cancelLabel,
                languageRef.current,
                tSystem('common.cancel', languageRef.current, 'Cancel')
              ),
              primaryAction: dialog?.primaryAction,
              showCancel: dialog?.showCancel === true,
              showCloseButton: dialog?.showCloseButton === true,
              dismissOnBackdrop: dialog?.dismissOnBackdrop === true,
              kind: 'datasourceFreshness.changed',
              refId: changedWatch.stepId || 'datasource',
              onConfirm: () => resolve(),
              onCancel: () => resolve()
            });
          });
        } catch (err: any) {
          logEvent('datasource.freshness.check.exception', {
            reason,
            recordId,
            stepId,
            message: err?.message || err?.toString?.() || 'failed',
            durationMs: Date.now() - startedAt
          });
        } finally {
          dataSourceFreshnessCheckPromiseRef.current = null;
          scheduleDataSourceFreshnessCheck(`${reason}.complete`);
        }
      })();
      dataSourceFreshnessCheckPromiseRef.current = promise;
      return promise;
    },
    [
      clearDataSourceFreshnessTimer,
      customConfirm,
      getCurrentOpenRecordId,
      logEvent,
      pendingSharedDataMutationsRef,
      resolveRunnableDataSourceFreshnessWatches,
      resolveInvalidGuidedUtilisationDraftsForStep,
      resolveWatchedDataSourceConfig,
      scheduleDataSourceFreshnessCheck
    ]
  );
  performDataSourceFreshnessCheckRef.current = performDataSourceFreshnessCheck;

  const handleGuidedStepUtilisationDraftStateChange = useCallback(
    (args: {
      stepId: string;
      groupId: string;
      parentRowId: string;
      sourceKey: string;
      pendingInvalid: boolean;
      reason: string;
      patchFields?: string[];
    }) => {
      const stepId = (args.stepId || '').toString().trim();
      const groupId = (args.groupId || '').toString().trim();
      const parentRowId = (args.parentRowId || '').toString().trim();
      const sourceKey = (args.sourceKey || '').toString().trim();
      const recordId = getCurrentOpenRecordId();
      if (!stepId || !groupId || !parentRowId || !sourceKey || !recordId) return;
      const key = buildInvalidGuidedUtilisationDraftKey({
        recordId,
        sessionId: recordSessionRef.current,
        stepId,
        groupId,
        parentRowId,
        sourceKey
      });
      if (args.pendingInvalid) {
        invalidGuidedUtilisationDraftsRef.current = {
          ...invalidGuidedUtilisationDraftsRef.current,
          [key]: {
            recordId,
            sessionId: recordSessionRef.current,
            stepId,
            groupId,
            parentRowId,
            sourceKey,
            reason: (args.reason || 'invalidUtilisationDraft').toString(),
            updatedAt: Date.now()
          }
        };
      } else if (invalidGuidedUtilisationDraftsRef.current[key]) {
        const next = { ...invalidGuidedUtilisationDraftsRef.current };
        delete next[key];
        invalidGuidedUtilisationDraftsRef.current = next;
      }
      logEvent('guidedStep.utilisationDraft.state', {
        stepId,
        recordId,
        groupId,
        parentRowId,
        sourceKey,
        pendingInvalid: args.pendingInvalid,
        reason: args.reason || null,
        patchFields: Array.isArray(args.patchFields) ? args.patchFields : []
      });
    },
    [buildInvalidGuidedUtilisationDraftKey, getCurrentOpenRecordId, logEvent]
  );

  const applyUploadedFieldOverrides = useCallback(
    (args: {
      values: Record<string, FieldValue>;
      lineItems: LineItemState;
    }): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
      return applyUploadedFieldOverridesToState({
        values: args.values,
        lineItems: args.lineItems,
        overrides: uploadedFieldValueOverridesRef.current
      });
    },
    []
  );

  const applyUploadedFieldPayloadOverrides = useCallback((payload: any): any => {
    return applyUploadedFieldOverridesToPayload({
      payload,
      overrides: uploadedFieldValueOverridesRef.current
    });
  }, []);

  useEffect(() => {
    autoSaveHoldRef.current = autoSaveHold;
  }, [autoSaveHold]);

  const setAutoSaveHoldFromUi = useCallback(
    (hold: boolean, meta?: { reason?: string }) => {
      const nextHold = !!hold;
      const nextReason = (meta?.reason || '').toString().trim();
      autoSaveHoldRef.current = { hold: nextHold, reason: nextReason || undefined };
      setAutoSaveHold(prev => {
        if (prev.hold === nextHold && (prev.reason || '') === nextReason) return prev;
        return { hold: nextHold, reason: nextReason || undefined };
      });
      if (nextHold) {
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        logEvent('autosave.hold.enabled', { reason: nextReason || null });
        return;
      }
      logEvent('autosave.hold.disabled', { reason: nextReason || null });
    },
    [logEvent]
  );

  // Keep latest values in refs so autosave can run without stale closures.
  const viewRef = useRef<View>(view);
  const submittingRef = useRef<boolean>(submitting);
  const valuesRef = useRef<Record<string, FieldValue>>(values);
  const lineItemsRef = useRef<LineItemState>(lineItems);
  const languageRef = useRef<LangCode>(language);
  const {
    readOnlyFilesOverlay,
    openReadOnlyFilesOverlay,
    closeReadOnlyFilesOverlay
  } = useReadOnlyFilesOverlay({
    definition,
    valuesRef,
    languageRef,
    logEvent
  });
  const selectedRecordIdRef = useRef<string>(selectedRecordId);
  const selectedRecordSnapshotRef = useRef<WebFormSubmission | null>(selectedRecordSnapshot);
  const lastSubmissionMetaRef = useRef<SubmissionMeta | null>(lastSubmissionMeta);
  // Tracks the last known server-owned dataVersion for the currently open record (used for optimistic locking).
  const recordDataVersionRef = useRef<number | null>(
    record && Number.isFinite(Number((record as any).dataVersion)) ? Number((record as any).dataVersion) : null
  );
  // Tracks the last known rowNumber for the currently open record (used for fast O(1) version checks via the index sheet).
  const recordRowNumberRef = useRef<number | null>(
    record && Number.isFinite(Number((record as any).__rowNumber)) ? Number((record as any).__rowNumber) : null
  );
  /**
   * In create-flow, autosave must NOT create drafts until the user actually changes a field value.
   * Defaults/derived values/preset values alone should not trigger autosave.
   */
  const createFlowUserEditedRef = useRef<boolean>(false);
  const dedupHoldRef = useRef<boolean>(false);
  // Initialize immediately so the very first user interaction can be dedup-held (before effects run).
  const dedupTriggerFieldIdsRef = useRef<Record<string, true>>(computeDedupKeyFieldIdMap((definition as any)?.dedupRules));
  const dedupIdentityFieldIdsRef = useRef<Record<string, true>>(computeDedupKeyFieldIdMap((definition as any)?.dedupRules));
  // Baseline dedup identity of the currently loaded record (used by optional delete-on-key-change flow).
  const dedupBaselineSignatureRef = useRef<string>('');
  const dedupKeyFingerprintBaselineRef = useRef<string>('');
  const dedupDeleteOnKeyChangeInFlightRef = useRef<boolean>(false);
  const dedupDeleteOnKeyChangePendingRef = useRef<boolean>(false);
  const dedupDeleteOnKeyChangeEnabled =
    (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  useEffect(() => {
    lineItemsRef.current = lineItems;
  }, [lineItems]);

  const setValuesFromFormView = useCallback(
    (next: React.SetStateAction<Record<string, FieldValue>>) => {
      const resolved =
        typeof next === 'function'
          ? (next as (prev: Record<string, FieldValue>) => Record<string, FieldValue>)(valuesRef.current)
          : next;
      valuesRef.current = resolved;
      setValues(resolved);
    },
    [setValues]
  );

  const setLineItemsFromFormView = useCallback(
    (next: React.SetStateAction<LineItemState>) => {
      const resolved =
        typeof next === 'function'
          ? (next as (prev: LineItemState) => LineItemState)(lineItemsRef.current)
          : next;
      const preserved = preserveSelectionEffectSourceMappedValues({
        definition,
        previousLineItems: lineItemsRef.current,
        nextLineItems: resolved
      });
      lineItemsRef.current = preserved;
      setLineItems(preserved);
    },
    [definition, setLineItems]
  );

  useEffect(() => {
    if (view !== 'form') return;
    const warningLineItems = buildCanonicalNonMatchWarningLineItems({
      definition,
      values,
      lineItems
    });
    const nextPaths = collectNonMatchWarningPaths({ definition, lineItems: warningLineItems });

    const prevPaths = nonMatchWarningPathsRef.current;
    let changed = prevPaths.size !== nextPaths.size;
    if (!changed) {
      for (const key of nextPaths) {
        if (!prevPaths.has(key)) {
          changed = true;
          break;
        }
      }
    }
    nonMatchWarningPathsRef.current = nextPaths;

    let touchedAdded = false;
    nextPaths.forEach(path => {
      if (!warningTouchedRef.current.has(path)) {
        warningTouchedRef.current.add(path);
        touchedAdded = true;
      }
    });

    if (!changed && !touchedAdded) return;
    if (!warningTouchedRef.current.size) return;
    try {
      const warnings = collectValidationWarnings({
        definition,
        language,
        values,
        lineItems: warningLineItems,
        phase: 'submit',
        uiView: 'edit'
      });
      const touched = warningTouchedRef.current;
      const byField: Record<string, string[]> = {};
      Object.keys(warnings.byField || {}).forEach(k => {
        if (touched.has(k)) byField[k] = (warnings.byField as any)[k];
      });
      setValidationWarnings({ top: warnings.top || [], byField });
      logEvent('optionFilter.nonMatch.warning.auto', {
        nonMatchCount: nextPaths.size,
        touchedAdded,
        touchedCount: touched.size
      });
    } catch (err: any) {
      logEvent('optionFilter.nonMatch.warning.auto.failed', { message: err?.message || err || 'unknown' });
    }
  }, [definition, lineItems, values, view, language, logEvent]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    selectedRecordIdRef.current = selectedRecordId;
  }, [selectedRecordId]);
  useEffect(() => {
    selectedRecordSnapshotRef.current = selectedRecordSnapshot;
  }, [selectedRecordSnapshot]);
  useEffect(() => {
    lastSubmissionMetaRef.current = lastSubmissionMeta;
  }, [lastSubmissionMeta]);
  useEffect(() => {
    recordLoadingIdRef.current = recordLoadingId;
  }, [recordLoadingId]);
  useEffect(() => {
    activeGuidedStepIdRef.current = (guidedUiState?.activeStepId || '').toString().trim();
  }, [guidedUiState?.activeStepId]);

  const resolvedRecordFreshness = useMemo(
    () => resolveRecordFreshnessConfig((definition as any)?.recordFreshness),
    [definition]
  );
  const resolvedDataSourceFreshnessWatches = useMemo(
    () => resolveDataSourceFreshnessWatches((definition as any)?.recordFreshness),
    [definition]
  );

  useEffect(() => {
    recordFreshnessConfigRef.current = resolvedRecordFreshness;
  }, [resolvedRecordFreshness]);
  useEffect(() => {
    dataSourceFreshnessWatchesRef.current = resolvedDataSourceFreshnessWatches;
  }, [resolvedDataSourceFreshnessWatches]);
  useEffect(() => {
    dataSourceFreshnessSignatureBaselineByKeyRef.current = {};
    scheduleDataSourceFreshnessCheck('stateChange');
  }, [guidedUiState?.activeStepId, recordLoadingId, resolvedDataSourceFreshnessWatches, scheduleDataSourceFreshnessCheck, selectedRecordId, view]);

  const bumpRecordSession = useCallback(
    (args: { reason: string; nextRecordId?: string | null }) => {
      const nextSession = recordSessionRef.current + 1;
      recordSessionRef.current = nextSession;
      setRecordSessionKey(nextSession);
      // Cancel any pending autosave timers/queues from the previous record session.
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      utilisationSyncPromiseRef.current = null;
      utilisationSyncMetaRef.current = null;
      utilisationManagedScopesRef.current = null;
      guidedStepImmediateSyncPromiseRef.current = null;
      guidedStepImmediateSyncPendingRef.current = null;
      guidedStepImmediateSyncActiveFingerprintRef.current = '';
      guidedStepImmediateSyncPendingFingerprintRef.current = '';
      pendingDeferredRecordFreshnessSyncRef.current = null;
      dataSourceFreshnessCheckPromiseRef.current = null;
      lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current = {};
      dataSourceFreshnessSignatureBaselineByKeyRef.current = {};
      lastDraftSaveFailureRef.current = null;
      optimisticClientDataVersionRef.current = null;
      recordSyncPromiseRef.current = null;
      recordFreshnessCheckPromiseRef.current = null;
      lastLocalRecordMutationAtRef.current = 0;
      lastExternalRecordSyncAtRef.current = 0;
      setGuidedExternalSyncSignal(null);
      lastRecordServerActivityAtRef.current = args?.nextRecordId ? Date.now() : 0;
      if (dataSourceFreshnessTimerRef.current) {
        globalThis.clearTimeout(dataSourceFreshnessTimerRef.current);
        dataSourceFreshnessTimerRef.current = null;
      }
      if (recordFreshnessTimerRef.current) {
        globalThis.clearTimeout(recordFreshnessTimerRef.current);
        recordFreshnessTimerRef.current = null;
      }
      recordSyncBusy.forceUnlock();
      logEvent('record.session.bump', {
        reason: (args?.reason || '').toString() || null,
        nextRecordId: args?.nextRecordId ? args.nextRecordId.toString() : null,
        session: recordSessionRef.current
      });
    },
    [logEvent, recordSyncBusy]
  );

  // Arm autosave for create-flow ONLY after the user actually changes a field value.
  // (We intentionally do NOT arm autosave when values are populated by defaultValue/derivedValue/createRecordPreset.)
  useEffect(() => {
    const isFormTarget = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      if (target.closest('[data-field-path]')) return true;
      const root = target.closest('.ck-form-sections') || target.closest('.webform-overlay') || target.closest('.form-card');
      return Boolean(root);
    };

    const onFieldChange = (e: Event) => {
      try {
        if (viewRef.current !== 'form') return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const tag = ((target as any).tagName || '').toString().toLowerCase();
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
        const fieldPath = (target.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath;
        if (!fieldPath) return;
        lastUserInteractionRef.current = Date.now();
        if (!createFlowRef.current) return;
        if (!createFlowUserEditedRef.current) {
          createFlowUserEditedRef.current = true;
          logEvent('autosave.armed.userEdit', { fieldPath });
        }
        if (!autoSaveUserEditedRef.current) {
          autoSaveUserEditedRef.current = true;
        }

        // Dedup checks run once dedup keys are complete; no extra handling here.
      } catch {
        // ignore
      }
    };

    const onFieldInteract = (e: Event) => {
      try {
        if (viewRef.current !== 'form') return;
        const target = e.target as HTMLElement | null;
        if (!isFormTarget(target)) return;
        lastUserInteractionRef.current = Date.now();
      } catch {
        // ignore
      }
    };

    document.addEventListener('input', onFieldChange, true);
    document.addEventListener('change', onFieldChange, true);
    document.addEventListener('pointerdown', onFieldInteract, true);
    document.addEventListener('keydown', onFieldInteract, true);
    return () => {
      document.removeEventListener('input', onFieldChange, true);
      document.removeEventListener('change', onFieldChange, true);
      document.removeEventListener('pointerdown', onFieldInteract, true);
      document.removeEventListener('keydown', onFieldInteract, true);
    };
  }, [logEvent]);

  const homeListCacheVersion = useMemo(() => resolveGlobalCacheVersion(), []);
  const persistPastRecordSnapshot = useCallback(
    (record: WebFormSubmission | null | undefined, source: string) => {
      if (!record) return;
      writeCachedRecordSnapshot({
        definition,
        formKey,
        record,
        cacheVersion: homeListCacheVersion,
        onDiagnostic: logEvent,
        source
      });
    },
    [definition, formKey, homeListCacheVersion, logEvent]
  );
  const persistPastRecordSnapshots = useCallback(
    (records: Record<string, WebFormSubmission> | null | undefined, source: string) => {
      if (!records || !Object.keys(records).length) return;
      writeCachedRecordSnapshots({
        definition,
        formKey,
        records,
        cacheVersion: homeListCacheVersion,
        onDiagnostic: logEvent,
        source
      });
    },
    [definition, formKey, homeListCacheVersion, logEvent]
  );
  const homeListLocalCacheKey = useMemo(
    () => buildHomeListLocalCacheKey(formKey, definition.listView, homeListCacheVersion),
    [definition.listView, formKey, homeListCacheVersion]
  );
  const initialHomeListCache = useMemo(() => readHomeListLocalCache(homeListLocalCacheKey), [homeListLocalCacheKey]);
  const rawInitialHomeListResponse = initialHomeListCache?.response || null;
  const initialHomeListResponse = useMemo(
    () => annotateListResponseWithInitialDateFilter(rawInitialHomeListResponse, definition.listView),
    [definition.listView, rawInitialHomeListResponse]
  );
  const initialHomeListSource = useMemo<'bootstrap' | 'localStorage' | 'none'>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    if (bootstrap?.listResponse) return 'bootstrap';
    if (initialHomeListCache?.response) return 'localStorage';
    return 'none';
  }, [initialHomeListCache]);

  const [homeRev, setHomeRev] = useState<number | null>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const bootstrapRev = Number((bootstrap as any)?.homeRev);
    if (Number.isFinite(bootstrapRev) && bootstrapRev >= 0) return bootstrapRev;
    const cachedRev = Number((initialHomeListCache as any)?.homeRev);
    return Number.isFinite(cachedRev) && cachedRev >= 0 ? cachedRev : null;
  });
  const homeRevRef = useRef<number | null>(homeRev);
  useEffect(() => {
    homeRevRef.current = homeRev;
  }, [homeRev]);

  const [listCache, setListCache] = useState<{ response: ListResponse | null; records: Record<string, WebFormSubmission> }>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const response = annotateListResponseWithInitialDateFilter(bootstrap?.listResponse || initialHomeListResponse || null, definition.listView);
    const records = bootstrap?.records || {};
    return { response, records };
  });
  const attachGeneratedSubmitEffectRecordsToActiveDraft = useCallback(
    (records: ReturnType<typeof getGeneratedRecordsFromFollowupResult>, reason: string): boolean => {
      const nextValues = mergeGeneratedSubmitEffectRecordsIntoValues(valuesRef.current || {}, records);
      if (nextValues === valuesRef.current) return false;
      valuesRef.current = nextValues;
      setValues(nextValues);
      setPrefetchedSummaryHtml(null);

      const activeRecordId =
        selectedRecordIdRef.current ||
        selectedRecordSnapshotRef.current?.id ||
        lastSubmissionMetaRef.current?.id ||
        '';
      const snapshot = selectedRecordSnapshotRef.current;
      if (snapshot?.id && (!activeRecordId || snapshot.id === activeRecordId)) {
        const nextSnapshot = {
          ...snapshot,
          values: {
            ...((snapshot.values || {}) as Record<string, any>),
            [GENERATED_SUBMIT_EFFECT_RECORDS_FIELD]: nextValues[GENERATED_SUBMIT_EFFECT_RECORDS_FIELD]
          }
        };
        selectedRecordSnapshotRef.current = nextSnapshot;
        setSelectedRecordSnapshot(nextSnapshot);
        setListCache(prev => ({
          response: prev.response,
          records: {
            ...prev.records,
            [snapshot.id as string]: nextSnapshot
          }
        }));
      }

      logEvent('summary.generatedSubmitEffects.attached', {
        reason,
        recordId: activeRecordId || null,
        generatedRecords: Array.isArray(records) ? records.length : 0,
        targetFormKeys: Array.from(new Set((records || []).map(record => record.targetFormKey).filter(Boolean)))
      });
      return true;
    },
    [logEvent, setListCache, setPrefetchedSummaryHtml, setSelectedRecordSnapshot, setValues]
  );
  const [preservedListSearchByForm, setPreservedListSearchByForm] = useState<
    Record<string, { inputValue: string; queryValue: string }>
  >({});
  const { openRecordPerfRef, backToHomePerfRef } = useAppNavigationPerf({
    selectedRecordId,
    view,
    firstListItemCount: listCache.response?.items?.length || 0,
    perfMark,
    perfMeasure
  });
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<AnalyticsSnapshot | null>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    return (bootstrap?.analytics || analytics || null) as AnalyticsSnapshot | null;
  });
  const [analyticsSnapshotRev, setAnalyticsSnapshotRev] = useState<number>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const rev = Number((bootstrap as any)?.analyticsRev ?? analyticsRev ?? (analytics as any)?.revision ?? 0);
    return Number.isFinite(rev) && rev >= 0 ? rev : 0;
  });
  const [analyticsRefreshToken, setAnalyticsRefreshToken] = useState(0);
  const [homeAnalyticsRefreshToken, setHomeAnalyticsRefreshToken] = useState(0);
  const analyticsSnapshotRef = useRef<AnalyticsSnapshot | null>(analyticsSnapshot);
  const analyticsSnapshotStaleRef = useRef(false);
  const analyticsRefreshTokenRef = useRef(analyticsRefreshToken);
  const homeAnalyticsRefreshTokenRef = useRef(homeAnalyticsRefreshToken);
  const homeAnalyticsRefreshSatisfiedTokenRef = useRef(0);
  const previousAnalyticsViewRef = useRef<View | null>(null);
  const hasListViewAnalyticsWidgets = useMemo(() => {
    const widgets = Array.isArray(definition.analytics?.widgets) ? definition.analytics.widgets : [];
    return widgets.some(widget => {
      const placements = Array.isArray(widget?.placements) ? widget.placements : ['analyticsPage'];
      return placements.some(token => (token || '').toString().trim() === 'listView');
    });
  }, [definition.analytics?.widgets]);
  const requestHomeAnalyticsRefresh = useCallback(
    (args: { reason: string; previousView?: View | null; recordId?: string | null }) => {
      if (!hasListViewAnalyticsWidgets) return;
      setHomeAnalyticsRefreshToken(prev => {
        const next = prev + 1;
        homeAnalyticsRefreshTokenRef.current = next;
        logEvent('analytics.listView.refreshRequested', {
          reason: args.reason,
          previousView: args.previousView || null,
          recordId: args.recordId || null,
          token: next
        });
        return next;
      });
    },
    [hasListViewAnalyticsWidgets, logEvent]
  );
  const applyLiveAnalyticsRecordDelta = useCallback(
    (args: {
      previousRecord?: WebFormSubmission | null;
      nextRecord?: WebFormSubmission | null;
      reason: string;
      recordId?: string | null;
    }) => {
      if (!hasListViewAnalyticsWidgets) return;
      const result = applyRecordDeltaToAnalyticsSnapshot({
        snapshot: analyticsSnapshotRef.current,
        widgets: definition.analytics?.widgets,
        previousRecord: args.previousRecord,
        nextRecord: args.nextRecord
      });
      if (!result.changed) return;
      analyticsSnapshotRef.current = result.snapshot;
      setAnalyticsSnapshot(result.snapshot);
      setAnalyticsSnapshotRev(prev => Math.max(prev + 1, Number(result.snapshot?.revision || 0) || 0));
      logEvent('analytics.listView.localDelta', {
        reason: args.reason,
        recordId: args.recordId || args.nextRecord?.id || args.previousRecord?.id || null,
        widgetIds: result.changedWidgetIds
      });
    },
    [definition.analytics?.widgets, hasListViewAnalyticsWidgets, logEvent]
  );
  const markAnalyticsSnapshotStale = useCallback(
    (args: { reason: string; recordId?: string | null; status?: string | null }) => {
      if (!hasListViewAnalyticsWidgets) return;
      analyticsSnapshotStaleRef.current = true;
      setAnalyticsRefreshToken(prev => {
        const next = prev + 1;
        analyticsRefreshTokenRef.current = next;
        return next;
      });
      logEvent('analytics.listView.stale', {
        reason: args.reason,
        recordId: args.recordId || null,
        status: args.status || null
      });
    },
    [hasListViewAnalyticsWidgets, logEvent]
  );
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const preservedListSearchState = preservedListSearchByForm[formKey] || null;
  const handlePreservedListSearchStateChange = useCallback(
    (state: { inputValue: string; queryValue: string } | null) => {
      setPreservedListSearchByForm(prev => {
        const next = { ...prev };
        if (!state || (!state.inputValue.trim() && !state.queryValue.trim())) {
          delete next[formKey];
          return next;
        }
        next[formKey] = {
          inputValue: state.inputValue,
          queryValue: state.queryValue
        };
        return next;
      });
    },
    [formKey]
  );
  const requestListRefresh = useCallback((opts?: { clearResponse?: boolean }) => {
    // Keep any already-hydrated record snapshots (from bootstrap and/or recent selections) so navigating
    // back to the list does not reintroduce slow record fetches.
    setListCache(prev => ({ response: opts?.clearResponse ? null : prev.response, records: prev.records }));
    setListRefreshToken(token => token + 1);
  }, []);

  const [listFetch, setListFetch] = useState<{
    phase: 'idle' | 'loading' | 'prefetching' | 'error';
    message?: string;
    loaded?: number;
    total?: number;
    pages?: number;
  }>(() => ({ phase: 'idle' }));
  const [listFetchNotice, setListFetchNotice] = useState<string | null>(null);
  const listCacheRef = useRef(listCache);
  const listFetchSeqRef = useRef(0);
  const listPrefetchKeyRef = useRef<string>('');
  const listBackgroundPrefetchKeyRef = useRef<string>('');
  const listRecordsRef = useRef<Record<string, WebFormSubmission>>({});
  const dataSourcePrefetchKeyRef = useRef<string>('');
  const formDataSourceRefreshKeyRef = useRef<string>('');
  const listRecordSnapshotPrefetchKeyRef = useRef<string>('');
  const listRecordSnapshotPrefetchByRowRef = useRef<Map<number, RecordSnapshotPrefetchRequest>>(new Map());
  const deferredAnalyticsPrefetchKeyRef = useRef<string>('');
  const guidedDataSourceRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const followupLaunchDataSourcePrefetchHoldRef = useRef(0);
  const [, setDataSourceVisibilityVersion] = useState(0);
  const guidedDataSourceConfigs = useMemo(() => collectDataSourceConfigsForPrefetch(definition), [definition]);
  const formOpenGuidedDataSourceConfigs = useMemo(
    () =>
      filterFormOpenPrefetchDataSources({
        configs: guidedDataSourceConfigs,
        freshnessWatches: resolvedDataSourceFreshnessWatches
      }),
    [guidedDataSourceConfigs, resolvedDataSourceFreshnessWatches]
  );
  const guidedDataSourceConfigMap = useMemo(() => {
    return buildDataSourceConfigLookup(guidedDataSourceConfigs);
  }, [guidedDataSourceConfigs]);

  useEffect(() => {
    const bump = () => setDataSourceVisibilityVersion(version => version + 1);
    const handleUpdated = (event: Event) => {
      bump();
      const dataSourceId = (((event as CustomEvent)?.detail || {}) as any)?.id?.toString?.().trim?.() || '';
      if (!dataSourceId) return;
      let removedOptionKeys: string[] = [];
      setOptionState(prev => {
        const pruned = pruneOptionStateForDataSource({ definition, state: prev, dataSourceId });
        removedOptionKeys = pruned.removedKeys;
        return pruned.state;
      });
      setTooltipState(prev => pruneOptionStateForDataSource({ definition, state: prev, dataSourceId }).state);
      if (removedOptionKeys.length) {
        logEvent('options.cacheSync.pruned', {
          dataSourceId,
          removedKeys: removedOptionKeys
        });
      }
    };
    const handleCleared = (event: Event) => {
      bump();
      if (!shouldClearOptionStateAfterDataSourceCacheClear(event)) {
        logEvent('options.cacheSync.preserved', {
          reason: 'dataSource.cache.memoryOnlyClear'
        });
        return;
      }
      setOptionState({});
      setTooltipState({});
      logEvent('options.cacheSync.cleared');
    };
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleUpdated as EventListener);
      window.addEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCleared as EventListener);
      return () => {
        window.removeEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleUpdated as EventListener);
        window.removeEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCleared as EventListener);
      };
    } catch {
      return;
    }
  }, [definition, logEvent]);

  useEffect(() => {
    return () => {
      guidedDataSourceRefreshTimersRef.current.forEach(timer => clearTimeout(timer));
      guidedDataSourceRefreshTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (initialHomeListSource !== 'localStorage') return;
    logEvent('list.cache.hydrate.localStorage', {
      formKey,
      key: homeListLocalCacheKey || null,
      itemCount: initialHomeListResponse?.items?.length || 0,
      totalCount: initialHomeListResponse?.totalCount || 0,
      hasEtag: Boolean((initialHomeListResponse?.etag || '').toString().trim()),
      homeRev: homeRevRef.current
    });
  }, [formKey, homeListLocalCacheKey, initialHomeListResponse, initialHomeListSource, logEvent]);

  useEffect(() => {
    if (!homePerfInitialisedRef.current) {
      homePerfInitialisedRef.current = true;
      homeTimeToDataMeasuredRef.current = false;
      perfMark(`ck.home.timeToData.start.${formKey}.${language}`);
      return;
    }
    homeLoadStartedAtRef.current = getPerfNow();
    homeTimeToDataMeasuredRef.current = false;
    perfMark(`ck.home.timeToData.start.${formKey}.${language}`);
  }, [formKey, language, perfMark]);

  useEffect(() => {
    listRecordsRef.current = listCache.records || {};
  }, [listCache.records]);
  useEffect(() => {
    listCacheRef.current = listCache;
  }, [listCache]);
  useEffect(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const nextSnapshot = (bootstrap?.analytics || analytics || null) as AnalyticsSnapshot | null;
    analyticsSnapshotRef.current = nextSnapshot;
    setAnalyticsSnapshot(nextSnapshot);
  }, [analytics, formKey]);
  useEffect(() => {
    analyticsSnapshotRef.current = analyticsSnapshot;
  }, [analyticsSnapshot]);
  useEffect(() => {
    analyticsRefreshTokenRef.current = analyticsRefreshToken;
  }, [analyticsRefreshToken]);
  useEffect(() => {
    homeAnalyticsRefreshTokenRef.current = homeAnalyticsRefreshToken;
  }, [homeAnalyticsRefreshToken]);
  const applyHomeBootstrapAnalytics = useCallback(
    (args: { response: any; reason: string }): boolean => {
      if (!hasListViewAnalyticsWidgets) return false;
      const snapshot = ((args.response as any)?.analytics || null) as AnalyticsSnapshot | null;
      if (!snapshot || !Array.isArray(snapshot.items)) return false;
      analyticsSnapshotRef.current = snapshot;
      analyticsSnapshotStaleRef.current = false;
      homeAnalyticsRefreshSatisfiedTokenRef.current = homeAnalyticsRefreshTokenRef.current;
      setAnalyticsSnapshot(snapshot);
      const nextRev = Number((args.response as any)?.analyticsRev ?? snapshot.revision ?? 0);
      setAnalyticsSnapshotRev(Number.isFinite(nextRev) && nextRev >= 0 ? nextRev : 0);
      logEvent('analytics.listView.bootstrap.applied', {
        reason: args.reason,
        itemCount: snapshot.items.length,
        revision: Number.isFinite(nextRev) ? nextRev : null,
        cache: (args.response as any)?.cache || null,
        homeRefreshToken: homeAnalyticsRefreshTokenRef.current
      });
      return true;
    },
    [hasListViewAnalyticsWidgets, logEvent]
  );
  useEffect(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const rev = Number((bootstrap as any)?.analyticsRev ?? analyticsRev ?? (analytics as any)?.revision ?? 0);
    setAnalyticsSnapshotRev(Number.isFinite(rev) && rev >= 0 ? rev : 0);
  }, [analytics, analyticsRev, formKey]);

  useEffect(() => {
    const previous = previousAnalyticsViewRef.current;
    previousAnalyticsViewRef.current = view;
    if (view !== 'list') return;
    const snapshotItemCount = Array.isArray(analyticsSnapshotRef.current?.items)
      ? analyticsSnapshotRef.current.items.length
      : 0;
    const stale = analyticsSnapshotStaleRef.current;
    if (
      !shouldRequestHomeAnalyticsRefreshOnListEnter({
        hasListViewAnalyticsWidgets,
        previousView: previous,
        snapshotItemCount,
        stale
      })
    ) {
      return;
    }
    requestHomeAnalyticsRefresh({
      reason: previous ? 'returnHome' : 'initialHome',
      previousView: previous || null
    });
  }, [hasListViewAnalyticsWidgets, requestHomeAnalyticsRefresh, view]);

  useEffect(() => {
    const response = listCache.response;
    if (!homeListLocalCacheKey || !response || !Array.isArray(response.items)) return;
    if (!response.items.length) return;
    if (response.nextPageToken) return;
    writeHomeListLocalCache(homeListLocalCacheKey, response, homeRevRef.current);
  }, [homeListLocalCacheKey, listCache.response]);

  useEffect(() => {
    if (homeTimeToDataMeasuredRef.current) return;
    const response = listCache.response;
    if (!hasLoadedListResponse(response)) return;
    const firstCount = response.items.length;
    homeTimeToDataMeasuredRef.current = true;
    const measuredAtMs = getPerfNow();
    setHomeFirstDataReadyAtMs(prev => (prev > 0 ? prev : Date.now()));
    const startMark = `ck.home.timeToData.start.${formKey}.${language}`;
    const endMark = `ck.home.timeToData.end.${formKey}.${language}`;
    perfMark(endMark);
    perfMeasure('ck.home.timeToData', startMark, endMark, {
      formKey,
      language,
      elapsedMs: measuredAtMs - homeLoadStartedAtRef.current,
      firstItemCount: firstCount
    });
  }, [formKey, language, listCache.response, perfMark, perfMeasure]);

  useEffect(() => {
    if (view !== 'list') return;
    if (homeFirstDataReadyAtMs <= 0) return;
    const snapshotItemCount = Array.isArray(analyticsSnapshot?.items) ? analyticsSnapshot.items.length : 0;
    const stale = analyticsSnapshotStaleRef.current;
    const refreshRequested =
      homeAnalyticsRefreshToken > 0 &&
      homeAnalyticsRefreshSatisfiedTokenRef.current < homeAnalyticsRefreshToken;
    if (!shouldPrefetchDeferredAnalytics({ hasListViewAnalyticsWidgets, snapshotItemCount, refreshRequested, stale })) return;
    const refreshTokenAtStart = analyticsRefreshToken;
    const key = `${formKey}::${homeRevRef.current ?? 'novrev'}::${refreshTokenAtStart}::home${homeAnalyticsRefreshToken}::${stale ? 'stale' : refreshRequested ? 'home' : 'missing'}`;
    if (!reserveDeferredAnalyticsPrefetchKey(deferredAnalyticsPrefetchKeyRef, key)) return;

    let cancelled = false;
    let settled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleHandle: number | null = null;
    const run = () => {
      if (cancelled) return;
      const startedAt = Date.now();
      logEvent('analytics.listView.prefetch.start', {
        formKey,
        refreshRequested,
        homeRefreshToken: homeAnalyticsRefreshToken,
        startedAfterHomeDataMs: Math.max(0, Date.now() - homeFirstDataReadyAtMs)
      });
      fetchHomeBootstrapApi(formKey, null)
        .then(res => {
          settled = true;
          if (cancelled) {
            releaseDeferredAnalyticsPrefetchKey(deferredAnalyticsPrefetchKeyRef, key);
            return;
          }
          const pendingFollowupCount = pendingFollowupBatchPromisesRef.current.size;
          if (pendingFollowupCount > 0) {
            analyticsSnapshotStaleRef.current = true;
            releaseDeferredAnalyticsPrefetchKey(deferredAnalyticsPrefetchKeyRef, key);
            logEvent('analytics.listView.prefetch.deferredPendingFollowup', {
              formKey,
              refreshRequested,
              homeRefreshToken: homeAnalyticsRefreshToken,
              pendingFollowupCount,
              durationMs: Date.now() - startedAt
            });
            return;
          }
          if (analyticsRefreshTokenRef.current === refreshTokenAtStart) {
            analyticsSnapshotStaleRef.current = false;
          }
          const revRaw = Number((res as any)?.rev);
          if (Number.isFinite(revRaw) && revRaw >= 0) {
            setHomeRev(prev => (prev === revRaw ? prev : revRaw));
          }
          const homeList = (() => {
            const maybeList = (res as any)?.listResponse;
            return maybeList && Array.isArray((maybeList as any).items)
              ? annotateListResponseWithInitialDateFilter(maybeList as ListResponse, definition.listView)
              : null;
          })();
          if (homeList) {
            const records = ((res as any)?.records || {}) as Record<string, WebFormSubmission>;
            setListCache(prev => ({
              response: homeList,
              records: mergeListRecordSnapshotCache(prev.records, records)
            }));
          }
          const snapshot = ((res as any)?.analytics || null) as AnalyticsSnapshot | null;
          applyHomeBootstrapAnalytics({ response: res, reason: 'analytics.listView.prefetch' });
          logEvent('analytics.listView.prefetch.ok', {
            formKey,
            refreshRequested,
            homeRefreshToken: homeAnalyticsRefreshToken,
            itemCount: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
            homeItemCount: Array.isArray(homeList?.items) ? homeList.items.length : null,
            cache: (res as any)?.cache || null,
            durationMs: Date.now() - startedAt
          });
        })
        .catch((err: any) => {
          settled = true;
          releaseDeferredAnalyticsPrefetchKey(deferredAnalyticsPrefetchKeyRef, key);
          if (cancelled) return;
          logEvent('analytics.listView.prefetch.error', {
            formKey,
            message: err?.message || err?.toString?.() || 'unknown',
            durationMs: Date.now() - startedAt
          });
        });
    };

    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(run, { timeout: HOME_ANALYTICS_PREFETCH_DELAY_MS + 1200 }) as number;
      } else {
        timer = globalThis.setTimeout(run, HOME_ANALYTICS_PREFETCH_DELAY_MS);
      }
    } catch {
      timer = globalThis.setTimeout(run, HOME_ANALYTICS_PREFETCH_DELAY_MS);
    }

    return () => {
      cancelled = true;
      if (!settled) {
        releaseDeferredAnalyticsPrefetchKey(deferredAnalyticsPrefetchKeyRef, key);
      }
      if (timer !== null) globalThis.clearTimeout(timer);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [
    analyticsRefreshToken,
    analyticsSnapshot,
    applyHomeBootstrapAnalytics,
    definition.listView,
    formKey,
    hasListViewAnalyticsWidgets,
    homeAnalyticsRefreshToken,
    homeFirstDataReadyAtMs,
    logEvent,
    view
  ]);

  useEffect(() => {
    if (pendingDeletedRecordApplyTick <= 0) return;
    const ids = Array.from(new Set((pendingDeletedRecordIdsRef.current || []).map(id => (id || '').toString().trim()).filter(Boolean)));
    pendingDeletedRecordIdsRef.current = [];
    if (!ids.length) return;
    setListCache(prev =>
      ids.reduce(
        (state, recordId) =>
          removeListCacheRowPure({
            prev: state,
            remove: { recordId }
          }),
        prev
      )
    );
    clearDateSearchLocalCacheFamily({ formKey, listView: definition.listView });
    logEvent('list.cache.remove.deletedRecord', { recordIds: ids, count: ids.length });
  }, [definition.listView, formKey, logEvent, pendingDeletedRecordApplyTick]);

  useEffect(() => {
    if (homeFirstDataReadyAtMs <= 0) return;
    const response = listCache.response;
    if (!hasLoadedListResponse(response)) return;
    const firstListItemCount = response.items.length;
    const key = `${formKey}::${language}`;
    if (dataSourcePrefetchKeyRef.current === key) return;
    const configs = collectDataSourceConfigsForPrefetch(definition).filter(isHomePrefetchEligibleDataSource);
    if (!configs.length) return;
    const startedAt = Date.now();
    const timer = globalThis.setTimeout(() => {
      if (dataSourcePrefetchKeyRef.current === key) return;
      dataSourcePrefetchKeyRef.current = key;
      logEvent('dataSource.prefetch.start', {
        formKey,
        language,
        firstListItemCount,
        dataSources: configs.length
      });
      void prefetchDataSources(configs, language, { forceRefresh: false })
        .then(res => {
          logEvent('dataSource.prefetch.done', {
            formKey,
            language,
            requested: res.requested,
            succeeded: res.succeeded,
            failed: res.failed,
            durationMs: Date.now() - startedAt
          });
        })
        .catch((err: any) => {
          logEvent('dataSource.prefetch.error', {
            formKey,
            language,
            message: err?.message || err?.toString?.() || 'unknown',
            durationMs: Date.now() - startedAt
          });
        });
    }, HOME_DATA_SOURCE_PREFETCH_DELAY_MS);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [definition, formKey, homeFirstDataReadyAtMs, language, listCache.response, logEvent]);

  useEffect(() => {
    if (!hasTemplateRenderTargets) return;
    if (view !== 'list') return;
    if (homeFirstDataReadyAtMs <= 0) return;
    const items = (listCache.response?.items || []) as ListItem[];
    if (!items.length) return;

    const topCount = Math.min(8, items.length);
    const topRows = items.slice(0, topCount);
    const missingTopRows = topRows.filter(row => {
      const id = ((row as any)?.id || '').toString().trim();
      return !!id && !listRecordsRef.current[id];
    });
    const recordsFromLocalCache: Record<string, WebFormSubmission> = {};
    missingTopRows.forEach(row => {
      const id = ((row as any)?.id || '').toString().trim();
      if (!id) return;
      const cached = readCachedRecordSnapshot({
        definition,
        formKey,
        recordId: id,
        cacheVersion: homeListCacheVersion,
        onDiagnostic: logEvent,
        source: 'list.records.prefetch'
      });
      if (cached) recordsFromLocalCache[id] = cached;
    });
    const localCacheRecordCount = Object.keys(recordsFromLocalCache).length;
    const rowsNeedingServerPrefetch = localCacheRecordCount
      ? missingTopRows.filter(row => {
          const id = ((row as any)?.id || '').toString().trim();
          return !id || !recordsFromLocalCache[id];
        })
      : missingTopRows;
    if (localCacheRecordCount > 0) {
      setListCache(prev => ({
        response: prev.response,
        records: mergeListRecordSnapshotCache(prev.records, recordsFromLocalCache)
      }));
      logEvent('list.records.prefetch.localCache.hit', {
        formKey,
        topCount,
        requested: missingTopRows.length,
        records: localCacheRecordCount
      });
    }

    const etag = (listCache.response?.etag || '').toString().trim();
    const key = `${formKey}::${etag || `rows:${items.length}`}::top:${topCount}`;
    if (listRecordSnapshotPrefetchKeyRef.current === key) return;
    listRecordSnapshotPrefetchKeyRef.current = key;

    if (!rowsNeedingServerPrefetch.length) {
      logEvent('list.records.prefetch.skip', {
        formKey,
        topCount,
        reason: localCacheRecordCount > 0 ? 'localStorageCached' : 'alreadyCached',
        etag: etag || null
      });
      return;
    }

    const rowHints = Array.from(
      new Set(
        rowsNeedingServerPrefetch
          .map(row => Number((row as any)?.__rowNumber))
          .filter(v => Number.isFinite(v) && v >= 2)
          .map(v => Math.floor(v))
      )
    );
    if (!rowHints.length) {
      logEvent('list.records.prefetch.skip', {
        formKey,
        topCount,
        missingCount: rowsNeedingServerPrefetch.length,
        reason: 'missingRowHints',
        etag: etag || null
      });
      return;
    }

    let cancelled = false;
    let prefetchTimerHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    const runPrefetch = async () => {
      if (cancelled || !rowHints.length) return;
      const startedAt = Date.now();
      const metricName = 'ck.list.records.prefetch.rpc';
      const startMark = `${metricName}.start.${startedAt}`;
      const endMark = `${metricName}.end.${startedAt}`;
      logEvent('list.records.prefetch.start', {
        formKey,
        phase: 'batch',
        topCount,
        missingCount: rowsNeedingServerPrefetch.length,
        localCacheRecords: localCacheRecordCount,
        rowHintCount: rowHints.length,
        etag: etag || null
      });
      perfMark(startMark);
      let requestPromise: Promise<Record<string, WebFormSubmission>> | undefined;
      try {
        // Fetch by row numbers so we avoid re-running expensive sorted list assembly.
        requestPromise = fetchRecordsByRowNumbers(formKey, rowHints);
        const activeRequest: RecordSnapshotPrefetchRequest = {
          promise: requestPromise,
          source: 'homeList',
          startedAt,
          rowNumbers: rowHints
        };
        rowHints.forEach(rowNumber => {
          listRecordSnapshotPrefetchByRowRef.current.set(rowNumber, activeRequest);
        });
        const prefetchedRecords = await activeRequest.promise;
        if (cancelled) return;
        perfMark(endMark);
        const receivedIds = prefetchedRecords ? Object.keys(prefetchedRecords) : [];
        if (receivedIds.length) {
          persistPastRecordSnapshots(prefetchedRecords, 'list.records.prefetch');
          setListCache(prev => ({
            response: prev.response,
            records: mergeListRecordSnapshotCache(prev.records, prefetchedRecords)
          }));
        }
        perfMeasure(metricName, startMark, endMark, {
          formKey,
          phase: 'batch',
          requested: topCount,
          requestedRows: rowHints.length,
          missing: rowsNeedingServerPrefetch.length,
          received: receivedIds.length
        });
        logEvent('list.records.prefetch.ok', {
          formKey,
          phase: 'batch',
          requested: topCount,
          requestedRows: rowHints.length,
          missing: rowsNeedingServerPrefetch.length,
          localCacheRecords: localCacheRecordCount,
          received: receivedIds.length,
          durationMs: Date.now() - startedAt
        });
      } catch (err: any) {
        perfMark(endMark);
        perfMeasure(metricName, startMark, endMark, {
          formKey,
          phase: 'batch',
          requested: topCount,
          requestedRows: rowHints.length,
          missing: rowsNeedingServerPrefetch.length,
          failed: true
        });
        const msg = (err?.message || err?.toString?.() || 'failed').toString();
        logEvent('list.records.prefetch.error', {
          formKey,
          phase: 'batch',
          requested: topCount,
          requestedRows: rowHints.length,
          missing: rowsNeedingServerPrefetch.length,
          message: msg,
          durationMs: Date.now() - startedAt
        });
      } finally {
        rowHints.forEach(rowNumber => {
          const inFlight = listRecordSnapshotPrefetchByRowRef.current.get(rowNumber);
          if (requestPromise && inFlight?.promise === requestPromise) {
            listRecordSnapshotPrefetchByRowRef.current.delete(rowNumber);
          }
        });
      }
    };

    prefetchTimerHandle = globalThis.setTimeout(() => {
      prefetchTimerHandle = null;
      void runPrefetch();
    }, HOME_RECORD_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      if (prefetchTimerHandle !== null) globalThis.clearTimeout(prefetchTimerHandle);
    };
  }, [
    formKey,
    hasTemplateRenderTargets,
    homeFirstDataReadyAtMs,
    definition,
    homeListCacheVersion,
    listCache.response?.etag,
    listCache.response?.items,
    perfMark,
    perfMeasure,
    persistPastRecordSnapshots,
    view,
    logEvent
  ]);

  const listViewProjection = useMemo(() => {
    const cols = (definition.listView?.columns || []) as any[];
    const meta = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
    const ids = new Set<string>();
    const add = (fid: string) => {
      const id = (fid || '').toString().trim();
      if (!id || meta.has(id)) return;
      ids.add(id);
    };
    cols.forEach(col => {
      const fid = (col as any)?.fieldId;
      if (!fid) return;
      if ((col as any)?.type === 'rule') {
        collectListViewRuleColumnDependencies(col as any).forEach(add);
        return;
      }
      add(fid);
    });
    const listSearchMode = (definition.listView?.search?.mode || 'text') as 'text' | 'date' | 'advanced';
    const dateSearchFieldId = ((definition.listView?.search as any)?.dateFieldId || '').toString().trim();
    if (listSearchMode === 'date' && dateSearchFieldId) {
      add(dateSearchFieldId);
    }
    if (listSearchMode === 'advanced') {
      const fieldsRaw = (definition.listView?.search as any)?.fields;
      const fields: string[] = (() => {
        if (fieldsRaw === undefined || fieldsRaw === null) return [];
        if (Array.isArray(fieldsRaw)) return fieldsRaw.map(v => (v === undefined || v === null ? '' : `${v}`.trim())).filter(Boolean);
        const str = `${fieldsRaw}`.trim();
        if (!str) return [];
        return str
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      })();
      fields.forEach(add);
    }
    collectListViewMetricDependencies(definition.listView?.metric).forEach(add);
    return Array.from(ids);
  }, [definition.listView]);

  const listViewSearchMode = (definition.listView?.search?.mode || 'text') as 'text' | 'date' | 'advanced';
  const listViewDateSearchFieldId = ((definition.listView?.search as any)?.dateFieldId || '').toString().trim();
  const listViewInitialDateSearchValue = useMemo(
    () => (listViewSearchMode === 'date' ? resolveInitialListSearchValue(definition.listView?.search) : ''),
    [definition.listView?.search, listViewSearchMode]
  );
  const disableListBackgroundPrefetch = listViewSearchMode === 'date';

  useEffect(() => {
    if (!definition.listView) return;
    if (view !== 'list') return;
    const key = `${formKey}::${listRefreshToken}`;
    if (listPrefetchKeyRef.current === key) return;
    listPrefetchKeyRef.current = key;
    const seq = ++listFetchSeqRef.current;
    const startedAt = Date.now();

    const pageSize = Math.max(1, Math.min(definition.listView?.pageSize || 10, 50));
    const sort: ListSort | null =
      definition.listView?.defaultSort?.fieldId || (listViewSearchMode === 'date' && listViewDateSearchFieldId && listViewInitialDateSearchValue)
        ? {
            fieldId: definition.listView?.defaultSort?.fieldId,
            direction: (definition.listView?.defaultSort?.direction || 'desc') as any,
            ...(listViewSearchMode === 'date' && listViewDateSearchFieldId && listViewInitialDateSearchValue
              ? {
                  __dateFieldId: listViewDateSearchFieldId,
                  __dateEquals: listViewInitialDateSearchValue
                }
              : {})
          }
        : null;

    const projection = listViewProjection.length ? listViewProjection : undefined;
    const existingListCache = listCacheRef.current;
    const hasExisting = Boolean(existingListCache.response?.items?.length);
    const existingEtag = (existingListCache.response?.etag || '').toString().trim();
    const canReuseFirstPage = hasExisting && listRefreshToken === 0;
    const skipInitialServerCheck = canReuseFirstPage && initialHomeListSource === 'bootstrap';
    const canUseConditionalFirstPage = canReuseFirstPage && !!existingEtag && !skipInitialServerCheck;

    setListFetchNotice(null);
    setListFetch({
      phase: hasExisting ? 'prefetching' : 'loading',
      loaded: hasExisting ? (existingListCache.response?.items?.length || 0) : 0,
      total: existingListCache.response?.totalCount || undefined,
      pages: 0
    });
    logEvent('list.sorted.prefetch.start', {
      formKey,
      pageSize,
      projectionCount: projection ? projection.length : 0,
      sortField: sort?.fieldId || null,
      sortDirection: sort?.direction || null,
      keepExisting: hasExisting,
      reuseFirstPage: canReuseFirstPage,
      skipInitialServerCheck,
      conditionalEtagCheck: canUseConditionalFirstPage,
      homeRev: homeRevRef.current,
      includePageRecords: false,
      dateSearchMode: listViewSearchMode === 'date',
      dateFilterFieldId: (sort as any)?.__dateFieldId || null,
      dateFilterEquals: (sort as any)?.__dateEquals || null,
      backgroundPrefetchDisabled: disableListBackgroundPrefetch
    });

    let backgroundCancelled = false;
    let backgroundTimerHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    let backgroundIdleHandle: number | null = null;

    void (async () => {
      try {
        const encodePageTokenClient = (offset: number): string => {
          const n = Math.max(0, Math.floor(Number(offset) || 0));
          const text = n.toString();
          try {
            if (typeof globalThis !== 'undefined' && typeof (globalThis as any).btoa === 'function') {
              return (globalThis as any).btoa(text);
            }
          } catch {
            // ignore
          }
          return text;
        };

        const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
        const fetchPage = async (args: {
          token?: string;
          pageIndex: number;
          allowConditional?: boolean;
        }): Promise<{ list: ListResponse; batch: any; token?: string; pageIndex: number; notModified: boolean }> => {
          let batch: any = null;
          if (!args.token && args.pageIndex === 0 && !skipInitialServerCheck) {
            const homeBootstrapStartMark = `ck.home.bootstrap.rpc.start.${seq}.${args.pageIndex}`;
            const homeBootstrapEndMark = `ck.home.bootstrap.rpc.end.${seq}.${args.pageIndex}`;
            perfMark(homeBootstrapStartMark);
            try {
              const prefetchedHomeBootstrap = consumePrefetchedHomeBootstrapApi(formKey);
              const bootstrapRes = prefetchedHomeBootstrap
                ? await prefetchedHomeBootstrap
                : await fetchHomeBootstrapApi(formKey, homeRevRef.current);
              perfMark(homeBootstrapEndMark);
              perfMeasure('ck.home.bootstrap.rpc', homeBootstrapStartMark, homeBootstrapEndMark, {
                formKey,
                pageIndex: args.pageIndex,
                rev: (bootstrapRes as any)?.rev ?? null,
                notModified: Boolean((bootstrapRes as any)?.notModified),
                cache: (bootstrapRes as any)?.cache || null,
                prefetched: Boolean(prefetchedHomeBootstrap)
              });
              if (seq !== listFetchSeqRef.current) {
                return { list: { items: [] } as any, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: false };
              }
              const revRaw = Number((bootstrapRes as any)?.rev);
              if (Number.isFinite(revRaw) && revRaw >= 0) {
                setHomeRev(prev => (prev === revRaw ? prev : revRaw));
              }
              if ((bootstrapRes as any)?.notModified) {
                const notModifiedList: ListResponse = {
                  items: [],
                  totalCount: Number((existingListCache.response as any)?.totalCount || 0),
                  etag: existingEtag,
                  notModified: true
                };
                return { list: notModifiedList, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: true };
              }
              applyHomeBootstrapAnalytics({ response: bootstrapRes, reason: 'list.homeBootstrap' });
              const homeList = (() => {
                const maybeList = (bootstrapRes as any)?.listResponse;
                return maybeList && Array.isArray((maybeList as any).items)
                  ? annotateListResponseWithInitialDateFilter(maybeList as ListResponse, definition.listView)
                  : null;
              })();
              if (homeList) {
                const homeBatch = {
                  list: homeList,
                  records: ((bootstrapRes as any)?.records || {}) as Record<string, WebFormSubmission>
                };
                return {
                  list: homeList,
                  batch: homeBatch,
                  token: args.token,
                  pageIndex: args.pageIndex,
                  notModified: false
                };
              }
            } catch (err: any) {
              perfMark(homeBootstrapEndMark);
              perfMeasure('ck.home.bootstrap.rpc', homeBootstrapStartMark, homeBootstrapEndMark, {
                formKey,
                pageIndex: args.pageIndex,
                failed: true
              });
              logEvent('list.homeBootstrap.error', {
                message: err?.message || err?.toString?.() || 'unknown'
              });
            }
          }
          const maxAttempts = 5;
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const startMark = `ck.list.fetch.rpc.start.${seq}.${args.pageIndex}.${attempt}`;
            const endMark = `ck.list.fetch.rpc.end.${seq}.${args.pageIndex}.${attempt}`;
            perfMark(startMark);
            const requestSort: ListSort | null =
              args.allowConditional && !args.token && args.pageIndex === 0 && canUseConditionalFirstPage
                ? ({
                    ...(sort || {}),
                    __ifNoneMatch: true,
                    __clientEtag: existingEtag
                  } as ListSort)
                : sort;
            batch = await fetchSortedBatch(formKey, projection, pageSize, args.token, false, undefined, requestSort);
            perfMark(endMark);
            perfMeasure('ck.list.fetch.rpc', startMark, endMark, {
              formKey,
              pageIndex: args.pageIndex,
              attempt: attempt + 1,
              pageSize,
              token: args.token || null,
              conditional: Boolean(args.allowConditional && !args.token && args.pageIndex === 0 && canUseConditionalFirstPage)
            });
            if (seq !== listFetchSeqRef.current) {
              return { list: { items: [] } as any, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: false };
            }
            if (batch && typeof batch === 'object') break;
            logEvent('list.sorted.prefetch.retry', {
              attempt: attempt + 1,
              maxAttempts,
              token: args.token || null,
              pageIndex: args.pageIndex,
              resType: batch === null ? 'null' : typeof batch
            });
            if (attempt < maxAttempts - 1) {
              await sleep(Math.min(2000, 250 * Math.pow(2, attempt)));
            }
          }
          if (seq !== listFetchSeqRef.current) {
            return { list: { items: [] } as any, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: false };
          }
          const list = (() => {
            if (batch && typeof batch === 'object') {
              const maybeList = (batch as any).list;
              if (maybeList && Array.isArray((maybeList as any).items)) return maybeList as ListResponse;
              if (Array.isArray((batch as any).items)) return batch as any as ListResponse;
            }
            return null;
          })();
          if (!list || !Array.isArray((list as any).items)) {
            const resType = batch === null ? 'null' : typeof batch;
            const keys = batch && typeof batch === 'object' ? Object.keys(batch as any).slice(0, 15) : [];
            logEvent('list.sorted.prefetch.invalidResponse', { resType, keys, token: args.token || null, pageIndex: args.pageIndex });
            const err: any = new Error(
              'Recent activity is temporarily unavailable. Your data is safe. Please refresh the page or try again in a moment'
            );
            err.__ckUiTone = 'info';
            err.__ckUiKind = 'list_prefetch_unavailable';
            throw err;
          }
          return {
            list,
            batch,
            token: args.token,
            pageIndex: args.pageIndex,
            notModified: Boolean((list as any).notModified)
          };
        };

        const first = (() => {
          if (!skipInitialServerCheck || !existingListCache.response || !Array.isArray((existingListCache.response as any).items)) {
            return null;
          }
          const bootstrapList = {
            ...(existingListCache.response as ListResponse),
            notModified: undefined
          } as ListResponse;
          const bootstrapBatch = {
            list: bootstrapList,
            records: (existingListCache.records || {}) as Record<string, WebFormSubmission>
          };
          logEvent('list.sorted.prefetch.bootstrapReuse', {
            formKey,
            etag: existingEtag || null,
            itemCount: (bootstrapList.items || []).length,
            totalCount: (bootstrapList as any)?.totalCount || 0
          });
          return {
            list: bootstrapList,
            batch: bootstrapBatch,
            token: undefined,
            pageIndex: 0,
            notModified: false
          };
        })() || (await fetchPage({ token: undefined, pageIndex: 0, allowConditional: canUseConditionalFirstPage }));
        if (seq !== listFetchSeqRef.current) return;
        const existingResponseHasPrefetchMeta =
          typeof (existingListCache.response as any)?.contiguousItemCount === 'number' &&
          typeof (existingListCache.response as any)?.completeData === 'boolean';
        if (canReuseFirstPage && first.notModified && existingResponseHasPrefetchMeta) {
          const existingCount = existingListCache.response?.items?.length || 0;
          const existingTotalRaw = Number((existingListCache.response as any)?.totalCount || existingCount);
          const existingTotal =
            Number.isFinite(existingTotalRaw) && existingTotalRaw > 0 ? Math.min(existingTotalRaw, 200) : existingCount;
          setListFetch({
            phase: 'idle',
            loaded: existingCount,
            total: existingTotal || existingCount,
            pages: Math.max(1, Math.ceil(Math.max(existingTotal, existingCount) / pageSize))
          });
          logEvent('list.sorted.prefetch.notModified', {
            formKey,
            etag: existingEtag,
            existingCount,
            total: existingTotal || existingCount,
            durationMs: Date.now() - startedAt
          });
          return;
        }
        if (canReuseFirstPage && first.notModified && existingListCache.response && !existingResponseHasPrefetchMeta) {
          logEvent('list.sorted.prefetch.cacheBackfill', {
            formKey,
            cachedItems: existingListCache.response.items?.length || 0,
            totalCount: (existingListCache.response as any)?.totalCount || 0
          });
        }
        const firstList =
          canReuseFirstPage && first.notModified && existingListCache.response
            ? ({
                ...(existingListCache.response as ListResponse),
                notModified: undefined
              } as ListResponse)
            : first.list;
        const totalCountRaw = Number((firstList as any).totalCount || 0);
        const hasNextToken = Boolean((firstList as any).nextPageToken);
        const firstListComplete = isCompletePrefetchedListResponse(firstList, 200);
        const cappedTotalCount =
          Number.isFinite(totalCountRaw) && totalCountRaw > 0
            ? Math.min(totalCountRaw, 200)
            : hasNextToken
              ? 200
              : Math.min((firstList.items || []).length, 200);
        const totalPages = firstListComplete ? 1 : Math.max(1, Math.ceil(cappedTotalCount / pageSize));

        const itemsByPage = new Map<number, ListItem[]>();
        const failedPages = new Map<number, string>();
        const recordsAccum: Record<string, WebFormSubmission> = {
          ...((existingListCache.records || {}) as Record<string, WebFormSubmission>),
          ...((((first as any).batch as any)?.records as Record<string, WebFormSubmission>) || {})
        };
        itemsByPage.set(0, (firstList.items || []) as ListItem[]);

        const buildAggregated = (): ListItem[] => aggregatePrefetchedPageItems(itemsByPage, totalPages);
        const buildContiguous = (): ListItem[] => aggregateContiguousPrefetchedPageItems(itemsByPage, totalPages);

        const applyProgress = (phaseOverride?: 'idle' | 'prefetching') => {
          const aggregated = buildAggregated();
          const contiguous = buildContiguous();
          const resolvedPageCount = itemsByPage.size + failedPages.size;
          const hasMore = resolvedPageCount < totalPages;
          const completeData = firstListComplete || (!hasMore && failedPages.size === 0 && aggregated.length >= cappedTotalCount && cappedTotalCount < 200);
          setListCache(prev => {
            const records = applyPendingFollowupStatusesToRecordCache(
              mergeListRecordSnapshotCache(prev.records, recordsAccum)
            );
            const items = mergeListItemsWithRecordCache(aggregated, records);
            return {
              response: {
                ...firstList,
                notModified: undefined,
                items,
                nextPageToken: hasMore ? ((firstList as any).nextPageToken || '__prefetching__') : undefined,
                contiguousItemCount: contiguous.length,
                completeData
              },
              records
            };
          });
          setListFetch({
            phase: phaseOverride || (hasMore ? 'prefetching' : 'idle'),
            loaded: aggregated.length,
            total: cappedTotalCount || aggregated.length,
            pages: itemsByPage.size
          });
          return aggregated.length;
        };

        const firstAggregatedCount = applyProgress(totalPages > 1 ? 'idle' : undefined);
        logEvent('list.sorted.prefetch.page', {
          page: 1,
          pageItems: (itemsByPage.get(0) || []).length,
          aggregated: firstAggregatedCount,
          totalCount: cappedTotalCount,
          hasNext: totalPages > 1,
          durationMs: Date.now() - startedAt
        });

        if (totalPages <= 1) {
          if (seq !== listFetchSeqRef.current) return;
          logEvent('list.sorted.prefetch.done', {
            pages: 1,
            items: (itemsByPage.get(0) || []).length,
            durationMs: Date.now() - startedAt
          });
          return;
        }

        if (disableListBackgroundPrefetch) {
          logEvent('list.sorted.prefetch.skipBackground', {
            formKey,
            reason: 'dateSearchMode',
            loaded: firstAggregatedCount,
            totalCount: cappedTotalCount,
            nextPageToken: Boolean((firstList as any)?.nextPageToken),
            dateFilterFieldId: (sort as any)?.__dateFieldId || null,
            dateFilterEquals: (sort as any)?.__dateEquals || null
          });
          return;
        }

        const backgroundPrefetchKey = `${formKey}::${existingEtag || (firstList as any).etag || 'noetag'}::${listRefreshToken}`;
        if (listBackgroundPrefetchKeyRef.current === backgroundPrefetchKey) {
          return;
        }
        listBackgroundPrefetchKeyRef.current = backgroundPrefetchKey;
        logEvent('list.sorted.prefetch.deferred', {
          formKey,
          pagesRemaining: Math.max(0, totalPages - 1),
          loaded: firstAggregatedCount,
          totalCount: cappedTotalCount,
          delayMs: HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS
        });

        const runRemainingPages = async () => {
          if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
          setListFetch(prev => ({
            phase: 'prefetching',
            loaded: prev.loaded,
            total: prev.total,
            pages: prev.pages
          }));
          const remainingPageIndexes = Array.from({ length: totalPages - 1 }, (_, idx) => idx + 1);
          await runWithConcurrencyLimit(remainingPageIndexes, 1, async pageIndex => {
            if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
              const offset = pageIndex * pageSize;
              const token = encodePageTokenClient(offset);
              const pageStartedAt = Date.now();
            try {
              const res = await fetchPage({ token, pageIndex, allowConditional: false });
              if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
              const items = (res.list.items || []) as ListItem[];
              itemsByPage.set(pageIndex, items);
              failedPages.delete(pageIndex);
              const newRecords = (((res.batch as any)?.records as Record<string, WebFormSubmission>) || {}) as Record<string, WebFormSubmission>;
              Object.keys(newRecords).forEach(id => {
                recordsAccum[id] = newRecords[id];
              });
              const aggregatedCount = applyProgress();
              const resolvedPageCount = itemsByPage.size + failedPages.size;
              logEvent('list.sorted.prefetch.page', {
                page: pageIndex + 1,
                pageItems: items.length,
                aggregated: aggregatedCount,
                totalCount: cappedTotalCount,
                hasNext: resolvedPageCount < totalPages,
                durationMs: Date.now() - startedAt,
                pageDurationMs: Date.now() - pageStartedAt,
                prefetchMode: 'sequential'
              });
            } catch (err: any) {
              if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
              const message = resolveLogMessage(err, 'Failed to load list page.');
              failedPages.set(pageIndex, message);
              const aggregatedCount = applyProgress();
              logEvent('list.sorted.prefetch.page.error', {
                page: pageIndex + 1,
                totalCount: cappedTotalCount,
                loadedPages: itemsByPage.size,
                loadedItems: aggregatedCount,
                message,
                durationMs: Date.now() - startedAt,
                pageDurationMs: Date.now() - pageStartedAt,
                prefetchMode: 'sequential'
              });
            }
          });
          if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
          if (failedPages.size) {
            const partialAggregatedCount = applyProgress('idle');
            logEvent('list.sorted.prefetch.partial', {
              pages: itemsByPage.size,
              items: partialAggregatedCount,
              failedPages: Array.from(failedPages.keys()).map(page => page + 1),
              failedCount: failedPages.size,
              durationMs: Date.now() - startedAt
            });
            return;
          }
          const finalAggregatedCount = applyProgress('idle');
          logEvent('list.sorted.prefetch.done', {
            pages: totalPages,
            items: finalAggregatedCount,
            durationMs: Date.now() - startedAt
          });
        };

        try {
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            backgroundIdleHandle = (window as any).requestIdleCallback(
              () => {
                backgroundIdleHandle = null;
                void runRemainingPages();
              },
              { timeout: HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS + 1200 }
            ) as number;
          } else {
            backgroundTimerHandle = globalThis.setTimeout(() => {
              backgroundTimerHandle = null;
              void runRemainingPages();
            }, HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS);
          }
        } catch {
          backgroundTimerHandle = globalThis.setTimeout(() => {
            backgroundTimerHandle = null;
            void runRemainingPages();
          }, HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS);
        }
      } catch (err: any) {
        if (seq !== listFetchSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load list.');
        const logMessage = resolveLogMessage(err, 'Failed to load list.');
        if ((err as any)?.__ckUiTone === 'info') {
          setListFetch(prev => ({ ...prev, phase: 'idle', message: undefined }));
          logEvent('list.sorted.prefetch.noticeSuppressed', {
            kind: (err as any)?.__ckUiKind || null,
            message: logMessage,
            existingCount: (listCacheRef.current.response?.items || []).length
          });
          return;
        }
        if (uiMessage) {
          setListFetch(prev => ({ ...prev, phase: 'error', message: uiMessage }));
        } else {
          setListFetch(prev => ({ ...prev, phase: 'idle', message: undefined }));
        }
        logEvent('list.sorted.prefetch.error', { message: logMessage });
      }
    })();
    return () => {
      backgroundCancelled = true;
      if (backgroundTimerHandle !== null) globalThis.clearTimeout(backgroundTimerHandle);
      if (backgroundIdleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(backgroundIdleHandle);
      }
    };
    // Cancel when leaving the list view so opening a record does not keep issuing
    // background list page requests the user can no longer benefit from.
  }, [
    applyHomeBootstrapAnalytics,
    applyPendingFollowupStatusesToRecordCache,
    definition.listView,
    disableListBackgroundPrefetch,
    formKey,
    initialHomeListSource,
    listRefreshToken,
    listViewDateSearchFieldId,
    listViewInitialDateSearchValue,
    listViewProjection,
    listViewSearchMode,
    logEvent,
    perfMark,
    perfMeasure,
    resolveLogMessage,
    resolveUiErrorMessage,
    view
  ]);

  /**
   * Merge a locally-known record update into the cached list rows so navigating back to the list
   * does NOT require a server refetch. Other users' changes still require an explicit Refresh.
   */
  const upsertListCacheRow = useCallback(
    (args: {
      recordId: string;
      values?: Record<string, any>;
      createdAt?: string;
      updatedAt?: string;
      status?: string | null;
      pdfUrl?: string;
      dataVersion?: number | null;
      rowNumber?: number | null;
    }) => {
      const recordId = (args.recordId || '').toString();
      if (!recordId) return;
      setListCache(prev =>
        upsertListCacheRowPure({
          prev,
          update: args,
          definition,
          formKey,
          language
        })
      );
    },
    [definition, formKey, language]
  );

  const mergeRecordSnapshotIntoListCache = useCallback((snapshot: WebFormSubmission | null | undefined) => {
    const recordId = (snapshot?.id || '').toString().trim();
    if (!snapshot || !recordId) return;
    persistPastRecordSnapshot(snapshot, 'record.mergeListCache');
    setListCache(prev => {
      const records = applyPendingFollowupStatusesToRecordCache(
        mergeListRecordSnapshotCache(prev.records, { [recordId]: snapshot })
      );
      const response =
        prev.response && Array.isArray((prev.response as any).items)
          ? {
              ...(prev.response as any),
              items: mergeListItemsWithRecordCache((prev.response.items || []) as ListItem[], records)
            }
          : prev.response;
      return { response, records };
    });
  }, [applyPendingFollowupStatusesToRecordCache, persistPastRecordSnapshot]);

  const handleReadListViewDateSearchCache = useCallback(
    (descriptor: DateSearchCacheDescriptor) =>
      readDateSearchLocalCache({
        formKey,
        listView: definition.listView,
        cacheVersion: homeListCacheVersion,
        descriptor
      }),
    [definition.listView, formKey, homeListCacheVersion]
  );

  const handleListViewCache = useCallback(
    (payload: { response: ListResponse; records: Record<string, WebFormSubmission>; dateSearch?: DateSearchCacheDescriptor }) => {
      const records = payload.records || {};
      const recordCount = Object.keys(records).length;
      if (payload.dateSearch) {
        writeDateSearchLocalCache({
          formKey,
          listView: definition.listView,
          cacheVersion: homeListCacheVersion,
          descriptor: payload.dateSearch,
          response: payload.response,
          records
        });
        logEvent('list.search.date.localCache.write', {
          formKey,
          queryDate: payload.dateSearch.dateEquals,
          dateFieldId: payload.dateSearch.dateFieldId,
          items: payload.response?.items?.length || 0,
          records: recordCount
        });
      }
      if (!recordCount) return;
      persistPastRecordSnapshots(records, 'list.cache');
      setListCache(prev => ({
        response: prev.response,
        records: mergeListRecordSnapshotCache(prev.records, records)
      }));
    },
    [definition.listView, formKey, homeListCacheVersion, logEvent, persistPastRecordSnapshots]
  );

  useEffect(() => {
    const unlockRecordId = (readyForProductionUnlockResolution.unlockRecordId || '').toString().trim();
    const unlockSet = readyForProductionUnlockSet || {};
    const unlockEntries = Object.entries(unlockSet).filter(([fieldId]) => fieldId.toString().trim());
    if (!unlockRecordId || !unlockEntries.length) return;
    if (view !== 'form') return;
    if (submitting || updateRecordBusyOpen || recordSyncBusyOpen || Boolean(recordLoadingId) || precreateDedupChecking) return;

    const recordId =
      resolveExistingRecordId({
        selectedRecordId,
        selectedRecordSnapshot,
        lastSubmissionMetaId: lastSubmissionMeta?.id || null
      }) || '';
    if (!recordId || recordId !== unlockRecordId) return;

    const normalizeCurrent = (value: any): string => (value === undefined || value === null ? '' : value.toString().trim()).toLowerCase();
    const currentValues = {
      ...(selectedRecordSnapshot?.values || {}),
      ...(valuesRef.current || {}),
      status: lastSubmissionMeta?.status || selectedRecordSnapshot?.status || ''
    } as Record<string, any>;
    const alreadyApplied = unlockEntries.every(([fieldId, targetValue]) => {
      const nextValue = targetValue === null ? '' : targetValue;
      return normalizeCurrent(currentValues[fieldId]) === normalizeCurrent(nextValue);
    });
    if (alreadyApplied) return;

    const unlockSignature = unlockEntries
      .map(([fieldId, value]) => `${fieldId}:${value === null ? '' : value.toString().trim().toLowerCase()}`)
      .join('|');
    const attemptKey = `${recordId}::${unlockSignature}`;
    if (readyForProductionUnlockTransitionAttemptedRef.current.has(attemptKey)) return;
    readyForProductionUnlockTransitionAttemptedRef.current.add(attemptKey);
    const updateRecordSet = unlockEntries.reduce<Record<string, any>>((acc, [fieldId, value]) => {
      if (fieldId === 'status') {
        acc.status = value;
        return acc;
      }
      if (!acc.values || typeof acc.values !== 'object') acc.values = {};
      acc.values[fieldId] = value;
      return acc;
    }, {});

    logEvent('readyForProduction.unlock.fieldSet.start', {
      recordId,
      source: readyForProductionUnlockResolution.source,
      fields: unlockEntries.map(([fieldId]) => fieldId)
    });

    void runUpdateRecordAction(
      {
        definition,
        formKey,
        submit: (payload: any) => submitCurrentRecordMutation('readyForProduction.unlock', payload),
        waitForActiveDraftSave: (reason: string) => waitForActiveDraftSaveTransactions(reason),
        tSystem,
        logEvent,
        refs: {
          languageRef,
          valuesRef,
          lineItemsRef,
          selectedRecordIdRef,
          selectedRecordSnapshotRef,
          lastSubmissionMetaRef,
          recordDataVersionRef,
          recordRowNumberRef,
          recordSessionRef,
          uploadQueueRef,
          autoSaveInFlightRef,
          recordStaleRef
        },
        setDraftSave,
        setStatus,
        setStatusLevel,
        setLastSubmissionMeta,
        setSelectedRecordSnapshot,
        setValues,
        setView,
        upsertListCacheRow,
        synchronizeStaleRecord: (args: Parameters<SynchronizeStaleRecordFn>[0]) => synchronizeStaleRecordRef.current(args),
        busy: updateRecordBusy
      } as any,
      {
        buttonId: 'ready-for-production-unlock',
        buttonRef: 'ready-for-production-unlock',
        navigateTo: 'form',
        set: updateRecordSet
      }
    ).then(() => {
      const nextValues = selectedRecordSnapshotRef.current?.values || valuesRef.current || {};
      logEvent('readyForProduction.unlock.fieldSet.done', {
        recordId,
        fields: unlockEntries.map(([fieldId]) => fieldId),
        values: unlockEntries.reduce<Record<string, any>>((acc, [fieldId]) => {
          acc[fieldId] = nextValues[fieldId] ?? null;
          return acc;
        }, {})
      });
    });
  }, [
    definition,
    formKey,
    lastSubmissionMeta,
    logEvent,
    precreateDedupChecking,
    recordSyncBusyOpen,
    readyForProductionUnlockResolution.source,
    readyForProductionUnlockResolution.unlockRecordId,
    readyForProductionUnlockSet,
    recordLoadingId,
    selectedRecordId,
    selectedRecordSnapshot,
    submitting,
    submitCurrentRecordMutation,
    updateRecordBusy,
    updateRecordBusyOpen,
    upsertListCacheRow,
    waitForActiveDraftSaveTransactions,
    view
  ]);

  const resolveDraftStateFromSnapshot = useCallback(
    (snapshot: WebFormSubmission | null | undefined) => {
      if (!snapshot) return null;
      const normalized = normalizeRecordValues(definition, snapshot.values || {});
      const initialLineItems = buildInitialLineItems(definition, normalized);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
      const reconciledState = reconcileAutoAddModeGroups({
        definition,
        values: mapped.values,
        lineItems: mapped.lineItems,
        optionState: optionStateRef.current,
        language: languageRef.current,
        ensureLineOptions: ensureLineOptionsRef.current
      });
      return {
        values: reconciledState.changed ? reconciledState.values : mapped.values,
        lineItems: reconciledState.changed ? reconciledState.lineItems : mapped.lineItems,
        changedCount: reconciledState.changedCount
      };
    },
    [definition]
  );

  const applyRecordSnapshot = useCallback(
    (snapshot: WebFormSubmission): RecordSnapshotApplyMode => {
      const id = snapshot?.id;
      if (!snapshot || !id) {
        lastRecordSnapshotApplyModeRef.current = { mode: 'ignored', recordId: null, dataVersion: null };
        return 'ignored';
      }
      const currentRecordId = getCurrentOpenRecordId();
      const incomingDataVersion = resolveCurrentClientDataVersion((snapshot as any)?.dataVersion);
      const currentDataVersion = getCurrentKnownClientDataVersion();
      if (
        !shouldApplyIncomingRecordSnapshot({
          incomingRecordId: id,
          currentRecordId,
          incomingDataVersion,
          currentDataVersion
        })
      ) {
        logEvent('record.snapshot.ignored.olderVersion', {
          recordId: id,
          incomingDataVersion,
          currentDataVersion
        });
        lastRecordSnapshotApplyModeRef.current = {
          mode: 'ignored',
          recordId: id,
          dataVersion: incomingDataVersion
        };
        return 'ignored';
      }
      const incomingDraftState = resolveDraftStateFromSnapshot(snapshot);
      if (!incomingDraftState) {
        lastRecordSnapshotApplyModeRef.current = { mode: 'ignored', recordId: id, dataVersion: incomingDataVersion };
        return 'ignored';
      }
      const previousRecordForAnalytics =
        currentRecordId && currentRecordId === id
          ? selectedRecordSnapshotRef.current
          : selectedRecordSnapshotRef.current?.id === id
            ? selectedRecordSnapshotRef.current
            : null;
      const nextMappedValues = incomingDraftState.values;
      const nextMappedLineItems = incomingDraftState.lineItems;
      const currentStatusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() || '';
      const incomingStatusRaw = ((snapshot.status || '') as any)?.toString?.() || '';
      const configuredMetaOnlyRule = resolveRecordFreshnessMetaOnlyAdoptionRule({
        config: recordFreshnessConfigRef.current,
        stepId: activeGuidedStepIdRef.current
      });
      const sameActiveRecord = Boolean(currentRecordId && currentRecordId === id);
      const lastAppliedDraftState = sameActiveRecord
        ? resolveDraftStateFromSnapshot(selectedRecordSnapshotRef.current)
        : null;
      const localComparableFingerprint = sameActiveRecord
        ? buildRecordSyncComparableFingerprint({
            definition,
            formKey,
            language: languageRef.current,
            values: valuesRef.current,
            lineItems: lineItemsRef.current
          })
        : '';
      const baselineComparableFingerprint = lastAppliedDraftState
        ? buildRecordSyncComparableFingerprint({
            definition,
            formKey,
            language: languageRef.current,
            values: lastAppliedDraftState.values,
            lineItems: lastAppliedDraftState.lineItems
          })
        : '';
      const preserveLocalDraftAfterMetaOnly = shouldPreserveLocalDraftAfterMetaOnlyAdoption({
        sameRecord: sameActiveRecord,
        currentComparableFingerprint: localComparableFingerprint,
        baselineComparableFingerprint,
        dirty: autoSaveDirtyRef.current,
        queued: autoSaveQueuedRef.current
      });
      const metaOnlyRule =
        configuredMetaOnlyRule ||
        (preserveLocalDraftAfterMetaOnly
          ? ({ compareAgainst: 'lastAppliedSnapshot' } as const)
          : null);
      const baselineDraftState =
        metaOnlyRule?.compareAgainst === 'lastAppliedSnapshot'
          ? lastAppliedDraftState
          : null;
      const shouldAdoptMetaOnly = shouldAdoptIncomingRecordSnapshotMetaOnly({
        definition,
        incomingRecordId: id,
        currentRecordId,
        incomingDataVersion,
        currentDataVersion,
        incomingStatus: incomingStatusRaw,
        currentStatus: currentStatusRaw,
        allowStatusChange: Boolean(metaOnlyRule),
        incomingValues: nextMappedValues,
        incomingLineItems: nextMappedLineItems,
        currentValues: valuesRef.current,
        currentLineItems: lineItemsRef.current,
        comparisonValues: baselineDraftState?.values,
        comparisonLineItems: baselineDraftState?.lineItems,
        formKey,
        language: languageRef.current
      });
      if (shouldAdoptMetaOnly) {
        if (previousRecordForAnalytics) {
          applyLiveAnalyticsRecordDelta({
            previousRecord: previousRecordForAnalytics,
            nextRecord: snapshot,
            reason: 'record.snapshot.metaOnly',
            recordId: id
          });
        }
        recordStaleRef.current = null;
        setRecordStale(null);
        pendingDeferredRecordFreshnessSyncRef.current = null;
        recordDataVersionRef.current =
          snapshot && Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : null;
        optimisticClientDataVersionRef.current = recordDataVersionRef.current;
        if (snapshot && Number.isFinite(Number((snapshot as any).__rowNumber))) {
          recordRowNumberRef.current = Number((snapshot as any).__rowNumber);
        }
        if (preserveLocalDraftAfterMetaOnly) {
          autoSaveDirtyRef.current = true;
          setDraftSave(prev => (prev.phase === 'saving' ? prev : { phase: 'dirty' }));
        } else {
          autoSaveDirtyRef.current = false;
          autoSaveQueuedRef.current = false;
          if (autoSaveTimerRef.current) {
            globalThis.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          setDraftSave({ phase: 'idle' });
          rememberAutoSaveSeenState(valuesRef.current, lineItemsRef.current);
        }
        setRecordLoadingId(null);
        recordLoadingIdRef.current = null;
        setRecordLoadError(null);
        selectedRecordSnapshotRef.current = snapshot;
        setSelectedRecordSnapshot(snapshot);
        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          dataVersion: (snapshot as any).dataVersion,
          status: snapshot.status || null
        }));
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || {}),
          id,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          dataVersion: (snapshot as any).dataVersion,
          status: snapshot.status || null
        };
        setListCache(prev => ({
          response: prev.response,
          records: { ...prev.records, [id]: snapshot }
        }));
        persistPastRecordSnapshot(snapshot, 'record.snapshot.metaOnly');
        try {
          upsertListCacheRow({
            recordId: id,
            values: (snapshot.values as any) || {},
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
            status: (snapshot.status as any) || null,
            pdfUrl: (snapshot as any).pdfUrl,
            dataVersion: Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : undefined,
            rowNumber: Number.isFinite(Number((snapshot as any).__rowNumber)) ? Number((snapshot as any).__rowNumber) : undefined
          });
        } catch {
          // ignore
        }
        lastRecordSnapshotApplyModeRef.current = {
          mode: 'metaOnly',
          recordId: id,
          dataVersion: incomingDataVersion
        };
        logEvent('record.snapshot.metaOnlyAdopted', {
          recordId: id,
          incomingDataVersion,
          currentDataVersion,
          autoAddGroupRebuilds: incomingDraftState.changedCount,
          compareAgainst: metaOnlyRule?.compareAgainst || 'currentDraft',
          source: configuredMetaOnlyRule ? 'configured' : 'localDraftProtection',
          localDraftPreserved: preserveLocalDraftAfterMetaOnly
        });
        return 'metaOnly';
      }
      setPrefetchedSummaryHtml(null);
      // Switching records: cancel any in-flight dedup check so stale responses can't affect the new record.
      if (dedupCheckTimerRef.current) {
        globalThis.clearTimeout(dedupCheckTimerRef.current);
        dedupCheckTimerRef.current = null;
      }
      dedupCheckSeqRef.current += 1;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      resetFieldChangeTransientState();
      // Applying a fresh snapshot clears any "stale record" banner and updates our base dataVersion.
      recordStaleRef.current = null;
      setRecordStale(null);
      pendingDeferredRecordFreshnessSyncRef.current = null;
      recordDataVersionRef.current =
        snapshot && Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : null;
      optimisticClientDataVersionRef.current = recordDataVersionRef.current;
      // Best-effort: capture rowNumber when present on the snapshot.
      if (snapshot && Number.isFinite(Number((snapshot as any).__rowNumber))) {
        recordRowNumberRef.current = Number((snapshot as any).__rowNumber);
      }
      // Loading a snapshot from the server/list is an "edit existing record" flow,
      // except when we are reloading the CURRENT draft record during create-flow.
      const isReloadingCurrentCreateFlow = createFlowRef.current && currentRecordId && currentRecordId === id;
      if (!isReloadingCurrentCreateFlow) {
        createFlowRef.current = false;
      }
      createFlowUserEditedRef.current = true;
      if (!isReloadingCurrentCreateFlow) {
        autoSaveUserEditedRef.current = false;
      }
      if (previousRecordForAnalytics) {
        applyLiveAnalyticsRecordDelta({
          previousRecord: previousRecordForAnalytics,
          nextRecord: snapshot,
          reason: 'record.snapshot.applied',
          recordId: id
        });
      }
      dedupHoldRef.current = false;
      // Treat the loaded snapshot's dedup signature as "already checked" so we don't spam dedup checks
      // on every record navigation. Subsequent edits of dedup-key fields will force a re-check.
      try {
        const baseline = computeDedupSignatureFromValues(dedupPrecheckRules, nextMappedValues as any);
        lastDedupCheckedSignatureRef.current = (baseline || '').toString();
        dedupSignatureRef.current = lastDedupCheckedSignatureRef.current;
        dedupBaselineSignatureRef.current = lastDedupCheckedSignatureRef.current;
        dedupKeyFingerprintBaselineRef.current = computeDedupKeyFingerprint(
          (definition as any)?.dedupRules,
          nextMappedValues as any
        );
      } catch {
        lastDedupCheckedSignatureRef.current = '';
        dedupBaselineSignatureRef.current = '';
        dedupKeyFingerprintBaselineRef.current = '';
        dedupDeleteOnKeyChangeInFlightRef.current = false;
      }
      // Avoid autosaving immediately due to state hydration from a server snapshot.
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      rememberAutoSaveSeenState(nextMappedValues, nextMappedLineItems);
      // Keep refs in sync immediately so any follow-up actions (e.g. list-triggered button previews) can use
      // the freshly loaded record values without waiting for a re-render.
      valuesRef.current = nextMappedValues;
      lineItemsRef.current = nextMappedLineItems;
      selectedRecordIdRef.current = id;
      selectedRecordSnapshotRef.current = snapshot;
      setValues(nextMappedValues);
      setLineItems(nextMappedLineItems);
      setErrors({});
      setValidationWarnings({ top: [], byField: {} });
      setValidationAttempted(false);
      setValidationNoticeHidden(false);
      setSelectedRecordId(id);
      setSelectedRecordSnapshot(snapshot);
      setLastSubmissionMeta({
        id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        dataVersion: (snapshot as any).dataVersion,
        status: snapshot.status || null
      });
      lastSubmissionMetaRef.current = {
        id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        dataVersion: (snapshot as any).dataVersion,
        status: snapshot.status || null
      };
      setRecordLoadingId(null);
      recordLoadingIdRef.current = null;
      setRecordLoadError(null);
      setListCache(prev => ({
        response: prev.response,
        records: { ...prev.records, [id]: snapshot }
      }));
      persistPastRecordSnapshot(snapshot, 'record.snapshot.applied');
      // Also update any cached list row so navigating back to the list reflects this snapshot without refetching.
      try {
        upsertListCacheRow({
          recordId: id,
          values: (snapshot.values as any) || {},
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          status: (snapshot.status as any) || null,
          pdfUrl: (snapshot as any).pdfUrl,
          dataVersion: Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : undefined,
          rowNumber: Number.isFinite(Number((snapshot as any).__rowNumber)) ? Number((snapshot as any).__rowNumber) : undefined
        });
      } catch {
        // ignore
      }
      lastRecordSnapshotApplyModeRef.current = {
        mode: 'applied',
        recordId: id,
        dataVersion: incomingDataVersion
      };
      logEvent('record.snapshot.applied', {
        recordId: id,
        incomingDataVersion,
        currentDataVersion,
        autoAddGroupRebuilds: incomingDraftState.changedCount
      });
      return 'applied';
    },
    [
      resolveDraftStateFromSnapshot,
      dedupPrecheckRules,
      definition,
      formKey,
      getCurrentKnownClientDataVersion,
      getCurrentOpenRecordId,
      logEvent,
      persistPastRecordSnapshot,
      applyLiveAnalyticsRecordDelta,
      rememberAutoSaveSeenState,
      resetFieldChangeTransientState,
      upsertListCacheRow
    ]
  );

  const loadRecordSnapshot = useCallback(
    async (recordId: string, rowNumberHint?: number, options?: { background?: boolean }): Promise<boolean> => {
      const candidateRow = rowNumberHint && Number.isFinite(rowNumberHint) && rowNumberHint >= 2 ? rowNumberHint : undefined;
      const background = options?.background === true;
      if (!recordId && !candidateRow) return false;
      if (candidateRow) {
        recordRowNumberRef.current = candidateRow;
      }
      const seq = ++recordFetchSeqRef.current;
      const sessionAtStart = recordSessionRef.current;
      const startedAt = Date.now();
      if (!background) {
        const loadingId = recordId || (candidateRow ? `row:${candidateRow}` : null);
        setRecordLoadingId(loadingId);
        recordLoadingIdRef.current = loadingId;
        setRecordLoadError(null);
      }
      logEvent('record.fetch.start', { recordId: recordId || null, rowNumberHint: candidateRow || null, background });
      try {
        let snapshot: WebFormSubmission | null = null;

        // Prefer row-number fetch when available (avoids expensive ID scans and works even if legacy endpoints exist).
        if (candidateRow) {
          snapshot = await fetchRecordByRowNumber(formKey, candidateRow);
          if (
            shouldDiscardRecordLoadResult({
              requestSeq: seq,
              currentSeq: recordFetchSeqRef.current,
              sessionAtStart,
              currentSession: recordSessionRef.current
            })
          ) {
            return false;
          }
          if (recordId && snapshot && snapshot.id && snapshot.id !== recordId) {
            // Row hint might be stale; fall back to ID to avoid loading the wrong record.
            logEvent('record.fetch.rowNumberMismatch', {
              recordId,
              rowNumberHint: candidateRow,
              resolvedId: snapshot.id
            });
            snapshot = null;
          }
        }

        if (!snapshot && recordId) {
          snapshot = await fetchRecordById(formKey, recordId);
        }
        if (
          shouldDiscardRecordLoadResult({
            requestSeq: seq,
            currentSeq: recordFetchSeqRef.current,
            sessionAtStart,
            currentSession: recordSessionRef.current
          })
        ) {
          return false;
        }
        if (!snapshot) throw new Error('Record not found.');
        const applyMode = applyRecordSnapshot(snapshot);
        markRecordFreshnessServerTouch({ reason: 'record.load', recordId: snapshot.id || recordId });
        logEvent('record.fetch.done', {
          recordId: snapshot.id || recordId,
          durationMs: Date.now() - startedAt,
          background,
          applyMode
        });
        return true;
      } catch (err: any) {
        if (
          shouldDiscardRecordLoadResult({
            requestSeq: seq,
            currentSeq: recordFetchSeqRef.current,
            sessionAtStart,
            currentSession: recordSessionRef.current
          })
        ) {
          return false;
        }
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load record.');
        const logMessage = resolveLogMessage(err, 'Failed to load record.');
        if (!background) {
          setRecordLoadError(uiMessage);
          setRecordLoadingId(null);
          recordLoadingIdRef.current = null;
        }
        logEvent('record.fetch.error', {
          recordId,
          message: logMessage,
          rowNumberHint,
          durationMs: Date.now() - startedAt,
          background
        });
        return false;
      }
    },
    [applyRecordSnapshot, formKey, logEvent, markRecordFreshnessServerTouch, resolveLogMessage, resolveUiErrorMessage]
  );

  const refreshDetachedRecordSnapshotCache = useCallback(
    async (args: { recordId: string; reason: string }): Promise<boolean> => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return false;
      const currentRecordId = (selectedRecordIdRef.current || '').toString().trim();
      if (currentRecordId === recordId && viewRef.current !== 'list') {
        logEvent('record.detachedCacheRefresh.skipped', {
          recordId,
          reason: args.reason,
          currentView: viewRef.current
        });
        return false;
      }
      const startedAt = Date.now();
      logEvent('record.detachedCacheRefresh.start', {
        recordId,
        reason: args.reason,
        currentView: viewRef.current,
        currentRecordId: currentRecordId || null
      });
      try {
        const snapshot = await fetchRecordById(formKey, recordId);
        if (!snapshot) {
          logEvent('record.detachedCacheRefresh.miss', {
            recordId,
            reason: args.reason,
            durationMs: Date.now() - startedAt
          });
          return false;
        }
        mergeRecordSnapshotIntoListCache(snapshot);
        markRecordFreshnessServerTouch({ reason: args.reason, recordId: snapshot.id || recordId });
        logEvent('record.detachedCacheRefresh.done', {
          recordId: snapshot.id || recordId,
          status: snapshot.status || null,
          dataVersion: Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : null,
          durationMs: Date.now() - startedAt
        });
        return true;
      } catch (err: any) {
        logEvent('record.detachedCacheRefresh.error', {
          recordId,
          reason: args.reason,
          message: err?.message || err?.toString?.() || 'failed',
          durationMs: Date.now() - startedAt
        });
        return false;
      }
    },
    [formKey, logEvent, markRecordFreshnessServerTouch, mergeRecordSnapshotIntoListCache]
  );

  useEffect(() => {
    const currentDataVersion = getCurrentKnownClientDataVersion();
    const delayMs = resolveRecordFreshnessTimerDelay({
      config: resolvedRecordFreshness,
      view,
      recordId: getCurrentOpenRecordId(),
      hasServerVersion: Number.isFinite(Number(currentDataVersion)) && Number(currentDataVersion) > 0,
      recordLoading: Boolean(recordLoadingId),
      now: Date.now(),
      lastServerActivityAt: lastRecordServerActivityAtRef.current || null
    });
    if (delayMs === null) {
      clearRecordFreshnessTimer();
      return;
    }
    scheduleRecordFreshnessCheck('stateChange');
    return clearRecordFreshnessTimer;
  }, [
    clearRecordFreshnessTimer,
    getCurrentKnownClientDataVersion,
    getCurrentOpenRecordId,
    lastSubmissionMeta?.dataVersion,
    lastSubmissionMeta?.id,
    recordLoadingId,
    resolvedRecordFreshness,
    scheduleRecordFreshnessCheck,
    selectedRecordId,
    selectedRecordSnapshot?.id,
    selectedRecordSnapshot?.dataVersion,
    view
  ]);

  const handleGlobalRefresh = useCallback(async () => {
    // Clear client caches (data sources + rendered templates) to avoid stale derived content without requiring a full reload.
    try {
      clearFetchDataSourceCache();
      clearBundledHtmlClientCaches();
      clearHtmlRenderClientCache();
      clearMarkdownRenderClientCache();
      clearDateSearchLocalCacheFamily({ formKey, listView: definition.listView });
      setOptionState({});
      setTooltipState({});
      optionStateRef.current = {};
      tooltipStateRef.current = {};
      preloadPromisesRef.current = {};
      logEvent('cache.client.clear', { scope: 'refresh', optionsCleared: true });
    } catch (err: any) {
      logEvent('cache.client.clear.error', { message: err?.message || err?.toString?.() || 'unknown' });
    }
    // Trigger a list refresh, but keep the current list visible until new data arrives.
    requestListRefresh({ clearResponse: false });
    if (!selectedRecordId) return;
    await loadRecordSnapshot(selectedRecordId);
  }, [definition.listView, formKey, loadRecordSnapshot, logEvent, requestListRefresh, selectedRecordId]);

  const synchronizeStaleRecord = useCallback<SynchronizeStaleRecordFn>(
    async args => {
      const recordId = (args.recordId || selectedRecordIdRef.current || '').toString().trim();
      if (!recordId) return false;
      const recordSessionId = recordSessionRef.current;
      if (recordSyncPromiseRef.current) {
        return recordSyncPromiseRef.current;
      }

      pendingDeferredRecordFreshnessSyncRef.current = null;
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      recordStaleRef.current = null;
      setRecordStale(null);
      setStatus(null);
      setStatusLevel(null);

      const promise = (async () => {
        logEvent('record.sync.start', {
          reason: args.reason,
          recordId,
          cachedVersion: args.cachedVersion ?? null,
          serverVersion: args.serverVersion ?? null,
          serverRow: args.serverRow ?? null
        });
        const refreshed = await loadRecordSnapshot(recordId, args.serverRow || undefined, { background: true });
        if (refreshed) {
          const applyMode = lastRecordSnapshotApplyModeRef.current.mode;
          recordStaleRef.current = null;
          setRecordStale(null);
          lastExternalRecordSyncAtRef.current = Date.now();
          if (applyMode === 'metaOnly') {
            logEvent('record.sync.metaOnly', {
              reason: args.reason,
              recordId,
              cachedVersion: args.cachedVersion ?? null,
              serverVersion: args.serverVersion ?? null,
              serverRow: args.serverRow ?? null
            });
            return true;
          }
          const guidedRealignAllowed = shouldRealignGuidedStepAfterStaleSync(args.reason);
          const guidedRealign =
            guidedRealignAllowed && selectedRecordIdRef.current === recordId && recordSessionRef.current === recordSessionId;
          if (guidedRealign) {
            const nextToken = guidedExternalSyncTokenRef.current + 1;
            guidedExternalSyncTokenRef.current = nextToken;
            setGuidedExternalSyncSignal({
              token: nextToken,
              recordId,
              recordSessionId,
              reason: args.reason
            });
          } else if (guidedRealignAllowed) {
            logEvent('record.sync.guidedRealign.skipped', {
              reason: args.reason,
              recordId,
              selectedRecordId: selectedRecordIdRef.current || null,
              recordSessionId,
              currentRecordSessionId: recordSessionRef.current
            });
          }
          logEvent('record.sync.success', {
            reason: args.reason,
            recordId,
            serverRow: args.serverRow ?? null,
            applyMode,
            guidedRealign
          });
          return true;
        }

        const fallbackMessage = tSystem(
          'record.syncFailed',
          languageRef.current,
          'We could not synchronize the latest record automatically. Use Refresh in the header to continue.'
        );
        const staleInfo: RecordStaleInfo = {
          recordId,
          message: fallbackMessage,
          cachedVersion: args.cachedVersion ?? undefined,
          serverVersion: args.serverVersion ?? undefined,
          serverRow: args.serverRow ?? undefined
        };
        recordStaleRef.current = staleInfo;
        setRecordStale(staleInfo);
        setStatus(fallbackMessage);
        setStatusLevel('error');
        logEvent('record.sync.failed', {
          reason: args.reason,
          recordId,
          serverRow: args.serverRow ?? null
        });
        return false;
      })().finally(() => {
        recordSyncPromiseRef.current = null;
        resumeDeferredRecordFreshnessSyncRef.current('recordSync.release');
      });

      recordSyncPromiseRef.current = promise;
      return promise;
    },
    [loadRecordSnapshot, logEvent, setStatus, setStatusLevel]
  );
  synchronizeStaleRecordRef.current = synchronizeStaleRecord;

  const resumeDeferredRecordFreshnessSyncIfUnblocked = useCallback(
    (reason: string): boolean => {
      const pending = pendingDeferredRecordFreshnessSyncRef.current;
      const action = resolveDeferredRecordFreshnessResumeAction({
        pending,
        view: viewRef.current,
        currentRecordId: getCurrentOpenRecordId(),
        currentDataVersion: getCurrentKnownClientDataVersion(),
        recordLoading: Boolean(recordLoadingIdRef.current),
        submitting: submittingRef.current,
        recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
        blockers: getRecordFreshnessSyncBlockers()
      });
      if (action === 'none' || action === 'wait') return false;
      if (action === 'clear') {
        pendingDeferredRecordFreshnessSyncRef.current = null;
        return false;
      }
      if (!pending) return false;
      pendingDeferredRecordFreshnessSyncRef.current = null;
      logEvent('record.freshness.deferred.resume', {
        reason: pending.reason,
        resumeReason: reason,
        recordId: pending.recordId || null,
        cachedVersion: pending.cachedVersion ?? null,
        serverVersion: pending.serverVersion ?? null,
        serverRow: pending.serverRow ?? null
      });
      void synchronizeStaleRecordRef.current({
        ...pending,
        reason: `${pending.reason}.resume`
      });
      return true;
    },
    [getCurrentKnownClientDataVersion, getCurrentOpenRecordId, getRecordFreshnessSyncBlockers, logEvent]
  );
  resumeDeferredRecordFreshnessSyncRef.current = resumeDeferredRecordFreshnessSyncIfUnblocked;

  useEffect(() => {
    resumeDeferredRecordFreshnessSyncIfUnblocked('reactivity');
  }, [
    autoSaveHold.hold,
    autoSaveHold.reason,
    draftSave.phase,
    recordLoadingId,
    resumeDeferredRecordFreshnessSyncIfUnblocked,
    submitting,
    view
  ]);

  const loadOptionsForField = useCallback(
    (field: any, groupId?: string) => {
      if (!field?.dataSource) return Promise.resolve();
      const key = optionKey(field.id, groupId);
      const existing = getOptionStateValue(optionStateRef.current, field.id, groupId);
      const needsTooltips = !!(existing as any)?.tooltips;
      const existingTooltips = getOptionStateValue(tooltipStateRef.current, field.id, groupId);
      if (existing && (!needsTooltips || existingTooltips)) return Promise.resolve();
      if (preloadPromisesRef.current[key]) return preloadPromisesRef.current[key];
      const cached = peekOptionsFromDataSource(field.dataSource, language);
      if (cached) {
        setOptionState(prev => mergeOptionStateValue(prev, field.id, groupId, cached));
        if (cached.tooltips) {
          setTooltipState(prev => mergeOptionStateValue(prev, field.id, groupId, cached.tooltips || {}));
        }
        logEvent('options.loaded.cache', {
          questionId: field.id,
          groupId: groupId || null,
          count: cached.en?.length || 0
        });
        return Promise.resolve();
      }
      const promise = loadOptionsFromDataSource(field.dataSource, language)
        .then(res => {
          if (res) {
            setOptionState(prev => mergeOptionStateValue(prev, field.id, groupId, res));
            if (res.tooltips) {
              setTooltipState(prev => mergeOptionStateValue(prev, field.id, groupId, res.tooltips || {}));
            }
          }
        })
        .finally(() => {
          // Allow retries if loading fails; also avoid holding onto resolved promises.
          delete preloadPromisesRef.current[key];
        });
      preloadPromisesRef.current[key] = promise;
      return promise;
    },
    [language, logEvent]
  );

  const openCopyCurrentRecordDialogIfConfigured = useCallback(() => {
    const resolved = resolveCopyCurrentRecordDialog(definition as any, languageRef.current);
    if (!resolved) return;
    logEvent('ui.copyCurrent.dialog.open', {
      showCancel: resolved.showCancel,
      dismissOnBackdrop: resolved.dismissOnBackdrop,
      showCloseButton: resolved.showCloseButton
    });
    setCopyCurrentRecordDialog({
      open: true,
      title: resolved.title,
      message: resolved.message || '',
      confirmLabel: resolved.confirmLabel || tSystem('common.ok', languageRef.current, 'OK'),
      cancelLabel: resolved.cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel'),
      showCancel: resolved.showCancel,
      dismissOnBackdrop: resolved.dismissOnBackdrop,
      showCloseButton: resolved.showCloseButton
    });
  }, [definition, logEvent, setCopyCurrentRecordDialog]);

  useEffect(() => {
    optionStateRef.current = optionState;
  }, [optionState]);
  useEffect(() => {
    tooltipStateRef.current = tooltipState;
  }, [tooltipState]);

  const ensureLineOptions = useCallback(
    (groupId: string, field: any) => {
      void loadOptionsForField(field, groupId);
    },
    [loadOptionsForField]
  );
  useEffect(() => {
    ensureLineOptionsRef.current = ensureLineOptions;
  }, [ensureLineOptions]);

  const preloadSummaryTooltips = useCallback(() => {
    const tasks: Promise<void>[] = [];
    definition.questions.forEach(q => {
      if (q.dataSource) tasks.push(loadOptionsForField(q) as Promise<void>);
      if (q.type === 'LINE_ITEM_GROUP') {
        (q.lineItemConfig?.fields || []).forEach(field => {
          if (field?.dataSource) tasks.push(loadOptionsForField(field, q.id) as Promise<void>);
        });
        (q.lineItemConfig?.subGroups || []).forEach(sub => {
          const subKey = resolveSubgroupKey(sub);
          (sub.fields || []).forEach(field => {
            if (field?.dataSource) tasks.push(loadOptionsForField(field, `${q.id}::${subKey}`) as Promise<void>);
          });
        });
      }
    });
    return Promise.all(tasks).then(() => undefined);
  }, [definition.questions, loadOptionsForField]);
  const clearStatus = useCallback(() => {
    statusRef.current = null;
    statusLevelRef.current = null;
    setStatus(null);
    setStatusLevel(null);
    logEvent('status.cleared');
  }, [logEvent]);

  const navigateToFieldFromHeaderNotice = useCallback(
    (fieldPath: string) => {
      const key = (fieldPath || '').toString();
      if (!key) return;
      const nav = formNavigateToFieldRef.current;
      if (nav) {
        nav(key);
        logEvent('validation.notice.navigate', { fieldPath: key });
        return;
      }
      // Best-effort fallback (should be rare): still try to surface the top of the form.
      try {
        globalThis.scrollTo?.({ top: 0, left: 0, behavior: 'smooth' } as any);
      } catch {
        try {
          globalThis.scrollTo?.(0, 0);
        } catch {
          // ignore
        }
      }
      logEvent('validation.notice.navigateFallback', { fieldPath: key });
    },
    [logEvent]
  );

  const dismissValidationNotice = useCallback(() => {
    setValidationNoticeHidden(true);
    logEvent('validation.notice.dismiss');
  }, [logEvent]);

  // Warnings are surfaced as transient "submission messages" in Form view.
  // Summary/PDF compute warnings from record values, so clear when leaving the Form view.
  useEffect(() => {
    if (view === 'form') return;
    setValidationWarnings({ top: [], byField: {} });
    warningTouchedRef.current.clear();
    setValidationAttempted(false);
    setValidationNoticeHidden(false);
  }, [view]);

  // Close the submit confirmation dialog when navigating away.
  useEffect(() => {
    if (view === 'form' || view === 'summary') return;
    if (!submitConfirmOpen) return;
    setSubmitConfirmOpen(false);
    submitConfirmedRef.current = false;
  }, [submitConfirmOpen, view]);

  // Escape closes the submit confirmation dialog.
  useEffect(() => {
    if (!submitConfirmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSubmitConfirmOpen(false);
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [submitConfirmOpen]);

  useEffect(() => {
    // iOS Safari/WebViews can still auto-zoom/re-scale on focus in some contexts.
    // Re-apply the viewport constraints on focus so typing doesn't change the page scale.
    if (typeof document === 'undefined') return;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isiOS = /iPad|iPhone|iPod/i.test(ua);
    if (!isiOS) return;

    const desired =
      'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    const relaxed = 'width=device-width, initial-scale=1, viewport-fit=cover';

    const setViewport = (content: string) => {
      const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]'));
      if (!metas.length) {
        const created = document.createElement('meta');
        created.setAttribute('name', 'viewport');
        created.setAttribute('content', content);
        document.head?.appendChild(created);
        return;
      }
      metas.forEach(m => {
        if (m.getAttribute('content') !== content) m.setAttribute('content', content);
      });
    };

    const applyDesired = () => setViewport(desired);
    const applyRelaxed = () => setViewport(relaxed);

    const getViewportContents = (): string[] =>
      Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]')).map(m => m.getAttribute('content') || '');

    const debugLog = (event: string, payload?: Record<string, unknown>) => {
      if (!debugEnabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm][iOSZoom]', event, payload || {});
      } catch {
        // ignore logging failures
      }
    };

    const getElFontSizePx = (el: HTMLElement | null): number | null => {
      if (!el || typeof globalThis.getComputedStyle !== 'function') return null;
      const v = globalThis.getComputedStyle(el).fontSize || '';
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };

    const snapshotViewport = (label: string, el?: HTMLElement | null) => {
      const vv = globalThis.visualViewport || null;
      const scr = typeof globalThis.screen !== 'undefined' ? globalThis.screen : null;
      debugLog(label, {
        tag: el?.tagName,
        type: (el as HTMLInputElement | null)?.getAttribute?.('type') || undefined,
        fontSizePx: getElFontSizePx(el || null),
        vvScale: vv ? vv.scale : undefined,
        vvW: vv ? vv.width : undefined,
        vvH: vv ? vv.height : undefined,
        screenW: scr ? scr.width : undefined,
        screenH: scr ? scr.height : undefined,
        innerW: typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : undefined,
        innerH: typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : undefined,
        dpr: typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : undefined,
        viewportMeta: getViewportContents()
      });
    };

    applyDesired();

    const BASESCALE_CLASS = 'ck-ios-basescale';
    const computeBaseScaleMode = (): boolean => {
      const v = globalThis.visualViewport;
      const scrW = globalThis.screen?.width;
      if (!v || typeof v.width !== 'number' || typeof scrW !== 'number' || scrW <= 0) return false;
      return v.width > scrW * 1.3;
    };
    const updateBaseScaleClass = (label: string): boolean => {
      const mode = computeBaseScaleMode();
      const root = document.documentElement;
      const had = root.classList.contains(BASESCALE_CLASS);
      if (mode && !had) root.classList.add(BASESCALE_CLASS);
      if (!mode && had) root.classList.remove(BASESCALE_CLASS);
      if (mode !== had) snapshotViewport(`basescale.${mode ? 'on' : 'off'}.${label}`, null);
      return mode;
    };
    // Ensure the class is applied even if the early inline script didn't run (or measurements changed).
    updateBaseScaleClass('init');

    const isFormControl = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const reapplySoon = () => {
      // Some WebViews mutate the viewport meta during/after focus; schedule a few re-applies to win the race.
      globalThis.setTimeout(applyDesired, 0);
      globalThis.setTimeout(applyDesired, 60);
      globalThis.setTimeout(applyDesired, 150);
      // Keyboard animation can take longer; keep one later re-apply.
      globalThis.setTimeout(applyDesired, 450);
    };

    const onPreFocus = (e: Event) => {
      if (!isFormControl(e.target)) return;
      applyDesired();
      updateBaseScaleClass('prefocus');
      reapplySoon();
    };

    const onFocusIn = (e: Event) => {
      if (!isFormControl(e.target)) return;
      applyDesired();
      updateBaseScaleClass('focusin');
      const el = e.target as HTMLElement;
      snapshotViewport('focusin', el);
      // iOS sometimes applies its zoom/viewport changes slightly after focus (keyboard animation).
      globalThis.setTimeout(() => snapshotViewport('focusin.after250', el), 250);
      globalThis.setTimeout(() => snapshotViewport('focusin.after800', el), 800);
      reapplySoon();
    };

    let lastResetAt = 0;
    const forceReset = (reason: string, el?: HTMLElement | null) => {
      const now = Date.now();
      if (now - lastResetAt < 700) return;
      lastResetAt = now;
      // Try to snap back to scale=1 by toggling viewport meta content.
      snapshotViewport(`reset.start.${reason}`, el || null);
      applyRelaxed();
      globalThis.setTimeout(applyDesired, 0);
      globalThis.setTimeout(applyDesired, 60);
      globalThis.setTimeout(applyDesired, 150);
      globalThis.setTimeout(() => snapshotViewport(`reset.end.${reason}`, el || null), 250);
    };

    const onFocusOut = (e: Event) => {
      if (!isFormControl(e.target)) return;
      const el = e.target as HTMLElement;
      snapshotViewport('focusout', el);
      globalThis.setTimeout(() => snapshotViewport('focusout.after250', el), 250);
      globalThis.setTimeout(() => snapshotViewport('focusout.after800', el), 800);
      const baseScaleMode = updateBaseScaleClass('focusout');
      // If we're in the "980px base viewport" mode, meta viewport toggling doesn't reliably change it.
      // Instead we compensate via CSS sizing (ck-ios-basescale). Don't spam viewport resets on every blur.
      if (baseScaleMode) {
        applyDesired();
        return;
      }
      // If iOS zoomed the page, try to reset after blur.
      const vv = globalThis.visualViewport || null;
      const looksZoomedByScale = !!(vv && typeof vv.scale === 'number' && vv.scale > 1.01);
      if (looksZoomedByScale) {
        forceReset('blurZoomed', e.target as HTMLElement);
      } else {
        applyDesired();
        reapplySoon();
      }
    };

    const vv = globalThis.visualViewport || null;
    const onVvResize = () => {
      // Keyboard open/close triggers visualViewport resize; if scale drifted, try to reset.
      const v = globalThis.visualViewport;
      if (!v) return;
      const looksZoomedByScale = typeof v.scale === 'number' && v.scale > 1.01;
      const baseScaleMode = updateBaseScaleClass('vvresize');
      // Avoid noisy logs/resets in base-scale mode; compensation is CSS-driven there.
      if (baseScaleMode) {
        if (!looksZoomedByScale) applyDesired();
        return;
      }
      if (looksZoomedByScale) {
        forceReset('vvResizeZoomed');
      } else {
        applyDesired();
      }
    };

    const maybeFixInitialBaseScale = (label: string) => {
      // Just re-check class application (measurements can stabilize after load).
      updateBaseScaleClass(`init.${label}`);
    };

    // Apply before focus happens (best-effort) and again on focus.
    const preFocusOpts: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener('pointerdown', onPreFocus, preFocusOpts);
    document.addEventListener('touchstart', onPreFocus, preFocusOpts);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener?.('resize', onVvResize);

    // Also try to normalize the base scale shortly after mount. This prevents the
    // "everything is small until first focus, then it zooms and stays" behavior.
    globalThis.setTimeout(() => maybeFixInitialBaseScale('t0'), 0);
    globalThis.setTimeout(() => maybeFixInitialBaseScale('t250'), 250);
    globalThis.setTimeout(() => maybeFixInitialBaseScale('t900'), 900);

    return () => {
      document.removeEventListener('pointerdown', onPreFocus, preFocusOpts);
      document.removeEventListener('touchstart', onPreFocus, preFocusOpts);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener?.('resize', onVvResize);
    };
  }, [debugEnabled]);

  const openExistingRecordFromDedup = useCallback(
    async (args: { recordId: string; rowNumber?: number | null; source: string; view?: 'auto' | 'form' | 'summary' }): Promise<boolean> => {
      const id = (args.recordId || '').toString().trim();
      if (!id) return false;
      bumpRecordSession({ reason: 'dedup.openExisting', nextRecordId: id });
      const rowNumberRaw = args.rowNumber;
      const rowNumber =
        rowNumberRaw === undefined || rowNumberRaw === null || !Number.isFinite(Number(rowNumberRaw))
          ? undefined
          : Number(rowNumberRaw);
      const requestedView = (args.view || 'auto').toString().trim().toLowerCase() as 'auto' | 'form' | 'summary';

      // Clear transient status before navigation.
      setStatus(null);
      setStatusLevel(null);
      setRecordLoadError(null);

      // Prefer cached record (instant).
      const cached = listCache.records[id];
      if (cached) {
        applyRecordSnapshot(cached);
        const statusRaw = ((cached.status || '') as any)?.toString?.() || '';
        const summaryEnabled = definition.summaryViewEnabled !== false;
        const resolved = resolveStatusAutoView(statusRaw, summaryEnabled);
        const targetView =
          requestedView === 'form' ? 'form' : requestedView === 'summary' ? (summaryEnabled ? 'summary' : 'form') : resolved.view;
        setView(targetView);
        logEvent('dedup.precreate.openExisting.viewByStatus', {
          source: args.source,
          recordId: id,
          status: statusRaw || null,
          statusKey: resolved.statusKey,
          nextView: targetView,
          requestedView
        });
        logEvent('dedup.precreate.openExisting.cached', { source: args.source, recordId: id });
        return true;
      }

      const ok = await loadRecordSnapshot(id, rowNumber);
      if (!ok) {
        logEvent('dedup.precreate.openExisting.notFound', { source: args.source, recordId: id, rowNumber: rowNumber ?? null });
        return false;
      }
      const statusRaw = ((selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() || '';
      const summaryEnabled = definition.summaryViewEnabled !== false;
      const resolved = resolveStatusAutoView(statusRaw, summaryEnabled);
      const targetView =
        requestedView === 'form' ? 'form' : requestedView === 'summary' ? (summaryEnabled ? 'summary' : 'form') : resolved.view;
      setView(targetView);
      logEvent('dedup.precreate.openExisting.viewByStatus', {
        source: args.source,
        recordId: id,
        status: statusRaw || null,
        statusKey: resolved.statusKey,
        nextView: targetView,
        requestedView
      });
      logEvent('dedup.precreate.openExisting.ok', { source: args.source, recordId: id, rowNumber: rowNumber ?? null });
      return true;
    },
    [
      applyRecordSnapshot,
      bumpRecordSession,
      definition.summaryViewEnabled,
      listCache.records,
      loadRecordSnapshot,
      logEvent,
      resolveStatusAutoView
    ]
  );

  const precheckCreateDedupAndMaybeNavigate = useCallback(
    async (args: {
      values: Record<string, FieldValue>;
      lineItems: LineItemState;
      source: string;
      onDuplicate?: (conflict: DedupConflictInfo) => Promise<boolean | void> | boolean | void;
    }): Promise<boolean> => {
      if (
        createFlowRef.current &&
        hasInvalidRejectDedupKeyValues({
          dedupRules: (definition as any)?.dedupRules,
          questions: definition.questions,
          values: args.values as any,
          lineItems: args.lineItems,
          language: languageRef.current
        })
      ) {
        logEvent('dedup.precreate.check.blocked.invalidKeys', { source: args.source });
        return false;
      }
      const signature = computeDedupSignatureFromValues(dedupPrecheckRules, args.values as any);
      if (!signature) return false;
      const startedAt = Date.now();
      setPrecreateDedupChecking(true);
      logEvent('dedup.precreate.check.start', { source: args.source, signatureLen: signature.length });
      try {
        const payload = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: args.values,
          lineItems: args.lineItems
        }) as any;
        const res = await checkDedupConflictApi(payload);
        if (!res?.success) {
          const msg = (res?.message || 'Failed').toString();
          logEvent('dedup.precreate.check.failed', { source: args.source, message: msg });
          return false;
        }
        const conflict: any = (res as any)?.conflict || null;
        const existingRecordId = (conflict?.existingRecordId || '').toString().trim();
        const existingRowNumber = Number.isFinite(Number(conflict?.existingRowNumber)) ? Number(conflict?.existingRowNumber) : undefined;
        if (!existingRecordId) {
          logEvent('dedup.precreate.check.ok', { source: args.source });
          return false;
        }
        const conflictInfo: DedupConflictInfo = {
          ruleId: (conflict?.ruleId || 'dedup').toString(),
          message: (conflict?.message || '').toString(),
          existingRecordId,
          existingRowNumber
        };
        logEvent('dedup.precreate.conflict', {
          source: args.source,
          existingRecordId,
          existingRowNumber: existingRowNumber ?? null
        });
        if (args.onDuplicate) {
          const handled = await args.onDuplicate(conflictInfo);
          if (handled) return true;
        }
        await openExistingRecordFromDedup({
          recordId: existingRecordId,
          rowNumber: existingRowNumber,
          source: args.source
        });
        return true;
      } catch (err: any) {
        const msg = (err?.message || err?.toString?.() || 'Failed').toString();
        logEvent('dedup.precreate.check.exception', { source: args.source, message: msg });
        return false;
      } finally {
        setPrecreateDedupChecking(false);
        logEvent('dedup.precreate.check.end', { source: args.source, durationMs: Date.now() - startedAt });
      }
    },
    [dedupPrecheckRules, definition, formKey, logEvent, openExistingRecordFromDedup]
  );

  const newRecordActionState = {
    bumpRecordSession,
    resetFieldChangeTransientState,
    rememberAutoSaveSeenState,
    createFlowRef,
    createFlowUserEditedRef,
    autoSaveUserEditedRef,
    dedupHoldRef,
    autoSaveDirtyRef,
    autoSaveTimerRef,
    setDraftSave,
    setDedupChecking,
    setDedupConflict,
    setDedupNotice,
    dedupCheckingRef,
    dedupConflictRef,
    lastDedupCheckedSignatureRef,
    dedupBaselineSignatureRef,
    dedupKeyFingerprintBaselineRef,
    dedupDeleteOnKeyChangeInFlightRef,
    recordStaleRef,
    setRecordStale,
    recordDataVersionRef,
    optimisticClientDataVersionRef,
    recordRowNumberRef,
    setValues,
    setLineItems,
    setErrors,
    setValidationWarnings,
    setValidationAttempted,
    setValidationNoticeHidden,
    setStatus,
    setStatusLevel,
    setSelectedRecordId,
    setSelectedRecordSnapshot,
    setLastSubmissionMeta,
    setView
  };

  const handleSubmitAnother = useCreateNewRecordAction({
    definition,
    logEvent,
    precheckCreateDedupAndMaybeNavigate,
    ...newRecordActionState
  });

  const handleDuplicateCurrent = useDuplicateCurrentRecordAction({
    definition,
    language,
    languageRef,
    logEvent,
    copyRecordBusy,
    precheckCreateDedupAndMaybeNavigate,
    openCopyCurrentRecordDialogIfConfigured,
    ensureDraftRecordIdActionRef,
    recordSessionRef,
    valuesRef,
    lineItemsRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    copyCurrentRecordDestructiveChangeBypassFieldIdsRef,
    ...newRecordActionState
  });

  const CK_BUTTON_IDX_TOKEN = '__ckQIdx=';
  const parseButtonRef = useCallback((ref: string): { id: string; qIdx?: number } => {
    const raw = (ref || '').toString();
    const pos = raw.lastIndexOf(CK_BUTTON_IDX_TOKEN);
    if (pos < 0) return { id: raw };
    const id = raw.slice(0, pos);
    const idxRaw = raw.slice(pos + CK_BUTTON_IDX_TOKEN.length);
    const qIdx = Number.parseInt(idxRaw, 10);
    if (!Number.isFinite(qIdx)) return { id: raw };
    return { id, qIdx };
  }, []);

  const handleReportButtonPointerDown = useCallback(
    (buttonId: string) => {
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const action = (((btn as any)?.button?.action || '') as string).toString().trim();
      if (!shouldArmAutoSaveHoldForReportAction(action)) return;
      setAutoSaveHoldFromUi(true, { reason: 'reportPreview' });
    },
    [definition.questions, parseButtonRef, setAutoSaveHoldFromUi]
  );

  const encodeButtonRef = useCallback(
    (id: string, qIdx?: number) => {
      const base = (id || '').toString();
      if (qIdx === undefined || qIdx === null || !Number.isFinite(qIdx)) return base;
      return `${base}${CK_BUTTON_IDX_TOKEN}${qIdx}`;
    },
    []
  );

  const resolveOpenUrlFieldHref = useCallback((fieldIdRaw: string): string => {
    const fieldId = (fieldIdRaw || '').toString().trim();
    if (!fieldId) return '';

    const splitUrlList = (raw: string): string[] => {
      const trimmed = (raw || '').toString().trim();
      if (!trimmed) return [];
      const commaParts = trimmed
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      if (commaParts.length > 1) return commaParts;
      const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
      if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
      return [trimmed];
    };

    const recordId =
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '';
    const current = selectedRecordSnapshotRef.current || null;
    const raw = (() => {
      if (fieldId === 'pdfUrl') return (current as any)?.pdfUrl || '';
      if (fieldId === 'id') return recordId;
      const v = (valuesRef.current as any)?.[fieldId];
      if (v === undefined || v === null) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.join(' ');
      if (typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url;
      try {
        return v.toString();
      } catch {
        return '';
      }
    })();

    const urls = splitUrlList(raw).filter(u => /^https?:\/\//i.test(u));
    return urls[0] || '';
  }, []);

  const customButtons = useAppCustomButtons({
    definition,
    language,
    values,
    lineItems,
    view,
    selectedRecordId,
    selectedRecordSnapshot,
    lastSubmissionMeta,
    guidedDataSourceConfigMap,
    encodeButtonRef,
    resolveOpenUrlFieldHref
  });

  const {
    openPdfPreviewWindow,
    openReport,
    openStoredPdfPreview,
    openMarkdown,
    openHtml
  } = useAppReportPreviewActions({
    definition,
    formKey,
    languageRef,
    valuesRef,
    lineItemsRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    reportPdfSeqRef,
    setReportOverlay,
    parseButtonRef,
    logEvent,
    resolveUiErrorMessage,
    resolveLogMessage
  });

  const createRecordFromPreset = useCreateRecordPresetAction({
    definition,
    view,
    parseButtonRef,
    logEvent,
    precheckCreateDedupAndMaybeNavigate,
    ...newRecordActionState,
    valuesRef,
    lineItemsRef,
    setRecordLoadError,
    setPrefetchedSummaryHtml,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    setListDedupPrompt
  });

  const openUrlFieldAction = useOpenUrlFieldAction({
    languageRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    resolveOpenUrlFieldHref,
    setStatus,
    setStatusLevel,
    logEvent
  });

  const runUpdateRecordButtonAction = useUpdateRecordButtonAction({
    definition,
    formKey,
    customConfirm,
    updateRecordBusy,
    updateRecordActionInFlightRef,
    languageRef,
    valuesRef,
    lineItemsRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    recordDataVersionRef,
    recordRowNumberRef,
    recordSessionRef,
    uploadQueueRef,
    autoSaveInFlightRef,
    recordStaleRef,
    ensureDraftRecordIdActionRef,
    flushPendingDraftSaveActionRef,
    submitCurrentRecordMutation,
    waitForActiveDraftSaveTransactions,
    logEvent,
    perfMark,
    perfMeasure,
    setDraftSave,
    setStatus,
    setStatusLevel,
    setLastSubmissionMeta,
    setSelectedRecordSnapshot,
    setValues,
    setView,
    upsertListCacheRow,
    synchronizeStaleRecord
  });

  const handleCustomButton = useCallback(
    (
      buttonId: string,
      opts?: {
        skipConfirm?: boolean;
        source?: string;
        runtimeValues?: Record<string, any>;
      }
    ) => {
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const cfg: any = btn ? (btn as any).button : null;
      const action = (cfg?.action || '').toString().trim();
      logEvent('ui.customButton.click', { buttonId: baseId, qIdx: qIdx ?? null, action: action || null });

      const hiddenTemplateAction = isHiddenHtmlTemplateUpdateRecordAction({
        button: btn || null,
        action,
        source: opts?.source || null,
        values: valuesRef.current,
        lineItems: lineItemsRef.current,
        recordMeta: {
          id: selectedRecordIdRef.current || selectedRecordSnapshotRef.current?.id || lastSubmissionMetaRef.current?.id,
          createdAt: selectedRecordSnapshotRef.current?.createdAt || lastSubmissionMetaRef.current?.createdAt,
          updatedAt: selectedRecordSnapshotRef.current?.updatedAt || lastSubmissionMetaRef.current?.updatedAt,
          status: selectedRecordSnapshotRef.current?.status || lastSubmissionMetaRef.current?.status || null,
          pdfUrl: selectedRecordSnapshotRef.current?.pdfUrl || undefined
        }
      });
      if (hiddenTemplateAction) {
        const message = tSystem('actions.notAvailable', languageRef.current, 'Action is not available.');
        setStatus(message);
        setStatusLevel('error');
        logEvent('ui.customButton.blocked.hiddenTemplateAction', {
          buttonId: baseId,
          qIdx: qIdx ?? null,
          action
        });
        return;
      }

      if (action === 'renderDocTemplate') {
        const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Report');
        const loadingLabelResolved = resolveLocalizedString((cfg as any)?.loadingLabel, languageRef.current, '').toString().trim();
        const popup = openPdfPreviewWindow({
          title,
          subtitle: definition.title,
          language: languageRef.current,
          loadingLabel: loadingLabelResolved || undefined
        });
        if (!popup) {
          logEvent('report.pdfPreview.popupBlocked', { buttonId: baseId, qIdx: qIdx ?? null });
        } else {
          logEvent('report.pdfPreview.popupOpened', { buttonId: baseId, qIdx: qIdx ?? null });
        }
        openReport({ buttonId, popup });
        return;
      }
      if (action === 'openUrlField') {
        const fieldId = (cfg?.fieldId || '').toString().trim();
        const href = resolveOpenUrlFieldHref(fieldId);
        if (
          shouldUseInAppPdfPreview({
            action,
            fieldId,
            href,
            env: readOpenUrlRuntimeEnvironment()
          })
        ) {
          const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Report');
          const popup = openPdfPreviewWindow({
            title,
            subtitle: definition.title,
            language: languageRef.current,
            loadingLabel: tSystem('report.loadingPdf', languageRef.current, 'Loading PDF…')
          });
          if (!popup) {
            logEvent('report.storedPdfPreview.popupBlocked', { buttonId: baseId, qIdx: qIdx ?? null, fieldId });
          } else {
            logEvent('report.storedPdfPreview.popupOpened', { buttonId: baseId, qIdx: qIdx ?? null, fieldId });
          }
          openStoredPdfPreview({ buttonId, fieldId, popup });
          return;
        }
        openUrlFieldAction({ baseId, qIdx, fieldId });
        return;
      }
      if (action === 'renderMarkdownTemplate') {
        openMarkdown(buttonId);
        return;
      }
      if (action === 'renderHtmlTemplate') {
        openHtml(buttonId);
        return;
      }
      if (action === 'createRecordPreset') {
        void createRecordFromPreset({ buttonId, presetValues: (cfg?.presetValues || {}) as any });
        return;
      }
      if (action === 'updateRecord') {
        runUpdateRecordButtonAction({
          buttonId,
          baseId,
          qIdx,
          btn,
          cfg,
          skipConfirm: opts?.skipConfirm === true,
          runtimeValues: opts?.runtimeValues
        });
        return;
      }

      logEvent('ui.customButton.unsupported', { buttonId: baseId, qIdx: qIdx ?? null, action: action || null });
    },
    [
      createRecordFromPreset,
      definition,
      logEvent,
      openHtml,
      openMarkdown,
      openStoredPdfPreview,
      openUrlFieldAction,
      openPdfPreviewWindow,
      openReport,
      parseButtonRef,
      resolveOpenUrlFieldHref,
      runUpdateRecordButtonAction
    ]
  );

  const closeReportOverlay = useCallback(() => {
    // Cancel any in-flight report request so late responses can't re-open/overwrite the overlay.
    reportPdfSeqRef.current += 1;
    setReportOverlay(prev => ({
      ...(prev || { title: '' }),
      open: false,
      kind: 'pdf',
      pdfPhase: 'idle',
      pdfObjectUrl: undefined,
      pdfFileName: undefined,
      pdfMessage: undefined,
      markdown: undefined,
      html: undefined,
      buttonId: undefined
    }));
  }, []);

  useEffect(() => {
    const shouldHold = shouldHoldAutoSaveForReportOverlay(reportOverlay);
    const currentReason = (autoSaveHoldRef.current.reason || '').toString();
    if (shouldHold) {
      if (autoSaveHoldRef.current.hold && currentReason === 'reportPreview') return;
      setAutoSaveHoldFromUi(true, { reason: 'reportPreview' });
      return;
    }
    if (autoSaveHoldRef.current.hold && currentReason === 'reportPreview') {
      setAutoSaveHoldFromUi(false, { reason: 'reportPreview' });
    }
  }, [reportOverlay, setAutoSaveHoldFromUi]);

  const summaryViewEnabled = definition.summaryViewEnabled !== false;
  const copyCurrentRecordEnabled = definition.copyCurrentRecordEnabled !== false;
  const finalSubmitButtonLabelConfig = definition.submitButtonLabel || definition.steps?.stepSubmitLabel;
  const submitButtonLabelResolved = useMemo(
    () =>
      resolveLocalizedString(
        finalSubmitButtonLabelConfig,
        language,
        tSystem('submit.confirm', language, tSystem('actions.submit', language, 'Submit'))
      ),
    [finalSubmitButtonLabelConfig, language]
  );
  const submitPreviousActionRetryMessage = useCallback(
    () =>
      tSystem(
        'submit.previousActionRetry',
        languageRef.current,
        'Something went wrong while finishing the previous action. Please click {action} again.',
        {
          action:
            (submitButtonLabelResolved || '').toString().trim() ||
            tSystem('actions.submit', languageRef.current, 'Submit')
        }
      ),
    [submitButtonLabelResolved]
  );
  const waitForPendingFollowupBatch = usePendingFollowupBatchWait({
    pendingFollowupBatchPromisesRef,
    recordSessionRef,
    submitPreviousActionRetryMessage,
    logEvent
  });
  const {
    submitConfirmationDialogConfig,
    submitProgressDialogConfig,
    submitConfirmConfirmLabelResolved,
    submitConfirmCancelLabelResolved,
    submitConfirmTitle,
    submitBlockingTitle,
    resolveDialogTemplate,
    resolveGuidedUploadWaitDialog,
    submitConfirmMessage
  } = useAppSubmitDialogConfig({
    definition,
    language,
    languageRef,
    values,
    lineItems,
    guidedUiState,
    submitButtonLabelResolved,
    selectedRecordId,
    lastSubmissionMeta,
    optionState
  });

  const requestSubmit = useCallback(() => {
    if (submitting) return;
    if (recordLoadingId) return;
    if (updateRecordBusyOpen) return;
    if (view !== 'form') return;
    submitConfirmedRef.current = false;
    logEvent('ui.submit.tap', { submitLabelOverridden: Boolean(finalSubmitButtonLabelConfig) });
    formSubmitActionRef.current?.();
  }, [finalSubmitButtonLabelConfig, logEvent, recordLoadingId, submitting, updateRecordBusyOpen, view]);

  const cancelSubmitConfirm = useCallback(() => {
    setSubmitConfirmOpen(false);
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = false;
    logEvent('ui.submitConfirm.cancel');
  }, [logEvent]);

  const confirmSubmit = useCallback(() => {
    setSubmitConfirmOpen(false);
    submitConfirmedRef.current = true;
    logEvent('ui.submitConfirm.confirm');
    if (viewRef.current === 'summary') {
      void handleSubmitRef.current();
      return;
    }
    formSubmitActionRef.current?.();
  }, [logEvent]);

  const autoSaveDebounceMs = (() => {
    const raw = definition.autoSave?.debounceMs;
    const n = raw === undefined || raw === null ? NaN : Number(raw);
    if (!Number.isFinite(n)) return 2000;
    return Math.max(300, Math.min(60000, Math.floor(n)));
  })();
  const autoSaveDefaultStatus = (() => {
    const fromTransitions = resolveStatusTransitionValue(statusTransitions, 'inProgress', language);
    if (fromTransitions !== undefined && fromTransitions !== null && fromTransitions.toString().trim()) {
      return fromTransitions.toString().trim();
    }
    const explicit = definition.autoSave?.status;
    if (explicit !== undefined && explicit !== null && explicit.toString().trim()) {
      return explicit.toString().trim();
    }
    return 'In progress';
  })();
  const renderedAutoSaveStateFingerprint = useMemo(
    () =>
      buildPersistedDraftStateFingerprint({
        language,
        values,
        lineItems
      }),
    [buildPersistedDraftStateFingerprint, language, lineItems, values]
  );
  latestRenderedAutoSaveStateFingerprintRef.current = renderedAutoSaveStateFingerprint;
  const resolveAutoSaveStatus = useCallback(
    (rawStatus: any): string => {
      const trimmed = rawStatus === undefined || rawStatus === null ? '' : rawStatus.toString().trim();
      return trimmed || autoSaveDefaultStatus;
    },
    [autoSaveDefaultStatus]
  );

  const isClosedRecord = (() => {
    const raw = (lastSubmissionMeta?.status || selectedRecordSnapshot?.status || '').toString();
    return matchesStatusTransition(raw, statusTransitions, 'onClose', { includeDefaultOnClose: true });
  })();

  const formViewCurrentRecord =
    selectedRecordSnapshot || (selectedRecordId && !recordLoadingId ? listCache.records[selectedRecordId] : null);

  const formRecordMeta = useMemo(
    () => ({
      id: (formViewCurrentRecord?.id || lastSubmissionMeta?.id || selectedRecordId || undefined) as any,
      createdAt: (formViewCurrentRecord?.createdAt || lastSubmissionMeta?.createdAt || undefined) as any,
      updatedAt: (formViewCurrentRecord?.updatedAt || lastSubmissionMeta?.updatedAt || undefined) as any,
      status: resolveUiRecordStatus({
        persistedStatus: formViewCurrentRecord?.status || lastSubmissionMeta?.status || null,
        autoSaveDefaultStatus,
        guidedForwardGateSatisfied: guidedUiState?.forwardGateSatisfied === true
      }) as any,
      pdfUrl: (formViewCurrentRecord?.pdfUrl || undefined) as any
    }),
    [
      autoSaveDefaultStatus,
      formViewCurrentRecord?.createdAt,
      formViewCurrentRecord?.id,
      formViewCurrentRecord?.pdfUrl,
      formViewCurrentRecord?.status,
      formViewCurrentRecord?.updatedAt,
      guidedUiState?.forwardGateSatisfied,
      lastSubmissionMeta?.createdAt,
      lastSubmissionMeta?.id,
      lastSubmissionMeta?.status,
      lastSubmissionMeta?.updatedAt,
      selectedRecordId
    ]
  );

  const dedupSignature = useMemo(() => {
    const startMark = `ck.selector.dedupSignature.start.${Date.now()}`;
    const endMark = `ck.selector.dedupSignature.end.${Date.now()}`;
    perfMark(startMark);
    const signature = computeDedupSignatureFromValues(dedupPrecheckRules, values as any);
    perfMark(endMark);
    perfMeasure('ck.selector.dedupSignature', startMark, endMark, {
      valueCount: Object.keys(values || {}).length,
      signatureLength: (signature || '').toString().length
    });
    return signature;
  }, [dedupPrecheckRules, perfMark, perfMeasure, values]);

  useEffect(() => {
    dedupTriggerFieldIdsRef.current = dedupTriggerFieldIdMap;
  }, [dedupTriggerFieldIdMap]);

  useEffect(() => {
    dedupIdentityFieldIdsRef.current = dedupIdentityFieldIdMap;
  }, [dedupIdentityFieldIdMap]);

  useEffect(() => {
    dedupSignatureRef.current = dedupSignature;
  }, [dedupSignature]);

  const createFlowDedupKeyValuesInvalid =
    view === 'form' &&
    createFlowRef.current &&
    hasInvalidRejectDedupKeyValues({
      dedupRules: (definition as any)?.dedupRules,
      questions: definition.questions,
      values: values as any,
      lineItems,
      language
    });
  const dedupSignatureValue = (dedupSignature || '').toString();
  const dedupNavigationBlocked =
    view === 'form' &&
    !createFlowDedupKeyValuesInvalid &&
    (dedupChecking ||
      isBlockingDedupConflict(dedupConflict) ||
      Boolean(dedupSignatureValue && lastDedupCheckedSignatureRef.current !== dedupSignatureValue));

  // Dedup precheck (server-side) so we can block duplicate creation early (before autosave/submit).
  useEffect(() => {
    // Only relevant while editing.
    if (view !== 'form') return;

    const signature = (dedupSignature || '').toString();
    const existingRecordId = resolveExistingRecordId({
      selectedRecordId,
      selectedRecordSnapshot,
      lastSubmissionMetaId: lastSubmissionMeta?.id || null
    });
    const candidateId = existingRecordId ? existingRecordId.toString() : '';
    const showDedupProgress = dedupCheckDialogEnabled && createFlowRef.current;
    // Only de-duplicate by signature; the candidate id can change after draft creation and should not force a re-check.
    const checkKey = signature;

    // Clear pending timer (signature might be changing).
    if (dedupCheckTimerRef.current) {
      globalThis.clearTimeout(dedupCheckTimerRef.current);
      dedupCheckTimerRef.current = null;
    }

    if (!signature) {
      hideDedupProgressDialog();
      lastDedupCheckedSignatureRef.current = '';
      dedupCheckSeqRef.current += 1;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      return;
    }

    if (
      createFlowRef.current &&
      hasInvalidRejectDedupKeyValues({
        dedupRules: (definition as any)?.dedupRules,
        questions: definition.questions,
        values: valuesRef.current as any,
        lineItems: lineItemsRef.current,
        language: languageRef.current
      })
    ) {
      hideDedupProgressDialog();
      lastDedupCheckedSignatureRef.current = '';
      dedupCheckSeqRef.current += 1;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      logEvent('dedup.check.blocked.invalidKeys', { signatureLen: signature.length });
      return;
    }

    if (checkKey === lastDedupCheckedSignatureRef.current) return;
    lastDedupCheckedSignatureRef.current = checkKey;
    // Update refs synchronously so autosave gating cannot race on state updates.
    dedupCheckingRef.current = true;
    dedupConflictRef.current = null;
    setDedupChecking(true);
    setDedupConflict(null);
    if (showDedupProgress) {
      showDedupProgressDialog({
        phase: 'checking',
        title: dedupCheckDialogCopy.checkingTitle,
        message: dedupCheckDialogCopy.checkingMessage
      });
    }
    const seq = ++dedupCheckSeqRef.current;
    const sessionAtStart = recordSessionRef.current;
    const shouldApplyCheckResult = (phase: string): boolean => {
      const apply = shouldApplyDedupPrecheckResult({
        requestSeq: seq,
        currentSeq: dedupCheckSeqRef.current,
        sessionAtStart,
        currentSession: recordSessionRef.current,
        signatureAtStart: signature,
        currentSignature: dedupSignatureRef.current,
        currentView: viewRef.current
      });
      if (!apply) {
        logEvent('dedup.check.staleResultDiscarded', {
          phase,
          recordId: candidateId || null,
          requestSeq: seq,
          currentSeq: dedupCheckSeqRef.current,
          sessionAtStart,
          currentSession: recordSessionRef.current,
          view: viewRef.current,
          signatureLen: signature.length,
          currentSignatureLen: (dedupSignatureRef.current || '').toString().length
        });
      }
      return apply;
    };
    logEvent('dedup.check.start', { recordId: candidateId || null, signatureLen: signature.length, sessionAtStart });

    // Debounce to avoid spamming Apps Script while the user is still selecting values.
    dedupCheckTimerRef.current = globalThis.setTimeout(() => {
      const payload = buildDraftPayload({
        definition,
        formKey,
        language: languageRef.current,
        values: valuesRef.current,
        lineItems: lineItemsRef.current,
        existingRecordId: candidateId || undefined
      }) as any;

      checkDedupConflictApi(payload)
        .then(res => {
          if (!shouldApplyCheckResult('success')) return;
          dedupCheckingRef.current = false;
          setDedupChecking(false);

          if (!res?.success) {
            const msg = (res?.message || 'Failed to check duplicates.').toString();
            logEvent('dedup.check.failed', { recordId: candidateId || null, message: msg });
            hideDedupProgressDialog();
            dedupConflictRef.current = null;
            setDedupConflict(null);
            return;
          }

          const conflict = (res as any)?.conflict || null;
          if (conflict && conflict.message) {
            const message = (conflict.message || '').toString();
            const conflictObj = {
              ruleId: (conflict.ruleId || 'dedup').toString(),
              message,
              existingRecordId: conflict.existingRecordId ? conflict.existingRecordId.toString() : undefined,
              existingRowNumber: Number.isFinite(Number(conflict.existingRowNumber)) ? Number(conflict.existingRowNumber) : undefined
            };
            dedupConflictRef.current = conflictObj;
            setDedupNotice(conflictObj);
            // Cancel any pending autosave for the now-invalid (duplicate) values.
            autoSaveDirtyRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            // Hide stale saved banner while dedup is blocking.
            setDraftSave({ phase: 'idle' });
            setDedupConflict(conflictObj);
            logEvent('dedup.conflict', {
              recordId: candidateId || null,
              ruleId: (conflict.ruleId || '').toString(),
              existingRecordId: conflict.existingRecordId ? conflict.existingRecordId.toString() : null
            });
            if (showDedupProgress) {
              showDedupProgressDialog({
                phase: 'duplicate',
                title: dedupCheckDialogCopy.duplicateTitle,
                message: dedupCheckDialogCopy.duplicateMessage,
                autoCloseMs: dedupCheckDialogCopy.duplicateAutoCloseMs
              });
            }
            return;
          }

          dedupConflictRef.current = null;
          setDedupConflict(null);
          logEvent('dedup.ok', { recordId: candidateId || null });
          if (
            showDedupProgress &&
            shouldShowDedupProgressDialogState({
              title: dedupCheckDialogCopy.availableTitle,
              message: dedupCheckDialogCopy.availableMessage
            })
          ) {
            showDedupProgressDialog({
              phase: 'available',
              title: dedupCheckDialogCopy.availableTitle,
              message: dedupCheckDialogCopy.availableMessage,
              autoCloseMs: dedupCheckDialogCopy.availableAutoCloseMs
            });
          } else {
            hideDedupProgressDialog();
          }
        })
        .catch(err => {
          if (!shouldApplyCheckResult('error')) return;
          dedupCheckingRef.current = false;
          setDedupChecking(false);
          const logMessage = resolveLogMessage(err, 'Failed to check duplicates.');
          logEvent('dedup.check.exception', { recordId: candidateId || null, message: logMessage });
          dedupConflictRef.current = null;
          setDedupConflict(null);
          hideDedupProgressDialog();
        });
    }, 350) as any;

    return () => {
      if (dedupCheckTimerRef.current) {
        globalThis.clearTimeout(dedupCheckTimerRef.current);
        dedupCheckTimerRef.current = null;
      }
    };
  }, [
    dedupCheckDialogCopy.availableAutoCloseMs,
    dedupCheckDialogCopy.availableMessage,
    dedupCheckDialogCopy.availableTitle,
    dedupCheckDialogCopy.duplicateAutoCloseMs,
    dedupCheckDialogCopy.duplicateMessage,
    dedupCheckDialogCopy.duplicateTitle,
    dedupCheckDialogCopy.checkingMessage,
    dedupCheckDialogCopy.checkingTitle,
    dedupCheckDialogEnabled,
    dedupSignature,
    definition,
    formKey,
    hideDedupProgressDialog,
    loadRecordSnapshot,
    logEvent,
    resolveLogMessage,
    selectedRecordId,
    selectedRecordSnapshot,
    showDedupProgressDialog,
    lastSubmissionMeta?.id,
    view
  ]);

  const applyServerGeneratedTopValues = useServerGeneratedTopValues({
    valuesRef,
    selectedRecordSnapshotRef,
    setValues,
    setSelectedRecordSnapshot,
    logEvent
  });

  const performAutoSave: (reason: string) => Promise<void> = useCallback(
    async (reason: string): Promise<void> => {
      if (!autoSaveEnabled) return;
      if (submittingRef.current) return;
      // Avoid racing uploads: file upload flow already persists changes (and uses optimistic locking).
      // Running autosave concurrently can create spurious "stale" banners and duplicate saves.
      if (uploadQueueRef.current.size > 0) {
        autoSaveDirtyRef.current = true;
        blockAutoSaveForInFlight({
          blocker: 'upload',
          token: uploadQueueRef.current.size,
          eventName: 'autosave.blocked.uploadInFlight',
          details: { reason, inFlight: uploadQueueRef.current.size }
        });
        return;
      }

      if (recordSyncPromiseRef.current) {
        autoSaveDirtyRef.current = true;
        blockAutoSaveForInFlight({
          blocker: 'recordSync',
          token: recordSyncPromiseRef.current,
          eventName: 'autosave.blocked.recordSyncInFlight',
          details: { reason }
        });
        return;
      }

      if (guidedStepImmediateSyncPromiseRef.current) {
        autoSaveDirtyRef.current = true;
        blockAutoSaveForInFlight({
          blocker: 'guidedStepLiveSync',
          token: guidedStepImmediateSyncPromiseRef.current,
          eventName: 'autosave.blocked.guidedStepLiveSync',
          details: { reason }
        });
        return;
      }

      const statusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
        '';
      if (matchesClosedStatus(statusRaw)) {
        setDraftSave(prev => (prev.phase === 'paused' ? prev : { phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') }));
        return;
      }
      const statusForSave = resolveAutoSaveStatus(statusRaw);

      // If the record is stale (modified elsewhere), do not autosave; user must refresh first.
      if (recordStaleRef.current) {
        autoSaveDirtyRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setDraftSave({ phase: 'idle' });
        logEvent('autosave.blocked.recordStale', { reason, recordId: (recordStaleRef.current.recordId || '').toString() });
        return;
      }

      if (autoSaveHoldRef.current?.hold) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logAutoSaveBlockedByHold(reason);
        return;
      }

      // In create-flow, do not autosave until the user actually changes a field value.
      if (createFlowRef.current && !createFlowUserEditedRef.current) return;

      // If a dedup-key change is being validated (or dedup precheck is running), hold autosave until resolved.
      if (
        dedupHoldRef.current ||
        dedupCheckingRef.current ||
        dedupDeleteOnKeyChangePendingRef.current ||
        dedupDeleteOnKeyChangeInFlightRef.current
      ) {
        logEvent('autosave.blocked.dedupMutationOwner', {
          reason,
          dedupHold: dedupHoldRef.current,
          dedupChecking: dedupCheckingRef.current,
          dedupDeletePending: dedupDeleteOnKeyChangePendingRef.current,
          dedupDeleteInFlight: dedupDeleteOnKeyChangeInFlightRef.current
        });
        return;
      }

      if (!autoSaveDirtyRef.current) {
        logEvent('autosave.skip.clean', { reason });
        return;
      }

      const existingRecordId = resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      });
      if (existingRecordId && pendingFollowupBatchPromisesRef.current.has(existingRecordId)) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.pendingFollowup', { reason, recordId: existingRecordId });
        return;
      }

      const isCreateFlow = createFlowRef.current || !existingRecordId;
      const sessionAtStart = recordSessionRef.current;
      const localMutationAtAutoSaveStart = lastLocalRecordMutationAtRef.current || 0;
      const valuesSnapshot = valuesRef.current;
      const lineItemsSnapshot = lineItemsRef.current;
      const withUploadOverrides = applyUploadedFieldOverrides({
        values: valuesSnapshot,
        lineItems: lineItemsSnapshot
      });
      const languageSnapshot = languageRef.current;
      const hasConfiguredAutoSaveGate = autoSaveEnableFieldIds.length > 0;

      if (isCreateFlow && hasConfiguredAutoSaveGate && hasIncompleteConfiguredFields(autoSaveEnableFieldIds, valuesSnapshot as any)) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.configuredFieldsIncomplete', {
          reason,
          isCreateFlow: true,
          fields: autoSaveEnableFieldIds
        });
        return;
      }

      if (isCreateFlow && ingredientsFormActive && !hasConfiguredAutoSaveGate && !isIngredientCreateAutoSaveReady(valuesSnapshot as any)) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.ingredients.createRequirements', { reason, isCreateFlow: true });
        return;
      }

      const createFlowDedupKeysIncomplete =
        isCreateFlow && !hasConfiguredAutoSaveGate && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesSnapshot as any);
      if (createFlowDedupKeysIncomplete) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.dedup.keysIncomplete', { reason, isCreateFlow: true });
        return;
      }

      const createFlowDedupKeysInvalid =
        isCreateFlow &&
        !hasConfiguredAutoSaveGate &&
        hasInvalidRejectDedupKeyValues({
          dedupRules: (definition as any)?.dedupRules,
          questions: definition.questions,
          values: valuesSnapshot as any,
          lineItems: lineItemsSnapshot,
          language: languageSnapshot
        });
      if (createFlowDedupKeysInvalid) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.dedup.keysInvalid', { reason, isCreateFlow: true });
        return;
      }

      // If this is a CREATE flow and dedup keys are populated, avoid saving drafts until the precheck completes.
      const currentDedupSignature = computeDedupSignatureFromValues(dedupPrecheckRules, valuesSnapshot as any);
      const currentDedupFingerprint = dedupDeleteOnKeyChangeEnabled
        ? computeDedupKeyFingerprint((definition as any)?.dedupRules, valuesSnapshot as any)
        : '';

      const requiresDedupPrecheck = currentDedupSignature && isCreateFlow;
      if (requiresDedupPrecheck) {
        if (dedupCheckingRef.current) {
          // Keep dirty so we retry once the check completes.
          autoSaveDirtyRef.current = true;
          // Re-attempt autosave shortly; avoids getting stuck in a "dirty" state once the check completes.
          try {
            scheduleLatestAutoSave('dedupPrecheck.wait', 600);
          } catch {
            // ignore
          }
          logEvent('autosave.blocked.dedup.checking', { signatureLen: currentDedupSignature.length });
          return;
        }
        const conflict = dedupConflictRef.current;
        if (isBlockingDedupConflict(conflict)) {
          const msg = conflict.message.toString();
          // Hide draft banner while blocked by dedup; the sticky dedup notice is the single source of truth.
          setDraftSave({ phase: 'idle' });
          // Do not keep retrying autosave until the user changes values.
          autoSaveDirtyRef.current = false;
          logEvent('autosave.blocked.dedup.conflict', { ruleId: conflict.ruleId, message: msg });
          return;
        }
      }
      if (draftSaveRequestInFlightRef.current) {
        autoSaveDirtyRef.current = true;
        blockAutoSaveForInFlight({
          blocker: 'draftSave',
          token: draftSaveRequestPromiseRef.current,
          eventName: 'autosave.blocked.draftSaveInFlight',
          details: { reason }
        });
        return;
      }

      autoSaveInFlightBlockerLogRef.current = null;
      autoSaveInFlightRef.current = true;
      autoSaveQueuedRef.current = false;
      // Clear the dirty flag for this attempt; it will be re-set by the change effect if edits continue.
      autoSaveDirtyRef.current = false;
      let savedDraftFingerprint: ReturnType<typeof buildDraftSaveFingerprint> | null = null;
      let retryableRecoveryScheduled = false;

      setDraftSave({ phase: 'saving' });
      logEvent('autosave.begin', { reason, debounceMs: autoSaveDebounceMs });

      try {
        const payload = applyUploadedFieldPayloadOverrides(
          buildDraftPayload({
            definition,
            formKey,
            language: languageSnapshot,
            values: withUploadOverrides.values,
            lineItems: withUploadOverrides.lineItems,
            existingRecordId
          }) as any
        );
        payload.__ckSaveMode = 'draft';
        markNoopIfUnchanged(payload);
        payload.__ckStatus = statusForSave;
        payload.__ckCreateFlow = createFlowRef.current ? '1' : '';
        const baseVersion = recordDataVersionRef.current;
        if (existingRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
          payload.__ckClientDataVersion = Number(baseVersion);
        }
        const pendingDraftFingerprint = buildDraftSaveFingerprint(payload);
        if (
          pendingDraftFingerprint &&
          lastCompletedDraftSaveFingerprintRef.current?.recordId === pendingDraftFingerprint.recordId &&
          lastCompletedDraftSaveFingerprintRef.current?.fingerprint === pendingDraftFingerprint.fingerprint
        ) {
          autoSaveDirtyRef.current = false;
          autoSaveQueuedRef.current = false;
          rememberAutoSaveSeenState(withUploadOverrides.values, withUploadOverrides.lineItems);
          markPostPersistAutoSaveSuppress(localMutationAtAutoSaveStart);
          setDraftSave({
            phase: 'saved',
            updatedAt: lastSubmissionMetaRef.current?.updatedAt || selectedRecordSnapshotRef.current?.updatedAt || undefined
          });
          logEvent('autosave.skip.completedFingerprint', {
            reason,
            recordId: pendingDraftFingerprint.recordId
          });
          return;
        }
        const res = await runCoalescedDraftSaveRequest('autosave', payload, (nextPayload: any) =>
          submitCurrentRecordMutation('autosave', nextPayload)
        );
        const ok = !!res?.success;
        const msg = (res?.message || '').toString();
        if (!ok) {
          const errText = msg || 'Autosave failed.';
          const sessionNow = recordSessionRef.current;
          if (sessionNow !== sessionAtStart) {
            logEvent('autosave.ignored.sessionChanged', {
              reason,
              recordId: (existingRecordId || '').toString() || null,
              sessionAtStart,
              sessionNow,
              message: errText
            });
            return;
          }
          const isStale = isSubmissionStaleMessage(errText);
          if (isStale) {
            retryableAutoSaveFailureCountRef.current = 0;
            const serverVersionRaw = Number((res as any)?.meta?.dataVersion);
            await synchronizeStaleRecord({
              reason: 'autosave.rejected.stale',
              recordId: (existingRecordId || '').toString(),
              cachedVersion: Number.isFinite(Number(baseVersion)) ? Number(baseVersion) : null,
              serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
              serverRow: null
            });
            return;
          }
          if (isRetryableRecordBusyMessage(errText)) {
            retryableRecoveryScheduled = true;
            scheduleRetryableAutoSaveRecovery(reason, errText);
            return;
          }
          // If autosave failed while dedup keys are populated, perform a server-side dedup check
          // so we can show the dedup banner (instead of a generic autosave error).
          if (currentDedupSignature) {
            try {
              const chk = await checkDedupConflictApi(payload as any);
              const conflict = (chk as any)?.conflict || null;
              if ((chk as any)?.success && conflict && conflict.message) {
                const conflictObj = {
                  ruleId: (conflict.ruleId || 'dedup').toString(),
                  message: (conflict.message || '').toString() || tSystem('dedup.duplicate', languageRef.current, 'Duplicate record.'),
                  existingRecordId: conflict.existingRecordId ? conflict.existingRecordId.toString() : undefined,
                  existingRowNumber: Number.isFinite(Number(conflict.existingRowNumber)) ? Number(conflict.existingRowNumber) : undefined
                };
                dedupConflictRef.current = conflictObj;
                dedupHoldRef.current = true; // block any further autosave retries until user resolves the conflict
                setDedupNotice(conflictObj);
                setDedupConflict(conflictObj);
                // Hide draft error banner; the dedup notice is the single source of truth.
                setDraftSave({ phase: 'idle' });
                retryableAutoSaveFailureCountRef.current = 0;
                autoSaveDirtyRef.current = false;
                if (autoSaveTimerRef.current) {
                  globalThis.clearTimeout(autoSaveTimerRef.current);
                  autoSaveTimerRef.current = null;
                }
                logEvent('autosave.dedupDetected.afterFailure', {
                  reason,
                  recordId: existingRecordId || null,
                  ruleId: conflictObj.ruleId,
                  existingRecordId: conflictObj.existingRecordId || null,
                  isCreateFlow
                });
                return;
              }
            } catch (err: any) {
              logEvent('autosave.dedupCheckAfterFailure.exception', {
                reason,
                message: (err?.message || err?.toString?.() || 'failed').toString()
              });
            }
          }
          // If the server rejects because the record is closed, lock the UI.
          const currentStatus =
            (lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '').toString();
          const closedMatch = matchesClosedStatus(currentStatus);
          const closedLabel = closedStatusLabel || 'Closed';
          const closedMessageMatch = closedLabel && errText.toLowerCase().includes(closedLabel.toLowerCase());
          if (closedMatch || closedMessageMatch) {
            setLastSubmissionMeta(prev => ({ ...(prev || {}), status: closedLabel }));
            retryableAutoSaveFailureCountRef.current = 0;
            setDraftSave({ phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') });
            return;
          }
          retryableAutoSaveFailureCountRef.current = 0;
          autoSaveDirtyRef.current = true;
          setDraftSave({ phase: 'error', message: errText });
          logEvent('autosave.error', { reason, message: errText });
          return;
        }

        const newId = (res?.meta?.id || existingRecordId || '').toString();
        const updatedAt = (res?.meta?.updatedAt || '').toString();
        const dv = Number((res as any)?.meta?.dataVersion);
        const nextDataVersion = Number.isFinite(dv) && dv > 0 ? dv : undefined;
        const rn = Number((res as any)?.meta?.rowNumber);
        const nextRowNumber = Number.isFinite(rn) && rn >= 2 ? rn : undefined;
        const serverGeneratedValues = applyServerGeneratedTopValues(res, 'autosave');
        const savedStateValues =
          Object.keys(serverGeneratedValues).length
            ? { ...valuesSnapshot, ...serverGeneratedValues }
            : valuesSnapshot;
        const savedValues =
          Object.keys(serverGeneratedValues).length
            ? { ...(((payload as any).values || {}) as Record<string, any>), ...serverGeneratedValues }
            : ((payload as any).values as any);
        if (newId) {
          savedDraftFingerprint = buildDraftSaveFingerprint({
            ...payload,
            values: savedValues,
            id: newId
          });
        }
        // Keep list view up-to-date without triggering a refetch (even if the user navigated away mid-save).
        upsertListCacheRow({
          recordId: newId,
          // Only patch keys that already exist in list rows (upsertListCacheRow does this safely).
          // IMPORTANT: use the fully serialized draft payload values so list cache retains line item groups/subgroups.
          // (Top-level `values` state does NOT include line item JSON; it's derived from `lineItems`.)
          values: savedValues,
          createdAt: (res?.meta?.createdAt || '').toString() || undefined,
          updatedAt: updatedAt || undefined,
          status: statusForSave,
          dataVersion: nextDataVersion,
          rowNumber: nextRowNumber
        });
        const sessionNow = recordSessionRef.current;
        if (sessionNow !== sessionAtStart) {
          logEvent('autosave.success.ignored.sessionChanged', { reason, recordId: newId || null, sessionAtStart, sessionNow });
          return;
        }
        if (newId) {
          setSelectedRecordId(newId);
          // Keep ref in sync immediately so other async flows (submit/upload) can safely resolve the current record id.
          selectedRecordIdRef.current = newId;
          if (!existingRecordId) {
            createFlowRef.current = false;
          }
        }
        // Successful save => record is now at least as fresh as the server; clear stale banner + bump local version.
        recordStaleRef.current = null;
        setRecordStale(null);
        if (nextDataVersion) {
          recordDataVersionRef.current = nextDataVersion;
          optimisticClientDataVersionRef.current = nextDataVersion;
        }
        if (nextRowNumber) {
          recordRowNumberRef.current = nextRowNumber;
        }
        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id: newId || prev?.id,
          createdAt: res?.meta?.createdAt || prev?.createdAt,
          updatedAt: updatedAt || prev?.updatedAt,
          dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion)) ? Number((res as any).meta.dataVersion) : prev?.dataVersion,
          status: statusForSave
        }));
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || {}),
          id: newId || lastSubmissionMetaRef.current?.id || null,
          createdAt: (res?.meta?.createdAt || '').toString() || lastSubmissionMetaRef.current?.createdAt,
          updatedAt: updatedAt || lastSubmissionMetaRef.current?.updatedAt,
          dataVersion: nextDataVersion ?? lastSubmissionMetaRef.current?.dataVersion,
          status: statusForSave
        };
        dedupBaselineSignatureRef.current = (currentDedupSignature || '').toString();
        dedupKeyFingerprintBaselineRef.current = currentDedupFingerprint;
        retryableAutoSaveFailureCountRef.current = 0;
        rememberAutoSaveSeenState(savedStateValues, lineItemsSnapshot);
        if ((lastLocalRecordMutationAtRef.current || 0) === localMutationAtAutoSaveStart) {
          markPostPersistAutoSaveSuppress(localMutationAtAutoSaveStart);
        }
        setDraftSave({ phase: 'saved', updatedAt: updatedAt || undefined });
        clearSaveFailureStatusAfterSuccessfulSave('record.autosave');
        uploadedFieldValueOverridesRef.current.clear();
        markRecordFreshnessServerTouch({ reason: 'record.autosave', recordId: newId || existingRecordId || null });
        logEvent('autosave.success', {
          reason,
          recordId: newId || null,
          updatedAt: updatedAt || null,
          dataVersion: nextDataVersion || null
        });
      } catch (err: any) {
        const sessionNow = recordSessionRef.current;
        if (sessionNow !== sessionAtStart) {
          logEvent('autosave.exception.ignored.sessionChanged', {
            reason,
            sessionAtStart,
            sessionNow,
            message: resolveLogMessage(err, 'failed')
          });
          return;
        }
        const uiMessage = resolveUiErrorMessage(err, 'Autosave failed.');
        const logMessage = resolveLogMessage(err, 'Autosave failed.');
        if (isRetryableRecordBusyMessage(uiMessage || logMessage)) {
          retryableRecoveryScheduled = true;
          scheduleRetryableAutoSaveRecovery(reason, (uiMessage || logMessage || 'Autosave failed.').toString());
          return;
        }
        retryableAutoSaveFailureCountRef.current = 0;
        autoSaveDirtyRef.current = true;
        if (uiMessage) {
          setDraftSave({ phase: 'error', message: uiMessage });
        } else {
          setDraftSave({ phase: 'idle' });
        }
        logEvent('autosave.exception', { reason, message: logMessage });
      } finally {
        autoSaveInFlightRef.current = false;
        let shouldScheduleQueuedAutoSave = autoSaveQueuedRef.current && !submittingRef.current;
        if (retryableRecoveryScheduled) {
          shouldScheduleQueuedAutoSave = false;
        }
        if (shouldScheduleQueuedAutoSave && savedDraftFingerprint?.recordId) {
          const currentRecordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || savedDraftFingerprint.recordId;
          const currentStatusRaw =
            ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
            '';
          const currentPayload = applyUploadedFieldPayloadOverrides(
            buildDraftPayload({
              definition,
              formKey,
              language: languageRef.current,
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              existingRecordId: currentRecordId
            }) as any
          );
          currentPayload.__ckSaveMode = 'draft';
          currentPayload.__ckStatus = resolveAutoSaveStatus(currentStatusRaw);
          currentPayload.__ckCreateFlow = createFlowRef.current ? '1' : '';
          const currentFingerprint = buildDraftSaveFingerprint(currentPayload);
          if (
            currentFingerprint &&
            currentFingerprint.recordId === savedDraftFingerprint.recordId &&
            currentFingerprint.fingerprint === savedDraftFingerprint.fingerprint
          ) {
            autoSaveQueuedRef.current = false;
            shouldScheduleQueuedAutoSave = false;
            logEvent('autosave.queued.cleared.noChanges', {
              reason,
              recordId: currentRecordId
            });
          }
        }
        if (shouldScheduleQueuedAutoSave) {
          scheduleLatestAutoSave('queued', autoSaveDebounceMs);
        }
      }
    },
    [
      applyUploadedFieldPayloadOverrides,
      applyUploadedFieldOverrides,
      autoSaveDebounceMs,
      autoSaveEnabled,
      autoSaveEnableFieldIds,
      blockAutoSaveForInFlight,
      clearSaveFailureStatusAfterSuccessfulSave,
      dedupPrecheckRules,
      resolveAutoSaveStatus,
      closedStatusLabel,
      definition,
      dedupDeleteOnKeyChangeEnabled,
      formKey,
      ingredientsFormActive,
      language,
      logAutoSaveBlockedByHold,
      logEvent,
      markPostPersistAutoSaveSuppress,
      markRecordFreshnessServerTouch,
      matchesClosedStatus,
      applyServerGeneratedTopValues,
      isRetryableRecordBusyMessage,
      resolveLogMessage,
      resolveUiErrorMessage,
      rememberAutoSaveSeenState,
      runCoalescedDraftSaveRequest,
      scheduleRetryableAutoSaveRecovery,
      scheduleLatestAutoSave,
      submitCurrentRecordMutation,
      synchronizeStaleRecord,
      upsertListCacheRow
    ]
  );

  const flushAutoSaveBeforeNavigate: (reason: string) => Promise<boolean> = useCallback(
    async (reason: string): Promise<boolean> => {
      try {
        if (!autoSaveEnabled) return false;
        if (viewRef.current !== 'form' && viewRef.current !== 'summary') return false;
        if (submittingRef.current) return false;
        if (isClosedRecord) return false;
        if (recordStaleRef.current) return false;
        if (dedupHoldRef.current || dedupCheckingRef.current) return false;
        if (!autoSaveDirtyRef.current) return false;

        // Cancel any pending debounce; we want to flush now.
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        logEvent('autosave.flush.request', { reason });

        const sleep = (ms: number) => new Promise<void>(r => globalThis.setTimeout(r, ms));

        // If an autosave is already running, wait briefly for it to finish so we don't lose queued changes.
        if (autoSaveInFlightRef.current) {
          autoSaveQueuedRef.current = true;
          const startedAt = Date.now();
          while (autoSaveInFlightRef.current) {
            if (Date.now() - startedAt > 10_000) break;
            await sleep(80);
          }
        }

        if (!autoSaveDirtyRef.current) return true;
        if (autoSaveInFlightRef.current) return true;
        await performAutoSave(reason);
        return true;
      } catch (err: any) {
        logEvent('autosave.flush.exception', { reason, message: err?.message || err?.toString?.() || 'failed' });
        return false;
      }
    },
    [autoSaveEnabled, isClosedRecord, logEvent, performAutoSave]
  );

  const waitForPendingAutoSaveAfterAction = useCallback(
    async (reason: string, timeoutMs = 18000): Promise<boolean> => {
      const startedAt = Date.now();
      const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));
      let forcedFlushAttempted = false;
      logEvent('action.flush.pendingAutosave.wait.start', {
        reason,
        dirty: autoSaveDirtyRef.current,
        queued: autoSaveQueuedRef.current,
        autosaveInFlight: autoSaveInFlightRef.current,
        draftSaveInFlight: draftSaveRequestInFlightRef.current,
        utilisationSyncInFlight: Boolean(utilisationSyncPromiseRef.current),
        guidedBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current)
      });

      while (Date.now() - startedAt < timeoutMs) {
        if (lastDraftSaveFailureRef.current || recordStaleRef.current) break;
        if (
          !autoSaveDirtyRef.current &&
          !autoSaveQueuedRef.current &&
          !autoSaveInFlightRef.current &&
          !draftSaveRequestInFlightRef.current &&
          !utilisationSyncPromiseRef.current &&
          !guidedStepBackgroundSyncPromiseRef.current
        ) {
          logEvent('action.flush.pendingAutosave.wait.done', {
            reason,
            durationMs: Date.now() - startedAt
          });
          return true;
        }

        if (draftSaveRequestInFlightRef.current) {
          await waitForDraftSaveRequest(`action.flush.pendingAutosave:${reason}`, 5000);
          continue;
        }

        if (utilisationSyncPromiseRef.current) {
          const pending = utilisationSyncPromiseRef.current;
          await Promise.race([pending.catch(() => undefined), sleep(300)]);
          continue;
        }

        if (guidedStepBackgroundSyncPromiseRef.current) {
          const pending = guidedStepBackgroundSyncPromiseRef.current;
          await Promise.race([pending.catch(() => undefined), sleep(300)]);
          continue;
        }

        if (autoSaveInFlightRef.current) {
          await sleep(80);
          continue;
        }

        if (autoSaveDirtyRef.current) {
          if (autoSaveTimerRef.current) {
            globalThis.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          autoSaveQueuedRef.current = false;
          if (!forcedFlushAttempted) {
            forcedFlushAttempted = true;
            logEvent('action.flush.pendingAutosave.force', { reason });
          }
          await performAutoSave(`${reason}.pendingAutosave`);
          continue;
        }

        if (autoSaveQueuedRef.current && !autoSaveDirtyRef.current) {
          if (autoSaveTimerRef.current) {
            globalThis.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          autoSaveQueuedRef.current = false;
          logEvent('action.flush.pendingAutosave.clearedEmptyQueue', { reason });
          continue;
        }

        await sleep(80);
      }

      const settled =
        !autoSaveDirtyRef.current &&
        !autoSaveQueuedRef.current &&
        !autoSaveInFlightRef.current &&
        !draftSaveRequestInFlightRef.current &&
        !utilisationSyncPromiseRef.current &&
        !guidedStepBackgroundSyncPromiseRef.current;
      logEvent('action.flush.pendingAutosave.wait.timeout', {
        reason,
        durationMs: Date.now() - startedAt,
        dirty: autoSaveDirtyRef.current,
        queued: autoSaveQueuedRef.current,
        autosaveInFlight: autoSaveInFlightRef.current,
        draftSaveInFlight: draftSaveRequestInFlightRef.current,
        utilisationSyncInFlight: Boolean(utilisationSyncPromiseRef.current),
        guidedBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current),
        settled
      });
      return settled;
    },
    [logEvent, performAutoSave, waitForDraftSaveRequest]
  );

  const flushPendingDraftSaveForAction = useCallback(
    async (reason: string): Promise<{ ok: boolean; message?: string }> => {
      const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));

      const currentStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (currentStaleInfo) {
        return { ok: false, message: currentStaleInfo.message || 'Record is stale. Please refresh.' };
      }

      if (recordSyncPromiseRef.current) {
        await recordSyncPromiseRef.current;
        const syncedStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
        if (syncedStaleInfo) {
          return { ok: false, message: syncedStaleInfo.message || 'Record is stale. Please refresh.' };
        }
      }

      if (dedupCheckingRef.current) {
        logEvent('action.flush.waitDedup.start', { reason });
        const startedAt = Date.now();
        while (dedupCheckingRef.current) {
          await sleep(60);
          if (Date.now() - startedAt > 15_000) {
            const message = tSystem('dedup.checking', languageRef.current, 'Checking duplicates…');
            logEvent('action.flush.waitDedup.timeout', { reason, waitMs: Date.now() - startedAt });
            return { ok: false, message };
          }
        }
        logEvent('action.flush.waitDedup.done', { reason, waitMs: Date.now() - startedAt });
      }

      const dedupConflict = dedupConflictRef.current;
      if (isBlockingDedupConflict(dedupConflict)) {
        return { ok: false, message: dedupConflict.message.toString() };
      }

      const activeSaveWait = await waitForActiveDraftSaveTransactions(`action.flush:${reason}`);
      if (!activeSaveWait.ok) {
        return activeSaveWait;
      }

      if (dedupDeleteOnKeyChangePendingRef.current || dedupDeleteOnKeyChangeInFlightRef.current) {
        logEvent('action.flush.waitDedupDelete.start', {
          reason,
          pending: dedupDeleteOnKeyChangePendingRef.current,
          inFlight: dedupDeleteOnKeyChangeInFlightRef.current
        });
        const startedAt = Date.now();
        while (dedupDeleteOnKeyChangePendingRef.current || dedupDeleteOnKeyChangeInFlightRef.current) {
          const saveWait = await waitForActiveDraftSaveTransactions(`action.flush:${reason}.dedupDelete`);
          if (!saveWait.ok) return saveWait;
          if (!(dedupDeleteOnKeyChangePendingRef.current || dedupDeleteOnKeyChangeInFlightRef.current)) break;
          if (Date.now() - startedAt > 18_000) {
            const message = 'Could not save the latest changes.';
            logEvent('action.flush.waitDedupDelete.timeout', {
              reason,
              waitMs: Date.now() - startedAt,
              pending: dedupDeleteOnKeyChangePendingRef.current,
              inFlight: dedupDeleteOnKeyChangeInFlightRef.current
            });
            return { ok: false, message };
          }
          await sleep(80);
        }
        logEvent('action.flush.waitDedupDelete.done', {
          reason,
          waitMs: Date.now() - startedAt
        });
      }

      if (guidedStepImmediateSyncPromiseRef.current) {
        logEvent('action.flush.waitGuidedLiveSync.start', { reason });
        const startedAt = Date.now();
        while (guidedStepImmediateSyncPromiseRef.current) {
          const pending = guidedStepImmediateSyncPromiseRef.current;
          await pending.catch(() => undefined);
          if (Date.now() - startedAt > 30_000) {
            logEvent('action.flush.waitGuidedLiveSync.timeout', {
              reason,
              waitMs: Date.now() - startedAt
            });
            break;
          }
        }
        logEvent('action.flush.waitGuidedLiveSync.done', {
          reason,
          waitMs: Date.now() - startedAt,
          stillInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current)
        });
      }

      if (utilisationSyncPromiseRef.current) {
        logEvent('action.flush.waitUtilisationSync.start', { reason });
        const startedAt = Date.now();
        while (utilisationSyncPromiseRef.current) {
          const pending = utilisationSyncPromiseRef.current;
          await pending.catch(() => undefined);
          if (Date.now() - startedAt > 30_000) {
            logEvent('action.flush.waitUtilisationSync.timeout', {
              reason,
              waitMs: Date.now() - startedAt
            });
            break;
          }
        }
        logEvent('action.flush.waitUtilisationSync.done', {
          reason,
          waitMs: Date.now() - startedAt,
          stillInFlight: Boolean(utilisationSyncPromiseRef.current)
        });
      }

      const flushed = await flushAutoSaveBeforeNavigate(reason);
      if (flushed && draftSaveRequestInFlightRef.current) {
        await waitForDraftSaveRequest(`action.flush:${reason}`);
      }

      if (autoSaveDirtyRef.current || autoSaveQueuedRef.current) {
        if (!lastDraftSaveFailureRef.current) {
          const settled = await waitForPendingAutoSaveAfterAction(reason);
          if (settled) {
            clearSaveFailureStatusAfterSuccessfulSave('action.flush.pendingAutosave.settled');
          }
        }
      }

      if (autoSaveDirtyRef.current || autoSaveQueuedRef.current) {
        const message = lastDraftSaveFailureRef.current?.message || 'Could not save the latest changes.';
        logEvent('action.flush.pendingAutosave.failed', {
          reason,
          dirty: autoSaveDirtyRef.current,
          queued: autoSaveQueuedRef.current,
          hasDraftFailure: !!lastDraftSaveFailureRef.current
        });
        return { ok: false, message };
      }

      if (lastDraftSaveFailureRef.current) {
        return {
          ok: false,
          message: lastDraftSaveFailureRef.current.message || 'Could not save the latest changes.'
        };
      }
      const staleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (staleInfo) {
        return { ok: false, message: staleInfo.message || 'Record is stale. Please refresh.' };
      }
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return { ok: true };
    },
    [
      clearSaveFailureStatusAfterSuccessfulSave,
      flushAutoSaveBeforeNavigate,
      logEvent,
      waitForActiveDraftSaveTransactions,
      waitForDraftSaveRequest,
      waitForPendingAutoSaveAfterAction
    ]
  );
  flushPendingDraftSaveActionRef.current = flushPendingDraftSaveForAction;

  const hasPendingUploadFilesInFormState = useCallback((): boolean => {
    const isFile = (value: unknown): boolean => {
      try {
        return typeof File !== 'undefined' && value instanceof File;
      } catch {
        return false;
      }
    };
    const visit = (value: unknown, depth = 0): boolean => {
      if (!value || depth > 8) return false;
      if (isFile(value)) return true;
      if (Array.isArray(value)) return value.some(item => visit(item, depth + 1));
      if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some(item => visit(item, depth + 1));
      }
      return false;
    };
    return visit(valuesRef.current) || visit(lineItemsRef.current);
  }, []);

  const waitForBackgroundSaves = useCallback(
    async (
      reason: string,
      waitForQueue: 'all' | 'uploadsOnly' | 'none' = 'all'
    ): Promise<{ ok: boolean; message?: string }> => {
      if (waitForQueue === 'none') {
        logEvent('backgroundQueue.wait.skipped', { reason, waitForQueue });
        return { ok: true };
      }
      const sessionAtStart = recordSessionRef.current;
      const startedAt = Date.now();
      const startAutosave = !!autoSaveInFlightRef.current;
      const startDraftSave = !!draftSaveRequestInFlightRef.current;
      const startUploads = uploadQueueRef.current.size;
      if (startAutosave || startDraftSave || startUploads > 0) {
        logEvent('backgroundQueue.wait.start', {
          reason,
          waitForQueue,
          autosaveInFlight: startAutosave,
          draftSaveInFlight: startDraftSave,
          uploadsInFlight: startUploads
        });
      }

      if (uploadQueueRef.current.size > 0) {
        const snapshots = Array.from(uploadQueueRef.current.values());
        const settled = await Promise.all(
          snapshots.map(promise =>
            promise.then(
              value => ({ status: 'fulfilled' as const, value }),
              reason => ({ status: 'rejected' as const, reason })
            )
          )
        );
        const failures: string[] = [];
        settled.forEach(result => {
          if (result.status !== 'fulfilled') {
            failures.push('Upload failed.');
            return;
          }
          const ok = !!(result.value as any)?.success;
          const msg = ((result.value as any)?.message || '').toString();
          if (!ok) failures.push(msg || 'Upload failed.');
        });
        if (failures.length) {
          const message = failures[0] || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.');
          const pendingUploadFiles = hasPendingUploadFilesInFormState();
          logEvent('backgroundQueue.wait.uploads.failed', { reason, waitForQueue, message, pendingUploadFiles });
          if (!pendingUploadFiles) {
            clearSaveFailureStatusAfterSuccessfulSave('backgroundQueue.uploadFailure.stale');
            logEvent('backgroundQueue.wait.uploads.failureIgnored', { reason, waitForQueue });
          } else {
            return { ok: false, message };
          }
        }
      }

      if (waitForQueue === 'all' && autoSaveInFlightRef.current) {
        const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));
        while (autoSaveInFlightRef.current) {
          if (recordSessionRef.current !== sessionAtStart) {
            logEvent('backgroundQueue.wait.sessionChanged', {
              reason,
              waitForQueue,
              sessionAtStart,
              sessionNow: recordSessionRef.current
            });
            return { ok: false, message: 'Record session changed.' };
          }
          await sleep(60);
        }
      }

      if (waitForQueue === 'all' && draftSaveRequestInFlightRef.current) {
        await waitForDraftSaveRequest(`backgroundQueue:${reason}`);
      }

      if (waitForQueue === 'all' && lastDraftSaveFailureRef.current) {
        logEvent('backgroundQueue.wait.blocked.draftSaveFailed', {
          reason,
          waitForQueue,
          recordId: lastDraftSaveFailureRef.current.recordId || null
        });
        return {
          ok: false,
          message: lastDraftSaveFailureRef.current.message || 'Could not save the latest changes.'
        };
      }

      const currentStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (currentStaleInfo) {
        logEvent('backgroundQueue.wait.blocked.recordStale', {
          reason,
          waitForQueue,
          recordId: currentStaleInfo.recordId
        });
        return { ok: false, message: currentStaleInfo.message || 'Record is stale. Please refresh.' };
      }

      if (recordSyncPromiseRef.current) {
        await recordSyncPromiseRef.current;
        const syncedStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
        if (syncedStaleInfo) {
          return { ok: false, message: syncedStaleInfo.message || 'Record is stale. Please refresh.' };
        }
      }

      if (startAutosave || startDraftSave || startUploads > 0) {
        logEvent('backgroundQueue.wait.done', { reason, waitForQueue, durationMs: Date.now() - startedAt });
      }
      return { ok: true };
    },
    [clearSaveFailureStatusAfterSuccessfulSave, hasPendingUploadFilesInFormState, logEvent, waitForDraftSaveRequest]
  );

  const waitForGuidedStepAdvance = useCallback(
    async (args: {
      stepId: string;
      nextStepId?: string;
      trigger: 'next' | 'auto';
      waitDialog?: SystemActionGateDialogConfig | null;
    }): Promise<{ success: boolean; message?: string }> => {
      const uploadsInFlight = uploadQueueRef.current.size;
      if (uploadsInFlight <= 0) {
        if (!hasPendingUploadFilesInFormState()) {
          clearSaveFailureStatusAfterSuccessfulSave('guidedStepAdvance.noUploadsPending');
        }
        return { success: true };
      }
      const copy = resolveGuidedUploadWaitDialog(args.waitDialog);
      const seq = guidedStepAdvanceBusy.lock({
        title: copy.title,
        message: copy.message,
        kind: 'guidedStepAdvance',
        diagnosticMeta: {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger,
          uploadsInFlight
        }
      });
      try {
        const waitResult = await waitForBackgroundSaves(
          `guidedStepAdvance:${args.stepId || 'step'}:${args.trigger}`,
          'uploadsOnly'
        );
        if (!waitResult.ok) {
          const message = (
            waitResult.message ||
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          ).toString();
          setStatus(message);
          setStatusLevel('error');
          return { success: false, message };
        }
        const saveResult = await flushPendingDraftSaveForAction(
          `guidedStepAdvance:${args.stepId || 'step'}:${args.trigger}:uploadComplete`
        );
        if (!saveResult.ok) {
          const message = (
            saveResult.message ||
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          ).toString();
          setStatus(message);
          setStatusLevel('error');
          return { success: false, message };
        }
        clearSaveFailureStatusAfterSuccessfulSave('guidedStepAdvance.uploadComplete');
        return { success: true };
      } finally {
        guidedStepAdvanceBusy.unlock(seq, {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
      }
    },
    [
      clearSaveFailureStatusAfterSuccessfulSave,
      flushPendingDraftSaveForAction,
      guidedStepAdvanceBusy,
      hasPendingUploadFilesInFormState,
      resolveGuidedUploadWaitDialog,
      waitForBackgroundSaves
    ]
  );

  useEffect(() => {
    performAutoSaveRef.current = performAutoSave;
  }, [performAutoSave]);

  const clearActiveRecordContext = useCallback(() => {
    setSelectedRecordId('');
    selectedRecordIdRef.current = '';
    setSelectedRecordSnapshot(null);
    selectedRecordSnapshotRef.current = null;
    setLastSubmissionMeta(null);
    lastSubmissionMetaRef.current = null;
    setPrefetchedSummaryHtml(null);
    setRecordLoadingId(null);
    recordLoadingIdRef.current = null;
    setRecordLoadError(null);
    setGuidedUiState(null);
    activeGuidedStepIdRef.current = '';
    setRequestedGuidedStepId(null);
    setGuidedExternalSyncSignal(null);
    recordDataVersionRef.current = null;
    optimisticClientDataVersionRef.current = null;
    recordRowNumberRef.current = null;
    recordStaleRef.current = null;
    setRecordStale(null);
  }, []);

  const navigateToListAfterRecordAction = useCallback(
    (reason: string) => {
      bumpRecordSession({ reason, nextRecordId: null });
      clearActiveRecordContext();
      setView('list');
    },
    [bumpRecordSession, clearActiveRecordContext]
  );

  const requestNavigateToList = useCallback(
    async (trigger: string, options?: { discardInvalidDraft?: boolean }) => {
      if (viewRef.current === 'list') return;
      if (navigateHomeInFlightRef.current) return;
      const startedAt = Date.now();
      const startMark = `ck.nav.back.start.${startedAt}`;
      backToHomePerfRef.current = { trigger, startedAt, startMark };
      perfMark(startMark);
      const discardInvalidDraft = options?.discardInvalidDraft === true;
      const renderedDraftChanged =
        !discardInvalidDraft &&
        !!latestRenderedAutoSaveStateFingerprintRef.current &&
        latestRenderedAutoSaveStateFingerprintRef.current !== lastAutoSaveStateFingerprintRef.current;
      if (renderedDraftChanged && viewRef.current === 'form') {
        autoSaveDirtyRef.current = true;
        autoSaveQueuedRef.current = true;
        logEvent('navigate.list.markDirty.renderedDraftChanged', { trigger });
      }
      const activeRecordId = getCurrentOpenRecordId();
      const followupBatchInFlight = activeRecordId
        ? pendingFollowupBatchPromisesRef.current.has(activeRecordId)
        : false;
      const needsWait = shouldWaitBeforeLeavingRecord({
        discardInvalidDraft,
        uploadsInFlight: uploadQueueRef.current.size,
        autoSaveInFlight: autoSaveInFlightRef.current,
        autoSaveDirty: autoSaveDirtyRef.current,
        autoSaveQueued: autoSaveQueuedRef.current,
        draftSaveInFlight: Boolean(draftSaveRequestInFlightRef.current),
        recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
        utilisationSyncInFlight: Boolean(utilisationSyncPromiseRef.current),
        dedupDeletePending: Boolean(dedupDeleteOnKeyChangePendingRef.current),
        dedupDeleteInFlight: Boolean(dedupDeleteOnKeyChangeInFlightRef.current),
        followupBatchInFlight,
        guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
        guidedStepLiveSyncPending: Boolean(guidedStepImmediateSyncPendingRef.current),
        renderedDraftChanged
      });
      if (!needsWait) {
        navigateToListAfterRecordAction(`navigate.list.${trigger}`);
        setStatus(null);
        setStatusLevel(null);
        return;
      }

      navigateHomeInFlightRef.current = true;
      const seq = navigateHomeBusy.lock({
        title: followupBatchInFlight
          ? tSystem('draft.savingShort', languageRef.current, 'Saving…')
          : tSystemOptional('navigation.waitSavingTitle', languageRef.current, ''),
        message: followupBatchInFlight
          ? tSystem(
              'submit.waitPreviousAction',
              languageRef.current,
              'Please wait while we finish the previous action...'
            )
          : tSystem('navigation.waitSaving', languageRef.current, 'Do not leave this page while your changes are being saved'),
        kind: 'navigateHome',
        diagnosticMeta: {
          trigger,
          recordId: activeRecordId || null,
          followupBatchInFlight,
          discardInvalidDraft,
          dedupDeletePending: Boolean(dedupDeleteOnKeyChangePendingRef.current),
          dedupDeleteInFlight: Boolean(dedupDeleteOnKeyChangeInFlightRef.current)
        }
      });
      logEvent('navigate.list.wait.start', {
        trigger,
        recordId: activeRecordId || null,
        uploadsInFlight: uploadQueueRef.current.size,
        autoSaveInFlight: autoSaveInFlightRef.current,
        autoSaveQueued: autoSaveQueuedRef.current,
        draftSaveInFlight: Boolean(draftSaveRequestInFlightRef.current),
        recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
        utilisationSyncInFlight: Boolean(utilisationSyncPromiseRef.current),
        dedupDeletePending: Boolean(dedupDeleteOnKeyChangePendingRef.current),
        dedupDeleteInFlight: Boolean(dedupDeleteOnKeyChangeInFlightRef.current),
        followupBatchInFlight,
        guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
        guidedStepLiveSyncPending: Boolean(guidedStepImmediateSyncPendingRef.current),
        renderedDraftChanged,
        discardInvalidDraft,
        dirty: autoSaveDirtyRef.current
      });
      try {
        const uploadWait = await waitForBackgroundSaves(`navigate.list.${trigger}`, 'uploadsOnly');
        if (!uploadWait.ok) {
          const message = (
            uploadWait.message ||
            tSystem('navigation.waitSaving', languageRef.current, 'Do not leave this page while your changes are being saved')
          ).toString();
          setStatus(message);
          setStatusLevel('error');
          logEvent('navigate.list.wait.failed', {
            trigger,
            phase: 'uploads',
            message
          });
          return;
        }
        if (activeRecordId && pendingFollowupBatchPromisesRef.current.has(activeRecordId)) {
          const followupWait = await waitForPendingFollowupBatch({
            recordId: activeRecordId,
            reason: `navigate.list.${trigger}`
          });
          if (!followupWait.ok) {
            const message = (followupWait.message || submitPreviousActionRetryMessage()).toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('navigate.list.wait.failed', {
              trigger,
              recordId: activeRecordId,
              phase: 'followup',
              message
            });
            return;
          }
        }
        const saveWait = await flushPendingDraftSaveForAction(`navigate.list.${trigger}`);
        if (!saveWait.ok) {
          const message = (saveWait.message || 'Could not save the latest changes.').toString();
          setStatus(message);
          setStatusLevel('error');
          logEvent('navigate.list.wait.failed', {
            trigger,
            phase: 'save',
            message
          });
          return;
        }
        logEvent('navigate.list.wait.done', { trigger, durationMs: Date.now() - startedAt });
        navigateToListAfterRecordAction(`navigate.list.${trigger}`);
        setStatus(null);
        setStatusLevel(null);
      } finally {
        navigateHomeBusy.unlock(seq, { durationMs: Date.now() - startedAt });
        navigateHomeInFlightRef.current = false;
      }
    },
    [
      backToHomePerfRef,
      flushPendingDraftSaveForAction,
      getCurrentOpenRecordId,
      logEvent,
      navigateHomeBusy,
      navigateToListAfterRecordAction,
      perfMark,
      submitPreviousActionRetryMessage,
      waitForBackgroundSaves,
      waitForPendingFollowupBatch
    ]
  );

  const handleGoHome = useCallback(() => {
    const inFormView = viewRef.current === 'form';
    const incompleteDedupKeys = inFormView && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesRef.current as any);
    const invalidDedupKeys =
      inFormView &&
      createFlowRef.current &&
      hasInvalidRejectDedupKeyValues({
        dedupRules: (definition as any)?.dedupRules,
        questions: definition.questions,
        values: valuesRef.current as any,
        lineItems: lineItemsRef.current,
        language: languageRef.current
      });
    const homeLeaveDialog = resolveDedupIncompleteHomeDialogConfig(definition.actionBars);
    const homeLeaveDialogEnabled = homeLeaveDialog && homeLeaveDialog.enabled !== false;
    const homeLeaveCriteria = homeLeaveDialog?.criteria || 'dedupKeys';
    const incompleteConfiguredFields =
      inFormView &&
      hasIncompleteConfiguredFields(Array.isArray(homeLeaveDialog?.fieldIds) ? homeLeaveDialog.fieldIds : [], valuesRef.current as any);
    const hasEnteredData =
      hasEnteredTopLevelValues(definition.questions || [], valuesRef.current as any) ||
      hasEnteredLineItemValues(lineItemsRef.current || {});
    const allowLeaveUntouchedCreate = createFlowRef.current && !hasEnteredData;
    const shouldOpenHomeLeaveDialog =
      !allowLeaveUntouchedCreate &&
      inFormView &&
      homeLeaveDialogEnabled &&
      (homeLeaveCriteria === 'dedupKeys'
        ? incompleteDedupKeys || invalidDedupKeys
        : homeLeaveCriteria === 'fieldIds'
          ? incompleteConfiguredFields
          : incompleteDedupKeys || invalidDedupKeys || incompleteConfiguredFields);
    if (shouldOpenHomeLeaveDialog) {
      const activeHomeLeaveDialog = homeLeaveDialog || {};
      const copy = resolveDedupIncompleteHomeDialogCopy(activeHomeLeaveDialog, languageRef.current);
      customConfirm.openConfirm({
        title: copy.title,
        message: copy.message,
        confirmLabel: copy.confirmLabel,
        cancelLabel: copy.cancelLabel,
        primaryAction: copy.primaryAction,
        showCancel: copy.showCancel,
        showCloseButton: copy.showCloseButton,
        dismissOnBackdrop: copy.dismissOnBackdrop,
        kind: 'dedupIncompleteHome',
        onCancel: () => {
          logEvent('navigate.home.dedupIncomplete.cancel');
        },
        onConfirm: async () => {
          const startedAt = Date.now();
          const initialRecordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
          const busySeq = navigateHomeBusy.lock({
            title: tSystemOptional('navigation.waitSavingTitle', languageRef.current, ''),
            message: tSystem('navigation.waitSaving', languageRef.current, 'Do not leave this page while your changes are being saved'),
            kind: 'dedupIncompleteHome',
            diagnosticMeta: {
              criteria: homeLeaveCriteria,
              recordId: initialRecordId || null,
              incompleteDedupKeys,
              invalidDedupKeys,
              incompleteConfiguredFields
            }
          });
          try {
            const activeSaveWait = await waitForActiveDraftSaveTransactions('navigate.home.dedupIncomplete.confirm');
            if (!activeSaveWait.ok) {
              const message = (activeSaveWait.message || 'Could not save the latest changes.').toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('navigate.home.dedupIncomplete.waitActiveSave.failed', { message });
              return;
            }
            const existingRecordId =
              resolveExistingRecordId({
                selectedRecordId: selectedRecordIdRef.current,
                selectedRecordSnapshot: selectedRecordSnapshotRef.current,
                lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
              }) || initialRecordId;
            const shouldDeleteCurrentRecord = activeHomeLeaveDialog.deleteRecordOnConfirm !== false;
            if (shouldDeleteCurrentRecord && existingRecordId) {
              const deleted = await triggerDedupDeleteOnKeyChange('navigate.home.dedupIncomplete.confirm', {
                force: true,
                recordId: existingRecordId
              });
              if (!deleted) {
                setStatus(copy.deleteFailedMessage);
                setStatusLevel('error');
                logEvent('navigate.home.dedupIncomplete.delete.failed', { recordId: existingRecordId });
                return;
              }
            } else {
              dedupHoldRef.current = false;
              autoSaveDirtyRef.current = false;
              autoSaveQueuedRef.current = false;
              if (autoSaveTimerRef.current) {
                globalThis.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
              }
              setDraftSave({ phase: 'idle' });
            }
            dedupHoldRef.current = false;
            autoSaveDirtyRef.current = false;
            autoSaveQueuedRef.current = false;
            autoSaveUserEditedRef.current = false;
            createFlowRef.current = false;
            createFlowUserEditedRef.current = false;
            lastDraftSaveFailureRef.current = null;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            setDraftSave({ phase: 'idle' });
            rememberAutoSaveSeenState(valuesRef.current, lineItemsRef.current);
            logEvent('navigate.home.dedupIncomplete.confirm', {
              criteria: homeLeaveCriteria,
              incompleteDedupKeys,
              invalidDedupKeys,
              incompleteConfiguredFields,
              recordId: existingRecordId || null,
              deletedRecord: shouldDeleteCurrentRecord && !!existingRecordId
            });
            await requestNavigateToList('navigate.home.dedupIncomplete.confirm', { discardInvalidDraft: true });
          } finally {
            navigateHomeBusy.unlock(busySeq, { durationMs: Date.now() - startedAt });
          }
        }
      });
      logEvent('navigate.home.dedupIncomplete.dialog.open', {
        criteria: homeLeaveCriteria,
        incompleteDedupKeys,
        invalidDedupKeys,
        incompleteConfiguredFields
      });
      return;
    }
    void requestNavigateToList('navigate.home');
  }, [
    customConfirm,
    definition,
    logEvent,
    navigateHomeBusy,
    rememberAutoSaveSeenState,
    requestNavigateToList,
    triggerDedupDeleteOnKeyChange,
    waitForActiveDraftSaveTransactions
  ]);

  const handleGoSummary = useCallback(() => {
    if (!summaryViewEnabled) return;
    // Kick autosave in the background (do not block navigation).
    void flushAutoSaveBeforeNavigate('navigate.summary');
    try {
      globalThis.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      try {
        globalThis.scrollTo?.(0, 0);
      } catch {
        // ignore
      }
    }
    setView('summary');
  }, [flushAutoSaveBeforeNavigate, summaryViewEnabled]);

  // When a UI flow temporarily holds autosave (e.g., a subgroup overlay), persist any queued changes
  // immediately once the hold is released (user returns to the main steps UI).
  useEffect(() => {
    const prev = prevAutoSaveHoldRef.current;
    const next = !!autoSaveHold.hold;
    const previousReason = prevAutoSaveHoldReasonRef.current;
    const nextReason = (autoSaveHold.reason || '').toString();
    if (prev === next && previousReason === nextReason) return;
    prevAutoSaveHoldRef.current = next;
    prevAutoSaveHoldReasonRef.current = nextReason;
    lastAutoSaveBlockedHoldLogRef.current = '';
    if (!prev || next) return; // only act on true -> false

    const releasedReasons = previousReason
      .split(',')
      .map(reason => reason.trim())
      .filter(Boolean);
    if (releasedReasons.includes(GUIDED_RESERVATION_DEFERRED_AUTOSAVE_HOLD_REASON)) {
      logEvent('autosave.hold.release.skipGuidedUtilisationDeferred', {
        holdReason: previousReason || null,
        dirty: autoSaveDirtyRef.current,
        queued: autoSaveQueuedRef.current
      });
      return;
    }

    if (!autoSaveEnabled) return;
    if (viewRef.current !== 'form') return;
    if (submittingRef.current) return;
    if (recordStaleRef.current) return;
    if (!autoSaveDirtyRef.current && !autoSaveQueuedRef.current) return;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    logEvent('autosave.hold.release.flush', {
      holdReason: autoSaveHold.reason || null,
      dirty: autoSaveDirtyRef.current,
      queued: autoSaveQueuedRef.current
    });
    void performAutoSave('autosaveHold.release');
  }, [autoSaveEnabled, autoSaveHold.hold, autoSaveHold.reason, logEvent, performAutoSave]);

  // Release autosave hold after dedup evaluation completes (or keys become incomplete),
  // and persist any pending changes once it's safe.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (view !== 'form') {
      dedupHoldRef.current = false;
      return;
    }
    if (fieldChangeDialog.state.open || fieldChangeActiveRef.current) return;
    if (!dedupHoldRef.current) return;

    const signature = (dedupSignature || '').toString();
    if (
      createFlowRef.current &&
      hasInvalidRejectDedupKeyValues({
        dedupRules: (definition as any)?.dedupRules,
        questions: definition.questions,
        values: valuesRef.current as any,
        lineItems: lineItemsRef.current,
        language: languageRef.current
      })
    ) {
      return;
    }
    // If keys are incomplete, there's no dedup evaluation to wait for.
    if (!signature) {
      dedupHoldRef.current = false;
    } else {
      // Do NOT release hold until we've at least started a dedup check for this signature.
      // This prevents a race where autosave resumes before the precheck effect schedules the server call.
      if (lastDedupCheckedSignatureRef.current !== signature) return;
      if (dedupCheckingRef.current) return;
      if (isBlockingDedupConflict(dedupConflictRef.current)) return;
      // Keys are complete, check finished, and no conflict -> release hold.
      dedupHoldRef.current = false;
    }

    // In create-flow, autosave must still wait for the first real user edit.
    if (createFlowRef.current && !createFlowUserEditedRef.current) return;
    if (createFlowRef.current && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesRef.current as any)) return;
    if (!autoSaveUserEditedRef.current) return;
    // If the record is stale, do not resume autosave; user must refresh first.
    if (recordStaleRef.current) return;
    if (!autoSaveDirtyRef.current) return;
    if (submittingRef.current) return;
    // Queue a debounced autosave now that we are unblocked.
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave(prev => {
      if (prev.phase === 'saving') return prev;
      if (prev.phase === 'dirty') return prev;
      return { phase: 'dirty' };
    });
    scheduleLatestAutoSave('dedupHold.release', autoSaveDebounceMs);
  }, [
    autoSaveDebounceMs,
    autoSaveEnabled,
    blockAutoSaveForInFlight,
    definition,
    dedupChecking,
    dedupConflict,
    dedupSignature,
    fieldChangeDialog.state.open,
    performAutoSave,
    scheduleLatestAutoSave,
    view
  ]);

  // Debounced autosave trigger on edits.
  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    // Only trigger autosave when the actual form data changes.
    const stateFingerprint = renderedAutoSaveStateFingerprint;
    const changed = lastAutoSaveStateFingerprintRef.current !== stateFingerprint;
    rememberAutoSaveSeenState(values, lineItems);
    if (!changed) return;
    const pendingAutomatedAutoSaveSource = pendingAutomatedAutoSaveSourceRef.current;
    pendingAutomatedAutoSaveSourceRef.current = '';
    const suppressSelectionEffectInitAutoSave = shouldSuppressSelectionEffectInitAutoSave({
      suppressStartedAtMs: selectionEffectInitAutoSaveSuppressStartedAtRef.current,
      suppressUntilMs: selectionEffectInitAutoSaveSuppressUntilRef.current,
      nowMs: Date.now(),
      lastLocalMutationAtMs: lastLocalRecordMutationAtRef.current,
      hadDirtyAtStart: selectionEffectInitAutoSaveHadDirtyAtStartRef.current
    });
    const suppressPostPersistAutoSave = shouldSuppressPostPersistAutoSave({
      suppressUntilMs: postPersistAutoSaveSuppressUntilRef.current,
      nowMs: Date.now(),
      lastLocalMutationAtMs: lastLocalRecordMutationAtRef.current,
      persistedLocalMutationAtMs: postPersistAutoSavePersistedLocalMutationAtRef.current
    });
    if (
      shouldSuppressAutomatedAutoSave({
        pendingSource: pendingAutomatedAutoSaveSource,
        dirty: autoSaveDirtyRef.current,
        queued: autoSaveQueuedRef.current,
        inFlight: autoSaveInFlightRef.current
      }) ||
      suppressSelectionEffectInitAutoSave ||
      suppressPostPersistAutoSave
    ) {
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      autoSaveInFlightBlockerLogRef.current = null;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave(prev => {
        if (prev.phase === 'saved') return prev;
        return {
          phase: 'saved',
          updatedAt: lastSubmissionMetaRef.current?.updatedAt || selectedRecordSnapshotRef.current?.updatedAt || undefined
        };
      });
      logEvent('autosave.skip.automatedMutation', {
        source: pendingAutomatedAutoSaveSource,
        view,
        suppressWindow: suppressSelectionEffectInitAutoSave,
        suppressPostPersist: suppressPostPersistAutoSave
      });
      return;
    }

    if (view !== 'form') {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (submitting) {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (isClosedRecord) {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave(prev => (prev.phase === 'paused' ? prev : { phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') }));
      return;
    }
    if (!autoSaveUserEditedRef.current) {
      const now = Date.now();
      const ageMs = now - (lastUserInteractionRef.current || 0);
      if (lastUserInteractionRef.current > 0 && ageMs <= 3000) {
        autoSaveUserEditedRef.current = true;
        if (createFlowRef.current && !createFlowUserEditedRef.current) {
          createFlowUserEditedRef.current = true;
          logEvent('autosave.armed.interactionFallback', { ageMs });
        }
      }
    }
    // In create-flow, do not autosave until the user actually changes a field value.
    if (createFlowRef.current && !createFlowUserEditedRef.current) return;
    if (createFlowRef.current && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, values as any)) {
      autoSaveDirtyRef.current = true;
      return;
    }
    if (
      createFlowRef.current &&
      hasInvalidRejectDedupKeyValues({
        dedupRules: (definition as any)?.dedupRules,
        questions: definition.questions,
        values: values as any,
        lineItems,
        language
      })
    ) {
      autoSaveDirtyRef.current = true;
      return;
    }
    if (!autoSaveUserEditedRef.current) return;
    // If the record is stale (modified elsewhere), do not schedule autosave.
    if (recordStaleRef.current) {
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      logEvent('autosave.blocked.recordStale', { reason: 'debouncedTrigger' });
      return;
    }

    if (autoSaveHoldRef.current?.hold) {
      autoSaveQueuedRef.current = true;
      autoSaveDirtyRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      logAutoSaveBlockedByHold('debouncedTrigger');
      return;
    }

    autoSaveDirtyRef.current = true;
    const pendingFollowupRecordId =
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '';
    if (pendingFollowupRecordId && pendingFollowupBatchPromisesRef.current.has(pendingFollowupRecordId)) {
      autoSaveQueuedRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      logEvent('autosave.blocked.pendingFollowup', {
        reason: 'debouncedTrigger',
        recordId: pendingFollowupRecordId
      });
      return;
    }
    if (recordSyncPromiseRef.current) {
      blockAutoSaveForInFlight({
        blocker: 'recordSync',
        token: recordSyncPromiseRef.current,
        eventName: 'autosave.blocked.recordSyncInFlight',
        details: { reason: 'debouncedTrigger' }
      });
      return;
    }
    if (uploadQueueRef.current.size > 0) {
      // Don't schedule autosave while uploads are persisting (avoid stale self-races).
      blockAutoSaveForInFlight({
        blocker: 'upload',
        token: uploadQueueRef.current.size,
        eventName: 'autosave.blocked.uploadInFlight',
        details: { reason: 'debouncedTrigger', inFlight: uploadQueueRef.current.size }
      });
      return;
    }
    if (guidedStepImmediateSyncPromiseRef.current) {
      blockAutoSaveForInFlight({
        blocker: 'guidedStepLiveSync',
        token: guidedStepImmediateSyncPromiseRef.current,
        eventName: 'autosave.blocked.guidedStepLiveSync',
        details: { reason: 'debouncedTrigger' }
      });
      return;
    }
    if (draftSaveRequestInFlightRef.current) {
      blockAutoSaveForInFlight({
        blocker: 'draftSave',
        token: draftSaveRequestPromiseRef.current,
        eventName: 'autosave.blocked.draftSaveInFlight',
        details: { reason: 'debouncedTrigger' }
      });
      return;
    }
    if (dedupHoldRef.current || dedupCheckingRef.current) {
      dedupHoldRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    setDraftSave(prev => {
      if (prev.phase === 'saving') return prev;
      if (prev.phase === 'dirty') return prev;
      return { phase: 'dirty' };
    });
    autoSaveInFlightBlockerLogRef.current = null;
    const scheduledTimerId = scheduleLatestAutoSave(
      'debounced',
      resolveDebouncedAutoSaveDelay({
        debounceMs: autoSaveDebounceMs,
        lastUserInteractionAt: lastUserInteractionRef.current,
        now: Date.now()
      })
    );
    return () => {
      if (scheduledTimerId && autoSaveTimerRef.current === scheduledTimerId) {
        if (
          shouldRetainPendingDebouncedAutoSave({
            scheduledFingerprint: stateFingerprint,
            latestFingerprint: latestRenderedAutoSaveStateFingerprintRef.current
          })
        ) {
          return;
        }
        globalThis.clearTimeout(scheduledTimerId);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    autoSaveDebounceMs,
    autoSaveEnabled,
    blockAutoSaveForInFlight,
    definition,
    formKey,
    isClosedRecord,
    language,
    logAutoSaveBlockedByHold,
    renderedAutoSaveStateFingerprint,
    rememberAutoSaveSeenState,
    scheduleLatestAutoSave,
    logEvent,
    submitting,
    view,
    values,
    lineItems
  ]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  const ensureDraftRecordId = useCallback(
    async (args?: { reason?: string; fieldPath?: string }): Promise<{ success: boolean; recordId?: string; message?: string }> => {
      let recordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      if (recordId) return { success: true, recordId };

      const signature = (dedupSignatureRef.current || '').toString();
      if (signature) {
        if (dedupCheckingRef.current) {
          logEvent('record.ensure.waitDedup.start', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null
          });
          const startedAt = Date.now();
          const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));
          while (dedupCheckingRef.current) {
            await sleep(60);
            if (Date.now() - startedAt > 15000) {
              const message = tSystem('dedup.checking', languageRef.current, 'Checking duplicates…');
              logEvent('record.ensure.waitDedup.timeout', {
                reason: args?.reason || null,
                fieldPath: args?.fieldPath || null,
                waitMs: Date.now() - startedAt
              });
              return { success: false, message };
            }
          }
          logEvent('record.ensure.waitDedup.done', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null,
            waitMs: Date.now() - startedAt
          });
        }
        const conflict = dedupConflictRef.current;
        if (isBlockingDedupConflict(conflict)) {
          const message = conflict.message.toString();
          logEvent('record.ensure.blocked.dedup.conflict', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null,
            ruleId: conflict.ruleId
          });
          return { success: false, message };
        }
      }

      if (draftSaveRequestInFlightRef.current) {
        logEvent('record.ensure.waitDraftSave', {
          reason: args?.reason || null,
          fieldPath: args?.fieldPath || null
        });
        await waitForDraftSaveRequest('record.ensureDraftRecordId');
        recordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
        if (recordId) {
          logEvent('record.ensure.reusedDraftSaveResult', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null,
            recordId
          });
          return { success: true, recordId };
        }
      }

      try {
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setDraftSave({ phase: 'saving' });
        const statusRaw =
          ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
          '';
        const draftStatus = resolveAutoSaveStatus(statusRaw);
        const draft = applyUploadedFieldPayloadOverrides(
          buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: valuesRef.current,
            lineItems: lineItemsRef.current
          }) as any
        );
        draft.__ckSaveMode = 'draft';
        markNoopIfUnchanged(draft);
        draft.__ckStatus = draftStatus;
        draft.__ckCreateFlow = createFlowRef.current ? '1' : '';
        const res = await runCoalescedDraftSaveRequest('ensureDraftRecordId', draft, (nextPayload: any) =>
          submitCurrentRecordMutation('ensureDraftRecordId', nextPayload)
        );
        if (!res?.success) {
          const message = (res?.message || 'Failed to create draft record.').toString();
          setDraftSave({ phase: 'error', message });
          return { success: false, message };
        }
        recordId = (res?.meta?.id || '').toString();
        if (!recordId) {
          const message = 'Failed to create draft record id.';
          setDraftSave({ phase: 'error', message });
          return { success: false, message };
        }
        setSelectedRecordId(recordId);
        selectedRecordIdRef.current = recordId;
        createFlowRef.current = false;
        autoSaveDirtyRef.current = false;
        autoSaveQueuedRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id: recordId,
          createdAt: res?.meta?.createdAt || prev?.createdAt,
          updatedAt: res?.meta?.updatedAt || prev?.updatedAt,
          dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion))
            ? Number((res as any).meta.dataVersion)
            : prev?.dataVersion,
          status: draftStatus
        }));
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || {}),
          id: recordId,
          createdAt: (res?.meta?.createdAt || '').toString() || lastSubmissionMetaRef.current?.createdAt,
          updatedAt: (res?.meta?.updatedAt || '').toString() || lastSubmissionMetaRef.current?.updatedAt,
          dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion))
            ? Number((res as any).meta.dataVersion)
            : lastSubmissionMetaRef.current?.dataVersion,
          status: draftStatus
        };
        recordStaleRef.current = null;
        setRecordStale(null);
        const dv = Number((res as any)?.meta?.dataVersion);
        if (Number.isFinite(dv) && dv > 0) {
          recordDataVersionRef.current = dv;
          optimisticClientDataVersionRef.current = dv;
        }
        const rn = Number((res as any)?.meta?.rowNumber);
        if (Number.isFinite(rn) && rn >= 2) {
          recordRowNumberRef.current = rn;
        }
        const serverGeneratedValues = applyServerGeneratedTopValues(res, 'ensureDraftRecordId');
        const savedValues =
          Object.keys(serverGeneratedValues).length
            ? { ...(((draft as any).values || {}) as Record<string, any>), ...serverGeneratedValues }
            : ((draft as any).values as any);
        setDraftSave({ phase: 'saved', updatedAt: (res?.meta?.updatedAt || '').toString() || undefined });
        clearSaveFailureStatusAfterSuccessfulSave('record.ensureDraftId');
        markRecordFreshnessServerTouch({ reason: 'record.ensureDraftId', recordId });
        upsertListCacheRow({
          recordId,
          values: savedValues,
          createdAt: (res?.meta?.createdAt || '').toString() || undefined,
          updatedAt: (res?.meta?.updatedAt || '').toString() || undefined,
          status: draftStatus,
          dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion))
            ? Number((res as any).meta.dataVersion)
            : undefined,
          rowNumber: Number.isFinite(Number((res as any)?.meta?.rowNumber))
            ? Number((res as any).meta.rowNumber)
            : undefined
        });
        logEvent('record.ensure.saved', {
          recordId,
          reason: args?.reason || null,
          fieldPath: args?.fieldPath || null
        });
        return { success: true, recordId };
      } catch (err: any) {
        const message = resolveUiErrorMessage(err, 'Failed to create draft record.');
        logEvent('record.ensure.error', {
          reason: args?.reason || null,
          fieldPath: args?.fieldPath || null,
          message: resolveLogMessage(err, 'Failed to create draft record.')
        });
        if (message) {
          setDraftSave({ phase: 'error', message });
        } else {
          setDraftSave({ phase: 'idle' });
        }
        return { success: false, message: message || '' };
      }
    },
    [
      applyUploadedFieldPayloadOverrides,
      applyServerGeneratedTopValues,
      clearSaveFailureStatusAfterSuccessfulSave,
      definition,
      formKey,
      logEvent,
      markRecordFreshnessServerTouch,
      resolveAutoSaveStatus,
      resolveLogMessage,
      resolveUiErrorMessage,
      runCoalescedDraftSaveRequest,
      submitCurrentRecordMutation,
      upsertListCacheRow,
      waitForDraftSaveRequest
    ]
  );
  ensureDraftRecordIdActionRef.current = ensureDraftRecordId;

  const {
    prepareQrScannerLaunch,
    handleQrScannerSessionReady,
    handleQrScannerSessionEnd,
    applyQrScannerCommittedUpdate
  } = useQrScannerAppIntegration({
    formKey,
    languageRef,
    ensureDraftRecordId,
    flushPendingDraftSave: flushPendingDraftSaveForAction,
    logEvent,
    resolveLogMessage,
    resolveUiErrorMessage,
    setAutoSaveHoldFromUi,
    scheduleLatestAutoSave,
    autoSaveDirtyRef,
    autoSaveQueuedRef,
    autoSaveTimerRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    valuesRef,
    lineItemsRef,
    uploadedFieldValueOverridesRef,
    recordDataVersionRef,
    optimisticClientDataVersionRef,
    setValues,
    setSelectedRecordSnapshot,
    setLastSubmissionMeta,
    rememberAutoSaveSeenState,
    upsertListCacheRow,
    markRecordFreshnessServerTouch
  });

  const applyFollowupBatchResults = useCallback(
    (args: { recordId: string; actions: string[]; batch: FollowupBatchResponse; reason: string; sessionId?: number | null }) => {
      const followupErrors: string[] = [];
      const byAction = new Map<string, any>();
      const entries = Array.isArray(args.batch?.results) ? args.batch.results : [];
      const applicationTarget = resolveFollowupResultApplicationTarget({
        settledRecordId: args.recordId,
        selectedRecordId: selectedRecordIdRef.current,
        selectedSnapshotId: selectedRecordSnapshotRef.current?.id || null,
        currentSessionId: recordSessionRef.current,
        followupSessionId: args.sessionId ?? null,
        currentView: viewRef.current
      });
      const activeRecordUpdate = applicationTarget.applyToActiveRecord;
      if (!activeRecordUpdate) {
        logEvent('followup.batch.detachedResult', {
          recordId: args.recordId,
          currentRecordId: applicationTarget.currentRecordId || null,
          sessionChanged: applicationTarget.sessionChanged,
          viewAllowsActiveRecord: applicationTarget.viewAllowsActiveRecord,
          reason: args.reason
        });
      }
      entries.forEach(entry => {
        const key = (entry?.action || '').toString().trim().toUpperCase();
        if (key) byAction.set(key, entry?.result || null);
      });

      for (const action of args.actions) {
        const result = byAction.get(action) || null;
        if (!result?.success) {
          const msg = (result?.message || result?.status || 'Failed').toString();
          followupErrors.push(`${action}: ${msg}`);
          logEvent('followup.batch.error', { action, recordId: args.recordId, message: msg, reason: args.reason });
          continue;
        }
        const cachedRecordForMeta =
          selectedRecordSnapshotRef.current?.id === args.recordId
            ? selectedRecordSnapshotRef.current
            : listRecordsRef.current[args.recordId] || null;
        const nextMeta = resolveFollowupActionResultMeta({
          result,
          currentDataVersion: activeRecordUpdate ? recordDataVersionRef.current : (cachedRecordForMeta as any)?.dataVersion
        });
        const previousRecordForAnalytics =
          selectedRecordSnapshotRef.current?.id === args.recordId
            ? selectedRecordSnapshotRef.current
            : listRecordsRef.current[args.recordId] || null;
        const nextSnapshotStatus =
          nextMeta.status !== undefined ? (nextMeta.status || undefined) : previousRecordForAnalytics?.status;
        const nextRecordForAnalytics =
          previousRecordForAnalytics && nextMeta.status !== undefined
            ? ({
                ...previousRecordForAnalytics,
                updatedAt: nextMeta.updatedAt || result.updatedAt || previousRecordForAnalytics.updatedAt,
                status: nextSnapshotStatus,
                pdfUrl: nextMeta.pdfUrl || result.pdfUrl || previousRecordForAnalytics.pdfUrl,
                dataVersion: nextMeta.dataVersion ?? (previousRecordForAnalytics as any).dataVersion,
                __rowNumber: nextMeta.rowNumber ?? (previousRecordForAnalytics as any).__rowNumber
              } as WebFormSubmission)
            : null;
        if (nextRecordForAnalytics) {
          applyLiveAnalyticsRecordDelta({
            previousRecord: previousRecordForAnalytics,
            nextRecord: nextRecordForAnalytics,
            reason: args.reason,
            recordId: args.recordId
          });
        }
        if (nextMeta.status !== undefined) {
          markAnalyticsSnapshotStale({
            reason: args.reason,
            recordId: args.recordId,
            status: nextMeta.status || null
          });
          const nextStatusValue = (nextMeta.status || '').toString();
          if (activeRecordUpdate) {
            valuesRef.current = {
              ...valuesRef.current,
              status: nextStatusValue
            };
            setValues(prev => ({ ...prev, status: nextStatusValue }));
          }
        }
        upsertListCacheRow({
          recordId: args.recordId,
          values: nextMeta.status !== undefined ? { status: (nextMeta.status || '').toString() } : undefined,
          updatedAt: nextMeta.updatedAt,
          status: nextMeta.status as any,
          pdfUrl: nextMeta.pdfUrl,
          dataVersion: nextMeta.dataVersion,
          rowNumber: nextMeta.rowNumber
        });
        markRecordFreshnessServerTouch({ reason: 'record.followupBatch', recordId: args.recordId });
        if (activeRecordUpdate && nextMeta.dataVersion !== undefined) {
          recordDataVersionRef.current = nextMeta.dataVersion;
          optimisticClientDataVersionRef.current = nextMeta.dataVersion;
        }
        if (activeRecordUpdate && nextMeta.rowNumber !== undefined) {
          recordRowNumberRef.current = nextMeta.rowNumber;
        }
        logEvent('followup.batch.success', {
          action,
          recordId: args.recordId,
          status: result.status || null,
          dataVersion: nextMeta.dataVersion ?? null,
          reason: args.reason
        });
        if (activeRecordUpdate) {
          lastSubmissionMetaRef.current = {
            ...(lastSubmissionMetaRef.current || { id: args.recordId }),
            id: args.recordId,
            updatedAt: nextMeta.updatedAt || result.updatedAt || lastSubmissionMetaRef.current?.updatedAt,
            dataVersion: nextMeta.dataVersion ?? lastSubmissionMetaRef.current?.dataVersion,
            status:
              nextMeta.status !== undefined
                ? nextMeta.status || null
                : lastSubmissionMetaRef.current?.status || null
          };
          setLastSubmissionMeta(prev => ({
            ...(prev || { id: args.recordId }),
            updatedAt: nextMeta.updatedAt || result.updatedAt || prev?.updatedAt,
            dataVersion: nextMeta.dataVersion ?? prev?.dataVersion,
            status:
              nextMeta.status !== undefined
                ? nextMeta.status
                : prev?.status || null
          }));
          selectedRecordSnapshotRef.current = selectedRecordSnapshotRef.current?.id === args.recordId
            ? ({
                ...selectedRecordSnapshotRef.current,
                updatedAt: nextMeta.updatedAt || result.updatedAt || selectedRecordSnapshotRef.current.updatedAt,
                status: nextSnapshotStatus,
                pdfUrl: nextMeta.pdfUrl || result.pdfUrl || selectedRecordSnapshotRef.current.pdfUrl,
                dataVersion: nextMeta.dataVersion ?? (selectedRecordSnapshotRef.current as any).dataVersion,
                __rowNumber: nextMeta.rowNumber ?? (selectedRecordSnapshotRef.current as any).__rowNumber,
                values:
                  nextMeta.status !== undefined
                    ? {
                        ...((selectedRecordSnapshotRef.current.values || {}) as Record<string, any>),
                        status: (nextMeta.status || '').toString()
                      }
                    : selectedRecordSnapshotRef.current.values
              } as any)
            : selectedRecordSnapshotRef.current;
          setSelectedRecordSnapshot(prev =>
            prev && prev.id === args.recordId
              ? ({
                  ...prev,
                  updatedAt: nextMeta.updatedAt || result.updatedAt || prev.updatedAt,
                  status: nextMeta.status !== undefined ? (nextMeta.status || undefined) : prev.status,
                  pdfUrl: nextMeta.pdfUrl || result.pdfUrl || prev.pdfUrl,
                  dataVersion: nextMeta.dataVersion ?? (prev as any).dataVersion,
                  __rowNumber: nextMeta.rowNumber ?? (prev as any).__rowNumber,
                  values:
                    nextMeta.status !== undefined
                      ? {
                          ...((prev.values || {}) as Record<string, any>),
                          status: (nextMeta.status || '').toString()
                        }
                      : prev.values
                } as any)
              : prev
          );
        }
      }

      return { followupErrors, byAction };
    },
    [applyLiveAnalyticsRecordDelta, logEvent, markAnalyticsSnapshotStale, markRecordFreshnessServerTouch, upsertListCacheRow]
  );

  const refreshGuidedDataSourcesInBackground = useCallback(
    (args: { reason: string; forceRefresh?: boolean; retryDelaysMs?: number[]; dataSourceConfigs?: any[] }) => {
      const dataSourceConfigs = Array.isArray(args.dataSourceConfigs) ? args.dataSourceConfigs.filter(Boolean) : guidedDataSourceConfigs;
      if (!dataSourceConfigs.length) return;
      if (followupLaunchDataSourcePrefetchHoldRef.current > 0) {
        logEvent('dataSource.prefetch.skipped.followupLaunch', {
          formKey,
          language,
          dataSources: dataSourceConfigs.length,
          reason: args.reason,
          forceRefresh: Boolean(args.forceRefresh)
        });
        return;
      }
      const retryDelays = normalizeDataSourcePrefetchRetryDelays(args.retryDelaysMs);
      logEvent('dataSource.prefetch.submitEffects.start', {
        formKey,
        language,
        dataSources: dataSourceConfigs.length,
        reason: args.reason,
        forceRefresh: Boolean(args.forceRefresh),
        attempts: retryDelays.length
      });
      retryDelays.forEach((delayMs, attemptIndex) => {
        const run = () => {
          void prefetchDataSources(dataSourceConfigs, language, {
            forceRefresh: Boolean(args.forceRefresh)
          })
            .then(res => {
              logEvent('dataSource.prefetch.submitEffects.done', {
                formKey,
                language,
                requested: res.requested,
                succeeded: res.succeeded,
                failed: res.failed,
                reason: args.reason,
                forceRefresh: Boolean(args.forceRefresh),
                attempt: attemptIndex + 1,
                attempts: retryDelays.length
              });
            })
            .catch((err: any) => {
              logEvent('dataSource.prefetch.submitEffects.error', {
                formKey,
                language,
                reason: args.reason,
                forceRefresh: Boolean(args.forceRefresh),
                message: err?.message || err?.toString?.() || 'unknown',
                attempt: attemptIndex + 1,
                attempts: retryDelays.length
              });
            });
        };
        if (delayMs <= 0) {
          run();
          return;
        }
        const timer = setTimeout(run, delayMs);
        guidedDataSourceRefreshTimersRef.current.push(timer);
      });
    },
    [formKey, guidedDataSourceConfigs, language, logEvent]
  );

  useEffect(() => {
    if (view !== 'form') return;
    if (!formOpenGuidedDataSourceConfigs.length) return;
    if (recordLoadingId) return;
    if (followupLaunchDataSourcePrefetchHoldRef.current > 0) {
      logEvent('dataSource.prefetch.formOpen.skipped.followupLaunch', {
        formKey,
        language,
        selectedRecordId: selectedRecordId || null
      });
      return;
    }
    const refreshKey = buildFormDataSourceRefreshKey({ formKey, language, selectedRecordId, view });
    if (formDataSourceRefreshKeyRef.current === refreshKey) return;
    formDataSourceRefreshKeyRef.current = refreshKey;
    refreshGuidedDataSourcesInBackground({
      reason: 'form.open',
      // Keep form-open fetches cache-aware so create/open does not immediately
      // refetch the same shared data sources that home prefetch just loaded.
      // Flows that truly require fresh shared data already invalidate caches first.
      forceRefresh: false,
      retryDelaysMs: [0],
      dataSourceConfigs: formOpenGuidedDataSourceConfigs
    });
  }, [formKey, formOpenGuidedDataSourceConfigs, language, logEvent, recordLoadingId, refreshGuidedDataSourcesInBackground, selectedRecordId, view]);

  const refreshAfterFollowupBatch = useCallback(
    async (args: { recordId: string; reason: string; mode?: 'snapshot' | 'sharedDataOnly' | 'none' }) => {
      if (args.mode === 'none') {
        logEvent('sharedData.cache.refresh.skipped.followupServerOnly', {
          reason: args.reason,
          recordId: args.recordId
        });
        return;
      }
      invalidateClientSharedDataCaches({ includePersistedDataSources: true });
      logEvent('sharedData.cache.invalidated', {
        reason: args.reason,
        recordId: args.recordId,
        mode: args.mode || 'snapshot'
      });
      if (args.mode === 'sharedDataOnly') {
        refreshGuidedDataSourcesInBackground({
          reason: `${args.reason}.sharedDataOnly`,
          forceRefresh: true,
          retryDelaysMs: [0, 1200, 3500]
        });
        return;
      }
      try {
        await loadRecordSnapshot(args.recordId);
      } catch (err: any) {
        logEvent('followup.batch.refresh.error', {
          recordId: args.recordId,
          reason: args.reason,
          message: err?.message || err || 'unknown'
        });
      }
    },
    [loadRecordSnapshot, logEvent, refreshGuidedDataSourcesInBackground]
  );

  const applySuccessfulSubmissionState = useCallback(
    (args: {
      recordId: string;
      payload?: any;
      response?: any;
      statusFallback?: string | null;
    }) => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return;
      const meta = (args.response?.meta || {}) as any;
      const nextStatus = (meta?.status || args.statusFallback || null) as string | null;
      const nextCreatedAt = (meta?.createdAt || '').toString() || undefined;
      const nextUpdatedAt = (meta?.updatedAt || '').toString() || undefined;
      const nextPdfUrl = (meta?.pdfUrl || '').toString() || undefined;
      const nextDataVersion = Number(meta?.dataVersion);
      const nextRowNumber = Number(meta?.rowNumber);
      const payloadValues = (((args.payload as any)?.values || {}) as Record<string, any>) || {};
      const serverGeneratedValues = applyServerGeneratedTopValues(args.response, 'submissionState');
      const nextPayloadValues =
        Object.keys(serverGeneratedValues).length
          ? { ...payloadValues, ...serverGeneratedValues }
          : payloadValues;
      const nextMeta = {
        id: recordId,
        createdAt: nextCreatedAt,
        updatedAt: nextUpdatedAt,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : undefined,
        status: nextStatus
      };

      setSelectedRecordId(recordId);
      selectedRecordIdRef.current = recordId;
      setLastSubmissionMeta(prev => ({
        id: recordId || prev?.id || selectedRecordIdRef.current,
        createdAt: nextCreatedAt || prev?.createdAt,
        updatedAt: nextUpdatedAt || prev?.updatedAt,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : prev?.dataVersion,
        status: nextStatus || prev?.status || null
      }));
      lastSubmissionMetaRef.current = {
        ...(lastSubmissionMetaRef.current || {}),
        id: nextMeta.id,
        createdAt: nextMeta.createdAt || lastSubmissionMetaRef.current?.createdAt,
        updatedAt: nextMeta.updatedAt || lastSubmissionMetaRef.current?.updatedAt,
        dataVersion: nextMeta.dataVersion ?? lastSubmissionMetaRef.current?.dataVersion,
        status: nextMeta.status || lastSubmissionMetaRef.current?.status || null
      };
      recordStaleRef.current = null;
      setRecordStale(null);
      if (Number.isFinite(nextDataVersion) && nextDataVersion > 0) {
        recordDataVersionRef.current = nextDataVersion;
        optimisticClientDataVersionRef.current = nextDataVersion;
      }
      if (Number.isFinite(nextRowNumber) && nextRowNumber >= 2) {
        recordRowNumberRef.current = nextRowNumber;
      }

      const nextSnapshot = buildSuccessfulSubmissionSnapshot({
        currentSnapshot: selectedRecordSnapshotRef.current,
        recordId,
        values: nextPayloadValues,
        status: nextStatus,
        createdAt: nextCreatedAt,
        updatedAt: nextUpdatedAt,
        pdfUrl: nextPdfUrl,
        dataVersion: nextDataVersion,
        rowNumber: nextRowNumber
      });
      if (nextSnapshot) {
        selectedRecordSnapshotRef.current = nextSnapshot;
        setSelectedRecordSnapshot(prev => (prev && prev.id && prev.id !== recordId ? prev : nextSnapshot));
      }

      upsertListCacheRow({
        recordId,
        values: nextPayloadValues,
        createdAt: nextCreatedAt,
        updatedAt: nextUpdatedAt,
        status: nextStatus,
        pdfUrl: nextPdfUrl,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : undefined,
        rowNumber: Number.isFinite(nextRowNumber) ? nextRowNumber : undefined
      });
      markRecordFreshnessServerTouch({ reason: 'record.persist', recordId });
    },
    [applyServerGeneratedTopValues, markRecordFreshnessServerTouch, upsertListCacheRow]
  );

  const applyLocalRecordStatus = useCallback(
    (args: { recordId: string; status: string | null | undefined }) => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return;
      const nextStatus = (args.status || '').toString().trim() || null;
      const nextStatusValue = nextStatus || '';
      const applicationTarget = resolveFollowupResultApplicationTarget({
        settledRecordId: recordId,
        selectedRecordId: selectedRecordIdRef.current,
        selectedSnapshotId: selectedRecordSnapshotRef.current?.id || null,
        currentSessionId: recordSessionRef.current,
        currentView: viewRef.current
      });
      const previousRecord =
        selectedRecordSnapshotRef.current?.id === recordId
          ? selectedRecordSnapshotRef.current
          : listRecordsRef.current[recordId] || null;
      const nextRecord =
        previousRecord
          ? ({
              ...previousRecord,
              id: previousRecord.id || recordId,
              status: nextStatus || previousRecord.status || undefined,
              values: {
                ...(((previousRecord as any).values || {}) as Record<string, any>),
                status: nextStatusValue
              }
            } as WebFormSubmission)
          : null;
      if (nextRecord) {
        applyLiveAnalyticsRecordDelta({
          previousRecord,
          nextRecord,
          reason: 'record.status.local',
          recordId
        });
      }
      markAnalyticsSnapshotStale({
        reason: 'record.status.local',
        recordId,
        status: nextStatus
      });
      if (applicationTarget.applyToActiveRecord) {
        setLastSubmissionMeta(prev => ({
          ...(prev || { id: recordId }),
          id: recordId,
          status: nextStatus
        }));
        valuesRef.current = {
          ...valuesRef.current,
          status: nextStatusValue
        };
        setValues(prev => ({ ...prev, status: nextStatusValue }));
        setSelectedRecordSnapshot(prev =>
          prev && prev.id === recordId
            ? {
                ...prev,
                status: nextStatus || prev.status || undefined,
                values: {
                  ...((prev.values || {}) as Record<string, any>),
                  status: nextStatusValue
                }
              }
            : prev
        );
        selectedRecordSnapshotRef.current =
          selectedRecordSnapshotRef.current?.id === recordId && nextRecord
            ? nextRecord
            : selectedRecordSnapshotRef.current;
      }
      upsertListCacheRow({
        recordId,
        values: { status: nextStatusValue },
        status: nextStatus,
        dataVersion: applicationTarget.applyToActiveRecord ? getCurrentKnownClientDataVersion() : undefined
      });
    },
    [applyLiveAnalyticsRecordDelta, getCurrentKnownClientDataVersion, markAnalyticsSnapshotStale, upsertListCacheRow]
  );

  const persistCurrentSnapshot = useCallback(
    async (args: {
      reason: string;
      mode: 'draft' | 'submit';
      existingRecordId?: string;
      statusOverride?: string | null;
      collapsedRows?: Record<string, boolean>;
      collapsedSubgroups?: Record<string, boolean>;
      snapshotOverride?: {
        values: Record<string, FieldValue>;
        lineItems: LineItemState;
        language?: LangCode;
      };
      force?: boolean;
      statusOnlyWhenClean?: boolean;
      utilisationDraftSync?: {
        stepId: string;
        recordId: string;
        plan: BankUtilisationPlanRequest;
        requestEpoch: number;
        sessionId: number;
      };
    }): Promise<{
      success: boolean;
      response?: any;
      payload?: any;
      recordId?: string;
      message?: string;
      stale?: boolean;
    }> => {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      autoSaveQueuedRef.current = false;
      if (draftSaveRequestInFlightRef.current) {
        logEvent('snapshot.save.waitDraftSave', {
          reason: args.reason,
          mode: args.mode,
          existingRecordId: args.existingRecordId || null
        });
        await waitForDraftSaveRequest(`snapshot:${args.reason}`);
      }
      if (
        args.utilisationDraftSync &&
        shouldDeferUtilisationDraftSyncToDeleteOnKeyChange({
          dedupDeleteOnKeyChangeInFlight: dedupDeleteOnKeyChangeInFlightRef.current,
          dedupDeletePending: dedupDeleteOnKeyChangePendingRef.current
        })
      ) {
        logEvent('snapshot.save.skipped.deleteOnKeyChangePending', {
          reason: args.reason,
          recordId: args.existingRecordId || args.utilisationDraftSync.recordId || null,
          requestEpoch: args.utilisationDraftSync.requestEpoch,
          dedupDeleteOnKeyChangeInFlight: dedupDeleteOnKeyChangeInFlightRef.current,
          dedupDeletePending: dedupDeleteOnKeyChangePendingRef.current
        });
        const pendingUtilisationDraftSync = pendingGuidedUtilisationDraftSyncRef.current;
        if (
          pendingUtilisationDraftSync &&
          pendingUtilisationDraftSync.requestEpoch <= args.utilisationDraftSync.requestEpoch
        ) {
          pendingGuidedUtilisationDraftSyncRef.current = null;
        }
        return {
          success: true,
          recordId: args.existingRecordId || args.utilisationDraftSync.recordId,
          stale: true
        };
      }
      if (args.utilisationDraftSync && isGuidedUtilisationDraftSyncEpochApplied(args.utilisationDraftSync.requestEpoch)) {
        logEvent('snapshot.save.skipped.utilisationDraftAlreadyApplied', {
          reason: args.reason,
          recordId: args.existingRecordId || args.utilisationDraftSync.recordId || null,
          requestEpoch: args.utilisationDraftSync.requestEpoch,
          lastAppliedEpoch: lastAppliedGuidedUtilisationDraftSyncEpochRef.current
        });
        return {
          success: true,
          recordId: args.existingRecordId || args.utilisationDraftSync.recordId,
          stale: true
        };
      }
      if (args.utilisationDraftSync && uploadQueueRef.current.size > 0) {
        const uploadWait = await waitForBackgroundSaves(`snapshot:${args.reason}.uploads`, 'uploadsOnly');
        if (!uploadWait.ok) {
          const message = (uploadWait.message || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')).toString();
          logEvent('snapshot.save.blocked.uploadsFailed', {
            reason: args.reason,
            recordId: args.existingRecordId || args.utilisationDraftSync.recordId || null,
            message
          });
          return {
            success: false,
            recordId: args.existingRecordId || args.utilisationDraftSync.recordId,
            message
          };
        }
      }
      if (args.utilisationDraftSync && isGuidedUtilisationDraftSyncEpochApplied(args.utilisationDraftSync.requestEpoch)) {
        logEvent('snapshot.save.skipped.utilisationDraftAppliedByUpload', {
          reason: args.reason,
          recordId: args.existingRecordId || args.utilisationDraftSync.recordId || null,
          requestEpoch: args.utilisationDraftSync.requestEpoch,
          lastAppliedEpoch: lastAppliedGuidedUtilisationDraftSyncEpochRef.current
        });
        return {
          success: true,
          recordId: args.existingRecordId || args.utilisationDraftSync.recordId,
          stale: true
        };
      }
      if (args.mode === 'draft' && args.existingRecordId) {
        const followupWait = await waitForPendingFollowupBatch({
          recordId: args.existingRecordId,
          reason: `snapshot:${args.reason}`
        });
        if (!followupWait.ok) {
          const message = (followupWait.message || submitPreviousActionRetryMessage()).toString();
          logEvent('snapshot.save.blocked.pendingFollowup', {
            reason: args.reason,
            recordId: args.existingRecordId,
            message
          });
          return {
            success: false,
            recordId: args.existingRecordId,
            message
          };
        }
      }
      if (
        shouldSkipCleanDraftSnapshotSave({
          mode: args.mode,
          existingRecordId: args.existingRecordId,
          draftSaveRequestInFlight: draftSaveRequestInFlightRef.current,
          autoSaveDirty: autoSaveDirtyRef.current,
          autoSaveQueued: autoSaveQueuedRef.current,
          force: args.force,
          utilisationDraftSync: Boolean(args.utilisationDraftSync)
        })
      ) {
        logEvent('snapshot.save.skipped.cleanDraft', {
          reason: args.reason,
          recordId: args.existingRecordId
        });
        return {
          success: true,
          recordId: args.existingRecordId,
          response: {
            success: true,
            meta: {
              id: args.existingRecordId,
              updatedAt: lastSubmissionMetaRef.current?.updatedAt || selectedRecordSnapshotRef.current?.updatedAt || '',
              dataVersion: recordDataVersionRef.current || undefined,
              rowNumber: recordRowNumberRef.current || undefined,
              status: lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || null
            }
          }
        };
      }
      const utilisationDraftLineItemMerge =
        args.utilisationDraftSync && args.snapshotOverride?.lineItems
          ? mergeGuidedUtilisationLineItemsFromSnapshot({
              definition,
              stepId: args.utilisationDraftSync.stepId || activeGuidedStepIdRef.current || '',
              sourceLineItems: args.snapshotOverride.lineItems,
              targetLineItems: lineItemsRef.current,
              mode: 'step'
            })
          : null;
      const snapshotValues = args.utilisationDraftSync ? valuesRef.current : args.snapshotOverride?.values || valuesRef.current;
      const snapshotLineItems =
        utilisationDraftLineItemMerge?.lineItems || args.snapshotOverride?.lineItems || lineItemsRef.current;
      const snapshotLanguage = args.utilisationDraftSync ? languageRef.current : args.snapshotOverride?.language || languageRef.current;
      if (
        utilisationDraftLineItemMerge &&
        (utilisationDraftLineItemMerge.mergedRows > 0 || utilisationDraftLineItemMerge.mergedChildGroups > 0)
      ) {
        logEvent('snapshot.save.utilisationDraftMergedWithLatestState', {
          reason: args.reason,
          recordId: args.existingRecordId || args.utilisationDraftSync?.recordId || null,
          rows: utilisationDraftLineItemMerge.mergedRows,
          childGroups: utilisationDraftLineItemMerge.mergedChildGroups
        });
      }
      const localMutationAtSnapshotStart = lastLocalRecordMutationAtRef.current || 0;
      const nextStatus =
        (args.statusOverride || '').toString().trim() ||
        (args.mode === 'draft'
          ? resolveAutoSaveStatus(
              (((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
                '')
            )
          : '');
      const baseVersion = recordDataVersionRef.current;
      const currentStateFingerprint = buildPersistedDraftStateFingerprint({
        language: snapshotLanguage,
        values: snapshotValues,
        lineItems: snapshotLineItems
      });
      const canUseStatusOnlyClose =
        args.mode === 'submit' &&
        args.statusOnlyWhenClean === true &&
        !args.snapshotOverride &&
        !!args.existingRecordId &&
        !!nextStatus &&
        !recordStaleRef.current &&
        !autoSaveDirtyRef.current &&
        !autoSaveQueuedRef.current &&
        !autoSaveInFlightRef.current &&
        !draftSaveRequestInFlightRef.current &&
        currentStateFingerprint === lastAutoSaveStateFingerprintRef.current;

      let payload: any;
      if (canUseStatusOnlyClose) {
        const statusOnlyRecordId = (args.existingRecordId || '').toString();
        payload = {
          formKey,
          language: snapshotLanguage,
          id: statusOnlyRecordId,
          values: {
            status: nextStatus
          },
          status: nextStatus,
          __ckStatus: nextStatus,
          __ckStatusOnlyClose: '1'
        };
        logEvent('snapshot.save.statusOnlyClose', {
          reason: args.reason,
          recordId: statusOnlyRecordId
        });
      } else {
        const payloadSource = applyUploadedFieldOverrides({
          values: snapshotValues,
          lineItems: snapshotLineItems
        });
        const valuesForPayload = ingredientsFormActive
          ? applyIngredientActivationSystemFields(payloadSource.values as any)
          : payloadSource.values;
        payload = applyUploadedFieldPayloadOverrides(
          args.mode === 'submit'
            ? await buildSubmissionPayload({
                definition,
                formKey,
                language: snapshotLanguage,
                values: valuesForPayload,
                lineItems: payloadSource.lineItems,
                existingRecordId: args.existingRecordId,
                collapsedRows: args.collapsedRows,
                collapsedSubgroups: args.collapsedSubgroups
              })
            : buildDraftPayload({
                definition,
                formKey,
                language: snapshotLanguage,
                values: valuesForPayload,
                lineItems: payloadSource.lineItems,
                existingRecordId: args.existingRecordId
              })
        );
        if (args.mode === 'draft') {
          (payload as any).__ckSaveMode = 'draft';
          markNoopIfUnchanged(payload as any);
          (payload as any).__ckCreateFlow = createFlowRef.current ? '1' : '';
        }
      }
      if (nextStatus) {
        (payload as any).__ckStatus = nextStatus;
        (payload as any).values = {
          ...((((payload as any)?.values || {}) as Record<string, any>) || {}),
          status: nextStatus
        };
      }
      if (args.existingRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
        (payload as any).__ckClientDataVersion = Number(baseVersion);
      }
      const payloadValues = (payload as any).values as Record<string, any> | undefined;
      if (payloadValues) {
        const fileUpdates = computeUrlOnlyUploadUpdates(definition, payloadValues);
        if (Object.keys(fileUpdates).length) {
          setValues(prev => ({ ...prev, ...fileUpdates }));
          setSelectedRecordSnapshot(prev =>
            prev ? { ...prev, values: { ...(prev.values || {}), ...fileUpdates } } : prev
          );
        }
      }
      const runSnapshotRequest = () => {
        if (args.mode !== 'draft') {
          return submitCurrentRecordMutation(`submit:${args.reason}`, payload);
        }
        if (args.utilisationDraftSync) {
          return runCoalescedDraftSaveRequest(`snapshot:${args.reason}`, payload, (nextPayload: any) =>
            submitCurrentRecordMutation(`snapshot:${args.reason}`, nextPayload, (preparedPayload: any) =>
              saveGuidedUtilisationDraft({
                stepId: args.utilisationDraftSync?.stepId,
                clientMutationSeq: args.utilisationDraftSync?.requestEpoch,
                utilisationPlan: {
                  ...(args.utilisationDraftSync?.plan as BankUtilisationPlanRequest),
                  clientDataVersion: resolveCurrentClientDataVersion((preparedPayload as any)?.__ckClientDataVersion) || undefined,
                  refreshMode: 'none'
                },
                draftPayload: preparedPayload
              })
            )
          );
        }
        return runCoalescedDraftSaveRequest(`snapshot:${args.reason}`, payload, (nextPayload: any) =>
          submitCurrentRecordMutation(`snapshot:${args.reason}`, nextPayload)
        );
      };
      let response: any;
      if (args.mode === 'draft') {
        for (let attemptIndex = 0; attemptIndex < DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length; attemptIndex += 1) {
          const delayMs = DRAFT_SNAPSHOT_RETRY_DELAYS_MS[attemptIndex];
          if (delayMs > 0) {
            await new Promise<void>(resolve => globalThis.setTimeout(resolve, delayMs));
          }
          try {
            response = await runSnapshotRequest();
          } catch (err: any) {
            const message =
              resolveUiErrorMessage(err, 'Failed to save the current record.') ||
              resolveLogMessage(err, 'Failed to save the current record.');
            if (isRetryableRecordBusyMessage(message) && attemptIndex < DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length - 1) {
              setDraftSave({ phase: 'saving' });
              logEvent('snapshot.save.retryableBusy.retryScheduled', {
                reason: args.reason,
                attempt: attemptIndex + 1,
                attempts: DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length,
                delayMs: DRAFT_SNAPSHOT_RETRY_DELAYS_MS[attemptIndex + 1],
                message
              });
              continue;
            }
            throw err;
          }
          const retryableFailure = !response?.success && isRetryableRecordBusyMessage(response?.message);
          if (retryableFailure && attemptIndex < DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length - 1) {
            setDraftSave({ phase: 'saving' });
            logEvent('snapshot.save.retryableBusy.retryScheduled', {
              reason: args.reason,
              attempt: attemptIndex + 1,
              attempts: DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length,
              delayMs: DRAFT_SNAPSHOT_RETRY_DELAYS_MS[attemptIndex + 1],
              message: (response?.message || '').toString()
            });
            continue;
          }
          break;
        }
      } else {
        response = await runSnapshotRequest();
      }
      const ok = Boolean(response?.success);
      const recordId = (((response as any)?.meta?.id) || args.existingRecordId || '').toString().trim();
      if (!ok) {
        return {
          success: false,
          response,
          payload,
          recordId,
          message: (response?.message || 'Failed to save the current record.').toString()
        };
      }
      if (
        args.utilisationDraftSync &&
        !shouldApplyUtilisationPlanResponse({
          requestEpoch: args.utilisationDraftSync.requestEpoch,
          latestEpoch: utilisationSyncEpochRef.current,
          requestSessionId: args.utilisationDraftSync.sessionId,
          currentSessionId: recordSessionRef.current,
          requestRecordId: args.utilisationDraftSync.recordId,
          currentRecordId:
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || ''
        })
      ) {
        autoSaveDirtyRef.current = true;
        autoSaveQueuedRef.current = true;
        setDraftSave({ phase: 'dirty' });
        logEvent('snapshot.save.skipped.staleUtilisationDraftSync', {
          reason: args.reason,
          recordId: recordId || args.existingRecordId || null,
          requestEpoch: args.utilisationDraftSync.requestEpoch,
          latestEpoch: utilisationSyncEpochRef.current
        });
        return { success: true, response, payload, recordId, stale: true };
      }
      if (recordId) {
        applySuccessfulSubmissionState({
          recordId,
          payload,
          response,
          statusFallback: nextStatus || null
        });
      }
      const noLocalEditsDuringSnapshot =
        (lastLocalRecordMutationAtRef.current || 0) === localMutationAtSnapshotStart;
      let baselineValues = valuesRef.current;
      let baselineLineItems = lineItemsRef.current;
      if (args.mode === 'draft') {
        const completedDraftFingerprint = buildCompletedDraftSaveFingerprint(payload, recordId || args.existingRecordId || null);
        if (completedDraftFingerprint) {
          lastCompletedDraftSaveFingerprintRef.current = completedDraftFingerprint;
          logEvent('snapshot.save.completedFingerprint', {
            reason: args.reason,
            recordId: completedDraftFingerprint.recordId
          });
        }
      }
      if (noLocalEditsDuringSnapshot && args.snapshotOverride?.lineItems) {
        const utilisationLineItemMerge = mergeGuidedUtilisationLineItemsFromSnapshot({
          definition,
          stepId: activeGuidedStepIdRef.current || '',
          sourceLineItems: args.snapshotOverride.lineItems,
          targetLineItems: lineItemsRef.current,
          mode: 'all'
        });
        if (utilisationLineItemMerge.mergedRows > 0 || utilisationLineItemMerge.mergedChildGroups > 0) {
          const mappedUtilisationState = applyValueMapsToForm(
            definition,
            valuesRef.current,
            utilisationLineItemMerge.lineItems,
            { mode: 'change' }
          );
          baselineValues = mappedUtilisationState.values;
          baselineLineItems = mappedUtilisationState.lineItems;
          valuesRef.current = baselineValues;
          lineItemsRef.current = baselineLineItems;
          setValues(baselineValues);
          setLineItems(baselineLineItems);
          logEvent('snapshot.save.utilisationRowsMerged', {
            reason: args.reason,
            recordId: recordId || args.existingRecordId || null,
            rows: utilisationLineItemMerge.mergedRows,
            childGroups: utilisationLineItemMerge.mergedChildGroups
          });
        }
      }
      if (noLocalEditsDuringSnapshot) {
        autoSaveDirtyRef.current = false;
        autoSaveQueuedRef.current = false;
        rememberAutoSaveSeenState(baselineValues, baselineLineItems);
        markPostPersistAutoSaveSuppress(localMutationAtSnapshotStart);
      } else {
        autoSaveDirtyRef.current = true;
        autoSaveQueuedRef.current = true;
      }
      uploadedFieldValueOverridesRef.current.clear();
      setDraftSave(
        noLocalEditsDuringSnapshot
          ? {
              phase: 'saved',
              updatedAt: ((response?.meta?.updatedAt || '') as string).toString() || undefined
            }
          : { phase: 'dirty' }
      );
      clearSaveFailureStatusAfterSuccessfulSave(`snapshot.${args.reason}`);
      logEvent('snapshot.save.success', {
        reason: args.reason,
        mode: args.mode,
        recordId: recordId || null,
        status: nextStatus || null
      });
      return { success: true, response, payload, recordId };
    },
    [
      applySuccessfulSubmissionState,
      applyUploadedFieldPayloadOverrides,
      applyUploadedFieldOverrides,
      buildPersistedDraftStateFingerprint,
      clearSaveFailureStatusAfterSuccessfulSave,
      definition,
      formKey,
      ingredientsFormActive,
      isRetryableRecordBusyMessage,
      isGuidedUtilisationDraftSyncEpochApplied,
      logEvent,
      markPostPersistAutoSaveSuppress,
      rememberAutoSaveSeenState,
      resolveLogMessage,
      resolveAutoSaveStatus,
      resolveUiErrorMessage,
      runCoalescedDraftSaveRequest,
      submitPreviousActionRetryMessage,
      submitCurrentRecordMutation,
      waitForBackgroundSaves,
      waitForPendingFollowupBatch,
      waitForDraftSaveRequest
    ]
  );

  const openConfiguredConfirmDialog = useCallback(
    (args: {
      dialog: any;
      kind: string;
      refId: string;
      defaultTitle?: string;
      defaultConfirmLabel?: string;
      defaultCancelLabel?: string;
    }): Promise<boolean> =>
      new Promise(resolve => {
        const runButtonAction = async (source: 'confirm' | 'cancel') => {
          const action =
            source === 'confirm'
              ? (args.dialog?.confirmAction as SystemActionGateDialogActionConfig | undefined)
              : (args.dialog?.cancelAction as SystemActionGateDialogActionConfig | undefined);
          if (!action) return;
          const runner = configuredDialogActionRunnerRef.current;
          if (!runner) {
            logEvent('configuredDialog.action.skipped.noRunner', {
              kind: args.kind,
              refId: args.refId,
              source,
              actionType: (action as any)?.type || null,
              actionId: (action as any)?.id || null
            });
            return;
          }
          try {
            await runner(action, { source, kind: args.kind, refId: args.refId });
          } catch (err: any) {
            logEvent('configuredDialog.action.exception', {
              kind: args.kind,
              refId: args.refId,
              source,
              actionType: (action as any)?.type || null,
              actionId: (action as any)?.id || null,
              message: err?.message || err?.toString?.() || 'unknown'
            });
          }
        };
        customConfirm.openConfirm({
          title: resolveOptionalLocalizedString(
            args.dialog?.title,
            languageRef.current,
            args.defaultTitle || tSystem('common.notice', languageRef.current, 'Notice')
          ),
          message: resolveDialogTemplate(args.dialog?.message, ''),
          confirmLabel: resolveLocalizedString(
            args.dialog?.confirmLabel,
            languageRef.current,
            args.defaultConfirmLabel || tSystem('common.confirm', languageRef.current, 'Confirm')
          ),
          cancelLabel: resolveLocalizedString(
            args.dialog?.cancelLabel,
            languageRef.current,
            args.defaultCancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel')
          ),
          primaryAction: args.dialog?.primaryAction,
          showCancel: args.dialog?.showCancel,
          showConfirm: args.dialog?.showConfirm,
          showCloseButton: args.dialog?.showCloseButton,
          dismissOnBackdrop: args.dialog?.dismissOnBackdrop,
          kind: args.kind,
          refId: args.refId,
          onConfirm: async () => {
            await runButtonAction('confirm');
            resolve(true);
          },
          onCancel: async () => {
            await runButtonAction('cancel');
            resolve(false);
          }
        });
      }),
    [customConfirm, logEvent, resolveDialogTemplate]
  );

  const {
    adoptGuidedStepUtilisationPlanResult,
    resolveGuidedStepUtilisationPlan,
    queueGuidedStepUtilisationPlan
  } = useGuidedUtilisationPlanSync({
    definition,
    formKey,
    language,
    languageRef,
    lineItemsRef,
    utilisationManagedScopesRef,
    utilisationSyncEpochRef,
    utilisationSyncMetaRef,
    utilisationSyncPromiseRef,
    recordSessionRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    guidedDataSourceConfigs,
    applySuccessfulSubmissionState,
    getCurrentKnownClientDataVersion,
    logEvent,
    markDataSourceFreshnessServerTouch,
    markRecordFreshnessServerTouch,
    openConfiguredConfirmDialog,
    refreshGuidedDataSourcesInBackground,
    resolveLogMessage,
    setRequestedGuidedStepId
  });

  const queueGuidedStepUtilisationDraftSync = useCallback(
    (args: {
      stepId: string;
      reason: string;
      persistSnapshot?: boolean;
      snapshotLineItems?: LineItemState;
      releaseScopes?: BankUtilisationPlanScope[];
    }) => {
      const sessionId = recordSessionRef.current;
      const persistSnapshot = args.persistSnapshot !== false;
      const snapshotLineItems = args.snapshotLineItems || lineItemsRef.current;
      const releaseScopes = Array.isArray(args.releaseScopes) ? args.releaseScopes : [];
      if (
        shouldSkipUtilisationDraftSyncForDeleteOnKeyChange({
          releaseScopeCount: releaseScopes.length,
          dedupDeleteOnKeyChangeInFlight: dedupDeleteOnKeyChangeInFlightRef.current,
          dedupDeletePending: dedupDeleteOnKeyChangePendingRef.current
        })
      ) {
        logEvent('guidedStep.liveSync.skipped.deleteOnKeyChange', {
          stepId: args.stepId,
          reason: args.reason,
          releaseScopes: releaseScopes.length,
          dedupDeleteOnKeyChangeInFlight: dedupDeleteOnKeyChangeInFlightRef.current,
          dedupDeletePending: dedupDeleteOnKeyChangePendingRef.current
        });
        return;
      }
      const releaseScopeSignature = releaseScopes
        .map(scope =>
          [
            (scope?.sourceParentGroupId || '').toString().trim(),
            (scope?.sourceParentRowId || '').toString().trim(),
            (scope?.sourceOutputGroupId || '').toString().trim()
          ].join(':')
        )
        .filter(Boolean)
        .sort()
        .join('|');
      const queueFingerprint = [
        sessionId,
        args.stepId || '',
        persistSnapshot ? 'persist' : 'planOnly',
        releaseScopeSignature,
        buildPersistedDraftStateFingerprint({
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: snapshotLineItems
        })
      ].join('::');
      if (
        guidedStepImmediateSyncActiveFingerprintRef.current === queueFingerprint ||
        guidedStepImmediateSyncPendingFingerprintRef.current === queueFingerprint
      ) {
        logEvent('guidedStep.liveSync.coalesced', {
          stepId: args.stepId,
          reason: args.reason
        });
        return;
      }

      const utilisationEpoch = issueUtilisationRequestEpoch(utilisationSyncEpochRef.current);
      utilisationSyncEpochRef.current = utilisationEpoch;
      const queuedRecordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      const queuedUtilisationPlan = queuedRecordId
        ? resolveGuidedStepUtilisationPlan({
            stepId: args.stepId,
            recordId: queuedRecordId,
            mode: 'step',
            snapshotLineItems,
            previousManagedScopes: releaseScopes
          })
        : null;
      if (queuedUtilisationPlan) {
        pendingGuidedUtilisationDraftSyncRef.current = {
          stepId: args.stepId,
          recordId: queuedRecordId,
          plan: queuedUtilisationPlan,
          requestEpoch: utilisationEpoch,
          sessionId
        };
      }
      guidedStepImmediateSyncPendingRef.current = {
        ...args,
        sessionId,
        utilisationEpoch,
        fingerprint: queueFingerprint,
        persistSnapshot,
        snapshotLineItems
      };
      guidedStepImmediateSyncPendingFingerprintRef.current = queueFingerprint;

      if (guidedStepImmediateSyncPromiseRef.current) {
        logEvent('guidedStep.liveSync.queued', {
          stepId: args.stepId,
          reason: args.reason,
          utilisationEpoch
        });
        return;
      }

      guidedStepImmediateSyncPromiseRef.current = (async () => {
        while (guidedStepImmediateSyncPendingRef.current) {
          const next = guidedStepImmediateSyncPendingRef.current;
          guidedStepImmediateSyncPendingRef.current = null;
          guidedStepImmediateSyncPendingFingerprintRef.current = '';
          guidedStepImmediateSyncActiveFingerprintRef.current = next.fingerprint;
          guidedStepLastUtilisationSyncFreshnessRef.current = null;

          let recordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';
          if (!recordId && next.persistSnapshot) {
            logEvent('guidedStep.liveSync.ensureRecord.start', {
              stepId: next.stepId,
              reason: next.reason
            });
            const ensured = await ensureDraftRecordId({
              reason: `guidedStep.liveSync:${next.stepId || 'step'}`,
              fieldPath: next.stepId || undefined
            });
            if (recordSessionRef.current !== next.sessionId) continue;
            recordId = `${ensured?.recordId || ''}`.trim();
            if (!ensured?.success || !recordId) {
              const message = (ensured?.message || 'Could not prepare the record.').toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('guidedStep.liveSync.ensureRecord.failed', {
                stepId: next.stepId,
                reason: next.reason,
                message
              });
              continue;
            }
            logEvent('guidedStep.liveSync.ensureRecord.done', {
              stepId: next.stepId,
              reason: next.reason,
              recordId
            });
          }
          if (!recordId) {
            logEvent('guidedStep.liveSync.skipped.noRecordId', {
              stepId: next.stepId,
              reason: next.reason
            });
            continue;
          }

          if (guidedStepImmediateSyncPendingRef.current) {
            logEvent('guidedStep.liveSync.supersededBeforePersist', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              utilisationEpoch: next.utilisationEpoch
            });
            continue;
          }

          const utilisationPlan = resolveGuidedStepUtilisationPlan({
            stepId: next.stepId,
            recordId,
            mode: 'step',
            snapshotLineItems: next.snapshotLineItems,
            previousManagedScopes: next.releaseScopes
          });
          if (!utilisationPlan) continue;
          pendingGuidedUtilisationDraftSyncRef.current = {
            stepId: next.stepId,
            recordId,
            plan: utilisationPlan,
            requestEpoch: next.utilisationEpoch,
            sessionId: next.sessionId
          };
          const snapshotOverride = {
            values: valuesRef.current,
            lineItems: next.snapshotLineItems || lineItemsRef.current,
            language: languageRef.current
          };

          logEvent('guidedStep.liveSync.begin', {
            stepId: next.stepId,
            reason: next.reason,
            recordId,
            utilisations: utilisationPlan.utilisations?.length || 0,
            managedScopes: utilisationPlan.managedScopes?.length || 0,
            utilisationEpoch: next.utilisationEpoch
          });

          if (!next.persistSnapshot) {
            const utilisationOutcome = await queueGuidedStepUtilisationPlan({
              stepId: next.stepId,
              recordId,
              plan: utilisationPlan,
              logPrefix: 'guidedStep.liveSync',
              dialogKind: 'guidedStepLiveSync',
              requestEpoch: next.utilisationEpoch
            });
            if (recordSessionRef.current !== next.sessionId) continue;
            if (utilisationOutcome.stale) {
              logEvent('guidedStep.liveSync.skipped.staleUtilisationOutcome', {
                stepId: next.stepId,
                reason: next.reason,
                recordId,
                utilisationEpoch: next.utilisationEpoch
              });
              continue;
            }
            if (!utilisationOutcome.success) {
              logEvent('guidedStep.liveSync.blocked.utilisationFailed', {
                stepId: next.stepId,
                reason: next.reason,
                recordId,
                message: utilisationOutcome.message || null
              });
              continue;
            }
            guidedStepLastUtilisationSyncFreshnessRef.current = utilisationOutcome.freshness || null;
            logEvent('guidedStep.liveSync.done', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              persistedSnapshot: false
            });
            continue;
          }

          autoSaveDirtyRef.current = true;
          autoSaveQueuedRef.current = false;
          setDraftSave(prev => (prev.phase === 'saving' || prev.phase === 'dirty' ? prev : { phase: 'dirty' }));

          const snapshotResult = await persistCurrentSnapshot({
            reason: `${next.reason}.utilisationConfirmed`,
            mode: 'draft',
            existingRecordId: recordId,
            snapshotOverride,
            utilisationDraftSync: {
              stepId: next.stepId,
              recordId,
              plan: utilisationPlan,
              requestEpoch: next.utilisationEpoch,
              sessionId: next.sessionId
            }
          });
          if (recordSessionRef.current !== next.sessionId) continue;
          if (snapshotResult.stale) {
            logEvent('guidedStep.liveSync.skipped.staleSnapshotOutcome', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              utilisationEpoch: next.utilisationEpoch
            });
            continue;
          }
          const utilisationResult = snapshotResult.response?.utilisationResult;
          if (utilisationResult) {
            const utilisationOutcome = await adoptGuidedStepUtilisationPlanResult({
              stepId: next.stepId,
              recordId,
              plan: utilisationPlan,
              utilisationResult,
              logPrefix: 'guidedStep.liveSync',
              dialogKind: 'guidedStepLiveSync',
              requestEpoch: next.utilisationEpoch,
              sessionId: next.sessionId
            });
            if (recordSessionRef.current !== next.sessionId) continue;
            if (utilisationOutcome.stale) {
              logEvent('guidedStep.liveSync.skipped.staleUtilisationOutcome', {
                stepId: next.stepId,
                reason: next.reason,
                recordId,
                utilisationEpoch: next.utilisationEpoch
              });
              continue;
            }
            if (!utilisationOutcome.success) {
              logEvent('guidedStep.liveSync.blocked.utilisationFailed', {
                stepId: next.stepId,
                reason: next.reason,
                recordId,
                message: utilisationOutcome.message || null
              });
              continue;
            }
            guidedStepLastUtilisationSyncFreshnessRef.current = utilisationOutcome.freshness || null;
          }
          if (!snapshotResult.success) {
            const message = (snapshotResult.message || 'Could not save the latest changes.').toString();
            if (isSubmissionStaleMessage(message)) {
              logEvent('guidedStep.liveSync.snapshot.deferredToAutosave', {
                stepId: next.stepId,
                reason: next.reason,
                recordId,
                message
              });
              continue;
            }
            setStatus(message);
            setStatusLevel('error');
            setRequestedGuidedStepId(next.stepId || null);
            logEvent('guidedStep.liveSync.snapshot.failed', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              message
            });
            continue;
          }

          logEvent('guidedStep.liveSync.done', {
            stepId: next.stepId,
            reason: next.reason,
            recordId: snapshotResult.recordId || recordId,
            persistedSnapshot: true
          });
        }
      })()
        .catch(err => {
          logEvent('guidedStep.liveSync.exception', {
            message: resolveLogMessage(err, 'Failed to synchronize the guided step.')
          });
        })
        .finally(() => {
          guidedStepImmediateSyncPromiseRef.current = null;
          guidedStepImmediateSyncActiveFingerprintRef.current = '';
          if (guidedStepImmediateSyncPendingRef.current) {
            queueGuidedStepUtilisationDraftSync({
              stepId: guidedStepImmediateSyncPendingRef.current.stepId,
              reason: guidedStepImmediateSyncPendingRef.current.reason,
              persistSnapshot: guidedStepImmediateSyncPendingRef.current.persistSnapshot,
              snapshotLineItems: guidedStepImmediateSyncPendingRef.current.snapshotLineItems,
              releaseScopes: guidedStepImmediateSyncPendingRef.current.releaseScopes
            });
          } else if (!submittingRef.current && (autoSaveDirtyRef.current || autoSaveQueuedRef.current)) {
            scheduleLatestAutoSave('guidedStepLiveSync.release', autoSaveDebounceMs);
          }
          resumeDeferredRecordFreshnessSyncRef.current('guidedStep.liveSync.release');
        });
    },
    [
      adoptGuidedStepUtilisationPlanResult,
      autoSaveDebounceMs,
      buildPersistedDraftStateFingerprint,
      ensureDraftRecordId,
      logEvent,
      persistCurrentSnapshot,
      queueGuidedStepUtilisationPlan,
      resolveGuidedStepUtilisationPlan,
      resolveLogMessage,
      scheduleLatestAutoSave
    ]
  );

  const queueGuidedStepBackgroundSync = useCallback(
    (args: { stepId: string; nextStepId?: string; trigger: 'next' | 'auto' }) => {
      const sessionId = recordSessionRef.current;
      if (
        shouldSkipGuidedStepBackgroundSync({
          autoSaveDirty: autoSaveDirtyRef.current,
          autoSaveQueued: autoSaveQueuedRef.current,
          lastExternalSyncAt: lastExternalRecordSyncAtRef.current,
          lastLocalRecordMutationAt: lastLocalRecordMutationAtRef.current
        })
      ) {
        logEvent('guidedStep.advance.backgroundSync.skipped.externalSyncBaseline', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger,
          lastExternalSyncAt: lastExternalRecordSyncAtRef.current || null,
          lastLocalRecordMutationAt: lastLocalRecordMutationAtRef.current || null
        });
        return;
      }
      const queueFingerprint = [
        sessionId,
        args.stepId || '',
        args.nextStepId || '',
        args.trigger,
        buildPersistedDraftStateFingerprint({
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current
        }),
        autoSaveDirtyRef.current ? 'dirty' : 'clean',
        autoSaveQueuedRef.current ? 'queued' : 'idle'
      ].join('::');
      if (
        guidedStepBackgroundSyncActiveFingerprintRef.current === queueFingerprint ||
        guidedStepBackgroundSyncPendingFingerprintRef.current === queueFingerprint
      ) {
        logEvent('guidedStep.advance.backgroundSync.coalesced', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
        return;
      }

      guidedStepBackgroundSyncPendingRef.current = {
        ...args,
        sessionId,
        fingerprint: queueFingerprint
      };
      guidedStepBackgroundSyncPendingFingerprintRef.current = queueFingerprint;

      if (guidedStepBackgroundSyncPromiseRef.current) {
        logEvent('guidedStep.advance.backgroundSync.queued', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
        return;
      }

      guidedStepBackgroundSyncPromiseRef.current = (async () => {
        while (guidedStepBackgroundSyncPendingRef.current) {
          const next = guidedStepBackgroundSyncPendingRef.current;
          guidedStepBackgroundSyncPendingRef.current = null;
          guidedStepBackgroundSyncPendingFingerprintRef.current = '';
          guidedStepBackgroundSyncActiveFingerprintRef.current = next.fingerprint;

          const reason = `guidedStepAdvance:${next.stepId || 'step'}:${next.trigger}`;
          let recordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';

          const hadDraftSaveInFlight = draftSaveRequestInFlightRef.current;
          if (hadDraftSaveInFlight) {
            await waitForDraftSaveRequest(`${reason}.queued`);
            if (recordSessionRef.current !== next.sessionId) continue;
            recordId =
              resolveExistingRecordId({
                selectedRecordId: selectedRecordIdRef.current,
                selectedRecordSnapshot: selectedRecordSnapshotRef.current,
                lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
              }) || recordId;
          }

          const needsDraftSave = autoSaveDirtyRef.current || autoSaveQueuedRef.current;
          if (needsDraftSave) {
            const snapshotResult = await persistCurrentSnapshot({
              reason: `${reason}.background`,
              mode: 'draft',
              existingRecordId: recordId || undefined
            });
            if (recordSessionRef.current !== next.sessionId) continue;
            if (!snapshotResult.success) {
              const message = (snapshotResult.message || 'Could not save the latest changes.').toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('guidedStep.advance.backgroundSnapshot.failed', {
                stepId: next.stepId,
                nextStepId: next.nextStepId || null,
                recordId: recordId || null,
                message
              });
              continue;
            }
            recordId = snapshotResult.recordId || recordId;
          }

          if (!recordId) continue;
          const utilisationPlan = resolveGuidedStepUtilisationPlan({
            stepId: next.stepId,
            recordId,
            mode: 'step'
          });
          if (!utilisationPlan) continue;
          void queueGuidedStepUtilisationPlan({
            stepId: next.stepId,
            recordId,
            plan: utilisationPlan,
            logPrefix: 'guidedStep.advance',
            dialogKind: 'guidedStepAdvance'
          });
        }
      })()
        .catch(err => {
          logEvent('guidedStep.advance.backgroundSync.exception', {
            message: resolveLogMessage(err, 'Failed to synchronize guided step changes.')
          });
        })
        .finally(() => {
          guidedStepBackgroundSyncPromiseRef.current = null;
          guidedStepBackgroundSyncActiveFingerprintRef.current = '';
          if (guidedStepBackgroundSyncPendingRef.current) {
            queueGuidedStepBackgroundSync({
              stepId: guidedStepBackgroundSyncPendingRef.current.stepId,
              nextStepId: guidedStepBackgroundSyncPendingRef.current.nextStepId,
              trigger: guidedStepBackgroundSyncPendingRef.current.trigger
            });
          }
          resumeDeferredRecordFreshnessSyncRef.current('guidedStep.backgroundSync.release');
        });
    },
    [
      buildPersistedDraftStateFingerprint,
      logEvent,
      persistCurrentSnapshot,
      queueGuidedStepUtilisationPlan,
      resolveGuidedStepUtilisationPlan,
      resolveLogMessage,
      waitForDraftSaveRequest
    ]
  );

  const waitForPendingUtilisationSync = useCallback(
    async (args: {
      recordId: string;
      reason: string;
    }): Promise<GuidedUtilisationSyncWaitResult> => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return { ok: true };
      const meta = utilisationSyncMetaRef.current;
      if (!meta || meta.recordId !== recordId) return { ok: true };
      if (meta.status === 'failed') {
        const message =
          meta.message ||
          tSystem(
            'bank.utilisationUpdateFailedDetail',
            languageRef.current,
            "We couldn't update the utilisation properly. Please try again."
          );
        logEvent('utilisationSync.wait.blocked.failed', {
          reason: args.reason,
          recordId,
          stepId: meta.stepId
        });
        setRequestedGuidedStepId(meta.stepId || null);
        return { ok: false, message };
      }
      if (meta.status !== 'running' || !utilisationSyncPromiseRef.current) {
        return { ok: true };
      }
      logEvent('utilisationSync.wait.start', {
        reason: args.reason,
        recordId,
        stepId: meta.stepId
      });
      const outcome = await utilisationSyncPromiseRef.current.catch(() => ({
        success: false,
        message:
          meta.message ||
          tSystem(
            'bank.utilisationUpdateFailedDetail',
            languageRef.current,
            "We couldn't update the utilisation properly. Please try again."
          ),
        recordId,
        stepId: meta.stepId,
        sessionId: meta.sessionId,
        freshness: null
      }));
      if (!outcome.success) {
        setRequestedGuidedStepId(outcome.stepId || null);
        return {
          ok: false,
          message:
            outcome.message ||
            tSystem(
              'bank.utilisationUpdateFailedDetail',
              languageRef.current,
              "We couldn't update the utilisation properly. Please try again."
          )
        };
      }
      return { ok: true, waitedForSync: true, freshness: outcome.freshness || null };
    },
    [logEvent]
  );

  const waitForGuidedStepUtilisationDraftSync = useCallback(
    async (args: {
      recordId: string;
      stepId?: string;
      reason: string;
    }): Promise<GuidedUtilisationSyncWaitResult> => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return { ok: true };
      let waitedForImmediateSync = false;
      let immediateFreshness: GuidedUtilisationSyncFreshness | null = null;
      if (guidedStepImmediateSyncPromiseRef.current) {
        waitedForImmediateSync = true;
        logEvent('guidedStep.liveSync.wait.start', {
          reason: args.reason,
          recordId,
          stepId: args.stepId || null
        });
        await guidedStepImmediateSyncPromiseRef.current.catch(() => undefined);
        logEvent('guidedStep.liveSync.wait.done', {
          reason: args.reason,
          recordId,
          stepId: args.stepId || null
        });
        immediateFreshness = guidedStepLastUtilisationSyncFreshnessRef.current;
      }
      const utilisationWait = await waitForPendingUtilisationSync({
        recordId,
        reason: args.reason
      });
      if (!utilisationWait.ok) return utilisationWait;
      return {
        ...utilisationWait,
        waitedForSync: utilisationWait.waitedForSync || waitedForImmediateSync,
        freshness: utilisationWait.freshness || immediateFreshness || null
      };
    },
    [logEvent, waitForPendingUtilisationSync]
  );

  const handleBeforeGuidedStepAdvance = useCallback(
    async (args: {
      stepId: string;
      nextStepId?: string;
      stepIndex?: number;
      nextStepIndex?: number;
      trigger: 'next' | 'auto';
      waitDialog?: SystemActionGateDialogConfig | null;
      queueBackgroundUtilisationSync?: boolean;
    }): Promise<{ success: boolean; message?: string }> => {
      const existingRecordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      const invalidUtilisationDrafts = resolveInvalidGuidedUtilisationDraftsForStep(args.stepId);
      if (invalidUtilisationDrafts.length) {
        logEvent('guidedStep.advance.blocked.invalidUtilisationDraft', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger,
          blockers: invalidUtilisationDrafts.map(entry => ({
            groupId: entry.groupId,
            parentRowId: entry.parentRowId,
            sourceKey: entry.sourceKey,
            reason: entry.reason
          }))
        });
        return { success: false };
      }
      if (
        guidedStepRequiresPersistedRecord({
          currentStepIndex: args.stepIndex,
          nextStepIndex: args.nextStepIndex,
          currentRecordId: existingRecordId
        })
      ) {
        const seq = guidedStepAdvanceBusy.lock({
          title: tSystemOptional('navigation.waitSavingTitle', languageRef.current, ''),
          message: tSystem(
            'navigation.waitSaving',
            languageRef.current,
            'Do not leave this page while your changes are being saved'
          ),
          kind: 'guidedStepRecordId',
          diagnosticMeta: {
            stepId: args.stepId,
            stepIndex: args.stepIndex ?? null,
            nextStepId: args.nextStepId || null,
            nextStepIndex: args.nextStepIndex ?? null,
            trigger: args.trigger
          }
        });
        try {
          let recordIdAfterActiveSaveWait =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';
          if (
            shouldWaitForActiveDraftSaveBeforeEnsuringRecord({
              currentRecordId: recordIdAfterActiveSaveWait,
              autoSaveInFlight: autoSaveInFlightRef.current,
              draftSaveInFlight: draftSaveRequestInFlightRef.current,
              draftSavePromiseInFlight: Boolean(draftSaveRequestPromiseRef.current)
            })
          ) {
            const activeSaveWait = await waitForActiveDraftSaveTransactions(
              `guidedStepAdvance:${args.stepId || 'step'}:${args.trigger}.activeDraftSave`
            );
            recordIdAfterActiveSaveWait =
              resolveExistingRecordId({
                selectedRecordId: selectedRecordIdRef.current,
                selectedRecordSnapshot: selectedRecordSnapshotRef.current,
                lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
              }) || '';
            if (recordIdAfterActiveSaveWait) {
              clearSaveFailureStatusAfterSuccessfulSave('guidedStep.advance.activeDraftSave');
              logEvent('guidedStep.advance.ensureRecordId.reusedActiveSave', {
                stepId: args.stepId,
                nextStepId: args.nextStepId || null,
                trigger: args.trigger,
                recordId: recordIdAfterActiveSaveWait
              });
            } else if (!activeSaveWait.ok) {
              const message = (activeSaveWait.message || 'Could not save the latest changes.').toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('guidedStep.advance.ensureRecordId.activeSaveFailed', {
                stepId: args.stepId,
                nextStepId: args.nextStepId || null,
                trigger: args.trigger,
                message
              });
              return { success: false, message };
            }
          }
          if (!recordIdAfterActiveSaveWait) {
            const ensured = await ensureDraftRecordId({
              reason: `guidedStepAdvance:${args.stepId || 'step'}:${args.trigger}`
            });
            if (!ensured.success || !ensured.recordId) {
              const message = (ensured.message || 'Could not save the latest changes.').toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('guidedStep.advance.ensureRecordId.failed', {
                stepId: args.stepId,
                nextStepId: args.nextStepId || null,
                trigger: args.trigger,
                message
              });
              return { success: false, message };
            }
            logEvent('guidedStep.advance.ensureRecordId.done', {
              stepId: args.stepId,
              nextStepId: args.nextStepId || null,
              trigger: args.trigger,
              recordId: ensured.recordId
            });
          }
        } finally {
          guidedStepAdvanceBusy.unlock(seq, {
            stepId: args.stepId,
            nextStepId: args.nextStepId || null,
            trigger: args.trigger
          });
        }
      }
      const waitResult = await waitForGuidedStepAdvance(args);
      if (!waitResult.success) return waitResult;
      if (args.queueBackgroundUtilisationSync === false) {
        logEvent('guidedStep.advance.backgroundSync.skipped.config', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
      } else {
        queueGuidedStepBackgroundSync(args);
      }
      return { success: true };
    },
    [
      ensureDraftRecordId,
      clearSaveFailureStatusAfterSuccessfulSave,
      guidedStepAdvanceBusy,
      logEvent,
      queueGuidedStepBackgroundSync,
      resolveInvalidGuidedUtilisationDraftsForStep,
      waitForActiveDraftSaveTransactions,
      waitForGuidedStepAdvance
    ]
  );

  const handleGuidedStepMilestone = useCallback(
    async (args: {
      stepId: string;
      action: StepMilestoneActionConfig;
      nextStepId?: string;
    }): Promise<{ success: boolean; advanceToNext?: boolean; message?: string }> => {
      if (!args.action || args.action.type !== 'followupBatch') {
        return { success: false, message: 'Unsupported step action.' };
      }
      const preActions = Array.isArray(args.action.preActions)
        ? args.action.preActions.map((entry: string) => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const backgroundActions = Array.isArray(args.action.backgroundActions)
        ? args.action.backgroundActions.map((entry: string) => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const legacyActions = Array.isArray(args.action.actions)
        ? args.action.actions.map((entry: string) => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const effectiveBackgroundActions =
        backgroundActions.length > 0
          ? backgroundActions
          : (preActions.length === 0 ? legacyActions : []);
      const normalizedPreActions = preActions.map(entry => (entry || '').toString().trim().toUpperCase()).filter(Boolean);
      const normalizedBackgroundActions = effectiveBackgroundActions
        .map(entry => (entry || '').toString().trim().toUpperCase())
        .filter(Boolean);
      const milestoneEmailDispatchMode =
        args.action.emailDispatchMode === 'direct' || args.action.emailDispatchMode === 'queued'
          ? args.action.emailDispatchMode
          : undefined;
      const followupBatchOptions: FollowupBatchOptions | undefined = milestoneEmailDispatchMode
        ? { emailDispatchMode: milestoneEmailDispatchMode }
        : undefined;
      const closeOnlyPrimarySubmitMilestone =
        normalizedPreActions.length === 1 &&
        normalizedPreActions[0] === 'CLOSE_RECORD' &&
        normalizedBackgroundActions.length === 0 &&
        args.action.runInBackground !== true;
      const resolveOptimisticStatusForActions = (actions: string[]): string => {
        const transition = resolveOptimisticStatusTransitionForActions(actions);
        if (transition === 'onClose') {
          return resolveStatusTransitionValue(statusTransitions, 'onClose', languageRef.current, {
            includeDefaultOnClose: true
          }) || 'Closed';
        }
        if (transition === 'onPdf') {
          return resolveStatusTransitionValue(statusTransitions, 'onPdf', languageRef.current, {
            includeDefaultOnClose: false
          });
        }
        if (transition === 'onEmail') {
          return resolveStatusTransitionValue(statusTransitions, 'onEmail', languageRef.current, {
            includeDefaultOnClose: false
          });
        }
        return '';
      };
      if (!preActions.length && !effectiveBackgroundActions.length) {
        return { success: true, advanceToNext: args.action.advanceAfterStart !== false };
      }

      const reason = `guidedStepMilestone:${args.stepId || 'step'}`;
      const guidedStepPrefix = ((((definition as any)?.steps as any)?.stateFields?.prefix || '__ckStep') as string).toString();
      const milestoneVirtualState: GuidedStepsVirtualState | null =
        guidedUiState?.activeStepId
          ? {
              prefix: guidedStepPrefix,
              activeStepId: guidedUiState.activeStepId,
              activeStepIndex: guidedUiState.activeStepIndex || 0,
              maxValidIndex: -1,
              maxCompleteIndex: -1,
              steps: []
            }
          : null;
      const milestoneDialogCtx = buildValidationContext(valuesRef.current as any, lineItemsRef.current as any, milestoneVirtualState);
      const milestoneConfirmationDialog = selectMilestoneConfirmationDialog({
        action: args.action,
        ctx: milestoneDialogCtx,
        now: new Date()
      });
      const milestoneProgressDialog = selectMilestoneProgressDialog({
        action: args.action,
        ctx: milestoneDialogCtx,
        now: new Date()
      });
      if (milestoneConfirmationDialog) {
        logEvent('guidedStep.milestone.confirm.prompt', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          hasConditionalCases: Array.isArray(args.action.confirmationDialogCases) && args.action.confirmationDialogCases.length > 0,
          title: resolveOptionalLocalizedString(milestoneConfirmationDialog.title, languageRef.current, '') || null
        });
        const confirmed = await openConfiguredConfirmDialog({
          dialog: milestoneConfirmationDialog,
          kind: 'guidedStepMilestone',
          refId: args.stepId
        });
        if (!confirmed) {
          logEvent('guidedStep.milestone.confirm.cancel', {
            stepId: args.stepId,
            nextStepId: args.nextStepId || null
          });
          return { success: false, advanceToNext: false, message: 'cancelled' };
        }
      }
      const milestoneQueuePolicy =
        args.action.waitForQueue ||
        (args.action.waitForBackgroundSaves ? 'all' : 'none');
      const busySeq = guidedMilestoneBusy.lock({
        title: resolveOptionalLocalizedString(
          milestoneProgressDialog?.title,
          languageRef.current,
          tSystem('draft.savingShort', languageRef.current, 'Saving…')
        ),
        message:
          resolveLocalizedString(
            milestoneProgressDialog?.message,
            languageRef.current,
            tSystem(
              'navigation.waitSaving',
              languageRef.current,
              'Do not leave this page while your changes are being saved'
            )
          ) ||
          tSystem(
            'navigation.waitSaving',
            languageRef.current,
            'Do not leave this page while your changes are being saved'
          ),
        kind: 'guidedStepMilestone',
        diagnosticMeta: { stepId: args.stepId, nextStepId: args.nextStepId || null }
      });
      let busyUnlocked = false;
      const existingRecordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      const reportFollowupMilestone = areReportFollowupActions([...preActions, ...effectiveBackgroundActions]);
      let followupLaunchDataSourcePrefetchHoldActive = false;
      const beginFollowupLaunchDataSourcePrefetchHold = () => {
        if (!reportFollowupMilestone || followupLaunchDataSourcePrefetchHoldActive) return;
        followupLaunchDataSourcePrefetchHoldActive = true;
        followupLaunchDataSourcePrefetchHoldRef.current += 1;
        if (guidedDataSourceRefreshTimersRef.current.length) {
          guidedDataSourceRefreshTimersRef.current.forEach(timer => clearTimeout(timer));
          guidedDataSourceRefreshTimersRef.current = [];
        }
        logEvent('dataSource.prefetch.hold.begin.followupLaunch', {
          stepId: args.stepId,
          recordId: existingRecordId || null,
          actions: [...preActions, ...effectiveBackgroundActions]
        });
      };
      const endFollowupLaunchDataSourcePrefetchHold = () => {
        if (!followupLaunchDataSourcePrefetchHoldActive) return;
        followupLaunchDataSourcePrefetchHoldActive = false;
        followupLaunchDataSourcePrefetchHoldRef.current = Math.max(0, followupLaunchDataSourcePrefetchHoldRef.current - 1);
        logEvent('dataSource.prefetch.hold.end.followupLaunch', {
          stepId: args.stepId,
          recordId: existingRecordId || null
        });
      };

      try {
        beginFollowupLaunchDataSourcePrefetchHold();
        const queueWaitPolicyForMilestone =
          closeOnlyPrimarySubmitMilestone && milestoneQueuePolicy === 'all'
            ? 'uploadsOnly'
            : milestoneQueuePolicy;
        if (milestoneQueuePolicy === 'all' && !closeOnlyPrimarySubmitMilestone) {
          const waitResult = await flushAutoSaveBeforeNavigate(reason);
          logEvent('guidedStep.milestone.flush', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            flushed: waitResult
          });
        } else if (milestoneQueuePolicy === 'all' && closeOnlyPrimarySubmitMilestone) {
          if (autoSaveTimerRef.current) {
            globalThis.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          autoSaveQueuedRef.current = false;
          logEvent('guidedStep.milestone.flush.deferredToPrimaryClose', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            waitForQueue: milestoneQueuePolicy
          });
        } else if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
          logEvent('guidedStep.milestone.flush.skipped', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            waitForQueue: milestoneQueuePolicy
          });
        }
        if (queueWaitPolicyForMilestone !== 'none') {
          const queueResult = await waitForBackgroundSaves(reason, queueWaitPolicyForMilestone);
          logEvent('guidedStep.milestone.queueWait', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            waitForQueue: queueWaitPolicyForMilestone,
            configuredWaitForQueue: milestoneQueuePolicy,
            ok: queueResult.ok
          });
          if (!queueResult.ok) {
            const message = (queueResult.message || 'Could not prepare the record.').toString();
            setStatus(message);
            setStatusLevel('error');
            return { success: false, advanceToNext: false, message };
          }
        }

        let recordId = existingRecordId;
        if (!recordId || args.action.ensureRecordId !== false) {
          const ensured = await ensureDraftRecordId({ reason });
          if (!ensured.success || !ensured.recordId) {
            const message = (ensured.message || 'Could not prepare the record.').toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('guidedStep.milestone.ensureRecordId.failed', {
              stepId: args.stepId,
              message
            });
            return { success: false, message };
          }
          recordId = ensured.recordId;
        }

        const runBatch = async (
          actions: string[],
          batchReason: string,
          options?: { sessionId?: number | null }
        ): Promise<{ success: boolean; message?: string; byAction?: Map<string, any> }> => {
          const batchApplicationTarget = () =>
            resolveFollowupResultApplicationTarget({
              settledRecordId: recordId,
              selectedRecordId: selectedRecordIdRef.current,
              selectedSnapshotId: selectedRecordSnapshotRef.current?.id || null,
              currentSessionId: recordSessionRef.current,
              followupSessionId: options?.sessionId ?? null,
              currentView: viewRef.current
            });
          try {
            logEvent('guidedStep.milestone.followup.begin', {
              stepId: args.stepId,
              recordId,
              actions,
              runInBackground: batchReason.endsWith('.background') && args.action.runInBackground === true,
              emailDispatchMode: followupBatchOptions?.emailDispatchMode || null,
              nextStepId: args.nextStepId || null
            });
            const batch = await runSerializedFollowupBatchRequest({
              recordId,
              actions,
              reason: batchReason,
              options: followupBatchOptions
            });
            const batchOutcome = applyFollowupBatchResults({
              recordId,
              actions,
              batch,
              reason: batchReason,
              sessionId: options?.sessionId ?? null
            });
            const { followupErrors } = batchOutcome;
            const followupRefreshMode = areReportFollowupActions(actions)
              ? 'none'
              : (batchReason.endsWith('.background') || batchReason.endsWith('.pre') ? 'sharedDataOnly' : 'snapshot');
            await refreshAfterFollowupBatch({
              recordId,
              reason: batchReason,
              mode: followupRefreshMode
            });
            if (followupErrors.length) {
              const message = followupErrors.join(' · ');
              const target = batchApplicationTarget();
              if (target.applyToActiveRecord) {
                setStatus(message);
                setStatusLevel('error');
              } else {
                logEvent('guidedStep.milestone.followup.detachedError', {
                  stepId: args.stepId,
                  recordId,
                  currentRecordId: target.currentRecordId || null,
                  sessionChanged: target.sessionChanged,
                  message
                });
              }
              return { success: false, message };
            }
            logEvent('guidedStep.milestone.followup.done', {
              stepId: args.stepId,
              recordId,
              actionsCount: actions.length
            });
            return { success: true, byAction: batchOutcome.byAction };
          } catch (err: any) {
            const uiMessage = resolveUiErrorMessage(err, 'Failed to run follow-up actions.');
            const logMessage = resolveLogMessage(err, 'Failed to run follow-up actions.');
            const target = batchApplicationTarget();
            if (uiMessage && target.applyToActiveRecord) {
              setStatus(uiMessage);
              setStatusLevel('error');
            } else if (uiMessage) {
              logEvent('guidedStep.milestone.followup.detachedException', {
                stepId: args.stepId,
                recordId,
                currentRecordId: target.currentRecordId || null,
                sessionChanged: target.sessionChanged,
                message: logMessage
              });
            }
            logEvent('guidedStep.milestone.followup.exception', {
              stepId: args.stepId,
              recordId,
              message: logMessage
            });
            return { success: false, message: uiMessage || logMessage };
          }
        };

        const launchEntireBatchInBackground = args.action.runInBackground === true;
        const allBackgroundActions = [
          ...preActions,
          ...effectiveBackgroundActions
        ].filter(Boolean);
        const navigateAfterSuccess = (target: 'current' | 'form' | 'summary' | 'list' | undefined) => {
          if (!target || target === 'current') return;
          if (target === 'list') {
            navigateToListAfterRecordAction(`${reason}.navigateAfterSuccess`);
            return;
          }
          setView(target);
        };
        const maybeOpenGeneratedRecordsDialog = async (closeResult: any): Promise<boolean> => {
          const dialogConfig = args.action.generatedRecordsDialog;
          if (!dialogConfig) return false;
          const generatedRecords = filterGeneratedRecordsForDialog({
            config: dialogConfig,
            records: getGeneratedRecordsFromFollowupResult(closeResult)
          });
          if (!generatedRecords.length) {
            logEvent('guidedStep.milestone.generatedRecords.skip', {
              stepId: args.stepId,
              targetFormKey: dialogConfig.targetFormKey || null,
              submitEffectIds: Array.isArray(dialogConfig.submitEffectIds) ? dialogConfig.submitEffectIds : []
            });
            return false;
          }
          const itemTemplate =
            resolveLocalizedString(dialogConfig.itemTemplate, languageRef.current, '{{recordId}}') || '{{recordId}}';
          const intro = resolveLocalizedString(dialogConfig.message, languageRef.current, '');
          const lines = generatedRecords.map(record => renderGeneratedRecordLine(record, itemTemplate)).filter(Boolean);
          const message = [intro, ...lines].filter(Boolean).join('\n');
          logEvent('guidedStep.milestone.generatedRecords.open', {
            stepId: args.stepId,
            count: generatedRecords.length,
            targetFormKey: dialogConfig.targetFormKey || null
          });
          await openConfiguredConfirmDialog({
            dialog: {
              title: resolveOptionalLocalizedString(
                dialogConfig.title,
                languageRef.current,
                tSystem('common.notice', languageRef.current, 'Notice')
              ),
              message,
              confirmLabel: resolveLocalizedString(
                dialogConfig.confirmLabel,
                languageRef.current,
                tSystem('common.ok', languageRef.current, 'OK')
              ),
              showCancel: false,
              showCloseButton: false,
              dismissOnBackdrop: false
            },
            kind: 'guidedStepMilestone.generatedRecords',
            refId: args.stepId
          });
          return true;
        };

        const requiresUtilisationSyncDrain = [...normalizedPreActions, ...normalizedBackgroundActions].includes('CLOSE_RECORD');
        const waitForCloseUtilisationSync = async (): Promise<{ ok: boolean; message?: string }> => {
          if (!requiresUtilisationSyncDrain) return { ok: true };
          const utilisationWait = await waitForPendingUtilisationSync({
            recordId,
            reason: `${reason}.utilisationSync`
          });
          if (utilisationWait.ok) return { ok: true };
          return {
            ok: false,
            message: (
              utilisationWait.message ||
              tSystem('bank.utilisationConfirmFailed', languageRef.current, 'Could not confirm utilisation changes.')
            ).toString()
          };
        };

        const runCloseOnlyPrimarySubmitMilestone = async (): Promise<{ success: boolean; advanceToNext?: boolean; message?: string }> => {
          const activeSaveWait = await waitForActiveDraftSaveTransactions(`${reason}.primaryClose`);
          if (!activeSaveWait.ok) {
            const message = (activeSaveWait.message || 'Could not save the latest changes.').toString();
            setStatus(message);
            setStatusLevel('error');
            return { success: false, advanceToNext: false, message };
          }
          if (recordId && pendingFollowupBatchPromisesRef.current.has(recordId)) {
            logEvent('guidedStep.milestone.primaryClose.waitPendingFollowup.start', {
              stepId: args.stepId,
              recordId
            });
            setStatus(
              tSystem(
                'submit.waitPreviousAction',
                languageRef.current,
                'Please wait while we finish the previous action...'
              )
            );
            setStatusLevel('info');
            const followupWait = await waitForPendingFollowupBatch({
              recordId,
              reason: `${reason}.primaryClose.previousAction`
            });
            if (!followupWait.ok) {
              const message = (followupWait.message || submitPreviousActionRetryMessage()).toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('guidedStep.milestone.primaryClose.waitPendingFollowup.failed', {
                stepId: args.stepId,
                recordId,
                message
              });
              return { success: false, advanceToNext: false, message };
            }
            logEvent('guidedStep.milestone.primaryClose.waitPendingFollowup.done', {
              stepId: args.stepId,
              recordId
            });
          }
          const utilisationWait = await waitForCloseUtilisationSync();
          if (!utilisationWait.ok) {
            const message = (utilisationWait.message || 'Could not confirm utilisation changes.').toString();
            setStatus(message);
            setStatusLevel('error');
            return { success: false, advanceToNext: false, message };
          }
          const closeStatus =
            resolveStatusTransitionValue(statusTransitions, 'onClose', languageRef.current, {
              includeDefaultOnClose: true
            }) || 'Closed';
          logEvent('guidedStep.milestone.primaryClose.begin', {
            stepId: args.stepId,
            recordId,
            status: closeStatus
          });
          const closeStartedAt = Date.now();
          const submitResult = await persistCurrentSnapshot({
            reason: `${reason}.primaryClose`,
            mode: 'submit',
            existingRecordId: recordId,
            statusOverride: closeStatus,
            statusOnlyWhenClean: true
          });
          if (!submitResult.success || !submitResult.recordId || !submitResult.response?.success) {
            const message = (
              submitResult.message ||
              submitResult.response?.message ||
              'Could not close the record.'
            ).toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('guidedStep.milestone.primaryClose.failed', {
              stepId: args.stepId,
              recordId: recordId || null,
              message
            });
            return { success: false, advanceToNext: false, message };
          }
          recordId = submitResult.recordId;
          const resMeta = submitResult.response?.meta || {};
          const closeResult = {
            success: true,
            status: resMeta.status || closeStatus,
            submitEffects: resMeta.submitEffects || null
          };
          attachGeneratedSubmitEffectRecordsToActiveDraft(
            getGeneratedRecordsFromFollowupResult(closeResult),
            `${reason}.primaryClose`
          );
          const submitEffectsCreated = Number(resMeta.submitEffects?.created || 0) || 0;
          const submitEffectsUpdated = Number(resMeta.submitEffects?.updated || 0) || 0;
          invalidateClientSharedDataCaches({ includePersistedDataSources: true });
          if (submitEffectsCreated > 0 || submitEffectsUpdated > 0) {
            refreshGuidedDataSourcesInBackground({
              reason: `${reason}.primaryClose.submitEffects`,
              forceRefresh: true,
              retryDelaysMs: [0, 1200, 3500]
            });
          }
          logEvent('guidedStep.milestone.primaryClose.done', {
            stepId: args.stepId,
            recordId,
            durationMs: Date.now() - closeStartedAt,
            submitEffectsCreated,
            submitEffectsUpdated
          });
          guidedMilestoneBusy.unlock(busySeq, {
            stepId: args.stepId,
            launchedBackground: false,
            success: true
          });
          busyUnlocked = true;
          const generatedDialogShown = await maybeOpenGeneratedRecordsDialog(closeResult);
          if (!generatedDialogShown && args.action.feedbackDialog) {
            const feedbackDialog = args.action.feedbackDialog;
            await openConfiguredConfirmDialog({
              dialog: {
                ...feedbackDialog,
                showCancel: feedbackDialog.showCancel ?? false,
                confirmLabel: feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
              },
              kind: 'guidedStepMilestone',
              refId: args.stepId
            });
          }
          navigateAfterSuccess(args.action.navigateToAfterSuccess);
          return {
            success: true,
            advanceToNext: args.action.advanceAfterStart !== false
          };
        };

        if (closeOnlyPrimarySubmitMilestone) {
          return runCloseOnlyPrimarySubmitMilestone();
        }

        const snapshotResult = await persistCurrentSnapshot({
          reason: `${reason}.snapshot`,
          mode: 'draft',
          existingRecordId: recordId,
          force: !reportFollowupMilestone
        });
        if (!snapshotResult.success || !snapshotResult.recordId) {
          const message = (snapshotResult.message || 'Could not save the latest changes.').toString();
          setStatus(message);
          setStatusLevel('error');
          logEvent('guidedStep.milestone.snapshot.failed', {
            stepId: args.stepId,
            recordId: recordId || null,
            message
          });
          return { success: false, message };
        }
        recordId = snapshotResult.recordId;

        const utilisationWait = await waitForCloseUtilisationSync();
        if (!utilisationWait.ok) {
          const message = (utilisationWait.message || 'Could not confirm utilisation changes.').toString();
          setStatus(message);
          setStatusLevel('error');
          return { success: false, advanceToNext: false, message };
        }

        if (launchEntireBatchInBackground && allBackgroundActions.length) {
          const previousStatus =
            ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() || '';
          const optimisticStatus = resolveOptimisticStatusForActions(allBackgroundActions);
          if (optimisticStatus) {
            pendingFollowupStatusByRecordRef.current.set(recordId, optimisticStatus);
            applyLocalRecordStatus({ recordId, status: optimisticStatus });
          }
          const followupSessionId = recordSessionRef.current;
          const backgroundPromise = (async () => {
            const outcome = await runBatch(allBackgroundActions, `${reason}.background`, { sessionId: followupSessionId });
            if (outcome.success) {
              await refreshDetachedRecordSnapshotCache({
                recordId,
                reason: `${reason}.background.settled`
              });
              return {
                success: true,
                recordId,
                stepId: args.stepId,
                sessionId: followupSessionId,
                reason
              };
            }
            if (optimisticStatus) {
              pendingFollowupStatusByRecordRef.current.delete(recordId);
              applyLocalRecordStatus({ recordId, status: previousStatus || null });
            }
            const target = resolveFollowupResultApplicationTarget({
              settledRecordId: recordId,
              selectedRecordId: selectedRecordIdRef.current,
              selectedSnapshotId: selectedRecordSnapshotRef.current?.id || null,
              currentSessionId: recordSessionRef.current,
              followupSessionId,
              currentView: viewRef.current
            });
            if (target.applyToActiveRecord) {
              setRequestedGuidedStepId(args.stepId || null);
            } else {
              logEvent('guidedStep.milestone.failureNavigation.skippedDetached', {
                stepId: args.stepId,
                recordId,
                currentRecordId: target.currentRecordId || null,
                sessionChanged: target.sessionChanged
              });
            }
            return {
              success: false,
              message: outcome.message || '',
              recordId,
              stepId: args.stepId,
              sessionId: followupSessionId,
              reason
            };
          })().finally(() => {
            const pending = pendingFollowupBatchPromisesRef.current.get(recordId);
            let pendingCleared = false;
            if (pending === backgroundPromise) {
              pendingFollowupBatchPromisesRef.current.delete(recordId);
              pendingFollowupStatusByRecordRef.current.delete(recordId);
              pendingCleared = true;
            }
            const currentRecordId =
              resolveExistingRecordId({
                selectedRecordId: selectedRecordIdRef.current,
                selectedRecordSnapshot: selectedRecordSnapshotRef.current,
                lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
              }) || '';
            if (
              shouldScheduleAutoSaveAfterPendingFollowup({
                autoSaveEnabled,
                currentView: viewRef.current,
                currentRecordId,
                settledRecordId: recordId,
                currentSessionId: recordSessionRef.current,
                followupSessionId,
                dirty: autoSaveDirtyRef.current,
                queued: autoSaveQueuedRef.current,
                submitting: submittingRef.current,
                recordStale: Boolean(recordStaleRef.current)
              })
            ) {
              const delayMs = resolveDebouncedAutoSaveDelay({
                debounceMs: autoSaveDebounceMs,
                lastUserInteractionAt: lastUserInteractionRef.current,
                now: Date.now()
              });
              scheduleLatestAutoSave('followup.pending.settled', delayMs);
              logEvent('autosave.queued.followupSettled', {
                recordId,
                delayMs,
                dirty: autoSaveDirtyRef.current,
                queued: autoSaveQueuedRef.current,
                view: viewRef.current
              });
            }
            if (pendingCleared && viewRef.current === 'list') {
              analyticsSnapshotStaleRef.current = true;
              requestHomeAnalyticsRefresh({
                reason: 'followup.pending.settled',
                recordId
              });
            }
            logEvent('followup.pending.settled', {
              stepId: args.stepId,
              recordId,
              nextStepId: args.nextStepId || null
            });
          });
          trackPendingSharedDataMutation({
            recordId,
            stepId: args.stepId,
            reason: `${reason}.background`,
            actions: allBackgroundActions,
            promise: backgroundPromise
          });
          pendingFollowupBatchPromisesRef.current.set(recordId, backgroundPromise);
          logEvent('followup.pending.tracked', {
            stepId: args.stepId,
            recordId,
            nextStepId: args.nextStepId || null
          });
          void backgroundPromise;
          guidedMilestoneBusy.unlock(busySeq, {
            stepId: args.stepId,
            launchedBackground: true
          });
          busyUnlocked = true;
          const feedbackDialog = args.action.feedbackDialog;
          if (feedbackDialog) {
            void openConfiguredConfirmDialog({
              dialog: {
                ...feedbackDialog,
                showCancel: feedbackDialog.showCancel ?? false,
                confirmLabel: feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
              },
              kind: 'guidedStepMilestone',
              refId: args.stepId
            });
          }
          navigateAfterSuccess(args.action.navigateToAfterSuccess);
          return { success: true, advanceToNext: args.action.advanceAfterStart !== false };
        }

        let preOutcomeByAction: Map<string, any> | undefined;
        if (preActions.length) {
          const preOutcome = await runBatch(preActions, `${reason}.pre`, { sessionId: recordSessionRef.current });
          if (!preOutcome.success) {
            return { success: false, advanceToNext: false, message: preOutcome.message };
          }
          preOutcomeByAction = preOutcome.byAction;
        }

        const outcome = effectiveBackgroundActions.length
          ? await runBatch(effectiveBackgroundActions, `${reason}.background`, { sessionId: recordSessionRef.current })
          : { success: true as const, byAction: undefined as Map<string, any> | undefined };
        guidedMilestoneBusy.unlock(busySeq, {
          stepId: args.stepId,
          launchedBackground: false,
          success: outcome.success
        });
        busyUnlocked = true;
        if (outcome.success) {
          const closeActionResult =
            preOutcomeByAction?.get('CLOSE_RECORD') ||
            outcome.byAction?.get('CLOSE_RECORD') ||
            null;
          const generatedDialogShown = await maybeOpenGeneratedRecordsDialog(closeActionResult);
          if (!generatedDialogShown && args.action.feedbackDialog) {
            const feedbackDialog = args.action.feedbackDialog;
            await openConfiguredConfirmDialog({
              dialog: {
                ...feedbackDialog,
                showCancel: feedbackDialog.showCancel ?? false,
                confirmLabel: feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
              },
              kind: 'guidedStepMilestone',
              refId: args.stepId
            });
          }
          navigateAfterSuccess(args.action.navigateToAfterSuccess);
        }
        return {
          success: outcome.success,
          advanceToNext: outcome.success && args.action.advanceAfterStart !== false,
          message: outcome.message
        };
      } finally {
        endFollowupLaunchDataSourcePrefetchHold();
        if (!busyUnlocked) {
          guidedMilestoneBusy.unlock(busySeq, {
            stepId: args.stepId,
            launchedBackground: false
          });
        }
      }
    },
    [
      applyFollowupBatchResults,
      attachGeneratedSubmitEffectRecordsToActiveDraft,
      autoSaveDebounceMs,
      autoSaveEnabled,
      definition,
      ensureDraftRecordId,
      flushAutoSaveBeforeNavigate,
      applyLocalRecordStatus,
      guidedUiState,
      guidedMilestoneBusy,
      logEvent,
      navigateToListAfterRecordAction,
      openConfiguredConfirmDialog,
      persistCurrentSnapshot,
      refreshDetachedRecordSnapshotCache,
      refreshAfterFollowupBatch,
      refreshGuidedDataSourcesInBackground,
      resolveLogMessage,
      requestHomeAnalyticsRefresh,
      runSerializedFollowupBatchRequest,
      scheduleLatestAutoSave,
      statusTransitions,
      submitPreviousActionRetryMessage,
      trackPendingSharedDataMutation,
      resolveUiErrorMessage,
      waitForActiveDraftSaveTransactions,
      waitForPendingFollowupBatch,
      waitForPendingUtilisationSync,
      waitForBackgroundSaves
    ]
  );

  useConfiguredDialogActionRunner({
    runnerRef: configuredDialogActionRunnerRef,
    definition,
    handleGuidedStepMilestone,
    runFormSubmit: requestSubmit,
    logEvent,
    setStatus,
    setStatusLevel
  });

  const uploadFieldUrls = useCallback(
    async (args: {
      scope: 'top' | 'line';
      fieldPath: string;
      questionId?: string;
      groupId?: string;
      rowId?: string;
      fieldId?: string;
      items: Array<string | File>;
      uploadConfig?: any;
      busyTitle?: string;
      busyMessage?: string;
    }): Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> => {
      if (viewRef.current !== 'form') return { success: false, message: 'Not in form view.' };
      if (submittingRef.current) return { success: false, message: tSystem('actions.submitting', languageRef.current, 'Submitting…') };
      if (isClosedRecord) return { success: false, message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') };
      if (recordStaleRef.current) {
        // Block uploads (they require draft saves) until the user refreshes the record.
        return {
          success: false,
          message:
            recordStaleRef.current.message ||
            tSystem(
              'record.stale',
              languageRef.current,
              'This record was updated by another user or automatically by the system. Use Refresh in the header to continue.'
            )
        };
      }

      const target = resolveUploadTransactionTarget(args);
      if (!target) return { success: false, message: 'Invalid upload field.' };

      const sessionAtStart = recordSessionRef.current;
      const queueKey = buildUploadQueueKey({ sessionId: sessionAtStart, fieldPath: args.fieldPath });
      const blockUntilSaved = resolveUploadBlockUntilSaved(args.uploadConfig);
      const run = async (): Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> => {
        // Ensure we don't have a pending debounced draft save that might race with this sequence.
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }

        const ensureSession = (phase: string): boolean => {
          const sessionNow = recordSessionRef.current;
          if (sessionNow === sessionAtStart) return true;
          logEvent('upload.detached.sessionChanged', {
            fieldPath: args.fieldPath,
            phase,
            sessionAtStart,
            sessionNow
          });
          return false;
        };
        const allowUiUpdates = ensureSession('start');
        const uploadFieldInvalidationVersionAtStart = getUploadFieldInvalidationVersion(
          uploadFieldInvalidationVersionsRef.current,
          args.fieldPath
        );

        const isFile = (v: any): v is File => {
          try {
            return typeof File !== 'undefined' && v instanceof File;
          } catch {
            return false;
          }
        };

        const readStateItems = (): { items: Array<string | File>; hasValue: boolean } => {
          try {
            if (args.scope === 'top' && args.questionId) {
              const source = (valuesRef.current as any) || {};
              const hasValue = Object.prototype.hasOwnProperty.call(source, args.questionId);
              const raw = source?.[args.questionId];
              if (Array.isArray(raw)) {
                return {
                  items: raw.filter((it: any) => typeof it === 'string' || isFile(it)),
                  hasValue
                };
              }
              if (typeof raw === 'string' || isFile(raw)) return { items: [raw], hasValue: true };
              return { items: [], hasValue };
            }
            if (args.scope === 'line' && args.groupId && args.rowId && args.fieldId) {
              const rows = (lineItemsRef.current as any)?.[args.groupId] || [];
              const row = Array.isArray(rows) ? rows.find((r: any) => (r?.id || '').toString() === args.rowId) : null;
              const rowValues = (row?.values || {}) as Record<string, unknown>;
              const hasValue = Object.prototype.hasOwnProperty.call(rowValues, args.fieldId);
              const raw = rowValues[args.fieldId];
              if (Array.isArray(raw)) {
                return {
                  items: raw.filter((it: any) => typeof it === 'string' || isFile(it)),
                  hasValue
                };
              }
              if (typeof raw === 'string' || isFile(raw)) return { items: [raw], hasValue: true };
              return { items: [], hasValue };
            }
          } catch {
            // ignore
          }
          return { items: [], hasValue: false };
        };

        const targetItemsAtStart = Array.isArray(args.items) ? args.items : readStateItems().items;
        const fileItemsAtStart = targetItemsAtStart.filter(isFile);
        const existingUrlsAtStart = targetItemsAtStart
          .filter((item): item is string => typeof item === 'string')
          .flatMap(item => splitUploadValue(item));
        const nonTargetFingerprintAtStart = buildUploadNonTargetFingerprint({
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          target
        });
        try {
          const existingRecordIdAtUploadStart =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';
          if (draftSaveRequestInFlightRef.current && !existingRecordIdAtUploadStart) {
            logEvent('upload.transaction.waitDraftSave', { fieldPath: args.fieldPath });
            await waitForDraftSaveRequest(`upload:${args.fieldPath}`);
          } else if (draftSaveRequestInFlightRef.current) {
            logEvent('upload.transaction.queueBehindDraftSave', { fieldPath: args.fieldPath });
          }

          if (
            wasUploadFieldInvalidated({
              versions: uploadFieldInvalidationVersionsRef.current,
              fieldPath: args.fieldPath,
              expectedVersion: uploadFieldInvalidationVersionAtStart
            })
          ) {
            logEvent('upload.transaction.skipped.invalidated', {
              fieldPath: args.fieldPath,
              invalidationVersionAtStart: uploadFieldInvalidationVersionAtStart,
              invalidationVersionCurrent: getUploadFieldInvalidationVersion(
                uploadFieldInvalidationVersionsRef.current,
                args.fieldPath
              )
            });
            return { success: true, items: targetItemsAtStart.filter((item): item is string => typeof item === 'string') };
          }

          const existingRecordId =
            existingRecordIdAtUploadStart ||
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) ||
            '';
          const statusRaw =
            ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
            '';
          const statusForSave = resolveAutoSaveStatus(statusRaw);
          const buildLatestUploadPayloadForDispatch = async (): Promise<any> => {
            const latestTargetState = readStateItems();
            const latestTargetItems = latestTargetState.hasValue ? latestTargetState.items : targetItemsAtStart;
            const uploadDraftState = applyUploadValueToFormState({
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              target,
              value: '',
              items: latestTargetItems.length ? latestTargetItems : targetItemsAtStart
            });
            let nextPayload = await buildUploadDraftPayload({
              definition,
              formKey,
              language: languageRef.current,
              values: uploadDraftState.values,
              lineItems: uploadDraftState.lineItems,
              existingRecordId,
              target
            });
            nextPayload.__ckSaveMode = 'draft';
            markNoopIfUnchanged(nextPayload);
            nextPayload.__ckStatus = statusForSave;
            nextPayload.__ckCreateFlow = createFlowRef.current ? '1' : '';
            nextPayload.__ckReturnUploadValues = true;
            const dispatchBaseVersion = recordDataVersionRef.current;
            if (existingRecordId && Number.isFinite(Number(dispatchBaseVersion)) && Number(dispatchBaseVersion) > 0) {
              nextPayload.__ckClientDataVersion = Number(dispatchBaseVersion);
            }
            nextPayload = attachPendingGuidedUtilisationDraftSyncToPayload(nextPayload, `upload:${args.fieldPath}`);
            logEvent('upload.transaction.payloadBuiltForDispatch', {
              fieldPath: args.fieldPath,
              recordId: existingRecordId || null,
              hasMutationPlan: Boolean(nextPayload.__ckMutationPlan?.utilisationPlan),
              clientDataVersion: Number(nextPayload.__ckClientDataVersion || 0) || null
            });
            return nextPayload;
          };

          logEvent('upload.transaction.start', {
            fieldPath: args.fieldPath,
            fileCount: fileItemsAtStart.length,
            blockUntilSaved
          });

          let response: any;
          let payload: any = null;
          for (let attemptIndex = 0; attemptIndex < DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length; attemptIndex += 1) {
            const delayMs = DRAFT_SNAPSHOT_RETRY_DELAYS_MS[attemptIndex];
            if (delayMs > 0) {
              await new Promise<void>(resolve => globalThis.setTimeout(resolve, delayMs));
            }
            try {
              setDraftSave({ phase: 'saving' });
              response = await runDraftSaveRequest(`upload:${args.fieldPath}`, async () => {
                payload = await buildLatestUploadPayloadForDispatch();
                return submitCurrentRecordMutation(`upload:${args.fieldPath}`, payload);
              });
            } catch (err: any) {
              const message =
                resolveUiErrorMessage(err, 'Failed to save uploaded photos.') ||
                resolveLogMessage(err, 'Failed to save uploaded photos.');
              if (isRetryableRecordBusyMessage(message) && attemptIndex < DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length - 1) {
                logEvent('upload.transaction.retryableBusy.retryScheduled', {
                  fieldPath: args.fieldPath,
                  attempt: attemptIndex + 1,
                  attempts: DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length,
                  delayMs: DRAFT_SNAPSHOT_RETRY_DELAYS_MS[attemptIndex + 1],
                  message
                });
                continue;
              }
              throw err;
            }
            const retryableFailure = !response?.success && isRetryableRecordBusyMessage(response?.message);
            if (retryableFailure && attemptIndex < DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length - 1) {
              logEvent('upload.transaction.retryableBusy.retryScheduled', {
                fieldPath: args.fieldPath,
                attempt: attemptIndex + 1,
                attempts: DRAFT_SNAPSHOT_RETRY_DELAYS_MS.length,
                delayMs: DRAFT_SNAPSHOT_RETRY_DELAYS_MS[attemptIndex + 1],
                message: (response?.message || '').toString()
              });
              continue;
            }
            break;
          }

          const ok = Boolean(response?.success);
          const responseMessage = (response?.message || '').toString();
          if (!ok) {
            if (isSubmissionStaleMessage(responseMessage)) {
              const serverVersionRaw = Number((response as any)?.meta?.dataVersion);
              const cachedVersion =
                resolveCurrentClientDataVersion((payload as any)?.__ckClientDataVersion) ||
                resolveCurrentClientDataVersion(recordDataVersionRef.current);
              await synchronizeStaleRecord({
                reason: 'upload.transaction.rejected.stale',
                recordId: existingRecordId || selectedRecordIdRef.current || '',
                cachedVersion: Number.isFinite(Number(cachedVersion)) ? Number(cachedVersion) : null,
                serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
                serverRow: null
              });
            }
            logEvent('upload.transaction.error', {
              fieldPath: args.fieldPath,
              message: responseMessage || 'failed'
            });
            return {
              success: false,
              message: responseMessage || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
            };
          }
          markGuidedUtilisationDraftSyncSettledFromPayload(payload, response, `upload:${args.fieldPath}`);

          const recordId = (((response as any)?.meta?.id) || existingRecordId || '').toString().trim();
          const savedUploadValue =
            extractUploadValueFromMeta((response as any)?.meta?.uploadValues || null, target) ??
            existingUrlsAtStart.join(', ');
          const savedUrls = splitUploadValue(savedUploadValue);
          const existingUrlSet = new Set(existingUrlsAtStart);
          const uploadedUrls = savedUrls.filter(url => !existingUrlSet.has(url)).slice(0, fileItemsAtStart.length);
          const completionState = readStateItems();
          const mergedItems = fileItemsAtStart.length
            ? (mergeUploadedFieldItems({
                currentItems: completionState.items,
                hasCurrentValue: completionState.hasValue,
                fallbackItems: targetItemsAtStart,
                uploadedFiles: fileItemsAtStart,
                uploadedUrls
              }) as Array<string | File>)
            : (mergeSavedUploadUrlItems({
                currentItems: completionState.items,
                hasCurrentValue: completionState.hasValue,
                fallbackItems: targetItemsAtStart,
                previousUrls: existingUrlsAtStart,
                savedUrls
              }) as Array<string | File>);
          const nextState = applyUploadValueToFormState({
            values: valuesRef.current,
            lineItems: lineItemsRef.current,
            target,
            value: savedUploadValue,
            items: mergedItems
          });

          const allowUiAfterUpload = ensureSession('afterSave') && allowUiUpdates;
          valuesRef.current = nextState.values;
          lineItemsRef.current = nextState.lineItems;
          uploadedFieldValueOverridesRef.current.delete(args.fieldPath);

          if (allowUiAfterUpload) {
            setValues(nextState.values);
            setLineItems(nextState.lineItems);
          }

          const payloadValues = applyUploadValueToPayloadValues({
            payloadValues: (((payload as any).values || {}) as Record<string, any>) || {},
            target,
            value: savedUploadValue
          });
          const completedUploadPayload = { ...payload, values: payloadValues };
          applySuccessfulSubmissionState({
            recordId,
            payload: completedUploadPayload,
            response,
            statusFallback: statusForSave
          });

          const nonTargetFingerprintNow = buildUploadNonTargetFingerprint({
            values: nextState.values,
            lineItems: nextState.lineItems,
            target
          });
          const completedUploadFingerprint = buildCompletedDraftSaveFingerprint(completedUploadPayload, recordId);
          if (completedUploadFingerprint) {
            lastCompletedDraftSaveFingerprintRef.current = completedUploadFingerprint;
            logEvent('upload.transaction.completedFingerprint', {
              fieldPath: args.fieldPath,
              recordId: completedUploadFingerprint.recordId
            });
          }
          const currentUploadStatePayload = buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: nextState.values,
            lineItems: nextState.lineItems,
            existingRecordId: recordId
          }) as any;
          currentUploadStatePayload.__ckSaveMode = 'draft';
          markNoopIfUnchanged(currentUploadStatePayload);
          currentUploadStatePayload.__ckStatus = statusForSave;
          currentUploadStatePayload.__ckCreateFlow = createFlowRef.current ? '1' : '';
          const currentUploadStateFingerprint = buildCompletedDraftSaveFingerprint(currentUploadStatePayload, recordId);
          const uploadSavedCurrentDraft = uploadCompletionMatchesCurrentDraft({
            completedDraftFingerprint: completedUploadFingerprint,
            currentDraftFingerprint: currentUploadStateFingerprint
          });
          if (uploadSavedCurrentDraft || nonTargetFingerprintNow === nonTargetFingerprintAtStart) {
            autoSaveDirtyRef.current = false;
            autoSaveQueuedRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            rememberAutoSaveSeenState(nextState.values, nextState.lineItems);
            markPostPersistAutoSaveSuppress(lastLocalRecordMutationAtRef.current || 0);
          }
          setDraftSave({
            phase: 'saved',
            updatedAt: ((response?.meta?.updatedAt || '') as string).toString() || undefined
          });
          logEvent('upload.transaction.success', {
            fieldPath: args.fieldPath,
            recordId,
            urls: savedUrls.length,
            preservedPendingLocalFiles: mergedItems.some(item => typeof item !== 'string'),
            otherChangesDuringUpload: nonTargetFingerprintNow !== nonTargetFingerprintAtStart,
            savedCurrentDraft: uploadSavedCurrentDraft
          });
          clearSaveFailureStatusAfterSuccessfulSave('upload.transaction');
          return { success: true, items: savedUrls, value: savedUploadValue };
        } catch (err: any) {
          const uiMessage = resolveUiErrorMessage(
            err,
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          );
          const logMessage = resolveLogMessage(
            err,
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          );
          logEvent('upload.transaction.exception', { fieldPath: args.fieldPath, message: logMessage });
          return { success: false, message: uiMessage || '' };
        }
      };

      const prev = uploadQueueRef.current.get(queueKey) || Promise.resolve({ success: true } as any);
      const next = prev
        .catch(() => ({ success: false } as any))
        .then(() => run());
      uploadQueueRef.current.set(queueKey, next);
      uploadQueueBlockingRef.current.set(queueKey, blockUntilSaved);
      if (blockUntilSaved) {
        if (args.busyTitle !== undefined) {
          uploadQueueBusyTitleRef.current.set(queueKey, (args.busyTitle ?? '').toString().trim());
        } else {
          uploadQueueBusyTitleRef.current.delete(queueKey);
        }
        const busyMessage = (args.busyMessage || '').toString().trim();
        if (busyMessage) uploadQueueBusyMessageRef.current.set(queueKey, busyMessage);
        else uploadQueueBusyMessageRef.current.delete(queueKey);
      } else {
        uploadQueueBusyTitleRef.current.delete(queueKey);
        uploadQueueBusyMessageRef.current.delete(queueKey);
      }
      syncUploadQueueSize();
      void next.finally(() => {
        try {
          if (uploadQueueRef.current.get(queueKey) === next) {
            uploadQueueRef.current.delete(queueKey);
            uploadQueueBlockingRef.current.delete(queueKey);
            uploadQueueBusyTitleRef.current.delete(queueKey);
            uploadQueueBusyMessageRef.current.delete(queueKey);
          }
          syncUploadQueueSize();
          // If uploads drained and autosave was queued during the upload, schedule a background autosave now.
          if (
            shouldAutosaveAfterUploadQueueDrained({
              uploadQueueSize: uploadQueueRef.current.size,
              autoSaveQueued: autoSaveQueuedRef.current,
              autoSaveDirty: autoSaveDirtyRef.current,
              submitting: submittingRef.current
            })
          ) {
            logEvent('autosave.queued.uploadDrained', {
              debounceMs: autoSaveDebounceMs,
              draftSaveInFlight: draftSaveRequestInFlightRef.current
            });
            void performAutoSaveRef.current('upload.queue.drained');
          }
        } catch {
          // ignore
        }
      });
      return next;
    },
    [
      applySuccessfulSubmissionState,
      attachPendingGuidedUtilisationDraftSyncToPayload,
      autoSaveDebounceMs,
      clearSaveFailureStatusAfterSuccessfulSave,
      definition,
      formKey,
      isRetryableRecordBusyMessage,
      isClosedRecord,
      language,
      logEvent,
      markGuidedUtilisationDraftSyncSettledFromPayload,
      markPostPersistAutoSaveSuppress,
      rememberAutoSaveSeenState,
      resolveLogMessage,
      resolveAutoSaveStatus,
      resolveUiErrorMessage,
      runDraftSaveRequest,
      submitCurrentRecordMutation,
      synchronizeStaleRecord,
      syncUploadQueueSize,
      waitForDraftSaveRequest
    ]
  );

  useEffect(() => {
    // Avoid autosaving due to initial bootstrap hydration.
    autoSaveDirtyRef.current = false;
    fieldChangeDateInitialEntryInProgressRef.current = {};
    fieldChangeDateInitialEntryCompletedRef.current = {};
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    if (record?.values) {
      const normalizedValues = normalizeRecordValues(definition, record.values);
      const initialLineItems = buildInitialLineItems(definition, normalizedValues);
      const { values: mappedValues, lineItems: mappedLineItems } = applyValueMapsToForm(
        definition,
        normalizedValues,
        initialLineItems
      );
      rememberAutoSaveSeenState(mappedValues, mappedLineItems);
      dedupBaselineSignatureRef.current = computeDedupSignatureFromValues(dedupPrecheckRules, mappedValues as any);
      dedupKeyFingerprintBaselineRef.current = computeDedupKeyFingerprint((definition as any)?.dedupRules, mappedValues as any);
      setValues(mappedValues);
      setLineItems(mappedLineItems);
    } else {
      dedupBaselineSignatureRef.current = '';
      dedupKeyFingerprintBaselineRef.current = '';
      dedupDeleteOnKeyChangeInFlightRef.current = false;
    }
    if (record?.id) {
      setSelectedRecordId(record.id);
    }
    if (record) {
      optimisticClientDataVersionRef.current =
        record && Number.isFinite(Number((record as any).dataVersion)) ? Number((record as any).dataVersion) : null;
      lastRecordServerActivityAtRef.current = record.id ? Date.now() : 0;
      setLastSubmissionMeta({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        dataVersion: (record as any).dataVersion,
        status: record.status || null
      });
      setSelectedRecordSnapshot(record);
    } else {
      lastRecordServerActivityAtRef.current = 0;
    }
  }, [dedupPrecheckRules, definition, record, rememberAutoSaveSeenState]);

  useEffect(() => {
    if (view !== 'summary') return;
    preloadSummaryTooltips();
  }, [view, preloadSummaryTooltips]);

  useEffect(() => {
    if (!selectedRecordId || selectedRecordSnapshot) return;
    const cached = listCache.records[selectedRecordId];
    if (cached) {
      setSelectedRecordSnapshot(cached);
    }
  }, [selectedRecordId, selectedRecordSnapshot, listCache.records]);

  const { ensureOptions, runSelectionEffects } = useAppSelectionEffects({
    definition,
    language,
    formRecordMeta,
    optionState,
    valuesRef,
    lineItemsRef,
    fieldChangePendingRef,
    selectionEffectAsyncPendingCountRef,
    selectionEffectInitAutoSaveSuppressStartedAtRef,
    selectionEffectInitAutoSaveSuppressUntilRef,
    selectionEffectInitAutoSaveHadDirtyAtStartRef,
    autoSaveDirtyRef,
    autoSaveQueuedRef,
    autoSaveInFlightRef,
    draftSaveRequestInFlightRef,
    setValues,
    setLineItems,
    setOptionState,
    setTooltipState,
    setExternalScrollAnchor,
    setSelectionEffectAsyncPendingCount,
    logEvent
  });

  async function handleSubmit(submitUi?: {
    collapsedRows: Record<string, boolean>;
    collapsedSubgroups: Record<string, boolean>;
    validationDefinition?: WebFormDefinition;
    validationVirtualState?: GuidedStepsVirtualState | null;
  }) {
    if (submitPipelineInFlightRef.current) {
      logEvent('submit.blocked.inFlightGuard');
      return;
    }
    let submitPipelineStartMark: string | null = null;
    const submitRequestedFromSummary = summarySubmitIntentRef.current === true;
    if (isClosedRecord) {
      setStatus(tSystem('app.closedReadOnly', language, 'Closed (read-only)'));
      setStatusLevel('info');
      logEvent('submit.blocked.closed');
      return;
    }
    const submitStepsMode = ((definition as any)?.steps?.mode || '').toString();
    let submitPreparationBusySeq: number | null = null;
    const resolveSubmitPreparationMessage = (key: 'navigation.waitPhotos' | 'navigation.waitSaving'): string => {
      if (key === 'navigation.waitPhotos') {
        return tSystem(
          'navigation.waitPhotos',
          languageRef.current,
          'Please wait while your files finish uploading.'
        );
      }
      return tSystem(
        'navigation.waitSaving',
        languageRef.current,
        'Do not leave this page while your changes are being saved'
      );
    };
    const lockSubmitPreparationIfNeeded = (args: {
      waitForQueue?: SubmitWaitQueuePolicy | string | null;
      reason: string;
      recordSyncInFlight?: boolean;
    }): void => {
      const snapshot = {
        stepsMode: submitStepsMode,
        waitForQueue: args.waitForQueue,
        autoSaveInFlight: autoSaveInFlightRef.current,
        draftSaveInFlight: draftSaveRequestInFlightRef.current,
        uploadsInFlight: uploadQueueRef.current.size,
        recordSyncInFlight: args.recordSyncInFlight
      };
      if (!shouldShowSubmitPreparationOverlay(snapshot)) return;
      const messageKey = resolveSubmitPreparationMessageKey(snapshot);
      const title =
        messageKey === 'navigation.waitSaving'
          ? tSystemOptional('navigation.waitSavingTitle', languageRef.current, '')
          : tSystemOptional('navigation.waitTitle', languageRef.current, 'Please wait');
      const message = resolveSubmitPreparationMessage(messageKey);
      if (submitPreparationBusySeq !== null) {
        submitPreparationBusy.setTitle(submitPreparationBusySeq, title);
        submitPreparationBusy.setMessage(submitPreparationBusySeq, message);
        return;
      }
      submitPreparationBusySeq = submitPreparationBusy.lock({
        title,
        message,
        kind: 'submitPreparation',
        diagnosticMeta: {
          reason: args.reason,
          waitForQueue: args.waitForQueue || null,
          autoSaveInFlight: snapshot.autoSaveInFlight,
          draftSaveInFlight: snapshot.draftSaveInFlight,
          uploadsInFlight: snapshot.uploadsInFlight,
          recordSyncInFlight: snapshot.recordSyncInFlight || false
        }
      });
    };
    const unlockSubmitPreparation = (): void => {
      if (submitPreparationBusySeq === null) return;
      submitPreparationBusy.unlock(submitPreparationBusySeq);
      submitPreparationBusySeq = null;
    };
    if (recordSyncPromiseRef.current) {
      lockSubmitPreparationIfNeeded({ reason: 'submit.recordSync', recordSyncInFlight: true });
      try {
        await recordSyncPromiseRef.current;
      } finally {
        unlockSubmitPreparation();
      }
      if (recordStaleRef.current) {
        logEvent('submit.blocked.recordStale.afterSync', { recordId: recordStaleRef.current.recordId });
        return;
      }
    }
    // If we already know the record is stale, block immediately (no validations).
    if (recordStaleRef.current) {
      logEvent('submit.blocked.recordStale', { recordId: recordStaleRef.current.recordId });
      return;
    }
    clearStatus();
    const submitQueuePolicy =
      definition.submissionAfterSubmit?.waitForQueue ||
      'all';
    lockSubmitPreparationIfNeeded({ reason: 'submit.backgroundQueue', waitForQueue: submitQueuePolicy });
    let waitRes: { ok: boolean; message?: string };
    try {
      waitRes = await waitForBackgroundSaves('submit', submitQueuePolicy);
    } finally {
      unlockSubmitPreparation();
    }
    if (!waitRes.ok) {
      const msg = (waitRes.message || tSystem('actions.submitFailed', language, 'Submit failed')).toString();
      setStatus(msg);
      setStatusLevel('error');
      logEvent('submit.blocked.backgroundQueue', {
        message: msg,
        phase: 'preValidation',
        waitForQueue: submitQueuePolicy
      });
      return;
    }
    setValidationAttempted(true);
    setValidationNoticeHidden(false);
    logEvent('submit.validate.begin', { language, lineItemGroups: Object.keys(lineItems).length });

    // Kick off a server version precheck in parallel (best-effort), even if local validations fail.
    // This avoids wasting time fixing validation errors on a record that must be refreshed anyway.
    if (!submitConfirmedRef.current) {
      const precheckRecordId =
        resolveExistingRecordId({
          selectedRecordId,
          selectedRecordSnapshot,
          lastSubmissionMetaId: lastSubmissionMeta?.id || null
        }) || '';
      const baseVersion = recordDataVersionRef.current;
      const rowNumberHint = recordRowNumberRef.current;
      const canCheck = precheckRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0;
      if (canCheck && !submitPrecheckInFlightRef.current) {
        if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
          logEvent('submit.versionPrecheck.skipped', {
            recordId: precheckRecordId,
            reason: autoSaveInFlightRef.current ? 'autosaveInFlight' : 'uploadInFlight'
          });
        } else {
          submitPrecheckInFlightRef.current = true;
          const startedAt = Date.now();
          logEvent('submit.versionPrecheck.start', {
            recordId: precheckRecordId,
            cachedVersion: Number(baseVersion),
            rowNumberHint: rowNumberHint || null
          });
          void getRecordVersionApi(formKey, precheckRecordId, rowNumberHint)
            .then(v => {
              try {
                if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
                  logEvent('submit.versionPrecheck.ignored', {
                    recordId: precheckRecordId,
                    reason: autoSaveInFlightRef.current ? 'autosaveInFlight.afterFetch' : 'uploadInFlight.afterFetch'
                  });
                  return;
                }
                if (!v?.success) {
                  logEvent('submit.versionPrecheck.error', { recordId: precheckRecordId, message: v?.message || 'failed' });
                  return;
                }
                const serverVersion = Number(v.dataVersion);
                const serverRow = Number.isFinite(Number(v.rowNumber)) ? Number(v.rowNumber) : null;
                if (serverRow && serverRow >= 2) recordRowNumberRef.current = serverRow;
                markRecordFreshnessServerTouch({ reason: 'record.submitPrecheck', recordId: precheckRecordId });
                const localVersionNow = Number(recordDataVersionRef.current);
                const baselineVersion =
                  Number.isFinite(localVersionNow) && localVersionNow > 0 ? localVersionNow : Number(baseVersion);
                if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== baselineVersion) {
                  void synchronizeStaleRecord({
                    reason: 'submit.precheck.stale',
                    recordId: precheckRecordId,
                    cachedVersion: baselineVersion,
                    serverVersion,
                    serverRow
                  });
                  return;
                }
                logEvent('submit.versionPrecheck.ok', {
                  recordId: precheckRecordId,
                  serverVersion: Number.isFinite(serverVersion) ? serverVersion : null
                });
              } catch (err: any) {
                logEvent('submit.versionPrecheck.handlerException', { recordId: precheckRecordId, message: err?.message || err });
              }
            })
            .catch(err => {
              const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'failed';
              logEvent('submit.versionPrecheck.exception', { recordId: precheckRecordId, message: msg });
            })
            .finally(() => {
              submitPrecheckInFlightRef.current = false;
              logEvent('submit.versionPrecheck.end', { recordId: precheckRecordId, durationMs: Date.now() - startedAt });
            });
        }
      }
    }

    const validationDefinition = submitUi?.validationDefinition || definition;
    const validationVirtualState = submitUi?.validationVirtualState || null;

    try {
      setValidationWarnings(
        collectValidationWarnings({
          definition: validationDefinition,
          language,
          values,
          lineItems,
          phase: 'submit',
          uiView: 'edit'
        })
      );
    } catch (err: any) {
      // Never block submission because of warning computation bugs.
      setValidationWarnings({ top: [], byField: {} });
      logEvent('submit.warnings.failed', { message: err?.message || err || 'unknown' });
    }
    const nextErrors = validateForm({
      definition: validationDefinition,
      language,
      values,
      lineItems,
      collapsedRows: submitUi?.collapsedRows,
      collapsedSubgroups: submitUi?.collapsedSubgroups,
      virtualState: validationVirtualState
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      submitConfirmedRef.current = false;
      logEvent('submit.validate.failed', {
        errorCount: Object.keys(nextErrors).length,
        firstErrorKeys: Object.keys(nextErrors).slice(0, 5),
        scopedValidation: validationDefinition !== definition
      });
      if (submitRequestedFromSummary && viewRef.current === 'summary') {
        summarySubmitIntentRef.current = false;
        setView('form');
        logEvent('summary.submit.validationFailedNavigateForm', {
          errorCount: Object.keys(nextErrors).length
        });
      }
      return;
    }

    // Dedup precheck: block submit early once all dedup keys are populated.
    if (dedupSignature) {
      if (dedupChecking) {
        submitConfirmedRef.current = false;
        logEvent('submit.blocked.dedup.checking');
        return;
      }
      const conflict = dedupConflict;
      if (isBlockingDedupConflict(conflict)) {
        const msg = conflict.message.toString();
        setStatus(msg);
        setStatusLevel('error');
        submitConfirmedRef.current = false;
        logEvent('submit.blocked.dedup.conflict', {
          ruleId: conflict.ruleId,
          existingRecordId: conflict.existingRecordId || null
        });
        return;
      }
    }

    // Only show the submit confirmation overlay once the form is already valid.
    if (!submitConfirmedRef.current) {
      setSubmitConfirmOpen(true);
      logEvent('ui.submitConfirm.openAfterValidation', {
        configuredMessage: Boolean(submitConfirmationDialogConfig?.message),
        submitLabelOverridden: Boolean(finalSubmitButtonLabelConfig),
        confirmLabelOverridden: Boolean(submitConfirmationDialogConfig?.confirmLabel),
        cancelLabelOverridden: Boolean(submitConfirmationDialogConfig?.cancelLabel),
        hasConditionalCases: Boolean(definition.submissionAfterSubmit?.confirmationDialogCases?.length)
      });
      return;
    }
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = false;
    if (recordSyncPromiseRef.current) {
      await recordSyncPromiseRef.current;
      const syncedStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (syncedStaleInfo) {
        logEvent('submit.blocked.recordStale.beforePipeline', { recordId: syncedStaleInfo.recordId });
        return;
      }
    }
    if (submitPipelineInFlightRef.current) {
      logEvent('submit.blocked.inFlightGuard');
      return;
    }
    submitPipelineInFlightRef.current = true;
    submitPipelineStartMark = `ck.submit.pipeline.start.${Date.now()}`;
    perfMark(submitPipelineStartMark);

    setSubmitting(true);
    // Keep ref in sync immediately so background work (autosave/uploads) can't start in the same tick.
    submittingRef.current = true;
    const submitRecordId =
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '';
    const submitBlockingMessage =
      resolveDialogTemplate(
        submitProgressDialogConfig?.message,
        tSystem('actions.submitting', languageRef.current, 'Submitting…')
      ) || tSystem('actions.submitting', languageRef.current, 'Submitting…');
    if (submitRecordId && pendingFollowupBatchPromisesRef.current.has(submitRecordId)) {
      setStatus(
        submitProgressDialogConfig?.message
          ? submitBlockingMessage
          : tSystem(
              'submit.waitPreviousAction',
              languageRef.current,
              'Please wait while we finish the previous action...'
            )
      );
      setStatusLevel('info');
      const followupWait = await waitForPendingFollowupBatch({
        recordId: submitRecordId,
        reason: 'submit.previousAction'
      });
      if (!followupWait.ok) {
        const message = (followupWait.message || submitPreviousActionRetryMessage()).toString();
        setStatus(message);
        setStatusLevel('error');
        logEvent('submit.blocked.pendingFollowup', {
          recordId: submitRecordId,
          message
        });
        return;
      }
    }
    setStatus(submitBlockingMessage);
    setStatusLevel('info');
    logEvent('submit.begin', {
      language,
      lineItemGroups: Object.keys(lineItems).length,
      recordId: submitRecordId || null,
      progressDialogTitle: resolveOptionalLocalizedString(submitProgressDialogConfig?.title, languageRef.current, '') || null
    });
    // Ensure submission messages are immediately visible, even if the user is scrolled deep in the form.
    try {
      if (typeof globalThis.scrollTo === 'function') {
        globalThis.scrollTo(0, 0);
        logEvent('submit.scrollTopOnStart');
      }
    } catch {
      // ignore
    }
    try {
      let existingRecordId = resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      });
      const submitDedupSignature = computeDedupSignatureFromValues((definition as any)?.dedupRules, valuesRef.current as any);
      const submitDedupFingerprint = dedupDeleteOnKeyChangeEnabled
        ? computeDedupKeyFingerprint((definition as any)?.dedupRules, valuesRef.current as any)
        : '';
      const submitDedupBaselineFingerprint = (dedupKeyFingerprintBaselineRef.current || '').toString();
      const dedupKeysChangedForExistingRecord =
        dedupDeleteOnKeyChangeEnabled &&
        !createFlowRef.current &&
        !!existingRecordId &&
        !!submitDedupBaselineFingerprint &&
        submitDedupBaselineFingerprint !== submitDedupFingerprint &&
        !!submitDedupSignature;
      if (dedupKeysChangedForExistingRecord) {
        const deleted = await triggerDedupDeleteOnKeyChange('submit.detectKeyChange', {
          recordId: existingRecordId || null
        });
        if (!deleted) {
          const msg = tSystem('actions.submitFailed', languageRef.current, 'Submit failed');
          setStatus(msg);
          setStatusLevel('error');
          logEvent('submit.blocked.dedupDeleteOnKeyChange.deleteFailed', { recordId: existingRecordId || null });
          return;
        }
        existingRecordId = resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        });
      }
      const configuredAfterSubmit = definition.submissionAfterSubmit;
      const configuredPreActions = Array.isArray(configuredAfterSubmit?.preActions)
        ? configuredAfterSubmit.preActions.map(entry => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const configuredBackgroundActions = Array.isArray(configuredAfterSubmit?.backgroundActions)
        ? configuredAfterSubmit.backgroundActions.map(entry => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const closeOnlyPreActions =
        configuredPreActions.length === 1 &&
        configuredPreActions[0].toString().trim().toUpperCase() === 'CLOSE_RECORD';
      const submitBaseVersion = recordDataVersionRef.current;
      const closeStatusForPrimarySubmit = closeOnlyPreActions
        ? (resolveStatusTransitionValue((definition as any)?.followup?.statusTransitions, 'onClose', languageRef.current, {
            includeDefaultOnClose: true
          }) || 'Closed')
        : '';
      const submitRpcStartMark = `ck.submit.rpc.start.${Date.now()}`;
      const submitRpcEndMark = `ck.submit.rpc.end.${Date.now()}`;
      perfMark(submitRpcStartMark);
      const submitResult = await persistCurrentSnapshot({
        reason: 'submit',
        mode: 'submit',
        existingRecordId,
        statusOverride: closeStatusForPrimarySubmit || undefined,
        collapsedRows: submitUi?.collapsedRows,
        collapsedSubgroups: submitUi?.collapsedSubgroups,
        statusOnlyWhenClean: closeOnlyPreActions
      });
      perfMark(submitRpcEndMark);
      perfMeasure('ck.submit.rpc', submitRpcStartMark, submitRpcEndMark, {
        formKey,
        recordId: existingRecordId || null
      });
      const res = submitResult.response;
      if (!res) {
        logEvent('submit.emptyResponse', { formKey, existingRecordId: existingRecordId || null });
      }
      const ok = Boolean(submitResult.success && res?.success);
      const message = (submitResult.message || res?.message || (ok ? 'Submitted' : 'Submit failed')).toString();
      if (!ok) {
        const isStale = isSubmissionStaleMessage(message);
        if (isStale) {
          const serverVersionRaw = Number((res as any)?.meta?.dataVersion);
          await synchronizeStaleRecord({
            reason: 'submit.rejected.stale',
            recordId: existingRecordId || selectedRecordId || '',
            cachedVersion: Number.isFinite(Number(submitBaseVersion)) ? Number(submitBaseVersion) : null,
            serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
            serverRow: null
          });
          logEvent('submit.error.staleRecovered', { message, meta: (res as any)?.meta || null });
          return;
        }
        const retryMessage = isRetryableRecordBusyMessage(message) ? submitPreviousActionRetryMessage() : message;
        setStatus(retryMessage);
        setStatusLevel('error');
        logEvent('submit.error', { message, shownMessage: retryMessage, meta: (res as any)?.meta || null });
        return;
      }
      setStatus(message);
      setStatusLevel('success');
      logEvent('submit.success', { recordId: (res as any)?.meta?.id });

      const recordId = ((submitResult.recordId || (res as any)?.meta?.id || existingRecordId || selectedRecordId || '') as string).toString();
      dedupBaselineSignatureRef.current = (submitDedupSignature || '').toString();
      dedupKeyFingerprintBaselineRef.current = submitDedupFingerprint;

      const runFollowupBatchForSubmit = async (args: {
        actions: string[];
        reason: string;
        refresh: boolean;
        sessionId?: number | null;
      }) => {
        const followupRpcStartMark = `ck.submit.followup.rpc.start.${Date.now()}`;
        const followupRpcEndMark = `ck.submit.followup.rpc.end.${Date.now()}`;
        perfMark(followupRpcStartMark);
        const batch = await runSerializedFollowupBatchRequest({
          recordId,
          actions: args.actions,
          reason: args.reason
        });
        perfMark(followupRpcEndMark);
        perfMeasure('ck.submit.followup.rpc', followupRpcStartMark, followupRpcEndMark, {
          formKey,
          recordId,
          actionsCount: args.actions.length
        });
        const outcome = applyFollowupBatchResults({
          recordId,
          actions: args.actions,
          batch,
          reason: args.reason,
          sessionId: args.sessionId ?? null
        });
        if (args.refresh) {
          await refreshAfterFollowupBatch({ recordId, reason: args.reason });
        }
        return outcome;
      };
      const maybeOpenSubmitGeneratedRecordsDialog = async (closeResult: any): Promise<boolean> => {
        const dialogConfig = configuredAfterSubmit?.generatedRecordsDialog;
        if (!dialogConfig) return false;
        const generatedRecords = filterGeneratedRecordsForDialog({
          config: dialogConfig,
          records: getGeneratedRecordsFromFollowupResult(closeResult)
        });
        if (!generatedRecords.length) {
          logEvent('submit.afterSubmit.generatedRecords.skip', {
            recordId,
            targetFormKey: dialogConfig.targetFormKey || null,
            submitEffectIds: Array.isArray(dialogConfig.submitEffectIds) ? dialogConfig.submitEffectIds : []
          });
          return false;
        }
        const itemTemplate =
          resolveLocalizedString(dialogConfig.itemTemplate, languageRef.current, '{{recordId}}') || '{{recordId}}';
        const intro = resolveLocalizedString(dialogConfig.message, languageRef.current, '');
        const lines = generatedRecords.map(entry => renderGeneratedRecordLine(entry, itemTemplate)).filter(Boolean);
        const message = [intro, ...lines].filter(Boolean).join('\n');
        logEvent('submit.afterSubmit.generatedRecords.open', {
          recordId,
          count: generatedRecords.length,
          targetFormKey: dialogConfig.targetFormKey || null
        });
        // The generated-records dialog is a post-submit success dialog.
        // Release the blocking submit overlay before awaiting user acknowledgement,
        // otherwise the dialog renders underneath the still-active spinner.
        setSubmitting(false);
        await openConfiguredConfirmDialog({
          dialog: {
            title: resolveOptionalLocalizedString(
              dialogConfig.title,
              languageRef.current,
              tSystem('common.notice', languageRef.current, 'Notice')
            ),
            message,
            confirmLabel: resolveLocalizedString(
              dialogConfig.confirmLabel,
              languageRef.current,
              tSystem('common.ok', languageRef.current, 'OK')
            ),
            showCancel: false,
            showCloseButton: false,
            dismissOnBackdrop: false
          },
          kind: 'submitAfterSubmit.generatedRecords',
          refId: recordId
        });
        return true;
      };

      const followupCfg = (definition as any)?.followup || null;
      const fallbackActions: string[] = [];
      if (followupCfg?.pdfTemplateId) fallbackActions.push('CREATE_PDF');
      if (followupCfg?.emailTemplateId && followupCfg?.emailRecipients) fallbackActions.push('SEND_EMAIL');
      fallbackActions.push('CLOSE_RECORD');

      let followupErrors: string[] = [];
      let closeResultByAction = new Map<string, any>();
      let handledSubmitNavigation = false;

      if (recordId) {
        if (configuredAfterSubmit && (configuredPreActions.length || configuredBackgroundActions.length)) {
          handledSubmitNavigation = true;
          if (closeOnlyPreActions) {
            closeResultByAction = new Map<string, any>([
              [
                'CLOSE_RECORD',
                {
                  success: true,
                  status: ((res as any)?.meta || {})?.status || closeStatusForPrimarySubmit || null,
                  submitEffects: ((res as any)?.meta || {})?.submitEffects || null
                }
              ]
            ]);
            const submitEffectsCreated = Number((res as any)?.meta?.submitEffects?.created || 0) || 0;
            const submitEffectsUpdated = Number((res as any)?.meta?.submitEffects?.updated || 0) || 0;
            invalidateClientSharedDataCaches({ includePersistedDataSources: true });
            logEvent('sharedData.cache.invalidated', {
              reason: 'submit.afterSubmit.pre.primaryClose',
              recordId,
              submitEffectsCreated,
              submitEffectsUpdated
            });
            if (submitEffectsCreated > 0 || submitEffectsUpdated > 0) {
              refreshGuidedDataSourcesInBackground({
                reason: 'submit.afterSubmit.pre.primaryClose.submitEffects',
                forceRefresh: true,
                retryDelaysMs: [0, 1200, 3500]
              });
            }
          }
          if (configuredPreActions.length) {
            try {
              setStatus('Finalizing submission…');
              setStatusLevel('info');
              logEvent('submit.afterSubmit.pre.begin', { recordId, actions: configuredPreActions });
              if (!closeOnlyPreActions) {
                const outcome = await runFollowupBatchForSubmit({
                  actions: configuredPreActions,
                  reason: 'submit.afterSubmit.pre',
                  refresh: true
                });
                followupErrors = outcome.followupErrors;
                closeResultByAction = outcome.byAction;
              }
              logEvent('submit.afterSubmit.pre.done', {
                recordId,
                actionsCount: configuredPreActions.length,
                errorCount: followupErrors.length
              });
            } catch (err: any) {
              const uiMessage = resolveUiErrorMessage(err, 'Failed');
              const logMessage = resolveLogMessage(err, 'Failed');
              followupErrors = [uiMessage || 'Failed'];
              logEvent('submit.afterSubmit.pre.exception', { recordId, message: logMessage });
            }
          }

          if (followupErrors.length) {
            setStatus(`Submitted, but follow-up had issues: ${followupErrors.join(' · ')}`);
            setStatusLevel('error');
            return;
          }

          setStatus(tSystem('actions.submittedClosed', language, 'Submitted and closed.'));
          setStatusLevel('success');

          const closeActionResult = closeResultByAction.get('CLOSE_RECORD') || null;
          attachGeneratedSubmitEffectRecordsToActiveDraft(
            getGeneratedRecordsFromFollowupResult(closeActionResult),
            'submit.afterSubmit.pre'
          );
          const generatedDialogShown = await maybeOpenSubmitGeneratedRecordsDialog(closeActionResult);
          const navigateTarget = (() => {
            const raw = (configuredAfterSubmit.navigateTo || 'auto').toString().trim().toLowerCase();
            if (raw === 'form' || raw === 'summary' || raw === 'list') return raw as 'form' | 'summary' | 'list';
            return summaryViewEnabled ? 'summary' : 'form';
          })();
          if (navigateTarget === 'list') {
            navigateToListAfterRecordAction('submit.afterSubmit.navigateList');
          } else {
            setView(navigateTarget);
          }

          if (configuredBackgroundActions.length) {
            const followupSessionId = recordSessionRef.current;
            logEvent('submit.afterSubmit.background.begin', {
              recordId,
              actions: configuredBackgroundActions,
              navigateTarget,
              sessionId: followupSessionId
            });
            let backgroundPromise: Promise<{
              success: boolean;
              message?: string;
              recordId: string;
              sessionId: number;
              reason: string;
            }> | null = null;
            backgroundPromise = (async () => {
              try {
                const outcome = await runFollowupBatchForSubmit({
                  actions: configuredBackgroundActions,
                  reason: 'submit.afterSubmit.background',
                  refresh: false,
                  sessionId: followupSessionId
                });
                if (outcome.followupErrors.length) {
                  const message = `Submitted, but follow-up had issues: ${outcome.followupErrors.join(' · ')}`;
                  const target = resolveFollowupResultApplicationTarget({
                    settledRecordId: recordId,
                    selectedRecordId: selectedRecordIdRef.current,
                    selectedSnapshotId: selectedRecordSnapshotRef.current?.id || null,
                    currentSessionId: recordSessionRef.current,
                    followupSessionId,
                    currentView: viewRef.current
                  });
                  if (target.applyToActiveRecord || viewRef.current === 'list') {
                    setStatus(message);
                    setStatusLevel('error');
                  }
                  logEvent('submit.afterSubmit.background.done', {
                    recordId,
                    actionsCount: configuredBackgroundActions.length,
                    errorCount: outcome.followupErrors.length,
                    sessionChanged: target.sessionChanged
                  });
                  return {
                    success: false,
                    message,
                    recordId,
                    sessionId: followupSessionId,
                    reason: 'submit.afterSubmit.background'
                  };
                }
                logEvent('submit.afterSubmit.background.done', {
                  recordId,
                  actionsCount: configuredBackgroundActions.length,
                  errorCount: 0
                });
                return {
                  success: true,
                  recordId,
                  sessionId: followupSessionId,
                  reason: 'submit.afterSubmit.background'
                };
              } catch (err: any) {
                const uiMessage = resolveUiErrorMessage(err, 'Failed');
                const logMessage = resolveLogMessage(err, 'Failed');
                const message = `Submitted, but follow-up had issues: ${uiMessage || 'Failed'}`;
                const target = resolveFollowupResultApplicationTarget({
                  settledRecordId: recordId,
                  selectedRecordId: selectedRecordIdRef.current,
                  selectedSnapshotId: selectedRecordSnapshotRef.current?.id || null,
                  currentSessionId: recordSessionRef.current,
                  followupSessionId,
                  currentView: viewRef.current
                });
                if (target.applyToActiveRecord || viewRef.current === 'list') {
                  setStatus(message);
                  setStatusLevel('error');
                }
                logEvent('submit.afterSubmit.background.exception', {
                  recordId,
                  message: logMessage,
                  sessionChanged: target.sessionChanged
                });
                return {
                  success: false,
                  message,
                  recordId,
                  sessionId: followupSessionId,
                  reason: 'submit.afterSubmit.background'
                };
              } finally {
                const pending = pendingFollowupBatchPromisesRef.current.get(recordId);
                if (backgroundPromise && pending === backgroundPromise) {
                  pendingFollowupBatchPromisesRef.current.delete(recordId);
                  pendingFollowupStatusByRecordRef.current.delete(recordId);
                  if (viewRef.current === 'list') {
                    analyticsSnapshotStaleRef.current = true;
                    requestHomeAnalyticsRefresh({
                      reason: 'submit.afterSubmit.background.settled',
                      recordId
                    });
                  }
                }
              }
            })();
            trackPendingSharedDataMutation({
              recordId,
              reason: 'submit.afterSubmit.background',
              actions: configuredBackgroundActions,
              promise: backgroundPromise
            });
            pendingFollowupBatchPromisesRef.current.set(recordId, backgroundPromise);
            logEvent('followup.pending.tracked', {
              stepId: null,
              recordId,
              reason: 'submit.afterSubmit.background'
            });
            void backgroundPromise;

            if (!generatedDialogShown && configuredAfterSubmit.feedbackDialog) {
              void openConfiguredConfirmDialog({
                dialog: {
                  ...configuredAfterSubmit.feedbackDialog,
                  showCancel: configuredAfterSubmit.feedbackDialog.showCancel ?? false,
                  confirmLabel: configuredAfterSubmit.feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
                },
                kind: 'submitAfterSubmit',
                refId: recordId
              });
            }
          }
        } else {
          try {
            setStatus('Running follow-up…');
            setStatusLevel('info');
            logEvent('followup.auto.batch.begin', { recordId, actions: fallbackActions });
            const outcome = await runFollowupBatchForSubmit({
              actions: fallbackActions,
              reason: 'submit.legacyAutoFollowup',
              refresh: true
            });
            followupErrors = outcome.followupErrors;
            closeResultByAction = outcome.byAction;
            logEvent('followup.auto.batch.done', {
              recordId,
              actionsCount: fallbackActions.length,
              errorCount: followupErrors.length
            });
          } catch (err: any) {
            const uiMessage = resolveUiErrorMessage(err, 'Failed');
            const logMessage = resolveLogMessage(err, 'Failed');
            followupErrors.push(`BATCH: ${uiMessage || 'Failed'}`);
            logEvent('followup.auto.batch.exception', { recordId, message: logMessage });
          }

          if (followupErrors.length) {
            setStatus(`Submitted, but follow-up had issues: ${followupErrors.join(' · ')}`);
            setStatusLevel('error');
          } else {
            setStatus(tSystem('actions.submittedClosed', language, 'Submitted and closed.'));
            setStatusLevel('success');
          }
        }
      }

      if (!handledSubmitNavigation) {
        const submitEffectsCreated = Number((res as any)?.meta?.submitEffects?.created || 0) || 0;
        const submitEffectsUpdated = Number((res as any)?.meta?.submitEffects?.updated || 0) || 0;
        invalidateClientSharedDataCaches({ includePersistedDataSources: true });
        logEvent('sharedData.cache.invalidated', {
          reason: 'submit.success',
          recordId: recordId || null,
          submitEffectsCreated,
          submitEffectsUpdated
        });
        if (submitEffectsCreated > 0 || submitEffectsUpdated > 0) {
          refreshGuidedDataSourcesInBackground({
            reason: 'submit.success.submitEffects',
            forceRefresh: true,
            retryDelaysMs: [0, 1200, 3500]
          });
        }

        // Refresh from saved record to surface server-side autoIncrement + follow-up changes immediately.
        if (recordId) {
          try {
            await loadRecordSnapshot(recordId);
          } catch (err: any) {
            logEvent('submit.fetchRecord.error', { message: err?.message || err, recordId });
          }
        }
        setView(summaryViewEnabled ? 'summary' : 'form');
      }
    } catch (err: any) {
      const uiMessage = resolveUiErrorMessage(err, 'Submit failed');
      const logMessage = resolveLogMessage(err, 'Submit failed');
      const shownMessage =
        isRetryableRecordBusyMessage(uiMessage || logMessage) ? submitPreviousActionRetryMessage() : uiMessage;
      if (uiMessage) {
        setStatus(shownMessage || uiMessage);
        setStatusLevel('error');
      } else {
        setStatusLevel(null);
      }
      logEvent('submit.exception', { message: logMessage, shownMessage: shownMessage || null });
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
      submitPipelineInFlightRef.current = false;
      if (submitPipelineStartMark) {
        const submitPipelineEndMark = `ck.submit.pipeline.end.${Date.now()}`;
        perfMark(submitPipelineEndMark);
        perfMeasure('ck.submit.pipeline', submitPipelineStartMark, submitPipelineEndMark, {
          formKey
        });
      }
    }
  }

  handleSubmitRef.current = handleSubmit;

  const handleSummarySubmit = useCallback(() => {
    if (submitting) return;
    if (recordLoadingId) return;
    if (updateRecordBusyOpen) return;
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = true;
    logEvent('ui.submit.tap', {
      submitLabelOverridden: Boolean(finalSubmitButtonLabelConfig),
      view: 'summary'
    });
    logEvent('summary.submit.fire', { sourceView: viewRef.current });
    void handleSubmitRef.current();
  }, [finalSubmitButtonLabelConfig, logEvent, recordLoadingId, submitting, updateRecordBusyOpen]);

  const handleRecordSelectRef = useRef<AppRecordSelectHandler | null>(null);

  const handleRecordSelect = (
    row: ListItem,
    fullRecord?: WebFormSubmission,
    opts?: { openView?: 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit'; openButtonId?: string }
  ) => {
    const requested = (opts?.openView || 'auto') as 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';
    const openButtonId = (opts?.openButtonId || '').toString().trim();
    const shouldTriggerButton = requested === 'button' && !!openButtonId;
    const shouldCopy = requested === 'copy';
    const shouldSubmit = requested === 'submit';
    const openStartedAt = Date.now();
    const openStartMark = `ck.nav.openRecord.start.${openStartedAt}`;
    openRecordPerfRef.current = { recordId: row.id, startedAt: openStartedAt, startMark: openStartMark };
    perfMark(openStartMark);

    const scheduleListOpenSubmit = (args: { recordId: string; source: string; preconfirmed?: boolean }) => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return;
      // Cancel any previous scheduled submit.
      if (listOpenViewSubmitTimerRef.current) {
        globalThis.clearTimeout(listOpenViewSubmitTimerRef.current);
        listOpenViewSubmitTimerRef.current = null;
      }
      const startedAt = Date.now();
      let attempt = 0;
      const maxAttempts = 40;
      const delayMs = 80;
      const tick = () => {
        attempt += 1;
        const currentSelectedId = (selectedRecordIdRef.current || '').toString().trim();
        const snapshotId = (selectedRecordSnapshotRef.current?.id || '').toString().trim();
        const inForm = viewRef.current === 'form';
        const submitAction = formSubmitActionRef.current;
        const hasAction = typeof submitAction === 'function';
        if (currentSelectedId !== recordId || (snapshotId && snapshotId !== recordId)) {
          logEvent('list.openView.submit.cancelled', {
            recordId,
            source: args.source,
            reason: 'recordChanged',
            currentSelectedId: currentSelectedId || null,
            snapshotId: snapshotId || null
          });
          return;
        }
        if (!inForm || !hasAction || snapshotId !== recordId) {
          if (attempt >= maxAttempts) {
            logEvent('list.openView.submit.timeout', {
              recordId,
              source: args.source,
              attempt,
              inForm,
              hasAction,
              snapshotId: snapshotId || null
            });
            return;
          }
          listOpenViewSubmitTimerRef.current = globalThis.setTimeout(tick, delayMs);
          return;
        }
        listOpenViewSubmitTimerRef.current = null;
        submitConfirmedRef.current = args.preconfirmed === true;
        logEvent('list.openView.submit.fire', {
          recordId,
          source: args.source,
          preconfirmed: args.preconfirmed === true,
          attempt,
          waitMs: Date.now() - startedAt
        });
        submitAction?.();
      };
      tick();
    };

    // If the user is resuming the SAME record they were just editing, keep the in-memory working copy.
    // (Don't overwrite with a cached snapshot that may not include the latest local edits yet.)
    const currentId = (selectedRecordIdRef.current || '').toString().trim();
    const pendingFollowupRecordIds = Array.from(pendingFollowupBatchPromisesRef.current.keys()).filter(Boolean);
    const pendingFollowupRecordId =
      (currentId && pendingFollowupBatchPromisesRef.current.has(currentId) ? currentId : '') ||
      pendingFollowupRecordIds[0] ||
      '';
    if (pendingFollowupRecordId) {
      const seq = navigateHomeBusy.lock({
        title: tSystem('draft.savingShort', languageRef.current, 'Saving…'),
        message: tSystem(
          'submit.waitPreviousAction',
          languageRef.current,
          'Please wait while we finish the previous action...'
        ),
        kind: 'recordSelect',
        diagnosticMeta: {
          recordId: pendingFollowupRecordId,
          nextRecordId: row.id,
          requested
        }
      });
      logEvent('list.recordSelect.waitPendingFollowup.start', {
        recordId: pendingFollowupRecordId,
        nextRecordId: row.id,
        pendingCount: pendingFollowupRecordIds.length,
        requested
      });
      void (async () => {
        try {
          const followupWait = await waitForPendingFollowupBatch({
            recordId: pendingFollowupRecordId,
            reason: 'list.recordSelect'
          });
          if (!followupWait.ok) {
            const message = (followupWait.message || submitPreviousActionRetryMessage()).toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('list.recordSelect.waitPendingFollowup.failed', {
              recordId: pendingFollowupRecordId,
              nextRecordId: row.id,
              message
            });
            return;
          }
          logEvent('list.recordSelect.waitPendingFollowup.done', {
            recordId: pendingFollowupRecordId,
            nextRecordId: row.id
          });
          handleRecordSelectRef.current?.(row, fullRecord, opts);
        } finally {
          navigateHomeBusy.unlock(seq, {
            recordId: pendingFollowupRecordId,
            nextRecordId: row.id
          });
        }
      })();
      return;
    }
    const hasLocalEdits = Boolean(
      autoSaveDirtyRef.current || autoSaveInFlightRef.current || autoSaveQueuedRef.current || uploadQueueRef.current.size > 0
    );
    if (currentId && row.id === currentId && hasLocalEdits) {
      logEvent('list.recordSelect.resumeLocalEdits', {
        recordId: row.id,
        dirty: !!autoSaveDirtyRef.current,
        inFlight: !!autoSaveInFlightRef.current,
        queued: !!autoSaveQueuedRef.current,
        requested,
        openButtonId: shouldTriggerButton ? openButtonId : null
      });
      // For list-triggered button actions, keep the list view and run the action immediately from the in-memory values.
      if (shouldTriggerButton) {
        handleCustomButton(openButtonId);
        return;
      }
      if (shouldCopy) {
        logEvent('list.openView.copy', { recordId: row.id, source: 'resumeLocalEdits' });
        void handleDuplicateCurrent();
        return;
      }
      if (shouldSubmit) {
        logEvent('list.openView.submit', { recordId: row.id, source: 'resumeLocalEdits' });
        setView('form');
        scheduleListOpenSubmit({ recordId: row.id, source: 'resumeLocalEdits' });
        return;
      }

      const statusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || row.status || '') as any)?.toString?.() ||
        '';
      if (requested === 'form') {
        setView('form');
      } else if (requested === 'summary') {
        setView(summaryViewEnabled ? 'summary' : 'form');
      } else {
        const resolved = resolveStatusAutoView(statusRaw, summaryViewEnabled);
        setView(resolved.view);
        logEvent('list.openView.autoByStatus', {
          recordId: row.id,
          source: 'resumeLocalEdits',
          status: statusRaw || null,
          statusKey: resolved.statusKey,
          nextView: resolved.view
        });
      }
      return;
    }

    bumpRecordSession({ reason: 'list.recordSelect', nextRecordId: row.id });
    clearActiveRecordContext();
    let sourceRecord = fullRecord || listCache.records[row.id] || null;
    let sourceRecordSource = fullRecord ? 'fullRecord' : sourceRecord ? 'listCache' : '';
    if (!sourceRecord) {
      const persistedRecord = readCachedRecordSnapshot({
        definition,
        formKey,
        recordId: row.id,
        cacheVersion: homeListCacheVersion,
        onDiagnostic: logEvent,
        source: 'list.recordSelect'
      });
      if (persistedRecord) {
        sourceRecord = persistedRecord;
        sourceRecordSource = 'localStorage';
        setListCache(prev => ({
          response: prev.response,
          records: mergeListRecordSnapshotCache(prev.records, { [row.id]: persistedRecord })
        }));
      }
    }
    setStatus(null);
    setStatusLevel(null);
    setRecordLoadError(null);
    setSelectedRecordId(row.id);
    selectedRecordIdRef.current = row.id;
    setPrefetchedSummaryHtml(null);
    // Clear any previous snapshot immediately; we will re-apply a fresh snapshot below.
    setSelectedRecordSnapshot(null);
    selectedRecordSnapshotRef.current = null;
    const resolveListTriggeredButton = (buttonRef: string) => {
      const parsed = parseButtonRef(buttonRef || '');
      const baseId = parsed.id;
      const qIdx = parsed.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const cfg: any = btn ? (btn as any).button : null;
      const action = (cfg?.action || '').toString().trim();
      return { baseId, qIdx, btn, cfg, action };
    };
    const isAllowedListTriggeredAction = (buttonRef: string): boolean => {
      const { action } = resolveListTriggeredButton(buttonRef);
      return (
        action === 'renderDocTemplate' ||
        action === 'renderMarkdownTemplate' ||
        action === 'renderHtmlTemplate' ||
        action === 'openUrlField' ||
        action === 'updateRecord'
      );
    };

    const rowNumberHint = Number((row as any).__rowNumber);
    const hintedRow = Number.isFinite(rowNumberHint) ? rowNumberHint : undefined;
    recordRowNumberRef.current = hintedRow || null;
    const statusRaw = ((sourceRecord?.status || row.status || '') as any)?.toString?.() || '';
    const resolvedOpenView =
      requested === 'form'
        ? 'form'
        : requested === 'summary'
          ? summaryViewEnabled
            ? 'summary'
            : 'form'
          : resolveStatusAutoView(statusRaw, summaryViewEnabled).view;
    const shouldUseCombinedSummaryFetch =
      !sourceRecord &&
      !shouldTriggerButton &&
      !shouldCopy &&
      !shouldSubmit &&
      resolvedOpenView === 'summary' &&
      Boolean(definition.summaryHtmlTemplateId);

    const hydrateRecordForConfirmedListAction = async (source: string): Promise<boolean> => {
      if (sourceRecord) {
        applyRecordSnapshot(sourceRecord);
        setView('form');
        logEvent('list.confirmedAction.hydrate.cached', { recordId: row.id, source });
        return true;
      }

      const loadingId = row.id || (hintedRow ? `row:${hintedRow}` : null);
      setLastSubmissionMeta({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status ? row.status.toString() : null
      });
      if (loadingId) {
        setRecordLoadingId(loadingId);
        recordLoadingIdRef.current = loadingId;
        setRecordLoadError(null);
      }
      setView('form');
      logEvent('list.confirmedAction.hydrate.start', {
        recordId: row.id,
        rowNumberHint: hintedRow || null,
        source
      });
      const ok = await loadRecordSnapshot(row.id, hintedRow);
      const stillSelected = selectedRecordIdRef.current === row.id;
      logEvent(ok && stillSelected ? 'list.confirmedAction.hydrate.ok' : 'list.confirmedAction.hydrate.skip', {
        recordId: row.id,
        rowNumberHint: hintedRow || null,
        source,
        ok,
        stillSelected
      });
      return ok && stillSelected;
    };

    const openImmediateListSubmitConfirm = (): boolean => {
      if (!shouldSubmit) return false;
      const rawMessage = resolveLocalizedString(
        submitConfirmationDialogConfig?.message,
        language,
        tSystem('submit.confirmMessage', language, 'Are you ready to submit this record?')
      ).toString();
      customConfirm.openConfirm({
        title: submitConfirmTitle,
        message: rawMessage,
        confirmLabel: submitConfirmConfirmLabelResolved,
        cancelLabel: submitConfirmCancelLabelResolved,
        kind: 'list.submit',
        refId: row.id,
        onConfirm: () => {
          void (async () => {
            const ok = await hydrateRecordForConfirmedListAction(sourceRecord ? 'submit.cached' : 'submit.fetched');
            if (!ok) return;
            logEvent('list.openView.submit', { recordId: row.id, source: sourceRecord ? 'confirmed.cached' : 'confirmed.fetched' });
            setView('form');
            scheduleListOpenSubmit({
              recordId: row.id,
              source: sourceRecord ? 'confirmed.cached' : 'confirmed.fetched',
              preconfirmed: true
            });
          })();
        }
      });
      logEvent('list.openView.submit.confirm.open', {
        recordId: row.id,
        source: sourceRecord ? 'cached' : 'list',
        rowNumberHint: hintedRow || null
      });
      return true;
    };

    const openImmediateListUpdateRecordConfirm = (): boolean => {
      if (!shouldTriggerButton) return false;
      const { baseId, qIdx, cfg, action } = resolveListTriggeredButton(openButtonId);
      if (action !== 'updateRecord') return false;
      const confirmCfg = (cfg?.confirm || cfg?.confirmation || null) as any;
      const confirmMessage = confirmCfg ? resolveLocalizedString(confirmCfg?.message, languageRef.current, '').toString().trim() : '';
      if (!confirmMessage) return false;
      const confirmTitle = confirmCfg
        ? resolveOptionalLocalizedString(confirmCfg?.title, languageRef.current, tSystem('common.confirm', languageRef.current, 'Confirm'))
            .toString()
            .trim()
        : '';
      const confirmLabel = confirmCfg ? resolveLocalizedString(confirmCfg?.confirmLabel, languageRef.current, '').toString().trim() : '';
      const cancelLabel = confirmCfg ? resolveLocalizedString(confirmCfg?.cancelLabel, languageRef.current, '').toString().trim() : '';
      customConfirm.openConfirm({
        title: confirmTitle,
        message: confirmMessage,
        confirmLabel: confirmLabel || tSystem('common.confirm', languageRef.current, 'Confirm'),
        cancelLabel: cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel'),
        kind: 'list.updateRecord',
        refId: openButtonId,
        onConfirm: () => {
          void (async () => {
            const ok = await hydrateRecordForConfirmedListAction(sourceRecord ? 'updateRecord.cached' : 'updateRecord.fetched');
            if (!ok) return;
            logEvent('list.openButton.trigger', {
              openButtonId,
              source: sourceRecord ? 'confirmed.cached' : 'confirmed.fetched'
            });
            handleCustomButton(openButtonId, { skipConfirm: true });
          })();
        }
      });
      logEvent('list.openButton.confirm.open', {
        buttonId: baseId,
        qIdx: qIdx ?? null,
        recordId: row.id,
        rowNumberHint: hintedRow || null,
        source: sourceRecord ? 'cached' : 'list'
      });
      return true;
    };

    if (openImmediateListSubmitConfirm()) return;
    if (openImmediateListUpdateRecordConfirm()) return;

    const triggerOpenButtonIfNeeded = () => {
      if (!shouldTriggerButton) return;
      if (!isAllowedListTriggeredAction(openButtonId)) {
        logEvent('list.openButton.ignored', { openButtonId, reason: 'unsupportedAction' });
        return;
      }
      logEvent('list.openButton.trigger', { openButtonId });
      handleCustomButton(openButtonId);
    };

    const cachedVersion =
      sourceRecord && Number.isFinite(Number((sourceRecord as any).dataVersion)) ? Number((sourceRecord as any).dataVersion) : null;

    const openCopyBusy = () =>
      copyRecordBusy.lock({
        title: '',
        message: tSystem('navigation.waitCopyRecord', language, 'Please wait while we prepare your copied record...'),
        diagnosticMeta: { recordId: row.id }
      });

    const fetchFullSnapshotThenCopy = (source: string, busySeq: number | null) => {
      const loadingId = row.id || (hintedRow ? `row:${hintedRow}` : null);
      setRecordLoadingId(loadingId);
      recordLoadingIdRef.current = loadingId;
      setRecordLoadError(null);
      const startedAt = Date.now();
      void (async () => {
        try {
          const ok = await loadRecordSnapshot(row.id, hintedRow);
          if (!ok) return;
          if (selectedRecordIdRef.current !== row.id) return;
          logEvent('list.openView.copy', { recordId: row.id, source });
          await handleDuplicateCurrent({ busyAlreadyOpen: busySeq !== null });
        } finally {
          if (busySeq !== null) {
            copyRecordBusy.unlock(busySeq, {
              recordId: row.id,
              source,
              durationMs: Date.now() - startedAt
            });
          }
        }
      })();
    };

    // Fast path: show cached record immediately when available.
    // Re-check the server version in the background when we have a cached version; refetch if stale.
    if (sourceRecord) {
      if (shouldCopy) {
        fetchFullSnapshotThenCopy(
          sourceRecordSource === 'localStorage' ? 'copy.fetchedFromRecordLocalCache' : 'copy.fetchedFromListCache',
          openCopyBusy()
        );
        return;
      }
      applyRecordSnapshot(sourceRecord);
      // If the list requested a button action, don't wait on version checks; render immediately from the cached snapshot.
      // (If the cached snapshot is stale, the user can always refresh; we avoid blocking the UX on a second roundtrip.)
      if (shouldTriggerButton) {
        triggerOpenButtonIfNeeded();
      }
      if (shouldSubmit) {
        logEvent('list.openView.submit', {
          recordId: row.id,
          source: sourceRecordSource === 'localStorage' ? 'localRecordCache' : 'cached'
        });
        setView('form');
        scheduleListOpenSubmit({
          recordId: row.id,
          source: sourceRecordSource === 'localStorage' ? 'localRecordCache' : 'cached'
        });
        return;
      }
      // Version check is async; do not block navigation.
      if (cachedVersion !== null) {
        if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
          logEvent('record.versionCheck.skipped', {
            recordId: row.id,
            reason: autoSaveInFlightRef.current ? 'autosaveInFlight' : 'uploadInFlight'
          });
        } else {
          void (async () => {
            const recordId = row.id;
            logEvent('record.versionCheck.start', { recordId, cachedVersion, rowNumberHint: hintedRow || null });
            try {
              const v = await getRecordVersionApi(formKey, recordId, hintedRow || null);
              if (selectedRecordIdRef.current !== recordId) return;
              if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
                // Avoid racing our own autosave writes. We'll rely on the next check (or explicit refresh).
                logEvent('record.versionCheck.ignored', {
                  recordId,
                  reason: autoSaveInFlightRef.current ? 'autosaveInFlight.afterFetch' : 'uploadInFlight.afterFetch'
                });
                return;
              }
              if (!v?.success) {
                logEvent('record.versionCheck.error', { recordId, message: v?.message || 'failed' });
                return;
              }
              const versionComparison = resolveRecordVersionCheckComparison({
                currentDataVersion: recordDataVersionRef.current,
                cachedVersion,
                serverDataVersion: v.dataVersion,
                serverRowNumber: v.rowNumber
              });
              const { baselineVersion, serverVersion, serverRow } = versionComparison;
              if (serverRow && serverRow >= 2) recordRowNumberRef.current = serverRow;
              markRecordFreshnessServerTouch({ reason: 'record.versionCheck', recordId });
              if (versionComparison.state === 'match') {
                logEvent('record.versionCheck.match', { recordId, serverVersion, baselineVersion });
                return;
              }
              logEvent('record.versionCheck.stale', {
                recordId,
                cachedVersion: baselineVersion,
                serverVersion,
                serverRow: serverRow || null
              });
              if (versionComparison.state === 'stale') {
                const syncBlockers = getRecordFreshnessSyncBlockers();
                const shouldDeferSync = syncBlockers.length > 0;
                if (shouldDeferSync) {
                  pendingDeferredRecordFreshnessSyncRef.current = {
                    reason: 'versionCheck.stale',
                    recordId,
                    cachedVersion: baselineVersion,
                    serverVersion,
                    serverRow: serverRow || hintedRow || null
                  };
                  logEvent('record.versionCheck.stale.deferred', {
                    recordId,
                    cachedVersion: baselineVersion,
                    serverVersion,
                    serverRow: serverRow || hintedRow || null,
                    draftSavePhase: draftSave.phase,
                    autoSaveQueued: autoSaveQueuedRef.current,
                    blockers: syncBlockers
                  });
                  scheduleRecordFreshnessCheck('record.versionCheck.staleDeferred');
                  return;
                }
                pendingDeferredRecordFreshnessSyncRef.current = null;
                void synchronizeStaleRecordRef.current({
                  reason: 'versionCheck.stale',
                  recordId,
                  cachedVersion: baselineVersion,
                  serverVersion,
                  serverRow: serverRow || hintedRow || null
                });
              }
            } catch (err: any) {
              const msg = (err?.message || err?.toString?.() || 'failed').toString();
              logEvent('record.versionCheck.exception', { recordId: row.id, message: msg });
            }
          })();
        }
      } else if (sourceRecordSource === 'localStorage') {
        void loadRecordSnapshot(row.id, hintedRow, { background: true });
      }
    } else {
      // No cached record (or no cached version): fetch the full snapshot.
      const loadingId = row.id || (hintedRow ? `row:${hintedRow}` : null);
      const shouldShowLoadingShell = !shouldTriggerButton && !shouldCopy && !shouldSubmit && Boolean(loadingId);
      setLastSubmissionMeta({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status ? row.status.toString() : null
      });
      if (shouldShowLoadingShell) {
        setRecordLoadingId(loadingId);
        recordLoadingIdRef.current = loadingId;
        setRecordLoadError(null);
      }
      let copyBusyDelegated = false;
      const copyBusySeq = shouldCopy ? openCopyBusy() : null;
      const hydrateFromInFlightPrefetch = async (): Promise<boolean> => {
        if (shouldUseCombinedSummaryFetch) return false;
        if (!hintedRow || hintedRow < 2) return false;
        const pending = listRecordSnapshotPrefetchByRowRef.current.get(hintedRow);
        if (!pending) return false;
        const shouldWaitForBatch = shouldWaitForRecordPrefetchBeforeIndividualFetch({
          hasPending: true,
          source: pending.source
        });
        logEvent('record.open.prefetch.await', {
          recordId: row.id,
          rowNumberHint: hintedRow,
          source: pending.source,
          waitMode: shouldWaitForBatch ? 'batch' : 'bounded',
          pendingMs: Date.now() - pending.startedAt
        });
        const awaited = shouldWaitForBatch
          ? await pending.promise.then(res => res || null).catch(() => null)
          : await Promise.race([
              pending.promise.then(res => res || null).catch(() => null),
              new Promise<null>(resolve => {
                globalThis.setTimeout(() => resolve(null), 2200);
              })
            ]);
        if (!awaited) return false;
        if (selectedRecordIdRef.current !== row.id) return true;
        const receivedIds = Object.keys(awaited);
        if (receivedIds.length) {
          setListCache(prev => ({
            response: prev.response,
            records: mergeListRecordSnapshotCache(prev.records, awaited)
          }));
        }
        const prefetchedRecord = awaited[row.id];
        if (!prefetchedRecord) {
          logEvent('record.open.prefetch.miss', {
            recordId: row.id,
            rowNumberHint: hintedRow,
            source: pending.source,
            received: receivedIds.length
          });
          return false;
        }
        logEvent('record.open.prefetch.apply', {
          recordId: row.id,
          rowNumberHint: hintedRow,
          source: pending.source,
          received: receivedIds.length
        });
        applyRecordSnapshot(prefetchedRecord);
        if (shouldCopy) {
          copyBusyDelegated = true;
          fetchFullSnapshotThenCopy('copy.fetchedAfterPrefetch', copyBusySeq);
          return true;
        }
        if (shouldSubmit) {
          logEvent('list.openView.submit', { recordId: row.id, source: 'prefetched' });
          setView('form');
          scheduleListOpenSubmit({ recordId: row.id, source: 'prefetched' });
          return true;
        }
        triggerOpenButtonIfNeeded();
        return true;
      };

      const queueSelectedRecordPreviewPrefetch = () => {
        if (shouldUseCombinedSummaryFetch) return;
        if (!hintedRow || hintedRow < 2) return;
        if (listCache.records[row.id]) return;
        const existing = listRecordSnapshotPrefetchByRowRef.current.get(hintedRow);
        if (existing) return;
        const sessionAtStart = recordSessionRef.current;
        const startedAt = Date.now();
        logEvent('record.open.previewPrefetch.start', {
          recordId: row.id,
          rowNumberHint: hintedRow
        });
        const requestPromise = fetchRecordsByRowNumbers(formKey, [hintedRow]);
        const prefetchRequest: RecordSnapshotPrefetchRequest = {
          promise: requestPromise,
          source: 'recordPreview',
          startedAt,
          rowNumbers: [hintedRow]
        };
        listRecordSnapshotPrefetchByRowRef.current.set(hintedRow, prefetchRequest);
        void requestPromise
          .then(prefetchedRecords => {
            const receivedIds = prefetchedRecords ? Object.keys(prefetchedRecords) : [];
            if (receivedIds.length) {
              setListCache(prev => ({
                response: prev.response,
                records: mergeListRecordSnapshotCache(prev.records, prefetchedRecords)
              }));
            }
            const prefetchedRecord = prefetchedRecords?.[row.id];
            if (
              prefetchedRecord &&
              shouldApplyPrefetchedRecordPreview({
                recordId: row.id,
                selectedRecordId: selectedRecordIdRef.current || '',
                hasSelectedSnapshot: Boolean(selectedRecordSnapshotRef.current),
                sessionAtStart,
                currentSession: recordSessionRef.current
              })
            ) {
              applyRecordSnapshot(prefetchedRecord);
              logEvent('record.open.previewPrefetch.apply', {
                recordId: row.id,
                rowNumberHint: hintedRow,
                durationMs: Date.now() - startedAt
              });
            }
            logEvent('record.open.previewPrefetch.ok', {
              recordId: row.id,
              rowNumberHint: hintedRow,
              received: receivedIds.length,
              durationMs: Date.now() - startedAt
            });
          })
          .catch((err: any) => {
            logEvent('record.open.previewPrefetch.error', {
              recordId: row.id,
              rowNumberHint: hintedRow,
              durationMs: Date.now() - startedAt,
              message: err?.message || err?.toString?.() || 'failed'
            });
          })
          .finally(() => {
            const inFlight = listRecordSnapshotPrefetchByRowRef.current.get(hintedRow);
            if (inFlight?.promise === requestPromise) {
              listRecordSnapshotPrefetchByRowRef.current.delete(hintedRow);
            }
          });
      };

      void (async () => {
        const startedAt = Date.now();
        queueSelectedRecordPreviewPrefetch();
        if (shouldUseCombinedSummaryFetch) {
          const startedAt = Date.now();
          logEvent('summary.fetchCombined.start', { recordId: row.id, rowNumberHint: hintedRow || null });
          try {
            const res = await fetchSummaryRecordApi(formKey, language, row.id, hintedRow || null);
            if (selectedRecordIdRef.current !== row.id) return;
            const snapshot = res?.record || null;
            if (!snapshot) throw new Error((res?.message || 'Record not found.').toString());
            applyRecordSnapshot(snapshot);
            if (res?.success && res?.html) {
              const draft = buildDraftPayload({
                definition,
                formKey,
                language,
                values: valuesRef.current,
                lineItems: lineItemsRef.current,
                existingRecordId: snapshot.id
              });
              (draft as any).status = snapshot.status || null;
              (draft as any).createdAt = snapshot.createdAt || undefined;
              (draft as any).updatedAt = snapshot.updatedAt || undefined;
              (draft as any).pdfUrl = (snapshot as any).pdfUrl || undefined;
              seedSummaryHtmlTemplateCache(draft, {
                success: true,
                html: res.html,
                fileName: res.fileName
              });
              setPrefetchedSummaryHtml({ recordId: snapshot.id || row.id, html: res.html });
              logEvent('summary.fetchCombined.ok', {
                recordId: snapshot.id || row.id,
                durationMs: Date.now() - startedAt,
                htmlLength: (res.html || '').toString().length
              });
            } else {
              logEvent('summary.fetchCombined.degraded', {
                recordId: snapshot.id || row.id,
                durationMs: Date.now() - startedAt,
                message: res?.message || 'summaryRenderFailed'
              });
            }
            return;
          } catch (err: any) {
            if (selectedRecordIdRef.current !== row.id) return;
            const uiMessage = resolveUiErrorMessage(err, 'Failed to load summary.');
            const logMessage = resolveLogMessage(err, 'Failed to load summary.');
            setRecordLoadError(uiMessage);
            setRecordLoadingId(null);
            recordLoadingIdRef.current = null;
            logEvent('summary.fetchCombined.error', {
              recordId: row.id,
              rowNumberHint: hintedRow || null,
              durationMs: Date.now() - startedAt,
              message: logMessage
            });
            return;
          }
        }

        try {
          const resolvedFromPrefetch = await hydrateFromInFlightPrefetch();
          if (resolvedFromPrefetch) return;
          const ok = await loadRecordSnapshot(row.id, hintedRow);
          if (!ok) return;
          if (selectedRecordIdRef.current !== row.id) return;
          if (shouldCopy) {
            logEvent('list.openView.copy', { recordId: row.id, source: 'fetched' });
            await handleDuplicateCurrent({ busyAlreadyOpen: copyBusySeq !== null });
            return;
          }
          if (shouldSubmit) {
            logEvent('list.openView.submit', { recordId: row.id, source: 'fetched' });
            setView('form');
            scheduleListOpenSubmit({ recordId: row.id, source: 'fetched' });
            return;
          }
          triggerOpenButtonIfNeeded();
        } finally {
          if (copyBusySeq !== null && !copyBusyDelegated) {
            copyRecordBusy.unlock(copyBusySeq, {
              recordId: row.id,
              source: 'copy.fetched',
              durationMs: Date.now() - startedAt
            });
          }
        }
      })();
    }
    // When Summary view is disabled, always open the Form view (closed records are read-only).
    if (shouldTriggerButton) {
      // Stay on the list view; the button action will open a preview overlay when the record snapshot is ready.
      return;
    }
    if (shouldCopy || shouldSubmit) {
      // Navigation is handled by the copy/submit flows above.
      return;
    }

    if (requested === 'auto') {
      const resolved = resolveStatusAutoView(statusRaw, summaryViewEnabled);
      logEvent('list.openView.autoByStatus', {
        recordId: row.id,
        source: sourceRecord ? 'cached' : 'fetched',
        status: statusRaw || null,
        statusKey: resolved.statusKey,
        nextView: resolvedOpenView
      });
    }
    setView(resolvedOpenView);
  };

  handleRecordSelectRef.current = handleRecordSelect;

  useAppPerfOpenRecordBridge({
    enabled: perfEnabled,
    listItems: listCache.response?.items,
    records: listCache.records,
    onDiagnostic: logEvent,
    recordSelectRef: handleRecordSelectRef
  });

  useEffect(() => {
    const envLower = (envTag || '').toString().trim().toLowerCase();
    const enabled = debugEnabled || envLower === 'stage-2' || envLower === 'staging';
    if (!enabled) return;
    const globalAny = globalThis as any;
    const hook = () => ({
      values: valuesRef.current,
      lineItems: lineItemsRef.current,
      selectedRecordId,
      view
    });
    globalAny.__CK_DEBUG_FORM_STATE__ = hook;
    return () => {
      try {
        if (globalAny.__CK_DEBUG_FORM_STATE__ === hook) {
          delete globalAny.__CK_DEBUG_FORM_STATE__;
        }
      } catch {
        // ignore cleanup failures
      }
    };
  }, [debugEnabled, envTag, selectedRecordId, view]);

  const currentRecord = selectedRecordSnapshot || (selectedRecordId && !recordLoadingId ? listCache.records[selectedRecordId] : null);
  const showFormRecordLoadingPlaceholder = shouldShowRecordLoadingPlaceholder({
    recordLoading: Boolean(recordLoadingId),
    recordLoadError: Boolean(recordLoadError),
    hasCurrentRecord: Boolean(currentRecord)
  });
  const hideAppHeaderAutoSaveNotices = definition.appHeader?.hideAutoSaveNotices === true;
  const headerRight = useMemo(() => {
    return (
      <AppHeaderStatus
        envTag={envTag}
        language={language}
        view={view}
        autoSaveEnabled={autoSaveEnabled}
        draftSavePhase={draftSave.phase}
        draftSaveMessage={draftSave.message}
        isClosedRecord={isClosedRecord}
        hideAutoSaveNotices={hideAppHeaderAutoSaveNotices}
      />
    );
  }, [autoSaveEnabled, draftSave.message, draftSave.phase, envTag, hideAppHeaderAutoSaveNotices, isClosedRecord, language, view]);
  const headerRightPriority = useMemo(
    () =>
      shouldRenderAppHeaderSaveNotice({
        view,
        autoSaveEnabled,
        draftSavePhase: draftSave.phase,
        isClosedRecord,
        hideAutoSaveNotices: hideAppHeaderAutoSaveNotices
      }),
    [autoSaveEnabled, draftSave.phase, hideAppHeaderAutoSaveNotices, isClosedRecord, view]
  );
  const {
    drawerEnabled: headerDrawerEnabled,
    layout: headerLayout,
    backLabel: headerBackLabel,
    handleBack: handleHeaderBack
  } = useAppHeaderNavigation({
    sidebarEnabled: definition.appHeader?.sidebarEnabled,
    language,
    view,
    navigateHomeBusy,
    onDiagnostic: logEvent
  });

  const {
    dedupDialogConflict,
    dedupDialogDetails,
    dedupDialogCopy,
    dedupDialogMessage,
    listDedupDialogMessage,
    ingredientCreateDedupDialogMode,
    dedupDialogConfirmLabel,
    dedupDialogCancelLabel
  } = useDedupDialogPresentation({
    definition,
    dedupConflict,
    dedupNotice,
    dedupIdentityFieldIdMap,
    optionState,
    language,
    values,
    listDedupPrompt,
    ingredientsFormActive,
    createFlowRef
  });

  const {
    handleDedupDialogCancel,
    handleDedupDialogConfirm,
    handleListDedupDialogCancel,
    handleListDedupDialogConfirm,
    handleDedupTopNoticeOpenExisting
  } = useAppDedupDialogHandlers({
    definition,
    dedupDialogConflict,
    dedupDialogDetails,
    dedupIdentityFieldIdMap,
    ingredientCreateDedupDialogMode,
    dedupConflict,
    dedupNotice,
    listDedupPrompt,
    summaryViewEnabled,
    dedupCheckTimerRef,
    dedupCheckSeqRef,
    lastDedupCheckedSignatureRef,
    dedupHoldRef,
    dedupCheckingRef,
    dedupConflictRef,
    autoSaveDirtyRef,
    autoSaveTimerRef,
    valuesRef,
    lineItemsRef,
    createFlowRef,
    createFlowUserEditedRef,
    autoSaveUserEditedRef,
    setDedupChecking,
    setDedupConflict,
    setDedupNotice,
    setDraftSave,
    setValues,
    setLineItems,
    setErrors,
    setView,
    setStatus,
    setStatusLevel,
    setListDedupPrompt,
    hideDedupProgressDialog,
    openExistingRecordFromDedup,
    loadRecordSnapshot,
    logEvent
  });

  useEffect(() => {
    if (!dedupDialogConflict) return;
    const dialogCfg = definition.dedupDialog;
    logEvent('dedup.dialog.open', {
      ruleId: dedupDialogConflict.ruleId || null,
      existingRecordId: dedupDialogConflict.existingRecordId || null,
      existingRowNumber: dedupDialogConflict.existingRowNumber ?? null,
      copyOverrides: {
        title: Boolean(dialogCfg?.title),
        intro: Boolean(dialogCfg?.intro),
        outro: Boolean(dialogCfg?.outro),
        changeLabel: Boolean(dialogCfg?.changeLabel),
        cancelLabel: Boolean(dialogCfg?.cancelLabel),
        openLabel: Boolean(dialogCfg?.openLabel)
      }
    });
  }, [dedupDialogConflict, definition.dedupDialog, logEvent]);

  const dedupTopNotice =
    view === 'form' && (isBlockingDedupConflict(dedupConflict) || !!dedupNotice) && !dedupDialogConflict ? (
      <DedupDuplicateNotice
        language={language}
        message={(dedupConflict || dedupNotice)?.message}
        canOpenExisting={!!(dedupConflict || dedupNotice)?.existingRecordId}
        onOpenExisting={handleDedupTopNoticeOpenExisting}
      />
    ) : null;

  const showInlineDedupCheckingNotice = precreateDedupChecking || (dedupChecking && !(view === 'form' && dedupCheckDialogEnabled));
  const dedupCheckingNotice =
    showInlineDedupCheckingNotice ? (
      <DedupCheckingNotice language={language} />
    ) : null;

  const submitTopErrorMessage = resolveLocalizedString(
    definition.submitValidation?.submitTopErrorMessage,
    language,
    ''
  )
    .toString()
    .trim();
  const hideSubmitTopErrorMessage = definition.submitValidation?.hideSubmitTopErrorMessage === true;
  useEffect(() => {
    if (!hideSubmitTopErrorMessage) return;
    logEvent('validation.submitTopError.hidden', { enabled: true });
  }, [hideSubmitTopErrorMessage, logEvent]);
  const validationTopNotice =
    view === 'form' &&
    validationAttempted &&
    !validationNoticeHidden &&
    (Object.keys(errors || {}).length > 0 || (validationWarnings.top || []).length > 0) ? (
      <ValidationHeaderNotice
        language={language}
        errors={errors}
        warnings={validationWarnings.top}
        hideErrorBanner={hideSubmitTopErrorMessage}
        errorMessageOverride={submitTopErrorMessage || undefined}
        onDismiss={dismissValidationNotice}
        onNavigateToField={navigateToFieldFromHeaderNotice}
      />
    ) : null;

  const guidedStepsTopSlot =
    view === 'form' && (definition as any)?.steps?.mode === 'guided' ? <div id="ck-guided-stepsbar-slot" /> : null;

  const {
    topBarNotice,
    bottomBarNotice,
    listLegendItems,
    listLegendColumns,
    listLegendColumnWidths
  } = useAppActionNotices({
    definition,
    language,
    view,
    guidedStepsTopSlot,
    dedupCheckingNotice,
    dedupTopNotice,
    validationTopNotice,
    precreateDedupChecking,
    onDiagnostic: logEvent
  });

  const systemActionGateState = useSystemActionGateState({
    definition,
    view,
    values,
    lineItems,
    selectedRecordId,
    selectedRecordSnapshot,
    lastSubmissionMeta,
    guidedUiState
  });

  const {
    guidedSubmitLabel,
    showGuidedBack,
    guidedBackLabel,
    guidedBackDisabled,
    orderedSubmitDisabled,
    submitDisabledTooltip,
    guidedNextWouldEnable,
    submitDisabledByGate,
    submitHiddenByGate,
    hideEditResolved,
    summaryEnabledResolved,
    copyEnabledResolved,
    canCopyResolved
  } = useAppActionBarState({
    view,
    language,
    guidedUiState,
    finalSubmitButtonLabelConfig,
    orderedEntryEnabled,
    formIsValid,
    dedupNavigationBlocked,
    systemActionGateState,
    isClosedRecord,
    summaryViewEnabled,
    copyCurrentRecordEnabled,
    selectedRecordId,
    lastSubmissionRecordId: lastSubmissionMeta?.id
  });

  useSubmitGateEnableDialog({
    guidedNextWouldEnable,
    guidedUiState,
    submitDisabledByGate,
    systemActionGateState,
    openSystemActionGateDialog
  });

  const appActionBarCommonProps = {
    language,
    view,
    disabled:
      submitting || updateRecordBusyOpen || recordSyncBusyOpen || Boolean(recordLoadingId) || Boolean(recordStale) || precreateDedupChecking,
    submitDisabled: view === 'form' && (dedupNavigationBlocked || orderedSubmitDisabled || submitDisabledByGate),
    submitDisabledTooltip: submitDisabledTooltip || undefined,
    submitting,
    readOnly: view === 'form' && isClosedRecord,
    hideSubmit: submitHiddenByGate,
    hideEdit: hideEditResolved,
    createNewEnabled: definition.createNewRecordEnabled !== false,
    createButtonLabel: definition.createButtonLabel,
    copyCurrentRecordLabel: definition.copyCurrentRecordLabel,
    submitLabel: guidedSubmitLabel,
    summaryLabel: definition.summaryButtonLabel,
    summaryEnabled: summaryEnabledResolved,
    copyEnabled: copyEnabledResolved,
    canCopy: canCopyResolved,
    customButtons: customButtons as any,
    actionBars: definition.actionBars,
    onHome: handleGoHome,
    onCreateNew: handleSubmitAnother,
    onCreateCopy: () => {
      void handleDuplicateCurrent();
    },
    onEdit: () => setView('form'),
    onSummary: handleGoSummary,
    onSubmit: view === 'summary' ? handleSummarySubmit : requestSubmit,
    onCustomButton: handleCustomButton,
    onDiagnostic: logEvent
  };

  return (
    <div
      className={`page${view === 'form' ? ' ck-page-form' : ''}`}
      style={
        isMobile
          ? {
              fontSize: isCompact ? 28 : 36,
              lineHeight: isCompact ? 1.35 : 1.42
            }
          : undefined
      }
    >
      <style>{FORM_VIEW_STYLES}</style>
      <style>{githubMarkdownCss}</style>
      <style>{MARKDOWN_PREVIEW_STYLES}</style>
      <style>{HTML_PREVIEW_STYLES}</style>
      <AppHeader
        title={definition.title || 'Form'}
        titleRight={headerRight}
        titleRightPriority={headerRightPriority}
        layout={headerLayout}
        backLabel={headerBackLabel}
        onBack={handleHeaderBack}
        logoUrl={definition.appHeader?.logoUrl}
        drawerEnabled={headerDrawerEnabled}
        buildMarker={BUILD_MARKER}
        isMobile={isMobile}
        languages={availableLanguages}
        language={language}
        onLanguageChange={raw => {
          const next = normalizeLanguage(raw);
          if (!allowLanguageSelection) {
            logEvent('i18n.language.changeIgnored', { raw, next, reason: 'languageSelectorDisabled' });
            setLanguage(defaultLanguage);
            return;
          }
          if (!availableLanguages.includes(next as any)) {
            logEvent('i18n.language.changeRejected', { raw, next, availableLanguages });
            setLanguage(defaultLanguage);
            return;
          }
          setLanguage(next);
        }}
        onRefresh={handleGlobalRefresh}
        onDiagnostic={logEvent}
      />

      {blockLandscape ? <AppOrientationBlocker language={language} /> : null}

      <AppActionBar position="top" commonProps={appActionBarCommonProps} notice={topBarNotice} />

      <AppMainViews
        view={view}
        formKey={formKey}
        definition={definition}
        language={language}
        values={values}
        lineItems={lineItems}
        optionState={optionState}
        errors={errors}
        submitting={submitting}
        updateRecordBusyOpen={updateRecordBusyOpen}
        recordSyncBusyOpen={recordSyncBusyOpen}
        guidedMilestoneBusyOpen={guidedMilestoneBusy.state.open}
        isClosedRecord={isClosedRecord}
        recordLoadingId={recordLoadingId}
        recordStale={recordStale}
        showFormRecordLoadingPlaceholder={showFormRecordLoadingPlaceholder}
        recordLoadError={recordLoadError}
        recordSessionKey={recordSessionKey}
        dedupTriggerFieldIdMap={dedupTriggerFieldIdMap}
        setValuesFromFormView={setValuesFromFormView}
        setLineItemsFromFormView={setLineItemsFromFormView}
        handleSubmit={handleSubmit}
        formSubmitActionRef={formSubmitActionRef}
        formBackActionRef={formBackActionRef}
        formNavigateToFieldRef={formNavigateToFieldRef}
        setErrors={setErrors}
        status={status}
        statusLevel={statusLevel}
        formRecordMeta={formRecordMeta}
        validationWarnings={validationWarnings}
        clearStatus={clearStatus}
        setOptionState={setOptionState}
        ensureOptions={ensureOptions}
        ensureLineOptions={ensureLineOptions}
        externalScrollAnchor={externalScrollAnchor}
        setExternalScrollAnchor={setExternalScrollAnchor}
        runSelectionEffects={runSelectionEffects}
        selectionEffectAsyncPendingCount={selectionEffectAsyncPendingCount}
        uploadFieldUrls={uploadFieldUrls}
        prepareQrScannerLaunch={prepareQrScannerLaunch}
        onQrScannerSessionReady={handleQrScannerSessionReady}
        onQrScannerSessionEnd={handleQrScannerSessionEnd}
        onQrScannerCommitted={applyQrScannerCommittedUpdate}
        handleCustomButton={handleCustomButton}
        handleReportButtonPointerDown={handleReportButtonPointerDown}
        reportOverlay={reportOverlay}
        handleUserEdit={handleUserEdit}
        handleAutomatedMutation={handleAutomatedMutation}
        setFormIsValid={setFormIsValid}
        setGuidedUiState={setGuidedUiState}
        handleGuidedStepMilestone={handleGuidedStepMilestone}
        requestedGuidedStepId={requestedGuidedStepId}
        guidedExternalSyncSignal={guidedExternalSyncSignal}
        setRequestedGuidedStepId={setRequestedGuidedStepId}
        dedupNavigationBlocked={dedupNavigationBlocked}
        submitDisabledByGate={submitDisabledByGate}
        customConfirm={customConfirm}
        setAutoSaveHoldFromUi={setAutoSaveHoldFromUi}
        summarySubmitIntentRef={summarySubmitIntentRef}
        ensureDraftRecordId={ensureDraftRecordId}
        queueGuidedStepUtilisationDraftSync={queueGuidedStepUtilisationDraftSync}
        handleGuidedStepUtilisationDraftStateChange={handleGuidedStepUtilisationDraftStateChange}
        waitForGuidedStepUtilisationDraftSync={waitForGuidedStepUtilisationDraftSync}
        waitForPendingSharedDataMutations={waitForPendingSharedDataMutations}
        handleBeforeGuidedStepAdvance={handleBeforeGuidedStepAdvance}
        lastSubmissionMeta={lastSubmissionMeta}
        selectedRecordId={selectedRecordId}
        currentRecord={currentRecord}
        prefetchedSummaryHtml={prefetchedSummaryHtml}
        openReadOnlyFilesOverlay={openReadOnlyFilesOverlay}
        analyticsSnapshot={analyticsSnapshot}
        analyticsSnapshotRev={analyticsSnapshotRev}
        precreateDedupChecking={precreateDedupChecking}
        listCache={listCache}
        listRefreshToken={listRefreshToken}
        listFetch={listFetch}
        listFetchNotice={listFetchNotice}
        listLegendItems={listLegendItems}
        listLegendColumns={listLegendColumns}
        listLegendColumnWidths={listLegendColumnWidths}
        handleRecordSelect={handleRecordSelect}
        handleReadListViewDateSearchCache={handleReadListViewDateSearchCache}
        handleListViewCache={handleListViewCache}
        preservedListSearchState={preservedListSearchState}
        handlePreservedListSearchStateChange={handlePreservedListSearchStateChange}
        logEvent={logEvent}
      />

      <AppOverlays
        language={language}
        view={view}
        submitting={submitting}
        status={status}
        dedupProgress={dedupProgress}
        autoSaveNoticeOpen={autoSaveNoticeOpen}
        autoSaveNoticeTitle={autoSaveNoticeTitle}
        autoSaveNoticeMessage={autoSaveNoticeMessage}
        autoSaveNoticeConfirmLabel={autoSaveNoticeConfirmLabel}
        autoSaveNoticeCancelLabel={autoSaveNoticeCancelLabel}
        onDismissAutoSaveNotice={dismissAutoSaveNotice}
        fieldChangeDialog={fieldChangeDialog}
        fieldChangePrimaryAction={fieldChangeActiveRef.current?.dialog?.primaryAction === 'cancel' ? 'cancel' : 'confirm'}
        dedupDialogOpen={!!dedupDialogConflict}
        dedupDialogCopy={dedupDialogCopy}
        dedupDialogMessage={dedupDialogMessage}
        dedupDialogConfirmLabel={dedupDialogConfirmLabel}
        dedupDialogCancelLabel={dedupDialogCancelLabel}
        onDedupDialogCancel={handleDedupDialogCancel}
        onDedupDialogConfirm={handleDedupDialogConfirm}
        listDedupDialogOpen={!!listDedupPrompt}
        listDedupDialogMessage={listDedupDialogMessage}
        onListDedupDialogCancel={handleListDedupDialogCancel}
        onListDedupDialogConfirm={handleListDedupDialogConfirm}
        submitConfirmOpen={submitConfirmOpen}
        submitConfirmTitle={submitConfirmTitle}
        submitConfirmMessage={submitConfirmMessage}
        submitConfirmConfirmLabel={submitConfirmConfirmLabelResolved}
        submitConfirmCancelLabel={submitConfirmCancelLabelResolved}
        onSubmitConfirmCancel={cancelSubmitConfirm}
        onSubmitConfirm={confirmSubmit}
        systemActionGateDialog={systemActionGateDialog}
        onCloseSystemActionGateDialog={closeSystemActionGateDialog}
        copyCurrentRecordDialog={copyCurrentRecordDialog}
        onCloseCopyCurrentRecordDialog={closeCopyCurrentRecordDialog}
        submitPreparationBusy={submitPreparationBusy}
        submitBlockingTitle={submitBlockingTitle}
        destructiveChangeBusy={destructiveChangeBusy}
        guidedMilestoneBusy={guidedMilestoneBusy}
        guidedStepAdvanceBusy={guidedStepAdvanceBusy}
        uploadBusy={uploadBusy}
        copyRecordBusy={copyRecordBusy}
        recordSyncBusy={recordSyncBusy}
        customConfirm={customConfirm}
        updateRecordBusy={updateRecordBusy}
        navigateHomeBusy={navigateHomeBusy}
        reportOverlay={reportOverlay}
        onCloseReportOverlay={closeReportOverlay}
        readOnlyFilesOverlay={readOnlyFilesOverlay}
        onOpenReadOnlyFiles={openReadOnlyFilesOverlay}
        onCloseReadOnlyFilesOverlay={closeReadOnlyFilesOverlay}
        onDiagnostic={logEvent}
      />

      <AppActionBar
        position="bottom"
        commonProps={appActionBarCommonProps}
        notice={bottomBarNotice}
        showBackButton={showGuidedBack}
        backLabel={guidedBackLabel}
        backDisabled={guidedBackDisabled}
        onBack={() => formBackActionRef.current?.()}
      />
    </div>
  );
};

export default App;
