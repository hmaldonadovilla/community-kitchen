import { shouldApplyGuidedExternalSyncSignal } from '../../../src/web/react/features/steps/domain/guidedExternalSyncSignal';

describe('guided external sync signal', () => {
  const signal = {
    token: 7,
    recordId: 'record-a',
    recordSessionId: 42,
    reason: 'versionCheck.stale'
  };

  it('applies a fresh signal scoped to the current record session', () => {
    expect(
      shouldApplyGuidedExternalSyncSignal({
        signal,
        handledToken: 6,
        currentRecordId: 'record-a',
        currentRecordSessionId: 42
      })
    ).toBe(true);
  });

  it('ignores an already handled token', () => {
    expect(
      shouldApplyGuidedExternalSyncSignal({
        signal,
        handledToken: 7,
        currentRecordId: 'record-a',
        currentRecordSessionId: 42
      })
    ).toBe(false);
  });

  it('ignores a stale signal from a previous record', () => {
    expect(
      shouldApplyGuidedExternalSyncSignal({
        signal,
        handledToken: 0,
        currentRecordId: 'record-b',
        currentRecordSessionId: 42
      })
    ).toBe(false);
  });

  it('ignores a stale signal from a previous record session', () => {
    expect(
      shouldApplyGuidedExternalSyncSignal({
        signal,
        handledToken: 0,
        currentRecordId: 'record-a',
        currentRecordSessionId: 43
      })
    ).toBe(false);
  });
});
