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
  AuthenticatedQrScannerRequest,
  CommitQrScannerRequest,
  QrScannerAuthoritativeService,
  QrScannerCrypto,
  QrScannerFieldAppendResult,
  QrScannerIncrementalCommitResult,
  QrScannerResultCode,
  QrScannerRuntime,
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
// ScriptProperties has a 9 KB value ceiling. Twelve bounded candidate records
// leave room for commit recovery state while covering the configured 10-file flow.
const MAX_STORED_CANDIDATES = 12;

const normalizeIdentifier = (value: unknown, maxLength = 160): string => {
  const normalized = (value ?? '').toString().trim();
  if (!normalized || normalized.length > maxLength) return '';
  if (Array.from(normalized).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return '';
  return normalized;
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
  (field?.qEn || field?.label?.en || field?.label || field?.id || 'Scan QR codes').toString().trim().slice(0, 160);

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
  details?: { fileId?: string; displayName?: string; mimeType?: string; retryable?: boolean }
): StoredQrScannerCandidate => ({
  id: crypto.randomToken(12),
  scanIdHash,
  payloadHash,
  status: candidateStatusForCode(code),
  code,
  ...(details?.fileId ? { fileId: details.fileId } : {}),
  ...(details?.displayName ? { displayName: details.displayName.slice(0, 160) } : {}),
  ...(details?.mimeType ? { mimeType: details.mimeType.slice(0, 160) } : {}),
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
      const instruction = resolveQrScannerInstruction(qrConfig.instruction, language);
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

  addCandidate(request: AddQrScannerCandidateRequest): {
    candidate: ReturnType<typeof projectCandidate>;
    counts: ReturnType<typeof candidateCounts>;
    revision: number;
    session: QrScannerSessionProjection;
    committed?: QrScannerIncrementalCommitResult;
  } {
    const snapshot = this.authenticate(request);
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
      return prior.status === 'AUTHORISED' && prior.fileId
        ? this.candidateResponse(snapshot, prior, this.resolveCommittedCandidate(snapshot, prior))
        : this.candidateResponse(snapshot, prior);
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
      target = resolveAuthoritativeTarget(
        this.authoritative,
        snapshot.formKey,
        snapshot.recordId,
        snapshot.fieldId
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
          ? this.authoriseCandidate(scanIdHash, payloadHash, parsed.fileId, target)
          : makeCandidate(this.crypto, scanIdHash, payloadHash, 'ALREADY_LINKED', this.runtime.now());
      } else if (accepted.some(entry => entry.fileId === parsed.fileId)) {
        candidate = makeCandidate(this.crypto, scanIdHash, payloadHash, 'DUPLICATE_SESSION', this.runtime.now());
      } else if (target.currentLinks.length >= snapshot.maxFiles) {
        candidate = makeCandidate(this.crypto, scanIdHash, payloadHash, 'LIMIT_REACHED', this.runtime.now());
      } else {
        const result = this.authorization.authorize(parsed.fileId, target.uploadConfig);
        candidate = result.ok
          ? makeCandidate(this.crypto, scanIdHash, payloadHash, 'ACCEPTED', this.runtime.now(), {
              fileId: result.file.id,
              displayName: result.file.name,
              mimeType: result.file.mimeType
            })
          : makeCandidate(this.crypto, scanIdHash, payloadHash, result.code, this.runtime.now(), {
              retryable: result.retryable
            });
      }
    }

    if (candidate.status !== 'AUTHORISED' || !candidate.fileId || !target) {
      const updated = this.storeCandidate(snapshot, request.accessToken, scanIdHash, payloadHash, candidate);
      const storedCandidate = updated.candidates.find(entry => entry.scanIdHash === scanIdHash) || candidate;
      this.logCheckedCandidate(updated, storedCandidate);
      return this.candidateResponse(updated, storedCandidate);
    }

    const pendingCandidate: StoredQrScannerCandidate = {
      ...candidate,
      status: 'RETRYABLE_ERROR',
      code: 'TEMPORARY_ERROR',
      retryable: true,
      incremental: { state: 'PENDING', updatedAt: this.runtime.now().toISOString() }
    };
    const pendingSession = this.storeCandidate(
      snapshot,
      request.accessToken,
      scanIdHash,
      payloadHash,
      pendingCandidate
    );
    const storedPending = pendingSession.candidates.find(entry => entry.scanIdHash === scanIdHash);
    if (storedPending?.status === 'AUTHORISED' && storedPending.fileId) {
      const committed = this.resolveCommittedCandidate(pendingSession, storedPending);
      this.logCheckedCandidate(pendingSession, storedPending);
      return this.candidateResponse(pendingSession, storedPending, committed);
    }
    if (storedPending?.incremental?.state !== 'PENDING' || storedPending.fileId !== candidate.fileId) {
      const resolved = storedPending || pendingCandidate;
      this.logCheckedCandidate(pendingSession, resolved);
      return this.candidateResponse(pendingSession, resolved);
    }

    const canonicalUrl = canonicalDriveFileUrl(candidate.fileId);
    let append: QrScannerFieldAppendResult;
    try {
      append = this.authoritative.appendQrScannerUploadLinks({
        formKey: snapshot.formKey,
        recordId: snapshot.recordId,
        fieldId: snapshot.fieldId,
        links: [canonicalUrl],
        expectedDataVersion: snapshot.expectedDataVersion
      });
    } catch {
      append = { success: false, code: 'TEMPORARY_ERROR', message: 'The receipt could not be attached.' };
    }

    if (!append.success) {
      const recovered = this.recoverIncrementalAppend(snapshot, candidate.fileId);
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
      const failedSession = this.replaceCandidate(
        snapshot.id,
        request.accessToken,
        scanIdHash,
        payloadHash,
        failedCandidate
      );
      const storedFailure = failedSession.candidates.find(entry => entry.scanIdHash === scanIdHash) || failedCandidate;
      this.logCheckedCandidate(failedSession, storedFailure);
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
      const unresolvedSession = this.replaceCandidate(
        snapshot.id,
        request.accessToken,
        scanIdHash,
        payloadHash,
        unresolvedCandidate
      );
      const storedUnresolved =
        unresolvedSession.candidates.find(entry => entry.scanIdHash === scanIdHash) || unresolvedCandidate;
      this.logCheckedCandidate(unresolvedSession, storedUnresolved);
      return this.candidateResponse(unresolvedSession, storedUnresolved);
    }
    const completedCandidate: StoredQrScannerCandidate = {
      ...candidate,
      incremental: { state: 'COMPLETED', updatedAt: this.runtime.now().toISOString() },
      checkedAt: this.runtime.now().toISOString()
    };
    const updated = this.sessions.mutate(snapshot.id, current => {
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
    });
    const storedCandidate = updated.candidates.find(entry => entry.scanIdHash === scanIdHash) || completedCandidate;
    this.logCheckedCandidate(updated, storedCandidate, committed);
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
            displayName: result.file.name.slice(0, 160),
            mimeType: result.file.mimeType.slice(0, 160),
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
    append: QrScannerFieldAppendResult
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
      linkedCount: 1,
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
    committed?: QrScannerIncrementalCommitResult
  ): void {
    debugLog('qrScanner.appsScript.candidate.checked', {
      sessionId: session.id,
      candidateId: candidate.id,
      code: candidate.code,
      incrementallyCommitted: Boolean(committed),
      dataVersion: committed?.dataVersion || null
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
        candidates,
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
