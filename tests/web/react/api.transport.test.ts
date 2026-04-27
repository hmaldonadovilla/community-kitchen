import {
  applyInventoryReservationPlanApi,
  configureBackendTransport,
  consumePrefetchedHomeBootstrapApi,
  fetchBootstrapContextApi,
  invalidateClientSharedDataCaches,
  peekSummaryHtmlTemplateCache,
  resolveUserFacingErrorMessage,
  seedSummaryHtmlTemplateCache,
  upsertInventoryReservationApi,
  reconcileInventoryReservationsApi,
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

  test('maps Drive storage internals to the caller fallback message', () => {
    expect(
      resolveUserFacingErrorMessage(
        new Error(
          'Upload folder not accessible (id=abc). Service error: Drive. If this is a shared drive, ensure the script executes as a user who is a member of that drive.'
        ),
        'Could not add photos.'
      )
    ).toBe('Could not add photos.');

    expect(
      resolveUserFacingErrorMessage(
        new Error('Drive createFile failed (folderId=abc, name=photo.jpg, sizeMb=1). Service error: Drive.'),
        'Failed to render preview.'
      )
    ).toBe('Failed to render preview.');
  });

  test('routes inventory reservation upsert through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      resourceFormKey: 'Config: Leftover Inventory',
      resourceRecordId: 'leftover-1',
      quantity: 3,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'meal-1'
    };

    await upsertInventoryReservationApi(payload);

    expect(invoke).toHaveBeenCalledWith('upsertInventoryReservation', payload);
  });

  test('routes inventory reservation reconciliation through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'meal-1'
    };

    await reconcileInventoryReservationsApi(payload);

    expect(invoke).toHaveBeenCalledWith('reconcileInventoryReservations', payload);
  });

  test('routes inventory reservation plan apply through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'meal-1',
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: []
    };

    await applyInventoryReservationPlanApi(payload);

    expect(invoke).toHaveBeenCalledWith('applyInventoryReservationPlan', payload);
  });
});
