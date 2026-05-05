import { resolveGuidedUiStateAction } from '../../../src/web/react/features/steps/domain/guidedUiState';

describe('guided UI state helper', () => {
  test('returns null outside guided mode', () => {
    expect(
      resolveGuidedUiStateAction({
        enabled: false,
        stepsConfig: {},
        stepIds: ['step1'],
        visibleSteps: [{ id: 'step1' }],
        activeStepId: 'step1',
        activeStepIndex: 0,
        statuses: [],
        defaultForwardGate: 'whenValid',
        language: 'EN'
      })
    ).toBeNull();
  });

  test('resolves guided UI state, labels, and back visibility', () => {
    expect(
      resolveGuidedUiStateAction({
        enabled: true,
        stepsConfig: {
          showBackButton: true,
          backButtonLabel: { en: 'Previous' },
          stepSubmitLabel: { en: 'Continue' }
        },
        stepIds: ['step1', 'step2', 'step3'],
        visibleSteps: [
          { id: 'step1' },
          {
            id: 'step2',
            navigation: {
              forwardGate: 'whenComplete',
              backLabel: { en: 'Back to step one' },
              submitLabel: { en: 'Next section' }
            }
          },
          { id: 'step3' }
        ],
        activeStepId: 'step2',
        activeStepIndex: 1,
        statuses: [
          {
            id: 'step2',
            index: 1,
            complete: true,
            valid: true,
            missingRequiredCount: 0,
            missingValidCount: 0,
            errorCount: 0
          }
        ],
        defaultForwardGate: 'whenValid',
        dedupNavigationBlocked: false,
        language: 'EN'
      })
    ).toEqual({
      activeStepId: 'step2',
      activeStepIndex: 1,
      stepCount: 3,
      isFirst: false,
      isFinal: false,
      forwardGateSatisfied: true,
      backAllowed: true,
      backVisible: true,
      backLabel: 'Back to step one',
      stepSubmitLabel: 'Next section'
    });
  });

  test('hides back and submit labels when configured or final', () => {
    expect(
      resolveGuidedUiStateAction({
        enabled: true,
        stepsConfig: {
          showBackButton: false
        },
        stepIds: ['step1', 'step2'],
        visibleSteps: [
          { id: 'step1' },
          {
            id: 'step2',
            navigation: { allowBack: true }
          }
        ],
        activeStepId: 'step2',
        activeStepIndex: 1,
        statuses: [],
        defaultForwardGate: 'whenValid',
        language: 'EN'
      })
    ).toMatchObject({
      isFinal: true,
      backAllowed: true,
      backVisible: false,
      stepSubmitLabel: undefined
    });
  });
});
