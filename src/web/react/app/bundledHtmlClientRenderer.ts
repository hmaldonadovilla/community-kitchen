import { DataSourceConfig, WebFormDefinition, WebFormSubmission, WebQuestionDefinition } from '../../../types';
import { RenderHtmlTemplateResult, fetchDataSourceApi, SubmissionPayload } from '../api';
import { resolveTemplateIdForRecord } from './templateId';
import { StatusTransitionKey, resolveStatusTransitionKey } from '../../../domain/statusTransitions';
import { applyHtmlLineItemBlocks } from '../../../services/webform/followup/htmlLineItemBlocks';
import {
  addConsolidatedPlaceholders,
  addLabelPlaceholders,
  collectLineItemRows
} from '../../../services/webform/followup/placeholders';
import { linkifyUploadedFileUrlsInHtml } from '../../../services/webform/followup/fileLinks';
import {
  addPlaceholderVariants,
  applyPlaceholders,
  formatTemplateValueForHtml,
  resolveSubgroupKey,
  slugifyPlaceholder
} from '../../../services/webform/followup/utils';
import { getBundledHtmlTemplateRaw, parseBundledHtmlTemplateId } from '../../../services/webform/followup/bundledHtmlTemplates';
import { extractScriptTags, restoreScriptTags, stripScriptTags } from '../../../services/webform/followup/scriptTags';

type HtmlRenderCacheEntry = { result: RenderHtmlTemplateResult; cachedAtMs: number };

const MAX_RENDER_CACHE_ENTRIES = 40;
const renderedBundleHtmlCache = new Map<string, HtmlRenderCacheEntry>();
const renderedBundleInflight = new Map<string, Promise<RenderHtmlTemplateResult>>();

const MAX_DS_DETAILS_CACHE_ENTRIES = 80;
const dsDetailsCache = new Map<string, Record<string, string> | null>();
const dsDetailsInflight = new Map<string, Promise<Record<string, string> | null>>();
const DS_PERSIST_VERSION = '1';
const STATUS_PILL_KEYS: StatusTransitionKey[] = ['onClose', 'inProgress', 'reOpened'];

const pruneMap = (map: Map<string, any>, max: number) => {
  if (map.size <= max) return;
  const toEvict = map.size - max;
  let evicted = 0;
  for (const key of map.keys()) {
    map.delete(key);
    evicted += 1;
    if (evicted >= toEvict) break;
  }
};

/**
 * Clear in-memory caches used by bundled (bundle:...) HTML rendering:
 * - Rendered HTML output cache
 * - In-flight render dedupe map
 * - DataSource "details" lookup cache for projection placeholders (FIELD.PROJ)
 */
export const clearBundledHtmlClientCaches = (): void => {
  renderedBundleHtmlCache.clear();
  renderedBundleInflight.clear();
  dsDetailsCache.clear();
  dsDetailsInflight.clear();
};

const stableStringifyForKey = (value: any): string => {
  const seen = new WeakSet<object>();
  const normalize = (v: any): any => {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (t === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      const out: Record<string, any> = {};
      Object.keys(v)
        .sort()
        .forEach(k => {
          out[k] = normalize((v as any)[k]);
        });
      return out;
    }
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
  const compact: Record<string, any> = {};
  Object.keys(values).forEach(k => {
    if (k && k.endsWith('_json')) return;
    compact[k] = (values as any)[k];
  });
  return fnv1a32(stableStringifyForKey(compact));
};

const buildMetaSignature = (payload: SubmissionPayload): string => {
  const meta = {
    status: payload.status || '',
    createdAt: payload.createdAt || '',
    updatedAt: payload.updatedAt || '',
    pdfUrl: payload.pdfUrl || ''
  };
  return fnv1a32(stableStringifyForKey(meta));
};

const escapeAttr = (value: string): string => {
  return (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const splitUrlList = (raw: string): string[] => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return [];
  const commaParts = trimmed
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return commaParts;
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
  return [trimmed];
};

const countUploadItems = (value: any): number => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'string') return splitUrlList(value).filter(Boolean).length;
  if (Array.isArray(value)) {
    let n = 0;
    value.forEach(item => {
      if (item === undefined || item === null) return;
      if (typeof item === 'string') {
        n += splitUrlList(item).filter(Boolean).length;
        return;
      }
      if (typeof item === 'object') {
        const url = ((item as any).url || '').toString().trim();
        if (url) n += splitUrlList(url).filter(Boolean).length;
      }
    });
    return n;
  }
  if (typeof value === 'object') {
    const url = ((value as any).url || '').toString().trim();
    if (url) return splitUrlList(url).filter(Boolean).length;
  }
  return 0;
};

