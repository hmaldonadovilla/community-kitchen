jest.mock('react', () => {
  const react = {
    useCallback: (callback: unknown) => callback
  };
  return { __esModule: true, default: react, ...react };
});

import type { WebFormSubmission } from '../../../src/web/types';
import {
  useQrScannerAppIntegration,
  type QrScannerSubmissionMeta,
  type UseQrScannerAppIntegrationArgs
} from '../../../src/web/react/features/uploads/hooks/useQrScannerAppIntegration';

const successfulLaunch = {
  success: true as const,
  sessionId: 'session-1',
  launchUrl: 'https://scanner.example.test/qr-scanner.html#launchToken=token',
  expiresAt: '2026-07-16T12:00:00.000Z'
};

const createSubmission = (id = 'record-1'): WebFormSubmission => ({
  formKey: 'Config: Meal Production',
  language: 'EN',
  id,
  dataVersion: 4,
  values: { NOTES: 'keep' }
});

const createHarness = (overrides: Partial<UseQrScannerAppIntegrationArgs> = {}) => {
  let valuesState = { NOTES: 'keep' } as Record<string, any>;
  let snapshotState: WebFormSubmission | null = createSubmission();
  let metaState: QrScannerSubmissionMeta | null = { id: 'record-1', dataVersion: 4, status: 'Draft' };

  const setValues = jest.fn((update: any) => {
    valuesState = typeof update === 'function' ? update(valuesState) : update;
  });
  const setSelectedRecordSnapshot = jest.fn((update: any) => {
    snapshotState = typeof update === 'function' ? update(snapshotState) : update;
  });
  const setLastSubmissionMeta = jest.fn((update: any) => {
    metaState = typeof update === 'function' ? update(metaState) : update;
  });

  const args: UseQrScannerAppIntegrationArgs = {
    formKey: 'Config: Meal Production',
    languageRef: { current: 'fr' },
    ensureDraftRecordId: jest.fn(async () => ({ success: true, recordId: 'record-1' })),
    flushPendingDraftSave: jest.fn(async () => ({ ok: true })),
    createSessionLaunch: jest.fn(async () => successfulLaunch),
    logEvent: jest.fn(),
    resolveLogMessage: jest.fn((_error, fallback) => fallback),
    resolveUiErrorMessage: jest.fn((_error, fallback) => fallback),
    setAutoSaveHoldFromUi: jest.fn(),
    scheduleLatestAutoSave: jest.fn(() => 101),
    autoSaveDirtyRef: { current: false },
    autoSaveQueuedRef: { current: false },
    autoSaveTimerRef: { current: null },
    selectedRecordIdRef: { current: 'record-1' },
    selectedRecordSnapshotRef: { current: snapshotState },
    lastSubmissionMetaRef: { current: metaState },
    valuesRef: { current: valuesState },
    lineItemsRef: { current: {} },
    uploadedFieldValueOverridesRef: { current: new Map() },
    recordDataVersionRef: { current: 7 },
    optimisticClientDataVersionRef: { current: 7 },
    setValues,
    setSelectedRecordSnapshot,
    setLastSubmissionMeta,
    rememberAutoSaveSeenState: jest.fn(),
    upsertListCacheRow: jest.fn(),
    markRecordFreshnessServerTouch: jest.fn(),
    ...overrides
  };

  const hook = useQrScannerAppIntegration(args);
  return {
    args,
    hook,
    getValuesState: () => valuesState,
    getSnapshotState: () => snapshotState,
    getMetaState: () => metaState
  };
};

