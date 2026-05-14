import {
  buildVirtualDataSourceRowValuesAction,
  resolveServerCurrentRecordUtilisedQuantityFromRow
} from '../../../src/web/react/features/lineItems/domain/virtualDataSourceRowValues';

describe('virtual data source row value helpers', () => {
  const emptyUtilisationState = () => ({ totalUtilisedQuantity: 0, currentRowQuantity: 0 });

  test('resolves server current-record utilised quantity markers with fallback support', () => {
    expect(
      resolveServerCurrentRecordUtilisedQuantityFromRow(
        { __ckServerCurrentRecordUtilisedQuantity: '3', __ckCurrentRecordUtilisedQuantity: '8' },
        1
      )
    ).toBe(3);

    expect(
      resolveServerCurrentRecordUtilisedQuantityFromRow({ __ckCurrentRecordUtilisedQuantity: '2' }, 1)
    ).toBe(2);

    expect(resolveServerCurrentRecordUtilisedQuantityFromRow({ id: 'source-1' }, 4)).toBe(4);
  });

  test('projects mapped source, output, draft, and selected values with expected precedence', () => {
    const values = buildVirtualDataSourceRowValuesAction({
      config: {
        sourceFieldMapping: { recipeName: 'name', notes: 'missing' },
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity'
      },
      sourceRow: {
        id: 'source-1',
        name: 'Chili',
        quantity: 3,
        directOnly: 'source value'
      },
      outputRow: {
        id: 'row-1',
        values: {
          recipeName: 'Saved Chili',
          quantity: '2'
        }
      } as any,
      draftValues: {
        quantity: '4',
        selected: false
      },
      resolveCurrentUtilisationStateForSource: emptyUtilisationState,
      resolveCommittedUtilisationStateForSource: emptyUtilisationState
    });

    expect(values).toMatchObject({
      id: 'source-1',
      recipeName: 'Saved Chili',
      directOnly: 'source value',
      quantity: '4',
      selected: false
    });
    expect(values.notes).toBeUndefined();
  });

  test('projects optimistic availability display and max values', () => {
    const values = buildVirtualDataSourceRowValuesAction({
      config: {
        rowKeyFieldId: 'LEFTOVER_ID',
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        availability: {
          sourceQuantityFieldId: 'remaining',
          targetQuantityFieldId: 'freeQuantity',
          targetMaxQuantityFieldId: 'maxQuantity',
          targetFreeQuantityFieldId: 'displayFreeQuantity'
        }
      },
      sourceRow: {
        id: 'source-1',
        LEFTOVER_ID: 'leftover-1',
        remaining: 10,
        __ckServerCurrentRecordUtilisedQuantity: 1
      },
      outputRow: {
        id: 'row-1',
        values: {
          quantity: '5'
        }
      } as any,
      parentRowId: 'parent-1',
      resolveCurrentUtilisationStateForSource: (_config, sourceKey, parentRowId) => {
        expect(sourceKey).toBe('leftover-1');
        expect(parentRowId).toBe('parent-1');
        return { totalUtilisedQuantity: 3, currentRowQuantity: 5 };
      },
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 1, currentRowQuantity: 5 })
    });

    expect(values.freeQuantity).toBe(8);
    expect(values.displayFreeQuantity).toBe(8);
    expect(values.maxQuantity).toBe(13);
  });

  test('keeps max at true availability when the current draft exceeds available stock', () => {
    const values = buildVirtualDataSourceRowValuesAction({
      config: {
        rowKeyFieldId: 'LEFTOVER_ID',
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        availability: {
          sourceQuantityFieldId: 'remaining',
          targetQuantityFieldId: 'freeQuantity',
          targetMaxQuantityFieldId: 'maxQuantity'
        }
      },
      sourceRow: {
        LEFTOVER_ID: 'leftover-1',
        remaining: 5,
        __ckServerCurrentRecordUtilisedQuantity: 5
      },
      outputRow: {
        id: 'row-1',
        values: {
          selected: true,
          quantity: '6'
        }
      } as any,
      parentRowId: 'parent-1',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 6, currentRowQuantity: 6 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 5, currentRowQuantity: 5 })
    });

    expect(values.freeQuantity).toBe(4);
    expect(values.maxQuantity).toBe(10);
  });
});
