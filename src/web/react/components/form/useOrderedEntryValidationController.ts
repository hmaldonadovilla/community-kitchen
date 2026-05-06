import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';

import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import { validateForm } from '../../app/submission';
import type { FormErrors, LineItemState } from '../../types';
import { resolveFieldLabel } from '../../utils/labels';
import type { GuidedStepsVirtualState } from '../../features/steps/domain/resolveVirtualStepField';
import {
  findFirstOrderedEntryIssue,
  findOrderedEntryBlock,
  isOrderedEntryValid,
  shouldDeferOrderedEntryGuidance,
  type OrderedEntryTarget
} from './orderedEntry';

type UseOrderedEntryValidationControllerArgs = {
  orderedEntryEnabled: boolean;
  definition: WebFormDefinition;
  guidedEnabled: boolean;
  activeGuidedStepId: string;
  buildGuidedStepDefinition: (stepId: string) => WebFormDefinition | null;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows: Record<string, boolean>;
  collapsedSubgroups: Record<string, boolean>;
  guidedVirtualState: GuidedStepsVirtualState | null;
  orderedEntryQuestions: WebQuestionDefinition[];
  errors: FormErrors;
  submitting: boolean;
  resolveVisibilityValue: (fieldId: string) => FieldValue | undefined;
  getTopValue: (fieldId: string) => FieldValue | undefined;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  requestValidationNavigation: (args: {
    scope: string;
    mode?: 'scroll' | 'focus';
    scrollOnly?: boolean;
    allowOverlayOpen?: boolean;
  }) => void;
  orderedEntryGuideFieldPathRef: React.MutableRefObject<string | null>;
  orderedEntryGateRef: React.MutableRefObject<(args: { targetQuestionId: string; source: string }) => boolean>;
  onFormValidityChange?: (isValid: boolean) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

type TriggerOptions = {
  navigate?: boolean;
  source?: string;
  scrollOnly?: boolean;
  allowOverlayOpen?: boolean;
};

export const useOrderedEntryValidationController = ({
  orderedEntryEnabled,
  definition,
  guidedEnabled,
  activeGuidedStepId,
  buildGuidedStepDefinition,
  language,
  values,
  lineItems,
  collapsedRows,
  collapsedSubgroups,
  guidedVirtualState,
  orderedEntryQuestions,
  errors,
  submitting,
  resolveVisibilityValue,
  getTopValue,
  setErrors,
  requestValidationNavigation,
  orderedEntryGuideFieldPathRef,
  orderedEntryGateRef,
  onFormValidityChange,
  onDiagnostic
}: UseOrderedEntryValidationControllerArgs) => {
  const orderedEntryValidationDefinition = useMemo(() => {
    if (!orderedEntryEnabled) return definition;
    if (!guidedEnabled) return definition;
    return buildGuidedStepDefinition(activeGuidedStepId) || definition;
  }, [activeGuidedStepId, buildGuidedStepDefinition, definition, guidedEnabled, orderedEntryEnabled]);

  const orderedEntryErrors = useMemo(() => {
    if (!orderedEntryEnabled) return null;
    if (!orderedEntryValidationDefinition?.questions?.length) return null;
    try {
      return validateForm({
        definition: orderedEntryValidationDefinition,
        language,
        values,
        lineItems,
        collapsedRows,
        collapsedSubgroups,
        virtualState: guidedVirtualState
      });
    } catch (err: any) {
      onDiagnostic?.('validation.ordered.error', { message: err?.message || err || 'unknown' });
      return null;
    }
  }, [
    collapsedRows,
    collapsedSubgroups,
    language,
    lineItems,
    onDiagnostic,
    orderedEntryEnabled,
    orderedEntryValidationDefinition,
    guidedVirtualState,
    values
  ]);

  const firstOrderedEntryIssue = useMemo(() => {
    if (!orderedEntryEnabled) return null;
    return findFirstOrderedEntryIssue({
      definition: orderedEntryValidationDefinition,
      language,
      values,
      lineItems,
      errors: orderedEntryErrors,
      collapsedRows,
      resolveVisibilityValue,
      getTopValue,
      orderedQuestions: orderedEntryQuestions
    });
  }, [
    collapsedRows,
    getTopValue,
    language,
    lineItems,
    orderedEntryEnabled,
    orderedEntryErrors,
    orderedEntryValidationDefinition,
    orderedEntryQuestions,
    resolveVisibilityValue,
    values
  ]);

  const orderedEntryValid = useMemo(() => {
    return isOrderedEntryValid({
      enabled: orderedEntryEnabled,
      errors: orderedEntryErrors,
      firstIssue: firstOrderedEntryIssue
    });
  }, [firstOrderedEntryIssue, orderedEntryEnabled, orderedEntryErrors]);

  const buildOrderedEntryErrors = useCallback(
    (missingFieldPath: string, allErrors: FormErrors): FormErrors => {
      if (!missingFieldPath) return allErrors || {};
      const fromAll = allErrors?.[missingFieldPath];
      if (fromAll) return { [missingFieldPath]: fromAll };
      const parts = missingFieldPath.split('__').filter(Boolean);
      let label = '';
      let configuredFieldMessage = '';
      const resolveRuleMessage = (source: any): string => {
        const fieldSpecific = resolveLocalizedString(source?.orderedEntryErrorMessage, language, '')
          .toString()
          .trim();
        if (fieldSpecific) return fieldSpecific;
        const rules = Array.isArray(source?.validationRules) ? source.validationRules : [];
        const requiredRule = rules.find((rule: any) => {
          const then = rule?.then;
          return then && typeof then === 'object' && then.required === true;
        });
        return resolveLocalizedString(requiredRule?.message, language, '')
          .toString()
          .trim();
      };
      if (parts.length >= 2) {
        const [groupId, fieldId] = parts;
        const group = (definition.questions || []).find(q => q.id === groupId);
        const field = group?.lineItemConfig?.fields?.find((f: any) => (f?.id ?? '').toString() === fieldId);
        if (field) {
          label = resolveFieldLabel(field, language, fieldId);
          configuredFieldMessage = resolveRuleMessage(field);
        }
      } else {
        const q = (definition.questions || []).find(q => q.id === missingFieldPath);
        if (q) {
          label = resolveFieldLabel(q, language, q.id);
          configuredFieldMessage = resolveRuleMessage(q);
        }
      }
      const fallbackLabel = label || missingFieldPath;
      const configuredMessage = resolveLocalizedString(
        definition.submitValidation?.orderedEntryFieldErrorMessage,
        language,
        ''
      )
        .toString()
        .trim();
      const message = configuredFieldMessage
        ? configuredFieldMessage.replace(/\{field\}/g, fallbackLabel)
        : configuredMessage
          ? configuredMessage.replace(/\{field\}/g, fallbackLabel)
          : tSystem('validation.fieldRequired', language, '{field} is required.', { field: fallbackLabel });
      return {
        [missingFieldPath]: message
      };
    },
    [definition.questions, definition.submitValidation?.orderedEntryFieldErrorMessage, language]
  );

  useEffect(() => {
    if (!onFormValidityChange) return;
    onFormValidityChange(orderedEntryValid);
  }, [onFormValidityChange, orderedEntryValid]);

  const resolveOrderedEntryBlock = useCallback(
    (target: OrderedEntryTarget, targetGroup?: WebQuestionDefinition) => {
      if (!orderedEntryEnabled) return null;
      return findOrderedEntryBlock({
        definition: orderedEntryValidationDefinition,
        language,
        values,
        lineItems,
        errors: orderedEntryErrors,
        collapsedRows,
        resolveVisibilityValue,
        getTopValue,
        orderedQuestions: orderedEntryQuestions,
        target,
        targetGroup
      });
    },
    [
      collapsedRows,
      getTopValue,
      language,
      lineItems,
      orderedEntryErrors,
      orderedEntryEnabled,
      orderedEntryValidationDefinition,
      orderedEntryQuestions,
      resolveVisibilityValue,
      values
    ]
  );

  const triggerOrderedEntryValidation = useCallback(
    (target: OrderedEntryTarget, missingFieldPath: string, options?: TriggerOptions) => {
      let nextErrors: FormErrors = {};
      try {
        nextErrors = validateForm({
          definition: orderedEntryValidationDefinition,
          language,
          values,
          lineItems,
          collapsedRows,
          collapsedSubgroups,
          virtualState: guidedVirtualState
        });
      } catch (err: any) {
        onDiagnostic?.('validation.ordered.error', { message: err?.message || err || 'unknown' });
      }
      orderedEntryGuideFieldPathRef.current = missingFieldPath;
      setErrors(buildOrderedEntryErrors(missingFieldPath, nextErrors));
      const shouldNavigate = options?.navigate !== false || options?.scrollOnly === true;
      if (shouldNavigate) {
        requestValidationNavigation({
          scope: 'orderedEntry',
          scrollOnly: options?.scrollOnly,
          allowOverlayOpen: options?.allowOverlayOpen
        });
      } else {
        onDiagnostic?.('validation.ordered.blocked.noNavigate', {
          scope: target.scope,
          missingFieldPath,
          source: options?.source || null
        });
      }
      onDiagnostic?.('validation.ordered.blocked', {
        targetScope: target.scope,
        targetFieldPath:
          target.scope === 'top'
            ? target.questionId
            : `${target.groupId}__${target.fieldId}__${target.rowId}`,
        missingFieldPath
      });
    },
    [
      buildOrderedEntryErrors,
      collapsedRows,
      collapsedSubgroups,
      guidedVirtualState,
      language,
      lineItems,
      onDiagnostic,
      orderedEntryGuideFieldPathRef,
      orderedEntryValidationDefinition,
      requestValidationNavigation,
      setErrors,
      values
    ]
  );

  useEffect(() => {
    if (!orderedEntryEnabled || submitting) return;
    const missingFieldPath = firstOrderedEntryIssue?.missingFieldPath || '';
    if (!missingFieldPath) {
      orderedEntryGuideFieldPathRef.current = null;
      return;
    }

    const currentGuidePath = orderedEntryGuideFieldPathRef.current;
    const currentKeys = Object.keys(errors || {});
    const hasNonGuidanceErrors = currentKeys.some(key => key !== currentGuidePath);
    if (hasNonGuidanceErrors) return;

    const nextErrors = buildOrderedEntryErrors(missingFieldPath, (orderedEntryErrors || {}) as FormErrors);
    const nextKeys = Object.keys(nextErrors);
    const sameErrors =
      nextKeys.length === currentKeys.length &&
      nextKeys.every(key => errors[key] === nextErrors[key]);

    orderedEntryGuideFieldPathRef.current = missingFieldPath;
    if (!sameErrors) {
      setErrors(nextErrors);
    }

    if (currentGuidePath === missingFieldPath) return;
    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const activeTag = (activeEl?.tagName || '').toLowerCase();
    if (shouldDeferOrderedEntryGuidance({ issue: firstOrderedEntryIssue, activeTag })) return;
    requestValidationNavigation({
      scope: 'orderedEntryAuto',
      mode: 'scroll',
      allowOverlayOpen: false
    });
  }, [
    buildOrderedEntryErrors,
    errors,
    firstOrderedEntryIssue,
    orderedEntryEnabled,
    orderedEntryErrors,
    orderedEntryGuideFieldPathRef,
    requestValidationNavigation,
    setErrors,
    submitting
  ]);

  useEffect(() => {
    orderedEntryGateRef.current = ({ targetQuestionId }) => {
      if (!orderedEntryEnabled) return false;
      const orderedBlock = resolveOrderedEntryBlock({ scope: 'top', questionId: targetQuestionId });
      if (!orderedBlock) return false;
      triggerOrderedEntryValidation({ scope: 'top', questionId: targetQuestionId }, orderedBlock.missingFieldPath);
      return true;
    };
  }, [orderedEntryEnabled, orderedEntryGateRef, resolveOrderedEntryBlock, triggerOrderedEntryValidation]);

  return {
    resolveOrderedEntryBlock,
    triggerOrderedEntryValidation
  };
};
