import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { FieldValue, WebFormDefinition, WebFormSubmission } from '../../../types';
import { buildInitialLineItems } from '../../app/lineItems';
import { normalizeRecordValues } from '../../app/records';
import { applyValueMapsToForm } from '../../app/valueMaps';
import type { FormErrors, LineItemState, View } from '../../types';

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

type DedupConflictInfo = {
  ruleId: string;
  message: string;
  existingRecordId?: string;
  existingRowNumber?: number;
};

type RecordStaleInfo = {
  recordId: string;
  message: string;
  cachedVersion?: number;
  serverVersion?: number;
  serverRow?: number;
};

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

type ValidationWarnings = {
  top: Array<{ message: string; fieldPath: string }>;
  byField: Record<string, string[]>;
};

type PrecheckCreateDedupAndMaybeNavigate = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  source: string;
  onDuplicate?: (conflict: DedupConflictInfo) => Promise<boolean | void> | boolean | void;
}) => Promise<boolean>;

/**
 * Owner: App shell.
 * Builds the configured blank create flow, including candidate dedup precheck
 * and reset of record-bound UI state before returning to the form.
 */
export const useCreateNewRecordAction = (args: {
  definition: WebFormDefinition;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  precheckCreateDedupAndMaybeNavigate: PrecheckCreateDedupAndMaybeNavigate;
  bumpRecordSession: (args: { reason: string; nextRecordId?: string | null }) => void;
  resetFieldChangeTransientState: () => void;
  rememberAutoSaveSeenState: (nextValues: Record<string, FieldValue>, nextLineItems: LineItemState) => void;
  createFlowRef: MutableRefObject<boolean>;
  createFlowUserEditedRef: MutableRefObject<boolean>;
  autoSaveUserEditedRef: MutableRefObject<boolean>;
  dedupHoldRef: MutableRefObject<boolean>;
  autoSaveDirtyRef: MutableRefObject<boolean>;
  autoSaveTimerRef: MutableRefObject<number | null>;
  setDraftSave: Dispatch<SetStateAction<{ phase: DraftSavePhase; message?: string; updatedAt?: string }>>;
  setDedupChecking: Dispatch<SetStateAction<boolean>>;
  setDedupConflict: Dispatch<SetStateAction<DedupConflictInfo | null>>;
  setDedupNotice: Dispatch<SetStateAction<DedupConflictInfo | null>>;
  dedupCheckingRef: MutableRefObject<boolean>;
  dedupConflictRef: MutableRefObject<DedupConflictInfo | null>;
  lastDedupCheckedSignatureRef: MutableRefObject<string>;
  dedupBaselineSignatureRef: MutableRefObject<string>;
  dedupKeyFingerprintBaselineRef: MutableRefObject<string>;
  dedupDeleteOnKeyChangeInFlightRef: MutableRefObject<boolean>;
  recordStaleRef: MutableRefObject<RecordStaleInfo | null>;
  setRecordStale: Dispatch<SetStateAction<RecordStaleInfo | null>>;
  recordDataVersionRef: MutableRefObject<number | null>;
  optimisticClientDataVersionRef: MutableRefObject<number | null>;
  recordRowNumberRef: MutableRefObject<number | null>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setErrors: Dispatch<SetStateAction<FormErrors>>;
  setValidationWarnings: Dispatch<SetStateAction<ValidationWarnings>>;
  setValidationAttempted: Dispatch<SetStateAction<boolean>>;
  setValidationNoticeHidden: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string | null>>;
  setStatusLevel: Dispatch<SetStateAction<'info' | 'success' | 'error' | null>>;
  setSelectedRecordId: Dispatch<SetStateAction<string>>;
  setSelectedRecordSnapshot: Dispatch<SetStateAction<WebFormSubmission | null>>;
  setLastSubmissionMeta: Dispatch<SetStateAction<SubmissionMeta | null>>;
  setView: Dispatch<SetStateAction<View>>;
}) => {
  const {
    definition,
    logEvent,
    precheckCreateDedupAndMaybeNavigate,
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
  } = args;

  return useCallback(() => {
    void (async () => {
      const normalized = normalizeRecordValues(definition);
      const initialLineItems = buildInitialLineItems(definition);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
      const handled = await precheckCreateDedupAndMaybeNavigate({
        values: mapped.values,
        lineItems: mapped.lineItems,
        source: 'createNew'
      });
      if (handled) return;

      bumpRecordSession({ reason: 'createNew', nextRecordId: null });
      createFlowRef.current = true;
      createFlowUserEditedRef.current = false;
      autoSaveUserEditedRef.current = false;
      dedupHoldRef.current = false;
      resetFieldChangeTransientState();
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      lastDedupCheckedSignatureRef.current = '';
      dedupBaselineSignatureRef.current = '';
      dedupKeyFingerprintBaselineRef.current = '';
      dedupDeleteOnKeyChangeInFlightRef.current = false;
      recordStaleRef.current = null;
      setRecordStale(null);
      recordDataVersionRef.current = null;
      optimisticClientDataVersionRef.current = null;
      recordRowNumberRef.current = null;
      rememberAutoSaveSeenState(mapped.values, mapped.lineItems);
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      setErrors({});
      setValidationWarnings({ top: [], byField: {} });
      setValidationAttempted(false);
      setValidationNoticeHidden(false);
      setStatus(null);
      setStatusLevel(null);
      setSelectedRecordId('');
      setSelectedRecordSnapshot(null);
      setLastSubmissionMeta(null);
      setView('form');
      logEvent('form.reset', { reason: 'submitAnother' });
    })();
  }, [
    autoSaveDirtyRef,
    autoSaveTimerRef,
    autoSaveUserEditedRef,
    bumpRecordSession,
    createFlowRef,
    createFlowUserEditedRef,
    dedupBaselineSignatureRef,
    dedupCheckingRef,
    dedupConflictRef,
    dedupDeleteOnKeyChangeInFlightRef,
    dedupHoldRef,
    dedupKeyFingerprintBaselineRef,
    definition,
    lastDedupCheckedSignatureRef,
    logEvent,
    optimisticClientDataVersionRef,
    precheckCreateDedupAndMaybeNavigate,
    recordDataVersionRef,
    recordRowNumberRef,
    recordStaleRef,
    rememberAutoSaveSeenState,
    resetFieldChangeTransientState,
    setDedupChecking,
    setDedupConflict,
    setDedupNotice,
    setDraftSave,
    setErrors,
    setLastSubmissionMeta,
    setLineItems,
    setRecordStale,
    setSelectedRecordId,
    setSelectedRecordSnapshot,
    setStatus,
    setStatusLevel,
    setValidationAttempted,
    setValidationNoticeHidden,
    setValidationWarnings,
    setValues,
    setView
  ]);
};
