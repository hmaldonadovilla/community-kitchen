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

const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;
const DEFAULT_LINK_VALIDATION_MAX_FOLDER_DEPTH = 8;
const DRIVE_LINK_VALIDATION_ERROR_PREFIX = 'CK_UPLOAD_LINK_VALIDATION:';
const LINK_VALIDATION_MESSAGES = {
  notDriveFile: 'Receipt evidence links must be Google Drive file links.',
  scopeMissing: 'Receipt link validation is enabled but no allowed customer Drive scope is configured.',
  notAccessible: 'Receipt evidence link is not accessible from the configured customer Drive.',
  trashed: 'Receipt evidence link points to a trashed Drive file.',
  outOfScope: 'Receipt evidence link must point to a file in the configured customer Drive.'
};

const normalizeString = value => (value === undefined || value === null ? '' : value.toString().trim());

const normalizeStringArray = value =>
  Array.isArray(value)
    ? value
        .map(item => normalizeString(item))
        .filter(Boolean)
    : [];

const firstUrlOrValue = raw => {
  const text = normalizeString(raw);
  const match = text.match(/https?:\/\/[^\s,]+/i);
  return (match && match[0] ? match[0] : text).trim();
};

const tryDecodeURIComponent = raw => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const tryDecodeUrlComponent = raw => tryDecodeURIComponent(normalizeString(raw).replace(/\+/g, ' '));

