import {
  buildFormDataSourceRefreshKey,
  filterFormOpenPrefetchDataSources,
  normalizeDataSourcePrefetchRetryDelays
} from '../../../src/web/react/app/dataSourcePrefetchPolicy';

describe('data source prefetch policy', () => {
  it('keeps freshness-watched data sources out of form-open background prefetch', () => {
    const configs = [
      { id: 'Leftover Bank Data' },
      { id: 'Recipes Data' },
      { id: 'Customers Data' }
    ];

    expect(
      filterFormOpenPrefetchDataSources({
        configs,
        freshnessWatches: [{ dataSourceIds: ['leftover-bank-data'] }]
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

  it('normalizes retry delays with stable order and a default immediate attempt', () => {
    expect(normalizeDataSourcePrefetchRetryDelays([3500, '1200', 0, 1200, -1, 'bad'])).toEqual([
      3500,
      1200,
      0
    ]);
    expect(normalizeDataSourcePrefetchRetryDelays([])).toEqual([0]);
    expect(normalizeDataSourcePrefetchRetryDelays(undefined)).toEqual([0]);
  });

  it('builds a stable form-open data-source refresh key', () => {
    expect(
      buildFormDataSourceRefreshKey({
        formKey: 'Config: Meal Production',
        language: 'EN',
        selectedRecordId: 'record-1',
        view: 'form'
      })
    ).toBe('Config: Meal Production::EN::record-1::form');

    expect(
      buildFormDataSourceRefreshKey({
        formKey: 'Config: Meal Production',
        language: 'EN',
        selectedRecordId: '',
        view: 'form'
      })
    ).toBe('Config: Meal Production::EN::create::form');
  });
});
