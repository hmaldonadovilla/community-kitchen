import { buildStepDataSourceAvailabilityOptimisticMutationAction } from '../../../src/web/react/components/form/stepDataSourceAvailability';

describe('step data-source availability helpers', () => {
  const config = {
    rowKeyFieldId: 'LEFTOVER_ID',
    dataSource: { id: 'leftovers' },
    availability: {
      sourceQuantityFieldId: 'remaining',
      sourceReservedQuantityFieldId: 'reserved'
    }
  };

  test('builds an optimistic cache mutation for the matching source row and item key', () => {
    const mutation = buildStepDataSourceAvailabilityOptimisticMutationAction({
      config,
      sourceRow: {
        id: 'record-1',
        LEFTOVER_ID: 'leftover-1',
        remaining: 10,
        reserved: 4,
        __ckServerCurrentRecordReservedQuantity: 1
      },
      sourceKey: 'leftover-1',
      parentRowId: 'parent-1',
      localCurrentRecordReservedQuantity: 3,
      resolveCommittedReservationStateForSource: () => ({ totalReservedQuantity: 1, currentRowQuantity: 1 }),
      resolveCurrentReservationStateForSource: () => ({ totalReservedQuantity: 99, currentRowQuantity: 99 })
    });

    expect(mutation?.dataSourceConfig).toEqual({ id: 'leftovers' });

    const rows = mutation?.updateItems([
      { id: 'record-1', LEFTOVER_ID: 'leftover-1', remaining: 10, reserved: 4 },
      { id: 'record-2', LEFTOVER_ID: 'leftover-1', remaining: 10, reserved: 4 },
      { id: 'record-1', LEFTOVER_ID: 'leftover-2', remaining: 10, reserved: 4 }
    ]);

    expect(rows?.[0]).toMatchObject({
      reserved: 6,
      __ckServerCurrentRecordReservedQuantity: 3,
      __ckCurrentRecordReservedQuantity: 3,
      __ckFreeQuantity: 4
    });
    expect(rows?.[1]).toEqual({ id: 'record-2', LEFTOVER_ID: 'leftover-1', remaining: 10, reserved: 4 });
    expect(rows?.[2]).toEqual({ id: 'record-1', LEFTOVER_ID: 'leftover-2', remaining: 10, reserved: 4 });
  });

  test('falls back to current reservation state when no explicit local total is provided', () => {
    const mutation = buildStepDataSourceAvailabilityOptimisticMutationAction({
      config,
      sourceRow: {
        id: 'record-1',
        LEFTOVER_ID: 'leftover-1',
        remaining: 12,
        reserved: 5
      },
      sourceKey: 'leftover-1',
      parentRowId: 'parent-1',
      serverCurrentRecordReservedQuantity: 2,
      resolveCommittedReservationStateForSource: () => ({ totalReservedQuantity: 2, currentRowQuantity: 2 }),
      resolveCurrentReservationStateForSource: () => ({ totalReservedQuantity: 4, currentRowQuantity: 4 })
    });

    expect(
      mutation?.updateItems([{ id: 'record-1', LEFTOVER_ID: 'leftover-1', remaining: 12, reserved: 5 }])[0]
    ).toMatchObject({
      reserved: 7,
      __ckFreeQuantity: 5
    });
  });

  test('returns null when availability cannot be resolved', () => {
    expect(
      buildStepDataSourceAvailabilityOptimisticMutationAction({
        config: { dataSource: { id: 'leftovers' } },
        sourceRow: { id: 'record-1' },
        sourceKey: 'leftover-1',
        parentRowId: 'parent-1',
        resolveCommittedReservationStateForSource: () => ({ totalReservedQuantity: 0, currentRowQuantity: 0 }),
        resolveCurrentReservationStateForSource: () => ({ totalReservedQuantity: 0, currentRowQuantity: 0 })
      })
    ).toBeNull();
  });
});
