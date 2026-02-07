import { resolveLineItemTableReadOnlyDisplay } from '../../../src/web/react/components/form/utils';

describe('resolveLineItemTableReadOnlyDisplay', () => {
  it('appends sibling field value in parentheses for read-only table display', () => {
    const result = resolveLineItemTableReadOnlyDisplay({
      baseValue: 'Bulgur',
      field: { ui: { readOnlyAppendFieldId: 'ALLERGEN' } },
      rowValues: { ALLERGEN: 'Gluten' } as any,
      language: 'EN'
    });

    expect(result).toBe('Bulgur (Gluten)');
  });

  it('hides configured appendix values (case-insensitive)', () => {
    const result = resolveLineItemTableReadOnlyDisplay({
      baseValue: 'Onion',
      field: { ui: { readOnlyAppendFieldId: 'ALLERGEN', readOnlyAppendHideValues: ['none'] } },
      rowValues: { ALLERGEN: 'None' } as any,
      language: 'EN'
    });

    expect(result).toBe('Onion');
  });

  it('returns dash when base value is empty', () => {
    const result = resolveLineItemTableReadOnlyDisplay({
      baseValue: '',
      field: { ui: { readOnlyAppendFieldId: 'ALLERGEN' } },
      rowValues: { ALLERGEN: 'Gluten' } as any,
      language: 'EN'
    });

    expect(result).toBe('—');
  });

  it('formats boolean appendix values with localized yes/no', () => {
    const result = resolveLineItemTableReadOnlyDisplay({
      baseValue: 'Certified',
      field: { ui: { readOnlyAppendFieldId: 'IS_OK' } },
      rowValues: { IS_OK: true } as any,
      language: 'EN'
    });

    expect(result).toBe('Certified (Yes)');
  });
});
