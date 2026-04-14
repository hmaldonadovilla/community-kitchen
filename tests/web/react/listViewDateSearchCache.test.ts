import {
  buildListViewDateSearchCacheKey,
  clearListViewDateSearchCache,
  readCachedListViewDateSearch,
  writeCachedListViewDateSearch
} from '../../../src/web/react/app/listViewDateSearchCache';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key: (index: number) => string | null;
  readonly length: number;
  __keys: () => string[];
};

const createLocalStorageMock = (): LocalStorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
    get length() {
      return store.size;
    },
    __keys: () => Array.from(store.keys())
  };
};

describe('listViewDateSearchCache', () => {
  beforeEach(() => {
    delete (globalThis as any).localStorage;
    clearListViewDateSearchCache();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    clearListViewDateSearchCache();
  });

  it('writes and reads cached exact-date search results', () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).localStorage = localStorage;

    const key = buildListViewDateSearchCacheKey({
      formKey: 'Config: Meal Production',
      dateFieldId: 'MP_PREP_DATE',
      dateValue: '2026-02-27',
      projection: ['MP_SERVICE', 'MP_DISTRIBUTOR'],
      sortField: 'MP_PREP_DATE',
      sortDirection: 'desc',
      etag: 'etag-1',
      cacheVersion: 'v1'
    });

    writeCachedListViewDateSearch(key, {
      items: [{ id: 'row-1', MP_SERVICE: 'Lunch' } as any],
      totalCount: 1,
      etag: 'etag-1'
    });

    expect(localStorage.getItem(key)).toContain('"totalCount":1');
    expect(readCachedListViewDateSearch(key)).toEqual({
      items: [{ id: 'row-1', MP_SERVICE: 'Lunch' }],
      totalCount: 1,
      etag: 'etag-1'
    });
  });

  it('treats projection order as equivalent but changes keys when etag changes', () => {
    const keyA = buildListViewDateSearchCacheKey({
      formKey: 'Config: Meal Production',
      dateFieldId: 'MP_PREP_DATE',
      dateValue: '2026-02-27',
      projection: ['MP_SERVICE', 'MP_DISTRIBUTOR'],
      sortField: 'MP_PREP_DATE',
      sortDirection: 'desc',
      etag: 'etag-1',
      cacheVersion: 'v1'
    });
    const keyB = buildListViewDateSearchCacheKey({
      formKey: 'Config: Meal Production',
      dateFieldId: 'MP_PREP_DATE',
      dateValue: '2026-02-27',
      projection: ['MP_DISTRIBUTOR', 'MP_SERVICE'],
      sortField: 'MP_PREP_DATE',
      sortDirection: 'desc',
      etag: 'etag-1',
      cacheVersion: 'v1'
    });
    const keyC = buildListViewDateSearchCacheKey({
      formKey: 'Config: Meal Production',
      dateFieldId: 'MP_PREP_DATE',
      dateValue: '2026-02-27',
      projection: ['MP_DISTRIBUTOR', 'MP_SERVICE'],
      sortField: 'MP_PREP_DATE',
      sortDirection: 'desc',
      etag: 'etag-2',
      cacheVersion: 'v1'
    });

    expect(keyA).toBe(keyB);
    expect(keyC).not.toBe(keyA);
  });

  it('drops expired persisted entries', () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).localStorage = localStorage;

    const key = buildListViewDateSearchCacheKey({
      formKey: 'Config: Meal Production',
      dateFieldId: 'MP_PREP_DATE',
      dateValue: '2026-02-27',
      projection: ['MP_SERVICE'],
      sortField: 'MP_PREP_DATE',
      sortDirection: 'desc',
      etag: 'etag-1',
      cacheVersion: 'v1'
    });

    localStorage.setItem(
      key,
      JSON.stringify({
        items: [{ id: 'row-1' }],
        totalCount: 1,
        etag: 'etag-1',
        savedAtMs: Date.now() - 7 * 60 * 60 * 1000
      })
    );

    expect(readCachedListViewDateSearch(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
