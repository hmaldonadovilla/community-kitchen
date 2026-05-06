const { SubmitEffectsRepository } = require('../cloud-run/api/repositories/submitEffectsRepository');

describe('Cloud Run SubmitEffectsRepository', () => {
  test('skips final-submit reservation reconciliation when guided record has no reservation selections', async () => {
    const reconcile = jest.fn();
    const repository = new SubmitEffectsRepository({
      inventoryReservationRepository: { reconcile }
    });
    const form = {
      reservationLifecycle: {
        ledgerFormKey: 'Config: Inventory Reservation Ledger',
        reconcileOnFinalSubmit: {
          enabled: true,
          ledgerFormKey: 'Config: Inventory Reservation Ledger',
          refreshMode: 'revisionOnly'
        }
      },
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftovers',
            include: [
              {
                kind: 'lineGroup',
                id: 'Q2',
                dataSourceRows: [
                  {
                    outputGroupId: 'LEFTOVER_ROWS',
                    outputKeyFieldId: 'LEFTOVER_ID',
                    quantityFieldId: 'LEFTOVER_USE_QTY',
                    reservation: {
                      enabled: true,
                      commitMode: 'step',
                      resourceRecordIdFieldId: 'LEFTOVER_RECORD_ID'
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    const result = await repository.applyReservationLifecycle(
      form,
      'Config: Meal Production',
      {
        id: 'meal-1',
        __ckStatus: 'Closed',
        Q2_json: JSON.stringify([{ __ckRowId: 'ROW-1', LEFTOVER_ROWS: [] }])
      },
      { success: true, meta: { id: 'meal-1' } }
    );

    expect(result.success).toBe(true);
    expect(reconcile).not.toHaveBeenCalled();
    expect(result.meta.reservationReconciliation).toEqual({
      success: true,
      sourceRecordId: 'meal-1',
      reconciledReservations: 0,
      consumedReservations: 0,
      releasedReservations: 0,
      touchedInventoryRecords: 0
    });
  });
});
