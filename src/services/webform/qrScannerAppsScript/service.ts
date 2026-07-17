import { QrScanSessionLaunchRequest, QrScanSessionLaunchResult } from '../../../types';
import { debugLog } from '../debug';
import { QrScannerFileAuthorizationService } from './authorization';
import {
  buildScannerLaunchUrl,
  buildScannerReturnUrl,
  candidateCounts,
  candidateStatusForCode,
  canonicalDriveFileUrl,
  hasAuthoritativeQrScannerConfig,
  normalizeLanguage,
  normalizeReturnContext,
  parseDriveQrPayload,
  projectCandidate,
  projectSession,
  recordDataVersion,
  resolveAuthoritativeTarget,
  resolveAuthoritativeTargetFromResolved,
  resolveQrScannerInstruction,
  splitUploadLinks
} from './domain';
import { qrScannerError } from './errors';
import {
  AddQrScannerCandidateRequest,
  AddQrScannerCandidatesRequest,
  AuthenticatedQrScannerRequest,
  CommitQrScannerRequest,
  QrScannerAuthoritativeService,
  QrScannerCrypto,
  QrScannerFieldAppendResult,
  QrScannerIncrementalCommitResult,
  QrScannerResultCode,
  QrScannerRuntime,
  QR_SCANNER_MAX_CANDIDATE_BATCH_SIZE,
  QrScannerSessionProjection,
  QrScannerSessionStore,
  QrScannerTarget,
  StoredQrScannerCandidate,
  StoredQrScannerSession
} from './types';

export const QR_SCANNER_URL_PROPERTY_KEY = 'CK_QR_SCANNER_URL';
const DEFAULT_SESSION_TTL_MINUTES = 15;
const MAX_SESSION_TTL_MINUTES = 30;
const LAUNCH_TOKEN_TTL_MINUTES = 5;
const DEFAULT_MAX_ATTEMPTS = 20;
// ScriptProperties has a 9 KB value ceiling. Keep at most the configured
// default 10-file flow; accepted totals and file identities survive compaction.
const MAX_STORED_CANDIDATES = 10;

type CandidateTiming = {
  startedAt: number;
  stages: Record<string, number>;
};

type NormalizedBatchCandidate = {
  scanIdHash: string;
  payloadHash: string;
  parsed: ReturnType<typeof parseDriveQrPayload>;
  prior?: StoredQrScannerCandidate;
  candidate?: StoredQrScannerCandidate;
  duplicateOfScanIdHash?: string;
  newlyAuthorised?: boolean;
  replayed?: boolean;
  consumesAttempt?: boolean;
};

const timeCandidateStage = <T>(timing: CandidateTiming, stage: string, operation: () => T): T => {
  const startedAt = Date.now();
  try {
    return operation();
  } finally {
    timing.stages[stage] = (timing.stages[stage] || 0) + Math.max(0, Date.now() - startedAt);
  }
};

