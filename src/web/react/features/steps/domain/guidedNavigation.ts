import type { GuidedStepStatus, GuidedStepsStatus } from './computeStepStatus';
import type { GuidedStepsVirtualState } from './resolveVirtualStepField';

export type GuidedForwardGate = 'free' | 'whenComplete' | 'whenValid';
export type GuidedAutoAdvanceMode = 'off' | 'onComplete' | 'onValid';

type GuidedStepNavigationConfig = {
  forwardGate?: unknown;
  autoAdvance?: unknown;
};

type GuidedStepConfig = {
  id?: unknown;
  forwardGate?: unknown;
  autoAdvance?: unknown;
  navigation?: GuidedStepNavigationConfig | null;
};

/**
 * Owns pure guided-step navigation and completion-gate decisions.
 *
 * Keep this boundary free of React state, DOM access, and transport calls. FormView
 * supplies the current step/status inputs; this module resolves reusable gate state.
 */
export const normalizeGuidedForwardGate = (raw: unknown, fallback: GuidedForwardGate): GuidedForwardGate => {
  const value = (raw ?? '').toString().trim().toLowerCase();
  if (value === 'free') return 'free';
  if (value === 'whencomplete') return 'whenComplete';
  if (value === 'whenvalid') return 'whenValid';
  // Accept common mis-typed aliases to reduce config footguns.
  if (value === 'oncomplete') return 'whenComplete';
  if (value === 'onvalid') return 'whenValid';
  return fallback;
};

export const normalizeGuidedAutoAdvance = (raw: unknown, fallback: GuidedAutoAdvanceMode): GuidedAutoAdvanceMode => {
  const value = (raw ?? '').toString().trim().toLowerCase();
  if (value === 'off') return 'off';
  if (value === 'oncomplete') return 'onComplete';
  if (value === 'onvalid') return 'onValid';
  // Accept common mis-typed aliases to reduce config footguns.
  if (value === 'whencomplete') return 'onComplete';
  if (value === 'whenvalid') return 'onValid';
  return fallback;
};

export const resolveGuidedStepForwardGate = (
  stepConfig: GuidedStepConfig | null | undefined,
  fallback: GuidedForwardGate
): GuidedForwardGate => normalizeGuidedForwardGate(stepConfig?.navigation?.forwardGate ?? stepConfig?.forwardGate, fallback);

export const resolveGuidedStepAutoAdvance = (
  stepConfig: GuidedStepConfig | null | undefined,
  defaultAutoAdvance: unknown,
  fallback: GuidedAutoAdvanceMode
): GuidedAutoAdvanceMode =>
  normalizeGuidedAutoAdvance(stepConfig?.navigation?.autoAdvance ?? stepConfig?.autoAdvance ?? defaultAutoAdvance, fallback);

export const isGuidedStepForwardGateSatisfied = (args: {
  gate: GuidedForwardGate;
  status?: GuidedStepStatus | null;
  navigationBlocked?: boolean;
}): boolean => {
  const satisfied =
    args.gate === 'free'
      ? true
      : args.gate === 'whenComplete'
        ? Boolean(args.status?.complete)
        : Boolean(args.status?.valid);
  return satisfied && !args.navigationBlocked;
};

export const resolveMaxReachableGuidedStepIndex = (args: {
  enabled: boolean;
  hasStepsConfig: boolean;
  stepIds: string[];
  visibleSteps: GuidedStepConfig[];
  statuses: GuidedStepStatus[];
  defaultForwardGate: GuidedForwardGate;
}): number => {
  if (!args.enabled) return -1;
  if (!args.stepIds.length) return -1;
  if (!args.hasStepsConfig) return -1;

  const stepConfigById = new Map<string, GuidedStepConfig>();
  args.visibleSteps.forEach(step => {
    const id = (step?.id ?? '').toString().trim();
    if (!id) return;
    if (!stepConfigById.has(id)) stepConfigById.set(id, step);
  });

  const statusById = new Map<string, GuidedStepStatus>();
  args.statuses.forEach(status => {
    const id = (status?.id ?? '').toString().trim();
    if (!id) return;
    statusById.set(id, status);
  });

  let reachable = 0;
  for (let index = 0; index < args.stepIds.length - 1; index += 1) {
    const stepId = args.stepIds[index];
    const gate = resolveGuidedStepForwardGate(stepConfigById.get(stepId), args.defaultForwardGate);
    if (gate === 'free') {
      reachable = index + 1;
      continue;
    }

    const status = statusById.get(stepId);
    if (!isGuidedStepForwardGateSatisfied({ gate, status })) break;
    reachable = index + 1;
  }
  return reachable;
};

export const resolveGuidedStepsVirtualState = (args: {
  enabled: boolean;
  prefix: string;
  activeStepId: string;
  stepIds: string[];
  status: GuidedStepsStatus;
}): GuidedStepsVirtualState | null => {
  if (!args.enabled) return null;
  const activeStepIndex = Math.max(0, args.stepIds.indexOf(args.activeStepId));
  return {
    prefix: args.prefix,
    activeStepId: args.activeStepId,
    activeStepIndex,
    maxValidIndex: args.status.maxValidIndex,
    maxCompleteIndex: args.status.maxCompleteIndex,
    steps: args.status.steps
  };
};
