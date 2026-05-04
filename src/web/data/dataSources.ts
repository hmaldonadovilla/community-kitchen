import { DataSourceConfig } from '../../types';
import { LangCode } from '../types';

declare const google: {
  script?: {
    run?: {
      withSuccessHandler: (cb: (res: any) => void) => any;
      withFailureHandler: (cb: (err: any) => void) => any;
      fetchDataSource?: (config: any, locale?: LangCode, projection?: string[], limit?: number, pageToken?: string) => void;
    };
  };
} | undefined;

type CacheKey = string;
type FetchDataSourceOptions = {
  forceRefresh?: boolean;
  commit?: boolean;
  shouldCommit?: () => boolean;
  forceRefreshMaxCacheAgeMs?: number;
};
const cache: Map<CacheKey, any> = new Map();
const cacheSavedAtMs: Map<CacheKey, number> = new Map();
const inflight: Map<CacheKey, Promise<any>> = new Map();
export const DATA_SOURCE_CACHE_CLEARED_EVENT = 'ck:datasourcecachecleared';
export const DATA_SOURCE_CACHE_UPDATED_EVENT = 'ck:datasourcecacheupdated';
const RUNNER_RETRY_DELAY = 150;
const RUNNER_MAX_ATTEMPTS = 20;
const OPTIONS_AUTO_PAGE_MAX_PAGES = 80;
const OPTIONS_AUTO_PAGE_MAX_ITEMS = 20000;
const DEFAULT_PERSIST_MAX_AGE_MS = 5 * 60 * 1000;

export type DataSourceFetchRequest = {
  source: DataSourceConfig;
  locale?: LangCode;
  projection?: string[];
  limit?: number;
  pageToken?: string;
};

export type DataSourceFetcher = (request: DataSourceFetchRequest) => Promise<any>;

let activeDataSourceFetcher: DataSourceFetcher | null = null;

export const configureDataSourceFetcher = (fetcher?: DataSourceFetcher | null): void => {
  activeDataSourceFetcher = typeof fetcher === 'function' ? fetcher : null;
};

// Optional lightweight persistence for stable data sources. This is intentionally
// conservative: only used when localStorage is available and JSON parsing succeeds.
const PERSIST_VERSION = '3';

const hashToBase36 = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const normalizeStringArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (v === undefined || v === null ? '' : `${v}`.trim()))
    .filter(Boolean);
};

const normalizeDataSourceSignature = (config: DataSourceConfig): string => {
  const projection = normalizeStringArray((config as any).projection).sort();
  const statusAllowList = normalizeStringArray((config as any).statusAllowList)
    .map(v => v.toLowerCase())
    .sort();
  const limitRaw = (config as any).limit;
  const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;
  const signature = {
    id: (config.id || 'default').toString(),
    formKey: ((config as any).formKey || '').toString(),
    sheetId: ((config as any).sheetId || '').toString(),
    tabName: ((config as any).tabName || '').toString(),
    localeKey: ((config as any).localeKey || '').toString(),
    statusFieldId: ((config as any).statusFieldId || '').toString(),
    mode: ((config as any).mode || '').toString(),
    ref: ((config as any).ref || '').toString(),
    projection,
    statusAllowList,
    limit
  };
  return hashToBase36(JSON.stringify(signature));
};

const getPersistKey = (config: DataSourceConfig, lang: LangCode): string => {
  const idPart = encodeURIComponent((config?.id || 'default').toString());
  const langPart = (lang || 'EN').toString().toUpperCase();
  const sig = normalizeDataSourceSignature(config);
  return `ck.ds.${idPart}.${langPart}.v${PERSIST_VERSION}.${sig}`;
};

const getPersistKeyPrefix = (config: DataSourceConfig, lang: LangCode): string => {
  const idPart = encodeURIComponent((config?.id || 'default').toString());
  const langPart = (lang || 'EN').toString().toUpperCase();
  return `ck.ds.${idPart}.${langPart}.v${PERSIST_VERSION}.`;
};

const resolvePersistMaxAgeMs = (config: DataSourceConfig): number => {
  const explicitMs = Number((config as any)?.persistMaxAgeMs);
  if (Number.isFinite(explicitMs) && explicitMs >= 0) return explicitMs;
  const explicitMinutes = Number((config as any)?.persistMaxAgeMinutes);
  if (Number.isFinite(explicitMinutes) && explicitMinutes >= 0) return explicitMinutes * 60 * 1000;
  return DEFAULT_PERSIST_MAX_AGE_MS;
};