const normalizeIdentifier = (value: unknown, maxLength = 160): string => {
  const normalized = (value ?? '').toString().trim();
  if (!normalized || normalized.length > maxLength) return '';
  if (Array.from(normalized).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return '';
  return normalized;
};

const boundedUtf8Text = (value: unknown, maxBytes: number): string => {
  let result = '';
  let bytes = 0;
  for (const character of (value ?? '').toString().trim()) {
    const codePoint = character.codePointAt(0) || 0;
    const characterBytes = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
};

const addMinutes = (date: Date, minutes: number): string =>
  new Date(date.getTime() + minutes * 60 * 1000).toISOString();

const sessionTtlMinutes = (value: unknown): number => {
  const configured = Number(value);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_SESSION_TTL_MINUTES;
  return Math.max(1, Math.min(Math.floor(configured), MAX_SESSION_TTL_MINUTES));
};

const maximumFiles = (value: unknown): number => {
  const configured = Number(value);
  if (!Number.isFinite(configured) || configured <= 0) return 10;
  return Math.max(1, Math.min(Math.floor(configured), 100));
};

const fieldText = (field: any): string =>
  boundedUtf8Text(field?.qEn || field?.label?.en || field?.label || field?.id || 'Scan QR codes', 160);

const isExpired = (session: StoredQrScannerSession, now: Date): boolean => {
  const expiry = Date.parse(session.expiresAt || '');
  return !Number.isFinite(expiry) || expiry <= now.getTime();
};

const isLaunchExpired = (session: StoredQrScannerSession, now: Date): boolean => {
  const expiry = Date.parse(session.launchExpiresAt || '');
  return !Number.isFinite(expiry) || expiry <= now.getTime();
};

const scannerBaseUrl = (runtime: QrScannerRuntime): string => {
  const configured = (runtime.getScriptProperty(QR_SCANNER_URL_PROPERTY_KEY) || '').toString().trim();
  if (configured) return configured;
  const assets = (runtime.getGeneratedAssetBaseUrl() || '').toString().trim().replace(/\/+$/, '');
  return assets ? `${assets}/qr-scanner.html` : '';
};

const makeCandidate = (
  crypto: QrScannerCrypto,
  scanIdHash: string,
  payloadHash: string,
  code: QrScannerResultCode,
  now: Date,
  details?: { fileId?: string; fileIdHash?: string; displayName?: string; mimeType?: string; retryable?: boolean }
): StoredQrScannerCandidate => ({
  id: crypto.randomToken(12),
  scanIdHash,
  payloadHash,
  status: candidateStatusForCode(code),
  code,
  ...(details?.fileId ? { fileId: details.fileId } : {}),
  ...(details?.fileIdHash ? { fileIdHash: details.fileIdHash } : {}),
  ...(details?.displayName ? { displayName: boundedUtf8Text(details.displayName, 160) } : {}),
  ...(details?.mimeType ? { mimeType: boundedUtf8Text(details.mimeType, 80) } : {}),
  ...(details?.retryable ? { retryable: true } : {}),
  checkedAt: now.toISOString()
});

export class AppsScriptQrScannerService {
  constructor(
    private readonly authoritative: QrScannerAuthoritativeService,
    private readonly sessions: QrScannerSessionStore,
    private readonly authorization: QrScannerFileAuthorizationService,
    private readonly crypto: QrScannerCrypto,
    private readonly runtime: QrScannerRuntime
  ) {}

  createLaunch(request: QrScanSessionLaunchRequest): QrScanSessionLaunchResult {
    const formKey = normalizeIdentifier(request?.formKey);
    const recordId = normalizeIdentifier(request?.recordId);
    const fieldId = normalizeIdentifier(request?.fieldId);
    if (!formKey || !recordId || !fieldId) return this.launchFailure('INVALID_REQUEST');

    let config;
    try {
      config = this.authoritative.fetchFormConfig(formKey);
    } catch {
      return this.launchFailure('FORM_NOT_FOUND');
    }
    const questions = Array.isArray(config?.questions) && config.questions.length
      ? config.questions
      : Array.isArray((config as any)?.definition?.questions)
        ? (config as any).definition.questions
        : [];
    const field = questions.find(
      (question: any) =>
        question && question.status === 'Active' && (question.id || '').toString().trim() === fieldId
    );
    if (!field) return this.launchFailure('FIELD_NOT_FOUND');
    if (field.type !== 'FILE_UPLOAD') return this.launchFailure('FIELD_NOT_SUPPORTED');
    if (!hasAuthoritativeQrScannerConfig(field)) return this.launchFailure('SCANNER_DISABLED');
    let record;
    try {
      record = this.authoritative.fetchSubmissionById(formKey, recordId);
    } catch {
      record = null;
    }
    if (!record || (record.id || '').toString().trim() !== recordId) return this.launchFailure('RECORD_NOT_FOUND');

    let target;
    try {
      target = resolveAuthoritativeTargetFromResolved(config, record, recordId, fieldId);
    } catch {
      return this.launchFailure('SERVICE_UNAVAILABLE', true);
    }
    if (!target) return this.launchFailure('RECORD_NOT_FOUND');
    if (!target.dataVersion) return this.launchFailure('RECORD_NOT_FOUND');
    if (
      request.expectedDataVersion !== undefined &&
      (!Number.isSafeInteger(request.expectedDataVersion) || request.expectedDataVersion !== target.dataVersion)
    ) {
      return this.launchFailure('RECORD_CHANGED');
    }

    try {
      this.authorization.resolvePolicy(target.uploadConfig);
      const now = this.runtime.now();
      const id = this.crypto.randomToken(18);
      const launchToken = this.crypto.randomToken(32);
      const serviceUrl = this.runtime.getServiceUrl();
      const qrConfig = target.uploadConfig.linkCapture || {};
      const fieldLabel = fieldText(target.field);
      const language = normalizeLanguage(target.record.language || request.language);
      const instruction = boundedUtf8Text(resolveQrScannerInstruction(qrConfig.instruction, language), 300);
      const configuredMaxFiles = maximumFiles(target.uploadConfig.maxFiles);
      const launchUrl = buildScannerLaunchUrl(scannerBaseUrl(this.runtime), id, launchToken, instruction);
      if (!launchUrl || !buildScannerReturnUrl(serviceUrl, {
        id,
        formKey,
        recordId,
        fieldId,
        returnContext: normalizeReturnContext(request.returnContext) as Record<string, string> | undefined
      })) {
        return this.launchFailure('SERVICE_NOT_CONFIGURED');
      }
      const session: StoredQrScannerSession = {
        schemaVersion: 1,
        id,
        formKey,
        recordId,
        fieldId,
        fieldLabel,
        displayTitle: fieldLabel,
        language,
        ...(instruction ? { instruction } : {}),
        expectedDataVersion: target.dataVersion,
        maxFiles: configuredMaxFiles,
        existingCount: target.currentLinks.length,
        // Authoritative duplicate checks read the current field. Retain only a
        // bounded recent set here for races between that read and session lock.
        existingFileIds: target.currentFileIds.slice(-MAX_STORED_CANDIDATES),
        incrementalAcceptedCount: 0,
        ...(normalizeReturnContext(request.returnContext)
          ? { returnContext: normalizeReturnContext(request.returnContext) as Record<string, string> }
          : {}),
        returnUrl: '',
        status: 'ACTIVE',
        candidates: [],
        attempts: 0,
        maxAttempts: Math.max(DEFAULT_MAX_ATTEMPTS, configuredMaxFiles * 2),
        launchTokenHash: this.crypto.hash(launchToken),
        launchExpiresAt: addMinutes(now, LAUNCH_TOKEN_TTL_MINUTES),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: addMinutes(now, sessionTtlMinutes(qrConfig.sessionTtlMinutes)),
        revision: 1
      };
      session.returnUrl = buildScannerReturnUrl(serviceUrl, session);
      const stored = this.sessions.create(session);
      debugLog('qrScanner.appsScript.launch.ready', {
        sessionId: stored.id,
        formKey,
        recordId,
        fieldId,
        expiresAt: stored.expiresAt
      });
      return { success: true, sessionId: id, launchUrl, expiresAt: stored.launchExpiresAt };
    } catch (error) {
      const retryable = (error as any)?.retryable === true;
      debugLog('qrScanner.appsScript.launch.failed', {
        formKey,
        recordId,
        fieldId,
        code: (error as any)?.code || 'INTERNAL_ERROR',
        retryable
      });
      return this.launchFailure(retryable ? 'SERVICE_UNAVAILABLE' : 'SERVICE_REJECTED', retryable);
    }
  }

  redeem(request: { sessionId: string; launchToken: string; clientNonce: string }): {
    accessToken: string;
    session: QrScannerSessionProjection;
  } {
    const sessionId = normalizeIdentifier(request?.sessionId);
    const launchToken = normalizeIdentifier(request?.launchToken, 512);
    const clientNonce = normalizeIdentifier(request?.clientNonce, 256);
    if (!sessionId || !launchToken || !clientNonce) throw qrScannerError('INVALID_REQUEST');
    const accessToken = this.crypto.deriveAccessToken(launchToken, sessionId, clientNonce);
    let sessionExpired = false;
    const updated = this.sessions.mutate(sessionId, current => {
      if (!this.crypto.matches(launchToken, current.launchTokenHash)) throw qrScannerError('INVALID_CREDENTIAL');
      const now = this.runtime.now();
      if (isExpired(current, now)) {
        sessionExpired = true;
        if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(current.status)) return null;
        return {
          ...current,
          status: 'EXPIRED',
          updatedAt: now.toISOString()
        };
      }
      if (current.redeemedAt) {
        if (
          !this.crypto.matches(clientNonce, current.redemptionNonceHash) ||
          !this.crypto.matches(accessToken, current.accessTokenHash)
        ) {
          throw qrScannerError('INVALID_CREDENTIAL');
        }
        return null;
      }
      if (isLaunchExpired(current, now)) throw qrScannerError('SESSION_EXPIRED');
      return {
        ...current,
        accessTokenHash: this.crypto.hash(accessToken),
        redemptionNonceHash: this.crypto.hash(clientNonce),
        redeemedAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    });
    if (sessionExpired) throw qrScannerError('SESSION_EXPIRED');
    return { accessToken, session: projectSession(updated) };
  }

  getSession(request: AuthenticatedQrScannerRequest): { session: QrScannerSessionProjection } {
    return { session: projectSession(this.authenticate(request)) };
  }

  /**
   * Validates a small group of camera detections against one authoritative
   * snapshot and attaches every newly-authorised unique file in one write.
   * The request ID and persisted PENDING intent make the append recoverable
   * when Apps Script loses either the append response or the final state write.
   */
  addCandidates(request: AddQrScannerCandidatesRequest) {
    const timing: CandidateTiming = { startedAt: Date.now(), stages: {} };
    const snapshot = timeCandidateStage(timing, 'sessionRead', () => this.authenticate(request));
    if (snapshot.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
    const requestId = normalizeIdentifier(request?.requestId, 256);
    const source = Array.isArray(request?.candidates) ? request.candidates : [];
    if (!requestId || source.length < 1 || source.length > QR_SCANNER_MAX_CANDIDATE_BATCH_SIZE) {
      throw qrScannerError('INVALID_REQUEST');
    }

    const items: NormalizedBatchCandidate[] = source.map(entry => {
      const scanId = normalizeIdentifier(entry?.scanId, 256);
      const rawValue = normalizeIdentifier(entry?.rawValue, 2048);
      if (!scanId || !rawValue) throw qrScannerError('INVALID_REQUEST');
      const scanIdHash = this.crypto.hash(scanId);
      const payloadHash = this.crypto.hash(rawValue);
      const prior = snapshot.candidates.find(candidate => candidate.scanIdHash === scanIdHash);
      if (prior?.payloadHash !== undefined && prior.payloadHash !== payloadHash) {
        throw qrScannerError('INVALID_REQUEST');
      }
      return {
        scanIdHash,
        payloadHash,
        parsed: parseDriveQrPayload(rawValue),
        ...(prior ? { prior } : {})
      };
    });
    const payloadByScan = new Map<string, string>();
    items.forEach(item => {
      const previous = payloadByScan.get(item.scanIdHash);
      if (previous) throw qrScannerError('INVALID_REQUEST');
      payloadByScan.set(item.scanIdHash, item.payloadHash);
    });
    const requestHash = this.crypto.hash(requestId);
    const scanIdHashes = items.map(item => item.scanIdHash);
    const payloadHashes = items.map(item => item.payloadHash);
    const sameStoredIntent = (session: StoredQrScannerSession): boolean =>
      Boolean(
        session.incrementalBatch &&
        session.incrementalBatch.requestHash === requestHash &&
        JSON.stringify(session.incrementalBatch.scanIdHashes) === JSON.stringify(scanIdHashes) &&
        JSON.stringify(session.incrementalBatch.payloadHashes) === JSON.stringify(payloadHashes)
      );
    if (snapshot.incrementalBatch && !sameStoredIntent(snapshot)) {
      if (snapshot.incrementalBatch.requestHash === requestHash) throw qrScannerError('INVALID_REQUEST');
      throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
    }
    if (snapshot.lastIncrementalBatch?.requestHash === requestHash) {
      const sameLastRequest =
        JSON.stringify(snapshot.lastIncrementalBatch.scanIdHashes) === JSON.stringify(scanIdHashes) &&
        JSON.stringify(snapshot.lastIncrementalBatch.payloadHashes) === JSON.stringify(payloadHashes);
      if (!sameLastRequest) throw qrScannerError('INVALID_REQUEST');
    }

    const authorisedByFileId = new Map<string, StoredQrScannerCandidate>();
    const reusableByFileIdHash = new Map<string, StoredQrScannerCandidate>();
    const reusableByPayloadHash = new Map<string, StoredQrScannerCandidate>();
    snapshot.candidates.forEach(candidate => {
      if (candidate.status === 'AUTHORISED' && candidate.fileId) {
        authorisedByFileId.set(candidate.fileId, candidate);
      }
      if (candidate.status !== 'RETRYABLE_ERROR' && !reusableByPayloadHash.has(candidate.payloadHash)) {
        reusableByPayloadHash.set(candidate.payloadHash, candidate);
      }
      const fileIdHash = candidate.fileIdHash || (candidate.fileId ? this.crypto.hash(candidate.fileId) : '');
      if (fileIdHash && candidate.status !== 'RETRYABLE_ERROR' && !reusableByFileIdHash.has(fileIdHash)) {
        reusableByFileIdHash.set(fileIdHash, candidate);
      }
    });

    const representativeByFileId = new Map<string, string>();
    let requiresTarget = Boolean(snapshot.incrementalBatch);
    items.forEach(item => {
      if (snapshot.lastIncrementalBatch?.requestHash === requestHash && item.prior) {
        item.candidate = item.prior;
        item.replayed = item.prior.status === 'AUTHORISED';
        requiresTarget = requiresTarget || item.replayed;
        return;
      }
      if (item.prior && item.prior.status !== 'RETRYABLE_ERROR') {
        item.candidate = item.prior;
        item.replayed = item.prior.status === 'AUTHORISED';
        requiresTarget = requiresTarget || item.replayed;
        return;
      }
      if (!item.parsed.ok) {
        const reusable = reusableByPayloadHash.get(item.payloadHash);
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          reusable?.code || 'INVALID_PAYLOAD',
          this.runtime.now(),
          { retryable: reusable?.retryable }
        );
        item.consumesAttempt = !reusable;
        return;
      }
      const representative = representativeByFileId.get(item.parsed.fileId);
      if (representative) {
        item.duplicateOfScanIdHash = representative;
        return;
      }
      representativeByFileId.set(item.parsed.fileId, item.scanIdHash);
      if (authorisedByFileId.has(item.parsed.fileId)) {
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          'DUPLICATE_SESSION',
          this.runtime.now()
        );
        return;
      }
      const reusableCanonical = reusableByFileIdHash.get(this.crypto.hash(item.parsed.fileId));
      if (reusableCanonical) {
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          reusableCanonical.code,
          this.runtime.now(),
          { fileIdHash: this.crypto.hash(item.parsed.fileId), retryable: reusableCanonical.retryable }
        );
        return;
      }
      const reusable = reusableByPayloadHash.get(item.payloadHash);
      if (reusable && reusable.status !== 'AUTHORISED') {
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          reusable.code,
          this.runtime.now(),
          { retryable: reusable.retryable }
        );
        return;
      }
      requiresTarget = true;
    });

    if (!requiresTarget) {
      let remainingAttemptBudget = Math.max(0, snapshot.maxAttempts - snapshot.attempts);
      items.forEach(item => {
        if (!item.consumesAttempt) return;
        if (remainingAttemptBudget > 0) {
          remainingAttemptBudget -= 1;
          return;
        }
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          'LIMIT_REACHED',
          this.runtime.now()
        );
        item.consumesAttempt = false;
      });
      this.resolveInBatchDuplicates(items);
      const updated = this.storeBatchCandidates(snapshot, request.accessToken, items, {
        requestHash,
        scanIdHashes,
        payloadHashes,
        fileIds: [],
        startedAt: this.runtime.now().toISOString()
      });
      return this.batchCandidateResponse(updated, items, undefined, timing);
    }

    const target = timeCandidateStage(timing, 'targetRead', () =>
      resolveAuthoritativeTarget(
        this.authoritative,
        snapshot.formKey,
        snapshot.recordId,
        snapshot.fieldId
      )
    );
    if (!target) throw qrScannerError('CONFIGURATION_ERROR');

    if (snapshot.incrementalBatch) {
      const intendedFileIds = snapshot.incrementalBatch.fileIds;
      const durable =
        target.dataVersion === snapshot.expectedDataVersion + 1 &&
        intendedFileIds.every(fileId => target.currentFileIds.includes(fileId));
      if (durable) {
        const committed = this.incrementalCommitFromTarget(snapshot, target, intendedFileIds.length, true);
        const completed = timeCandidateStage(timing, 'candidateFinalWrite', () =>
          this.completeCandidateBatch(snapshot, request.accessToken, requestHash, intendedFileIds, committed)
        );
        return this.batchCandidateResponse(completed, items, committed, timing);
      }
      if (target.dataVersion !== snapshot.expectedDataVersion) throw qrScannerError('RECORD_CHANGED');
      const append = this.appendCandidateBatch(snapshot, intendedFileIds, timing);
      return this.finishCandidateBatchAppend(snapshot, request, requestHash, items, intendedFileIds, append, timing);
    }

    if (target.dataVersion !== snapshot.expectedDataVersion) throw qrScannerError('RECORD_CHANGED');
    items.forEach(item => {
      if (item.candidate) {
        if (
          item.candidate.status === 'AUTHORISED' &&
          item.candidate.fileId &&
          !target.currentFileIds.includes(item.candidate.fileId)
        ) {
          throw qrScannerError('RECORD_CHANGED');
        }
        return;
      }
      if (!item.parsed.ok) return;
      if (target.currentFileIds.includes(item.parsed.fileId)) {
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          'ALREADY_LINKED',
          this.runtime.now()
        );
      }
    });

    let remaining = Math.max(0, snapshot.maxFiles - target.currentLinks.length);
    let remainingAttemptBudget = Math.max(0, snapshot.maxAttempts - snapshot.attempts);
    items.forEach(item => {
      const parsed = item.parsed;
      if (item.consumesAttempt) {
        if (remainingAttemptBudget > 0) {
          remainingAttemptBudget -= 1;
        } else {
          item.candidate = makeCandidate(
            this.crypto,
            item.scanIdHash,
            item.payloadHash,
            'LIMIT_REACHED',
            this.runtime.now()
          );
          item.consumesAttempt = false;
        }
        return;
      }
      if (item.candidate || item.duplicateOfScanIdHash || !parsed.ok) return;
      if (remaining <= 0) {
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          'LIMIT_REACHED',
          this.runtime.now()
        );
        return;
      }
      if (remainingAttemptBudget <= 0) {
        item.candidate = makeCandidate(
          this.crypto,
          item.scanIdHash,
          item.payloadHash,
          'LIMIT_REACHED',
          this.runtime.now()
        );
        return;
      }
      remainingAttemptBudget -= 1;
      item.candidate = timeCandidateStage(timing, 'driveAuthorization', () =>
        this.authoriseCandidate(item.scanIdHash, item.payloadHash, parsed.fileId, target)
      );
      item.consumesAttempt = true;
      if (item.candidate.status === 'AUTHORISED') {
        item.newlyAuthorised = true;
        remaining -= 1;
      }
    });
    this.resolveInBatchDuplicates(items);

    const intendedFileIds = items
      .filter(item => item.newlyAuthorised)
      .map(item => item.candidate)
      .filter((candidate): candidate is StoredQrScannerCandidate =>
        Boolean(candidate?.status === 'AUTHORISED' && candidate.fileId)
      )
      .map(candidate => candidate.fileId!);
    const uniqueFileIds = Array.from(new Set(intendedFileIds));
    const replayedFileIds = Array.from(
      new Set(
        items
          .filter(item => item.replayed && item.candidate?.status === 'AUTHORISED' && item.candidate.fileId)
          .map(item => item.candidate!.fileId!)
      )
    );
    if (
      !uniqueFileIds.length &&
      snapshot.lastIncrementalBatch?.requestHash === requestHash &&
      replayedFileIds.length
    ) {
      const committed = this.incrementalCommitFromTarget(snapshot, target, replayedFileIds.length, true);
      return this.batchCandidateResponse(snapshot, items, committed, timing);
    }
    const pending = {
      requestHash,
      scanIdHashes,
      payloadHashes,
      fileIds: uniqueFileIds,
      startedAt: this.runtime.now().toISOString()
    };
    const reserved = timeCandidateStage(timing, 'candidateStateWrite', () =>
      this.storeBatchCandidates(snapshot, request.accessToken, items, pending)
    );
    if (!uniqueFileIds.length) {
      const committed = replayedFileIds.length
        ? this.incrementalCommitFromTarget(reserved, target, replayedFileIds.length, true)
        : undefined;
      return this.batchCandidateResponse(reserved, items, committed, timing);
    }

    const reservedFileIds = reserved.incrementalBatch?.requestHash === requestHash
      ? reserved.incrementalBatch.fileIds
      : [];
    if (!reservedFileIds.length) return this.batchCandidateResponse(reserved, items, undefined, timing);
    const append = this.appendCandidateBatch(snapshot, reservedFileIds, timing);
    return this.finishCandidateBatchAppend(snapshot, request, requestHash, items, reservedFileIds, append, timing);
  }

  addCandidate(request: AddQrScannerCandidateRequest): {
    candidate: ReturnType<typeof projectCandidate>;
    counts: ReturnType<typeof candidateCounts>;
    revision: number;
    session: QrScannerSessionProjection;
    committed?: QrScannerIncrementalCommitResult;
  } {
    const timing: CandidateTiming = { startedAt: Date.now(), stages: {} };
    const snapshot = timeCandidateStage(timing, 'sessionRead', () => this.authenticate(request));
    if (snapshot.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
    const scanId = normalizeIdentifier(request?.scanId, 256);
    const rawValue = normalizeIdentifier(request?.rawValue, 2048);
    if (!scanId || !rawValue) throw qrScannerError('INVALID_REQUEST');
    const scanIdHash = this.crypto.hash(scanId);
    const payloadHash = this.crypto.hash(rawValue);
    const prior = snapshot.candidates.find(candidate => candidate.scanIdHash === scanIdHash);
    if (prior?.payloadHash !== undefined && prior.payloadHash !== payloadHash) {
      throw qrScannerError('INVALID_REQUEST');
    }
    if (prior && prior.status !== 'RETRYABLE_ERROR') {
      const committed = prior.status === 'AUTHORISED' && prior.fileId
        ? timeCandidateStage(timing, 'replayReconcile', () => this.resolveCommittedCandidate(snapshot, prior))
        : undefined;
      this.logCheckedCandidate(snapshot, prior, committed, timing);
      return this.candidateResponse(snapshot, prior, committed);
    }
    // A retry of an existing scan ID must always be able to reconcile a write
    // whose response or final session update was lost.
    if (!prior && snapshot.attempts >= snapshot.maxAttempts) throw qrScannerError('SESSION_NOT_ACTIVE');

    const parsed = parseDriveQrPayload(rawValue);
    let candidate: StoredQrScannerCandidate;
    let target: QrScannerTarget | null = null;
    let retryingIncrementalAppend = false;
    if (!parsed.ok) {
      candidate = makeCandidate(this.crypto, scanIdHash, payloadHash, 'INVALID_PAYLOAD', this.runtime.now());
    } else {
      target = timeCandidateStage(timing, 'targetRead', () =>
        resolveAuthoritativeTarget(
          this.authoritative,
          snapshot.formKey,
          snapshot.recordId,
          snapshot.fieldId
        )
      );
      if (!target) throw qrScannerError('CONFIGURATION_ERROR');
      retryingIncrementalAppend = Boolean(
        prior?.status === 'RETRYABLE_ERROR' &&
        prior.incremental?.state !== 'COMPLETED' &&
        prior.fileId === parsed.fileId &&
        prior.payloadHash === payloadHash
      );
      if (
        target.dataVersion !== snapshot.expectedDataVersion &&
        !(
          retryingIncrementalAppend &&
          target.dataVersion === snapshot.expectedDataVersion + 1 &&
          target.currentFileIds.includes(parsed.fileId)
        )
      ) {
        throw qrScannerError('RECORD_CHANGED');
      }
      const accepted = snapshot.candidates.filter(entry => entry.status === 'AUTHORISED');
      if (target.currentFileIds.includes(parsed.fileId)) {
        candidate = retryingIncrementalAppend
          ? timeCandidateStage(timing, 'driveAuthorization', () =>
              this.authoriseCandidate(scanIdHash, payloadHash, parsed.fileId, target!)
            )
          : makeCandidate(this.crypto, scanIdHash, payloadHash, 'ALREADY_LINKED', this.runtime.now());
      } else if (accepted.some(entry => entry.fileId === parsed.fileId)) {
        candidate = makeCandidate(this.crypto, scanIdHash, payloadHash, 'DUPLICATE_SESSION', this.runtime.now());
      } else if (target.currentLinks.length >= snapshot.maxFiles) {
        candidate = makeCandidate(this.crypto, scanIdHash, payloadHash, 'LIMIT_REACHED', this.runtime.now());
      } else {
        const result = timeCandidateStage(timing, 'driveAuthorization', () =>
          this.authorization.authorize(parsed.fileId, target!.uploadConfig)
        );
        candidate = result.ok
          ? makeCandidate(this.crypto, scanIdHash, payloadHash, 'ACCEPTED', this.runtime.now(), {
              fileId: result.file.id,
              fileIdHash: this.crypto.hash(parsed.fileId),
              displayName: result.file.name,
              mimeType: result.file.mimeType
            })
          : makeCandidate(this.crypto, scanIdHash, payloadHash, result.code, this.runtime.now(), {
              fileIdHash: this.crypto.hash(parsed.fileId),
              retryable: result.retryable
            });
      }
    }

    if (candidate.status !== 'AUTHORISED' || !candidate.fileId || !target) {
      const updated = timeCandidateStage(timing, 'candidateStateWrite', () =>
        this.storeCandidate(snapshot, request.accessToken, scanIdHash, payloadHash, candidate)
      );
      const storedCandidate = updated.candidates.find(entry => entry.scanIdHash === scanIdHash) || candidate;
      this.logCheckedCandidate(updated, storedCandidate, undefined, timing);
      return this.candidateResponse(updated, storedCandidate);
    }

    const pendingCandidate: StoredQrScannerCandidate = {
      ...candidate,
      status: 'RETRYABLE_ERROR',
      code: 'TEMPORARY_ERROR',
      retryable: true,
      incremental: { state: 'PENDING', updatedAt: this.runtime.now().toISOString() }
    };
    const pendingSession = timeCandidateStage(timing, 'candidateStateWrite', () =>
      this.storeCandidate(
        snapshot,
        request.accessToken,
        scanIdHash,
        payloadHash,
        pendingCandidate
      )
    );
    const storedPending = pendingSession.candidates.find(entry => entry.scanIdHash === scanIdHash);
    if (storedPending?.status === 'AUTHORISED' && storedPending.fileId) {
      const committed = timeCandidateStage(timing, 'replayReconcile', () =>
        this.resolveCommittedCandidate(pendingSession, storedPending)
      );
      this.logCheckedCandidate(pendingSession, storedPending, committed, timing);
      return this.candidateResponse(pendingSession, storedPending, committed);
    }
    if (storedPending?.incremental?.state !== 'PENDING' || storedPending.fileId !== candidate.fileId) {
      const resolved = storedPending || pendingCandidate;
      this.logCheckedCandidate(pendingSession, resolved, undefined, timing);
      return this.candidateResponse(pendingSession, resolved);
    }

    const canonicalUrl = canonicalDriveFileUrl(candidate.fileId);
    let append: QrScannerFieldAppendResult;
    try {
      append = timeCandidateStage(timing, 'recordAppend', () =>
        this.authoritative.appendQrScannerUploadLinks({
          formKey: snapshot.formKey,
          recordId: snapshot.recordId,
          fieldId: snapshot.fieldId,
          links: [canonicalUrl],
          expectedDataVersion: snapshot.expectedDataVersion
        })
      );
    } catch {
      append = { success: false, code: 'TEMPORARY_ERROR', message: 'The receipt could not be attached.' };
    }

    if (!append.success) {
      const recovered = timeCandidateStage(timing, 'appendRecovery', () =>
        this.recoverIncrementalAppend(snapshot, candidate.fileId!)
      );
      if (recovered) append = recovered;
    }

    if (!append.success) {
      const code = append.code || 'TEMPORARY_ERROR';
      const failedCandidate: StoredQrScannerCandidate = {
        ...pendingCandidate,
        status: candidateStatusForCode(code),
        code,
        retryable: code === 'TEMPORARY_ERROR' || undefined,
        incremental: code === 'TEMPORARY_ERROR'
          ? { state: 'RETRYABLE', updatedAt: this.runtime.now().toISOString() }
          : undefined,
        ...(code === 'TEMPORARY_ERROR'
          ? {}
          : { fileId: undefined, displayName: undefined, mimeType: undefined }),
        checkedAt: this.runtime.now().toISOString()
      };
      const failedSession = timeCandidateStage(timing, 'candidateFinalWrite', () =>
        this.replaceCandidate(
          snapshot.id,
          request.accessToken,
          scanIdHash,
          payloadHash,
          failedCandidate
        )
      );
      const storedFailure = failedSession.candidates.find(entry => entry.scanIdHash === scanIdHash) || failedCandidate;
      this.logCheckedCandidate(failedSession, storedFailure, undefined, timing);
      return this.candidateResponse(failedSession, storedFailure);
    }

    let committed: QrScannerIncrementalCommitResult;
    try {
      committed = this.incrementalCommitResult(snapshot, append);
    } catch (error) {
      const code: QrScannerResultCode = (error as any)?.code === 'RECORD_CHANGED'
        ? 'RECORD_CHANGED'
        : 'TEMPORARY_ERROR';
      const unresolvedCandidate: StoredQrScannerCandidate = {
        ...pendingCandidate,
        status: candidateStatusForCode(code),
        code,
        retryable: code === 'TEMPORARY_ERROR' || undefined,
        incremental: code === 'TEMPORARY_ERROR'
          ? { state: 'RETRYABLE', updatedAt: this.runtime.now().toISOString() }
          : undefined,
        ...(code === 'TEMPORARY_ERROR'
          ? {}
          : { fileId: undefined, displayName: undefined, mimeType: undefined }),
        checkedAt: this.runtime.now().toISOString()
      };
      const unresolvedSession = timeCandidateStage(timing, 'candidateFinalWrite', () =>
        this.replaceCandidate(
          snapshot.id,
          request.accessToken,
          scanIdHash,
          payloadHash,
          unresolvedCandidate
        )
      );
      const storedUnresolved =
        unresolvedSession.candidates.find(entry => entry.scanIdHash === scanIdHash) || unresolvedCandidate;
      this.logCheckedCandidate(unresolvedSession, storedUnresolved, undefined, timing);
      return this.candidateResponse(unresolvedSession, storedUnresolved);
    }
    const completedCandidate: StoredQrScannerCandidate = {
      ...candidate,
      mimeType: undefined,
      incremental: { state: 'COMPLETED', updatedAt: this.runtime.now().toISOString() },
      checkedAt: this.runtime.now().toISOString()
    };
    const updated = timeCandidateStage(timing, 'candidateFinalWrite', () =>
      this.sessions.mutate(snapshot.id, current => {
        this.requireAuthenticatedCurrent(current, request.accessToken);
        if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
        const existing = current.candidates.find(entry => entry.scanIdHash === scanIdHash);
        if (existing?.status === 'AUTHORISED' && existing.payloadHash === payloadHash) return null;
        if (!existing || existing.payloadHash !== payloadHash) throw qrScannerError('INVALID_REQUEST');
        if (current.expectedDataVersion !== snapshot.expectedDataVersion) {
          throw qrScannerError('RECORD_CHANGED');
        }
        const nextCandidate = { ...completedCandidate, id: existing.id };
        const candidates = current.candidates.map(entry => (entry.id === existing.id ? nextCandidate : entry));
        const retainedAuthorised = current.candidates.filter(entry => entry.status === 'AUTHORISED').length;
        const acceptedBefore = Math.max(Number(current.incrementalAcceptedCount) || 0, retainedAuthorised);
        return {
          ...current,
          candidates,
          expectedDataVersion: committed.dataVersion,
          existingFileIds: Array.from(new Set([...current.existingFileIds, candidate.fileId!])).slice(
            -MAX_STORED_CANDIDATES
          ),
          incrementalAcceptedCount: acceptedBefore + 1,
          updatedAt: this.runtime.now().toISOString()
        };
      })
    );
    const storedCandidate = updated.candidates.find(entry => entry.scanIdHash === scanIdHash) || completedCandidate;
    this.logCheckedCandidate(updated, storedCandidate, committed, timing);
    return this.candidateResponse(updated, storedCandidate, committed);
  }

  commit(request: CommitQrScannerRequest): {
    status: 'COMPLETED';
    result: NonNullable<StoredQrScannerSession['commitResult']>;
    session: QrScannerSessionProjection;
  } {
    let session = this.authenticate(request);
    // Once the field append has been invoked, a failure may have happened after
    // the response-sheet write became durable. Keep the request COMMITTING so a
    // same-request retry can reconcile by Drive file ID before checking version.
    let preserveCommittingForRecovery = false;
    const requestId = normalizeIdentifier(request?.requestId, 256);
    if (!requestId) throw qrScannerError('INVALID_REQUEST');
    const requestIdHash = this.crypto.hash(requestId);
    if (session.status === 'COMPLETED' && session.commitResult) return this.commitResponse(session);
    if (session.status === 'COMMITTING' && session.commit?.requestIdHash !== requestIdHash) {
      throw qrScannerError('SESSION_NOT_ACTIVE');
    }
    const reconcilingCommittedWrite =
      session.status === 'COMMITTING' && session.commit?.requestIdHash === requestIdHash;
    if (!['ACTIVE', 'COMMITTING'].includes(session.status)) throw qrScannerError('SESSION_NOT_ACTIVE');

    if (session.status === 'ACTIVE') {
      session = this.sessions.mutate(session.id, current => {
        this.requireAuthenticatedCurrent(current, request.accessToken);
        if (current.status === 'COMPLETED') return null;
        if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
        if (current.candidates.some(candidate => candidate.incremental?.state === 'PENDING')) {
          throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
        }
        return {
          ...current,
          status: 'COMMITTING',
          commit: { requestIdHash, startedAt: this.runtime.now().toISOString() },
          updatedAt: this.runtime.now().toISOString()
        };
      });
      if (session.status === 'COMPLETED' && session.commitResult) return this.commitResponse(session);
    }

    try {
      const target = resolveAuthoritativeTarget(
        this.authoritative,
        session.formKey,
        session.recordId,
        session.fieldId
      );
      if (!target) throw qrScannerError('CONFIGURATION_ERROR');
      const authorised = session.candidates.filter(candidate => candidate.status === 'AUTHORISED' && candidate.fileId);
      const intendedLinks = authorised.map(candidate => canonicalDriveFileUrl(candidate.fileId!));
      const allAlreadyLinked = authorised.length > 0 && authorised.every(candidate =>
        candidate.fileId ? target.currentFileIds.includes(candidate.fileId) : false
      );
      if (reconcilingCommittedWrite && allAlreadyLinked) {
        preserveCommittingForRecovery = true;
        const result = this.makeCommitResult(session, intendedLinks.length, 0, {
          dataVersion: recordDataVersion(target.record),
          fieldValue: target.currentLinks.join(', '),
          links: target.currentLinks
        });
        return this.completeCommit(session.id, requestIdHash, result, session.candidates);
      }
      if (target.dataVersion !== session.expectedDataVersion) throw qrScannerError('RECORD_CHANGED');

      let retryableFailure = false;
      const revalidated = session.candidates.map(candidate => {
        if (candidate.status !== 'AUTHORISED' || !candidate.fileId) return candidate;
        const result = this.authorization.authorize(candidate.fileId, target.uploadConfig);
        if (result.ok) {
          return {
            ...candidate,
            displayName: boundedUtf8Text(result.file.name, 160),
            mimeType: undefined,
            checkedAt: this.runtime.now().toISOString()
          };
        }
        retryableFailure = retryableFailure || result.retryable;
        return {
          ...candidate,
          status: candidateStatusForCode(result.code),
          code: result.code,
          retryable: result.retryable || undefined,
          fileId: undefined,
          displayName: undefined,
          mimeType: undefined,
          checkedAt: this.runtime.now().toISOString()
        };
      });
      if (retryableFailure) {
        this.resetCommit(session.id, requestIdHash, revalidated, 'TEMPORARY_ERROR');
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      const valid = revalidated.filter(candidate => candidate.status === 'AUTHORISED' && candidate.fileId);
      const links = valid.map(candidate => canonicalDriveFileUrl(candidate.fileId!));
      preserveCommittingForRecovery = true;
      const append = this.authoritative.appendQrScannerUploadLinks({
        formKey: session.formKey,
        recordId: session.recordId,
        fieldId: session.fieldId,
        links,
        expectedDataVersion: session.expectedDataVersion
      });
      if (!append.success) {
        const code = append.code || 'TEMPORARY_ERROR';
        if (code !== 'TEMPORARY_ERROR') {
          this.resetCommit(session.id, requestIdHash, revalidated, code);
        }
        throw qrScannerError(code, { retryable: code === 'TEMPORARY_ERROR' });
      }
      const committedDataVersion = Number(append.dataVersion);
      const committedLinks = Array.isArray(append.links)
        ? append.links.map(link => (link || '').toString().trim()).filter(Boolean)
        : splitUploadLinks(append.fieldValue);
      const committedFieldValue = typeof append.fieldValue === 'string'
        ? append.fieldValue
        : committedLinks.join(', ');
      if (!Number.isSafeInteger(committedDataVersion) || committedDataVersion < 1) {
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      const linkedCount = append.idempotent ? links.length : Number(append.appendedCount || 0);
      const result = this.makeCommitResult(
        session,
        linkedCount,
        authorised.length - valid.length,
        {
          dataVersion: committedDataVersion,
          fieldValue: committedFieldValue,
          links: committedLinks
        }
      );
      return this.completeCommit(session.id, requestIdHash, result, revalidated);
    } catch (error) {
      if (
        !preserveCommittingForRecovery &&
        !['INVALID_CREDENTIAL', 'SESSION_EXPIRED', 'SESSION_NOT_ACTIVE'].includes((error as any)?.code)
      ) {
        try {
          this.resetCommit(
            session.id,
            requestIdHash,
            session.candidates,
            ((error as any)?.code || 'TEMPORARY_ERROR') as QrScannerResultCode
          );
        } catch {
          // The current state remains authoritative when a defensive reset cannot be stored.
        }
      }
      throw error;
    }
  }

  cancel(request: AuthenticatedQrScannerRequest): {
    status: 'CANCELLED' | 'COMPLETED';
    returnUrl: string;
    session: QrScannerSessionProjection;
  } {
    const snapshot = this.authenticate(request);
    if (snapshot.status === 'COMMITTING') throw qrScannerError('SESSION_NOT_ACTIVE');
    if (snapshot.status === 'COMPLETED') {
      return {
        status: 'COMPLETED',
        returnUrl: snapshot.commitResult?.returnUrl || snapshot.returnUrl,
        session: projectSession(snapshot)
      };
    }
    const returnUrl = buildScannerReturnUrl(this.runtime.getServiceUrl(), snapshot, { result: 'cancelled' });
    if (!returnUrl) throw qrScannerError('CONFIGURATION_ERROR');
    const cancelled = snapshot.status === 'CANCELLED'
      ? snapshot
      : this.sessions.mutate(snapshot.id, current => {
          this.requireAuthenticatedCurrent(current, request.accessToken);
          if (current.status === 'CANCELLED') return null;
          if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
          if (current.candidates.some(candidate => candidate.incremental?.state === 'PENDING')) {
            throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
          }
          return {
            ...current,
            status: 'CANCELLED',
            returnUrl,
            cancelResult: { returnUrl, cancelledAt: this.runtime.now().toISOString() },
            updatedAt: this.runtime.now().toISOString()
          };
        });
    return {
      status: 'CANCELLED',
      returnUrl: cancelled.cancelResult?.returnUrl || returnUrl,
      session: projectSession(cancelled)
    };
  }

  private requireSession(sessionId: string): StoredQrScannerSession {
    const normalized = normalizeIdentifier(sessionId);
    const session = normalized ? this.sessions.get(normalized) : null;
    if (!session) throw qrScannerError('NOT_FOUND');
    return session;
  }

  private requireNotExpired(session: StoredQrScannerSession): void {
    if (!isExpired(session, this.runtime.now())) return;
    if (!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(session.status)) {
      try {
        this.sessions.mutate(session.id, current => ({
          ...current,
          status: 'EXPIRED',
          updatedAt: this.runtime.now().toISOString()
        }));
      } catch {
        // The expiry timestamp remains authoritative even if the status write fails.
      }
    }
    throw qrScannerError('SESSION_EXPIRED');
  }

  private authenticate(request: AuthenticatedQrScannerRequest): StoredQrScannerSession {
    const sessionId = normalizeIdentifier(request?.sessionId);
    const accessToken = normalizeIdentifier(request?.accessToken, 512);
    if (!sessionId || !accessToken) throw qrScannerError('INVALID_REQUEST');
    const session = this.requireSession(sessionId);
    if (!this.crypto.matches(accessToken, session.accessTokenHash)) throw qrScannerError('INVALID_CREDENTIAL');
    this.requireNotExpired(session);
    return session;
  }

  private requireAuthenticatedCurrent(session: StoredQrScannerSession, accessToken: string): void {
    if (!this.crypto.matches(accessToken, session.accessTokenHash)) throw qrScannerError('INVALID_CREDENTIAL');
    // This helper runs inside the session store's ScriptLock. Do not attempt a
    // nested status mutation here; the expiry timestamp is authoritative.
    if (isExpired(session, this.runtime.now())) throw qrScannerError('SESSION_EXPIRED');
  }

  private resolveInBatchDuplicates(items: NormalizedBatchCandidate[]): void {
    items.forEach(item => {
      if (!item.duplicateOfScanIdHash || item.candidate) return;
      const primary = items.find(
        entry => entry.scanIdHash === item.duplicateOfScanIdHash && entry.candidate
      )?.candidate;
      if (!primary) throw qrScannerError('INTERNAL_ERROR');
      const code = primary.status === 'AUTHORISED' ? 'DUPLICATE_SESSION' : primary.code;
      item.candidate = makeCandidate(
        this.crypto,
        item.scanIdHash,
        item.payloadHash,
        code,
        this.runtime.now(),
        { retryable: primary.retryable }
      );
    });
  }

  private storeBatchCandidates(
    snapshot: StoredQrScannerSession,
    accessToken: string,
    items: NormalizedBatchCandidate[],
    pending: StoredQrScannerSession['incrementalBatch'] | undefined
  ): StoredQrScannerSession {
    const incoming = items.filter(item => item.candidate && !item.replayed);
    if (!incoming.length && !pending) return snapshot;
    return this.sessions.mutate(snapshot.id, current => {
      this.requireAuthenticatedCurrent(current, accessToken);
      if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
      if (current.expectedDataVersion !== snapshot.expectedDataVersion) throw qrScannerError('RECORD_CHANGED');
      if (current.incrementalBatch) throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      if (current.candidates.some(candidate => candidate.incremental?.state === 'PENDING')) {
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }

      let candidates = current.candidates.slice();
      let addedAttempts = 0;
      const appendCandidate = (candidate: StoredQrScannerCandidate): void => {
        while (candidates.length >= MAX_STORED_CANDIDATES) {
          let removable = candidates.findIndex(
            entry =>
              entry.status !== 'AUTHORISED' &&
              entry.status !== 'RETRYABLE_ERROR' &&
              entry.incremental?.state !== 'PENDING'
          );
          if (removable < 0) removable = candidates.findIndex(entry => entry.incremental?.state === 'COMPLETED');
          if (removable < 0) {
            removable = candidates.findIndex(
              entry => entry.status === 'RETRYABLE_ERROR' && entry.incremental?.state !== 'PENDING'
            );
          }
          if (removable < 0) throw qrScannerError('LIMIT_REACHED');
          candidates = candidates.filter((_, index) => index !== removable);
        }
        candidates.push(candidate);
      };

      incoming.forEach(item => {
        const candidate = item.candidate!;
        const existing = candidates.find(entry => entry.scanIdHash === item.scanIdHash);
        if (existing?.payloadHash !== undefined && existing.payloadHash !== item.payloadHash) {
          throw qrScannerError('INVALID_REQUEST');
        }
        if (existing && existing.status !== 'RETRYABLE_ERROR') return;
        if (item.consumesAttempt && !existing && current.attempts + addedAttempts >= current.maxAttempts) {
          throw qrScannerError('SESSION_NOT_ACTIVE');
        }
        let nextCandidate: StoredQrScannerCandidate = existing
          ? { ...candidate, id: existing.id }
          : candidate;
        if (
          pending?.fileIds.includes(candidate.fileId || '') &&
          candidate.status === 'AUTHORISED' &&
          candidate.fileId
        ) {
          // A fresh detection may supersede a prior retryable attempt for the
          // same receipt, but must never overtake another durable PENDING one.
          candidates = candidates.filter(
            entry =>
              entry.id === existing?.id ||
              entry.fileId !== candidate.fileId ||
              entry.status !== 'RETRYABLE_ERROR' ||
              entry.incremental?.state === 'PENDING'
          );
          const sameFile = candidates.find(
            entry => entry.id !== existing?.id && entry.fileId === candidate.fileId
          );
          if (current.existingFileIds.includes(candidate.fileId)) {
            nextCandidate = {
              ...nextCandidate,
              status: 'DUPLICATE',
              code: 'ALREADY_LINKED',
              fileId: undefined,
              displayName: undefined,
              mimeType: undefined,
              incremental: undefined
            };
          } else if (sameFile) {
            nextCandidate = {
              ...nextCandidate,
              status: 'DUPLICATE',
              code: 'DUPLICATE_SESSION',
              fileId: undefined,
              displayName: undefined,
              mimeType: undefined,
              incremental: undefined
            };
          } else {
            nextCandidate = {
              ...nextCandidate,
              status: 'RETRYABLE_ERROR',
              code: 'TEMPORARY_ERROR',
              retryable: true,
              incremental: { state: 'PENDING', updatedAt: this.runtime.now().toISOString() }
            };
          }
        }
        if (existing) {
          candidates = candidates.map(entry => (entry.id === existing.id ? nextCandidate : entry));
        } else {
          appendCandidate(nextCandidate);
          // Duplicate aliases and reused outcomes are retained for stable
          // scan-ID replay but do not consume the processing-attempt budget.
          if (item.consumesAttempt) addedAttempts += 1;
        }
      });

      const pendingCandidates = candidates.filter(
        candidate =>
          candidate.incremental?.state === 'PENDING' &&
          candidate.fileId &&
          pending?.fileIds.includes(candidate.fileId)
      );
      const persistedIntent = pending && pendingCandidates.length
        ? {
            ...pending,
            fileIds: Array.from(new Set(pendingCandidates.map(candidate => candidate.fileId!)))
          }
        : undefined;
      const completedAt = this.runtime.now().toISOString();
      return {
        ...current,
        candidates,
        attempts: current.attempts + addedAttempts,
        ...(persistedIntent ? { incrementalBatch: persistedIntent } : {}),
        ...(!persistedIntent && pending
          ? {
              lastIncrementalBatch: {
                requestHash: pending.requestHash,
                scanIdHashes: pending.scanIdHashes,
                payloadHashes: pending.payloadHashes,
                completedAt
              }
            }
          : {}),
        updatedAt: completedAt
      };
    });
  }

  private appendCandidateBatch(
    session: StoredQrScannerSession,
    fileIds: string[],
    timing: CandidateTiming
  ): QrScannerFieldAppendResult {
    let append: QrScannerFieldAppendResult;
    try {
      append = timeCandidateStage(timing, 'recordAppend', () =>
        this.authoritative.appendQrScannerUploadLinks({
          formKey: session.formKey,
          recordId: session.recordId,
          fieldId: session.fieldId,
          links: fileIds.map(canonicalDriveFileUrl),
          expectedDataVersion: session.expectedDataVersion
        })
      );
    } catch {
      append = { success: false, code: 'TEMPORARY_ERROR', message: 'The receipts could not be attached.' };
    }
    if (!append.success) {
      const recovered = timeCandidateStage(timing, 'appendRecovery', () =>
        this.recoverIncrementalBatchAppend(session, fileIds)
      );
      if (recovered) append = recovered;
    }
    return append;
  }

  private finishCandidateBatchAppend(
    snapshot: StoredQrScannerSession,
    request: AddQrScannerCandidatesRequest,
    requestHash: string,
    items: NormalizedBatchCandidate[],
    fileIds: string[],
    append: QrScannerFieldAppendResult,
    timing: CandidateTiming
  ) {
    if (!append.success) {
      const code = append.code || 'TEMPORARY_ERROR';
      if (code === 'TEMPORARY_ERROR') {
        // The append may already be durable even when Apps Script loses the
        // response. Retain the exact PENDING intent for same-request recovery.
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      const failed = timeCandidateStage(timing, 'candidateFinalWrite', () =>
        this.failCandidateBatch(snapshot, request.accessToken, requestHash, code, items)
      );
      return this.batchCandidateResponse(failed, items, undefined, timing);
    }

    let committed: QrScannerIncrementalCommitResult;
    try {
      committed = this.incrementalBatchCommitResult(snapshot, append, fileIds);
    } catch (error) {
      const code: QrScannerResultCode = (error as any)?.code === 'RECORD_CHANGED'
        ? 'RECORD_CHANGED'
        : 'TEMPORARY_ERROR';
      if (code === 'TEMPORARY_ERROR') {
        const recovered = timeCandidateStage(timing, 'appendRecovery', () =>
          this.recoverIncrementalBatchAppend(snapshot, fileIds)
        );
        if (recovered) {
          committed = this.incrementalBatchCommitResult(snapshot, recovered, fileIds);
        } else {
          throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
        }
      } else {
        const failed = timeCandidateStage(timing, 'candidateFinalWrite', () =>
          this.failCandidateBatch(snapshot, request.accessToken, requestHash, code, items)
        );
        return this.batchCandidateResponse(failed, items, undefined, timing);
      }
    }
    const completed = timeCandidateStage(timing, 'candidateFinalWrite', () =>
      this.completeCandidateBatch(snapshot, request.accessToken, requestHash, fileIds, committed)
    );
    return this.batchCandidateResponse(completed, items, committed, timing);
  }

  private completeCandidateBatch(
    snapshot: StoredQrScannerSession,
    accessToken: string,
    requestHash: string,
    fileIds: string[],
    committed: QrScannerIncrementalCommitResult
  ): StoredQrScannerSession {
    return this.sessions.mutate(snapshot.id, current => {
      this.requireAuthenticatedCurrent(current, accessToken);
      if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
      if (!current.incrementalBatch) {
        if (
          current.expectedDataVersion === committed.dataVersion &&
          fileIds.every(fileId => current.existingFileIds.includes(fileId))
        ) {
          return null;
        }
        throw qrScannerError('RECORD_CHANGED');
      }
      if (current.incrementalBatch.requestHash !== requestHash) {
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      if (current.expectedDataVersion !== snapshot.expectedDataVersion) throw qrScannerError('RECORD_CHANGED');
      const intended = new Set(current.incrementalBatch.fileIds);
      const completedFileIds = new Set<string>();
      const completedAt = this.runtime.now().toISOString();
      const candidates = current.candidates.map(candidate => {
        if (candidate.incremental?.state !== 'PENDING' || !candidate.fileId || !intended.has(candidate.fileId)) {
          return candidate;
        }
        completedFileIds.add(candidate.fileId);
        return {
          ...candidate,
          status: 'AUTHORISED' as const,
          code: 'ACCEPTED' as const,
          retryable: undefined,
          mimeType: undefined,
          incremental: { state: 'COMPLETED' as const, updatedAt: completedAt },
          checkedAt: completedAt
        };
      });
      if (completedFileIds.size !== intended.size) throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      const retainedAuthorised = current.candidates.filter(candidate => candidate.status === 'AUTHORISED').length;
      const acceptedBefore = Math.max(Number(current.incrementalAcceptedCount) || 0, retainedAuthorised);
      return {
        ...current,
        candidates,
        expectedDataVersion: committed.dataVersion,
        existingFileIds: Array.from(new Set([...current.existingFileIds, ...fileIds])).slice(-MAX_STORED_CANDIDATES),
        incrementalAcceptedCount: acceptedBefore + completedFileIds.size,
        incrementalBatch: undefined,
        lastIncrementalBatch: {
          requestHash,
          scanIdHashes: current.incrementalBatch.scanIdHashes,
          payloadHashes: current.incrementalBatch.payloadHashes,
          completedAt
        },
        updatedAt: completedAt
      };
    });
  }

  private failCandidateBatch(
    snapshot: StoredQrScannerSession,
    accessToken: string,
    requestHash: string,
    code: QrScannerResultCode,
    items: NormalizedBatchCandidate[]
  ): StoredQrScannerSession {
    return this.sessions.mutate(snapshot.id, current => {
      this.requireAuthenticatedCurrent(current, accessToken);
      if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
      if (!current.incrementalBatch) return null;
      if (current.incrementalBatch.requestHash !== requestHash) {
        throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
      }
      const intended = new Set(current.incrementalBatch.fileIds);
      const now = this.runtime.now().toISOString();
      const retryable = code === 'TEMPORARY_ERROR';
      const failedPrimaryHashes = new Set<string>();
      let candidates = current.candidates.map(candidate => {
        if (candidate.incremental?.state !== 'PENDING' || !candidate.fileId || !intended.has(candidate.fileId)) {
          return candidate;
        }
        failedPrimaryHashes.add(candidate.scanIdHash);
        return {
          ...candidate,
          status: candidateStatusForCode(code),
          code,
          retryable: retryable || undefined,
          incremental: retryable ? { state: 'RETRYABLE' as const, updatedAt: now } : undefined,
          ...(retryable ? {} : { fileId: undefined, displayName: undefined, mimeType: undefined }),
          checkedAt: now
        };
      });
      const primaryByAliasHash = new Map(
        items
          .filter(item => item.duplicateOfScanIdHash)
          .map(item => [item.scanIdHash, item.duplicateOfScanIdHash!] as const)
      );
      candidates = candidates.map(candidate => {
        const primaryHash = primaryByAliasHash.get(candidate.scanIdHash);
        if (!primaryHash || !failedPrimaryHashes.has(primaryHash)) return candidate;
        return {
          ...candidate,
          status: candidateStatusForCode(code),
          code,
          retryable: retryable || undefined,
          incremental: retryable ? { state: 'RETRYABLE' as const, updatedAt: now } : undefined,
          fileId: undefined,
          displayName: undefined,
          mimeType: undefined,
          checkedAt: now
        };
      });
      return {
        ...current,
        candidates,
        incrementalBatch: undefined,
        lastErrorCode: code,
        updatedAt: now
      };
    });
  }

  private recoverIncrementalBatchAppend(
    session: StoredQrScannerSession,
    fileIds: string[]
  ): QrScannerFieldAppendResult | null {
    try {
      const target = resolveAuthoritativeTarget(
        this.authoritative,
        session.formKey,
        session.recordId,
        session.fieldId
      );
      if (
        !target ||
        target.dataVersion !== session.expectedDataVersion + 1 ||
        !fileIds.every(fileId => target.currentFileIds.includes(fileId))
      ) {
        return null;
      }
      return {
        success: true,
        message: 'The receipt links were already attached.',
        appendedCount: 0,
        dataVersion: target.dataVersion,
        fieldValue: target.currentLinks.join(', '),
        links: target.currentLinks,
        idempotent: true
      };
    } catch {
      return null;
    }
  }

  private incrementalBatchCommitResult(
    session: StoredQrScannerSession,
    append: QrScannerFieldAppendResult,
    fileIds: string[]
  ): QrScannerIncrementalCommitResult {
    const committed = this.incrementalCommitResult(session, append, fileIds.length);
    const committedFileIds = new Set(
      committed.links
        .map(link => parseDriveQrPayload(link))
        .filter((parsed): parsed is Extract<ReturnType<typeof parseDriveQrPayload>, { ok: true }> => parsed.ok)
        .map(parsed => parsed.fileId)
    );
    if (!fileIds.every(fileId => committedFileIds.has(fileId))) {
      throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
    }
    return committed;
  }

  private incrementalCommitFromTarget(
    session: StoredQrScannerSession,
    target: QrScannerTarget,
    linkedCount: number,
    idempotent: boolean
  ): QrScannerIncrementalCommitResult {
    return {
      linkedCount,
      skippedCount: 0,
      recordId: session.recordId,
      dataVersion: target.dataVersion,
      fieldValue: target.currentLinks.join(', '),
      links: target.currentLinks,
      summaryCode: 'COMMITTED',
      idempotent
    };
  }

  private batchCandidateResponse(
    session: StoredQrScannerSession,
    items: NormalizedBatchCandidate[],
    committed: QrScannerIncrementalCommitResult | undefined,
    timing: CandidateTiming
  ) {
    const results = items.map(item => {
      const candidate = session.candidates.find(entry => entry.scanIdHash === item.scanIdHash) || item.candidate;
      if (!candidate) throw qrScannerError('INTERNAL_ERROR');
      return { candidate: projectCandidate(candidate) };
    });
    debugLog('qrScanner.appsScript.candidates.checked', {
      sessionId: session.id,
      candidateCount: items.length,
      uniqueCanonicalCount: new Set(
        items.filter(item => item.parsed.ok).map(item => (item.parsed as { fileId: string }).fileId)
      ).size,
      suppressedDuplicateCount: items.filter(
        item => item.duplicateOfScanIdHash || item.candidate?.code === 'DUPLICATE_SESSION'
      ).length,
      linkedCount: committed?.linkedCount || 0,
      durationMs: Math.max(0, Date.now() - timing.startedAt),
      stageMs: timing.stages
    });
    return {
      results,
      counts: candidateCounts(session),
      revision: session.revision,
      session: projectSession(session),
      ...(committed ? { committed } : {})
    };
  }

  private authoriseCandidate(
    scanIdHash: string,
    payloadHash: string,
    fileId: string,
    target: QrScannerTarget
  ): StoredQrScannerCandidate {
    const result = this.authorization.authorize(fileId, target.uploadConfig);
    return result.ok
      ? makeCandidate(this.crypto, scanIdHash, payloadHash, 'ACCEPTED', this.runtime.now(), {
          fileId: result.file.id,
          displayName: result.file.name,
          mimeType: result.file.mimeType
        })
      : makeCandidate(this.crypto, scanIdHash, payloadHash, result.code, this.runtime.now(), {
          fileIdHash: this.crypto.hash(fileId),
          retryable: result.retryable
        });
  }

  private storeCandidate(
    snapshot: StoredQrScannerSession,
    accessToken: string,
    scanIdHash: string,
    payloadHash: string,
    candidate: StoredQrScannerCandidate
  ): StoredQrScannerSession {
    return this.sessions.mutate(snapshot.id, current => {
      this.requireAuthenticatedCurrent(current, accessToken);
      if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
      const existing = current.candidates.find(entry => entry.scanIdHash === scanIdHash);
      if (existing?.payloadHash !== undefined && existing.payloadHash !== payloadHash) {
        throw qrScannerError('INVALID_REQUEST');
      }
      if (existing && existing.status !== 'RETRYABLE_ERROR') return null;
      if (!existing && current.attempts >= current.maxAttempts) throw qrScannerError('SESSION_NOT_ACTIVE');

      let nextCandidate = existing ? { ...candidate, id: existing.id } : candidate;
      let baseCandidates = current.candidates;
      if (nextCandidate.incremental?.state === 'PENDING' && nextCandidate.fileId) {
        const anotherPending = baseCandidates.find(
          entry => entry.id !== existing?.id && entry.incremental?.state === 'PENDING'
        );
        if (anotherPending) throw qrScannerError('TEMPORARY_ERROR', { retryable: true });

        // A fresh scan may supersede a prior retryable attempt for the same
        // file. The original scan ID remains the preferred idempotency key,
        // but a user must not be locked out after rescanning an error.
        baseCandidates = baseCandidates.filter(
          entry =>
            entry.id === existing?.id ||
            entry.fileId !== nextCandidate.fileId ||
            entry.status !== 'RETRYABLE_ERROR' ||
            entry.incremental?.state === 'PENDING'
        );
        const sameFile = baseCandidates.find(
          entry => entry.id !== existing?.id && entry.fileId === nextCandidate.fileId
        );
        const redact = (code: 'DUPLICATE_SESSION' | 'ALREADY_LINKED'): StoredQrScannerCandidate => ({
          ...nextCandidate,
          status: candidateStatusForCode(code),
          code,
          fileId: undefined,
          displayName: undefined,
          mimeType: undefined,
          retryable: undefined,
          incremental: undefined
        });
        if (current.existingFileIds.includes(nextCandidate.fileId)) nextCandidate = redact('ALREADY_LINKED');
        else if (sameFile) nextCandidate = redact('DUPLICATE_SESSION');
      }

      if (!existing && baseCandidates.length >= MAX_STORED_CANDIDATES) {
        let removable = baseCandidates.findIndex(
          entry =>
            entry.status !== 'AUTHORISED' &&
            entry.status !== 'RETRYABLE_ERROR' &&
            entry.incremental?.state !== 'PENDING'
        );
        if (removable < 0) {
          removable = baseCandidates.findIndex(entry => entry.incremental?.state === 'COMPLETED');
        }
        if (removable < 0) {
          removable = baseCandidates.findIndex(
            entry => entry.status === 'RETRYABLE_ERROR' && entry.incremental?.state !== 'PENDING'
          );
        }
        if (removable >= 0) {
          baseCandidates = baseCandidates.filter((_, index) => index !== removable);
        }
      }
      if (!existing && baseCandidates.length >= MAX_STORED_CANDIDATES) throw qrScannerError('LIMIT_REACHED');
      const candidates = existing
        ? baseCandidates.map(entry => (entry.id === existing.id ? nextCandidate : entry))
        : [...baseCandidates, nextCandidate];
      return {
        ...current,
        candidates,
        attempts: current.attempts + (existing ? 0 : 1),
        updatedAt: this.runtime.now().toISOString()
      };
    });
  }

  private replaceCandidate(
    sessionId: string,
    accessToken: string,
    scanIdHash: string,
    payloadHash: string,
    candidate: StoredQrScannerCandidate
  ): StoredQrScannerSession {
    return this.sessions.mutate(sessionId, current => {
      this.requireAuthenticatedCurrent(current, accessToken);
      if (current.status !== 'ACTIVE') throw qrScannerError('SESSION_NOT_ACTIVE');
      const existing = current.candidates.find(entry => entry.scanIdHash === scanIdHash);
      if (!existing || existing.payloadHash !== payloadHash) throw qrScannerError('INVALID_REQUEST');
      if (existing.status === 'AUTHORISED') return null;
      const nextCandidate = { ...candidate, id: existing.id };
      return {
        ...current,
        candidates: current.candidates.map(entry => (entry.id === existing.id ? nextCandidate : entry)),
        updatedAt: this.runtime.now().toISOString()
      };
    });
  }

  private recoverIncrementalAppend(
    session: StoredQrScannerSession,
    fileId: string
  ): QrScannerFieldAppendResult | null {
    try {
      const target = resolveAuthoritativeTarget(
        this.authoritative,
        session.formKey,
        session.recordId,
        session.fieldId
      );
      if (
        !target ||
        target.dataVersion !== session.expectedDataVersion + 1 ||
        !target.currentFileIds.includes(fileId)
      ) {
        return null;
      }
      return {
        success: true,
        message: 'The receipt link was already attached.',
        appendedCount: 0,
        dataVersion: target.dataVersion,
        fieldValue: target.currentLinks.join(', '),
        links: target.currentLinks,
        idempotent: true
      };
    } catch {
      return null;
    }
  }

  private incrementalCommitResult(
    session: StoredQrScannerSession,
    append: QrScannerFieldAppendResult,
    linkedCount = 1
  ): QrScannerIncrementalCommitResult {
    const dataVersion = Number(append.dataVersion);
    const links = Array.isArray(append.links)
      ? append.links.map(link => (link || '').toString().trim()).filter(Boolean)
      : splitUploadLinks(append.fieldValue);
    if (!append.success || !Number.isSafeInteger(dataVersion) || dataVersion < 1) {
      throw qrScannerError('TEMPORARY_ERROR', { retryable: true });
    }
    if (dataVersion !== session.expectedDataVersion + 1) {
      throw qrScannerError('RECORD_CHANGED');
    }
    return {
      linkedCount,
      skippedCount: 0,
      recordId: session.recordId,
      dataVersion,
      fieldValue: typeof append.fieldValue === 'string' ? append.fieldValue : links.join(', '),
      links,
      summaryCode: 'COMMITTED',
      idempotent: append.idempotent === true
    };
  }

  private resolveCommittedCandidate(
    session: StoredQrScannerSession,
    candidate: StoredQrScannerCandidate
  ): QrScannerIncrementalCommitResult | undefined {
    if (!candidate.fileId) return undefined;
    let target: QrScannerTarget | null;
    try {
      target = resolveAuthoritativeTarget(
        this.authoritative,
        session.formKey,
        session.recordId,
        session.fieldId
      );
    } catch {
      return undefined;
    }
    if (
      !target ||
      target.dataVersion !== session.expectedDataVersion ||
      !target.currentFileIds.includes(candidate.fileId)
    ) {
      throw qrScannerError('RECORD_CHANGED');
    }
    return {
      linkedCount: 1,
      skippedCount: 0,
      recordId: session.recordId,
      dataVersion: target.dataVersion,
      fieldValue: target.currentLinks.join(', '),
      links: target.currentLinks,
      summaryCode: 'COMMITTED',
      idempotent: true
    };
  }

  private logCheckedCandidate(
    session: StoredQrScannerSession,
    candidate: StoredQrScannerCandidate,
    committed?: QrScannerIncrementalCommitResult,
    timing?: CandidateTiming
  ): void {
    debugLog('qrScanner.appsScript.candidate.checked', {
      sessionId: session.id,
      candidateId: candidate.id,
      code: candidate.code,
      incrementallyCommitted: Boolean(committed),
      dataVersion: committed?.dataVersion || null,
      ...(timing
        ? {
            durationMs: Math.max(0, Date.now() - timing.startedAt),
            stageMs: timing.stages
          }
        : {})
    });
  }

  private candidateResponse(
    session: StoredQrScannerSession,
    candidate: StoredQrScannerCandidate,
    committed?: QrScannerIncrementalCommitResult
  ) {
    return {
      candidate: projectCandidate(candidate),
      counts: candidateCounts(session),
      revision: session.revision,
      session: projectSession(session),
      ...(committed ? { committed } : {})
    };
  }

  private resetCommit(
    sessionId: string,
    requestIdHash: string,
    candidates: StoredQrScannerCandidate[],
    code: QrScannerResultCode
  ): StoredQrScannerSession {
    return this.sessions.mutate(sessionId, current => {
      if (current.status !== 'COMMITTING' || current.commit?.requestIdHash !== requestIdHash) return null;
      return {
        ...current,
        status: 'ACTIVE',
        commit: undefined,
        candidates,
        lastErrorCode: code,
        updatedAt: this.runtime.now().toISOString()
      };
    });
  }

  private makeCommitResult(
    session: StoredQrScannerSession,
    linkedCount: number,
    skippedCount: number,
    committed: { dataVersion: number; fieldValue: string; links: string[] }
  ): NonNullable<StoredQrScannerSession['commitResult']> {
    const returnUrl = buildScannerReturnUrl(this.runtime.getServiceUrl(), session, { result: 'success', linkedCount });
    if (!returnUrl) throw qrScannerError('CONFIGURATION_ERROR');
    return {
      linkedCount,
      skippedCount,
      recordId: session.recordId,
      dataVersion: committed.dataVersion,
      fieldValue: committed.fieldValue,
      links: committed.links,
      returnUrl,
      summaryCode: linkedCount > 0 ? 'COMMITTED' : 'NOTHING_TO_COMMIT'
    };
  }

  private completeCommit(
    sessionId: string,
    requestIdHash: string,
    result: NonNullable<StoredQrScannerSession['commitResult']>,
    candidates: StoredQrScannerCandidate[]
  ) {
    const completed = this.sessions.mutate(sessionId, current => {
      if (current.status === 'COMPLETED') return null;
      if (current.status !== 'COMMITTING' || current.commit?.requestIdHash !== requestIdHash) {
        throw qrScannerError('SESSION_NOT_ACTIVE');
      }
      return {
        ...current,
        status: 'COMPLETED',
        // The authoritative field snapshot below is sufficient for terminal
        // replay. Drop accepted per-scan detail so 10 links are not stored a
        // third time beside existingFileIds and commitResult.
        candidates: candidates.filter(candidate => candidate.status !== 'AUTHORISED').slice(-MAX_STORED_CANDIDATES),
        commit: { ...current.commit, completedAt: this.runtime.now().toISOString() },
        commitResult: result,
        updatedAt: this.runtime.now().toISOString()
      };
    });
    debugLog('qrScanner.appsScript.commit.completed', {
      sessionId,
      linkedCount: completed.commitResult?.linkedCount || 0,
      skippedCount: completed.commitResult?.skippedCount || 0
    });
    return this.commitResponse(completed);
  }

  private commitResponse(session: StoredQrScannerSession) {
    if (!session.commitResult) throw qrScannerError('INTERNAL_ERROR');
    return { status: 'COMPLETED' as const, result: session.commitResult, session: projectSession(session) };
  }

  private launchFailure(
    code: Extract<QrScanSessionLaunchResult, { success: false }>['code'],
    retryable = false
  ): Extract<QrScanSessionLaunchResult, { success: false }> {
    const messages: Record<Extract<QrScanSessionLaunchResult, { success: false }>['code'], string> = {
      INVALID_REQUEST: 'The scanner request is incomplete or invalid.',
      FORM_NOT_FOUND: 'The form configuration could not be found.',
      RECORD_NOT_FOUND: 'Save the form before starting the scanner.',
      FIELD_NOT_FOUND: 'The selected upload field could not be found.',
      FIELD_NOT_SUPPORTED: 'QR scanning is only available for a top-level file upload field.',
      SCANNER_DISABLED: 'QR scanning is not enabled for this upload field.',
      RECORD_CHANGED: 'The form changed while the scanner was being prepared. Save it and try again.',
      SERVICE_NOT_CONFIGURED: 'The QR scanner service is not configured.',
      SERVICE_UNAVAILABLE: 'The QR scanner service is temporarily unavailable. Try again.',
      SERVICE_REJECTED: 'The QR scanner session could not be created.',
      INVALID_SERVICE_RESPONSE: 'The QR scanner service returned an invalid response.'
    };
    return { success: false, code, message: messages[code], ...(retryable ? { retryable: true } : {}) };
  }
}
