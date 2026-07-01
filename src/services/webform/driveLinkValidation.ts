import { QuestionConfig } from '../../types';
import { debugLog } from './debug';
import { getDriveApiFile } from './driveApi';

type UploadConfig = QuestionConfig['uploadConfig'];

type DriveScope = {
  allowedDriveIds: Set<string>;
  allowedFolderIds: Set<string>;
  rejectTrashed: boolean;
  maxFolderDepth: number;
};

export type DriveLinkValidationErrorCode =
  | 'notDriveFile'
  | 'scopeMissing'
  | 'notAccessible'
  | 'trashed'
  | 'outOfScope';

export const DRIVE_LINK_VALIDATION_ERROR_PREFIX = 'CK_UPLOAD_LINK_VALIDATION:';

const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;
const DEFAULT_MAX_FOLDER_DEPTH = 8;

const DEFAULT_VALIDATION_MESSAGES: Record<DriveLinkValidationErrorCode, string> = {
  notDriveFile: 'Receipt evidence links must be Google Drive file links.',
  scopeMissing: 'Receipt link validation is enabled but no allowed customer Drive scope is configured.',
  notAccessible: 'Receipt evidence link is not accessible from the configured customer Drive.',
  trashed: 'Receipt evidence link points to a trashed Drive file.',
  outOfScope: 'Receipt evidence link must point to a file in the configured customer Drive.'
};

const normalizeString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  return raw.toString().trim();
};

const normalizeStringArray = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw
        .map(item => normalizeString(item))
        .filter(Boolean)
    : [];

const firstUrlOrValue = (raw: string): string => {
  const match = raw.match(/https?:\/\/[^\s,]+/i);
  return (match?.[0] || raw).trim();
};

const tryDecodeURIComponent = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const tryDecodeUrlComponent = (raw: string): string => tryDecodeURIComponent(raw.replace(/\+/g, ' '));

