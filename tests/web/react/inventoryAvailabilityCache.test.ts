import { applyInventoryAvailabilitySnapshotsToCachedDataSources } from '../../../src/web/react/features/reservations/availabilityCache';
import { clearFetchDataSourceCache, fetchDataSource, peekCachedDataSource } from '../../../src/web/data/dataSources';

describe('inventory availability cache sync', () => {
  beforeEach(() => {
    clearFetchDataSourceCache({ includePersisted: false });
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler(cb: (res: any) => void) {
            return {
              withFailureHandler() {
                return {
                  fetchDataSource(config: any) {
                    cb({
                      items: [
                        {
                          id: 'leftover::1',
                          LEFTOVER_ID: 'LP-21',
                          LEFTOVER_QTY: 0,
                          LEFTOVER_RESERVED_QTY: 1,
                          LEFTOVER_STATUS: 'reserved',
                          LEFTOVER_UNIT: 'gr'
                        }
                      ],
                      totalCount: 1
                    });
                    void config;
                  }
                };
              }
            };
          }
        }
      }
    };
  });

  afterEach(() => {
    clearFetchDataSourceCache({ includePersisted: false });
    delete (globalThis as any).google;
  });

  test('patches cached datasource rows from reservation availability responses', async () => {
    const dataSource = {
      id: 'Leftover Inventory Data',
      formKey: 'Config: Leftover Inventory',
      sheetId: 'sheet-1',
      mode: 'options',
      rowKeyFieldId: 'LEFTOVER_ID'
    } as any;

    await fetchDataSource(dataSource, 'EN');

    const result = applyInventoryAvailabilitySnapshotsToCachedDataSources({
      dataSourceConfigs: [dataSource],
      language: 'EN',
      availability: [
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'leftover::1',
          resourceItemId: 'LP-21',
          quantityFieldId: 'LEFTOVER_QTY',
          reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
          statusFieldId: 'LEFTOVER_STATUS',
          unitFieldId: 'LEFTOVER_UNIT',
          remainingQuantity: 500,
          reservedQuantity: 0,
          freeQuantity: 500,
          currentReservationQuantity: 0,
          currentRecordReservedQuantity: 4,
          unit: 'gr',
          status: 'available'
        }
      ]
    });

    const cached = peekCachedDataSource(dataSource, 'EN') as any;

    expect(result).toEqual({
      updatedDataSourceIds: ['Leftover Inventory Data'],
      updatedRows: 1
    });
    expect(cached.items[0]).toEqual(
      expect.objectContaining({
        LEFTOVER_QTY: 500,
        LEFTOVER_RESERVED_QTY: 0,
        LEFTOVER_STATUS: 'available',
        __ckCurrentRecordReservedQuantity: 0
      })
    );
  });

  test('ignores non-matching datasource configs', async () => {
    const dataSource = {
      id: 'Recipes Data',
      formKey: 'Config: Recipes',
      sheetId: 'sheet-2',
      mode: 'options'
    } as any;

    await fetchDataSource(dataSource, 'EN');

    const result = applyInventoryAvailabilitySnapshotsToCachedDataSources({
      dataSourceConfigs: [dataSource],
      language: 'EN',
      availability: [
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'leftover::1',
          resourceItemId: 'LP-21',
          quantityFieldId: 'LEFTOVER_QTY',
          remainingQuantity: 500
        } as any
      ]
    });

    expect(result).toEqual({
      updatedDataSourceIds: [],
      updatedRows: 0
    });
  });
});
