import { DataSourceConfig, PaginatedResult, QuestionConfig } from '../../types';
import { decodePageToken, encodePageToken } from './pagination';
import { normalizeHeaderToken, parseHeaderKey, sanitizeHeaderCellText } from './recordSchema';
import { debugLog } from './debug';

const DATA_SOURCE_MAX_TOTAL_ROWS = 10000;
const DATA_SOURCE_MAX_PAGE_SIZE = 500;
const SHARED_DATA_SOURCE_CACHE_TTL_MS = 60 * 1000;
const SHARED_DATA_SOURCE_CACHE_MAX_ENTRIES = 80;

type SharedDataSourceCacheEntry = {
  expiresAtMs: number;
  value: PaginatedResult<any>;
};

export class DataSourceService {
  private readonly ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dataSourceCache: Record<string, PaginatedResult<any>>;
  private static sharedDataSourceCache = new Map<string, SharedDataSourceCacheEntry>();

  private stringify(value: any): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Error) return value.message || value.toString();
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch (err) {
      const errorText = (() => {
        if (!err) return 'unknown';
        if (err instanceof Error) return err.message || err.toString();
        if (typeof err === 'string') return err;
        if (typeof err === 'object') {
          try {
            return JSON.stringify(err);
          } catch (error_) {
            debugLog('dataSources.stringify.errorObject.failed', {
              error: error_ instanceof Error ? error_.message || error_.toString() : 'unknown'
            });
            return 'unknown';
          }
        }
        if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') return String(err);
        if (typeof err === 'symbol') return err.toString();
        if (typeof err === 'function') return err.name ? `[function ${err.name}]` : '[function]';
        return 'unknown';
      })();
      debugLog('dataSources.stringify.failed', {
        error: errorText
      });
      return String(value);
    }
  }

  private resolveMappingAliases(mapping: Record<string, string> | undefined, sourceKey: string): string[] {
    if (!mapping) return [];
    const raw = (sourceKey || '').toString();
    if (!raw) return [];
    const normalized = normalizeHeaderToken(raw);
    const aliases = new Set<string>();
    Object.entries(mapping).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const keyNorm = normalizeHeaderToken(k);
      const valNorm = normalizeHeaderToken(v);
      // Support both mapping styles:
      // - source -> target (e.g., DIST_NAME -> value)
      // - target -> source (e.g., value -> DIST_NAME)
      if (keyNorm === normalized) aliases.add(v.toString());
      if (valNorm === normalized) aliases.add(k.toString());
    });
    return Array.from(aliases).filter(a => normalizeHeaderToken(a) !== normalized);
  }

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dataSourceCache = {};
  }

  private static pruneSharedDataSourceCache(nowMs: number): void {
    if (!DataSourceService.sharedDataSourceCache.size) return;
    for (const [key, entry] of DataSourceService.sharedDataSourceCache.entries()) {
      if (!entry || !Number.isFinite(entry.expiresAtMs) || entry.expiresAtMs <= nowMs) {
        DataSourceService.sharedDataSourceCache.delete(key);
      }
    }
    if (DataSourceService.sharedDataSourceCache.size <= SHARED_DATA_SOURCE_CACHE_MAX_ENTRIES) return;
    const toEvict = DataSourceService.sharedDataSourceCache.size - SHARED_DATA_SOURCE_CACHE_MAX_ENTRIES;
    let evicted = 0;
    for (const key of DataSourceService.sharedDataSourceCache.keys()) {
      DataSourceService.sharedDataSourceCache.delete(key);
      evicted += 1;
      if (evicted >= toEvict) break;
    }
  }

  private buildSharedDataSourceCacheKey(args: {
    dataSourceId: string;
    config: any;
    locale?: string;
    projection?: string[];
    limit?: number;
    pageToken?: string;
  }): string {
    const projection = Array.isArray(args.config?.projection)
      ? args.config.projection
      : Array.isArray(args.projection)
        ? args.projection
        : [];
    const limitRaw = args.limit ?? args.config?.limit ?? null;
    const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;
    return JSON.stringify({
      id: args.dataSourceId,
      sheetId: (args.config?.sheetId || '').toString(),
      tabName: (args.config?.tabName || '').toString(),
      locale: (args.locale || '').toString().toUpperCase(),
      localeKey: (args.config?.localeKey || '').toString(),
      projection: projection.map((v: any) => (v || '').toString()),
      mapping: args.config?.mapping || null,
      mode: (args.config?.mode || '').toString(),
      statusAllowList: Array.isArray(args.config?.statusAllowList) ? args.config.statusAllowList : null,
      pageToken: (args.pageToken || '').toString(),
      limit
    });
  }

  private readSharedDataSourceCache(key: string, nowMs: number): PaginatedResult<any> | null {
    if (!key) return null;
    DataSourceService.pruneSharedDataSourceCache(nowMs);
    const entry = DataSourceService.sharedDataSourceCache.get(key);
    if (!entry || !entry.value || entry.expiresAtMs <= nowMs) {
      if (entry) DataSourceService.sharedDataSourceCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private writeSharedDataSourceCache(key: string, value: PaginatedResult<any>, nowMs: number): void {
    if (!key || !value) return;
    DataSourceService.sharedDataSourceCache.set(key, {
      value,
      expiresAtMs: nowMs + SHARED_DATA_SOURCE_CACHE_TTL_MS
    });
    DataSourceService.pruneSharedDataSourceCache(nowMs);
  }

  fetchDataSource(
    source: any,
    locale?: string,
    projection?: string[],
    limit?: number,
    pageToken?: string
  ): PaginatedResult<any> {
    const config = typeof source === 'string' ? { id: source, projection } : (source || {});
    const dataSourceId = config.id || source;
    if (!dataSourceId) return { items: [], nextPageToken: undefined, totalCount: 0 };
    const sharedCacheKey = this.buildSharedDataSourceCacheKey({
      dataSourceId,
      config,
      locale,
      projection,
      limit,
      pageToken
    });
    const nowMs = Date.now();
    const sharedCached = this.readSharedDataSourceCache(sharedCacheKey, nowMs);
    if (sharedCached) {
      debugLog('dataSources.sharedCache.hit', { id: dataSourceId, key: sharedCacheKey.slice(0, 120) });
      return sharedCached;
    }

    const { sheetId, tabName } = this.parseDataSourceId(dataSourceId, config.tabName, config.sheetId);
    const sheet = sheetId
      ? ((): GoogleAppsScript.Spreadsheet.Sheet | null => {
          try {
            const external = SpreadsheetApp.openById(sheetId);
            return tabName ? external.getSheetByName(tabName) : external.getSheets()[0] || null;
          } catch (err) {
            debugLog('dataSources.openById.failed', {
              sheetId,
              tabName,
              error: this.stringify(err) || 'unknown'
            });
            return null;
          }
        })()
      : this.ss.getSheetByName(tabName || dataSourceId);
    if (!sheet) return { items: [], nextPageToken: undefined, totalCount: 0 };

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = headerRow.map(h => sanitizeHeaderCellText((h || '').toString()));
    if (!headers.length) return { items: [], nextPageToken: undefined, totalCount: 0 };

    const columns = this.buildHeaderIndex(headers);
    const localeKey = (config.localeKey || '').toString().trim().toLowerCase() || undefined;
    // When no projection is provided, default to using canonical bracket keys (`Label [ID]` => `ID`) for stable outputs.
    const headerKeys = headers.map(h => {
      const parsed = parseHeaderKey(h);
      return (parsed.key || h || '').toString();
    });
    const configProjection = Array.isArray(config.projection) ? (config.projection as string[]) : undefined;
    const effectiveProjection = (() => {
      if (configProjection?.length) return configProjection;
      if (projection?.length) return projection;
      return headerKeys;
    })();

    const offset = decodePageToken(pageToken);
    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, DATA_SOURCE_MAX_TOTAL_ROWS);
    if (offset >= cappedTotal) {
      const emptyRes = { items: [], totalCount: cappedTotal };
      this.writeSharedDataSourceCache(sharedCacheKey, emptyRes, nowMs);
      return emptyRes;
    }

    const mode = (config.mode || '').toString().trim().toLowerCase();
    const defaultPageSize = mode === 'options' ? 250 : 50;
    const requestedRaw = limit ?? config.limit ?? defaultPageSize;
    const requested = Number.isFinite(Number(requestedRaw)) ? Number(requestedRaw) : defaultPageSize;
    const size = Math.max(1, Math.min(requested, DATA_SOURCE_MAX_PAGE_SIZE));
    const readCount = Math.min(size, cappedTotal - offset);
    const rawData = readCount > 0 ? sheet.getRange(2 + offset, 1, readCount, headers.length).getValues() : [];

    const filtered = !localeKey || !locale
      ? rawData
      : rawData.filter(row => {
          const idx = columns[localeKey];
          if (idx === undefined) return true;
          const cell = (row[idx] || '').toString().toLowerCase();
          return cell === locale.toLowerCase();
        });

    const statusAllowSet = (() => {
      const raw = (config as any)?.statusAllowList;
      const list = Array.isArray(raw) ? raw : raw !== undefined && raw !== null && raw !== '' ? [raw] : [];
      const normalized = list
        .map(v => (v === undefined || v === null ? '' : v.toString().trim().toLowerCase()))
        .filter(Boolean);
      return new Set(normalized);
    })();
    const statusIdx = columns.status;
    const filteredByStatus =
      statusAllowSet.size > 0 && statusIdx === undefined
        ? ((): any[] => {
            debugLog('dataSources.statusFilter.missingColumn', {
              id: dataSourceId,
              tabName: sheet.getName(),
              statusAllowList: Array.from(statusAllowSet)
            });
            return filtered;
          })()
        : statusAllowSet.size > 0
          ? filtered.filter(row => {
              const cell = row[statusIdx] !== undefined && row[statusIdx] !== null ? row[statusIdx].toString().trim().toLowerCase() : '';
              return cell && statusAllowSet.has(cell);
            })
          : filtered;

    const items = filteredByStatus.map(row => {
      const hasMapping = !!(config.mapping && typeof config.mapping === 'object');
      if (effectiveProjection.length === 1 && hasMapping === false) {
        const fid = effectiveProjection[0];
        const idx = columns[fid.toLowerCase()];
        return idx === undefined ? '' : row[idx];
      }
      const obj: Record<string, any> = {};
      effectiveProjection.forEach((fid: string) => {
        const rawKey = (fid || '').toString();
        if (!rawKey) return;
        const idx = columns[rawKey.toLowerCase()];
        if (idx !== undefined) {
          const cell = row[idx];
          // Always include the raw projection key (this is what the web app uses for option lookups).
          obj[rawKey] = cell;
          // Also include alias keys derived from mapping (supports both directions).
          const aliases = this.resolveMappingAliases(config.mapping, rawKey);
          aliases.forEach(alias => {
            if (!alias) return;
            if (obj[alias] === undefined) obj[alias] = cell;
          });
        }
      });
      return obj;
    });

    const nextOffset = offset + rawData.length;
    const hasMore = nextOffset < cappedTotal;
    const nextPageToken = hasMore ? encodePageToken(nextOffset) : undefined;

    const result = { items, nextPageToken, totalCount: cappedTotal };
    this.writeSharedDataSourceCache(sharedCacheKey, result, nowMs);
    return result;
  }

  lookupDataSourceDetails(
    question: QuestionConfig,
    selectedValue: string,
    language: string
  ): Record<string, string> | null {
    if (!selectedValue || !question.dataSource) return null;
    const ds = question.dataSource;
    const normalized = selectedValue.toString().trim().toLowerCase();
    if (!normalized) return null;
    // IMPORTANT: For placeholder expansion we need the *full row* (so we can expose ADDRESS/POSTAL_CODE/etc).
    // Many option data sources set projection=["value"], which would otherwise return scalar items and prevent
    // lookupDataSourceDetails() from ever matching/returning details.
    const cacheKey = JSON.stringify({
      id: ds.id,
      tabName: ds.tabName,
      sheetId: ds.sheetId,
      details: true
    });
    if (!this.dataSourceCache[cacheKey]) {
      // Force a "details" fetch that is not constrained by ds.projection.
      // (fetchDataSource() will fall back to reading the sheet headers when projection is omitted.)
      // IMPORTANT: For template placeholders we want stable keys like `DIST_ADDR_1`, not mapped keys like `value`.
      // So we ignore `ds.mapping` for the details fetch and expose raw/canonical column IDs.
      const detailsConfig = { ...(ds as any), projection: undefined, mapping: undefined };
      this.dataSourceCache[cacheKey] = this.fetchDataSource(detailsConfig, language, undefined, ds.limit);
    }
    const response = this.dataSourceCache[cacheKey];
    const isRecord = (val: any): val is Record<string, any> => !!val && typeof val === 'object';
    const items = Array.isArray(response.items) ? response.items.filter(isRecord) : [];
    const lookupFields = this.buildDataSourceLookupFields(ds);
    const matchesSelected = (val: any): boolean => {
      if (val === undefined || val === null) return false;
      if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return false;
      const text = val.toString().trim().toLowerCase();
      if (!text) return false;
      return text === normalized;
    };
    const toDetails = (item: Record<string, any>): Record<string, string> => {
      const result: Record<string, string> = {};
      Object.entries(item).forEach(([key, val]) => {
        if (val === undefined || val === null) return;
        const text = this.stringify(val);
        const sanitizedKey = key.split(/\s+/).join('_').toUpperCase();
        result[sanitizedKey] = text;
      });
      return result;
    };

    let fallback: Record<string, any> | null = null;
    for (const item of items) {
      const matchField = lookupFields.find(field => item[field] !== undefined && item[field] !== null);
      if (matchField && matchesSelected(item[matchField])) {
        return toDetails(item);
      }
      if (!fallback) {
        const values = Object.values(item);
        if (values.some(val => matchesSelected(val))) {
          fallback = item;
        }
      }
    }
    if (fallback) return toDetails(fallback);
    return null;
  }

  private parseDataSourceId(raw: string, tabNameOverride?: string, sheetIdOverride?: string): { sheetId?: string; tabName?: string } {
    if (sheetIdOverride || tabNameOverride) {
      return { sheetId: sheetIdOverride, tabName: tabNameOverride || raw };
    }
    let delim: string | null = null;
    if (raw.includes('::')) delim = '::';
    else if (raw.includes('|')) delim = '|';
    if (!delim) return { tabName: raw };
    const [sheetId, tabName] = raw.split(delim);
    return { sheetId: sheetId || undefined, tabName: tabName || undefined };
  }

  private buildHeaderIndex(headers: string[]): Record<string, number> {
    const index: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const cleaned = sanitizeHeaderCellText(h);
      const rawKey = normalizeHeaderToken(cleaned);
      if (rawKey && index[rawKey] === undefined) index[rawKey] = idx;
      const parsed = parseHeaderKey(cleaned);
      if (parsed.key) {
        const bracketKey = normalizeHeaderToken(parsed.key);
        if (bracketKey && index[bracketKey] === undefined) index[bracketKey] = idx;
      }
    });
    return index;
  }

  private buildDataSourceLookupFields(ds: DataSourceConfig): string[] {
    const fields: string[] = [];
    if (ds.mapping) {
      Object.entries(ds.mapping).forEach(([source, target]) => {
        if (target === 'value' || target === 'id') {
          fields.push(source);
        }
      });
    }
    if (ds.projection?.length) {
      fields.push(ds.projection[0]);
    }
    fields.push('value');
    return Array.from(new Set(fields.filter(Boolean).map(f => f.toString())));
  }
}
