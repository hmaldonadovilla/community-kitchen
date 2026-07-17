import { FileUploadConfig, FormConfigExport, LocalizedString, QrScanSessionReturnContext, WebFormSubmission } from '../../../types';
import {
  QR_SCANNER_MAX_CANDIDATE_BATCH_SIZE,
  QrScannerCandidateProjection,
  QrScannerResultCode,
  QrScannerSessionProjection,
  QrScannerTarget,
  StoredQrScannerCandidate,
  StoredQrScannerSession
} from './types';

export const MAX_QR_PAYLOAD_LENGTH = 2048;
export const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface ParsedDriveQrPayload {
  ok: true;
  fileId: string;
  sourceKind: 'drive-file' | 'drive-open' | 'docs-file';
  canonicalUrl: string;
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
};

export const normalizeFileId = (value: unknown): string => {
  const id = (value ?? '').toString().trim();
  return DRIVE_FILE_ID_PATTERN.test(id) ? id : '';
};

const queryValue = (query: string, key: string): string => {
  for (const chunk of (query || '').split('&')) {
    const index = chunk.indexOf('=');
    const rawKey = index >= 0 ? chunk.slice(0, index) : chunk;
    if (safeDecode(rawKey.replace(/\+/g, ' ')) !== key) continue;
    return safeDecode((index >= 0 ? chunk.slice(index + 1) : '').replace(/\+/g, ' '));
  }
  return '';
};

/** Accepts only a known HTTPS Google Drive/Docs file URL. */
export const parseDriveQrPayload = (value: unknown): ParsedDriveQrPayload | { ok: false; code: 'INVALID_PAYLOAD' } => {
  const raw = (value ?? '').toString().trim();
  if (!raw || raw.length > MAX_QR_PAYLOAD_LENGTH) return { ok: false, code: 'INVALID_PAYLOAD' };

  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i.exec(raw);
  if (!match) return { ok: false, code: 'INVALID_PAYLOAD' };
  const authority = match[1];
  if (!authority || authority.includes('@') || authority.includes('\\') || authority.includes(':')) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  const host = authority.toLowerCase();
  const path = match[2] || '/';
  const query = match[3] || '';
  let fileId = '';
  let sourceKind: ParsedDriveQrPayload['sourceKind'] = 'drive-file';

  if (host === 'drive.google.com') {
    const pathMatch = /^\/file\/d\/([^/]+)(?:\/.*)?$/.exec(path);
    if (pathMatch) {
      fileId = normalizeFileId(safeDecode(pathMatch[1]));
      sourceKind = 'drive-file';
    } else if (path === '/open') {
      fileId = normalizeFileId(queryValue(query, 'id'));
      sourceKind = 'drive-open';
    }
  } else if (host === 'docs.google.com') {
    const pathMatch = /^\/(?:document|spreadsheets|presentation|forms|drawings)\/d\/([^/]+)(?:\/.*)?$/.exec(path);
    if (pathMatch) {
      fileId = normalizeFileId(safeDecode(pathMatch[1]));
      sourceKind = 'docs-file';
    }
  }

  if (!fileId) return { ok: false, code: 'INVALID_PAYLOAD' };
  return { ok: true, fileId, sourceKind, canonicalUrl: canonicalDriveFileUrl(fileId) };
};

