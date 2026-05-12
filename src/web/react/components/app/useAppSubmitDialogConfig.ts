import { useCallback, useMemo } from 'react';

import { optionKey } from '../../../core';
import { resolveLocalizedString, resolveOptionalLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  LocalizedString,
  SystemActionGateDialogConfig,
  WebFormDefinition
} from '../../../types';
import { buildValidationContext } from '../../app/validation';
import { selectConditionalDialog } from '../../features/steps/domain/milestoneDialogs';
import type { GuidedStepsVirtualState } from '../../features/steps/domain/resolveVirtualStepField';
import type { LineItemState, OptionState } from '../../types';
import { EMPTY_DISPLAY, formatDisplayText } from '../../utils/valueDisplay';

export const useAppSubmitDialogConfig = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  languageRef: React.MutableRefObject<LangCode>;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  guidedUiState?: { activeStepId: string | null; activeStepIndex: number } | null;
  submitButtonLabelResolved: string;
  selectedRecordId?: string | null;
  lastSubmissionMeta?: any;
  optionState: OptionState;
}) => {
  const {
    definition,
    language,
    languageRef,
    values,
    lineItems,
    guidedUiState,
    submitButtonLabelResolved,
    selectedRecordId,
    lastSubmissionMeta,
    optionState
  } = args;

  const submitConfirmationDialogConfig = useMemo(() => {
    const afterSubmitConfig = definition.submissionAfterSubmit;
    if (
      afterSubmitConfig?.confirmationDialog ||
      (Array.isArray(afterSubmitConfig?.confirmationDialogCases) && afterSubmitConfig.confirmationDialogCases.length > 0)
    ) {
      const guidedStepPrefix = ((definition.steps?.stateFields?.prefix || '__ckStep') as string).toString();
      const submitVirtualState: GuidedStepsVirtualState | null =
        guidedUiState?.activeStepId
          ? {
              prefix: guidedStepPrefix,
              activeStepId: guidedUiState.activeStepId,
              activeStepIndex: guidedUiState.activeStepIndex || 0,
              maxValidIndex: -1,
              maxCompleteIndex: -1,
              steps: []
            }
          : null;
      return (
        selectConditionalDialog({
          cases: afterSubmitConfig.confirmationDialogCases,
          fallback: afterSubmitConfig.confirmationDialog,
          ctx: buildValidationContext(values as any, lineItems as any, submitVirtualState),
          now: new Date()
        }) || null
      );
    }
    return {
      title: definition.submissionConfirmationTitle,
      message: definition.submissionConfirmationMessage,
      confirmLabel: definition.submissionConfirmationConfirmLabel,
      cancelLabel: definition.submissionConfirmationCancelLabel
    };
  }, [
    definition.steps?.stateFields?.prefix,
    definition.submissionAfterSubmit,
    definition.submissionConfirmationCancelLabel,
    definition.submissionConfirmationConfirmLabel,
    definition.submissionConfirmationMessage,
    definition.submissionConfirmationTitle,
    guidedUiState?.activeStepId,
    guidedUiState?.activeStepIndex,
    lineItems,
    values
  ]);

  const submitProgressDialogConfig = useMemo(() => {
    const afterSubmitConfig = definition.submissionAfterSubmit;
    if (
      afterSubmitConfig?.progressDialog ||
      (Array.isArray(afterSubmitConfig?.progressDialogCases) && afterSubmitConfig.progressDialogCases.length > 0)
    ) {
      const guidedStepPrefix = ((definition.steps?.stateFields?.prefix || '__ckStep') as string).toString();
      const submitVirtualState: GuidedStepsVirtualState | null =
        guidedUiState?.activeStepId
          ? {
              prefix: guidedStepPrefix,
              activeStepId: guidedUiState.activeStepId,
              activeStepIndex: guidedUiState.activeStepIndex || 0,
              maxValidIndex: -1,
              maxCompleteIndex: -1,
              steps: []
            }
          : null;
      return (
        selectConditionalDialog({
          cases: afterSubmitConfig.progressDialogCases,
          fallback: afterSubmitConfig.progressDialog,
          ctx: buildValidationContext(values as any, lineItems as any, submitVirtualState),
          now: new Date()
        }) || null
      );
    }
    return null;
  }, [
    definition.steps?.stateFields?.prefix,
    definition.submissionAfterSubmit,
    guidedUiState?.activeStepId,
    guidedUiState?.activeStepIndex,
    lineItems,
    values
  ]);

  const submitConfirmConfirmLabelResolved = useMemo(
    () => resolveLocalizedString(submitConfirmationDialogConfig?.confirmLabel, language, submitButtonLabelResolved),
    [submitConfirmationDialogConfig?.confirmLabel, language, submitButtonLabelResolved]
  );
  const submitConfirmCancelLabelResolved = useMemo(
    () =>
      resolveLocalizedString(
        submitConfirmationDialogConfig?.cancelLabel,
        language,
        tSystem('submit.cancel', language, tSystem('common.cancel', language, 'Cancel'))
      ),
    [submitConfirmationDialogConfig?.cancelLabel, language]
  );
  const submitConfirmTitle = useMemo(
    () =>
      resolveOptionalLocalizedString(
        submitConfirmationDialogConfig?.title,
        language,
        tSystem('submit.confirmTitle', language, 'Confirm submission')
      ),
    [submitConfirmationDialogConfig?.title, language]
  );
  const submitBlockingTitle = useMemo(
    () =>
      resolveOptionalLocalizedString(
        submitProgressDialogConfig?.title,
        language,
        tSystem('actions.submitting', language, 'Submitting…')
      ),
    [submitProgressDialogConfig?.title, language]
  );

  const resolveDialogTemplate = useCallback(
    (rawValue: LocalizedString | string | undefined, fallback: string): string => {
      const base = resolveLocalizedString(rawValue, language, fallback);
      if (!base) return base;
      if (base.indexOf('{') < 0) return base;
      const vars: Record<string, string> = {};

      if (selectedRecordId) vars.id = selectedRecordId;
      if (lastSubmissionMeta?.createdAt) vars.createdAt = lastSubmissionMeta.createdAt;
      if (lastSubmissionMeta?.updatedAt) vars.updatedAt = lastSubmissionMeta.updatedAt;
      if (lastSubmissionMeta?.status) vars.status = lastSubmissionMeta.status;
      const locale = language.toLowerCase() === 'fr' ? 'fr-CA' : language.toLowerCase() === 'nl' ? 'nl-NL' : 'en-CA';
      const todayDate = (() => {
        try {
          return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }).format(new Date());
        } catch {
          return new Date().toISOString().slice(0, 10);
        }
      })();
      vars.today = todayDate;
      vars.todayDate = todayDate;
      vars.TODAY = todayDate;
      vars.TODAY_DATE = todayDate;

      (definition.questions || []).forEach(question => {
        if (!question || !question.id) return;
        const fieldId = question.id.toString();
        if (!fieldId) return;
        const raw = values[fieldId];
        if (raw === undefined || raw === null || raw === '') return;

        const dsKey = question.dataSource ? optionKey(fieldId) : '';
        const optionSet =
          (dsKey && optionState[dsKey]) ? (optionState[dsKey] as any) : ((question as any).options as any | undefined);

        const display = formatDisplayText(raw as any, { language, optionSet, fieldType: question.type });
        const resolved = display === EMPTY_DISPLAY ? '' : display;
        if (!resolved) return;
        vars[fieldId] = resolved;
        vars[fieldId.toUpperCase()] = resolved;
      });

      return base.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}|\{\s*([a-zA-Z0-9_.]+)\s*\}/g, (match, a, b) => {
        const key = ((a || b || '') as string).toString().trim();
        if (!key) return match;
        const value = vars[key] ?? vars[key.toUpperCase()];
        return value === undefined || value === null ? match : value;
      });
    },
    [
      language,
      definition.questions,
      lastSubmissionMeta?.createdAt,
      lastSubmissionMeta?.status,
      lastSubmissionMeta?.updatedAt,
      optionState,
      selectedRecordId,
      values
    ]
  );

  const resolveGuidedUploadWaitDialog = useCallback(
    (rawDialog?: SystemActionGateDialogConfig | null) => ({
      title: resolveOptionalLocalizedString(
        rawDialog?.title,
        languageRef.current,
        tSystem('navigation.waitTitle', languageRef.current, 'Please wait')
      ),
      message: resolveDialogTemplate(
        rawDialog?.message,
        tSystem('navigation.waitPhotos', languageRef.current, 'Please wait while your files finish uploading.')
      )
    }),
    [languageRef, resolveDialogTemplate]
  );

  const submitConfirmMessage = useMemo(
    () =>
      resolveDialogTemplate(
        submitConfirmationDialogConfig?.message,
        tSystem('submit.confirmMessage', language, 'Are you ready to submit this record?')
      ),
    [submitConfirmationDialogConfig?.message, language, resolveDialogTemplate]
  );

  return {
    submitConfirmationDialogConfig,
    submitProgressDialogConfig,
    submitConfirmConfirmLabelResolved,
    submitConfirmCancelLabelResolved,
    submitConfirmTitle,
    submitBlockingTitle,
    resolveDialogTemplate,
    resolveGuidedUploadWaitDialog,
    submitConfirmMessage
  };
};
