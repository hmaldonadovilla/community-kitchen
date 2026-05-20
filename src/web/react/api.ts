import {
  AnalyticsSnapshot,
  DataSourceConfig,
  FollowupActionResult,
  FormConfigExport,
  GuidedStepUtilisationDraftSyncRequest,
  GuidedStepUtilisationDraftSyncResult,
  BankUtilisationPlanRequest,
  BankUtilisationPlanResult,
  BankUtilisationMutationRequest,
  BankUtilisationMutationResult,
  PaginatedResult,
  TemplateIdMap,
  WebFormDefinition,
  WebFormSubmission
} from '../../types';
import type {
  AnalyticsDashboardPayload,
  QueueAnalyticsPipelineRequest,
  QueueAnalyticsPipelineResult
} from '../../config/analyticsPageTypes';
import { LangCode } from '../types';
import { normalizeLanguage } from '../core/options';
import { tSystem } from '../systemStrings';
import { isGlobalPerfInstrumentationEnabled } from './perfInstrumentation';
import { clearFetchDataSourceCache, configureDataSourceFetcher } from '../data/dataSources';

declare const google: any;

export interface SubmissionPayload {
  formKey: string;
  language: LangCode;
  values: Record<string, any>;
  id?: string;
  [fieldId: string]: any;
}

export interface SubmissionResult {
  success: boolean;
  message?: string;
  meta?: {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    dataVersion?: number;
    rowNumber?: number;
    operation?: 'create' | 'update' | 'noop';
    noop?: boolean;
    noopReason?: string;
  };
}

export interface UpdateRecordDependencyPreviewResult {
  success: boolean;
  impactedCount?: number;
  targetFormKey?: string;
  mode?: 'confirm' | 'block';
  blocked?: boolean;
  dialog?: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    showCancel?: boolean;
    showConfirm?: boolean;
    primaryAction?: 'confirm' | 'cancel';
    dismissOnBackdrop?: boolean;
    showCloseButton?: boolean;
  };
  message?: string;
}

export interface UpdateRecordDependencyApplyResult extends SubmissionResult {
  dependency?: {
    targetFormKey?: string;
    impactedCount?: number;
    updatedCount?: number;
    blocked?: boolean;
    rollbackFailed?: boolean;
  };
}

export interface DedupConflictCheckResult {
  success: boolean;
  conflict?: {
    ruleId: string;
    message: string;
    existingRecordId?: string;
    existingRowNumber?: number;
  };
  message?: string;
}

export interface ListItem {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  pdfUrl?: string;
  [fieldId: string]: any;
}

export interface ListResponse extends PaginatedResult<ListItem> {
  etag?: string;
  notModified?: boolean;
  contiguousItemCount?: number;
  completeData?: boolean;
  dateFilterFieldId?: string;
  dateFilterEquals?: string;
  dateFilterFrom?: string;
  dateFilterTo?: string;
}

export interface BatchResponse {
  list: ListResponse;
  records: Record<string, WebFormSubmission>;
}

export type ListSort = {
  fieldId?: string;
  direction?: 'asc' | 'desc';
  __ifNoneMatch?: boolean;
  __clientEtag?: string;
  __dateFieldId?: string;
  __dateEquals?: string;
  __dateFrom?: string;
  __dateTo?: string;
};

export interface DataSourceRequest {
  source: DataSourceConfig;
  locale?: LangCode;
  projection?: string[];
  limit?: number;
  pageToken?: string;
}

export interface DataSourceResponse {
  items: any[];
  nextPageToken?: string;
  totalCount?: number;
}

export interface UploadFilesResult {
  success: boolean;
  urls: string;
  message?: string;
}

export interface RenderDocTemplateResult {
  success: boolean;
  pdfUrl?: string;
  fileId?: string;
  message?: string;
}

export interface RenderDocTemplatePdfPreviewResult {
  success: boolean;
  pdfBase64?: string;
  mimeType?: string;
  fileName?: string;
  message?: string;
}

export interface RenderMarkdownTemplateResult {
  success: boolean;
  markdown?: string;
  message?: string;
}

export interface RenderHtmlTemplateResult {
  success: boolean;
  html?: string;
  fileName?: string;
  message?: string;
}

export interface FetchSummaryRecordResult extends RenderHtmlTemplateResult {
  record?: WebFormSubmission | null;
}

export type TemplateRenderCacheScope = 'record' | 'template' | 'none';

export interface TemplateRenderCacheOptions {
  /**
   * record: include record id + draft values + record meta in the cache key.
   * template: include only form/language/button/template id; use only for static templates.
   * none: bypass the client render-result cache.
   */
  cacheScope?: TemplateRenderCacheScope | string | null;
  templateId?: string | null;
}

export interface FollowupBatchResponse {
  success: boolean;
  results: Array<{ action: string; result: FollowupActionResult }>;
}

export type FollowupBatchOptions = {
  emailDispatchMode?: 'direct' | 'queued';
};

// ----------------------------
// Client-side HTML render cache
// ----------------------------
// Goal: avoid re-calling Apps Script when reopening the same record/template with the same values.
// Successful renders are also persisted under the app cache version so browser refreshes can reuse them safely.

type HtmlRenderCacheEntry = { result: RenderHtmlTemplateResult; cachedAtMs: number };
type MarkdownRenderCacheEntry = { result: RenderMarkdownTemplateResult; cachedAtMs: number };

const MAX_HTML_RENDER_CACHE_ENTRIES = 40;
const HTML_RENDER_PERSIST_PREFIX = 'ck.htmlRender.v1';
const HTML_RENDER_PERSIST_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_MARKDOWN_RENDER_CACHE_ENTRIES = 40;
const MARKDOWN_RENDER_PERSIST_PREFIX = 'ck.markdownRender.v1';
const MARKDOWN_RENDER_PERSIST_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const htmlRenderCache = new Map<string, HtmlRenderCacheEntry>();
const htmlRenderInflight = new Map<string, Promise<RenderHtmlTemplateResult>>();
const markdownRenderCache = new Map<string, MarkdownRenderCacheEntry>();
const markdownRenderInflight = new Map<string, Promise<RenderMarkdownTemplateResult>>();

const encodeHtmlCacheKeyPart = (value: any): string => encodeURIComponent((value || 'default').toString()).replace(/\./g, '%2E');

const resolveHtmlRenderCacheVersion = (): string => {
  try {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    const raw = (win?.__CK_CACHE_VERSION__ || (globalThis as any)?.__CK_CACHE_VERSION__ || 'default').toString().trim();
    return raw || 'default';
  } catch {
    return 'default';
  }
};

const resolveHtmlRenderStorage = (): Storage | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    const storage = (globalThis as any)?.localStorage;
    return storage || null;
  } catch {
    return null;
  }
};

const pruneHtmlRenderCache = () => {
  if (htmlRenderCache.size <= MAX_HTML_RENDER_CACHE_ENTRIES) return;
  // Simple FIFO eviction based on insertion order.
  const toEvict = htmlRenderCache.size - MAX_HTML_RENDER_CACHE_ENTRIES;
  let evicted = 0;
  for (const key of htmlRenderCache.keys()) {
    htmlRenderCache.delete(key);
    evicted += 1;
    if (evicted >= toEvict) break;
  }
};

const pruneMarkdownRenderCache = () => {
  if (markdownRenderCache.size <= MAX_MARKDOWN_RENDER_CACHE_ENTRIES) return;
  const toEvict = markdownRenderCache.size - MAX_MARKDOWN_RENDER_CACHE_ENTRIES;
  let evicted = 0;
  for (const key of markdownRenderCache.keys()) {
    markdownRenderCache.delete(key);
    evicted += 1;
    if (evicted >= toEvict) break;
  }
};

const stableStringifyForCacheKey = (value: any): string => {
  const seen = new WeakSet<object>();
  const normalize = (v: any): any => {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (t === 'object') {
      // Avoid cycles; payloads should be acyclic, but be defensive.
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      try {
        if (typeof (v as any).toJSON === 'function') return normalize((v as any).toJSON());
      } catch (_) {
        // ignore
      }
      const out: Record<string, any> = {};
      Object.keys(v)
        .sort()
        .forEach(k => {
          out[k] = normalize((v as any)[k]);
        });
      return out;
    }
    // Fallback for functions/symbols/bigints (should not happen in payloads)
    try {
      return String(v);
    } catch {
      return '';
    }
  };
  return JSON.stringify(normalize(value));
};

