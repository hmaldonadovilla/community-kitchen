import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../../types';
import { shouldDeferCopiedDraftCreation } from '../../app/copyDraftCreation';
import {
  applyCopyCurrentRecordDropFields,
  applyCopyCurrentRecordProfile,
  resolveCopyCurrentRecordDestructiveChangeBypassFieldIds
} from '../../app/copyProfile';
import { clearAutoIncrementFields } from '../../app/lineItems';
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
 * Coordinates the copy-current-record workflow: clear record identity, apply
 * copy profile/drop rules, precheck dedup, and ensure a draft id when allowed.
 */
export const useDuplicateCurrentRecordAction = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  languageRef: MutableRefObject<LangCode>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  copyRecordBusy: any;
  precheckCreateDedupAndMaybeNavigate: PrecheckCreateDedupAndMaybeNavigate;
  openCopyCurrentRecordDialogIfConfigured: () => void;
  ensureDraftRecordIdActionRef: MutableRefObject<((args?: { reason?: string; fieldPath?: string }) => Promise<any>) | null>;
  recordSessionRef: MutableRefObject<number>;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  selectedRecordIdRef: MutableRefObject<string>;
  selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
  lastSubmissionMetaRef: MutableRefObject<SubmissionMeta | null>;
  copyCurrentRecordDestructiveChangeBypassFieldIdsRef: MutableRefObject<Record<string, true>>;
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

  return useCallback(
    async (duplicateArgs?: { busyAlreadyOpen?: boolean }) => {
      const busySeq = duplicateArgs?.busyAlreadyOpen
        ? null
        : copyRecordBusy.lock({
            title: tSystem('navigation.waitTitle', language, 'Please wait'),
            message: tSystem('navigation.waitCopyRecord', language, 'Please wait while we prepare your copied record...'),
            diagnosticMeta: {}
          });
      bumpRecordSession({ reason: 'duplicateCurrent', nextRecordId: null });
      const copySession = recordSessionRef.current;
      try {
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

        const profiled = applyCopyCurrentRecordProfile({
          definition: definition as any,
          values: valuesRef.current,
          lineItems: lineItemsRef.current
        });
        if (profiled) {
          logEvent('ui.copyCurrent.profile.applied', {
            keepValueCount: Object.keys(profiled.values || {}).length,
            groupCount: Object.keys(profiled.lineItems || {}).length
          });
        }
        const base = profiled || { values: valuesRef.current, lineItems: lineItemsRef.current };
        const cleared = clearAutoIncrementFields(definition, base.values, base.lineItems);
        const dropFieldsRaw = Array.isArray(definition.copyCurrentRecordDropFields) ? definition.copyCurrentRecordDropFields : [];
        const dropFields = dropFieldsRaw
          .map(v => (v === undefined || v === null ? '' : v.toString()).trim())
          .filter(Boolean);
        const destructiveChangeBypassFieldIds = resolveCopyCurrentRecordDestructiveChangeBypassFieldIds({
          definition: definition as any,
          dropFields
        });
        if (destructiveChangeBypassFieldIds.length) {
          copyCurrentRecordDestructiveChangeBypassFieldIdsRef.current = destructiveChangeBypassFieldIds.reduce<
            Record<string, true>
          >((acc, fieldId) => {
            acc[fieldId] = true;
            return acc;
          }, {});
          logEvent('ui.copyCurrent.destructiveChangeBypass', {
            count: destructiveChangeBypassFieldIds.length,
            fieldIds: destructiveChangeBypassFieldIds
          });
        }
        if (dropFields.length) {
          const dropped = applyCopyCurrentRecordDropFields({
            definition: definition as any,
            values: cleared.values as any,
            lineItems: cleared.lineItems,
            dropFields
          });
          const nextValues: Record<string, any> = { ...(dropped.values as any) };
          const nextLineItems: any = dropped.lineItems;
          logEvent('ui.copyCurrent.dropFields', {
            count: dropFields.length,
            droppedValuesCount: dropped.droppedValues.length,
            droppedValues: dropped.droppedValues,
            lineItemsCleared: dropped.lineItemsCleared
          });
          valuesRef.current = nextValues as any;
          lineItemsRef.current = nextLineItems;
          rememberAutoSaveSeenState(nextValues as any, nextLineItems);
          setValues(nextValues as any);
          setLineItems(nextLineItems);
        } else {
          valuesRef.current = cleared.values as any;
          lineItemsRef.current = cleared.lineItems;
          rememberAutoSaveSeenState(cleared.values, cleared.lineItems);
          setValues(cleared.values);
          setLineItems(cleared.lineItems);
        }
        setSelectedRecordId('');
        selectedRecordIdRef.current = '';
        setSelectedRecordSnapshot(null);
        selectedRecordSnapshotRef.current = null;
        setLastSubmissionMeta(null);
        lastSubmissionMetaRef.current = null;
        setErrors({});
        setValidationWarnings({ top: [], byField: {} });
        setValidationAttempted(false);
        setValidationNoticeHidden(false);
        setStatus(null);
        setStatusLevel(null);
        setView('form');

        if (
          shouldDeferCopiedDraftCreation({
            dedupRules: (definition as any)?.dedupRules,
            questions: definition.questions,
            values: valuesRef.current as any,
            lineItems: lineItemsRef.current,
            language: languageRef.current,
            existingRecordId: ''
          })
        ) {
          logEvent('ui.copyCurrent.ensureRecordId.deferred', {
            reason: 'dedupKeysIncompleteOrInvalid'
          });
          openCopyCurrentRecordDialogIfConfigured();
          return;
        }

        const duplicateHandled = await precheckCreateDedupAndMaybeNavigate({
          values: valuesRef.current as any,
          lineItems: lineItemsRef.current,
          source: 'copyCurrentRecord'
        });
        if (recordSessionRef.current !== copySession) return;
        if (duplicateHandled) return;

        const ensureRecordId = ensureDraftRecordIdActionRef.current;
        if (!ensureRecordId) {
          openCopyCurrentRecordDialogIfConfigured();
          return;
        }
        const ensured = await ensureRecordId({ reason: 'copyCurrentRecord' });
        if (recordSessionRef.current !== copySession) return;
        if (!ensured.success || !ensured.recordId) {
          const message = (ensured.message || 'Could not create the copied draft record.').toString();
          setStatus(message);
          setStatusLevel('error');
          logEvent('ui.copyCurrent.ensureRecordId.failed', { message });
          return;
        }
        logEvent('ui.copyCurrent.ensureRecordId.done', { recordId: ensured.recordId });
        openCopyCurrentRecordDialogIfConfigured();
      } finally {
        if (busySeq !== null) {
          copyRecordBusy.unlock(busySeq, {
            source: 'copyCurrentRecord',
            session: copySession
          });
        }
      }
    },
    [
      autoSaveDirtyRef,
      autoSaveTimerRef,
      autoSaveUserEditedRef,
      bumpRecordSession,
      copyCurrentRecordDestructiveChangeBypassFieldIdsRef,
      copyRecordBusy,
      createFlowRef,
      createFlowUserEditedRef,
      dedupBaselineSignatureRef,
      dedupCheckingRef,
      dedupConflictRef,
      dedupDeleteOnKeyChangeInFlightRef,
      dedupHoldRef,
      dedupKeyFingerprintBaselineRef,
      definition,
      ensureDraftRecordIdActionRef,
      language,
      languageRef,
      lastDedupCheckedSignatureRef,
      lastSubmissionMetaRef,
      lineItemsRef,
      logEvent,
      openCopyCurrentRecordDialogIfConfigured,
      optimisticClientDataVersionRef,
      precheckCreateDedupAndMaybeNavigate,
      recordDataVersionRef,
      recordRowNumberRef,
      recordSessionRef,
      recordStaleRef,
      rememberAutoSaveSeenState,
      resetFieldChangeTransientState,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
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
      setView,
      valuesRef
    ]
  );
};
