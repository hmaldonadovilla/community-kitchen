import React from 'react';

import type { QrScanSessionLaunchResult } from '../../../../../types';
import { normalizeLanguage } from '../../../../core';
import type { FieldValue, LangCode, WebFormSubmission } from '../../../../types';
import { createQrScanSessionLaunchApi } from '../../../api';
import { resolveExistingRecordId } from '../../../app/submission';
import type { LineItemState } from '../../../types';
import type { UploadedFieldValueOverride } from '../domain/uploadedFieldOverrides';
import type { EndQrScannerInteraction, QrScannerCommittedUpdate } from '../qrScannerTypes';

export type QrScannerSubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

type EnsureDraftRecordId = (args?: {
  reason?: string;
  fieldPath?: string;
}) => Promise<{ success: boolean; recordId?: string; message?: string }>;

type FlushPendingDraftSave = (reason: string) => Promise<{ ok: boolean; message?: string }>;

type CreateQrScannerSessionLaunch = typeof createQrScanSessionLaunchApi;

type UpsertListCacheRow = (args: {
  recordId: string;
  values?: Record<string, any>;
  dataVersion?: number | null;
}) => void;

export interface UseQrScannerAppIntegrationArgs {
  formKey: string;
  languageRef: React.MutableRefObject<LangCode>;
  ensureDraftRecordId: EnsureDraftRecordId;
  flushPendingDraftSave: FlushPendingDraftSave;
  createSessionLaunch?: CreateQrScannerSessionLaunch;
  logEvent: DiagnosticLogger;
  resolveLogMessage: (error: unknown, fallback: string) => string;
  resolveUiErrorMessage: (error: unknown, fallback: string) => string | null;
  setAutoSaveHoldFromUi: (hold: boolean, meta?: { reason?: string }) => void;
  scheduleLatestAutoSave: (reason: string, delayMs: number) => number | null;
  autoSaveDirtyRef: React.MutableRefObject<boolean>;
  autoSaveQueuedRef: React.MutableRefObject<boolean>;
  autoSaveTimerRef: React.MutableRefObject<number | null>;
  selectedRecordIdRef: React.MutableRefObject<string>;
  selectedRecordSnapshotRef: React.MutableRefObject<WebFormSubmission | null>;
  lastSubmissionMetaRef: React.MutableRefObject<QrScannerSubmissionMeta | null>;
  valuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  uploadedFieldValueOverridesRef: React.MutableRefObject<Map<string, UploadedFieldValueOverride>>;
  recordDataVersionRef: React.MutableRefObject<number | null>;
  optimisticClientDataVersionRef: React.MutableRefObject<number | null>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  setSelectedRecordSnapshot: React.Dispatch<React.SetStateAction<WebFormSubmission | null>>;
  setLastSubmissionMeta: React.Dispatch<React.SetStateAction<QrScannerSubmissionMeta | null>>;
  rememberAutoSaveSeenState: (values: Record<string, FieldValue>, lineItems: LineItemState) => void;
  upsertListCacheRow: UpsertListCacheRow;
  markRecordFreshnessServerTouch: (args: { reason: string; recordId?: string | null }) => void;
}

const serviceUnavailableResult = (message: string): QrScanSessionLaunchResult => ({
  success: false,
  code: 'SERVICE_UNAVAILABLE',
  message,
  retryable: true
});

/**
 * Owns the app-side lifecycle required by the external QR scanner while App.tsx
 * remains a composition shell. Scanner-window messaging stays in the dedicated
 * external-scanner hook; this hook only coordinates the retained form state.
 */
