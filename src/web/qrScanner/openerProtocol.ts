export const QR_SCANNER_PROTOCOL_VERSION = 1 as const;

export const QR_SCANNER_MESSAGE_TYPES = {
  ready: 'CK_QR_SCANNER_READY',
  scan: 'CK_QR_SCANNER_SCAN',
  finish: 'CK_QR_SCANNER_FINISH',
  cancel: 'CK_QR_SCANNER_CANCEL',
  closed: 'CK_QR_SCANNER_CLOSED',
  setup: 'CK_QR_SCANNER_SETUP',
  candidate: 'CK_QR_SCANNER_CANDIDATE',
  commit: 'CK_QR_SCANNER_COMMIT',
  cancelled: 'CK_QR_SCANNER_CANCELLED',
  error: 'CK_QR_SCANNER_ERROR'
} as const;

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_QR_VALUE_LENGTH = 2048;
const MAX_INSTRUCTION_LENGTH = 300;
const MAX_DISPLAY_NAME_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 600;
const MAX_CODE_LENGTH = 80;
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

type ScannerMessageType = (typeof QR_SCANNER_MESSAGE_TYPES)[keyof typeof QR_SCANNER_MESSAGE_TYPES];

export type QrScannerCandidateStatus = 'accepted' | 'duplicate' | 'rejected' | 'error';
export type QrScannerCommitStatus = 'committing' | 'committed' | 'error';

export interface QrScannerMessageBase {
  version: typeof QR_SCANNER_PROTOCOL_VERSION;
  type: ScannerMessageType;
  requestId: string;
}

export interface QrScannerReadyMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.ready;
}

export interface QrScannerScanMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.scan;
  scanId: string;
  value: string;
}

export interface QrScannerFinishMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.finish;
  commitRequestId: string;
}

export interface QrScannerCancelMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.cancel;
}

export interface QrScannerClosedMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.closed;
}

export type QrScannerToOpenerMessage =
  | QrScannerReadyMessage
  | QrScannerScanMessage
  | QrScannerFinishMessage
  | QrScannerCancelMessage
  | QrScannerClosedMessage;

export interface QrScannerSetupMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.setup;
  instruction?: string;
  maxFiles?: number;
  existingCount?: number;
  hideCloseOnIos?: boolean;
}

export interface QrScannerCandidateMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.candidate;
  scanId: string;
  status: QrScannerCandidateStatus;
  code?: string;
  fileId?: string;
  canonicalUrl?: string;
  displayName?: string;
  message?: string;
}

export interface QrScannerCommitMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.commit;
  status: QrScannerCommitStatus;
  linkedCount?: number;
  message?: string;
}

export interface QrScannerCancelledMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.cancelled;
  message?: string;
}

export interface QrScannerErrorMessage extends QrScannerMessageBase {
  type: typeof QR_SCANNER_MESSAGE_TYPES.error;
  code?: string;
  message: string;
  retryable?: boolean;
}

export type QrScannerFromOpenerMessage =
  | QrScannerSetupMessage
  | QrScannerCandidateMessage
  | QrScannerCommitMessage
  | QrScannerCancelledMessage
  | QrScannerErrorMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const boundedText = (value: unknown, maxLength: number, required = false): string | null => {
  if (typeof value !== 'string') return required ? null : '';
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) return null;
  if (Array.from(normalized).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    return null;
  }
  return normalized;
};

const identifier = (value: unknown): string | null => boundedText(value, MAX_IDENTIFIER_LENGTH, true);

const optionalNonNegativeInteger = (value: unknown): number | undefined | null => {
  if (value === undefined) return undefined;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
};

const optionalBoundedText = (value: unknown, maxLength: number): string | undefined | null => {
  if (value === undefined) return undefined;
  const normalized = boundedText(value, maxLength);
  return normalized === null ? null : normalized || undefined;
};

