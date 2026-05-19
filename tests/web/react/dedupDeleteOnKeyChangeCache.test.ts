import { clearCachesAfterDedupDeleteOnKeyChange } from '../../../src/web/react/app/dedupDeleteOnKeyChangeCache';
import { invalidateClientSharedDataCaches } from '../../../src/web/react/api';
import { clearDateSearchLocalCacheFamily } from '../../../src/web/react/app/dateSearchLocalCache';
import { clearHomeListLocalCache } from '../../../src/web/react/app/homeListLocalCache';

jest.mock('../../../src/web/react/api', () => ({
  invalidateClientSharedDataCaches: jest.fn()
}));

jest.mock('../../../src/web/react/app/dateSearchLocalCache', () => ({
  clearDateSearchLocalCacheFamily: jest.fn()
}));

jest.mock('../../../src/web/react/app/homeListLocalCache', () => ({
  clearHomeListLocalCache: jest.fn()
}));

describe('dedup delete-on-key-change cache cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps persisted data-source caches and visible options while clearing record-local caches', () => {
    const logEvent = jest.fn();
    const definition: any = {
      listView: {
        dateFieldId: 'MP_PREP_DATE'
      }
    };

    clearCachesAfterDedupDeleteOnKeyChange({
      definition,
      formKey: 'Config: Meal Production',
      homeListLocalCacheKey: 'home-cache-key',
      recordId: 'record-1',
      logEvent
    });

    expect(invalidateClientSharedDataCaches).toHaveBeenCalledWith({
      includePersistedDataSources: false,
      includeHtmlRenderCache: true
    });
    expect(clearHomeListLocalCache).toHaveBeenCalledWith('home-cache-key');
    expect(clearDateSearchLocalCacheFamily).toHaveBeenCalledWith({
      formKey: 'Config: Meal Production',
      listView: definition.listView
    });
    expect(logEvent).toHaveBeenCalledWith(
      'cache.client.clear',
      expect.objectContaining({
        scope: 'dedupDeleteOnKeyChange',
        recordId: 'record-1',
        persistedDataSourcesCleared: false,
        optionsCleared: false
      })
    );
  });
});
