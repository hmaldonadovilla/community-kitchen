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

const installGoogleScriptRunMock = (impl: (cfg: any) => any): { getCallCount: () => number } => {
  let calls = 0;
  (globalThis as any).google = {
    script: {
      run: {
        withSuccessHandler: (cb: (res: any) => void) => ({
          withFailureHandler: (_fb: (err: any) => void) => ({
            fetchDataSource: (cfg: any) => {
              calls += 1;
              cb(impl(cfg));
            }
          })
        })
      }
    }
  };
  return { getCallCount: () => calls };
};

describe('web dataSources persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    delete (globalThis as any).google;
    delete (globalThis as any).window;
  });

  it('persists different projections under different localStorage keys', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    installGoogleScriptRunMock(cfg => ({ items: [{ projection: cfg?.projection || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    await fetchDataSource({ id: 'Distributor Data', projection: ['A'] } as any, 'EN', { forceRefresh: true });
    await fetchDataSource({ id: 'Distributor Data', projection: ['B'] } as any, 'EN', { forceRefresh: true });

    const keys = localStorage.__keys().filter(k => k.startsWith('ck.ds.'));
    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('clears persisted dataSource entries on clearFetchDataSourceCache()', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    localStorage.setItem('ck.ds.one.EN.v2.abc', '{"items":[1]}');
    localStorage.setItem('ck.ds.two.EN.v2.def', '{"items":[2]}');
    localStorage.setItem('unrelated.key', 'keep');

    const { clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    expect(localStorage.getItem('ck.ds.one.EN.v2.abc')).toBeNull();
    expect(localStorage.getItem('ck.ds.two.EN.v2.def')).toBeNull();
    expect(localStorage.getItem('unrelated.key')).toBe('keep');
  });

  it('dedupes identical configs in prefetchDataSources()', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(() => ({ items: [1] }));

    const { prefetchDataSources, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'recipe', projection: ['Dish Name'], limit: 50 } as any;
    const res = await prefetchDataSources([cfg, { ...cfg }], 'EN', { forceRefresh: true });

    expect(res.requested).toBe(1);
    expect(tracker.getCallCount()).toBe(1);
  });
});