const parsePersistEnvelope = (
  raw: string
): { savedAtMs: number | null; response: any | null; legacy: boolean } | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const savedAtMs = Number((parsed as any).savedAtMs);
    if (Object.prototype.hasOwnProperty.call(parsed, 'response')) {
      return {
        savedAtMs: Number.isFinite(savedAtMs) ? savedAtMs : null,
        response: (parsed as any).response ?? null,
        legacy: false
      };
    }
    return {
      savedAtMs: null,
      response: parsed,
      legacy: true
    };
  } catch {
    return null;
  }
};

const setInMemoryCache = (cacheKey: CacheKey, value: any, savedAtMs?: number | null): void => {
  cache.set(cacheKey, value);
  const resolvedSavedAtMs = Number(savedAtMs);
  cacheSavedAtMs.set(cacheKey, Number.isFinite(resolvedSavedAtMs) && resolvedSavedAtMs > 0 ? resolvedSavedAtMs : Date.now());
};

const deleteInMemoryCache = (cacheKey: CacheKey): void => {
  cache.delete(cacheKey);
  cacheSavedAtMs.delete(cacheKey);
};

const resolveForceRefreshMaxCacheAgeMs = (opts?: FetchDataSourceOptions): number | null => {
  const raw = Number(opts?.forceRefreshMaxCacheAgeMs);
  return Number.isFinite(raw) && raw >= 0 ? raw : null;
};

const peekFreshInMemoryCache = (cacheKey: CacheKey, maxAgeMs: number | null): any | null => {
  if (maxAgeMs === null || !cache.has(cacheKey)) return null;
  const savedAtMs = cacheSavedAtMs.get(cacheKey);
  if (!Number.isFinite(savedAtMs)) return null;
  if (Date.now() - Number(savedAtMs) > maxAgeMs) return null;
  return cache.get(cacheKey) ?? null;
};

const emitCacheUpdated = (config: DataSourceConfig, language: LangCode, itemCount: number): void => {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(DATA_SOURCE_CACHE_UPDATED_EVENT, {
          detail: {
            id: (config?.id || '').toString(),
            language: (language || 'EN').toString().toUpperCase(),
            itemCount
          }
        })
      );
    }
  } catch {
    // ignore
  }
};

const prunePersistedSiblingKeys = (
  storage: Storage,
  prefix: string,
  keepKey?: string
): void => {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const candidate = storage.key(i);
    if (!candidate) continue;
    if (!candidate.startsWith(prefix)) continue;
    if (keepKey && candidate === keepKey) continue;
    keysToRemove.push(candidate);
  }
  keysToRemove.forEach(candidate => {
    try {
      storage.removeItem(candidate);
    } catch (_) {
      // ignore
    }
  });
};

const loadPersistedEnvelope = (
  config: DataSourceConfig,
  language: LangCode
): { response: any; savedAtMs: number | null } | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const targetKey = getPersistKey(config, language);
    const raw = window.localStorage.getItem(targetKey);
    if (!raw) return null;
    const parsed = parsePersistEnvelope(raw);
    if (!parsed) return null;
    const maxAgeMs = resolvePersistMaxAgeMs(config);
    if (
      parsed.savedAtMs !== null &&
      Number.isFinite(maxAgeMs) &&
      maxAgeMs >= 0 &&
      Date.now() - parsed.savedAtMs > maxAgeMs
    ) {
      try {
        window.localStorage.removeItem(targetKey);
      } catch (_) {
        // ignore
      }
      return null;
    }
    if (parsed.legacy) {
      try {
        window.localStorage.removeItem(targetKey);
      } catch {
        // ignore
      }
      return null;
    }
    return parsed.response && typeof parsed.response === 'object'
      ? { response: parsed.response, savedAtMs: parsed.savedAtMs }
      : null;
  } catch {
    return null;
  }
};

const loadPersisted = (config: DataSourceConfig, language: LangCode): any | null =>
  loadPersistedEnvelope(config, language)?.response ?? null;

