import { applyBankAvailabilitySnapshotsToCachedDataSources } from '../../../src/web/react/features/utilisations/availabilityCache';
import { clearFetchDataSourceCache, fetchDataSource, peekCachedDataSource } from '../../../src/web/data/dataSources';

describe('bank availability cache sync', () => {
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
                          LEFTOVER_STATUS: 'used',
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

  test('patches cached datasource rows from utilisation availability responses', async () => {
    const dataSource = {
      id: 'Leftover Bank Data',
      formKey: 'Config: Leftover Bank',
      sheetId: 'sheet-1',
      mode: 'options',
      rowKeyFieldId: 'LEFTOVER_ID'
    } as any;

    await fetchDataSource(dataSource, 'EN');

    const result = applyBankAvailabilitySnapshotsToCachedDataSources({
      dataSourceConfigs: [dataSource],
      language: 'EN',
      availability: [
        {
          resourceFormKey: 'Config: Leftover Bank',
          resourceRecordId: 'leftover::1',
          resourceItemId: 'LP-21',
          quantityFieldId: 'LEFTOVER_QTY',
          statusFieldId: 'LEFTOVER_STATUS',
          unitFieldId: 'LEFTOVER_UNIT',
          remainingQuantity: 500,
          freeQuantity: 500,
          currentUtilisationQuantity: 0,
          currentRecordUtilisedQuantity: 4,
          unit: 'gr',
          status: 'available'
        }
      ]
    });

    const cached = peekCachedDataSource(dataSource, 'EN') as any;

    expect(result).toEqual({
      updatedDataSourceIds: ['Leftover Bank Data'],
      updatedRows: 1
    });
    expect(cached.items[0]).toEqual(
      expect.objectContaining({
        LEFTOVER_QTY: 500,
        LEFTOVER_STATUS: 'available',
        __ckCurrentRecordUtilisedQuantity: 4
      })
    );
  });

  test('uses datasource mapping value as the utilisation item key when rowKeyFieldId is not present', async () => {
    const dataSource = {
      id: 'Leftover Bank Data',
      formKey: 'Config: Leftover Bank',
      sheetId: 'sheet-1',
      mode: 'options',
      mapping: {
        value: 'LEFTOVER_ID'
      }
    } as any;

    await fetchDataSource(dataSource, 'EN');

    const result = applyBankAvailabilitySnapshotsToCachedDataSources({
      dataSourceConfigs: [dataSource],
      language: 'EN',
      availability: [
        {
          resourceFormKey: 'Config: Leftover Bank',
          resourceRecordId: 'leftover::1',
          resourceItemId: 'LP-21',
          quantityFieldId: 'LEFTOVER_QTY',
          statusFieldId: 'LEFTOVER_STATUS',
          unitFieldId: 'LEFTOVER_UNIT',
          remainingQuantity: 250,
          freeQuantity: 250,
          currentUtilisationQuantity: 2,
          currentRecordUtilisedQuantity: 2,
          unit: 'gr',
          status: 'available'
        }
      ]
    });

    const cached = peekCachedDataSource(dataSource, 'EN') as any;

    expect(result).toEqual({
      updatedDataSourceIds: ['Leftover Bank Data'],
      updatedRows: 1
    });
    expect(cached.items[0]).toEqual(
      expect.objectContaining({
        LEFTOVER_QTY: 250,
        LEFTOVER_STATUS: 'available',
        __ckCurrentRecordUtilisedQuantity: 2
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

    const result = applyBankAvailabilitySnapshotsToCachedDataSources({
      dataSourceConfigs: [dataSource],
      language: 'EN',
      availability: [
        {
          resourceFormKey: 'Config: Leftover Bank',
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
