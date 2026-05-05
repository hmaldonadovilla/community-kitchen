import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { FieldValue, WebFormDefinition, WebFormSubmission } from '../../../types';
import { buildInitialLineItems } from '../../app/lineItems';
import { normalizeRecordValues } from '../../app/records';
import { applyValueMapsToForm, coerceDefaultValue } from '../../app/valueMaps';
import type { FormErrors, LineItemState, View } from '../../types';

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

type DedupConflictInfo = {
  ruleId: string;
  message: string;
  existingRecordId?: string;
  existingRowNumber?: number;
};

type ListDedupPromptState = {
  conflict: DedupConflictInfo;
  source: string;
  buttonId: string;
  qIdx?: number | null;
  values: Record<string, FieldValue>;
};

type ValidationWarnings = {
  top: Array<{ message: string; fieldPath: string }>;
  byField: Record<string, string[]>;
};

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

type RecordStaleInfo = {
  recordId: string;
  message: string;
  cachedVersion?: number;
  serverVersion?: number;
  serverRow?: number;
};

type PrecheckCreateDedupAndMaybeNavigate = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  source: string;
  onDuplicate?: (conflict: DedupConflictInfo) => Promise<boolean | void> | boolean | void;
}) => Promise<boolean>;

/**
 * Owner: App shell.
 * Coordinates the configured create-record-preset button action while keeping
 * preset coercion, dedup precheck, and new-record state reset outside App.tsx.
 */
export const useCreateRecordPresetAction = (args: {
  definition: WebFormDefinition;
  view: View;
  parseButtonRef: (ref: string) => { id: string; qIdx?: number };
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
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setErrors: Dispatch<SetStateAction<FormErrors>>;
  setValidationWarnings: Dispatch<SetStateAction<ValidationWarnings>>;
  setValidationAttempted: Dispatch<SetStateAction<boolean>>;
  setValidationNoticeHidden: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string | null>>;
  setStatusLevel: Dispatch<SetStateAction<'info' | 'success' | 'error' | null>>;
  setRecordLoadError: Dispatch<SetStateAction<string | null>>;
  setPrefetchedSummaryHtml: Dispatch<SetStateAction<{ recordId: string; html: string } | null>>;
  setSelectedRecordId: Dispatch<SetStateAction<string>>;
  selectedRecordIdRef: MutableRefObject<string>;
  setSelectedRecordSnapshot: Dispatch<SetStateAction<WebFormSubmission | null>>;
  selectedRecordSnapshotRef: MutableRefObject<WebFormSubmission | null>;
  setLastSubmissionMeta: Dispatch<SetStateAction<SubmissionMeta | null>>;
  lastSubmissionMetaRef: MutableRefObject<SubmissionMeta | null>;
  setView: Dispatch<SetStateAction<View>>;
  setListDedupPrompt: Dispatch<SetStateAction<ListDedupPromptState | null>>;
}) => {
  const {
    definition,
    view,
    parseButtonRef,
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
    valuesRef,
    lineItemsRef,
    setValues,
    setLineItems,
    setErrors,
    setValidationWarnings,
    setValidationAttempted,
    setValidationNoticeHidden,
    setStatus,
    setStatusLevel,
    setRecordLoadError,
    setPrefetchedSummaryHtml,
    setSelectedRecordId,
    selectedRecordIdRef,
    setSelectedRecordSnapshot,
    selectedRecordSnapshotRef,
    setLastSubmissionMeta,
    lastSubmissionMetaRef,
    setView,
    setListDedupPrompt
  } = args;

  return useCallback(
    async (actionArgs: { buttonId: string; presetValues: Record<string, any> }) => {
      const { buttonId, presetValues } = actionArgs;

      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;

      const baseValues = normalizeRecordValues(definition);
      const valuesWithPreset: Record<string, FieldValue> = { ...(baseValues as any) };
      const unknownFields: string[] = [];
      const appliedFields: string[] = [];

      Object.keys(presetValues || {}).forEach(fieldIdRaw => {
        const fieldId = (fieldIdRaw || '').toString().trim();
        if (!fieldId) return;
        const q = definition.questions.find(qq => qq.id === fieldId);
        if (!q || q.type === 'LINE_ITEM_GROUP' || q.type === 'BUTTON' || q.type === 'FILE_UPLOAD') {
          unknownFields.push(fieldId);
          return;
        }
        const opts = (q as any).options;
        const hasAnyOption = !!(opts?.en?.length || opts?.fr?.length || opts?.nl?.length);
        const coerced = coerceDefaultValue({
          type: (q as any).type || '',
          raw: (presetValues as any)[fieldIdRaw],
          hasAnyOption,
          hasDataSource: !!(q as any).dataSource
        });
        if (coerced !== undefined) {
          valuesWithPreset[fieldId] = coerced;
          appliedFields.push(fieldId);
        }
      });

      const initialLineItems = buildInitialLineItems(definition);
      const mapped = applyValueMapsToForm(definition, valuesWithPreset, initialLineItems, { mode: 'init' });

      // Precheck dedup before navigating to the new record so presets/defaults do not create duplicates.
      const listViewDuplicateHandler =
        view === 'list'
          ? (conflict: DedupConflictInfo) => {
              const prompt: ListDedupPromptState = {
                conflict,
                source: 'createRecordPreset',
                buttonId: baseId,
                qIdx: qIdx ?? null,
                values: mapped.values
              };
              setListDedupPrompt(prompt);
              logEvent('dedup.precreate.listDialog.open', {
                source: prompt.source,
                buttonId: prompt.buttonId,
                qIdx: prompt.qIdx ?? null,
                existingRecordId: conflict.existingRecordId || null,
                existingRowNumber: conflict.existingRowNumber ?? null
              });
              return true;
            }
          : undefined;
      const handled = await precheckCreateDedupAndMaybeNavigate({
        values: mapped.values,
        lineItems: mapped.lineItems,
        source: 'createRecordPreset',
        onDuplicate: listViewDuplicateHandler
      });
      if (handled) return;

      bumpRecordSession({ reason: 'createRecordPreset', nextRecordId: null });
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
      valuesRef.current = mapped.values;
      lineItemsRef.current = mapped.lineItems;
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      setErrors({});
      setValidationWarnings({ top: [], byField: {} });
      setValidationAttempted(false);
      setValidationNoticeHidden(false);
      setStatus(null);
      setStatusLevel(null);
      setRecordLoadError(null);
      setPrefetchedSummaryHtml(null);
      setSelectedRecordId('');
      selectedRecordIdRef.current = '';
      setSelectedRecordSnapshot(null);
      selectedRecordSnapshotRef.current = null;
      setLastSubmissionMeta(null);
      lastSubmissionMetaRef.current = null;
      setView('form');

      logEvent('button.createRecordPreset.apply', {
        buttonId: baseId,
        qIdx: qIdx ?? null,
        appliedFieldCount: appliedFields.length,
        unknownFieldCount: unknownFields.length,
        unknownFields: unknownFields.length ? unknownFields.slice(0, 20) : []
      });
    },
    [
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
      lastSubmissionMetaRef,
      lineItemsRef,
      logEvent,
      optimisticClientDataVersionRef,
      parseButtonRef,
      precheckCreateDedupAndMaybeNavigate,
      recordDataVersionRef,
      recordRowNumberRef,
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
      setListDedupPrompt,
      setPrefetchedSummaryHtml,
      setRecordLoadError,
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
      valuesRef,
      view
    ]
  );
};