const fnv1a32 = (str: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const buildPersistedHtmlRenderCacheKey = (key: string, cacheVersion = resolveHtmlRenderCacheVersion()): string =>
  `${HTML_RENDER_PERSIST_PREFIX}.${encodeHtmlCacheKeyPart(cacheVersion)}.${fnv1a32(key)}`;

const buildPersistedMarkdownRenderCacheKey = (key: string, cacheVersion = resolveHtmlRenderCacheVersion()): string =>
  `${MARKDOWN_RENDER_PERSIST_PREFIX}.${encodeHtmlCacheKeyPart(cacheVersion)}.${fnv1a32(key)}`;

const normalizeTemplateScopedButtonCacheId = (buttonId: string): string => {
  const raw = (buttonId || '').toString();
  const idxToken = '__ckQIdx=';
  const idxPos = raw.lastIndexOf(idxToken);
  if (idxPos < 0) return raw;
  const idxRaw = raw.slice(idxPos + idxToken.length);
  const idx = Number.parseInt(idxRaw, 10);
  return Number.isFinite(idx) ? raw.slice(0, idxPos) : raw;
};

const normalizeTemplateRenderCacheScope = (value: any): TemplateRenderCacheScope => {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'template' || normalized === 'static') return 'template';
  if (normalized === 'none' || normalized === 'off' || normalized === 'disabled') return 'none';
  return 'record';
};

const shouldUseTemplateRenderCache = (options?: TemplateRenderCacheOptions | null): boolean =>
  normalizeTemplateRenderCacheScope(options?.cacheScope) !== 'none';

const buildTemplateScopedButtonCacheKey = (
  kind: 'html' | 'markdown',
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): string => {
  const templateId = (options?.templateId || '').toString().trim();
  const templateSig = templateId ? fnv1a32(templateId) : 'notemplate';
  return `button|${kind}|template|${payload.formKey}|${payload.language}|${normalizeTemplateScopedButtonCacheId(buttonId)}|${templateSig}`;
};

const prunePersistedHtmlRenderCache = (storage: Storage, cacheVersion = resolveHtmlRenderCacheVersion()): void => {
  const activePrefix = `${HTML_RENDER_PERSIST_PREFIX}.${encodeHtmlCacheKeyPart(cacheVersion)}.`;
  const entries: Array<{ key: string; savedAtMs: number }> = [];
  const removeKeys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const candidate = storage.key(i);
    if (!candidate || !candidate.startsWith(`${HTML_RENDER_PERSIST_PREFIX}.`)) continue;
    if (!candidate.startsWith(activePrefix)) {
      removeKeys.push(candidate);
      continue;
    }
    try {
      const parsed = JSON.parse(storage.getItem(candidate) || '');
      const savedAtMs = Number(parsed?.cachedAtMs || 0);
      if (!Number.isFinite(savedAtMs) || savedAtMs <= 0 || Date.now() - savedAtMs > HTML_RENDER_PERSIST_MAX_AGE_MS) {
        removeKeys.push(candidate);
        continue;
      }
      entries.push({ key: candidate, savedAtMs });
    } catch {
      removeKeys.push(candidate);
    }
  }
  entries
    .sort((a, b) => b.savedAtMs - a.savedAtMs)
    .slice(MAX_HTML_RENDER_CACHE_ENTRIES)
    .forEach(entry => removeKeys.push(entry.key));
  removeKeys.forEach(candidate => {
    try {
      storage.removeItem(candidate);
    } catch {
      // ignore
    }
  });
};

const readPersistedHtmlRenderCache = (key: string): HtmlRenderCacheEntry | null => {
  const storage = resolveHtmlRenderStorage();
  if (!storage) return null;
  const storageKey = buildPersistedHtmlRenderCacheKey(key);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.key !== key) return null;
    const cachedAtMs = Number(parsed.cachedAtMs || 0);
    if (!Number.isFinite(cachedAtMs) || cachedAtMs <= 0 || Date.now() - cachedAtMs > HTML_RENDER_PERSIST_MAX_AGE_MS) {
      storage.removeItem(storageKey);
      return null;
    }
    const result = parsed.result as RenderHtmlTemplateResult | null;
    if (!result?.success || !result.html) return null;
    return { result, cachedAtMs };
  } catch {
    try {
      storage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return null;
  }
};

const writePersistedHtmlRenderCache = (key: string, entry: HtmlRenderCacheEntry): void => {
  const storage = resolveHtmlRenderStorage();
  if (!storage) return;
  try {
    prunePersistedHtmlRenderCache(storage);
    storage.setItem(
      buildPersistedHtmlRenderCacheKey(key),
      JSON.stringify({
        key,
        cachedAtMs: entry.cachedAtMs,
        cacheVersion: resolveHtmlRenderCacheVersion(),
        result: entry.result
      })
    );
  } catch {
    // ignore storage quota/private-mode failures
  }
};

const removePersistedHtmlRenderCache = (): void => {
  const storage = resolveHtmlRenderStorage();
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const candidate = storage.key(i);
      if (candidate?.startsWith(`${HTML_RENDER_PERSIST_PREFIX}.`)) keys.push(candidate);
    }
    keys.forEach(candidate => {
      try {
        storage.removeItem(candidate);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
};

const prunePersistedMarkdownRenderCache = (storage: Storage, cacheVersion = resolveHtmlRenderCacheVersion()): void => {
  const activePrefix = `${MARKDOWN_RENDER_PERSIST_PREFIX}.${encodeHtmlCacheKeyPart(cacheVersion)}.`;
  const entries: Array<{ key: string; savedAtMs: number }> = [];
  const removeKeys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const candidate = storage.key(i);
    if (!candidate || !candidate.startsWith(`${MARKDOWN_RENDER_PERSIST_PREFIX}.`)) continue;
    if (!candidate.startsWith(activePrefix)) {
      removeKeys.push(candidate);
      continue;
    }
    try {
      const parsed = JSON.parse(storage.getItem(candidate) || '');
      const savedAtMs = Number(parsed?.cachedAtMs || 0);
      if (!Number.isFinite(savedAtMs) || savedAtMs <= 0 || Date.now() - savedAtMs > MARKDOWN_RENDER_PERSIST_MAX_AGE_MS) {
        removeKeys.push(candidate);
        continue;
      }
      entries.push({ key: candidate, savedAtMs });
    } catch {
      removeKeys.push(candidate);
    }
  }
  entries
    .sort((a, b) => b.savedAtMs - a.savedAtMs)
    .slice(MAX_MARKDOWN_RENDER_CACHE_ENTRIES)
    .forEach(entry => removeKeys.push(entry.key));
  removeKeys.forEach(candidate => {
    try {
      storage.removeItem(candidate);
    } catch {
      // ignore
    }
  });
};

const readPersistedMarkdownRenderCache = (key: string): MarkdownRenderCacheEntry | null => {
  const storage = resolveHtmlRenderStorage();
  if (!storage) return null;
  const storageKey = buildPersistedMarkdownRenderCacheKey(key);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.key !== key) return null;
    const cachedAtMs = Number(parsed.cachedAtMs || 0);
    if (!Number.isFinite(cachedAtMs) || cachedAtMs <= 0 || Date.now() - cachedAtMs > MARKDOWN_RENDER_PERSIST_MAX_AGE_MS) {
      storage.removeItem(storageKey);
      return null;
    }
    const result = parsed.result as RenderMarkdownTemplateResult | null;
    if (!result?.success || !result.markdown) return null;
    return { result, cachedAtMs };
  } catch {
    try {
      storage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return null;
  }
};

const writePersistedMarkdownRenderCache = (key: string, entry: MarkdownRenderCacheEntry): void => {
  const storage = resolveHtmlRenderStorage();
  if (!storage) return;
  try {
    prunePersistedMarkdownRenderCache(storage);
    storage.setItem(
      buildPersistedMarkdownRenderCacheKey(key),
      JSON.stringify({
        key,
        cachedAtMs: entry.cachedAtMs,
        cacheVersion: resolveHtmlRenderCacheVersion(),
        result: entry.result
      })
    );
  } catch {
    // ignore storage quota/private-mode failures
  }
};

