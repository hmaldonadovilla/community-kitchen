import type { FieldValue, LangCode, WebFormDefinition } from '../../../../types';
import type { LineItemState } from '../../../types';
import { computeGuidedStepsStatus, type GuidedStepsStatus } from './computeStepStatus';
import type { GuidedStepsVirtualState } from './resolveVirtualStepField';
import { filterVisibleGuidedSteps } from './stepVisibility';

type GuidedStepsConfig = NonNullable<WebFormDefinition['steps']>;

export type GuidedListProjection = {
  stepsConfig: GuidedStepsConfig | null;
  prefix: string;
  visibleSteps: any[];
  stepIds: string[];
  status: GuidedStepsStatus | null;
  defaultForwardGate: 'free' | 'whenComplete' | 'whenValid';
  maxReachableIndex: number;
  activeStepIndex: number;
  activeStepId: string;
  virtualState: GuidedStepsVirtualState | null;
};

/**
 * Owns pure guided-step projection decisions for list/search/render helpers.
 *
 * Keep this boundary free of React state, DOM access, and transport calls. The App
 * layer supplies current form state; this module resolves the virtual step fields
 * used by action/button visibility rules.
 */
export const resolveGuidedListProjection = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  applyVisibility: boolean;
  getVisibilityValue: (fieldId: string) => FieldValue | undefined;
}): GuidedListProjection => {
  const stepsConfig =
    args.applyVisibility && (args.definition as any)?.steps?.mode === 'guided'
      ? ((args.definition as any).steps as GuidedStepsConfig)
      : null;
  const prefix = (stepsConfig?.stateFields?.prefix || '__ckStep').toString();
  const visibleSteps = stepsConfig
    ? filterVisibleGuidedSteps((stepsConfig.items || []) as any[], {
        getValue: (fieldId: string) => args.getVisibilityValue(fieldId)
      } as any)
    : [];
  const stepIds = visibleSteps
    .map(step => (step?.id !== undefined && step?.id !== null ? step.id.toString().trim() : ''))
    .filter(Boolean);
  const status = stepsConfig
    ? computeGuidedStepsStatus({
        definition: args.definition,
        language: args.language,
        values: args.values,
        lineItems: args.lineItems
      })
    : null;
  const defaultForwardGate = ((stepsConfig as any)?.defaultForwardGate || 'whenValid') as
    | 'free'
    | 'whenComplete'
    | 'whenValid';
  const maxReachableIndex = (() => {
    if (!stepsConfig) return -1;
    if (!stepIds.length) return -1;
    if (defaultForwardGate === 'free') return stepIds.length - 1;
    if (defaultForwardGate === 'whenComplete') {
      return Math.min(stepIds.length - 1, Math.max(0, (status?.maxCompleteIndex ?? -1) + 1));
    }
    return Math.min(stepIds.length - 1, Math.max(0, (status?.maxValidIndex ?? -1) + 1));
  })();
  const activeStepIndex = maxReachableIndex >= 0 ? maxReachableIndex : 0;
  const activeStepId = stepIds[activeStepIndex] || stepIds[0] || '';
  const virtualState = stepsConfig
    ? {
        prefix,
        activeStepId,
        activeStepIndex,
        maxValidIndex: status?.maxValidIndex ?? -1,
        maxCompleteIndex: status?.maxCompleteIndex ?? -1,
        steps: status?.steps || []
      }
    : null;

  return {
    stepsConfig,
    prefix,
    visibleSteps,
    stepIds,
    status,
    defaultForwardGate,
    maxReachableIndex,
    activeStepIndex,
    activeStepId,
    virtualState
  };
};
