import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { LangCode, WebFormDefinition } from '../../../../types';
import type {
  BankAvailabilitySnapshot,
  BankUtilisationPlanRequest,
  BankUtilisationPlanResult,
  BankUtilisationPlanScope
} from '../../../../../types';
import {
  applyBankUtilisationPlanApi,
  resolveUserFacingErrorMessage
} from '../../../api';
import {
  resolveExistingRecordId,
  resolveUtilisationPlanSourceMetaAdoption
} from '../../../app/submission';
import type { LineItemState } from '../../../types';
import { buildUtilisationFailureMessage } from '../../../components/form/utilisationSyncPolicy';
import { applyBankAvailabilitySnapshotsToCachedDataSources } from '../availabilityCache';
import { resolveUtilisationDisplayLabelFromCachedDataSources } from '../displayLabel';
import {
  dispatchGuidedStepUtilisationAvailabilityEvent,
  scheduleGuidedStepUtilisationAvailabilityEvent,
  type GuidedStepUtilisationAvailabilityEventDetail
} from '../liveSyncEvents';
import { buildRejectedStepUtilisationEntries } from '../rejectedUtilisations';
import { issueUtilisationRequestEpoch, shouldApplyUtilisationPlanResponse } from '../utilisationResponsePolicy';
import {
  buildBankUtilisationPlanFingerprint,
  buildStepBankUtilisationPlan,
  resolveStepUtilisationConflictDialogConfig
} from '../stepUtilisationPlan';
import {
  shouldRefreshDataSourcesAfterUtilisationPlan,
  type GuidedUtilisationSyncFreshness
} from '../domain/utilisationSyncFreshness';
import { buildUtilisationConflictDialogCopy } from '../../../components/form/utilisationConflictDialog';

export type GuidedUtilisationSyncOutcome = {
  success: boolean;
  message?: string;
  recordId: string;
  stepId: string;
  sessionId: number;
  stale?: boolean;
  freshness?: GuidedUtilisationSyncFreshness | null;
};

export type GuidedUtilisationSyncMeta = {
  recordId: string;
  stepId: string;
  sessionId: number;
  status: 'running' | 'failed' | 'succeeded';
  fingerprint?: string;
  message?: string;
};

type UseGuidedUtilisationPlanSyncArgs = {
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  languageRef: React.MutableRefObject<LangCode>;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  utilisationManagedScopesRef: React.MutableRefObject<{
    recordId: string;
    scopes: BankUtilisationPlanScope[];
  } | null>;
  utilisationSyncEpochRef: React.MutableRefObject<number>;
  utilisationSyncMetaRef: React.MutableRefObject<GuidedUtilisationSyncMeta | null>;
  utilisationSyncPromiseRef: React.MutableRefObject<Promise<GuidedUtilisationSyncOutcome> | null>;
  recordSessionRef: React.MutableRefObject<number>;
  selectedRecordIdRef: React.MutableRefObject<string>;
  selectedRecordSnapshotRef: React.MutableRefObject<any>;
  lastSubmissionMetaRef: React.MutableRefObject<any>;
  guidedDataSourceConfigs: any[];
  applySuccessfulSubmissionState: (args: any) => void;
  getCurrentKnownClientDataVersion: () => number | null | undefined;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  markDataSourceFreshnessServerTouch: (args: { reason: string; stepId?: string }) => void;
  markRecordFreshnessServerTouch: (args: { reason: string; recordId?: string }) => void;
  openConfiguredConfirmDialog: (args: {
    dialog: any;
    kind: string;
    refId: string;
  }) => Promise<boolean>;
  refreshGuidedDataSourcesInBackground: (args: any) => void;
  resolveLogMessage: (err: unknown, fallback: string) => string;
  setRequestedGuidedStepId: (stepId: string | null) => void;
};

