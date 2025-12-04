import { PaginatedResult, WebFormSubmission } from '../../types';
import { HeaderColumns } from './types';
import { debugLog } from './debug';

export const CACHE_TTL_SECONDS = 300;
export const CACHE_PREFIX = 'CK_CACHE';
export const CACHE_VERSION_PROPERTY_KEY = 'CK_CACHE_VERSION';
export const DEFAULT_CACHE_VERSION = 'v1';
export const ETAG_PROPERTY_PREFIX = 'CK_ETAG_';

export class CacheEtagManager {
  private cache: GoogleAppsScript.Cache.Cache | null;
  private docProps: GoogleAppsScript.Properties.Properties | null;
  private cachePrefix: string;

  constructor(
    cache: GoogleAppsScript.Cache.Cache | null,
    docProps: GoogleAppsScript.Properties.Properties | null,
    cachePrefix?: string
  ) {
    this.cache = cache;
    this.docProps = docProps;
    this.cachePrefix = cachePrefix || `${CACHE_PREFIX}:${DEFAULT_CACHE_VERSION}`;
  }

  static computeCachePrefix(docProps: GoogleAppsScript.Properties.Properties | null): string {
    const version = CacheEtagManager.getOrCreateCacheVersion(docProps);
    return `${CACHE_PREFIX}:${version}`;
  }

  static invalidate(docProps: GoogleAppsScript.Properties.Properties | null, reason?: string): string | null {
    if (!docProps) {
      debugLog('cache.invalidate.skipped', { reason: reason || 'manual', cause: 'missingDocProps' });
      return null;
    }
    const version = CacheEtagManager.generateCacheVersion();
    CacheEtagManager.persistCacheVersion(docProps, version);
    debugLog('cache.invalidated', { reason: reason || 'manual', version });
    return version;
  }

