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
    delete (globalThis as any).__CK_CACHE_VERSION__;
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

    const projectionA = { id: 'Leftover Bank Data', projection: ['A'] } as any;
    const projectionB = { id: 'Leftover Bank Data', projection: ['B'] } as any;

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

    const nonEmpty = { id: 'Leftover Bank Data', projection: ['A'] } as any;
    const empty = { id: 'Leftover Bank Data', projection: ['B'] } as any;

    await fetchDataSource(nonEmpty, 'EN', { forceRefresh: true });
    localStorage.setItem(
      'ck.ds.Leftover%20Bank%20Data.EN.v4.default.empty',
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

    await fetchDataSource({ id: 'Shared Bank', formKey: 'Config: Leftover Bank' } as any, 'EN', {
      forceRefresh: true
    });
    await fetchDataSource({ id: 'Shared Bank', formKey: 'Config: Pantry Bank' } as any, 'EN', {
      forceRefresh: true
    });

    const keys = localStorage.__keys().filter(k => k.startsWith('ck.ds.'));
    expect(keys.length).toBe(1);
    expect(localStorage.getItem(keys[0]!) || '').toContain('Config: Pantry Bank');
  });

  it('clears persisted dataSource entries on clearFetchDataSourceCache()', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    localStorage.setItem('ck.ds.one.EN.v4.default.abc', '{"items":[1]}');
    localStorage.setItem('ck.ds.two.EN.v3.def', '{"items":[2]}');
    localStorage.setItem('unrelated.key', 'keep');

    const { clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    expect(localStorage.getItem('ck.ds.one.EN.v4.default.abc')).toBeNull();
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

  it('reuses fresh in-memory cache for bounded force refreshes', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(() => ({ items: [{ id: 'recipe-1' }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'Recipes Data', projection: ['QFTD5RD2EM'] } as any;
    await fetchDataSource(cfg, 'EN', { forceRefresh: true });
    const result = await fetchDataSource(cfg, 'EN', {
      forceRefresh: true,
      forceRefreshMaxCacheAgeMs: 120000
    });

    expect(tracker.getCallCount()).toBe(1);
    expect(result?.items?.[0]?.id).toBe('recipe-1');
  });

  it('honors datasource-level max age when force refresh is requested', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(() => ({ items: [{ id: 'hub' }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'Distributor Data', forceRefreshMaxCacheAgeMs: 120000 } as any;
    await fetchDataSource(cfg, 'EN', { forceRefresh: true });
    const result = await fetchDataSource(cfg, 'EN', { forceRefresh: true });

    expect(tracker.getCallCount()).toBe(1);
    expect(result?.items?.[0]?.id).toBe('hub');
  });

  it('keeps force-refresh cache reuse scoped to the exact signature by default', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ projection: cfg?.projection || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const fullOptions = {
      id: 'Distributor Data',
      projection: ['DIST_NAME', 'NICKNAME'],
      forceRefreshMaxCacheAgeMs: 120000
    } as any;
    const emailProjection = {
      id: 'Distributor Data',
      projection: ['NICKNAME', 'DIST_EMAIL'],
      forceRefreshMaxCacheAgeMs: 120000
    } as any;
    await fetchDataSource(fullOptions, 'EN', { forceRefresh: true });
    await fetchDataSource(emailProjection, 'EN', { forceRefresh: true });

    expect(tracker.getCallCount()).toBe(2);
  });

  it('can reuse a fresh sibling projection for stable datasource-level force refreshes', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ projection: cfg?.projection || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const fullOptions = {
      id: 'Distributor Data',
      projection: ['DIST_NAME', 'NICKNAME'],
      forceRefreshMaxCacheAgeMs: 120000,
      forceRefreshCacheScope: 'dataSource'
    } as any;
    const emailProjection = {
      id: 'Distributor Data',
      projection: ['NICKNAME', 'DIST_EMAIL'],
      forceRefreshMaxCacheAgeMs: 120000,
      forceRefreshCacheScope: 'dataSource'
    } as any;
    await fetchDataSource(fullOptions, 'EN', { forceRefresh: true });
    const result = await fetchDataSource(emailProjection, 'EN', { forceRefresh: true });

    expect(tracker.getCallCount()).toBe(1);
    expect(result?.items?.[0]?.projection).toEqual(['DIST_NAME', 'NICKNAME']);
  });

  it('refreshes again when bounded force refresh cache is too old', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(() => ({ items: [{ id: 'recipe-1' }] }));
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValue(1000);

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'Recipes Data', projection: ['QFTD5RD2EM'] } as any;
    await fetchDataSource(cfg, 'EN', { forceRefresh: true });
    dateSpy.mockReturnValue(200000);
    await fetchDataSource(cfg, 'EN', {
      forceRefresh: true,
      forceRefreshMaxCacheAgeMs: 120000
    });

    expect(tracker.getCallCount()).toBe(2);
    dateSpy.mockRestore();
  });

  it('expires persisted datasource entries after the configured max age', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ id: cfg?.id || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'Leftover Bank Data', persistMaxAgeMinutes: 1 } as any;
    await fetchDataSource(cfg, 'EN', { forceRefresh: true });
    const key = localStorage.__keys().find(k => k.startsWith('ck.ds.Leftover%20Bank%20Data.EN.v4.default.'));
    expect(key).toBeTruthy();
    localStorage.setItem(
      key!,
      JSON.stringify({
        savedAtMs: Date.now() - 10 * 60 * 1000,
        response: { items: [{ id: 'stale' }] }
      })
    );
    clearFetchDataSourceCache({ includePersisted: false });

    const result = await fetchDataSource(cfg, 'EN');

    expect(tracker.getCallCount()).toBe(2);
    expect(result?.items?.[0]?.id).toBe('Leftover Bank Data');
  });

  it('drops legacy persisted datasource payloads without envelope metadata', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ id: cfg?.id || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'Recipes Data' } as any;
    await fetchDataSource(cfg, 'EN', { forceRefresh: true });
    const key = localStorage.__keys().find(k => k.startsWith('ck.ds.Recipes%20Data.EN.v4.default.'));
    expect(key).toBeTruthy();
    localStorage.setItem(key!, JSON.stringify({ items: [{ id: 'legacy' }] }));
    clearFetchDataSourceCache({ includePersisted: false });

    const result = await fetchDataSource(cfg, 'EN');

    expect(tracker.getCallCount()).toBe(2);
    expect(result?.items?.[0]?.id).toBe('Recipes Data');
  });

  it('misses persisted datasource entries when the client cache version changes', async () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage, __CK_CACHE_VERSION__: 'cache-a' };
    const tracker = installGoogleScriptRunMock(cfg => ({ items: [{ id: cfg?.id || null }] }));

    const { fetchDataSource, clearFetchDataSourceCache } = await import('../../../src/web/data/dataSources');
    clearFetchDataSourceCache();

    const cfg = { id: 'Recipes Data', cachePolicy: 'versioned' } as any;
    await fetchDataSource(cfg, 'EN', { forceRefresh: true });
    expect(localStorage.__keys().some(k => k.includes('.cache-a.'))).toBe(true);

    (globalThis as any).window.__CK_CACHE_VERSION__ = 'cache-b';
    clearFetchDataSourceCache({ includePersisted: false });
    await fetchDataSource(cfg, 'EN');

    expect(tracker.getCallCount()).toBe(2);
    expect(localStorage.__keys().some(k => k.includes('.cache-b.'))).toBe(true);
    expect(localStorage.__keys().some(k => k.includes('.cache-a.'))).toBe(false);
  });
});
