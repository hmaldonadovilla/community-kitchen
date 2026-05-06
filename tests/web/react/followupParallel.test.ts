import {
  areReportFollowupActions,
  buildReconcileFollowupActionResult,
  isReportFollowupAction,
  resolveOptimisticStatusTransitionForActions,
  resolveParallelReconcileFollowupPlan
} from '../../../src/web/react/app/followupParallel';

describe('followupParallel', () => {
  test('plans reconciliation in parallel with pdf/email for reservation-backed forms', () => {
    const plan = resolveParallelReconcileFollowupPlan({
      formKey: 'Config: Meal Production',
      recordId: 'meal-1',
      actions: ['RECONCILE_RESERVATIONS', 'CREATE_PDF', 'SEND_EMAIL'],
      definition: {
        title: 'Meal Production',
        destinationTab: 'Meal Production Responses',
        languages: ['EN'],
        questions: [],
        reservationLifecycle: {
          ledgerFormKey: 'Config: Inventory Reservation Ledger',
          reconcileOnFinalSubmit: {
            enabled: true,
            refreshMode: 'revisionOnly'
          }
        }
      } as any
    });

    expect(plan).toEqual({
      reconcileAction: 'RECONCILE_RESERVATIONS',
      createPdfAction: 'CREATE_PDF',
      sendEmailAction: 'SEND_EMAIL',
      request: {
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'meal-1',
        ledgerFormKey: 'Config: Inventory Reservation Ledger',
        mode: 'consume',
        refreshMode: 'revisionOnly'
      }
    });
  });

  test('does not split close-record batches because close mutates the source record', () => {
    const plan = resolveParallelReconcileFollowupPlan({
      formKey: 'Config: Meal Production',
      recordId: 'meal-1',
      actions: ['CLOSE_RECORD', 'RECONCILE_RESERVATIONS', 'CREATE_PDF'],
      definition: {
        title: 'Meal Production',
        destinationTab: 'Meal Production Responses',
        languages: ['EN'],
        questions: [],
        reservationLifecycle: {
          reconcileOnFinalSubmit: true
        }
      } as any
    });

    expect(plan).toBeNull();
  });

  test('identifies report follow-up actions that can rely on server-side record lookups', () => {
    expect(isReportFollowupAction('create_pdf')).toBe(true);
    expect(areReportFollowupActions(['RECONCILE_RESERVATIONS', 'CREATE_PDF', 'SEND_EMAIL'])).toBe(true);
    expect(areReportFollowupActions(['CREATE_PDF', 'SEND_EMAIL'])).toBe(true);
    expect(areReportFollowupActions(['CLOSE_RECORD', 'CREATE_PDF'])).toBe(false);
    expect(areReportFollowupActions([])).toBe(false);
  });

  test('optimistically shows pdf-created while email is only queued', () => {
    expect(resolveOptimisticStatusTransitionForActions(['CREATE_PDF', 'SEND_EMAIL'])).toBe('onPdf');
    expect(resolveOptimisticStatusTransitionForActions(['RECONCILE_RESERVATIONS', 'CREATE_PDF', 'SEND_EMAIL'])).toBe('onPdf');
    expect(resolveOptimisticStatusTransitionForActions(['SEND_EMAIL'])).toBe('onEmail');
    expect(resolveOptimisticStatusTransitionForActions(['CLOSE_RECORD', 'SEND_EMAIL'])).toBe('onClose');
  });

  test('builds a follow-up-shaped reconciliation result with timing', () => {
    const result = buildReconcileFollowupActionResult({
      recordId: 'meal-1',
      durationMs: 1234.4,
      result: {
        success: true,
        message: 'ok',
        reconciledReservations: 2,
        consumedReservations: 1,
        releasedReservations: 1,
        touchedInventoryRecords: 1
      }
    });

    expect(result).toEqual({
      success: true,
      durationMs: 1234,
      reservationReconciliation: {
        success: true,
        sourceRecordId: 'meal-1',
        reconciledReservations: 2,
        consumedReservations: 1,
        releasedReservations: 1,
        touchedInventoryRecords: 1
      }
    });
  });
});
