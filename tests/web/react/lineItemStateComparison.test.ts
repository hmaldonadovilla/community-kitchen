import {
  areFieldValueRecordsEqual,
  areLineItemStatesEqual
} from '../../../src/web/react/features/lineItems/domain/lineItemStateComparison';

describe('line item state comparison', () => {
  test('treats nested field values with equivalent content as equal', () => {
    expect(
      areFieldValueRecordsEqual(
        {
          id: 'row-1',
          nested: [{ b: 2, a: 1 }],
          missing: undefined as any
        },
        {
          missing: undefined as any,
          nested: [{ a: 1, b: 2 }],
          id: 'row-1'
        }
      )
    ).toBe(true);
  });

  test('detects line item row changes while preserving row order semantics', () => {
    const left: any = {
      meals: [
        { id: 'meal-1', values: { qty: 1 } },
        { id: 'meal-2', values: { qty: 2 } }
      ]
    };
    const same: any = {
      meals: [
        { values: { qty: 1 }, id: 'meal-1' },
        { values: { qty: 2 }, id: 'meal-2' }
      ]
    };
    const reordered: any = {
      meals: [
        { id: 'meal-2', values: { qty: 2 } },
        { id: 'meal-1', values: { qty: 1 } }
      ]
    };

    expect(areLineItemStatesEqual(left, same)).toBe(true);
    expect(areLineItemStatesEqual(left, reordered)).toBe(false);
  });
});
