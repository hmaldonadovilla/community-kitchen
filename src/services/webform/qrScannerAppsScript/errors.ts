import { QrScannerResultCode, QrScannerRpcEnvelope } from './types';

const DEFAULT_MESSAGES: Record<QrScannerResultCode, string> = {
  ACCEPTED: 'Receipt checked - ready to add.',
  DUPLICATE_SESSION: 'You already scanned this receipt.',
  ALREADY_LINKED: 'This receipt is already linked.',
  INVALID_PAYLOAD: 'This is not a supported receipt QR code.',
  NOT_AUTHORISED_OR_UNAVAILABLE:
    'This file cannot be linked. It may be unavailable or outside the authorised folder.',
  TRASHED: 'This file is in the Drive bin and cannot be linked.',
  UNSUPPORTED_TYPE: 'This file type cannot be used as receipt evidence.',
  LIMIT_REACHED: 'You have reached the maximum number of receipts.',
  TEMPORARY_ERROR: 'We could not check this code. It was not added - try again.',
  RECORD_CHANGED: 'The form changed while scanning. Return to the form and try again.',
  SESSION_EXPIRED: 'This scan session expired. Return to the form and start again.',
  SESSION_NOT_ACTIVE: 'This scan session is no longer active.',
  INVALID_CREDENTIAL: 'Scan session authentication failed.',
  INVALID_REQUEST: 'The scan session request is invalid.',
  NOT_FOUND: 'Scan session not found.',
  CONFIGURATION_ERROR: 'QR scanning is not configured for this upload field.',
  INTERNAL_ERROR: 'The scan session request failed.'
};

export class QrScannerError extends Error {
  readonly code: QrScannerResultCode;
  readonly retryable: boolean;

  constructor(code: QrScannerResultCode, options?: { message?: string; retryable?: boolean }) {
    super(options?.message || DEFAULT_MESSAGES[code] || DEFAULT_MESSAGES.INTERNAL_ERROR);
    this.name = 'QrScannerError';
    this.code = code;
    this.retryable = options?.retryable === true;
  }
}

export const qrScannerError = (
  code: QrScannerResultCode,
  options?: { message?: string; retryable?: boolean }
): QrScannerError => new QrScannerError(code, options);

export const isQrScannerError = (error: unknown): error is QrScannerError =>
  error instanceof QrScannerError ||
  Boolean(
    error &&
      typeof error === 'object' &&
      typeof (error as any).code === 'string' &&
      Object.prototype.hasOwnProperty.call(DEFAULT_MESSAGES, (error as any).code)
  );

/** Converts failures to a stable, non-sensitive RPC response. */
export const toQrScannerRpcFailure = <T = never>(error: unknown): QrScannerRpcEnvelope<T> => {
  if (isQrScannerError(error)) {
    const code = error.code as QrScannerResultCode;
    return {
      ok: false,
      error: {
        code,
        message: DEFAULT_MESSAGES[code] || DEFAULT_MESSAGES.INTERNAL_ERROR,
        retryable: error.retryable === true
      }
    };
  }
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: DEFAULT_MESSAGES.INTERNAL_ERROR,
      retryable: true
    }
  };
};
