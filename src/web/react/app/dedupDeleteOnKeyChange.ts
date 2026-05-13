import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../types';
import type { LineItemState, OptionState } from '../types';
import { invalidateClientSharedDataCaches } from '../api';
import { clearHomeListLocalCache } from './homeListLocalCache';
import { clearDateSearchLocalCacheFamily } from './dateSearchLocalCache';
import {
  buildDraftPayload,
  resolveExistingRecordId
} from './submission';
import { buildInitialLineItems } from './lineItems';
import { normalizeRecordValues } from './records';
import { applyValueMapsToForm } from './valueMaps';
import { reconcileAutoAddModeGroups } from './autoAddModeOverlay';
import { computeDedupKeyFingerprint } from './dedupPrecheck';
import { isDeleteOnKeyChangeSettledForRecord } from './dedupRaceGuards';

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

type UploadQueuePromise = Promise<{ success: boolean; message?: string; items?: string[]; value?: string }>;

/**
 * Owner: App shell save/dedup orchestration.
 * Handles the delete/recreate flow when top-level dedup identity fields change,
 * while App supplies refs, setters, and transport functions.
 */
export const triggerDedupDeleteOnKeyChangeAction = async (args: {
  source: string;
  extra?: Record<string, unknown>;
  definition: WebFormDefinition;
  formKey: string;
  submittingRef: MutableRefObject<boolean>;
  selectedRecordIdRef: MutableRefObject<string>;
  selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
  lastSubmissionMetaRef: MutableRefObject<SubmissionMeta | null>;
  pendingDeletedRecordIdsRef: MutableRefObject<string[]>;
  dedupDeleteOnKeyChangeInFlightRef: MutableRefObject<boolean>;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  dedupKeyFingerprintBaselineRef: MutableRefObject<string>;
  dedupHoldRef: MutableRefObject<boolean>;
  autoSaveDirtyRef: MutableRefObject<boolean>;
  autoSaveQueuedRef: MutableRefObject<boolean>;
  autoSaveTimerRef: MutableRefObject<number | null>;
  autoSaveInFlightRef: MutableRefObject<boolean>;
  uploadQueueRef: MutableRefObject<Map<string, UploadQueuePromise>>;
  languageRef: MutableRefObject<LangCode>;
  recordDataVersionRef: MutableRefObject<number | null>;
  optimisticClientDataVersionRef: MutableRefObject<number | null>;
  recordRowNumberRef: MutableRefObject<number | null>;
  recordStaleRef: MutableRefObject<any | null>;
  recordSessionRef: MutableRefObject<number>;
  createFlowRef: MutableRefObject<boolean>;
  createFlowUserEditedRef: MutableRefObject<boolean>;
  autoSaveUserEditedRef: MutableRefObject<boolean>;
  dedupBaselineSignatureRef: MutableRefObject<string>;
  optionStateRef: MutableRefObject<OptionState>;
  tooltipStateRef: MutableRefObject<Record<string, Record<string, string>>>;
  preloadPromisesRef: MutableRefObject<Record<string, Promise<void> | undefined>>;
  homeListLocalCacheKey: string;
  setSelectedRecordId: Dispatch<SetStateAction<string>>;
  setSelectedRecordSnapshot: Dispatch<SetStateAction<WebFormSubmission | null>>;
  setLastSubmissionMeta: Dispatch<SetStateAction<SubmissionMeta | null>>;
  setRecordStale: Dispatch<SetStateAction<any | null>>;
  setDraftSave: Dispatch<SetStateAction<{ phase: DraftSavePhase; error?: string }>>;
  setPendingDeletedRecordApplyTick: Dispatch<SetStateAction<number>>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  setValidationWarnings: Dispatch<
    SetStateAction<{
      top: Array<{ message: string; fieldPath: string }>;
      byField: Record<string, string[]>;
    }>
  >;
  setValidationAttempted: Dispatch<SetStateAction<boolean>>;
  setValidationNoticeHidden: Dispatch<SetStateAction<boolean>>;
  setOptionState: Dispatch<SetStateAction<OptionState>>;
  setTooltipState: Dispatch<SetStateAction<Record<string, Record<string, string>>>>;
  waitForActiveDraftSaveTransactions: (reason: string, timeoutMs?: number) => Promise<{ ok: boolean; message?: string }>;
  submitCurrentRecordMutation: (source: string, payload: any) => Promise<any>;
  rememberAutoSaveSeenState: (values: Record<string, FieldValue>, lineItems: LineItemState) => void;
  ensureLineOptions: (groupId: string, field: any) => void;
  logEvent: DiagnosticLogger;
  resolveLogMessage: (err: any, fallback: string) => string;
}): Promise<boolean> => {
  const {
    source,
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
  } = args;
  const dedupDeleteOnKeyChangeEnabledLocal =
    (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;
  if (!dedupDeleteOnKeyChangeEnabledLocal) return false;
  if (submittingRef.current) return false;
  const extraMeta = args.extra ? { ...args.extra } : {};
  const forceDelete = (extraMeta as any).force === true;
  const requestedRecordId = ((extraMeta as any).recordId || '').toString().trim();
  if ((extraMeta as any).force !== undefined) delete (extraMeta as any).force;
  if ((extraMeta as any).recordId !== undefined) delete (extraMeta as any).recordId;

  const activeSaveWait = await waitForActiveDraftSaveTransactions(`dedupDeleteOnKeyChange.${source}.beforeResolveRecord`);
  if (!activeSaveWait.ok) {
    logEvent('dedupDeleteOnKeyChange.delete.waitActiveSave.failed', {
      source,
      requestedRecordId: requestedRecordId || null,
      forceDelete,
      message: activeSaveWait.message || null,
      ...extraMeta
    });
    return false;
  }

  const existingRecordId = resolveExistingRecordId({
    selectedRecordId: selectedRecordIdRef.current,
    selectedRecordSnapshot: selectedRecordSnapshotRef.current,
    lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
  }) || (forceDelete ? requestedRecordId : '');
  if (!existingRecordId) {
    if (forceDelete && requestedRecordId) {
      logEvent('dedupDeleteOnKeyChange.delete.noCurrentRecord', {
        source,
        requestedRecordId,
        forceDelete,
        ...extraMeta
      });
      return true;
    }
    return false;
  }

  if (dedupDeleteOnKeyChangeInFlightRef.current) {
    const waitStartedAt = Date.now();
    logEvent('dedupDeleteOnKeyChange.delete.joinInFlight.start', {
      source,
      recordId: existingRecordId,
      forceDelete,
      ...extraMeta
    });
    while (dedupDeleteOnKeyChangeInFlightRef.current) {
      if (Date.now() - waitStartedAt > 15_000) {
        logEvent('dedupDeleteOnKeyChange.delete.joinInFlight.timeout', {
          source,
          recordId: existingRecordId,
          durationMs: Date.now() - waitStartedAt,
          forceDelete,
          ...extraMeta
        });
        return false;
      }
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 80));
    }
    const currentRecordId =
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '';
    const settled = isDeleteOnKeyChangeSettledForRecord({
      targetRecordId: existingRecordId,
      currentRecordId,
      deletedRecordIds: pendingDeletedRecordIdsRef.current
    });
    logEvent('dedupDeleteOnKeyChange.delete.joinInFlight.done', {
      source,
      recordId: existingRecordId,
      currentRecordId: currentRecordId || null,
      settled,
      durationMs: Date.now() - waitStartedAt,
      forceDelete,
      ...extraMeta
    });
    return settled;
  }

  const currentFingerprint = computeDedupKeyFingerprint((definition as any)?.dedupRules, valuesRef.current as any);
  const baselineFingerprint = (dedupKeyFingerprintBaselineRef.current || '').toString();
  if (!forceDelete && (!baselineFingerprint || baselineFingerprint === currentFingerprint)) return false;

  const previousDedupHold = dedupHoldRef.current;
  dedupDeleteOnKeyChangeInFlightRef.current = true;
  dedupHoldRef.current = true;
  autoSaveDirtyRef.current = false;
  autoSaveQueuedRef.current = false;
  if (autoSaveTimerRef.current) {
    globalThis.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }
  logEvent('dedupDeleteOnKeyChange.delete.start', {
    source,
    recordId: existingRecordId,
    forceDelete,
    ...extraMeta
  });
  try {
    const waitStartedAt = Date.now();
    if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
      logEvent('dedupDeleteOnKeyChange.delete.waitBackground.start', {
        source,
        recordId: existingRecordId,
        autosaveInFlight: autoSaveInFlightRef.current,
        uploadsInFlight: uploadQueueRef.current.size,
        forceDelete,
        ...extraMeta
      });
    }
    while (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
      if (Date.now() - waitStartedAt > 12_000) {
        logEvent('dedupDeleteOnKeyChange.delete.waitBackground.timeout', {
          source,
          recordId: existingRecordId,
          durationMs: Date.now() - waitStartedAt,
          autosaveInFlight: autoSaveInFlightRef.current,
          uploadsInFlight: uploadQueueRef.current.size,
          forceDelete,
          ...extraMeta
        });
        return false;
      }
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 80));
    }
    if (Date.now() - waitStartedAt > 0) {
      logEvent('dedupDeleteOnKeyChange.delete.waitBackground.done', {
        source,
        recordId: existingRecordId,
        durationMs: Date.now() - waitStartedAt,
        forceDelete,
        ...extraMeta
      });
    }

    const payload = buildDraftPayload({
      definition,
      formKey,
      language: languageRef.current,
      values: valuesRef.current,
      lineItems: lineItemsRef.current,
      existingRecordId
    }) as any;
    payload.__ckSaveMode = 'draft';
    payload.__ckDeleteRecordId = existingRecordId;
    const baseVersion = recordDataVersionRef.current;
    if (Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
      payload.__ckClientDataVersion = Number(baseVersion);
    }

    const res = await submitCurrentRecordMutation('dedupDeleteOnKeyChange.delete', payload);
    if (!res?.success) {
      logEvent('dedupDeleteOnKeyChange.delete.failed', {
        source,
        recordId: existingRecordId,
        message: (res?.message || 'Failed to delete previous record.').toString(),
        forceDelete,
        ...extraMeta
      });
      return false;
    }

    setSelectedRecordId('');
    selectedRecordIdRef.current = '';
    setSelectedRecordSnapshot(null);
    selectedRecordSnapshotRef.current = null;
    setLastSubmissionMeta(null);
    lastSubmissionMetaRef.current = null;
    recordDataVersionRef.current = null;
    optimisticClientDataVersionRef.current = null;
    recordRowNumberRef.current = null;
    recordStaleRef.current = null;
    setRecordStale(null);
    recordSessionRef.current += 1;
    createFlowRef.current = true;
    createFlowUserEditedRef.current = false;
    autoSaveUserEditedRef.current = false;
    dedupHoldRef.current = false;
    dedupBaselineSignatureRef.current = '';
    dedupKeyFingerprintBaselineRef.current = '';
    autoSaveDirtyRef.current = false;
    autoSaveQueuedRef.current = false;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    pendingDeletedRecordIdsRef.current.push(existingRecordId);
    setPendingDeletedRecordApplyTick(tick => tick + 1);
    const normalizedValues = normalizeRecordValues(definition, valuesRef.current as any);
    const rebuiltLineItems = buildInitialLineItems(definition, normalizedValues);
    const remappedState = applyValueMapsToForm(definition, normalizedValues, rebuiltLineItems, { mode: 'init' });
    const reconciledState = reconcileAutoAddModeGroups({
      definition,
      values: remappedState.values,
      lineItems: remappedState.lineItems,
      optionState: optionStateRef.current,
      language: languageRef.current,
      ensureLineOptions
    });
    const nextRecreatedValues = reconciledState.changed ? reconciledState.values : remappedState.values;
    const nextRecreatedLineItems = reconciledState.changed ? reconciledState.lineItems : remappedState.lineItems;
    valuesRef.current = nextRecreatedValues;
    lineItemsRef.current = nextRecreatedLineItems;
    rememberAutoSaveSeenState(nextRecreatedValues, nextRecreatedLineItems);
    setValues(nextRecreatedValues);
    setLineItems(nextRecreatedLineItems);
    setErrors({});
    setValidationWarnings({ top: [], byField: {} });
    setValidationAttempted(false);
    setValidationNoticeHidden(false);
    try {
      invalidateClientSharedDataCaches({
        includePersistedDataSources: true,
        includeHtmlRenderCache: true
      });
      clearHomeListLocalCache(homeListLocalCacheKey);
      clearDateSearchLocalCacheFamily({ formKey, listView: definition.listView });
      setOptionState({});
      setTooltipState({});
      optionStateRef.current = {};
      tooltipStateRef.current = {};
      preloadPromisesRef.current = {};
      logEvent('cache.client.clear', {
        scope: 'dedupDeleteOnKeyChange',
        recordId: existingRecordId,
        optionsCleared: true
      });
    } catch (cacheErr: any) {
      logEvent('cache.client.clear.error', {
        scope: 'dedupDeleteOnKeyChange',
        recordId: existingRecordId,
        message: cacheErr?.message || cacheErr?.toString?.() || 'unknown'
      });
    }

    logEvent('dedupDeleteOnKeyChange.delete.success', {
      source,
      deletedRecordId: existingRecordId,
      autoAddGroupRebuilds: reconciledState.changedCount,
      forceDelete,
      ...extraMeta
    });
    return true;
  } catch (err: any) {
    logEvent('dedupDeleteOnKeyChange.delete.exception', {
      source,
      recordId: existingRecordId,
      message: resolveLogMessage(err, 'Failed to delete previous record.'),
      forceDelete,
      ...extraMeta
    });
    return false;
  } finally {
    if (dedupHoldRef.current) {
      dedupHoldRef.current = previousDedupHold;
    }
    dedupDeleteOnKeyChangeInFlightRef.current = false;
  }
};
