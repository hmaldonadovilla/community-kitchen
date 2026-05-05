import {
  isGuidedStepForwardGateSatisfied,
  normalizeGuidedAutoAdvance,
  normalizeGuidedForwardGate,
  resolveGuidedAutoAdvanceFocusDeferralAction,
  resolveGuidedAutoAdvanceTransitionAction,
  resolveGuidedStepAutoAdvance,
  resolveGuidedStepForwardGate,
  resolveGuidedStepSelectionAction,
  resolveGuidedStepsVirtualState,
  resolveMaxReachableGuidedStepIndex
} from '../../../src/web/react/features/steps/domain/guidedNavigation';

describe('guidedNavigation domain', () => {
  test('normalizes forward gate and auto-advance aliases', () => {
    expect(normalizeGuidedForwardGate('free', 'whenValid')).toBe('free');
    expect(normalizeGuidedForwardGate('whenComplete', 'whenValid')).toBe('whenComplete');
    expect(normalizeGuidedForwardGate('onValid', 'whenComplete')).toBe('whenValid');
    expect(normalizeGuidedForwardGate('bad-value', 'whenComplete')).toBe('whenComplete');

    expect(normalizeGuidedAutoAdvance('off', 'onValid')).toBe('off');
    expect(normalizeGuidedAutoAdvance('whenComplete', 'onValid')).toBe('onComplete');
    expect(normalizeGuidedAutoAdvance('onValid', 'off')).toBe('onValid');
    expect(normalizeGuidedAutoAdvance('bad-value', 'onComplete')).toBe('onComplete');
  });

  test('resolves step-level navigation settings before global defaults', () => {
    const step: any = {
      forwardGate: 'free',
      autoAdvance: 'off',
      navigation: {
        forwardGate: 'whenComplete',
        autoAdvance: 'onValid'
      }
    };

    expect(resolveGuidedStepForwardGate(step, 'whenValid')).toBe('whenComplete');
    expect(resolveGuidedStepAutoAdvance(step, 'onComplete', 'off')).toBe('onValid');
    expect(resolveGuidedStepForwardGate({}, 'whenValid')).toBe('whenValid');
    expect(resolveGuidedStepAutoAdvance({}, 'whenComplete', 'off')).toBe('onComplete');
  });

  test('computes the contiguous max reachable step from per-step gates', () => {
    const stepIds = ['order', 'production', 'email'];
    const visibleSteps: any[] = [
      { id: 'order', navigation: { forwardGate: 'free' } },
      { id: 'production', navigation: { forwardGate: 'whenComplete' } },
      { id: 'email' }
    ];

    expect(
      resolveMaxReachableGuidedStepIndex({
        enabled: true,
        hasStepsConfig: true,
        stepIds,
        visibleSteps,
        statuses: [
          { id: 'order', index: 0, complete: false, valid: false, missingRequiredCount: 1, missingValidCount: 1, errorCount: 0 },
          { id: 'production', index: 1, complete: false, valid: true, missingRequiredCount: 1, missingValidCount: 0, errorCount: 0 }
        ],
        defaultForwardGate: 'whenValid'
      })
    ).toBe(1);

    expect(
      resolveMaxReachableGuidedStepIndex({
        enabled: true,
        hasStepsConfig: true,
        stepIds,
        visibleSteps,
        statuses: [
          { id: 'order', index: 0, complete: false, valid: false, missingRequiredCount: 1, missingValidCount: 1, errorCount: 0 },
          { id: 'production', index: 1, complete: true, valid: true, missingRequiredCount: 0, missingValidCount: 0, errorCount: 0 }
        ],
        defaultForwardGate: 'whenValid'
      })
    ).toBe(2);
  });

  test('resolves gate satisfaction and guided virtual state', () => {
    const status: any = { id: 'order', index: 0, complete: true, valid: true, missingRequiredCount: 0, missingValidCount: 0, errorCount: 0 };

    expect(isGuidedStepForwardGateSatisfied({ gate: 'whenComplete', status })).toBe(true);
    expect(isGuidedStepForwardGateSatisfied({ gate: 'whenComplete', status, navigationBlocked: true })).toBe(false);
    expect(isGuidedStepForwardGateSatisfied({ gate: 'whenValid', status: { ...status, valid: false } })).toBe(false);

    expect(
      resolveGuidedStepsVirtualState({
        enabled: true,
        prefix: '__step',
        activeStepId: 'production',
        stepIds: ['order', 'production'],
        status: { steps: [status], maxCompleteIndex: 0, maxValidIndex: 0 }
      })
    ).toEqual({
      prefix: '__step',
      activeStepId: 'production',
      activeStepIndex: 1,
      maxCompleteIndex: 0,
      maxValidIndex: 0,
      steps: [status]
    });
  });

  test('resolves guided step selection decisions and blocked diagnostics', () => {
    expect(
      resolveGuidedStepSelectionAction({
        enabled: true,
        nextStepId: 'intro',
        activeStepId: 'production',
        stepIds: ['intro', 'production', 'email'],
        stepsConfig: {
          items: [
            { id: 'intro' },
            { id: 'production', navigation: { allowBack: false } }
          ]
        },
        reason: 'user',
        forwardNavigationBlocked: false,
        defaultForwardGate: 'whenValid',
        maxReachableIndex: 2,
        dedupNavigationBlocked: false
      })
    ).toEqual({
      action: 'blocked',
      diagnostic: {
        from: 'production',
        to: 'intro',
        gate: 'allowBack',
        reason: 'allowBack=false'
      }
    });

    expect(
      resolveGuidedStepSelectionAction({
        enabled: true,
        nextStepId: 'intro',
        activeStepId: 'production',
        stepIds: ['intro', 'production', 'email'],
        stepsConfig: { items: [{ id: 'intro' }, { id: 'production' }] },
        reason: 'user',
        forwardNavigationBlocked: false,
        defaultForwardGate: 'whenValid',
        maxReachableIndex: 2,
        dedupNavigationBlocked: false
      })
    ).toEqual({
      action: 'select',
      nextStepId: 'intro',
      resetAutoAdvance: true,
      backErrorSuppressionStepId: 'intro',
      diagnostic: {
        from: 'production',
        to: 'intro',
        reason: 'user'
      }
    });

    expect(
      resolveGuidedStepSelectionAction({
        enabled: true,
        nextStepId: 'email',
        activeStepId: 'intro',
        stepIds: ['intro', 'production', 'email'],
        stepsConfig: {},
        reason: 'user',
        forwardNavigationBlocked: false,
        defaultForwardGate: 'whenValid',
        maxReachableIndex: 1,
        dedupNavigationBlocked: false
      })
    ).toEqual({
      action: 'blocked',
      clearBackErrorSuppression: true,
      diagnostic: {
        from: 'intro',
        to: 'email',
        gate: 'whenValid',
        reason: 'notReachable',
        maxReachableIndex: 1
      }
    });

    expect(
      resolveGuidedStepSelectionAction({
        enabled: true,
        nextStepId: 'production',
        activeStepId: 'intro',
        stepIds: ['intro', 'production', 'email'],
        stepsConfig: {},
        reason: 'auto',
        forwardNavigationBlocked: false,
        defaultForwardGate: 'whenValid',
        maxReachableIndex: 1,
        dedupNavigationBlocked: false
      })
    ).toEqual({
      action: 'select',
      nextStepId: 'production',
      clearBackErrorSuppression: true,
      diagnostic: {
        from: 'intro',
        to: 'production',
        reason: 'auto'
      }
    });
  });

  test('resolves guided auto-advance state transitions', () => {
    expect(
      resolveGuidedAutoAdvanceTransitionAction({
        activeStepId: 'production',
        nextStepId: 'email',
        currentState: { stepId: 'production', lastSatisfied: false, armed: false },
        autoAdvance: 'off',
        satisfied: true,
        nextReachable: true,
        forwardGate: 'whenValid',
        conditionConfigured: false,
        conditionMatched: true
      })
    ).toEqual({
      action: 'reset',
      nextState: null,
      clearAttempt: true,
      clearTimer: true
    });

    expect(
      resolveGuidedAutoAdvanceTransitionAction({
        activeStepId: 'production',
        nextStepId: 'email',
        currentState: null,
        autoAdvance: 'onValid',
        satisfied: true,
        nextReachable: true,
        forwardGate: 'whenValid',
        conditionConfigured: true,
        conditionMatched: true
      })
    ).toEqual({
      action: 'reset',
      nextState: { stepId: 'production', lastSatisfied: true, armed: false },
      clearAttempt: true,
      clearTimer: true,
      diagnostic: {
        from: 'production',
        to: 'email',
        gate: 'whenValid',
        mode: 'onValid',
        reason: 'stepChangeAlreadySatisfied',
        conditionConfigured: true,
        conditionMatched: true
      }
    });

    expect(
      resolveGuidedAutoAdvanceTransitionAction({
        activeStepId: 'production',
        nextStepId: 'email',
        currentState: { stepId: 'production', lastSatisfied: false, armed: false },
        autoAdvance: 'onComplete',
        satisfied: true,
        nextReachable: true,
        forwardGate: 'whenComplete',
        conditionConfigured: false,
        conditionMatched: true
      })
    ).toEqual({
      action: 'schedule',
      nextState: { stepId: 'production', lastSatisfied: true, armed: true },
      clearAttempt: false,
      clearTimer: true,
      diagnostic: {
        from: 'production',
        to: 'email',
        gate: 'whenComplete',
        mode: 'onComplete',
        conditionConfigured: false,
        conditionMatched: true
      }
    });

    expect(
      resolveGuidedAutoAdvanceTransitionAction({
        activeStepId: 'production',
        nextStepId: 'email',
        currentState: { stepId: 'production', lastSatisfied: false, armed: false },
        autoAdvance: 'onValid',
        satisfied: true,
        nextReachable: false,
        forwardGate: 'whenValid',
        conditionConfigured: false,
        conditionMatched: true
      })
    ).toMatchObject({
      action: 'reset',
      nextState: { stepId: 'production', lastSatisfied: true, armed: true },
      clearAttempt: true,
      clearTimer: true
    });
  });

  test('detects guided auto-advance focus deferral for text-entry elements inside the step body', () => {
    const input = { tagName: 'INPUT', type: 'text' };
    const checkbox = { tagName: 'INPUT', type: 'checkbox' };
    const textarea = { tagName: 'TEXTAREA' };
    const editor = { tagName: 'DIV', isContentEditable: true };
    const body = { contains: (element: any) => element !== checkbox };

    expect(resolveGuidedAutoAdvanceFocusDeferralAction({ activeElement: input, stepBodyElement: body })).toEqual({
      shouldDefer: true,
      tag: 'input',
      inputType: 'text'
    });
    expect(resolveGuidedAutoAdvanceFocusDeferralAction({ activeElement: textarea, stepBodyElement: body })).toEqual({
      shouldDefer: true,
      tag: 'textarea',
      inputType: null
    });
    expect(resolveGuidedAutoAdvanceFocusDeferralAction({ activeElement: editor, stepBodyElement: body })).toEqual({
      shouldDefer: true,
      tag: 'div',
      inputType: null
    });
    expect(resolveGuidedAutoAdvanceFocusDeferralAction({ activeElement: checkbox, stepBodyElement: body })).toEqual({
      shouldDefer: false,
      tag: 'input',
      inputType: 'checkbox'
    });
  });
});
