import React from 'react';

import type { QrScanSessionLaunchResult } from '../../../../../types';
import {
  buildQrScannerCandidateMessage,
  buildQrScannerCommitMessage,
  buildQrScannerSetupMessage,
  parseQrScannerToOpenerMessage,
  QR_SCANNER_MESSAGE_TYPES,
  type QrScannerCandidateMessage,
  type QrScannerScanMessage
} from '../../../../qrScanner/openerProtocol';
import { resolveExternalQrScannerLaunch } from '../domain/externalQrScanner';
import { isReusableQrScannerOutcome, qrScannerCandidateIdentity } from '../domain/qrScannerBatching';
import type {
  ApplyQrScannerCommittedUpdate,
  BeginQrScannerInteraction,
  EndQrScannerInteraction,
  PrepareQrScannerLaunch,
  ReportQrScannerCandidateOutcome,
  UpdateQrScannerPendingWork
} from '../qrScannerTypes';
import {
  addQrScannerCandidate,
  addQrScannerCandidates,
  redeemQrScannerSession,
  QrScannerSessionError,
  type QrScannerCandidateBatchResult,
  type QrScannerCandidateResult,
  type QrScannerCommittedFieldResult,
  type QrScannerSessionCredentials,
  type QrScannerSessionProjection
} from '../services/qrScannerSessionClient';

const SCANNER_WINDOW_NAME = 'ckReceiptQrScanner';
const MAX_PENDING_SCANS = 20;
const MAX_CANDIDATES_PER_BATCH = 3;
const BATCH_COLLECTION_WINDOW_MS = 75;
const ADD_CANDIDATE_MAX_ATTEMPTS = 2;

type PendingScanMember = { message: QrScannerScanMessage; sequence: number };

type PendingScanGroup = {
  identity: string | null;
  leader: QrScannerScanMessage;
  members: PendingScanMember[];
};

type RetainedBatchRecovery = {
  requestId: string;
  groups: PendingScanGroup[];
};

type ActiveScannerCleanup = (reason: 'replaced' | 'unmounted') => void;

const createSecureRequestId = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('Secure scanner identifiers are unavailable.');
  const values = new Uint32Array(4);
  cryptoApi.getRandomValues(values);
  return `qr-${Array.from(values, value => value.toString(16).padStart(8, '0')).join('')}`;
};

const launchError = (result: QrScanSessionLaunchResult): QrScannerSessionError => {
  if (result.success) return new QrScannerSessionError('INTERNAL_ERROR', 'The scanner session response is invalid.');
  return new QrScannerSessionError(result.code, result.message, result.retryable === true);
};

