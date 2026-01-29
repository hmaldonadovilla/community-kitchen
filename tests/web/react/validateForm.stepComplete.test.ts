import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm requiredMode=stepComplete', () => {
  it('treats optional fields as required for step completion while allowing false booleans', () => {
    const definition: any = {
      questions: [
        { id: 'OPT_TEXT', type: 'TEXT', required: false, label: { en: 'Optional text' } },
        { id: 'OPT_CHECK', type: 'CHECKBOX', required: false, label: { en: 'Optional check' } },
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: { fields: [{ id: 'QTY', type: 'NUMBER', required: false }] }
        }
      ]
    };

    const values: any = { OPT_TEXT: '', OPT_CHECK: false };
    const lineItems: any = { LINES: [{ id: 'r1', values: { QTY: '' } }] };

    const configuredErrors = validateForm({
      definition,
      language: 'EN' as any,
      values,
      lineItems
    });
    expect(configuredErrors.OPT_TEXT).toBeUndefined();
    expect(configuredErrors.OPT_CHECK).toBeUndefined();
    expect(configuredErrors['LINES__QTY__r1']).toBeUndefined();

    const stepErrors = validateForm({
      definition,
      language: 'EN' as any,
      values,
      lineItems,
      requiredMode: 'stepComplete'
    });
    expect(stepErrors.OPT_TEXT).toBeDefined();
    expect(stepErrors.OPT_CHECK).toBeUndefined();
    expect(stepErrors['LINES__QTY__r1']).toBeDefined();
  });
});
