import { runUpdateRecordAction } from '../../../src/web/react/features/customActions/updateRecord/runUpdateRecordAction';

describe('runUpdateRecordAction', () => {
  const buildDeps = () => {
    const logEvent = jest.fn();
    const submit = jest.fn().mockResolvedValue({
      success: true,
      meta: {
        id: 'rec-1',
        updatedAt: '2026-04-09T10:00:00.000Z',
        dataVersion: 2,
        rowNumber: 5
      }
    });
    const ensureRecordId = jest.fn().mockImplementation(async () => {
      refs.selectedRecordIdRef.current = 'rec-1';
      return { success: true, recordId: 'rec-1' };
    });
    const flushPendingDraftSave = jest.fn().mockResolvedValue({ ok: true });
    const refs = {
      languageRef: { current: 'EN' },
      valuesRef: { current: {} },
      lineItemsRef: { current: {} },
      selectedRecordIdRef: { current: '' },
      selectedRecordSnapshotRef: { current: null },
      lastSubmissionMetaRef: { current: null },
      recordDataVersionRef: { current: null },
      recordRowNumberRef: { current: null },
      recordSessionRef: { current: 1 },
      uploadQueueRef: { current: new Map() },
      autoSaveInFlightRef: { current: false },
      recordStaleRef: { current: null }
    } as any;
    const deps = {
      definition: { title: 'Meal Production', questions: [] },
      formKey: 'Config: Meal Production',
      submit,
      ensureRecordId,
      flushPendingDraftSave,
      tSystem: (_key: string, _language: string, fallback?: string) => fallback || '',
      logEvent,
      refs,
      setDraftSave: jest.fn(),
      setStatus: jest.fn(),
      setStatusLevel: jest.fn(),
      setLastSubmissionMeta: jest.fn(),
      setSelectedRecordSnapshot: jest.fn(),
      setValues: jest.fn(),
      setView: jest.fn(),
      upsertListCacheRow: jest.fn(),
      busy: {
        lock: jest.fn().mockReturnValue(1),
        setMessage: jest.fn(),
        unlock: jest.fn()
      }
    } as any;
    return { deps, refs, submit, ensureRecordId, flushPendingDraftSave, logEvent };
  };

  test('ensures a draft record id before applying updateRecord when requested', async () => {
    const { deps, submit, ensureRecordId, flushPendingDraftSave, logEvent } = buildDeps();

    await runUpdateRecordAction(deps, {
      buttonId: 'MP_READY_FOR_PRODUCTION',
      buttonRef: 'MP_READY_FOR_PRODUCTION',
      navigateTo: 'form',
      set: { status: 'In production' },
      ensureRecordId: true
    });

    expect(ensureRecordId).toHaveBeenCalledWith({ reason: 'button.updateRecord:MP_READY_FOR_PRODUCTION' });
    expect(flushPendingDraftSave).toHaveBeenCalledWith('button.updateRecord:MP_READY_FOR_PRODUCTION');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toMatchObject({
      id: 'rec-1',
      formKey: 'Config: Meal Production',
      __ckSaveMode: 'draft',
      __ckStatus: 'In production'
    });
    expect(logEvent).toHaveBeenCalledWith(
      'button.updateRecord.ensureRecordId.success',
      expect.objectContaining({ buttonId: 'MP_READY_FOR_PRODUCTION', recordId: 'rec-1' })
    );
    expect(logEvent).not.toHaveBeenCalledWith('button.updateRecord.blocked.noRecord', expect.anything());
  });

  test('stops before submit when ensureRecordId fails', async () => {
    const { deps, submit, ensureRecordId, logEvent } = buildDeps();
    ensureRecordId.mockResolvedValueOnce({ success: false, message: 'Checking duplicates…' });

    await runUpdateRecordAction(deps, {
      buttonId: 'MP_READY_FOR_PRODUCTION',
      buttonRef: 'MP_READY_FOR_PRODUCTION',
      navigateTo: 'form',
      set: { status: 'In production' },
      ensureRecordId: true
    });

    expect(submit).not.toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith('Checking duplicates…');
    expect(logEvent).toHaveBeenCalledWith(
      'button.updateRecord.ensureRecordId.failed',
      expect.objectContaining({ buttonId: 'MP_READY_FOR_PRODUCTION', message: 'Checking duplicates…' })
    );
  });

  test('stops before submit when pending draft save flush fails', async () => {
    const { deps, submit, flushPendingDraftSave, logEvent } = buildDeps();
    flushPendingDraftSave.mockResolvedValueOnce({ ok: false, message: 'Could not save the latest changes.' });

    await runUpdateRecordAction(deps, {
      buttonId: 'MP_READY_FOR_PRODUCTION',
      buttonRef: 'MP_READY_FOR_PRODUCTION',
      navigateTo: 'form',
      set: { status: 'In production' },
      ensureRecordId: true
    });

    expect(submit).not.toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith('Could not save the latest changes.');
    expect(logEvent).toHaveBeenCalledWith(
      'button.updateRecord.flushPending.failed',
      expect.objectContaining({ buttonId: 'MP_READY_FOR_PRODUCTION', message: 'Could not save the latest changes.' })
    );
  });

  test('patches local status values and snapshot after a status update', async () => {
    const { deps, refs } = buildDeps();
    refs.selectedRecordIdRef.current = 'rec-1';
    refs.valuesRef.current = { status: 'In progress', MP_DISTRIBUTOR: 'Le Phare' };
    refs.selectedRecordSnapshotRef.current = {
      id: 'rec-1',
      formKey: 'Config: Meal Production',
      language: 'EN',
      status: 'In progress',
      values: { status: 'In progress', MP_DISTRIBUTOR: 'Le Phare' },
      lineItems: {}
    };
    refs.lastSubmissionMetaRef.current = { id: 'rec-1', status: 'In progress', dataVersion: 1 };

    await runUpdateRecordAction(deps, {
      buttonId: 'MP_READY_FOR_PRODUCTION',
      buttonRef: 'MP_READY_FOR_PRODUCTION',
      navigateTo: 'form',
      set: { status: 'In production' }
    });

    expect(refs.valuesRef.current.status).toBe('In production');
    expect(refs.selectedRecordSnapshotRef.current?.status).toBe('In production');
    expect(refs.selectedRecordSnapshotRef.current?.values?.status).toBe('In production');
    expect(refs.lastSubmissionMetaRef.current?.status).toBe('In production');
    const patcher = deps.setValues.mock.calls.find(([arg]: any[]) => typeof arg === 'function')?.[0];
    expect(patcher({ status: 'In progress', MP_DISTRIBUTOR: 'Le Phare' })).toMatchObject({
      status: 'In production',
      MP_DISTRIBUTOR: 'Le Phare'
    });
  });
});
