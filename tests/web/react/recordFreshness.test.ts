import {
  DEFAULT_RECORD_FRESHNESS_QUIET_WINDOW_MS,
  RECORD_FRESHNESS_RECENT_INTERACTION_WINDOW_MS,
  resolveDeferredRecordFreshnessResumeAction,
  resolveRecordFreshnessMetaOnlyAdoptionRule,
  resolveRecordFreshnessConfig,
  resolveRecordFreshnessSyncBlockers,
  resolveRecordFreshnessTimerDelay,
  shouldDeferRecordFreshnessSync
} from '../../../src/web/react/app/recordFreshness';

describe('recordFreshness helpers', () => {
  test('defaults to an enabled 30-second quiet window', () => {
    expect(resolveRecordFreshnessConfig()).toEqual({
      enabled: true,
      quietWindowMs: DEFAULT_RECORD_FRESHNESS_QUIET_WINDOW_MS,
      metaOnlyAdoptionRules: []
    });
  });

  test('clamps configured quiet windows to supported bounds', () => {
    expect(resolveRecordFreshnessConfig({ quietWindowMs: 1000 })).toEqual({
      enabled: true,
      quietWindowMs: 5000,
      metaOnlyAdoptionRules: []
    });
    expect(resolveRecordFreshnessConfig({ quietWindowMs: 20 * 60_000 })).toEqual({
      enabled: true,
      quietWindowMs: 10 * 60_000,
      metaOnlyAdoptionRules: []
    });
  });

  test('resolves step-scoped meta-only adoption rules', () => {
    const config = resolveRecordFreshnessConfig({
      metaOnlyAdoptionRules: [{ stepId: 'leftovers', compareAgainst: 'lastAppliedSnapshot' }]
    });
    expect(resolveRecordFreshnessMetaOnlyAdoptionRule({ config, stepId: 'leftovers' })).toEqual({
      stepId: 'leftovers',
      compareAgainst: 'lastAppliedSnapshot'
    });
    expect(resolveRecordFreshnessMetaOnlyAdoptionRule({ config, stepId: 'production' })).toBeNull();
  });

  test('returns the remaining delay before the next heartbeat', () => {
    const config = resolveRecordFreshnessConfig({ quietWindowMs: 30_000 });
    expect(
      resolveRecordFreshnessTimerDelay({
        config,
        view: 'form',
        recordId: 'rec-1',
        hasServerVersion: true,
        recordLoading: false,
        now: 90_000,
        lastServerActivityAt: 75_000
      })
    ).toBe(15_000);
  });

  test('does not schedule when the record is not eligible for freshness checks', () => {
    const config = resolveRecordFreshnessConfig({ enabled: false, quietWindowMs: 30_000 });
    expect(
      resolveRecordFreshnessTimerDelay({
        config,
        view: 'form',
        recordId: 'rec-1',
        hasServerVersion: true,
        recordLoading: false,
        now: 90_000,
        lastServerActivityAt: 75_000
      })
    ).toBeNull();
    expect(
      resolveRecordFreshnessTimerDelay({
        config: resolveRecordFreshnessConfig({ quietWindowMs: 30_000 }),
        view: 'list',
        recordId: 'rec-1',
        hasServerVersion: true,
        recordLoading: false,
        now: 90_000,
        lastServerActivityAt: 75_000
      })
    ).toBeNull();
  });

  test('defers auto-sync while there is local record work in flight', () => {
    expect(
      shouldDeferRecordFreshnessSync({
        dirty: false,
        draftSavePhase: 'saved',
        autoSaveQueued: false,
        autoSaveInFlight: false,
        draftSaveInFlight: false,
        submissionInFlight: false,
        uploadInFlight: false,
        recordSyncInFlight: false,
        guidedStepLiveSyncInFlight: false,
        guidedStepBackgroundSyncInFlight: false,
        lastUserInteractionAt: 0,
        now: 90_000
      })
    ).toBe(false);
    expect(
      shouldDeferRecordFreshnessSync({
        dirty: true,
        draftSavePhase: 'dirty',
        autoSaveQueued: false,
        autoSaveInFlight: false,
        draftSaveInFlight: false,
        submissionInFlight: false,
        uploadInFlight: false,
        recordSyncInFlight: false,
        guidedStepLiveSyncInFlight: false,
        guidedStepBackgroundSyncInFlight: false,
        lastUserInteractionAt: 0,
        now: 90_000
      })
    ).toBe(true);
  });

  test('does not let stale synthetic dirty flags block auto-sync forever', () => {
    expect(
      resolveRecordFreshnessSyncBlockers({
        dirty: true,
        draftSavePhase: 'saved',
        autoSaveQueued: false,
        autoSaveInFlight: false,
        draftSaveInFlight: false,
        submissionInFlight: false,
        uploadInFlight: false,
        recordSyncInFlight: false,
        guidedStepLiveSyncInFlight: false,
        guidedStepBackgroundSyncInFlight: false,
        lastUserInteractionAt: 10_000,
        now: 10_000 + RECORD_FRESHNESS_RECENT_INTERACTION_WINDOW_MS + 1
      })
    ).toEqual([]);
  });

  test('still blocks auto-sync for very recent user edits even before the draft badge flips', () => {
    expect(
      resolveRecordFreshnessSyncBlockers({
        dirty: true,
        draftSavePhase: 'saved',
        autoSaveQueued: false,
        autoSaveInFlight: false,
        draftSaveInFlight: false,
        submissionInFlight: false,
        uploadInFlight: false,
        recordSyncInFlight: false,
        guidedStepLiveSyncInFlight: false,
        guidedStepBackgroundSyncInFlight: false,
        lastUserInteractionAt: 10_000,
        now: 10_000 + RECORD_FRESHNESS_RECENT_INTERACTION_WINDOW_MS - 1
      })
    ).toEqual(['dirty.recentInteraction']);
  });

  test('clears deferred sync when the user has moved to another record', () => {
    expect(
      resolveDeferredRecordFreshnessResumeAction({
        pending: { recordId: 'rec-1' },
        view: 'form',
        currentRecordId: 'rec-2',
        recordLoading: false,
        submitting: false,
        recordSyncInFlight: false,
        blockers: []
      })
    ).toBe('clear');
  });

  test('waits while ref-backed record blockers are still active', () => {
    expect(
      resolveDeferredRecordFreshnessResumeAction({
        pending: { recordId: 'rec-1' },
        view: 'form',
        currentRecordId: 'rec-1',
        recordLoading: false,
        submitting: false,
        recordSyncInFlight: false,
        blockers: ['guidedStep.liveSync']
      })
    ).toBe('wait');
  });

  test('resumes deferred sync as soon as the current record is unblocked', () => {
    expect(
      resolveDeferredRecordFreshnessResumeAction({
        pending: { recordId: 'rec-1' },
        view: 'form',
        currentRecordId: 'rec-1',
        recordLoading: false,
        submitting: false,
        recordSyncInFlight: false,
        blockers: []
      })
    ).toBe('resume');
  });
});
