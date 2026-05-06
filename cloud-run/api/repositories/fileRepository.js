const { createGoogleDriveClient } = require('../googleDriveClient');

const GOOGLE_APPS_DOCUMENT_MIME = 'application/vnd.google-apps.document';
const HTML_MIME_TYPE = 'text/html';
const PDF_MIME_TYPE = 'application/pdf';

const splitUrls = value =>
  (value || '')
    .toString()
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

const normalizeExtensions = uploadConfig =>
  Array.isArray(uploadConfig && uploadConfig.allowedExtensions)
    ? uploadConfig.allowedExtensions
        .map(ext => (ext === undefined || ext === null ? '' : ext.toString().trim().toLowerCase().replace(/^\./, '')))
        .filter(Boolean)
    : [];

const resolveFileName = file =>
  (file && (file.name || file.fileName || file.filename) ? file.name || file.fileName || file.filename : 'upload')
    .toString()
    .trim() || 'upload';

const isTextMimeType = mimeType => {
  const normalized = (mimeType || '').toString().trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('text/')) return true;
  if (normalized === 'application/json' || normalized === 'application/xml' || normalized === 'application/xhtml+xml') return true;
  return normalized.endsWith('+json') || normalized.endsWith('+xml');
};

const bufferToText = buffer => {
  if (!buffer) return '';
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return bytes.toString('utf8');
};

const parseDataUrl = value => {
  const raw = (value || '').toString();
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(raw);
  if (!match) return null;
  return {
    mimeType: match[1] || '',
    base64: match[2] ? match[3] || '' : Buffer.from(decodeURIComponent(match[3] || ''), 'utf8').toString('base64')
  };
};

const parseUploadBuffer = file => {
  if (!file || typeof file !== 'object') return null;
  if (Array.isArray(file.bytes)) {
    return {
      buffer: Buffer.from(file.bytes),
      mimeType: (file.mimeType || file.type || '').toString()
    };
  }
  const dataUrl = parseDataUrl(file.dataUrl || file.data || '');
  if (dataUrl) {
    return {
      buffer: Buffer.from(dataUrl.base64.replace(/\s+/g, ''), 'base64'),
      mimeType: (file.mimeType || file.type || dataUrl.mimeType || '').toString()
    };
  }
  const base64 = (file.base64 || '').toString().trim();
  if (base64) {
    return {
      buffer: Buffer.from(base64.replace(/^data:[^,]+,/, '').replace(/\s+/g, ''), 'base64'),
      mimeType: (file.mimeType || file.type || '').toString()
    };
  }
  return null;
};

const isUploadPayload = value => {
  if (!value) return false;
  if (Array.isArray(value)) return value.some(isUploadPayload);
  if (typeof value !== 'object') return false;
  return Boolean(value.dataUrl || value.data || value.base64 || Array.isArray(value.bytes));
};

const isDriveServiceAccountQuotaError = err => {
  const message = (err && err.message ? err.message : err && err.toString ? err.toString() : '').toString().toLowerCase();
  return message.includes('service accounts do not have storage quota');
};

