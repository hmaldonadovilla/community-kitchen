import {
  DataSourceConfig,
  FollowupActionResult,
  FormConfigExport,
  PaginatedResult,
  WebFormDefinition,
  WebFormSubmission
} from '../../types';
import { LangCode } from '../types';
import { normalizeLanguage } from '../core/options';
import { tSystem } from '../systemStrings';

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
  meta?: { id?: string; createdAt?: string; updatedAt?: string; dataVersion?: number; rowNumber?: number };
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

export interface FollowupBatchResponse {
  success: boolean;
  results: Array<{ action: string; result: FollowupActionResult }>;
}

// ----------------------------
// Client-side HTML render cache
// ----------------------------
// Goal: avoid re-calling Apps Script when reopening the same record/template with the same values.
// This is intentionally in-memory only (per browser session) to keep invalidation simple and safe.

type HtmlRenderCacheEntry = { result: RenderHtmlTemplateResult; cachedAtMs: number };

const MAX_HTML_RENDER_CACHE_ENTRIES = 40;

const htmlRenderCache = new Map<string, HtmlRenderCacheEntry>();
const htmlRenderInflight = new Map<string, Promise<RenderHtmlTemplateResult>>();

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
    } catch (_) {
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

const buildButtonHtmlCacheKey = (payload: SubmissionPayload, buttonId: string): string => {
  const recordId = (payload.id || '').toString();
  const valuesSig = buildValuesSignature(payload.values);
  const metaSig = buildMetaSignature(payload);
  return `button|${payload.formKey}|${payload.language}|${recordId}|${buttonId}|${valuesSig}|${metaSig}`;
};

export const peekSummaryHtmlTemplateCache = (payload: SubmissionPayload): RenderHtmlTemplateResult | null => {
  const key = buildSummaryHtmlCacheKey(payload);
  const hit = htmlRenderCache.get(key);
  if (!hit?.result?.success || !hit?.result?.html) return null;
  return hit.result;
};

export const peekHtmlTemplateCache = (payload: SubmissionPayload, buttonId: string): RenderHtmlTemplateResult | null => {
  const key = buildButtonHtmlCacheKey(payload, buttonId);
  const hit = htmlRenderCache.get(key);
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

const isStagingPerfEnabled = (): boolean => {
  try {
    const raw = ((globalThis as any)?.__CK_ENV_TAG__ || '').toString().trim().toLowerCase();
    return raw.includes('staging');
  } catch (_) {
    return false;
  }
};

const perfMarkIfEnabled = (enabled: boolean, name: string): void => {
  if (!enabled) return;
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark(name);
    }
  } catch (_) {
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
  } catch (_) {
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
  } catch (_) {
    // ignore cross-origin errors
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('ck:appsScriptError', { detail: entry }));
    }
  } catch (_) {
    // ignore event errors
  }
};

export const resolveUserFacingErrorMessage = (err: any, fallback: string): string | null => {
  if (err?.code === APPS_SCRIPT_CONNECTION_ERROR_CODE) return null;
  const message = (err?.message || err?.toString?.() || fallback || '').toString().trim();
  return message || (fallback || null);
};

const toAppsScriptErrorMessage = (err: any): string => {
  const raw = err?.message?.toString?.() || err?.toString?.() || '';
  const message = raw.toString().trim();
  if (!message) return 'Request failed.';
  return message;
};

const getRunner = (): Runner | null => {
  const runner = google?.script?.run;
  return runner && typeof runner.withSuccessHandler === 'function' ? runner : null;
};