export const useQrScannerAppIntegration = (args: UseQrScannerAppIntegrationArgs) => {
  const {
    formKey,
    languageRef,
    ensureDraftRecordId,
    flushPendingDraftSave,
    createSessionLaunch = createQrScanSessionLaunchApi,
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
  } = args;

  const prepareQrScannerLaunch = React.useCallback(
    async (request: { fieldId: string; fieldPath: string }): Promise<QrScanSessionLaunchResult> => {
      const startedAt = Date.now();
      logEvent('qrScanner.session.prepare.start', {
        fieldId: request.fieldId,
        fieldPath: request.fieldPath
      });
      try {
        const ensured = await ensureDraftRecordId({
          reason: 'qrScanner.prepare',
          fieldPath: request.fieldPath
        });
        if (!ensured.success || !ensured.recordId) {
          return {
            success: false,
            code: 'RECORD_NOT_FOUND',
            message: ensured.message || 'Save the form before starting the scanner.'
          };
        }

        const flushed = await flushPendingDraftSave('qrScanner.prepare');
        if (!flushed.ok) {
          return serviceUnavailableResult(flushed.message || 'The latest form changes could not be saved.');
        }

        const expectedDataVersion = Number(recordDataVersionRef.current);
        const launch = await createSessionLaunch({
          formKey,
          recordId: ensured.recordId,
          fieldId: request.fieldId,
          ...(Number.isSafeInteger(expectedDataVersion) && expectedDataVersion > 0
            ? { expectedDataVersion }
            : {}),
          language: normalizeLanguage(languageRef.current) as 'EN' | 'FR' | 'NL',
          returnContext: { overlay: 'files' }
        });
        logEvent('qrScanner.session.prepare.done', {
          fieldId: request.fieldId,
          fieldPath: request.fieldPath,
          success: launch.success,
          code: launch.success ? null : launch.code,
          elapsedMs: Date.now() - startedAt
        });
        return launch;
      } catch (error) {
        logEvent('qrScanner.session.prepare.error', {
          fieldId: request.fieldId,
          fieldPath: request.fieldPath,
          message: resolveLogMessage(error, 'Scanner session preparation failed.'),
          elapsedMs: Date.now() - startedAt
        });
        return serviceUnavailableResult(
          resolveUiErrorMessage(error, 'The scanner service is temporarily unavailable. Try again.') ||
            'The scanner service is temporarily unavailable. Try again.'
        );
      }
    },
    [
      createSessionLaunch,
      ensureDraftRecordId,
      flushPendingDraftSave,
      formKey,
      languageRef,
      logEvent,
      recordDataVersionRef,
      resolveLogMessage,
      resolveUiErrorMessage
    ]
  );

  const handleQrScannerSessionReady = React.useCallback(() => {
    setAutoSaveHoldFromUi(true, { reason: 'qrScannerSession' });
  }, [setAutoSaveHoldFromUi]);

  const handleQrScannerSessionEnd = React.useCallback(
    (reason: Parameters<EndQrScannerInteraction>[0]) => {
      setAutoSaveHoldFromUi(false, { reason: 'qrScannerSession' });
      if (autoSaveDirtyRef.current || autoSaveQueuedRef.current) {
        scheduleLatestAutoSave(`qrScanner.${reason}.release`, 0);
      }
      logEvent('qrScanner.session.ended', { reason });
    },
    [autoSaveDirtyRef, autoSaveQueuedRef, logEvent, scheduleLatestAutoSave, setAutoSaveHoldFromUi]
  );

  const applyQrScannerCommittedUpdate = React.useCallback(
    (update: QrScannerCommittedUpdate): void => {
      const activeRecordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      if (!activeRecordId || activeRecordId !== update.recordId) {
        logEvent('qrScanner.commit.detached', {
          recordId: update.recordId,
          activeRecordId: activeRecordId || null,
          fieldId: update.fieldId
        });
        return;
      }

      const incomingDataVersion = Number(update.dataVersion);
      const currentDataVersion = Number(recordDataVersionRef.current);
      if (
        Number.isFinite(incomingDataVersion) &&
        incomingDataVersion > 0 &&
        Number.isFinite(currentDataVersion) &&
        currentDataVersion > incomingDataVersion
      ) {
        logEvent('qrScanner.update.staleIgnored', {
          recordId: update.recordId,
          fieldId: update.fieldId,
          incomingDataVersion,
          currentDataVersion
        });
        return;
      }

      const hadPendingAutoSave = autoSaveDirtyRef.current || autoSaveQueuedRef.current;
      const nextValues: Record<string, FieldValue> = {
        ...valuesRef.current,
        [update.fieldId]: update.fieldValue
      };
      valuesRef.current = nextValues;
      setValues(nextValues);
      uploadedFieldValueOverridesRef.current.set(update.fieldPath || update.fieldId, {
        scope: 'top',
        questionId: update.fieldId,
        items: update.links
      });

      const nextDataVersion = incomingDataVersion;
      if (Number.isFinite(nextDataVersion) && nextDataVersion > 0) {
        recordDataVersionRef.current = nextDataVersion;
        optimisticClientDataVersionRef.current = nextDataVersion;
      }

      if (!hadPendingAutoSave) {
        autoSaveDirtyRef.current = false;
        autoSaveQueuedRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        rememberAutoSaveSeenState(nextValues, lineItemsRef.current);
      }

      const patchSnapshot = (snapshot: WebFormSubmission | null): WebFormSubmission | null => {
        if (!snapshot || snapshot.id !== update.recordId) return snapshot;
        return {
          ...snapshot,
          ...(Number.isFinite(nextDataVersion) && nextDataVersion > 0 ? { dataVersion: nextDataVersion } : {}),
          values: {
            ...((snapshot.values || {}) as Record<string, any>),
            [update.fieldId]: update.fieldValue
          }
        } as WebFormSubmission;
      };
      selectedRecordSnapshotRef.current = patchSnapshot(selectedRecordSnapshotRef.current);
      setSelectedRecordSnapshot(previous => patchSnapshot(previous));
      lastSubmissionMetaRef.current = {
        ...(lastSubmissionMetaRef.current || { id: update.recordId }),
        id: update.recordId,
        ...(Number.isFinite(nextDataVersion) && nextDataVersion > 0 ? { dataVersion: nextDataVersion } : {})
      };
      setLastSubmissionMeta(previous => ({
        ...(previous || { id: update.recordId }),
        id: update.recordId,
        ...(Number.isFinite(nextDataVersion) && nextDataVersion > 0 ? { dataVersion: nextDataVersion } : {})
      }));
      upsertListCacheRow({
        recordId: update.recordId,
        values: { [update.fieldId]: update.fieldValue },
        dataVersion: Number.isFinite(nextDataVersion) && nextDataVersion > 0 ? nextDataVersion : undefined
      });
      markRecordFreshnessServerTouch({ reason: 'qrScanner.commit', recordId: update.recordId });
      logEvent('qrScanner.commit.applied', {
        recordId: update.recordId,
        fieldId: update.fieldId,
        linkedCount: update.linkedCount,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : null,
        preservedPendingAutoSave: hadPendingAutoSave
      });
    },
    [
      autoSaveDirtyRef,
      autoSaveQueuedRef,
      autoSaveTimerRef,
      lastSubmissionMetaRef,
      lineItemsRef,
      logEvent,
      markRecordFreshnessServerTouch,
      optimisticClientDataVersionRef,
      recordDataVersionRef,
      rememberAutoSaveSeenState,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      setLastSubmissionMeta,
      setSelectedRecordSnapshot,
      setValues,
      uploadedFieldValueOverridesRef,
      upsertListCacheRow,
      valuesRef
    ]
  );

  return {
    prepareQrScannerLaunch,
    handleQrScannerSessionReady,
    handleQrScannerSessionEnd,
    applyQrScannerCommittedUpdate
  };
};
