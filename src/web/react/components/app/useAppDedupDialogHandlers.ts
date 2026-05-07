import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { FieldValue } from '../../../types';
import type { FormErrors, LineItemState, View } from '../../types';
import { applyValueMapsToForm } from '../../app/valueMaps';

type DedupConflictLike = {
  ruleId?: string | null;
  message?: string;
  existingRecordId?: string | null;
  existingRowNumber?: number | string | null;
};

type ListDedupPromptLike = {
  source: string;
  buttonId?: string;
  qIdx?: number | null;
  conflict: DedupConflictLike;
} | null;

interface UseAppDedupDialogHandlersArgs {
  definition: any;
  dedupDialogConflict: DedupConflictLike | null;
  dedupDialogDetails?: { keys?: string[] } | null;
  dedupIdentityFieldIdMap: Record<string, true>;
  ingredientCreateDedupDialogMode: boolean;
  dedupConflict: DedupConflictLike | null;
  dedupNotice: DedupConflictLike | null;
  listDedupPrompt: ListDedupPromptLike;
  summaryViewEnabled: boolean;
  dedupCheckTimerRef: MutableRefObject<number | null>;
  dedupCheckSeqRef: MutableRefObject<number>;
  lastDedupCheckedSignatureRef: MutableRefObject<string>;
  dedupHoldRef: MutableRefObject<boolean>;
  dedupCheckingRef: MutableRefObject<boolean>;
  dedupConflictRef: MutableRefObject<DedupConflictLike | null>;
  autoSaveDirtyRef: MutableRefObject<boolean>;
  autoSaveTimerRef: MutableRefObject<number | null>;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  createFlowRef: MutableRefObject<boolean>;
  createFlowUserEditedRef: MutableRefObject<boolean>;
  autoSaveUserEditedRef: MutableRefObject<boolean>;
  setDedupChecking: Dispatch<SetStateAction<boolean>>;
  setDedupConflict: Dispatch<SetStateAction<any>>;
  setDedupNotice: Dispatch<SetStateAction<any>>;
  setDraftSave: Dispatch<SetStateAction<any>>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setErrors: Dispatch<SetStateAction<FormErrors>>;
  setView: Dispatch<SetStateAction<View>>;
  setStatus: Dispatch<SetStateAction<string | null>>;
  setStatusLevel: Dispatch<SetStateAction<'info' | 'success' | 'error' | null>>;
  setListDedupPrompt: Dispatch<SetStateAction<any>>;
  hideDedupProgressDialog: () => void;
  openExistingRecordFromDedup: (args: {
    recordId: string;
    rowNumber?: number | null;
    source: string;
    view?: 'auto' | 'form' | 'summary';
  }) => Promise<any> | any;
  loadRecordSnapshot: (recordId: string, rowNumberHint?: number) => Promise<boolean>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}

const parseDedupRowNumber = (raw: unknown): number | undefined => {
  return raw === undefined || raw === null || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
};

