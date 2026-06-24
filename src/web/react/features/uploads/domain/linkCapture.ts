export type UploadLinkCaptureMode = 'driveQr';
export type UploadLinkCaptureDedupeBy = 'url' | 'driveFileId';

export type UploadLinkCaptureConfig = {
  enabled?: boolean;
  mode?: UploadLinkCaptureMode;
  allowManualPaste?: boolean;
  dedupeBy?: UploadLinkCaptureDedupeBy;
  labels?: {
    scan?: unknown;
    paste?: unknown;
    pastePlaceholder?: unknown;
  };
  messages?: {
    duplicate?: unknown;
    invalid?: unknown;
    unsupported?: unknown;
    added?: unknown;
  };
};

export type NormalizedCapturedUploadLink =
  | {
      ok: true;
      mode: UploadLinkCaptureMode;
      url: string;
      driveFileId: string;
    }
  | {
      ok: false;
      mode: UploadLinkCaptureMode;
      reason: 'empty' | 'invalidDriveLink' | 'disabled';
    };

export type AppendCapturedUploadLinkResult =
  | {
      status: 'added';
      items: Array<string | File>;
      url: string;
      driveFileId: string;
    }
  | {
      status: 'duplicate';
      items: Array<string | File>;
      url: string;
      driveFileId: string;
    }
  | {
      status: 'invalid';
      items: Array<string | File>;
      reason: 'empty' | 'invalidDriveLink' | 'disabled';
    }
  | {
      status: 'maxed';
      items: Array<string | File>;
      url: string;
      driveFileId: string;
      maxFiles: number;
    };

const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

const normalizeString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  return raw.toString().trim();
};

const firstUrlOrValue = (raw: string): string => {
  const match = raw.match(/https?:\/\/[^\s,]+/i);
  return (match?.[0] || raw).trim();
};

const isAllowedDriveUrl = (raw: string): boolean => {
  if (!/^https?:\/\//i.test(raw)) return true;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === 'drive.google.com' ||
      host === 'docs.google.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'googleusercontent.com'
    );
  } catch {
    return false;
  }
};

export const extractDriveFileIdFromLink = (value: string): string => {
  const raw = firstUrlOrValue(normalizeString(value));
  if (!raw) return '';
  if (!isAllowedDriveUrl(raw)) return '';

  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/(?:document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return DRIVE_FILE_ID_RE.test(raw) ? raw : '';
};

export const canonicalDriveFileUrl = (fileId: string): string => {
  const id = normalizeString(fileId);
  return id ? `https://drive.google.com/open?id=${encodeURIComponent(id)}` : '';
};

export const formatDriveFileDisplayName = (value: string): string => {
  const id = extractDriveFileIdFromLink(value);
  return id ? `Drive file ${id.slice(0, 8)}` : '';
};

export const resolveUploadLinkCaptureConfig = (uploadConfig?: any): UploadLinkCaptureConfig | null => {
  const raw = uploadConfig?.linkCapture ?? uploadConfig?.link_capture ?? uploadConfig?.qrCapture ?? uploadConfig?.qr_capture;
  if (raw === true) return { enabled: true, mode: 'driveQr', allowManualPaste: true, dedupeBy: 'driveFileId' };
  if (!raw || typeof raw !== 'object') return null;
  if (raw.enabled === false) return null;
  return {
    ...raw,
    enabled: true,
    mode: raw.mode === 'driveQr' ? 'driveQr' : 'driveQr',
    allowManualPaste: raw.allowManualPaste !== false,
    dedupeBy: raw.dedupeBy === 'url' ? 'url' : 'driveFileId'
  };
};

export const normalizeCapturedUploadLink = (
  rawValue: string,
  uploadConfig?: any
): NormalizedCapturedUploadLink => {
  const cfg = resolveUploadLinkCaptureConfig(uploadConfig);
  const mode: UploadLinkCaptureMode = cfg?.mode || 'driveQr';
  if (!cfg) return { ok: false, mode, reason: 'disabled' };

  const raw = normalizeString(rawValue);
  if (!raw) return { ok: false, mode, reason: 'empty' };

  const driveFileId = extractDriveFileIdFromLink(raw);
  if (!driveFileId) return { ok: false, mode, reason: 'invalidDriveLink' };

  return {
    ok: true,
    mode,
    url: canonicalDriveFileUrl(driveFileId),
    driveFileId
  };
};

const splitStoredUploadLinks = (raw: string): string[] => {
  const trimmed = normalizeString(raw);
  if (!trimmed) return [];
  const commaParts = trimmed
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return commaParts;
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return matches.map(match => match.trim()).filter(Boolean);
  return [trimmed];
};

const linkIdentity = (value: string, dedupeBy: UploadLinkCaptureDedupeBy): string => {
  const raw = normalizeString(value);
  if (!raw) return '';
  if (dedupeBy === 'driveFileId') {
    const id = extractDriveFileIdFromLink(raw);
    return id ? `drive:${id}` : '';
  }
  return `url:${raw.toLowerCase()}`;
};

export const appendCapturedUploadLink = (args: {
  existing: Array<string | File>;
  rawValue: string;
  uploadConfig?: any;
}): AppendCapturedUploadLinkResult => {
  const existing = Array.isArray(args.existing) ? args.existing : [];
  const normalized = normalizeCapturedUploadLink(args.rawValue, args.uploadConfig);
  if (!normalized.ok) return { status: 'invalid', items: existing, reason: normalized.reason };

  const cfg = resolveUploadLinkCaptureConfig(args.uploadConfig);
  const dedupeBy = cfg?.dedupeBy || 'driveFileId';
  const existingIdentities = new Set<string>();
  existing.forEach(item => {
    if (typeof item !== 'string') return;
    splitStoredUploadLinks(item).forEach(link => {
      const identity = linkIdentity(link, dedupeBy);
      if (identity) existingIdentities.add(identity);
    });
  });

  const nextIdentity = linkIdentity(normalized.url, dedupeBy);
  if (nextIdentity && existingIdentities.has(nextIdentity)) {
    return {
      status: 'duplicate',
      items: existing,
      url: normalized.url,
      driveFileId: normalized.driveFileId
    };
  }

  const maxFilesRaw = Number(args.uploadConfig?.maxFiles);
  const maxFiles = Number.isFinite(maxFilesRaw) && maxFilesRaw > 0 ? Math.floor(maxFilesRaw) : 0;
  if (maxFiles && existing.length >= maxFiles) {
    return {
      status: 'maxed',
      items: existing,
      url: normalized.url,
      driveFileId: normalized.driveFileId,
      maxFiles
    };
  }

  return {
    status: 'added',
    items: [...existing, normalized.url],
    url: normalized.url,
    driveFileId: normalized.driveFileId
  };
};
