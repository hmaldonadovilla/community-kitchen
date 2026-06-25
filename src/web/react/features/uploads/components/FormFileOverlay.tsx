import React from 'react';

import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, WebQuestionDefinition } from '../../../../types';
import { resolveUploadBlockUntilSaved } from '../../../app/uploadTransaction';
import { resolveUploadWaitMessage, resolveUploadWaitTitle } from '../../../app/uploadWaitMessages';
import { FileOverlay } from '../../../components/form/overlays/FileOverlay';
import { describeUploadItem } from '../../../components/form/utils';
import { resolveExternalQrScannerLaunch } from '../domain/externalQrScanner';
import {
  appendCapturedUploadLink,
  resolveUploadLinkCaptureConfig,
  shouldRetryDuplicateCapturedUploadLink
} from '../domain/linkCapture';
import type {
  FileOverlayState,
  FileUploadOrderedEntryCheckArgs,
  UploadFilesHandler,
  UploadRetryTarget
} from '../useFormUploadController';
import { isQrScannerSupported, QrCodeScannerOverlay } from './QrCodeScannerOverlay';

type UploadFailureLike = {
  message?: string;
  retrying?: boolean;
};

type WebAssetConfig = {
  mode?: string;
  baseUrl?: string | null;
};

type QrScannerMessage = {
  type?: unknown;
  requestId?: unknown;
  value?: unknown;
};

const resolveWindowWebAssetConfig = (): WebAssetConfig | null => {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { __CK_WEB_ASSET__?: WebAssetConfig }).__CK_WEB_ASSET__ || null);
};

