import { QuestionConfig } from '../../types';
import { debugLog } from './debug';
import { DriveLinkScopeValidator } from './driveLinkValidation';
import { trashDriveApiFile } from './driveApi';

const DRIVE_MULTIPART_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&supportsAllDrives=true&fields=id%2CalternateLink%2CwebViewLink';
const DEFAULT_SERVER_UPLOAD_CONCURRENCY = 3;
const MAX_SERVER_UPLOAD_CONCURRENCY = 5;

type UploadTarget = {
  folderId: string | null;
  folderName: string | null;
  resolvedBy: 'DriveApp' | 'DriveAPI';
  createFile: (blob: GoogleAppsScript.Base.Blob) => string;
};

type PreparedUploadEntry =
  | { kind: 'url'; url: string }
  | {
      kind: 'blob';
      blob: GoogleAppsScript.Base.Blob;
      name: string;
      mime: string;
      bytes: number[];
      sizeMb: number;
    };

type DriveUploadResult = {
  url: string;
  fileId?: string;
};

export class UploadService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private driveLinkValidator = new DriveLinkScopeValidator();

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
  }

  saveFiles(files: any, uploadConfig?: QuestionConfig['uploadConfig']): string {
    if (!files) return '';
    const fileArray = Array.isArray(files) ? files : [files];
    const limitedFiles = uploadConfig?.maxFiles ? fileArray.slice(0, uploadConfig.maxFiles) : fileArray;

    const toBlob = (file: any): GoogleAppsScript.Base.Blob | null => {
      if (!file) return null;
      if (typeof file.getBytes === 'function') return file as GoogleAppsScript.Base.Blob;

      const dataStr = (file.data || file.dataUrl || '').toString();
      if (!dataStr) return null;
      const parts = dataStr.split(',');
      const base64 = parts.length > 1 ? parts[1] : parts[0];
      const inferredMime = parts[0]?.match(/data:(.*);base64/)?.[1];
      const mime = (file as any).type || inferredMime || 'application/octet-stream';
      const bytes = (Utilities as any).base64Decode ? (Utilities as any).base64Decode(base64) : [];
      const name = (file as any).name || 'upload';
      return Utilities.newBlob(bytes, mime, name);
    };

    const target = this.resolveUploadTarget(uploadConfig);
    const folderId = target.folderId || '';
    const folderName = target.folderName || '';
    debugLog('upload.folder.resolve', {
      folderId: folderId || null,
      folderName: folderName || null,
      destinationFolderId: uploadConfig?.destinationFolderId || null,
      resolvedBy: target.resolvedBy
    });
    const entries: PreparedUploadEntry[] = [];

    limitedFiles.forEach(file => {
      // Preserve already-uploaded URLs (e.g., when editing an existing record)
      if (typeof file === 'string') {
        const raw = file.toString().trim();
        if (raw) {
          raw
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(url =>
              entries.push({
                kind: 'url',
                url: this.driveLinkValidator.validateCapturedLink(url, uploadConfig)
              })
            );
        }
        return;
      }
      if (file && typeof file === 'object' && typeof (file as any).url === 'string') {
        const url = ((file as any).url as string).trim();
        if (url) {
          entries.push({ kind: 'url', url: this.driveLinkValidator.validateCapturedLink(url, uploadConfig) });
          return;
        }
      }

      const blob = toBlob(file);
      if (!blob) return;

      const name = (blob.getName() || 'upload').toString();
      const bytes = Array.from((blob.getBytes() || []) as ArrayLike<number>);
      const isEmpty = Array.isArray(bytes) && bytes.length === 0;
      if (isEmpty) return;

      if (uploadConfig?.allowedExtensions && name) {
        const lower = name.toLowerCase();
        const allowed = uploadConfig.allowedExtensions.map(ext => ext.toLowerCase().replace('.', ''));
        const isAllowed = allowed.some(ext => lower.endsWith(ext));
        if (!isAllowed) return;
      } else if (uploadConfig?.allowedExtensions && !name) {
        // Cannot validate extension without a name; skip to avoid trash files
        return;
      }

      if (uploadConfig?.maxFileSizeMb && bytes) {
        const sizeMb = bytes.length / (1024 * 1024);
        if (sizeMb > uploadConfig.maxFileSizeMb) return;
      }

      entries.push({
        kind: 'blob',
        blob,
        name,
        mime:
          typeof (blob as any).getContentType === 'function'
            ? blob.getContentType() || 'application/octet-stream'
            : 'application/octet-stream',
        bytes,
        sizeMb: bytes ? Math.round((bytes.length / (1024 * 1024)) * 100) / 100 : 0
      });
    });

    const uploadedBlobUrls = this.uploadPreparedBlobs(entries, target, uploadConfig);
    let blobIndex = 0;
    const urls = entries
      .map(entry => {
        if (entry.kind === 'url') return entry.url;
        const url = uploadedBlobUrls[blobIndex++] || '';
        return url;
      })
      .filter(Boolean);

    // De-dupe while preserving order
    const seen = new Set<string>();
    const deduped = urls.filter(url => {
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    return deduped.join(', ');
  }

  private uploadPreparedBlobs(
    entries: PreparedUploadEntry[],
    target: UploadTarget,
    uploadConfig?: QuestionConfig['uploadConfig']
  ): string[] {
    const blobs = entries.filter((entry): entry is Extract<PreparedUploadEntry, { kind: 'blob' }> => entry.kind === 'blob');
    if (!blobs.length) return [];
    if (blobs.length > 1) {
      const concurrency = this.resolveServerUploadConcurrency(uploadConfig);
      const authHeader = this.resolveDriveRestAuthorizationHeader();
      if (concurrency > 1 && target.folderId && authHeader && this.canUseFetchAll()) {
        const results = this.createFilesViaDriveRestParallel(blobs, target.folderId, authHeader, concurrency);
        return results.map(result => result.url).filter(Boolean);
      }
    }
    return blobs.map(entry => this.createFileSequential(target, entry));
  }

  private createFileSequential(
    target: UploadTarget,
    entry: Extract<PreparedUploadEntry, { kind: 'blob' }>
  ): string {
    try {
      return target.createFile(entry.blob);
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Drive createFile failed.').toString();
      throw new Error(
        `Drive createFile failed (folderId=${target.folderId || 'unknown'}, name=${entry.name || 'upload'}, sizeMb=${entry.sizeMb}). ${msg}`
      );
    }
  }

  private resolveServerUploadConcurrency(uploadConfig?: QuestionConfig['uploadConfig']): number {
    const raw = (uploadConfig as any)?.serverUploadConcurrency;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SERVER_UPLOAD_CONCURRENCY;
    return Math.max(1, Math.min(MAX_SERVER_UPLOAD_CONCURRENCY, Math.floor(parsed)));
  }

  private canUseFetchAll(): boolean {
    return typeof UrlFetchApp !== 'undefined' && typeof (UrlFetchApp as any).fetchAll === 'function';
  }

  private resolveDriveRestAuthorizationHeader(): string {
    if (typeof ScriptApp === 'undefined') return '';
    try {
      const token = ScriptApp.getOAuthToken();
      return token ? `Bearer ${token}` : '';
    } catch {
      return '';
    }
  }

  private createFilesViaDriveRestParallel(
    entries: Array<Extract<PreparedUploadEntry, { kind: 'blob' }>>,
    folderId: string,
    authHeader: string,
    concurrency: number
  ): DriveUploadResult[] {
    const createdFileIds: string[] = [];
    const results: DriveUploadResult[] = [];
    try {
      for (let offset = 0; offset < entries.length; offset += concurrency) {
        const chunk = entries.slice(offset, offset + concurrency);
        const requests = chunk.map(entry => this.buildDriveMultipartUploadRequest(entry, folderId, authHeader));
        debugLog('upload.driveRest.fetchAll.start', { count: chunk.length, concurrency, folderId });
        const responses = (UrlFetchApp as any).fetchAll(requests);
        responses.forEach((response: GoogleAppsScript.URL_Fetch.HTTPResponse, index: number) => {
          const result = this.parseDriveUploadResponse(response, folderId, chunk[index]);
          if (result.fileId) createdFileIds.push(result.fileId);
          results[offset + index] = result;
        });
      }
      return results;
    } catch (err: any) {
      createdFileIds.forEach(fileId => {
        try {
          trashDriveApiFile(fileId);
        } catch {
          // Best-effort cleanup only; preserve the original upload failure.
        }
      });
      throw err;
    }
  }

  private buildDriveMultipartUploadRequest(
    entry: Extract<PreparedUploadEntry, { kind: 'blob' }>,
    folderId: string,
    authHeader: string
  ): GoogleAppsScript.URL_Fetch.URLFetchRequest {
    const boundary = `ck_upload_${Utilities.getUuid().replace(/[^A-Za-z0-9]/g, '')}`;
    const metadata = {
      title: entry.name || 'upload',
      mimeType: entry.mime || 'application/octet-stream',
      parents: [{ id: folderId }]
    };
    const header = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${entry.mime || 'application/octet-stream'}`,
      ''
    ].join('\r\n');
    const footer = `\r\n--${boundary}--`;
    const payload: number[] = [];
    this.encodeTextBytes(`${header}\r\n`).forEach(byte => payload.push(byte));
    entry.bytes.forEach(byte => payload.push(byte));
    this.encodeTextBytes(footer).forEach(byte => payload.push(byte));
    return {
      url: DRIVE_MULTIPART_UPLOAD_URL,
      method: 'post',
      contentType: `multipart/related; boundary=${boundary}`,
      headers: {
        Authorization: authHeader
      },
      muteHttpExceptions: true,
      payload
    } as any;
  }

  private encodeTextBytes(value: string): number[] {
    return Array.from(Utilities.base64Decode(Utilities.base64Encode(value)) as ArrayLike<number>);
  }

  private parseDriveUploadResponse(
    response: GoogleAppsScript.URL_Fetch.HTTPResponse,
    folderId: string,
    entry: Extract<PreparedUploadEntry, { kind: 'blob' }>
  ): DriveUploadResult {
    const code = response.getResponseCode();
    const raw = response.getContentText() || '';
    let body: any = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
    }
    if (code < 200 || code >= 300) {
      const message =
        body?.error?.message ||
        body?.message ||
        raw ||
        `Drive upload failed with HTTP ${code}.`;
      throw new Error(
        `Drive createFile failed (folderId=${folderId || 'unknown'}, name=${entry.name || 'upload'}, sizeMb=${entry.sizeMb}). ${message}`
      );
    }
    const fileId = (body?.id || '').toString().trim();
    const url = (body?.webViewLink || body?.alternateLink || (fileId ? `https://drive.google.com/open?id=${fileId}` : ''))
      .toString()
      .trim();
    if (!url) {
      throw new Error(
        `Drive createFile failed (folderId=${folderId || 'unknown'}, name=${entry.name || 'upload'}, sizeMb=${entry.sizeMb}). Drive upload response did not include a URL.`
      );
    }
    return { url, fileId };
  }

  private resolveUploadTarget(uploadConfig?: QuestionConfig['uploadConfig']): UploadTarget {
    const destinationId = uploadConfig?.destinationFolderId
      ? uploadConfig.destinationFolderId.toString().trim()
      : '';
    if (destinationId) {
      try {
        const folder = DriveApp.getFolderById(destinationId);
        return {
          folderId: folder.getId(),
          folderName: folder.getName(),
          resolvedBy: 'DriveApp',
          createFile: blob => folder.createFile(blob).getUrl()
        };
      } catch (err: any) {
        const msg = (err?.message || err?.toString?.() || 'Failed to access upload folder.').toString();
        const apiMeta = this.getDriveApiFile(destinationId, 'upload.folder.destination');
        if (apiMeta && apiMeta.mimeType === 'application/vnd.google-apps.shortcut') {
          throw new Error(
            `Upload folder id appears to be a shortcut. Use the target folder id (not the shortcut id). (${destinationId})`
          );
        }
        if (apiMeta) {
          const apiMetaAny = apiMeta as any;
          return {
            folderId: destinationId,
            folderName: apiMetaAny.title || apiMetaAny.name || null,
            resolvedBy: 'DriveAPI',
            createFile: blob => this.createFileViaDriveApi(blob, destinationId)
          };
        }
        throw new Error(
          `Upload folder not accessible (id=${destinationId}). ${msg} If this is a shared drive, ensure the script executes as a user who is a member of that drive.`
        );
      }
    }

    try {
      const file = DriveApp.getFileById(this.ss.getId());
      const parents = file.getParents();
      if (parents.hasNext()) {
        const folder = parents.next();
        return {
          folderId: folder.getId(),
          folderName: folder.getName(),
          resolvedBy: 'DriveApp',
          createFile: blob => folder.createFile(blob).getUrl()
        };
      }
    } catch (_) {
      // DriveApp can fail on shared drives; fall back to Drive API
    }

    const apiFile = this.getDriveApiFile(this.ss.getId(), 'upload.folder.spreadsheet');
    const parentId = apiFile?.parents && apiFile.parents.length ? apiFile.parents[0].id : null;
    if (!parentId) {
      throw new Error('Unable to resolve upload folder. No parent folder was returned for the spreadsheet.');
    }
    const parentMeta = this.getDriveApiFile(parentId, 'upload.folder.parent');
    const parentMetaAny = parentMeta as any;
    return {
      folderId: parentId,
      folderName: parentMetaAny?.title || parentMetaAny?.name || null,
      resolvedBy: 'DriveAPI',
      createFile: blob => this.createFileViaDriveApi(blob, parentId)
    };
  }

  private getDriveApiFile(fileId: string, context: string): GoogleAppsScript.Drive.Schema.File | null {
    const drive = (Drive as any) || null;
    if (!drive || !drive.Files || typeof drive.Files.get !== 'function') {
      throw new Error(
        'Drive API not available. Enable the Advanced Drive Service (Drive API) for this Apps Script project.'
      );
    }
    try {
      return drive.Files.get(fileId, { supportsAllDrives: true });
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Drive API get failed.').toString();
      debugLog('upload.driveApi.get.failed', { fileId, context, message: msg });
      return null;
    }
  }

  private createFileViaDriveApi(blob: GoogleAppsScript.Base.Blob, folderId: string): string {
    const drive = (Drive as any) || null;
    if (!drive || !drive.Files || typeof drive.Files.insert !== 'function') {
      throw new Error(
        'Drive API not available. Enable the Advanced Drive Service (Drive API) for this Apps Script project.'
      );
    }
    const resource = {
      title: blob.getName(),
      mimeType: blob.getContentType(),
      parents: [{ id: folderId }]
    };
    const created = drive.Files.insert(resource, blob, { supportsAllDrives: true });
    if (created && (created.webViewLink || created.alternateLink)) {
      return (created.webViewLink || created.alternateLink) as string;
    }
    if (created && created.id) {
      return `https://drive.google.com/open?id=${created.id}`;
    }
    return '';
  }
}