const savePersisted = (config: DataSourceConfig, language: LangCode, value: any): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const targetKey = getPersistKey(config, language);
    const prefix = getPersistKeyPrefix(config, language);
    prunePersistedSiblingKeys(window.localStorage, prefix, targetKey);
    window.localStorage.setItem(
      targetKey,
      JSON.stringify({
        savedAtMs: Date.now(),
        response: value
      })
    );
  } catch {
    // Ignore quota / private-mode errors; in-memory cache still works.
  }
};

function key(config: DataSourceConfig, lang: LangCode): string {
  const idPart = (config?.id || 'default').toString();
  const langPart = (lang || 'EN').toString().toUpperCase();
  const sig = normalizeDataSourceSignature(config);
  return `${idPart}::${langPart}::${sig}`;
}

const parsePersistStorageKey = (
  storageKey: string
): { id: string; language: LangCode; signature: string } | null => {
  const match = /^ck\.ds\.(.+)\.([A-Z]{2,})\.v\d+\.(.+)$/.exec((storageKey || '').trim());
  if (!match) return null;
  try {
    return {
      id: decodeURIComponent(match[1]),
      language: match[2] as LangCode,
      signature: match[3]
    };
  } catch {
    return null;
  }
};

const clearSiblingInMemoryCacheEntries = (args: {
  id: string;
  language: LangCode;
  keepCacheKey?: string | null;
}): void => {
  const cacheKeyPrefix = `${(args.id || '').toString()}::${(args.language || 'EN').toString().toUpperCase()}::`;
  if (!cacheKeyPrefix.trim()) return;
  Array.from(cache.keys()).forEach(candidateKey => {
    if (!candidateKey.startsWith(cacheKeyPrefix)) return;
    if (args.keepCacheKey && candidateKey === args.keepCacheKey) return;
    deleteInMemoryCache(candidateKey);
  });
};

let storageSyncListenerInstalled = false;

const ensureStorageSyncListener = (): void => {
  if (storageSyncListenerInstalled) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function' || !window.localStorage) return;
  storageSyncListenerInstalled = true;
  window.addEventListener('storage', event => {
    try {
      if (event.storageArea !== window.localStorage) return;
      if (!event.key) return;
      const parsedKey = parsePersistStorageKey(event.key);
      if (!parsedKey) return;

      const exactCacheKey = `${parsedKey.id}::${parsedKey.language}::${parsedKey.signature}`;
      clearSiblingInMemoryCacheEntries({
        id: parsedKey.id,
        language: parsedKey.language,
        keepCacheKey: event.newValue ? exactCacheKey : null
      });

      const persisted = event.newValue ? parsePersistEnvelope(event.newValue) : null;
      if (persisted?.response !== null && persisted?.response !== undefined) {
        setInMemoryCache(exactCacheKey, persisted.response, persisted.savedAtMs);
        emitCacheUpdated(
          { id: parsedKey.id } as DataSourceConfig,
          parsedKey.language,
          resolveCachedItemCount(persisted.response) ?? 0
        );
        return;
      }

      deleteInMemoryCache(exactCacheKey);
      emitCacheUpdated({ id: parsedKey.id } as DataSourceConfig, parsedKey.language, 0);
    } catch {
      // ignore cross-tab cache sync failures
    }
  });
};

function emitLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  payload?: Record<string, any>
): void {
  const localConsole = typeof console !== 'undefined' ? console : undefined;
  localConsole?.[level]?.(message, payload);
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      const parentConsole = (window.parent as any).console as Console | undefined;
      parentConsole?.[level]?.(message, payload);
    }
  } catch {
    // ignore cross-origin errors
  }
}

interface DataSourceTarget {
  id: string;
  type: string;
  dataSource?: DataSourceConfig;
}

function isChoiceOrCheckbox(type: string): boolean {
  const normalized = (type || '').toString().toUpperCase();
  return normalized === 'CHOICE' || normalized === 'CHECKBOX';
}