const extractUrlHost = rawValue => {
  const raw = normalizeString(rawValue);
  const match = /^https?:\/\/([^/?#\s]+)/i.exec(raw);
  const authority = (match && match[1] ? match[1] : '').trim();
  if (!authority) return '';
  const withoutCredentials = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return withoutCredentials.replace(/:\d+$/, '').toLowerCase();
};

const extractUrlParamValues = (rawValue, paramNames) => {
  const raw = normalizeString(rawValue);
  const questionIndex = raw.indexOf('?');
  if (questionIndex < 0) return [];
  const hashIndex = raw.indexOf('#', questionIndex + 1);
  const query = raw.slice(questionIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
  if (!query) return [];
  const wanted = new Set(paramNames.map(param => param.toLowerCase()));
  const values = [];
  query.split('&').forEach(part => {
    if (!part) return;
    const equalsIndex = part.indexOf('=');
    const rawKey = equalsIndex >= 0 ? part.slice(0, equalsIndex) : part;
    const rawValuePart = equalsIndex >= 0 ? part.slice(equalsIndex + 1) : '';
    const key = tryDecodeUrlComponent(rawKey).toLowerCase();
    if (!wanted.has(key) || !rawValuePart) return;
    values.push(tryDecodeUrlComponent(rawValuePart));
  });
  return values;
};

const unescapeUrlText = raw =>
  normalizeString(raw)
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u003f/gi, '?')
    .replace(/&amp;/gi, '&');

const pushCandidate = (queue, seen, raw) => {
  const value = normalizeString(raw);
  if (!value || seen.has(value)) return;
  seen.add(value);
  queue.push(value);
};

const pushJsonUrlCandidates = (queue, seen, rawValue) => {
  const raw = normalizeString(rawValue);
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return;
  try {
    const parsed = JSON.parse(raw);
    const visit = (value, depth) => {
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
        ['value', 'url', 'href', 'link', 'rawValue', 'raw'].forEach(key => visit(value[key], depth + 1));
      }
    };
    visit(parsed, 0);
  } catch {
    // Ignore non-JSON candidates.
  }
};

const collectDriveLinkCandidates = rawValue => {
  const queue = [];
  const seen = new Set();
  pushCandidate(queue, seen, rawValue);

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

const isAllowedDriveHost = raw => {
  const value = normalizeString(raw);
  if (!/^https?:\/\//i.test(value)) return true;
  const host = extractUrlHost(value);
  return (
    host === 'drive.google.com' ||
    host === 'docs.google.com' ||
    host === 'googleusercontent.com' ||
    host === 'drive.usercontent.google.com' ||
    host.endsWith('.googleusercontent.com')
  );
};

const extractDriveFileIdForValidation = value => {
  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/(?:document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/
  ];

  for (const candidate of collectDriveLinkCandidates(value)) {
    const raw = firstUrlOrValue(candidate);
    if (!raw || !isAllowedDriveHost(raw)) continue;
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match && match[1]) return match[1];
    }
    if (DRIVE_FILE_ID_RE.test(raw)) return raw;
  }

  return '';
};

const linkValidationError = (code, fileId) => {
  const fileIdPart = fileId ? `fileId=${fileId}: ` : '';
  return new Error(
    `${DRIVE_LINK_VALIDATION_ERROR_PREFIX}${code}: ${fileIdPart}${LINK_VALIDATION_MESSAGES[code] || 'Receipt link validation failed.'}`
  );
};

const canonicalDriveUrl = fileId => `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;

const parentIdsFromMetadata = metadata => {
  const parents = metadata && Array.isArray(metadata.parents) ? metadata.parents : [];
  return parents
    .map(parent => (typeof parent === 'string' ? parent : parent && parent.id))
    .map(parent => normalizeString(parent))
    .filter(Boolean);
};

const metadataDriveId = metadata => normalizeString(metadata && (metadata.driveId || metadata.teamDriveId));

const isMetadataTrashed = metadata => Boolean(metadata && (metadata.trashed === true || (metadata.labels && metadata.labels.trashed === true)));

const metadataUrl = (metadata, fileId) =>
  normalizeString(metadata && (metadata.webViewLink || metadata.webContentLink || metadata.alternateLink)) || canonicalDriveUrl(fileId);

const resolveLinkValidationConfig = uploadConfig => {
  const linkCapture = uploadConfig && uploadConfig.linkCapture;
  if (!linkCapture || linkCapture.enabled === false) return null;
  const validation = linkCapture.validation;
  if (!validation || validation.requireServerValidation !== true) return null;
  return validation;
};

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
    this.linkValidationMetadataCache = new Map();
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
        for (const url of splitUrls(file)) {
          urls.push(await this.validateCapturedDriveLink(url, uploadConfig, context));
        }
        continue;
      }
      if (file && typeof file === 'object' && typeof file.url === 'string') {
        const url = file.url.trim();
        if (url) urls.push(await this.validateCapturedDriveLink(url, uploadConfig, context));
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

  async validateCapturedDriveLink(rawValue, uploadConfig, context = {}) {
    const validation = resolveLinkValidationConfig(uploadConfig);
    const raw = normalizeString(rawValue);
    if (!validation || !raw) return raw;

    const fileId = extractDriveFileIdForValidation(raw);
    if (!fileId) {
      throw linkValidationError('notDriveFile');
    }

    const scope = await this.resolveLinkValidationScope(validation, uploadConfig, context);
    if (!scope.allowedDriveIds.size && !scope.allowedFolderIds.size) {
      throw linkValidationError('scopeMissing');
    }

    const metadata = await this.getLinkValidationMetadata(fileId);
    if (!metadata) {
      throw linkValidationError('notAccessible', fileId);
    }
    if (scope.rejectTrashed && isMetadataTrashed(metadata)) {
      throw linkValidationError('trashed', fileId);
    }

    const driveId = metadataDriveId(metadata);
    if (driveId && scope.allowedDriveIds.has(driveId)) {
      return metadataUrl(metadata, fileId);
    }
    if (await this.isInAllowedLinkFolder(metadata, scope)) {
      return metadataUrl(metadata, fileId);
    }

    throw linkValidationError('outOfScope', fileId);
  }

  async resolveLinkValidationScope(validation, uploadConfig, context = {}) {
    const allowedDriveIds = new Set([
      ...normalizeStringArray(validation.allowedSharedDriveIds),
      ...normalizeStringArray(validation.allowedDriveIds)
    ]);
    const allowedFolderIds = new Set(normalizeStringArray(validation.allowedFolderIds));
    const wantsDestinationScope =
      validation.includeUploadDestinationFolder === true || validation.includeUploadDestinationDrive === true;
    const destinationFolderId = wantsDestinationScope
      ? await this.resolveUploadFolderId(uploadConfig, context).catch(() => '')
      : '';

    if (validation.includeUploadDestinationFolder === true && destinationFolderId) {
      allowedFolderIds.add(destinationFolderId);
    }

    if (validation.includeUploadDestinationDrive === true && destinationFolderId) {
      const folderMetadata = await this.getLinkValidationMetadata(destinationFolderId);
      const destinationDriveId = metadataDriveId(folderMetadata);
      if (destinationDriveId) allowedDriveIds.add(destinationDriveId);
    }

    const rawDepth = Number(validation.maxFolderDepth);
    return {
      allowedDriveIds,
      allowedFolderIds,
      rejectTrashed: validation.rejectTrashed !== false,
      maxFolderDepth:
        Number.isFinite(rawDepth) && rawDepth > 0
          ? Math.floor(rawDepth)
          : DEFAULT_LINK_VALIDATION_MAX_FOLDER_DEPTH
    };
  }

  async isInAllowedLinkFolder(metadata, scope) {
    if (!scope.allowedFolderIds.size) return false;
    const queue = parentIdsFromMetadata(metadata).map(id => ({ id, depth: 1 }));
    const visited = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      if (scope.allowedFolderIds.has(current.id)) return true;
      if (current.depth >= scope.maxFolderDepth) continue;
      const parentMetadata = await this.getLinkValidationMetadata(current.id);
      parentIdsFromMetadata(parentMetadata).forEach(parentId => {
        if (!visited.has(parentId)) queue.push({ id: parentId, depth: current.depth + 1 });
      });
    }

    return false;
  }

  async getLinkValidationMetadata(fileId) {
    const id = normalizeString(fileId);
    if (!id) return null;
    if (this.linkValidationMetadataCache.has(id)) return this.linkValidationMetadataCache.get(id);
    let metadata = null;
    try {
      metadata = await this.driveClient.getFileMetadata(
        id,
        'id,name,mimeType,parents,driveId,trashed,webViewLink,webContentLink'
      );
    } catch {
      metadata = null;
    }
    this.linkValidationMetadataCache.set(id, metadata || null);
    return metadata || null;
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
