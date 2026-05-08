import { shouldSkipReservationDraftSyncForDeleteOnKeyChange } from '../../../src/web/react/features/reservations/domain/reservationDraftSyncGuards';

describe('reservationDraftSyncGuards', () => {
  test('skips release-scope draft sync while delete-on-key-change owns the mutation', () => {
    expect(
      shouldSkipReservationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 1,
        dedupDeleteOnKeyChangeInFlight: true
      })
    ).toBe(true);
    expect(
      shouldSkipReservationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 1,
        dedupDeletePending: true
      })
    ).toBe(true);
  });

  test('allows normal reservation draft sync when there is no delete-on-key-change owner', () => {
    expect(
      shouldSkipReservationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 1,
        dedupDeleteOnKeyChangeInFlight: false,
        dedupDeletePending: false
      })
    ).toBe(false);
    expect(
      shouldSkipReservationDraftSyncForDeleteOnKeyChange({
        releaseScopeCount: 0,
        dedupDeletePending: true
      })
    ).toBe(false);
  });
});