const createQrScannerRequestId = (): string => {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  const [qrScannerOpen, setQrScannerOpen] = React.useState(false);
  const externalQrScanCleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!fileOverlay.open) setQrScannerOpen(false);
  }, [fileOverlay.open]);

  React.useEffect(
    () => () => {
      externalQrScanCleanupRef.current?.();
      externalQrScanCleanupRef.current = null;
    },
    []
  );

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
  const savedItems = resolveFileOverlayItems(fileOverlay);
  const items = fileOverlay.draftItems || resolveFileOverlayItems(fileOverlay);
  const dirty = fileItemsSignature(items) !== (fileOverlay.originalSignature || fileItemsSignature(savedItems));
  const blockUntilSaved = resolveUploadBlockUntilSaved(uploadConfig);
  const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;
  const linkCaptureConfig = resolveUploadLinkCaptureConfig(uploadConfig);
  const qrScanSupported = isQrScannerSupported();

  const resolveLinkCaptureText = (raw: unknown, fallback: string): string => {
    const configured = raw ? resolveLocalizedString(raw as any, language, '') : '';
    return configured || fallback;
  };

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

  const commitImmediateItems = (nextItems: Array<string | File>, action: 'removeOne' | 'removeAll' | 'addLink') => {
    if (submitting || readOnly || fileOverlay.saving) return;
    const waitKind = action === 'addLink' ? 'save' : 'removeSelected';
    const waitTitle = resolveUploadWaitTitle(uploadConfig, language, waitKind);
    const waitMessage = resolveUploadWaitMessage(uploadConfig, language, waitKind);
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
    onDiagnostic?.('upload.overlay.immediateCommit.start', {
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
          busyTitle: waitTitle,
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
        onDiagnostic?.('upload.overlay.immediateCommit.success', {
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

  const addCapturedLink = (rawValue: string, source: 'scan' | 'paste'): boolean => {
    if (!linkCaptureConfig || submitting || readOnly || fileOverlay.saving) return false;
    const result = appendCapturedUploadLink({ existing: items, rawValue, uploadConfig });

    if (result.status === 'invalid') {
      const message = resolveLinkCaptureText(
        linkCaptureConfig.messages?.invalid,
        'Scan or paste a Google Drive file link.'
      );
      setFileOverlay(prev => (prev.open ? { ...prev, notice: { message, tone: 'error' } } : prev));
      announceUpload(fieldPath, message);
      onDiagnostic?.('upload.linkCapture.invalid', { fieldPath, source, reason: result.reason });
      return false;
    }

    if (result.status === 'duplicate') {
      if (
        shouldRetryDuplicateCapturedUploadLink({
          blockUntilSaved,
          hasUploadFailure: Boolean(uploadFailures[fieldPath])
        })
      ) {
        onDiagnostic?.('upload.linkCapture.duplicate.retrySave', { fieldPath, source, driveFileId: result.driveFileId });
        commitImmediateItems(result.items, 'addLink');
        return true;
      }
      const message = resolveLinkCaptureText(
        linkCaptureConfig.messages?.duplicate,
        'This Drive link is already added.'
      );
      setFileOverlay(prev => (prev.open ? { ...prev, notice: { message, tone: 'warning' } } : prev));
      announceUpload(fieldPath, message);
      onDiagnostic?.('upload.linkCapture.duplicate', { fieldPath, source, driveFileId: result.driveFileId });
      return true;
    }

    if (result.status === 'maxed') {
      const message = tSystem('files.error.maxFiles', language, 'Maximum of {max} photos allowed.', {
        max: result.maxFiles,
        plural: result.maxFiles > 1 ? 's' : ''
      });
      setFileOverlay(prev => (prev.open ? { ...prev, notice: { message, tone: 'warning' } } : prev));
      announceUpload(fieldPath, message);
      onDiagnostic?.('upload.linkCapture.maxed', { fieldPath, source, maxFiles: result.maxFiles });
      return false;
    }

    const message = resolveLinkCaptureText(linkCaptureConfig.messages?.added, 'Drive link added.');
    clearUploadFailureForField(fieldPath);
    announceUpload(fieldPath, message);
    onDiagnostic?.('upload.linkCapture.added', { fieldPath, source, driveFileId: result.driveFileId });

    if (blockUntilSaved) {
      commitImmediateItems(result.items, 'addLink');
    } else {
      setFileOverlay(prev => (prev.open ? { ...prev, draftItems: result.items, notice: undefined } : prev));
    }
    return true;
  };

  const openQrScanner = () => {
    if (!linkCaptureConfig || submitting || readOnly || fileOverlay.saving) return;
    const requestId = createQrScannerRequestId();
    const scanSuccessMessage = resolveLinkCaptureText(
      linkCaptureConfig.messages?.added,
      tSystem('files.linkCapture.scanAdded', language, 'QR code detected. Sent to the form.')
    );
    const externalScanner = resolveExternalQrScannerLaunch({
      assetBaseUrl: resolveWindowWebAssetConfig()?.baseUrl,
      requestId,
      targetOrigin: window.location.origin || '*',
      closeOnResult: false,
      successMessage: scanSuccessMessage
    });

    if (!externalScanner) {
      onDiagnostic?.('upload.linkCapture.externalScanner.unavailable', { fieldPath });
      setQrScannerOpen(true);
      return;
    }

    externalQrScanCleanupRef.current?.();
    let cleanup: () => void = () => undefined;
    const timeoutId = window.setTimeout(() => cleanup(), 15 * 60 * 1000);
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== externalScanner.origin) return;
      const data = (event.data || {}) as QrScannerMessage;
      if (data.requestId !== requestId) return;
      if (data.type === 'ck.qrScanner.closed') {
        cleanup();
        return;
      }
      if (data.type !== 'ck.qrScanner.result') return;
      const value = data.value?.toString().trim() || '';
      if (!value) return;
      addCapturedLink(value, 'scan');
    };
    cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
      if (externalQrScanCleanupRef.current === cleanup) {
        externalQrScanCleanupRef.current = null;
      }
    };
    window.addEventListener('message', handleMessage);
    externalQrScanCleanupRef.current = cleanup;

    const scannerWindow = window.open(externalScanner.url, 'ckReceiptQrScanner', 'popup,width=480,height=720');
    if (!scannerWindow) {
      cleanup();
      onDiagnostic?.('upload.linkCapture.externalScanner.blocked', { fieldPath });
      setFileOverlay(prev =>
        prev.open
          ? {
              ...prev,
              notice: {
                tone: 'warning',
                message: tSystem('files.linkCapture.popupBlocked', language, 'Could not open the scanner window. Paste the Drive link instead.')
              }
            }
          : prev
      );
      return;
    }

    try {
      scannerWindow.focus();
    } catch {
      // Some mobile browser windows cannot be focused programmatically after opening.
    }
    onDiagnostic?.('upload.linkCapture.externalScanner.open', {
      fieldPath,
      origin: externalScanner.origin,
      closeOnResult: false
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

  const linkCaptureLabels = linkCaptureConfig
    ? {
        scanLabel: resolveLinkCaptureText(linkCaptureConfig.labels?.scan, 'Scan QR'),
        pasteLabel: resolveLinkCaptureText(linkCaptureConfig.labels?.paste, 'Paste link'),
        pastePlaceholder: resolveLinkCaptureText(linkCaptureConfig.labels?.pastePlaceholder, 'Paste Google Drive link'),
        pasteSubmitLabel: 'Add link',
        unsupportedMessage: resolveLinkCaptureText(
          linkCaptureConfig.messages?.unsupported,
          'QR scanning is not available in this browser. Paste the Drive link instead.'
        )
      }
    : null;

  return (
    <>
      <FileOverlay
        open={fileOverlay.open}
        language={language}
        title={title}
        submitting={submitting}
        readOnly={overlayReadOnly}
        items={items}
        savedItems={savedItems}
        uploadConfig={uploadConfig}
        dirty={dirty}
        saving={fileOverlay.saving === true}
        notice={fileOverlay.notice?.message}
        noticeTone={fileOverlay.notice?.tone}
        saveError={uploadFailures[fieldPath]?.message}
        saveRetrying={uploadFailures[fieldPath]?.retrying}
        linkCapture={
          linkCaptureConfig && linkCaptureLabels
            ? {
                ...linkCaptureLabels,
                scanSupported: qrScanSupported,
                allowManualPaste: linkCaptureConfig.allowManualPaste !== false
              }
            : undefined
        }
        onAdd={onAdd}
        onScanLink={linkCaptureConfig ? openQrScanner : undefined}
        onAddLink={linkCaptureConfig ? value => addCapturedLink(value, 'paste') : undefined}
        onSave={blockUntilSaved ? undefined : onSave}
        onRetrySave={uploadFailures[fieldPath] ? () => retryUploadFailure(fieldPath) : undefined}
        onClearAll={onClearAll}
        onRemoveAt={onRemoveAt}
        onClose={closeFileOverlay}
      />
      <QrCodeScannerOverlay
        open={qrScannerOpen}
        language={language}
        unsupportedMessage={linkCaptureLabels?.unsupportedMessage}
        onDetected={value => {
          setQrScannerOpen(false);
          addCapturedLink(value, 'scan');
        }}
        onClose={() => setQrScannerOpen(false)}
      />
    </>
  );
};
