import {
  CONFIGURED_DIALOG_ACTION_FORM_SUBMIT,
  resolveConfiguredDialogGuidedStepMilestone
} from '../../../src/web/react/features/steps/domain/configuredDialogActions';

describe('configuredDialogActions', () => {
  test('resolves a guided step milestone action from a target step id', () => {
    const milestoneAction = {
      type: 'followupBatch',
      preActions: ['CLOSE_RECORD']
    };

    expect(
      resolveConfiguredDialogGuidedStepMilestone({
        definition: {
          steps: {
            items: [
              {
                id: 'leftovers',
                navigation: {
                  milestoneAction
                }
              }
            ]
          }
        } as any,
        action: {
          type: 'guidedStepMilestone',
          id: 'complete',
          stepId: 'leftovers'
        }
      })
    ).toEqual({
      ok: true,
      actionType: 'guidedStepMilestone',
      actionId: 'complete',
      stepId: 'leftovers',
      milestoneAction
    });
  });

  test('reports missing target milestones without throwing', () => {
    expect(
      resolveConfiguredDialogGuidedStepMilestone({
        definition: {
          steps: {
            items: [{ id: 'leftovers' }]
          }
        } as any,
        action: {
          type: 'guidedStepMilestone',
          stepId: 'leftovers'
        }
      })
    ).toEqual({
      ok: false,
      reason: 'missingMilestone',
      actionType: 'guidedStepMilestone',
      actionId: '',
      stepId: 'leftovers'
    });
  });

  test('reports unsupported configured dialog actions', () => {
    expect(
      resolveConfiguredDialogGuidedStepMilestone({
        definition: {} as any,
        action: {
          type: 'unsupported' as any,
          id: 'noop'
        }
      })
    ).toEqual({
      ok: false,
      reason: 'unsupportedAction',
      actionType: 'unsupported',
      actionId: 'noop',
      stepId: ''
    });
  });

  test('exposes the form submit configured dialog action type', () => {
    expect(CONFIGURED_DIALOG_ACTION_FORM_SUBMIT).toBe('formSubmit');
  });
});