export const canonicalDriveFileUrl = (fileId: string): string =>
  `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

const normalizeBoundedText = (value: unknown, maxLength: number): string =>
  (value ?? '').toString().trim().slice(0, maxLength);

export const splitUploadLinks = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value : (value ?? '').toString().split(/[\n,]+/);
  const seen = new Set<string>();
  return source
    .map(entry => {
      if (entry && typeof entry === 'object' && typeof (entry as any).url === 'string') return (entry as any).url;
      if (entry && typeof entry === 'object') return '';
      return entry;
    })
    .map(entry => normalizeBoundedText(entry, MAX_QR_PAYLOAD_LENGTH))
    .filter(entry => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
};

/**
 * Returns a stable identity for an upload link. Known Drive URL variants share
 * the same file identity; unknown legacy values retain exact-value identity so
 * the field commit never drops unrelated existing evidence.
 */
export const uploadLinkIdentity = (value: unknown): string => {
  const raw = normalizeBoundedText(value, MAX_QR_PAYLOAD_LENGTH);
  if (!raw) return '';
  const parsed = parseDriveQrPayload(raw);
  return parsed.ok ? `drive:${parsed.fileId}` : `value:${raw}`;
};

/** De-duplicates a field value by Drive file ID while preserving its first URL form. */
export const dedupeUploadLinksByFileId = (value: unknown): string[] => {
  const seen = new Set<string>();
  return splitUploadLinks(value).filter(link => {
    const identity = uploadLinkIdentity(link);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

/**
 * Normalizes internal scanner commit input to canonical Drive URLs. Any
 * unsupported value rejects the whole batch rather than partially committing.
 */
export const canonicalizeQrScannerCommitLinks = (value: unknown): string[] | null => {
  const rawLinks = splitUploadLinks(value);
  const canonicalLinks: string[] = [];
  const seenFileIds = new Set<string>();
  for (const link of rawLinks) {
    const parsed = parseDriveQrPayload(link);
    if (!parsed.ok) return null;
    if (seenFileIds.has(parsed.fileId)) continue;
    seenFileIds.add(parsed.fileId);
    canonicalLinks.push(parsed.canonicalUrl);
  }
  return canonicalLinks;
};

export const fileIdsFromLinks = (links: string[]): string[] => {
  const ids = new Set<string>();
  links.forEach(link => {
    const parsed = parseDriveQrPayload(link);
    if (parsed.ok) ids.add(parsed.fileId);
  });
  return Array.from(ids);
};

const fieldValue = (record: WebFormSubmission, fieldId: string): unknown => {
  const values = record && typeof record.values === 'object' ? record.values : undefined;
  if (values && Object.prototype.hasOwnProperty.call(values, fieldId)) return values[fieldId];
  return (record as any)?.[fieldId];
};

export const recordDataVersion = (record: WebFormSubmission): number => {
  const parsed = Number(record?.dataVersion);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 0;
};

export const resolveQrScannerField = (config: FormConfigExport, fieldId: string): any | null => {
  const questions = Array.isArray(config?.questions) && config.questions.length
    ? config.questions
    : Array.isArray((config as any)?.definition?.questions)
      ? (config as any).definition.questions
      : [];
  return questions.find(
    (question: any) =>
      question &&
      question.type === 'FILE_UPLOAD' &&
      question.status === 'Active' &&
      (question.id || '').toString().trim() === fieldId
  ) || null;
};

/** Resolves only the canonical, server-validated Drive QR capture mode. */
export const hasAuthoritativeQrScannerConfig = (field: any): boolean => {
  const linkCapture = field?.uploadConfig?.linkCapture;
  return Boolean(
    linkCapture &&
    linkCapture.enabled !== false &&
    (!linkCapture.mode || linkCapture.mode === 'driveQr') &&
    linkCapture.validation?.requireServerValidation === true
  );
};

/**
 * Builds the scanner target from an already-resolved form configuration and
 * record. Callers that have fetched both values can avoid repeating the
 * authoritative reads while retaining the same field and record checks.
 */
export const resolveAuthoritativeTargetFromResolved = (
  config: FormConfigExport,
  record: WebFormSubmission | null,
  recordId: string,
  fieldId: string
): QrScannerTarget | null => {
  const field = resolveQrScannerField(config, fieldId);
  if (!field || !hasAuthoritativeQrScannerConfig(field)) return null;
  if (!record || (record.id || '').toString().trim() !== recordId) return null;
  const links = dedupeUploadLinksByFileId(fieldValue(record, fieldId));
  return {
    config,
    field,
    uploadConfig: (field.uploadConfig || {}) as FileUploadConfig,
    record,
    dataVersion: recordDataVersion(record),
    currentLinks: links,
    currentFileIds: fileIdsFromLinks(links)
  };
};

export const resolveAuthoritativeTarget = (
  service: {
    fetchFormConfig(formKey?: string): FormConfigExport;
    fetchSubmissionById(formKey: string, recordId: string): WebFormSubmission | null;
  },
  formKey: string,
  recordId: string,
  fieldId: string
): QrScannerTarget | null => {
  const config = service.fetchFormConfig(formKey);
  const field = resolveQrScannerField(config, fieldId);
  if (!field || !hasAuthoritativeQrScannerConfig(field)) return null;
  const record = service.fetchSubmissionById(formKey, recordId);
  return resolveAuthoritativeTargetFromResolved(config, record, recordId, fieldId);
};

export const normalizeLanguage = (value: unknown): 'EN' | 'FR' | 'NL' => {
  const language = (value || 'EN').toString().trim().toUpperCase();
  return language === 'FR' || language === 'NL' ? language : 'EN';
};

/** Resolves bounded, field-specific scanner copy before it crosses the session boundary. */
export const resolveQrScannerInstruction = (
  value: LocalizedString | undefined,
  language: 'EN' | 'FR' | 'NL'
): string => {
  if (typeof value === 'string') return normalizeBoundedText(value, 300);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const localized = value as Record<string, unknown>;
  const lower = language.toLowerCase();
  return normalizeBoundedText(localized[lower] ?? localized[language] ?? localized.en ?? localized.EN, 300);
};

export const normalizeReturnContext = (value: unknown): QrScanSessionReturnContext | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const context: QrScanSessionReturnContext = {};
  for (const key of ['app', 'page', 'stepId'] as const) {
    const normalized = normalizeBoundedText(source[key], 80);
    if (normalized && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) context[key] = normalized;
  }
  if (source.overlay === 'files') context.overlay = 'files';
  return Object.keys(context).length ? context : undefined;
};

const requireHttpsBase = (value: unknown): string => {
  const normalized = (value ?? '').toString().trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/?#@:\\]+(?::443)?(?:\/[^?#]*)?$/i.test(normalized)) return '';
  return normalized;
};

const encodedPairs = (values: Record<string, unknown>): string =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!.toString())}`)
    .join('&');

