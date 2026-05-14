import {
  allowsVirtualIntegerOnlyAction,
  buildVirtualRowWhenContext,
  resolveVirtualMaxFieldIdAction,
  validateVirtualFieldRulesAction
} from '../../../src/web/react/features/lineItems/domain/virtualRowContext';

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

  test('resolves conditional max field ids for virtual numeric fields', () => {
    const field = {
      id: 'quantity',
      validationRules: [
        {
          when: { fieldId: 'mode', equals: 'reserve' },
          then: { fieldId: 'quantity', maxFieldId: 'availableQuantity' }
        },
        {
          when: { fieldId: 'mode', equals: 'ignore' },
          then: { fieldId: 'quantity', maxFieldId: 'ignoredMax' }
        }
      ]
    };

    expect(
      resolveVirtualMaxFieldIdAction({
        field,
        rowValues: { mode: 'reserve' },
        parentValues: {},
        lineItems: {},
        resolveTopValue: () => undefined
      })
    ).toBe('availableQuantity');
    expect(
      resolveVirtualMaxFieldIdAction({
        field,
        rowValues: { mode: 'other' },
        parentValues: {},
        lineItems: {},
        resolveTopValue: () => undefined
      })
    ).toBe('');
  });

  test('validates virtual numeric fields against the resolved max field', () => {
    const messages = validateVirtualFieldRulesAction({
      field: {
        id: 'quantity',
        validationRules: [
          {
            when: { fieldId: 'selected', equals: true },
            then: { fieldId: 'quantity', maxFieldId: 'availableQuantity' },
            message: { en: 'Enter no more than {MAX_AVAILABLE}.' }
          }
        ]
      },
      rowValues: { selected: true, quantity: '6', availableQuantity: 5 },
      parentValues: {},
      language: 'EN',
      lineItems: {},
      resolveTopValue: () => undefined
    });

    expect(messages).toEqual(['Enter no more than 5.']);
  });

  test('detects conditional integer-only virtual numeric fields', () => {
    const field = {
      id: 'quantity',
      validationRules: [
        {
          when: { fieldId: 'mode', equals: 'reserve' },
          then: { fieldId: 'quantity', integer: true }
        },
        {
          then: { fieldId: 'other', integer: true }
        }
      ]
    };

    expect(
      allowsVirtualIntegerOnlyAction({
        field,
        rowValues: { mode: 'reserve' },
        parentValues: {},
        lineItems: {},
        resolveTopValue: () => undefined
      })
    ).toBe(true);
    expect(
      allowsVirtualIntegerOnlyAction({
        field,
        rowValues: { mode: 'other' },
        parentValues: {},
        lineItems: {},
        resolveTopValue: () => undefined
      })
    ).toBe(false);
  });
});
