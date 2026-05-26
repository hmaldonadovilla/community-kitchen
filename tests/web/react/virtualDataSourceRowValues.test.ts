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

  test('keeps max at available stock for a new selected draft above availability', () => {
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
        remaining: 1,
        __ckServerCurrentRecordUtilisedQuantity: 0
      },
      draftValues: {
        selected: true,
        quantity: '20'
      },
      parentRowId: 'parent-1',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 20, currentRowQuantity: 20 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 0, currentRowQuantity: 0 })
    });

    expect(values.freeQuantity).toBe(0);
    expect(values.maxQuantity).toBe(1);
  });

  test('keeps authoritative max from server availability and current active utilisation, not draft text', () => {
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
        remaining: 0,
        __ckFreeQuantity: 0,
        __ckFreeQuantityAuthoritative: true,
        __ckCurrentUtilisationQuantity: 0,
        __ckServerCurrentRecordUtilisedQuantity: 0
      },
      draftValues: {
        selected: true,
        quantity: '20'
      },
      parentRowId: 'parent-1',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 20, currentRowQuantity: 20 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 0, currentRowQuantity: 0 })
    });

    expect(values.freeQuantity).toBe(0);
    expect(values.maxQuantity).toBe(0);
  });

  test('keeps an existing allocation valid when optimistic sibling utilisation briefly overcounts the source', () => {
    const values = buildVirtualDataSourceRowValuesAction({
      config: {
        rowKeyFieldId: 'LEFTOVER_ID',
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        availability: {
          sourcePortionsFieldId: 'remainingPortions',
          targetPortionsFieldId: 'freePortions',
          targetMaxPortionsFieldId: 'maxPortions'
        }
      },
      sourceRow: {
        LEFTOVER_ID: 'leftover-1',
        remainingPortions: 5,
        __ckServerCurrentRecordUtilisedQuantity: 15
      },
      outputRow: {
        id: 'row-standard',
        values: {
          selected: true,
          quantity: '15'
        }
      } as any,
      parentRowId: 'standard',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 25, currentRowQuantity: 15 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 15, currentRowQuantity: 15 })
    });

    expect(values.maxPortions).toBe(15);
  });

  test('keeps an existing allocation valid when authoritative availability reports a sibling row quantity', () => {
    const values = buildVirtualDataSourceRowValuesAction({
      config: {
        rowKeyFieldId: 'LEFTOVER_ID',
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        availability: {
          sourcePortionsFieldId: 'remainingPortions',
          targetPortionsFieldId: 'freePortions',
          targetMaxPortionsFieldId: 'maxPortions'
        }
      },
      sourceRow: {
        LEFTOVER_ID: 'MI-10',
        remainingPortions: 2,
        __ckFreeQuantity: 2,
        __ckFreeQuantityAuthoritative: true,
        __ckCurrentUtilisationQuantity: 8,
        __ckServerCurrentRecordUtilisedQuantity: 23
      },
      outputRow: {
        id: 'row-standard',
        values: {
          selected: true,
          quantity: '15'
        }
      } as any,
      parentRowId: 'standard',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 23, currentRowQuantity: 15 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 23, currentRowQuantity: 15 })
    });

    expect(values.freePortions).toBe(2);
    expect(values.maxPortions).toBe(17);
  });

  test('does not let a new sibling allocation inherit another row current utilisation quantity', () => {
    const values = buildVirtualDataSourceRowValuesAction({
      config: {
        rowKeyFieldId: 'LEFTOVER_ID',
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        availability: {
          sourcePortionsFieldId: 'remainingPortions',
          targetPortionsFieldId: 'freePortions',
          targetMaxPortionsFieldId: 'maxPortions'
        }
      },
      sourceRow: {
        LEFTOVER_ID: 'MI-10',
        remainingPortions: 2,
        __ckFreeQuantity: 2,
        __ckFreeQuantityAuthoritative: true,
        __ckCurrentUtilisationQuantity: 8,
        __ckServerCurrentRecordUtilisedQuantity: 23
      },
      draftValues: {
        selected: true,
        quantity: '8'
      },
      parentRowId: 'diabetic',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 31, currentRowQuantity: 8 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 23, currentRowQuantity: 0 })
    });

    expect(values.freePortions).toBe(2);
    expect(values.maxPortions).toBe(2);
  });

  test('uses authoritative conflict availability after a rejected row is deselected', () => {
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
        remaining: 0,
        __ckFreeQuantity: 4,
        __ckFreeQuantityAuthoritative: true,
        __ckServerCurrentRecordUtilisedQuantity: 10
      },
      draftValues: {
        selected: false,
        quantity: null
      },
      parentRowId: 'parent-1',
      resolveCurrentUtilisationStateForSource: () => ({ totalUtilisedQuantity: 0, currentRowQuantity: 0 }),
      resolveCommittedUtilisationStateForSource: () => ({ totalUtilisedQuantity: 10, currentRowQuantity: 10 })
    });

    expect(values.freeQuantity).toBe(4);
    expect(values.maxQuantity).toBe(4);
  });
});
