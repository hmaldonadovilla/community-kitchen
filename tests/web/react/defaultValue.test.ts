import { applyValueMapsToForm } from '../../../src/web/react/app/valueMaps';

describe('defaultValue', () => {
  it('applies defaultValue when the field is missing from the payload', () => {
    const definition: any = {
      questions: [{ id: 'YN', type: 'CHOICE', defaultValue: 'no' }]
    };

    const { values } = applyValueMapsToForm(definition, {} as any, {} as any, { mode: 'init' } as any);
    expect(values.YN).toBe('no');
  });

  it('does not override an existing field value (including empty string)', () => {
    const definition: any = {
      questions: [{ id: 'YN', type: 'CHOICE', defaultValue: 'no' }]
    };

    const a = applyValueMapsToForm(definition, { YN: 'yes' } as any, {} as any, { mode: 'init' } as any);
    expect(a.values.YN).toBe('yes');

    const b = applyValueMapsToForm(definition, { YN: '' } as any, {} as any, { mode: 'init' } as any);
    expect(b.values.YN).toBe('');
  });

  it('applies defaultValue for missing line-item fields in existing rows', () => {
    const definition: any = {
      questions: [
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              {
                id: 'MEAL_TYPE',
                type: 'CHOICE',
                defaultValue: 'no',
                required: false,
                options: [],
                optionsFr: [],
                optionsNl: []
              }
            ]
          }
        }
      ]
    };

    const { lineItems } = applyValueMapsToForm(
      definition,
      {} as any,
      { LINES: [{ id: 'r1', values: {} }] } as any,
      { mode: 'init' } as any
    );

    expect(lineItems.LINES[0].values.MEAL_TYPE).toBe('no');
  });
});