const removePersistedMarkdownRenderCache = (): void => {
  const storage = resolveHtmlRenderStorage();
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const candidate = storage.key(i);
      if (candidate?.startsWith(`${MARKDOWN_RENDER_PERSIST_PREFIX}.`)) keys.push(candidate);
    }
    keys.forEach(candidate => {
      try {
        storage.removeItem(candidate);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
};

const getHtmlRenderCacheEntry = (key: string): HtmlRenderCacheEntry | null => {
  const memoryHit = htmlRenderCache.get(key);
  if (memoryHit?.result?.success && memoryHit.result.html) return memoryHit;
  const persistedHit = readPersistedHtmlRenderCache(key);
  if (!persistedHit) return null;
  htmlRenderCache.set(key, persistedHit);
  pruneHtmlRenderCache();
  return persistedHit;
};

const setHtmlRenderCacheEntry = (key: string, result: RenderHtmlTemplateResult): void => {
  if (!result?.success || !result.html) return;
  const entry = { result, cachedAtMs: Date.now() };
  htmlRenderCache.set(key, entry);
  pruneHtmlRenderCache();
  writePersistedHtmlRenderCache(key, entry);
};

const getMarkdownRenderCacheEntry = (key: string): MarkdownRenderCacheEntry | null => {
  const memoryHit = markdownRenderCache.get(key);
  if (memoryHit?.result?.success && memoryHit.result.markdown) return memoryHit;
  const persistedHit = readPersistedMarkdownRenderCache(key);
  if (!persistedHit) return null;
  markdownRenderCache.set(key, persistedHit);
  pruneMarkdownRenderCache();
  return persistedHit;
};

const setMarkdownRenderCacheEntry = (key: string, result: RenderMarkdownTemplateResult): void => {
  if (!result?.success || !result.markdown) return;
  const entry = { result, cachedAtMs: Date.now() };
  markdownRenderCache.set(key, entry);
  pruneMarkdownRenderCache();
  writePersistedMarkdownRenderCache(key, entry);
};

const buildValuesSignature = (values: Record<string, any> | undefined | null): string => {
  if (!values) return '0';
  // Exclude redundant `*_json` keys (line-item serialization duplicates) to keep hashing cheaper.
  const compact: Record<string, any> = {};
  Object.keys(values).forEach(k => {
    if (k && k.endsWith('_json')) return;
    compact[k] = (values as any)[k];
  });
  return fnv1a32(stableStringifyForCacheKey(compact));
};

const buildMetaSignature = (payload: SubmissionPayload): string => {
  const meta = {
    status: payload.status || '',
    createdAt: payload.createdAt || '',
    updatedAt: payload.updatedAt || '',
    pdfUrl: payload.pdfUrl || ''
  };
  return fnv1a32(stableStringifyForCacheKey(meta));
};

const buildSummaryHtmlCacheKey = (payload: SubmissionPayload): string => {
  const recordId = (payload.id || '').toString();
  const valuesSig = buildValuesSignature(payload.values);
  const metaSig = buildMetaSignature(payload);
  return `summary|${payload.formKey}|${payload.language}|${recordId}|${valuesSig}|${metaSig}`;
};

const buildButtonHtmlCacheKey = (
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): string => {
  if (normalizeTemplateRenderCacheScope(options?.cacheScope) === 'template') {
    return buildTemplateScopedButtonCacheKey('html', payload, buttonId, options);
  }
  const recordId = (payload.id || '').toString();
  const valuesSig = buildValuesSignature(payload.values);
  const metaSig = buildMetaSignature(payload);
  return `button|${payload.formKey}|${payload.language}|${recordId}|${buttonId}|${valuesSig}|${metaSig}`;
};

const buildButtonMarkdownCacheKey = (
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): string => {
  if (normalizeTemplateRenderCacheScope(options?.cacheScope) === 'template') {
    return buildTemplateScopedButtonCacheKey('markdown', payload, buttonId, options);
  }
  const recordId = (payload.id || '').toString();
  const valuesSig = buildValuesSignature(payload.values);
  const metaSig = buildMetaSignature(payload);
  return `button|markdown|${payload.formKey}|${payload.language}|${recordId}|${buttonId}|${valuesSig}|${metaSig}`;
};

const buildInlineHtmlCacheKey = (
  payload: SubmissionPayload,
  templateIdMap: TemplateIdMap,
  cacheKeySuffix?: string
): string => {
  const recordId = (payload.id || '').toString();
  if (cacheKeySuffix) {
    // Scoped inline renders, such as overlay detail previews, pass a semantic
    // content signature. Do not include the full draft payload here: unrelated
    // autosave/source-sync churn can otherwise trigger a second server render
    // for the same visible overlay content.
    return `inline|scoped|${payload.formKey}|${payload.language}|${recordId}|${cacheKeySuffix}`;
  }
  return `inline|${buildSummaryHtmlCacheKey(payload)}|${stableStringifyForCacheKey(templateIdMap || null)}`;
};

export const peekSummaryHtmlTemplateCache = (payload: SubmissionPayload): RenderHtmlTemplateResult | null => {
  const key = buildSummaryHtmlCacheKey(payload);
  const hit = getHtmlRenderCacheEntry(key);
  if (!hit?.result?.success || !hit?.result?.html) return null;
  return hit.result;
};

export const seedSummaryHtmlTemplateCache = (
  payload: SubmissionPayload,
  result: RenderHtmlTemplateResult | null | undefined
): void => {
  if (!result?.success || !result?.html) return;
  const key = buildSummaryHtmlCacheKey(payload);
  htmlRenderInflight.delete(key);
  setHtmlRenderCacheEntry(key, result);
};

export const peekHtmlTemplateCache = (
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): RenderHtmlTemplateResult | null => {
  if (!shouldUseTemplateRenderCache(options)) return null;
  const key = buildButtonHtmlCacheKey(payload, buttonId, options);
  const hit = getHtmlRenderCacheEntry(key);
  if (!hit?.result?.success || !hit?.result?.html) return null;
  return hit.result;
};

export const peekMarkdownTemplateCache = (
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): RenderMarkdownTemplateResult | null => {
  if (!shouldUseTemplateRenderCache(options)) return null;
  const key = buildButtonMarkdownCacheKey(payload, buttonId, options);
  const hit = getMarkdownRenderCacheEntry(key);
  if (!hit?.result?.success || !hit?.result?.markdown) return null;
  return hit.result;
};

export const peekInlineHtmlTemplateCache = (
  payload: SubmissionPayload,
  templateIdMap: TemplateIdMap,
  cacheKeySuffix?: string
): RenderHtmlTemplateResult | null => {
  const key = buildInlineHtmlCacheKey(payload, templateIdMap, cacheKeySuffix);
  const hit = getHtmlRenderCacheEntry(key);
  if (!hit?.result?.success || !hit?.result?.html) return null;
  return hit.result;
};

/**
 * Clear the in-memory client cache for Apps Script-rendered HTML templates.
 *
 * This is useful for the app-level "Refresh" action to avoid stale HTML when
 * downstream data sources (projections) change.
 */
export const clearHtmlRenderClientCache = (): void => {
  htmlRenderCache.clear();
  htmlRenderInflight.clear();
  removePersistedHtmlRenderCache();
};

export const clearMarkdownRenderClientCache = (): void => {
  markdownRenderCache.clear();
  markdownRenderInflight.clear();
  removePersistedMarkdownRenderCache();
};

export const invalidateClientSharedDataCaches = (opts?: {
  includePersistedDataSources?: boolean;
  includeHtmlRenderCache?: boolean;
}): void => {
  clearFetchDataSourceCache({ includePersisted: opts?.includePersistedDataSources !== false });
  if (opts?.includeHtmlRenderCache) {
    clearHtmlRenderClientCache();
    clearMarkdownRenderClientCache();
  }
};

export interface PrefetchTemplatesResult {
  success: boolean;
  message?: string;
  counts?: {
    markdownRequested: number;
    markdownCacheHit: number;
    markdownLoaded: number;
    markdownSkippedCache: number;
    markdownFailed: number;
    htmlRequested: number;
    htmlCacheHit: number;
    htmlLoaded: number;
    htmlSkippedCache: number;
    htmlFailed: number;
    docTextRequested: number;
    docTextCacheHit: number;
    docTextLoaded: number;
    docTextSkippedCache: number;
    docTextFailed: number;
    docOk: number;
    docFailed: number;
  };
}

export interface RenderDocPreviewResult {
  success: boolean;
  previewFileId?: string;
  previewUrl?: string;
  cleanupToken?: string;
  message?: string;
}

export interface TrashPreviewResult {
  success: boolean;
  message?: string;
}

export interface RecordVersionResult {
  success: boolean;
  id?: string;
  rowNumber?: number;
  dataVersion?: number;
  updatedAt?: string;
  message?: string;
}

type Runner = typeof google.script.run;

const APPS_SCRIPT_CONNECTION_ERROR_CODE = 'CK_APPS_SCRIPT_CONNECTION';

const perfMarkIfEnabled = (enabled: boolean, name: string): void => {
  if (!enabled) return;
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark(name);
    }
  } catch {
    // ignore mark failures
  }
};

