import { useEffect, useRef } from 'react';

import type { LocalizedString } from '../../../types';
import type { SystemActionGateState } from './useSystemActionGateState';

type GuidedUiState = {
  activeStepId: string | null;
} | null;

export const useSubmitGateEnableDialog = (args: {
  guidedNextWouldEnable: boolean;
  guidedUiState: GuidedUiState;
  submitDisabledByGate: boolean;
  systemActionGateState: SystemActionGateState;
  openSystemActionGateDialog: (args: {
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
  }) => void;
}): void => {
  const {
    guidedNextWouldEnable,
    guidedUiState,
    submitDisabledByGate,
    systemActionGateState,
    openSystemActionGateDialog
  } = args;
  const actionGateEnableDialogKeyRef = useRef<string>('');
  const prevGuidedNextWouldEnableRef = useRef<boolean>(false);

  useEffect(() => {
    const prev = prevGuidedNextWouldEnableRef.current;
    prevGuidedNextWouldEnableRef.current = guidedNextWouldEnable;
    if (!guidedNextWouldEnable) {
      actionGateEnableDialogKeyRef.current = '';
      return;
    }
    if (prev) return;
    if (!submitDisabledByGate) return;
    const matched = systemActionGateState.submit.matchedRule;
    if (!matched?.dialog) return;
    const trigger = (matched.dialogTrigger || 'onAttempt').toString();
    if (trigger !== 'onEnable') return;
    const key = `submit::${systemActionGateState.submit.matchedRuleId || 'rule'}::${guidedUiState?.activeStepId || ''}`;
    if (actionGateEnableDialogKeyRef.current === key) return;
    actionGateEnableDialogKeyRef.current = key;
    openSystemActionGateDialog({
      actionId: 'submit',
      ruleId: systemActionGateState.submit.matchedRuleId || undefined,
      trigger: 'onEnable',
      title: matched.dialog.title,
      message: matched.dialog.message,
      confirmLabel: matched.dialog.confirmLabel,
      cancelLabel: matched.dialog.cancelLabel,
      showCancel: matched.dialog.showCancel,
      showCloseButton: matched.dialog.showCloseButton,
      dismissOnBackdrop: matched.dialog.dismissOnBackdrop
    });
  }, [
    guidedNextWouldEnable,
    guidedUiState?.activeStepId,
    openSystemActionGateDialog,
    submitDisabledByGate,
    systemActionGateState.submit.matchedRule,
    systemActionGateState.submit.matchedRuleId
  ]);
};
