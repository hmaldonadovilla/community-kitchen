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
  redeemQrScannerSession,
  QrScannerSessionError,
  type QrScannerCandidateResult,
  type QrScannerCommittedFieldResult,
  type QrScannerSessionCredentials,
  type QrScannerSessionProjection
} from '../services/qrScannerSessionClient';

const SCANNER_WINDOW_NAME = 'ckReceiptQrScanner';
const MAX_PENDING_SCANS = 20;
const ADD_CANDIDATE_MAX_ATTEMPTS = 2;

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

    const addCandidateWithRetry = async (
      credentials: QrScannerSessionCredentials,
      message: QrScannerScanMessage
    ): Promise<QrScannerCandidateResult> => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= ADD_CANDIDATE_MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await addQrScannerCandidate(credentials, {
            scanId: message.scanId,
            rawValue: message.value
          });
          const retryableResult =
            result.candidate.status === 'RETRYABLE_ERROR' ||
            (result.candidate.status === 'AUTHORISED' && !result.committed);
          if (!retryableResult || attempt === ADD_CANDIDATE_MAX_ATTEMPTS) {
            return result;
          }
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidateRetry', {
            fieldPath: launchTarget.fieldPath,
            scanId: message.scanId,
            code: result.candidate.code,
            attempt
          });
        } catch (error) {
          lastError = error;
          const failure = errorDetails(error);
          if (!failure.retryable || attempt === ADD_CANDIDATE_MAX_ATTEMPTS) throw error;
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidateRetry', {
            fieldPath: launchTarget.fieldPath,
            scanId: message.scanId,
            code: failure.code,
            attempt
          });
        }
      }
      throw lastError || new QrScannerSessionError('TEMPORARY_ERROR', 'The receipt could not be checked.', true);
    };

    const enqueueScan = (message: QrScannerScanMessage): void => {
      const completed = candidateMessages.get(message.scanId);
      if (completed) {
        post(completed);
        return;
      }
      if (!acceptingScans || pendingScanIds.has(message.scanId)) return;
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
      scanChain = scanChain
        .then(async () => {
          const ready = await ensureSession();
          beginSessionHold();
          const result = await addCandidateWithRetry(ready.credentials, message);
          if (sessionState) sessionState = { ...sessionState, session: result.session };
          if (result.candidate.status === 'AUTHORISED') {
            if (!result.committed) {
              throw new QrScannerSessionError(
                'INTERNAL_ERROR',
                'The receipt was checked but its saved field update was missing.'
              );
            }
            // Apply the authoritative record state before telling the camera
            // page that the receipt was added.
            applyCommittedUpdate(result.committed);
          }
          const response = candidateMessage(requestId, message.scanId, result);
          candidateMessages.set(message.scanId, response);
          sendSetup();
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
            scanId: message.scanId,
            code: result.candidate.code,
            status: result.candidate.status,
            posted,
            committed: Boolean(result.committed)
          });
        })
        .catch(error => {
          const failure = errorDetails(error);
          if (['SESSION_EXPIRED', 'SESSION_NOT_ACTIVE', 'INVALID_CREDENTIAL', 'NOT_FOUND'].includes(failure.code)) {
            sessionPromise = null;
            sessionState = null;
          }
          // A failed prepare/redeem or invalidated session must not keep the
          // autosave hold across the next queued attempt: preparation needs to
          // flush the latest form state before creating fresh credentials.
          if (!sessionState) releaseSessionHold('failed');
          const response = buildQrScannerCandidateMessage(requestId, {
            scanId: message.scanId,
            status: 'error',
            code: failure.code,
            message: failure.retryable
              ? 'This receipt could not be checked. Scan it again.'
              : failure.message
          });
          candidateMessages.set(message.scanId, response);
          post(response);
          launchCallbacks.onCandidateOutcome?.({
            scanId: response.scanId,
            status: 'error',
            code: response.code || failure.code,
            message: response.message || failure.message
          });
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidateFailed', {
            fieldPath: launchTarget.fieldPath,
            scanId: message.scanId,
            code: failure.code,
            retryable: failure.retryable
          });
        })
        .finally(() => {
          pendingScanIds.delete(message.scanId);
          notifyPendingWork();
          finishDetachedSessionIfIdle();
        });
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
      void scanChain.finally(() => {
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
          // All candidates are already durable, so no commit RPC is needed.
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