const fetchDataSourcePageViaAppsScript = (
  config: DataSourceConfig,
  language: LangCode,
  pageToken?: string
): Promise<any> => {
  return new Promise((resolve) => {
    let attempts = 0;

    const attempt = () => {
      const scriptRun = typeof google !== 'undefined' ? google?.script?.run : null;
      if (!scriptRun) {
        attempts += 1;
        if (attempts === 1) {
          emitLog('info', '[DataSource] google.script.run not ready, retrying', { id: config.id });
        }
        if (attempts > RUNNER_MAX_ATTEMPTS) {
          emitLog('error', '[DataSource] google.script.run never became ready', { id: config.id });
          resolve(null);
          return;
        }
        setTimeout(attempt, RUNNER_RETRY_DELAY);
        return;
      }

      try {
        scriptRun
          .withSuccessHandler((res: any) => resolve(res))
          .withFailureHandler((err: any) => {
            emitLog('error', '[DataSource] fetchDataSource failed', {
              id: config.id,
              err,
              pageToken: pageToken || null
            });
            resolve(null);
          })
          .fetchDataSource?.(config, language, config.projection, config.limit, pageToken);
      } catch (err) {
        emitLog('error', '[DataSource] fetchDataSource threw synchronously', {
          id: config.id,
          pageToken: pageToken || null,
          err
        });
        resolve(null);
      }
    };

    attempt();
  });
};

export async function fetchDataSource(
  config: DataSourceConfig,
  language: LangCode,
  opts?: FetchDataSourceOptions
): Promise<any> {
  ensureStorageSyncListener();
  const cacheKey = key(config, language);
  const mode = ((config as any)?.mode || '').toString().trim().toLowerCase();
  const autoPage = mode === 'options';
  const forceRefreshMaxCacheAgeMs = resolveForceRefreshMaxCacheAgeMs(opts);

  if (opts?.forceRefresh && forceRefreshMaxCacheAgeMs !== null) {
    const freshCached = peekFreshInMemoryCache(cacheKey, forceRefreshMaxCacheAgeMs);
    if (freshCached) {
      emitLog('info', '[DataSource] force refresh reused fresh cache', {
        id: config.id,
        maxCacheAgeMs: forceRefreshMaxCacheAgeMs,
        itemCount: resolveCachedItemCount(freshCached) ?? 0
      });
      return freshCached;
    }
  }

  if (!opts?.forceRefresh) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const inflightExisting = inflight.get(cacheKey);
    if (inflightExisting) return inflightExisting;

    // Best-effort persisted cache for stable/master data sources.
    const persistedEnvelope = loadPersistedEnvelope(config, language);
    const persisted = persistedEnvelope?.response;
    if (persisted) {
      const hasMore = autoPage && typeof (persisted as any)?.nextPageToken === 'string' && !!(persisted as any)?.nextPageToken;
      if (!hasMore) {
        setInMemoryCache(cacheKey, persisted, persistedEnvelope.savedAtMs);
        return persisted;
      }
      // Fall through: complete pagination so we don't get stuck returning only the first page.
    }
  }

  const inflightExisting = inflight.get(cacheKey);
  if (inflightExisting) return inflightExisting;

  const promise = (async () => {
    const callPage = async (pageToken?: string): Promise<any> => {
      if (activeDataSourceFetcher) {
        try {
          return await activeDataSourceFetcher({
            source: config,
            locale: language,
            projection: config.projection,
            limit: config.limit,
            pageToken
          });
        } catch (err) {
          emitLog('error', '[DataSource] configured fetcher failed', {
            id: config.id,
            refreshed: Boolean(opts?.forceRefresh),
            pageToken: pageToken || null,
            err
          });
          return null;
        }
      }
      return fetchDataSourcePageViaAppsScript(config, language, pageToken);
    };

    const seedPersisted = !opts?.forceRefresh ? loadPersisted(config, language) : null;
    const shouldSeed = autoPage && seedPersisted && typeof (seedPersisted as any)?.nextPageToken === 'string' && !!(seedPersisted as any)?.nextPageToken;
    const seededItems: any[] = shouldSeed
      ? Array.isArray((seedPersisted as any)?.items)
        ? (seedPersisted as any).items
        : Array.isArray(seedPersisted)
          ? (seedPersisted as any)
          : []
      : [];
    const seededNextPageToken: string | undefined = shouldSeed ? (seedPersisted as any)?.nextPageToken : undefined;

    let pages = 0;
    let mergedItems: any[] = seededItems.slice();
    let pageToken: string | undefined = seededNextPageToken;
    let firstRes: any = shouldSeed ? seedPersisted : null;
    let lastRes: any = null;

    while (true) {
      if (!autoPage && pages > 0) break;
      if (autoPage && pages >= OPTIONS_AUTO_PAGE_MAX_PAGES) {
        emitLog('warn', '[DataSource] pagination stopped (max pages)', { id: config.id, pages, items: mergedItems.length });
        break;
      }
      if (autoPage && mergedItems.length >= OPTIONS_AUTO_PAGE_MAX_ITEMS) {
        emitLog('warn', '[DataSource] pagination stopped (max items)', { id: config.id, pages, items: mergedItems.length });
        break;
      }

      const res = await callPage(pageToken);
      pages += 1;
      if (!res) return null;

      if (!firstRes) firstRes = res;
      lastRes = res;

      if (Array.isArray(res)) {
        // Legacy / non-paginated payload shape.
        mergedItems = res;
        pageToken = undefined;
        break;
      }

      const pageItems = Array.isArray((res as any)?.items) ? (res as any).items : [];
      if (!pageItems.length && !(res as any)?.nextPageToken) {
        // Nothing returned and no more pages. Preserve the merged (seeded) items.
        pageToken = undefined;
        break;
      }
      mergedItems.push(...pageItems);

      const next = typeof (res as any)?.nextPageToken === 'string' ? ((res as any).nextPageToken as string) : '';
      pageToken = autoPage && next ? next : undefined;

      const totalCount = Number((res as any)?.totalCount);
      if (autoPage && Number.isFinite(totalCount) && totalCount > 0 && mergedItems.length >= totalCount) {
        pageToken = undefined;
      }

      if (!autoPage || !pageToken) break;
    }

    const finalRes = (() => {
      if (Array.isArray(firstRes)) return mergedItems;
      if (firstRes && typeof firstRes === 'object') {
        const base = firstRes || {};
        const totalCount = Number((lastRes as any)?.totalCount ?? (base as any)?.totalCount);
        const nextPageToken = autoPage ? undefined : (lastRes as any)?.nextPageToken ?? (base as any)?.nextPageToken;
        return {
          ...base,
          items: mergedItems,
          nextPageToken,
          totalCount: Number.isFinite(totalCount) ? totalCount : mergedItems.length
        };
      }
      return { items: mergedItems, nextPageToken: undefined, totalCount: mergedItems.length };
    })();

    emitLog('info', '[DataSource] fetchDataSource success', {
      id: config.id,
      itemCount: Array.isArray((finalRes as any)?.items) ? (finalRes as any).items.length : Array.isArray(finalRes) ? finalRes.length : 0,
      pages: autoPage ? pages : 1,
      resumedFromPersisted: Boolean(shouldSeed),
      refreshed: Boolean(opts?.forceRefresh)
    });

    let shouldCommit = opts?.commit !== false;
    if (shouldCommit && typeof opts?.shouldCommit === 'function') {
      try {
        shouldCommit = opts.shouldCommit() !== false;
      } catch {
        shouldCommit = false;
      }
    }
    if (shouldCommit) {
      setInMemoryCache(cacheKey, finalRes);
    }
    if (finalRes && shouldCommit) {
      savePersisted(config, language, finalRes);
      const itemCount = Array.isArray((finalRes as any)?.items)
        ? (finalRes as any).items.length
        : Array.isArray(finalRes)
          ? finalRes.length
          : 0;
      emitCacheUpdated(config, language, itemCount);
    }
    return finalRes;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
}

export function peekCachedDataSource(config: DataSourceConfig, language: LangCode): any | null {
  ensureStorageSyncListener();
  const cacheKey = key(config, language);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }
  return loadPersisted(config, language);
}

