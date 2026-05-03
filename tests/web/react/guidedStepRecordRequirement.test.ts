import { guidedStepRequiresPersistedRecord } from '../../../src/web/react/features/steps/domain/guidedStepRecordRequirement';

describe('guidedStepRequiresPersistedRecord', () => {
  it('requires a persisted record before entering a non-first step', () => {
    expect(
      guidedStepRequiresPersistedRecord({
        currentStepIndex: 0,
        nextStepIndex: 1,
        currentRecordId: ''
      })
    ).toBe(true);
  });

  it('does not require a new record when one already exists', () => {
    expect(
      guidedStepRequiresPersistedRecord({
        currentStepIndex: 0,
        nextStepIndex: 1,
        currentRecordId: 'record-1'
      })
    ).toBe(false);
  });

  it('does not block backward or same-step navigation', () => {
    expect(
      guidedStepRequiresPersistedRecord({
        currentStepIndex: 1,
        nextStepIndex: 0,
        currentRecordId: ''
      })
    ).toBe(false);
    expect(
      guidedStepRequiresPersistedRecord({
        currentStepIndex: 1,
        nextStepIndex: 1,
        currentRecordId: ''
      })
    ).toBe(false);
  });
});
