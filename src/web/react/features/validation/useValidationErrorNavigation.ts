import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react';

import type { WebQuestionDefinition } from '../../../types';
import { parseSubgroupKey } from '../../app/lineItems';
import type { FormErrors, LineItemState } from '../../types';
import { shouldSuppressGuidedErrorStepNavigationAfterBack } from '../steps/domain/errorNavigation';
import { resolveGuidedErrorNavigationTarget } from './domain/guidedErrorNavigation';
import type { ValidationNavigationMode } from './useValidationNavigationRequest';

type DiagnosticHandler = (event: string, payload?: Record<string, unknown>) => void;
type BooleanMap = Record<string, boolean>;

type LineItemGroupOverlayState = {
  open?: boolean;
  groupId?: string | null;
};

type SubgroupOverlayState = {
  open?: boolean;
  subKey?: string | null;
};

type GuidedBackSuppressionState = {
  stepId: string;
  suppressUntil: number;
} | null;

type ValidationErrorNavigationArgs = {
  errors: FormErrors;
  consumeValidationNavigation: () => void;
  errorNavAllowOverlayOpenRef: MutableRefObject<boolean>;
  errorNavConsumedRef: MutableRefObject<number>;
  errorNavModeRef: MutableRefObject<ValidationNavigationMode>;
  errorNavRequestRef: MutableRefObject<number>;
  firstErrorRef: MutableRefObject<string | null>;
  guidedBackErrorNavSuppressionRef: MutableRefObject<GuidedBackSuppressionState>;
  nestedGroupMeta: {
    lineFieldToGroupKey: Record<string, string>;
    subgroupFieldToGroupKey: Record<string, string>;
  };
  questions: WebQuestionDefinition[];
  activeGuidedStepId: string;
  guidedEnabled: boolean;
  guidedInlineLineGroupIds: ReadonlySet<string>;
  guidedStepIds: string[];
  guidedStepsCfg: any;
  guidedVisibleSteps: any[];
  lineItems: LineItemState;
  maxReachableGuidedIndex: number;
  onDiagnostic?: DiagnosticHandler;
  openLineItemGroupOverlay: (groupId: string, options?: { source?: 'navigate' }) => void;
  openSubgroupOverlay: (subKey: string, options?: { source?: 'navigate' }) => void;
  questionIdToGroupKey: Record<string, string>;
  selectGuidedStep: (stepId: string, source: 'auto') => void;
  lineItemGroupOverlay: LineItemGroupOverlayState;
  subgroupOverlay: SubgroupOverlayState;
  setCollapsedGroups: Dispatch<SetStateAction<BooleanMap>>;
  setCollapsedRows: Dispatch<SetStateAction<BooleanMap>>;
};

