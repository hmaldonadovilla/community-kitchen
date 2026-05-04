import {
  isGuidedStepForwardGateSatisfied,
  normalizeGuidedAutoAdvance,
  normalizeGuidedForwardGate,
  resolveGuidedStepAutoAdvance,
  resolveGuidedStepForwardGate,
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
});
