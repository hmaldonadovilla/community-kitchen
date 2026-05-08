import {
  shouldRefreshDataSourcesAfterReservationPlan,
  shouldUseReservationSyncFreshnessForDataSource
} from '../../../src/web/react/features/reservations/domain/reservationSyncFreshness';

describe('shouldUseReservationSyncFreshnessForDataSource', () => {
  const freshness = {
    recordId: 'REC-1',
    stepId: 'leftoverForm',
    dataSourceIds: ['Leftover Inventory Data'],
    updatedRows: 1,
    availabilityCount: 1,
    completedAtMs: 1000,
    source: 'guidedStep.liveSync'
  };

  it('allows a forced bootstrap fetch to use cache after a matching reservation sync patch', () => {
    expect(
      shouldUseReservationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Inventory Data' },
        cachedDataSource: { items: [{ id: 'leftover-1' }] }
      })
    ).toBe(true);
  });

  it('requires a matching record, datasource, cache, and applied availability rows', () => {
    expect(
      shouldUseReservationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-2',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Inventory Data' },
        cachedDataSource: { items: [{ id: 'leftover-1' }] }
      })
    ).toBe(false);

    expect(
      shouldUseReservationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Ingredients Data' },
        cachedDataSource: { items: [{ id: 'ingredient-1' }] }
      })
    ).toBe(false);

    expect(
      shouldUseReservationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Inventory Data' },
        cachedDataSource: null
      })
    ).toBe(false);

    expect(
      shouldUseReservationSyncFreshnessForDataSource({
        freshness: { ...freshness, updatedRows: 0 },
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Inventory Data' },
        cachedDataSource: { items: [{ id: 'leftover-1' }] }
      })
    ).toBe(false);
  });
});

describe('shouldRefreshDataSourcesAfterReservationPlan', () => {
  it('skips refresh when the reservation availability response already patched cached rows', () => {
    expect(
      shouldRefreshDataSourcesAfterReservationPlan({
        availabilityCount: 3,
        updatedRows: 3,
        reservationsReleased: 1
      })
    ).toBe(false);
  });

  it('refreshes when availability was returned but no cached row could be patched', () => {
    expect(
      shouldRefreshDataSourcesAfterReservationPlan({
        availabilityCount: 2,
        updatedRows: 0,
        reservationsReleased: 0
      })
    ).toBe(true);
  });

  it('keeps a defensive refresh for release responses that do not include availability', () => {
    expect(
      shouldRefreshDataSourcesAfterReservationPlan({
        availabilityCount: 0,
        updatedRows: 0,
        reservationsReleased: 1
      })
    ).toBe(true);
  });
});
