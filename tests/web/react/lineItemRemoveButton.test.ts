import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { LineItemRemoveButton } = require('../../../src/web/react/features/lineItems/components/LineItemRemoveButton.tsx') as {
  LineItemRemoveButton: typeof import('../../../src/web/react/features/lineItems/components/LineItemRemoveButton').LineItemRemoveButton;
};

describe('LineItemRemoveButton', () => {
  it('renders a neutral remove control with accessible text', () => {
    const html = renderToStaticMarkup(
      React.createElement(LineItemRemoveButton, {
        language: 'EN',
        onRemove: () => undefined
      })
    );

    expect(html).toContain('ck-line-item-table__remove-button');
    expect(html).toContain('aria-label="Remove"');
    expect(html).toContain('title="Remove"');
  });
});