const addFileIconPlaceholders = (placeholders: Record<string, string>, questions: WebQuestionDefinition[], record: WebFormSubmission) => {
  (questions || [])
    .filter(q => q && q.type === 'FILE_UPLOAD' && q.id)
    .forEach(q => {
      const fieldId = (q.id || '').toString().trim();
      if (!fieldId) return;
      const raw = (record.values as any)?.[fieldId];
      const count = countUploadItems(raw);
      const slotIconType = (((q as any)?.uploadConfig?.ui?.slotIcon || 'camera') as string).toString().trim().toLowerCase();
      const icon = slotIconType === 'clip' ? '📎' : '📷';
      if (!count) {
        placeholders[`{{FILES_ICON(${fieldId})}}`] = '';
        return;
      }
      const badge = `<span class="ck-file-icon__badge">${count}</span>`;
      const snippet = `<button data-ck-file-field="${escapeAttr(fieldId)}" data-ck-file-count="${count}" type="button" class="ck-file-icon" aria-label="Open photos">${icon}${badge}</button>`;
      placeholders[`{{FILES_ICON(${fieldId})}}`] = snippet;
    });
};

const buildLookupFields = (ds: DataSourceConfig | undefined): string[] => {
  if (!ds) return [];
  const fields: string[] = [];
  const mapping = (ds as any)?.mapping;
  if (mapping && typeof mapping === 'object') {
    Object.entries(mapping).forEach(([source, target]) => {
      if (target === 'value' || target === 'id') fields.push(source);
    });
  }
  if (Array.isArray((ds as any)?.projection) && (ds as any).projection.length) {
    fields.push(((ds as any).projection[0] || '').toString());
  }
  fields.push('value');
  return Array.from(new Set(fields.filter(Boolean).map(f => f.toString())));
};

const normalizeMatchValue = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const buildPersistKey = (id: string, language: string): string =>
  `ck.ds.${id || 'default'}.${(language || 'EN').toString().toUpperCase()}.v${DS_PERSIST_VERSION}`;

const loadPersistedDataSource = (id: string, language: string): any | null => {
  if (typeof window === 'undefined') return null;
  const readStorage = (storage: Storage | undefined | null): any | null => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(buildPersistKey(id, language));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  };
  return readStorage(window.localStorage) || readStorage(window.sessionStorage);
};

const stringifyAny = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return value.toString();
  } catch (_) {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return '';
    }
  }
};

