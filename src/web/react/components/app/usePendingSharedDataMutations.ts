import { useCallback, useRef } from 'react';

import type { WebFormDefinition } from '../../../types';
import {
  resolveFollowupSharedDataMutationTargetFormKeys,
  resolvePendingSharedDataMutationMatches,
  resolveStepDataSourceTargetFormKeys,
  type PendingSharedDataMutationSummary
} from '../../app/sharedDataMutations';

export type PendingSharedDataMutationOutcome = {
  success: boolean;
  message?: string;
  recordId: string;
  stepId?: string;
  sessionId: number;
  reason: string;
};

export type PendingSharedDataMutationEntry = PendingSharedDataMutationSummary & {
  id: string;
  recordId: string;
  reason: string;
  targetFormKeys: string[];
  startedAt: number;
  promise: Promise<PendingSharedDataMutationOutcome>;
};

/**
 * Owner: app shell shared-data mutation coordination.
 * Tracks background follow-up batches that can mutate shared datasource forms and
 * exposes a narrow waiter for guided-step datasource bootstrap.
 */
export const usePendingSharedDataMutations = (args: {
  definition: WebFormDefinition;
  getCurrentSessionId: () => number;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const { definition, getCurrentSessionId, logEvent } = args;
  const pendingSharedDataMutationsRef = useRef<Map<string, PendingSharedDataMutationEntry>>(new Map());
  const pendingSharedDataMutationSeqRef = useRef<number>(0);

  const trackPendingSharedDataMutation = useCallback(
    (trackArgs: {
      recordId: string;
      reason: string;
      actions: string[];
      promise: Promise<PendingSharedDataMutationOutcome>;
      stepId?: string | null;
    }): string | null => {
      const recordId = `${trackArgs.recordId || ''}`.trim();
      const targetFormKeys = resolveFollowupSharedDataMutationTargetFormKeys({
        definition,
        actions: trackArgs.actions
      });
      if (!recordId || !targetFormKeys.length) return null;
      const id = `sharedData:${pendingSharedDataMutationSeqRef.current + 1}`;
      pendingSharedDataMutationSeqRef.current += 1;
      const startedAt = Date.now();
      const trackedPromise = trackArgs.promise.catch((err: any) => ({
        success: false,
        message: err?.message || err?.toString?.() || 'Shared data mutation failed.',
        recordId,
        stepId: trackArgs.stepId || undefined,
        sessionId: getCurrentSessionId(),
        reason: trackArgs.reason
      }));
      const entry: PendingSharedDataMutationEntry = {
        id,
        recordId,
        stepId: trackArgs.stepId || null,
        reason: trackArgs.reason,
        targetFormKeys,
        startedAt,
        promise: trackedPromise
      };
      pendingSharedDataMutationsRef.current.set(id, entry);
      logEvent('sharedData.mutation.tracked', {
        id,
        recordId,
        stepId: trackArgs.stepId || null,
        reason: trackArgs.reason,
        targetFormKeys,
        actions: trackArgs.actions,
        pendingCount: pendingSharedDataMutationsRef.current.size
      });
      trackedPromise
        .then(outcome => {
          const current = pendingSharedDataMutationsRef.current.get(id);
          if (current?.promise === trackedPromise) {
            pendingSharedDataMutationsRef.current.delete(id);
          }
          logEvent('sharedData.mutation.settled', {
            id,
            recordId,
            stepId: trackArgs.stepId || null,
            reason: trackArgs.reason,
            targetFormKeys,
            success: outcome.success,
            message: outcome.message || null,
            durationMs: Date.now() - startedAt,
            pendingCount: pendingSharedDataMutationsRef.current.size
          });
        })
        .catch(() => undefined);
      return id;
    },
    [definition, getCurrentSessionId, logEvent]
  );

  const waitForPendingSharedDataMutations = useCallback(
    async (waitArgs: {
      targetFormKeys: string[];
      recordId?: string;
      stepId?: string;
      reason: string;
      timeoutMs?: number;
    }): Promise<{ ok: boolean; message?: string }> => {
      const targetFormKeys = resolveStepDataSourceTargetFormKeys(waitArgs.targetFormKeys);
      if (!targetFormKeys.length) return { ok: true };
      const matches = resolvePendingSharedDataMutationMatches({
        pending: Array.from(pendingSharedDataMutationsRef.current.values()),
        targetFormKeys
      }) as PendingSharedDataMutationEntry[];
      if (!matches.length) return { ok: true };
      const timeoutMs = Math.max(1000, Number(waitArgs.timeoutMs || 60000));
      const startedAt = Date.now();
      logEvent('sharedData.mutation.wait.start', {
        reason: waitArgs.reason,
        recordId: waitArgs.recordId || null,
        stepId: waitArgs.stepId || null,
        targetFormKeys,
        pendingCount: matches.length,
        pendingRecordIds: Array.from(new Set(matches.map(entry => entry.recordId).filter(Boolean))),
        pendingReasons: Array.from(new Set(matches.map(entry => entry.reason).filter(Boolean)))
      });
      let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
      const timeoutPromise = new Promise<'timeout'>(resolve => {
        timeoutHandle = globalThis.setTimeout(() => resolve('timeout'), timeoutMs);
      });
      const waitPromise = Promise.all(matches.map(entry => entry.promise));
      const outcome = await Promise.race([waitPromise, timeoutPromise]);
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
      if (outcome === 'timeout') {
        const message = 'Something went wrong while finishing the previous action. Please try again.';
        logEvent('sharedData.mutation.wait.failed', {
          reason: waitArgs.reason,
          recordId: waitArgs.recordId || null,
          stepId: waitArgs.stepId || null,
          targetFormKeys,
          message: 'timeout',
          durationMs: Date.now() - startedAt
        });
        return { ok: false, message };
      }
      const failed = outcome.find(result => !result.success);
      if (failed) {
        const message =
          failed.message || 'Something went wrong while finishing the previous action. Please try again.';
        logEvent('sharedData.mutation.wait.failed', {
          reason: waitArgs.reason,
          recordId: waitArgs.recordId || null,
          stepId: waitArgs.stepId || null,
          targetFormKeys,
          message,
          durationMs: Date.now() - startedAt
        });
        return { ok: false, message };
      }
      logEvent('sharedData.mutation.wait.done', {
        reason: waitArgs.reason,
        recordId: waitArgs.recordId || null,
        stepId: waitArgs.stepId || null,
        targetFormKeys,
        pendingCount: matches.length,
        durationMs: Date.now() - startedAt
      });
      return { ok: true };
    },
    [logEvent]
  );

  return {
    pendingSharedDataMutationsRef,
    trackPendingSharedDataMutation,
    waitForPendingSharedDataMutations
  };
};
