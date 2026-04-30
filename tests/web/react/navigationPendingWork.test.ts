import { shouldWaitBeforeLeavingRecord } from '../../../src/web/react/app/navigationPendingWork';

describe('navigationPendingWork', () => {
  test('waits before leaving while guided reservation live sync is running', () => {
    expect(
      shouldWaitBeforeLeavingRecord({
        guidedStepLiveSyncInFlight: true
      })
    ).toBe(true);
  });

  test('waits before leaving while a guided reservation sync has been queued', () => {
    expect(
      shouldWaitBeforeLeavingRecord({
        guidedStepLiveSyncPending: true
      })
    ).toBe(true);
  });

  test('waits before leaving while autosave or draft save work is pending', () => {
    expect(
      shouldWaitBeforeLeavingRecord({
        autoSaveQueued: true
      })
    ).toBe(true);

    expect(
      shouldWaitBeforeLeavingRecord({
        draftSaveInFlight: true
      })
    ).toBe(true);
  });

  test('does not wait when there is no pending persistence work', () => {
    expect(shouldWaitBeforeLeavingRecord({})).toBe(false);
  });
});
