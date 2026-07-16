import { FileUploadConfig, FormConfigExport, WebFormSubmission } from '../../../types';

export type QrScannerResultCode =
  | 'ACCEPTED'
  | 'DUPLICATE_SESSION'
  | 'ALREADY_LINKED'
  | 'INVALID_PAYLOAD'
  | 'NOT_AUTHORISED_OR_UNAVAILABLE'
  | 'TRASHED'
  | 'UNSUPPORTED_TYPE'
  | 'LIMIT_REACHED'
  | 'TEMPORARY_ERROR'
  | 'RECORD_CHANGED'
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_ACTIVE'
  | 'INVALID_CREDENTIAL'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

export type QrScannerSessionStatus = 'ACTIVE' | 'COMMITTING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type QrScannerCandidateStatus = 'AUTHORISED' | 'DUPLICATE' | 'REJECTED' | 'RETRYABLE_ERROR';

export interface StoredQrScannerCandidate {
  id: string;
  scanIdHash: string;
  payloadHash: string;
  status: QrScannerCandidateStatus;
  code: QrScannerResultCode;
  fileId?: string;
  displayName?: string;
  mimeType?: string;
  retryable?: boolean;
  incremental?: {
    state: 'PENDING' | 'RETRYABLE' | 'COMPLETED';
    updatedAt: string;
  };
  checkedAt: string;
}

export interface QrScannerCommitResult {
  linkedCount: number;
  skippedCount: number;
  recordId: string;
  dataVersion: number;
  fieldValue: string;
  links: string[];
  returnUrl: string;
  summaryCode: 'COMMITTED' | 'NOTHING_TO_COMMIT';
}

/** Authoritative upload-field state after one accepted scan is attached. */
export interface QrScannerIncrementalCommitResult {
  linkedCount: 1;
  skippedCount: 0;
  recordId: string;
  dataVersion: number;
  fieldValue: string;
  links: string[];
  summaryCode: 'COMMITTED';
  /** True when a same-scan retry reconciled a link that was already durable. */
  idempotent: boolean;
}

export interface QrScannerFieldAppendResult {
  success: boolean;
  code?: 'RECORD_CHANGED' | 'NOT_FOUND' | 'CONFIGURATION_ERROR' | 'LIMIT_REACHED' | 'TEMPORARY_ERROR';
  message: string;
  appendedCount?: number;
  dataVersion?: number;
  fieldValue?: string;
  links?: string[];
  idempotent?: boolean;
}

export interface StoredQrScannerSession {
  schemaVersion: 1;
  id: string;
  formKey: string;
  recordId: string;
  fieldId: string;
  fieldLabel: string;
  displayTitle: string;
  language: 'EN' | 'FR' | 'NL';
  instruction?: string;
  expectedDataVersion: number;
  maxFiles: number;
  existingCount: number;
  existingFileIds: string[];
  /** Total files added by this session, including completed candidates compacted from storage. */
  incrementalAcceptedCount?: number;
  returnContext?: Record<string, string>;
  returnUrl: string;
  status: QrScannerSessionStatus;
  candidates: StoredQrScannerCandidate[];
  attempts: number;
  maxAttempts: number;
  launchTokenHash: string;
  launchExpiresAt: string;
  accessTokenHash?: string;
  redemptionNonceHash?: string;
  redeemedAt?: string;
  commit?: { requestIdHash: string; startedAt: string; completedAt?: string };
  commitResult?: QrScannerCommitResult;
  cancelResult?: { returnUrl: string; cancelledAt: string };
  lastErrorCode?: QrScannerResultCode;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  revision: number;
}

export interface QrScannerCandidateProjection {
  id: string;
  status: QrScannerCandidateStatus;
  code: QrScannerResultCode;
  fileId?: string;
  displayName?: string;
  canonicalUrl?: string;
  mimeType?: string;
  retryable?: boolean;
  checkedAt: string;
}

export interface QrScannerSessionProjection {
  id: string;
  status: QrScannerSessionStatus;
  expiresAt: string;
  formKey: string;
  recordId: string;
  fieldId: string;
  fieldLabel: string;
  displayTitle: string;
  language: 'EN' | 'FR' | 'NL';
  instruction?: string;
  maxFiles: number;
  existingCount: number;
  returnUrl: string;
  candidates: QrScannerCandidateProjection[];
  counts: {
    accepted: number;
    authorised: number;
    duplicate: number;
    rejected: number;
    permanentRejected: number;
    retryable: number;
    pending: number;
    total: number;
    remaining: number;
  };
  revision: number;
  commitResult?: QrScannerCommitResult;
}

export interface QrScannerAuthoritativeService {
  fetchFormConfig(formKey?: string): FormConfigExport;
  fetchSubmissionById(formKey: string, recordId: string): WebFormSubmission | null;
  appendQrScannerUploadLinks(request: {
    formKey: string;
    recordId: string;
    fieldId: string;
    links: string[];
    expectedDataVersion: number;
  }): QrScannerFieldAppendResult;
}

export interface QrScannerTarget {
  config: FormConfigExport;
  field: NonNullable<FormConfigExport['questions']>[number];
  uploadConfig: FileUploadConfig;
  record: WebFormSubmission;
  dataVersion: number;
  currentLinks: string[];
  currentFileIds: string[];
}

export interface QrScannerSessionStore {
  create(session: StoredQrScannerSession): StoredQrScannerSession;
  get(sessionId: string): StoredQrScannerSession | null;
  mutate(
    sessionId: string,
    update: (current: StoredQrScannerSession) => StoredQrScannerSession | null
  ): StoredQrScannerSession;
}

export interface QrScannerCrypto {
  hash(value: string): string;
  deriveAccessToken(launchToken: string, sessionId: string, clientNonce: string): string;
  matches(value: string, expectedHash?: string): boolean;
  randomToken(byteLength?: number): string;
}

export interface DriveAuthorizationMetadata {
  id: string;
  name: string;
  mimeType: string;
  trashed: boolean;
  parentIds: string[];
  driveId?: string;
  shortcut: boolean;
}

export interface QrScannerDriveRepository {
  fetchMetadata(fileId: string): DriveAuthorizationMetadata;
}

export interface QrScannerRuntime {
  now(): Date;
  getScriptProperty(key: string): string | null;
  getServiceUrl(): string;
  getGeneratedAssetBaseUrl(): string;
}

export type QrScannerRpcEnvelope<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      error: { code: QrScannerResultCode; message: string; retryable: boolean };
    };

export interface RedeemQrScannerRequest {
  sessionId: string;
  launchToken: string;
  clientNonce: string;
}

export interface AuthenticatedQrScannerRequest {
  sessionId: string;
  accessToken: string;
}

export interface AddQrScannerCandidateRequest extends AuthenticatedQrScannerRequest {
  scanId: string;
  rawValue: string;
}

export interface CommitQrScannerRequest extends AuthenticatedQrScannerRequest {
  requestId: string;
}