const lookupDataSourceDetailsClient = async (args: {
  dataSource: DataSourceConfig;
  selectedValue: string;
  language: string;
  limit?: number;
  fetchDataSource?: typeof fetchDataSourceApi;
}): Promise<Record<string, string> | null> => {
  const { dataSource, selectedValue, language, limit } = args;
  const fetcher = args.fetchDataSource || fetchDataSourceApi;
  const rawSelected = (selectedValue || '').toString().trim();
  const normalized = normalizeMatchValue(rawSelected);
  if (!normalized) return null;

  const dsKey = JSON.stringify({
    id: dataSource.id,
    tabName: (dataSource as any).tabName,
    sheetId: (dataSource as any).sheetId,
    language: (language || 'EN').toString().toUpperCase(),
    selected: normalized,
    details: true
  });

  const cached = dsDetailsCache.get(dsKey);
  if (cached !== undefined) return cached;

  const inflight = dsDetailsInflight.get(dsKey);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const detailsSource: any = { ...(dataSource as any) };
      // Mirror server placeholder lookup behavior: allow any projection key by reading full row details.
      detailsSource.projection = undefined;
      detailsSource.mapping = undefined;
      const res = await fetcher({
        source: detailsSource,
        locale: (language || 'EN').toString().toUpperCase() as any,
        projection: undefined,
        limit: limit !== undefined ? limit : (dataSource as any)?.limit
      } as any);
      const items = Array.isArray((res as any)?.items) ? (res as any).items : [];
      const lookupFields = buildLookupFields(dataSource);

      const isRecord = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
      const rows = items.filter(isRecord);
      const toDetails = (item: Record<string, any>): Record<string, string> => {
        const out: Record<string, string> = {};
        Object.entries(item).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          const text = stringifyAny(v);
          if (!text) return;
          const sanitizedKey = k.split(/\s+/).join('_').toUpperCase();
          out[sanitizedKey] = text;
        });
        return out;
      };

      const resolveFromRows = (inputRows: Record<string, any>[]): Record<string, string> | null => {
        let fallback: Record<string, any> | null = null;
        for (const item of inputRows) {
          const matchField = lookupFields.find(f => Object.prototype.hasOwnProperty.call(item, f));
          if (matchField && normalizeMatchValue(item[matchField]) === normalized) {
            return toDetails(item);
          }
          if (!fallback) {
            const values = Object.values(item);
            if (values.some(val => normalizeMatchValue(val) === normalized)) {
              fallback = item;
            }
          }
        }
        if (fallback) return toDetails(fallback);
        return null;
      };

      const persisted = loadPersistedDataSource(dataSource.id, language);
      const persistedItems = Array.isArray((persisted as any)?.items)
        ? (persisted as any).items
        : Array.isArray(persisted)
          ? persisted
          : [];
      const persistedRows = persistedItems.filter(isRecord);
      const persistedDetails = persistedRows.length ? resolveFromRows(persistedRows) : null;
      if (persistedDetails) {
        dsDetailsCache.set(dsKey, persistedDetails);
        pruneMap(dsDetailsCache as any, MAX_DS_DETAILS_CACHE_ENTRIES);
        return persistedDetails;
      }

      const resolved = resolveFromRows(rows);
      if (resolved) {
        dsDetailsCache.set(dsKey, resolved);
        pruneMap(dsDetailsCache as any, MAX_DS_DETAILS_CACHE_ENTRIES);
        return resolved;
      }

      dsDetailsCache.set(dsKey, null);
      pruneMap(dsDetailsCache as any, MAX_DS_DETAILS_CACHE_ENTRIES);
      return null;
    } catch (_) {
      dsDetailsCache.set(dsKey, null);
      pruneMap(dsDetailsCache as any, MAX_DS_DETAILS_CACHE_ENTRIES);
      return null;
    } finally {
      dsDetailsInflight.delete(dsKey);
    }
  })();

  dsDetailsInflight.set(dsKey, promise);
  return promise;
};

const stripOuterQuotes = (value: string): string => {
  const s = (value || '').toString().trim();
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
};

const splitFunctionArgs = (raw: string): string[] => {
  const input = (raw || '').toString();
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

const normalizePlaceholderKey = (raw: string): string => {
  let key = (raw || '').toString().trim();
  if (!key) return '';
  if (key.startsWith('{{') && key.endsWith('}}')) {
    key = key.slice(2, -2).trim();
  }
  key = key
    .split('.')
    .map(seg => seg.trim())
    .filter(Boolean)
    .join('.');
  return key;
};

const extractProjectionFieldIds = (args: {
  html: string;
  questions: WebQuestionDefinition[];
}): Set<string> => {
  const { html, questions } = args;
  const text = (html || '').toString();
  const result = new Set<string>();
  if (!text.includes('{{')) return result;

  const byId: Record<string, WebQuestionDefinition> = {};
  (questions || []).forEach(q => {
    if (!q?.id) return;
    byId[(q.id || '').toString()] = q;
  });

  const considerKey = (keyRaw: string) => {
    const key = normalizePlaceholderKey(keyRaw);
    if (!key) return;
    if (!key.includes('.')) return;
    const [first] = key.split('.');
    const q = byId[first];
    if (!q) return;
    // Dots are also used for line-items (GROUP.FIELD / GROUP.SUBGROUP.FIELD). Only treat as "projection"
    // when the first segment is a non-line-item field with a dataSource.
    if ((q.type || '').toString().toUpperCase() === 'LINE_ITEM_GROUP') return;
    if (!q.dataSource) return;
    result.add(first);
  };

  // Direct placeholders like {{FIELD.PROJ}}
  const tokenRe = /{{\s*([\s\S]*?)\s*}}/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    const inner = (m[1] || '').toString().trim();
    if (!inner) continue;
    // Skip function-like tokens (DEFAULT/ORDER_BY/etc); we handle DEFAULT separately below.
    if (inner.includes('(')) continue;
    considerKey(inner);
  }

  // DEFAULT(KEY, "fallback") can reference projection keys; parse its first arg.
  const defaultRe = /{{\s*DEFAULT\s*\(\s*([\s\S]*?)\s*\)\s*}}/gi;
  let dm: RegExpExecArray | null;
  while ((dm = defaultRe.exec(text))) {
    const inner = (dm[1] || '').toString().trim();
    if (!inner) continue;
    const args = splitFunctionArgs(inner);
    if (args.length < 2) continue;
    const keyArg = stripOuterQuotes(args[0] || '');
    considerKey(keyArg);
  }

  return result;
};

