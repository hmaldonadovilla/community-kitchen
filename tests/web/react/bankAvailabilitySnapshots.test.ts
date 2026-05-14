import { applyBankAvailabilitySnapshotToRow } from '../../../src/web/react/features/utilisations/availabilitySnapshots';

describe('bank availability snapshots', () => {
  test('updates the source quantity field used by the leftover bank display', () => {
    const sourceRow = {
      id: 'leftover-1',
      LEFTOVER_ID: 'LP-21',
      LEFTOVER_QTY: 0,
      LEFTOVER_STATUS: 'used',
      LEFTOVER_UNIT: 'gr'
    };

    const next = applyBankAvailabilitySnapshotToRow(sourceRow, {
      resourceFormKey: 'Config: Leftover Bank',
      resourceRecordId: 'leftover-1',
      resourceItemId: 'LP-21',
      quantityFieldId: 'LEFTOVER_QTY',
      statusFieldId: 'LEFTOVER_STATUS',
      unitFieldId: 'LEFTOVER_UNIT',
      remainingQuantity: 500,
      freeQuantity: 500,
      currentUtilisationQuantity: 0,
      currentRecordUtilisedQuantity: 0,
      unit: 'gr',
      status: 'available'
    });

    expect(next).toEqual(
      expect.objectContaining({
        LEFTOVER_QTY: 500,
        LEFTOVER_STATUS: 'available',
        LEFTOVER_UNIT: 'gr',
        __ckCurrentRecordUtilisedQuantity: 0,
        __ckServerCurrentRecordUtilisedQuantity: 0,
        __ckCurrentUtilisationQuantity: 0,
        __ckFreeQuantity: 500,
        __ckFreeQuantityAuthoritative: true
      })
    );
  });

  test('returns the existing row reference when the snapshot does not change anything', () => {
    const sourceRow = {
      id: 'leftover-1',
      LEFTOVER_QTY: 500,
      LEFTOVER_STATUS: 'available',
      LEFTOVER_UNIT: 'gr',
      __ckCurrentRecordUtilisedQuantity: 0,
      __ckServerCurrentRecordUtilisedQuantity: 0,
      __ckCurrentUtilisationQuantity: 0,
      __ckFreeQuantity: 500,
      __ckFreeQuantityAuthoritative: true
    };

    const next = applyBankAvailabilitySnapshotToRow(sourceRow, {
      resourceFormKey: 'Config: Leftover Bank',
      resourceRecordId: 'leftover-1',
      quantityFieldId: 'LEFTOVER_QTY',
      statusFieldId: 'LEFTOVER_STATUS',
      unitFieldId: 'LEFTOVER_UNIT',
      remainingQuantity: 500,
      freeQuantity: 500,
      currentUtilisationQuantity: 0,
      currentRecordUtilisedQuantity: 0,
      unit: 'gr',
      status: 'available'
    });

    expect(next).toBe(sourceRow);
  });
});