export const useValidationErrorNavigation = (args: ValidationErrorNavigationArgs): void => {
  const {
    errors,
    consumeValidationNavigation,
    errorNavAllowOverlayOpenRef,
    errorNavConsumedRef,
    errorNavModeRef,
    errorNavRequestRef,
    firstErrorRef,
    guidedBackErrorNavSuppressionRef,
    nestedGroupMeta,
    questions,
    activeGuidedStepId,
    guidedEnabled,
    guidedInlineLineGroupIds,
    guidedStepIds,
    guidedStepsCfg,
    guidedVisibleSteps,
    lineItems,
    maxReachableGuidedIndex,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    questionIdToGroupKey,
    selectGuidedStep,
    lineItemGroupOverlay,
    subgroupOverlay,
    setCollapsedGroups,
    setCollapsedRows
  } = args;

  useEffect(() => {
    const keys = Object.keys(errors || {});
    if (!keys.length) {
      firstErrorRef.current = null;
      return;
    }
    // Only auto-navigate to the next errored field on submit attempt.
    // While the user is typing, errors will change (as fields are fixed) and we should not steal focus.
    if (errorNavConsumedRef.current === errorNavRequestRef.current) return;
    let firstKey = keys[0];
    if (typeof document === 'undefined') return;
    const guidedPick = resolveGuidedErrorNavigationTarget({
      errorKeys: keys,
      guidedEnabled,
      guidedStepsCfg,
      guidedStepIds,
      guidedVisibleSteps,
      activeGuidedStepId,
      maxReachableGuidedIndex,
      lineItems
    });
    firstKey = guidedPick.key;
    const desiredStepId = guidedPick.stepId;
    if (desiredStepId && guidedEnabled && desiredStepId !== activeGuidedStepId) {
      const suppressState = guidedBackErrorNavSuppressionRef.current;
      const shouldSuppressGuidedStepRedirect = shouldSuppressGuidedErrorStepNavigationAfterBack({
        guidedStepIds,
        activeStepId: activeGuidedStepId,
        desiredStepId,
        suppressedStepId: suppressState?.stepId || null,
        suppressUntil: suppressState?.suppressUntil || null
      });
      if (shouldSuppressGuidedStepRedirect) {
        onDiagnostic?.('validation.navigate.step.suppressed', {
          from: activeGuidedStepId,
          to: desiredStepId,
          key: firstKey,
          reason: 'manualBack'
        });
        consumeValidationNavigation();
        return;
      }
      // Switch steps first, then re-run this navigation effect to scroll once the field is mounted.
      selectGuidedStep(desiredStepId, 'auto');
      onDiagnostic?.('validation.navigate.step', { from: activeGuidedStepId, to: desiredStepId, key: firstKey });
      return;
    }

    const wasSame = firstErrorRef.current === firstKey;
    firstErrorRef.current = firstKey;
    const allowOverlayOpen = errorNavAllowOverlayOpenRef.current !== false;

    const expandGroupForQuestionId = (questionId: string): boolean => {
      const groupKey = questionIdToGroupKey[questionId];
      if (!groupKey) return false;
      setCollapsedGroups(prev => (prev[groupKey] === false ? prev : { ...prev, [groupKey]: false }));
      return true;
    };

    const ensureMountedForError = (): boolean => {
      const parts = firstKey.split('__');
      if (parts.length !== 3) {
        return expandGroupForQuestionId(firstKey);
      }
      const prefix = parts[0];
      const fieldId = parts[1];
      const rowId = parts[2];
      const subgroupInfo = parseSubgroupKey(prefix);
      if (subgroupInfo) {
        expandGroupForQuestionId(subgroupInfo.rootGroupId);
        const collapseKey = `${subgroupInfo.parentGroupKey}::${subgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey =
          nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.rootGroupId}::${subgroupInfo.path.join('.') || subgroupInfo.subGroupId}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        if (allowOverlayOpen && (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix)) {
          openSubgroupOverlay(prefix, { source: 'navigate' });
          onDiagnostic?.('validation.navigate.openSubgroup', { key: firstKey, subKey: prefix });
        }
        return true;
      }

      const groupCfg = questions.find(q => q.id === prefix && q.type === 'LINE_ITEM_GROUP');
      const groupOverlayEnabled = !!(groupCfg as any)?.lineItemConfig?.ui?.openInOverlay;
      const suppressOverlayForGuidedInline = guidedEnabled && guidedInlineLineGroupIds.has(prefix);
      if (allowOverlayOpen && groupOverlayEnabled && !suppressOverlayForGuidedInline) {
        if (!lineItemGroupOverlay.open || lineItemGroupOverlay.groupId !== prefix) {
          openLineItemGroupOverlay(prefix, { source: 'navigate' });
          onDiagnostic?.('validation.navigate.openLineItemGroupOverlay', { key: firstKey, groupId: prefix, source: 'submit' });
        }
      }

      expandGroupForQuestionId(prefix);
      const collapseKey = `${prefix}::${rowId}`;
      setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
      const nestedKey = nestedGroupMeta.lineFieldToGroupKey[`${prefix}__${fieldId}`];
      if (nestedKey) {
        setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
      }
      return true;
    };

    const scrollToError = (): boolean => {
      const target = document.querySelector<HTMLElement>(`[data-field-path="${firstKey}"]`);
      if (!target) return false;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (errorNavModeRef.current !== 'scroll') {
        const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
        try {
          focusable?.focus({ preventScroll: true });
        } catch {
          // ignore focus issues
        }
      }
      return true;
    };

    const requestedMount = ensureMountedForError();
    const attempt = () => scrollToError();

    requestAnimationFrame(() => {
      const found = attempt();
      if (found && wasSame) return;
      if (!found && requestedMount) {
        requestAnimationFrame(() => attempt());
        setTimeout(() => attempt(), 80);
      }
    });
    consumeValidationNavigation();
  }, [
    errors,
    consumeValidationNavigation,
    errorNavAllowOverlayOpenRef,
    errorNavConsumedRef,
    errorNavModeRef,
    errorNavRequestRef,
    firstErrorRef,
    guidedBackErrorNavSuppressionRef,
    nestedGroupMeta.lineFieldToGroupKey,
    nestedGroupMeta.subgroupFieldToGroupKey,
    questions,
    activeGuidedStepId,
    guidedEnabled,
    guidedInlineLineGroupIds,
    guidedStepIds,
    guidedStepsCfg,
    guidedVisibleSteps,
    lineItems,
    maxReachableGuidedIndex,
    onDiagnostic,
    openLineItemGroupOverlay,
    openSubgroupOverlay,
    questionIdToGroupKey,
    selectGuidedStep,
    lineItemGroupOverlay.groupId,
    lineItemGroupOverlay.open,
    setCollapsedGroups,
    setCollapsedRows,
    subgroupOverlay.open,
    subgroupOverlay.subKey
  ]);
};
