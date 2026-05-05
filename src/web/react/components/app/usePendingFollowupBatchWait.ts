import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

type PendingFollowupOutcome = {
  success: boolean;
  message?: string;
  recordId: string;
  sessionId: number;
  reason: string;
};

/**
 * Owner: App shell.
 * Waits for any pending follow-up batch tied to a record and normalizes timeout
 * handling for submit/navigation callers.
 */
export const usePendingFollowupBatchWait = (args: {
  pendingFollowupBatchPromisesRef: MutableRefObject<Map<string, Promise<PendingFollowupOutcome>>>;
  recordSessionRef: MutableRefObject<number>;
  submitPreviousActionRetryMessage: () => string;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const {
    pendingFollowupBatchPromisesRef,
    recordSessionRef,
    submitPreviousActionRetryMessage,
    logEvent
  } = args;

  return useCallback(
    async (waitArgs: { recordId: string; reason: string; timeoutMs?: number }): Promise<{ ok: boolean; message?: string }> => {
      const recordId = (waitArgs.recordId || '').toString().trim();
      if (!recordId) return { ok: true };
      const pending = pendingFollowupBatchPromisesRef.current.get(recordId);
      if (!pending) return { ok: true };
      const timeoutMs = Number.isFinite(Number(waitArgs.timeoutMs)) && Number(waitArgs.timeoutMs) > 0 ? Number(waitArgs.timeoutMs) : 60_000;
      const fallbackMessage = submitPreviousActionRetryMessage();
      const startedAt = Date.now();
      logEvent('followup.pending.wait.begin', {
        reason: waitArgs.reason,
        recordId,
        timeoutMs
      });
      let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<PendingFollowupOutcome>(resolve => {
          timer = globalThis.setTimeout(
            () =>
              resolve({
                success: false,
                message: fallbackMessage,
                recordId,
                sessionId: recordSessionRef.current,
                reason: waitArgs.reason
              }),
            timeoutMs
          );
        });
        const outcome = await Promise.race([pending, timeoutPromise]);
        logEvent('followup.pending.wait.done', {
          reason: waitArgs.reason,
          recordId,
          durationMs: Date.now() - startedAt,
          success: Boolean(outcome?.success)
        });
        if (outcome?.success) return { ok: true };
        return {
          ok: false,
          message: fallbackMessage
        };
      } finally {
        if (timer) {
          globalThis.clearTimeout(timer);
        }
      }
    },
    [logEvent, pendingFollowupBatchPromisesRef, recordSessionRef, submitPreviousActionRetryMessage]
  );
};
