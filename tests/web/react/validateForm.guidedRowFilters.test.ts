import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm guided row filters', () => {
  const definition: any = {
    steps: {
      mode: 'guided',
      items: [
        {
          id: 'step1',
          include: [
            {
              kind: 'lineGroup',
              id: 'G',
              rows: { includeWhen: { fieldId: 'QTY', greaterThan: 0 } }
            }
          ]
        }
      ]
    },
    questions: [
      {
        id: 'G',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          fields: [
            { id: 'QTY', type: 'NUMBER' },
            { id: 'NOTE', type: 'TEXT', required: true }
          ]
        }
      }
    ]
  };

  it('skips rows excluded by step rows filter', () => {
    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: { G: [{ id: 'r1', values: { QTY: 0, NOTE: '' } }] } as any
    });

    expect(errors['G__NOTE__r1']).toBeUndefined();
  });

  it('validates rows included by step rows filter', () => {
    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: { G: [{ id: 'r1', values: { QTY: 1, NOTE: '' } }] } as any
    });

    expect(errors['G__NOTE__r1']).toBeDefined();
  });
});
