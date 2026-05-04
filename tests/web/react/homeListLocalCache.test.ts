import {
  HOME_LIST_LOCAL_CACHE_MAX_AGE_MS,
  buildHomeListLocalCacheKey,
  clearHomeListLocalCache,
  readHomeListLocalCache,
  resolveGlobalCacheVersion,
  writeHomeListLocalCache
} from '../../../src/web/react/app/homeListLocalCache';

type LocalStorageLike = Storage & { __keys: () => string[] };

const createLocalStorageMock = (): LocalStorageLike => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    __keys: () => Array.from(store.keys())
  } as LocalStorageLike;
};

const installLocalStorage = (storage: LocalStorageLike): void => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  });
};

describe('homeListLocalCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as any).localStorage;
    delete (globalThis as any).__CK_CACHE_VERSION__;
  });

  it('builds stable keys from form, cache version, and list view signature', () => {
    const first = buildHomeListLocalCacheKey('Config: Meal Production', { search: { mode: 'date' } }, 'v1');
    const second = buildHomeListLocalCacheKey('Config: Meal Production', { search: { mode: 'date' } }, 'v1');
    const changedView = buildHomeListLocalCacheKey('Config: Meal Production', { search: { mode: 'text' } }, 'v1');

    expect(first).toBe(second);
    expect(changedView).not.toBe(first);
    expect(buildHomeListLocalCacheKey('', {}, 'v1')).toBe('');
  });

  it('reads the global cache version defensively', () => {
    (globalThis as any).__CK_CACHE_VERSION__ = '  cache-7  ';

    expect(resolveGlobalCacheVersion()).toBe('cache-7');
  });

  it('writes and reads list responses without preserving notModified', () => {
    const storage = createLocalStorageMock();
    installLocalStorage(storage);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const key = buildHomeListLocalCacheKey('Config: Meal Production', { pageSize: 10 }, 'v1');

    writeHomeListLocalCache(
      key,
      {
        items: [{ id: 'meal-1' }] as any,
        totalCount: 1,
        nextPageToken: undefined,
        notModified: true
      },
      4
    );

    const entry = readHomeListLocalCache(key);

    expect(entry?.homeRev).toBe(4);
    expect(entry?.response.items).toEqual([{ id: 'meal-1' }]);
    expect((entry?.response as any).notModified).toBeUndefined();
  });

  it('prunes older cache-version siblings for the same form and list view', () => {
    const storage = createLocalStorageMock();
    installLocalStorage(storage);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const listView = { search: { mode: 'date', dateFieldId: 'DATE' } };
    const oldKey = buildHomeListLocalCacheKey('Config: Meal Production', listView, 'v1');
    const newKey = buildHomeListLocalCacheKey('Config: Meal Production', listView, 'v2');

    writeHomeListLocalCache(oldKey, { items: [{ id: 'old' }] as any, totalCount: 1 } as any, 1);
    writeHomeListLocalCache(newKey, { items: [{ id: 'new' }] as any, totalCount: 1 } as any, 2);

    expect(storage.getItem(oldKey)).toBeNull();
    expect(readHomeListLocalCache(newKey)?.response.items).toEqual([{ id: 'new' }]);
  });

  it('expires stale persisted entries and clears cache families', () => {
    const storage = createLocalStorageMock();
    installLocalStorage(storage);
    const now = HOME_LIST_LOCAL_CACHE_MAX_AGE_MS + 10_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const key = buildHomeListLocalCacheKey('Config: Meal Production', { pageSize: 10 }, 'v2');
    storage.setItem(
      key,
      JSON.stringify({
        savedAtMs: now - HOME_LIST_LOCAL_CACHE_MAX_AGE_MS - 1,
        response: { items: [{ id: 'stale' }] }
      })
    );

    expect(readHomeListLocalCache(key)).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    writeHomeListLocalCache(key, { items: [{ id: 'fresh' }] as any, totalCount: 1 } as any, 2);
    expect(storage.getItem(key)).not.toBeNull();

    clearHomeListLocalCache(key);

    expect(storage.getItem(key)).toBeNull();
  });
});
