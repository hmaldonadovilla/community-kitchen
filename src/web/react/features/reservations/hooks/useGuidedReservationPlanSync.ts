import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { LangCode, WebFormDefinition } from '../../../../types';
import type {
  InventoryAvailabilitySnapshot,
  InventoryReservationPlanRequest,
  InventoryReservationPlanScope
} from '../../../../../types';
import {
  applyInventoryReservationPlanApi,
  resolveUserFacingErrorMessage
} from '../../../api';
import {
  resolveExistingRecordId,
  resolveReservationPlanSourceMetaAdoption
} from '../../../app/submission';
import type { LineItemState } from '../../../types';
import { buildReservationFailureMessage } from '../../../components/form/reservationSyncPolicy';
import { applyInventoryAvailabilitySnapshotsToCachedDataSources } from '../availabilityCache';
import { resolveReservationDisplayLabelFromCachedDataSources } from '../displayLabel';
import {
  GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
  type GuidedStepReservationAvailabilityEventDetail
} from '../liveSyncEvents';
import { buildRejectedStepReservationEntries } from '../rejectedReservations';
import { shouldApplyReservationPlanResponse } from '../reservationResponsePolicy';
import {
  buildInventoryReservationPlanFingerprint,
  buildStepInventoryReservationPlan
} from '../stepReservationPlan';

export type GuidedReservationSyncOutcome = {
  success: boolean;
  message?: string;
  recordId: string;
  stepId: string;
  sessionId: number;
  stale?: boolean;
};

export type GuidedReservationSyncMeta = {
  recordId: string;
  stepId: string;
  sessionId: number;
  status: 'running' | 'failed' | 'succeeded';
  fingerprint?: string;
  message?: string;
};

