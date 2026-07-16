import React from 'react';

import type { QrScanSessionLaunchResult } from '../../../../../types';
import {
  buildQrScannerCandidateMessage,
  buildQrScannerCancelledMessage,
  buildQrScannerCommitMessage,
  buildQrScannerErrorMessage,
  buildQrScannerSetupMessage,
  parseQrScannerToOpenerMessage,
  QR_SCANNER_MESSAGE_TYPES,
  type QrScannerCandidateMessage,
  type QrScannerCommitMessage,
  type QrScannerScanMessage
} from '../../../../qrScanner/openerProtocol';
import { resolveExternalQrScannerLaunch } from '../domain/externalQrScanner';
import type {
  ApplyQrScannerCommittedUpdate,
  BeginQrScannerInteraction,
  EndQrScannerInteraction,
  PrepareQrScannerLaunch
} from '../qrScannerTypes';
import {
  addQrScannerCandidate,
  cancelQrScannerSession,
  commitQrScannerSession,
  getQrScannerSession,
  redeemQrScannerSession,
  QrScannerSessionError,
  type QrScannerCandidateResult,
  type QrScannerCommittedFieldResult,
  type QrScannerSessionCredentials,
  type QrScannerSessionProjection
} from '../services/qrScannerSessionClient';

const SCANNER_WINDOW_NAME = 'ckReceiptQrScanner';
const MAX_PENDING_SCANS = 20;
const SESSION_WINDOW_TIMEOUT_MS = 20 * 60 * 1000;
const TERMINAL_RESPONSE_GRACE_MS = 60 * 1000;

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
) => {
  const candidate = result.candidate;
  const status =
    candidate.status === 'AUTHORISED'
      ? 'accepted'
      : candidate.status === 'DUPLICATE'
        ? 'duplicate'
        : candidate.status === 'RETRYABLE_ERROR'
          ? 'error'
          : 'rejected';
  const message =
    status === 'accepted'
      ? 'Receipt checked and ready to add.'
      : status === 'duplicate'
        ? 'This receipt was already scanned or linked.'
        : status === 'error'
          ? 'This receipt could not be checked. Scan it again.'
          : candidate.code === 'LIMIT_REACHED'
            ? 'The maximum number of receipts has been reached.'
            : candidate.code === 'UNSUPPORTED_TYPE'
              ? 'This file type is not allowed for this field.'
              : 'This QR code is not an authorised receipt.';
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
  prepareSession?: PrepareQrScannerLaunch;
  onSessionReady?: BeginQrScannerInteraction;
  onSessionEnd?: EndQrScannerInteraction;
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
      hideCloseOnIos: current.hideCloseOnIos !== false
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
      prepareSession: current.prepareSession
    };

    let scannerWindow: Window | null = null;
    let ended = false;
    let scannerReady = false;
    let sessionHoldActive = false;
    let commitInFlight = false;
    let stableCommitRequestId: string | null = null;
    let committedUpdateApplied = false;
    let reconcileWhenReady = false;
    let reconcilePromise: Promise<void> | null = null;
    let scanChain: Promise<void> = Promise.resolve();
    let terminalCommitMessage: QrScannerCommitMessage | null = null;
    const pendingScanIds = new Set<string>();
    const candidateMessages = new Map<string, QrScannerCandidateMessage>();

    const post = (message: unknown): boolean => {
      if (ended || !scannerWindow) return false;
      try {
        // Mobile browser-owned popup surfaces can report WindowProxy.closed
        // while the strict-origin message channel still works. Attempt the
        // message and use exceptions/protocol events as the liveness signal.
        scannerWindow.postMessage(message, scannerLaunch.origin);
        return true;
      } catch {
        return false;
      }
    };

    const finishHold = (reason: Parameters<EndQrScannerInteraction>[0]): void => {
      if (!sessionHoldActive) return;
      sessionHoldActive = false;
      latestRef.current.onSessionEnd?.(reason);
    };

    let sessionState: {
      credentials: QrScannerSessionCredentials;
      session: QrScannerSessionProjection;
    } | null = null;

    const sendSetup = (): void => {
      if (!scannerReady) return;
      if (terminalCommitMessage) {
        post(terminalCommitMessage);
        return;
      }
      if (!sessionState) return;
      post(
        buildQrScannerSetupMessage(requestId, {
          instruction: sessionState.session.instruction || launchTarget.instruction,
          maxFiles: sessionState.session.maxFiles,
          existingCount: sessionState.session.existingCount,
          hideCloseOnIos: launchTarget.hideCloseOnIos
        })
      );
      candidateMessages.forEach(message => post(message));
    };

    let startSessionPreparation = (): void => undefined;
    const sessionStart = new Promise<void>(resolve => {
      startSessionPreparation = resolve;
    });
    const sessionPromise = sessionStart.then(async () => {
      const launch = await launchTarget.prepareSession!({
        fieldId: launchTarget.fieldId,
        fieldPath: launchTarget.fieldPath
      });
      if (!launch.success) throw launchError(launch);
      const redeemed = await redeemQrScannerSession(launch);
      if (ended) return redeemed;
      sessionState = redeemed;
      sessionHoldActive = true;
      latestRef.current.onSessionReady?.();
      sendSetup();
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.sessionReady', {
        fieldPath: launchTarget.fieldPath,
        sessionId: redeemed.session.id
      });
      if (reconcileWhenReady) void reconcileSession('resume');
      return redeemed;
    });

    const enqueueScan = (message: QrScannerScanMessage): void => {
      if (pendingScanIds.has(message.scanId)) return;
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
      scanChain = scanChain
        .then(async () => {
          if (ended) return;
          const ready = await sessionPromise;
          if (ended) return;
          const result = await addQrScannerCandidate(ready.credentials, {
            scanId: message.scanId,
            rawValue: message.value
          });
          if (sessionState) sessionState = { ...sessionState, session: result.session };
          const response = candidateMessage(requestId, message.scanId, result);
          candidateMessages.set(message.scanId, response);
          const posted = post(response);
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.candidate', {
            fieldPath: launchTarget.fieldPath,
            scanId: message.scanId,
            code: result.candidate.code,
            status: result.candidate.status,
            posted
          });
        })
        .catch(error => {
          if (ended) return;
          const failure = errorDetails(error);
          post(
            buildQrScannerCandidateMessage(requestId, {
              scanId: message.scanId,
              status: 'error',
              code: failure.code,
              message: failure.retryable
                ? 'This receipt could not be checked. Scan it again.'
                : failure.message
            })
          );
        })
        .finally(() => {
          pendingScanIds.delete(message.scanId);
        });
    };

    let timeoutId = 0;
    const removeListeners = (): void => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (activeCleanupRef.current === cleanup) activeCleanupRef.current = null;
    };

    const applyCommittedUpdate = (result: QrScannerCommittedFieldResult): void => {
      if (committedUpdateApplied) return;
      committedUpdateApplied = true;
      try {
        latestRef.current.onCommitted?.({
          fieldId: launchTarget.fieldId,
          fieldPath: launchTarget.fieldPath,
          recordId: result.recordId,
          fieldValue: result.fieldValue,
          links: result.links,
          linkedCount: result.linkedCount,
          dataVersion: result.dataVersion
        });
      } catch (error) {
        latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.reconcileApplyFailed', {
          fieldPath: launchTarget.fieldPath,
          message: error instanceof Error ? error.message : 'Committed scanner update could not be applied.'
        });
      }
    };

    const completeCommittedSession = (
      result: QrScannerCommittedFieldResult,
      source: 'commit' | 'resume' | 'cancelRace'
    ): void => {
      applyCommittedUpdate(result);
      terminalCommitMessage ||= buildQrScannerCommitMessage(requestId, {
        status: 'committed',
        linkedCount: result.linkedCount,
        message: result.linkedCount === 1 ? '1 receipt added.' : `${result.linkedCount} receipts added.`
      });
      if (!ended) post(terminalCommitMessage);
      commitInFlight = false;
      if (!ended) {
        window.removeEventListener('focus', handleResume);
        window.removeEventListener('pageshow', handleResume);
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          ended = true;
          removeListeners();
        }, TERMINAL_RESPONSE_GRACE_MS);
      }
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.committed', {
        fieldPath: launchTarget.fieldPath,
        linkedCount: result.linkedCount,
        dataVersion: result.dataVersion ?? null,
        source
      });
      finishHold('committed');
    };

    const failTerminalSession = (failure: { code: string; message: string }): void => {
      if (ended) return;
      post(buildQrScannerErrorMessage(requestId, { ...failure, retryable: false }));
      commitInFlight = false;
      ended = true;
      removeListeners();
      finishHold('failed');
    };

    async function reconcileSession(source: 'resume' | 'commitFailure'): Promise<void> {
      if (ended || terminalCommitMessage) return;
      if (!sessionState) {
        reconcileWhenReady = true;
        return;
      }
      reconcileWhenReady = false;
      if (reconcilePromise) return reconcilePromise;

      const run = (async () => {
        try {
          const snapshot = await getQrScannerSession(sessionState!.credentials);
          if (ended) return;
          sessionState = { ...sessionState!, session: snapshot.session };
          if (snapshot.session.status === 'COMPLETED') {
            if (snapshot.session.commitResult) {
              completeCommittedSession(snapshot.session.commitResult, 'resume');
            } else {
              failTerminalSession({
                code: 'INTERNAL_ERROR',
                message: 'The completed scanner session could not be restored. Reload the form to see the saved receipts.'
              });
            }
            return;
          }
          if (snapshot.session.status === 'CANCELLED') {
            post(buildQrScannerCancelledMessage(requestId, 'Scan cancelled.'));
            ended = true;
            removeListeners();
            finishHold('cancelled');
            return;
          }
          if (snapshot.session.status === 'EXPIRED') {
            failTerminalSession({
              code: 'SESSION_EXPIRED',
              message: 'This scan session expired. Return to the form and start again.'
            });
            return;
          }
          if (
            snapshot.session.status === 'COMMITTING' &&
            stableCommitRequestId
          ) {
            const commitWasAlreadyInFlight = commitInFlight;
            commitInFlight = true;
            try {
              const committed = await commitQrScannerSession(sessionState!.credentials, stableCommitRequestId);
              if (!ended) completeCommittedSession(committed.result, 'resume');
            } catch (error) {
              if (!commitWasAlreadyInFlight) commitInFlight = false;
              const failure = errorDetails(error);
              latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.reconcileCommitFailed', {
                fieldPath: launchTarget.fieldPath,
                code: failure.code,
                retryable: failure.retryable,
                source
              });
            }
          }
        } catch (error) {
          if (ended) return;
          const failure = errorDetails(error);
          if (['SESSION_EXPIRED', 'SESSION_NOT_ACTIVE', 'INVALID_CREDENTIAL', 'NOT_FOUND'].includes(failure.code)) {
            failTerminalSession(failure);
            return;
          }
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.reconcileFailed', {
            fieldPath: launchTarget.fieldPath,
            code: failure.code,
            retryable: failure.retryable,
            source
          });
        }
      })();
      reconcilePromise = run;
      await run.finally(() => {
        if (reconcilePromise === run) reconcilePromise = null;
      });
    }

    const cancelPreparedSession = (reason: 'cancelled' | 'closed' | 'failed'): void => {
      void sessionPromise
        .then(ready => cancelQrScannerSession(ready.credentials))
        .then(cancelled => {
          if (cancelled.status === 'COMPLETED' && cancelled.session.commitResult) {
            completeCommittedSession(cancelled.session.commitResult, 'cancelRace');
            return true;
          }
          return false;
        })
        .catch(() => false)
        .then(commitRecovered => {
          if (!commitRecovered) finishHold(reason);
        });
    };

    const endWithoutCommit = (reason: 'cancelled' | 'closed' | 'failed', notifyScanner: boolean): void => {
      if (ended || commitInFlight) return;
      if (terminalCommitMessage) {
        ended = true;
        removeListeners();
        return;
      }
      if (notifyScanner) post(buildQrScannerCancelledMessage(requestId, 'Scan cancelled.'));
      ended = true;
      removeListeners();
      cancelPreparedSession(reason);
    };

    const cleanup: ActiveScannerCleanup = () => {
      endWithoutCommit('closed', false);
    };

    const handleFinish = (commitRequestId: string): void => {
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.finishReceived', {
        fieldPath: launchTarget.fieldPath,
        commitRequestId,
        duplicate: commitInFlight || Boolean(terminalCommitMessage)
      });
      if (ended) return;
      if (terminalCommitMessage) {
        post(terminalCommitMessage);
        return;
      }
      if (commitInFlight) {
        post(buildQrScannerCommitMessage(requestId, { status: 'committing', message: 'Adding checked receipts...' }));
        return;
      }
      stableCommitRequestId ||= commitRequestId;
      commitInFlight = true;
      post(buildQrScannerCommitMessage(requestId, { status: 'committing', message: 'Adding checked receipts...' }));
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.commitStart', {
        fieldPath: launchTarget.fieldPath,
        commitRequestId: stableCommitRequestId
      });
      void (async () => {
        try {
          await scanChain;
          const ready = await sessionPromise;
          if (ended) return;
          const committed = await commitQrScannerSession(ready.credentials, stableCommitRequestId!);
          if (ended) return;
          completeCommittedSession(committed.result, 'commit');
        } catch (error) {
          if (ended) return;
          commitInFlight = false;
          const failure = errorDetails(error);
          await reconcileSession('commitFailure');
          if (ended) return;
          post(
            buildQrScannerCommitMessage(requestId, {
              status: 'error',
              message: failure.message || 'The receipts could not be added. Try again.'
            })
          );
          latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.commitFailed', {
            fieldPath: launchTarget.fieldPath,
            code: failure.code,
            retryable: failure.retryable
          });
        }
      })();
    };

    function handleResume(): void {
      void reconcileSession('resume');
    }

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
          break;
        case QR_SCANNER_MESSAGE_TYPES.scan:
          if (terminalCommitMessage) {
            post(terminalCommitMessage);
            return;
          }
          scannerReady = true;
          sendSetup();
          enqueueScan(message);
          break;
        case QR_SCANNER_MESSAGE_TYPES.finish:
          handleFinish(message.commitRequestId);
          break;
        case QR_SCANNER_MESSAGE_TYPES.cancel:
          endWithoutCommit('cancelled', true);
          break;
        case QR_SCANNER_MESSAGE_TYPES.closed:
          endWithoutCommit('closed', false);
          break;
        default:
          break;
      }
    }

    void sessionPromise.catch(error => {
      if (ended) return;
      const failure = errorDetails(error);
      const terminalFailure = {
        code: failure.code,
        message: `${failure.message} Close this scanner and start again from the form.`
      };
      post(buildQrScannerErrorMessage(requestId, { ...terminalFailure, retryable: false }));
      latestRef.current.onDiagnostic?.('upload.linkCapture.externalScanner.sessionFailed', {
        fieldPath: launchTarget.fieldPath,
        code: failure.code,
        retryable: false
      });
      ended = true;
      removeListeners();
      finishHold('failed');
    });

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleResume);
    window.addEventListener('pageshow', handleResume);
    scannerWindow = window.open(scannerLaunch.url, SCANNER_WINDOW_NAME, 'popup,width=480,height=760');
    if (!scannerWindow) {
      ended = true;
      removeListeners();
      current.onDiagnostic?.('upload.linkCapture.externalScanner.blocked', { fieldPath: current.fieldPath });
      current.onUnavailable?.('Could not open the scanner window. Allow popups and try again.');
      return false;
    }

    timeoutId = window.setTimeout(() => endWithoutCommit('closed', false), SESSION_WINDOW_TIMEOUT_MS);
    activeCleanupRef.current = cleanup;
    // Preserve the user-activation call stack: no asynchronous preparation is
    // started until after window.open has returned successfully.
    startSessionPreparation();
    current.onDiagnostic?.('upload.linkCapture.externalScanner.open', {
      fieldPath: current.fieldPath,
      origin: scannerLaunch.origin
    });
    return true;
  }, []);

  return { available, openScanner };
};
