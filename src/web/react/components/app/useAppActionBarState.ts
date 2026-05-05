import type { LangCode, LocalizedString } from '../../../types';
import { tSystem } from '../../../systemStrings';
import type { View } from '../../types';
import type { SystemActionGateState } from './useSystemActionGateState';

type GuidedUiState = {
  isFinal: boolean;
  stepSubmitLabel?: string | LocalizedString;
  backVisible: boolean;
  backLabel: string;
  backAllowed: boolean;
  forwardGateSatisfied: boolean;
} | null;

export const useAppActionBarState = (args: {
  view: View;
  language: LangCode;
  guidedUiState: GuidedUiState;
  finalSubmitButtonLabelConfig?: string | LocalizedString;
  orderedEntryEnabled: boolean;
  formIsValid: boolean;
  dedupNavigationBlocked: boolean;
  systemActionGateState: SystemActionGateState;
  isClosedRecord: boolean;
  summaryViewEnabled: boolean;
  copyCurrentRecordEnabled: boolean;
  selectedRecordId?: string | null;
  lastSubmissionRecordId?: string | null;
}) => {
  const {
    view,
    language,
    guidedUiState,
    finalSubmitButtonLabelConfig,
    orderedEntryEnabled,
    formIsValid,
    dedupNavigationBlocked,
    systemActionGateState,
    isClosedRecord,
    summaryViewEnabled,
    copyCurrentRecordEnabled,
    selectedRecordId,
    lastSubmissionRecordId
  } = args;

  const guidedSubmitLabel =
    view === 'form' && guidedUiState && !guidedUiState.isFinal
      ? guidedUiState.stepSubmitLabel || finalSubmitButtonLabelConfig || tSystem('steps.next', language, 'Next')
      : finalSubmitButtonLabelConfig;
  const showGuidedBack = view === 'form' && !!guidedUiState?.backVisible;
  const guidedBackLabel = guidedUiState?.backLabel || tSystem('actions.back', language, 'Back');
  const guidedBackDisabled = guidedUiState ? !guidedUiState.backAllowed : false;
  const orderedSubmitDisabled = orderedEntryEnabled
    ? guidedUiState && !guidedUiState.isFinal
      ? !guidedUiState.forwardGateSatisfied
      : !formIsValid
    : false;
  const submitDisabledTooltip =
    view === 'form' && orderedEntryEnabled && orderedSubmitDisabled && !dedupNavigationBlocked
      ? tSystem('actions.submitDisabledTooltip', language, 'Complete all required fields to activate.')
      : '';
  const guidedNextWouldEnable =
    view === 'form' && guidedUiState && !guidedUiState.isFinal ? !!guidedUiState.forwardGateSatisfied && !dedupNavigationBlocked : false;
  const submitDisabledByGate = view === 'form' && guidedNextWouldEnable && systemActionGateState.submit.disabled;
  const submitHiddenByGate = systemActionGateState.submit.hidden;
  const hideEditResolved = (view === 'summary' && isClosedRecord) || systemActionGateState.edit.hidden;
  const summaryEnabledResolved = summaryViewEnabled && !systemActionGateState.summary.hidden;
  const copyEnabledResolved = copyCurrentRecordEnabled && !systemActionGateState.copyCurrentRecord.hidden;
  const canCopyResolved =
    copyEnabledResolved &&
    !systemActionGateState.copyCurrentRecord.disabled &&
    (view === 'form' ? true : Boolean(selectedRecordId || lastSubmissionRecordId));

  return {
    guidedSubmitLabel,
    showGuidedBack,
    guidedBackLabel,
    guidedBackDisabled,
    orderedSubmitDisabled,
    submitDisabledTooltip,
    guidedNextWouldEnable,
    submitDisabledByGate,
    submitHiddenByGate,
    hideEditResolved,
    summaryEnabledResolved,
    copyEnabledResolved,
    canCopyResolved
  };
};
