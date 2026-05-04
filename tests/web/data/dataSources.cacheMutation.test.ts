import {
  clearFetchDataSourceCache,
  fetchDataSource,
  mutateCachedDataSource,
  peekCachedDataSource
} from '../../../src/web/data/dataSources';

class MemoryStorage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) || null : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('dataSources cache mutation', () => {
  const config: any = {
    id: 'Leftover Inventory Data',
    formKey: 'Config: Leftover Inventory',
    mode: 'options',
    projection: ['id', 'LEFTOVER_ID', 'LEFTOVER_RESERVED_PORTIONS']
  };
  const previousWindow = (globalThis as any).window;
  const windowStub = Object.assign(new EventTarget(), {
    localStorage: new MemoryStorage()
  });

  beforeAll(() => {
    (globalThis as any).window = windowStub;
  });

  beforeEach(() => {
    clearFetchDataSourceCache();
    windowStub.localStorage.clear();
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

  afterAll(() => {
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
      return;
    }
    (globalThis as any).window = previousWindow;
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

  test('can skip committing a forced refresh result when a caller guard fails', async () => {
    const res = await fetchDataSource(config, 'EN', {
      forceRefresh: true,
      shouldCommit: () => false
    });

    expect((res as any)?.items?.[0]?.LEFTOVER_ID).toBe('LE-1');
    expect(peekCachedDataSource(config, 'EN')).toBeNull();
    expect(windowStub.localStorage.length).toBe(0);
  });

  test('adopts persisted datasource updates from another tab', async () => {
    await fetchDataSource(config, 'EN');
    const initial = peekCachedDataSource(config, 'EN') as any;
    expect(initial?.items?.[0]?.LEFTOVER_RESERVED_PORTIONS).toBe(0);

    const storageKey = Array.from({ length: windowStub.localStorage.length }, (_, index) => windowStub.localStorage.key(index))
      .filter((key): key is string => Boolean(key))
      .find(key => key.startsWith('ck.ds.Leftover%20Inventory%20Data.EN.'));

    expect(storageKey).toBeTruthy();
    const nextValue = JSON.stringify({
      savedAtMs: Date.now(),
      response: {
        items: [{ id: 'leftover-1', LEFTOVER_ID: 'LE-1', LEFTOVER_RESERVED_PORTIONS: 4 }],
        totalCount: 1
      }
    });

    windowStub.localStorage.setItem(storageKey as string, nextValue);
    const storageEvent = Object.assign(new Event('storage'), {
      key: storageKey as string,
      newValue: nextValue,
      oldValue: null,
      storageArea: windowStub.localStorage
    });
    windowStub.dispatchEvent(storageEvent);

    expect((peekCachedDataSource(config, 'EN') as any)?.items?.[0]?.LEFTOVER_RESERVED_PORTIONS).toBe(4);
  });
});
