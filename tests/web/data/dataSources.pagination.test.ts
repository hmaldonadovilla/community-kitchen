type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key: (index: number) => string | null;
  readonly length: number;
};

const createLocalStorageMock = (): LocalStorageLike & { __keys: () => string[] } => {
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

const installGoogleScriptRunPaginationMock = (
  impl: (cfg: any, locale?: any, projection?: any, limit?: any, pageToken?: any) => any
): { getCallCount: () => number; getPageTokens: () => Array<string | null> } => {
  let calls = 0;
  const pageTokens: Array<string | null> = [];
  (globalThis as any).google = {
    script: {
      run: {
        withSuccessHandler: (cb: (res: any) => void) => ({
          withFailureHandler: (_fb: (err: any) => void) => ({
            fetchDataSource: (cfg: any, locale?: any, projection?: any, limit?: any, pageToken?: any) => {
              calls += 1;
              pageTokens.push(pageToken ? pageToken.toString() : null);
              cb(impl(cfg, locale, projection, limit, pageToken));
            }
          })
        })
      }
    }
  };
  return { getCallCount: () => calls, getPageTokens: () => pageTokens.slice() };
};

describe('web dataSources pagination', () => {
  beforeEach(() => {
    jest.resetModules();
    delete (globalThis as any).google;
    delete (globalThis as any).window;
  });

  it('auto-pages options-mode data sources and persists merged items', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunPaginationMock((_cfg, _locale, _projection, _limit, pageToken) => {
      if (!pageToken) return { items: ['A', 'B'], nextPageToken: 'p2', totalCount: 4 };
      if (pageToken === 'p2') return { items: ['C', 'D'], totalCount: 4 };
      return { items: [], totalCount: 4 };
    });

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const res = await fetchDataSource({ id: 'Recipes Data', mode: 'options' } as any, 'EN', { forceRefresh: true });
    expect(tracker.getCallCount()).toBe(2);
    expect(tracker.getPageTokens()).toEqual([null, 'p2']);
    expect(res.items).toEqual(['A', 'B', 'C', 'D']);

    const keys = localStorage.__keys().filter(k => k.startsWith('ck.ds.'));
    expect(keys.length).toBe(1);
    const persisted = JSON.parse(localStorage.getItem(keys[0]) || '{}');
    expect(persisted.items).toEqual(['A', 'B', 'C', 'D']);
    expect(persisted.nextPageToken).toBeUndefined();
    expect(persisted.totalCount).toBe(4);
  });

  it('does not auto-page non-options mode responses', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunPaginationMock(() => ({ items: ['A', 'B'], nextPageToken: 'p2', totalCount: 4 }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const res = await fetchDataSource({ id: 'Recipes Data' } as any, 'EN', { forceRefresh: true });
    expect(tracker.getCallCount()).toBe(1);
    expect(res.items).toEqual(['A', 'B']);

    const keys = localStorage.__keys().filter(k => k.startsWith('ck.ds.'));
    expect(keys.length).toBe(1);
    const persisted = JSON.parse(localStorage.getItem(keys[0]) || '{}');
    expect(persisted.items).toEqual(['A', 'B']);
    expect(persisted.nextPageToken).toBe('p2');
  });
});

