import { shouldQueueBackgroundReservationSyncOnAdvance } from '../../../src/web/react/features/steps/domain/backgroundReservationSync';

describe('backgroundReservationSync', () => {
  it('queues the background reservation sync by default', () => {
    expect(shouldQueueBackgroundReservationSyncOnAdvance(undefined)).toBe(true);
    expect(shouldQueueBackgroundReservationSyncOnAdvance({} as any)).toBe(true);
  });

  it('allows a step to disable the generic advance-time reservation sync', () => {
    expect(
      shouldQueueBackgroundReservationSyncOnAdvance({
        backgroundReservationSyncOnAdvance: false
      } as any)
    ).toBe(false);
  });
});
