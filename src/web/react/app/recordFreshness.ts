import type { RecordFreshnessConfig } from '../../../types';
import type { View } from '../types';

export const DEFAULT_RECORD_FRESHNESS_QUIET_WINDOW_MS = 30_000;
export const MIN_RECORD_FRESHNESS_QUIET_WINDOW_MS = 5_000;
export const MAX_RECORD_FRESHNESS_QUIET_WINDOW_MS = 10 * 60_000;
export const RECORD_FRESHNESS_RECENT_INTERACTION_WINDOW_MS = 5_000;

export interface ResolvedRecordFreshnessConfig {
  enabled: boolean;
  quietWindowMs: number;
}

export const resolveRecordFreshnessConfig = (
  value?: RecordFreshnessConfig | null
): ResolvedRecordFreshnessConfig => {
  const quietWindowRaw = Number(value?.quietWindowMs);
  const quietWindowMs = Number.isFinite(quietWindowRaw)
    ? Math.max(MIN_RECORD_FRESHNESS_QUIET_WINDOW_MS, Math.min(MAX_RECORD_FRESHNESS_QUIET_WINDOW_MS, Math.floor(quietWindowRaw)))
    : DEFAULT_RECORD_FRESHNESS_QUIET_WINDOW_MS;
  return {
    enabled: value?.enabled !== false,
    quietWindowMs
  };
};

export const resolveRecordFreshnessTimerDelay = (args: {
  config: ResolvedRecordFreshnessConfig;
  view: View;
  recordId?: string | null;
  hasServerVersion: boolean;
  recordLoading: boolean;
  now: number;
  lastServerActivityAt?: number | null;
}): number | null => {
  if (!args.config.enabled) return null;
  if (args.view !== 'form') return null;
  if (!args.recordId) return null;
  if (!args.hasServerVersion) return null;
  if (args.recordLoading) return null;

  const lastServerActivityAt = Number(args.lastServerActivityAt);
  if (!Number.isFinite(lastServerActivityAt) || lastServerActivityAt <= 0) {
    return args.config.quietWindowMs;
  }
  const ageMs = Math.max(0, args.now - lastServerActivityAt);
  return Math.max(0, args.config.quietWindowMs - ageMs);
};

export const shouldDeferRecordFreshnessSync = (args: {
  dirty: boolean;
  draftSavePhase?: string | null;
  autoSaveQueued?: boolean;
  autoSaveInFlight: boolean;
  draftSaveInFlight: boolean;
  submissionInFlight: boolean;
  uploadInFlight: boolean;
  recordSyncInFlight: boolean;
  guidedStepLiveSyncInFlight: boolean;
  guidedStepBackgroundSyncInFlight: boolean;
  lastUserInteractionAt?: number | null;
  now?: number | null;
}): boolean => resolveRecordFreshnessSyncBlockers(args).length > 0;

export const resolveRecordFreshnessSyncBlockers = (args: {
  dirty: boolean;
  draftSavePhase?: string | null;
  autoSaveQueued?: boolean;
  autoSaveInFlight: boolean;
  draftSaveInFlight: boolean;
  submissionInFlight: boolean;
  uploadInFlight: boolean;
  recordSyncInFlight: boolean;
  guidedStepLiveSyncInFlight: boolean;
  guidedStepBackgroundSyncInFlight: boolean;
  lastUserInteractionAt?: number | null;
  now?: number | null;
}): string[] => {
  const blockers: string[] = [];
  const phase = (args.draftSavePhase || '').toString().trim().toLowerCase();
  const now = Number(args.now);
  const lastUserInteractionAt = Number(args.lastUserInteractionAt);
  const hasRecentUserInteraction =
    Number.isFinite(now) &&
    Number.isFinite(lastUserInteractionAt) &&
    lastUserInteractionAt > 0 &&
    now >= lastUserInteractionAt &&
    now - lastUserInteractionAt <= RECORD_FRESHNESS_RECENT_INTERACTION_WINDOW_MS;
  const dirtyBlocksSync =
    !!args.dirty && (phase === 'dirty' || phase === 'saving' || !!args.autoSaveQueued || hasRecentUserInteraction);

  if (dirtyBlocksSync) {
    if (phase === 'dirty' || phase === 'saving') blockers.push(`draftSave.${phase}`);
    else if (args.autoSaveQueued) blockers.push('autoSave.queued');
    else blockers.push('dirty.recentInteraction');
  }
  if (args.autoSaveInFlight) blockers.push('autoSave.inFlight');
  if (args.draftSaveInFlight) blockers.push('draftSave.inFlight');
  if (args.submissionInFlight) blockers.push('submission.inFlight');
  if (args.uploadInFlight) blockers.push('upload.inFlight');
  if (args.recordSyncInFlight) blockers.push('recordSync.inFlight');
  if (args.guidedStepLiveSyncInFlight) blockers.push('guidedStep.liveSync');
  if (args.guidedStepBackgroundSyncInFlight) blockers.push('guidedStep.backgroundSync');

  return blockers;
};

export const resolveDeferredRecordFreshnessResumeAction = (args: {
  pending?: { recordId?: string | null } | null;
  view: View;
  currentRecordId?: string | null;
  recordLoading: boolean;
  submitting: boolean;
  recordSyncInFlight: boolean;
  blockers: string[];
}): 'none' | 'clear' | 'wait' | 'resume' => {
  if (!args.pending) return 'none';
  if (args.view !== 'form') return 'wait';

  const pendingRecordId = (args.pending.recordId || '').toString().trim();
  const currentRecordId = (args.currentRecordId || '').toString().trim();
  if (!pendingRecordId || !currentRecordId) return 'wait';
  if (pendingRecordId !== currentRecordId) return 'clear';
  if (args.recordLoading || args.submitting || args.recordSyncInFlight) return 'wait';
  if (Array.isArray(args.blockers) && args.blockers.length > 0) return 'wait';
  return 'resume';
};
