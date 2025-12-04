import { QuestionConfig } from '../../types';

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

    const folder = this.getUploadFolder(uploadConfig);
    const urls: string[] = [];

    limitedFiles.forEach(file => {
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

      const created = folder.createFile(blob);
      urls.push(created.getUrl());
    });

    return urls.join(', ');
  }

  private getUploadFolder(uploadConfig?: QuestionConfig['uploadConfig']): GoogleAppsScript.Drive.Folder {
    if (uploadConfig?.destinationFolderId) {
      return DriveApp.getFolderById(uploadConfig.destinationFolderId);
    }

    const file = DriveApp.getFileById(this.ss.getId());
    const parents = file.getParents();
    if (parents.hasNext()) return parents.next();
    return DriveApp.getRootFolder();
  }
}
