import React, { useCallback, useRef, useState } from 'react';

import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, WebQuestionDefinition } from '../../../types';
import { clearUploadFailure, createUploadFailureState, resolveUploadFailureUserMessage, setUploadFailureRetrying, type UploadFailureMap } from '../../app/uploadFailure';
import { resolveUploadBlockUntilSaved } from '../../app/uploadTransaction';
import { resolveUploadWaitMessage } from '../../app/uploadWaitMessages';
import type { LineItemState } from '../../types';
import { applyUploadConstraints, toUploadItems } from '../../components/form/utils';
import { LineItemUploadFailureNotice } from '../lineItems/components/LineItemUploadFailureNotice';

export interface FileOverlayState {
  open: boolean;
  title?: string;
  scope?: 'top' | 'line';
  question?: WebQuestionDefinition;
  group?: WebQuestionDefinition;
  rowId?: string;
  field?: any;
  fieldPath?: string;
  draftItems?: Array<string | File>;
  originalSignature?: string;
  saving?: boolean;
  notice?: { message: string; tone: 'warning' | 'error' };
}

export type UploadRetryTarget = {
  scope: 'top' | 'line';
  fieldPath: string;
  question?: WebQuestionDefinition;
  group?: WebQuestionDefinition;
  rowId?: string;
  field?: any;
  uploadConfig?: any;
};

export type FileUploadOrderedEntryCheckArgs =
  | {
      scope: 'top';
      question: WebQuestionDefinition;
      fieldPath?: string;
      source?: string;
      validate?: boolean;
    }
  | {
      scope: 'line';
      group: WebQuestionDefinition;
      rowId: string;
      field: any;
      fieldPath: string;
      source?: string;
      validate?: boolean;
    };

export type UploadFilesHandler = (args: {
  scope: 'top' | 'line';
  fieldPath: string;
  questionId?: string;
  groupId?: string;
  rowId?: string;
  fieldId?: string;
  items: Array<string | File>;
  uploadConfig?: any;
  busyMessage?: string;
}) => Promise<{ success: boolean; message?: string; items?: string[]; value?: string }>;

type DiagnosticHandler = (event: string, payload?: Record<string, unknown>) => void;

