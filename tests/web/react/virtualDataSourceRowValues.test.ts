import {
  buildVirtualDataSourceRowValuesAction,
  resolveServerCurrentRecordReservedQuantityFromRow
} from '../../../src/web/react/features/lineItems/domain/virtualDataSourceRowValues';

describe('virtual data source row value helpers', () => {
  const emptyReservationState = () => ({ totalReservedQuantity: 0, currentRowQuantity: 0 });

  test('resolves server current-record reserved quantity markers with fallback support', () => {
    expect(
      resolveServerCurrentRecordReservedQuantityFromRow(
        { __ckServerCurrentRecordReservedQuantity: '3', __ckCurrentRecordReservedQuantity: '8' },
        1
      )
    ).toBe(3);

    expect(
      resolveServerCurrentRecordReservedQuantityFromRow({ __ckCurrentRecordReservedQuantity: '2' }, 1)
    ).toBe(2);

    expect(resolveServerCurrentRecordReservedQuantityFromRow({ id: 'source-1' }, 4)).toBe(4);
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
      resolveCurrentReservationStateForSource: emptyReservationState,
      resolveCommittedReservationStateForSource: emptyReservationState
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
          sourceReservedQuantityFieldId: 'reserved',
          targetQuantityFieldId: 'freeQuantity',
          targetMaxQuantityFieldId: 'maxQuantity',
          targetFreeQuantityFieldId: 'displayFreeQuantity'
        }
      },
      sourceRow: {
        id: 'source-1',
        LEFTOVER_ID: 'leftover-1',
        remaining: 10,
        reserved: 4,
        __ckServerCurrentRecordReservedQuantity: 1
      },
      outputRow: {
        id: 'row-1',
        values: {
          quantity: '5'
        }
      } as any,
      parentRowId: 'parent-1',
      resolveCurrentReservationStateForSource: (_config, sourceKey, parentRowId) => {
        expect(sourceKey).toBe('leftover-1');
        expect(parentRowId).toBe('parent-1');
        return { totalReservedQuantity: 3, currentRowQuantity: 5 };
      },
      resolveCommittedReservationStateForSource: () => ({ totalReservedQuantity: 1, currentRowQuantity: 5 })
    });

    expect(values.freeQuantity).toBe(4);
    expect(values.displayFreeQuantity).toBe(4);
    expect(values.maxQuantity).toBe(9);
  });
});
