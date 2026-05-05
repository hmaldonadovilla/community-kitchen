import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { LangCode } from '../../../../types';
import type { GuidedStepStatus } from './computeStepStatus';
import {
  type GuidedForwardGate,
  isGuidedStepForwardGateSatisfied,
  resolveGuidedStepForwardGate
} from './guidedNavigation';

export type GuidedUiState = {
  activeStepId: string | null;
  activeStepIndex: number;
  stepCount: number;
  isFirst: boolean;
  isFinal: boolean;
  forwardGateSatisfied: boolean;
  backAllowed: boolean;
  backVisible: boolean;
  backLabel: string;
  stepSubmitLabel?: string;
};

export const resolveGuidedUiStateAction = (args: {
  enabled: boolean;
  stepsConfig: any;
  stepIds: string[];
  visibleSteps: any[];
  activeStepId: string;
  activeStepIndex: number;
  statuses: GuidedStepStatus[];
  defaultForwardGate: GuidedForwardGate;
  dedupNavigationBlocked?: boolean;
  language: LangCode;
}): GuidedUiState | null => {
  if (!args.enabled || !args.stepsConfig || !args.stepIds.length) return null;
  const stepConfig = args.visibleSteps[args.activeStepIndex] as any;
  const isFinal = args.activeStepIndex >= args.stepIds.length - 1;
  const forwardGate = resolveGuidedStepForwardGate(stepConfig, args.defaultForwardGate);
  const stepStatus = args.statuses.find(status => status.id === args.activeStepId);
  const forwardGateSatisfied = isGuidedStepForwardGateSatisfied({
    gate: forwardGate,
    status: stepStatus,
    navigationBlocked: args.dedupNavigationBlocked
  });
  const allowBack = (stepConfig?.navigation?.allowBack ?? stepConfig?.allowBack) !== false;
  const showBackGlobal = args.stepsConfig?.showBackButton !== false;
  const showBackStep = (stepConfig?.navigation?.showBackButton ?? stepConfig?.showBackButton) !== false;
  const backVisible = args.activeStepIndex > 0 && allowBack && showBackGlobal && showBackStep;
  const backLabel = resolveLocalizedString(
    (stepConfig?.navigation?.backLabel as any) || args.stepsConfig?.backButtonLabel,
    args.language,
    tSystem('actions.back', args.language, 'Back')
  );
  const stepSubmitLabel = !isFinal
    ? resolveLocalizedString(
        (stepConfig?.navigation?.submitLabel as any) || args.stepsConfig?.stepSubmitLabel,
        args.language,
        tSystem('steps.next', args.language, 'Next')
      )
    : null;

  return {
    activeStepId: args.activeStepId || null,
    activeStepIndex: args.activeStepIndex,
    stepCount: args.stepIds.length,
    isFirst: args.activeStepIndex <= 0,
    isFinal,
    forwardGateSatisfied,
    backAllowed: allowBack,
    backVisible,
    backLabel: backLabel?.toString?.() || '',
    stepSubmitLabel: stepSubmitLabel || undefined
  };
};
