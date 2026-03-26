import { applyExclusiveLineSelection } from '../../../src/web/react/app/exclusiveLineSelection';

describe('applyExclusiveLineSelection', () => {
  it('clears matching selections across sibling subgroup rows', () => {
    const lineItems: any = {
      MP_MEALS_REQUEST: [
        { id: 'meal-a', values: { MEAL_TYPE: 'Diabetic' } },
        { id: 'meal-b', values: { MEAL_TYPE: 'Standard' } }
      ],
      'MP_MEALS_REQUEST::meal-a::MP_LEFTOVER_USAGE_LI': [
        {
          id: 'left-a',
          values: {
            LEFTOVER_ID: 'LE-1',
            LEFTOVER_SELECTED: true,
            LEFTOVER_USE_QTY: 4,
            LEFTOVER_USAGE_MODE: 'Reheated'
          }
        }
      ],
      'MP_MEALS_REQUEST::meal-b::MP_LEFTOVER_USAGE_LI': [
        {
          id: 'left-b',
          values: {
            LEFTOVER_ID: 'LE-1',
            LEFTOVER_SELECTED: true,
            LEFTOVER_USE_QTY: 2,
            LEFTOVER_USAGE_MODE: 'Combined'
          }
        }
      ],
      'MP_MEALS_REQUEST::meal-a::MP_LEFTOVER_USAGE_LI::left-a::MP_LEFTOVER_USAGE_INGREDIENTS_LI': [
        { id: 'ingredient-a', values: { ING: 'Salt', QTY: 10, UNIT: 'gr' } }
      ]
    };

    const next = applyExclusiveLineSelection({
      lineItems,
      groupKey: 'MP_MEALS_REQUEST::meal-b::MP_LEFTOVER_USAGE_LI',
      rowId: 'left-b',
      fieldId: 'LEFTOVER_SELECTED',
      value: true,
      rowValues: {
        LEFTOVER_ID: 'LE-1',
        LEFTOVER_SELECTED: true
      },
      config: {
        keyFieldId: 'LEFTOVER_ID',
        scope: 'sameSubgroupAcrossRoot',
        clearFieldIds: ['LEFTOVER_USE_QTY', 'LEFTOVER_USAGE_MODE'],
        clearSubGroupIds: ['MP_LEFTOVER_USAGE_INGREDIENTS_LI']
      }
    });

    const clearedRow = next['MP_MEALS_REQUEST::meal-a::MP_LEFTOVER_USAGE_LI'][0];
    const activeRow = next['MP_MEALS_REQUEST::meal-b::MP_LEFTOVER_USAGE_LI'][0];

    expect(clearedRow.values.LEFTOVER_SELECTED).toBe(false);
    expect(clearedRow.values.LEFTOVER_USE_QTY).toBeNull();
    expect(clearedRow.values.LEFTOVER_USAGE_MODE).toBeNull();
    expect(activeRow.values.LEFTOVER_SELECTED).toBe(true);
    expect(next['MP_MEALS_REQUEST::meal-a::MP_LEFTOVER_USAGE_LI::left-a::MP_LEFTOVER_USAGE_INGREDIENTS_LI']).toEqual([]);
  });

  it('does nothing when the selection is not active', () => {
    const lineItems: any = {
      GROUP: [{ id: 'row-1', values: { ITEM_ID: 'A', SELECTED: true } }]
    };

    const next = applyExclusiveLineSelection({
      lineItems,
      groupKey: 'GROUP',
      rowId: 'row-1',
      fieldId: 'SELECTED',
      value: false,
      rowValues: { ITEM_ID: 'A', SELECTED: false },
      config: { keyFieldId: 'ITEM_ID' }
    });

    expect(next).toBe(lineItems);
  });
});
