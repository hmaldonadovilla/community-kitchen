import { filterFormOpenPrefetchDataSources } from '../../../src/web/react/app/dataSourcePrefetchPolicy';

describe('data source prefetch policy', () => {
  it('keeps freshness-watched data sources out of form-open background prefetch', () => {
    const configs = [
      { id: 'Leftover Inventory Data' },
      { id: 'Recipes Data' },
      { id: 'Customers Data' }
    ];

    expect(
      filterFormOpenPrefetchDataSources({
        configs,
        freshnessWatches: [{ dataSourceIds: ['leftover-inventory-data'] }]
      })
    ).toEqual([{ id: 'Recipes Data' }, { id: 'Customers Data' }]);
  });

  it('does not filter when no freshness watch owns the source', () => {
    const configs = [{ id: 'Recipes Data' }, { id: 'Customers Data' }];

    expect(
      filterFormOpenPrefetchDataSources({
        configs,
        freshnessWatches: []
      })
    ).toEqual(configs);
  });
});
