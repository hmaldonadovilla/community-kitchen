import { DataSourceConfig, PaginatedResult, QuestionConfig } from '../../types';
import { decodePageToken, encodePageToken } from './pagination';
import { normalizeHeaderToken, parseHeaderKey, sanitizeHeaderCellText } from './recordSchema';

export class DataSourceService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dataSourceCache: Record<string, PaginatedResult<any>>;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dataSourceCache = {};
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

    const { sheetId, tabName } = this.parseDataSourceId(dataSourceId, config.tabName, config.sheetId);
    const sheet = sheetId
      ? ((): GoogleAppsScript.Spreadsheet.Sheet | null => {
          try {
            const external = SpreadsheetApp.openById(sheetId);
            return tabName ? external.getSheetByName(tabName) : external.getSheets()[0] || null;
          } catch (_) {
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
    const effectiveProjection = (config.projection && config.projection.length) ? config.projection : (projection && projection.length ? projection : headers);

    const offset = decodePageToken(pageToken);
    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, 200);
    if (offset >= cappedTotal) return { items: [], totalCount: cappedTotal };

    const size = Math.max(1, Math.min(limit || config.limit || 50, 50));
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

    const items = filtered.map(row => {
      if (effectiveProjection.length === 1 && !config.mapping) {
        const fid = effectiveProjection[0];
        const idx = columns[fid.toLowerCase()];
        return idx !== undefined ? row[idx] : '';
      }
      const obj: Record<string, any> = {};
      effectiveProjection.forEach((fid: string) => {
        const idx = columns[fid.toLowerCase()];
        const target = (config.mapping && config.mapping[fid]) || fid;
        if (idx !== undefined) {
          obj[target] = row[idx];
        }
      });
      return obj;
    });

    const nextOffset = offset + rawData.length;
    const hasMore = nextOffset < cappedTotal;
    const nextPageToken = hasMore ? encodePageToken(nextOffset) : undefined;

    return { items, nextPageToken, totalCount: cappedTotal };
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
      const detailsConfig = { ...(ds as any), projection: undefined };
      this.dataSourceCache[cacheKey] = this.fetchDataSource(detailsConfig, language, undefined, ds.limit);
    }
    const response = this.dataSourceCache[cacheKey];
    const items = Array.isArray(response.items) ? response.items : [];
    const lookupFields = this.buildDataSourceLookupFields(ds);
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const matchField = lookupFields.find(field => (item as any)[field] !== undefined);
      if (!matchField) continue;
      const candidate = (item as any)[matchField];
      if (!candidate) continue;
      if (candidate.toString().trim().toLowerCase() === normalized) {
        const result: Record<string, string> = {};
        Object.entries(item).forEach(([key, val]) => {
          if (val === undefined || val === null) return;
          const text = val instanceof Date ? val.toISOString() : val.toString();
          const sanitizedKey = key.replace(/\s+/g, '_').toUpperCase();
          result[sanitizedKey] = text;
        });
        return result;
      }
    }
    return null;
  }

  private parseDataSourceId(raw: string, tabNameOverride?: string, sheetIdOverride?: string): { sheetId?: string; tabName?: string } {
    if (sheetIdOverride || tabNameOverride) {
      return { sheetId: sheetIdOverride, tabName: tabNameOverride || raw };
    }
    const delim = raw.includes('::') ? '::' : raw.includes('|') ? '|' : null;
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
    if (ds.projection && ds.projection.length) {
      fields.push(ds.projection[0]);
    }
    fields.push('value');
    return Array.from(new Set(fields.filter(Boolean).map(f => f.toString())));
  }
}
