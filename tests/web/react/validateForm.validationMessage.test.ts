import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm validation messages', () => {
  it('interpolates maxFieldId values in custom messages', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'ROWS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Rows' },
          lineItemConfig: {
            fields: [
              { id: 'QTY', type: 'NUMBER', labelEn: 'Qty', validationRules: [
                {
                  when: { fieldId: 'SELECTED', equals: true },
                  then: { fieldId: 'QTY', maxFieldId: 'MAX_QTY' },
                  message: { en: 'Enter a value between 1 and {MAX_AVAILABLE}.' }
                }
              ] },
              { id: 'MAX_QTY', type: 'NUMBER', labelEn: 'Max' },
              { id: 'SELECTED', type: 'CHECKBOX', labelEn: 'Selected' }
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
        ROWS: [{ id: 'r1', values: { SELECTED: true, QTY: 11, MAX_QTY: 10 } }]
      }
    });

    expect(errors.ROWS__QTY__r1).toBe('Enter a value between 1 and 10.');
  });

  it('rejects whole-number text with leading zeros', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'ROWS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Rows' },
          lineItemConfig: {
            fields: [
              {
                id: 'QTY',
                type: 'NUMBER',
                labelEn: 'Qty',
                validationRules: [
                  {
                    when: { fieldId: 'QTY', notEmpty: true },
                    then: { fieldId: 'QTY', noLeadingZeros: true },
                    message: { en: 'Enter a valid whole number without leading zeros.' }
                  }
                ]
              }
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
        ROWS: [{ id: 'r1', values: { QTY: '003' } }]
      }
    });

    expect(errors.ROWS__QTY__r1).toBe('Enter a valid whole number without leading zeros.');
  });
});
