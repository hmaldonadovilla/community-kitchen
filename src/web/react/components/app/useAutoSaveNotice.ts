import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode } from '../../../types';
import type { View } from '../../types';

export const useAutoSaveNotice = (args: {
  autoSaveEnabled: boolean;
  formKey?: string;
  language: LangCode;
  view: View;
  ingredientsFormActive: boolean;
  ingredientCreateAutoSaveReady: boolean;
  createFlowRef: MutableRefObject<boolean>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const {
    autoSaveEnabled,
    formKey,
    language,
    view,
    ingredientsFormActive,
    ingredientCreateAutoSaveReady,
    createFlowRef,
    logEvent
  } = args;
  const [autoSaveNoticeOpen, setAutoSaveNoticeOpen] = useState<boolean>(false);
  const [ingredientNameBlurredForAutoSave, setIngredientNameBlurredForAutoSave] = useState<boolean>(false);
  const autoSaveNoticeSeenRef = useRef<boolean>(false);
  const autoSaveNoticeStorageKey = useMemo(() => {
    const key = (formKey || '').toString().trim() || 'default';
    return `ck.autosaveNotice.${key}`;
  }, [formKey]);

  const autoSaveNoticeTitle = tSystem('autosaveNotice.title', language, '');
  const autoSaveNoticeMessage = tSystem(
    'autosaveNotice.message',
    language,
    'This form saves your changes automatically in the background. Look for the status indicators in the top right corner of the form.'
  );
  const autoSaveNoticeConfirmLabel = tSystem('autosaveNotice.confirm', language, 'Got it');
  const autoSaveNoticeCancelLabel = tSystem('autosaveNotice.cancel', language, tSystem('common.close', language, 'Close'));

  useEffect(() => {
    autoSaveNoticeSeenRef.current = false;
    setAutoSaveNoticeOpen(false);
    setIngredientNameBlurredForAutoSave(false);
  }, [autoSaveNoticeStorageKey]);

  useEffect(() => {
    if (!autoSaveEnabled || view !== 'form') return;
    if (ingredientsFormActive && createFlowRef.current) {
      if (!ingredientCreateAutoSaveReady) return;
      if (!ingredientNameBlurredForAutoSave) return;
    }
    if (autoSaveNoticeSeenRef.current) return;
    let seen = false;
    try {
      seen = globalThis.localStorage?.getItem(autoSaveNoticeStorageKey) === '1';
    } catch (err: any) {
      logEvent('autosave.notice.readFailed', { message: err?.message || err || 'unknown' });
    }
    if (seen) {
      autoSaveNoticeSeenRef.current = true;
      return;
    }
    autoSaveNoticeSeenRef.current = true;
    setAutoSaveNoticeOpen(true);
    logEvent('autosave.notice.open', {
      formKey: formKey || null,
      mode: createFlowRef.current ? 'create' : 'edit'
    });
  }, [
    autoSaveEnabled,
    autoSaveNoticeStorageKey,
    createFlowRef,
    formKey,
    ingredientCreateAutoSaveReady,
    ingredientNameBlurredForAutoSave,
    ingredientsFormActive,
    logEvent,
    view
  ]);

  const dismissAutoSaveNotice = useCallback(
    (reason: 'confirm' | 'cancel') => {
      setAutoSaveNoticeOpen(false);
      autoSaveNoticeSeenRef.current = true;
      try {
        globalThis.localStorage?.setItem(autoSaveNoticeStorageKey, '1');
      } catch (err: any) {
        logEvent('autosave.notice.persistFailed', { message: err?.message || err || 'unknown' });
      }
      logEvent('autosave.notice.dismiss', {
        formKey: formKey || null,
        mode: createFlowRef.current ? 'create' : 'edit',
        reason
      });
    },
    [autoSaveNoticeStorageKey, createFlowRef, formKey, logEvent]
  );

  return {
    autoSaveNoticeOpen,
    autoSaveNoticeTitle,
    autoSaveNoticeMessage,
    autoSaveNoticeConfirmLabel,
    autoSaveNoticeCancelLabel,
    dismissAutoSaveNotice,
    setIngredientNameBlurredForAutoSave
  };
};
