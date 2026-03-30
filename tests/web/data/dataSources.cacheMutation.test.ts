import { clearFetchDataSourceCache, fetchDataSource, mutateCachedDataSource, peekCachedDataSource } from '../../../src/web/data/dataSources';

describe('dataSources cache mutation', () => {
  const config: any = {
    id: 'Leftover Inventory Data',
    formKey: 'Config: Leftover Inventory',
    mode: 'options',
    projection: ['id', 'LEFTOVER_ID', 'LEFTOVER_RESERVED_PORTIONS']
  };

  beforeEach(() => {
    clearFetchDataSourceCache();
    (globalThis as any).google = {
      script: {
        run: {
          withSuccessHandler(success: (res: any) => void) {
            return {
              withFailureHandler() {
                return {
                  fetchDataSource() {
                    success({
                      items: [{ id: 'leftover-1', LEFTOVER_ID: 'LE-1', LEFTOVER_RESERVED_PORTIONS: 0 }],
                      totalCount: 1
                    });
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
    clearFetchDataSourceCache();
    delete (globalThis as any).google;
  });

  test('mutates cached datasource items and persists the update', async () => {
    await fetchDataSource(config, 'EN');

    const updated = mutateCachedDataSource(config, 'EN', items =>
      items.map(item =>
        item.id === 'leftover-1'
          ? { ...item, LEFTOVER_RESERVED_PORTIONS: 3 }
          : item
      )
    );

    expect((updated as any)?.items?.[0]?.LEFTOVER_RESERVED_PORTIONS).toBe(3);
    expect((peekCachedDataSource(config, 'EN') as any)?.items?.[0]?.LEFTOVER_RESERVED_PORTIONS).toBe(3);
  });
});