const extractUrlHost = (raw: string): string => {
  const match = raw.match(/^https?:\/\/([^/?#\s]+)/i);
  const authority = (match?.[1] || '').trim();
  if (!authority) return '';
  const withoutCredentials = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return withoutCredentials.replace(/:\d+$/, '').toLowerCase();
};

const extractUrlParamValues = (raw: string, paramNames: string[]): string[] => {
  const questionIndex = raw.indexOf('?');
  if (questionIndex < 0) return [];
  const hashIndex = raw.indexOf('#', questionIndex + 1);
  const query = raw.slice(questionIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
  if (!query) return [];
  const wanted = new Set(paramNames.map(param => param.toLowerCase()));
  const values: string[] = [];
  query.split('&').forEach(part => {
    if (!part) return;
    const equalsIndex = part.indexOf('=');
    const rawKey = equalsIndex >= 0 ? part.slice(0, equalsIndex) : part;
    const rawValue = equalsIndex >= 0 ? part.slice(equalsIndex + 1) : '';
    const key = tryDecodeUrlComponent(rawKey).toLowerCase();
    if (!wanted.has(key) || !rawValue) return;
    values.push(tryDecodeUrlComponent(rawValue));
  });
  return values;
};

const unescapeUrlText = (raw: string): string =>
  raw
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u003f/gi, '?')
    .replace(/&amp;/gi, '&');

const pushCandidate = (queue: string[], seen: Set<string>, raw: unknown): void => {
  const value = normalizeString(raw);
  if (!value || seen.has(value)) return;
  seen.add(value);
  queue.push(value);
};

const pushJsonUrlCandidates = (queue: string[], seen: Set<string>, raw: string): void => {
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return;
  try {
    const parsed = JSON.parse(raw);
    const visit = (value: unknown, depth: number): void => {
      if (depth > 3 || value === undefined || value === null) return;
      if (typeof value === 'string' || typeof value === 'number') {
        pushCandidate(queue, seen, value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(item => visit(item, depth + 1));
        return;
      }
      if (typeof value === 'object') {
        ['value', 'url', 'href', 'link', 'rawValue', 'raw'].forEach(key => visit((value as any)[key], depth + 1));
      }
    };
    visit(parsed, 0);
  } catch {
    // Ignore non-JSON candidates.
  }
};

const collectDriveLinkCandidates = (value: string): string[] => {
  const queue: string[] = [];
  const seen = new Set<string>();
  pushCandidate(queue, seen, value);

  for (let index = 0; index < queue.length && index < 24; index += 1) {
    const current = queue[index];
    const firstUrl = firstUrlOrValue(current);
    pushCandidate(queue, seen, firstUrl);
    pushCandidate(queue, seen, tryDecodeURIComponent(current));
    pushCandidate(queue, seen, unescapeUrlText(current));
    pushCandidate(queue, seen, unescapeUrlText(tryDecodeURIComponent(current)));
    pushJsonUrlCandidates(queue, seen, current);

    if (!/^https?:\/\//i.test(firstUrl)) continue;
    extractUrlParamValues(firstUrl, ['id', 'q', 'url', 'u', 'continue', 'target']).forEach(rawParam => {
      pushCandidate(queue, seen, rawParam);
    });
  }

  return queue;
};

const isAllowedDriveHost = (raw: string): boolean => {
  if (!/^https?:\/\//i.test(raw)) return true;
  const host = extractUrlHost(raw);
  return (
    host === 'drive.google.com' ||
    host === 'docs.google.com' ||
    host === 'googleusercontent.com' ||
    host === 'drive.usercontent.google.com' ||
    host.endsWith('.googleusercontent.com')
  );
};

export const extractDriveFileIdForValidation = (value: string): string => {
  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/(?:document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/
  ];

  for (const candidate of collectDriveLinkCandidates(normalizeString(value))) {
    const raw = firstUrlOrValue(candidate);
    if (!raw || !isAllowedDriveHost(raw)) continue;
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) return match[1];
    }
    if (DRIVE_FILE_ID_RE.test(raw)) return raw;
  }

  return '';
};

const validationError = (code: DriveLinkValidationErrorCode, fileId?: string): Error => {
  const fileIdPart = fileId ? `fileId=${fileId}: ` : '';
  return new Error(`${DRIVE_LINK_VALIDATION_ERROR_PREFIX}${code}: ${fileIdPart}${DEFAULT_VALIDATION_MESSAGES[code]}`);
};

const canonicalDriveUrl = (fileId: string): string => `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;

const parentIds = (meta: GoogleAppsScript.Drive.Schema.File | null | undefined): string[] => {
  const parents = (meta as any)?.parents;
  if (!Array.isArray(parents)) return [];
  return parents
    .map(parent => (typeof parent === 'string' ? parent : parent?.id))
    .map(parent => normalizeString(parent))
    .filter(Boolean);
};

const metadataDriveId = (meta: GoogleAppsScript.Drive.Schema.File | null | undefined): string =>
  normalizeString((meta as any)?.driveId || (meta as any)?.teamDriveId);

const isTrashed = (meta: GoogleAppsScript.Drive.Schema.File | null | undefined): boolean =>
  Boolean((meta as any)?.trashed === true || (meta as any)?.labels?.trashed === true);

const metadataUrl = (meta: GoogleAppsScript.Drive.Schema.File | null | undefined, fileId: string): string =>
  normalizeString((meta as any)?.webViewLink || (meta as any)?.alternateLink) || canonicalDriveUrl(fileId);

const resolveValidationConfig = (uploadConfig?: UploadConfig): any | null => {
  const linkCapture = (uploadConfig as any)?.linkCapture;
  if (!linkCapture || linkCapture.enabled === false) return null;
  const validation = linkCapture.validation;
  if (!validation || validation.requireServerValidation !== true) return null;
  return validation;
};

export const requiresDriveLinkServerValidation = (uploadConfig?: UploadConfig): boolean =>
  Boolean(resolveValidationConfig(uploadConfig));

export class DriveLinkScopeValidator {
  private metadataCache = new Map<string, GoogleAppsScript.Drive.Schema.File | null>();

  validateCapturedLink(rawValue: string, uploadConfig?: UploadConfig): string {
    const validation = resolveValidationConfig(uploadConfig);
    const raw = normalizeString(rawValue);
    if (!validation || !raw) return raw;

    const fileId = extractDriveFileIdForValidation(raw);
    if (!fileId) {
      debugLog('upload.linkCapture.validation.invalidDriveLink', { raw: raw.slice(0, 160) });
      throw validationError('notDriveFile');
    }

    const scope = this.resolveScope(validation, uploadConfig);
    if (!scope.allowedDriveIds.size && !scope.allowedFolderIds.size) {
      throw validationError('scopeMissing');
    }

    const meta = this.getMetadata(fileId, 'upload.linkCapture.file');
    if (!meta) {
      throw validationError('notAccessible', fileId);
    }
    if (scope.rejectTrashed && isTrashed(meta)) {
      throw validationError('trashed', fileId);
    }

    const driveId = metadataDriveId(meta);
    if (driveId && scope.allowedDriveIds.has(driveId)) {
      return metadataUrl(meta, fileId);
    }

    if (this.isInAllowedFolder(meta, scope)) {
      return metadataUrl(meta, fileId);
    }

    debugLog('upload.linkCapture.validation.rejected', {
      fileId,
      driveId: driveId || null,
      parentIds: parentIds(meta),
      allowedDriveIds: Array.from(scope.allowedDriveIds),
      allowedFolderIds: Array.from(scope.allowedFolderIds)
    });
    throw validationError('outOfScope', fileId);
  }

  private resolveScope(validation: any, uploadConfig?: UploadConfig): DriveScope {
    const allowedDriveIds = new Set<string>([
      ...normalizeStringArray(validation.allowedSharedDriveIds),
      ...normalizeStringArray(validation.allowedDriveIds)
    ]);
    const allowedFolderIds = new Set<string>(normalizeStringArray(validation.allowedFolderIds));
    const destinationFolderId = normalizeString(uploadConfig?.destinationFolderId);

    if (validation.includeUploadDestinationFolder === true && destinationFolderId) {
      allowedFolderIds.add(destinationFolderId);
    }

    if (validation.includeUploadDestinationDrive === true && destinationFolderId) {
      const folderMeta = this.getMetadata(destinationFolderId, 'upload.linkCapture.destinationFolder');
      const destinationDriveId = metadataDriveId(folderMeta);
      if (destinationDriveId) allowedDriveIds.add(destinationDriveId);
    }

    const rawDepth = Number(validation.maxFolderDepth);
    const maxFolderDepth = Number.isFinite(rawDepth) && rawDepth > 0 ? Math.floor(rawDepth) : DEFAULT_MAX_FOLDER_DEPTH;
    return {
      allowedDriveIds,
      allowedFolderIds,
      rejectTrashed: validation.rejectTrashed !== false,
      maxFolderDepth
    };
  }

  private isInAllowedFolder(meta: GoogleAppsScript.Drive.Schema.File, scope: DriveScope): boolean {
    if (!scope.allowedFolderIds.size) return false;
    const queue = parentIds(meta).map(id => ({ id, depth: 1 }));
    const visited = new Set<string>();

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      if (scope.allowedFolderIds.has(current.id)) return true;
      if (current.depth >= scope.maxFolderDepth) continue;

      const parentMeta = this.getMetadata(current.id, 'upload.linkCapture.parentFolder');
      parentIds(parentMeta).forEach(parentId => {
        if (!visited.has(parentId)) queue.push({ id: parentId, depth: current.depth + 1 });
      });
    }

    return false;
  }

  private getMetadata(fileId: string, context: string): GoogleAppsScript.Drive.Schema.File | null {
    const id = normalizeString(fileId);
    if (!id) return null;
    if (this.metadataCache.has(id)) return this.metadataCache.get(id) || null;
    const meta = getDriveApiFile(id, context);
    this.metadataCache.set(id, meta);
    return meta;
  }
}
