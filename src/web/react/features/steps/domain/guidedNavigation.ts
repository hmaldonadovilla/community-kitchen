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

export type GuidedStepSelectionReason = 'user' | 'auto';

export type GuidedStepSelectionResolution =
  | { action: 'none' }
  | {
      action: 'blocked';
      clearBackErrorSuppression?: boolean;
      diagnostic: Record<string, unknown>;
    }
  | {
      action: 'select';
      nextStepId: string;
      resetAutoAdvance?: boolean;
      clearBackErrorSuppression?: boolean;
      backErrorSuppressionStepId?: string | null;
      diagnostic: Record<string, unknown>;
  };

export const resolveGuidedStepSelectionAction = (args: {
  enabled: boolean;
  nextStepId: string;
  activeStepId: string;
  stepIds: string[];
  stepsConfig: any;
  reason: GuidedStepSelectionReason;
  forwardNavigationBlocked: boolean;
  defaultForwardGate: GuidedForwardGate;
  maxReachableIndex: number;
  dedupNavigationBlocked: boolean;
}): GuidedStepSelectionResolution => {
  if (!args.enabled) return { action: 'none' };
  const nextStepId = (args.nextStepId || '').toString().trim();
  if (!nextStepId) return { action: 'none' };
  const nextIndex = args.stepIds.indexOf(nextStepId);
  const currentIndex = args.stepIds.indexOf(args.activeStepId);
  if (nextIndex < 0 || nextIndex === currentIndex) return { action: 'none' };

  if (nextIndex < currentIndex) {
    const currentConfig = args.stepsConfig?.items?.[Math.max(0, currentIndex)] as any;
    const allowBack = (currentConfig?.navigation?.allowBack ?? currentConfig?.allowBack) !== false;
    if (!allowBack) {
      return {
        action: 'blocked',
        diagnostic: {
          from: args.activeStepId,
          to: nextStepId,
          gate: 'allowBack',
          reason: 'allowBack=false'
        }
      };
    }
    return {
      action: 'select',
      nextStepId,
      resetAutoAdvance: true,
      backErrorSuppressionStepId: args.reason === 'user' ? nextStepId : null,
      diagnostic: {
        from: args.activeStepId,
        to: nextStepId,
        reason: args.reason
      }
    };
  }

  const effectiveMaxReachableIndex = args.forwardNavigationBlocked
    ? Math.min(args.maxReachableIndex, currentIndex)
    : args.maxReachableIndex;

  if (args.dedupNavigationBlocked) {
    return {
      action: 'blocked',
      clearBackErrorSuppression: true,
      diagnostic: {
        from: args.activeStepId,
        to: nextStepId,
        gate: 'dedup',
        reason: 'dedupGate'
      }
    };
  }

  if (nextIndex > effectiveMaxReachableIndex) {
    return {
      action: 'blocked',
      clearBackErrorSuppression: true,
      diagnostic: {
        from: args.activeStepId,
        to: nextStepId,
        gate: args.forwardNavigationBlocked ? 'systemActionGate' : args.defaultForwardGate,
        reason: args.forwardNavigationBlocked ? 'forwardNavigationBlocked' : 'notReachable',
        maxReachableIndex: effectiveMaxReachableIndex
      }
    };
  }

  return {
    action: 'select',
    nextStepId,
    clearBackErrorSuppression: true,
    diagnostic: {
      from: args.activeStepId,
      to: nextStepId,
      reason: args.reason
    }
  };
};

export type GuidedAutoAdvanceState = {
  stepId: string;
  lastSatisfied: boolean;
  armed: boolean;
};

export type GuidedAutoAdvanceTransition =
  | {
      action: 'reset';
      nextState: GuidedAutoAdvanceState | null;
      clearAttempt: true;
      clearTimer: true;
      diagnostic?: Record<string, unknown>;
    }
  | {
      action: 'waiting';
      nextState: GuidedAutoAdvanceState;
      clearAttempt: true;
      clearTimer: false;
      diagnostic?: Record<string, unknown>;
    }
  | {
      action: 'schedule';
      nextState: GuidedAutoAdvanceState;
      clearAttempt: false;
      clearTimer: true;
      diagnostic?: Record<string, unknown>;
    };

