import { useEffect, useMemo, useRef } from 'react';

import type { LangCode, WebFormDefinition } from '../../../types';
import {
  collectAddOverlayCopyGroups,
  collectGuidedRowFlowSegmentActionTargets,
  collectGuidedRowFlowTargets,
  collectLineItemDedupGroups,
  collectNonMatchWarningModeGroups,
  collectOverlayDetailGroups,
  collectSelectorOverlayGroups,
  collectSelectorOverlayHelperGroups,
  resolveFoodSafetyDiagnosticPayloads
} from './formConfigDiagnostics';

type UseFormConfigDiagnosticsArgs = {
  definition: WebFormDefinition;
  language: LangCode;
  guidedEnabled: boolean;
  guidedStepIds: string[];
  guidedStepsCfg: any;
  guidedVisibleSteps: any[];
  orderedEntryEnabled: boolean;
  onDiagnostic?: (event: string, payload?: any) => void;
};

/**
 * Owner: form configuration diagnostics.
 * Emits one-time and signature-gated diagnostics for optional form features
 * without keeping config traversal logic in the main form renderer.
 */
export const useFormConfigDiagnostics = ({
  definition,
  language,
  guidedEnabled,
  guidedStepIds,
  guidedStepsCfg,
  guidedVisibleSteps,
  orderedEntryEnabled,
  onDiagnostic
}: UseFormConfigDiagnosticsArgs): void => {
  const foodSafetyLoggedRef = useRef(false);
  const guidedVisibilitySignatureRef = useRef('');
  const rowFlowSignatureRef = useRef('');
  const rowFlowSegmentActionsSignatureRef = useRef('');

  useEffect(() => {
    if (!guidedEnabled) return;
    onDiagnostic?.('steps.enabled', { mode: 'guided', stepCount: guidedStepIds.length });
    onDiagnostic?.('steps.validation.noticeMode', { mode: 'fieldOnly' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedEnabled]);

  useEffect(() => {
    if (!guidedEnabled) return;
    const payload = {
      visibleStepIds: guidedStepIds,
      visibleStepCount: guidedStepIds.length,
      hiddenStepCount: Math.max(0, ((guidedStepsCfg?.items || []) as any[]).length - guidedStepIds.length)
    };
    const signature = JSON.stringify(payload);
    if (guidedVisibilitySignatureRef.current === signature) return;
    guidedVisibilitySignatureRef.current = signature;
    onDiagnostic?.('steps.visibility.resolved', payload);
  }, [guidedEnabled, guidedStepIds, guidedStepsCfg, onDiagnostic]);

  useEffect(() => {
    if (!orderedEntryEnabled) return;
    onDiagnostic?.('validation.ordered.enabled', { mode: guidedEnabled ? 'guided' : 'standard' });
  }, [guidedEnabled, onDiagnostic, orderedEntryEnabled]);

  useEffect(() => {
    if (!onDiagnostic || foodSafetyLoggedRef.current) return;
    const payloads = resolveFoodSafetyDiagnosticPayloads({
      questions: definition.questions || [],
      steps: definition.steps?.items || [],
      language
    });
    if (!payloads) return;
    onDiagnostic('form.foodSafety.helperText', payloads.helperText);
    onDiagnostic('form.foodSafety.fields', payloads.fields);
    foodSafetyLoggedRef.current = true;
  }, [definition.questions, definition.steps, language, onDiagnostic]);

  const selectorOverlayGroups = useMemo(
    () => collectSelectorOverlayGroups(definition.questions || []),
    [definition.questions]
  );

  useEffect(() => {
    if (!selectorOverlayGroups.length) return;
    onDiagnostic?.('form.lineItems.selectorOverlay.enabled', { groupIds: selectorOverlayGroups });
  }, [onDiagnostic, selectorOverlayGroups]);

  const selectorOverlayHelperGroups = useMemo(
    () => collectSelectorOverlayHelperGroups(definition.questions || []),
    [definition.questions]
  );

  useEffect(() => {
    if (!selectorOverlayHelperGroups.length) return;
    onDiagnostic?.('form.lineItems.selectorOverlay.helperText.enabled', { groupIds: selectorOverlayHelperGroups });
  }, [onDiagnostic, selectorOverlayHelperGroups]);

  const addOverlayCopyGroups = useMemo(
    () => collectAddOverlayCopyGroups(definition.questions || []),
    [definition.questions]
  );

  useEffect(() => {
    if (!addOverlayCopyGroups.length) return;
    onDiagnostic?.('form.lineItems.addOverlayCopy.enabled', { groupIds: addOverlayCopyGroups });
  }, [addOverlayCopyGroups, onDiagnostic]);

  const nonMatchWarningModeGroups = useMemo(
    () => collectNonMatchWarningModeGroups(definition.questions || []),
    [definition.questions]
  );

  useEffect(() => {
    if (!nonMatchWarningModeGroups.length) return;
    onDiagnostic?.('form.lineItems.nonMatchWarningMode.enabled', { groups: nonMatchWarningModeGroups });
  }, [nonMatchWarningModeGroups, onDiagnostic]);

  const lineItemDedupGroups = useMemo(
    () => collectLineItemDedupGroups(definition.questions || []),
    [definition.questions]
  );

  useEffect(() => {
    if (!lineItemDedupGroups.length) return;
    onDiagnostic?.('form.lineItems.dedupRules.enabled', { groups: lineItemDedupGroups });
  }, [lineItemDedupGroups, onDiagnostic]);

  const overlayDetailGroups = useMemo(
    () => collectOverlayDetailGroups(definition.questions || []),
    [definition.questions]
  );

  useEffect(() => {
    if (!overlayDetailGroups.length) return;
    onDiagnostic?.('form.lineItems.overlayDetail.enabled', { groups: overlayDetailGroups });
  }, [onDiagnostic, overlayDetailGroups]);

  const rowFlowTargets = useMemo(() => {
    if (!guidedStepsCfg) return [];
    return collectGuidedRowFlowTargets(guidedVisibleSteps);
  }, [guidedStepsCfg, guidedVisibleSteps]);

  const rowFlowSegmentActionTargets = useMemo(() => {
    if (!guidedStepsCfg) return [];
    return collectGuidedRowFlowSegmentActionTargets(guidedVisibleSteps);
  }, [guidedStepsCfg, guidedVisibleSteps]);

  useEffect(() => {
    if (!rowFlowTargets.length) return;
    const payload = { targets: rowFlowTargets };
    const signature = JSON.stringify(payload);
    if (rowFlowSignatureRef.current === signature) return;
    rowFlowSignatureRef.current = signature;
    onDiagnostic?.('form.rowFlow.enabled', payload);
  }, [onDiagnostic, rowFlowTargets]);

  useEffect(() => {
    if (!rowFlowSegmentActionTargets.length) return;
    const payload = { targets: rowFlowSegmentActionTargets };
    const signature = JSON.stringify(payload);
    if (rowFlowSegmentActionsSignatureRef.current === signature) return;
    rowFlowSegmentActionsSignatureRef.current = signature;
    onDiagnostic?.('form.rowFlow.output.segmentActions.enabled', payload);
  }, [onDiagnostic, rowFlowSegmentActionTargets]);
};
