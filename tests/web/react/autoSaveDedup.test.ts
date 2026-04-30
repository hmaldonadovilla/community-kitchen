import {
  buildFieldIdMap,
  filterDedupRulesForPrecheck,
  getValueByFieldId,
  hasIncompleteConfiguredFields,
  normalizeFieldIdList,
  resolveDebouncedAutoSaveDelay,
  resolveDedupCheckDialogCopy,
  shouldScheduleAutoSaveAfterPendingFollowup,
  shouldArmAutoSaveForUserEditEvent,
  shouldSuppressPostPersistAutoSave,
  shouldSuppressSelectionEffectInitAutoSave,
  shouldSuppressAutomatedAutoSave,
  shouldRetainPendingDebouncedAutoSave,
  shouldForceAutoSaveOnConfiguredBlur
} from '../../../src/web/react/app/autoSaveDedup';

describe('autoSaveDedup helpers', () => {
  it('normalizes field id list from arrays and CSV', () => {
    expect(normalizeFieldIdList([' INGREDIENT_NAME ', 'created_by', 'INGREDIENT_NAME'])).toEqual([
      'INGREDIENT_NAME',
      'created_by'
    ]);
    expect(normalizeFieldIdList('INGREDIENT_NAME, CREATED_BY , INGREDIENT_NAME')).toEqual([
      'INGREDIENT_NAME',
      'CREATED_BY'
    ]);
  });

  it('builds case-insensitive field id map', () => {
    const map = buildFieldIdMap(['INGREDIENT_NAME']);
    expect(map.INGREDIENT_NAME).toBe(true);
    expect(map.ingredient_name).toBe(true);
  });

  it('reads values with case-insensitive field ids', () => {
    expect(getValueByFieldId({ ingredient_name: 'Tomato' }, 'INGREDIENT_NAME')).toBe('Tomato');
  });

  it('checks incomplete configured autosave fields', () => {
    expect(hasIncompleteConfiguredFields(['CREATED_BY'], { CREATED_BY: '' })).toBe(true);
    expect(hasIncompleteConfiguredFields(['CREATED_BY'], { CREATED_BY: 'Alice' })).toBe(false);
  });

  it('keeps debounced autosave anchored to the last real user interaction', () => {
    expect(
      resolveDebouncedAutoSaveDelay({
        debounceMs: 2000,
        lastUserInteractionAt: 10_000,
        now: 10_600
      })
    ).toBe(1400);

    expect(
      resolveDebouncedAutoSaveDelay({
        debounceMs: 2000,
        lastUserInteractionAt: 10_000,
        now: 12_500
      })
    ).toBe(0);

    expect(
      resolveDebouncedAutoSaveDelay({
        debounceMs: 2000,
        lastUserInteractionAt: null,
        now: 10_600
      })
    ).toBe(2000);
  });

  it('keeps a pending debounced autosave through callback-only rerenders', () => {
    expect(
      shouldRetainPendingDebouncedAutoSave({
        scheduledFingerprint: 'draft:v1',
        latestFingerprint: 'draft:v1'
      })
    ).toBe(true);

    expect(
      shouldRetainPendingDebouncedAutoSave({
        scheduledFingerprint: 'draft:v1',
        latestFingerprint: 'draft:v2'
      })
    ).toBe(false);

    expect(
      shouldRetainPendingDebouncedAutoSave({
        scheduledFingerprint: '',
        latestFingerprint: 'draft:v1'
      })
    ).toBe(false);
  });

  it('suppresses autosave for automated mutations only when no user draft is pending', () => {
    expect(
      shouldSuppressAutomatedAutoSave({
        pendingSource: 'selectionEffectInit',
        dirty: false,
        queued: false,
        inFlight: false
      })
    ).toBe(true);

    expect(
      shouldSuppressAutomatedAutoSave({
        pendingSource: 'selectionEffectInit',
        dirty: true,
        queued: false,
        inFlight: false
      })
    ).toBe(false);

    expect(
      shouldSuppressAutomatedAutoSave({
        pendingSource: '',
        dirty: false,
        queued: false,
        inFlight: false
      })
    ).toBe(false);
  });

  it('suppresses selection-effect init autosave only while clean and before the next user edit', () => {
    expect(
      shouldSuppressSelectionEffectInitAutoSave({
        suppressStartedAtMs: 1_000,
        suppressUntilMs: 31_000,
        nowMs: 5_000,
        lastLocalMutationAtMs: 0,
        hadDirtyAtStart: false
      })
    ).toBe(true);

    expect(
      shouldSuppressSelectionEffectInitAutoSave({
        suppressStartedAtMs: 1_000,
        suppressUntilMs: 31_000,
        nowMs: 5_000,
        lastLocalMutationAtMs: 1_500,
        hadDirtyAtStart: false
      })
    ).toBe(false);

    expect(
      shouldSuppressSelectionEffectInitAutoSave({
        suppressStartedAtMs: 1_000,
        suppressUntilMs: 31_000,
        nowMs: 5_000,
        lastLocalMutationAtMs: 0,
        hadDirtyAtStart: true
      })
    ).toBe(false);
  });

  it('suppresses post-persist autosave only until the next user edit', () => {
    expect(
      shouldSuppressPostPersistAutoSave({
        suppressUntilMs: 31_000,
        nowMs: 5_000,
        lastLocalMutationAtMs: 10_000,
        persistedLocalMutationAtMs: 10_000
      })
    ).toBe(true);

    expect(
      shouldSuppressPostPersistAutoSave({
        suppressUntilMs: 31_000,
        nowMs: 5_000,
        lastLocalMutationAtMs: 10_500,
        persistedLocalMutationAtMs: 10_000
      })
    ).toBe(false);

    expect(
      shouldSuppressPostPersistAutoSave({
        suppressUntilMs: 31_000,
        nowMs: 32_000,
        lastLocalMutationAtMs: 10_000,
        persistedLocalMutationAtMs: 10_000
      })
    ).toBe(false);
  });

  it('arms autosave only for value-changing user edit events', () => {
    expect(
      shouldArmAutoSaveForUserEditEvent({
        event: 'change',
        hasNextValue: true
      })
    ).toBe(true);

    expect(
      shouldArmAutoSaveForUserEditEvent({
        event: undefined,
        hasNextValue: true
      })
    ).toBe(true);

    expect(
      shouldArmAutoSaveForUserEditEvent({
        event: 'blur',
        hasNextValue: false
      })
    ).toBe(false);

    expect(
      shouldArmAutoSaveForUserEditEvent({
        event: 'blur',
        hasNextValue: true
      })
    ).toBe(false);
  });

  it('resumes queued autosave once the matching pending followup settles', () => {
    expect(
      shouldScheduleAutoSaveAfterPendingFollowup({
        autoSaveEnabled: true,
        currentView: 'form',
        currentRecordId: 'REC-1',
        settledRecordId: 'REC-1',
        currentSessionId: 12,
        followupSessionId: 12,
        dirty: true,
        queued: false,
        submitting: false,
        recordStale: false
      })
    ).toBe(true);

    expect(
      shouldScheduleAutoSaveAfterPendingFollowup({
        autoSaveEnabled: true,
        currentView: 'summary',
        currentRecordId: 'REC-1',
        settledRecordId: 'REC-1',
        currentSessionId: 12,
        followupSessionId: 12,
        dirty: false,
        queued: true,
        submitting: false,
        recordStale: false
      })
    ).toBe(true);
  });

  it('does not resume autosave after pending followup for stale, mismatched, or inactive sessions', () => {
    expect(
      shouldScheduleAutoSaveAfterPendingFollowup({
        autoSaveEnabled: true,
        currentView: 'form',
        currentRecordId: 'REC-1',
        settledRecordId: 'REC-2',
        currentSessionId: 12,
        followupSessionId: 12,
        dirty: true,
        queued: false,
        submitting: false,
        recordStale: false
      })
    ).toBe(false);

    expect(
      shouldScheduleAutoSaveAfterPendingFollowup({
        autoSaveEnabled: true,
        currentView: 'list',
        currentRecordId: 'REC-1',
        settledRecordId: 'REC-1',
        currentSessionId: 12,
        followupSessionId: 12,
        dirty: true,
        queued: false,
        submitting: false,
        recordStale: false
      })
    ).toBe(false);

    expect(
      shouldScheduleAutoSaveAfterPendingFollowup({
        autoSaveEnabled: true,
        currentView: 'form',
        currentRecordId: 'REC-1',
        settledRecordId: 'REC-1',
        currentSessionId: 12,
        followupSessionId: 99,
        dirty: true,
        queued: false,
        submitting: false,
        recordStale: false
      })
    ).toBe(false);

    expect(
      shouldScheduleAutoSaveAfterPendingFollowup({
        autoSaveEnabled: true,
        currentView: 'form',
        currentRecordId: 'REC-1',
        settledRecordId: 'REC-1',
        currentSessionId: 12,
        followupSessionId: 12,
        dirty: true,
        queued: false,
        submitting: false,
        recordStale: true
      })
    ).toBe(false);
  });

  it('filters dedup rules using trigger fields', () => {
    const rules = [
      { id: 'name-only', onConflict: 'reject', keys: ['INGREDIENT_NAME'] },
      { id: 'name-and-created', onConflict: 'reject', keys: ['INGREDIENT_NAME', 'CREATED_BY'] },
      { id: 'warn-rule', onConflict: 'warn', keys: ['INGREDIENT_NAME'] }
    ];
    const filtered = filterDedupRulesForPrecheck(rules, ['INGREDIENT_NAME']);
    expect(filtered.map((r: any) => r.id)).toEqual(['name-only']);
  });

  it('resolves dedup check dialog copy with defaults and overrides', () => {
    const copy = resolveDedupCheckDialogCopy(
      {
        checkingTitle: { en: 'Checking ingredient name' },
        availableAutoCloseMs: 1300
      },
      'EN',
      {
        checkingMessage: 'Checking...',
        availableTitle: 'Available',
        availableMessage: 'Continue',
        duplicateTitle: 'Duplicate',
        duplicateMessage: 'Exists'
      }
    );

    expect(copy.enabled).toBe(true);
    expect(copy.checkingTitle).toBe('Checking ingredient name');
    expect(copy.checkingMessage).toBe('Checking...');
    expect(copy.availableAutoCloseMs).toBe(1300);
    expect(copy.duplicateAutoCloseMs).toBe(900);
  });

  it('forces autosave on configured blur when create-flow gate is complete and dedup passed', () => {
    const shouldForce = shouldForceAutoSaveOnConfiguredBlur({
      autoSaveEnabled: true,
      isCreateFlow: true,
      scope: 'top',
      event: 'blur',
      fieldId: 'CREATED_BY',
      fieldPath: 'CREATED_BY',
      enableWhenFieldIds: ['INGREDIENT_NAME', 'CREATED_BY'],
      values: {
        INGREDIENT_NAME: 'Tomato',
        CREATED_BY: 'Que'
      },
      dedupSignature: 'name:tomato',
      lastDedupCheckedSignature: 'name:tomato',
      dedupChecking: false,
      dedupConflict: false,
      dedupHold: false
    });
    expect(shouldForce).toBe(true);
  });

  it('forces autosave on configured blur when dedup hold is stale but signature is settled', () => {
    const shouldForce = shouldForceAutoSaveOnConfiguredBlur({
      autoSaveEnabled: true,
      isCreateFlow: true,
      scope: 'top',
      event: 'blur',
      fieldId: 'CREATED_BY',
      fieldPath: 'CREATED_BY',
      enableWhenFieldIds: ['INGREDIENT_NAME', 'CREATED_BY'],
      values: {
        INGREDIENT_NAME: 'Tomato',
        CREATED_BY: 'Que'
      },
      dedupSignature: 'name:tomato',
      lastDedupCheckedSignature: 'name:tomato',
      dedupChecking: false,
      dedupConflict: false,
      dedupHold: true
    });
    expect(shouldForce).toBe(true);
  });

  it('does not force autosave on configured blur when dedup is not settled', () => {
    const shouldForce = shouldForceAutoSaveOnConfiguredBlur({
      autoSaveEnabled: true,
      isCreateFlow: true,
      scope: 'top',
      event: 'blur',
      fieldId: 'CREATED_BY',
      fieldPath: 'CREATED_BY',
      enableWhenFieldIds: ['INGREDIENT_NAME', 'CREATED_BY'],
      values: {
        INGREDIENT_NAME: 'Tomato',
        CREATED_BY: 'Que'
      },
      dedupSignature: 'name:tomato',
      lastDedupCheckedSignature: '',
      dedupChecking: true,
      dedupConflict: false,
      dedupHold: false
    });
    expect(shouldForce).toBe(false);
  });
});