export const buildScannerLaunchUrl = (
  scannerBaseUrl: string,
  sessionId: string,
  launchToken: string,
  instruction?: string
): string => {
  const scanner = requireHttpsBase(scannerBaseUrl);
  if (!scanner) return '';
  return `${scanner}#${encodedPairs({
    sessionId,
    launchToken,
    instruction: normalizeBoundedText(instruction, 300)
  })}`;
};

export const buildScannerReturnUrl = (
  serviceUrl: string,
  session: Pick<StoredQrScannerSession, 'id' | 'formKey' | 'recordId' | 'fieldId' | 'returnContext'>,
  outcome?: { result: 'success' | 'cancelled'; linkedCount?: number }
): string => {
  const base = requireHttpsBase(serviceUrl);
  if (!base) return '';
  const values: Record<string, unknown> = {
    form: session.formKey,
    recordId: session.recordId,
    mode: 'edit',
    ...(session.returnContext || {})
  };
  if (outcome) {
    values.qrSession = session.id;
    values.qrField = session.fieldId;
    values.qrResult = outcome.result;
    if (outcome.linkedCount !== undefined) values.qrLinked = outcome.linkedCount;
  }
  return `${base}?${encodedPairs(values)}`;
};

export const projectCandidate = (candidate: StoredQrScannerCandidate): QrScannerCandidateProjection => ({
  id: candidate.id,
  status: candidate.status,
  code: candidate.code,
  ...(candidate.fileId ? { fileId: candidate.fileId, canonicalUrl: canonicalDriveFileUrl(candidate.fileId) } : {}),
  ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
  ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
  ...(candidate.retryable ? { retryable: true } : {}),
  checkedAt: candidate.checkedAt
});