const dedupeUrls = urls => {
  const seen = new Set();
  return urls.filter(url => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

class GoogleDriveFileRepository {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.driveClient = options.driveClient || createGoogleDriveClient(options);
  }

  async fetchDriveFileMetadata(fileId) {
    const metadata = await this.driveClient.getFileMetadata(fileId);
    return {
      id: metadata.id || fileId,
      name: metadata.name || '',
      mimeType: metadata.mimeType || '',
      size: metadata.size !== undefined && metadata.size !== null ? Number(metadata.size) : null,
      modifiedTime: metadata.modifiedTime || null,
      webViewLink: metadata.webViewLink || '',
      webContentLink: metadata.webContentLink || '',
      accessible: true
    };
  }

  async readTextFile(fileId, preferredExportMimeTypes = ['text/plain']) {
    const id = (fileId || '').toString().trim();
    if (!id) throw new Error('Google Drive file id is required.');
    const metadata = await this.driveClient.getFileMetadata(id, 'id,name,mimeType,size,modifiedTime,webViewLink,webContentLink');
    const mimeType = (metadata.mimeType || '').toString();
    const preferred = Array.isArray(preferredExportMimeTypes)
      ? preferredExportMimeTypes.map(item => (item || '').toString().trim()).filter(Boolean)
      : [];

    if (mimeType === GOOGLE_APPS_DOCUMENT_MIME) {
      const exportMimes = preferred.length ? preferred : ['text/plain'];
      let lastError = '';
      for (const exportMime of exportMimes) {
        try {
          const buffer = await this.driveClient.exportFile(id, exportMime);
          const raw = bufferToText(buffer);
          if (raw.trim()) {
            return { id, name: metadata.name || '', mimeType: exportMime, raw };
          }
        } catch (err) {
          lastError = err && err.message ? err.message : err && err.toString ? err.toString() : '';
        }
      }
      throw new Error(lastError || `Unable to export Google Doc ${id}.`);
    }

    if (mimeType && !isTextMimeType(mimeType)) {
      throw new Error(`Drive file ${id} is not a text file (${mimeType}).`);
    }
    const buffer = await this.driveClient.downloadFile(id);
    const raw = bufferToText(buffer);
    if (!raw.trim()) throw new Error(`Drive file ${id} is empty or could not be read.`);
    return { id, name: metadata.name || '', mimeType: mimeType || 'text/plain', raw };
  }

  async downloadFileBuffer(fileId) {
    const id = (fileId || '').toString().trim();
    if (!id) throw new Error('Google Drive file id is required.');
    const metadata = await this.driveClient.getFileMetadata(id, 'id,name,mimeType,size,modifiedTime,webViewLink,webContentLink');
    const buffer = await this.driveClient.downloadFile(id);
    return {
      id,
      name: metadata.name || id,
      mimeType: metadata.mimeType || '',
      buffer
    };
  }

  async trashFile(fileId) {
    const id = (fileId || '').toString().trim();
    if (!id) throw new Error('Google Drive file id is required.');
    await this.driveClient.trashFile(id);
    return { success: true };
  }

  async copyFile(fileId, { name, folderId, mimeType } = {}) {
    const id = (fileId || '').toString().trim();
    if (!id) throw new Error('Google Drive file id is required.');
    const targetFolderId = (folderId || '').toString().trim();
    const metadata = {
      ...(name ? { name: name.toString().trim() } : {}),
      ...(mimeType ? { mimeType: mimeType.toString().trim() } : {}),
      ...(targetFolderId ? { parents: [targetFolderId] } : {})
    };
    try {
      const copied = await this.driveClient.copyFile(id, metadata);
      const fileIdOut = copied && copied.id ? copied.id.toString() : '';
      return {
        fileId: fileIdOut,
        id: fileIdOut,
        name: (copied && copied.name) || metadata.name || '',
        mimeType: (copied && copied.mimeType) || metadata.mimeType || '',
        url:
          (copied && (copied.webViewLink || copied.webContentLink)) ||
          (fileIdOut ? `https://docs.google.com/document/d/${fileIdOut}/edit` : '')
      };
    } catch (err) {
      if (isDriveServiceAccountQuotaError(err)) {
        throw new Error(
          'Cloud Run Drive artifact writes with service accounts require a Shared Drive folder. Move the configured PDF/upload folder to a Shared Drive folder, share it with the Cloud Run runtime service account, or keep artifact writes on Apps Script.'
        );
      }
      throw err;
    }
  }

  getDefaultSpreadsheetId() {
    return (
      this.env.CK_DEFAULT_SPREADSHEET_ID ||
      this.env.CK_GOOGLE_SHEETS_SPREADSHEET_ID ||
      this.env.CK_SPREADSHEET_ID ||
      ''
    )
      .toString()
      .trim();
  }

  async resolveUploadFolderId(uploadConfig, context = {}) {
    const explicit = (
      (uploadConfig && (uploadConfig.destinationFolderId || uploadConfig.folderId || uploadConfig.driveFolderId)) ||
      this.env.CK_UPLOAD_FOLDER_ID ||
      this.env.CK_DEFAULT_UPLOAD_FOLDER_ID ||
      ''
    )
      .toString()
      .trim();
    if (explicit) return explicit;

    const spreadsheetId = (context.spreadsheetId || this.getDefaultSpreadsheetId()).toString().trim();
    if (!spreadsheetId) {
      throw new Error('Upload folder is not configured. Set uploadConfig.destinationFolderId or CK_UPLOAD_FOLDER_ID.');
    }
    const metadata = await this.driveClient.getFileMetadata(spreadsheetId, 'id,name,mimeType,parents');
    const parents = Array.isArray(metadata.parents) ? metadata.parents : [];
    const parent = parents[0];
    const parentId = parent && typeof parent === 'object' ? parent.id : parent;
    if (!parentId) {
      throw new Error(`Unable to resolve upload folder from spreadsheet ${spreadsheetId}.`);
    }
    return parentId.toString();
  }

  async saveFiles(files, uploadConfig, context = {}) {
    if (!files) return '';
    const fileArray = Array.isArray(files) ? files : [files];
    const limitedFiles = uploadConfig && uploadConfig.maxFiles ? fileArray.slice(0, Number(uploadConfig.maxFiles)) : fileArray;
    const allowedExtensions = normalizeExtensions(uploadConfig);
    const maxFileSizeMb = Number(uploadConfig && uploadConfig.maxFileSizeMb);
    const maxBytes = Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0 ? maxFileSizeMb * 1024 * 1024 : undefined;
    const urls = [];
    let folderId = '';

    for (const file of limitedFiles) {
      if (typeof file === 'string') {
        urls.push(...splitUrls(file));
        continue;
      }
      if (file && typeof file === 'object' && typeof file.url === 'string') {
        const url = file.url.trim();
        if (url) urls.push(url);
        continue;
      }

      const parsed = parseUploadBuffer(file);
      if (!parsed || !parsed.buffer || parsed.buffer.length === 0) continue;
      const name = resolveFileName(file);
      if (allowedExtensions.length) {
        const lower = name.toLowerCase();
        const allowed = allowedExtensions.some(ext => lower.endsWith(`.${ext}`) || lower.endsWith(ext));
        if (!allowed) continue;
      }
      if (maxBytes !== undefined && parsed.buffer.length > maxBytes) continue;

      if (!folderId) folderId = await this.resolveUploadFolderId(uploadConfig, context);
      const mimeType = (file.mimeType || file.type || parsed.mimeType || 'application/octet-stream').toString() || 'application/octet-stream';
      let created;
      try {
        created = await this.driveClient.uploadFile(
          {
            name,
            mimeType,
            buffer: parsed.buffer
          },
          { folderId }
        );
      } catch (err) {
        if (isDriveServiceAccountQuotaError(err)) {
          throw new Error(
            'Cloud Run Drive uploads with service accounts require a Shared Drive upload folder. Move the configured destinationFolderId or CK_UPLOAD_FOLDER_ID to a Shared Drive folder, share it with the Cloud Run runtime service account, or keep upload writes on Apps Script.'
          );
        }
        throw err;
      }
      const url =
        (created && (created.webViewLink || created.webContentLink)) ||
        (created && created.id ? `https://drive.google.com/open?id=${created.id}` : '');
      if (url) urls.push(url);
    }

    return dedupeUrls(urls).join(', ');
  }

  async createFile(file, options = {}) {
    const folderId = (options.folderId || '').toString().trim();
    if (!folderId) throw new Error('Drive folder id is required.');
    try {
      return await this.driveClient.uploadFile(file, {
        folderId,
        metadataMimeType: options.metadataMimeType,
        fields: options.fields
      });
    } catch (err) {
      if (isDriveServiceAccountQuotaError(err)) {
        throw new Error(
          'Cloud Run Drive artifact writes with service accounts require a Shared Drive folder. Move the configured PDF/upload folder to a Shared Drive folder, share it with the Cloud Run runtime service account, or keep artifact writes on Apps Script.'
        );
      }
      throw err;
    }
  }

  async createGoogleDocFromHtml({ html, name, folderId }) {
    const targetFolderId = (folderId || '').toString().trim();
    if (!targetFolderId) throw new Error('Drive folder id is required.');
    const fileName = (name || 'preview').toString().trim() || 'preview';
    const created = await this.createFile(
      {
        name: fileName,
        mimeType: HTML_MIME_TYPE,
        buffer: Buffer.from((html || '').toString(), 'utf8')
      },
      {
        folderId: targetFolderId,
        metadataMimeType: GOOGLE_APPS_DOCUMENT_MIME
      }
    );
    const fileId = created && created.id ? created.id.toString() : '';
    if (!fileId) throw new Error('Drive did not return a converted Google Doc id.');
    return {
      fileId,
      url: (created && (created.webViewLink || created.webContentLink)) || `https://docs.google.com/document/d/${fileId}/edit`,
      previewUrl: `https://docs.google.com/document/d/${fileId}/preview`
    };
  }

  async exportGoogleDocToPdfBuffer(fileId) {
    const id = (fileId || '').toString().trim();
    if (!id) throw new Error('Google Doc file id is required.');
    return this.driveClient.exportFile(id, PDF_MIME_TYPE);
  }

  async createPdfFromHtml({ html, name, folderId, keepIntermediateDoc = false }) {
    const targetFolderId = (folderId || '').toString().trim();
    if (!targetFolderId) throw new Error('Drive folder id is required.');
    const baseName = (name || 'document').toString().trim() || 'document';
    const pdfName = /\.pdf$/i.test(baseName) ? baseName : `${baseName}.pdf`;
    let doc = null;
    try {
      doc = await this.createGoogleDocFromHtml({
        html,
        name: baseName.replace(/\.pdf$/i, ''),
        folderId: targetFolderId
      });
      const pdfBuffer = await this.exportGoogleDocToPdfBuffer(doc.fileId);
      const pdfFile = await this.createFile(
        {
          name: pdfName,
          mimeType: PDF_MIME_TYPE,
          buffer: pdfBuffer
        },
        { folderId: targetFolderId }
      );
      const fileId = pdfFile && pdfFile.id ? pdfFile.id.toString() : '';
      return {
        success: true,
        fileId,
        url: (pdfFile && (pdfFile.webViewLink || pdfFile.webContentLink)) || (fileId ? `https://drive.google.com/open?id=${fileId}` : ''),
        buffer: pdfBuffer,
        mimeType: PDF_MIME_TYPE,
        fileName: pdfName,
        intermediateDocId: keepIntermediateDoc && doc ? doc.fileId : undefined
      };
    } finally {
      if (!keepIntermediateDoc && doc && doc.fileId) {
        try {
          await this.trashFile(doc.fileId);
        } catch {
          // Best effort: failed cleanup must not hide a successful PDF export.
        }
      }
    }
  }

  async renderPdfBufferFromHtml({ html, name, folderId }) {
    const targetFolderId = (folderId || '').toString().trim();
    if (!targetFolderId) throw new Error('Drive folder id is required.');
    let doc = null;
    try {
      doc = await this.createGoogleDocFromHtml({
        html,
        name: (name || 'preview').toString().trim() || 'preview',
        folderId: targetFolderId
      });
      return this.exportGoogleDocToPdfBuffer(doc.fileId);
    } finally {
      if (doc && doc.fileId) {
        try {
          await this.trashFile(doc.fileId);
        } catch {
          // Best effort cleanup.
        }
      }
    }
  }

  containsUploadPayload(value) {
    return isUploadPayload(value);
  }
}

const normalizeBackendName = value => (value || '').toString().trim().toLowerCase();

const createFileRepository = deps => {
  if (deps && deps.fileRepository) return deps.fileRepository;
  const env = (deps && deps.env) || process.env;
  const backend = normalizeBackendName((deps && deps.fileBackend) || env.CK_FILE_BACKEND || 'drive');
  if (backend === 'drive' || backend === 'google-drive') {
    return new GoogleDriveFileRepository(deps || {});
  }
  return null;
};

module.exports = {
  GoogleDriveFileRepository,
  createFileRepository
};
