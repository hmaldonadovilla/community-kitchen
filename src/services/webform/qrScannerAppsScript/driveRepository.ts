import { isFolderMimeType, normalizeFileId } from './domain';
import { DriveAuthorizationMetadata, QrScannerDriveRepository } from './types';

const FOLDER_METADATA_CACHE_PREFIX = 'ck.qr.folder.v1:';
const FOLDER_METADATA_CACHE_TTL_SECONDS = 60;
const DRIVE_METADATA_FIELDS =
  'id,title,mimeType,labels/trashed,parents/id,teamDriveId,shortcutDetails';

type QrScannerMetadataCache = {
  get(key: string): string | null;
  put(key: string, value: string, expirationInSeconds: number): void;
};

export class QrScannerDriveRepositoryError extends Error {
  readonly retryable: boolean;

  constructor(retryable: boolean) {
    super('Drive metadata is unavailable.');
    this.name = 'QrScannerDriveRepositoryError';
    this.retryable = retryable;
  }
}

const isRetryableDriveFailure = (error: unknown): boolean => {
  const status = Number((error as any)?.responseCode || (error as any)?.statusCode || (error as any)?.code);
  if (status === 408 || status === 429 || status >= 500) return true;
  const message = ((error as any)?.message || '').toString().toLowerCase();
  return /rate limit|quota|timed? out|timeout|try again|temporar|internal error|service unavailable|backend error/.test(message);
};

const parentIdsFrom = (metadata: any): string[] =>
  (Array.isArray(metadata?.parents)
    ? metadata.parents
    : Array.isArray(metadata?.parentIds)
      ? metadata.parentIds
      : [])
    .map((parent: any) => (parent && typeof parent === 'object' ? parent.id : parent))
    .map((parent: unknown) => normalizeFileId(parent))
    .filter(Boolean);

const normalizeMetadata = (metadata: any, fallbackId: string): DriveAuthorizationMetadata | null => {
  const id = normalizeFileId(metadata?.id || fallbackId);
  if (!metadata || !id) return null;
  return {
    id,
    name: (metadata.title || metadata.name || 'Drive file').toString().trim().slice(0, 160),
    mimeType: (metadata.mimeType || '').toString().trim().toLowerCase().slice(0, 160),
    trashed: metadata.trashed === true || metadata.labels?.trashed === true,
    parentIds: parentIdsFrom(metadata),
    ...((metadata.teamDriveId || metadata.driveId)
      ? { driveId: (metadata.teamDriveId || metadata.driveId).toString().trim().slice(0, 200) }
      : {}),
    shortcut:
      metadata.shortcut === true ||
      Boolean(metadata.shortcutDetails) ||
      (metadata.mimeType || '').toString() === 'application/vnd.google-apps.shortcut'
  };
};

const scriptCache = (): QrScannerMetadataCache | null => {
  try {
    const cacheService = (globalThis as any).CacheService;
    if (!cacheService || typeof cacheService.getScriptCache !== 'function') return null;
    const cache = cacheService.getScriptCache();
    return cache && typeof cache.get === 'function' && typeof cache.put === 'function' ? cache : null;
  } catch {
    return null;
  }
};

const readCachedFolderMetadata = (
  cache: QrScannerMetadataCache | null,
  cacheKey: string,
  fileId: string
): DriveAuthorizationMetadata | null => {
  if (!cache) return null;
  try {
    const raw = cache.get(cacheKey);
    if (!raw) return null;
    const metadata = normalizeMetadata(JSON.parse(raw), fileId);
    return metadata && isFolderMimeType(metadata.mimeType) ? metadata : null;
  } catch {
    return null;
  }
};

const cacheFolderMetadata = (
  cache: QrScannerMetadataCache | null,
  cacheKey: string,
  metadata: DriveAuthorizationMetadata
): void => {
  if (!cache || !isFolderMimeType(metadata.mimeType)) return;
  try {
    cache.put(cacheKey, JSON.stringify(metadata), FOLDER_METADATA_CACHE_TTL_SECONDS);
  } catch {
    // Cache availability must not affect authoritative Drive validation.
  }
};

/** Reads the minimum Drive metadata required by the authorization domain. */
export class AppsScriptQrScannerDriveRepository implements QrScannerDriveRepository {
  fetchMetadata(fileId: string, kind: 'file' | 'folder' = 'file'): DriveAuthorizationMetadata {
    const normalizedId = normalizeFileId(fileId);
    if (!normalizedId) throw new QrScannerDriveRepositoryError(false);
    const cacheKey = `${FOLDER_METADATA_CACHE_PREFIX}${normalizedId}`;
    const cache = kind === 'folder' ? scriptCache() : null;
    const cached = kind === 'folder' ? readCachedFolderMetadata(cache, cacheKey, normalizedId) : null;
    if (cached) return cached;
    try {
      const files = typeof Drive !== 'undefined' ? (Drive as any).Files : null;
      if (!files || typeof files.get !== 'function') throw new QrScannerDriveRepositoryError(false);
      const rawMetadata = files.get(normalizedId, {
        supportsAllDrives: true,
        fields: DRIVE_METADATA_FIELDS
      });
      const metadata = normalizeMetadata(rawMetadata, normalizedId);
      if (!metadata) {
        throw new QrScannerDriveRepositoryError(false);
      }
      if (kind === 'folder') cacheFolderMetadata(cache, cacheKey, metadata);
      return metadata;
    } catch (error) {
      if (error instanceof QrScannerDriveRepositoryError) throw error;
      throw new QrScannerDriveRepositoryError(isRetryableDriveFailure(error));
    }
  }
}
