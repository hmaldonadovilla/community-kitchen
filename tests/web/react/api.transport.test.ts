import {
  configureBackendTransport,
  consumePrefetchedHomeBootstrapApi,
  fetchBootstrapContextApi,
  type BackendTransport
} from '../../../src/web/react/api';

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
});
