import type { WebFormSubmission } from '../../types';
import type { ListResponse } from '../api';
import { hashText32 } from './homeListLocalCache';

/**
 * Browser-local cache for exact date-search list responses.
 *
 * This cache intentionally stays separate from the home-list cache: home list
 * bootstrap represents the initial list window, while this module stores
 * user-requested historical date windows.
 */
export const DATE_SEARCH_LOCAL_CACHE_PREFIX = 'ck.listSearch.v1';
export const DATE_SEARCH_LOCAL_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const DATE_SEARCH_LOCAL_CACHE_MAX_ENTRIES = 90;

export type DateSearchCacheDescriptor = {
  dateFieldId: string;
  dateEquals: string;
  projection?: string[];
  sortField?: string | null;
  sortDirection?: string | null;
};

type DateSearchLocalCachePayload = {
  savedAtMs: number;
  descriptor: DateSearchCacheDescriptor;
  response: ListResponse;
  records?: Record<string, WebFormSubmission>;
};

export type DateSearchLocalCacheEntry = {
  response: ListResponse;
  records: Record<string, WebFormSubmission>;
};

const encodeKeyPart = (value: any): string => encodeURIComponent((value || 'default').toString()).replace(/\./g, '%2E');

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

const normalizeDescriptor = (descriptor: DateSearchCacheDescriptor): DateSearchCacheDescriptor => ({
  dateFieldId: (descriptor.dateFieldId || '').toString().trim(),
  dateEquals: (descriptor.dateEquals || '').toString().trim(),
  projection: Array.from(new Set((descriptor.projection || []).map(v => (v || '').toString().trim()).filter(Boolean))).sort(),
  sortField: (descriptor.sortField || '').toString().trim() || null,
  sortDirection: (descriptor.sortDirection || '').toString().trim() || null
});

const descriptorsMatch = (a: DateSearchCacheDescriptor, b: DateSearchCacheDescriptor): boolean =>
  JSON.stringify(normalizeDescriptor(a)) === JSON.stringify(normalizeDescriptor(b));

const buildListViewSignature = (listView: any): string => hashText32(JSON.stringify(listView || {}));

const buildFamilyMarker = (formKey: string, listView: any): string =>
  `::${encodeKeyPart(formKey)}::${buildListViewSignature(listView)}::`;

export const buildDateSearchLocalCacheKey = (args: {
  formKey: string;
  listView: any;
  cacheVersion: string;
  descriptor: DateSearchCacheDescriptor;
}): string => {
  const form = (args.formKey || '').toString().trim();
  const version = (args.cacheVersion || '').toString().trim() || 'noversion';
  const descriptor = normalizeDescriptor(args.descriptor);
  if (!form || !descriptor.dateFieldId || !descriptor.dateEquals) return '';
  const querySig = hashText32(JSON.stringify(descriptor));
  return `${DATE_SEARCH_LOCAL_CACHE_PREFIX}::${encodeKeyPart(version)}::${encodeKeyPart(form)}::${buildListViewSignature(
    args.listView
  )}::${querySig}`;
};

const pruneDateSearchLocalCacheFamily = (args: {
  storage: Storage;
  formKey: string;
  listView: any;
  cacheVersion: string;
  nowMs: number;
}): void => {
  const marker = buildFamilyMarker(args.formKey, args.listView);
  const activePrefix = `${DATE_SEARCH_LOCAL_CACHE_PREFIX}::${encodeKeyPart(args.cacheVersion || 'noversion')}${marker}`;
  const entries: Array<{ key: string; savedAtMs: number }> = [];
  const removeKeys: string[] = [];

  for (let i = 0; i < args.storage.length; i += 1) {
    const key = args.storage.key(i);
    if (!key || !key.startsWith(`${DATE_SEARCH_LOCAL_CACHE_PREFIX}::`)) continue;
    if (!key.includes(marker)) continue;
    if (!key.startsWith(activePrefix)) {
      removeKeys.push(key);
      continue;
    }
    try {
      const parsed = JSON.parse(args.storage.getItem(key) || '');
      const savedAtMs = Number(parsed?.savedAtMs || 0);
      if (!Number.isFinite(savedAtMs) || savedAtMs <= 0 || args.nowMs - savedAtMs > DATE_SEARCH_LOCAL_CACHE_MAX_AGE_MS) {
        removeKeys.push(key);
        continue;
      }
      entries.push({ key, savedAtMs });
    } catch {
      removeKeys.push(key);
    }
  }

  entries
    .sort((a, b) => b.savedAtMs - a.savedAtMs)
    .slice(DATE_SEARCH_LOCAL_CACHE_MAX_ENTRIES)
    .forEach(entry => removeKeys.push(entry.key));

  removeKeys.forEach(key => {
    try {
      args.storage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  });
};

export const readDateSearchLocalCache = (args: {
  formKey: string;
  listView: any;
  cacheVersion: string;
  descriptor: DateSearchCacheDescriptor;
}): DateSearchLocalCacheEntry | null => {
  const key = buildDateSearchLocalCacheKey(args);
  if (!key) return null;
  const storage = resolveLocalStorageSafely();
  if (!storage) return null;
  const nowMs = Date.now();
  try {
    pruneDateSearchLocalCacheFamily({ ...args, storage, nowMs });
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DateSearchLocalCachePayload;
    const response = parsed?.response;
    if (!response || !Array.isArray((response as any).items)) return null;
    const savedAtMs = Number((parsed as any)?.savedAtMs || 0);
    if (!Number.isFinite(savedAtMs) || savedAtMs <= 0 || nowMs - savedAtMs > DATE_SEARCH_LOCAL_CACHE_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    if (!parsed?.descriptor || !descriptorsMatch(parsed.descriptor, args.descriptor)) return null;
    const records = parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
    return { response, records };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // ignore storage errors
    }
    return null;
  }
};

export const writeDateSearchLocalCache = (args: {
  formKey: string;
  listView: any;
  cacheVersion: string;
  descriptor: DateSearchCacheDescriptor;
  response: ListResponse;
  records?: Record<string, WebFormSubmission>;
}): void => {
  const key = buildDateSearchLocalCacheKey(args);
  if (!key || !args.response || !Array.isArray((args.response as any).items)) return;
  const storage = resolveLocalStorageSafely();
  if (!storage) return;
  try {
    pruneDateSearchLocalCacheFamily({ ...args, storage, nowMs: Date.now() });
    const payload: DateSearchLocalCachePayload = {
      savedAtMs: Date.now(),
      descriptor: normalizeDescriptor(args.descriptor),
      response: {
        ...args.response,
        notModified: undefined
      },
      records: args.records || {}
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore storage quota/private-mode failures
  }
};

export const clearDateSearchLocalCacheFamily = (args: { formKey: string; listView: any }): void => {
  const storage = resolveLocalStorageSafely();
  if (!storage) return;
  const marker = buildFamilyMarker(args.formKey, args.listView);
  const removeKeys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(`${DATE_SEARCH_LOCAL_CACHE_PREFIX}::`) && key.includes(marker)) removeKeys.push(key);
    }
    removeKeys.forEach(key => {
      try {
        storage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    });
  } catch {
    // ignore storage errors
  }
};
