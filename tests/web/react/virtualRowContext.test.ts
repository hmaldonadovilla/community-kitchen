import {
  buildVirtualRowWhenContext,
  validateVirtualFieldRulesAction
} from '../../../src/web/react/components/form/virtualRowContext';

describe('virtual row context helpers', () => {
  test('resolves row values before parent and top-level values', () => {
    const ctx = buildVirtualRowWhenContext({
      rowValues: { customer: 'row customer', meal: 'Soup' },
      parentValues: { customer: 'parent customer' },
      lineItems: { meals: [{ id: 'row1', values: { meal: 'Soup' } }] } as any,
      resolveTopValue: fieldId => ({ customer: 'top customer', date: '2026-05-05' } as any)[fieldId]
    });

    expect(ctx.getValue('customer')).toBe('row customer');
    expect(ctx.getValue('date')).toBe('2026-05-05');
    expect(ctx.getLineItems?.('meals')).toEqual([{ id: 'row1', values: { meal: 'Soup' } }]);
    expect(ctx.getLineItemKeys?.()).toEqual(['meals']);
  });

  test('validates field-targeted rules against virtual row context', () => {
    const messages = validateVirtualFieldRulesAction({
      field: {
        id: 'quantity',
        validationRules: [
          {
            when: { fieldId: 'enabled', equals: true },
            then: { fieldId: 'quantity', required: true },
            message: { en: 'Quantity required' }
          },
          {
            when: { fieldId: 'enabled', equals: true },
            then: { fieldId: 'other', required: true },
            message: { en: 'Other required' }
          }
        ]
      },
      rowValues: { enabled: true, quantity: '' },
      parentValues: {},
      language: 'EN',
      lineItems: {},
      resolveTopValue: () => undefined
    });

    expect(messages).toEqual(['Quantity required']);
  });
});
