import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm required checks (numeric zero)', () => {
  it('treats 0 as a valid value for required NUMBER fields (line items + subgroups)', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [{ id: 'QTY', type: 'NUMBER', required: true }],
            subGroups: [{ id: 'SUB', fields: [{ id: 'SUB_QTY', type: 'NUMBER', required: true }] }]
          }
        }
      ]
    };

    const lineItems: any = {
      LINES: [{ id: 'r1', values: { QTY: 0 } }],
      'LINES::r1::SUB': [{ id: 's1', values: { SUB_QTY: 0 } }]
    };

    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems
    });

    expect(errors['LINES__QTY__r1']).toBeUndefined();
    expect(errors['LINES::r1::SUB__SUB_QTY__s1']).toBeUndefined();
  });
});


