import React from 'react';
import type { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../../types';
import type { AnalyticsSnapshot } from '../../../types';
import type { LineItemState, OptionState, View } from '../../types';
import FormView from '../FormView';
import ListView from '../ListView';
import { AppRecordLoadingPlaceholder } from './AppRecordLoadingPlaceholder';
import { SummaryView } from './SummaryView';
import type {
  ApplyQrScannerCommittedUpdate,
  BeginQrScannerInteraction,
  EndQrScannerInteraction,
  PrepareQrScannerLaunch
} from '../../features/uploads/qrScannerTypes';

interface AppMainViewsProps {
  view: View;
  formKey: string;
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  errors: any;
  submitting: boolean;
  updateRecordBusyOpen: boolean;
  recordSyncBusyOpen: boolean;
  guidedMilestoneBusyOpen: boolean;
  isClosedRecord: boolean;
  recordLoadingId: string | null;
  recordStale: unknown;
  showFormRecordLoadingPlaceholder: boolean;
  recordLoadError: string | null;
  recordSessionKey: number | string;
  dedupTriggerFieldIdMap: Record<string, true>;
  setValuesFromFormView: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setLineItemsFromFormView: React.Dispatch<React.SetStateAction<LineItemState>>;
  handleSubmit: any;
  formSubmitActionRef: React.MutableRefObject<(() => void) | null>;
  formBackActionRef: React.MutableRefObject<(() => void) | null>;
  formNavigateToFieldRef: React.MutableRefObject<((fieldKey: string) => void) | null>;
  setErrors: React.Dispatch<React.SetStateAction<any>>;
  status: string | null;
  statusLevel: 'info' | 'success' | 'error' | null;
  formRecordMeta: any;
  validationWarnings: { top: Array<{ message: string; fieldPath: string }>; byField: Record<string, string[]> };
  clearStatus: () => void;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  ensureOptions: any;
  ensureLineOptions: any;
  externalScrollAnchor: string | null;
  setExternalScrollAnchor: React.Dispatch<React.SetStateAction<string | null>>;
  runSelectionEffects: any;
  selectionEffectAsyncPendingCount: number;
  uploadFieldUrls: any;
  prepareQrScannerLaunch?: PrepareQrScannerLaunch;
  onQrScannerSessionReady?: BeginQrScannerInteraction;
  onQrScannerSessionEnd?: EndQrScannerInteraction;
  onQrScannerCommitted?: ApplyQrScannerCommittedUpdate;
  handleCustomButton: any;
  handleReportButtonPointerDown: any;
  reportOverlay: any;
  handleUserEdit: any;
  handleAutomatedMutation: any;
  setFormIsValid: React.Dispatch<React.SetStateAction<boolean>>;
  setGuidedUiState: React.Dispatch<React.SetStateAction<any>>;
  handleGuidedStepMilestone: any;
  requestedGuidedStepId: string | null;
  guidedExternalSyncSignal: any;
  setRequestedGuidedStepId: React.Dispatch<React.SetStateAction<string | null>>;
  dedupNavigationBlocked: boolean;
  submitDisabledByGate: boolean;
  customConfirm: any;
  setAutoSaveHoldFromUi: any;
  summarySubmitIntentRef: React.MutableRefObject<boolean>;
  ensureDraftRecordId: any;
  queueGuidedStepUtilisationDraftSync: any;
  handleGuidedStepUtilisationDraftStateChange: any;
  waitForGuidedStepUtilisationDraftSync: any;
  waitForPendingSharedDataMutations: any;
  handleBeforeGuidedStepAdvance: any;
  lastSubmissionMeta: any;
  selectedRecordId: string;
  currentRecord: WebFormSubmission | null;
  prefetchedSummaryHtml: { recordId: string; html: string } | null;
  openReadOnlyFilesOverlay: any;
  analyticsSnapshot: AnalyticsSnapshot | null;
  analyticsSnapshotRev?: number | null;
  precreateDedupChecking: boolean;
  listCache: any;
  listRefreshToken: number;
  listFetch: any;
  listFetchNotice: string | null;
  listLegendItems: any[];
  listLegendColumns: number;
  listLegendColumnWidths: [number, number] | null;
  handleRecordSelect: any;
  handleReadListViewDateSearchCache: any;
  handleListViewCache: any;
  preservedListSearchState: { inputValue?: string; queryValue?: string } | null;
  handlePreservedListSearchStateChange: (state: { inputValue: string; queryValue: string } | null) => void;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}

export const AppMainViews: React.FC<AppMainViewsProps> = ({
  view,
  formKey,
  definition,
  language,
  values,
  lineItems,
  optionState,
  errors,
  submitting,
  updateRecordBusyOpen,
  recordSyncBusyOpen,
  guidedMilestoneBusyOpen,
  isClosedRecord,
  recordLoadingId,
  recordStale,
  showFormRecordLoadingPlaceholder,
  recordLoadError,
  recordSessionKey,
  dedupTriggerFieldIdMap,
  setValuesFromFormView,
  setLineItemsFromFormView,
  handleSubmit,
  formSubmitActionRef,
  formBackActionRef,
  formNavigateToFieldRef,
  setErrors,
  status,
  statusLevel,
  formRecordMeta,
  validationWarnings,
  clearStatus,
  setOptionState,
  ensureOptions,
  ensureLineOptions,
  externalScrollAnchor,
  setExternalScrollAnchor,
  runSelectionEffects,
  selectionEffectAsyncPendingCount,
  uploadFieldUrls,
  prepareQrScannerLaunch,
  onQrScannerSessionReady,
  onQrScannerSessionEnd,
  onQrScannerCommitted,
  handleCustomButton,
  handleReportButtonPointerDown,
  reportOverlay,
  handleUserEdit,
  handleAutomatedMutation,
  setFormIsValid,
  setGuidedUiState,
  handleGuidedStepMilestone,
  requestedGuidedStepId,
  guidedExternalSyncSignal,
  setRequestedGuidedStepId,
  dedupNavigationBlocked,
  submitDisabledByGate,
  customConfirm,
  setAutoSaveHoldFromUi,
  summarySubmitIntentRef,
  ensureDraftRecordId,
  queueGuidedStepUtilisationDraftSync,
  handleGuidedStepUtilisationDraftStateChange,
  waitForGuidedStepUtilisationDraftSync,
  waitForPendingSharedDataMutations,
  handleBeforeGuidedStepAdvance,
  lastSubmissionMeta,
  selectedRecordId,
  currentRecord,
  prefetchedSummaryHtml,
  openReadOnlyFilesOverlay,
  analyticsSnapshot,
  analyticsSnapshotRev,
  precreateDedupChecking,
  listCache,
  listRefreshToken,
  listFetch,
  listFetchNotice,
  listLegendItems,
  listLegendColumns,
  listLegendColumnWidths,
  handleRecordSelect,
  handleReadListViewDateSearchCache,
  handleListViewCache,
  preservedListSearchState,
  handlePreservedListSearchStateChange,
  logEvent
}) => (
  <>
    {view === 'form' && showFormRecordLoadingPlaceholder ? (
      <AppRecordLoadingPlaceholder language={language} error={recordLoadError} />
    ) : null}

    {view === 'form' && !showFormRecordLoadingPlaceholder ? (
      <FormView
        key={`record-session:${recordSessionKey}`}
        formKey={formKey}
        definition={definition}
        dedupKeyFieldIdMap={dedupTriggerFieldIdMap}
        language={language}
        values={values}
        setValues={setValuesFromFormView}
        lineItems={lineItems}
        setLineItems={setLineItemsFromFormView}
        onSubmit={handleSubmit}
        submitActionRef={formSubmitActionRef}
        guidedBackActionRef={formBackActionRef}
        navigateToFieldRef={formNavigateToFieldRef}
        submitting={
          submitting ||
          updateRecordBusyOpen ||
          recordSyncBusyOpen ||
          guidedMilestoneBusyOpen ||
          isClosedRecord ||
          Boolean(recordLoadingId) ||
          Boolean(recordStale)
        }
        errors={errors}
        setErrors={setErrors}
        status={status}
        statusTone={statusLevel}
        recordMeta={formRecordMeta}
        warningTop={validationWarnings.top}
        warningByField={validationWarnings.byField}
        showWarningsBanner={false}
        onStatusClear={clearStatus}
        optionState={optionState}
        setOptionState={setOptionState}
        ensureOptions={ensureOptions}
        ensureLineOptions={ensureLineOptions}
        externalScrollAnchor={externalScrollAnchor}
        onExternalScrollConsumed={() => setExternalScrollAnchor(null)}
        onSelectionEffect={runSelectionEffects}
        selectionEffectAsyncPendingCount={selectionEffectAsyncPendingCount}
        onUploadFiles={uploadFieldUrls}
        prepareQrScannerLaunch={prepareQrScannerLaunch}
        onQrScannerSessionReady={onQrScannerSessionReady}
        onQrScannerSessionEnd={onQrScannerSessionEnd}
        onQrScannerCommitted={onQrScannerCommitted}
        onReportButton={handleCustomButton}
        onReportButtonPointerDown={handleReportButtonPointerDown}
        reportBusy={reportOverlay.pdfPhase === 'rendering'}
        reportBusyId={reportOverlay.buttonId || null}
        onUserEdit={handleUserEdit}
        onAutomatedMutation={handleAutomatedMutation}
        onDiagnostic={logEvent}
        onFormValidityChange={setFormIsValid}
        onGuidedUiChange={setGuidedUiState}
        onGuidedStepMilestone={handleGuidedStepMilestone}
        requestedGuidedStepId={requestedGuidedStepId}
        guidedExternalSyncSignal={guidedExternalSyncSignal}
        recordSessionId={recordSessionKey as number}
        onRequestedGuidedStepHandled={() => setRequestedGuidedStepId(null)}
        dedupNavigationBlocked={dedupNavigationBlocked}
        guidedForwardNavigationBlocked={submitDisabledByGate}
        openConfirmDialog={customConfirm.openConfirm}
        setAutoSaveHold={setAutoSaveHoldFromUi}
        summarySubmitIntentRef={summarySubmitIntentRef}
        ensureRecordId={ensureDraftRecordId}
        queueGuidedStepUtilisationDraftSync={queueGuidedStepUtilisationDraftSync}
        onGuidedStepUtilisationDraftStateChange={handleGuidedStepUtilisationDraftStateChange}
        waitForGuidedStepUtilisationDraftSync={waitForGuidedStepUtilisationDraftSync}
        waitForPendingSharedDataMutations={waitForPendingSharedDataMutations}
        onBeforeGuidedStepAdvance={handleBeforeGuidedStepAdvance}
      />
    ) : null}

    {view === 'summary' && (
      <SummaryView
        definition={definition}
        formKey={formKey}
        language={language}
        values={values}
        lineItems={lineItems}
        lastSubmissionMeta={lastSubmissionMeta}
        recordLoadError={recordLoadError}
        selectedRecordId={selectedRecordId}
        recordLoadingId={recordLoadingId}
        currentRecord={currentRecord}
        prefetchedSummaryHtml={prefetchedSummaryHtml?.recordId === selectedRecordId ? prefetchedSummaryHtml.html : null}
        onOpenFiles={openReadOnlyFilesOverlay}
        onAction={(actionId, context) =>
          handleCustomButton(actionId, {
            source: 'htmlTemplate',
            runtimeValues: context?.values
          })
        }
        onDiagnostic={logEvent}
      />
    )}
    {view === 'list' && (
      <ListView
        formKey={formKey}
        definition={definition}
        language={language}
        analyticsSnapshot={analyticsSnapshot || undefined}
        analyticsRevision={analyticsSnapshotRev ?? undefined}
        disabled={precreateDedupChecking}
        cachedResponse={listCache.response}
        cachedRecords={listCache.records}
        refreshToken={listRefreshToken}
        onDiagnostic={logEvent}
        autoFetch={false}
        loading={listFetch.phase === 'loading'}
        prefetching={listFetch.phase === 'prefetching'}
        notice={listFetchNotice}
        error={listFetch.phase === 'error' ? (listFetch.message || 'Failed to load list.') : null}
        legendItems={listLegendItems}
        legendColumns={listLegendColumns}
        legendColumnWidths={listLegendColumnWidths}
        onReadDateSearchCache={handleReadListViewDateSearchCache}
        onCache={handleListViewCache}
        preservedSearchState={preservedListSearchState}
        onPreservedSearchStateChange={handlePreservedListSearchStateChange}
        onSelect={handleRecordSelect}
      />
    )}
  </>
);
