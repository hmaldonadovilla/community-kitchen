import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm autoIncrement required checks', () => {
  it('does not require server-generated autoIncrement text fields before submit', () => {
    const definition: any = {
      title: 'Leftover Bank',
      destinationTab: 'Leftovers',
      languages: ['EN'],
      questions: [
        {
          id: 'LEFTOVER_ID',
          type: 'TEXT',
          required: true,
          readOnly: true,
          autoIncrement: {
            padLength: 0,
            prefixByValue: {
              fieldId: 'LEFTOVER_KIND',
              map: { 'Entire dish': 'LE-' },
              defaultPrefix: 'LX-'
            }
          }
        },
        {
          id: 'LEFTOVER_KIND',
          type: 'CHOICE',
          required: true,
          options: ['Entire dish']
        },
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              {
                id: 'ROW_ID',
                type: 'TEXT',
                required: true,
                readOnly: true,
                autoIncrement: { prefix: 'ROW-', padLength: 0 }
              },
              {
                id: 'NAME',
                type: 'TEXT',
                required: true
              }
            ]
          }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: { LEFTOVER_KIND: 'Entire dish' } as any,
      lineItems: {
        LINES: [{ id: 'row-1', values: { NAME: 'Carrot' } }]
      } as any
    });

    expect(errors.LEFTOVER_ID).toBeUndefined();
    expect(errors['LINES__ROW_ID__row-1']).toBeUndefined();
    expect(errors['LINES__NAME__row-1']).toBeUndefined();
  });
});
