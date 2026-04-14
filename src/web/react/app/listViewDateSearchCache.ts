import type { ListItem } from '../api';

export type ListViewDateSearchCacheValue = {
  items: ListItem[];
  totalCount: number;
  etag?: string;
};

type PersistedListViewDateSearchCacheValue = ListViewDateSearchCacheValue & {
  savedAtMs: number;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const LIST_VIEW_DATE_SEARCH_CACHE_PREFIX = 'ck.listDateSearch.v1';
const LIST_VIEW_DATE_SEARCH_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h
const memoryCache = new Map<string, PersistedListViewDateSearchCacheValue>();

const resolveStorage = (): StorageLike | null => {
  try {
    const storage = (globalThis as any)?.localStorage;
    if (!storage) return null;
    if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
      return null;
    }
    return storage as StorageLike;
  } catch (_) {
    return null;
  }
};

const hashText32 = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const normalizeStringArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (v === undefined || v === null ? '' : `${v}`.trim()))
    .filter(Boolean)
    .sort();
};

const isExpired = (savedAtMs: number): boolean => {
  if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return true;
  return Date.now() - savedAtMs > LIST_VIEW_DATE_SEARCH_CACHE_MAX_AGE_MS;
};

const toCacheValue = (value: any): PersistedListViewDateSearchCacheValue | null => {
  const items = Array.isArray(value?.items) ? (value.items as ListItem[]) : null;
  if (!items) return null;
  const totalCountRaw = Number(value?.totalCount ?? items.length);
  const totalCount = Number.isFinite(totalCountRaw) && totalCountRaw >= 0 ? totalCountRaw : items.length;
  const savedAtMs = Number(value?.savedAtMs || 0);
  if (isExpired(savedAtMs)) return null;
  const etag = ((value?.etag ?? '') || '').toString().trim() || undefined;
  return { items, totalCount, savedAtMs, etag };
};

export const buildListViewDateSearchCacheKey = (args: {
  formKey: string;
  dateFieldId: string;
  dateValue: string;
  projection?: string[];
  sortField?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  etag?: string | null;
  cacheVersion?: string | null;
}): string => {
  const signature = {
    formKey: (args.formKey || '').toString().trim(),
    dateFieldId: (args.dateFieldId || '').toString().trim(),
    dateValue: (args.dateValue || '').toString().trim(),
    projection: normalizeStringArray(args.projection),
    sortField: ((args.sortField ?? '') || '').toString().trim(),
    sortDirection: ((args.sortDirection ?? '') || '').toString().trim().toLowerCase(),
    etag: ((args.etag ?? '') || '').toString().trim(),
    cacheVersion: ((args.cacheVersion ?? '') || '').toString().trim()
  };
  return `${LIST_VIEW_DATE_SEARCH_CACHE_PREFIX}.${hashText32(JSON.stringify(signature))}`;
};

export const readCachedListViewDateSearch = (key: string): ListViewDateSearchCacheValue | null => {
  if (!key) return null;
  const memoryHit = toCacheValue(memoryCache.get(key));
  if (memoryHit) {
    return { items: memoryHit.items, totalCount: memoryHit.totalCount, etag: memoryHit.etag };
  }
  memoryCache.delete(key);

  const storage = resolveStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const value = toCacheValue(parsed);
    if (!value) {
      storage.removeItem(key);
      return null;
    }
    memoryCache.set(key, value);
    return { items: value.items, totalCount: value.totalCount, etag: value.etag };
  } catch (_) {
    try {
      storage.removeItem(key);
    } catch (_) {
      // ignore broken persisted entries
    }
    return null;
  }
};

export const writeCachedListViewDateSearch = (key: string, value: ListViewDateSearchCacheValue): void => {
  if (!key) return;
  const payload: PersistedListViewDateSearchCacheValue = {
    items: Array.isArray(value.items) ? value.items : [],
    totalCount: Number.isFinite(Number(value.totalCount)) ? Number(value.totalCount) : Array.isArray(value.items) ? value.items.length : 0,
    etag: ((value.etag ?? '') || '').toString().trim() || undefined,
    savedAtMs: Date.now()
  };
  memoryCache.set(key, payload);
  const storage = resolveStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch (_) {
    // Ignore storage quota/private mode failures; memory cache still works.
  }
};

export const clearListViewDateSearchCache = (): void => {
  memoryCache.clear();
  const storage = resolveStorage();
  if (!storage) return;
  try {
    const candidate = storage as Storage & { key?: (index: number) => string | null; length?: number };
    const length = typeof candidate.length === 'number' ? candidate.length : 0;
    if (typeof candidate.key !== 'function' || length <= 0) return;
    const keys: string[] = [];
    for (let i = 0; i < length; i += 1) {
      const key = candidate.key(i);
      if (key && key.startsWith(LIST_VIEW_DATE_SEARCH_CACHE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(key => storage.removeItem(key));
  } catch (_) {
    // ignore
  }
};
