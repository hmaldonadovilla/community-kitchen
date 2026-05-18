import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { resolveLocalizedString, resolveOptionalLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../../types';
import {
  applyUpdateRecordWithDependenciesApi,
  previewUpdateRecordDependenciesApi,
  resolveUserFacingErrorMessage
} from '../../api';
import { buildDraftPayload, resolveExistingRecordId } from '../../app/submission';
import { runUpdateRecordAction } from '../../features/customActions/updateRecord/runUpdateRecordAction';
import type { LineItemState, View } from '../../types';
import { resolveLabel } from '../../utils/labels';

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

/**
 * Owner: App shell.
 * Executes configured update-record custom buttons, including optional
 * confirmation, dependency preview, mutation submission, and busy-state wiring.
 */
export const useUpdateRecordButtonAction = (args: {
  definition: WebFormDefinition;
  formKey: string;
  customConfirm: any;
  updateRecordBusy: any;
  updateRecordActionInFlightRef: MutableRefObject<boolean>;
  languageRef: MutableRefObject<LangCode>;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  selectedRecordIdRef: MutableRefObject<string>;
  selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
  lastSubmissionMetaRef: MutableRefObject<SubmissionMeta | null>;
  recordDataVersionRef: MutableRefObject<number | null>;
  recordRowNumberRef: MutableRefObject<number | null>;
  recordSessionRef: MutableRefObject<number>;
  uploadQueueRef: MutableRefObject<Map<string, any>>;
  autoSaveInFlightRef: MutableRefObject<boolean>;
  recordStaleRef: MutableRefObject<any>;
  ensureDraftRecordIdActionRef: MutableRefObject<((args?: { reason?: string; fieldPath?: string }) => Promise<any>) | null>;
  flushPendingDraftSaveActionRef: MutableRefObject<((reason: string) => Promise<any>) | null>;
  submitCurrentRecordMutation: (reason: string, payload: any, submitter?: (payload: any) => Promise<any>) => Promise<any>;
  waitForActiveDraftSaveTransactions: (reason: string) => Promise<any>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  perfMark: (name: string) => void;
  perfMeasure: (name: string, startMark: string, endMark: string, detail?: Record<string, unknown>) => void;
  setDraftSave: Dispatch<SetStateAction<{ phase: DraftSavePhase; message?: string; updatedAt?: string }>>;
  setStatus: Dispatch<SetStateAction<string | null>>;
  setStatusLevel: Dispatch<SetStateAction<'info' | 'success' | 'error' | null>>;
  setLastSubmissionMeta: Dispatch<SetStateAction<SubmissionMeta | null>>;
  setSelectedRecordSnapshot: Dispatch<SetStateAction<WebFormSubmission | null>>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setView: Dispatch<SetStateAction<View>>;
  upsertListCacheRow: (...upsertArgs: any[]) => any;
  synchronizeStaleRecord: (...syncArgs: any[]) => any;
}) => {
  const {
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
  } = args;

  return useCallback(
    (actionArgs: {
      buttonId: string;
      baseId: string;
      qIdx?: number;
      btn: any;
      cfg: any;
      skipConfirm?: boolean;
      runtimeValues?: Record<string, any>;
    }) => {
      const { buttonId, baseId, qIdx, btn, cfg, skipConfirm = false, runtimeValues } = actionArgs;
      const configuredSetObj = (cfg?.set || cfg?.patch || cfg?.update || {}) as any;
      const runtimeValuePatch =
        runtimeValues && typeof runtimeValues === 'object' && !Array.isArray(runtimeValues) ? (runtimeValues as Record<string, any>) : null;
      const setObj = runtimeValuePatch
        ? {
            ...(configuredSetObj || {}),
            values: {
              ...((configuredSetObj || {}).values || {}),
              ...runtimeValuePatch
            }
          }
        : configuredSetObj;
      const dependencyGuardCfg = (cfg?.dependencyGuard || null) as any;
      const navigateToRaw = (cfg?.navigateTo || cfg?.targetView || cfg?.openView || 'auto').toString().trim().toLowerCase();
      const navigateTo =
        navigateToRaw === 'form' || navigateToRaw === 'summary' || navigateToRaw === 'list' || navigateToRaw === 'auto'
          ? (navigateToRaw as 'auto' | 'form' | 'summary' | 'list')
          : 'auto';
      const confirmCfg = (cfg?.confirm || cfg?.confirmation || null) as any;
      const confirmMessage = confirmCfg ? resolveLocalizedString(confirmCfg?.message, languageRef.current, '').toString().trim() : '';
      const confirmTitle = confirmCfg
        ? resolveOptionalLocalizedString(confirmCfg?.title, languageRef.current, tSystem('common.confirm', languageRef.current, 'Confirm'))
            .toString()
            .trim()
        : '';
      const confirmLabel = confirmCfg
        ? resolveLocalizedString(confirmCfg?.confirmLabel, languageRef.current, '').toString().trim()
        : '';
      const cancelLabel = confirmCfg
        ? resolveLocalizedString(confirmCfg?.cancelLabel, languageRef.current, '').toString().trim()
        : '';
      const progressDialog = (cfg?.progressDialog || cfg?.waitDialog || null) as any;

      const run = (submitMode: 'default' | 'dependencyGuard' = 'default') => {
        if (updateRecordActionInFlightRef.current) {
          logEvent('button.updateRecord.blocked.inFlightGuard', { buttonId: baseId, qIdx: qIdx ?? null });
          return;
        }
        const busyTitle =
          progressDialog && Object.prototype.hasOwnProperty.call(progressDialog, 'title')
            ? resolveOptionalLocalizedString(progressDialog.title, languageRef.current, '').toString()
            : btn
              ? resolveLabel(btn, languageRef.current)
              : (baseId || '');
        const busyMessage = progressDialog
          ? resolveLocalizedString(progressDialog.message, languageRef.current, '').toString().trim()
          : '';
        updateRecordActionInFlightRef.current = true;
        const pipelineStartMark = `ck.updateRecord.pipeline.start.${Date.now()}`;
        perfMark(pipelineStartMark);
        void runUpdateRecordAction(
          {
            definition,
            formKey,
            submit: (payload: any) => submitCurrentRecordMutation('button.updateRecord', payload),
            submitWithDependencies: (payload: any) =>
              submitCurrentRecordMutation('button.updateRecord.dependencyGuard', payload, (nextPayload: any) =>
                applyUpdateRecordWithDependenciesApi(nextPayload as any, buttonId)
              ),
            ensureRecordId: (ensureArgs?: { reason?: string; fieldPath?: string }) =>
              ensureDraftRecordIdActionRef.current
                ? ensureDraftRecordIdActionRef.current(ensureArgs)
                : Promise.resolve({
                    success: false,
                    message: tSystem('actions.noRecordSelected', languageRef.current, 'No record selected.')
                  }),
            flushPendingDraftSave: (reason: string) =>
              flushPendingDraftSaveActionRef.current
                ? flushPendingDraftSaveActionRef.current(reason)
                : Promise.resolve({ ok: true }),
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
            synchronizeStaleRecord,
            busy: updateRecordBusy
          } as any,
          {
            buttonId: baseId,
            buttonRef: buttonId,
            qIdx: qIdx,
            navigateTo,
            set: setObj as any,
            ensureRecordId: cfg?.ensureRecordId === true,
            busyTitle,
            busyMessage,
            submitMode
          }
        )
          .catch(() => {
            // runUpdateRecordAction reports failures through UI/logs; guard reset happens in finally below.
          })
          .finally(() => {
            updateRecordActionInFlightRef.current = false;
            const pipelineEndMark = `ck.updateRecord.pipeline.end.${Date.now()}`;
            perfMark(pipelineEndMark);
            perfMeasure('ck.updateRecord.pipeline', pipelineStartMark, pipelineEndMark, {
              buttonId: baseId,
              qIdx: qIdx ?? null
            });
          });
      };

      const runDefaultFlow = () => {
        if (confirmMessage && !skipConfirm) {
          const title = confirmTitle;
          const okLabel = confirmLabel || tSystem('common.confirm', languageRef.current, 'Confirm');
          const cancel = cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel');
          customConfirm.openConfirm({
            title,
            message: confirmMessage,
            confirmLabel: okLabel,
            cancelLabel: cancel,
            kind: 'updateRecord',
            refId: buttonId,
            primaryAction: confirmCfg?.primaryAction,
            showCancel: confirmCfg?.showCancel,
            showConfirm: confirmCfg?.showConfirm,
            showCloseButton: confirmCfg?.showCloseButton,
            dismissOnBackdrop: confirmCfg?.dismissOnBackdrop,
            onConfirm: () => run('default')
          });
          logEvent('button.updateRecord.confirm.open', { buttonId: baseId, qIdx: qIdx ?? null, navigateTo });
          return;
        }

        run('default');
      };

      if (!dependencyGuardCfg) {
        runDefaultFlow();
        return;
      }

      const busyTitle = btn ? resolveLabel(btn, languageRef.current) : (baseId || '');
      const previewSeq = updateRecordBusy.lock({
        title: busyTitle || tSystem('common.loading', languageRef.current, 'Loading...'),
        message: tSystem('common.loading', languageRef.current, 'Loading...'),
        kind: 'updateRecord.dependencyPreview',
        diagnosticMeta: { buttonId: baseId, qIdx: qIdx ?? null }
      });
      logEvent('button.updateRecord.dependencyPreview.start', {
        buttonId: baseId,
        qIdx: qIdx ?? null,
        targetFormKey: dependencyGuardCfg?.targetFormKey || null
      });

      void (async () => {
        try {
          const existingRecordId = resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          });
          const draft = buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: valuesRef.current,
            lineItems: lineItemsRef.current,
            existingRecordId
          }) as any;
          const metaSource: any = selectedRecordSnapshotRef.current || lastSubmissionMetaRef.current || null;
          if (metaSource?.status !== undefined && metaSource?.status !== null) draft.status = metaSource.status;
          if (metaSource?.createdAt !== undefined && metaSource?.createdAt !== null) draft.createdAt = metaSource.createdAt;
          if (metaSource?.updatedAt !== undefined && metaSource?.updatedAt !== null) draft.updatedAt = metaSource.updatedAt;
          if (metaSource?.pdfUrl !== undefined && metaSource?.pdfUrl !== null) draft.pdfUrl = metaSource.pdfUrl;

          const preview = await previewUpdateRecordDependenciesApi(draft, buttonId);
          if (!preview?.success) {
            const msg = (preview?.message || 'Failed to check dependent records.').toString();
            setStatus(msg);
            setStatusLevel('error');
            logEvent('button.updateRecord.dependencyPreview.error', {
              buttonId: baseId,
              qIdx: qIdx ?? null,
              message: msg
            });
            return;
          }

          const impactedCount = Number(preview.impactedCount || 0);
          logEvent('button.updateRecord.dependencyPreview.ok', {
            buttonId: baseId,
            qIdx: qIdx ?? null,
            impactedCount,
            targetFormKey: preview.targetFormKey || null
          });

          if (impactedCount > 0) {
            const dialog = (preview.dialog || { title: undefined, message: '', confirmLabel: '', cancelLabel: '' }) as any;
            const hasDialogTitle = Boolean(dialog && Object.prototype.hasOwnProperty.call(dialog, 'title'));
            const blocked = preview.blocked === true || preview.mode === 'block';
            customConfirm.openConfirm({
              title: hasDialogTitle
                ? (dialog.title ?? '').toString().trim()
                : tSystem('common.confirm', languageRef.current, 'Confirm'),
              message: dialog.message || '',
              confirmLabel: dialog.confirmLabel || (blocked ? 'OK' : tSystem('common.confirm', languageRef.current, 'Confirm')),
              cancelLabel: dialog.cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel'),
              primaryAction: dialog.primaryAction,
              showCancel: blocked ? dialog.showCancel === true : dialog.showCancel,
              showConfirm: dialog.showConfirm,
              dismissOnBackdrop: dialog.dismissOnBackdrop,
              showCloseButton: dialog.showCloseButton,
              kind: blocked ? 'updateRecord.dependencyBlock' : 'updateRecord.dependencyGuard',
              refId: buttonId,
              onConfirm: () => {
                if (blocked) return;
                run('dependencyGuard');
              }
            });
            logEvent(blocked ? 'button.updateRecord.dependencyBlock.open' : 'button.updateRecord.dependencyConfirm.open', {
              buttonId: baseId,
              qIdx: qIdx ?? null,
              impactedCount,
              targetFormKey: preview.targetFormKey || null
            });
            return;
          }

          runDefaultFlow();
        } catch (err: any) {
          const msg = resolveUserFacingErrorMessage(err, 'Failed to check dependent records.') || 'Failed to check dependent records.';
          setStatus(msg);
          setStatusLevel('error');
          logEvent('button.updateRecord.dependencyPreview.exception', {
            buttonId: baseId,
            qIdx: qIdx ?? null,
            message: (err?.message || err?.toString?.() || msg).toString()
          });
        } finally {
          updateRecordBusy.unlock(previewSeq, { buttonId: baseId, qIdx: qIdx ?? null });
        }
      })();
    },
    [
      autoSaveInFlightRef,
      customConfirm,
      definition,
      ensureDraftRecordIdActionRef,
      flushPendingDraftSaveActionRef,
      formKey,
      languageRef,
      lastSubmissionMetaRef,
      lineItemsRef,
      logEvent,
      perfMark,
      perfMeasure,
      recordDataVersionRef,
      recordRowNumberRef,
      recordSessionRef,
      recordStaleRef,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      setDraftSave,
      setLastSubmissionMeta,
      setSelectedRecordSnapshot,
      setStatus,
      setStatusLevel,
      setValues,
      setView,
      submitCurrentRecordMutation,
      synchronizeStaleRecord,
      updateRecordActionInFlightRef,
      updateRecordBusy,
      uploadQueueRef,
      upsertListCacheRow,
      valuesRef,
      waitForActiveDraftSaveTransactions
    ]
  );
};
