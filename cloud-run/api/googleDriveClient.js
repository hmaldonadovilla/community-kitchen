const { createGoogleApiClient } = require('./googleApiClient');

const DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE_URL = 'https://www.googleapis.com/upload/drive/v3';

const DEFAULT_FILE_FIELDS = [
  'id',
  'name',
  'mimeType',
  'size',
  'modifiedTime',
  'webViewLink',
  'webContentLink'
].join(',');

const DEFAULT_UPLOAD_FIELDS = ['id', 'name', 'mimeType', 'webViewLink', 'webContentLink'].join(',');

const createMultipartUploadBody = ({ metadata, buffer, mimeType }) => {
  const boundary = `ck_drive_upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n`,
      'utf8'
    ),
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
      'utf8'
    ),
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || ''),
    Buffer.from(`\r\n--${boundary}--`, 'utf8')
  ]);
  return { boundary, body };
};

const createGoogleDriveClient = (deps = {}) => {
  const googleApiClient = deps.googleApiClient || createGoogleApiClient(deps);

  return {
    async getFileMetadata(fileId, fields = DEFAULT_FILE_FIELDS) {
      const id = (fileId || '').toString().trim();
      if (!id) throw new Error('Google Drive file id is required.');
      const params = new URLSearchParams();
      params.set('fields', fields);
      params.set('supportsAllDrives', 'true');
      const url = `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(id)}?${params.toString()}`;
      return googleApiClient.request(url);
    },

    async downloadFile(fileId) {
      const id = (fileId || '').toString().trim();
      if (!id) throw new Error('Google Drive file id is required.');
      const params = new URLSearchParams();
      params.set('alt', 'media');
      params.set('supportsAllDrives', 'true');
      const url = `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(id)}?${params.toString()}`;
      return googleApiClient.request(url, { responseType: 'buffer' });
    },

    async exportFile(fileId, mimeType) {
      const id = (fileId || '').toString().trim();
      const mime = (mimeType || '').toString().trim();
      if (!id) throw new Error('Google Drive file id is required.');
      if (!mime) throw new Error('Google Drive export mime type is required.');
      const params = new URLSearchParams();
      params.set('mimeType', mime);
      const url = `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(id)}/export?${params.toString()}`;
      return googleApiClient.request(url, { responseType: 'buffer' });
    },

    async copyFile(fileId, metadata = {}, fields = DEFAULT_UPLOAD_FIELDS) {
      const id = (fileId || '').toString().trim();
      if (!id) throw new Error('Google Drive file id is required.');
      const params = new URLSearchParams();
      params.set('supportsAllDrives', 'true');
      params.set('fields', fields);
      const url = `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(id)}/copy?${params.toString()}`;
      return googleApiClient.request(url, {
        method: 'POST',
        body: metadata || {},
        responseType: 'json'
      });
    },

    async trashFile(fileId) {
      const id = (fileId || '').toString().trim();
      if (!id) throw new Error('Google Drive file id is required.');
      const params = new URLSearchParams();
      params.set('supportsAllDrives', 'true');
      const url = `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(id)}?${params.toString()}`;
      return googleApiClient.request(url, {
        method: 'PATCH',
        body: { trashed: true },
        responseType: 'json'
      });
    },

    async uploadFile(file, options = {}) {
      const name = (file && (file.name || file.fileName || file.filename) ? file.name || file.fileName || file.filename : 'upload')
        .toString()
        .trim() || 'upload';
      const mimeType = (file && (file.mimeType || file.type) ? file.mimeType || file.type : 'application/octet-stream')
        .toString()
        .trim() || 'application/octet-stream';
      const buffer = Buffer.isBuffer(file && file.buffer) ? file.buffer : Buffer.from((file && file.buffer) || '');
      const folderId = (options.folderId || '').toString().trim();
      const fields = (options.fields || DEFAULT_UPLOAD_FIELDS).toString();
      const metadataMimeType = (options.metadataMimeType || file.metadataMimeType || mimeType).toString().trim() || mimeType;
      const metadata = {
        name,
        mimeType: metadataMimeType,
        ...(folderId ? { parents: [folderId] } : {})
      };
      const { boundary, body } = createMultipartUploadBody({ metadata, buffer, mimeType });
      const params = new URLSearchParams();
      params.set('uploadType', 'multipart');
      params.set('supportsAllDrives', 'true');
      params.set('fields', fields);
      const url = `${DRIVE_UPLOAD_BASE_URL}/files?${params.toString()}`;
      return googleApiClient.request(url, {
        method: 'POST',
        rawBody: body,
        headers: {
          'content-type': `multipart/related; boundary=${boundary}`,
          'content-length': body.length.toString()
        }
      });
    }
  };
};

module.exports = {
  DEFAULT_FILE_FIELDS,
  DEFAULT_UPLOAD_FIELDS,
  createGoogleDriveClient
};
