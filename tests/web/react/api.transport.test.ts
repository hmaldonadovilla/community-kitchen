import { configureBackendTransport, fetchBootstrapContextApi, type BackendTransport } from '../../../src/web/react/api';

describe('react api transport', () => {
  afterEach(() => {
    configureBackendTransport();
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
});