const perfMeasureIfEnabled = (enabled: boolean, name: string, startMark: string, endMark: string): number | null => {
  if (!enabled) return null;
  try {
    if (typeof performance !== 'undefined' && typeof performance.measure === 'function') {
      performance.measure(name, startMark, endMark);
      const entries = performance.getEntriesByName(name, 'measure');
      const duration = entries.length ? entries[entries.length - 1].duration : null;
      if (typeof performance.clearMarks === 'function') {
        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
      }
      if (typeof performance.clearMeasures === 'function') {
        performance.clearMeasures(name);
      }
      return typeof duration === 'number' ? duration : null;
    }
  } catch {
    // ignore measure failures
  }
  return null;
};

const resolveErrorLanguage = (): LangCode => {
  const navLang =
    (typeof navigator !== 'undefined' && (navigator.language || (navigator as any).userLanguage)) || undefined;
  return normalizeLanguage(navLang);
};

const isAppsScriptConnectionFailureMessage = (message: string): boolean => {
  const normalized = (message || '').toString().trim().toLowerCase();
  return normalized.includes('connection failure due to http 0') || normalized.includes('networkerror');
};

const emitAppsScriptDiagnostic = (payload: Record<string, unknown>): void => {
  const entry = { source: 'appsScript', ...payload };
  const localConsole = typeof console !== 'undefined' ? console : undefined;
  localConsole?.error?.('[AppsScript] connection failure', entry);
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      const parentConsole = (window.parent as any).console as Console | undefined;
      parentConsole?.error?.('[AppsScript] connection failure', entry);
    }
  } catch {
    // ignore cross-origin errors
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('ck:appsScriptError', { detail: entry }));
    }
  } catch {
    // ignore event errors
  }
};

export const resolveUserFacingErrorMessage = (err: any, fallback: string): string | null => {
  if (err?.code === APPS_SCRIPT_CONNECTION_ERROR_CODE) return null;
  const message = (err?.message || err?.toString?.() || fallback || '').toString().trim();
  const normalized = message.toLowerCase();
  if (
    normalized.includes('upload folder not accessible') ||
    normalized.includes('drive createfile failed') ||
    normalized.includes('drive api not available') ||
    normalized.includes('service accounts do not have storage quota') ||
    normalized.includes('cloud run drive uploads with service accounts require a shared drive') ||
    normalized.includes('cloud run drive artifact writes with service accounts require a shared drive') ||
    normalized.includes('service error: drive')
  ) {
    return fallback || tSystem('files.error.uploadFailed', resolveErrorLanguage(), 'Could not add photos.');
  }
  return message || (fallback || null);
};

const isDriveServiceAccountQuotaError = (err: any): boolean => {
  const message = (err?.message || err?.toString?.() || '').toString().trim().toLowerCase();
  return (
    message.includes('service accounts do not have storage quota') ||
    message.includes('cloud run drive uploads with service accounts require a shared drive') ||
    message.includes('cloud run drive artifact writes with service accounts require a shared drive')
  );
};

const isCloudRunGmailNotConfiguredError = (err: any): boolean => {
  const message = (err?.message || err?.toString?.() || '').toString().trim().toLowerCase();
  return (
    message.includes('cloud run send_email requires ck_gmail_delegated_user') ||
    message.includes('cloud run send_email requires a runtime service account email') ||
    message.includes('gmail client is not configured for cloud run email sending')
  );
};

const toAppsScriptErrorMessage = (err: any): string => {
  const raw = err?.message?.toString?.() || err?.toString?.() || '';
  const message = raw.toString().trim();
  if (!message) return 'Request failed.';
  return message;
};

const getRunner = (): Runner | null => {
  const runner = typeof google !== 'undefined' ? google?.script?.run : null;
  return runner && typeof runner.withSuccessHandler === 'function' ? runner : null;
};

export interface BackendTransport {
  invoke<T>(fnName: string, ...args: any[]): Promise<T>;
  isHttpRouted?: (fnName: string) => boolean;
}

export type BackendMode = 'appsScript' | 'http' | 'hybrid';

export interface BackendRuntimeConfig {
  mode?: BackendMode | string;
  apiBaseUrl?: string;
  rpcPath?: string;
  httpFunctions?: string[] | string;
  appsScriptFunctions?: string[] | string;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  dataBackend?: string;
  fileBackend?: string;
  fetchImpl?: typeof fetch;
}

export interface HttpTransportOptions {
  apiBaseUrl: string;
  rpcPath?: string;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  fetchImpl?: typeof fetch;
}

export interface HybridTransportOptions {
  httpTransport: BackendTransport;
  appsScriptTransport?: BackendTransport;
  mode?: 'http' | 'hybrid';
  httpFunctions?: string[] | string;
  appsScriptFunctions?: string[] | string;
}

export const DEFAULT_HYBRID_HTTP_FUNCTIONS = [
  'fetchBootstrapContext',
  'fetchBootstrapContextWithOptions',
  'fetchHomeBootstrap',
  'fetchFormConfig',
  'fetchFormCatalog',
  'fetchAnalyticsDashboard',
  'queueAnalyticsPipelineRun',
  'enqueueFollowupEmail',
  'runQueuedFollowupEmailJobs',
  'fetchSubmissions',
  'fetchSubmissionsBatch',
  'fetchSubmissionsSortedBatch',
  'fetchSubmissionById',
  'fetchSubmissionByRowNumber',
  'fetchSummaryRecord',
  'fetchSubmissionsByRowNumbers',
  'getRecordVersion',
  'fetchDataSource',
  'prefetchTemplates',
  'renderHtmlTemplate',
  'renderMarkdownTemplate',
  'renderInlineHtmlTemplate',
  'renderSummaryHtmlTemplate'
] as const;

const CLOUD_RUN_FOLLOWUP_ACTIONS = new Set(['CLOSE_RECORD', 'CREATE_PDF', 'SEND_EMAIL']);

const normalizeBackendMode = (raw: any): BackendMode | null => {
  const value = (raw || '').toString().trim().toLowerCase();
  if (!value) return null;
  if (value === 'appsscript' || value === 'apps-script' || value === 'apps_script') return 'appsScript';
  if (value === 'http' || value === 'api') return 'http';
  if (value === 'hybrid') return 'hybrid';
  return null;
};

const normalizeStringList = (value: string[] | string | undefined | null): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => (item ?? '').toString().trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeHeaders = (value: any): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  Object.keys(value).forEach(key => {
    const normalizedKey = (key || '').toString().trim();
    if (!normalizedKey) return;
    const rawValue = value[key];
    if (rawValue === undefined || rawValue === null) return;
    out[normalizedKey] = rawValue.toString();
  });
  return Object.keys(out).length ? out : undefined;
};

const normalizeRequestCredentials = (value: any): RequestCredentials | undefined => {
  const normalized = (value || '').toString().trim();
  return normalized === 'include' || normalized === 'same-origin' || normalized === 'omit'
    ? (normalized as RequestCredentials)
    : undefined;
};

const normalizeApiBaseUrl = (value: any): string => (value || '').toString().trim().replace(/\/+$/, '');

const logBackendTransportConfig = (event: string, payload: Record<string, any>): void => {
  try {
    if (typeof console === 'undefined' || typeof console.info !== 'function') return;
    console.info('[ReactForm][BackendTransport]', event, payload);
  } catch {
    // ignore diagnostic logging failures
  }
};

