import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { loadOptionsFromDataSource, optionKey } from '../../../core';
import type { FieldValue, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import { runSelectionEffects as runSelectionEffectsHelper } from '../../app/selectionEffects';
import { runSelectionEffectsForAncestors } from '../../app/runSelectionEffectsForAncestors';
import type { LineItemState, OptionState } from '../../types';

const SELECTION_EFFECT_INIT_AUTOSAVE_SUPPRESS_MS = 30000;

export const useAppSelectionEffects = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  formRecordMeta: any;
  optionState: OptionState;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  fieldChangePendingRef: MutableRefObject<Record<string, any>>;
  selectionEffectAsyncPendingCountRef: MutableRefObject<number>;
  selectionEffectInitAutoSaveSuppressStartedAtRef: MutableRefObject<number>;
  selectionEffectInitAutoSaveSuppressUntilRef: MutableRefObject<number>;
  selectionEffectInitAutoSaveHadDirtyAtStartRef: MutableRefObject<boolean>;
  autoSaveDirtyRef: MutableRefObject<boolean>;
  autoSaveQueuedRef: MutableRefObject<boolean>;
  autoSaveInFlightRef: MutableRefObject<boolean>;
  draftSaveRequestInFlightRef: MutableRefObject<boolean>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
  setOptionState: Dispatch<SetStateAction<OptionState>>;
  setTooltipState: Dispatch<SetStateAction<Record<string, Record<string, string>>>>;
  setExternalScrollAnchor: Dispatch<SetStateAction<string | null>>;
  setSelectionEffectAsyncPendingCount: Dispatch<SetStateAction<number>>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const {
    definition,
    language,
    formRecordMeta,
    optionState,
    valuesRef,
    lineItemsRef,
    fieldChangePendingRef,
    selectionEffectAsyncPendingCountRef,
    selectionEffectInitAutoSaveSuppressStartedAtRef,
    selectionEffectInitAutoSaveSuppressUntilRef,
    selectionEffectInitAutoSaveHadDirtyAtStartRef,
    autoSaveDirtyRef,
    autoSaveQueuedRef,
    autoSaveInFlightRef,
    draftSaveRequestInFlightRef,
    setValues,
    setLineItems,
    setOptionState,
    setTooltipState,
    setExternalScrollAnchor,
    setSelectionEffectAsyncPendingCount,
    logEvent
  } = args;

  const ensureOptions = (q: WebQuestionDefinition) => {
    if (!q.dataSource) return;
    const key = optionKey(q.id);
    if (optionState[key]) return;
    loadOptionsFromDataSource(q.dataSource, language).then(res => {
      if (res) {
        setOptionState(prev => ({ ...prev, [key]: res }));
        if (res.tooltips) {
          setTooltipState(prev => ({ ...prev, [key]: res.tooltips || {} }));
        }
        logEvent('options.loaded', { questionId: q.id, source: 'question', count: res.en?.length || 0 });
      }
    });
  };

  const beginSelectionEffectAsync = useCallback((_meta: Record<string, unknown>) => {
    selectionEffectAsyncPendingCountRef.current += 1;
    setSelectionEffectAsyncPendingCount(selectionEffectAsyncPendingCountRef.current);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      selectionEffectAsyncPendingCountRef.current = Math.max(0, selectionEffectAsyncPendingCountRef.current - 1);
      setSelectionEffectAsyncPendingCount(selectionEffectAsyncPendingCountRef.current);
    };
  }, [selectionEffectAsyncPendingCountRef, setSelectionEffectAsyncPendingCount]);

  function runSelectionEffects(
    question: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
      preferLookupSourceValue?: boolean;
      snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState };
    },
    effectOverrides?: Record<string, Record<string, FieldValue>>,
    ignorePending?: boolean,
    snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState }
  ) {
    const fieldPath = opts?.lineItem
      ? `${opts.lineItem.groupId}__${question.id}__${opts.lineItem.rowId}`
      : question.id;
    const pending = fieldChangePendingRef.current[fieldPath];
    if (pending && !ignorePending) {
      logEvent('fieldChangeDialog.selectionEffect.deferred', {
        fieldPath,
        fieldId: question.id,
        groupId: opts?.lineItem?.groupId || null,
        rowId: opts?.lineItem?.rowId || null
      });
      return;
    }
    const currentValues = opts?.snapshots?.values || snapshots?.values || valuesRef.current;
    const currentTopValues = {
      ...(currentValues || {}),
      ...(formRecordMeta?.id !== undefined ? { id: formRecordMeta.id as FieldValue } : {}),
      ...(formRecordMeta?.createdAt !== undefined ? { createdAt: formRecordMeta.createdAt as FieldValue } : {}),
      ...(formRecordMeta?.updatedAt !== undefined ? { updatedAt: formRecordMeta.updatedAt as FieldValue } : {}),
      ...(formRecordMeta?.status !== undefined
        ? { status: formRecordMeta.status as FieldValue, STATUS: formRecordMeta.status as FieldValue }
        : {}),
      ...(formRecordMeta?.pdfUrl !== undefined ? { pdfUrl: formRecordMeta.pdfUrl as FieldValue } : {})
    } as Record<string, FieldValue>;
    const currentLineItems = opts?.snapshots?.lineItems || snapshots?.lineItems || lineItemsRef.current;
    if (opts?.preferLookupSourceValue === true) {
      const now = Date.now();
      if (!selectionEffectInitAutoSaveSuppressUntilRef.current || selectionEffectInitAutoSaveSuppressUntilRef.current <= now) {
        selectionEffectInitAutoSaveSuppressStartedAtRef.current = now;
        selectionEffectInitAutoSaveHadDirtyAtStartRef.current =
          autoSaveDirtyRef.current ||
          autoSaveQueuedRef.current ||
          autoSaveInFlightRef.current ||
          draftSaveRequestInFlightRef.current;
      }
      selectionEffectInitAutoSaveSuppressUntilRef.current = Math.max(
        selectionEffectInitAutoSaveSuppressUntilRef.current || 0,
        now + SELECTION_EFFECT_INIT_AUTOSAVE_SUPPRESS_MS
      );
    }
    runSelectionEffectsHelper({
      definition,
      question,
      value,
      language,
      values: currentValues,
      lineItems: currentLineItems,
      setValues,
      setLineItems,
      onLineItemsMutated: ({ sourceGroupKey, prevLineItems, nextLineItems, nextValues }) => {
        globalThis.setTimeout(() => {
          runSelectionEffectsForAncestors({
            definition,
            values: nextValues,
            onSelectionEffect: (ancestorQuestion, ancestorValue, ancestorOpts) => {
              runSelectionEffects(
                ancestorQuestion,
                ancestorValue,
                ancestorOpts,
                effectOverrides,
                true,
                { values: nextValues, lineItems: nextLineItems }
              );
            },
            sourceGroupKey,
            prevLineItems,
            nextLineItems,
            options: { mode: 'change', topValues: nextValues }
          });
        }, 0);
      },
      logEvent,
      onAsyncEffectStart: beginSelectionEffectAsync,
      opts: {
        ...(opts || {}),
        topValues: currentTopValues
      },
      effectOverrides,
      onRowAppended: ({ anchor, targetKey, rowId, source }) => {
        setExternalScrollAnchor(anchor);
        logEvent('ui.selectionEffect.rowAppended', { anchor, targetKey, rowId, source: source || null });
      }
    });
  }

  return {
    ensureOptions,
    runSelectionEffects
  };
};
