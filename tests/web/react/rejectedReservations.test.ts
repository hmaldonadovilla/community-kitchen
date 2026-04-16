import { buildRejectedStepReservationEntries } from '../../../src/web/react/features/reservations/rejectedReservations';

describe('buildRejectedStepReservationEntries', () => {
  test('returns plan reservations that match rejected availability snapshots', () => {
    const result = buildRejectedStepReservationEntries({
      plan: {
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'record-1',
        reservations: [
          {
            resourceFormKey: 'Config: Leftover Inventory',
            resourceRecordId: 'leftover::94',
            resourceItemId: 'LE-94',
            sourceParentGroupId: 'MP_MEALS_REQUEST',
            sourceParentRowId: 'meal-row',
            sourceOutputGroupId: 'MP_TYPE_LI',
            sourceOutputRowId: 'output-row-1',
            sourceOutputKeyFieldId: 'LEFTOVER_ID',
            quantity: 5
          },
          {
            resourceFormKey: 'Config: Leftover Inventory',
            resourceRecordId: 'leftover::95',
            resourceItemId: 'LE-95',
            sourceParentGroupId: 'MP_MEALS_REQUEST',
            sourceParentRowId: 'meal-row',
            sourceOutputGroupId: 'MP_TYPE_LI',
            sourceOutputRowId: 'output-row-2',
            sourceOutputKeyFieldId: 'LEFTOVER_ID',
            quantity: 2
          }
        ]
      },
      availability: [
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'leftover::94',
          resourceItemId: 'LE-94',
          quantityFieldId: 'LEFTOVER_PORTIONS',
          reservedQuantityFieldId: 'LEFTOVER_RESERVED_PORTIONS',
          remainingQuantity: 0,
          reservedQuantity: 0,
          freeQuantity: 0,
          currentReservationQuantity: 5,
          currentRecordReservedQuantity: 0
        } as any
      ]
    });

    expect(result).toEqual([
      {
        sourceParentGroupId: 'MP_MEALS_REQUEST',
        sourceParentRowId: 'meal-row',
        sourceOutputGroupId: 'MP_TYPE_LI',
        sourceOutputRowId: 'output-row-1',
        sourceOutputKeyFieldId: 'LEFTOVER_ID',
        resourceRecordId: 'leftover::94',
        resourceItemId: 'LE-94'
      }
    ]);
  });

  test('dedupes repeated rejected availability for the same reservation target', () => {
    const result = buildRejectedStepReservationEntries({
      plan: {
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'record-1',
        reservations: [
          {
            resourceFormKey: 'Config: Leftover Inventory',
            resourceRecordId: 'leftover::22',
            resourceItemId: 'LP-22',
            sourceParentGroupId: 'MP_MEALS_REQUEST',
            sourceParentRowId: 'meal-row',
            sourceOutputGroupId: 'MP_TYPE_LI',
            sourceOutputRowId: 'output-row-1',
            sourceOutputKeyFieldId: 'LEFTOVER_ID',
            quantity: 500
          }
        ]
      },
      availability: [
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'leftover::22',
          resourceItemId: 'LP-22',
          quantityFieldId: 'LEFTOVER_QTY',
          reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
          remainingQuantity: 0,
          reservedQuantity: 0,
          freeQuantity: 0,
          currentReservationQuantity: 500,
          currentRecordReservedQuantity: 0
        } as any,
        {
          resourceFormKey: 'Config: Leftover Inventory',
          resourceRecordId: 'leftover::22',
          resourceItemId: 'LP-22',
          quantityFieldId: 'LEFTOVER_QTY',
          reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
          remainingQuantity: 0,
          reservedQuantity: 0,
          freeQuantity: 0,
          currentReservationQuantity: 500,
          currentRecordReservedQuantity: 0
        } as any
      ]
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        resourceRecordId: 'leftover::22',
        resourceItemId: 'LP-22',
        sourceParentRowId: 'meal-row'
      })
    );
  });
});
