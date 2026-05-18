import {
  ROW_NON_MATCH_OPTIONS_KEY,
  buildLineItemNonMatchOptionsSignature,
  recomputeLineItemNonMatchOptions
} from '../../../src/web/react/app/lineItems';

const definition = {
  questions: [
    { id: 'DISH_TYPE', type: 'CHOICE' },
    {
      id: 'INGREDIENTS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'ING',
            type: 'CHOICE',
            optionFilter: {
              dependsOn: 'DISH_TYPE',
              optionMap: {
                Vegan: ['Rice'],
                Vegetarian: ['Rice', 'Cheese']
              },
              matchMode: 'or'
            },
            validationRules: [
              {
                level: 'warning',
                when: { fieldId: ROW_NON_MATCH_OPTIONS_KEY, notEmpty: true },
                message: { en: 'This ingredient does not satisfy all dietary restrictions.' }
              }
            ]
          },
          { id: 'QTY', type: 'NUMBER' },
          { id: 'UNIT', type: 'CHOICE' }
        ]
      }
    }
  ]
} as any;

describe('line item non-match option metadata', () => {
  it('does not change the reconciliation signature for quantity edits or derived warning metadata', () => {
    const values = { DISH_TYPE: 'Vegan' } as any;
    const lineItems = {
      INGREDIENTS: [{ id: 'row-1', values: { ING: 'Cheese', QTY: 1, UNIT: 'kg' } }]
    } as any;

    const baseSignature = buildLineItemNonMatchOptionsSignature({ definition, values, lineItems });
    const quantityEditedSignature = buildLineItemNonMatchOptionsSignature({
      definition,
      values,
      lineItems: {
        INGREDIENTS: [{ id: 'row-1', values: { ING: 'Cheese', QTY: 2, UNIT: 'kg' } }]
      } as any
    });
    const metadataEditedSignature = buildLineItemNonMatchOptionsSignature({
      definition,
      values,
      lineItems: {
        INGREDIENTS: [
          {
            id: 'row-1',
            values: { ING: 'Cheese', QTY: 1, UNIT: 'kg', [ROW_NON_MATCH_OPTIONS_KEY]: ['Vegan'] }
          }
        ]
      } as any
    });
    const ingredientEditedSignature = buildLineItemNonMatchOptionsSignature({
      definition,
      values,
      lineItems: {
        INGREDIENTS: [{ id: 'row-1', values: { ING: 'Rice', QTY: 1, UNIT: 'kg' } }]
      } as any
    });

    expect(quantityEditedSignature).toBe(baseSignature);
    expect(metadataEditedSignature).toBe(baseSignature);
    expect(ingredientEditedSignature).not.toBe(baseSignature);
  });

  it('sets non-match metadata once and remains stable on the next reconciliation pass', () => {
    const values = { DISH_TYPE: 'Vegan' } as any;
    const lineItems = {
      INGREDIENTS: [{ id: 'row-1', values: { ING: 'Cheese', QTY: 1, UNIT: 'kg' } }]
    } as any;

    const first = recomputeLineItemNonMatchOptions({ definition, values, lineItems });
    const second = recomputeLineItemNonMatchOptions({ definition, values, lineItems: first.lineItems });

    expect(first.changed).toBe(true);
    expect(first.updatedRows).toBe(1);
    expect(first.lineItems.INGREDIENTS[0].values[ROW_NON_MATCH_OPTIONS_KEY]).toEqual(['Vegan']);
    expect(second.changed).toBe(false);
    expect(second.updatedRows).toBe(0);
  });
});