const buildPlaceholderMapClient = (args: {
  record: WebFormSubmission;
  questions: WebQuestionDefinition[];
  lineItemRows: Record<string, any[]>;
  dataSourceDetailsByFieldId: Record<string, Record<string, string> | null>;
  lineItemDataSourceDetails?: Map<string, Record<string, string> | null>;
}): Record<string, string> => {
  const { record, questions, lineItemRows, dataSourceDetailsByFieldId, lineItemDataSourceDetails } = args;
  const map: Record<string, string> = {};

  addPlaceholderVariants(map, 'RECORD_ID', record.id || '', undefined, formatTemplateValueForHtml);
  addPlaceholderVariants(map, 'FORM_KEY', record.formKey || '', undefined, formatTemplateValueForHtml);
  addPlaceholderVariants(map, 'CREATED_AT', record.createdAt || '', undefined, formatTemplateValueForHtml);
  addPlaceholderVariants(map, 'UPDATED_AT', record.updatedAt || '', undefined, formatTemplateValueForHtml);
  addPlaceholderVariants(map, 'STATUS', record.status || '', undefined, formatTemplateValueForHtml);
  addPlaceholderVariants(map, 'PDF_URL', record.pdfUrl || '', undefined, formatTemplateValueForHtml);
  addPlaceholderVariants(map, 'LANGUAGE', record.language || '', undefined, formatTemplateValueForHtml);

  (questions || []).forEach(q => {
    if (!q || q.type === 'BUTTON') return;
    const value = record.values ? (record.values as any)[q.id] : '';
    addPlaceholderVariants(map, q.id, value, q.type, formatTemplateValueForHtml);
    const labelToken = slugifyPlaceholder((q.label as any)?.en || q.id);
    addPlaceholderVariants(map, labelToken, value, q.type, formatTemplateValueForHtml);

    if (q.type === 'LINE_ITEM_GROUP') {
      const rows = lineItemRows[q.id] || [];
      (q.lineItemConfig?.fields || []).forEach((field: any) => {
        const values = rows
          .map(row => (row as any)?.[field.id])
          .filter(val => val !== undefined && val !== null && val !== '')
          .map(val => formatTemplateValueForHtml(val, (field as any)?.type));
        if (!values.length) return;
        const joined = values.join('\n');
        addPlaceholderVariants(map, `${q.id}.${field.id}`, joined, 'PARAGRAPH', formatTemplateValueForHtml);
        const fieldSlug = slugifyPlaceholder(field.labelEn || field.id);
        addPlaceholderVariants(map, `${q.id}.${fieldSlug}`, joined, 'PARAGRAPH', formatTemplateValueForHtml);
      });
      (q.lineItemConfig?.fields || []).forEach((field: any) => {
        if (!field?.dataSource || !lineItemDataSourceDetails) return;
        const detailBuckets: Record<string, string[]> = {};
        rows.forEach(row => {
          const raw = (row as any)?.[field.id];
          if (raw === undefined || raw === null || raw === '') return;
          const key = buildLineItemDataSourceKey(field, raw.toString());
          const details = lineItemDataSourceDetails.get(key) || null;
          if (!details) return;
          Object.entries(details).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') return;
            const dsKey = (k || '').toString().trim().toUpperCase();
            if (!dsKey) return;
            if (!detailBuckets[dsKey]) detailBuckets[dsKey] = [];
            detailBuckets[dsKey].push(v.toString());
          });
        });
        const fieldSlug = slugifyPlaceholder(field.labelEn || field.id);
        Object.entries(detailBuckets).forEach(([dsKey, values]) => {
          const joined = (values || []).filter(Boolean).join('\n');
          if (!joined) return;
          addPlaceholderVariants(map, `${q.id}.${field.id}.${dsKey}`, joined, 'PARAGRAPH', formatTemplateValueForHtml);
          if (fieldSlug) {
            addPlaceholderVariants(map, `${q.id}.${fieldSlug}.${dsKey}`, joined, 'PARAGRAPH', formatTemplateValueForHtml);
          }
        });
      });

      const resolveSubConfigByPath = (path: string[]): any | undefined => {
        if (!path.length) return undefined;
        let current: any = (q as any).lineItemConfig;
        for (let i = 0; i < path.length; i += 1) {
          const subId = path[i];
          const subs = (current?.subGroups || []) as any[];
          const match = subs.find(s => resolveSubgroupKey(s as any) === subId);
          if (!match) return undefined;
          if (i === path.length - 1) return match;
          current = match;
        }
        return undefined;
      };

      Object.keys(lineItemRows)
        .filter(key => key.startsWith(`${q.id}.`))
        .forEach(key => {
          const pathRaw = key.slice(q.id.length + 1);
          const path = pathRaw.split('.').map(seg => seg.trim()).filter(Boolean);
          if (!path.length) return;
          const subCfg = resolveSubConfigByPath(path);
          if (!subCfg) return;
          const subRows = lineItemRows[key] || [];
          subRows.forEach((subRow: any) => {
            (subCfg.fields || []).forEach((field: any) => {
              const raw = subRow?.[field.id];
              if (raw === undefined || raw === null || raw === '') return;
              const tokenPath = path.join('.');
              addPlaceholderVariants(map, `${q.id}.${tokenPath}.${field.id}`, raw, (field as any)?.type, formatTemplateValueForHtml);
              const slug = slugifyPlaceholder(field.labelEn || field.id);
              addPlaceholderVariants(map, `${q.id}.${tokenPath}.${slug}`, raw, (field as any)?.type, formatTemplateValueForHtml);
              if (field?.dataSource && lineItemDataSourceDetails) {
                const dsKey = buildLineItemDataSourceKey(field, raw.toString());
                const details = lineItemDataSourceDetails.get(dsKey) || null;
                if (!details) return;
                Object.entries(details).forEach(([k, v]) => {
                  if (v === undefined || v === null || v === '') return;
                  const detailKey = (k || '').toString().trim().toUpperCase();
                  if (!detailKey) return;
                  addPlaceholderVariants(map, `${q.id}.${tokenPath}.${field.id}.${detailKey}`, v, undefined, formatTemplateValueForHtml);
                  if (slug) {
                    addPlaceholderVariants(map, `${q.id}.${tokenPath}.${slug}.${detailKey}`, v, undefined, formatTemplateValueForHtml);
                  }
                });
              }
            });
          });
        });
      return;
    }

    if (q.dataSource && typeof value === 'string' && value) {
      const details = dataSourceDetailsByFieldId[q.id];
      if (details) {
        Object.entries(details).forEach(([key, val]) => {
          addPlaceholderVariants(map, `${q.id}.${key}`, val, undefined, formatTemplateValueForHtml);
        });
      }
    }
  });

  // Fallback: include any raw record.values entries not already populated.
  Object.entries((record.values as any) || {}).forEach(([key, rawVal]) => {
    const formatted = formatTemplateValueForHtml(rawVal as any, undefined);
    const tokens = [key, key.toUpperCase(), key.toLowerCase()];
    tokens.forEach(t => {
      const ph = `{{${t}}}`;
      if (map[ph] === undefined || map[ph] === '') {
        map[ph] = formatted;
      }
    });
  });

  return map;
};