const canonicalDriveUrl = (value: unknown): string | undefined | null => {
  if (value === undefined) return undefined;
  const normalized = boundedText(value, MAX_QR_VALUE_LENGTH);
  if (!normalized) return normalized === null ? null : undefined;
  try {
    const url = new URL(normalized);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['drive.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase())
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const baseMessage = (
  value: Record<string, unknown>,
  expectedRequestId?: string
): { requestId: string; type: string } | null => {
  if (value.version !== QR_SCANNER_PROTOCOL_VERSION || typeof value.type !== 'string') return null;
  const requestId = identifier(value.requestId);
  if (!requestId || (expectedRequestId && requestId !== expectedRequestId)) return null;
  return { requestId, type: value.type };
};

const buildBase = <T extends ScannerMessageType>(type: T, requestId: string): QrScannerMessageBase & { type: T } => ({
  version: QR_SCANNER_PROTOCOL_VERSION,
  type,
  requestId
});

export const buildQrScannerReadyMessage = (requestId: string): QrScannerReadyMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.ready, requestId)
});

export const buildQrScannerScanMessage = (
  requestId: string,
  scanId: string,
  value: string
): QrScannerScanMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.scan, requestId),
  scanId,
  value
});

export const buildQrScannerFinishMessage = (
  requestId: string,
  commitRequestId: string
): QrScannerFinishMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.finish, requestId),
  commitRequestId
});

export const buildQrScannerCancelMessage = (requestId: string): QrScannerCancelMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.cancel, requestId)
});

export const buildQrScannerClosedMessage = (requestId: string): QrScannerClosedMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.closed, requestId)
});

export const buildQrScannerSetupMessage = (
  requestId: string,
  setup: Omit<QrScannerSetupMessage, keyof QrScannerMessageBase | 'type'> = {}
): QrScannerSetupMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.setup, requestId),
  ...setup
});

export const buildQrScannerCandidateMessage = (
  requestId: string,
  candidate: Omit<QrScannerCandidateMessage, keyof QrScannerMessageBase | 'type'>
): QrScannerCandidateMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.candidate, requestId),
  ...candidate
});

export const buildQrScannerCommitMessage = (
  requestId: string,
  commit: Omit<QrScannerCommitMessage, keyof QrScannerMessageBase | 'type'>
): QrScannerCommitMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.commit, requestId),
  ...commit
});

export const buildQrScannerCancelledMessage = (
  requestId: string,
  message?: string
): QrScannerCancelledMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.cancelled, requestId),
  ...(message ? { message } : {})
});

export const buildQrScannerErrorMessage = (
  requestId: string,
  error: Omit<QrScannerErrorMessage, keyof QrScannerMessageBase | 'type'>
): QrScannerErrorMessage => ({
  ...buildBase(QR_SCANNER_MESSAGE_TYPES.error, requestId),
  ...error
});

export const parseQrScannerToOpenerMessage = (
  value: unknown,
  expectedRequestId?: string
): QrScannerToOpenerMessage | null => {
  if (!isRecord(value)) return null;
  const base = baseMessage(value, expectedRequestId);
  if (!base) return null;

  if ([QR_SCANNER_MESSAGE_TYPES.ready, QR_SCANNER_MESSAGE_TYPES.cancel, QR_SCANNER_MESSAGE_TYPES.closed].includes(base.type as any)) {
    return { ...buildBase(base.type as any, base.requestId) } as QrScannerToOpenerMessage;
  }
  if (base.type === QR_SCANNER_MESSAGE_TYPES.scan) {
    const scanId = identifier(value.scanId);
    const rawValue = boundedText(value.value, MAX_QR_VALUE_LENGTH, true);
    if (!scanId || !rawValue) return null;
    return buildQrScannerScanMessage(base.requestId, scanId, rawValue);
  }
  if (base.type === QR_SCANNER_MESSAGE_TYPES.finish) {
    const commitRequestId = identifier(value.commitRequestId);
    return commitRequestId ? buildQrScannerFinishMessage(base.requestId, commitRequestId) : null;
  }
  return null;
};

