import { escapeRegExp } from './utils';

/**
 * Export a rendered Google Doc file to a self-contained HTML string.
 *
 * Notes:
 * - Uses Drive export API (zip "web page" export) when possible.
 * - Inlines assets as data URIs.
 * - Strips script tags defensively.
 */

export const exportDocFileToHtml = (file: GoogleAppsScript.Drive.File): string => {
  const fileId = file.getId();
  try {
    const res = fetchDriveExport(fileId, 'application/zip');
    const blob = res.getBlob();
    const contentType = (blob.getContentType() || '').toString().toLowerCase();
    if (contentType.includes('zip')) {
      return exportHtmlZipToSelfContainedHtml(blob);
    }
    const html = (res.getContentText ? res.getContentText() : '') || blob.getDataAsString();
    return stripUnsafeHtml(html);
  } catch (err) {
    // Fallback attempt (may still work for some deployments/templates).
    try {
      const blob = file.getAs('application/zip');
      const contentType = (blob.getContentType() || '').toString().toLowerCase();
      if (contentType.includes('zip')) {
        return exportHtmlZipToSelfContainedHtml(blob);
      }
      return stripUnsafeHtml(blob.getDataAsString());
    } catch (err2) {
      const errText =
        (err2 as any)?.message?.toString?.() ||
        (err2 as any)?.toString?.() ||
        (err as any)?.message?.toString?.() ||
        (err as any)?.toString?.() ||
        'Failed to export HTML.';
      throw new Error(errText);
    }
  }
};

const fetchDriveExport = (fileId: string, mimeType: string): GoogleAppsScript.URL_Fetch.HTTPResponse => {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(
    mimeType
  )}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
    }
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    const body = (res.getContentText ? res.getContentText() : '').toString();
    const snippet = body.length > 600 ? body.slice(0, 600) + '…' : body;
    throw new Error(`Drive export failed (${code}). ${snippet || ''}`.trim());
  }
  return res;
};

const exportHtmlZipToSelfContainedHtml = (zipBlob: GoogleAppsScript.Base.Blob): string => {
  const parts = Utilities.unzip(zipBlob);
  const htmlBlob =
    parts.find(p => (p.getName() || '').toString().toLowerCase().endsWith('.html')) ||
    parts.find(p => (p.getContentType() || '').toString().toLowerCase().includes('html')) ||
    parts[0];
  if (!htmlBlob) return '';
  let html = htmlBlob.getDataAsString();
  const assetBlobs = parts.filter(p => p !== htmlBlob);
  if (assetBlobs.length) {
    html = inlineZipAssetsAsDataUris(html, assetBlobs);
  }
  return stripUnsafeHtml(html);
};

const inlineZipAssetsAsDataUris = (html: string, assets: GoogleAppsScript.Base.Blob[]): string => {
  let out = html || '';
  const mapping: Record<string, string> = {};
  assets.forEach(b => {
    const nameRaw = (b.getName() || '').toString();
    const name = nameRaw.trim();
    if (!name) return;
    const mime = (b.getContentType() || 'application/octet-stream').toString();
    const b64 = Utilities.base64Encode(b.getBytes());
    const dataUri = `data:${mime};base64,${b64}`;
    mapping[name] = dataUri;
    const base = name.split('/').pop() || name.split('\\').pop() || name;
    mapping[base] = dataUri;
  });

  Object.entries(mapping).forEach(([assetName, dataUri]) => {
    if (!assetName) return;
    const token = escapeRegExp(assetName);
    out = out.replace(new RegExp(`(["'])\\.?\\/?${token}\\1`, 'g'), `$1${dataUri}$1`);
    out = out.replace(new RegExp(`(["'])images\\/${token}\\1`, 'g'), `$1${dataUri}$1`);
  });
  return out;
};

const stripUnsafeHtml = (html: string): string => {
  const raw = (html || '').toString();
  if (!raw) return '';
  // Defensive: Docs export should already be safe, but never allow script tags in the embedded preview.
  return raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
};