export const useGuidedUtilisationPlanSync = ({
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
}: UseGuidedUtilisationPlanSyncArgs) => {
  const resolveGuidedStepUtilisationPlan = React.useCallback(
    (args: {
      stepId: string;
      recordId: string;
      mode?: 'step' | 'all';
      snapshotLineItems?: LineItemState;
      previousManagedScopes?: BankUtilisationPlanScope[];
    }) =>
      buildStepBankUtilisationPlan({
        definition,
        stepId: args.stepId,
        formKey,
        recordId: args.recordId,
        lineItems: args.snapshotLineItems || lineItemsRef.current,
        mode: args.mode || 'all',
        previousManagedScopes: [
          ...(
            utilisationManagedScopesRef.current?.recordId === args.recordId
              ? utilisationManagedScopesRef.current.scopes
              : []
          ),
          ...(Array.isArray(args.previousManagedScopes) ? args.previousManagedScopes : [])
        ]
      }),
    [definition, formKey, lineItemsRef, utilisationManagedScopesRef]
  );

  const returnToStepAndApplyRejectedAvailability = React.useCallback(
    (args: {
      stepId: string;
      recordId: string;
      logPrefix: string;
      availability: BankAvailabilitySnapshot[];
      rejectedUtilisations: GuidedStepUtilisationAvailabilityEventDetail['rejectedUtilisations'];
    }): void => {
      const availability = Array.isArray(args.availability) ? args.availability.filter(Boolean) : [];
      const rejectedUtilisations = Array.isArray(args.rejectedUtilisations)
        ? args.rejectedUtilisations.filter(Boolean)
        : [];
      if (!availability.length) return;
      const detail: GuidedStepUtilisationAvailabilityEventDetail = {
        stepId: args.stepId,
        recordId: args.recordId,
        availability,
        rejectedUtilisations
      };
      setRequestedGuidedStepId(args.stepId || null);
      const scheduled = scheduleGuidedStepUtilisationAvailabilityEvent(detail);
      logEvent(`${args.logPrefix}.utilisationPlan.rejected.returnToStep`, {
        stepId: args.stepId,
        recordId: args.recordId,
        availability: availability.length,
        rejectedUtilisations: rejectedUtilisations.length,
        scheduled
      });
    },
    [logEvent, setRequestedGuidedStepId]
  );

  const resolveCurrentUtilisationRecordId = React.useCallback(
    () =>
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '',
    [lastSubmissionMetaRef, selectedRecordIdRef, selectedRecordSnapshotRef]
  );

  const shouldApplyGuidedUtilisationPlanResponse = React.useCallback(
    (args: { requestEpoch?: number; sessionId?: number; recordId: string }) =>
      shouldApplyUtilisationPlanResponse({
        requestEpoch: args.requestEpoch,
        latestEpoch: utilisationSyncEpochRef.current,
        requestSessionId: args.sessionId,
        currentSessionId: recordSessionRef.current,
        requestRecordId: args.recordId,
        currentRecordId: resolveCurrentUtilisationRecordId()
      }),
    [recordSessionRef, utilisationSyncEpochRef, resolveCurrentUtilisationRecordId]
  );

  const adoptGuidedStepUtilisationPlanResult = React.useCallback(
    async (args: {
      stepId: string;
      recordId: string;
      logPrefix: string;
      dialogKind: string;
      plan: BankUtilisationPlanRequest;
      utilisationResult: BankUtilisationPlanResult;
      requestEpoch?: number;
      sessionId?: number;
    }): Promise<{
      success: boolean;
      message?: string;
      applied: boolean;
      stale?: boolean;
      freshness?: GuidedUtilisationSyncFreshness | null;
    }> => {
      const responseIsCurrent = () =>
        shouldApplyGuidedUtilisationPlanResponse({
          requestEpoch: args.requestEpoch,
          sessionId: args.sessionId,
          recordId: args.recordId
        });
      const utilisationResult = args.utilisationResult || {
        success: false,
        message: tSystem('bank.utilisationUpdateFailed', languageRef.current, 'Failed to update the utilisation.')
      };
      if (!responseIsCurrent()) {
        logEvent(`${args.logPrefix}.utilisationPlan.response.stale`, {
          stepId: args.stepId,
          recordId: args.recordId,
          success: utilisationResult.success === true,
          requestEpoch: args.requestEpoch || null,
          latestEpoch: utilisationSyncEpochRef.current
        });
        return { success: true, applied: true, stale: true };
      }
      if (!utilisationResult.success) {
        const availability = Array.isArray(utilisationResult.availability)
          ? (utilisationResult.availability as BankAvailabilitySnapshot[]).filter(Boolean)
          : [];
        const rejectedUtilisations = buildRejectedStepUtilisationEntries({
          plan: args.plan,
          availability
        });
        if (availability.length) {
          const cacheSync = applyBankAvailabilitySnapshotsToCachedDataSources({
            dataSourceConfigs: guidedDataSourceConfigs,
            language,
            availability
          });
          logEvent(`${args.logPrefix}.utilisationPlan.rejected.cacheSync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            updatedRows: cacheSync.updatedRows,
            updatedDataSourceIds: cacheSync.updatedDataSourceIds,
            rejectedUtilisations: rejectedUtilisations.length
          });
        }
        const primaryAvailability =
          availability.length
            ? (availability[0] as BankAvailabilitySnapshot)
            : null;
        const conflictDialogConfig = utilisationResult.conflict === true
          ? resolveStepUtilisationConflictDialogConfig({
              definition,
              stepId: args.stepId,
              resourceFormKey: primaryAvailability?.resourceFormKey
            })
          : null;
        const conflictDialog = utilisationResult.conflict === true
          ? buildUtilisationConflictDialogCopy({
              language,
              dialog: conflictDialogConfig,
              availability: primaryAvailability,
              requestedQuantity: Number((args.plan?.utilisations || [])[0]?.quantity) || 0,
              itemId: primaryAvailability?.resourceItemId,
              itemLabel: resolveUtilisationDisplayLabelFromCachedDataSources({
                dataSourceConfigs: guidedDataSourceConfigs,
                language,
                availability: primaryAvailability
              }),
              fallbackTitle: '',
              fallbackMessage: tSystem(
                'bank.utilisationAvailabilityChanged',
                languageRef.current,
                'Leftover availability changed review new availability before continuing'
              ),
              fallbackConfirmLabel: tSystem('common.ok', languageRef.current, 'OK'),
              fallbackCancelLabel: tSystem('common.cancel', languageRef.current, 'Cancel')
            })
          : null;
        const message = conflictDialog
          ? conflictDialog.message
          : buildUtilisationFailureMessage(
              resolveUserFacingErrorMessage(
                utilisationResult,
                utilisationResult.message ||
                  tSystem('bank.utilisationUpdateFailed', languageRef.current, 'Failed to update the utilisation.')
              ) || '',
              tSystem('bank.utilisationUpdateFailed', languageRef.current, 'Failed to update the utilisation.'),
              tSystem(
                'bank.utilisationUpdateFailedDetail',
                languageRef.current,
                "We couldn't update the utilisation properly. Please try again."
              ),
              {
                availability: primaryAvailability,
                itemId: primaryAvailability?.resourceItemId,
                itemLabel: resolveUtilisationDisplayLabelFromCachedDataSources({
                  dataSourceConfigs: guidedDataSourceConfigs,
                  language,
                  availability: primaryAvailability
                })
              }
            );
        logEvent(`${args.logPrefix}.utilisationPlan.failed`, {
          stepId: args.stepId,
          recordId: args.recordId,
          message,
          conflict: utilisationResult.conflict === true
        });
        await openConfiguredConfirmDialog({
          dialog: {
            title: conflictDialog ? conflictDialog.title : tSystem('common.notice', languageRef.current, 'Notice'),
            message,
            confirmLabel: conflictDialog?.confirmLabel || tSystem('common.ok', languageRef.current, 'OK'),
            cancelLabel: conflictDialog?.cancelLabel,
            showCancel: conflictDialog ? conflictDialog.showCancel : false,
            showCloseButton: conflictDialog ? conflictDialog.showCloseButton : true,
            dismissOnBackdrop: conflictDialog ? conflictDialog.dismissOnBackdrop : true,
            primaryAction: conflictDialog?.primaryAction
          },
          kind: `${args.dialogKind}.utilisationPlan`,
          refId: args.stepId
        });
        returnToStepAndApplyRejectedAvailability({
          stepId: args.stepId,
          recordId: args.recordId,
          logPrefix: args.logPrefix,
          availability,
          rejectedUtilisations
        });
        return { success: false, message, applied: true };
      }
      logEvent(`${args.logPrefix}.utilisationPlan.done`, {
        stepId: args.stepId,
        recordId: args.recordId,
        utilisationsApplied: utilisationResult.utilisationsApplied || 0,
        utilisationsReleased: utilisationResult.utilisationsReleased || 0
      });
      const adoptedSourceMeta = resolveUtilisationPlanSourceMetaAdoption({
        result: utilisationResult,
        currentRecordId: args.recordId,
        currentDataVersion: getCurrentKnownClientDataVersion(),
        fallbackRecordId: args.recordId
      });
      if (adoptedSourceMeta) {
        applySuccessfulSubmissionState({
          recordId: args.recordId,
          response: { meta: adoptedSourceMeta }
        });
        logEvent(`${args.logPrefix}.utilisationPlan.sourceMeta.sync`, {
          stepId: args.stepId,
          recordId: args.recordId,
          dataVersion: adoptedSourceMeta.dataVersion || null,
          rowNumber: adoptedSourceMeta.rowNumber || null
        });
      } else {
        logEvent(`${args.logPrefix}.utilisationPlan.sourceMeta.skip`, {
          stepId: args.stepId,
          recordId: args.recordId,
          matched: utilisationResult.sourceClientDataVersionMatched === true,
          sourceDataVersion: Number(utilisationResult.sourceRecordMeta?.dataVersion) || null,
          currentDataVersion: getCurrentKnownClientDataVersion() || null
        });
      }
      markRecordFreshnessServerTouch({ reason: 'record.utilisationPlan', recordId: args.recordId });
      markDataSourceFreshnessServerTouch({ reason: 'datasource.utilisationPlan', stepId: args.stepId });
      const availability = Array.isArray(utilisationResult.availability)
        ? (utilisationResult.availability as BankAvailabilitySnapshot[]).filter(Boolean)
        : [];
      let availabilityCacheUpdatedRows = 0;
      let availabilityCacheUpdatedDataSourceIds: string[] = [];
      if (availability.length) {
        const cacheSync = applyBankAvailabilitySnapshotsToCachedDataSources({
          dataSourceConfigs: guidedDataSourceConfigs,
          language,
          availability
        });
        availabilityCacheUpdatedRows = cacheSync.updatedRows;
        availabilityCacheUpdatedDataSourceIds = cacheSync.updatedDataSourceIds;
        logEvent(`${args.logPrefix}.utilisationPlan.cacheSync`, {
          stepId: args.stepId,
          recordId: args.recordId,
          updatedRows: cacheSync.updatedRows,
          updatedDataSourceIds: cacheSync.updatedDataSourceIds
        });
      }
      if (
        shouldRefreshDataSourcesAfterUtilisationPlan({
          availabilityCount: availability.length,
          updatedRows: availabilityCacheUpdatedRows,
          utilisationsReleased: Number(utilisationResult.utilisationsReleased || 0)
        })
      ) {
        refreshGuidedDataSourcesInBackground({
          reason: `${args.logPrefix}.utilisationPlan.refresh`,
          forceRefresh: true,
          retryDelaysMs: [0, 1500]
        });
      }
      if (availability.length) {
        const detail: GuidedStepUtilisationAvailabilityEventDetail = {
          stepId: args.stepId,
          recordId: args.recordId,
          availability
        };
        dispatchGuidedStepUtilisationAvailabilityEvent(detail);
      }
      utilisationManagedScopesRef.current = {
        recordId: args.recordId,
        scopes: Array.isArray(args.plan.managedScopes) ? args.plan.managedScopes.slice() : []
      };
      const freshness =
        availability.length > 0 && availabilityCacheUpdatedRows > 0 && availabilityCacheUpdatedDataSourceIds.length > 0
          ? {
              recordId: args.recordId,
              stepId: args.stepId,
              dataSourceIds: availabilityCacheUpdatedDataSourceIds,
              updatedRows: availabilityCacheUpdatedRows,
              availabilityCount: availability.length,
              completedAtMs: Date.now(),
              source: args.logPrefix
            }
          : null;
      return { success: true, applied: true, freshness };
    },
    [
      applySuccessfulSubmissionState,
      getCurrentKnownClientDataVersion,
      returnToStepAndApplyRejectedAvailability,
      guidedDataSourceConfigs,
      definition,
      language,
      languageRef,
      logEvent,
      markDataSourceFreshnessServerTouch,
      markRecordFreshnessServerTouch,
      openConfiguredConfirmDialog,
      refreshGuidedDataSourcesInBackground,
      utilisationManagedScopesRef,
      utilisationSyncEpochRef,
      shouldApplyGuidedUtilisationPlanResponse
    ]
  );

  const applyGuidedStepUtilisationPlan = React.useCallback(
    async (args: {
      stepId: string;
      recordId: string;
      logPrefix: string;
      dialogKind: string;
      plan?: BankUtilisationPlanRequest | null;
      requestEpoch?: number;
      sessionId?: number;
    }): Promise<{
      success: boolean;
      message?: string;
      applied: boolean;
      stale?: boolean;
      freshness?: GuidedUtilisationSyncFreshness | null;
    }> => {
      const utilisationPlan = args.plan ?? resolveGuidedStepUtilisationPlan({
        stepId: args.stepId,
        recordId: args.recordId
      });
      if (!utilisationPlan) {
        return { success: true, applied: false };
      }
      const responseIsCurrent = () =>
        shouldApplyGuidedUtilisationPlanResponse({
          requestEpoch: args.requestEpoch,
          sessionId: args.sessionId,
          recordId: args.recordId
        });
      if (!responseIsCurrent()) {
        logEvent(`${args.logPrefix}.utilisationPlan.skipped.staleBeforeRequest`, {
          stepId: args.stepId,
          recordId: args.recordId,
          requestEpoch: args.requestEpoch || null,
          latestEpoch: utilisationSyncEpochRef.current
        });
        return { success: true, applied: false, stale: true };
      }
      try {
        logEvent(`${args.logPrefix}.utilisationPlan.begin`, {
          stepId: args.stepId,
          recordId: args.recordId,
          utilisations: utilisationPlan.utilisations?.length || 0,
          managedScopes: utilisationPlan.managedScopes?.length || 0
        });
        const utilisationResult = await applyBankUtilisationPlanApi({
          ...utilisationPlan,
          clientDataVersion: getCurrentKnownClientDataVersion() || undefined
        });
        return adoptGuidedStepUtilisationPlanResult({
          stepId: args.stepId,
          recordId: args.recordId,
          logPrefix: args.logPrefix,
          dialogKind: args.dialogKind,
          plan: utilisationPlan,
          utilisationResult,
          requestEpoch: args.requestEpoch,
          sessionId: args.sessionId
        });
      } catch (err: any) {
        if (!responseIsCurrent()) {
          logEvent(`${args.logPrefix}.utilisationPlan.exception.stale`, {
            stepId: args.stepId,
            recordId: args.recordId,
            requestEpoch: args.requestEpoch || null,
            latestEpoch: utilisationSyncEpochRef.current,
            message: resolveLogMessage(err, 'Stale utilisation plan response ignored.')
          });
          return { success: true, applied: true, stale: true };
        }
        const availability = Array.isArray((err as any)?.availability)
          ? ((err as any).availability as BankAvailabilitySnapshot[]).filter(Boolean)
          : ((err as any)?.availability ? [((err as any).availability as BankAvailabilitySnapshot)] : []);
        const rejectedUtilisations = buildRejectedStepUtilisationEntries({
          plan: utilisationPlan,
          availability
        });
        if (availability.length) {
          const cacheSync = applyBankAvailabilitySnapshotsToCachedDataSources({
            dataSourceConfigs: guidedDataSourceConfigs,
            language,
            availability
          });
          logEvent(`${args.logPrefix}.utilisationPlan.exception.cacheSync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            updatedRows: cacheSync.updatedRows,
            updatedDataSourceIds: cacheSync.updatedDataSourceIds,
            rejectedUtilisations: rejectedUtilisations.length
          });
        }
        const primaryAvailability = availability.length
          ? (availability[0] as BankAvailabilitySnapshot)
          : null;
        const conflictDialogConfig = (err as any)?.conflict === true
          ? resolveStepUtilisationConflictDialogConfig({
              definition,
              stepId: args.stepId,
              resourceFormKey: primaryAvailability?.resourceFormKey
            })
          : null;
        const conflictDialog = (err as any)?.conflict === true
          ? buildUtilisationConflictDialogCopy({
              language,
              dialog: conflictDialogConfig,
              availability: primaryAvailability,
              requestedQuantity: Number((utilisationPlan?.utilisations || [])[0]?.quantity) || 0,
              itemId: primaryAvailability?.resourceItemId,
              itemLabel: resolveUtilisationDisplayLabelFromCachedDataSources({
                dataSourceConfigs: guidedDataSourceConfigs,
                language,
                availability: primaryAvailability
              }),
              fallbackTitle: '',
              fallbackMessage: tSystem(
                'bank.utilisationAvailabilityChanged',
                languageRef.current,
                'Leftover availability changed review new availability before continuing'
              ),
              fallbackConfirmLabel: tSystem('common.ok', languageRef.current, 'OK'),
              fallbackCancelLabel: tSystem('common.cancel', languageRef.current, 'Cancel')
            })
          : null;
        const message = conflictDialog
          ? conflictDialog.message
          : buildUtilisationFailureMessage(
              resolveUserFacingErrorMessage(
                err,
                tSystem('bank.utilisationUpdateFailed', languageRef.current, 'Failed to update the utilisation.')
              ) || '',
              tSystem('bank.utilisationUpdateFailed', languageRef.current, 'Failed to update the utilisation.'),
              tSystem(
                'bank.utilisationUpdateFailedDetail',
                languageRef.current,
                "We couldn't update the utilisation properly. Please try again."
              ),
              {
                availability: primaryAvailability,
                itemId: primaryAvailability?.resourceItemId,
                itemLabel: resolveUtilisationDisplayLabelFromCachedDataSources({
                  dataSourceConfigs: guidedDataSourceConfigs,
                  language,
                  availability: primaryAvailability
                })
              }
            );
        logEvent(`${args.logPrefix}.utilisationPlan.exception`, {
          stepId: args.stepId,
          recordId: args.recordId,
          message: resolveLogMessage(err, message)
        });
        await openConfiguredConfirmDialog({
          dialog: {
            title: conflictDialog ? conflictDialog.title : tSystem('common.notice', languageRef.current, 'Notice'),
            message,
            confirmLabel: conflictDialog?.confirmLabel || tSystem('common.ok', languageRef.current, 'OK'),
            cancelLabel: conflictDialog?.cancelLabel,
            showCancel: conflictDialog ? conflictDialog.showCancel : false,
            showCloseButton: conflictDialog ? conflictDialog.showCloseButton : true,
            dismissOnBackdrop: conflictDialog ? conflictDialog.dismissOnBackdrop : true,
            primaryAction: conflictDialog?.primaryAction
          },
          kind: `${args.dialogKind}.utilisationPlan`,
          refId: args.stepId
        });
        returnToStepAndApplyRejectedAvailability({
          stepId: args.stepId,
          recordId: args.recordId,
          logPrefix: args.logPrefix,
          availability,
          rejectedUtilisations
        });
        return { success: false, message, applied: true };
      }
    },
    [
      adoptGuidedStepUtilisationPlanResult,
      getCurrentKnownClientDataVersion,
      guidedDataSourceConfigs,
      definition,
      language,
      languageRef,
      logEvent,
      openConfiguredConfirmDialog,
      returnToStepAndApplyRejectedAvailability,
      utilisationSyncEpochRef,
      resolveGuidedStepUtilisationPlan,
      resolveLogMessage,
      shouldApplyGuidedUtilisationPlanResponse
    ]
  );

  const queueGuidedStepUtilisationPlan = React.useCallback(
    (args: {
      stepId: string;
      recordId: string;
      plan: BankUtilisationPlanRequest;
      logPrefix: string;
      dialogKind: string;
      requestEpoch?: number;
    }): Promise<GuidedUtilisationSyncOutcome> => {
      const sessionId = recordSessionRef.current;
      const fingerprint = buildBankUtilisationPlanFingerprint(args.plan);
      if (
        fingerprint &&
        utilisationSyncMetaRef.current?.recordId === args.recordId &&
        utilisationSyncMetaRef.current?.fingerprint === fingerprint
      ) {
        if (utilisationSyncMetaRef.current.status === 'running' && utilisationSyncPromiseRef.current) {
          return utilisationSyncPromiseRef.current;
        }
        if (utilisationSyncMetaRef.current.status === 'succeeded') {
          return Promise.resolve({
            success: true,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          });
        }
      }
      const providedRequestEpoch = Number(args.requestEpoch);
      const requestEpoch = Number.isFinite(providedRequestEpoch) && providedRequestEpoch > 0
        ? providedRequestEpoch
        : issueUtilisationRequestEpoch(utilisationSyncEpochRef.current);
      utilisationSyncEpochRef.current = Math.max(utilisationSyncEpochRef.current, requestEpoch);
      utilisationSyncMetaRef.current = {
        recordId: args.recordId,
        stepId: args.stepId,
        sessionId,
        status: 'running',
        fingerprint
      };
      const run = async () => {
        const result = await applyGuidedStepUtilisationPlan({
          stepId: args.stepId,
          recordId: args.recordId,
          logPrefix: args.logPrefix,
          dialogKind: args.dialogKind,
          plan: args.plan,
          requestEpoch,
          sessionId
        });
        const outcome: GuidedUtilisationSyncOutcome = {
          success: result.success,
          message: result.message,
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId,
          stale: result.stale || undefined,
          freshness: result.freshness || null
        };
        if (result.stale) {
          logEvent(`${args.logPrefix}.utilisationPlan.outcome.stale`, {
            stepId: args.stepId,
            recordId: args.recordId,
            requestEpoch,
            latestEpoch: utilisationSyncEpochRef.current
          });
          return outcome;
        }
        utilisationSyncMetaRef.current = {
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId,
          status: result.success ? 'succeeded' : 'failed',
          fingerprint,
          message: result.message
        };
        if (result.success) {
          utilisationManagedScopesRef.current = {
            recordId: args.recordId,
            scopes: Array.isArray(args.plan.managedScopes) ? args.plan.managedScopes.slice() : []
          };
        }
        if (!result.success) {
          const sameSession = recordSessionRef.current === sessionId;
          const sameRecord = (selectedRecordIdRef.current || '').toString().trim() === args.recordId;
          if (sameSession && sameRecord) {
            setRequestedGuidedStepId(args.stepId || null);
          }
        }
        return outcome;
      };

      const prior = utilisationSyncPromiseRef.current;
      let next: Promise<GuidedUtilisationSyncOutcome>;
      next = (prior
        ? prior.catch(() => ({
            success: false,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          }))
        : Promise.resolve({
            success: true,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          })
      )
        .then(run)
        .finally(() => {
          if (utilisationSyncPromiseRef.current === next) {
            utilisationSyncPromiseRef.current = null;
          }
        });
      markDataSourceFreshnessServerTouch({
        reason: `${args.logPrefix}.utilisationPlan.queued`,
        stepId: args.stepId
      });
      utilisationSyncPromiseRef.current = next;
      return next;
    },
    [
      applyGuidedStepUtilisationPlan,
      logEvent,
      markDataSourceFreshnessServerTouch,
      recordSessionRef,
      utilisationManagedScopesRef,
      utilisationSyncEpochRef,
      utilisationSyncMetaRef,
      utilisationSyncPromiseRef,
      selectedRecordIdRef,
      setRequestedGuidedStepId
    ]
  );

  return {
    adoptGuidedStepUtilisationPlanResult,
    resolveGuidedStepUtilisationPlan,
    queueGuidedStepUtilisationPlan
  };
};
