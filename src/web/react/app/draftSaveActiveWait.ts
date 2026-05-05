import type { MutableRefObject } from 'react';

type DraftSaveFailure = { message: string; recordId?: string | null };

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

export const waitForActiveDraftSaveTransactionsAction = async (args: {
  reason: string;
  timeoutMs?: number;
  autoSaveInFlightRef: MutableRefObject<boolean>;
  draftSaveRequestInFlightRef: MutableRefObject<boolean>;
  draftSaveRequestPromiseRef: MutableRefObject<Promise<any> | null>;
  lastDraftSaveFailureRef: MutableRefObject<DraftSaveFailure | null>;
  logEvent: DiagnosticLogger;
}): Promise<{ ok: boolean; message?: string }> => {
  const {
    reason,
    timeoutMs = 18_000,
    autoSaveInFlightRef,
    draftSaveRequestInFlightRef,
    draftSaveRequestPromiseRef,
    lastDraftSaveFailureRef,
    logEvent
  } = args;
  const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));
  const hasActiveSave = () =>
    Boolean(autoSaveInFlightRef.current || draftSaveRequestInFlightRef.current || draftSaveRequestPromiseRef.current);
  if (!hasActiveSave()) return { ok: true };

  const startedAt = Date.now();
  logEvent('draftSave.activeWait.start', {
    reason,
    autoSaveInFlight: autoSaveInFlightRef.current,
    draftSaveInFlight: draftSaveRequestInFlightRef.current,
    draftSavePromiseInFlight: Boolean(draftSaveRequestPromiseRef.current)
  });

  while (Date.now() - startedAt < timeoutMs) {
    const pendingDraftSave = draftSaveRequestPromiseRef.current;
    if (pendingDraftSave) {
      await Promise.race([pendingDraftSave.catch(() => undefined), sleep(300)]);
    } else {
      await sleep(80);
    }

    if (!hasActiveSave()) {
      const failure = lastDraftSaveFailureRef.current;
      if (failure) {
        const message = failure.message || 'Could not save the latest changes.';
        logEvent('draftSave.activeWait.failed', {
          reason,
          durationMs: Date.now() - startedAt,
          recordId: failure.recordId || null,
          message
        });
        return { ok: false, message };
      }
      logEvent('draftSave.activeWait.done', {
        reason,
        durationMs: Date.now() - startedAt
      });
      return { ok: true };
    }

    await sleep(80);
  }

  const message = 'Could not save the latest changes.';
  logEvent('draftSave.activeWait.timeout', {
    reason,
    durationMs: Date.now() - startedAt,
    autoSaveInFlight: autoSaveInFlightRef.current,
    draftSaveInFlight: draftSaveRequestInFlightRef.current,
    draftSavePromiseInFlight: Boolean(draftSaveRequestPromiseRef.current)
  });
  return { ok: false, message };
};