const buildLineItemConfigMap = (questions: WebQuestionDefinition[]): Record<string, any> => {
  const map: Record<string, any> = {};
  (questions || []).forEach(q => {
    if (!q || q.type !== 'LINE_ITEM_GROUP' || !q.id) return;
    const baseKey = q.id.toString();
    const cfg = (q as any).lineItemConfig;
    if (cfg) map[baseKey] = cfg;
    const walk = (parentKey: string, subs: any[]): void => {
      (subs || []).forEach(sub => {
        const subKey = resolveSubgroupKey(sub as any);
        if (!subKey) return;
        const nextKey = `${parentKey}.${subKey}`;
        map[nextKey] = sub as any;
        walk(nextKey, (sub as any)?.subGroups || []);
      });
    };
    walk(baseKey, (cfg as any)?.subGroups || []);
  });
  return map;
};

const buildLineItemDataSourceKey = (field: any, rawValue: string): string => {
  const value = (rawValue || '').toString().trim().toLowerCase();
  return stableStringifyForKey({
    id: (field?.id || '').toString(),
    source: (field as any)?.dataSource?.id || '',
    value
  });
};

const collectLineItemDataSourceDetails = async (args: {
  lineItemRows: Record<string, any[]>;
  configMap: Record<string, any>;
  language: string;
  fetchDataSource?: typeof fetchDataSourceApi;
}): Promise<Map<string, Record<string, string> | null>> => {
  const { lineItemRows, configMap, language, fetchDataSource } = args;
  const detailsByKey = new Map<string, Record<string, string> | null>();
  const lookups: Array<{ key: string; field: any; value: string; limit?: number }> = [];

  Object.entries(lineItemRows || {}).forEach(([pathKey, rows]) => {
    const cfg = configMap[pathKey];
    if (!cfg || !Array.isArray(cfg.fields)) return;
    (cfg.fields || []).forEach((field: any) => {
      if (!field?.dataSource) return;
      (rows || []).forEach(row => {
        const raw = row?.[field.id];
        if (raw === undefined || raw === null || raw === '') return;
        const value = raw.toString().trim();
        if (!value) return;
        const key = buildLineItemDataSourceKey(field, value);
        if (detailsByKey.has(key)) return;
        detailsByKey.set(key, null);
        lookups.push({ key, field, value, limit: (field as any)?.dataSource?.limit });
      });
    });
  });

  if (!lookups.length) return detailsByKey;

  await Promise.all(
    lookups.map(async lookup => {
      const details = await lookupDataSourceDetailsClient({
        dataSource: (lookup.field as any).dataSource,
        selectedValue: lookup.value,
        language,
        limit: lookup.limit,
        fetchDataSource
      });
      detailsByKey.set(lookup.key, details);
    })
  );

  return detailsByKey;
};

