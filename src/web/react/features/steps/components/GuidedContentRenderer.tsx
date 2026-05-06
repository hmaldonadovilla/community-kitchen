import React from 'react';

import { resolveLocalizedString } from '../../../../i18n';
import type { FieldValue, LangCode, OptionSet, WebQuestionDefinition } from '../../../../types';
import type { FormErrors } from '../../../types';
import { GuidedContextHeader } from './GuidedContextHeader';
import { GuidedFormContent } from './GuidedFormContent';
import { GuidedLineGroupTargetRenderer } from './GuidedLineGroupTargetRenderer';
import { renderGuidedTargetsWithPairing } from './renderGuidedTargetsWithPairing';
import { collectGuidedContextHeaderConfig } from '../domain/guidedContextHeader';
import {
  buildGuidedQuestionByIdMapAction,
  filterGuidedTargetsForContextHeaderAction,
  resolveGuidedTargetQuestionAction
} from '../domain/guidedTargets';

type GuidedContentRendererProps = {
  guidedEnabled: boolean;
  guidedStepsCfg: any;
  guidedVisibleSteps: any[];
  activeGuidedStepId: string;
  activeGuidedStepIndex: number;
  guidedStatusSteps: any;
  guidedStepBarBlockedIds: Set<string> | string[];
  guidedForwardNavigationBlocked?: boolean;
  maxReachableGuidedIndex: number;
  guidedStepBodyRef: React.RefObject<HTMLDivElement>;
  guidedLineGroupOverrideLoggedRef: React.MutableRefObject<Set<string>>;
  language: LangCode;
  definitionQuestions: WebQuestionDefinition[];
  values: Record<string, FieldValue>;
  submitting: boolean;
  errors: FormErrors;
  renderOptions: (q: WebQuestionDefinition) => OptionSet;
  renderQuestion: (q: WebQuestionDefinition, renderOpts?: { inGrid?: boolean }) => React.ReactNode;
  isQuestionVisible: (q: WebQuestionDefinition) => boolean;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  isFieldLockedByDedup: (fieldPath: string) => boolean;
  openLineItemGroupOverlay: (groupOrId: WebQuestionDefinition | string, options?: any) => void;
  buildLineItemGroupQuestionContext: (overrides?: Record<string, any>) => any;
  handleGuidedStepSelect: (stepId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

/**
 * Owner: guided-step target rendering.
 * Keeps guided header/target filtering and line-group target orchestration out
 * of the large FormView shell while leaving form mutation callbacks injected.
 */
export const GuidedContentRenderer: React.FC<GuidedContentRendererProps> = ({
  guidedEnabled,
  guidedStepsCfg,
  guidedVisibleSteps,
  activeGuidedStepId,
  activeGuidedStepIndex,
  guidedStatusSteps,
  guidedStepBarBlockedIds,
  guidedForwardNavigationBlocked,
  maxReachableGuidedIndex,
  guidedStepBodyRef,
  guidedLineGroupOverrideLoggedRef,
  language,
  definitionQuestions,
  values,
  submitting,
  errors,
  renderOptions,
  renderQuestion,
  isQuestionVisible,
  hasWarning,
  renderWarnings,
  isFieldLockedByDedup,
  openLineItemGroupOverlay,
  buildLineItemGroupQuestionContext,
  handleGuidedStepSelect,
  onDiagnostic
}) => {
  if (!guidedEnabled || !guidedStepsCfg) return null;
  const steps = guidedVisibleSteps;
  if (!steps.length) return null;

  const stepCfg = (steps.find(s => (s?.id || '').toString() === activeGuidedStepId) || steps[0]) as any;
  const headerTargets: any[] = Array.isArray(guidedStepsCfg.header?.include) ? (guidedStepsCfg.header.include as any[]) : [];
  const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];

  const stepHelpText = stepCfg?.helpText ? resolveLocalizedString(stepCfg.helpText, language, '') : '';
  const stepLineGroupsDefaultMode = (stepCfg?.render?.lineGroups?.mode || '') as 'inline' | 'overlay' | '';
  const stepSubGroupsDefaultMode = (stepCfg?.render?.subGroups?.mode || '') as 'inline' | 'overlay' | '';
  const {
    parts: stepContextHeaderParts,
    partIds: stepContextHeaderPartIds,
    separator: guidedContextHeaderSeparator
  } = collectGuidedContextHeaderConfig(stepCfg?.contextHeader);
  const guidedContextHeaderIds = new Set<string>(stepContextHeaderPartIds);

  const questionById = buildGuidedQuestionByIdMapAction(definitionQuestions);
  const resolveTargetQuestion = (target: any): WebQuestionDefinition | null =>
    resolveGuidedTargetQuestionAction({ target, questionById });

  const guidedContextHeaderNode = stepContextHeaderParts.length ? (
    <GuidedContextHeader
      language={language}
      parts={stepContextHeaderParts}
      separator={guidedContextHeaderSeparator}
      values={values}
      questionById={questionById}
      resolveOptionSet={renderOptions}
    />
  ) : null;

  const stepTargetsFiltered = filterGuidedTargetsForContextHeaderAction({
    targets: stepTargets,
    contextHeaderIds: guidedContextHeaderIds
  });

  const renderTarget = (target: any, keyPrefix: string): React.ReactNode => {
    if (!target || typeof target !== 'object') return null;
    const kind = (target.kind || '').toString().trim();
    const id = (target.id || '').toString().trim();
    if (!kind || !id) return null;

    if (kind === 'question') {
      const q = resolveTargetQuestion(target);
      if (!q) return null;
      return <React.Fragment key={`${keyPrefix}:q:${q.id}`}>{renderQuestion(q)}</React.Fragment>;
    }

    if (kind !== 'lineGroup') return null;
    const groupQ = definitionQuestions.find(q2 => q2.id === id && q2.type === 'LINE_ITEM_GROUP');
    if (!groupQ) return null;

    const onGroupOverrideApplied = onDiagnostic
      ? (groupId: string, keys: string[]) => {
          const logKey = `${activeGuidedStepId}::${groupId}::groupOverride`;
          if (guidedLineGroupOverrideLoggedRef.current.has(logKey)) return;
          guidedLineGroupOverrideLoggedRef.current.add(logKey);
          onDiagnostic('steps.lineGroup.groupOverride.applied', {
            stepId: activeGuidedStepId,
            groupId,
            keys
          });
        }
      : undefined;

    return (
      <GuidedLineGroupTargetRenderer
        key={`${keyPrefix}:lg:${id}`}
        target={target}
        keyPrefix={keyPrefix}
        groupQ={groupQ}
        activeGuidedStepId={activeGuidedStepId}
        language={language}
        stepLineGroupsDefaultMode={stepLineGroupsDefaultMode}
        stepSubGroupsDefaultMode={stepSubGroupsDefaultMode}
        submitting={submitting}
        errors={errors}
        hasWarning={hasWarning}
        renderWarnings={renderWarnings}
        isFieldLockedByDedup={isFieldLockedByDedup}
        openLineItemGroupOverlay={openLineItemGroupOverlay}
        buildLineItemGroupQuestionContext={buildLineItemGroupQuestionContext}
        onGroupOverrideApplied={onGroupOverrideApplied}
      />
    );
  };

  const renderTargetsWithPairing = (targets: any[], keyPrefix: string): React.ReactNode[] =>
    renderGuidedTargetsWithPairing({
      targets,
      keyPrefix,
      resolveTargetQuestion,
      renderTarget,
      renderQuestion,
      isQuestionVisible
    });

  return (
    <GuidedFormContent
      language={language}
      steps={steps}
      status={guidedStatusSteps}
      activeStepId={activeGuidedStepId}
      disabledStepIds={guidedStepBarBlockedIds}
      maxReachableIndex={
        guidedForwardNavigationBlocked ? Math.min(maxReachableGuidedIndex, activeGuidedStepIndex) : maxReachableGuidedIndex
      }
      bodyRef={guidedStepBodyRef}
      contextHeader={guidedContextHeaderNode}
      stepHelpText={stepHelpText}
      headerContent={renderTargetsWithPairing(headerTargets, 'header')}
      stepContent={renderTargetsWithPairing(stepTargetsFiltered, `step:${activeGuidedStepId}`)}
      onSelectStep={handleGuidedStepSelect}
    />
  );
};
