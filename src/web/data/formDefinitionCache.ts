import { WebFormDefinition } from '../types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CACHE_PREFIX = 'ck.formDef.v1::';

const normalizeKeyPart = (value: unknown): string => (value == null ? '' : value.toString()).trim();

export const buildFormDefinitionCacheKey = (formKey: string, cacheVersion: string): string => {
  const normalizedVersion = normalizeKeyPart(cacheVersion);
  const normalizedFormKey = normalizeKeyPart(formKey);
  return `${CACHE_PREFIX}${normalizedVersion}::${normalizedFormKey}`;
};

export const readCachedFormDefinition = (args: {
  storage: StorageLike;
  formKey: string;
  cacheVersion: string;
}): WebFormDefinition | null => {
  const key = buildFormDefinitionCacheKey(args.formKey, args.cacheVersion);
  try {
    const raw = args.storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as WebFormDefinition) : null;
  } catch (_) {
    try {
      args.storage.removeItem(key);
    } catch (_) {
      // ignore
    }
    return null;
  }
};

export const writeCachedFormDefinition = (args: {
  storage: StorageLike;
  formKey: string;
  cacheVersion: string;
  definition: WebFormDefinition;
}): void => {
  const key = buildFormDefinitionCacheKey(args.formKey, args.cacheVersion);
  try {
    args.storage.setItem(key, JSON.stringify(args.definition));
  } catch (_) {
    // ignore localStorage quota and privacy mode errors
  }
};

