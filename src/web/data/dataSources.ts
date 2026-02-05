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
const cache: Map<CacheKey, any> = new Map();
const inflight: Map<CacheKey, Promise<any>> = new Map();
const RUNNER_RETRY_DELAY = 150;
const RUNNER_MAX_ATTEMPTS = 20;
const OPTIONS_AUTO_PAGE_MAX_PAGES = 80;
const OPTIONS_AUTO_PAGE_MAX_ITEMS = 20000;

// Optional lightweight persistence for stable data sources. This is intentionally
// conservative: only used when localStorage is available and JSON parsing succeeds.
const PERSIST_VERSION = '2';

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
    sheetId: ((config as any).sheetId || '').toString(),
    tabName: ((config as any).tabName || '').toString(),
    localeKey: ((config as any).localeKey || '').toString(),
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

const loadPersisted = (config: DataSourceConfig, language: LangCode): any | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getPersistKey(config, language));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
};

const savePersisted = (config: DataSourceConfig, language: LangCode, value: any): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getPersistKey(config, language), JSON.stringify(value));
  } catch (_) {
    // Ignore quota / private-mode errors; in-memory cache still works.
  }
};

function key(config: DataSourceConfig, lang: LangCode): string {
  const idPart = (config?.id || 'default').toString();
  const langPart = (lang || 'EN').toString().toUpperCase();
  const sig = normalizeDataSourceSignature(config);
  return `${idPart}::${langPart}::${sig}`;
}

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
  } catch (_) {
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

export async function fetchDataSource(
  config: DataSourceConfig,
  language: LangCode,
  opts?: { forceRefresh?: boolean }
): Promise<any> {
  const cacheKey = key(config, language);
  const mode = ((config as any)?.mode || '').toString().trim().toLowerCase();
  const autoPage = mode === 'options';

  if (!opts?.forceRefresh) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const inflightExisting = inflight.get(cacheKey);
    if (inflightExisting) return inflightExisting;

    // Best-effort persisted cache for stable/master data sources.
    const persisted = loadPersisted(config, language);
    if (persisted) {
      const hasMore = autoPage && typeof (persisted as any)?.nextPageToken === 'string' && !!(persisted as any)?.nextPageToken;
      if (!hasMore) {
        cache.set(cacheKey, persisted);
        return persisted;
      }
      // Fall through: complete pagination so we don't get stuck returning only the first page.
    }
  }

  const inflightExisting = inflight.get(cacheKey);
  if (inflightExisting) return inflightExisting;

  const promise = (async () => {
    const callPage = async (pageToken?: string): Promise<any> => {
      return new Promise((resolve) => {
        let attempts = 0;

        const attempt = () => {
          const scriptRun = google?.script?.run;
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
                  refreshed: Boolean(opts?.forceRefresh),
                  pageToken: pageToken || null
                });
                resolve(null);
              })
              .fetchDataSource?.(config, language, config.projection, config.limit, pageToken);
          } catch (err) {
            emitLog('error', '[DataSource] fetchDataSource threw synchronously', {
              id: config.id,
              refreshed: Boolean(opts?.forceRefresh),
              pageToken: pageToken || null,
              err
            });
            resolve(null);
          }
        };

        attempt();
      });
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

    cache.set(cacheKey, finalRes);
    if (finalRes) {
      savePersisted(config, language, finalRes);
    }
    return finalRes;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
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
  inflight.clear();
  if (opts?.includePersisted === false) return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
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
