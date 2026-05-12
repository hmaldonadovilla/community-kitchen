import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, WebQuestionDefinition } from '../../../../types';
import { resolveUploadBlockUntilSaved } from '../../../app/uploadTransaction';
import { resolveUploadWaitMessage } from '../../../app/uploadWaitMessages';
import { FileOverlay } from '../../../components/form/overlays/FileOverlay';
import { describeUploadItem } from '../../../components/form/utils';
import type {
  FileOverlayState,
  FileUploadOrderedEntryCheckArgs,
  UploadFilesHandler,
  UploadRetryTarget
} from '../useFormUploadController';

type UploadFailureLike = {
  message?: string;
  retrying?: boolean;
};

export const FormFileOverlay: React.FC<{
  fileOverlay: FileOverlayState;
  setFileOverlay: React.Dispatch<React.SetStateAction<FileOverlayState>>;
  language: LangCode;
  submitting: boolean;
  uploadFailures: Record<string, UploadFailureLike | undefined>;
  fileInputsRef: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  fileItemsSignature: (items: Array<string | File>) => string;
  resolveFileOverlayItems: (state: Omit<FileOverlayState, 'open'> | FileOverlayState) => Array<string | File>;
  checkFileUploadOrderedEntry: (args: FileUploadOrderedEntryCheckArgs) => boolean;
  checkLineFileUploadOrderedEntry: (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    source?: string;
    validate?: boolean;
  }) => boolean;
  handleFileFieldChange: (question: WebQuestionDefinition, items: Array<string | File>) => void;
  handleLineFieldChange: (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => void;
  clearUploadFailureForField: (fieldPath: string) => void;
  announceUpload: (fieldPath: string, message: string) => void;
  recordUploadFailure: (target: UploadRetryTarget, rawMessage?: string | null) => string;
  updateFileOverlayAfterImmediateAction: (args: {
    scope: 'top' | 'line';
    fieldPath: string;
    items: Array<string | File>;
    saving: boolean;
    saved?: boolean;
  }) => void;
  dismissFileOverlay: () => void;
  closeFileOverlay: () => void;
  retryUploadFailure: (fieldPath: string) => void | Promise<void>;
  onUploadFiles?: UploadFilesHandler;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  fileOverlay,
  setFileOverlay,
  language,
  submitting,
  uploadFailures,
  fileInputsRef,
  fileItemsSignature,
  resolveFileOverlayItems,
  checkFileUploadOrderedEntry,
  checkLineFileUploadOrderedEntry,
  handleFileFieldChange,
  handleLineFieldChange,
  clearUploadFailureForField,
  announceUpload,
  recordUploadFailure,
  updateFileOverlayAfterImmediateAction,
  dismissFileOverlay,
  closeFileOverlay,
  retryUploadFailure,
  onUploadFiles,
  onDiagnostic
}) => {
  if (!fileOverlay.open) return null;
  if (typeof document === 'undefined') return null;

  const title = fileOverlay.title || tSystem('files.title', language, 'Photos');
  const isTop = fileOverlay.scope === 'top' && !!fileOverlay.question;
  const isLine =
    fileOverlay.scope === 'line' &&
    !!fileOverlay.group &&
    !!fileOverlay.rowId &&
    !!fileOverlay.field &&
    !!fileOverlay.fieldPath;

  if (!isTop && !isLine) return null;

  const fieldPath = isTop ? (fileOverlay.question!.id || '') : (fileOverlay.fieldPath || '');
  const uploadConfig: any = isTop ? (fileOverlay.question as any)?.uploadConfig || {} : (fileOverlay.field as any)?.uploadConfig || {};
  const readOnly = Boolean(isTop ? (fileOverlay.question as any)?.readOnly : (fileOverlay.field as any)?.readOnly);
  const orderedUploadBlocked = isTop
    ? checkFileUploadOrderedEntry({
        scope: 'top',
        question: fileOverlay.question!,
        fieldPath,
        source: 'render',
        validate: false
      })
    : checkLineFileUploadOrderedEntry({
        group: fileOverlay.group!,
        rowId: fileOverlay.rowId as string,
        field: fileOverlay.field,
        fieldPath,
        source: 'render',
        validate: false
      });
  const overlayReadOnly = readOnly || orderedUploadBlocked;
  const items = fileOverlay.draftItems || resolveFileOverlayItems(fileOverlay);
  const dirty = fileItemsSignature(items) !== (fileOverlay.originalSignature || fileItemsSignature(resolveFileOverlayItems(fileOverlay)));
  const blockUntilSaved = resolveUploadBlockUntilSaved(uploadConfig);
  const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;

  const onAdd = () => {
    if (submitting || readOnly || fileOverlay.saving) return;
    if (isTop) {
      if (
        checkFileUploadOrderedEntry({
          scope: 'top',
          question: fileOverlay.question!,
          fieldPath,
          source: 'overlay.add'
        })
      ) {
        return;
      }
    } else if (
      checkLineFileUploadOrderedEntry({
        group: fileOverlay.group!,
        rowId: fileOverlay.rowId as string,
        field: fileOverlay.field,
        fieldPath,
        source: 'overlay.add'
      })
    ) {
      return;
    }
    if (maxed) return;
    fileInputsRef.current[fieldPath]?.click();
  };

  const commitImmediateItems = (nextItems: Array<string | File>, action: 'removeOne' | 'removeAll') => {
    if (submitting || readOnly || fileOverlay.saving) return;
    const waitMessage = resolveUploadWaitMessage(uploadConfig, language, 'removeSelected');
    const uploadTarget: UploadRetryTarget = {
      scope: isTop ? 'top' : 'line',
      fieldPath,
      question: isTop ? fileOverlay.question : undefined,
      group: isLine ? fileOverlay.group : undefined,
      rowId: isLine ? (fileOverlay.rowId as string) : undefined,
      field: isLine ? fileOverlay.field : undefined,
      uploadConfig
    };
    setFileOverlay(prev => (prev.open ? { ...prev, draftItems: nextItems, saving: true, notice: undefined } : prev));
    clearUploadFailureForField(fieldPath);
    if (isTop) {
      handleFileFieldChange(fileOverlay.question!, nextItems);
    } else {
      handleLineFieldChange(
        fileOverlay.group!,
        fileOverlay.rowId as string,
        fileOverlay.field,
        nextItems as unknown as FieldValue
      );
    }
    announceUpload(fieldPath, waitMessage);
    onDiagnostic?.('upload.overlay.immediateRemove.start', {
      fieldPath,
      scope: isTop ? 'top' : 'line',
      action,
      total: nextItems.length
    });
    const uploadPromise: Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> = onUploadFiles
      ? onUploadFiles({
          scope: uploadTarget.scope,
          fieldPath: uploadTarget.fieldPath,
          questionId: uploadTarget.scope === 'top' ? uploadTarget.question?.id : undefined,
          groupId: uploadTarget.scope === 'line' ? uploadTarget.group?.id : undefined,
          rowId: uploadTarget.scope === 'line' ? uploadTarget.rowId : undefined,
          fieldId: uploadTarget.scope === 'line' ? uploadTarget.field?.id : undefined,
          items: nextItems,
          uploadConfig,
          busyMessage: waitMessage
        })
      : Promise.resolve({ success: true, items: nextItems.filter((item): item is string => typeof item === 'string') });
    void uploadPromise
      .then(res => {
        if (!res?.success) {
          const message = recordUploadFailure(uploadTarget, res?.message);
          announceUpload(fieldPath, message);
          updateFileOverlayAfterImmediateAction({ scope: isTop ? 'top' : 'line', fieldPath, items: nextItems, saving: false });
          return;
        }
        const savedItems = Array.isArray(res.items) ? res.items : nextItems.filter((item): item is string => typeof item === 'string');
        clearUploadFailureForField(fieldPath);
        announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
        updateFileOverlayAfterImmediateAction({ scope: isTop ? 'top' : 'line', fieldPath, items: savedItems, saving: false, saved: true });
        onDiagnostic?.('upload.overlay.immediateRemove.success', {
          fieldPath,
          scope: isTop ? 'top' : 'line',
          action,
          total: savedItems.length
        });
      })
      .catch((err: any) => {
        const message = recordUploadFailure(uploadTarget, err?.message);
        announceUpload(fieldPath, message);
        updateFileOverlayAfterImmediateAction({ scope: isTop ? 'top' : 'line', fieldPath, items: nextItems, saving: false });
      });
  };

  const onClearAll = () => {
    if (submitting || readOnly || fileOverlay.saving) return;
    if (blockUntilSaved) {
      commitImmediateItems([], 'removeAll');
      return;
    }
    setFileOverlay(prev => (prev.open ? { ...prev, draftItems: [], notice: undefined } : prev));
    clearUploadFailureForField(fieldPath);
    announceUpload(fieldPath, tSystem('files.clearAll', language, 'Remove all'));
    onDiagnostic?.('upload.overlay.clear', { fieldPath });
  };

  const onRemoveAt = (idx: number) => {
    if (submitting || readOnly || fileOverlay.saving) return;
    const removed = items[idx];
    const nextItems = items.filter((_, itemIdx) => itemIdx !== idx);
    if (blockUntilSaved) {
      commitImmediateItems(nextItems, 'removeOne');
      return;
    }
    setFileOverlay(prev => (prev.open ? { ...prev, draftItems: nextItems, notice: undefined } : prev));
    clearUploadFailureForField(fieldPath);
    announceUpload(
      fieldPath,
      removed
        ? `${tSystem('lineItems.remove', language, 'Remove')} ${describeUploadItem(removed as any)}.`
        : tSystem('lineItems.remove', language, 'Remove')
    );
    onDiagnostic?.('upload.overlay.remove', { fieldPath, removed: describeUploadItem(removed as any), remaining: nextItems.length });
  };

  const onSave = async () => {
    if (blockUntilSaved || submitting || readOnly || fileOverlay.saving) return;
    if (!dirty) {
      dismissFileOverlay();
      return;
    }
    setFileOverlay(prev => (prev.open ? { ...prev, saving: true } : prev));
    const uploadTarget: UploadRetryTarget = {
      scope: isTop ? 'top' : 'line',
      fieldPath,
      question: isTop ? fileOverlay.question : undefined,
      group: isLine ? fileOverlay.group : undefined,
      rowId: isLine ? (fileOverlay.rowId as string) : undefined,
      field: isLine ? fileOverlay.field : undefined,
      uploadConfig
    };
    clearUploadFailureForField(fieldPath);
    try {
      if (isTop) {
        handleFileFieldChange(fileOverlay.question!, items);
      } else {
        handleLineFieldChange(
          fileOverlay.group!,
          fileOverlay.rowId as string,
          fileOverlay.field,
          items as unknown as FieldValue
        );
      }
      onDiagnostic?.('upload.overlay.save', {
        fieldPath,
        total: items.length,
        scope: isTop ? 'top' : 'line',
        wait: false
      });
      const uploadPromise: Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> = onUploadFiles
        ? onUploadFiles({
            scope: uploadTarget.scope,
            fieldPath: uploadTarget.fieldPath,
            questionId: uploadTarget.scope === 'top' ? uploadTarget.question?.id : undefined,
            groupId: uploadTarget.scope === 'line' ? uploadTarget.group?.id : undefined,
            rowId: uploadTarget.scope === 'line' ? uploadTarget.rowId : undefined,
            fieldId: uploadTarget.scope === 'line' ? uploadTarget.field?.id : undefined,
            items,
            uploadConfig
          })
        : Promise.resolve({ success: true });
      void uploadPromise
        .then(res => {
          if (!res?.success) {
            const message = recordUploadFailure(uploadTarget, res?.message);
            announceUpload(fieldPath, message);
            return;
          }
          clearUploadFailureForField(fieldPath);
          announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
        })
        .catch((err: any) => {
          const message = recordUploadFailure(uploadTarget, err?.message);
          announceUpload(fieldPath, message);
        });
      dismissFileOverlay();
    } catch (err: any) {
      const message = recordUploadFailure(uploadTarget, err?.message);
      announceUpload(fieldPath, message);
      setFileOverlay(prev => (prev.open ? { ...prev, saving: false } : prev));
    }
  };

  return (
    <FileOverlay
      open={fileOverlay.open}
      language={language}
      title={title}
      submitting={submitting}
      readOnly={overlayReadOnly}
      items={items}
      uploadConfig={uploadConfig}
      dirty={dirty}
      saving={fileOverlay.saving === true}
      notice={fileOverlay.notice?.message}
      noticeTone={fileOverlay.notice?.tone}
      saveError={uploadFailures[fieldPath]?.message}
      saveRetrying={uploadFailures[fieldPath]?.retrying}
      onAdd={onAdd}
      onSave={blockUntilSaved ? undefined : onSave}
      onRetrySave={uploadFailures[fieldPath] ? () => retryUploadFailure(fieldPath) : undefined}
      onClearAll={onClearAll}
      onRemoveAt={onRemoveAt}
      onClose={closeFileOverlay}
    />
  );
};