const collectCachedDataSourceCandidates = (id: string, language?: LangCode): any[] => {
  const idPart = (id || 'default').toString();
  if (!idPart) return [];
  const preferredLang = (language || '').toString().trim().toUpperCase();
  const exactPrefix = preferredLang ? `${idPart}::${preferredLang}::` : '';
  const anyPrefix = `${idPart}::`;
  const candidates: any[] = [];
  const seen = new Set<any>();
  const push = (value: any) => {
    if (value === undefined || value === null || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };

  if (exactPrefix) {
    for (const [candidateKey, candidateValue] of cache.entries()) {
      if (!candidateKey.startsWith(exactPrefix)) continue;
      push(candidateValue);
    }
  }
  for (const [candidateKey, candidateValue] of cache.entries()) {
    if (!candidateKey.startsWith(anyPrefix)) continue;
    if (exactPrefix && candidateKey.startsWith(exactPrefix)) continue;
    push(candidateValue);
  }

  if (typeof window === 'undefined' || !window.localStorage) return candidates;

  try {
    const encodedId = encodeURIComponent(idPart);
    const exactPersistPrefix = preferredLang ? `ck.ds.${encodedId}.${preferredLang}.v${PERSIST_VERSION}.` : '';
    const anyPersistPrefix = `ck.ds.${encodedId}.`;
    const exactPersisted: Array<{ savedAtMs: number; response: any }> = [];
    const fallbackPersisted: Array<{ savedAtMs: number; response: any }> = [];

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const candidateKey = window.localStorage.key(i);
      if (!candidateKey) continue;
      const matchesExact = !!exactPersistPrefix && candidateKey.startsWith(exactPersistPrefix);
      const matchesAny = candidateKey.startsWith(anyPersistPrefix);
      if (!matchesExact && !matchesAny) continue;
      const raw = window.localStorage.getItem(candidateKey);
      if (!raw) continue;
      const parsed = parsePersistEnvelope(raw);
      if (!parsed || parsed.response === null || parsed.response === undefined) continue;
      const savedAtMs = Number.isFinite(parsed.savedAtMs) ? Number(parsed.savedAtMs) : 0;
      (matchesExact ? exactPersisted : fallbackPersisted).push({ savedAtMs, response: parsed.response });
    }

    exactPersisted
      .sort((a, b) => b.savedAtMs - a.savedAtMs)
      .forEach(entry => push(entry.response));
    fallbackPersisted
      .sort((a, b) => b.savedAtMs - a.savedAtMs)
      .forEach(entry => push(entry.response));
  } catch {
    // ignore storage access failures
  }

  return candidates;
};