const resolveRpcUrl = (apiBaseUrl: string, rpcPath?: string): string => {
  const path = (rpcPath || '/api/rpc').toString().trim() || '/api/rpc';
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizeApiBaseUrl(apiBaseUrl)}${normalizedPath}`;
};

const resolveRpcErrorMessage = (payload: any): string | null => {
  if (!payload) return null;
  const error = payload.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const message = (error.message || error.details || '').toString().trim();
    if (message) return message;
  }
  const message = (payload.message || '').toString().trim();
  return message || null;
};

const parseRpcJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: { message: text } };
  }
};

const createUnavailableHttpTransport = (message: string): BackendTransport => ({
  isHttpRouted: () => true,
  invoke<T>(): Promise<T> {
    return Promise.reject(new Error(message));
  }
});

const runAppsScript = <T,>(fnName: string, ...args: any[]): Promise<T> => {
  return new Promise((resolve, reject) => {
    const runner = getRunner();
    if (!runner) {
      reject(new Error('google.script.run is unavailable.'));
      return;
    }
    const perfEnabled = isGlobalPerfInstrumentationEnabled();
    const perfId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startMark = `ck.rpc.${fnName}.start.${perfId}`;
    const endMark = `ck.rpc.${fnName}.end.${perfId}`;
    perfMarkIfEnabled(perfEnabled, startMark);
    const startedAt = Date.now();
    const logPerf = (outcome: 'success' | 'failure', detail?: Record<string, unknown>) => {
      const durationMs =
        perfMeasureIfEnabled(perfEnabled, `ck.rpc.${fnName}.duration.${perfId}`, startMark, endMark) ??
        (Date.now() - startedAt);
      if (!perfEnabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm][perf]', 'rpc', {
          fnName,
          outcome,
          durationMs: Math.round(durationMs),
          argCount: args.length,
          ...detail
        });
      } catch {
        // ignore perf logging failures
      }
    };
    try {
      runner
        .withSuccessHandler((res: T) => {
          perfMarkIfEnabled(perfEnabled, endMark);
          logPerf('success');
          resolve(res);
        })
        .withFailureHandler((err: any) => {
          perfMarkIfEnabled(perfEnabled, endMark);
          const rawMessage = (err?.message || err?.toString?.() || '').toString();
          if (isAppsScriptConnectionFailureMessage(rawMessage)) {
            logPerf('failure', { kind: 'connectionFailure' });
            const language = resolveErrorLanguage();
            const userMessage = tSystem(
              'app.refreshToRetry',
              language,
              'We could not load this right now. Tap the app logo in the top left, then tap Refresh.'
            );
            const diagnostic = {
              fnName,
              message: rawMessage || 'connection failure',
              userMessage,
              argCount: args.length,
              argTypes: args.map(arg => (arg === null ? 'null' : Array.isArray(arg) ? 'array' : typeof arg)),
              href: typeof window !== 'undefined' ? window.location?.href || null : null,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || null : null,
              timestamp: new Date().toISOString()
            };
            emitAppsScriptDiagnostic(diagnostic);
            const error = new Error(userMessage);
            (error as any).code = APPS_SCRIPT_CONNECTION_ERROR_CODE;
            (error as any).suppressUserMessage = true;
            (error as any).diagnostic = diagnostic;
            reject(error);
            return;
          }
          logPerf('failure');
          reject(new Error(toAppsScriptErrorMessage(err)));
        })[fnName](...args);
    } catch (err) {
      perfMarkIfEnabled(perfEnabled, endMark);
      logPerf('failure', { kind: 'exception' });
      reject(new Error(toAppsScriptErrorMessage(err)));
    }
  });
};

export const createAppsScriptTransport = (): BackendTransport => ({
  isHttpRouted: () => false,
  invoke<T>(fnName: string, ...args: any[]): Promise<T> {
    return runAppsScript<T>(fnName, ...args);
  }
});

export const createHttpTransport = (options: HttpTransportOptions): BackendTransport => {
  const apiBaseUrl = normalizeApiBaseUrl(options?.apiBaseUrl);
  const rpcUrl = resolveRpcUrl(apiBaseUrl, options?.rpcPath);
  const fetchImpl =
    options?.fetchImpl ||
    (typeof fetch === 'function' ? (fetch.bind(globalThis) as typeof fetch) : null);
  const headers = normalizeHeaders(options?.headers) || {};
  const credentials = normalizeRequestCredentials(options?.credentials);

  return {
    isHttpRouted: () => true,
    async invoke<T>(fnName: string, ...args: any[]): Promise<T> {
      if (!apiBaseUrl) {
        throw new Error('HTTP backend is configured without apiBaseUrl.');
      }
      if (!fetchImpl) {
        throw new Error('HTTP backend is unavailable because fetch is not available.');
      }

      const init: RequestInit = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ fnName, args })
      };
      if (credentials) init.credentials = credentials;

      const response = await fetchImpl(rpcUrl, init);
      const payload = await parseRpcJson(response);
      if (!response.ok) {
        throw new Error(resolveRpcErrorMessage(payload) || `HTTP backend request failed (${response.status}).`);
      }
      if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'ok')) {
        if (payload.ok === false) {
          throw new Error(resolveRpcErrorMessage(payload) || 'HTTP backend request failed.');
        }
        return payload.result as T;
      }
      return payload as T;
    }
  };
};

export const createHybridTransport = (options: HybridTransportOptions): BackendTransport => {
  const httpTransport = options.httpTransport;
  const appsScriptTransport = options.appsScriptTransport || createAppsScriptTransport();
  const mode = options.mode === 'http' ? 'http' : 'hybrid';
  const httpFunctions = new Set(normalizeStringList(options.httpFunctions));
  const appsScriptFunctions = new Set(normalizeStringList(options.appsScriptFunctions));
  const isHttpRouted = (fnName: string): boolean => {
    const normalizedFnName = (fnName || '').toString().trim();
    if (!normalizedFnName) return false;
    if (appsScriptFunctions.has(normalizedFnName)) return false;
    if (mode === 'http') return true;
    return httpFunctions.has(normalizedFnName);
  };

  return {
    isHttpRouted,
    invoke<T>(fnName: string, ...args: any[]): Promise<T> {
      const transport = isHttpRouted(fnName) ? httpTransport : appsScriptTransport;
      return transport.invoke<T>(fnName, ...args);
    }
  };
};

export const readBackendRuntimeConfigFromGlobals = (): BackendRuntimeConfig | null => {
  const globalAny = globalThis as any;
  const bootstrapConfig = globalAny?.__WEB_FORM_BOOTSTRAP__?.backend;
  const directConfig = globalAny?.__CK_BACKEND_CONFIG__;
  const source =
    directConfig && typeof directConfig === 'object'
      ? directConfig
      : bootstrapConfig && typeof bootstrapConfig === 'object'
        ? bootstrapConfig
        : null;
  const config: BackendRuntimeConfig = source ? { ...source } : {};

  if (globalAny?.__CK_BACKEND_MODE__ !== undefined) config.mode = globalAny.__CK_BACKEND_MODE__;
  if (globalAny?.__CK_API_BASE_URL__ !== undefined) config.apiBaseUrl = globalAny.__CK_API_BASE_URL__;
  if (globalAny?.__CK_API_RPC_PATH__ !== undefined) config.rpcPath = globalAny.__CK_API_RPC_PATH__;
  if (globalAny?.__CK_HTTP_FUNCTIONS__ !== undefined) config.httpFunctions = globalAny.__CK_HTTP_FUNCTIONS__;
  if (globalAny?.__CK_APPS_SCRIPT_FUNCTIONS__ !== undefined) {
    config.appsScriptFunctions = globalAny.__CK_APPS_SCRIPT_FUNCTIONS__;
  }

  return Object.keys(config).length ? config : null;
};

let activeTransport: BackendTransport = createAppsScriptTransport();

export const configureBackendTransport = (transport?: BackendTransport | null): void => {
  activeTransport = transport || createAppsScriptTransport();
};

export const isBackendFunctionRoutedToHttp = (fnName: string): boolean =>
  Boolean(activeTransport.isHttpRouted?.(fnName));

const invokeTransport = <T,>(fnName: string, ...args: any[]): Promise<T> => activeTransport.invoke<T>(fnName, ...args);

const normalizeFollowupAction = (action: any): string => (action ?? '').toString().trim().toUpperCase();

const areCloudRunFollowupActions = (actions: any[]): boolean => {
  const normalized = (Array.isArray(actions) ? actions : [])
    .map(normalizeFollowupAction)
    .filter(Boolean);
  return normalized.length > 0 && normalized.every(action => CLOUD_RUN_FOLLOWUP_ACTIONS.has(action));
};

const buildSkippedFollowupResult = (actions: string[], message: string): Array<{ action: string; result: FollowupActionResult }> =>
  actions.map(action => ({
    action,
    result: {
      success: false,
      message
    }
  }));

const normalizeFollowupEmailDispatchMode = (value: any): 'direct' | 'queued' | '' => {
  const normalized = (value ?? '').toString().trim().toLowerCase();
  return normalized === 'direct' || normalized === 'queued' ? normalized : '';
};

const isDirectFollowupEmailDispatch = (options: any): boolean =>
  normalizeFollowupEmailDispatchMode(options?.emailDispatchMode) === 'direct';

const normalizeFollowupBatchOptions = (options?: FollowupBatchOptions | null): FollowupBatchOptions | undefined => {
  const emailDispatchMode = normalizeFollowupEmailDispatchMode(options?.emailDispatchMode);
  return emailDispatchMode ? { emailDispatchMode } : undefined;
};

const applyDirectEmailDispatchRequirement = (
  batch: FollowupBatchResponse,
  actions: any[],
  options?: FollowupBatchOptions | null
): FollowupBatchResponse => {
  if (!isDirectFollowupEmailDispatch(options)) return batch;
  const normalizedActions = (Array.isArray(actions) ? actions : []).map(normalizeFollowupAction);
  if (!normalizedActions.includes('SEND_EMAIL')) return batch;
  const results = (Array.isArray(batch?.results) ? batch.results : []).map(entry => {
    if (normalizeFollowupAction(entry?.action) !== 'SEND_EMAIL') return entry;
    const result = entry?.result;
    if (!result?.success) return entry;
    if (result.queued !== true && result.emailDispatched === true) return entry;
    return {
      ...entry,
      result: {
        ...result,
        success: false,
        message:
          result.queued === true
            ? 'Final report email was queued but not confirmed sent.'
            : 'Final report email completed without a confirmed dispatch result.'
      }
    };
  });
  return {
    ...batch,
    results,
    success: results.length > 0 && results.every(entry => Boolean(entry?.result?.success))
  };
};

const extractPdfArtifactFromFollowupBatch = (
  batch: FollowupBatchResponse,
  current: { fileId?: string; url?: string } | null
): { fileId?: string; url?: string } | null => {
  let artifact = current;
  (Array.isArray(batch?.results) ? batch.results : []).forEach(entry => {
    if (normalizeFollowupAction(entry?.action) !== 'CREATE_PDF') return;
    const result = entry?.result;
    if (!result?.success) return;
    const fileId = (result.fileId || '').toString().trim();
    const url = (result.pdfUrl || '').toString().trim();
    if (fileId || url) {
      artifact = {
        fileId: fileId || undefined,
        url: url || undefined
      };
    }
  });
  return artifact;
};

const runSplitFollowupBatchWithAppsScriptEmail = async (
  formKey: string,
  recordId: string,
  actions: any[]
): Promise<FollowupBatchResponse> => {
  const normalizedActions = (Array.isArray(actions) ? actions : [])
    .map(action => (action ?? '').toString().trim())
    .filter(Boolean);
  if (!normalizedActions.length) {
    return {
      success: false,
      results: buildSkippedFollowupResult([''], 'No follow-up actions provided.')
    };
  }

  const results: Array<{ action: string; result: FollowupActionResult }> = [];
  let pdfArtifact: { fileId?: string; url?: string } | null = null;
  let pendingCloudRunActions: string[] = [];

  const flushCloudRunActions = async (): Promise<boolean> => {
    if (!pendingCloudRunActions.length) return true;
    const batch = await invokeTransport<FollowupBatchResponse>(
      'triggerFollowupActions',
      formKey,
      recordId,
      pendingCloudRunActions
    );
    const batchResults = Array.isArray(batch?.results) ? batch.results : [];
    results.push(...batchResults);
    pdfArtifact = extractPdfArtifactFromFollowupBatch(batch, pdfArtifact);
    pendingCloudRunActions = [];
    return Boolean(batch?.success);
  };

  for (let index = 0; index < normalizedActions.length; index += 1) {
    const action = normalizedActions[index];
    if (normalizeFollowupAction(action) !== 'SEND_EMAIL') {
      pendingCloudRunActions.push(action);
      continue;
    }

    const cloudRunOk = await flushCloudRunActions();
    if (!cloudRunOk) {
      results.push(...buildSkippedFollowupResult(normalizedActions.slice(index), `Skipped because ${action} could not run after a failed Cloud Run action.`));
      break;
    }

    const currentPdfArtifact = pdfArtifact as { fileId?: string; url?: string } | null;
    const emailOptions = currentPdfArtifact
      ? {
          pdfArtifact: {
            success: true,
            fileId: currentPdfArtifact.fileId,
            url: currentPdfArtifact.url
          }
        }
      : undefined;
    const emailResult = emailOptions
      ? await runAppsScript<FollowupActionResult>('enqueueFollowupEmail', formKey, recordId, emailOptions)
      : await runAppsScript<FollowupActionResult>('enqueueFollowupEmail', formKey, recordId);
    results.push({ action, result: emailResult });
    if (!emailResult?.success) {
      results.push(...buildSkippedFollowupResult(normalizedActions.slice(index + 1), `Skipped because ${action} failed.`));
      break;
    }
  }

  if (results.length < normalizedActions.length) {
    const cloudRunOk = await flushCloudRunActions();
    if (!cloudRunOk) {
      const completedCount = results.length;
      results.push(...buildSkippedFollowupResult(normalizedActions.slice(completedCount), 'Skipped because a Cloud Run follow-up action failed.'));
    }
  }

  return {
    success: results.length === normalizedActions.length && results.every(entry => !!entry.result?.success),
    results
  };
};

const invokeFollowupTransport = async <T,>(fnName: string, actions: any[], ...args: any[]): Promise<T> => {
  const directEmailDispatch = isDirectFollowupEmailDispatch(args[3]);
  if (activeTransport.isHttpRouted?.(fnName) && !areCloudRunFollowupActions(actions)) {
    logBackendTransportConfig('followup.appsScriptFallback', {
      fnName,
      actions: (Array.isArray(actions) ? actions : []).map(action => (action ?? '').toString().trim()).filter(Boolean)
    });
    return runAppsScript<T>(fnName, ...args);
  }
  try {
    return await invokeTransport<T>(fnName, ...args);
  } catch (err) {
    if (activeTransport.isHttpRouted?.(fnName) && fnName === 'triggerFollowupActions' && isCloudRunGmailNotConfiguredError(err)) {
      const formKey = (args[0] || '').toString();
      const recordId = (args[1] || '').toString();
      if (directEmailDispatch) {
        logBackendTransportConfig('followup.appsScriptDirectEmailFallback', {
          fnName,
          actions: (Array.isArray(actions) ? actions : []).map(action => (action ?? '').toString().trim()).filter(Boolean),
          reason: 'gmailNotConfigured'
        });
        return runAppsScript<T>(fnName, ...args);
      }
      logBackendTransportConfig('followup.splitAppsScriptEmailFallback', {
        fnName,
        actions: (Array.isArray(actions) ? actions : []).map(action => (action ?? '').toString().trim()).filter(Boolean),
        reason: 'gmailNotConfigured'
      });
      return runSplitFollowupBatchWithAppsScriptEmail(formKey, recordId, actions) as Promise<T>;
    }
    if (
      activeTransport.isHttpRouted?.(fnName) &&
      (isDriveServiceAccountQuotaError(err) || isCloudRunGmailNotConfiguredError(err))
    ) {
      logBackendTransportConfig('followup.appsScriptFallback', {
        fnName,
        actions: (Array.isArray(actions) ? actions : []).map(action => (action ?? '').toString().trim()).filter(Boolean),
        reason: isDriveServiceAccountQuotaError(err) ? 'driveServiceAccountQuota' : 'gmailNotConfigured'
      });
      return runAppsScript<T>(fnName, ...args);
    }
    throw err;
  }
};

const invokeDriveUploadTransport = async <T,>(fnName: string, ...args: any[]): Promise<T> => {
  try {
    return await invokeTransport<T>(fnName, ...args);
  } catch (err) {
    if (activeTransport.isHttpRouted?.(fnName) && isDriveServiceAccountQuotaError(err)) {
      logBackendTransportConfig('driveUpload.appsScriptFallback', { fnName });
      return runAppsScript<T>(fnName, ...args);
    }
    throw err;
  }
};

const invokeDriveArtifactTransport = async <T,>(fnName: string, ...args: any[]): Promise<T> => {
  try {
    return await invokeTransport<T>(fnName, ...args);
  } catch (err) {
    if (activeTransport.isHttpRouted?.(fnName) && isDriveServiceAccountQuotaError(err)) {
      logBackendTransportConfig('driveArtifact.appsScriptFallback', { fnName });
      return runAppsScript<T>(fnName, ...args);
    }
    throw err;
  }
};

const invokeAnalyticsPipelineTransport = async <T,>(fnName: string, ...args: any[]): Promise<T> => {
  try {
    return await invokeTransport<T>(fnName, ...args);
  } catch (err) {
    if (
      activeTransport.isHttpRouted?.(fnName) &&
      (isCloudRunGmailNotConfiguredError(err) || isDriveServiceAccountQuotaError(err))
    ) {
      logBackendTransportConfig('analyticsPipeline.appsScriptFallback', {
        fnName,
        reason: isCloudRunGmailNotConfiguredError(err) ? 'gmailNotConfigured' : 'driveServiceAccountQuota'
      });
      return runAppsScript<T>(fnName, ...args);
    }
    throw err;
  }
};

export const configureBackendTransportFromRuntime = (
  runtimeConfig?: BackendRuntimeConfig | null
): BackendTransport => {
  const config = runtimeConfig === undefined ? readBackendRuntimeConfigFromGlobals() : runtimeConfig;
  const mode = normalizeBackendMode(config?.mode) || 'appsScript';
  if (!config || mode === 'appsScript') {
    const transport = createAppsScriptTransport();
    configureBackendTransport(transport);
    if (config?.mode) {
      logBackendTransportConfig('configured', {
        mode: 'appsScript',
        dataBackend: config.dataBackend || 'appsScript',
        fileBackend: config.fileBackend || 'appsScript'
      });
    }
    return transport;
  }

  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!apiBaseUrl) {
    const transport =
      mode === 'http'
        ? createUnavailableHttpTransport('HTTP backend mode requires apiBaseUrl.')
        : createAppsScriptTransport();
    configureBackendTransport(transport);
    logBackendTransportConfig('configured', {
      mode,
      apiBaseUrl: null,
      dataBackend: config.dataBackend || null,
      fileBackend: config.fileBackend || null,
      unavailableReason: 'missingApiBaseUrl'
    });
    return transport;
  }

  const httpTransport = createHttpTransport({
    apiBaseUrl,
    rpcPath: config.rpcPath,
    headers: normalizeHeaders(config.headers),
    credentials: normalizeRequestCredentials(config.credentials),
    fetchImpl: config.fetchImpl
  });
  const transport =
    mode === 'http'
      ? createHybridTransport({
          mode: 'http',
          httpTransport,
          appsScriptFunctions: config.appsScriptFunctions
        })
      : createHybridTransport({
          mode: 'hybrid',
          httpTransport,
          httpFunctions:
            normalizeStringList(config.httpFunctions).length > 0
              ? config.httpFunctions
              : Array.from(DEFAULT_HYBRID_HTTP_FUNCTIONS),
          appsScriptFunctions: config.appsScriptFunctions
        });
  configureBackendTransport(transport);
  logBackendTransportConfig('configured', {
    mode,
    apiBaseUrl,
    httpFunctions:
      mode === 'hybrid'
        ? normalizeStringList(config.httpFunctions).length > 0
          ? normalizeStringList(config.httpFunctions)
          : Array.from(DEFAULT_HYBRID_HTTP_FUNCTIONS)
        : ['*'],
    appsScriptFunctions: normalizeStringList(config.appsScriptFunctions),
    dataBackend: config.dataBackend || null,
    fileBackend: config.fileBackend || null
  });
  return transport;
};

export const submit = (payload: SubmissionPayload): Promise<SubmissionResult> =>
  invokeDriveUploadTransport<SubmissionResult>('saveSubmissionWithId', payload);

export const previewUpdateRecordDependenciesApi = (
  payload: SubmissionPayload,
  buttonId: string
): Promise<UpdateRecordDependencyPreviewResult> =>
  invokeTransport<UpdateRecordDependencyPreviewResult>('previewUpdateRecordDependencies', payload, buttonId);

export const applyUpdateRecordWithDependenciesApi = (
  payload: SubmissionPayload,
  buttonId: string
): Promise<UpdateRecordDependencyApplyResult> =>
  invokeTransport<UpdateRecordDependencyApplyResult>('applyUpdateRecordWithDependencies', payload, buttonId);

export const checkDedupConflictApi = (payload: SubmissionPayload): Promise<DedupConflictCheckResult> =>
  invokeTransport<DedupConflictCheckResult>('checkDedupConflict', payload);

export const fetchList = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string
): Promise<ListResponse> => invokeTransport<ListResponse>('fetchSubmissions', formKey, projection, pageSize, pageToken);

export const fetchBatch = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[]
): Promise<BatchResponse> =>
  invokeTransport<BatchResponse>('fetchSubmissionsBatch', formKey, projection, pageSize, pageToken, includePageRecords, recordIds);

export const fetchSortedBatch = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[],
  sort?: ListSort | null
): Promise<BatchResponse> =>
  invokeTransport<BatchResponse>('fetchSubmissionsSortedBatch', formKey, projection, pageSize, pageToken, includePageRecords, recordIds, sort || null);

export const fetchRecordById = (formKey: string, id: string): Promise<WebFormSubmission | null> =>
  invokeTransport<WebFormSubmission | null>('fetchSubmissionById', formKey, id);

export const fetchRecordByRowNumber = (formKey: string, rowNumber: number): Promise<WebFormSubmission | null> =>
  invokeTransport<WebFormSubmission | null>('fetchSubmissionByRowNumber', formKey, rowNumber);

export const fetchSummaryRecordApi = (
  formKey: string,
  language: LangCode,
  id?: string | null,
  rowNumber?: number | null
): Promise<FetchSummaryRecordResult> =>
  invokeTransport<FetchSummaryRecordResult>('fetchSummaryRecord', formKey, language, id ?? null, rowNumber ?? null);

export const fetchRecordsByRowNumbers = (
  formKey: string,
  rowNumbers: number[]
): Promise<Record<string, WebFormSubmission>> =>
  invokeTransport<Record<string, WebFormSubmission>>('fetchSubmissionsByRowNumbers', formKey, rowNumbers);

export const getRecordVersionApi = (formKey: string, recordId: string, rowNumberHint?: number | null): Promise<RecordVersionResult> =>
  invokeTransport<RecordVersionResult>('getRecordVersion', formKey, recordId, rowNumberHint ?? null);

export const fetchDataSourceApi = (req: DataSourceRequest): Promise<DataSourceResponse> =>
  invokeTransport<DataSourceResponse>('fetchDataSource', req.source, req.locale, req.projection, req.limit, req.pageToken);

export const upsertBankUtilisationApi = (
  request: BankUtilisationMutationRequest
): Promise<BankUtilisationMutationResult> =>
  invokeTransport<BankUtilisationMutationResult>('upsertBankUtilisation', request);

export const applyBankUtilisationPlanApi = (
  request: BankUtilisationPlanRequest
): Promise<BankUtilisationPlanResult> =>
  invokeTransport<BankUtilisationPlanResult>('applyBankUtilisationPlan', request);

export const syncGuidedStepUtilisationDraftApi = (
  request: GuidedStepUtilisationDraftSyncRequest
): Promise<GuidedStepUtilisationDraftSyncResult> =>
  invokeDriveUploadTransport<GuidedStepUtilisationDraftSyncResult>('syncGuidedStepUtilisationDraft', request);

export const triggerFollowup = (
  formKey: string,
  recordId: string,
  action: string
): Promise<FollowupActionResult> =>
  invokeFollowupTransport<FollowupActionResult>('triggerFollowupAction', [action], formKey, recordId, action);

export const triggerFollowupBatch = (
  formKey: string,
  recordId: string,
  actions: string[],
  options?: FollowupBatchOptions
): Promise<FollowupBatchResponse> => {
  const normalizedOptions = normalizeFollowupBatchOptions(options);
  const args = normalizedOptions
    ? [formKey, recordId, actions, normalizedOptions]
    : [formKey, recordId, actions];
  return invokeFollowupTransport<FollowupBatchResponse>(
    'triggerFollowupActions',
    actions,
    ...args
  ).then(batch => applyDirectEmailDispatchRequirement(batch, actions, options));
};

export const enqueueFollowupEmailApi = (
  formKey: string,
  recordId: string,
  options?: { pdfArtifact?: { success?: boolean; fileId?: string; url?: string; pdfUrl?: string } | null }
): Promise<FollowupActionResult> =>
  invokeTransport<FollowupActionResult>('enqueueFollowupEmail', formKey, recordId, options);

export const runQueuedFollowupEmailJobsApi = (options?: { limit?: number }): Promise<any> =>
  invokeTransport<any>('runQueuedFollowupEmailJobs', options);

export const uploadFilesApi = (files: any, uploadConfig?: any): Promise<UploadFilesResult> =>
  invokeDriveUploadTransport<UploadFilesResult>('uploadFiles', files, uploadConfig);

export const renderDocTemplateApi = (payload: SubmissionPayload, buttonId: string): Promise<RenderDocTemplateResult> =>
  invokeDriveArtifactTransport<RenderDocTemplateResult>('renderDocTemplate', payload, buttonId);

export const renderDocTemplatePdfPreviewApi = (
  payload: SubmissionPayload,
  buttonId: string
): Promise<RenderDocTemplatePdfPreviewResult> =>
  invokeDriveArtifactTransport<RenderDocTemplatePdfPreviewResult>('renderDocTemplatePdfPreview', payload, buttonId);

export const renderStoredPdfPreviewApi = (
  formKey: string,
  recordId: string,
  fieldId = 'pdfUrl'
): Promise<RenderDocTemplatePdfPreviewResult> =>
  runAppsScript<RenderDocTemplatePdfPreviewResult>('renderStoredPdfPreview', formKey, recordId, fieldId);

export const renderDocTemplateHtmlApi = (payload: SubmissionPayload, buttonId: string): Promise<RenderDocPreviewResult> =>
  invokeDriveArtifactTransport<RenderDocPreviewResult>('renderDocTemplateHtml', payload, buttonId);

export const renderMarkdownTemplateApi = (
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): Promise<RenderMarkdownTemplateResult> => {
  if (!shouldUseTemplateRenderCache(options)) {
    return invokeTransport<RenderMarkdownTemplateResult>('renderMarkdownTemplate', payload, buttonId);
  }
  const key = buildButtonMarkdownCacheKey(payload, buttonId, options);
  const cached = getMarkdownRenderCacheEntry(key);
  if (cached?.result?.success && cached?.result?.markdown) {
    return Promise.resolve(cached.result);
  }
  const inflight = markdownRenderInflight.get(key);
  if (inflight) return inflight;
  const promise = invokeTransport<RenderMarkdownTemplateResult>('renderMarkdownTemplate', payload, buttonId)
    .then(res => {
      if (res?.success && res?.markdown) {
        setMarkdownRenderCacheEntry(key, res);
      }
      return res;
    })
    .finally(() => {
      markdownRenderInflight.delete(key);
    });
  markdownRenderInflight.set(key, promise);
  return promise;
};

export const renderHtmlTemplateApi = (
  payload: SubmissionPayload,
  buttonId: string,
  options?: TemplateRenderCacheOptions | null
): Promise<RenderHtmlTemplateResult> => {
  if (!shouldUseTemplateRenderCache(options)) {
    return invokeTransport<RenderHtmlTemplateResult>('renderHtmlTemplate', payload, buttonId);
  }
  const key = buildButtonHtmlCacheKey(payload, buttonId, options);
  const cached = getHtmlRenderCacheEntry(key);
  if (cached?.result?.success && cached?.result?.html) {
    return Promise.resolve(cached.result);
  }
  const inflight = htmlRenderInflight.get(key);
  if (inflight) return inflight;
  const promise = invokeTransport<RenderHtmlTemplateResult>('renderHtmlTemplate', payload, buttonId)
    .then(res => {
      if (res?.success && res?.html) {
        setHtmlRenderCacheEntry(key, res);
      }
      return res;
    })
    .finally(() => {
      htmlRenderInflight.delete(key);
    });
  htmlRenderInflight.set(key, promise);
  return promise;
};

export const renderInlineHtmlTemplateApi = (
  payload: SubmissionPayload,
  templateIdMap: TemplateIdMap,
  cacheKeySuffix?: string
): Promise<RenderHtmlTemplateResult> => {
  const key = buildInlineHtmlCacheKey(payload, templateIdMap, cacheKeySuffix);
  const cached = getHtmlRenderCacheEntry(key);
  if (cached?.result?.success && cached?.result?.html) {
    return Promise.resolve(cached.result);
  }
  const inflight = htmlRenderInflight.get(key);
  if (inflight) return inflight;
  const promise = invokeTransport<RenderHtmlTemplateResult>('renderInlineHtmlTemplate', payload, templateIdMap)
    .then(res => {
      if (res?.success && res?.html) {
        setHtmlRenderCacheEntry(key, res);
      }
      return res;
    })
    .finally(() => {
      htmlRenderInflight.delete(key);
    });
  htmlRenderInflight.set(key, promise);
  return promise;
};

export const prefetchTemplatesApi = (formKey: string): Promise<PrefetchTemplatesResult> =>
  invokeTransport<PrefetchTemplatesResult>('prefetchTemplates', formKey);

export const renderSubmissionReportHtmlApi = (payload: SubmissionPayload): Promise<RenderDocPreviewResult> =>
  invokeDriveArtifactTransport<RenderDocPreviewResult>('renderSubmissionReportHtml', payload);

export const renderSummaryHtmlTemplateApi = (payload: SubmissionPayload): Promise<RenderHtmlTemplateResult> => {
  const key = buildSummaryHtmlCacheKey(payload);
  const cached = getHtmlRenderCacheEntry(key);
  if (cached?.result?.success && cached?.result?.html) {
    return Promise.resolve(cached.result);
  }
  const inflight = htmlRenderInflight.get(key);
  if (inflight) return inflight;
  const promise = invokeTransport<RenderHtmlTemplateResult>('renderSummaryHtmlTemplate', payload)
    .then(res => {
      if (res?.success && res?.html) {
        setHtmlRenderCacheEntry(key, res);
      }
      return res;
    })
    .finally(() => {
      htmlRenderInflight.delete(key);
    });
  htmlRenderInflight.set(key, promise);
  return promise;
};

export const trashPreviewArtifactApi = (cleanupToken: string): Promise<TrashPreviewResult> =>
  invokeTransport<TrashPreviewResult>('trashPreviewArtifact', cleanupToken);

export interface BootstrapContextOptions {
  includeHomeData?: boolean;
  includeAnalytics?: boolean;
}

export interface BootstrapContext {
  definition: WebFormDefinition;
  formKey: string;
  record?: WebFormSubmission;
  listResponse?: ListResponse;
  records?: Record<string, WebFormSubmission>;
  analytics?: AnalyticsSnapshot;
  analyticsRev?: number;
  homeRev?: number;
  configSource?: string;
  configEnv?: string;
  envTag?: string;
  backend?: BackendRuntimeConfig;
}

export interface HomeBootstrapResponse {
  notModified: boolean;
  rev: number;
  listResponse?: ListResponse;
  records?: Record<string, WebFormSubmission>;
  analytics?: AnalyticsSnapshot;
  analyticsRev?: number;
  cache?: 'hit' | 'miss';
}

export interface FormCatalogItem {
  formKey: string;
  title: string;
  description?: string;
  targetUrl?: string;
  logoUrl?: string;
}

export const fetchBootstrapContextApi = (
  formKey?: string | null,
  options?: BootstrapContextOptions | null
): Promise<BootstrapContext> => {
  if (options && (options.includeHomeData || options.includeAnalytics)) {
    return invokeTransport<BootstrapContext>('fetchBootstrapContextWithOptions', formKey ?? null, options);
  }
  return invokeTransport<BootstrapContext>('fetchBootstrapContext', formKey ?? null);
};

export const consumePrefetchedHomeBootstrapApi = (formKey: string): Promise<HomeBootstrapResponse> | null => {
  try {
    if (activeTransport.isHttpRouted?.('fetchHomeBootstrap')) return null;
    const globalAny = globalThis as any;
    const prefetch = globalAny?.__CK_HOME_BOOTSTRAP_PREFETCH__;
    if (!prefetch || prefetch.used) return null;
    const prefetchKey = (prefetch.formKey || '').toString().trim();
    const targetKey = (formKey || '').toString().trim();
    if (!prefetchKey || prefetchKey !== targetKey) return null;
    const promise = prefetch.promise;
    if (!promise || typeof promise.then !== 'function') return null;
    prefetch.used = true;
    return promise as Promise<HomeBootstrapResponse>;
  } catch (_) {
    return null;
  }
};

export const fetchHomeBootstrapApi = (
  formKey: string,
  clientRev?: number | null
): Promise<HomeBootstrapResponse> =>
  invokeTransport<HomeBootstrapResponse>('fetchHomeBootstrap', formKey, clientRev ?? null);

export const fetchFormConfigApi = (formKey?: string | null): Promise<FormConfigExport> =>
  invokeTransport<FormConfigExport>('fetchFormConfig', formKey ?? null);

export const fetchFormCatalogApi = (): Promise<FormCatalogItem[]> =>
  invokeTransport<FormCatalogItem[]>('fetchFormCatalog');

export const fetchAnalyticsDashboardApi = (): Promise<AnalyticsDashboardPayload> =>
  invokeTransport<AnalyticsDashboardPayload>('fetchAnalyticsDashboard');

export const queueAnalyticsPipelineRunApi = (
  request: QueueAnalyticsPipelineRequest
): Promise<QueueAnalyticsPipelineResult> =>
  invokeAnalyticsPipelineTransport<QueueAnalyticsPipelineResult>('queueAnalyticsPipelineRun', request);

configureDataSourceFetcher(req => fetchDataSourceApi(req));
configureBackendTransportFromRuntime();