export const parseQrScannerFromOpenerMessage = (
  value: unknown,
  expectedRequestId?: string
): QrScannerFromOpenerMessage | null => {
  if (!isRecord(value)) return null;
  const base = baseMessage(value, expectedRequestId);
  if (!base) return null;

  if (base.type === QR_SCANNER_MESSAGE_TYPES.setup) {
    const instruction = optionalBoundedText(value.instruction, MAX_INSTRUCTION_LENGTH);
    const maxFiles = optionalNonNegativeInteger(value.maxFiles);
    const existingCount = optionalNonNegativeInteger(value.existingCount);
    if (instruction === null || maxFiles === null || existingCount === null) return null;
    if (value.hideCloseOnIos !== undefined && typeof value.hideCloseOnIos !== 'boolean') return null;
    return buildQrScannerSetupMessage(base.requestId, {
      ...(instruction ? { instruction } : {}),
      ...(maxFiles !== undefined ? { maxFiles } : {}),
      ...(existingCount !== undefined ? { existingCount } : {}),
      ...(typeof value.hideCloseOnIos === 'boolean' ? { hideCloseOnIos: value.hideCloseOnIos } : {})
    });
  }

  if (base.type === QR_SCANNER_MESSAGE_TYPES.candidate) {
    const scanId = identifier(value.scanId);
    if (!scanId || !['accepted', 'duplicate', 'rejected', 'error'].includes(value.status as string)) return null;
    const code = optionalBoundedText(value.code, MAX_CODE_LENGTH);
    const displayName = optionalBoundedText(value.displayName, MAX_DISPLAY_NAME_LENGTH);
    const message = optionalBoundedText(value.message, MAX_MESSAGE_LENGTH);
    const canonicalUrl = canonicalDriveUrl(value.canonicalUrl);
    const fileId = value.fileId === undefined ? undefined : boundedText(value.fileId, 200);
    if (
      code === null ||
      displayName === null ||
      message === null ||
      canonicalUrl === null ||
      (fileId !== undefined && (!fileId || !DRIVE_FILE_ID_PATTERN.test(fileId)))
    ) {
      return null;
    }
    return buildQrScannerCandidateMessage(base.requestId, {
      scanId,
      status: value.status as QrScannerCandidateStatus,
      ...(code ? { code } : {}),
      ...(fileId ? { fileId } : {}),
      ...(canonicalUrl ? { canonicalUrl } : {}),
      ...(displayName ? { displayName } : {}),
      ...(message ? { message } : {})
    });
  }

  if (base.type === QR_SCANNER_MESSAGE_TYPES.commit) {
    if (!['committing', 'committed', 'error'].includes(value.status as string)) return null;
    const linkedCount = optionalNonNegativeInteger(value.linkedCount);
    const message = optionalBoundedText(value.message, MAX_MESSAGE_LENGTH);
    if (linkedCount === null || message === null) return null;
    return buildQrScannerCommitMessage(base.requestId, {
      status: value.status as QrScannerCommitStatus,
      ...(linkedCount !== undefined ? { linkedCount } : {}),
      ...(message ? { message } : {})
    });
  }

  if (base.type === QR_SCANNER_MESSAGE_TYPES.cancelled) {
    const message = optionalBoundedText(value.message, MAX_MESSAGE_LENGTH);
    return message === null ? null : buildQrScannerCancelledMessage(base.requestId, message);
  }

  if (base.type === QR_SCANNER_MESSAGE_TYPES.error) {
    const message = boundedText(value.message, MAX_MESSAGE_LENGTH, true);
    const code = optionalBoundedText(value.code, MAX_CODE_LENGTH);
    if (!message || code === null || (value.retryable !== undefined && typeof value.retryable !== 'boolean')) return null;
    return buildQrScannerErrorMessage(base.requestId, {
      message,
      ...(code ? { code } : {}),
      ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {})
    });
  }

  return null;
};
