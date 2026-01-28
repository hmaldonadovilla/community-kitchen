import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm progressive rows with guidedCollapsedFieldsInHeader', () => {
  it('validates collapsed fields when guidedCollapsedFieldsInHeader is true', () => {
    const definition: any = {
      questions: [
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              guidedCollapsedFieldsInHeader: true,
              collapsedFields: [{ fieldId: 'QTY', showLabel: true }]
            },
            fields: [{ id: 'QTY', type: 'NUMBER', required: true }]
          }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: { G: [{ id: 'r1', values: { QTY: '' } }] } as any
    });

    expect(errors['G__QTY__r1']).toBeDefined();
  });

  it('skips collapsed rows when guidedCollapsedFieldsInHeader is false', () => {
    const definition: any = {
      questions: [
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              collapsedFields: [{ fieldId: 'QTY', showLabel: true }]
            },
            fields: [{ id: 'QTY', type: 'NUMBER', required: true }]
          }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: { G: [{ id: 'r1', values: { QTY: '' } }] } as any
    });

    expect(errors['G__QTY__r1']).toBeUndefined();
  });
});
