import {
  buildRejectedStepUtilisationEntries,
  resolveRejectedStepUtilisationSourceRow
} from '../../../src/web/react/features/utilisations/rejectedUtilisations';

describe('buildRejectedStepUtilisationEntries', () => {
  test('returns plan utilisations that match rejected availability snapshots', () => {
    const result = buildRejectedStepUtilisationEntries({
      plan: {
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'record-1',
        utilisations: [
          {
            resourceFormKey: 'Config: Leftover Bank',
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
            resourceFormKey: 'Config: Leftover Bank',
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
          resourceFormKey: 'Config: Leftover Bank',
          resourceRecordId: 'leftover::94',
          resourceItemId: 'LE-94',
          quantityFieldId: 'LEFTOVER_PORTIONS',
          remainingQuantity: 0,
          freeQuantity: 0,
          currentUtilisationQuantity: 5,
          currentRecordUtilisedQuantity: 0
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

  test('dedupes repeated rejected availability for the same utilisation target', () => {
    const result = buildRejectedStepUtilisationEntries({
      plan: {
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'record-1',
        utilisations: [
          {
            resourceFormKey: 'Config: Leftover Bank',
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
          resourceFormKey: 'Config: Leftover Bank',
          resourceRecordId: 'leftover::22',
          resourceItemId: 'LP-22',
          quantityFieldId: 'LEFTOVER_QTY',
          remainingQuantity: 0,
          freeQuantity: 0,
          currentUtilisationQuantity: 500,
          currentRecordUtilisedQuantity: 0
        } as any,
        {
          resourceFormKey: 'Config: Leftover Bank',
          resourceRecordId: 'leftover::22',
          resourceItemId: 'LP-22',
          quantityFieldId: 'LEFTOVER_QTY',
          remainingQuantity: 0,
          freeQuantity: 0,
          currentUtilisationQuantity: 500,
          currentRecordUtilisedQuantity: 0
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

describe('resolveRejectedStepUtilisationSourceRow', () => {
  test('uses the cached datasource row when it is still present', () => {
    const sourceRow = resolveRejectedStepUtilisationSourceRow({
      config: { rowKeyFieldId: 'LEFTOVER_ID' },
      entry: {
        resourceRecordId: 'bank-row-1',
        resourceItemId: 'LE-1'
      },
      cachedItems: [
        { id: 'bank-row-1', LEFTOVER_ID: 'LE-1', LEFTOVER_PORTIONS: 4 },
        { id: 'bank-row-2', LEFTOVER_ID: 'LE-2', LEFTOVER_PORTIONS: 8 }
      ]
    });

    expect(sourceRow).toEqual({ id: 'bank-row-1', LEFTOVER_ID: 'LE-1', LEFTOVER_PORTIONS: 4 });
  });

  test('falls back to the conflict payload when the datasource cache is stale or filtered', () => {
    const sourceRow = resolveRejectedStepUtilisationSourceRow({
      config: { rowKeyFieldId: 'LEFTOVER_ID' },
      entry: {
        resourceRecordId: 'bank-row-1',
        resourceItemId: 'LE-1'
      },
      cachedItems: []
    });

    expect(sourceRow).toEqual({ id: 'bank-row-1', LEFTOVER_ID: 'LE-1' });
  });
});