export function peekCachedDataSourcesById(id: string, language?: LangCode): any[] {
  return collectCachedDataSourceCandidates(id, language);
}

const resolveCachedItemCount = (cached: any): number | null => {
  if (!cached) return null;
  if (Array.isArray(cached)) return cached.length;
  if (cached && typeof cached === 'object' && Array.isArray((cached as any).items)) {
    return (cached as any).items.length;
  }
  return 0;
};

const getSiblingCachedDataSourceItemCount = (config: DataSourceConfig, language: LangCode): number | null => {
  const idPart = (config?.id || 'default').toString();
  const langPart = (language || 'EN').toString().toUpperCase();
  const cacheKeyPrefix = `${idPart}::${langPart}::`;
  let newestCount: number | null = null;
  let positiveCount: number | null = null;

  for (const [candidateKey, candidateValue] of cache.entries()) {
    if (!candidateKey.startsWith(cacheKeyPrefix)) continue;
    const itemCount = resolveCachedItemCount(candidateValue);
    if (itemCount === null) continue;
    newestCount = itemCount;
    if (itemCount > 0) {
      positiveCount = Math.max(positiveCount ?? 0, itemCount);
    }
  }
  if (positiveCount !== null) return positiveCount;
  if (newestCount !== null) return newestCount;

  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const prefix = getPersistKeyPrefix(config, language);
    let newestSavedAtMs = -1;
    let persistedNewestCount: number | null = null;
    let persistedPositiveCount: number | null = null;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const candidateKey = window.localStorage.key(i);
      if (!candidateKey || !candidateKey.startsWith(prefix)) continue;
      const raw = window.localStorage.getItem(candidateKey);
      if (!raw) continue;
      const parsed = parsePersistEnvelope(raw);
      if (!parsed || !parsed.response) continue;
      const itemCount = resolveCachedItemCount(parsed.response);
      if (itemCount === null) continue;
      if (itemCount > 0) {
        persistedPositiveCount = Math.max(persistedPositiveCount ?? 0, itemCount);
      }
      const savedAtMs = Number.isFinite(parsed.savedAtMs) ? Number(parsed.savedAtMs) : 0;
      if (savedAtMs >= newestSavedAtMs) {
        newestSavedAtMs = savedAtMs;
        persistedNewestCount = itemCount;
      }
    }
    return persistedPositiveCount ?? persistedNewestCount;
  } catch (_) {
    return null;
  }
};

export function getCachedDataSourceItemCount(config: DataSourceConfig, language: LangCode): number | null {
  const cached = peekCachedDataSource(config, language);
  const exactCount = resolveCachedItemCount(cached);
  if (exactCount !== null) return exactCount;
  return getSiblingCachedDataSourceItemCount(config, language);
}

