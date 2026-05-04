export {};

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

  it('prunes older persisted variants for the same datasource id and language', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    installGoogleScriptRunMock(cfg => ({ items: [{ projection: cfg?.projection || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    await fetchDataSource({ id: 'Distributor Data', projection: ['A'] } as any, 'EN', { forceRefresh: true });
    await fetchDataSource({ id: 'Distributor Data', projection: ['B'] } as any, 'EN', { forceRefresh: true });

    const keys = localStorage.__keys().filter(k => k.startsWith('ck.ds.'));
    expect(keys.length).toBe(1);
    expect(localStorage.getItem(keys[0]!) || '').toContain('"projection":["B"]');
  });

  it('resolves datasource item count from a persisted sibling variant when the exact signature is missing', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    installGoogleScriptRunMock(cfg => ({ items: [{ projection: cfg?.projection || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache, getCachedDataSourceItemCount } = await import(
      '../../../src/web/data/dataSources'
    );
    clearFetchDataSourceCache();

    const projectionA = { id: 'Leftover Inventory Data', projection: ['A'] } as any;
    const projectionB = { id: 'Leftover Inventory Data', projection: ['B'] } as any;

    await fetchDataSource(projectionA, 'EN', { forceRefresh: true });
    await fetchDataSource(projectionB, 'EN', { forceRefresh: true });
    clearFetchDataSourceCache({ includePersisted: false });

    expect(getCachedDataSourceItemCount(projectionA, 'EN')).toBe(1);
  });

  it('prefers a non-empty sibling datasource count over a newer empty sibling variant', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    installGoogleScriptRunMock(cfg => ({ items: [{ projection: cfg?.projection || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache, getCachedDataSourceItemCount } = await import(
      '../../../src/web/data/dataSources'
    );
    clearFetchDataSourceCache();

    const nonEmpty = { id: 'Leftover Inventory Data', projection: ['A'] } as any;
    const empty = { id: 'Leftover Inventory Data', projection: ['B'] } as any;

    await fetchDataSource(nonEmpty, 'EN', { forceRefresh: true });
    localStorage.setItem(
      'ck.ds.Leftover%20Inventory%20Data.EN.v3.empty',
      JSON.stringify({
        savedAtMs: Date.now() + 1000,
        response: { items: [] }
      })
    );
    clearFetchDataSourceCache({ includePersisted: false });

    expect(getCachedDataSourceItemCount(empty, 'EN')).toBe(1);
  });

  it('prunes older persisted form-backed variants for the same datasource id and language', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    installGoogleScriptRunMock(cfg => ({ items: [{ id: cfg?.formKey || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    await fetchDataSource({ id: 'Shared Inventory', formKey: 'Config: Leftover Inventory' } as any, 'EN', {
      forceRefresh: true
    });
    await fetchDataSource({ id: 'Shared Inventory', formKey: 'Config: Pantry Inventory' } as any, 'EN', {
      forceRefresh: true
    });

    const keys = localStorage.__keys().filter(k => k.startsWith('ck.ds.'));
    expect(keys.length).toBe(1);
    expect(localStorage.getItem(keys[0]!) || '').toContain('Config: Pantry Inventory');
  });

  it('clears persisted dataSource entries on clearFetchDataSourceCache()', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    localStorage.setItem('ck.ds.one.EN.v3.abc', '{"items":[1]}');
    localStorage.setItem('ck.ds.two.EN.v3.def', '{"items":[2]}');
    localStorage.setItem('unrelated.key', 'keep');

    const { clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    expect(localStorage.getItem('ck.ds.one.EN.v3.abc')).toBeNull();
    expect(localStorage.getItem('ck.ds.two.EN.v3.def')).toBeNull();
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

  it('uses a configured fetcher instead of google.script.run when provided', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };

    const { fetchDataSource, clearFetchDataSourceCache, configureDataSourceFetcher } = await import(
      '../../../src/web/data/dataSources'
    );
    clearFetchDataSourceCache();
    const fetcher = jest.fn(async (req: any) => ({
      items: [{ id: req.source.id, locale: req.locale, projection: req.projection }],
      totalCount: 1
    }));
    configureDataSourceFetcher(fetcher);

    try {
      const result = await fetchDataSource(
        { id: 'Recipes Data', projection: ['Dish Name'], limit: 10 } as any,
        'FR',
        { forceRefresh: true }
      );

      expect(result.items).toEqual([{ id: 'Recipes Data', locale: 'FR', projection: ['Dish Name'] }]);
      expect(fetcher).toHaveBeenCalledWith({
        source: { id: 'Recipes Data', projection: ['Dish Name'], limit: 10 },
        locale: 'FR',
        projection: ['Dish Name'],
        limit: 10,
        pageToken: undefined
      });
      expect((globalThis as any).google).toBeUndefined();
    } finally {
      configureDataSourceFetcher(null);
    }
  });

  it('expires persisted datasource entries after the configured max age', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ id: cfg?.id || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const staleSavedAtMs = Date.now() - 10 * 60 * 1000;
    localStorage.setItem(
      'ck.ds.Leftover%20Inventory%20Data.EN.v3.test',
      JSON.stringify({
        savedAtMs: staleSavedAtMs,
        response: { items: [{ id: 'stale' }] }
      })
    );

    const result = await fetchDataSource({ id: 'Leftover Inventory Data', persistMaxAgeMinutes: 1 } as any, 'EN');

    expect(tracker.getCallCount()).toBe(1);
    expect(result?.items?.[0]?.id).toBe('Leftover Inventory Data');
  });

  it('drops legacy persisted datasource payloads without envelope metadata', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ id: cfg?.id || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    localStorage.setItem('ck.ds.Recipes%20Data.EN.v3.test', JSON.stringify({ items: [{ id: 'legacy' }] }));

    const result = await fetchDataSource({ id: 'Recipes Data' } as any, 'EN');

    expect(tracker.getCallCount()).toBe(1);
    expect(result?.items?.[0]?.id).toBe('Recipes Data');
  });
});
