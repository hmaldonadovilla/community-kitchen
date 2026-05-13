import { resolveLineItemDedupChange } from '../../../src/web/react/features/lineItems/domain/lineItemDedupChange';

describe('resolveLineItemDedupChange', () => {
  it('accepts the edited value while reporting a duplicate conflict', () => {
    const result = resolveLineItemDedupChange({
      rows: [
        { id: 'row-1', values: { ING: 'Tomato', UNIT: 'g', QTY: 2 } },
        { id: 'row-2', values: { ING: 'Tomato', QTY: 1 } }
      ],
      rowId: 'row-2',
      fieldId: 'UNIT',
      value: 'g',
      rules: [
        {
          fields: ['ING', 'UNIT'],
          message: { en: '{value} is already on the list. Update the existing quantity instead of adding a new line' }
        }
      ],
      language: 'EN'
    });

    expect(result.nextRows[1].values.UNIT).toBe('g');
    expect(result.conflict).toEqual({
      fieldId: 'ING',
      fields: ['ING', 'UNIT'],
      matchRowId: 'row-1',
      message: 'Tomato is already on the list. Update the existing quantity instead of adding a new line'
    });
  });

  it('returns no conflict when the edited value makes the row unique', () => {
    const result = resolveLineItemDedupChange({
      rows: [
        { id: 'row-1', values: { ING: 'Tomato', UNIT: 'g' } },
        { id: 'row-2', values: { ING: 'Tomato', UNIT: 'kg' } }
      ],
      rowId: 'row-2',
      fieldId: 'UNIT',
      value: 'kg',
      rules: [{ fields: ['ING', 'UNIT'] }],
      language: 'EN'
    });

    expect(result.nextRows[1].values.UNIT).toBe('kg');
    expect(result.conflict).toBeNull();
  });
});
