import { computeTotals } from '../../src/web/lineItems';
import { isLineItemMaxRowsReached, resolveLineItemRowLimits } from '../../src/web/react/app/lineItems';

describe('line item totals', () => {
  const config = {
    fields: [],
    totals: [
      { type: 'count', label: { en: 'Rows' } },
      { type: 'sum', fieldId: 'amount', decimalPlaces: 2 }
    ]
  };

  it('computes count and sum', () => {
    const totals = computeTotals(
      {
        config: config as any,
        rows: [
          { id: '1', values: { amount: '1.5' } },
          { id: '2', values: { amount: '2.5' } }
        ]
      },
      'EN'
    );
    expect(totals.find(t => t.key === 'count' || t.label === 'Rows')?.value).toBe(2);
    expect(totals.find(t => t.key === 'amount' || t.label === 'amount')?.value).toBe(4);
  });
});

describe('line item row limits', () => {
  it('normalizes min/max rows', () => {
    expect(resolveLineItemRowLimits({ minRows: '2.7', maxRows: '5' })).toEqual({ minRows: 2, maxRows: 5 });
    expect(resolveLineItemRowLimits({ minRows: 0, maxRows: -1 })).toEqual({ minRows: 0, maxRows: 0 });
    expect(resolveLineItemRowLimits({ minRows: 'bad', maxRows: null })).toEqual({ minRows: undefined, maxRows: undefined });
  });

  it('detects maxRows reached', () => {
    expect(isLineItemMaxRowsReached(2, 2)).toBe(true);
    expect(isLineItemMaxRowsReached(1, 2)).toBe(false);
    expect(isLineItemMaxRowsReached(0, undefined)).toBe(false);
  });
});