type UseGuidedReservationPlanSyncArgs = {
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  languageRef: React.MutableRefObject<LangCode>;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  reservationManagedScopesRef: React.MutableRefObject<{
    recordId: string;
    scopes: InventoryReservationPlanScope[];
  } | null>;
  reservationSyncEpochRef: React.MutableRefObject<number>;
  reservationSyncMetaRef: React.MutableRefObject<GuidedReservationSyncMeta | null>;
  reservationSyncPromiseRef: React.MutableRefObject<Promise<GuidedReservationSyncOutcome> | null>;
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

export const useGuidedReservationPlanSync = ({
  definition,
  formKey,
  language,
  languageRef,
  lineItemsRef,
  reservationManagedScopesRef,
  reservationSyncEpochRef,
  reservationSyncMetaRef,
  reservationSyncPromiseRef,
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
}: UseGuidedReservationPlanSyncArgs) => {
  const resolveGuidedStepReservationPlan = React.useCallback(
    (args: {
      stepId: string;
      recordId: string;
      mode?: 'step' | 'all';
      snapshotLineItems?: LineItemState;
    }) =>
      buildStepInventoryReservationPlan({
        definition,
        stepId: args.stepId,
        formKey,
        recordId: args.recordId,
        lineItems: args.snapshotLineItems || lineItemsRef.current,
        mode: args.mode || 'all',
        previousManagedScopes:
          reservationManagedScopesRef.current?.recordId === args.recordId
            ? reservationManagedScopesRef.current.scopes
            : []
      }),
    [definition, formKey, lineItemsRef, reservationManagedScopesRef]
  );

  const resolveCurrentReservationRecordId = React.useCallback(
    () =>
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '',
    [lastSubmissionMetaRef, selectedRecordIdRef, selectedRecordSnapshotRef]
  );

  const shouldApplyGuidedReservationPlanResponse = React.useCallback(
    (args: { requestEpoch?: number; sessionId?: number; recordId: string }) =>
      shouldApplyReservationPlanResponse({
        requestEpoch: args.requestEpoch,
        latestEpoch: reservationSyncEpochRef.current,
        requestSessionId: args.sessionId,
        currentSessionId: recordSessionRef.current,
        requestRecordId: args.recordId,
        currentRecordId: resolveCurrentReservationRecordId()
      }),
    [recordSessionRef, reservationSyncEpochRef, resolveCurrentReservationRecordId]
  );

  const applyGuidedStepReservationPlan = React.useCallback(
    async (args: {
      stepId: string;
      recordId: string;
      logPrefix: string;
      dialogKind: string;
      plan?: InventoryReservationPlanRequest | null;
      requestEpoch?: number;
      sessionId?: number;
    }): Promise<{ success: boolean; message?: string; applied: boolean; stale?: boolean }> => {
      const reservationPlan = args.plan ?? resolveGuidedStepReservationPlan({
        stepId: args.stepId,
        recordId: args.recordId
      });
      if (!reservationPlan) {
        return { success: true, applied: false };
      }
      const responseIsCurrent = () =>
        shouldApplyGuidedReservationPlanResponse({
          requestEpoch: args.requestEpoch,
          sessionId: args.sessionId,
          recordId: args.recordId
        });
      if (!responseIsCurrent()) {
        logEvent(`${args.logPrefix}.reservationPlan.skipped.staleBeforeRequest`, {
          stepId: args.stepId,
          recordId: args.recordId,
          requestEpoch: args.requestEpoch || null,
          latestEpoch: reservationSyncEpochRef.current
        });
        return { success: true, applied: false, stale: true };
      }
      try {
        logEvent(`${args.logPrefix}.reservationPlan.begin`, {
          stepId: args.stepId,
          recordId: args.recordId,
          reservations: reservationPlan.reservations?.length || 0,
          managedScopes: reservationPlan.managedScopes?.length || 0
        });
        const reservationResult = await applyInventoryReservationPlanApi({
          ...reservationPlan,
          clientDataVersion: getCurrentKnownClientDataVersion() || undefined
        });
        if (!responseIsCurrent()) {
          logEvent(`${args.logPrefix}.reservationPlan.response.stale`, {
            stepId: args.stepId,
            recordId: args.recordId,
            success: reservationResult.success === true,
            requestEpoch: args.requestEpoch || null,
            latestEpoch: reservationSyncEpochRef.current
          });
          return { success: true, applied: true, stale: true };
        }
        if (!reservationResult.success) {
          const availability = Array.isArray(reservationResult.availability)
            ? (reservationResult.availability as InventoryAvailabilitySnapshot[]).filter(Boolean)
            : [];
          const rejectedReservations = buildRejectedStepReservationEntries({
            plan: reservationPlan,
            availability
          });
          if (availability.length) {
            const cacheSync = applyInventoryAvailabilitySnapshotsToCachedDataSources({
              dataSourceConfigs: guidedDataSourceConfigs,
              language,
              availability
            });
            logEvent(`${args.logPrefix}.reservationPlan.rejected.cacheSync`, {
              stepId: args.stepId,
              recordId: args.recordId,
              updatedRows: cacheSync.updatedRows,
              updatedDataSourceIds: cacheSync.updatedDataSourceIds,
              rejectedReservations: rejectedReservations.length
            });
            if (
              typeof window !== 'undefined' &&
              typeof window.dispatchEvent === 'function' &&
              typeof CustomEvent === 'function'
            ) {
              const detail: GuidedStepReservationAvailabilityEventDetail = {
                stepId: args.stepId,
                recordId: args.recordId,
                availability,
                rejectedReservations
              };
              window.dispatchEvent(
                new CustomEvent<GuidedStepReservationAvailabilityEventDetail>(
                  GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
                  { detail }
                )
              );
            }
          }
          const primaryAvailability =
            availability.length
              ? (availability[0] as InventoryAvailabilitySnapshot)
              : null;
          const message = buildReservationFailureMessage(
            resolveUserFacingErrorMessage(
              reservationResult,
              reservationResult.message ||
                tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.')
            ) || '',
            tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.'),
            tSystem(
              'inventory.reservationUpdateFailedDetail',
              languageRef.current,
              "We couldn't update the reservation properly. Please try again."
            ),
            {
              availability: primaryAvailability,
              itemId: primaryAvailability?.resourceItemId,
              itemLabel: resolveReservationDisplayLabelFromCachedDataSources({
                dataSourceConfigs: guidedDataSourceConfigs,
                language,
                availability: primaryAvailability
              })
            }
          );
          logEvent(`${args.logPrefix}.reservationPlan.failed`, {
            stepId: args.stepId,
            recordId: args.recordId,
            message,
            conflict: reservationResult.conflict === true
          });
          await openConfiguredConfirmDialog({
            dialog: {
              title: tSystem('common.notice', languageRef.current, 'Notice'),
              message,
              confirmLabel: tSystem('common.ok', languageRef.current, 'OK'),
              showCancel: false,
              showCloseButton: true,
              dismissOnBackdrop: true
            },
            kind: `${args.dialogKind}.reservationPlan`,
            refId: args.stepId
          });
          return { success: false, message, applied: true };
        }
        logEvent(`${args.logPrefix}.reservationPlan.done`, {
          stepId: args.stepId,
          recordId: args.recordId,
          reservationsApplied: reservationResult.reservationsApplied || 0,
          reservationsReleased: reservationResult.reservationsReleased || 0
        });
        const adoptedSourceMeta = resolveReservationPlanSourceMetaAdoption({
          result: reservationResult,
          currentRecordId: args.recordId,
          currentDataVersion: getCurrentKnownClientDataVersion(),
          fallbackRecordId: args.recordId
        });
        if (adoptedSourceMeta) {
          applySuccessfulSubmissionState({
            recordId: args.recordId,
            response: { meta: adoptedSourceMeta }
          });
          logEvent(`${args.logPrefix}.reservationPlan.sourceMeta.sync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            dataVersion: adoptedSourceMeta.dataVersion || null,
            rowNumber: adoptedSourceMeta.rowNumber || null
          });
        } else {
          logEvent(`${args.logPrefix}.reservationPlan.sourceMeta.skip`, {
            stepId: args.stepId,
            recordId: args.recordId,
            matched: reservationResult.sourceClientDataVersionMatched === true,
            sourceDataVersion: Number(reservationResult.sourceRecordMeta?.dataVersion) || null,
            currentDataVersion: getCurrentKnownClientDataVersion() || null
          });
        }
        markRecordFreshnessServerTouch({ reason: 'record.reservationPlan', recordId: args.recordId });
        markDataSourceFreshnessServerTouch({ reason: 'datasource.reservationPlan', stepId: args.stepId });
        const availability = Array.isArray(reservationResult.availability)
          ? (reservationResult.availability as InventoryAvailabilitySnapshot[]).filter(Boolean)
          : [];
        let availabilityCacheUpdatedRows = 0;
        if (availability.length) {
          const cacheSync = applyInventoryAvailabilitySnapshotsToCachedDataSources({
            dataSourceConfigs: guidedDataSourceConfigs,
            language,
            availability
          });
          availabilityCacheUpdatedRows = cacheSync.updatedRows;
          logEvent(`${args.logPrefix}.reservationPlan.cacheSync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            updatedRows: cacheSync.updatedRows,
            updatedDataSourceIds: cacheSync.updatedDataSourceIds
          });
        }
        if (
          Number(reservationResult.reservationsReleased || 0) > 0 ||
          (availability.length > 0 && availabilityCacheUpdatedRows <= 0)
        ) {
          refreshGuidedDataSourcesInBackground({
            reason: `${args.logPrefix}.reservationPlan.refresh`,
            forceRefresh: true,
            retryDelaysMs: [0, 1500]
          });
        }
        if (
          availability.length &&
          typeof window !== 'undefined' &&
          typeof window.dispatchEvent === 'function' &&
          typeof CustomEvent === 'function'
        ) {
          const detail: GuidedStepReservationAvailabilityEventDetail = {
            stepId: args.stepId,
            recordId: args.recordId,
            availability
          };
          window.dispatchEvent(
            new CustomEvent<GuidedStepReservationAvailabilityEventDetail>(
              GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
              { detail }
            )
          );
        }
        return { success: true, applied: true };
      } catch (err: any) {
        if (!responseIsCurrent()) {
          logEvent(`${args.logPrefix}.reservationPlan.exception.stale`, {
            stepId: args.stepId,
            recordId: args.recordId,
            requestEpoch: args.requestEpoch || null,
            latestEpoch: reservationSyncEpochRef.current,
            message: resolveLogMessage(err, 'Stale reservation plan response ignored.')
          });
          return { success: true, applied: true, stale: true };
        }
        const availability = Array.isArray((err as any)?.availability)
          ? ((err as any).availability as InventoryAvailabilitySnapshot[]).filter(Boolean)
          : ((err as any)?.availability ? [((err as any).availability as InventoryAvailabilitySnapshot)] : []);
        const rejectedReservations = buildRejectedStepReservationEntries({
          plan: reservationPlan,
          availability
        });
        if (availability.length) {
          const cacheSync = applyInventoryAvailabilitySnapshotsToCachedDataSources({
            dataSourceConfigs: guidedDataSourceConfigs,
            language,
            availability
          });
          logEvent(`${args.logPrefix}.reservationPlan.exception.cacheSync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            updatedRows: cacheSync.updatedRows,
            updatedDataSourceIds: cacheSync.updatedDataSourceIds,
            rejectedReservations: rejectedReservations.length
          });
          if (
            typeof window !== 'undefined' &&
            typeof window.dispatchEvent === 'function' &&
            typeof CustomEvent === 'function'
          ) {
            const detail: GuidedStepReservationAvailabilityEventDetail = {
              stepId: args.stepId,
              recordId: args.recordId,
              availability,
              rejectedReservations
            };
            window.dispatchEvent(
              new CustomEvent<GuidedStepReservationAvailabilityEventDetail>(
                GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
                { detail }
              )
            );
          }
        }
        const primaryAvailability = availability.length
          ? (availability[0] as InventoryAvailabilitySnapshot)
          : null;
        const message = buildReservationFailureMessage(
          resolveUserFacingErrorMessage(
            err,
            tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.')
          ) || '',
          tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.'),
          tSystem(
            'inventory.reservationUpdateFailedDetail',
            languageRef.current,
            "We couldn't update the reservation properly. Please try again."
          ),
          {
            availability: primaryAvailability,
            itemId: primaryAvailability?.resourceItemId,
            itemLabel: resolveReservationDisplayLabelFromCachedDataSources({
              dataSourceConfigs: guidedDataSourceConfigs,
              language,
              availability: primaryAvailability
            })
          }
        );
        logEvent(`${args.logPrefix}.reservationPlan.exception`, {
          stepId: args.stepId,
          recordId: args.recordId,
          message: resolveLogMessage(err, message)
        });
        await openConfiguredConfirmDialog({
          dialog: {
            title: tSystem('common.notice', languageRef.current, 'Notice'),
            message,
            confirmLabel: tSystem('common.ok', languageRef.current, 'OK'),
            showCancel: false,
            showCloseButton: true,
            dismissOnBackdrop: true
          },
          kind: `${args.dialogKind}.reservationPlan`,
          refId: args.stepId
        });
        return { success: false, message, applied: true };
      }
    },
    [
      applySuccessfulSubmissionState,
      getCurrentKnownClientDataVersion,
      guidedDataSourceConfigs,
      language,
      languageRef,
      logEvent,
      markDataSourceFreshnessServerTouch,
      markRecordFreshnessServerTouch,
      openConfiguredConfirmDialog,
      refreshGuidedDataSourcesInBackground,
      reservationSyncEpochRef,
      resolveGuidedStepReservationPlan,
      resolveLogMessage,
      shouldApplyGuidedReservationPlanResponse
    ]
  );

  const queueGuidedStepReservationPlan = React.useCallback(
    (args: {
      stepId: string;
      recordId: string;
      plan: InventoryReservationPlanRequest;
      logPrefix: string;
      dialogKind: string;
    }): Promise<GuidedReservationSyncOutcome> => {
      const sessionId = recordSessionRef.current;
      const fingerprint = buildInventoryReservationPlanFingerprint(args.plan);
      if (
        fingerprint &&
        reservationSyncMetaRef.current?.recordId === args.recordId &&
        reservationSyncMetaRef.current?.fingerprint === fingerprint
      ) {
        if (reservationSyncMetaRef.current.status === 'running' && reservationSyncPromiseRef.current) {
          return reservationSyncPromiseRef.current;
        }
        if (reservationSyncMetaRef.current.status === 'succeeded') {
          return Promise.resolve({
            success: true,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          });
        }
      }
      const requestEpoch = reservationSyncEpochRef.current + 1;
      reservationSyncEpochRef.current = requestEpoch;
      reservationSyncMetaRef.current = {
        recordId: args.recordId,
        stepId: args.stepId,
        sessionId,
        status: 'running',
        fingerprint
      };
      const run = async () => {
        const result = await applyGuidedStepReservationPlan({
          stepId: args.stepId,
          recordId: args.recordId,
          logPrefix: args.logPrefix,
          dialogKind: args.dialogKind,
          plan: args.plan,
          requestEpoch,
          sessionId
        });
        const outcome: GuidedReservationSyncOutcome = {
          success: result.success,
          message: result.message,
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId,
          stale: result.stale || undefined
        };
        if (result.stale) {
          logEvent(`${args.logPrefix}.reservationPlan.outcome.stale`, {
            stepId: args.stepId,
            recordId: args.recordId,
            requestEpoch,
            latestEpoch: reservationSyncEpochRef.current
          });
          return outcome;
        }
        reservationSyncMetaRef.current = {
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId,
          status: result.success ? 'succeeded' : 'failed',
          fingerprint,
          message: result.message
        };
        if (result.success) {
          reservationManagedScopesRef.current = {
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

      const prior = reservationSyncPromiseRef.current;
      let next: Promise<GuidedReservationSyncOutcome>;
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
          if (reservationSyncPromiseRef.current === next) {
            reservationSyncPromiseRef.current = null;
          }
        });
      markDataSourceFreshnessServerTouch({
        reason: `${args.logPrefix}.reservationPlan.queued`,
        stepId: args.stepId
      });
      reservationSyncPromiseRef.current = next;
      return next;
    },
    [
      applyGuidedStepReservationPlan,
      logEvent,
      markDataSourceFreshnessServerTouch,
      recordSessionRef,
      reservationManagedScopesRef,
      reservationSyncEpochRef,
      reservationSyncMetaRef,
      reservationSyncPromiseRef,
      selectedRecordIdRef,
      setRequestedGuidedStepId
    ]
  );

  return {
    resolveGuidedStepReservationPlan,
    queueGuidedStepReservationPlan
  };
};
