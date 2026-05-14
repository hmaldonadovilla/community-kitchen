import { shouldQueueBackgroundUtilisationSyncOnAdvance } from '../../../src/web/react/features/steps/domain/backgroundUtilisationSync';

describe('backgroundUtilisationSync', () => {
  it('queues the background utilisation sync by default', () => {
    expect(shouldQueueBackgroundUtilisationSyncOnAdvance(undefined)).toBe(true);
    expect(shouldQueueBackgroundUtilisationSyncOnAdvance({} as any)).toBe(true);
  });

  it('allows a step to disable the generic advance-time utilisation sync', () => {
    expect(
      shouldQueueBackgroundUtilisationSyncOnAdvance({
        backgroundUtilisationSyncOnAdvance: false
      } as any)
    ).toBe(false);
  });
});