const runAppsScript = <T,>(fnName: string, ...args: any[]): Promise<T> => {
  return new Promise((resolve, reject) => {
    const runner = getRunner();
    if (!runner) {
      reject(new Error('google.script.run is unavailable.'));
      return;
    }
    const perfEnabled = isStagingPerfEnabled();
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
      } catch (_) {
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

export const submit = (payload: SubmissionPayload): Promise<SubmissionResult> =>
  runAppsScript<SubmissionResult>('saveSubmissionWithId', payload);

export const checkDedupConflictApi = (payload: SubmissionPayload): Promise<DedupConflictCheckResult> =>
  runAppsScript<DedupConflictCheckResult>('checkDedupConflict', payload);

export const fetchList = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string
): Promise<ListResponse> => runAppsScript<ListResponse>('fetchSubmissions', formKey, projection, pageSize, pageToken);

export const fetchBatch = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[]
): Promise<BatchResponse> =>
  runAppsScript<BatchResponse>('fetchSubmissionsBatch', formKey, projection, pageSize, pageToken, includePageRecords, recordIds);

export const fetchSortedBatch = (
  formKey: string,
  projection?: string[],
  pageSize?: number,
  pageToken?: string,
  includePageRecords: boolean = true,
  recordIds?: string[],
  sort?: ListSort | null
): Promise<BatchResponse> =>
  runAppsScript<BatchResponse>('fetchSubmissionsSortedBatch', formKey, projection, pageSize, pageToken, includePageRecords, recordIds, sort || null);

export const fetchRecordById = (formKey: string, id: string): Promise<WebFormSubmission | null> =>
  runAppsScript<WebFormSubmission | null>('fetchSubmissionById', formKey, id);

export const fetchRecordByRowNumber = (formKey: string, rowNumber: number): Promise<WebFormSubmission | null> =>
  runAppsScript<WebFormSubmission | null>('fetchSubmissionByRowNumber', formKey, rowNumber);

export const getRecordVersionApi = (formKey: string, recordId: string, rowNumberHint?: number | null): Promise<RecordVersionResult> =>
  runAppsScript<RecordVersionResult>('getRecordVersion', formKey, recordId, rowNumberHint ?? null);

export const fetchDataSourceApi = (req: DataSourceRequest): Promise<DataSourceResponse> =>
  runAppsScript<DataSourceResponse>('fetchDataSource', req.source, req.locale, req.projection, req.limit, req.pageToken);

export const triggerFollowup = (
  formKey: string,
  recordId: string,
  action: string
): Promise<FollowupActionResult> => runAppsScript<FollowupActionResult>('triggerFollowupAction', formKey, recordId, action);

export const triggerFollowupBatch = (
  formKey: string,
  recordId: string,
  actions: string[]
): Promise<FollowupBatchResponse> =>
  runAppsScript<FollowupBatchResponse>('triggerFollowupActions', formKey, recordId, actions);

export const uploadFilesApi = (files: any, uploadConfig?: any): Promise<UploadFilesResult> =>
  runAppsScript<UploadFilesResult>('uploadFiles', files, uploadConfig);

export const renderDocTemplateApi = (payload: SubmissionPayload, buttonId: string): Promise<RenderDocTemplateResult> =>
  runAppsScript<RenderDocTemplateResult>('renderDocTemplate', payload, buttonId);

export const renderDocTemplatePdfPreviewApi = (
  payload: SubmissionPayload,
  buttonId: string
): Promise<RenderDocTemplatePdfPreviewResult> =>
  runAppsScript<RenderDocTemplatePdfPreviewResult>('renderDocTemplatePdfPreview', payload, buttonId);

export const renderDocTemplateHtmlApi = (payload: SubmissionPayload, buttonId: string): Promise<RenderDocPreviewResult> =>
  runAppsScript<RenderDocPreviewResult>('renderDocTemplateHtml', payload, buttonId);

export const renderMarkdownTemplateApi = (payload: SubmissionPayload, buttonId: string): Promise<RenderMarkdownTemplateResult> =>
  runAppsScript<RenderMarkdownTemplateResult>('renderMarkdownTemplate', payload, buttonId);

export const renderHtmlTemplateApi = (payload: SubmissionPayload, buttonId: string): Promise<RenderHtmlTemplateResult> => {
  const key = buildButtonHtmlCacheKey(payload, buttonId);
  const cached = htmlRenderCache.get(key);
  if (cached?.result?.success && cached?.result?.html) {
    return Promise.resolve(cached.result);
  }
  const inflight = htmlRenderInflight.get(key);
  if (inflight) return inflight;
  const promise = runAppsScript<RenderHtmlTemplateResult>('renderHtmlTemplate', payload, buttonId)
    .then(res => {
      if (res?.success && res?.html) {
        htmlRenderCache.set(key, { result: res, cachedAtMs: Date.now() });
        pruneHtmlRenderCache();
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
  runAppsScript<PrefetchTemplatesResult>('prefetchTemplates', formKey);

export const renderSubmissionReportHtmlApi = (payload: SubmissionPayload): Promise<RenderDocPreviewResult> =>
  runAppsScript<RenderDocPreviewResult>('renderSubmissionReportHtml', payload);

export const renderSummaryHtmlTemplateApi = (payload: SubmissionPayload): Promise<RenderHtmlTemplateResult> => {
  const key = buildSummaryHtmlCacheKey(payload);
  const cached = htmlRenderCache.get(key);
  if (cached?.result?.success && cached?.result?.html) {
    return Promise.resolve(cached.result);
  }
  const inflight = htmlRenderInflight.get(key);
  if (inflight) return inflight;
  const promise = runAppsScript<RenderHtmlTemplateResult>('renderSummaryHtmlTemplate', payload)
    .then(res => {
      if (res?.success && res?.html) {
        htmlRenderCache.set(key, { result: res, cachedAtMs: Date.now() });
        pruneHtmlRenderCache();
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
  runAppsScript<TrashPreviewResult>('trashPreviewArtifact', cleanupToken);

export interface BootstrapContext {
  definition: WebFormDefinition;
  formKey: string;
  record?: WebFormSubmission;
  listResponse?: ListResponse;
  records?: Record<string, WebFormSubmission>;
  homeRev?: number;
  configSource?: string;
  configEnv?: string;
  envTag?: string;
}

export interface HomeBootstrapResponse {
  notModified: boolean;
  rev: number;
  listResponse?: ListResponse;
  records?: Record<string, WebFormSubmission>;
  cache?: 'hit' | 'miss';
}

export const fetchBootstrapContextApi = (formKey?: string | null): Promise<BootstrapContext> =>
  runAppsScript<BootstrapContext>('fetchBootstrapContext', formKey ?? null);

export const fetchHomeBootstrapApi = (
  formKey: string,
  clientRev?: number | null
): Promise<HomeBootstrapResponse> =>
  runAppsScript<HomeBootstrapResponse>('fetchHomeBootstrap', formKey, clientRev ?? null);

export const fetchFormConfigApi = (formKey?: string | null): Promise<FormConfigExport> =>
  runAppsScript<FormConfigExport>('fetchFormConfig', formKey ?? null);
