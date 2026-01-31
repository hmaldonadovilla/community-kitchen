import { QuestionConfig } from '../../types';
import { debugLog } from './debug';

export class UploadService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;

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
    const urls: string[] = [];

    limitedFiles.forEach(file => {
      // Preserve already-uploaded URLs (e.g., when editing an existing record)
      if (typeof file === 'string') {
        const raw = file.toString().trim();
        if (raw) {
          raw
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(url => urls.push(url));
        }
        return;
      }
      if (file && typeof file === 'object' && typeof (file as any).url === 'string') {
        const url = ((file as any).url as string).trim();
        if (url) {
          urls.push(url);
          return;
        }
      }

      const blob = toBlob(file);
      if (!blob) return;

      const name = blob.getName();
      const bytes = blob.getBytes();
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

      try {
        const url = target.createFile(blob);
        if (url) urls.push(url);
      } catch (err: any) {
        const sizeMb = bytes ? Math.round((bytes.length / (1024 * 1024)) * 100) / 100 : 0;
        const msg = (err?.message || err?.toString?.() || 'Drive createFile failed.').toString();
        throw new Error(
          `Drive createFile failed (folderId=${folderId || 'unknown'}, name=${name || 'upload'}, sizeMb=${sizeMb}). ${msg}`
        );
      }
    });

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

  private resolveUploadTarget(uploadConfig?: QuestionConfig['uploadConfig']): {
    folderId: string | null;
    folderName: string | null;
    resolvedBy: 'DriveApp' | 'DriveAPI';
    createFile: (blob: GoogleAppsScript.Base.Blob) => string;
  } {
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