export const isBundledHtmlTemplateId = (templateId: string | undefined | null): boolean => {
  return Boolean(templateId && parseBundledHtmlTemplateId((templateId || '').toString()));
};

export const renderBundledHtmlTemplateClient = async (args: {
  definition: WebFormDefinition;
  payload: SubmissionPayload;
  /**
   * Template id map (button.templateId or definition.summaryHtmlTemplateId).
   * Must resolve to a `bundle:<filename>` id to render locally.
   */
  templateIdMap: any;
  /**
   * Optional: treat this as a "button render" for caching/logging keys.
   */
  buttonId?: string;
  /**
   * Optional dependency injection for tests.
   */
  fetchDataSource?: typeof fetchDataSourceApi;
  /**
   * Optional dependency injection for tests (override how bundle: ids are resolved).
   */
  parseBundledTemplateId?: (templateId: string) => string | null;
  /**
   * Optional dependency injection for tests (override bundled template loading).
   */
  getBundledTemplateRaw?: (key: string) => string | null;
}): Promise<RenderHtmlTemplateResult> => {
  const { definition, payload, templateIdMap, buttonId } = args;
  const recordValues = (payload.values || {}) as any;
  const language = (payload.language || 'EN').toString().toUpperCase();
  const templateIdResolved = resolveTemplateIdForRecord(templateIdMap, recordValues, language);
  const parseBundle = args.parseBundledTemplateId || parseBundledHtmlTemplateId;
  const getRaw = args.getBundledTemplateRaw || getBundledHtmlTemplateRaw;
  const bundledKey = templateIdResolved ? parseBundle(templateIdResolved) : null;
  if (!templateIdResolved || !bundledKey) {
    return { success: false, message: 'Template is not a bundled (bundle:...) HTML template.' };
  }

  const raw = getRaw(bundledKey);
  if (!raw) return { success: false, message: `Bundled HTML template not found: ${bundledKey}` };

  const valuesSig = buildValuesSignature(payload.values);
  const metaSig = buildMetaSignature(payload);
  const cacheKey = `bundle|${payload.formKey}|${language}|${payload.id || ''}|${buttonId || 'summary'}|${bundledKey}|${valuesSig}|${metaSig}`;
  const cached = renderedBundleHtmlCache.get(cacheKey);
  if (cached?.result?.success && cached?.result?.html) {
    return cached.result;
  }
  const inflight = renderedBundleInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async (): Promise<RenderHtmlTemplateResult> => {
    try {
      const record: WebFormSubmission = {
        formKey: payload.formKey,
        language: language as any,
        values: recordValues,
        id: payload.id,
        createdAt: payload.createdAt ? payload.createdAt.toString() : undefined,
        updatedAt: payload.updatedAt ? payload.updatedAt.toString() : undefined,
        status: payload.status ? payload.status.toString() : undefined,
        pdfUrl: payload.pdfUrl ? payload.pdfUrl.toString() : undefined
      };

      const projectionFieldIds = extractProjectionFieldIds({ html: raw, questions: definition.questions || [] });
      const dataSourceDetailsByFieldId: Record<string, Record<string, string> | null> = {};
      for (const fieldId of projectionFieldIds) {
        const q = (definition.questions || []).find(qq => qq && qq.id === fieldId) as any;
        const ds = q?.dataSource as DataSourceConfig | undefined;
        const selectedValue = (recordValues as any)?.[fieldId];
        if (!ds || typeof selectedValue !== 'string' || !selectedValue.trim()) {
          dataSourceDetailsByFieldId[fieldId] = null;
          continue;
        }
        const details = await lookupDataSourceDetailsClient({
          dataSource: ds,
          selectedValue: selectedValue.toString(),
          language,
          limit: (ds as any)?.limit,
          fetchDataSource: args.fetchDataSource
        });
        dataSourceDetailsByFieldId[fieldId] = details;
      }

      const lineItemRows = collectLineItemRows(record as any, definition.questions as any);
      const lineItemConfigMap = buildLineItemConfigMap(definition.questions || []);
      const lineItemDataSourceDetails = await collectLineItemDataSourceDetails({
        lineItemRows,
        configMap: lineItemConfigMap,
        language,
        fetchDataSource: args.fetchDataSource
      });
      const lineItemDataSources =
        lineItemDataSourceDetails.size > 0
          ? {
              lookupDataSourceDetails: (field: any, selectedValue: string) => {
                const key = buildLineItemDataSourceKey(field, selectedValue || '');
                return lineItemDataSourceDetails.get(key) || null;
              }
            }
          : undefined;
      const placeholders = buildPlaceholderMapClient({
        record,
        questions: definition.questions || [],
        lineItemRows,
        dataSourceDetailsByFieldId,
        lineItemDataSourceDetails
      });
      addLabelPlaceholders(placeholders, definition.questions || [], language);
      addConsolidatedPlaceholders(placeholders, definition.questions as any, lineItemRows);
      addFileIconPlaceholders(placeholders, definition.questions || [], record);
      const statusKey = resolveStatusTransitionKey(record.status, definition.followup?.statusTransitions, {
        includeDefaultOnClose: true,
        keys: STATUS_PILL_KEYS
      });
      addPlaceholderVariants(placeholders, 'STATUS_KEY', statusKey || '', undefined, formatTemplateValueForHtml);

      // Bundled templates may include <script> tags, but we must still prevent script injection via user-entered values.
      // Extract template-authored scripts, strip any scripts introduced after placeholder replacement, then restore.
      const { html: rawNoScripts, extracted } = extractScriptTags(raw);
      const withLineItems = applyHtmlLineItemBlocks({
        html: rawNoScripts,
        questions: definition.questions as any,
        lineItemRows,
        dataSources: lineItemDataSources as any,
        language
      });
      const withPlaceholders = applyPlaceholders(withLineItems, placeholders);
      const stripped = stripScriptTags(withPlaceholders);
      const linkified = linkifyUploadedFileUrlsInHtml(stripped, definition.questions as any, record as any);
      const html = extracted.length ? restoreScriptTags(linkified, extracted) : linkified;

      const result: RenderHtmlTemplateResult = { success: true, html };
      renderedBundleHtmlCache.set(cacheKey, { result, cachedAtMs: Date.now() });
      pruneMap(renderedBundleHtmlCache as any, MAX_RENDER_CACHE_ENTRIES);
      return result;
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Failed to render bundled HTML template.').toString();
      return { success: false, message: msg };
    } finally {
      renderedBundleInflight.delete(cacheKey);
    }
  })();

  renderedBundleInflight.set(cacheKey, promise);
  return promise;
};