export function mutateCachedDataSource(
  config: DataSourceConfig,
  language: LangCode,
  mutateItems: (items: any[]) => any[]
): any | null {
  ensureStorageSyncListener();
  const cacheKey = key(config, language);
  const current = cache.has(cacheKey) ? cache.get(cacheKey) : loadPersisted(config, language);
  if (!current) return null;
  if (typeof mutateItems !== 'function') return current;

  const cloneItems = (items: any[]): any[] => items.map(item => (item && typeof item === 'object' ? { ...item } : item));

  let next: any = current;
  if (Array.isArray(current)) {
    next = mutateItems(cloneItems(current));
  } else if (current && typeof current === 'object' && Array.isArray((current as any).items)) {
    next = {
      ...(current as any),
      items: mutateItems(cloneItems((current as any).items))
    };
  }

  setInMemoryCache(cacheKey, next);
  savePersisted(config, language, next);
  const itemCount = Array.isArray((next as any)?.items)
    ? (next as any).items.length
    : Array.isArray(next)
      ? next.length
      : 0;
  emitCacheUpdated(config, language, itemCount);
  return next;
}

/**
 * Clear the in-memory client cache for fetchDataSource().
 *
 * Notes:
 * - In-memory cache is session-only.
 * - localStorage persistence (when available) is also cleared by default so the app "Refresh"
 *   action can avoid stale option/projection lookups without requiring a full browser reload.
 */
export function clearFetchDataSourceCache(opts?: { includePersisted?: boolean }): void {
  cache.clear();
  cacheSavedAtMs.clear();
  inflight.clear();
  if (opts?.includePersisted !== false) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const k = window.localStorage.key(i);
          if (k) keys.push(k);
        }
        keys.forEach(k => {
          if (k.startsWith('ck.ds.')) {
            try {
              window.localStorage.removeItem(k);
            } catch (_) {
              // ignore
            }
          }
        });
      }
    } catch (_) {
      // ignore
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(DATA_SOURCE_CACHE_CLEARED_EVENT, {
          detail: { includePersisted: opts?.includePersisted !== false }
        })
      );
    }
  } catch (_) {
    // ignore
  }
}

export async function prefetchDataSources(
  configs: DataSourceConfig[],
  language: LangCode,
  opts?: { forceRefresh?: boolean }
): Promise<{ requested: number; succeeded: number; failed: number }> {
  const list = Array.isArray(configs) ? configs : [];
  const uniqueByKey = new Map<string, DataSourceConfig>();
  list.forEach(cfg => {
    if (!cfg || typeof cfg !== 'object') return;
    const id = (cfg as any).id;
    if (!id) return;
    uniqueByKey.set(key(cfg, language), cfg);
  });

  const unique = Array.from(uniqueByKey.values());
  const results = await Promise.all(
    unique.map(cfg =>
      fetchDataSource(cfg, language, { forceRefresh: Boolean(opts?.forceRefresh) })
        .then(res => ({ ok: Boolean(res), id: cfg.id }))
        .catch(() => ({ ok: false, id: cfg.id }))
    )
  );

  const succeeded = results.filter(r => r.ok).length;
  return { requested: unique.length, succeeded, failed: unique.length - succeeded };
}

export async function resolveQuestionOptionsFromSource(
  question: DataSourceTarget,
  language: LangCode
): Promise<string[] | null> {
  if (!question.dataSource || !isChoiceOrCheckbox(question.type)) {
    return null;
  }
  const res = await fetchDataSource(question.dataSource, language);
  if (!res) return null;
  const items = Array.isArray((res as any).items) ? (res as any).items : Array.isArray(res) ? res : [];
  if (!items.length) return null;

  const mapping = (question.dataSource as any).mapping || {};
  const valueKey = mapping.value || mapping.id;

  if (typeof items[0] === 'object' && !Array.isArray(items[0])) {
    const keys = Object.keys(items[0]);
    if (!keys.length) return null;
    const resolvedKey = valueKey || keys[0];
    return items
      .map((row: any) => row[resolvedKey])
      .filter(Boolean)
      .map((v: any) => v.toString());
  }

  return (items as any[]).map(v => v != null ? v.toString() : '').filter(Boolean);
}