export const useFormUploadController = (args: {
  valuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  language: LangCode;
  submitting: boolean;
  overlayOpen: boolean;
  closeMultiAddOverlay: () => void;
  fileUploadOrderedEntryGateRef: React.MutableRefObject<(args: FileUploadOrderedEntryCheckArgs) => boolean>;
  onUploadFiles?: UploadFilesHandler;
  onDiagnostic?: DiagnosticHandler;
}) => {
  const {
    valuesRef,
    lineItemsRef,
    language,
    submitting,
    overlayOpen,
    closeMultiAddOverlay,
    fileUploadOrderedEntryGateRef,
    onUploadFiles,
    onDiagnostic
  } = args;
  const [fileOverlay, setFileOverlay] = useState<FileOverlayState>({ open: false });
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [dragState, setDragState] = useState<Record<string, boolean>>({});
  const dragCounterRef = useRef<Record<string, number>>({});
  const [uploadAnnouncements, setUploadAnnouncements] = useState<Record<string, string>>({});
  const [uploadFailures, setUploadFailures] = useState<UploadFailureMap<UploadRetryTarget>>({});

  const fileItemsSignature = useCallback((items: Array<string | File>): string => {
    return (items || [])
      .map(item => {
        if (typeof item === 'string') return `url:${item}`;
        return `file:${item.name}:${item.size}:${item.lastModified}:${item.type || ''}`;
      })
      .join('|');
  }, []);

  const resolveFileOverlayItems = useCallback((state: Omit<FileOverlayState, 'open'> | FileOverlayState): Array<string | File> => {
    if (state.scope === 'top' && state.question) {
      return toUploadItems(valuesRef.current[(state.question as any).id]);
    }
    if (state.scope === 'line' && state.group && state.rowId && state.field) {
      const groupId = (state.group as any).id;
      const rowId = state.rowId as string;
      const fieldId = (state.field as any).id;
      const rows = lineItemsRef.current[groupId] || [];
      const row = rows.find(r => r.id === rowId);
      return toUploadItems((row?.values || {})[fieldId] as any);
    }
    return [];
  }, [lineItemsRef, valuesRef]);

  const dismissFileOverlay = useCallback(() => {
    setFileOverlay({ open: false });
    onDiagnostic?.('upload.overlay.close');
  }, [onDiagnostic]);

  const closeFileOverlay = useCallback(() => {
    const current = fileOverlay;
    if (current.open && current.saving) return;
    const draftSignature = fileItemsSignature(current.draftItems || []);
    const dirty = current.open && draftSignature !== (current.originalSignature || '');
    if (dirty) {
      const uploadConfig =
        current.scope === 'top' && current.question
          ? ((current.question as any).uploadConfig || {})
          : current.scope === 'line' && current.field
            ? ((current.field as any).uploadConfig || {})
            : {};
      const configuredMessage = resolveLocalizedString((uploadConfig as any).discardChangesConfirm, language, '').trim();
      const msg =
        configuredMessage ||
        tSystem(
          'files.discardChangesConfirm',
          language,
          'The photos you changed are not saved yet. Close without saving them?'
        );
      const ok =
        typeof globalThis !== 'undefined' && typeof (globalThis as any).confirm === 'function'
          ? (globalThis as any).confirm(msg)
          : true;
      if (!ok) return;
      onDiagnostic?.('upload.overlay.discard', { scope: current.scope, title: current.title || null });
    }
    dismissFileOverlay();
  }, [dismissFileOverlay, fileItemsSignature, fileOverlay, language, onDiagnostic]);

  const openFileOverlay = useCallback(
    (next: Omit<FileOverlayState, 'open'>) => {
      if (submitting) return;
      const orderedEntryBlocked = (() => {
        if (next.scope === 'top' && next.question) {
          return fileUploadOrderedEntryGateRef.current({
            scope: 'top',
            question: next.question,
            fieldPath: next.fieldPath || next.question.id,
            source: 'overlay'
          });
        }
        if (next.scope === 'line' && next.group && next.rowId && next.field && next.fieldPath) {
          return fileUploadOrderedEntryGateRef.current({
            scope: 'line',
            group: next.group,
            rowId: next.rowId,
            field: next.field,
            fieldPath: next.fieldPath,
            source: 'overlay'
          });
        }
        return false;
      })();
      if (orderedEntryBlocked) return;
      if (overlayOpen) {
        closeMultiAddOverlay();
      }
      const draftItems = resolveFileOverlayItems(next);
      setFileOverlay({
        open: true,
        ...next,
        draftItems,
        originalSignature: fileItemsSignature(draftItems),
        saving: false,
        notice: undefined
      });
      onDiagnostic?.('upload.overlay.open', { scope: next.scope, title: next.title });
    },
    [
      closeMultiAddOverlay,
      fileItemsSignature,
      fileUploadOrderedEntryGateRef,
      onDiagnostic,
      overlayOpen,
      resolveFileOverlayItems,
      submitting
    ]
  );

  const setDragActive = useCallback((questionId: string, active: boolean) => {
    setDragState(prev => {
      if (prev[questionId] === active) return prev;
      return { ...prev, [questionId]: active };
    });
  }, []);

  const incrementDrag = useCallback(
    (questionId: string) => {
      const next = (dragCounterRef.current[questionId] || 0) + 1;
      dragCounterRef.current[questionId] = next;
      setDragActive(questionId, true);
    },
    [setDragActive]
  );

  const decrementDrag = useCallback(
    (questionId: string) => {
      const next = Math.max(0, (dragCounterRef.current[questionId] || 0) - 1);
      dragCounterRef.current[questionId] = next;
      if (next === 0) {
        setDragActive(questionId, false);
      }
    },
    [setDragActive]
  );

  const resetDrag = useCallback(
    (questionId: string) => {
      dragCounterRef.current[questionId] = 0;
      setDragActive(questionId, false);
    },
    [setDragActive]
  );

  const announceUpload = useCallback((questionId: string, message: string) => {
    setUploadAnnouncements(prev => ({ ...prev, [questionId]: message }));
  }, []);

  const uploadFailureMessage = useCallback(
    (rawMessage?: string | null) =>
      resolveUploadFailureUserMessage({
        rawMessage,
        fallback: tSystem(
          'files.error.saveFailed',
          language,
          'The photos were not saved. Check the connection and try again.'
        )
      }),
    [language]
  );

  const clearUploadFailureForField = useCallback((fieldPath: string) => {
    setUploadFailures(prev => clearUploadFailure(prev, fieldPath));
  }, []);

  const recordUploadFailure = useCallback(
    (target: UploadRetryTarget, rawMessage?: string | null) => {
      const message = uploadFailureMessage(rawMessage);
      setUploadFailures(prev => ({
        ...prev,
        [target.fieldPath]: createUploadFailureState({
          target,
          message,
          rawMessage
        })
      }));
      onDiagnostic?.('upload.failure.visible', {
        fieldPath: target.fieldPath,
        scope: target.scope,
        rawMessage: rawMessage || ''
      });
      return message;
    },
    [onDiagnostic, uploadFailureMessage]
  );

  const resolveUploadRetryItems = useCallback((target: UploadRetryTarget): Array<string | File> => {
    if (target.scope === 'top' && target.question) {
      return toUploadItems(valuesRef.current[target.question.id]);
    }
    if (target.scope === 'line' && target.group && target.rowId && target.field) {
      const rows = lineItemsRef.current[target.group.id] || [];
      const row = rows.find(candidate => candidate.id === target.rowId);
      return toUploadItems((row?.values || {})[target.field.id] as any);
    }
    return [];
  }, [lineItemsRef, valuesRef]);

  const retryUploadFailure = useCallback(
    async (fieldPath: string) => {
      const failure = uploadFailures[fieldPath];
      if (!failure || failure.retrying || !onUploadFiles) return;
      const target = failure.target;
      const items = resolveUploadRetryItems(target);
      const openOverlayFieldPath =
        fileOverlay.open && fileOverlay.scope === 'top' && fileOverlay.question
          ? fileOverlay.question.id
          : fileOverlay.open && fileOverlay.scope === 'line'
            ? fileOverlay.fieldPath || ''
            : '';
      setUploadFailures(prev => setUploadFailureRetrying(prev, fieldPath, true));
      announceUpload(fieldPath, tSystem('common.loading', language, 'Loading…'));
      onDiagnostic?.('upload.retry', { fieldPath, scope: target.scope, total: items.length });
      try {
        const res = await onUploadFiles({
          scope: target.scope,
          fieldPath: target.fieldPath,
          questionId: target.scope === 'top' ? target.question?.id : undefined,
          groupId: target.scope === 'line' ? target.group?.id : undefined,
          rowId: target.scope === 'line' ? target.rowId : undefined,
          fieldId: target.scope === 'line' ? target.field?.id : undefined,
          items,
          uploadConfig: target.uploadConfig,
          busyMessage: resolveUploadBlockUntilSaved(target.uploadConfig)
            ? resolveUploadWaitMessage(target.uploadConfig, language, 'save')
            : undefined
        });
        if (!res?.success) {
          const message = uploadFailureMessage(res?.message);
          setUploadFailures(prev => {
            const existing = prev[fieldPath];
            if (!existing) return prev;
            return {
              ...prev,
              [fieldPath]: {
                ...existing,
                message,
                rawMessage: res?.message,
                retrying: false
              }
            };
          });
          announceUpload(fieldPath, message);
          onDiagnostic?.('upload.retry.failed', { fieldPath, scope: target.scope, rawMessage: res?.message || '' });
          return;
        }
        setUploadFailures(prev => clearUploadFailure(prev, fieldPath));
        announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
        if (openOverlayFieldPath === fieldPath) {
          dismissFileOverlay();
        }
        onDiagnostic?.('upload.retry.success', { fieldPath, scope: target.scope });
      } catch (err: any) {
        const message = uploadFailureMessage(err?.message);
        setUploadFailures(prev => {
          const existing = prev[fieldPath];
          if (!existing) return prev;
          return {
            ...prev,
            [fieldPath]: {
              ...existing,
              message,
              rawMessage: err?.message,
              retrying: false
            }
          };
        });
        announceUpload(fieldPath, message);
        onDiagnostic?.('upload.retry.failed', { fieldPath, scope: target.scope, rawMessage: err?.message || '' });
      }
    },
    [
      announceUpload,
      dismissFileOverlay,
      fileOverlay,
      language,
      onDiagnostic,
      onUploadFiles,
      resolveUploadRetryItems,
      uploadFailureMessage,
      uploadFailures
    ]
  );

  const renderUploadFailure = useCallback(
    (fieldPath: string, disabled?: boolean) => (
      <LineItemUploadFailureNotice
        language={language}
        fieldPath={fieldPath}
        failure={uploadFailures[fieldPath]}
        disabled={disabled}
        onRetry={onUploadFiles ? retryUploadFailure : undefined}
      />
    ),
    [language, onUploadFiles, retryUploadFailure, uploadFailures]
  );

  const resetNativeFileInput = useCallback((questionId: string) => {
    const input = fileInputsRef.current[questionId];
    if (input) {
      input.value = '';
    }
  }, []);

  const stageFilesInOverlay = useCallback(
    (stageArgs: {
      scope: 'top' | 'line';
      fieldPath: string;
      question?: WebQuestionDefinition;
      field?: any;
      incoming: File[];
      onCommitBlockUntilSaved?: (items: Array<string | File>) => void;
    }): boolean => {
      if (!fileOverlay.open) return false;
      const overlayFieldPath =
        fileOverlay.scope === 'top' && fileOverlay.question
          ? fileOverlay.question.id
          : fileOverlay.scope === 'line'
            ? fileOverlay.fieldPath || ''
            : '';
      if (fileOverlay.scope !== stageArgs.scope || overlayFieldPath !== stageArgs.fieldPath) return false;
      const uploadField = (stageArgs.question || stageArgs.field || {}) as WebQuestionDefinition;
      const existing = fileOverlay.draftItems || [];
      const { items, errorMessage, warningMessage } = applyUploadConstraints(uploadField, existing, stageArgs.incoming, language);
      const accepted = Math.max(0, items.length - existing.length);
      const blockUntilSaved = resolveUploadBlockUntilSaved((uploadField as any)?.uploadConfig);
      const constraintMessage = errorMessage || warningMessage;
      setFileOverlay(prev => {
        if (!prev.open) return prev;
        const prevFieldPath =
          prev.scope === 'top' && prev.question
            ? prev.question.id
            : prev.scope === 'line'
              ? prev.fieldPath || ''
              : '';
        if (prev.scope !== stageArgs.scope || prevFieldPath !== stageArgs.fieldPath) return prev;
        return {
          ...prev,
          draftItems: items,
          saving: blockUntilSaved && !errorMessage && accepted > 0 ? true : prev.saving,
          notice: constraintMessage ? { message: constraintMessage, tone: errorMessage ? 'error' : 'warning' } : undefined
        };
      });
      if (constraintMessage) {
        announceUpload(stageArgs.fieldPath, constraintMessage);
        onDiagnostic?.(errorMessage ? 'upload.overlay.error' : 'upload.overlay.warning', {
          fieldPath: stageArgs.fieldPath,
          message: constraintMessage,
          scope: stageArgs.scope
        });
      } else if (accepted > 0) {
        clearUploadFailureForField(stageArgs.fieldPath);
        announceUpload(
          stageArgs.fieldPath,
          accepted === 1
            ? tSystem('files.selectedOne', language, '1 photo added')
            : tSystem('files.selectedMany', language, '{count} photos added', { count: accepted })
        );
      } else {
        announceUpload(stageArgs.fieldPath, tSystem('common.noChange', language, 'No change.'));
      }
      onDiagnostic?.('upload.overlay.stage', {
        fieldPath: stageArgs.fieldPath,
        attempted: stageArgs.incoming.length,
        accepted,
        total: items.length,
        error: Boolean(errorMessage),
        warning: Boolean(warningMessage),
        scope: stageArgs.scope,
        blockUntilSaved
      });
      if (blockUntilSaved && !errorMessage && accepted > 0) {
        stageArgs.onCommitBlockUntilSaved?.(items);
      }
      return true;
    },
    [announceUpload, clearUploadFailureForField, fileOverlay, language, onDiagnostic]
  );

  const updateFileOverlayAfterImmediateAction = useCallback(
    (updateArgs: { scope: 'top' | 'line'; fieldPath: string; items: Array<string | File>; saving: boolean; saved?: boolean }) => {
      setFileOverlay(prev => {
        if (!prev.open) return prev;
        const prevFieldPath =
          prev.scope === 'top' && prev.question
            ? prev.question.id
            : prev.scope === 'line'
              ? prev.fieldPath || ''
              : '';
        if (prev.scope !== updateArgs.scope || prevFieldPath !== updateArgs.fieldPath) return prev;
        return {
          ...prev,
          draftItems: updateArgs.items,
          originalSignature: updateArgs.saved ? fileItemsSignature(updateArgs.items) : prev.originalSignature,
          saving: updateArgs.saving
        };
      });
    },
    [fileItemsSignature]
  );

  return {
    fileOverlay,
    setFileOverlay,
    fileInputsRef,
    dragState,
    uploadAnnouncements,
    uploadFailures,
    fileItemsSignature,
    resolveFileOverlayItems,
    dismissFileOverlay,
    closeFileOverlay,
    openFileOverlay,
    incrementDrag,
    decrementDrag,
    resetDrag,
    announceUpload,
    clearUploadFailureForField,
    recordUploadFailure,
    retryUploadFailure,
    renderUploadFailure,
    resetNativeFileInput,
    stageFilesInOverlay,
    updateFileOverlayAfterImmediateAction
  };
};
