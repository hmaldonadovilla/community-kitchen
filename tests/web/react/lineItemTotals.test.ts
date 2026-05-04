import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { LineItemTotals } = require('../../../src/web/react/features/lineItems/components/LineItemTotals.tsx') as {
  LineItemTotals: typeof import('../../../src/web/react/features/lineItems/components/LineItemTotals').LineItemTotals;
};

describe('LineItemTotals', () => {
  it('renders computed total values', () => {
    const html = renderToStaticMarkup(
      React.createElement(LineItemTotals, {
        totals: [{ key: 'qty', label: 'Quantity', value: 12.5, decimalPlaces: 1 }]
      })
    );

    expect(html).toContain('line-item-totals');
    expect(html).toContain('Quantity: 12.5');
  });

  it('renders no markup when totals are empty', () => {
    const html = renderToStaticMarkup(React.createElement(LineItemTotals, { totals: [] }));

    expect(html).toBe('');
  });
});
