import type { Dispatch, DragEvent, MutableRefObject, SetStateAction } from 'react';
import type { FieldValue, LangCode, WebQuestionDefinition } from '../../../../types';
import type { FormErrors, LineItemState } from '../../../types';
import { tSystem } from '../../../../systemStrings';
import { resolveFieldLabel } from '../../../utils/labels';
import { validateUploadCounts } from '../../../app/submission';
import { resolveUploadBlockUntilSaved } from '../../../app/uploadTransaction';
import { resolveUploadWaitMessage } from '../../../app/uploadWaitMessages';
import { applyUploadConstraints, describeUploadItem, toUploadItems } from '../../../components/form/utils';
import type { FileUploadOrderedEntryCheckArgs, UploadRetryTarget } from '../useFormUploadController';

type UploadFilesHandler = (args: {
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

interface StageFilesInOverlayArgs {
  scope: 'top' | 'line';
  fieldPath: string;
  question?: WebQuestionDefinition;
  field?: any;
  incoming: File[];
  onCommitBlockUntilSaved: (items: Array<string | File>) => void;
}

interface UpdateFileOverlayAfterImmediateActionArgs {
  scope: 'top' | 'line';
  fieldPath: string;
  items: Array<string | File> | string[];
  saving: boolean;
  saved?: boolean;
}

interface UseFormFileUploadHandlersArgs {
  language: LangCode;
  submitting: boolean;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: MutableRefObject<LineItemState>;
  setValuesSynced: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setErrors: Dispatch<SetStateAction<FormErrors>>;
  onStatusClear?: () => void;
  onUploadFiles?: UploadFilesHandler;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  fileUploadOrderedEntryGateRef: MutableRefObject<(args: FileUploadOrderedEntryCheckArgs) => boolean>;
  stageFilesInOverlay: (args: StageFilesInOverlayArgs) => boolean;
  updateFileOverlayAfterImmediateAction: (args: UpdateFileOverlayAfterImmediateActionArgs) => void;
  resetNativeFileInput: (fieldPath: string) => void;
  resetDrag: (fieldPath: string) => void;
  announceUpload: (fieldPath: string, message: string) => void;
  clearUploadFailureForField: (fieldPath: string) => void;
  recordUploadFailure: (target: UploadRetryTarget, message?: string) => string;
  handleLineFieldChange: (
    group: WebQuestionDefinition,
    rowId: string,
    field: any,
    value: FieldValue
  ) => void;
}

export function useFormFileUploadHandlers({
  language,
  submitting,
  valuesRef,
  lineItemsRef,
  setValuesSynced,
  setErrors,
  onStatusClear,
  onUploadFiles,
  onDiagnostic,
  fileUploadOrderedEntryGateRef,
  stageFilesInOverlay,
  updateFileOverlayAfterImmediateAction,
  resetNativeFileInput,
  resetDrag,
  announceUpload,
  clearUploadFailureForField,
  recordUploadFailure,
  handleLineFieldChange
}: UseFormFileUploadHandlersArgs) {
  const handleFileFieldChange = (
    question: WebQuestionDefinition,
    items: Array<string | File>,
    errorMessage?: string
  ) => {
    if (onStatusClear) onStatusClear();
    setValuesSynced(prev => ({ ...prev, [question.id]: items as unknown as FieldValue }));
    const fieldLabel = resolveFieldLabel(question as any, language, question.id);
    const validationMessage = errorMessage
      ? ''
      : validateUploadCounts({
          value: items,
          uploadConfig: (question as any)?.uploadConfig,
          required: !!(question as any)?.required,
          requiredMessage: (question as any)?.requiredMessage,
          language,
          fieldLabel
        });
    setErrors(prev => {
      const next = { ...prev };
      const nextMessage = errorMessage || validationMessage;
      if (nextMessage) {
        next[question.id] = nextMessage;
      } else {
        delete next[question.id];
      }
      return next;
    });
  };

  const processIncomingFiles = (question: WebQuestionDefinition, incoming: File[]) => {
    if (!incoming.length) return;
    const existing = toUploadItems(valuesRef.current[question.id]);
    const { items, errorMessage } = applyUploadConstraints(question, existing, incoming, language);
    handleFileFieldChange(question, items, errorMessage);
    const accepted = Math.max(0, items.length - existing.length);
    if (errorMessage) {
      announceUpload(question.id, errorMessage);
      onDiagnostic?.('upload.error', { questionId: question.id, error: errorMessage });
    } else if (accepted > 0) {
      announceUpload(
        question.id,
        accepted === 1
          ? tSystem('files.selectedOne', language, '1 photo added')
          : tSystem('files.selectedMany', language, '{count} photos added', { count: accepted })
      );
    } else {
      announceUpload(question.id, tSystem('common.noChange', language, 'No change.'));
    }
    onDiagnostic?.('upload.add', {
      questionId: question.id,
      attempted: incoming.length,
      accepted,
      total: items.length,
      error: Boolean(errorMessage)
    });

    if (onUploadFiles && accepted > 0) {
      const uploadTarget: UploadRetryTarget = {
        scope: 'top',
        fieldPath: question.id,
        question,
        uploadConfig: (question as any)?.uploadConfig
      };
      clearUploadFailureForField(question.id);
      announceUpload(question.id, tSystem('common.loading', language, 'Loading…'));
      void onUploadFiles({
        scope: uploadTarget.scope,
        fieldPath: uploadTarget.fieldPath,
        questionId: question.id,
        items,
        uploadConfig: uploadTarget.uploadConfig,
        busyMessage: resolveUploadBlockUntilSaved(uploadTarget.uploadConfig)
          ? resolveUploadWaitMessage(uploadTarget.uploadConfig, language, 'save')
          : undefined
      })
        .then(res => {
          if (!res?.success) {
            const message = recordUploadFailure(uploadTarget, res?.message);
            announceUpload(question.id, message);
            return;
          }
          clearUploadFailureForField(question.id);
          announceUpload(question.id, tSystem('files.uploaded', language, 'Added'));
        })
        .catch((err: any) => {
          const message = recordUploadFailure(uploadTarget, err?.message);
          announceUpload(question.id, message);
        });
    }
  };

  const handleFileInputChange = (question: WebQuestionDefinition, list: FileList | null) => {
    if (!list || !list.length) {
      resetNativeFileInput(question.id);
      return;
    }
    if (submitting || question.readOnly === true) {
      onDiagnostic?.('upload.add.blocked', {
        scope: 'top',
        questionId: question.id,
        reason: submitting ? 'submitting' : 'readOnly'
      });
      resetNativeFileInput(question.id);
      return;
    }
    if (
      fileUploadOrderedEntryGateRef.current({
        scope: 'top',
        question,
        fieldPath: question.id,
        source: 'input'
      })
    ) {
      resetNativeFileInput(question.id);
      return;
    }
    if (
      stageFilesInOverlay({
        scope: 'top',
        fieldPath: question.id,
        question,
        incoming: Array.from(list),
        onCommitBlockUntilSaved: items => {
          const uploadConfig = (question as any)?.uploadConfig || {};
          const uploadTarget: UploadRetryTarget = {
            scope: 'top',
            fieldPath: question.id,
            question,
            uploadConfig
          };
          handleFileFieldChange(question, items);
          clearUploadFailureForField(question.id);
          const waitMessage = resolveUploadWaitMessage(uploadConfig, language, 'save');
          announceUpload(question.id, waitMessage);
          onDiagnostic?.('upload.overlay.immediateSave.start', {
            fieldPath: question.id,
            scope: 'top',
            total: items.length
          });
          const uploadPromise: Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> = onUploadFiles
            ? onUploadFiles({
                scope: 'top',
                fieldPath: question.id,
                questionId: question.id,
                items,
                uploadConfig,
                busyMessage: waitMessage
              })
            : Promise.resolve({ success: true, items: items.filter((item): item is string => typeof item === 'string') });
          void uploadPromise
            .then(res => {
              if (!res?.success) {
                const message = recordUploadFailure(uploadTarget, res?.message);
                announceUpload(question.id, message);
                updateFileOverlayAfterImmediateAction({ scope: 'top', fieldPath: question.id, items, saving: false });
                return;
              }
              const savedItems = Array.isArray(res.items)
                ? res.items
                : items.filter((item): item is string => typeof item === 'string');
              clearUploadFailureForField(question.id);
              announceUpload(question.id, tSystem('files.uploaded', language, 'Added'));
              updateFileOverlayAfterImmediateAction({
                scope: 'top',
                fieldPath: question.id,
                items: savedItems,
                saving: false,
                saved: true
              });
              onDiagnostic?.('upload.overlay.immediateSave.success', {
                fieldPath: question.id,
                scope: 'top',
                total: savedItems.length
              });
            })
            .catch((err: any) => {
              const message = recordUploadFailure(uploadTarget, err?.message);
              announceUpload(question.id, message);
              updateFileOverlayAfterImmediateAction({ scope: 'top', fieldPath: question.id, items, saving: false });
            });
        }
      })
    ) {
      resetNativeFileInput(question.id);
      return;
    }
    processIncomingFiles(question, Array.from(list));
    resetNativeFileInput(question.id);
  };

  const processIncomingFilesForLineField = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    incoming: File[];
  }) => {
    const { group, rowId, field, fieldPath, incoming } = args;
    if (!incoming.length) return;
    const existingRows = lineItemsRef.current[group.id] || [];
    const currentRow = existingRows.find(row => row.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    const pseudo = { uploadConfig: field.uploadConfig } as unknown as WebQuestionDefinition;
    const { items: files, errorMessage } = applyUploadConstraints(pseudo, existingFiles, incoming, language);

    handleLineFieldChange(group, rowId, field, files as unknown as FieldValue);
    setErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[fieldPath] = errorMessage;
      } else {
        delete next[fieldPath];
      }
      return next;
    });

    const accepted = Math.max(0, files.length - existingFiles.length);
    if (errorMessage) {
      announceUpload(fieldPath, errorMessage);
      onDiagnostic?.('upload.error', { fieldPath, error: errorMessage, scope: 'line' });
    } else if (accepted > 0) {
      announceUpload(
        fieldPath,
        accepted === 1
          ? tSystem('files.selectedOne', language, '1 photo added')
          : tSystem('files.selectedMany', language, '{count} photos added', { count: accepted })
      );
    } else {
      announceUpload(fieldPath, tSystem('common.noChange', language, 'No change.'));
    }
    onDiagnostic?.('upload.add', {
      fieldPath,
      attempted: incoming.length,
      accepted,
      total: files.length,
      error: Boolean(errorMessage),
      scope: 'line'
    });

    if (onUploadFiles && accepted > 0) {
      const uploadTarget: UploadRetryTarget = {
        scope: 'line',
        fieldPath,
        group,
        rowId,
        field,
        uploadConfig: field.uploadConfig
      };
      clearUploadFailureForField(fieldPath);
      announceUpload(fieldPath, tSystem('common.loading', language, 'Loading…'));
      void onUploadFiles({
        scope: uploadTarget.scope,
        fieldPath: uploadTarget.fieldPath,
        groupId: group.id,
        rowId,
        fieldId: field.id,
        items: files,
        uploadConfig: uploadTarget.uploadConfig,
        busyMessage: resolveUploadBlockUntilSaved(uploadTarget.uploadConfig)
          ? resolveUploadWaitMessage(uploadTarget.uploadConfig, language, 'save')
          : undefined
      })
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
    }
  };

  const handleLineFileInputChange = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    list: FileList | null;
  }) => {
    const { group, rowId, field, fieldPath, list } = args;
    if (!list || !list.length) {
      resetNativeFileInput(fieldPath);
      return;
    }
    if (submitting || field?.readOnly === true) {
      onDiagnostic?.('upload.add.blocked', { scope: 'line', fieldPath, reason: submitting ? 'submitting' : 'readOnly' });
      resetNativeFileInput(fieldPath);
      return;
    }
    if (
      fileUploadOrderedEntryGateRef.current({
        scope: 'line',
        group,
        rowId,
        field,
        fieldPath,
        source: 'input'
      })
    ) {
      resetNativeFileInput(fieldPath);
      return;
    }
    if (
      stageFilesInOverlay({
        scope: 'line',
        fieldPath,
        field,
        incoming: Array.from(list),
        onCommitBlockUntilSaved: items => {
          const uploadConfig = field.uploadConfig || {};
          const uploadTarget: UploadRetryTarget = {
            scope: 'line',
            fieldPath,
            group,
            rowId,
            field,
            uploadConfig
          };
          handleLineFieldChange(group, rowId, field, items as unknown as FieldValue);
          clearUploadFailureForField(fieldPath);
          const waitMessage = resolveUploadWaitMessage(uploadConfig, language, 'save');
          announceUpload(fieldPath, waitMessage);
          onDiagnostic?.('upload.overlay.immediateSave.start', { fieldPath, scope: 'line', total: items.length });
          const uploadPromise: Promise<{ success: boolean; message?: string; items?: string[]; value?: string }> = onUploadFiles
            ? onUploadFiles({
                scope: 'line',
                fieldPath,
                groupId: group.id,
                rowId,
                fieldId: field.id,
                items,
                uploadConfig,
                busyMessage: waitMessage
              })
            : Promise.resolve({ success: true, items: items.filter((item): item is string => typeof item === 'string') });
          void uploadPromise
            .then(res => {
              if (!res?.success) {
                const message = recordUploadFailure(uploadTarget, res?.message);
                announceUpload(fieldPath, message);
                updateFileOverlayAfterImmediateAction({ scope: 'line', fieldPath, items, saving: false });
                return;
              }
              const savedItems = Array.isArray(res.items)
                ? res.items
                : items.filter((item): item is string => typeof item === 'string');
              clearUploadFailureForField(fieldPath);
              announceUpload(fieldPath, tSystem('files.uploaded', language, 'Added'));
              updateFileOverlayAfterImmediateAction({
                scope: 'line',
                fieldPath,
                items: savedItems,
                saving: false,
                saved: true
              });
              onDiagnostic?.('upload.overlay.immediateSave.success', { fieldPath, scope: 'line', total: savedItems.length });
            })
            .catch((err: any) => {
              const message = recordUploadFailure(uploadTarget, err?.message);
              announceUpload(fieldPath, message);
              updateFileOverlayAfterImmediateAction({ scope: 'line', fieldPath, items, saving: false });
            });
        }
      })
    ) {
      resetNativeFileInput(fieldPath);
      return;
    }
    processIncomingFilesForLineField({ group, rowId, field, fieldPath, incoming: Array.from(list) });
    resetNativeFileInput(fieldPath);
  };

  const handleLineFileDrop = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    event: DragEvent<HTMLDivElement>;
  }) => {
    const { group, rowId, field, fieldPath, event } = args;
    event.preventDefault();
    if (submitting) return;
    if (field?.readOnly === true) return;
    if (!event.dataTransfer?.files?.length) return;
    if (
      fileUploadOrderedEntryGateRef.current({
        scope: 'line',
        group,
        rowId,
        field,
        fieldPath,
        source: 'drop'
      })
    ) {
      resetDrag(fieldPath);
      return;
    }
    processIncomingFilesForLineField({ group, rowId, field, fieldPath, incoming: Array.from(event.dataTransfer.files) });
    onDiagnostic?.('upload.drop', { fieldPath, count: event.dataTransfer.files.length, scope: 'line' });
    resetDrag(fieldPath);
  };

  const removeLineFile = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    index: number;
  }) => {
    const { group, rowId, field, fieldPath, index } = args;
    if (submitting) return;
    if (field?.readOnly === true) return;
    const existingRows = lineItemsRef.current[group.id] || [];
    const currentRow = existingRows.find(row => row.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    if (!existingFiles.length) return;
    const removed = existingFiles[index];
    const next = existingFiles.filter((_, idx) => idx !== index);
    handleLineFieldChange(group, rowId, field, next as unknown as FieldValue);
    clearUploadFailureForField(fieldPath);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldPath];
      return copy;
    });
    onDiagnostic?.('upload.remove', {
      fieldPath,
      removed: describeUploadItem(removed as any),
      remaining: next.length,
      scope: 'line'
    });
    announceUpload(
      fieldPath,
      removed
        ? `${tSystem('lineItems.remove', language, 'Remove')} ${describeUploadItem(removed as any)}.`
        : tSystem('lineItems.remove', language, 'Remove')
    );
  };

  const clearLineFiles = (args: { group: WebQuestionDefinition; rowId: string; field: any; fieldPath: string }) => {
    const { group, rowId, field, fieldPath } = args;
    if (submitting) return;
    if (field?.readOnly === true) return;
    handleLineFieldChange(group, rowId, field, [] as unknown as FieldValue);
    clearUploadFailureForField(fieldPath);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldPath];
      return copy;
    });
    resetDrag(fieldPath);
    resetNativeFileInput(fieldPath);
    announceUpload(fieldPath, tSystem('files.clearAll', language, 'Remove all'));
    onDiagnostic?.('upload.clear', { fieldPath, scope: 'line' });
  };

  return {
    handleFileFieldChange,
    handleFileInputChange,
    handleLineFileInputChange,
    handleLineFileDrop,
    removeLineFile,
    clearLineFiles
  };
}