const errorDetails = (error: unknown): { code: string; message: string; retryable: boolean } => {
  if (error instanceof QrScannerSessionError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  const message = error instanceof Error ? error.message : '';
  return {
    code: 'TEMPORARY_ERROR',
    message: message || 'The scanner service is temporarily unavailable. Try again.',
    retryable: true
  };
};

const candidateMessage = (
  requestId: string,
  scanId: string,
  result: QrScannerCandidateResult
): QrScannerCandidateMessage => {
  const candidate = result.candidate;
  const status =
    candidate.status === 'AUTHORISED'
      ? 'accepted'
      : candidate.status === 'DUPLICATE'
        ? 'duplicate'
        : candidate.status === 'RETRYABLE_ERROR'
          ? 'error'
          : 'rejected';
  let message = 'This QR code is not an authorised receipt.';
  if (status === 'accepted') message = 'Receipt added. Scan another receipt.';
  else if (status === 'duplicate') message = 'This receipt was already scanned or linked.';
  else if (status === 'error') message = 'This receipt could not be checked. Scan it again.';
  else if (candidate.code === 'RECORD_CHANGED') {
    message = 'The form changed while this receipt was being added. Return to the form and reopen the scanner.';
  } else if (['SESSION_EXPIRED', 'SESSION_NOT_ACTIVE'].includes(candidate.code)) {
    message = 'This scan session has ended. Return to the form and reopen the scanner.';
  } else if (candidate.code === 'CONFIGURATION_ERROR') {
    message = 'The scanner configuration changed. Return to the form and reopen the scanner.';
  } else if (candidate.code === 'LIMIT_REACHED') {
    message = 'The maximum number of receipts has been reached.';
  } else if (candidate.code === 'UNSUPPORTED_TYPE') {
    message = 'This file type is not allowed for this field.';
  }
  return buildQrScannerCandidateMessage(requestId, {
    scanId,
    status,
    code: candidate.code,
    ...(candidate.fileId ? { fileId: candidate.fileId } : {}),
    ...(candidate.canonicalUrl ? { canonicalUrl: candidate.canonicalUrl } : {}),
    ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
    message
  });
};

export const useExternalQrScannerSession = (args: {
  assetBaseUrl?: string | null;
  enabled: boolean;
  fieldId: string;
  fieldPath: string;
  instruction?: string;
  hideCloseOnIos?: boolean;
  commitOnReturnOnIos?: boolean;
  prepareSession?: PrepareQrScannerLaunch;
  onSessionReady?: BeginQrScannerInteraction;
  onSessionEnd?: EndQrScannerInteraction;
  onPendingWorkChange?: UpdateQrScannerPendingWork;
  onCandidateOutcome?: ReportQrScannerCandidateOutcome;
  onCommitted?: ApplyQrScannerCommittedUpdate;
  onUnavailable?: (message: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const activeCleanupRef = React.useRef<ActiveScannerCleanup | null>(null);
  const latestRef = React.useRef(args);
  latestRef.current = args;

  const assetBaseUrl = (args.assetBaseUrl || '').toString().trim();
  const available = Boolean(args.enabled && args.prepareSession && /^https:\/\//i.test(assetBaseUrl));

  React.useEffect(
    () => () => {
      activeCleanupRef.current?.('unmounted');
      activeCleanupRef.current = null;
    },
    []
  );

  const openScanner = React.useCallback((): boolean => {
    const current = latestRef.current;
    if (!current.enabled || !current.prepareSession || typeof window === 'undefined') return false;

    activeCleanupRef.current?.('replaced');
    activeCleanupRef.current = null;

    let requestId: string;
    try {
      requestId = createSecureRequestId();
    } catch (error) {
      current.onUnavailable?.(errorDetails(error).message);
      return false;
    }

    const external = resolveExternalQrScannerLaunch({
      assetBaseUrl: current.assetBaseUrl,
      requestId,
      targetOrigin: window.location.origin,
      instruction: current.instruction,
      hideCloseOnIos: current.hideCloseOnIos !== false,
      commitOnReturnOnIos: current.commitOnReturnOnIos === true
    });
    if (!external) {
      current.onDiagnostic?.('upload.linkCapture.externalScanner.unavailable', { fieldPath: current.fieldPath });
      current.onUnavailable?.('The QR scanner is not configured for this environment.');
      return false;
    }
    const scannerLaunch = external;

    const launchTarget = {
      fieldId: current.fieldId,
      fieldPath: current.fieldPath,
      instruction: current.instruction,
      hideCloseOnIos: current.hideCloseOnIos !== false,
      commitOnReturnOnIos: current.commitOnReturnOnIos === true,
      prepareSession: current.prepareSession
    };
    const launchCallbacks = {
      onSessionReady: current.onSessionReady,
      onSessionEnd: current.onSessionEnd,
      onPendingWorkChange: current.onPendingWorkChange,
      onCandidateOutcome: current.onCandidateOutcome,
      onCommitted: current.onCommitted
    };
    let scannerWindow: Window | null = null;
    let scannerReady = false;
    let acceptingScans = true;
    let detached = false;
    let disposed = false;
    let sessionHoldActive = false;
    let detachedEndReason: Parameters<EndQrScannerInteraction>[0] = 'closed';
    let finishAckScheduled = false;
    let scanChain: Promise<void> = Promise.resolve();
    let sessionPromise: Promise<{
      credentials: QrScannerSessionCredentials;
      session: QrScannerSessionProjection;
    }> | null = null;
    let sessionState: {
      credentials: QrScannerSessionCredentials;
      session: QrScannerSessionProjection;
    } | null = null;
    const pendingScanIds = new Set<string>();
    const candidateMessages = new Map<string, QrScannerCandidateMessage>();
    const queuedScanGroups: PendingScanGroup[] = [];
    const pendingGroupsByIdentity = new Map<string, PendingScanGroup>();
    const reusableResultsByIdentity = new Map<string, QrScannerCandidateResult>();
    let scanSequence = 0;
    let batchDrainScheduled = false;
    let batchInFlight = false;
    let releaseBatchWindow: (() => void) | null = null;
    let batchWindowTimer: number | null = null;
    let retainedBatchRecovery: RetainedBatchRecovery | null = null;

    const post = (message: unknown): boolean => {
      if (disposed || !scannerWindow) return false;
      try {
        // Mobile browser-owned popup surfaces can report WindowProxy.closed
        // while the strict-origin message channel remains usable.
        scannerWindow.postMessage(message, scannerLaunch.origin);
        return true;
      } catch {
        return false;
      }
    };

    const notifyPendingWork = (): void => {
      launchCallbacks.onPendingWorkChange?.(pendingScanIds.size);
    };

    const beginSessionHold = (): void => {
      if (sessionHoldActive) return;
      sessionHoldActive = true;
      launchCallbacks.onSessionReady?.();
    };

    const releaseSessionHold = (reason: Parameters<EndQrScannerInteraction>[0]): void => {
      if (!sessionHoldActive) return;
      sessionHoldActive = false;
      launchCallbacks.onSessionEnd?.(reason);
    };

    const finishDetachedSessionIfIdle = (): void => {
      if (!detached || pendingScanIds.size > 0) return;
      releaseSessionHold(detachedEndReason);
      disposed = true;
    };

    const sendSetup = (): void => {
      if (!scannerReady || disposed) return;
      post(
        buildQrScannerSetupMessage(requestId, {
          ...(sessionState?.session.instruction || launchTarget.instruction
            ? { instruction: sessionState?.session.instruction || launchTarget.instruction }
            : {}),
          ...(sessionState ? { maxFiles: sessionState.session.maxFiles } : {}),
          ...(sessionState ? { existingCount: sessionState.session.existingCount } : {}),
          hideCloseOnIos: launchTarget.hideCloseOnIos,
          // Retained on the wire for cached scanner pages. Persistence no
          // longer depends on detecting a native return on any platform.
          commitOnReturnOnIos: launchTarget.commitOnReturnOnIos
        })
      );
    };

    const ensureSession = (): Promise<{
      credentials: QrScannerSessionCredentials;
      session: QrScannerSessionProjection;
    }> => {
      if (sessionPromise) return sessionPromise;
      const pending = (async () => {
        const launch = await launchTarget.prepareSession({
          fieldId: launchTarget.fieldId,
          fieldPath: launchTarget.fieldPath
        });
        if (!launch.success) throw launchError(launch);
        // Preparation flushes pending form edits. Keep the origin record
        // stable until the scanner UI actually closes; an idle camera remains
        // the same multi-scan interaction and may send another code later.
        beginSessionHold();
        const redeemed = await redeemQrScannerSession(launch);
        sessionState = redeemed;
        sendSetup();
        latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.sessionReady', {
          fieldPath: launchTarget.fieldPath,
          sessionId: redeemed.session.id
        });
        return redeemed;
      })();
      sessionPromise = pending;
      void pending.catch(() => {
        if (sessionPromise === pending) sessionPromise = null;
      });
      return pending;
    };

    const applyCommittedUpdate = (result: QrScannerCommittedFieldResult): void => {
      try {
        launchCallbacks.onCommitted?.({
          fieldId: launchTarget.fieldId,
          fieldPath: launchTarget.fieldPath,
          recordId: result.recordId,
          fieldValue: result.fieldValue,
          links: result.links,
          linkedCount: result.linkedCount,
          dataVersion: result.dataVersion
        });
      } catch (error) {
        latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.updateApplyFailed', {
          fieldPath: launchTarget.fieldPath,
          message: error instanceof Error ? error.message : 'The scanner update could not be applied.'
        });
      }
    };

    const latestCommittedResult = (batch: QrScannerCandidateBatchResult): QrScannerCommittedFieldResult | undefined => {
      if (batch.committed) return batch.committed;
      return batch.results.reduce<QrScannerCommittedFieldResult | undefined>((latest, result) => {
        if (!result.committed) return latest;
        if (!latest) return result.committed;
        const latestVersion = typeof latest.dataVersion === 'number' ? latest.dataVersion : -1;
        const candidateVersion = typeof result.committed.dataVersion === 'number' ? result.committed.dataVersion : -1;
        return candidateVersion >= latestVersion ? result.committed : latest;
      }, undefined);
    };

    const addCandidateBatchWithRetry = async (
      credentials: QrScannerSessionCredentials,
      supportsBatch: boolean,
      batchRequestId: string,
      groups: PendingScanGroup[]
    ): Promise<QrScannerCandidateBatchResult> => {
      const candidates = groups.map(group => ({ scanId: group.leader.scanId, rawValue: group.leader.value }));
      let lastError: unknown;
      for (let attempt = 1; attempt <= ADD_CANDIDATE_MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = supportsBatch
            ? await addQrScannerCandidates(credentials, {
                requestId: batchRequestId,
                candidates
              })
            : await (async (): Promise<QrScannerCandidateBatchResult> => {
                const results: QrScannerCandidateResult[] = [];
                for (const candidate of candidates) results.push(await addQrScannerCandidate(credentials, candidate));
                const last = results[results.length - 1];
                if (!last) throw new QrScannerSessionError('INVALID_REQUEST', 'The scanner batch was empty.');
                return {
                  results,
                  session: last.session,
                  ...(last.committed ? { committed: last.committed } : {}),
                  transport: 'legacy'
                };
              })();
          // Item-level retryable outcomes are surfaced so a later scan can
          // retry them with a new request. Only an ambiguous accepted result
          // without its authoritative commit warrants replaying this exact batch.
          const retryableResult =
            result.results.some(entry => entry.candidate.status === 'AUTHORISED') && !latestCommittedResult(result);
          if (!retryableResult) return result;
          if (attempt === ADD_CANDIDATE_MAX_ATTEMPTS) {
            if (supportsBatch) {
              throw new QrScannerSessionError(
                'TEMPORARY_ERROR',
                'The scanner batch commit could not be confirmed.',
                true
              );
            }
            return result;
          }
          latestRef.current.onDiagnostic?.(
            supportsBatch
              ? 'upload.linkCapture.externalScanner.batchRetry'
              : 'upload.linkCapture.externalScanner.candidateRetry',
            supportsBatch
              ? {
                  fieldPath: launchTarget.fieldPath,
                  requestId: batchRequestId,
                  scanIds: groups.map(group => group.leader.scanId),
                  code: 'RETRYABLE_RESULT',
                  attempt
                }
              : {
                  fieldPath: launchTarget.fieldPath,
                  scanId: groups[0]?.leader.scanId,
                  code: result.results[0]?.candidate.code || 'RETRYABLE_RESULT',
                  attempt
                }
          );
        } catch (error) {
          lastError = error;
          const failure = errorDetails(error);
          if (!failure.retryable || attempt === ADD_CANDIDATE_MAX_ATTEMPTS) throw error;
          latestRef.current.onDiagnostic?.(
            supportsBatch
              ? 'upload.linkCapture.externalScanner.batchRetry'
              : 'upload.linkCapture.externalScanner.candidateRetry',
            supportsBatch
              ? {
                  fieldPath: launchTarget.fieldPath,
                  requestId: batchRequestId,
                  scanIds: groups.map(group => group.leader.scanId),
                  code: failure.code,
                  attempt
                }
              : {
                  fieldPath: launchTarget.fieldPath,
                  scanId: groups[0]?.leader.scanId,
                  code: failure.code,
                  attempt
                }
          );
        }
      }
      throw lastError || new QrScannerSessionError('TEMPORARY_ERROR', 'The receipt could not be checked.', true);
    };

    const aliasResult = (result: QrScannerCandidateResult): QrScannerCandidateResult => {
      if (['AUTHORISED', 'DUPLICATE'].includes(result.candidate.status)) {
        return {
          candidate: {
            ...result.candidate,
            status: 'DUPLICATE',
            code: result.candidate.status === 'AUTHORISED' ? 'DUPLICATE_SESSION' : result.candidate.code,
            retryable: false
          },
          session: result.session
        };
      }
      return { candidate: { ...result.candidate }, session: result.session };
    };

    const publishCandidate = (
      member: PendingScanMember,
      result: QrScannerCandidateResult,
      context: { requestId?: string; local: boolean; alias: boolean; committed: boolean }
    ): void => {
      const projected = context.alias ? aliasResult(result) : result;
      const response = candidateMessage(requestId, member.message.scanId, projected);
      candidateMessages.set(member.message.scanId, response);
      const posted = post(response);
      if (response.status !== 'accepted') {
        launchCallbacks.onCandidateOutcome?.({
          scanId: response.scanId,
          status: response.status,
          code: response.code || 'INTERNAL_ERROR',
          message: response.message || 'This receipt could not be added.'
        });
      }
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidate', {
        fieldPath: launchTarget.fieldPath,
        scanId: member.message.scanId,
        code: projected.candidate.code,
        status: projected.candidate.status,
        posted,
        committed: context.committed,
        local: context.local,
        alias: context.alias,
        ...(context.requestId ? { requestId: context.requestId } : {})
      });
    };

    const completePendingMember = (scanId: string): void => {
      pendingScanIds.delete(scanId);
      notifyPendingWork();
    };

    const failGroups = (groups: PendingScanGroup[], error: unknown): void => {
      const failure = errorDetails(error);
      if (['SESSION_EXPIRED', 'SESSION_NOT_ACTIVE', 'INVALID_CREDENTIAL', 'NOT_FOUND'].includes(failure.code)) {
        sessionPromise = null;
        sessionState = null;
      }
      if (!sessionState) releaseSessionHold('failed');
      groups
        .flatMap(group => group.members.map(member => ({ group, member })))
        .sort((left, right) => left.member.sequence - right.member.sequence)
        .forEach(({ group, member }) => {
          const response = buildQrScannerCandidateMessage(requestId, {
            scanId: member.message.scanId,
            status: 'error',
            code: failure.code,
            message: failure.retryable ? 'This receipt could not be checked. Scan it again.' : failure.message
          });
          candidateMessages.set(member.message.scanId, response);
          post(response);
          launchCallbacks.onCandidateOutcome?.({
            scanId: response.scanId,
            status: 'error',
            code: response.code || failure.code,
            message: response.message || failure.message
          });
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidateFailed', {
            fieldPath: launchTarget.fieldPath,
            scanId: member.message.scanId,
            code: failure.code,
            retryable: failure.retryable,
            coalesced: member.message.scanId !== group.leader.scanId
          });
          completePendingMember(member.message.scanId);
        });
      groups.forEach(group => {
        if (group.identity && pendingGroupsByIdentity.get(group.identity) === group) {
          pendingGroupsByIdentity.delete(group.identity);
        }
      });
    };

    const applyBatchResponse = (
      groups: PendingScanGroup[],
      batch: QrScannerCandidateBatchResult,
      batchRequestId: string,
      completePending: boolean,
      recovery: boolean
    ): void => {
      if (batch.results.length !== groups.length) {
        throw new QrScannerSessionError('INTERNAL_ERROR', 'The scanner batch response was incomplete.');
      }
      const normalizedResults: QrScannerCandidateResult[] = batch.results.map(result => ({
        candidate: result.candidate,
        session: batch.session,
        ...(result.committed ? { committed: result.committed } : {})
      }));
      if (sessionState) sessionState = { ...sessionState, session: batch.session };
      const committed = latestCommittedResult(batch);
      if (normalizedResults.some(result => result.candidate.status === 'AUTHORISED') && !committed) {
        throw new QrScannerSessionError(
          'INTERNAL_ERROR',
          'The receipts were checked but their saved field update was missing.'
        );
      }
      // Apply one authoritative record state before publishing any accepted
      // candidate from this batch.
      if (committed) applyCommittedUpdate(committed);
      sendSetup();

      groups.forEach((group, index) => {
        const result = normalizedResults[index];
        if (group.identity && isReusableQrScannerOutcome(result)) {
          reusableResultsByIdentity.set(group.identity, {
            candidate: { ...result.candidate },
            session: result.session
          });
        }
      });
      groups
        .flatMap((group, index) =>
          group.members.map(member => ({ group, member, result: normalizedResults[index] }))
        )
        .sort((left, right) => left.member.sequence - right.member.sequence)
        .forEach(({ group, member, result }) => {
          publishCandidate(member, result, {
            requestId: batchRequestId,
            local: false,
            alias: member.message.scanId !== group.leader.scanId,
            committed: Boolean(committed)
          });
          if (completePending) completePendingMember(member.message.scanId);
        });
      groups.forEach(group => {
        if (group.identity && pendingGroupsByIdentity.get(group.identity) === group) {
          pendingGroupsByIdentity.delete(group.identity);
        }
      });
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.batchDone', {
        fieldPath: launchTarget.fieldPath,
        requestId: batchRequestId,
        size: groups.length,
        transport: batch.transport,
        committed: Boolean(committed),
        recovery
      });
    };

    const settleReusableQueuedGroups = (): void => {
      const remaining: PendingScanGroup[] = [];
      queuedScanGroups.forEach(group => {
        const reusable = group.identity ? reusableResultsByIdentity.get(group.identity) : undefined;
        if (!reusable) {
          remaining.push(group);
          return;
        }
        group.members
          .slice()
          .sort((left, right) => left.sequence - right.sequence)
          .forEach(member => {
            publishCandidate(member, reusable, { local: true, alias: true, committed: false });
            completePendingMember(member.message.scanId);
          });
        if (group.identity && pendingGroupsByIdentity.get(group.identity) === group) {
          pendingGroupsByIdentity.delete(group.identity);
        }
      });
      queuedScanGroups.splice(0, queuedScanGroups.length, ...remaining);
    };

    const finishBatchWindow = (): void => {
      releaseBatchWindow?.();
    };

    const createBatchWindow = (enabled: boolean): Promise<void> => {
      if (!enabled) return Promise.resolve();
      return new Promise(resolve => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          if (batchWindowTimer !== null) window.clearTimeout(batchWindowTimer);
          batchWindowTimer = null;
          releaseBatchWindow = null;
          resolve();
        };
        releaseBatchWindow = finish;
        batchWindowTimer = window.setTimeout(finish, BATCH_COLLECTION_WINDOW_MS);
      });
    };

    function scheduleBatchDrain(waitForCollection: boolean): void {
      if (batchDrainScheduled || (queuedScanGroups.length === 0 && !retainedBatchRecovery)) return;
      batchDrainScheduled = true;
      const batchWindow = createBatchWindow(waitForCollection);
      scanChain = scanChain.then(async () => {
        let groups: PendingScanGroup[] = [];
        let supportsBatch = false;
        let batchRequestId = '';
        try {
          await batchWindow;
          const ready = await ensureSession();
          beginSessionHold();
          supportsBatch = ready.session.capabilities?.addCandidates === true;

          if (retainedBatchRecovery) {
            if (!supportsBatch) {
              retainedBatchRecovery = null;
              throw new QrScannerSessionError(
                'INTERNAL_ERROR',
                'The scanner session no longer supports batch recovery.'
              );
            }
            const recovery = retainedBatchRecovery;
            batchInFlight = true;
            latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.batchRecoveryStart', {
              fieldPath: launchTarget.fieldPath,
              requestId: recovery.requestId,
              size: recovery.groups.length,
              scanIds: recovery.groups.map(group => group.leader.scanId)
            });
            try {
              const recovered = await addCandidateBatchWithRetry(
                ready.credentials,
                true,
                recovery.requestId,
                recovery.groups
              );
              applyBatchResponse(recovery.groups, recovered, recovery.requestId, false, true);
              retainedBatchRecovery = null;
              settleReusableQueuedGroups();
              latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.batchRecoveryDone', {
                fieldPath: launchTarget.fieldPath,
                requestId: recovery.requestId
              });
            } catch (error) {
              const failure = errorDetails(error);
              if (!failure.retryable) retainedBatchRecovery = null;
              const blockedGroups = queuedScanGroups.splice(0, queuedScanGroups.length);
              failGroups(blockedGroups, error);
              latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.batchRecoveryFailed', {
                fieldPath: launchTarget.fieldPath,
                requestId: recovery.requestId,
                code: failure.code,
                retryable: failure.retryable,
                retained: Boolean(retainedBatchRecovery)
              });
              return;
            } finally {
              batchInFlight = false;
            }
          }

          if (queuedScanGroups.length === 0) return;
          const advertisedBatchSize = Number(ready.session.capabilities?.maxCandidateBatchSize);
          const batchSize = supportsBatch
            ? Math.min(
                MAX_CANDIDATES_PER_BATCH,
                Number.isSafeInteger(advertisedBatchSize) && advertisedBatchSize > 0
                  ? advertisedBatchSize
                  : MAX_CANDIDATES_PER_BATCH
              )
            : 1;
          groups = queuedScanGroups.splice(0, batchSize);
          if (groups.length === 0) return;
          batchInFlight = true;
          batchRequestId = createSecureRequestId();
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.batchStart', {
            fieldPath: launchTarget.fieldPath,
            requestId: batchRequestId,
            size: groups.length,
            scanIds: groups.map(group => group.leader.scanId)
          });
          const batch = await addCandidateBatchWithRetry(
            ready.credentials,
            supportsBatch,
            batchRequestId,
            groups
          );
          applyBatchResponse(groups, batch, batchRequestId, true, false);
        } catch (error) {
          if (groups.length === 0) groups = queuedScanGroups.splice(0, MAX_CANDIDATES_PER_BATCH);
          const failure = errorDetails(error);
          if (supportsBatch && batchRequestId && groups.length > 0 && failure.retryable) {
            retainedBatchRecovery = { requestId: batchRequestId, groups };
            latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.batchRecoveryRetained', {
              fieldPath: launchTarget.fieldPath,
              requestId: batchRequestId,
              size: groups.length,
              scanIds: groups.map(group => group.leader.scanId)
            });
          }
          failGroups(groups, error);
          if (retainedBatchRecovery && queuedScanGroups.length > 0) {
            const blockedGroups = queuedScanGroups.splice(0, queuedScanGroups.length);
            failGroups(blockedGroups, error);
          }
        } finally {
          batchInFlight = false;
          batchDrainScheduled = false;
          releaseBatchWindow = null;
          if (batchWindowTimer !== null) window.clearTimeout(batchWindowTimer);
          batchWindowTimer = null;
          if (queuedScanGroups.length > 0 && !retainedBatchRecovery) scheduleBatchDrain(false);
          finishDetachedSessionIfIdle();
        }
      });
    }

    const enqueueScan = (message: QrScannerScanMessage): void => {
      const completed = candidateMessages.get(message.scanId);
      if (completed) {
        post(completed);
        return;
      }
      if (!acceptingScans || pendingScanIds.has(message.scanId)) return;
      const identity = qrScannerCandidateIdentity(message.value);
      const reusable = identity ? reusableResultsByIdentity.get(identity) : undefined;
      if (reusable) {
        scanSequence += 1;
        publishCandidate(
          { message, sequence: scanSequence },
          reusable,
          { local: true, alias: true, committed: false }
        );
        return;
      }
      if (pendingScanIds.size >= MAX_PENDING_SCANS) {
        post(
          buildQrScannerCandidateMessage(requestId, {
            scanId: message.scanId,
            status: 'error',
            code: 'QUEUE_FULL',
            message: 'Too many receipts are waiting to be checked. Try this receipt again.'
          })
        );
        return;
      }

      pendingScanIds.add(message.scanId);
      notifyPendingWork();
      scanSequence += 1;
      const member = { message, sequence: scanSequence };
      const pendingGroup = identity ? pendingGroupsByIdentity.get(identity) : undefined;
      if (pendingGroup) {
        pendingGroup.members.push(member);
        latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidateCoalesced', {
          fieldPath: launchTarget.fieldPath,
          scanId: message.scanId,
          leaderScanId: pendingGroup.leader.scanId
        });
        return;
      }
      const group: PendingScanGroup = { identity, leader: message, members: [member] };
      queuedScanGroups.push(group);
      if (identity) pendingGroupsByIdentity.set(identity, group);
      scheduleBatchDrain(Boolean(sessionState) && !batchInFlight);
      if (queuedScanGroups.length >= MAX_CANDIDATES_PER_BATCH) finishBatchWindow();
    };

    const removeListeners = (): void => {
      window.removeEventListener('message', handleMessage);
      if (activeCleanupRef.current === cleanup) activeCleanupRef.current = null;
    };

    const detach = (reason: Parameters<EndQrScannerInteraction>[0]): void => {
      if (detached) return;
      acceptingScans = false;
      detached = true;
      detachedEndReason = reason;
      removeListeners();
      finishDetachedSessionIfIdle();
    };

    const handleLegacyFinish = (): void => {
      if (finishAckScheduled || disposed) return;
      finishAckScheduled = true;
      acceptingScans = false;
      post(buildQrScannerCommitMessage(requestId, { status: 'committing', message: 'Finishing scans...' }));
      scheduleBatchDrain(false);
      const waitForPendingScans = async (): Promise<void> => {
        while (true) {
          const activeChain = scanChain;
          await activeChain;
          if (activeChain === scanChain && pendingScanIds.size === 0) return;
          await Promise.resolve();
        }
      };
      void waitForPendingScans().finally(() => {
        if (!disposed) {
          const linkedCount = Array.from(candidateMessages.values()).filter(message => message.status === 'accepted').length;
          post(
            buildQrScannerCommitMessage(requestId, {
              status: 'committed',
              linkedCount,
              message: linkedCount === 1 ? '1 receipt added.' : `${linkedCount} receipts added.`
            })
          );
        }
        detach('committed');
      });
    };

    function handleMessage(event: MessageEvent): void {
      if (event.origin !== scannerLaunch.origin || !event.source) return;
      const message = parseQrScannerToOpenerMessage(event.data, requestId);
      if (!message) return;
      if (event.source !== scannerWindow) {
        scannerWindow = event.source as Window;
        latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.peerRebound', {
          fieldPath: launchTarget.fieldPath,
          messageType: message.type
        });
      }
      switch (message.type) {
        case QR_SCANNER_MESSAGE_TYPES.ready:
          scannerReady = true;
          sendSetup();
          candidateMessages.forEach(candidate => post(candidate));
          break;
        case QR_SCANNER_MESSAGE_TYPES.scan:
          scannerReady = true;
          sendSetup();
          enqueueScan(message);
          break;
        case QR_SCANNER_MESSAGE_TYPES.finish:
          // Compatibility for a scanner page cached before incremental saves.
          // Drain any retained ambiguous batch before acknowledging the
          // incremental results; no separate commit RPC is needed.
          handleLegacyFinish();
          break;
        case QR_SCANNER_MESSAGE_TYPES.cancel:
          // Cancelling only detaches the camera UI. It must never cancel a
          // durable link or interrupt an addCandidate request in flight.
          detach('cancelled');
          break;
        case QR_SCANNER_MESSAGE_TYPES.closed:
          // Closing only detaches the camera UI. It must never cancel durable
          // links or interrupt an addCandidate request already in flight.
          detach('closed');
          break;
        default:
          break;
      }
    }

    const cleanup: ActiveScannerCleanup = () => {
      detach('closed');
    };

    window.addEventListener('message', handleMessage);
    scannerWindow = window.open(scannerLaunch.url, SCANNER_WINDOW_NAME, 'popup,width=480,height=760');
    if (!scannerWindow) {
      disposed = true;
      removeListeners();
      current.onDiagnostic?.('upload.linkCapture.externalScanner.blocked', { fieldPath: current.fieldPath });
      current.onUnavailable?.('Could not open the scanner window. Allow popups and try again.');
      return false;
    }

    activeCleanupRef.current = cleanup;
    current.onDiagnostic?.('upload.linkCapture.externalScanner.open', {
      fieldPath: current.fieldPath,
      origin: scannerLaunch.origin
    });
    return true;
  }, []);

  return { available, openScanner };
};
