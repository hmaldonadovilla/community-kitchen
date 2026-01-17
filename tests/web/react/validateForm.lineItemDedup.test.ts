import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm (line item dedup rules)', () => {
  test('flags duplicate rows when dedup keys match', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'ING_GROUP',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Ingredients' },
          required: false,
          lineItemConfig: {
            dedupRules: [{ fields: ['ING', 'UNIT'], message: { en: 'Duplicate ingredient/unit.' } }],
            fields: [
              { id: 'ING', type: 'CHOICE', labelEn: 'Ingredient', options: [] },
              { id: 'UNIT', type: 'CHOICE', labelEn: 'Unit', options: [] },
              { id: 'QTY', type: 'NUMBER', labelEn: 'Qty' }
            ]
          }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN',
      values: {},
      lineItems: {
        ING_GROUP: [
          { id: 'r1', values: { ING: 'Salt', UNIT: 'g', QTY: 1 } },
          { id: 'r2', values: { ING: 'Salt', UNIT: 'g', QTY: 2 } }
        ]
      }
    });

    expect(errors['ING_GROUP__ING__r1']).toBe('Duplicate ingredient/unit.');
    expect(errors['ING_GROUP__ING__r2']).toBe('Duplicate ingredient/unit.');
  });

  test('does not flag when dedup fields are incomplete', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'ING_GROUP',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Ingredients' },
          required: false,
          lineItemConfig: {
            dedupRules: [{ fields: ['ING', 'UNIT'] }],
            fields: [
              { id: 'ING', type: 'CHOICE', labelEn: 'Ingredient', options: [] },
              { id: 'UNIT', type: 'CHOICE', labelEn: 'Unit', options: [] }
            ]
          }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN',
      values: {},
      lineItems: {
        ING_GROUP: [
          { id: 'r1', values: { ING: 'Salt' } },
          { id: 'r2', values: { ING: 'Salt' } }
        ]
      }
    });

    expect(errors['ING_GROUP__ING__r1']).toBeUndefined();
    expect(errors['ING_GROUP__ING__r2']).toBeUndefined();
  });
});
