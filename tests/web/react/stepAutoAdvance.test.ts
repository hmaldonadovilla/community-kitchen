import { isGuidedStepAutoAdvanceAllowed } from '../../../src/web/react/app/stepAutoAdvance';

describe('stepAutoAdvance', () => {
  it('allows auto-advance when no condition is configured', () => {
    expect(
      isGuidedStepAutoAdvanceAllowed({
        when: null,
        values: {},
        lineItems: {} as any,
        recordMeta: null,
        guidedVirtualState: null
      })
    ).toBe(true);
  });

  it('matches status-based auto-advance conditions against record metadata', () => {
    expect(
      isGuidedStepAutoAdvanceAllowed({
        when: { fieldId: 'status', equals: 'In production' } as any,
        values: {},
        lineItems: {} as any,
        recordMeta: { status: 'In production' } as any,
        guidedVirtualState: null
      })
    ).toBe(true);

    expect(
      isGuidedStepAutoAdvanceAllowed({
        when: { fieldId: 'status', equals: 'In production' } as any,
        values: {},
        lineItems: {} as any,
        recordMeta: { status: 'In progress' } as any,
        guidedVirtualState: null
      })
    ).toBe(false);
  });

  it('can combine guided virtual fields with record metadata', () => {
    expect(
      isGuidedStepAutoAdvanceAllowed({
        when: {
          all: [
            { fieldId: '__ckStep', equals: 'orderInfo' },
            { fieldId: 'status', equals: 'In production' }
          ]
        } as any,
        values: {},
        lineItems: {} as any,
        recordMeta: { status: 'In production' } as any,
        guidedVirtualState: {
          prefix: '__ckStep',
          activeStepId: 'orderInfo',
          activeStepIndex: 0,
          maxValidIndex: 0,
          maxCompleteIndex: 0,
          steps: []
        } as any
      })
    ).toBe(true);
  });
});
