import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { LineItemTableTotalsFooter } = require('../../../src/web/react/features/lineItems/components/LineItemTableTotalsFooter.tsx') as {
  LineItemTableTotalsFooter: typeof import('../../../src/web/react/features/lineItems/components/LineItemTableTotalsFooter').LineItemTableTotalsFooter;
};

describe('LineItemTableTotalsFooter', () => {
  it('renders totals in matching columns and places the total label in a non-total column', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        'table',
        null,
        React.createElement(
          'tbody',
          null,
          React.createElement(LineItemTableTotalsFooter, {
            language: 'EN',
            tableColumns: [{ id: 'category' }, { id: 'qty' }, { id: '__remove' }],
            totals: [{ key: 'qty', label: 'Qty', value: 10, decimalPlaces: 0 }]
          })
        )
      )
    );

    expect(html).toContain('ck-line-item-table__totals-row');
    expect(html).toContain('Total');
    expect(html).toContain('10');
  });

  it('renders no row when there are no totals', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        'table',
        null,
        React.createElement(
          'tbody',
          null,
          React.createElement(LineItemTableTotalsFooter, {
            language: 'EN',
            tableColumns: [{ id: 'qty' }],
            totals: []
          })
        )
      )
    );

    expect(html).toBe('<table><tbody></tbody></table>');
  });
});
