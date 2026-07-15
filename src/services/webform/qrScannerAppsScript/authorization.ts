import { FileUploadConfig } from '../../../types';
import { fileTypeMatches, isFolderMimeType, normalizeFileId } from './domain';
import { qrScannerError } from './errors';
import { QrScannerDriveRepositoryError } from './driveRepository';
import { QrScannerDriveRepository } from './types';

const DEFAULT_MAX_FOLDER_DEPTH = 8;
const MAX_FOLDER_DEPTH = 20;
const MAX_ANCESTRY_NODES = 64;

interface AuthorizationPolicy {
  allowedFolderIds: string[];
  allowedSharedDriveIds: string[];
  destinationFolderId: string;
  includeDestinationDrive: boolean;
  maxFolderDepth: number;
}

export type QrScannerFileAuthorizationResult =
  | { ok: true; file: { id: string; name: string; mimeType: string } }
  | {
      ok: false;
      code: 'TRASHED' | 'UNSUPPORTED_TYPE' | 'NOT_AUTHORISED_OR_UNAVAILABLE' | 'TEMPORARY_ERROR';
      retryable: boolean;
    };

const uniqueIds = (value: unknown): string[] =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map(item => normalizeFileId(item))
        .filter(Boolean)
    )
  );

export const resolveQrScannerAuthorizationPolicy = (uploadConfig: FileUploadConfig): AuthorizationPolicy => {
  const linkCapture = uploadConfig?.linkCapture || {};
  const authorization = linkCapture.validation || {};
  if (
    linkCapture.enabled === false ||
    (linkCapture.mode && linkCapture.mode !== 'driveQr') ||
    authorization.requireServerValidation !== true
  ) {
    throw qrScannerError('CONFIGURATION_ERROR');
  }
  const destinationFolderId = normalizeFileId(uploadConfig?.destinationFolderId);
  const allowedFolderIds = uniqueIds(authorization.allowedFolderIds);
  if (authorization.includeUploadDestinationFolder === true && destinationFolderId) {
    allowedFolderIds.push(destinationFolderId);
  }
  const configuredDepth = Number(authorization.maxFolderDepth);
  return {
    allowedFolderIds: uniqueIds(allowedFolderIds),
    allowedSharedDriveIds: uniqueIds([
      ...(authorization.allowedSharedDriveIds || []),
      ...(authorization.allowedDriveIds || [])
    ]),
    destinationFolderId,
    includeDestinationDrive: authorization.includeUploadDestinationDrive === true,
    maxFolderDepth: Number.isFinite(configuredDepth)
      ? Math.max(0, Math.min(Math.floor(configuredDepth), MAX_FOLDER_DEPTH))
      : DEFAULT_MAX_FOLDER_DEPTH
  };
};

export class QrScannerFileAuthorizationService {
  constructor(private readonly driveRepository: QrScannerDriveRepository) {}

  resolvePolicy(uploadConfig: FileUploadConfig): AuthorizationPolicy {
    const policy = resolveQrScannerAuthorizationPolicy(uploadConfig || {});
    if (policy.includeDestinationDrive && policy.destinationFolderId) {
      try {
        const destination = this.driveRepository.fetchMetadata(policy.destinationFolderId);
        if (destination.driveId) {
          policy.allowedSharedDriveIds = uniqueIds([...policy.allowedSharedDriveIds, destination.driveId]);
        }
      } catch (error) {
        if (error instanceof QrScannerDriveRepositoryError && error.retryable) {
          throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
        }
      }
    }
    if (!policy.allowedFolderIds.length && !policy.allowedSharedDriveIds.length) {
      throw qrScannerError('CONFIGURATION_ERROR');
    }
    return policy;
  }

  authorize(fileId: string, uploadConfig: FileUploadConfig): QrScannerFileAuthorizationResult {
    try {
      const policy = this.resolvePolicy(uploadConfig);
      const metadata = this.driveRepository.fetchMetadata(fileId);
      if (metadata.trashed) return { ok: false, code: 'TRASHED', retryable: false };
      if (metadata.shortcut || isFolderMimeType(metadata.mimeType)) {
        return { ok: false, code: 'NOT_AUTHORISED_OR_UNAVAILABLE', retryable: false };
      }
      if (!fileTypeMatches(metadata.name, metadata.mimeType, uploadConfig)) {
        return { ok: false, code: 'UNSUPPORTED_TYPE', retryable: false };
      }
      if (!this.belongsToAllowedScope(metadata.parentIds, metadata.driveId, policy)) {
        return { ok: false, code: 'NOT_AUTHORISED_OR_UNAVAILABLE', retryable: false };
      }
      return {
        ok: true,
        file: { id: metadata.id || fileId, name: metadata.name || 'Drive file', mimeType: metadata.mimeType || '' }
      };
    } catch (error) {
      if (
        (error instanceof QrScannerDriveRepositoryError && error.retryable) ||
        ((error as any)?.code === 'TEMPORARY_ERROR' && (error as any)?.retryable === true)
      ) {
        return { ok: false, code: 'TEMPORARY_ERROR', retryable: true };
      }
      if ((error as any)?.code === 'CONFIGURATION_ERROR') throw error;
      return { ok: false, code: 'NOT_AUTHORISED_OR_UNAVAILABLE', retryable: false };
    }
  }

  private belongsToAllowedScope(
    initialParentIds: string[],
    fileDriveId: string | undefined,
    policy: AuthorizationPolicy
  ): boolean {
    const allowedDrives = new Set(policy.allowedSharedDriveIds);
    if (fileDriveId && allowedDrives.has(fileDriveId)) return true;
    const allowedFolders = new Set(policy.allowedFolderIds);
    if (!allowedFolders.size) return false;

    const frontier = uniqueIds(initialParentIds).map(id => ({ id, depth: 1 }));
    const visited = new Set<string>();
    let inspected = 0;
    while (frontier.length) {
      const current = frontier.shift();
      if (!current || visited.has(current.id)) continue;
      if (allowedFolders.has(current.id)) return true;
      if (current.depth >= policy.maxFolderDepth) continue;
      visited.add(current.id);
      inspected += 1;
      if (inspected > MAX_ANCESTRY_NODES) return false;

      const parent = this.driveRepository.fetchMetadata(current.id);
      if (parent.trashed) return false;
      if (parent.driveId && allowedDrives.has(parent.driveId)) return true;
      if (!isFolderMimeType(parent.mimeType)) continue;
      uniqueIds(parent.parentIds).forEach(parentId => {
        if (!visited.has(parentId)) frontier.push({ id: parentId, depth: current.depth + 1 });
      });
    }
    return false;
  }
}
