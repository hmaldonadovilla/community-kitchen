import {
  resolveDataSourceOutputGroupAction,
  resolveStepDataSourceReservationStateForSourceAction
} from '../../../src/web/react/components/form/stepDataSourceRows';

describe('step data source rows domain', () => {
  test('resolves output subgroup metadata for a parent row', () => {
    const subConfig = { id: 'reservations', fields: [] };

    expect(
      resolveDataSourceOutputGroupAction({
        config: { outputGroupId: 'reservations' },
        groupId: 'meals',
        subGroups: [subConfig],
        parentRowId: 'parent1'
      })
    ).toEqual({
      key: 'meals::parent1::reservations',
      subConfig
    });

    expect(
      resolveDataSourceOutputGroupAction({
        config: {},
        groupId: 'meals',
        subGroups: [subConfig],
        parentRowId: 'parent1'
      })
    ).toBeNull();
  });

  test('resolves local and committed reservation state for a source row', () => {
    const config = {
      outputGroupId: 'reservations',
      outputKeyFieldId: 'sourceId',
      selectedFieldId: 'selected',
      quantityFieldId: 'quantity'
    };
    const parentRows: any[] = [{ id: 'parent1', values: {} }, { id: 'parent2', values: {} }];
    const outputFor = (parentRowId: string) => ({ key: `meals::${parentRowId}::reservations`, subConfig: null });
    const quantityFrom = (values: any, selectedFieldId: string, quantityFieldId: string): number =>
      values?.[selectedFieldId] ? Number(values?.[quantityFieldId] || 0) : 0;
    const commonArgs = {
      config,
      sourceKey: 'item1',
      currentParentRowId: 'parent2',
      parentRows,
      lineItems: {
        [outputFor('parent1').key]: [{ id: 'out1', values: { sourceId: 'item1', selected: true, quantity: 2 } }],
        [outputFor('parent2').key]: [{ id: 'out2', values: { sourceId: 'item1', selected: true, quantity: 3 } }]
      },
      stepDataSourceDrafts: {
        'parent2:item1': { selected: true, quantity: 4 }
      },
      reservationCommittedValues: {
        'parent2:item1': { selected: true, quantity: 1 }
      },
      buildStepDataSourceDraftKey: (_config: any, parentRowId: string, sourceKey: string) => `${parentRowId}:${sourceKey}`,
      resolveDataSourceOutputGroup: (_config: any, parentRowId: string) => outputFor(parentRowId),
      resolveLocalReservationQuantityForVisibility: (args: any) =>
        quantityFrom(args.draftValues || args.outputValues || args.committedValues, args.selectedFieldId, args.quantityFieldId),
      resolveReservationQuantityFromValues: quantityFrom
    };

    expect(resolveStepDataSourceReservationStateForSourceAction({ ...commonArgs, mode: 'local' })).toEqual({
      totalReservedQuantity: 6,
      currentRowQuantity: 4
    });
    expect(resolveStepDataSourceReservationStateForSourceAction({ ...commonArgs, mode: 'committed' })).toEqual({
      totalReservedQuantity: 3,
      currentRowQuantity: 1
    });
  });
});
