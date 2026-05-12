import React from 'react';

import type { LangCode } from '../../../types';
import type { View } from '../../types';
import { tSystem } from '../../../systemStrings';
import { FileOverlay } from '../form/overlays/FileOverlay';
import { BlockingOverlay } from '../../features/overlays/BlockingOverlay';
import { ConfirmDialogOverlay } from '../../features/overlays/ConfirmDialogOverlay';
import { FieldChangeDialogOverlay } from '../../features/fieldChangeDialog/FieldChangeDialogOverlay';
import { ReportOverlay, type ReportOverlayState } from './ReportOverlay';

/**
 * Owner: app shell.
 * Renders App-level modal, dialog, and blocking overlay components. State
 * transitions and persistence side effects remain owned by App and are injected
 * as props.
 */

export const AppOverlays: React.FC<{
  language: LangCode;
  view: View;
  submitting: boolean;
  status: unknown;
  dedupProgress: any;
  autoSaveNoticeOpen: boolean;
  autoSaveNoticeTitle: string;
  autoSaveNoticeMessage: React.ReactNode;
  autoSaveNoticeConfirmLabel: string;
  autoSaveNoticeCancelLabel: string;
  onDismissAutoSaveNotice: (reason: 'cancel' | 'confirm') => void;
  fieldChangeDialog: any;
  fieldChangePrimaryAction: 'cancel' | 'confirm';
  dedupDialogOpen: boolean;
  dedupDialogCopy: { title: string; openLabel: string; cancelLabel: string };
  dedupDialogMessage: React.ReactNode;
  dedupDialogConfirmLabel: string;
  dedupDialogCancelLabel: string;
  onDedupDialogCancel: () => void;
  onDedupDialogConfirm: () => void;
  listDedupDialogOpen: boolean;
  listDedupDialogMessage: React.ReactNode;
  onListDedupDialogCancel: () => void;
  onListDedupDialogConfirm: () => void;
  submitConfirmOpen: boolean;
  submitConfirmTitle: string;
  submitConfirmMessage: React.ReactNode;
  submitConfirmConfirmLabel: string;
  submitConfirmCancelLabel: string;
  onSubmitConfirmCancel: () => void;
  onSubmitConfirm: () => void;
  systemActionGateDialog: any;
  onCloseSystemActionGateDialog: () => void;
  copyCurrentRecordDialog: any;
  onCloseCopyCurrentRecordDialog: () => void;
  submitPreparationBusy: any;
  submitBlockingTitle: string;
  destructiveChangeBusy: any;
  guidedMilestoneBusy: any;
  guidedStepAdvanceBusy: any;
  uploadBusy: any;
  copyRecordBusy: any;
  recordSyncBusy: any;
  customConfirm: any;
  updateRecordBusy: any;
  navigateHomeBusy: any;
  reportOverlay: ReportOverlayState;
  onCloseReportOverlay: () => void;
  readOnlyFilesOverlay: any;
  onOpenReadOnlyFiles: (fieldId: string) => void;
  onCloseReadOnlyFilesOverlay: () => void;
  onDiagnostic: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  language,
  view,
  submitting,
  status,
  dedupProgress,
  autoSaveNoticeOpen,
  autoSaveNoticeTitle,
  autoSaveNoticeMessage,
  autoSaveNoticeConfirmLabel,
  autoSaveNoticeCancelLabel,
  onDismissAutoSaveNotice,
  fieldChangeDialog,
  fieldChangePrimaryAction,
  dedupDialogOpen,
  dedupDialogCopy,
  dedupDialogMessage,
  dedupDialogConfirmLabel,
  dedupDialogCancelLabel,
  onDedupDialogCancel,
  onDedupDialogConfirm,
  listDedupDialogOpen,
  listDedupDialogMessage,
  onListDedupDialogCancel,
  onListDedupDialogConfirm,
  submitConfirmOpen,
  submitConfirmTitle,
  submitConfirmMessage,
  submitConfirmConfirmLabel,
  submitConfirmCancelLabel,
  onSubmitConfirmCancel,
  onSubmitConfirm,
  systemActionGateDialog,
  onCloseSystemActionGateDialog,
  copyCurrentRecordDialog,
  onCloseCopyCurrentRecordDialog,
  submitPreparationBusy,
  submitBlockingTitle,
  destructiveChangeBusy,
  guidedMilestoneBusy,
  guidedStepAdvanceBusy,
  uploadBusy,
  copyRecordBusy,
  recordSyncBusy,
  customConfirm,
  updateRecordBusy,
  navigateHomeBusy,
  reportOverlay,
  onCloseReportOverlay,
  readOnlyFilesOverlay,
  onOpenReadOnlyFiles,
  onCloseReadOnlyFilesOverlay,
  onDiagnostic
}) => (
  <>
    <BlockingOverlay
      open={dedupProgress.open}
      title={dedupProgress.title}
      message={dedupProgress.message}
      mode={dedupProgress.phase === 'checking' ? 'loading' : dedupProgress.phase === 'available' ? 'success' : 'error'}
      zIndex={12019}
    />

    <ConfirmDialogOverlay
      open={autoSaveNoticeOpen && view === 'form'}
      title={autoSaveNoticeTitle}
      message={autoSaveNoticeMessage}
      confirmLabel={autoSaveNoticeConfirmLabel}
      cancelLabel={autoSaveNoticeCancelLabel}
      showCancel={false}
      zIndex={12010}
      onCancel={() => onDismissAutoSaveNotice('cancel')}
      onConfirm={() => onDismissAutoSaveNotice('confirm')}
    />

    <FieldChangeDialogOverlay
      open={fieldChangeDialog.state.open}
      busy={fieldChangeDialog.state.busy}
      title={fieldChangeDialog.state.title || tSystem('common.confirm', language, 'Confirm')}
      message={fieldChangeDialog.state.message || ''}
      confirmLabel={fieldChangeDialog.state.confirmLabel || tSystem('common.confirm', language, 'Confirm')}
      cancelLabel={fieldChangeDialog.state.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
      primaryAction={fieldChangePrimaryAction}
      inputs={fieldChangeDialog.state.inputs}
      values={fieldChangeDialog.state.values}
      onValueChange={fieldChangeDialog.setInputValue}
      onCancel={fieldChangeDialog.cancel}
      onConfirm={fieldChangeDialog.confirm}
      zIndex={12015}
    />

    <ConfirmDialogOverlay
      open={view === 'form' && dedupDialogOpen}
      title={dedupDialogCopy.title}
      message={dedupDialogMessage}
      confirmLabel={dedupDialogConfirmLabel}
      cancelLabel={dedupDialogCancelLabel}
      dismissOnBackdrop={false}
      showCloseButton={false}
      zIndex={12018}
      onCancel={onDedupDialogCancel}
      onConfirm={onDedupDialogConfirm}
    />

    <ConfirmDialogOverlay
      open={view === 'list' && listDedupDialogOpen}
      title={dedupDialogCopy.title}
      message={listDedupDialogMessage}
      confirmLabel={dedupDialogCopy.openLabel}
      cancelLabel={dedupDialogCopy.cancelLabel}
      dismissOnBackdrop={false}
      showCloseButton={false}
      zIndex={12020}
      onCancel={onListDedupDialogCancel}
      onConfirm={onListDedupDialogConfirm}
    />

    <ConfirmDialogOverlay
      open={submitConfirmOpen && (view === 'form' || view === 'summary')}
      title={submitConfirmTitle}
      message={submitConfirmMessage}
      confirmLabel={submitConfirmConfirmLabel}
      cancelLabel={submitConfirmCancelLabel}
      zIndex={12000}
      onCancel={onSubmitConfirmCancel}
      onConfirm={onSubmitConfirm}
    />

    <ConfirmDialogOverlay
      open={systemActionGateDialog.open}
      title={systemActionGateDialog.title || tSystem('common.notice', language, 'Notice')}
      message={systemActionGateDialog.message || ''}
      confirmLabel={systemActionGateDialog.confirmLabel || tSystem('common.ok', language, 'OK')}
      cancelLabel={systemActionGateDialog.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
      showCancel={systemActionGateDialog.showCancel}
      dismissOnBackdrop={systemActionGateDialog.dismissOnBackdrop}
      showCloseButton={systemActionGateDialog.showCloseButton}
      zIndex={12012}
      onCancel={() => {
        onDiagnostic('ui.systemActionGate.dialog.cancel', {
          actionId: systemActionGateDialog.actionId,
          ruleId: systemActionGateDialog.ruleId,
          trigger: systemActionGateDialog.trigger
        });
        onCloseSystemActionGateDialog();
      }}
      onConfirm={() => {
        onDiagnostic('ui.systemActionGate.dialog.confirm', {
          actionId: systemActionGateDialog.actionId,
          ruleId: systemActionGateDialog.ruleId,
          trigger: systemActionGateDialog.trigger
        });
        onCloseSystemActionGateDialog();
      }}
    />

    <ConfirmDialogOverlay
      open={copyCurrentRecordDialog.open}
      title={copyCurrentRecordDialog.title || tSystem('common.notice', language, 'Notice')}
      message={copyCurrentRecordDialog.message || ''}
      confirmLabel={copyCurrentRecordDialog.confirmLabel || tSystem('common.ok', language, 'OK')}
      cancelLabel={copyCurrentRecordDialog.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
      showCancel={copyCurrentRecordDialog.showCancel}
      dismissOnBackdrop={copyCurrentRecordDialog.dismissOnBackdrop}
      showCloseButton={copyCurrentRecordDialog.showCloseButton}
      zIndex={12013}
      onCancel={() => {
        onDiagnostic('ui.copyCurrent.dialog.cancel');
        onCloseCopyCurrentRecordDialog();
      }}
      onConfirm={() => {
        onDiagnostic('ui.copyCurrent.dialog.confirm');
        onCloseCopyCurrentRecordDialog();
      }}
    />

    <BlockingOverlay
      open={submitPreparationBusy.state.open && !submitting}
      title={submitPreparationBusy.state.title || tSystem('navigation.waitTitle', language, 'Please wait')}
      message={submitPreparationBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
      zIndex={12039}
    />

    <BlockingOverlay
      open={submitting}
      title={submitBlockingTitle}
      message={(status || '').toString() || tSystem('actions.submitting', language, 'Submitting…')}
      zIndex={12040}
    />

    <BlockingOverlay
      open={destructiveChangeBusy.state.open}
      title={destructiveChangeBusy.state.title || tSystem('common.loading', language, 'Loading…')}
      message={destructiveChangeBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
      zIndex={12045}
    />

    <BlockingOverlay
      open={guidedMilestoneBusy.state.open}
      title={guidedMilestoneBusy.state.title || tSystem('draft.savingShort', language, 'Saving…')}
      message={guidedMilestoneBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
      zIndex={12046}
    />

    <BlockingOverlay
      open={guidedStepAdvanceBusy.state.open}
      title={guidedStepAdvanceBusy.state.title ?? tSystem('navigation.waitTitle', language, 'Please wait')}
      message={guidedStepAdvanceBusy.state.message || tSystem('navigation.waitPhotos', language, 'Please wait while your files finish uploading.')}
      zIndex={12047}
    />

    <BlockingOverlay
      open={uploadBusy.state.open}
      title={uploadBusy.state.title || tSystem('navigation.waitTitle', language, 'Please wait')}
      message={uploadBusy.state.message || tSystem('navigation.waitPhotos', language, 'Please wait while your files finish uploading.')}
      zIndex={12047}
    />

    <BlockingOverlay
      open={copyRecordBusy.state.open}
      title={copyRecordBusy.state.title || tSystem('navigation.waitTitle', language, 'Please wait')}
      message={copyRecordBusy.state.message || tSystem('navigation.waitCopyRecord', language, 'Please wait while we prepare your copied record...')}
      zIndex={12048}
    />

    <BlockingOverlay
      open={recordSyncBusy.state.open}
      title={recordSyncBusy.state.title || tSystem('record.syncingTitle', language, 'Synchronizing record…')}
      message={
        recordSyncBusy.state.message ||
        tSystem(
          'record.syncing',
          language,
          'This record changed at the source. We are synchronizing the latest version now.'
        )
      }
      zIndex={12049}
    />

    <ConfirmDialogOverlay
      key={customConfirm.state.dialogKey}
      open={customConfirm.state.open}
      title={customConfirm.state.title}
      message={customConfirm.state.message || ''}
      confirmLabel={customConfirm.state.confirmLabel || tSystem('common.confirm', language, 'Confirm')}
      cancelLabel={customConfirm.state.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
      primaryAction={customConfirm.state.primaryAction}
      showCancel={customConfirm.state.showCancel}
      showConfirm={customConfirm.state.showConfirm}
      dismissOnBackdrop={customConfirm.state.dismissOnBackdrop}
      showCloseButton={customConfirm.state.showCloseButton}
      onCancel={customConfirm.cancel}
      onConfirm={customConfirm.confirm}
    />

    <BlockingOverlay
      open={updateRecordBusy.state.open}
      title={updateRecordBusy.state.title || tSystem('common.loading', language, 'Loading…')}
      message={updateRecordBusy.state.message || tSystem('draft.savingShort', language, 'Saving…')}
    />

    <BlockingOverlay
      open={navigateHomeBusy.state.open}
      title={navigateHomeBusy.state.title || tSystem('draft.savingShort', language, 'Saving…')}
      message={navigateHomeBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
      zIndex={12050}
    />

    <ReportOverlay
      language={language}
      state={reportOverlay}
      onClose={onCloseReportOverlay}
      onOpenFiles={onOpenReadOnlyFiles}
      onDiagnostic={onDiagnostic}
    />

    <FileOverlay
      open={readOnlyFilesOverlay.open}
      language={language}
      title={readOnlyFilesOverlay.title || tSystem('files.title', language, 'Photos')}
      zIndex={10040}
      submitting={submitting}
      readOnly={true}
      items={readOnlyFilesOverlay.items}
      uploadConfig={readOnlyFilesOverlay.uploadConfig}
      onAdd={() => undefined}
      onClearAll={() => undefined}
      onRemoveAt={() => undefined}
      onClose={onCloseReadOnlyFilesOverlay}
    />
  </>
);
