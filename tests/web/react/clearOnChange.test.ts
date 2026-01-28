import { applyClearOnChange } from '../../../src/web/react/app/clearOnChange';

describe('applyClearOnChange', () => {
  it('clears other fields and resets line items', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        { id: 'A', type: 'TEXT' },
        { id: 'B', type: 'TEXT' },
        {
          id: 'GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            minRows: 0,
            fields: [{ id: 'QTY', type: 'NUMBER' }]
          }
        }
      ]
    };

    const values: any = { A: 'old', B: 'keep' };
    const lineItems: any = {
      GROUP: [{ id: 'r1', values: { QTY: 3 } }]
    };

    const result = applyClearOnChange({
      definition,
      values,
      lineItems,
      fieldId: 'A',
      nextValue: 'new'
    });

    expect(result.values.A).toBe('new');
    expect(result.values.B).toBeUndefined();
    expect((result.lineItems.GROUP || []).length).toBe(0);
  });
});
