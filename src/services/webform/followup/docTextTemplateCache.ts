import { debugLog } from '../debug';
import { isLikelyBinaryDriveString } from '../driveApi';
import { readDriveTemplateRawWithFallback } from './docRenderer.copy';
import { getTemplateCacheEpoch } from './templateCacheEpoch';

const CACHE_PREFIX = 'ck.docTextTemplate.v1:';
const MAX_CACHE_TTL_SECONDS = 60 * 60 * 6;
const MAX_CACHE_CHARS = 90_000;

const normalizeCacheTtlSeconds = (ttlSeconds?: number): number => {
  if (ttlSeconds === undefined || ttlSeconds === null) return MAX_CACHE_TTL_SECONDS;
  const n = Number(ttlSeconds);
  if (!Number.isFinite(n) || n <= 0) return MAX_CACHE_TTL_SECONDS;
  return Math.max(30, Math.min(MAX_CACHE_TTL_SECONDS, Math.round(n)));
};

const getScriptCache = (): GoogleAppsScript.Cache.Cache | null => {
  try {
    const svc = (globalThis as any).CacheService;
    if (!svc || typeof svc.getScriptCache !== 'function') return null;
    return svc.getScriptCache();
  } catch {
    return null;
  }
};

const isBundledTemplateId = (templateId: string): boolean =>
  (templateId || '').toString().trim().toLowerCase().startsWith('bundle:');

export const getDocTextTemplateCacheKey = (templateId: string): string => {
  const epoch = getTemplateCacheEpoch();
  return `${CACHE_PREFIX}${epoch}:${(templateId || '').toString().trim()}`;
};

export const getCachedDocTextTemplate = (templateId: string): string | null => {
  const cache = getScriptCache();
  if (!cache) return null;
  try {
    const value = cache.get(getDocTextTemplateCacheKey(templateId));
    return value ? value.toString() : null;
  } catch {
    return null;
  }
};

export const setCachedDocTextTemplate = (templateId: string, raw: string, ttlSeconds?: number): boolean => {
  const cache = getScriptCache();
  if (!cache) return false;
  const value = (raw || '').toString();
  if (!value.trim()) return false;
  if (value.length > MAX_CACHE_CHARS) return false;
  try {
    cache.put(getDocTextTemplateCacheKey(templateId), value, normalizeCacheTtlSeconds(ttlSeconds));
    return true;
  } catch {
    return false;
  }
};

export const readDocTextTemplateBody = (
  templateId: string,
  ttlSeconds?: number
): { success: boolean; raw?: string; cacheHit?: boolean; message?: string } => {
  const id = (templateId || '').toString().trim();
  if (!id) return { success: false, message: 'templateId is required.' };
  if (isBundledTemplateId(id)) {
    return { success: false, message: 'Bundled templates are not supported for Doc text templates.' };
  }

  const cached = getCachedDocTextTemplate(id);
  if (cached && cached.trim()) {
    if (!isLikelyBinaryDriveString(cached)) {
      debugLog('followup.docTextTemplate.cacheHit', { templateId: id });
      return { success: true, raw: cached, cacheHit: true };
    }
    debugLog('followup.docTextTemplate.cacheIgnoredBinary', { templateId: id });
  }

  const loaded = readDriveTemplateRawWithFallback(id, ['text/plain'], 'followup.docTextTemplate');
  let raw = (loaded?.raw || '').toString();
  if (raw && isLikelyBinaryDriveString(raw)) {
    debugLog('followup.docTextTemplate.ignoredBinaryRead', {
      templateId: id,
      mimeType: loaded?.mimeType || null
    });
    raw = '';
  }
  let openedDoc = false;
  if (!raw.trim()) {
    try {
      const doc = DocumentApp.openById(id);
      openedDoc = true;
      raw = (doc.getBody().getText() || '').toString();
    } catch {
      raw = '';
    }
  }
  if (!raw.trim()) {
    if (openedDoc) {
      return { success: true, raw, cacheHit: false };
    }
    return { success: false, message: 'Template file is empty (or could not be read).' };
  }
  const didCache = setCachedDocTextTemplate(id, raw, ttlSeconds);
  debugLog('followup.docTextTemplate.cacheMiss', {
    templateId: id,
    mimeType: loaded?.mimeType || null,
    cached: didCache
  });
  return { success: true, raw, cacheHit: false };
};

export const prefetchDocTextTemplateIds = (
  templateIds: string[],
  ttlSeconds?: number
): { requested: number; cacheHit: number; loaded: number; skipped: number; failed: number } => {
  const ids = Array.isArray(templateIds)
    ? templateIds.map(id => (id || '').toString().trim()).filter(Boolean)
    : [];
  const unique = Array.from(new Set(ids.filter(id => !isBundledTemplateId(id))));
  const requested = unique.length;
  if (!requested) return { requested: 0, cacheHit: 0, loaded: 0, skipped: 0, failed: 0 };

  let cacheHit = 0;
  let loaded = 0;
  let skipped = 0;
  let failed = 0;

  unique.forEach(id => {
    const cached = getCachedDocTextTemplate(id);
    if (cached && cached.trim()) {
      cacheHit += 1;
      return;
    }
    const res = readDocTextTemplateBody(id, ttlSeconds);
    if (!res.success || !res.raw) {
      failed += 1;
      return;
    }
    loaded += 1;
    if (!getCachedDocTextTemplate(id)) skipped += 1;
  });

  return { requested, cacheHit, loaded, skipped, failed };
};
