import { applyInventoryAvailabilitySnapshotToRow } from '../../../src/web/react/features/reservations/availabilitySnapshots';

describe('inventory availability snapshots', () => {
  test('updates the source quantity field used by the leftover bank display', () => {
    const sourceRow = {
      id: 'leftover-1',
      LEFTOVER_ID: 'LP-21',
      LEFTOVER_QTY: 0,
      LEFTOVER_RESERVED_QTY: 1,
      LEFTOVER_STATUS: 'reserved',
      LEFTOVER_UNIT: 'gr'
    };

    const next = applyInventoryAvailabilitySnapshotToRow(sourceRow, {
      resourceFormKey: 'Config: Leftover Inventory',
      resourceRecordId: 'leftover-1',
      resourceItemId: 'LP-21',
      quantityFieldId: 'LEFTOVER_QTY',
      reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
      statusFieldId: 'LEFTOVER_STATUS',
      unitFieldId: 'LEFTOVER_UNIT',
      remainingQuantity: 500,
      reservedQuantity: 0,
      freeQuantity: 500,
      currentReservationQuantity: 0,
      currentRecordReservedQuantity: 0,
      unit: 'gr',
      status: 'available'
    });

    expect(next).toEqual(
      expect.objectContaining({
        LEFTOVER_QTY: 500,
        LEFTOVER_RESERVED_QTY: 0,
        LEFTOVER_STATUS: 'available',
        LEFTOVER_UNIT: 'gr',
        __ckCurrentRecordReservedQuantity: 0,
        __ckCurrentReservationQuantity: 0,
        __ckFreeQuantity: 500
      })
    );
  });

  test('returns the existing row reference when the snapshot does not change anything', () => {
    const sourceRow = {
      id: 'leftover-1',
      LEFTOVER_QTY: 500,
      LEFTOVER_RESERVED_QTY: 0,
      LEFTOVER_STATUS: 'available',
      LEFTOVER_UNIT: 'gr',
      __ckCurrentRecordReservedQuantity: 0,
      __ckCurrentReservationQuantity: 0,
      __ckFreeQuantity: 500
    };

    const next = applyInventoryAvailabilitySnapshotToRow(sourceRow, {
      resourceFormKey: 'Config: Leftover Inventory',
      resourceRecordId: 'leftover-1',
      quantityFieldId: 'LEFTOVER_QTY',
      reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
      statusFieldId: 'LEFTOVER_STATUS',
      unitFieldId: 'LEFTOVER_UNIT',
      remainingQuantity: 500,
      reservedQuantity: 0,
      freeQuantity: 500,
      currentReservationQuantity: 0,
      currentRecordReservedQuantity: 0,
      unit: 'gr',
      status: 'available'
    });

    expect(next).toBe(sourceRow);
  });
});
