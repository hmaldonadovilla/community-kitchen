import {
  DATE_SEARCH_LOCAL_CACHE_MAX_AGE_MS,
  buildDateSearchLocalCacheKey,
  clearDateSearchLocalCacheFamily,
  readDateSearchLocalCache,
  writeDateSearchLocalCache
} from '../../../src/web/react/app/dateSearchLocalCache';

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

const descriptor = {
  dateFieldId: 'MP_PREP_DATE',
  dateEquals: '2026-05-11',
  projection: ['MP_SERVICE', 'MP_PREP_DATE'],
  sortField: 'MP_PREP_DATE',
  sortDirection: 'desc'
};

describe('dateSearchLocalCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as any).localStorage;
  });

  it('builds stable keys from form, list view, cache version, and date-search descriptor', () => {
    const listView = { search: { mode: 'date', dateFieldId: 'MP_PREP_DATE' } };
    const first = buildDateSearchLocalCacheKey({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor
    });
    const second = buildDateSearchLocalCacheKey({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor: { ...descriptor, projection: [...descriptor.projection].reverse() }
    });
    const changedDate = buildDateSearchLocalCacheKey({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor: { ...descriptor, dateEquals: '2026-05-10' }
    });

    expect(first).toBe(second);
    expect(changedDate).not.toBe(first);
    expect(buildDateSearchLocalCacheKey({ formKey: '', listView, cacheVersion: 'cache-a', descriptor })).toBe('');
  });

  it('persists exact past-date list responses with hydrated records', () => {
    const storage = createLocalStorageMock();
    installLocalStorage(storage);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const listView = { pageSize: 10, search: { mode: 'date', dateFieldId: 'MP_PREP_DATE' } };

    writeDateSearchLocalCache({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor,
      response: {
        items: [{ id: 'rec-1', MP_PREP_DATE: '2026-05-11' }] as any,
        totalCount: 1,
        notModified: true
      },
      records: {
        'rec-1': {
          id: 'rec-1',
          values: { MP_PREP_DATE: '2026-05-11', MP_SERVICE: 'Lunch' }
        } as any
      }
    });

    const entry = readDateSearchLocalCache({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor
    });

    expect(entry?.response.items).toEqual([{ id: 'rec-1', MP_PREP_DATE: '2026-05-11' }]);
    expect((entry?.response as any).notModified).toBeUndefined();
    expect(entry?.records['rec-1']?.values?.MP_SERVICE).toBe('Lunch');
  });

  it('misses when the cache version or searched date changes and prunes old siblings', () => {
    const storage = createLocalStorageMock();
    installLocalStorage(storage);
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    const listView = { search: { mode: 'date', dateFieldId: 'MP_PREP_DATE' } };

    writeDateSearchLocalCache({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor,
      response: { items: [{ id: 'old' }] as any, totalCount: 1 }
    });
    expect(storage.__keys()).toHaveLength(1);

    expect(
      readDateSearchLocalCache({
        formKey: 'Config: Meal Production',
        listView,
        cacheVersion: 'cache-a',
        descriptor: { ...descriptor, dateEquals: '2026-05-10' }
      })
    ).toBeNull();

    writeDateSearchLocalCache({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-b',
      descriptor,
      response: { items: [{ id: 'new' }] as any, totalCount: 1 }
    });

    expect(storage.__keys()).toHaveLength(1);
    expect(
      readDateSearchLocalCache({
        formKey: 'Config: Meal Production',
        listView,
        cacheVersion: 'cache-b',
        descriptor
      })?.response.items
    ).toEqual([{ id: 'new' }]);
  });

  it('expires stale entries and clears a form/list-view family', () => {
    const storage = createLocalStorageMock();
    installLocalStorage(storage);
    const listView = { search: { mode: 'date', dateFieldId: 'MP_PREP_DATE' } };
    const now = DATE_SEARCH_LOCAL_CACHE_MAX_AGE_MS + 10_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const key = buildDateSearchLocalCacheKey({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor
    });
    storage.setItem(
      key,
      JSON.stringify({
        savedAtMs: now - DATE_SEARCH_LOCAL_CACHE_MAX_AGE_MS - 1,
        descriptor,
        response: { items: [{ id: 'stale' }], totalCount: 1 }
      })
    );

    expect(
      readDateSearchLocalCache({
        formKey: 'Config: Meal Production',
        listView,
        cacheVersion: 'cache-a',
        descriptor
      })
    ).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    writeDateSearchLocalCache({
      formKey: 'Config: Meal Production',
      listView,
      cacheVersion: 'cache-a',
      descriptor,
      response: { items: [{ id: 'fresh' }] as any, totalCount: 1 }
    });
    clearDateSearchLocalCacheFamily({ formKey: 'Config: Meal Production', listView });

    expect(storage.__keys()).toHaveLength(0);
  });
});
