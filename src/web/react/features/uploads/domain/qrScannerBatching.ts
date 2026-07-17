const MAX_QR_VALUE_LENGTH = 2048;
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
};

const normalizeFileId = (value: string): string => {
  const normalized = value.trim();
  return DRIVE_FILE_ID_PATTERN.test(normalized) ? normalized : '';
};

const queryValue = (query: string, key: string): string => {
  for (const chunk of query.split('&')) {
    const separator = chunk.indexOf('=');
    const rawKey = separator >= 0 ? chunk.slice(0, separator) : chunk;
    if (safeDecode(rawKey.replace(/\+/g, ' ')) !== key) continue;
    return safeDecode((separator >= 0 ? chunk.slice(separator + 1) : '').replace(/\+/g, ' '));
  }
  return '';
};

/** Mirrors the server's strict Drive QR grammar before client-side coalescing. */
const qrScannerDriveFileId = (rawValue: string): string => {
  const raw = (rawValue || '').toString().trim();
  if (!raw || raw.length > MAX_QR_VALUE_LENGTH) return '';
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i.exec(raw);
  if (!match) return '';
  const authority = match[1];
  if (!authority || authority.includes('@') || authority.includes('\\') || authority.includes(':')) return '';
  const host = authority.toLowerCase();
  const path = match[2] || '/';
  const query = match[3] || '';
  if (host === 'drive.google.com') {
    const pathMatch = /^\/file\/d\/([^/]+)(?:\/.*)?$/.exec(path);
    if (pathMatch) return normalizeFileId(safeDecode(pathMatch[1]));
    return path === '/open' ? normalizeFileId(queryValue(query, 'id')) : '';
  }
  if (host !== 'docs.google.com') return '';
  const pathMatch = /^\/(?:document|spreadsheets|presentation|forms|drawings)\/d\/([^/]+)(?:\/.*)?$/.exec(path);
  return pathMatch ? normalizeFileId(safeDecode(pathMatch[1])) : '';
};

/** Returns the canonical, session-local identity used to coalesce Drive QR scans. */
export const qrScannerCandidateIdentity = (rawValue: string): string | null => {
  const fileId = qrScannerDriveFileId(rawValue);
  return fileId ? `drive:${fileId}` : null;
};

/** Retryable outcomes are deliberately excluded so a later detection can try again. */
export const isReusableQrScannerOutcome = (result: {
  candidate: { status: string; retryable?: boolean };
}): boolean =>
  result.candidate.status !== 'RETRYABLE_ERROR' && result.candidate.retryable !== true;
