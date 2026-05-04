import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { LineItemOverlayResetButton } = require('../../../src/web/react/features/lineItems/components/LineItemOverlayResetButton.tsx') as {
  LineItemOverlayResetButton: typeof import('../../../src/web/react/features/lineItems/components/LineItemOverlayResetButton').LineItemOverlayResetButton;
};

describe('LineItemOverlayResetButton', () => {
  it('renders the compact remove companion control', () => {
    const html = renderToStaticMarkup(
      React.createElement(LineItemOverlayResetButton, {
        language: 'EN',
        onReset: () => undefined,
        baseStyle: { minHeight: 44 }
      })
    );

    expect(html).toContain('aria-label="Remove"');
    expect(html).toContain('min-width:44px');
  });
});
