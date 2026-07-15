import { normalizeFileId } from './domain';
import { DriveAuthorizationMetadata, QrScannerDriveRepository } from './types';

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
  (Array.isArray(metadata?.parents) ? metadata.parents : [])
    .map((parent: any) => (parent && typeof parent === 'object' ? parent.id : parent))
    .map((parent: unknown) => normalizeFileId(parent))
    .filter(Boolean);

/** Reads the minimum Drive metadata required by the authorization domain. */
export class AppsScriptQrScannerDriveRepository implements QrScannerDriveRepository {
  fetchMetadata(fileId: string): DriveAuthorizationMetadata {
    const normalizedId = normalizeFileId(fileId);
    if (!normalizedId) throw new QrScannerDriveRepositoryError(false);
    try {
      const files = typeof Drive !== 'undefined' ? (Drive as any).Files : null;
      if (!files || typeof files.get !== 'function') throw new QrScannerDriveRepositoryError(false);
      const metadata = files.get(normalizedId, { supportsAllDrives: true });
      if (!metadata || !normalizeFileId(metadata.id || normalizedId)) {
        throw new QrScannerDriveRepositoryError(false);
      }
      return {
        id: normalizeFileId(metadata.id || normalizedId),
        name: (metadata.title || metadata.name || 'Drive file').toString().trim().slice(0, 160),
        mimeType: (metadata.mimeType || '').toString().trim().toLowerCase().slice(0, 160),
        trashed: metadata.trashed === true || metadata.labels?.trashed === true,
        parentIds: parentIdsFrom(metadata),
        ...((metadata.teamDriveId || metadata.driveId)
          ? { driveId: (metadata.teamDriveId || metadata.driveId).toString().trim().slice(0, 200) }
          : {}),
        shortcut:
          Boolean(metadata.shortcutDetails) ||
          (metadata.mimeType || '').toString() === 'application/vnd.google-apps.shortcut'
      };
    } catch (error) {
      if (error instanceof QrScannerDriveRepositoryError) throw error;
      throw new QrScannerDriveRepositoryError(isRetryableDriveFailure(error));
    }
  }
}
