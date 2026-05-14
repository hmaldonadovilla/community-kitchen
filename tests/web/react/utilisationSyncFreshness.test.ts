import {
  shouldRefreshDataSourcesAfterUtilisationPlan,
  shouldUseUtilisationSyncFreshnessForDataSource
} from '../../../src/web/react/features/utilisations/domain/utilisationSyncFreshness';

describe('shouldUseUtilisationSyncFreshnessForDataSource', () => {
  const freshness = {
    recordId: 'REC-1',
    stepId: 'leftoverForm',
    dataSourceIds: ['Leftover Bank Data'],
    updatedRows: 1,
    availabilityCount: 1,
    completedAtMs: 1000,
    source: 'guidedStep.liveSync'
  };

  it('allows a forced bootstrap fetch to use cache after a matching utilisation sync patch', () => {
    expect(
      shouldUseUtilisationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Bank Data' },
        cachedDataSource: { items: [{ id: 'leftover-1' }] }
      })
    ).toBe(true);
  });

  it('requires a matching record, datasource, cache, and applied availability rows', () => {
    expect(
      shouldUseUtilisationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-2',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Bank Data' },
        cachedDataSource: { items: [{ id: 'leftover-1' }] }
      })
    ).toBe(false);

    expect(
      shouldUseUtilisationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Ingredients Data' },
        cachedDataSource: { items: [{ id: 'ingredient-1' }] }
      })
    ).toBe(false);

    expect(
      shouldUseUtilisationSyncFreshnessForDataSource({
        freshness,
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Bank Data' },
        cachedDataSource: null
      })
    ).toBe(false);

    expect(
      shouldUseUtilisationSyncFreshnessForDataSource({
        freshness: { ...freshness, updatedRows: 0 },
        recordId: 'REC-1',
        stepId: 'leftoverForm',
        dataSource: { id: 'Leftover Bank Data' },
        cachedDataSource: { items: [{ id: 'leftover-1' }] }
      })
    ).toBe(false);
  });
});

describe('shouldRefreshDataSourcesAfterUtilisationPlan', () => {
  it('skips refresh when the utilisation availability response already patched cached rows', () => {
    expect(
      shouldRefreshDataSourcesAfterUtilisationPlan({
        availabilityCount: 3,
        updatedRows: 3,
        utilisationsReleased: 1
      })
    ).toBe(false);
  });

  it('refreshes when availability was returned but no cached row could be patched', () => {
    expect(
      shouldRefreshDataSourcesAfterUtilisationPlan({
        availabilityCount: 2,
        updatedRows: 0,
        utilisationsReleased: 0
      })
    ).toBe(true);
  });

  it('keeps a defensive refresh for release responses that do not include availability', () => {
    expect(
      shouldRefreshDataSourcesAfterUtilisationPlan({
        availabilityCount: 0,
        updatedRows: 0,
        utilisationsReleased: 1
      })
    ).toBe(true);
  });
});
