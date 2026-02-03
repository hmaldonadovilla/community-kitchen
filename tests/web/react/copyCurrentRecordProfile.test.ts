import { applyCopyCurrentRecordProfile } from '../../../src/web/react/app/copyProfile';

describe('copyCurrentRecordProfile', () => {
  it('copies only whitelisted top values and whitelisted line item fields', () => {
    const definition: any = {
      questions: [
        { id: 'A', type: 'TEXT', required: false, label: { en: 'A' } },
        { id: 'B', type: 'TEXT', required: false, label: { en: 'B' } },
        { id: 'C', type: 'TEXT', required: false, label: { en: 'C' } },
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'MEAL_TYPE', type: 'CHOICE', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'ORD_QTY', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'MP_COOK_TEMP', type: 'CHECKBOX', required: false, options: [], optionsFr: [], optionsNl: [] }
            ]
          }
        }
      ],
      copyCurrentRecordProfile: {
        values: ['A', 'B'],
        lineItems: [{ groupId: 'G', fields: ['MEAL_TYPE', 'ORD_QTY'], includeWhen: { fieldId: 'ORD_QTY', greaterThan: 0 } }]
      }
    };

    const out = applyCopyCurrentRecordProfile({
      definition,
      values: { A: 'x', B: 'y', C: 'z' } as any,
      lineItems: {
        G: [
          { id: 'r1', values: { MEAL_TYPE: 'V', ORD_QTY: 0, MP_COOK_TEMP: true } },
          { id: 'r2', values: { MEAL_TYPE: 'V', ORD_QTY: 2, MP_COOK_TEMP: true } }
        ],
        'G::r2::SUB': [{ id: 'sr1', values: { X: 'x' } }]
      } as any
    });

    expect(out).toBeTruthy();
    expect(out?.values).toEqual({ A: 'x', B: 'y' });
    expect(out?.lineItems?.G?.map(r => ({ id: r.id, values: r.values }))).toEqual([
      { id: 'r2', values: { MEAL_TYPE: 'V', ORD_QTY: 2 } }
    ]);
    expect(Object.keys(out?.lineItems || {})).toEqual(['G']);
  });
});

