import { isGuidedStepBarAccessAllowed } from '../../../src/web/react/features/steps/domain/stepAccess';

describe('isGuidedStepBarAccessAllowed', () => {
  it('allows direct access when no gate is configured', () => {
    expect(
      isGuidedStepBarAccessAllowed(
        {
          id: 'leftovers',
          include: []
        } as any,
        { getValue: () => undefined }
      )
    ).toBe(true);
  });

  it('blocks direct access when the step-bar gate does not match', () => {
    expect(
      isGuidedStepBarAccessAllowed(
        {
          id: 'leftovers',
          include: [],
          navigation: {
            stepBarAccessWhen: {
              fieldId: 'status',
              equals: ['Final report emailed', 'Closed']
            }
          }
        } as any,
        { getValue: () => 'In progress' }
      )
    ).toBe(false);
  });

  it('allows direct access when the step-bar gate matches', () => {
    expect(
      isGuidedStepBarAccessAllowed(
        {
          id: 'leftovers',
          include: [],
          navigation: {
            stepBarAccessWhen: {
              fieldId: 'status',
              equals: ['Final report emailed', 'Closed']
            }
          }
        } as any,
        { getValue: () => 'Final report emailed' }
      )
    ).toBe(true);
  });
});