export const resolveGuidedAutoAdvanceTransitionAction = (args: {
  activeStepId: string;
  nextStepId?: string | null;
  currentState?: GuidedAutoAdvanceState | null;
  autoAdvance: GuidedAutoAdvanceMode;
  satisfied: boolean;
  nextReachable: boolean;
  forwardGate: GuidedForwardGate;
  conditionConfigured: boolean;
  conditionMatched: boolean;
}): GuidedAutoAdvanceTransition => {
  if (args.autoAdvance === 'off') {
    return {
      action: 'reset',
      nextState: null,
      clearAttempt: true,
      clearTimer: true
    };
  }

  if (!args.currentState || args.currentState.stepId !== args.activeStepId) {
    const nextState = { stepId: args.activeStepId, lastSatisfied: args.satisfied, armed: false };
    return {
      action: 'reset',
      nextState,
      clearAttempt: true,
      clearTimer: true,
      diagnostic: args.satisfied
        ? {
            from: args.activeStepId,
            to: args.nextStepId || null,
            gate: args.forwardGate,
            mode: args.autoAdvance,
            reason: 'stepChangeAlreadySatisfied',
            conditionConfigured: args.conditionConfigured,
            conditionMatched: args.conditionMatched
          }
        : undefined
    };
  }

  if (!args.satisfied) {
    return {
      action: 'reset',
      nextState: { stepId: args.activeStepId, lastSatisfied: false, armed: false },
      clearAttempt: true,
      clearTimer: true
    };
  }

  const shouldArm = !args.currentState.lastSatisfied && args.satisfied;
  const nextState = {
    stepId: args.activeStepId,
    lastSatisfied: args.satisfied,
    armed: args.currentState.armed || shouldArm
  };
  const diagnostic = shouldArm
    ? {
        from: args.activeStepId,
        to: args.nextStepId || null,
        gate: args.forwardGate,
        mode: args.autoAdvance,
        conditionConfigured: args.conditionConfigured,
        conditionMatched: args.conditionMatched
      }
    : undefined;

  if (!nextState.armed) {
    return {
      action: 'waiting',
      nextState,
      clearAttempt: true,
      clearTimer: false,
      diagnostic
    };
  }

  if (!args.nextReachable) {
    return {
      action: 'reset',
      nextState,
      clearAttempt: true,
      clearTimer: true,
      diagnostic
    };
  }

  return {
    action: 'schedule',
    nextState,
    clearAttempt: false,
    clearTimer: true,
    diagnostic
  };
};

export type GuidedAutoAdvanceFocusDeferral = {
  shouldDefer: boolean;
  tag: string | null;
  inputType: string | null;
};

const isGuidedAutoAdvanceTextEntryElement = (element: any): boolean => {
  if (!element) return false;
  const tag = (element.tagName || '').toString().toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = ((element as any).type || 'text').toString().toLowerCase();
    if (['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(type)) return false;
    return true;
  }
  return Boolean((element as any).isContentEditable);
};

export const resolveGuidedAutoAdvanceFocusDeferralAction = (args: {
  activeElement: any;
  stepBodyElement: any;
}): GuidedAutoAdvanceFocusDeferral => {
  const activeElement = args.activeElement;
  const tag = activeElement?.tagName ? activeElement.tagName.toString().toLowerCase() : null;
  const inputType = tag === 'input' ? (((activeElement as any).type || 'text').toString().toLowerCase() as any) : null;
  if (!activeElement || !args.stepBodyElement) {
    return { shouldDefer: false, tag, inputType };
  }
  const containsActiveElement =
    typeof args.stepBodyElement.contains === 'function' && args.stepBodyElement.contains(activeElement);
  return {
    shouldDefer: Boolean(containsActiveElement && isGuidedAutoAdvanceTextEntryElement(activeElement)),
    tag,
    inputType
  };
};

export type GuidedBackActionResolution =
  | { action: 'none' }
  | { action: 'blocked'; diagnostic: Record<string, unknown> }
  | { action: 'select'; previousStepId: string };

export const resolveGuidedBackAction = (args: {
  enabled: boolean;
  stepsConfig: any;
  stepIds: string[];
  visibleSteps: any[];
  activeStepId: string;
  activeStepIndex: number;
}): GuidedBackActionResolution => {
  if (!args.enabled || !args.stepsConfig || !args.stepIds.length) return { action: 'none' };
  if (args.activeStepIndex <= 0) return { action: 'none' };
  const stepConfig = args.visibleSteps[args.activeStepIndex] as any;
  const allowBack = (stepConfig?.navigation?.allowBack ?? stepConfig?.allowBack) !== false;
  const showBackGlobal = args.stepsConfig?.showBackButton !== false;
  const showBackStep = (stepConfig?.navigation?.showBackButton ?? stepConfig?.showBackButton) !== false;
  if (!allowBack || !showBackGlobal || !showBackStep) {
    return {
      action: 'blocked',
      diagnostic: {
        from: args.activeStepId,
        to: args.activeStepIndex - 1,
        gate: 'allowBack',
        reason: 'backAction'
      }
    };
  }
  const previousStepId = args.stepIds[args.activeStepIndex - 1];
  return previousStepId ? { action: 'select', previousStepId } : { action: 'none' };
};