export const candidateCounts = (session: StoredQrScannerSession): QrScannerSessionProjection['counts'] => {
  const candidates = session.candidates || [];
  const retainedAuthorised = candidates.filter(candidate => candidate.status === 'AUTHORISED').length;
  const trackedAuthorised = Number(session.incrementalAcceptedCount);
  const authorised = Math.max(
    retainedAuthorised,
    Number.isSafeInteger(trackedAuthorised) && trackedAuthorised >= 0 ? trackedAuthorised : 0
  );
  const duplicate = candidates.filter(candidate => candidate.status === 'DUPLICATE').length;
  const permanentRejected = candidates.filter(candidate => candidate.status === 'REJECTED').length;
  const pending = candidates.filter(candidate => candidate.incremental?.state === 'PENDING').length;
  const retryable = candidates.filter(
    candidate => candidate.status === 'RETRYABLE_ERROR' && candidate.incremental?.state !== 'PENDING'
  ).length;
  return {
    accepted: authorised,
    authorised,
    duplicate,
    rejected: duplicate + permanentRejected + retryable,
    permanentRejected,
    retryable,
    pending,
    total: candidates.length,
    remaining: Math.max(0, session.maxFiles - session.existingCount - authorised)
  };
};

export const projectSession = (session: StoredQrScannerSession): QrScannerSessionProjection => ({
  id: session.id,
  status: session.status,
  expiresAt: session.expiresAt,
  formKey: session.formKey,
  recordId: session.recordId,
  fieldId: session.fieldId,
  fieldLabel: session.fieldLabel,
  displayTitle: session.displayTitle,
  language: session.language,
  ...(session.instruction ? { instruction: session.instruction } : {}),
  maxFiles: session.maxFiles,
  existingCount: session.existingCount,
  returnUrl: session.returnUrl,
  capabilities: {
    addCandidates: true,
    maxCandidateBatchSize: QR_SCANNER_MAX_CANDIDATE_BATCH_SIZE
  },
  candidates: (session.candidates || []).map(projectCandidate),
  counts: candidateCounts(session),
  revision: session.revision,
  ...(session.status === 'COMPLETED' && session.commitResult ? { commitResult: session.commitResult } : {})
});

export const fileTypeMatches = (name: string, mimeType: string, config: FileUploadConfig): boolean => {
  const mimes = (config.allowedMimeTypes || []).map(item => item.toString().trim().toLowerCase()).filter(Boolean);
  const extensions = (config.allowedExtensions || [])
    .map(item => item.toString().trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
  const actualMime = (mimeType || '').toString().trim().toLowerCase();
  const actualName = (name || '').toString().trim().toLowerCase();
  const mimeMatch = mimes.some(pattern =>
    pattern === '*/*' || (pattern.endsWith('/*') ? actualMime.startsWith(pattern.slice(0, -1)) : actualMime === pattern)
  );
  const extensionMatch = extensions.some(extension => actualName.endsWith(`.${extension}`));
  if (mimes.length && extensions.length) return mimeMatch || extensionMatch;
  if (mimes.length) return mimeMatch;
  if (extensions.length) return extensionMatch;
  return true;
};

/**
 * Applies a link-capture MIME policy independently from upload validation.
 * Existing configurations inherit upload MIME/extension rules; an explicit
 * linkCapture.allowedMimeTypes list replaces both for captured Drive files.
 */
export const linkCaptureFileTypeMatches = (name: string, mimeType: string, config: FileUploadConfig): boolean => {
  const linkCaptureMimeTypes = config.linkCapture?.allowedMimeTypes;
  if (Array.isArray(linkCaptureMimeTypes)) {
    return fileTypeMatches(name, mimeType, { allowedMimeTypes: linkCaptureMimeTypes });
  }
  return fileTypeMatches(name, mimeType, config);
};

export const isFolderMimeType = (mimeType: string): boolean => mimeType === DRIVE_FOLDER_MIME_TYPE;

export const candidateStatusForCode = (code: QrScannerResultCode): StoredQrScannerCandidate['status'] => {
  if (code === 'ACCEPTED') return 'AUTHORISED';
  if (code === 'DUPLICATE_SESSION' || code === 'ALREADY_LINKED') return 'DUPLICATE';
  if (code === 'TEMPORARY_ERROR') return 'RETRYABLE_ERROR';
  return 'REJECTED';
};
