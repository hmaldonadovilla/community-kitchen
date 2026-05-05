import { useCallback, useState } from 'react';

import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import type { LangCode, LocalizedString } from '../../../types';

export type SystemActionGateDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  showCancel: boolean;
  dismissOnBackdrop: boolean;
  showCloseButton: boolean;
  actionId: string | null;
  ruleId: string | null;
  trigger: string | null;
};

export type CopyCurrentRecordDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  showCancel: boolean;
  dismissOnBackdrop: boolean;
  showCloseButton: boolean;
};

export type OpenSystemActionGateDialogArgs = {
  actionId: string;
  ruleId?: string;
  trigger: 'onAttempt' | 'onEnable';
  title?: LocalizedString | string;
  message: LocalizedString | string;
  confirmLabel?: LocalizedString | string;
  cancelLabel?: LocalizedString | string;
  showCancel?: boolean;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
};

const initialSystemActionGateDialog: SystemActionGateDialogState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  showCancel: false,
  dismissOnBackdrop: false,
  showCloseButton: false,
  actionId: null,
  ruleId: null,
  trigger: null
};

const initialCopyCurrentRecordDialog: CopyCurrentRecordDialogState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  showCancel: false,
  dismissOnBackdrop: false,
  showCloseButton: false
};

export const useAppDialogState = (args: {
  language: LangCode;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const { language, logEvent } = args;
  const [systemActionGateDialog, setSystemActionGateDialog] = useState<SystemActionGateDialogState>(
    initialSystemActionGateDialog
  );
  const [copyCurrentRecordDialog, setCopyCurrentRecordDialog] = useState<CopyCurrentRecordDialogState>(
    initialCopyCurrentRecordDialog
  );

  const closeSystemActionGateDialog = useCallback(() => {
    setSystemActionGateDialog(prev => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const closeCopyCurrentRecordDialog = useCallback(() => {
    setCopyCurrentRecordDialog(prev => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const openSystemActionGateDialog = useCallback(
    (dialogArgs: OpenSystemActionGateDialogArgs) => {
      const title = resolveLocalizedString(
        dialogArgs.title,
        language,
        tSystem('common.notice', language, 'Notice')
      ).toString();
      const message = resolveLocalizedString(dialogArgs.message, language, '').toString();
      const confirmLabel = resolveLocalizedString(
        dialogArgs.confirmLabel,
        language,
        tSystem('common.ok', language, 'OK')
      ).toString();
      const cancelLabel = resolveLocalizedString(
        dialogArgs.cancelLabel,
        language,
        tSystem('common.cancel', language, 'Cancel')
      ).toString();

      setSystemActionGateDialog({
        open: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        showCancel: dialogArgs.showCancel !== false,
        dismissOnBackdrop: dialogArgs.dismissOnBackdrop === true,
        showCloseButton: dialogArgs.showCloseButton === true,
        actionId: dialogArgs.actionId,
        ruleId: dialogArgs.ruleId || null,
        trigger: dialogArgs.trigger
      });
      logEvent('ui.systemActionGate.dialog.open', {
        actionId: dialogArgs.actionId,
        ruleId: dialogArgs.ruleId || null,
        trigger: dialogArgs.trigger
      });
    },
    [language, logEvent]
  );

  return {
    systemActionGateDialog,
    setSystemActionGateDialog,
    openSystemActionGateDialog,
    closeSystemActionGateDialog,
    copyCurrentRecordDialog,
    setCopyCurrentRecordDialog,
    closeCopyCurrentRecordDialog
  };
};
