import { debugLog } from './debug';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

const getDriveService = (): any => {
  const drive = (Drive as any) || null;
  if (!drive || !drive.Files) {
    throw new Error(
      'Drive API not available. Enable the Advanced Drive Service (Drive API) for this Apps Script project.'
    );
  }
  return drive;
};

const getAuthHeaders = (): Record<string, string> => {
  if (typeof ScriptApp === 'undefined' || typeof UrlFetchApp === 'undefined') return {};
  try {
    const token = ScriptApp.getOAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (_) {
    return {};
  }
};

const fetchDriveUrl = (url: string): GoogleAppsScript.Base.Blob | null => {
  if (!url || typeof UrlFetchApp === 'undefined') return null;
  try {
    const res = UrlFetchApp.fetch(url, { headers: getAuthHeaders(), muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) return null;
    return res.getBlob();
  } catch (_) {
    return null;
  }
};

export const getDriveApiFile = (fileId: string, context?: string): GoogleAppsScript.Drive.Schema.File | null => {
  const id = (fileId || '').toString().trim();
  if (!id) return null;
  try {
    const drive = getDriveService();
    return drive.Files.get(id, { supportsAllDrives: true });
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Drive API get failed.').toString();
    debugLog('driveApi.get.failed', { fileId: id, context: context || null, message: msg });
    return null;
  }
};

export const copyDriveApiFile = (
  sourceFileId: string,
  title: string,
  parentId?: string
): GoogleAppsScript.Drive.Schema.File | null => {
  const id = (sourceFileId || '').toString().trim();
  if (!id) return null;
  try {
    const drive = getDriveService();
    const resource: any = { title: title || '' };
    if (parentId) resource.parents = [{ id: parentId }];
    return drive.Files.copy(resource, id, { supportsAllDrives: true });
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Drive API copy failed.').toString();
    debugLog('driveApi.copy.failed', { fileId: id, parentId: parentId || null, message: msg });
    return null;
  }
};

export const createDriveApiFile = (
  blob: GoogleAppsScript.Base.Blob,
  parentId: string
): GoogleAppsScript.Drive.Schema.File | null => {
  if (!blob || !parentId) return null;
  try {
    const drive = getDriveService();
    const resource = {
      title: blob.getName(),
      mimeType: blob.getContentType(),
      parents: [{ id: parentId }]
    };
    return drive.Files.insert(resource, blob, { supportsAllDrives: true });
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Drive API insert failed.').toString();
    debugLog('driveApi.insert.failed', { parentId, message: msg });
    return null;
  }
};

export const exportDriveApiFile = (fileId: string, mimeType: string): GoogleAppsScript.Base.Blob | null => {
  const id = (fileId || '').toString().trim();
  if (!id) return null;
  try {
    const drive = getDriveService();
    if (typeof drive.Files.export === 'function') {
      return drive.Files.export(id, mimeType, { supportsAllDrives: true });
    }
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Drive API export failed.').toString();
    debugLog('driveApi.export.failed', { fileId: id, mimeType, message: msg });
  }
  const meta = getDriveApiFile(id, 'driveApi.export.fallback');
  if (!meta) return null;
  const exportLinks = (meta as any).exportLinks || {};
  const exportUrl = exportLinks[mimeType] || exportLinks['application/pdf'] || '';
  if (exportUrl) return fetchDriveUrl(exportUrl);
  const downloadUrl = (meta as any).downloadUrl || (meta as any).webContentLink || '';
  return downloadUrl ? fetchDriveUrl(downloadUrl) : null;
};

export const trashDriveApiFile = (fileId: string): boolean => {
  const id = (fileId || '').toString().trim();
  if (!id) return false;
  try {
    const drive = getDriveService();
    drive.Files.update({ trashed: true }, id, undefined, { supportsAllDrives: true });
    return true;
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Drive API trash failed.').toString();
    debugLog('driveApi.trash.failed', { fileId: id, message: msg });
    return false;
  }
};

export const readDriveFileAsString = (
  fileId: string,
  preferredExportMimeTypes: string[],
  context?: string
): { raw: string; mimeType?: string } | null => {
  const meta = getDriveApiFile(fileId, context || 'driveApi.read');
  if (!meta) return null;
  const mimeType = (meta.mimeType || '').toString();
  const exportLinks = (meta as any).exportLinks || {};
  const mimeCandidates =
    preferredExportMimeTypes && preferredExportMimeTypes.length
      ? preferredExportMimeTypes
      : mimeType === 'application/vnd.google-apps.document'
      ? ['text/plain']
      : [];
  for (const preferred of mimeCandidates) {
    const url = exportLinks[preferred];
    if (!url) continue;
    const blob = fetchDriveUrl(url);
    if (!blob) continue;
    const raw = blob.getDataAsString();
    if (raw && raw.trim()) return { raw, mimeType: preferred };
  }
  const downloadUrl = (meta as any).downloadUrl || (meta as any).webContentLink || '';
  if (downloadUrl) {
    const blob = fetchDriveUrl(downloadUrl);
    if (blob) {
      const raw = blob.getDataAsString();
      if (raw && raw.trim()) return { raw, mimeType };
    }
  }
  return null;
};

export const resolveDriveApiFolderTarget = (
  folderId: string,
  context?: string
): { folderId: string; folderName?: string | null; resolvedBy: 'DriveAPI' } | null => {
  const id = (folderId || '').toString().trim();
  if (!id) return null;
  const meta = getDriveApiFile(id, context || 'driveApi.folder');
  if (!meta) return null;
  const mimeType = (meta.mimeType || '').toString();
  if (mimeType && mimeType !== DRIVE_FOLDER_MIME) {
    debugLog('driveApi.folder.invalidMime', { folderId: id, mimeType });
    return null;
  }
  const metaAny = meta as any;
  return { folderId: id, folderName: metaAny.title || metaAny.name || null, resolvedBy: 'DriveAPI' };
};

export const fetchDriveFileBlob = (fileId: string, context?: string): GoogleAppsScript.Base.Blob | null => {
  const id = (fileId || '').toString().trim();
  if (!id) return null;
  try {
    const file = DriveApp.getFileById(id);
    if (file) return file.getBlob();
  } catch (_) {
    // DriveApp can fail on shared drives or missing permissions; fallback to Drive API below.
  }
  const meta = getDriveApiFile(id, context || 'driveApi.blob');
  if (!meta) return null;
  const downloadUrl = (meta as any).downloadUrl || (meta as any).webContentLink || '';
  if (downloadUrl) return fetchDriveUrl(downloadUrl);
  const exportLinks = (meta as any).exportLinks || {};
  const preferred = exportLinks['application/pdf'] || exportLinks['text/plain'] || '';
  return preferred ? fetchDriveUrl(preferred) : null;
};

export const findDriveFileByNameInFolder = (
  folderId: string,
  name: string,
  context?: string
): { fileId: string; url?: string } | null => {
  const folder = (folderId || '').toString().trim();
  const fileName = (name || '').toString().trim();
  if (!folder || !fileName) return null;
  try {
    const folderRef = DriveApp.getFolderById(folder);
    const files = folderRef.getFilesByName(fileName);
    let latest: GoogleAppsScript.Drive.File | null = null;
    let latestTime = 0;
    while (files.hasNext()) {
      const file = files.next();
      const updated = file.getLastUpdated();
      const ts = updated ? updated.getTime() : 0;
      if (!latest || ts > latestTime) {
        latest = file;
        latestTime = ts;
      }
    }
    if (latest) {
      return { fileId: latest.getId(), url: latest.getUrl() };
    }
  } catch (_) {
    // fall back to Drive API below
  }
  try {
    const drive = getDriveService();
    const escaped = fileName.replace(/'/g, "\\'");
    const q = `'${folder}' in parents and title = '${escaped}' and trashed = false`;
    const result = drive.Files.list({
      q,
      maxResults: 10,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    const items = (result as any)?.items || (result as any)?.files || [];
    if (!Array.isArray(items) || !items.length) return null;
    const pickTime = (item: any): number => {
      const raw = item.modifiedDate || item.modifiedTime || item.createdDate || item.createdTime || '';
      const ts = Date.parse(raw);
      return Number.isFinite(ts) ? ts : 0;
    };
    const best = items.reduce((acc: any, item: any) => {
      const ts = pickTime(item);
      if (!acc || ts > pickTime(acc)) return item;
      return acc;
    }, null as any);
    if (!best || !best.id) return null;
    const url =
      best.webViewLink ||
      best.alternateLink ||
      (best.id ? `https://drive.google.com/open?id=${best.id}` : '');
    return { fileId: best.id, url: url || undefined };
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Drive API list failed.').toString();
    debugLog('driveApi.list.failed', { folderId: folder, name: fileName, context: context || null, message: msg });
    return null;
  }
};
