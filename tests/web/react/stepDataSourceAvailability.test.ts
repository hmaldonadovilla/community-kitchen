import { buildStepDataSourceAvailabilityOptimisticMutationAction } from '../../../src/web/react/features/lineItems/domain/stepDataSourceAvailability';

describe('step data-source availability helpers', () => {
  const config = {
    rowKeyFieldId: 'LEFTOVER_ID',
    dataSource: { id: 'leftovers' },
    availability: {
      sourceQuantityFieldId: 'remaining'
    }
  };

  test('builds an optimistic cache mutation for the matching source row and item key', () => {
    const mutation = buildStepDataSourceAvailabilityOptimisticMutationAction({
      config,
      sourceRow: {
        id: 'record-1',
        LEFTOVER_ID: 'leftover-1',
        remaining: 10,
        __ckServerCurrentRecordUtilisedQuantity: 1
      },
      sourceKey: 'leftover-1',
      parentRowId: 'parent-1',
      localCurrentRecordUtilisedQuantity: 3,
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 1, currentRowQuantity: 1 }),
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 99, currentRowQuantity: 99 })
    });

    expect(mutation?.dataSourceConfig).toEqual({ id: 'leftovers' });

    const rows = mutation?.updateItems([
      { id: 'record-1', LEFTOVER_ID: 'leftover-1', remaining: 10 },
      { id: 'record-2', LEFTOVER_ID: 'leftover-1', remaining: 10 },
      { id: 'record-1', LEFTOVER_ID: 'leftover-2', remaining: 10 }
    ]);

    expect(rows?.[0]).toMatchObject({
      remaining: 8,
      __ckServerCurrentRecordUtilisedQuantity: 3,
      __ckCurrentRecordUtilisedQuantity: 3,
      __ckFreeQuantity: 8
    });
    expect(rows?.[1]).toEqual({ id: 'record-2', LEFTOVER_ID: 'leftover-1', remaining: 10 });
    expect(rows?.[2]).toEqual({ id: 'record-1', LEFTOVER_ID: 'leftover-2', remaining: 10 });
  });

  test('falls back to current utilisation state when no explicit local total is provided', () => {
    const mutation = buildStepDataSourceAvailabilityOptimisticMutationAction({
      config,
      sourceRow: {
        id: 'record-1',
        LEFTOVER_ID: 'leftover-1',
        remaining: 12
      },
      sourceKey: 'leftover-1',
      parentRowId: 'parent-1',
      serverCurrentRecordUtilisedQuantity: 2,
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 2, currentRowQuantity: 2 }),
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 4, currentRowQuantity: 4 })
    });

    expect(
      mutation?.updateItems([{ id: 'record-1', LEFTOVER_ID: 'leftover-1', remaining: 12 }])[0]
    ).toMatchObject({
      remaining: 10,
      __ckFreeQuantity: 10
    });
  });

  test('returns null when availability cannot be resolved', () => {
    expect(
      buildStepDataSourceAvailabilityOptimisticMutationAction({
        config: { dataSource: { id: 'leftovers' } },
        sourceRow: { id: 'record-1' },
        sourceKey: 'leftover-1',
        parentRowId: 'parent-1',
        resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 0, currentRowQuantity: 0 }),
        resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 0, currentRowQuantity: 0 })
      })
    ).toBeNull();
  });
});
