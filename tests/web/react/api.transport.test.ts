import {
  configureBackendTransport,
  consumePrefetchedHomeBootstrapApi,
  fetchBootstrapContextApi,
  invalidateClientSharedDataCaches,
  peekSummaryHtmlTemplateCache,
  seedSummaryHtmlTemplateCache,
  type BackendTransport
} from '../../../src/web/react/api';
import { clearFetchDataSourceCache } from '../../../src/web/data/dataSources';

jest.mock('../../../src/web/data/dataSources', () => ({
  clearFetchDataSourceCache: jest.fn()
}));

describe('react api transport', () => {
  afterEach(() => {
    configureBackendTransport();
    delete (globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__;
  });

  test('uses default bootstrap endpoint when no options are requested', async () => {
    const invoke = jest.fn().mockResolvedValue({ definition: {}, formKey: 'Config: Delivery' });
    const transport: BackendTransport = { invoke };
    configureBackendTransport(transport);

    await fetchBootstrapContextApi('Config: Delivery');

    expect(invoke).toHaveBeenCalledWith('fetchBootstrapContext', 'Config: Delivery');
  });

  test('uses bootstrap-with-options endpoint when analytics are requested', async () => {
    const invoke = jest.fn().mockResolvedValue({ definition: {}, formKey: 'Config: Delivery', analytics: { items: [] } });
    const transport: BackendTransport = { invoke };
    configureBackendTransport(transport);

    await fetchBootstrapContextApi('Config: Delivery', { includeAnalytics: true });

    expect(invoke).toHaveBeenCalledWith('fetchBootstrapContextWithOptions', 'Config: Delivery', { includeAnalytics: true });
  });

  test('consumes the early prefetched home bootstrap promise once for the matching form key', async () => {
    const prefetched = Promise.resolve({ rev: 7, notModified: false, listResponse: { items: [] } });
    (globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__ = {
      formKey: 'Config: Delivery',
      used: false,
      promise: prefetched
    };

    const first = consumePrefetchedHomeBootstrapApi('Config: Delivery');
    const second = consumePrefetchedHomeBootstrapApi('Config: Delivery');

    await expect(first).resolves.toMatchObject({ rev: 7, notModified: false });
    expect(second).toBeNull();
    expect((globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__.used).toBe(true);
  });

  test('invalidates shared data caches and optionally clears html render cache', () => {
    const payload: any = {
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'R-1',
      values: { NAME: 'Soup' }
    };
    seedSummaryHtmlTemplateCache(payload, { success: true, html: '<div>cached</div>' });

    expect(peekSummaryHtmlTemplateCache(payload)?.html).toBe('<div>cached</div>');

    invalidateClientSharedDataCaches({ includePersistedDataSources: true, includeHtmlRenderCache: true });

    expect(clearFetchDataSourceCache).toHaveBeenCalledWith({ includePersisted: true });
    expect(peekSummaryHtmlTemplateCache(payload)).toBeNull();
  });
});
