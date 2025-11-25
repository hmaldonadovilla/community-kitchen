import { computeTotals } from '../../src/web/lineItems';

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