export function useAppDedupDialogHandlers({
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
}: UseAppDedupDialogHandlersArgs) {
  const resetDedupState = useCallback(
    (reason: string) => {
      hideDedupProgressDialog();
      if (dedupCheckTimerRef.current) {
        globalThis.clearTimeout(dedupCheckTimerRef.current);
        dedupCheckTimerRef.current = null;
      }
      dedupCheckSeqRef.current += 1;
      lastDedupCheckedSignatureRef.current = '';
      dedupHoldRef.current = false;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      logEvent('dedup.state.reset', { reason });
    },
    [
      autoSaveDirtyRef,
      autoSaveTimerRef,
      dedupCheckSeqRef,
      dedupCheckTimerRef,
      dedupCheckingRef,
      dedupConflictRef,
      dedupHoldRef,
      hideDedupProgressDialog,
      lastDedupCheckedSignatureRef,
      logEvent,
      setDedupChecking,
      setDedupConflict,
      setDedupNotice,
      setDraftSave
    ]
  );

  const handleDedupChangeFields = useCallback(() => {
    const conflict = dedupDialogConflict;
    if (!conflict) return;
    const fallbackKeys = dedupDialogDetails?.keys || [];
    const keys = fallbackKeys.length
      ? fallbackKeys
      : (() => {
          const list: string[] = [];
          const seen = new Set<string>();
          Object.keys(dedupIdentityFieldIdMap || {}).forEach(key => {
            const trimmed = (key || '').toString().trim();
            if (!trimmed) return;
            const lower = trimmed.toLowerCase();
            if (seen.has(lower)) return;
            seen.add(lower);
            list.push(trimmed);
          });
          return list;
        })();
    resetDedupState('dedup.dialog.changeFields');
    if (keys.length) {
      const baseValues = { ...(valuesRef.current || {}) };
      keys.forEach(key => {
        if (!key) return;
        baseValues[key] = '';
      });
      const mapped = applyValueMapsToForm(definition, baseValues, lineItemsRef.current, {
        mode: 'change',
        lockedTopFields: keys
      });
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      valuesRef.current = mapped.values;
      lineItemsRef.current = mapped.lineItems;
      setErrors(prev => {
        const next = { ...(prev || {}) };
        keys.forEach(key => {
          if (key && key in next) delete next[key];
        });
        return next;
      });
      autoSaveDirtyRef.current = true;
      setDraftSave({ phase: 'dirty' });
    }
    setView('form');
    logEvent('dedup.dialog.changeFields', {
      ruleId: conflict.ruleId || null,
      existingRecordId: conflict.existingRecordId || null,
      clearedFields: keys
    });
  }, [
    autoSaveDirtyRef,
    dedupDialogConflict,
    dedupDialogDetails,
    dedupIdentityFieldIdMap,
    definition,
    lineItemsRef,
    logEvent,
    resetDedupState,
    setDraftSave,
    setErrors,
    setLineItems,
    setValues,
    setView,
    valuesRef
  ]);

  const handleDedupCancelCreationToHome = useCallback(() => {
    const conflict = dedupDialogConflict;
    resetDedupState('dedup.dialog.cancelCreation');
    createFlowRef.current = false;
    createFlowUserEditedRef.current = false;
    autoSaveUserEditedRef.current = false;
    dedupHoldRef.current = false;
    setView('list');
    setStatus(null);
    setStatusLevel(null);
    logEvent('dedup.dialog.cancelCreation.home', {
      ruleId: conflict?.ruleId || null,
      existingRecordId: conflict?.existingRecordId || null
    });
  }, [
    autoSaveUserEditedRef,
    createFlowRef,
    createFlowUserEditedRef,
    dedupDialogConflict,
    dedupHoldRef,
    logEvent,
    resetDedupState,
    setStatus,
    setStatusLevel,
    setView
  ]);

  const handleDedupOpenExisting = useCallback(() => {
    const conflict = dedupDialogConflict;
    const id = (conflict?.existingRecordId || '').toString().trim();
    if (!id) return;
    const rowNumber = parseDedupRowNumber(conflict?.existingRowNumber);
    resetDedupState('dedup.dialog.openExisting');
    logEvent('dedup.openExisting.click', { existingRecordId: id, source: 'dedupDialog' });
    void openExistingRecordFromDedup({ recordId: id, rowNumber, source: 'dedupDialog', view: 'form' });
  }, [dedupDialogConflict, logEvent, openExistingRecordFromDedup, resetDedupState]);

  const handleListDedupDialogConfirm = useCallback(() => {
    const prompt = listDedupPrompt;
    if (!prompt) return;
    setListDedupPrompt(null);
    const id = (prompt.conflict.existingRecordId || '').toString().trim();
    if (!id) return;
    const rowNumber = parseDedupRowNumber(prompt.conflict.existingRowNumber);
    logEvent('dedup.precreate.openExistingFromList', {
      source: prompt.source,
      buttonId: prompt.buttonId,
      qIdx: prompt.qIdx ?? null,
      existingRecordId: id,
      existingRowNumber: rowNumber ?? null
    });
    void openExistingRecordFromDedup({ recordId: id, rowNumber, source: prompt.source });
  }, [listDedupPrompt, logEvent, openExistingRecordFromDedup, setListDedupPrompt]);

  const handleListDedupDialogCancel = useCallback(() => {
    const prompt = listDedupPrompt;
    if (!prompt) return;
    setListDedupPrompt(null);
    logEvent('dedup.precreate.listDialog.cancel', {
      source: prompt.source,
      buttonId: prompt.buttonId,
      qIdx: prompt.qIdx ?? null,
      existingRecordId: prompt.conflict.existingRecordId || null,
      existingRowNumber: prompt.conflict.existingRowNumber ?? null
    });
  }, [listDedupPrompt, logEvent, setListDedupPrompt]);

  const handleDedupTopNoticeOpenExisting = useCallback(() => {
    const conflictAny = (dedupConflict || dedupNotice) as DedupConflictLike;
    const id = (conflictAny?.existingRecordId || '').toString().trim();
    const rowNumber = parseDedupRowNumber(conflictAny?.existingRowNumber);
    if (!id) return;
    resetDedupState('dedup.topNotice.openExisting');
    logEvent('dedup.openExisting.click', { existingRecordId: id });
    const loadPromise = rowNumber && rowNumber >= 2
      ? loadRecordSnapshot('', rowNumber)
      : loadRecordSnapshot(id);
    void loadPromise.then(ok => {
      if (!ok) return;
      setView(summaryViewEnabled ? 'summary' : 'form');
    });
  }, [dedupConflict, dedupNotice, loadRecordSnapshot, logEvent, resetDedupState, setView, summaryViewEnabled]);

  return {
    handleDedupDialogCancel: handleDedupChangeFields,
    handleDedupDialogConfirm: ingredientCreateDedupDialogMode ? handleDedupCancelCreationToHome : handleDedupOpenExisting,
    handleListDedupDialogCancel,
    handleListDedupDialogConfirm,
    handleDedupTopNoticeOpenExisting
  };
}
