import type { ListResponse } from '../api';

/**
 * Owns the browser-local cache for Home list bootstrap responses.
 *
 * Boundary: this module may touch localStorage and serialize list responses, but
 * it does not know React state, fetch policy, transport mode, or list rendering.
 */
export const HOME_LIST_LOCAL_CACHE_PREFIX = 'ck.homeList.v1';
export const HOME_LIST_LOCAL_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

type HomeListLocalCachePayload = {
  savedAtMs: number;
  response: ListResponse;
  homeRev?: number;
};

export type HomeListLocalCacheEntry = {
  response: ListResponse;
  homeRev?: number;
};

const resolveLocalStorageSafely = (): Storage | null => {
  try {
    const storage = (globalThis as any)?.localStorage;
    if (!storage) return null;
    if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
      return null;
    }
    return storage as Storage;
  } catch {
    return null;
  }
};

export const hashText32 = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

export const resolveGlobalCacheVersion = (): string => {
  try {
    return (((globalThis as any)?.__CK_CACHE_VERSION__ ?? '') || '').toString().trim();
  } catch {
    return '';
  }
};

export const buildHomeListLocalCacheKey = (formKey: string, listView: any, cacheVersion: string): string => {
  const key = (formKey || '').toString().trim();
  const viewSig = hashText32(JSON.stringify(listView || {}));
  const version = (cacheVersion || '').toString().trim() || 'noversion';
  if (!key) return '';
  return `${HOME_LIST_LOCAL_CACHE_PREFIX}::${version}::${key}::${viewSig}`;
};

export const pruneHomeListLocalCacheFamily = (storage: Storage, key: string): void => {
  if (!key || !key.startsWith(`${HOME_LIST_LOCAL_CACHE_PREFIX}::`)) return;
  const separatorIndex = key.indexOf('::', HOME_LIST_LOCAL_CACHE_PREFIX.length + 2);
  if (separatorIndex < 0) return;
  const familySuffix = key.slice(separatorIndex);
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const candidate = storage.key(i);
    if (!candidate || candidate === key) continue;
    if (!candidate.startsWith(`${HOME_LIST_LOCAL_CACHE_PREFIX}::`)) continue;
    if (!candidate.endsWith(familySuffix)) continue;
    keysToRemove.push(candidate);
  }
  keysToRemove.forEach(candidate => {
    try {
      storage.removeItem(candidate);
    } catch {
      // ignore storage errors
    }
  });
};

export const readHomeListLocalCache = (key: string): HomeListLocalCacheEntry | null => {
  if (!key) return null;
  const storage = resolveLocalStorageSafely();
  if (!storage) return null;
  try {
    pruneHomeListLocalCacheFamily(storage, key);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeListLocalCachePayload;
    const response = (parsed as any)?.response as ListResponse | undefined;
    if (!response || !Array.isArray((response as any).items)) return null;
    const savedAtMs = Number((parsed as any)?.savedAtMs || 0);
    if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return null;
    if (Date.now() - savedAtMs > HOME_LIST_LOCAL_CACHE_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    const homeRevRaw = Number((parsed as any)?.homeRev);
    const homeRev = Number.isFinite(homeRevRaw) && homeRevRaw >= 0 ? homeRevRaw : undefined;
    return { response, homeRev };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // ignore storage errors
    }
    return null;
  }
};

export const writeHomeListLocalCache = (key: string, response: ListResponse, homeRev?: number | null): void => {
  if (!key) return;
  const storage = resolveLocalStorageSafely();
  if (!storage) return;
  try {
    pruneHomeListLocalCacheFamily(storage, key);
    const payload: HomeListLocalCachePayload = {
      savedAtMs: Date.now(),
      response: {
        ...response,
        notModified: undefined
      },
      homeRev: Number.isFinite(Number(homeRev)) ? Number(homeRev) : undefined
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore storage errors (quota/private mode)
  }
};

export const clearHomeListLocalCache = (key: string): void => {
  if (!key) return;
  const storage = resolveLocalStorageSafely();
  if (!storage) return;
  try {
    pruneHomeListLocalCacheFamily(storage, key);
    storage.removeItem(key);
  } catch {
    // ignore storage errors
  }
};