  cacheGet<T>(key: string): T | null {
    if (!this.cache || !key) return null;
    try {
      const raw = this.cache.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (_) {
      return null;
    }
  }

  cachePut(key: string, value: any, ttlSeconds: number = CACHE_TTL_SECONDS): void {
    if (!this.cache || !key) return;
    try {
      this.cache.put(key, JSON.stringify(value), ttlSeconds);
    } catch (_) {
      // ignore cache failures
    }
  }

  cacheRecord(formKey: string, etag: string, record: WebFormSubmission): void {
    if (!record || !record.id) return;
    const key = this.makeCacheKey('RECORD', [formKey || '', etag || '', record.id]);
    this.cachePut(key, record);
  }

  getCachedRecord(formKey: string, etag: string, id: string): WebFormSubmission | null {
    if (!id) return null;
    const key = this.makeCacheKey('RECORD', [formKey || '', etag || '', id]);
    return this.cacheGet<WebFormSubmission>(key);
  }

  makeListCacheKey(
    formKey: string,
    etag: string,
    projection: string[],
    pageSize: number,
    pageToken?: string
  ): string {
    const projectionKey = (projection || []).map(id => id || '').join('|');
    return this.makeCacheKey('LIST', [formKey || '', etag || '', projectionKey, pageSize.toString(), pageToken || '']);
  }

  makeCacheKey(namespace: string, parts: string[]): string {
    const digest = this.digestKey(parts.join('::'));
    const prefix = this.cachePrefix || `${CACHE_PREFIX}:${DEFAULT_CACHE_VERSION}`;
    const key = `${prefix}:${namespace}:${digest}`;
    return key.length > 250 ? key.slice(0, 250) : key;
  }

  digestKey(input: string): string {
    try {
      if (
        typeof Utilities !== 'undefined' &&
        (Utilities as any).computeDigest &&
        (Utilities as any).base64Encode &&
        (Utilities as any).DigestAlgorithm
      ) {
        const bytes = (Utilities as any).computeDigest((Utilities as any).DigestAlgorithm.MD5, input);
        return (Utilities as any).base64Encode(bytes).replace(/=+$/, '');
      }
    } catch (_) {
      // ignore
    }
    return input.length > 180 ? input.slice(0, 180) : input;
  }

  getSheetEtag(sheet: GoogleAppsScript.Spreadsheet.Sheet, columns: HeaderColumns): string {
    const fingerprint = this.computeSheetFingerprint(sheet, columns);
    this.storeEtagMetadata(sheet, fingerprint);
    return fingerprint;
  }

  private computeSheetFingerprint(sheet: GoogleAppsScript.Spreadsheet.Sheet, columns: HeaderColumns): string {
    const sheetId = typeof sheet.getSheetId === 'function' ? sheet.getSheetId() : sheet.getName();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    let marker = '';
    if (lastRow >= 2) {
      const width = Math.max(lastCol, 1);
      const rowValues = sheet.getRange(lastRow, 1, 1, width).getValues()[0] || [];
      const indexes = [columns.updatedAt, columns.createdAt, columns.recordId, columns.timestamp]
        .filter(Boolean) as number[];
      const tokens = indexes.map(idx => {
        const cell = rowValues[(idx as number) - 1];
        if (cell instanceof Date) return cell.toISOString();
        return cell !== undefined && cell !== null ? cell.toString() : '';
      });
      marker = tokens.join('|');
    }
    const updatedDigest = this.computeColumnDigest(sheet, columns.updatedAt);
    const recordDigest = this.computeColumnDigest(sheet, columns.recordId);
    const raw = [sheetId, lastRow, lastCol, marker, updatedDigest, recordDigest].join(':');
    return this.digestKey(raw);
  }

  private computeColumnDigest(sheet: GoogleAppsScript.Spreadsheet.Sheet, columnIndex?: number): string {
    if (!columnIndex) return '';
    const totalRows = Math.max(sheet.getLastRow() - 1, 0);
    if (totalRows <= 0) return '';
    try {
      const values = sheet.getRange(2, columnIndex, totalRows, 1).getValues();
      const tokens = values.map(row => {
        const cell = row[0];
        if (cell instanceof Date) return cell.toISOString();
        return cell !== undefined && cell !== null ? cell.toString() : '';
      });
      return this.digestKey(tokens.join('|'));
    } catch (_) {
      return '';
    }
  }

  private storeEtagMetadata(sheet: GoogleAppsScript.Spreadsheet.Sheet, etag: string): void {
    if (!this.docProps) return;
    try {
      const payload = JSON.stringify({
        etag,
        lastRow: sheet.getLastRow(),
        updatedAt: new Date().toISOString()
      });
      this.docProps.setProperty(this.getEtagPropertyKey(sheet), payload);
    } catch (_) {
      // ignore
    }
  }

  private getEtagPropertyKey(sheet: GoogleAppsScript.Spreadsheet.Sheet): string {
    const id = typeof sheet.getSheetId === 'function' ? sheet.getSheetId() : sheet.getName();
    return `${ETAG_PROPERTY_PREFIX}${id}`;
  }

  private static getOrCreateCacheVersion(props: GoogleAppsScript.Properties.Properties | null): string {
    if (!props) return DEFAULT_CACHE_VERSION;
    try {
      const existing = props.getProperty(CACHE_VERSION_PROPERTY_KEY);
      if (existing) return existing;
      const fresh = CacheEtagManager.generateCacheVersion();
      props.setProperty(CACHE_VERSION_PROPERTY_KEY, fresh);
      return fresh;
    } catch (_) {
      return DEFAULT_CACHE_VERSION;
    }
  }

  private static generateCacheVersion(): string {
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  private static persistCacheVersion(
    props: GoogleAppsScript.Properties.Properties | null,
    version: string
  ): void {
    if (!props) return;
    try {
      props.setProperty(CACHE_VERSION_PROPERTY_KEY, version);
    } catch (_) {
      // ignore
    }
  }
}

export function getDocumentProperties(): GoogleAppsScript.Properties.Properties | null {
  try {
    return (typeof PropertiesService !== 'undefined' && (PropertiesService as any).getDocumentProperties)
      ? (PropertiesService as any).getDocumentProperties()
      : null;
  } catch (_) {
    return null;
  }
}