describe('QR scanner app integration hook', () => {
  test('prepares a saved, flushed, versioned scanner session', async () => {
    const harness = createHarness();

    const result = await harness.hook.prepareQrScannerLaunch({
      fieldId: 'ING_EVD',
      fieldPath: 'ING_EVD'
    });

    expect(result).toEqual(successfulLaunch);
    expect(harness.args.ensureDraftRecordId).toHaveBeenCalledWith({
      reason: 'qrScanner.prepare',
      fieldPath: 'ING_EVD'
    });
    expect(harness.args.flushPendingDraftSave).toHaveBeenCalledWith('qrScanner.prepare');
    expect(harness.args.createSessionLaunch).toHaveBeenCalledWith({
      formKey: 'Config: Meal Production',
      recordId: 'record-1',
      fieldId: 'ING_EVD',
      expectedDataVersion: 7,
      language: 'FR',
      returnContext: { overlay: 'files' }
    });
    expect(harness.args.logEvent).toHaveBeenCalledWith(
      'qrScanner.session.prepare.done',
      expect.objectContaining({ fieldId: 'ING_EVD', success: true, code: null })
    );
  });

  test('does not create a session when record preparation or flushing fails', async () => {
    const recordFailure = createHarness({
      ensureDraftRecordId: jest.fn(async () => ({ success: false, message: 'Record unavailable.' }))
    });
    await expect(
      recordFailure.hook.prepareQrScannerLaunch({ fieldId: 'ING_EVD', fieldPath: 'ING_EVD' })
    ).resolves.toEqual({
      success: false,
      code: 'RECORD_NOT_FOUND',
      message: 'Record unavailable.'
    });
    expect(recordFailure.args.flushPendingDraftSave).not.toHaveBeenCalled();
    expect(recordFailure.args.createSessionLaunch).not.toHaveBeenCalled();

    const flushFailure = createHarness({
      flushPendingDraftSave: jest.fn(async () => ({ ok: false, message: 'Save still pending.' }))
    });
    await expect(
      flushFailure.hook.prepareQrScannerLaunch({ fieldId: 'ING_EVD', fieldPath: 'ING_EVD' })
    ).resolves.toEqual({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Save still pending.',
      retryable: true
    });
    expect(flushFailure.args.createSessionLaunch).not.toHaveBeenCalled();
  });

  test('holds autosave for the active scanner and releases queued work on end', () => {
    const harness = createHarness();

    harness.hook.handleQrScannerSessionReady();
    expect(harness.args.setAutoSaveHoldFromUi).toHaveBeenCalledWith(true, { reason: 'qrScannerSession' });

    harness.args.autoSaveDirtyRef.current = true;
    harness.hook.handleQrScannerSessionEnd('closed');
    expect(harness.args.setAutoSaveHoldFromUi).toHaveBeenLastCalledWith(false, { reason: 'qrScannerSession' });
    expect(harness.args.scheduleLatestAutoSave).toHaveBeenCalledWith('qrScanner.closed.release', 0);
    expect(harness.args.logEvent).toHaveBeenCalledWith('qrScanner.session.ended', { reason: 'closed' });
  });

  test('applies an authoritative commit to the active record and caches', () => {
    const harness = createHarness();

    harness.hook.applyQrScannerCommittedUpdate({
      fieldId: 'ING_EVD',
      fieldPath: 'ING_EVD',
      recordId: 'record-1',
      fieldValue: 'https://drive.google.com/file/d/receipt-1/view',
      links: ['https://drive.google.com/file/d/receipt-1/view'],
      linkedCount: 1,
      dataVersion: 8
    });

    expect(harness.args.valuesRef.current).toEqual({
      NOTES: 'keep',
      ING_EVD: 'https://drive.google.com/file/d/receipt-1/view'
    });
    expect(harness.getValuesState()).toEqual(harness.args.valuesRef.current);
    expect(harness.args.uploadedFieldValueOverridesRef.current.get('ING_EVD')).toEqual({
      scope: 'top',
      questionId: 'ING_EVD',
      items: ['https://drive.google.com/file/d/receipt-1/view']
    });
    expect(harness.args.recordDataVersionRef.current).toBe(8);
    expect(harness.args.optimisticClientDataVersionRef.current).toBe(8);
    expect(harness.getSnapshotState()).toEqual(
      expect.objectContaining({
        id: 'record-1',
        dataVersion: 8,
        values: { NOTES: 'keep', ING_EVD: 'https://drive.google.com/file/d/receipt-1/view' }
      })
    );
    expect(harness.getMetaState()).toEqual(expect.objectContaining({ id: 'record-1', dataVersion: 8, status: 'Draft' }));
    expect(harness.args.rememberAutoSaveSeenState).toHaveBeenCalledWith(
      harness.args.valuesRef.current,
      harness.args.lineItemsRef.current
    );
    expect(harness.args.upsertListCacheRow).toHaveBeenCalledWith({
      recordId: 'record-1',
      values: { ING_EVD: 'https://drive.google.com/file/d/receipt-1/view' },
      dataVersion: 8
    });
    expect(harness.args.markRecordFreshnessServerTouch).toHaveBeenCalledWith({
      reason: 'qrScanner.commit',
      recordId: 'record-1'
    });
  });

  test('ignores a commit for a record that is no longer active', () => {
    const harness = createHarness({ selectedRecordIdRef: { current: 'record-2' } });

    harness.hook.applyQrScannerCommittedUpdate({
      fieldId: 'ING_EVD',
      fieldPath: 'ING_EVD',
      recordId: 'record-3',
      fieldValue: 'changed',
      links: ['changed'],
      linkedCount: 1,
      dataVersion: 8
    });

    expect(harness.args.setValues).not.toHaveBeenCalled();
    expect(harness.args.upsertListCacheRow).not.toHaveBeenCalled();
    expect(harness.args.logEvent).toHaveBeenCalledWith('qrScanner.commit.detached', {
      recordId: 'record-3',
      activeRecordId: 'record-2',
      fieldId: 'ING_EVD'
    });
  });

  test('preserves pending autosave bookkeeping while applying a commit', () => {
    const harness = createHarness({
      autoSaveDirtyRef: { current: true },
      autoSaveQueuedRef: { current: true }
    });

    harness.hook.applyQrScannerCommittedUpdate({
      fieldId: 'ING_EVD',
      fieldPath: 'ING_EVD',
      recordId: 'record-1',
      fieldValue: 'receipt',
      links: ['receipt'],
      linkedCount: 1,
      dataVersion: 9
    });

    expect(harness.args.autoSaveDirtyRef.current).toBe(true);
    expect(harness.args.autoSaveQueuedRef.current).toBe(true);
    expect(harness.args.rememberAutoSaveSeenState).not.toHaveBeenCalled();
    expect(harness.args.logEvent).toHaveBeenCalledWith(
      'qrScanner.commit.applied',
      expect.objectContaining({ preservedPendingAutoSave: true })
    );
  });
});
