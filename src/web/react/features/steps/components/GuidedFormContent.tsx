import React from 'react';
import { createPortal } from 'react-dom';

import type { LangCode } from '../../../../types';
import { SectionInstruction } from '../../../components/form/SectionInstruction';
import { StepsBar } from './StepsBar';

/**
 * Owner: guided steps UI.
 * Renders the guided step bar and active step body. Step selection, target
 * resolution, and form mutation remain owned by FormView and are passed in.
 */
export const GuidedFormContent: React.FC<{
  language: LangCode;
  steps: any[];
  status: any;
  activeStepId: string;
  disabledStepIds: Set<string> | string[];
  maxReachableIndex: number;
  bodyRef: React.RefObject<HTMLDivElement>;
  contextHeader: React.ReactNode;
  stepHelpText: string;
  headerContent: React.ReactNode;
  stepContent: React.ReactNode;
  onSelectStep: (stepId: string) => void;
}> = ({
  language,
  steps,
  status,
  activeStepId,
  disabledStepIds,
  maxReachableIndex,
  bodyRef,
  contextHeader,
  stepHelpText,
  headerContent,
  stepContent,
  onSelectStep
}) => {
  const disabledStepIdList = Array.isArray(disabledStepIds) ? disabledStepIds : Array.from(disabledStepIds);
  const stepsBarNode = (
    <StepsBar
      language={language}
      steps={steps.map(s => ({ id: (s?.id || '').toString(), label: (s as any).label }))}
      status={status}
      activeStepId={activeStepId}
      disabledStepIds={disabledStepIdList}
      maxReachableIndex={maxReachableIndex}
      onSelectStep={onSelectStep}
    />
  );
  const stepsBarPortalEl =
    typeof document !== 'undefined' ? (document.getElementById('ck-guided-stepsbar-slot') as HTMLElement | null) : null;
  const stepsBarPortal = stepsBarPortalEl ? createPortal(stepsBarNode, stepsBarPortalEl) : null;
  const stepsBarInline = stepsBarPortalEl ? null : stepsBarNode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stepsBarPortal}
      {stepsBarInline}
      <div ref={bodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {contextHeader}
        {stepHelpText ? (
          <SectionInstruction
            id={`ck-step-instruction-${activeStepId}`}
            language={language}
            text={stepHelpText}
          />
        ) : null}
        {headerContent}
        {stepContent}
      </div>
    </div>
  );
};
