/**
 * Markdown template cache (Apps Script CacheService) to avoid re-reading Drive templates on every render.
 *
 * Notes:
 * - CacheService has strict size limits (~100KB per entry). We skip caching large templates.
 * - This module is safe in non-Apps Script environments (tests) where CacheService/DriveApp may be undefined.
 */

import { readDriveFileAsString } from '../driveApi';
import { getTemplateCacheEpoch } from './templateCacheEpoch';

const CACHE_PREFIX = 'ck.mdTemplate.v1:'; // keep stable; epoch is appended dynamically
const MAX_CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 hours (CacheService hard cap)
const MAX_CACHE_CHARS = 90_000; // stay under CacheService limits with some headroom

const normalizeCacheTtlSeconds = (ttlSeconds?: number): number => {
  if (ttlSeconds === undefined || ttlSeconds === null) return MAX_CACHE_TTL_SECONDS;
  const n = Number(ttlSeconds);
  if (!Number.isFinite(n) || n <= 0) return MAX_CACHE_TTL_SECONDS;
  // Keep a small floor for sanity; CacheService requires a positive integer.
  return Math.max(30, Math.min(MAX_CACHE_TTL_SECONDS, Math.round(n)));
};

const getScriptCache = (): GoogleAppsScript.Cache.Cache | null => {
  try {
    const svc = (globalThis as any).CacheService;
    if (!svc || typeof svc.getScriptCache !== 'function') return null;
    return svc.getScriptCache();
  } catch (_) {
    return null;
  }
};

export const getMarkdownTemplateCacheKey = (templateId: string): string => {
  const epoch = getTemplateCacheEpoch();
  return `${CACHE_PREFIX}${epoch}:${(templateId || '').toString().trim()}`;
};

export const getCachedMarkdownTemplate = (templateId: string): string | null => {
  const key = getMarkdownTemplateCacheKey(templateId);
  const cache = getScriptCache();
  if (!cache) return null;
  try {
    const v = cache.get(key);
    return v ? v.toString() : null;
  } catch (_) {
    return null;
  }
};

export const setCachedMarkdownTemplate = (templateId: string, raw: string, ttlSeconds?: number): boolean => {
  const key = getMarkdownTemplateCacheKey(templateId);
  const cache = getScriptCache();
  if (!cache) return false;
  const value = (raw || '').toString();
  if (!value.trim()) return false;
  if (value.length > MAX_CACHE_CHARS) return false;
  try {
    cache.put(key, value, normalizeCacheTtlSeconds(ttlSeconds));
    return true;
  } catch (_) {
    return false;
  }
};

export const readMarkdownTemplateRawFromDrive = (
  templateId: string
): { success: boolean; raw?: string; mimeType?: string; message?: string } => {
  const id = (templateId || '').toString().trim();
  if (!id) return { success: false, message: 'templateId is required.' };
  let lastError = '';
  try {
    const file = DriveApp.getFileById(id);
    const mimeType = (file.getMimeType ? file.getMimeType() : '').toString();
    let raw = '';
    try {
      raw = file.getBlob().getDataAsString();
    } catch (_) {
      // ignore; try other exports
    }
    if (!raw && mimeType === 'application/vnd.google-apps.document') {
      try {
        raw = file.getAs('text/plain').getDataAsString();
      } catch (_) {
        // ignore
      }
    }
    if (!raw.trim()) {
      return { success: false, message: 'Template file is empty (or could not be read).', mimeType };
    }
    return { success: true, raw, mimeType };
  } catch (err: any) {
    lastError = (err?.message || err?.toString?.() || 'Failed to read template.').toString();
  }
  const fallback = readDriveFileAsString(id, ['text/plain'], 'markdown.template');
  if (fallback && fallback.raw) {
    return { success: true, raw: fallback.raw, mimeType: fallback.mimeType || 'driveApi' };
  }
  return { success: false, message: lastError || 'Failed to read template.' };
};

export const prefetchMarkdownTemplateIds = (
  templateIds: string[],
  ttlSeconds?: number
): { requested: number; cacheHit: number; loaded: number; skipped: number; failed: number } => {
  const ids = Array.isArray(templateIds)
    ? templateIds.map(id => (id || '').toString().trim()).filter(Boolean)
    : [];
  const unique = Array.from(new Set(ids));
  const requested = unique.length;
  if (!requested) return { requested: 0, cacheHit: 0, loaded: 0, skipped: 0, failed: 0 };

  let cacheHit = 0;
  let loaded = 0;
  let skipped = 0;
  let failed = 0;

  unique.forEach(id => {
    const cached = getCachedMarkdownTemplate(id);
    if (cached && cached.trim()) {
      cacheHit += 1;
      return;
    }
    const res = readMarkdownTemplateRawFromDrive(id);
    if (!res.success || !res.raw) {
      failed += 1;
      return;
    }
    const didCache = setCachedMarkdownTemplate(id, res.raw, ttlSeconds);
    if (!didCache) skipped += 1;
    loaded += 1;
  });

  return { requested, cacheHit, loaded, skipped, failed };
};

