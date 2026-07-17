import type { QrScanSessionLaunchResult } from '../../../../../types';
import { qrScannerSessionRpcApi } from '../../../api';

export type QrScannerSessionErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CREDENTIAL'
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_ACTIVE'
  | 'RECORD_CHANGED'
  | 'TEMPORARY_ERROR'
  | 'NOT_FOUND'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR'
  | string;

export class QrScannerSessionError extends Error {
  readonly code: QrScannerSessionErrorCode;
  readonly retryable: boolean;

  constructor(code: QrScannerSessionErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'QrScannerSessionError';
    this.code = code;
    this.retryable = retryable;
  }
}

export type QrScannerSessionCredentials = {
  sessionId: string;
  accessToken: string;
};

export type QrScannerSessionStatus = 'ACTIVE' | 'COMMITTING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export type QrScannerCommittedFieldResult = {
  linkedCount: number;
  skippedCount: number;
  recordId: string;
  dataVersion?: number;
  fieldValue: string;
  links: string[];
  summaryCode: 'COMMITTED' | 'NOTHING_TO_COMMIT';
  idempotent?: boolean;
};

export type QrScannerSessionProjection = {
  id: string;
  instruction?: string;
  maxFiles: number;
  existingCount: number;
  status: QrScannerSessionStatus;
  commitResult?: QrScannerCommittedFieldResult;
  capabilities?: {
    addCandidates?: boolean;
    maxCandidateBatchSize?: number;
  };
  [key: string]: unknown;
};

export type QrScannerCandidateProjection = {
  id: string;
  status: 'AUTHORISED' | 'DUPLICATE' | 'REJECTED' | 'RETRYABLE_ERROR';
  code: string;
  fileId?: string;
  canonicalUrl?: string;
  displayName?: string;
  mimeType?: string;
  retryable?: boolean;
};

export type QrScannerCandidateResult = {
  candidate: QrScannerCandidateProjection;
  session: QrScannerSessionProjection;
  committed?: QrScannerCommittedFieldResult;
};

export type QrScannerCandidateRequest = {
  scanId: string;
  rawValue: string;
};

export type QrScannerCandidateBatchResult = {
  results: Array<{ candidate: QrScannerCandidateProjection; committed?: QrScannerCommittedFieldResult }>;
  session: QrScannerSessionProjection;
  committed?: QrScannerCommittedFieldResult;
  transport: 'batch' | 'legacy';
};

export type QrScannerCommitResult = {
  status: 'COMPLETED';
  result: QrScannerCommittedFieldResult;
  session: QrScannerSessionProjection;
};

type RpcEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code?: unknown; message?: unknown; retryable?: unknown } };

const boundedText = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : '';
};

const secureToken = (): string => {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new QrScannerSessionError('INTERNAL_ERROR', 'Secure scanner tokens are unavailable.');
  const bytes = new Uint8Array(24);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const unwrapRpc = <T,>(envelope: RpcEnvelope<T>): T => {
  if (envelope?.ok === true) return envelope.result;
  const failure = envelope && envelope.ok === false ? envelope.error : null;
  throw new QrScannerSessionError(
    boundedText(failure?.code, 80) || 'INTERNAL_ERROR',
    boundedText(failure?.message, 500) || 'The scanner request failed.',
    failure?.retryable === true
  );
};

const callRpc = async <T,>(method: string, params: Record<string, unknown>): Promise<T> =>
  unwrapRpc<T>(await qrScannerSessionRpcApi<RpcEnvelope<T>>({ method, params }));

export const readQrScannerLaunchCredentials = (
  launch: Extract<QrScanSessionLaunchResult, { success: true }>
): { sessionId: string; launchToken: string } => {
  const expectedSessionId = boundedText(launch.sessionId, 256);
  let parsed: URL;
  try {
    parsed = new URL(launch.launchUrl);
  } catch {
    throw new QrScannerSessionError('INTERNAL_ERROR', 'The scanner session response is invalid.');
  }
  const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const params = new URLSearchParams(hash);
  const sessionId = boundedText(params.get('sessionId'), 256);
  const launchToken = boundedText(params.get('launchToken'), 512);
  if (!sessionId || sessionId !== expectedSessionId || !launchToken) {
    throw new QrScannerSessionError('INTERNAL_ERROR', 'The scanner session response is invalid.');
  }
  return { sessionId, launchToken };
};

export const redeemQrScannerSession = async (
  launch: Extract<QrScanSessionLaunchResult, { success: true }>
): Promise<{ credentials: QrScannerSessionCredentials; session: QrScannerSessionProjection }> => {
  const launchCredentials = readQrScannerLaunchCredentials(launch);
  const redeemed = await callRpc<{ accessToken: string; session: QrScannerSessionProjection }>('qrScanner.redeem', {
    ...launchCredentials,
    clientNonce: secureToken()
  });
  const accessToken = boundedText(redeemed?.accessToken, 512);
  if (!accessToken || !redeemed?.session) {
    throw new QrScannerSessionError('INTERNAL_ERROR', 'The scanner session could not be started.');
  }
  return {
    credentials: { sessionId: launchCredentials.sessionId, accessToken },
    session: redeemed.session
  };
};

export const addQrScannerCandidate = (
  credentials: QrScannerSessionCredentials,
  request: QrScannerCandidateRequest
): Promise<QrScannerCandidateResult> =>
  callRpc<QrScannerCandidateResult>('qrScanner.addCandidate', {
    ...credentials,
    scanId: request.scanId,
    rawValue: request.rawValue
  });

export const addQrScannerCandidates = async (
  credentials: QrScannerSessionCredentials,
  request: { requestId: string; candidates: QrScannerCandidateRequest[] }
): Promise<QrScannerCandidateBatchResult> => {
  const batch = await callRpc<Omit<QrScannerCandidateBatchResult, 'transport'>>('qrScanner.addCandidates', {
    ...credentials,
    requestId: request.requestId,
    candidates: request.candidates
  });
  return { ...batch, transport: 'batch' };
};

export const commitQrScannerSession = (
  credentials: QrScannerSessionCredentials,
  requestId: string
): Promise<QrScannerCommitResult> =>
  callRpc<QrScannerCommitResult>('qrScanner.commit', { ...credentials, requestId });

export const cancelQrScannerSession = (
  credentials: QrScannerSessionCredentials
): Promise<{ status: 'CANCELLED' | 'COMPLETED'; session: QrScannerSessionProjection }> =>
  callRpc('qrScanner.cancel', credentials);

export const getQrScannerSession = (
  credentials: QrScannerSessionCredentials
): Promise<{ session: QrScannerSessionProjection }> =>
  callRpc('qrScanner.getSession', credentials);
